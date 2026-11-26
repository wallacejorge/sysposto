import type { Metadata } from "next";
import { buscarEmpresa, UFS } from "@/lib/data/cadastros";
import { exigirUsuario } from "@/lib/session";
import { CampoSelecao, CampoTexto, Grade } from "@/components/campos";
import { FormAcao } from "@/components/form-acao";
import { Cartao, TituloPagina } from "@/components/ui";
import { acaoEmpresa } from "../actions";

export const metadata: Metadata = { title: "Dados da empresa" };
export const dynamic = "force-dynamic";

const cnpjFmt = (c: string) => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

export default async function Empresa() {
  const u = await exigirUsuario("cadastro.editar");
  const e = await buscarEmpresa(u.empresaId);
  return (
    <>
      <TituloPagina titulo="Dados da empresa" descricao="Usados no cabeçalho dos relatórios e, no Marco 4, na NFC-e. Confira com o seu contador." />
      <Cartao className="max-w-4xl">
        <FormAcao acao={acaoEmpresa}>
          <Grade colunas={2}>
            <CampoTexto nome="razao_social" rotulo="Razão social" valor={e.razao_social} obrigatorio maxLength={120} />
            <CampoTexto nome="nome_fantasia" rotulo="Nome fantasia" valor={e.nome_fantasia} obrigatorio maxLength={60} />
            <CampoTexto nome="cnpj" rotulo="CNPJ" valor={cnpjFmt(e.cnpj)} obrigatorio inputMode="numeric" maxLength={18} />
            <CampoTexto nome="inscricao_estadual" rotulo="Inscrição estadual" valor={e.inscricao_estadual} maxLength={20} />
            <CampoSelecao nome="uf" rotulo="UF" valor={e.uf} obrigatorio>
              {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </CampoSelecao>
            <CampoTexto nome="municipio_ibge" rotulo="Código IBGE do município" valor={e.municipio_ibge} inputMode="numeric" maxLength={7} dica="7 números. Necessário para a NFC-e." />
            <CampoSelecao nome="regime_tributario" rotulo="Regime tributário" valor={e.regime_tributario} obrigatorio>
              <option value="simples">Simples Nacional</option>
              <option value="presumido">Lucro presumido</option>
              <option value="real">Lucro real</option>
            </CampoSelecao>
            <CampoSelecao nome="crt" rotulo="CRT (como sai na nota)" valor={e.crt} obrigatorio dica="Lucro presumido ou real: 3. Simples: 1.">
              <option value="1">1 · Simples Nacional</option>
              <option value="2">2 · Simples, excesso de sublimite</option>
              <option value="3">3 · Regime normal</option>
              <option value="4">4 · MEI</option>
            </CampoSelecao>
          </Grade>
        </FormAcao>
      </Cartao>
    </>
  );
}
