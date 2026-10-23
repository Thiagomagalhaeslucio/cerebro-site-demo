'use strict';

const fs = require('node:fs');
const { loadConfig } = require('./src/config');
const areas = require('./src/areas');
const { criarServidor } = require('./src/app');

const cfg = loadConfig();
const app = criarServidor(cfg, areas);
app.iniciarWatchers();

if (!fs.existsSync(cfg.vault)) console.warn(`Aviso: vault não encontrado em ${cfg.vault}`);

app.server.listen(cfg.port, cfg.host, () => {
  const base = `http://${cfg.host}:${cfg.port}`;
  console.log(`cerebro-site no ar (só leitura) — vault: ${cfg.vault}`);
  if (cfg.demo) console.log(`  MODO DEMONSTRAÇÃO: dados inventados${cfg.demo.hoje ? `, hoje = ${cfg.demo.hoje}` : ''}`);
  console.log(`  Home: ${base}/`);
  for (const area of areas) console.log(`  ${area.titulo}: ${base}/${area.id}`);
});
