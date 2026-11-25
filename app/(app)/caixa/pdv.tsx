"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Catalogo } from "@/lib/data/vendas";
import { horaBR, lerReais, lerTresCasas, precoLitro, reais, tresCasas } from "@/lib/format";
import { conferirPinLocal, lembrarPin } from "@/lib/fila";
import { Kbd } from "@/components/ui";
import { acaoDesbloquear } from "./actions";
import { useCaixa, type EstadoCaixa } from "./use-caixa";

// Caixa: tema escuro, controles grandes, tudo pelo teclado.
// F2 abastecimentos · F3 produto · F7 bico manual · F9 vendas do turno · F10 finalizar · F12 sangria · Ctrl+L bloquear

const ATRASO_MIN = 15; // abastecimento parado há mais tempo que isso ganha aviso
const BLOQUEIO_INATIVO_MIN = 15; // tela bloqueia sozinha depois desse tempo sem uso

type Produto = Catalogo["produtos"][number];
type LinhaProduto = { produto: Produto; quantidade: number };
type LinhaPagamento = { chave: string; formaId: string; texto: string };

const centavosDe = (texto: string) => lerReais(texto) ?? 0;
const textoDe = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const novoId = () => crypto.randomUUID();

const campoPdv = "num w-full rounded-sm border border-pdv-muted bg-pdv-bg px-3 text-pdv-text";
const botaoPdv = "rounded-md border border-pdv-muted px-4 font-semibold hover:bg-pdv-surface disabled:opacity-50";

