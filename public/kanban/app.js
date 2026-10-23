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

  let msgMover = '';
  async function mover(s, col, c, para) {
    msgMover = 'Movendo...';
    const r = await window.escreverNoVault('kanban/operar', { semana: s.semana, versao: s.versao, operacao: { tipo: 'mover', de: col.titulo, indice: col.cards.indexOf(c), titulo: c.titulo, para } });
    msgMover = r.ok ? '' : r.mensagem;
    if (!r.ok) avisos($('avisos'), [r.mensagem], true);
    carregar(); // não espera o aviso do servidor: a tela já mostra o que ficou no arquivo
  }

  function cartao(c, s, col) {
    const prazo = c.prazo
      ? el('span', { class: 'status' },
        BOLINHA[c.etiqueta] ? el('i', { class: `bolinha ${BOLINHA[c.etiqueta]}` }) : null,
        c.etiqueta ? `${c.etiqueta}, ${ddmm(c.prazo)}` : `prazo ${ddmm(c.prazo)}`)
      : null;
    return el('li', { class: 'card' + (c.concluido ? ' concluido' : '') },
      el('span', { class: 'titulo-card', textContent: c.titulo }),
      prazo || c.projeto ? el('span', { class: 'meta-card' }, prazo, c.projeto ? el('span', { textContent: '#' + c.projeto }) : null) : null,
      el('span', { class: 'mover' },
        el('select', { 'aria-label': `Mover "${c.titulo}" para`, onchange: (e) => mover(s, col, c, e.target.value) },
          el('option', { value: '', textContent: 'Mover para…' }),
          ...s.colunas.filter((o) => o.titulo !== col.titulo).map((o) => el('option', { value: o.titulo, textContent: o.titulo })))));
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

    const selCol = $('n-coluna');
    if (selCol.options.length !== s.colunas.length) selCol.replaceChildren(...s.colunas.map((c) => el('option', { value: c.titulo, textContent: c.titulo })));
    $('n-projetos').replaceChildren(...dados.projetos.map((p) => el('option', { value: p })));

    $('quadro').replaceChildren(...s.colunas.map((col, n) => {
      const cards = col.cards.filter((c) => !projeto || c.projeto === projeto);
      const id = `col-${n}`;
      return el('section', { class: 'coluna', 'aria-labelledby': id },
        el('h2', { id }, col.titulo, el('span', { class: 'contador', textContent: String(cards.length) })),
        cards.length
          ? el('ul', { class: 'cards' }, ...cards.map((c) => cartao(c, s, col)))
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

  $('novo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const s = dados.semanas.find((x) => x.semana === semana);
    if (!s) return;
    const op = { tipo: 'criar', coluna: $('n-coluna').value, titulo: $('n-titulo').value };
    if ($('n-prazo').value) op.prazo = $('n-prazo').value;
    if ($('n-projeto').value.trim()) op.projeto = $('n-projeto').value.trim().replace(/^#/, '');
    $('novo-msg').textContent = 'Gravando...';
    const r = await window.escreverNoVault('kanban/operar', { semana: s.semana, versao: s.versao, operacao: op });
    $('novo-msg').textContent = r.ok ? 'Card criado.' : r.mensagem;
    if (r.ok) { $('n-titulo').value = ''; $('n-prazo').value = ''; }
    carregar();
  });

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
