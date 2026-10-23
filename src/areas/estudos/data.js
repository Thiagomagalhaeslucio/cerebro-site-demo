'use strict';

// Estudos: roadmaps (60-estudos/*.md com tag "roadmap") e revisões pendentes
// (20-biblioteca/** com status "revisão-pendente"). Só leitura.

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, stripFrontmatter, round2 } = require('../../md');

const DIR_ESTUDOS = '60-estudos';
const DIR_BIBLIOTECA = '20-biblioteca';
const IGNORAR = new Set(['99-arquivo']);
const STATUS_REVISAO = 'revisão-pendente';
const PROXIMOS_POR_ROADMAP = 3;

const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/;
const ID = /#[A-Za-z]+\d+\b/g; // #Block009, #F017
const RANGE_IDS = /(#[A-Za-z]+\d+)[`*\s]*(?:ao|a|até)[`*\s]*#[A-Za-z]+\d+/gi; // `#F001` ao `#F010`
const FENCE = /^\s*(```|~~~)/;

const pctDe = (feitos, total) => (total ? round2((feitos / total) * 100) : 0);
const nfc = (s) => String(s ?? '').normalize('NFC');

// Título de cabeçalho sem emoji/símbolo no começo e sem marcação.
function limparTitulo(s) {
  return s.replace(/[`*]/g, '').replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, ' ').trim();
}

