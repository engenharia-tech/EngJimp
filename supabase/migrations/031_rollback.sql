-- =====================================================================================================
-- 031 — DESFAZER (usuário de teste visível só ao Edson). Só em emergência.
-- Recusa (nada gravado) enquanto houver usuário de teste cadastrado ou indicador no setor Teste: sem a 031, tudo o que
-- é dele ficaria à vista de todos. Tire antes os dados e o cadastro do teste (decisão do Edson; ordem por causa das
-- FKs: OKR → agenda → lançamentos → histórico → metas → indicadores → cadastro).
-- ⚠ O que sobra no Log de Auditoria com o id ou o login do teste volta a aparecer para GESTOR / COORDENADOR / CEO /
-- Diretor quando a marca some (com o cadastro apagado, a 031 já não acha mais o id).
-- Devolve as 8 funções ao texto de antes (troca inversa, trecho a trecho), tira o gatilho, as 4 políticas, as funções
-- novas e a coluna users.usuario_teste (o grant da coluna sai junto).
-- ⏱ Espera no máximo 5 s por trava de tabela (lock_timeout): se der "lock timeout", NADA foi gravado — cole de novo.
-- ⚠ Linhas KPI_INDICADOR_TESTE que sobrarem no Log (exclusão de indicador do setor Teste) voltam a aparecer a quem lê
-- o Log: a limpeza do teste (apagar_teste.sql) as apaga antes.
-- =====================================================================================================

begin;
set local lock_timeout = '5s';

do $g$
declare n int;
begin
  if length('—') <> 1 then
    raise exception 'USUARIO TESTE 031 (desfazer): o texto chegou com os acentos quebrados — nada foi gravado.';
  end if;
  if to_regprocedure('public.usuarios_teste_ids()') is null
     or not exists (select 1 from pg_attribute where attrelid = 'public.users'::regclass and attname = 'usuario_teste' and not attisdropped) then
    raise exception 'USUARIO TESTE 031 (desfazer): a 031 não está no banco — nada foi gravado.';
  end if;
  select count(*) into n from public.users where usuario_teste;
  if n > 0 then
    raise exception 'USUARIO TESTE 031 (desfazer): % usuário(s) de teste ainda cadastrado(s) — sem a 031 tudo dele fica à vista de todos. Tire os dados e o cadastro antes. Nada foi gravado.', n;
  end if;
  select count(*) into n from public.kpis_indicador where public.kpis_setor_so_edson(setor);
  if n > 0 then
    raise exception 'USUARIO TESTE 031 (desfazer): % indicador(es) no setor Teste — sem a 031 os admins de OKR, o CEO e o Diretor passam a vê-los. Exclua-os antes. Nada foi gravado.', n;
  end if;
end $g$;

drop trigger if exists users_teste_molde on public.users;
drop function if exists public.users_teste_molde();

do $p$
declare
  t record;
  d text;
  n int;
begin
  for t in select * from (values
      ('public.kpis_vejo_setor(text)'::regprocedure,
       $a$(not public.kpis_setor_reservado(p_setor) or public.kpis_ve_reservado()) and (not public.kpis_setor_so_edson(p_setor) or public.is_edson())$a$,
       $a$(not public.kpis_setor_reservado(p_setor) or public.kpis_ve_reservado())$a$),
      ('public.kpis_dono_ve(text, text)'::regprocedure,
       $a$when public.kpis_setor_so_edson(p_setor) then public.kpis_setor_chave(u.sector) = public.kpis_setor_chave(p_setor) when public.cargo_visao_ceo(u.role) then true$a$,
       $a$when public.cargo_visao_ceo(u.role) then true$a$),
      ('public.kpis_setores()'::regprocedure,
       $a$and (not public.kpis_setor_reservado(u.sector) or public.kpis_ve_reservado()) and (not public.kpis_setor_so_edson(u.sector) or public.is_edson())$a$,
       $a$and (not public.kpis_setor_reservado(u.sector) or public.kpis_ve_reservado())$a$),
      ('public.kpis_valores_ligados(jsonb)'::regprocedure,
       $a$and public.kpis_dono_ve(p.p_dono, i.setor) and (not public.kpis_setor_so_edson(i.setor) or (not v_servidor and public.kpis_vejo_indicador(i.id)))$a$,
       $a$and public.kpis_dono_ve(p.p_dono, i.setor)$a$),
      ('public.okr_pessoas()'::regprocedure,
       $a$where (select public.okr_is_viewer()) and (not coalesce(u.usuario_teste, false) or (select public.is_edson()) or u.id = auth.uid())$a$,
       $a$where (select public.okr_is_viewer())$a$),
      ('public.agenda_ocupado(uuid[], timestamp with time zone, timestamp with time zone, uuid)'::regprocedure,
       $a$where x is not null), '{}'::uuid[]); if not public.is_edson() then v_pessoas := coalesce(array(select y from unnest(v_pessoas) as y where y = auth.uid() or not (y = any (public.usuarios_teste_ids()))), '{}'::uuid[]); end if;$a$,
       $a$where x is not null), '{}'::uuid[]);$a$),
      ('public.agenda_ocupado(uuid[], timestamp with time zone, timestamp with time zone, uuid)'::regprocedure,
       $a$and x.p = any (v_pessoas) and ((select public.is_edson()) or i.owner_id = auth.uid() or not (i.owner_id = any ((select public.usuarios_teste_ids())::uuid[])))$a$,
       $a$and x.p = any (v_pessoas)$a$),
      ('public.agenda_item_antes()'::regprocedure,
       $a$if (new.owner_id = any (public.usuarios_teste_ids()) or new.participantes && public.usuarios_teste_ids()) and exists (select 1 from unnest(array[new.owner_id] || new.participantes) as q where q <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid and not (q = any (public.usuarios_teste_ids()))) then raise exception 'AGENDA_TESTE: compromisso com o usuário de teste só pode ter o Edson e o próprio teste. Nada foi gravado.' using errcode = 'P0001'; end if; return new;$a$,
       $a$return new;$a$),
      ('public.kpis_excluir_indicador(uuid, integer)'::regprocedure,
       $a$'DELETE', case when public.kpis_setor_so_edson(v_ind.setor) then 'KPI_INDICADOR_TESTE' else 'KPI_INDICADOR' end, p_indicador::text,$a$,
       $a$'DELETE', 'KPI_INDICADOR', p_indicador::text,$a$)
    ) v(fn, velho, novo)
  loop
    d := pg_get_functiondef(t.fn);
    n := (length(d) - length(replace(d, t.velho, ''))) / length(t.velho);
    if n <> 1 then
      raise exception 'USUARIO TESTE 031 (desfazer): em % o trecho [%] aparece % vez(es) (esperava 1) — nada foi gravado.', t.fn, t.velho, n;
    end if;
    execute replace(d, t.velho, t.novo);
  end loop;
end $p$;

drop policy if exists usuario_teste_so_edson on public.users;
drop policy if exists okr_teste_so_edson on public.okr_state;
drop policy if exists audit_teste_so_edson on public.audit_logs;
drop policy if exists kpis_teste_so_edson on public.kpis_indicador;

drop function if exists public.kpis_indicadores_so_edson();
drop function if exists public.usuarios_teste_chaves();
drop function if exists public.usuarios_teste_ids();
drop function if exists public.kpis_setor_so_edson(text);

alter table public.users drop column if exists usuario_teste;

commit;

notify pgrst, 'reload schema';
