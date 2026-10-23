'use strict';

// Motor de lançamentos (src/areas/financeiro/lancar.js) sobre a fixture inventada do vault de exemplo.
// Hoje = 2026-03-10 (terça). Saldos: principal 1600, reserva 300, pessoal 40, margem 45, conta 100,
// vt 80, trem 20, vr 60. Patrimônio 2165,00 (sem o VT); livre 85,00.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { lancar, verificar } = require('../src/areas/financeiro/lancar');
const { parsePanelas, parseMovimentos } = require('../src/areas/financeiro/data');
const { loadSiteConfig } = require('../src/config');

const DIR = path.join(__dirname, 'fixtures', 'vault-exemplo', '40-financeiro');
const PANELAS = fs.readFileSync(path.join(DIR, 'panelas.md'), 'utf8');
const MOVIMENTOS = fs.readFileSync(path.join(DIR, 'movimentos.md'), 'utf8');
const HOJE = '2026-03-10';
const CONFIG = loadSiteConfig().financeiro.lancar;

const rodar = (operacao, { panelasTxt = PANELAS, movimentosTxt = MOVIMENTOS, hoje = HOJE } = {}) => lancar({ panelasTxt, movimentosTxt, operacao, hoje }, { config: CONFIG });
const aplicar = (operacao, estado) => {
  const r = rodar({ ...operacao, confirmar: true }, estado);
  assert.equal(r.ok, true, r.erros.join(' | '));
  return { panelasTxt: r.novos.panelasTxt, movimentosTxt: r.novos.movimentosTxt };
};
const saldos = (txt) => Object.fromEntries(parsePanelas(txt, []).saldos.map((s) => [s.id, s.saldo]));
const patrimonio = (txt) => parsePanelas(txt, []).patrimonioEscrito;
const linhas = (txt) => txt.split('\n');
// O que mudou entre dois textos: linhas que saíram e linhas que entraram, na ordem.
const dif = (a, b) => ({
  saiu: linhas(a).filter((l) => !linhas(b).includes(l)),
  entrou: linhas(b).filter((l) => !linhas(a).includes(l)),
});
const SALDO = (id, nome, v) => `| ${nome} | ${id} | ${v} | |`;
// Linhas acrescentadas ao fim da tabela de movimentos (antes da linha final vazia), mesmo que
// iguais a linhas que já existiam.
const novas = (antes, depois) => linhas(depois).slice(linhas(antes).length - 1, -1);

test('estado de partida da fixture', () => {
  assert.deepEqual(saldos(PANELAS), { principal: 1600, reserva: 300, pessoal: 40, margem: 45, conta: 100, vt: 80, trem: 20, vr: 60 });
  assert.equal(patrimonio(PANELAS), 2165);
});

// ---------- a) gasto ----------

test('gasto do VR: só o VR cai; uma linha no fim de movimentos.md', () => {
  const r = rodar({ tipo: 'gasto', valor: '12,50', descricao: 'mercado', saiDe: 'vr' });
  assert.equal(r.ok, true);
  // em panelas.md mudam só a linha do VR e o patrimônio (a data do título já era a de hoje)
  assert.deepEqual(dif(PANELAS, r.novos.panelasTxt), {
    saiu: [SALDO('vr', 'VR', '60.00'), 'Patrimônio total: 2165.00 (soma de tudo, exceto o VT).'],
    entrou: [SALDO('vr', 'VR', '47.50'), 'Patrimônio total: 2152.50 (soma de tudo, exceto o VT).'],
  });
  assert.equal(saldos(r.novos.panelasTxt).vr, 47.5);
  assert.equal(saldos(r.novos.panelasTxt).conta, 100);
  assert.equal(patrimonio(r.novos.panelasTxt), 2152.5);
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), ['| 2026-03-10 | vr | saída | 12.50 | mercado |  |']);
  assert.equal(dif(MOVIMENTOS, r.novos.movimentosTxt).saiu.length, 0); // nada antigo some
  assert.equal(linhas(r.novos.movimentosTxt).at(-2), '| 2026-03-10 | vr | saída | 12.50 | mercado |  |'); // antes da linha final vazia
});

test('gasto do débito (VT): VT e Conta caem juntos, o patrimônio cai o valor', () => {
  const r = rodar({ tipo: 'gasto', valor: 10, descricao: 'lanche', saiDe: 'vt', data: '2026-03-09' });
  const s = saldos(r.novos.panelasTxt);
  assert.deepEqual([s.vt, s.conta, patrimonio(r.novos.panelasTxt)], [70, 90, 2155]);
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), ['| 2026-03-09 | vt | saída | 10.00 | lanche |  |']);
  assert.deepEqual(r.previa.saldos.map((x) => [x.id, x.antes, x.depois]), [['conta', 100, 90], ['vt', 80, 70]]);
});

