# cerebro-site: referência por área

Detalhe de cada área, dos formatos de arquivo e da estrutura do código. A visão geral está no [README](../README.md).

Site local e **só de leitura** que mostra os dados do vault `~/cerebro`.
O vault é a fonte da verdade: o site só lê, com uma exceção, Lançar movimento
(`/financeiro/lancar`, que só grava `40-financeiro/panelas.md` e `movimentos.md`). Os registros
continuam podendo ser feitos pelo terminal (skill `financeiro`, função `t`) e as páginas refletem.

## Uso

```sh
npm install
npm start          # http://127.0.0.1:3737
npm run demo       # http://127.0.0.1:3738, vault de exemplo
npm test
```

Outro vault: `CEREBRO_VAULT=/caminho/do/vault npm start` ou `npm start -- --vault=/caminho`
(e `--porta=<n>` para outra porta).
Padrão: `$HOME/cerebro`.

- Escuta só em `127.0.0.1:3737` e recusa `Host` diferente de `127.0.0.1`/`localhost`.
- Aceita só `GET`/`HEAD`.
- Chart.js vem de `node_modules` (sem CDN).
- Quando um `.md` das pastas observadas muda (inclusive em subpastas), o
  servidor avisa a página por Server-Sent Events (`/events`) e ela relê a API.

## Menu e áreas

Toda página carrega `public/tema.js` no `<head>` e `public/shell.js` + `shell.css`, que montam a barra lateral
em volta do `<main>` e a linha de origem sob o título (via `/api/fontes/<área>`): grupos e itens vêm de `/api/nav`, o item da página atual
recebe `aria-current="page"`, abaixo de 800px a barra recolhe atrás do botão
"Menu" (Esc fecha) e o rodapé mostra o ponto da conexão SSE e o nome do vault.
A conexão SSE é do shell; as páginas só pedem `window.aoVivo(area, recarregar)`.

O menu é editável em `nav.json`:

```json
{ "id": "diagnostico", "titulo": "Diagnóstico", "rota": "/financeiro/diagnostico",
  "grupo": "Vida", "pai": "financeiro", "estado": "ativo" }
```

`/api/nav` cruza o arquivo com as áreas registradas em `src/areas/index.js`:
item cuja área (`area`, `pai` ou o próprio `id`) está registrada vira **ativo**
sozinho; o resto fica **em breve** (apagado, sem link, sem página, num grupo recolhido "em construção" no fim do menu). Item marcado
"ativo" sem área vira aviso. Área registrada que não está no `nav.json` aparece
em "Outros". Editar o `nav.json` atualiza a barra na hora.

### Contrato de uma área

```js
module.exports = {
  id: 'financeiro',                 // URL /financeiro e eventos SSE
  titulo: 'Financeiro',
  watch: ['40-financeiro'],         // pastas do vault (recursivo, só *.md)
  api: { '': (vault, ctx) => ..., diagnostico: (vault, ctx) => ... },
  resumo: (vault, ctx) => ({ titulo, itens: [{ rotulo, valor, tipo, status?, detalhe?, rota? }] }), // opcional
  datas: (vault, ctx) => [{ data: 'AAAA-MM-DD', rotulo, area }],                                 // opcional
  fontes: (vault, ctx) => ['40-financeiro/panelas.md'],  // opcional: arquivos ou pastas mostrados como origem
  post: { lancar: (vault, ctx, corpo) => ({ status: 200, corpo: {} }) },  // opcional: POST /api/<id>/<sub>; só o financeiro
};
// ctx = { hoje: 'AAAA-MM-DD', demo: boolean, areas, estado }   (estado: memória por servidor)
```

Páginas: `public/<id>/index.html` em `/<id>` e `public/<id>/<nome>.html` em
`/<id>/<nome>`; cada uma inclui `shell.js`, `live.js` e o próprio JS.

### Home (`/`)

Data de hoje, frase de abertura, faixa da semana e duas colunas: "Pede atenção"
(atrasados, vence hoje, alerta do financeiro) e "Em andamento" (kanban, próximo
passo de cada roadmap, patrimônio com salário, VT e VR, veredito). Elas usam o
`resumo()` e as `datas()` de cada área, que a API `/api/home` continua entregando:

| Área | Cartão | Datas |
|---|---|---|
| agenda | próximos 3 compromissos | eventos de `agenda.md` nos próximos 14 dias |
| kanban | feitos/total da semana e atrasados | "Prazo: <título>" dos cards abertos (atrasados e próximos 14 dias) |
| financeiro | veredito do diagnóstico, patrimônio, livre | próximo salário, VT e VR |
| estudos | próximo passo de cada roadmap, revisões pendentes | — |
| metas | total e uma linha por meta atrasada (entram em "Pede atenção") | — |
| orcamento | sem cartão (é uma calculadora) | — |
| propostas | sem cartão (é um gerador) | — |
| contratos | sem cartão (é um gerador) | — |

`ctx.areas` traz a lista de áreas, para quem precisa juntar dados de outras (a agenda). Se o
resumo de uma área lançar erro, só aquele cartão mostra o aviso.

## Modo demonstração

`npm run demo` sobe em `127.0.0.1:3738` lendo `test/fixtures/vault-exemplo/`
(valores inventados), com a faixa "Modo demonstração: dados inventados" e a data
fixa de `config.json → demo.hoje`, para os números da demo não mudarem com o
calendário. Nesse modo a variável `CEREBRO_VAULT` é ignorada, então a demo nunca
mostra o vault real. Bom para capturas de tela (`npm run capturas`) e para testar sem tocar no vault.

## Kanban (`/kanban`)

Lê `10-diario/kanban-AAAA-SS.md` (SS = semana ISO, como `date +%G-%V`),
compatível com o plugin Kanban do Obsidian:

```markdown
---
tags: [kanban]
data: 2026-03-09        # segunda-feira da semana
kanban-plugin: board
---

## A fazer

- [ ] Revisar sub-redes para a prova @2026-03-11 #faculdade

## Fazendo

## Bloqueado

## Feito

- [x] Montar o kanban da semana #cerebro-site
```

- Colunas: os títulos `##` (A fazer, Fazendo, Bloqueado, Feito; outras viram aviso).
- Card: `- [ ] título @AAAA-MM-DD #projeto`; prazo (`@data` ou `@{data}`) e projeto são opcionais.
  Concluído = está em Feito ou marcado `[x]`.
- Etiqueta do prazo: **atrasado** (passou e não está concluído), **hoje**, **amanhã**.
- Abre na semana atual; se ela não tiver arquivo, na última anterior. Navega entre
  as semanas que existem e filtra por projeto.
- Card levado para a semana seguinte aparece em dois arquivos: para prazos (Home
  e agenda) vale o estado da semana mais recente.
- Blocos de código e o `%% kanban:settings %%` do plugin são ignorados.

## Agenda (`/agenda`)

