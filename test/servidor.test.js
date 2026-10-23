'use strict';

// Servidor de verdade numa porta livre, em modo demo (vault de exemplo).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { criarServidor } = require('../src/app');
const { loadConfig } = require('../src/config');
const areas = require('../src/areas');

const itens = (nav) => nav.grupos.flatMap((g) => g.itens.flatMap((i) => [i, ...i.filhos]));
const porId = (nav, id) => itens(nav).find((i) => i.id === id);

// Sobe o servidor de verdade numa porta livre.
function pedir(server, rota, host) {
  const { port } = server.address();
  return new Promise((ok, falha) => {
    http.get({ host: '127.0.0.1', port, path: rota, headers: { Host: host || `127.0.0.1:${port}` } }, (res) => {
      let corpo = '';
      res.on('data', (c) => (corpo += c));
      res.on('end', () => ok({ status: res.statusCode, corpo }));
    }).on('error', falha);
  });
}

test('servidor: /api/nav, /api/home, Home e páginas antigas', async (t) => {
  const cfg = { ...loadConfig(['--demo']), port: 0 };
  const quebrada = { id: 'quebrada', titulo: 'Quebrada', watch: [], api: {}, resumo: () => { throw new Error('falhou'); } };
  const { server } = criarServidor(cfg, [...areas, quebrada]);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());

  const nav = JSON.parse((await pedir(server, '/api/nav')).corpo);
  assert.equal(nav.vault, 'vault-exemplo');
  assert.deepEqual(nav.demo, { hoje: '2026-03-10' });
  assert.equal(porId(nav, 'estudos').estado, 'ativo');
  assert.equal(porId(nav, 'agenda').estado, 'ativo');
  assert.equal(porId(nav, 'metas').estado, 'ativo');

  const home = await pedir(server, '/api/home');
  assert.equal(home.status, 200);
  const h = JSON.parse(home.corpo);
  assert.deepEqual(h.cartoes.map((c) => [c.area, !!c.erro]), [['agenda', false], ['kanban', false], ['financeiro', false], ['estudos', false], ['orcamento', false], ['propostas', false], ['contratos', false], ['metas', false], ['tempo', false], ['biblioteca', false], ['demandas', false], ['relatorios', false], ['quebrada', true]]);

  for (const rota of ['/', '/agenda', '/api/agenda', '/kanban', '/api/kanban', '/financeiro', '/financeiro/diagnostico', '/estudos', '/tempo', '/api/tempo', '/biblioteca', '/api/biblioteca', '/demandas', '/api/demandas', '/relatorios', '/api/relatorios?tipo=mes&ref=2026-02-15', '/orcamento', '/api/financeiro', '/api/estudos', '/static/shell.js'])
    assert.equal((await pedir(server, rota)).status, 200, rota);
  assert.equal((await pedir(server, '/naoexiste')).status, 404); // em breve: sem página vazia
  assert.equal((await pedir(server, '/api/nav', 'evil.example')).status, 421);
});

test('servidor: /api/fontes dá caminho, mtime e link do Obsidian', async (t) => {
  const cfg = { ...loadConfig(['--demo']), port: 0 };
  const { server } = criarServidor(cfg, areas);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());

  const fin = JSON.parse((await pedir(server, '/api/fontes/financeiro')).corpo);
  assert.deepEqual(fin.itens.map((i) => [i.caminho, i.tipo, i.existe]), [
    ['40-financeiro/panelas.md', 'arquivo', true],
    ['40-financeiro/movimentos.md', 'arquivo', true],
  ]);
  assert.match(fin.itens[0].mtime, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(fin.itens[0].link, 'obsidian://open?vault=vault-exemplo&file=40-financeiro%2Fpanelas');
  const kan = JSON.parse((await pedir(server, '/api/fontes/kanban')).corpo);
  assert.equal(kan.itens[0].caminho, '10-diario/kanban-2026-11.md');
  const est = JSON.parse((await pedir(server, '/api/fontes/estudos')).corpo);
  assert.deepEqual(est.itens.map((i) => i.tipo), ['pasta', 'pasta']);
  const home = JSON.parse((await pedir(server, '/api/fontes/home')).corpo);
  assert.equal(home.itens[0].tipo, 'vault');
  assert.equal((await pedir(server, '/api/fontes/nada')).status, 404);
});

test('servidor: ícones da aba na raiz, com o tipo certo e a CSP de sempre', async (t) => {
  const cfg = { ...loadConfig(['--demo']), port: 0 };
  const { server } = criarServidor(cfg, areas);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  const { port } = server.address();
  const pegar = (rota) => new Promise((ok, falha) => {
    http.get({ host: '127.0.0.1', port, path: rota }, (res) => {
      res.resume();
      res.on('end', () => ok({ status: res.statusCode, tipo: res.headers['content-type'], csp: res.headers['content-security-policy'] }));
    }).on('error', falha);
  });
  for (const [rota, tipo] of [['/favicon.svg', 'image/svg+xml'], ['/favicon-demo.svg', 'image/svg+xml'], ['/favicon-32.png', 'image/png'], ['/apple-touch-icon.png', 'image/png']]) {
    const r = await pegar(rota);
    assert.equal(r.status, 200, rota);
    assert.equal(r.tipo, tipo, rota);
    assert.ok(r.csp.startsWith("default-src 'self';"), rota);
  }
});
