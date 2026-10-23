'use strict';

// Metas: as automáticas vêm dos leitores do financeiro e dos estudos (sem parser
// próprio); as manuais, de 10-diario/metas.md. Só leitura, regras determinísticas.

const fs = require('node:fs');
const path = require('node:path');
const { parseTables, parseNumber, round2 } = require('../../md');
const { diffDays, isISODate } = require('../../datas');
const { readFinanceiro } = require('../financeiro/data');
const { readDiagnostico } = require('../financeiro/diagnostico');
const { readEstudos } = require('../estudos/data');

const ARQUIVO = '10-diario/metas.md';
const AREAS = [
  { id: 'carreira', nome: 'Carreira' },
  { id: 'estudos', nome: 'Estudos' },
  { id: 'dinheiro', nome: 'Dinheiro' },
  { id: 'negocio', nome: 'Negócio' },
  { id: 'pessoal', nome: 'Pessoal' },
];
const COLUNAS = ['meta', 'area', 'alvo', 'atual', 'unidade', 'inicio', 'prazo', 'obs'];
const OBRIGATORIAS = ['meta', 'area', 'alvo', 'atual'];

// Limites do status, em pontos percentuais abaixo do tempo decorrido.
const NO_RITMO = 10;
const ATENCAO = 25;
const EPS = 1e-9;

const NO_RITMO_ID = 'no-ritmo';
const ATENCAO_ID = 'atencao';
const ATRASADA = 'atrasada';
const CONCLUIDA = 'concluida';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// Progresso, status e ritmo necessário de uma meta. `hoje` vem de fora: nada aqui lê o relógio.
function avaliar({ alvo, atual, inicio, prazo }, hoje) {
  const bruto = (atual / alvo) * 100;
  const out = { progresso: round2(Math.min(100, bruto)), tempo: null, status: null, ritmo: null, diasParaPrazo: null };
  if (!inicio || !prazo) return out; // sem datas: só a barra

  const concluida = atual >= alvo;
  const tempo = Math.min(100, Math.max(0, (diffDays(hoje, inicio) / diffDays(prazo, inicio)) * 100));
  out.tempo = round2(tempo);
  out.diasParaPrazo = diffDays(prazo, hoje);

  if (concluida) out.status = CONCLUIDA;
  else if (out.diasParaPrazo < 0) out.status = ATRASADA;
  else {
    const folga = bruto - tempo;
    out.status = folga >= -NO_RITMO - EPS ? NO_RITMO_ID : folga >= -ATENCAO - EPS ? ATENCAO_ID : ATRASADA;
  }

  if (!concluida) {
    const semanas = out.diasParaPrazo / 7;
    out.ritmo = { faltam: round2(alvo - atual), semanas: round2(semanas), porSemana: semanas > 0 ? round2((alvo - atual) / semanas) : null };
  }
  return out;
}

// ---------- metas.md ----------

function lerManuais(vault, avisos) {
  const abs = path.join(vault, ARQUIVO);
  if (!fs.existsSync(abs)) return { existe: false, metas: [] };
  return { existe: true, metas: parseManuais(fs.readFileSync(abs, 'utf8'), avisos) };
}

// Linha inválida vira aviso e fica de fora; nada é completado por palpite.
function parseManuais(texto, avisos) {
  const tabela = parseTables(texto).find((t) => OBRIGATORIAS.every((c) => t.header.map(norm).includes(c)));
  if (!tabela) {
    avisos.push(`${ARQUIVO}: tabela | meta | area | alvo | atual | unidade | inicio | prazo | obs | não encontrada.`);
    return [];
  }
  const header = tabela.header.map(norm);
  const idx = Object.fromEntries(COLUNAS.map((c) => [c, header.indexOf(c)]));
  const campo = (r, c) => (idx[c] >= 0 ? r[idx[c]] ?? '' : '');

  const metas = [];
  tabela.rows.forEach((r, i) => {
    if (r.every((c) => c === '')) return;
    const onde = `${ARQUIVO}, linha ${i + 1}${campo(r, 'meta') ? ` ("${campo(r, 'meta')}")` : ''}`;
    const invalida = (motivo) => avisos.push(`${onde}: ${motivo}; meta ignorada.`);

    const nome = campo(r, 'meta');
    if (!nome) return invalida('sem nome');
    const area = AREAS.find((a) => a.id === norm(campo(r, 'area')));
    if (!area) return invalida(`área "${campo(r, 'area')}" desconhecida (use ${AREAS.map((a) => a.id).join(', ')})`);
    const alvo = parseNumber(campo(r, 'alvo'));
    if (alvo == null || alvo <= 0) return invalida(`alvo "${campo(r, 'alvo')}" não é um número maior que zero`);
    const atual = parseNumber(campo(r, 'atual'));
    if (atual == null || atual < 0) return invalida(`atual "${campo(r, 'atual')}" não é um número válido`);

    const inicio = campo(r, 'inicio');
    const prazo = campo(r, 'prazo');
    if (!!inicio !== !!prazo) return invalida('informe inicio e prazo juntos, ou nenhum dos dois');
    if (inicio) {
      if (!isISODate(inicio)) return invalida(`inicio "${inicio}" fora do formato AAAA-MM-DD`);
      if (!isISODate(prazo)) return invalida(`prazo "${prazo}" fora do formato AAAA-MM-DD`);
      if (diffDays(prazo, inicio) <= 0) return invalida('o prazo precisa ser depois do início');
    }

    metas.push({
      nome, area: area.id, origem: 'manual', rota: null, alvo, atual,
      unidade: campo(r, 'unidade'), inicio: inicio || null, prazo: prazo || null, obs: campo(r, 'obs'), projecao: null,
    });
  });
  return metas;
}

