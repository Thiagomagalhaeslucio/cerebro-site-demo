'use strict';

// Contas do cronômetro e do pomodoro (public/tempo/relogio.js), com carimbos fixos: nada lê o relógio.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const R = require('../public/tempo/relogio');
const { pomodoroPremissas, POMODORO_PADRAO } = require('../src/areas/tempo/data');
const tempo = require('../src/areas/tempo');

const CFG = { foco: 25, pausaCurta: 5, pausaLonga: 15, focosAteLonga: 4 };
const T0 = Date.UTC(2026, 2, 10, 15, 0, 0);
const MIN = R.MIN;

test('cronômetro: soma os trechos rodados e ignora o tempo parado', () => {
  let c = R.cronometroNovo();
  assert.equal(R.cronometroMs(c, T0), 0);
  c = R.cronometroIniciar(c, T0);
  assert.equal(R.cronometroMs(c, T0 + 90 * 1000), 90000);
  c = R.cronometroPausar(c, T0 + 60 * 1000);
  assert.equal(R.cronometroMs(c, T0 + 10 * MIN), 60000); // parado: não anda
  c = R.cronometroIniciar(c, T0 + 10 * MIN);
  assert.equal(R.cronometroMs(c, T0 + 10 * MIN + 30000), 90000);
  assert.equal(c.primeiro, T0, 'o primeiro início não muda ao continuar');
});

test('cronômetro: iniciar rodando e pausar parado não mudam nada; relógio andando para trás não dá negativo', () => {
  const c = R.cronometroIniciar(R.cronometroNovo(), T0);
  assert.equal(R.cronometroIniciar(c, T0 + 5000), c);
  const p = R.cronometroNovo();
  assert.equal(R.cronometroPausar(p, T0), p);
  assert.equal(R.cronometroMs(c, T0 - 5000), 0);
});

test('formato: h:mm:ss só passa de uma hora; regressivo arredonda para cima', () => {
  assert.equal(R.relogio(0), '00:00');
  assert.equal(R.relogio(65 * 1000), '01:05');
  assert.equal(R.relogio(3600 * 1000 + 61000), '1:01:01');
  assert.equal(R.regressivo(25 * MIN), '25:00');
  assert.equal(R.regressivo(24 * MIN + 59001), '25:00');
  assert.equal(R.regressivo(1), '00:01');
  assert.equal(R.regressivo(0), '00:00');
});

test('pomodoro: começa parado no foco, com a duração inteira', () => {
  const p = R.pomodoroNovo('2026-03-10');
  assert.equal(p.fase, 'foco');
  assert.equal(R.pomodoroRodando(p), false);
  assert.equal(R.pomodoroRestante(p, T0, CFG), 25 * MIN);
});

test('pomodoro: pausar guarda o que falta e continuar recomeça dali', () => {
  let p = R.pomodoroIniciar(R.pomodoroNovo('d'), T0, CFG);
  assert.equal(R.pomodoroRestante(p, T0 + 10 * MIN, CFG), 15 * MIN);
  p = R.pomodoroPausar(p, T0 + 10 * MIN, CFG);
  assert.equal(R.pomodoroRestante(p, T0 + 99 * MIN, CFG), 15 * MIN);
  p = R.pomodoroIniciar(p, T0 + 99 * MIN, CFG);
  assert.equal(R.pomodoroTerminou(p, T0 + 113 * MIN), false);
  assert.equal(R.pomodoroTerminou(p, T0 + 114 * MIN), true);
});

test('pomodoro: quatro focos completos levam à pausa longa e o ciclo recomeça', () => {
  let p = R.pomodoroNovo('d');
  const fases = [];
  for (let i = 0; i < 4; i++) {
    p = R.pomodoroAvancar(p, CFG, true); // foco acabou
    fases.push(p.fase);
    p = R.pomodoroAvancar(p, CFG, true); // pausa acabou
  }
  assert.deepEqual(fases, ['pausa-curta', 'pausa-curta', 'pausa-curta', 'pausa-longa']);
  assert.equal(p.fase, 'foco');
  assert.equal(p.focos, 0, 'depois da longa o ciclo zera');
  assert.equal(p.focosHoje, 4, 'o contador do dia continua');
});

test('pomodoro: foco pulado não conta; a próxima fase fica parada', () => {
  let p = R.pomodoroIniciar(R.pomodoroNovo('d'), T0, CFG);
  p = R.pomodoroAvancar(p, CFG, false);
  assert.equal(p.fase, 'pausa-curta');
  assert.equal(p.focosHoje, 0);
  assert.equal(p.focos, 0);
  assert.equal(R.pomodoroRodando(p), false);
  assert.equal(R.pomodoroRestante(p, T0, CFG), 5 * MIN);
});

test('pomodoro: virar o dia zera só o contador do dia', () => {
  const p = { ...R.pomodoroNovo('2026-03-09'), focos: 2, focosHoje: 3 };
  const q = R.pomodoroDia(p, '2026-03-10');
  assert.deepEqual([q.dia, q.focosHoje, q.focos], ['2026-03-10', 0, 2]);
  assert.equal(R.pomodoroDia(q, '2026-03-10'), q);
});

test('linha da tabela: data e horas locais, minutos arredondados e mínimo de 1', () => {
  const ini = new Date(2026, 2, 10, 9, 5).getTime();
  let c = R.cronometroIniciar(R.cronometroNovo(), ini);
  const fim = ini + 67 * MIN + 20000;
  assert.equal(R.linhaDaTabela(c, fim, '  projeto-alfa '), '| 2026-03-10 | projeto-alfa | 09:05 | 10:12 | 67 |  |');
  c = R.cronometroPausar(c, ini + 10000);
  assert.match(R.linhaDaTabela(c, ini + 10000, ''), /\| projeto \| 09:05 \| 09:05 \| 1 \|/);
});

test('premissas do pomodoro: padrão sem config; valor ruim volta ao padrão com aviso', () => {
  assert.deepEqual(pomodoroPremissas(undefined), POMODORO_PADRAO);
  const avisos = [];
  const p = pomodoroPremissas({ foco: 50, pausaCurta: 0, pausaLonga: '15', focosAteLonga: 3 }, avisos);
  assert.deepEqual(p, { foco: 50, pausaCurta: 5, pausaLonga: 15, focosAteLonga: 3 });
  assert.equal(avisos.length, 2);
});

test('API /api/tempo traz as premissas do config.json', () => {
  const d = tempo.api[''](path.join(__dirname, 'fixtures', 'vault-exemplo'), { hoje: '2026-03-10' });
  assert.deepEqual(d.pomodoro, POMODORO_PADRAO);
  assert.deepEqual(d.avisos, []);
});

test('a página do relógio não escreve no vault nem usa innerHTML', () => {
  for (const f of ['relogios.js', 'relogio.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'tempo', f), 'utf8');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|method:\s*['"](POST|PUT|DELETE)/.test(src), f);
  }
});
