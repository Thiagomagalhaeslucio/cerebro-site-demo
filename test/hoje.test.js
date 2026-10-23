'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readHoje } = require('../src/areas/hoje/data');
const area = require('../src/areas/hoje');

const FIXTURE = path.join(__dirname, 'fixtures', 'vault-exemplo');
const quando = new Date('2026-03-10T12:00:00-03:00');

test('hoje: lê seções, itens e a idade do resumo', () => {
  const d = readHoje(FIXTURE, quando);
  assert.equal(d.existe, true);
  assert.deepEqual(d.secoes.map((s) => s.titulo), ['Agenda', 'E-mails que pedem ação', 'Para limpar']);
  assert.equal(d.secoes[0].itens.length, 3);
  assert.equal(Math.round(d.idadeHoras), 4);
  assert.equal(d.velho, false);
  assert.deepEqual(d.avisos, []);
});

test('hoje: resumo velho avisa; arquivo ausente ou sem "gerado" não quebra', (t) => {
  assert.equal(readHoje(FIXTURE, new Date('2026-03-12T12:00:00-03:00')).velho, true);
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-hoje-'));
  t.after(() => fs.rmSync(v, { recursive: true, force: true }));
  assert.equal(readHoje(v, quando).existe, false);
  fs.mkdirSync(path.join(v, '10-diario'));
  fs.writeFileSync(path.join(v, '10-diario', 'hoje.md'), '# Hoje\n\n## Agenda\n\n- algo\n');
  const d = readHoje(v, quando);
  assert.equal(d.existe, true);
  assert.match(d.avisos[0], /gerado/);
  assert.equal(d.secoes[0].itens[0], 'algo');
});

test('hoje: cartão da Home conta agenda e e-mails', () => {
  const r = area.resumo(FIXTURE, { demo: true, hoje: '2026-03-10' });
  assert.equal(r.itens[0].valor, 3);
  assert.equal(r.itens[1].valor, 2);
});
