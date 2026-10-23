'use strict';

// Ensaio da escrita: copia 40-financeiro do vault apontado para /tmp/cerebro-ensaio e diz como
// subir o site nessa cópia. O vault de origem só é lido; quem grava durante o ensaio é a cópia.
//   node scripts/ensaio.js --vault=~/cerebro
//   (sem --vault: $CEREBRO_VAULT, ou $HOME/cerebro)
// Para testes, --destino=<pasta dentro do diretório temporário> troca o destino.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PASTA = '40-financeiro';
const DESTINO_PADRAO = '/tmp/cerebro-ensaio';
const PORTA = 3739;

const expandir = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);
const dentroDe = (filho, pai) => {
  const rel = path.relative(pai, filho);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

function ensaiar({ vault, destino = DESTINO_PADRAO }) {
  const origem = path.resolve(expandir(vault));
  const alvo = path.resolve(destino);
  if (!fs.existsSync(path.join(origem, PASTA))) throw new Error(`${path.join(origem, PASTA)} não existe. Aponte o vault com --vault=<caminho>.`);
  if (dentroDe(alvo, origem) || dentroDe(origem, alvo)) throw new Error('O destino do ensaio não pode estar dentro do vault (nem o contrário).');
  // Só apaga o que é, sem dúvida, uma cópia anterior de ensaio.
  if (!(dentroDe(alvo, '/tmp') || dentroDe(alvo, os.tmpdir())) || !path.basename(alvo).startsWith('cerebro-ensaio')) {
    throw new Error(`Destino recusado: "${alvo}" precisa ficar em /tmp (ou no diretório temporário) e se chamar cerebro-ensaio*.`);
  }
  fs.rmSync(alvo, { recursive: true, force: true });
  fs.mkdirSync(alvo, { recursive: true });
  fs.cpSync(path.join(origem, PASTA), path.join(alvo, PASTA), { recursive: true });
  return { origem, alvo, comando: `npm start -- --vault=${alvo} --porta=${PORTA}`, arquivos: fs.readdirSync(path.join(alvo, PASTA)).sort() };
}

if (require.main === module) {
  const arg = (nome) => (process.argv.slice(2).find((a) => a.startsWith(`--${nome}=`)) || '').slice(nome.length + 3) || null;
  try {
    const r = ensaiar({ vault: arg('vault') || process.env.CEREBRO_VAULT || path.join(os.homedir(), 'cerebro'), destino: arg('destino') || DESTINO_PADRAO });
    console.log(`Copiei ${PASTA}/ (${r.arquivos.join(', ')}) de ${r.origem} para ${r.alvo}.`);
    console.log('O vault de origem não foi alterado. Para subir o site na cópia:\n');
    console.log(`  ${r.comando}\n`);
    console.log(`Abra http://127.0.0.1:${PORTA}/financeiro/lancar. Para recomeçar o ensaio, rode este script de novo.`);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

module.exports = { ensaiar, DESTINO_PADRAO, PORTA };
