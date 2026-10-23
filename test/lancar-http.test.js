'use strict';

// Gravação: HTTP (token, origem, versão, duplicado, demo, desfazer) e escrita atômica.
// Tudo roda sobre uma CÓPIA temporária do vault de exemplo; a fixture original nunca é escrita.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { criarServidor } = require('../src/app');
const areas = require('../src/areas');
const lancarIo = require('../src/areas/financeiro/lancar-io');

const FIXTURE = path.join(__dirname, 'fixtures', 'vault-exemplo');
const lerDir = (vault) => ['panelas.md', 'movimentos.md'].map((f) => fs.readFileSync(path.join(vault, '40-financeiro', f), 'utf8'));
const sha = (vault) => crypto.createHash('sha256').update(lerDir(vault).join('\0')).digest('hex');
const HASH_FIXTURE = sha(FIXTURE);

function copiaDoVault(t) {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-lancar-'));
  fs.cpSync(FIXTURE, vault, { recursive: true });
  t.after(() => fs.rmSync(vault, { recursive: true, force: true }));
  return vault;
}

async function subir(t, argv) {
  const cfg = { ...loadConfig(argv), port: 0 };
  const { server } = criarServidor(cfg, areas);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());
  return server;
}

// Pedido cru, para controlar cada cabeçalho. `mesmo` = cabeçalhos de uma página do próprio site.
function pedir(server, metodo, url, { corpo, headers = {}, host, pedacos = false } = {}) {
  const porta = server.address().port;
  const dados = corpo === undefined ? null : typeof corpo === 'string' ? corpo : JSON.stringify(corpo);
  return new Promise((ok, falha) => {
    const req = http.request({
      host: '127.0.0.1', port: porta, path: url, method: metodo,
      headers: { Host: host || `127.0.0.1:${porta}`, ...(dados !== null && !pedacos ? { 'Content-Length': Buffer.byteLength(dados) } : {}), ...headers },
    }, (res) => {
      let c = '';
      res.on('data', (d) => (c += d));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, texto: c, json: () => JSON.parse(c) }));
    });
    req.on('error', falha);
    if (dados !== null && pedacos) {
      for (let i = 0; i < dados.length; i += 512) req.write(dados.slice(i, i + 512)); // sem Content-Length
    } else if (dados !== null) req.write(dados);
    req.end();
  });
}

async function sessao(server) {
  const porta = server.address().port;
  const mesmo = { 'Sec-Fetch-Site': 'same-origin', Origin: `http://127.0.0.1:${porta}` };
  const r = await pedir(server, 'GET', '/api/sessao', { headers: mesmo });
  const token = r.json().token;
  const headers = { ...mesmo, 'X-Cerebro-Token': token, 'Content-Type': 'application/json' };
  return { token, mesmo, headers, post: (rota, corpo, extra = {}) => pedir(server, 'POST', `/api/financeiro/${rota}`, { corpo, headers: { ...headers, ...extra } }) };
}

const GASTO = { tipo: 'gasto', valor: '12,50', descricao: 'mercado', saiDe: 'vr', data: '2026-03-10' };

test('a fixture original continua intacta no fim (conferido no último teste)', () => {
  assert.equal(sha(FIXTURE), HASH_FIXTURE);
});

