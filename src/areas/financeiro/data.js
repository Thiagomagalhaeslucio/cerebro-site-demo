'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { findSection, parseTables, parseNumber, round2 } = require('../../md');
const { localISODate, addDays } = require('../../datas');

const DIR = '40-financeiro';
const { loadSiteConfig } = require('../../config');
const { formato, formatoPublico, escapar } = require('./formato');
const { divisaoCompleta } = require('./divisao');

// Valores de reserva quando panelas.md não traz a meta; os seus ficam em config.local.json (financeiro.metasPadrao).
const METAS_PADRAO_GENERICAS = { marco: 1000, metaFinal: 10000, reserva: 500 };
const metasPadrao = () => ({ ...METAS_PADRAO_GENERICAS, ...(loadSiteConfig().financeiro?.metasPadrao ?? {}) });
// Panelas que formam o "livre"; as reposições delas reduzem o disponível.
const LIVRE = ['pessoal', 'margem'];

const norm = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

function columnIndex(header, name) {
  return header.findIndex((h) => norm(h) === norm(name));
}

// ---------- panelas.md ----------

function parsePanelas(text, avisos) {
  const secSaldos = findSection(text, 'Saldos atuais');
  if (!secSaldos) throw new Error('panelas.md: seção "Saldos atuais" não encontrada');

  const dataSaldos = (/\(em\s+(\d{4}-\d{2}-\d{2})\)/.exec(secSaldos.title) || [])[1] || null;
  const tabela = parseTables(secSaldos.body).find((t) => columnIndex(t.header, 'saldo') >= 0);
  if (!tabela) throw new Error('panelas.md: tabela de saldos não encontrada');

  const [iPanela, iId, iSaldo, iObs] = ['panela', 'id', 'saldo', 'obs'].map((c) => columnIndex(tabela.header, c));
  const saldos = tabela.rows.map((r) => ({
    panela: r[iPanela] ?? '',
    id: r[iId] ?? '',
    saldo: parseNumber(r[iSaldo]),
    obs: iObs >= 0 ? r[iObs] ?? '' : '',
  }));
  for (const s of saldos) {
    if (s.saldo == null) avisos.push(`Saldo ilegível na panela "${s.panela || s.id}".`);
  }

  const numeroApos = (re) => {
    const m = re.exec(text);
    return m ? parseNumber(m[1]) : null;
  };
  const patrimonioEscrito = numeroApos(/Patrim[oô]nio total:\s*(?:R\$\s*)?([\d.,]+)/);
  const livreEscrito = numeroApos(/^Livre[^:\n]*:\s*(?:R\$\s*)?([\d.,]+)/m);
  const metasFaltando = [];

  return {
    dataSaldos,
    saldos,
    patrimonioEscrito,
    livreEscrito,
    metas: parseMetas(text, avisos, metasFaltando),
    metasFaltando,
    salario: parseSalario(text),
    pendentes: parsePendentes(text, avisos),
  };
}

// Meta que não puder ser lida usa o padrão na página principal, com aviso,
// e entra em `faltando` para o diagnóstico não usar um valor chutado.
function parseMetas(text, avisos, faltando = []) {
  const sec = findSection(text, 'Metas');
  const padrao = metasPadrao();
  const metas = { ...padrao };
  // A linha de cada meta abre com o texto de config → formato.linhas ("- Marco: ... R$2.000").
  const F = formato();
  const linhas = Object.fromEntries(Object.entries(F.linhas).map(([k, rotulo]) => [k, new RegExp(`^-\\s*${escapar(rotulo)}:.*?R\\$\\s*([\\d.,]+)`, 'm')]));
  for (const [chave, re] of Object.entries(linhas)) {
    const m = sec && re.exec(sec.body);
    const v = m && parseNumber(m[1]);
    if (v) metas[chave] = v;
    else {
      faltando.push(chave);
      avisos.push(`Meta "${chave}" não encontrada em panelas.md; usando ${padrao[chave]}.`);
    }
  }
  return metas;
}

