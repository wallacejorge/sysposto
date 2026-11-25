import { EmBreve } from "@/components/em-breve";
import { exigirUsuario } from "@/lib/session";

export const metadata = { title: "NFC-e" };

export default async function Pagina() {
  await exigirUsuario("cadastro.editar");
  return <EmBreve titulo="NFC-e" marco="Marco 4" descricao="Emissão, cancelamento, inutilização e contingência, por um emissor homologado." />;
}
