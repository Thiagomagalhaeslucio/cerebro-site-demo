'use strict';

const { DIR, readFinanceiro } = require('./data');
const { readDiagnostico } = require('./diagnostico');
const { loadSiteConfig } = require('../../config');
const lancarIo = require('./lancar-io');

// Contrato de uma área (ver README, "Menu e áreas"):
//   id, titulo, watch       — URL, nome e pastas do vault observadas
//   api                     — { '<sub>': (vault, ctx) => JSON } em /api/<id>[/<sub>]
//   resumo(vault, ctx)      — opcional: { titulo, itens } para o cartão da Home
//   datas(vault, ctx)       — opcional: [{ data, rotulo, area }] para "Datas importantes"
//   fontes(vault, ctx)      — opcional: caminhos (arquivo ou pasta) mostrados como origem da página
//   post                    — opcional: { '<sub>': (vault, ctx, corpo) => { status, corpo } } em POST /api/<id>/<sub>;
//                             é a única forma de escrita do site (src/app.js confere host, origem, token e tamanho)
// ctx = { hoje: 'AAAA-MM-DD', demo: boolean }.

const premissas = () => loadSiteConfig().financeiro?.diagnostico ?? {};

function resumo(vault, ctx) {
  const f = readFinanceiro(vault, ctx.hoje);
  const d = readDiagnostico(vault, premissas(), ctx.hoje);
  return {
    titulo: 'Financeiro',
    itens: [
      { rotulo: 'Diagnóstico', valor: d.veredito.texto, tipo: 'texto', status: d.veredito.status, rota: '/financeiro/diagnostico' },
      { rotulo: 'Patrimônio', valor: f.patrimonio.escrito ?? f.patrimonio.somado, tipo: 'brl' },
      { rotulo: 'Livre (pessoal + margem)', valor: f.livre.escrito ?? f.livre.somado, tipo: 'brl' },
    ],
    avisos: [...new Set([...f.avisos, ...d.avisos])],
  };
}

// Datas que o diagnóstico já calcula: próximo salário, VT e VR.
function datas(vault, ctx) {
  const r = readDiagnostico(vault, premissas(), ctx.hoje).referencias;
  const out = [];
  if (r.salario?.proximo) out.push({ data: r.salario.proximo, rotulo: 'Próximo salário', area: 'financeiro' });
  if (r.vt?.proxima) out.push({ data: r.vt.proxima, rotulo: 'Próximo VT', area: 'financeiro' });
  if (r.vr?.proxima) out.push({ data: r.vr.proxima, rotulo: 'Próximo VR', area: 'financeiro' });
  return out;
}

module.exports = {
  id: 'financeiro',
  titulo: 'Financeiro',
  watch: [DIR],
  api: {
    '': (vault, ctx) => readFinanceiro(vault, ctx.hoje),
    diagnostico: (vault, ctx) => readDiagnostico(vault, premissas(), ctx.hoje),
    lancar: (vault, ctx) => lancarIo.contexto(vault, ctx),
  },
  post: { previa: lancarIo.previa, lancar: lancarIo.lancar, desfazer: lancarIo.desfazer },
  resumo,
  datas,
  fontes: () => [`${DIR}/panelas.md`, `${DIR}/movimentos.md`],
};