test('/api/sessao: dá o token à própria página e não a outro site', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const porta = server.address().port;
  const ok = await pedir(server, 'GET', '/api/sessao', { headers: { 'Sec-Fetch-Site': 'same-origin' } });
  assert.equal(ok.status, 200);
  assert.match(ok.json().token, /^[0-9a-f]{48}$/);
  assert.equal(ok.json().token, (await pedir(server, 'GET', '/api/sessao', { headers: { Origin: `http://127.0.0.1:${porta}` } })).json().token); // o mesmo na sessão
  assert.equal((await pedir(server, 'GET', '/api/sessao', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
  assert.equal((await pedir(server, 'GET', '/api/sessao', { headers: { Origin: 'http://evil.example' } })).status, 403);
  assert.equal((await pedir(server, 'GET', '/api/sessao', { host: 'evil.example' })).status, 421);
  assert.ok(!Object.keys(ok.headers).some((h) => h.startsWith('access-control-'))); // sem CORS
});

test('POST: sem token 403, token errado 403, origem errada 403, sem origem 403, host errado 421', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const antes = sha(vault);
  const sem = { ...s.headers };
  delete sem['X-Cerebro-Token'];
  const corpo = { operacao: GASTO };
  assert.equal((await pedir(server, 'POST', '/api/financeiro/previa', { corpo, headers: sem })).status, 403);
  assert.equal((await pedir(server, 'POST', '/api/financeiro/previa', { corpo, headers: { ...s.headers, 'X-Cerebro-Token': 'a'.repeat(48) } })).status, 403);
  assert.equal((await pedir(server, 'POST', '/api/financeiro/previa', { corpo, headers: { ...s.headers, 'X-Cerebro-Token': 'curto' } })).status, 403);
  assert.equal((await s.post('previa', corpo, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await s.post('previa', corpo, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await s.post('previa', corpo, { 'Sec-Fetch-Site': 'same-site' })).status, 403);
  const semOrigem = { ...s.headers };
  delete semOrigem.Origin;
  delete semOrigem['Sec-Fetch-Site'];
  assert.equal((await pedir(server, 'POST', '/api/financeiro/lancar', { corpo, headers: semOrigem })).status, 403);
  assert.equal((await pedir(server, 'POST', '/api/financeiro/lancar', { corpo, headers: s.headers, host: 'evil.example' })).status, 421);
  assert.equal(sha(vault), antes); // nada foi escrito
});

test('POST: tamanho, tipo, JSON e esquema do corpo', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const grande = { operacao: { ...GASTO, descricao: 'x'.repeat(5000) } };
  assert.equal((await s.post('previa', grande)).status, 413);
  // sem Content-Length verdadeiro também estoura (corpo enviado em pedaços)
  assert.equal((await pedir(server, 'POST', '/api/financeiro/previa', { corpo: JSON.stringify(grande), headers: s.headers, pedacos: true })).status, 413);
  assert.equal((await s.post('previa', '{quebrado')).status, 400);
  assert.equal((await s.post('previa', '[]')).status, 400);
  assert.equal((await s.post('previa', { operacao: GASTO, extra: 1 })).status, 400);
  assert.equal((await s.post('previa', {})).status, 400);
  assert.equal((await s.post('lancar', { operacao: GASTO })).status, 400); // falta a versão
  assert.equal((await s.post('lancar', { operacao: GASTO, versao: 'abc' })).status, 400);
  assert.equal((await s.post('previa', { operacao: GASTO }, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await pedir(server, 'PUT', '/api/financeiro/lancar', { corpo: {}, headers: s.headers })).status, 405);
  assert.equal((await s.post('naoexiste', { operacao: GASTO })).status, 405);
  assert.equal((await pedir(server, 'POST', '/api/estudos', { corpo: {}, headers: s.headers })).status, 405); // só o financeiro escreve
  assert.equal(sha(vault), HASH_FIXTURE);
});

test('prévia não grava; operação inválida volta com os erros', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const r = await s.post('previa', { operacao: GASTO });
  assert.equal(r.status, 200);
  const j = r.json();
  assert.equal(j.ok, true);
  assert.deepEqual(j.previa.saldos.map((x) => [x.id, x.antes, x.depois]), [['vr', 60, 47.5]]);
  assert.match(j.versao, /^[0-9a-f]{64}$/);
  assert.equal(sha(vault), HASH_FIXTURE);
  const ruim = (await s.post('previa', { operacao: { ...GASTO, valor: '0' } })).json();
  assert.equal(ruim.ok, false);
  assert.match(ruim.erros[0], /maior que zero/);
});

test('lançar grava os dois arquivos, e desfazer devolve os bytes de antes', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const [pAntes, mAntes] = lerDir(vault);
  const { versao } = (await s.post('previa', { operacao: GASTO })).json();

  const r = await s.post('lancar', { operacao: GASTO, versao });
  assert.equal(r.status, 200, r.texto);
  const j = r.json();
  assert.deepEqual([j.ok, j.gravado, j.podeDesfazer], [true, true, true]);
  const [pDepois, mDepois] = lerDir(vault);
  assert.ok(mDepois.includes('| 2026-03-10 | vr | saída | 12.50 | mercado |  |'));
  assert.ok(pDepois.includes('| VR | vr | 47.50 | |'));
  assert.ok(mDepois.startsWith(mAntes.trimEnd())); // o histórico antigo ficou como estava
  assert.notEqual(j.versao, versao);
  // nenhum temporário sobrou na pasta
  assert.deepEqual(fs.readdirSync(path.join(vault, '40-financeiro')).sort(), ['movimentos.md', 'panelas.md']);

  // a página vê que dá para desfazer
  const ctx = (await pedir(server, 'GET', '/api/financeiro/lancar')).json();
  assert.deepEqual([ctx.versao, ctx.desfazer.operacao], [j.versao, 'gasto']);

  const d = await s.post('desfazer', { versao: j.versao });
  assert.equal(d.status, 200, d.texto);
  assert.deepEqual(lerDir(vault), [pAntes, mAntes]); // byte a byte
  assert.equal(d.json().versao, versao);
  assert.equal((await s.post('desfazer', { versao })).status, 409); // só o último, uma vez
  assert.equal((await pedir(server, 'GET', '/api/financeiro/lancar')).json().desfazer, null);
});

test('reposição pela API: o contexto traz o id das pendências; marcar só uma quita só ela; desfazer volta byte a byte', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const gasto = (valor, descricao, data) => ({ tipo: 'gasto', valor, descricao, saiDe: 'conta', reporDe: 'pessoal', data });
  for (const g of [gasto('7,00', 'suco', '2026-03-06'), gasto('8,00', 'lanche natural', '2026-03-07'), gasto('12,00', 'lanche ensaio', '2026-03-08')]) {
    const v = (await s.post('previa', { operacao: g })).json().versao;
    const lr = await s.post('lancar', { operacao: { ...g, confirmar: true }, versao: v });
    assert.equal(lr.status, 200, lr.texto);
  }
  const ctx = (await pedir(server, 'GET', '/api/financeiro/lancar')).json();
  assert.deepEqual(ctx.pendentes.map((p) => [p.id, p.descricao, p.valor]), [[0, 'suco', 7], [1, 'lanche natural', 8], [2, 'lanche ensaio', 12]]);
  const [pAntes, mAntes] = lerDir(vault);

  const op = { tipo: 'reposicao', modo: 'quitar', panela: 'pessoal', valor: '12,00', pendencias: [{ id: 2, descricao: 'lanche ensaio', valor: '12,00' }], data: '2026-03-10' };
  const errada = await s.post('lancar', { operacao: { ...op, valor: '11,00' }, versao: ctx.versao });
  assert.equal(errada.status, 422, errada.texto);
  assert.deepEqual(lerDir(vault), [pAntes, mAntes]);
  const r = await s.post('lancar', { operacao: op, versao: ctx.versao });
  assert.equal(r.status, 200, r.texto);
  const [pDepois, mDepois] = lerDir(vault);
  assert.match(pDepois, /— lanche ensaio ✔ reposto \d{4}-\d{2}-\d{2}/);
  assert.ok(pDepois.includes('— 7.00 — suco\n') && pDepois.includes('— 8.00 — lanche natural\n'));
  assert.ok(mDepois.includes('| pessoal→conta | transferência | 12.00 | Reposição na conta (Pessoal / Lazer) | repõe lanche ensaio |'));
  assert.equal((await s.post('desfazer', { versao: r.json().versao })).status, 200);
  assert.deepEqual(lerDir(vault), [pAntes, mAntes]);
});

