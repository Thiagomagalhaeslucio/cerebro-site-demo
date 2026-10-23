// Fórmula do orçamento: a seção "Como calcular" de 70-negocio/precificacao.md.
// UMD simples: o navegador lê window.Orcamento e o teste usa require(). Não
// arredonda nada: quem exibe arredonda.
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Orcamento = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ehNumero = (x) => typeof x === 'number' && Number.isFinite(x);
  const qtd = (x) => (ehNumero(x) && x > 0 ? x : 0);
  const UM_DIA = 86400000;

  const zero = { valor: 0, falta: [] };
  const pedir = (P, chaves) => chaves.filter((k) => !ehNumero(P[k]));

  // Passo da conta: fn(...valores dos itens) se tudo existir; senão junta o que falta
  // (parâmetro "a definir" ou ausente) e deixa valor null, sem chute.
  function passo(P, itens, chaves, fn) {
    const falta = [...new Set([...itens.flatMap((i) => i.falta), ...pedir(P, chaves)])];
    return falta.length ? { valor: null, falta } : { valor: fn(...itens.map((i) => i.valor)), falta: [] };
  }
  const somar = (P, itens) => passo(P, itens, [], (...v) => v.reduce((s, x) => s + x, 0));

  // P: parâmetros { chave: número | null }.
  // e: { horas, mult, urgente, viagens, km, horasViagem, revisoesExtras, terceiros }.
  function calcular(P, e) {
    const viagens = qtd(e.viagens);
    const km = qtd(e.km);
    const horasViagem = qtd(e.horasViagem);
    const extras = qtd(e.revisoesExtras);

    const horasBase = ehNumero(e.mult) ? { valor: qtd(e.horas) * e.mult, falta: [] } : { valor: null, falta: ['multiplicador'] };
    const horas = passo(P, [horasBase], ['margem_risco'], (hb) => hb * (1 + P.margem_risco));
    const base = passo(P, [horas], ['valor_hora'], (h) => h * P.valor_hora);
    const urgencia = e.urgente ? passo(P, [base], ['adicional_urgencia'], (b) => b * P.adicional_urgencia) : zero;
    const deslocamento = somar(P, [
      viagens ? passo(P, [], ['deslocamento_fixo'], () => viagens * P.deslocamento_fixo) : zero,
      km ? passo(P, [], ['deslocamento_km'], () => km * P.deslocamento_km) : zero,
      horasViagem ? passo(P, [], ['valor_hora', 'tempo_viagem_fator'], () => horasViagem * P.valor_hora * P.tempo_viagem_fator) : zero,
    ]);
    const revisoes = extras ? passo(P, [], ['revisao_extra_horas', 'valor_hora'], () => extras * P.revisao_extra_horas * P.valor_hora) : zero;
    const terceiros = { valor: qtd(e.terceiros), falta: [] };

    const subtotal = somar(P, [base, urgencia, deslocamento, revisoes, terceiros]);
    const recomendado = passo(P, [subtotal], ['imposto'], (s) => s / (1 - P.imposto));

    // piso = max(recomendado × (1 − desconto_max), (horas_base × valor_hora_piso + deslocamento + revisões + terceiros) / (1 − imposto))
    const porDesconto = passo(P, [recomendado], ['desconto_max'], (r) => r * (1 - P.desconto_max));
    const porCusto = passo(P, [horasBase, deslocamento, revisoes, terceiros], ['valor_hora_piso', 'imposto'],
      (hb, d, r, t) => (hb * P.valor_hora_piso + d + r + t) / (1 - P.imposto));
    const piso = passo(P, [porDesconto, porCusto], [], (a, b) => Math.max(a, b));
    const pisoPor = piso.valor == null ? null : porCusto.valor > porDesconto.valor ? 'custo' : 'desconto';

    return {
      horasBase, horas, base, urgencia, deslocamento, revisoes, terceiros, subtotal, recomendado, piso, pisoPor,
      entrada: passo(P, [recomendado], ['entrada'], (r) => r * P.entrada),
      imposto: passo(P, [recomendado, subtotal], [], (r, s) => r - s), // o que o imposto leva do recomendado
    };
  }

  // Dias entre duas datas AAAA-MM-DD (entrega − início); null se alguma for inválida.
  function diasEntre(inicio, entrega) {
    const t = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? Date.parse(`${s}T00:00:00Z`) : NaN);
    const d = (t(entrega) - t(inicio)) / UM_DIA;
    return Number.isFinite(d) ? d : null;
  }

  // Urgência sugerida: prazo normal = ⌈horas / capacidade_horas_semana × 7⌉, com
  // horas = horas_estimadas × multiplicador × (1 + margem_risco). É só sugestão.
  function sugerirUrgencia(P, e) {
    const falta = ['capacidade_horas_semana', 'margem_risco'].filter((k) => !ehNumero(P[k]) || (k === 'capacidade_horas_semana' && P[k] <= 0));
    if (!ehNumero(e.mult)) falta.push('multiplicador');
    const desejado = diasEntre(e.inicio, e.entrega);
    if (falta.length) return { sugerir: false, falta, prazoNormal: null, prazoDesejado: desejado };
    const horas = qtd(e.horas) * e.mult * (1 + P.margem_risco);
    const prazoNormal = Math.ceil((horas / P.capacidade_horas_semana) * 7);
    return { sugerir: desejado != null && desejado < prazoNormal, falta: [], prazoNormal, prazoDesejado: desejado };
  }

  return { calcular, sugerirUrgencia, diasEntre };
});
