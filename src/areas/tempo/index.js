'use strict';

const { PASTA, readTempo, pomodoroPremissas } = require('./data');
const { loadSiteConfig } = require('../../config');
const { registrar } = require('./gravar');

// "1 h 07 min", "45 min", "2 h".
const horas = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`) : `${m} min`;
};

// Cartão da Home: tempo da semana e do mês.
function resumo(vault, ctx) {
  const d = readTempo(vault, ctx.hoje);
  if (!d.existe) return { titulo: 'Tempo', itens: [{ rotulo: 'Tempo', valor: `sem a pasta ${PASTA}`, tipo: 'texto' }], avisos: d.avisos };
  return {
    titulo: 'Tempo',
    itens: [
      { rotulo: 'Semana', valor: horas(d.semana.minutos), tipo: 'texto' },
      { rotulo: 'Mês', valor: horas(d.mes.minutos), tipo: 'texto' },
    ],
    avisos: d.avisos,
  };
}

module.exports = {
  id: 'tempo',
  titulo: 'Tempo',
  watch: [PASTA],
  api: {
    '': (vault, ctx) => {
      const d = readTempo(vault, ctx.hoje);
      d.pomodoro = pomodoroPremissas(loadSiteConfig().tempo?.pomodoro, d.avisos);
      return d;
    },
  },
  post: { registrar },
  resumo,
  fontes: () => [PASTA],
};
