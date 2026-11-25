import type { ButtonHTMLAttributes, ComponentProps, ReactNode, SelectHTMLAttributes } from "react";

// Primitivos do design system (replica/design/components.md). Só tokens, nada de cor solta.

type Variante = "primario" | "secundario" | "fantasma" | "perigo";
type Tamanho = "compacto" | "normal" | "pdv";

const variantes: Record<Variante, string> = {
  primario: "bg-accent text-on-accent hover:bg-accent-hover border-transparent",
  secundario: "bg-bg text-text border-border-input hover:bg-surface",
  fantasma: "bg-transparent text-accent border-transparent hover:bg-surface",
  perigo: "bg-danger text-on-accent border-transparent hover:opacity-90",
};
const tamanhos: Record<Tamanho, string> = {
  compacto: "h-control-compacto px-4 text-sm",
  normal: "h-control-normal px-5 text-base",
  pdv: "h-control-pdv px-6 text-lg",
};

export function botaoClasses(variante: Variante = "primario", tamanho: Tamanho = "compacto", extra = "") {
  return `inline-flex items-center justify-center gap-2 rounded-md border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${variantes[variante]} ${tamanhos[tamanho]} ${extra}`;
}

export function Botao({
  variante = "primario",
  tamanho = "compacto",
  atalho,
  carregando,
  className = "",
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; tamanho?: Tamanho; atalho?: string; carregando?: boolean }) {
  return (
    <button {...rest} aria-busy={carregando || undefined} disabled={rest.disabled || carregando} className={botaoClasses(variante, tamanho, className)}>
      {children}
      {carregando ? <span className="text-xs font-medium">aguarde…</span> : null}
      {atalho ? <Kbd>{atalho}</Kbd> : null}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-sm border border-current px-1 font-mono text-xs font-medium opacity-85">{children}</kbd>;
}

export function Rotulo({ htmlFor, children, calculado }: { htmlFor: string; children: ReactNode; calculado?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-semibold text-text-muted">
      {children}
      {calculado ? <span className="ml-1 font-medium">(calculado)</span> : null}
    </label>
  );
}

const campoBase =
  "w-full rounded-sm border border-border-input bg-bg px-2 text-text placeholder:text-text-muted aria-[invalid=true]:border-2 aria-[invalid=true]:border-danger";

export function Campo({
  numerico,
  tamanho = "compacto",
  className = "",
  ...rest
}: ComponentProps<"input"> & { numerico?: boolean; tamanho?: Tamanho }) {
  const h = tamanho === "pdv" ? "h-control-pdv text-lg" : tamanho === "normal" ? "h-control-normal text-base" : "h-control-compacto";
  return <input {...rest} className={`${campoBase} ${h} ${numerico ? "num text-right" : ""} ${className}`} />;
}

export function Selecao({
  tamanho = "compacto",
  className = "",
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { tamanho?: Tamanho }) {
  const h = tamanho === "pdv" ? "h-control-pdv text-lg" : tamanho === "normal" ? "h-control-normal text-base" : "h-control-compacto";
  return (
    <select {...rest} className={`${campoBase} ${h} ${className}`}>
      {children}
    </select>
  );
}

export function MensagemErro({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-2 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-on-danger-bg">
      {children}
    </p>
  );
}

type Tom = "sucesso" | "aviso" | "perigo" | "neutro" | "info";
const tons: Record<Tom, string> = {
  sucesso: "bg-success-bg text-on-success-bg",
  aviso: "bg-warning-bg text-on-warning-bg",
  perigo: "bg-danger-bg text-on-danger-bg",
  neutro: "bg-surface-2 text-text",
  info: "bg-info-bg text-on-info-bg",
};

export function Selo({ tom = "neutro", children }: { tom?: Tom; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-xs font-semibold ${tons[tom]}`}>
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {children}
    </span>
  );
}

export function Cartao({ titulo, acao, children, className = "" }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-lg border border-border bg-bg p-4 shadow-card ${className}`}>
      {titulo || acao ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {titulo ? <h2 className="text-lg">{titulo}</h2> : <span />}
          {acao}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Tabela({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <div className="relative overflow-x-auto">
      <table aria-label={rotulo} className="w-full border-collapse text-sm [&_td]:border-b [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:whitespace-nowrap [&_th]:border-b [&_th]:border-border [&_th]:bg-surface [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:text-text-muted [&_tfoot_td]:bg-surface [&_tfoot_td]:font-bold">
        {children}
      </table>
    </div>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-text-muted">{children}</p>;
}

export function TituloPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl">{titulo}</h1>
        {descricao ? <p className="text-text-muted">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap gap-2">{acoes}</div> : null}
    </div>
  );
}
