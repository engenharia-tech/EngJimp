-- =====================================================================================================
-- 019 — Salário fora do Log de Auditoria (30/09/2026)
--
-- Antes: ao mudar um salário na tela de Equipe, o app gravava no log
--   Salário (ex: "R$ 1.234,56", novo: "R$ 2.345,67")
-- e, ao criar usuário, "[Cargo: X, Salário: R$ 1.234,56]". O Log de Auditoria é lido por GESTOR, CEO e
-- COORDENADOR (migração 011) — ou seja, salário vazava pelo log. A regra é: salário, SÓ o Edson.
-- Agora: o código de 30/09 grava só "Salário (alterado)" e não põe salário na criação (e a tela limpa
--   os mesmos dois formatos na cópia que o navegador guarda); ESTE arquivo tira os valores dos
--   registros antigos do banco, trocando pelo mesmo texto. Nada mais do registro muda (quem, quando, o
--   que mais foi alterado). Só registros de USUÁRIO (entity_type = 'USER'), e a troca da criação só vale
--   dentro de "[Cargo: …, Salário: …]" — texto digitado em outro campo não é cortado.
--   Decisão do Edson, 30/09: "Corrigir e limpar o antigo".
-- Ordem: rodar DEPOIS de o código novo estar no ar e de o Edson dar Ctrl+Shift+R (uma aba com o pacote
--   antigo voltaria a gravar o valor). Se a 1ª coluna da conferência voltar > 0 mais tarde, rodar de novo;
--   se CONTINUAR > 0, é registro de outra entidade com esse formato (não é limpo aqui): chamar o Claude.
-- A conferência mostra SÓ CONTAGENS — nunca um valor.
-- Pode rodar de novo (na 2ª vez não acha nada para limpar).
-- Sem desfazer: os valores apagados não voltam (é o objetivo). A cópia de segurança de 30/09 07:26 os tem.
-- =====================================================================================================

update public.audit_logs
   set details = regexp_replace(
                   regexp_replace(details, 'Salário \(ex: "[^"]*", novo: "[^"]*"\)', 'Salário (alterado)', 'g'),
                   '(\[Cargo: [^,\]]*), Salário: [^\]]*\]', '\1]', 'g')
 where entity_type = 'USER'
   and (details ~ 'Salário \(ex: "[^"]*", novo: "[^"]*"\)'
        or details ~ '\[Cargo: [^,\]]*, Salário: [^\]]*\]');

-- Conferência (só lê; só contagens). Esperado: 0 · 0 · (quantos passaram a dizer "Salário (alterado)").
--   1ª: o formato do app em QUALQUER registro (tem de ser 0);
--   2ª: nos registros de usuário, "salário" seguido de número em qualquer formato (0 é o esperado; se não
--       for, pode ser texto sem valor, como um login "salario2" — só o Edson olha essas linhas).
select
  (select count(*) from public.audit_logs
    where details ~ 'Salário \(ex: "[^"]*", novo: "[^"]*"\)'
       or details ~ '\[Cargo: [^,\]]*, Salário: [^\]]*\]') as com_valor_no_formato_do_app,
  (select count(*) from public.audit_logs
    where entity_type = 'USER' and details ~* '(sal[aá]rio|salary)[^,;\]\)]{0,25}[0-9]') as salario_seguido_de_numero,
  (select count(*) from public.audit_logs
    where details like '%Salário (alterado)%') as dizem_salario_alterado;
