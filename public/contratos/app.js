(() => {
  'use strict';

  const { el, avisos } = window.cerebro;
  const { campos, avisosDocumentos } = window.Contratos;
  const { preencher } = window.Documentos;
  const { montarDocumento, nomeArquivo, ligarAcoes } = window.DocumentosPagina;
  const $ = (id) => document.getElementById(id);

  // Dos CPF, CNPJ e endereços digitados só existe a memória desta página: nada vai para a URL,
  // para o armazenamento do navegador nem para o servidor.
  const TEXTOS = ['contratado_nome', 'contratado_cpf', 'contratado_endereco', 'contratado_email', 'contratante_nome', 'contratante_tipo', 'contratante_documento',
    'contratante_endereco', 'contratante_representante', 'contratante_email', 'projeto', 'valor', 'entrada', 'forma_pagamento', 'inicio', 'entrega',
    'escopo', 'fora', 'entregaveis', 'foro', 'dados_tratados'];
  const OPCOES = ['sob_medida', 'trata_dados', 'testemunhas', 'minuta'];

  let dados = { parametros: {}, perfil: { campos: {} }, modelo: { texto: '' }, propostas: [], hoje: null, avisos: [] };
  let markdownAtual = '';
  let iniciado = false; // os padrões (perfil, foro, entrada) entram só na primeira leitura

  const hoje = () => dados.hoje || new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD local
  const parametros = () => Object.fromEntries(Object.entries(dados.parametros).map(([k, v]) => [k, v.valor]));
  const numero = (id) => {
    const v = $(id).valueAsNumber;
    return Number.isFinite(v) && v > 0 ? v : null;
  };

  function lerForm() {
    const f = {};
    for (const id of TEXTOS) f[id] = $(id).value;
    for (const id of OPCOES) f[id] = $(id).checked;
    const ent = numero('entrada');
    return {
      ...f,
      contratante_tipo: $('contratante_tipo').value,
      valor: numero('valor'),
      entrada: ent == null ? null : ent / 100,
    };
  }

  // ---------- proposta aceita ----------
  function montarPropostas() {
    const atual = $('proposta').value;
    const tem = dados.propostas.length > 0;
    $('campo-proposta').hidden = !tem;
    $('sem-proposta').hidden = tem;
    $('proposta').replaceChildren(el('option', { value: '', textContent: 'Preencher à mão' }),
      ...dados.propostas.map((p, i) => el('option', { value: String(i), textContent: p.rotulo })));
    if (tem && dados.propostas[Number(atual)] && atual !== '') $('proposta').value = atual;
  }

  function aoEscolherProposta() {
    const p = dados.propostas[Number($('proposta').value)];
    if (!p) { $('proposta-dica').textContent = ''; return atualizar(); }
    // Só entra o que a proposta tem; campo ausente fica como está e o aviso dela já está no topo.
    if (p.cliente != null) $('contratante_nome').value = p.cliente;
    if (p.projeto != null) $('projeto').value = p.projeto;
    if (p.valor != null) $('valor').value = String(p.valor);
    if (p.entrada_percentual != null) $('entrada').value = String(Math.round(p.entrada_percentual * 10000) / 100);
    if (p.inicio != null) $('inicio').value = p.inicio;
    if (p.entrega != null) $('entrega').value = p.entrega;
    $('escopo').value = p.escopo.join('\n');
    $('fora').value = p.fora_do_escopo.join('\n');
    $('entregaveis').value = p.entregaveis.join('\n');
    $('proposta-dica').textContent = p.ausentes.length ? `Faltam na proposta: ${p.ausentes.join(', ')}. Preencha à mão.` : `Dados de ${p.arquivo}.`;
    atualizar();
  }

  // Padrões da primeira leitura: o que o arquivo de origem já sabe e a pessoa não digitou.
  function aplicarPadroes() {
    const perfil = dados.perfil.campos;
    const poe = (id, valor) => { if ($(id).value === '' && valor != null && valor !== '') $(id).value = String(valor); };
    poe('contratado_nome', perfil.nome);
    poe('contratado_email', perfil.email);
    poe('foro', perfil.cidade_uf); // o foro padrão é a cidade do perfil; sem ela, fica vazio e avisa
    const ent = dados.parametros.entrada?.valor;
    poe('entrada', ent != null ? Math.round(ent * 10000) / 100 : '');
    $('entrada-dica').textContent = ent != null ? `Padrão do arquivo de parâmetros: ${Math.round(ent * 10000) / 100}%.` : 'O parâmetro entrada está a definir; digite a porcentagem.';
  }

  // ---------- avisos de CPF e CNPJ: só avisam ----------
  function pintarAvisos(f) {
    const a = avisosDocumentos(f);
    for (const [id, texto] of [['contratado_cpf-aviso', a.contratado], ['contratante_documento-aviso', a.contratante]]) {
      $(id).hidden = !texto;
      $(id).textContent = texto;
    }
  }

  // ---------- documento ----------
  function atualizar() {
    const f = lerForm();
    $('campo-representante').hidden = f.contratante_tipo !== 'CNPJ';
    $('campo-dados').hidden = !f.trata_dados;
    $('foro-aviso').hidden = f.foro.trim() !== '';
    pintarAvisos(f);
    const c = campos({ P: parametros(), hoje: hoje(), form: f });
    markdownAtual = dados.modelo.texto ? preencher(dados.modelo.texto, c) : '';
    $('doc').replaceChildren(...(markdownAtual
      ? montarDocumento(markdownAtual)
      : [el('p', { class: 'doc-vazio', textContent: dados.modelo.existe === false ? 'Sem modelo: crie 70-negocio/modelos/contrato.md.' : 'O modelo está vazio.' })]));
    for (const id of ['copiar', 'baixar', 'imprimir']) $(id).disabled = !markdownAtual;
  }

  ligarAcoes({ markdown: () => markdownAtual, nome: () => nomeArquivo('contrato', $('projeto').value, $('contratante_nome').value) });
  $('proposta').addEventListener('change', aoEscolherProposta);
  for (const id of [...TEXTOS, ...OPCOES]) {
    $(id).addEventListener('input', atualizar);
    $(id).addEventListener('change', atualizar);
  }

  async function carregar() {
    try {
      const r = await fetch('/api/contratos', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || `HTTP ${r.status}`);
      dados = j;
      $('meta').textContent = `Lido às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      avisos($('avisos'), j.avisos);
      montarPropostas();
      if (!iniciado) { aplicarPadroes(); iniciado = true; }
      atualizar();
    } catch (e) {
      avisos($('avisos'), [`Não deu para ler os dados do contrato (${e.message}).`], true);
      $('meta').textContent = 'Falha ao ler o vault';
    }
  }
  carregar();
  window.aoVivo('contratos', carregar);
})();
