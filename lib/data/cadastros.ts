import "server-only";
import bcrypt from "bcryptjs";
import { q, tx, type Tx } from "../db";
import type { Usuario } from "../session";
import { ErroNegocio } from "./caixa";

// Regras e consultas dos cadastros. Nada se apaga: registros usados em vendas são desativados.
// Toda escrita passa por tx() (auditoria) e é sempre restrita à empresa do usuário.

/** Traduz violações de unicidade do banco para mensagens de tela. */
async function comMensagens<T>(fn: () => Promise<T>, mensagens: Record<string, string>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const err = e as { code?: string; constraint?: string };
    if (err.code === "23505" || err.code === "23514" || err.code === "23503") {
      const msg = err.constraint ? mensagens[err.constraint] : undefined;
      if (msg) throw new ErroNegocio(msg);
      if (err.code === "23505") throw new ErroNegocio("Já existe um cadastro com esses dados.");
      if (err.code === "23503") throw new ErroNegocio("Este cadastro está em uso e não pode ser alterado assim.");
    }
    throw e;
  }
}

const uuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

// ===========================================================================
// Grupos, unidades, tipos de preço
// ===========================================================================

export type Grupo = { id: string; nome: string; pai_id: string | null; pai_nome: string | null; mercadorias: number };

export async function listarGrupos(empresaId: string): Promise<Grupo[]> {
  return q<Grupo>(
    `select g.id, g.nome, g.pai_id, p.nome as pai_nome,
            (select count(*)::int from mercadorias m where m.grupo_id = g.id) as mercadorias
       from grupos g left join grupos p on p.id = g.pai_id
      where g.empresa_id = $1
      order by coalesce(p.nome, g.nome), g.pai_id nulls first, g.nome`,
    [empresaId],
  );
}

export async function salvarGrupo(u: Usuario, d: { id?: string; nome: string; paiId: string | null }) {
  if (d.paiId) {
    const [pai] = await q<{ pai_id: string | null }>(`select pai_id from grupos where id = $1 and empresa_id = $2`, [d.paiId, u.empresaId]);
    if (!pai) throw new ErroNegocio("Grupo principal não encontrado.");
    if (pai.pai_id) throw new ErroNegocio("Um sub-grupo não pode ter outro sub-grupo.");
    if (d.paiId === d.id) throw new ErroNegocio("Um grupo não pode ser sub-grupo dele mesmo.");
  }
  await tx(u.id, async (c) => {
    if (d.id) {
      const r = await c.query(`update grupos set nome = $1, pai_id = $2, updated_at = now() where id = $3 and empresa_id = $4`, [d.nome, d.paiId, d.id, u.empresaId]);
      if (!r.rowCount) throw new ErroNegocio("Grupo não encontrado.");
    } else {
      await c.query(`insert into grupos (empresa_id, nome, pai_id) values ($1,$2,$3)`, [u.empresaId, d.nome, d.paiId]);
    }
  });
}

export type Unidade = { id: string; sigla: string; descricao: string };
export async function listarUnidades(): Promise<Unidade[]> {
  return q<Unidade>(`select id, sigla, descricao from unidades order by sigla`);
}
export async function criarUnidade(u: Usuario, d: { sigla: string; descricao: string }) {
  await comMensagens(
    () => tx(u.id, (c) => c.query(`insert into unidades (sigla, descricao) values ($1,$2)`, [d.sigla.toUpperCase(), d.descricao])),
    { unidades_sigla_key: "Já existe uma unidade com essa sigla." },
  );
}

export type TipoPreco = { id: string; nome: string; padrao: boolean };
export async function listarTiposPreco(empresaId: string): Promise<TipoPreco[]> {
  return q<TipoPreco>(`select id, nome, padrao from tipos_preco where empresa_id = $1 order by padrao desc, nome`, [empresaId]);
}
export async function criarTipoPreco(u: Usuario, nome: string) {
  await comMensagens(
    () => tx(u.id, (c) => c.query(`insert into tipos_preco (empresa_id, nome) values ($1,$2)`, [u.empresaId, nome])),
    { tipos_preco_empresa_id_nome_key: "Já existe um tipo de preço com esse nome." },
  );
}

// ===========================================================================
// Mercadorias e preços
// ===========================================================================

export type MercadoriaLista = {
  id: string; codigo: string; nome: string; tipo: "combustivel" | "produto" | "servico"; grupo: string | null;
  unidade: string; preco: string | null; ativo: boolean; tributacao: string | null; revisar: boolean;
};

export async function listarMercadorias(empresaId: string, f: { busca?: string; tipo?: string; inativos?: boolean }): Promise<MercadoriaLista[]> {
  return q<MercadoriaLista>(
    `select m.id, m.codigo, m.nome, m.tipo, g.nome as grupo, un.sigla as unidade, m.ativo,
            tr.nome as tributacao, coalesce(tr.revisar, false) as revisar,
            (select pr.preco::text from precos pr join tipos_preco tp on tp.id = pr.tipo_preco_id and tp.padrao
              where pr.mercadoria_id = m.id and pr.vigente_desde <= now() and (pr.promocional_ate is null or pr.promocional_ate > now())
              order by pr.vigente_desde desc limit 1) as preco
       from mercadorias m join unidades un on un.id = m.unidade_id left join grupos g on g.id = m.grupo_id
       left join tributacoes tr on tr.id = m.tributacao_id
      where m.empresa_id = $1
        and ($2::text is null or m.nome ilike '%' || $2 || '%' or m.codigo ilike $2 || '%' or m.codigo_barras = $2)
        and ($3::text is null or m.tipo = $3)
        and ($4 or m.ativo)
      order by m.tipo = 'combustivel' desc, m.nome
      limit 500`,
    [empresaId, f.busca?.trim() || null, f.tipo || null, Boolean(f.inativos)],
  );
}

