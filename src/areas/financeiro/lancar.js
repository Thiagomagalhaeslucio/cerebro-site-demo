'use strict';

// Motor dos lançamentos do financeiro: PURO, sem E/S. Recebe o texto de panelas.md e de
// movimentos.md, uma operação e a data de hoje; devolve os textos novos, a pré-visualização,
// avisos e erros. As regras e os formatos são os da skill "financeiro" do vault (fonte única);
// os números das premissas (transporte) vêm de config.json → financeiro.lancar.
// Contas em centavos inteiros: nada de ponto flutuante nas somas.

const { parsePanelas, parseMovimentos } = require('./data');
const { findSection } = require('../../md');
const { formatoDe } = require('./formato');
const { lerDivisao, divisaoCompleta } = require('./divisao');
const { diaDaSemana, isISODate } = require('../../datas');

const EOL = /\r?\n/;
const MENOS = '−'; // o "−" que o vault usa em "+ trem −5.50"
const OBS_PENDENTE = 'pago da conta, reposição pendente';
// Quem pode ser "repor de": as três panelas fixas e a que acumula as metas (o id vem de config → formato).
const reporDe = (F) => ['pessoal', 'margem', 'reserva', F.painelMeta];
const SAI_DE = ['vr', 'vt', 'pessoal', 'margem', 'conta', 'trem'];
const VALOR_MAXIMO_CENTAVOS = 1e9; // R$ 10 milhões: acima disso é digitação errada
const MODOS_REPOSICAO = ['quitar', 'livre'];
const OBS_ADIANTADA = 'reposição adiantada';
const MAX_PENDENCIAS = 100;

const cents = (n) => Math.round(n * 100);
const fmt = (c) => (c / 100).toFixed(2);
const norm = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

// ---------- validação ----------

const CAMPOS = {
  gasto: ['valor', 'descricao', 'saiDe', 'reporDe'],
  transporte: [],
  entrada: ['panela', 'valor', 'descricao'],
  reposicao: ['modo', 'panela', 'valor', 'pendencias'],
  recarga: ['valor'],
  salario: ['valor'],
  ajuste: ['panela', 'saldoReal'],
};

// "12,5", "12.50" e 12.5 valem; mais de 2 casas, milhar e sinal não.
function lerDinheiro(v, nome, { permitirZero = false } = {}) {
  const texto = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(texto)) return { erro: `${nome} inválido: use um número com até 2 casas (ex.: 12,50).` };
  const c = cents(Number(texto.replace(',', '.')));
  if (c <= 0 && !permitirZero) return { erro: `${nome} precisa ser maior que zero.` };
  if (c > VALOR_MAXIMO_CENTAVOS) return { erro: `${nome} grande demais; confira o valor.` };
  return { c };
}

function lerDescricao(v) {
  if (typeof v !== 'string') return { erro: 'Informe a descrição.' };
  if (/[\r\n]/.test(v)) return { erro: 'A descrição não pode ter quebra de linha.' };
  const d = v.replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  if (!d) return { erro: 'Informe a descrição.' };
  if (d.length > 120) return { erro: 'Descrição com mais de 120 caracteres.' };
  if (d.includes('✔')) return { erro: 'A descrição não pode conter "✔" (é a marca de reposição quitada).' };
  return { d };
}

// Ids das pendências marcadas, com descrição e valor para conferência contra o arquivo.
function lerPendencias(v, out, erros) {
  if (!Array.isArray(v) || !v.length) return void erros.push('Marque ao menos uma pendência para quitar.');
  if (v.length > MAX_PENDENCIAS) return void erros.push(`Pendências demais numa reposição (máximo ${MAX_PENDENCIAS}).`);
  const lista = [];
  for (const it of v) {
    const dinheiro = it && typeof it === 'object' ? lerDinheiro(it.valor, 'Valor da pendência') : { erro: 'Pendência inválida.' };
    if (dinheiro.erro) return void erros.push(dinheiro.erro);
    if (!Number.isInteger(it.id) || it.id < 0 || typeof it.descricao !== 'string' || Object.keys(it).some((k) => !['id', 'descricao', 'valor'].includes(k))) return void erros.push('Pendência inválida: informe id, descrição e valor.');
    lista.push({ id: it.id, descricao: it.descricao.trim(), c: dinheiro.c });
  }
  if (new Set(lista.map((x) => x.id)).size !== lista.length) return void erros.push('Pendência repetida na lista.');
  out.pendencias = lista.sort((a, b) => a.id - b.id);
}

