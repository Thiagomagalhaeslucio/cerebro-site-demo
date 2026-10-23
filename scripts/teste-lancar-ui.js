'use strict';

// Roteiro de navegador do Lançar movimento: Reposição (quitar e livre), Salário e Desfazer.
//   node scripts/teste-lancar-ui.js
// Sobe o site (fora do demo, para gravar) sobre uma CÓPIA TEMPORÁRIA do vault de exemplo e dirige o
// Firefox headless por Marionette (mesmo cliente de scripts/capturas.js). As conferências leem
// panelas.md e movimentos.md direto, com contas próprias (sem o motor). Se existir o vault real, só
// compara o sha256 de panelas.md e movimentos.md antes e depois (nada é lido além disso nem impresso).
// Precisa do Firefox no PATH (ou FIREFOX=/caminho). Fora do `npm test`.

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Marionette, iniciarFirefox, portaLivre, dormir } = require('./capturas');

const RAIZ = path.join(__dirname, '..');
const FIXTURE = path.join(RAIZ, 'test', 'fixtures', 'vault-exemplo');
const VAULT_REAL = process.env.CEREBRO_VAULT || path.join(os.homedir(), 'cerebro');
const ARQUIVOS = ['panelas.md', 'movimentos.md'];

// ---------- leitura independente dos arquivos ----------
const sha = (vault) => crypto.createHash('sha256')
  .update(ARQUIVOS.map((f) => fs.readFileSync(path.join(vault, '40-financeiro', f))).join('\0')).digest('hex');
const ler = (vault, f) => fs.readFileSync(path.join(vault, '40-financeiro', f), 'utf8');
const cent = (t) => Math.round(Number(t) * 100);

function saldos(vault) {
  const s = {};
  for (const l of ler(vault, 'panelas.md').split('\n')) {
    const c = l.split('|').map((x) => x.trim());
    if (c.length >= 5 && /^[a-z]+$/.test(c[2]) && /^-?\d+(\.\d+)?$/.test(c[3])) s[c[2]] = cent(c[3]);
  }
  return s;
}
const patrimonio = (s) => Object.entries(s).filter(([id]) => id !== 'vt').reduce((a, [, v]) => a + v, 0);
const patrimonioDito = (vault) => cent(/Patrimônio total:\s*(-?\d+(?:\.\d+)?)/.exec(ler(vault, 'panelas.md'))[1]);
const pendencias = (vault) => {
  const sec = ler(vault, 'panelas.md').split(/^## Reposições pendentes\s*$/m)[1] || '';
  return sec.split('\n').filter((l) => /^- /.test(l) && !/Nenhuma/i.test(l));
};
const linhasMov = (vault) => ler(vault, 'movimentos.md').split('\n').filter((l) => /^\| \d{4}-\d{2}-\d{2} \|/.test(l));

// ---------- conferências ----------
let falhas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '  ok ' : '  FALHOU '} ${msg}`); if (!cond) falhas++; };
const igual = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` (obtido ${JSON.stringify(a)}, esperado ${JSON.stringify(b)})`}`);
const deltas = (antes, depois) => {
  const d = {};
  for (const id of new Set([...Object.keys(antes), ...Object.keys(depois)])) if ((depois[id] || 0) !== (antes[id] || 0)) d[id] = (depois[id] || 0) - (antes[id] || 0);
  return d;
};

// ---------- navegador ----------
async function esperarAte(m, expr, rotulo, vezes = 60) {
  for (let t = 0; t < vezes; t++) {
    if (await m.js(`return !!(${expr})`)) return;
    await dormir(150);
  }
  const msg = await m.js(`return (document.getElementById('previa-corpo')?.innerText || '').trim().slice(0, 300)`);
  throw new Error(`esperei por "${rotulo}" e não veio. Prévia: ${msg}`);
}
const definir = (m, id, valor) => m.js(
  `const e = document.getElementById(arguments[0]); e.value = arguments[1]; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true }));`, [id, valor]);
