'use strict';

// Regera as capturas de docs/capturas a partir do modo demonstração (vault de exemplo).
//   npm run capturas                    (todas as telas)
//   npm run capturas -- metas home      (só essas, pelo nome-base; as outras imagens ficam)
// Precisa do Firefox no PATH (ou FIREFOX=/caminho). Sem dependências do npm: fala Marionette
// direto pelo node:net. Detalhes no README, seção "Capturas de tela".
//
// O que fixa a captura:
// - perfil temporário do Firefox (nada do seu perfil), prefers-reduced-motion, fuso de São Paulo;
// - um proxy local pôe nas páginas um <script src> que congela o relógio do navegador em
//   10/03/2026 12:00 (a CSP do site não aceita script inline), então "Lido às 12:00" é sempre igual;
// - as datas de modificação do vault de exemplo ficam em 09/03/2026 durante a captura e voltam
//   ao que eram no fim, para "alterado ontem" também ser sempre igual;
// - cada tela espera fontes, menu, origem da página e dados carregarem, e o DOM parar de mudar;
// - confere que é o demo (faixa "Modo demonstração" e vault-exemplo) antes de cada imagem.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const SAIDA = path.join(RAIZ, 'docs', 'capturas');
const VAULT = path.join(RAIZ, 'test', 'fixtures', 'vault-exemplo');
const PORTA_DEMO = 3738;
const PORTA_PROXY = 3739;
const FIREFOX = process.env.FIREFOX || 'firefox';
const LARGURA = 1280;
const ALTURA_MAX = 3000;
const CELULAR = { largura: 500, altura: 1000 }; // 500px é o mínimo da janela do Firefox
const RELOGIO = '2026-03-10T12:00:00'; // hora local (fuso abaixo)
const FUSO = 'America/Sao_Paulo';
const MTIME_VAULT = new Date('2026-03-09T18:00:00-03:00');

const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
const log = (...a) => console.log(...a);

// ---------- Marionette ----------

class Marionette {
  constructor(porta) {
    this.porta = porta;
    this.proximo = 1;
    this.pendentes = new Map();
    this.buffer = Buffer.alloc(0);
  }

  async conectar() {
    for (let t = 0; t < 120; t++) {
      try {
        await new Promise((ok, falha) => {
          this.socket = net.connect(this.porta, '127.0.0.1', ok);
          this.socket.once('error', falha);
        });
        break;
      } catch {
        this.socket?.destroy();
        await dormir(500);
        if (t === 119) throw new Error('o Firefox não abriu o Marionette a tempo');
      }
    }
    this.socket.on('data', (d) => this.receber(d));
    await new Promise((ok) => { this.aoOla = ok; });
    await this.enviar('WebDriver:NewSession', { capabilities: {} });
  }

  // Mensagens: "<bytes>:<json>". A primeira é o olá do servidor; as outras são [1, id, erro, resultado].
  receber(dados) {
    this.buffer = Buffer.concat([this.buffer, dados]);
    for (;;) {
      const dois = this.buffer.indexOf(':');
      if (dois < 0) return;
      const n = Number(this.buffer.subarray(0, dois).toString());
      if (this.buffer.length < dois + 1 + n) return;
      const msg = JSON.parse(this.buffer.subarray(dois + 1, dois + 1 + n).toString('utf8'));
      this.buffer = this.buffer.subarray(dois + 1 + n);
      if (!Array.isArray(msg)) { this.aoOla?.(); continue; }
      const [, id, erro, resultado] = msg;
      const p = this.pendentes.get(id);
      this.pendentes.delete(id);
      if (erro) p?.falha(new Error(`${erro.error}: ${erro.message}`));
      else p?.ok(resultado);
    }
  }

  enviar(comando, params = {}) {
    const id = this.proximo++;
    const json = Buffer.from(JSON.stringify([0, id, comando, params]));
    return new Promise((ok, falha) => {
      this.pendentes.set(id, { ok, falha });
      this.socket.write(Buffer.concat([Buffer.from(`${json.length}:`), json]));
    });
  }

