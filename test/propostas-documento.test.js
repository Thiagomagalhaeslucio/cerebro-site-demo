'use strict';

// Documento da proposta (public/propostas/documento.js e fragmento.js, os mesmos
// do navegador) com os valores inventados de test/fixtures/vault-exemplo.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { campos, preencher, parseMarkdown, inline, brl, pct, dataBR, somarDias, valorInicial } = require('../public/propostas/documento');
const { codificar, decodificar } = require('../public/propostas/fragmento');
const { calcular } = require('../public/orcamento/formula');
const { lerPropostas } = require('../src/areas/propostas/data');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const dados = lerPropostas(VAULT);
const P = Object.fromEntries(Object.entries(dados.parametros).map(([k, v]) => [k, v.valor]));
const perfil = dados.perfil.campos;
const FORM = {
  cliente: 'Cliente Exemplo Ltda', projeto: 'Site de exemplo', resumo: 'Um site simples.',
  escopo: '- Três páginas\nFormulário de contato\n\n', fora: '', entregaveis: 'Código-fonte\n* Manual curto',
  inicio: '2026-03-16', entrega: '2026-04-06', validade: 15,
};
const gerar = (extra = {}) => preencher(dados.modelo.texto, campos({ perfil, P, hoje: '2026-03-10', valor: 917, form: FORM, ...extra }));
const linhas = (md) => md.split('\n');

test('formatação: dinheiro em pt-BR, com espaço comum, e percentual', () => {
  assert.equal(brl(1234.5), 'R$ 1.234,50');
  assert.equal(brl(917), 'R$ 917,00');
  assert.ok(!brl(1234.5).includes(' '));
  assert.equal(pct(0.4), '40%');
  assert.equal(pct(0.125), '12,5%');
});

test('datas: dd/mm/aaaa e validade = data + dias (mês, ano e bissexto)', () => {
  assert.equal(dataBR('2026-03-10'), '10/03/2026');
  assert.equal(dataBR('2026-02-30'), '');
  assert.equal(dataBR('10/03/2026'), '');
  assert.equal(dataBR(''), '');
  assert.equal(somarDias('2026-03-10', 15), '2026-03-25');
  assert.equal(somarDias('2026-12-20', 15), '2027-01-04');
  assert.equal(somarDias('2028-02-20', 10), '2028-03-01');
  assert.equal(somarDias('2026-02-20', 10), '2026-03-02');
  assert.equal(somarDias('2026-03-10', 0), '2026-03-10');
  assert.equal(somarDias('lixo', 5), '');
  assert.equal(somarDias('2026-03-10', null), '');
});

test('valor proposto: recomendado arredondado para cima em reais', () => {
  assert.equal(valorInicial(825 / 0.9), 917); // 916,666...
  assert.equal(valorInicial(917), 917);
  assert.equal(valorInicial(917.0000000001), 917); // ruído de ponto flutuante
  assert.equal(valorInicial(917.01), 918);
  assert.equal(valorInicial(0.2), 1);
  assert.equal(valorInicial(0), null);
  assert.equal(valorInicial(null), null);
  assert.equal(valorInicial(NaN), null);
  assert.equal(valorInicial(calcular(P, { horas: 10, mult: 1.5 }).recomendado.valor), 917);
});

test('campos calculados a partir do valor proposto, do perfil e dos parâmetros', () => {
  const c = campos({ perfil, P, hoje: '2026-03-10', valor: 917, form: FORM });
  assert.equal(c.valor_total, 'R$ 917,00');
  assert.equal(c.entrada_percentual, '40%');
  assert.equal(c.entrada_valor, 'R$ 366,80');
  assert.equal(c.saldo_valor, 'R$ 550,20');
  assert.equal(c.revisoes_incluidas, '2');
  assert.equal(c.revisao_extra_valor, 'R$ 150,00'); // 3 h × valor/hora; só o produto sai
  assert.equal(c.garantia_dias, '45');
  assert.equal(c.prazo_resposta_dias, '3');
  assert.equal(c.data, '10/03/2026');
  assert.equal(c.validade_data, '25/03/2026');
  assert.equal(c.inicio, '16/03/2026');
  assert.equal(c.entrega, '06/04/2026');
  assert.equal(c.prestador_nome, 'Estúdio Exemplo, por Marina Exemplo da Silva');
  assert.equal(c.prestador_contato, 'contato@exemplo.test, WhatsApp (11) 90000-0000');
  assert.deepEqual(c.escopo, ['Três páginas', 'Formulário de contato']);
  assert.deepEqual(c.entregaveis, ['Código-fonte', 'Manual curto']);
  assert.deepEqual(c.fora_do_escopo, []);
});

