// Percorre o fluxo do Marco 1 de ponta a ponta e salva prints.
// Uso: com o app rodando em http://localhost:3000 e o banco recém-recriado (npm run db:reset):
//   node e2e/fluxo-marco1.js
// Requer o Playwright instalado globalmente (substituído por testes @playwright/test no /replica-test).
const { chromium } = require("playwright");
const OUT = process.env.PRINTS || "../replica/clone-screens/";
const BASE = "http://localhost:3000";
const fs = require("fs");
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const erros = [];
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  p.on("pageerror", (e) => erros.push(String(e)));
  const shot = async (nome) => p.screenshot({ path: OUT + nome, fullPage: true });
  const passo = (t) => console.log("•", t);

  // S01 login: PIN errado, depois certo (Maria)
  await p.goto(BASE + "/");
  await p.waitForURL("**/login", { waitUntil: "commit" });
  await p.selectOption("#usuarioId", { label: "Maria" });
  await p.fill("#pin", "9999");
  await p.click("button[type=submit]");
  await p.getByText("PIN incorreto.").waitFor();
  await shot("S01-login-erro.png");
  passo("login com PIN errado mostra erro");
  await p.fill("#pin", "1111");
  await p.click("button[type=submit]");
  await p.waitForURL(BASE + "/", { waitUntil: "commit" });
  await shot("S02-painel-vazio.png");
  await p.getByText("Olá, Maria").waitFor();
  passo("login ok -> painel");

  // Caixa sem turno -> abrir
  await p.goto(BASE + "/caixa");
  await p.waitForURL("**/caixa/abrir", { waitUntil: "commit" });
  passo("caixa sem turno redireciona para abrir");
  const iniciais = await p.locator("input[name^='inicial:']").all();
  for (let i = 0; i < iniciais.length; i++) await iniciais[i].fill(String(100000 + i * 1000) + ",000");
  // Bico 16 perto do fim do totalizador, para testar a virada
  await iniciais[15].fill("999.990,000");
  await p.fill("#fundo", "100,00");
  await shot("S07-abrir-turno.png");
  await p.click("button[type=submit]");
  await p.waitForURL("**/caixa", { waitUntil: "commit" });
  await p.getByText("Abastecimentos para registrar").waitFor();
  passo("turno aberto -> caixa");
  await shot("S08-caixa-vazio.png");

  // Bico manual: bico 01 por valor R$ 200,00
  async function manual(bico, modo, qtd) {
    await p.keyboard.press("F7");
    await p.locator("dialog[open]").waitFor();
    await p.getByRole("radio", { name: new RegExp(`^Bico ${bico},`) }).check({ force: true });
    await p.getByLabel(modo === "valor" ? "Por valor (R$)" : "Por litros").check();
    await p.fill("#quantidade", qtd);
    await p.locator("dialog[open] button[type=submit]").click();
    await p.locator("dialog[open]").waitFor({ state: "detached" }).catch(() => {});
    await p.waitForFunction(() => !document.querySelector("dialog[open]"));
  }
  await manual(1, "valor", "200,00");
  await p.waitForSelector("text=Abastecimentos para registrar (1)");
  await manual(5, "litros", "20,341");
  await p.waitForSelector("text=Abastecimentos para registrar (2)");
  await manual(16, "valor", "61,49");
  await p.waitForSelector("text=Abastecimentos para registrar (3)");
  passo("3 abastecimentos manuais lançados");

  // Venda 1: bico 01 em dinheiro, recebido 250 -> troco 50
  await p.locator("tbody input[type=checkbox]").first().check();
  await p.getByText("Dinheiro", { exact: true }).click();
  await p.fill("#recebido", "250,00");
  await shot("S08-caixa-venda.png");
  await p.keyboard.press("F10");
  await p.getByText(/Venda registrada\. Troco: R\$\s?50,00\./).waitFor();
  await p.waitForSelector("text=Abastecimentos para registrar (2)");
  passo("venda em dinheiro com troco de R$ 50,00");

  // Venda 2: os dois restantes juntos em PIX
  for (const cb of await p.locator("tbody input[type=checkbox]").all()) await cb.check();
  await p.getByText("PIX", { exact: true }).click();
  await p.keyboard.press("F10");
  await p.getByText("Venda registrada.").waitFor();
  await p.waitForSelector("text=Abastecimentos para registrar (0)");
  passo("venda com 2 abastecimentos em PIX");

  // Sangria R$ 150
  await p.keyboard.press("F12");
  await p.selectOption("#tipo", "sangria");
  await p.fill("#valor-mov", "150,00");
  await p.fill("#motivo", "Cofre");
  await p.locator("dialog[open] button[type=submit]").click();
  await p.waitForFunction(() => !document.querySelector("dialog[open]"));
  passo("sangria de R$ 150,00");

  // Fechar: encerrantes = inicial + litros vendidos; dinheiro faltando R$ 30
  await p.goto(BASE + "/caixa/fechar");
  const finais = await p.locator("input[name^='final:']").all();
  for (let i = 0; i < finais.length; i++) {
    const ini = 100000 + i * 1000;
    let v = ini;
    if (i === 0) v = ini + 33.904; // 200 / 5,899
    if (i === 4) v = ini + 20.341;
    if (i === 15) v = 0.0; // virou: 999.990,000 -> 999.999,999 -> 0,000 = 10,000 L (61,49 / 6,149)
    await finais[i].fill(v.toFixed(3).replace(".", ","));
  }
  await p.locator("input[name^='virou:']").nth(15).check();
  const contados = await p.locator("input[name^='contado:']").all();
  // Dinheiro esperado: 100 fundo + 200 venda - 150 sangria = 150. Contado 120 -> -30.
  // PIX esperado: 120,00 (20,341 x 5,899 = 119,99 arredondado) + 61,49.
  const esperados = await p.locator("tbody").nth(1).locator("tr td:nth-child(3)").allInnerTexts();
  console.log("  esperados:", esperados.join(" | "));
  await contados[0].fill("120,00");
  for (let i = 1; i < contados.length; i++) await contados[i].fill(esperados[i].replace(/[^\d,]/g, ""));
  await p.click("button[type=submit]");
  await p.getByText("(obrigatória: há diferença acima de R$ 5,00)").waitFor();
  const faltando = await p.$eval("#justificativa", (t) => t.validity.valueMissing);
  if (!faltando) throw new Error("observação deveria ser obrigatória");
  passo("fechar sem justificativa com diferença de R$ 30 é bloqueado");
  await shot("S10-fechar-erro.png");
  await p.fill("#justificativa", "Faltou dinheiro na gaveta, conferir com a operadora.");
  await p.click("button[type=submit]");
  await p.waitForURL("**/relatorios/turnos/**", { waitUntil: "commit" });
  await p.getByText("Turno fechado.").waitFor();
  await shot("S11-relatorio-turno.png");
  passo("turno fechado -> relatório");
  const difs = await p.locator("table").nth(1).locator("tbody tr td:last-child").allInnerTexts();
  console.log("  diferença de litros por bico:", [...new Set(difs)].join(", "));

  const urlRelatorio = p.url().replace(BASE, "");
  // Painel com dados
  await p.goto(BASE + "/");
  await shot("S02-painel.png");

  // Celular
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, storageState: await ctx.storageState() });
  const mp = await m.newPage();
  for (const [url, nome] of [["/", "S02-painel-390.png"], ["/caixa/abrir", "S07-abrir-390.png"], [urlRelatorio, "S11-relatorio-390.png"], ["/caixa/fechar", "S10-fechar-390.png"]]) {
    await mp.goto(BASE + url);
    const larg = await mp.evaluate(() => document.documentElement.scrollWidth);
    console.log(`  390px ${url}: largura da página ${larg}px`);
    await mp.screenshot({ path: OUT + nome, fullPage: true });
  }
  await mp.goto(BASE + "/relatorios/turnos");
  await mp.screenshot({ path: OUT + "S11-lista-390.png", fullPage: true });

  console.log(erros.length ? "ERROS NO CONSOLE:\n" + erros.join("\n") : "console sem erros");
  await b.close();
})().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