Junta três origens, cada uma com sua cor:

1. **agenda** — `10-diario/agenda.md`:

   ```markdown
   | data | início | fim | título | tipo | obs |
   | --- | --- | --- | --- | --- | --- |
   | 2026-03-10 | 19:00 | 22:00 | Aula de Redes | aula | laboratório 3 |
   | 2026-03-11 |  |  | Prova de Redes | prova | levar calculadora |
   ```

   Data AAAA-MM-DD (tem que existir); início e fim HH:MM, os dois vazios para dia
   inteiro (início sem fim também vale). Tipo: aula, prova, estudo, trabalho,
   pessoal ou financeiro. Linha inválida (data, hora, fim sem início, fim antes do
   início, sem título) vira aviso e fica de fora; tipo fora da lista vira aviso e
   o evento fica.
2. **kanban** — prazos dos cards não concluídos, de qualquer semana.
3. **outras áreas** — as `datas()` delas (hoje, salário, VT e VR do financeiro).

Visões: **Próximos 14 dias**, por dia (atrasados no topo, hoje e amanhã sempre
aparecem), e **Mês**, em grade começando na segunda, com navegação de mês; tocar
num dia mostra os itens dele. No celular a grade mostra só pontos coloridos.

## Financeiro: de onde vêm os números

- **Saldos**: tabela "Saldos atuais" de `40-financeiro/panelas.md`. Nunca são
  recalculados a partir dos movimentos.
- **Patrimônio, livre, metas, último salário, reposições pendentes**: também de `panelas.md`.
- **Conferência**: soma dos saldos sem o `vt` (que está dentro da conta) comparada
  com o patrimônio escrito. Se divergir, aparece um aviso.
- **Disponível** = livre − reposições pendentes de pessoal/margem.
- **Gastos** (gráficos): só tipo `saída`, excluindo descrições que começam com
  a `descricaoAjuste` do formato. Transferência e recarga não contam.

## Diagnóstico (`/financeiro/diagnostico`)

Diz se está de boa ou se vale gastar menos, com regras fixas (sem IA): metas,
orçamento livre do ciclo, VR e dia a dia (VT + trem), cada um com semáforo,
os números que justificam e uma linha de "o que fazer". Mostra também para onde
foi o dinheiro desde o último salário.

As premissas ficam em `config.json` (`financeiro.diagnostico`): próximo salário,
próximo VT/VR, transporte por dia, palavras-chave das categorias, janelas e
limites do semáforo. A página mostra tudo em "Como calculei" e recarrega
sozinha quando o arquivo muda. Campo que não puder ser lido vira aviso e o
indicador fica "sem dados", sem valor chutado.

## Nomes do financeiro (`config → financeiro.formato`)

O código não tem nome seu: os ids e os textos que são **do seu `panelas.md`** ficam em `config.json` (genérico) e,
por cima, em `config.local.json`. O código usa só as chaves internas `marco` e `metaFinal`.

| Chave | Para quê | Padrão genérico |
|---|---|---|
| `painelMeta` | id (coluna `id` de `panelas.md`) da panela onde se acumulam o marco e a meta final | `principal` |
| `divisaoMeta` | expressão regular do nome dessa panela na "Regra de divisão do salário" | `principal` |
| `descricaoAjuste` | texto do movimento de ajuste de saldo (e o que o diagnóstico ignora como gasto) | `Ajuste de saldo (conferido com o banco)` |
| `linhas.marco`, `linhas.metaFinal`, `linhas.reserva` | texto que abre a linha da meta em "## Metas" (`- Marco: ... R$2.000`) | `Marco`, `Meta final`, `Reserva` |
| `rotulos.*` | todos os textos mostrados: página do Financeiro, Diagnóstico, Metas e avisos do Lançar (21 chaves, ver `src/areas/financeiro/formato.js`) | genéricos ("Marco", "Meta final", "panela principal") |

Chave ausente ou vazia cai no padrão. O leitor (`formato.js`) expõe `painelMeta` e `rotulos` na API (`formato` em
`/api/financeiro`, `/diagnostico` e `/lancar`) para as páginas não terem texto fixo. A prova de que trocar nomes não muda
o comportamento está nos testes (fixture genérica) e foi feita contra o vault real: as respostas das APIs e 13
pré-visualizações do motor, com os nomes reais em `config.local.json`, saíram idênticas às de antes da troca.

## Lançar movimento (`/financeiro/lancar`)

A única página que escreve. Lê e grava só `40-financeiro/panelas.md` e `movimentos.md`. A **fonte única
das regras** é a skill `financeiro` do vault; onde ela é omissa, valem as decisões abaixo (confirmadas
antes de codar).

**Arquivos do código:** `src/areas/financeiro/lancar.js` (motor puro: textos entram, textos saem),
`lancar-io.js` (versão, anti-duplicado, gravação atômica, desfazer), `src/app.js` (token, origem, corpo),
`public/financeiro/lancar.html|js` e `public/lancar.css`.

**Entrada do motor:** `lancar({ panelasTxt, movimentosTxt, operacao, hoje }, { config })`. Saída: `ok`, `erros`,
`avisos` (`{ texto, confirmar }`), `exigeConfirmacao`, `gravavel`, `previa` e `novos` (os dois textos).
Contas em centavos inteiros.

| Operação | Campos | O que muda |
|---|---|---|
| `gasto` | `valor`, `descricao`, `saiDe`, `reporDe?` | `vr`: só o VR. `vt`: VT e Conta. `pessoal`, `margem`, `trem`, `conta`: a panela (direto). `conta` com `reporDe` (`pessoal`, `margem`, `reserva` e a panela das metas): debita só a Conta, a linha vai na panela de origem com obs `pago da conta, reposição pendente` e nasce uma linha em "Reposições pendentes". Reserva e moto exigem confirmação (atrasam a meta). |
| `transporte` | `data?` | Dia útil: VT -5,00 (e Conta), trem -5,50. Sábado: VT -10,00. Domingo: recusado. **Uma** linha: `vt saída ... Transporte do dia (dia de semana) \| + trem −5.50`. Valores em `config.json → financeiro.lancar.transporte`. |
| `entrada` | `panela`, `valor`, `descricao` | Soma na panela (no VT, a Conta sobe junto). |
| `reposicao` | `modo`, `panela`, `valor`, `pendencias?` | Debita a panela (`pessoal`, `margem`, `reserva` e a panela das metas), credita a Conta, linha `pessoal→conta transferência`; patrimônio inalterado. **Recusada** sem saldo. `modo` é obrigatório e **nunca quita por ordem de data**: **`quitar`**: `pendencias` = lista `{ id, descricao, valor }` das marcadas (o `id` vem de `GET /api/financeiro/lancar → pendentes[].id`, a posição entre as não repostas), e `valor` = a soma delas. Recusa (422) se a lista for vazia ou repetir id, se alguma pendência não existir, não for da panela ou não bater em descrição e valor com o arquivo, ou se a soma não bater com `valor`; a versão dos arquivos que mudou dá 409 como em toda gravação. Cada marcada vira `... ✔ reposto AAAA-MM-DD` (a linha não some; sem mais nenhuma, entra "Nenhuma pendente.") e a obs da linha é `repõe <descrições>`. **`livre`**: `valor` qualquer, sem `pendencias`; obs `reposição adiantada`, "Reposições pendentes" não muda. A prévia traz `quitadas` e `continuam` (pendências da panela). |
| `recarga` | `valor` | VT (e Conta) para o trem; patrimônio igual. |
| `salario` | `valor` | Divide pela regra lida de `panelas.md` (duas linhas: "Normal" e "Quando a reserva chegar..."); reserva >= meta usa a segunda. A sobra de centavos fica na moto. Uma `entrada` "Divisão do salário" por panela **com valor maior que zero** (reserva em 0% não ganha linha). Seção Salário: o novo vira "Último" e o anterior "Anterior" (só um). |
| `ajuste` | `panela`, `saldoReal` | Grava a diferença (real − registrado) como `entrada` ou `saída` a `descricaoAjuste` do formato, obs `saldo real X`. Só a panela informada muda (a Conta não acompanha o VT). Nunca conta como gasto no financeiro. |

