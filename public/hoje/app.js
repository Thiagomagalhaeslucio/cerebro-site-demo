(() => {
  'use strict';

  const { el, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);

  function idade(h) {
    if (h == null) return '';
    if (h < 1) return 'há menos de 1 hora';
    if (h < 48) return `há ${Math.floor(h)} h`;
    return `há ${Math.floor(h / 24)} dias`;
  }

  function render(d) {
    const extra = [];
    if (d.existe && d.velho) extra.push(`Este resumo foi gerado ${idade(d.idadeHoras)}; peça ao Claude Code para atualizar.`);
    avisos($('avisos'), [...d.avisos, ...extra]);
    $('meta').textContent = d.gerado ? `Gerado ${idade(d.idadeHoras)}` : 'Sem resumo';
    if (!d.existe) {
      $('secoes').replaceChildren(el('p', { class: 'vazio', textContent: `Ainda não há ${d.arquivo}. Peça ao Claude Code: "atualiza o hoje".` }));
      return;
    }
    $('secoes').replaceChildren(...d.secoes.map((s) => el('section', { class: 'destaque' },
      el('h2', { class: 'titulo-destaque', textContent: s.titulo }),
      s.itens.length
        ? el('ul', { class: 'lista' }, ...s.itens.map((t) => el('li', {}, el('span', { class: 'principal', textContent: t }))))
        : el('p', { class: 'vazio', textContent: 'Nada.' }))));
  }

  async function carregar() {
    try {
      const r = await fetch('/api/hoje', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler o resumo (${e.message}).`], true);
    }
  }

  carregar();
  window.aoVivo('hoje', carregar);
})();
