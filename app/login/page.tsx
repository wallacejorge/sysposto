import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { opcoesDeLogin } from "@/lib/data/caixa";
import { usuarioAtual } from "@/lib/session";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function PaginaLogin() {
  if (await usuarioAtual()) redirect("/");
  const opcoes = await opcoesDeLogin();
  return (
    <main className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg p-6 shadow-card">
        <h1 className="text-xl">Sistema do Posto</h1>
        <p className="mb-6 text-text-muted">Escolha seu nome e digite o PIN.</p>
        {opcoes.length ? <FormLogin opcoes={opcoes} /> : <p>Nenhum usuário com PIN cadastrado. Peça ao gerente para criar o seu acesso.</p>}
      </div>
    </main>
  );
}
