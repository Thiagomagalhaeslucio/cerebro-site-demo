'use strict';

const { DIR, readAgenda, lerEventosDaAgenda } = require('./data');
const { addDays } = require('../../datas');
const { criar } = require('./gravar');

const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Cartão da Home: os próximos 3 compromissos de agenda.md.
function resumo(vault, ctx) {
  const avisos = [];
  const proximos = lerEventosDaAgenda(vault, avisos).filter((e) => e.data >= ctx.hoje).slice(0, 3);
  return {
    titulo: 'Agenda',
    itens: proximos.length
      ? proximos.map((e) => ({
        rotulo: `${ddmm(e.data)}, ${e.diaInteiro ? 'dia inteiro' : e.inicio + (e.fim ? `–${e.fim}` : '')}`,
        valor: e.titulo,
        tipo: 'texto',
        detalhe: e.tipo || '',
      }))
      : [{ rotulo: 'Próximos compromissos', valor: 'nada marcado', tipo: 'texto' }],
    avisos,
  };
}

// Eventos de agenda.md nos próximos 14 dias (hoje incluído).
function datas(vault, ctx) {
  const limite = addDays(ctx.hoje, 13);
  return lerEventosDaAgenda(vault, [])
    .filter((e) => e.data >= ctx.hoje && e.data <= limite)
    .map((e) => ({ data: e.data, rotulo: e.inicio ? `${e.inicio} ${e.titulo}` : e.titulo, area: 'agenda' }));
}

module.exports = {
  id: 'agenda',
  titulo: 'Agenda',
  watch: [DIR],
  api: { '': (vault, ctx) => readAgenda(vault, ctx) },
  post: { criar },
  resumo,
  datas,
  fontes: () => ['10-diario/agenda.md'],
};