export type Mercadoria = {
  id: string; codigo: string; nome: string; tipo: "combustivel" | "produto" | "servico"; grupo_id: string | null;
  unidade_id: string; codigo_barras: string | null; ncm: string | null; cest: string | null;
  codigo_anp: string | null; descricao_anp: string | null; ativo: boolean;
  tributacao_id: string | null; p_bio: string | null; kg_por_unidade: string | null;
};

export async function buscarMercadoria(empresaId: string, id: string): Promise<Mercadoria | null> {
  if (!uuid(id)) return null;
  const [m] = await q<Mercadoria>(
    `select id, codigo, nome, tipo, grupo_id, unidade_id, codigo_barras, ncm, cest, codigo_anp, descricao_anp, ativo,
            tributacao_id, p_bio::text, kg_por_unidade::text
       from mercadorias where id = $1 and empresa_id = $2`,
    [id, empresaId],
  );
  return m ?? null;
}

export type DadosMercadoria = Omit<Mercadoria, "id"> & { id?: string };

export async function salvarMercadoria(u: Usuario, d: DadosMercadoria): Promise<string> {
  if (d.tipo === "combustivel" && !d.codigo_anp) throw new ErroNegocio("Combustível precisa do código ANP.");
  if (d.grupo_id) {
    const [g] = await q(`select 1 from grupos where id = $1 and empresa_id = $2`, [d.grupo_id, u.empresaId]);
    if (!g) throw new ErroNegocio("Grupo inválido.");
  }
  if (d.tributacao_id) {
    const [t] = await q(`select 1 from tributacoes where id = $1 and empresa_id = $2`, [d.tributacao_id, u.empresaId]);
    if (!t) throw new ErroNegocio("Tributação inválida.");
  }
  if (d.id && !d.ativo) {
    const [emUso] = await q(`select 1 from tanques where mercadoria_id = $1 and ativo`, [d.id]);
    if (emUso) throw new ErroNegocio("Este combustível está em um tanque ativo. Desative o tanque primeiro.");
  }
  const campos = [d.codigo, d.nome, d.tipo, d.grupo_id, d.unidade_id, d.codigo_barras, d.ncm, d.cest,
    d.codigo_anp, d.codigo_anp ? d.descricao_anp : null, d.ativo,
    d.tributacao_id, d.tipo === "combustivel" ? d.p_bio : null, d.kg_por_unidade];
  return comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          const r = await c.query(
            `update mercadorias set codigo=$1, nome=$2, tipo=$3, grupo_id=$4, unidade_id=$5, codigo_barras=$6, ncm=$7, cest=$8,
                    codigo_anp=$9, descricao_anp=$10, ativo=$11, tributacao_id=$12, p_bio=$13, kg_por_unidade=$14, updated_at=now()
              where id = $15 and empresa_id = $16`,
            [...campos, d.id, u.empresaId],
          );
          if (!r.rowCount) throw new ErroNegocio("Mercadoria não encontrada.");
          return d.id;
        }
        const r = await c.query<{ id: string }>(
          `insert into mercadorias (codigo, nome, tipo, grupo_id, unidade_id, codigo_barras, ncm, cest, codigo_anp, descricao_anp, ativo,
                                   tributacao_id, p_bio, kg_por_unidade, empresa_id)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) returning id`,
          [...campos, u.empresaId],
        );
        return r.rows[0].id;
      }),
    { mercadorias_empresa_id_codigo_key: "Já existe uma mercadoria com esse código.", combustivel_tem_anp: "Combustível precisa do código ANP." },
  );
}

export type PrecoHistorico = {
  id: string; tipo_preco: string; preco: string; vigente_desde: string; promocional_ate: string | null; alterado_por: string | null;
  situacao: "vigente" | "agendado" | "substituido" | "promocao_encerrada";
};

export async function historicoPrecos(empresaId: string, mercadoriaId: string): Promise<PrecoHistorico[]> {
  return q<PrecoHistorico>(
    `with h as (
       select pr.id, tp.nome as tipo_preco, pr.tipo_preco_id, pr.preco::text, pr.vigente_desde, pr.promocional_ate, u.apelido as alterado_por,
              (select x.id from precos x where x.mercadoria_id = pr.mercadoria_id and x.tipo_preco_id = pr.tipo_preco_id
                 and x.vigente_desde <= now() and (x.promocional_ate is null or x.promocional_ate > now())
               order by x.vigente_desde desc limit 1) as vigente_id
         from precos pr join tipos_preco tp on tp.id = pr.tipo_preco_id left join usuarios u on u.id = pr.alterado_por
        where pr.mercadoria_id = $1 and pr.empresa_id = $2)
     select id, tipo_preco, preco, vigente_desde, promocional_ate, alterado_por,
            case when id = vigente_id then 'vigente'
                 when vigente_desde > now() then 'agendado'
                 when promocional_ate is not null and promocional_ate <= now() then 'promocao_encerrada'
                 else 'substituido' end as situacao
       from h order by vigente_desde desc limit 100`,
    [mercadoriaId, empresaId],
  );
}

