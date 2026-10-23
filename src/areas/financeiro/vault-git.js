'use strict';

// Git do vault, só para o que o Lançar movimento escreve: panelas.md e movimentos.md. Nada de push, nada de
// `add .`, nada que toque em outros arquivos (commit --only com os dois caminhos). Falha vira retorno, nunca
// exceção: o lançamento já foi gravado e não pode falhar por causa do git.

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TIMEOUT_MS = 15000;
const HASH = /^[0-9a-f]{40}$/;

function git(vault, args, { entrada } = {}) {
  return execFileSync('git', args, {
    cwd: vault, encoding: 'utf8', timeout: TIMEOUT_MS, input: entrada, maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  }).replace(/\n$/, '');
}

// O vault só conta se ele mesmo é a raiz do repositório (não um repositório que o contém por acaso).
function disponivel(vault) {
  try {
    if (!fs.existsSync(path.join(vault, '.git'))) return false;
    return path.resolve(git(vault, ['rev-parse', '--show-toplevel'])) === path.resolve(fs.realpathSync(vault));
  } catch {
    return false;
  }
}

const head = (vault) => { try { return git(vault, ['rev-parse', 'HEAD']); } catch { return null; } };

// Arquivos com mudança ainda não commitada (entre os caminhos dados).
function sujos(vault, arquivos) {
  try { return git(vault, ['status', '--porcelain', '--', ...arquivos]).split('\n').filter(Boolean); } catch { return null; }
}

// Quem assina o commit: o git do vault, se já configurado; senão uma identidade do site.
function identidade(vault) {
  const tem = (k) => { try { return git(vault, ['config', k]) !== ''; } catch { return false; } };
  return tem('user.name') && tem('user.email') ? [] : ['-c', 'user.name=cerebro-site', '-c', 'user.email=cerebro-site@localhost'];
}

// Commit só dos `arquivos`. { ok, hash } ou { ok:false, motivo }. Sem mudança nos arquivos: ok sem hash novo.
function commitar(vault, arquivos, mensagem) {
  try {
    const sujas = sujos(vault, arquivos);
    if (!sujas?.length) return { ok: true, hash: head(vault), vazio: true };
    // Arquivo novo (ainda fora do git) precisa entrar antes do `commit --only`.
    const novos = sujas.filter((l) => l.startsWith('??')).map((l) => l.slice(3).replace(/^"|"$/g, ''));
    if (novos.length) git(vault, ['add', '--', ...novos]);
    git(vault, [...identidade(vault), 'commit', '--only', '-m', mensagem, '--', ...arquivos]);
    return { ok: true, hash: head(vault), vazio: false };
  } catch (e) {
    return { ok: false, motivo: String(e.stderr || e.message || e).trim().split('\n')[0].slice(0, 200) };
  }
}

// Conteúdo de um arquivo em um commit (para desfazer depois de reiniciar o site).
function mostrar(vault, hash, arquivo) {
  if (!HASH.test(hash || '')) return null;
  try { return execFileSync('git', ['show', `${hash}:${arquivo}`], { cwd: vault, encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }); } catch { return null; }
}

module.exports = { disponivel, head, sujos, commitar, mostrar, HASH };