// Texto de um checkbox sem crases, negrito, ids (#F010) e links; os ids vão à parte.
function limparItem(s) {
  const ids = (s.match(ID) || []).map((x) => x.slice(1));
  const texto = s
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(RANGE_IDS, '') // "#F001 ao #F010": o intervalo todo sai do texto (os dois ids vão à parte)
    .replace(ID, '')
    .replace(/[`*]|~~/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[^\p{L}\p{N}"'(\[]+/u, '')
    .trim();
  return { texto, ids };
}

function analisarRoadmap(texto) {
  let titulo = null;
  let emCodigo = false;
  let secao = { titulo: '(antes da primeira seção)', feitos: 0, total: 0 };
  let subsecao = null;
  const secoes = [secao];
  const proximos = [];
  let feitos = 0;
  let total = 0;

  const linhas = stripFrontmatter(texto).split(/\r?\n/);
  for (const linha of linhas) {
    if (FENCE.test(linha)) {
      emCodigo = !emCodigo;
      continue;
    }
    if (emCodigo) continue;

    const h = /^(#{1,6})\s+(.*)$/.exec(linha);
    if (h) {
      const nivel = h[1].length;
      if (nivel === 1 && titulo == null) titulo = limparTitulo(h[2]);
      else if (nivel === 2) {
        secao = { titulo: limparTitulo(h[2]), feitos: 0, total: 0 };
        secoes.push(secao);
        subsecao = null;
      } else if (nivel === 3) subsecao = limparTitulo(h[2]);
      continue;
    }

    const c = CHECKBOX.exec(linha);
    if (!c) continue;
    total++;
    secao.total++;
    if (c[1] !== ' ') {
      feitos++;
      secao.feitos++;
    } else if (proximos.length < PROXIMOS_POR_ROADMAP) {
      proximos.push({ ...limparItem(c[2]), secao: secao.titulo, subsecao });
    }
  }

  return {
    titulo,
    feitos,
    total,
    pct: pctDe(feitos, total),
    secoes: secoes.filter((s) => s.total > 0).map((s) => ({ ...s, pct: pctDe(s.feitos, s.total) })),
    proximos,
  };
}

function lerRoadmaps(vault, avisos) {
  const dir = path.join(vault, DIR_ESTUDOS);
  if (!fs.existsSync(dir)) {
    avisos.push(`Pasta ${DIR_ESTUDOS}/ não encontrada.`);
    return [];
  }
  const roadmaps = [];
  // Só a raiz de 60-estudos/ (templates/ e anexos/ ficam de fora).
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
    const rel = `${DIR_ESTUDOS}/${ent.name}`;
    const texto = fs.readFileSync(path.join(dir, ent.name), 'utf8');
    const fm = parseFrontmatter(texto);
    if (!fm.tem) {
      avisos.push(`${rel}: sem frontmatter, não dá para saber se é roadmap.`);
      continue;
    }
    if (!fm.valido) {
      avisos.push(`${rel}: frontmatter sem o "---" de fechamento.`);
      continue;
    }
    const tags = Array.isArray(fm.campos.tags) ? fm.campos.tags : [fm.campos.tags].filter(Boolean);
    if (!tags.includes('roadmap')) continue;

    const r = analisarRoadmap(texto);
    if (!r.titulo) avisos.push(`${rel}: sem título "# ..."; usando o nome do arquivo.`);
    if (r.total === 0) avisos.push(`${rel}: roadmap sem nenhum checkbox.`);
    roadmaps.push({ arquivo: rel, nome: ent.name.replace(/\.md$/, ''), foco: tags.includes('foco'), ...r, titulo: r.titulo || ent.name.replace(/\.md$/, '') });
  }
  // Tag "foco": o roadmap que está valendo agora vai primeiro (em Estudos, na Home e nas Metas).
  return roadmaps.sort((a, b) => Number(b.foco) - Number(a.foco) || a.nome.localeCompare(b.nome));
}

function listarMd(dirAbs, relBase) {
  const out = [];
  for (const ent of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (ent.name.startsWith('.') || IGNORAR.has(ent.name)) continue;
    const abs = path.join(dirAbs, ent.name);
    const rel = `${relBase}/${ent.name}`;
    if (ent.isDirectory()) out.push(...listarMd(abs, rel));
    else if (ent.isFile() && ent.name.endsWith('.md')) out.push({ abs, rel });
  }
  return out;
}

function linkObsidian(vault, rel) {
  const nomeVault = path.basename(vault);
  return `obsidian://open?vault=${encodeURIComponent(nomeVault)}&file=${encodeURIComponent(rel.replace(/\.md$/, ''))}`;
}

function lerRevisoes(vault, avisos) {
  const dir = path.join(vault, DIR_BIBLIOTECA);
  if (!fs.existsSync(dir)) {
    avisos.push(`Pasta ${DIR_BIBLIOTECA}/ não encontrada.`);
    return [];
  }
  const revisoes = [];
  for (const { abs, rel } of listarMd(dir, DIR_BIBLIOTECA)) {
    const fm = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
    if (fm.tem && !fm.valido) {
      avisos.push(`${rel}: frontmatter sem o "---" de fechamento.`);
      continue;
    }
    if (nfc(fm.campos.status) !== nfc(STATUS_REVISAO)) continue;

    const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
    const modulo = texto(fm.campos.modulo);
    const data = texto(fm.campos.data);
    if (!modulo) avisos.push(`${rel}: revisão pendente sem "modulo" no frontmatter.`);
    if (!data) avisos.push(`${rel}: revisão pendente sem "data" no frontmatter.`);
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) avisos.push(`${rel}: data "${data}" fora do formato AAAA-MM-DD.`);
    revisoes.push({
      arquivo: rel,
      nome: path.basename(rel, '.md'),
      modulo,
      data,
      link: linkObsidian(vault, rel),
    });
  }
  return revisoes.sort((a, b) => (a.data || '9999').localeCompare(b.data || '9999') || a.nome.localeCompare(b.nome));
}

function readEstudos(vault) {
  const avisos = [];
  const roadmaps = lerRoadmaps(vault, avisos);
  const revisoes = lerRevisoes(vault, avisos);
  return { vault: path.basename(vault), roadmaps, revisoes, avisos };
}

module.exports = { DIR_ESTUDOS, DIR_BIBLIOTECA, STATUS_REVISAO, readEstudos, analisarRoadmap, limparItem, listarMd, linkObsidian };
