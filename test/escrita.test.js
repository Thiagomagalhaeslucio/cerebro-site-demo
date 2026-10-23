'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const tempo = require('../src/areas/tempo/gravar');
const agenda = require('../src/areas/agenda/gravar');
const kanban = require('../src/areas/kanban/gravar');
const { readKanban } = require('../src/areas/kanban/data');
const { readTempo } = require('../src/areas/tempo/data');
const { readAgenda } = require('../src/areas/agenda/data');

const FIXTURE = path.join(__dirname, 'fixtures', 'vault-exemplo');
const HOJE = '2026-03-10';

function copia(t, { git = false } = {}) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-escrita-'));
  fs.cpSync(FIXTURE, v, { recursive: true });
  if (git) {
    const g = (...a) => execFileSync('git', ['-c', 'user.name=T', '-c', 'user.email=t@x.invalid', ...a], { cwd: v, stdio: 'pipe' });
    g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'base');
  }
  t.after(() => fs.rmSync(v, { recursive: true, force: true }));
  return v;
}
const ctx = (extra = {}) => ({ hoje: HOJE, demo: false, estado: {}, git: false, ...extra });
const quebra = (fn, status) => assert.throws(fn, (e) => e.status === status);

test('tempo: acrescenta uma linha e o parser lê de volta', (t) => {
  const v = copia(t);
  const antes = readTempo(v, HOJE).mes.minutos;
  const r = tempo.registrar(v, ctx(), { projeto: 'Meu Projeto', data: HOJE, inicio: '09:00', fim: '09:30', min: 30, nota: 'a | b' });
  assert.equal(r.status, 200);
  const d = readTempo(v, HOJE);
  assert.equal(d.mes.minutos, antes + 30);
  assert.deepEqual(d.avisos, readTempo(FIXTURE, HOJE).avisos);
  assert.ok(d.mes.projetos.some((p) => p.projeto === 'meu-projeto'));
});

