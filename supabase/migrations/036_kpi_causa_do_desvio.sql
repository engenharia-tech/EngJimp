-- 036 — KPI: CAUSA DO DESVIO (03/11/2026). Edson: "algumas coisas que precisam ser integradas dentro da aba de KPI e OKR.
-- Quando os objetivos não são atingidos por causa de processos, por causa de pessoas ou por um item … pontual. Preciso que
-- seja criada essas integrações e essas problemáticas."
--
-- O desenho: um período de um indicador que não bateu a meta ganha UMA causa — Processo, Pessoas ou Pontual —, o que
-- aconteceu e, se houver, a ação corretiva (com prazo e "feita"). Fica em `kpis_causa`, uma linha por indicador e período.
--   · Quem vê o indicador vê a causa (a leitura passa pela RLS do indicador, como lançamento e meta — o usuário teste da
--     031 e o setor reservado seguem valendo sozinhos).
--   · Registra, corrige e apaga quem é do setor do indicador, ou o Edson / admin de OKR onde ele vê — também no
--     indicador CALCULADO (a causa não é lançamento: o setor explica o número que a base deu).
--   · O gatilho alinha o período ao início, recusa período futuro e carimba quem/quando (o navegador não manda isso).
-- O OKR guarda a causa do KR no próprio OKR (okr_state.data) — sem banco aqui; o KR ligado ao KPI LÊ esta tabela.
--
-- ORDEM: a 036 pode ir antes do código (ninguém lê a tabela ainda) ou depois (a tela sem a tabela não mostra a causa).
-- Desfazer: 036_rollback.sql (recusa se já houver causa gravada).

begin;
set local lock_timeout = '5s';

-- TRAVAS: precisa da 023/026 (funções de setor e período) e da 035; e não pode ter rodado antes.
do $t$
begin
  if to_regclass('public.kpis_causa') is not null then
    raise exception 'KPI 036: a tabela kpis_causa já existe — a 036 já rodou? Nada foi mudado.';
  end if;
  if to_regprocedure('public.kpis_inicio_periodo(text, date)') is null or to_regprocedure('public.kpis_hoje()') is null
     or to_regprocedure('public.kpis_meu_setor()') is null or to_regprocedure('public.kpis_administra()') is null
     or to_regprocedure('public.kpis_vejo_setor(text)') is null or to_regprocedure('public.kpis_setor_chave(text)') is null then
    raise exception 'KPI 036: faltam funções do KPI dos setores (023/026) — nada foi mudado. Chame o Claude.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'kpis_lancamento' and column_name = 'dia') then
    raise exception 'KPI 036: a 035 (lançamento diário) não está no banco — nada foi mudado. Chame o Claude.';
  end if;
end $t$;

-- 1. A tabela.
create table public.kpis_causa (
  id             uuid primary key default gen_random_uuid(),
  indicador_id   uuid not null references public.kpis_indicador(id) on delete cascade,
  periodo        date not null,                                -- o início do período (o gatilho alinha)
  causa          text not null constraint kpis_causa_tipo check (causa in ('processo', 'pessoas', 'pontual')),
  descricao      text not null constraint kpis_causa_descricao check (char_length(btrim(descricao)) between 3 and 500),
  acao           text constraint kpis_causa_acao check (acao is null or char_length(acao) <= 500),
  acao_prazo     date constraint kpis_causa_prazo check (acao_prazo is null or (acao_prazo >= '2000-01-01' and acao_prazo <= '2100-12-31')),
  acao_feita     boolean not null default false,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),          -- VERSÃO (trava contra gravar por cima)
  constraint kpis_causa_uk unique (indicador_id, periodo)
);
comment on table public.kpis_causa is
  '036: por que o período não bateu a meta — processo, pessoas ou pontual — e a ação corretiva. Uma por indicador e período.';

