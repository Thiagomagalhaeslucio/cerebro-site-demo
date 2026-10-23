// Documento da proposta: preenche o modelo (70-negocio/modelos/proposta.md) e lê um
// subconjunto de markdown. UMD: o navegador usa window.Propostas, o teste, require().
//
// Vazamento: o modelo só enxerga os campos que campos() devolve. Piso, margem de
// risco, valor/hora, composição e observações da planilha não são campos; um
// {{valor_hora}} no modelo é um campo desconhecido e a linha some.
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Propostas = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const D = typeof module === 'object' && module.exports ? require('../documentos/modelo') : self.Documentos;
  const { ehNumero, brl, pct, inteiro, centavos, dataBR, somarDias, linha1, itens, preencher, parseMarkdown, inline } = D;

  // Valor proposto inicial: o recomendado arredondado para cima em reais. A folga de
  // 1e-9 evita que 917,0000000001 (ruído de ponto flutuante) vire 918.
  function valorInicial(recomendado) {
    return ehNumero(recomendado) && recomendado > 0 ? Math.ceil(recomendado - 1e-9) : null;
  }

  // Os únicos campos que o modelo pode usar. Texto vazio = "" ou lista vazia.
  // e: { perfil, P, hoje, valor, form: { cliente, projeto, resumo, escopo, fora, entregaveis, inicio, entrega, validade } }
  // P: só entrada, revisoes_incluidas, revisao_extra_horas, valor_hora, garantia_dias e prazo_resposta_cliente_dias são lidos.
  function campos(e) {
    const { perfil = {}, P = {}, form = {}, hoje, valor } = e;
    const total = ehNumero(valor) && valor > 0 ? valor : null;
    const entradaValor = total != null && ehNumero(P.entrada) ? centavos(total * P.entrada) : null;
    const dias = (n) => (ehNumero(n) ? inteiro(n) : '');
    const contato = [perfil.email && linha1(perfil.email), perfil.whatsapp && `WhatsApp ${linha1(perfil.whatsapp)}`].filter(Boolean).join(', ');
    const [comercial, nome] = [linha1(perfil.nome_comercial), linha1(perfil.nome)];
    return {
      cliente: linha1(form.cliente),
      projeto: linha1(form.projeto),
      resumo: String(form.resumo ?? '').trim(),
      escopo: itens(form.escopo),
      fora_do_escopo: itens(form.fora),
      entregaveis: itens(form.entregaveis),
      data: dataBR(hoje),
      inicio: dataBR(form.inicio),
      entrega: dataBR(form.entrega),
      validade_data: ehNumero(form.validade) ? dataBR(somarDias(hoje, form.validade)) : '',
      valor_total: total != null ? brl(total) : '',
      entrada_percentual: ehNumero(P.entrada) ? pct(P.entrada) : '',
      entrada_valor: entradaValor != null ? brl(entradaValor) : '',
      saldo_valor: entradaValor != null ? brl(centavos(total - entradaValor)) : '',
      revisoes_incluidas: dias(P.revisoes_incluidas),
      revisao_extra_valor: ehNumero(P.revisao_extra_horas) && ehNumero(P.valor_hora) ? brl(centavos(P.revisao_extra_horas * P.valor_hora)) : '',
      garantia_dias: dias(P.garantia_dias),
      prazo_resposta_dias: dias(P.prazo_resposta_cliente_dias),
      prestador_nome: comercial && nome ? `${comercial}, por ${nome}` : comercial || nome,
      prestador_contato: contato,
    };
  }

  return { campos, preencher, parseMarkdown, inline, brl, pct, dataBR, somarDias, valorInicial };
});
