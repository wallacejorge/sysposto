-- Schema do clone do MetaPosto - fase 1 (+ tabelas de fase 2 que a fase 1 já referencia)
-- Postgres 15+ (Supabase). Gerado por replica-architect em 2026-11-25.
--
-- Convenções
--   * id uuid, created_at / updated_at timestamptz (UTC). Datas de operação usam
--     "data_trabalho date", que é a data do posto (America/Sao_Paulo), não a do relógio.
--   * Dinheiro: inteiro em centavos (bigint, sufixo _centavos). Moeda sempre BRL.
--   * Litros e encerrantes: numeric(14,3). Preço por litro: numeric(10,3) (ex.: 5,899).
--   * Todo dado de negócio tem empresa_id. Acesso por RLS: o usuário só vê as empresas
--     em usuario_empresas. Escritas sensíveis (fechar turno, cancelar, emitir NFC-e)
--     passam por funções/rotas do servidor, nunca direto do navegador.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Empresas, usuários, perfis
-- ---------------------------------------------------------------------------

create table empresas (
  id uuid primary key default gen_random_uuid(),
  razao_social text not null,
  nome_fantasia text not null,
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  inscricao_estadual text,
  uf char(2) not null,
  municipio_ibge char(7),
  endereco jsonb not null default '{}',
  regime_tributario text not null check (regime_tributario in ('simples','presumido','real')),
  fuso text not null default 'America/Sao_Paulo',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table perfis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  -- ex.: {"caixa.reabrir": true, "venda.cancelar": false, "preco.alterar": false}
  permissoes jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, nome)
);

create table usuarios (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,             -- conta Supabase Auth (gerentes / retaguarda). Nulo para quem só usa PIN no caixa
  nome text not null,
  apelido text not null,                -- o que aparece na lista do login do caixa
  pin_hash text,                        -- PIN do caixa (bcrypt), troca rápida de operador
  eh_frentista boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table usuario_empresas (
  usuario_id uuid not null references usuarios(id) on delete cascade,
  empresa_id uuid not null references empresas(id) on delete cascade,
  perfil_id uuid not null references perfis(id) on delete restrict,
  primary key (usuario_id, empresa_id)
);
create index on usuario_empresas (empresa_id);
create index on usuario_empresas (perfil_id);

-- ---------------------------------------------------------------------------
-- Mercadorias, preços
-- ---------------------------------------------------------------------------

create table unidades (
  id uuid primary key default gen_random_uuid(),
  sigla text not null unique,           -- L, UN, KG
  descricao text not null
);

create table grupos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  pai_id uuid references grupos(id) on delete restrict,   -- nulo = grupo, preenchido = sub-grupo
  nome text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on grupos (empresa_id);
create index on grupos (pai_id);

create table tributacoes (                -- perfil fiscal reaproveitado por várias mercadorias
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  cfop text not null check (cfop ~ '^[0-9]{4}$'),
  csosn_cst text not null,
  aliquota_icms numeric(5,2) not null default 0,
  monofasico boolean not null default false,  -- combustíveis: ICMS monofásico (ad rem)
  ad_rem_centavos_por_litro integer,
  pis_cst text, cofins_cst text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on tributacoes (empresa_id);

create table mercadorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  codigo text not null,
  nome text not null,
  grupo_id uuid references grupos(id) on delete set null,
  unidade_id uuid not null references unidades(id) on delete restrict,
  tipo text not null check (tipo in ('combustivel','produto','servico')),
  codigo_barras text,
  ncm text check (ncm ~ '^[0-9]{8}$'),
  cest text,
  tributacao_id uuid references tributacoes(id) on delete restrict,
  codigo_anp text,                      -- só combustível
  descricao_anp text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, codigo),
  constraint combustivel_tem_anp check (tipo <> 'combustivel' or codigo_anp is not null)
);
create index on mercadorias (empresa_id, nome);
create index on mercadorias (empresa_id, codigo_barras);
create index on mercadorias (grupo_id);
create index on mercadorias (unidade_id);
create index on mercadorias (tributacao_id);

create table tipos_preco (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,                   -- à vista, a prazo, frota...
  padrao boolean not null default false,
  unique (empresa_id, nome)
);
create unique index um_tipo_preco_padrao on tipos_preco (empresa_id) where padrao;