const operacao = async (m, op) => {
  await m.clicar(`button[data-op="${op}"]`);
  await esperarAte(m, `document.querySelector('button[data-op="${op}"]').getAttribute('aria-pressed') === 'true'`, `operação ${op}`);
};
async function previa(m) {
  await m.clicar('#previa-btn');
  await esperarAte(m, `document.getElementById('confirmar-btn') || document.querySelector('#previa-corpo .avisos')`, 'prévia');
}
async function gravar(m) {
  if (await m.js(`return !!document.getElementById('confirmar')`)) await m.clicar('#confirmar');
  await m.clicar('#confirmar-btn');
  await esperarAte(m, `document.getElementById('desfazer-btn')`, 'botão Desfazer (gravou)');
}
async function desfazer(m) {
  await m.clicar('#desfazer-btn');
  await esperarAte(m, `/Lançamento desfeito/.test(document.getElementById('previa-corpo').innerText)`, 'Lançamento desfeito');
}

// ---------- roteiro ----------
async function roteiro(m, vault) {
  await m.ir(m.base + '/financeiro/lancar');
  await esperarAte(m, `document.querySelector('button[data-op="gasto"]') && document.getElementById('saiDe').options.length > 3`, 'página pronta');

  console.log('Preparo: duas pendências de reposição (gastos pagos da conta, repor do Pessoal)');
  const pend0 = pendencias(vault).length;
  for (const [valor, desc] of [['15,00', 'teste pend a'], ['25,00', 'teste pend b']]) {
    await operacao(m, 'gasto');
    await definir(m, 'saiDe', 'conta:pessoal');
    await m.digitar('#valor', valor);
    await m.digitar('#descricao', desc);
    await previa(m);
    await gravar(m);
  }
  igual(pendencias(vault).length - pend0, 2, 'duas pendências novas em "Reposições pendentes"');

  console.log('Reposição, modo quitar (marca só a pendência "a")');
  await operacao(m, 'reposicao');
  await esperarAte(m, `document.querySelectorAll('#pendencias input').length >= 2`, 'pendências listadas');
  ok(await m.js(`return document.querySelectorAll('#pendencias input:checked').length === 0`), 'nenhuma pendência vem marcada');
  await previa(m).then(() => null, () => null);
  ok(await m.js(`return !document.getElementById('confirmar-btn')`), 'sem marcar nada, a prévia recusa');
  await m.clicar('#pendencias input[value*="teste pend a"]');
  igual(await m.js(`return document.getElementById('valor').value`), '15,00', 'o valor vira a soma das marcadas');
  ok(await m.js(`return document.getElementById('valor').readOnly`), 'valor somente leitura no modo quitar');
  let s0 = saldos(vault);
  const hashAntes = sha(vault);
  const mov0 = linhasMov(vault).length;
  const pend1 = pendencias(vault);
  await previa(m);
  await gravar(m);
  let s1 = saldos(vault);
  igual(deltas(s0, s1), { pessoal: -1500, conta: 1500 }, 'Pessoal -15,00 e Conta +15,00, nada mais');
  igual(pendencias(vault).length, pend1.length, 'a pendência quitada continua listada (com ✔) e a outra segue pendente');
  ok(pendencias(vault).some((l) => /✔/.test(l) && /teste pend a/.test(l)), 'pendência "a" marcada com ✔');
  ok(!pendencias(vault).some((l) => /✔/.test(l) && /teste pend b/.test(l)), 'pendência "b" sem ✔');
  igual(linhasMov(vault).length - mov0, 1, 'uma linha nova em movimentos.md');
  igual(patrimonio(s1), patrimonioDito(vault), 'soma das panelas (sem o VT) = patrimônio do arquivo');

  console.log('Desfazer da reposição');
  await desfazer(m);
  igual(sha(vault), hashAntes, 'arquivos idênticos ao estado anterior à reposição (sha256)');

  console.log('Reposição, transferência livre (10,00 do Pessoal, sem quitar nada)');
  await operacao(m, 'reposicao');
  await definir(m, 'modo', 'livre');
  await esperarAte(m, `document.getElementById('c-pendencias').hidden && !document.getElementById('valor').readOnly`, 'modo livre');
  await m.digitar('#valor', '10,00');
  s0 = saldos(vault);
  const hashLivre = sha(vault);
  const pendLivre = pendencias(vault);
  await previa(m);
  await gravar(m);
  s1 = saldos(vault);
  igual(deltas(s0, s1), { pessoal: -1000, conta: 1000 }, 'Pessoal -10,00 e Conta +10,00');
  igual(pendencias(vault), pendLivre, 'pendências intactas (livre não quita)');
  await desfazer(m);
  igual(sha(vault), hashLivre, 'Desfazer devolve os arquivos ao estado anterior (sha256)');

  console.log('Salário (1000,00; reserva da cópia abaixo da meta, divisão normal 57/21/13/9)');
  await operacao(m, 'salario');
  await m.digitar('#valor', '1000,00');
  s0 = saldos(vault);
  const hashSal = sha(vault);
  const movSal = linhasMov(vault).length;
  await previa(m);
  await gravar(m);
  s1 = saldos(vault);
  igual(deltas(s0, s1), { principal: 57000, reserva: 21000, pessoal: 13000, margem: 9000 }, 'principal 570, reserva 210, pessoal 130, margem 90');
  igual(patrimonio(s1) - patrimonio(s0), 100000, 'patrimônio sobe exatamente o líquido');
  igual(patrimonio(s1), patrimonioDito(vault), 'soma das panelas (sem o VT) = patrimônio do arquivo');
  igual(linhasMov(vault).length - movSal, 4, 'quatro linhas "Divisão do salário" novas');
  await desfazer(m);
  igual(sha(vault), hashSal, 'Desfazer do salário devolve os arquivos (sha256)');
  ok(await m.js(`return !document.getElementById('desfazer-btn')`), 'sem segundo Desfazer na tela');
}

