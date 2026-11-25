import Link from "next/link";
import { botaoClasses } from "@/components/ui";

export default function SemPermissao() {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl">Sem permissão</h1>
      <p className="mb-4 text-text-muted">Seu perfil não pode abrir esta tela. Peça ao gerente para liberar o acesso.</p>
      <Link href="/" className={botaoClasses("secundario")}>
        Voltar ao painel
      </Link>
    </main>
  );
}
