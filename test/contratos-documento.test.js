'use strict';

// Documento do contrato (public/contratos/documento.js, o mesmo do navegador) com o modelo e os
// valores inventados de test/fixtures/vault-exemplo.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { campos, avisosDocumentos, cpfValido, cnpjValido, formatarCPF, formatarCNPJ } = require('../public/contratos/documento');
const { preencher, brl } = require('../public/documentos/modelo');
const { lerContratos } = require('../src/areas/contratos/data');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const dados = lerContratos(VAULT);
const P = Object.fromEntries(Object.entries(dados.parametros).map(([k, v]) => [k, v.valor]));
const prop = dados.propostas[0];

// O que a página monta ao escolher a proposta aceita e preencher as partes à mão.
const FORM = {
  contratado_nome: 'Marina Exemplo da Silva', contratado_cpf: '52998224725', contratado_endereco: 'Rua Exemplo, 100, Cidade Exemplo/EX', contratado_email: 'contato@exemplo.test',
  contratante_nome: prop.cliente, contratante_tipo: 'CNPJ', contratante_documento: '11222333000181', contratante_endereco: 'Av. Exemplo, 200, Cidade Exemplo/EX',
  contratante_representante: 'Beatriz Exemplo', contratante_email: 'financeiro@loja-exemplo.test',
  projeto: prop.projeto, valor: prop.valor, entrada: prop.entrada_percentual, inicio: prop.inicio, entrega: prop.entrega,
  escopo: prop.escopo.join('\n'), fora: prop.fora_do_escopo.join('\n'), entregaveis: prop.entregaveis.join('\n'),
  forma_pagamento: 'Pix, entrada em 20/03/2026 e saldo na entrega', foro: 'Cidade Exemplo/EX',
  sob_medida: true, trata_dados: true, dados_tratados: 'nome e telefone dos clientes da loja', testemunhas: true, minuta: true,
};
const gerar = (extra = {}, form = {}) => preencher(dados.modelo.texto, campos({ P, hoje: '2026-03-10', form: { ...FORM, ...form }, ...extra }));
const linhas = (md) => md.split('\n');

test('CPF: dígitos verificadores, formatação e casos que não valem', () => {
  assert.equal(cpfValido('529.982.247-25'), true);
  assert.equal(cpfValido('52998224725'), true);
  assert.equal(cpfValido('529.982.247-26'), false); // dígito errado
  assert.equal(cpfValido('529.982.247-52'), false); // dígitos trocados
  assert.equal(cpfValido('111.111.111-11'), false); // repetido passa na conta, mas não vale
  assert.equal(cpfValido('5299822472'), false); // curto
  assert.equal(cpfValido('529982247250'), false); // longo
  assert.equal(cpfValido(''), false);
  assert.equal(formatarCPF('52998224725'), '529.982.247-25');
  assert.equal(formatarCPF('529.982.247-25'), '529.982.247-25');
  assert.equal(formatarCPF('  123  '), '123'); // tamanho errado: devolve o digitado
});

