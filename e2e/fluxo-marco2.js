// Testa os cadastros do Marco 2 no navegador, inclusive o que o sistema deve recusar.
// Uso: app em http://localhost:3000, banco recém-recriado (npm run db:reset), depois:
//   node e2e/fluxo-marco2.js
const { chromium } = require("playwright");
const { manual: manualEnc } = require("./ajuda");
const BASE = "http://localhost:3000";
const OUT = process.env.PRINTS || "../replica/clone-screens/";

let falhas = 0;
const ok = (t) => console.log("  ✔", t);
const falha = (t) => { falhas++; console.log("  ✘", t); };

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const erros = [];
  p.on("pageerror", (e) => erros.push(String(e)));
  p.on("console", (m) => m.type() === "error" && erros.push(m.text()));

  const entrar = async (apelido, pin) => {
    await p.goto(BASE + "/login");
    await p.selectOption("#usuarioId", { label: apelido });
    await p.fill("#pin", pin);
    await p.click("button[type=submit]");
    await p.getByText(`Olá, ${apelido}`).waitFor();
  };
  const sair = async () => { await p.getByRole("button", { name: "Sair" }).click(); await p.waitForURL("**/login", { waitUntil: "commit" }); };
  const enviar = async (rotulo = /Salvar|Cadastrar|Criar|Aplicar|Trocar/) => p.getByRole("button", { name: rotulo }).last().click();
  const espera = async (texto, desc) => {
    try { await p.getByText(texto).first().waitFor({ timeout: 8000 }); ok(desc); }
    catch { falha(`${desc} (não apareceu: ${texto})`); }
  };

  console.log("Mercadorias e preços");
  await entrar("Gerente", "1234");
  await p.goto(BASE + "/cadastros/mercadorias");
  (await p.locator("tbody tr", { hasText: "Combustível" }).count()) === 2 ? ok("lista os 2 combustíveis do posto") : falha("lista de combustíveis");
  await p.screenshot({ path: OUT + "M2-mercadorias.png", fullPage: true });

  await p.goto(BASE + "/cadastros/mercadorias/nova");
  await p.fill("#c-codigo", "GP");
  await p.fill("#c-nome", "Gasolina premium");
  await enviar();
  await espera("Preencha: Código ANP.", "recusa combustível sem código ANP");
  (await p.inputValue("#c-nome")) === "Gasolina premium" ? ok("manteve o que foi digitado após o erro") : falha("apagou o formulário após erro");
  await p.fill("#c-codigo", "GC");
  await p.fill("#c-codigo_anp", "320103001");
  await enviar();
  await espera("Já existe uma mercadoria com esse código.", "recusa código repetido");

  await p.fill("#c-codigo", "OL40");
  await p.fill("#c-nome", "Óleo 15W40 1 L");
  await p.selectOption("#c-tipo", "produto");
  await p.fill("#c-codigo_anp", "");
  await p.selectOption("#c-unidade_id", { label: "UN · Unidade" });
  await p.fill("#c-codigo_barras", "7891234567901");
  await enviar();
  await espera("Cadastro salvo.", "cadastra produto da loja");
  await espera("Sem preço.", "produto novo aparece sem preço");

  // Preço da gasolina comum
  await p.goto(BASE + "/cadastros/mercadorias?busca=Gasolina comum");
  await p.getByRole("link", { name: "Gasolina comum" }).click();
  await p.getByRole("heading", { name: "Gasolina comum" }).waitFor();
  await p.fill("#c-preco", "6,199");
  await enviar("Aplicar preço");
  await espera("Preço alterado.", "altera o preço agora");
  await p.reload();
  (await p.locator("text=R$ 6,199").count()) > 0 ? ok("preço novo vale agora") : falha("preço novo não aparece");
  (await p.getByText("Substituído").count()) === 1 ? ok("preço antigo fica no histórico como substituído") : falha("histórico");

  // Agendar e cancelar
  const amanha = new Date(Date.now() + 86400000 - 3 * 3600000).toISOString().slice(0, 10) + "T06:00";
  await p.fill("#c-preco", "6,299");
  await p.check("input[name=quando][value=agendar]");
  await p.fill("#c-a_partir_de", amanha);
  await enviar("Aplicar preço");
  await espera("Preço agendado.", "agenda preço para amanhã");
  await p.reload();
  await espera("Agendado", "agendamento aparece no histórico");
  await p.getByRole("button", { name: "Cancelar" }).click();
  try { await p.getByText("Agendado", { exact: true }).waitFor({ state: "detached", timeout: 8000 }); ok("cancela o agendamento (some do histórico)"); }
  catch { falha("cancela o agendamento"); }
  await p.screenshot({ path: OUT + "M2-mercadoria-precos.png", fullPage: true });

  // Data no passado
  await p.fill("#c-preco", "6,299");
  await p.check("input[name=quando][value=agendar]");
  await p.fill("#c-a_partir_de", "2020-01-01T06:00");
  await enviar("Aplicar preço");
  await espera("A data de início não pode estar no passado.", "recusa agendamento no passado");

  console.log("Grupos");
  await p.goto(BASE + "/cadastros/grupos");
  await p.locator("#c-nome").first().fill("Lubrificantes");
  await enviar("Criar grupo");
  await espera("Grupo salvo.", "cria grupo");
  await p.reload();
  await p.locator("#c-nome").first().fill("Óleo de motor");
  await p.locator("#c-pai_id").selectOption({ label: "Lubrificantes" });
  await enviar("Criar grupo");
  await espera("Grupo salvo.", "cria sub-grupo");
  await p.reload();
  (await p.getByText("› Óleo de motor").count()) === 1 ? ok("sub-grupo aparece dentro do grupo") : falha("sub-grupo");

  console.log("Bombas, bicos e tanques");
  await p.goto(BASE + "/cadastros/bicos/bomba/novo");
  await enviar();
  await espera("Cadastro salvo.", "cria bomba 5");
  await p.goto(BASE + "/cadastros/bicos/tanque/novo");
  await p.selectOption("#c-mercadoria_id", { label: "Diesel B S10" });
  await p.fill("#c-capacidade", "30.000");
  await enviar();
  await espera("Cadastro salvo.", "cria tanque 6 de diesel");
  await p.goto(BASE + "/cadastros/bicos/bico/novo");
  (await p.inputValue("#c-numero")) === "17" ? ok("sugere o próximo número de bico (17)") : falha("número sugerido");
  await p.selectOption("#c-bomba_id", { label: "Bomba 5" });
  await p.selectOption("#c-tanque_id", { label: "Tanque 6 · Diesel B S10" });
  await enviar();
  await espera("Cadastro salvo.", "cria bico 17 na bomba 5");
  await p.screenshot({ path: OUT + "M2-bicos.png", fullPage: true });
  await p.getByRole("link", { name: "Bomba 5" }).click();
  await p.uncheck("#c-ativo");
  await enviar();
  await espera("Há bicos ativos nesta bomba.", "recusa desativar bomba com bico ativo");
  await p.goto(BASE + "/cadastros/bicos/bico/novo");
  await p.fill("#c-numero", "1");
  await p.selectOption("#c-bomba_id", { label: "Bomba 5" });
  await p.selectOption("#c-tanque_id", { label: "Tanque 6 · Diesel B S10" });
  await enviar();
  await espera("Já existe um bico com esse número.", "recusa número de bico repetido");

  console.log("Pagamentos e caixas");
  await p.goto(BASE + "/cadastros/pagamentos/administradora/novo");
  await p.fill("#c-nome", "Adquirente Exemplo");
  await p.fill("#c-taxa_debito", "1,49");
  await p.fill("#c-taxa_credito", "3,19");
  await p.fill("#c-dias_repasse_credito", "30");
  await enviar();
  await espera("Cadastro salvo.", "cria administradora");
  await espera("3,19%", "mostra a taxa com vírgula");
  await p.goto(BASE + "/cadastros/pagamentos/forma/novo");
  await p.fill("#c-nome", "Crédito Exemplo");
  await p.selectOption("#c-tipo", "credito");
  await p.selectOption("#c-administradora_id", { label: "Adquirente Exemplo" });
  await enviar();
  await espera("Cadastro salvo.", "cria forma de crédito ligada à administradora");
  await p.getByRole("link", { name: "Dinheiro" }).click();
  await p.uncheck("#c-ativo");
  await enviar();
  await espera("pelo menos uma forma Dinheiro ativa", "recusa desativar o único dinheiro");

  await p.goto(BASE + "/cadastros/caixas/novo");
  await enviar();
  await espera("Cadastro salvo.", "cria Caixa 2 com série 2");
  await p.goto(BASE + "/cadastros/caixas/novo");
  await p.fill("#c-serie", "1");
  await enviar();
  await espera("Outro caixa já usa uma dessas séries de NFC-e.", "recusa série de NFC-e repetida");

  console.log("Usuários, perfis, empresa");
  await p.goto(BASE + "/cadastros/usuarios/usuario/novo");
  await p.fill("#c-apelido", "Pedro");
  await p.fill("#c-nome", "Pedro Operador");
  await p.selectOption("#c-perfil_id", { label: "Caixa" });
  await p.fill("#c-pin", "1111");
  await enviar();
  await espera("Escolha um PIN menos óbvio", "recusa PIN com números iguais");
  await p.fill("#c-pin", "4321");
  await enviar();
  await espera("Cadastro salvo.", "cria usuário Pedro");
  await p.goto(BASE + "/cadastros/usuarios/usuario/novo");
  await p.fill("#c-apelido", "maria");
  await p.fill("#c-nome", "Outra Maria");
  await p.selectOption("#c-perfil_id", { label: "Caixa" });
  await p.fill("#c-pin", "5678");
  await enviar();
  await espera("Já existe um usuário ativo com esse nome", "recusa nome de entrada repetido (maiúscula/minúscula)");
  await p.goto(BASE + "/cadastros/usuarios");
  await p.getByRole("link", { name: "Gerente" }).last().click();
  await p.uncheck("#c-perm\\:cadastro\\.editar");
  await enviar();
  await espera("Pelo menos um usuário ativo, com PIN, precisa continuar podendo editar cadastros.", "impede trancar o sistema (último administrador)");
  await p.screenshot({ path: OUT + "M2-perfil.png", fullPage: true });

  await p.goto(BASE + "/cadastros/empresa");
  await p.fill("#c-cnpj", "11.111.111/1111-11");
  await enviar();
  await espera("CNPJ inválido.", "recusa CNPJ inválido");
  await p.fill("#c-cnpj", "11.222.333/0001-81");
  await p.fill("#c-municipio_ibge", "3550308");
  await enviar();
  await espera("Dados da empresa salvos.", "salva dados da empresa");

  console.log("Meu PIN");
  await sair();
  await entrar("Pedro", "4321");
  (await p.getByRole("link", { name: "Mercadorias e preços" }).count()) === 0 ? ok("perfil Caixa não vê os cadastros") : falha("perfil Caixa vê cadastros");
  await p.goto(BASE + "/cadastros/mercadorias");
  await espera("Sem permissão", "perfil Caixa é barrado ao abrir cadastro pelo endereço");
  await p.goto(BASE + "/conta");
  await p.fill("#c-atual", "0000");
  await p.fill("#c-novo", "8642");
  await p.fill("#c-confirmar", "8642");
  await enviar();
  await espera("O PIN atual está errado.", "recusa troca com PIN atual errado");
  await p.fill("#c-atual", "4321");
  await enviar();
  await espera("PIN trocado.", "troca o próprio PIN");
  await sair();
  await entrar("Pedro", "8642");
  ok("entra com o PIN novo");

  console.log("Efeito no caixa");
  await p.goto(BASE + "/caixa/abrir");
  (await p.locator("#caixaId option", { hasText: "Caixa 2" }).count()) === 1 ? ok("Caixa 2 aparece na abertura") : falha("Caixa 2 na abertura");
  (await p.locator("input[name^='inicial:']").count()) === 17 ? ok("abertura pede os 17 bicos (bico novo incluído)") : falha("bico novo na abertura");
  for (const i of await p.locator("input[name^='inicial:']").all()) if (!(await i.inputValue())) await i.fill("1000,000");
  await p.selectOption("#caixaId", { label: "Caixa 2" });
  await p.click("button[type=submit]");
  await p.getByText("Abastecimentos para registrar").waitFor();
  await manualEnc(p, 1, "10,000");
  await espera("R$ 61,99", "bico manual já usa o preço novo: 10 L a R$ 6,199 = R$ 61,99");

  // Com turno aberto, não pode mudar bico
  await sair();
  await entrar("Gerente", "1234");
  await p.goto(BASE + "/cadastros/bicos");
  await p.getByRole("link", { name: "Bico 17" }).click();
  await p.uncheck("#c-ativo");
  await enviar();
  await espera("Há turno aberto.", "recusa desativar bico com turno aberto");

  console.log("Celular (390 px)");
  const m = await b.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
  const mp = await m.newPage();
  for (const url of ["/cadastros/mercadorias", "/cadastros/bicos", "/cadastros/pagamentos", "/cadastros/usuarios", "/cadastros/empresa", "/cadastros/grupos"]) {
    await mp.goto(BASE + url);
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    w <= 390 ? ok(`${url} cabe em 390 px`) : falha(`${url} tem ${w}px`);
  }
  await mp.goto(BASE + "/cadastros/mercadorias");
  await mp.screenshot({ path: OUT + "M2-mercadorias-390.png", fullPage: true });

  erros.length ? falha("erros no console:\n" + erros.join("\n")) : ok("console sem erros");
  console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTUDO OK");
  await b.close();
  process.exit(falhas ? 1 : 0);
})().catch((e) => { console.error("PAROU:", e.message); process.exit(1); });
