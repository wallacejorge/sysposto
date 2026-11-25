import type { Metadata } from "next";
import Link from "next/link";
import { listarCaixas } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { botaoClasses, Cartao, Selo, Tabela, TituloPagina } from "@/components/ui";

export const metadata: Metadata = { title: "Caixas" };
export const dynamic = "force-dynamic";

export default async function Caixas({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { salvo } = await searchParams;
  const caixas = await listarCaixas(u.empresaId);
  return (
    <>
      {salvo ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Cadastro salvo.</p> : null}
      <TituloPagina titulo="Caixas" descricao="Cada caixa tem a própria série de NFC-e, para a numeração nunca se repetir, nem sem internet."
        acoes={<Link href="/cadastros/caixas/novo" className={botaoClasses("primario")}>Novo caixa</Link>} />
      <Cartao>
        <Tabela rotulo="Caixas">
          <thead><tr><th>Nº</th><th>Nome</th><th className="text-right!">Série NFC-e</th><th>Turno</th><th>Situação</th></tr></thead>
          <tbody>
            {caixas.map((c) => (
              <tr key={c.id}>
                <td className="num">{c.numero}</td>
                <td><Link href={`/cadastros/caixas/${c.id}`} className="font-semibold text-accent hover:underline">{c.nome}</Link></td>
                <td className="num text-right">{c.serie_nfce}</td>
                <td>{c.turno_aberto ? <Selo tom="sucesso">Aberto · {c.turno_aberto}</Selo> : "—"}</td>
                <td>{c.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Cartao>
    </>
  );
}
