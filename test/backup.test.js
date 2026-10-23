'use strict';

// Backup do vault (scripts/backup.js) e o aviso da Home. Tudo em pastas temporárias; o vault é cópia da fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { backup, listar, PADRAO } = require('../scripts/backup');
const { montarHome } = require('../src/home');

const FIXTURE = path.join(__dirname, 'fixtures', 'vault-exemplo');

function cenario(t) {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-backup-'));
  t.after(() => fs.rmSync(raiz, { recursive: true, force: true }));
  const vault = path.join(raiz, 'cerebro');
  fs.cpSync(FIXTURE, vault, { recursive: true });
  return { raiz, vault, destino: path.join(raiz, 'dest'), estadoDir: path.join(raiz, 'estado') };
}
const arvore = (dir) => {
  const h = crypto.createHash('sha256');
  const visitar = (d, rel) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) visitar(path.join(d, e.name), r); else h.update(r).update(fs.readFileSync(path.join(d, e.name)));
  } };
  visitar(dir, '');
  return h.digest('hex');
};

test('backup: gera .tar.zst legível que restaura o vault byte a byte, com permissão restrita', (t) => {
  const c = cenario(t);
  const [r] = backup({ vault: c.vault, destinos: [c.destino], manter: 5, agora: new Date(2026, 2, 10, 21, 30) });
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.arquivo, 'cerebro-2026-03-10-2130.tar.zst');
  assert.match(r.arquivo, PADRAO);
  const arq = path.join(c.destino, r.arquivo);
  assert.equal(fs.statSync(arq).mode & 0o777, 0o600);
  assert.equal(fs.statSync(c.destino).mode & 0o777, 0o700);
  assert.equal(listar(arq), r.arquivos);
  const out = path.join(c.raiz, 'restaurado');
  fs.mkdirSync(out);
  assert.equal(spawnSync('tar', ['--zstd', '-xf', arq, '-C', out]).status, 0);
  assert.equal(arvore(path.join(out, 'cerebro')), arvore(c.vault));
  assert.deepEqual(fs.readdirSync(c.destino).filter((f) => f.startsWith('.')), [], 'sem arquivo parcial sobrando');
});

test('retenção: guarda as N mais novas e só apaga arquivos do próprio padrão', (t) => {
  const c = cenario(t);
  fs.mkdirSync(c.destino);
  fs.writeFileSync(path.join(c.destino, 'foto-de-familia.jpg'), 'não é meu');
  for (let dia = 1; dia <= 4; dia++) backup({ vault: c.vault, destinos: [c.destino], manter: 2, agora: new Date(2026, 2, dia, 21, 30) });
  assert.deepEqual(fs.readdirSync(c.destino).sort(), ['cerebro-2026-03-03-2130.tar.zst', 'cerebro-2026-03-04-2130.tar.zst', 'foto-de-familia.jpg']);
});

test('destino em disco externo desmontado é pulado, sem criar a pasta; outro destino segue', (t) => {
  const c = cenario(t);
  const [fora, dentro] = backup({ vault: c.vault, destinos: ['/run/media/ninguem/DISCO-QUE-NAO-EXISTE/cerebro', c.destino], manter: 3, agora: new Date(2026, 2, 10, 21, 30) });
  assert.equal(fora.ok, false);
  assert.match(fora.motivo, /desmontado/);
  assert.equal(fs.existsSync('/run/media/ninguem'), false);
  assert.equal(dentro.ok, true);
});

test('estado do backup: grava quando e quantos destinos deram certo', (t) => {
  const c = cenario(t);
  backup({ vault: c.vault, destinos: [c.destino, '/mnt/inexistente-xyz/c'], manter: 3, agora: new Date(Date.UTC(2026, 2, 10, 12)), estadoDir: c.estadoDir });
  const e = JSON.parse(fs.readFileSync(path.join(c.estadoDir, 'backup.json'), 'utf8'));
  assert.deepEqual([e.quando, e.destinosOk, e.destinos], ['2026-03-10T12:00:00.000Z', 1, 2]);
  assert.equal(fs.statSync(path.join(c.estadoDir, 'backup.json')).mode & 0o777, 0o600);
});

test('com gpg: a cópia sai criptografada e só abre com a chave (chaveiro temporário)', (t) => {
  if (spawnSync('gpg', ['--version']).status !== 0) return t.skip('gpg não instalado');
  const c = cenario(t);
  const gnupg = fs.mkdtempSync(path.join('/tmp', 'g-')); // caminho curto: o socket do gpg tem limite de tamanho
  t.after(() => { spawnSync('gpgconf', ['--homedir', gnupg, '--kill', 'all']); fs.rmSync(gnupg, { recursive: true, force: true }); });
  fs.chmodSync(gnupg, 0o700);
  const antigo = process.env.GNUPGHOME;
  process.env.GNUPGHOME = gnupg;
  t.after(() => { if (antigo === undefined) delete process.env.GNUPGHOME; else process.env.GNUPGHOME = antigo; });
  const gen = spawnSync('gpg', ['--batch', '--passphrase', '', '--quick-generate-key', 'backup-teste@example.invalid', 'default', 'default', 'never'], { encoding: 'utf8' });
  if (gen.status !== 0) return t.skip(`não consegui criar chave de teste: ${gen.stderr.trim().split('\n')[0]}`);
  const [r] = backup({ vault: c.vault, destinos: [c.destino], manter: 3, gpg: 'backup-teste@example.invalid', agora: new Date(2026, 2, 10, 21, 30) });
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.arquivo, 'cerebro-2026-03-10-2130.tar.zst.gpg');
  assert.equal(r.criptografado, true);
  const bruto = fs.readFileSync(path.join(c.destino, r.arquivo));
  assert.ok(!bruto.includes(Buffer.from('Panelas')), 'o texto do vault não aparece em claro');
  assert.equal(listar(path.join(c.destino, r.arquivo)), r.arquivos);
});

test('Home: avisa quando nunca houve backup, quando falhou e quando está atrasado; some quando está em dia', (t) => {
  const c = cenario(t);
  const home = (extra = {}) => montarHome([], c.vault, { hoje: '2026-03-10', demo: false, estadoDir: c.estadoDir, ...extra }).avisos;
  assert.match(home().join(' '), /ainda não há registro/);
  fs.mkdirSync(c.estadoDir);
  const grava = (o) => fs.writeFileSync(path.join(c.estadoDir, 'backup.json'), JSON.stringify(o));
  grava({ quando: '2026-03-10T09:00:00.000Z', destinosOk: 0, destinos: 1 });
  assert.match(home().join(' '), /não conseguiu gravar em nenhum destino/);
  grava({ quando: '2026-03-06T09:00:00.000Z', destinosOk: 1, destinos: 1 });
  assert.match(home().join(' '), /atrasado: a última cópia foi há 4 dias/);
  grava({ quando: '2026-03-09T09:00:00.000Z', destinosOk: 1, destinos: 1 });
  assert.deepEqual(home(), []);
  assert.deepEqual(home({ demo: true }), [], 'na demo não avisa');
  assert.deepEqual(home({ estadoDir: null }), [], 'sem estadoDir (testes) não avisa');
});
