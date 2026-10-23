'use strict';

const { DIR, readKanban, prazosAbertos } = require('./data');
const { addDays } = require('../../datas');

// Cartão da Home: feitos/total da semana e atrasados.
function resumo(vault, ctx) {
  const d = readKanban(vault, ctx.hoje);
  const s = d.semanas.find((x) => x.semana === d.escolhida);
  if (!s) return { titulo: 'Kanban semanal', itens: [{ rotulo: 'Semana', valor: 'nenhum arquivo kanban-AAAA-SS.md', tipo: 'texto' }], avisos: d.avisos };
  const rotulo = s.semana === d.semanaAtual ? `Semana ${s.semana}` : `Semana ${s.semana} (a atual ainda não tem arquivo)`;
  return {
    titulo: 'Kanban semanal',
    itens: [
      { rotulo, valor: `${s.feitos}/${s.total} feitos`, tipo: 'texto' },
      { rotulo: 'Atrasados', valor: s.atrasados, tipo: 'numero', status: s.atrasados ? 'vermelho' : 'verde' },
    ],
    avisos: d.avisos,
  };
}

// Prazos abertos até 14 dias à frente (os atrasados também entram).
function datas(vault, ctx) {
  const limite = addDays(ctx.hoje, 13);
  return prazosAbertos(readKanban(vault, ctx.hoje))
    .filter((c) => c.prazo <= limite)
    .map((c) => ({ data: c.prazo, rotulo: `Prazo: ${c.titulo}`, area: 'kanban' }));
}

module.exports = {
  id: 'kanban',
  titulo: 'Kanban semanal',
  watch: [DIR],
  api: { '': (vault, ctx) => readKanban(vault, ctx.hoje) },
  resumo,
  datas,
  // O arquivo da semana que a página abre.
  fontes: (vault, ctx) => {
    const { escolhida } = readKanban(vault, ctx.hoje);
    return escolhida ? [`${DIR}/kanban-${escolhida}.md`] : [DIR];
  },
};
