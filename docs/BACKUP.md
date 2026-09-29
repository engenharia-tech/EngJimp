# Cópia de segurança do banco (KPI de Engenharia)

> Escrito em 29/09/2026. Pedido do Edson no mesmo dia ("sim" para a cópia automática).
> O arquivo que faz a cópia é `.github/workflows/backup-banco.yml`.

## 1. O que é, em uma frase

Todo **domingo às 3h da manhã** (horário de Joinville), o GitHub copia o banco inteiro do KPI
(o Supabase "KPI Jimp"), **tranca a cópia com uma senha** e guarda o arquivo trancado por **90 dias**.

Por que precisa: o plano gratuito do Supabase **não faz cópia nenhuma**. No painel dele aparece
"Last backup: No backups". Se alguém apagar dados por engano, ou o projeto tiver problema, hoje não
há de onde voltar.

O que vai na cópia: **tudo o que está no banco**. Usuários (com salários e senhas), projetos,
atividades, OKR, agenda, auditoria, e também a "planta" do banco: tabelas, regras de acesso,
gatilhos e funções. Por isso a cópia sai **criptografada** (AES-256). Sem a senha, o arquivo é lixo.

## 2. Onde as cópias ficam

- No GitHub, no próprio repositório do KPI (`engenharia-tech/EngJimp`), aba **Actions**.
  Cada domingo aparece uma execução "Cópia de segurança do banco". Dentro dela, lá embaixo, em
  **Artifacts**, fica o arquivo `backup-kpi-AAAA-MM-DD_HHMMUTC`.
- Cada cópia fica **90 dias** e depois o GitHub apaga sozinho. Na prática, você tem sempre as
  últimas ~13 semanas.
- Quem pode baixar: quem tem acesso ao repositório no GitHub. Baixar não basta: **sem a senha
  (BACKUP_SENHA) o arquivo não abre**.
- Nada em texto claro sai da máquina do GitHub. O programa copia, tranca, **abre de novo para
  conferir** e só então guarda o arquivo trancado. O que estava aberto é apagado.

## 3. Quanto custa

Nada. Cabe folgado no plano gratuito do GitHub (repositório privado):

| limite do GitHub Free | quanto a cópia usa |
|---|---|
| 2.000 minutos por mês | ~3 min por domingo = **~13 min/mês (menos de 1%)** |
| 500 MB para guardar arquivos | ~1 a 3 MB por cópia × 13 cópias = **~15 a 40 MB (3 a 8%)** |

No Supabase, cada cópia baixa uns poucos MB do banco: menos de 1% dos 5 GB de tráfego do mês.
Os limites do GitHub são da **conta inteira** (`engenharia-tech`). Se outros repositórios dessa conta
também rodarem Actions, os minutos e o espaço são somados.

## 4. Ligar a cópia (uma vez só)

A cópia fica **desligada** até os dois segredos existirem. Enquanto isso, todo domingo o GitHub só
confere, vê que faltam os segredos e termina **verde, com um aviso amarelo**. Nada fica vermelho e
nenhum e-mail de erro chega.

Ordem:

1. O Claude publica o arquivo da cópia (push, **com o seu OK**).
2. Você pega a string de conexão do banco no Supabase (passo 4.1).
3. Você inventa a senha da criptografia e guarda num lugar seguro (passo 4.3).
4. Você cola as duas no GitHub (passo 4.4).
5. Você roda a primeira cópia na mão e manda o print para o Claude conferir (passo 4.5).

O Claude **não digita senha nenhuma**. Os passos com senha são seus.

### 4.1 Pegar a string de conexão no Supabase

1. Entre em **supabase.com/dashboard** e abra o projeto **KPI Jimp**.
2. No alto da página, clique no botão **Connect**.
3. Na janela que abre, na aba **Connection String**:
   - **Type**: `URI`
   - **Source**: `Primary database`
   - **Method**: **`Session pooler`** (atenção: NÃO é "Direct connection" nem "Transaction pooler")