function validar(op, hoje, ids, F = formatoDe()) {
  const REPOR_DE = reporDe(F);
  const erros = [];
  if (!op || typeof op !== 'object' || Array.isArray(op)) return { erros: ['Operação inválida.'] };
  const permitidos = CAMPOS[op.tipo];
  if (!permitidos) return { erros: [`Operação desconhecida: "${op.tipo}".`] };
  for (const k of Object.keys(op)) if (!['tipo', 'data', 'confirmar', ...permitidos].includes(k)) erros.push(`Campo não aceito nesta operação: "${k}".`);
  if (op.confirmar !== undefined && typeof op.confirmar !== 'boolean') erros.push('"confirmar" deve ser verdadeiro ou falso.');

  const data = op.data === undefined || op.data === '' ? hoje : op.data;
  if (!isISODate(data)) erros.push(`Data inválida: "${op.data}" (use AAAA-MM-DD).`);
  else if (data > hoje) erros.push(`A data ${data} é futura; lance só o que já aconteceu.`);

  const out = { tipo: op.tipo, data, confirmar: op.confirmar === true };
  const dinheiro = (campo, nome, opcoes) => {
    const r = lerDinheiro(op[campo], nome, opcoes);
    if (r.erro) erros.push(r.erro);
    else out[campo] = r.c;
  };
  const panela = (campo, lista) => {
    if (!ids.includes(op[campo])) erros.push(`Panela desconhecida: "${op[campo]}".`);
    else if (lista && !lista.includes(op[campo])) erros.push(`Panela "${op[campo]}" não vale aqui (use ${lista.join(', ')}).`);
    else out[campo] = op[campo];
  };
  const descricao = () => {
    const r = lerDescricao(op.descricao);
    if (r.erro) erros.push(r.erro);
    else out.descricao = r.d;
  };

  switch (op.tipo) {
    case 'gasto':
      dinheiro('valor', 'Valor');
      descricao();
      if (!SAI_DE.includes(op.saiDe)) erros.push(`"Sai de" inválido: "${op.saiDe}" (use ${SAI_DE.join(', ')}).`);
      else out.saiDe = op.saiDe;
      if (op.reporDe !== undefined) {
        if (op.saiDe !== 'conta') erros.push('"Repor de" só vale para gasto pago da conta.');
        else if (!REPOR_DE.includes(op.reporDe)) erros.push(`"Repor de" inválido: "${op.reporDe}" (use ${REPOR_DE.join(', ')}).`);
        else out.reporDe = op.reporDe;
      }
      break;
    case 'entrada':
      panela('panela');
      dinheiro('valor', 'Valor');
      descricao();
      break;
    case 'reposicao':
      if (!MODOS_REPOSICAO.includes(op.modo)) erros.push('Escolha o modo da reposição: "quitar" pendências ou "livre" (adiantamento). O site nunca quita por ordem de data.');
      else out.modo = op.modo;
      panela('panela', REPOR_DE);
      dinheiro('valor', 'Valor');
      if (op.modo === 'livre' && op.pendencias !== undefined) erros.push('Transferência livre não quita pendência: não envie "pendencias".');
      if (op.modo === 'quitar') lerPendencias(op.pendencias, out, erros);
      break;
    case 'recarga':
    case 'salario':
      dinheiro('valor', op.tipo === 'salario' ? 'Salário líquido' : 'Valor');
      break;
    case 'ajuste':
      panela('panela');
      dinheiro('saldoReal', 'Saldo real', { permitirZero: true });
      break;
    default:
      break;
  }
  return { erros, op: out };
}

// ---------- edição de texto (linhas, preservando o resto do arquivo) ----------

const dividir = (txt) => ({ linhas: txt.split(EOL), eol: txt.includes('\r\n') ? '\r\n' : '\n' });
const juntar = (linhas, eol) => linhas.join(eol);
const ehTitulo = (l) => /^##\s/.test(l);