-- Histórico de preços: nunca se altera uma linha, insere-se uma nova vigência.
create table precos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  mercadoria_id uuid not null references mercadorias(id) on delete cascade,
  tipo_preco_id uuid not null references tipos_preco(id) on delete restrict,
  preco numeric(10,3) not null check (preco >= 0),
  vigente_desde timestamptz not null default now(),
  promocional_ate timestamptz,          -- preenchido = preço promocional com fim
  alterado_por uuid references usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on precos (mercadoria_id, tipo_preco_id, vigente_desde desc);
create index on precos (empresa_id);
create index on precos (tipo_preco_id);
create index on precos (alterado_por);

-- ---------------------------------------------------------------------------
-- Estrutura física do posto
-- ---------------------------------------------------------------------------

create table tanques (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero integer not null,
  mercadoria_id uuid not null references mercadorias(id) on delete restrict,
  capacidade_litros numeric(14,3) not null check (capacidade_litros > 0),
  ativo boolean not null default true,
  unique (empresa_id, numero)
);
create index on tanques (mercadoria_id);

create table bombas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero integer not null,
  ativo boolean not null default true,
  unique (empresa_id, numero)
);

create table bicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  bomba_id uuid not null references bombas(id) on delete restrict,
  numero integer not null,              -- número do bico no posto (único no posto, como no concentrador)
  tanque_id uuid not null references tanques(id) on delete restrict,
  encerrante_maximo numeric(14,3) not null default 999999.999,  -- para a virada do totalizador
  ativo boolean not null default true,
  unique (empresa_id, numero)
);
create index on bicos (bomba_id);
create index on bicos (tanque_id);

-- Abastecimentos vindos do concentrador (via agente do posto) ou lançados à mão.
create table abastecimentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  bico_id uuid not null references bicos(id) on delete restrict,
  id_concentrador text,                 -- único: o agente pode reenviar sem duplicar
  origem text not null check (origem in ('automacao','manual')),
  litros numeric(14,3) not null check (litros > 0),
  preco_unitario numeric(10,3) not null check (preco_unitario >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  encerrante_inicial numeric(14,3),
  encerrante_final numeric(14,3),
  inicio timestamptz, fim timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente','registrado','cancelado')),
  lancado_por uuid references usuarios(id) on delete restrict,  -- manual
  created_at timestamptz not null default now(),
  unique (empresa_id, id_concentrador),
  constraint manual_tem_autor check (origem = 'automacao' or lancado_por is not null),
  constraint automacao_tem_id check (origem = 'manual' or id_concentrador is not null)
);
create index on abastecimentos (empresa_id, status, fim);
create index on abastecimentos (bico_id);
create index on abastecimentos (lancado_por);

-- ---------------------------------------------------------------------------
-- Pagamentos e clientes
-- ---------------------------------------------------------------------------

create table administradoras (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  cnpj text,
  taxa_debito numeric(5,2), taxa_credito numeric(5,2),
  dias_repasse_debito integer, dias_repasse_credito integer,
  unique (empresa_id, nome)
);

create table formas_pagamento (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  tipo text not null check (tipo in ('dinheiro','debito','credito','pix','cheque','prazo','vale')),
  codigo_sefaz char(2) not null,        -- tPag da NFC-e: 01 dinheiro, 03 crédito, 04 débito, 17 PIX...
  administradora_id uuid references administradoras(id) on delete restrict,
  conta_no_caixa boolean not null default true,  -- entra na contagem física da gaveta?
  ativo boolean not null default true,
  unique (empresa_id, nome)
);
create index on formas_pagamento (administradora_id);

