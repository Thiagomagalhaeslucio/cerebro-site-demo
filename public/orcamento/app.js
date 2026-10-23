(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const { calcular, sugerirUrgencia } = window.Orcamento;
  const { montarResumo } = window.OrcamentoResumo;
  const { codificar } = window.PropostasFragmento;
  const $ = (id) => document.getElementById(id);

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const brl = (n) => (n == null ? '—' : BRL.format(n)); // só aqui se arredonda
  const pct = (f) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(f * 100)}%`;
  const plural = (n, um, varios) => `${NUM.format(n)} ${n === 1 ? um : varios}`;
  const NOME_FALTA = { multiplicador: 'o multiplicador de complexidade' };
  const nomes = (faltas) => faltas.map((k) => NOME_FALTA[k] || k).join(', ');

  let dados = { parametros: {}, tipos: [], complexidade: [], avisos: [] };
  let urgente = false;

  const num = (id) => {
    const v = $(id).valueAsNumber;
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  const parametros = () => Object.fromEntries(Object.entries(dados.parametros).map(([k, v]) => [k, v.valor]));
  const tipoAtual = () => dados.tipos.find((t) => t.tipo === $('tipo').value) || null;
  const complexidadeAtual = () => dados.complexidade[Number($('complexidade').value)] || null;

  function lerEntrada() {
    return {
      horas: num('horas'), mult: complexidadeAtual()?.multiplicador ?? null, urgente,
      viagens: num('viagens'), km: num('km'), horasViagem: num('horasviagem'),
      revisoesExtras: num('revisoes'), terceiros: num('terceiros'),
      inicio: $('inicio').value, entrega: $('entrega').value,
    };
  }

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
    const inc = dados.parametros.revisoes_incluidas?.valor;
    $('incluidas').textContent = inc == null ? '' : `Já incluídas no preço: ${plural(inc, 'rodada', 'rodadas')}.`;
  }

  function aoEscolherTipo() {
    const t = tipoAtual();
    if (!t) {
      $('faixa').textContent = 'Escolha um tipo para preencher com o ponto médio da faixa, ou digite as horas.';
    } else if (t.horas_min == null || t.horas_max == null) {
      $('faixa').textContent = 'A faixa de horas deste tipo está a definir no arquivo; digite as horas.';
    } else {
      const meio = (t.horas_min + t.horas_max) / 2;
      $('horas').value = String(meio);
      $('faixa').textContent = `Faixa do tipo: ${NUM.format(t.horas_min)} a ${NUM.format(t.horas_max)} h, preenchido com o ponto médio (${NUM.format(meio)} h).${t.obs ? ` ${t.obs}.` : ''}`;
    }
    atualizar();
  }

  // ---------- resultado ----------
  function linhasComposicao(P, e, r) {
    const hb = r.horasBase.valor;
    const vh = P.valor_hora;
    const margem = hb == null || P.margem_risco == null ? null : hb * P.margem_risco;
    const reais = (horas) => (horas == null || vh == null ? null : horas * vh);
    const partes = [e.viagens && plural(e.viagens, 'viagem', 'viagens'), e.km && `${NUM.format(e.km)} km`, e.horasViagem && `${NUM.format(e.horasViagem)} h de viagem`].filter(Boolean);
    return [
      ['Horas base', hb == null ? '—' : `${NUM.format(e.horas)} h × ${NUM.format(e.mult)} = ${NUM.format(hb)} h`, reais(hb)],
      ['Margem de risco', margem == null ? '—' : `${pct(P.margem_risco)}, ${NUM.format(margem)} h`, reais(margem)],
      ['Urgência', e.urgente ? (P.adicional_urgencia == null ? '—' : `${pct(P.adicional_urgencia)} sobre as horas com margem`) : 'Não urgente', r.urgencia.valor],
      ['Deslocamento', partes.length ? partes.join(', ') : 'Sem deslocamento', r.deslocamento.valor],
      ['Revisões extras', e.revisoesExtras ? `${plural(e.revisoesExtras, 'rodada', 'rodadas')} × ${NUM.format(P.revisao_extra_horas ?? 0)} h` : 'Nenhuma', r.revisoes.valor],
      ['Terceiros', e.terceiros ? (P.repasse_terceiros === 1 ? 'Repassado sem margem' : 'Somado ao valor') : 'Nenhum', r.terceiros.valor],
      ['Imposto', P.imposto == null ? '—' : `${pct(P.imposto)} do valor bruto`, r.imposto.valor],
    ];
  }

  function pintarResultado(P, e, r) {
    const pronto = e.horas > 0;
    const ok = pronto && r.recomendado.valor != null;
    const valor = (item) => (pronto ? brl(item.valor) : '—');
    $('recomendado').textContent = valor(r.recomendado);
    $('piso').textContent = valor(r.piso);
    $('entrada').textContent = valor(r.entrada);
    $('entrada-r').textContent = P.entrada == null ? 'Entrada' : `Entrada (${pct(P.entrada)})`;
    $('piso-sub').textContent = !pronto || r.piso.valor == null ? 'O menor valor que posso aceitar.'
      : r.pisoPor === 'custo' ? 'Pelo custo com o valor/hora piso, acima do desconto máximo.'
        : `Recomendado com desconto máximo de ${pct(P.desconto_max)}.`;

    const sem = $('sem-calculo');
    const faltas = [...new Set([r.recomendado, r.piso, r.entrada].flatMap((i) => i.falta))];
    sem.hidden = pronto && !faltas.length;
    sem.textContent = !pronto ? 'Informe as horas estimadas (ou escolha um tipo de trabalho) para calcular.'
      : `Sem cálculo para ${[r.recomendado.valor == null && 'o valor', r.piso.valor == null && 'o piso', r.entrada.valor == null && 'a entrada'].filter(Boolean).join(', ')}: falta ${nomes(faltas)} no arquivo de origem.`;

    $('composicao').replaceChildren(
      ...(pronto ? linhasComposicao(P, e, r) : []).map(([item, como, v]) => el('tr', { class: v === 0 ? 'zero' : '' },
        el('td', { textContent: item }), el('td', { textContent: como }), el('td', { class: 'n', textContent: brl(v) }))),
    );
    const rodape = $('composicao').closest('table').tFoot || $('composicao').closest('table').createTFoot();
    rodape.replaceChildren(el('tr', {}, el('td', { textContent: 'Valor recomendado' }), el('td'), el('td', { class: 'n', textContent: valor(r.recomendado) })));
    return ok;
  }

  function pintarSugestao(P, e) {
    const out = $('sugestao');
    const s = sugerirUrgencia(P, e);
    if (s.falta.length) out.textContent = `Sem sugestão de urgência: falta ${nomes(s.falta)} no arquivo de origem.`;
    else if (!e.horas) out.textContent = 'Informe as horas para ver o prazo normal.';
    else if (s.prazoDesejado == null) out.textContent = `Prazo normal: ${plural(s.prazoNormal, 'dia', 'dias')}. Informe início e entrega desejada para comparar.`;
    else if (s.prazoDesejado < 0) out.textContent = 'A entrega desejada é antes do início.';
    else {
      const base = `Prazo desejado: ${plural(s.prazoDesejado, 'dia', 'dias')}. Prazo normal: ${plural(s.prazoNormal, 'dia', 'dias')}.`;
      out.replaceChildren(base + ' ', s.sugerir
        ? el('strong', { textContent: urgente ? 'Prazo curto, e já está marcado como urgente.' : 'Prazo curto: considere marcar como urgente.' })
        : 'Cabe no prazo normal.');
    }
  }

  let resumoAtual = null;
  function atualizar() {
    const P = parametros();
    const e = lerEntrada();
    const r = calcular(P, e);
    const ok = pintarResultado(P, e, r);
    pintarSugestao(P, e);
    const m = complexidadeAtual()?.multiplicador;
    $('mult').textContent = m == null ? 'Multiplicador a definir no arquivo.' : `Multiplicador ${NUM.format(m)} sobre as horas (incerteza técnica, não escopo).`;

    resumoAtual = ok ? montarResumo(P, r, { tipo: tipoAtual()?.tipo, urgente, revisoesExtras: e.revisoesExtras, inicio: e.inicio, entrega: e.entrega }) : null;
    $('copiar').disabled = $('imprimir').disabled = $('gerar-proposta').disabled = !resumoAtual;
    $('impressao').replaceChildren(...(resumoAtual ? resumoAtual.split('\n').map((l) => el('p', { textContent: l })) : []));
  }

  // ---------- ações ----------
  let timerEstado = null;
  function avisar(texto) {
    $('estado').textContent = texto;
    clearTimeout(timerEstado);
    timerEstado = setTimeout(() => { $('estado').textContent = ''; }, 3000);
  }
  async function copiar() {
    if (!resumoAtual) return;
    try {
      await navigator.clipboard.writeText(resumoAtual);
    } catch {
      const area = el('textarea', { value: resumoAtual });
      area.style.cssText = 'position:fixed;opacity:0';
      document.body.append(area);
      area.select();
      const feito = document.execCommand && document.execCommand('copy');
      area.remove();
      if (!feito) return avisar('Não deu para copiar neste navegador.');
    }
    avisar('Resumo copiado.');
  }

  // Abre /propostas com o cálculo no fragmento (#): fica só no navegador, nada é gravado.
  function gerarProposta() {
    const e = lerEntrada();
    window.location.href = `/propostas${codificar({
      tipo: tipoAtual()?.tipo, horas: e.horas, nivel: complexidadeAtual()?.nivel, urgente,
      inicio: e.inicio, entrega: e.entrega, viagens: e.viagens || '', km: e.km || '', horasviagem: e.horasViagem || '',
      revisoes: e.revisoesExtras || '', terceiros: e.terceiros || '',
    })}`;
  }

  function definirUrgente(valor) {
    urgente = valor;
    $('urgente-sim').setAttribute('aria-pressed', String(valor));
    $('urgente-nao').setAttribute('aria-pressed', String(!valor));
    atualizar();
  }

  $('copiar').replaceChildren(icone('copy'), 'Copiar resumo');
  $('imprimir').replaceChildren(icone('printer'), 'Imprimir');
  $('copiar').addEventListener('click', copiar);
  $('imprimir').addEventListener('click', () => window.print());
  $('gerar-proposta').replaceChildren(icone('file-pen-line'), 'Gerar proposta com este cálculo');
  $('gerar-proposta').addEventListener('click', gerarProposta);
  $('urgente-sim').addEventListener('click', () => definirUrgente(true));
  $('urgente-nao').addEventListener('click', () => definirUrgente(false));
  $('tipo').addEventListener('change', aoEscolherTipo);
  for (const id of ['horas', 'complexidade', 'inicio', 'entrega', 'viagens', 'km', 'horasviagem', 'revisoes', 'terceiros']) {
    $(id).addEventListener('input', atualizar);
    $(id).addEventListener('change', atualizar);
  }

  async function carregar() {
    try {
      const r = await fetch('/api/orcamento', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      dados = j;
      $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      avisos($('avisos'), j.avisos);
      montarOpcoes();
      atualizar();
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler o orçamento (${e.message}).`], true);
      $('meta').textContent = 'Falha ao ler o vault';
    }
  }
  carregar();
  window.aoVivo('orcamento', carregar);
})();
