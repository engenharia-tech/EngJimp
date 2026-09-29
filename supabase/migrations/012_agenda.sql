-- 012 — AGENDA dos usuários do OKR (29/09/2026).
--
-- Pedido do Edson (29/09): "um item chamado agenda … similar à linha do tempo … só que eu
-- não quero que misture … tarefas futuras, coisas que eu preciso fazer (viagem para a
-- China, visitar um cliente, reunião no dia tal) … e que esses itens gerem alertas
-- disparados para os e-mails cadastrados". Decisões dele no mesmo dia:
--   · quem usa: SÓ quem está no OKR (tem OKR próprio, é "somente OKR", admin de OKR, Edson).
--     O admin de visualização (okr_viewer / ADM_EXTERNO) não tem agenda — ele só olha o OKR;
--   · quem vê — regra dele, 29/09, e NÃO é a do OKR: "a regra dos OKRs que o Nascimento
--     consegue ver, ele consegue continuar vendo. As agendas eu não gostaria que ele visse.
--     Somente eu … A minha agenda somente eu mesmo posso ver. Mais ninguém. Porque eu sou o
--     proprietário." → cada um vê SÓ a sua; só o Edson (pelo id) vê a dos outros (só leitura);
--     a do Edson, só ele. O admin de OKR, o CEO e o visualizador NÃO. O convidado NÃO vê o
--     compromisso no app — recebe só os e-mails (convite, lembretes, alteração, cancelamento,
--     remoção da lista);
--   · alertas padrão de um compromisso novo: 1 dia antes, no dia às 7h e 1 hora antes;
--   · para quem vai: o e-mail CADASTRADO do dono + o dos participantes, escolhidos entre os
--     usuários cadastrados. Nenhum e-mail digitado solto (a mesma trava do /api/send-email).
--
-- Separada do OKR de propósito: tabela própria, nada em okr_state.
--
-- COMO FUNCIONA O ALERTA
--   agenda_item      = o compromisso (dia/hora local de Joinville, America/Sao_Paulo).
--   agenda_alerta    = a fila de e-mails. Um gatilho refaz os lembretes a cada gravação
--                      (mudou a data → o lembrete muda junto; o que já saiu não sai de novo)
--                      e põe na fila os avisos aos participantes (convite, alterado,
--                      cancelado) e a quem saiu da lista (removido).
--   agenda_pegar_devidos / agenda_marcar_envio = só o servidor (service_role) chama: o
--                      /api/agenda/disparar pega o que venceu, manda e marca. Quem chama o
--                      disparador a cada 5 min é o pg_cron (migração 013).
--   Avisos, pessoa por pessoa: cada um recebe o que precisa saber, uma vez. O "alterado" vai
--   para quem está na lista (menos quem ainda tem convite ou "alterado" na fila: esses saem
--   com os dados da hora do envio). "Cancelado" e "removido" só vão para quem RECEBEU algum
--   e-mail do compromisso NESTA participação, isto é, desde a última vez que entrou na lista
--   (cético 3, abaixo): quem ainda não recebeu nada não sabe dele (se sai da lista ou o
--   compromisso é cancelado antes de o convite sair, nada sai para ele), e o que recebeu antes
--   de ser tirado não conta depois que volta. Concluído: nenhum aviso.
--   "Recebeu" é REGISTRADO na hora do envio (cético 2, abaixo): cada alerta enviado guarda quem
--   o servidor de e-mail ACEITOU (recebeu) e o título/datas que o e-mail mostrou (recebeu_como).
--   Quem é TIRADO da lista (e já recebeu algum e-mail nesta participação) recebe "removido" —
--   decisão do Edson, 29/09: SÓ o título e as datas do ÚLTIMO e-mail que ELE recebeu (nada de
--   local, descrição nem lista de participantes; o .ics sai CANCELLED, para sair do calendário
--   dele). Vale também quando é tirado na MESMA gravação que cancela: quem ficou recebe
--   "cancelado" (dados completos), quem foi tirado recebe "removido".
--   O "cancelado" sai com a FOTO do compromisso da hora do cancelamento (nunca o de agora), e
--   convite/"alterado" só vão para quem está na lista na hora do envio (cético final, abaixo).
--
-- PROVA (29/09, antes de ir para o SQL Editor): bancada com Postgres 18.3 de verdade (PGlite,
-- em memória, com os papéis/privilégios padrão do Supabase), este arquivo rodado verbatim,
-- de novo por cima, rollback e de novo, e por cima do rascunho antigo: 548/548 (rodada do
-- cético 3). A regra de privacidade do Edson é cobrada: esta MESMA 012 com só a leitura
-- antiga (admin de OKR e convidado leem) faz 509/548 — as 39 que caem são todas de quem lê o
-- quê (as mesmas 39 de antes). E 66 defeitos plantados, um por conserto (20 da rodada da
-- tarde + 15 do cético final + 2 da integração final + 16 do cético 2 + 13 do cético 3): os
-- 66 pegos.
-- Junção com o servidor: a linha que agenda_pegar_devidos devolve passou pelo api/_agenda.ts
-- de verdade (30/30, com o corte "e-mail só da empresa" chegando ao banco e o p_recebeu saindo
-- do aceitosPeloSmtp real); os 22 casos do cético final, também pelo api/_agenda.ts: 22/22 (o
-- 012 de antes do conserto dele: 15/22); os 8 do cético 2: 8/8 (o 012 de antes dele: 2/8); os
-- 12 do cético 3: 12/12 (o 012 de antes dele: 3/12) e as 22 bordas dele: 22/22; o fuzz do
-- cético 2 — 6 sementes × 250 cenários × 40 passos, cada e-mail pelo api/_agenda.ts e pelo
-- corte de domínio reais, com o servidor de hoje (p_recebeu, SMTP recusando 6%) e com o de
-- antes (4 argumentos): zero quebras nos dois; e o fuzz do cético 3 (abaixo).
-- Ajustes do mesmo dia, cada um com o porquê no ponto do código: privilégios que sobravam
-- (TRUNCATE passa por cima da RLS), aparar tab/quebra de linha, hora no minuto e sem 24:00,
-- colisão de minuto também na remarcação, 7d/3d/1d sem depender do fuso da sessão, avisos
-- sem duplicar/contradizer, concluir sem mandar convite, o lote do disparador na ordem da
-- fila; e, depois da revisão adversarial (tarde): o id fora da gravação (não dá mais para
-- sondar se um compromisso alheio existe), o "removido" (abaixo), o "alterado" desfeito que
-- some da fila, só o lembrete vencido mais novo sai quando a fila atrasa, ADIADO/falha que
-- chegam atrasados não reabrem o que já saiu, e o "cancelado" de compromisso reaberto antes
-- do disparo não vai para quem continua na lista (recebe o convite da reabertura).
--
-- CÉTICO FINAL (29/09, fim da tarde) — dois furos de CORRIDA na regra "quem é tirado da lista
-- nunca recebe o que foi escrito depois de sair", os dois com o aviso ainda na fila (até 5
-- min; dias com o SMTP fora):
--   1) o "cancelado" guardava só o "para"; o conteúdo era lido no disparo. Editar o
--      compromisso já cancelado (tirando a pessoa e escrevendo local/descrição), ou reabri-lo
--      sem ela trocando título/data (e até cancelar de novo), mandava a ela o que foi escrito
--      depois. Agora o "cancelado" leva a FOTO da hora do cancelamento ("antes") e o disparo
--      monta com ela; do compromisso reaberto, só título e datas da foto (é lido como remoção);
--   2) convite/"alterado" preso em 'enviando' (reset de 10 min, ADIADO) voltava à fila com o
--      "para" antigo e lia o compromisso de agora. Agora convite/"alterado" só vão para quem
--      está na lista na hora da montagem (a trava que vale); o gatilho tira quem sai também do
--      que está 'enviando'; o que ficar sem ninguém sai da fila (não vira "sem destinatário").
--   Junto: o "removido" usa o "antes" do "alterado" que estava saindo (o que a pessoa
--   certamente sabia), e o "alterado" em dobro para quem ficou (um preso + um novo) vira um.
--
-- CÉTICO 2 (29/09, noite) — dois furos na LETRA da regra. Nenhum conteúdo escrito depois de a
-- pessoa sair vazava no fuzz de 6 sementes × 250 cenários × 40 passos (zero — mas aquela
-- invariante não via quem é tirado e volta sem convite: é o furo 2 do cético 3, abaixo); o que
-- quebrava era "quem já sabe", ADIVINHADO pelo gatilho ("não tem convite PENDENTE"):
--   A) quem nunca recebeu nada recebia o "cancelado" completo — incluído na mesma gravação que
--      cancela, ou incluído com o compromisso concluído e cancelado depois (a tela promete
--      "cancelar avisa quem já recebeu o convite");
--   B) quem era tirado recebia o "removido" com título/datas que NUNCA recebeu (ex.: título
--      trocado com o compromisso concluído; convite 'enviando' que não chegou a sair).
--   Conserto: o disparador REGISTRA em cada alerta quem recebe e o título/datas que o e-mail
--   mostra (agenda_alerta.recebeu / recebeu_como; só valem com 'enviado'). "removido" e
--   "cancelado" só saem para quem tem um e-mail ENVIADO antes deles; o "removido" sai um por
--   pessoa, com o título/datas do último e-mail que ELA recebeu (decidido no disparo, quando o
--   que estava saindo na hora da gravação já se resolveu); o "cancelado" de compromisso
--   reaberto que sobrou para quem ficou fora vira "removido". Versão EXATA: "recebeu" = quem o
--   servidor de e-mail ACEITOU — o servidor manda os ids em agenda_marcar_envio(p_recebeu);
--   quem ele cortou por ser de fora da empresa ou o SMTP recusou NÃO conta. Sem p_recebeu
--   (servidor de antes, 4 argumentos): vale quem foi montado. Troca aceita, a favor da
--   privacidade: e-mail que saiu mas ficou preso em 'enviando' não conta como recebido.
--
-- CÉTICO 3 (29/09, noite) — "já recebeu" valia PARA SEMPRE, e o gatilho ainda o adivinhava pelo
-- convite na fila. Três furos, provados em bancada (cetico3_casos.mjs: o 012 de antes deste
-- conserto cumpria 3/12):
--   1) quem JÁ RECEBEU algum e-mail ficava sem o "cancelado"/"removido" se tivesse um convite na
--      fila: o da REABERTURA vai para todos (concluir por engano → reabrir → cancelar: ninguém
--      era avisado), e o lembrete sai antes de um convite que falhou ou voltou ADIADO. A tela
--      promete o aviso a quem já recebeu algum e-mail;
--   2) quem foi TIRADO (e avisado) e voltou SEM convite — na gravação que cancela, ou com o
--      compromisso concluído — recebia o "cancelado" COMPLETO, com título/local/descrição
--      escritos DEPOIS de sair: o registro contava o que ele recebeu ANTES de ser tirado;
--   3) o "removido" atrasado (falha comum: espera 5 min) saía DEPOIS do convite da volta (o .ics
--      CANCELLED tira o compromisso do calendário dela); tirada de novo, dois "removido".
--   Conserto: "já recebeu" vale POR PARTICIPAÇÃO. agenda_item.entradas guarda quando cada um
--   ENTROU na lista (a versão da gravação; do gatilho de antes, fora do grant por coluna) e cada
--   e-mail registra a versão que mostrou (recebeu_como.versao). "Sem aviso" = convite na fila E
--   nada recebido (ou saindo) nesta participação; "removido"/"cancelado" só para quem recebeu
--   algo NESTA participação (o "removido" guarda "entrou"; a foto do "cancelado", "entradas") e,
--   no "cancelado", só se o último desses não foi um "cancelado"; o "removido" velho sai da fila
--   se ela já recebeu um e-mail mais novo que a remoção; o "cancelado" de reaberto não vira um
--   2º "removido". A assinatura e o retorno das RPCs são os mesmos (o servidor não muda).
--   Prova: teste.mjs 548/548 (bloco Q: 12 casos do cético 3 + 5 novos, um por peça, e as
--   checagens de "entradas"/"versao"); regra antiga 509/548 (só as 39 de privacidade); 66
--   defeitos plantados, 66 pegos (13 deste conserto). Fuzz do cético 3 (superconjunto do
--   anterior, com vivacidade e aviso em dobro): sementes 1–12 no modo exato e 4–6 no
--   compatível, 250 cenários × 40 passos — as invariantes de privacidade (I1/I2/I3/D/S1/S2/R e
--   a nova S4, "cancelado" com conteúdo escrito com a pessoa fora da lista) em ZERO. O que ainda
--   aparece é aviso a MENOS ou em DOBRO, nunca conteúdo que a pessoa não podia ver, e cada caso
--   cai numa troca aceita: e-mail que saiu e ficou preso em 'enviando' (não conta como
--   recebido); quem o SMTP recusou; saída "de desenho" (tirado com o compromisso concluído, ou
--   na gravação que conclui/reabre, sem aviso); dois avisos no MESMO lote (o 2º pego com o 1º
--   ainda saindo — inclusive o "removido" velho junto com o e-mail da volta: o corte só vê o
--   que já saiu); e "cancelado" → "removido" quando o compromisso saiu de 'cancelado' (reaberto
--   ou concluído) com ela fora da lista (o P9 do cético 2).
--
-- ORDEM PARA PUBLICAR (tabela NOVA: aqui o BANCO vem ANTES do código — ao contrário da
-- 004/005, que diziam "só rode depois de publicar o código"). Esta 012 só ACRESCENTA
-- (tabelas, funções e políticas agenda_*; não mexe em nada que já existe) e o código de
-- hoje não a usa: rodá-la antes não muda nada na tela. Se o push viesse antes, os usuários
-- do OKR veriam a aba Agenda com "A agenda ainda não foi instalada no banco" até ela rodar.
--   1) Supabase → SQL Editor: rode ESTE arquivo inteiro. Confira com as consultas do fim
--      (RLS true/true, 5 políticas, grants por coluna, o momento do "1d"). Nada muda na tela.
--   2) Gere o segredo do disparador (40+ letras e números; ver a 013, passo 1 — no Windows
--      NÃO use `openssl rand`) e guarde-o: ele vai na Vercel agora e na 013 depois.
--      Vercel → projeto eng-jimp → Settings → Environment Variables (Production):
--        AGENDA_CRON_SECRET = <o segredo>      (EMAIL_* já estão lá, são os do /api/send-email)
--   3) Push do código da agenda (com o OK do Edson). Na Vercel → Deployments, o deploy desse
--      push tem de ficar "Ready" (erro = quase sempre tsc; aí NADA foi publicado). Variável
--      nova só vale em deploy feito DEPOIS dela: se o passo 2 veio depois do deploy, faça
--      Redeploy e espere "Ready" de novo. (O servidor chama agenda_marcar_envio com p_recebeu
--      — 5 argumentos —, que só existe depois desta 012: mais um motivo para ela vir antes. A
--      chamada de 4 argumentos, do servidor de antes, continua valendo.)
--   4) No app: Ctrl+Shift+R → aba Agenda → crie um compromisso seu → "Enviar teste para mim".
--      O e-mail tem de chegar na sua caixa (prova o SMTP e o módulo da agenda na Vercel).
--      Avise os usuários do OKR: quem está com a aba aberta de antes precisa de Ctrl+Shift+R.
--   5) Só então a 013 (liga o disparador a cada 5 min), seguindo o cabeçalho dela; confira as
--      respostas do servidor com as consultas do fim da 013 (200 com "falhas":0 = certo).
--   Desfazer: primeiro o 013_rollback.sql (se a 013 rodou), depois o 012_rollback.sql.
--
-- Rollback: supabase/migrations/012_rollback.sql

