import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { abastecimentosPendentes, turnoAbertoDo } from "@/lib/data/caixa";
import { catalogo } from "@/lib/data/vendas";
import { exigirUsuario } from "@/lib/session";
import { Pdv } from "./pdv";

export const metadata: Metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

export default async function PaginaCaixa() {
  const usuario = await exigirUsuario("caixa.operar");
  const turno = await turnoAbertoDo(usuario);
  if (!turno) redirect("/caixa/abrir");
  const [pendentes, cat] = await Promise.all([abastecimentosPendentes(usuario.empresaId), catalogo(usuario.empresaId)]);
  return (
    <Pdv
      usuario={{ id: usuario.id, apelido: usuario.apelido }}
      inicial={{ turno: { id: turno.id, caixa: turno.caixa_nome }, pendentes, catalogo: cat }}
    />
  );
}
