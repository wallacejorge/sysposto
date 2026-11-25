import "server-only";
import { NextResponse } from "next/server";
import { usuarioAtual, type Usuario } from "./session";

/** Usuário logado com a permissão, para rotas de API. Também recusa pedido vindo de outro site. */
export async function usuarioDaApi(req: Request, permissao: string): Promise<Usuario | NextResponse> {
  const origem = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (req.method !== "GET" && origem && host && new URL(origem).host !== host) {
    return NextResponse.json({ erro: "Origem não permitida." }, { status: 403 });
  }
  const u = await usuarioAtual();
  if (!u) return NextResponse.json({ erro: "Sessão expirada. Entre de novo." }, { status: 401 });
  if (!u.permissoes[permissao]) return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  return u;
}
