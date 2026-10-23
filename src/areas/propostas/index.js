'use strict';

const { lerPropostas, ARQUIVO_PERFIL, ARQUIVO_MODELO, ARQUIVO_PRECIFICACAO, DIR_NEGOCIO } = require('./data');

module.exports = {
  id: 'propostas',
  titulo: 'Propostas',
  watch: [DIR_NEGOCIO],
  // hoje: a data do contexto (fixa na demonstração), base do "Data" e da validade.
  api: { '': (vault, ctx) => ({ ...lerPropostas(vault), hoje: ctx.hoje }) },
  fontes: () => [ARQUIVO_MODELO, ARQUIVO_PERFIL, ARQUIVO_PRECIFICACAO],
};
