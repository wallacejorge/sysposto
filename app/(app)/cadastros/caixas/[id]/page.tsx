import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listarCaixas } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { CampoMarcar, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, TituloPagina } from "@/components/ui";
import { acaoCaixa } from "../../actions";

export const metadata: Metadata = { title: "Caixa" };
export const dynamic = "force-dynamic";

export default async function EditarCaixa({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { id } = await params;
  const caixas = await listarCaixas(u.empresaId);
  const c = id === "novo" ? null : caixas.find((x) => x.id === id);
  if (id !== "novo" && !c) notFound();
  const prox = (k: "numero" | "serie_nfce" | "serie_contingencia") => (caixas.length ? Math.max(...caixas.map((x) => x[k])) + 1 : 1);
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/cadastros/caixas" className="text-accent hover:underline">‹ Caixas</Link></p>
      <TituloPagina titulo={c ? c.nome : "Novo caixa"} />
      <Cartao className="max-w-2xl">
        <FormAcao acao={acaoCaixa} rotulo={c ? "Salvar" : "Cadastrar"}>
          {c ? <input type="hidden" name="id" value={c.id} /> : null}
          <div className="space-y-4">
            <Grade colunas={2}>
              <CampoTexto nome="numero" rotulo="Número" valor={c?.numero ?? prox("numero")} obrigatorio inputMode="numeric" />
              <CampoTexto nome="nome" rotulo="Nome" valor={c?.nome ?? `Caixa ${prox("numero")}`} obrigatorio maxLength={40} />
              <CampoTexto nome="serie" rotulo="Série da NFC-e" valor={c?.serie_nfce ?? prox("serie_nfce")} obrigatorio inputMode="numeric"
                dica="Não pode mudar depois que o caixa emitir a primeira nota." />
              <CampoTexto nome="serie_contingencia" rotulo="Série de contingência (sem internet)" valor={c?.serie_contingencia ?? Math.max(105, prox("serie_contingencia"))} obrigatorio inputMode="numeric"
                dica="Notas emitidas sem internet usam esta série. O posto usa 105 hoje." />
            </Grade>
            {c ? <CampoMarcar nome="ativo" rotulo="Ativo" marcado={c.ativo} /> : null}
          </div>
        </FormAcao>
      </Cartao>
    </>
  );
}
