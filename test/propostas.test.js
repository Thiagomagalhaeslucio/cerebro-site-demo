'use strict';

// Propostas: leitura do perfil, do modelo e dos parâmetros, com o vault de
// exemplo (valores inventados) e vaults temporários.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lerPropostas, lerPerfil, lerModelo, limparModelo, ARQUIVO_PERFIL, ARQUIVO_MODELO } = require('../src/areas/propostas/data');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');

function vaultCom(arquivos) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-'));
  for (const [rel, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(v, rel)), { recursive: true });
    fs.writeFileSync(path.join(v, rel), texto);
  }
  return v;
}

test('perfil: tabela chave/valor; "a definir" vira vazio, mas só obrigatório gera "Perfil incompleto"', () => {
  const p = lerPerfil(VAULT);
  assert.equal(p.arquivo, '70-negocio/perfil.md');
  assert.equal(p.campos.nome, 'Marina Exemplo da Silva');
  assert.equal(p.campos.nome_comercial, 'Estúdio Exemplo');
  assert.equal(p.campos.email, 'contato@exemplo.test');
  assert.equal(p.campos.site, 'https://exemplo.test');
  assert.deepEqual(p.avisos, []);
  const v = vaultCom({ [ARQUIVO_PERFIL]: fs.readFileSync(path.join(VAULT, ARQUIVO_PERFIL), 'utf8').replace('| nome_comercial | Estúdio Exemplo |', '| nome_comercial | a definir |').replace('https://exemplo.test', '_a definir_').replace('contato@exemplo.test', 'A definir') });
  const q = lerPerfil(v);
  assert.deepEqual([q.campos.nome_comercial, q.campos.site], ['', '']); // opcionais a definir não geram aviso
  assert.deepEqual(q.avisos, ['Perfil incompleto: email está a definir em 70-negocio/perfil.md.']);
});

test('perfil: colunas pelo nome (ordem livre, extras ignoradas), vários campos a definir', () => {
  const v = vaultCom({ [ARQUIVO_PERFIL]: '| descrição | valor | chave |\n| --- | --- | --- |\n| x | A definir | email |\n| y |  | whatsapp |\n| z | `abc` | nome |\n' });
  const p = lerPerfil(v);
  assert.deepEqual(p.campos, { email: '', whatsapp: '', nome: 'abc' });
  assert.equal(p.avisos.length, 1);
  assert.match(p.avisos[0], /^Perfil incompleto: email, whatsapp, cidade_uf estão a definir/);
});

test('perfil: arquivo inexistente ou sem tabela é "Perfil incompleto", não erro', () => {
  const sem = lerPerfil(vaultCom({}));
  assert.equal(sem.existe, false);
  assert.match(sem.avisos[0], /^Perfil incompleto: .*não existe/);
  const semTabela = lerPerfil(vaultCom({ [ARQUIVO_PERFIL]: '# Perfil\n\nSó texto.\n' }));
  assert.deepEqual(semTabela.campos, {});
  assert.match(semTabela.avisos[0], /^Perfil incompleto: tabela/);
});

test('modelo: tira frontmatter, citações e linhas "---"; mantém os {{campos}}', () => {
  const m = lerModelo(VAULT);
  assert.equal(m.arquivo, '70-negocio/modelos/proposta.md');
  assert.ok(m.texto.startsWith('# Proposta: {{projeto}}'));
  assert.ok(!m.texto.includes('Texto de exemplo'));
  assert.ok(!/^---$/m.test(m.texto));
  assert.ok(m.texto.includes('Valor total: **{{valor_total}}**'));
  assert.ok(m.texto.includes('  atrasos deslocam a entrega.'));
  assert.deepEqual(m.avisos, []);
  assert.equal(limparModelo('---\ntags: [a]\n---\n\n> nota\n\n---\n# T\n\ncorpo\n'), '# T\n\ncorpo');
});

test('modelo: ausente ou vazio avisa', () => {
  const sem = lerModelo(vaultCom({}));
  assert.equal(sem.existe, false);
  assert.equal(sem.texto, '');
  assert.ok(sem.avisos[0].includes(ARQUIVO_MODELO));
  assert.ok(lerModelo(vaultCom({ [ARQUIVO_MODELO]: '> só nota\n' })).avisos[0].includes('vazio'));
});

