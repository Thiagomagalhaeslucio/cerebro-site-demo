'use strict';

// Backup do vault: um arquivo .tar.zst datado por destino, com retenção. É local e sem rede.
//   node scripts/backup.js [--vault=<pasta>] [--destino=<pasta>] [--verificar=<arquivo>]
// Destinos e retenção vêm de config.json → backup (o seu, com disco externo, em config.local.json):
//   destinos: pastas (criadas se faltarem); em /run/media, /media e /mnt, disco desmontado é pulado, nunca criado
//   manter:   quantas cópias guardar em cada destino
//   gpg:      (opcional) id ou e-mail de uma chave pública do seu chaveiro; as cópias saem criptografadas (.gpg)
//   nuvem:    (opcional, exige gpg) { pasta, remoto, manter }: espelho das últimas cópias .gpg num repositório git
//             PRIVADO (ex.: GitHub, grátis). Cada envio recria um commit único e força o push, para o repositório
//             não crescer; nada sai sem criptografia, e remoto público do GitHub é recusado.
// Imprime só nomes, tamanhos e contagens. Escreve apenas nos destinos e em estadoDir/backup.json.
// Sai com código 1 se nenhum destino recebeu a cópia.

const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadSiteConfig, loadConfig } = require('../src/config');

const EM_MONTAGEM = /^\/(run\/media|media|mnt)\//;
const PADRAO = /^cerebro-\d{4}-\d{2}-\d{2}-\d{4}\.tar\.zst(\.gpg)?$/;
const expandir = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const dois = (n) => String(n).padStart(2, '0');
const carimbo = (d) => `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}-${dois(d.getHours())}${dois(d.getMinutes())}`;

function contarArquivos(pasta) {
  let n = 0;
  const visitar = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (e.isDirectory()) visitar(path.join(dir, e.name)); else n++; } };
  visitar(pasta);
  return n;
}

// Lista o conteúdo do arquivo (descriptografando se for .gpg) e conta só os arquivos, não as pastas.
function listar(arquivo) {
  const tarArgs = ['--zstd', '-tf', arquivo.endsWith('.gpg') ? '-' : arquivo];
  const r = arquivo.endsWith('.gpg')
    ? spawnSync('sh', ['-c', 'gpg --batch --quiet --decrypt "$1" | tar --zstd -tf -', 'sh', arquivo], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    : spawnSync('tar', tarArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`não consegui ler a cópia (${String(r.stderr).trim().split('\n')[0]})`);
  return r.stdout.split('\n').filter((l) => l && !l.endsWith('/')).length;
}

function copiar(vault, destino, { gpg, manter, agora }) {
  const dir = path.resolve(expandir(destino));
  if (!fs.existsSync(dir)) {
    // Em /run/media, /media e /mnt a pasta de cima é o ponto de montagem: se ela não existe, o disco está desmontado
    // e criar a pasta gravaria no disco do sistema por engano. Em qualquer outro lugar, cria.
    if (EM_MONTAGEM.test(dir) && !fs.existsSync(path.dirname(dir))) return { destino: dir, ok: false, motivo: 'disco externo desmontado' };
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const nome = `cerebro-${carimbo(agora)}.tar.zst`;
  const tmp = path.join(dir, `.${nome}.parcial`);
  const final = path.join(dir, gpg ? `${nome}.gpg` : nome);
  try {
    const tar = ['--zstd', '-cf', gpg ? '-' : tmp, '-C', path.dirname(vault), path.basename(vault)];
    if (gpg) {
      const r = spawnSync('sh', ['-c', 'tar "$@" | gpg --batch --yes --trust-model always -r "$GPG_ALVO" -o "$SAIDA" --encrypt', 'sh', ...tar], { env: { ...process.env, GPG_ALVO: gpg, SAIDA: tmp }, encoding: 'utf8' });
      if (r.status !== 0) throw new Error(`gpg/tar falhou (${String(r.stderr).trim().split('\n')[0]})`);
    } else {
      execFileSync('tar', tar, { stdio: ['ignore', 'ignore', 'pipe'] });
    }
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, final);
    const arquivos = listar(final);
    const esperados = contarArquivos(vault);
    if (arquivos !== esperados) throw new Error(`a cópia tem ${arquivos} arquivos e o vault ${esperados}`);
    // retenção: só arquivos com o nosso padrão de nome, os mais antigos primeiro
    const todos = fs.readdirSync(dir).filter((f) => PADRAO.test(f)).sort();
    for (const velho of todos.slice(0, Math.max(0, todos.length - manter))) fs.rmSync(path.join(dir, velho));
    return { destino: dir, ok: true, arquivo: path.basename(final), bytes: fs.statSync(final).size, arquivos, guardadas: Math.min(todos.length, manter), criptografado: !!gpg };
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    return { destino: dir, ok: false, motivo: e.message };
  }
}

function backup({ vault, destinos, manter, gpg, agora = new Date(), estadoDir = null }) {
  const resultados = destinos.map((d) => copiar(vault, d, { gpg, manter, agora }));
  if (estadoDir) {
    try {
      fs.mkdirSync(estadoDir, { recursive: true, mode: 0o700 });
      const ok = resultados.filter((r) => r.ok);
      fs.writeFileSync(path.join(estadoDir, 'backup.json'), JSON.stringify({ quando: agora.toISOString(), destinosOk: ok.length, destinos: resultados.length }), { mode: 0o600 });
    } catch { /* sem estado: o aviso da Home só não sabe do backup */ }
  }
  return resultados;
}

// ---------- espelho fora da máquina (repositório git privado) ----------

const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();

// Remoto do GitHub precisa ser privado (conferido pelo `gh`); outro tipo de remoto (caminho local, servidor próprio) passa.
function remotoPrivado(remoto) {
  const m = /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(remoto);
  if (!m) return true;
  const r = spawnSync('gh', ['repo', 'view', m[1], '--json', 'isPrivate', '-q', '.isPrivate'], { encoding: 'utf8' });
  return r.status === 0 && r.stdout.trim() === 'true';
}

function espelhar({ origem, nuvem, gpg }) {
  if (!gpg) return { ok: false, motivo: 'a nuvem exige backup.gpg (nada sai sem criptografia)' };
  if (!nuvem?.pasta || !nuvem?.remoto) return { ok: false, motivo: 'faltam backup.nuvem.pasta e backup.nuvem.remoto' };
  if (!remotoPrivado(nuvem.remoto)) return { ok: false, motivo: 'o repositório remoto não é privado (ou não consegui conferir); nada foi enviado' };
  const dir = path.resolve(expandir(nuvem.pasta));
  const manter = Number.isInteger(nuvem.manter) && nuvem.manter > 0 ? nuvem.manter : 7;
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const copias = fs.readdirSync(path.resolve(expandir(origem))).filter((f) => PADRAO.test(f) && f.endsWith('.gpg')).sort().slice(-manter);
    if (!copias.length) return { ok: false, motivo: 'não há cópia .gpg em ' + origem };
    if (!fs.existsSync(path.join(dir, '.git'))) git(dir, ['init', '-q', '-b', 'main']);
    // Recria o conteúdo: só as últimas cópias, num commit único sem pai.
    for (const f of fs.readdirSync(dir)) if (f !== '.git') fs.rmSync(path.join(dir, f), { recursive: true, force: true });
    for (const f of copias) fs.copyFileSync(path.join(path.resolve(expandir(origem)), f), path.join(dir, f));
    fs.writeFileSync(path.join(dir, 'LEIA-ME.txt'), 'Cópias criptografadas (gpg) do vault. Sem a chave privada, não abrem. Restaurar: gpg --decrypt ARQUIVO | tar --zstd -xf -\n');
    git(dir, ['checkout', '-q', '--orphan', 'espelho-novo']);
    git(dir, ['add', '-A']);
    git(dir, ['-c', 'user.name=cerebro-site', '-c', 'user.email=cerebro-site@localhost', 'commit', '-q', '-m', `Cópias criptografadas até ${copias[copias.length - 1]}`]);
    try { git(dir, ['branch', '-D', 'main']); } catch { /* primeira vez */ }
    git(dir, ['branch', '-m', 'main']);
    try { git(dir, ['remote', 'remove', 'origin']); } catch { /* ainda não havia */ }
    git(dir, ['remote', 'add', 'origin', nuvem.remoto]);
    git(dir, ['push', '-q', '--force', 'origin', 'main']);
    return { ok: true, copias: copias.length };
  } catch (e) {
    return { ok: false, motivo: String(e.stderr || e.message).trim().split('\n')[0].slice(0, 200) };
  }
}