create table parceiros (                  -- clientes e fornecedores
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome text not null,
  cpf_cnpj text check (cpf_cnpj ~ '^([0-9]{11}|[0-9]{14})$'),
  eh_cliente boolean not null default true,
  eh_fornecedor boolean not null default false,
  limite_credito_centavos bigint,       -- nulo = não vende a prazo
  dia_vencimento smallint check (dia_vencimento between 1 and 31),
  tipo_preco_id uuid references tipos_preco(id) on delete set null,
  bloqueado boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on parceiros (empresa_id, nome);
create index on parceiros (empresa_id, cpf_cnpj);
create index on parceiros (tipo_preco_id);

create table veiculos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  parceiro_id uuid not null references parceiros(id) on delete cascade,
  placa text not null check (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
  modelo text,
  ativo boolean not null default true,
  unique (empresa_id, placa)
);
create index on veiculos (parceiro_id);

-- ---------------------------------------------------------------------------
-- Caixas, turnos, encerrantes
-- ---------------------------------------------------------------------------

create table caixas (                     -- terminal / ponto de venda
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  numero integer not null,
  nome text not null,
  serie_nfce integer not null,          -- cada caixa tem a própria série: a numeração nunca colide, nem offline
  dispositivo_token_hash text,          -- terminal autorizado pelo gerente
  ativo boolean not null default true,
  unique (empresa_id, numero),
  unique (empresa_id, serie_nfce)
);

create table turnos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  caixa_id uuid not null references caixas(id) on delete restrict,
  operador_id uuid not null references usuarios(id) on delete restrict,
  data_trabalho date not null,
  status text not null default 'aberto' check (status in ('aberto','fechado','reaberto')),
  fundo_troco_centavos bigint not null default 0 check (fundo_troco_centavos >= 0),
  aberto_em timestamptz not null default now(),
  fechado_em timestamptz,
  fechado_por uuid references usuarios(id) on delete restrict,
  observacao_fechamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fechado_tem_data check (status = 'aberto' or fechado_em is not null)
);
-- Um operador só tem um turno aberto por empresa; um caixa só tem um turno aberto.
create unique index um_turno_aberto_por_operador on turnos (empresa_id, operador_id) where status in ('aberto','reaberto');
create unique index um_turno_aberto_por_caixa on turnos (caixa_id) where status in ('aberto','reaberto');
create index on turnos (empresa_id, data_trabalho);
create index on turnos (operador_id);
create index on turnos (fechado_por);

-- Quais bicos o turno cobre e as leituras do totalizador.
create table encerrantes (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos(id) on delete cascade,
  bico_id uuid not null references bicos(id) on delete restrict,
  inicial numeric(14,3) not null check (inicial >= 0),
  final numeric(14,3) check (final >= 0),
  virou boolean not null default false,   -- totalizador passou do máximo e voltou a zero
  unique (turno_id, bico_id),
  constraint final_coerente check (final is null or virou or final >= inicial)
);
create index on encerrantes (bico_id);

-- Litros pelo encerrante (considera a virada do totalizador)
create view encerrantes_litros as
select e.*,
  case when e.final is null then null
       when e.virou then (b.encerrante_maximo - e.inicial) + e.final + 0.001
       else e.final - e.inicial end as litros
from encerrantes e join bicos b on b.id = e.bico_id;

-- ---------------------------------------------------------------------------
-- Vendas
-- ---------------------------------------------------------------------------

create table vendas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  turno_id uuid not null references turnos(id) on delete restrict,
  caixa_id uuid not null references caixas(id) on delete restrict,
  operador_id uuid not null references usuarios(id) on delete restrict,
  frentista_id uuid references usuarios(id) on delete restrict,
  parceiro_id uuid references parceiros(id) on delete restrict,
  veiculo_id uuid references veiculos(id) on delete restrict,
  cpf_cnpj_consumidor text,
  -- Idempotência: gerado no navegador antes de mandar. Venda feita offline e reenviada
  -- duas vezes vira uma venda só.
  chave_cliente uuid not null unique,
  status text not null default 'aberta'
    check (status in ('aberta','concluida','cancelada')),
  total_centavos bigint not null default 0 check (total_centavos >= 0),
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  criada_offline boolean not null default false,
  criada_em timestamptz not null default now(),   -- hora real da venda (do terminal, se offline)
  recebida_em timestamptz not null default now(), -- hora que chegou ao servidor
  cancelada_em timestamptz,
  cancelada_por uuid references usuarios(id) on delete restrict,
  motivo_cancelamento text,
  constraint cancelamento_completo check (
    status <> 'cancelada' or (cancelada_em is not null and cancelada_por is not null
                              and length(coalesce(motivo_cancelamento,'')) >= 15))
);
create index on vendas (turno_id);
create index on vendas (empresa_id, criada_em);
create index on vendas (caixa_id);
create index on vendas (operador_id);
create index on vendas (frentista_id);
create index on vendas (parceiro_id);
create index on vendas (veiculo_id);
create index on vendas (cancelada_por);

