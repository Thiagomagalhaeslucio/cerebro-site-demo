'use strict';

// Roteiro de navegador do cronômetro e do pomodoro de /tempo.
//   node scripts/teste-tempo-ui.js [--png=<pasta>]   (com --png, grava capturas de conferência)
// Sobe o site sobre uma CÓPIA TEMPORÁRIA do vault de exemplo e dirige o Firefox headless por Marionette.
// O estado do relógio fica no localStorage do perfil temporário; o cronômetro só escreve ao apertar Gravar (na cópia). Fora do `npm test`.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Marionette, iniciarFirefox, portaLivre, dormir } = require('./capturas');

const RAIZ = path.join(__dirname, '..');
const FIXTURE = path.join(RAIZ, 'test', 'fixtures', 'vault-exemplo');
let VAULT = FIXTURE; // main() troca por uma cópia temporária: Gravar escreve de verdade
const PNG = (process.argv.find((a) => a.startsWith('--png=')) || '').slice(6) || null;
const CHAVE = 'cerebro.tempo.relogios';

let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : '  FALHOU '} ${msg}`); if (!cond) falhas++; };

const texto = (m, id) => m.js(`return document.getElementById(arguments[0]).textContent.trim()`, [id]);
async function esperarAte(m, expr, rotulo, vezes = 60) {
  for (let t = 0; t < vezes; t++) {
    if (await m.js(`return !!(${expr})`)) return;
    await dormir(150);
  }
  throw new Error(`esperei por "${rotulo}" e não veio`);
}
const abrir = async (m) => {
  await m.ir(`${m.base}/tempo`);
  await esperarAte(m, `document.getElementById('pomo-digitos') && document.getElementById('cron-iniciar')?.textContent.length > 0 && document.getElementById('pomo-fase').textContent.length > 0`, 'relógios prontos');
};
const guardar = (m, estado) => m.js(`localStorage.setItem(arguments[0], arguments[1])`, [CHAVE, JSON.stringify(estado)]);
const segundos = (t) => { const p = t.split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
const novoPomo = (extra) => ({ fase: 'foco', fim: null, restante: null, focos: 0, dia: new Date().toISOString().slice(0, 10), focosHoje: 0, ...extra });

async function roteiro(m) {
  await abrir(m);
  await m.js(`localStorage.clear()`);
  await abrir(m);

  console.log('Cronômetro');
  ok((await texto(m, 'cron-digitos')) === '00:00', 'começa em 00:00');
  ok(await m.js(`return document.getElementById('cron-zerar').disabled && document.getElementById('cron-gravar').disabled`), 'Zerar e Gravar começam desligados');
  await m.digitar('#cron-projeto', 'projeto-alfa');
  await m.clicar('#cron-iniciar');
  await dormir(2300);
  const andou = segundos(await texto(m, 'cron-digitos'));
  ok(andou >= 2 && andou <= 3, `andou cerca de 2 s (${andou} s)`);
  ok((await texto(m, 'cron-iniciar')) === 'Pausar', 'o botão vira Pausar');
  ok((await m.js(`return document.title`)).startsWith('00:0'), 'o título da aba mostra o tempo');
  await m.clicar('#cron-iniciar');
  const parado = await texto(m, 'cron-digitos');
  await dormir(1500);
  ok((await texto(m, 'cron-digitos')) === parado, 'pausado, não anda');
  ok((await texto(m, 'cron-iniciar')) === 'Continuar', 'o botão vira Continuar');
  ok(await m.js(`return document.getElementById('cron-gravar').disabled`), 'menos de 30 s: Gravar desligado');
  await abrir(m);
  ok((await texto(m, 'cron-digitos')) === parado, 'recarregar a página mantém o tempo');
  ok((await m.js(`return document.getElementById('cron-projeto').value`)) === 'projeto-alfa', 'recarregar mantém o projeto');
  await m.clicar('#cron-zerar');
  ok((await texto(m, 'cron-digitos')) === '00:00', 'Zerar volta a 00:00');

  console.log('Cronômetro rodando enquanto a página está fechada');
  await guardar(m, { cron: { acumulado: 0, inicio: Date.now() - 90 * 60000, primeiro: Date.now() - 90 * 60000 }, pomo: novoPomo(), projeto: 'projeto-alfa' });
  await abrir(m);
  ok((await texto(m, 'cron-digitos')).startsWith('1:30:0'), `continua contando (${await texto(m, 'cron-digitos')})`);
  await m.clicar('#cron-iniciar');
  ok(!(await m.js(`return document.getElementById('cron-gravar').disabled`)), 'parado com mais de 30 s: Gravar ligado');
  await m.digitar('#cron-projeto', '');
  await m.clicar('#cron-gravar');
  await esperarAte(m, `document.getElementById('cron-dica').textContent.length > 0 && !document.getElementById('cron-dica').textContent.startsWith('Conta o tempo')`, 'resposta do Gravar');
  const dica = await texto(m, 'cron-dica');
  ok(dica.startsWith('Gravado: projeto-alfa, 90 min') || dica.startsWith('Escreva o projeto'), `Gravar responde (${dica})`);
  if (dica.startsWith('Gravado')) {
    const mes = fs.readdirSync(path.join(VAULT, '80-tempo')).map((f) => fs.readFileSync(path.join(VAULT, '80-tempo', f), 'utf8')).join('\n');
    ok(/\| \d{4}-\d{2}-\d{2} \| projeto-alfa \| \d\d:\d\d \| \d\d:\d\d \| 90 \|/.test(mes), 'a linha de 90 min está no arquivo do mês');
    ok((await texto(m, 'cron-digitos')) === '00:00', 'depois de gravar o cronômetro zera');
  }

  console.log('Registrar à mão');
  await m.js(`document.getElementById('manual').open = true`);
  await m.digitar('#m-projeto', 'projeto-beta');
  await m.digitar('#m-min', '45');
  await m.clicar('#manual-form button[type=submit]');
  await esperarAte(m, `document.getElementById('manual-msg').textContent.startsWith('Gravado')`, 'registro à mão gravado');
  ok(fs.readdirSync(path.join(VAULT, '80-tempo')).some((f) => /\| projeto-beta \|[^\n]*\| 45 \|/.test(fs.readFileSync(path.join(VAULT, '80-tempo', f), 'utf8'))), 'a linha de 45 min está no arquivo');

  console.log('Pomodoro');
  await m.js(`localStorage.clear()`);
  await abrir(m);
  ok((await texto(m, 'pomo-fase')) === 'Foco' && (await texto(m, 'pomo-digitos')) === '25:00', 'começa em Foco, 25:00');
  await m.clicar('#pomo-iniciar');
  await dormir(1300);
  const regress = await texto(m, 'pomo-digitos');
  ok(regress === '24:59' || regress === '24:58', `contagem regressiva (${regress})`);
  ok((await m.js(`return document.title`)).includes('foco'), 'o título da aba mostra a fase');
  await m.clicar('#pomo-iniciar');
  const pausado = await texto(m, 'pomo-digitos');
  await dormir(1300);
  ok((await texto(m, 'pomo-digitos')) === pausado, 'pausado, não anda');
  await m.clicar('#pomo-pular');
  ok((await texto(m, 'pomo-fase')) === 'Pausa curta' && (await texto(m, 'pomo-digitos')) === '05:00', 'Pular fase: Pausa curta, 05:00, parada');
  ok((await texto(m, 'pomo-info')).includes('0 focos completos hoje'), 'foco pulado não conta');
  await m.clicar('#pomo-pular');
  ok((await texto(m, 'pomo-fase')) === 'Foco', 'pular a pausa volta ao Foco');

  console.log('Pomodoro: fim da fase');
  await guardar(m, { cron: { acumulado: 0, inicio: null, primeiro: null }, pomo: novoPomo({ fim: Date.now() + 1500 }), projeto: '' });
  await abrir(m);
  await esperarAte(m, `document.getElementById('pomo-fase').textContent === 'Pausa curta'`, 'fim do foco', 40);
  ok((await texto(m, 'pomo-digitos')) === '05:00', 'a pausa começa parada, em 05:00');
  ok((await texto(m, 'pomo-aviso')).startsWith('Foco terminado'), 'aviso na tela');
  ok((await texto(m, 'pomo-info')).includes('1 foco completo hoje'), 'o foco contou (1 foco completo hoje)');
  await guardar(m, { cron: { acumulado: 0, inicio: null, primeiro: null }, pomo: novoPomo({ fim: Date.now() - 5000, focos: 3, focosHoje: 3 }), projeto: '' });
  await abrir(m);
  ok((await texto(m, 'pomo-fase')) === 'Pausa longa', 'o 4º foco leva à pausa longa');
  ok((await texto(m, 'pomo-digitos')) === '15:00', 'pausa longa de 15:00');
  ok((await texto(m, 'pomo-aviso')).includes('página estava fechada'), 'fase que acabou com a página fechada é avisada');

  console.log('Conteúdo existente segue');
  ok((await texto(m, 'resumo')).includes('Semana'), 'o resumo de horas continua na página');
  ok((await m.js(`return document.querySelectorAll('#recentes .lista li').length`)) > 0, 'os últimos registros continuam');
  if (PNG) {
    fs.mkdirSync(PNG, { recursive: true });
    await m.janela(1280, 1100);
    await m.png(path.join(PNG, 'tempo-desktop.png'), true);
    await m.janela(500, 1000);
    await dormir(400);
    await m.png(path.join(PNG, 'tempo-celular.png'), true);
  }
}

async function main() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-tempo-ui-'));
  VAULT = path.join(perfil, 'vault');
  fs.cpSync(FIXTURE, VAULT, { recursive: true });
  let servidor = null;
  let firefox = null;
  try {
    const porta = await portaLivre();
    servidor = spawn(process.execPath, [path.join(RAIZ, 'server.js'), `--vault=${VAULT}`, `--porta=${porta}`], { stdio: 'ignore', env: { ...process.env, CEREBRO_SEM_LOCAL: '1', CEREBRO_ESTADO_DIR: path.join(perfil, 'estado') } });
    for (let t = 0; ; t++) {
      try { if ((await fetch(`http://127.0.0.1:${porta}/`)).ok) break; } catch { /* subindo */ }
      if (t > 40) throw new Error('o site não subiu');
      await dormir(250);
    }
    const pm = await portaLivre();
    firefox = await iniciarFirefox(perfil, pm);
    const m = new Marionette(pm);
    m.base = `http://127.0.0.1:${porta}`;
    await m.conectar();
    await roteiro(m);
  } catch (e) {
    console.log(`  FALHOU  ${e.message}`);
    falhas++;
  } finally {
    firefox?.kill();
    servidor?.kill();
    await dormir(300);
    fs.rmSync(perfil, { recursive: true, force: true });
  }
  console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nRoteiro verde.');
  process.exit(falhas ? 1 : 0);
}

main();
