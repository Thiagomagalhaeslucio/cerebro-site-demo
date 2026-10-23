'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { semanaISO, segundaDaSemana, isISODate } = require('../src/datas');

// Valores conferidos com `date -d <data> +%G-%V`.
test('semanaISO igual ao date +%G-%V, inclusive na virada do ano', () => {
  const casos = {
    '2026-01-01': '2026-01', // quinta
    '2025-12-29': '2026-01', // segunda que já é da semana 1 de 2026
    '2026-12-31': '2026-53',
    '2027-01-01': '2026-53', // sexta: ainda semana 53 de 2026
    '2024-12-30': '2025-01',
    '2021-01-03': '2020-53', // domingo
    '2026-03-10': '2026-11',
    '2026-10-12': '2026-42',
    '2026-10-18': '2026-42',
  };
  for (const [data, semana] of Object.entries(casos)) assert.equal(semanaISO(data), semana, data);
});

test('segundaDaSemana é o inverso de semanaISO', () => {
  assert.equal(segundaDaSemana('2026-01'), '2025-12-29');
  assert.equal(segundaDaSemana('2026-53'), '2026-12-28');
  assert.equal(segundaDaSemana('2025-01'), '2024-12-30');
  assert.equal(segundaDaSemana('2020-53'), '2020-12-28');
  assert.equal(segundaDaSemana('2026-42'), '2026-10-12');
  for (const data of ['2026-03-10', '2027-01-01', '2021-01-03', '2026-06-15']) {
    const seg = segundaDaSemana(semanaISO(data));
    assert.equal(semanaISO(seg), semanaISO(data), data);
  }
  assert.throws(() => segundaDaSemana('2026-1'));
});

test('isISODate rejeita data que não existe', () => {
  assert.equal(isISODate('2026-02-28'), true);
  assert.equal(isISODate('2026-02-30'), false);
  assert.equal(isISODate('2026-3-1'), false);
});
