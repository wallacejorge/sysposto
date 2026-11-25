import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { q } from "./db";

// Sessão em cookie assinado (HMAC). Na etapa de backend o login do gerente passa
// para o Supabase Auth; a troca de operador por PIN no caixa continua assim.

const NOME = "posto_sessao";
const DURACAO_S = 60 * 60 * 14; // um turno longo

type Dados = { u: string; e: string; exp: number };

function segredo(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres).");
  return s;
}

function assinar(corpo: string): string {
  return crypto.createHmac("sha256", segredo()).update(corpo).digest("base64url");
}

export async function criarSessao(usuarioId: string, empresaId: string) {
  const dados: Dados = { u: usuarioId, e: empresaId, exp: Math.floor(Date.now() / 1000) + DURACAO_S };
  const corpo = Buffer.from(JSON.stringify(dados)).toString("base64url");
  (await cookies()).set(NOME, `${corpo}.${assinar(corpo)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DURACAO_S,
  });
}

export async function encerrarSessao() {
  (await cookies()).delete(NOME);
}

async function lerSessao(): Promise<Dados | null> {
  const bruto = (await cookies()).get(NOME)?.value;
  if (!bruto) return null;
  const [corpo, assinatura] = bruto.split(".");
  if (!corpo || !assinatura) return null;
  const esperado = assinar(corpo);
  if (esperado.length !== assinatura.length || !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(assinatura))) return null;
  const dados = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Dados;
  if (dados.exp < Date.now() / 1000) return null;
  return dados;
}

export type Usuario = {
  id: string;
  nome: string;
  apelido: string;
  empresaId: string;
  empresaNome: string;
  perfil: string;
  permissoes: Record<string, boolean>;
};

/** Usuário logado, conferido no banco a cada requisição (ativo e com acesso à empresa). */
export async function usuarioAtual(): Promise<Usuario | null> {
  const s = await lerSessao();
  if (!s) return null;
  const [u] = await q<{ id: string; nome: string; apelido: string; empresa_nome: string; perfil: string; permissoes: Record<string, boolean> }>(
    `select u.id, u.nome, u.apelido, e.nome_fantasia as empresa_nome, p.nome as perfil, p.permissoes
       from usuarios u
       join usuario_empresas ue on ue.usuario_id = u.id and ue.empresa_id = $2
       join empresas e on e.id = ue.empresa_id and e.ativo
       join perfis p on p.id = ue.perfil_id
      where u.id = $1 and u.ativo`,
    [s.u, s.e],
  );
  if (!u) return null;
  return { id: u.id, nome: u.nome, apelido: u.apelido, empresaId: s.e, empresaNome: u.empresa_nome, perfil: u.perfil, permissoes: u.permissoes };
}

export async function exigirUsuario(permissao?: string): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect("/login");
  if (permissao && !u.permissoes[permissao]) redirect("/sem-permissao");
  return u;
}
