# Design do cérebro

O site é uma lente sobre notas: não tem dados próprios, só lê o vault, com uma única
exceção, Lançar movimento (`/financeiro/lancar`, com as salvaguardas da seção "Lançar"). O visual
segue isso. Parece um caderno bem diagramado, com a nota de origem sempre à vista.

## Princípios

1. **A fonte é informação.** Toda página diz de que arquivo vem, há quanto tempo
   ele mudou e tem "Abrir no Obsidian". Isso fica logo abaixo do título, e não num
   rodapé cinza, porque é a pergunta que o site responde: "o que as minhas notas
   dizem agora?".
2. **Uma coisa memorável.** Só a Home tem presença: a data grande, uma frase com o
   que pede atenção e a faixa da semana. A frase só diz o ritmo do dia (compromissos com hora) e uma contagem curta, sem
   repetir títulos ("Duas coisas pedem atenção", link âncora para o bloco; sem
   nada, "Nada pendente hoje."); a contagem é o número de linhas de "Pede
   atenção", que guarda títulos, prazos e links. Abaixo, duas colunas sem repetir a faixa:
   "Pede atenção" (atrasados, vence hoje, alerta do financeiro; vazio diz "Nada
   pendente hoje") e "Em andamento" (kanban feitos/total, próximo passo de cada
   roadmap, patrimônio com as datas de salário, VT e VR, e o veredito). Cada item é
   uma linha com link. O veredito do financeiro aparece uma vez: em "Pede atenção"
   se amarelo ou vermelho, em "Em andamento" nos demais casos. As outras páginas são silenciosas: lista,
   tabela, espaço.
3. **Um destaque por página.** No máximo um painel com superfície (raio 14px); o
   resto é texto sobre o fundo, separado por linhas finas.
4. **Cor quer dizer alguma coisa.** O azul é o único acento. Verde, amarelo e
   vermelho só aparecem no semáforo, como bolinha e linha lateral, nunca como
   fundo preenchido.
5. **Números são tabela.** Algarismos tabulares (`tabular-nums`) e alinhados à direita só dentro de coluna de tabela. Fora dela (barras, cartões, texto) os numerais são proporcionais, porque o `tnum` dá largura fixa a vírgula e ponto.

## Paleta (`public/tokens.css`)

| Nome | Claro | Escuro | Uso |
|---|---|---|---|
| Papel (`--fundo`) | `#EFF1F4` | `#0E1319` | fundo da página |
| Folha (`--superficie`) | `#FFFFFF` | `#151C24` | o painel de destaque |
| Tinta (`--tinta`) | `#121821` | `#E8ECF1` | texto |
| Tinta suave (`--tinta-suave`) | `#5A6572` | `#8794A3` | metadados, rótulos |
| Linha (`--linha`) | `#D9DEE4` | `#243040` | separadores, bordas de controle |
| Caneta (`--acento`) | `#2338B8` | `#8CA0FF` | links, barras de progresso, gráficos, foco |
| Barra (`--barra-fundo`) | `#2338B8` | `#1B2A9C` | a barra lateral, chapada; texto `--barra-texto` branco (AA nos dois) |
| Verde (`--ok`) | `#2F8F5B` | `#4CC38A` | semáforo |
| Âmbar (`--atencao`) | `#B7791F` | `#E3B341` | semáforo |
| Vermelho (`--alerta`) | `#C23B32` | `#FF6B5E` | semáforo, atraso |

Barra lateral (2ª rodada): é a única aposta de identidade. Cobalto chapado, sem
gradiente nem brilho; tokens `--barra-fundo`, `--barra-texto`, `--barra-ativo-fundo`
(branco) e `--barra-ativo-texto` (a cor da barra). O conteúdo continua neutro e o
cobalto aparece nele só no que é clicável ou progresso (no escuro, o tom claro).

