// Cronômetro e pomodoro: contas puras, sem relógio nem tela. `agora` (ms) vem de fora; o tempo é sempre
// uma diferença de carimbos, nunca uma contagem de ticks, então aba em segundo plano não atrasa nada.
// UMD: o navegador lê window.relogioTempo; os testes, require.
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.relogioTempo = fabrica();
}(typeof self !== 'undefined' ? self : this, () => {
  'use strict';

  const MIN = 60000;
  const FASES = ['foco', 'pausa-curta', 'pausa-longa'];

  // ---------- cronômetro ----------
  // { acumulado: ms parados, inicio: carimbo se rodando (senão null), primeiro: carimbo da 1ª partida }
  const cronometroNovo = () => ({ acumulado: 0, inicio: null, primeiro: null });
  const cronometroMs = (c, agora) => c.acumulado + (c.inicio == null ? 0 : Math.max(0, agora - c.inicio));
  const cronometroRodando = (c) => c.inicio != null;
  const cronometroIniciar = (c, agora) => (c.inicio != null ? c : { ...c, inicio: agora, primeiro: c.primeiro ?? agora });
  const cronometroPausar = (c, agora) => (c.inicio == null ? c : { ...c, acumulado: cronometroMs(c, agora), inicio: null });

  // ---------- pomodoro ----------
  // cfg = { foco, pausaCurta, pausaLonga, focosAteLonga } (minutos, do config.json).
  // { fase, fim: carimbo do fim se rodando (senão null), restante: ms se pausado (senão null),
  //   focos: focos completos neste ciclo, dia: 'AAAA-MM-DD', focosHoje }
  const duracao = (fase, cfg) => ({ foco: cfg.foco, 'pausa-curta': cfg.pausaCurta, 'pausa-longa': cfg.pausaLonga })[fase] * MIN;
  const pomodoroNovo = (dia) => ({ fase: 'foco', fim: null, restante: null, focos: 0, dia, focosHoje: 0 });
  const pomodoroRodando = (p) => p.fim != null;
  const pomodoroRestante = (p, agora, cfg) => (p.fim != null ? Math.max(0, p.fim - agora) : (p.restante ?? duracao(p.fase, cfg)));
  const pomodoroIniciar = (p, agora, cfg) => (p.fim != null ? p : { ...p, fim: agora + pomodoroRestante(p, agora, cfg), restante: null });
  const pomodoroPausar = (p, agora, cfg) => (p.fim == null ? p : { ...p, restante: pomodoroRestante(p, agora, cfg), fim: null });
  const pomodoroTerminou = (p, agora) => p.fim != null && agora >= p.fim;

  // Vai para a próxima fase, parada (quem decide recomeçar é a pessoa). `completo`: a fase acabou
  // sozinha; foco pulado não conta. Depois de `focosAteLonga` focos, a pausa é a longa.
  function pomodoroAvancar(p, cfg, completo) {
    if (p.fase !== 'foco') return { ...p, fase: 'foco', fim: null, restante: null };
    const focos = p.focos + (completo ? 1 : 0);
    const longa = completo && focos >= cfg.focosAteLonga;
    return {
      ...p, fase: longa ? 'pausa-longa' : 'pausa-curta', fim: null, restante: null,
      focos: longa ? 0 : focos, focosHoje: p.focosHoje + (completo ? 1 : 0),
    };
  }

  // Virou o dia: zera só o contador do dia.
  const pomodoroDia = (p, dia) => (p.dia === dia ? p : { ...p, dia, focosHoje: 0 });

  // ---------- formato ----------
  const dois = (n) => String(n).padStart(2, '0');
  function relogio(ms) {
    const s = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(s / 3600);
    return `${h ? `${h}:` : ''}${dois(Math.floor((s % 3600) / 60))}:${dois(s % 60)}`;
  }
  // Contagem regressiva arredonda para cima: 0:00 só quando acabou de fato.
  const regressivo = (ms) => relogio(Math.ceil(Math.max(0, ms) / 1000) * 1000);

  // Linha para colar em 80-tempo/AAAA-MM.md. Datas e horas no fuso local do navegador.
  function linhaDaTabela(c, agora, projeto) {
    const ms = cronometroMs(c, agora);
    const ini = new Date(c.primeiro ?? agora - ms);
    const fim = new Date(agora);
    const data = `${ini.getFullYear()}-${dois(ini.getMonth() + 1)}-${dois(ini.getDate())}`;
    const hm = (d) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;
    return `| ${data} | ${String(projeto || '').trim() || 'projeto'} | ${hm(ini)} | ${hm(fim)} | ${Math.max(1, Math.round(ms / MIN))} |  |`;
  }

  // Os mesmos dados da linha, como objeto, para gravar pelo site.
  function registroDoCron(c, agora, projeto) {
    const ms = cronometroMs(c, agora);
    const ini = new Date(c.primeiro ?? agora - ms);
    const fim = new Date(agora);
    const data = `${ini.getFullYear()}-${dois(ini.getMonth() + 1)}-${dois(ini.getDate())}`;
    const hm = (d) => `${dois(d.getHours())}:${dois(d.getMinutes())}`;
    return { projeto: String(projeto || '').trim(), data, inicio: hm(ini), fim: hm(fim), min: Math.max(1, Math.round(ms / MIN)) };
  }

  return {
    MIN, FASES, registroDoCron,
    cronometroNovo, cronometroMs, cronometroRodando, cronometroIniciar, cronometroPausar,
    duracao, pomodoroNovo, pomodoroRodando, pomodoroRestante, pomodoroIniciar, pomodoroPausar,
    pomodoroTerminou, pomodoroAvancar, pomodoroDia,
    relogio, regressivo, linhaDaTabela,
  };
}));