4. Aparece uma linha parecida com esta (o começo do endereço pode ser `aws-0` ou `aws-1`):

   ```
   postgresql://postgres.otajfsjtpucdmkwgmeku:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:5432/postgres
   ```

5. Copie a linha. O pedaço **`[YOUR-PASSWORD]`** (com os colchetes) vai ser trocado pela senha do
   banco no passo 4.4.

Por que o Session pooler: a "Direct connection" do Supabase só funciona por IPv6, e as máquinas do
GitHub não têm IPv6. O "Transaction pooler" (porta 6543) não serve para cópia. Se você colar uma
dessas por engano, a cópia avisa em vermelho e explica o que trocar.

### 4.2 Não sabe a senha do banco? Dá para trocar sem derrubar o app

A "senha do banco" é a senha do usuário `postgres`, que só é usada para **conexão direta** (programas
como este backup, DBeaver, pgAdmin).

**Conferido no código em 29/09/2026: o app do KPI NÃO usa essa senha.** O servidor (`api/index.ts`) fala
com o banco só pela API do Supabase, com a `SUPABASE_SERVICE_ROLE_KEY` e o crachá assinado com o
`SUPABASE_JWT_SECRET`. A tela usa a chave pública (anon). Não existe no projeto nenhum pacote de conexão
direta ao Postgres nem string de conexão. O disparador da Agenda (migração 013) roda **dentro** do
banco e também não usa essa senha. Trocar a senha do banco não mexe em nenhuma dessas chaves.

Para trocar:

1. No projeto **KPI Jimp**, menu da esquerda: **Database → Settings**. Em versões do painel, pode estar
   em **Project Settings (engrenagem) → Database**.
2. Na parte **Database password**, clique em **Reset database password**.
3. Clique em **Generate a password**, **copie a senha** e confirme em **Reset password**.
   - Se a senha gerada tiver símbolos (`@ : / ? # % [ ]`), gere outra, ou digite uma só com
     **letras e números** (20 ou mais). Símbolo na senha estraga a string de conexão.
4. Espere 1 ou 2 minutos antes de rodar a cópia (o Supabase leva um tempinho para espalhar a senha nova).

⚠ **Cuidados nesta tela:**
- Mexa **só** em "Database password". **NÃO** clique em nada de **JWT secret** nem de **API keys**.
  Isso sim derruba o app na hora: ninguém consegue entrar.
- Se algum programa no seu computador (DBeaver, pgAdmin) ou o rascunho do n8n de notificações
  (`app/n8n-kpi-notificacoes`, que até hoje não foi ligado) estiver configurado com a senha antiga do banco,
  ele vai precisar da nova. O app KPI em si continua funcionando.

### 4.3 Inventar a senha da criptografia (BACKUP_SENHA)

É a senha que tranca e destranca as cópias. Regras:

- **20 caracteres ou mais**, numa linha só. A rotina de cópia recusa menos de 16.
- Fácil de digitar e difícil de adivinhar. Exemplo de formato (não use este!):
  `ponte-caneca-trator-limao-4817`.
- Evite acento e espaço.

🔴 **Guarde essa senha fora do GitHub** (cofre de senhas, ou papel no cofre da empresa).
**Se ela se perder, NENHUMA cópia abre**, nem com ajuda do GitHub, do Supabase ou do Claude. Não
existe "esqueci a senha".

### 4.4 Colar os dois segredos no GitHub

Precisa de uma conta com acesso de **administrador** ao repositório (se a aba **Settings** não aparecer,
a conta não é administradora).

1. Abra **github.com/engenharia-tech/EngJimp**.
2. Clique na aba **Settings** (engrenagem, no alto, à direita das outras abas).
3. No menu da esquerda, em **Security**, clique em **Secrets and variables** e depois em **Actions**.
4. Na aba **Secrets**, clique no botão verde **New repository secret**.
5. Primeiro segredo:
   - **Name**: `SUPABASE_DB_URL`
   - **Secret**: cole a linha do passo 4.1 e **troque `[YOUR-PASSWORD]` pela senha do banco**.
     Os colchetes também saem. Fica assim (com a sua senha no lugar de `SENHA`):
     `postgresql://postgres.otajfsjtpucdmkwgmeku:SENHA@aws-0-us-west-2.pooler.supabase.com:5432/postgres`
   - Clique em **Add secret**.
