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
const empresa = await um(
  `insert into empresas (razao_social, nome_fantasia, cnpj, uf, regime_tributario)
   values ('Posto Exemplo Ltda', 'Posto Exemplo', '00000000000191', 'SP', 'simples') returning id`);
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

// Mercadorias (combustíveis)
const litro = await um(`insert into unidades (sigla, descricao) values ('L','Litro') returning id`);
await db.query(`insert into unidades (sigla, descricao) values ('UN','Unidade')`);
const grupo = await um(`insert into grupos (empresa_id, nome) values ($1, 'Combustíveis') returning id`, [empresa.id]);
const aVista = await um(`insert into tipos_preco (empresa_id, nome, padrao) values ($1, 'À vista', true) returning id`, [empresa.id]);
const combustiveis = [
  ["GC", "Gasolina comum", "320102001", "5.899"],
  ["GA", "Gasolina aditivada", "320102002", "6.099"],
  ["ET", "Etanol hidratado", "810101001", "3.999"],
  ["DS10", "Diesel S10", "820101034", "6.149"],
];
const merc = {};
for (const [codigo, nome, anp, preco] of combustiveis) {
  const m = await um(
    `insert into mercadorias (empresa_id, codigo, nome, grupo_id, unidade_id, tipo, codigo_anp, ncm)
     values ($1,$2,$3,$4,$5,'combustivel',$6,'27101259') returning id`,
    [empresa.id, codigo, nome, grupo.id, litro.id, anp]);
  await db.query(`insert into precos (empresa_id, mercadoria_id, tipo_preco_id, preco) values ($1,$2,$3,$4)`,
    [empresa.id, m.id, aVista.id, preco]);
  merc[codigo] = m.id;
}

// Tanques, 4 bombas, 16 bicos (bomba 1: bicos 1-4 ... bomba 4: bicos 13-16, como no posto)
const tanques = {};
let nTanque = 1;
for (const codigo of Object.keys(merc)) {
  tanques[codigo] = (await um(
    `insert into tanques (empresa_id, numero, mercadoria_id, capacidade_litros) values ($1,$2,$3,15000) returning id`,
    [empresa.id, nTanque++, merc[codigo]])).id;
}
const ordem = ["GC", "GA", "ET", "DS10"]; // combustível de cada bico dentro da bomba (exemplo)
for (let b = 1; b <= 4; b++) {
  const bomba = await um(`insert into bombas (empresa_id, numero) values ($1,$2) returning id`, [empresa.id, b]);
  for (let i = 0; i < 4; i++) {
    const numero = (b - 1) * 4 + i + 1;
    await db.query(`insert into bicos (empresa_id, bomba_id, numero, tanque_id) values ($1,$2,$3,$4)`,
      [empresa.id, bomba.id, numero, tanques[ordem[i]]]);
  }
}

// Formas de pagamento e caixa
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
await db.query(`insert into caixas (empresa_id, numero, nome, serie_nfce) values ($1, 1, 'Caixa 1', 1)`, [empresa.id]);
await db.query(`insert into nfce_numeracao (empresa_id, serie) values ($1, 1)`, [empresa.id]);

await db.end();
console.log("Banco recriado com dados de exemplo.");
console.log("PINs de exemplo: Gerente 1234, Maria 1111, João 2222.");
