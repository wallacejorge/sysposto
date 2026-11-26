import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buscarMercadoria, historicoPrecos, listarGrupos, listarTiposPreco, listarTributacoes, listarUnidades } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { precoLitro } from "@/lib/format";
import { CampoSelecao, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, Selo, Tabela, TituloPagina, Vazio } from "@/components/ui";
import { acaoCancelarPreco, acaoPreco } from "../../actions";
import { FormMercadoria } from "../form-mercadoria";

export const metadata: Metadata = { title: "Mercadoria" };
export const dynamic = "force-dynamic";

const fmt = (d: string) => new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const SITUACAO = {
  vigente: <Selo tom="sucesso">Valendo</Selo>,
  agendado: <Selo tom="info">Agendado</Selo>,
  substituido: <Selo>Substituído</Selo>,
  promocao_encerrada: <Selo>Promoção encerrada</Selo>,
};

export default async function EditarMercadoria({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { id } = await params;
  const { salvo } = await searchParams;
  const m = await buscarMercadoria(u.empresaId, id);
  if (!m) notFound();
  const [grupos, unidades, tipos, historico, tributacoes] = await Promise.all([
    listarGrupos(u.empresaId), listarUnidades(), listarTiposPreco(u.empresaId), historicoPrecos(u.empresaId, id), listarTributacoes(u.empresaId),
  ]);
  const podePreco = Boolean(u.permissoes["preco.alterar"]);
  const vigentes = historico.filter((h) => h.situacao === "vigente");

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/cadastros/mercadorias" className="text-accent hover:underline">‹ Mercadorias</Link></p>
      {salvo ? <p role="status" className="mb-4 rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">Cadastro salvo.</p> : null}
      <TituloPagina titulo={m.nome} descricao={`Código ${m.codigo}`} />

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <FormMercadoria m={m} grupos={grupos} unidades={unidades} tributacoes={tributacoes} />

        <div className="space-y-4">
          <Cartao titulo="Preço agora">
            {vigentes.length ? (
              <ul className="space-y-1">
                {vigentes.map((v) => (
                  <li key={v.id} className="flex items-baseline justify-between gap-2">
                    <span>{v.tipo_preco}{v.promocional_ate ? <span className="ml-2"><Selo tom="aviso">promoção até {fmt(v.promocional_ate)}</Selo></span> : null}</span>
                    <span className="num text-lg font-bold">{precoLitro(v.preco)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Vazio>Sem preço. Esta mercadoria não pode ser vendida até ter um preço.</Vazio>
            )}
          </Cartao>

          {podePreco ? (
            <Cartao titulo="Alterar preço">
              <FormAcao acao={acaoPreco} rotulo="Aplicar preço">
                <input type="hidden" name="mercadoria_id" value={m.id} />
                <div className="space-y-4">
                  <Grade colunas={2}>
                    <CampoSelecao nome="tipo_preco_id" rotulo="Tipo de preço" valor={tipos.find((t) => t.padrao)?.id} obrigatorio>
                      {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </CampoSelecao>
                    <CampoTexto nome="preco" rotulo="Novo preço (R$)" obrigatorio numerico inputMode="decimal" placeholder="0,000" dica="Até 3 casas, como na bomba." />
                  </Grade>
                  <fieldset>
                    <legend className="mb-1 text-xs font-semibold text-text-muted">Quando começa</legend>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2"><input type="radio" name="quando" value="agora" defaultChecked /> Agora</label>
                      <label className="flex items-center gap-2"><input type="radio" name="quando" value="agendar" /> Agendar para:</label>
                    </div>
                  </fieldset>
                  <Grade colunas={2}>
                    <CampoTexto nome="a_partir_de" rotulo="Início (se agendado)" type="datetime-local" />
                    <CampoTexto nome="promocional_ate" rotulo="Promoção até (opcional)" type="datetime-local" dica="Depois dessa data, volta o preço anterior." />
                  </Grade>
                  <p className="text-xs text-text-muted">A venda guarda o preço do momento. Mudar o preço não altera abastecimentos já feitos.</p>
                </div>
              </FormAcao>
            </Cartao>
          ) : null}

          <Cartao titulo="Histórico de preços">
            {historico.length ? (
              <Tabela rotulo="Histórico de preços">
                <thead><tr><th>Desde</th><th>Tipo</th><th className="text-right!">Preço</th><th>Por</th><th>Situação</th></tr></thead>
                <tbody>
                  {historico.map((h) => (
                    <tr key={h.id}>
                      <td className="num">{fmt(h.vigente_desde)}{h.promocional_ate ? <div className="text-xs text-text-muted">até {fmt(h.promocional_ate)}</div> : null}</td>
                      <td>{h.tipo_preco}</td>
                      <td className="num text-right">{precoLitro(h.preco)}</td>
                      <td>{h.alterado_por ?? "—"}</td>
                      <td>
                        {SITUACAO[h.situacao]}
                        {h.situacao === "agendado" && podePreco ? (
                          <FormAcao acao={acaoCancelarPreco} rotulo="Cancelar" variante="secundario" className="mt-1 [&>div]:mt-1">
                            <input type="hidden" name="preco_id" value={h.id} />
                            <input type="hidden" name="mercadoria_id" value={m.id} />
                          </FormAcao>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            ) : (
              <Vazio>Nenhum preço registrado.</Vazio>
            )}
          </Cartao>
        </div>
      </div>
    </>
  );
}