test('gasto direto reduz exatamente o valor (pessoal, margem, trem, conta)', () => {
  for (const [id, antes] of [['pessoal', 40], ['margem', 45], ['trem', 20], ['conta', 100]]) {
    const r = rodar({ tipo: 'gasto', valor: '7,35', descricao: 'teste', saiDe: id });
    assert.equal(r.ok, true, id);
    assert.equal(saldos(r.novos.panelasTxt)[id], Math.round((antes - 7.35) * 100) / 100, id);
    assert.equal(patrimonio(r.novos.panelasTxt), 2157.65, id);
  }
});

test('gasto pago da conta: a Conta cai, a panela não, e nasce a pendência', () => {
  const r = rodar({ tipo: 'gasto', valor: 15, descricao: 'lanche', saiDe: 'conta', reporDe: 'pessoal' });
  assert.equal(r.ok, true);
  const s = saldos(r.novos.panelasTxt);
  assert.deepEqual([s.conta, s.pessoal, patrimonio(r.novos.panelasTxt)], [85, 40, 2150]);
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), ['| 2026-03-10 | pessoal | saída | 15.00 | lanche | pago da conta, reposição pendente |']);
  assert.deepEqual(dif(PANELAS, r.novos.panelasTxt).entrou.filter((l) => l.startsWith('- ')), ['- 2026-03-10 — pessoal — 15.00 — lanche']);
  assert.ok(!r.novos.panelasTxt.includes('- Nenhuma.'));
  const p = parsePanelas(r.novos.panelasTxt, []);
  assert.deepEqual(p.pendentes, [{ data: '2026-03-10', panela: 'pessoal', valor: 15, descricao: 'lanche' }]);
  assert.equal(r.previa.pendentes.depois, 1);
});

test('gasto pago da conta e reposto de reserva ou principal exige confirmação (atrasa a meta)', () => {
  for (const reporDe of ['reserva', 'principal']) {
    const r = rodar({ tipo: 'gasto', valor: 15, descricao: 'imprevisto', saiDe: 'conta', reporDe });
    assert.equal(r.ok, true);
    assert.equal(r.exigeConfirmacao, true);
    assert.equal(r.gravavel, false);
    assert.match(r.avisos.find((a) => a.confirmar).texto, /atrasa a meta/);
    assert.equal(rodar({ tipo: 'gasto', valor: 15, descricao: 'imprevisto', saiDe: 'conta', reporDe, confirmar: true }).gravavel, true);
  }
});

test('gasto que deixaria saldo negativo ou VT acima da Conta pede confirmação', () => {
  const neg = rodar({ tipo: 'gasto', valor: 100, descricao: 'mercado', saiDe: 'vr' });
  assert.equal(neg.ok, true);
  assert.equal(neg.gravavel, false);
  assert.match(neg.avisos[0].texto, /Saldo negativo na panela "VR"/);
  assert.equal(rodar({ tipo: 'gasto', valor: 100, descricao: 'mercado', saiDe: 'vr', confirmar: true }).gravavel, true);

  const vt = rodar({ tipo: 'gasto', valor: 30, descricao: 'internet', saiDe: 'conta' }); // conta 70 < vt 80
  assert.equal(vt.gravavel, false);
  assert.ok(vt.avisos.some((a) => a.texto === 'VT maior que a Conta, confira.' && a.confirmar));
});

// ---------- b) transporte ----------

test('transporte do dia útil: -5,00 no VT (e na Conta) e -5,50 no trem, uma linha', () => {
  const r = rodar({ tipo: 'transporte' });
  assert.equal(r.ok, true);
  const s = saldos(r.novos.panelasTxt);
  assert.deepEqual([s.vt, s.conta, s.trem, patrimonio(r.novos.panelasTxt)], [75, 95, 14.5, 2154.5]);
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), ['| 2026-03-10 | vt | saída | 5.00 | Transporte do dia (dia de semana) | + trem −5.50 |']);
});

