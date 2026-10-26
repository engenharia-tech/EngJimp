-- Desfaz a 034: o banco volta a aceitar a marca de formato 2 (abas com o pacote anterior a 26/10 voltam a gravar).
-- Só use se a 034 tiver travado gravações legítimas. O código novo (OKR_FORMAT_VERSION = 3) continua gravando
-- normalmente com a regra "≥ 2".
begin;
set local lock_timeout = '5s';
do $t$
declare d text := pg_get_functiondef('public.okr_state_exige_versao()'::regprocedure);
begin
  if position('< 3 then' in d) = 0 then
    raise exception 'OKR 034 (desfazer): a regra não é a da 034 (esperava "< 3 then") — nada foi mudado. Chame o Claude.';
  end if;
end $t$;

create or replace function public.okr_state_exige_versao()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if coalesce(nullif(new.data->>'v', '')::int, 0) < 2 then
    raise exception 'OKR_VERSAO_VELHA: esta aba está com uma versão antiga do sistema — recarregue a página (F5).' using errcode = 'P0001';
  end if;
  return new;
end $function$;
commit;

-- Esperado: true
select position('< 2 then' in pg_get_functiondef('public.okr_state_exige_versao()'::regprocedure)) > 0 as voltou_a_2;
