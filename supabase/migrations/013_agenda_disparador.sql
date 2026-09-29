-- 013 — DISPARADOR da agenda: o pg_cron chama /api/agenda/disparar a cada 5 min (29/09/2026).
--
-- Antes: a 012 monta a fila de e-mails da agenda (agenda_alerta), mas ninguém a esvazia —
--        os alertas ficariam "agendados" para sempre.
-- Agora: um job do pg_cron ('agenda-disparar'), a cada 5 minutos, olha a fila e — SÓ se houver
--        e-mail vencido para sair (ver o bloco 4) — faz um POST (pg_net) em
--        https://kpieng.jimpnexus.com/api/agenda/disparar com o cabeçalho
--        "Authorization: Bearer <segredo>". O servidor confere o segredo, pega o que venceu
--        (agenda_pegar_devidos), manda pelo SMTP da empresa e marca (agenda_marcar_envio).
--        O segredo fica no Vault do Supabase (criptografado), não no texto do job.
--        Um segundo job ('agenda-limpar-historico', 1x por dia) apaga o histórico de rodadas
--        DESTES dois jobs com mais de 7 dias (senão cron.job_run_details cresce sem fim:
--        288 linhas por dia).
-- Por quê pg_cron e não o cron da Vercel: decisão de 29/09 — mexer no vercel.json arrisca
--        travar o deploy, e o banco já tem o relógio e a fila. (No plano Hobby da Vercel o
--        cron roda no máximo 1x por dia: não daria o "1 hora antes".)
--
-- Pedido do Edson (29/09): "que esses itens gerem alertas e esses alertas sejam disparados
-- para os e-mails cadastrados".
--
-- PRÉ-REQUISITOS, NESTA ORDEM (o passo a passo inteiro está no cabeçalho da 012, "ORDEM
-- PARA PUBLICAR" — lá o BANCO vem antes do código):
--   a) a 012 rodada no SQL Editor (ANTES do push) e conferida;
--   b) AGENDA_CRON_SECRET posta na Vercel e o código da agenda publicado — o deploy "Ready"
--      feito DEPOIS da variável (se a variável entrou depois do deploy: Redeploy);
--   c) no app, o "Enviar teste para mim" de um compromisso seu CHEGOU no seu e-mail (prova o
--      SMTP e o módulo da agenda na Vercel). Sem isso, não ligue o disparador.
--   Sem o código publicado a chamada dá 404: não quebra nada, só não envia.
--
-- ORDEM PARA LIGAR (nada disso roda sozinho):
--   1) O segredo é o MESMO que está em AGENDA_CRON_SECRET na Vercel (passo 2 da 012). Se ainda
--      não gerou: 40+ caracteres, só letras e números. No terminal (Node):
--        node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
--      (não use `openssl rand` no Windows: grava CRLF e o segredo sai com \r → 401).
--   2) Vercel → projeto eng-jimp → Settings → Environment Variables (Production):
--        AGENDA_CRON_SECRET = <o segredo>
--        APP_URL            = https://kpieng.jimpnexus.com   (opcional; é o padrão)
--      Variável nova só vale em deploy feito DEPOIS dela: se ela entrou antes do push da
--      agenda, o deploy do push já a levou; se entrou depois (ou o segredo foi trocado), faça
--      REDEPLOY e espere "Ready". EMAIL_HOST / EMAIL_PORT / EMAIL_USER / EMAIL_PASS /
--      EMAIL_FROM já estão lá (são os do /api/send-email).
--   3) Aqui, no SQL Editor: troque o texto de exemplo do bloco 2 (COLE_AQUI_…, aparece UMA
--      vez só) pelo MESMO segredo e rode o arquivo inteiro. O bloco 2 se recusa a rodar com
--      o texto de exemplo. NÃO salve este arquivo com o segredo de verdade (ele vai para o git).
--   4) Confira com as consultas do fim do arquivo (job ativo, rodadas 'succeeded', resposta
--      HTTP 200 com "falhas":0 — lá está o que quer dizer cada resposta).
--
-- Pode rodar de novo (idempotente): troca o segredo e recria os jobs.
-- Rollback: supabase/migrations/013_rollback.sql (para o disparador; a fila fica intacta).

