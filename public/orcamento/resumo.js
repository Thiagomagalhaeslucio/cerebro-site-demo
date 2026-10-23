// Resumo em texto simples para colar numa proposta. Só aqui aparecem garantia e
// hora avulsa (informativos no arquivo, fora da fórmula). Piso e margem ficam de fora.
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.OrcamentoResumo = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ehNumero = (x) => typeof x === 'number' && Number.isFinite(x);
  // Espaço comum no lugar do espaço sem quebra do Intl, para o texto colar limpo.
  const brl = (n) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n).replace(/ /g, ' ');
  const pct = (f) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(f * 100)}%`;
  const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

  // P: parâmetros; r: resultado de calcular(); c: { tipo, urgente, revisoesExtras, inicio, entrega }.
  function montarResumo(P, r, c) {
    if (!ehNumero(r.recomendado.valor)) return null;
    const linhas = [`Orçamento: ${c.tipo || 'Trabalho sob medida'}`, `Valor: ${brl(r.recomendado.valor)}`];
    if (ehNumero(r.entrada.valor)) {
      linhas.push(`Entrada (${pct(P.entrada)}): ${brl(r.entrada.valor)}, antes de começar`);
      linhas.push(`Saldo na entrega: ${brl(r.recomendado.valor - r.entrada.valor)}`);
    }
    if (ehNumero(P.revisoes_incluidas)) {
      const extras = Number(c.revisoesExtras) > 0 ? Number(c.revisoesExtras) : 0;
      linhas.push(`Revisões: ${plural(P.revisoes_incluidas, 'rodada incluída', 'rodadas incluídas')}${extras ? `, mais ${plural(extras, 'extra já somada', 'extras já somadas')} ao valor` : ''}`);
    }
    const datas = [c.inicio && `início em ${dataBR(c.inicio)}`, c.entrega && `entrega em ${dataBR(c.entrega)}`].filter(Boolean);
    if (datas.length || c.urgente) linhas.push(`Prazo: ${[datas.join(', '), c.urgente && (datas.length ? '(urgente)' : 'urgente')].filter(Boolean).join(' ')}`);
    if (ehNumero(P.garantia_dias)) linhas.push(`Garantia: ${plural(P.garantia_dias, 'dia', 'dias')} para correção de bugs da entrega, sem custo.`);
    if (ehNumero(P.hora_avulsa)) linhas.push(`Depois da garantia: manutenção a ${brl(P.hora_avulsa)} por hora.`);
    return linhas.join('\n');
  }

  return { montarResumo };
});