create table venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  ordem smallint not null,
  mercadoria_id uuid not null references mercadorias(id) on delete restrict,
  bico_id uuid references bicos(id) on delete restrict,   -- preenchido para combustível
  tipo_preco_id uuid not null references tipos_preco(id) on delete restrict,
  quantidade numeric(14,3) not null check (quantidade > 0),
  preco_unitario numeric(10,3) not null check (preco_unitario >= 0),  -- congelado no momento da venda
  total_centavos bigint not null check (total_centavos >= 0),
  abastecimento_id uuid references abastecimentos(id) on delete restrict,
  unique (venda_id, ordem)
  -- Um abastecimento só entra em uma venda CONCLUÍDA por vez: garantido pela situação do abastecimento
  -- (pendente -> registrado, com trava de linha). Venda cancelada devolve o abastecimento para pendente,
  -- e ele pode entrar numa venda nova; por isso não há unique aqui.
);
create index on venda_itens (mercadoria_id);
create index on venda_itens (bico_id);
create index on venda_itens (tipo_preco_id);
create index on venda_itens (abastecimento_id);

create table venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references vendas(id) on delete cascade,
  forma_pagamento_id uuid not null references formas_pagamento(id) on delete restrict,
  valor_centavos bigint not null check (valor_centavos > 0),
  troco_centavos bigint not null default 0 check (troco_centavos >= 0),
  nsu text, autorizacao text, bandeira text,   -- cartão
  cheque jsonb                                 -- banco, agência, conta, número
);
create index on venda_pagamentos (venda_id);
create index on venda_pagamentos (forma_pagamento_id);

-- Troca de forma de pagamento depois da venda: nunca apaga, registra a troca.
create table trocas_pagamento (
  id uuid primary key default gen_random_uuid(),
  venda_pagamento_id uuid not null references venda_pagamentos(id) on delete cascade,
  de_forma_id uuid not null references formas_pagamento(id) on delete restrict,
  para_forma_id uuid not null references formas_pagamento(id) on delete restrict,
  usuario_id uuid not null references usuarios(id) on delete restrict,
  motivo text not null,
  created_at timestamptz not null default now()
);
create index on trocas_pagamento (venda_pagamento_id);
create index on trocas_pagamento (de_forma_id);
create index on trocas_pagamento (para_forma_id);
create index on trocas_pagamento (usuario_id);

-- ---------------------------------------------------------------------------
-- Movimentos de caixa e fechamento
-- ---------------------------------------------------------------------------

create table movimentos_caixa (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos(id) on delete restrict,
  tipo text not null check (tipo in ('sangria','suprimento','despesa','receita')),
  valor_centavos bigint not null check (valor_centavos > 0),
  motivo text not null,
  usuario_id uuid not null references usuarios(id) on delete restrict,
  chave_cliente uuid not null unique,
  created_at timestamptz not null default now()
);
create index on movimentos_caixa (turno_id);
create index on movimentos_caixa (usuario_id);

-- Conferência do fechamento: por forma de pagamento, esperado (calculado) x informado (contado).
create table conferencias (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references turnos(id) on delete cascade,
  forma_pagamento_id uuid not null references formas_pagamento(id) on delete restrict,
  esperado_centavos bigint not null,
  informado_centavos bigint not null,
  diferenca_centavos bigint generated always as (informado_centavos - esperado_centavos) stored,
  justificativa text,
  unique (turno_id, forma_pagamento_id)
);
create index on conferencias (forma_pagamento_id);

-- ---------------------------------------------------------------------------
-- NFC-e
-- ---------------------------------------------------------------------------

create table nfce_numeracao (             -- próximo número por série (uma série por caixa)
  empresa_id uuid not null references empresas(id) on delete cascade,
  serie integer not null,
  proximo_numero integer not null default 1 check (proximo_numero between 1 and 999999999),
  primary key (empresa_id, serie)
);

create table nfce (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  venda_id uuid not null unique references vendas(id) on delete restrict,
  serie integer not null,
  numero integer not null,
  ambiente text not null check (ambiente in ('homologacao','producao')),
  modo text not null default 'normal' check (modo in ('normal','contingencia_offline')),
  status text not null default 'pendente'
    check (status in ('pendente','processando','autorizada','rejeitada','cancelada','denegada')),
  chave_acesso char(44) unique,
  protocolo text,
  ref_emissor text not null unique,     -- referência enviada ao emissor: torna o reenvio idempotente
  motivo_rejeicao text,
  xml_url text, danfe_url text,
  tentativas integer not null default 0,
  emitida_em timestamptz,
  autorizada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, serie, numero)
);
create index on nfce (empresa_id, status);

create table nfce_inutilizacoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  serie integer not null,
  numero_inicial integer not null,
  numero_final integer not null,
  justificativa text not null check (length(justificativa) >= 15),
  protocolo text,
  status text not null default 'pendente' check (status in ('pendente','homologada','rejeitada')),
  usuario_id uuid not null references usuarios(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (numero_final >= numero_inicial)
);
create index on nfce_inutilizacoes (empresa_id);
create index on nfce_inutilizacoes (usuario_id);

