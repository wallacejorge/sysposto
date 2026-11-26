"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { executar, type Estado } from "@/lib/acao";
import { ErroNegocio } from "@/lib/data/caixa";
import * as cad from "@/lib/data/cadastros";
import { lerTresCasas } from "@/lib/format";
import { exigirUsuario } from "@/lib/session";

// ---------------------------------------------------------------------------
// Leitura dos campos do formulário
// ---------------------------------------------------------------------------

function texto(f: FormData, nome: string, rotulo: string, max = 120): string {
  const v = String(f.get(nome) ?? "").trim();
  if (!v) throw new ErroNegocio(`Preencha: ${rotulo}.`);
  if (v.length > max) throw new ErroNegocio(`${rotulo}: no máximo ${max} caracteres.`);
  return v;
}
function opcional(f: FormData, nome: string, max = 120): string | null {
  const v = String(f.get(nome) ?? "").trim();
  if (v.length > max) throw new ErroNegocio(`Campo muito longo (máximo ${max}).`);
  return v || null;
}
function digitos(f: FormData, nome: string, rotulo: string, tamanhos: number[], obrigatorio = false): string | null {
  const v = String(f.get(nome) ?? "").replace(/\D/g, "");
  if (!v) {
    if (obrigatorio) throw new ErroNegocio(`Preencha: ${rotulo}.`);
    return null;
  }
  if (!tamanhos.includes(v.length)) throw new ErroNegocio(`${rotulo}: ${tamanhos.join(" ou ")} números.`);
  return v;
}
function inteiro(f: FormData, nome: string, rotulo: string, min = 1, max = 9999): number {
  const n = Number(String(f.get(nome) ?? "").trim());
  if (!Number.isInteger(n) || n < min || n > max) throw new ErroNegocio(`${rotulo}: número inteiro de ${min} a ${max}.`);
  return n;
}
function decimal3(f: FormData, nome: string, rotulo: string): string {
  const v = lerTresCasas(String(f.get(nome) ?? ""));
  if (v === null) throw new ErroNegocio(`${rotulo}: número inválido (use vírgula para os decimais).`);
  return v;
}
function percentual(f: FormData, nome: string): string | null {
  const t = String(f.get(nome) ?? "").trim();
  if (!t) return null;
  const v = lerTresCasas(t.replace("%", ""));
  if (v === null || Number(v) > 100) throw new ErroNegocio("Taxa inválida (de 0 a 100%).");
  return Number(v).toFixed(2);
}
/** Percentual com até 4 casas (0 a 100). */
function percentual4(f: FormData, nome: string): string | null {
  const t = String(f.get(nome) ?? "").trim().replace("%", "");
  if (!t) return null;
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new ErroNegocio("Percentual inválido (de 0 a 100).");
  return n.toFixed(4);
}
/** Valor com até 4 casas (ad rem em R$ por L ou kg). */
function decimal4(f: FormData, nome: string, rotulo: string): string | null {
  const t = String(f.get(nome) ?? "").trim().replace(/R\$|\s/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  if (!Number.isFinite(n) || n < 0 || n > 1000) throw new ErroNegocio(`${rotulo}: valor inválido.`);
  return n.toFixed(4);
}
function marcado(f: FormData, nome: string) {
  return f.get(nome) === "on";
}
function idOpcional(f: FormData, nome: string): string | null {
  const v = String(f.get(nome) ?? "");
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}
function idDoForm(f: FormData): string | undefined {
  return idOpcional(f, "id") ?? undefined;
}
/** "2026-12-01T06:00" (campo datetime-local, hora do posto) -> Date. */
function dataHora(f: FormData, nome: string): Date | null {
  const v = String(f.get(nome) ?? "").trim();
  if (!v) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new ErroNegocio("Data e hora inválidas.");
  return new Date(`${v}:00-03:00`); // horário de Brasília (sem horário de verão desde 2019)
}

// ---------------------------------------------------------------------------
// Grupos, unidades, tipos de preço
// ---------------------------------------------------------------------------

export async function acaoGrupo(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  return executar(async () => {
    await cad.salvarGrupo(u, { id: idDoForm(f), nome: texto(f, "nome", "Nome", 60), paiId: idOpcional(f, "pai_id") });
    revalidatePath("/cadastros/grupos");
    return { ok: "Grupo salvo." };
  });
}

export async function acaoUnidade(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  return executar(async () => {
    const sigla = texto(f, "sigla", "Sigla", 6);
    if (!/^[A-Za-z0-9]+$/.test(sigla)) return { erro: "Sigla: só letras e números." };
    await cad.criarUnidade(u, { sigla, descricao: texto(f, "descricao", "Descrição", 40) });
    revalidatePath("/cadastros/grupos");
    return { ok: "Unidade criada." };
  });
}

export async function acaoTipoPreco(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  return executar(async () => {
    await cad.criarTipoPreco(u, texto(f, "nome", "Nome", 40));
    revalidatePath("/cadastros/grupos");
    return { ok: "Tipo de preço criado." };
  });
}

// ---------------------------------------------------------------------------
// Mercadorias e preços
// ---------------------------------------------------------------------------

export async function acaoMercadoria(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  let id = "";
  const r = await executar(async () => {
    const tipo = String(f.get("tipo"));
    if (tipo !== "combustivel" && tipo !== "produto" && tipo !== "servico") return { erro: "Escolha o tipo." };
    const unidade = idOpcional(f, "unidade_id");
    if (!unidade) return { erro: "Escolha a unidade." };
    id = await cad.salvarMercadoria(u, {
      id: idDoForm(f),
      codigo: texto(f, "codigo", "Código", 20),
      nome: texto(f, "nome", "Nome", 120),
      tipo,
      grupo_id: idOpcional(f, "grupo_id"),
      unidade_id: unidade,
      codigo_barras: digitos(f, "codigo_barras", "Código de barras", [8, 12, 13, 14]),
      ncm: digitos(f, "ncm", "NCM", [8]),
      cest: digitos(f, "cest", "CEST", [7]),
      codigo_anp: digitos(f, "codigo_anp", "Código ANP", [9], tipo === "combustivel"),
      descricao_anp: opcional(f, "descricao_anp", 95),
      ativo: idDoForm(f) ? marcado(f, "ativo") : true,
      tributacao_id: idOpcional(f, "tributacao_id"),
      p_bio: tipo === "combustivel" && String(f.get("p_bio") ?? "").trim() ? percentual4(f, "p_bio") : null,
      kg_por_unidade: String(f.get("kg_por_unidade") ?? "").trim() ? decimal3(f, "kg_por_unidade", "Kg por unidade") : null,
    });
  });
  if (r.erro) return r;
  revalidatePath("/cadastros/mercadorias");
  redirect(`/cadastros/mercadorias/${id}?salvo=1`);
}

export async function acaoPreco(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("preco.alterar");
  return executar(async () => {
    const mercadoriaId = idOpcional(f, "mercadoria_id");
    const tipoPrecoId = idOpcional(f, "tipo_preco_id");
    if (!mercadoriaId || !tipoPrecoId) return { erro: "Escolha o tipo de preço." };
    const preco = decimal3(f, "preco", "Preço");
    const aPartirDe = f.get("quando") === "agendar" ? dataHora(f, "a_partir_de") : null;
    if (f.get("quando") === "agendar" && !aPartirDe) return { erro: "Informe quando o preço novo começa." };
    await cad.alterarPreco(u, { mercadoriaId, tipoPrecoId, preco, aPartirDe, promocionalAte: dataHora(f, "promocional_ate") });
    revalidatePath(`/cadastros/mercadorias/${mercadoriaId}`);
    revalidatePath("/cadastros/mercadorias");
    revalidatePath("/caixa");
    return { ok: aPartirDe ? "Preço agendado." : "Preço alterado. Já vale para os próximos abastecimentos." };
  });
}

export async function acaoCancelarPreco(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("preco.alterar");
  return executar(async () => {
    const id = idOpcional(f, "preco_id");
    if (!id) return { erro: "Preço inválido." };
    await cad.cancelarPrecoAgendado(u, id);
    revalidatePath(`/cadastros/mercadorias/${String(f.get("mercadoria_id"))}`);
    return { ok: "Agendamento cancelado." };
  });
}

// ---------------------------------------------------------------------------
// Tanques, bombas, bicos
// ---------------------------------------------------------------------------

function voltarEstrutura(r: Estado): Estado {
  if (r.erro) return r;
  revalidatePath("/cadastros/bicos");
  revalidatePath("/caixa");
  redirect("/cadastros/bicos?salvo=1");
}

export async function acaoTanque(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    const mercadoriaId = idOpcional(f, "mercadoria_id");
    if (!mercadoriaId) return { erro: "Escolha o combustível." };
    await cad.salvarTanque(u, {
      id: idDoForm(f), numero: inteiro(f, "numero", "Número", 1, 99), mercadoriaId,
      capacidade: decimal3(f, "capacidade", "Capacidade"), ativo: idDoForm(f) ? marcado(f, "ativo") : true,
    });
  });
  return voltarEstrutura(r);
}

