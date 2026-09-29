-- 014 — INDICADOR DE USO: quanto do banco o app já ocupa (29/09/2026).
--
-- Pedido do Edson (29/09): "um lugar onde eu possa ver o nível que está o banco de dados … no
-- cantinho superior, em todas as minhas telas … 70% do banco de dados". Visível SÓ para ele.
-- Decisões dele no mesmo dia: e-mail de alerta a 80%, 1 por dia ("pode ser"); sem token da
-- Vercel por ora (o painel mostra os limites + o link).
--
-- Antes: o tamanho do banco só aparecia no painel do Supabase (atualizado 1x por dia). No plano
--        FREE (o nosso: organização "engenharia-tech's Org", spend cap ligado) o limite é 500 MB
--        e, passou dele, o banco fica SOMENTE LEITURA NA HORA — ninguém grava KPI, OKR nem
--        Agenda. Em 29/09 o Edson mediu 31 MB = 6,2% (SQL só-leitura no SQL Editor).
-- Agora: 1) public.infra_uso_banco() — SÓ LÊ e devolve um jsonb com:
--             total_bytes   = soma de pg_database_size de todos os bancos com CONNECT (a MESMA
--                             conta que o painel do Supabase faz: é o número que vale para os
--                             500 MB);
--             app_bytes     = só o banco do app (current_database);
--             maiores       = as 10 maiores tabelas (nome, total com índices/TOAST, dados,
--                             linhas aproximadas), de TODOS os esquemas (public, auth, cron, net…);
--             somente_leitura = se o banco já está em modo somente leitura;
--             medido_em     = a hora da medição.
--          SECURITY DEFINER (roda como o dono, que enxerga o tamanho de tudo), search_path
--          vazio (tudo qualificado com pg_catalog.) e EXECUTE SÓ para a service_role: quem
--          chama é o servidor (GET /api/infra/uso, que só responde ao Edson, pelo id). O
--          navegador (anon/authenticated) NÃO executa — nem o Edson direto pelo PostgREST.
--        2) public.infra_alerta (dia, pct, enviado_em) — o registro de "já mandei o alerta de
--          hoje", para o e-mail diário de 80% não repetir (a 015 liga o job diário). RLS ligada
--          e NENHUM grant para anon/authenticated: só o servidor (service_role) lê e grava.
-- Por quê pelo banco e não por token: o número do tamanho vem do próprio Postgres, ao vivo, sem
--        token novo (o do Supabase daria acesso à organização inteira). Egress, logs e o uso da
--        Vercel NÃO saem daqui — só pelos painéis (o indicador mostra os links).
--
-- ORDEM PARA PUBLICAR (função e tabela NOVAS: o BANCO vem ANTES do código):
--   1) Supabase → SQL Editor: rode ESTE arquivo inteiro. O SELECT do fim mostra UMA linha:
--        usado_mb ≈ 31 · pct_de_500 ≈ 6 · somente_leitura false ·
--        navegador_executa false · anonimo_executa false · servidor_executa true ·
--        navegador_le_alerta false · rls_alerta true
--      Qualquer valor diferente nas 6 últimas colunas: NÃO publique o código; me mande o print.
--   2) Push do código (com o OK do Edson) → deploy "Ready" na Vercel → Ctrl+Shift+R. O chip
--      "BD 6%" aparece no canto superior direito (no celular, no cabeçalho), só para o Edson.
--      Se o código for antes da 014, o chip fica cinza "BD ?" (a tela explica) — nada quebra.
--   3) Opcional (alerta por e-mail a 80%): a 015, que depende da 013 (disparador da agenda).
--   Variáveis (opcionais, na Vercel, e só valem depois de um Redeploy): INFRA_DB_LIMITE_MB
--   (padrão 500), INFRA_PLANO_SUPABASE (padrão free), INFRA_PLANO_VERCEL (padrão hobby),
--   INFRA_ALERTA_PCT (padrão 80). Sem nenhuma delas, vale o que está confirmado hoje.
--
-- Pode rodar de novo (idempotente). Rollback: supabase/migrations/014_rollback.sql (se a 015
-- rodou, rode ANTES o 015_rollback.sql).