test('campos: sem nome comercial usa o nome; contato com um só meio; sem valor, sem dinheiro', () => {
  const c = campos({ perfil: { nome: 'Fulana Exemplo', email: '', whatsapp: '(11) 90000-0000' }, P, hoje: '2026-03-10', valor: null, form: {} });
  assert.equal(c.prestador_nome, 'Fulana Exemplo');
  const so = campos({ perfil: { nome_comercial: 'Estúdio X' }, P, hoje: '2026-03-10', valor: null, form: {} });
  assert.equal(so.prestador_nome, 'Estúdio X');
  assert.equal(c.prestador_contato, 'WhatsApp (11) 90000-0000');
  assert.deepEqual([c.valor_total, c.entrada_valor, c.saldo_valor], ['', '', '']);
  assert.equal(c.validade_data, ''); // sem validade informada
});

test('modelo: preenche {{campo}} e omite linha com campo vazio', () => {
  const md = gerar();
  const ls = linhas(md);
  assert.equal(ls[0], '# Proposta: Site de exemplo');
  for (const esperada of [
    'Para: Cliente Exemplo Ltda', 'De: Estúdio Exemplo, por Marina Exemplo da Silva', 'Data: 10/03/2026', 'Válida até: 25/03/2026',
    '- Três páginas', '- Formulário de contato', '- Código-fonte', '- Manual curto',
    'Início previsto: 16/03/2026', 'Entrega prevista: 06/04/2026', 'Valor total: **R$ 917,00**',
    'Entrada (40%): R$ 366,80', 'Saldo na entrega: R$ 550,20',
    '- Revisões: 2 rodadas incluídas. Cada rodada extra custa R$ 150,00.', '- Garantia de 45 dias para correção de erros da entrega.',
    'Contato: contato@exemplo.test, WhatsApp (11) 90000-0000',
  ]) assert.ok(ls.includes(esperada), esperada);
  assert.ok(!md.includes('{{'));
  // fora do escopo vazio: o título também some
  assert.ok(!md.includes('Fora do escopo'));
  assert.ok(md.includes('## Escopo'));
  assert.ok(!/\n{3,}/.test(md));
});

test('modelo: sem datas, sem valor e sem resumo, as linhas e as seções vazias somem', () => {
  const md = gerar({ valor: null, form: { cliente: 'Cliente Exemplo Ltda', projeto: 'Site de exemplo' } });
  for (const sumiu of ['Início previsto', 'Entrega prevista', 'Valor total', 'Entrada (', 'Saldo', 'Válida até', '## Visão geral', '## Escopo', '## Entregáveis']) {
    assert.ok(!md.includes(sumiu), sumiu);
  }
  assert.ok(md.includes('## Prazo')); // ainda tem o texto fixo
  assert.ok(md.includes('Para: Cliente Exemplo Ltda'));
});

test('modelo: linha recuada que continua um item some junto com ele', () => {
  const md = gerar();
  assert.ok(md.includes('- Respostas do cliente em até 3 dias;\n  atrasos deslocam a entrega.'));
  const sem = preencher(dados.modelo.texto, { ...campos({ perfil, P, hoje: '2026-03-10', valor: 917, form: FORM }), prazo_resposta_dias: '' });
  assert.ok(!sem.includes('Respostas'));
  assert.ok(!sem.includes('atrasos deslocam'));
  assert.ok(sem.includes('- Garantia'));
});

test('modelo: lista no meio de uma linha vira texto separado por vírgula; campo desconhecido omite a linha', () => {
  const c = campos({ perfil, P, hoje: '2026-03-10', valor: 917, form: FORM });
  assert.equal(preencher('Itens: {{escopo}}', c), 'Itens: Três páginas, Formulário de contato');
  assert.equal(preencher('A\n{{inventado}}\nB: {{constructor}}\nC', c), 'A\nC');
});

test('markdown: títulos, parágrafos com quebra, listas e negrito', () => {
  const blocos = parseMarkdown('# T\n\nPara: A\nDe: B\n\n## S\n- um\n- dois\n  continua\n1. x\n2) y\n\nValor: **R$ 1,00** fim');
  assert.deepEqual(blocos, [
    { tipo: 'h', nivel: 1, texto: 'T' },
    { tipo: 'p', linhas: ['Para: A', 'De: B'] },
    { tipo: 'h', nivel: 2, texto: 'S' },
    { tipo: 'ul', itens: ['um', 'dois continua'] },
    { tipo: 'ol', itens: ['x', 'y'] },
    { tipo: 'p', linhas: ['Valor: **R$ 1,00** fim'] },
  ]);
  assert.deepEqual(inline('a **b** c'), [{ texto: 'a ', forte: false }, { texto: 'b', forte: true }, { texto: ' c', forte: false }]);
  assert.deepEqual(inline('<b>x</b>'), [{ texto: '<b>x</b>', forte: false }]); // HTML não é interpretado
});

