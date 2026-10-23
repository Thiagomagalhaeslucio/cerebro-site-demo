(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  // Prazo: só o atraso e o "hoje" ganham bolinha (semáforo); "amanhã" é texto.
  const BOLINHA = { atrasado: 'vermelho', hoje: 'amarelo' };

  $('anterior').append(icone('chevron-left'));
  $('proxima').append(icone('chevron-right'));

  let dados = null;
  let semana = null; // semana mostrada; mantida entre atualizações
  let projeto = '';

  function cartao(c) {
    const prazo = c.prazo
      ? el('span', { class: 'status' },
        BOLINHA[c.etiqueta] ? el('i', { class: `bolinha ${BOLINHA[c.etiqueta]}` }) : null,
        c.etiqueta ? `${c.etiqueta}, ${ddmm(c.prazo)}` : `prazo ${ddmm(c.prazo)}`)
      : null;
    return el('li', { class: 'card' + (c.concluido ? ' concluido' : '') },
      el('span', { class: 'titulo-card', textContent: c.titulo }),
      prazo || c.projeto ? el('span', { class: 'meta-card' }, prazo, c.projeto ? el('span', { textContent: '#' + c.projeto }) : null) : null);
  }

  function render() {
    const lista = dados.semanas.map((s) => s.semana);
    if (!lista.includes(semana)) semana = dados.escolhida;
    const i = lista.indexOf(semana);
    const s = dados.semanas[i];

    $('meta').textContent = `Semana atual ${dados.semanaAtual}`;
    avisos($('avisos'), dados.avisos);
    $('anterior').disabled = i <= 0;
    $('proxima').disabled = i < 0 || i >= lista.length - 1;

    if (!s) {
      $('semana').textContent = 'Nenhuma semana';
      $('resumo').textContent = '';
      $('quadro').replaceChildren(el('p', { class: 'vazio', textContent: 'Nenhum arquivo kanban-AAAA-SS.md em 10-diario. A skill semana cria o da semana atual no primeiro uso.' }));
      return;
    }

    $('semana').textContent = `Semana ${s.semana}, de ${ddmm(s.segunda)} a ${ddmm(s.domingo)}${s.semana === dados.semanaAtual ? '' : ' (não é a atual)'}`;
    $('resumo').replaceChildren(el('strong', { textContent: `${s.feitos} de ${s.total}` }), ' feitos, ',
      s.atrasados ? el('span', { class: 'status' }, el('i', { class: 'bolinha vermelho' }), `${s.atrasados} atrasado${s.atrasados === 1 ? '' : 's'}`) : 'nenhum atrasado');

    const sel = $('projeto');
    const opcoes = ['', ...dados.projetos];
    if (sel.options.length !== opcoes.length || [...sel.options].some((o, k) => o.value !== opcoes[k])) {
      sel.replaceChildren(...opcoes.map((p) => el('option', { value: p, textContent: p ? '#' + p : 'todos' })));
    }
    if (!opcoes.includes(projeto)) projeto = '';
    sel.value = projeto;

    $('quadro').replaceChildren(...s.colunas.map((col, n) => {
      const cards = col.cards.filter((c) => !projeto || c.projeto === projeto);
      const id = `col-${n}`;
      return el('section', { class: 'coluna', 'aria-labelledby': id },
        el('h2', { id }, col.titulo, el('span', { class: 'contador', textContent: String(cards.length) })),
        cards.length
          ? el('ul', { class: 'cards' }, ...cards.map(cartao))
          : el('p', { class: 'vazio', textContent: projeto ? 'Nada deste projeto.' : 'Vazio.' }));
    }));
  }

  const ir = (delta) => {
    const lista = dados.semanas.map((s) => s.semana);
    semana = lista[Math.min(lista.length - 1, Math.max(0, lista.indexOf(semana) + delta))];
    render();
  };
  $('anterior').addEventListener('click', () => ir(-1));
  $('proxima').addEventListener('click', () => ir(1));
  $('projeto').addEventListener('change', (e) => { projeto = e.target.value; render(); });

  async function carregar() {
    try {
      const r = await fetch('/api/kanban', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      dados = j;
      render();
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler o kanban (${e.message}). Confira os arquivos kanban-AAAA-SS.md em 10-diario.`], true);
    }
  }

  carregar();
  window.aoVivo('kanban', carregar);
})();
