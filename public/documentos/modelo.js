// Motor de modelo e formatadores dos documentos gerados (proposta, contrato): preenche
// {{campo}} em um modelo markdown e lê um subconjunto de markdown. UMD: o navegador usa
// window.Documentos, o teste, require(). Não conhece nenhum documento em particular.
(function (raiz, fabrica) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Documentos = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ehNumero = (x) => typeof x === 'number' && Number.isFinite(x);
  const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const UM_DIA = 86400000;

  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  // Espaço comum no lugar do espaço sem quebra do Intl, para o texto colar limpo.
  const brl = (n) => BRL.format(n).replace(/ /g, ' ');
  const pct = (f) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(f * 100)}%`;
  const inteiro = (n) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n);
  const centavos = (n) => Math.round(n * 100) / 100;

  // AAAA-MM-DD válido (dia que existe) → dd/mm/aaaa; senão ''.
  function dataBR(iso) {
    const m = ISO.exec(iso || '');
    if (!m) return '';
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    return new Date(t).toISOString().slice(0, 10) === iso ? `${m[3]}/${m[2]}/${m[1]}` : '';
  }

  // AAAA-MM-DD + n dias → AAAA-MM-DD (em UTC, sem fuso nem horário de verão); '' se inválido.
  function somarDias(iso, n) {
    if (!dataBR(iso) || !ehNumero(n)) return '';
    return new Date(Date.parse(`${iso}T00:00:00Z`) + Math.round(n) * UM_DIA).toISOString().slice(0, 10);
  }


  const linha1 = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
  // Um item por linha; tira o marcador que a pessoa digitou ("- ", "* ", "• ").
  const itens = (s) => String(s ?? '').split(/\r?\n/).map((l) => l.replace(/^\s*(?:[-*•]\s+)/, '').trim()).filter(Boolean);

  const CAMPO = /\{\{\s*([\w]+)\s*\}\}/g;
  const vazioValor = (v) => (Array.isArray(v) ? v.length === 0 : !v);

  // Blocos {{#se campo}} ... {{/se}}: as marcas ficam em linha própria, sem aninhamento
  // (uma nova abertura substitui a anterior). O bloco só sai se o campo tiver valor.
  const ABRE = /^\s*\{\{\s*#se\s+(\w+)\s*\}\}\s*$/;
  const FECHA = /^\s*\{\{\s*\/se\s*\}\}\s*$/;
  const MARCA = /\{\{\s*[#/]/;

  // Linhas que entram no documento: sem citações (">", notas para quem edita o modelo) e,
  // se houver título, sem o texto que vem antes do primeiro.
  function apenasDocumento(modelo) {
    const linhas = String(modelo).split(/\r?\n/).filter((l) => !/^\s*>/.test(l));
    const primeiro = linhas.findIndex((l) => /^#{1,6}\s/.test(l));
    return primeiro > 0 ? linhas.slice(primeiro) : linhas;
  }

  // Troca {{campo}} no modelo. Linha com algum campo vazio (ou desconhecido) some,
  // junto com as linhas recuadas que continuam ela; uma linha só com um campo de
  // lista vira itens "- ..."; título de seção que ficou sem nada some.
  function preencher(modelo, c) {
    const valorDe = (nome) => (Object.prototype.hasOwnProperty.call(c, nome) ? c[nome] : '');
    const saida = [];
    let pulando = false;
    let bloco = null; // dentro de {{#se campo}}: true mostra, false esconde; null = fora de bloco
    for (const linha of apenasDocumento(modelo)) {
      const abre = ABRE.exec(linha);
      if (abre) { bloco = !vazioValor(valorDe(abre[1])); pulando = false; continue; }
      if (FECHA.test(linha)) { bloco = null; pulando = false; continue; }
      if (bloco === false) continue;
      if (MARCA.test(linha)) continue; // marca de bloco fora de linha própria: omitida, nunca impressa
      if (pulando && /^\s+\S/.test(linha)) continue;
      pulando = false;
      const nomes = [...linha.matchAll(CAMPO)].map((m) => m[1]);
      if (!nomes.length) {
        saida.push(linha);
        continue;
      }
      if (nomes.some((n) => vazioValor(valorDe(n)))) {
        pulando = true;
        continue;
      }
      const so = /^\s*\{\{\s*(\w+)\s*\}\}\s*$/.exec(linha);
      if (so && Array.isArray(valorDe(so[1]))) saida.push(...valorDe(so[1]).map((i) => `- ${i}`));
      else saida.push(linha.replace(CAMPO, (_, n) => (Array.isArray(valorDe(n)) ? valorDe(n).join(', ') : valorDe(n))));
    }
    // Seção sem corpo: título (## ou mais) seguido de um título de nível igual ou superior, ou do fim.
    // Repete até estabilizar: tirar uma subseção vazia pode deixar a seção dela vazia.
    let limpa = saida;
    for (let mudou = true; mudou;) {
      mudou = false;
      const proxima = [];
      for (let i = 0; i < limpa.length; i++) {
        const h = /^(#{2,6})\s/.exec(limpa[i]);
        if (h) {
          const prox = limpa.slice(i + 1).find((l) => l.trim() !== '');
          const hp = prox === undefined ? null : /^(#{1,6})\s/.exec(prox);
          if (prox === undefined || (hp && hp[1].length <= h[1].length)) { mudou = true; continue; }
        }
        proxima.push(limpa[i]);
      }
      limpa = proxima;
    }
    return limpa.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // **negrito** → [{ texto, forte }]
  function inline(texto) {
    return String(texto).split('**').map((parte, i) => ({ texto: parte, forte: i % 2 === 1 })).filter((p) => p.texto !== '');
  }

  // Subconjunto de markdown: títulos (#), parágrafos (linhas seguidas ficam juntas, com
  // quebra), listas com "-", "*" ou "1." (linha recuada continua o item) e **negrito**.
  // → [{ tipo: 'h', nivel, texto } | { tipo: 'p', linhas } | { tipo: 'ul' | 'ol', itens }]
  function parseMarkdown(texto) {
    const blocos = [];
    let atual = null; // bloco aberto: p, ul ou ol
    const fechar = () => { atual = null; };
    for (const linha of String(texto).split(/\r?\n/)) {
      if (linha.trim() === '') { fechar(); continue; }
      const h = /^(#{1,6})\s+(.*)$/.exec(linha);
      if (h) { fechar(); blocos.push({ tipo: 'h', nivel: h[1].length, texto: h[2].trim() }); continue; }
      const li = /^\s*(?:([-*])|(\d+)[.)])\s+(.*)$/.exec(linha);
      if (li) {
        const tipo = li[1] ? 'ul' : 'ol';
        if (!atual || atual.tipo !== tipo) { atual = { tipo, itens: [] }; blocos.push(atual); }
        atual.itens.push(li[3].trim());
        continue;
      }
      if (atual && atual.tipo !== 'p' && /^\s+\S/.test(linha)) { atual.itens[atual.itens.length - 1] += ` ${linha.trim()}`; continue; }
      if (!atual || atual.tipo !== 'p') { atual = { tipo: 'p', linhas: [] }; blocos.push(atual); }
      atual.linhas.push(linha.trim());
    }
    return blocos;
  }

  return { ehNumero, brl, pct, inteiro, centavos, dataBR, somarDias, linha1, itens, vazioValor, preencher, parseMarkdown, inline };
});
