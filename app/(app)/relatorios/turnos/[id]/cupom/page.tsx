import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resumoDoTurno, TIPOS_MOVIMENTO } from "@/lib/data/caixa";
import { buscarEmpresa } from "@/lib/data/cadastros";
import { vendasDoTurno } from "@/lib/data/vendas";
import { exigirUsuario } from "@/lib/session";
import { dataBR, horaBR, reais, reaisComSinal, tresCasas } from "@/lib/format";
import { BotaoImprimir } from "@/components/botao-imprimir";

export const metadata: Metadata = { title: "Fechamento (80 mm)" };
export const dynamic = "force-dynamic";

/** Resumo do fechamento para impressora térmica de 80 mm (comprovante não fiscal). */
export default async function Cupom({ params }: { params: Promise<{ id: string }> }) {
  const u = await exigirUsuario("relatorio.ver");
  const { id } = await params;
  const r = await resumoDoTurno(u.empresaId, id);
  if (!r) notFound();
  const [empresa, vendas] = await Promise.all([buscarEmpresa(u.empresaId), vendasDoTurno(u.empresaId, id)]);
  const t = r.turno;
  const canceladas = vendas.filter((v) => v.status === "cancelada");
  const Linha = ({ a, b, forte }: { a: string; b: string; forte?: boolean }) => (
    <div className={`flex justify-between gap-2 ${forte ? "font-bold" : ""}`}><span>{a}</span><span className="num">{b}</span></div>
  );
  return (
    <div className="mx-auto">
      <div className="mb-4 print:hidden"><BotaoImprimir /></div>
      <style>{`@media print { @page { size: 80mm auto; margin: 3mm; } }`}</style>
      <article className="w-[72mm] bg-bg p-2 font-mono text-[11px] leading-tight text-text">
        <p className="text-center font-bold">{empresa.nome_fantasia}</p>
        <p className="text-center">CNPJ {empresa.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}</p>
        <p className="my-1 text-center font-bold">FECHAMENTO DE TURNO</p>
        <p className="text-center">NÃO É DOCUMENTO FISCAL</p>
        <hr className="my-1 border-dashed border-text" />
        <Linha a="Caixa" b={t.caixa_nome} />
        <Linha a="Operador" b={t.operador} />
        <Linha a="Data" b={dataBR(t.data_trabalho + "T12:00:00")} />
        <Linha a="Abertura" b={horaBR(t.aberto_em)} />
        <Linha a="Fechamento" b={t.fechado_em ? horaBR(t.fechado_em) : "ABERTO"} />
        <hr className="my-1 border-dashed border-text" />
        <p className="font-bold">ENCERRANTES</p>
        {r.bicos.map((b) => (
          <div key={b.bico_id}>
            <Linha a={`Bico ${String(b.numero).padStart(2, "0")} ${b.combustivel.slice(0, 14)}`} b={`${b.litros_encerrante === null ? "-" : tresCasas(b.litros_encerrante)} L`} />
            <div className="flex justify-between pl-2 text-[10px]"><span>{tresCasas(b.inicial)} → {b.final === null ? "-" : tresCasas(b.final)}{b.virou ? " (zerou)" : ""}</span><span>dif {b.diferenca_litros === null ? "-" : tresCasas(b.diferenca_litros)}</span></div>
          </div>
        ))}
        <Linha a="Litros vendidos" b={tresCasas(r.totais.litros_vendidos)} forte />
        <hr className="my-1 border-dashed border-text" />
        <p className="font-bold">CAIXA (esperado / contado)</p>
        <Linha a="Fundo de troco" b={reais(t.fundo_troco_centavos)} />
        {r.formas.map((f) => (
          <div key={f.forma_id}>
            <Linha a={f.nome} b={reais(f.esperado_centavos)} />
            {f.informado_centavos !== null ? <div className="flex justify-between pl-2 text-[10px]"><span>contado {reais(f.informado_centavos)}</span><span>{reaisComSinal(f.diferenca_centavos ?? 0)}</span></div> : null}
          </div>
        ))}
        <Linha a="Vendas" b={reais(r.totais.vendas_centavos)} forte />
        {r.totais.diferenca_centavos !== null ? <Linha a="DIFERENÇA" b={reaisComSinal(r.totais.diferenca_centavos)} forte /> : null}
        {r.movimentos.length ? (
          <>
            <hr className="my-1 border-dashed border-text" />
            <p className="font-bold">MOVIMENTOS</p>
            {r.movimentos.map((m) => <Linha key={m.id} a={`${horaBR(m.created_at)} ${TIPOS_MOVIMENTO[m.tipo].split(" (")[0]}`} b={reais(m.valor_centavos)} />)}
          </>
        ) : null}
        <hr className="my-1 border-dashed border-text" />
        <Linha a="Vendas" b={String(vendas.length - canceladas.length)} />
        <Linha a="Canceladas" b={String(canceladas.length)} />
        {t.observacao_fechamento ? <p className="mt-1">Obs.: {t.observacao_fechamento}</p> : null}
        <p className="mt-6 text-center">______________________________</p>
        <p className="text-center">{t.operador}</p>
        <p className="mt-4 text-center">______________________________</p>
        <p className="text-center">Conferido por</p>
      </article>
    </div>
  );
}
