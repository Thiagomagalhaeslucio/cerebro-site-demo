'use strict';

// Datas como AAAA-MM-DD; contas em UTC ao meio-dia para não sofrer com fuso.

function localISODate(d = new Date()) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const toDate = (iso) => new Date(iso + 'T12:00:00Z');
const toISO = (d) => d.toISOString().slice(0, 10);

function addDays(iso, n) {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

function addMonths(iso, n) {
  const d = toDate(iso);
  const dia = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const ultimo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimo));
  return toISO(d);
}

const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 86400000); // a − b
const diaDaSemana = (iso) => toDate(iso).getUTCDay(); // 0 = domingo, 6 = sábado
// Data no formato e que existe de verdade (rejeita 2026-02-30).
const isISODate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && toISO(toDate(s)) === s;

// Semana ISO no formato de `date +%G-%V`: semana começa na segunda e a
// semana 1 é a que contém a primeira quinta-feira do ano.
function semanaISO(iso) {
  const d = toDate(iso);
  const quinta = new Date(d);
  quinta.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3);
  const ano = quinta.getUTCFullYear();
  const semana = 1 + Math.floor((quinta - Date.UTC(ano, 0, 1, 12)) / 86400000 / 7);
  return `${ano}-${String(semana).padStart(2, '0')}`;
}

// Inverso: segunda-feira da semana "AAAA-SS".
function segundaDaSemana(semana) {
  const m = /^(\d{4})-(\d{2})$/.exec(semana);
  if (!m) throw new Error(`semana inválida: "${semana}" (use AAAA-SS)`);
  const jan4 = toDate(`${m[1]}-01-04`);
  const segunda1 = addDays(toISO(jan4), -((jan4.getUTCDay() + 6) % 7));
  return addDays(segunda1, (Number(m[2]) - 1) * 7);
}

module.exports = { localISODate, addDays, addMonths, diffDays, diaDaSemana, isISODate, semanaISO, segundaDaSemana };
