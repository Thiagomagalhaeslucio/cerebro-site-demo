'use strict';

// Commit automático após lançar (D2) e Desfazer que sobrevive ao reinício (P2-5).
// Tudo sobre uma CÓPIA temporária do vault de exemplo, com um repositório git criado na hora.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../src/config');
const { criarServidor } = require('../src/app');
const areas = require('../src/areas');
const vaultGit = require('../src/areas/financeiro/vault-git');

const FIXTURE = path.join(__dirname, 'fixtures', 'vault-exemplo');
const git = (v, ...a) => execFileSync('git', a, { cwd: v, encoding: 'utf8' }).trim();
const arq = (v, f) => fs.readFileSync(path.join(v, '40-financeiro', f), 'utf8');
const GASTO = { tipo: 'gasto', valor: '12,50', descricao: 'mercado', saiDe: 'vr', data: '2026-03-10' };

function vaultComGit(t, { identidade = true } = {}) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-git-'));
  const estado = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-git-estado-'));
  t.after(() => { fs.rmSync(v, { recursive: true, force: true }); fs.rmSync(estado, { recursive: true, force: true }); });
  fs.cpSync(FIXTURE, v, { recursive: true });
  git(v, 'init', '-q', '-b', 'main');
  if (identidade) { git(v, 'config', 'user.name', 'Teste'); git(v, 'config', 'user.email', 'teste@example.invalid'); }
  git(v, 'config', 'commit.gpgsign', 'false');
  git(v, 'add', '-A');
  git(v, '-c', 'user.name=T', '-c', 'user.email=t@x.invalid', 'commit', '-q', '-m', 'base');
  return { v, estado };
}

// Sobe um servidor; chamar de novo com o mesmo estadoDir simula o reinício do serviço.
async function subir(t, v, estadoDir) {
  const cfg = { ...loadConfig([`--vault=${v}`]), port: 0, estadoDir };
  const { server } = criarServidor(cfg, areas);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const porta = server.address().port;
  const mesmo = { 'Sec-Fetch-Site': 'same-origin', Origin: `http://127.0.0.1:${porta}` };
  const pedir = (metodo, url, corpo, extra = {}) => new Promise((ok, falha) => {
    const dados = corpo === undefined ? null : JSON.stringify(corpo);
    const req = http.request({ host: '127.0.0.1', port: porta, path: url, method: metodo, headers: { Host: `127.0.0.1:${porta}`, ...mesmo, ...(dados ? { 'Content-Length': Buffer.byteLength(dados), 'Content-Type': 'application/json' } : {}), ...extra } }, (res) => {
      let c = '';
      res.on('data', (d) => (c += d));
      res.on('end', () => ok({ status: res.statusCode, json: () => JSON.parse(c) }));
    });
    req.on('error', falha);
    if (dados) req.write(dados);
    req.end();
  });
  const token = (await pedir('GET', '/api/sessao')).json().token;
  const h = { 'X-Cerebro-Token': token };
  return {
    fechar: () => new Promise((ok) => server.close(ok)),
    contexto: async () => (await pedir('GET', '/api/financeiro/lancar')).json(),
    lancar: async (operacao) => {
      const ctx = (await pedir('GET', '/api/financeiro/lancar')).json();
      return pedir('POST', '/api/financeiro/lancar', { operacao, versao: ctx.versao }, h);
    },
    desfazer: async () => {
      const ctx = (await pedir('GET', '/api/financeiro/lancar')).json();
      return pedir('POST', '/api/financeiro/desfazer', { versao: ctx.versao }, h);
    },
  };
}

test('lançar faz um commit só dos dois arquivos, sem push, e o git continua limpo', async (t) => {
  const { v, estado } = vaultComGit(t);
  const s = await subir(t, v, estado);
  t.after(() => s.fechar());
  fs.writeFileSync(path.join(v, 'outro-arquivo.md'), 'não commitado e fora do alvo\n');
  const r = await s.lancar(GASTO);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json().git, { commit: true, aviso: null });
  assert.equal(git(v, 'log', '-1', '--format=%s'), 'Lançamento pelo site: gasto (mercado)');
  assert.deepEqual(git(v, 'show', '--name-only', '--format=', 'HEAD').split('\n').sort(), ['40-financeiro/movimentos.md', '40-financeiro/panelas.md']);
  assert.equal(git(v, 'status', '--porcelain', '--', '40-financeiro'), '');
  assert.equal(git(v, 'status', '--porcelain'), '?? outro-arquivo.md', 'o resto do vault não foi tocado');
  assert.equal(git(v, 'remote'), '');
});