test('transporte de sábado: -10,00 no VT e -5,50 no trem; domingo é bloqueado', () => {
  const sab = rodar({ tipo: 'transporte', data: '2026-03-07' });
  assert.equal(sab.ok, true);
  assert.deepEqual(novas(MOVIMENTOS, sab.novos.movimentosTxt), ['| 2026-03-07 | vt | saída | 10.00 | Transporte do dia (sábado) | + trem −5.50 |']);
  assert.deepEqual([saldos(sab.novos.panelasTxt).vt, saldos(sab.novos.panelasTxt).trem], [70, 14.5]);
  const dom = rodar({ tipo: 'transporte', data: '2026-03-08' });
  assert.equal(dom.ok, false);
  assert.match(dom.erros[0], /^Domingo/);
  assert.equal(dom.novos, null);
});

// ---------- c) entrada ----------

test('entrada: soma na panela (e na Conta se for o VT)', () => {
  const r = rodar({ tipo: 'entrada', panela: 'pessoal', valor: '30', descricao: 'Rendimento do porquinho (Inter)' });
  assert.deepEqual([saldos(r.novos.panelasTxt).pessoal, patrimonio(r.novos.panelasTxt), parsePanelas(r.novos.panelasTxt, []).livreEscrito], [70, 2195, 115]);
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), ['| 2026-03-10 | pessoal | entrada | 30.00 | Rendimento do porquinho (Inter) |  |']);
  const vt = rodar({ tipo: 'entrada', panela: 'vt', valor: 50, descricao: 'Pagto Vale Transporte' });
  assert.deepEqual([saldos(vt.novos.panelasTxt).vt, saldos(vt.novos.panelasTxt).conta, patrimonio(vt.novos.panelasTxt)], [130, 150, 2215]);
});

test('entrada na principal que cruza o marco avisa "Marco atingido" e mostra a meta final', () => {
  const r = rodar({ tipo: 'entrada', panela: 'principal', valor: 400, descricao: 'extra' });
  assert.ok(r.avisos.some((a) => /^Marco atingido/.test(a.texto)));
  assert.ok(r.avisos.some((a) => a.texto === 'Meta final: 2000.00 / 25000 — 8,0%.'));
  assert.equal(r.exigeConfirmacao, false);
});

// ---------- d) reposição ----------

// Três pendências de Pessoal, como no ensaio: ids 0, 1 e 2 na ordem do arquivo.
const trio = () => {
  let e = aplicar({ tipo: 'gasto', valor: 7, descricao: 'suco', saiDe: 'conta', reporDe: 'pessoal', data: '2026-03-06' });
  e = aplicar({ tipo: 'gasto', valor: 8, descricao: 'lanche natural', saiDe: 'conta', reporDe: 'pessoal', data: '2026-03-07' }, e);
  return aplicar({ tipo: 'gasto', valor: 12, descricao: 'lanche ensaio', saiDe: 'conta', reporDe: 'pessoal', data: '2026-03-08' }, e);
};
const PEND = [{ id: 0, descricao: 'suco', valor: '7,00' }, { id: 1, descricao: 'lanche natural', valor: '8,00' }, { id: 2, descricao: 'lanche ensaio', valor: '12,00' }];
const quitar = (ids, extra = {}) => {
  const itens = ids.map((i) => PEND[i]);
  const total = itens.reduce((a, x) => a + Number(x.valor.replace(',', '.')), 0);
  return { tipo: 'reposicao', modo: 'quitar', panela: 'pessoal', pendencias: itens, valor: total.toFixed(2), ...extra };
};
const pendentesDe = (txt) => parsePanelas(txt, []).pendentes.map((x) => x.descricao);

test('reposição que quita: debita a panela, credita a Conta, marca a pendência e não muda o patrimônio', () => {
  const g = aplicar({ tipo: 'gasto', valor: 15, descricao: 'lanche', saiDe: 'conta', reporDe: 'pessoal' });
  assert.equal(patrimonio(g.panelasTxt), 2150);
  const r = rodar({ tipo: 'reposicao', modo: 'quitar', panela: 'pessoal', valor: 15, pendencias: [{ id: 0, descricao: 'lanche', valor: 15 }] }, g);
  assert.equal(r.ok, true, r.erros.join('|'));
  const s = saldos(r.novos.panelasTxt);
  assert.deepEqual([s.pessoal, s.conta, patrimonio(r.novos.panelasTxt)], [25, 100, 2150]);
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt).slice(-1), ['| 2026-03-10 | pessoal→conta | transferência | 15.00 | Reposição na conta (Pessoal / Lazer) | repõe lanche |']);
  assert.ok(r.novos.panelasTxt.includes('- 2026-03-10 — pessoal — 15.00 — lanche ✔ reposto 2026-03-10'));
  assert.ok(r.novos.panelasTxt.includes('- Nenhuma pendente.'));
  assert.equal(patrimonio(r.novos.panelasTxt), patrimonio(PANELAS) - 15);
});

