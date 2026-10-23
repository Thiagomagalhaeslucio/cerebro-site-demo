'use strict';

// Vault de exemplo (hoje fixo em 2026-03-10, terça; semana de 09 a 15/03) e arquivos temporários.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTempo, minutosDaLinha, porProjeto } = require('../src/areas/tempo/data');
const tempo = require('../src/areas/tempo');
const areas = require('../src/areas');
const { montarHome } = require('../src/home');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const HOJE = '2026-03-10';

function vaultCom(t, arquivos) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-tempo-'));
  t.after(() => fs.rmSync(v, { recursive: true, force: true }));
  if (arquivos) {
    fs.mkdirSync(path.join(v, '80-tempo'));
    for (const [nome, texto] of Object.entries(arquivos)) fs.writeFileSync(path.join(v, '80-tempo', nome), texto);
  }
  return v;
}
const tabela = (...linhas) => `| data | projeto | início | fim | min | nota |\n| --- | --- | --- | --- | --- | --- |\n${linhas.join('\n')}\n`;

test('minutosDaLinha: usa min; sem min, fim − início no mesmo dia; senão inválida', () => {
  assert.equal(minutosDaLinha('67', '20:06', '21:13'), 67);
  assert.equal(minutosDaLinha('', '09:00', '10:30'), 90);
  assert.equal(minutosDaLinha('', '23:00', '01:00'), null); // vira o dia: não adivinha
  assert.equal(minutosDaLinha('abc', '09:00', '10:00'), null);
  assert.equal(minutosDaLinha('', '', ''), null);
  assert.equal(minutosDaLinha('0', '', ''), 0);
});

test('exemplo: semana, mês, dias e maiores projetos', () => {
  const d = readTempo(VAULT, HOJE);
  assert.equal(d.existe, true);
  assert.deepEqual(d.avisos, []);
  assert.equal(d.semana.inicio, '2026-03-09');
  assert.equal(d.semana.fim, '2026-03-15');
  assert.equal(d.semana.minutos, 60 + 45 + 90 + 40);
  assert.equal(d.semana.dias, 2);
  assert.deepEqual(d.semana.projetos, [
    { projeto: 'projeto-alfa', minutos: 150 }, { projeto: 'projeto-beta', minutos: 45 }, { projeto: 'estudos-redes', minutos: 40 },
  ]);
  assert.equal(d.mes.mes, '2026-03');
  assert.equal(d.mes.minutos, 90 + 75 + 60 + 45 + 90 + 40); // fevereiro fica de fora
  assert.equal(d.mes.dias, 4);
  assert.deepEqual(d.mes.maiores.map((p) => [p.projeto, p.minutos, p.pct]), [['projeto-alfa', 240, 60], ['estudos-redes', 115, 29], ['projeto-beta', 45, 11]]);
});

test('recentes: os mais novos primeiro, no máximo cinco', () => {
  const d = readTempo(VAULT, HOJE);
  assert.equal(d.recentes.length, 5);
  assert.deepEqual(d.recentes.slice(0, 2).map((r) => [r.data, r.projeto]), [['2026-03-10', 'estudos-redes'], ['2026-03-10', 'projeto-alfa']]);
});

test('semana começa na segunda: domingo ainda é da semana, e a segunda seguinte não', (t) => {
  const v = vaultCom(t, { '2026-03.md': tabela('| 2026-03-08 | a | | | 10 | |', '| 2026-03-09 | a | | | 20 | |', '| 2026-03-15 | a | | | 30 | |') });
  assert.equal(readTempo(v, '2026-03-15').semana.minutos, 50); // 09 a 15
  assert.equal(readTempo(v, '2026-03-15').semana.dias, 2);
});

test('projeto sem diferenciar maiúsculas; empate desempata pelo nome', () => {
  const p = porProjeto([{ projeto: 'Beta', minutos: 10 }, { projeto: 'alfa', minutos: 10 }, { projeto: 'beta', minutos: 5 }]);
  assert.deepEqual(p, [{ projeto: 'Beta', minutos: 15 }, { projeto: 'alfa', minutos: 10 }]);
});

test('sem a pasta: existe=false, zeros e a Home explica', (t) => {
  const v = vaultCom(t);
  const d = readTempo(v, HOJE);
  assert.equal(d.existe, false);
  assert.equal(d.semana.minutos, 0);
  assert.equal(tempo.resumo(v, { hoje: HOJE }).itens[0].valor, 'sem a pasta 80-tempo');
});

test('linhas ruins viram aviso e são ignoradas; as boas contam', (t) => {
  const v = vaultCom(t, { '2026-03.md': tabela('| 2026-03-09 | a | 09:00 | 10:00 | 60 | |', '| 2026-02-30 | a | | | 10 | |', '| 2026-03-09 | | | | 10 | |', '| 2026-03-09 | a | | | xx | |', '| 2026-03-20 | a | | | 15 | |') });
  const d = readTempo(v, HOJE);
  assert.equal(d.mes.minutos, 60);
  assert.equal(d.avisos.length, 4);
  assert.ok(d.avisos.some((a) => /data "2026-02-30" inválida/.test(a)));
  assert.ok(d.avisos.some((a) => /sem projeto/.test(a)));
  assert.ok(d.avisos.some((a) => /minutos inválidos/.test(a)));
  assert.ok(d.avisos.some((a) => /depois de hoje/.test(a)));
});

test('arquivo sem a tabela vira aviso, sem derrubar os outros', (t) => {
  const v = vaultCom(t, { '2026-02.md': '# nada aqui\n', '2026-03.md': tabela('| 2026-03-09 | a | | | 25 | |') });
  const d = readTempo(v, HOJE);
  assert.equal(d.mes.minutos, 25);
  assert.match(d.avisos[0], /2026-02\.md: tabela .* não encontrada/);
});

test('cabeçalho aceita "início" com ou sem acento e colunas em outra ordem', (t) => {
  const v = vaultCom(t, { '2026-03.md': '| min | projeto | data | inicio |\n| --- | --- | --- | --- |\n| 30 | a | 2026-03-09 | 09:00 |\n' });
  assert.equal(readTempo(v, HOJE).mes.minutos, 30);
});

test('área: contrato, cartão da Home e entrada na Home', () => {
  assert.equal(tempo.id, 'tempo');
  assert.deepEqual(tempo.watch, ['80-tempo']);
  assert.ok(areas.includes(tempo));
  const r = tempo.resumo(VAULT, { hoje: HOJE });
  assert.deepEqual(r.itens.map((i) => [i.rotulo, i.valor]), [['Semana', '3 h 55 min'], ['Mês', '6 h 40 min']]);
  const h = montarHome(areas, VAULT, { hoje: HOJE, demo: true, areas });
  const c = h.cartoes.find((x) => x.area === 'tempo');
  assert.ok(c && !c.erro);
});

test('API: /api/tempo devolve a leitura', () => {
  const api = tempo.api[''](VAULT, { hoje: HOJE });
  assert.deepEqual({ ...api, pomodoro: undefined }, { ...readTempo(VAULT, HOJE), pomodoro: undefined });
  assert.ok(api.pomodoro.foco > 0);
});
