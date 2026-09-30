-- =====================================================================================================
-- 022_rollback — desfaz a 022 (desligar sem excluir + custo/hora por período) SEM APAGAR DADO — 30/09/2026
--
-- O que ele faz:
--   - tira o gatilho de users e as funções da 022 (o servidor volta a responder "rode a 022" onde usa a série);
--   - RENOMEIA a série para custo_hora_periodo_rollback_AAAAMMDD (e o índice dela junto), sem grant;
--   - guarda id, desligado_em e custo_ate de quem tem data em users_desligamento_rollback_AAAAMMDD, sem grant;
--   - só então tira as duas colunas de users.
-- Por quê não apagar (cético de 30/09): a semente de 2000-01-01 é o cadastro do dia em que a 022 rodou. Se a
--   série fosse apagada e a 022 rodasse de novo, jan–ago seriam recalculados com os salários do DIA — e os
--   meses fechados mudariam. Rodar a 022 de novo depois deste arquivo RESTAURA das duas cópias.
-- ⚠ Não volta: a senha de quem foi desligado (a tela de Equipe dá outra) e o log limpo (a cópia de segurança
--   semanal o tem). Se as cópias *_rollback_* forem apagadas à mão, a próxima 022 semeia com os salários do dia.
-- Pode rodar de novo: sem a 022, não acha nada para desfazer (e não cria cópia vazia).
-- Ensaio: bancada PGlite (desfaz, confere as cópias sem grant, roda a 022 de novo e confere a série igual).
-- =====================================================================================================

begin;

set local search_path = public, extensions;

drop trigger if exists custo_hora_segue_o_cadastro on public.users;
drop function if exists public.kpi_desligar_usuario(uuid, date);
drop function if exists public.custo_hora_gatilho_users();
drop function if exists public.custo_hora_recalcular(date, text, text);
drop function if exists public.custo_hora_recalcular(date, text);
drop function if exists public.custo_hora_taxa_calculada(date, text);
drop function if exists public.custo_hora_taxa_calculada(date);
drop function if exists public.custo_hora_hoje();

do $$
declare
  v_dia   text := to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYYMMDD');
  v_nome  text;
  v_pkey  text;
  k       int;
begin
  -- 1) A série: renomeada (nunca apagada), com o índice da chave junto — senão a cópia ficaria com o
  --    índice "custo_hora_periodo_pkey" e o da série recriada pela 022 viraria "..._pkey1" (confunde quem lê).
  if to_regclass('public.custo_hora_periodo') is not null then
    v_nome := 'custo_hora_periodo_rollback_' || v_dia;
    k := 1;
    while to_regclass('public.' || quote_ident(v_nome)) is not null loop
      k := k + 1;
      v_nome := 'custo_hora_periodo_rollback_' || v_dia || '_' || k;
    end loop;
    select i.relname into v_pkey
      from pg_constraint c join pg_class i on i.oid = c.conindid
     where c.conrelid = 'public.custo_hora_periodo'::regclass and c.contype = 'p';
    execute format('alter table public.custo_hora_periodo rename to %I', v_nome);
    if v_pkey is not null then
      execute format('alter index public.%I rename to %I', v_pkey, v_nome || '_pkey');
    end if;
    execute format('revoke all on table public.%I from public, anon, authenticated', v_nome);
    execute format('alter table public.%I enable row level security', v_nome);
    execute format('comment on table public.%I is %L', v_nome,
      '022_rollback: a série de custo/hora como estava no desfazer. A 022, rodada de novo, restaura daqui. Sem grant.');
  end if;

  -- 2) As datas de quem tem: guardadas numa tabela à parte antes de tirar as colunas.
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'users' and column_name = 'custo_ate')
     and exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'users' and column_name = 'desligado_em') then
    v_nome := 'users_desligamento_rollback_' || v_dia;
    k := 1;
    while to_regclass('public.' || quote_ident(v_nome)) is not null loop
      k := k + 1;
      v_nome := 'users_desligamento_rollback_' || v_dia || '_' || k;
    end loop;
    execute format(
      'create table public.%I as
         select id, desligado_em, custo_ate from public.users
          where desligado_em is not null or custo_ate is not null', v_nome);
    execute format('alter table public.%I enable row level security', v_nome);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_nome);
    execute format('comment on table public.%I is %L', v_nome,
      '022_rollback: id, desligado_em e custo_ate de quem tinha data no desfazer. A 022, rodada de novo, restaura daqui. Sem grant.');
  end if;
end
$$;

alter table public.users drop constraint if exists users_custo_ate_ate_desligado;
alter table public.users drop column if exists custo_ate;
alter table public.users drop column if exists desligado_em;

commit;

notify pgrst, 'reload schema';

-- Conferência (só lê; só contagens). Esperado: 0 · 0 · 0 · 0 · (cópias ≥ 1) · 0
--   colunas da 022 em users · a série com o nome de uso · funções da 022 · o gatilho ·
--   cópias guardadas por desfazer (custo_hora_periodo_rollback_* + users_desligamento_rollback_*) ·
--   cópias legíveis pelo navegador (tem de ser 0)
select
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name in ('desligado_em', 'custo_ate')) as colunas,
  (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relname = 'custo_hora_periodo') as serie_em_uso,
  (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'public' and p.proname in ('custo_hora_hoje', 'custo_hora_taxa_calculada', 'custo_hora_recalcular',
                                                 'custo_hora_gatilho_users', 'kpi_desligar_usuario')) as funcoes,
  (select count(*) from pg_trigger g where g.tgname = 'custo_hora_segue_o_cadastro') as gatilho,
  (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'r'
      and (c.relname ~ '^custo_hora_periodo_rollback_' or c.relname ~ '^users_desligamento_rollback_')) as copias,
  (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace
    where s.nspname = 'public' and c.relkind = 'r'
      and (c.relname ~ '^custo_hora_periodo_rollback_' or c.relname ~ '^users_desligamento_rollback_')
      and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT'))) as copias_legiveis;
