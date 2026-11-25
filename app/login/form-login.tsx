"use client";

import { useEffect, useRef, useState } from "react";
import { useAcao } from "@/components/use-acao";
import { Botao, Campo, MensagemErro, Rotulo, Selecao } from "@/components/ui";
import type { OpcaoLogin } from "@/lib/data/caixa";
import { entrar, type EstadoLogin } from "./actions";
import { lembrarPinCandidato } from "@/lib/fila";

export function FormLogin({ opcoes }: { opcoes: OpcaoLogin[] }) {
  const [estado, acao, enviando] = useAcao<EstadoLogin>(entrar);
  const [usuarioId, setUsuarioId] = useState(opcoes[0]?.id ?? "");
  const empresas = opcoes.find((o) => o.id === usuarioId)?.empresas ?? [];
  const pin = useRef<HTMLInputElement>(null);

  // PIN errado: apaga o que foi digitado e volta o foco para tentar de novo.
  useEffect(() => {
    if (estado.erro && pin.current) {
      pin.current.value = "";
      pin.current.focus();
    }
  }, [estado]);

  return (
    <form
      onSubmit={(e) => {
        const dados = new FormData(e.currentTarget);
        // Resumo do PIN para desbloquear a tela do caixa sem internet (nunca o PIN em si).
        void lembrarPinCandidato(String(dados.get("usuarioId")), String(dados.get("pin")));
        acao(e);
      }}
      className="space-y-4"
    >
      <div>
        <Rotulo htmlFor="usuarioId">Usuário</Rotulo>
        <Selecao id="usuarioId" name="usuarioId" tamanho="normal" value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
          {opcoes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.apelido}
            </option>
          ))}
        </Selecao>
      </div>
      <div>
        <Rotulo htmlFor="pin">PIN</Rotulo>
        <Campo
          id="pin"
          ref={pin}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4,6}"
          maxLength={6}
          required
          autoFocus
          tamanho="normal"
          aria-invalid={estado.erro ? true : undefined}
          aria-describedby={estado.erro ? "erro-login" : undefined}
        />
      </div>
      {empresas.length > 1 ? (
        <div>
          <Rotulo htmlFor="empresaId">Empresa</Rotulo>
          <Selecao id="empresaId" name="empresaId" tamanho="normal" key={usuarioId}>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </Selecao>
        </div>
      ) : (
        <input type="hidden" name="empresaId" value={empresas[0]?.id ?? ""} />
      )}
      <MensagemErro id="erro-login">{estado.erro}</MensagemErro>
      <Botao type="submit" tamanho="normal" className="w-full" carregando={enviando}>
        Entrar
      </Botao>
    </form>
  );
}
