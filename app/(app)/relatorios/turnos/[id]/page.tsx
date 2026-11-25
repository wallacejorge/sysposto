import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resumoDoTurno, TIPOS_MOVIMENTO } from "@/lib/data/caixa";
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
  const t = r.turno;

  return (
    <>
      {fechado ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Turno fechado.</p> : null}
      <TituloPagina
        titulo={`Turno de ${t.operador} · ${t.caixa_nome}`}
        descricao={`${dataBR(t.data_trabalho + "T12:00:00")} · aberto às ${horaBR(t.aberto_em)}${t.fechado_em ? ` · fechado às ${horaBR(t.fechado_em)}` : ""}`}
        acoes={<BotaoImprimir />}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Cartao titulo="Vendas"><p className="num text-xl font-bold">{reais(r.totais.vendas_centavos)}</p><p className="text-text-muted">{r.vendas.filter((v) => v.status === "concluida").length} vendas</p></Cartao>
        <Cartao titulo="Litros vendidos"><p className="num text-xl font-bold">{tresCasas(r.totais.litros_vendidos)}</p></Cartao>
        <Cartao titulo="Diferença do caixa">
          {r.totais.diferenca_centavos === null ? (
            <p className="text-text-muted">Turno ainda aberto.</p>
          ) : (
            <p className="num text-xl font-bold">
              <Selo tom={r.totais.diferenca_centavos === 0 ? "sucesso" : r.totais.diferenca_centavos < 0 ? "perigo" : "aviso"}>{reaisComSinal(r.totais.diferenca_centavos)}</Selo>
            </p>
          )}
        </Cartao>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Cartao titulo="Conferência por forma de pagamento">
          <Tabela rotulo="Conferência por forma de pagamento">
            <thead><tr><th>Forma</th><th className="text-right!">Vendas</th><th className="text-right!">Esperado</th><th className="text-right!">Contado</th><th className="text-right!">Diferença</th></tr></thead>
            <tbody>
              {r.formas.map((f) => (
                <tr key={f.forma_id}>
                  <td>{f.nome}</td>
                  <td className="num text-right">{reais(f.vendas_centavos)}</td>
                  <td className="num text-right">{reais(f.esperado_centavos)}</td>
                  <td className="num text-right">{f.informado_centavos === null ? "—" : reais(f.informado_centavos)}</td>
                  <td className="num text-right">{f.diferenca_centavos === null ? "—" : reaisComSinal(f.diferenca_centavos)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num text-right">{reais(r.totais.vendas_centavos)}</td>
                <td className="num text-right">{reais(r.totais.esperado_centavos)}</td>
                <td className="num text-right">{r.totais.informado_centavos === null ? "—" : reais(r.totais.informado_centavos)}</td>
                <td className="num text-right">{r.totais.diferenca_centavos === null ? "—" : reaisComSinal(r.totais.diferenca_centavos)}</td>
              </tr>
            </tfoot>
          </Tabela>
          {t.observacao_fechamento ? <p className="mt-3"><b>Observação:</b> {t.observacao_fechamento}</p> : null}
        </Cartao>

        <Cartao titulo="Encerrantes" className="xl:col-span-2">
          <Tabela rotulo="Encerrantes por bico">
            <thead><tr><th>Bico</th><th>Combustível</th><th className="text-right!">Inicial</th><th className="text-right!">Final</th><th className="text-right!">Litros</th><th className="text-right!">Vendidos</th><th className="text-right!">Diferença</th></tr></thead>
            <tbody>
              {r.bicos.map((b) => (
                <tr key={b.bico_id}>
                  <td className="font-semibold">{String(b.numero).padStart(2, "0")}</td>
                  <td>{b.combustivel}</td>
                  <td className="num text-right">{tresCasas(b.inicial)}</td>
                  <td className="num text-right">{b.final === null ? "—" : tresCasas(b.final)}{b.virou ? <span className="ml-1"><Selo tom="aviso">zerou</Selo></span> : null}</td>
                  <td className="num text-right">{b.litros_encerrante === null ? "—" : tresCasas(b.litros_encerrante)}</td>
                  <td className="num text-right">{tresCasas(b.litros_vendidos)}</td>
                  <td className="text-right">{b.diferenca_litros === null ? "—" : Number(b.diferenca_litros) === 0 ? <Selo tom="sucesso">OK</Selo> : <Selo tom="aviso">{tresCasas(b.diferenca_litros)} L</Selo>}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        </Cartao>

        <Cartao titulo="Vendas">
          {r.vendas.length ? (
            <Tabela rotulo="Vendas do turno">
              <thead><tr><th>Hora</th><th>Itens</th><th>Pagamento</th><th className="text-right!">Total</th></tr></thead>
              <tbody>
                {r.vendas.map((v) => (
                  <tr key={v.id}>
                    <td className="num">{horaBR(v.criada_em)}</td>
                    <td>{v.itens}</td>
                    <td>{v.forma}</td>
                    <td className="num text-right">{v.status === "cancelada" ? <Selo>Cancelada</Selo> : reais(v.total_centavos)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma venda neste turno.</Vazio>
          )}
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
