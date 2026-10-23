'use strict';

// Kanban com o vault de exemplo (itens inventados). Hoje fixo: 2026-03-10.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseCard, parseKanban, etiquetaPrazo, escolherSemana, readKanban, prazosAbertos } = require('../src/areas/kanban/data');
const kanban = require('../src/areas/kanban');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const HOJE = '2026-03-10';
const CTX = { hoje: HOJE, demo: true };

test('parseCard: prazo, projeto e título limpo', () => {
  assert.deepEqual(parseCard('Revisar sub-redes @2026-03-11 #faculdade'),
    { titulo: 'Revisar sub-redes', prazo: '2026-03-11', projeto: 'faculdade', tags: ['faculdade'] });
  assert.deepEqual(parseCard('Card do plugin @{2026-03-12} #a #b'),
    { titulo: 'Card do plugin', prazo: '2026-03-12', projeto: 'a', tags: ['a', 'b'] });
  assert.deepEqual(parseCard('Sem nada'), { titulo: 'Sem nada', prazo: null, projeto: null, tags: [] });
});

test('parseKanban: colunas, [x], bloco de código e configuração do plugin ignorados', () => {
  const avisos = [];
  const colunas = parseKanban([
    '---', 'kanban-plugin: board', '---', '',
    '- [ ] antes da coluna',
    '## A fazer', '- [ ] Um @2026-02-30 #p', '```', '- [ ] dentro de código', '```',
    '## Feito', '- [x] Dois',
    '%% kanban:settings', '```', '{"kanban-plugin":"board"}', '```', '%%',
  ].join('\n'), 'k.md', avisos);
  assert.deepEqual(colunas.map((c) => [c.titulo, c.cards.map((x) => [x.titulo, x.marcado, x.concluido, x.prazo])]), [
    ['A fazer', [['Um', false, false, null]]],
    ['Feito', [['Dois', true, true, null]]],
  ]);
  assert.deepEqual(avisos, [
    'k.md: card antes da primeira coluna ignorado: "antes da coluna".',
    'k.md: prazo inválido @2026-02-30 em "Um".',
  ]);
});

test('etiquetaPrazo com data fixa', () => {
  assert.equal(etiquetaPrazo('2026-03-06', HOJE, false), 'atrasado');
  assert.equal(etiquetaPrazo('2026-03-10', HOJE, false), 'hoje');
  assert.equal(etiquetaPrazo('2026-03-11', HOJE, false), 'amanhã');
  assert.equal(etiquetaPrazo('2026-03-13', HOJE, false), null);
  assert.equal(etiquetaPrazo('2026-03-06', HOJE, true), null); // concluído não atrasa
  assert.equal(etiquetaPrazo(null, HOJE, false), null);
});

test('escolha da semana', () => {
  assert.equal(escolherSemana(['2026-10', '2026-11'], '2026-11'), '2026-11');
  assert.equal(escolherSemana(['2026-10', '2026-11'], '2026-13'), '2026-11'); // atual sem arquivo: última anterior
  assert.equal(escolherSemana(['2026-20'], '2026-11'), '2026-20'); // nenhuma anterior: a primeira
  assert.equal(escolherSemana([], '2026-11'), null);
});

test('readKanban no vault de exemplo', () => {
  const d = readKanban(VAULT, HOJE);
  assert.deepEqual(d.avisos, []);
  assert.equal(d.semanaAtual, '2026-11');
  assert.equal(d.escolhida, '2026-11');
  assert.deepEqual(d.semanas.map((s) => [s.semana, s.segunda, s.total, s.feitos, s.atrasados]), [
    ['2026-10', '2026-03-02', 5, 2, 2],
    ['2026-11', '2026-03-09', 9, 2, 1],
  ]);
  const s = d.semanas[1];
  assert.deepEqual(s.colunas.map((c) => [c.titulo, c.cards.length]), [['A fazer', 4], ['Fazendo', 2], ['Bloqueado', 1], ['Feito', 2]]);
  assert.deepEqual(s.colunas[0].cards.map((c) => c.etiqueta), ['hoje', 'amanhã', null, null]);
  assert.equal(s.colunas[2].cards[0].etiqueta, 'atrasado');
  assert.deepEqual(d.projetos, ['cerebro-site', 'estudo-python', 'estudo-redes', 'faculdade', 'lab']);
});

test('prazos abertos usam o estado mais recente de cada card', () => {
  // "Assistir à aula de modelo OSI" está aberto na semana 10 e feito na 11: não entra.
  assert.deepEqual(prazosAbertos(readKanban(VAULT, HOJE)).map((c) => [c.prazo, c.titulo]).sort(), [
    ['2026-03-06', 'Configurar o servidor do laboratório'],
    ['2026-03-10', 'Entregar a lista de exercícios de lógica'],
    ['2026-03-11', 'Revisar sub-redes para a prova'],
    ['2026-03-13', 'Página de agenda do site'],
  ]);
});

test('kanban: resumo e datas para a Home', () => {
  assert.deepEqual(kanban.resumo(VAULT, CTX).itens.map((i) => [i.rotulo, i.valor]), [
    ['Semana 2026-11', '2/9 feitos'],
    ['Atrasados', 1],
  ]);
  assert.deepEqual(kanban.datas(VAULT, CTX).map((x) => [x.data, x.rotulo]).sort(), [
    ['2026-03-06', 'Prazo: Configurar o servidor do laboratório'],
    ['2026-03-10', 'Prazo: Entregar a lista de exercícios de lógica'],
    ['2026-03-11', 'Prazo: Revisar sub-redes para a prova'],
    ['2026-03-13', 'Prazo: Página de agenda do site'],
  ]);
});
