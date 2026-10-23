(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);

  // Datas AAAA-MM-DD sem depender do fuso.
  const comoData = (iso) => new Date(iso + 'T12:00:00Z');
  const toISO = (d) => d.toISOString().slice(0, 10);
  const somaDias = (iso, n) => { const d = comoData(iso); d.setUTCDate(d.getUTCDate() + n); return toISO(d); };
  const fmt = (iso, op) => comoData(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...op });
  const tipoPonto = (e) => (e.atrasado ? 'atrasado' : e.origem === 'agenda' ? 'agenda' : e.origem === 'kanban' ? 'kanban' : 'outra');
  const ORIGEM = { agenda: 'compromisso', kanban: 'prazo do kanban', outra: 'outras áreas', atrasado: 'atrasado' };

  $('mes-anterior').append(icone('chevron-left'));
  $('mes-proximo').append(icone('chevron-right'));

  const pedido = new URLSearchParams(location.search).get('dia');
  const diaPedido = /^\d{4}-\d{2}-\d{2}$/.test(pedido || '') ? pedido : null;

  let dados = null;
  let visao = diaPedido ? 'mes' : 'lista';
  let mes = diaPedido ? diaPedido.slice(0, 7) : null; // 'AAAA-MM'
  let diaEscolhido = diaPedido;

  function evento(e) {
    const hora = e.diaInteiro ? 'dia todo' : e.inicio + (e.fim ? `–${e.fim}` : '');
    const det = [e.tipo, e.obs, e.origem !== 'agenda' ? e.origem : null].filter(Boolean).join(', ');
    return el('li', { class: 'evento' },
      el('i', { class: `pt ${tipoPonto(e)}`, title: ORIGEM[tipoPonto(e)] }),
      el('span', { class: 'hora', textContent: hora }),
      el('span', { class: 'titulo-ev', textContent: e.titulo + (e.atrasado ? ' (atrasado)' : '') }),
      det ? el('span', { class: 'det', textContent: det }) : null);
  }

  function blocoDia(iso, eventos, sempre) {
    if (!eventos.length && !sempre) return null;
    const n = Math.round((comoData(iso) - comoData(dados.hoje)) / 86400000);
    const quando = n === 0 ? 'Hoje' : n === 1 ? 'Amanhã' : null;
    const data = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
    return el('div', { class: 'dia' + (n === 0 ? ' hoje' : ''), id: `dia-${iso}` },
      el('h3', {}, quando ? el('span', { class: 'quando', textContent: quando }) : null, el('span', { class: quando ? 'data' : '', textContent: data })),
      eventos.length ? el('ul', { class: 'eventos' }, ...eventos.map(evento)) : el('p', { class: 'nada', textContent: 'Nada marcado.' }));
  }

  function renderLista() {
    const fim = somaDias(dados.hoje, 13);
    const atrasados = dados.eventos.filter((e) => e.atrasado && e.data < dados.hoje);
    const blocos = [];
    if (atrasados.length) {
      blocos.push(el('div', { class: 'dia' }, el('h3', {}, el('span', { class: 'status' }, el('i', { class: 'bolinha vermelho' }), 'Atrasados')),
        el('ul', { class: 'eventos' }, ...atrasados.map(evento))));
    }
    for (let i = 0; i < 14; i++) {
      const iso = somaDias(dados.hoje, i);
      blocos.push(blocoDia(iso, dados.eventos.filter((e) => e.data === iso), i < 2));
    }
    const vazio = !dados.eventos.some((e) => e.data >= dados.hoje && e.data <= fim);
    $('dias').replaceChildren(...[
      ...blocos,
      vazio ? el('p', { class: 'vazio', textContent: 'Nada nos próximos 14 dias. Compromissos entram pela skill semana ("põe na agenda").' }) : null,
    ].filter(Boolean));
  }

  function renderMes() {
    const [a, m] = mes.split('-').map(Number);
    const primeiro = `${mes}-01`;
    const offset = (comoData(primeiro).getUTCDay() + 6) % 7; // segunda = 0
    const diasNoMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
    const inicio = somaDias(primeiro, -offset);
    const semanas = Math.ceil((offset + diasNoMes) / 7);
    const titulo = fmt(primeiro, { month: 'long', year: 'numeric' });
    $('mes-titulo').textContent = titulo.charAt(0).toUpperCase() + titulo.slice(1);

    const cab = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((d) => el('div', { class: 'cab', textContent: d, 'aria-hidden': 'true' }));
    const celulas = [];
    for (let i = 0; i < semanas * 7; i++) {
      const iso = somaDias(inicio, i);
      const evs = dados.eventos.filter((e) => e.data === iso);
      const btn = el('button', {
        type: 'button',
        class: 'cel' + (iso.startsWith(mes) ? '' : ' fora') + (iso === dados.hoje ? ' hoje' : ''),
        'aria-pressed': String(iso === diaEscolhido),
        'aria-label': `${fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' })}: ${evs.length ? `${evs.length} ${evs.length === 1 ? 'item' : 'itens'}` : 'nada marcado'}`,
      },
      el('span', { class: 'num', textContent: String(Number(iso.slice(8))) }),
      ...evs.slice(0, 3).map((e) => el('span', { class: 'item' }, el('i', { class: `pt ${tipoPonto(e)}` }), el('span', { textContent: (e.inicio ? e.inicio + ' ' : '') + e.titulo }))),
      evs.length > 3 ? el('span', { class: 'mais', textContent: `mais ${evs.length - 3}` }) : null,
      evs.length ? el('span', { class: 'pontos', 'aria-hidden': 'true' }, ...evs.slice(0, 6).map((e) => el('i', { class: `pt ${tipoPonto(e)}` }))) : null);
      btn.addEventListener('click', () => {
        diaEscolhido = iso;
        renderMes();
        document.querySelector(`.mes button[aria-label^="${fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' })}"]`)?.focus();
      });
      celulas.push(btn);
    }
    $('mes-grade').replaceChildren(...cab, ...celulas);

    const escolhido = diaEscolhido && diaEscolhido.startsWith(mes) ? diaEscolhido : null;
    $('dia-escolhido').replaceChildren(escolhido
      ? blocoDia(escolhido, dados.eventos.filter((e) => e.data === escolhido), true)
      : el('p', { class: 'vazio', textContent: 'Escolha um dia para ver os itens.' }));
  }

  function render() {
    $('meta').textContent = `Hoje ${fmt(dados.hoje, { day: '2-digit', month: '2-digit', year: 'numeric' })}`;
    avisos($('avisos'), dados.avisos);
    $('legenda').replaceChildren(...['agenda', 'kanban', 'outra', 'atrasado'].map((o) => el('span', {}, el('i', { class: `pt ${o}` }), ORIGEM[o])));
    if (!mes) mes = dados.hoje.slice(0, 7);
    if (!diaEscolhido) diaEscolhido = dados.hoje;
    $('visao-lista').hidden = visao !== 'lista';
    $('visao-mes').hidden = visao !== 'mes';
    $('aba-lista').setAttribute('aria-selected', String(visao === 'lista'));
    $('aba-mes').setAttribute('aria-selected', String(visao === 'mes'));
    if (visao === 'lista') renderLista();
    else renderMes();
  }

  function mudarMes(delta) {
    const [a, m] = mes.split('-').map(Number);
    mes = toISO(new Date(Date.UTC(a, m - 1 + delta, 1, 12))).slice(0, 7);
    render();
  }

  $('aba-lista').addEventListener('click', () => { visao = 'lista'; render(); });
  $('aba-mes').addEventListener('click', () => { visao = 'mes'; render(); });
  $('mes-anterior').addEventListener('click', () => mudarMes(-1));
  $('mes-proximo').addEventListener('click', () => mudarMes(1));

  async function carregar() {
    try {
      const r = await fetch('/api/agenda', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      dados = j;
      render();
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler a agenda (${e.message}). Confira 10-diario/agenda.md.`], true);
    }
  }

  carregar();
  // A agenda junta várias áreas: recarrega com qualquer mudança.
  window.aoVivo('*', carregar);
})();