function main() {
  const arg = (nome) => (process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`)) || '').slice(nome.length + 3) || null;
  const verificar = arg('verificar');
  if (verificar) {
    console.log(`${path.basename(verificar)}: ${listar(path.resolve(expandir(verificar)))} arquivos legíveis.`);
    return;
  }
  const cfgSite = loadSiteConfig().backup ?? {};
  const cfg = loadConfig([`--vault=${arg('vault') || ''}`].filter((a) => a !== '--vault='));
  const destinos = arg('destino') ? [arg('destino')] : cfgSite.destinos ?? [];
  if (!destinos.length) { console.error('Nenhum destino: configure backup.destinos em config.json ou config.local.json.'); process.exit(1); }
  const manter = Number.isInteger(cfgSite.manter) && cfgSite.manter > 0 ? cfgSite.manter : 30;
  const resultados = backup({ vault: cfg.vault, destinos, manter, gpg: cfgSite.gpg || null, estadoDir: cfg.estadoDir });
  for (const r of resultados) {
    console.log(r.ok ? `ok   ${r.destino}: ${r.arquivo} (${(r.bytes / 1024).toFixed(0)} KB, ${r.arquivos} arquivos${r.criptografado ? ', criptografado' : ''}; guardadas: ${r.guardadas})` : `FALHOU ${r.destino}: ${r.motivo}`);
  }
  let nuvemFalhou = false;
  if (cfgSite.nuvem) {
    const base = resultados.find((r) => r.ok);
    const e = base ? espelhar({ origem: base.destino, nuvem: cfgSite.nuvem, gpg: cfgSite.gpg || null }) : { ok: false, motivo: 'nenhuma cópia local nova' };
    console.log(e.ok ? `ok   nuvem: ${e.copias} cópias criptografadas enviadas` : `FALHOU nuvem: ${e.motivo}`);
    nuvemFalhou = !e.ok;
  }
  process.exit(resultados.some((r) => r.ok) && !nuvemFalhou ? 0 : 1);
}

if (require.main === module) main();
module.exports = { backup, listar, copiar, espelhar, PADRAO };
