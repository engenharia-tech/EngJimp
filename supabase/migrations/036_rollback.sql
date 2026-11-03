-- 036 — DESFAZER a causa do desvio do KPI. Tira a tabela kpis_causa, o gatilho e a função kpis_posso_causa.
-- Recusa se já houver causa gravada (é registro do setor): para desfazer assim mesmo, apagar as linhas antes, de propósito.
-- A tela continua funcionando sem a tabela (não mostra a causa).

begin;
set local lock_timeout = '5s';

do $t$
declare n bigint;
begin
  if to_regclass('public.kpis_causa') is null then
    raise exception 'KPI 036 (desfazer): a tabela kpis_causa não existe — nada foi mudado.';
  end if;
  select count(*) into n from public.kpis_causa;
  if n > 0 then
    raise exception 'KPI 036 (desfazer): há % causa(s) gravada(s) — nada foi mudado.', n;
  end if;
end $t$;

drop table public.kpis_causa;                       -- leva o gatilho e as políticas junto
drop function public.kpis_causa_antes();
drop function public.kpis_posso_causa(uuid);

commit;
