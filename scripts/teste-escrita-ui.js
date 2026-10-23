'use strict';

// Roteiro de navegador da escrita em Kanban e Agenda (novo card, mover card, novo compromisso).
//   node scripts/teste-escrita-ui.js
// Sobe o site sobre uma CÓPIA TEMPORÁRIA do vault de exemplo e dirige o Firefox headless por Marionette.
// Conferências leem os arquivos direto. Fora do `npm test`.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Marionette, iniciarFirefox, portaLivre, dormir } = require('./capturas');

const RAIZ = path.join(__dirname, '..');
const FIXTURE = path.join(RAIZ, 'test', 'fixtures', 'vault-exemplo');
let VAULT = null;

let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : '  FALHOU '} ${msg}`); if (!cond) falhas++; };
async function esperarAte(m, expr, rotulo, vezes = 60) {
  for (let t = 0; t < vezes; t++) {
    if (await m.js(`return !!(${expr})`)) return;
    await dormir(150);
  }
  throw new Error(`esperei por "${rotulo}" e não veio`);
}
const kanbans = () => fs.readdirSync(path.join(VAULT, '10-diario')).filter((f) => f.startsWith('kanban-')).map((f) => fs.readFileSync(path.join(VAULT, '10-diario', f), 'utf8')).join('\n=====\n');
const colocar = (m, id, valor) => m.js(`const e = document.getElementById(arguments[0]); e.value = arguments[1]; e.dispatchEvent(new Event('input', { bubbles: true }))`, [id, valor]);

async function roteiro(m) {
  console.log('Kanban');
  await m.ir(`${m.base}/kanban`);
  await esperarAte(m, `document.querySelectorAll('.card').length > 0`, 'quadro');
  const antes = await m.js(`return document.querySelectorAll('.card').length`);
  await m.js(`document.getElementById('novo').open = true`);
  await m.digitar('#n-titulo', 'Card criado pelo teste');
  await m.js(`document.getElementById('n-coluna').value = 'Fazendo'`);
  await m.clicar('#novo-form button[type=submit]');
  await esperarAte(m, `document.getElementById('novo-msg').textContent === 'Card criado.'`, 'card criado').catch(async (e) => { throw new Error(e.message + ' — mensagem: ' + await m.js(`return document.getElementById('novo-msg').textContent`)); });
  ok(/- \[ \] Card criado pelo teste/.test(kanbans()), 'o card está no arquivo');
  await esperarAte(m, `document.querySelectorAll('.card').length === ${antes + 1}`, 'quadro recarregado por SSE');
  ok(true, 'a página recarregou sozinha com o card novo');

  // mover o card novo para Feito pelo seletor do próprio card
  const alvo = `[...document.querySelectorAll('.card')].find((c) => c.textContent.includes('Card criado pelo teste'))`;
  await m.js(`const s = ${alvo}.querySelector('select'); s.value = 'Feito'; s.dispatchEvent(new Event('change', { bubbles: true }))`);
  await esperarAte(m, `(${alvo})?.closest('.coluna')?.querySelector('h2').textContent.startsWith('Feito')`, 'card na coluna Feito').catch(async (e) => { throw new Error(e.message + ' — ' + await m.js(`return JSON.stringify([...document.querySelectorAll('.coluna')].map((c) => c.querySelector('h2').textContent + ':' + c.querySelectorAll('.card').length))`) + ' | ' + kanbans().slice(-300)); });
  ok(/- \[x\] Card criado pelo teste/.test(kanbans()), 'no arquivo ele virou [x]');

  console.log('Agenda');
  await m.ir(`${m.base}/agenda`);
  await esperarAte(m, `document.getElementById('a-tipo').options.length > 1`, 'formulário da agenda');
  await m.js(`document.getElementById('novo').open = true`);
  await m.digitar('#a-titulo', 'Compromisso do teste');
  await colocar(m, 'a-data', '2026-12-05');
  await colocar(m, 'a-inicio', '14:00');
  await colocar(m, 'a-fim', '15:30');
  await m.js(`document.getElementById('a-tipo').value = 'estudo'`);
  await m.clicar('#novo-form button[type=submit]');
  await esperarAte(m, `document.getElementById('novo-msg').textContent === 'Compromisso criado.'`, 'compromisso criado');
  ok(/\| 2026-12-05 \| 14:00 \| 15:30 \| Compromisso do teste \| estudo \|/.test(fs.readFileSync(path.join(VAULT, '10-diario', 'agenda.md'), 'utf8')), 'a linha está em agenda.md');
  await m.digitar('#a-titulo', 'sem data');
  await colocar(m, 'a-data', '2026-12-06');
  await colocar(m, 'a-inicio', '');
  await colocar(m, 'a-fim', '09:00');
  await m.clicar('#novo-form button[type=submit]');
  await esperarAte(m, `document.getElementById('novo-msg').textContent.includes('Fim sem início')`, 'recusa de fim sem início');
  ok(true, 'fim sem início é recusado pelo servidor e a mensagem aparece');
}

async function main() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-escrita-ui-'));
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
