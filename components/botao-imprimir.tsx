"use client";

import { Botao } from "./ui";

export function BotaoImprimir() {
  return (
    <Botao variante="secundario" onClick={() => window.print()} className="print:hidden">
      Imprimir
    </Botao>
  );
}