test('o caso do ensaio: pendências 7, 8 e 12, marcar só a de 12 quita só ela', () => {
  const e = trio();
  const r = rodar(quitar([2]), e);
  assert.equal(r.ok, true, r.erros.join('|'));
  assert.deepEqual(pendentesDe(r.novos.panelasTxt), ['suco', 'lanche natural']);
  assert.ok(r.novos.panelasTxt.includes('- 2026-03-08 — pessoal — 12.00 — lanche ensaio ✔ reposto 2026-03-10'));
  assert.ok(r.novos.panelasTxt.includes('- 2026-03-06 — pessoal — 7.00 — suco\n'));
  assert.ok(!r.novos.panelasTxt.includes('Nenhuma pendente.'));
  assert.deepEqual(r.avisos, []); // nada de "sobra" nem adiantamento
  assert.equal(novas(e.movimentosTxt, r.novos.movimentosTxt).at(-1), '| 2026-03-10 | pessoal→conta | transferência | 12.00 | Reposição na conta (Pessoal / Lazer) | repõe lanche ensaio |');
  assert.equal(patrimonio(r.novos.panelasTxt), patrimonio(e.panelasTxt)); // o dinheiro só troca de panela
});

test('reposição que quita: qualquer subconjunto quita exatamente as marcadas', () => {
  const e = trio();
  const todos = [[0], [1], [2], [0, 1], [0, 2], [1, 2], [0, 1, 2]];
  for (const ids of todos) {
    const r = rodar(quitar(ids), e);
    assert.equal(r.ok, true, `${ids}: ${r.erros.join('|')}`);
    const restam = PEND.filter((x) => !ids.includes(x.id)).map((x) => x.descricao);
    assert.deepEqual(pendentesDe(r.novos.panelasTxt), restam, `${ids}`);
    const soma = ids.reduce((a, i) => a + Number(PEND[i].valor.replace(',', '.')), 0);
    assert.equal(saldos(r.novos.panelasTxt).pessoal, saldos(e.panelasTxt).pessoal - soma, `${ids}`);
    assert.equal(patrimonio(r.novos.panelasTxt), patrimonio(e.panelasTxt), `${ids}`);
    assert.equal(r.previa.pendentes.depois, restam.length, `${ids}`);
  }
});

test('a prévia diz quais pendências serão repostas e quais continuam', () => {
  const r = rodar(quitar([0, 2]), trio());
  assert.deepEqual(r.previa.quitadas.map((x) => [x.descricao, x.valor]), [['suco', 7], ['lanche ensaio', 12]]);
  assert.deepEqual(r.previa.continuam.map((x) => [x.descricao, x.valor]), [['lanche natural', 8]]);
  assert.deepEqual(r.previa.notas, ['Quita: 2026-03-06 — Pessoal / Lazer — R$ 7.00 — suco', 'Quita: 2026-03-08 — Pessoal / Lazer — R$ 12.00 — lanche ensaio', 'Continua pendente: 2026-03-07 — Pessoal / Lazer — R$ 8.00 — lanche natural']);
});

test('reposição que quita é recusada com soma errada, sem tocar nos arquivos', () => {
  const e = trio();
  const r = rodar(quitar([2], { valor: '11,00' }), e);
  assert.equal(r.ok, false);
  assert.match(r.erros.join(' '), /soma/i);
  assert.equal(r.novos, null);
  // valor de conferência da pendência diferente do arquivo
  const errada = quitar([2]);
  errada.pendencias[0] = { ...errada.pendencias[0], valor: '13,00' };
  errada.valor = '13,00';
  const r2 = rodar(errada, e);
  assert.equal(r2.ok, false);
  assert.match(r2.erros.join(' '), /não existe|mudou/i);
});

test('reposição que quita é recusada com pendência inexistente, de outra panela, repetida ou fora do lugar', () => {
  const e = trio();
  const base = quitar([2]);
  const casos = {
    'id inexistente': { ...base, pendencias: [{ id: 9, descricao: 'lanche ensaio', valor: '12,00' }] },
    'descrição diferente': { ...base, pendencias: [{ id: 2, descricao: 'outra coisa', valor: '12,00' }] },
    'id repetido': { ...base, pendencias: [PEND[2], PEND[2]], valor: '24,00' },
    'sem nenhuma marcada': { ...base, pendencias: [], valor: '0' },
    'de outra panela': { ...base, panela: 'margem' },
  };
  for (const [nome, op] of Object.entries(casos)) {
    const r = rodar(op, e);
    assert.equal(r.ok, false, nome);
    assert.equal(r.novos, null, nome);
  }
  // pendência já reposta não aparece mais na lista: o id seguinte muda de lugar e a conferência pega
  const depois = aplicar(quitar([0]), e);
  const velha = rodar(quitar([2]), depois); // id 2 não existe mais (restam 2)
  assert.equal(velha.ok, false);
});

