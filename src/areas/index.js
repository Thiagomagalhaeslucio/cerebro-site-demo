'use strict';

// Áreas do site. Para acrescentar biblioteca, diário ou carreira:
// crie src/areas/<id>/index.js (mesmo contrato do financeiro),
// public/<id>/index.html, e registre aqui.
module.exports = [require('./agenda'), require('./kanban'), require('./financeiro'), require('./estudos'), require('./orcamento'), require('./propostas'), require('./contratos'), require('./metas'), require('./tempo'), require('./biblioteca'), require('./demandas'), require('./relatorios')];