-- 2. Quem registra: o setor do indicador, ou o Edson / admin de OKR onde vê (como o lançar, mas também no calculado).
create or replace function public.kpis_posso_causa(p_indicador uuid) returns boolean language sql stable security definer set search_path = public as $f$
  select exists (select 1 from public.kpis_indicador i
                  where i.id = p_indicador and i.ativo
                    and ((public.kpis_meu_setor() is not null and public.kpis_setor_chave(i.setor) = public.kpis_meu_setor())
                         or (public.kpis_administra() and public.kpis_vejo_setor(i.setor))))
$f$;
revoke all on function public.kpis_posso_causa(uuid) from public, anon;
grant execute on function public.kpis_posso_causa(uuid) to authenticated, service_role;

-- 3. O gatilho: período alinhado e não futuro; o que não muda não muda; carimbo de quem e quando.
create or replace function public.kpis_causa_antes()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare v_freq text;
begin
  select i.frequencia into v_freq from public.kpis_indicador i where i.id = new.indicador_id;
  if v_freq is null then
    raise exception 'KPIS_SEM_ACESSO: indicador não encontrado.' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.periodo := public.kpis_inicio_periodo(v_freq, new.periodo);
    if new.periodo > public.kpis_inicio_periodo(v_freq, public.kpis_hoje()) then
      raise exception 'KPIS_CAUSA_FUTURO: o período ainda não começou.' using errcode = 'P0001';
    end if;
    new.criado_por := auth.uid();
    new.criado_em := clock_timestamp();
  else
    new.id := old.id; new.indicador_id := old.indicador_id; new.periodo := old.periodo;
    new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  end if;
  new.descricao := btrim(new.descricao);
  new.acao := nullif(btrim(coalesce(new.acao, '')), '');
  new.atualizado_por := auth.uid();
  new.atualizado_em := clock_timestamp();
  return new;
end $function$;
create trigger kpis_causa_antes before insert or update on public.kpis_causa for each row execute function public.kpis_causa_antes();

-- 4. Permissões: coluna a coluna (o navegador não escolhe id, carimbo nem versão).
alter table public.kpis_causa enable row level security;
revoke all on public.kpis_causa from public, anon, authenticated;
grant select, delete on public.kpis_causa to authenticated;
grant insert (indicador_id, periodo, causa, descricao, acao, acao_prazo, acao_feita),
      update (causa, descricao, acao, acao_prazo, acao_feita) on public.kpis_causa to authenticated;
grant all on public.kpis_causa to service_role;

drop policy if exists kpis_causa_ler on public.kpis_causa;
create policy kpis_causa_ler on public.kpis_causa for select to authenticated
  using (exists (select 1 from public.kpis_indicador i where i.id = kpis_causa.indicador_id));
drop policy if exists kpis_causa_criar on public.kpis_causa;
create policy kpis_causa_criar on public.kpis_causa for insert to authenticated
  with check (public.kpis_posso_causa(indicador_id));
drop policy if exists kpis_causa_editar on public.kpis_causa;
create policy kpis_causa_editar on public.kpis_causa for update to authenticated
  using (public.kpis_posso_causa(indicador_id)) with check (public.kpis_posso_causa(indicador_id));
drop policy if exists kpis_causa_apagar on public.kpis_causa;
create policy kpis_causa_apagar on public.kpis_causa for delete to authenticated
  using (public.kpis_posso_causa(indicador_id));

commit;

-- CONFERÊNCIA (só lê). Esperado: true · true · true · 4 · true · false · true
select to_regclass('public.kpis_causa') is not null                                                   as tabela,
       (select relrowsecurity from pg_class where oid = 'public.kpis_causa'::regclass)                  as rls,
       exists (select 1 from pg_trigger where tgname = 'kpis_causa_antes')                              as gatilho,
       (select count(*) from pg_policies where tablename = 'kpis_causa')                                as politicas,
       has_column_privilege('authenticated', 'public.kpis_causa', 'causa', 'UPDATE')                    as tela_corrige,
       has_column_privilege('authenticated', 'public.kpis_causa', 'criado_por', 'UPDATE')               as tela_mexe_no_carimbo,
       has_function_privilege('authenticated', 'public.kpis_posso_causa(uuid)', 'EXECUTE')              as funcao;