  async js(script, args = []) {
    const r = await this.enviar('WebDriver:ExecuteScript', { script, args });
    return r.value;
  }

  ir(url) { return this.enviar('WebDriver:Navigate', { url }); }
  janela(largura, altura) { return this.enviar('WebDriver:SetWindowRect', { width: largura, height: altura }); }

  async achar(css) {
    const r = await this.enviar('WebDriver:FindElement', { using: 'css selector', value: css });
    return Object.values(r.value)[0];
  }
  async clicar(css) { await this.enviar('WebDriver:ElementClick', { id: await this.achar(css) }); }
  async digitar(css, texto) {
    const id = await this.achar(css);
    await this.enviar('WebDriver:ElementClear', { id });
    await this.enviar('WebDriver:ElementSendKeys', { id, text: texto });
  }

  async png(arquivo, completa) {
    const r = await this.enviar('WebDriver:TakeScreenshot', { full: completa, hash: false, scroll: false });
    fs.writeFileSync(arquivo, Buffer.from(r.value, 'base64'));
  }
}

// ---------- Firefox, demo e proxy ----------

async function portaLivre() {
  return new Promise((ok) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => ok(port));
    });
  });
}

async function iniciarFirefox(perfil, porta) {
  fs.writeFileSync(path.join(perfil, 'user.js'), [
    ['marionette.port', porta],
    ['ui.prefersReducedMotion', 1],
    ['intl.accept_languages', '"pt-BR, pt"'],
    ['intl.locale.requested', '"pt-BR"'],
    ['layout.spellcheckDefault', 0],
    ['browser.shell.checkDefaultBrowser', false],
    ['browser.startup.page', 0],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['toolkit.telemetry.reportingpolicy.firstRun', false],
    ['app.update.auto', false],
    ['app.update.enabled', false],
    ['network.proxy.type', 0],
  ].map(([k, v]) => `user_pref("${k}", ${v});`).join('\n'));
  const proc = spawn(FIREFOX, ['--headless', '--marionette', '--no-remote', '--profile', perfil, '--width', String(LARGURA), '--height', '1000'], {
    env: { ...process.env, TZ: FUSO, MOZ_HEADLESS: '1' },
    stdio: 'ignore',
  });
  proc.on('error', (e) => { console.error(`Não consegui abrir o Firefox (${FIREFOX}): ${e.message}`); process.exit(1); });
  return proc;
}

const pegar = (url) => new Promise((ok) => {
  http.get(url, (r) => {
    let c = '';
    r.on('data', (d) => (c += d));
    r.on('end', () => ok({ status: r.statusCode, corpo: c }));
  }).on('error', () => ok(null));
});

// Sobe `npm run demo` se ainda não houver um demo na porta; recusa um servidor que não seja o demo.
async function garantirDemo() {
  const nav = await pegar(`http://127.0.0.1:${PORTA_DEMO}/api/nav`);
  if (nav) {
    if (!JSON.parse(nav.corpo).demo) throw new Error(`a porta ${PORTA_DEMO} responde, mas não é o modo demonstração; pare esse servidor.`);
    return null;
  }
  const proc = spawn('npm', ['run', '--silent', 'demo'], { cwd: RAIZ, stdio: 'ignore', detached: true });
  for (let t = 0; t < 40; t++) {
    await dormir(250);
    const r = await pegar(`http://127.0.0.1:${PORTA_DEMO}/api/nav`);
    if (r) return proc;
  }
  throw new Error('npm run demo não respondeu a tempo');
}

const RELOGIO_JS = `(() => {
  const Real = Date;
  const FIXO = new Real(${JSON.stringify(RELOGIO)}).getTime();
  class Falsa extends Real {
    constructor(...a) { if (a.length) super(...a); else super(FIXO); }
    static now() { return FIXO; }
  }
  window.Date = Falsa;
})();
`;