-- ---------------------------------------------------------------------------
-- 1) Quem é quem (lido do CADASTRO por auth.uid(), nunca do crachá de 24 h)
-- ---------------------------------------------------------------------------

-- Tem agenda: Edson; ou quem tem OKR próprio / somente OKR / admin de OKR — e não é o
-- visualizador (okr_viewer ou ADM_EXTERNO), a menos que seja admin de OKR (mesma regra de
-- ehVisualizador no servidor e de isOkrViewer na tela).
create or replace function public.agenda_pode_usar()
returns boolean
language sql
stable
security definer
set search_path = public
as $f$
  select coalesce(auth.uid() = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid, false)
      or exists (
        select 1
          from public.users u
         where u.id = auth.uid()
           and (coalesce(u.okr_enabled, false) or coalesce(u.okr_only, false) or coalesce(u.okr_admin, false))
           and (coalesce(u.okr_admin, false)
                or not (coalesce(u.okr_viewer, false) or coalesce(u.role, '') = 'ADM_EXTERNO'))
      )
$f$;

-- Vê a agenda dos outros: SÓ o Edson, pelo id (e-mail e login são editáveis; o id não).
-- NÃO é o "master" do OKR: o admin de OKR (okr_admin) fica de fora de propósito — decisão
-- do Edson, 29/09. Não trocar por okr_is_master()/okr_admin.
create or replace function public.agenda_e_edson()
returns boolean
language sql
stable
security definer
set search_path = public
as $f$
  select coalesce(auth.uid() = '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid, false)
$f$;

-- Ainda está no cadastro (o crachá de quem foi excluído vale 24 h; sem a linha, sem acesso).
create or replace function public.agenda_eu_cadastrado()
returns boolean
language sql
stable
security definer
set search_path = public
as $f$
  select exists (select 1 from public.users u where u.id = auth.uid())
$f$;

-- Funções de política: avaliadas no contexto de quem consulta — authenticated PRECISA
-- executá-las (mesmo padrão de pode_ler_auditoria, migração 011). Só devolvem booleano
-- sobre o próprio usuário.
revoke all on function public.agenda_pode_usar() from public, anon;
revoke all on function public.agenda_e_edson() from public, anon;
revoke all on function public.agenda_eu_cadastrado() from public, anon;
grant execute on function public.agenda_pode_usar() to authenticated, service_role;
grant execute on function public.agenda_e_edson() to authenticated, service_role;
grant execute on function public.agenda_eu_cadastrado() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) As tabelas
-- ---------------------------------------------------------------------------

create table if not exists public.agenda_item (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references public.users(id) on delete cascade,
  titulo         text not null,
  tipo           text not null default 'outro',
  local          text,
  descricao      text,
  inicio_dia     date not null,
  inicio_hora    time,              -- nulo = o dia inteiro
  fim_dia        date not null,
  fim_hora       time,              -- só existe com inicio_hora
  participantes  uuid[] not null default '{}',
  alertas        text[] not null default '{1d,dia7h,1h}',
  status         text not null default 'ativo',
  criado_em      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint agenda_item_titulo    check (length(titulo) between 1 and 200),
  constraint agenda_item_tipo      check (tipo in ('viagem', 'visita', 'reuniao', 'tarefa', 'evento', 'outro')),
  constraint agenda_item_status    check (status in ('ativo', 'concluido', 'cancelado')),
  constraint agenda_item_local     check (local is null or length(local) <= 200),
  constraint agenda_item_descricao check (descricao is null or length(descricao) <= 4000),
  constraint agenda_item_ano       check (inicio_dia >= date '2000-01-01' and fim_dia <= date '2100-12-31'),
  constraint agenda_item_fim_hora  check (fim_hora is null or inicio_hora is not null),
  -- O tipo time aceita '24:00'; a tela não (e o lembrete cairia no dia seguinte).
  constraint agenda_item_hora      check (inicio_hora < time '24:00' and fim_hora < time '24:00'),
  constraint agenda_item_ordem     check (
    fim_dia > inicio_dia
    or (fim_dia = inicio_dia and (inicio_hora is null or fim_hora is null or fim_hora >= inicio_hora))
  ),
  constraint agenda_item_particip  check (cardinality(participantes) <= 30)
);

create index if not exists agenda_item_owner_idx on public.agenda_item (owner_id);
create index if not exists agenda_item_inicio_idx on public.agenda_item (inicio_dia);
create index if not exists agenda_item_participantes_idx on public.agenda_item using gin (participantes);
-- (cético 3) Quando cada participante ENTROU na lista pela última vez: pessoa → a versão
-- (updated_at) da gravação que o incluiu. Mantida pelo gatilho de antes; o navegador não grava
-- (fora do grant por coluna). É o que separa "recebeu nesta participação" de "recebeu antes de
-- ser tirado" (o registro recebeu/recebeu_como).
alter table public.agenda_item add column if not exists entradas jsonb not null default '{}'::jsonb;

