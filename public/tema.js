// Aplica o tema salvo antes da primeira pintura (carregado no <head>).
// "auto" segue o sistema; "claro" e "escuro" ficam em localStorage.
(() => {
  'use strict';
  let tema = 'auto';
  try { tema = localStorage.getItem('cerebro:tema') || 'auto'; } catch { /* sem localStorage */ }
  if (tema === 'claro' || tema === 'escuro') document.documentElement.dataset.tema = tema;
})();