function parseSalario(text) {
  const sec = findSection(text, 'Salário');
  if (!sec) return null;
  const inicio = sec.body.search(/Último:/);
  if (inicio < 0) return null;
  // O bloco do "Último" vai até o próximo item de lista.
  const resto = sec.body.slice(inicio);
  const fim = resto.slice(1).search(/\n\s*-\s/);
  const bloco = fim >= 0 ? resto.slice(0, fim + 1) : resto;

  const m = /Último:\s*R\$\s*([\d.,]+)\s*recebido em\s*(\d{4}-\d{2}-\d{2})/.exec(bloco);
  if (!m) return null;
  const divisao = [];
  const p = /\(([^)]*)\)/.exec(bloco);
  if (p) {
    for (const parte of p[1].split('/')) {
      const mm = /^\s*(\S+)\s+([\d.,]+)\s*$/.exec(parte);
      if (mm) divisao.push({ panela: mm[1], valor: parseNumber(mm[2]) });
    }
  }
  return { valor: parseNumber(m[1]), data: m[2], divisao };
}

function parsePendentes(text, avisos) {
  const sec = findSection(text, 'Reposições pendentes');
  if (!sec) return [];
  const itens = [];
  for (const line of sec.body.split('\n')) {
    const m = /^\s*-\s+(.*)$/.exec(line);
    if (!m) continue;
    const item = m[1].trim();
    if (/^nenhuma/i.test(item) || item.includes('✔')) continue;
    const partes = item.split(/\s+—\s+/);
    if (partes.length >= 3) {
      const valor = parseNumber(partes[2]);
      if (valor == null) avisos.push(`Reposição pendente com valor ilegível: "${item}".`);
      itens.push({ data: partes[0], panela: partes[1], valor, descricao: partes.slice(3).join(' — ') });
    } else {
      avisos.push(`Reposição pendente fora do formato "data — panela — valor — descrição": "${item}".`);
      itens.push({ data: '', panela: '', valor: null, descricao: item });
    }
  }
  return itens;
}

// ---------- movimentos.md ----------

function parseMovimentos(text, avisos) {
  const tabela = parseTables(text).find((t) => columnIndex(t.header, 'data') >= 0 && columnIndex(t.header, 'panela') >= 0);
  if (!tabela) throw new Error('movimentos.md: tabela de movimentos não encontrada');
  const idx = Object.fromEntries(
    ['data', 'panela', 'tipo', 'valor', 'descrição', 'obs'].map((c) => [c, columnIndex(tabela.header, c)]),
  );
  const movimentos = [];
  for (const r of tabela.rows) {
    const data = r[idx.data];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) continue;
    const valor = parseNumber(r[idx.valor]);
    if (valor == null) avisos.push(`Movimento com valor ilegível em ${data}: "${r.join(' | ')}".`);
    movimentos.push({
      data,
      panela: r[idx.panela] ?? '',
      tipo: r[idx.tipo] ?? '',
      valor,
      descricao: r[idx['descrição']] ?? '',
      obs: idx.obs >= 0 ? r[idx.obs] ?? '' : '',
    });
  }
  return movimentos;
}

// Gasto = tipo "saída", exceto os ajustes de saldo (a descrição deles vem de config → formato.descricaoAjuste).
// Transferência e recarga não são gasto.
function isGasto(m) {
  return norm(m.tipo) === 'saida' && m.valor != null && !m.descricao.startsWith(formato().descricaoAjuste);
}

function gastosPorDia(movimentos, hoje, dias) {
  const inicio = addDays(hoje, -(dias - 1));
  const labels = Array.from({ length: dias }, (_, i) => addDays(inicio, i));
  const series = {};
  for (const m of movimentos) {
    if (!isGasto(m) || m.data < inicio || m.data > hoje) continue;
    series[m.panela] ??= new Array(dias).fill(0);
    series[m.panela][labels.indexOf(m.data)] += m.valor;
  }
  for (const k of Object.keys(series)) series[k] = series[k].map(round2);
  return { inicio, fim: hoje, dias: labels, series };
}

function gastosDoMes(movimentos, hoje) {
  const mes = hoje.slice(0, 7);
  const porPanela = {};
  for (const m of movimentos) {
    if (!isGasto(m) || !m.data.startsWith(mes)) continue;
    porPanela[m.panela] = round2((porPanela[m.panela] || 0) + m.valor);
  }
  const total = round2(Object.values(porPanela).reduce((a, b) => a + b, 0));
  return { mes, porPanela, total };
}

function progresso(atual, meta) {
  return { atual, meta, pct: meta ? round2((atual / meta) * 100) : 0, atingido: atual >= meta };
}

