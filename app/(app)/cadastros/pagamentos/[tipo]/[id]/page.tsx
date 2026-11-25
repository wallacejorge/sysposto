import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listarAdministradoras, listarFormas, TIPOS_PAGAMENTO } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { CampoMarcar, CampoSelecao, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, TituloPagina } from "@/components/ui";
import { acaoAdministradora, acaoForma } from "../../../actions";

export const metadata: Metadata = { title: "Formas de pagamento" };
export const dynamic = "force-dynamic";

const num = (v: string | null) => (v === null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));

export default async function EditarPagamento({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { tipo, id } = await params;
  if (tipo !== "forma" && tipo !== "administradora") notFound();
  const novo = id === "novo";
  const adms = await listarAdministradoras(u.empresaId);
  const voltar = <p className="mb-2 text-sm"><Link href="/cadastros/pagamentos" className="text-accent hover:underline">‹ Formas de pagamento</Link></p>;

  if (tipo === "administradora") {
    const a = novo ? null : adms.find((x) => x.id === id);
    if (!novo && !a) notFound();
    return (
      <>
        {voltar}
        <TituloPagina titulo={a ? a.nome : "Nova administradora"} descricao="As taxas e prazos servem para a conferência dos repasses (fase 2)." />
        <Cartao className="max-w-3xl">
          <FormAcao acao={acaoAdministradora} rotulo={a ? "Salvar" : "Cadastrar"}>
            {a ? <input type="hidden" name="id" value={a.id} /> : null}
            <Grade colunas={2}>
              <CampoTexto nome="nome" rotulo="Nome" valor={a?.nome} obrigatorio maxLength={60} />
              <CampoTexto nome="cnpj" rotulo="CNPJ" valor={a?.cnpj} inputMode="numeric" maxLength={18} />
              <CampoTexto nome="taxa_debito" rotulo="Taxa no débito (%)" valor={num(a?.taxa_debito ?? null)} numerico inputMode="decimal" placeholder="1,49" />
              <CampoTexto nome="taxa_credito" rotulo="Taxa no crédito (%)" valor={num(a?.taxa_credito ?? null)} numerico inputMode="decimal" placeholder="3,19" />
              <CampoTexto nome="dias_repasse_debito" rotulo="Repasse do débito (dias)" valor={a?.dias_repasse_debito} numerico inputMode="numeric" placeholder="1" />
              <CampoTexto nome="dias_repasse_credito" rotulo="Repasse do crédito (dias)" valor={a?.dias_repasse_credito} numerico inputMode="numeric" placeholder="30" />
            </Grade>
          </FormAcao>
        </Cartao>
      </>
    );
  }

  const f = novo ? null : (await listarFormas(u.empresaId)).find((x) => x.id === id);
  if (!novo && !f) notFound();
  return (
    <>
      {voltar}
      <TituloPagina titulo={f ? f.nome : "Nova forma de pagamento"} />
      <Cartao className="max-w-3xl">
        <FormAcao acao={acaoForma} rotulo={f ? "Salvar" : "Cadastrar"}>
          {f ? <input type="hidden" name="id" value={f.id} /> : null}
          <div className="space-y-4">
            <Grade colunas={2}>
              <CampoTexto nome="nome" rotulo="Nome no botão do caixa" valor={f?.nome} obrigatorio maxLength={40} placeholder="Crédito Rede" />
              <CampoSelecao nome="tipo" rotulo="Tipo" valor={f?.tipo ?? "credito"} obrigatorio dica="Define o código do pagamento na NFC-e.">
                {Object.entries(TIPOS_PAGAMENTO).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
              </CampoSelecao>
              <CampoSelecao nome="administradora_id" rotulo="Administradora (só cartão)" valor={f?.administradora_id}>
                <option value="">Nenhuma</option>
                {adms.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </CampoSelecao>
            </Grade>
            <CampoMarcar nome="conta_no_caixa" rotulo="Fica na gaveta do caixa" marcado={f ? f.conta_no_caixa : false}
              dica="Marque para dinheiro e cheque: entram na contagem física do fechamento." />
            {f ? <CampoMarcar nome="ativo" rotulo="Ativa" marcado={f.ativo} dica="Inativa some dos botões do caixa." /> : null}
          </div>
        </FormAcao>
      </Cartao>
    </>
  );
}
