'use strict';

// Contratos: leitura do modelo, do perfil, dos parâmetros e das propostas aceitas, com o
// vault de exemplo (valores inventados) e vaults temporários; depois, a área no servidor.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lerContratos, lerPropostasAceitas, ARQUIVO_MODELO, DIR_PROPOSTAS, CHAVES_PARAMETROS } = require('../src/areas/contratos/data');
const { lerPropostas } = require('../src/areas/propostas/data');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');

function vaultCom(arquivos) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'contr-'));
  for (const [rel, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(v, rel)), { recursive: true });
    fs.writeFileSync(path.join(v, rel), texto);
  }
  return v;
}
const proposta = (fm, corpo = '') => `---\n${fm}\n---\n${corpo}`;
const COMPLETA = 'status: aceita\ncliente: Ana Exemplo\nprojeto: Site\nvalor: 1000\nentrada_percentual: 0.5\ninicio: 2026-03-02\nentrega: 2026-03-30\nescopo: [a, b]\nfora_do_escopo: []\nentregaveis:\n  - c\n';

test('contratos: o vault de exemplo lê tudo e não tem aviso nenhum', () => {
  const d = lerContratos(VAULT);
  assert.deepEqual(d.avisos, []);
  assert.equal(ARQUIVO_MODELO, '70-negocio/modelos/contrato.md');
  assert.equal(d.modelo.existe, true);
  assert.ok(d.modelo.texto.includes('{{#se minuta}}'));
  assert.ok(!d.modelo.texto.includes('Texto de exemplo')); // a citação não vem do leitor
  assert.equal(d.perfil.campos.nome, 'Marina Exemplo da Silva');
  assert.deepEqual(Object.keys(d.parametros), CHAVES_PARAMETROS);
  assert.equal(d.parametros.garantia_dias.valor, 45);
  assert.equal(d.parametros.hora_avulsa.valor, 60);
  assert.equal(d.parametros.entrada.valor, 0.4);
});

test('proposta aceita: só as de status "aceita"; os campos do frontmatter, sem chute', () => {
  const { propostas, avisos } = lerPropostasAceitas(VAULT);
  assert.deepEqual(avisos, []);
  assert.equal(propostas.length, 1); // "enviada" fica de fora
  assert.deepEqual(propostas[0], {
    arquivo: `${DIR_PROPOSTAS}/site-institucional.md`,
    rotulo: 'Loja Exemplo Ltda: Site institucional',
    cliente: 'Loja Exemplo Ltda', projeto: 'Site institucional', valor: 2500, entrada_percentual: 0.4,
    inicio: '2026-03-16', entrega: '2026-04-13',
    escopo: ['Três páginas: início, serviços e contato', 'Formulário de contato', 'Publicação no domínio do cliente'],
    fora_do_escopo: ['Redação dos textos', 'Loja virtual'],
    entregaveis: ['Código-fonte', 'Manual curto de uso'],
    ausentes: [],
  });
});

test('proposta aceita: status sem acento nem caixa vale; outro status, não', () => {
  const v = vaultCom({
    [`${DIR_PROPOSTAS}/a.md`]: proposta(COMPLETA.replace('aceita', 'Aceita')),
    [`${DIR_PROPOSTAS}/b.md`]: proposta(COMPLETA.replace('aceita', 'ACEITÁ')),
    [`${DIR_PROPOSTAS}/c.md`]: proposta(COMPLETA.replace('aceita', 'recusada')),
    [`${DIR_PROPOSTAS}/d.md`]: proposta(COMPLETA.replace('status: aceita\n', '')),
    [`${DIR_PROPOSTAS}/e.txt`]: 'status: aceita',
  });
  const { propostas, avisos } = lerPropostasAceitas(v);
  assert.deepEqual(propostas.map((p) => p.arquivo), [`${DIR_PROPOSTAS}/a.md`, `${DIR_PROPOSTAS}/b.md`]);
  assert.deepEqual(avisos, []);
});

test('proposta aceita: campo ausente ou inválido vira aviso e fica vazio, nunca valor chutado', () => {
  const v = vaultCom({
    [`${DIR_PROPOSTAS}/x.md`]: proposta('status: aceita\ncliente: Ana\nvalor: abc\nentrada_percentual: 0\ninicio: 2026-02-30\nescopo: Só um item'),
  });
  const { propostas, avisos } = lerPropostasAceitas(v);
  const p = propostas[0];
  assert.equal(p.cliente, 'Ana');
  assert.deepEqual([p.projeto, p.valor, p.entrada_percentual, p.inicio, p.entrega], [null, null, null, null, null]);
  assert.deepEqual(p.escopo, ['Só um item']); // texto simples = um item
  assert.deepEqual([p.fora_do_escopo, p.entregaveis], [[], []]);
  assert.deepEqual(p.ausentes, ['projeto', 'valor', 'entrada_percentual', 'inicio', 'entrega', 'fora_do_escopo', 'entregaveis']);
  assert.equal(p.rotulo, 'Ana');
  assert.deepEqual(avisos, [`Proposta aceita ${DIR_PROPOSTAS}/x.md: projeto, valor, entrada_percentual, inicio, entrega, fora_do_escopo, entregaveis ausentes ou inválidos.`]);
});

