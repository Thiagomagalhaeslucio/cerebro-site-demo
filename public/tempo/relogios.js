(() => {
  'use strict';

  const { el } = window.cerebro;
  const R = window.relogioTempo;
  const $ = (id) => document.getElementById(id);
  const CHAVE = 'cerebro.tempo.relogios';
  const NOMES = { foco: 'Foco', 'pausa-curta': 'Pausa curta', 'pausa-longa': 'Pausa longa' };
  let base = document.title; // o shell troca o título depois de ler o menu
  let meuTitulo = null;

  let cfg = null;
  let cron = R.cronometroNovo();
  let pomo = null;
  let projeto = '';
  let aviso = '';
  let audio = null;

  const hoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  // O estado vive no navegador (só uma conveniência: recarregar a página não zera o relógio). Nada vai ao vault.
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ cron, pomo, projeto })); } catch { /* sem armazenamento: o relógio segue na página */ }
  }
  function ler() {
    try { return JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { return null; }
  }
  const numero = (v) => typeof v === 'number' && Number.isFinite(v);
  const estadoValido = (s) => s && s.cron && s.pomo && numero(s.cron.acumulado) && R.FASES.includes(s.pomo.fase);

  // ---------- aviso sonoro ----------
  function bipar() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25, 0.5].forEach((atraso) => {
        const osc = audio.createOscillator();
        const ganho = audio.createGain();
        osc.frequency.value = 880;
        ganho.gain.value = 0.12;
        osc.connect(ganho).connect(audio.destination);
        osc.start(audio.currentTime + atraso);
        osc.stop(audio.currentTime + atraso + 0.15);
      });
    } catch { /* sem áudio: fica o aviso na tela e no título */ }
  }
  // O navegador só libera o som depois de um clique: o primeiro botão apertado "acorda" o áudio.
  function acordarAudio() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume();
    } catch { /* idem */ }
  }

  // ---------- ações ----------
  function cronAlternar() {
    acordarAudio();
    cron = R.cronometroRodando(cron) ? R.cronometroPausar(cron, Date.now()) : R.cronometroIniciar(cron, Date.now());
    aviso = '';
    mudou();
  }
  function cronZerar() {
    cron = R.cronometroNovo();
    mudou();
  }
  async function cronGravar() {
    const reg = R.registroDoCron(cron, Date.now(), projeto);
    if (!reg.projeto) { $('cron-dica').textContent = 'Escreva o projeto antes de gravar.'; return; }
    $('cron-gravar').disabled = true;
    const r = await window.escreverNoVault('tempo/registrar', reg);
    $('cron-dica').textContent = r.ok ? `Gravado: ${reg.projeto}, ${reg.min} min.` : r.mensagem;
    if (r.ok) cron = R.cronometroNovo();
    mudou();
  }

  function pomoAlternar() {
    acordarAudio();
    const agora = Date.now();
    pomo = R.pomodoroRodando(pomo) ? R.pomodoroPausar(pomo, agora, cfg) : R.pomodoroIniciar(pomo, agora, cfg);
    aviso = '';
    mudou();
  }
  function pomoPular() {
    pomo = R.pomodoroAvancar(pomo, cfg, false);
    aviso = '';
    mudou();
  }
  function pomoZerar() {
    pomo = { ...R.pomodoroNovo(hoje()), focosHoje: pomo.focosHoje, dia: pomo.dia };
    aviso = '';
    mudou();
  }

  function mudou() {
    salvar();
    desenhar();
  }

  // ---------- tela ----------
  function desenhar() {
    if (!cfg || !pomo) return;
    const agora = Date.now();

    const ms = R.cronometroMs(cron, agora);
    const rodando = R.cronometroRodando(cron);
    $('cron-digitos').textContent = R.relogio(ms);
    $('cron-iniciar').textContent = rodando ? 'Pausar' : ms > 0 ? 'Continuar' : 'Iniciar';
    $('cron-zerar').disabled = ms === 0 && !rodando;
    $('cron-gravar').disabled = rodando || ms < 30000;
    $('cron-digitos').dataset.rodando = String(rodando);

    if (pomo.dia !== hoje()) pomo = R.pomodoroDia(pomo, hoje());
    const resta = R.pomodoroRestante(pomo, agora, cfg);
    const total = R.duracao(pomo.fase, cfg);
    const pRodando = R.pomodoroRodando(pomo);
    $('pomo-fase').textContent = NOMES[pomo.fase];
    $('pomo-fase').dataset.fase = pomo.fase;
    $('pomo-digitos').textContent = R.regressivo(resta);
    $('pomo-iniciar').textContent = pRodando ? 'Pausar' : resta < total ? 'Continuar' : 'Iniciar';
    $('pomo-barra').style.width = `${Math.min(100, Math.max(0, ((total - resta) / total) * 100))}%`;
    $('pomo-barra-trilho').setAttribute('aria-valuenow', String(Math.round(((total - resta) / total) * 100)));
    const n = pomo.focosHoje;
    $('pomo-info').textContent = [
      pomo.fase === 'foco' ? `Foco ${pomo.focos + 1} de ${cfg.focosAteLonga}` : `Depois: ${pomo.fase === 'pausa-longa' ? 'novo ciclo' : `foco ${pomo.focos + 1} de ${cfg.focosAteLonga}`}`,
      `${n} ${n === 1 ? 'foco completo' : 'focos completos'} hoje`,
    ].join(' · ');
    $('pomo-aviso').textContent = aviso;

    // Na aba do navegador: o que estiver correndo, para dar para ver de outra aba.
    if (document.title !== meuTitulo) base = document.title;
    meuTitulo = pRodando ? `${R.regressivo(resta)} ${NOMES[pomo.fase].toLowerCase()} · ${base}` : rodando ? `${R.relogio(ms)} · ${base}` : base;
    document.title = meuTitulo;
  }

  function tique() {
    if (!cfg || !pomo) return;
    const agora = Date.now();
    if (R.pomodoroTerminou(pomo, agora)) {
      const foi = pomo.fase;
      pomo = R.pomodoroAvancar(pomo, cfg, true);
      aviso = foi === 'foco' ? `Foco terminado. Próximo: ${NOMES[pomo.fase].toLowerCase()}, é só iniciar.` : 'Pausa terminada. Próximo: foco, é só iniciar.';
      bipar();
      salvar();
    }
    desenhar();
  }

  // ---------- montagem ----------
  function ligar() {
    $('cron-iniciar').addEventListener('click', cronAlternar);
    $('cron-zerar').addEventListener('click', cronZerar);
    $('cron-gravar').addEventListener('click', cronGravar);
    $('cron-projeto').addEventListener('input', (e) => { projeto = e.target.value; salvar(); });
    $('pomo-iniciar').addEventListener('click', pomoAlternar);
    $('pomo-pular').addEventListener('click', pomoPular);
    $('pomo-zerar').addEventListener('click', pomoZerar);
    setInterval(tique, 250);
    document.addEventListener('visibilitychange', tique);
  }

  let ligado = false;
  // Chamado pela página a cada leitura da API: guarda as premissas e a lista de projetos (sugestões).
  window.iniciarRelogios = ({ pomodoro, projetos }) => {
    cfg = pomodoro;
    $('projetos').replaceChildren(...projetos.map((p) => el('option', { value: p })));
    if (ligado) return desenhar();
    ligado = true;
    const salvo = ler();
    pomo = R.pomodoroNovo(hoje());
    if (estadoValido(salvo)) {
      cron = { acumulado: salvo.cron.acumulado, inicio: numero(salvo.cron.inicio) ? salvo.cron.inicio : null, primeiro: numero(salvo.cron.primeiro) ? salvo.cron.primeiro : null };
      pomo = { ...pomo, ...salvo.pomo };
      projeto = typeof salvo.projeto === 'string' ? salvo.projeto.slice(0, 60) : '';
      $('cron-projeto').value = projeto;
      // A fase pode ter acabado com a página fechada: avança uma vez, parada, e avisa.
      if (R.pomodoroTerminou(pomo, Date.now())) {
        pomo = R.pomodoroAvancar(pomo, cfg, true);
        aviso = 'A fase terminou enquanto a página estava fechada.';
      }
    }
    ligar();
    desenhar();
  };
})();