test('tempo: cria o arquivo do mês quando não existe e valida o corpo', (t) => {
  const v = copia(t);
  tempo.registrar(v, ctx(), { projeto: 'x', data: '2026-02-03', min: 10 });
  assert.match(fs.readFileSync(path.join(v, '80-tempo', '2026-02.md'), 'utf8'), /# Tempo 2026-02[\s\S]*\| 2026-02-03 \| x \|/);
  quebra(() => tempo.registrar(v, ctx(), { projeto: 'x', data: '2026-03-11', min: 10 }), 422); // futuro
  quebra(() => tempo.registrar(v, ctx(), { projeto: 'x', data: HOJE, min: 0 }), 400);
  quebra(() => tempo.registrar(v, ctx(), { projeto: 'x', data: HOJE, min: 5, extra: 1 }), 400);
  quebra(() => tempo.registrar(v, ctx(), { projeto: '../x', data: HOJE, min: 5 }), 400);
  quebra(() => tempo.registrar(v, ctx(), { projeto: 'x', data: HOJE, min: 5, inicio: '25:00' }), 400);
});

test('tempo: demo recusa e duplicado em 30 s dá 409', (t) => {
  const v = copia(t);
  quebra(() => tempo.registrar(v, ctx({ demo: true }), { projeto: 'x', data: HOJE, min: 5 }), 403);
  const c = ctx();
  tempo.registrar(v, c, { projeto: 'x', data: HOJE, min: 5 });
  quebra(() => tempo.registrar(v, c, { projeto: 'x', data: HOJE, min: 5 }), 409);
});

test('agenda: acrescenta compromisso, valida e não mexe no resto', (t) => {
  const v = copia(t);
  const antes = fs.readFileSync(path.join(v, '10-diario', 'agenda.md'), 'utf8');
  const n = readAgenda(v, { hoje: HOJE, areas: [] }).eventos.length;
  agenda.criar(v, ctx(), { data: '2026-03-20', inicio: '14:00', fim: '15:00', titulo: 'Reunião | geral', tipo: 'trabalho', obs: 'sala 2' });
  const depois = fs.readFileSync(path.join(v, '10-diario', 'agenda.md'), 'utf8');
  assert.ok(depois.startsWith(antes.trimEnd()));
  const a = readAgenda(v, { hoje: HOJE, areas: [] });
  assert.equal(a.eventos.length, n + 1);
  assert.ok(a.eventos.some((e) => e.titulo.includes('Reunião') && e.data === '2026-03-20'));
  quebra(() => agenda.criar(v, ctx(), { data: '2026-03-20', titulo: '', tipo: 'aula' }), 400);
  quebra(() => agenda.criar(v, ctx(), { data: '2026-03-20', titulo: 'x', tipo: 'inventado' }), 400);
  quebra(() => agenda.criar(v, ctx(), { data: '2026-03-20', inicio: '10:00', fim: '09:00', titulo: 'x' }), 400);
});

const semanaDe = (v) => readKanban(v, HOJE).semanas[0];

test('kanban: criar card e mover entre colunas, com versão', (t) => {
  const v = copia(t);
  let s = semanaDe(v);
  const criar = kanban.operar(v, ctx(), { semana: s.semana, versao: s.versao, operacao: { tipo: 'criar', coluna: 'Fazendo', titulo: 'Card novo', prazo: '2026-03-12', projeto: 'abc' } });
  assert.equal(criar.status, 200);
  s = semanaDe(v);
  assert.equal(s.colunas[1].cards[0].titulo, 'Card novo');
  assert.equal(s.colunas[1].cards[0].prazo, '2026-03-12');

  // mover o primeiro de "A fazer" para "Feito": vira [x]
  const primeiro = s.colunas[0].cards[0];
  kanban.operar(v, ctx(), { semana: s.semana, versao: s.versao, operacao: { tipo: 'mover', de: 'A fazer', indice: 0, titulo: primeiro.titulo, para: 'Feito' } });
  const s2 = semanaDe(v);
  assert.equal(s2.total, s.total);
  assert.equal(s2.colunas[0].cards.length, s.colunas[0].cards.length - 1);
  const movido = s2.colunas[3].cards.find((c) => c.titulo === primeiro.titulo);
  assert.ok(movido && movido.marcado);
  assert.deepEqual(s2.colunas[0].cards.map((c) => c.titulo), s.colunas[0].cards.slice(1).map((c) => c.titulo));
  assert.deepEqual(readKanban(v, HOJE).avisos, readKanban(FIXTURE, HOJE).avisos);
  // e de volta: desmarca
  kanban.operar(v, ctx(), { semana: s2.semana, versao: s2.versao, operacao: { tipo: 'mover', de: 'Feito', indice: s2.colunas[3].cards.indexOf(movido), titulo: primeiro.titulo, para: 'Bloqueado' } });
  assert.equal(semanaDe(v).colunas[2].cards[0].marcado, false);
});

test('kanban: versão velha, card que mudou, coluna inválida e demo', (t) => {
  const v = copia(t);
  const s = semanaDe(v);
  const base = { semana: s.semana, versao: s.versao };
  quebra(() => kanban.operar(v, ctx(), { ...base, versao: 'a'.repeat(64), operacao: { tipo: 'criar', coluna: 'Fazendo', titulo: 'x' } }), 409);
  quebra(() => kanban.operar(v, ctx(), { ...base, operacao: { tipo: 'mover', de: 'A fazer', indice: 0, titulo: 'outro', para: 'Feito' } }), 409);
  quebra(() => kanban.operar(v, ctx(), { ...base, operacao: { tipo: 'criar', coluna: 'Nada', titulo: 'x' } }), 400);
  quebra(() => kanban.operar(v, ctx(), { ...base, operacao: { tipo: 'criar', coluna: 'Fazendo', titulo: 'com #tag' } }), 400);
  quebra(() => kanban.operar(v, ctx({ demo: true }), { ...base, operacao: { tipo: 'criar', coluna: 'Fazendo', titulo: 'x' } }), 403);
  quebra(() => kanban.operar(v, ctx(), { semana: '../../x', versao: s.versao, operacao: { tipo: 'criar', coluna: 'Fazendo', titulo: 'x' } }), 400);
});

test('escrita com git: commit só do arquivo escrito, inclusive arquivo novo', (t) => {
  const v = copia(t, { git: true });
  fs.appendFileSync(path.join(v, '10-diario', 'metas.md'), '\n<!-- sujeira de outro arquivo -->\n');
  tempo.registrar(v, ctx({ git: undefined }), { projeto: 'x', data: '2026-02-03', min: 10 });
  const status = execFileSync('git', ['status', '--porcelain'], { cwd: v, encoding: 'utf8' });
  assert.match(status, /metas\.md/); // continua sem commit
  assert.doesNotMatch(status, /80-tempo/);
  const log = execFileSync('git', ['log', '--format=%s', '-1'], { cwd: v, encoding: 'utf8' });
  assert.match(log, /Tempo pelo site: x, 10 min/);
});
