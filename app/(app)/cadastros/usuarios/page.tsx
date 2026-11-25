import type { Metadata } from "next";
import Link from "next/link";
import { listarPerfis, listarUsuarios, PERMISSOES } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { botaoClasses, Cartao, Selo, Tabela, TituloPagina } from "@/components/ui";

export const metadata: Metadata = { title: "Usuários e perfis" };
export const dynamic = "force-dynamic";

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { salvo } = await searchParams;
  const [usuarios, perfis] = await Promise.all([listarUsuarios(u.empresaId), listarPerfis(u.empresaId)]);
  const total = Object.keys(PERMISSOES).length;
  return (
    <>
      {salvo ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Cadastro salvo.</p> : null}
      <TituloPagina titulo="Usuários e perfis" descricao="Quem entra no sistema, com qual PIN, e o que cada perfil pode fazer." />
      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <Cartao titulo="Usuários" acao={<Link href="/cadastros/usuarios/usuario/novo" className={botaoClasses("primario")}>Novo usuário</Link>}>
          <Tabela rotulo="Usuários">
            <thead><tr><th>Nome na entrada</th><th>Nome completo</th><th>Perfil</th><th>PIN</th><th>Situação</th></tr></thead>
            <tbody>
              {usuarios.map((x) => (
                <tr key={x.id}>
                  <td><Link href={`/cadastros/usuarios/usuario/${x.id}`} className="font-semibold text-accent hover:underline">{x.apelido}</Link>{x.eh_frentista ? <span className="ml-2 text-xs text-text-muted">frentista</span> : null}</td>
                  <td>{x.nome}</td>
                  <td>{x.perfil}</td>
                  <td>{x.tem_pin ? "Definido" : <Selo tom="aviso">sem PIN</Selo>}</td>
                  <td>{x.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
          <p className="mt-2 text-xs text-text-muted">Usuário sem PIN (como um frentista) não entra no sistema, mas pode ser escolhido nas vendas.</p>
        </Cartao>
        <Cartao titulo="Perfis" acao={<Link href="/cadastros/usuarios/perfil/novo" className={botaoClasses("secundario")}>Novo perfil</Link>}>
          <Tabela rotulo="Perfis">
            <thead><tr><th>Perfil</th><th className="text-right!">Permissões</th><th className="text-right!">Usuários</th></tr></thead>
            <tbody>
              {perfis.map((p) => (
                <tr key={p.id}>
                  <td><Link href={`/cadastros/usuarios/perfil/${p.id}`} className="font-semibold text-accent hover:underline">{p.nome}</Link></td>
                  <td className="num text-right">{Object.values(p.permissoes).filter(Boolean).length} de {total}</td>
                  <td className="num text-right">{p.usuarios}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Cartao>
      </div>
    </>
  );
}
