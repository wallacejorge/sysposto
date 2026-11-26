import { NextResponse } from "next/server";
import { usuarioDaApi } from "@/lib/api";
import { abastecimentosPendentes, turnoAbertoDo } from "@/lib/data/caixa";
import { catalogo } from "@/lib/data/vendas";

export const dynamic = "force-dynamic";

/** Situação atual do caixa: turno, abastecimentos para registrar e catálogo (bicos, produtos, formas). */
export async function GET(req: Request) {
  const u = await usuarioDaApi(req, "caixa.operar");
  if (u instanceof NextResponse) return u;
  const turno = await turnoAbertoDo(u);
  const [pendentes, cat] = await Promise.all([abastecimentosPendentes(u.empresaId), catalogo(u.empresaId, turno?.id ?? null)]);
  return NextResponse.json(
    { turno: turno ? { id: turno.id, caixa: turno.caixa_nome } : null, pendentes, catalogo: cat, usuario: { id: u.id, apelido: u.apelido } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
