import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { dadosDeAbertura, turnoAbertoDo } from "@/lib/data/caixa";
import { exigirUsuario } from "@/lib/session";
import { TituloPagina } from "@/components/ui";
import { FormAbrir } from "./form-abrir";

export const metadata: Metadata = { title: "Abrir turno" };
export const dynamic = "force-dynamic";

export default async function AbrirTurno() {
  const usuario = await exigirUsuario("caixa.operar");
  if (await turnoAbertoDo(usuario)) redirect("/caixa");
  const { bicos, caixas } = await dadosDeAbertura(usuario.empresaId);
  return (
    <>
      <TituloPagina
        titulo="Abrir turno"
        descricao="Confira o encerrante de cada bico e conte o troco da gaveta. O encerrante vem preenchido com o fechamento anterior."
      />
      <FormAbrir bicos={bicos} caixas={caixas} />
    </>
  );
}
