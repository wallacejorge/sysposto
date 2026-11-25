"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  abrirTurno,
  fecharTurno,
  lancarAbastecimentoManual,
  registrarMovimento,
  registrarVenda,
  TIPOS_MOVIMENTO,
  type TipoMovimento,
} from "@/lib/data/caixa";
import { lerReais, lerTresCasas } from "@/lib/format";
import { exigirUsuario } from "@/lib/session";
import { executar, type Estado } from "@/lib/acao";

export type { Estado };

// ---------------------------------------------------------------------------

export async function acaoAbrirTurno(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario("caixa.operar");
  let aberto = false;
  const r = await executar(async () => {
    const fundo = lerReais(String(form.get("fundo") ?? "0") || "0");
    if (fundo === null || fundo < 0) return { erro: "Fundo de troco inválido." };
    const iniciais: Record<string, string> = {};
    for (const [k, v] of form.entries()) {
      if (!k.startsWith("inicial:")) continue;
      const n = lerTresCasas(String(v));
      if (n === null) return { erro: "Há um encerrante inicial inválido. Use números, com vírgula para os decimais." };
      iniciais[k.slice(8)] = n;
    }
    await abrirTurno(usuario, { caixaId: String(form.get("caixaId")), fundoCentavos: fundo, iniciais });
    aberto = true;
  });
  if (aberto) {
    revalidatePath("/", "layout");
    redirect("/caixa");
  }
  return r;
}

export async function acaoLancarManual(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario("caixa.operar");
  return executar(async () => {
    const modo = form.get("modo");
    const texto = String(form.get("quantidade") ?? "");
    if (modo === "valor") {
      const centavos = lerReais(texto);
      if (!centavos || centavos <= 0) return { erro: "Informe o valor em reais." };
      await lancarAbastecimentoManual(usuario, { bicoId: String(form.get("bicoId")), valorCentavos: centavos });
    } else {
      const litros = lerTresCasas(texto);
      if (!litros || Number(litros) <= 0) return { erro: "Informe os litros." };
      await lancarAbastecimentoManual(usuario, { bicoId: String(form.get("bicoId")), litros });
    }
    revalidatePath("/caixa");
    return { ok: "Abastecimento lançado. Ele já aparece na lista para registrar." };
  });
}

const esquemaVenda = z.object({
  chave: z.string().uuid(),
  abastecimentos: z.array(z.string().uuid()).min(1, "Selecione pelo menos um abastecimento."),
  formaId: z.string().uuid("Escolha a forma de pagamento."),
  recebido: z.string().optional(),
  cpf: z.string().optional(),
});

export async function acaoRegistrarVenda(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario("caixa.operar");
  return executar(async () => {
    const r = esquemaVenda.safeParse({
      chave: form.get("chave"),
      abastecimentos: form.getAll("abastecimento"),
      formaId: form.get("formaId"),
      recebido: form.get("recebido") || undefined,
      cpf: form.get("cpf") || undefined,
    });
    if (!r.success) return { erro: r.error.issues[0].message };
    let recebido: number | undefined;
    if (r.data.recebido) {
      const v = lerReais(r.data.recebido);
      if (v === null) return { erro: "Valor recebido inválido." };
      recebido = v;
    }
    const venda = await registrarVenda(usuario, {
      chave: r.data.chave,
      abastecimentoIds: r.data.abastecimentos,
      formaId: r.data.formaId,
      recebidoCentavos: recebido,
      cpfCnpj: r.data.cpf,
    });
    revalidatePath("/caixa");
    const troco = venda.trocoCentavos > 0 ? ` Troco: ${(venda.trocoCentavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.` : "";
    return { ok: `Venda registrada.${troco}` };
  });
}

export async function acaoMovimento(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario("caixa.operar");
  return executar(async () => {
    const tipo = String(form.get("tipo")) as TipoMovimento;
    if (!(tipo in TIPOS_MOVIMENTO)) return { erro: "Escolha o tipo." };
    const valor = lerReais(String(form.get("valor") ?? ""));
    if (!valor) return { erro: "Informe o valor." };
    await registrarMovimento(usuario, { chave: String(form.get("chave")), tipo, valorCentavos: valor, motivo: String(form.get("motivo") ?? "") });
    revalidatePath("/caixa");
    return { ok: "Movimento registrado." };
  });
}

export async function acaoFecharTurno(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario("caixa.operar");
  const turnoId = String(form.get("turnoId"));
  let fechado = false;
  const r = await executar(async () => {
    const finais: Record<string, { final: string; virou: boolean }> = {};
    const contados: Record<string, number> = {};
    for (const [k, v] of form.entries()) {
      if (k.startsWith("final:")) {
        const bico = k.slice(6);
        const n = lerTresCasas(String(v));
        if (n === null) return { erro: "Há um encerrante final vazio ou inválido." };
        finais[bico] = { final: n, virou: form.get("virou:" + bico) === "on" };
      }
      if (k.startsWith("contado:")) {
        const n = lerReais(String(v) || "0");
        if (n === null || n < 0) return { erro: "Há um valor contado inválido." };
        contados[k.slice(8)] = n;
      }
    }
    await fecharTurno(usuario, { turnoId, finais, contados, justificativa: String(form.get("justificativa") ?? "") });
    fechado = true;
  });
  if (fechado) {
    revalidatePath("/", "layout");
    redirect(`/relatorios/turnos/${turnoId}?fechado=1`);
  }
  return r;
}
