'use strict';

// Usa test/fixtures/vault-exemplo (valores inventados). Hoje fixo: 2026-03-10 (terça).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readDiagnostico, buildDiagnostico, addMonths } = require('../src/areas/financeiro/diagnostico');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const CFG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config.json'), 'utf8')).financeiro.diagnostico;
const HOJE = '2026-03-10';
const ind = (d, id) => d.indicadores.find((i) => i.id === id);
const ler = (f) => fs.readFileSync(path.join(VAULT, '40-financeiro', f), 'utf8');

test('addMonths respeita o fim do mês', () => {
  assert.equal(addMonths('2026-03-01', 1), '2026-04-01');
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
});

test('diagnóstico do vault de exemplo', () => {
  const d = readDiagnostico(VAULT, CFG, HOJE);
  assert.deepEqual(d.avisos, []);

  // datas de referência
  assert.equal(d.referencias.salario.proximo, '2026-04-01');
  assert.equal(d.referencias.vt.proxima, '2026-03-16'); // a entrada "Ajuste" de 05/03 não conta
  assert.equal(d.referencias.vr.proxima, '2026-03-16');

  // 1. metas: 1600 + 500 = 2100 ≥ 2000
  const metas = ind(d, 'metas');
  assert.equal(metas.status, 'verde');
  assert.equal(metas.projecaoMarco, 2100);
  assert.equal(metas.reserva.salarios, 4); // (1000 − 300) / 200 = 3,5 → 4

  // 2. orçamento: gasto 65 de 150 (o ajuste de 5 é ignorado); ciclo 10/31
  const orc = ind(d, 'orcamento');
  assert.equal(orc.gastoPct, 43.33);
  assert.equal(orc.cicloPct, 32.26);
  assert.equal(orc.status, 'amarelo');
  assert.deepEqual(orc.panelas.map((p) => [p.id, p.gasto, p.pct]), [['pessoal', 60, 60], ['margem', 5, 10]]);
  assert.equal(orc.porDia, 3.86); // 85 / 22
  assert.equal(orc.pessoalDia, 1.82); // 40 / 22
  assert.equal(orc.assinaturasPessoal, 30);

  // 3. VR: (21 + 14) / 7 = 5/dia × 6 dias = 30 ≤ 60
  const vr = ind(d, 'vr');
  assert.equal(vr.media, 5);
  assert.equal(vr.necessario, 30);
  assert.equal(vr.status, 'verde');

  // 4. dia a dia: pool 100; transporte qua-sex 31,5 + sáb 15,5 + seg 10,5 = 57,5; folga 42,5/6
  const dd = ind(d, 'diaadia');
  assert.equal(dd.pool, 100);
  assert.equal(dd.transporte, 57.5);
  assert.equal(dd.folga, 7.08);
  assert.equal(dd.media, 2); // (20 + 8) / 14; internet, transporte e ajuste ficam fora
  assert.equal(dd.excesso, 0);
  assert.equal(dd.status, 'verde');

  assert.deepEqual(d.veredito, { status: 'amarelo', texto: 'De boa nas metas, mas com atenção em: orçamento livre.' });

  // para onde foi o dinheiro desde 01/03
  assert.equal(d.paraOnde.total, 178.5);
  const cat = Object.fromEntries(d.paraOnde.categorias.map((c) => [c.nome, c.valor]));
  assert.deepEqual(cat, { 'comida fora': 72, 'assinaturas/serviços': 70, mercado: 21, transporte: 10.5, 'cuidado pessoal/saúde': 5 });
  assert.equal(d.paraOnde.comidaFora.recentePorDia, 7.43); // 52 / 7
  assert.equal(d.paraOnde.comidaFora.anteriorPorDia, 6.43); // 90 / 14
  assert.equal(d.paraOnde.naoLancados.length, 1);
});

test('veredito vermelho e lista com "e"', () => {
  const panelas = ler('panelas.md').replace('| VR | vr | 60.00 |', '| VR | vr | 20.00 |');
  const movs = ler('movimentos.md') + '| 2026-03-10 | pessoal | saída | 30.00 | roupa |  |\n';
  const d = buildDiagnostico(panelas, movs, CFG, HOJE);
  assert.equal(ind(d, 'vr').status, 'vermelho'); // precisa de 30, tem 20 (limite 24)
  assert.equal(ind(d, 'orcamento').status, 'vermelho'); // 95/150 = 63% contra 32% + 25
  assert.equal(d.veredito.texto, 'Vale segurar os gastos em: orçamento livre e VR.');
});

test('excesso usa média e folga sem arredondar', () => {
  // média = (28 + 100,03) / 14 = 9,145; folga = 42,5 / 6 = 7,0833…
  // sem arredondar: (9,145 − 7,0833) × 6 = 12,37; arredondando antes daria (9,15 − 7,08) × 6 = 12,42
  const movs = ler('movimentos.md') + '| 2026-03-10 | vt | saída | 100.03 | lanche |  |\n';
  const dd = ind(buildDiagnostico(ler('panelas.md'), movs, CFG, HOJE), 'diaadia');
  assert.equal(dd.excesso, 12.37);
  assert.equal(dd.media, 9.15);
  assert.equal(dd.folga, 7.08);
  assert.equal(dd.status, 'amarelo');
});

test('campo ilegível vira aviso, não chute', () => {
  const panelas = ler('panelas.md').replace(/## Salário[\s\S]*?(?=## Reposições)/, '');
  const d = buildDiagnostico(panelas, ler('movimentos.md'), CFG, HOJE);
  assert.equal(ind(d, 'metas').status, 'sem-dados');
  assert.equal(ind(d, 'orcamento').status, 'sem-dados');
  assert.ok(d.avisos.some((a) => a.includes('Último salário não encontrado')));
});

test('salário atrasado vira aviso', () => {
  const d = readDiagnostico(VAULT, CFG, '2026-04-02');
  assert.equal(ind(d, 'orcamento').status, 'sem-dados');
  assert.ok(d.avisos.some((a) => a.includes('já deveria ter entrado')));
});
