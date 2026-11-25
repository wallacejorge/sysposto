import type { Metadata } from "next";
import Link from "next/link";
import { listarAdministradoras, listarFormas, TIPOS_PAGAMENTO } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { botaoClasses, Cartao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";

export const metadata: Metadata = { title: "Formas de pagamento" };
export const dynamic = "force-dynamic";

const pct = (v: string | null) => (v === null ? "—" : `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%`);

export default async function Pagamentos({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { salvo } = await searchParams;
  const [formas, adms] = await Promise.all([listarFormas(u.empresaId), listarAdministradoras(u.empresaId)]);
  return (
    <>
      {salvo ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Cadastro salvo.</p> : null}
      <TituloPagina titulo="Formas de pagamento" descricao="O que aparece nos botões do caixa e na conferência do fechamento." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Cartao titulo="Formas de pagamento" acao={<Link href="/cadastros/pagamentos/forma/novo" className={botaoClasses("primario")}>Nova forma</Link>}>
          <Tabela rotulo="Formas de pagamento">
            <thead><tr><th>Nome</th><th>Tipo</th><th>Administradora</th><th>Na gaveta?</th><th>Situação</th></tr></thead>
            <tbody>
              {formas.map((f) => (
                <tr key={f.id}>
                  <td><Link href={`/cadastros/pagamentos/forma/${f.id}`} className="font-semibold text-accent hover:underline">{f.nome}</Link></td>
                  <td>{TIPOS_PAGAMENTO[f.tipo].nome}</td>
                  <td>{f.administradora ?? "—"}</td>
                  <td>{f.conta_no_caixa ? "Sim" : "Não"}</td>
                  <td>{f.ativo ? <Selo tom="sucesso">Ativa</Selo> : <Selo>Inativa</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Cartao>
        <Cartao titulo="Administradoras de cartão" acao={<Link href="/cadastros/pagamentos/administradora/novo" className={botaoClasses("secundario")}>Nova administradora</Link>}>
          {adms.length ? (
            <Tabela rotulo="Administradoras">
              <thead><tr><th>Nome</th><th className="text-right!">Taxa débito</th><th className="text-right!">Taxa crédito</th><th className="text-right!">Repasse (dias)</th></tr></thead>
              <tbody>
                {adms.map((a) => (
                  <tr key={a.id}>
                    <td><Link href={`/cadastros/pagamentos/administradora/${a.id}`} className="font-semibold text-accent hover:underline">{a.nome}</Link></td>
                    <td className="num text-right">{pct(a.taxa_debito)}</td>
                    <td className="num text-right">{pct(a.taxa_credito)}</td>
                    <td className="num text-right">{a.dias_repasse_debito ?? "—"} / {a.dias_repasse_credito ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : <Vazio>Nenhuma administradora. Cadastre a da sua maquininha para separar o fechamento por administradora.</Vazio>}
        </Cartao>
      </div>
    </>
  );
}