test('reposição que quita também é recusada se a panela não tem saldo', () => {
  let e = aplicar({ tipo: 'gasto', valor: 50, descricao: 'grande', saiDe: 'conta', reporDe: 'margem' });
  e = { ...e };
  const r = rodar({ tipo: 'reposicao', modo: 'quitar', panela: 'margem', valor: 50, pendencias: [{ id: 0, descricao: 'grande', valor: 50 }] }, e);
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Margem tem R\$ 45\.00, menos que os R\$ 50\.00/);
});

test('transferência livre: valor digitado, não quita pendência, marca como reposição adiantada', () => {
  const e = trio();
  const r = rodar({ tipo: 'reposicao', modo: 'livre', panela: 'pessoal', valor: '5,00' }, e);
  assert.equal(r.ok, true, r.erros.join('|'));
  assert.deepEqual(pendentesDe(r.novos.panelasTxt), ['suco', 'lanche natural', 'lanche ensaio']); // nada muda
  assert.equal(dif(e.panelasTxt, r.novos.panelasTxt).entrou.some((l) => l.includes('✔')), false);
  assert.equal(novas(e.movimentosTxt, r.novos.movimentosTxt).at(-1), '| 2026-03-10 | pessoal→conta | transferência | 5.00 | Reposição na conta (Pessoal / Lazer) | reposição adiantada |');
  const s = saldos(r.novos.panelasTxt);
  assert.deepEqual([s.pessoal, s.conta], [saldos(e.panelasTxt).pessoal - 5, saldos(e.panelasTxt).conta + 5]);
  assert.equal(patrimonio(r.novos.panelasTxt), patrimonio(e.panelasTxt));
  assert.deepEqual(r.previa.quitadas, []);
  assert.equal(r.previa.continuam.length, 3);
});

test('transferência livre mesmo com valor igual ao de uma pendência não quita nada; sem pendências também vale', () => {
  const r = rodar({ tipo: 'reposicao', modo: 'livre', panela: 'pessoal', valor: 12 }, trio());
  assert.equal(r.previa.pendentes.depois, 3);
  const sem = rodar({ tipo: 'reposicao', modo: 'livre', panela: 'pessoal', valor: 10 });
  assert.equal(sem.ok, true);
  assert.ok(sem.novos.panelasTxt.includes('- Nenhuma.'));
});

test('transferência livre é recusada sem saldo e não aceita lista de pendências', () => {
  const r = rodar({ tipo: 'reposicao', modo: 'livre', panela: 'margem', valor: 50 });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /Margem tem R\$ 45\.00, menos que os R\$ 50\.00/);
  assert.equal(rodar({ tipo: 'reposicao', modo: 'livre', panela: 'pessoal', valor: 5, pendencias: [PEND[0]] }).ok, false);
  assert.equal(rodar({ tipo: 'reposicao', modo: 'livre', panela: 'vr', valor: 5 }).ok, false); // VR não repõe a Conta
});

test('reposição exige o modo; nunca quita sozinha por ordem de data', () => {
  const r = rodar({ tipo: 'reposicao', panela: 'pessoal', valor: 12 }, trio());
  assert.equal(r.ok, false);
  assert.match(r.erros.join(' '), /modo/i);
  assert.equal(rodar({ tipo: 'reposicao', modo: 'automatico', panela: 'pessoal', valor: 12 }, trio()).ok, false);
});

// ---------- e) recarga ----------

test('recarga do trem: sai do VT (e da Conta) e entra no trem; patrimônio igual', () => {
  const r = rodar({ tipo: 'recarga', valor: 20 });
  const s = saldos(r.novos.panelasTxt);
  assert.deepEqual([s.vt, s.conta, s.trem, patrimonio(r.novos.panelasTxt)], [60, 80, 40, 2165]);
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), ['| 2026-03-10 | trem | recarga | 20.00 | Recarga do cartão do trem |  |']);
  assert.equal(rodar({ tipo: 'recarga', valor: 90 }).gravavel, false); // VT ficaria negativo
});

