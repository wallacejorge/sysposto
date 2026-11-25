import type { Metadata } from "next";
import Link from "next/link";
import { formasDePagamento, turnoAbertoDo } from "@/lib/data/caixa";
import { vendasDoTurno } from "@/lib/data/vendas";
import { exigirUsuario } from "@/lib/session";
import { horaBR, reais } from "@/lib/format";
import { botaoClasses, Cartao, Selo, TituloPagina, Vazio } from "@/components/ui";
import { AcoesVenda } from "./acoes-venda";

export const metadata: Metadata = { title: "Vendas do turno" };
export const dynamic = "force-dynamic";

export default async function VendasDoTurno() {
  const u = await exigirUsuario("caixa.operar");
  const turno = await turnoAbertoDo(u);
  if (!turno) {
    return (
      <>
        <TituloPagina titulo="Vendas do turno" />
        <Cartao><p className="mb-3">Você não tem turno aberto.</p><Link href="/caixa/abrir" className={botaoClasses("primario")}>Abrir turno</Link></Cartao>
      </>
    );
  }
  const [vendas, formas] = await Promise.all([vendasDoTurno(u.empresaId, turno.id), formasDePagamento(u.empresaId)]);
  const concluidas = vendas.filter((v) => v.status === "concluida");
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/caixa" className="text-accent hover:underline">‹ Voltar ao caixa</Link></p>
      <TituloPagina
        titulo="Vendas do turno"
        descricao={`${turno.caixa_nome} · ${turno.operador} · ${concluidas.length} vendas · ${reais(concluidas.reduce((s, v) => s + v.total_centavos, 0))}`}
      />
      {vendas.length ? (
        <ul className="space-y-3">
          {vendas.map((v) => (
            <li key={v.id}>
              <Cartao>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      <span className="num">{horaBR(v.criada_em)}</span> · <span className="num">{reais(v.total_centavos)}</span>
                      {v.status === "cancelada" ? <span className="ml-2"><Selo tom="perigo">Cancelada</Selo></span> : null}
                      {v.criada_offline ? <span className="ml-2"><Selo tom="aviso">feita sem internet</Selo></span> : null}
                    </p>
                    <p className="text-text-muted">{v.itens}</p>
                    <p className="text-sm">
                      {v.pagamentos.map((p) => `${p.forma} ${reais(p.valor_centavos)}${p.troco_centavos ? ` (troco ${reais(p.troco_centavos)})` : ""}`).join(" + ")}
                      {v.frentista ? ` · frentista ${v.frentista}` : ""}
                    </p>
                    {v.status === "cancelada" ? <p className="text-sm text-text-muted">Cancelada por {v.cancelada_por}: {v.motivo_cancelamento}</p> : null}
                  </div>
                  {v.status === "concluida" ? (
                    <AcoesVenda venda={v} formas={formas} podeCancelar={Boolean(u.permissoes["venda.cancelar"])} />
                  ) : null}
                </div>
              </Cartao>
            </li>
          ))}
        </ul>
      ) : (
        <Vazio>Nenhuma venda neste turno ainda.</Vazio>
      )}
    </>
  );
}
