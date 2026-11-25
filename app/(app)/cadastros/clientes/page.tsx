import { EmBreve } from "@/components/em-breve";
import { exigirUsuario } from "@/lib/session";

export const metadata = { title: "Clientes e veículos" };

export default async function Pagina() {
  await exigirUsuario("cadastro.editar");
  return <EmBreve titulo="Clientes e veículos" marco="fase 2" descricao="Clientes a prazo, dependentes, veículos e faturas." />;
}
