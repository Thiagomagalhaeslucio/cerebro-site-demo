'use strict';

// Agenda: 10-diario/agenda.md + prazos abertos do kanban + datas() das outras
// áreas (salário, VT, VR…). Só leitura.

const fs = require('node:fs');
const path = require('node:path');
const { stripFrontmatter, parseTables } = require('../../md');
const { isISODate } = require('../../datas');
const { readKanban, prazosAbertos } = require('../kanban/data');

const DIR = '10-diario';
const ARQUIVO = `${DIR}/agenda.md`;
const TIPOS = ['aula', 'prova', 'estudo', 'trabalho', 'pessoal', 'financeiro'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const PROPRIAS = new Set(['agenda', 'kanban']); // essas a agenda já lê direto

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const coluna = (header, nome) => header.findIndex((h) => norm(h) === norm(nome));

// Ordem: data, dia inteiro antes, depois hora de início.
const ordem = (a, b) => a.data.localeCompare(b.data) || Number(!a.diaInteiro) - Number(!b.diaInteiro) || (a.inicio || '').localeCompare(b.inicio || '') || a.titulo.localeCompare(b.titulo);

// Linha inválida vira aviso e fica de fora; tipo fora da lista vira aviso e fica.
function parseAgenda(texto, avisos = [], arquivo = ARQUIVO) {
  const tabela = parseTables(stripFrontmatter(texto)).find((t) => coluna(t.header, 'data') >= 0 && coluna(t.header, 'título') >= 0);
  if (!tabela) {
    avisos.push(`${arquivo}: tabela "| data | início | fim | título | tipo | obs |" não encontrada.`);
    return [];
  }
  const i = Object.fromEntries(['data', 'início', 'fim', 'título', 'tipo', 'obs'].map((c) => [c, coluna(tabela.header, c)]));
  const cel = (r, c) => (i[c] >= 0 ? (r[i[c]] ?? '').trim() : '');

  const eventos = [];
  tabela.rows.forEach((r, n) => {
    if (r.every((c) => c.trim() === '')) return;
    const [data, inicio, fim, titulo, tipo, obs] = ['data', 'início', 'fim', 'título', 'tipo', 'obs'].map((c) => cel(r, c));
    const erros = [];
    if (!isISODate(data)) erros.push(`data "${data}" inválida`);
    if (inicio && !HORA.test(inicio)) erros.push(`início "${inicio}" inválido`);
    if (fim && !HORA.test(fim)) erros.push(`fim "${fim}" inválido`);
    if (!inicio && fim) erros.push('fim sem início');
    if (HORA.test(inicio) && HORA.test(fim) && fim < inicio) erros.push('fim antes do início');
    if (!titulo) erros.push('sem título');
    if (erros.length) {
      avisos.push(`${arquivo}: linha ${n + 1} da tabela ignorada (${erros.join('; ')}): | ${r.join(' | ')} |`);
      return;
    }
    if (tipo && !TIPOS.includes(norm(tipo)))
      avisos.push(`${arquivo}: "${titulo}" (${data}) com tipo "${tipo}" fora da lista (${TIPOS.join(', ')}).`);
    eventos.push({ data, inicio: inicio || null, fim: fim || null, diaInteiro: !inicio, titulo, tipo: tipo || null, obs, origem: 'agenda' });
  });
  return eventos.sort(ordem);
}

function lerEventosDaAgenda(vault, avisos) {
  const arquivo = path.join(vault, ARQUIVO);
  if (!fs.existsSync(arquivo)) {
    avisos.push(`${ARQUIVO} não encontrado.`);
    return [];
  }
  return parseAgenda(fs.readFileSync(arquivo, 'utf8'), avisos);
}

function readAgenda(vault, ctx) {
  const avisos = [];
  const eventos = lerEventosDaAgenda(vault, avisos);

  try {
    const k = readKanban(vault, ctx.hoje);
    avisos.push(...k.avisos.map((a) => `Kanban: ${a}`));
    for (const c of prazosAbertos(k)) {
      eventos.push({
        data: c.prazo, inicio: null, fim: null, diaInteiro: true,
        titulo: `Prazo: ${c.titulo}`, tipo: null, obs: c.projeto ? `#${c.projeto}` : '',
        origem: 'kanban', atrasado: c.atrasado,
      });
    }
  } catch (err) {
    avisos.push(`Kanban: prazos indisponíveis (${err.message}).`);
  }

  for (const area of ctx.areas || []) {
    if (PROPRIAS.has(area.id) || typeof area.datas !== 'function') continue;
    try {
      for (const d of area.datas(vault, ctx) || []) {
        if (!isISODate(d.data)) {
          avisos.push(`${area.titulo}: data inválida "${d.data}" em "${d.rotulo}".`);
          continue;
        }
        eventos.push({ data: d.data, inicio: null, fim: null, diaInteiro: true, titulo: d.rotulo, tipo: null, obs: '', origem: area.id });
      }
    } catch (err) {
      avisos.push(`${area.titulo}: datas indisponíveis (${err.message}).`);
    }
  }

  eventos.sort(ordem);
  return { hoje: ctx.hoje, eventos, origens: [...new Set(eventos.map((e) => e.origem))], avisos };
}

module.exports = { DIR, ARQUIVO, TIPOS, parseAgenda, lerEventosDaAgenda, readAgenda };
