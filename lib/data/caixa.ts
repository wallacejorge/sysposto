import "server-only";
import bcrypt from "bcryptjs";
import { q, tx, type Tx } from "../db";
import type { Usuario } from "../session";
import { hojeNoPosto } from "../format";

/** Erro de regra de negócio: a mensagem vai direto para a tela. */
export class ErroNegocio extends Error {}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export type OpcaoLogin = { id: string; apelido: string; empresas: { id: string; nome: string }[] };

export async function opcoesDeLogin(): Promise<OpcaoLogin[]> {
  const linhas = await q<{ id: string; apelido: string; empresa_id: string; empresa_nome: string }>(
    `select u.id, u.apelido, e.id as empresa_id, e.nome_fantasia as empresa_nome
       from usuarios u
       join usuario_empresas ue on ue.usuario_id = u.id
       join empresas e on e.id = ue.empresa_id and e.ativo
      where u.ativo and u.pin_hash is not null
      order by u.apelido, e.nome_fantasia`,
  );
  const mapa = new Map<string, OpcaoLogin>();
  for (const l of linhas) {
    const o = mapa.get(l.id) ?? { id: l.id, apelido: l.apelido, empresas: [] };
    o.empresas.push({ id: l.empresa_id, nome: l.empresa_nome });
    mapa.set(l.id, o);
  }
  return [...mapa.values()];
}

export async function conferirPin(usuarioId: string, pin: string, empresaId: string): Promise<boolean> {
  const [u] = await q<{ pin_hash: string | null }>(
    `select u.pin_hash from usuarios u
       join usuario_empresas ue on ue.usuario_id = u.id and ue.empresa_id = $2
      where u.id = $1 and u.ativo`,
    [usuarioId, empresaId],
  );
  // Compara mesmo sem usuário, para o tempo de resposta não revelar quem existe.
  const hash = u?.pin_hash ?? "$2b$10$abcdefghijklmnopqrstuuJ6lS0Gr1.cfF5xG1NM2u3Yp1d8gZ1qa";
  const ok = await bcrypt.compare(pin, hash);
  return Boolean(u?.pin_hash) && ok;
}

// ---------------------------------------------------------------------------
// Turno
// ---------------------------------------------------------------------------

export type Turno = {
  id: string;
  caixa_id: string;
  caixa_nome: string;
  operador_id: string;
  operador: string;
  data_trabalho: string;
  status: "aberto" | "fechado" | "reaberto";
  fundo_troco_centavos: number;
  aberto_em: string;
  fechado_em: string | null;
  observacao_fechamento: string | null;
};

const SELECT_TURNO = `
  select t.id, t.caixa_id, c.nome as caixa_nome, t.operador_id, u.apelido as operador,
         to_char(t.data_trabalho, 'YYYY-MM-DD') as data_trabalho, t.status, t.fundo_troco_centavos,
         t.aberto_em, t.fechado_em, t.observacao_fechamento
    from turnos t join caixas c on c.id = t.caixa_id join usuarios u on u.id = t.operador_id`;

export async function turnoAbertoDo(usuario: Usuario): Promise<Turno | null> {
  const [t] = await q<Turno>(
    `${SELECT_TURNO} where t.empresa_id = $1 and t.operador_id = $2 and t.status in ('aberto','reaberto')`,
    [usuario.empresaId, usuario.id],
  );
  return t ?? null;
}

export async function buscarTurno(empresaId: string, turnoId: string): Promise<Turno | null> {
  if (!/^[0-9a-f-]{36}$/i.test(turnoId)) return null;
  const [t] = await q<Turno>(`${SELECT_TURNO} where t.empresa_id = $1 and t.id = $2`, [empresaId, turnoId]);
  return t ?? null;
}

export async function listarTurnos(empresaId: string, limite = 50): Promise<Turno[]> {
  return q<Turno>(`${SELECT_TURNO} where t.empresa_id = $1 order by t.aberto_em desc limit $2`, [empresaId, limite]);
}

export type BicoAbertura = {
  id: string;
  numero: number;
  bomba: number;
  combustivel: string;
  ultimo_final: string | null;
};

