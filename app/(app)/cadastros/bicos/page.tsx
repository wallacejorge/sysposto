import { EmBreve } from "@/components/em-breve";
import { exigirUsuario } from "@/lib/session";

export const metadata = { title: "Bombas, bicos e tanques" };

export default async function Pagina() {
  await exigirUsuario("cadastro.editar");
  return <EmBreve titulo="Bombas, bicos e tanques" marco="Marco 2" descricao="Cadastro das 4 bombas, 16 bicos e tanques, com o combustível de cada bico." />;
}