async function main() {
  const real = ARQUIVOS.every((f) => fs.existsSync(path.join(VAULT_REAL, '40-financeiro', f)));
  const hashRealAntes = real ? sha(VAULT_REAL) : null;
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-ensaio-ui-'));
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-ui-perfil-'));
  const estado = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-ui-estado-')); // o site não escreve no estado do vault real
  fs.cpSync(FIXTURE, vault, { recursive: true });
  let servidor = null;
  let firefox = null;
  try {
    const porta = await portaLivre();
    servidor = spawn(process.execPath, [path.join(RAIZ, 'server.js'), `--vault=${vault}`, `--porta=${porta}`], { stdio: 'ignore', env: { ...process.env, CEREBRO_ESTADO_DIR: estado, CEREBRO_SEM_LOCAL: '1' } });
    for (let t = 0; ; t++) {
      try { if ((await fetch(`http://127.0.0.1:${porta}/`)).ok) break; } catch { /* ainda subindo */ }
      if (t > 40) throw new Error('o site não subiu');
      await dormir(250);
    }
    const pm = await portaLivre();
    firefox = await iniciarFirefox(perfil, pm);
    const m = new Marionette(pm);
    m.base = `http://127.0.0.1:${porta}`;
    await m.conectar();
    await roteiro(m, vault);
  } catch (e) {
    console.log(`  FALHOU  ${e.message}`);
    falhas++;
  } finally {
    firefox?.kill();
    servidor?.kill();
    await dormir(300);
    fs.rmSync(perfil, { recursive: true, force: true });
    fs.rmSync(vault, { recursive: true, force: true });
    fs.rmSync(estado, { recursive: true, force: true });
  }
  if (real) ok(sha(VAULT_REAL) === hashRealAntes, 'vault real: sha256 de panelas.md e movimentos.md inalterado');
  else console.log('  (sem vault real nesta máquina: nada a comparar)');
  console.log(falhas ? `\n${falhas} conferência(s) falharam.` : '\nRoteiro verde.');
  process.exit(falhas ? 1 : 0);
}

main();