test('proposta aceita: valor e entrada em formatos do vault; lista vazia explícita não é ausência', () => {
  const casos = [['0.4', 0.4], ['40', 0.4], ['40%', 0.4], ['1', 1], ['100', 1], ['101', null], ['-5', null], ['x%', null]];
  for (const [txt, esperado] of casos) {
    const v = vaultCom({ [`${DIR_PROPOSTAS}/p.md`]: proposta(COMPLETA.replace('entrada_percentual: 0.5', `entrada_percentual: ${txt}`)) });
    assert.equal(lerPropostasAceitas(v).propostas[0].entrada_percentual, esperado, txt);
  }
  const v = vaultCom({ [`${DIR_PROPOSTAS}/p.md`]: proposta(COMPLETA.replace('valor: 1000', 'valor: R$ 1.500,50')) });
  const { propostas, avisos } = lerPropostasAceitas(v);
  assert.equal(propostas[0].valor, 1500.5);
  assert.deepEqual(propostas[0].fora_do_escopo, []);
  assert.deepEqual(avisos, []);
});

test('proposta aceita: sem frontmatter avisa e ignora; pasta ausente não é erro', () => {
  const v = vaultCom({ [`${DIR_PROPOSTAS}/sem.md`]: '# Sem frontmatter\n' });
  const r = lerPropostasAceitas(v);
  assert.deepEqual(r.propostas, []);
  assert.deepEqual(r.avisos, [`${DIR_PROPOSTAS}/sem.md: frontmatter ausente ou malformado; a proposta foi ignorada.`]);
  assert.deepEqual(lerPropostasAceitas(vaultCom({})), { propostas: [], avisos: [] });
});

test('contratos: modelo, perfil, parâmetro e arquivo ausentes viram aviso, não erro', () => {
  const sem = lerContratos(vaultCom({}));
  assert.equal(sem.modelo.existe, false);
  assert.deepEqual(sem.propostas, []);
  assert.ok(sem.avisos.some((a) => /^Perfil incompleto: .*não existe/.test(a)));
  assert.ok(sem.avisos.some((a) => a.startsWith(`${ARQUIVO_MODELO} não existe`)));
  assert.ok(sem.avisos.some((a) => a.includes('70-negocio/precificacao.md não existe')));
  assert.deepEqual(Object.values(sem.parametros).map((p) => p.valor), CHAVES_PARAMETROS.map(() => null));

  const v = vaultCom({
    '70-negocio/precificacao.md': '## Parâmetros\n\n| chave | valor |\n| --- | --- |\n| valor_hora | 50 |\n| garantia_dias | a definir |\n| imposto | a definir |\n',
  });
  const d = lerContratos(v);
  assert.ok(d.avisos.includes('Parâmetro garantia_dias está a definir em 70-negocio/precificacao.md.'));
  assert.ok(d.avisos.includes('Parâmetro hora_avulsa ausente ou ilegível em 70-negocio/precificacao.md.'));
  assert.ok(!d.avisos.some((a) => a.includes('imposto'))); // não é parâmetro do contrato
  assert.equal(d.parametros.valor_hora.valor, 50);
});

test('contratos: do perfil só nome e e-mail pesam no aviso', () => {
  const v = vaultCom({ '70-negocio/perfil.md': '| chave | valor |\n| --- | --- |\n| nome | Ana Exemplo |\n| email | ana@exemplo.test |\n| whatsapp | a definir |\n| cidade_uf | |\n' });
  assert.deepEqual(lerContratos(v).avisos.filter((a) => a.startsWith('Perfil')), []);
  const w = vaultCom({ '70-negocio/perfil.md': '| chave | valor |\n| --- | --- |\n| nome | Ana Exemplo |\n| email | a definir |\n' });
  assert.deepEqual(lerContratos(w).avisos.filter((a) => a.startsWith('Perfil')), ['Perfil incompleto: email está a definir em 70-negocio/perfil.md.']);
});

test('demo: /propostas e /contratos sem nenhum aviso', () => {
  assert.deepEqual(lerPropostas(VAULT).avisos, []);
  assert.deepEqual(lerContratos(VAULT).avisos, []);
});