Derivadas: `--acento-tinta` (fundo do item ativo, acento a ~10%) e os degraus do
acento para gráficos (`--acento-1` a `--acento-3`), feitos com `color-mix` sobre a
superfície. As cores de status nunca são usadas como cor de texto pequeno: o
âmbar claro não passa AA sobre branco, então o texto ao lado da bolinha é sempre
tinta.

Tema: segue o sistema (`prefers-color-scheme`). O alternador no rodapé da barra
(automático, claro, escuro) grava em `localStorage` e aplica `data-tema` no
`<html>` antes da pintura (`/static/tema.js`, no `<head>`).

## Tipografia

- **Archivo** (variável com eixo `wdth`, OFL; pacote `@fontsource-variable/archivo`,
  CSS `wdth`). Largura normal na interface e no texto de apoio. **Condensado**
  (`font-stretch: 80%`, token `--larg-titulo`; a 75% as letras quase se tocavam), peso 700 a 800, em maiúsculas e
  minúsculas normais, nos títulos de página, na data da Home (64px), nos números
  grandes (patrimônio) e na marca "cérebro" (24px, 800). Troca da Schibsted
  Grotesk, que não tinha voz própria.
- **Source Serif 4** (variável, OFL) só onde há prosa de nota: a frase de abertura
  da Home e o texto de notas (`.prosa`). Textos de interface, como "O que fazer"
  e "Como calculei" no Diagnóstico, ficam em Archivo. Altura de linha 1.65 na
  serifa, no máximo 68 caracteres por linha.
- **H2 de seção** ("Pede atenção", "Metas", "Saldo por panela"...): Archivo condensado, wdth 80, peso 700, 24px. Os h2 que só rotulam um componente (coluna do kanban, semana da faixa, mês da agenda, indicador do diagnóstico) são texto de interface e ficam em largura normal, 14 a 16px.
- Escala fixa: 12, 14, 16, 20, 24 (marca), 28, 44 e 64px (data da Home). Títulos
  condensados com `letter-spacing: 0` (negativo, em condensado, encosta as letras); h3 em peso 600, largura normal. A data da Home usa `clamp(24px, 8.2cqi, 64px)`: medida na fonte, "Quarta-feira, 30 de setembro" tem 11,8 em em wdth 80 e 8,2cqi mantém o pior dia numa linha, a 360px inclusive.
- Arquivos `.woff2` (latin e latin-ext) copiados de `node_modules/@fontsource-variable`
  para `public/fonts` por `npm run assets`. Sem CDN: a CSP é `default-src 'self'`.

## Layout

- Barra lateral fixa de 248px: marca "cérebro" só em texto; grupos com título
  pequeno em minúsculas; itens de 36px com ícone Lucide de 18px (traço 1.6); subitens (Diagnóstico, Lançar) também têm ícone, recuados 16px;
  ativo invertido (fundo branco, texto na cor da barra); títulos de grupo em
  branco a 65%; foco em branco. Só os itens ativos aparecem nos grupos (ordem do
  `nav.json`); os "em breve" vão para um grupo recolhido "em construção" no fim,
  fechado por padrão, com contador (o estado aberto sobrevive ao recarregar o menu). Rodapé: ponto da conexão, nome do vault e o alternador de tema.
  Abaixo de 800px vira gaveta.
- Conteúdo em uma coluna de até 1040px, margem de 40px (16px no celular).
- Cabeçalho de página: título de 28px, depois a linha da fonte (12px, tinta suave). Com mais de um arquivo de origem, um por linha (caminho e "alterado há X"), com "Abrir no Obsidian" na primeira.
- Três raios, todos em `tokens.css`: `--raio-fino` 2px (barras, trilhos, anel de foco e barras do gráfico), `--r-controle` 6px (controles, chips) e `--r-destaque` 14px (o painel de destaque). Círculo (50%) só nas bolinhas. Sem sombra.
- Tabelas: só linhas horizontais, números à direita, 14px, linhas de 40px.

## Componentes

- **Semáforo:** bolinha de 8px + texto em tinta; no bloco do indicador, uma linha
  lateral de 3px na cor do status.
