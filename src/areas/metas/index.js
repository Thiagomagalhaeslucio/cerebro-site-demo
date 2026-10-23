'use strict';

const { ARQUIVO, readMetas } = require('./data');
const { loadSiteConfig } = require('../../config');

const premissas = () => loadSiteConfig().financeiro?.diagnostico ?? {};
const ler = (vault, ctx) => readMetas(vault, ctx.hoje, premissas());

// Cartão da Home: a contagem e uma entrada por meta atrasada (vão para "Pede atenção").
function resumo(vault, ctx) {
  const d = ler(vault, ctx);
  const atrasadas = d.areas.flatMap((a) => a.metas).filter((m) => m.status === 'atrasada');
  return {
    titulo: 'Metas',
    itens: [
      { rotulo: 'Metas', valor: d.resumo.total, tipo: 'numero', contagem: d.resumo },
      ...atrasadas.map((m) => ({
        rotulo: m.nome, valor: 'atrasada', tipo: 'texto', status: 'vermelho', atrasada: true, prazo: m.prazo, rota: '/metas',
      })),
    ],
    avisos: d.avisos,
  };
}

module.exports = {
  id: 'metas',
  titulo: 'Metas',
  watch: ['10-diario', '40-financeiro', '60-estudos'],
  api: { '': ler },
  resumo,
  fontes: () => [ARQUIVO, '40-financeiro/panelas.md', '60-estudos'],
};
