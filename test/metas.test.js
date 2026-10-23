'use strict';

// Vault de exemplo (hoje fixo em 2026-03-10) e tabelas inventadas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { avaliar, parseManuais, readMetas } = require('../src/areas/metas/data');
const metas = require('../src/areas/metas');
const areas = require('../src/areas');
const { montarHome } = require('../src/home');
const { loadSiteConfig } = require('../src/config');

const VAULT = path.join(__dirname, 'fixtures', 'vault-exemplo');
const HOJE = '2026-03-10';
const CFG = loadSiteConfig().financeiro.diagnostico;
const CTX = { hoje: HOJE, demo: true };

const todas = (d) => d.areas.flatMap((a) => a.metas);
const achar = (d, nome) => todas(d).find((m) => m.nome === nome);

// Janela de 100 dias a partir de 2026-01-01: o dia N da janela é N% do tempo.
const janela = (diaDeHoje) => ({ inicio: '2026-01-01', prazo: '2026-04-11', hoje: require('../src/datas').addDays('2026-01-01', diaDeHoje) });
const comTempo = (pct, atual) => {
  const j = janela(pct);
  return avaliar({ alvo: 100, atual, inicio: j.inicio, prazo: j.prazo }, j.hoje);
};

test('avaliar: progresso é atual / alvo, limitado a 100%', () => {
  assert.equal(avaliar({ alvo: 8, atual: 4 }, HOJE).progresso, 50);
  assert.equal(avaliar({ alvo: 3, atual: 1 }, HOJE).progresso, 33.33);
  assert.equal(avaliar({ alvo: 10, atual: 15 }, HOJE).progresso, 100);
  // 99,996% não vira 100%: concluída é atual >= alvo, não o número arredondado
  const quase = avaliar({ alvo: 25000, atual: 24999, inicio: '2026-01-01', prazo: '2026-12-31' }, HOJE);
  assert.notEqual(quase.status, 'concluida');
});

test('avaliar: sem datas só tem a barra, sem status nem ritmo', () => {
  assert.deepEqual(avaliar({ alvo: 10, atual: 4 }, HOJE), { progresso: 40, tempo: null, status: null, ritmo: null, diasParaPrazo: null });
});

test('avaliar: tempo decorrido = (hoje − início) / (prazo − início)', () => {
  const a = avaliar({ alvo: 10, atual: 3, inicio: '2026-03-01', prazo: '2026-03-31' }, HOJE);
  assert.equal(a.tempo, 30);
  assert.equal(avaliar({ alvo: 10, atual: 3, inicio: '2026-03-20', prazo: '2026-03-31' }, HOJE).tempo, 0); // ainda não começou
  assert.equal(avaliar({ alvo: 10, atual: 3, inicio: '2026-02-01', prazo: '2026-02-28' }, HOJE).tempo, 100); // prazo passou
});

test('avaliar: no ritmo até 10 pontos abaixo do tempo, atenção até 25, atrasada abaixo', () => {
  // tempo = 50%
  assert.equal(comTempo(50, 60).status, 'no-ritmo'); // à frente
  assert.equal(comTempo(50, 40).status, 'no-ritmo'); // exatamente −10
  assert.equal(comTempo(50, 39).status, 'atencao'); // −11
  assert.equal(comTempo(50, 25).status, 'atencao'); // exatamente −25
  assert.equal(comTempo(50, 24).status, 'atrasada'); // −26
  assert.equal(comTempo(50, 0).status, 'atrasada');
});

test('avaliar: concluída com 100%, atrasada com o prazo vencido e menos de 100%', () => {
  assert.equal(comTempo(50, 100).status, 'concluida');
  // concluída fora do prazo continua concluída
  assert.equal(avaliar({ alvo: 5, atual: 5, inicio: '2026-01-01', prazo: '2026-02-01' }, HOJE).status, 'concluida');
  const vencida = avaliar({ alvo: 10, atual: 9, inicio: '2026-01-01', prazo: '2026-03-09' }, HOJE);
  assert.equal(vencida.status, 'atrasada'); // 90% de progresso, mas o prazo passou
  assert.equal(vencida.diasParaPrazo, -1);
  // no dia do prazo ainda vale a regra de ritmo (90% contra 100% do tempo)
  assert.equal(avaliar({ alvo: 10, atual: 9, inicio: '2026-01-01', prazo: HOJE }, HOJE).status, 'no-ritmo');
});

test('avaliar: ritmo necessário = (alvo − atual) / semanas até o prazo', () => {
  // 21 dias até o prazo = 3 semanas; faltam 7
  const a = avaliar({ alvo: 10, atual: 3, inicio: '2026-03-01', prazo: '2026-03-31' }, HOJE);
  assert.deepEqual(a.ritmo, { faltam: 7, semanas: 3, porSemana: 2.33 });
  assert.equal(a.diasParaPrazo, 21);
  // dinheiro: faltam 400 em 3 semanas
  assert.equal(avaliar({ alvo: 500, atual: 100, inicio: '2026-03-01', prazo: '2026-03-31' }, HOJE).ritmo.porSemana, 133.33);
  // prazo vencido ou hoje: diz o que falta, mas não inventa ritmo
  assert.deepEqual(avaliar({ alvo: 10, atual: 4, inicio: '2026-01-01', prazo: HOJE }, HOJE).ritmo, { faltam: 6, semanas: 0, porSemana: null });
  assert.equal(avaliar({ alvo: 10, atual: 4, inicio: '2026-01-01', prazo: '2026-03-01' }, HOJE).ritmo.porSemana, null);
  // concluída não tem ritmo
  assert.equal(avaliar({ alvo: 10, atual: 10, inicio: '2026-03-01', prazo: '2026-03-31' }, HOJE).ritmo, null);
});

