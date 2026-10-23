'use strict';

// Vault de exemplo (20-biblioteca com idiomas/ e redes/) e vaults temporários.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readBiblioteca, tituloDe } = require('../src/areas/biblioteca/data');
const biblioteca = require('../src/areas/biblioteca');
const areas = require('../src/areas');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');

function vaultCom(t, arquivos) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-biblioteca-'));
  t.after(() => fs.rmSync(v, { recursive: true, force: true }));
  for (const [rel, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(v, '20-biblioteca', rel)), { recursive: true });
    fs.writeFileSync(path.join(v, '20-biblioteca', rel), texto);
  }
  return v;
}

test('exemplo: contagens, pastas e status', () => {
  const d = readBiblioteca(VAULT);
  assert.equal(d.existe, true);
  assert.deepEqual(d.avisos, []);
  assert.deepEqual(d.resumo, { total: 5, revisaoPendente: 3, semStatus: 0, livros: 0 });
  assert.deepEqual(d.pastas, [{ nome: 'idiomas', total: 2 }, { nome: 'redes', total: 3 }]);
  assert.deepEqual(d.status.map((s) => s.nome), ['completo', 'revisão-pendente', 'revisão-pendente-parcial']);
});

test('ordem: revisão pendente primeiro, depois a data mais nova', () => {
  const d = readBiblioteca(VAULT);
  const pend = d.notas.filter((n) => n.status === 'revisão-pendente');
  assert.deepEqual(d.notas.slice(0, pend.length).map((n) => n.arquivo), pend.map((n) => n.arquivo));
  const datas = pend.map((n) => n.data);
  assert.deepEqual(datas, [...datas].sort().reverse());
});

test('título: primeiro "# ..." fora de código; senão módulo; senão o nome do arquivo', (t) => {
  assert.equal(tituloDe('texto\n```\n# comentário\n```\n# 📘 Título real\n'), 'Título real');
  assert.equal(tituloDe('sem título\n'), null);
  const v = vaultCom(t, {
    'a/um.md': '---\nmodulo: "Módulo Um"\n---\n\nsó texto\n',
    'a/dois.md': 'sem frontmatter nem título\n',
  });
  const d = readBiblioteca(v);
  assert.deepEqual(d.notas.map((n) => n.titulo).sort(), ['Módulo Um', 'dois']);
  assert.equal(d.resumo.semStatus, 2);
});

test('nota na raiz vai para "(raiz)"; frontmatter sem fechamento e data ruim viram aviso', (t) => {
  const v = vaultCom(t, {
    'solta.md': '---\nstatus: completo\ndata: 2026-02-30x\n---\n\n# Solta\n',
    'x/aberto.md': '---\nstatus: completo\n\n# Sem fechar\n',
  });
  const d = readBiblioteca(v);
  assert.ok(d.notas.some((n) => n.pasta === '(raiz)' && n.data === null));
  assert.equal(d.avisos.length, 2);
  assert.ok(d.avisos.some((a) => /sem o "---" de fechamento/.test(a)));
  assert.ok(d.avisos.some((a) => /fora do formato/.test(a)));
});

test('sem a pasta: existe=false e aviso', (t) => {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-sem-biblioteca-'));
  t.after(() => fs.rmSync(v, { recursive: true, force: true }));
  const d = readBiblioteca(v);
  assert.equal(d.existe, false);
  assert.match(d.avisos[0], /20-biblioteca\/ não encontrada/);
});

test('o link abre no Obsidian pelo vault e pelo caminho sem .md', () => {
  const n = readBiblioteca(VAULT).notas.find((x) => x.nome === 'sub-redes');
  assert.equal(n.link, 'obsidian://open?vault=vault-exemplo&file=20-biblioteca%2Fredes%2Fsub-redes');
});

test('área: contrato e registro (sem cartão na Home: as revisões já estão em Estudos)', () => {
  assert.equal(biblioteca.id, 'biblioteca');
  assert.deepEqual(biblioteca.watch, ['20-biblioteca']);
  assert.ok(areas.includes(biblioteca));
  assert.equal(biblioteca.resumo, undefined);
  assert.deepEqual(biblioteca.api[''](VAULT), readBiblioteca(VAULT));
});

const LIVROS = path.join(__dirname, 'fixtures', 'livros-exemplo');