// ---------- montagem ----------

function lerArquivos(vault) {
  const dir = path.join(vault, DIR);
  return {
    dir,
    panelasTxt: fs.readFileSync(path.join(dir, 'panelas.md'), 'utf8'),
    movimentosTxt: fs.readFileSync(path.join(dir, 'movimentos.md'), 'utf8'),
  };
}

function readFinanceiro(vault, hoje = localISODate()) {
  const { panelasTxt, movimentosTxt } = lerArquivos(vault);
  // Fonte relativa (vault/pasta), sem caminho absoluto da máquina.
  const r = buildFinanceiro(panelasTxt, movimentosTxt, hoje, `${path.basename(vault)}/${DIR}`);
  return { ...r, formato: { ...r.formato, divisaoCompleta: divisaoCompleta(panelasTxt, formato()) } };
}

function buildFinanceiro(panelasTxt, movimentosTxt, hoje, fonte = null) {
  const avisos = [];
  const p = parsePanelas(panelasTxt, avisos);
  const movimentos = parseMovimentos(movimentosTxt, avisos);

  const saldoDe = (id) => p.saldos.find((s) => s.id === id)?.saldo ?? 0;

  // Conferência: soma dos saldos (sem o VT, que está dentro da conta) x patrimônio escrito.
  const somado = round2(p.saldos.filter((s) => s.id !== 'vt').reduce((a, s) => a + (s.saldo || 0), 0));
  const patrimonio = {
    escrito: p.patrimonioEscrito,
    somado,
    diferenca: p.patrimonioEscrito == null ? null : round2(somado - p.patrimonioEscrito),
  };
  patrimonio.confere = patrimonio.diferenca === 0;
  if (p.patrimonioEscrito == null) avisos.push('Patrimônio total não encontrado em panelas.md.');
  else if (!patrimonio.confere)
    avisos.push(`Patrimônio escrito (${p.patrimonioEscrito.toFixed(2)}) não bate com a soma dos saldos sem o VT (${somado.toFixed(2)}): diferença de ${patrimonio.diferenca.toFixed(2)}.`);

  const livreSomado = round2(LIVRE.reduce((a, id) => a + saldoDe(id), 0));
  const livre = { escrito: p.livreEscrito, somado: livreSomado, confere: p.livreEscrito === livreSomado };
  if (p.livreEscrito != null && !livre.confere)
    avisos.push(`Livre escrito (${p.livreEscrito.toFixed(2)}) não bate com pessoal + margem (${livreSomado.toFixed(2)}).`);

  const totalPendente = round2(p.pendentes.reduce((a, i) => a + (i.valor || 0), 0));
  const pendenteLivre = round2(p.pendentes.filter((i) => LIVRE.includes(i.panela)).reduce((a, i) => a + (i.valor || 0), 0));
  const livreBase = p.livreEscrito ?? livreSomado;

  for (const s of p.saldos) if (s.saldo != null && s.saldo < 0) avisos.push(`Saldo negativo na panela "${s.panela}".`);
  if (saldoDe('vt') > saldoDe('conta')) avisos.push('VT maior que a Conta: confira.');

  const F = formato();
  const painel = saldoDe(F.painelMeta);
  return {
    hoje,
    fonte,
    dataSaldos: p.dataSaldos,
    saldos: p.saldos,
    patrimonio,
    livre,
    pendentes: { itens: p.pendentes, total: totalPendente, doLivre: pendenteLivre },
    disponivel: round2(livreBase - pendenteLivre),
    salario: p.salario,
    metas: p.metas,
    progresso: {
      marco: progresso(painel, p.metas.marco),
      reserva: progresso(saldoDe('reserva'), p.metas.reserva),
      metaFinal: progresso(painel, p.metas.metaFinal),
    },
    gastos: { ultimos30: gastosPorDia(movimentos, hoje, 30), mes: gastosDoMes(movimentos, hoje) },
    ultimosMovimentos: movimentos.slice(-15).reverse(),
    totalMovimentos: movimentos.length,
    formato: formatoPublico(F),
    avisos,
  };
}

module.exports = { DIR, lerArquivos, parsePanelas, parseMovimentos, readFinanceiro, buildFinanceiro, isGasto, localISODate };