export async function dadosDeAbertura(empresaId: string) {
  const bicos = await q<BicoAbertura>(
    `select b.id, b.numero, bo.numero as bomba, m.nome as combustivel,
            (select e.final from encerrantes e join turnos t on t.id = e.turno_id
              where e.bico_id = b.id and e.final is not null
              order by t.fechado_em desc nulls last limit 1)::text as ultimo_final
       from bicos b join bombas bo on bo.id = b.bomba_id
       join tanques ta on ta.id = b.tanque_id join mercadorias m on m.id = ta.mercadoria_id
      where b.empresa_id = $1 and b.ativo
      order by b.numero`,
    [empresaId],
  );
  const caixas = await q<{ id: string; nome: string; ocupado_por: string | null }>(
    `select c.id, c.nome,
            (select u.apelido from turnos t join usuarios u on u.id = t.operador_id
              where t.caixa_id = c.id and t.status in ('aberto','reaberto')) as ocupado_por
       from caixas c where c.empresa_id = $1 and c.ativo order by c.numero`,
    [empresaId],
  );
  return { bicos, caixas };
}

export async function abrirTurno(
  usuario: Usuario,
  dados: { caixaId: string; fundoCentavos: number; iniciais: Record<string, string> },
): Promise<string> {
  return tx(usuario.id, async (c) => {
    const bicos = await c.query<{ id: string }>(`select id from bicos where empresa_id = $1 and ativo`, [usuario.empresaId]);
    for (const b of bicos.rows) {
      if (dados.iniciais[b.id] === undefined) throw new ErroNegocio("Informe o encerrante inicial de todos os bicos.");
    }
    const caixa = await c.query(`select 1 from caixas where id = $1 and empresa_id = $2 and ativo`, [dados.caixaId, usuario.empresaId]);
    if (!caixa.rowCount) throw new ErroNegocio("Caixa não encontrado.");
    try {
      const t = await c.query<{ id: string }>(
        `insert into turnos (empresa_id, caixa_id, operador_id, data_trabalho, fundo_troco_centavos)
         values ($1,$2,$3,$4,$5) returning id`,
        [usuario.empresaId, dados.caixaId, usuario.id, hojeNoPosto(), dados.fundoCentavos],
      );
      for (const b of bicos.rows) {
        await c.query(`insert into encerrantes (turno_id, bico_id, inicial) values ($1,$2,$3)`, [t.rows[0].id, b.id, dados.iniciais[b.id]]);
      }
      return t.rows[0].id;
    } catch (e) {
      const msg = (e as { constraint?: string }).constraint;
      if (msg === "um_turno_aberto_por_caixa") throw new ErroNegocio("Este caixa já tem um turno aberto por outro operador.");
      if (msg === "um_turno_aberto_por_operador") throw new ErroNegocio("Você já tem um turno aberto.");
      throw e;
    }
  });
}

// ---------------------------------------------------------------------------
// Abastecimentos
// ---------------------------------------------------------------------------

export type Abastecimento = {
  id: string;
  bico: number;
  combustivel: string;
  litros: string;
  preco_unitario: string;
  total_centavos: number;
  fim: string;
  origem: "automacao" | "manual";
};

export async function abastecimentosPendentes(empresaId: string): Promise<Abastecimento[]> {
  return q<Abastecimento>(
    `select a.id, b.numero as bico, m.nome as combustivel, a.litros::text, a.preco_unitario::text,
            a.total_centavos, to_json(a.fim)#>>'{}' as fim, a.origem
       from abastecimentos a join bicos b on b.id = a.bico_id
       join tanques t on t.id = b.tanque_id join mercadorias m on m.id = t.mercadoria_id
      where a.empresa_id = $1 and a.status = 'pendente'
      order by a.fim`,
    [empresaId],
  );
}

export type BicoVenda = { id: string; numero: number; combustivel: string; preco: string };

/** Bicos com o preço à vista em vigor agora. */
export async function bicosComPreco(empresaId: string): Promise<BicoVenda[]> {
  return q<BicoVenda>(
    `select b.id, b.numero, m.nome as combustivel, p.preco::text as preco
       from bicos b join tanques t on t.id = b.tanque_id join mercadorias m on m.id = t.mercadoria_id
       join lateral (
         select pr.preco from precos pr join tipos_preco tp on tp.id = pr.tipo_preco_id and tp.padrao
          where pr.mercadoria_id = m.id and pr.vigente_desde <= now()
            and (pr.promocional_ate is null or pr.promocional_ate > now())
          order by pr.vigente_desde desc limit 1) p on true
      where b.empresa_id = $1 and b.ativo
      order by b.numero`,
    [empresaId],
  );
}

// ---------------------------------------------------------------------------
// Venda
// ---------------------------------------------------------------------------

export type FormaPagamento = { id: string; nome: string; tipo: string; conta_no_caixa: boolean };

