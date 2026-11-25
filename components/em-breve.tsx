import { Cartao, TituloPagina } from "./ui";

/** Tela ainda não construída: rota existe para a navegação ficar completa. */
export function EmBreve({ titulo, marco, descricao }: { titulo: string; marco: string; descricao: string }) {
  return (
    <>
      <TituloPagina titulo={titulo} />
      <Cartao>
        <p className="mb-1 font-semibold">Esta tela entra no {marco}.</p>
        <p className="text-text-muted">{descricao}</p>
      </Cartao>
    </>
  );
}
