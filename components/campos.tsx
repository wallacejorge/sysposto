import type { ReactNode } from "react";
import { Campo, Rotulo, Selecao } from "./ui";

// Campos com rótulo para os formulários de cadastro (sem estado: funcionam no servidor).

export function CampoTexto({
  nome, rotulo, valor, obrigatorio, numerico, dica, ...rest
}: {
  nome: string; rotulo: string; valor?: string | number | null; obrigatorio?: boolean; numerico?: boolean; dica?: string;
  maxLength?: number; pattern?: string; inputMode?: "text" | "numeric" | "decimal"; placeholder?: string; type?: string; autoFocus?: boolean; title?: string;
}) {
  const id = `c-${nome}`;
  return (
    <div className="min-w-0">
      <Rotulo htmlFor={id}>{rotulo}{obrigatorio ? <span aria-hidden className="text-danger"> *</span> : null}</Rotulo>
      <Campo id={id} name={nome} defaultValue={valor ?? ""} required={obrigatorio} numerico={numerico} aria-describedby={dica ? `${id}-dica` : undefined} {...rest} />
      {dica ? <p id={`${id}-dica`} className="mt-1 text-xs text-text-muted">{dica}</p> : null}
    </div>
  );
}

export function CampoSelecao({
  nome, rotulo, valor, obrigatorio, children, dica,
}: { nome: string; rotulo: string; valor?: string | null; obrigatorio?: boolean; children: ReactNode; dica?: string }) {
  const id = `c-${nome}`;
  return (
    <div className="min-w-0">
      <Rotulo htmlFor={id}>{rotulo}{obrigatorio ? <span aria-hidden className="text-danger"> *</span> : null}</Rotulo>
      <Selecao id={id} name={nome} defaultValue={valor ?? ""} required={obrigatorio} aria-describedby={dica ? `${id}-dica` : undefined}>
        {children}
      </Selecao>
      {dica ? <p id={`${id}-dica`} className="mt-1 text-xs text-text-muted">{dica}</p> : null}
    </div>
  );
}

export function CampoMarcar({ nome, rotulo, marcado, dica }: { nome: string; rotulo: string; marcado?: boolean; dica?: string }) {
  const id = `c-${nome}`;
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" name={nome} defaultChecked={marcado} className="mt-0.5 size-4" aria-describedby={dica ? `${id}-dica` : undefined} />
      <div>
        <label htmlFor={id} className="text-sm font-medium">{rotulo}</label>
        {dica ? <p id={`${id}-dica`} className="text-xs text-text-muted">{dica}</p> : null}
      </div>
    </div>
  );
}

export function Grade({ children, colunas = 3 }: { children: ReactNode; colunas?: 2 | 3 | 4 }) {
  const c = colunas === 2 ? "sm:grid-cols-2" : colunas === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3";
  return <div className={`grid gap-4 ${c}`}>{children}</div>;
}
