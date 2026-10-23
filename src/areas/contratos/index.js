'use strict';

const { lerContratos, ARQUIVO_MODELO, DIR_PROPOSTAS, DIR_NEGOCIO } = require('./data');
const { ARQUIVO_PERFIL } = require('../../documentos');
const { ARQUIVO: ARQUIVO_PRECIFICACAO } = require('../orcamento/data');

module.exports = {
  id: 'contratos',
  titulo: 'Contratos',
  watch: [DIR_NEGOCIO],
  // hoje: a data do contexto (fixa na demonstração). O foro padrão é a cidade_uf do perfil.
  api: { '': (vault, ctx) => ({ ...lerContratos(vault), hoje: ctx.hoje }) },
  fontes: () => [ARQUIVO_MODELO, ARQUIVO_PERFIL, ARQUIVO_PRECIFICACAO, DIR_PROPOSTAS],
};