export async function formasDePagamento(empresaId: string): Promise<FormaPagamento[]> {
  return q<FormaPagamento>(
    `select id, nome, tipo, conta_no_caixa from formas_pagamento where empresa_id = $1 and ativo
      order by case tipo when 'dinheiro' then 0 when 'pix' then 1 when 'debito' then 2 when 'credito' then 3 else 9 end, nome`,
    [empresaId],
  );
}

// ---------------------------------------------------------------------------
// Movimentos de caixa
// ---------------------------------------------------------------------------

export const TIPOS_MOVIMENTO = {
  sangria: "Sangria (retirada para o cofre)",
  suprimento: "Suprimento (troco colocado)",
  despesa: "Despesa paga com dinheiro do caixa",
  receita: "Outra entrada de dinheiro",
} as const;
export type TipoMovimento = keyof typeof TIPOS_MOVIMENTO;

// ---------------------------------------------------------------------------
// Resumo e fechamento
// ---------------------------------------------------------------------------

export type LinhaForma = { forma_id: string; nome: string; tipo: string; vendas_centavos: number; esperado_centavos: number; informado_centavos: number | null; diferenca_centavos: number | null; justificativa: string | null };
export type LinhaBico = { bico_id: string; numero: number; combustivel: string; inicial: string; final: string | null; virou: boolean; litros_encerrante: string | null; litros_vendidos: string; diferenca_litros: string | null };
export type Movimento = { id: string; tipo: TipoMovimento; valor_centavos: number; motivo: string; created_at: string; usuario: string };
export type VendaResumo = { id: string; criada_em: string; total_centavos: number; status: string; itens: string; forma: string };

export type Resumo = {
  turno: Turno;
  formas: LinhaForma[];
  bicos: LinhaBico[];
  movimentos: Movimento[];
  vendas: VendaResumo[];
  totais: { vendas_centavos: number; esperado_centavos: number; informado_centavos: number | null; diferenca_centavos: number | null; litros_vendidos: string };
};

async function calcularEsperado(c: Tx | null, turno: Turno, empresaId: string) {
  const run = <T,>(sql: string, p: unknown[]) => (c ? c.query(sql, p).then((r) => r.rows as T[]) : q<T>(sql, p));
  const formas = await run<{ forma_id: string; nome: string; tipo: string; conta_no_caixa: boolean; vendas_centavos: number }>(
    `select fp.id as forma_id, fp.nome, fp.tipo, fp.conta_no_caixa,
            coalesce((select sum(vp.valor_centavos - vp.troco_centavos)
                        from venda_pagamentos vp join vendas v on v.id = vp.venda_id
                       where v.turno_id = $1 and v.status = 'concluida' and vp.forma_pagamento_id = fp.id), 0)::bigint as vendas_centavos
       from formas_pagamento fp where fp.empresa_id = $2 and fp.ativo
      order by case fp.tipo when 'dinheiro' then 0 when 'pix' then 1 when 'debito' then 2 when 'credito' then 3 else 9 end, fp.nome`,
    [turno.id, empresaId],
  );
  const [mov] = await run<{ entra: number; sai: number }>(
    `select coalesce(sum(valor_centavos) filter (where tipo in ('suprimento','receita')),0)::bigint as entra,
            coalesce(sum(valor_centavos) filter (where tipo in ('sangria','despesa')),0)::bigint as sai
       from movimentos_caixa where turno_id = $1`,
    [turno.id],
  );
  let fundoUsado = false;
  return formas.map((f) => {
    let esperado = f.vendas_centavos;
    if (f.tipo === "dinheiro" && !fundoUsado) {
      esperado += turno.fundo_troco_centavos + mov.entra - mov.sai;
      fundoUsado = true;
    }
    return { ...f, esperado_centavos: esperado };
  });
}

