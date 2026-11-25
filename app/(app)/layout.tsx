import Link from "next/link";
import { exigirUsuario } from "@/lib/session";
import { turnoAbertoDo } from "@/lib/data/caixa";
import { dataBR, hojeNoPosto } from "@/lib/format";
import { Selo } from "@/components/ui";
import { Navegacao } from "@/components/navegacao";
import { sair } from "../login/actions";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const turno = await turnoAbertoDo(usuario);

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex flex-1 flex-col md:flex-row">
        <aside className="border-b border-border bg-bg md:w-[240px] md:shrink-0 md:border-r md:border-b-0">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="text-base font-bold">
              Sistema do Posto
            </Link>
            <form action={sair}>
              <button className="text-sm font-semibold text-accent hover:underline">Sair</button>
            </form>
          </div>
          <Navegacao permissoes={usuario.permissoes} />
        </aside>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
      <footer
        aria-label="Situação"
        className="flex min-h-[var(--layout-statusbar)] flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-bg px-3 py-1 text-xs text-text-muted"
      >
        <Selo tom="sucesso">Online</Selo>
        <span>
          Empresa <b className="text-text">{usuario.empresaNome}</b>
        </span>
        <span>
          Operador <b className="text-text">{usuario.apelido}</b> ({usuario.perfil})
        </span>
        <span>
          Data de trabalho <b className="text-text">{dataBR(hojeNoPosto() + "T12:00:00")}</b>
        </span>
        <span className="flex items-center gap-1">
          Turno {turno ? <Selo tom="sucesso">Aberto · {turno.caixa_nome}</Selo> : <Selo>Fechado</Selo>}
        </span>
      </footer>
    </div>
  );
}
