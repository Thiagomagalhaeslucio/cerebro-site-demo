// Documento do contrato: os campos que o modelo (70-negocio/modelos/contrato.md) pode usar e
// a validação de CPF e CNPJ. UMD: o navegador usa window.Contratos, o teste, require().
// O motor de modelo e a leitura de markdown são os de documentos/modelo.js.
//
// Vazamento: o modelo só enxerga os campos que campos() devolve. Piso, margem de risco,
// valor/hora e composição não são campos; só o produto horas da rodada × valor/hora sai,
// como revisao_extra_valor. Um {{valor_hora}} no modelo é campo desconhecido e a linha some.
//
// Privacidade: CPF, CNPJ e endereços só existem em memória; nada aqui os grava ou os envia.
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Contratos = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const D = typeof module === 'object' && module.exports ? require('../documentos/modelo') : self.Documentos;
  const { ehNumero, brl, pct, inteiro, centavos, dataBR, linha1, itens } = D;

  // ---------- CPF e CNPJ ----------

  // CPF: só dígitos. CNPJ: dígitos e letras maiúsculas (o formato alfanumérico, em que cada
  // caractere vale seu código ASCII menos 48), sem pontuação.
  const soDigitos = (s) => String(s ?? '').replace(/\D/g, '');
  const soAlfanum = (s) => String(s ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

  // Dígito verificador de módulo 11 sobre `base` (valores 0 a 35 por caractere), pesos 2.. da direita para a esquerda.
  function modulo11(valores, pesoMax) {
    let soma = 0;
    for (let i = valores.length - 1, peso = 2; i >= 0; i--, peso = peso === pesoMax ? 2 : peso + 1) soma += valores[i] * peso;
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  }

  function cpfValido(s) {
    const d = soDigitos(s);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    const v = [...d].map(Number);
    return modulo11(v.slice(0, 9), 11) === v[9] && modulo11(v.slice(0, 10), 11) === v[10];
  }

  function cnpjValido(s) {
    const a = soAlfanum(s);
    if (!/^[0-9A-Z]{12}\d{2}$/.test(a) || /^(.)\1{13}$/.test(a)) return false;
    const v = [...a].map((ch) => ch.charCodeAt(0) - 48);
    return modulo11(v.slice(0, 12), 9) === v[12] && modulo11(v.slice(0, 13), 9) === v[13];
  }

  // Formata só quando a quantidade de caracteres está certa; senão devolve o que foi digitado, aparado.
  function formatarCPF(s) {
    const d = soDigitos(s);
    return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : linha1(s);
  }
  function formatarCNPJ(s) {
    const a = soAlfanum(s);
    return a.length === 14 ? `${a.slice(0, 2)}.${a.slice(2, 5)}.${a.slice(5, 8)}/${a.slice(8, 12)}-${a.slice(12)}` : linha1(s);
  }

  // Avisos sobre os documentos das partes (só avisam, nunca bloqueiam):
  // → { contratado: '' | texto, contratante: '' | texto }
  function avisosDocumentos(form = {}) {
    const cpf = linha1(form.contratado_cpf);
    const doc = linha1(form.contratante_documento);
    const tipo = form.contratante_tipo === 'CPF' ? 'CPF' : 'CNPJ';
    return {
      contratado: cpf && !cpfValido(cpf) ? 'Este CPF não passa na conferência dos dígitos verificadores. Confira antes de usar.' : '',
      contratante: doc && !(tipo === 'CPF' ? cpfValido(doc) : cnpjValido(doc)) ? `Este ${tipo} não passa na conferência dos dígitos verificadores. Confira antes de usar.` : '',
    };
  }

  // ---------- campos do modelo ----------

  // Os únicos campos que o modelo pode usar. Texto vazio = "" ou lista vazia; as opções são
  // booleanos (para {{#se campo}}).
  // e: { P, hoje, form }
  // form: contratado_nome/cpf/endereco/email, contratante_nome/tipo ('CNPJ' | 'CPF')/documento/endereco/representante/email,
  //       projeto, valor (R$), entrada (fração), inicio, entrega, escopo, fora, entregaveis (texto, um item por linha),
  //       forma_pagamento, foro, sob_medida, trata_dados, dados_tratados, testemunhas, minuta
  // P: só entrada (não lida), revisoes_incluidas, revisao_extra_horas, valor_hora, garantia_dias, hora_avulsa e prazo_resposta_cliente_dias.
  function campos(e) {
    const { P = {}, form = {}, hoje } = e;
    const total = ehNumero(form.valor) && form.valor > 0 ? form.valor : null;
    const ent = ehNumero(form.entrada) && form.entrada > 0 && form.entrada <= 1 ? form.entrada : null;
    const entradaValor = total != null && ent != null ? centavos(total * ent) : null;
    const dias = (n) => (ehNumero(n) ? inteiro(n) : '');
    const tipo = form.contratante_tipo === 'CPF' ? 'CPF' : 'CNPJ';
    const doc = linha1(form.contratante_documento);
    return {
      contratado_nome: linha1(form.contratado_nome),
      contratado_cpf: formatarCPF(form.contratado_cpf),
      contratado_endereco: linha1(form.contratado_endereco),
      contratado_email: linha1(form.contratado_email),
      contratante_nome: linha1(form.contratante_nome),
      contratante_documento_tipo: tipo,
      contratante_documento: doc ? (tipo === 'CPF' ? formatarCPF(doc) : formatarCNPJ(doc)) : '',
      contratante_endereco: linha1(form.contratante_endereco),
      contratante_representante: tipo === 'CNPJ' ? linha1(form.contratante_representante) : '', // só para CNPJ
      contratante_email: linha1(form.contratante_email),
      projeto: linha1(form.projeto),
      escopo: itens(form.escopo),
      fora_do_escopo: itens(form.fora),
      entregaveis: itens(form.entregaveis),
      data: dataBR(hoje),
      inicio: dataBR(form.inicio),
      entrega: dataBR(form.entrega),
      valor_total: total != null ? brl(total) : '',
      entrada_percentual: ent != null ? pct(ent) : '',
      entrada_valor: entradaValor != null ? brl(entradaValor) : '',
      saldo_valor: entradaValor != null ? brl(centavos(total - entradaValor)) : '',
      forma_pagamento: linha1(form.forma_pagamento),
      revisoes_incluidas: dias(P.revisoes_incluidas),
      revisao_extra_valor: ehNumero(P.revisao_extra_horas) && ehNumero(P.valor_hora) ? brl(centavos(P.revisao_extra_horas * P.valor_hora)) : '',
      garantia_dias: dias(P.garantia_dias),
      hora_avulsa: ehNumero(P.hora_avulsa) ? brl(P.hora_avulsa) : '',
      prazo_resposta_dias: dias(P.prazo_resposta_cliente_dias),
      foro: linha1(form.foro),
      sistema_sob_medida: !!form.sob_medida,
      trata_dados: !!form.trata_dados,
      nao_trata_dados: !form.trata_dados, // a outra versão da cláusula de dados: nunca as duas juntas
      dados_tratados: String(form.dados_tratados ?? '').trim(),
      testemunhas: !!form.testemunhas,
      minuta: !!form.minuta,
    };
  }

  return { campos, avisosDocumentos, cpfValido, cnpjValido, formatarCPF, formatarCNPJ };
});
