"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAcao } from "@/components/use-acao";
import type { Abastecimento, BicoVenda, FormaPagamento } from "@/lib/data/caixa";
import { horaBR, lerReais, precoLitro, reais, tresCasas } from "@/lib/format";
import { Kbd } from "@/components/ui";
import { acaoLancarManual, acaoMovimento, acaoRegistrarVenda, type Estado } from "./actions";

// Caixa: tema escuro, controles grandes, tudo pelo teclado.
// F2 lista de abastecimentos · F7 bico manual · F10 finalizar · F12 sangria/movimento

const ATRASO_MIN = 15; // abastecimento parado há mais tempo que isso ganha aviso

export function Pdv({
  turno,
  pendentes,
  bicos,
  formas,
}: {
  turno: { id: string; caixa: string };
  pendentes: Abastecimento[];
  bicos: BicoVenda[];
  formas: FormaPagamento[];
}) {
  const router = useRouter();
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [formaId, setFormaId] = useState(formas[0]?.id ?? "");
  const [recebido, setRecebido] = useState("");
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [venda, acaoVenda, vendendo] = useAcao<Estado>(acaoRegistrarVenda);
  const listaRef = useRef<HTMLTableSectionElement>(null);
  const dialogoManual = useRef<HTMLDialogElement>(null);
  const dialogoMov = useRef<HTMLDialogElement>(null);
  const formVenda = useRef<HTMLFormElement>(null);

  // Mantém só a seleção que ainda existe (outro caixa pode ter registrado).
  const ids = pendentes.map((p) => p.id).join(",");
  useEffect(() => {
    setSelecionados((s) => s.filter((id) => pendentes.some((p) => p.id === id)));
  }, [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  // Depois de uma venda registrada: limpa e gera nova chave (a anterior protege contra clique duplo).
  useEffect(() => {
    if (venda.ok) {
      setSelecionados([]);
      setRecebido("");
      setChave(crypto.randomUUID());
    }
  }, [venda]);

  // Atualiza a lista de abastecimentos a cada 5 s (quando a automação estiver ligada, eles chegam sozinhos).
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible" && !document.querySelector("dialog[open]")) router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [router]);

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "F2") {
        e.preventDefault();
        listaRef.current?.querySelector<HTMLInputElement>("input")?.focus();
      } else if (e.key === "F7") {
        e.preventDefault();
        dialogoManual.current?.showModal();
      } else if (e.key === "F10") {
        e.preventDefault();
        formVenda.current?.requestSubmit();
      } else if (e.key === "F12") {
        e.preventDefault();
        dialogoMov.current?.showModal();
      }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const itens = pendentes.filter((p) => selecionados.includes(p.id));
  const total = itens.reduce((s, p) => s + p.total_centavos, 0);
  const forma = formas.find((f) => f.id === formaId);
  const recebidoCent = recebido ? lerReais(recebido) : null;
  const troco = forma?.tipo === "dinheiro" && recebidoCent !== null && recebidoCent >= total ? recebidoCent - total : null;
  const agora = useMemo(() => Date.now(), [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  function alternar(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-var(--layout-statusbar))] bg-pdv-bg p-4 text-pdv-text md:-mx-8 md:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl">Caixa · {turno.caixa}</h1>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => dialogoManual.current?.showModal()} className="h-control-normal rounded-md border border-pdv-muted px-4 font-semibold hover:bg-pdv-surface">
            Bico manual <Kbd>F7</Kbd>
          </button>
          <button type="button" onClick={() => dialogoMov.current?.showModal()} className="h-control-normal rounded-md border border-pdv-muted px-4 font-semibold hover:bg-pdv-surface">
            Sangria / despesa <Kbd>F12</Kbd>
          </button>
          <Link href="/caixa/fechar" className="flex h-control-normal items-center rounded-md border border-pdv-muted px-4 font-semibold hover:bg-pdv-surface">
            Fechar turno
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* Abastecimentos */}
        <section aria-labelledby="titulo-abast" className="min-w-0">
          <h2 id="titulo-abast" className="mb-2 text-base font-semibold text-pdv-muted">
            Abastecimentos para registrar ({pendentes.length}) <Kbd>F2</Kbd>
          </h2>
          {pendentes.length ? (
            <div className="relative overflow-x-auto rounded-md bg-pdv-surface">
              <table className="w-full text-base [&_td]:border-t [&_td]:border-pdv-bg [&_td]:px-3 [&_td]:py-3 [&_td]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:text-pdv-muted">
                <thead>
                  <tr><th className="w-10"><span className="sr-only">Selecionar</span></th><th>Bico</th><th className="text-right!">Litros</th><th className="text-right!">Total</th><th>Hora</th></tr>
                </thead>
                <tbody ref={listaRef}>
                  {pendentes.map((p) => {
                    const sel = selecionados.includes(p.id);
                    const minutos = Math.floor((agora - new Date(p.fim).getTime()) / 60000);
                    return (
                      <tr key={p.id} onClick={() => alternar(p.id)} className={`cursor-pointer ${sel ? "bg-[color-mix(in_srgb,var(--color-pdv-accent)_22%,transparent)]" : "hover:bg-pdv-bg/40"}`}>
                        <td>
                          <input
                            type="checkbox"
                            className="size-5 accent-[var(--color-pdv-accent)]"
                            checked={sel}
                            onChange={() => alternar(p.id)}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Bico ${p.bico}, ${tresCasas(p.litros)} litros, ${reais(p.total_centavos)}`}
                          />
                        </td>
                        <td>
                          <span className="font-bold">{String(p.bico).padStart(2, "0")}</span> {p.combustivel}
                          {p.origem === "manual" ? <span className="ml-2 text-xs text-pdv-muted">manual</span> : null}
                        </td>
                        <td className="num text-right">{tresCasas(p.litros)}</td>
                        <td className="num text-right">{reais(p.total_centavos)}</td>
                        <td className="num">
                          {horaBR(p.fim)}
                          {minutos >= ATRASO_MIN ? <span className="ml-2 rounded-pill bg-warning-bg px-2 text-xs font-semibold text-on-warning-bg">há {minutos} min</span> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-md bg-pdv-surface px-4 py-8 text-center text-pdv-muted">
              Nenhum abastecimento esperando. Quando a bomba encerrar, ele aparece aqui. Sem automação? Use <b>Bico manual</b> (F7).
            </p>
          )}
        </section>

        {/* Venda */}
        <section aria-labelledby="titulo-venda" className="min-w-0 rounded-md bg-pdv-surface p-4">
          <h2 id="titulo-venda" className="sr-only">Venda</h2>
          <form ref={formVenda} onSubmit={acaoVenda} className="space-y-4">
            <input type="hidden" name="chave" value={chave} />
            {selecionados.map((id) => <input key={id} type="hidden" name="abastecimento" value={id} />)}
            <div>
              <p className="text-pdv-muted">Total {itens.length > 1 ? `(${itens.length} abastecimentos)` : ""}</p>
              <p className="num text-[length:var(--text-pdv-total)] leading-[var(--text-pdv-total--line-height)] font-bold text-pdv-total" aria-live="polite">{reais(total)}</p>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm text-pdv-muted">Forma de pagamento</legend>
              <div className="grid grid-cols-2 gap-2">
                {formas.map((f) => (
                  <label key={f.id} className={`flex h-control-pdv cursor-pointer items-center justify-center rounded-md border text-lg font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-pdv-accent)] ${formaId === f.id ? "border-pdv-accent bg-pdv-bg" : "border-pdv-muted"}`}>
                    <input type="radio" name="formaId" value={f.id} checked={formaId === f.id} onChange={() => setFormaId(f.id)} className="sr-only" />
                    {f.nome}
                  </label>
                ))}
              </div>
            </fieldset>

            {forma?.tipo === "dinheiro" ? (
              <div className="grid grid-cols-2 items-end gap-3">
                <div>
                  <label htmlFor="recebido" className="mb-1 block text-sm text-pdv-muted">Recebido (R$)</label>
                  <input id="recebido" name="recebido" inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} placeholder={total ? (total / 100).toFixed(2).replace(".", ",") : "0,00"} className="num h-control-pdv w-full rounded-sm border border-pdv-muted bg-pdv-bg px-3 text-right text-lg text-pdv-text" />
                </div>
                <div aria-live="polite">
                  <p className="text-sm text-pdv-muted">Troco</p>
                  <p className="num text-xl font-bold">{troco !== null ? reais(troco) : "—"}</p>
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="cpf" className="mb-1 block text-sm text-pdv-muted">CPF/CNPJ na nota (opcional)</label>
              <input id="cpf" name="cpf" inputMode="numeric" autoComplete="off" className="num h-control-normal w-full rounded-sm border border-pdv-muted bg-pdv-bg px-3 text-pdv-text" />
            </div>

            {venda.erro ? <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 font-semibold text-on-danger-bg">{venda.erro}</p> : null}
            {venda.ok && !itens.length ? <p role="status" className="rounded-md bg-success-bg px-3 py-2 font-semibold text-on-success-bg">{venda.ok}</p> : null}

            <button type="submit" disabled={!itens.length || vendendo} className="h-control-pdv w-full rounded-md bg-accent text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
              {vendendo ? "Registrando…" : "Finalizar venda"} <Kbd>F10</Kbd>
            </button>
            <p className="text-xs text-pdv-muted">A emissão da NFC-e entra no próximo marco. Por enquanto a venda é registrada sem nota.</p>
          </form>
        </section>
      </div>

      <DialogoManual refDialogo={dialogoManual} bicos={bicos} />
      <DialogoMovimento refDialogo={dialogoMov} />
    </div>
  );
}

function Dialogo({ refDialogo, titulo, children }: { refDialogo: React.RefObject<HTMLDialogElement | null>; titulo: string; children: React.ReactNode }) {
  return (
    <dialog
      ref={refDialogo}
      aria-label={titulo}
      className="m-auto w-[min(560px,calc(100vw-32px))] rounded-lg bg-pdv-surface p-0 text-pdv-text shadow-pop backdrop:bg-black/60"
    >
      <div className="flex items-center justify-between border-b border-pdv-bg px-4 py-3">
        <h2 className="text-lg">{titulo}</h2>
        <button type="button" onClick={() => refDialogo.current?.close()} className="rounded-md px-2 py-1 text-pdv-muted hover:text-pdv-text">
          Fechar <Kbd>Esc</Kbd>
        </button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

function DialogoManual({ refDialogo, bicos }: { refDialogo: React.RefObject<HTMLDialogElement | null>; bicos: BicoVenda[] }) {
  const [estado, acao, enviando] = useAcao<Estado>(acaoLancarManual);
  const [bicoId, setBicoId] = useState("");
  const [modo, setModo] = useState<"valor" | "litros">("valor");
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado.ok) {
      form.current?.reset();
      setBicoId("");
      refDialogo.current?.close();
    }
  }, [estado, refDialogo]);

  return (
    <Dialogo refDialogo={refDialogo} titulo="Lançar abastecimento manual">
      <form ref={form} onSubmit={acao} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm text-pdv-muted">Bico</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {bicos.map((b) => (
              <label key={b.id} title={`${b.combustivel} ${precoLitro(b.preco)}/L`} className={`flex h-14 cursor-pointer flex-col items-center justify-center rounded-md border font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-pdv-accent)] ${bicoId === b.id ? "border-pdv-accent bg-pdv-bg" : "border-pdv-muted"}`}>
                <input type="radio" name="bicoId" value={b.id} required checked={bicoId === b.id} onChange={() => setBicoId(b.id)} className="sr-only" aria-label={`Bico ${b.numero}, ${b.combustivel}`} />
                {String(b.numero).padStart(2, "0")}
              </label>
            ))}
          </div>
          {bicoId ? (
            <p className="mt-2 text-sm text-pdv-muted">
              {bicos.find((b) => b.id === bicoId)?.combustivel} · {precoLitro(bicos.find((b) => b.id === bicoId)!.preco)}/L
            </p>
          ) : null}
        </fieldset>
        <div className="flex gap-4">
          {(["valor", "litros"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input type="radio" name="modo" value={m} checked={modo === m} onChange={() => setModo(m)} className="size-4" />
              {m === "valor" ? "Por valor (R$)" : "Por litros"}
            </label>
          ))}
        </div>
        <div>
          <label htmlFor="quantidade" className="mb-1 block text-sm text-pdv-muted">{modo === "valor" ? "Valor (R$)" : "Litros"}</label>
          <input id="quantidade" name="quantidade" required inputMode="decimal" placeholder={modo === "valor" ? "100,00" : "20,000"} className="num h-control-pdv w-full rounded-sm border border-pdv-muted bg-pdv-bg px-3 text-right text-lg text-pdv-text" />
        </div>
        {estado.erro ? <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 font-semibold text-on-danger-bg">{estado.erro}</p> : null}
        <button type="submit" disabled={enviando} className="h-control-pdv w-full rounded-md bg-accent text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {enviando ? "Lançando…" : "Lançar"}
        </button>
      </form>
    </Dialogo>
  );
}

function DialogoMovimento({ refDialogo }: { refDialogo: React.RefObject<HTMLDialogElement | null> }) {
  const [estado, acao, enviando] = useAcao<Estado>(acaoMovimento);
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok) {
      form.current?.reset();
      setChave(crypto.randomUUID());
      refDialogo.current?.close();
    }
  }, [estado, refDialogo]);

  return (
    <Dialogo refDialogo={refDialogo} titulo="Sangria, suprimento ou despesa">
      <form ref={form} onSubmit={acao} className="space-y-4">
        <input type="hidden" name="chave" value={chave} />
        <div>
          <label htmlFor="tipo" className="mb-1 block text-sm text-pdv-muted">Tipo</label>
          <select id="tipo" name="tipo" className="h-control-normal w-full rounded-sm border border-pdv-muted bg-pdv-bg px-3 text-pdv-text">
            <option value="sangria">Sangria (retirada para o cofre)</option>
            <option value="suprimento">Suprimento (troco colocado)</option>
            <option value="despesa">Despesa paga com dinheiro do caixa</option>
            <option value="receita">Outra entrada de dinheiro</option>
          </select>
        </div>
        <div>
          <label htmlFor="valor-mov" className="mb-1 block text-sm text-pdv-muted">Valor (R$)</label>
          <input id="valor-mov" name="valor" required inputMode="decimal" className="num h-control-pdv w-full rounded-sm border border-pdv-muted bg-pdv-bg px-3 text-right text-lg text-pdv-text" />
        </div>
        <div>
          <label htmlFor="motivo" className="mb-1 block text-sm text-pdv-muted">Motivo</label>
          <input id="motivo" name="motivo" required minLength={3} className="h-control-normal w-full rounded-sm border border-pdv-muted bg-pdv-bg px-3 text-pdv-text" />
        </div>
        {estado.erro ? <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 font-semibold text-on-danger-bg">{estado.erro}</p> : null}
        <button type="submit" disabled={enviando} className="h-control-pdv w-full rounded-md bg-accent text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {enviando ? "Registrando…" : "Registrar"}
        </button>
      </form>
    </Dialogo>
  );
}
