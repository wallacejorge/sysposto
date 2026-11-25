// Formatação e leitura de valores no padrão brasileiro. Dinheiro sempre em centavos inteiros.

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const litrosFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function reais(centavos: number): string {
  return brl.format(centavos / 100);
}

/** Diferença com sinal explícito: "+ R$ 5,00", "- R$ 30,00", "R$ 0,00". */
export function reaisComSinal(centavos: number): string {
  if (centavos === 0) return reais(0);
  return (centavos > 0 ? "+ " : "- ") + reais(Math.abs(centavos));
}

/** Litros e encerrantes: 3 casas. Aceita string vinda do numeric do Postgres. */
export function tresCasas(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  return litrosFmt.format(Number(v));
}

export function precoLitro(v: string | number): string {
  return "R$ " + litrosFmt.format(Number(v));
}

/** "1.234,56" | "1234,56" | "1234.56" | "R$ 10" -> centavos. null se inválido. */
export function lerReais(texto: string): number | null {
  const n = lerDecimal(texto);
  if (n === null) return null;
  return Math.round(n * 100);
}

/** Lê número com vírgula decimal (e pontos de milhar opcionais). Devolve string com ponto, 3 casas. */
export function lerTresCasas(texto: string): string | null {
  const n = lerDecimal(texto);
  if (n === null || n < 0) return null;
  return n.toFixed(3);
}

function lerDecimal(texto: string): number | null {
  const t = texto.replace(/R\$|\s/g, "").trim();
  if (!t) return null;
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, ""); // 1.234 = mil duzentos e trinta e quatro
  else normal = t;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

export function dataBR(d: Date | string): string {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

export function horaBR(d: Date | string): string {
  return new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
}

/** Data de hoje no fuso do posto, yyyy-mm-dd. */
export function hojeNoPosto(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}