// ---------- f) salário ----------

test('salário normal: 57/21/13/9, soma exata, 4 movimentos e a seção Salário', () => {
  const r = rodar({ tipo: 'salario', valor: '1000,00', data: '2026-03-10' });
  assert.equal(r.ok, true);
  const s = saldos(r.novos.panelasTxt);
  assert.deepEqual([s.principal, s.reserva, s.pessoal, s.margem], [2170, 510, 170, 135]);
  assert.equal(patrimonio(r.novos.panelasTxt), 3165); // + exatamente o líquido
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), [
    '| 2026-03-10 | principal | entrada | 570.00 | Divisão do salário |  |',
    '| 2026-03-10 | reserva | entrada | 210.00 | Divisão do salário |  |',
    '| 2026-03-10 | pessoal | entrada | 130.00 | Divisão do salário |  |',
    '| 2026-03-10 | margem | entrada | 90.00 | Divisão do salário |  |',
  ]);
  const sal = parsePanelas(r.novos.panelasTxt, []).salario;
  assert.deepEqual(sal, { valor: 1000, data: '2026-03-10', divisao: [{ panela: 'principal', valor: 570 }, { panela: 'reserva', valor: 210 }, { panela: 'pessoal', valor: 130 }, { panela: 'margem', valor: 90 }] });
  assert.ok(r.novos.panelasTxt.includes('- Anterior: R$850.00 recebido em 2026-03-01\n  (principal 500.00 / reserva 200.00 / pessoal 100.00 / margem 50.00).'));
});

test('salário com a reserva na meta: 71/0/20/9, sem linha de 0,00, arredondamento na principal', () => {
  const cheia = PANELAS.replace(SALDO('reserva', 'Reserva', '300.00'), SALDO('reserva', 'Reserva', '1000.00')).replace('Patrimônio total: 2165.00', 'Patrimônio total: 2865.00');
  const r = rodar({ tipo: 'salario', valor: '1234,57' }, { panelasTxt: cheia });
  assert.equal(r.ok, true, r.erros.join('|'));
  const ant = saldos(cheia);
  const dep = saldos(r.novos.panelasTxt);
  assert.equal(dep.reserva, ant.reserva);
  assert.equal(Math.round((dep.pessoal - ant.pessoal) * 100), 24691); // 20%
  assert.equal(Math.round((dep.margem - ant.margem) * 100), 11111); // 9%
  assert.equal(Math.round((dep.principal - ant.principal) * 100), 87655); // o resto: 71% + arredondamento
  const entradas = novas(MOVIMENTOS, r.novos.movimentosTxt);
  assert.equal(entradas.length, 3);
  assert.ok(!entradas.some((l) => l.includes('| reserva |')));
  const soma = entradas.map((l) => Number(l.split('|')[4])).reduce((a, b) => a + Math.round(b * 100), 0);
  assert.equal(soma, 123457); // exatamente o líquido
  assert.equal(Math.round((patrimonio(r.novos.panelasTxt) - 2865) * 100), 123457);
  assert.ok(r.previa.notas.includes('Reserva em 0%: sem movimento na reserva.'));
});

test('salário repetido: o segundo "Anterior" substitui o primeiro; data antiga pede confirmação', () => {
  const e1 = aplicar({ tipo: 'salario', valor: 1000, data: '2026-03-10' });
  const e2 = aplicar({ tipo: 'salario', valor: 900, data: '2026-03-10' }, e1);
  const sal = e2.panelasTxt.split('## Salário')[1].split('##')[0];
  assert.equal((sal.match(/Anterior:/g) || []).length, 1);
  assert.match(sal, /Último: R\$900\.00 recebido em 2026-03-10/);
  assert.match(sal, /Anterior: R\$1000\.00 recebido em 2026-03-10/);
  const velho = rodar({ tipo: 'salario', valor: 500, data: '2026-03-01' });
  assert.equal(velho.gravavel, false);
  assert.match(velho.avisos[0].texto, /último salário registrado é de 2026-03-01/);
});

// ---------- g) ajuste ----------

