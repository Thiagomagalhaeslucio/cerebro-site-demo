'use strict';

// O que no financeiro é "nome seu" e não regra: o id da panela que acumula as metas, os rótulos das linhas de
// meta em panelas.md e os textos mostrados. Vem de config.json → financeiro.formato (genérico, versionado) e,
// por cima, do config.local.json (o seu). O código usa só as chaves internas `marco` e `metaFinal`.
//   painelMeta        id da panela (coluna "id" de panelas.md) onde se acumulam o marco e a meta final
//   divisaoMeta       expressão regular (texto) do nome dessa panela na regra de divisão do salário
//   linhas.*          texto que abre a linha da meta em "## Metas" ("- Marco: ... R$2.000")
//   rotulos.*         textos mostrados (página, diagnóstico, avisos do lançamento)
const { loadSiteConfig } = require('../../config');

const PADRAO = {
  painelMeta: 'principal',
  divisaoMeta: 'principal',
  descricaoAjuste: 'Ajuste de saldo (conferido com o banco)',
  linhas: { marco: 'Marco', metaFinal: 'Meta final', reserva: 'Reserva' },
  rotulos: {
    marco: 'Marco',
    marcoDescricao: 'marco dentro da panela principal',
    marcoAtingido: 'Marco atingido',
    metaFinal: 'Meta final',
    metaFinalDescricao: 'meta final da panela principal',
    painelNome: 'panela principal',
    painelHoje: 'Principal hoje',
    painelRecebe: 'Principal recebe por salário',
    painelAteMarco: 'Marco (panela principal até o marco)',
    metaFinalPainel: 'Meta final (panela principal)',
    avisoMarco: 'Marco atingido: a panela principal cruzou o marco e segue acumulando para a meta final.',
    marcoSemDados: 'Faltam dados para projetar o marco.',
    acaoSemDados: 'Confira o saldo da panela principal, a divisão do salário e o marco em panelas.md.',
    marcoPago: 'Marco atingido: panela principal em',
    marcoProjetado: 'Marco projetado no próximo salário',
    acaoVerdeFeito: 'Siga acumulando para a meta final.',
    acaoVerde: 'Mantenha a divisão: o marco fecha no próximo salário.',
    acaoAmarelo: 'O marco só fecha no 2º salário: não tire nada da panela principal até lá.',
    acaoVermelho: 'O marco só fecha em {n} salários: reforce a panela principal com sobras de pessoal/margem.',
    explicacaoMetas: 'Metas: em dia se a panela principal mais o que ela recebeu no último salário alcança o marco; atenção se só no segundo salário; segurar se depois.',
  },
};

// Mescla o cru por cima do padrão, só com textos não vazios; o resto cai no padrão.
function formatoDe(cru) {
  const txt = (v, p) => (typeof v === 'string' && v.trim() ? v.trim() : p);
  const sub = (obj, padrao) => Object.fromEntries(Object.entries(padrao).map(([k, p]) => [k, txt(obj?.[k], p)]));
  return {
    painelMeta: txt(cru?.painelMeta, PADRAO.painelMeta),
    divisaoMeta: txt(cru?.divisaoMeta, PADRAO.divisaoMeta),
    descricaoAjuste: txt(cru?.descricaoAjuste, PADRAO.descricaoAjuste),
    linhas: sub(cru?.linhas, PADRAO.linhas),
    rotulos: sub(cru?.rotulos, PADRAO.rotulos),
  };
}

const formato = () => formatoDe(loadSiteConfig().financeiro?.formato);

// O que as páginas precisam saber (os nomes de exibição e o id da panela das metas); nada de regex nem de linhas do arquivo.
const formatoPublico = (F) => ({ painelMeta: F.painelMeta, descricaoAjuste: F.descricaoAjuste, rotulos: F.rotulos });

// Para a regex da linha de meta e da divisão do salário: o texto é literal, não expressão.
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { formato, formatoDe, formatoPublico, escapar, PADRAO };
