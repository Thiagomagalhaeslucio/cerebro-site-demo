'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ensaiar, PORTA } = require('../scripts/ensaio');

const FIXTURE = path.join(__dirname, 'fixtures', 'vault-exemplo');
const arvore = (dir) => fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())
  .map((e) => path.join(e.parentPath ?? e.path, e.name)).sort()
  .map((f) => `${path.relative(dir, f)}:${crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')}`);

test('ensaio: copia só 40-financeiro, não toca na origem e diz o comando', (t) => {
  const destino = path.join(os.tmpdir(), `cerebro-ensaio-teste-${process.pid}`);
  t.after(() => fs.rmSync(destino, { recursive: true, force: true }));
  const antes = arvore(FIXTURE);
  const r = ensaiar({ vault: FIXTURE, destino });
  assert.deepEqual(arvore(FIXTURE), antes);
  assert.deepEqual(r.arquivos, ['movimentos.md', 'panelas.md']);
  assert.deepEqual(fs.readdirSync(destino), ['40-financeiro']);
  assert.equal(r.comando, `npm start -- --vault=${destino} --porta=${PORTA}`);
  assert.equal(PORTA, 3739);
  // gravar na cópia não altera a origem
  fs.appendFileSync(path.join(destino, '40-financeiro', 'panelas.md'), '\nx\n');
  assert.deepEqual(arvore(FIXTURE), antes);
  // rodar de novo recomeça do zero
  ensaiar({ vault: FIXTURE, destino });
  assert.ok(!fs.readFileSync(path.join(destino, '40-financeiro', 'panelas.md'), 'utf8').endsWith('x\n'));
});

test('ensaio: recusa vault sem 40-financeiro e destinos perigosos', () => {
  assert.throws(() => ensaiar({ vault: os.tmpdir(), destino: path.join(os.tmpdir(), 'cerebro-ensaio-x') }), /não existe/);
  assert.throws(() => ensaiar({ vault: FIXTURE, destino: path.join(FIXTURE, 'cerebro-ensaio') }), /dentro do vault/);
  assert.throws(() => ensaiar({ vault: FIXTURE, destino: path.resolve(FIXTURE, '..', '..') }), /dentro do vault/); // um ancestral da fixture: o destino conteria a origem
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-vault-'));
  try {
    fs.mkdirSync(path.join(vault, '40-financeiro'));
    assert.throws(() => ensaiar({ vault, destino: os.homedir() }), /Destino recusado/); // só apaga cópias de ensaio, em /tmp
    assert.throws(() => ensaiar({ vault, destino: path.join(os.tmpdir(), 'outra-coisa') }), /Destino recusado/);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});