test('ajuste: grava a diferença (real − registrado) como "Ajuste de saldo (conferido com o banco)"', () => {
  const mais = rodar({ tipo: 'ajuste', panela: 'pessoal', saldoReal: '55,00' });
  assert.deepEqual(novas(MOVIMENTOS, mais.novos.movimentosTxt), ['| 2026-03-10 | pessoal | entrada | 15.00 | Ajuste de saldo (conferido com o banco) | saldo real 55.00 |']);
  assert.equal(saldos(mais.novos.panelasTxt).pessoal, 55);
  const menos = rodar({ tipo: 'ajuste', panela: 'pessoal', saldoReal: 30 });
  assert.deepEqual(novas(MOVIMENTOS, menos.novos.movimentosTxt), ['| 2026-03-10 | pessoal | saída | 10.00 | Ajuste de saldo (conferido com o banco) | saldo real 30.00 |']);
  assert.equal(patrimonio(menos.novos.panelasTxt), 2155);
  assert.equal(rodar({ tipo: 'ajuste', panela: 'pessoal', saldoReal: 40 }).ok, false); // sem diferença
  // só a panela informada: o ajuste do VT não mexe na Conta
  const vt = rodar({ tipo: 'ajuste', panela: 'vt', saldoReal: 70 });
  assert.deepEqual([saldos(vt.novos.panelasTxt).vt, saldos(vt.novos.panelasTxt).conta], [70, 100]);
  assert.equal(rodar({ tipo: 'ajuste', panela: 'vr', saldoReal: 0 }).ok, true); // zero é um saldo real válido
});

test('o ajuste nunca entra na conta de gastos do financeiro', () => {
  const { isGasto } = require('../src/areas/financeiro/data');
  const r = rodar({ tipo: 'ajuste', panela: 'pessoal', saldoReal: 30 });
  const novo = parseMovimentos(r.novos.movimentosTxt, []).at(-1);
  assert.equal(isGasto(novo), false);
});

// ---------- validação ----------

test('valor: maior que zero, até 2 casas, vírgula aceita', () => {
  const g = (valor) => rodar({ tipo: 'gasto', valor, descricao: 'x', saiDe: 'vr' });
  for (const bom of ['12,5', '12.50', 12.5, '0,01', '7']) assert.equal(g(bom).ok, true, String(bom));
  for (const ruim of ['0', 0, '-5', '12,345', '1.234,56', 'abc', '', null, '1e3', 1e12]) assert.equal(g(ruim).ok, false, String(ruim));
});

test('descrição: sem quebra de linha, "|" vira "/", obrigatória', () => {
  const g = (descricao) => rodar({ tipo: 'gasto', valor: 1, descricao, saiDe: 'vr' });
  assert.equal(g('a\nb').ok, false);
  assert.equal(g('a\rb').ok, false);
  assert.equal(g('   ').ok, false);
  assert.equal(g('x ✔ y').ok, false);
  assert.equal(g('a'.repeat(121)).ok, false);
  const r = g('pão | queijo');
  assert.deepEqual(novas(MOVIMENTOS, r.novos.movimentosTxt), ['| 2026-03-10 | vr | saída | 1.00 | pão / queijo |  |']);
  assert.equal(parseMovimentos(r.novos.movimentosTxt, []).at(-1).descricao, 'pão / queijo');
});

test('data: válida e não futura; operação e campos desconhecidos são recusados', () => {
  const g = (extra) => rodar({ tipo: 'gasto', valor: 1, descricao: 'x', saiDe: 'vr', ...extra });
  assert.equal(g({ data: '2026-03-10' }).ok, true);
  assert.equal(g({ data: '2026-03-11' }).ok, false);
  assert.match(g({ data: '2026-03-11' }).erros[0], /futura/);
  assert.equal(g({ data: '2026-02-30' }).ok, false);
  assert.equal(g({ data: '10/03/2026' }).ok, false);
  assert.equal(g({ panela: 'principal' }).ok, false); // campo que não é da operação
  assert.equal(g({ saiDe: 'principal' }).ok, false); // principal só por "pago da conta"
  assert.equal(g({ reporDe: 'pessoal' }).ok, false); // reporDe só com saiDe conta
  assert.equal(rodar({ tipo: 'inventada' }).ok, false);
  assert.equal(rodar(null).ok, false);
  assert.equal(rodar({ tipo: 'entrada', panela: 'xyz', valor: 1, descricao: 'x' }).ok, false);
});

// ---------- verificação pós-escrita ----------

