"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { abrirTurno, conferirPin, fecharTurno } from "@/lib/data/caixa";
import { cancelarVenda, trocarPagamento } from "@/lib/data/vendas";
import { lerReais, lerTresCasas } from "@/lib/format";
import { exigirUsuario } from "@/lib/session";
import { executar, type Estado } from "@/lib/acao";

// Vender, lançar bico manual e sangria passam por /api/caixa/operacoes (funcionam sem internet).
// Aqui ficam as ações que exigem estar online.

export type { Estado };

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

export async function acaoCancelarVenda(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario("caixa.operar");
  return executar(async () => {
    await cancelarVenda(usuario, String(form.get("vendaId")), String(form.get("motivo") ?? ""));
    revalidatePath("/caixa/vendas");
    revalidatePath("/caixa");
    return { ok: "Venda cancelada. Os abastecimentos dela voltaram para a lista do caixa." };
  });
}

export async function acaoTrocarPagamento(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario("caixa.operar");
  return executar(async () => {
    await trocarPagamento(usuario, String(form.get("pagamentoId")), String(form.get("formaId")), String(form.get("motivo") ?? ""));
    revalidatePath("/caixa/vendas");
    return { ok: "Forma de pagamento trocada." };
  });
}

/** Desbloqueio da tela do caixa: confere o PIN de quem está logado. */
export async function acaoDesbloquear(_: Estado, form: FormData): Promise<Estado> {
  const usuario = await exigirUsuario();
  return executar(async () => {
    const ok = await conferirPin(usuario.id, String(form.get("pin") ?? ""), usuario.empresaId);
    return ok ? { ok: "desbloqueado" } : { erro: "PIN incorreto." };
  });
}
