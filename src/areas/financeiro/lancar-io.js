'use strict';

// A ÚNICA escrita do site: lê, simula (motor puro em lancar.js) e grava 40-financeiro/panelas.md
// e movimentos.md. Quem chama (src/app.js) já conferiu host, origem, token e tamanho do corpo;
// aqui ficam a versão dos arquivos, o anti-duplicado, a gravação atômica e o desfazer.
// Estado em memória (último lançamento e anti-duplicado) vem de ctx.estado, por servidor.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DIR, readFinanceiro } = require('./data');
const { lancar: motor } = require('./lancar');
const { formato, formatoPublico } = require('./formato');
const { loadSiteConfig } = require('../../config');
const vaultGit = require('./vault-git');

const ARQUIVOS = ['panelas.md', 'movimentos.md'];
const CAMINHOS_GIT = ARQUIVOS.map((a) => `${DIR}/${a}`);
// Um arquivo por vault: o ensaio numa cópia nunca pisa no estado do vault real.
const arquivoEstado = (ctx, vault) => path.join(ctx.estadoDir, `ultimo-lancamento-${crypto.createHash('sha1').update(path.resolve(vault)).digest('hex').slice(0, 10)}.json`);
const MSG_DEMO = 'Modo demonstração: gravar e desfazer estão desligados. A pré-visualização funciona, mas nada é escrito.';

const premissas = () => loadSiteConfig().financeiro?.lancar ?? {};
const caminho = (vault, nome) => path.join(vault, DIR, nome);
const hash = (...textos) => crypto.createHash('sha256').update(textos.join('\u0000')).digest('hex');

function lerTextos(vault) {
  return {
    panelasTxt: fs.readFileSync(caminho(vault, 'panelas.md'), 'utf8'),
    movimentosTxt: fs.readFileSync(caminho(vault, 'movimentos.md'), 'utf8'),
  };
}
const versaoDe = ({ panelasTxt, movimentosTxt }) => hash(panelasTxt, movimentosTxt);

class Recusa extends Error {
  constructor(status, corpo) {
    super(corpo.mensagem || corpo.erro);
    this.status = status;
    this.corpo = corpo;
  }
}

// ---------- validação do corpo (esquema) ----------

function lerCorpo(corpo, { exigeVersao }) {
  const recusa = (msg) => new Recusa(400, { erro: 'corpo', mensagem: msg });
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) throw recusa('O corpo precisa ser um objeto JSON.');
  const permitidas = exigeVersao ? ['operacao', 'versao'] : ['operacao'];
  for (const k of Object.keys(corpo)) if (!permitidas.includes(k)) throw recusa(`Campo não aceito no corpo: "${k}".`);
  if (!corpo.operacao || typeof corpo.operacao !== 'object' || Array.isArray(corpo.operacao)) throw recusa('Falta a "operacao".');
  if (exigeVersao && !(typeof corpo.versao === 'string' && /^[0-9a-f]{64}$/.test(corpo.versao))) throw recusa('Falta a "versao" (a que a página leu).');
  return corpo;
}

// ---------- gravação atômica ----------