create table if not exists public.agenda_alerta (
  id               bigint generated always as identity primary key,
  item_id          uuid not null references public.agenda_item(id) on delete cascade,
  codigo           text not null,
  dispara_em       timestamptz not null,
  para             uuid[],          -- nulo = o público do código (lembrete: dono + participantes; aviso: participantes)
  estado           text not null default 'pendente',
  tentativas       int not null default 0,
  tentar_depois_de timestamptz,     -- nova tentativa depois de uma falha de envio
  enviado_em       timestamptz,
  destinatarios    text,            -- para quem saiu, de fato (registro)
  erro             text,
  -- O que o destinatário SABIA (só "alterado", "removido" e "cancelado"):
  --   alterado  = título/local/datas de antes da mudança (desfeita a mudança, o aviso sai da fila);
  --   removido  = título/datas que ele conhecia (é SÓ isso que o e-mail dele leva);
  --   cancelado = a FOTO do compromisso na hora do cancelamento (título, tipo, local, descrição,
  --               datas, lista, versão) — o e-mail sai com ela, nunca com o compromisso de agora.
  antes            jsonb,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  -- agenda_alerta_codigo e agenda_alerta_antes: logo abaixo (ALTER — valem também por cima
  -- de uma versão anterior desta tabela).
  constraint agenda_alerta_estado check (estado in ('pendente', 'enviando', 'enviado', 'falhou', 'expirado', 'sem_destinatario'))
);

-- Por cima de uma versão anterior (o "create table if not exists" não mexe em tabela que já
-- existe): as colunas novas e as travas de hoje. Sem isto, o gatilho não conseguiria gravar o
-- "removido" (a trava velha recusaria o código e a gravação do compromisso inteira cairia).
alter table public.agenda_alerta add column if not exists antes jsonb;
-- (cético 2) O registro de "quem já sabe o quê", gravado pelo disparador (agenda_pegar_devidos
-- ao pegar; agenda_marcar_envio no sucesso). Só vale com estado = 'enviado':
--   recebeu      = quem recebeu ESTE e-mail: ao pegar, os ids montados (os de "destinatarios");
--                  no sucesso, só os que o servidor de e-mail ACEITOU (p_recebeu);
--   recebeu_como = o título e as datas que ESTE e-mail mostrou (o que a pessoa passou a saber).
-- Nulo = alerta sem registro (de antes dele): vale a regra anterior.
alter table public.agenda_alerta add column if not exists recebeu uuid[];
alter table public.agenda_alerta add column if not exists recebeu_como jsonb;
alter table public.agenda_alerta
  drop constraint if exists agenda_alerta_codigo,
  drop constraint if exists agenda_alerta_antes,
  add constraint agenda_alerta_codigo
    check (codigo in ('7d', '3d', '1d', 'dia7h', '1h', '30m', 'convite', 'alterado', 'cancelado', 'removido')),
  -- O "removido" sem o que a pessoa sabia não tem o que mostrar — e NUNCA lê o compromisso de agora.
  add constraint agenda_alerta_antes
    check (codigo <> 'removido' or (antes is not null and antes ? 'titulo' and antes ? 'inicio_dia'));

create index if not exists agenda_alerta_fila_idx on public.agenda_alerta (estado, dispara_em);
create index if not exists agenda_alerta_item_idx on public.agenda_alerta (item_id);
-- Um lembrete é (compromisso, código, momento): o que já saiu não volta para a fila.
create unique index if not exists agenda_alerta_lembrete_unico
  on public.agenda_alerta (item_id, codigo, dispara_em)
  where codigo in ('7d', '3d', '1d', 'dia7h', '1h', '30m');

-- ---------------------------------------------------------------------------
-- 3) Quando dispara cada lembrete (hora de Joinville)
-- ---------------------------------------------------------------------------
-- Compromisso com hora: 7d/3d/1d/1h/30m antes da hora; "dia7h" = 07:00 do dia, se o
-- compromisso começa depois das 07:00.
-- Dia inteiro: a referência é 07:00 — 7d/3d/1d = 07:00 de N dias antes, dia7h = 07:00 do
-- dia; 1h e 30m não existem.
-- 7d/3d/1d são contados NA DATA (relógio de Joinville), não subtraindo '7 days' do instante:
-- timestamptz - interval 'N days' usa o TimeZone da SESSÃO, e numa sessão em fuso com horário
-- de verão (ex.: America/New_York) o lembrete saía 1 h errado (provado na bancada, 29/09).
create or replace function public.agenda_momento_alerta(p_codigo text, p_dia date, p_hora time)
returns timestamptz
language sql
stable
set search_path = public
as $f$
  select case
    when p_hora is null then
      case p_codigo
        when '7d'    then ((p_dia - 7) + time '07:00') at time zone 'America/Sao_Paulo'
        when '3d'    then ((p_dia - 3) + time '07:00') at time zone 'America/Sao_Paulo'
        when '1d'    then ((p_dia - 1) + time '07:00') at time zone 'America/Sao_Paulo'
        when 'dia7h' then (p_dia + time '07:00') at time zone 'America/Sao_Paulo'
      end
    else
      case p_codigo
        when '7d'    then ((p_dia - 7) + p_hora) at time zone 'America/Sao_Paulo'
        when '3d'    then ((p_dia - 3) + p_hora) at time zone 'America/Sao_Paulo'
        when '1d'    then ((p_dia - 1) + p_hora) at time zone 'America/Sao_Paulo'
        when 'dia7h' then case when p_hora > time '07:00'
                               then (p_dia + time '07:00') at time zone 'America/Sao_Paulo' end
        when '1h'    then ((p_dia + p_hora) at time zone 'America/Sao_Paulo') - interval '1 hour'
        when '30m'   then ((p_dia + p_hora) at time zone 'America/Sao_Paulo') - interval '30 minutes'
      end
  end
$f$;

-- Até quando um lembrete ainda faz sentido: com hora, até começar; dia inteiro, até o fim
-- do primeiro dia.
create or replace function public.agenda_prazo_lembrete(p_dia date, p_hora time)
returns timestamptz
language sql
stable
set search_path = public
as $f$
  select case when p_hora is null
              then ((p_dia + 1) + time '00:00') at time zone 'America/Sao_Paulo'
              else (p_dia + p_hora) at time zone 'America/Sao_Paulo' end
$f$;

-- ---------------------------------------------------------------------------
-- 4) Gatilhos
-- ---------------------------------------------------------------------------

