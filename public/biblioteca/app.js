(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const semAcento = (t) => String(t).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const PENDENTE = 'revisão-pendente';

  let dados = null;

  function opcoes(id, todas, lista) {
    const atual = $(id).value;
    $(id).replaceChildren(el('option', { value: '', textContent: todas }),
      ...lista.map((x) => el('option', { value: x.nome, textContent: `${x.nome} (${x.total})` })));
    if (lista.some((x) => x.nome === atual)) $(id).value = atual; // a releitura não perde o filtro
  }

  function resumo(r) {
    const item = (rotulo, n, cor) => el('div', {}, el('dt', {}, cor ? el('i', { class: `bolinha ${cor}` }) : null, rotulo), el('dd', { textContent: String(n) }));
    return [item('Notas', r.total), ...(r.livros ? [item('Livros', r.livros)] : []), item('Revisão pendente', r.revisaoPendente, r.revisaoPendente ? 'amarelo' : null), item('Sem status', r.semStatus)];
  }

  const NUM = new Intl.NumberFormat('pt-BR');

  // Cartão do livro: a capa baixada (local) ou, sem ela, um quadro com o título; abaixo, título, autor e páginas.
  function cartaoLivro(l) {
    const capa = l.capa
      ? el('img', { src: l.capa, alt: `Capa de ${l.titulo}`, loading: 'lazy', decoding: 'async' })
      : el('span', { class: 'sem-capa', 'aria-hidden': 'true', textContent: l.titulo });
    return el('li', { 'data-tipo': 'livro' },
      el('a', { class: 'livro', href: l.link, title: [l.titulo, l.autor, l.paginas ? `${NUM.format(l.paginas)} páginas` : null, l.categoria, l.editora, l.ano].filter(Boolean).join(' · ') },
        el('span', { class: 'capa' }, capa),
        el('span', { class: 'livro-titulo', textContent: l.titulo }),
        l.autor ? el('span', { class: 'livro-autor', textContent: l.autor }) : null,
        l.paginas ? el('span', { class: 'livro-meta', textContent: `${NUM.format(l.paginas)} págs.` }) : null));
  }

  function linha(n) {
    const pendente = n.status === PENDENTE;
    return el('li', { 'data-status': n.status },
      el('span', { class: 'principal' }, el('a', { href: n.link, title: 'Abrir no Obsidian', textContent: n.titulo })),
      el('span', { class: 'situacao' }, pendente ? el('i', { class: 'bolinha amarelo' }) : null, n.status),
      el('span', { class: 'meta' }, [n.pasta, n.modulo && n.modulo !== n.titulo ? n.modulo : null, n.data ? dataBR(n.data) : null, ...n.tags.map((t) => `#${t}`)].filter(Boolean).join(' · ')));
  }

  function filtrar() {
    if (!dados) return;
    const q = semAcento($('busca').value.trim());
    const pasta = $('pasta').value;
    const status = $('status').value;
    const tipo = $('tipo').value;
    const notas = tipo === 'livro' ? [] : dados.notas.filter((n) => (!pasta || n.pasta === pasta) && (!status || n.status === status)
      && (!q || semAcento([n.titulo, n.modulo, n.nome, ...n.tags].filter(Boolean).join(' ')).includes(q)));
    // Livros não têm pasta nem status: com um desses filtros ligados, ficam de fora.
    const livros = tipo === 'nota' || pasta || status ? [] : dados.livros.filter((l) => !q || semAcento([l.titulo, l.subtitulo, l.autor, l.categoria, l.editora].filter(Boolean).join(' ')).includes(q));
    const total = dados.notas.length + dados.livros.length;
    const achadas = notas.length + livros.length;
    const nome = dados.livros.length ? ['item', 'itens'] : ['nota', 'notas'];
    $('contagem').textContent = achadas === total ? `${plural(achadas, ...nome)}.` : `${achadas} de ${plural(total, ...nome)}.`;
    const vazio = !notas.length && !livros.length ? [el('p', { class: 'vazio', textContent: total ? 'Nada com esses filtros.' : `Nenhuma nota em ${dados.pasta}/.` })] : [];
    $('notas').replaceChildren(...(notas.length ? [el('ul', { class: 'lista notas-lista' }, ...notas.map(linha))] : vazio));
    $('notas-sub').hidden = !(livros.length && notas.length);
    $('notas-sub').textContent = `Notas (${notas.length})`;
    $('livros-t').hidden = !livros.length;
    $('livros-t').textContent = `Livros (${livros.length})`;
    $('livros').replaceChildren(...(livros.length ? [el('ul', { class: 'livros-grade' }, ...livros.map(cartaoLivro))] : []));
  }

  function render(d) {
    dados = d;
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), d.avisos);
    $('resumo').replaceChildren(...resumo(d.resumo));
    $('c-tipo').hidden = !d.livros.length; // sem livros configurados, não há o que escolher
    opcoes('pasta', 'Todas as pastas', d.pastas);
    opcoes('status', 'Todos os status', d.status);
    filtrar();
  }

  async function carregar() {
    try {
      const r = await fetch('/api/biblioteca', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler a biblioteca (${e.message}). Confira a pasta 20-biblioteca.`], true);
    }
  }

  $('filtros').addEventListener('submit', (e) => e.preventDefault());
  $('filtros').addEventListener('input', filtrar);
  $('filtros').addEventListener('change', filtrar); // limpar o campo (botão x da busca) só dispara change/search
  $('busca').addEventListener('search', filtrar);
  carregar();
  window.aoVivo('biblioteca', carregar);
})();