test('o que já estava sem commit nos dois arquivos ganha um commit à parte, antes do lançamento', async (t) => {
  const { v, estado } = vaultComGit(t);
  const s = await subir(t, v, estado);
  t.after(() => s.fechar());
  fs.appendFileSync(path.join(v, '40-financeiro', 'movimentos.md'), '| 2026-03-10 | vr | saída | 1.00 | feito à mão no terminal |  |\n');
  const r = await s.lancar(GASTO);
  assert.equal(r.status, 200);
  assert.deepEqual(git(v, 'log', '-3', '--format=%s').split('\n'), ['Lançamento pelo site: gasto (mercado)', 'Estado anterior ao lançamento pelo site', 'base']);
  assert.match(git(v, 'show', 'HEAD~1:40-financeiro/movimentos.md'), /feito à mão no terminal/);
  assert.doesNotMatch(git(v, 'show', 'HEAD~1:40-financeiro/movimentos.md'), /12\.50/, 'o lançamento (12,50) ainda não estava neste commit');
  assert.match(git(v, 'show', 'HEAD:40-financeiro/movimentos.md'), /12\.50/);
});

test('Desfazer volta o arquivo e o git, e continua valendo depois de reiniciar o site', async (t) => {
  const { v, estado } = vaultComGit(t);
  const antes = [arq(v, 'panelas.md'), arq(v, 'movimentos.md')];
  const s1 = await subir(t, v, estado);
  assert.equal((await s1.lancar(GASTO)).status, 200);
  await s1.fechar(); // reinício
  const s2 = await subir(t, v, estado);
  t.after(() => s2.fechar());
  assert.ok((await s2.contexto()).desfazer, 'a página ainda oferece o Desfazer depois de reiniciar');
  const r = await s2.desfazer();
  assert.equal(r.status, 200);
  assert.deepEqual([arq(v, 'panelas.md'), arq(v, 'movimentos.md')], antes);
  assert.equal(git(v, 'log', '-1', '--format=%s'), 'Desfaz lançamento do site: gasto (mercado)');
  assert.equal(git(v, 'status', '--porcelain', '--', '40-financeiro'), '');
  assert.equal((await s2.contexto()).desfazer, null);
  assert.equal((await s2.desfazer()).status, 409, 'só o último, uma vez');
  assert.deepEqual(fs.readdirSync(estado), [], 'o estado em disco some depois de desfeito');
});

test('depois de reiniciar, se os arquivos mudaram, o Desfazer recusa e nada é escrito', async (t) => {
  const { v, estado } = vaultComGit(t);
  const s1 = await subir(t, v, estado);
  assert.equal((await s1.lancar(GASTO)).status, 200);
  await s1.fechar();
  fs.appendFileSync(path.join(v, '40-financeiro', 'movimentos.md'), '| 2026-03-10 | vr | saída | 2.00 | mudou depois |  |\n');
  const s2 = await subir(t, v, estado);
  t.after(() => s2.fechar());
  const antes = arq(v, 'movimentos.md');
  assert.equal((await s2.contexto()).desfazer, null);
  assert.equal((await s2.desfazer()).status, 409);
  assert.equal(arq(v, 'movimentos.md'), antes);
});

test('sem git no vault (ou desligado): lança normalmente, sem commit; o estado em disco não guarda os textos', async (t) => {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-sem-git-'));
  const estado = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-sem-git-estado-'));
  t.after(() => { fs.rmSync(v, { recursive: true, force: true }); fs.rmSync(estado, { recursive: true, force: true }); });
  fs.cpSync(FIXTURE, v, { recursive: true });
  const s = await subir(t, v, estado);
  t.after(() => s.fechar());
  const r = await s.lancar(GASTO);
  assert.equal(r.status, 200);
  assert.equal(r.json().git, null);
  const arquivo = path.join(estado, fs.readdirSync(estado)[0]);
  const salvo = fs.readFileSync(arquivo, 'utf8');
  assert.doesNotMatch(salvo, /Saldos atuais|\| vr \|/, 'só quem é o lançamento, nunca o conteúdo dos arquivos');
  assert.equal(fs.statSync(arquivo).mode & 0o777, 0o600);
  assert.equal((await s.desfazer()).status, 200, 'sem reiniciar, o desfazer em memória segue valendo');
});

test('git sem identidade configurada: o site assina o commit; vault dentro de outro repositório não conta', async (t) => {
  const { v, estado } = vaultComGit(t, { identidade: false });
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-git-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const antigoHome = process.env.HOME;
  const antigoGlobal = process.env.GIT_CONFIG_GLOBAL;
  process.env.HOME = home; // sem ~/.gitconfig de ninguém
  process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  t.after(() => { process.env.HOME = antigoHome; if (antigoGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = antigoGlobal; });
  const s = await subir(t, v, estado);
  t.after(() => s.fechar());
  assert.equal((await s.lancar(GASTO)).status, 200);
  assert.equal(git(v, 'log', '-1', '--format=%an'), 'cerebro-site');
  // um diretório dentro do repositório, mas que não é a raiz dele
  const sub = path.join(v, 'subvault');
  fs.mkdirSync(sub);
  assert.equal(vaultGit.disponivel(sub), false);
  assert.equal(vaultGit.disponivel(v), true);
});