export async function acaoBomba(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    await cad.salvarBomba(u, { id: idDoForm(f), numero: inteiro(f, "numero", "Número", 1, 99), ativo: idDoForm(f) ? marcado(f, "ativo") : true });
  });
  return voltarEstrutura(r);
}

export async function acaoBico(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    const bombaId = idOpcional(f, "bomba_id");
    const tanqueId = idOpcional(f, "tanque_id");
    if (!bombaId || !tanqueId) return { erro: "Escolha a bomba e o tanque." };
    await cad.salvarBico(u, {
      id: idDoForm(f), numero: inteiro(f, "numero", "Número", 1, 999), bombaId, tanqueId,
      encerranteMaximo: decimal3(f, "encerrante_maximo", "Encerrante máximo"), ativo: idDoForm(f) ? marcado(f, "ativo") : true,
    });
  });
  return voltarEstrutura(r);
}

// ---------------------------------------------------------------------------
// Pagamentos e caixas
// ---------------------------------------------------------------------------

export async function acaoForma(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    const tipo = String(f.get("tipo")) as cad.TipoPagamento;
    if (!(tipo in cad.TIPOS_PAGAMENTO)) return { erro: "Escolha o tipo." };
    const cartao = tipo === "debito" || tipo === "credito";
    await cad.salvarForma(u, {
      id: idDoForm(f), nome: texto(f, "nome", "Nome", 40), tipo,
      administradoraId: cartao ? idOpcional(f, "administradora_id") : null,
      contaNoCaixa: marcado(f, "conta_no_caixa"), ativo: idDoForm(f) ? marcado(f, "ativo") : true,
    });
  });
  if (r.erro) return r;
  revalidatePath("/cadastros/pagamentos");
  redirect("/cadastros/pagamentos?salvo=1");
}