test('fragmento: ida e volta, só campos conhecidos e válidos', () => {
  const h = codificar({ projeto: 'Site & loja = 100%', escopo: 'a\nb', horas: 12.5, urgente: true, inicio: '2026-03-16', vazio: '', nulo: null });
  assert.ok(h.startsWith('#'));
  assert.deepEqual(decodificar(h), { projeto: 'Site & loja = 100%', escopo: 'a\nb', horas: '12.5', urgente: '1', inicio: '2026-03-16' });
  assert.equal(codificar({}), '');
  assert.deepEqual(decodificar(''), {});
  assert.deepEqual(decodificar('#'), {});
});

test('fragmento: descarta o que não é do formulário ou está malformado', () => {
  const d = decodificar('#cliente=Ana&hack=1&__proto__=x&constructor=y&inicio=amanhã&entrega=2026-04-06&horas=abc&km=-3&viagens=2&urgente=sim&projeto=%E0%A4%A');
  assert.equal(d.cliente, 'Ana');
  assert.equal(d.entrega, '2026-04-06');
  assert.equal(d.viagens, '2');
  for (const k of ['hack', '__proto__', 'constructor', 'inicio', 'horas', 'km', 'urgente']) assert.ok(!Object.prototype.hasOwnProperty.call(d, k), k);
  assert.ok(!('projeto' in d) || typeof d.projeto === 'string'); // percent-encoding quebrado não lança
  assert.equal(Object.getPrototypeOf(d), Object.prototype);
  assert.equal(decodificar('#cliente=' + 'x'.repeat(9000)).cliente.length, 5000);
});

test('vazamento: o documento completo não tem piso, valor/hora nem margem de risco', () => {
  // Cenário do orçamento: 10 h × 1,5, urgente, deslocamento e revisão extra; tudo calculado.
  const r = calcular(P, { horas: 10, mult: 1.5, urgente: true, viagens: 2, km: 30, horasViagem: 1, revisoesExtras: 1, terceiros: 80 });
  const valor = valorInicial(r.recomendado.valor);
  const md = gerar({ valor });
  assert.ok(md.includes(`Valor total: **${brl(valor)}**`)); // o documento é o completo, não um vazio

  // Valores da fixture: valor/hora 50, piso 30 por hora, margem de risco 10%, e o piso do cenário.
  const proibidos = [brl(P.valor_hora), brl(P.valor_hora_piso), brl(r.piso.valor), brl(Math.round(r.piso.valor * 100) / 100)];
  for (const p of proibidos) assert.ok(!md.includes(p), `vazou ${p}`);
  assert.ok(!/(?<![\d.,])R\$\s?(50|30)(,00)?(?!\d)/.test(md), 'valor/hora ou piso por hora');
  assert.ok(!/(?<![\d,.])(10|0,1|0\.1)\s?%/.test(md), 'margem de risco');
  assert.ok(!/(?<![\d,.])0[.,]10?(?!\d)/.test(md), 'margem como fração');
  for (const palavra of ['piso', 'margem', 'valor/hora', 'valor_hora', 'composi', 'Informativo', 'Mínimo aceito', 'Margem de risco']) {
    assert.ok(!md.toLowerCase().includes(palavra.toLowerCase()), palavra);
  }
  // só sai valor em reais que é o total, a entrada, o saldo ou a rodada extra
  const reais = md.match(/R\$ [\d.]+,\d{2}/g).sort();
  assert.deepEqual([...new Set(reais)].sort(), [brl(valor), brl(Math.round(valor * 0.4 * 100) / 100), brl(valor - Math.round(valor * 0.4 * 100) / 100), 'R$ 150,00'].sort());
});