test('versão velha: 409 e nada é gravado', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const { versao } = (await s.post('previa', { operacao: GASTO })).json();
  // o Obsidian (ou a skill) muda um arquivo depois de a página ler
  const arq = path.join(vault, '40-financeiro', 'movimentos.md');
  fs.appendFileSync(arq, '| 2026-03-10 | vr | saída | 1.00 | outro | |\n');
  const editado = fs.readFileSync(arq, 'utf8');
  const r = await s.post('lancar', { operacao: GASTO, versao });
  assert.equal(r.status, 409);
  assert.equal(r.json().erro, 'versao');
  assert.match(r.json().mensagem, /Recarregue e refaça/);
  assert.equal(fs.readFileSync(arq, 'utf8'), editado);
});

test('payload idêntico em 30 s é recusado (duplo clique)', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const { versao } = (await s.post('previa', { operacao: GASTO })).json();
  assert.equal((await s.post('lancar', { operacao: GASTO, versao })).status, 200);
  const segundo = await s.post('lancar', { operacao: GASTO, versao });
  assert.equal(segundo.status, 409);
  assert.equal(segundo.json().erro, 'duplicado');
  assert.equal(lerDir(vault)[1].split('| 2026-03-10 | vr | saída | 12.50 | mercado |  |').length - 1, 1); // gravou uma vez só
});