**Sempre:** `panelas.md` recebe os saldos novos, a data do título "Saldos atuais (em AAAA-MM-DD)" (hoje), o
patrimônio (soma sem o VT) e o livre (pessoal + margem); `movimentos.md` recebe as linhas no **fim** da
tabela, valor positivo com ponto e 2 casas. Movimento antigo nunca é alterado. Fim de linha CRLF é preservado.

**Validação:** valor maior que zero com até 2 casas (`12,5` e `12.50` valem; `1.234,56` e `12,345` não),
descrição obrigatória, até 120 caracteres, sem quebra de linha, `|` vira `/` e sem `✔`; data `AAAA-MM-DD`
válida e não futura; campo fora do esquema da operação é recusado.

**Avisos que exigem confirmação** (`confirmar: true` na operação, a caixa "Li os avisos"): saldo que ficaria
negativo, VT maior que a Conta, repor de reserva ou da panela das metas, salário com data igual ou anterior ao último. Os
informativos não travam: "Marco atingido", "Reserva completa" e o progresso da meta final.

**Verificação pós-escrita (em memória):** os textos novos passam por `parsePanelas` e `parseMovimentos`;
aborta sem gravar se surgir aviso novo, se um saldo lido não for o calculado, se a soma sem o VT não bater
com o patrimônio escrito, se o livre não bater, se a contagem de movimentos ou de pendências estiver errada
ou se o histórico antigo fosse alterado.

**API**

| Rota | O que faz |
|---|---|
| `GET /api/sessao` | `{ token }`, só para a própria página (`Sec-Fetch-Site` `same-origin` ou `none`, `Origin` igual ao Host). Sem CORS. |
| `GET /api/financeiro/lancar` | Contexto da página: `versao`, `hoje`, `demo`, panelas e saldos, pendências, premissas do transporte, categorias e sugestões, e se há o que desfazer. |
| `POST /api/financeiro/previa` | `{ operacao }`. Não grava; funciona também no demo. Devolve a prévia, os avisos e a `versao`. |
| `POST /api/financeiro/lancar` | `{ operacao, versao }`. Grava. 403 no demo; 409 `versao` ou `duplicado`; 422 `invalido` ou `confirmacao`. |
| `POST /api/financeiro/desfazer` | `{ versao }` (a atual). Só o último lançamento do site, uma vez. |

Todo `POST` exige, nesta ordem: pedido local (`127.0.0.1`), `Sec-Fetch-Site: same-origin` e/ou `Origin` do
mesmo site, `X-Cerebro-Token`, `Content-Type: application/json`, corpo de até 4096 bytes e JSON válido
(403, 403, 403, 415, 413, 400). O `Host` errado já cai em 421 antes disso. Rota `POST` que nenhuma área declara
em `post` devolve 405.

**Commit automático** (`config.json → financeiro.lancar.commitAutomatico`, ligado): se o vault é a raiz de um
repositório git, cada lançamento e cada desfazer viram um commit **só de `panelas.md` e `movimentos.md`**
(`git commit --only`; nunca `add .`, nunca push; os outros arquivos do vault, mesmo alterados, não entram).
Antes de escrever, o que já estava sem commit nesses dois arquivos (o `t` do terminal, o Obsidian) ganha o seu
próprio commit, "Estado anterior ao lançamento pelo site"; depois vem "Lançamento pelo site: <operação> (<descrição>)",
sem valores na mensagem. Quem assina é o git do vault; sem identidade configurada, "cerebro-site". Falha de git vira
aviso na tela (o lançamento já valeu), nunca erro. Demo e vault sem git: nada disso acontece.

**Desfazer:** só o último lançamento, e só enquanto os arquivos continuam com o hash que o lançamento deixou.
Sobrevive ao reinício: o site guarda em `estadoDir` (`~/.local/state/cerebro-site`, ou `CEREBRO_ESTADO_DIR`; um
arquivo por vault, modo 0600, **fora** do repositório e do vault) só quem foi o lançamento (commits de antes e de
depois, hashes, a prévia), nunca o conteúdo dos arquivos; o texto de antes vem do commit do git. Sem git, o
desfazer volta a valer só até o site reiniciar. Desfeito, o site também commita ("Desfaz lançamento do site").

**Página:** operação em controle segmentado (setas trocam), campos por operação, "Sai de" sem valor padrão
(a skill manda não chutar); a descrição sugere a panela com as palavras-chave de `config.json` (as
mesmas do diagnóstico, mapeadas em `financeiro.lancar.sugestaoPorCategoria`). Enter pré-visualiza; com a
prévia aberta e nada mudado, Enter confirma; Esc fecha. Depois de gravar, o foco volta ao valor. A página se
atualiza pelo SSE; uma prévia aberta sobre arquivos que mudaram deixa de valer.

**Ensaio e serviço:** ver o README ("Ensaio antes de usar no vault real" e "Como serviço do usuário").

## Estudos (`/estudos`)

- **Roadmaps**: arquivos na raiz de `60-estudos/` com a tag `roadmap` no
  frontmatter. Progresso = checkboxes marcados / total, no arquivo e por seção
  (`##`). Checkboxes e `#` dentro de blocos de código não contam. A tabela de
  status escrita à mão nos roadmaps não é usada.
- **Foco**: a tag `foco` no frontmatter (junto de `roadmap`) marca o roadmap que vale agora. Ele vem primeiro
  em Estudos (já aberto, com a etiqueta "foco"), nos próximos passos, na Home ("Foco · Próximo: ...") e nas Metas.
  Sem a tag, a ordem é alfabética. Tire a tag quando o foco mudar.
