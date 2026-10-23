(() => {
  'use strict';

  const { el, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  // Datas AAAA-MM-DD sem depender do fuso.
  const comoData = (iso) => new Date(iso + 'T12:00:00Z');
  const somaDias = (iso, n) => { const d = comoData(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmt = (iso, op) => comoData(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC', ...op });
  const ddmm = (iso) => fmt(iso, { day: '2-digit', month: '2-digit' });

  const juntar = (itens) => (itens.length <= 1 ? itens.join('') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`);
  const tipoPonto = (e) => (e.atrasado ? 'atrasado' : e.origem === 'agenda' ? 'agenda' : e.origem === 'kanban' ? 'kanban' : 'outra');

  // ---------- a frase: o ritmo do dia e uma contagem; os títulos ficam em "Pede atenção" ----------
  const CONTAGEM = ['nenhuma', 'uma', 'duas', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'];

  function frase(h, ag, pendentes) {
    const b = (t) => el('strong', { textContent: t });
    const partes = [];
    const comHora = ag ? ag.eventos.filter((e) => e.data === h.hoje && e.origem === 'agenda' && e.inicio) : [];
    if (comHora.length) partes.push(['Hoje tem ', b(juntar(comHora.map((e) => `${e.titulo} às ${e.inicio}`))), '.']);
    else if (ag) partes.push(['Nada marcado com hora hoje.']);

    // A contagem é o número de linhas do bloco "Pede atenção".
    const n = pendentes.length;
    if (!n) partes.push(['Nada pendente hoje.']);
    else {
      const quantas = n < CONTAGEM.length ? CONTAGEM[n] : String(n);
      const texto = `${quantas[0].toUpperCase()}${quantas.slice(1)} ${n === 1 ? 'coisa pede' : 'coisas pedem'} atenção`;
      partes.push([el('a', { href: '#pede-atencao', textContent: texto }), '.']);
    }
    return partes.flatMap((p, i) => (i ? [' ', ...p] : p));
  }

  // ---------- faixa da semana ----------
  let primeiraVez = true;
  function faixa(h, ag) {
    const deslocamento = (comoData(h.hoje).getUTCDay() + 6) % 7; // segunda = 0
    const segunda = somaDias(h.hoje, -deslocamento);
    const dias = Array.from({ length: 7 }, (_, i) => somaDias(segunda, i));
    $('semana-titulo').textContent = `Semana de ${ddmm(dias[0])} a ${ddmm(dias[6])}`;

    const ol = $('faixa');
    ol.replaceChildren(...dias.map((iso) => {
      const evs = ag ? ag.eventos.filter((e) => e.data === iso) : [];
      const nome = fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
      const rotulo = `${nome}: ${evs.length ? `${evs.length} ${evs.length === 1 ? 'item' : 'itens'}` : 'nada marcado'}`;
      const primeiro = evs.find((e) => e.origem === 'agenda') || evs[0];
      return el('li', { class: iso === h.hoje ? 'hoje' : iso < h.hoje ? 'passado' : '' },
        el('a', { href: `/agenda?dia=${iso}`, 'aria-label': rotulo, 'aria-current': iso === h.hoje ? 'date' : null },
          el('span', { class: 'dia-sem', textContent: fmt(iso, { weekday: 'short' }).replace('.', '') }),
          el('span', { class: 'dia-num', textContent: String(Number(iso.slice(8))) }),
          evs.length ? el('span', { class: 'pontos', 'aria-hidden': 'true' }, ...evs.slice(0, 8).map((e) => el('i', { class: `pt ${tipoPonto(e)}` }))) : null,
          primeiro ? el('span', { class: 'resumo-dia', textContent: (primeiro.inicio ? primeiro.inicio + ' ' : '') + primeiro.titulo }) : null));
    }));
    if (primeiraVez) {
      ol.classList.add('entrando');
      primeiraVez = false;
    } else {
      ol.classList.remove('entrando');
    }

    $('legenda').replaceChildren(
      el('span', {}, el('i', { class: 'pt agenda' }), 'compromisso'),
      el('span', {}, el('i', { class: 'pt kanban' }), 'prazo do kanban'),
      el('span', {}, el('i', { class: 'pt outra' }), 'outras áreas'),
      el('span', {}, el('i', { class: 'pt atrasado' }), 'atrasado'));
  }

  // ---------- duas colunas: pede atenção, em andamento ----------
  const semAcento = (t) => String(t).replace(/^Prazo: /, '');
  const em = (n) => (n === 0 ? 'hoje' : n === 1 ? 'amanhã' : n > 0 ? `em ${n} dias` : `há ${-n} dias`);

  // Uma linha com link: título à esquerda, valor à direita, detalhe pequeno embaixo.
  function linha(href, titulo, { valor, detalhe, status } = {}) {
    return el('li', {}, el('a', { href },
      el('span', { class: 'principal' }, status ? el('i', { class: `bolinha ${status}` }) : null, el('span', { class: 'titulo', textContent: titulo })),
      valor != null ? el('span', { class: 'valor' }, valor) : null,
      detalhe ? el('span', { class: 'meta', textContent: detalhe }) : null));
  }
  const PEDE_ATENCAO = new Set(['amarelo', 'vermelho']);
  const area = (h, id) => h.cartoes.find((c) => c.area === id);

  // O que pede atenção hoje, uma entrada por linha do bloco (a frase conta estas mesmas).
  function pendentesDoDia(h, ag) {
    const eventos = ag ? ag.eventos : [];
    const itens = [];
    for (const e of eventos.filter((x) => x.atrasado && x.data < h.hoje))
      itens.push({ href: e.origem === 'kanban' ? '/kanban' : `/agenda?dia=${e.data}`, titulo: semAcento(e.titulo), valor: `atrasado desde ${ddmm(e.data)}`, status: 'vermelho' });
    for (const e of eventos.filter((x) => x.data === h.hoje && x.origem === 'kanban'))
      itens.push({ href: '/kanban', titulo: semAcento(e.titulo), valor: 'vence hoje', status: 'amarelo' });
    const diag = area(h, 'financeiro')?.itens.find((i) => i.status);
    if (diag && PEDE_ATENCAO.has(diag.status)) itens.push({ href: '/financeiro/diagnostico', titulo: 'Financeiro', detalhe: diag.valor, status: diag.status });
    for (const m of (area(h, 'metas')?.itens || []).filter((i) => i.atrasada))
      itens.push({ href: m.rota || '/metas', titulo: m.rotulo, valor: 'meta atrasada', detalhe: m.prazo ? `Prazo: ${ddmm(m.prazo)}` : null, status: 'vermelho' });
    return itens;
  }

  function atencao(pendentes) {
    return pendentes.length
      ? pendentes.map((p) => linha(p.href, p.titulo, p))
      : [el('li', {}, el('p', { class: 'vazio', textContent: 'Nada pendente hoje.' }))];
  }

  // "Salário em 22 dias; VT e VR em 6 dias", das datas() que o financeiro já fornece.
  function datasFinanceiro(h) {
    const dias = {};
    for (const d of h.datas.filter((x) => x.area === 'financeiro')) dias[d.rotulo.replace('Próximo ', '')] = d.emDias;
    const partes = [];
    if ('salário' in dias) partes.push(`Salário ${em(dias['salário'])}`);
    const { VT, VR } = dias;
    if (VT != null && VT === VR) partes.push(`VT e VR ${em(VT)}`);
    else {
      if (VT != null) partes.push(`VT ${em(VT)}`);
      if (VR != null) partes.push(`VR ${em(VR)}`);
    }
    return partes.join('; ');
  }

  function andamento(h) {
    const linhas = [];
    const kan = area(h, 'kanban');
    if (kan) {
      // Quando a semana atual ainda não tem arquivo, o rótulo da área explica; senão o título basta.
      const rotulo = kan.itens[0]?.rotulo || '';
      linhas.push(kan.erro
        ? linha('/kanban', 'Kanban da semana', { valor: 'indisponível', detalhe: kan.erro })
        : linha('/kanban', 'Kanban da semana', { valor: kan.itens[0]?.valor, detalhe: rotulo.includes('(') ? rotulo : null }));
    }
    const est = area(h, 'estudos');
    if (est) {
      if (est.erro) linhas.push(linha('/estudos', 'Estudos', { valor: 'indisponível', detalhe: est.erro }));
      for (const i of est.itens.filter((x) => x.detalhe)) linhas.push(linha('/estudos', i.rotulo, { valor: i.detalhe, detalhe: `${i.foco ? 'Foco · ' : ''}Próximo: ${i.valor}` }));
    }
    const met = area(h, 'metas');
    if (met) {
      if (met.erro) linhas.push(linha('/metas', 'Metas', { valor: 'indisponível', detalhe: met.erro }));
      else {
        // As atrasadas já estão em "Pede atenção"; aqui vai o resto.
        const c = met.itens.find((i) => i.contagem)?.contagem;
        const outras = c ? c.total - c.atrasadas : 0;
        if (outras) {
          const partes = [[c.noRitmo, 'no ritmo'], [c.atencao, 'em atenção'], [c.concluidas, c.concluidas === 1 ? 'concluída' : 'concluídas'], [c.semStatus, 'sem prazo']]
            .filter(([n]) => n).map(([n, t]) => `${n} ${t}`);
          linhas.push(linha('/metas', 'Metas', { valor: `${outras} ${outras === 1 ? 'meta' : 'metas'}`, detalhe: partes.join(', ') }));
        }
      }
    }
    const tem = area(h, 'tempo');
    if (tem) {
      if (tem.erro) linhas.push(linha('/tempo', 'Tempo', { valor: 'indisponível', detalhe: tem.erro }));
      else {
        const semana = tem.itens.find((i) => i.rotulo === 'Semana');
        const mes = tem.itens.find((i) => i.rotulo === 'Mês');
        if (semana && mes) linhas.push(linha('/tempo', 'Tempo', { valor: semana.valor, detalhe: `na semana; no mês: ${mes.valor}` }));
      }
    }
    const dem = area(h, 'demandas');
    if (dem && !dem.erro) {
      const n = (rotulo) => dem.itens.find((i) => i.rotulo === rotulo)?.valor ?? 0;
      const projetos = n('Projetos');
      const abertas = n('Propostas em aberto');
      if (projetos || abertas) {
        const partes = [abertas ? `${abertas} ${abertas === 1 ? 'proposta' : 'propostas'} em aberto` : null, n('Backlog em aberto') ? `${n('Backlog em aberto')} no backlog` : null].filter(Boolean);
        linhas.push(linha('/demandas', 'Demandas', { valor: `${projetos} ${projetos === 1 ? 'projeto' : 'projetos'}`, detalhe: partes.join(', ') || null }));
      }
    } else if (dem) linhas.push(linha('/demandas', 'Demandas', { valor: 'indisponível', detalhe: dem.erro }));
    const fin = area(h, 'financeiro');
    if (fin) {
      if (fin.erro) linhas.push(linha('/financeiro', 'Financeiro', { valor: 'indisponível', detalhe: fin.erro }));
      else {
        const pat = fin.itens.find((i) => i.rotulo === 'Patrimônio');
        const diag = fin.itens.find((i) => i.status);
        linhas.push(linha('/financeiro', 'Patrimônio', { valor: pat?.valor == null ? '—' : BRL.format(pat.valor), detalhe: datasFinanceiro(h) }));
        // O veredito aparece uma vez: em "Pede atenção" se amarelo ou vermelho, aqui nos demais.
        if (diag && !PEDE_ATENCAO.has(diag.status)) linhas.push(linha(diag.rota || '/financeiro/diagnostico', 'Diagnóstico', { detalhe: diag.valor, status: diag.status }));
      }
    }
    return linhas.length ? linhas : [el('li', {}, el('p', { class: 'vazio', textContent: 'Nada em andamento nas notas.' }))];
  }

  function render(h, ag, erroAgenda) {
    const t = fmt(h.hoje, { weekday: 'long', day: 'numeric', month: 'long' });
    $('data-hoje').textContent = t.charAt(0).toUpperCase() + t.slice(1);
    avisos($('avisos'), [...h.avisos, ...(erroAgenda ? [`Não deu para ler a agenda (${erroAgenda}); a faixa da semana ficou sem pontos.`] : [])]);
    const pendentes = pendentesDoDia(h, ag);
    $('frase').replaceChildren(...frase(h, ag, pendentes));
    faixa(h, ag);
    $('atencao').replaceChildren(...atencao(pendentes));
    $('andamento').replaceChildren(...andamento(h));
  }

  async function carregar() {
    try {
      const [rh, ra] = await Promise.all([fetch('/api/home', { cache: 'no-store' }), fetch('/api/agenda', { cache: 'no-store' })]);
      const h = await rh.json();
      if (!rh.ok) throw new Error(h.erro || `HTTP ${rh.status}`);
      let ag = null;
      let erroAgenda = null;
      try {
        const j = await ra.json();
        if (!ra.ok) throw new Error(j.erro || `HTTP ${ra.status}`);
        ag = j;
      } catch (e) {
        erroAgenda = e.message;
      }
      render(h, ag, erroAgenda);
    } catch (e) {
      avisos($('avisos'), [`Não deu para montar a Home (${e.message}). Confira se o servidor está no ar e se o vault existe.`], true);
    }
  }

  carregar();
  window.aoVivo('*', carregar);
})();