export async function acaoAdministradora(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    const dias = (nome: string) => (String(f.get(nome) ?? "").trim() ? inteiro(f, nome, "Dias de repasse", 0, 120) : null);
    await cad.salvarAdministradora(u, {
      id: idDoForm(f), nome: texto(f, "nome", "Nome", 60), cnpj: digitos(f, "cnpj", "CNPJ", [14]),
      taxa_debito: percentual(f, "taxa_debito"), taxa_credito: percentual(f, "taxa_credito"),
      dias_repasse_debito: dias("dias_repasse_debito"), dias_repasse_credito: dias("dias_repasse_credito"),
    });
  });
  if (r.erro) return r;
  revalidatePath("/cadastros/pagamentos");
  redirect("/cadastros/pagamentos?salvo=1");
}

export async function acaoCaixa(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    await cad.salvarCaixa(u, {
      id: idDoForm(f), numero: inteiro(f, "numero", "Número", 1, 99), nome: texto(f, "nome", "Nome", 40),
      serie: inteiro(f, "serie", "Série da NFC-e", 1, 999), serieContingencia: inteiro(f, "serie_contingencia", "Série de contingência", 1, 999),
      ativo: idDoForm(f) ? marcado(f, "ativo") : true,
    });
  });
  if (r.erro) return r;
  revalidatePath("/cadastros/caixas");
  redirect("/cadastros/caixas?salvo=1");
}

// ---------------------------------------------------------------------------
// Usuários, perfis, empresa, meu PIN
// ---------------------------------------------------------------------------

export async function acaoUsuario(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    const perfilId = idOpcional(f, "perfil_id");
    if (!perfilId) return { erro: "Escolha o perfil." };
    const id = idDoForm(f);
    const pin = String(f.get("pin") ?? "").trim();
    if (!id && !pin && !marcado(f, "eh_frentista")) return { erro: "Defina um PIN para o usuário entrar no sistema (ou marque que é só frentista)." };
    await cad.salvarUsuario(u, {
      id, nome: texto(f, "nome", "Nome completo", 80), apelido: texto(f, "apelido", "Nome na lista de entrada", 20),
      perfilId, frentista: marcado(f, "eh_frentista"), ativo: id ? marcado(f, "ativo") : true, novoPin: pin || null,
    });
  });
  if (r.erro) return r;
  revalidatePath("/cadastros/usuarios");
  redirect("/cadastros/usuarios?salvo=1");
}

