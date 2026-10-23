'use strict';

// Kanban pelo site: criar um card numa coluna e mover um card de coluna, no arquivo da semana
// (10-diario/kanban-AAAA-SS.md). Edição por linha: o resto do arquivo (frontmatter, bloco do plugin) não muda.
// Exige a versão do arquivo lida com a página; mudou, 409. Apagar e renomear continuam no Obsidian.

const { DIR, COLUNAS, parseCard, parseKanban } = require('./data');
const { escrever, recusa, corpoComChaves, ehVersao } = require('../../escrita');
const { isISODate } = require('../../datas');

const SEMANA = /^\d{4}-\d{2}$/;
const CARD = /^(\s*[-*]\s+)\[([ xX])\](\s+)(.*)$/;
const TAG_OK = /^[\p{L}\p{N}_/-]{1,40}$/u;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const colunaCanonica = (nome) => COLUNAS.find((c) => norm(c) === norm(nome));

// Onde ficam as colunas e os cards no texto (índices de linha), ignorando código e o bloco do plugin.
function mapa(linhas) {
  const colunas = [];
  let atual = null;
  let codigo = false;
  for (let i = 0; i < linhas.length; i++) {
    const t = linhas[i].trim();
    if (t.startsWith('%% kanban:settings')) break;
    if (/^(```|~~~)/.test(t)) { codigo = !codigo; continue; }
    if (codigo || t.startsWith('%%')) continue;
    const h = /^##\s+(.*)$/.exec(linhas[i]);
    if (h) { atual = { titulo: h[1].trim(), linha: i, cards: [] }; colunas.push(atual); continue; }
    if (atual && CARD.test(linhas[i])) atual.cards.push(i);
  }
  return colunas;
}

function validar(corpo) {
  const c = corpoComChaves(corpo, ['semana', 'versao', 'operacao']);
  if (typeof c.semana !== 'string' || !SEMANA.test(c.semana)) throw recusa(400, 'corpo', 'Semana inválida (AAAA-SS).');
  if (!ehVersao(c.versao)) throw recusa(400, 'corpo', 'Falta a "versao" (a que a página leu).');
  const op = corpoComChaves(c.operacao, ['tipo', 'coluna', 'titulo', 'prazo', 'projeto', 'de', 'indice', 'para']);
  if (op.tipo !== 'criar' && op.tipo !== 'mover') throw recusa(400, 'corpo', 'Operação precisa ser "criar" ou "mover".');
  return { semana: c.semana, versao: c.versao, op };
}

function textoDoCard(op) {
  const titulo = String(op.titulo ?? '').replace(/\s+/g, ' ').trim();
  if (!titulo || titulo.length > 160) throw recusa(400, 'corpo', 'O título do card é obrigatório (até 160 caracteres).');
  if (/[@#]/.test(titulo)) throw recusa(400, 'corpo', 'O título não pode ter @ nem # (use os campos de prazo e projeto).');
  const partes = [titulo];
  if (op.prazo) {
    if (!isISODate(op.prazo)) throw recusa(400, 'corpo', 'Prazo inválido (AAAA-MM-DD).');
    partes.push(`@${op.prazo}`);
  }
  if (op.projeto) {
    if (!TAG_OK.test(op.projeto)) throw recusa(400, 'corpo', 'Projeto inválido (letras, números, hífen).');
    partes.push(`#${op.projeto}`);
  }
  return partes.join(' ');
}

// Insere `linha` no fim dos cards da coluna (ou logo abaixo do título, se vazia), mantendo a linha em branco antes da próxima coluna.
function inserir(linhas, col, proxima, linha) {
  const ultimo = col.cards.length ? col.cards[col.cards.length - 1] : null;
  if (ultimo !== null) { linhas.splice(ultimo + 1, 0, linha); return; }
  const depois = linhas[col.linha + 1];
  if (depois !== undefined && depois.trim() === '') linhas.splice(col.linha + 2, 0, linha, ...(proxima && linhas[col.linha + 2]?.trim() !== '' ? [''] : []));
  else linhas.splice(col.linha + 1, 0, '', linha, '');
}

function aplicar(texto, semana, op) {
  const linhas = texto.split('\n');
  const cols = mapa(linhas);
  const achar = (nome) => {
    const canon = colunaCanonica(nome);
    if (!canon) throw recusa(400, 'corpo', `Coluna fora da lista (${COLUNAS.join(', ')}).`);
    const i = cols.findIndex((c) => norm(c.titulo) === norm(canon));
    if (i < 0) throw recusa(422, 'invalido', `O arquivo da semana ${semana} não tem a coluna "${canon}".`);
    return i;
  };
  if (op.tipo === 'criar') {
    const i = achar(op.coluna);
    const feito = norm(cols[i].titulo) === 'feito';
    inserir(linhas, cols[i], cols[i + 1], `- [${feito ? 'x' : ' '}] ${textoDoCard(op)}`);
    return linhas.join('\n');
  }
  // mover
  const de = achar(op.de);
  const para = achar(op.para);
  if (de === para) throw recusa(422, 'invalido', 'O card já está nessa coluna.');
  if (!Number.isInteger(op.indice) || op.indice < 0 || op.indice >= cols[de].cards.length) throw recusa(409, 'versao', 'O card não está mais lá. Recarregue.');
  const idx = cols[de].cards[op.indice];
  const m = CARD.exec(linhas[idx]);
  if (parseCard(m[4]).titulo !== String(op.titulo ?? '').trim()) throw recusa(409, 'versao', 'O card mudou de lugar. Recarregue.');
  const feito = norm(cols[para].titulo) === 'feito';
  const nova = `${m[1]}[${feito ? 'x' : ' '}]${m[3]}${m[4]}`;
  // Insere no destino considerando que a remoção desloca as linhas seguintes.
  linhas.splice(idx, 1);
  const deslocar = (n) => (n > idx ? n - 1 : n);
  const alvo = { linha: deslocar(cols[para].linha), cards: cols[para].cards.map(deslocar) };
  inserir(linhas, alvo, cols[para + 1], nova);
  return linhas.join('\n');
}

function operar(vault, ctx, corpo) {
  const { semana, versao, op } = validar(corpo);
  const rel = `${DIR}/kanban-${semana}.md`;
  return escrever(vault, ctx, {
    rel,
    versao,
    assinatura: JSON.stringify(op),
    mensagem: op.tipo === 'criar' ? `Kanban pelo site: novo card em ${op.coluna}` : `Kanban pelo site: card movido para ${op.para}`,
    transformar: (texto) => {
      if (texto === null) throw recusa(422, 'invalido', `${rel} não existe.`);
      return aplicar(texto, semana, op);
    },
    verificar: (novo, antes) => {
      const av = [];
      const avAntes = [];
      const d = parseKanban(novo, rel, av);
      const a = parseKanban(antes, rel, avAntes);
      if (av.length > avAntes.length) return 'o resultado produziria aviso no parser do Kanban.';
      const total = (cs) => cs.reduce((n, c) => n + c.cards.length, 0);
      if (total(d) !== total(a) + (op.tipo === 'criar' ? 1 : 0)) return 'a contagem de cards não bate com a operação.';
      if (d.length !== a.length) return 'o número de colunas mudou.';
      return null;
    },
  });
}

module.exports = { operar, aplicar, mapa };
