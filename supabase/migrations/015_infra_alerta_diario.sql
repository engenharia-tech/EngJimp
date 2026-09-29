-- 015 — ALERTA DIÁRIO do uso do banco: o pg_cron chama /api/infra/verificar 1x por dia (29/09/2026).
--
-- Decisão do Edson (29/09): e-mail de alerta a 80% do banco, 1 por dia ("pode ser").
--
-- Antes: o indicador (014 + chip "BD x%") só mostra o uso quando o Edson está com o app aberto.
-- Agora: um job do pg_cron ('infra-verificar'), TODO DIA às 11:00 UTC = 08:00 em Joinville
--        (sem horário de verão desde 2019), faz um POST (pg_net) em
--        https://kpieng.jimpnexus.com/api/infra/verificar com "Authorization: Bearer <segredo>".
--        O servidor confere o segredo, mede o banco (infra_uso_banco, da 014) e, SE o uso
--        estiver em 80% ou mais (INFRA_ALERTA_PCT na Vercel, padrão 80) e o alerta de hoje ainda
--        não saiu (tabela infra_alerta, da 014), manda UM e-mail ao Edson (o e-mail CADASTRADO
--        dele, pelo id) com o uso e as maiores tabelas, e anota o dia. Abaixo de 80%: nada sai.
-- Por quê chamar todo dia, e não só quando passar de 80% (como a 013 faz com a fila): o limite
--        e o % moram no servidor (variáveis INFRA_*); repetir a conta aqui daria duas regras
--        que podem divergir. Custo: 1 chamada por dia (~30 por mês, 0,003% das invocações do
--        Hobby). A resposta do servidor fica em net._http_response só ~6 h (padrão do pg_net,
--        pg_net.ttl); o que fica de cada dia é a linha da rodada em cron.job_run_details.
--
-- DEPENDE DA 013 (disparador da agenda) E DA 014:
--   - da 013: pg_cron, pg_net e o segredo 'agenda_cron_secret' no Vault — é o MESMO segredo de
--     AGENDA_CRON_SECRET na Vercel; /api/infra/verificar confere o mesmo segredo que
--     /api/agenda/disparar. Nada novo para gerar nem para pôr na Vercel.
--   - da 014: a função infra_uso_banco() e a tabela infra_alerta.
--   Este arquivo confere as duas coisas antes de agendar e PARA com uma mensagem clara se
--   faltar alguma (nada é criado nesse caso).
--
-- ORDEM PARA LIGAR (nada disso roda sozinho):
--   1) A 013 rodada e o disparador da agenda funcionando (respostas 200 em net._http_response).
--   2) A 014 rodada e o código do indicador publicado (o chip "BD x%" aparece para o Edson).
--   3) Aqui, no SQL Editor: rode ESTE arquivo inteiro. Não tem segredo para colar (ele já está
--      no Vault desde a 013). O SELECT do fim mostra o job: infra-verificar · 0 11 * * * · true.
--   4) Para testar sem esperar as 08:00: a consulta "chamar AGORA" do fim do arquivo; depois
--      confira a resposta (200 com "alerta":"abaixo" = certo, hoje o banco está em ~6%).
--
-- Pode rodar de novo (idempotente: recria o job). Rollback: supabase/migrations/015_rollback.sql
-- (tira só este job; o segredo do Vault é da 013 e fica).

