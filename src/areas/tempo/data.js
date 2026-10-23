'use strict';

// Tempo: lê as tabelas de 80-tempo/*.md (| data | projeto | início | fim | min | nota |) e soma
// minutos por projeto na semana (segunda a domingo) e no mês de `hoje`. Só leitura; `hoje` vem de fora.

const fs = require('node:fs');
const path = require('node:path');
const { parseTables } = require('../../md');
const { isISODate, semanaISO, segundaDaSemana, addDays } = require('../../datas');

const PASTA = '80-tempo';
const OBRIGATORIAS = ['data', 'projeto', 'min'];
const MAIORES = 5;
const RECENTES = 5;

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const hora = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
  return m && Number(m[1]) < 24 && Number(m[2]) < 60 ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// Minutos de uma linha: a coluna min; se vazia, fim - início (mesmo dia). null = linha inválida.
function minutosDaLinha(min, ini, fim) {
  const t = String(min ?? '').trim();
  if (/^\d+$/.test(t)) return Number(t);
  if (t) return null;
  const a = hora(ini);
  const b = hora(fim);
  return a != null && b != null && b >= a ? b - a : null;
}

function parseArquivo(texto, nome, avisos) {
  const tabela = parseTables(texto).find((t) => OBRIGATORIAS.every((c) => t.header.map(norm).includes(c)));
  if (!tabela) {
    avisos.push(`${PASTA}/${nome}: tabela | data | projeto | início | fim | min | nota | não encontrada.`);
    return [];
  }
  const col = (c) => tabela.header.map(norm).indexOf(c);
  const idx = { data: col('data'), projeto: col('projeto'), ini: col('inicio'), fim: col('fim'), min: col('min'), nota: col('nota') };
  const pega = (r, i) => (i >= 0 ? (r[i] ?? '').trim() : '');
  const out = [];
  tabela.rows.forEach((r, n) => {
    const onde = `${PASTA}/${nome}, linha ${n + 1} da tabela`;
    const data = pega(r, idx.data);
    const projeto = pega(r, idx.projeto);
    const minutos = minutosDaLinha(pega(r, idx.min), pega(r, idx.ini), pega(r, idx.fim));
    if (!isISODate(data)) return avisos.push(`${onde}: data "${data}" inválida; linha ignorada.`);
    if (!projeto) return avisos.push(`${onde}: sem projeto; linha ignorada.`);
    if (minutos == null) return avisos.push(`${onde}: minutos inválidos; linha ignorada.`);
    out.push({ data, projeto, inicio: pega(r, idx.ini), fim: pega(r, idx.fim), minutos, nota: pega(r, idx.nota) });
  });
  return out;
}

// Soma por projeto (sem diferenciar maiúsculas), do maior para o menor; empate pelo nome.
function porProjeto(linhas) {
  const mapa = new Map();
  for (const l of linhas) {
    const k = norm(l.projeto);
    const p = mapa.get(k) || { projeto: l.projeto, minutos: 0 };
    p.minutos += l.minutos;
    mapa.set(k, p);
  }
  return [...mapa.values()].sort((a, b) => b.minutos - a.minutos || a.projeto.localeCompare(b.projeto, 'pt-BR'));
}

const soma = (ls) => ls.reduce((a, l) => a + l.minutos, 0);
const dias = (ls) => new Set(ls.map((l) => l.data)).size;

// Tudo o que há registrado, sem filtro de data (datas depois de `hoje` já descartadas, com aviso).
function lerRegistros(vault, hoje, avisos) {
  const dir = path.join(vault, PASTA);
  if (!fs.existsSync(dir)) return null;
  let todas = [];
  for (const nome of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    try {
      todas = todas.concat(parseArquivo(fs.readFileSync(path.join(dir, nome), 'utf8'), nome, avisos));
    } catch (e) {
      avisos.push(`${PASTA}/${nome}: não consegui ler (${e.message}).`);
    }
  }
  const futuras = todas.filter((l) => l.data > hoje);
  if (futuras.length) avisos.push(`${PASTA}: ${futuras.length} ${futuras.length === 1 ? 'linha com data' : 'linhas com data'} depois de hoje (${hoje}); ${futuras.length === 1 ? 'ignorada' : 'ignoradas'}.`);
  return todas.filter((l) => l.data <= hoje);
}