test('CNPJ: numérico e alfanumérico, formatação e casos que não valem', () => {
  assert.equal(cnpjValido('11.222.333/0001-81'), true);
  assert.equal(cnpjValido('11222333000181'), true);
  assert.equal(cnpjValido('11.222.333/0001-82'), false);
  assert.equal(cnpjValido('11.222.333/0001-18'), false);
  assert.equal(cnpjValido('00.000.000/0000-00'), false);
  assert.equal(cnpjValido('1122233300018'), false);
  assert.equal(cnpjValido('12.ABC.345/01DE-35'), true); // exemplo oficial do CNPJ alfanumérico
  assert.equal(cnpjValido('12abc34501de35'), true); // minúsculas valem
  assert.equal(cnpjValido('12.ABC.345/01DE-36'), false);
  assert.equal(cnpjValido('12.ABC.345/01DE-3A'), false); // os dois últimos são sempre dígitos
  assert.equal(formatarCNPJ('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatarCNPJ('12abc34501de35'), '12.ABC.345/01DE-35');
  assert.equal(formatarCNPJ('123'), '123');
});

test('avisos dos documentos: só avisam; vazio não avisa; o tipo escolhe a conferência', () => {
  assert.deepEqual(avisosDocumentos({}), { contratado: '', contratante: '' });
  assert.deepEqual(avisosDocumentos(FORM), { contratado: '', contratante: '' });
  const ruim = avisosDocumentos({ contratado_cpf: '111.111.111-11', contratante_tipo: 'CNPJ', contratante_documento: '11.222.333/0001-82' });
  assert.match(ruim.contratado, /^Este CPF não passa/);
  assert.match(ruim.contratante, /^Este CNPJ não passa/);
  assert.deepEqual(avisosDocumentos({ contratante_tipo: 'CPF', contratante_documento: '529.982.247-25' }), { contratado: '', contratante: '' });
  assert.match(avisosDocumentos({ contratante_tipo: 'CPF', contratante_documento: '11.222.333/0001-81' }).contratante, /^Este CPF/);
});

test('campos: calculados (entrada, saldo, rodada extra) e formatados', () => {
  const c = campos({ P, hoje: '2026-03-10', form: FORM });
  assert.equal(c.valor_total, 'R$ 2.500,00');
  assert.equal(c.entrada_percentual, '40%');
  assert.equal(c.entrada_valor, 'R$ 1.000,00');
  assert.equal(c.saldo_valor, 'R$ 1.500,00');
  assert.equal(c.revisao_extra_valor, 'R$ 150,00'); // 3 h × valor/hora; só o produto sai
  assert.equal(c.revisoes_incluidas, '2');
  assert.equal(c.garantia_dias, '45');
  assert.equal(c.hora_avulsa, 'R$ 60,00');
  assert.equal(c.prazo_resposta_dias, '3');
  assert.equal(c.data, '10/03/2026');
  assert.equal(c.inicio, '16/03/2026');
  assert.equal(c.entrega, '13/04/2026');
  assert.equal(c.contratado_cpf, '529.982.247-25');
  assert.equal(c.contratante_documento_tipo, 'CNPJ');
  assert.equal(c.contratante_documento, '11.222.333/0001-81');
  assert.deepEqual(c.escopo, prop.escopo);
  assert.deepEqual([c.sistema_sob_medida, c.trata_dados, c.testemunhas, c.minuta], [true, true, true, true]);
});

test('campos: representante só para CNPJ; CPF do contratante formatado; sem valor, sem dinheiro', () => {
  const pf = campos({ P, hoje: '2026-03-10', form: { ...FORM, contratante_tipo: 'CPF', contratante_documento: '52998224725' } });
  assert.equal(pf.contratante_representante, '');
  assert.equal(pf.contratante_documento_tipo, 'CPF');
  assert.equal(pf.contratante_documento, '529.982.247-25');
  const vazio = campos({ P, hoje: '2026-03-10', form: {} });
  assert.deepEqual([vazio.valor_total, vazio.entrada_valor, vazio.saldo_valor, vazio.entrada_percentual], ['', '', '', '']);
  assert.deepEqual([vazio.sistema_sob_medida, vazio.trata_dados, vazio.testemunhas, vazio.minuta], [false, false, false, false]);
  assert.equal(campos({ P, hoje: '2026-03-10', form: { valor: 100, entrada: 1.5 } }).entrada_valor, ''); // entrada fora de 0 a 1 não vale
  assert.equal(campos({ P: { ...P, valor_hora: null }, hoje: '2026-03-10', form: {} }).revisao_extra_valor, '');
});

test('modelo: documento completo, sem citação, sem texto antes do título e sem {{', () => {
  const md = gerar();
  const ls = linhas(md);
  assert.equal(ls[0], '# Contrato de prestação de serviços');
  assert.ok(!md.includes('Texto de exemplo') && !md.includes('{{') && !md.includes('{#') && !md.includes('/se'));
  for (const esperada of [
    '**MINUTA: ainda não revisada por advogado.**',
    '**Contratado:** Marina Exemplo da Silva', 'CPF: 529.982.247-25', 'Endereço: Rua Exemplo, 100, Cidade Exemplo/EX', 'E-mail: contato@exemplo.test',
    '**Contratante:** Loja Exemplo Ltda', 'CNPJ: 11.222.333/0001-81', 'Representante legal: Beatriz Exemplo',
    'O Contratado desenvolverá para o Contratante o projeto "Site institucional", conforme o Anexo I.',
    'O sistema é feito sob medida e substitui uma assinatura paga; não há mensalidade de licença.',
    'Valor total: **R$ 2.500,00**', 'Entrada (40%): R$ 1.000,00', 'Saldo na entrega: R$ 1.500,00',
    'Forma de pagamento: Pix, entrada em 20/03/2026 e saldo na entrega',
    'Início previsto: 16/03/2026', 'Entrega prevista: 13/04/2026',
    '- 2 rodadas de revisão incluídas; cada rodada extra custa R$ 150,00.', '- Garantia de 45 dias para correção de erros da entrega.',
    '- Horas avulsas fora do escopo: R$ 60,00 por hora.',
    '## 7. Proteção de dados (LGPD)', 'O sistema trata dados pessoais: nome e telefone dos clientes da loja',
    'Fica eleito o foro de Cidade Exemplo/EX.', 'Cidade Exemplo/EX, 10/03/2026.', 'Testemunhas:',
    '## Anexo I: escopo', '### Escopo', '- Formulário de contato', '### Fora do escopo', '- Loja virtual', '### Entregáveis', '- Código-fonte',
  ]) assert.ok(ls.includes(esperada), esperada);
  assert.ok(!/\n{3,}/.test(md));
});

test('blocos: minuta, sistema sob medida, dados pessoais e testemunhas ligam e desligam', () => {
  const off = gerar({}, { minuta: false, sob_medida: false, trata_dados: false, testemunhas: false });
  for (const sumiu of ['MINUTA', 'sob medida', 'assinatura paga', 'LGPD', 'O sistema trata dados pessoais', 'Testemunhas', 'Nome:']) assert.ok(!off.includes(sumiu), sumiu);
  assert.ok(off.includes('## 12. Assinaturas') && off.includes('Contratado\n') && off.includes('Contratante'));
  // cada opção sozinha liga só o seu bloco
  assert.ok(gerar({}, { minuta: false, sob_medida: false, trata_dados: false }).includes('Testemunhas:'));
  assert.ok(gerar({}, { minuta: false, testemunhas: false, trata_dados: false }).includes('substitui uma assinatura paga'));
  assert.ok(gerar({}, { sob_medida: false, testemunhas: false, trata_dados: false }).startsWith('# Contrato de prestação de serviços\n**MINUTA'));
  const dp = gerar({}, { minuta: false, sob_medida: false, testemunhas: false });
  assert.ok(dp.includes('## 7. Proteção de dados (LGPD)') && dp.includes('LGPD'));
  // dados pessoais ligado sem a descrição: a linha dela some, o resto do bloco fica
  const semDesc = gerar({}, { dados_tratados: '' });
  assert.ok(semDesc.includes('## 7. Proteção de dados (LGPD)') && !semDesc.includes('O sistema trata dados pessoais:'));
});

test('cláusulas numeradas de 1 a 13 sem pulo, com a opção de dados ligada e desligada; nunca as duas versões da 7', () => {
  for (const trata of [true, false]) {
    const md = gerar({}, { trata_dados: trata });
    const nums = linhas(md).map((l) => /^## (\d+)\. /.exec(l)).filter(Boolean).map((m) => Number(m[1]));
    assert.deepEqual(nums, Array.from({ length: 13 }, (_, i) => i + 1), `trata_dados=${trata}`);
    const setes = linhas(md).filter((l) => l.startsWith('## 7. '));
    assert.equal(setes.length, 1);
    assert.equal(setes[0].includes('LGPD'), trata);
    assert.equal(md.includes('não trata dados pessoais'), !trata);
  }
  assert.equal(campos({ P, form: { trata_dados: false } }).nao_trata_dados, true);
  assert.equal(campos({ P, form: { trata_dados: true } }).nao_trata_dados, false);
});

test('modelo: representante só aparece para CNPJ; linha com campo vazio some', () => {
  const pf = gerar({}, { contratante_tipo: 'CPF', contratante_documento: '52998224725' });
  assert.ok(pf.includes('CPF: 529.982.247-25') && !pf.includes('Representante legal'));
  const sem = gerar({}, { contratado_endereco: '', contratante_email: '', forma_pagamento: '', valor: null, inicio: '', foro: '' });
  for (const sumiu of ['Endereço: Rua', 'E-mail: financeiro', 'Forma de pagamento', 'Valor total', 'Entrada (', 'Saldo', 'Início previsto', '## 13. Foro', 'Fica eleito']) assert.ok(!sem.includes(sumiu), sumiu);
  assert.ok(sem.includes('Entrega prevista: 13/04/2026'));
  assert.ok(sem.includes('## 12. Assinaturas'));
});

test('Anexo I: escopo, fora do escopo e entregáveis da proposta; seção vazia perde o título', () => {
  const md = gerar();
  for (const item of [...prop.escopo, ...prop.fora_do_escopo, ...prop.entregaveis]) assert.ok(md.includes(`- ${item}`), item);
  const sem = gerar({}, { fora: '' });
  assert.ok(!sem.includes('### Fora do escopo') && sem.includes('### Escopo') && sem.includes('### Entregáveis'));
  const nada = gerar({}, { escopo: '', fora: '', entregaveis: '' });
  assert.ok(!nada.includes('## Anexo I') && !nada.includes('### '));
});

test('vazamento: o documento completo não tem piso, margem, valor/hora nem composição', () => {
  const md = gerar();
  assert.ok(md.includes('Valor total: **R$ 2.500,00**')); // é o documento completo, não um vazio
  // valor/hora 50, piso 30 por hora, margem de risco 10%, imposto, deslocamento
  for (const p of [brl(P.valor_hora), brl(dados.parametros.valor_hora.valor), 'R$ 30,00']) assert.ok(!md.includes(p), `vazou ${p}`);
  assert.ok(!/(?<![\d.,])R\$\s?(50|30)(,00)?(?!\d)/.test(md), 'valor/hora ou piso por hora');
  assert.ok(!/(?<![\d,.])(10|0,1|0\.1)\s?%/.test(md), 'margem de risco');
  for (const palavra of ['piso', 'margem', 'valor/hora', 'valor_hora', 'composi', 'imposto', 'urgência', 'Informativo']) {
    assert.ok(!md.toLowerCase().includes(palavra.toLowerCase()), palavra);
  }
  // só sai dinheiro que é o total, a entrada, o saldo, a rodada extra ou a hora avulsa
  assert.deepEqual([...new Set(md.match(/R\$ [\d.]+,\d{2}/g))].sort(), ['R$ 1.000,00', 'R$ 1.500,00', 'R$ 150,00', 'R$ 2.500,00', 'R$ 60,00'].sort());
});

test('vazamento: um modelo que pede piso, valor/hora ou margem não consegue; os campos são só estes', () => {
  const c = campos({ P, hoje: '2026-03-10', form: FORM });
  const maldoso = ['# T', 'Piso: {{piso}}', 'Hora: {{valor_hora}}', 'Hora piso: {{valor_hora_piso}}', 'Margem: {{margem_risco}}', 'Imposto: {{imposto}}', 'Total: {{valor_total}}',
    '{{#se valor_hora}}', 'Bloco por valor/hora', '{{/se}}'].join('\n');
  assert.equal(preencher(maldoso, c), '# T\nTotal: R$ 2.500,00');
  assert.deepEqual(Object.keys(c).sort(), [
    'contratado_cpf', 'contratado_email', 'contratado_endereco', 'contratado_nome',
    'contratante_documento', 'contratante_documento_tipo', 'contratante_email', 'contratante_endereco', 'contratante_nome', 'contratante_representante',
    'data', 'dados_tratados', 'entrada_percentual', 'entrada_valor', 'entrega', 'entregaveis', 'escopo', 'fora_do_escopo', 'foro', 'forma_pagamento', 'garantia_dias',
    'hora_avulsa', 'inicio', 'minuta', 'prazo_resposta_dias', 'projeto', 'revisao_extra_valor', 'revisoes_incluidas', 'saldo_valor', 'sistema_sob_medida',
    'nao_trata_dados', 'testemunhas', 'trata_dados', 'valor_total',
  ].sort());
});
