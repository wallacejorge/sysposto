"use client";

import { useEffect, useState } from "react";
import { enviarFila, listarFila } from "@/lib/fila";
import { useAcao } from "@/components/use-acao";
import { Botao, Campo, Cartao, MensagemErro, Rotulo, Selo, Tabela } from "@/components/ui";
import type { Resumo } from "@/lib/data/caixa";
import { lerReais, lerTresCasas, reais, reaisComSinal, tresCasas } from "@/lib/format";
import { acaoFecharTurno, type Estado } from "../actions";

export function FormFechar({ resumo, pendentes, limite, operadorId }: { resumo: Resumo; pendentes: number; limite: number; operadorId: string }) {
  // Vendas feitas sem internet e ainda não enviadas mudariam o caixa: o fechamento espera por elas.
  const [naFila, setNaFila] = useState(0);
  useEffect(() => {
    let vivo = true;
    void enviarFila(operadorId).then(() => listarFila(operadorId)).then((f) => vivo && setNaFila(f.length)).catch(() => {});
    return () => { vivo = false; };
  }, [operadorId]);
  const [estado, acao, enviando] = useAcao<Estado>(acaoFecharTurno);
  const [finais, setFinais] = useState<Record<string, string>>({});
  const [viradas, setViradas] = useState<Record<string, boolean>>({});
  const [contados, setContados] = useState<Record<string, string>>({});

  function litros(bicoId: string, inicial: string): number | null {
    const f = lerTresCasas(finais[bicoId] ?? "");
    if (f === null) return null;
    const ini = Number(inicial);
    if (viradas[bicoId]) return null; // calculado no servidor com o máximo do totalizador
    return Number(f) - ini;
  }

  const diferencas = resumo.formas.map((f) => {
    const c = contados[f.forma_id];
    const v = c === undefined || c === "" ? null : lerReais(c);
    return v === null ? null : v - f.esperado_centavos;
  });
  const maior = Math.max(0, ...diferencas.map((d) => Math.abs(d ?? 0)));
  const precisaJustificar = maior > limite;

  return (
    <form onSubmit={acao} className="space-y-4">
      <input type="hidden" name="turnoId" value={resumo.turno.id} />

      {naFila > 0 ? (
        <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 font-semibold text-on-danger-bg">
          Há {naFila} operação(ões) feitas sem internet que ainda não chegaram ao sistema. Volte ao caixa e espere a conexão para enviá-las antes de fechar.
        </p>
      ) : null}
      {pendentes > 0 ? (
        <p role="status" className="rounded-md bg-warning-bg px-3 py-2 font-medium text-on-warning-bg">
          Há {pendentes} abastecimento(s) sem venda registrada. Registre antes de fechar, ou eles ficam para o próximo turno e a conferência de litros vai mostrar diferença.
        </p>
      ) : null}

      <Cartao titulo="Encerrantes">
        <Tabela rotulo="Encerrantes finais por bico">
          <thead>
            <tr>
              <th>Bico</th><th>Combustível</th><th className="text-right!">Inicial</th><th className="w-44 text-right!">Final</th>
              <th>Virou?</th><th className="text-right!">Litros (encerrante)</th><th className="text-right!">Litros vendidos</th><th className="text-right!">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {resumo.bicos.map((b) => {
              const l = litros(b.bico_id, b.inicial);
              const dif = l === null ? null : l - Number(b.litros_vendidos);
              return (
                <tr key={b.bico_id}>
                  <td className="font-semibold">{String(b.numero).padStart(2, "0")}</td>
                  <td>{b.combustivel}</td>
                  <td className="num text-right">{tresCasas(b.inicial)}</td>
                  <td>
                    <label className="sr-only" htmlFor={`final-${b.bico_id}`}>Encerrante final do bico {b.numero}</label>
                    <Campo id={`final-${b.bico_id}`} name={`final:${b.bico_id}`} numerico inputMode="decimal" required placeholder={b.ultimo_lancado ? tresCasas(b.ultimo_lancado) : "0,000"}
                      aria-describedby={b.ultimo_lancado ? `ult-${b.bico_id}` : undefined}
                      value={finais[b.bico_id] ?? ""} onChange={(e) => setFinais({ ...finais, [b.bico_id]: e.target.value })} />
                    {b.ultimo_lancado ? <p id={`ult-${b.bico_id}`} className="mt-0.5 text-right text-xs text-text-muted">último lançado: {tresCasas(b.ultimo_lancado)}</p> : null}
                  </td>
                  <td>
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name={`virou:${b.bico_id}`} checked={!!viradas[b.bico_id]} onChange={(e) => setViradas({ ...viradas, [b.bico_id]: e.target.checked })} />
                      <span>zerou</span>
                    </label>
                  </td>
                  <td className="num text-right text-on-readonly">{l === null ? "—" : tresCasas(l)}</td>
                  <td className="num text-right">{tresCasas(b.litros_vendidos)}</td>
                  <td className="text-right">
                    {dif === null ? "—" : Math.abs(dif) < 0.0005 ? <Selo tom="sucesso">OK</Selo> : <Selo tom="aviso">{tresCasas(dif)} L</Selo>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabela>
        <p className="mt-2 text-xs text-text-muted">
          Diferença de litros = o que a bomba marcou menos o que virou venda. Com a automação das bombas, ela deve ser zero.
        </p>
      </Cartao>

      <Cartao titulo="Conferência do caixa">
        <Tabela rotulo="Conferência por forma de pagamento">
          <thead>
            <tr><th>Forma de pagamento</th><th className="text-right!">Vendas</th><th className="text-right!">Esperado</th><th className="w-44 text-right!">Contado</th><th className="text-right!">Diferença</th></tr>
          </thead>
          <tbody>
            {resumo.formas.map((f, i) => (
              <tr key={f.forma_id}>
                <td>{f.nome}</td>
                <td className="num text-right">{reais(f.vendas_centavos)}</td>
                <td className="num text-right text-on-readonly">{reais(f.esperado_centavos)}</td>
                <td>
                  <label className="sr-only" htmlFor={`contado-${f.forma_id}`}>Valor contado em {f.nome}</label>
                  <Campo id={`contado-${f.forma_id}`} name={`contado:${f.forma_id}`} numerico inputMode="decimal" required placeholder="0,00"
                    value={contados[f.forma_id] ?? ""} onChange={(e) => setContados({ ...contados, [f.forma_id]: e.target.value })} />
                </td>
                <td className="text-right">
                  {diferencas[i] === null ? "—" : diferencas[i] === 0 ? <Selo tom="sucesso">OK</Selo> : <Selo tom={diferencas[i]! < 0 ? "perigo" : "aviso"}>{reaisComSinal(diferencas[i]!)}</Selo>}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabela>
        <p className="mt-2 text-xs text-text-muted">
          Esperado em dinheiro = fundo de troco {reais(resumo.turno.fundo_troco_centavos)} + vendas em dinheiro (já descontado o troco) + suprimentos − sangrias − despesas.
        </p>
      </Cartao>

      <Cartao>
        <Rotulo htmlFor="justificativa">Observação {precisaJustificar ? "(obrigatória: há diferença acima de " + reais(limite) + ")" : "(opcional)"}</Rotulo>
        <textarea id="justificativa" name="justificativa" rows={3} required={precisaJustificar} minLength={precisaJustificar ? 10 : undefined}
          className="w-full rounded-sm border border-border-input bg-bg p-2" />
      </Cartao>

      <MensagemErro>{estado.erro}</MensagemErro>
      <Botao type="submit" tamanho="normal" carregando={enviando} disabled={naFila > 0}>Fechar turno</Botao>
    </form>
  );
}
