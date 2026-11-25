import type { Metadata } from "next";
import Link from "next/link";
import { listarTurnos } from "@/lib/data/caixa";
import { exigirUsuario } from "@/lib/session";
import { dataBR, horaBR } from "@/lib/format";
import { Cartao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";

export const metadata: Metadata = { title: "Turnos" };
export const dynamic = "force-dynamic";

export default async function ListaTurnos() {
  const usuario = await exigirUsuario("relatorio.ver");
  const turnos = await listarTurnos(usuario.empresaId);
  return (
    <>
      <TituloPagina titulo="Turnos" descricao="Os 50 turnos mais recentes. Clique para ver o relatório." />
      <Cartao>
        {turnos.length ? (
          <Tabela rotulo="Turnos">
            <thead>
              <tr><th>Data</th><th>Caixa</th><th>Operador</th><th>Abertura</th><th>Fechamento</th><th>Situação</th><th /></tr>
            </thead>
            <tbody>
              {turnos.map((t) => (
                <tr key={t.id}>
                  <td>{dataBR(t.data_trabalho + "T12:00:00")}</td>
                  <td>{t.caixa_nome}</td>
                  <td>{t.operador}</td>
                  <td className="num">{horaBR(t.aberto_em)}</td>
                  <td className="num">{t.fechado_em ? horaBR(t.fechado_em) : "—"}</td>
                  <td>{t.status === "fechado" ? <Selo>Fechado</Selo> : t.status === "reaberto" ? <Selo tom="aviso">Reaberto</Selo> : <Selo tom="sucesso">Aberto</Selo>}</td>
                  <td><Link href={`/relatorios/turnos/${t.id}`} className="font-semibold text-accent hover:underline">Ver relatório</Link></td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        ) : (
          <Vazio>Nenhum turno ainda. O primeiro aparece aqui quando alguém abrir o caixa.</Vazio>
        )}
      </Cartao>
    </>
  );
}
