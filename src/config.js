'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const CONFIG_FILE = path.join(RAIZ, 'config.json');
const NAV_FILE = path.join(RAIZ, 'nav.json');

function lerJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(`${path.basename(file)} não pôde ser lido: ${err.message}`);
  }
}

// Premissas editáveis e menu. Lidos a cada requisição: editar vale na hora.
// config.json é genérico e versionado. config.local.json (ignorado pelo git) guarda o que é só seu e se
// sobrepõe a ele: objetos se mesclam chave a chave; listas e valores simples são trocados por inteiro.
// Ficam sem o local: o modo demo (dados inventados), os testes (hermeticidade) e CEREBRO_SEM_LOCAL=1.
const CONFIG_LOCAL_FILE = path.join(RAIZ, 'config.local.json');
const ehObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function mesclar(base, sobre) {
  if (!ehObjeto(base) || !ehObjeto(sobre)) return sobre;
  const out = { ...base };
  for (const [k, v] of Object.entries(sobre)) out[k] = k in base ? mesclar(base[k], v) : v;
  return out;
}
const semLocal = () => process.env.CEREBRO_SEM_LOCAL === '1' || !!process.env.NODE_TEST_CONTEXT;
function loadSiteConfig() {
  const base = lerJson(CONFIG_FILE);
  if (semLocal() || !fs.existsSync(CONFIG_LOCAL_FILE)) return base;
  const local = lerJson(CONFIG_LOCAL_FILE);
  if (!ehObjeto(local)) throw new Error('config.local.json precisa ser um objeto JSON.');
  return mesclar(base, local);
}
const loadNav = () => lerJson(NAV_FILE);

const expandir = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

// Opções de linha de comando:
//   --vault=<caminho>  (ou CEREBRO_VAULT; padrão $HOME/cerebro)
//   --porta=<n>        (padrão 3737)
//   --demo             vault de exemplo, porta 3738 e data fixa (config.json → demo)
function loadConfig(argv = process.argv.slice(2), env = process.env) {
  const opcao = (nome) => {
    const a = argv.find((x) => x.startsWith(`--${nome}=`));
    return a ? a.slice(nome.length + 3) : null;
  };
  const demo = argv.includes('--demo');
  if (demo) process.env.CEREBRO_SEM_LOCAL = '1'; // demo: só dados e premissas de exemplo
  const demoCfg = demo ? loadSiteConfig().demo || {} : {};

  // No modo demo a variável CEREBRO_VAULT é ignorada: nunca mostra dados reais.
  const vault = opcao('vault') ||
    (demo ? path.resolve(RAIZ, demoCfg.vault || 'test/fixtures/vault-exemplo') : env.CEREBRO_VAULT || path.join(os.homedir(), 'cerebro'));

  return {
    host: '127.0.0.1',
    port: Number(opcao('porta') || (demo ? demoCfg.porta || 3738 : 3737)),
    vault: path.resolve(expandir(vault)),
    demo: demo ? { hoje: demoCfg.hoje || null } : null,
    // Onde o site guarda o "último lançamento" (para o Desfazer sobreviver ao reinício): fora do repositório e do
    // vault. Sem pasta (demo e testes), o desfazer vale só até reiniciar.
    estadoDir: demo || process.env.NODE_TEST_CONTEXT ? null : env.CEREBRO_ESTADO_DIR || path.join(env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state'), 'cerebro-site'),
    publicDir: path.join(RAIZ, 'public'),
    chartJs: path.join(RAIZ, 'node_modules', 'chart.js', 'dist', 'chart.umd.min.js'),
    configFile: CONFIG_FILE,
    navFile: NAV_FILE,
  };
}

module.exports = { loadConfig, loadSiteConfig, loadNav, mesclar, CONFIG_FILE, CONFIG_LOCAL_FILE, NAV_FILE };
