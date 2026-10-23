'use strict';

// "De onde vem esta página": caminho, mtime e link do Obsidian dos arquivos
// que cada área lê. Pasta conta pelo .md mais recente dentro dela.

const fs = require('node:fs');
const path = require('node:path');

function mtimeMaisRecente(dirAbs) {
  let maior = 0;
  for (const ent of fs.readdirSync(dirAbs, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const abs = path.join(dirAbs, ent.name);
    if (ent.isDirectory()) maior = Math.max(maior, mtimeMaisRecente(abs));
    else if (ent.name.endsWith('.md')) maior = Math.max(maior, fs.statSync(abs).mtimeMs);
  }
  return maior;
}

function linkObsidian(vault, rel) {
  const v = `obsidian://open?vault=${encodeURIComponent(path.basename(vault))}`;
  return rel && rel.endsWith('.md') ? `${v}&file=${encodeURIComponent(rel.replace(/\.md$/, ''))}` : v;
}

function descrever(vault, rel) {
  const abs = path.join(vault, rel);
  if (!fs.existsSync(abs)) return { caminho: rel, tipo: rel.endsWith('.md') ? 'arquivo' : 'pasta', existe: false, mtime: null, link: linkObsidian(vault, null) };
  const st = fs.statSync(abs);
  const pasta = st.isDirectory();
  const ms = pasta ? mtimeMaisRecente(abs) : st.mtimeMs;
  return {
    caminho: pasta ? `${rel}/` : rel,
    tipo: pasta ? 'pasta' : 'arquivo',
    existe: true,
    mtime: ms ? new Date(ms).toISOString() : null,
    link: linkObsidian(vault, pasta ? null : rel),
  };
}

// area = id de uma área registrada, ou "home" (o vault inteiro).
function montarFontes(areas, vault, ctx, areaId) {
  const nome = path.basename(vault);
  if (areaId === 'home') {
    const todas = areas.flatMap((a) => (typeof a.fontes === 'function' ? safe(() => a.fontes(vault, ctx)) : []));
    const itens = [...new Set(todas)].map((rel) => descrever(vault, rel)).filter((i) => i.mtime);
    const ultimo = itens.reduce((m, i) => (i.mtime > m ? i.mtime : m), '');
    return { vault: nome, itens: [{ caminho: `${nome}/`, tipo: 'vault', existe: true, mtime: ultimo || null, link: linkObsidian(vault, null) }] };
  }
  const area = areas.find((a) => a.id === areaId);
  if (!area) return null;
  const rels = typeof area.fontes === 'function' ? area.fontes(vault, ctx) : [];
  return { vault: nome, itens: rels.map((rel) => descrever(vault, rel)) };
}

function safe(fn) {
  try {
    return fn() || [];
  } catch {
    return [];
  }
}

module.exports = { montarFontes, linkObsidian };
