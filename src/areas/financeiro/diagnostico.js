'use strict';

// Diagnóstico do financeiro: regras determinísticas sobre panelas.md e movimentos.md.
// Premissas vêm de config.json (financeiro.diagnostico). Nada aqui escreve no vault.

const { lerArquivos, parsePanelas, parseMovimentos } = require('./data');
const { round2 } = require('../../md');
const { formato, formatoPublico } = require('./formato');
const { localISODate, addDays, addMonths, diffDays, diaDaSemana } = require('../../datas');

const VERDE = 'verde';
const AMARELO = 'amarelo';
const VERMELHO = 'vermelho';
const SEM_DADOS = 'sem-dados';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const entre = (m, inicio, fim) => m.data >= inicio && m.data <= fim;
const soma = (lista) => round2(lista.reduce((a, m) => a + m.valor, 0));
const pct = (parte, todo) => (todo ? (parte / todo) * 100 : null);

function listaPt(itens) {
  if (itens.length <= 1) return itens.join('');
  return itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
}

function validarConfig(cfg) {
  const faltando = [];
  const exigir = (caminho) => {
    const v = caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), cfg);
    if (v === undefined) faltando.push(caminho);
  };
  [
    'proximoSalario.mesesDepoisDoUltimo', 'proximoBeneficio.valorMinimo', 'proximoBeneficio.ignorarDescricaoContendo',
    'proximoBeneficio.diasDepois', 'transportePorDia.diaUtil', 'transportePorDia.sabado', 'transportePorDia.domingo',
    'ignorarDescricaoComecandoCom', 'categorias', 'categoriaPadrao', 'janelas.mediaVrDias', 'janelas.mediaDiaADiaDias',
    'janelas.comidaRecenteDias', 'janelas.comidaAnteriorDias', 'semaforo.orcamentoAmareloPontos',
    'semaforo.orcamentoVermelhoPontos', 'semaforo.vrAmareloExcesso', 'semaforo.diaADiaAmareloFator',
    'avisoGastoNaoLancadoContendo',
  ].forEach(exigir);
  if (faltando.length) throw new Error(`config.json: faltam financeiro.diagnostico.${faltando.join(', financeiro.diagnostico.')}`);
}

// Gasto = saída com valor, ignorando descrições que começam com o prefixo de ajuste; cada gasto ganha a categoria
// por palavra-chave (sem acento nem maiúscula, na ordem do config; a primeira que casar vale).
function categorizarGastos(movimentos, cfg) {
  const categorias = Object.entries(cfg.categorias).map(([nome, chaves]) => [nome, chaves.map(norm)]);
  const categoria = (m) => {
    const d = norm(m.descricao);
    for (const [nome, chaves] of categorias) if (chaves.some((k) => d.includes(k))) return nome;
    return cfg.categoriaPadrao;
  };
  const ignorar = norm(cfg.ignorarDescricaoComecandoCom);
  return movimentos
    .filter((m) => norm(m.tipo) === 'saida' && m.valor != null && !norm(m.descricao).startsWith(ignorar))
    .map((m) => ({ ...m, categoria: categoria(m) }));
}

