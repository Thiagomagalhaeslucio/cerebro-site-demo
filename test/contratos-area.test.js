'use strict';

// Contratos: a área registrada (API, origem, menu, página e módulos servidos ao navegador).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { criarServidor } = require('../src/app');
const { loadConfig, loadNav } = require('../src/config');
const { montarNav } = require('../src/nav');
const areas = require('../src/areas');

function pedir(server, rota) {
  const { port } = server.address();
  return new Promise((ok, falha) => {
    http.get({ host: '127.0.0.1', port, path: rota }, (res) => {
      let corpo = '';
      res.on('data', (c) => (corpo += c));
      res.on('end', () => ok({ status: res.statusCode, corpo, tipo: res.headers['content-type'] }));
    }).on('error', falha);
  });
}

test('servidor: /api/contratos, origem, página e módulos servidos ao navegador', async (t) => {
  const { server } = criarServidor({ ...loadConfig(['--demo']), port: 0 }, areas);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());

  const api = JSON.parse((await pedir(server, '/api/contratos')).corpo);
  assert.equal(api.hoje, '2026-03-10'); // data fixa da demonstração
  assert.ok(!('foro_padrao' in api)); // o foro padrão é a cidade_uf do perfil, no navegador
  assert.equal(api.perfil.campos.cidade_uf, 'Cidade Exemplo/EX');
  assert.equal(api.propostas.length, 1);
  assert.equal(api.perfil.campos.email, 'contato@exemplo.test');
  assert.deepEqual(api.avisos, []);
  assert.ok(api.modelo.texto.includes('{{contratante_nome}}'));
  // o que o contrato não usa não vai na API: nem piso, nem margem
  assert.ok(!('valor_hora_piso' in api.parametros) && !('margem_risco' in api.parametros));

  const fontes = JSON.parse((await pedir(server, '/api/fontes/contratos')).corpo);
  assert.deepEqual(fontes.itens.map((i) => [i.caminho, i.existe]), [
    ['70-negocio/modelos/contrato.md', true], ['70-negocio/perfil.md', true], ['70-negocio/precificacao.md', true], ['70-negocio/propostas/', true],
  ]);
  assert.ok(fontes.itens[0].link.startsWith('obsidian://open?vault='));

  assert.equal((await pedir(server, '/contratos')).status, 200);
  for (const arq of ['documentos/modelo.js', 'documentos/pagina.js', 'contratos/documento.js', 'contratos/app.js', 'documento.css', 'contratos.css', 'formulario.css']) {
    assert.equal((await pedir(server, `/static/${arq}`)).status, 200, arq);
  }
  assert.equal((await pedir(server, '/contratos')).corpo.includes('/static/documentos/modelo.js'), true); // o motor é o compartilhado
});

test('menu: Contratos ativo no grupo Trabalho', () => {
  const nav = montarNav(loadNav(), areas);
  const item = nav.grupos.find((g) => g.nome === 'Trabalho').itens.find((i) => i.id === 'contratos');
  assert.deepEqual([item.estado, item.rota], ['ativo', '/contratos']);
  assert.deepEqual(nav.avisos, []);
});

test('a página não grava nem leva dados das partes: sem armazenamento, sem URL, sem innerHTML', () => {
  for (const arq of ['contratos/app.js', 'contratos/documento.js', 'documentos/modelo.js', 'documentos/pagina.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', arq), 'utf8');
    assert.ok(!/localStorage|sessionStorage|indexedDB|document\.cookie|innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), arq);
    assert.ok(!/location\.(hash|search|href)|history\.(push|replace)State|sendBeacon|XMLHttpRequest/.test(src), arq);
  }
  // o único fetch é a leitura do vault; nenhuma escrita sai da página
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'contratos', 'app.js'), 'utf8');
  assert.deepEqual(app.match(/fetch\([^)]*\)/g), ["fetch('/api/contratos', { cache: 'no-store' })"]);
});

test('a página mostra o aviso fixo, fora do documento, e não tem campo de URL', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'contratos', 'index.html'), 'utf8');
  assert.ok(html.includes('Minuta gerada a partir de modelo. Não substitui revisão jurídica. Veja 70-negocio/notas-juridicas.md.'));
  assert.ok(html.indexOf('aviso-juridico') < html.indexOf('id="doc"')); // fora do <article class="doc">
  assert.ok(/id="minuta" checked/.test(html)); // a minuta vem marcada
  assert.ok(html.includes('Marque se houver cadastro, formulário de contato, login, pagamento ou qualquer dado de pessoas.')); // dica sob "trata dados pessoais"
  assert.ok(html.indexOf('id="trata_dados"') < html.indexOf('Marque se houver cadastro'));
  // foro: padrão do perfil; sem ele, campo vazio e aviso
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'contratos', 'app.js'), 'utf8');
  assert.ok(app.includes("poe('foro', perfil.cidade_uf)"));
  assert.ok(/id="foro-aviso"[^>]*>Informe o foro</.test(html));
  assert.ok(!('contratos' in require('../config.json'))); // sem foro padrão fixo na configuração
});