test('livros de outra pasta: só notas com a tag e o título; ordenados; sem capa', () => {
  const d = readBiblioteca(VAULT, { livros: { pasta: LIVROS } });
  assert.deepEqual(d.avisos, []);
  assert.equal(d.resumo.livros, 3);
  assert.deepEqual(d.livros.map((l) => l.titulo), ['Antologia de contos', 'O livro de exemplo', 'Redes para quem tem pressa']);
  const l = d.livros.find((x) => x.titulo === 'O livro de exemplo');
  assert.deepEqual([l.autor, l.paginas, l.ano, l.categoria, l.editora, l.tipo], ['Autora Exemplo', 320, 2015, 'Computers', 'Editora Teste', 'livro']);
  assert.ok(!JSON.stringify(d.livros).includes('capa.jpg'), 'o link da capa não segue para a página');
  assert.equal(l.link, 'obsidian://open?vault=livros-exemplo&file=O%20livro%20de%20exemplo%20-%20Autora%20Exemplo');
  assert.equal(readBiblioteca(VAULT).livros.length, 0, 'sem a opção, sem livros');
});

test('pasta de livros inexistente vira aviso e as notas seguem', () => {
  const d = readBiblioteca(VAULT, { livros: { pasta: path.join(LIVROS, 'nao-existe') } });
  assert.equal(d.livros.length, 0);
  assert.equal(d.resumo.total, 5);
  assert.match(d.avisos[0], /não encontrada/);
});

test('API: na demo usa demo.livros; fora dela, a configuração (vazia nos testes)', () => {
  assert.equal(biblioteca.api[''](VAULT, { demo: true }).livros.length, 3);
  assert.equal(biblioteca.api[''](VAULT, { demo: false }).livros.length, 0);
});

test('capa: só aparece se o arquivo foi baixado; o endereço de origem só sai se pedirem', (t) => {
  const capas = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-capas-'));
  t.after(() => fs.rmSync(capas, { recursive: true, force: true }));
  const livros = { pasta: LIVROS };
  const sem = readBiblioteca(VAULT, { livros, capasDir: capas });
  assert.ok(sem.livros.every((l) => l.capa === null && !('capaFonte' in l)));
  const alvo = sem.livros[0];
  assert.match(alvo.id, /^[0-9a-f]{12}$/);
  fs.writeFileSync(path.join(capas, `${alvo.id}.jpg`), 'x');
  const com = readBiblioteca(VAULT, { livros, capasDir: capas });
  assert.equal(com.livros[0].capa, `/capas/${alvo.id}.jpg`);
  assert.ok(com.livros.slice(1).every((l) => l.capa === null));
  const fonte = readBiblioteca(VAULT, { livros, capasDir: capas, comFonteDaCapa: true });
  assert.ok(fonte.livros.every((l) => l.capaFonte === 'http://exemplo.invalid/capa.jpg'));
});

test('servidor: /capas só serve id de 12 hex que existe; o resto é 404', async (t) => {
  const http = require('node:http');
  const { criarServidor } = require('../src/app');
  const { loadConfig } = require('../src/config');
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-site-capas-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  fs.mkdirSync(path.join(raiz, 'public'));
  fs.mkdirSync(path.join(raiz, 'capas'));
  fs.writeFileSync(path.join(raiz, 'capas', 'abcdef012345.jpg'), Buffer.from([0xff, 0xd8, 0xff]));
  fs.writeFileSync(path.join(raiz, 'segredo.txt'), 'não pode sair');
  const server = criarServidor({ ...loadConfig(['--demo']), publicDir: path.join(raiz, 'public') }, areas).server;
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  const pedir = (rota) => new Promise((ok, falha) => {
    const { port } = server.address();
    http.get({ host: '127.0.0.1', port, path: rota, headers: { Host: `127.0.0.1:${port}` } }, (res) => {
      res.resume();
      res.on('end', () => ok({ status: res.statusCode, tipo: res.headers['content-type'] }));
    }).on('error', falha);
  });
  assert.deepEqual(await pedir('/capas/abcdef012345.jpg'), { status: 200, tipo: 'image/jpeg' });
  assert.equal((await pedir('/capas/000000000000.jpg')).status, 404);
  for (const ruim of ['/capas/../segredo.txt', '/capas/abcdef012345.png', '/capas/ABCDEF012345.jpg', '/capas/abc.jpg', '/capas/%2e%2e%2fsegredo.txt']) {
    assert.notEqual((await pedir(ruim)).status, 200, ruim);
  }
});
