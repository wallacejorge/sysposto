import Link from "next/link";
import { painelDoDia } from "@/lib/data/caixa";
import { exigirUsuario } from "@/lib/session";
import { dataBR, horaBR, reais, reaisComSinal, tresCasas } from "@/lib/format";
import { botaoClasses, Cartao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Painel() {
  const usuario = await exigirUsuario();
  const p = await painelDoDia(usuario.empresaId);

  return (
    <>
      <TituloPagina
        titulo={`Olá, ${usuario.apelido}`}
        descricao={`Resumo de ${dataBR(p.hoje + "T12:00:00")}`}
        acoes={
          usuario.permissoes["caixa.operar"] ? (
            <Link href="/caixa" className={botaoClasses("primario", "normal")}>
              Ir para o caixa
            </Link>
          ) : null
        }
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Cartao titulo="Vendido hoje">
          <p className="num text-xl font-bold text-on-total">{reais(p.total)}</p>
          <p className="text-text-muted">{p.vendas} {p.vendas === 1 ? "venda" : "vendas"}</p>
        </Cartao>
        <Cartao titulo="Abastecimentos para registrar">
          <p className="num text-xl font-bold">{p.pendentes}</p>
          <p className="text-text-muted">{p.pendentes ? "Aguardando o caixa registrar a venda." : "Nada pendente."}</p>
        </Cartao>
        <Cartao titulo="Turnos abertos">
          {p.abertos.length ? (
            <ul className="space-y-1">
              {p.abertos.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2">
                  <Selo tom="sucesso">{t.caixa}</Selo> {t.operador} <span className="text-text-muted">desde {horaBR(t.aberto_em)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">Nenhum turno aberto.</p>
          )}
        </Cartao>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Combustível vendido hoje">
          {p.porCombustivel.length ? (
            <Tabela rotulo="Combustível vendido hoje">
              <thead>
                <tr><th>Combustível</th><th className="text-right!">Litros</th><th className="text-right!">Valor</th></tr>
              </thead>
              <tbody>
                {p.porCombustivel.map((c) => (
                  <tr key={c.combustivel}>
                    <td>{c.combustivel}</td>
                    <td className="num text-right">{tresCasas(c.litros)}</td>
                    <td className="num text-right">{reais(c.total)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma venda de combustível hoje ainda.</Vazio>
          )}
        </Cartao>
        <Cartao titulo="Diferenças de caixa (últimos 7 dias)">
          {p.diferencas.length ? (
            <Tabela rotulo="Diferenças de caixa">
              <thead>
                <tr><th>Data</th><th>Operador</th><th className="text-right!">Diferença</th><th /></tr>
              </thead>
              <tbody>
                {p.diferencas.map((d) => (
                  <tr key={d.id}>
                    <td>{d.data}</td>
                    <td>{d.operador}</td>
                    <td className="text-right"><Selo tom={d.diferenca < 0 ? "perigo" : "aviso"}>{reaisComSinal(d.diferenca)}</Selo></td>
                    <td><Link className="text-accent hover:underline" href={`/relatorios/turnos/${d.id}`}>ver turno</Link></td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          ) : (
            <Vazio>Nenhuma diferença nos fechamentos recentes.</Vazio>
          )}
        </Cartao>
      </div>
    </>
  );
}