export async function acaoPerfil(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    const permissoes = Object.fromEntries(Object.keys(cad.PERMISSOES).map((k) => [k, marcado(f, `perm:${k}`)]));
    await cad.salvarPerfil(u, { id: idDoForm(f), nome: texto(f, "nome", "Nome", 40), permissoes });
  });
  if (r.erro) return r;
  revalidatePath("/", "layout");
  redirect("/cadastros/usuarios?salvo=1");
}

export async function acaoEmpresa(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  return executar(async () => {
    const regime = String(f.get("regime_tributario"));
    if (regime !== "simples" && regime !== "presumido" && regime !== "real") return { erro: "Escolha o regime tributário." };
    await cad.salvarEmpresa(u, {
      razao_social: texto(f, "razao_social", "Razão social", 120), nome_fantasia: texto(f, "nome_fantasia", "Nome fantasia", 60),
      cnpj: digitos(f, "cnpj", "CNPJ", [14], true)!, inscricao_estadual: opcional(f, "inscricao_estadual", 20),
      uf: String(f.get("uf") ?? ""), municipio_ibge: digitos(f, "municipio_ibge", "Código IBGE do município", [7]), regime_tributario: regime,
      crt: String(f.get("crt") ?? "3") as "1" | "2" | "3" | "4",
    });
    revalidatePath("/", "layout");
    return { ok: "Dados da empresa salvos." };
  });
}

export async function acaoMeuPin(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario();
  return executar(async () => {
    const novo = String(f.get("novo") ?? "");
    if (novo !== String(f.get("confirmar") ?? "")) return { erro: "A confirmação não é igual ao novo PIN." };
    await cad.trocarMeuPin(u, String(f.get("atual") ?? ""), novo);
    return { ok: "PIN trocado. Use o novo PIN na próxima entrada." };
  });
}

export async function acaoTributacao(_: Estado, f: FormData): Promise<Estado> {
  const u = await exigirUsuario("cadastro.editar");
  const r = await executar(async () => {
    const cst = String(f.get("cst_icms") ?? "");
    const un = String(f.get("ad_rem_unidade") ?? "");
    const cfop = (nome: string, obrig: boolean) => {
      const v = String(f.get(nome) ?? "").replace(/\D/g, "");
      if (!v) { if (obrig) throw new ErroNegocio("Informe o CFOP de venda dentro do estado."); return null; }
      if (v.length !== 4) throw new ErroNegocio("CFOP tem 4 números.");
      return v;
    };
    const cstPis = (nome: string) => {
      const v = String(f.get(nome) ?? "").replace(/\D/g, "");
      if (v.length !== 2) throw new ErroNegocio("CST de PIS/COFINS tem 2 números.");
      return v;
    };
    await cad.salvarTributacao(u, {
      id: idDoForm(f), nome: texto(f, "nome", "Nome", 60), origem: String(f.get("origem") ?? "0").slice(0, 1) || "0", cst_icms: cst,
      cfop_interno: cfop("cfop_interno", true)!, cfop_interestadual: cfop("cfop_interestadual", false),
      p_icms: percentual(f, "p_icms"), p_icms_efetivo: percentual(f, "p_icms_efetivo"),
      ad_rem: decimal4(f, "ad_rem", "Ad rem"), ad_rem_unidade: un === "L" || un === "kg" ? un : null,
      pis_cst: cstPis("pis_cst"), p_pis: percentual4(f, "p_pis"), cofins_cst: cstPis("cofins_cst"), p_cofins: percentual4(f, "p_cofins"),
      c_benef: opcional(f, "c_benef", 10), revisar: marcado(f, "revisar"), observacao: opcional(f, "observacao", 500),
    });
  });
  if (r.erro) return r;
  revalidatePath("/cadastros/tributacao");
  revalidatePath("/cadastros/mercadorias");
  redirect("/cadastros/tributacao?salvo=1");
}
