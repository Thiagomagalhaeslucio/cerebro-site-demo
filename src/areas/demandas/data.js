'use strict';

// Demandas: o que está em andamento com cada cliente. Junta as propostas (70-negocio/propostas), os
// contratos (70-negocio/contratos), os clientes (70-negocio/clientes) e os projetos (30-projetos, tag
// "projeto"), agrupados por cliente e ordenados pelo prazo mais próximo. Só leitura; `hoje` vem de fora.

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter, stripFrontmatter, parseNumber } = require('../../md');
const { isISODate, diffDays } = require('../../datas');
const { linkObsidian } = require('../estudos/data');

const DIR_NEGOCIO = '70-negocio';
const DIR_PROJETOS = '30-projetos';
const SEM_CLIENTE = 'Sem cliente';
const CHECKBOX = /^\s*[-*+]\s+\[([ xX])\]\s+/;
const FENCE = /^\s*(```|~~~)/;

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const texto = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

// Prazo: `prazo`; nas propostas e contratos também `entrega` (e `fim`), que é como a proposta aceita já o chama.
// Proposta enviada ainda não virou negócio; aceita, sim; recusada e cancelada saem da fila.
const ABERTAS = new Set(['rascunho', 'enviada', 'em negociacao']);
const ENCERRADAS = new Set(['recusada', 'cancelada', 'encerrado', 'encerrada', 'concluido', 'concluida', 'entregue']);

function prazoDe(valor, onde, avisos) {
  const v = texto(valor);
  if (!v) return null;
  if (!isISODate(v)) { avisos.push(`${onde}: prazo "${v}" fora do formato AAAA-MM-DD; ignorado.`); return null; }
  return v;
}

function lerPasta(vault, sub, avisos, fn) {
  const dir = path.join(vault, sub);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!ent.isFile() || !ent.name.endsWith('.md') || ent.name.startsWith('.')) continue;
    const rel = `${sub}/${ent.name}`;
    const bruto = fs.readFileSync(path.join(dir, ent.name), 'utf8');
    const fm = parseFrontmatter(bruto);
    if (fm.tem && !fm.valido) { avisos.push(`${rel}: frontmatter sem o "---" de fechamento.`); continue; }
    const r = fn({ rel, nome: ent.name.replace(/\.md$/, ''), campos: fm.valido ? fm.campos : {}, bruto });
    if (r) out.push(r);
  }
  return out;
}

// Backlog de um projeto: checkboxes do arquivo; sem eles, os blocos de texto sob "## Backlog" (cada bloco
// separado por linha em branco é um item solto). Código e imagens não contam.
function backlogDe(corpo) {
  const linhas = stripFrontmatter(corpo).split(/\r?\n/);
  let abertos = 0;
  let total = 0;
  let emCodigo = false;
  for (const l of linhas) {
    if (FENCE.test(l)) { emCodigo = !emCodigo; continue; }
    const m = !emCodigo && CHECKBOX.exec(l);
    if (m) { total++; if (m[1] === ' ') abertos++; }
  }
  if (total) return { abertos, total, tipo: 'checkbox' };

  let secao = false;
  let bloco = false;
  let soltos = 0;
  emCodigo = false;
  for (const l of linhas) {
    if (FENCE.test(l)) { emCodigo = !emCodigo; continue; }
    if (emCodigo) continue;
    if (/^##\s+/.test(l)) { if (bloco) soltos++; bloco = false; secao = /^##\s+backlog\b/i.test(l); continue; }
    if (!secao) continue;
    if (l.trim() === '') { if (bloco) soltos++; bloco = false; } else if (!/^\s*!\[\[/.test(l)) bloco = true;
  }
  if (bloco) soltos++;
  return { abertos: soltos, total: soltos, tipo: 'soltos' };
}

function readDemandas(vault, hoje) {
  const avisos = [];
  const link = (rel) => linkObsidian(vault, rel);
  const item = (tipo, base) => ({ tipo, ...base, diasParaPrazo: base.prazo ? diffDays(base.prazo, hoje) : null });

  const propostas = lerPasta(vault, `${DIR_NEGOCIO}/propostas`, avisos, ({ rel, nome, campos }) => {
    const status = texto(campos.status) ? norm(campos.status) : null;
    if (!status) avisos.push(`${rel}: proposta sem "status".`);
    const valor = campos.valor === undefined ? null : parseNumber(String(campos.valor));
    return item('proposta', {
      arquivo: rel, link: link(rel), nome, cliente: texto(campos.cliente), titulo: texto(campos.projeto) || nome,
      status: status || 'sem status', valor: Number.isFinite(valor) ? valor : null, prazo: prazoDe(campos.prazo ?? campos.entrega, rel, avisos),
      aberta: ABERTAS.has(status),
      ativa: ABERTAS.has(status) || status === 'aceita', // aceita = a entregar: o prazo dela conta
    });
  });

  const contratos = lerPasta(vault, `${DIR_NEGOCIO}/contratos`, avisos, ({ rel, nome, campos }) => {
    const status = texto(campos.status) ? norm(campos.status) : 'vigente';
    const valor = campos.valor === undefined ? null : parseNumber(String(campos.valor));
    return item('contrato', {
      arquivo: rel, link: link(rel), nome, cliente: texto(campos.cliente), titulo: texto(campos.projeto) || nome,
      status, valor: Number.isFinite(valor) ? valor : null, prazo: prazoDe(campos.prazo ?? campos.entrega ?? campos.fim, rel, avisos),
      aberta: !ENCERRADAS.has(status),
    });
  });

  const clientes = lerPasta(vault, `${DIR_NEGOCIO}/clientes`, avisos, ({ rel, nome, campos }) => ({
    nome: texto(campos.nome) || texto(campos.cliente) || nome, arquivo: rel, link: link(rel),
  }));

  const projetos = lerPasta(vault, DIR_PROJETOS, avisos, ({ rel, nome, campos, bruto }) => {
    const tags = (Array.isArray(campos.tags) ? campos.tags : [campos.tags]).filter((t) => typeof t === 'string');
    if (!tags.includes('projeto')) return null;
    const status = texto(campos.status) ? norm(campos.status) : 'em andamento';
    const titulo = /^#\s+(.+?)\s*$/m.exec(stripFrontmatter(bruto))?.[1].replace(/[`*]/g, '').trim() || nome;
    return item('projeto', {
      arquivo: rel, link: link(rel), nome, cliente: texto(campos.cliente), titulo, status,
      prazo: prazoDe(campos.prazo, rel, avisos), backlog: backlogDe(bruto), aberta: !ENCERRADAS.has(status),
    });
  });

  // Agrupa por cliente (sem diferenciar acento nem caixa). Cliente cadastrado em clientes/ aparece mesmo vazio.
  const grupos = new Map();
  const grupo = (nome) => {
    const k = norm(nome || SEM_CLIENTE);
    if (!grupos.has(k)) grupos.set(k, { nome: nome || SEM_CLIENTE, link: null, propostas: [], contratos: [], projetos: [] });
    return grupos.get(k);
  };
  for (const c of clientes) Object.assign(grupo(c.nome), { link: c.link });
  for (const p of propostas) grupo(p.cliente).propostas.push(p);
  for (const c of contratos) grupo(c.cliente).contratos.push(c);
  for (const p of projetos) grupo(p.cliente).projetos.push(p);

  const lista = [...grupos.values()].map((g) => {
    const abertos = [...g.propostas, ...g.contratos, ...g.projetos].filter((x) => x.ativa ?? x.aberta);
    const prazos = abertos.map((x) => x.prazo).filter(Boolean).sort();
    return {
      ...g,
      proximoPrazo: prazos[0] || null,
      valorAceito: g.propostas.filter((p) => p.status === 'aceita').reduce((a, p) => a + (p.valor || 0), 0),
    };
  }).sort((a, b) => (a.nome === SEM_CLIENTE) - (b.nome === SEM_CLIENTE)
    || (a.proximoPrazo || '9999').localeCompare(b.proximoPrazo || '9999') || a.nome.localeCompare(b.nome, 'pt-BR'));

  const abertas = (xs) => xs.filter((x) => x.aberta).length;
  return {
    hoje,
    clientes: lista,
    resumo: {
      clientes: lista.filter((g) => g.nome !== SEM_CLIENTE).length,
      propostasAbertas: abertas(propostas),
      propostasAceitas: propostas.filter((p) => p.status === 'aceita').length,
      contratos: abertas(contratos),
      projetos: abertas(projetos),
      backlogAberto: projetos.filter((p) => p.aberta).reduce((a, p) => a + p.backlog.abertos, 0),
    },
    avisos,
  };
}

// Prazos de itens em aberto, para "Datas importantes" da Home e da Agenda.
function datasDemandas(vault, hoje) {
  const d = readDemandas(vault, hoje);
  return d.clientes.flatMap((g) => [...g.propostas, ...g.contratos, ...g.projetos])
    .filter((x) => (x.ativa ?? x.aberta) && x.prazo)
    .map((x) => ({ data: x.prazo, rotulo: `${x.titulo}${x.cliente ? ` (${x.cliente})` : ''}`, area: 'demandas' }));
}

module.exports = { readDemandas, datasDemandas, backlogDe, SEM_CLIENTE };
