// Escrita pelo site (Tempo, Agenda, Kanban): POST com o token da sessão. O servidor valida tudo de novo.
window.escreverNoVault = (() => {
  'use strict';
  let token = null;
  async function pegarToken() {
    const r = await fetch('/api/sessao', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    token = (await r.json()).token;
  }
  async function enviar(rota, corpo, tentouDeNovo = false) {
    if (!token) await pegarToken();
    const r = await fetch(`/api/${rota}`, {
      method: 'POST', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', 'X-Cerebro-Token': token },
      body: JSON.stringify(corpo),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 403 && j.erro === 'token' && !tentouDeNovo) { await pegarToken(); return enviar(rota, corpo, true); }
    return { ok: r.ok, status: r.status, corpo: j };
  }
  // Devolve { ok, mensagem }: a mensagem já vem pronta para mostrar.
  return async (rota, corpo) => {
    try {
      const r = await enviar(rota, corpo);
      if (r.ok) return { ok: true, mensagem: r.corpo.git?.aviso || 'Gravado.' };
      return { ok: false, mensagem: r.corpo.mensagem || r.corpo.erro || `Erro ${r.status}` };
    } catch (e) {
      return { ok: false, mensagem: `Não consegui falar com o servidor (${e.message}).` };
    }
  };
})();
