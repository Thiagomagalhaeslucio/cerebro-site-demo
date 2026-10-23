'use strict';

// Registrar tempo pelo site (substitui o `t add`/`t stop` do terminal): acrescenta uma linha na tabela de
// 80-tempo/AAAA-MM.md, criando o arquivo do mês se preciso. Só acrescenta; não edita nem apaga linhas.

const { PASTA, parseArquivo } = require('./data');
const { escrever, recusa, corpoComChaves, acrescentarLinhaNaTabela, celula } = require('../../escrita');
const { isISODate } = require('../../datas');

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const PROJETO = /^[\p{L}\p{N}][\p{L}\p{N}_/.-]{0,59}$/u;

const cabecalho = (mes) => `---\ntags: [tempo]\ndata: ${mes}-01\n---\n\n# Tempo ${mes}\n\n| data | projeto | início | fim | min | nota |\n| --- | --- | --- | --- | --- | --- |\n`;

// Projeto: minúsculas e espaços viram hífen, como no `t`.
const slug = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, '-');

function validar(corpo, hoje) {
  const c = corpoComChaves(corpo, ['projeto', 'data', 'inicio', 'fim', 'min', 'nota']);
  const projeto = slug(c.projeto);
  if (!PROJETO.test(projeto)) throw recusa(400, 'corpo', 'Projeto inválido (letras, números, hífen; até 60 caracteres).');
  if (!isISODate(c.data)) throw recusa(400, 'corpo', 'Data inválida (AAAA-MM-DD).');
  if (c.data > hoje) throw recusa(422, 'invalido', 'A data não pode ser depois de hoje.');
  const min = c.min;
  if (!Number.isInteger(min) || min < 1 || min > 1440) throw recusa(400, 'corpo', 'Minutos precisa ser um inteiro de 1 a 1440.');
  for (const k of ['inicio', 'fim']) if (c[k] !== undefined && c[k] !== '' && !HORA.test(c[k])) throw recusa(400, 'corpo', `${k === 'inicio' ? 'Início' : 'Fim'} precisa ser HH:MM.`);
  const nota = c.nota === undefined ? '' : c.nota;
  if (typeof nota !== 'string' || nota.length > 120) throw recusa(400, 'corpo', 'A nota é um texto de até 120 caracteres.');
  return { projeto, data: c.data, inicio: c.inicio || '', fim: c.fim || '', min, nota: celula(nota) };
}

function registrar(vault, ctx, corpo) {
  const o = validar(corpo, ctx.hoje);
  const mes = o.data.slice(0, 7);
  const rel = `${PASTA}/${mes}.md`;
  const linha = `| ${o.data} | ${o.projeto} | ${o.inicio} | ${o.fim} | ${o.min} | ${o.nota} |`;
  return escrever(vault, ctx, {
    rel,
    assinatura: linha,
    mensagem: `Tempo pelo site: ${o.projeto}, ${o.min} min`,
    transformar: (texto) => {
      const base = texto ?? cabecalho(mes);
      const novo = acrescentarLinhaNaTabela(base, ['data', 'projeto', 'min'], linha);
      if (novo === null) throw recusa(422, 'invalido', `${rel} não tem a tabela | data | projeto | início | fim | min | nota |.`);
      return novo;
    },
    // Uma linha a mais, nenhum aviso novo e a linha lida de volta é a que eu mandei.
    verificar: (novo, antes) => {
      const av = [];
      const depois = parseArquivo(novo, `${mes}.md`, av);
      const avAntes = [];
      const antesL = antes === null ? [] : parseArquivo(antes, `${mes}.md`, avAntes);
      if (av.length > avAntes.length) return 'a linha gerada produziria aviso no parser do Tempo.';
      if (depois.length !== antesL.length + 1) return 'o parser não leu exatamente uma linha a mais.';
      const l = depois[depois.length - 1];
      if (l.data !== o.data || l.projeto !== o.projeto || l.minutos !== o.min) return 'a linha lida de volta difere da enviada.';
      return null;
    },
  });
}

module.exports = { registrar, validar, slug };
