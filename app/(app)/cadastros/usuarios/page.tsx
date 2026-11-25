import { EmBreve } from "@/components/em-breve";
import { exigirUsuario } from "@/lib/session";

export const metadata = { title: "Usuários e perfis" };

export default async function Pagina() {
  await exigirUsuario("cadastro.editar");
  return <EmBreve titulo="Usuários e perfis" marco="Marco 2" descricao="Operadores, PINs, perfis e permissões." />;
}
