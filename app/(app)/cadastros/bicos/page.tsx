import type { Metadata } from "next";
import Link from "next/link";
import { estruturaDoPosto } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { tresCasas } from "@/lib/format";
import { botaoClasses, Cartao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";

export const metadata: Metadata = { title: "Bombas, bicos e tanques" };
export const dynamic = "force-dynamic";

const ativo = (a: boolean) => (a ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Inativo</Selo>);

export default async function Estrutura({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { salvo } = await searchParams;
  const { tanques, bombas, bicos } = await estruturaDoPosto(u.empresaId);
  return (
    <>
      {salvo ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Cadastro salvo.</p> : null}
      <TituloPagina
        titulo="Bombas, bicos e tanques"
        descricao="Cada bico puxa de um tanque, e o tanque define o combustível. Com turno aberto, só dá para mudar o que não afeta os encerrantes."
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Cartao titulo="Tanques" acao={<Link href="/cadastros/bicos/tanque/novo" className={botaoClasses("secundario")}>Novo tanque</Link>}>
          {tanques.length ? (
            <Tabela rotulo="Tanques">
              <thead><tr><th>Nº</th><th>Combustível</th><th className="text-right!">Capacidade (L)</th><th className="text-right!">Bicos</th><th>Situação</th></tr></thead>
              <tbody>
                {tanques.map((t) => (
                  <tr key={t.id}>
                    <td><Link href={`/cadastros/bicos/tanque/${t.id}`} className="font-semibold text-accent hover:underline">Tanque {t.numero}</Link></td>
                    <td>{t.combustivel}</td>
                    <td className="num text-right">{tresCasas(t.capacidade_litros)}</td>
                    <td className="num text-right">{t.bicos}</td>
                    <td>{ativo(t.ativo)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : <Vazio>Nenhum tanque. Cadastre os tanques antes dos bicos.</Vazio>}
        </Cartao>
        <Cartao titulo="Bombas" acao={<Link href="/cadastros/bicos/bomba/novo" className={botaoClasses("secundario")}>Nova bomba</Link>}>
          {bombas.length ? (
            <Tabela rotulo="Bombas">
              <thead><tr><th>Bomba</th><th className="text-right!">Bicos ativos</th><th>Situação</th></tr></thead>
              <tbody>
                {bombas.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/cadastros/bicos/bomba/${b.id}`} className="font-semibold text-accent hover:underline">Bomba {b.numero}</Link></td>
                    <td className="num text-right">{b.bicos}</td>
                    <td>{ativo(b.ativo)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : <Vazio>Nenhuma bomba.</Vazio>}
        </Cartao>
        <Cartao titulo="Bicos" className="xl:col-span-2" acao={<Link href="/cadastros/bicos/bico/novo" className={botaoClasses("primario")}>Novo bico</Link>}>
          {bicos.length ? (
            <Tabela rotulo="Bicos">
              <thead><tr><th>Bico</th><th>Bomba</th><th>Tanque</th><th>Combustível</th><th className="text-right!">Encerrante máximo</th><th>Situação</th></tr></thead>
              <tbody>
                {bicos.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/cadastros/bicos/bico/${b.id}`} className="font-semibold text-accent hover:underline">Bico {String(b.numero).padStart(2, "0")}</Link></td>
                    <td>{b.bomba}</td>
                    <td>{b.tanque}</td>
                    <td>{b.combustivel}</td>
                    <td className="num text-right">{tresCasas(b.encerrante_maximo)}</td>
                    <td>{ativo(b.ativo)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : <Vazio>Nenhum bico.</Vazio>}
        </Cartao>
      </div>
    </>
  );
}
