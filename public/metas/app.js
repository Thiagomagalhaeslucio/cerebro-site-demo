(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

  // Cada status tem o texto e a cor do semáforo; o texto fica em tinta ao lado da bolinha.
  const STATUS = {
    'no-ritmo': ['verde', 'no ritmo'],
    atencao: ['amarelo', 'atenção'],
    atrasada: ['vermelho', 'atrasada'],
    concluida: ['verde', 'concluída'],
  };

  const valor = (n, unidade) => (unidade === 'R$' ? BRL.format(n) : `${NUM.format(n)}${unidade ? ` ${unidade}` : ''}`);
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  function barra(pct, rotulo) {
    const s = el('span');
    s.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    return el('span', { class: 'progresso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': rotulo }, s);
  }

  function prazo(m) {
    if (!m.prazo) return el('span', { class: 'prazo suave', textContent: 'sem prazo' });
    const d = m.diasParaPrazo;
    const quando = d === 0 ? 'hoje' : d > 0 ? `em ${plural(d, 'dia', 'dias')}` : `venceu há ${plural(-d, 'dia', 'dias')}`;
    return el('span', { class: 'prazo' }, dataBR(m.prazo), el('span', { class: 'suave', textContent: m.status === 'concluida' ? '' : quando }));
  }

  function projecao(p) {
    if (!p) return null;
    if (p.tipo === 'valor') return `Projeção no próximo salário${p.data ? ` (${dataBR(p.data)})` : ''}: ${BRL.format(p.valor)}.`;
    if (p.tipo === 'salarios') return `Projeção: completa em ${plural(p.salarios, 'salário', 'salários')}.`;
    return null;
  }

  // "faltam X; no ritmo de Y por semana", na unidade da meta.
  function ritmo(m) {
    if (!m.ritmo) return null;
    const faltam = `faltam ${valor(m.ritmo.faltam, m.unidade)}`;
    if (m.ritmo.porSemana != null) return `${faltam}; no ritmo de ${valor(m.ritmo.porSemana, m.unidade)} por semana.`;
    return `${faltam}; ${m.diasParaPrazo === 0 ? 'o prazo é hoje' : 'o prazo já passou'}.`;
  }

  function linha(m) {
    const [cor, texto] = STATUS[m.status] || [];
    const detalhes = [ritmo(m), projecao(m.projecao), m.obs].filter(Boolean);
    return el('li', { 'data-status': m.status || 'sem-status' },
      el('span', { class: 'nome' }, m.rota ? el('a', { href: m.rota, textContent: m.nome }) : m.nome),
      barra(m.progresso, m.nome),
      el('span', { class: 'quanto' }, el('strong', { textContent: valor(m.atual, m.unidade === 'R$' ? 'R$' : '') }), ` de ${valor(m.alvo, m.unidade)}`),
      prazo(m),
      el('span', { class: 'situacao' }, cor ? el('span', { class: 'status' }, el('i', { class: `bolinha ${cor}` }), texto) : null),
      detalhes.length ? el('span', { class: 'detalhe' }, ...detalhes.map((t) => el('span', { textContent: t }))) : null);
  }

  function resumo(r) {
    const item = (rotulo, n, cor) => el('div', {}, el('dt', {}, cor ? el('i', { class: `bolinha ${cor}` }) : null, rotulo), el('dd', { textContent: String(n) }));
    return [
      item('Total', r.total),
      item('No ritmo', r.noRitmo, 'verde'),
      item('Atenção', r.atencao, 'amarelo'),
      item('Atrasadas', r.atrasadas, 'vermelho'),
      item('Concluídas', r.concluidas, 'verde'),
    ];
  }

  function render(d) {
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), d.avisos);
    $('resumo').replaceChildren(...resumo(d.resumo));

    const comMetas = d.areas.filter((a) => a.metas.length);
    $('areas').replaceChildren(...(comMetas.length
      ? comMetas.map((a) => el('section', { class: 'secao', 'aria-labelledby': `a-${a.id}` },
        el('h2', { id: `a-${a.id}`, textContent: a.nome }),
        el('ul', { class: 'metas' }, ...a.metas.map(linha))))
      : [el('p', { class: 'vazio', textContent: 'Nenhuma meta encontrada.' })]));

    $('dica').replaceChildren(...(d.manual.existe ? [] : [el('p', { class: 'nota dica' },
      icone('file-clock', 'p'), ` Estas são só as metas automáticas, do financeiro e dos estudos. Para acompanhar metas suas, crie ${d.manual.arquivo} com uma tabela:`,
      el('code', { textContent: '| meta | area | alvo | atual | unidade | inicio | prazo | obs |' }),
      el('span', { textContent: 'area é carreira, estudos, dinheiro, negocio ou pessoal; inicio e prazo (AAAA-MM-DD) são opcionais, mas vêm juntos.' }))]));
  }

  async function carregar() {
    try {
      const r = await fetch('/api/metas', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler as metas (${e.message}). Confira 10-diario/metas.md, 40-financeiro e 60-estudos.`], true);
    }
  }

  carregar();
  window.aoVivo('metas', carregar);
})();
