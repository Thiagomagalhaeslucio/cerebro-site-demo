// Parte de navegador das páginas de documento (/propostas, /contratos): monta a prévia a
// partir do markdown e liga Copiar texto, Baixar .md e Imprimir. Só DOM, sempre com
// textContent/createTextNode; nada é gravado.
(() => {
  'use strict';

  const { el, icone } = window.cerebro;
  const { parseMarkdown, inline } = window.Documentos;

  function textoNos(texto) {
    return inline(texto).map((p) => (p.forte ? el('strong', { textContent: p.texto }) : document.createTextNode(p.texto)));
  }

  // Blocos do markdown → nós DOM. Cada "##" abre uma <section>; a seção cujo título começa
  // com "Assinatura" leva a classe doc-assinaturas (a impressão a mantém inteira e junto do texto anterior).
  function montarDocumento(md) {
    const raiz = [];
    let secao = null;
    const poe = (no) => (secao ? secao.append(no) : raiz.push(no));
    for (const b of parseMarkdown(md)) {
      if (b.tipo === 'h' && b.nivel === 2) {
        secao = el('section', { class: /^assinatura/i.test(b.texto) ? 'doc-secao doc-assinaturas' : 'doc-secao' });
        raiz.push(secao);
        secao.append(el('h2', {}, ...textoNos(b.texto)));
      } else if (b.tipo === 'h') {
        poe(el(`h${Math.min(b.nivel, 3)}`, {}, ...textoNos(b.texto)));
      } else if (b.tipo === 'p') {
        poe(el('p', {}, ...b.linhas.flatMap((l, i) => [i ? el('br') : null, ...textoNos(l)]).filter(Boolean)));
      } else {
        poe(el(b.tipo, {}, ...b.itens.map((i) => el('li', {}, ...textoNos(i)))));
      }
    }
    return juntarAssinaturas(raiz);
  }

  // As assinaturas nunca ficam sozinhas numa página: o fim da seção anterior (o último bloco e o
  // título dele) entra com elas num <div class="doc-fim">, que a impressão não divide. Quando a
  // seção anterior só tem esse bloco, ela inteira vai junto.
  function juntarAssinaturas(raiz) {
    const i = raiz.findIndex((n) => n.classList && n.classList.contains('doc-assinaturas'));
    if (i < 1 || raiz[i - 1].tagName !== 'SECTION') return raiz;
    const ass = raiz[i];
    const anterior = raiz[i - 1];
    let unidade = [anterior.lastElementChild];
    const antes = unidade[0] && unidade[0].previousElementSibling;
    if (antes && /^H[1-6]$/.test(antes.tagName)) unidade.unshift(antes);
    if (anterior.children.length <= unidade.length) unidade = [anterior];
    const fim = el('div', { class: 'doc-fim' });
    if (unidade[0] === anterior) {
      raiz.splice(i - 1, 2, fim);
    } else {
      raiz.splice(i, 1);
      raiz.splice(i, 0, fim);
    }
    fim.append(...unidade, ass);
    return raiz;
  }

  // "proposta-site-de-exemplo.md": prefixo + o primeiro texto não vazio, sem acento e em minúsculas.
  function nomeArquivo(prefixo, ...candidatos) {
    const base = (candidatos.find((c) => c) || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
    return base ? `${prefixo}-${base}.md` : `${prefixo}.md`;
  }

  // Liga os botões #copiar, #baixar e #imprimir e o aviso #estado.
  // markdown(): o texto atual do documento; nome(): o nome do arquivo a baixar.
  function ligarAcoes({ markdown, nome }) {
    const $ = (id) => document.getElementById(id);
    let timer = null;
    const avisar = (texto) => {
      $('estado').textContent = texto;
      clearTimeout(timer);
      timer = setTimeout(() => { $('estado').textContent = ''; }, 3000);
    };
    async function copiar() {
      const md = markdown();
      if (!md) return;
      try {
        await navigator.clipboard.writeText(md);
      } catch {
        const area = el('textarea', { value: md });
        area.style.cssText = 'position:fixed;opacity:0';
        document.body.append(area);
        area.select();
        const feito = document.execCommand && document.execCommand('copy');
        area.remove();
        if (!feito) return avisar('Não deu para copiar neste navegador.');
      }
      avisar('Texto copiado.');
    }
    function baixar() {
      const md = markdown();
      if (!md) return;
      const url = URL.createObjectURL(new Blob([`${md}\n`], { type: 'text/markdown;charset=utf-8' }));
      const a = el('a', { href: url, download: nome() });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      avisar('Arquivo baixado.');
    }
    $('copiar').replaceChildren(icone('copy'), 'Copiar texto');
    $('baixar').replaceChildren(icone('download'), 'Baixar .md');
    $('imprimir').replaceChildren(icone('printer'), 'Imprimir');
    $('copiar').addEventListener('click', copiar);
    $('baixar').addEventListener('click', baixar);
    $('imprimir').addEventListener('click', () => window.print());
  }

  window.DocumentosPagina = { montarDocumento, nomeArquivo, ligarAcoes };
})();
