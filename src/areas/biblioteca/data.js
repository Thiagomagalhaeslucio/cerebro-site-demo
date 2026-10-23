'use strict';

// Biblioteca: lista as notas de 20-biblioteca/** (qualquer profundidade) com pasta, módulo, status, data
// e tags, para filtrar e buscar na página. Só leitura; frontmatter ruim vira aviso, não derruba a lista.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, stripFrontmatter } = require('../../md');
const { DIR_BIBLIOTECA, STATUS_REVISAO, listarMd, linkObsidian } = require('../estudos/data');

const SEM_STATUS = 'sem status';
const TAG_LIVROS = 'Livros';
const CAPAS_DIR = path.join(__dirname, '..', '..', '..', 'capas'); // baixadas por `npm run capas`; fora do git
const idDoLivro = (arquivo) => crypto.createHash('sha1').update(arquivo).digest('hex').slice(0, 12);
const nfc = (s) => String(s ?? '').normalize('NFC');
const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

// Primeiro "# Título" fora de blocos de código; sem ele, o módulo; sem módulo, o nome do arquivo.
function tituloDe(corpo) {
  let emCodigo = false;
  for (const linha of corpo.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(linha)) emCodigo = !emCodigo;
    else if (!emCodigo) {
      const m = /^#\s+(.+?)\s*$/.exec(linha);
      if (m) return m[1].replace(/[`*]/g, '').replace(/^[^\p{L}\p{N}]+/u, '').trim() || null;
    }
  }
  return null;
}

const contar = (notas, chave) => {
  const m = new Map();
  for (const n of notas) m.set(n[chave], (m.get(n[chave]) || 0) + 1);
  return [...m.entries()].map(([nome, total]) => ({ nome, total })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
};

// Livros de OUTRA pasta (por exemplo, a raiz de um segundo vault do Obsidian com notas do plugin de livros):
// percorre tudo (menos pastas com ponto) e cada nota com a tag e o campo `title` é um livro. A pasta vem da configuração, só é lida, e as capas
// (links externos) não são carregadas. Falha vira aviso e a biblioteca segue.
function lerLivros(pasta, tag, avisos) {
  if (!pasta) return [];
  if (!fs.existsSync(pasta) || !fs.statSync(pasta).isDirectory()) {
    avisos.push(`Pasta de livros "${path.basename(pasta)}" não encontrada; confira biblioteca.livros.pasta no config.`);
    return [];
  }
  const nomeVault = path.basename(pasta); // o vault do Obsidian é a pasta configurada; os links saem dela
  const livros = [];
  const visitar = (dir, rel) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.name.startsWith('.')) continue;
      const abs = path.join(dir, ent.name);
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) { visitar(abs, r); continue; }
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue;
      const fm = parseFrontmatter(fs.readFileSync(abs, 'utf8'));
      if (!fm.valido) continue;
      const tags = (Array.isArray(fm.campos.tags) ? fm.campos.tags : [fm.campos.tags]).filter((t) => typeof t === 'string');
      const titulo = texto(fm.campos.title);
      if (!titulo || !tags.some((t) => nfc(t).toLowerCase() === nfc(tag).toLowerCase())) continue;
      const paginas = Number(String(fm.campos.totalPage ?? '').replace(/\D/g, ''));
      const ano = /^(\d{4})/.exec(texto(fm.campos.publishDate) || '');
      livros.push({
        tipo: 'livro',
        id: idDoLivro(r.replace(/\.md$/, '')),
        capaFonte: texto(fm.campos.coverUrl),
        arquivo: r.replace(/\.md$/, ''),
        nome: path.basename(r, '.md'),
        titulo,
        subtitulo: texto(fm.campos.subtitle),
        autor: texto(fm.campos.author) || texto(fm.campos.authors),
        categoria: texto(fm.campos.category),
        editora: texto(fm.campos.publisher),
        ano: ano ? Number(ano[1]) : null,
        paginas: paginas > 0 ? paginas : null,
        link: `obsidian://open?vault=${encodeURIComponent(nomeVault)}&file=${encodeURIComponent(r.replace(/\.md$/, ''))}`,
      });
    }
  };
  try {
    visitar(pasta, '');
  } catch (e) {
    avisos.push(`Livros: não consegui ler "${path.basename(pasta)}" (${e.message}).`);
  }
  return livros.sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

// opcoes.livros = { pasta, tag }: pasta absoluta dos livros (opcional).
function readBiblioteca(vault, opcoes = {}) {
  const avisos = [];
  const capasDir = opcoes.capasDir || CAPAS_DIR;
  // `capa` = arquivo já baixado (servido de /capas, local) ou null; o endereço de origem só sai se pedirem (script).
  const livros = lerLivros(opcoes.livros?.pasta, opcoes.livros?.tag || TAG_LIVROS, avisos).map(({ capaFonte, ...l }) => ({
    ...l,
    capa: fs.existsSync(path.join(capasDir, `${l.id}.jpg`)) ? `/capas/${l.id}.jpg` : null,
    ...(opcoes.comFonteDaCapa ? { capaFonte } : {}),
  }));
  const dir = path.join(vault, DIR_BIBLIOTECA);
  if (!fs.existsSync(dir)) {
    avisos.push(`Pasta ${DIR_BIBLIOTECA}/ não encontrada.`);
    return { existe: false, pasta: DIR_BIBLIOTECA, notas: [], livros, pastas: [], status: [], resumo: { total: 0, revisaoPendente: 0, semStatus: 0, livros: livros.length }, avisos };
  }
  const notas = [];
  for (const { abs, rel } of listarMd(dir, DIR_BIBLIOTECA)) {
    const bruto = fs.readFileSync(abs, 'utf8');
    const fm = parseFrontmatter(bruto);
    if (fm.tem && !fm.valido) avisos.push(`${rel}: frontmatter sem o "---" de fechamento.`);
    const c = fm.valido ? fm.campos : {};
    const modulo = texto(c.modulo);
    const nome = path.basename(rel, '.md');
    const dentro = rel.slice(DIR_BIBLIOTECA.length + 1).split('/');
    const tags = (Array.isArray(c.tags) ? c.tags : [c.tags]).filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim());
    const data = texto(c.data);
    if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) avisos.push(`${rel}: data "${data}" fora do formato AAAA-MM-DD.`);
    notas.push({
      arquivo: rel,
      nome,
      titulo: tituloDe(stripFrontmatter(bruto)) || modulo || nome,
      pasta: dentro.length > 1 ? dentro[0] : '(raiz)',
      modulo,
      status: nfc(texto(c.status) || SEM_STATUS),
      data: data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : null,
      tags,
      link: linkObsidian(vault, rel),
    });
  }
  // Revisão pendente primeiro (é o que pede ação), depois a data mais nova, depois o título.
  notas.sort((a, b) => Number(b.status === nfc(STATUS_REVISAO)) - Number(a.status === nfc(STATUS_REVISAO))
    || (b.data || '').localeCompare(a.data || '') || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  return {
    existe: true,
    pasta: DIR_BIBLIOTECA,
    notas,
    livros,
    pastas: contar(notas, 'pasta'),
    status: contar(notas, 'status'),
    resumo: {
      total: notas.length,
      revisaoPendente: notas.filter((n) => n.status === nfc(STATUS_REVISAO)).length,
      semStatus: notas.filter((n) => n.status === SEM_STATUS).length,
      livros: livros.length,
    },
    avisos,
  };
}

module.exports = { readBiblioteca, tituloDe, SEM_STATUS, TAG_LIVROS, CAPAS_DIR, idDoLivro };