test('propostas: junta perfil, modelo e os parâmetros (calculadora + proposta)', () => {
  const d = lerPropostas(VAULT);
  const v = (k) => d.parametros[k].valor;
  assert.deepEqual([v('entrada'), v('revisoes_incluidas'), v('revisao_extra_horas'), v('garantia_dias')], [0.4, 2, 3, 45]);
  assert.deepEqual([v('validade_proposta_dias'), v('prazo_resposta_cliente_dias'), v('valor_hora')], [15, 3, 50]);
  assert.equal(d.tipos.length, 3);
  assert.equal(d.complexidade.length, 3);
  assert.equal(d.perfil.campos.email, 'contato@exemplo.test');
  assert.ok(d.modelo.texto.includes('{{cliente}}'));
  assert.ok(!d.avisos.some((a) => a.startsWith('Perfil incompleto'))); // site opcional
});

test('propostas: parâmetro da proposta ausente vira aviso e null, nunca número', () => {
  const v = vaultCom({
    '70-negocio/precificacao.md': '## Parâmetros\n\n| chave | valor |\n| --- | --- |\n| valor_hora | 50 |\n| garantia_dias | a definir |\n',
  });
  const d = lerPropostas(v);
  assert.equal(d.parametros.validade_proposta_dias.valor, null);
  assert.equal(d.parametros.garantia_dias.valor, null);
  assert.equal(d.avisos.filter((a) => a.includes('validade_proposta_dias')).length, 1);
  assert.equal(d.avisos.filter((a) => a.includes('garantia_dias')).length, 1);
});

// ---------- área registrada: API, origem, menu e módulos servidos ----------
const http = require('node:http');
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

test('servidor: /api/propostas, origem, página e módulos servidos ao navegador', async (t) => {
  const { server } = criarServidor({ ...loadConfig(['--demo']), port: 0 }, areas);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());

  const api = JSON.parse((await pedir(server, '/api/propostas')).corpo);
  assert.equal(api.hoje, '2026-03-10'); // data fixa da demonstração
  assert.equal(api.parametros.validade_proposta_dias.valor, 15);
  assert.equal(api.perfil.campos.nome_comercial, 'Estúdio Exemplo');
  assert.ok(api.modelo.texto.includes('{{valor_total}}'));

  const fontes = JSON.parse((await pedir(server, '/api/fontes/propostas')).corpo);
  assert.deepEqual(fontes.itens.map((i) => [i.caminho, i.existe]), [
    ['70-negocio/modelos/proposta.md', true], ['70-negocio/perfil.md', true], ['70-negocio/precificacao.md', true],
  ]);
  assert.ok(fontes.itens[0].link.startsWith('obsidian://open?vault='));

  assert.equal((await pedir(server, '/propostas')).status, 200);
  for (const arq of ['documentos/modelo.js', 'documentos/pagina.js', 'propostas/documento.js', 'propostas/fragmento.js', 'propostas/app.js', 'orcamento/formula.js', 'documento.css', 'propostas.css', 'formulario.css']) {
    assert.equal((await pedir(server, `/static/${arq}`)).status, 200, arq);
  }
  // a fórmula do navegador é o mesmo arquivo que o teste usa: não há cópia
  assert.ok((await pedir(server, '/propostas')).corpo.includes('/static/orcamento/formula.js'));
  assert.ok(!fs.existsSync(path.join(__dirname, '..', 'public', 'propostas', 'formula.js')));
});

test('menu: Propostas ativo no grupo Trabalho', () => {
  const nav = montarNav(loadNav(), areas);
  const trabalho = nav.grupos.find((g) => g.nome === 'Trabalho');
  const item = trabalho.itens.find((i) => i.id === 'propostas');
  assert.deepEqual([item.estado, item.rota], ['ativo', '/propostas']);
  assert.deepEqual(nav.avisos, []);
});

test('a página não escreve: sem localStorage nem innerHTML', () => {
  for (const arq of ['propostas/app.js', 'propostas/documento.js', 'propostas/fragmento.js', 'documentos/modelo.js', 'documentos/pagina.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'public', arq), 'utf8');
    assert.ok(!/localStorage|sessionStorage|innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src), arq);
  }
});