-- ANTES de gravar: o que o navegador não escolhe. Dono = quem está logado (e não muda),
-- datas de criação/versão = as do banco, texto aparado, participantes únicos e
-- cadastrados (sem o próprio dono), alertas só dos códigos conhecidos (1h/30m não
-- existem em compromisso de dia inteiro).
create or replace function public.agenda_item_antes()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.owner_id := v_uid;
    end if;
    new.criado_em := now();
  else
    new.owner_id  := old.owner_id;
    new.criado_em := old.criado_em;
  end if;
  -- clock_timestamp: duas gravações seguidas nunca repetem a versão.
  new.updated_at := clock_timestamp();

  -- Aparar como o trim() da tela: espaço, tab e quebra de linha (btrim sozinho só tira
  -- espaço — um título "\t\n" passava como não vazio).
  new.titulo    := regexp_replace(coalesce(new.titulo, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g');
  new.local     := nullif(regexp_replace(coalesce(new.local, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  new.descricao := nullif(regexp_replace(coalesce(new.descricao, ''), '^[[:space:]]+|[[:space:]]+$', '', 'g'), '');
  if new.fim_dia is null then
    new.fim_dia := new.inicio_dia;
  end if;
  -- Hora no minuto: a tela só conhece HH:MM, e "dois lembretes no mesmo minuto viram um"
  -- depende disso (08:00:30 fazia sair "dia 7h" às 07:00:00 E "1 h antes" às 07:00:30).
  if new.inicio_hora is not null and extract(second from new.inicio_hora) <> 0 then
    new.inicio_hora := make_time(extract(hour from new.inicio_hora)::int, extract(minute from new.inicio_hora)::int, 0);
  end if;
  if new.inicio_hora is null then
    new.fim_hora := null;
  elsif new.fim_hora is not null and extract(second from new.fim_hora) <> 0 then
    new.fim_hora := make_time(extract(hour from new.fim_hora)::int, extract(minute from new.fim_hora)::int, 0);
  end if;

  new.participantes := coalesce((
    select array_agg(distinct p order by p)
      from unnest(coalesce(new.participantes, '{}'::uuid[])) as p
     where p is not null
       and p <> new.owner_id
       and exists (select 1 from public.users u where u.id = p)
  ), '{}'::uuid[]);

  -- (cético 3) Quando cada um entrou: quem continua mantém; quem entrou agora = esta versão.
  -- (Linha de antes da coluna: quem já estava conta desde sempre.)
  if tg_op = 'UPDATE' then
    new.entradas := coalesce((
      select jsonb_object_agg(p::text,
               case when p = any (old.participantes)
                    then coalesce(old.entradas -> p::text, to_jsonb('-infinity'::timestamptz))
                    else to_jsonb(new.updated_at) end)
        from unnest(new.participantes) as p), '{}'::jsonb);
  else
    new.entradas := coalesce((select jsonb_object_agg(p::text, to_jsonb(new.updated_at))
                                from unnest(new.participantes) as p), '{}'::jsonb);
  end if;

  new.alertas := coalesce((
    select array_agg(distinct a order by a)
      from unnest(coalesce(new.alertas, '{}'::text[])) as a
     where a in ('7d', '3d', '1d', 'dia7h', '1h', '30m')
       and (new.inicio_hora is not null or a in ('7d', '3d', '1d', 'dia7h'))
  ), '{}'::text[]);

  return new;
end
$f$;

-- DEPOIS de gravar: a fila de e-mails.
create or replace function public.agenda_item_depois()
returns trigger
language plpgsql
security definer
set search_path = public
as $f$
declare
  v_lembretes  constant text[] := array['7d', '3d', '1d', 'dia7h', '1h', '30m'];
  -- Dois lembretes no mesmo minuto viram um: fica o mais próximo do compromisso (esta ordem).
  v_ordem      constant text[] := array['30m', '1h', 'dia7h', '1d', '3d', '7d'];
  v_futuro     boolean;
  v_antigos    uuid[] := '{}';
  v_novos      uuid[] := '{}';
  v_saiu       uuid[] := '{}';
  v_ficou      uuid[] := '{}';
  v_sem_aviso  uuid[] := '{}';   -- só tinham convite na fila: ainda não sabem do compromisso
  v_ja_vai     uuid[] := '{}';   -- já têm convite/"alterado" na fila (lê os dados na hora do envio)
  v_avisar     uuid[] := '{}';
  v_mudou      boolean := false;
  v_sabiam     jsonb := '{}';    -- quem saiu → título/datas que ele conhecia (para o "removido")
begin
  -- 4a) LEMBRETES. O conjunto que VALE é (código, momento) para as datas de AGORA, já com
  --     um só por minuto (ex.: reunião às 08:00 → "no dia 7h" e "1 h antes" caem às 07:00:
  --     fica o "1 h antes", a mesma regra de previewAlertas na tela — também quando a
  --     colisão nasce de uma remarcação, não só na criação).
  --     Sai da fila o pendente futuro que não vale mais (data trocada, código tirado,
  --     compromisso concluído/cancelado, perdeu a colisão). Entra o que falta, se ainda está
  --     no futuro. O que já foi enviado com o mesmo (código, momento) não entra de novo
  --     (índice único). Um pendente já vencido e ainda pedido (esperando o disparador) fica.
  with pedido as (
    select c as codigo, public.agenda_momento_alerta(c, new.inicio_dia, new.inicio_hora) as momento
      from unnest(case when new.status = 'ativo' then new.alertas else '{}'::text[] end) as c
  ), vale as (
    select distinct on (p.momento) p.codigo, p.momento
      from pedido p
     where p.momento is not null
     order by p.momento, array_position(v_ordem, p.codigo)
  )
  delete from public.agenda_alerta a
   where a.item_id = new.id
     and a.estado = 'pendente'
     and a.codigo = any (v_lembretes)
     and not exists (select 1 from vale v where v.codigo = a.codigo and v.momento = a.dispara_em)
     and not (a.dispara_em <= now()
              and exists (select 1 from pedido p where p.codigo = a.codigo and p.momento = a.dispara_em));

  if new.status = 'ativo' then
    insert into public.agenda_alerta (item_id, codigo, dispara_em)
    select new.id, v.codigo, v.momento
      from (
        select distinct on (x.momento) x.codigo, x.momento
          from (
            select c as codigo, public.agenda_momento_alerta(c, new.inicio_dia, new.inicio_hora) as momento
              from unnest(new.alertas) as c
          ) x
         where x.momento is not null
         order by x.momento, array_position(v_ordem, x.codigo)
      ) v
     where v.momento > now()
       and not exists (
         select 1 from public.agenda_alerta b
          where b.item_id = new.id and b.codigo = any (v_lembretes)
            and b.dispara_em = v.momento and b.codigo <> v.codigo
       )
    on conflict do nothing;
  end if;

  -- 4b) AVISOS AOS PARTICIPANTES. Regra de fundo: cada pessoa recebe o que precisa saber, uma
  --     vez — quem só tem o convite na fila ainda não sabe do compromisso (não precisa de
  --     "cancelado"/"alterado"/"removido"; o convite sai com os dados da hora do envio).
  if tg_op = 'UPDATE' then
    v_antigos := coalesce(old.participantes, '{}'::uuid[]);
    -- Convite de para nulo = os participantes de antes desta gravação.
    select coalesce(array_agg(distinct p), '{}') into v_sem_aviso
      from public.agenda_alerta a
      cross join lateral unnest(coalesce(a.para, v_antigos)) p
     where a.item_id = new.id and a.estado = 'pendente' and a.codigo = 'convite'
       -- (cético 3) Convite na fila NÃO quer dizer "nunca soube": o da reabertura vai para todos
       -- (também para quem já recebeu), e um lembrete pode sair antes de um convite que falhou.
       -- Quem já recebeu (ou está recebendo) algo NESTA participação não é "sem aviso" — o
       -- disparador decide no envio (agenda_pegar_devidos, pelo registro).
       and not exists (select 1 from public.agenda_alerta b
                        where b.item_id = new.id and b.estado in ('enviado', 'enviando') and b.codigo <> 'removido'
                          and p = any (b.recebeu)
                          and coalesce((b.recebeu_como ->> 'versao')::timestamptz, 'infinity'::timestamptz)
                              >= coalesce((old.entradas ->> p::text)::timestamptz, '-infinity'::timestamptz));
    -- Quem saiu da lista e ainda está no cadastro (o apagado do cadastro não tem para onde
    -- mandar) e o que cada um SABIA do compromisso — é só isso que o "removido" dele leva:
    -- o título e as datas do ÚLTIMO e-mail que ele RECEBEU (o registro do disparador, cético 2;
    -- o disparador confere de novo na hora de mandar, quando o que estava saindo já se
    -- resolveu). Sem registro (alerta de antes dele), a regra anterior: o "antes" do
    -- "alterado" que ainda não saiu para ele (a mudança ele não chegou a saber); senão, o
    -- título e as datas de antes desta gravação. Lido AQUI, antes da faxina logo
    -- abaixo (que apaga os "alterados" pendentes quando o compromisso é cancelado).
    -- Conta também o "alterado" que está 'enviando' (o disparador pegou e a rodada ainda não
    -- marcou): se ele não chegar a sair (ADIADO, a função caiu), a mudança dele ela não soube —
    -- o "antes" dele é o que ela certamente conhecia (cético final, 29/09).
    v_saiu := coalesce((select array_agg(p) from unnest(v_antigos) p
                         where not (p = any (new.participantes))
                           and exists (select 1 from public.users u where u.id = p)), '{}');
    if cardinality(v_saiu) > 0 then
      select coalesce(jsonb_object_agg(s.p::text, s.sabia), '{}') into v_sabiam
        from (
          select p, coalesce(
                   (select b.recebeu_como from public.agenda_alerta b
                     where b.item_id = new.id and b.estado = 'enviado' and b.codigo <> 'removido'
                       and b.recebeu_como is not null and p = any (b.recebeu)
                     order by b.id desc limit 1),
                   (select jsonb_build_object('titulo', a.antes -> 'titulo',
                                              'inicio_dia', a.antes -> 'inicio_dia', 'inicio_hora', a.antes -> 'inicio_hora',
                                              'fim_dia', a.antes -> 'fim_dia', 'fim_hora', a.antes -> 'fim_hora')
                      from public.agenda_alerta a
                     where a.item_id = new.id and a.estado in ('pendente', 'enviando') and a.codigo = 'alterado'
                       and a.antes is not null and p = any (a.para)
                     order by a.id
                     limit 1),
                   jsonb_build_object('titulo', old.titulo, 'inicio_dia', old.inicio_dia, 'inicio_hora', old.inicio_hora,
                                      'fim_dia', old.fim_dia, 'fim_hora', old.fim_hora)) as sabia
            from unnest(v_saiu) p
        ) s;
    end if;
    -- Concluído ou cancelado agora: convite e "alterado" que ainda não saíram não saem mais
    -- (antes, concluir deixava o convite na fila e ele saía — "concluído: ninguém precisa de e-mail").
    if new.status <> 'ativo' and old.status = 'ativo' then
      delete from public.agenda_alerta
       where item_id = new.id and estado = 'pendente' and codigo in ('convite', 'alterado');
    end if;
  end if;

  -- Só de compromisso que ainda não acabou (até o fim do último dia dele).
  v_futuro := ((new.fim_dia + 1) + time '00:00') at time zone 'America/Sao_Paulo' > now();
  if not v_futuro then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'ativo' and cardinality(new.participantes) > 0 then
      insert into public.agenda_alerta (item_id, codigo, dispara_em, para)
      values (new.id, 'convite', now(), null);
    end if;
    return null;
  end if;

  v_novos := coalesce((select array_agg(p) from unnest(new.participantes) p where not (p = any (v_antigos))), '{}');
  -- (v_saiu — quem saiu — foi calculado acima, junto com o que cada um sabia.)
  v_ficou := coalesce((select array_agg(p) from unnest(new.participantes) p where p = any (v_antigos)), '{}');

  -- Tirado da lista, por quem já sabia do compromisso → "removido" (decisão do Edson, 29/09):
  -- leva SÓ o título e as datas que ELE conhecia (v_sabiam, gravados em "antes"; o disparador
  -- não lê o compromisso de agora para este aviso) — nada de local, descrição, participantes.
  -- Uma linha POR PESSOA (cético 2): o disparador decide pessoa a pessoa, pelo registro da
  -- hora do envio — quem não tem nenhum e-mail ENVIADO antes sai dele, e o "antes" vira o
  -- título/datas do último e-mail que ela recebeu (agenda_pegar_devidos).
  -- Vale para quem é tirado de um compromisso ativo e para quem é tirado na MESMA gravação que
  -- o cancela (os que ficaram recebem "cancelado", abaixo). Quem só tinha o convite na fila
  -- nunca soube: nada. Concluir ou reabrir não avisa quem sai (concluído não manda e-mail;
  -- reaberto de cancelado: ele já recebeu o "cancelado").
  if cardinality(v_saiu) > 0
     and ((new.status = 'cancelado' and old.status <> 'cancelado')
          or (new.status = 'ativo' and old.status = 'ativo')) then
    insert into public.agenda_alerta (item_id, codigo, dispara_em, para, antes)
    select new.id, 'removido', now(), array_agg(e.k::uuid order by e.k),
           e.v || jsonb_build_object('updated_at', new.updated_at,  -- versão do .ics: maior que a do que ele recebeu
                                     'entrou', old.entradas -> e.k)   -- (cético 3) a participação que acabou agora
      from jsonb_each(v_sabiam) as e(k, v)
     where not (e.k::uuid = any (v_sem_aviso))
     group by e.k, e.v;
  end if;

  -- Cancelado agora: "cancelado" para os participantes que já sabiam (convite/alteração
  -- pendentes já saíram da fila acima; quem só tinha o convite na fila nunca soube e não
  -- recebe nada). Quem foi tirado nesta mesma gravação recebeu o "removido" acima. Na hora de
  -- mandar, o disparador ainda tira quem não tem nenhum e-mail ENVIADO antes (cético 2: quem
  -- entrou nesta mesma gravação, ou com o compromisso concluído, nunca recebeu o convite).
  -- Com a FOTO do compromisso de agora em "antes" (cético final, 29/09): o disparador monta o
  -- e-mail com ela, não com o compromisso da hora do envio. Antes, o "para" era fixado aqui e
  -- o conteúdo lido no disparo — e entre os dois (até 5 min; dias com o SMTP fora) o dono podia
  -- tirar alguém da lista e escrever local/descrição novos no compromisso cancelado, ou
  -- reabri-lo sem a pessoa trocando título/data (e até cancelar de novo): o tirado recebia o
  -- que foi escrito DEPOIS de sair (regra do Edson, 29/09). Com a foto, quem estava na lista
  -- nesta hora recebe só o que existia enquanto estava nela.
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    v_avisar := coalesce((select array_agg(distinct p) from unnest(new.participantes) p
                           where not (p = any (v_sem_aviso))), '{}');
    if cardinality(v_avisar) > 0 then
      insert into public.agenda_alerta (item_id, codigo, dispara_em, para, antes)
      values (new.id, 'cancelado', now(), v_avisar,
              jsonb_build_object('titulo', new.titulo, 'tipo', new.tipo, 'local', new.local, 'descricao', new.descricao,
                                 'inicio_dia', new.inicio_dia, 'inicio_hora', new.inicio_hora,
                                 'fim_dia', new.fim_dia, 'fim_hora', new.fim_hora,
                                 'participantes', to_jsonb(new.participantes), 'updated_at', new.updated_at,
                                 'entradas', new.entradas));  -- (cético 3) quando cada um entrou
    end if;
    return null;
  end if;

  if new.status <> 'ativo' then
    return null;  -- concluído: ninguém precisa de e-mail
  end if;

  -- Reaberto (estava cancelado/concluído): todos os participantes recebem o convite de novo.
  if old.status <> 'ativo' then
    if cardinality(new.participantes) > 0 then
      insert into public.agenda_alerta (item_id, codigo, dispara_em, para)
      values (new.id, 'convite', now(), new.participantes);
    end if;
    return null;
  end if;

  -- Tirado da lista: sai dos convites/"alterados" que ainda não saíram (o convite de para
  -- nulo já não o alcança: vai para os participantes da hora do envio). O "removido" de quem
  -- já sabia entrou acima.
  -- Sai também do que está 'enviando' (cético final, 29/09): se a rodada não chegar a mandar
  -- (ADIADO, ou a função caiu e o reset de 10 min o devolve), ele volta à fila já sem quem
  -- saiu. O 'enviando' não é apagado aqui (o resultado do envio em curso ainda vai ser
  -- marcado) nem tem o atualizado_em mexido (é o relógio do reset de 10 min); se ficar sem
  -- ninguém, o disparador o tira da fila quando ele voltar. A trava que vale é a do
  -- disparador (destinatarios: convite/"alterado" só para quem está na lista na hora).
  if cardinality(v_saiu) > 0 then
    update public.agenda_alerta a
       set para = coalesce((select array_agg(p) from unnest(a.para) p where not (p = any (v_saiu))), '{}'),
           atualizado_em = case when a.estado = 'enviando' then a.atualizado_em else now() end
     where a.item_id = new.id and a.estado in ('pendente', 'enviando') and a.codigo in ('convite', 'alterado')
       and a.para && v_saiu;
    delete from public.agenda_alerta
     where item_id = new.id and estado = 'pendente' and codigo in ('convite', 'alterado')
       and cardinality(para) = 0;
  end if;
  -- Ninguém mais na lista: convite/"alterado" que sobraram não têm para quem ir (o de para
  -- nulo ia virar 'sem_destinatario' à toa).
  if cardinality(new.participantes) = 0 then
    delete from public.agenda_alerta
     where item_id = new.id and estado = 'pendente' and codigo in ('convite', 'alterado');
  end if;

  -- Entrou na lista: recebe o convite — menos se ainda há um convite de para nulo na fila
  -- (ele sai para os participantes da hora do envio e já leva quem entrou agora; antes, a
  -- pessoa recebia dois convites iguais).
  if cardinality(v_novos) > 0
     and not exists (select 1 from public.agenda_alerta
                      where item_id = new.id and estado = 'pendente' and codigo = 'convite' and para is null) then
    insert into public.agenda_alerta (item_id, codigo, dispara_em, para)
    values (new.id, 'convite', now(), v_novos);
  end if;

  -- Mudou o que importa para quem vai (quando, onde, o quê): quem já estava recebe
  -- "alterado" — menos quem já tem convite ou "alterado" na fila (eles leem os dados na hora
  -- do envio). Pessoa por pessoa: quem teve o convite enviado depois do último "alterado"
  -- ainda na fila também precisa saber da mudança nova.
  v_mudou := new.titulo is distinct from old.titulo
          or new.local is distinct from old.local
          or new.inicio_dia is distinct from old.inicio_dia
          or new.inicio_hora is distinct from old.inicio_hora
          or new.fim_dia is distinct from old.fim_dia
          or new.fim_hora is distinct from old.fim_hora;
  if v_mudou and cardinality(v_ficou) > 0 then
    select coalesce(array_agg(distinct p), '{}') into v_ja_vai
      from public.agenda_alerta a
      cross join lateral unnest(coalesce(a.para, new.participantes)) p
     where a.item_id = new.id and a.estado = 'pendente' and a.codigo in ('convite', 'alterado');
    v_avisar := coalesce((select array_agg(p) from unnest(v_ficou) p where not (p = any (v_ja_vai))), '{}');
    if cardinality(v_avisar) > 0 then
      -- "antes" = o que eles sabiam (a versão de antes desta gravação).
      insert into public.agenda_alerta (item_id, codigo, dispara_em, para, antes)
      values (new.id, 'alterado', now(), v_avisar,
              jsonb_build_object('titulo', old.titulo, 'local', old.local, 'inicio_dia', old.inicio_dia,
                                 'inicio_hora', old.inicio_hora, 'fim_dia', old.fim_dia, 'fim_hora', old.fim_hora));
    end if;
  end if;

  -- Mudança desfeita (ex.: arrastou na linha do tempo e voltou antes do disparo): o "alterado"
  -- que ainda não saiu e cujo "antes" é igual ao compromisso de AGORA não diz mais nada — sai
  -- da fila (antes, saía "alterou … agora <a mesma data de antes>"). Fica por último: quem
  -- estava nele não ganhou outro "alterado" nesta gravação (v_ja_vai), e não precisa.
  -- O disparador faz o mesmo antes de pegar (rede de segurança).
  delete from public.agenda_alerta
   where item_id = new.id and estado = 'pendente' and codigo = 'alterado'
     and antes = jsonb_build_object('titulo', new.titulo, 'local', new.local, 'inicio_dia', new.inicio_dia,
                                    'inicio_hora', new.inicio_hora, 'fim_dia', new.fim_dia, 'fim_hora', new.fim_hora);

  return null;
end
$f$;

revoke all on function public.agenda_item_antes() from public, anon, authenticated;
revoke all on function public.agenda_item_depois() from public, anon, authenticated;

drop trigger if exists agenda_item_antes on public.agenda_item;
create trigger agenda_item_antes
  before insert or update on public.agenda_item
  for each row execute function public.agenda_item_antes();

drop trigger if exists agenda_item_depois on public.agenda_item;
create trigger agenda_item_depois
  after insert or update on public.agenda_item
  for each row execute function public.agenda_item_depois();

-- ---------------------------------------------------------------------------
-- 5) RLS e permissões
-- ---------------------------------------------------------------------------

alter table public.agenda_item enable row level security;
alter table public.agenda_alerta enable row level security;

-- O Supabase dá GRANT ALL em toda tabela nova de public para anon e authenticated (privilégio
-- padrão): tira tudo e devolve só o que a tela usa. Sobrava TRUNCATE (que passa por cima da
-- RLS e apagaria a agenda/fila de todos), REFERENCES, TRIGGER e insert/update/delete na fila.
-- (O "revoke all" na tabela tira também os privilégios por coluna de uma execução anterior.)
revoke all on public.agenda_item from anon, authenticated;
revoke all on public.agenda_alerta from anon, authenticated;
-- Gravar: por COLUNA, com o "id" de fora. O navegador não escolhe o id ao criar nem o troca
-- ao editar: antes, o erro de chave duplicada (23505) dizia se um id ALHEIO existia — e quem
-- recebeu um e-mail da agenda sabe o id (vai no UID do .ics). Agora insert, update e upsert
-- que mandam "id" dão 42501, exista o item ou não; sem "id" funcionam (a tela nunca manda:
-- toAgendaRow). Dono, criação e versão ficam na lista porque o gatilho de antes os
-- sobrescreve de qualquer jeito (a bancada prova que mandar outro valor não pega).
grant select, delete on public.agenda_item to authenticated;
grant insert (owner_id, titulo, tipo, local, descricao, inicio_dia, inicio_hora, fim_dia, fim_hora,
              participantes, alertas, status, criado_em, updated_at),
      update (owner_id, titulo, tipo, local, descricao, inicio_dia, inicio_hora, fim_dia, fim_hora,
              participantes, alertas, status, criado_em, updated_at)
   on public.agenda_item to authenticated;
grant select on public.agenda_alerta to authenticated;
grant all on public.agenda_item to service_role;
grant all on public.agenda_alerta to service_role;

-- Ler: o DONO; e o Edson, a dos outros. A agenda do Edson, só ele (o dono dela é ele).
-- Ninguém mais: nem o admin de OKR, nem o CEO, nem quem foi convidado (o convidado recebe
-- só os e-mails). Sempre de quem ainda está no cadastro. Decisão do Edson, 29/09.
drop policy if exists agenda_item_ler on public.agenda_item;
create policy agenda_item_ler on public.agenda_item
  for select to authenticated
  using (
    public.agenda_eu_cadastrado()
    and (owner_id = auth.uid() or public.agenda_e_edson())
  );

-- Criar/editar/apagar: só o dono, e só quem tem agenda (quem saiu do OKR não grava mais).
drop policy if exists agenda_item_criar on public.agenda_item;
create policy agenda_item_criar on public.agenda_item
  for insert to authenticated
  with check (owner_id = auth.uid() and public.agenda_pode_usar());

drop policy if exists agenda_item_editar on public.agenda_item;
create policy agenda_item_editar on public.agenda_item
  for update to authenticated
  using (owner_id = auth.uid() and public.agenda_pode_usar())
  with check (owner_id = auth.uid());

drop policy if exists agenda_item_apagar on public.agenda_item;
create policy agenda_item_apagar on public.agenda_item
  for delete to authenticated
  using (owner_id = auth.uid() and public.agenda_pode_usar());

-- A fila: só leitura, e só do compromisso que a pessoa enxerga (a RLS acima vale dentro).
-- Ninguém do navegador escreve nela: quem escreve é o gatilho e o servidor.
drop policy if exists agenda_alerta_ler on public.agenda_alerta;
create policy agenda_alerta_ler on public.agenda_alerta
  for select to authenticated
  using (exists (select 1 from public.agenda_item i where i.id = agenda_alerta.item_id));

-- ---------------------------------------------------------------------------
-- 6) O disparador (só service_role)
-- ---------------------------------------------------------------------------

-- Pega até p_limite alertas vencidos, marca como 'enviando' (outro disparo em paralelo
-- pula os mesmos: FOR UPDATE SKIP LOCKED) e devolve tudo o que o e-mail precisa.
-- Antes, arruma a fila: devolve o que ficou preso em 'enviando' (a função caiu no meio),
-- tira o "alterado" que a mudança desfeita esvaziou, tira do "cancelado" de compromisso
-- reaberto quem voltou à lista, tira o "alterado" em dobro da mesma pessoa, tira o
-- convite/"alterado" em que ninguém está mais na lista, e expira lembrete de compromisso que
-- já começou, lembrete vencido que perdeu a vez para um mais novo e aviso com mais de 2 dias.
-- Por fim (cético 2), pelo REGISTRO de quem recebeu o quê: o "cancelado" de compromisso
-- reaberto que sobrou para quem ficou fora vira "removido" (um por pessoa); o "removido" leva o
-- título/datas do último e-mail que a pessoa recebeu; e "removido"/"cancelado" só ficam para
-- quem tem um e-mail ENVIADO antes deles. Ao pegar, grava o registro (recebeu/recebeu_como).
-- O "removido" NÃO lê o compromisso de agora: leva só o título e as datas guardados na fila;
-- o "cancelado", só a foto da hora do cancelamento. Convite e "alterado" (que leem o de
-- agora) só vão para quem está na lista AGORA.
-- O formato do retorno não muda (o servidor, api/index.ts + api/_agenda.ts, depende dele).
create or replace function public.agenda_pegar_devidos(p_limite int default 10)
returns table (
  alerta_id     bigint,
  codigo        text,
  dispara_em    timestamptz,
  tentativas    int,
  item          jsonb,
  dono          jsonb,
  participantes jsonb,
  destinatarios jsonb
)
language plpgsql
security definer
set search_path = public
as $f$
#variable_conflict use_column
begin
  update public.agenda_alerta a
     set estado = case when a.tentativas >= 5 then 'falhou' else 'pendente' end,
         erro = left(coalesce(a.erro || ' | ', '') || 'envio interrompido', 500),
         atualizado_em = now()
   where a.estado = 'enviando' and a.atualizado_em < now() - interval '10 minutes';

  -- "alterado" cujo "antes" (o que os destinatários sabiam) é igual ao compromisso de agora:
  -- a mudança foi desfeita, não há o que dizer (o gatilho já tira; isto é a rede de segurança).
  delete from public.agenda_alerta a
   using public.agenda_item i
   where a.item_id = i.id and a.estado = 'pendente' and a.codigo = 'alterado'
     and a.antes = jsonb_build_object('titulo', i.titulo, 'local', i.local, 'inicio_dia', i.inicio_dia,
                                      'inicio_hora', i.inicio_hora, 'fim_dia', i.fim_dia, 'fim_hora', i.fim_hora);

  -- "cancelado" que ainda não saiu de um compromisso que NÃO está mais cancelado (reaberto
  -- antes do disparo — ex.: cancelou sem querer e reabriu): quem continua na lista não precisa
  -- dele (recebe o convite da reabertura) — e o servidor lê "cancelado" de compromisso não
  -- cancelado como aviso de quem SAIU da lista (só título e datas). Fica só para quem está
  -- fora da lista; sem ninguém, sai da fila. Decidido AQUI, no disparo, e não na reabertura:
  -- cancelou → reabriu → cancelou de novo antes do disparo, o "cancelado" sai para todos.
  update public.agenda_alerta a
     set para = coalesce((select array_agg(p) from unnest(coalesce(a.para, '{}'::uuid[])) p
                           where not (p = any (i.participantes))), '{}'),
         atualizado_em = now()
    from public.agenda_item i
   where a.item_id = i.id and a.estado = 'pendente' and a.codigo = 'cancelado'
     and i.status <> 'cancelado'
     and (a.para is null or a.para && i.participantes);
  delete from public.agenda_alerta a
   where a.estado = 'pendente' and a.codigo = 'cancelado' and cardinality(a.para) = 0;

  update public.agenda_alerta a
     set estado = 'expirado', atualizado_em = now()
    from public.agenda_item i
   where a.item_id = i.id
     and a.estado = 'pendente'
     and (
       (a.codigo in ('7d', '3d', '1d', 'dia7h', '1h', '30m')
         and (i.status <> 'ativo' or public.agenda_prazo_lembrete(i.inicio_dia, i.inicio_hora) <= now()))
       or (a.codigo in ('convite', 'alterado', 'cancelado', 'removido') and a.dispara_em < now() - interval '2 days')
       -- convite/"alterado" de compromisso que não está mais ativo (o gatilho já tira; isto é a
       -- rede de segurança). O "cancelado" e o "removido" continuam saindo.
       or (a.codigo in ('convite', 'alterado') and i.status <> 'ativo')
       -- Fila atrasada (disparador parado, 401/503, SMTP fora): um lembrete MAIS NOVO do mesmo
       -- compromisso já venceu (ou já saiu) → este perdeu a vez. Sai só o mais novo, em vez de
       -- uma rajada "Em 7 dias / Em 3 dias / Amanhã / Hoje" no mesmo minuto.
       or (a.codigo in ('7d', '3d', '1d', 'dia7h', '1h', '30m')
           and exists (select 1 from public.agenda_alerta b
                        where b.item_id = a.item_id
                          and b.codigo in ('7d', '3d', '1d', 'dia7h', '1h', '30m')
                          and b.estado in ('pendente', 'enviando', 'enviado')
                          and b.dispara_em > a.dispara_em
                          and b.dispara_em <= now()))
     );

  -- "alterado" em dobro para a mesma pessoa (cético final, 29/09): um estava 'enviando' quando
  -- o dono gravou de novo — o gatilho só enxerga o pendente e pôs outro "alterado" para ela — e
  -- voltou à fila (reset acima ou ADIADO). Os dois leem o compromisso de agora: sairiam dois
  -- e-mails iguais. Ela fica só no MAIS ANTIGO (o "antes" dele é o que ela sabia — é o que o
  -- gatilho usa para o "removido" se ela for tirada depois). Sai também do "alterado" quem tem
  -- convite na fila (o convite já leva os dados de agora). Só tira destinatário: ninguém passa
  -- a receber o que não receberia. O que ficar sem ninguém sai logo abaixo. Depois da
  -- expiração de propósito: um convite que acabou de expirar não cobre mais ninguém.
  -- Só junta quando o aviso que FICA sai JÁ (vencido e sem espera de falha): ninguém troca um
  -- aviso que sai agora por um que espera nova tentativa ou que expira antes. Se o antigo está
  -- esperando, os dois saem (duplicata, não vazamento) — e o "removido" continua certo, porque
  -- o gatilho usa o "antes" do "alterado" MAIS ANTIGO ainda na fila ou saindo.
  update public.agenda_alerta a
     set para = coalesce((select array_agg(p) from unnest(a.para) p
                           where not exists (
                             select 1 from public.agenda_alerta b
                              where b.item_id = a.item_id and b.estado = 'pendente'
                                and b.dispara_em <= now() and (b.tentar_depois_de is null or b.tentar_depois_de <= now())
                                and ((b.codigo = 'alterado' and b.id < a.id and p = any (b.para))
                                     or (b.codigo = 'convite' and p = any (coalesce(b.para, i.participantes)))))), '{}'),
         atualizado_em = now()
    from public.agenda_item i
   where a.item_id = i.id and a.estado = 'pendente' and a.codigo = 'alterado'
     and exists (select 1 from public.agenda_alerta b
                  where b.item_id = a.item_id and b.estado = 'pendente'
                    and b.dispara_em <= now() and (b.tentar_depois_de is null or b.tentar_depois_de <= now())
                    and ((b.codigo = 'alterado' and b.id < a.id and b.para && a.para)
                         or (b.codigo = 'convite' and coalesce(b.para, i.participantes) && a.para)));

  -- Convite/"alterado" em que NINGUÉM está mais na lista (cético final, 29/09): quem estava nele
  -- foi tirado enquanto ele estava 'enviando' e ele voltou à fila (reset ou ADIADO) — ou ficou
  -- vazio logo acima. Sai da fila: antes virava 'sem_destinatario', e a tela do dono dizia
  -- "ninguém da lista tem e-mail cadastrado" (falso). De para nulo: só se a lista ficou vazia.
  -- Quem saiu de um aviso que ainda tem gente é cortado na montagem (destinatarios, abaixo).
  delete from public.agenda_alerta a
   using public.agenda_item i
   where a.item_id = i.id and a.estado = 'pendente' and a.codigo in ('convite', 'alterado')
     and case when a.para is null then cardinality(i.participantes) = 0
              else not (a.para && i.participantes) end;

  -- CÉTICO 2 (29/09) — daqui até o "return query", "quem já sabe o quê" sai do REGISTRO
  -- (recebeu / recebeu_como dos alertas 'enviado'), não mais de "tem convite pendente?". Um
  -- alerta 'enviado' SEM registro (de antes dele) conta como recebido por todos: a regra anterior.
  -- 1) "cancelado" de compromisso REABERTO que sobrou (acima) para quem ficou fora da lista: para
  --    essa pessoa é uma remoção — vira um "removido" POR PESSOA, com o título/datas do último
  --    e-mail que ELA recebeu (sem registro: os da foto). O "cancelado" sai da fila.
  insert into public.agenda_alerta (item_id, codigo, dispara_em, para, antes)
  select a.item_id, 'removido', a.dispara_em, array[x.p],
         coalesce((select b.recebeu_como from public.agenda_alerta b
                    where b.item_id = a.item_id and b.id < a.id and b.estado = 'enviado' and b.codigo <> 'removido'
                      and b.recebeu_como is not null and x.p = any (b.recebeu)
                    order by b.id desc limit 1),
                  jsonb_build_object('titulo', a.antes -> 'titulo', 'inicio_dia', a.antes -> 'inicio_dia', 'inicio_hora', a.antes -> 'inicio_hora',
                                     'fim_dia', a.antes -> 'fim_dia', 'fim_hora', a.antes -> 'fim_hora'))
         || jsonb_build_object('updated_at', a.antes -> 'updated_at', 'entrou', a.antes -> 'entradas' -> x.p::text)
    from public.agenda_alerta a
    join public.agenda_item i on i.id = a.item_id
    cross join lateral unnest(a.para) as x(p)
   where a.estado = 'pendente' and a.codigo = 'cancelado' and i.status <> 'cancelado' and a.antes is not null
     -- (cético 3) tirado DEPOIS da reabertura: o "removido" do gatilho já é o dele (sem este, dois).
     and not exists (select 1 from public.agenda_alerta r
                      where r.item_id = a.item_id and r.codigo = 'removido' and r.id > a.id and x.p = any (r.para));
  delete from public.agenda_alerta a
   using public.agenda_item i
   where a.item_id = i.id and a.estado = 'pendente' and a.codigo = 'cancelado' and i.status <> 'cancelado' and a.antes is not null;

  -- 2) O "removido" (de uma pessoa) leva o título/datas do ÚLTIMO e-mail que ela de fato
  --    recebeu ANTES dele — decidido AQUI, no disparo: o que estava 'enviando' na hora da
  --    gravação (convite, "alterado") já se resolveu (saiu, ou voltou sem sair). Sem registro,
  --    fica o que o gatilho guardou.
  update public.agenda_alerta a
     set antes = (select b.recebeu_como from public.agenda_alerta b
                   where b.item_id = a.item_id and b.id < a.id and b.estado = 'enviado' and b.codigo <> 'removido'
                     and b.recebeu_como is not null and a.para[1] = any (b.recebeu)
                   order by b.id desc limit 1) || jsonb_build_object('updated_at', a.antes -> 'updated_at', 'entrou', a.antes -> 'entrou'),
         atualizado_em = now()
   where a.estado = 'pendente' and a.codigo = 'removido' and cardinality(a.para) = 1
     and exists (select 1 from public.agenda_alerta b
                  where b.item_id = a.item_id and b.id < a.id and b.estado = 'enviado' and b.codigo <> 'removido'
                    and b.recebeu_como is not null and a.para[1] = any (b.recebeu));

  -- 3) "removido" e "cancelado" só para quem já RECEBEU algum e-mail do compromisso antes deles
  --    (um alerta 'enviado' com ele no "recebeu"; o próprio "removido" não conta). Quem nunca
  --    recebeu nada — entrou na mesma gravação que cancela, entrou com o compromisso concluído,
  --    ou o convite dele não chegou a sair — nunca soube: sai do aviso. Sem ninguém, sai da fila.
  -- (cético 3) "removido" VELHO: depois da remoção que ele conta, a pessoa voltou para a lista e JÁ
  -- recebeu um e-mail da nova participação (versão do e-mail > versão da remoção — o convite da
  -- reinclusão saiu antes dele: o "removido" esperava nova tentativa ou estava preso). Ela sabe
  -- que está dentro (ou o que veio depois): este "removido" (e o .ics CANCELLED) não sai.
  update public.agenda_alerta a
     set para = coalesce((select array_agg(x) from unnest(a.para) x
                           where not exists (
                             select 1 from public.agenda_alerta b
                              where b.item_id = a.item_id and b.estado = 'enviado' and b.codigo <> 'removido'
                                and x = any (b.recebeu)
                                and (b.recebeu_como ->> 'versao')::timestamptz > (a.antes ->> 'updated_at')::timestamptz)), '{}'),
         atualizado_em = now()
   where a.estado = 'pendente' and a.codigo = 'removido'
     and exists (select 1 from unnest(coalesce(a.para, '{}'::uuid[])) x
                  where exists (select 1 from public.agenda_alerta b
                                 where b.item_id = a.item_id and b.estado = 'enviado' and b.codigo <> 'removido'
                                   and x = any (b.recebeu)
                                   and (b.recebeu_como ->> 'versao')::timestamptz > (a.antes ->> 'updated_at')::timestamptz));

  -- (cético 3) Fica no "removido"/"cancelado" só quem recebeu algum e-mail NESTA participação
  -- (versão do e-mail >= quando entrou na lista; o recebido antes de ser tirado não conta). No
  -- "cancelado", e só se o último deles não foi um "cancelado" (quem já sabe que foi cancelado e
  -- não soube da reabertura não ganha outro). Sem registro/versão (linha de antes): conta.
  update public.agenda_alerta a
     set para = coalesce((select array_agg(x) from unnest(a.para) x
                           where coalesce((select a.codigo = 'removido' or b.codigo <> 'cancelado' from public.agenda_alerta b
                                     where b.item_id = a.item_id and b.id < a.id and b.estado = 'enviado'
                                       and b.codigo <> 'removido' and (b.recebeu is null or x = any (b.recebeu))
                                       and coalesce((b.recebeu_como ->> 'versao')::timestamptz, 'infinity'::timestamptz)
                                           >= coalesce((case when a.codigo = 'removido' then a.antes ->> 'entrou'
                                                             else a.antes -> 'entradas' ->> x::text end)::timestamptz, '-infinity'::timestamptz)
                                     order by b.id desc limit 1), false)), '{}'),
         atualizado_em = now()
   where a.estado = 'pendente' and a.codigo in ('removido', 'cancelado')
     and exists (select 1 from unnest(coalesce(a.para, '{}'::uuid[])) x
                  where not coalesce((select a.codigo = 'removido' or b.codigo <> 'cancelado' from public.agenda_alerta b
                          where b.item_id = a.item_id and b.id < a.id and b.estado = 'enviado'
                            and b.codigo <> 'removido' and (b.recebeu is null or x = any (b.recebeu))
                            and coalesce((b.recebeu_como ->> 'versao')::timestamptz, 'infinity'::timestamptz)
                                >= coalesce((case when a.codigo = 'removido' then a.antes ->> 'entrou'
                                                  else a.antes -> 'entradas' ->> x::text end)::timestamptz, '-infinity'::timestamptz)
                          order by b.id desc limit 1), false));
  delete from public.agenda_alerta a
   where a.estado = 'pendente' and a.codigo in ('removido', 'cancelado') and cardinality(a.para) = 0;

  return query
  with devidos as (
    select a.id
      from public.agenda_alerta a
     where a.estado = 'pendente'
       and a.dispara_em <= now()
       and (a.tentar_depois_de is null or a.tentar_depois_de <= now())
     order by a.dispara_em, a.id
     limit greatest(1, least(coalesce(p_limite, 10), 50))
     for update skip locked
  ),
  marcados as (
    -- O REGISTRO (cético 2): recebeu = os ids montados — exatamente os que vão em
    -- "destinatarios" logo abaixo (a MESMA regra: convite/"alterado" só para quem está na lista
    -- agora, e-mail válido, e-mail repetido uma vez só, no de menor id); recebeu_como = o título
    -- e as datas que o e-mail mostra ("removido": o que ele guarda; "cancelado": a foto; os
    -- outros: o compromisso de agora). Só vale se o alerta ficar 'enviado' — e, no sucesso,
    -- agenda_marcar_envio o reduz a quem o servidor de e-mail ACEITOU (p_recebeu).
    update public.agenda_alerta a
       set estado = 'enviando', tentativas = a.tentativas + 1, atualizado_em = now(),
           recebeu = array(
             select r.id from (
               select distinct on (lower(btrim(u.email))) u.id
                 from public.users u
                where u.id = any (
                        case
                          when a.para is not null and a.codigo in ('convite', 'alterado')
                            then array(select p from unnest(a.para) p where p = any (i.participantes))
                          when a.para is not null then a.para
                          when a.codigo = 'removido' then '{}'::uuid[]
                          when a.codigo in ('convite', 'alterado', 'cancelado') then i.participantes
                          else array[i.owner_id] || i.participantes
                        end)
                  and btrim(coalesce(u.email, '')) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
                order by lower(btrim(u.email)), u.id
             ) r
             order by r.id),
           recebeu_como = case
             when a.codigo = 'removido' or (a.codigo = 'cancelado' and a.antes is not null)
               then jsonb_build_object('titulo', a.antes -> 'titulo', 'inicio_dia', a.antes -> 'inicio_dia',
                                       'inicio_hora', a.antes -> 'inicio_hora', 'fim_dia', a.antes -> 'fim_dia', 'fim_hora', a.antes -> 'fim_hora',
                                       'versao', a.antes -> 'updated_at')
             else jsonb_build_object('titulo', i.titulo, 'inicio_dia', i.inicio_dia, 'inicio_hora', i.inicio_hora,
                                     'fim_dia', i.fim_dia, 'fim_hora', i.fim_hora, 'versao', i.updated_at) end
      from devidos d, public.agenda_item i
     where a.id = d.id and i.id = a.item_id
    returning a.id, a.item_id, a.codigo, a.dispara_em, a.tentativas, a.para, a.antes
  )
  select
    m.id,
    m.codigo,
    m.dispara_em,
    m.tentativas,
    case when m.codigo = 'removido' then
      -- "removido" (quem foi TIRADO da lista — decisão do Edson, 29/09): SÓ o título e as
      -- datas que a pessoa conhecia, gravados na fila quando ela foi tirada. Local, descrição
      -- e tipo vão nulos; nada do compromisso de AGORA (nem o que o dono gravou depois).
      -- status 'cancelado' = para ela o compromisso acabou (o .ics sai CANCELLED) — o mesmo
      -- valor quando o compromisso continua e quando foi cancelado junto: o aviso não conta
      -- o que aconteceu com o resto. updated_at = o da gravação que a tirou (SEQUENCE do .ics).
      jsonb_build_object(
        'id', i.id, 'titulo', m.antes -> 'titulo', 'tipo', null, 'local', null, 'descricao', null,
        'inicio_dia', m.antes -> 'inicio_dia', 'inicio_hora', m.antes -> 'inicio_hora',
        'fim_dia', m.antes -> 'fim_dia', 'fim_hora', m.antes -> 'fim_hora',
        'status', 'cancelado', 'updated_at', m.antes -> 'updated_at'
      )
    when m.codigo = 'cancelado' and m.antes is not null then
      -- "cancelado" (cético final, 29/09): a FOTO da hora do cancelamento, gravada pelo gatilho
      -- — nunca o compromisso de agora (o que o dono escreveu depois, com a pessoa já fora da
      -- lista, não chega a ela). status = o de AGORA: reaberto antes do disparo, o aviso só
      -- sobrou para quem ficou FORA da lista (limpeza acima) e o servidor o lê como remoção —
      -- então vai só o que o "removido" leva: título e datas da foto; tipo, local e descrição
      -- nulos (a primeira trava; o corte do servidor é a segunda). (Sem "antes" = linha de uma
      -- versão anterior desta fila: cai no de sempre, abaixo.)
      jsonb_build_object(
        'id', i.id, 'titulo', m.antes -> 'titulo',
        'tipo', case when i.status = 'cancelado' then m.antes -> 'tipo' end,
        'local', case when i.status = 'cancelado' then m.antes -> 'local' end,
        'descricao', case when i.status = 'cancelado' then m.antes -> 'descricao' end,
        'inicio_dia', m.antes -> 'inicio_dia', 'inicio_hora', m.antes -> 'inicio_hora',
        'fim_dia', m.antes -> 'fim_dia', 'fim_hora', m.antes -> 'fim_hora',
        'status', i.status, 'updated_at', m.antes -> 'updated_at'
      )
    else
      jsonb_build_object(
        'id', i.id, 'titulo', i.titulo, 'tipo', i.tipo, 'local', i.local, 'descricao', i.descricao,
        'inicio_dia', i.inicio_dia, 'inicio_hora', i.inicio_hora, 'fim_dia', i.fim_dia, 'fim_hora', i.fim_hora,
        'status', i.status, 'updated_at', i.updated_at
      )
    end,
    jsonb_build_object('id', o.id, 'nome', btrim(coalesce(o.name, '') || ' ' || coalesce(o.surname, '')), 'email', o.email),
    -- Os nomes da lista: nunca para quem foi tirado dela. No "cancelado", os da FOTO (a lista da
    -- hora do cancelamento: quem entrou depois não aparece para quem já tinha saído); no
    -- "cancelado" de compromisso reaberto (só sobra para quem ficou fora), nenhum, como no "removido".
    case when m.codigo = 'removido' or (m.codigo = 'cancelado' and i.status <> 'cancelado') then '[]'::jsonb
    else coalesce((
      select jsonb_agg(btrim(coalesce(u.name, '') || ' ' || coalesce(u.surname, '')) order by u.name)
        from public.users u where u.id = any (
          case when m.codigo = 'cancelado' and m.antes ? 'participantes'
               then array(select jsonb_array_elements_text(m.antes -> 'participantes'))::uuid[]
               else i.participantes end)
    ), '[]'::jsonb) end,
    -- Os destinatários. O registro "recebeu" (marcados, acima) usa esta MESMA regra: mudou
    -- aqui, muda lá (a bancada confere que os dois dão os mesmos ids).
    coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'nome', r.nome, 'email', r.email) order by r.nome)
        from (
          select distinct on (lower(btrim(u.email)))
                 u.id, btrim(coalesce(u.name, '') || ' ' || coalesce(u.surname, '')) as nome, btrim(u.email) as email
            from public.users u
           where u.id = any (
                   case
                     -- Convite e "alterado" leem o compromisso de AGORA: só para quem está na
                     -- lista AGORA, qualquer que seja o caminho até aqui ('enviando' que voltou à
                     -- fila, ADIADO, reaberto com o aviso ainda saindo) — a trava que vale, no
                     -- ponto em que o e-mail é montado (cético final, 29/09).
                     when m.para is not null and m.codigo in ('convite', 'alterado')
                       then array(select p from unnest(m.para) p where p = any (i.participantes))
                     when m.para is not null then m.para
                     when m.codigo = 'removido' then '{}'::uuid[]   -- o gatilho sempre põe "para"; sem ele, ninguém
                     when m.codigo in ('convite', 'alterado', 'cancelado') then i.participantes
                     else array[i.owner_id] || i.participantes
                   end)
             and btrim(coalesce(u.email, '')) ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
           order by lower(btrim(u.email)), u.id
        ) r
    ), '[]'::jsonb)
  from marcados m
  join public.agenda_item i on i.id = m.item_id
  join public.users o on o.id = i.owner_id
  -- Na ordem da fila: sem isto o lote vinha em ordem qualquer, e "removido" + "convite" da
  -- mesma pessoa (tirada e recolocada) podiam sair invertidos.
  order by m.dispara_em, m.id;