6. Clique de novo em **New repository secret**. Segundo segredo:
   - **Name**: `BACKUP_SENHA`
   - **Secret**: a senha do passo 4.3
   - Clique em **Add secret**.

Dica: monte a string direto na caixa "Secret" do GitHub, ou no Bloco de Notas **sem salvar**
(feche e escolha "Não salvar"). Não mande essas senhas por e-mail, WhatsApp nem chat, nem para o Claude.

Depois de salvo, o GitHub não mostra mais o valor (só deixa trocar). É assim mesmo.

### 4.5 Rodar a primeira cópia na mão

1. No repositório, clique na aba **Actions**.
2. Na lista da esquerda, clique em **Cópia de segurança do banco**.
3. À direita aparece **Run workflow**. Clique nele, deixe `main` e clique no botão verde **Run workflow**.
4. Espere uns 3 minutos e atualize a página. Tem de aparecer um **✓ verde**.
5. Clique na execução. No resumo aparece "Cópia de segurança feita e conferida" e uma tabelinha:

   | tabela | linhas no banco | linhas na cópia |
   |---|---|---|
   | users | 30 | 30 |
   | … | … | … |

6. Lá embaixo, em **Artifacts**, está o arquivo `backup-kpi-…`.
7. **Mande um print para o Claude** conferir. A partir daí, a cópia roda sozinha todo domingo.

## 5. No dia a dia

- Não precisa fazer nada. Quer uma cópia extra antes de uma mudança grande? Use o
  **Run workflow** (passo 4.5).
- **Se uma cópia falhar**, o GitHub manda e-mail para quem publicou o arquivo da cópia, e a execução
  fica vermelha. No resumo dela aparece o motivo e uma lista de "O que costuma ser" (tabela da seção 8).
- O GitHub às vezes atrasa ou pula uma execução agendada quando está sobrecarregado. Se um domingo
  faltar, o próximo cobre. Se faltar mais de um, avise o Claude.

## 6. Baixar uma cópia e abrir

1. **Actions → Cópia de segurança do banco →** clique na execução do dia que você quer.
2. Em **Artifacts**, clique no nome `backup-kpi-…`. Baixa um `.zip`.
3. ⚠ Trabalhe numa pasta **fora do OneDrive**, por exemplo `C:\copia-kpi`. O arquivo aberto tem
   salários e senhas, e o OneDrive mandaria tudo aberto para a nuvem.
4. Descompacte o `.zip` (botão direito → Extrair tudo). Saem dois arquivos:
   `backup-kpi-….tar.gz.gpg` (a cópia trancada) e `….sha256` (a conferência).
5. Abra o **Git Bash** (menu Iniciar) e rode, trocando o nome do arquivo:

   ```bash
   cd /c/copia-kpi
   sha256sum -c backup-kpi-2026-10-04_0600UTC.tar.gz.gpg.sha256
   gpg --pinentry-mode loopback --output copia.tar.gz --decrypt backup-kpi-2026-10-04_0600UTC.tar.gz.gpg
   ```

   O primeiro comando tem de responder `OK`. O segundo pede a senha: digite a **BACKUP_SENHA** e Enter.

   Se o pedido de senha não aparecer, use este no lugar. A senha aparece na tela enquanto você
   digita: feche a janela depois.

   ```bash
   gpg --batch --pinentry-mode loopback --passphrase-fd 0 --output copia.tar.gz --decrypt backup-kpi-2026-10-04_0600UTC.tar.gz.gpg
   ```

