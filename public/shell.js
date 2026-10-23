// Shell: barra lateral, gaveta no celular, tema, linha da fonte e conexão SSE.
// Expõe window.cerebro (el, icone, avisos, relativo) para as páginas.
(() => {
  'use strict';

  const main = document.querySelector('main');
  if (!main) return;
  if (!main.id) main.id = 'conteudo';
  main.tabIndex = -1;

  const SVG = 'http://www.w3.org/2000/svg';
  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('aria-') || k.startsWith('data-') || k === 'role') node.setAttribute(k, v);
      else node[k] = v;
    }
    for (const c of children) if (c != null && c !== false) node.append(c);
    return node;
  }
  function icone(nome, classe = '') {
    const svg = document.createElementNS(SVG, 'svg');
    svg.setAttribute('class', `icone ${classe}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(SVG, 'use');
    use.setAttribute('href', `/static/icons.svg#i-${nome}`);
    svg.append(use);
    return svg;
  }
  // "há 2 horas", "ontem", "há 3 dias".
  const RTF = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  function relativo(iso) {
    const s = (new Date(iso) - Date.now()) / 1000;
    const passos = [[60, 'second'], [3600, 'minute', 60], [86400, 'hour', 3600], [2592000, 'day', 86400], [31536000, 'month', 2592000], [Infinity, 'year', 31536000]];
    for (const [lim, un, div = 1] of passos) if (Math.abs(s) < lim) return RTF.format(Math.round(s / div), un);
    return '';
  }
  function avisos(ul, lista, erro = false) {
    ul.replaceChildren(...lista.map((t) => el('li', { class: erro ? 'erro' : '' }, icone('circle-alert', 'p'), el('span', { textContent: t }))));
  }
  window.cerebro = { el, icone, relativo, avisos };

  const ICONES = {
    home: 'house', agenda: 'calendar', metas: 'target', relatorios: 'chart-line',
    kanban: 'square-kanban', orcamento: 'calculator', propostas: 'file-text', contratos: 'file-pen-line',
    demandas: 'inbox', tempo: 'timer', financeiro: 'wallet', diagnostico: 'activity', lancar: 'square-pen',
    estudos: 'graduation-cap', biblioteca: 'library',
  };

  // ---------- cabeça: ícones e cor do navegador (uma vez, para todas as páginas) ----------
  const ICONE_NORMAL = '/favicon.svg';
  const ICONE_DEMO = '/favicon-demo.svg';
  function ligacao(rel, atributos) {
    if (document.head.querySelector(`link[rel="${rel}"]${atributos.sizes ? `[sizes="${atributos.sizes}"]` : ''}`)) return null;
    const l = el('link', { rel });
    for (const [k, v] of Object.entries(atributos)) l.setAttribute(k, v);
    document.head.append(l);
    return l;
  }
  const iconeSvg = ligacao('icon', { type: 'image/svg+xml', href: ICONE_NORMAL }) || document.head.querySelector('link[rel="icon"][type="image/svg+xml"]');
  ligacao('icon', { type: 'image/png', sizes: '32x32', href: '/favicon-32.png' });
  ligacao('apple-touch-icon', { href: '/apple-touch-icon.png' });
  const metaCor = document.head.querySelector('meta[name="theme-color"]') || (() => {
    const m = el('meta', { name: 'theme-color' });
    document.head.append(m);
    return m;
  })();
  const corDaBarra = () => metaCor.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--barra-fundo').trim());

  // ---------- estrutura ----------
  const menu = el('nav', { class: 'menu', 'aria-label': 'Menu principal' }, el('p', { class: 'menu-carregando', textContent: 'Carregando o menu.' }));
  const ponto = el('span', { id: 'status-dot', class: 'ponto', title: 'conectando' });
  const vaultNome = el('span', { textContent: 'vault' });
  const avisosNav = el('p', { class: 'menu-avisos' });
  const fecharBtn = el('button', { type: 'button', class: 'botao so-icone fechar', 'aria-label': 'Fechar menu' }, icone('x'));

  const TEMAS = [['auto', 'monitor', 'Tema automático (segue o sistema)'], ['claro', 'sun', 'Tema claro'], ['escuro', 'moon', 'Tema escuro']];
  const botoesTema = TEMAS.map(([id, ic, rotulo]) => el('button', { type: 'button', class: 'botao', 'aria-label': rotulo, title: rotulo, 'data-tema': id }, icone(ic)));
  const tema = el('div', { class: 'tema' }, el('span', { textContent: 'Tema' }), el('div', { class: 'grupo-botoes', role: 'group', 'aria-label': 'Tema' }, ...botoesTema));

  const barra = el('aside', { id: 'barra', class: 'barra' },
    el('a', { class: 'marca', href: '/', textContent: 'cérebro' }),
    fecharBtn,
    menu,
    el('div', { class: 'barra-rodape' }, avisosNav, el('p', { class: 'conexao' }, ponto, vaultNome), tema));

  const abrirBtn = el('button', { type: 'button', class: 'botao', 'aria-controls': 'barra', 'aria-expanded': 'false' }, icone('menu'), 'Menu');
  const topoMovel = el('header', { class: 'topo-movel' }, abrirBtn, el('a', { class: 'marca', href: '/', textContent: 'cérebro' }));
  const fundo = el('div', { class: 'barra-fundo', hidden: true });
  const pular = el('a', { class: 'pular', href: '#' + main.id, textContent: 'Pular para o conteúdo' });
  const conteudo = el('div', { class: 'conteudo' });

  main.replaceWith(conteudo);
  conteudo.append(main);
  document.body.prepend(pular, topoMovel, barra);
  document.body.append(fundo);

  // ---------- tema ----------
  function lerTema() {
    try { return localStorage.getItem('cerebro:tema') || 'auto'; } catch { return 'auto'; }
  }
  function aplicarTema(t) {
    if (t === 'claro' || t === 'escuro') document.documentElement.dataset.tema = t;
    else delete document.documentElement.dataset.tema;
    for (const b of botoesTema) b.setAttribute('aria-pressed', String(b.dataset.tema === t));
    window.dispatchEvent(new CustomEvent('cerebro:tema'));
    corDaBarra();
  }
  for (const b of botoesTema) {
    b.addEventListener('click', () => {
      try { localStorage.setItem('cerebro:tema', b.dataset.tema); } catch { /* sem localStorage: vale só nesta aba */ }
      aplicarTema(b.dataset.tema);
    });
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (lerTema() === 'auto') {
      window.dispatchEvent(new CustomEvent('cerebro:tema'));
      corDaBarra();
    }
  });
  aplicarTema(lerTema());

  // ---------- gaveta ----------
  const movel = window.matchMedia('(max-width: 799.98px)');
  const aberto = () => document.body.classList.contains('menu-aberto');
  const ajustarInert = () => { barra.inert = movel.matches && !aberto(); };
  function abrir() {
    document.body.classList.add('menu-aberto');
    abrirBtn.setAttribute('aria-expanded', 'true');
    fundo.hidden = false;
    ajustarInert();
    (menu.querySelector('a[aria-current]') || menu.querySelector('a') || fecharBtn).focus();
  }
  function fechar(devolverFoco) {
    document.body.classList.remove('menu-aberto');
    abrirBtn.setAttribute('aria-expanded', 'false');
    fundo.hidden = true;
    ajustarInert();
    if (devolverFoco) abrirBtn.focus();
  }
  abrirBtn.addEventListener('click', abrir);
  fecharBtn.addEventListener('click', () => fechar(true));
  fundo.addEventListener('click', () => fechar(true));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && aberto()) fechar(true); });
  movel.addEventListener('change', () => fechar(false));
  ajustarInert();

  // ---------- menu ----------
  const rotaAtual = location.pathname.replace(/\/+$/, '') || '/';
  function item(i) {
    const conteudoItem = [icone(ICONES[i.id] || 'file-text'), el('span', { textContent: i.titulo })];
    const li = el('li');
    if (i.estado === 'ativo') {
      li.append(el('a', { href: i.rota, 'aria-current': i.rota === rotaAtual ? 'page' : null }, ...conteudoItem));
    } else {
      li.append(el('span', { class: 'em-breve', 'aria-disabled': 'true' }, ...conteudoItem));
    }
    const filhos = (i.filhos || []).filter((f) => f.estado === 'ativo');
    if (filhos.length) li.append(el('ul', { class: 'sub' }, ...filhos.map(item)));
    return li;
  }
  const achatar = (itens) => itens.flatMap((i) => [i, ...achatar(i.filhos || [])]);

  // Só os itens ativos ficam nos grupos, na ordem do nav.json; o resto vai para
  // "em construção", recolhido por padrão.
  let construcaoAberta = false;
  function montarGrupos(nav) {
    const grupos = nav.grupos
      .map((g) => ({ nome: g.nome, itens: g.itens.filter((i) => i.estado === 'ativo') }))
      .filter((g) => g.itens.length)
      .map((g, n) => el('div', { class: 'grupo' },
        el('p', { class: 'grupo-nome', id: `grupo-${n}`, textContent: g.nome.toLowerCase() }),
        el('ul', { 'aria-labelledby': `grupo-${n}` }, ...g.itens.map(item))));
    const pendentes = nav.grupos.flatMap((g) => achatar(g.itens)).filter((i) => i.estado !== 'ativo');
    if (pendentes.length) {
      const det = el('details', { class: 'grupo construcao', open: construcaoAberta },
        el('summary', {}, icone('chevron-down', 'seta'), el('span', { textContent: 'em construção' }), el('span', { class: 'contador', textContent: String(pendentes.length) })),
        el('ul', {}, ...pendentes.map((i) => item({ ...i, filhos: [] }))));
      det.addEventListener('toggle', () => { construcaoAberta = det.open; });
      grupos.push(det);
    }
    return grupos;
  }

  // Título da aba: o nome curto da página, a partir do nav, só aqui. Home vira "cérebro".
  function titularAba(nav) {
    const atual = nav.grupos.flatMap((g) => achatar(g.itens)).find((i) => i.rota === rotaAtual);
    if (!atual) return;
    document.title = (atual.id === 'home' ? 'cérebro' : atual.curto || atual.titulo) + (nav.demo ? ' (demo)' : '');
  }

  let faixa = null;
  async function carregarMenu() {
    try {
      const r = await fetch('/api/nav', { cache: 'no-store' });
      const nav = await r.json();
      if (!r.ok) throw new Error(nav.erro || `HTTP ${r.status}`);
      menu.replaceChildren(...montarGrupos(nav));
      vaultNome.textContent = nav.vault;
      avisosNav.textContent = nav.avisos.length ? `nav.json tem ${nav.avisos.length} aviso(s); passe o mouse para ver.` : '';
      avisosNav.title = nav.avisos.join('\n');

      document.body.classList.toggle('com-demo', !!nav.demo);
      titularAba(nav);
      if (iconeSvg) iconeSvg.setAttribute('href', nav.demo ? ICONE_DEMO : ICONE_NORMAL);
      if (nav.demo && !faixa) {
        const data = nav.demo.hoje ? new Date(nav.demo.hoje + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : null;
        faixa = el('div', { class: 'faixa-demo', role: 'note' },
          el('strong', { textContent: 'Modo demonstração.' }), ` Dados inventados${data ? `; hoje simulado em ${data}` : ''}.`);
        conteudo.prepend(faixa);
      }
    } catch (e) {
      menu.replaceChildren(el('p', { class: 'menu-carregando', textContent: `Não deu para montar o menu (${e.message}). Confira o nav.json.` }));
    }
  }
  carregarMenu();

  // ---------- fonte da página ----------
  const area = rotaAtual === '/' ? 'home' : rotaAtual.split('/')[1];
  async function carregarFonte() {
    const cab = main.querySelector('.cabecalho');
    if (!cab) return;
    let linha = cab.querySelector('.fonte');
    if (!linha) {
      linha = el('p', { class: 'fonte' });
      cab.append(linha);
    }
    try {
      const r = await fetch(`/api/fontes/${area}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const f = await r.json();
      // Um arquivo por linha (caminho e "alterado há X"); "Abrir no Obsidian" na primeira.
      const principal = f.itens.find((i) => i.existe) || f.itens[0];
      linha.replaceChildren(...f.itens.map((i, n) => el('span', { class: 'origem' },
        n === 0 ? icone('file-clock', 'p') : el('span', { class: 'recuo', 'aria-hidden': 'true' }),
        el('span', { class: 'arquivo' },
          el('span', { class: 'caminho', textContent: i.caminho }),
          i.existe ? (i.mtime ? `, alterado ${relativo(i.mtime)}` : '') : ', não encontrado'),
        n === 0 && principal ? el('a', { href: principal.link }, 'Abrir no Obsidian', icone('external-link', 'p')) : null)));
    } catch (e) {
      linha.replaceChildren(el('span', { class: 'origem' }, icone('file-clock', 'p'), `Não deu para ler a origem desta página (${e.message}).`));
    }
  }
  carregarFonte();
  setInterval(carregarFonte, 60000); // "há N minutos" envelhece

  // ---------- conexão SSE ----------
  let jaAbriu = false;
  const es = new EventSource('/events');
  es.addEventListener('change', (e) => {
    let detalhe = {};
    try { detalhe = JSON.parse(e.data); } catch { /* evento sem JSON: avisa todo mundo */ }
    if (detalhe.area === 'nav') carregarMenu();
    else carregarFonte();
    window.dispatchEvent(new CustomEvent('cerebro:mudou', { detail: detalhe }));
  });
  es.onopen = () => {
    ponto.classList.add('on');
    ponto.title = 'ao vivo';
    if (jaAbriu) {
      carregarMenu();
      carregarFonte();
      window.dispatchEvent(new CustomEvent('cerebro:reconectou'));
    }
    jaAbriu = true;
  };
  es.onerror = () => {
    ponto.classList.remove('on');
    ponto.title = 'desconectado, tentando de novo';
  };
})();
