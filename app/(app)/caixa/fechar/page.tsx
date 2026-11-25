import type { Metadata } from "next";
import Link from "next/link";
import { abastecimentosPendentes, limiteDiferenca, resumoDoTurno, turnoAbertoDo } from "@/lib/data/caixa";
import { exigirUsuario } from "@/lib/session";
import { botaoClasses, Cartao, TituloPagina } from "@/components/ui";
import { FormFechar } from "./form-fechar";

export const metadata: Metadata = { title: "Fechar turno" };
export const dynamic = "force-dynamic";

export default async function FecharTurno() {
  const usuario = await exigirUsuario("caixa.operar");
  const turno = await turnoAbertoDo(usuario);
  if (!turno) {
    return (
      <>
        <TituloPagina titulo="Fechar turno" />
        <Cartao>
          <p className="mb-3">Você não tem turno aberto.</p>
          <Link href="/caixa/abrir" className={botaoClasses("primario")}>Abrir turno</Link>
        </Cartao>
      </>
    );
  }
  const [resumo, pendentes] = await Promise.all([resumoDoTurno(usuario.empresaId, turno.id), abastecimentosPendentes(usuario.empresaId)]);
  return (
    <>
      <TituloPagina
        titulo="Fechar turno"
        descricao={`${turno.caixa_nome} · ${turno.operador}. Digite o encerrante de cada bico e quanto você contou em cada forma de pagamento.`}
      />
      <FormFechar resumo={resumo!} pendentes={pendentes.length} limite={limiteDiferenca()} />
    </>
  );
}
