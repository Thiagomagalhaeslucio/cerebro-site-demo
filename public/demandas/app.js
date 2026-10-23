(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const TIPOS = { proposta: 'Proposta', contrato: 'Contrato', projeto: 'Projeto' };

  function prazo(x) {
    if (!x.prazo) return el('span', { class: 'prazo suave', textContent: 'sem prazo' });
    const d = x.diasParaPrazo;
    const ativo = x.ativa ?? x.aberta;
    const quando = !ativo ? '' : d === 0 ? 'hoje' : d > 0 ? `em ${plural(d, 'dia', 'dias')}` : `venceu há ${plural(-d, 'dia', 'dias')}`;
    return el('span', { class: 'prazo' }, dataBR(x.prazo), quando ? el('span', { class: 'suave', textContent: quando }) : null);
  }

  function detalhe(x) {
    const partes = [];
    if (x.tipo === 'projeto') {
      const b = x.backlog;
      if (b.total) partes.push(b.tipo === 'checkbox' ? `${b.abertos} de ${b.total} do backlog em aberto` : `${plural(b.abertos, 'item solto', 'itens soltos')} no backlog`);
    }
    if (x.valor != null) partes.push(BRL.format(x.valor));
    return partes.join(' · ');
  }

  function linha(x) {
    const atrasado = (x.ativa ?? x.aberta) && x.diasParaPrazo != null && x.diasParaPrazo < 0;
    return el('li', { 'data-tipo': x.tipo, 'data-encerrado': String(!(x.ativa ?? x.aberta)) },
      el('span', { class: 'tipo', textContent: TIPOS[x.tipo] }),
      el('span', { class: 'nome' }, el('a', { href: x.link, title: 'Abrir no Obsidian', textContent: x.titulo })),
      el('span', { class: 'situacao' }, atrasado ? el('i', { class: 'bolinha vermelho' }) : null, x.status),
      prazo(x),
      detalhe(x) ? el('span', { class: 'detalhe', textContent: detalhe(x) }) : null);
  }

  function cliente(g) {
    const itens = [...g.projetos, ...g.contratos, ...g.propostas]
      .sort((a, b) => Number(!(b.ativa ?? b.aberta)) * -1 - Number(!(a.ativa ?? a.aberta)) * -1 || (a.prazo || '9999').localeCompare(b.prazo || '9999'));
    return el('section', { class: 'secao cliente' },
      el('div', { class: 'secao-cab' },
        el('h2', {}, g.link ? el('a', { href: g.link, title: 'Abrir no Obsidian', textContent: g.nome }) : g.nome),
        g.valorAceito ? el('span', { class: 'suave', textContent: `${BRL.format(g.valorAceito)} em propostas aceitas` }) : null),
      itens.length ? el('ul', { class: 'demandas' }, ...itens.map(linha)) : el('p', { class: 'vazio', textContent: 'Cadastrado, sem propostas, contratos nem projetos ainda.' }));
  }

  function resumo(r) {
    const item = (rotulo, n) => el('div', {}, el('dt', { textContent: rotulo }), el('dd', { textContent: String(n) }));
    return [item('Clientes', r.clientes), item('Projetos', r.projetos), item('Propostas em aberto', r.propostasAbertas), item('Contratos', r.contratos), item('Backlog em aberto', r.backlogAberto)];
  }

  function render(d) {
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), d.avisos);
    $('resumo').replaceChildren(...resumo(d.resumo));
    $('clientes').replaceChildren(...(d.clientes.length ? d.clientes.map(cliente) : [el('p', { class: 'vazio', textContent: 'Nada por aqui ainda.' })]));
    $('dica').replaceChildren(el('p', { class: 'nota dica' }, icone('file-clock', 'p'),
      ' Cada cliente junta o que o vault tem dele: projetos (30-projetos, tag "projeto", com "cliente:" e, se quiser, "prazo:" no frontmatter), propostas e contratos (70-negocio). Prazo: "prazo" ou "entrega" no frontmatter, AAAA-MM-DD.'));
  }

  async function carregar() {
    try {
      const r = await fetch('/api/demandas', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler as demandas (${e.message}). Confira 70-negocio e 30-projetos.`], true);
    }
  }

  carregar();
  window.aoVivo('demandas', carregar);
})();
