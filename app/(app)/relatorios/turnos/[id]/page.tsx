import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resumoDoTurno, TIPOS_MOVIMENTO } from "@/lib/data/caixa";
import { porFrentista, trocasDoTurno, vendasDoTurno } from "@/lib/data/vendas";
import Link from "next/link";
import { exigirUsuario } from "@/lib/session";
import { dataBR, horaBR, reais, reaisComSinal, tresCasas } from "@/lib/format";
import { Cartao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { BotaoImprimir } from "@/components/botao-imprimir";

export const metadata: Metadata = { title: "Relatório do turno" };
export const dynamic = "force-dynamic";

export default async function RelatorioTurno({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fechado?: string }> }) {
  const usuario = await exigirUsuario("relatorio.ver");
  const { id } = await params;
  const { fechado } = await searchParams;
  const r = await resumoDoTurno(usuario.empresaId, id);
  if (!r) notFound();
  const [vendas, trocas, frentistas] = await Promise.all([vendasDoTurno(usuario.empresaId, id), trocasDoTurno(usuario.empresaId, id), porFrentista(usuario.empresaId, id)]);
  const canceladas = vendas.filter((v) => v.status === "cancelada");
  const t = r.turno;

  return (
    <>
      {fechado ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Turno fechado.</p> : null}
      <TituloPagina
        titulo={`Turno de ${t.operador} · ${t.caixa_nome}`}
        descricao={`${dataBR(t.data_trabalho + "T12:00:00")} · aberto às ${horaBR(t.aberto_em)}${t.fechado_em ? ` · fechado às ${horaBR(t.fechado_em)}` : ""}`}
        acoes={<><Link href={`/relatorios/turnos/${t.id}/cupom`} className="inline-flex h-control-compacto items-center rounded-md border border-border-input px-4 font-semibold hover:bg-surface print:hidden">Versão 80 mm</Link><BotaoImprimir /></>}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Cartao titulo={`Vendas (${vendas.length - canceladas.length})`}>
          {vendas.length ? (
            <Tabela rotulo="Vendas do turno">
              <thead><tr><th>Hora</th><th>Itens</th><th>Pagamento</th><th className="text-right!">Total</th></tr></thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id} className={v.status === "cancelada" ? "text-text-muted line-through" : ""}>
                    <td className="num">{horaBR(v.criada_em)}{v.criada_offline ? <span className="ml-1 no-underline"><Selo tom="aviso">offline</Selo></span> : null}</td>
                    <td className="max-w-80 truncate whitespace-normal!">{v.itens}</td>
                    <td>{v.pagamentos.map((p) => p.forma).join(" + ")}</td>
                    <td className="num text-right">{reais(v.total_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma venda neste turno.</Vazio>
          )}
        </Cartao>

        <Cartao titulo="Por frentista">
          {frentistas.length ? (
            <Tabela rotulo="Vendas por frentista">
              <thead><tr><th>Frentista</th><th className="text-right!">Vendas</th><th className="text-right!">Litros</th><th className="text-right!">Total</th></tr></thead>
              <tbody>
                {frentistas.map((f) => (
                  <tr key={f.frentista}><td>{f.frentista}</td><td className="num text-right">{f.vendas}</td><td className="num text-right">{tresCasas(f.litros)}</td><td className="num text-right">{reais(f.total_centavos)}</td></tr>
                ))}
              </tbody>
            </Tabela>
          ) : <Vazio>Nenhuma venda.</Vazio>}
        </Cartao>

        <Cartao titulo="Cancelamentos e trocas de pagamento">
          {canceladas.length || trocas.length ? (
            <ul className="space-y-2 text-sm">
              {canceladas.map((v) => (
                <li key={v.id}><Selo tom="perigo">Cancelada</Selo> <span className="num">{horaBR(v.criada_em)}</span> · {reais(v.total_centavos)} · por {v.cancelada_por}: {v.motivo_cancelamento}</li>
              ))}
              {trocas.map((x) => (
                <li key={x.id}><Selo tom="aviso">Troca</Selo> <span className="num">{horaBR(x.created_at)}</span> · {reais(x.valor_centavos)} de {x.de} para {x.para} · por {x.usuario}: {x.motivo}</li>
              ))}
            </ul>
          ) : <Vazio>Nenhum cancelamento nem troca.</Vazio>}
        </Cartao>

        <Cartao titulo="Sangrias, suprimentos e despesas">
          {r.movimentos.length ? (
            <Tabela rotulo="Movimentos de caixa">
              <thead><tr><th>Hora</th><th>Tipo</th><th>Motivo</th><th>Por</th><th className="text-right!">Valor</th></tr></thead>
              <tbody>
                {r.movimentos.map((m) => (
                  <tr key={m.id}>
                    <td className="num">{horaBR(m.created_at)}</td>
                    <td>{TIPOS_MOVIMENTO[m.tipo].split(" (")[0]}</td>
                    <td className="max-w-64 truncate whitespace-normal!">{m.motivo}</td>
                    <td>{m.usuario}</td>
                    <td className="num text-right">{(m.tipo === "sangria" || m.tipo === "despesa" ? "- " : "+ ") + reais(m.valor_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhum movimento de caixa.</Vazio>
          )}
        </Cartao>
      </div>
    </>
  );
}
