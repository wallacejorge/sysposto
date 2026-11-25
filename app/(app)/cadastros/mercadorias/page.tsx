import { EmBreve } from "@/components/em-breve";
import { exigirUsuario } from "@/lib/session";

export const metadata = { title: "Mercadorias e preços" };

export default async function Pagina() {
  await exigirUsuario("cadastro.editar");
  return <EmBreve titulo="Mercadorias e preços" marco="Marco 2" descricao="Combustíveis e produtos, grupos, unidades e a tabela de preços com vigência e promoção. Por enquanto, use os dados de exemplo." />;
}