-- ---------------------------------------------------------------------------
-- 1) Extensões. No Supabase, se der erro de permissão aqui, ligue as duas em
--    Database → Extensions (pg_cron e pg_net) e rode o arquivo de novo.
--    O Vault (supabase_vault) já vem ligado nos projetos do Supabase.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- 2) O segredo no Vault (nome 'agenda_cron_secret'). Existe → atualiza; senão cria.
-- ---------------------------------------------------------------------------
do $$
declare
  v_segredo constant text := 'COLE_AQUI_O_AGENDA_CRON_SECRET';
  v_id uuid;
begin
  -- O texto de exemplo está partido em dois de propósito: um "substituir tudo" no editor
  -- troca só a linha de cima.
  if v_segredo = 'COLE_AQUI_O' || '_AGENDA_CRON_SECRET' or length(v_segredo) < 16 or v_segredo ~ '\s' then
    raise exception 'Agenda 013: troque o texto de exemplo (COLE_AQUI_…) pelo segredo — o MESMO de AGENDA_CRON_SECRET na Vercel, 16+ caracteres, sem espaço. Nada foi feito.';
  end if;

  select s.id into v_id from vault.secrets s where s.name = 'agenda_cron_secret' limit 1;
  if v_id is not null then
    perform vault.update_secret(v_id, v_segredo);
  else
    perform vault.create_secret(
      v_segredo,
      'agenda_cron_secret',
      'Agenda (migracao 013): segredo do /api/agenda/disparar. O MESMO de AGENDA_CRON_SECRET na Vercel.'
    );
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 3) Tira os jobs antigos (se o arquivo já rodou antes).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'agenda-disparar') then
    perform cron.unschedule('agenda-disparar');
  end if;
  if exists (select 1 from cron.job where jobname = 'agenda-limpar-historico') then
    perform cron.unschedule('agenda-limpar-historico');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- 4) O disparador: a cada 5 minutos o BANCO olha a fila, e só chama o servidor se houver
--    e-mail para sair (pendente já vencido e fora da espera de nova tentativa) ou alerta
--    preso em 'enviando' há mais de 10 min (para o servidor devolvê-lo à fila). Fila vazia =
--    nenhuma chamada. Por quê (29/09, pesquisa de limites): no plano Hobby a Vercel dá só
--    4 h/mês de CPU ativa ao time inteiro (KPI, pedidos, CMMS, TAESA, portal), e acordar a
--    função 288 vezes por dia à toa podia comer de 2% a 60% disso. Assim são poucas chamadas
--    por dia (as horas em que há lembrete), e olhar a fila custa nada ao banco (índice
--    agenda_alerta_fila_idx). O pg_cron roda como o dono das tabelas: a RLS não o barra.
--    O segredo é lido do Vault na hora de cada chamada (trocar o segredo = rodar o bloco 2
--    de novo; o job não muda). A chamada é assíncrona (pg_net): a resposta do servidor
--    aparece em net._http_response.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'agenda-disparar',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://kpieng.jimpnexus.com/api/agenda/disparar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  )
  where exists (
    select 1 from public.agenda_alerta a
     where (a.estado = 'pendente' and a.dispara_em <= now()
            and (a.tentar_depois_de is null or a.tentar_depois_de <= now()))
        or (a.estado = 'enviando' and a.atualizado_em < now() - interval '10 minutes')
  )
  $$
);

