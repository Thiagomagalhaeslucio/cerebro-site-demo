'use strict';

// Usa test/fixtures/vault-exemplo (roadmap e notas inventados).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseFrontmatter } = require('../src/md');
const { readEstudos, limparItem } = require('../src/areas/estudos/data');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');

test('parseFrontmatter: aspas, comentário, listas em linha e em bloco', () => {
  const fm = parseFrontmatter('---\ntags:\n  - a\n  - b\nnivel: "" # comentário\nmodulo: "X: Y"\nlista: [c, d]\nstatus: \'ok\'\n---\ncorpo');
  assert.equal(fm.valido, true);
  assert.deepEqual(fm.campos.tags, ['a', 'b']);
  assert.equal(fm.campos.nivel, '');
  assert.equal(fm.campos.modulo, 'X: Y');
  assert.deepEqual(fm.campos.lista, ['c', 'd']);
  assert.equal(fm.campos.status, 'ok');
  assert.equal(parseFrontmatter('sem frontmatter').tem, false);
  assert.equal(parseFrontmatter('---\naberto: sim\n').valido, false);
});

test('limparItem tira crases, negrito, ids e links', () => {
  assert.deepEqual(limparItem('`#Block009` — For'), { texto: 'For', ids: ['Block009'] });
  assert.deepEqual(limparItem('`#Block014` `#Block015` — Funções'), { texto: 'Funções', ids: ['Block014', 'Block015'] });
  assert.deepEqual(limparItem('🎬 **#F017** — Assista prestando atenção'), { texto: 'Assista prestando atenção', ids: ['F017'] });
  assert.deepEqual(limparItem('🃏 **Anki** — revisão *(10 min)*'), { texto: 'Anki — revisão (10 min)', ids: [] });
});

test('roadmaps: só a raiz de 60-estudos com tag roadmap; progresso por arquivo e seção', () => {
  const d = readEstudos(VAULT);
  assert.deepEqual(d.roadmaps.map((r) => r.nome), ['roadmap-exemplo', 'roadmap-idiomas']);
  const r = d.roadmaps.find((x) => x.nome === 'roadmap-exemplo');
  assert.equal(r.titulo, 'Roadmap de Exemplo');
  // 8 checkboxes fora do bloco de código (o de dentro não conta); 4 marcados
  assert.equal(r.total, 8);
  assert.equal(r.feitos, 4);
  assert.equal(r.pct, 50);
  assert.deepEqual(r.secoes.map((s) => [s.titulo, s.feitos, s.total]), [
    ['(antes da primeira seção)', 1, 1],
    ['FASE A — Lógica', 3, 6],
    ['FASE B — Leitura', 0, 1],
  ]);
  assert.deepEqual(r.proximos, [
    { texto: 'Laços', ids: ['Blk003'], secao: 'FASE A — Lógica', subsecao: 'Passo 1 — Básico' },
    { texto: 'Funções', ids: ['Blk004', 'Blk005'], secao: 'FASE A — Lógica', subsecao: 'Passo 1 — Básico' },
    { texto: 'Assistir a aula de revisão', ids: ['F001'], secao: 'FASE A — Lógica', subsecao: 'Passo 2 — Prática' },
  ]);
});

test('revisões: status exatamente "revisão-pendente" e 99-arquivo fora', () => {
  const d = readEstudos(VAULT);
  assert.deepEqual(d.revisoes.map((r) => [r.arquivo, r.modulo, r.data]), [
    ['20-biblioteca/redes/modelo-camadas.md', 'Modelo de Camadas', '2026-01-05'],
    ['20-biblioteca/idiomas/aula-um.md', 'Idiomas — Aula 1: cumprimentos', '2026-02-20'],
    ['20-biblioteca/redes/sub-redes.md', 'Sub-redes e CIDR', '2026-03-02'],
  ]);
  assert.equal(d.revisoes[0].link, 'obsidian://open?vault=vault-exemplo&file=20-biblioteca%2Fredes%2Fmodelo-camadas');
  assert.deepEqual(d.avisos, []);
});

test('revisão sem módulo e sem data vira aviso, sem valor chutado', (t) => {
  // Cópia temporária do vault de exemplo com uma nota incompleta.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-estudos-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.cpSync(VAULT, tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, '20-biblioteca/idiomas/incompleta.md'), "---\ntags: [idiomas]\nstatus: 'revisão-pendente'\n---\n");
  const d = readEstudos(tmp);
  const n = d.revisoes.find((r) => r.nome === 'incompleta');
  assert.equal(n.modulo, null);
  assert.equal(n.data, null);
  assert.deepEqual(d.avisos, [
    '20-biblioteca/idiomas/incompleta.md: revisão pendente sem "modulo" no frontmatter.',
    '20-biblioteca/idiomas/incompleta.md: revisão pendente sem "data" no frontmatter.',
  ]);
});

test('intervalo de ids ("#F001 ao #F010") sai do texto do passo e os dois ids vão à parte', () => {
  const { limparItem } = require('../src/areas/estudos/data');
  const r = limparItem('`#F001` ao `#F010` — Instalando e configurando o MySQL');
  assert.equal(r.texto, 'Instalando e configurando o MySQL');
  assert.deepEqual(r.ids, ['F001', 'F010']);
  assert.equal(limparItem('#F017 Laços').texto, 'Laços'); // id simples segue como antes
});

test('tag "foco": o roadmap em foco vem primeiro e marca o cartão da Home', () => {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-foco-'));
  try {
    fs.mkdirSync(path.join(v, '60-estudos'));
    const rm = (nome, tags) => fs.writeFileSync(path.join(v, '60-estudos', `${nome}.md`), `---\ntags: [${tags}]\n---\n\n# ${nome}\n\n## Fase\n- [x] um\n- [ ] dois\n`);
    rm('a-primeiro-no-alfabeto', 'estudos, roadmap');
    rm('z-em-foco', 'estudos, roadmap, foco');
    const d = readEstudos(v);
    assert.deepEqual(d.roadmaps.map((r) => [r.nome, r.foco]), [['z-em-foco', true], ['a-primeiro-no-alfabeto', false]]);
    const itens = require('../src/areas/estudos').resumo(v).itens;
    assert.equal(itens[0].foco, true);
    assert.equal(itens[1].foco, false);
  } finally {
    fs.rmSync(v, { recursive: true, force: true });
  }
});