test('parseManuais: lê a tabela pelo nome das colunas, na ordem do arquivo', () => {
  const avisos = [];
  const lista = parseManuais([
    '| obs | prazo | meta | area | atual | alvo | unidade | inicio | extra |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    '| nota | 2026-06-30 | Ler livros | Estudos | 2 | 12 | livros | 2026-01-01 | x |',
    '| | | Juntar | dinheiro | R$ 1.000 | R$ 5.000 | R$ | | |',
  ].join('\n'), avisos);
  assert.deepEqual(avisos, []);
  assert.equal(lista.length, 2);
  assert.deepEqual(lista[0], {
    nome: 'Ler livros', area: 'estudos', origem: 'manual', rota: null, alvo: 12, atual: 2, unidade: 'livros',
    inicio: '2026-01-01', prazo: '2026-06-30', obs: 'nota', projecao: null,
  });
  assert.deepEqual([lista[1].alvo, lista[1].atual, lista[1].inicio, lista[1].prazo], [5000, 1000, null, null]);
});

test('parseManuais: linha inválida vira aviso e sai, nunca valor chutado', () => {
  const avisos = [];
  const lista = parseManuais([
    '| meta | area | alvo | atual | unidade | inicio | prazo | obs |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    '| Boa | pessoal | 10 | 1 | | | | |',
    '| | pessoal | 10 | 1 | | | | |',
    '| Área errada | hobby | 10 | 1 | | | | |',
    '| Alvo texto | pessoal | muito | 1 | | | | |',
    '| Alvo zero | pessoal | 0 | 0 | | | | |',
    '| Atual vazio | pessoal | 10 | | | | | |',
    '| Só início | pessoal | 10 | 1 | | 2026-01-01 | | |',
    '| Data ruim | pessoal | 10 | 1 | | 2026-02-30 | 2026-06-01 | |',
    '| Prazo antes | pessoal | 10 | 1 | | 2026-06-01 | 2026-01-01 | |',
  ].join('\n'), avisos);
  assert.deepEqual(lista.map((m) => m.nome), ['Boa']);
  assert.equal(avisos.length, 8);
  assert.match(avisos[0], /linha 2: sem nome/);
  assert.match(avisos[1], /"Área errada".*área "hobby" desconhecida/);
  assert.match(avisos[2], /alvo "muito"/);
  assert.match(avisos[3], /alvo "0"/);
  assert.match(avisos[4], /atual ""/);
  assert.match(avisos[5], /inicio e prazo juntos/);
  assert.match(avisos[6], /inicio "2026-02-30"/);
  assert.match(avisos[7], /depois do início/);
  assert.ok(avisos.every((a) => a.startsWith('10-diario/metas.md, linha')));
});

test('parseManuais: sem a tabela esperada é um aviso', () => {
  const avisos = [];
  assert.deepEqual(parseManuais('# Metas\n\nsó texto', avisos), []);
  assert.equal(avisos.length, 1);
  assert.match(avisos[0], /tabela .* não encontrada/);
});

test('exemplo: uma meta de cada status, com hoje fixo', () => {
  const d = readMetas(VAULT, HOJE, CFG);
  assert.deepEqual(d.avisos, []);
  assert.deepEqual(d.manual, { arquivo: '10-diario/metas.md', existe: true });
  const status = (nome) => achar(d, nome).status;
  assert.equal(status('Publicar artigos'), 'no-ritmo');
  assert.equal(status('Módulos de redes'), 'atencao');
  assert.equal(status('Propostas enviadas'), 'atrasada');
  assert.equal(status('Corrida do mês'), 'concluida');
  assert.equal(status('Quitar o cartão'), null);
  assert.deepEqual(d.resumo, { total: 10, noRitmo: 1, atencao: 1, atrasadas: 1, concluidas: 1, semStatus: 6 });
  assert.equal(achar(d, 'Propostas enviadas').ritmo.porSemana, 3.33);
});

test('agrupa por área na ordem carreira, estudos, dinheiro, negócio, pessoal', () => {
  const d = readMetas(VAULT, HOJE, CFG);
  assert.deepEqual(d.areas.map((a) => [a.id, a.nome]), [
    ['carreira', 'Carreira'], ['estudos', 'Estudos'], ['dinheiro', 'Dinheiro'], ['negocio', 'Negócio'], ['pessoal', 'Pessoal'],
  ]);
  assert.deepEqual(d.areas.find((a) => a.id === 'dinheiro').metas.map((m) => m.nome), ['Marco (panela principal até o marco)', 'Reserva', 'Meta final (panela principal)', 'Quitar o cartão']);
});

