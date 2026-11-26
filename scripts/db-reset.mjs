// Recria o banco de desenvolvimento: apaga tudo, aplica o schema e insere dados de exemplo.
// Uso: npm run db:reset   (lê .env.local)
// NUNCA rode em produção: apaga todos os dados.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";

const raiz = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
for (const linha of fs.readFileSync(path.join(raiz, ".env.local"), "utf8").split("\n")) {
  const m = linha.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (process.env.NODE_ENV === "production") {
  console.error("db:reset recusado em produção.");
  process.exit(1);
}

const banco = process.env.PGDATABASE || "posto";
const admin = new pg.Client({ connectionString: process.env.DATABASE_URL, database: "postgres" });
await admin.connect();
await admin.query(`drop database if exists ${banco} with (force)`);
await admin.query(`create database ${banco}`);
await admin.end();

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query(fs.readFileSync(path.join(raiz, "db/dev-auth-stub.sql"), "utf8"));
await db.query(fs.readFileSync(path.join(raiz, "db/schema.sql"), "utf8"));

const um = async (sql, params) => (await db.query(sql, params)).rows[0];

// Empresa e perfis
// Nome e CNPJ fictícios: os dados verdadeiros são preenchidos na tela "Dados da empresa".
// Regime e UF seguem as notas do posto: lucro presumido (CRT 3), Amazonas.
const empresa = await um(
  `insert into empresas (razao_social, nome_fantasia, cnpj, uf, municipio_ibge, regime_tributario, crt)
   values ('Posto Exemplo Ltda', 'Posto Exemplo', '00000000000191', 'AM', '1302603', 'presumido', '3') returning id`);
const tudo = { "caixa.operar": true, "caixa.reabrir": true, "venda.cancelar": true, "preco.alterar": true, "relatorio.ver": true, "cadastro.editar": true };
const gerente = await um(`insert into perfis (empresa_id, nome, permissoes) values ($1, 'Gerente', $2) returning id`, [empresa.id, tudo]);
const caixaPerfil = await um(`insert into perfis (empresa_id, nome, permissoes) values ($1, 'Caixa', $2) returning id`,
  [empresa.id, { "caixa.operar": true, "relatorio.ver": true }]);

// Usuários (PINs de exemplo: troque antes de usar de verdade)
const pessoas = [
  ["Gerente do Posto", "Gerente", "1234", gerente.id, false],
  ["Maria Operadora", "Maria", "1111", caixaPerfil.id, false],
  ["João Operador", "João", "2222", caixaPerfil.id, false],
  ["Carlos Frentista", "Carlos", null, caixaPerfil.id, true],
];
for (const [nome, apelido, pin, perfil, frentista] of pessoas) {
  const u = await um(`insert into usuarios (nome, apelido, pin_hash, eh_frentista) values ($1,$2,$3,$4) returning id`,
    [nome, apelido, pin ? bcrypt.hashSync(pin, 10) : null, frentista]);
  await db.query(`insert into usuario_empresas (usuario_id, empresa_id, perfil_id) values ($1,$2,$3)`, [u.id, empresa.id, perfil]);
}

// Tributações: copiadas das NF-e e NFC-e que o posto emite hoje (autorizadas pela SEFAZ-AM).
// "revisar" = divergência encontrada (ver replica/tributacao.md); conferir com o contador.
const trib = {};
for (const [chave, d] of Object.entries({
  gasolina: { nome: "Gasolina C (monofásico)", cst: "61", cfop: "5656", cfopFora: "6656", adRem: "1.4700", un: "L", pis: "04", revisar: true,
    obs: "Notas do posto usam R$ 1,4700/L; a distribuidora destacou R$ 1,5700/L em out/2026. Conferir o valor atual." },
  diesel: { nome: "Diesel B (monofásico)", cst: "61", cfop: "5656", cfopFora: "6656", adRem: "1.1200", un: "L", pis: "04", revisar: false, obs: null },
  glp: { nome: "GLP (monofásico)", cst: "61", cfop: "5405", cfopFora: "6404", adRem: "0.0000", un: "kg", pis: "04", revisar: true,
    obs: "Notas do posto informam ad rem zero; o fornecedor destaca R$ 1,47/kg. CFOP 5405 diferente do 5656 dos outros combustíveis." },
  lubrificante: { nome: "Lubrificante (ICMS ST)", cst: "60", cfop: "5656", cfopFora: null, efetivo: "22.00", pis: "01", pPis: "0.6500", pCofins: "3.0000", revisar: true,
    obs: "Um lubrificante sai com PIS/COFINS CST 01 (0,65% / 3%) e outro com CST 04. Confirmar qual é o certo." },
  vasilhame: { nome: "Vasilhame (remessa)", cst: "60", cfop: "5920", cfopFora: null, efetivo: "22.00", pis: "04", revisar: false, obs: null },
})) {
  trib[chave] = (await um(
    `insert into tributacoes (empresa_id, nome, cst_icms, cfop_interno, cfop_interestadual, p_icms_efetivo, ad_rem, ad_rem_unidade,
                              pis_cst, p_pis, cofins_cst, p_cofins, revisar, observacao)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9,$11,$12,$13) returning id`,
    [empresa.id, d.nome, d.cst, d.cfop, d.cfopFora, d.efetivo ?? null, d.adRem ?? null, d.un ?? null, d.pis, d.pPis ?? null, d.pCofins ?? null, d.revisar, d.obs])).id;
}

// Unidades, grupos, tipo de preço
const litro = await um(`insert into unidades (sigla, descricao) values ('L','Litro') returning id`);
const un = await um(`insert into unidades (sigla, descricao) values ('UN','Unidade') returning id`);
await db.query(`insert into unidades (sigla, descricao) values ('CX','Caixa'), ('KG','Quilo')`);
const grupo = await um(`insert into grupos (empresa_id, nome) values ($1, 'Combustíveis') returning id`, [empresa.id]);
const gGas = await um(`insert into grupos (empresa_id, nome) values ($1, 'Gás (GLP)') returning id`, [empresa.id]);
const gLub = await um(`insert into grupos (empresa_id, nome) values ($1, 'Lubrificantes') returning id`, [empresa.id]);
const aVista = await um(`insert into tipos_preco (empresa_id, nome, padrao) values ($1, 'À vista', true) returning id`, [empresa.id]);
const preco = (id, valor) => db.query(`insert into precos (empresa_id, mercadoria_id, tipo_preco_id, preco) values ($1,$2,$3,$4)`, [empresa.id, id, aVista.id, valor]);

// Combustíveis das bombas (como saem nas NFC-e do posto)
const merc = {};
for (const [codigo, nome, ncm, cest, anp, descAnp, pBio, t, valor] of [
  ["GC", "Gasolina comum", "27101259", "0600200", "320102001", "GASOLINA C COMUM", "27", trib.gasolina, "8.590"],
  ["DS10", "Diesel B S10", "27101921", "0600600", "820101034", "OLEO DIESEL B S10 - COMUM", "15", trib.diesel, "8.290"],
]) {
  const m = await um(
    `insert into mercadorias (empresa_id, codigo, nome, grupo_id, unidade_id, tipo, ncm, cest, codigo_anp, descricao_anp, p_bio, tributacao_id)
     values ($1,$2,$3,$4,$5,'combustivel',$6,$7,$8,$9,$10,$11) returning id`,
    [empresa.id, codigo, nome, grupo.id, litro.id, ncm, cest, anp, descAnp, pBio, t]);
  await preco(m.id, valor);
  merc[codigo] = m.id;
}

// Gás, vasilhame e lubrificantes (como saem nas NF-e do posto)
for (const [codigo, nome, g, unid, ncm, cest, anp, descAnp, t, valor, kg] of [
  ["GLP13", "Carga de gás 13 kg", gGas.id, un.id, "27111910", null, "210203001", "GLP", trib.glp, "160.000", "13"],
  ["VASP13", "Vasilhame de gás P13", gGas.id, un.id, "73110000", null, null, null, trib.vasilhame, "20.000", null],
  ["LUB2040", "Lubrificante 20W40 sintético 1 L", gLub.id, un.id, "27101932", "0600700", "110109001", "URUCU", trib.lubrificante, "40.000", null],
  ["LUB2T", "Lubrificante 2T 1 L", gLub.id, un.id, "27101932", "0600700", "620505001", "OUTROS OLEOS LUBRIFICANTES AUTOMOTIVOS", trib.lubrificante, "40.000", null],
]) {
  const m = await um(
    `insert into mercadorias (empresa_id, codigo, nome, grupo_id, unidade_id, tipo, ncm, cest, codigo_anp, descricao_anp, tributacao_id, kg_por_unidade)
     values ($1,$2,$3,$4,$5,'produto',$6,$7,$8,$9,$10,$11) returning id`,
    [empresa.id, codigo, nome, g, unid, ncm, cest, anp, descAnp, t, kg]);
  await preco(m.id, valor);
}

// Tanques e bicos. Pelas NFC-e: bico 8 (bomba 2) puxa gasolina do tanque 4; bico 13 (bomba 4) puxa diesel do tanque 5.
// O resto é suposição (bombas 1 e 2 = gasolina, 3 e 4 = diesel): CONFIRMAR e ajustar no cadastro.
const tanques = {
  GC: (await um(`insert into tanques (empresa_id, numero, mercadoria_id, capacidade_litros) values ($1, 4, $2, 15000) returning id`, [empresa.id, merc.GC])).id,
  DS10: (await um(`insert into tanques (empresa_id, numero, mercadoria_id, capacidade_litros) values ($1, 5, $2, 15000) returning id`, [empresa.id, merc.DS10])).id,
};
for (let b = 1; b <= 4; b++) {
  const bomba = await um(`insert into bombas (empresa_id, numero) values ($1,$2) returning id`, [empresa.id, b]);
  for (let i = 0; i < 4; i++) {
    const numero = (b - 1) * 4 + i + 1;
    await db.query(`insert into bicos (empresa_id, bomba_id, numero, tanque_id) values ($1,$2,$3,$4)`,
      [empresa.id, bomba.id, numero, b <= 2 ? tanques.GC : tanques.DS10]);
  }
}

// Formas de pagamento e caixa (série 1 normal, 105 em contingência, como o posto usa hoje)
const formas = [
  ["Dinheiro", "dinheiro", "01", true],
  ["PIX", "pix", "17", false],
  ["Cartão de débito", "debito", "04", false],
  ["Cartão de crédito", "credito", "03", false],
];
for (const [nome, tipo, codigo, gaveta] of formas) {
  await db.query(`insert into formas_pagamento (empresa_id, nome, tipo, codigo_sefaz, conta_no_caixa) values ($1,$2,$3,$4,$5)`,
    [empresa.id, nome, tipo, codigo, gaveta]);
}
await db.query(`insert into caixas (empresa_id, numero, nome, serie_nfce, serie_contingencia) values ($1, 1, 'Caixa 1', 1, 105)`, [empresa.id]);
await db.query(`insert into nfce_numeracao (empresa_id, serie) values ($1, 1), ($1, 105)`, [empresa.id]);

await db.end();
console.log("Banco recriado com dados de exemplo.");
console.log("PINs de exemplo: Gerente 1234, Maria 1111, João 2222.");
