'use strict';

// Leitura compartilhada por /propostas e /contratos: o perfil do prestador
// (70-negocio/perfil.md) e os modelos de documento (70-negocio/modelos/*.md).
// Valor "a definir" ou vazio no perfil vira campo vazio; o aviso "Perfil incompleto"
// vale só para os campos obrigatórios de quem chama. Só leitura.

const fs = require('node:fs');
const path = require('node:path');
const { parseTables, stripFrontmatter } = require('./md');

const ARQUIVO_PERFIL = '70-negocio/perfil.md';
// Campos do perfil sem os quais a proposta fica incompleta; nome_comercial e site são opcionais.
const CHAVES_PERFIL_OBRIGATORIAS = ['nome', 'email', 'whatsapp', 'cidade_uf'];

const norm = (s) => String(s ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/[_*\s]+/g, ' ').trim();
const limpo = (s) => String(s ?? '').replace(/[`*]/g, '').replace(/^_+|_+$/g, '').trim();
const vazio = (s) => norm(s) === '' || norm(s) === 'a definir';

// Tabela chave | valor (colunas pelo nome, em qualquer ordem; extras ignoradas) do
// texto inteiro: o perfil não precisa de seção. { chave: valor | '' }.
function lerTabelaChaveValor(texto) {
  for (const t of parseTables(stripFrontmatter(texto))) {
    const cab = t.header.map(norm);
    const ic = cab.indexOf('chave');
    const iv = cab.indexOf('valor');
    if (ic < 0 || iv < 0) continue;
    const campos = {};
    for (const r of t.rows) {
      const chave = limpo(r[ic]);
      if (chave) campos[chave] = vazio(r[iv]) ? '' : limpo(r[iv]);
    }
    return campos;
  }
  return null;
}

function lerPerfil(vault, obrigatorias = CHAVES_PERFIL_OBRIGATORIAS) {
  const abs = path.join(vault, ARQUIVO_PERFIL);
  if (!fs.existsSync(abs)) {
    return { arquivo: ARQUIVO_PERFIL, existe: false, campos: {}, avisos: [`Perfil incompleto: ${ARQUIVO_PERFIL} não existe. Crie o arquivo com uma tabela de colunas chave e valor.`] };
  }
  const campos = lerTabelaChaveValor(fs.readFileSync(abs, 'utf8'));
  if (!campos) {
    return { arquivo: ARQUIVO_PERFIL, existe: true, campos: {}, avisos: [`Perfil incompleto: tabela com colunas chave e valor não encontrada em ${ARQUIVO_PERFIL}.`] };
  }
  const faltam = obrigatorias.filter((k) => !campos[k]);
  const avisos = faltam.length ? [`Perfil incompleto: ${faltam.join(', ')} ${faltam.length === 1 ? 'está' : 'estão'} a definir em ${ARQUIVO_PERFIL}.`] : [];
  return { arquivo: ARQUIVO_PERFIL, existe: true, campos, avisos };
}

// Corpo do modelo sem o que é só para quem edita: frontmatter, citações (">") e
// linhas "---". Sobra o texto do documento, com os {{campos}}.
function limparModelo(texto) {
  return stripFrontmatter(texto)
    .split(/\r?\n/)
    .filter((l) => !/^\s*>/.test(l) && !/^\s*---+\s*$/.test(l))
    .join('\n')
    .replace(/^\s+/, '')
    .replace(/\s+$/, '');
}

// arquivo: caminho do modelo no vault; exemplo: os campos citados na dica de quando ele não existe.
function lerModelo(vault, arquivo, exemplo) {
  const abs = path.join(vault, arquivo);
  if (!fs.existsSync(abs)) {
    return { arquivo, existe: false, texto: '', avisos: [`${arquivo} não existe. Crie o modelo com campos ${exemplo} etc.`] };
  }
  const texto = limparModelo(fs.readFileSync(abs, 'utf8'));
  return { arquivo, existe: true, texto, avisos: texto ? [] : [`${arquivo} está vazio.`] };
}

module.exports = { lerPerfil, lerModelo, limparModelo, lerTabelaChaveValor, ARQUIVO_PERFIL, CHAVES_PERFIL_OBRIGATORIAS };
