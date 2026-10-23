'use strict';

// Vault de exemplo (hoje fixo em 2026-03-10, terça) e a configuração padrão dos testes.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readRelatorio, periodo } = require('../src/areas/relatorios/data');
const relatorios = require('../src/areas/relatorios');
const areas = require('../src/areas');
const { loadSiteConfig } = require('../src/config');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const HOJE = '2026-03-10';
const CFG = loadSiteConfig().financeiro.diagnostico;
const ler = (consulta) => readRelatorio(VAULT, HOJE, consulta, { premissasDiagnostico: CFG, premissasMetas: CFG });

test('período da semana: segunda a domingo, anterior e próximo; sem relatório do futuro', () => {
  const p = periodo('semana', '2026-03-10', HOJE);
  assert.deepEqual([p.inicio, p.fim, p.anterior, p.proximo, p.emAndamento], ['2026-03-09', '2026-03-15', '2026-03-02', null, true]);
  const passada = periodo('semana', '2026-03-02', HOJE);
  assert.deepEqual([passada.inicio, passada.fim, passada.proximo, passada.emAndamento], ['2026-03-02', '2026-03-08', '2026-03-09', false]);
});

test('período do mês: primeiro ao último dia, inclusive fevereiro; vizinhos por mês', () => {
  const p = periodo('mes', '2026-02-15', HOJE);
  assert.deepEqual([p.inicio, p.fim, p.anterior, p.proximo], ['2026-02-01', '2026-02-28', '2026-01-01', '2026-03-01']);
  assert.equal(periodo('mes', '2026-03-10', HOJE).proximo, null);
  assert.equal(periodo('mes', '2024-02-10', '2026-03-10').fim, '2024-02-29');
});

test('semana atual do exemplo: tempo, gastos e metas', () => {
  const r = ler({});
  assert.deepEqual([r.tipo, r.inicio, r.fim, r.rotuloSemana], ['semana', '2026-03-09', '2026-03-15', '2026-11']);
  assert.deepEqual([r.tempo.minutos, r.tempo.dias, r.tempo.anteriorMinutos], [235, 2, 165]);
  assert.deepEqual(r.tempo.projetos.map((p) => p.projeto), ['projeto-alfa', 'projeto-beta', 'estudos-redes']);
  assert.equal(r.gastos.total, 24.5);
  assert.deepEqual(r.gastos.categorias.map((c) => [c.nome, c.valor]), [['comida fora', 14], ['transporte', 10.5]]);
  assert.equal(r.gastos.categorias.reduce((a, c) => a + c.pct, 0).toFixed(0), '100');
  assert.equal(r.metas.resumo.total, r.metas.lista.length);
  assert.deepEqual(r.avisos, []);
});

test('o ajuste de saldo não conta como gasto, e o mês junta as semanas', () => {
  const m = ler({ tipo: 'mes' });
  assert.deepEqual([m.inicio, m.fim], ['2026-03-01', '2026-03-31']);
  assert.equal(m.tempo.minutos, 400); // as seis linhas de março do exemplo
  const soma = ler({ tipo: 'semana', ref: '2026-03-02' }).gastos.total + ler({ tipo: 'semana', ref: '2026-03-09' }).gastos.total;
  assert.equal(Math.round((m.gastos.total - soma) * 100) / 100, 0, 'março inteiro = as duas semanas que têm gasto (a primeira não tem ajuste nem outro dia)');
});

test('consulta ruim cai no padrão: tipo desconhecido, data inválida ou do futuro', () => {
  assert.equal(ler({ tipo: 'ano' }).tipo, 'semana');
  assert.equal(ler({ ref: '31/02/2026' }).inicio, '2026-03-09');
  assert.equal(ler({ ref: '2030-01-01' }).inicio, '2026-03-09');
  assert.equal(ler({ tipo: 'mes', ref: '2026-02-30' }).inicio, '2026-03-01');
});

test('período antigo e sem registros vem zerado, não quebrado', () => {
  const r = ler({ tipo: 'mes', ref: '2020-01-10' });
  assert.deepEqual([r.tempo.minutos, r.tempo.projetos, r.gastos.total, r.gastos.categorias], [0, [], 0, []]);
});

test('vault sem 80-tempo: tempo nulo; sem financeiro: gastos nulos com aviso; o resto segue', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-rel-'));
  try {
    const r = readRelatorio(v, HOJE, {}, { premissasDiagnostico: CFG, premissasMetas: CFG });
    assert.equal(r.tempo, null);
    assert.equal(r.gastos, null);
    assert.ok(r.avisos.some((a) => /Gastos indisponíveis/.test(a)));
  } finally {
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test('área: contrato e registro; a API lê a consulta do contexto', () => {
  assert.equal(relatorios.id, 'relatorios');
  assert.ok(areas.includes(relatorios));
  assert.equal(relatorios.api[''](VAULT, { hoje: HOJE, consulta: { tipo: 'mes' } }).tipo, 'mes');
  assert.equal(relatorios.api[''](VAULT, { hoje: HOJE }).tipo, 'semana');
});
