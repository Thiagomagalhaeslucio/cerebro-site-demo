---
tags: [negocio, precificacao]
data: 2026-03-01
---

# Precificação (exemplo)

Valores inventados para testes e para a demonstração.

## Valor/hora mínimo

- [ ] Pergunta antiga, sem uso na calculadora
- Valor: _a definir_

## Parâmetros

Tabela de apoio com uma coluna extra e uma sub-tabela, que o leitor deve ignorar.

| chave | valor | unidade | descrição | extra |
| --- | --- | --- | --- | --- |
| valor_hora | 50 | R$/h | Valor/hora alvo | x |
| valor_hora_piso | 30 | R$/h | Mínimo aceito | x |
| margem_risco | 0.10 | fração | Margem de risco | x |
| adicional_urgencia | 0.30 | fração | Adicional de urgência | x |
| deslocamento_fixo | 20 | R$/viagem | Valor fixo por viagem | x |
| deslocamento_km | 2 | R$/km | Valor por km | x |
| tempo_viagem_fator | 0.5 | fração do valor/hora | Tempo de viagem | x |
| revisoes_incluidas | 2 | rodadas | Rodadas incluídas | x |
| revisao_extra_horas | 3 | horas | Horas por rodada extra | x |
| repasse_terceiros | 1 | 1 = sim, 0 = não | Repasse sem margem | x |
| imposto | 0.10 | fração do bruto | Imposto | x |
| entrada | 0.40 | fração do recomendado | Entrada | x |
| desconto_max | 0.20 | fração | Desconto máximo | x |
| capacidade_horas_semana | 10 | horas | Horas por semana | x |
| garantia_dias | 45 | dias | Informativo | x |
| hora_avulsa | 60 | R$/h | Informativo | x |
| validade_proposta_dias | 15 | dias | Validade da proposta | x |
| prazo_resposta_cliente_dias | 3 | dias | Prazo do cliente para responder | x |

### Base do valor/hora

| Meta mensal | Fase A |
| --- | --- |
| R$ 1.000 | R$ 10,0/h |

## Tipos de trabalho

| tipo | horas_min | horas_max | obs |
| --- | --- | --- | --- |
| Tipo Alfa | 10 | 20 | Exemplo |
| Tipo Beta | 30 | 61 | Exemplo |
| Tipo Gama | 20 | 40 | Projeto grande |

## Faixa de mercado

| tipo | preco_min | preco_max | fonte |
| --- | --- | --- | --- |
| Tipo Alfa | a definir | a definir | a definir |

## Complexidade

| nivel | multiplicador |
| --- | --- |
| baixa | 1.0 |
| média | 1.5 |
| alta | 2.0 |

## Como calcular

Texto livre; o site usa a fórmula do código, não este texto.