export async function alterarPreco(
  u: Usuario,
  d: { mercadoriaId: string; tipoPrecoId: string; preco: string; aPartirDe: Date | null; promocionalAte: Date | null },
) {
  if (Number(d.preco) <= 0) throw new ErroNegocio("O preço tem de ser maior que zero.");
  const inicio = d.aPartirDe ?? new Date();
  if (d.aPartirDe && d.aPartirDe.getTime() < Date.now() - 60_000) throw new ErroNegocio("A data de início não pode estar no passado.");
  if (d.promocionalAte && d.promocionalAte <= inicio) throw new ErroNegocio("O fim da promoção tem de ser depois do início.");
  const [ok] = await q(
    `select 1 from mercadorias m join tipos_preco tp on tp.empresa_id = m.empresa_id and tp.id = $2
      where m.id = $1 and m.empresa_id = $3`,
    [d.mercadoriaId, d.tipoPrecoId, u.empresaId],
  );
  if (!ok) throw new ErroNegocio("Mercadoria ou tipo de preço inválido.");
  await tx(u.id, (c) =>
    c.query(
      `insert into precos (empresa_id, mercadoria_id, tipo_preco_id, preco, vigente_desde, promocional_ate, alterado_por)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [u.empresaId, d.mercadoriaId, d.tipoPrecoId, d.preco, inicio, d.promocionalAte, u.id],
    ),
  );
}

/** Desfaz um preço agendado que ainda não começou (o histórico de preços já usados nunca muda). */
export async function cancelarPrecoAgendado(u: Usuario, precoId: string) {
  await tx(u.id, async (c) => {
    const r = await c.query(`delete from precos where id = $1 and empresa_id = $2 and vigente_desde > now()`, [precoId, u.empresaId]);
    if (!r.rowCount) throw new ErroNegocio("Só dá para cancelar um preço que ainda não começou a valer.");
  });
}

// ===========================================================================
// Tanques, bombas, bicos
// ===========================================================================

export type Tanque = { id: string; numero: number; mercadoria_id: string; combustivel: string; capacidade_litros: string; ativo: boolean; bicos: number };
export type Bomba = { id: string; numero: number; ativo: boolean; bicos: number };
export type Bico = {
  id: string; numero: number; bomba_id: string; bomba: number; tanque_id: string; tanque: number; combustivel: string;
  encerrante_maximo: string; ativo: boolean;
};

export async function estruturaDoPosto(empresaId: string) {
  const [tanques, bombas, bicos] = await Promise.all([
    q<Tanque>(
      `select t.id, t.numero, t.mercadoria_id, m.nome as combustivel, t.capacidade_litros::text, t.ativo,
              (select count(*)::int from bicos b where b.tanque_id = t.id and b.ativo) as bicos
         from tanques t join mercadorias m on m.id = t.mercadoria_id where t.empresa_id = $1 order by t.numero`,
      [empresaId],
    ),
    q<Bomba>(
      `select bo.id, bo.numero, bo.ativo, (select count(*)::int from bicos b where b.bomba_id = bo.id and b.ativo) as bicos
         from bombas bo where bo.empresa_id = $1 order by bo.numero`,
      [empresaId],
    ),
    q<Bico>(
      `select b.id, b.numero, b.bomba_id, bo.numero as bomba, b.tanque_id, t.numero as tanque, m.nome as combustivel,
              b.encerrante_maximo::text, b.ativo
         from bicos b join bombas bo on bo.id = b.bomba_id join tanques t on t.id = b.tanque_id join mercadorias m on m.id = t.mercadoria_id
        where b.empresa_id = $1 order by b.numero`,
      [empresaId],
    ),
  ]);
  return { tanques, bombas, bicos };
}

/** Bico, tanque ou bomba não muda com turno aberto que usa ele: o encerrante do turno ficaria sem sentido. */
async function exigirSemTurnoAberto(c: Tx, empresaId: string, oQue: string) {
  const r = await c.query(`select 1 from turnos where empresa_id = $1 and status in ('aberto','reaberto') limit 1`, [empresaId]);
  if (r.rowCount) throw new ErroNegocio(`Há turno aberto. Feche todos os turnos antes de alterar ${oQue}.`);
}

export async function salvarTanque(u: Usuario, d: { id?: string; numero: number; mercadoriaId: string; capacidade: string; ativo: boolean }) {
  const [m] = await q<{ tipo: string }>(`select tipo from mercadorias where id = $1 and empresa_id = $2 and ativo`, [d.mercadoriaId, u.empresaId]);
  if (!m || m.tipo !== "combustivel") throw new ErroNegocio("Escolha um combustível ativo.");
  if (!(Number(d.capacidade) > 0)) throw new ErroNegocio("Informe a capacidade em litros.");
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          const atual = await c.query<{ mercadoria_id: string; ativo: boolean }>(`select mercadoria_id, ativo from tanques where id = $1 and empresa_id = $2`, [d.id, u.empresaId]);
          if (!atual.rowCount) throw new ErroNegocio("Tanque não encontrado.");
          if (atual.rows[0].mercadoria_id !== d.mercadoriaId || atual.rows[0].ativo !== d.ativo) await exigirSemTurnoAberto(c, u.empresaId, "o combustível ou a situação do tanque");
          if (!d.ativo) {
            const b = await c.query(`select 1 from bicos where tanque_id = $1 and ativo`, [d.id]);
            if (b.rowCount) throw new ErroNegocio("Há bicos ativos ligados a este tanque. Desative ou mude os bicos primeiro.");
          }
          await c.query(`update tanques set numero=$1, mercadoria_id=$2, capacidade_litros=$3, ativo=$4 where id=$5 and empresa_id=$6`,
            [d.numero, d.mercadoriaId, d.capacidade, d.ativo, d.id, u.empresaId]);
        } else {
          await c.query(`insert into tanques (empresa_id, numero, mercadoria_id, capacidade_litros, ativo) values ($1,$2,$3,$4,$5)`,
            [u.empresaId, d.numero, d.mercadoriaId, d.capacidade, d.ativo]);
        }
      }),
    { tanques_empresa_id_numero_key: "Já existe um tanque com esse número." },
  );
}

export async function salvarBomba(u: Usuario, d: { id?: string; numero: number; ativo: boolean }) {
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          if (!d.ativo) {
            const b = await c.query(`select 1 from bicos where bomba_id = $1 and ativo`, [d.id]);
            if (b.rowCount) throw new ErroNegocio("Há bicos ativos nesta bomba. Desative os bicos primeiro.");
          }
          const r = await c.query(`update bombas set numero=$1, ativo=$2 where id=$3 and empresa_id=$4`, [d.numero, d.ativo, d.id, u.empresaId]);
          if (!r.rowCount) throw new ErroNegocio("Bomba não encontrada.");
        } else {
          await c.query(`insert into bombas (empresa_id, numero, ativo) values ($1,$2,$3)`, [u.empresaId, d.numero, d.ativo]);
        }
      }),
    { bombas_empresa_id_numero_key: "Já existe uma bomba com esse número." },
  );
}

export async function salvarBico(u: Usuario, d: { id?: string; numero: number; bombaId: string; tanqueId: string; encerranteMaximo: string; ativo: boolean }) {
  const [ok] = await q(
    `select 1 from bombas bo, tanques t where bo.id = $1 and t.id = $2 and bo.empresa_id = $3 and t.empresa_id = $3 and bo.ativo and t.ativo`,
    [d.bombaId, d.tanqueId, u.empresaId],
  );
  if (!ok) throw new ErroNegocio("Escolha uma bomba e um tanque ativos.");
  if (!(Number(d.encerranteMaximo) > 0)) throw new ErroNegocio("Informe o valor máximo do encerrante (ex.: 999.999,999).");
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          const atual = await c.query<{ tanque_id: string; ativo: boolean; numero: number }>(`select tanque_id, ativo, numero from bicos where id = $1 and empresa_id = $2`, [d.id, u.empresaId]);
          if (!atual.rowCount) throw new ErroNegocio("Bico não encontrado.");
          const a = atual.rows[0];
          if (a.tanque_id !== d.tanqueId || a.ativo !== d.ativo || a.numero !== d.numero) await exigirSemTurnoAberto(c, u.empresaId, "número, tanque ou situação de um bico");
          await c.query(`update bicos set numero=$1, bomba_id=$2, tanque_id=$3, encerrante_maximo=$4, ativo=$5 where id=$6 and empresa_id=$7`,
            [d.numero, d.bombaId, d.tanqueId, d.encerranteMaximo, d.ativo, d.id, u.empresaId]);
        } else {
          await exigirSemTurnoAberto(c, u.empresaId, "a lista de bicos");
          await c.query(`insert into bicos (empresa_id, numero, bomba_id, tanque_id, encerrante_maximo, ativo) values ($1,$2,$3,$4,$5,$6)`,
            [u.empresaId, d.numero, d.bombaId, d.tanqueId, d.encerranteMaximo, d.ativo]);
        }
      }),
    { bicos_empresa_id_numero_key: "Já existe um bico com esse número." },
  );
}

// ===========================================================================
// Formas de pagamento, administradoras, caixas
// ===========================================================================

export const TIPOS_PAGAMENTO = {
  dinheiro: { nome: "Dinheiro", sefaz: "01" },
  pix: { nome: "PIX", sefaz: "17" },
  debito: { nome: "Cartão de débito", sefaz: "04" },
  credito: { nome: "Cartão de crédito", sefaz: "03" },
  cheque: { nome: "Cheque", sefaz: "02" },
  prazo: { nome: "A prazo (nota do cliente)", sefaz: "05" },
  vale: { nome: "Vale", sefaz: "99" },
} as const;
export type TipoPagamento = keyof typeof TIPOS_PAGAMENTO;

export type Forma = { id: string; nome: string; tipo: TipoPagamento; codigo_sefaz: string; administradora_id: string | null; administradora: string | null; conta_no_caixa: boolean; ativo: boolean };
export type Administradora = { id: string; nome: string; cnpj: string | null; taxa_debito: string | null; taxa_credito: string | null; dias_repasse_debito: number | null; dias_repasse_credito: number | null };

export async function listarFormas(empresaId: string): Promise<Forma[]> {
  return q<Forma>(
    `select f.id, f.nome, f.tipo, f.codigo_sefaz, f.administradora_id, a.nome as administradora, f.conta_no_caixa, f.ativo
       from formas_pagamento f left join administradoras a on a.id = f.administradora_id
      where f.empresa_id = $1 order by f.ativo desc, f.nome`,
    [empresaId],
  );
}

export async function listarAdministradoras(empresaId: string): Promise<Administradora[]> {
  return q<Administradora>(
    `select id, nome, cnpj, taxa_debito::text, taxa_credito::text, dias_repasse_debito, dias_repasse_credito
       from administradoras where empresa_id = $1 order by nome`,
    [empresaId],
  );
}

export async function salvarForma(u: Usuario, d: { id?: string; nome: string; tipo: TipoPagamento; administradoraId: string | null; contaNoCaixa: boolean; ativo: boolean }) {
  if (!(d.tipo in TIPOS_PAGAMENTO)) throw new ErroNegocio("Tipo de pagamento inválido.");
  if (d.administradoraId && d.tipo !== "debito" && d.tipo !== "credito") throw new ErroNegocio("Administradora só se aplica a cartão.");
  if (d.administradoraId) {
    const [a] = await q(`select 1 from administradoras where id = $1 and empresa_id = $2`, [d.administradoraId, u.empresaId]);
    if (!a) throw new ErroNegocio("Administradora inválida.");
  }
  const sefaz = TIPOS_PAGAMENTO[d.tipo].sefaz;
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          if (!d.ativo) {
            const dinheiro = await c.query(
              `select count(*)::int as n from formas_pagamento where empresa_id = $1 and ativo and tipo = 'dinheiro' and id <> $2`, [u.empresaId, d.id]);
            const atual = await c.query<{ tipo: string }>(`select tipo from formas_pagamento where id = $1`, [d.id]);
            if (atual.rows[0]?.tipo === "dinheiro" && dinheiro.rows[0].n === 0) throw new ErroNegocio("O posto precisa de pelo menos uma forma Dinheiro ativa (o troco sai dela).");
          }
          const r = await c.query(
            `update formas_pagamento set nome=$1, tipo=$2, codigo_sefaz=$3, administradora_id=$4, conta_no_caixa=$5, ativo=$6 where id=$7 and empresa_id=$8`,
            [d.nome, d.tipo, sefaz, d.administradoraId, d.contaNoCaixa, d.ativo, d.id, u.empresaId]);
          if (!r.rowCount) throw new ErroNegocio("Forma de pagamento não encontrada.");
        } else {
          await c.query(
            `insert into formas_pagamento (empresa_id, nome, tipo, codigo_sefaz, administradora_id, conta_no_caixa, ativo) values ($1,$2,$3,$4,$5,$6,$7)`,
            [u.empresaId, d.nome, d.tipo, sefaz, d.administradoraId, d.contaNoCaixa, d.ativo]);
        }
      }),
    { formas_pagamento_empresa_id_nome_key: "Já existe uma forma de pagamento com esse nome." },
  );
}

export async function salvarAdministradora(u: Usuario, d: Omit<Administradora, "id"> & { id?: string }) {
  const campos = [d.nome, d.cnpj, d.taxa_debito, d.taxa_credito, d.dias_repasse_debito, d.dias_repasse_credito];
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          const r = await c.query(
            `update administradoras set nome=$1, cnpj=$2, taxa_debito=$3, taxa_credito=$4, dias_repasse_debito=$5, dias_repasse_credito=$6 where id=$7 and empresa_id=$8`,
            [...campos, d.id, u.empresaId]);
          if (!r.rowCount) throw new ErroNegocio("Administradora não encontrada.");
        } else {
          await c.query(
            `insert into administradoras (nome, cnpj, taxa_debito, taxa_credito, dias_repasse_debito, dias_repasse_credito, empresa_id) values ($1,$2,$3,$4,$5,$6,$7)`,
            [...campos, u.empresaId]);
        }
      }),
    { administradoras_empresa_id_nome_key: "Já existe uma administradora com esse nome." },
  );
}

export type Caixa = { id: string; numero: number; nome: string; serie_nfce: number; serie_contingencia: number; ativo: boolean; turno_aberto: string | null };

export async function listarCaixas(empresaId: string): Promise<Caixa[]> {
  return q<Caixa>(
    `select c.id, c.numero, c.nome, c.serie_nfce, c.serie_contingencia, c.ativo,
            (select u.apelido from turnos t join usuarios u on u.id = t.operador_id where t.caixa_id = c.id and t.status in ('aberto','reaberto')) as turno_aberto
       from caixas c where c.empresa_id = $1 order by c.numero`,
    [empresaId],
  );
}

export async function salvarCaixa(u: Usuario, d: { id?: string; numero: number; nome: string; serie: number; serieContingencia: number; ativo: boolean }) {
  if (d.serie < 1 || d.serie > 999 || d.serieContingencia < 1 || d.serieContingencia > 999) throw new ErroNegocio("As séries da NFC-e vão de 1 a 999.");
  if (d.serie === d.serieContingencia) throw new ErroNegocio("A série de contingência tem de ser diferente da série normal.");
  // Nenhuma série pode ser usada por dois caixas, nem trocando normal por contingência.
  const [cruza] = await q(
    `select 1 from caixas where empresa_id = $1 and id <> coalesce($2::uuid, '00000000-0000-0000-0000-000000000000')
        and (serie_nfce in ($3, $4) or serie_contingencia in ($3, $4)) limit 1`,
    [u.empresaId, d.id ?? null, d.serie, d.serieContingencia]);
  if (cruza) throw new ErroNegocio("Outro caixa já usa uma dessas séries de NFC-e.");
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          const atual = await c.query<{ serie_nfce: number; serie_contingencia: number }>(`select serie_nfce, serie_contingencia from caixas where id = $1 and empresa_id = $2`, [d.id, u.empresaId]);
          if (!atual.rowCount) throw new ErroNegocio("Caixa não encontrado.");
          const a = atual.rows[0];
          for (const [antiga, nova] of [[a.serie_nfce, d.serie], [a.serie_contingencia, d.serieContingencia]]) {
            if (antiga === nova) continue;
            const notas = await c.query(`select 1 from nfce where empresa_id = $1 and serie = $2 limit 1`, [u.empresaId, antiga]);
            if (notas.rowCount) throw new ErroNegocio(`Este caixa já emitiu NFC-e na série ${antiga}. Ela não pode mais mudar.`);
          }
          if (!d.ativo) {
            const t = await c.query(`select 1 from turnos where caixa_id = $1 and status in ('aberto','reaberto')`, [d.id]);
            if (t.rowCount) throw new ErroNegocio("Este caixa tem turno aberto. Feche o turno antes de desativar.");
          }
          await c.query(`update caixas set numero=$1, nome=$2, serie_nfce=$3, serie_contingencia=$4, ativo=$5 where id=$6 and empresa_id=$7`,
            [d.numero, d.nome, d.serie, d.serieContingencia, d.ativo, d.id, u.empresaId]);
        } else {
          await c.query(`insert into caixas (empresa_id, numero, nome, serie_nfce, serie_contingencia, ativo) values ($1,$2,$3,$4,$5,$6)`,
            [u.empresaId, d.numero, d.nome, d.serie, d.serieContingencia, d.ativo]);
        }
        for (const serie of [d.serie, d.serieContingencia]) {
          await c.query(`insert into nfce_numeracao (empresa_id, serie) values ($1,$2) on conflict do nothing`, [u.empresaId, serie]);
        }
      }),
    { caixas_empresa_id_numero_key: "Já existe um caixa com esse número.", caixas_empresa_id_serie_nfce_key: "Outro caixa já usa essa série de NFC-e.", caixas_empresa_id_serie_contingencia_key: "Outro caixa já usa essa série de contingência." },
  );
}

// ===========================================================================
// Usuários, perfis, empresa
// ===========================================================================

/** Catálogo de permissões: o que cada caixa de seleção do perfil libera. */
export const PERMISSOES = {
  "caixa.operar": "Operar o caixa (abrir e fechar o próprio turno, vender, sangria)",
  "caixa.reabrir": "Fechar o turno de outra pessoa e reabrir turnos",
  "venda.cancelar": "Cancelar vendas",
  "preco.alterar": "Alterar preços",
  "relatorio.ver": "Ver relatórios e turnos",
  "cadastro.editar": "Editar cadastros, usuários e perfis",
} as const;
export type Permissao = keyof typeof PERMISSOES;

export type Perfil = { id: string; nome: string; permissoes: Record<string, boolean>; usuarios: number };
export type UsuarioLista = { id: string; nome: string; apelido: string; perfil_id: string; perfil: string; eh_frentista: boolean; tem_pin: boolean; ativo: boolean };

export async function listarPerfis(empresaId: string): Promise<Perfil[]> {
  return q<Perfil>(
    `select p.id, p.nome, p.permissoes, (select count(*)::int from usuario_empresas ue join usuarios u on u.id = ue.usuario_id where ue.perfil_id = p.id and u.ativo) as usuarios
       from perfis p where p.empresa_id = $1 order by p.nome`,
    [empresaId],
  );
}

export async function listarUsuarios(empresaId: string): Promise<UsuarioLista[]> {
  return q<UsuarioLista>(
    `select u.id, u.nome, u.apelido, p.id as perfil_id, p.nome as perfil, u.eh_frentista, u.pin_hash is not null as tem_pin, u.ativo
       from usuarios u join usuario_empresas ue on ue.usuario_id = u.id and ue.empresa_id = $1 join perfis p on p.id = ue.perfil_id
      order by u.ativo desc, u.apelido`,
    [empresaId],
  );
}

/** Depois da mudança, alguém ativo ainda consegue editar cadastros? Evita trancar o posto do lado de fora. */
async function exigirAlguemQueAdministre(c: Tx, empresaId: string) {
  const r = await c.query(
    `select 1 from usuarios u join usuario_empresas ue on ue.usuario_id = u.id and ue.empresa_id = $1
       join perfis p on p.id = ue.perfil_id
      where u.ativo and u.pin_hash is not null and (p.permissoes->>'cadastro.editar')::boolean limit 1`,
    [empresaId],
  );
  if (!r.rowCount) throw new ErroNegocio("Pelo menos um usuário ativo, com PIN, precisa continuar podendo editar cadastros.");
}

export async function salvarUsuario(
  u: Usuario,
  d: { id?: string; nome: string; apelido: string; perfilId: string; frentista: boolean; ativo: boolean; novoPin: string | null },
) {
  if (d.novoPin !== null && !/^\d{4,6}$/.test(d.novoPin)) throw new ErroNegocio("O PIN tem de 4 a 6 números.");
  if (d.novoPin && /^(\d)\1+$/.test(d.novoPin)) throw new ErroNegocio("Escolha um PIN menos óbvio (não use números todos iguais).");
  if (d.id === u.id && !d.ativo) throw new ErroNegocio("Você não pode desativar o seu próprio usuário.");
  const [perfil] = await q(`select 1 from perfis where id = $1 and empresa_id = $2`, [d.perfilId, u.empresaId]);
  if (!perfil) throw new ErroNegocio("Perfil inválido.");
  const hash = d.novoPin ? await bcrypt.hash(d.novoPin, 10) : null;
  await tx(u.id, async (c) => {
    const mesmoApelido = await c.query(
      `select 1 from usuarios x join usuario_empresas ue on ue.usuario_id = x.id and ue.empresa_id = $1
        where lower(x.apelido) = lower($2) and x.id <> coalesce($3::uuid, '00000000-0000-0000-0000-000000000000') and x.ativo`,
      [u.empresaId, d.apelido, d.id ?? null],
    );
    if (mesmoApelido.rowCount) throw new ErroNegocio("Já existe um usuário ativo com esse nome na lista de entrada. Use outro apelido.");
    if (d.id) {
      const atual = await c.query(`select 1 from usuario_empresas where usuario_id = $1 and empresa_id = $2`, [d.id, u.empresaId]);
      if (!atual.rowCount) throw new ErroNegocio("Usuário não encontrado.");
      if (!d.ativo) {
        const t = await c.query(`select 1 from turnos where operador_id = $1 and status in ('aberto','reaberto')`, [d.id]);
        if (t.rowCount) throw new ErroNegocio("Este usuário tem turno aberto. Feche o turno antes de desativar.");
      }
      await c.query(`update usuarios set nome=$1, apelido=$2, eh_frentista=$3, ativo=$4, pin_hash=coalesce($5, pin_hash), updated_at=now() where id=$6`,
        [d.nome, d.apelido, d.frentista, d.ativo, hash, d.id]);
      await c.query(`update usuario_empresas set perfil_id = $1 where usuario_id = $2 and empresa_id = $3`, [d.perfilId, d.id, u.empresaId]);
    } else {
      const n = await c.query<{ id: string }>(`insert into usuarios (nome, apelido, eh_frentista, ativo, pin_hash) values ($1,$2,$3,$4,$5) returning id`,
        [d.nome, d.apelido, d.frentista, d.ativo, hash]);
      await c.query(`insert into usuario_empresas (usuario_id, empresa_id, perfil_id) values ($1,$2,$3)`, [n.rows[0].id, u.empresaId, d.perfilId]);
    }
    await exigirAlguemQueAdministre(c, u.empresaId);
  });
}

export async function salvarPerfil(u: Usuario, d: { id?: string; nome: string; permissoes: Record<string, boolean> }) {
  const limpas = Object.fromEntries(Object.keys(PERMISSOES).map((k) => [k, Boolean(d.permissoes[k])]));
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          const r = await c.query(`update perfis set nome=$1, permissoes=$2, updated_at=now() where id=$3 and empresa_id=$4`, [d.nome, limpas, d.id, u.empresaId]);
          if (!r.rowCount) throw new ErroNegocio("Perfil não encontrado.");
        } else {
          await c.query(`insert into perfis (empresa_id, nome, permissoes) values ($1,$2,$3)`, [u.empresaId, d.nome, limpas]);
        }
        await exigirAlguemQueAdministre(c, u.empresaId);
      }),
    { perfis_empresa_id_nome_key: "Já existe um perfil com esse nome." },
  );
}

export async function trocarMeuPin(u: Usuario, atual: string, novo: string) {
  if (!/^\d{4,6}$/.test(novo)) throw new ErroNegocio("O novo PIN tem de 4 a 6 números.");
  if (/^(\d)\1+$/.test(novo)) throw new ErroNegocio("Escolha um PIN menos óbvio (não use números todos iguais).");
  if (atual === novo) throw new ErroNegocio("O novo PIN tem de ser diferente do atual.");
  const [r] = await q<{ pin_hash: string | null }>(`select pin_hash from usuarios where id = $1`, [u.id]);
  if (!r?.pin_hash || !(await bcrypt.compare(atual, r.pin_hash))) throw new ErroNegocio("O PIN atual está errado.");
  const hash = await bcrypt.hash(novo, 10);
  await tx(u.id, (c) => c.query(`update usuarios set pin_hash = $1, updated_at = now() where id = $2`, [hash, u.id]));
}

export type Empresa = { id: string; razao_social: string; nome_fantasia: string; cnpj: string; inscricao_estadual: string | null; uf: string; municipio_ibge: string | null; regime_tributario: "simples" | "presumido" | "real"; crt: "1" | "2" | "3" | "4" };

export async function buscarEmpresa(empresaId: string): Promise<Empresa> {
  const [e] = await q<Empresa>(`select id, razao_social, nome_fantasia, cnpj, inscricao_estadual, uf, municipio_ibge, regime_tributario, crt from empresas where id = $1`, [empresaId]);
  return e;
}

/** Dígitos verificadores do CNPJ. */
export function cnpjValido(cnpj: string): boolean {
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1+$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = base.split("").reduce((acc, d, i) => acc + Number(d) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = dv(cnpj.slice(0, 12));
  const d2 = dv(cnpj.slice(0, 12) + d1);
  return cnpj.endsWith(`${d1}${d2}`);
}

export const UFS = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"] as const;

export async function salvarEmpresa(u: Usuario, d: Omit<Empresa, "id">) {
  if (!cnpjValido(d.cnpj)) throw new ErroNegocio("CNPJ inválido. Confira os números.");
  if (!(UFS as readonly string[]).includes(d.uf)) throw new ErroNegocio("UF inválida.");
  if (d.municipio_ibge && !/^\d{7}$/.test(d.municipio_ibge)) throw new ErroNegocio("O código IBGE do município tem 7 números.");
  if (d.regime_tributario === "simples" ? !["1", "2", "4"].includes(d.crt) : d.crt !== "3") {
    throw new ErroNegocio("O CRT não combina com o regime: Simples usa CRT 1, 2 ou 4; lucro presumido ou real usa CRT 3.");
  }
  await comMensagens(
    () =>
      tx(u.id, (c) =>
        c.query(
          `update empresas set razao_social=$1, nome_fantasia=$2, cnpj=$3, inscricao_estadual=$4, uf=$5, municipio_ibge=$6, regime_tributario=$7, crt=$8, updated_at=now() where id=$9`,
          [d.razao_social, d.nome_fantasia, d.cnpj, d.inscricao_estadual, d.uf, d.municipio_ibge, d.regime_tributario, d.crt, u.empresaId],
        ),
      ),
    { empresas_cnpj_key: "Este CNPJ já está cadastrado em outra empresa." },
  );
}

// ===========================================================================
// Tributação (como sai na nota)
// ===========================================================================

export type Tributacao = {
  id: string; nome: string; origem: string; cst_icms: string; cfop_interno: string; cfop_interestadual: string | null;
  p_icms: string | null; p_icms_efetivo: string | null; ad_rem: string | null; ad_rem_unidade: "L" | "kg" | null;
  pis_cst: string; p_pis: string | null; cofins_cst: string; p_cofins: string | null; c_benef: string | null;
  revisar: boolean; observacao: string | null; mercadorias: number;
};

export async function listarTributacoes(empresaId: string): Promise<Tributacao[]> {
  return q<Tributacao>(
    `select t.id, t.nome, t.origem, t.cst_icms, t.cfop_interno, t.cfop_interestadual, t.p_icms::text, t.p_icms_efetivo::text,
            t.ad_rem::text, t.ad_rem_unidade, t.pis_cst, t.p_pis::text, t.cofins_cst, t.p_cofins::text, t.c_benef, t.revisar, t.observacao,
            (select count(*)::int from mercadorias m where m.tributacao_id = t.id and m.ativo) as mercadorias
       from tributacoes t where t.empresa_id = $1 order by t.revisar desc, t.nome`,
    [empresaId],
  );
}

/** CSTs de ICMS aceitos (regime normal) e o que cada um exige. */
export const CST_ICMS: Record<string, string> = {
  "00": "00 · Tributada integralmente",
  "20": "20 · Com redução de base",
  "40": "40 · Isenta",
  "41": "41 · Não tributada",
  "60": "60 · ICMS cobrado antes por substituição tributária",
  "61": "61 · Monofásico sobre combustível cobrado antes",
  "90": "90 · Outras",
};

export async function salvarTributacao(u: Usuario, d: Omit<Tributacao, "id" | "mercadorias"> & { id?: string }) {
  if (!CST_ICMS[d.cst_icms]) throw new ErroNegocio("CST de ICMS não suportado.");
  if (d.cst_icms === "61" && (d.ad_rem === null || !d.ad_rem_unidade)) throw new ErroNegocio("CST 61 (monofásico) precisa do valor ad rem e da unidade (L ou kg).");
  if ((d.cst_icms === "00" || d.cst_icms === "20") && d.p_icms === null) throw new ErroNegocio("Informe a alíquota de ICMS para esse CST.");
  if (d.cfop_interestadual && d.cfop_interestadual[0] !== "6") throw new ErroNegocio("CFOP interestadual começa com 6.");
  if (d.cfop_interno[0] !== "5") throw new ErroNegocio("CFOP de venda dentro do estado começa com 5.");
  const campos = [d.nome, d.origem, d.cst_icms, d.cfop_interno, d.cfop_interestadual, d.p_icms, d.p_icms_efetivo,
    d.cst_icms === "61" ? d.ad_rem : null, d.cst_icms === "61" ? d.ad_rem_unidade : null,
    d.pis_cst, d.p_pis, d.cofins_cst, d.p_cofins, d.c_benef, d.revisar, d.observacao];
  await comMensagens(
    () =>
      tx(u.id, async (c) => {
        if (d.id) {
          const r = await c.query(
            `update tributacoes set nome=$1, origem=$2, cst_icms=$3, cfop_interno=$4, cfop_interestadual=$5, p_icms=$6, p_icms_efetivo=$7,
                    ad_rem=$8, ad_rem_unidade=$9, pis_cst=$10, p_pis=$11, cofins_cst=$12, p_cofins=$13, c_benef=$14, revisar=$15, observacao=$16,
                    updated_at=now()
              where id=$17 and empresa_id=$18`,
            [...campos, d.id, u.empresaId]);
          if (!r.rowCount) throw new ErroNegocio("Tributação não encontrada.");
        } else {
          await c.query(
            `insert into tributacoes (nome, origem, cst_icms, cfop_interno, cfop_interestadual, p_icms, p_icms_efetivo, ad_rem, ad_rem_unidade,
                                      pis_cst, p_pis, cofins_cst, p_cofins, c_benef, revisar, observacao, empresa_id)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [...campos, u.empresaId]);
        }
      }),
    { tributacoes_empresa_id_nome_key: "Já existe uma tributação com esse nome." },
  );
}
