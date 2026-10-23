#!/usr/bin/env node
// Gera um snapshot público-safe do site, sem histórico git, numa pasta nova.
// Uso: node scripts/portfolio.js [--saida=/caminho/vazio] [--licenca=MIT]
// Não publica nada: o dono cria o repositório e faz o push.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');
const arg = (nome, padrao) => {
  const a = process.argv.find(x => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : padrao;
};
const saida = path.resolve(arg('saida', path.join(os.tmpdir(), 'cerebro-site-portfolio')));
const licenca = arg('licenca', 'MIT');

// Fica de fora: instruções internas do dono e o estado vivo do projeto.
const EXCLUIR = [/^CLAUDE\.md$/, /^docs\/ESTADO(-arquivo)?\.md$/];
// Termos que nunca devem aparecer no snapshot (documentos, e-mails reais, caminhos pessoais).
const PROIBIDOS = [
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, 'CPF formatado'],
  [/\/home\/[a-z0-9_-]+/i, 'caminho de home'],
  [/[\w.+-]+@(gmail|hotmail|outlook|yahoo|icloud)\.[a-z.]+/i, 'e-mail pessoal'],
  [/thiago|magalh/i, 'nome do dono'],
];
// CPFs de exemplo válidos usados só em testes de validação.
const CPF_EXEMPLO = /529\.982\.247-2[56]|529\.982\.247-52|111\.111\.111-11/g;

if (fs.existsSync(saida) && fs.readdirSync(saida).length) {
  console.error(`A pasta ${saida} não está vazia; escolha outra com --saida=.`);
  process.exit(1);
}
fs.mkdirSync(saida, { recursive: true });

const arquivos = execFileSync('git', ['ls-files', '-z'], { cwd: RAIZ, encoding: 'utf8' })
  .split('\0').filter(Boolean).filter(f => !EXCLUIR.some(r => r.test(f)));
for (const f of arquivos) {
  const destino = path.join(saida, f);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.copyFileSync(path.join(RAIZ, f), destino);
}

const pkg = JSON.parse(fs.readFileSync(path.join(saida, 'package.json'), 'utf8'));
pkg.license = licenca;
delete pkg.private;
fs.writeFileSync(path.join(saida, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');

if (licenca === 'MIT') {
  const ano = new Date().getFullYear();
  fs.writeFileSync(path.join(saida, 'LICENSE'), `MIT License

Copyright (c) ${ano} cerebro-site contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`);
}

// Varredura de texto (binários ficam de fora).
const achados = [];
for (const f of arquivos) {
  if (/\.(png|woff2?|svg|ico|jpg)$/i.test(f) || f === 'scripts/portfolio.js') continue;
  const texto = fs.readFileSync(path.join(saida, f), 'utf8').replace(CPF_EXEMPLO, '');
  for (const [re, rotulo] of PROIBIDOS) {
    if (re.test(texto)) achados.push(`${f}: ${rotulo}`);
  }
}
if (achados.length) {
  console.error('Varredura encontrou possíveis dados pessoais; snapshot NÃO está pronto:');
  for (const a of achados) console.error('  - ' + a);
  process.exit(2);
}

// Prova de que o snapshot roda sozinho.
const npm = (...a) => spawnSync('npm', a, { cwd: saida, encoding: 'utf8' });
const inst = npm('install', '--no-audit', '--no-fund');
if (inst.status !== 0) { console.error(inst.stderr); process.exit(3); }
const teste = npm('test');
if (teste.status !== 0) { console.error(teste.stdout.slice(-2000)); process.exit(4); }

execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: saida });
console.log(`Snapshot pronto em ${saida} (${arquivos.length} arquivos, licença ${licenca}, npm test verde).`);
console.log('Revise, depois: git add -A && git commit, crie o repositório e faça o push.');
