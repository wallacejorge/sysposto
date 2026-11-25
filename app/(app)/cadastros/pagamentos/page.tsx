import { EmBreve } from "@/components/em-breve";
import { exigirUsuario } from "@/lib/session";

export const metadata = { title: "Formas de pagamento" };

export default async function Pagina() {
  await exigirUsuario("cadastro.editar");
  return <EmBreve titulo="Formas de pagamento" marco="Marco 2" descricao="Dinheiro, PIX, cartões, administradoras e bandeiras." />;
}
