---
tags: [negocio, modelo]
data: 2026-03-01
---

> Texto de exemplo, curto e inventado. Só o que vem depois do primeiro título entra no
> documento. O site preenche os campos {{...}}; linha com campo vazio some; o que fica
> entre {{#se campo}} e {{/se}} só entra se o campo tiver valor. Não é modelo jurídico.

# Contrato de prestação de serviços
{{#se minuta}}
**MINUTA: ainda não revisada por advogado.**
{{/se}}

## Partes
**Contratado:** {{contratado_nome}}
CPF: {{contratado_cpf}}
Endereço: {{contratado_endereco}}
E-mail: {{contratado_email}}

**Contratante:** {{contratante_nome}}
{{contratante_documento_tipo}}: {{contratante_documento}}
Endereço: {{contratante_endereco}}
Representante legal: {{contratante_representante}}
E-mail: {{contratante_email}}

## 1. Objeto
O Contratado desenvolverá para o Contratante o projeto "{{projeto}}", conforme o Anexo I.
{{#se sistema_sob_medida}}
O sistema é feito sob medida e substitui uma assinatura paga; não há mensalidade de licença.
{{/se}}

## 2. Preço e pagamento
Valor total: **{{valor_total}}**
Entrada ({{entrada_percentual}}): {{entrada_valor}}
Saldo na entrega: {{saldo_valor}}
Forma de pagamento: {{forma_pagamento}}

## 3. Prazo
Início previsto: {{inicio}}
Entrega prevista: {{entrega}}
O Contratante responde em até {{prazo_resposta_dias}} dias; atrasos deslocam a entrega.

## 4. Revisões e garantia
- {{revisoes_incluidas}} rodadas de revisão incluídas; cada rodada extra custa {{revisao_extra_valor}}.
- Garantia de {{garantia_dias}} dias para correção de erros da entrega.
- Horas avulsas fora do escopo: {{hora_avulsa}} por hora.

## 5. Propriedade intelectual
Após o pagamento integral, o código-fonte da entrega pertence ao Contratante.

## 6. Confidencialidade
As partes guardam sigilo sobre as informações trocadas durante o projeto.

{{#se trata_dados}}
## 7. Proteção de dados (LGPD)
O sistema trata dados pessoais: {{dados_tratados}}
As partes seguem a LGPD no tratamento desses dados.
{{/se}}
{{#se nao_trata_dados}}
## 7. Proteção de dados
O sistema não trata dados pessoais de terceiros.
{{/se}}

## 8. Responsabilidade
O Contratado responde apenas pelo que consta no Anexo I.

## 9. Rescisão
Qualquer parte pode rescindir com aviso por escrito; o trabalho já feito é pago.

## 10. Comunicações
As comunicações seguem pelos e-mails indicados nas partes.

## 11. Disposições gerais
Alterações só valem por escrito e assinadas pelas duas partes.

## 12. Assinaturas
{{foro}}, {{data}}.

________________________________
{{contratado_nome}}
Contratado

________________________________
{{contratante_nome}}
Contratante
{{#se testemunhas}}

Testemunhas:

________________________________
Nome:
CPF:

________________________________
Nome:
CPF:
{{/se}}

## 13. Foro
Fica eleito o foro de {{foro}}.

## Anexo I: escopo
### Escopo
{{escopo}}

### Fora do escopo
{{fora_do_escopo}}

### Entregáveis
{{entregaveis}}
