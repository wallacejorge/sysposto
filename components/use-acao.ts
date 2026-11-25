"use client";

import { startTransition, useActionState, type FormEvent } from "react";

/**
 * Envia o formulário para a server action SEM o reset automático do React 19.
 * Assim, quando a ação devolve um erro, tudo o que o operador digitou continua na tela
 * (encerrantes, valores contados, usuário escolhido).
 */
export function useAcao<E extends { erro?: string; ok?: string }>(acao: (estado: E, form: FormData) => Promise<E>) {
  const [estado, despachar, enviando] = useActionState<E, FormData>(
    acao as (estado: Awaited<E>, form: FormData) => Promise<E>,
    {} as Awaited<E>,
  );
  function aoEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    startTransition(() => despachar(dados));
  }
  return [estado, aoEnviar, enviando] as const;
}