test('vazamento: um modelo que pede piso, valor/hora ou margem não consegue', () => {
  const c = campos({ perfil, P, hoje: '2026-03-10', valor: 917, form: FORM });
  const maldoso = ['# T', 'Piso: {{piso}}', 'Hora: {{valor_hora}}', 'Hora piso: {{valor_hora_piso}}', 'Margem: {{margem_risco}}', 'Obs: {{obs}}', 'Total: {{valor_total}}'].join('\n');
  const md = preencher(maldoso, c);
  assert.equal(md, '# T\nTotal: R$ 917,00');
  assert.deepEqual(Object.keys(c).sort(), [
    'cliente', 'data', 'entrada_percentual', 'entrada_valor', 'entrega', 'entregaveis', 'escopo', 'fora_do_escopo', 'garantia_dias', 'inicio',
    'prazo_resposta_dias', 'prestador_contato', 'prestador_nome', 'projeto', 'resumo', 'revisao_extra_valor', 'revisoes_incluidas',
    'saldo_valor', 'validade_data', 'valor_total',
  ]);
});

// ---------- motor compartilhado: blocos, citações e texto antes do primeiro título ----------
test('motor: {{#se campo}} liga e desliga um bloco; marcas em linha própria somem', () => {
  const modelo = ['# T', 'antes', '{{#se extra}}', 'Cláusula extra: {{motivo}}', '', '- item', '{{/se}}', 'depois'].join('\n');
  assert.equal(preencher(modelo, { extra: true, motivo: 'porque sim' }), '# T\nantes\nCláusula extra: porque sim\n\n- item\ndepois');
  assert.equal(preencher(modelo, { extra: false, motivo: 'porque sim' }), '# T\nantes\ndepois');
  assert.equal(preencher(modelo, { motivo: 'x' }), '# T\nantes\ndepois'); // campo desconhecido = desligado
  assert.equal(preencher(modelo, { extra: [], motivo: 'x' }), '# T\nantes\ndepois'); // lista vazia = desligado
  assert.equal(preencher(modelo, { extra: 'sim', motivo: 'x' }), '# T\nantes\nCláusula extra: x\n\n- item\ndepois');
});

test('motor: linha com campo vazio some também dentro de bloco ligado; bloco desligado não avalia campos', () => {
  const modelo = '# T\n{{#se a}}\nUm: {{x}}\nDois: {{y}}\n{{/se}}\nFim';
  assert.equal(preencher(modelo, { a: true, x: '1', y: '' }), '# T\nUm: 1\nFim');
  assert.equal(preencher(modelo, { a: false, x: '1', y: '2' }), '# T\nFim');
});

test('motor: seção que só tinha um bloco desligado perde o título', () => {
  const modelo = '# T\n\n## Extra\n{{#se a}}\nTexto\n{{/se}}\n\n## Fixa\nSempre';
  assert.equal(preencher(modelo, { a: false }), '# T\n\n## Fixa\nSempre');
  assert.equal(preencher(modelo, { a: true }), '# T\n\n## Extra\nTexto\n\n## Fixa\nSempre');
});

test('motor: sem aninhamento; marca solta ou fora de linha própria é omitida, nunca impressa', () => {
  // a segunda abertura substitui a primeira; o primeiro {{/se}} encerra o bloco
  assert.equal(preencher('# T\n{{#se a}}\nA\n{{#se b}}\nB\n{{/se}}\nC\n{{/se}}\nD', { a: true, b: false }), '# T\nA\nC\nD');
  assert.equal(preencher('# T\n{{/se}}\nA', {}), '# T\nA');
  assert.equal(preencher('# T\nTexto {{#se a}} no meio\nB', { a: true }), '# T\nB');
  assert.equal(preencher('# T\n{{#se a}}\nsem fechar\nB', { a: false }), '# T'); // bloco aberto vai até o fim
});

test('motor: linhas de citação e o texto antes do primeiro título não entram', () => {
  const modelo = ['Nota solta antes do título', '> citação antes', '# Título', '> nota para quem edita {{x}}', 'Corpo {{x}}', '  > citação recuada', '## Sec', 'Texto'].join('\n');
  assert.equal(preencher(modelo, { x: '1' }), '# Título\nCorpo 1\n## Sec\nTexto');
  // sem nenhum título não há o que cortar: só as citações saem
  assert.equal(preencher('Olá {{x}}\n> nota', { x: 'a' }), 'Olá a');
});

test('motor: subseção ("###") não esvazia a seção; seção só de subseções vazias some inteira', () => {
  assert.equal(preencher('# T\n## A\n### A1\n{{x}}\n### A2\nTexto', { x: 'um' }), '# T\n## A\n### A1\num\n### A2\nTexto');
  assert.equal(preencher('# T\n## A\n### A1\n{{x}}\n### A2\n{{y}}\n## B\nFim', { x: '', y: '' }), '# T\n## B\nFim');
  assert.equal(preencher('# T\n## A\n### A1\n{{x}}\n### A2\nTexto', { x: '' }), '# T\n## A\n### A2\nTexto');
});
