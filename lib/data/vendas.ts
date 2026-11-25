import "server-only";
import { q, tx, type Tx } from "../db";
import type { Usuario } from "../session";
import { ErroNegocio } from "./caixa";
import { cnpjValido } from "./cadastros";

// Operações do caixa. Todas chegam pela mesma porta (online ou da fila offline) e são
// idempotentes: a mesma operação enviada duas vezes tem o mesmo efeito de uma vez.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type OpManual = { tipo: "manual"; id: string; turnoId: string; bicoId: string; litros?: string; valorCentavos?: number; fim: string };
export type OpVenda = {
  tipo: "venda"; chave: string; turnoId: string; abastecimentos: string[];
  produtos: { mercadoriaId: string; quantidade: string }[];
  pagamentos: { formaId: string; valorCentavos: number }[];
  cpf?: string; frentistaId?: string; criadaEm: string; offline?: boolean;
};
export type OpMovimento = { tipo: "movimento"; chave: string; turnoId: string; tipoMov: "sangria" | "suprimento" | "despesa" | "receita"; valorCentavos: number; motivo: string };
export type Operacao = OpManual | OpVenda | OpMovimento;

export type Resultado =
  | { ok: true; mensagem: string; trocoCentavos?: number; totalCentavos?: number }
  | { ok: false; erro: string };

/** Processa uma operação. Erro de regra volta como { ok: false } (definitivo); erro técnico sobe (tentar de novo). */
export async function processar(u: Usuario, op: Operacao): Promise<Resultado> {
  try {
    if (op.tipo === "manual") return await abastecimentoManual(u, op);
    if (op.tipo === "venda") return await venda(u, op);
    if (op.tipo === "movimento") return await movimento(u, op);
    return { ok: false, erro: "Operação desconhecida." };
  } catch (e) {
    if (e instanceof ErroNegocio) return { ok: false, erro: e.message };
    throw e;
  }
}

// ---------------------------------------------------------------------------

/** Trava o turno e confere: aberto, do operador logado. Devolve a hora de abertura. */
async function travarTurno(c: Tx, u: Usuario, turnoId: string) {
  if (!UUID.test(turnoId)) throw new ErroNegocio("Turno inválido.");
  const r = await c.query<{ id: string; caixa_id: string; operador_id: string; status: string; aberto_em: Date }>(
    `select id, caixa_id, operador_id, status, aberto_em from turnos where id = $1 and empresa_id = $2 for update`,
    [turnoId, u.empresaId],
  );
  const t = r.rows[0];
  if (!t) throw new ErroNegocio("Turno não encontrado.");
  if (t.operador_id !== u.id) throw new ErroNegocio("Este turno é de outro operador.");
  if (t.status === "fechado") throw new ErroNegocio("O turno já foi fechado. Chame o gerente para lançar esta venda.");
  return t;
}

/** Hora informada pelo terminal, limitada entre a abertura do turno e agora. */
function horaDoTerminal(iso: string, abertura: Date): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date();
  const agora = Date.now();
  if (d.getTime() > agora + 5 * 60_000) return new Date(agora);
  if (d.getTime() < abertura.getTime()) return abertura;
  return d;
}

/** Preço à vista que valia naquele momento. */
async function precoEm(c: Tx, mercadoriaId: string, quando: Date): Promise<string | null> {
  const r = await c.query<{ preco: string }>(
    `select pr.preco::text from precos pr join tipos_preco tp on tp.id = pr.tipo_preco_id and tp.padrao
      where pr.mercadoria_id = $1 and pr.vigente_desde <= $2 and (pr.promocional_ate is null or pr.promocional_ate > $2)
      order by pr.vigente_desde desc limit 1`,
    [mercadoriaId, quando],
  );
  return r.rows[0]?.preco ?? null;
}

