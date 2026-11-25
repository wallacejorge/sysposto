import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listarPerfis, listarUsuarios, PERMISSOES } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { CampoMarcar, CampoSelecao, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, TituloPagina } from "@/components/ui";
import { acaoPerfil, acaoUsuario } from "../../../actions";

export const metadata: Metadata = { title: "Usuários e perfis" };
export const dynamic = "force-dynamic";

export default async function EditarUsuario({ params }: { params: Promise<{ tipo: string; id: string }> }) {
  const u = await exigirUsuario("cadastro.editar");
  const { tipo, id } = await params;
  if (tipo !== "usuario" && tipo !== "perfil") notFound();
  const novo = id === "novo";
  const perfis = await listarPerfis(u.empresaId);
  const voltar = <p className="mb-2 text-sm"><Link href="/cadastros/usuarios" className="text-accent hover:underline">‹ Usuários e perfis</Link></p>;

  if (tipo === "perfil") {
    const p = novo ? null : perfis.find((x) => x.id === id);
    if (!novo && !p) notFound();
    return (
      <>
        {voltar}
        <TituloPagina titulo={p ? `Perfil ${p.nome}` : "Novo perfil"} descricao={p ? `${p.usuarios} usuário(s) com este perfil.` : undefined} />
        <Cartao className="max-w-2xl">
          <FormAcao acao={acaoPerfil} rotulo={p ? "Salvar" : "Cadastrar"}>
            {p ? <input type="hidden" name="id" value={p.id} /> : null}
            <div className="space-y-4">
              <CampoTexto nome="nome" rotulo="Nome" valor={p?.nome} obrigatorio maxLength={40} />
              <fieldset className="space-y-3">
                <legend className="mb-2 text-xs font-semibold text-text-muted">Pode</legend>
                {Object.entries(PERMISSOES).map(([k, rotulo]) => (
                  <CampoMarcar key={k} nome={`perm:${k}`} rotulo={rotulo} marcado={Boolean(p?.permissoes[k])} />
                ))}
              </fieldset>
            </div>
          </FormAcao>
        </Cartao>
      </>
    );
  }

  const x = novo ? null : (await listarUsuarios(u.empresaId)).find((y) => y.id === id);
  if (!novo && !x) notFound();
  const proprio = x?.id === u.id;
  return (
    <>
      {voltar}
      <TituloPagina titulo={x ? x.apelido : "Novo usuário"} />
      <Cartao className="max-w-3xl">
        <FormAcao acao={acaoUsuario} rotulo={x ? "Salvar" : "Cadastrar"}>
          {x ? <input type="hidden" name="id" value={x.id} /> : null}
          <div className="space-y-4">
            <Grade colunas={2}>
              <CampoTexto nome="apelido" rotulo="Nome na lista de entrada" valor={x?.apelido} obrigatorio maxLength={20} dica="Como aparece no login e no caixa. Ex.: Maria." />
              <CampoTexto nome="nome" rotulo="Nome completo" valor={x?.nome} obrigatorio maxLength={80} />
              <CampoSelecao nome="perfil_id" rotulo="Perfil" valor={x?.perfil_id} obrigatorio>
                <option value="">Escolha…</option>
                {perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </CampoSelecao>
              <CampoTexto nome="pin" rotulo={x ? "Novo PIN (deixe vazio para manter)" : "PIN"} type="password" inputMode="numeric" maxLength={6} pattern="\d{4,6}"
                title="4 a 6 números" dica="4 a 6 números. A pessoa pode trocar depois em Meu PIN." />
            </Grade>
            <CampoMarcar nome="eh_frentista" rotulo="É frentista" marcado={x?.eh_frentista} dica="Aparece para escolher quem abasteceu (relatório e comissão)." />
            {x && !proprio ? <CampoMarcar nome="ativo" rotulo="Ativo" marcado={x.ativo} dica="Inativo não entra mais no sistema. O histórico continua." /> : null}
            {proprio ? <input type="hidden" name="ativo" value="on" /> : null}
          </div>
        </FormAcao>
      </Cartao>
    </>
  );
}
