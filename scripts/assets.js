'use strict';

// Copia as fontes (@fontsource-variable) para public/fonts e monta o sprite de
// ícones Lucide em public/icons.svg, só com os ícones usados. `npm run assets`.

const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const NM = path.join(RAIZ, 'node_modules');
const PUB = path.join(RAIZ, 'public');

const FONTES = {
  '@fontsource-variable/archivo': ['archivo-latin-wdth-normal', 'archivo-latin-ext-wdth-normal'], // com o eixo wdth
  '@fontsource-variable/source-serif-4': ['source-serif-4-latin-wght-normal', 'source-serif-4-latin-ext-wght-normal', 'source-serif-4-latin-wght-italic'],
};

// Ícones do menu e da interface (nomes do Lucide).
const ICONES = [
  'house', 'calendar', 'target', 'chart-line', 'square-kanban', 'calculator', 'file-text', 'file-pen-line',
  'inbox', 'timer', 'wallet', 'activity', 'square-pen', 'graduation-cap', 'library',
  'menu', 'x', 'external-link', 'sun', 'moon', 'monitor', 'chevron-left', 'chevron-right', 'chevron-down',
  'file-clock', 'circle-alert', 'copy', 'printer', 'download',
];
const TRACO = '1.6';

fs.mkdirSync(path.join(PUB, 'fonts'), { recursive: true });
for (const [pacote, arquivos] of Object.entries(FONTES)) {
  for (const a of arquivos) fs.copyFileSync(path.join(NM, pacote, 'files', `${a}.woff2`), path.join(PUB, 'fonts', `${a}.woff2`));
  const nome = pacote.split('/')[1];
  fs.copyFileSync(path.join(NM, pacote, 'LICENSE'), path.join(PUB, 'fonts', `LICENSE-${nome}.txt`));
}

const simbolos = ICONES.map((nome) => {
  const svg = fs.readFileSync(path.join(NM, 'lucide-static', 'icons', `${nome}.svg`), 'utf8');
  const corpo = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  return `  <symbol id="i-${nome}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${TRACO}" stroke-linecap="round" stroke-linejoin="round">${corpo.replace(/\s*\n\s*/g, '')}</symbol>`;
});
fs.writeFileSync(path.join(PUB, 'icons.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg">\n<!-- Lucide (https://lucide.dev), licença ISC: public/icons-LICENSE.txt -->\n${simbolos.join('\n')}\n</svg>\n`);
fs.copyFileSync(path.join(NM, 'lucide-static', 'LICENSE'), path.join(PUB, 'icons-LICENSE.txt'));

console.log(`fontes: ${Object.values(FONTES).flat().length} arquivos, ícones: ${ICONES.length}`);
