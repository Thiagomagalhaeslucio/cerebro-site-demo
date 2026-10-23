// Atualização automática das páginas. A conexão SSE fica no shell.js;
// aqui cada página só diz qual área acompanha ('*' = todas).
window.aoVivo = function aoVivo(area, recarregar) {
  'use strict';
  let timer = null;
  const agendar = () => {
    clearTimeout(timer);
    timer = setTimeout(recarregar, 150);
  };
  window.addEventListener('cerebro:mudou', (e) => {
    if (area === '*' || e.detail.area === area || e.detail.area == null) agendar();
  });
  window.addEventListener('cerebro:reconectou', agendar);
};
