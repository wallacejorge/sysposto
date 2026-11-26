import { CampoMarcar, CampoSelecao, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao } from "@/components/ui";
import type { Grupo, Mercadoria, Tributacao, Unidade } from "@/lib/data/cadastros";
import { acaoMercadoria } from "../actions";

export function FormMercadoria({ m, grupos, unidades, tributacoes }: { m: Mercadoria | null; grupos: Grupo[]; unidades: Unidade[]; tributacoes: Tributacao[] }) {
  const litro = unidades.find((u) => u.sigla === "L")?.id;
  return (
    <FormAcao acao={acaoMercadoria} rotulo={m ? "Salvar alterações" : "Cadastrar"} className="space-y-4">
      {m ? <input type="hidden" name="id" value={m.id} /> : null}
      <Cartao titulo="Identificação">
        <Grade>
          <CampoTexto nome="codigo" rotulo="Código interno" valor={m?.codigo} obrigatorio maxLength={20} autoFocus={!m} />
          <CampoTexto nome="nome" rotulo="Nome" valor={m?.nome} obrigatorio maxLength={120} />
          <CampoSelecao nome="tipo" rotulo="Tipo" valor={m?.tipo ?? "combustivel"} obrigatorio>
            <option value="combustivel">Combustível</option>
            <option value="produto">Produto (lubrificante, loja)</option>
            <option value="servico">Serviço (lavagem, troca de óleo)</option>
          </CampoSelecao>
          <CampoSelecao nome="grupo_id" rotulo="Grupo" valor={m?.grupo_id}>
            <option value="">Sem grupo</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{g.pai_nome ? `${g.pai_nome} › ${g.nome}` : g.nome}</option>
            ))}
          </CampoSelecao>
          <CampoSelecao nome="unidade_id" rotulo="Unidade de venda" valor={m?.unidade_id ?? litro} obrigatorio>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>{u.sigla} · {u.descricao}</option>
            ))}
          </CampoSelecao>
          <CampoTexto nome="codigo_barras" rotulo="Código de barras" valor={m?.codigo_barras} inputMode="numeric" maxLength={14} dica="Para produtos da loja. 8, 12, 13 ou 14 números." />
        </Grade>
        {m ? <div className="mt-4"><CampoMarcar nome="ativo" rotulo="Ativo" marcado={m.ativo} dica="Desativado não aparece no caixa. O histórico de vendas continua." /></div> : null}
      </Cartao>
      <Cartao titulo="Dados fiscais">
        <Grade>
          <CampoTexto nome="ncm" rotulo="NCM" valor={m?.ncm} inputMode="numeric" maxLength={10} dica="8 números. Confirme com o contador." />
          <CampoTexto nome="cest" rotulo="CEST" valor={m?.cest} inputMode="numeric" maxLength={9} dica="7 números, quando houver." />
          <CampoSelecao nome="tributacao_id" rotulo="Tributação" valor={m?.tributacao_id} dica="Sem tributação, a mercadoria não pode sair em nota fiscal.">
            <option value="">— nenhuma —</option>
            {tributacoes.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.revisar ? " (revisar)" : ""}</option>)}
          </CampoSelecao>
          <CampoTexto nome="kg_por_unidade" rotulo="Kg por unidade" valor={m?.kg_por_unidade ? m.kg_por_unidade.replace(".", ",") : ""} numerico inputMode="decimal"
            dica="Só para GLP vendido por botijão (ex.: 13). Base do ICMS por kg." />
        </Grade>
      </Cartao>
      <Cartao titulo="Código ANP (combustível, gás e lubrificante)">
        <Grade>
          <CampoTexto nome="codigo_anp" rotulo="Código ANP" valor={m?.codigo_anp} inputMode="numeric" maxLength={9} dica="9 números, da tabela da ANP. Obrigatório para combustível; gás e lubrificante também levam na nota." />
          <CampoTexto nome="descricao_anp" rotulo="Descrição ANP" valor={m?.descricao_anp} maxLength={95} />
          <CampoTexto nome="p_bio" rotulo="% de biodiesel / anidro" valor={m?.p_bio ? Number(m.p_bio).toLocaleString("pt-BR", { maximumFractionDigits: 4 }) : ""} numerico inputMode="decimal"
            dica="Como sai na nota: gasolina C = 27, diesel B = 15." />
        </Grade>
      </Cartao>
    </FormAcao>
  );
}
