-- =====================================================================================================
-- 018 — Paulo e Julio lançam e editam o OKR de TODOS (marca "admin de OKR") — 30/09/2026
--
-- Pedido do Paulo e do Julio (lançar no OKR dos outros e ligar cada OKR ao planejamento). Decisão do
-- Edson, 30/09: "O Paulo e o Julio lançarem no OKR dos outros"; perguntado se isso inclui o OKR DELE e
-- a Governança do ciclo (que moram na linha 'edson'): "Sim, igual ao Nascimento".
--
-- Antes: o CEO só LIA o OKR de todos; editavam o de todos o Edson e o admin de OKR (Nascimento).
-- Agora: Paulo e Julio (cargo CEO) ganham a mesma marca do Nascimento, users.okr_admin = true — os DOIS
--   no mesmo comando. Passam a editar o OKR de todos, arrastar prazos na Linha do tempo, editar a
--   Governança e o cadastro de Executores.
-- NÃO muda: a agenda dos outros (SÓ o Edson, pelo id — agenda_e_edson, 012), salário (só o Edson),
--   a engenharia/dashboard do CEO, cargo, "somente OKR", visualizador, senha e e-mail. Só a coluna
--   okr_admin dos dois.
-- Junto, no código de 30/09 (a outra metade da decisão, "fechar as portas extras"): "Gerar link novo"
--   do painel de Indicadores passa a ser SÓ do Edson, e marcar alguém como "só visualização" / ADM
--   Externo passa a exigir o Edson ou um GESTOR admin de OKR (um CEO admin de OKR não rebaixa ninguém).
-- Trava: só grava se achar EXATAMENTE 2 pessoas (logins paulo e julio, cargo CEO, não visualizador, não
--   o Edson). Outro número = erro e NADA é gravado.
-- Depois: Paulo e Julio precisam SAIR e ENTRAR de novo no app (F5 não basta: a tela só aprende a marca
--   no login) + Ctrl+Shift+R. O banco obedece na hora.
-- Desfazer:
--   update public.users set okr_admin = false
--    where lower(trim(username)) in ('paulo', 'julio') and role = 'CEO';
-- =====================================================================================================

do $$
declare n int;
begin
  update public.users
     set okr_admin = true
   where lower(trim(username)) in ('paulo', 'julio')
     and role = 'CEO'
     and id <> '1e570c78-7278-4e8d-a90e-a820c11bb07a'::uuid
     and not coalesce(okr_viewer, false);
  get diagnostics n = row_count;
  if n <> 2 then
    raise exception 'OKR 018: esperava 2 usuários (Paulo e Julio, cargo CEO), achei %. Nada foi gravado.', n;
  end if;
end
$$;

-- Conferência (só lê). Esperado: Nascimento, Paulo e julio com okr_admin = true; Paulo e julio com
-- cargo CEO, okr_only false e okr_viewer false.
select username,
       trim(coalesce(name, '') || ' ' || coalesce(surname, '')) as nome,
       role as cargo, okr_enabled, okr_only, okr_viewer, okr_admin
  from public.users
 where coalesce(okr_admin, false) or lower(trim(username)) in ('paulo', 'julio')
 order by okr_admin desc nulls last, lower(username);
