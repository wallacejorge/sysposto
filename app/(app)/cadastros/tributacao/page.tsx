import type { Metadata } from "next";
import Link from "next/link";
import { listarTributacoes } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { botaoClasses, Cartao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";

export const metadata: Metadata = { title: "Tributação" };
export const dynamic = "force-dynamic";

const n4 = (v: string | null) => (v === null ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }));

export default async function Tributacoes({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { salvo } = await searchParams;
  const lista = await listarTributacoes(u.empresaId);
  const revisar = lista.filter((t) => t.revisar).length;
  return (
    <>
      {salvo ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Tributação salva.</p> : null}
      <TituloPagina
        titulo="Tributação"
        descricao="Como cada produto sai na nota fiscal. Cada mercadoria aponta para uma destas."
        acoes={<Link href="/cadastros/tributacao/nova" className={botaoClasses("primario")}>Nova tributação</Link>}
      />
      {revisar ? (
        <p role="status" className="mb-4 rounded-md bg-warning-bg px-3 py-2 font-medium text-on-warning-bg">
          {revisar} tributação(ões) marcadas para revisão: copiadas das notas do sistema antigo, mas com divergência encontrada. Confira com o contador antes de emitir notas de verdade.
        </p>
      ) : null}
      <Cartao>
        {lista.length ? (
          <Tabela rotulo="Tributações">
            <thead>
              <tr><th>Nome</th><th>CST ICMS</th><th>CFOP (AM / fora)</th><th className="text-right!">Ad rem / ICMS</th><th>PIS / COFINS</th><th className="text-right!">Itens</th><th /></tr>
            </thead>
            <tbody>
              {lista.map((t) => (
                <tr key={t.id}>
                  <td><Link href={`/cadastros/tributacao/${t.id}`} className="font-semibold text-accent hover:underline">{t.nome}</Link></td>
                  <td className="num">{t.cst_icms}</td>
                  <td className="num">{t.cfop_interno}{t.cfop_interestadual ? ` / ${t.cfop_interestadual}` : ""}</td>
                  <td className="num text-right">
                    {t.ad_rem !== null ? `R$ ${n4(t.ad_rem)}/${t.ad_rem_unidade}` : t.p_icms !== null ? `${n4(t.p_icms)}%` : t.p_icms_efetivo !== null ? `efetivo ${n4(t.p_icms_efetivo)}%` : "—"}
                  </td>
                  <td className="num">{t.pis_cst}{t.p_pis ? ` (${n4(t.p_pis)}%)` : ""} / {t.cofins_cst}{t.p_cofins ? ` (${n4(t.p_cofins)}%)` : ""}</td>
                  <td className="num text-right">{t.mercadorias}</td>
                  <td>{t.revisar ? <Selo tom="aviso">revisar</Selo> : null}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhuma tributação. Crie uma para cada jeito diferente de tributar (gasolina, diesel, lubrificante…).</Vazio>
        )}
      </Cartao>
    </>
  );
}
