'use strict';

// Regra de divisão do salário líquido, lida de panelas.md (seção "Regra de divisão ..."): sem E/S.
const { findSection } = require('../../md');
const { formatoDe } = require('./formato');

const EOL = /\r?\n/;

function lerDivisao(panelasTxt, F = formatoDe()) {
  const sec = findSection(panelasTxt, 'Regra de divisão');
  if (!sec) return { erro: 'panelas.md: seção "Regra de divisão do salário líquido" não encontrada.' };
  const pct = (linha) => {
    const g = (re) => Number((re.exec(linha) || [])[1]);
    const d = { [F.painelMeta]: g(new RegExp(`(?:${F.divisaoMeta})\\s*(\\d+)%`, 'i')), reserva: g(/reserva\s*(\d+)%/i), pessoal: g(/pessoal\s*(\d+)%/i), margem: g(/margem\s*(\d+)%/i) };
    return Object.values(d).every(Number.isFinite) && Object.values(d).reduce((a, b) => a + b, 0) === 100 ? d : null;
  };
  const linhas = sec.body.split(EOL);
  const normal = pct(linhas.find((l) => /Normal:/i.test(l)) || '');
  const completa = pct(linhas.find((l) => /Quando a reserva/i.test(l)) || '');
  if (!normal || !completa) return { erro: 'panelas.md: a regra de divisão (linhas "Normal:" e "Quando a reserva chegar...") não está legível ou não soma 100%.' };
  return { normal, completa };
}

// "71/0/20/9": a divisão com a reserva completa, na ordem panela das metas / reserva / pessoal / margem.
function divisaoCompleta(panelasTxt, F = formatoDe()) {
  const r = lerDivisao(panelasTxt, F);
  return r.erro ? null : [F.painelMeta, 'reserva', 'pessoal', 'margem'].map((id) => r.completa[id]).join('/');
}

module.exports = { lerDivisao, divisaoCompleta };
