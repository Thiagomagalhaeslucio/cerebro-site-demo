(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const brl = (n) => BRL.format(n);
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const semAcento = (t) => String(t).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

  const OPERACOES = [
    ['gasto', 'Gasto'], ['transporte', 'Transporte do dia'], ['entrada', 'Entrada'], ['reposicao', 'Reposição'],
    ['recarga', 'Recarga do trem'], ['salario', 'Salário'], ['ajuste', 'Ajuste de saldo'],
  ];
  const CAMPOS = {
    gasto: ['saiDe', 'valor', 'data', 'descricao'],
    transporte: ['data'],
    entrada: ['panela', 'valor', 'data', 'descricao'],
    reposicao: ['panela', 'modo', 'pendencias', 'valor', 'data'],
    recarga: ['valor', 'data'],
    salario: ['valor', 'data'],
    ajuste: ['panela', 'saldoReal', 'data'],
  };
  const TODOS = ['saiDe', 'panela', 'modo', 'pendencias', 'valor', 'saldoReal', 'data', 'descricao'];
  const reporDe = () => ['pessoal', 'margem', 'reserva', ctx.formato.painelMeta]; // a última é a panela das metas (config → formato)
  const DICA_OP = {
    gasto: 'Gasto de lanche e afins: escolha de onde saiu; o site não adivinha.',
    transporte: 'Dia útil ou sábado, no valor das premissas. Domingo não tem transporte padrão.',
    entrada: 'Entrada em uma panela (rendimento, depósito). No VT, a Conta sobe junto.',
    reposicao: 'Passa dinheiro da panela para a Conta. Quitar: marque as pendências que ela paga (o valor é a soma). Livre: valor digitado, sem quitar nada. O site nunca escolhe pendência sozinho.',
    recarga: 'Sai do VT (e da Conta) e entra no cartão do trem.',
    salario: 'Divide o líquido pela regra de panelas.md; a sobra de centavos fica na panela das metas.',
    ajuste: 'Informe o saldo real; o site registra só a diferença, naquela panela.',
  };

  let ctx = null; // o que /api/financeiro/lancar devolveu
  let token = null;
  let op = 'gasto';
  let previa = null; // { assinatura, resposta }
  let versaoDaPrevia = null;

  // ---------- rede ----------
  async function pegarToken() {
    const r = await fetch('/api/sessao', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    token = (await r.json()).token;
  }

  async function postar(rota, corpo, tentouDeNovo = false) {
    const r = await fetch(`/api/financeiro/${rota}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Cerebro-Token': token },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && j.erro === 'token' && !tentouDeNovo) { await pegarToken(); return postar(rota, corpo, true); }
    return { status: r.status, corpo: j };
  }

  async function carregarContexto() {
    const r = await fetch('/api/financeiro/lancar', { cache: 'no-store' });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
    ctx = j;
  }

  // ---------- formulário ----------
  const nomeDe = (id) => ctx.panelas.find((p) => p.id === id)?.panela || id;
  const saldoDe = (id) => ctx.panelas.find((p) => p.id === id)?.saldo ?? 0;

  function opcoesSaiDe() {
    const o = [['', 'Escolha de onde saiu'], ['vr', nomeDe('vr')], ['vt', 'Débito do dia a dia (VT)']];
    for (const id of ['pessoal', 'margem', 'conta', 'trem']) o.push([`direto:${id}`, `${nomeDe(id)}, direto`]);
    for (const id of reporDe()) o.push([`conta:${id}`, `Pago da conta, repor de ${nomeDe(id)}`]);
    return o;
  }

  function montarOperacoes() {
    $('operacoes').replaceChildren(...OPERACOES.map(([id, nome]) =>
      el('button', { type: 'button', class: 'botao', 'data-op': id, 'aria-pressed': String(id === op), textContent: nome })));
  }

  function trocarOperacao(nova, { focar = true } = {}) {
    op = nova;
    for (const b of $('operacoes').children) b.setAttribute('aria-pressed', String(b.dataset.op === op));
    for (const c of TODOS) $(`c-${c}`).hidden = !CAMPOS[op].includes(c);
    const sel = $('panela');
    const lista = op === 'reposicao' ? reporDe() : ctx.panelas.map((p) => p.id);
    sel.replaceChildren(...lista.map((id) => el('option', { value: id, textContent: nomeDe(id) })));
    // Reposição começa na panela que tem pendência mais antiga; as demais, no Pessoal.
    const comPendencia = ctx.pendentes.find((p) => reporDe().includes(p.panela))?.panela;
    sel.value = op === 'reposicao' && comPendencia ? comPendencia : 'pessoal';
    $('valor-r').textContent = op === 'salario' ? 'Salário líquido (R$)' : 'Valor (R$)';
    $('op-dica').textContent = DICA_OP[op];
    $('data').max = ctx.hoje;
    if (!$('data').value) $('data').value = ctx.hoje;
    $('modo').value = 'quitar';
    montarReposicao();
    fecharPrevia();
    dicas();
    if (focar) primeiroCampo().focus();
  }

  // ---------- reposição: modo e pendências ----------
  const modoDaReposicao = () => (op === 'reposicao' ? $('modo').value : null);
  const chavePend = (p) => `${p.id}|${p.descricao}|${p.valor}`;
  const pendenciasDaPanela = () => ctx.pendentes.filter((p) => p.panela === $('panela').value);
  const virgula = (c) => (c / 100).toFixed(2).replace('.', ',');

  function marcadas() {
    return [...$('pendencias').querySelectorAll('input:checked')].map((i) => pendenciasDaPanela().find((p) => chavePend(p) === i.value)).filter(Boolean);
  }

  function somarMarcadas() {
    const c = marcadas().reduce((a, p) => a + Math.round(p.valor * 100), 0);
    $('valor').value = c ? virgula(c) : '';
  }

  // Lista as pendências da panela, nenhuma marcada por padrão (marcas anteriores sobrevivem a uma releitura).
  function montarReposicao() {
    const quitar = modoDaReposicao() === 'quitar';
    $('c-pendencias').hidden = !(op === 'reposicao' && quitar);
    $('valor').readOnly = op === 'reposicao' && quitar;
    if (op !== 'reposicao') return;
    const antes = new Set([...$('pendencias').querySelectorAll('input:checked')].map((i) => i.value));
    const lista = pendenciasDaPanela().filter((p) => p.valor != null);
    $('pendencias').replaceChildren(...(lista.length
      ? lista.map((p) => el('label', { class: 'opcao' },
        el('input', { type: 'checkbox', value: chavePend(p), checked: antes.has(chavePend(p)) }),
        `${dataBR(p.data)} · ${p.descricao} · ${brl(p.valor)}`))
      : [el('p', { class: 'vazio', textContent: `Nenhuma pendência de ${nomeDe($('panela').value)}. Use a transferência livre.` })]));
    if (quitar) somarMarcadas();
  }

  const primeiroCampo = () => {
    if (op === 'reposicao' && modoDaReposicao() === 'quitar') return $('pendencias').querySelector('input') || $('panela');
    for (const c of ['saiDe', 'panela', 'valor', 'saldoReal', 'data']) if (CAMPOS[op].includes(c)) {
      // depois de salvar, o foco volta ao valor; sem valor, ao primeiro campo
      if (c === 'saiDe' || c === 'panela') continue;
      return $(c);
    }
    return $('previa-btn');
  };

  function dataValor() {
    return $('data').value || ctx.hoje;
  }

  // Sugestão pela descrição, com as palavras-chave de config.json (as mesmas do diagnóstico).
  function sugerir(descricao) {
    const d = semAcento(descricao);
    if (!d.trim()) return null;
    for (const [categoria, chaves] of Object.entries(ctx.categorias)) {
      if (chaves.some((k) => d.includes(semAcento(k)))) return { categoria, destino: ctx.sugestaoPorCategoria[categoria] || null };
    }
    return null;
  }

  // Refaz uma dica só se o conteúdo mudou: o botão dentro dela (Usar) não pode sumir entre o
  // mousedown e o mouseup de um clique, que é quando o campo perde o foco e as dicas são relidas.
  const chaves = new Map();
  function pintar(id, chave, montar) {
    if (chaves.get(id) === chave) return;
    chaves.set(id, chave);
    const alvo = $(id);
    alvo.replaceChildren();
    montar(alvo);
  }

  function dicas() {
    // gasto: sugestão da panela
    const sug = op === 'gasto' ? sugerir($('descricao').value) : null;
    pintar('saiDe-dica', sug ? `${sug.categoria}|${sug.destino}` : '', (dicaSai) => {
      if (sug && sug.destino === 'vr') dicaSai.append(`Pela descrição (${sug.categoria}), parece ${nomeDe('vr')}. `, usar('vr'));
      else if (sug && sug.destino === 'vt') dicaSai.append(`Pela descrição (${sug.categoria}), parece o VT. `, usar('vt'));
      else if (sug && sug.destino === 'pessoal') dicaSai.append(`Pela descrição (${sug.categoria}), é do ${nomeDe('pessoal')}: direto ou pago da conta?`);
      else if (sug && sug.destino === 'pergunte') dicaSai.append(`Pela descrição (${sug.categoria}): sai do VT ou do ${nomeDe('pessoal')} com reposição? Escolha.`);
    });
    dicaValor();
  }

  function dicaValor() {
    const chave = [op, dataValor(), $('panela').value, ctx.versao, modoDaReposicao()].join('|');
    pintar('valor-dica', chave, dicaValorMontar);
  }

  function dicaValorMontar(v) {
    if (op === 'transporte') {
      const dia = new Date(`${dataValor()}T12:00:00Z`).getUTCDay();
      const t = ctx.transporte;
      v.textContent = !t ? '' : dia === 0
        ? 'Domingo: sem transporte padrão. Se houve, lance como gasto do Débito (VT).'
        : `VT ${brl(dia === 6 ? t.vtSabado : t.vtDiaUtil)} e trem ${brl(t.trem)} (${dia === 6 ? 'sábado' : 'dia de semana'}).`;
    } else if (op === 'reposicao') {
      const pend = pendenciasDaPanela().filter((p) => p.valor != null);
      const total = Math.round(pend.reduce((a, p) => a + p.valor * 100, 0)) / 100;
      v.append(`${nomeDe($('panela').value)} tem ${brl(saldoDe($('panela').value))}; pendências: ${pend.length ? `${brl(total)} em ${pend.length}` : 'nenhuma'}.`);
    } else if (op === 'ajuste') {
      v.textContent = `Registrado em ${nomeDe($('panela').value)}: ${brl(saldoDe($('panela').value))}.`;
    }
  }

  const usar = (valor) => el('button', { type: 'button', class: 'botao', textContent: 'Usar', onclick: () => { $('saiDe').value = valor; $('saiDe').focus(); fecharPrevia(); } });

  function lerOperacao() {
    const o = { tipo: op, data: dataValor() };
    const v = (id) => $(id).value.trim();
    if (op === 'gasto') {
      const [modo, panela] = $('saiDe').value.split(':');
      o.valor = v('valor');
      o.descricao = $('descricao').value;
      o.saiDe = panela ? (modo === 'conta' ? 'conta' : panela) : modo;
      if (modo === 'conta' && panela) o.reporDe = panela;
    } else if (op === 'entrada') {
      Object.assign(o, { panela: $('panela').value, valor: v('valor'), descricao: $('descricao').value });
    } else if (op === 'reposicao') {
      Object.assign(o, { modo: $('modo').value, panela: $('panela').value, valor: v('valor') });
      if (o.modo === 'quitar') o.pendencias = marcadas().map((p) => ({ id: p.id, descricao: p.descricao, valor: virgula(Math.round(p.valor * 100)) }));
    } else if (op === 'recarga' || op === 'salario') {
      o.valor = v('valor');
    } else if (op === 'ajuste') {
      Object.assign(o, { panela: $('panela').value, saldoReal: v('saldoReal') });
    }
    return o;
  }

  // ---------- prévia e resultado ----------
  const assinatura = () => JSON.stringify(lerOperacao());

  function fecharPrevia() {
    previa = null;
    $('previa-corpo').replaceChildren(el('p', { class: 'vazio', textContent: 'Preencha o formulário e aperte Enter. Nada é gravado antes de você confirmar.' }));
  }

  function tabelaSaldos(p) {
    return el('table', { class: 'tabela previa-corpo-tabela' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', textContent: 'Panela' }), el('th', { scope: 'col', class: 'n', textContent: 'Antes' }), el('th', { scope: 'col', class: 'n', textContent: 'Depois' }))),
      el('tbody', {}, ...p.saldos.map((s) => el('tr', {}, el('td', { textContent: s.panela }), el('td', { class: 'n suave', textContent: brl(s.antes) }), el('td', { class: 'n', textContent: brl(s.depois) })))),
      el('tfoot', {},
        el('tr', {}, el('td', { textContent: 'Patrimônio' }), el('td', { class: 'n suave', textContent: brl(p.patrimonio.antes) }), el('td', { class: 'n', textContent: brl(p.patrimonio.depois) })),
        el('tr', {}, el('td', { textContent: 'Livre' }), el('td', { class: 'n suave', textContent: brl(p.livre.antes) }), el('td', { class: 'n', textContent: brl(p.livre.depois) }))));
  }

  // "Conta R$ 225,88 para R$ 188,75; patrimônio R$ 2.043,12 para R$ 2.032,62"
  function frase(p) {
    const partes = p.saldos.map((s) => `${s.panela} ${brl(s.antes)} para ${brl(s.depois)}`);
    partes.push(`patrimônio ${brl(p.patrimonio.antes)} para ${brl(p.patrimonio.depois)}`);
    return partes.join('; ');
  }

  function tabelaMovimentos(p) {
    return el('div', { class: 'rolar' }, el('table', { class: 'tabela previa-corpo-tabela' },
      el('thead', {}, el('tr', {}, ...['Data', 'Panela', 'Tipo', 'Valor', 'Descrição'].map((t, i) => el('th', { scope: 'col', class: i === 3 ? 'n' : '', textContent: t })))),
      el('tbody', {}, ...p.movimentos.map((m) => el('tr', {},
        el('td', { textContent: dataBR(m.data) }), el('td', { textContent: m.panela }), el('td', { textContent: m.tipo }),
        el('td', { class: 'n', textContent: brl(m.valor) }),
        el('td', {}, m.descricao, m.obs ? el('span', { class: 'obs', textContent: ` (${m.obs})` }) : null))))));
  }

  function listaPendencias(titulo, itens) {
    return el('div', { class: 'previa-pend' }, el('h3', { class: 'previa-t', textContent: `${titulo} (${itens.length})` }),
      itens.length ? el('ul', { class: 'notas' }, ...itens.map((p) => el('li', { textContent: `${dataBR(p.data)} · ${p.descricao} · ${brl(p.valor)}` })))
        : el('p', { class: 'vazio', textContent: 'Nenhuma.' }));
  }

  function renderPrevia(r) {
    const corpo = $('previa-corpo');
    const filhos = [];
    if (!r.ok) {
      const ul = el('ul', { class: 'avisos' });
      avisos(ul, r.erros, true);
      corpo.replaceChildren(...filhos, ul);
      return;
    }
    filhos.push(el('p', { class: 'resumo-linha', textContent: `${frase(r.previa)}.` }), tabelaSaldos(r.previa),
      el('h3', { class: 'previa-t', textContent: `Vai ser gravado em movimentos.md (${r.previa.movimentos.length === 1 ? '1 linha' : `${r.previa.movimentos.length} linhas`})` }), tabelaMovimentos(r.previa));
    if (op === 'reposicao' && (r.previa.quitadas.length || r.previa.continuam.length)) filhos.push(listaPendencias('Serão marcadas como repostas', r.previa.quitadas), listaPendencias('Continuam pendentes', r.previa.continuam));
    const notas = r.previa.notas.filter((n) => !/^(Quita|Continua pendente):/.test(n));
    if (notas.length) filhos.push(el('ul', { class: 'notas' }, ...notas.map((n) => el('li', { textContent: n }))));
    if (r.avisos.length) {
      const ul = el('ul', { class: 'avisos' });
      avisos(ul, r.avisos.map((a) => (a.confirmar ? `${a.texto} (exige confirmação)` : a.texto)));
      [...ul.children].forEach((li, i) => li.classList.toggle('confirma', r.avisos[i].confirmar));
      filhos.push(ul);
    }
    if (r.exigeConfirmacao) filhos.push(el('label', { class: 'opcao' }, el('input', { type: 'checkbox', id: 'confirmar' }), 'Li os avisos e quero gravar assim mesmo.'));
    const botao = el('button', { type: 'button', class: 'botao', id: 'confirmar-btn', textContent: 'Confirmar e gravar', onclick: confirmar });
    if (ctx.demo) { botao.disabled = true; botao.title = 'Gravar está desligado no modo demonstração'; }
    filhos.push(el('div', { class: 'acoes' }, botao, el('button', { type: 'button', class: 'botao', textContent: 'Cancelar', onclick: () => { fecharPrevia(); primeiroCampo().focus(); } }),
      ctx.demo ? el('span', { class: 'estado', textContent: 'Gravar está desligado na demonstração.' }) : null));
    corpo.replaceChildren(...filhos);
  }

  function renderResultado(r, { desfeito = false } = {}) {
    const p = r.previa;
    const feito = el('p', { class: 'feito' }, icone('circle-check', 'p'), desfeito ? 'Lançamento desfeito.' : `Lançado em ${dataBR(p.data)}.`);
    const filhos = [feito, el('p', { class: 'resumo-linha', textContent: desfeito ? `Voltou ao que era antes: ${p.saldos.map((s) => `${s.panela} ${brl(s.antes)}`).join('; ')}.` : `${frase(p)}.` })];
    // O commit automático no git do vault: dito em uma linha; falha de commit vira aviso (o lançamento já valeu).
    const g = r.git;
    const notaGit = g ? el('p', { class: 'dica', textContent: g.aviso || (g.commit ? 'Registrado no git do vault.' : '') }) : null;
    if (!desfeito) {
      filhos.push(tabelaSaldos(p), ...(notaGit?.textContent ? [notaGit] : []));
      const desfazerBtn = el('button', { type: 'button', class: 'botao', id: 'desfazer-btn', textContent: 'Desfazer', onclick: desfazer });
      filhos.push(el('div', { class: 'acoes' }, desfazerBtn, el('span', { class: 'estado', textContent: 'Só o último lançamento, e só se os arquivos não mudarem.' })));
    }
    if (desfeito && notaGit?.textContent) filhos.push(notaGit);
    $('previa-corpo').replaceChildren(...filhos);
  }

  function erroDaApi(r) {
    const c = r.corpo;
    const mensagem = c.mensagem || c.erro || `HTTP ${r.status}`;
    const ul = el('ul', { class: 'avisos' });
    avisos(ul, [mensagem, ...(c.erros || []).filter((e) => e !== mensagem)], true);
    $('previa-corpo').replaceChildren(ul);
  }

  async function previsualizar() {
    const sig = assinatura();
    if (op === 'gasto' && !$('saiDe').value) return erroDaApi({ status: 400, corpo: { mensagem: 'Escolha de onde o gasto saiu: o site não adivinha.' } });
    if (op === 'reposicao' && modoDaReposicao() === 'quitar' && !marcadas().length) return erroDaApi({ status: 400, corpo: { mensagem: 'Marque ao menos uma pendência para quitar, ou use a transferência livre.' } });
    const r = await postar('previa', { operacao: lerOperacao() });
    if (r.status !== 200) return erroDaApi(r);
    versaoDaPrevia = r.corpo.versao;
    previa = r.corpo.ok ? { assinatura: sig, resposta: r.corpo } : null;
    renderPrevia(r.corpo); // o foco fica no campo: Enter de novo confirma
  }

  async function confirmar() {
    if (!previa || !previa.resposta.ok || ctx.demo) return;
    const caixa = $('confirmar');
    if (previa.resposta.exigeConfirmacao && !caixa?.checked) { caixa?.focus(); return; }
    $('confirmar-btn').disabled = true;
    const operacao = { ...lerOperacao(), ...(previa.resposta.exigeConfirmacao ? { confirmar: true } : {}) };
    const r = await postar('lancar', { operacao, versao: versaoDaPrevia });
    if (r.status === 409 && r.corpo.erro === 'versao') {
      await carregarTudo();
      previa = null;
      return erroDaApi({ status: 409, corpo: { mensagem: `${r.corpo.mensagem} A página já releu os arquivos.` } });
    }
    if (r.status !== 200) { previa = null; return erroDaApi(r); }
    ctx.versao = r.corpo.versao;
    versaoDaPrevia = r.corpo.versao;
    previa = null;
    renderResultado(r.corpo);
    await carregarContexto();
    limparCampos();
    dicas();
    primeiroCampo().focus(); // teclado primeiro: o foco volta ao valor
  }

  async function desfazer() {
    const r = await postar('desfazer', { versao: ctx.versao });
    if (r.status !== 200) return erroDaApi(r);
    await carregarContexto();
    renderResultado(r.corpo, { desfeito: true });
    dicas();
    primeiroCampo().focus();
  }

  function limparCampos() {
    for (const id of ['valor', 'saldoReal', 'descricao']) $(id).value = '';
    montarReposicao();
  }

  // ---------- ligação ----------
  // Máscara de centavos: só os dígitos contam e a vírgula entra sozinha (1234 vira 12,34).
  function mascaraValor(e) {
    const digitos = e.target.value.replace(/\D/g, '').replace(/^0+/, '');
    if (!digitos) { e.target.value = ''; return; }
    const c = digitos.padStart(3, '0');
    e.target.value = `${c.slice(0, -2)},${c.slice(-2)}`;
  }

  function ligar() {
    for (const id of ['valor', 'saldoReal']) $(id).addEventListener('input', mascaraValor);
    $('form').addEventListener('submit', (e) => {
      e.preventDefault();
      // Enter com a prévia desta mesma operação aberta confirma; senão, pré-visualiza.
      if (previa && previa.resposta.ok && previa.assinatura === assinatura() && !ctx.demo && (!previa.resposta.exigeConfirmacao || $('confirmar')?.checked)) return confirmar();
      previsualizar();
    });
    $('form').addEventListener('input', (e) => {
      if (op === 'reposicao') {
        if (e.target.id === 'panela' || e.target.id === 'modo') { if (e.target.id === 'panela') $('pendencias').replaceChildren(); montarReposicao(); } else if (e.target.closest('#pendencias')) somarMarcadas();
      }
      if (previa) fecharPrevia();
      dicas();
    });
    $('operacoes').addEventListener('click', (e) => { const b = e.target.closest('button[data-op]'); if (b) trocarOperacao(b.dataset.op); });
    $('operacoes').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = OPERACOES.map(([id]) => id);
      const i = (ids.indexOf(op) + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length;
      trocarOperacao(ids[i], { focar: false });
      $('operacoes').children[i].focus();
      e.preventDefault();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && previa) { fecharPrevia(); primeiroCampo().focus(); } });
  }

  async function carregarTudo() {
    await Promise.all([carregarContexto(), token ? null : pegarToken()]);
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), ctx.demo ? ['Modo demonstração: a pré-visualização funciona, mas gravar e desfazer estão desligados.'] : []);
  }

  async function iniciar() {
    try {
      await carregarTudo();
      montarOperacoes();
      $('saiDe').replaceChildren(...opcoesSaiDe().map(([v, t]) => el('option', { value: v, textContent: t })));
      ligar();
      trocarOperacao('gasto');
    } catch (e) {
      avisos($('avisos'), [`Não deu para abrir o lançamento (${e.message}). Confira se o servidor está no ar e se 40-financeiro existe.`], true);
    }
  }

  // O vault mudou (aqui, no Obsidian ou na skill): relê saldos e versão; uma prévia aberta
  // sobre arquivos que mudaram deixa de valer.
  async function recarregar() {
    if (!ctx) return;
    const antes = ctx.versao;
    try {
      await carregarContexto();
    } catch { return; }
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    montarReposicao();
    dicas();
    if (previa && ctx.versao !== antes && ctx.versao !== versaoDaPrevia) {
      fecharPrevia();
      erroDaApi({ status: 409, corpo: { mensagem: 'Os arquivos mudaram desde a pré-visualização. Aperte Enter para refazer.' } });
    }
  }

  iniciar();
  window.aoVivo('financeiro', recarregar);
})();
