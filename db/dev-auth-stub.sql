-- Só para desenvolvimento local: no Supabase o schema "auth" e auth.uid() já existem.
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as 'select null::uuid';
