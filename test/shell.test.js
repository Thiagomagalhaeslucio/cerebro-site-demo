'use strict';

// Menu (/api/nav), Home (resumo/datas) e servidor, com o vault de exemplo.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { montarNav } = require('../src/nav');
const { montarHome } = require('../src/home');
const { loadNav } = require('../src/config');
const areas = require('../src/areas');
const financeiro = require('../src/areas/financeiro');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const CTX = { hoje: '2026-03-10', demo: true };

const itens = (nav) => nav.grupos.flatMap((g) => g.itens.flatMap((i) => [i, ...i.filhos]));
const porId = (nav, id) => itens(nav).find((i) => i.id === id);

test('nav: área registrada fica ativa sozinha; o resto, em breve', () => {
  const nav = montarNav(
    {
      grupos: ['Visão', 'Vida'],
      itens: [
        { id: 'home', titulo: 'Home', rota: '/', grupo: 'Visão', estado: 'ativo' },
        { id: 'agenda', titulo: 'Agenda', rota: '/agenda', grupo: 'Visão', estado: 'em-breve' },
        { id: 'fin', titulo: 'Fin', rota: '/fin', grupo: 'Vida', estado: 'em-breve' },
        { id: 'sub', titulo: 'Sub', rota: '/fin/sub', grupo: 'Vida', pai: 'fin', estado: 'ativo' },
        { id: 'fantasma', titulo: 'Fantasma', rota: '/x', grupo: 'Vida', estado: 'ativo' },
      ],
    },
    [{ id: 'fin', titulo: 'Fin' }, { id: 'solta', titulo: 'Solta' }],
  );
  assert.equal(porId(nav, 'home').estado, 'ativo');
  assert.equal(porId(nav, 'agenda').estado, 'em-breve');
  assert.equal(porId(nav, 'fin').estado, 'ativo'); // estava "em-breve" no json, mas a área existe
  assert.equal(porId(nav, 'sub').estado, 'ativo');
  assert.deepEqual(porId(nav, 'fin').filhos.map((f) => f.id), ['sub']);
  assert.equal(porId(nav, 'fantasma').estado, 'em-breve');
  assert.ok(nav.avisos.some((a) => a.includes('"fantasma" está como ativo')));
  assert.equal(porId(nav, 'solta').grupo, 'Outros'); // registrada mas fora do nav.json
});

test('nav: "curto" opcional passa adiante (nome da aba)', () => {
  const nav = montarNav(
    { grupos: ['Visão'], itens: [
      { id: 'home', titulo: 'Home', rota: '/', grupo: 'Visão', estado: 'ativo' },
      { id: 'kanban', titulo: 'Kanban semanal', curto: 'Kanban', rota: '/kanban', grupo: 'Visão', estado: 'ativo' },
    ] },
    [{ id: 'kanban', titulo: 'Kanban semanal' }],
  );
  assert.equal(porId(nav, 'kanban').curto, 'Kanban');
  assert.equal(porId(nav, 'home').curto, undefined);
});

test('nav.json real: áreas registradas ativas; todas ativas', () => {
  const nav = montarNav(loadNav(), areas);
  assert.deepEqual(nav.grupos.map((g) => g.nome), ['Visão', 'Trabalho', 'Vida']);
  for (const id of ['home', 'agenda', 'kanban', 'financeiro', 'diagnostico', 'estudos', 'metas', 'tempo', 'biblioteca', 'demandas', 'relatorios']) assert.equal(porId(nav, id).estado, 'ativo', id);
  assert.deepEqual(nav.avisos, []);
});

test('financeiro: resumo e datas com o vault de exemplo', () => {
  const r = financeiro.resumo(VAULT, CTX);
  assert.deepEqual(r.itens.map((i) => [i.rotulo, i.valor]), [
    ['Diagnóstico', 'De boa nas metas, mas com atenção em: orçamento livre.'],
    ['Patrimônio', 2165],
    ['Livre (pessoal + margem)', 85],
  ]);
  assert.deepEqual(financeiro.datas(VAULT, CTX), [
    { data: '2026-04-01', rotulo: 'Próximo salário', area: 'financeiro' },
    { data: '2026-03-16', rotulo: 'Próximo VT', area: 'financeiro' },
    { data: '2026-03-16', rotulo: 'Próximo VR', area: 'financeiro' },
  ]);
});

test('home: datas em ordem com "em N dias" e área com erro não derruba', () => {
  const quebrada = {
    id: 'quebrada', titulo: 'Quebrada',
    resumo: () => { throw new Error('arquivo sumiu'); },
    datas: () => { throw new Error('sem datas'); },
  };
  const h = montarHome([financeiro, quebrada], VAULT, CTX);
  assert.deepEqual(h.datas.map((d) => [d.data, d.rotulo, d.emDias]), [
    ['2026-03-16', 'Próximo VR', 6],
    ['2026-03-16', 'Próximo VT', 6],
    ['2026-04-01', 'Próximo salário', 22],
  ]);
  assert.equal(h.cartoes.length, 2);
  assert.equal(h.cartoes[0].erro, undefined);
  assert.equal(h.cartoes[1].erro, 'arquivo sumiu');
  assert.ok(h.avisos.some((a) => a.includes('Quebrada: datas indisponíveis')));
});
