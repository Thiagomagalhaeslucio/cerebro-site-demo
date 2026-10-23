(() => {
  'use strict';

  const { el, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const PCT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const fmt = (v) => (v == null ? '—' : BRL.format(v));
  const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—');
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  // [[caminho|alias]] e [[caminho]] viram texto simples.
  const semWikilink = (s) => String(s || '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);
  const cor = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  let dados = null;
  let grafico = null;
  // Índice do dia de hoje quando ele não tem saída (a barra seria invisível): o gráfico o marca com um traço.
  let hojeSemSaida = -1;
  const marcaHoje = {
    id: 'marcaHoje',
    afterDatasetsDraw(chart) {
      if (hojeSemSaida < 0) return;
      const { ctx, chartArea: { top, bottom }, scales: { x } } = chart;
      const px = Math.round(x.getPixelForValue(hojeSemSaida)) + 0.5;
      ctx.save();
      ctx.strokeStyle = cor('--tinta-suave');
      ctx.fillStyle = cor('--tinta-suave');
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, top);
      ctx.lineTo(px, bottom);
      ctx.stroke();
      ctx.font = `12px ${Chart.defaults.font.family}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('hoje', px, top - 3); // acima da área do gráfico, para não cobrir barras
      ctx.restore();
    },
  };
  // "pessoal→conta" vira "Pessoal / Lazer para Conta".
  const panelaDe = (p, nome) => String(p).split(/\s*(?:→|->)\s*/).map(nome).join(' para ');

  // Barras horizontais em HTML, ordenadas, com rótulo, R$ e % escritos.
  function barras(ul, linhas, { total, destaque } = {}) {
    const max = Math.max(...linhas.map((l) => Math.abs(l.valor)), 0) || 1;
    ul.replaceChildren(...linhas.map((l) => {
      const cheio = el('span', { class: 'cheio' });
      cheio.style.width = `${(Math.abs(l.valor) / max) * 100}%`;
      return el('li', { class: l.id === destaque ? 'destaque-dado' : '' },
        el('span', { class: 'rot', textContent: l.rotulo }),
        el('span', { class: 'trilho', 'aria-hidden': 'true' }, cheio),
        el('span', { class: 'val' }, el('strong', { textContent: fmt(l.valor) }), total ? ` ${PCT.format((l.valor / total) * 100)}%` : ''));
    }));
  }

  function desenharGrafico() {
    const u = dados.gastos.ultimos30;
    const totais = u.dias.map((_, i) => Object.values(u.series).reduce((a, s) => a + (s[i] || 0), 0));
    const iHoje = u.dias.indexOf(dados.hoje);
    hojeSemSaida = iHoje >= 0 && !totais[iHoje] ? iHoje : -1;
    const nomes = Object.fromEntries(dados.saldos.map((s) => [s.id, s.panela]));
    const soma = totais.reduce((a, b) => a + b, 0);
    const maior = Math.max(...totais);
    $('dias-resumo').textContent = `Total de ${fmt(soma)}; maior dia ${fmt(maior)}. Hoje em destaque.`;

    const fundo = totais.map((_, i) => (i === iHoje ? cor('--acento') : cor('--acento-1')));
    const config = {
      type: 'bar',
      plugins: [marcaHoje],
      data: { labels: u.dias.map(ddmm), datasets: [{ data: totais, backgroundColor: fundo, borderRadius: parseFloat(cor('--raio-fino')), maxBarThickness: 18 }] },
      options: {
        maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 18 } },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (it) => it[0].label,
              label: (c) => `Total ${fmt(c.parsed.y)}`,
              afterBody: (it) => Object.entries(u.series).filter(([, s]) => s[it[0].dataIndex] > 0).map(([id, s]) => `${nomes[id] || id}: ${fmt(s[it[0].dataIndex])}`),
            },
          },
        },
        scales: {
          x: { grid: { display: false }, border: { color: cor('--linha') }, ticks: { color: cor('--tinta-suave'), maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
          y: { grid: { color: cor('--linha') }, border: { display: false }, ticks: { color: cor('--tinta-suave'), maxTicksLimit: 5, callback: (v) => `R$ ${v}` } },
        },
      },
    };
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    if (grafico) {
      grafico.data = config.data;
      grafico.options = config.options;
      grafico.update('none');
    } else {
      grafico = new Chart($('grafico-dias'), config);
    }
  }

  function render() {
    const d = dados;
    const nomes = Object.fromEntries(d.saldos.map((s) => [s.id, s.panela]));
    const nome = (id) => nomes[id] || id;
    $('meta').textContent = `Saldos de ${dataBR(d.dataSaldos)}, lidos às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), d.avisos);

    // Destaque: patrimônio e conferência.
    $('patrimonio').textContent = fmt(d.patrimonio.escrito ?? d.patrimonio.somado);
    $('conferencia').replaceChildren(
      el('i', { class: `bolinha ${d.patrimonio.confere ? 'verde' : 'vermelho'}` }),
      d.patrimonio.confere ? 'Confere com a soma dos saldos (sem o VT).' : `Não confere: a soma dos saldos dá ${fmt(d.patrimonio.somado)}.`);
    const pessoal = d.saldos.find((s) => s.id === 'pessoal')?.saldo;
    const margem = d.saldos.find((s) => s.id === 'margem')?.saldo;
    const n = d.pendentes.itens.length;
    $('numeros').replaceChildren(
      el('div', {}, el('dt', { textContent: 'Livre' }), el('dd', {}, fmt(d.livre.escrito ?? d.livre.somado), el('span', { class: 'sub', textContent: `pessoal ${fmt(pessoal)}, margem ${fmt(margem)}` }))),
      el('div', {}, el('dt', { textContent: 'Pendente de reposição' }), el('dd', {}, fmt(d.pendentes.total), el('span', { class: 'sub', textContent: n ? `${n} ${n === 1 ? 'reposição' : 'reposições'}` : 'nenhuma' }))),
      el('div', {}, el('dt', { textContent: 'Disponível' }), el('dd', {}, fmt(d.disponivel), el('span', { class: 'sub', textContent: 'livre menos as reposições' }))));

    // Metas. Os nomes (marco, meta final, a panela das metas) vêm de config → financeiro.formato.
    const R = d.formato.rotulos;
    const metas = [
      [R.marco, R.marcoDescricao, d.progresso.marco, d.progresso.marco.atingido ? R.marcoAtingido : null],
      ['Reserva', 'colchão de segurança', d.progresso.reserva, d.progresso.reserva.atingido ? `completa; a divisão vira ${d.formato.divisaoCompleta ?? 'a da regra'}` : null],
      [R.metaFinal, R.metaFinalDescricao, d.progresso.metaFinal, null],
    ];
    $('metas').replaceChildren(...metas.map(([titulo, sub, p, pronto]) => {
      const barra = el('span');
      barra.style.width = `${Math.min(100, Math.max(0, p.pct))}%`;
      return el('li', {},
        el('span', { class: 'rot' }, titulo, el('span', { class: 'suave', textContent: pronto || sub })),
        el('span', { class: 'progresso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(p.pct)), 'aria-label': titulo }, barra),
        el('span', { class: 'val' }, el('strong', { textContent: fmt(p.atual) }), ` de ${fmt(p.meta)}, ${PCT.format(p.pct)}%`));
    }));

    // Saldo por panela: ordenado; destaque para a panela das metas. VT fica fora: já está na Conta.
    const saldos = d.saldos.filter((s) => s.id !== 'vt' && s.saldo != null).map((s) => ({ id: s.id, rotulo: s.panela, valor: s.saldo })).sort((a, b) => b.valor - a.valor);
    barras($('saldos'), saldos, { destaque: d.formato.painelMeta });
    const vt = d.saldos.find((s) => s.id === 'vt');
    $('nota-vt').textContent = vt ? `O VT (${fmt(vt.saldo)}) está dentro da Conta e não entra no patrimônio.` : '';

    // Saídas do mês: ordenadas, destaque para a maior.
    const mes = Object.entries(d.gastos.mes.porPanela).map(([id, v]) => ({ id, rotulo: nome(id), valor: v })).sort((a, b) => b.valor - a.valor);
    const [ano, mm] = d.gastos.mes.mes.split('-');
    const nomeMes = new Date(Date.UTC(Number(ano), Number(mm) - 1, 15)).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
    $('mes-t').textContent = `Saídas de ${nomeMes}: ${fmt(d.gastos.mes.total)}`;
    if (mes.length) barras($('mes'), mes, { total: d.gastos.mes.total, destaque: mes[0].id });
    else $('mes').replaceChildren(el('li', { class: 'vazio', textContent: 'Nenhuma saída neste mês ainda.' }));

    desenharGrafico();

    // Movimentos.
    $('movimentos').replaceChildren(...d.ultimosMovimentos.map((m) => {
      const tipo = m.tipo.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
      const sinal = tipo === 'saida' ? '−' : tipo === 'entrada' ? '+' : '';
      return el('tr', {},
        el('td', { textContent: ddmm(m.data) }),
        el('td', { class: 'desc' }, m.descricao, el('span', { class: 'obs', textContent: [m.tipo !== 'saída' && m.tipo !== 'entrada' ? m.tipo : null, semWikilink(m.obs)].filter(Boolean).join('; ') })),
        el('td', { textContent: panelaDe(m.panela, nome) }),
        el('td', { class: `n ${tipo === 'entrada' ? 'pos' : ''}`, textContent: sinal + fmt(m.valor) }));
    }));

    $('pendentes').replaceChildren(...(d.pendentes.itens.length
      ? d.pendentes.itens.map((p) => el('li', {},
        el('span', { class: 'principal', textContent: p.descricao || 'sem descrição' }),
        el('span', { class: 'valor', textContent: fmt(p.valor) }),
        el('span', { class: 'meta', textContent: `${nome(p.panela)}${p.data ? `, desde ${ddmm(p.data)}` : ''}` })))
      : [el('li', {}, el('span', { class: 'vazio', textContent: 'Nenhuma reposição pendente.' }))]));

    const s = d.salario;
    $('salario').replaceChildren(...(s
      ? [el('li', {},
        el('span', { class: 'principal', textContent: `Recebido em ${dataBR(s.data)}` }),
        el('span', { class: 'valor', textContent: fmt(s.valor) }),
        el('span', { class: 'meta', textContent: s.divisao.map((x) => `${nome(x.panela)} ${fmt(x.valor)}`).join(', ') }))]
      : [el('li', {}, el('span', { class: 'vazio', textContent: 'Nenhum salário em panelas.md. Registre pela skill financeiro.' }))]));

    $('rodape').textContent = `Gastos são as saídas, sem os ajustes "${d.formato.descricaoAjuste}"; transferências e recargas não contam. ${d.totalMovimentos} movimentos lidos.`;
  }

  async function carregar() {
    try {
      const r = await fetch('/api/financeiro', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      dados = j;
      render();
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler o financeiro (${e.message}). Confira 40-financeiro/panelas.md e movimentos.md.`], true);
    }
  }

  window.addEventListener('cerebro:tema', () => { if (dados) desenharGrafico(); });
  carregar();
  window.aoVivo('financeiro', carregar);
})();
