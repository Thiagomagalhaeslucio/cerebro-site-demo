'use strict';

// Hoje: lê 10-diario/hoje.md, gerado sob demanda pela skill `hoje` do vault (agenda do Google e e-mails).
// O site só lê. Seções "## Título" com itens "- texto"; o frontmatter traz `gerado` (data e hora ISO).

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, sections } = require('../../md');

const ARQUIVO = '10-diario/hoje.md';
const VELHO_HORAS = 20; // depois disso a página avisa que o resumo é de outro dia
const MAX_ITENS = 100;

function readHoje(vault, agora = new Date()) {
  const arquivo = path.join(vault, ARQUIVO);
  const avisos = [];
  const vazio = { existe: false, arquivo: ARQUIVO, gerado: null, idadeHoras: null, velho: false, secoes: [], avisos };
  if (!fs.existsSync(arquivo)) return vazio;
  const texto = fs.readFileSync(arquivo, 'utf8');
  const fm = parseFrontmatter(texto);
  const gerado = fm.valido ? fm.campos.gerado : null;
  const quando = gerado ? new Date(gerado) : null;
  if (!quando || Number.isNaN(quando.getTime())) avisos.push(`${ARQUIVO}: falta o campo "gerado" (data e hora ISO) no frontmatter.`);
  const idadeHoras = quando && !Number.isNaN(quando.getTime()) ? Math.max(0, (agora - quando) / 3600000) : null;
  const secs = sections(texto).map((s) => ({
    titulo: s.title,
    itens: s.body.split(/\r?\n/).map((l) => /^\s*[-*]\s+(.*\S)\s*$/.exec(l)?.[1]).filter(Boolean).slice(0, MAX_ITENS),
  }));
  return { existe: true, arquivo: ARQUIVO, gerado: quando && !Number.isNaN(quando.getTime()) ? quando.toISOString() : null, idadeHoras, velho: idadeHoras != null && idadeHoras > VELHO_HORAS, secoes: secs, avisos };
}

module.exports = { ARQUIVO, VELHO_HORAS, readHoje };