// Arquivo temporário na mesma pasta e rename: ninguém lê um arquivo pela metade.
function gravarAtomico(fsx, destino, texto) {
  const tmp = path.join(path.dirname(destino), `.${path.basename(destino)}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    const fd = fsx.openSync(tmp, 'wx', 0o644);
    try {
      fsx.writeSync(fd, texto);
      fsx.fsyncSync(fd);
    } finally {
      fsx.closeSync(fd);
    }
    fsx.renameSync(tmp, destino);
  } catch (err) {
    try { fsx.rmSync(tmp, { force: true }); } catch { /* nada a limpar */ }
    throw err;
  }
}

// movimentos.md primeiro, panelas.md depois; se a segunda falhar, a primeira volta ao que era.
function gravarPar(fsx, vault, antes, depois) {
  gravarAtomico(fsx, caminho(vault, 'movimentos.md'), depois.movimentosTxt);
  try {
    gravarAtomico(fsx, caminho(vault, 'panelas.md'), depois.panelasTxt);
  } catch (err) {
    try {
      gravarAtomico(fsx, caminho(vault, 'movimentos.md'), antes.movimentosTxt);
    } catch (err2) {
      throw new Recusa(500, { erro: 'gravacao', mensagem: `Falhou gravar panelas.md (${err.message}) e também restaurar movimentos.md (${err2.message}). Confira o arquivo à mão.` });
    }
    throw new Recusa(500, { erro: 'gravacao', mensagem: `Não consegui gravar panelas.md (${err.message}); movimentos.md foi restaurado e nada mudou.` });
  }
}

// ---------- git do vault e o último lançamento em disco ----------

// Commit automático (financeiro.lancar.commitAutomatico, ligado por padrão) só se o vault é um repositório git.
const usaGit = (vault) => premissas().commitAutomatico !== false && vaultGit.disponivel(vault);

const NOMES_OP = { gasto: 'gasto', transporte: 'transporte do dia', entrada: 'entrada', reposicao: 'reposição', recarga: 'recarga do trem', salario: 'salário', ajuste: 'ajuste de saldo' };
const msgCommit = (operacao, prefixo) => `${prefixo}: ${NOMES_OP[operacao.tipo] || operacao.tipo}${operacao.descricao ? ` (${String(operacao.descricao).replace(/\s+/g, ' ').slice(0, 60)})` : ''}`;

// O último lançamento sobrevive ao reinício: guardo só quem ele é (commits antes e depois, hash dos arquivos,
// a prévia) em ctx.estadoDir, fora do repositório. Os textos de "antes" vêm do git, não de uma cópia.
function salvarUltimo(ctx, vault, ultimo) {
  if (!ctx.estadoDir) return;
  try {
    fs.mkdirSync(ctx.estadoDir, { recursive: true, mode: 0o700 });
    const { antes, depois, ...resto } = ultimo;
    fs.writeFileSync(arquivoEstado(ctx, vault), JSON.stringify(resto), { mode: 0o600 });
  } catch { /* sem disco para o estado: o desfazer vale até reiniciar, como antes */ }
}
function apagarUltimo(ctx, vault) {
  if (ctx.estadoDir) { try { fs.rmSync(arquivoEstado(ctx, vault), { force: true }); } catch { /* ok */ } }
}
function carregarUltimo(ctx, vault) {
  const estado = (ctx.estado.financeiro ??= { recentes: new Map(), ultimo: null });
  if (estado.ultimo || !ctx.estadoDir) return estado;
  try {
    const u = JSON.parse(fs.readFileSync(arquivoEstado(ctx, vault), 'utf8'));
    const ok = u && vaultGit.HASH.test(u.commitAntes || '') && /^[0-9a-f]{64}$/.test(u.versaoDepois || '') && /^[0-9a-f]{64}$/.test(u.versaoAntes || '');
    if (ok) estado.ultimo = u; // sem `antes` em memória: o desfazer busca no git
  } catch { /* sem arquivo, ou ilegível: nada a restaurar */ }
  return estado;
}

// ---------- operações ----------

function simular(vault, ctx, operacao) {
  const textos = lerTextos(vault);
  const r = motor({ ...textos, operacao, hoje: ctx.hoje }, { config: { ...premissas(), formato: formato() } });
  return { textos, r, versao: versaoDe(textos) };
}

const resposta = (r, versao) => ({ ok: r.ok, erros: r.erros, avisos: r.avisos, exigeConfirmacao: r.exigeConfirmacao, gravavel: r.gravavel, previa: r.previa, versao });

function previa(vault, ctx, corpo) {
  const { operacao } = lerCorpo(corpo, { exigeVersao: false });
  const { r, versao } = simular(vault, ctx, operacao);
  return { status: 200, corpo: resposta(r, versao) };
}

function lancar(vault, ctx, corpo) {
  if (ctx.demo) throw new Recusa(403, { erro: 'demo', mensagem: MSG_DEMO });
  const { operacao, versao } = lerCorpo(corpo, { exigeVersao: true });
  const estado = (ctx.estado.financeiro ??= { recentes: new Map(), ultimo: null });
  const fsx = ctx.fsx || fs;
  const agora = (ctx.agora || Date.now)();

  // O mesmo payload duas vezes em poucos segundos é duplo clique, não dois lançamentos.
  const janela = (premissas().duplicadoSegundos ?? 30) * 1000;
  for (const [h, t] of estado.recentes) if (agora - t > janela) estado.recentes.delete(h);
  const assinatura = hash(JSON.stringify({ operacao, versao }));
  if (estado.recentes.has(assinatura)) throw new Recusa(409, { erro: 'duplicado', mensagem: 'Este lançamento idêntico acabou de ser gravado. Se foi de propósito, espere alguns segundos.' });

  const { textos, r, versao: atual } = simular(vault, ctx, operacao);
  if (versao !== atual) throw new Recusa(409, { erro: 'versao', mensagem: 'Os arquivos mudaram desde que a página os leu. Recarregue e refaça o lançamento.' });
  if (!r.ok) throw new Recusa(422, { ...resposta(r, atual), erro: 'invalido', mensagem: r.erros[0] });
  if (!r.gravavel) throw new Recusa(422, { ...resposta(r, atual), erro: 'confirmacao', mensagem: 'Há avisos que exigem confirmação explícita.' });

  const git = usaGit(vault);
  // Antes de escrever, o que já estava nos dois arquivos e ainda não foi commitado (o `t` do terminal, o Obsidian)
  // ganha o seu próprio commit: o do lançamento fica só com o lançamento, e o "antes" do desfazer existe no git.
  let commitAntes = null;
  let avisoGit = null;
  if (git) {
    const snap = vaultGit.commitar(vault, CAMINHOS_GIT, 'Estado anterior ao lançamento pelo site');
    if (snap.ok) commitAntes = snap.hash; else avisoGit = `Não consegui registrar o estado anterior no git (${snap.motivo}).`;
  }

  estado.recentes.set(assinatura, agora);
  try {
    gravarPar(fsx, vault, textos, r.novos);
  } catch (err) {
    estado.recentes.delete(assinatura);
    throw err;
  }
  const depois = versaoDe(r.novos);
  let commitDepois = null;
  if (git && commitAntes) {
    const c = vaultGit.commitar(vault, CAMINHOS_GIT, msgCommit(operacao, 'Lançamento pelo site'));
    if (c.ok) commitDepois = c.hash; else avisoGit = `Lançado, mas o commit no git do vault falhou (${c.motivo}).`;
  }
  const quando = new Date(agora).toISOString();
  estado.ultimo = { antes: textos, depois: r.novos, versaoAntes: atual, versaoDepois: depois, previa: r.previa, operacao: operacao.tipo, descricao: operacao.descricao ?? null, quando, commitAntes, commitDepois };
  salvarUltimo(ctx, vault, estado.ultimo);
  return { status: 200, corpo: { ...resposta(r, depois), gravado: true, podeDesfazer: true, git: git ? { commit: !!commitDepois, aviso: avisoGit } : null } };
}

// Só o último lançamento feito por este servidor, e só se os arquivos ainda são os que ele deixou.
function desfazer(vault, ctx, corpo) {
  if (ctx.demo) throw new Recusa(403, { erro: 'demo', mensagem: MSG_DEMO });
  lerCorpoDesfazer(corpo);
  const estado = carregarUltimo(ctx, vault);
  const ultimo = estado.ultimo;
  if (!ultimo) throw new Recusa(409, { erro: 'nada', mensagem: 'Não há lançamento do site para desfazer (só o último).' });
  const textos = lerTextos(vault);
  const atual = versaoDe(textos);
  if (atual !== ultimo.versaoDepois || corpo.versao !== atual) throw new Recusa(409, { erro: 'versao', mensagem: 'Os arquivos mudaram depois do lançamento; por segurança, nada foi desfeito. Corrija à mão.' });
  // O "antes": da memória, ou, se o site reiniciou, do commit que o git guardou.
  let antes = ultimo.antes;
  if (!antes) {
    const panelasTxt = vaultGit.mostrar(vault, ultimo.commitAntes, `${DIR}/panelas.md`);
    const movimentosTxt = vaultGit.mostrar(vault, ultimo.commitAntes, `${DIR}/movimentos.md`);
    antes = panelasTxt != null && movimentosTxt != null ? { panelasTxt, movimentosTxt } : null;
    if (!antes || versaoDe(antes) !== ultimo.versaoAntes) throw new Recusa(409, { erro: 'nada', mensagem: 'O estado anterior não está mais no git do vault; por segurança, nada foi desfeito. Corrija à mão.' });
  }
  gravarPar(ctx.fsx || fs, vault, textos, antes);
  let avisoGit = null;
  if (usaGit(vault)) {
    const c = vaultGit.commitar(vault, CAMINHOS_GIT, msgCommit({ tipo: ultimo.operacao, descricao: ultimo.descricao }, 'Desfaz lançamento do site'));
    if (!c.ok) avisoGit = `Desfeito, mas o commit no git do vault falhou (${c.motivo}).`;
  }
  estado.ultimo = null;
  apagarUltimo(ctx, vault);
  return { status: 200, corpo: { ok: true, desfeito: true, versao: versaoDe(antes), previa: ultimo.previa, git: avisoGit ? { commit: false, aviso: avisoGit } : null } };
}

function lerCorpoDesfazer(corpo) {
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).some((k) => k !== 'versao') || !/^[0-9a-f]{64}$/.test(corpo.versao || ''))
    throw new Recusa(400, { erro: 'corpo', mensagem: 'O corpo precisa ser {"versao": "<hash lido com a página>"}.' });
}

// ---------- o que a página precisa para montar o formulário ----------

function contexto(vault, ctx) {
  const textos = lerTextos(vault);
  const f = readFinanceiro(vault, ctx.hoje);
  const cfg = loadSiteConfig().financeiro ?? {};
  const ultimo = carregarUltimo(ctx, vault).ultimo;
  return {
    hoje: ctx.hoje,
    demo: !!ctx.demo,
    versao: versaoDe(textos),
    panelas: f.saldos.map((s) => ({ id: s.id, panela: s.panela, saldo: s.saldo })),
    pendentes: f.pendentes.itens.map((it, id) => ({ id, ...it })), // id = posição entre as não repostas (o motor confere descrição e valor)
    transporte: premissas().transporte ?? null,
    formato: formatoPublico(formato()),
    categorias: cfg.diagnostico?.categorias ?? {},
    sugestaoPorCategoria: premissas().sugestaoPorCategoria ?? {},
    desfazer: ultimo && ultimo.versaoDepois === versaoDe(textos) ? { operacao: ultimo.operacao, quando: ultimo.quando } : null,
  };
}

module.exports = { Recusa, MSG_DEMO, previa, lancar, desfazer, contexto, versaoDe, lerTextos, gravarAtomico };
