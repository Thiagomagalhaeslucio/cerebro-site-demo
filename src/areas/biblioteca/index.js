'use strict';

const os = require('node:os');
const path = require('node:path');
const { DIR_BIBLIOTECA } = require('../estudos/data');
const { readBiblioteca } = require('./data');
const { loadSiteConfig } = require('../../config');

const RAIZ = path.join(__dirname, '..', '..', '..');
const absoluta = (p) => (p ? path.resolve(RAIZ, p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p) : null);

// Pasta dos livros: config.json → biblioteca.livros (o caminho seu vai em config.local.json). Na demo vale só
// demo.livros, com livros inventados.
function opcoes(ctx) {
  const cfg = loadSiteConfig();
  const l = cfg.biblioteca?.livros ?? {};
  return { livros: { pasta: absoluta(ctx?.demo ? cfg.demo?.livros : l.pasta), tag: l.tag } };
}

// Sem cartão na Home: as revisões pendentes já aparecem em Estudos. A pasta de livros fica fora do vault e não
// dispara atualização ao vivo: recarregue a página depois de mexer nela.
module.exports = {
  opcoes,
  id: 'biblioteca',
  titulo: 'Biblioteca',
  watch: [DIR_BIBLIOTECA],
  api: { '': (vault, ctx) => readBiblioteca(vault, opcoes(ctx)) },
  fontes: () => [DIR_BIBLIOTECA],
};