end
$f$;

-- Resultado do envio. p_ok = saiu; senão p_erro diz por quê. 'SEM_DESTINATARIO' encerra
-- (ninguém com e-mail cadastrado — ou só gente de fora da empresa, que o servidor cortou);
-- 'ADIADO…' (o disparador ficou sem tempo antes de tentar)
-- volta para a fila na hora, sem gastar tentativa nem ganhar espera; outra falha volta
-- para a fila com espera crescente, até 5 tentativas.
-- ADIADO e falha só valem para o alerta que ainda está 'enviando' (o que este disparo pegou):
-- o servidor repete o marcar quando a chamada devolve erro (a 1ª pode ter gravado e só a
-- resposta se perdido) — antes, o ADIADO repetido devolvia DUAS tentativas; e um ADIADO ou
-- uma falha atrasados reabriam um alerta já 'enviado' (ou 'falhou', 'expirado'…) e o e-mail
-- saía de novo. O SUCESSO fica sem essa trava de propósito: um 'enviado' que chega depois de
-- o alerta ter voltado à fila (reset de 10 min) tem de marcar — o e-mail saiu.
-- p_recebeu (cético 2, versão EXATA; parâmetro novo, no FIM e com default): os ids que o
-- servidor de e-mail ACEITOU — o api/index.ts manda os "aceitos": sem quem ele cortou por ser
-- de fora da empresa e sem quem o SMTP recusou. No sucesso, o registro "recebeu" (os ids
-- montados ao pegar = os de "destinatarios") fica só com quem está NOS DOIS: o servidor não
-- põe ninguém que não foi montado, e o cortado/recusado NÃO conta como quem recebeu (não ganha
-- "removido" nem "cancelado" depois). Sem p_recebeu (nulo: o servidor de antes, que chama com
-- 4 argumentos), fica o montado. Um sucesso repetido ou atrasado (reset de 10 min) só pode
-- TIRAR gente do registro, nunca pôr. Nos outros desfechos o p_recebeu não é usado (o registro
-- só vale com 'enviado').
-- A assinatura antiga (4 argumentos) SAI antes: com as duas no banco, a chamada de 4 seria
-- ambígua (o PostgREST recusa; o SQL dá "não é única"). Uma só, a de 5 com default, atende
-- as duas chamadas.
drop function if exists public.agenda_marcar_envio(bigint, boolean, text, text);
create or replace function public.agenda_marcar_envio(p_id bigint, p_ok boolean, p_erro text default null,
                                                      p_destinatarios text default null, p_recebeu uuid[] default null)
