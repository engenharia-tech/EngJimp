-- =====================================================================================================
-- 030 — DESFAZER (cargos DIRETOR_INDUSTRIAL e REPRESENTANTE). Só em emergência.
-- Recusa (nada gravado) se ainda houver alguém com um dos cargos novos: troque o cargo dessas pessoas antes.
-- Devolve as 7 funções ao texto de antes (troca inversa, trecho a trecho), tira os gatilhos, a política, o CHECK do
-- representante e as funções novas, e volta o users_role_check aos 7 cargos.
-- =====================================================================================================

begin;

do $g$
declare n int;
begin
  if length('—') <> 1 then
    raise exception 'CARGOS 030 (desfazer): o texto chegou com os acentos quebrados — nada foi gravado.';
  end if;
  select count(*) into n from public.users where role in ('DIRETOR_INDUSTRIAL', 'REPRESENTANTE');
  if n > 0 then
    raise exception 'CARGOS 030 (desfazer): % pessoa(s) ainda com cargo novo — troque o cargo delas antes. Nada foi gravado.', n;
  end if;
end $g$;

drop trigger if exists kpis_indicador_representante on public.kpis_indicador;
drop function if exists public.kpis_indicador_representante();
drop policy if exists representante_so_a_propria_linha on public.users;
drop policy if exists representante_sem_executores on public.okr_executor;
drop function if exists public.e_representante();
alter table public.users drop constraint if exists users_representante_so_okr;
drop trigger if exists users_representante_molde on public.users;
drop function if exists public.users_representante_molde();

do $p$
declare
  t record;
  d text;
  n int;
begin
  for t in select * from (values
      ('public.okr_is_ceo()'::regprocedure,
       $a$public.cargo_visao_ceo(role)$a$,
       $a$role = 'CEO'$a$),
      ('public.kpis_ve_todos()'::regprocedure,
       $a$public.cargo_visao_ceo(u.role)$a$,
       $a$coalesce(u.role, '') = 'CEO'$a$),
      ('public.kpis_ve_reservado()'::regprocedure,
       $a$public.cargo_visao_ceo(u.role)$a$,
       $a$coalesce(u.role, '') = 'CEO'$a$),
      ('public.kpis_dono_ve(text, text)'::regprocedure,
       $a$when public.cargo_visao_ceo(u.role) then true$a$,
       $a$when coalesce(u.role, '') = 'CEO' then true$a$),
      ('public.pode_ler_auditoria()'::regprocedure,
       $a$(role = any (array['GESTOR','CEO','COORDENADOR']) or public.cargo_visao_ceo(role))$a$,
       $a$role = any (array['GESTOR','CEO','COORDENADOR'])$a$),
      ('public.custo_hora_taxa_calculada(date, text)'::regprocedure,
       $a$coalesce(u.role, '') not in ('CEO', 'DIRETOR_INDUSTRIAL', 'PROCESSOS', 'ADM_EXTERNO', 'REPRESENTANTE')$a$,
       $a$coalesce(u.role, '') not in ('CEO', 'PROCESSOS', 'ADM_EXTERNO')$a$),
      ('public.kpis_calc_interno(uuid, date, date)'::regprocedure,
       $a$coalesce(u.role, '') in ('PROCESSOS', 'REPRESENTANTE')$a$,
       $a$coalesce(u.role, '') = 'PROCESSOS'$a$)
    ) v(fn, velho, novo)
  loop
    d := pg_get_functiondef(t.fn);
    n := (length(d) - length(replace(d, t.velho, ''))) / length(t.velho);
    if n <> 1 then
      raise exception 'CARGOS 030 (desfazer): em % o trecho [%] aparece % vez(es) (esperava 1) — nada foi gravado.', t.fn, t.velho, n;
    end if;
    execute replace(d, t.velho, t.novo);
  end loop;
end $p$;

drop function if exists public.cargo_visao_ceo(text);

alter table public.users drop constraint if exists users_role_check;
alter table public.users add constraint users_role_check check (role = any (array[
  'GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR', 'ADM_EXTERNO']::text[]));

commit;

notify pgrst, 'reload schema';
