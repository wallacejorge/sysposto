import { NextResponse } from "next/server";
import { usuarioDaApi } from "@/lib/api";
import { processar, type Operacao } from "@/lib/data/vendas";

export const dynamic = "force-dynamic";

/**
 * Recebe operações do caixa (uma, ou várias da fila offline) e processa em ordem.
 * Resposta por operação: ok, ou erro definitivo (regra de negócio: sai da fila e vai para "não enviadas").
 * Erro técnico (banco fora do ar): para no meio e devolve 503; o caixa tenta de novo depois.
 */
export async function POST(req: Request) {
  const u = await usuarioDaApi(req, "caixa.operar");
  if (u instanceof NextResponse) return u;
  let corpo: { operacoes?: Operacao[] };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Pedido inválido." }, { status: 400 });
  }
  const ops = Array.isArray(corpo.operacoes) ? corpo.operacoes.slice(0, 200) : [];
  const resultados = [];
  for (const op of ops) {
    try {
      resultados.push(await processar(u, op));
    } catch (e) {
      console.error("Falha técnica ao processar operação do caixa", e);
      return NextResponse.json({ resultados, parouPorFalha: true }, { status: 503 });
    }
  }
  return NextResponse.json({ resultados });
}