// Repassa tudo ao demo; nas páginas HTML acrescenta o script do relógio antes dos demais.
function iniciarProxy() {
  const servidor = http.createServer((req, res) => {
    if (req.url === '/__relogio.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(RELOGIO_JS);
    }
    const destino = http.request({
      host: '127.0.0.1', port: PORTA_DEMO, path: req.url, method: req.method,
      headers: {
        ...req.headers, host: `127.0.0.1:${PORTA_DEMO}`, 'accept-encoding': 'identity',
        // o servidor só aceita Origin igual ao Host (é a checagem de mesmo site do lançamento)
        ...(req.headers.origin ? { origin: `http://127.0.0.1:${PORTA_DEMO}` } : {}),
      },
    }, (r) => {
      if (!String(r.headers['content-type']).startsWith('text/html')) {
        res.writeHead(r.statusCode, r.headers);
        return r.pipe(res);
      }
      const partes = [];
      r.on('data', (d) => partes.push(d));
      r.on('end', () => {
        const html = Buffer.concat(partes).toString('utf8').replace('<head>', '<head><script src="/__relogio.js"></script>');
        const { 'content-length': _, ...cab } = r.headers;
        res.writeHead(r.statusCode, cab);
        res.end(html);
      });
    });
    destino.on('error', (e) => { res.writeHead(502); res.end(e.message); });
    req.pipe(destino);
  });
  return new Promise((ok) => servidor.listen(PORTA_PROXY, '127.0.0.1', () => ok(servidor)));
}

function percorrer(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? [p, ...percorrer(p)] : [p];
  });
}

// ---------- esperar a página de verdade ----------

const PRONTO = `
  const lendo = (document.getElementById('meta')?.textContent || '').startsWith('Lendo');
  const cab = document.querySelector('.cabecalho');
  const origem = !cab || !!document.querySelector('.cabecalho .fonte .origem');
  const menu = !!document.querySelector('.grupo a');
  const demo = !!document.querySelector('.faixa-demo');
  const erro = !!document.querySelector('.avisos li.erro, .menu-carregando');
  const home = document.getElementById('frase') ? document.getElementById('frase').textContent.trim() !== '' && document.querySelectorAll('#faixa li').length === 7 : true;
  return {
    pronto: document.readyState === 'complete' && document.fonts.status === 'loaded' && !lendo && origem && menu && demo && home && !erro,
    erro,
    assinatura: document.body.innerHTML.length + ':' + (document.querySelector('canvas') ? 'c' : ''),
  };`;

async function esperar(m, extra) {
  let anterior = null;
  let estavel = 0;
  for (let t = 0; t < 80; t++) {
    const r = await m.js(PRONTO);
    if (r.pronto && (!extra || (await m.js(`return !!(${extra})`)))) {
      estavel = r.assinatura === anterior ? estavel + 1 : 0;
      if (estavel >= 2) break;
    } else estavel = 0;
    anterior = r.assinatura;
    await dormir(250);
    if (t === 79) {
      const avisos = await m.js(`return ['avisos', 'previa-corpo'].map((id) => (document.getElementById(id)?.innerText || '').trim()).filter(Boolean).join(' | ')`);
      throw new Error(`a página não ficou pronta (${await m.js('return location.href')})${avisos ? `: ${avisos}` : ''}`);
    }
  }
  await dormir(700); // o Chart.js desenha depois dos dados
}