- **Próximos passos**: os 3 primeiros checkboxes não marcados de cada roadmap,
  na ordem do arquivo, sem crases, negrito e ids (`#Block009`, `#F017`; um intervalo como `#F001 ao #F010`
  sai inteiro do texto); os ids continuam na API (`/api/estudos`), mas a página não os mostra.
- **Revisões pendentes**: notas de `20-biblioteca/` (com subpastas) cujo
  frontmatter tem `status` exatamente `revisão-pendente`, com módulo, nome,
  data e link `obsidian://open?vault=<pasta do vault>&file=<caminho>`.
- `99-arquivo/` nunca é lido. Campo faltando vira aviso.

## Metas (`/metas`)

Metas agrupadas por área (carreira, estudos, dinheiro, negócio, pessoal), com resumo no topo
(total, no ritmo, atenção, atrasadas, concluídas). Nada é calculado fora do servidor: `/api/metas`
entrega progresso, status e ritmo; a página só formata.

**Fontes**

- **Automáticas, sem parser novo.** Do financeiro (`readFinanceiro`): a panela das metas contra o marco,
  a reserva e a meta final (área dinheiro, em R$). Do diagnóstico (`readDiagnostico`): a projeção do marco no
  próximo salário e em quantos salários a reserva fecha. Dos estudos (`readEstudos`): o progresso de
  cada roadmap (área estudos, em passos). Meta que o `panelas.md` não traz não é mostrada com valor
  padrão. Financeiro ou estudos ilegíveis viram aviso e as outras metas seguem.
- **Manuais:** `10-diario/metas.md`, tabela `| meta | area | alvo | atual | unidade | inicio | prazo | obs |`,
  colunas lidas pelo nome. Sem o arquivo, a página mostra só as automáticas e uma dica de como criá-lo.
  Linha inválida (sem nome, área desconhecida, alvo ou atual que não é número, alvo zero, só um dos
  dois, data inexistente, prazo antes do início) vira aviso com a linha e é ignorada; nada é
  completado por palpite.

**Regras** (determinísticas, `hoje` vem do servidor)

- Progresso = atual / alvo, limitado a 100%. "Concluída" é atual >= alvo, não o número arredondado.
- Com início e prazo, tempo decorrido = (hoje − início) / (prazo − início), entre 0 e 100%. Folga =
  progresso − tempo, em pontos:
  - concluída: 100%;
  - atrasada: prazo vencido com menos de 100%, ou folga abaixo de −25;
  - atenção: folga de −25 até abaixo de −10 (−25 exato ainda é atenção);
  - no ritmo: folga de −10 para cima (−10 exato ainda é no ritmo).
- Sem datas: só a barra, sem status, e por isso fora das contagens de status (entra em "total").
  As automáticas não têm datas.
- Ritmo necessário = (alvo − atual) / semanas até o prazo, na unidade da meta: "faltam X; no ritmo
  de Y por semana". Com o prazo hoje ou vencido, só "faltam X", sem ritmo inventado.

**Home:** metas atrasadas são linhas de "Pede atenção" (e entram na contagem da frase); as demais
viram uma linha "Metas" em "Em andamento", com as contagens.

## Relatórios (`/relatorios`)

A **semana** (segunda a domingo) ou o **mês**, com o que as outras áreas já leem, num lugar só:

- **Tempo** por projeto (de `80-tempo`), com a parte de cada um no total, os dias com registro e a comparação com o
  período anterior de mesma duração.
- **Gastos** por categoria (as de `config → financeiro.diagnostico.categorias`; ajustes de saldo não contam), com o
  total e a comparação com o período anterior.
- **Metas**: a situação **de hoje** (não do período; metas não guardam histórico) e a contagem de atrasadas e concluídas.
- **Navegação:** Semana/Mês, anterior, próximo (só até o período atual; não há relatório do futuro) e "Hoje". O
  período fica na URL (`?tipo=semana|mes&ref=AAAA-MM-DD`); `ref` é qualquer data dentro do período, e tipo ou data
  inválidos caem na semana de hoje. "Copiar resumo" põe o relatório em texto simples na área de transferência.
- Período em andamento diz "(em andamento)". Sem `80-tempo` o bloco de tempo some com aviso; sem financeiro, o de gastos.
- `GET /api/relatorios?tipo=&ref=` devolve `tempo`, `gastos`, `metas` e `avisos`. Código: `src/areas/relatorios/`,
  `public/relatorios/`. É a primeira API a ler a query string (`ctx.consulta`, até 8 campos de 40 caracteres).

## Backup do vault

`scripts/backup.js` (sem rede, sem dependências) copia o vault inteiro (inclusive `.git` e `.obsidian`) para
`cerebro-AAAA-MM-DD-HHMM.tar.zst` em cada pasta de `config.json → backup.destinos` (padrão `~/Backups/cerebro`;
pasta e arquivos com modo 0700/0600). Conferência a cada cópia: lê o arquivo de volta e compara a contagem de
arquivos com a do vault; `node scripts/backup.js --verificar=<arquivo>` refaz a leitura. Retenção: `manter` cópias
(30) por destino; só apaga arquivos com o nome do próprio backup. Disco externo: ponha o caminho em
`config.local.json → backup.destinos`; em `/run/media`, `/media` e `/mnt`, ponto de montagem ausente é "disco
desmontado" e o destino é **pulado, nunca criado**. `backup.gpg` (id ou e-mail de uma chave pública do seu
chaveiro) criptografa as cópias (`.tar.zst.gpg`): use quando houver um destino fora da máquina (nuvem), por causa de
CPF e CNPJ de clientes. Sai com código 1 se nenhum destino recebeu a cópia.

**Agendado:** timer do systemd do usuário, todo dia às 21:30 (recupera o que perdeu se o computador estava
desligado). Arquivos em `~/.config/systemd/user/`:

```ini
# cerebro-backup.service
[Service]
Type=oneshot
WorkingDirectory=/caminho/do/cerebro-site
ExecStart=/caminho/do/node /caminho/do/cerebro-site/scripts/backup.js

# cerebro-backup.timer
[Timer]
OnCalendar=*-*-* 21:30:00
Persistent=true
[Install]
WantedBy=timers.target
```

`systemctl --user enable --now cerebro-backup.timer`. **Aviso na Home:** o script grava `estadoDir/backup.json`
(quando e quantos destinos deram certo); a Home avisa se nunca houve backup, se o último falhou em todos os
destinos ou se passou de `alertarAposDias` (2).

**Restaurar:** `tar --zstd -xf cerebro-….tar.zst -C <pasta vazia>` (com `.gpg`: `gpg -d arquivo | tar --zstd -xf - -C ...`).
Conferido em teste: o vault restaurado é idêntico byte a byte.

## Demandas (`/demandas`)

