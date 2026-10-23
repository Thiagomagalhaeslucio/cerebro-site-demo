'use strict';

const { DIR_ESTUDOS, DIR_BIBLIOTECA, readEstudos } = require('./data');

// Cartão da Home: próximo passo de cada roadmap e revisões pendentes.
function resumo(vault) {
  const d = readEstudos(vault);
  return {
    titulo: 'Estudos',
    itens: [
      ...d.roadmaps.map((r) => ({
        rotulo: r.titulo,
        valor: r.proximos[0]?.texto ?? 'tudo marcado',
        tipo: 'texto',
        detalhe: `${r.feitos}/${r.total}`,
        foco: r.foco,
      })),
      { rotulo: 'Revisões pendentes', valor: d.revisoes.length, tipo: 'numero' },
    ],
    avisos: d.avisos,
  };
}

module.exports = {
  id: 'estudos',
  titulo: 'Estudos',
  watch: [DIR_ESTUDOS, DIR_BIBLIOTECA],
  api: { '': (vault) => readEstudos(vault) },
  resumo,
  fontes: () => [DIR_ESTUDOS, DIR_BIBLIOTECA],
};