async function conferirDemo(m) {
  const vault = await m.js(`return document.querySelector('.conexao')?.textContent || ''`);
  const texto = await m.js('return document.body.innerText');
  if (!vault.includes('vault-exemplo')) throw new Error(`a captura não é do vault de exemplo (vault: "${vault}")`);
  if (/\/home\/|\/Users\//.test(texto)) throw new Error('a página mostra um caminho absoluto da máquina');
}

// ---------- as telas ----------

// Cada tela: arquivo-base, rota, ajustes depois de carregar e o que aparece na imagem.
// `temas` = quais temas geram imagem; `completa` = janela do tamanho da página (senão, `altura`).
const AMBOS = ['claro', 'escuro'];
const TELAS = [
  { nome: 'home', rota: '/', temas: AMBOS, completa: true },
  { nome: 'agenda', rota: '/agenda', temas: AMBOS, completa: true },
  {
    nome: 'agenda-mes', rota: '/agenda', temas: AMBOS, completa: true,
    ajustar: async (m) => { await m.clicar('#aba-mes'); await dormir(300); },
  },
  { nome: 'kanban', rota: '/kanban', temas: AMBOS, completa: true },
  { nome: 'financeiro', rota: '/financeiro', temas: AMBOS, completa: true, extra: `document.querySelector('canvas')` },
  { nome: 'diagnostico', rota: '/financeiro/diagnostico', temas: AMBOS, completa: true },
  {
    nome: 'estudos', rota: '/estudos', temas: AMBOS, completa: true,
    ajustar: async (m) => { await m.clicar('details.roadmap > summary'); await dormir(300); },
  },
  { nome: 'metas', rota: '/metas', temas: AMBOS, completa: true },
  { nome: 'tempo', rota: '/tempo', temas: AMBOS, completa: true },
  { nome: 'biblioteca', rota: '/biblioteca', temas: AMBOS, completa: true },
  { nome: 'demandas', rota: '/demandas', temas: AMBOS, completa: true },
  { nome: 'relatorios', rota: '/relatorios', temas: AMBOS, completa: true },
  {
    // Só a prévia: na demo gravar fica desligado, então nada é escrito.
    nome: 'lancar', rota: '/financeiro/lancar', temas: ['claro'], completa: true,
    ajustar: async (m) => {
      await m.digitar('#descricao', 'mercado do bairro');
      await m.clicar('#saiDe-dica button');
      await m.digitar('#valor', '12,50');
      await m.enviar('WebDriver:ElementSendKeys', { id: await m.achar('#valor'), text: '\uE007' });
      await esperar(m, `document.querySelector('.resumo-linha')`);
    },
  },
  {
    // Exemplo preenchido por cliques e teclas, como uma pessoa faria.
    nome: 'orcamento', rota: '/orcamento', temas: AMBOS, completa: true,
    ajustar: async (m) => {
      await m.clicar('#tipo option:nth-child(2)');
      await m.clicar('#complexidade option:nth-child(2)');
      await m.clicar('#urgente-sim');
      await m.digitar('#viagens', '2');
      await m.digitar('#km', '30');
      await m.digitar('#revisoes', '3');
      await esperar(m, `document.getElementById('recomendado').textContent.trim() !== '—'`);
    },
  },
  {
    nome: 'propostas', rota: '/propostas', temas: AMBOS, altura: 1500,
    ajustar: async (m) => {
      await m.digitar('#cliente', 'Loja Exemplo Ltda');
      await m.digitar('#projeto', 'Site institucional');
      await m.digitar('#resumo', 'Site de três páginas para apresentar a loja, com formulário de contato.');
      await m.digitar('#escopo', 'Três páginas: início, serviços e contato\nFormulário de contato\nPublicação no domínio do cliente');
      await m.digitar('#fora', 'Redação dos textos\nLoja virtual');
      await m.digitar('#entregaveis', 'Código-fonte\nManual curto de uso');
      await m.clicar('#calculo > summary');
      await m.clicar('#tipo option:nth-child(2)');
      await m.clicar('#complexidade option:nth-child(2)');
      await m.clicar('#usar-recomendado');
      await dormir(400);
    },
  },
  {
    nome: 'contratos', rota: '/contratos', temas: AMBOS, altura: 1500,
    ajustar: async (m) => {
      await m.clicar('#proposta option:nth-child(2)');
      await m.clicar('#sob_medida');
      await m.clicar('#trata_dados');
      await m.digitar('#dados_tratados', 'Nome e e-mail de clientes cadastrados');
      await m.js(`document.getElementById('sob_medida').scrollIntoView({ block: 'center' })`);
      await dormir(400);
    },
  },
  { nome: 'celular-home', rota: '/', temas: ['escuro'], celular: true, completa: true },
  {
    nome: 'celular-menu', rota: '/', temas: ['claro'], celular: true,
    ajustar: async (m) => { await m.clicar('button[aria-controls="barra"]'); await dormir(400); },
  },
];

async function tirar(m, tela, tema, arquivo) {
  const { largura, altura } = tela.celular ? CELULAR : { largura: LARGURA, altura: tela.altura || 1000 };
  await m.janela(largura, altura);
  // O tema vem do localStorage antes de a página carregar: gráficos já nascem na cor certa.
  await m.ir(`http://127.0.0.1:${PORTA_PROXY}/favicon.svg`);
  await m.js(`localStorage.setItem('cerebro:tema', '${tema}')`);
  await m.ir(`http://127.0.0.1:${PORTA_PROXY}${tela.rota}`);
  await esperar(m, tela.extra);
  if (tela.ajustar) await tela.ajustar(m);
  await conferirDemo(m);
  if (tela.completa) {
    // A barra lateral tem a altura da janela: página inteira = janela do tamanho do documento.
    for (let i = 0; i < 2; i++) {
      const { h, borda } = await m.js('return { h: document.documentElement.scrollHeight, borda: outerHeight - innerHeight }');
      await m.janela(largura, Math.min(h + borda, ALTURA_MAX));
      await dormir(400);
    }
  }
  await m.js('window.scrollTo(0, 0)');
  await m.png(arquivo, false);
}

async function main() {
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-capturas-'));
  const originais = percorrer(VAULT).map((p) => [p, fs.statSync(p)]);
  let demo = null;
  let proxy = null;
  let firefox = null;
  try {
    demo = await garantirDemo();
    proxy = await iniciarProxy();
    for (const [p] of originais) fs.utimesSync(p, MTIME_VAULT, MTIME_VAULT);

    const porta = await portaLivre();
    firefox = await iniciarFirefox(perfil, porta);
    const m = new Marionette(porta);
    await m.conectar();

    fs.mkdirSync(SAIDA, { recursive: true });
    const filtro = process.argv.slice(2);
    const desconhecidas = filtro.filter((n) => !TELAS.some((t) => t.nome === n));
    if (desconhecidas.length) throw new Error(`tela desconhecida: ${desconhecidas.join(', ')} (use ${TELAS.map((t) => t.nome).join(', ')})`);
    const escolhidas = filtro.length ? TELAS.filter((t) => filtro.includes(t.nome)) : TELAS;
    // Sem filtro, recomeça do zero; com filtro, só as imagens que vão ser regeradas somem.
    for (const f of fs.readdirSync(SAIDA)) {
      if (f.endsWith('.png') && (!filtro.length || escolhidas.some((t) => AMBOS.some((tm) => f === `${t.nome}-${tm}.png`)))) fs.rmSync(path.join(SAIDA, f));
    }

    for (const tela of escolhidas) {
      for (const tema of tela.temas) {
        const arquivo = path.join(SAIDA, `${tela.nome}-${tema}.png`);
        await tirar(m, tela, tema, arquivo);
        log(`${path.relative(RAIZ, arquivo)} (${(fs.statSync(arquivo).size / 1024).toFixed(0)} KB)`);
      }
    }
  } finally {
    firefox?.kill();
    proxy?.close();
    if (demo) { try { process.kill(-demo.pid); } catch { /* já saiu */ } }
    for (const [p, st] of originais) { try { fs.utimesSync(p, st.atime, st.mtime); } catch { /* arquivo sumiu */ } }
    await dormir(300);
    fs.rmSync(perfil, { recursive: true, force: true });
  }
}

if (require.main === module) main().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });

module.exports = { Marionette, iniciarFirefox, portaLivre, esperar, dormir };
