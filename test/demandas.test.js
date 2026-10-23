'use strict';

// Vault de exemplo (hoje fixo em 2026-03-10) e vaults temporários.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readDemandas, datasDemandas, backlogDe, SEM_CLIENTE } = require('../src/areas/demandas/data');
const demandas = require('../src/areas/demandas');
const areas = require('../src/areas');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const HOJE = '2026-03-10';

function vaultCom(t, arquivos) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-demandas-'));
  t.after(() => fs.rmSync(v, { recursive: true, force: true }));
  for (const [rel, texto] of Object.entries(arquivos)) {
    fs.mkdirSync(path.dirname(path.join(v, rel)), { recursive: true });
    fs.writeFileSync(path.join(v, rel), texto);
  }
  return v;
}

test('exemplo: clientes, contagens e ordem pelo prazo mais próximo', () => {
  const d = readDemandas(VAULT, HOJE);
  assert.deepEqual(d.avisos, []);
  assert.deepEqual(d.resumo, { clientes: 3, propostasAbertas: 1, propostasAceitas: 1, contratos: 0, projetos: 2, backlogAberto: 4 });
  assert.deepEqual(d.clientes.map((g) => [g.nome, g.proximoPrazo]), [
    ['Padaria Exemplo', '2026-03-20'], ['Loja Exemplo Ltda', '2026-04-13'], ['Cliente Cadastrado Sem Demanda', null],
  ]);
});

test('o prazo da proposta aceita vem de "entrega"; enviada não conta como em andamento', () => {
  const g = readDemandas(VAULT, HOJE).clientes.find((x) => x.nome === 'Loja Exemplo Ltda');
  assert.equal(g.valorAceito, 2500);
  const aceita = g.propostas[0];
  assert.deepEqual([aceita.status, aceita.prazo, aceita.diasParaPrazo, aceita.aberta, aceita.ativa], ['aceita', '2026-04-13', 34, false, true]);
  const padaria = readDemandas(VAULT, HOJE).clientes.find((x) => x.nome === 'Padaria Exemplo');
  assert.equal(padaria.propostas[0].aberta, true); // enviada: negociação aberta
  assert.equal(padaria.valorAceito, 0);
});

test('backlog: checkboxes contam (código fora); sem eles, blocos sob "## Backlog"', () => {
  assert.deepEqual(backlogDe('- [x] a\n- [ ] b\n```\n- [ ] c\n```\n'), { abertos: 1, total: 2, tipo: 'checkbox' });
  assert.deepEqual(backlogDe('## Backlog\n\num\n\ndois\ndois bis\n\n![[img.png]]\n\n## Outra\n\nnão conta\n'), { abertos: 2, total: 2, tipo: 'soltos' });
  assert.deepEqual(backlogDe('# Só título\n'), { abertos: 0, total: 0, tipo: 'soltos' });
});

test('projeto sem cliente vai para "Sem cliente", por último; só a tag "projeto" entra', (t) => {
  const v = vaultCom(t, {
    '30-projetos/a.md': '---\ntags: [projeto]\n---\n# Projeto A\n- [ ] x\n',
    '30-projetos/b.md': '---\ntags: [projeto]\ncliente: Zé\nprazo: 2026-05-01\n---\n# B\n',
    '30-projetos/nota.md': '---\ntags: [outra]\n---\n# Não é projeto\n',
    '30-projetos/sem-frontmatter.md': '# Nem esta\n',
  });
  const d = readDemandas(v, HOJE);
  assert.deepEqual(d.clientes.map((g) => g.nome), ['Zé', SEM_CLIENTE]);
  assert.equal(d.resumo.projetos, 2);
  assert.equal(d.resumo.clientes, 1);
});

test('cliente com grafias diferentes (acento e caixa) vira um só', (t) => {
  const v = vaultCom(t, {
    '70-negocio/propostas/a.md': '---\nstatus: enviada\ncliente: José Silva\nprojeto: A\n---\n',
    '70-negocio/propostas/b.md': '---\nstatus: ACEITA\ncliente: jose silva\nprojeto: B\nvalor: 1000\n---\n',
  });
  const d = readDemandas(v, HOJE);
  assert.equal(d.clientes.length, 1);
  assert.equal(d.clientes[0].propostas.length, 2);
  assert.equal(d.clientes[0].valorAceito, 1000);
});

test('prazo inválido e frontmatter aberto viram aviso, sem derrubar o resto', (t) => {
  const v = vaultCom(t, {
    '30-projetos/ok.md': '---\ntags: [projeto]\nprazo: 31/03/2026\n---\n# Ok\n',
    '30-projetos/aberto.md': '---\ntags: [projeto]\n\n# Aberto\n',
    '70-negocio/propostas/sem-status.md': '---\ncliente: X\n---\n',
  });
  const d = readDemandas(v, HOJE);
  assert.equal(d.resumo.projetos, 1);
  assert.equal(d.avisos.length, 3);
  assert.ok(d.avisos.some((a) => /prazo "31\/03\/2026" fora do formato/.test(a)));
  assert.ok(d.avisos.some((a) => /sem o "---" de fechamento/.test(a)));
  assert.ok(d.avisos.some((a) => /proposta sem "status"/.test(a)));
});

test('contrato encerrado não conta; vault sem as pastas vem vazio, sem erro', (t) => {
  const v = vaultCom(t, {
    '70-negocio/contratos/a.md': '---\ncliente: X\nstatus: encerrado\nprazo: 2026-01-01\n---\n',
    '70-negocio/contratos/b.md': '---\ncliente: X\nprazo: 2026-06-01\n---\n',
  });
  const d = readDemandas(v, HOJE);
  assert.equal(d.resumo.contratos, 1);
  assert.equal(d.clientes[0].proximoPrazo, '2026-06-01');
  const sem = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-vazio-'));
  t.after(() => fs.rmSync(sem, { recursive: true, force: true }));
  const vazio = readDemandas(sem, HOJE);
  assert.deepEqual([vazio.clientes, vazio.avisos], [[], []]);
});

test('datas: só prazos de itens em andamento, no formato das datas importantes', () => {
  assert.deepEqual(datasDemandas(VAULT, HOJE), [
    { data: '2026-03-20', rotulo: 'Painel de pedidos (Padaria Exemplo)', area: 'demandas' },
    { data: '2026-04-13', rotulo: 'Site institucional (Loja Exemplo Ltda)', area: 'demandas' },
  ]);
});

test('área: contrato, cartão da Home e registro', () => {
  assert.equal(demandas.id, 'demandas');
  assert.ok(areas.includes(demandas));
  assert.deepEqual(demandas.watch, ['70-negocio', '30-projetos']);
  const r = demandas.resumo(VAULT, { hoje: HOJE });
  assert.deepEqual(r.itens.map((i) => [i.rotulo, i.valor]), [['Projetos', 2], ['Propostas em aberto', 1], ['Contratos', 0], ['Backlog em aberto', 4]]);
  assert.deepEqual(demandas.api[''](VAULT, { hoje: HOJE }), readDemandas(VAULT, HOJE));
});