// Horas por projeto entre duas datas (inclusive), para os relatórios.
function tempoDoPeriodo(vault, hoje, inicio, fim) {
  const avisos = [];
  const todas = lerRegistros(vault, hoje, avisos);
  const doPeriodo = (todas || []).filter((l) => l.data >= inicio && l.data <= fim);
  return { existe: todas !== null, minutos: soma(doPeriodo), dias: dias(doPeriodo), projetos: porProjeto(doPeriodo), avisos };
}

function readTempo(vault, hoje) {
  const avisos = [];
  const dir = path.join(vault, PASTA);
  const vazio = (existe) => ({
    existe, pasta: PASTA, hoje, avisos,
    semana: { inicio: null, fim: null, minutos: 0, dias: 0, projetos: [] },
    mes: { mes: hoje.slice(0, 7), minutos: 0, dias: 0, projetos: [], maiores: [] },
    recentes: [],
  });
  if (!fs.existsSync(dir)) return vazio(false);

  let todas = [];
  for (const nome of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    try {
      todas = todas.concat(parseArquivo(fs.readFileSync(path.join(dir, nome), 'utf8'), nome, avisos));
    } catch (e) {
      avisos.push(`${PASTA}/${nome}: não consegui ler (${e.message}).`);
    }
  }
  const futuras = todas.filter((l) => l.data > hoje);
  if (futuras.length) avisos.push(`${PASTA}: ${futuras.length} ${futuras.length === 1 ? 'linha com data' : 'linhas com data'} depois de hoje (${hoje}); ${futuras.length === 1 ? 'ignorada' : 'ignoradas'}.`);
  todas = todas.filter((l) => l.data <= hoje);

  const seg = segundaDaSemana(semanaISO(hoje));
  const dom = addDays(seg, 6);
  const daSemana = todas.filter((l) => l.data >= seg && l.data <= dom);
  const mes = hoje.slice(0, 7);
  const doMes = todas.filter((l) => l.data.startsWith(mes));
  const projMes = porProjeto(doMes);
  const totalMes = soma(doMes);

  const r = vazio(true);
  r.semana = { inicio: seg, fim: dom, minutos: soma(daSemana), dias: dias(daSemana), projetos: porProjeto(daSemana) };
  r.mes = {
    mes, minutos: totalMes, dias: dias(doMes), projetos: projMes,
    maiores: projMes.slice(0, MAIORES).map((p) => ({ ...p, pct: totalMes ? Math.round((p.minutos / totalMes) * 100) : 0 })),
  };
  r.recentes = [...todas].sort((a, b) => (b.data + b.inicio).localeCompare(a.data + a.inicio)).slice(0, RECENTES);
  return r;
}

// Premissas do pomodoro (config.json → tempo.pomodoro, em minutos). Valor ausente ou que não é inteiro
// positivo cai no padrão clássico, com aviso se veio errado.
const POMODORO_PADRAO = { foco: 25, pausaCurta: 5, pausaLonga: 15, focosAteLonga: 4 };
function pomodoroPremissas(cru, avisos = []) {
  const out = {};
  for (const [k, padrao] of Object.entries(POMODORO_PADRAO)) {
    const v = cru?.[k];
    if (v === undefined) out[k] = padrao;
    else if (Number.isInteger(v) && v > 0 && v <= 600) out[k] = v;
    else { out[k] = padrao; avisos.push(`config.json: tempo.pomodoro.${k} precisa ser um inteiro de 1 a 600; usei ${padrao}.`); }
  }
  return out;
}

module.exports = { PASTA, tempoDoPeriodo, pomodoroPremissas, POMODORO_PADRAO, readTempo, parseArquivo, minutosDaLinha, porProjeto };