test('automáticas do financeiro: a panela das metas contra o marco, reserva e meta final, com a projeção do diagnóstico', () => {
  const d = readMetas(VAULT, HOJE, CFG);
  const marco = achar(d, 'Marco (panela principal até o marco)');
  assert.deepEqual([marco.atual, marco.alvo, marco.progresso, marco.origem, marco.unidade, marco.status], [1600, 2000, 80, 'financeiro', 'R$', null]);
  assert.deepEqual(marco.projecao, { tipo: 'valor', valor: 2100, data: '2026-04-01' }); // mesma projeção do diagnóstico
  const reserva = achar(d, 'Reserva');
  assert.deepEqual([reserva.atual, reserva.alvo, reserva.progresso], [300, 1000, 30]);
  assert.deepEqual(reserva.projecao, { tipo: 'salarios', salarios: 4 });
  const metaFinal = achar(d, 'Meta final (panela principal)');
  assert.deepEqual([metaFinal.atual, metaFinal.alvo, metaFinal.progresso, metaFinal.projecao], [1600, 25000, 6.4, null]);
});

test('automáticas dos estudos: progresso de cada roadmap, como a página de estudos', () => {
  const d = readMetas(VAULT, HOJE, CFG);
  const r = achar(d, 'Roadmap de Exemplo');
  assert.deepEqual([r.atual, r.alvo, r.progresso, r.unidade, r.origem, r.rota], [4, 8, 50, 'passos', 'estudos', '/estudos']);
  assert.equal(r.obs, 'Próximo: Laços');
  assert.equal(r.status, null);
});

test('sem metas.md: só as automáticas, sem aviso, e a página recebe existe: false', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'metas-'));
  fs.cpSync(VAULT, vault, { recursive: true });
  fs.rmSync(path.join(vault, '10-diario', 'metas.md'));
  const d = readMetas(vault, HOJE, CFG);
  assert.deepEqual(d.manual, { arquivo: '10-diario/metas.md', existe: false });
  assert.deepEqual(d.avisos, []);
  assert.deepEqual(todas(d).map((m) => m.origem), ['estudos', 'estudos', 'financeiro', 'financeiro', 'financeiro']);
  assert.deepEqual(d.resumo, { total: 5, noRitmo: 0, atencao: 0, atrasadas: 0, concluidas: 0, semStatus: 5 });
  fs.rmSync(vault, { recursive: true });
});

test('financeiro ilegível: aviso e as demais metas continuam', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'metas-'));
  fs.cpSync(VAULT, vault, { recursive: true });
  fs.rmSync(path.join(vault, '40-financeiro'), { recursive: true });
  const d = readMetas(vault, HOJE, CFG);
  assert.equal(d.avisos.length, 1);
  assert.match(d.avisos[0], /^Metas do financeiro indisponíveis/);
  assert.equal(todas(d).filter((m) => m.origem === 'financeiro').length, 0);
  assert.equal(achar(d, 'Publicar artigos').status, 'no-ritmo');
  fs.rmSync(vault, { recursive: true });
});

test('meta ausente em panelas.md não é chutada', () => {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'metas-'));
  fs.cpSync(VAULT, vault, { recursive: true });
  const arq = path.join(vault, '40-financeiro', 'panelas.md');
  fs.writeFileSync(arq, fs.readFileSync(arq, 'utf8').replace(/^- Reserva: meta.*$/m, ''));
  const d = readMetas(vault, HOJE, CFG);
  assert.equal(achar(d, 'Reserva'), undefined);
  assert.ok(achar(d, 'Marco (panela principal até o marco)'));
  fs.rmSync(vault, { recursive: true });
});

test('resumo da Home: contagem e uma entrada por meta atrasada', () => {
  const r = metas.resumo(VAULT, CTX);
  assert.equal(r.titulo, 'Metas');
  assert.deepEqual(r.itens[0].contagem, { total: 10, noRitmo: 1, atencao: 1, atrasadas: 1, concluidas: 1, semStatus: 6 });
  assert.deepEqual(r.itens.slice(1), [
    { rotulo: 'Propostas enviadas', valor: 'atrasada', tipo: 'texto', status: 'vermelho', atrasada: true, prazo: '2026-03-31', rota: '/metas' },
  ]);
});

test('Home: a área Metas aparece e a meta atrasada chega como item de atenção', () => {
  const h = montarHome(areas, VAULT, { ...CTX, areas });
  const cartao = h.cartoes.find((c) => c.area === 'metas');
  assert.ok(cartao);
  assert.equal(cartao.rota, '/metas');
  assert.equal(cartao.erro, undefined);
  assert.deepEqual(cartao.itens.filter((i) => i.atrasada).map((i) => i.rotulo), ['Propostas enviadas']);
});

test('área: contrato, API e fontes', () => {
  assert.equal(metas.id, 'metas');
  assert.deepEqual(metas.fontes(), ['10-diario/metas.md', '40-financeiro/panelas.md', '60-estudos']);
  assert.equal(metas.api[''](VAULT, CTX).resumo.total, 10);
});
