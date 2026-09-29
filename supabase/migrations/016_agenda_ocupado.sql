-- 016 — AGENDA: LIVRE/OCUPADO ao convidar (29/09/2026).
--
-- Pedido do Edson (29/09, fim da tarde): "quando eu anexo pessoas nas atividades, é importante
-- ver se ela não tem compromisso na hora ou não. Para que todos já comecem a usar essa
-- plataforma." Decisão dele no mesmo dia: mostrar SÓ "ocupado", SEM detalhes, para todos —
-- inclusive o horário ocupado do Edson. Nunca título, local, descrição, tipo, participantes nem
-- o dono do compromisso que ocupa (é o padrão do Outlook). É a ÚNICA exceção à regra "cada um vê
-- só a sua" (012): revela HORÁRIO, nunca CONTEÚDO.
--
-- Antes: quem monta um compromisso não tinha como saber se o convidado já tinha algo na hora —
--        a agenda dos outros é fechada (política agenda_item_ler da 012: só o dono; o Edson lê
--        as dos outros; a do Edson, só ele).
-- Agora: public.agenda_ocupado(p_pessoas, p_de, p_ate, p_ignorar) devolve, para as pessoas
--        pedidas, os intervalos em que elas estão ocupadas dentro da janela — e NADA MAIS:
--          pessoa      = quem está ocupado (um dos ids pedidos);
--          inicio, fim = o intervalo ocupado (instantes; fim exclusivo);
--          dia_inteiro = o compromisso é de dia inteiro (a tela escreve "o dia todo").
--        Não devolve id do compromisso, título, tipo, local, descrição, dono, lista de
--        participantes, status nem alertas. Linhas repetidas (dois compromissos com o MESMO
--        intervalo) saem uma vez só.
-- Por quê numa função e não abrindo a leitura: a leitura da agenda_item continua EXATAMENTE a
--        da 012 (esta migração não toca em tabela, política, grant nem função da 012). A função
--        roda como o dono (SECURITY DEFINER) e só deixa sair o horário.
--
-- REGRAS
--   · Quem chama: quem ainda está no cadastro E tem agenda — agenda_eu_cadastrado() e
--     agenda_pode_usar() da 012 (Edson; OKR próprio / somente OKR / admin de OKR; o visualizador
--     e o ADM_EXTERNO não, a menos que seja admin de OKR). Os outros: erro 42501 "Sem
--     permissão…" (a tela já traduz 42501). anon e PUBLIC nem executam (sem grant).
--   · Ocupa: SÓ compromisso com status 'ativo' em que a pessoa é o DONO ou está na lista de
--     PARTICIPANTES. Cancelado e concluído não ocupam.
--   · p_ignorar: o compromisso que está sendo editado (senão os convidados dele apareceriam
--     "ocupados" por ele mesmo). Só vale para compromisso DO PRÓPRIO usuário (owner_id =
--     auth.uid()): quem recebeu um e-mail da agenda conhece o id (vai no UID do .ics) e, com um
--     p_ignorar livre, compararia a resposta com e sem ele para descobrir QUAL intervalo é
--     aquele compromisso (e para onde ele foi remarcado depois de a pessoa sair da lista).
--   · Limites (erro 22023, mensagem em português): p_pessoas com no máximo 60 ids; p_de e
--     p_ate obrigatórios e finitos; p_ate > p_de; janela de no máximo 62 dias (contados em
--     segundos, não pelo relógio da sessão). p_pessoas nulo ou vazio = nenhuma linha.
--   · Janela: devolve os intervalos que CRUZAM [p_de, p_ate) — inicio < p_ate e fim > p_de;
--     encostar numa ponta (terminar exatamente em p_de, começar exatamente em p_ate) NÃO cruza.
--     O intervalo sai inteiro (não é recortado na janela): a tela mostra "ocupado das 14:00 às
--     15:30" mesmo que a janela pedida seja só um pedaço.
--
-- DIA/HORA → INSTANTE: a MESMA regra do convite .ics do servidor (api/_agenda.ts, buildIcs —
-- conferida no código em 29/09):
--     dia inteiro (inicio_hora nulo)       → [inicio_dia 00:00, fim_dia + 1 00:00)
--                                            (o DTEND;VALUE=DATE do .ics é exclusivo: maisDias(df, 1))
--     com hora, com fim_hora               → [inicio_dia inicio_hora, fim_dia fim_hora)
--     com hora, sem fim_hora, mesmo dia    → [inicio, inicio + 1 h)
--     com hora, sem fim_hora, vários dias  → [inicio, fim_dia 23:59)   (o .ics usa 23:59, não 24:00)
--     fim que não fica depois do início    → [inicio, inicio + 1 h)    (ex.: 10:00–10:00; o
--                                            "if (!(fim > ini))" do buildIcs)
-- Dia e hora são de Joinville: convertidos com America/Sao_Paulo, como os lembretes da 012
-- (agenda_momento_alerta) — independe do fuso da sessão. O servidor usa UTC−3 fixo; dá o mesmo
-- enquanto o Brasil estiver sem horário de verão (desde 2019). A hora já é gravada no minuto
-- (gatilho agenda_item_antes da 012), como o lerHora do servidor.
--
-- PROVA (29/09, antes de ir para o SQL Editor): bancada com Postgres 18 de verdade (PGlite, em
-- memória, com os papéis/privilégios padrão do Supabase — teste_ocupado.mjs), a 012 e esta 016
-- rodadas verbatim: 133/133. Cobre: quem executa (Edson, OKR próprio, somente OKR, admin de
-- OKR, CEO; e os 70 perfis cargo × marca da matriz = exatamente quem a TELA deixa usar a
-- agenda, 46 sim e 24 não); quem NÃO executa (visualizador, ADM_EXTERNO, sem OKR, anon, sem
-- crachá, service_role, quem saiu do OKR, crachá de quem saiu do cadastro — até o do Edson);
-- cruzamentos (antes, depois, dentro, abrangendo, encostando nas pontas — ao minuto e ao
-- segundo); dia inteiro, vários dias, sem hora de fim, fim = início, 23:30 que vaza para o dia
-- seguinte, madrugada; cancelado/concluído não ocupam, reaberto volta, tirado da lista deixa de
-- ocupar; participante ocupa; p_ignorar (o convidado e o Edson não somem com compromisso
-- alheio); o Edson só como intervalo; só as 4 colunas (RETURNS, "select *" e o corpo do
-- PostgREST) e nenhum id/título/local/descrição/tipo/dono no que sai; limites (61 ids, 62 dias
-- + 1 s, 63 dias, janela vazia, invertida, nula, infinita); fuso da sessão (Nova York, Xangai,
-- Kiritimati: os mesmos instantes; 62 dias atravessando o horário de verão de NY); PARIDADE com
-- o .ics — os 12 compromissos semeados e um fuzz de 250 formatos sorteados, cada um comparado
-- com o DTSTART/DTEND do buildAgendaEmail REAL (api/_agenda.ts): 250/250; e a 012 intacta
-- (políticas, RLS, grants de tabela e coluna, funções, gatilhos: o mesmo retrato antes e
-- depois desta 016, com ela rodada de novo, e depois do 016_rollback). 21 defeitos plantados
-- (devolver o título; contar cancelado; ignorar participante; aceitar visualizador; contar
-- concluído; p_ignorar alheio; encostar contando; 24:00 no lugar de 23:59; dia inteiro sem o
-- dia seguinte; sem fim = 0 min; fuso UTC; 61 ids; 63 dias; janela vazia; anon executando; sem
-- a trava do cadastro; SECURITY INVOKER; janela pelo relógio da sessão; corte de dias apertado;
-- devolver o dono; recortar na janela): os 21 pegos. A leitura da 012 continua a mesma:
-- teste.mjs 548/548 e matriz_visibilidade.mjs 406/406 células (22.873 tentativas) com a 012
-- sozinha E com a 012 + esta 016 instaladas.
--
-- ORDEM PARA PUBLICAR: esta 016 só ACRESCENTA uma função (não mexe em nada da 012/013/014/015).
--   1) Supabase → SQL Editor: rode ESTE arquivo inteiro e as conferências do fim.
--   2) Push do código da tela que chama a função (com o OK do Edson). Se a tela chegar antes da
--      função, o PostgREST responde 404 PGRST202 ("Could not find the function") — a tela TEM
--      de tratar isso como "sem informação de livre/ocupado" e nunca travar o salvar.
--   Desfazer: 016_rollback.sql. Se um dia for desfazer a agenda inteira, rode o 016_rollback.sql
--   ANTES do 012_rollback.sql (o da 012 não conhece esta função).
--
-- Rollback: supabase/migrations/016_rollback.sql

