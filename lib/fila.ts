// Fila do caixa no navegador (IndexedDB). Só roda no navegador.
// Toda operação do caixa entra aqui primeiro e sai quando o servidor confirma.
// Sem internet, ela espera; quando a conexão volta, é enviada na mesma ordem.

import type { Operacao, Resultado } from "./data/vendas";

const BANCO = "posto-caixa";
const VERSAO = 1;

export type ItemFila = { id: string; operadorId: string; op: Operacao; criadoEm: string };
export type Rejeitada = ItemFila & { erro: string; em: string };

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, VERSAO);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("fila")) db.createObjectStore("fila", { keyPath: "id" });
      if (!db.objectStoreNames.contains("rejeitadas")) db.createObjectStore("rejeitadas", { keyPath: "id" });
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => erro(r.error);
  });
}

async function comLoja<T>(loja: string, modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await abrir();
  return new Promise((ok, erro) => {
    const t = db.transaction(loja, modo);
    const req = fn(t.objectStore(loja));
    let valor: T | undefined;
    if (req) req.onsuccess = () => (valor = req.result);
    t.oncomplete = () => { db.close(); ok(valor); };
    t.onerror = () => { db.close(); erro(t.error); };
  });
}

const idDe = (op: Operacao) => (op.tipo === "manual" ? op.id : op.chave);

export async function enfileirar(operadorId: string, op: Operacao) {
  const item: ItemFila = { id: idDe(op), operadorId, op, criadoEm: new Date().toISOString() };
  await comLoja("fila", "readwrite", (s) => s.put(item));
}

export async function listarFila(operadorId?: string): Promise<ItemFila[]> {
  const todos = ((await comLoja<ItemFila[]>("fila", "readonly", (s) => s.getAll())) ?? []).sort((a, b) => a.criadoEm.localeCompare(b.criadoEm));
  return operadorId ? todos.filter((i) => i.operadorId === operadorId) : todos;
}

export async function listarRejeitadas(operadorId?: string): Promise<Rejeitada[]> {
  const todas = (await comLoja<Rejeitada[]>("rejeitadas", "readonly", (s) => s.getAll())) ?? [];
  return operadorId ? todas.filter((i) => i.operadorId === operadorId) : todas;
}

export async function descartarRejeitada(id: string) {
  await comLoja("rejeitadas", "readwrite", (s) => s.delete(id));
}

export async function guardar(chave: string, valor: unknown) {
  await comLoja("cache", "readwrite", (s) => s.put(valor, chave));
}

export async function ler<T>(chave: string): Promise<T | undefined> {
  return comLoja<T>("cache", "readonly", (s) => s.get(chave));
}

export type ResultadoEnvio = { enviadas: { item: ItemFila; resultado: Resultado }[]; restantes: number; semConexao: boolean };

let enviando: Promise<ResultadoEnvio> | null = null;

/**
 * Envia a fila do operador, em ordem. Confirmadas saem da fila; recusadas pelo servidor (regra de negócio)
 * vão para "rejeitadas" para alguém olhar. Sem conexão ou servidor com problema: ficam para a próxima tentativa.
 */
export function enviarFila(operadorId: string): Promise<ResultadoEnvio> {
  if (enviando) return enviando;
  enviando = (async () => {
    const itens = await listarFila(operadorId);
    if (!itens.length) return { enviadas: [], restantes: 0, semConexao: false };
    let resposta: Response;
    try {
      resposta = await fetch("/api/caixa/operacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operacoes: itens.map((i) => i.op) }),
      });
    } catch {
      return { enviadas: [], restantes: itens.length, semConexao: true };
    }
    if (resposta.status === 401 || resposta.status === 403) {
      return { enviadas: [], restantes: itens.length, semConexao: false };
    }
    let corpo: { resultados?: Resultado[] } = {};
    try { corpo = await resposta.json(); } catch { /* resposta quebrada: tenta de novo depois */ }
    const resultados = corpo.resultados ?? [];
    const enviadas: ResultadoEnvio["enviadas"] = [];
    for (let i = 0; i < resultados.length; i++) {
      const item = itens[i];
      const r = resultados[i];
      if (!r.ok) {
        const rej: Rejeitada = { ...item, erro: r.erro, em: new Date().toISOString() };
        await comLoja("rejeitadas", "readwrite", (s) => s.put(rej));
      }
      await comLoja("fila", "readwrite", (s) => s.delete(item.id));
      enviadas.push({ item, resultado: r });
    }
    return { enviadas, restantes: itens.length - resultados.length, semConexao: !resposta.ok && resultados.length === 0 };
  })().finally(() => { enviando = null; });
  return enviando;
}

// ---------------------------------------------------------------------------
// PIN para desbloquear a tela sem internet: guarda só um resumo (PBKDF2), nunca o PIN.
// ---------------------------------------------------------------------------

async function resumoPin(usuarioId: string, pin: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode("posto:" + usuarioId), iterations: 150_000, hash: "SHA-256" }, chave, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

export async function lembrarPin(usuarioId: string, pin: string) {
  try { await guardar("pin:" + usuarioId, await resumoPin(usuarioId, pin)); } catch { /* sem armazenamento: só não funciona offline */ }
}

/** No login ainda não se sabe se o PIN está certo: guarda como candidato. */
export async function lembrarPinCandidato(usuarioId: string, pin: string) {
  try { await guardar("pincand:" + usuarioId, await resumoPin(usuarioId, pin)); } catch { /* idem */ }
}

/** Já dentro do sistema como este usuário: o último candidato era o PIN certo. */
export async function confirmarPinCandidato(usuarioId: string) {
  try {
    const c = await ler<string>("pincand:" + usuarioId);
    if (c) {
      await guardar("pin:" + usuarioId, c);
      await comLoja("cache", "readwrite", (s) => s.delete("pincand:" + usuarioId));
    }
  } catch { /* idem */ }
}

/** true = confere; false = não confere; null = este computador ainda não conhece o PIN. */
export async function conferirPinLocal(usuarioId: string, pin: string): Promise<boolean | null> {
  try {
    const guardado = await ler<string>("pin:" + usuarioId);
    if (!guardado) return null;
    return guardado === (await resumoPin(usuarioId, pin));
  } catch {
    return null;
  }
}
