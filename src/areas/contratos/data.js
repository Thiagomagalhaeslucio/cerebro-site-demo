'use strict';

// Contratos: lê o modelo (70-negocio/modelos/contrato.md), o perfil, os parâmetros de
// precificacao.md que o contrato usa e as propostas aceitas de 70-negocio/propostas/
// (frontmatter com status "aceita"). Campo ausente ou inválido vira aviso e fica vazio;
// nada é chutado. Só leitura.

const fs = require('node:fs');
const path = require('node:path');
const { parseFrontmatter } = require('../../md');
const { lerPerfil, lerModelo } = require('../../documentos');
const { lerPrecificacao, ARQUIVO: ARQUIVO_PRECIFICACAO, DIR_NEGOCIO } = require('../orcamento/data');

const ARQUIVO_MODELO = '70-negocio/modelos/contrato.md';
const DIR_PROPOSTAS = '70-negocio/propostas';
const CHAVES_PARAMETROS = ['revisoes_incluidas', 'revisao_extra_horas', 'garantia_dias', 'hora_avulsa', 'prazo_resposta_cliente_dias', 'entrada', 'valor_hora'];
// Do perfil, o contrato só pré-preenche o nome e o e-mail do contratado.
const PERFIL_OBRIGATORIO = ['nome', 'email'];

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const dataValida = (s) => {
  const m = ISO.exec(s);
  return !!m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toISOString().slice(0, 10) === s;
};
const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
const texto = (v) => (typeof v === 'string' ? v.trim() : '');
const lista = (v) => (Array.isArray(v) ? v.map(texto).filter(Boolean) : texto(v) ? [texto(v)] : null);

// Número do frontmatter: "1500", "1500.50" ou "R$ 1.500,00". null se não for número.
function numero(v) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/R\$/g, '').replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : null;
}

// Entrada como fração (0 a 1): "0.4" ou "40%" ou "40". Acima de 1 vale como porcentagem.
function entrada(v) {
  if (typeof v !== 'string') return null;
  const pct = /%\s*$/.test(v);
  const n = numero(v.replace(/%\s*$/, ''));
  if (n == null || n <= 0) return null;
  const f = pct || n > 1 ? n / 100 : n;
  return f > 0 && f <= 1 ? f : null;
}

// Uma proposta aceita → { arquivo, rotulo, cliente, projeto, valor, entrada_percentual, inicio,
// entrega, escopo, fora_do_escopo, entregaveis, ausentes }. Cada campo que falta ou não vale
// fica null (ou [] nas listas) e entra em "ausentes".
function lerProposta(arquivo, campos) {
  const ausentes = [];
  const exige = (chave, valor) => { if (valor == null) ausentes.push(chave); return valor; };
  const f = {
    cliente: exige('cliente', texto(campos.cliente) || null),
    projeto: exige('projeto', texto(campos.projeto) || null),
    valor: exige('valor', (() => { const n = numero(campos.valor); return n != null && n > 0 ? n : null; })()),
    entrada_percentual: exige('entrada_percentual', entrada(campos.entrada_percentual)),
    inicio: exige('inicio', dataValida(campos.inicio) ? campos.inicio : null),
    entrega: exige('entrega', dataValida(campos.entrega) ? campos.entrega : null),
  };
  for (const k of ['escopo', 'fora_do_escopo', 'entregaveis']) f[k] = exige(k, campos[k] === undefined ? null : lista(campos[k])) ?? [];
  const rotulo = [f.cliente, f.projeto].filter(Boolean).join(': ') || arquivo;
  return { arquivo: `${DIR_PROPOSTAS}/${arquivo}`, rotulo, ...f, ausentes };
}

// Propostas com status "aceita" (sem distinguir acento nem caixa), em ordem de nome de arquivo.
// Pasta ausente não é erro: simplesmente não há proposta aceita.
function lerPropostasAceitas(vault) {
  const dir = path.join(vault, DIR_PROPOSTAS);
  const avisos = [];
  if (!fs.existsSync(dir)) return { propostas: [], avisos };
  const propostas = [];
  for (const nome of fs.readdirSync(dir).filter((n) => n.endsWith('.md') && !n.startsWith('.')).sort()) {
    const rel = `${DIR_PROPOSTAS}/${nome}`;
    const fm = parseFrontmatter(fs.readFileSync(path.join(dir, nome), 'utf8'));
    if (!fm.valido) { avisos.push(`${rel}: frontmatter ausente ou malformado; a proposta foi ignorada.`); continue; }
    if (norm(fm.campos.status) !== 'aceita') continue;
    const p = lerProposta(nome, fm.campos);
    if (p.ausentes.length) avisos.push(`Proposta aceita ${rel}: ${p.ausentes.join(', ')} ${p.ausentes.length === 1 ? 'ausente ou inválido' : 'ausentes ou inválidos'}.`);
    propostas.push(p);
  }
  return { propostas, avisos };
}

function lerContratos(vault) {
  const precificacao = lerPrecificacao(vault);
  const perfil = lerPerfil(vault, PERFIL_OBRIGATORIO);
  const modelo = lerModelo(vault, ARQUIVO_MODELO, '{{contratante_nome}}, {{valor_total}}, {{foro}}');
  const { propostas, avisos: avisosPropostas } = lerPropostasAceitas(vault);

  // Só os parâmetros do contrato; os avisos dos demais (tipos de trabalho, imposto...) não são daqui.
  const parametros = {};
  const avisosParametros = [];
  if (!precificacao.existe) avisosParametros.push(...precificacao.avisos);
  for (const k of CHAVES_PARAMETROS) {
    const p = precificacao.parametros[k];
    parametros[k] = { valor: p ? p.valor : null, unidade: p ? p.unidade : '' };
    if (precificacao.existe && parametros[k].valor == null) avisosParametros.push(`Parâmetro ${k} ${p && precificacao.avisos.some((a) => a.includes(`Parâmetro ${k} está a definir`)) ? 'está a definir' : 'ausente ou ilegível'} em ${ARQUIVO_PRECIFICACAO}.`);
  }
  return {
    arquivo: ARQUIVO_PRECIFICACAO, parametros, perfil, modelo, propostas,
    avisos: [...perfil.avisos, ...modelo.avisos, ...avisosParametros, ...avisosPropostas],
  };
}

module.exports = { lerContratos, lerPropostasAceitas, lerProposta, ARQUIVO_MODELO, DIR_PROPOSTAS, CHAVES_PARAMETROS, DIR_NEGOCIO };