test('verificação pós-escrita: um erro forçado aborta e nada sai', () => {
  const op = { tipo: 'gasto', valor: 12.5, descricao: 'mercado', saiDe: 'vr' };
  const corrompe = (f) => lancar({ panelasTxt: PANELAS, movimentosTxt: MOVIMENTOS, operacao: op, hoje: HOJE }, { config: CONFIG, transformarSaida: f });
  // 1. saldo gravado diferente do calculado
  let r = corrompe((t) => ({ ...t, panelasTxt: t.panelasTxt.replace('47.50', '47.51') }));
  assert.equal(r.ok, false);
  assert.equal(r.novos, null);
  assert.match(r.erros[0], /Verificação antes de gravar falhou/);
  assert.ok(r.erros.some((e) => /Saldo de "vr" ficaria 47\.51/.test(e)));
  // 2. patrimônio escrito que não bate com a soma
  r = corrompe((t) => ({ ...t, panelasTxt: t.panelasTxt.replace('Patrimônio total: 2152.50', 'Patrimônio total: 2999.00') }));
  assert.ok(r.erros.some((e) => /não bate com o patrimônio escrito/.test(e)));
  // 3. movimento antigo alterado
  r = corrompe((t) => ({ ...t, movimentosTxt: t.movimentosTxt.replace('| mercado |  |', '| mercadoX |  |') }));
  assert.ok(r.erros.some((e) => /histórico de movimentos antigo/.test(e)));
  // 4. linha nova que o parser lê com aviso
  r = corrompe((t) => ({ ...t, movimentosTxt: t.movimentosTxt.replace('| 12.50 |', '| doze |') }));
  assert.equal(r.ok, false);
  assert.ok(r.erros.some((e) => /Aviso novo nos leitores|valor ilegível/.test(e)));
  // 5. texto que o leitor nem consegue ler
  r = corrompe((t) => ({ ...t, panelasTxt: t.panelasTxt.replace('## Saldos atuais', '## Outra coisa') }));
  assert.ok(r.erros.some((e) => /não passam nos leitores/.test(e)));
});

test('verificar: devolve lista vazia para um resultado correto', () => {
  const r = rodar({ tipo: 'recarga', valor: 5 });
  const avisos = [];
  parsePanelas(PANELAS, avisos);
  assert.deepEqual(r.erros, []);
  assert.equal(typeof verificar, 'function');
});

test('arquivos com fim de linha CRLF continuam CRLF', () => {
  const crlf = (t) => t.replace(/\n/g, '\r\n');
  const r = rodar({ tipo: 'gasto', valor: 12.5, descricao: 'mercado', saiDe: 'vr' }, { panelasTxt: crlf(PANELAS), movimentosTxt: crlf(MOVIMENTOS) });
  assert.equal(r.ok, true, r.erros.join('|'));
  assert.ok(!/[^\r]\n/.test(r.novos.panelasTxt));
  assert.ok(!/[^\r]\n/.test(r.novos.movimentosTxt));
});

test('invariantes numa sequência de operações: nada de float e o patrimônio fecha', () => {
  let e = { panelasTxt: PANELAS, movimentosTxt: MOVIMENTOS };
  const passos = [
    [{ tipo: 'gasto', valor: '0,10', descricao: 'a', saiDe: 'pessoal' }, -0.1],
    [{ tipo: 'gasto', valor: '0,20', descricao: 'b', saiDe: 'margem' }, -0.2],
    [{ tipo: 'gasto', valor: '3,33', descricao: 'c', saiDe: 'conta', reporDe: 'pessoal' }, -3.33],
    [{ tipo: 'reposicao', modo: 'quitar', panela: 'pessoal', valor: '3,33', pendencias: [{ id: 0, descricao: 'c', valor: '3,33' }] }, 0],
    [{ tipo: 'reposicao', modo: 'livre', panela: 'margem', valor: '1,01' }, 0],
    [{ tipo: 'recarga', valor: '1,11' }, 0],
    [{ tipo: 'transporte' }, -10.5],
    [{ tipo: 'entrada', panela: 'vr', valor: '9,99', descricao: 'vr' }, 9.99],
    [{ tipo: 'salario', valor: '777,77' }, 777.77],
  ];
  let esperado = 2165;
  for (const [op, delta] of passos) {
    const antes = patrimonio(e.panelasTxt);
    e = aplicar(op, e);
    esperado = Math.round((esperado + delta) * 100) / 100;
    assert.equal(patrimonio(e.panelasTxt), esperado, op.tipo);
    assert.equal(Math.round((patrimonio(e.panelasTxt) - antes) * 100) / 100, delta, op.tipo);
  }
  const s = saldos(e.panelasTxt);
  const soma = Object.entries(s).filter(([id]) => id !== 'vt').reduce((a, [, v]) => a + Math.round(v * 100), 0);
  assert.equal(soma, Math.round(patrimonio(e.panelasTxt) * 100));
});
