// Fragmento da URL (#chave=valor&...) que leva os campos do /orcamento para o
// /propostas. Só o navegador de cada pessoa lê: o fragmento não vai ao servidor.
// UMD: window.PropostasFragmento no navegador, require() no teste.
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.PropostasFragmento = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TEXTO = ['cliente', 'projeto', 'resumo', 'escopo', 'fora', 'entregaveis', 'tipo', 'nivel'];
  const DATA = ['inicio', 'entrega'];
  const NUMERO = ['validade', 'horas', 'viagens', 'km', 'horasviagem', 'revisoes', 'terceiros'];
  const BOOL = ['urgente'];
  const LIMITE = 5000;

  // { campo: valor } → "#campo=valor&..." (campos vazios ficam de fora).
  function codificar(obj) {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) {
      if (v === '' || v == null || v === false) continue;
      p.set(k, v === true ? '1' : String(v));
    }
    const s = p.toString();
    return s ? `#${s}` : '';
  }

  // "#campo=valor&..." → { campo: valor }, só campos conhecidos e válidos: datas
  // AAAA-MM-DD, números finitos e não negativos, urgente "1". Resto é descartado.
  function decodificar(hash) {
    const bruto = String(hash || '').replace(/^#/, '');
    const saida = {};
    let p;
    try {
      p = new URLSearchParams(bruto);
    } catch {
      return saida;
    }
    for (const [k, v] of p) {
      if (Object.prototype.hasOwnProperty.call(saida, k)) continue;
      if (TEXTO.includes(k)) {
        if (v.trim()) saida[k] = v.slice(0, LIMITE);
      } else if (DATA.includes(k)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) saida[k] = v;
      } else if (NUMERO.includes(k)) {
        if (v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0) saida[k] = String(Number(v));
      } else if (BOOL.includes(k)) {
        if (v === '1') saida[k] = '1';
      }
    }
    return saida;
  }

  return { codificar, decodificar };
});