test('anti-duplicado: passada a janela, o mesmo payload vale de novo', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-lancar-'));
  fs.cpSync(FIXTURE, vault, { recursive: true });
  try {
    let agora = 1_000_000;
    const ctx = { hoje: '2026-03-10', demo: false, estado: {}, agora: () => agora };
    const versao = lancarIo.versaoDe(lancarIo.lerTextos(vault));
    assert.equal(lancarIo.lancar(vault, ctx, { operacao: GASTO, versao }).status, 200);
    assert.equal(lancarIo.desfazer(vault, ctx, { versao: lancarIo.versaoDe(lancarIo.lerTextos(vault)) }).status, 200); // volta à mesma versão
    assert.throws(() => lancarIo.lancar(vault, ctx, { operacao: GASTO, versao }), (e) => e.status === 409 && e.corpo.erro === 'duplicado');
    agora += 31_000;
    assert.equal(lancarIo.lancar(vault, ctx, { operacao: GASTO, versao }).status, 200);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
});

test('avisos que exigem confirmação: 422 sem "confirmar", 200 com ele', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const neg = { ...GASTO, valor: '100' }; // o VR ficaria negativo
  const { versao } = (await s.post('previa', { operacao: neg })).json();
  const r = await s.post('lancar', { operacao: neg, versao });
  assert.equal(r.status, 422);
  assert.equal(r.json().erro, 'confirmacao');
  assert.equal(sha(vault), HASH_FIXTURE);
  assert.equal((await s.post('lancar', { operacao: { ...neg, confirmar: true }, versao })).status, 200);
  assert.ok(lerDir(vault)[0].includes('| VR | vr | -40.00 | |'));
});

test('operação inválida no lançar: 422 com os erros, nada gravado', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const { versao } = (await s.post('previa', { operacao: GASTO })).json();
  const r = await s.post('lancar', { operacao: { ...GASTO, data: '2999-01-01' }, versao });
  assert.equal(r.status, 422);
  assert.match(r.json().erros[0], /futura/);
  assert.equal(sha(vault), HASH_FIXTURE);
});

test('desfazer recusa se os arquivos mudaram depois do lançamento', async (t) => {
  const vault = copiaDoVault(t);
  const server = await subir(t, [`--vault=${vault}`]);
  const s = await sessao(server);
  const { versao } = (await s.post('previa', { operacao: GASTO })).json();
  const feito = (await s.post('lancar', { operacao: GASTO, versao })).json();
  const arq = path.join(vault, '40-financeiro', 'panelas.md');
  fs.appendFileSync(arq, '\nnota feita à mão\n');
  const editado = lerDir(vault);
  const r = await s.post('desfazer', { versao: feito.versao });
  assert.equal(r.status, 409);
  assert.equal(r.json().erro, 'versao');
  assert.deepEqual(lerDir(vault), editado);
});

test('demo: a prévia funciona; gravar e desfazer dão 403 com mensagem e não escrevem', async (t) => {
  const server = await subir(t, ['--demo']);
  const s = await sessao(server);
  const prev = await s.post('previa', { operacao: GASTO });
  assert.equal(prev.status, 200);
  assert.equal(prev.json().ok, true);
  const versao = prev.json().versao;
  for (const [rota, corpo] of [['lancar', { operacao: GASTO, versao }], ['desfazer', { versao }]]) {
    const r = await s.post(rota, corpo);
    assert.equal(r.status, 403, rota);
    assert.equal(r.json().erro, 'demo');
    assert.match(r.json().mensagem, /Modo demonstração/);
  }
  assert.equal(sha(FIXTURE), HASH_FIXTURE); // a fixture do demo nem foi tocada
  assert.equal((await pedir(server, 'GET', '/api/financeiro/lancar')).json().demo, true);
});