O que está em andamento com cada cliente, num lugar só. Lê quatro pastas e agrupa por **cliente** (sem diferenciar
acento nem caixa), do prazo mais próximo ao mais distante; o grupo "Sem cliente" vai por último.

| Fonte | O que entra | Campos do frontmatter |
|---|---|---|
| `30-projetos/*.md` | notas com a tag `projeto` | `cliente`, `prazo`, `status` (padrão "em andamento") |
| `70-negocio/propostas/*.md` | todas | `status`, `cliente`, `projeto`, `valor`, `prazo` ou `entrega` |
| `70-negocio/contratos/*.md` | todos | `cliente`, `projeto`, `status` (padrão "vigente"), `valor`, `prazo`/`entrega`/`fim` |
| `70-negocio/clientes/*.md` | cadastro; aparece mesmo sem demanda | `nome` (senão o nome do arquivo) |

- **Em andamento:** projeto e contrato que não estão encerrados; proposta `rascunho`, `enviada` ou `em negociação`
  conta como **em aberto**; a `aceita` não é "em aberto", mas o prazo dela vale (é o que há para entregar). Proposta
  recusada ou cancelada fica na lista, apagada, sem prazo contando.
- **Backlog do projeto:** os checkboxes do arquivo (`- [ ]`, fora de blocos de código); sem checkboxes, cada bloco de
  texto sob `## Backlog` (separado por linha em branco) é um item solto, e imagens não contam.
- **Prazo** em `AAAA-MM-DD`; outro formato vira aviso e o prazo é ignorado. Mostra "em N dias" ou "venceu há N dias"
  (bolinha vermelha só quando venceu). `valorAceito` soma as propostas aceitas do cliente.
- **Datas importantes:** os prazos em andamento entram na Home e na Agenda (`area: demandas`).
- **Home:** linha "Demandas" em "Em andamento" (projetos; propostas em aberto e backlog em tinta suave), só se houver algo.
  `GET /api/demandas` devolve `clientes` (com `projetos`, `propostas`, `contratos`), `resumo` e `avisos`. Código:
  `src/areas/demandas/`, `public/demandas/`.

## Biblioteca (`/biblioteca`)

Lista as notas de `20-biblioteca/` (qualquer profundidade; dotfiles ignorados). Cada nota traz:

- **Título:** o primeiro `# ...` fora de bloco de código; sem ele, o `modulo` do frontmatter; sem ele, o nome do arquivo.
- **Pasta:** a primeira subpasta (`redes`, `ingles`...), ou `(raiz)`. **Status:** o `status` do frontmatter, ou `sem status`.
  Também `modulo`, `data` (AAAA-MM-DD) e `tags`.
- **Ordem:** `revisão-pendente` primeiro, depois a data mais nova, depois o título.
- **Página:** resumo (notas, revisão pendente, sem status), busca por título, módulo ou tag (sem diferenciar acento
  nem maiúscula) e filtros de pasta e status; o filtro sobrevive à atualização ao vivo. O título é o link
  `obsidian://open?vault=<pasta do vault>&file=<caminho sem .md>`.
- **Avisos, não chutes:** frontmatter sem o `---` de fechamento e data fora do formato. Sem a pasta, a página explica.
- **Livros de outro vault do Obsidian** (opcional): `config.json → biblioteca.livros` (`pasta` e `tag`, padrão
  `Livros`). `pasta` é a raiz do outro vault (aceita `~`); o caminho seu vai em `config.local.json`. O site
  percorre tudo (menos pastas com ponto) e trata como livro a nota com a tag e o campo `title`, no formato do
  plugin de livros do Obsidian: `author`, `totalPage`, `category`, `publisher`, `publishDate` e `subtitle`.
  Só leitura, nada é copiado para o vault. **As capas** vêm de `npm run capas` (`scripts/capas.js`), o único ponto em que o projeto chama a internet: baixa o
  `coverUrl` de cada nota (em tamanho maior) para `capas/` (**ignorada pelo git**, são imagens de terceiros), uma vez
  por livro; `-- --refazer` baixa tudo de novo. A capa genérica "image not available" do Google (idêntica em vários
  livros) é descartada. Livro sem `coverUrl`, ou só com a genérica, é procurado pelo título e autor na Open Library
  (pública, sem chave); só vale resultado de título parecido. O site serve só os arquivos locais em `/capas/<id>.jpg` (id de 12 hex), então a página não
  chama a internet. A página ganha o contador "Livros" e o filtro "Tipo"; livros não têm pasta nem status, então
  ficam de fora quando um desses filtros está ligado. Os livros aparecem em **grade de cartões com a capa** (acima
  da lista de notas); sem capa, o cartão mostra o título num quadro. O link abre a nota no Obsidian se esse vault estiver aberto
  lá com o nome da pasta. Na demo vale `demo.livros` (livros inventados). Essa pasta fica fora do vault: mudanças
  nela não atualizam a página sozinhas; recarregue.
- Não tem cartão na Home: as revisões pendentes já aparecem em Estudos. `GET /api/biblioteca` devolve `notas`,
  `pastas`, `status`, `resumo` e `avisos`. Código: `src/areas/biblioteca/` e `public/biblioteca/`.

## Tempo (`/tempo`)

Horas por projeto, da semana e do mês de hoje. Lê todos os `80-tempo/*.md` (um por mês, `AAAA-MM.md`); em cada
um, a primeira tabela com as colunas `data`, `projeto` e `min` (a ordem não importa; `início`, `fim` e `nota`
são opcionais):

```
| data | projeto | início | fim | min | nota |
| 2026-03-09 | projeto-alfa | 14:00 | 15:00 | 60 | revisão |
```

- **Minutos:** a coluna `min`. Se ela estiver vazia, vale `fim − início` no mesmo dia; virada de dia não é adivinhada.
- **Semana:** segunda a domingo (semana ISO) da data de hoje. **Mês:** o mês de hoje.
- **Resumo:** horas da semana e do mês e quantos dias distintos têm registro. **Esta semana** e **Maiores projetos
  do mês** (cinco no máximo, com a parte do total) somam por projeto, sem diferenciar maiúsculas. **Últimos
  registros:** os cinco mais recentes.
- **Linha inválida é aviso, não valor chutado:** data que não existe, projeto vazio, minutos que não são número
  (e sem início e fim válidos). Data depois de hoje também é ignorada, com aviso. Arquivo sem a tabela vira
  aviso e os outros seguem. Sem a pasta `80-tempo` a página mostra como criar.
- **Home:** linha "Tempo" em "Em andamento" (horas da semana; no mês, em tinta suave). `GET /api/tempo`
  devolve `semana`, `mes` (com `maiores`), `recentes` e `avisos`. O registro continua pelo terminal
  (`t <projeto>` e `t stop`); a página só lê.

**Cronômetro e pomodoro** (no alto da página; rodam no navegador e **não gravam nada**):

