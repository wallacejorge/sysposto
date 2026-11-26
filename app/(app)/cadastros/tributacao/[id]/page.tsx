import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CST_ICMS, listarTributacoes } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { CampoMarcar, CampoSelecao, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, TituloPagina } from "@/components/ui";
import { acaoTributacao } from "../../actions";

export const metadata: Metadata = { title: "Tributação" };
export const dynamic = "force-dynamic";

const n = (v: string | null | undefined, casas = 2) => (v === null || v === undefined ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: 4 }));

export default async function EditarTributacao({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { id } = await params;
  const t = id === "nova" ? null : (await listarTributacoes(u.empresaId)).find((x) => x.id === id);
  if (id !== "nova" && !t) notFound();
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/cadastros/tributacao" className="text-accent hover:underline">‹ Tributação</Link></p>
      <TituloPagina titulo={t ? t.nome : "Nova tributação"} descricao={t ? `Usada por ${t.mercadorias} mercadoria(s) ativa(s).` : undefined} />
      <FormAcao acao={acaoTributacao} rotulo={t ? "Salvar" : "Cadastrar"} className="max-w-4xl space-y-4">
        {t ? <input type="hidden" name="id" value={t.id} /> : null}
        <Cartao titulo="Identificação">
          <Grade colunas={2}>
            <CampoTexto nome="nome" rotulo="Nome" valor={t?.nome} obrigatorio maxLength={60} placeholder="Gasolina (monofásico)" />
            <CampoSelecao nome="origem" rotulo="Origem da mercadoria" valor={t?.origem ?? "0"}>
              <option value="0">0 · Nacional</option>
              <option value="1">1 · Estrangeira, importação direta</option>
              <option value="2">2 · Estrangeira, adquirida no mercado interno</option>
            </CampoSelecao>
          </Grade>
        </Cartao>
        <Cartao titulo="ICMS">
          <Grade colunas={2}>
            <CampoSelecao nome="cst_icms" rotulo="CST" valor={t?.cst_icms ?? "61"} obrigatorio>
              {Object.entries(CST_ICMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </CampoSelecao>
            <CampoTexto nome="cfop_interno" rotulo="CFOP dentro do estado" valor={t?.cfop_interno ?? "5656"} obrigatorio inputMode="numeric" maxLength={4} dica="Combustível para consumidor: 5656." />
            <CampoTexto nome="cfop_interestadual" rotulo="CFOP para fora do estado" valor={t?.cfop_interestadual} inputMode="numeric" maxLength={4} dica="Só na NF-e para cliente de outra UF (ex.: 6656)." />
            <CampoTexto nome="p_icms" rotulo="Alíquota de ICMS (%)" valor={n(t?.p_icms)} numerico inputMode="decimal" dica="Só para CST 00 ou 20." />
            <CampoTexto nome="p_icms_efetivo" rotulo="ICMS efetivo (%)" valor={n(t?.p_icms_efetivo)} numerico inputMode="decimal" dica="Informativo, usado no CST 60 (ex.: 22,00)." />
            <CampoTexto nome="ad_rem" rotulo="Ad rem retido (R$ por unidade)" valor={n(t?.ad_rem, 4)} numerico inputMode="decimal" dica="CST 61: valor do ICMS monofásico por litro ou por kg (ex.: 1,5700)." />
            <CampoSelecao nome="ad_rem_unidade" rotulo="Unidade do ad rem" valor={t?.ad_rem_unidade ?? "L"}>
              <option value="L">por litro</option>
              <option value="kg">por kg (GLP)</option>
            </CampoSelecao>
            <CampoTexto nome="c_benef" rotulo="Código de benefício fiscal" valor={t?.c_benef} maxLength={10} dica="Só se a SEFAZ-AM exigir para o produto." />
          </Grade>
        </Cartao>
        <Cartao titulo="PIS e COFINS">
          <Grade colunas={4}>
            <CampoTexto nome="pis_cst" rotulo="CST PIS" valor={t?.pis_cst ?? "04"} obrigatorio inputMode="numeric" maxLength={2} dica="04 = monofásico, alíquota zero na revenda." />
            <CampoTexto nome="p_pis" rotulo="Alíquota PIS (%)" valor={n(t?.p_pis)} numerico inputMode="decimal" />
            <CampoTexto nome="cofins_cst" rotulo="CST COFINS" valor={t?.cofins_cst ?? "04"} obrigatorio inputMode="numeric" maxLength={2} />
            <CampoTexto nome="p_cofins" rotulo="Alíquota COFINS (%)" valor={n(t?.p_cofins)} numerico inputMode="decimal" />
          </Grade>
        </Cartao>
        <Cartao titulo="Revisão">
          <div className="space-y-3">
            <CampoMarcar nome="revisar" rotulo="Marcar para revisão do contador" marcado={t?.revisar} dica="Aparece em destaque na lista até alguém conferir e desmarcar." />
            <CampoTexto nome="observacao" rotulo="Observação" valor={t?.observacao} maxLength={500} />
          </div>
        </Cartao>
      </FormAcao>
    </>
  );
}