// ---------- escrita atômica (direto no módulo, com um fs que falha) ----------

function ctxFalho(fsx) {
  return { hoje: '2026-03-10', demo: false, estado: {}, fsx, agora: () => 1_000_000 };
}
const comCopia = (fn) => () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-lancar-'));
  fs.cpSync(FIXTURE, vault, { recursive: true });
  try {
    fn(vault);
  } finally {
    fs.rmSync(vault, { recursive: true, force: true });
  }
};

test('atômico: movimentos.md primeiro, panelas.md depois, ambos por rename', comCopia((vault) => {
  const chamadas = [];
  const fsx = { ...fs, renameSync: (de, para) => { chamadas.push(path.basename(para)); return fs.renameSync(de, para); } };
  const versao = lancarIo.versaoDe(lancarIo.lerTextos(vault));
  lancarIo.lancar(vault, ctxFalho(fsx), { operacao: GASTO, versao });
  assert.deepEqual(chamadas, ['movimentos.md', 'panelas.md']);
  assert.deepEqual(fs.readdirSync(path.join(vault, '40-financeiro')).sort(), ['movimentos.md', 'panelas.md']);
}));

test('atômico: se panelas.md falha, movimentos.md é restaurado e nada muda', comCopia((vault) => {
  const antes = lerDir(vault);
  const fsx = { ...fs, renameSync: (de, para) => { if (para.endsWith('panelas.md')) throw new Error('disco cheio'); return fs.renameSync(de, para); } };
  const versao = lancarIo.versaoDe(lancarIo.lerTextos(vault));
  assert.throws(() => lancarIo.lancar(vault, ctxFalho(fsx), { operacao: GASTO, versao }), (e) => e.status === 500 && /movimentos\.md foi restaurado/.test(e.corpo.mensagem) && /disco cheio/.test(e.corpo.mensagem));
  assert.deepEqual(lerDir(vault), antes);
  assert.deepEqual(fs.readdirSync(path.join(vault, '40-financeiro')).sort(), ['movimentos.md', 'panelas.md']); // sem temporários
}));

test('atômico: falha ao escrever o temporário não toca no arquivo nem deixa lixo', comCopia((vault) => {
  const antes = lerDir(vault);
  const fsx = { ...fs, writeSync: () => { throw new Error('sem espaço'); } };
  const versao = lancarIo.versaoDe(lancarIo.lerTextos(vault));
  assert.throws(() => lancarIo.lancar(vault, ctxFalho(fsx), { operacao: GASTO, versao }), /sem espaço/);
  assert.deepEqual(lerDir(vault), antes);
  assert.deepEqual(fs.readdirSync(path.join(vault, '40-financeiro')).sort(), ['movimentos.md', 'panelas.md']);
  // e a tentativa que falhou não conta como duplicado
  const ctx = ctxFalho(fs);
  ctx.estado = {};
  assert.equal(lancarIo.lancar(vault, ctx, { operacao: GASTO, versao }).status, 200);
}));

test('atômico: se nem a restauração funciona, a mensagem manda conferir à mão', comCopia((vault) => {
  let n = 0;
  const fsx = { ...fs, renameSync: (de, para) => { n++; if (n >= 2) throw new Error('somente leitura'); return fs.renameSync(de, para); } };
  const versao = lancarIo.versaoDe(lancarIo.lerTextos(vault));
  assert.throws(() => lancarIo.lancar(vault, ctxFalho(fsx), { operacao: GASTO, versao }), (e) => e.status === 500 && /Confira o arquivo à mão/.test(e.corpo.mensagem));
}));

test('a fixture original continua intacta depois de todos os testes de gravação', () => {
  assert.equal(sha(FIXTURE), HASH_FIXTURE);
});