-- ---------------------------------------------------------------------------
-- 5) Faxina diária (03:17 UTC = 00:17 em Joinville): histórico de rodadas destes jobs com
--    mais de 7 dias. Não toca no histórico de nenhum outro job.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'agenda-limpar-historico',
  '17 3 * * *',
  $$
  delete from cron.job_run_details
   where end_time < now() - interval '7 days'
     and jobid in (select jobid from cron.job where jobname in ('agenda-disparar', 'agenda-limpar-historico'))
  $$
);

-- O que ficou agendado (deve mostrar os 2 jobs, active = true):
select jobid, jobname, schedule, active from cron.job where jobname like 'agenda-%' order by jobname;

-- ---------------------------------------------------------------------------
-- Conferência (rodar depois de uns 5 minutos):
--
--   -- as últimas rodadas do job ('succeeded' = o POST foi para a fila do pg_net):
--   select r.start_time, r.status, r.return_message
--     from cron.job_run_details r join cron.job j on j.jobid = r.jobid
--    where j.jobname = 'agenda-disparar'
--    order by r.start_time desc limit 10;
--
--   -- a resposta do servidor (status_code + o começo do corpo):
--   --   200 com "success":true e "falhas":0 = certo ("enviados" = quantos e-mails saíram);
--   --   200 com "falhas" > 0 = o SMTP recusou algum e-mail (volta sozinho, até 5 tentativas).
--   --       Por quê: a consulta de erros logo abaixo;
--   --   200 com "adiados" > 0 = a rodada acabou o tempo, ou o servidor de e-mail caiu no meio:
--   --       o resto sai na próxima rodada, sem gastar tentativa;
--   --   200 com "success":false = leu parte da fila e depois errou ao ler; a próxima continua;
--   --   401 = o segredo do Vault é diferente do AGENDA_CRON_SECRET que está NO AR na Vercel
--   --       (inclusive: trocou na Vercel e não fez o Redeploy);
--   --   503 "Disparador da agenda nao configurado." = falta AGENDA_CRON_SECRET (ou o Redeploy);
--   --   503 "E-mail nao configurado no servidor…" = faltam EMAIL_* na Vercel (nada sai da fila);
--   --   503 "Servidor nao configurado." = faltam as chaves do Supabase na Vercel;
--   --   404 = o código da agenda não foi publicado (ou o deploy ainda não ficou "Ready");
--   --   500 "Modulo da agenda nao carregou no servidor." = o pacote da Vercel veio sem o
--   --       api/_agenda (nada sai da fila): refazer o deploy;
--   --   500 "Nao consegui ler a fila da agenda." = a 012 não rodou, ou faltou o
--   --       notify pgrst, 'reload schema' (rode só essa linha e espere a próxima rodada);
--   --   504, ou timed_out = true (status_code vazio) = a Vercel ou o pg_net (25 s) cortou a
--   --       chamada; o que ficou em 'enviando' volta sozinho para a fila em 10 minutos.
--   select id, status_code, left(content::text, 300) as resposta, error_msg, timed_out, created
--     from net._http_response
--    order by created desc limit 10;
--
--   -- os últimos erros de envio (quando "falhas" > 0):
--   select id, codigo, estado, tentativas, left(erro, 200) as erro, atualizado_em
--     from public.agenda_alerta
--    where erro is not null
--    order by atualizado_em desc limit 10;
--
--   -- a fila da agenda por estado:
--   select estado, count(*) from public.agenda_alerta group by estado order by estado;
--
--   -- disparar AGORA, sem esperar os 5 min (mesma chamada do job):
--   select net.http_post(
--     url := 'https://kpieng.jimpnexus.com/api/agenda/disparar',
--     headers := jsonb_build_object('Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'agenda_cron_secret')),
--     body := '{}'::jsonb, timeout_milliseconds := 25000);
--
--   -- pausar sem apagar / religar:
--   select cron.alter_job((select jobid from cron.job where jobname = 'agenda-disparar'), active := false);
--   select cron.alter_job((select jobid from cron.job where jobname = 'agenda-disparar'), active := true);
-- ---------------------------------------------------------------------------
