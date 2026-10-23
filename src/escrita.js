'use strict';

// Escrita de UM arquivo do vault, com as salvaguardas do Lançar movimento: demo recusa, versão do arquivo
// (quando a operação depende de posição), anti-duplicado, gravação atômica, verificação em memória antes de
// gravar e commit git só desse arquivo. Quem chama (src/app.js) já conferiu host, origem, token e tamanho.
// Cada área monta o caminho a partir de dados validados (nunca de um caminho vindo da página) e passa a
// `transformar`, que devolve o texto novo.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vaultGit = require('./areas/financeiro/vault-git');
const { gravarAtomico } = require('./areas/financeiro/lancar-io');

const MSG_DEMO = 'Modo demonstração: gravar está desligado. Nada é escrito.';
const JANELA_DUPLICADO_MS = 30000;

class Recusa extends Error {
  constructor(status, corpo) {
    super(corpo.mensagem || corpo.erro);
    this.status = status;
    this.corpo = corpo;
  }
}
const recusa = (status, erro, mensagem) => new Recusa(status, { erro, mensagem });

const hash = (...t) => crypto.createHash('sha256').update(t.join('\u0000')).digest('hex');
const versaoDe = (texto) => hash(texto ?? '');
const ehVersao = (v) => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

// Confere que o corpo só tem as chaves permitidas (qualquer outra é recusada).
function corpoComChaves(corpo, permitidas) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw recusa(400, 'corpo', 'O corpo precisa ser um objeto JSON.');
  for (const k of Object.keys(corpo)) if (!permitidas.includes(k)) throw recusa(400, 'corpo', `Campo não aceito no corpo: "${k}".`);
  return corpo;
}

const lerArquivo = (vault, rel) => {
  try { return fs.readFileSync(path.join(vault, rel), 'utf8'); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
};

// Lê o arquivo e devolve { texto, versao } (texto null = não existe ainda).
function ler(vault, rel) {
  const texto = lerArquivo(vault, rel);
  return { texto, versao: versaoDe(texto) };
}

// opcoes:
//   rel          caminho do arquivo no vault, montado pela área
//   versao       (opcional) versão que a página leu; se dada e diferente da atual, 409
//   transformar  (textoAtual|null) => textoNovo   (lança Recusa se a operação não vale)
//   verificar    (textoNovo, textoAntes|null) => string|null   (motivo de recusar, ou null)
//   assinatura   texto que identifica a operação (anti-duplicado)
//   mensagem     mensagem do commit (sem dado sensível além do que o usuário digitou)
function escrever(vault, ctx, opcoes) {
  if (ctx.demo) throw recusa(403, 'demo', MSG_DEMO);
  const { rel, versao, transformar, verificar, assinatura, mensagem } = opcoes;
  const fsx = ctx.fsx || fs;
  const agora = (ctx.agora || Date.now)();
  const estado = (ctx.estado.escrita ??= { recentes: new Map() });

  for (const [h, t] of estado.recentes) if (agora - t > JANELA_DUPLICADO_MS) estado.recentes.delete(h);
  const chave = hash(rel, assinatura, versao ?? '');
  if (estado.recentes.has(chave)) throw recusa(409, 'duplicado', 'Este registro idêntico acabou de ser gravado. Se foi de propósito, espere alguns segundos.');

  const atual = ler(vault, rel);
  if (versao !== undefined && versao !== atual.versao) throw recusa(409, 'versao', 'O arquivo mudou desde que a página o leu. Recarregue e refaça.');
  const novo = transformar(atual.texto);
  if (typeof novo !== 'string' || novo === atual.texto) throw recusa(422, 'invalido', 'A operação não muda nada.');
  const problema = verificar ? verificar(novo, atual.texto) : null;
  if (problema) throw recusa(422, 'verificacao', `Verificação antes de gravar falhou: ${problema}`);

  const git = ctx.git !== false && vaultGit.disponivel(vault);
  let avisoGit = null;
  if (git && atual.texto !== null) {
    // O que já estava no arquivo sem commit (Obsidian) ganha o seu próprio commit antes do nosso.
    const snap = vaultGit.commitar(vault, [rel], 'Estado anterior à escrita pelo site');
    if (!snap.ok) avisoGit = `Não consegui registrar o estado anterior no git (${snap.motivo}).`;
  }

  estado.recentes.set(chave, agora);
  try {
    fs.mkdirSync(path.dirname(path.join(vault, rel)), { recursive: true });
    gravarAtomico(fsx, path.join(vault, rel), novo);
  } catch (err) {
    estado.recentes.delete(chave);
    throw recusa(500, 'gravacao', `Não consegui gravar ${rel} (${err.message}); nada mudou.`);
  }
  let commit = false;
  if (git) {
    const c = vaultGit.commitar(vault, [rel], mensagem);
    commit = c.ok;
    if (!c.ok) avisoGit = `Gravado, mas o commit no git do vault falhou (${c.motivo}).`;
  }
  return { status: 200, corpo: { ok: true, gravado: true, versao: versaoDe(novo), git: git ? { commit, aviso: avisoGit } : null } };
}

// Acrescenta uma linha depois da última linha da primeira tabela que tem as colunas pedidas.
// Devolve o texto novo, ou null se não achou a tabela.
function acrescentarLinhaNaTabela(texto, colunas, linha) {
  const linhas = texto.split('\n');
  const norm = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
  const celulas = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => norm(c));
  for (let i = 0; i < linhas.length - 1; i++) {
    if (!/^\s*\|/.test(linhas[i]) || !/^\s*\|[\s:|-]+\|?\s*$/.test(linhas[i + 1])) continue;
    const cab = celulas(linhas[i]);
    if (!colunas.every((c) => cab.includes(norm(c)))) continue;
    let fim = i + 1;
    while (fim + 1 < linhas.length && /^\s*\|/.test(linhas[fim + 1])) fim++;
    linhas.splice(fim + 1, 0, linha);
    return linhas.join('\n');
  }
  return null;
}

// Texto de célula de tabela: uma linha só, sem barra vertical solta.
const celula = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|');

module.exports = { Recusa, recusa, MSG_DEMO, escrever, ler, versaoDe, ehVersao, corpoComChaves, acrescentarLinhaNaTabela, celula };
