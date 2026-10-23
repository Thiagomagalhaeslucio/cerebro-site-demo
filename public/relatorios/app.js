(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const NUM1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const curta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const STATUS = { 'no-ritmo': ['verde', 'no ritmo'], atencao: ['amarelo', 'atenção'], atrasada: ['vermelho', 'atrasada'], concluida: ['verde', 'concluída'] };

  // O período fica na URL (?tipo=mes&ref=2026-02-15): recarregar e voltar não perdem onde você estava.
  const consulta = new URLSearchParams(location.search);
  let tipo = consulta.get('tipo') === 'mes' ? 'mes' : 'semana';
  let ref = /^\d{4}-\d{2}-\d{2}$/.test(consulta.get('ref') || '') ? consulta.get('ref') : '';
  let dados = null;

  const horas = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? (m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`) : `${m} min`;
  };
  // "+1 h 10 min que no período anterior" / "igual ao anterior".
  const variacao = (agora, antes, fmt, sinal = true) => {
    if (antes === 0 && agora === 0) return null;
    const d = agora - antes;
    if (d === 0) return 'igual ao período anterior';
    return `${d > 0 ? '+' : '−'}${fmt(Math.abs(d))} que no anterior`;
  };

  function barra(pct, rotulo) {
    const s = el('span');
    s.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    return el('span', { class: 'progresso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': rotulo }, s);
  }

  function rotuloPeriodo(d) {
    if (d.tipo === 'mes') {
      const [a, m] = d.inicio.split('-');
      return `${MESES[Number(m) - 1]} de ${a}${d.emAndamento ? ' (em andamento)' : ''}`;
    }
    return `Semana ${d.rotuloSemana}: ${curta(d.inicio)} a ${dataBR(d.fim)}${d.emAndamento ? ' (em andamento)' : ''}`;
  }

  function resumo(d) {
    const item = (rotulo, valor, sub) => el('div', {}, el('dt', { textContent: rotulo }), el('dd', {}, valor, sub ? el('span', { class: 'sub', textContent: sub }) : null));
    const out = [];
    out.push(d.tempo ? item('Tempo', horas(d.tempo.minutos), variacao(d.tempo.minutos, d.tempo.anteriorMinutos, horas)) : item('Tempo', '—', 'sem a pasta 80-tempo'));
    if (d.tempo) out.push(item('Dias com registro', String(d.tempo.dias)));
    out.push(d.gastos ? item('Gastos', BRL.format(d.gastos.total), variacao(d.gastos.total, d.gastos.anteriorTotal, (v) => BRL.format(v))) : item('Gastos', '—', 'indisponível'));
    if (d.metas) out.push(item('Metas', `${d.metas.resumo.total}`, `${d.metas.resumo.atrasadas} atrasada${d.metas.resumo.atrasadas === 1 ? '' : 's'}, ${d.metas.resumo.concluidas} concluída${d.metas.resumo.concluidas === 1 ? '' : 's'}`));
    return out;
  }

  function listaProjetos(d) {
    if (!d.tempo) return el('p', { class: 'vazio', textContent: 'Sem a pasta 80-tempo.' });
    if (!d.tempo.projetos.length) return el('p', { class: 'vazio', textContent: 'Nenhum registro neste período.' });
    const maior = d.tempo.projetos[0].minutos || 1;
    return el('ul', { class: 'rel-lista' }, ...d.tempo.projetos.map((p) => el('li', {},
      el('span', { class: 'nome', textContent: p.projeto }), barra((p.minutos / maior) * 100, p.projeto),
      el('span', { class: 'quanto' }, el('strong', { textContent: horas(p.minutos) }), el('span', { class: 'suave', textContent: ` · ${NUM1.format((p.minutos / d.tempo.minutos) * 100)}%` })))));
  }

  function listaGastos(d) {
    if (!d.gastos) return el('p', { class: 'vazio', textContent: 'Financeiro indisponível.' });
    if (!d.gastos.categorias.length) return el('p', { class: 'vazio', textContent: 'Nenhum gasto neste período.' });
    const maior = d.gastos.categorias[0].valor || 1;
    return el('ul', { class: 'rel-lista' }, ...d.gastos.categorias.map((c) => el('li', {},
      el('span', { class: 'nome', textContent: c.nome }), barra((c.valor / maior) * 100, c.nome),
      el('span', { class: 'quanto' }, el('strong', { textContent: BRL.format(c.valor) }), el('span', { class: 'suave', textContent: ` · ${NUM1.format(c.pct)}%` })))));
  }

  function listaMetas(d) {
    if (!d.metas || !d.metas.lista.length) return el('p', { class: 'vazio', textContent: 'Nenhuma meta encontrada.' });
    return el('ul', { class: 'rel-lista' }, ...d.metas.lista.map((m) => {
      const [cor, texto] = STATUS[m.status] || [];
      return el('li', {},
        el('span', { class: 'nome' }, m.nome, el('span', { class: 'suave', textContent: ` · ${m.area}` })), barra(m.progresso, m.nome),
        el('span', { class: 'quanto' }, el('strong', { textContent: `${NUM1.format(m.progresso)}%` }), cor ? el('span', { class: 'status' }, el('i', { class: `bolinha ${cor}` }), texto) : null));
    }));
  }

  // O mesmo conteúdo em texto simples, para colar numa nota ou mensagem.
  function textoDoResumo(d) {
    const linhas = [`Relatório · ${rotuloPeriodo(d)}`, ''];
    if (d.tempo) {
      linhas.push(`Tempo: ${horas(d.tempo.minutos)} em ${d.tempo.dias} dia${d.tempo.dias === 1 ? '' : 's'}`);
      for (const p of d.tempo.projetos) linhas.push(`  - ${p.projeto}: ${horas(p.minutos)}`);
    }
    if (d.gastos) {
      linhas.push('', `Gastos: ${BRL.format(d.gastos.total)}`);
      for (const c of d.gastos.categorias) linhas.push(`  - ${c.nome}: ${BRL.format(c.valor)} (${NUM1.format(c.pct)}%)`);
    }
    if (d.metas) {
      linhas.push('', `Metas (hoje): ${d.metas.resumo.total}, ${d.metas.resumo.atrasadas} atrasadas, ${d.metas.resumo.concluidas} concluídas`);
      for (const m of d.metas.lista) linhas.push(`  - ${m.nome}: ${NUM1.format(m.progresso)}%${STATUS[m.status] ? ` (${STATUS[m.status][1]})` : ''}`);
    }
    return linhas.join('\n');
  }

  function render(d) {
    dados = d;
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), d.avisos);
    for (const b of $('tipos').children) b.setAttribute('aria-pressed', String(b.dataset.tipo === d.tipo));
    $('periodo').textContent = rotuloPeriodo(d);
    $('proximo').disabled = !d.proximo;
    $('hoje-btn').disabled = d.emAndamento;
    $('resumo').replaceChildren(...resumo(d));
    $('tempo').replaceChildren(listaProjetos(d));
    $('gastos').replaceChildren(listaGastos(d));
    $('metas').replaceChildren(listaMetas(d));
  }

  async function carregar() {
    try {
      const q = new URLSearchParams({ tipo, ...(ref ? { ref } : {}) });
      const r = await fetch(`/api/relatorios?${q}`, { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para montar o relatório (${e.message}).`], true);
    }
  }

  function ir(novoTipo, novoRef) {
    tipo = novoTipo;
    ref = novoRef;
    const q = new URLSearchParams({ tipo, ...(ref ? { ref } : {}) });
    history.replaceState(null, '', `?${q}`);
    carregar();
  }

  $('anterior').append(icone('chevron-left'));
  $('proximo').append(icone('chevron-right'));
  $('tipos').addEventListener('click', (e) => { const b = e.target.closest('button[data-tipo]'); if (b && b.dataset.tipo !== tipo) ir(b.dataset.tipo, ''); });
  $('anterior').addEventListener('click', () => dados && ir(tipo, dados.anterior));
  $('proximo').addEventListener('click', () => dados?.proximo && ir(tipo, dados.proximo));
  $('hoje-btn').addEventListener('click', () => ir(tipo, ''));
  $('copiar').addEventListener('click', async () => {
    if (!dados) return;
    const t = textoDoResumo(dados);
    try {
      await navigator.clipboard.writeText(t);
      $('copiado').textContent = 'Resumo copiado.';
    } catch {
      $('copiado').textContent = 'O navegador não deixou copiar; abra o relatório e selecione o texto.';
    }
  });

  carregar();
  window.aoVivo('relatorios', carregar);
})();
