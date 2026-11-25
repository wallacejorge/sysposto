"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { conferirPin } from "@/lib/data/caixa";
import { criarSessao, encerrarSessao } from "@/lib/session";

export type EstadoLogin = { erro?: string };

const esquema = z.object({
  usuarioId: z.string().uuid("Escolha o usuário."),
  empresaId: z.string().uuid("Escolha a empresa."),
  pin: z.string().regex(/^\d{4,6}$/, "O PIN tem de 4 a 6 números."),
});

export async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const r = esquema.safeParse(Object.fromEntries(form));
  if (!r.success) return { erro: r.error.issues[0].message };
  const ok = await conferirPin(r.data.usuarioId, r.data.pin, r.data.empresaId);
  if (!ok) return { erro: "PIN incorreto." };
  await criarSessao(r.data.usuarioId, r.data.empresaId);
  redirect("/");
}

export async function sair() {
  await encerrarSessao();
  redirect("/login");
}
