(() => {
  'use strict';

  const { el, icone, avisos } = window.cerebro;
  const $ = (id) => document.getElementById(id);
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // "1 h 07 min", "45 min", "2 h".
  const horas = (min) => {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h ? (m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`) : `${m} min`;
  };

  function barra(pct, rotulo) {
    const s = el('span');
    s.style.width = `${Math.min(100, Math.max(0, pct))}%`;
    return el('span', { class: 'progresso', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(pct)), 'aria-label': rotulo }, s);
  }

  // Lista de projetos; a barra é a fração do maior (o primeiro).
  function projetos(lista, total) {
    if (!lista.length) return el('p', { class: 'vazio', textContent: 'Nenhum registro.' });
    const maior = lista[0].minutos || 1;
    return el('ul', { class: 'tempo-lista' }, ...lista.map((p) => el('li', {},
      el('span', { class: 'nome', textContent: p.projeto }),
      barra((p.minutos / maior) * 100, p.projeto),
      el('span', { class: 'quanto' }, el('strong', { textContent: horas(p.minutos) }),
        total ? el('span', { class: 'suave', textContent: ` · ${Math.round((p.minutos / total) * 100)}%` }) : null))));
  }

  function resumo(d) {
    const item = (rotulo, valor) => el('div', {}, el('dt', { textContent: rotulo }), el('dd', { textContent: valor }));
    const [, mm] = d.mes.mes.split('-');
    return [
      item('Semana', horas(d.semana.minutos)),
      item(`Dias na semana`, String(d.semana.dias)),
      item(`Mês (${MESES[Number(mm) - 1]})`, horas(d.mes.minutos)),
      item('Dias no mês', String(d.mes.dias)),
    ];
  }

  function recentes(lista) {
    if (!lista.length) return el('p', { class: 'vazio', textContent: 'Nenhum registro.' });
    return el('ul', { class: 'lista' }, ...lista.map((r) => el('li', {},
      el('span', { class: 'principal', textContent: r.projeto }),
      el('span', { class: 'valor', textContent: horas(r.minutos) }),
      el('span', { class: 'meta', textContent: [dataBR(r.data), r.inicio && r.fim ? `${r.inicio}–${r.fim}` : '', r.nota].filter(Boolean).join(' · ') }))));
  }

  function render(d) {
    $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    avisos($('avisos'), d.avisos);
    $('resumo').replaceChildren(...resumo(d));
    $('semana-t').textContent = d.semana.inicio ? `Esta semana (${dataBR(d.semana.inicio).slice(0, 5)} a ${dataBR(d.semana.fim).slice(0, 5)})` : 'Esta semana';
    $('semana').replaceChildren(projetos(d.semana.projetos, d.semana.minutos));
    $('mes').replaceChildren(projetos(d.mes.maiores, d.mes.minutos));
    $('recentes').replaceChildren(recentes(d.recentes));
    window.iniciarRelogios({ pomodoro: d.pomodoro, projetos: d.mes.projetos.map((p) => p.projeto) });
    $('dica').replaceChildren(...(d.existe ? [] : [el('p', { class: 'nota dica' },
      icone('file-clock', 'p'), ` Ainda não há a pasta ${d.pasta}. Cada mês é um arquivo AAAA-MM.md com uma tabela:`,
      el('code', { textContent: '| data | projeto | início | fim | min | nota |' }),
      el('span', { textContent: 'min é o total de minutos; se ficar vazio, vale fim − início.' }))]));
  }

  async function carregar() {
    try {
      const r = await fetch('/api/tempo', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      render(j);
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler o tempo (${e.message}). Confira as tabelas de 80-tempo.`], true);
    }
  }

  const hojeLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  $('m-data').value = hojeLocal();
  $('manual-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const corpo = { projeto: $('m-projeto').value, data: $('m-data').value, min: Number($('m-min').value) };
    if ($('m-nota').value.trim()) corpo.nota = $('m-nota').value.trim();
    $('manual-msg').textContent = 'Gravando...';
    const r = await window.escreverNoVault('tempo/registrar', corpo);
    $('manual-msg').textContent = r.ok ? `Gravado: ${corpo.projeto}, ${corpo.min} min.` : r.mensagem;
    if (r.ok) { $('m-min').value = ''; $('m-nota').value = ''; }
  });

  carregar();
  window.aoVivo('tempo', carregar);
})();
