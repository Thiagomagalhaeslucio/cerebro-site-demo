'use strict';

// Baixa as capas dos livros da Biblioteca para capas/ (ignorada pelo git), uma vez por livro.
//   npm run capas              baixa as que faltam
//   npm run capas -- --refazer apaga e baixa todas de novo
// É o ÚNICO ponto em que o projeto chama a internet: o endereço vem do campo coverUrl de cada nota do
// livro; o site só serve os arquivos locais. Escreve apenas em capas/. Imprime só contagens.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { readBiblioteca, CAPAS_DIR } = require('../src/areas/biblioteca/data');
const { opcoes } = require('../src/areas/biblioteca');
const { loadConfig } = require('../src/config');

const MIN_BYTES = 3000; // abaixo disso é ícone, não capa (a Open Library devolve 1x1 quando não tem)
const MAX_BYTES = 3 * 1024 * 1024;
const EM_PARALELO = 4;

// A nota traz a capa miúda (zoom=1, uns 128 px de largura); o Google Books entrega maior com zoom=3.
const ampliar = (url) => url.replace(/([?&]zoom=)\d+/, '$13');

async function baixar(url) {
  try { return await baixarUma(ampliar(url)); } catch { return baixarUma(url); }
}

async function baixarUma(url) {
  const alvo = url.replace(/^http:\/\//i, 'https://');
  const r = await fetch(alvo, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'cerebro-site/0.1 (uso pessoal)' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const tipo = r.headers.get('content-type') || '';
  if (!/^image\/(jpeg|png|webp|gif)/i.test(tipo)) throw new Error(`não é imagem (${tipo || 'sem tipo'})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length < MIN_BYTES) throw new Error(`pequena demais (${buf.length} bytes)`);
  if (buf.length > MAX_BYTES) throw new Error('grande demais');
  return buf;
}

// Sem coverUrl (ou só com a capa genérica): procura o livro pelo título e autor na Open Library (pública, sem
// chave) e usa a capa do primeiro resultado de título parecido. A API do Google Books sem chave responde 429.
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
async function procurarCapa(titulo, autor) {
  const params = new URLSearchParams({ title: titulo, limit: '8', fields: 'title,author_name,cover_i' });
  if (autor) params.set('author', autor.split(',')[0]);
  const r = await fetch(`https://openlibrary.org/search.json?${params}`, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'cerebro-site/0.1 (uso pessoal)' } });
  if (!r.ok) throw new Error(`busca: HTTP ${r.status}`);
  const alvo = norm(titulo);
  const achou = ((await r.json()).docs || []).find((d) => d.cover_i && (norm(d.title) === alvo || norm(d.title).includes(alvo) || alvo.includes(norm(d.title))));
  if (!achou) throw new Error('a busca não achou capa de título parecido');
  return `https://covers.openlibrary.org/b/id/${achou.cover_i}-L.jpg`;
}

async function main() {
  const refazer = process.argv.includes('--refazer');
  const ctx = { demo: false };
  const cfg = loadConfig(['--vault=.']); // só para ler a configuração (nada é aberto)
  const vault = cfg.vault;
  const d = readBiblioteca(vault, { ...opcoes(ctx), comFonteDaCapa: true, capasDir: path.join(CAPAS_DIR, '__nada__') });
  if (!d.livros.length) {
    console.log('Nenhum livro configurado (biblioteca.livros.pasta em config.local.json).');
    return;
  }
  fs.mkdirSync(CAPAS_DIR, { recursive: true });
  let baixadas = 0;
  let jaTinha = 0;
  const falhas = [];
  const fila = [...d.livros];
  async function trabalhador() {
    for (let l = fila.shift(); l; l = fila.shift()) {
      const arq = path.join(CAPAS_DIR, `${l.id}.jpg`);
      if (!refazer && fs.existsSync(arq)) { jaTinha++; continue; }
      try {
        if (!l.capaFonte) throw new Error('sem coverUrl na nota');
        fs.writeFileSync(arq, await baixar(l.capaFonte));
        baixadas++;
      } catch (e) {
        falhas.push([l.titulo, e.message]);
      }
    }
  }
  await Promise.all(Array.from({ length: EM_PARALELO }, trabalhador));

  // A capa genérica do Google ("image not available") vem idêntica para vários livros: arquivo repetido não é capa.
  const porHash = new Map();
  for (const l of d.livros) {
    const arq = path.join(CAPAS_DIR, `${l.id}.jpg`);
    if (!fs.existsSync(arq)) continue;
    const h = crypto.createHash('sha1').update(fs.readFileSync(arq)).digest('hex');
    porHash.set(h, [...(porHash.get(h) || []), [l, arq]]);
  }
  for (const grupo of porHash.values()) {
    if (grupo.length < 2) continue;
    for (const [l, arq] of grupo) { fs.rmSync(arq); baixadas = Math.max(0, baixadas - 1); falhas.push([l.titulo, 'só a capa genérica do Google (imagem repetida)']); }
  }
  // Segunda rodada, uma a uma: livro sem capa ainda (sem coverUrl, ou só com a genérica) é procurado pelo título.
  const genericas = new Set([...porHash.entries()].filter(([, g]) => g.length > 1).map(([h]) => h));
  for (const l of d.livros) {
    const arq = path.join(CAPAS_DIR, `${l.id}.jpg`);
    if (fs.existsSync(arq)) continue;
    try {
      const buf = await baixarUma(await procurarCapa(l.titulo, l.autor));
      if (genericas.has(crypto.createHash('sha1').update(buf).digest('hex'))) throw new Error('a busca também só achou a capa genérica');
      fs.writeFileSync(arq, buf);
      baixadas++;
      const i = falhas.findIndex(([t]) => t === l.titulo);
      if (i >= 0) falhas.splice(i, 1);
    } catch (e) {
      if (!falhas.some(([t]) => t === l.titulo)) falhas.push([l.titulo, e.message]);
    }
    await new Promise((ok) => setTimeout(ok, 1500));
  }
  console.log(`Capas: ${baixadas} baixadas, ${jaTinha} já estavam, ${falhas.length} sem capa (de ${d.livros.length} livros).`);
  for (const [t, m] of falhas) console.log(`  - ${t}: ${m}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
