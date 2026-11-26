// Testa o encerrante no lançamento manual, a tributação e a série de contingência.
// Uso: app em http://localhost:3000, banco recém-recriado (npm run db:reset):
//   NODE_PATH=$(npm root -g) node e2e/fluxo-encerrante-tributacao.js
const { chromium } = require("playwright");
const { manual } = require("./ajuda");
const BASE = "http://localhost:3000";
const OUT = process.env.PRINTS || "../replica/clone-screens/";

let falhas = 0;
const ok = (t) => console.log("  ✔", t);
const falha = (t) => { falhas++; console.log("  ✘", t); };
const checa = (c, t) => (c ? ok(t) : falha(t));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  const espera = async (texto, desc, timeout = 10000) => {
    try { await p.getByText(texto).first().waitFor({ timeout }); ok(desc); } catch { falha(`${desc} (não apareceu: ${texto})`); }
  };

  await p.goto(BASE + "/login");
  await p.selectOption("#usuarioId", { label: "Gerente" });
  await p.fill("#pin", "1234");
  await p.click("button[type=submit]");
  await p.getByText("Olá, Gerente").waitFor();

  console.log("Tributação");
  await p.goto(BASE + "/cadastros/tributacao");
  await espera("3 tributação(ões) marcadas para revisão", "avisa as 3 tributações com divergência");
  checa((await p.getByRole("link", { name: "Gasolina C (monofásico)" }).count()) === 1, "gasolina com a tributação das notas");
  await p.screenshot({ path: OUT + "T-tributacao.png", fullPage: true });
  await p.goto(BASE + "/cadastros/tributacao/nova");
  await p.fill("#c-nome", "Teste sem ad rem");
  await p.fill("#c-ad_rem", "");
  await p.getByRole("button", { name: "Cadastrar" }).click();
  await espera("CST 61 (monofásico) precisa do valor ad rem", "recusa CST 61 sem o valor por litro");
  await p.fill("#c-ad_rem", "1,57");
  await p.fill("#c-cfop_interno", "6656");
  await p.getByRole("button", { name: "Cadastrar" }).click();
  await espera("CFOP de venda dentro do estado começa com 5.", "recusa CFOP interno começando com 6");
  await p.fill("#c-cfop_interno", "5656");
  await p.getByRole("button", { name: "Cadastrar" }).click();
  await espera("Tributação salva.", "cadastra tributação nova");
  await p.goto(BASE + "/cadastros/mercadorias");
  checa((await p.getByText("revisar").count()) >= 3, "lista de mercadorias marca as que estão para revisar");

  console.log("Empresa e caixa");
  await p.goto(BASE + "/cadastros/empresa");
  await p.selectOption("#c-crt", "1");
  await p.getByRole("button", { name: "Salvar" }).click();
  await espera("O CRT não combina com o regime", "recusa CRT de Simples com lucro presumido");
  await p.goto(BASE + "/cadastros/caixas/novo");
  checa((await p.inputValue("#c-serie_contingencia")) === "106", "caixa novo sugere a próxima série de contingência (106)");
  await p.fill("#c-serie", "105");
  await p.getByRole("button", { name: "Cadastrar" }).click();
  await espera("Outro caixa já usa uma dessas séries", "recusa série normal igual à contingência de outro caixa");

  console.log("Encerrante no lançamento manual");
  await p.goto(BASE + "/caixa/abrir");
  for (const i of await p.locator("input[name^='inicial:']").all()) await i.fill("5.000,000");
  await p.click("button[type=submit]");
  await p.getByText(/Abastecimentos para registrar/).waitFor();
  await p.keyboard.press("F7");
  await p.getByRole("radio", { name: /^Bico 8,/ }).check({ force: true });
  await espera("5.000,000", "mostra o encerrante da abertura como anterior");
  await p.fill("#encerrante-final", "5.017,462");
  await espera("17,462", "calcula os litros na hora");
  await espera("R$ 150,00", "calcula o valor (17,462 L × R$ 8,59 = R$ 150,00, como na nota do posto)");
  await p.screenshot({ path: OUT + "T-bico-manual.png", fullPage: true });
  await p.fill("#encerrante-final", "4.999,000");
  checa(await p.locator("dialog[open] button[type=submit]").isDisabled(), "encerrante menor que o anterior não deixa lançar");
  await p.fill("#encerrante-final", "5.017,462");
  await p.locator("dialog[open] button[type=submit]").click();
  await p.waitForFunction(() => !document.querySelector("dialog[open]"));
  await espera("Abastecimentos para registrar (1)", "lança pelo encerrante");
  const seg = await manual(p, 8, "11,641");
  checa(seg.anterior === 5017462, "segundo lançamento no mesmo bico parte do final do primeiro");

  // Sem internet: dois lançamentos seguidos no mesmo bico usam o encerrante guardado no computador.
  await p.reload();
  await p.getByText(/Abastecimentos para registrar/).waitFor();
  await p.waitForTimeout(1000);
  await ctx.setOffline(true);
  const off1 = await manual(p, 13, "48,643");
  const off2 = await manual(p, 13, "21,472");
  checa(off1.anterior === 5000000 && off2.anterior === off1.final, "sem internet, o segundo lançamento parte do primeiro (fila)");
  await espera("R$ 403,25", "diesel 48,643 L × R$ 8,29 = R$ 403,25 calculado sem internet");
  await ctx.setOffline(false);
  try {
    await p.waitForFunction(() => !/na fila/.test(document.body.innerText), null, { timeout: 25000 });
    ok("os dois sobem quando a internet volta");
  } catch { falha("fila não esvaziou"); }
  const est = await p.evaluate(async () => (await fetch("/api/caixa/estado")).json());
  const b13 = est.pendentes.filter((x) => x.bico === 13).map((x) => x.total_centavos).sort((a, c) => a - c);
  checa(JSON.stringify(b13) === JSON.stringify([17800, 40325]), `servidor calculou os mesmos valores (${b13.join(", ")})`);
  const ult = est.catalogo.bicos.find((x) => x.numero === 13).ultimo_encerrante;
  checa(Number(ult) === 5070.115, `último encerrante do bico 13 no servidor = 5.070,115 (${ult})`);

  // Recusa no servidor: encerrante menor que o último (outro caixa lançou antes).
  const r = await p.evaluate(async ({ turno, bico }) => {
    const op = { tipo: "manual", id: crypto.randomUUID(), turnoId: turno, bicoId: bico, encerranteFinal: "5060.000", fim: new Date().toISOString() };
    return (await (await fetch("/api/caixa/operacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operacoes: [op] }) })).json()).resultados[0];
  }, { turno: est.turno.id, bico: est.catalogo.bicos.find((x) => x.numero === 13).id });
  checa(!r.ok && /menor que o último registrado/.test(r.erro), "servidor recusa encerrante menor que o último");

  // Virada do totalizador
  await p.keyboard.press("F7");
  await p.getByRole("radio", { name: /^Bico 16,/ }).check({ force: true });
  await p.fill("#encerrante-final", "3,000");
  checa(await p.locator("dialog[open] button[type=submit]").isDisabled(), "final menor sem marcar 'zerou' fica bloqueado");
  await p.getByLabel(/O totalizador zerou/).check();
  await espera("995.003,000", "virada: 5.000 → 999.999,999 → 3 = 995.003,000 L calculado");
  checa(!(await p.locator("dialog[open] button[type=submit]").isDisabled()), "com 'zerou' marcado o botão libera (o servidor barra acima de 3.000 L)");
  await p.locator("dialog[open]").getByRole("button", { name: /Fechar/ }).click();

  console.log("Fechamento mostra o último encerrante lançado");
  await p.goto(BASE + "/caixa/fechar");
  await espera("último lançado: 5.029,103", "bico 8 mostra o último encerrante lançado");
  await espera("último lançado: 5.070,115", "bico 13 mostra o último encerrante lançado");

  const reais = erros.filter((e) => !/Failed to fetch|NetworkError|net::ERR/.test(e));
  checa(!reais.length, "sem erros de JavaScript" + (reais.length ? ":\n" + reais.join("\n") : ""));
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTUDO OK");
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("PAROU:", e.message.split("\n")[0]); process.exit(1); });
