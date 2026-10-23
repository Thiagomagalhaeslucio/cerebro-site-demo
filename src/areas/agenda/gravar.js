'use strict';

// Pôr um compromisso na agenda pelo site: acrescenta uma linha na tabela de 10-diario/agenda.md.
// Só acrescenta; editar ou apagar continua no Obsidian.

const { ARQUIVO, TIPOS, parseAgenda } = require('./data');
const { escrever, recusa, corpoComChaves, acrescentarLinhaNaTabela, celula } = require('../../escrita');
const { isISODate } = require('../../datas');

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function validar(corpo) {
  const c = corpoComChaves(corpo, ['data', 'inicio', 'fim', 'titulo', 'tipo', 'obs']);
  if (!isISODate(c.data)) throw recusa(400, 'corpo', 'Data inválida (AAAA-MM-DD).');
  const inicio = c.inicio || '';
  const fim = c.fim || '';
  if (inicio && !HORA.test(inicio)) throw recusa(400, 'corpo', 'Início precisa ser HH:MM.');
  if (fim && !HORA.test(fim)) throw recusa(400, 'corpo', 'Fim precisa ser HH:MM.');
  if (!inicio && fim) throw recusa(400, 'corpo', 'Fim sem início.');
  if (inicio && fim && fim < inicio) throw recusa(400, 'corpo', 'O fim é antes do início.');
  const titulo = celula(c.titulo);
  if (typeof c.titulo !== 'string' || !titulo || titulo.length > 120) throw recusa(400, 'corpo', 'O título é obrigatório (até 120 caracteres).');
  const tipo = c.tipo || '';
  if (tipo && !TIPOS.includes(tipo)) throw recusa(400, 'corpo', `Tipo fora da lista (${TIPOS.join(', ')}).`);
  const obs = c.obs === undefined ? '' : c.obs;
  if (typeof obs !== 'string' || obs.length > 200) throw recusa(400, 'corpo', 'A observação é um texto de até 200 caracteres.');
  return { data: c.data, inicio, fim, titulo, tipo, obs: celula(obs) };
}

function criar(vault, ctx, corpo) {
  const o = validar(corpo);
  const linha = `| ${o.data} | ${o.inicio} | ${o.fim} | ${o.titulo} | ${o.tipo} | ${o.obs} |`;
  return escrever(vault, ctx, {
    rel: ARQUIVO,
    assinatura: linha,
    mensagem: `Agenda pelo site: ${o.titulo.slice(0, 60)} (${o.data})`,
    transformar: (texto) => {
      if (texto === null) throw recusa(422, 'invalido', `${ARQUIVO} não existe; crie-o no Obsidian primeiro.`);
      const novo = acrescentarLinhaNaTabela(texto, ['data', 'título', 'tipo'], linha);
      if (novo === null) throw recusa(422, 'invalido', `${ARQUIVO} não tem a tabela | data | início | fim | título | tipo | obs |.`);
      return novo;
    },
    verificar: (novo, antes) => {
      const av = [];
      const avAntes = [];
      const depois = parseAgenda(novo, av);
      const antesL = parseAgenda(antes, avAntes);
      if (av.length > avAntes.length) return 'a linha gerada produziria aviso no parser da Agenda.';
      if (depois.length !== antesL.length + 1) return 'o parser não leu exatamente um compromisso a mais.';
      if (!depois.some((e) => e.data === o.data && e.titulo === o.titulo.replace(/\\\|/g, '|'))) return 'o compromisso lido de volta difere do enviado.';
      return null;
    },
  });
}

module.exports = { criar, validar };