// ---------- automáticas ----------

// Financeiro: a panela das metas contra o marco, a reserva e a meta final, com a projeção do diagnóstico.
// Os nomes mostrados vêm de config → financeiro.formato.
function metasFinanceiro(vault, hoje, cfgDiagnostico, avisos) {
  let f;
  try {
    f = readFinanceiro(vault, hoje);
  } catch (err) {
    avisos.push(`Metas do financeiro indisponíveis (${err.message}).`);
    return [];
  }
  // Meta que o panelas.md não traz vem com valor padrão no leitor; aqui ela sai, em vez de ser chutada.
  const faltando = new Set(f.avisos.map((a) => /^Meta "(\w+)" não encontrada/.exec(a)?.[1]).filter(Boolean));

  let indicador = null;
  let proximoSalario = null;
  try {
    const d = readDiagnostico(vault, cfgDiagnostico, hoje);
    indicador = d.indicadores.find((i) => i.id === 'metas');
    proximoSalario = d.referencias.salario?.proximo ?? null;
  } catch (err) {
    avisos.push(`Projeção do financeiro indisponível (${err.message}).`);
  }

  const projecaoMarco = indicador?.projecaoMarco != null && f.progresso.marco.atual < f.metas.marco
    ? { tipo: 'valor', valor: indicador.projecaoMarco, data: proximoSalario } : null;
  const salarios = indicador?.reserva?.salarios;
  const projecaoReserva = salarios > 0 ? { tipo: 'salarios', salarios } : null;

  const metas = [
    { chave: 'marco', nome: f.formato.rotulos.painelAteMarco, atual: f.progresso.marco.atual, alvo: f.metas.marco, projecao: projecaoMarco },
    { chave: 'reserva', nome: 'Reserva', atual: f.progresso.reserva.atual, alvo: f.metas.reserva, projecao: projecaoReserva },
    { chave: 'metaFinal', nome: f.formato.rotulos.metaFinalPainel, atual: f.progresso.metaFinal.atual, alvo: f.metas.metaFinal, projecao: null },
  ];
  return metas.filter((m) => !faltando.has(m.chave)).map(({ chave, ...m }) => ({
    ...m, area: 'dinheiro', origem: 'financeiro', rota: '/financeiro', unidade: 'R$', inicio: null, prazo: null, obs: '',
  }));
}

// Estudos: o progresso de cada roadmap, como o leitor de estudos já calcula.
function metasEstudos(vault, avisos) {
  try {
    return readEstudos(vault).roadmaps.filter((r) => r.total > 0).map((r) => ({
      nome: r.titulo, area: 'estudos', origem: 'estudos', rota: '/estudos', alvo: r.total, atual: r.feitos,
      unidade: 'passos', inicio: null, prazo: null, obs: r.proximos[0] ? `Próximo: ${r.proximos[0].texto}` : '', projecao: null,
    }));
  } catch (err) {
    avisos.push(`Metas de estudos indisponíveis (${err.message}).`);
    return [];
  }
}

// ---------- montagem ----------

function contar(metas) {
  const n = (s) => metas.filter((m) => m.status === s).length;
  return { total: metas.length, noRitmo: n(NO_RITMO_ID), atencao: n(ATENCAO_ID), atrasadas: n(ATRASADA), concluidas: n(CONCLUIDA), semStatus: metas.filter((m) => !m.status).length };
}

function readMetas(vault, hoje, cfgDiagnostico = {}) {
  const avisos = [];
  const manuais = lerManuais(vault, avisos);
  const todas = [...metasFinanceiro(vault, hoje, cfgDiagnostico, avisos), ...metasEstudos(vault, avisos), ...manuais.metas]
    .map((m, i) => ({ id: `${m.origem}-${i}`, ...m, ...avaliar(m, hoje) }));

  return {
    hoje,
    vault: path.basename(vault),
    manual: { arquivo: ARQUIVO, existe: manuais.existe },
    resumo: contar(todas),
    areas: AREAS.map((a) => ({ id: a.id, nome: a.nome, metas: todas.filter((m) => m.area === a.id) })),
    avisos,
  };
}

module.exports = { ARQUIVO, AREAS, avaliar, parseManuais, readMetas };
