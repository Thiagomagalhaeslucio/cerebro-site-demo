'use strict';

const fs = require('node:fs');

// Server-Sent Events: guarda as conexões abertas e envia avisos de mudança.
function createEventHub() {
  const clients = new Set();

  setInterval(() => {
    for (const res of clients) res.write(': ping\n\n');
  }, 25000).unref();

  return {
    handle(req, res) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write('retry: 2000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
    },
    send(event, data) {
      const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of clients) res.write(payload);
    },
  };
}

// Observa uma pasta e chama onChange(arquivo) para mudanças nos arquivos aceitos, com debounce.
// Observar a pasta (e não o arquivo) aguenta editores que salvam renomeando.
function watchDir(dir, aceita, onChange, { recursive = false } = {}) {
  let timer = null;
  let watcher = null;

  const start = () => {
    try {
      watcher = fs.watch(dir, { recursive }, (_event, file) => {
        if (file && !aceita(String(file))) return;
        clearTimeout(timer);
        timer = setTimeout(() => onChange(file ? String(file) : null), 200);
      });
      watcher.on('error', restart);
    } catch {
      restart();
    }
  };
  const restart = () => {
    if (watcher) watcher.close();
    watcher = null;
    setTimeout(start, 2000).unref();
  };

  start();
}

// Pastas do vault: recursivo, para subpastas (ex.: 20-biblioteca/cybersec/) também avisarem.
const watchMarkdownDir = (dir, onChange) => watchDir(dir, (f) => f.endsWith('.md'), onChange, { recursive: true });

module.exports = { createEventHub, watchDir, watchMarkdownDir };