export function Pdv({ usuario, inicial }: { usuario: { id: string; apelido: string }; inicial: EstadoCaixa }) {
  const caixa = useCaixa(usuario.id, inicial);
  const { estado, online, fila, rejeitadas, pendentes, disponiveis, turnoFechado } = caixa;
  const cat = estado.catalogo;
  const turno = estado.turno ?? inicial.turno!;

  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [produtos, setProdutos] = useState<LinhaProduto[]>([]);
  const [pagamentos, setPagamentos] = useState<LinhaPagamento[]>([]);
  const [frentistaId, setFrentistaId] = useState("");
  const [cpf, setCpf] = useState("");
  const [chave, setChave] = useState(novoId);
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro" | "aviso"; texto: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [bloqueado, setBloqueado] = useState(false);

  const listaRef = useRef<HTMLTableSectionElement>(null);
  const dlgManual = useRef<HTMLDialogElement>(null);
  const dlgMov = useRef<HTMLDialogElement>(null);
  const dlgProduto = useRef<HTMLDialogElement>(null);

  // Some da seleção o que não existe mais (outro caixa registrou). O que está indo numa venda agora continua.
  useEffect(() => {
    setSelecionados((s) => s.filter((id) => disponiveis.some((p) => p.id === id)));
  }, [disponiveis]);

  const itensAbast = disponiveis.filter((p) => selecionados.includes(p.id));
  const totalAbast = itensAbast.reduce((s, p) => s + p.total_centavos, 0);
  const totalProd = produtos.reduce((s, l) => s + Math.round(l.quantidade * Number(l.produto.preco) * 100), 0);
  const total = totalAbast + totalProd;
  const formaDe = useCallback((id: string) => cat.formas.find((f) => f.id === id), [cat.formas]);
  const pago = pagamentos.reduce((s, p) => s + centavosDe(p.texto), 0);
  const emDinheiro = pagamentos.filter((p) => formaDe(p.formaId)?.tipo === "dinheiro").reduce((s, p) => s + centavosDe(p.texto), 0);
  const falta = Math.max(0, total - pago);
  const troco = Math.max(0, pago - total);
  const trocoInvalido = troco > emDinheiro;
  const vazio = !itensAbast.length && !produtos.length;
  const podeFinalizar = !vazio && pago >= total && !trocoInvalido && !enviando && !turnoFechado;

  function limpar() {
    setSelecionados([]);
    setProdutos([]);
    setPagamentos([]);
    setFrentistaId("");
    setCpf("");
    setChave(novoId());
  }

  function alternar(id: string) {
    setSelecionados((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function adicionarPagamento(formaId: string) {
    setPagamentos((ps) => {
      const ja = ps.find((p) => p.formaId === formaId);
      const restante = Math.max(0, total - ps.reduce((s, p) => s + centavosDe(p.texto), 0));
      if (ja) return ps.map((p) => (p === ja ? { ...p, texto: textoDe(centavosDe(p.texto) + restante) } : p));
      return [...ps, { chave: novoId(), formaId, texto: textoDe(restante) }];
    });
    // Dinheiro: o foco vai para o valor, para digitar quanto o cliente deu.
    if (formaDe(formaId)?.tipo === "dinheiro") setTimeout(() => document.getElementById(`pag-${formaId}`)?.focus(), 0);
  }

  function adicionarProduto(p: Produto, qtd = 1) {
    setProdutos((ls) => {
      const ja = ls.find((l) => l.produto.id === p.id);
      return ja ? ls.map((l) => (l === ja ? { ...l, quantidade: l.quantidade + qtd } : l)) : [...ls, { produto: p, quantidade: qtd }];
    });
  }

  async function finalizar() {
    if (!podeFinalizar) {
      if (!vazio && pago < total) setMensagem({ tipo: "erro", texto: `Falta pagar ${reais(falta)}. Escolha a forma de pagamento.` });
      return;
    }
    setEnviando(true);
    setMensagem(null);
    const trocoLocal = troco;
    const r = await caixa.executar({
      tipo: "venda", chave, turnoId: turno.id, abastecimentos: itensAbast.map((p) => p.id),
      produtos: produtos.map((l) => ({ mercadoriaId: l.produto.id, quantidade: String(l.quantidade) })),
      pagamentos: pagamentos.map((p) => ({ formaId: p.formaId, valorCentavos: centavosDe(p.texto) })).filter((p) => p.valorCentavos > 0),
      cpf: cpf || undefined, frentistaId: frentistaId || undefined, criadaEm: new Date().toISOString(), offline: !navigator.onLine,
    });
    setEnviando(false);
    if (r === null) {
      setMensagem({ tipo: "aviso", texto: `Sem internet: venda guardada neste computador.${trocoLocal ? ` Troco: ${reais(trocoLocal)}.` : ""} Ela será enviada quando a conexão voltar.` });
      limpar();
    } else if (r.ok) {
      setMensagem({ tipo: "ok", texto: `Venda registrada.${r.trocoCentavos ? ` Troco: ${reais(r.trocoCentavos)}.` : ""}` });
      limpar();
    } else {
      setMensagem({ tipo: "erro", texto: r.erro });
      setChave(novoId()); // a venda recusada não volta; a próxima tentativa é outra venda
    }
  }

  // Teclado
  const finalizarRef = useRef(finalizar);
  finalizarRef.current = finalizar;
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (bloqueado) return;
      const k = e.key;
      if (k === "F2") { e.preventDefault(); listaRef.current?.querySelector<HTMLInputElement>("input")?.focus(); }
      else if (k === "F3") { e.preventDefault(); dlgProduto.current?.showModal(); }
      else if (k === "F7") { e.preventDefault(); dlgManual.current?.showModal(); }
      else if (k === "F9") { e.preventDefault(); window.location.href = "/caixa/vendas"; }
      else if (k === "F10") { e.preventDefault(); void finalizarRef.current(); }
      else if (k === "F12") { e.preventDefault(); dlgMov.current?.showModal(); }
      else if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === "l") { e.preventDefault(); setBloqueado(true); }
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [bloqueado]);

  // Bloqueio por inatividade
  useEffect(() => {
    let ultimo = Date.now();
    const mexeu = () => { ultimo = Date.now(); };
    const eventos = ["keydown", "pointerdown", "pointermove"] as const;
    eventos.forEach((ev) => window.addEventListener(ev, mexeu, { passive: true }));
    const t = setInterval(() => {
      if (Date.now() - ultimo > BLOQUEIO_INATIVO_MIN * 60_000) setBloqueado(true);
    }, 30_000);
    return () => { eventos.forEach((ev) => window.removeEventListener(ev, mexeu)); clearInterval(t); };
  }, []);

  const agora = useMemo(() => Date.now(), [pendentes]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-var(--layout-statusbar))] bg-pdv-bg p-4 text-pdv-text md:-mx-8 md:px-6">
      {/* Cabeçalho */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl">Caixa · {turno.caixa}</h1>
          <span role="status" className={`rounded-pill px-3 py-1 text-xs font-semibold ${online ? "bg-success-bg text-on-success-bg" : "bg-warning-bg text-on-warning-bg"}`}>
            {online ? "Online" : "Sem internet"}{fila.length ? ` · ${fila.length} na fila` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => dlgProduto.current?.showModal()} className={`h-control-normal ${botaoPdv}`}>Produto <Kbd>F3</Kbd></button>
          <button type="button" onClick={() => dlgManual.current?.showModal()} className={`h-control-normal ${botaoPdv}`}>Bico manual <Kbd>F7</Kbd></button>
          <button type="button" onClick={() => dlgMov.current?.showModal()} className={`h-control-normal ${botaoPdv}`}>Sangria / despesa <Kbd>F12</Kbd></button>
          <Link href="/caixa/vendas" className={`flex h-control-normal items-center ${botaoPdv}`}>Vendas do turno <Kbd>F9</Kbd></Link>
          <button type="button" onClick={() => setBloqueado(true)} className={`h-control-normal ${botaoPdv}`}>Bloquear <Kbd>Ctrl+L</Kbd></button>
          <Link href="/caixa/fechar" className={`flex h-control-normal items-center ${botaoPdv}`}>Fechar turno</Link>
        </div>
      </div>

      {turnoFechado ? (
        <div role="alert" className="mb-3 rounded-md bg-danger-bg px-3 py-2 font-semibold text-on-danger-bg">
          Este turno foi fechado (em outro computador). Não dá para vender nele. <Link href="/caixa/abrir" className="underline">Abrir um novo turno</Link>
        </div>
      ) : null}
      {!online ? (
        <p role="status" className="mb-3 rounded-md bg-warning-bg px-3 py-2 font-semibold text-on-warning-bg">
          Sem internet. Continue vendendo: as vendas ficam guardadas neste computador{fila.length ? ` (${fila.length} na fila)` : ""} e são enviadas sozinhas quando a conexão voltar. Não feche o navegador nem limpe os dados dele.
        </p>
      ) : null}
      {rejeitadas.length ? (
        <div role="alert" className="mb-3 rounded-md bg-danger-bg px-3 py-2 text-on-danger-bg">
          <p className="font-semibold">{rejeitadas.length} operação(ões) feitas sem internet foram recusadas pelo sistema. Chame o gerente:</p>
          <ul className="mt-1 space-y-1 text-sm">
            {rejeitadas.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2">
                <span>{r.op.tipo === "venda" ? "Venda" : r.op.tipo === "manual" ? "Bico manual" : "Movimento"} de {horaBR(r.criadoEm)}: {r.erro}</span>
                <button type="button" onClick={() => void caixa.descartar(r.id)} className="underline">já resolvi, remover aviso</button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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
                          <input type="checkbox" className="size-5 accent-[var(--color-pdv-accent)]" checked={sel} onChange={() => alternar(p.id)} onClick={(e) => e.stopPropagation()}
                            aria-label={`Bico ${p.bico}, ${tresCasas(p.litros)} litros, ${reais(p.total_centavos)}`} />
                        </td>
                        <td>
                          <span className="font-bold">{String(p.bico).padStart(2, "0")}</span> {p.combustivel}
                          {p.origem === "manual" ? <span className="ml-2 text-xs text-pdv-muted">manual</span> : null}
                          {p.naFila ? <span className="ml-2 text-xs text-pdv-muted">(na fila)</span> : null}
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
        <section aria-labelledby="titulo-venda" className="min-w-0 space-y-4 rounded-md bg-pdv-surface p-4">
          <h2 id="titulo-venda" className="sr-only">Venda</h2>

          {itensAbast.length || produtos.length ? (
            <ul className="space-y-1 text-sm" aria-label="Itens da venda">
              {itensAbast.map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>Bico {String(p.bico).padStart(2, "0")} · {p.combustivel} · {tresCasas(p.litros)} L</span>
                  <span className="num">{reais(p.total_centavos)}</span>
                </li>
              ))}
              {produtos.map((l) => (
                <li key={l.produto.id} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <button type="button" aria-label={`Menos ${l.produto.nome}`} className="size-7 rounded-sm border border-pdv-muted"
                      onClick={() => setProdutos((ls) => ls.flatMap((x) => (x === l ? (x.quantidade > 1 ? [{ ...x, quantidade: x.quantidade - 1 }] : []) : [x])))}>−</button>
                    <span className="num w-6 text-center">{l.quantidade}</span>
                    <button type="button" aria-label={`Mais ${l.produto.nome}`} className="size-7 rounded-sm border border-pdv-muted"
                      onClick={() => adicionarProduto(l.produto)}>+</button>
                    {l.produto.nome}
                  </span>
                  <span className="num">{reais(Math.round(l.quantidade * Number(l.produto.preco) * 100))}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-pdv-muted">Selecione abastecimentos ao lado ou adicione um produto (F3).</p>
          )}

          <div>
            <p className="text-pdv-muted">Total</p>
            <p className="num text-[length:var(--text-pdv-total)] leading-[var(--text-pdv-total--line-height)] font-bold text-pdv-total" aria-live="polite">{reais(total)}</p>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm text-pdv-muted">Pagamento (clique para lançar o que falta)</legend>
            <div className="grid grid-cols-2 gap-2">
              {cat.formas.map((f) => (
                <button key={f.id} type="button" disabled={vazio} onClick={() => adicionarPagamento(f.id)}
                  className="h-control-pdv rounded-md border border-pdv-muted text-lg font-semibold hover:bg-pdv-bg disabled:opacity-40">
                  {f.nome}
                </button>
              ))}
            </div>
          </fieldset>

          {pagamentos.length ? (
            <div className="space-y-2">
              {pagamentos.map((p) => {
                const f = formaDe(p.formaId);
                return (
                  <div key={p.chave} className="flex items-center gap-2">
                    <label htmlFor={`pag-${p.formaId}`} className="w-32 shrink-0 text-sm">{f?.nome}{f?.tipo === "dinheiro" ? " (recebido)" : ""}</label>
                    <input id={`pag-${p.formaId}`} inputMode="decimal" value={p.texto}
                      onChange={(e) => setPagamentos((ps) => ps.map((x) => (x === p ? { ...x, texto: e.target.value } : x)))}
                      onFocus={(e) => e.target.select()} className={`h-control-normal text-right text-lg ${campoPdv}`} />
                    <button type="button" aria-label={`Tirar ${f?.nome}`} className="h-control-normal px-2 text-pdv-muted hover:text-pdv-text"
                      onClick={() => setPagamentos((ps) => ps.filter((x) => x !== p))}>✕</button>
                  </div>
                );
              })}
              <div className="flex flex-wrap justify-between gap-2 text-sm" aria-live="polite">
                <span className="text-pdv-muted">Pago {reais(pago)}</span>
                {falta ? <span className="rounded-pill bg-warning-bg px-2 font-semibold text-on-warning-bg">Falta {reais(falta)}</span> : null}
                {troco ? (trocoInvalido
                  ? <span className="rounded-pill bg-danger-bg px-2 font-semibold text-on-danger-bg">Passou {reais(troco)} (troco só em dinheiro)</span>
                  : <span className="text-xl font-bold">Troco {reais(troco)}</span>) : null}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="cpf" className="mb-1 block text-sm text-pdv-muted">CPF/CNPJ na nota (opcional)</label>
              <input id="cpf" inputMode="numeric" autoComplete="off" value={cpf} onChange={(e) => setCpf(e.target.value)} className={`h-control-normal ${campoPdv}`} />
            </div>
            {cat.frentistas.length ? (
              <div>
                <label htmlFor="frentista" className="mb-1 block text-sm text-pdv-muted">Frentista (opcional)</label>
                <select id="frentista" value={frentistaId} onChange={(e) => setFrentistaId(e.target.value)} className={`h-control-normal ${campoPdv}`}>
                  <option value="">—</option>
                  {cat.frentistas.map((f) => <option key={f.id} value={f.id}>{f.apelido}</option>)}
                </select>
              </div>
            ) : null}
          </div>

          {mensagem ? (
            <p role={mensagem.tipo === "erro" ? "alert" : "status"} className={`rounded-md px-3 py-2 font-semibold ${
              mensagem.tipo === "ok" ? "bg-success-bg text-on-success-bg" : mensagem.tipo === "erro" ? "bg-danger-bg text-on-danger-bg" : "bg-warning-bg text-on-warning-bg"}`}>
              {mensagem.texto}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button type="button" onClick={() => void finalizar()} disabled={!podeFinalizar}
              className="h-control-pdv flex-1 rounded-md bg-accent text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
              {enviando ? "Registrando…" : "Finalizar venda"} <Kbd>F10</Kbd>
            </button>
            {!vazio ? <button type="button" onClick={() => { limpar(); setMensagem(null); }} className={`h-control-pdv ${botaoPdv}`}>Limpar</button> : null}
          </div>
          <p className="text-xs text-pdv-muted">A emissão da NFC-e entra no próximo marco. Por enquanto a venda é registrada sem nota.</p>
        </section>
      </div>

      <DialogoProduto refDialogo={dlgProduto} produtos={cat.produtos} aoEscolher={(p, q) => { adicionarProduto(p, q); dlgProduto.current?.close(); }} />
      <DialogoManual refDialogo={dlgManual} bicos={cat.bicos}
        aoLancar={async (dados) => {
          const r = await caixa.executar({ tipo: "manual", id: novoId(), turnoId: turno.id, fim: new Date().toISOString(), ...dados });
          if (r && !r.ok) return r.erro;
          setMensagem(r ? { tipo: "ok", texto: "Abastecimento lançado." } : { tipo: "aviso", texto: "Sem internet: abastecimento guardado neste computador." });
          return null;
        }} />
      <DialogoMovimento refDialogo={dlgMov}
        aoRegistrar={async (dados) => {
          const r = await caixa.executar({ tipo: "movimento", chave: novoId(), turnoId: turno.id, ...dados });
          if (r && !r.ok) return r.erro;
          setMensagem(r ? { tipo: "ok", texto: "Movimento registrado." } : { tipo: "aviso", texto: "Sem internet: movimento guardado neste computador." });
          return null;
        }} />
      {bloqueado ? <Bloqueio usuario={usuario} online={online} aoDesbloquear={() => setBloqueado(false)} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Dialogo({ refDialogo, titulo, children }: { refDialogo: React.RefObject<HTMLDialogElement | null>; titulo: string; children: React.ReactNode }) {
  return (
    <dialog ref={refDialogo} aria-label={titulo}
      className="m-auto w-[min(600px,calc(100vw-32px))] rounded-lg bg-pdv-surface p-0 text-pdv-text shadow-pop backdrop:bg-black/60">
      <div className="flex items-center justify-between border-b border-pdv-bg px-4 py-3">
        <h2 className="text-lg">{titulo}</h2>
        <button type="button" onClick={() => refDialogo.current?.close()} className="rounded-md px-2 py-1 text-pdv-muted hover:text-pdv-text">Fechar <Kbd>Esc</Kbd></button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

function Erro({ texto }: { texto: string | null }) {
  return texto ? <p role="alert" className="rounded-md bg-danger-bg px-3 py-2 font-semibold text-on-danger-bg">{texto}</p> : null;
}

function DialogoProduto({ refDialogo, produtos, aoEscolher }: { refDialogo: React.RefObject<HTMLDialogElement | null>; produtos: Produto[]; aoEscolher: (p: Produto, qtd: number) => void }) {
  const [busca, setBusca] = useState("");
  const [qtd, setQtd] = useState("1");
  const [erro, setErro] = useState<string | null>(null);
  const termo = busca.trim().toLowerCase();
  const achados = termo ? produtos.filter((p) => p.codigo_barras === termo || p.codigo.toLowerCase() === termo || p.nome.toLowerCase().includes(termo)).slice(0, 30) : produtos.slice(0, 30);
  const quantidade = Number(qtd.replace(",", "."));

  function escolher(p: Produto) {
    if (!(quantidade > 0)) return setErro("Quantidade inválida.");
    if (p.unidade === "UN" && !Number.isInteger(quantidade)) return setErro("Este produto é vendido por unidade.");
    aoEscolher(p, quantidade);
    setBusca(""); setQtd("1"); setErro(null);
  }

  return (
    <Dialogo refDialogo={refDialogo} titulo="Adicionar produto">
      <div className="space-y-3">
        <div className="grid grid-cols-[1fr_6rem] gap-2">
          <div>
            <label htmlFor="busca-produto" className="mb-1 block text-sm text-pdv-muted">Nome, código ou código de barras</label>
            <input id="busca-produto" autoFocus value={busca} onChange={(e) => { setBusca(e.target.value); setErro(null); }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                const exato = produtos.find((p) => p.codigo_barras === termo || p.codigo.toLowerCase() === termo);
                if (exato) escolher(exato);
                else if (achados.length === 1) escolher(achados[0]);
                else setErro(achados.length ? "Escolha um produto da lista." : "Nenhum produto encontrado.");
              }}
              className={`h-control-pdv text-lg ${campoPdv}`} />
          </div>
          <div>
            <label htmlFor="qtd-produto" className="mb-1 block text-sm text-pdv-muted">Qtd</label>
            <input id="qtd-produto" inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} className={`h-control-pdv text-right text-lg ${campoPdv}`} />
          </div>
        </div>
        <Erro texto={erro} />
        <ul className="max-h-80 overflow-y-auto rounded-md border border-pdv-bg" aria-label="Produtos encontrados">
          {achados.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => escolher(p)} className="flex w-full justify-between gap-2 border-b border-pdv-bg px-3 py-2 text-left hover:bg-pdv-bg">
                <span>{p.nome} <span className="text-xs text-pdv-muted">{p.codigo}</span></span>
                <span className="num">{reais(Math.round(Number(p.preco) * 100))}/{p.unidade}</span>
              </button>
            </li>
          ))}
          {!achados.length ? <li className="px-3 py-4 text-center text-pdv-muted">Nenhum produto. Cadastre em Mercadorias e preços.</li> : null}
        </ul>
      </div>
    </Dialogo>
  );
}

function DialogoManual({ refDialogo, bicos, aoLancar }: {
  refDialogo: React.RefObject<HTMLDialogElement | null>; bicos: Catalogo["bicos"];
  aoLancar: (d: { bicoId: string; litros?: string; valorCentavos?: number }) => Promise<string | null>;
}) {
  const [bicoId, setBicoId] = useState("");
  const [modo, setModo] = useState<"valor" | "litros">("valor");
  const [quantidade, setQuantidade] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const bico = bicos.find((b) => b.id === bicoId);

  async function lancar(e: React.FormEvent) {
    e.preventDefault();
    if (!bicoId) return setErro("Escolha o bico.");
    const valor = lerReais(quantidade) ?? 0;
    const litros = lerTresCasas(quantidade) ?? "0";
    if (modo === "valor" ? !(valor > 0) : !(Number(litros) > 0)) return setErro(modo === "valor" ? "Informe o valor em reais." : "Informe os litros.");
    setEnviando(true);
    const r = await aoLancar(modo === "valor" ? { bicoId, valorCentavos: valor } : { bicoId, litros });
    setEnviando(false);
    if (r) return setErro(r);
    setBicoId(""); setQuantidade(""); setErro(null);
    refDialogo.current?.close();
  }

  return (
    <Dialogo refDialogo={refDialogo} titulo="Lançar abastecimento manual">
      <form onSubmit={lancar} className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm text-pdv-muted">Bico</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {bicos.map((b) => (
              <label key={b.id} title={`${b.combustivel} ${precoLitro(b.preco)}/L`} className={`flex h-14 cursor-pointer flex-col items-center justify-center rounded-md border font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--color-pdv-accent)] ${bicoId === b.id ? "border-pdv-accent bg-pdv-bg" : "border-pdv-muted"}`}>
                <input type="radio" name="bicoId" value={b.id} checked={bicoId === b.id} onChange={() => setBicoId(b.id)} className="sr-only" aria-label={`Bico ${b.numero}, ${b.combustivel}`} />
                {String(b.numero).padStart(2, "0")}
              </label>
            ))}
          </div>
          {bico ? <p className="mt-2 text-sm text-pdv-muted">{bico.combustivel} · {precoLitro(bico.preco)}/L</p> : null}
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
          <input id="quantidade" inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder={modo === "valor" ? "100,00" : "20,000"}
            className={`h-control-pdv text-right text-lg ${campoPdv}`} />
        </div>
        <Erro texto={erro} />
        <button type="submit" disabled={enviando} className="h-control-pdv w-full rounded-md bg-accent text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {enviando ? "Lançando…" : "Lançar"}
        </button>
      </form>
    </Dialogo>
  );
}

function DialogoMovimento({ refDialogo, aoRegistrar }: {
  refDialogo: React.RefObject<HTMLDialogElement | null>;
  aoRegistrar: (d: { tipoMov: "sangria" | "suprimento" | "despesa" | "receita"; valorCentavos: number; motivo: string }) => Promise<string | null>;
}) {
  const [tipo, setTipo] = useState<"sangria" | "suprimento" | "despesa" | "receita">("sangria");
  const [valor, setValor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    const v = lerReais(valor);
    if (!v || v <= 0) return setErro("Informe o valor.");
    if (motivo.trim().length < 3) return setErro("Escreva o motivo.");
    setEnviando(true);
    const r = await aoRegistrar({ tipoMov: tipo, valorCentavos: v, motivo: motivo.trim() });
    setEnviando(false);
    if (r) return setErro(r);
    setValor(""); setMotivo(""); setErro(null);
    refDialogo.current?.close();
  }

  return (
    <Dialogo refDialogo={refDialogo} titulo="Sangria, suprimento ou despesa">
      <form onSubmit={registrar} className="space-y-4">
        <div>
          <label htmlFor="tipo" className="mb-1 block text-sm text-pdv-muted">Tipo</label>
          <select id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={`h-control-normal ${campoPdv}`}>
            <option value="sangria">Sangria (retirada para o cofre)</option>
            <option value="suprimento">Suprimento (troco colocado)</option>
            <option value="despesa">Despesa paga com dinheiro do caixa</option>
            <option value="receita">Outra entrada de dinheiro</option>
          </select>
        </div>
        <div>
          <label htmlFor="valor-mov" className="mb-1 block text-sm text-pdv-muted">Valor (R$)</label>
          <input id="valor-mov" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={`h-control-pdv text-right text-lg ${campoPdv}`} />
        </div>
        <div>
          <label htmlFor="motivo" className="mb-1 block text-sm text-pdv-muted">Motivo</label>
          <input id="motivo" value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} className={`h-control-normal ${campoPdv}`} />
        </div>
        <Erro texto={erro} />
        <button type="submit" disabled={enviando} className="h-control-pdv w-full rounded-md bg-accent text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {enviando ? "Registrando…" : "Registrar"}
        </button>
      </form>
    </Dialogo>
  );
}

function Bloqueio({ usuario, online, aoDesbloquear }: { usuario: { id: string; apelido: string }; online: boolean; aoDesbloquear: () => void }) {
  const [pin, setPin] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => campo.current?.focus(), []);

  async function desbloquear(e: React.FormEvent) {
    e.preventDefault();
    setConferindo(true);
    setErro(null);
    let ok: boolean | null = null;
    try {
      const fd = new FormData();
      fd.set("pin", pin);
      const r = await acaoDesbloquear({}, fd);
      ok = r.ok === "desbloqueado" ? true : r.erro === "PIN incorreto." ? false : null;
    } catch {
      ok = null; // sem conexão
    }
    if (ok === null) ok = await conferirPinLocal(usuario.id, pin);
    setConferindo(false);
    if (ok) {
      void lembrarPin(usuario.id, pin);
      aoDesbloquear();
    } else if (ok === false) {
      setErro("PIN incorreto.");
      setPin("");
      campo.current?.focus();
    } else {
      setErro("Sem internet, e este computador ainda não conhece o seu PIN. Espere a conexão voltar.");
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Caixa bloqueado" className="fixed inset-0 z-50 flex items-center justify-center bg-pdv-bg p-4">
      <form onSubmit={desbloquear} className="w-full max-w-sm space-y-4 rounded-lg bg-pdv-surface p-6 text-pdv-text shadow-pop">
        <h2 className="text-xl">Caixa bloqueado</h2>
        <p className="text-pdv-muted">Operador: <b className="text-pdv-text">{usuario.apelido}</b>{online ? "" : " · sem internet"}</p>
        <div>
          <label htmlFor="pin-bloqueio" className="mb-1 block text-sm text-pdv-muted">Digite o seu PIN para continuar</label>
          <input id="pin-bloqueio" ref={campo} type="password" inputMode="numeric" maxLength={6} autoComplete="off" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={`h-control-pdv text-center text-2xl tracking-widest ${campoPdv}`} />
        </div>
        <Erro texto={erro} />
        <button type="submit" disabled={conferindo || pin.length < 4} className="h-control-pdv w-full rounded-md bg-accent text-lg font-semibold text-on-accent hover:bg-accent-hover disabled:opacity-50">
          {conferindo ? "Conferindo…" : "Desbloquear"}
        </button>
        <a href="/api/sair" className="block text-center text-sm text-pdv-muted underline">Outro operador (sair)</a>
      </form>
    </div>
  );
}
