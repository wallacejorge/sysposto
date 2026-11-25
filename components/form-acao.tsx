"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Botao, MensagemErro } from "./ui";
import { useAcao } from "./use-acao";

type Estado = { erro?: string; ok?: string };

/**
 * Formulário padrão dos cadastros: envia para a ação do servidor, mostra erro ou sucesso
 * e mantém o que foi digitado quando dá erro. Os campos vêm como children (podem ser do servidor).
 */
export function FormAcao({
  acao,
  children,
  rotulo = "Salvar",
  className = "",
  variante = "primario",
  extra,
}: {
  acao: (estado: Estado, form: FormData) => Promise<Estado>;
  children: ReactNode;
  rotulo?: string;
  className?: string;
  variante?: "primario" | "secundario" | "perigo";
  extra?: ReactNode;
}) {
  const [estado, aoEnviar, enviando] = useAcao<Estado>(acao);
  const form = useRef<HTMLFormElement>(null);
  // Deu certo: limpa o formulário para o próximo cadastro (quando a ação não muda de página).
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} onSubmit={aoEnviar} className={className}>
      {children}
      <MensagemErro>{estado.erro}</MensagemErro>
      {estado.ok ? (
        <p role="status" className="mt-2 rounded-md bg-success-bg px-3 py-2 text-sm font-medium text-on-success-bg">
          {estado.ok}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Botao type="submit" variante={variante} carregando={enviando}>
          {rotulo}
        </Botao>
        {extra}
      </div>
    </form>
  );
}