6. Desempacote e confira:

   ```bash
   mkdir copia && tar -xzf copia.tar.gz -C copia && cd copia && sha256sum -c SHA256SUMS
   ```

   Todos os arquivos têm de dar `OK`. Dentro:

   | arquivo | o que é |
   |---|---|
   | `LEIA-ME.txt` | data, versão do banco, quantas linhas havia, comandos de restauração |
   | `roles.sql` | papéis (usuários do Postgres) criados no projeto, sem senhas |
   | `schema.sql` | a planta: tabelas, funções, regras de acesso (RLS), gatilhos, permissões |
   | `data.sql` | os dados de tudo o que dá para copiar (app, auth, agendamentos…) |
   | `data-public.sql` | só os dados do app (esquema `public`), para restaurar por cima |
   | `limpar-public.sql` | apaga as linhas das tabelas do app (só para restaurar por cima) |

7. Terminou? **Apague a pasta aberta** (`copia` e `copia.tar.gz`). O `.gpg` pode ficar guardado.

## 7. Restaurar

> Restaurar é raro e sério. **Chame o Claude junto**: ele confere cada passo com você.
> Precisa do `psql` 17 no seu computador: instalador do PostgreSQL 17 (postgresql.org → Download →
> Windows) marcando **só "Command Line Tools"**. Ele fica em
> `"/c/Program Files/PostgreSQL/17/bin/psql"`.

Antes de qualquer restauração: **faça uma cópia AGORA** (Run workflow, passo 4.5). Assim dá para
voltar atrás se a restauração não for o que você queria.

Os dois caminhos rodam **numa transação só** (`--single-transaction`): se der qualquer erro no meio,
o banco fica exatamente como estava. Nada fica pela metade.

### Caminho A — num projeto NOVO (recomendado: não mexe no atual)

Serve para: o projeto atual se perdeu, ou você quer ver os dados antigos sem mexer no que está no ar.

1. No Supabase, **New project** na mesma organização (o plano Free permite 2 projetos ativos).
   Nome, por exemplo, "KPI Jimp restaurado". Região `us-west-2` (Oregon). Anote a senha do banco
   que você escolher.
2. No projeto novo, pegue a string do **Session pooler** (passo 4.1) e troque `[YOUR-PASSWORD]`.
3. No Git Bash, dentro da pasta `copia` do passo 6:

   ```bash
   "/c/Program Files/PostgreSQL/17/bin/psql" \
     --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --file schema.sql \
     --command "SET session_replication_role = replica" \
     --file data.sql \
     --dbname "COLE_AQUI_A_STRING_DO_PROJETO_NOVO"
   ```

   Se der erro dizendo que o esquema `cron` ou `net` não existe: no projeto novo, **Database →
   Extensions**, ligue `pg_cron` e `pg_net` e rode o comando de novo.
