-- 034 — OKR: o banco passa a exigir a MARCA DE FORMATO 3 (26/10/2026). Edson: "faz a versão 3 do OKR agora".
-- (A 033 está reservada aos colaboradores e executores conectados — desenho de 07/10, ainda não construído.)
--
-- Por quê: desde 5dbf77e (26/10) o KR recriado pega o MENOR número livre — apagou o KR7.1 e criou outro, ele volta a
-- ser KR7.1. As travas que tornam isso seguro (o cartão do KR achado por rótulo+uid, o check-in gravado por rótulo+uid,
-- os check-ins soltos marcados "(excluído)") só existem no pacote novo. Uma aba aberta com o pacote ANTERIOR, num KR
-- apagado e recriado, gravaria um campo aberto no KR novo. Com a marca 3 exigida, essa aba recebe ao salvar
-- "OKR_VERSAO_VELHA … recarregue a página (F5)" (a tela já traduz: "Nada foi salvo") — e a faixa "versão nova" já pede
-- a recarga em até 5 min.
--
-- O que muda: SÓ o número da regra (lida no banco em 26/10, texto do Edson): "< 2" vira "< 3". O gatilho continua
-- olhando só quando o CONTEÚDO (data) é gravado — BEFORE INSERT OR UPDATE OF data. O servidor, que grava só o link
-- público (share_token) e o dono (owner_key), não passa por ele. A única gravação de data é a da tela
-- (storageService.saveOkrIfUnchanged), que desde OKR_FORMAT_VERSION = 3 grava v = 3.
--
-- ORDEM: o código que grava v = 3 tem de estar NO AR antes desta (a regra de hoje aceita "≥ 2", então o código novo
-- grava sem ela). Colada antes do código, ninguém mais salvaria o OKR.
-- Desfazer: 034_rollback.sql (volta "< 2").

begin;
set local lock_timeout = '5s';

-- TRAVAS: só troca se a regra for a lida em 26/10, e se nenhuma função do banco gravar o conteúdo do OKR por conta
-- própria (ela gravaria sem a marca 3 e passaria a ser recusada). Qualquer uma falhando: nada é mudado.
do $t$
declare
  d      text := pg_get_functiondef('public.okr_state_exige_versao()'::regprocedure);
  outros text;
begin
  if (length(d) - length(replace(d, '< 2 then', ''))) / length('< 2 then') <> 1
     or position('OKR_VERSAO_VELHA' in d) = 0 then
    raise exception 'OKR 034: a regra da versão não é a lida em 26/10 (esperava "< 2 then" uma vez) — nada foi mudado. Chame o Claude.';
  end if;
  if not exists (select 1 from pg_trigger
                  where tgname = 'okr_state_exige_versao' and tgrelid = 'public.okr_state'::regclass and tgenabled <> 'D') then
    raise exception 'OKR 034: o gatilho okr_state_exige_versao não está ligado em okr_state — nada foi mudado. Chame o Claude.';
  end if;
  select string_agg(p.oid::regprocedure::text, ', ') into outros
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname = 'public'
     and p.proname not in ('okr_state_exige_versao', 'okr_state_exige_dono')
     and (p.prosrc ~* 'insert\s+into\s+(public\.)?okr_state'
          or p.prosrc ~* 'update\s+(public\.)?okr_state\s+set[^;]*\mdata\M');
  if outros is not null then
    raise exception 'OKR 034: estas funções do banco gravam o conteúdo do OKR e passariam a ser recusadas: %. Nada foi mudado — chame o Claude.', outros;
  end if;
end $t$;

-- A regra, igual à de hoje, só com 3 no lugar de 2 (mesma assinatura: dono e permissões ficam).
create or replace function public.okr_state_exige_versao()
 returns trigger
 language plpgsql
 set search_path to 'public'
as $function$
begin
  if coalesce(nullif(new.data->>'v', '')::int, 0) < 3 then
    raise exception 'OKR_VERSAO_VELHA: esta aba está com uma versão antiga do sistema — recarregue a página (F5).' using errcode = 'P0001';
  end if;
  return new;
end $function$;

commit;

-- CONFERÊNCIA (só lê). Esperado: true · true · N   (N = OKRs já gravados na versão 3; pode ser 0 — cada um passa a 3
-- na próxima vez que alguém o salvar; os de versão 2 continuam sendo lidos normalmente, só não aceitam gravação velha)
select position('< 3 then' in pg_get_functiondef('public.okr_state_exige_versao()'::regprocedure)) > 0 as exige_3,
       (select tgenabled <> 'D' from pg_trigger
         where tgname = 'okr_state_exige_versao' and tgrelid = 'public.okr_state'::regclass)              as gatilho_ligado,
       (select count(*) from public.okr_state where coalesce(nullif(data->>'v', '')::int, 0) >= 3)         as okrs_na_v3;
