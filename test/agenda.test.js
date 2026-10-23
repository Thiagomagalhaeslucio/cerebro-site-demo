'use strict';

// Agenda com o vault de exemplo (compromissos inventados). Hoje fixo: 2026-03-10.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseAgenda, readAgenda } = require('../src/areas/agenda/data');
const agenda = require('../src/areas/agenda');
const kanban = require('../src/areas/kanban');
const financeiro = require('../src/areas/financeiro');
const estudos = require('../src/areas/estudos');
const { montarHome } = require('../src/home');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const AREAS = [agenda, kanban, financeiro, estudos];
const CTX = { hoje: '2026-03-10', demo: true, areas: AREAS };

const tabela = (...linhas) => ['| data | início | fim | título | tipo | obs |', '| --- | --- | --- | --- | --- | --- |', ...linhas].join('\n');

test('parseAgenda: dia inteiro, com hora e linhas inválidas viram aviso', () => {
  const avisos = [];
  const ev = parseAgenda(tabela(
    '| 2026-03-11 |  |  | Prova | prova | calculadora |',
    '| 2026-03-10 | 19:00 | 22:00 | Aula | aula |  |',
    '| 2026-03-10 | 08:00 |  | Café | pessoal |  |',
    '| 2026-02-30 | 10:00 | 11:00 | Data que não existe | aula |  |',
    '| 2026-03-12 | 25:00 | 26:00 | Hora inválida | aula |  |',
    '| 2026-03-12 |  | 10:00 | Fim sem início | aula |  |',
    '| 2026-03-12 | 11:00 | 10:00 | Fim antes | aula |  |',
    '| 2026-03-12 |  |  |  | aula |  |',
    '| 2026-03-13 |  |  | Tipo novo | festa |  |',
  ), avisos, 'a.md');

  assert.deepEqual(ev.map((e) => [e.data, e.inicio, e.fim, e.diaInteiro, e.titulo]), [
    ['2026-03-10', '08:00', null, false, 'Café'],
    ['2026-03-10', '19:00', '22:00', false, 'Aula'],
    ['2026-03-11', null, null, true, 'Prova'],
    ['2026-03-13', null, null, true, 'Tipo novo'], // tipo fora da lista: fica, com aviso
  ]);
  assert.equal(ev[2].obs, 'calculadora');
  assert.equal(avisos.length, 6);
  assert.match(avisos[0], /linha 4 da tabela ignorada \(data "2026-02-30" inválida\)/);
  assert.match(avisos[1], /início "25:00" inválido; fim "26:00" inválido/);
  assert.match(avisos[2], /fim sem início/);
  assert.match(avisos[3], /fim antes do início/);
  assert.match(avisos[4], /sem título/);
  assert.match(avisos[5], /tipo "festa" fora da lista/);
});

test('parseAgenda sem tabela vira aviso', () => {
  const avisos = [];
  assert.deepEqual(parseAgenda('# nada aqui', avisos, 'a.md'), []);
  assert.match(avisos[0], /tabela .* não encontrada/);
});

test('readAgenda junta agenda.md, prazos do kanban e datas do financeiro', () => {
  const d = readAgenda(VAULT, CTX);
  assert.deepEqual(d.avisos, []);
  const por = (o) => d.eventos.filter((e) => e.origem === o);
  assert.equal(por('agenda').length, 11);
  assert.deepEqual(por('kanban').map((e) => [e.data, e.titulo, !!e.atrasado]), [
    ['2026-03-06', 'Prazo: Configurar o servidor do laboratório', true],
    ['2026-03-10', 'Prazo: Entregar a lista de exercícios de lógica', false],
    ['2026-03-11', 'Prazo: Revisar sub-redes para a prova', false],
    ['2026-03-13', 'Prazo: Página de agenda do site', false],
  ]);
  assert.deepEqual(por('financeiro').map((e) => [e.data, e.titulo]), [
    ['2026-03-16', 'Próximo VR'],
    ['2026-03-16', 'Próximo VT'],
    ['2026-04-01', 'Próximo salário'],
  ]);
  // Ordem: data, dia inteiro antes, depois hora.
  assert.deepEqual(d.eventos.filter((e) => e.data === '2026-03-10').map((e) => e.titulo), [
    'Prazo: Entregar a lista de exercícios de lógica',
    'Aula de Redes',
  ]);
});

test('agenda: resumo e datas para a Home', () => {
  assert.deepEqual(agenda.resumo(VAULT, CTX).itens.map((i) => [i.rotulo, i.valor]), [
    ['10/03, 19:00–22:00', 'Aula de Redes'],
    ['11/03, dia inteiro', 'Prova de Redes: sub-redes'],
    ['12/03, 20:00–21:00', 'Grupo de estudo de Python'],
  ]);
  const ds = agenda.datas(VAULT, CTX);
  assert.equal(ds.length, 8); // 10/03 a 23/03
  assert.deepEqual(ds[0], { data: '2026-03-10', rotulo: '19:00 Aula de Redes', area: 'agenda' });
});

test('Home com agenda e kanban, e uma área lançando erro', () => {
  const quebrada = { id: 'quebrada', titulo: 'Quebrada', resumo: () => { throw new Error('arquivo sumiu'); }, datas: () => { throw new Error('sem datas'); } };
  const areas = [...AREAS, quebrada];
  const h = montarHome(areas, VAULT, { ...CTX, areas });
  assert.deepEqual(h.cartoes.map((c) => [c.area, c.erro ?? null]), [
    ['agenda', null], ['kanban', null], ['financeiro', null], ['estudos', null], ['quebrada', 'arquivo sumiu'],
  ]);
  const doDia = h.datas.filter((d) => d.data === '2026-03-10').map((d) => [d.area, d.rotulo]);
  assert.deepEqual(doDia, [['agenda', '19:00 Aula de Redes'], ['kanban', 'Prazo: Entregar a lista de exercícios de lógica']]);
  assert.equal(h.datas[0].rotulo, 'Prazo: Configurar o servidor do laboratório'); // atrasado vem primeiro
  assert.equal(h.datas[0].emDias, -4);
  assert.ok(h.avisos.some((a) => a.includes('Quebrada: datas indisponíveis')));
});
