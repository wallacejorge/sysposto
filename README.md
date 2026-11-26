# Sistema do Posto

Sistema web para o posto: caixa (PDV), turnos com encerrantes, conferência de caixa e relatórios.
Reconstrói as funções do sistema atual com código próprio. Planejamento em `../replica/`.

## Estado

**Marco 1 (fatia vertical) concluído:** entrar com PIN → abrir turno com encerrantes e fundo de troco →
lançar abastecimento (manual) → registrar a venda (um ou vários abastecimentos, troco) → sangria/despesa →
fechar com conferência de encerrantes e de caixa → relatório do turno → painel do dia.

**Marco 2 (cadastros) concluído:** mercadorias e preços (agora, agendado, promoção, histórico), grupos, unidades,
tipos de preço, tanques, bombas, bicos, formas de pagamento, administradoras, caixas, usuários, perfis, empresa e Meu PIN.

**Marco 3 (caixa de verdade) concluído:** produtos e código de barras, pagamento dividido, frentista, cancelamento e troca de
pagamento, bloqueio da tela, funcionamento sem internet (fila no navegador + service worker), relatório com cancelamentos,
trocas, por frentista e versão 80 mm.

**Preparação da NFC-e:** tributação no formato da nota (copiada das notas que o posto já emite), CRT, série de
contingência por caixa, produtos e preços reais, e lançamento manual pelo encerrante da bomba.

Ainda **não** tem: emissão da NFC-e, integração com o concentrador das bombas, reabrir turno, venda a prazo.
Veja `../replica/build-log.md`.

## Rodar em desenvolvimento

Precisa de Node 20+ e um Postgres 15+.

```bash
npm install
```
```bash
cp .env.example .env.local   # preencha o banco e o SESSION_SECRET
```
```bash
npm run db:reset             # APAGA o banco e cria os dados de exemplo
```
```bash
npm run dev                  # http://localhost:3000
```

PINs de exemplo: Gerente `1234`, Maria `1111`, João `2222`. Troque antes de usar de verdade.

## Estrutura

| pasta | o quê |
| --- | --- |
| `app/login` | entrada por usuário + PIN |
| `app/(app)/caixa` | caixa (PDV), abrir e fechar turno, ações do servidor |
| `app/(app)/relatorios` | turnos e relatório de cada turno |
| `lib/data/caixa.ts` | regras de negócio e consultas (toda escrita passa por `tx`, que grava a auditoria) |
| `lib/format.ts` | dinheiro em centavos, litros com 3 casas, datas no fuso do posto |
| `db/schema.sql` | banco completo (31 tabelas, regras, auditoria, acesso por empresa) |
| `app/tokens.css` | tokens do design (gerado de `../replica/design/tokens.json`) |
| `app/(app)/cadastros` | telas de cadastro e suas ações |
| `lib/data/cadastros.ts` | regras dos cadastros (o que pode e o que não pode mudar) |
| `lib/data/vendas.ts`, `app/api/caixa` | operações do caixa (idempotentes) e catálogo |
| `lib/fila.ts`, `public/sw.js` | fila sem internet (IndexedDB) e service worker |
| `e2e/*.js` (`ajuda.js` tem o lançamento por encerrante) | percorrem os fluxos no navegador (`NODE_PATH=$(npm root -g) node e2e/...`) |

## Regras importantes

- Dinheiro é sempre inteiro em centavos; litros e encerrantes têm 3 casas.
- Um operador e um caixa só têm um turno aberto por vez (garantido no banco).
- Uma venda enviada duas vezes vira uma só (chave gerada no navegador).
- Um abastecimento só entra em uma venda (trava de linha + situação).
