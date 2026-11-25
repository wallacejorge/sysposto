import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { abastecimentosPendentes, bicosComPreco, formasDePagamento, turnoAbertoDo } from "@/lib/data/caixa";
import { exigirUsuario } from "@/lib/session";
import { Pdv } from "./pdv";

export const metadata: Metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

export default async function PaginaCaixa() {
  const usuario = await exigirUsuario("caixa.operar");
  const turno = await turnoAbertoDo(usuario);
  if (!turno) redirect("/caixa/abrir");
  const [pendentes, bicos, formas] = await Promise.all([
    abastecimentosPendentes(usuario.empresaId),
    bicosComPreco(usuario.empresaId),
    formasDePagamento(usuario.empresaId),
  ]);
  return <Pdv turno={{ id: turno.id, caixa: turno.caixa_nome }} pendentes={pendentes} bicos={bicos} formas={formas} />;
}