async function abastecimentoManual(u: Usuario, op: OpManual): Promise<Resultado> {
  if (!UUID.test(op.id) || !UUID.test(op.bicoId)) throw new ErroNegocio("Dados do abastecimento inválidos.");
  return tx(u.id, async (c) => {
    const ja = await c.query(`select 1 from abastecimentos where id = $1 and empresa_id = $2`, [op.id, u.empresaId]);
    if (ja.rowCount) return { ok: true, mensagem: "Abastecimento já registrado." };
    const t = await travarTurno(c, u, op.turnoId);
    const fim = horaDoTerminal(op.fim, t.aberto_em);
    const b = await c.query<{ mercadoria_id: string }>(
      `select ta.mercadoria_id from bicos b join tanques ta on ta.id = b.tanque_id where b.id = $1 and b.empresa_id = $2 and b.ativo`,
      [op.bicoId, u.empresaId],
    );
    if (!b.rowCount) throw new ErroNegocio("Bico não encontrado ou inativo.");
    const preco = await precoEm(c, b.rows[0].mercadoria_id, fim);
    if (!preco) throw new ErroNegocio("Este combustível está sem preço cadastrado.");
    let litros: number;
    let total: number;
    if (op.valorCentavos && op.valorCentavos > 0) {
      total = Math.round(op.valorCentavos);
      litros = Math.round((total / 100 / Number(preco)) * 1000) / 1000;
    } else if (op.litros && Number(op.litros) > 0) {
      litros = Math.round(Number(op.litros) * 1000) / 1000;
      total = Math.round(litros * Number(preco) * 100);
    } else {
      throw new ErroNegocio("Informe os litros ou o valor do abastecimento.");
    }
    if (litros <= 0 || litros > 100000) throw new ErroNegocio("Quantidade fora do normal. Confira o valor.");
    await c.query(
      `insert into abastecimentos (id, empresa_id, bico_id, origem, litros, preco_unitario, total_centavos, fim, lancado_por)
       values ($1,$2,$3,'manual',$4,$5,$6,$7,$8)`,
      [op.id, u.empresaId, op.bicoId, litros.toFixed(3), preco, total, fim, u.id],
    );
    return { ok: true, mensagem: "Abastecimento lançado." };
  });
}

/** CPF com dígitos verificadores. */
export function cpfValido(cpf: string): boolean {
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1+$/.test(cpf)) return false;
  const dv = (base: string) => {
    const s = base.split("").reduce((acc, d, i) => acc + Number(d) * (base.length + 1 - i), 0);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = dv(cpf.slice(0, 9));
  const d2 = dv(cpf.slice(0, 9) + d1);
  return cpf.endsWith(`${d1}${d2}`);
}

