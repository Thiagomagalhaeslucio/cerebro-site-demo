'use strict';

// Relatórios: a semana (segunda a domingo) ou o mês, com o tempo por projeto, os gastos por categoria e o
// andamento das metas. Só junta o que as outras áreas já leem; nada é gravado. `hoje` e a consulta vêm de fora.

const { addDays, addMonths, isISODate, semanaISO, segundaDaSemana } = require('../../datas');
const { tempoDoPeriodo } = require('../tempo/data');
const { gastosDoPeriodo } = require('../financeiro/diagnostico');
const { readMetas } = require('../metas/data');
const { round2 } = require('../../md');

const TIPOS = ['semana', 'mes'];

// Período que contém `ref`, com os vizinhos. O seguinte só existe se já começou (não há relatório do futuro).
function periodo(tipo, ref, hoje) {
  let inicio;
  let fim;
  let anterior;
  let proximo;
  if (tipo === 'semana') {
    inicio = segundaDaSemana(semanaISO(ref));
    fim = addDays(inicio, 6);
    anterior = addDays(inicio, -7);
    proximo = addDays(inicio, 7);
  } else {
    inicio = `${ref.slice(0, 7)}-01`;
    fim = addDays(addMonths(inicio, 1), -1);
    anterior = addMonths(inicio, -1);
    proximo = addMonths(inicio, 1);
  }
  return { tipo, inicio, fim, emAndamento: fim >= hoje && inicio <= hoje, anterior, proximo: proximo <= hoje ? proximo : null };
}

const pct = (v, total) => (total ? round2((v / total) * 100) : 0);

function readRelatorio(vault, hoje, consulta = {}, { premissasDiagnostico, premissasMetas } = {}) {
  const avisos = [];
  const tipo = TIPOS.includes(consulta.tipo) ? consulta.tipo : 'semana';
  const ref = isISODate(consulta.ref) && consulta.ref <= hoje ? consulta.ref : hoje;
  const p = periodo(tipo, ref, hoje);
  // O período anterior tem a mesma duração: serve de comparação ("mais ou menos que antes").
  const ant = periodo(tipo, p.anterior, hoje);

  const tempoAtual = tempoDoPeriodo(vault, hoje, p.inicio, p.fim);
  const tempoAnt = tempoDoPeriodo(vault, hoje, ant.inicio, ant.fim);
  avisos.push(...tempoAtual.avisos);
  const tempo = tempoAtual.existe ? { minutos: tempoAtual.minutos, dias: tempoAtual.dias, projetos: tempoAtual.projetos, anteriorMinutos: tempoAnt.minutos } : null;

  let gastos = null;
  try {
    const a = gastosDoPeriodo(vault, premissasDiagnostico, p.inicio, p.fim);
    const b = gastosDoPeriodo(vault, premissasDiagnostico, ant.inicio, ant.fim);
    const total = round2(a.gastos.reduce((s, m) => s + m.valor, 0));
    const porCat = {};
    for (const m of a.gastos) porCat[m.categoria] = round2((porCat[m.categoria] || 0) + m.valor);
    gastos = {
      total,
      anteriorTotal: round2(b.gastos.reduce((s, m) => s + m.valor, 0)),
      quantidade: a.gastos.length,
      categorias: Object.entries(porCat).sort((x, y) => y[1] - x[1]).map(([nome, valor]) => ({ nome, valor, pct: pct(valor, total) })),
    };
  } catch (e) {
    avisos.push(`Gastos indisponíveis (${e.message}).`);
  }

  let metas = null;
  try {
    const m = readMetas(vault, hoje, premissasMetas);
    metas = {
      resumo: m.resumo,
      lista: m.areas.flatMap((a) => a.metas.map((x) => ({ nome: x.nome, area: a.nome, progresso: x.progresso, status: x.status, prazo: x.prazo, diasParaPrazo: x.diasParaPrazo }))),
    };
    avisos.push(...m.avisos);
  } catch (e) {
    avisos.push(`Metas indisponíveis (${e.message}).`);
  }

  return { hoje, ...p, rotuloSemana: tipo === 'semana' ? semanaISO(p.inicio) : null, tempo, gastos, metas, avisos: [...new Set(avisos)] };
}

module.exports = { readRelatorio, periodo, TIPOS };
