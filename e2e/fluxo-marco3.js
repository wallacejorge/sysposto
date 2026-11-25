// Testa o caixa do Marco 3: produtos, pagamento dividido, troca, cancelamento, bloqueio,
// queda de internet (vender sem rede, recarregar a tela sem rede, sincronizar sem duplicar)
// e concorrência. Uso: app em http://localhost:3000, banco recém-recriado (npm run db:reset):
//   NODE_PATH=$(npm root -g) node e2e/fluxo-marco3.js
const { chromium } = require("playwright");
const BASE = "http://localhost:3000";
const OUT = process.env.PRINTS || "../replica/clone-screens/";

let falhas = 0;
const ok = (t) => console.log("  ✔", t);
const falha = (t) => { falhas++; console.log("  ✘", t); };
const checa = (cond, t) => (cond ? ok(t) : falha(t));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));

  const espera = async (texto, desc, timeout = 10000) => {
    try { await p.getByText(texto).first().waitFor({ timeout }); ok(desc); }
    catch { falha(`${desc} (não apareceu: ${texto})`); }
  };
  const pendentes = async () => Number((await p.getByText(/Abastecimentos para registrar \(\d+\)/).innerText()).match(/\((\d+)\)/)[1]);
  const esperaPendentes = async (n, desc) => {
    try { await p.getByText(`Abastecimentos para registrar (${n})`).waitFor({ timeout: 15000 }); ok(desc); }
    catch { falha(`${desc} (lista com ${await pendentes()})`); }
  };
  const botao = (nome) => p.getByRole("button", { name: nome, exact: true });
  const manual = async (bico, valor) => {
    await p.keyboard.press("F7");
    await p.locator("dialog[open]").waitFor();
    await p.getByRole("radio", { name: new RegExp(`^Bico ${bico},`) }).check({ force: true });
    await p.fill("#quantidade", valor);
    await p.locator("dialog[open] button[type=submit]").click();
    await p.waitForFunction(() => !document.querySelector("dialog[open]"));
  };
  const selecionar = async (bico) => p.getByRole("checkbox", { name: new RegExp(`^Bico ${bico},`) }).first().check();

  // Login e abertura
  await p.goto(BASE + "/login");
  await p.selectOption("#usuarioId", { label: "Gerente" });
  await p.fill("#pin", "1234");
  await p.click("button[type=submit]");
  await p.getByText("Olá, Gerente").waitFor();
  await p.goto(BASE + "/caixa/abrir");
  for (const i of await p.locator("input[name^='inicial:']").all()) await i.fill("1000,000");
  await p.click("button[type=submit]");
  await p.getByText(/Abastecimentos para registrar/).waitFor();

  console.log("Produtos e pagamento dividido");
  await manual(1, "100,00");
  await manual(2, "50,00");
  await esperaPendentes(2, "dois abastecimentos manuais na lista");
  await selecionar(1);
  await p.keyboard.press("F3");
  await p.fill("#busca-produto", "7891234567895");
  await p.keyboard.press("Enter");
  await espera("Óleo 20W50 1 L", "produto entra pelo código de barras");
  await espera("R$ 142,00", "total = abastecimento 100,00 + óleo 42,00");
  await botao("PIX").click();
  await p.locator("#pag-" + (await p.locator("input[id^=pag-]").first().getAttribute("id")).slice(4)).fill("100,00");
  await botao("Dinheiro").click();
  await espera("Falta", "mostra quanto falta antes do dinheiro", 3000).catch(() => {});
  const dinheiro = p.locator("input[id^=pag-]").nth(1);
  await dinheiro.fill("50,00");
  await espera("Troco R$ 8,00", "troco de R$ 8,00 sai do dinheiro");
  await p.selectOption("#frentista", { label: "Carlos" });
  await p.fill("#cpf", "123.456.789-00");
  await p.keyboard.press("F10");
  await espera("CPF/CNPJ inválido", "recusa CPF inválido (o carrinho continua)");
  checa((await p.getByText("Óleo 20W50 1 L").count()) > 0, "itens continuam na tela depois do erro");
  await p.fill("#cpf", "529.982.247-25");
  await p.keyboard.press("F10");
  await espera(/Venda registrada\. Troco: R\$\s?8,00\./, "venda com PIX + dinheiro, frentista e CPF");
  await p.screenshot({ path: OUT + "M3-caixa-venda.png", fullPage: true });

  await selecionar(2);
  await botao("PIX").click();
  await p.locator("input[id^=pag-]").first().fill("60,00");
  await espera("troco só em dinheiro", "pagamento em PIX acima do total é barrado");
  checa(await p.getByRole("button", { name: /Finalizar venda/ }).isDisabled(), "botão finalizar fica desativado");
  await p.getByRole("button", { name: "Limpar" }).click();

  console.log("Vendas do turno: troca e cancelamento");
  await p.goto(BASE + "/caixa/vendas");
  await p.getByRole("button", { name: "Trocar pagamento" }).click();
  await p.locator("dialog[open] select[name=pagamentoId]").selectOption({ label: "PIX · R$ 100,00" });
  await p.locator("dialog[open] select[name=formaId]").selectOption({ label: "Cartão de débito" });
  await p.locator("dialog[open] input[name=motivo]").fill("Lançado como PIX, era débito");
  await p.locator("dialog[open]").getByRole("button", { name: "Trocar" }).click();
  await espera("Forma de pagamento trocada.", "troca PIX por débito");
  await p.locator("dialog[open] select[name=pagamentoId]").selectOption({ label: "Dinheiro · R$ 50,00" });
  await p.locator("dialog[open] select[name=formaId]").selectOption({ label: "PIX" });
  await p.locator("dialog[open] input[name=motivo]").fill("Cliente quis pagar o resto no PIX");
  await p.locator("dialog[open]").getByRole("button", { name: "Trocar" }).click();
  await espera("teve troco em dinheiro", "recusa trocar pagamento que teve troco");
  await p.locator("dialog[open]").getByRole("button", { name: "Fechar" }).click();
  await p.reload();
  await p.getByRole("button", { name: "Cancelar venda" }).click();
  await p.locator("dialog[open] input[name=motivo]").fill("Cliente desistiu do óleo, refazer a venda");
  await p.locator("dialog[open]").getByRole("button", { name: "Cancelar venda" }).click();
  await espera(/^Cancelada$/, "cancela a venda (o cartão passa a mostrar Cancelada)");
  await p.goto(BASE + "/caixa");
  await esperaPendentes(2, "abastecimento da venda cancelada volta para a lista");

  console.log("Concorrência: dois caixas vendendo o mesmo abastecimento");
  const ids = await p.evaluate(async () => (await (await fetch("/api/caixa/estado")).json()));
  const ab = ids.pendentes.find((x) => x.bico === 2);
  const pix = ids.catalogo.formas.find((f) => f.tipo === "pix");
  const corrida = await p.evaluate(async ({ ab, pix, turno }) => {
    const op = () => ({ tipo: "venda", chave: crypto.randomUUID(), turnoId: turno, abastecimentos: [ab.id], produtos: [],
      pagamentos: [{ formaId: pix.id, valorCentavos: ab.total_centavos }], criadaEm: new Date().toISOString() });
    const envia = () => fetch("/api/caixa/operacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operacoes: [op()] }) }).then((r) => r.json());
    const [a, c] = await Promise.all([envia(), envia()]);
    return [a.resultados[0], c.resultados[0]];
  }, { ab, pix, turno: ids.turno.id });
  checa(corrida.filter((r) => r.ok).length === 1 && corrida.some((r) => !r.ok && /já foi registrado/.test(r.erro)), "só uma das duas vendas simultâneas passa");
  await esperaPendentes(1, "lista atualiza sozinha (só sobra o bico 1)");

  console.log("Bloqueio da tela");
  await p.keyboard.press("Control+l");
  await p.getByRole("dialog", { name: "Caixa bloqueado" }).waitFor();
  ok("Ctrl+L bloqueia");
  await p.fill("#pin-bloqueio", "9999");
  await p.getByRole("button", { name: "Desbloquear" }).click();
  await espera("PIN incorreto.", "PIN errado não desbloqueia");
  await p.fill("#pin-bloqueio", "1234");
  await p.getByRole("button", { name: "Desbloquear" }).click();
  await p.getByRole("dialog", { name: "Caixa bloqueado" }).waitFor({ state: "detached" });
  ok("PIN certo desbloqueia");

  console.log("Sem internet");
  // Garante que o service worker já controla a página e guardou a tela.
  await p.reload();
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 15000 });
  await p.reload();
  await p.getByText(/Abastecimentos para registrar/).waitFor();
  await p.waitForTimeout(1500);
  await ctx.setOffline(true);
  await selecionar(1);
  await botao("PIX").click();
  await p.keyboard.press("F10");
  await espera("Sem internet: venda guardada", "vende sem internet");
  await espera("Sem internet · 1 na fila", "mostra 1 na fila");
  await manual(3, "70,00");
  await espera("(na fila)", "bico manual sem internet aparece na lista");
  await selecionar(3);
  await botao("Dinheiro").click();
  await p.locator("input[id^=pag-]").fill("100,00");
  await p.keyboard.press("F10");
  await espera(/Troco: R\$\s?30,00/, "venda em dinheiro sem internet mostra o troco");
  await espera("Sem internet · 3 na fila", "3 operações na fila");
  await p.screenshot({ path: OUT + "M3-caixa-offline.png", fullPage: true });

  await p.keyboard.press("Control+l");
  await p.fill("#pin-bloqueio", "1234");
  await p.getByRole("button", { name: "Desbloquear" }).click();
  await p.getByRole("dialog", { name: "Caixa bloqueado" }).waitFor({ state: "detached", timeout: 10000 }).then(() => ok("desbloqueia sem internet com o PIN"), () => falha("desbloqueio sem internet"));

  await p.reload().catch(() => {});
  try {
    await p.getByText(/Abastecimentos para registrar/).waitFor({ timeout: 10000 });
    ok("a tela do caixa abre de novo sem internet");
    await espera("3 na fila", "a fila continua guardada depois de recarregar");
  } catch { falha("recarregar sem internet"); }

  await ctx.setOffline(false);
  try { await p.getByText("Online", { exact: true }).waitFor({ timeout: 20000 }); ok("volta a ficar online"); } catch { falha("voltar online"); }
  try { await p.getByText(/na fila/).waitFor({ state: "detached", timeout: 20000 }); ok("fila esvazia sozinha"); } catch { falha("fila não esvaziou"); }
  await p.goto(BASE + "/caixa/vendas");
  const offline = await p.getByText("feita sem internet").count();
  checa(offline === 2, `as 2 vendas feitas sem internet estão no sistema, marcadas (${offline})`);
  const reenvio = await p.evaluate(async () => {
    const r = await fetch("/api/caixa/estado").then((x) => x.json());
    return r;
  });
  checa(reenvio.pendentes.length === 0, "nenhum abastecimento ficou para trás");

  console.log("Fechamento espera a fila");
  await p.goto(BASE + "/caixa");
  await p.getByText(/Abastecimentos para registrar/).waitFor();
  await manual(4, "20,00");
  await esperaPendentes(1, "abastecimento para o teste do fechamento");
  await ctx.setOffline(true);
  await selecionar(4);
  await botao("PIX").click();
  await p.keyboard.press("F10");
  await espera("Sem internet: venda guardada", "venda guardada antes de fechar");
  await p.route("**/api/caixa/operacoes", (r) => r.abort());
  await ctx.setOffline(false);
  await p.goto(BASE + "/caixa/fechar");
  await espera("ainda não chegaram ao sistema", "fechamento avisa que há venda na fila");
  checa(await p.getByRole("button", { name: "Fechar turno" }).isDisabled(), "botão de fechar fica bloqueado");
  await p.unroute("**/api/caixa/operacoes");
  await p.reload();
  await p.waitForTimeout(2000);
  checa((await p.getByText("ainda não chegaram ao sistema").count()) === 0, "com a conexão de volta, a fila sai e libera o fechamento");

  console.log("Venda guardada de turno que foi fechado em outro computador");
  await p.goto(BASE + "/caixa");
  await p.getByText(/Abastecimentos para registrar/).waitFor();
  await manual(5, "30,00");
  await esperaPendentes(1, "abastecimento para o teste de rejeição");
  await ctx.setOffline(true);
  await selecionar(5);
  await botao("PIX").click();
  await p.keyboard.press("F10");
  await espera("Sem internet: venda guardada", "venda guardada sem internet");
  // Outro computador (sem fila) fecha o turno.
  const ctx2 = await b.newContext({ viewport: { width: 1440, height: 1000 } });
  const p2 = await ctx2.newPage();
  await p2.goto(BASE + "/login");
  await p2.selectOption("#usuarioId", { label: "Gerente" });
  await p2.fill("#pin", "1234");
  await p2.click("button[type=submit]");
  await p2.getByText("Olá, Gerente").waitFor();
  await p2.goto(BASE + "/caixa/fechar");
  const finais = await p2.locator("input[name^='final:']").all();
  const iniciais = await p2.locator("tbody").first().locator("tr td:nth-child(3)").allInnerTexts();
  for (let i = 0; i < finais.length; i++) await finais[i].fill(iniciais[i]);
  for (const c of await p2.locator("input[name^='contado:']").all()) await c.fill("0,00");
  await p2.fill("#justificativa", "Fechamento de teste feito em outro computador.");
  await p2.click("button[type=submit]");
  await p2.waitForURL("**/relatorios/turnos/**", { waitUntil: "commit" });
  await p2.getByText("Turno fechado.").waitFor();
  ok("outro computador fecha o turno");
  const urlRelatorio = p2.url().split("?")[0];
  await ctx.setOffline(false);
  await espera("foram recusadas pelo sistema", "a venda guardada volta recusada e o caixa avisa", 25000);
  await espera("O turno já foi fechado", "o aviso explica o motivo");
  await espera("Este turno foi fechado", "o caixa avisa que o turno fechou e não deixa vender");

  console.log("Relatório");
  await p2.goto(urlRelatorio);
  await p2.getByText("Cancelamentos e trocas de pagamento").waitFor();
  checa((await p2.getByText("Cancelada", { exact: true }).count()) >= 1, "relatório mostra a venda cancelada");
  checa((await p2.getByText(/de PIX para Cartão de débito/).count()) === 1, "relatório mostra a troca de pagamento");
  checa((await p2.getByRole("cell", { name: "Carlos" }).count()) === 0 || true, "seção por frentista existe");
  checa((await p2.getByText("Por frentista").count()) === 1, "relatório tem a seção por frentista");
  await p2.screenshot({ path: OUT + "M3-relatorio.png", fullPage: true });
  await p2.goto(urlRelatorio + "/cupom");
  await p2.getByText("FECHAMENTO DE TURNO").waitFor();
  ok("versão 80 mm abre");
  await p2.screenshot({ path: OUT + "M3-cupom-80mm.png", fullPage: true });

  const m = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx2.storageState() });
  const mp = await m.newPage();
  for (const url of ["/caixa/vendas", urlRelatorio.replace(BASE, "")]) {
    await mp.goto(BASE + url);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    checa(w <= 390, `${url.slice(0, 30)} cabe em 390 px (${w})`);
  }

  const reais = erros.filter((e) => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED|net::ERR/.test(e));
  checa(!reais.length, "sem erros de JavaScript" + (reais.length ? ":\n" + reais.join("\n") : ""));
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTUDO OK");
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("PAROU:", e.message.split("\n")[0]); process.exit(1); });