- **Cronômetro:** Iniciar, Pausar/Continuar e Zerar, com campo de projeto (sugere os do mês). Com mais de 30 s
  e parado, **Copiar linha** põe na área de transferência a linha `| data | projeto | início | fim | min | nota |`
  para colar no Obsidian (ou mostra a linha, se o navegador recusar copiar).
- **Pomodoro:** foco, pausa curta e, depois de N focos, pausa longa. As durações vêm de `config.json →
  tempo.pomodoro` (`foco`, `pausaCurta`, `pausaLonga`, `focosAteLonga`, em minutos; valor ruim volta ao padrão
  25/5/15/4, com aviso). A fase seguinte começa **parada**: quem decide recomeçar é você. Ao fim da fase o site
  toca três bipes (o navegador só libera o som depois do primeiro clique na página) e avisa na tela. "Pular
  fase" não conta o foco; o contador "focos completos hoje" zera na virada do dia.
- **Título da aba** mostra o que estiver correndo (`24:31 foco · Tempo`), para acompanhar de outra aba.
- **Estado no navegador** (`localStorage`, só conveniência): recarregar não zera o relógio, e o tempo é
  sempre diferença de carimbos, então aba em segundo plano não atrasa. Fase que acabou com a página fechada é
  avisada ao voltar. Outro navegador ou aparelho começa do zero.
- As contas ficam em `public/tempo/relogio.js` (puras, testadas em `test/relogio.test.js`); a tela, em
  `public/tempo/relogios.js`. Roteiro de navegador: `node scripts/teste-tempo-ui.js`.

Código: `src/areas/tempo/` e `public/tempo/`.

## Orçamento (`/orcamento`)

Calculadora de orçamento, só leitura. Os dados vêm de `70-negocio/precificacao.md`,
pelas tabelas **Parâmetros** (`chave`, `valor`), **Tipos de trabalho** (`tipo`,
`horas_min`, `horas_max`) e **Complexidade** (`nivel`, `multiplicador`), em
`/api/orcamento`. As colunas são lidas pelo nome; colunas, tabelas e seções
extras (Faixa de mercado, Base do valor/hora, Pendências) são ignoradas.

- **Fórmula:** a da seção "Como calcular" do arquivo, em
  `public/orcamento/formula.js`, um módulo UMD que o navegador (`/static/orcamento/formula.js`)
  e o teste (`require`) usam, sem cópia. Roda no navegador a cada digitação e só
  arredonda na exibição. Garantia e hora avulsa não entram na fórmula: aparecem só
  no resumo copiado (`public/orcamento/resumo.js`).
- **Valor ausente ou "a definir":** vira aviso na página e desativa só o cálculo que
  depende dele (por exemplo, sem `imposto` não há recomendado, piso nem entrada; sem
  `adicional_urgencia` só quem marca urgente fica sem valor). Nada é chutado. O arquivo
  diz que "a definir" entra como 0; o site não faz isso, por decisão: zero esconderia o
  buraco no preço.
- **Campos:** tipo de trabalho (preenche as horas com o ponto médio da faixa, editável),
  horas estimadas, complexidade, urgente (sim/não, sempre manual), início e entrega
  desejada, viagens, km total, horas de viagem, rodadas de revisão extra e custos de terceiros.
- **Urgência sugerida:** com início e entrega, compara o prazo desejado (dias) com o prazo
  normal, ⌈horas × multiplicador × (1 + margem_risco) ÷ capacidade_horas_semana × 7⌉. Só
  escreve uma sugestão; o botão não muda sozinho.
- **Resultado:** valor recomendado, piso (e se veio do desconto máximo ou do custo), entrada
  e a tabela de composição (horas base, margem de risco, urgência, deslocamento, revisões,
  terceiros, imposto). `repasse_terceiros` e `revisoes_incluidas` não entram na conta; o
  segundo aparece como dica e no resumo.
- **Copiar resumo:** texto simples para proposta (tipo, valor, entrada, saldo, revisões,
  prazo, garantia, hora avulsa), sem piso nem margem. **Imprimir** imprime só esse resumo.
- Nada é gravado: sem `localStorage` e sem escrita no vault.

## Propostas (`/propostas`)

Gerador de propostas, só leitura: o documento aparece na página e sai por copiar, baixar ou
imprimir; nada é gravado no vault. `/api/propostas` junta três arquivos de `70-negocio/`:

| Arquivo | O que vira |
|---|---|
| `perfil.md` | tabela `chave` / `valor` (colunas pelo nome; `nome`, `nome_comercial`, `email`, `whatsapp`...) |
| `modelos/proposta.md` | o modelo, com campos `{{campo}}` |
| `precificacao.md` | os parâmetros da calculadora e, a mais, `validade_proposta_dias` e `prazo_resposta_cliente_dias` (além de `entrada`, `revisoes_incluidas`, `revisao_extra_horas` e `garantia_dias`) |

- **Perfil incompleto:** valor "a definir" ou vazio no perfil vale como vazio; gera o aviso
  "Perfil incompleto" (lista os campos) só para `nome`, `email`, `whatsapp` e `cidade_uf`
  (ausentes na tabela também contam); `nome_comercial` e `site` são opcionais. Arquivo ou tabela ausente também. Parâmetro ausente ou
  "a definir" desativa só o campo que depende dele.
- **Página:** formulário à esquerda e prévia à direita (empilhados no celular), atualizando ao
  digitar. Campos: cliente, projeto, resumo, escopo, fora do escopo, entregáveis (um item por
  linha), início, entrega desejada e validade (começa no parâmetro).
- **Cálculo do valor** (seção recolhida): os mesmos campos da calculadora, rodando a mesma
  fórmula (`public/orcamento/formula.js`, sem cópia). O valor proposto começa no recomendado
  arredondado para cima em reais e é editável ("Usar o recomendado" volta). Abaixo do piso, o
  aviso aparece só no formulário.
- **Modelo:** o motor é o compartilhado com os contratos (seção "Motor de modelo", abaixo). Datas em
  dd/mm/aaaa e dinheiro em pt-BR.
- **Campos:** `cliente`, `projeto`, `resumo`, `escopo`, `fora_do_escopo`, `entregaveis`, `data` (hoje;
  fixa na demo), `inicio`, `entrega`, `validade_data` (data + validade), `valor_total` (o valor proposto),
  `entrada_percentual`, `entrada_valor`, `saldo_valor`, `revisoes_incluidas`, `revisao_extra_valor` (horas da
  rodada × valor/hora), `garantia_dias`, `prazo_resposta_dias`, `prestador_nome` ("nome comercial, por nome"; se só
  um existir, esse) e `prestador_contato` (e-mail e WhatsApp).
- **Markdown aceito:** títulos, parágrafos, listas (`-`, `*`, `1.`) e **negrito**. A página monta nós DOM com
  `textContent`, sem `innerHTML`.
