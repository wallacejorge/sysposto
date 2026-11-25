import { NextResponse } from "next/server";
import { encerrarSessao } from "@/lib/session";

/** Sai e volta para a lista de operadores (troca de operador no caixa). */
export async function GET(req: Request) {
  await encerrarSessao();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