- **Gráficos:** Chart.js só onde a série é temporal (saídas por dia). Barras no
  degrau claro do acento e o dado que importa (hoje) no acento cheio; sem
  legenda. Se hoje não tem saída, não há barra para destacar: um traço fino de 1px em
  tinta suave marca o dia e leva o rótulo "hoje" acima da área do gráfico. Comparações (saldo por panela, saídas por categoria) viram barras
  horizontais em HTML, ordenadas, com rótulo, R$ e % escritos na linha.
- **Vazio e erro:** dizem o que aconteceu e o que fazer ("Nenhum arquivo
  kanban-AAAA-SS.md em 10-diario. Crie a semana pela skill semana."), sem pedir
  desculpa.
- **Movimento:** só a entrada da faixa da semana, abrir/fechar a gaveta, expandir
  um roadmap. Tudo desligado com `prefers-reduced-motion: reduce`.

## Aba do navegador

- **Título:** só o nome curto da página, sem sufixo; a Home vira "cérebro"; no modo
  demonstração leva " (demo)". Montado em `shell.js` a partir do `/api/nav` (campo
  opcional `curto` no `nav.json`, p. ex. "Kanban" para "Kanban semanal"). O `<title>`
  de cada HTML é só um reserva ("cérebro").
- **Favicon:** `public/favicon.svg`, quadrado de cantos arredondados no cobalto da
  barra com um "c" branco desenhado em path (sem fonte), com variante escura via
  `prefers-color-scheme` dentro do SVG. `favicon-32.png` e `apple-touch-icon.png`
  (180px, quadrado até a borda) saem de `scripts/favicon.sh` (rsvg-convert). No modo
  demo o shell troca para `favicon-demo.svg`, que leva um ponto âmbar no canto.
- **Cabeça:** `shell.js` acrescenta os `<link rel="icon">`, o apple-touch-icon e o
  `<meta name="theme-color">` (lido de `--barra-fundo`, acompanha o tema) uma vez,
  sem repetir nos HTMLs. Os arquivos respondem na raiz (`/favicon.svg` etc.); a CSP
  segue `default-src 'self'`.

## Revisão contra o "NÃO FAZER"

| Item | Situação no plano |
|---|---|
| Rótulo em caixa alta espaçado | Títulos de grupo do menu em minúsculas, sem tracking |
| Textos com "·" | Separação por vírgula, quebra de linha ou coluna de tabela |
| "→" em links e botões | Removido; link "Abrir no Obsidian" usa o ícone external-link |
| Emojis | Removidos (também do aviso de marco atingido e dos avisos ⚠, que viram ícone + texto) |
| Gradiente, vidro, brilho | Nenhum |
| Círculo colorido atrás de ícone | Ícones soltos, na cor do texto |
| Animação de entrada em todo bloco | Só a faixa da semana |
| Hover que levanta cartão | Hover muda só o fundo do item de menu e sublinha links |
| Mono em rótulo pequeno | Mono só para caminho de arquivo, que é código |

## Onde o primeiro plano era genérico, e o que mudou

1. **Home com quatro cartões de número** (patrimônio, livre, tarefas, eventos).
   É o que qualquer dashboard faz. Troquei por uma frase escrita, em serif, que
   junta o que importa hoje. Ela é gerada pelas mesmas regras do diagnóstico e do
   kanban.
2. **Faixa da semana como sete cartões.** Virou uma régua: sete colunas separadas
   por linhas finas, sem caixa, com o dia de hoje marcado por uma barra no acento.
   Os pontos usam a cor da origem, em degraus do acento, e o atraso fica em vermelho.
3. **Ícone ao lado do título de cada página.** Cortado: ícone só no menu, onde
   ajuda a escanear; no título ele seria enfeite.
4. **Rosca de gastos por panela.** Pizza não deixa comparar. Virou barra
   horizontal ordenada com o valor escrito.
5. **Etiqueta de status preenchida** (verde/amarelo/vermelho). Virou bolinha + texto
   e a linha lateral de 3px, que mantêm o texto em tinta e o contraste em AA.
6. **Fonte da nota no rodapé.** Subiu para baixo do título (princípio 1).
7. **Fonte de nota com cara de "editorial"** (serifada em tudo). A serif fica só
   onde há prosa; números e rótulos continuam na grotesca, que lê melhor em tabela.

## Detalhes da 2ª rodada

- **Data da Home** numa cor só e sem ano: o ano não aparece em lugar nenhum da Home.
- **Pontos vazados** (prazo do kanban e outras áreas): contorno de 1.5px, em acento
  e em tinta suave; contraste medido de 5.2:1 a 9:1 contra fundo e folha, nos dois temas.
- **Links da Home** (linhas de "Pede atenção" e "Em andamento"): título em tinta com
  sublinhado de 1px em tinta suave, que vira acento no hover e no foco. O acento fica só
  no link da frase de abertura, nos estados ativos e no anel de foco.
- **Títulos de seção e de área** em tinta.
- **Estudos** não mostra os ids internos dos passos ("Blk003", "F001"); eles seguem na API.
- **Diagnóstico**: sem a frase "Quatro regras fixas... sem IA" sob o veredito; "Como calculei"
  é um `details` fechado por padrão, com o título como resumo.
- **Movimentos**: a panela de uma transferência usa os nomes de exibição ("Pessoal / Lazer para Conta"), não o texto cru `pessoal→conta`.

## Lançar

A única página que escreve, então a mais cuidadosa: nada é gravado sem pré-visualização e confirmação.

- **Mesmo desenho de Orçamento:** formulário à esquerda, texto sobre o fundo; a pré-visualização à direita é o
  único painel com superfície da página, fixa na rolagem no desktop (empilhados abaixo de 960px).
- **Operação em controle segmentado** (os botões de `.grupo-botoes`), com setas para trocar. Campos só os da operação.
- **"Sai de" sem valor padrão.** A skill do financeiro manda não chutar de onde saiu um gasto; a descrição só
  sugere ("Pela descrição (mercado), parece VR. Usar").
- **A prévia abre com a frase:** "Conta R$ 225,88 para R$ 188,75; patrimônio R$ X para R$ Y", depois a tabela de
  antes e depois (números à direita, tabulares só na tabela) e as linhas exatas que vão para `movimentos.md`.
- **Aviso é linha com barra lateral de 3px, texto em tinta;** o que exige confirmação leva a barra vermelha e a
  caixa "Li os avisos". Erro de validação usa a mesma lista de erros do resto do site.
- **Teclado primeiro:** Enter pré-visualiza, Enter de novo confirma, Esc fecha; depois de gravar, o foco volta ao
  valor e o painel mostra o resultado com "Desfazer". Sem animação nova.
- **Demo:** a prévia funciona, "Confirmar e gravar" fica desligado e a página avisa no topo e ao lado do botão.

## Metas

- **Resumo no topo é o único painel com superfície**: cinco números (total, no ritmo, atenção, atrasadas,
  concluídas) em condensado 28px, com a bolinha do semáforo nos quatro que são status. Abaixo, uma seção
  por área (h2 de seção) e uma lista de linhas finas, sem cartão.
- **Cada linha:** nome (link para a página de origem nas automáticas), barra fina de progresso no acento,
  "x de y unidade", prazo com "em N dias" e status em bolinha mais texto em tinta, como no semáforo. A cor
  nunca preenche a linha. Abaixo, em tinta suave, o ritmo ("faltam X; no ritmo de Y por semana"), a projeção
  do diagnóstico e a observação.
- **Meta sem datas** só tem a barra: a coluna de status fica vazia, em vez de um "sem status".
- **Linha inválida é aviso, não valor chutado**; sem `metas.md` a página mostra só as automáticas e uma
  dica de como criar o arquivo.
- **Home:** atrasada é linha de "Pede atenção" (vermelho, com o prazo) e conta na frase; as outras ficam
  numa linha "Metas" de "Em andamento".

## Foco (Estudos)

- Roadmap com a tag `foco` ganha uma etiqueta fina (texto no acento, borda de 1px, sem preenchimento) ao lado do
  nome, vai primeiro e abre já aberto. É a única marca de cor do roadmap; as demais linhas seguem em tinta.

## Relatórios

- **Barra de navegação** no topo: Semana/Mês em controle segmentado, anterior e próximo com seta (próximo apagado no período atual),
  o período em texto (500) e "Hoje"; "Copiar resumo" à direita. Resumo em quatro números condensados com a variação em tinta suave.
- **Listas finas** (tempo, gastos, metas) no mesmo desenho das Metas e do Tempo: barra no acento relativa ao maior item,
  valor e parte do total à direita. **Cor só na bolinha** de status das metas.

## Demandas

- **Mesma família das Metas:** resumo no topo (cinco números condensados, sem cor) e uma seção por cliente (h2 de
  seção, com o valor aceito à direita em tinta suave), lista fina sem cartão.
- **Linha:** tipo em tinta suave (Projeto, Proposta, Contrato), título em link sublinhado fino, status, prazo com "em N dias" e,
  abaixo, o detalhe (backlog em aberto, valor). **Cor só na bolinha vermelha** do prazo vencido; item encerrado fica a 60% de opacidade.

## Biblioteca

- **Resumo no topo** (três números condensados; a bolinha amarela só no "Revisão pendente" quando há) e, abaixo,
  busca e dois filtros em uma linha (empilhados no celular). Lista fina sem cartão: título em link sublinhado fino,
  status à direita com a bolinha do semáforo só quando é revisão pendente, e a linha suave com pasta, módulo, data e tags.

## Livros (Biblioteca)

- **Grade de cartões** acima das notas: capa na proporção 2:3 com borda fina, título em até duas linhas (sublinha
  fina no acento ao passar o mouse ou focar), autor e páginas em tinta suave. Sem sombra, sem cor de status.
- **Sem capa:** quadro na tinta suave do acento com o título em condensado, no mesmo tamanho dos outros.
- 150px mínimos por cartão (112px no celular); `loading="lazy"`.

## Tempo

- **Mesmo desenho das Metas, sem semáforo:** resumo no topo (quatro números em condensado 28px: horas e dias da
  semana, horas e dias do mês) e listas finas, sem cartão. Tempo não tem meta nem prazo, então nenhuma cor de status.
- **Linha de projeto:** nome, barra fina no acento (fração do maior projeto da lista) e "horas · % do total".
  A cor só aparece na barra.
- **Últimos registros** usam a lista comum (projeto e duração, e data, horário e nota em tinta suave).
- **Cronômetro e pomodoro no alto:** dois painéis lado a lado (um sobre o outro no celular), dígitos
  condensados 64px (44px no celular) com algarismos tabulares, para o número não pular. Só o dígito do
  cronômetro em curso e a barra do pomodoro usam o acento; pausado, o dígito volta à tinta. A fase do
  pomodoro é texto suave, sem cor por fase.
- **Home:** uma linha "Tempo" em "Em andamento", sem entrar em "Pede atenção".

## Orçamento

- **Formulário e resultado lado a lado** (empilhados abaixo de 960px). O formulário é texto
  sobre o fundo, em grupos (Trabalho, Prazo, Deslocamento, Extras) separados por linha fina; o
  resultado é o único painel com superfície da página. Valor recomendado em condensado 44px
  (28px no celular), piso e entrada em 20px, depois a composição em tabela.
- **Ausente ou "a definir" não vira zero.** O arquivo de origem diz que entram como 0; o
  site mostra "—" e uma nota dizendo o que falta, e desativa só o que depende dele. Zero
  esconderia o buraco no preço.
- **Sugestão de urgência é texto**, nunca muda o botão: "Prazo curto: considere marcar como urgente".
- **Impressão limpa = o resumo da proposta.** A folha leva só o resumo (o mesmo do "Copiar
  resumo"), em serifa; formulário, piso, margem e composição são internos e não saem no papel.
- Sem `localStorage`: o formulário recomeça vazio a cada visita (o tema continua salvo, como no resto do site).

## Propostas

- **Formulário à esquerda, prévia à direita** (empilhados abaixo de 960px, como o Orçamento, com os mesmos
  estilos de formulário em `formulario.css`). A prévia é o único painel com superfície da página, fixa na
  rolagem no desktop; os botões ficam no topo dela.
- **O documento é prosa**, então vai em serifa (Source Serif 4, 16px, linha 1.65, até 68 caracteres), com título
  em Archivo condensado (28px) e seções em 20px. Cada `##` vira uma `<section>`, para a impressão não
  cortar uma seção ao meio.
- **"Cálculo do valor" recolhido** (`details`): o formulário não pede preço a quem só quer o texto. O aviso de
  valor abaixo do piso é uma linha com barra lateral âmbar de 3px (cor só na barra, texto em tinta) e mora só no
  formulário; o documento não tem como mostrá-lo.
- **O que não sai no papel:** piso, margem de risco, valor/hora, composição e observações da planilha. A regra
  está no código, não na CSS: esses dados não são campos do modelo.
- **Impressão:** A4, margens de 20mm, preto sobre branco, sem painel, borda nem sombra. Só o documento; barra
  lateral, cabeçalho, avisos e formulário somem. `break-inside: avoid` nas seções e `break-after: avoid` nos títulos.
- **Linha omitida, não em branco:** campo vazio tira a linha inteira (e o título da seção que ficou vazia), em vez de
  deixar "Início previsto: ". "Perfil incompleto" é um aviso no topo da página, não no documento.
- Sem `localStorage` nem gravação: o formulário recomeça vazio a cada visita, ou com o que veio no fragmento da URL.

## Contratos

Mesmo desenho de Propostas: o layout, o papel em serifa e a impressão são os de `public/documento.css`, e a
prévia e os botões vêm de `public/documentos/pagina.js`. Só muda o que é do contrato.

- **Aviso fixo acima do formulário**, não no documento: "Minuta gerada a partir de modelo. Não substitui revisão
  jurídica. Veja 70-negocio/notas-juridicas.md." Barra lateral âmbar de 3px, texto em tinta, como os outros avisos;
  some na impressão. A opção "Minuta" (marcada por padrão) é que põe a faixa "MINUTA" no texto do documento.
- **Formulário em cinco grupos:** proposta aceita, contratado, contratante, projeto e pagamento, escopo e opções.
  Quem preenche à mão não perde nada: sem proposta aceita o seletor some e entra "Nenhuma proposta aceita ainda".
  O representante legal só aparece com CNPJ; a descrição dos dados só aparece com "trata dados pessoais" marcado.
- **CPF e CNPJ avisam, não bloqueiam.** O aviso é uma linha com barra âmbar abaixo do campo; o documento sai igual.
  Quem sabe o que está fazendo (documento de estrangeiro, número ainda não conferido) não fica travado.
- **Dados das partes só na memória da página:** não vão para a URL (sem fragmento, ao contrário de Propostas, porque
  CPF e endereço não podem parar em histórico, favorito ou link colado), nem para `localStorage`, nem para o servidor.
- **Assinaturas inteiras e acompanhadas:** na impressão, o bloco de assinaturas não se divide e nunca fica sozinho
  numa página. O Firefox não respeita `break-before: avoid` entre seções, então `pagina.js` põe o fim da seção
  anterior e as assinaturas num mesmo `div` com `break-inside: avoid`.
- **Linha omitida, não em branco**, como em Propostas, e agora também o bloco inteiro: cláusulas opcionais (sistema
  sob medida, dados pessoais, testemunhas, minuta) são blocos `{{#se}}` do modelo, não texto que a pessoa apaga.
