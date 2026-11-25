"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; rotulo: string; permissao?: string; pronto?: boolean };
type Grupo = { titulo: string; itens: Item[] };

// Barra lateral por tarefa (no lugar dos 13 menus do sistema antigo).
// "pronto: false" = tela ainda não construída (aparece, mas indica que vem depois).
const grupos: Grupo[] = [
  { titulo: "Início", itens: [{ href: "/", rotulo: "Painel", pronto: true }] },
  {
    titulo: "Caixa",
    itens: [
      { href: "/caixa", rotulo: "Vender", permissao: "caixa.operar", pronto: true },
      { href: "/caixa/abrir", rotulo: "Abrir turno", permissao: "caixa.operar", pronto: true },
      { href: "/caixa/fechar", rotulo: "Fechar turno", permissao: "caixa.operar", pronto: true },
    ],
  },
  { titulo: "Relatórios", itens: [{ href: "/relatorios/turnos", rotulo: "Turnos", permissao: "relatorio.ver", pronto: true }] },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/cadastros/mercadorias", rotulo: "Mercadorias e preços", permissao: "cadastro.editar", pronto: true },
      { href: "/cadastros/bicos", rotulo: "Bombas, bicos e tanques", permissao: "cadastro.editar", pronto: true },
      { href: "/cadastros/pagamentos", rotulo: "Formas de pagamento", permissao: "cadastro.editar", pronto: true },
      { href: "/cadastros/caixas", rotulo: "Caixas", permissao: "cadastro.editar", pronto: true },
      { href: "/cadastros/usuarios", rotulo: "Usuários e perfis", permissao: "cadastro.editar", pronto: true },
      { href: "/cadastros/empresa", rotulo: "Dados da empresa", permissao: "cadastro.editar", pronto: true },
      { href: "/cadastros/clientes", rotulo: "Clientes e veículos", permissao: "cadastro.editar" },
    ],
  },
  {
    titulo: "Fiscal",
    itens: [{ href: "/fiscal/nfce", rotulo: "NFC-e", permissao: "cadastro.editar" }],
  },
  { titulo: "Minha conta", itens: [{ href: "/conta", rotulo: "Meu PIN", pronto: true }] },
];

export function Navegacao({ permissoes }: { permissoes: Record<string, boolean> }) {
  const atual = usePathname();
  return (
    <nav aria-label="Principal" className="px-2 pb-3">
      <ul className="flex gap-1 overflow-x-auto md:block md:space-y-4">
        {grupos.map((g) => {
          const itens = g.itens.filter((i) => !i.permissao || permissoes[i.permissao]);
          if (!itens.length) return null;
          return (
            <li key={g.titulo} className="shrink-0">
              <p className="hidden px-2 pb-1 text-xs font-semibold text-text-muted uppercase md:block">{g.titulo}</p>
              <ul className="flex gap-1 md:block md:space-y-0.5">
                {itens.map((i) => {
                  const ativo = i.href === "/" || i.href === "/caixa" ? atual === i.href : atual === i.href || atual.startsWith(i.href + "/");
                  return (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        aria-current={ativo ? "page" : undefined}
                        className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm ${
                          ativo ? "bg-info-bg font-semibold text-on-info-bg" : "text-text hover:bg-surface"
                        }`}
                      >
                        {i.rotulo}
                        {i.pronto ? null : <span className="text-xs text-text-muted">em breve</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
