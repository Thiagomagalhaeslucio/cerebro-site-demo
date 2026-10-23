'use strict';

const { readDemandas, datasDemandas } = require('./data');

// Cartão da Home: o que está em aberto.
function resumo(vault, ctx) {
  const d = readDemandas(vault, ctx.hoje);
  const r = d.resumo;
  return {
    titulo: 'Demandas',
    itens: [
      { rotulo: 'Projetos', valor: r.projetos, tipo: 'numero' },
      { rotulo: 'Propostas em aberto', valor: r.propostasAbertas, tipo: 'numero' },
      { rotulo: 'Contratos', valor: r.contratos, tipo: 'numero' },
      { rotulo: 'Backlog em aberto', valor: r.backlogAberto, tipo: 'numero' },
    ],
    avisos: d.avisos,
  };
}

module.exports = {
  id: 'demandas',
  titulo: 'Demandas',
  watch: ['70-negocio', '30-projetos'],
  api: { '': (vault, ctx) => readDemandas(vault, ctx.hoje) },
  resumo,
  datas: (vault, ctx) => datasDemandas(vault, ctx.hoje),
  fontes: () => ['70-negocio/propostas', '70-negocio/contratos', '70-negocio/clientes', '30-projetos'],
};
