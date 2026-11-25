import "server-only";
import { ErroNegocio } from "./data/caixa";

export type Estado = { erro?: string; ok?: string };

/** Roda uma ação do servidor e transforma erro de regra em mensagem; erro inesperado vira mensagem genérica. */
export async function executar(fn: () => Promise<Estado | void>): Promise<Estado> {
  try {
    return (await fn()) ?? {};
  } catch (e) {
    if (e instanceof ErroNegocio) return { erro: e.message };
    // redirect() do Next também passa por aqui: precisa seguir adiante.
    if (e && typeof e === "object" && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT")) throw e;
    console.error(e);
    return { erro: "Não foi possível concluir. Tente de novo; se continuar, chame o gerente." };
  }
}
