'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNumber } = require('../src/md');
const { buildFinanceiro, isGasto } = require('../src/areas/financeiro/data');

const PANELAS = `---
tags: [financeiro]
data: 2026-10-17
---

# Panelas

## Metas e marcos

- Marco: marco de R$2.000 dentro da panela principal.
- Meta final: meta final da panela principal = R$25.000.
- Reserva: meta de R$1.000.

## Saldos atuais (em 2026-10-18) — FONTE DA VERDADE

| panela | id | saldo | obs |
| --- | --- | --- | --- |
| Principal | principal | 100.00 | |
| Reserva | reserva | 50.00 | |
| Pessoal / Lazer | pessoal | 30.00 | |
| Margem | margem | 20.00 | |
| Conta | conta | 40.00 | inclui o VT |
| VT | vt | 25.00 | não soma |

Patrimônio total: 240.00 (soma de tudo, exceto o VT).
Livre (pessoal + margem): 50.00 (disponível: 40.00).

## Salário

- Último: R$1000.00 recebido em 2026-10-05
  (principal 570.00 / reserva 210.00 / pessoal 130.00 / margem 90.00).

## Reposições pendentes

- 2026-10-18 — pessoal — 10.00 — lanche
- 2026-10-10 — margem — 5.00 — remédio ✔ reposto 2026-10-12
`;

const MOVIMENTOS = `---
tags: [financeiro]
---

> nota qualquer

| data | panela | tipo | valor | descrição | obs |
| --- | --- | --- | --- | --- | --- |
| 2026-10-17 | vt | saída | 5.00 | Transporte do dia |  |
| 2026-10-18 | pessoal | saída | 10.00 | lanche | pago da conta |
| 2026-10-18 | vr | saída | 1.00 | Ajuste de saldo (conferido com o banco) |  |
| 2026-10-18 | pessoal→conta | transferência | 9.00 | Reposição |  |
| 2026-10-18 | trem | recarga | 7.00 | Recarga |  |
| 2026-09-01 | vr | saída | 3.00 | antigo, fora dos 30 dias |  |
`;

test('parseNumber entende os formatos do vault', () => {
  assert.equal(parseNumber('987.65'), 987.65);
  assert.equal(parseNumber('R$2.000'), 2000);
  assert.equal(parseNumber('25.000.'), 25000);
  assert.equal(parseNumber('R$ 1.234,56'), 1234.56);
  assert.equal(parseNumber(''), null);
});

test('lê saldos, metas, salário e pendentes do panelas.md', () => {
  const d = buildFinanceiro(PANELAS, MOVIMENTOS, '2026-10-18');
  assert.equal(d.dataSaldos, '2026-10-18');
  assert.equal(d.saldos.length, 6);
  assert.deepEqual(d.metas, { marco: 2000, metaFinal: 25000, reserva: 1000 });
  assert.equal(d.patrimonio.escrito, 240);
  assert.equal(d.patrimonio.somado, 240);
  assert.equal(d.patrimonio.confere, true);
  assert.equal(d.livre.escrito, 50);
  assert.equal(d.pendentes.itens.length, 1); // a reposta (✔) é ignorada
  assert.equal(d.pendentes.total, 10);
  assert.equal(d.disponivel, 40);
  assert.equal(d.salario.valor, 1000);
  assert.equal(d.salario.divisao.length, 4);
  assert.deepEqual(d.avisos, []);
});

test('avisa quando o patrimônio escrito não bate', () => {
  const d = buildFinanceiro(PANELAS.replace('Patrimônio total: 240.00', 'Patrimônio total: 241.00'), MOVIMENTOS, '2026-10-18');
  assert.equal(d.patrimonio.confere, false);
  assert.equal(d.patrimonio.diferenca, -1);
  assert.ok(d.avisos.some((a) => a.includes('não bate')));
});

test('gasto = saída sem ajuste do banco; transferência e recarga ficam fora', () => {
  const d = buildFinanceiro(PANELAS, MOVIMENTOS, '2026-10-18');
  assert.deepEqual(d.gastos.mes.porPanela, { vt: 5, pessoal: 10 });
  assert.equal(d.gastos.mes.total, 15);
  assert.equal(d.gastos.ultimos30.dias.length, 30);
  assert.equal(d.gastos.ultimos30.series.vr, undefined); // a de 09/01 está fora da janela
  assert.equal(isGasto({ tipo: 'recarga', valor: 1, descricao: 'x' }), false);
  assert.equal(d.ultimosMovimentos[0].panela, 'vr'); // último da tabela primeiro
});
