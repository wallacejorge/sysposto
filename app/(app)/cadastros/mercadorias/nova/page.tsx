import type { Metadata } from "next";
import Link from "next/link";
import { listarGrupos, listarUnidades } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { TituloPagina } from "@/components/ui";
import { FormMercadoria } from "../form-mercadoria";

export const metadata: Metadata = { title: "Nova mercadoria" };

export default async function NovaMercadoria() {
  const u = await exigirUsuario("cadastro.editar");
  const [grupos, unidades] = await Promise.all([listarGrupos(u.empresaId), listarUnidades()]);
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/cadastros/mercadorias" className="text-accent hover:underline">‹ Mercadorias</Link></p>
      <TituloPagina titulo="Nova mercadoria" descricao="Depois de cadastrar, defina o preço na tela da mercadoria." />
      <FormMercadoria m={null} grupos={grupos} unidades={unidades} />
    </>
  );
}
