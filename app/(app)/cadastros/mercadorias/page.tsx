import type { Metadata } from "next";
import Link from "next/link";
import { listarMercadorias } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { precoLitro } from "@/lib/format";
import { botaoClasses, Campo, Cartao, Selecao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";

export const metadata: Metadata = { title: "Mercadorias e preços" };
export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { combustivel: "Combustível", produto: "Produto", servico: "Serviço" };

export default async function Mercadorias({ searchParams }: { searchParams: Promise<{ busca?: string; tipo?: string; inativos?: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const f = await searchParams;
  const lista = await listarMercadorias(u.empresaId, { busca: f.busca, tipo: f.tipo, inativos: f.inativos === "1" });
  return (
    <>
      <TituloPagina
        titulo="Mercadorias e preços"
        descricao="Combustíveis, produtos e serviços. Clique em um item para mudar o cadastro ou o preço."
        acoes={
          <>
            <Link href="/cadastros/grupos" className={botaoClasses("secundario")}>Grupos, unidades e tipos de preço</Link>
            <Link href="/cadastros/mercadorias/nova" className={botaoClasses("primario")}>Nova mercadoria</Link>
          </>
        }
      />
      <Cartao>
        <form className="mb-4 flex flex-wrap items-end gap-3" role="search">
          <div className="w-full sm:w-64">
            <label htmlFor="busca" className="mb-1 block text-xs font-semibold text-text-muted">Buscar</label>
            <Campo id="busca" name="busca" defaultValue={f.busca} placeholder="Nome, código ou código de barras" />
          </div>
          <div className="w-full sm:w-44">
            <label htmlFor="tipo" className="mb-1 block text-xs font-semibold text-text-muted">Tipo</label>
            <Selecao id="tipo" name="tipo" defaultValue={f.tipo ?? ""}>
              <option value="">Todos</option>
              <option value="combustivel">Combustível</option>
              <option value="produto">Produto</option>
              <option value="servico">Serviço</option>
            </Selecao>
          </div>
          <label className="flex h-control-compacto items-center gap-2 text-sm">
            <input type="checkbox" name="inativos" value="1" defaultChecked={f.inativos === "1"} /> Mostrar inativos
          </label>
          <button className={botaoClasses("secundario")}>Filtrar</button>
        </form>
        {lista.length ? (
          <Tabela rotulo="Mercadorias">
            <thead>
              <tr><th>Código</th><th>Nome</th><th>Tipo</th><th>Grupo</th><th>Unidade</th><th>Tributação</th><th className="text-right!">Preço à vista</th><th>Situação</th></tr>
            </thead>
            <tbody>
              {lista.map((m) => (
                <tr key={m.id}>
                  <td className="num">{m.codigo}</td>
                  <td><Link href={`/cadastros/mercadorias/${m.id}`} className="font-semibold text-accent hover:underline">{m.nome}</Link></td>
                  <td>{TIPOS[m.tipo]}</td>
                  <td>{m.grupo ?? "—"}</td>
                  <td>{m.unidade}</td>
                  <td>{m.tributacao ?? <Selo tom="aviso">sem tributação</Selo>}{m.revisar ? <span className="ml-1"><Selo tom="aviso">revisar</Selo></span> : null}</td>
                  <td className="num text-right">{m.preco ? precoLitro(m.preco) : <Selo tom="aviso">sem preço</Selo>}</td>
                  <td>{m.ativo ? <Selo tom="sucesso">Ativo</Selo> : <Selo>Inativo</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>{f.busca || f.tipo ? "Nada encontrado com esse filtro." : "Nenhuma mercadoria cadastrada. Comece pelos combustíveis."}</Vazio>
        )}
      </Cartao>
    </>
  );
}
