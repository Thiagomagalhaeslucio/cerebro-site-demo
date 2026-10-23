'use strict';

// Utilitários mínimos para ler o markdown do vault (só leitura).

function stripFrontmatter(text) {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

// Divide o texto em seções "## Título". Retorna [{ title, body }].
function sections(text) {
  const out = [];
  let current = null;
  for (const line of stripFrontmatter(text).split(/\r?\n/)) {
    const m = /^##\s+(.*)$/.exec(line);
    if (m) {
      current = { title: m[1].trim(), body: '' };
      out.push(current);
    } else if (current) {
      current.body += line + '\n';
    }
  }
  return out;
}

function findSection(text, titlePrefix) {
  const norm = (s) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  return sections(text).find((s) => norm(s.title).startsWith(norm(titlePrefix))) || null;
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

// Todas as tabelas do texto: [{ header: [...], rows: [[...]] }].
function parseTables(text) {
  const tables = [];
  let block = [];
  const flush = () => {
    if (block.length >= 2) {
      const header = splitRow(block[0]).map((h) => h.toLowerCase());
      const rows = block
        .slice(1)
        .filter((l) => !/^\|?\s*:?-{3,}/.test(l.trim()))
        .map(splitRow);
      tables.push({ header, rows });
    }
    block = [];
  };
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().startsWith('|')) block.push(line);
    else flush();
  }
  flush();
  return tables;
}

// Aceita "1234.56", "R$ 1.234,56", "R$2.000", "25.000." etc.
function parseNumber(value) {
  if (value == null) return null;
  let t = String(value).replace(/R\$/g, '').replace(/\s/g, '').replace(/[.,]$/, '');
  if (t === '') return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => Math.round(n * 100) / 100;

// Valor YAML simples: "texto", 'texto', [a, b], texto # comentário.
function yamlValue(raw) {
  const v = raw.trim();
  const aspas = /^(["'])(.*)\1(\s+#.*)?$/.exec(v);
  if (aspas) return aspas[2];
  if (/^\[.*\]$/.test(v)) return v.slice(1, -1).split(',').map(yamlValue).filter((s) => s !== '');
  return v.replace(/\s+#.*$/, '');
}

// Frontmatter YAML só com o que o vault usa: chave: valor, listas [a, b] e
// listas em bloco ("- item"). Retorna { tem, valido, campos }.
function parseFrontmatter(text) {
  if (!/^---\r?\n/.test(text)) return { tem: false, valido: false, campos: {} };
  const m = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text);
  if (!m) return { tem: true, valido: false, campos: {} };
  const campos = {};
  let lista = null;
  for (const line of m[1].split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && lista) {
      campos[lista].push(yamlValue(item[1]));
      continue;
    }
    const kv = /^([A-Za-z_][\w-]*):(.*)$/.exec(line);
    if (!kv) continue;
    const valor = kv[2].trim();
    if (valor === '') {
      campos[kv[1]] = [];
      lista = kv[1];
    } else {
      campos[kv[1]] = yamlValue(valor);
      lista = null;
    }
  }
  return { tem: true, valido: true, campos };
}

module.exports = { stripFrontmatter, sections, findSection, parseTables, parseNumber, round2, parseFrontmatter };
