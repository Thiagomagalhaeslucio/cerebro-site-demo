'use strict';

// Propostas: lê o perfil (70-negocio/perfil.md), o modelo (70-negocio/modelos/proposta.md)
// e os parâmetros de precificacao.md. Valor "a definir" ou vazio no perfil vira
// campo vazio; o aviso "Perfil incompleto" vale só para os campos obrigatórios. Só leitura.

const { lerPerfil, lerModelo: lerModeloDe, limparModelo, lerTabelaChaveValor, ARQUIVO_PERFIL, CHAVES_PERFIL_OBRIGATORIAS } = require('../../documentos');
const { lerPrecificacao, ARQUIVO: ARQUIVO_PRECIFICACAO, DIR_NEGOCIO } = require('../orcamento/data');

const ARQUIVO_MODELO = '70-negocio/modelos/proposta.md';
// Parâmetros que só a proposta usa (os da calculadora vêm de lerPrecificacao).
const CHAVES_PROPOSTA = ['entrada', 'revisoes_incluidas', 'revisao_extra_horas', 'garantia_dias', 'validade_proposta_dias', 'prazo_resposta_cliente_dias'];

const lerModelo = (vault) => lerModeloDe(vault, ARQUIVO_MODELO, '{{cliente}}, {{projeto}}, {{valor_total}}');

function lerPropostas(vault) {
  const precificacao = lerPrecificacao(vault);
  const perfil = lerPerfil(vault);
  const modelo = lerModelo(vault);
  const avisos = [...perfil.avisos, ...modelo.avisos];
  if (precificacao.existe) {
    for (const k of CHAVES_PROPOSTA) {
      const p = precificacao.parametros[k];
      // "a definir" já tem aviso do leitor da precificação; aqui só o que nem consta na tabela.
      if (!p || (p.valor == null && !precificacao.avisos.some((a) => a.includes(`Parâmetro ${k} `)))) {
        avisos.push(`Parâmetro ${k} não está na tabela "Parâmetros" de ${ARQUIVO_PRECIFICACAO}.`);
        precificacao.parametros[k] = { valor: null, unidade: '', descricao: '' };
      }
    }
  }
  return { ...precificacao, perfil, modelo, avisos: [...avisos, ...precificacao.avisos] };
}

module.exports = { lerPropostas, lerPerfil, lerModelo, limparModelo, lerTabelaChaveValor, ARQUIVO_PERFIL, ARQUIVO_MODELO, ARQUIVO_PRECIFICACAO, DIR_NEGOCIO, CHAVES_PROPOSTA };