create or replace function public.agenda_ocupado(
  p_pessoas  uuid[],
  p_de       timestamptz,
  p_ate      timestamptz,
  p_ignorar  uuid default null
)
returns table (
  pessoa       uuid,
  inicio       timestamptz,
  fim          timestamptz,
  dia_inteiro  boolean
)
language plpgsql
stable
security definer
set search_path = public
as $f$
#variable_conflict use_column
declare
  v_pessoas uuid[];
  v_de_dia  date;
  v_ate_dia date;
begin
  -- Quem chama: do CADASTRO, lido na hora (nunca do crachá de 24 h).
  if not (public.agenda_eu_cadastrado() and public.agenda_pode_usar()) then
    raise exception 'Sem permissão para consultar livre/ocupado da agenda (só quem tem agenda).'
      using errcode = '42501';
  end if;

  if cardinality(p_pessoas) > 60 then
    raise exception 'Livre/ocupado: no máximo 60 pessoas por consulta (vieram %).', cardinality(p_pessoas)
      using errcode = '22023';
  end if;
  if p_de is null or p_ate is null or not isfinite(p_de) or not isfinite(p_ate) then
    raise exception 'Livre/ocupado: informe o início e o fim da janela.'
      using errcode = '22023';
  end if;
  if p_ate <= p_de then
    raise exception 'Livre/ocupado: o fim da janela tem de ser depois do início.'
      using errcode = '22023';
  end if;
  -- Em segundos: "p_de + interval '62 days'" dependeria do fuso da sessão (horário de verão).
  if extract(epoch from p_ate) - extract(epoch from p_de) > 62 * 86400 then
    raise exception 'Livre/ocupado: a janela pode ter no máximo 62 dias.'
      using errcode = '22023';
  end if;

  v_pessoas := coalesce((select array_agg(distinct x) from unnest(p_pessoas) as x where x is not null), '{}'::uuid[]);
  if cardinality(v_pessoas) = 0 then
    return;
  end if;

  -- Corte grosso pelos DIAS (só para não varrer a tabela inteira; o corte que vale é o dos
  -- instantes, no fim). Com folga: o fim mais tardio de um compromisso é fim_dia + 1 00:59
  -- (23:59 sem hora de fim + 1 h) e o começo mais cedo é inicio_dia 00:00.
  v_de_dia  := (p_de  at time zone 'America/Sao_Paulo')::date;
  v_ate_dia := (p_ate at time zone 'America/Sao_Paulo')::date;

  return query
  select distinct x.p, t.v_ini, t.v_fim, t.v_dia_inteiro
    from public.agenda_item i
    cross join lateral (
      select i.inicio_hora is null as v_dia_inteiro,
             case when i.inicio_hora is null
                  then (i.inicio_dia + time '00:00') at time zone 'America/Sao_Paulo'
                  else (i.inicio_dia + i.inicio_hora) at time zone 'America/Sao_Paulo' end as v_ini,
             case when i.inicio_hora is null
                    then ((i.fim_dia + 1) + time '00:00') at time zone 'America/Sao_Paulo'
                  when i.fim_hora is not null
                    then (i.fim_dia + i.fim_hora) at time zone 'America/Sao_Paulo'
                  when i.fim_dia > i.inicio_dia
                    then (i.fim_dia + time '23:59') at time zone 'America/Sao_Paulo'
             end as v_fim_bruto
    ) b
    cross join lateral (
      select b.v_dia_inteiro, b.v_ini,
             case when b.v_fim_bruto > b.v_ini then b.v_fim_bruto
                  else b.v_ini + interval '1 hour' end as v_fim   -- sem fim (mesmo dia) ou fim <= início: 1 h
    ) t
    cross join lateral unnest(array[i.owner_id] || i.participantes) as x(p)
   where i.status = 'ativo'
     and (i.owner_id = any (v_pessoas) or i.participantes && v_pessoas)
     and x.p = any (v_pessoas)
     and not (p_ignorar is not null and i.id = p_ignorar and i.owner_id = auth.uid())
     and i.inicio_dia <= v_ate_dia + 1
     and i.fim_dia >= v_de_dia - 2
     and t.v_ini < p_ate
     and t.v_fim > p_de
   order by 1, 2, 3;
