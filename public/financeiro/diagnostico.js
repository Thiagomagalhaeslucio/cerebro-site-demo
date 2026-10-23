(() => {
  'use strict';

  const { el, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const NUM1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fmt = (v) => (v == null ? '—' : BRL.format(v));
  const pctFmt = (v) => (v == null ? '—' : NUM1.format(v) + '%');
  const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  // Datas AAAA-MM-DD e "R$ 12.34" vindos do servidor no formato brasileiro.
  const br = (s) => String(s || '')
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, '$3/$2/$1')
    .replace(/R\$ (-?\d+)\.(\d{2})/g, (_, i, c) => 'R$ ' + Number(i).toLocaleString('pt-BR') + ',' + c);

  const ROTULO = { verde: 'em dia', amarelo: 'atenção', vermelho: 'segurar', 'sem-dados': 'sem dados' };
  const NOMES = { pessoal: 'Pessoal', margem: 'Margem' };

  const valor = (n) => (n.tipo === 'brl' ? fmt(n.valor) : n.tipo === 'data' ? dataBR(n.valor) : n.tipo === 'pct' ? pctFmt(n.valor) : String(n.valor));

  function indicador(ind) {
    const partes = [
      el('h2', {}, el('i', { class: `bolinha ${ind.status}` }), ind.titulo, el('span', { class: 'rot-status', textContent: ROTULO[ind.status] || ind.status })),
      el('p', { class: 'resumo', textContent: br(ind.resumo) }),
    ];
    if (ind.id === 'orcamento' && ind.panelas) {
      partes.push(el('div', { class: 'rolar' }, el('table', { class: 'tabela' },
        el('thead', {}, el('tr', {}, ...['Panela', 'Recebeu', 'Gastou', '%', 'Saldo'].map((t, i) => el('th', { scope: 'col', class: i ? 'n' : '', textContent: t })))),
        el('tbody', {}, ...ind.panelas.map((p) => el('tr', {},
          el('td', { textContent: NOMES[p.id] || p.id }),
          el('td', { class: 'n', textContent: fmt(p.orcamento) }),
          el('td', { class: 'n', textContent: fmt(p.gasto) }),
          el('td', { class: 'n', textContent: pctFmt(p.pct) }),
          el('td', { class: 'n', textContent: fmt(p.saldo) })))))));
    }
    if (ind.numeros?.length) {
      partes.push(el('dl', { class: 'numeros-ind' }, ...ind.numeros.map((n) => el('div', {}, el('dt', { textContent: br(n.rotulo) }), el('dd', { textContent: valor(n) })))));
    }
    partes.push(el('p', { class: 'acao' }, el('strong', { textContent: 'O que fazer: ' }), br(ind.acao)));
    return el('section', { class: `indicador ind ${ind.status}`, 'aria-label': ind.titulo }, ...partes);
  }

  function premissas(d) {
    const c = d.premissas;
    const r = d.referencias;
    const t = c.transportePorDia;
    const s = c.semaforo;
    const j = c.janelas;
    const itens = [
      r.salario
        ? `Próximo salário: o último (${dataBR(r.salario.data)}, ${fmt(r.salario.valor)}) mais ${c.proximoSalario.mesesDepoisDoUltimo} mês, ou seja, ${dataBR(r.salario.proximo)}.`
        : 'Próximo salário: nenhum salário encontrado em panelas.md.',
      r.vt ? `Próximo VT: a última entrada de VT de pelo menos ${fmt(c.proximoBeneficio.valorMinimo)} sem "${c.proximoBeneficio.ignorarDescricaoContendo}" (${dataBR(r.vt.base.data)}, ${fmt(r.vt.base.valor)}) mais ${c.proximoBeneficio.diasDepois} dias: ${dataBR(r.vt.proxima)}.` : 'Próximo VT: nenhuma entrada válida.',
      r.vr ? `Próximo VR: a mesma regra (${dataBR(r.vr.base.data)}, ${fmt(r.vr.base.valor)}): ${dataBR(r.vr.proxima)}.` : 'Próximo VR: nenhuma entrada válida.',
      `Transporte por dia (VT e trem): ${fmt(t.diaUtil)} em dia útil, ${fmt(t.sabado)} no sábado e ${fmt(t.domingo)} no domingo.`,
      `Gasto é movimento do tipo "saída", sem as descrições que começam com "${c.ignorarDescricaoComecandoCom}". Transferência e recarga não contam.`,
      'Categorias por palavra-chave na descrição, sem acento nem maiúscula, valendo a primeira que casar: ' +
        Object.entries(c.categorias).map(([k, v]) => `${k} (${v.join(', ')})`).join('; ') + `; o resto vai para ${c.categoriaPadrao}.`,
      d.formato.rotulos.explicacaoMetas,
      `Orçamento livre: o que pessoal e margem receberam no último salário, contra as saídas delas desde então, comparado à parte do ciclo que já passou. Em dia até ${s.orcamentoAmareloPontos} pontos acima do ciclo, atenção até ${s.orcamentoVermelhoPontos}. Sobra por dia é o saldo atual dividido pelos dias até o próximo salário.`,
      `VR: a média diária das saídas do VR nos últimos ${j.mediaVrDias} dias vezes os dias até o próximo VR. Em dia se cabe no saldo, atenção se passa em até ${NUM1.format(s.vrAmareloExcesso * 100)}%.`,
      `Dia a dia: o saldo de VT e trem, menos o transporte projetado de amanhã até o próximo VT, dividido pelos dias, é a folga por dia. Ela é comparada à média dos últimos ${j.mediaDiaADiaDias} dias das saídas do VT que não são transporte nem assinatura. Em dia se a média cabe na folga, atenção até ${NUM1.format(s.diaADiaAmareloFator)} vezes a folga.`,
    ];
    $('premissas').replaceChildren(...itens.map((x) => el('li', { textContent: x })));
  }

  function paraOnde(d) {
    const po = d.paraOnde;
    if (!po) {
      $('para-onde').replaceChildren(el('li', { class: 'vazio', textContent: 'Sem o último salário em panelas.md não dá para montar a janela. Registre o salário pela skill financeiro.' }));
      $('comida').textContent = '';
      return;
    }
    $('onde-t').textContent = `Para onde foi o dinheiro desde ${dataBR(po.desde)}: ${fmt(po.total)}`;
    const max = Math.max(...po.categorias.map((c) => c.valor), 0) || 1;
    $('para-onde').replaceChildren(...po.categorias.map((c, i) => {
      const cheio = el('span', { class: 'cheio' });
      cheio.style.width = `${(c.valor / max) * 100}%`;
      return el('li', { class: i === 0 ? 'destaque-dado' : '' },
        el('span', { class: 'rot', textContent: c.nome }),
        el('span', { class: 'trilho', 'aria-hidden': 'true' }, cheio),
        el('span', { class: 'val' }, el('strong', { textContent: fmt(c.valor) }), ` ${pctFmt(c.pct)}`));
    }));
    const cf = po.comidaFora;
    const comp = cf.recentePorDia === cf.anteriorPorDia ? 'igual aos' : cf.recentePorDia > cf.anteriorPorDia ? 'acima dos' : 'abaixo dos';
    $('comida').textContent = `Comida fora: ${fmt(cf.recentePorDia)} por dia nos últimos ${cf.recenteDias} dias, ${comp} ${fmt(cf.anteriorPorDia)} por dia dos ${cf.anteriorDias} anteriores.`;
  }

  function render(d) {
    $('meta').textContent = `Hoje ${dataBR(d.hoje)}, calculado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    $('veredito').replaceChildren(el('i', { class: `bolinha ${d.veredito.status}` }), el('p', { textContent: d.veredito.texto }));

    const lista = [...d.avisos];
    for (const n of d.paraOnde?.naoLancados || [])
      lista.push(`Há um ajuste de gasto não lançado em ${dataBR(n.data)} (${fmt(n.valor)}, ${n.panela}). Ele fica fora das médias, então o ritmo real pode ser maior.`);
    avisos($('avisos'), lista);

    $('indicadores').replaceChildren(...d.indicadores.map(indicador));
    paraOnde(d);
    premissas(d);
  }

  async function carregar() {
    try {
      const r = await fetch('/api/financeiro/diagnostico', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para calcular o diagnóstico (${e.message}). Confira as notas do financeiro e o config.json.`], true);
    }
  }

  carregar();
  window.aoVivo('financeiro', carregar);
})();