-- ---------------------------------------------------------------------------
-- 1) A medição (só leitura)
-- ---------------------------------------------------------------------------
create or replace function public.infra_uso_banco()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $f$
  with bancos as (
    select pg_catalog.pg_database_size(d.datname) as b
      from pg_catalog.pg_database d
     where pg_catalog.has_database_privilege(d.datname, 'CONNECT')
  ),
  maiores as (
    select n.nspname::text || '.' || c.relname::text as nome,
           pg_catalog.pg_total_relation_size(c.oid) as total_bytes,
           pg_catalog.pg_relation_size(c.oid) as dados_bytes,
           greatest(c.reltuples, 0)::bigint as linhas_aprox
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where c.relkind in ('r', 'm')
       and n.nspname not in ('pg_catalog', 'information_schema')
       and n.nspname not like 'pg\_toast%'
     order by pg_catalog.pg_total_relation_size(c.oid) desc, 1
     limit 10
  )
  select pg_catalog.jsonb_build_object(
    'total_bytes',       (select coalesce(sum(b), 0)::bigint from bancos),
    'bancos_contados',   (select count(*) from bancos),
    'bancos_existentes', (select count(*) from pg_catalog.pg_database),
    'app_bytes',         pg_catalog.pg_database_size(pg_catalog.current_database()),
    'maiores',           coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                             'nome', m.nome, 'total_bytes', m.total_bytes,
                             'dados_bytes', m.dados_bytes, 'linhas_aprox', m.linhas_aprox)
                           order by m.total_bytes desc, m.nome) from maiores m), '[]'::jsonb),
    'somente_leitura',   pg_catalog.current_setting('default_transaction_read_only') = 'on',
    'medido_em',         pg_catalog.now()
  )
$f$;

comment on function public.infra_uso_banco() is
  'Indicador de uso (014, 29/09/2026): tamanho do banco como o painel do Supabase conta, as 10 maiores tabelas e se está em somente leitura. Só lê. EXECUTE só service_role (GET /api/infra/uso, só o Edson).';

-- O Supabase dá EXECUTE de função nova a anon/authenticated por padrão: tirar dos dois
-- explicitamente (revogar só de public não basta).
revoke all on function public.infra_uso_banco() from public, anon, authenticated;
grant execute on function public.infra_uso_banco() to service_role;

-- ---------------------------------------------------------------------------
-- 2) "Já mandei o alerta de hoje?" — uma linha por dia (dia de Joinville) em que saiu e-mail
-- ---------------------------------------------------------------------------
create table if not exists public.infra_alerta (
  dia        date primary key default ((pg_catalog.now() at time zone 'America/Sao_Paulo')::date),
  pct        numeric not null check (pct >= 0),
  enviado_em timestamptz not null default pg_catalog.now()
);

comment on table public.infra_alerta is
  'Indicador de uso (014, 29/09/2026): dias em que o alerta de uso do banco já foi mandado ao Edson (1 por dia). Só o servidor (service_role) lê e grava.';

alter table public.infra_alerta enable row level security;
-- Nenhuma política: com a RLS ligada, quem não é service_role não vê nem grava nada. E sem grant
-- (o Supabase dá ALL de tabela nova a anon/authenticated por padrão: tirar explicitamente).
revoke all on table public.infra_alerta from public, anon, authenticated;
grant select, insert, update, delete on table public.infra_alerta to service_role;

-- Função e tabela novas só aparecem na API com 'reload schema' ('reload config' não basta).
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 3) Conferência (roda junto; só lê). Esperado: usado_mb ≈ 31 · pct_de_500 ≈ 6 ·
--    somente_leitura false · false · false · true · false · true
-- ---------------------------------------------------------------------------
select round((public.infra_uso_banco()->>'total_bytes')::numeric / 1048576, 1) as usado_mb,
       round(100 * (public.infra_uso_banco()->>'total_bytes')::numeric / (500 * 1048576), 1) as pct_de_500,
       (public.infra_uso_banco()->>'somente_leitura')::boolean as somente_leitura,
       has_function_privilege('authenticated', 'public.infra_uso_banco()', 'EXECUTE') as navegador_executa,
       has_function_privilege('anon', 'public.infra_uso_banco()', 'EXECUTE') as anonimo_executa,
       has_function_privilege('service_role', 'public.infra_uso_banco()', 'EXECUTE') as servidor_executa,
       has_table_privilege('authenticated', 'public.infra_alerta', 'SELECT') as navegador_le_alerta,
       (select c.relrowsecurity from pg_class c where c.oid = 'public.infra_alerta'::regclass) as rls_alerta;

-- ---------------------------------------------------------------------------
-- Mais conferências (rodar à mão, se quiser):
--   -- as 10 maiores tabelas, legível:
--   select m->>'nome' as tabela, pg_size_pretty((m->>'total_bytes')::bigint) as total,
--          pg_size_pretty((m->>'dados_bytes')::bigint) as dados, (m->>'linhas_aprox')::bigint as linhas
--     from jsonb_array_elements(public.infra_uso_banco()->'maiores') m;
--   -- os alertas que já saíram (a 015 grava aqui):
--   select * from public.infra_alerta order by dia desc limit 10;
-- ---------------------------------------------------------------------------
