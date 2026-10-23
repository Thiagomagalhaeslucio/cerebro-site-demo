(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const NUM1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
  const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : 'sem data');

  function progresso(pct, rotulo) {
    const s = el('span');
    s.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    return el('span', { class: 'progresso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': rotulo }, s);
  }
  const contagem = (feitos, total, pct) => el('span', { class: 'conta' }, el('strong', { textContent: `${feitos} de ${total}` }), ` ${NUM1.format(pct)}%`);

  function render(d) {
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), d.avisos);

    // Guarda quais roadmaps estavam abertos para não fechar a cada atualização.
    // Na primeira leitura, o roadmap em foco já vem aberto.
    const primeira = !document.querySelector('details.roadmap');
    const abertos = new Set(primeira ? d.roadmaps.filter((r) => r.foco).map((r) => r.nome) : [...document.querySelectorAll('details.roadmap[open]')].map((x) => x.dataset.nome));
    $('roadmaps').replaceChildren(...(d.roadmaps.length
      ? d.roadmaps.map((r) => el('details', { class: 'roadmap', open: abertos.has(r.nome), 'data-nome': r.nome },
        el('summary', {},
          icone('chevron-down', 'p seta'),
          el('span', { class: 'nome' }, r.titulo, r.foco ? el('span', { class: 'marca-foco', textContent: 'foco' }) : null),
          progresso(r.pct, r.titulo),
          contagem(r.feitos, r.total, r.pct)),
        el('ul', { class: 'secoes' }, ...r.secoes.map((s) => el('li', {},
          el('span', { class: 'nome', textContent: s.titulo }),
          progresso(s.pct, s.titulo),
          contagem(s.feitos, s.total, s.pct))))))
      : [el('p', { class: 'vazio', textContent: 'Nenhum roadmap encontrado. Roadmap é um arquivo na raiz de 60-estudos/ com a tag "roadmap" no frontmatter.' })]));

    $('proximos').replaceChildren(...(d.roadmaps.length ? d.roadmaps.flatMap((r) => [
      el('h3', { class: 'roadmap-nome' }, r.titulo, r.foco ? el('span', { class: 'marca-foco', textContent: 'foco' }) : null),
      r.proximos.length
        ? el('ol', { class: 'lista passos' }, ...r.proximos.map((p) => el('li', {},
          el('span', { class: 'principal', textContent: p.texto }),
          el('span', { class: 'meta', textContent: [p.secao, p.subsecao].filter(Boolean).join(', ') }))))
        : el('p', { class: 'vazio', textContent: 'Todos os checkboxes estão marcados.' }),
    ]) : [el('p', { class: 'vazio', textContent: 'Sem roadmaps, sem próximos passos.' })]));

    $('revisoes-t').textContent = d.revisoes.length ? `Revisões pendentes (${d.revisoes.length})` : 'Revisões pendentes';
    $('revisoes').replaceChildren(...(d.revisoes.length
      ? d.revisoes.map((r) => el('tr', {},
        el('td', {},
          el('a', { href: r.link, title: 'Abrir no Obsidian' }, r.modulo || r.nome),
          el('span', { class: 'caminho' }, el('code', { textContent: r.arquivo }))),
        el('td', { class: 'n', textContent: dataBR(r.data) })))
      : [el('tr', {}, el('td', { colSpan: 2, class: 'vazio', textContent: 'Nenhuma nota de 20-biblioteca com status "revisão-pendente".' }))]));
  }

  async function carregar() {
    try {
      const r = await fetch('/api/estudos', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler os estudos (${e.message}). Confira as pastas 60-estudos e 20-biblioteca.`], true);
    }
  }

  carregar();
  window.aoVivo('estudos', carregar);
})();