async function venda(u: Usuario, op: OpVenda): Promise<Resultado> {
  if (!UUID.test(op.chave)) throw new ErroNegocio("Venda inválida.");
  const abIds = [...new Set(op.abastecimentos ?? [])];
  const produtos = op.produtos ?? [];
  if (abIds.some((id) => !UUID.test(id)) || produtos.some((p) => !UUID.test(p.mercadoriaId))) throw new ErroNegocio("Itens inválidos.");
  if (!abIds.length && !produtos.length) throw new ErroNegocio("A venda está vazia.");
  if (!op.pagamentos?.length) throw new ErroNegocio("Informe o pagamento.");
  const cpf = op.cpf?.replace(/\D/g, "") || null;
  if (cpf && !(cpf.length === 11 ? cpfValido(cpf) : cpf.length === 14 && cnpjValido(cpf))) throw new ErroNegocio("CPF/CNPJ inválido. Confira os números.");

  return tx(u.id, async (c) => {
    const repetida = await c.query<{ total_centavos: number; troco: number; status: string }>(
      `select v.total_centavos, v.status, coalesce((select sum(troco_centavos) from venda_pagamentos where venda_id = v.id),0)::bigint as troco
         from vendas v where v.chave_cliente = $1 and v.empresa_id = $2`,
      [op.chave, u.empresaId],
    );
    if (repetida.rowCount) {
      const r = repetida.rows[0];
      return { ok: true, mensagem: "Venda já registrada.", totalCentavos: r.total_centavos, trocoCentavos: r.troco };
    }

    const t = await travarTurno(c, u, op.turnoId);
    const quando = horaDoTerminal(op.criadaEm, t.aberto_em);
    const tipoPreco = (await c.query<{ id: string }>(`select id from tipos_preco where empresa_id = $1 and padrao`, [u.empresaId])).rows[0];
    if (!tipoPreco) throw new ErroNegocio("Nenhum tipo de preço padrão cadastrado.");

    type Item = { mercadoria_id: string; bico_id: string | null; quantidade: string; preco: string; total: number; abastecimento_id: string | null };
    const itens: Item[] = [];

    if (abIds.length) {
      const abs = await c.query<{ id: string; bico_id: string; mercadoria_id: string; litros: string; preco_unitario: string; total_centavos: number }>(
        `select a.id, a.bico_id, t.mercadoria_id, a.litros::text, a.preco_unitario::text, a.total_centavos
           from abastecimentos a join bicos b on b.id = a.bico_id join tanques t on t.id = b.tanque_id
          where a.id = any($1::uuid[]) and a.empresa_id = $2 and a.status = 'pendente'
          order by a.fim for update of a`,
        [abIds, u.empresaId],
      );
      if (abs.rowCount !== abIds.length) throw new ErroNegocio("Um dos abastecimentos já foi registrado em outra venda.");
      for (const a of abs.rows) {
        itens.push({ mercadoria_id: a.mercadoria_id, bico_id: a.bico_id, quantidade: a.litros, preco: a.preco_unitario, total: a.total_centavos, abastecimento_id: a.id });
      }
    }

    for (const p of produtos) {
      const qtd = Number(String(p.quantidade).replace(",", "."));
      if (!(qtd > 0) || qtd > 9999) throw new ErroNegocio("Quantidade de produto inválida.");
      const m = await c.query<{ nome: string; tipo: string; sigla: string }>(
        `select m.nome, m.tipo, un.sigla from mercadorias m join unidades un on un.id = m.unidade_id where m.id = $1 and m.empresa_id = $2 and m.ativo`,
        [p.mercadoriaId, u.empresaId],
      );
      const merc = m.rows[0];
      if (!merc) throw new ErroNegocio("Produto não encontrado ou inativo.");
      if (merc.tipo === "combustivel") throw new ErroNegocio("Combustível entra pelo abastecimento, não como produto.");
      if (merc.sigla === "UN" && !Number.isInteger(qtd)) throw new ErroNegocio(`${merc.nome}: vendido por unidade, use quantidade inteira.`);
      const preco = await precoEm(c, p.mercadoriaId, quando);
      if (!preco) throw new ErroNegocio(`${merc.nome} está sem preço cadastrado.`);
      itens.push({ mercadoria_id: p.mercadoriaId, bico_id: null, quantidade: qtd.toFixed(3), preco, total: Math.round(qtd * Number(preco) * 100), abastecimento_id: null });
    }

    const total = itens.reduce((s, i) => s + i.total, 0);

    // Pagamentos: a soma cobre o total; o troco só pode sair do que foi pago em dinheiro.
    const formas = await c.query<{ id: string; tipo: string }>(
      `select id, tipo from formas_pagamento where id = any($1::uuid[]) and empresa_id = $2 and ativo`,
      [op.pagamentos.map((p) => p.formaId).filter((x) => UUID.test(x)), u.empresaId],
    );
    const tipoDe = new Map(formas.rows.map((f) => [f.id, f.tipo]));
    const pags = op.pagamentos.map((p) => {
      const tipo = tipoDe.get(p.formaId);
      if (!tipo) throw new ErroNegocio("Forma de pagamento inválida ou inativa.");
      if (!Number.isInteger(p.valorCentavos) || p.valorCentavos <= 0) throw new ErroNegocio("Valor de pagamento inválido.");
      return { ...p, tipo, troco: 0 };
    });
    const pago = pags.reduce((s, p) => s + p.valorCentavos, 0);
    if (pago < total) throw new ErroNegocio(`Falta pagar ${((total - pago) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`);
    let troco = pago - total;
    const emDinheiro = pags.filter((p) => p.tipo === "dinheiro").reduce((s, p) => s + p.valorCentavos, 0);
    if (troco > emDinheiro) throw new ErroNegocio("O valor pago passa do total, e o troco só pode sair de dinheiro. Confira os valores.");
    for (const p of [...pags].filter((x) => x.tipo === "dinheiro").sort((a, b) => b.valorCentavos - a.valorCentavos)) {
      const aqui = Math.min(troco, p.valorCentavos);
      p.troco = aqui;
      troco -= aqui;
    }

    let frentista: string | null = null;
    if (op.frentistaId) {
      if (!UUID.test(op.frentistaId)) throw new ErroNegocio("Frentista inválido.");
      const f = await c.query(
        `select 1 from usuarios x join usuario_empresas ue on ue.usuario_id = x.id and ue.empresa_id = $2 where x.id = $1 and x.ativo and x.eh_frentista`,
        [op.frentistaId, u.empresaId],
      );
      if (!f.rowCount) throw new ErroNegocio("Frentista não encontrado.");
      frentista = op.frentistaId;
    }

    const v = await c.query<{ id: string }>(
      `insert into vendas (empresa_id, turno_id, caixa_id, operador_id, frentista_id, chave_cliente, status, total_centavos,
                           cpf_cnpj_consumidor, criada_offline, criada_em)
       values ($1,$2,$3,$4,$5,$6,'concluida',$7,$8,$9,$10) returning id`,
      [u.empresaId, t.id, t.caixa_id, u.id, frentista, op.chave, total, cpf, Boolean(op.offline), quando],
    );
    const vendaId = v.rows[0].id;
    let ordem = 1;
    for (const i of itens) {
      await c.query(
        `insert into venda_itens (venda_id, ordem, mercadoria_id, bico_id, tipo_preco_id, quantidade, preco_unitario, total_centavos, abastecimento_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [vendaId, ordem++, i.mercadoria_id, i.bico_id, tipoPreco.id, i.quantidade, i.preco, i.total, i.abastecimento_id],
      );
    }
    for (const p of pags) {
      await c.query(`insert into venda_pagamentos (venda_id, forma_pagamento_id, valor_centavos, troco_centavos) values ($1,$2,$3,$4)`,
        [vendaId, p.formaId, p.valorCentavos, p.troco]);
    }
    if (abIds.length) await c.query(`update abastecimentos set status = 'registrado' where id = any($1::uuid[])`, [abIds]);
    const trocoTotal = pags.reduce((s, p) => s + p.troco, 0);
    return { ok: true, mensagem: "Venda registrada.", totalCentavos: total, trocoCentavos: trocoTotal };
  });
}

async function movimento(u: Usuario, op: OpMovimento): Promise<Resultado> {
  if (!UUID.test(op.chave)) throw new ErroNegocio("Movimento inválido.");
  if (!["sangria", "suprimento", "despesa", "receita"].includes(op.tipoMov)) throw new ErroNegocio("Tipo de movimento inválido.");
  if (!Number.isInteger(op.valorCentavos) || op.valorCentavos <= 0) throw new ErroNegocio("Informe um valor maior que zero.");
  const motivo = String(op.motivo ?? "").trim();
  if (motivo.length < 3 || motivo.length > 200) throw new ErroNegocio("Escreva o motivo (3 a 200 letras).");
  return tx(u.id, async (c) => {
    const ja = await c.query(`select 1 from movimentos_caixa where chave_cliente = $1`, [op.chave]);
    if (ja.rowCount) return { ok: true, mensagem: "Movimento já registrado." };
    const t = await travarTurno(c, u, op.turnoId);
    await c.query(
      `insert into movimentos_caixa (turno_id, tipo, valor_centavos, motivo, usuario_id, chave_cliente) values ($1,$2,$3,$4,$5,$6)`,
      [t.id, op.tipoMov, op.valorCentavos, motivo, u.id, op.chave],
    );
    return { ok: true, mensagem: "Movimento registrado." };
  });
}

// ---------------------------------------------------------------------------
// Vendas do turno: consulta, cancelamento e troca de pagamento
// ---------------------------------------------------------------------------

export type VendaDoTurno = {
  id: string; criada_em: string; status: "concluida" | "cancelada"; total_centavos: number; criada_offline: boolean;
  itens: string; frentista: string | null; motivo_cancelamento: string | null; cancelada_por: string | null;
  pagamentos: { id: string; forma_id: string; forma: string; tipo: string; valor_centavos: number; troco_centavos: number }[];
};

export async function vendasDoTurno(empresaId: string, turnoId: string): Promise<VendaDoTurno[]> {
  return q<VendaDoTurno>(
    `select v.id, v.criada_em, v.status, v.total_centavos, v.criada_offline, v.motivo_cancelamento, uc.apelido as cancelada_por, fr.apelido as frentista,
            (select string_agg(case when vi.bico_id is not null
                                    then 'Bico ' || lpad(b.numero::text, 2, '0') || ' ' || replace(to_char(vi.quantidade, 'FM999999990.000'), '.', ',') || ' L'
                                    else replace(rtrim(rtrim(to_char(vi.quantidade, 'FM999999990.000'), '0'), '.'), '.', ',') || ' × ' || m.nome end,
                               ', ' order by vi.ordem)
               from venda_itens vi join mercadorias m on m.id = vi.mercadoria_id left join bicos b on b.id = vi.bico_id
              where vi.venda_id = v.id) as itens,
            coalesce((select json_agg(json_build_object('id', vp.id, 'forma_id', fp.id, 'forma', fp.nome, 'tipo', fp.tipo,
                                                        'valor_centavos', vp.valor_centavos, 'troco_centavos', vp.troco_centavos) order by vp.valor_centavos desc)
                        from venda_pagamentos vp join formas_pagamento fp on fp.id = vp.forma_pagamento_id where vp.venda_id = v.id), '[]') as pagamentos
       from vendas v left join usuarios uc on uc.id = v.cancelada_por left join usuarios fr on fr.id = v.frentista_id
      where v.empresa_id = $1 and v.turno_id = $2
      order by v.criada_em desc`,
    [empresaId, turnoId],
  );
}

async function travarVendaDeTurnoAberto(c: Tx, u: Usuario, vendaId: string) {
  if (!UUID.test(vendaId)) throw new ErroNegocio("Venda inválida.");
  const r = await c.query<{ id: string; status: string; turno_status: string; operador_id: string }>(
    `select v.id, v.status, t.status as turno_status, t.operador_id
       from vendas v join turnos t on t.id = v.turno_id where v.id = $1 and v.empresa_id = $2 for update of v`,
    [vendaId, u.empresaId],
  );
  const v = r.rows[0];
  if (!v) throw new ErroNegocio("Venda não encontrada.");
  if (v.turno_status === "fechado") throw new ErroNegocio("O turno desta venda já foi fechado. Reabra o turno para corrigir.");
  if (v.status !== "concluida") throw new ErroNegocio("Esta venda já está cancelada.");
  return v;
}

export async function cancelarVenda(u: Usuario, vendaId: string, motivo: string) {
  if (!u.permissoes["venda.cancelar"]) throw new ErroNegocio("Seu perfil não pode cancelar vendas. Chame o gerente.");
  const m = motivo.trim();
  if (m.length < 15) throw new ErroNegocio("Explique o motivo do cancelamento (pelo menos 15 letras).");
  await tx(u.id, async (c) => {
    await travarVendaDeTurnoAberto(c, u, vendaId);
    await c.query(
      `update vendas set status = 'cancelada', cancelada_em = now(), cancelada_por = $2, motivo_cancelamento = $3 where id = $1`,
      [vendaId, u.id, m],
    );
    // Os abastecimentos voltam para a lista: o combustível saiu da bomba e precisa ser vendido de novo.
    await c.query(
      `update abastecimentos set status = 'pendente'
        where id in (select abastecimento_id from venda_itens where venda_id = $1 and abastecimento_id is not null)`,
      [vendaId],
    );
  });
}

export async function trocarPagamento(u: Usuario, pagamentoId: string, novaFormaId: string, motivo: string) {
  if (!UUID.test(pagamentoId) || !UUID.test(novaFormaId)) throw new ErroNegocio("Dados inválidos.");
  const m = motivo.trim();
  if (m.length < 5) throw new ErroNegocio("Escreva o motivo da troca.");
  await tx(u.id, async (c) => {
    const p = await c.query<{ venda_id: string; forma_id: string; tipo: string; troco_centavos: number }>(
      `select vp.venda_id, vp.forma_pagamento_id as forma_id, fp.tipo, vp.troco_centavos
         from venda_pagamentos vp join formas_pagamento fp on fp.id = vp.forma_pagamento_id join vendas v on v.id = vp.venda_id
        where vp.id = $1 and v.empresa_id = $2`,
      [pagamentoId, u.empresaId],
    );
    const pag = p.rows[0];
    if (!pag) throw new ErroNegocio("Pagamento não encontrado.");
    const v = await travarVendaDeTurnoAberto(c, u, pag.venda_id);
    if (v.operador_id !== u.id && !u.permissoes["caixa.reabrir"]) throw new ErroNegocio("Só o operador do turno ou um gerente pode trocar o pagamento.");
    if (pag.forma_id === novaFormaId) throw new ErroNegocio("Escolha uma forma diferente da atual.");
    const nova = await c.query<{ tipo: string }>(`select tipo from formas_pagamento where id = $1 and empresa_id = $2 and ativo`, [novaFormaId, u.empresaId]);
    if (!nova.rowCount) throw new ErroNegocio("Forma de pagamento inválida.");
    if (pag.troco_centavos > 0 && nova.rows[0].tipo !== "dinheiro") {
      throw new ErroNegocio("Este pagamento teve troco em dinheiro e não pode virar outra forma. Cancele a venda e registre de novo.");
    }
    await c.query(
      `insert into trocas_pagamento (venda_pagamento_id, de_forma_id, para_forma_id, usuario_id, motivo) values ($1,$2,$3,$4,$5)`,
      [pagamentoId, pag.forma_id, novaFormaId, u.id, m],
    );
    await c.query(`update venda_pagamentos set forma_pagamento_id = $1 where id = $2`, [novaFormaId, pagamentoId]);
  });
}

// ---------------------------------------------------------------------------
// Catálogo do caixa (também guardado no navegador para funcionar sem internet)
// ---------------------------------------------------------------------------

export type Catalogo = {
  geradoEm: string;
  bicos: { id: string; numero: number; combustivel: string; preco: string }[];
  formas: { id: string; nome: string; tipo: string }[];
  produtos: { id: string; codigo: string; nome: string; codigo_barras: string | null; unidade: string; preco: string }[];
  frentistas: { id: string; apelido: string }[];
};

export async function catalogo(empresaId: string): Promise<Catalogo> {
  const precoAgora = `(select pr.preco::text from precos pr join tipos_preco tp on tp.id = pr.tipo_preco_id and tp.padrao
      where pr.mercadoria_id = m.id and pr.vigente_desde <= now() and (pr.promocional_ate is null or pr.promocional_ate > now())
      order by pr.vigente_desde desc limit 1)`;
  const [bicos, formas, produtos, frentistas] = await Promise.all([
    q<Catalogo["bicos"][number]>(
      `select * from (select b.id, b.numero, m.nome as combustivel, ${precoAgora} as preco
         from bicos b join tanques t on t.id = b.tanque_id join mercadorias m on m.id = t.mercadoria_id
        where b.empresa_id = $1 and b.ativo) x where preco is not null order by numero`,
      [empresaId],
    ),
    q<Catalogo["formas"][number]>(
      `select id, nome, tipo from formas_pagamento where empresa_id = $1 and ativo
        order by case tipo when 'dinheiro' then 0 when 'pix' then 1 when 'debito' then 2 when 'credito' then 3 else 9 end, nome`,
      [empresaId],
    ),
    q<Catalogo["produtos"][number]>(
      `select * from (select m.id, m.codigo, m.nome, m.codigo_barras, un.sigla as unidade, ${precoAgora} as preco
         from mercadorias m join unidades un on un.id = m.unidade_id
        where m.empresa_id = $1 and m.ativo and m.tipo <> 'combustivel') x where preco is not null order by nome limit 5000`,
      [empresaId],
    ),
    q<Catalogo["frentistas"][number]>(
      `select x.id, x.apelido from usuarios x join usuario_empresas ue on ue.usuario_id = x.id and ue.empresa_id = $1
        where x.ativo and x.eh_frentista order by x.apelido`,
      [empresaId],
    ),
  ]);
  return { geradoEm: new Date().toISOString(), bicos, formas, produtos, frentistas };
}

// ---------------------------------------------------------------------------
// Relatório do turno: trocas de pagamento e vendas por frentista
// ---------------------------------------------------------------------------

export type TrocaPagamento = { id: string; created_at: string; de: string; para: string; valor_centavos: number; usuario: string; motivo: string };

export async function trocasDoTurno(empresaId: string, turnoId: string): Promise<TrocaPagamento[]> {
  return q<TrocaPagamento>(
    `select tp.id, tp.created_at, fd.nome as de, fpp.nome as para, vp.valor_centavos, u.apelido as usuario, tp.motivo
       from trocas_pagamento tp join venda_pagamentos vp on vp.id = tp.venda_pagamento_id join vendas v on v.id = vp.venda_id
       join formas_pagamento fd on fd.id = tp.de_forma_id join formas_pagamento fpp on fpp.id = tp.para_forma_id
       join usuarios u on u.id = tp.usuario_id
      where v.empresa_id = $1 and v.turno_id = $2 order by tp.created_at`,
    [empresaId, turnoId],
  );
}

export type PorFrentista = { frentista: string; vendas: number; total_centavos: number; litros: string };

export async function porFrentista(empresaId: string, turnoId: string): Promise<PorFrentista[]> {
  return q<PorFrentista>(
    `select coalesce(f.apelido, 'Sem frentista informado') as frentista, count(distinct v.id)::int as vendas,
            sum(v.total_centavos)::bigint as total_centavos,
            coalesce((select sum(vi.quantidade) from venda_itens vi join vendas v2 on v2.id = vi.venda_id
                       where v2.turno_id = $2 and v2.status = 'concluida' and vi.bico_id is not null
                         and v2.frentista_id is not distinct from v.frentista_id), 0)::numeric(14,3)::text as litros
       from vendas v left join usuarios f on f.id = v.frentista_id
      where v.empresa_id = $1 and v.turno_id = $2 and v.status = 'concluida'
      group by v.frentista_id, f.apelido order by f.apelido nulls last`,
    [empresaId, turnoId],
  );
}