-- ---------------------------------------------------------------------------
-- 1) Pré-requisitos (013 e 014). Faltou algo → erro claro, nada é criado.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('cron.job') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'net' and p.proname = 'http_post') then
    raise exception 'Infra 015: falta o pg_cron ou o pg_net — rode antes a 013 (disparador da agenda). Nada foi feito.';
  end if;
  -- (dois IFs: a consulta em vault.secrets só pode ser montada se o esquema existir)
  if to_regclass('vault.secrets') is null or to_regclass('vault.decrypted_secrets') is null then
    raise exception 'Infra 015: falta o Vault — rode antes a 013 (disparador da agenda). Nada foi feito.';
  end if;
  if not exists (select 1 from vault.secrets where name = 'agenda_cron_secret') then
    raise exception 'Infra 015: falta o segredo agenda_cron_secret no Vault — rode antes a 013 (bloco 2, com o segredo). Nada foi feito.';
  end if;
  if to_regprocedure('public.infra_uso_banco()') is null or to_regclass('public.infra_alerta') is null then
    raise exception 'Infra 015: falta a 014 (infra_uso_banco / infra_alerta) — rode antes a 014_infra_uso.sql. Nada foi feito.';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 2) Tira o job antigo (se este arquivo já rodou antes).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'infra-verificar') then
    perform cron.unschedule('infra-verificar');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) O job diário: 11:00 UTC = 08:00 em Joinville. O segredo é lido do Vault na hora de cada
--    chamada (o mesmo da 013). A chamada é assíncrona (pg_net): a resposta do servidor
--    aparece em net._http_response.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'infra-verificar',
  '0 11 * * *',
  $$
  select net.http_post(
    url := 'https://kpieng.jimpnexus.com/api/infra/verificar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  )
  $$
);

-- O que ficou agendado (deve mostrar 1 linha: infra-verificar · 0 11 * * * · true):
select jobid, jobname, schedule, active from cron.job where jobname = 'infra-verificar';

-- ---------------------------------------------------------------------------
-- Conferência (depois das 08:00 de Joinville, ou depois do "chamar AGORA" abaixo). A resposta do
-- servidor some de net._http_response ~6 h depois (pg_net): confira até ~14:00 de Joinville.
--
--   -- as últimas rodadas do job ('succeeded' = o POST foi para a fila do pg_net):
--   select r.start_time, r.status, r.return_message
--     from cron.job_run_details r join cron.job j on j.jobid = r.jobid
--    where j.jobname = 'infra-verificar'
--    order by r.start_time desc limit 5;
--
--   -- a resposta do servidor:
--   --   200 com "alerta":"abaixo"          = certo (uso abaixo de 80%; nada sai);
--   --   200 com "alerta":"enviado"         = o e-mail saiu (o dia ficou em infra_alerta);
--   --   200 com "alerta":"ja_enviado_hoje" = já tinha saído hoje (não repete);
--   --   200 com "status":"nao_instalado"   = a 014 não rodou (ou faltou o reload schema);
--   --   401 = o segredo do Vault é diferente do AGENDA_CRON_SECRET que está NO AR na Vercel;
--   --   503 "Verificador nao configurado." = falta AGENDA_CRON_SECRET na Vercel (ou o Redeploy);
--   --   503 "E-mail nao configurado…"      = faltam EMAIL_* na Vercel (nada foi anotado);
--   --   502 = não consegui medir o banco, ou o servidor de e-mail recusou (o dia NÃO fica
--   --         anotado: amanhã tenta de novo);
--   --   404 = o código do indicador não foi publicado (ou o deploy ainda não ficou "Ready").
--   select id, status_code, left(content::text, 300) as resposta, error_msg, timed_out, created
--     from net._http_response
--    order by created desc limit 5;
--
--   -- os alertas que já saíram:
--   select * from public.infra_alerta order by dia desc limit 10;
--
--   -- chamar AGORA, sem esperar as 08:00 (mesma chamada do job):
--   select net.http_post(
--     url := 'https://kpieng.jimpnexus.com/api/infra/verificar',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_cron_secret')),
--     body := '{}'::jsonb, timeout_milliseconds := 25000);
--
--   -- pausar sem apagar / religar:
--   select cron.alter_job((select jobid from cron.job where jobname = 'infra-verificar'), active := false);
--   select cron.alter_job((select jobid from cron.job where jobname = 'infra-verificar'), active := true);
--
-- O histórico deste job em cron.job_run_details cresce 1 linha por dia (~365 por ano, poucos kB):
-- não precisa de faxina. (A faxina da 013 cuida só dos jobs da agenda.)
-- ---------------------------------------------------------------------------
