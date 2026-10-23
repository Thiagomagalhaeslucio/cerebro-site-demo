'use strict';

// Servidor http só de leitura, com uma exceção: as rotas POST que uma área declara em `post`
// (hoje só o financeiro, Lançar movimento), atrás de várias salvaguardas. criarServidor() não escuta porta nenhuma:
// quem chama decide (server.js usa 127.0.0.1:3737; os testes, uma porta livre).

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadNav } = require('./config');
const { createEventHub, watchDir, watchMarkdownDir } = require('./events');
const { montarNav } = require('./nav');
const { montarHome } = require('./home');
const { montarFontes } = require('./fontes');
const { localISODate } = require('./datas');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const LIMITE_CORPO = 4096; // bytes; lançamento nenhum precisa de mais
const LOCAIS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

// Arquivos que os navegadores buscam na raiz (ícone da aba e da tela inicial).
const RAIZ_PUBLICA = new Set(['/favicon.svg', '/favicon-demo.svg', '/favicon-32.png', '/apple-touch-icon.png']);

function criarServidor(cfg, areas) {
  const events = createEventHub();
  // Contexto de cada requisição: no modo demo a data é fixa.
  // areas: para a agenda juntar as datas() das outras áreas.
  // estado: memória por servidor (último lançamento, anti-duplicado); token: um por sessão do servidor.
  const estado = {};
  const token = crypto.randomBytes(24).toString('hex');
  const ctx = () => ({ hoje: cfg.demo?.hoje || localISODate(), demo: !!cfg.demo, areas, estado, estadoDir: cfg.estadoDir ?? null });

  const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...SECURITY_HEADERS });
    res.end(body);
  };
  const sendJson = (res, fn) => {
    try {
      send(res, 200, JSON.stringify(fn()), MIME['.json']);
    } catch (err) {
      send(res, 500, JSON.stringify({ erro: err.message }), MIME['.json']);
    }
  };
  const recusar = (res, status, erro, mensagem) => send(res, status, JSON.stringify({ erro, mensagem }), MIME['.json']);
  const sendFile = (res, file) => {
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'Não encontrado');
      send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
    });
  };
  // Serve um arquivo de public/ sem deixar escapar da pasta.
  const sendPublic = (res, relative) => {
    const file = path.resolve(cfg.publicDir, '.' + path.posix.normalize('/' + relative));
    if (!file.startsWith(cfg.publicDir + path.sep)) return send(res, 403, 'Proibido');
    sendFile(res, file);
  };

  // Pedido que veio da própria página: Sec-Fetch-Site same-origin e/ou Origin igual ao Host.
  // Sem nenhum dos dois não passa (curl e formulários de outro site não passam).
  const mesmoSite = (req, aceitaNone) => {
    const sfs = req.headers['sec-fetch-site'];
    const origin = req.headers.origin;
    if (sfs === undefined && origin === undefined) return false;
    if (sfs !== undefined && sfs !== 'same-origin' && !(aceitaNone && sfs === 'none')) return false;
    return origin === undefined || origin === `http://${req.headers.host}`;
  };
  const tokenOk = (req) => {
    const dado = Buffer.from(String(req.headers['x-cerebro-token'] || ''));
    const certo = Buffer.from(token);
    return dado.length === certo.length && crypto.timingSafeEqual(dado, certo);
  };

  function postar(req, res, pathname) {
    const alvo = areas.flatMap((a) => Object.entries(a.post || {}).map(([sub, fn]) => [`/api/${a.id}/${sub}`, fn])).find(([rota]) => rota === pathname);
    if (!alvo) return send(res, 405, 'Só leitura');
    if (!LOCAIS.has(req.socket.remoteAddress)) return recusar(res, 403, 'origem', 'Só aceito pedidos locais.');
    if (!mesmoSite(req, false)) return recusar(res, 403, 'origem', 'Pedido de outra origem recusado.');
    if (!tokenOk(req)) return recusar(res, 403, 'token', 'Token de sessão ausente ou errado. Recarregue a página.');
    if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return recusar(res, 415, 'tipo', 'Use Content-Type: application/json.');
    if (Number(req.headers['content-length']) > LIMITE_CORPO) return recusar(res, 413, 'tamanho', `O corpo passa de ${LIMITE_CORPO} bytes.`);

    const partes = [];
    let total = 0;
    let estourou = false;
    req.on('data', (d) => {
      total += d.length;
      if (total > LIMITE_CORPO) { estourou = true; partes.length = 0; return; }
      if (!estourou) partes.push(d);
    });
    req.on('end', () => {
      if (estourou) return recusar(res, 413, 'tamanho', `O corpo passa de ${LIMITE_CORPO} bytes.`);
      let corpo;
      try {
        corpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
      } catch {
        return recusar(res, 400, 'json', 'O corpo não é um JSON válido.');
      }
      try {
        const r = alvo[1](cfg.vault, ctx(), corpo);
        send(res, r.status, JSON.stringify(r.corpo), MIME['.json']);
      } catch (err) {
        if (err.status && err.corpo) return send(res, err.status, JSON.stringify(err.corpo), MIME['.json']);
        send(res, 500, JSON.stringify({ erro: 'interno', mensagem: err.message }), MIME['.json']);
      }
    });
  }

  const server = http.createServer((req, res) => {
    // Só aceita requisições endereçadas ao próprio servidor (evita DNS rebinding).
    const porta = server.address()?.port;
    if (req.headers.host !== `127.0.0.1:${porta}` && req.headers.host !== `localhost:${porta}`)
      return send(res, 421, 'Host não permitido');
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'POST') return send(res, 405, 'Só leitura');

    const { pathname, searchParams } = new URL(req.url, `http://${req.headers.host}`);
    const consulta = Object.fromEntries([...searchParams].slice(0, 8).map(([k, v]) => [k, v.slice(0, 40)])); // ?tipo=...&ref=...: poucos campos, curtos
    if (req.method === 'POST') return postar(req, res, pathname);

    // O token é lido pela própria página (mesma origem); sem CORS, outro site não consegue ler.
    if (pathname === '/api/sessao') {
      const sfs = req.headers['sec-fetch-site'];
      const cruzado = (sfs !== undefined && sfs !== 'same-origin' && sfs !== 'none') || (req.headers.origin !== undefined && req.headers.origin !== `http://${req.headers.host}`);
      if (!LOCAIS.has(req.socket.remoteAddress) || cruzado) return recusar(res, 403, 'origem', 'Só a própria página lê o token.');
      return sendJson(res, () => ({ token }));
    }

    if (pathname === '/') return sendPublic(res, 'index.html');
    // Capas dos livros: só os arquivos que `npm run capas` baixou, por id de 12 hex; nada de caminho livre.
    const capa = /^\/capas\/([0-9a-f]{12})\.jpg$/.exec(pathname);
    if (capa) return sendFile(res, path.join(cfg.publicDir, '..', 'capas', `${capa[1]}.jpg`));
    if (RAIZ_PUBLICA.has(pathname)) return sendPublic(res, pathname.slice(1));
    if (pathname === '/events') return events.handle(req, res);
    if (pathname === '/vendor/chart.umd.min.js') return sendFile(res, cfg.chartJs);
    if (pathname.startsWith('/static/')) return sendPublic(res, pathname.slice('/static/'.length));
    if (pathname === '/api/nav')
      return sendJson(res, () => ({ ...montarNav(loadNav(), areas), vault: path.basename(cfg.vault), demo: cfg.demo ? { hoje: ctx().hoje } : null }));
    if (pathname === '/api/home') return sendJson(res, () => montarHome(areas, cfg.vault, ctx()));
    const fonte = /^\/api\/fontes\/([\w-]+)$/.exec(pathname);
    if (fonte) {
      const r = montarFontes(areas, cfg.vault, ctx(), fonte[1]);
      return r ? send(res, 200, JSON.stringify(r), MIME['.json']) : send(res, 404, JSON.stringify({ erro: `área "${fonte[1]}" não existe` }), MIME['.json']);
    }

    for (const area of areas) {
      for (const [sub, handler] of Object.entries(area.api)) {
        if (pathname === (sub ? `/api/${area.id}/${sub}` : `/api/${area.id}`)) return sendJson(res, () => handler(cfg.vault, { ...ctx(), consulta }));
      }
      if (pathname === `/${area.id}` || pathname === `/${area.id}/`) return sendPublic(res, `${area.id}/index.html`);
      if (pathname.startsWith(`/${area.id}/`)) {
        // /<area>/<pagina> sem extensão → public/<area>/<pagina>.html
        const rel = pathname.slice(1);
        return sendPublic(res, path.extname(rel) ? rel : `${rel}.html`);
      }
    }

    send(res, 404, 'Não encontrado');
  });

  function iniciarWatchers() {
    for (const area of areas) {
      for (const dir of area.watch) {
        watchMarkdownDir(path.join(cfg.vault, dir), (file) => events.send('change', { area: area.id, file }));
      }
    }
    const raiz = path.dirname(cfg.configFile);
    // Premissas mudaram: todas as áreas recarregam. Menu mudou: só a barra.
    watchDir(raiz, (f) => f === path.basename(cfg.configFile), () => {
      for (const area of areas) events.send('change', { area: area.id, file: 'config.json' });
    });
    watchDir(raiz, (f) => f === path.basename(cfg.navFile), () => events.send('change', { area: 'nav', file: 'nav.json' }));
  }

  return { server, events, iniciarWatchers };
}

module.exports = { criarServidor };