4. Para o app passar a usar o projeto novo (**só com o Claude**): trocar na Vercel `SUPABASE_URL`,
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_JWT_SECRET`
   pelos do projeto novo e fazer **Redeploy**. Todo mundo precisa sair e entrar de novo.
   Rodar de novo a `013_agenda_disparador.sql` (o segredo do disparador fica guardado de um jeito que
   só o projeto antigo abre). Trocar o segredo `SUPABASE_DB_URL` no GitHub e o `PROJETO_REF` no
   `backup-banco.yml`.

### Caminho B — por cima, no MESMO projeto

🔴 **APAGA tudo o que foi gravado no app DEPOIS da cópia**: projetos, atividades, OKR, agenda,
usuários criados depois… **tudo volta a ser como era no dia da cópia.**

Serve para: alguém apagou ou estragou dados e você quer o banco inteiro de volta como estava.
(Para recuperar **uma coisa só**, por exemplo um projeto apagado, **não use isto**. O Claude tira da
cópia só o que precisa.)

1. Faça uma cópia AGORA (passo 4.5).
2. Avise a equipe para não usar o app durante a restauração.
3. Peça ao Claude para olhar a fila de e-mails da Agenda antes. Lembretes que estavam na fila no dia da
   cópia voltam para a fila e podem ser reenviados.
4. No Git Bash, dentro da pasta `copia`, com a string do projeto **KPI Jimp** (a mesma do segredo):

   ```bash
   "/c/Program Files/PostgreSQL/17/bin/psql" \
     --single-transaction --variable ON_ERROR_STOP=1 \
     --command "SET session_replication_role = replica" \
     --file limpar-public.sql \
     --file data-public.sql \
     --dbname "COLE_AQUI_A_STRING_DO_KPI_JIMP"
   ```

   Só mexe nas tabelas do app (esquema `public`). A planta do banco (regras, gatilhos) fica como está.
5. Todo mundo: **Ctrl+Shift+R** e entrar de novo.

Se a cópia não tiver o `data-public.sql` (o resumo daquele dia avisa), o Claude monta esse arquivo a
partir do `data.sql`.

### O que NÃO está na cópia

Nada disso mora no banco, então a cópia não traz: as **configurações do projeto** no Supabase (chaves
de API, JWT secret, configurações de Auth, restrições de rede), as **variáveis da Vercel**, o **código**
(esse já está no GitHub) e arquivos do Storage (o app não usa Storage).

## 8. Quando dá erro: o que diz e o que fazer

| aparece no GitHub | o que fazer |
|---|---|
| ⚠ amarelo "Cópia de segurança DESLIGADA — Faltam os segredos" | Passo 4.4. Enquanto não tiver os segredos, é esperado. |
| "ainda tem [YOUR-PASSWORD]" | Trocar `[YOUR-PASSWORD]` (com colchetes) pela senha do banco no segredo. |
| "conexão DIRETA" | Usar a string do **Session pooler** (passo 4.1). |
| "Transaction pooler (porta 6543)" | Usar a do **Session pooler** (porta 5432). |
| "não é do projeto KPI Jimp" | A string foi copiada de outro projeto. Pegar a do **KPI Jimp**. |
| "não parece uma string de conexão" | Colou errado, ou a senha do banco tem símbolo. Passo 4.2. |
| "tem espaço ou quebra de linha" | Recriar o segredo `SUPABASE_DB_URL` colando a string numa linha só. |
| "BACKUP_SENHA é curta demais" / "mais de uma linha" | Recriar o segredo com 20+ caracteres numa linha só. |
| "password authentication failed" | Senha do banco errada no segredo, ou acabou de ser trocada (esperar 2 min). |
| "server version mismatch" | O Supabase atualizou o Postgres. Chamar o Claude para ajustar o arquivo. |
| "timeout" / "could not connect" / "Network is unreachable" | Projeto pausado no Supabase, ou "Network Restrictions" ligado. |
| "…setup-cli… is not allowed to be used" | Settings → Actions → General → permitir as actions do Supabase (`supabase/setup-cli`). |
| "a conferência FALHOU" | A cópia foi feita mas não passou na conferência, e **nada foi guardado**. Mandar o print ao Claude. |
| A cópia não aparece em Actions | O arquivo ainda não foi publicado na `main`, ou Actions está desligado em Settings → Actions. |

## 9. Trocar a senha da criptografia

Troque o segredo `BACKUP_SENHA` (Settings → Secrets and variables → Actions → lápis ao lado dele).
As cópias **novas** usam a senha nova. As **antigas continuam com a senha antiga**: guarde a antiga
por mais 90 dias, até a última cópia feita com ela expirar.

## 10. Desligar

- Apagar os dois segredos: a cópia volta a só avisar (verde com aviso amarelo).
- Ou: **Actions → Cópia de segurança do banco → "…" (três pontinhos) → Disable workflow**.

---

## Para o Claude (detalhes técnicos)

- **Como copia:** Supabase CLI (`supabase/setup-cli@v1`, `version: latest`) com `supabase db dump`, que é
  o caminho documentado pelo próprio Supabase para backup em GitHub Actions. Foi escolhido em vez de
  instalar o `pg_dump` do PGDG na versão do servidor porque o dump "cru" do Postgres tropeça nos
  esquemas e papéis internos do Supabase (permissão em `pgsodium`/`vault`/`storage`, papéis reservados).
  O CLI já trata isso: exclui os esquemas gerenciados no esquema, filtra papéis reservados no
  `--role-only` e roda o `pg_dump` dentro da imagem `supabase/postgres` mais nova (17 hoje), que é igual
  ou mais nova que o servidor (projetos Supabase são 15 ou 17). Um `pg_dump` mais novo lê servidor
  mais velho. O contrário dá "server version mismatch", e isso quebra em vermelho com mensagem clara.
- **Versão do servidor:** o passo "Ver a versão do banco" roda `select version()` pelo `psql` do runner
  (PostgreSQL 16 do ubuntu-24.04; instala `postgresql-client` se faltar), grava no `LEIA-ME.txt` e
  conta as linhas de `users`/`okr_state`/`agenda_item` para comparar com a cópia. Também avisa se o
  banco estiver em somente leitura (`default_transaction_read_only = on`, o sinal dos 500 MB do Free).
- **Arquivos:** `roles.sql` (`--role-only`), `schema.sql`, `data.sql` (`--data-only --use-copy`),
  `data-public.sql` (`--schema public`; opcional: se falhar, só avisa) + `limpar-public.sql` +
  `LEIA-ME.txt` + `SHA256SUMS`, num `.tar.gz`.
- **Cifra:** `gpg --symmetric --cipher-algo AES256`, s2k modo 3 SHA-512 com 65.011.712 iterações,
  `--no-symkey-cache`, GNUPGHOME temporário. A senha vai por `--passphrase-fd 3` a partir de
  `<(printf '%s' "$senha")` (printf é builtin: não aparece em `ps` nem no log). Formato RFC 4880
  (SEIPD v1 com MDC, não AEAD): abre em qualquer gpg 2.x e no Gpg4win/Kleopatra. Espaços e quebras de
  linha no começo/fim do segredo são ignorados (é o que a pessoa digita ao abrir).
- **Conferência antes de guardar:** saída só com `.gpg` + `.sha256`; primeiro byte OpenPGP (0x8c/0xc3);
  nenhum `CREATE TABLE`/`COPY public`/`INSERT INTO` legível no `.gpg`; decifra com GNUPGHOME novo
  (`DECRYPTION_OKAY`, `GOODMDC`, `DECRYPTION_INFO … 9` = AES-256); o `.tar.gz` decifrado é idêntico
  byte a byte; `SHA256SUMS` confere; `CREATE TABLE` de `users`, `okr_state` e `agenda_item` no esquema;
  bloco `COPY` das três no `data.sql`; `users` com ao menos 1 linha.
- **Log:** segredos só no `env:` dos passos que usam; nenhum `${{ }}` dentro de script; a string inteira
  o GitHub mascara, e o passo 1 mascara também a senha do banco sozinha (crua e decodificada) e a
  BACKUP_SENHA sem os espaços. Sem `set -x`.
- **Sem segredo:** o passo 1 escreve `::warning` + resumo, `ok=false`, `exit 0`. Todos os outros passos
  têm `if: steps.segredos.outputs.ok == 'true'`. Segredo presente e errado: `exit 1` com a mensagem certa,
  antes de tocar no banco.
- **Provado em bancada local em 29/09/2026** (sem rede, sem GitHub e sem banco real): os passos `run:`
  reais do YAML rodaram em 25 cenários, 353 conferências. O CLI e o `psql` eram falsos, com dump gerado
  no PGlite a partir da `012_agenda.sql` real. Os cenários: sem segredo; 9 segredos errados; caminho feliz
  com a abertura "como o Edson"; 5 mutantes que a conferência pegou (cifra corrompida, outra senha,
  sem cifra, esquema sem `agenda_item`, `users` vazio); falhas do CLI; contagem divergente; somente
  leitura. A validação do YAML foi feita com 2 parsers mais regras do Actions mais `bash -n`: 13 de 13
  defeitos plantados foram pegos (não havia `actionlint` na máquina). O caminho B da restauração foi
  provado no PGlite com os arquivos tirados do artifact cifrado: 16 de 16. O que NÃO dá para provar
  fora do GitHub (o CLI de verdade contra o Supabase, a imagem Docker, o upload): a primeira execução
  manual (4.5) é o teste.
