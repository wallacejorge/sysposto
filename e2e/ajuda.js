// Funções comuns dos testes de navegador.

/** "1.234,567" -> 1234567 (milésimos) */
const mil = (t) => Math.round(Number(String(t).replace(/\./g, "").replace(",", ".")) * 1000);
const texto3 = (m) => (m / 1000).toFixed(3).replace(".", ",");

/**
 * Lança abastecimento manual pelo encerrante: lê o encerrante anterior mostrado na janela
 * e digita anterior + litros. Com { virou: true, final }, digita o final informado e marca "zerou".
 */
async function manual(p, bico, litros, opcoes = {}) {
  await p.keyboard.press("F7");
  await p.locator("dialog[open]").waitFor();
  await p.getByRole("radio", { name: new RegExp(`^Bico ${bico},`) }).check({ force: true });
  const linha = await p.locator("dialog[open]").getByText(/Encerrante anterior do bico/).innerText();
  const anterior = mil(linha.split(":")[1].trim());
  const final = opcoes.virou ? mil(opcoes.final) : anterior + mil(litros);
  await p.fill("#encerrante-final", texto3(final));
  if (opcoes.virou) await p.getByLabel(/O totalizador zerou/).check();
  await p.locator("dialog[open] button[type=submit]").click();
  await p.waitForFunction(() => !document.querySelector("dialog[open]"), null, { timeout: 15000 });
  return { anterior, final };
}

module.exports = { manual, mil, texto3 };
