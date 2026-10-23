'use strict';

// Fórmula (public/orcamento/formula.js, a mesma do navegador) com valores
// inventados de test/fixtures/vault-exemplo/70-negocio/precificacao.md.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { calcular, sugerirUrgencia, diasEntre } = require('../public/orcamento/formula');

const perto = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} esperado ${b}, veio ${a}`);

const P = {
  valor_hora: 50, valor_hora_piso: 30, margem_risco: 0.1, adicional_urgencia: 0.3,
  deslocamento_fixo: 20, deslocamento_km: 2, tempo_viagem_fator: 0.5, revisao_extra_horas: 3,
  imposto: 0.1, entrada: 0.4, desconto_max: 0.2, capacidade_horas_semana: 10,
};
const E = { horas: 10, mult: 1.5 };

test('fórmula: sem urgência', () => {
  const r = calcular(P, E);
  perto(r.horasBase.valor, 15);
  perto(r.horas.valor, 16.5);
  perto(r.base.valor, 825);
  perto(r.urgencia.valor, 0);
  perto(r.recomendado.valor, 825 / 0.9);
  perto(r.piso.valor, (825 / 0.9) * 0.8);
  assert.equal(r.pisoPor, 'desconto');
  perto(r.entrada.valor, (825 / 0.9) * 0.4);
});

test('fórmula: com urgência (o piso não leva o adicional)', () => {
  const r = calcular(P, { ...E, urgente: true });
  perto(r.urgencia.valor, 247.5);
  perto(r.recomendado.valor, 1072.5 / 0.9);
  perto(r.piso.valor, (1072.5 / 0.9) * 0.8);
  perto(r.entrada.valor, (1072.5 / 0.9) * 0.4);
});

test('fórmula: com deslocamento (fixo + km + tempo de viagem)', () => {
  const r = calcular(P, { horas: 10, mult: 1, viagens: 2, km: 30, horasViagem: 1 });
  perto(r.deslocamento.valor, 2 * 20 + 30 * 2 + 1 * 50 * 0.5);
  perto(r.recomendado.valor, (550 + 125) / 0.9);
  perto(r.piso.valor, 600);
});

test('fórmula: revisões extras e terceiros entram no subtotal e no piso por custo', () => {
  const r = calcular({ ...P, desconto_max: 0.9 }, { horas: 10, mult: 1, revisoesExtras: 1, terceiros: 80 });
  perto(r.revisoes.valor, 150);
  perto(r.recomendado.valor, (550 + 150 + 80) / 0.9);
  perto(r.piso.valor, (10 * 30 + 150 + 80) / 0.9);
  assert.equal(r.pisoPor, 'custo');
});

test('fórmula: o piso por custo vence o desconto máximo', () => {
  const r = calcular({ ...P, valor_hora_piso: 48 }, { horas: 10, mult: 1 });
  perto(r.recomendado.valor, 550 / 0.9);
  perto(r.piso.valor, 480 / 0.9);
  assert.ok(r.piso.valor > r.recomendado.valor * 0.8);
  assert.equal(r.pisoPor, 'custo');
});

test('fórmula: sem arredondar (só a exibição arredonda)', () => {
  const r = calcular(P, E);
  assert.notEqual(r.recomendado.valor, Math.round(r.recomendado.valor * 100) / 100);
});

test('fórmula: parâmetro a definir desativa só o que depende dele', () => {
  const r = calcular({ ...P, imposto: null }, E);
  assert.equal(r.recomendado.valor, null);
  assert.deepEqual(r.recomendado.falta, ['imposto']);
  assert.equal(r.piso.valor, null);
  assert.equal(r.entrada.valor, null);
  perto(r.base.valor, 825); // não depende do imposto

  const s = calcular({ ...P, adicional_urgencia: null }, E); // não urgente: não importa
  assert.ok(s.recomendado.valor > 0);
  const u = calcular({ ...P, adicional_urgencia: null }, { ...E, urgente: true });
  assert.equal(u.recomendado.valor, null);
  assert.deepEqual(u.recomendado.falta, ['adicional_urgencia']);

  const e = calcular({ ...P, entrada: null }, E);
  assert.ok(e.recomendado.valor > 0);
  assert.equal(e.entrada.valor, null);

  const m = calcular(P, { horas: 10, mult: null });
  assert.equal(m.recomendado.valor, null);
  assert.deepEqual(m.recomendado.falta, ['multiplicador']);
});

test('fórmula: parâmetro ausente conta como a definir, sem chute', () => {
  const { valor_hora, ...resto } = P;
  const r = calcular(resto, E);
  assert.equal(r.recomendado.valor, null);
  assert.ok(r.recomendado.falta.includes('valor_hora'));
});

test('urgência sugerida: prazo normal = ⌈horas × mult × (1 + risco) / capacidade × 7⌉ dias', () => {
  // 10 h × 1,5 × 1,1 = 16,5 h; 16,5 / 10 × 7 = 11,55, arredonda para 12 dias
  const base = { horas: 10, mult: 1.5, inicio: '2026-03-01' };
  const curto = sugerirUrgencia(P, { ...base, entrega: '2026-03-12' }); // 11 dias
  assert.deepEqual([curto.prazoNormal, curto.prazoDesejado, curto.sugerir], [12, 11, true]);
  const justo = sugerirUrgencia(P, { ...base, entrega: '2026-03-13' }); // 12 dias: não é menor
  assert.deepEqual([justo.prazoDesejado, justo.sugerir], [12, false]);
  assert.equal(sugerirUrgencia(P, { ...base, entrega: '2026-03-30' }).sugerir, false);
});

test('urgência sugerida: sem datas ou sem capacidade não sugere nada', () => {
  assert.equal(sugerirUrgencia(P, { horas: 10, mult: 1.5 }).sugerir, false);
  assert.equal(sugerirUrgencia(P, { horas: 10, mult: 1.5 }).prazoDesejado, null);
  const r = sugerirUrgencia({ ...P, capacidade_horas_semana: null }, { horas: 10, mult: 1.5, inicio: '2026-03-01', entrega: '2026-03-02' });
  assert.equal(r.sugerir, false);
  assert.deepEqual(r.falta, ['capacidade_horas_semana']);
  assert.equal(diasEntre('2026-02-27', '2026-03-02'), 3);
  assert.equal(diasEntre('2026-03-05', '2026-03-01'), -4);
});

// ---------- leitura de 70-negocio/precificacao.md ----------
const fs = require('node:fs');
const os = require('node:os');
const { lerPrecificacao, ARQUIVO } = require('../src/areas/orcamento/data');
const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');

test('parser: parâmetros pelo nome das colunas, ignorando coluna extra e sub-tabela', () => {
  const d = lerPrecificacao(VAULT);
  assert.equal(ARQUIVO, '70-negocio/precificacao.md');
  assert.deepEqual(d.avisos, []); // o exemplo não tem pendência
  assert.deepEqual(d.parametros.valor_hora, { valor: 50, unidade: 'R$/h', descricao: 'Valor/hora alvo' });
  assert.equal(d.parametros.margem_risco.valor, 0.1);
  assert.equal(d.parametros.deslocamento_km.valor, 2);
  assert.equal(d.parametros.hora_avulsa.valor, 60);
  assert.equal(Object.keys(d.parametros).length, 18); // 16 da calculadora + 2 só da proposta
});

test('parser: tipo de trabalho sem faixa de horas vira dois avisos e horas null', () => {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'orc-'));
  fs.mkdirSync(path.join(v, '70-negocio'));
  fs.writeFileSync(path.join(v, ARQUIVO), '## Tipos de trabalho\n\n| tipo | horas_min | horas_max |\n| --- | --- | --- |\n| Tipo Gama | a definir | a definir |\n');
  const d = lerPrecificacao(v);
  assert.deepEqual(d.tipos.map((t) => [t.tipo, t.horas_min, t.horas_max]), [['Tipo Gama', null, null]]);
  assert.ok(d.avisos.includes('Horas mínimas de "Tipo Gama" está a definir em 70-negocio/precificacao.md.'));
  assert.ok(d.avisos.includes('Horas máximas de "Tipo Gama" está a definir em 70-negocio/precificacao.md.'));
});

test('parser: tipos de trabalho e complexidade', () => {
  const d = lerPrecificacao(VAULT);
  assert.deepEqual(d.tipos.map((t) => [t.tipo, t.horas_min, t.horas_max]), [
    ['Tipo Alfa', 10, 20], ['Tipo Beta', 30, 61], ['Tipo Gama', 20, 40],
  ]);
  assert.deepEqual(d.complexidade, [
    { nivel: 'baixa', multiplicador: 1 }, { nivel: 'média', multiplicador: 1.5 }, { nivel: 'alta', multiplicador: 2 },
  ]);
});

function vaultCom(texto) {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), 'orc-'));
  if (texto != null) {
    fs.mkdirSync(path.join(v, '70-negocio'));
    fs.writeFileSync(path.join(v, ARQUIVO), texto);
  }
  return v;
}

test('parser: "a definir", ausente e arquivo inexistente viram aviso, sem valor chutado', () => {
  const d = lerPrecificacao(vaultCom([
    '## Parâmetros', '', '| chave | valor |', '| --- | --- |', '| valor_hora | _a definir_ |', '| imposto | 0,06 |', '',
    '## Complexidade', '', '| nivel | multiplicador |', '| --- | --- |', '| baixa | a definir |',
  ].join('\n')));
  assert.equal(d.parametros.valor_hora.valor, null);
  assert.equal(d.parametros.imposto.valor, 0.06);
  assert.equal(d.parametros.entrada.valor, null); // ausente na tabela
  assert.ok(d.avisos.some((a) => a.includes('valor_hora') && a.includes('a definir')));
  assert.ok(d.avisos.some((a) => a.includes('entrada') && a.includes('não está')));
  assert.ok(d.avisos.some((a) => a.includes('"Tipos de trabalho"')));
  assert.equal(d.complexidade[0].multiplicador, null);

  const sem = lerPrecificacao(vaultCom(null));
  assert.equal(sem.existe, false);
  assert.ok(sem.avisos[0].includes(ARQUIVO));
  assert.deepEqual(sem.tipos, []);
});

// ---------- área registrada: API, origem, menu e fórmula servida ----------
const http = require('node:http');
const { criarServidor } = require('../src/app');
const { loadConfig } = require('../src/config');
const areas = require('../src/areas');

function pedir(server, rota) {
  const { port } = server.address();
  return new Promise((ok, falha) => {
    http.get({ host: '127.0.0.1', port, path: rota }, (res) => {
      let corpo = '';
      res.on('data', (c) => (corpo += c));
      res.on('end', () => ok({ status: res.statusCode, corpo, tipo: res.headers['content-type'] }));
    }).on('error', falha);
  });
}

test('servidor: /api/orcamento, origem, menu e a mesma fórmula em /static', async (t) => {
  const { server } = criarServidor({ ...loadConfig(['--demo']), port: 0 }, areas);
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  t.after(() => server.close());

  const api = JSON.parse((await pedir(server, '/api/orcamento')).corpo);
  assert.equal(api.parametros.valor_hora.valor, 50);
  assert.equal(api.tipos.length, 3);

  const fontes = JSON.parse((await pedir(server, '/api/fontes/orcamento')).corpo);
  assert.deepEqual(fontes.itens.map((i) => [i.caminho, i.existe]), [['70-negocio/precificacao.md', true]]);
  assert.equal(fontes.itens[0].link, 'obsidian://open?vault=vault-exemplo&file=70-negocio%2Fprecificacao');

  const nav = JSON.parse((await pedir(server, '/api/nav')).corpo);
  const item = nav.grupos.find((g) => g.nome === 'Trabalho').itens.find((i) => i.id === 'orcamento');
  assert.equal(item.estado, 'ativo');
  assert.deepEqual(nav.avisos, []);

  assert.equal((await pedir(server, '/orcamento')).status, 200);
  const formula = await pedir(server, '/static/orcamento/formula.js');
  assert.equal(formula.status, 200);
  assert.equal(formula.corpo, fs.readFileSync(path.join(__dirname, '..', 'public', 'orcamento', 'formula.js'), 'utf8'));
});

// ---------- resumo copiado: só aqui entram garantia e hora avulsa ----------
const { montarResumo } = require('../public/orcamento/resumo');

test('resumo: texto simples para proposta, com garantia e hora avulsa e sem piso nem margem', () => {
  const PP = { ...P, revisoes_incluidas: 2, garantia_dias: 45, hora_avulsa: 60 };
  const entrada = { ...E, urgente: true, revisoesExtras: 1 };
  const r = calcular(PP, entrada);
  const txt = montarResumo(PP, r, { tipo: 'Tipo Alfa', urgente: true, revisoesExtras: 1, inicio: '2026-03-01', entrega: '2026-03-20' });
  assert.deepEqual(txt.split('\n'), [
    'Orçamento: Tipo Alfa',
    `Valor: ${brl(r.recomendado.valor)}`,
    `Entrada (40%): ${brl(r.entrada.valor)}, antes de começar`,
    `Saldo na entrega: ${brl(r.recomendado.valor - r.entrada.valor)}`,
    'Revisões: 2 rodadas incluídas, mais 1 extra já somada ao valor',
    'Prazo: início em 01/03/2026, entrega em 20/03/2026 (urgente)',
    'Garantia: 45 dias para correção de bugs da entrega, sem custo.',
    `Depois da garantia: manutenção a ${brl(60)} por hora.`,
  ]);
  assert.match(txt, /R\$ \d/); // espaço comum, não o espaço sem quebra do Intl
  assert.doesNotMatch(txt, /piso|margem|imposto/i);
});

function brl(n) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n).replace(/ /g, ' ');
}

test('resumo: sem valor recomendado não há resumo; garantia ausente some do texto', () => {
  assert.equal(montarResumo(P, calcular({ ...P, imposto: null }, E), {}), null);
  const txt = montarResumo(P, calcular(P, E), {});
  assert.doesNotMatch(txt, /Garantia|Depois da garantia|Prazo|Revisões/);
  assert.match(txt, /^Orçamento: Trabalho sob medida\n/);
});