function diagnosticar(p, movimentos, cfg, hoje, avisosLeitura = []) {
  validarConfig(cfg);
  const avisos = [...avisosLeitura];

  const saldo = (id) => {
    const s = p.saldos.find((x) => x.id === id);
    if (!s || s.saldo == null) {
      avisos.push(`Saldo da panela "${id}" não pôde ser lido em panelas.md.`);
      return null;
    }
    return s.saldo;
  };
  const recebeuNoSalario = (id) => {
    const v = p.salario?.divisao?.find((x) => x.panela === id)?.valor;
    if (v == null) avisos.push(`Valor que "${id}" recebeu no último salário não pôde ser lido em panelas.md.`);
    return v ?? null;
  };

  const gastos = categorizarGastos(movimentos, cfg);

  // ---------- datas de referência ----------
  const salario = p.salario;
  if (!salario?.data) avisos.push('Último salário não encontrado em panelas.md (seção "Salário").');
  const proxSalario = salario?.data ? addMonths(salario.data, cfg.proximoSalario.mesesDepoisDoUltimo) : null;

  const ultimaEntradaBeneficio = (id) => {
    const ign = norm(cfg.proximoBeneficio.ignorarDescricaoContendo);
    const candidatas = movimentos.filter(
      (m) => m.panela === id && norm(m.tipo) === 'entrada' && m.valor != null &&
        m.valor >= cfg.proximoBeneficio.valorMinimo && !norm(m.descricao).includes(ign),
    );
    if (!candidatas.length) {
      avisos.push(`Nenhuma entrada de ${id.toUpperCase()} com valor ≥ ${cfg.proximoBeneficio.valorMinimo} encontrada em movimentos.md.`);
      return null;
    }
    const base = candidatas.reduce((a, b) => (b.data >= a.data ? b : a));
    return { base, proxima: addDays(base.data, cfg.proximoBeneficio.diasDepois) };
  };
  const vt = ultimaEntradaBeneficio('vt');
  const vr = ultimaEntradaBeneficio('vr');

  const indicadores = [];

  // ---------- 1. Metas ----------
  {
    const F = formato();
    const painel = saldo(F.painelMeta); // a panela das metas (o nome dela vem de config → formato)
    const recPainel = recebeuNoSalario(F.painelMeta);
    const marco = p.metasFaltando.includes('marco') ? null : p.metas.marco;
    const reserva = saldo('reserva');
    const recReserva = recebeuNoSalario('reserva');
    const metaReserva = p.metasFaltando.includes('reserva') ? null : p.metas.reserva;

    const ind = { id: 'metas', nome: 'metas', titulo: 'Metas', numeros: [] };
    if (painel == null || recPainel == null || marco == null || !proxSalario) {
      Object.assign(ind, { status: SEM_DADOS, resumo: F.rotulos.marcoSemDados, acao: F.rotulos.acaoSemDados });
    } else {
      const proj1 = round2(painel + recPainel);
      const proj2 = round2(painel + 2 * recPainel);
      const status = painel >= marco || proj1 >= marco ? VERDE : proj2 >= marco ? AMARELO : VERMELHO;
      const salariosMarco = painel >= marco ? 0 : recPainel > 0 ? Math.ceil((marco - painel) / recPainel) : null;
      ind.status = status;
      ind.resumo = painel >= marco
        ? `${F.rotulos.marcoPago} R$ ${painel.toFixed(2)} (marco ${marco}).`
        : `${F.rotulos.marcoProjetado} (${proxSalario}): R$ ${proj1.toFixed(2)} de ${marco}.`;
      ind.acao = {
        [VERDE]: painel >= marco ? F.rotulos.acaoVerdeFeito : F.rotulos.acaoVerde,
        [AMARELO]: F.rotulos.acaoAmarelo,
        [VERMELHO]: F.rotulos.acaoVermelho.replace('{n}', salariosMarco ?? '?'),
      }[status];
      ind.numeros.push(
        { rotulo: F.rotulos.painelHoje, valor: painel, tipo: 'brl' },
        { rotulo: F.rotulos.painelRecebe, valor: recPainel, tipo: 'brl' },
        { rotulo: 'Projeção no próximo salário', valor: proj1, tipo: 'brl' },
        { rotulo: 'Projeção no 2º salário', valor: proj2, tipo: 'brl' },
      );
      ind.projecaoMarco = proj1;
    }
    if (reserva != null && recReserva != null && metaReserva != null) {
      const n = reserva >= metaReserva ? 0 : recReserva > 0 ? Math.ceil((metaReserva - reserva) / recReserva) : null;
      ind.reserva = { saldo: reserva, meta: metaReserva, porSalario: recReserva, salarios: n };
      ind.numeros.push({
        rotulo: `Reserva até ${metaReserva}`,
        valor: n === 0 ? 'completa' : n == null ? 'não recebe no salário' : `${n} salário${n > 1 ? 's' : ''}`,
        tipo: 'texto',
      });
    }
    indicadores.push(ind);
  }

  // ---------- 2. Orçamento livre do ciclo ----------
  {
    const ind = { id: 'orcamento', nome: 'orçamento livre', titulo: 'Orçamento livre do ciclo (pessoal + margem)', numeros: [] };
    const orcP = recebeuNoSalario('pessoal');
    const orcM = recebeuNoSalario('margem');
    const sP = saldo('pessoal');
    const sM = saldo('margem');
    const restantes = proxSalario ? diffDays(proxSalario, hoje) : null;
    if (proxSalario && restantes <= 0)
      avisos.push(`O próximo salário (${proxSalario}) já deveria ter entrado e não está registrado em panelas.md.`);

    if (orcP == null || orcM == null || sP == null || sM == null || !proxSalario || restantes <= 0) {
      Object.assign(ind, { status: SEM_DADOS, resumo: 'Faltam dados para medir o ciclo.', acao: 'Confira o último salário e os saldos de pessoal e margem.' });
    } else {
      const doCiclo = gastos.filter((m) => entre(m, salario.data, hoje));
      const gastoP = soma(doCiclo.filter((m) => m.panela === 'pessoal'));
      const gastoM = soma(doCiclo.filter((m) => m.panela === 'margem'));
      const orc = round2(orcP + orcM);
      const gasto = round2(gastoP + gastoM);
      const decorridos = diffDays(hoje, salario.data) + 1;
      const total = diffDays(proxSalario, salario.data);
      const gastoPct = pct(gasto, orc);
      const cicloPct = pct(decorridos, total);
      const sem = cfg.semaforo;
      const status = gastoPct <= cicloPct + sem.orcamentoAmareloPontos ? VERDE
        : gastoPct <= cicloPct + sem.orcamentoVermelhoPontos ? AMARELO : VERMELHO;
      const porDia = round2((sP + sM) / restantes);
      const pessoalDia = round2(sP / restantes);
      const assinaturas = soma(doCiclo.filter((m) => m.panela === 'pessoal' && m.categoria === 'assinaturas/serviços'));

      Object.assign(ind, {
        status,
        resumo: `${gastoPct.toFixed(0)}% do orçamento gasto com ${cicloPct.toFixed(0)}% do ciclo decorrido (${decorridos} de ${total} dias).`,
        acao: {
          [VERDE]: `Ritmo ok: dá para gastar até R$ ${porDia.toFixed(2)}/dia até ${proxSalario}.`,
          [AMARELO]: `Gasto à frente do ciclo: segure em R$ ${porDia.toFixed(2)}/dia (pessoal R$ ${pessoalDia.toFixed(2)}/dia) até ${proxSalario}.`,
          [VERMELHO]: `Gasto bem à frente do ciclo: só o essencial; sobram R$ ${porDia.toFixed(2)}/dia até ${proxSalario}.`,
        }[status],
        gastoPct: round2(gastoPct),
        cicloPct: round2(cicloPct),
        porDia,
        pessoalDia,
        assinaturasPessoal: assinaturas,
      });
      ind.panelas = [
        { id: 'pessoal', orcamento: orcP, gasto: gastoP, pct: round2(pct(gastoP, orcP)), saldo: sP },
        { id: 'margem', orcamento: orcM, gasto: gastoM, pct: round2(pct(gastoM, orcM)), saldo: sM },
      ];
      ind.numeros.push(
        { rotulo: 'Orçamento do ciclo', valor: orc, tipo: 'brl' },
        { rotulo: 'Gasto desde ' + salario.data, valor: gasto, tipo: 'brl' },
        { rotulo: 'Sobra por dia (pessoal + margem)', valor: porDia, tipo: 'brl' },
        { rotulo: 'Sobra por dia só do pessoal', valor: pessoalDia, tipo: 'brl' },
        { rotulo: 'Pessoal em assinaturas/serviços', valor: assinaturas, tipo: 'brl' },
      );
    }
    indicadores.push(ind);
  }

  // ---------- 3. VR ----------
  {
    const ind = { id: 'vr', nome: 'VR', titulo: 'VR', numeros: [] };
    const sVr = saldo('vr');
    const dias = vr ? diffDays(vr.proxima, hoje) : null;
    if (vr && dias <= 0) avisos.push(`O próximo VR (${vr.proxima}) já deveria ter entrado e não está em movimentos.md.`);
    if (sVr == null || !vr || dias <= 0) {
      Object.assign(ind, { status: SEM_DADOS, resumo: 'Faltam dados do VR.', acao: 'Confira o saldo do VR e a última entrada do benefício.' });
    } else {
      const janela = cfg.janelas.mediaVrDias;
      // Contas sem arredondar; arredonda só no que é exibido.
      const media = soma(gastos.filter((m) => m.panela === 'vr' && entre(m, addDays(hoje, -(janela - 1)), hoje))) / janela;
      const necessario = media * dias;
      const porDia = sVr / dias;
      const status = necessario <= sVr ? VERDE : necessario <= sVr * (1 + cfg.semaforo.vrAmareloExcesso) ? AMARELO : VERMELHO;
      Object.assign(ind, {
        status,
        resumo: `Média de R$ ${media.toFixed(2)}/dia × ${dias} dias = R$ ${necessario.toFixed(2)}, para um saldo de R$ ${sVr.toFixed(2)} (R$ ${porDia.toFixed(2)}/dia).`,
        acao: status === VERDE
          ? `O VR cobre até ${vr.proxima} com folga de R$ ${(sVr - necessario).toFixed(2)}.`
          : `Limite o VR a R$ ${porDia.toFixed(2)}/dia até ${vr.proxima}.`,
        media: round2(media),
        porDia: round2(porDia),
        necessario: round2(necessario),
      });
      ind.numeros.push(
        { rotulo: 'Saldo do VR', valor: sVr, tipo: 'brl' },
        { rotulo: 'Próximo VR', valor: vr.proxima, tipo: 'data' },
        { rotulo: 'Disponível por dia', valor: round2(porDia), tipo: 'brl' },
        { rotulo: `Média dos últimos ${janela} dias`, valor: round2(media), tipo: 'brl' },
      );
    }
    indicadores.push(ind);
  }

  // ---------- 4. Dia a dia (VT + cartão do trem) ----------
  {
    const ind = { id: 'diaadia', nome: 'dia a dia', titulo: 'Dia a dia (VT + cartão do trem)', numeros: [] };
    const sVt = saldo('vt');
    const sTrem = saldo('trem');
    const dias = vt ? diffDays(vt.proxima, hoje) : null;
    if (vt && dias <= 0) avisos.push(`O próximo VT (${vt.proxima}) já deveria ter entrado e não está em movimentos.md.`);
    if (sVt == null || sTrem == null || !vt || dias <= 0) {
      Object.assign(ind, { status: SEM_DADOS, resumo: 'Faltam dados do VT ou do cartão do trem.', acao: 'Confira os saldos de VT e trem e a última entrada do VT.' });
    } else {
      const pool = round2(sVt + sTrem);
      const t = cfg.transportePorDia;
      const contagem = { util: 0, sabado: 0, domingo: 0 };
      for (let i = 1; i <= dias; i++) {
        const w = diaDaSemana(addDays(hoje, i));
        contagem[w === 0 ? 'domingo' : w === 6 ? 'sabado' : 'util']++;
      }
      const transporte = round2(contagem.util * t.diaUtil + contagem.sabado * t.sabado + contagem.domingo * t.domingo);
      const resto = round2(pool - transporte);
      // Folga, média e excesso sem arredondar; arredonda só no que é exibido.
      const folga = resto / dias;
      const janela = cfg.janelas.mediaDiaADiaDias;
      const doDia = gastos.filter((m) => m.panela === 'vt' && entre(m, addDays(hoje, -(janela - 1)), hoje) &&
        m.categoria !== 'transporte' && m.categoria !== 'assinaturas/serviços');
      const media = soma(doDia) / janela;
      const fator = cfg.semaforo.diaADiaAmareloFator;
      let status;
      if (folga <= 0) status = media === 0 && resto >= 0 ? VERDE : VERMELHO;
      else status = media <= folga ? VERDE : media <= folga * fator ? AMARELO : VERMELHO;
      const excesso = Math.max(0, (media - folga) * dias);
      Object.assign(ind, {
        status,
        resumo: folga <= 0
          ? `O transporte projetado (R$ ${transporte.toFixed(2)}) já passa do saldo de VT + trem (R$ ${pool.toFixed(2)}).`
          : `Média de R$ ${media.toFixed(2)}/dia fora transporte contra folga de R$ ${folga.toFixed(2)}/dia até ${vt.proxima}.`,
        acao: status === VERDE
          ? `Folga de R$ ${folga.toFixed(2)}/dia para lanche e débito até ${vt.proxima}.`
          : `Gaste no máximo R$ ${Math.max(0, folga).toFixed(2)}/dia fora transporte; no ritmo atual faltam R$ ${excesso.toFixed(2)} até ${vt.proxima}.`,
        pool, transporte, folga: round2(folga), media: round2(media), excesso: round2(excesso), contagemDias: contagem,
      });
      ind.numeros.push(
        { rotulo: 'VT + trem hoje', valor: pool, tipo: 'brl' },
        { rotulo: `Transporte até ${vt.proxima}`, valor: transporte, tipo: 'brl' },
        { rotulo: 'Folga por dia', valor: round2(folga), tipo: 'brl' },
        { rotulo: `Média dos últimos ${janela} dias`, valor: round2(media), tipo: 'brl' },
        { rotulo: 'Excesso projetado', valor: round2(excesso), tipo: 'brl' },
      );
    }
    indicadores.push(ind);
  }

  // ---------- veredito ----------
  const com = (s) => indicadores.filter((i) => i.status === s).map((i) => i.nome);
  const vermelhos = com(VERMELHO);
  const amarelos = com(AMARELO);
  const semDados = com(SEM_DADOS);
  let veredito;
  if (vermelhos.length) veredito = { status: VERMELHO, texto: `Vale segurar os gastos em: ${listaPt(vermelhos)}.` };
  else if (amarelos.length) veredito = { status: AMARELO, texto: `De boa nas metas, mas com atenção em: ${listaPt(amarelos)}.` };
  else if (semDados.length) veredito = { status: SEM_DADOS, texto: `Sem dados suficientes para: ${listaPt(semDados)}.` };
  else veredito = { status: VERDE, texto: 'Você está de boa.' };
  if (semDados.length && veredito.status !== SEM_DADOS) veredito.texto += ` (Sem dados: ${listaPt(semDados)}.)`;

  // ---------- para onde foi o dinheiro ----------
  let paraOnde = null;
  if (salario?.data) {
    const doCiclo = gastos.filter((m) => entre(m, salario.data, hoje));
    const total = soma(doCiclo);
    const porCat = {};
    for (const m of doCiclo) porCat[m.categoria] = round2((porCat[m.categoria] || 0) + m.valor);
    const j = cfg.janelas;
    const fimAnterior = addDays(hoje, -j.comidaRecenteDias);
    const comida = (inicio, fim) => soma(naJanela(gastos, inicio, fim).filter((m) => m.categoria === 'comida fora'));
    const recente = comida(addDays(hoje, -(j.comidaRecenteDias - 1)), hoje);
    const anterior = comida(addDays(fimAnterior, -(j.comidaAnteriorDias - 1)), fimAnterior);
    paraOnde = {
      desde: salario.data,
      total,
      categorias: Object.entries(porCat)
        .sort((a, b) => b[1] - a[1])
        .map(([nome, valor]) => ({ nome, valor, pct: round2(pct(valor, total)) })),
      comidaFora: {
        recentePorDia: round2(recente / j.comidaRecenteDias),
        anteriorPorDia: round2(anterior / j.comidaAnteriorDias),
        recenteDias: j.comidaRecenteDias,
        anteriorDias: j.comidaAnteriorDias,
      },
    };

    // Ajustes de "gasto não lançado" na janela (mesmo os ignorados por começarem com "Ajuste").
    const chave = norm(cfg.avisoGastoNaoLancadoContendo);
    const inicioJanela = [salario.data, addDays(hoje, -(j.mediaDiaADiaDias - 1)), addDays(fimAnterior, -(j.comidaAnteriorDias - 1))].sort()[0];
    const naoLancados = movimentos.filter((m) => norm(m.tipo) === 'saida' && entre(m, inicioJanela, hoje) && norm(m.descricao).includes(chave));
    paraOnde.naoLancados = naoLancados.map((m) => ({ data: m.data, panela: m.panela, valor: m.valor, descricao: m.descricao }));
  }

  return {
    hoje,
    veredito,
    indicadores,
    paraOnde,
    referencias: {
      salario: salario ? { data: salario.data, valor: salario.valor, divisao: salario.divisao, proximo: proxSalario } : null,
      vt: vt && { base: { data: vt.base.data, valor: vt.base.valor, descricao: vt.base.descricao }, proxima: vt.proxima },
      vr: vr && { base: { data: vr.base.data, valor: vr.base.valor, descricao: vr.base.descricao }, proxima: vr.proxima },
    },
    premissas: cfg,
    formato: formatoPublico(formato()),
    avisos,
  };
}

function naJanela(gastos, inicio, fim) {
  return gastos.filter((m) => entre(m, inicio, fim));
}

function buildDiagnostico(panelasTxt, movimentosTxt, cfg, hoje) {
  const avisos = [];
  const p = parsePanelas(panelasTxt, avisos);
  const movimentos = parseMovimentos(movimentosTxt, avisos);
  return diagnosticar(p, movimentos, cfg, hoje, avisos);
}

function readDiagnostico(vault, cfg, hoje = localISODate()) {
  const { panelasTxt, movimentosTxt } = lerArquivos(vault);
  return buildDiagnostico(panelasTxt, movimentosTxt, cfg, hoje);
}

// Gastos (já com categoria) entre duas datas, inclusive, para os relatórios. Os avisos de leitura voltam junto.
function gastosDoPeriodo(vault, cfg, inicio, fim) {
  const avisos = [];
  const { movimentosTxt } = lerArquivos(vault);
  const gastos = categorizarGastos(parseMovimentos(movimentosTxt, avisos), cfg).filter((m) => m.data >= inicio && m.data <= fim);
  return { gastos, avisos };
}

module.exports = { readDiagnostico, buildDiagnostico, categorizarGastos, gastosDoPeriodo, addMonths, addDays, diffDays };