returns void
language plpgsql
security definer
set search_path = public
as $f$
begin
  if p_ok then
    update public.agenda_alerta
       set estado = 'enviado', enviado_em = now(), erro = null,
           destinatarios = left(p_destinatarios, 2000), atualizado_em = now(),
           recebeu = case when p_recebeu is null or recebeu is null then recebeu
                          else array(select x from unnest(recebeu) x where x = any (p_recebeu)) end
     where id = p_id;
  elsif p_erro = 'SEM_DESTINATARIO' then
    -- p_destinatarios, quando vem, é o registro de quem o servidor CORTOU por ser de fora da
    -- empresa (decisão do Edson, 29/09 à tarde; endereço mascarado, "g***@gmail.com"): fica no
    -- alerta e o motivo diz que foi o domínio — antes o banco jogava fora e a tela do dono
    -- dizia "ninguém com e-mail" de quem tinha e-mail (junção servidor × banco, integração final).
    update public.agenda_alerta
       set estado = 'sem_destinatario',
           erro = case when nullif(btrim(p_destinatarios), '') is null then 'ninguém com e-mail cadastrado'
                       else 'ninguém da empresa com e-mail cadastrado (e-mail de fora não recebe)' end,
           destinatarios = coalesce(left(nullif(btrim(p_destinatarios), ''), 2000), destinatarios),
           atualizado_em = now()
     where id = p_id;
  elsif p_erro like 'ADIADO%' then
    -- Não tentou: devolve a tentativa que agenda_pegar_devidos contou e sai no próximo tique.
    update public.agenda_alerta
       set estado = 'pendente', tentativas = greatest(tentativas - 1, 0), tentar_depois_de = null,
           atualizado_em = now()
     where id = p_id and estado = 'enviando';
  else
    update public.agenda_alerta
       set estado = case when tentativas >= 5 then 'falhou' else 'pendente' end,
           tentar_depois_de = now() + make_interval(mins => 5 * greatest(tentativas, 1)),
           erro = left(coalesce(p_erro, 'falha no envio'), 500),
           atualizado_em = now()
     where id = p_id and estado = 'enviando';
  end if;