end
$f$;

comment on function public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid) is
  'Livre/ocupado da agenda (decisão do Edson, 29/09/2026): só pessoa + intervalo + dia inteiro, nunca o conteúdo. Migração 016.';

-- O Supabase dá EXECUTE em toda função nova de public para anon, authenticated e service_role
-- (privilégio padrão) e o PostgreSQL dá para PUBLIC: tira de PUBLIC e do anon; a tela chama
-- como authenticated. (A service_role fica com o padrão do Supabase: sem crachá, auth.uid() é
-- nulo e a própria função recusa com 42501.)
revoke all on function public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid) to authenticated;

-- RPC nova só aparece na API com 'reload schema'.
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- Conferência (rodar depois):
--   select pg_get_function_result('public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid)'::regprocedure);
--     -- TABLE(pessoa uuid, inicio timestamp with time zone, fim timestamp with time zone, dia_inteiro boolean)
--   select has_function_privilege('anon', 'public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid)', 'EXECUTE') as anon,
--          has_function_privilege('authenticated', 'public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid)', 'EXECUTE') as logado;
--     -- false, true
--   select p.prosecdef as security_definer, p.provolatile as volatilidade, p.proconfig as config
--     from pg_proc p where p.oid = 'public.agenda_ocupado(uuid[], timestamptz, timestamptz, uuid)'::regprocedure;
--     -- true, s, {search_path=public}
--   select count(*) from pg_policies where tablename like 'agenda_%';   -- 5 (as da 012, intactas)
--   No SQL Editor (sem crachá) a chamada dá 42501 "Sem permissão…" — é o certo: só quem tem
--   agenda, logado no app, consulta.
-- ---------------------------------------------------------------------------