- **Sem vazamento:** o piso, a margem de risco, o valor/hora, a composição e as observações da planilha
  não são campos do modelo, então não saem no documento, na cópia, no .md baixado nem na impressão;
  um `{{valor_hora}}` no modelo é campo desconhecido e a linha some. Há um teste que gera o documento completo e confere.
- **Botões:** "Copiar texto" (markdown), "Baixar .md" e "Imprimir" (A4, margens de 20mm, só o documento,
  sem barra lateral nem formulário, sem quebra de página dentro de uma seção).
- **Do Orçamento para cá:** "Gerar proposta com este cálculo" abre `/propostas#campo=valor&...`. O fragmento
  (`#`) não vai ao servidor; `public/propostas/fragmento.js` só aceita campos conhecidos e válidos. Sem `localStorage`.

### Motor de modelo (compartilhado por Propostas e Contratos)

`public/documentos/modelo.js` (UMD: o navegador e o teste usam o mesmo arquivo) preenche o modelo
markdown de `70-negocio/modelos/` com os campos que cada documento permite:

- **Fora do documento:** frontmatter, linhas de citação (`>`), linhas `---` e, havendo título, tudo o que vem
  antes do primeiro título. Nota para quem edita o modelo vai em citação.
- **`{{campo}}`:** linha com campo vazio (ou desconhecido) é omitida, junto com as linhas recuadas que a
  continuam. Campo de lista sozinho na linha vira itens `- ...`; no meio da linha vira texto com vírgulas.
- **`{{#se campo}}` ... `{{/se}}`:** o bloco só entra se o campo tiver valor (texto não vazio, lista não
  vazia ou `true`). As marcas ficam em linha própria e não aninham: uma nova abertura substitui a anterior, `{{/se}}`
  solto é ignorado e bloco sem fechamento vai até o fim. Marca fora de linha própria é omitida, nunca impressa.
- **Seção vazia:** um título `##` ou mais fundo some quando não sobra corpo até o próximo título de nível igual
  ou superior (um `###` dentro dele conta como corpo); a limpeza repete até estabilizar.
- **Markdown aceito na prévia:** títulos, parágrafos, listas e **negrito**; a página monta nós DOM com `textContent`.

`public/documentos/pagina.js` (prévia e botões Copiar, Baixar e Imprimir) e `public/documento.css` (layout,
papel em serifa e impressão em A4) também são compartilhados. `src/documentos.js` lê o perfil e os modelos.

## Contratos (`/contratos`)

Gerador de contratos, só leitura: o documento aparece na página e sai por copiar, baixar ou imprimir; nada é
gravado. `/api/contratos` junta:

| Arquivo | O que vira |
|---|---|
| `modelos/contrato.md` | o modelo, com `{{campo}}` e blocos `{{#se campo}}` |
| `perfil.md` | só o nome e o e-mail, como padrão do contratado |
| `precificacao.md` | `revisoes_incluidas`, `revisao_extra_horas`, `garantia_dias`, `hora_avulsa`, `prazo_resposta_cliente_dias`, `entrada` e `valor_hora` |
| `propostas/*.md` | as propostas com `status: aceita` no frontmatter |

- **Proposta aceita:** frontmatter com `status` (aceita; sem distinguir acento nem caixa), `cliente`, `projeto`,
  `valor`, `entrada_percentual` (`0.4`, `40` ou `40%`; acima de 1 vale como porcentagem), `inicio`, `entrega`
  (AAAA-MM-DD), `escopo`, `fora_do_escopo` e `entregaveis` (listas). Campo ausente ou inválido vira aviso e fica
  vazio, nunca valor chutado; `fora_do_escopo: []` explícito não é ausência. Outro status não aparece. Sem nenhuma, a
  página diz "Nenhuma proposta aceita ainda" e deixa preencher à mão.
- **Formulário:** escolher a proposta preenche contratante (cliente), projeto, valor, entrada, datas e as três
  listas; dá para editar tudo depois. Contratado (nome e e-mail vêm do perfil, CPF e endereço são digitados) e
  contratante (nome ou razão social, CNPJ ou CPF, endereço, representante legal só para CNPJ, e-mail) são digitados na hora.
  Opções: forma de pagamento (texto), foro (padrão: `cidade_uf` do perfil; sem ela, o campo fica vazio e avisa "Informe o foro"), sistema sob medida,
  trata dados pessoais (com a descrição), linhas para testemunhas e minuta (marcada por padrão).
- **Aviso fixo na tela**, fora do documento: "Minuta gerada a partir de modelo. Não substitui revisão jurídica. Veja
  70-negocio/notas-juridicas.md."
- **Campos do modelo:** `contratado_nome`, `contratado_cpf`, `contratado_endereco`, `contratado_email`,
  `contratante_nome`, `contratante_documento_tipo`, `contratante_documento`, `contratante_endereco`,
  `contratante_representante`, `contratante_email`, `projeto`, `escopo`, `fora_do_escopo`, `entregaveis`, `data`,
  `inicio`, `entrega`, `valor_total`, `entrada_percentual`, `entrada_valor`, `saldo_valor`, `forma_pagamento`,
  `revisoes_incluidas`, `revisao_extra_valor` (horas da rodada × valor/hora), `garantia_dias`, `hora_avulsa`,
  `prazo_resposta_dias`, `foro` e, para `{{#se}}`, `sistema_sob_medida`, `trata_dados`, `nao_trata_dados` (o inverso, para a outra versão da cláusula de dados), `dados_tratados`, `testemunhas` e `minuta`.
  CPF e CNPJ saem formatados; datas em dd/mm/aaaa e dinheiro em pt-BR. O Anexo I é o escopo, o fora do escopo e os entregáveis.
- **CPF e CNPJ:** a página confere os dígitos verificadores (CNPJ numérico ou alfanumérico) e só avisa, ao lado do campo;
  não bloqueia nem entra no documento.
- **Privacidade:** nada é gravado, sem `localStorage` e sem dados das partes na URL (não há fragmento como em
  Propostas). CPF, CNPJ e endereços existem só na memória da página, e o único pedido ao servidor é a leitura de `/api/contratos`.
- **Sem vazamento:** piso, margem de risco, valor/hora e composição não são campos do modelo, e `/api/contratos` nem os
  entrega (só os sete parâmetros acima). Um teste gera o documento completo e confere.
- **Impressão:** A4, o mesmo CSS de Propostas. As linhas de assinatura ficam inteiras e nunca sozinhas numa página: o
  fim da seção anterior vai junto num bloco que não se divide.

## Design

O site é uma lente sobre notas: cada página diz de que arquivo vem, há quanto
tempo ele mudou e tem "Abrir no Obsidian". Só a Home tem presença (a data, uma
frase com o que pede atenção hoje e a faixa da semana); o resto é lista, tabela
e espaço. Plano completo, paleta e decisões em [`docs/design.md`](design.md).

