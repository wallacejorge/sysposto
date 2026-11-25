"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Abastecimento } from "@/lib/data/caixa";
import type { Catalogo, OpManual, OpVenda, Operacao, Resultado } from "@/lib/data/vendas";
import { confirmarPinCandidato, descartarRejeitada, enfileirar, enviarFila, guardar, ler, listarFila, listarRejeitadas, type ItemFila, type Rejeitada } from "@/lib/fila";

export type EstadoCaixa = { turno: { id: string; caixa: string } | null; pendentes: Abastecimento[]; catalogo: Catalogo };
export type LinhaPendente = Abastecimento & { naFila?: boolean };

const INTERVALO_MS = 5000;

/**
 * Motor do caixa: dados atualizados a cada 5 s, fila de operações, situação da conexão.
 * Toda operação entra na fila e é enviada na hora; sem internet, fica guardada e sai quando a conexão voltar.
 */
export function useCaixa(usuarioId: string, inicial: EstadoCaixa) {
  const [estado, setEstado] = useState<EstadoCaixa>(inicial);
  const [online, setOnline] = useState(true);
  const [fila, setFila] = useState<ItemFila[]>([]);
  const [rejeitadas, setRejeitadas] = useState<Rejeitada[]>([]);
  const [turnoFechado, setTurnoFechado] = useState(false);
  const chaveCache = "estado:" + usuarioId;
  const montado = useRef(true);

  const recarregarFila = useCallback(async () => {
    const [f, r] = await Promise.all([listarFila(usuarioId), listarRejeitadas(usuarioId)]);
    if (montado.current) {
      setFila(f);
      setRejeitadas(r);
    }
  }, [usuarioId]);

  const atualizar = useCallback(async () => {
    try {
      const r = await fetch("/api/caixa/estado", { cache: "no-store" });
      if (r.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      const e = (await r.json()) as EstadoCaixa;
      if (!montado.current) return;
      setOnline(true);
      // Turno fechado em outro lugar: fica na tela para mostrar o que não foi enviado, mas não vende mais.
      if (!e.turno) {
        setTurnoFechado(true);
        setEstado((atual) => ({ ...e, turno: atual.turno }));
        return;
      }
      setTurnoFechado(false);
      setEstado(e);
      void guardar(chaveCache, e);
    } catch {
      if (montado.current) setOnline(false);
    }
  }, [chaveCache]);

  /** Envia a fila; devolve o resultado de cada operação enviada agora. */
  const sincronizar = useCallback(async () => {
    const r = await enviarFila(usuarioId);
    // Vendas confirmadas: tira já da lista os abastecimentos vendidos (sem esperar a próxima atualização).
    const vendidos = new Set(r.enviadas.filter((e) => e.resultado.ok && e.item.op.tipo === "venda").flatMap((e) => (e.item.op as OpVenda).abastecimentos));
    if (vendidos.size && montado.current) setEstado((e) => ({ ...e, pendentes: e.pendentes.filter((p) => !vendidos.has(p.id)) }));
    if (r.semConexao) setOnline(false);
    else if (r.enviadas.length) setOnline(true);
    await recarregarFila();
    if (r.enviadas.length) void atualizar();
    return r;
  }, [usuarioId, recarregarFila, atualizar]);

  // Início: confirma o PIN do login, usa a cópia guardada se a rede não responder, registra o service worker.
  useEffect(() => {
    montado.current = true;
    void confirmarPinCandidato(usuarioId);
    void guardar(chaveCache, inicial);
    void recarregarFila();
    void sincronizar();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").then(async () => {
        const reg = await navigator.serviceWorker.ready;
        const urls = performance.getEntriesByType("resource").map((e) => e.name).filter((u) => u.includes("/_next/static/"));
        reg.active?.postMessage({ tipo: "guardar", urls });
      }).catch(() => {});
    }
    // Tela aberta da cópia offline: os dados mais novos estão no IndexedDB.
    void ler<EstadoCaixa>(chaveCache).then((guardado) => {
      if (guardado && !navigator.onLine && montado.current) {
        setEstado(guardado);
        setOnline(false);
      }
    });
    return () => { montado.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void sincronizar().then(() => atualizar());
    }, INTERVALO_MS);
    const voltou = () => void sincronizar();
    const caiu = () => setOnline(false);
    window.addEventListener("online", voltou);
    window.addEventListener("offline", caiu);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", voltou);
      window.removeEventListener("offline", caiu);
    };
  }, [sincronizar, atualizar]);

  /** Coloca a operação na fila e tenta enviar. Devolve o resultado do servidor, ou null se ficou guardada. */
  const executar = useCallback(async (op: Operacao): Promise<Resultado | null> => {
    await enfileirar(usuarioId, op);
    await recarregarFila();
    const r = await sincronizar();
    const id = op.tipo === "manual" ? op.id : op.chave;
    const resultado = r.enviadas.find((e) => e.item.id === id)?.resultado ?? null;
    // Recusada na hora, com o operador olhando: a mensagem aparece na tela; não vai para a lista de avisos.
    if (resultado && !resultado.ok) {
      await descartarRejeitada(id);
      await recarregarFila();
    }
    return resultado;
  }, [usuarioId, recarregarFila, sincronizar]);

  // Lista que o caixa vê: o que o servidor mandou + lançamentos manuais ainda na fila
  // − abastecimentos já usados em vendas que estão na fila.
  // "disponiveis": tudo que existe (servidor + manuais na fila), mesmo os que estão indo numa venda agora.
  // "pendentes": o que o caixa pode escolher (sem os que já estão numa venda na fila).
  const disponiveis: LinhaPendente[] = useMemo(() => {
    const manuais: LinhaPendente[] = fila
      .filter((i) => i.op.tipo === "manual")
      .map((i) => {
        const op = i.op as OpManual;
        const bico = estado.catalogo.bicos.find((b) => b.id === op.bicoId);
        const preco = Number(bico?.preco ?? 0);
        const total = op.valorCentavos ?? Math.round(Number(op.litros) * preco * 100);
        const litros = op.litros ? Number(op.litros) : preco ? Math.round((total / 100 / preco) * 1000) / 1000 : 0;
        return {
          id: op.id, bico: bico?.numero ?? 0, combustivel: bico?.combustivel ?? "?", litros: litros.toFixed(3),
          preco_unitario: bico?.preco ?? "0", total_centavos: total, fim: op.fim, origem: "manual" as const, naFila: true,
        };
      })
      .filter((m) => !estado.pendentes.some((p) => p.id === m.id));
    return [...estado.pendentes, ...manuais].sort((a, b) => new Date(a.fim).getTime() - new Date(b.fim).getTime());
  }, [estado, fila]);

  const pendentes: LinhaPendente[] = useMemo(() => {
    const usados = new Set(fila.flatMap((i) => (i.op.tipo === "venda" ? (i.op as OpVenda).abastecimentos : [])));
    return disponiveis.filter((p) => !usados.has(p.id));
  }, [disponiveis, fila]);

  const descartar = useCallback(async (id: string) => {
    await descartarRejeitada(id);
    await recarregarFila();
  }, [recarregarFila]);

  return { estado, online, fila, rejeitadas, pendentes, disponiveis, turnoFechado, executar, sincronizar, descartar };
}
