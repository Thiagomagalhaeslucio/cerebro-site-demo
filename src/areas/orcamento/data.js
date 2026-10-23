'use strict';

// Orçamento: lê as tabelas "Parâmetros", "Tipos de trabalho" e "Complexidade" de
// 70-negocio/precificacao.md. Colunas pelo NOME; colunas, tabelas e seções
// extras são ignoradas. Valor "a definir", ausente ou não numérico vira null
// e um aviso: nunca um número chutado. Só leitura.

const fs = require('node:fs');
const path = require('node:path');
const { findSection, parseTables, parseNumber } = require('../../md');

const ARQUIVO = '70-negocio/precificacao.md';
const DIR_NEGOCIO = '70-negocio';

// Parâmetros que a calculadora e o resumo esperam encontrar.
const CHAVES = [
  'valor_hora', 'valor_hora_piso', 'margem_risco', 'adicional_urgencia', 'deslocamento_fixo', 'deslocamento_km',
  'tempo_viagem_fator', 'revisoes_incluidas', 'revisao_extra_horas', 'repasse_terceiros', 'imposto', 'entrada',
  'desconto_max', 'capacidade_horas_semana', 'garantia_dias', 'hora_avulsa',
];

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[_*\s]+/g, ' ').trim();
const limpo = (s) => String(s ?? '').replace(/[`*]/g, '').replace(/^_+|_+$/g, '').trim();
const ehADefinir = (s) => norm(s) === '' || norm(s) === 'a definir';

// Primeira tabela da seção que tem todas as colunas obrigatórias, pelo nome do
// cabeçalho: [{ coluna: célula }] com as obrigatórias e as opcionais que existirem.
function tabela(secao, obrigatorias, opcionais = []) {
  if (!secao) return null;
  for (const t of parseTables(secao.body)) {
    const cab = t.header.map(norm);
    if (obrigatorias.some((c) => !cab.includes(norm(c)))) continue;
    const colunas = [...obrigatorias, ...opcionais].map((c) => [c, cab.indexOf(norm(c))]).filter(([, i]) => i >= 0);
    return t.rows.map((r) => Object.fromEntries(colunas.map(([c, i]) => [c, r[i] ?? ''])));
  }
  return null;
}

function lerPrecificacao(vault) {
  const abs = path.join(vault, ARQUIVO);
  const vazio = { arquivo: ARQUIVO, existe: false, parametros: {}, tipos: [], complexidade: [], avisos: [] };
  if (!fs.existsSync(abs)) return { ...vazio, avisos: [`${ARQUIVO} não existe. Crie o arquivo com as tabelas "Parâmetros", "Tipos de trabalho" e "Complexidade".`] };
  const texto = fs.readFileSync(abs, 'utf8');
  const avisos = [];

  // Valor numérico de uma célula; null com aviso quando "a definir" ou ilegível.
  const numero = (celula, quem) => {
    if (ehADefinir(celula)) {
      avisos.push(`${quem} está a definir em ${ARQUIVO}.`);
      return null;
    }
    const n = parseNumber(limpo(celula));
    if (n == null) avisos.push(`${quem} não é um número em ${ARQUIVO} ("${limpo(celula)}").`);
    return n;
  };

  const parametros = {};
  const linhasP = tabela(findSection(texto, 'Parâmetros'), ['chave', 'valor'], ['unidade', 'descricao']);
  if (!linhasP) avisos.push(`Tabela "Parâmetros" (colunas chave e valor) não encontrada em ${ARQUIVO}; sem ela nada é calculado.`);
  for (const l of linhasP || []) {
    const chave = limpo(l.chave);
    if (!chave) continue;
    parametros[chave] = { valor: numero(l.valor, `Parâmetro ${chave}`), unidade: limpo(l.unidade), descricao: limpo(l.descricao) };
  }
  for (const k of CHAVES) {
    if (parametros[k]) continue;
    parametros[k] = { valor: null, unidade: '', descricao: '' };
    if (linhasP) avisos.push(`Parâmetro ${k} não está na tabela "Parâmetros" de ${ARQUIVO}.`);
  }

  const secT = findSection(texto, 'Tipos de trabalho');
  const linhasT = tabela(secT, ['tipo', 'horas_min', 'horas_max'], ['obs']);
  if (!linhasT) avisos.push(`Tabela "Tipos de trabalho" (colunas tipo, horas_min e horas_max) não encontrada em ${ARQUIVO}.`);
  const tipos = (linhasT || []).filter((l) => limpo(l.tipo)).map((l) => {
    const tipo = limpo(l.tipo);
    return {
      tipo,
      horas_min: numero(l.horas_min, `Horas mínimas de "${tipo}"`),
      horas_max: numero(l.horas_max, `Horas máximas de "${tipo}"`),
      obs: limpo(l.obs),
    };
  });

  const linhasC = tabela(findSection(texto, 'Complexidade'), ['nivel', 'multiplicador']);
  if (!linhasC) avisos.push(`Tabela "Complexidade" (colunas nivel e multiplicador) não encontrada em ${ARQUIVO}.`);
  const complexidade = (linhasC || []).filter((l) => limpo(l.nivel)).map((l) => ({
    nivel: limpo(l.nivel),
    multiplicador: numero(l.multiplicador, `Multiplicador de complexidade "${limpo(l.nivel)}"`),
  }));

  return { arquivo: ARQUIVO, existe: true, parametros, tipos, complexidade, avisos };
}

module.exports = { lerPrecificacao, ARQUIVO, DIR_NEGOCIO, CHAVES };