// [inicio, fim) das linhas do corpo da seção cujo título começa com `prefixo` (sem acento).
function achaSecao(linhas, prefixo) {
  const i = linhas.findIndex((l) => ehTitulo(l) && norm(l.replace(/^##\s+/, '')).startsWith(norm(prefixo)));
  if (i < 0) return null;
  let fim = linhas.length;
  for (let j = i + 1; j < linhas.length; j++) if (ehTitulo(linhas[j])) { fim = j; break; }
  return { titulo: i, inicio: i + 1, fim };
}

function atualizarSaldos(linhas, saldo, hoje) {
  const sec = achaSecao(linhas, 'Saldos atuais');
  if (!sec) throw new Error('panelas.md: seção "Saldos atuais" não encontrada.');
  linhas[sec.titulo] = linhas[sec.titulo].replace(/\(em\s+\d{4}-\d{2}-\d{2}\)/, `(em ${hoje})`);

  let iSaldo = -1;
  let iId = -1;
  for (let i = sec.inicio; i < sec.fim; i++) {
    const l = linhas[i];
    if (!l.trim().startsWith('|')) continue;
    const celulas = l.split('|');
    const nomes = celulas.map((c) => norm(c));
    if (iSaldo < 0) {
      iSaldo = nomes.indexOf('saldo');
      iId = nomes.indexOf('id');
      continue;
    }
    if (/^\|?\s*:?-{3,}/.test(l.trim())) continue;
    const id = celulas[iId]?.trim();
    if (id in saldo) {
      celulas[iSaldo] = ` ${fmt(saldo[id])} `;
      linhas[i] = celulas.join('|');
    }
  }
  if (iSaldo < 0) throw new Error('panelas.md: tabela de saldos não encontrada.');

  // Patrimônio e livre, só o número (o resto da frase fica como está).
  const patrimonio = Object.entries(saldo).filter(([id]) => id !== 'vt').reduce((a, [, v]) => a + v, 0);
  const livre = saldo.pessoal + saldo.margem;
  let achouPat = false;
  let achouLivre = false;
  for (let i = sec.inicio; i < sec.fim; i++) {
    if (/Patrim[oô]nio total:/.test(linhas[i])) {
      linhas[i] = linhas[i].replace(/(Patrim[oô]nio total:\s*(?:R\$\s*)?)([\d.,]*\d)/, (_, pre) => pre + fmt(patrimonio));
      achouPat = true;
    } else if (/^Livre[^:]*:/.test(linhas[i])) {
      linhas[i] = linhas[i].replace(/(^Livre[^:]*:\s*(?:R\$\s*)?)([\d.,]*\d)/, (_, pre) => pre + fmt(livre));
      achouLivre = true;
    }
  }
  if (!achouPat || !achouLivre) throw new Error('panelas.md: faltam as linhas "Patrimônio total:" e "Livre ...:" na seção de saldos.');
  return { patrimonio, livre };
}

// Linhas "- AAAA-MM-DD — panela — valor — descrição" ainda não quitadas, na ordem do arquivo.
// Mesmo critério de parsePendentes (data.js): os índices precisam andar juntos.
const ehPendente = (item) => !/^nenhuma/i.test(item) && !item.includes('✔');
function linhasPendentes(linhas) {
  const sec = achaSecao(linhas, 'Reposições pendentes');
  if (!sec) return { sec: null, itens: [] };
  const itens = [];
  for (let i = sec.inicio; i < sec.fim; i++) {
    const m = /^\s*-\s+(.*)$/.exec(linhas[i]);
    if (m && ehPendente(m[1].trim())) itens.push(i);
  }
  return { sec, itens };
}

function atualizarPendentes(linhas, { adicionar, quitar, hoje, quitadasDe }) {
  if (!adicionar.length && !quitar.length) return;
  const { sec, itens } = linhasPendentes(linhas);
  if (!sec) throw new Error('panelas.md: seção "Reposições pendentes" não encontrada.');
  for (const k of quitar) linhas[itens[k]] = `${linhas[itens[k]].replace(/\s+$/, '')} ✔ reposto ${quitadasDe}`;

  let fim = sec.fim;
  let ultimo = -1;
  for (let i = sec.inicio; i < fim; i++) if (/^\s*-\s+/.test(linhas[i])) ultimo = i;
  // "Nenhuma." some quando entra a primeira pendência.
  if (adicionar.length) {
    for (let i = sec.inicio; i < fim; i++) {
      const m = /^\s*-\s+(.*)$/.exec(linhas[i]);
      if (m && /^nenhuma/i.test(m[1].trim())) { linhas.splice(i, 1); fim--; if (ultimo >= i) ultimo--; i--; }
    }
  }
  const novas = adicionar.map((a) => `- ${a.data} — ${a.panela} — ${fmt(a.c)} — ${a.descricao}`);
  const pendentesDepois = itens.length - quitar.length + adicionar.length;
  if (novas.length) linhas.splice(ultimo < 0 ? sec.inicio : ultimo + 1, 0, ...novas);
  if (!pendentesDepois) {
    const fimNovo = achaSecao(linhas, 'Reposições pendentes').fim;
    let ult = fimNovo - 1;
    while (ult > sec.inicio && linhas[ult].trim() === '') ult--;
    linhas.splice(ult + 1, 0, '- Nenhuma pendente.');
  }
}

// Seção Salário: o novo vira "Último" e o antigo "Último" vira "Anterior" (um só, o mais recente).
function atualizarSalario(linhas, { valor, data, divisao }) {
  const sec = achaSecao(linhas, 'Salário');
  if (!sec) throw new Error('panelas.md: seção "Salário" não encontrada.');
  const bloco = (rotulo, c, d, div) => [
    `- ${rotulo}: R$${fmt(c)} recebido em ${d}`,
    `  (${div.map(([id, v]) => `${id} ${fmt(v)}`).join(' / ')}).`,
  ];
  // Um item é a linha "- ..." e as linhas de continuação (recuadas) que vêm depois.
  const itens = [];
  for (let i = sec.inicio; i < sec.fim; i++) {
    if (/^\s*-\s/.test(linhas[i])) itens.push({ ini: i, fim: i + 1 });
    else if (itens.length && /^\s+\S/.test(linhas[i]) && itens[itens.length - 1].fim === i) itens[itens.length - 1].fim = i + 1;
  }
  const ultimo = itens.find((it) => /^\s*-\s*Último:/.test(linhas[it.ini]));
  const anterior = itens.find((it) => /^\s*-\s*Anterior:/.test(linhas[it.ini]));
  const antigo = ultimo ? linhas.slice(ultimo.ini, ultimo.fim).map((l, k) => (k === 0 ? l.replace(/Último:/, 'Anterior:') : l)) : [];

  const novo = [...bloco('Último', valor, data, divisao), ...antigo];
  // Edita de baixo para cima, para um splice não deslocar o índice do outro.
  const edicoes = [];
  if (anterior) edicoes.push({ ...anterior, novo: [] });
  if (ultimo) edicoes.push({ ...ultimo, novo });
  else edicoes.push({ ini: itens.length ? itens[0].ini : sec.inicio + (linhas[sec.inicio]?.trim() === '' ? 1 : 0), fim: itens.length ? itens[0].ini : sec.inicio + (linhas[sec.inicio]?.trim() === '' ? 1 : 0), novo });
  for (const e of edicoes.sort((a, b) => b.ini - a.ini)) linhas.splice(e.ini, e.fim - e.ini, ...e.novo);
}

function acrescentarMovimentos(txt, movs) {
  const { linhas, eol } = dividir(txt);
  const h = linhas.findIndex((l) => {
    if (!l.trim().startsWith('|')) return false;
    const c = l.split('|').map(norm);
    return c.includes('data') && c.includes('panela');
  });
  if (h < 0) throw new Error('movimentos.md: tabela de movimentos não encontrada.');
  let fim = h;
  while (fim + 1 < linhas.length && linhas[fim + 1].trim().startsWith('|')) fim++;
  const novas = movs.map((m) => `| ${m.data} | ${m.panela} | ${m.tipo} | ${fmt(m.c)} | ${m.descricao} | ${m.obs || ''} |`);
  linhas.splice(fim + 1, 0, ...novas);
  return { txt: juntar(linhas, eol), indice: fim + 1, linhas: novas };
}


// ---------- verificação pós-escrita, em memória ----------

function contar(lista) {
  const m = new Map();
  for (const x of lista) m.set(x, (m.get(x) || 0) + 1);
  return m;
}

// Devolve a lista de problemas (vazia = ok). Lê os textos novos com os MESMOS parsers do site.
function verificar({ antes, panelasTxt, movimentosTxt, saldoEsperado, indiceMov, movsNovos, pendentesEsperados }) {
  const problemas = [];
  let p;
  let movs;
  const avisosP = [];
  const avisosM = [];
  try {
    p = parsePanelas(panelasTxt, avisosP);
    movs = parseMovimentos(movimentosTxt, avisosM);
  } catch (err) {
    return [`Os textos novos não passam nos leitores do site (${err.message}).`];
  }
  for (const [chave, quantos] of contar([...avisosP, ...avisosM])) {
    if (quantos > (antes.avisos.get(chave) || 0)) problemas.push(`Aviso novo nos leitores: ${chave}`);
  }
  const lido = Object.fromEntries(p.saldos.map((s) => [s.id, s.saldo == null ? null : cents(s.saldo)]));
  for (const [id, esperado] of Object.entries(saldoEsperado)) {
    if (lido[id] !== esperado) problemas.push(`Saldo de "${id}" ficaria ${lido[id] == null ? 'ilegível' : fmt(lido[id])}, esperado ${fmt(esperado)}.`);
  }
  const soma = p.saldos.filter((s) => s.id !== 'vt').reduce((a, s) => a + cents(s.saldo || 0), 0);
  if (p.patrimonioEscrito == null || cents(p.patrimonioEscrito) !== soma) problemas.push(`A soma dos saldos sem o VT (${fmt(soma)}) não bate com o patrimônio escrito (${p.patrimonioEscrito}).`);
  const livre = (lido.pessoal ?? 0) + (lido.margem ?? 0);
  if (p.livreEscrito == null || cents(p.livreEscrito) !== livre) problemas.push(`O livre escrito (${p.livreEscrito}) não bate com pessoal + margem (${fmt(livre)}).`);
  if (movs.length !== antes.totalMovimentos + movsNovos.length) problemas.push('A contagem de movimentos não bate com o esperado.');
  if (p.pendentes.length !== pendentesEsperados) problemas.push(`Reposições pendentes: ${p.pendentes.length}, esperado ${pendentesEsperados}.`);

  // Movimento antigo não muda: tirando as linhas novas, o texto é o de antes.
  const novas = dividir(movimentosTxt).linhas;
  novas.splice(indiceMov, movsNovos.length);
  if (juntar(novas, '\n') !== juntar(dividir(antes.movimentosTxt).linhas, '\n')) problemas.push('O histórico de movimentos antigo seria alterado.');
  return problemas;
}

// ---------- o motor ----------

function lancar({ panelasTxt, movimentosTxt, operacao, hoje }, { config = {}, transformarSaida = null } = {}) {
  const F = config.formato || formatoDe();
  const DESC_AJUSTE = F.descricaoAjuste;
  const res = { ok: false, erros: [], avisos: [], exigeConfirmacao: false, gravavel: false, previa: null, novos: null };
  const falha = (...erros) => { res.erros.push(...erros); return res; };

  if (!isISODate(hoje)) return falha('Data de hoje inválida.');
  const avisosAntes = [];
  let p;
  let movsAntes;
  try {
    p = parsePanelas(panelasTxt, avisosAntes);
    movsAntes = parseMovimentos(movimentosTxt, avisosAntes);
  } catch (err) {
    return falha(`Não consegui ler os arquivos (${err.message}).`);
  }
  if (p.saldos.some((s) => s.saldo == null)) return falha('Há saldo ilegível em panelas.md; corrija antes de lançar.');
  const ids = p.saldos.map((s) => s.id);
  for (const id of ['conta', 'vt', 'trem', 'vr', 'pessoal', 'margem', 'reserva', F.painelMeta]) if (!ids.includes(id)) return falha(`Falta a panela "${id}" em panelas.md.`);

  const v = validar(operacao, hoje, ids, F);
  if (v.erros.length) return falha(...v.erros);
  const op = v.op;

  const nomes = Object.fromEntries(p.saldos.map((s) => [s.id, s.panela]));
  const antes = Object.fromEntries(p.saldos.map((s) => [s.id, cents(s.saldo)]));
  const saldo = { ...antes };
  const movs = [];
  const pend = { adicionar: [], quitar: [] };
  const extras = []; // avisos informativos do próprio lançamento
  let salario = null;
  const quitadas = []; // reposição: pendências marcadas
  let continuam = [];

  const nomeDe = (id) => nomes[id] || id;
  // Regra 1: todo movimento do VT mexe no mesmo valor e sentido na Conta.
  const mexe = (id, delta) => { saldo[id] += delta; if (id === 'vt') saldo.conta += delta; };

  switch (op.tipo) {
    case 'gasto': {
      const mov = { data: op.data, panela: op.saiDe, tipo: 'saída', c: op.valor, descricao: op.descricao, obs: '' };
      if (op.saiDe === 'conta' && op.reporDe) {
        // Regra 6: debita a Conta na hora; a panela só é debitada na reposição.
        saldo.conta -= op.valor;
        mov.panela = op.reporDe;
        mov.obs = OBS_PENDENTE;
        pend.adicionar.push({ data: op.data, panela: op.reporDe, c: op.valor, descricao: op.descricao });
        if (op.reporDe === 'reserva' || op.reporDe === F.painelMeta)
          res.avisos.push({ texto: `Repor de ${nomeDe(op.reporDe)} atrasa a meta (${F.rotulos.marco}/${F.rotulos.metaFinal} ou reserva). Confirme se é isso mesmo.`, confirmar: true });
      } else {
        mexe(op.saiDe, -op.valor);
      }
      movs.push(mov);
      break;
    }
    case 'transporte': {
      const dia = diaDaSemana(op.data);
      if (dia === 0) return falha('Domingo: sem transporte padrão. Se houve, lance como gasto do VT.');
      const t = config.transporte;
      if (!t) return falha('config.json: faltam as premissas financeiro.lancar.transporte.');
      const vt = cents(dia === 6 ? t.vtSabado : t.vtDiaUtil);
      const trem = cents(t.trem);
      mexe('vt', -vt);
      saldo.trem -= trem;
      movs.push({ data: op.data, panela: 'vt', tipo: 'saída', c: vt, descricao: `Transporte do dia (${dia === 6 ? 'sábado' : 'dia de semana'})`, obs: `+ trem ${MENOS}${fmt(trem)}` });
      break;
    }
    case 'entrada':
      mexe(op.panela, op.valor);
      movs.push({ data: op.data, panela: op.panela, tipo: 'entrada', c: op.valor, descricao: op.descricao, obs: '' });
      break;
    case 'recarga':
      mexe('vt', -op.valor);
      saldo.trem += op.valor;
      movs.push({ data: op.data, panela: 'trem', tipo: 'recarga', c: op.valor, descricao: 'Recarga do cartão do trem', obs: '' });
      break;
    case 'reposicao': {
      // Regra 7: recusa se a panela não tiver saldo.
      if (antes[op.panela] < op.valor) return falha(`${nomeDe(op.panela)} tem R$ ${fmt(antes[op.panela])}, menos que os R$ ${fmt(op.valor)} da reposição.`);
      let obs = OBS_ADIANTADA;
      if (op.modo === 'quitar') {
        // Só quita o que foi marcado: cada id tem de existir, ser da panela e bater em descrição e valor.
        let soma = 0;
        for (const m of op.pendencias) {
          const it = p.pendentes[m.id];
          if (!it || it.panela !== op.panela || it.valor == null || cents(it.valor) !== m.c || it.descricao !== m.descricao)
            return falha(`A pendência ${m.id} ("${m.descricao}", R$ ${fmt(m.c)}) não existe mais assim em ${nomeDe(op.panela)}; refaça a seleção.`);
          soma += m.c;
        }
        if (soma !== op.valor) return falha(`A soma das pendências marcadas (R$ ${fmt(soma)}) não bate com o valor da reposição (R$ ${fmt(op.valor)}).`);
        for (const m of op.pendencias) {
          const it = p.pendentes[m.id];
          pend.quitar.push(m.id);
          quitadas.push({ id: m.id, data: it.data, panela: it.panela, valor: m.c / 100, descricao: it.descricao });
          extras.push(`Quita: ${it.data} — ${nomeDe(it.panela)} — R$ ${fmt(m.c)} — ${it.descricao}`);
        }
        obs = `repõe ${quitadas.map((q) => q.descricao).join('; ').replace(/\|/g, '/')}`;
      }
      saldo[op.panela] -= op.valor;
      saldo.conta += op.valor;
      movs.push({ data: op.data, panela: `${op.panela}→conta`, tipo: 'transferência', c: op.valor, descricao: `Reposição na conta (${nomeDe(op.panela)})`, obs });
      continuam = p.pendentes.map((it, k) => ({ ...it, id: k })).filter((it) => it.panela === op.panela && !pend.quitar.includes(it.id));
      for (const it of continuam) if (op.modo === 'quitar') extras.push(`Continua pendente: ${it.data} — ${nomeDe(it.panela)} — ${it.valor == null ? '?' : `R$ ${fmt(cents(it.valor))}`} — ${it.descricao}`);
      if (op.modo === 'livre') extras.push(continuam.length ? `Transferência livre: nenhuma pendência é quitada (${continuam.length} de ${nomeDe(op.panela)} continuam).` : 'Transferência livre: sem pendência a quitar.');
      break;
    }
    case 'salario': {
      const regra = lerDivisao(panelasTxt, F);
      if (regra.erro) return falha(regra.erro);
      if (p.metasFaltando.includes('reserva')) return falha('Meta da reserva não encontrada em panelas.md; não dá para escolher a divisão do salário.');
      const completa = antes.reserva >= cents(p.metas.reserva);
      const pct = completa ? regra.completa : regra.normal;
      const parte = {};
      let somaOutras = 0;
      for (const id of ['reserva', 'pessoal', 'margem']) { parte[id] = Math.round((op.valor * pct[id]) / 100); somaOutras += parte[id]; }
      parte[F.painelMeta] = op.valor - somaOutras; // a sobra de arredondamento fica na panela das metas
      const ordem = [F.painelMeta, 'reserva', 'pessoal', 'margem'];
      for (const id of ordem) {
        saldo[id] += parte[id];
        if (parte[id] > 0) movs.push({ data: op.data, panela: id, tipo: 'entrada', c: parte[id], descricao: 'Divisão do salário', obs: '' });
      }
      salario = { valor: op.valor, data: op.data, divisao: ordem.map((id) => [id, parte[id]]) };
      extras.push(`Divisão ${completa ? 'com a reserva completa' : 'normal'}: ${ordem.map((id) => `${nomeDe(id)} ${pct[id]}%`).join(', ')}.`);
      if (p.salario?.data && op.data <= p.salario.data)
        res.avisos.push({ texto: `O último salário registrado é de ${p.salario.data}; este tem data ${op.data}. Confirme que não é repetido.`, confirmar: true });
      if (!pct.reserva) extras.push('Reserva em 0%: sem movimento na reserva.');
      break;
    }
    case 'ajuste': {
      const diff = op.saldoReal - antes[op.panela];
      if (diff === 0) return falha(`O saldo de ${nomeDe(op.panela)} já é R$ ${fmt(op.saldoReal)}: nada a ajustar.`);
      saldo[op.panela] += diff; // só a panela informada: a Conta não muda
      movs.push({ data: op.data, panela: op.panela, tipo: diff > 0 ? 'entrada' : 'saída', c: Math.abs(diff), descricao: DESC_AJUSTE, obs: `saldo real ${fmt(op.saldoReal)}` });
      extras.push(`Diferença (real − registrado): ${diff > 0 ? '+' : '−'}R$ ${fmt(Math.abs(diff))}.`);
      break;
    }
    default:
      return falha('Operação desconhecida.');
  }

  // ---------- avisos da regra 11 ----------
  for (const id of ids) {
    if (saldo[id] < 0 && saldo[id] < antes[id]) res.avisos.push({ texto: `Saldo negativo na panela "${nomeDe(id)}" (R$ ${fmt(saldo[id])}).`, confirmar: true });
  }
  if (saldo.vt > saldo.conta && (saldo.vt > antes.vt || saldo.conta < antes.conta)) res.avisos.push({ texto: 'VT maior que a Conta, confira.', confirmar: true });
  const marco = cents(p.metas.marco);
  const metaFinal = cents(p.metas.metaFinal);
  const PM = F.painelMeta;
  if (!p.metasFaltando.includes('marco') && antes[PM] < marco && saldo[PM] >= marco) res.avisos.push({ texto: F.rotulos.avisoMarco, confirmar: false });
  if (!p.metasFaltando.includes('reserva') && antes.reserva < cents(p.metas.reserva) && saldo.reserva >= cents(p.metas.reserva))
    res.avisos.push({ texto: `Reserva completa: a divisão muda para ${divisaoCompleta(panelasTxt, F) ?? 'a da regra de panelas.md'} no próximo salário.`, confirmar: false });
  if (saldo[PM] !== antes[PM] && !p.metasFaltando.includes('metaFinal'))
    res.avisos.push({ texto: `${F.rotulos.metaFinal}: ${fmt(saldo[PM])} / ${p.metas.metaFinal} — ${((saldo[PM] / metaFinal) * 100).toFixed(1).replace('.', ',')}%.`, confirmar: false });
  res.exigeConfirmacao = res.avisos.some((a) => a.confirmar);

  // ---------- textos novos ----------
  let novoPanelas;
  let novoMov;
  let indiceMov;
  try {
    const { linhas, eol } = dividir(panelasTxt);
    atualizarSaldos(linhas, saldo, hoje);
    atualizarPendentes(linhas, { adicionar: pend.adicionar, quitar: pend.quitar, hoje, quitadasDe: hoje });
    if (salario) atualizarSalario(linhas, salario);
    novoPanelas = juntar(linhas, eol);
    const r = acrescentarMovimentos(movimentosTxt, movs);
    novoMov = r.txt;
    indiceMov = r.indice;
  } catch (err) {
    return falha(err.message);
  }
  if (transformarSaida) ({ panelasTxt: novoPanelas, movimentosTxt: novoMov } = transformarSaida({ panelasTxt: novoPanelas, movimentosTxt: novoMov }));

  const problemas = verificar({
    antes: { avisos: contar(avisosAntes), totalMovimentos: movsAntes.length, movimentosTxt },
    panelasTxt: novoPanelas,
    movimentosTxt: novoMov,
    saldoEsperado: saldo,
    indiceMov,
    movsNovos: movs,
    pendentesEsperados: p.pendentes.length - pend.quitar.length + pend.adicionar.length,
  });
  if (problemas.length) return falha('Verificação antes de gravar falhou; nada foi gravado.', ...problemas);

  // ---------- pré-visualização ----------
  const soma = (s) => Object.entries(s).filter(([id]) => id !== 'vt').reduce((a, [, c]) => a + c, 0);
  res.previa = {
    data: op.data,
    saldos: ids.filter((id) => saldo[id] !== antes[id]).map((id) => ({ id, panela: nomeDe(id), antes: antes[id] / 100, depois: saldo[id] / 100 })),
    patrimonio: { antes: soma(antes) / 100, depois: soma(saldo) / 100 },
    livre: { antes: (antes.pessoal + antes.margem) / 100, depois: (saldo.pessoal + saldo.margem) / 100 },
    movimentos: movs.map((m) => ({ data: m.data, panela: m.panela, tipo: m.tipo, valor: m.c / 100, descricao: m.descricao, obs: m.obs })),
    pendentes: { antes: p.pendentes.length, depois: p.pendentes.length - pend.quitar.length + pend.adicionar.length },
    quitadas,
    continuam: continuam.map((it) => ({ id: it.id, data: it.data, panela: it.panela, valor: it.valor, descricao: it.descricao })),
    notas: extras,
  };
  res.novos = { panelasTxt: novoPanelas, movimentosTxt: novoMov };
  res.ok = true;
  res.gravavel = !res.exigeConfirmacao || op.confirmar;
  return res;
}

module.exports = { lancar, validar, verificar, lerDinheiro, lerDivisao, OBS_PENDENTE, reporDe, SAI_DE };