export async function resumoDoTurno(empresaId: string, turnoId: string): Promise<Resumo | null> {
  const turno = await buscarTurno(empresaId, turnoId);
  if (!turno) return null;
  const esperado = await calcularEsperado(null, turno, empresaId);
  const conf = await q<{ forma_pagamento_id: string; informado_centavos: number; diferenca_centavos: number; justificativa: string | null }>(
    `select forma_pagamento_id, informado_centavos, diferenca_centavos, justificativa from conferencias where turno_id = $1`,
    [turnoId],
  );
  const formas: LinhaForma[] = esperado.map((f) => {
    const cf = conf.find((x) => x.forma_pagamento_id === f.forma_id);
    return {
      forma_id: f.forma_id, nome: f.nome, tipo: f.tipo, vendas_centavos: f.vendas_centavos,
      // Depois de fechado, vale o esperado gravado na conferência (o que o operador viu).
      esperado_centavos: cf ? cf.informado_centavos - cf.diferenca_centavos : f.esperado_centavos,
      informado_centavos: cf?.informado_centavos ?? null,
      diferenca_centavos: cf?.diferenca_centavos ?? null,
      justificativa: cf?.justificativa ?? null,
    };
  });
  const bicos = await q<LinhaBico>(
    `select b.id as bico_id, b.numero, m.nome as combustivel, el.inicial::text, el.final::text, el.virou,
            el.litros::text as litros_encerrante,
            coalesce((select sum(vi.quantidade) from venda_itens vi join vendas v on v.id = vi.venda_id
                       where v.turno_id = $1 and v.status = 'concluida' and vi.bico_id = b.id), 0)::numeric(14,3)::text as litros_vendidos,
            (el.litros - coalesce((select sum(vi.quantidade) from venda_itens vi join vendas v on v.id = vi.venda_id
                       where v.turno_id = $1 and v.status = 'concluida' and vi.bico_id = b.id), 0))::numeric(14,3)::text as diferenca_litros
       from encerrantes_litros el join bicos b on b.id = el.bico_id
       join tanques t on t.id = b.tanque_id join mercadorias m on m.id = t.mercadoria_id
      where el.turno_id = $1 order by b.numero`,
    [turnoId],
  );
  const movimentos = await q<Movimento>(
    `select m.id, m.tipo, m.valor_centavos, m.motivo, m.created_at, u.apelido as usuario
       from movimentos_caixa m join usuarios u on u.id = m.usuario_id where m.turno_id = $1 order by m.created_at`,
    [turnoId],
  );
  const vendas = await q<VendaResumo>(
    `select v.id, v.criada_em, v.total_centavos, v.status,
            (select string_agg('Bico ' || lpad(b.numero::text, 2, '0') || ' ' || replace(to_char(vi.quantidade, 'FM999999990.000'), '.', ',') || ' L', ', ' order by vi.ordem)
               from venda_itens vi left join bicos b on b.id = vi.bico_id where vi.venda_id = v.id) as itens,
            (select string_agg(fp.nome, ' + ') from venda_pagamentos vp join formas_pagamento fp on fp.id = vp.forma_pagamento_id
              where vp.venda_id = v.id) as forma
       from vendas v where v.turno_id = $1 order by v.criada_em`,
    [turnoId],
  );
  const soma = (k: keyof LinhaForma) => formas.reduce((s, f) => s + Number(f[k] ?? 0), 0);
  const fechado = formas.some((f) => f.informado_centavos !== null);
  return {
    turno, formas, bicos, movimentos, vendas,
    totais: {
      vendas_centavos: soma("vendas_centavos"),
      esperado_centavos: soma("esperado_centavos"),
      informado_centavos: fechado ? soma("informado_centavos") : null,
      diferenca_centavos: fechado ? soma("diferenca_centavos") : null,
      litros_vendidos: bicos.reduce((s, b) => s + Number(b.litros_vendidos), 0).toFixed(3),
    },
  };
}

export function limiteDiferenca(): number {
  const n = Number(process.env.LIMITE_DIFERENCA_CENTAVOS ?? 500);
  return Number.isFinite(n) && n >= 0 ? n : 500;
}

