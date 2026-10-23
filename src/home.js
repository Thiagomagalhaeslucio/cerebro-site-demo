'use strict';

// Home: junta resumo() e datas() de cada área. Área que falhar vira aviso
// no próprio cartão e não derruba a página.

const fs = require('node:fs');
const path = require('node:path');
const { diffDays, isISODate } = require('./datas');
const { loadSiteConfig } = require('./config');

// O backup (scripts/backup.js, pelo timer do systemd) deixa estadoDir/backup.json; sem backup recente, a Home avisa.
// Só vale no site real (demo e testes não têm estadoDir) e só se há destinos configurados.
function avisoDeBackup(ctx) {
  if (ctx.demo || !ctx.estadoDir) return null;
  const cfg = loadSiteConfig().backup ?? {};
  if (!cfg.destinos?.length) return null;
  const limite = Number.isFinite(cfg.alertarAposDias) ? cfg.alertarAposDias : 2;
  let estado = null;
  try { estado = JSON.parse(fs.readFileSync(path.join(ctx.estadoDir, 'backup.json'), 'utf8')); } catch { /* nunca rodou */ }
  if (!estado?.quando) return 'Backup do vault: ainda não há registro de nenhuma cópia. Rode `node scripts/backup.js` (ou ative o timer cerebro-backup).';
  if (!estado.destinosOk) return 'Backup do vault: a última tentativa não conseguiu gravar em nenhum destino. Rode `node scripts/backup.js` para ver o motivo.';
  const dias = (Date.parse(`${ctx.hoje}T12:00:00Z`) - Date.parse(`${estado.quando.slice(0, 10)}T12:00:00Z`)) / 86400000;
  return dias > limite ? `Backup do vault atrasado: a última cópia foi há ${Math.floor(dias)} dias.` : null;
}

function montarHome(areas, vault, ctx) {
  const avisos = [];
  const datas = [];
  const cartoes = [];

  for (const area of areas) {
    if (typeof area.datas === 'function') {
      try {
        for (const d of area.datas(vault, ctx) || []) {
          if (!isISODate(d.data)) {
            avisos.push(`${area.titulo}: data inválida "${d.data}" em "${d.rotulo}".`);
            continue;
          }
          datas.push({ data: d.data, rotulo: d.rotulo, area: d.area || area.id, emDias: diffDays(d.data, ctx.hoje) });
        }
      } catch (err) {
        avisos.push(`${area.titulo}: datas indisponíveis (${err.message}).`);
      }
    }

    const cartao = { area: area.id, titulo: area.titulo, rota: `/${area.id}`, itens: [], avisos: [] };
    if (typeof area.resumo === 'function') {
      try {
        const r = area.resumo(vault, ctx) || {};
        cartao.titulo = r.titulo || area.titulo;
        cartao.itens = Array.isArray(r.itens) ? r.itens : [];
        cartao.avisos = Array.isArray(r.avisos) ? r.avisos : [];
      } catch (err) {
        cartao.erro = err.message;
      }
    }
    cartoes.push(cartao);
  }

  const backup = avisoDeBackup(ctx);
  if (backup) avisos.push(backup);

  datas.sort((a, b) => a.data.localeCompare(b.data) || a.rotulo.localeCompare(b.rotulo));
  return { hoje: ctx.hoje, datas, cartoes, avisos };
}

module.exports = { montarHome };
