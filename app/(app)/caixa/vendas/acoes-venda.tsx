"use client";

import { useRef } from "react";
import { FormAcao } from "@/components/form-acao";
import { Botao, Campo, Rotulo, Selecao } from "@/components/ui";
import type { FormaPagamento } from "@/lib/data/caixa";
import type { VendaDoTurno } from "@/lib/data/vendas";
import { reais } from "@/lib/format";
import { acaoCancelarVenda, acaoTrocarPagamento } from "../actions";

export function AcoesVenda({ venda, formas, podeCancelar }: { venda: VendaDoTurno; formas: FormaPagamento[]; podeCancelar: boolean }) {
  const troca = useRef<HTMLDialogElement>(null);
  const cancela = useRef<HTMLDialogElement>(null);
  const dlg = "m-auto w-[min(520px,calc(100vw-32px))] rounded-lg bg-bg p-0 text-text shadow-pop backdrop:bg-black/50";
  return (
    <div className="flex flex-wrap gap-2">
      <Botao variante="secundario" onClick={() => troca.current?.showModal()}>Trocar pagamento</Botao>
      {podeCancelar ? <Botao variante="perigo" onClick={() => cancela.current?.showModal()}>Cancelar venda</Botao> : null}

      <dialog ref={troca} aria-label="Trocar forma de pagamento" className={dlg}>
        <div className="p-4">
          <h2 className="mb-3 text-lg">Trocar forma de pagamento</h2>
          <FormAcao acao={acaoTrocarPagamento} rotulo="Trocar" extra={<Botao type="button" variante="secundario" onClick={() => troca.current?.close()}>Fechar</Botao>}>
            <div className="space-y-3">
              <div>
                <Rotulo htmlFor={`pg-${venda.id}`}>Pagamento</Rotulo>
                <Selecao id={`pg-${venda.id}`} name="pagamentoId">
                  {venda.pagamentos.map((p) => <option key={p.id} value={p.id}>{p.forma} · {reais(p.valor_centavos)}</option>)}
                </Selecao>
              </div>
              <div>
                <Rotulo htmlFor={`fm-${venda.id}`}>Passa a ser</Rotulo>
                <Selecao id={`fm-${venda.id}`} name="formaId">
                  {formas.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </Selecao>
              </div>
              <div>
                <Rotulo htmlFor={`mt-${venda.id}`}>Motivo</Rotulo>
                <Campo id={`mt-${venda.id}`} name="motivo" required minLength={5} maxLength={200} placeholder="Ex.: lançado como débito, era PIX" />
              </div>
            </div>
          </FormAcao>
        </div>
      </dialog>

      <dialog ref={cancela} aria-label="Cancelar venda" className={dlg}>
        <div className="p-4">
          <h2 className="mb-1 text-lg">Cancelar venda de {reais(venda.total_centavos)}</h2>
          <p className="mb-3 text-sm text-text-muted">Os abastecimentos desta venda voltam para a lista do caixa para serem vendidos de novo.</p>
          <FormAcao acao={acaoCancelarVenda} rotulo="Cancelar venda" variante="perigo" extra={<Botao type="button" variante="secundario" onClick={() => cancela.current?.close()}>Voltar</Botao>}>
            <input type="hidden" name="vendaId" value={venda.id} />
            <Rotulo htmlFor={`mc-${venda.id}`}>Motivo (pelo menos 15 letras)</Rotulo>
            <Campo id={`mc-${venda.id}`} name="motivo" required minLength={15} maxLength={200} />
          </FormAcao>
        </div>
      </dialog>
    </div>
  );
}
