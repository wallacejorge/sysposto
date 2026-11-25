import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { estruturaDoPosto, listarMercadorias } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { tresCasas } from "@/lib/format";
import { CampoMarcar, CampoSelecao, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, TituloPagina } from "@/components/ui";
import { acaoBico, acaoBomba, acaoTanque } from "../../../actions";

export const metadata: Metadata = { title: "Bombas, bicos e tanques" };
export const dynamic = "force-dynamic";

export default async function EditarEstrutura({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { tipo, id } = await params;
  if (tipo !== "tanque" && tipo !== "bomba" && tipo !== "bico") notFound();
  const novo = id === "novo";
  const e = await estruturaDoPosto(u.empresaId);
  const proximo = (ns: number[]) => (ns.length ? Math.max(...ns) + 1 : 1);
  const voltar = <p className="mb-2 text-sm"><Link href="/cadastros/bicos" className="text-accent hover:underline">‹ Bombas, bicos e tanques</Link></p>;

  if (tipo === "tanque") {
    const t = novo ? null : e.tanques.find((x) => x.id === id);
    if (!novo && !t) notFound();
    const combustiveis = await listarMercadorias(u.empresaId, { tipo: "combustivel" });
    return (
      <>
        {voltar}
        <TituloPagina titulo={t ? `Tanque ${t.numero}` : "Novo tanque"} />
        <Cartao className="max-w-2xl">
          <FormAcao acao={acaoTanque} rotulo={t ? "Salvar" : "Cadastrar"}>
            {t ? <input type="hidden" name="id" value={t.id} /> : null}
            <div className="space-y-4">
              <Grade colunas={2}>
                <CampoTexto nome="numero" rotulo="Número" valor={t?.numero ?? proximo(e.tanques.map((x) => x.numero))} obrigatorio inputMode="numeric" />
                <CampoSelecao nome="mercadoria_id" rotulo="Combustível" valor={t?.mercadoria_id} obrigatorio>
                  <option value="">Escolha…</option>
                  {combustiveis.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </CampoSelecao>
                <CampoTexto nome="capacidade" rotulo="Capacidade (litros)" valor={t ? tresCasas(t.capacidade_litros) : ""} obrigatorio numerico inputMode="decimal" placeholder="15.000" />
              </Grade>
              {t ? <CampoMarcar nome="ativo" rotulo="Ativo" marcado={t.ativo} /> : null}
            </div>
          </FormAcao>
        </Cartao>
      </>
    );
  }

  if (tipo === "bomba") {
    const b = novo ? null : e.bombas.find((x) => x.id === id);
    if (!novo && !b) notFound();
    return (
      <>
        {voltar}
        <TituloPagina titulo={b ? `Bomba ${b.numero}` : "Nova bomba"} />
        <Cartao className="max-w-md">
          <FormAcao acao={acaoBomba} rotulo={b ? "Salvar" : "Cadastrar"}>
            {b ? <input type="hidden" name="id" value={b.id} /> : null}
            <div className="space-y-4">
              <CampoTexto nome="numero" rotulo="Número" valor={b?.numero ?? proximo(e.bombas.map((x) => x.numero))} obrigatorio inputMode="numeric" />
              {b ? <CampoMarcar nome="ativo" rotulo="Ativa" marcado={b.ativo} /> : null}
            </div>
          </FormAcao>
        </Cartao>
      </>
    );
  }

  const bico = novo ? null : e.bicos.find((x) => x.id === id);
  if (!novo && !bico) notFound();
  return (
    <>
      {voltar}
      <TituloPagina titulo={bico ? `Bico ${String(bico.numero).padStart(2, "0")}` : "Novo bico"} descricao="O número tem de ser o mesmo que está na bomba e no concentrador." />
      <Cartao className="max-w-2xl">
        <FormAcao acao={acaoBico} rotulo={bico ? "Salvar" : "Cadastrar"}>
          {bico ? <input type="hidden" name="id" value={bico.id} /> : null}
          <div className="space-y-4">
            <Grade colunas={2}>
              <CampoTexto nome="numero" rotulo="Número do bico" valor={bico?.numero ?? proximo(e.bicos.map((x) => x.numero))} obrigatorio inputMode="numeric" />
              <CampoSelecao nome="bomba_id" rotulo="Bomba" valor={bico?.bomba_id} obrigatorio>
                <option value="">Escolha…</option>
                {e.bombas.filter((b) => b.ativo || b.id === bico?.bomba_id).map((b) => <option key={b.id} value={b.id}>Bomba {b.numero}</option>)}
              </CampoSelecao>
              <CampoSelecao nome="tanque_id" rotulo="Tanque" valor={bico?.tanque_id} obrigatorio>
                <option value="">Escolha…</option>
                {e.tanques.filter((t) => t.ativo || t.id === bico?.tanque_id).map((t) => <option key={t.id} value={t.id}>Tanque {t.numero} · {t.combustivel}</option>)}
              </CampoSelecao>
              <CampoTexto nome="encerrante_maximo" rotulo="Encerrante máximo" valor={tresCasas(bico?.encerrante_maximo ?? "999999.999")} obrigatorio numerico inputMode="decimal"
                dica="Maior número que o totalizador mostra antes de voltar a zero." />
            </Grade>
            {bico ? <CampoMarcar nome="ativo" rotulo="Ativo" marcado={bico.ativo} dica="Bico desativado não entra na abertura de turno nem no caixa." /> : null}
          </div>
        </FormAcao>
      </Cartao>
    </>
  );
}
