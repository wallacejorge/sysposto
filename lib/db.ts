import "server-only";
import pg from "pg";

// numeric -> string (nunca float). bigint (centavos) -> number: cabe com folga até R$ 90 trilhões.
pg.types.setTypeParser(20, (v) => Number(v));

const globalPool = globalThis as unknown as { __pool?: pg.Pool };

export const pool =
  globalPool.__pool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL || undefined,
    max: 10,
  });
if (process.env.NODE_ENV !== "production") globalPool.__pool = pool;

// Conexão parada que cai (banco reiniciou, rede caiu) não pode derrubar o servidor.
if (!pool.listenerCount("error")) {
  pool.on("error", (e) => console.error("Conexão com o banco caiu; será refeita na próxima consulta.", e.message));
}

export type Tx = pg.PoolClient;

/** Consulta simples, sem transação. */
export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

/**
 * Transação com o usuário registrado para a auditoria (app.usuario_id).
 * Toda escrita do sistema passa por aqui.
 */
export async function tx<T>(usuarioId: string, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('app.usuario_id', $1, true)", [usuarioId]);
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