- **Cor:** a barra lateral em cobalto chapado (`#2338B8` / `#1B2A9C`) é a identidade; no conteúdo o
  acento é o mesmo cobalto (`#2338B8` no claro, `#8CA0FF` no escuro); verde, âmbar e vermelho só no
  semáforo, como bolinha e linha lateral. Tema claro e escuro; o padrão segue o
  sistema e o alternador fica no rodapé da barra (`localStorage`).
- **Tipografia:** Archivo (variável, com o eixo de largura) na interface e, condensado (wdth 80),
  nos títulos e nos H2; Source Serif 4 só na frase da Home e nas notas; escala 12/14/16/20/24/28/44/64. Fontes servidas de `public/fonts` (OFL).
- **Ícones:** Lucide (ISC), só os usados, num sprite (`public/icons.svg`).
- **Forma:** um painel de destaque por página (raio 14px), controles com raio
  6px, sem sombra. Comparações em barras horizontais com o valor escrito; Chart.js
  só na série por dia, com o dia de hoje em destaque (ou um traço "hoje" quando não há saída).
- `npm run assets` recopia as fontes e remonta o sprite a partir de `node_modules`.
- `scripts/favicon.sh` regera `favicon-32.png` e `apple-touch-icon.png` a partir de `public/favicon.svg` (precisa do `rsvg-convert`).

Capturas do modo demonstração (dados inventados): todas as telas, em claro e escuro, estão no
[README](../README.md#capturas); o processo para regerá-las está em
[Regerar as capturas](../README.md#regerar-as-capturas) (`npm run capturas`).

No celular (abaixo de 800px a barra vira gaveta; as capturas têm 500px de largura, o mínimo da janela do Firefox):

| Home | Menu aberto |
|---|---|
| ![Home no celular](capturas/celular-home-escuro.png) | ![Menu aberto no celular](capturas/celular-menu-claro.png) |

## Testes

`npm test` usa `test/fixtures/vault-exemplo/`, com valores inventados.
O repositório não guarda dados pessoais.

## Estrutura

```
server.js                    lê a configuração e escuta a porta
nav.json                     menu lateral (editável)
src/app.js                   servidor http: rotas, /api/nav, /api/home, SSE, watchers
src/config.js                host, porta, vault, modo demo; lê config.json e nav.json
src/nav.js                   nav.json + áreas registradas → menu
src/home.js                  resumo() e datas() das áreas → Home
src/fontes.js                origem de cada página (caminho, mtime, link do Obsidian)
src/datas.js                 utilitários de data (AAAA-MM-DD, semana ISO)
src/md.js                    leitura de seções, tabelas e frontmatter
src/events.js                SSE + fs.watch
src/areas/index.js           lista de áreas
config.json                  premissas editáveis, genéricas e versionadas
config.local.json            (ignorado pelo git) o que é só seu; sobrepõe o config.json, menos na demo e nos testes
src/areas/financeiro/        leitura (data.js) e diagnóstico (diagnostico.js)
src/areas/estudos/           roadmaps e revisões pendentes
src/areas/financeiro/lancar.js     motor puro dos lançamentos
src/areas/financeiro/lancar-io.js  versão, anti-duplicado, gravação atômica e desfazer (a única escrita)
src/areas/metas/             metas automáticas e manuais, status e ritmo
src/areas/tempo/             tabelas de 80-tempo: semana, mês, projetos
src/areas/biblioteca/        notas de 20-biblioteca: pasta, status, busca
src/areas/demandas/          clientes, propostas, contratos e projetos por prazo
src/areas/relatorios/        semana e mês: tempo, gastos por categoria, metas
src/areas/orcamento/         leitura de 70-negocio/precificacao.md
src/areas/propostas/         leitura de perfil.md, modelos/proposta.md e dos parâmetros
src/areas/contratos/         modelo, parâmetros e propostas aceitas (70-negocio/propostas/)
src/documentos.js            leitura do perfil e dos modelos de documento (Propostas e Contratos)
src/areas/kanban/            kanban semanal
src/areas/agenda/            agenda.md + prazos + datas das áreas
public/tokens.css            paleta, fontes e escala (claro e escuro)
public/tema.js               aplica o tema salvo antes da pintura
public/base.css              tipografia e componentes comuns
public/fonts/, icons.svg     fontes (OFL) e sprite de ícones Lucide (ISC)
public/shell.js, shell.css   barra lateral, tema, origem da página, SSE e faixa da demo
public/live.js               aoVivo(area, recarregar) para as páginas
public/index.html, home.js   Home
public/financeiro/           páginas: index.html, diagnostico.html, lancar.html
public/estudos/              página de estudos
public/metas/                página de metas
public/tempo/                página de tempo
public/biblioteca/           página da biblioteca
public/demandas/             página de demandas
public/relatorios/           página de relatórios
public/orcamento/            página, fórmula (UMD, também usada nos testes e em /propostas) e resumo
public/propostas/            página, campos da proposta e fragmento da URL (UMD)
public/contratos/            página e campos do contrato, com validação de CPF e CNPJ (UMD)
public/documentos/           motor de modelo (UMD) e prévia/botões (navegador), compartilhados
public/kanban/, agenda/      páginas de kanban e agenda
public/semana.css            estilos de estudos, kanban e agenda
public/home.css, metas.css, lancar.css, financeiro.css, orcamento.css, propostas.css, contratos.css, formulario.css  estilos das áreas e dos formulários
public/documento.css         layout, papel e impressão dos documentos (Propostas e Contratos)
scripts/assets.js            copia fontes e monta o sprite (npm run assets)
scripts/favicon.sh           PNGs do favicon a partir do SVG
scripts/capturas.js          regera docs/capturas pela demo (npm run capturas)
scripts/backup.js            backup do vault (.tar.zst datado, retenção, gpg opcional); timer do systemd
scripts/ensaio.js            copia 40-financeiro para /tmp/cerebro-ensaio (ensaio da escrita)
scripts/teste-tempo-ui.js    roteiro Marionette do cronômetro e do pomodoro de /tempo (fora do npm test)
scripts/teste-lancar-ui.js   roteiro Marionette do Lançar sobre cópia do vault de exemplo (fora do npm test)
docs/                        design.md e capturas
test/                        node --test + vault de exemplo
```

### Nova área (metas, tempo, ...)

1. `src/areas/<id>/index.js` seguindo o contrato acima.
2. `public/<id>/index.html` com `shell.js`, `live.js` e o JS da página.
3. Registrar em `src/areas/index.js`. Se o `id` já estiver no `nav.json`, o
   item sai de "em breve" sozinho.

As rotas `/api/<id>` e `/api/<id>/<sub>`, as páginas `/<id>` e `/<id>/<nome>`,
o cartão da Home e o aviso de mudança via SSE saem de graça.
