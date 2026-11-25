import type { Metadata } from "next";
import { exigirUsuario } from "@/lib/session";
import { CampoTexto } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, TituloPagina } from "@/components/ui";
import { acaoMeuPin } from "../cadastros/actions";

export const metadata: Metadata = { title: "Meu PIN" };

export default async function MeuPin() {
  const u = await exigirUsuario();
  return (
    <>
      <TituloPagina titulo="Meu PIN" descricao={`${u.nome} · ${u.perfil}. Use um PIN que só você sabe.`} />
      <Cartao className="max-w-md">
        <FormAcao acao={acaoMeuPin} rotulo="Trocar PIN">
          <div className="space-y-4">
            <CampoTexto nome="atual" rotulo="PIN atual" type="password" inputMode="numeric" maxLength={6} obrigatorio />
            <CampoTexto nome="novo" rotulo="Novo PIN" type="password" inputMode="numeric" maxLength={6} pattern="\d{4,6}" title="4 a 6 números" obrigatorio dica="4 a 6 números." />
            <CampoTexto nome="confirmar" rotulo="Repita o novo PIN" type="password" inputMode="numeric" maxLength={6} obrigatorio />
          </div>
        </FormAcao>
      </Cartao>
    </>
  );
}
