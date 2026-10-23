'use strict';

// Menu lateral: nav.json + áreas registradas. Item cuja área está registrada
// fica ativo sozinho; o resto aparece como "em breve".

const ATIVO = 'ativo';
const EM_BREVE = 'em-breve';
const EMBUTIDAS = new Set(['home']); // páginas do próprio servidor, sem área

function montarNav(nav, areas) {
  const avisos = [];
  const registradas = new Set(areas.map((a) => a.id));
  const grupos = (Array.isArray(nav.grupos) ? nav.grupos : []).map((nome) => ({ nome, itens: [] }));
  const porGrupo = new Map(grupos.map((g) => [g.nome, g]));
  const porId = new Map();

  const grupo = (nome) => {
    if (!porGrupo.has(nome)) {
      const g = { nome, itens: [] };
      grupos.push(g);
      porGrupo.set(nome, g);
    }
    return porGrupo.get(nome);
  };

  if (!Array.isArray(nav.itens)) avisos.push('nav.json: falta a lista "itens".');
  for (const it of Array.isArray(nav.itens) ? nav.itens : []) {
    const faltando = ['id', 'titulo', 'rota', 'grupo', 'estado'].filter((k) => typeof it[k] !== 'string' || it[k] === '');
    if (faltando.length) {
      avisos.push(`nav.json: item "${it.id || '?'}" sem ${faltando.join(', ')}.`);
      continue;
    }
    if (it.estado !== ATIVO && it.estado !== EM_BREVE)
      avisos.push(`nav.json: "${it.id}" com estado "${it.estado}" (use "ativo" ou "em-breve").`);
    if (!porGrupo.has(it.grupo)) avisos.push(`nav.json: grupo "${it.grupo}" de "${it.id}" não está em "grupos".`);

    const areaId = it.area || it.pai || it.id;
    const disponivel = EMBUTIDAS.has(it.id) || registradas.has(areaId);
    if (it.estado === ATIVO && !disponivel)
      avisos.push(`nav.json: "${it.id}" está como ativo, mas a área "${areaId}" não está registrada; mostrando como em breve.`);

    const item = { id: it.id, titulo: it.titulo, rota: it.rota, grupo: it.grupo, estado: disponivel ? ATIVO : EM_BREVE, filhos: [] };
    if (typeof it.curto === 'string' && it.curto) item.curto = it.curto; // nome da aba do navegador
    porId.set(it.id, item);

    if (it.pai) {
      const pai = porId.get(it.pai);
      if (!pai) {
        avisos.push(`nav.json: "${it.id}" aponta para o pai "${it.pai}", que precisa vir antes dele.`);
        continue;
      }
      if (pai.estado !== ATIVO) item.estado = EM_BREVE;
      pai.filhos.push(item);
    } else {
      grupo(it.grupo).itens.push(item);
    }
  }

  // Área registrada esquecida no nav.json continua acessível.
  for (const a of areas) {
    if (porId.has(a.id)) continue;
    avisos.push(`Área "${a.id}" registrada mas ausente do nav.json; listada em "Outros".`);
    grupo('Outros').itens.push({ id: a.id, titulo: a.titulo, rota: `/${a.id}`, grupo: 'Outros', estado: ATIVO, filhos: [] });
  }

  return { grupos: grupos.filter((g) => g.itens.length), avisos };
}

module.exports = { montarNav, ATIVO, EM_BREVE };
