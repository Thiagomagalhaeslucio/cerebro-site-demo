(() => {
  'use strict';

  const { el, avisos } = window.cerebro;
  const { calcular, sugerirUrgencia } = window.Orcamento;
  const { campos, brl, valorInicial } = window.Propostas;
  const { preencher } = window.Documentos;
  const { montarDocumento, nomeArquivo, ligarAcoes } = window.DocumentosPagina;
  const { decodificar } = window.PropostasFragmento;
  const $ = (id) => document.getElementById(id);

  const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const plural = (n, um, varios) => `${NUM.format(n)} ${n === 1 ? um : varios}`;
  const NOME_FALTA = { multiplicador: 'o multiplicador de complexidade' };
  const nomes = (faltas) => faltas.map((k) => NOME_FALTA[k] || k).join(', ');
  const TEXTOS = ['cliente', 'projeto', 'resumo', 'escopo', 'fora', 'entregaveis', 'inicio', 'entrega', 'horas', 'viagens', 'km', 'horasviagem', 'revisoes', 'terceiros'];

  let dados = { parametros: {}, tipos: [], complexidade: [], perfil: { campos: {} }, modelo: { texto: '' }, hoje: null, avisos: [] };
  let urgente = false;
  let valorEditado = false; // enquanto falso, o valor proposto acompanha o recomendado
  let fragmento = decodificar(window.location.hash); // lido uma vez; a URL não é reescrita
  let markdownAtual = '';

  const num = (id) => {
    const v = $(id).valueAsNumber;
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const parametros = () => Object.fromEntries(Object.entries(dados.parametros).map(([k, v]) => [k, v.valor]));
  const tipoAtual = () => dados.tipos.find((t) => t.tipo === $('tipo').value) || null;
  const complexidadeAtual = () => dados.complexidade[Number($('complexidade').value)] || null;
  const hoje = () => dados.hoje || new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD local

  // ---------- campos que dependem do arquivo ----------
  function montarOpcoes() {
    const tipo = $('tipo').value;
    const nivel = $('complexidade').value;
    $('tipo').replaceChildren(el('option', { value: '', textContent: 'Outro (informar as horas)' }),
      ...dados.tipos.map((t) => el('option', { value: t.tipo, textContent: t.tipo })));
    if (dados.tipos.some((t) => t.tipo === tipo)) $('tipo').value = tipo;
    $('complexidade').replaceChildren(...dados.complexidade.map((c, i) => el('option', {
      value: String(i), disabled: c.multiplicador == null, textContent: c.multiplicador == null ? `${c.nivel} (a definir)` : c.nivel,
    })));
    if (nivel !== '' && dados.complexidade[Number(nivel)]?.multiplicador != null) $('complexidade').value = nivel;
    else {
      const primeira = dados.complexidade.findIndex((c) => c.multiplicador != null);
      if (primeira >= 0) $('complexidade').value = String(primeira);
    }
  }

  // Validade: o parâmetro é só o valor inicial; depois a pessoa manda.
  let validadePadrao = null;
  function ajustarValidade() {
    const padrao = dados.parametros.validade_proposta_dias?.valor ?? null;
    if ($('validade').value === '' || Number($('validade').value) === validadePadrao) $('validade').value = padrao == null ? '' : String(padrao);
    validadePadrao = padrao;
    $('validade-dica').textContent = padrao == null ? 'O parâmetro validade_proposta_dias está a definir; sem validade, a linha "Válida até" some.' : `Padrão do arquivo de parâmetros: ${plural(padrao, 'dia', 'dias')}.`;
  }

  // Preenche o formulário com o que veio no fragmento (uma vez, depois do primeiro carregar).
  function aplicarFragmento() {
    const f = fragmento;
    fragmento = {};
    if (!Object.keys(f).length) return;
    for (const id of TEXTOS) if (f[id] != null) $(id).value = f[id];
    if (f.validade != null) $('validade').value = f.validade;
    if (f.tipo && dados.tipos.some((t) => t.tipo === f.tipo)) $('tipo').value = f.tipo;
    const i = dados.complexidade.findIndex((c) => c.nivel === f.nivel && c.multiplicador != null);
    if (i >= 0) $('complexidade').value = String(i);
    if (f.urgente === '1') definirUrgente(true, false);
  }

  function aoEscolherTipo() {
    const t = tipoAtual();
    if (!t) $('faixa').textContent = '';
    else if (t.horas_min == null || t.horas_max == null) $('faixa').textContent = 'A faixa de horas deste tipo está a definir no arquivo; digite as horas.';
    else {
      const meio = (t.horas_min + t.horas_max) / 2;
      $('horas').value = String(meio);
      $('faixa').textContent = `Faixa do tipo: ${NUM.format(t.horas_min)} a ${NUM.format(t.horas_max)} h, preenchido com o ponto médio (${NUM.format(meio)} h).`;
    }
    atualizar();
  }

  // ---------- cálculo do valor ----------
  function lerEntrada() {
    return {
      horas: num('horas'), mult: complexidadeAtual()?.multiplicador ?? null, urgente,
      viagens: num('viagens'), km: num('km'), horasViagem: num('horasviagem'),
      revisoesExtras: num('revisoes'), terceiros: num('terceiros'),
      inicio: $('inicio').value, entrega: $('entrega').value,
    };
  }

  function pintarSugestao(P, e) {
    const out = $('sugestao');
    const s = sugerirUrgencia(P, e);
    if (s.falta.length) out.textContent = `Sem sugestão de urgência: falta ${nomes(s.falta)} no arquivo de origem.`;
    else if (!e.horas || s.prazoDesejado == null) out.textContent = '';
    else if (s.prazoDesejado < 0) out.textContent = 'A entrega desejada é antes do início.';
    else {
      const base = `Prazo desejado: ${plural(s.prazoDesejado, 'dia', 'dias')}. Prazo normal: ${plural(s.prazoNormal, 'dia', 'dias')}.`;
      out.replaceChildren(base + ' ', s.sugerir
        ? el('strong', { textContent: urgente ? 'Prazo curto, e já está marcado como urgente.' : 'Prazo curto: considere marcar como urgente.' })
        : 'Cabe no prazo normal.');
    }
  }

  // Devolve o valor proposto (número) ou null; mexe só no formulário.
  function pintarCalculo(P, e) {
    const r = calcular(P, e);
    const pronto = e.horas > 0;
    const rec = pronto ? r.recomendado.valor : null;
    $('recomendado').textContent = rec == null ? '—' : brl(rec);
    const faltas = r.recomendado.falta;
    $('sem-calculo').textContent = !pronto ? 'Informe as horas (ou escolha um tipo) para calcular o recomendado.'
      : faltas.length ? `Sem cálculo do recomendado: falta ${nomes(faltas)} no arquivo de origem.` : '';

    const inicial = valorInicial(rec);
    if (!valorEditado) $('valor').value = inicial == null ? '' : String(inicial);
    const valor = $('valor').valueAsNumber;
    const proposto = Number.isFinite(valor) && valor > 0 ? valor : null;

    const piso = pronto ? r.piso.valor : null;
    const aviso = $('aviso-piso');
    aviso.hidden = !(proposto != null && piso != null && proposto < piso);
    aviso.textContent = aviso.hidden ? '' : `O valor proposto está abaixo do piso (${brl(piso)}). Isto aparece só aqui, nunca no documento.`;
    return proposto;
  }

  // ---------- documento ----------
  function atualizar() {
    const P = parametros();
    const e = lerEntrada();
    pintarSugestao(P, e);
    const valor = pintarCalculo(P, e);

    const c = campos({
      perfil: dados.perfil.campos, P, hoje: hoje(), valor,
      form: {
        cliente: $('cliente').value, projeto: $('projeto').value, resumo: $('resumo').value,
        escopo: $('escopo').value, fora: $('fora').value, entregaveis: $('entregaveis').value,
        inicio: $('inicio').value, entrega: $('entrega').value,
        validade: $('validade').value === '' ? null : Number($('validade').value),
      },
    });
    markdownAtual = dados.modelo.texto ? preencher(dados.modelo.texto, c) : '';
    $('doc').replaceChildren(...(markdownAtual
      ? montarDocumento(markdownAtual)
      : [el('p', { class: 'doc-vazio', textContent: dados.modelo.existe === false ? 'Sem modelo: crie 70-negocio/modelos/proposta.md.' : 'O modelo está vazio.' })]));
    for (const id of ['copiar', 'baixar', 'imprimir']) $(id).disabled = !markdownAtual;
  }

  function definirUrgente(valor, redesenhar = true) {
    urgente = valor;
    $('urgente-sim').setAttribute('aria-pressed', String(valor));
    $('urgente-nao').setAttribute('aria-pressed', String(!valor));
    if (redesenhar) atualizar();
  }

  ligarAcoes({ markdown: () => markdownAtual, nome: () => nomeArquivo('proposta', $('projeto').value, $('cliente').value) });
  $('urgente-sim').addEventListener('click', () => definirUrgente(true));
  $('urgente-nao').addEventListener('click', () => definirUrgente(false));
  $('tipo').addEventListener('change', aoEscolherTipo);
  $('usar-recomendado').addEventListener('click', () => { valorEditado = false; atualizar(); });
  $('valor').addEventListener('input', () => { valorEditado = true; atualizar(); });
  for (const id of ['cliente', 'projeto', 'resumo', 'escopo', 'fora', 'entregaveis', 'inicio', 'entrega', 'validade', 'horas', 'complexidade', 'viagens', 'km', 'horasviagem', 'revisoes', 'terceiros']) {
    $(id).addEventListener('input', atualizar);
    $(id).addEventListener('change', atualizar);
  }

  async function carregar() {
    try {
      const r = await fetch('/api/propostas', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      dados = j;
      $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      avisos($('avisos'), j.avisos);
      montarOpcoes();
      ajustarValidade();
      aplicarFragmento();
      atualizar();
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler os dados da proposta (${e.message}).`], true);
      $('meta').textContent = 'Falha ao ler o vault';
    }
  }
  carregar();
  window.aoVivo('propostas', carregar);
})();
