import type { Metadata } from "next";
import Link from "next/link";
import { listarGrupos, listarTiposPreco, listarUnidades } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { CampoSelecao, CampoTexto } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, Selo, Tabela, TituloPagina } from "@/components/ui";
import { acaoGrupo, acaoTipoPreco, acaoUnidade } from "../actions";

export const metadata: Metadata = { title: "Grupos, unidades e tipos de preço" };
export const dynamic = "force-dynamic";

export default async function Grupos() {
  const u = await exigirUsuario("cadastro.editar");
  const [grupos, unidades, tipos] = await Promise.all([listarGrupos(u.empresaId), listarUnidades(), listarTiposPreco(u.empresaId)]);
  const principais = grupos.filter((g) => !g.pai_id);
  return (
    <>
      <p className="mb-2 text-sm"><Link href="/cadastros/mercadorias" className="text-accent hover:underline">‹ Mercadorias</Link></p>
      <TituloPagina titulo="Grupos, unidades e tipos de preço" />
      <div className="grid gap-4 xl:grid-cols-3">
        <Cartao titulo="Grupos e sub-grupos">
          <Tabela rotulo="Grupos">
            <thead><tr><th>Grupo</th><th className="text-right!">Itens</th></tr></thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.id}>
                  <td className={g.pai_id ? "pl-8!" : "font-semibold"}>{g.pai_id ? `› ${g.nome}` : g.nome}</td>
                  <td className="num text-right">{g.mercadorias}</td>
                </tr>
              ))}
            </tbody>
          </Tabela>
          <h3 className="mt-4 mb-2 font-semibold">Novo grupo</h3>
          <FormAcao acao={acaoGrupo} rotulo="Criar grupo">
            <div className="space-y-3">
              <CampoTexto nome="nome" rotulo="Nome" obrigatorio maxLength={60} />
              <CampoSelecao nome="pai_id" rotulo="Dentro de" dica="Deixe em branco para um grupo principal.">
                <option value="">— grupo principal —</option>
                {principais.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </CampoSelecao>
            </div>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Unidades de venda">
          <Tabela rotulo="Unidades">
            <thead><tr><th>Sigla</th><th>Descrição</th></tr></thead>
            <tbody>{unidades.map((x) => <tr key={x.id}><td className="font-semibold">{x.sigla}</td><td>{x.descricao}</td></tr>)}</tbody>
          </Tabela>
          <h3 className="mt-4 mb-2 font-semibold">Nova unidade</h3>
          <FormAcao acao={acaoUnidade} rotulo="Criar unidade">
            <div className="grid grid-cols-[6rem_1fr] gap-3">
              <CampoTexto nome="sigla" rotulo="Sigla" obrigatorio maxLength={6} placeholder="CX" />
              <CampoTexto nome="descricao" rotulo="Descrição" obrigatorio maxLength={40} placeholder="Caixa" />
            </div>
          </FormAcao>
        </Cartao>

        <Cartao titulo="Tipos de preço">
          <Tabela rotulo="Tipos de preço">
            <thead><tr><th>Nome</th><th /></tr></thead>
            <tbody>{tipos.map((t) => <tr key={t.id}><td>{t.nome}</td><td>{t.padrao ? <Selo tom="info">usado no caixa</Selo> : null}</td></tr>)}</tbody>
          </Tabela>
          <p className="mt-2 text-xs text-text-muted">O preço padrão é o usado no caixa. Os outros (prazo, frota) entram na venda a prazo, na fase 2.</p>
          <h3 className="mt-4 mb-2 font-semibold">Novo tipo de preço</h3>
          <FormAcao acao={acaoTipoPreco} rotulo="Criar tipo">
            <CampoTexto nome="nome" rotulo="Nome" obrigatorio maxLength={40} placeholder="Frota" />
          </FormAcao>
        </Cartao>
      </div>
    </>
  );
}
