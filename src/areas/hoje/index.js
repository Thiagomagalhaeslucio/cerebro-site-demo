'use strict';

const { ARQUIVO, readHoje } = require('./data');

const agoraDe = (ctx) => (ctx.demo ? new Date(`${ctx.hoje}T12:00:00`) : new Date());
const norm = (s) => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

// Cartão da Home: quantos itens a skill trouxe, ou o convite para gerar.
function resumo(vault, ctx) {
  const d = readHoje(vault, agoraDe(ctx));
  if (!d.existe) return { titulo: 'Hoje', itens: [{ rotulo: 'Resumo do dia', valor: 'peça à skill hoje para gerar', tipo: 'texto' }], avisos: d.avisos };
  const conta = (prefixo) => d.secoes.filter((s) => norm(s.titulo).startsWith(prefixo)).reduce((n, s) => n + s.itens.length, 0);
  return {
    titulo: 'Hoje',
    itens: [
      { rotulo: 'Na agenda', valor: conta('agenda'), tipo: 'numero' },
      { rotulo: 'E-mails que pedem ação', valor: conta('e-mails que pedem'), tipo: 'numero' },
      ...(d.velho ? [{ rotulo: 'Resumo', valor: 'desatualizado', tipo: 'texto', status: 'amarelo' }] : []),
    ],
    avisos: d.avisos,
  };
}

module.exports = {
  id: 'hoje',
  titulo: 'Hoje',
  watch: ['10-diario'],
  api: { '': (vault, ctx) => readHoje(vault, agoraDe(ctx)) },
  resumo,
  fontes: () => [ARQUIVO],
};
