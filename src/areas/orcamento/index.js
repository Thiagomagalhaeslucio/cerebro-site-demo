'use strict';

const { lerPrecificacao, ARQUIVO, DIR_NEGOCIO } = require('./data');

module.exports = {
  id: 'orcamento',
  titulo: 'Orçamento',
  watch: [DIR_NEGOCIO],
  api: { '': (vault) => lerPrecificacao(vault) },
  fontes: () => [ARQUIVO],
};
