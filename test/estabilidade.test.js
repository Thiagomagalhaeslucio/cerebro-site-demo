'use strict';

// Regressão: parser determinístico não pode variar. Regex com flag g/y no nível do
// módulo guarda lastIndex entre chamadas e faz linhas serem puladas de vez em quando.
// Cada leitor roda N vezes sobre a mesma entrada, também intercalado com os outros
// (para pegar estado compartilhado), e a saída tem de ser idêntica.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCard, parseKanban, readKanban } = require('../src/areas/kanban/data');
const { parseAgenda, readAgenda } = require('../src/areas/agenda/data');
const { readEstudos, analisarRoadmap } = require('../src/areas/estudos/data');
const { readFinanceiro, parsePanelas, parseMovimentos } = require('../src/areas/financeiro/data');
const { readDiagnostico } = require('../src/areas/financeiro/diagnostico');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const HOJE = '2026-03-10';
const N = 200;
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')).financeiro.diagnostico;
const ler = (rel) => fs.readFileSync(path.join(VAULT, rel), 'utf8');

const CASOS = {
  'parseCard (vários prazos e tags)': () => parseCard('Revisar @2026-03-11 e @{2026-03-12} #a #b #c'),
  'parseKanban': () => parseKanban(ler('10-diario/kanban-2026-11.md'), 'k.md', []),
  'readKanban': () => readKanban(VAULT, HOJE),
  'parseAgenda': () => parseAgenda(ler('10-diario/agenda.md'), 'agenda.md', []),
  'readAgenda': () => readAgenda(VAULT, { hoje: HOJE, demo: true, areas: [] }),
  'analisarRoadmap': () => analisarRoadmap(ler('60-estudos/roadmap-exemplo.md'), 'roadmap-exemplo.md', []),
  'readEstudos': () => readEstudos(VAULT),
  'parsePanelas': () => parsePanelas(ler('40-financeiro/panelas.md'), []),
  'parseMovimentos': () => parseMovimentos(ler('40-financeiro/movimentos.md'), []),
  'readFinanceiro': () => readFinanceiro(VAULT, HOJE),
  'readDiagnostico': () => readDiagnostico(VAULT, CFG, HOJE),
};

for (const [nome, fn] of Object.entries(CASOS)) {
  test(`estabilidade: ${nome} dá a mesma saída em ${N} chamadas`, () => {
    const esperado = fn();
    for (let i = 0; i < N; i++) assert.deepEqual(fn(), esperado, `chamada ${i + 1}`);
  });
}

test('estabilidade: leitores intercalados não contaminam uns aos outros', () => {
  const fns = Object.values(CASOS);
  const esperado = fns.map((f) => f());
  for (let i = 0; i < 50; i++) fns.forEach((f, j) => assert.deepEqual(f(), esperado[j], `rodada ${i + 1}, caso ${j}`));
});

test('config.local.json: mescla objetos, troca listas inteiras e não vale nos testes', () => {
  const { mesclar, loadSiteConfig } = require('../src/config');
  const base = { a: { x: 1, y: [1, 2] }, b: 2 };
  assert.deepEqual(mesclar(base, { a: { y: [9] }, c: 3 }), { a: { x: 1, y: [9] }, b: 2, c: 3 });
  assert.deepEqual(base, { a: { x: 1, y: [1, 2] }, b: 2 }, 'não altera a base');
  assert.equal(mesclar(base, 7), 7);
  // Dentro do `node --test` o arquivo local (se existir na máquina) fica de fora: os testes são herméticos.
  assert.ok(process.env.NODE_TEST_CONTEXT, 'este teste só faz sentido dentro do node --test');
  assert.deepEqual(loadSiteConfig().financeiro.diagnostico.categorias['assinaturas/serviços'], ['assinatura', 'streaming', 'internet', 'mensalidade']);
});
