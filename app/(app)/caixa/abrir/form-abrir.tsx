"use client";

import { useAcao } from "@/components/use-acao";
import { Botao, Campo, Cartao, MensagemErro, Rotulo, Selecao, Tabela } from "@/components/ui";
import type { BicoAbertura } from "@/lib/data/caixa";
import { tresCasas } from "@/lib/format";
import { acaoAbrirTurno, type Estado } from "../actions";

export function FormAbrir({ bicos, caixas }: { bicos: BicoAbertura[]; caixas: { id: string; nome: string; ocupado_por: string | null }[] }) {
  const [estado, acao, enviando] = useAcao<Estado>(acaoAbrirTurno);
  const livres = caixas.filter((c) => !c.ocupado_por);

  if (!livres.length) {
    return (
      <Cartao>
        <p>Todos os caixas estão com turno aberto: {caixas.map((c) => `${c.nome} (${c.ocupado_por})`).join(", ")}.</p>
      </Cartao>
    );
  }

  return (
    <form onSubmit={acao} className="space-y-4">
      <Cartao>
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
          <div>
            <Rotulo htmlFor="caixaId">Caixa</Rotulo>
            <Selecao id="caixaId" name="caixaId">
              {livres.map((c) => (
                <option key={c.id} value={c.id}>{c.nome}</option>
              ))}
            </Selecao>
          </div>
          <div>
            <Rotulo htmlFor="fundo">Fundo de troco (R$)</Rotulo>
            <Campo id="fundo" name="fundo" numerico inputMode="decimal" defaultValue="0,00" autoFocus />
          </div>
        </div>
      </Cartao>

      <Cartao titulo="Encerrantes iniciais">
        <Tabela rotulo="Encerrantes iniciais por bico">
          <thead>
            <tr><th>Bico</th><th>Bomba</th><th>Combustível</th><th className="text-right!">Último fechamento</th><th className="w-48 text-right!">Encerrante agora</th></tr>
          </thead>
          <tbody>
            {bicos.map((b) => (
              <tr key={b.id}>
                <td className="font-semibold">{String(b.numero).padStart(2, "0")}</td>
                <td>{b.bomba}</td>
                <td>{b.combustivel}</td>
                <td className="num text-right text-text-muted">{b.ultimo_final ? tresCasas(b.ultimo_final) : "primeiro turno"}</td>
                <td>
                  <label className="sr-only" htmlFor={`inicial-${b.id}`}>Encerrante inicial do bico {b.numero}</label>
                  <Campo
                    id={`inicial-${b.id}`}
                    name={`inicial:${b.id}`}
                    numerico
                    inputMode="decimal"
                    required
                    defaultValue={b.ultimo_final ? tresCasas(b.ultimo_final) : ""}
                    placeholder="0,000"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Cartao>

      <MensagemErro>{estado.erro}</MensagemErro>
      <Botao type="submit" tamanho="normal" carregando={enviando}>Abrir turno</Botao>
    </form>
  );
}