-- ---------------------------------------------------------------------------
-- Auditoria
-- ---------------------------------------------------------------------------

create table auditoria (
  id bigint generated always as identity primary key,
  empresa_id uuid,
  usuario_id uuid,
  tabela text not null,
  registro_id uuid,
  acao text not null check (acao in ('insert','update','delete')),
  antes jsonb,
  depois jsonb,
  created_at timestamptz not null default now()
);
create index on auditoria (empresa_id, created_at desc);
create index on auditoria (tabela, registro_id);

-- O servidor grava o usuário da operação em app.usuario_id (set_config) antes de escrever.
create or replace function registrar_auditoria() returns trigger language plpgsql security definer as $$
declare
  linha jsonb := to_jsonb(coalesce(new, old));
begin
  insert into auditoria (empresa_id, usuario_id, tabela, registro_id, acao, antes, depois)
  values (
    nullif(linha->>'empresa_id','')::uuid,
    nullif(current_setting('app.usuario_id', true),'')::uuid,
    tg_table_name,
    nullif(linha->>'id','')::uuid,
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['abastecimentos','turnos','encerrantes','vendas','venda_pagamentos','trocas_pagamento',
                           'movimentos_caixa','conferencias','precos','nfce','nfce_inutilizacoes',
                           'usuario_empresas','perfis']
  loop
    execute format('create trigger auditar after insert or update or delete on %I
                    for each row execute function registrar_auditoria()', t);
  end loop;
end $$;

-- Turno fechado não aceita venda nova nem movimento novo.
create or replace function exigir_turno_aberto() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from turnos where id = new.turno_id and status in ('aberto','reaberto')) then
    raise exception 'turno % não está aberto', new.turno_id using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger venda_exige_turno before insert on vendas for each row execute function exigir_turno_aberto();
create trigger movimento_exige_turno before insert on movimentos_caixa for each row execute function exigir_turno_aberto();

-- ---------------------------------------------------------------------------
-- Acesso (RLS) - Supabase
-- ---------------------------------------------------------------------------

create or replace function minhas_empresas() returns setof uuid language sql stable security definer as $$
  select ue.empresa_id from usuario_empresas ue
  join usuarios u on u.id = ue.usuario_id
  where u.auth_user_id = auth.uid() and u.ativo
$$;

do $$
declare t text;
begin
  foreach t in array array['perfis','grupos','tributacoes','mercadorias','tipos_preco','precos',
                           'tanques','bombas','bicos','abastecimentos','administradoras','formas_pagamento',
                           'parceiros','veiculos','caixas','turnos','vendas','nfce',
                           'nfce_inutilizacoes','nfce_numeracao']
  loop
    execute format('alter table %I enable row level security', t);
    -- Leitura: só as empresas do usuário. Escrita: só pelo servidor (service role), que checa o perfil.
    execute format('create policy ler_minhas_empresas on %I for select using (empresa_id in (select minhas_empresas()))', t);
  end loop;
end $$;

alter table empresas enable row level security;
create policy ler_minhas_empresas on empresas for select using (id in (select minhas_empresas()));

-- Tabelas filhas: leitura pelo pai.
alter table encerrantes enable row level security;
create policy ler on encerrantes for select using (
  turno_id in (select id from turnos where empresa_id in (select minhas_empresas())));
alter table venda_itens enable row level security;
create policy ler on venda_itens for select using (
  venda_id in (select id from vendas where empresa_id in (select minhas_empresas())));
alter table venda_pagamentos enable row level security;
create policy ler on venda_pagamentos for select using (
  venda_id in (select id from vendas where empresa_id in (select minhas_empresas())));
alter table movimentos_caixa enable row level security;
create policy ler on movimentos_caixa for select using (
  turno_id in (select id from turnos where empresa_id in (select minhas_empresas())));
alter table conferencias enable row level security;
create policy ler on conferencias for select using (
  turno_id in (select id from turnos where empresa_id in (select minhas_empresas())));
alter table trocas_pagamento enable row level security;   -- só servidor
alter table auditoria enable row level security;
create policy ler on auditoria for select using (empresa_id in (select minhas_empresas()));
alter table usuarios enable row level security;           -- só servidor
alter table usuario_empresas enable row level security;   -- só servidor
alter table unidades enable row level security;
create policy ler on unidades for select using (true);