end
$f$;

revoke all on function public.agenda_pegar_devidos(int) from public, anon, authenticated;
revoke all on function public.agenda_marcar_envio(bigint, boolean, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.agenda_pegar_devidos(int) to service_role;
grant execute on function public.agenda_marcar_envio(bigint, boolean, text, text, uuid[]) to service_role;
revoke all on function public.agenda_momento_alerta(text, date, time) from public, anon;
revoke all on function public.agenda_prazo_lembrete(date, time) from public, anon;
grant execute on function public.agenda_momento_alerta(text, date, time) to authenticated, service_role;
grant execute on function public.agenda_prazo_lembrete(date, time) to authenticated, service_role;

-- Tabela e RPC novas só aparecem na API com 'reload schema'.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Conferência (rodar depois):
--   select tablename, rowsecurity from pg_tables where tablename like 'agenda_%';   -- true, true
--   select policyname, cmd from pg_policies where tablename like 'agenda_%' order by 1;
--     -- 5: agenda_alerta_ler SELECT; agenda_item_apagar DELETE; _criar INSERT; _editar UPDATE; _ler SELECT
--   select has_table_privilege('authenticated', 'public.agenda_item', 'INSERT') as tabela_insert,
--          has_column_privilege('authenticated', 'public.agenda_item', 'titulo', 'INSERT') as titulo_insert,
--          has_column_privilege('authenticated', 'public.agenda_item', 'id', 'INSERT') as id_insert,
--          has_column_privilege('authenticated', 'public.agenda_item', 'id', 'UPDATE') as id_update,
--          has_column_privilege('authenticated', 'public.agenda_item', 'entradas', 'UPDATE') as entradas_update;
--     -- false, true, false, false, false (grava por coluna; o "id" o navegador não escolhe nem
--     -- troca; "entradas" — quando cada um entrou na lista, cético 3 — é do gatilho)
--   select public.agenda_momento_alerta('1d', date '2026-10-10', time '14:00');   -- 2026-10-09 17:00+00
--   select pg_get_function_identity_arguments(oid) from pg_proc where proname = 'agenda_marcar_envio';
--     -- UMA linha: p_id bigint, p_ok boolean, p_erro text, p_destinatarios text, p_recebeu uuid[]
-- ---------------------------------------------------------------------------
