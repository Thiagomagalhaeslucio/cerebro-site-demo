'use strict';

// Kanban semanal: 10-diario/kanban-AAAA-SS.md (formato do plugin Kanban do Obsidian).
// Colunas = títulos ##; card = "- [ ] título @AAAA-MM-DD #projeto". Só leitura.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { stripFrontmatter, parseFrontmatter } = require('../../md');
const { semanaISO, segundaDaSemana, addDays, diffDays, isISODate } = require('../../datas');

const DIR = '10-diario';
const ARQUIVO = /^kanban-(\d{4}-\d{2})\.md$/;
const COLUNAS = ['A fazer', 'Fazendo', 'Bloqueado', 'Feito'];
const CARD = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/;
const PRAZO = /@\{?(\d{4}-\d{2}-\d{2})\}?/g; // @2026-03-10 ou @{2026-03-10} (plugin)
const TAG = /(^|\s)#([\p{L}\p{N}_/-]+)/gu;

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const ehFeito = (coluna) => norm(coluna) === 'feito';

function parseCard(texto) {
  const prazos = [...texto.matchAll(PRAZO)].map((m) => m[1]);
  const tags = [...texto.matchAll(TAG)].map((m) => m[2]);
  const titulo = texto.replace(PRAZO, '').replace(TAG, '$1').replace(/\s+/g, ' ').trim();
  return { titulo, prazo: prazos[0] ?? null, projeto: tags[0] ?? null, tags };
}

// Colunas e cards de um arquivo. Avisos vão para `avisos` com o nome do arquivo.
function parseKanban(texto, arquivo = 'kanban', avisos = []) {
  const colunas = [];
  let atual = null;
  let emCodigo = false;
  const linhas = stripFrontmatter(texto).split(/\r?\n/);
  for (const linha of linhas) {
    const t = linha.trim();
    if (t.startsWith('%% kanban:settings')) break; // bloco de configuração do plugin, sempre no fim
    if (/^(```|~~~)/.test(t)) {
      emCodigo = !emCodigo;
      continue;
    }
    if (emCodigo || t.startsWith('%%')) continue;

    const h = /^##\s+(.*)$/.exec(linha);
    if (h) {
      atual = { titulo: h[1].trim(), cards: [] };
      colunas.push(atual);
      continue;
    }
    const c = CARD.exec(linha);
    if (!c) continue;
    if (!atual) {
      avisos.push(`${arquivo}: card antes da primeira coluna ignorado: "${c[2].trim()}".`);
      continue;
    }
    const card = { ...parseCard(c[2]), marcado: c[1] !== ' ', coluna: atual.titulo };
    if (card.prazo && !isISODate(card.prazo)) {
      avisos.push(`${arquivo}: prazo inválido @${card.prazo} em "${card.titulo}".`);
      card.prazo = null;
    }
    card.concluido = ehFeito(atual.titulo) || card.marcado;
    atual.cards.push(card);
  }
  return colunas;
}

// "atrasado" se o prazo passou e o card não está concluído; "hoje"; "amanhã".
function etiquetaPrazo(prazo, hoje, concluido) {
  if (!prazo || concluido) return null;
  const d = diffDays(prazo, hoje);
  if (d < 0) return 'atrasado';
  if (d === 0) return 'hoje';
  if (d === 1) return 'amanhã';
  return null;
}

// Semana atual se tiver arquivo; senão a última anterior; senão a primeira.
function escolherSemana(semanas, atual) {
  if (semanas.includes(atual)) return atual;
  const anteriores = semanas.filter((s) => s < atual);
  return anteriores.length ? anteriores[anteriores.length - 1] : semanas[0] ?? null;
}

function lerSemanas(vault, hoje, avisos) {
  const dir = path.join(vault, DIR);
  if (!fs.existsSync(dir)) {
    avisos.push(`Pasta ${DIR}/ não encontrada.`);
    return [];
  }
  const semanas = [];
  for (const nome of fs.readdirSync(dir).sort()) {
    const m = ARQUIVO.exec(nome);
    if (!m) continue;
    const rel = `${DIR}/${nome}`;
    let segunda;
    try {
      segunda = segundaDaSemana(m[1]);
      if (semanaISO(segunda) !== m[1]) throw new Error('semana fora do ano');
    } catch {
      avisos.push(`${rel}: semana ${m[1]} não existe; arquivo ignorado.`);
      continue;
    }
    const texto = fs.readFileSync(path.join(dir, nome), 'utf8');
    const fm = parseFrontmatter(texto);
    if (fm.valido && fm.campos.data && fm.campos.data !== segunda)
      avisos.push(`${rel}: data ${fm.campos.data} no frontmatter, mas a segunda da semana ${m[1]} é ${segunda}.`);

    const lidas = parseKanban(texto, rel, avisos);
    const colunas = COLUNAS.map((titulo) => {
      const achada = lidas.find((c) => norm(c.titulo) === norm(titulo));
      if (!achada) avisos.push(`${rel}: coluna "${titulo}" não encontrada.`);
      return { titulo, cards: achada ? achada.cards : [] };
    });
    for (const extra of lidas.filter((c) => !COLUNAS.some((t) => norm(t) === norm(c.titulo)))) {
      avisos.push(`${rel}: coluna extra "${extra.titulo}" (as esperadas são ${COLUNAS.join(', ')}).`);
      colunas.push(extra);
    }

    const cards = colunas.flatMap((c) => c.cards);
    for (const c of cards) {
      c.etiqueta = etiquetaPrazo(c.prazo, hoje, c.concluido);
      c.atrasado = c.etiqueta === 'atrasado';
    }
    semanas.push({
      semana: m[1],
      segunda,
      domingo: addDays(segunda, 6),
      arquivo: rel,
      versao: crypto.createHash('sha256').update(texto).digest('hex'), // a escrita confere
      colunas,
      total: cards.length,
      feitos: cards.filter((c) => c.concluido).length,
      atrasados: cards.filter((c) => c.atrasado).length,
      projetos: [...new Set(cards.map((c) => c.projeto).filter(Boolean))].sort(),
    });
  }
  return semanas;
}

// Estado atual de cada card: um card levado para a semana seguinte aparece em
// dois arquivos; vale o da semana mais recente.
function cardsAtuais(semanas) {
  const porTitulo = new Map();
  for (const s of semanas) for (const c of s.colunas.flatMap((col) => col.cards)) porTitulo.set(norm(c.titulo), { ...c, semana: s.semana });
  return [...porTitulo.values()];
}

function readKanban(vault, hoje) {
  const avisos = [];
  const semanas = lerSemanas(vault, hoje, avisos);
  const atual = semanaISO(hoje);
  return {
    hoje,
    semanaAtual: atual,
    escolhida: escolherSemana(semanas.map((s) => s.semana), atual),
    semanas,
    projetos: [...new Set(semanas.flatMap((s) => s.projetos))].sort(),
    avisos,
  };
}

// Prazos dos cards não concluídos (estado mais recente de cada card).
function prazosAbertos(dados) {
  return cardsAtuais(dados.semanas).filter((c) => c.prazo && !c.concluido);
}

module.exports = { DIR, COLUNAS, parseCard, parseKanban, etiquetaPrazo, escolherSemana, readKanban, prazosAbertos };