export async function fecharTurno(
  usuario: Usuario,
  dados: {
    turnoId: string;
    finais: Record<string, { final: string; virou: boolean }>;
    contados: Record<string, number>;
    justificativa: string;
  },
): Promise<void> {
  await tx(usuario.id, async (c) => {
    const tr = await c.query<{ id: string; operador_id: string; status: string }>(
      `select id, operador_id, status from turnos where id = $1 and empresa_id = $2 for update`,
      [dados.turnoId, usuario.empresaId],
    );
    const t0 = tr.rows[0];
    if (!t0) throw new ErroNegocio("Turno não encontrado.");
    if (t0.status === "fechado") throw new ErroNegocio("Este turno já foi fechado.");
    if (t0.operador_id !== usuario.id && !usuario.permissoes["caixa.reabrir"]) {
      throw new ErroNegocio("Só o operador do turno ou um gerente pode fechá-lo.");
    }

    const enc = await c.query<{ bico_id: string; inicial: string; numero: number }>(
      `select e.bico_id, e.inicial::text, b.numero from encerrantes e join bicos b on b.id = e.bico_id where e.turno_id = $1`,
      [dados.turnoId],
    );
    for (const e of enc.rows) {
      const f = dados.finais[e.bico_id];
      if (!f || f.final === "") throw new ErroNegocio(`Informe o encerrante final do bico ${e.numero}.`);
      if (!f.virou && Number(f.final) < Number(e.inicial)) {
        throw new ErroNegocio(`Bico ${e.numero}: o encerrante final é menor que o inicial. Se o totalizador zerou, marque "virou".`);
      }
      await c.query(`update encerrantes set final = $1, virou = $2 where turno_id = $3 and bico_id = $4`, [f.final, f.virou, dados.turnoId, e.bico_id]);
    }

    const turno = (await c.query<Turno>(`${SELECT_TURNO} where t.id = $1`, [dados.turnoId])).rows[0];
    const esperado = await calcularEsperado(c, turno, usuario.empresaId);
    let maiorDiferenca = 0;
    for (const f of esperado) {
      const informado = dados.contados[f.forma_id];
      if (informado === undefined || informado < 0) throw new ErroNegocio(`Informe o valor contado em ${f.nome}.`);
      maiorDiferenca = Math.max(maiorDiferenca, Math.abs(informado - f.esperado_centavos));
      await c.query(
        `insert into conferencias (turno_id, forma_pagamento_id, esperado_centavos, informado_centavos, justificativa)
         values ($1,$2,$3,$4,$5)
         on conflict (turno_id, forma_pagamento_id) do update set esperado_centavos = excluded.esperado_centavos,
           informado_centavos = excluded.informado_centavos, justificativa = excluded.justificativa`,
        [dados.turnoId, f.forma_id, f.esperado_centavos, informado, dados.justificativa.trim() || null],
      );
    }
    if (maiorDiferenca > limiteDiferenca() && dados.justificativa.trim().length < 10) {
      throw new ErroNegocio("Há diferença no caixa acima do limite. Explique o motivo (pelo menos 10 letras).");
    }
    await c.query(
      `update turnos set status = 'fechado', fechado_em = now(), fechado_por = $2, observacao_fechamento = $3, updated_at = now() where id = $1`,
      [dados.turnoId, usuario.id, dados.justificativa.trim() || null],
    );
  });
}

/** Números do painel: hoje, no posto. */
export async function painelDoDia(empresaId: string) {
  const hoje = hojeNoPosto();
  const [v] = await q<{ total: number; vendas: number }>(
    `select coalesce(sum(v.total_centavos),0)::bigint as total, count(*)::int as vendas
       from vendas v join turnos t on t.id = v.turno_id
      where v.empresa_id = $1 and v.status = 'concluida' and t.data_trabalho = $2`,
    [empresaId, hoje],
  );
  const porCombustivel = await q<{ combustivel: string; litros: string; total: number }>(
    `select m.nome as combustivel, sum(vi.quantidade)::numeric(14,3)::text as litros, sum(vi.total_centavos)::bigint as total
       from venda_itens vi join vendas v on v.id = vi.venda_id join turnos t on t.id = v.turno_id
       join mercadorias m on m.id = vi.mercadoria_id
      where v.empresa_id = $1 and v.status = 'concluida' and t.data_trabalho = $2 and m.tipo = 'combustivel'
      group by m.nome order by m.nome`,
    [empresaId, hoje],
  );
  const abertos = await q<{ id: string; operador: string; caixa: string; aberto_em: string }>(
    `select t.id, u.apelido as operador, c.nome as caixa, t.aberto_em from turnos t
       join usuarios u on u.id = t.operador_id join caixas c on c.id = t.caixa_id
      where t.empresa_id = $1 and t.status in ('aberto','reaberto') order by t.aberto_em`,
    [empresaId],
  );
  const [pend] = await q<{ n: number }>(`select count(*)::int as n from abastecimentos where empresa_id = $1 and status = 'pendente'`, [empresaId]);
  const diferencas = await q<{ id: string; operador: string; data: string; diferenca: number }>(
    `select t.id, u.apelido as operador, to_char(t.data_trabalho,'DD/MM/YYYY') as data, sum(cf.diferenca_centavos)::bigint as diferenca
       from turnos t join usuarios u on u.id = t.operador_id join conferencias cf on cf.turno_id = t.id
      where t.empresa_id = $1 and t.status = 'fechado' and t.data_trabalho >= ($2::date - 7)
      group by t.id, u.apelido, t.data_trabalho having sum(cf.diferenca_centavos) <> 0
      order by t.data_trabalho desc limit 5`,
    [empresaId, hoje],
  );
  return { hoje, total: v.total, vendas: v.vendas, porCombustivel, abertos, pendentes: pend.n, diferencas };
}
