'use strict';

const { readRelatorio } = require('./data');
const { loadSiteConfig } = require('../../config');

const premissas = () => loadSiteConfig().financeiro?.diagnostico ?? {};

// Sem cartão na Home: o relatório é uma página de consulta, com semana e mês navegáveis (?tipo=semana|mes&ref=AAAA-MM-DD).
module.exports = {
  id: 'relatorios',
  titulo: 'Relatórios',
  watch: ['40-financeiro', '80-tempo', '10-diario', '60-estudos'],
  api: { '': (vault, ctx) => readRelatorio(vault, ctx.hoje, ctx.consulta, { premissasDiagnostico: premissas(), premissasMetas: premissas() }) },
  fontes: () => ['40-financeiro', '80-tempo', '10-diario/metas.md'],
};
