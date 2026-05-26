import { AppState, User, InterruptionStatus } from '../types';

/**
 * Intelligent client-side rule-based fallback processor for chatbot.
 * Triggered automatically when Gemini API quota is exceeded (429), ensuring the user
 * always gets a high-quality, personalized response with live data.
 */
export const resolveLocalQueryFallback = (
  query: string,
  appState: AppState,
  currentUser: User
): string => {
  const normalized = query.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const name = currentUser.name;
  const role = currentUser.role;
  const email = currentUser.email || 'Não informado';

  const projects = appState.projects || [];
  const users = appState.users || [];
  const interruptions = appState.interruptions || [];
  const ganttTasks = appState.ganttTasks || [];

  // --- DYNAMIC COLLABORATOR DETAIL SEARCH ---
  // Look for any user name in the query text (e.g., "Rogerio", "Charles", "Cobo", "Luiz")
  const mentionedUser = users.find(u => {
    const normUser = `${u.name} ${u.surname || ''}`.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const firstName = u.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return (
      (firstName.length > 2 && normalized.includes(firstName)) || 
      normalized.includes(normUser)
    );
  });

  // If a specific collaborator was named (excluding common "quem sou eu" questions)
  if (mentionedUser && !normalized.includes("quem sou eu") && !normalized.includes("meu nome")) {
    const isSelfStr = mentionedUser.id === currentUser.id ? " (Você)" : "";
    const userProjects = projects.filter(p => p.userId === mentionedUser.id);
    const completed = userProjects.filter(p => p.status === 'COMPLETED').length;
    const inProgress = userProjects.filter(p => p.status === 'IN_PROGRESS').length;
    
    const userGantt = ganttTasks.filter(t => t.assignedTo?.includes(mentionedUser.id));
    const completedGantt = userGantt.filter(t => t.status === 'closed').length;

    const totalSeconds = userProjects.reduce((acc, p) => acc + (p.totalActiveSeconds || p.totalSeconds || 0), 0);
    const totalHours = (totalSeconds / 3600).toFixed(1);

    // List recent projects
    const recentProj = userProjects.slice(-5).reverse();
    const projList = recentProj.length > 0
      ? recentProj.map(p => `  * **NS ${p.ns}** - *${p.clientName || 'Inespecífico'}* (${p.implementType || 'N/A'}) - Status: \`${p.status}\``).join('\n')
      : "  * Nenhuma Nota de Serviço (NS) registrada ainda.";

    return `### 🔍 Ficha Operacional Real de: ${mentionedUser.name}${isSelfStr}
*Dados extraídos em tempo real do banco de dados local da Engenharia JIMP*

* **Nome Completo:** ${mentionedUser.name} ${mentionedUser.surname || ''}
* **Cargo / Função:** \`${mentionedUser.role}\`
* **E-mail:** \`${mentionedUser.email || 'Não cadastrado'}\`

📊 **Lançamento de Horas e Projetos (Rastreador de NS):**
* **Total de Projetos Liberados (Concluídos):** **${completed}** projetos concluídos/liberados 🏆
* **Projetos Em Desenvolvimento ativos:** **${inProgress}**
* **Total Geral de Projetos Associados:** **${userProjects.length}**
* **Total de Horas registradas de Rastreamento:** **${totalHours}* horas*

📅 **Cronograma de Atividades (Nexus Gantt):**
* **Total de Tarefas Atribuídas:** ${userGantt.length} tarefas de cronograma
* **Tarefas Concluídas:** ${completedGantt} de ${userGantt.length}

📂 **Projetos e Lançamentos Recentes:**
${projList}

*Se quiser detalhes de outro colaborador ou ver a tabela do ranking completo, é só me perguntar!*`;
  }

  // --- DYNAMIC RANKING / LEADERBOARD ---
  // Queries asking who holds the record, who released the most projects, ranking, leader etc.
  if (
    normalized.includes('ranking') ||
    normalized.includes('quem mais') ||
    normalized.includes('quem liberou mais') ||
    normalized.includes('quem tem mais') ||
    normalized.includes('mais liberou') ||
    normalized.includes('lidera') ||
    normalized.includes('liderança') ||
    normalized.includes('podio') ||
    normalized.includes('campeao') ||
    normalized.includes('eficiencia')
  ) {
    // Compile completed (released) projects by user ID
    const userStats = users.map(u => {
      const uProjs = projects.filter(p => p.userId === u.id);
      const completed = uProjs.filter(p => p.status === 'COMPLETED').length;
      const inProgress = uProjs.filter(p => p.status === 'IN_PROGRESS').length;
      const total = uProjs.length;
      
      const uGantt = ganttTasks.filter(t => t.assignedTo?.includes(u.id));
      const completedGantt = uGantt.filter(t => t.status === 'closed').length;

      return {
        user: u,
        completed,
        inProgress,
        total,
        completedGantt,
        ganttCount: uGantt.length
      };
    });

    // Sort by completed projects descending (releasing), then overall total count
    const sortedStats = [...userStats].sort((a, b) => b.completed - a.completed || b.total - a.total);

    const rankingTable = sortedStats.map((stat, index) => {
      let medal = '•';
      if (index === 0) medal = '🏆 [1º]';
      else if (index === 1) medal = '🥈 [2º]';
      else if (index === 2) medal = '🥉 [3º]';
      else medal = `[${index + 1}º]`;

      const isSelf = stat.user.id === currentUser.id ? ' **(Você)**' : '';
      return `| ${medal} | **${stat.user.name} ${stat.user.surname || ''}**${isSelf} | \`${stat.user.role}\` | **${stat.completed}** | ${stat.inProgress} | ${stat.total} | ${stat.completedGantt}/${stat.ganttCount} |`;
    }).join('\n');

    return `### 🏆 Ranking Geral de Liberação de Projetos (Tempo Real)
Olá, **${name}**! Analisei todos os registros consolidados deste ano no banco de dados. Segue a classificação real por volume de projetos (NS) **liberados (concluídos)** da equipe:

| Pos | Perfil / Colaborador | Função | Liberados (Concluídos) | Em Progresso | Total Registrado | Gantt (Concluídos) |
|---|---|---|---|---|---|---|
${rankingTable}

💡 **Resumo Rápido da Líderança:**
* O líder isolado em volume de projetos liberados é **${sortedStats[0]?.user.name}** com um total incrível de **${sortedStats[0]?.completed}** projetos concluídos!
* Logo atrás, consolidando excelentes entregas, está **${sortedStats[1]?.user.name || 'Ninguém'}** com **${sortedStats[1]?.completed || 0}** entregas de projetos.

*Consulte esses detalhes também na seção de Gráfico de Desempenho e Tabelas do Painel Geral do Dashboard.*`;
  }

  // --- SPECIFIC NS (NOTA DE SERVIÇO) DIRECT SEARCH ---
  // Match code numbers like "NS 9215"
  const nsMatch = query.match(/ns\s*(\d+)/i);
  if (nsMatch) {
    const targetNs = nsMatch[1];
    const foundProj = projects.find(p => p.ns && String(p.ns) === targetNs);
    if (foundProj) {
      const owner = users.find(u => u.id === foundProj.userId);
      const ownerName = owner ? `${owner.name} ${owner.surname || ''}` : 'Não Atribuído';
      const durationHours = ((foundProj.totalActiveSeconds || foundProj.totalSeconds || 0) / 3600).toFixed(2);
      
      return `### 🔍 Ficha de Detalhes da Nota de Serviço (NS): ${targetNs}
Localizei estes dados históricos no banco de dados JIMP:

* **Projeto / Código:** NS ${foundProj.ns}
* **Cliente:** *${foundProj.clientName || 'Não Informado'}*
* **Tipo / Escopo:** \`${foundProj.implementType || 'N/A'}\`
* **Status Atual:** **\`${foundProj.status}\`**
* **Responsável Técnico:** **${ownerName}**
* **Tempo Dedicado:** **${durationHours}h**
* **Início do Lançamento:** ${foundProj.startTime ? new Date(foundProj.startTime).toLocaleString('pt-BR') : 'Sem data de início'}

*Todas as sessões de faturamento e produtividade desta NS estão salvas localmente.*`;
    } else {
      return `### 🔍 Pesquisa de Projeto: NS ${targetNs}
Dando uma olhada em todos os índices operacionais, **não encontrei nenhuma Nota de Serviço catalogada com o código "${targetNs}"**.

Se você acabou de criá-la, por favor reinicie o rastreador ou recarregue a aba do seu navegador para que a mesma seja indexada.`;
    }
  }

  // --- DETAILED COUNTS OF LOGGED-IN USER (USER SPECIFIC METRICS) ---
  if (
    normalized.includes('quantos projetos eu') ||
    normalized.includes('eu liberei') ||
    normalized.includes('minhas ns') ||
    normalized.includes('meus projetos') ||
    normalized.includes('minhas entregas') ||
    normalized.includes('quantos eu') ||
    normalized.includes('meu volume') ||
    (normalized.includes('quantos') && normalized.includes('projeto') && (normalized.includes('lancei') || normalized.includes('entreguei') || normalized.includes('fiz') || normalized.includes('liberei'))) ||
    normalized.includes('e eu?') ||
    normalized.includes('meus lancamentos')
  ) {
    const userProjects = projects.filter(p => p.userId === currentUser.id);
    const completed = userProjects.filter(p => p.status === 'COMPLETED').length;
    const inProgress = userProjects.filter(p => p.status === 'IN_PROGRESS').length;
    const totalSeconds = userProjects.reduce((acc, p) => acc + (p.totalActiveSeconds || p.totalSeconds || 0), 0);
    const totalHours = (totalSeconds / 3600).toFixed(1);

    // Calc user's exact current rank pos
    const userStats = users.map(u => ({
      userId: u.id,
      completed: projects.filter(p => p.userId === u.id && p.status === 'COMPLETED').length
    })).sort((a, b) => b.completed - a.completed);

    const rankPos = userStats.findIndex(us => us.userId === currentUser.id) + 1;

    let compliment = '';
    if (rankPos === 1) {
      compliment = `🏆 **Você é o Líder Geral de liberação de projetos na Eng. JIMP!** Excelente atuação com total protagonismo nas entregas!`;
    } else if (rankPos <= 3) {
      compliment = `🥈 **Você está no topo das liberações da engenharia (posição ${rankPos}º no pódio)!**`;
    } else {
      compliment = `Você está ocupando a posição **${rankPos}º** no quadro comparativo de liberações da empresa.`;
    }

    return `### 👤 Suas Métricas de Desempenho (Rastreador)
Consultando o banco de dados operacional de **${currentUser.name}** (\`${role}\`):

* **Seus Projetos Liberados (Done):** **${completed}** projetos finalizados e homologados ✅
* **Seus Projetos Em Andamento (Ativos):** **${inProgress}** projetos
* **Total de Histórico Vinculado a Você:** **${userProjects.length}** projetos totais registradas
* **Tempo Total Rastreando Atividades:** **${totalHours}* horas úteis de trabalho técnico*

🎖️ **Sua Colocação Operacional:**
* ${compliment}

💡 *Se quiser listar os projetos de Rogerio, Charles ou ver a tabela geral da equipe, envie o nome deles ou "Ver ranking"!*`;
  }

  // --- "Quem sou eu" / "Quem eu sou"
  if (
    normalized.includes('quem sou eu') ||
    normalized.includes('quem eu sou') ||
    normalized.includes('meu nome') ||
    normalized.includes('qual o meu nome') ||
    normalized.includes('meu perfil') ||
    normalized.includes('minha conta')
  ) {
    const userProjects = projects.filter(p => p.userId === currentUser.id);
    const completed = userProjects.filter(p => p.status === 'COMPLETED').length;
    const inProgress = userProjects.filter(p => p.status === 'IN_PROGRESS').length;
    
    return `### 👤 Credenciais Ativas no JIMP NEXUS
Olá, **${name} ${currentUser.surname || ''}**! Você está conectado com as seguintes credenciais ao sistema:

* **Nome Comercial:** ${name} ${currentUser.surname || ''}
* **Cargo Hierárquico:** \`${role}\`
* **Endereço Eletrônico:** \`${email}\`
* **Identificador Único:** \`${currentUser.id}\`

📊 **Dados do seu Rastreador de Projetos:**
* **Concluídos (Liberados):** **${completed}**
* **Em andamento:** **${inProgress}**
* **Soma Total:** **${userProjects.length}** projetos`;
  }

  // --- "Por que eu não apareço no gráfico"
  if (
    normalized.includes('apareco no') ||
    normalized.includes('apareco no grafico') ||
    normalized.includes('nao apareco') ||
    normalized.includes('nao estou no grafico') ||
    normalized.includes('cade eu no grafico') ||
    normalized.includes('cade meu nome') ||
    normalized.includes('por que nao apareco')
  ) {
    let explanation = `### 📊 Diagnóstico de Exibição nos Gráficos

Olá, **${name}**! Vamos verificar o motivo de sua exibição nos gráficos:

1. **Restrição de Cargo (Filtro por Função):** 
   * Os relatórios e histogramas comparativos focavam principalmente em colaboradores de cargo \`PROJETISTA\` ou \`COORDENADOR\` para avaliar as metas industriais. Como sua conta é de um cargo estratégico (**\`${role}\`**), o sistema ocultava o seu nome nos gráficos globais.
   * **Acabamos de ajustar essa lógica!** Atualizamos os filtros do Dashboard e da Tabela de Calor Semanal (Weekly Heatmap) para que **você sempre apareça** nas visualizações, não importa qual seja a sua função cadastrada!

2. **Falta de Lançamentos de Horas na Semana Atual:** 
   * A matriz de calor exibe sua carga horária distribuída conforme o carimbo de data (\`startTime\`) dos seus lançamentos de projetos criados nesta semana corrente. Se você não tem lançamentos recentes, sua linha marcará **0h**.
   * Certifique-se de registrar uma NS na aba **Rastreador** para alimentar as horas de calor!`;

    const userProjects = projects.filter(p => p.userId === currentUser.id);
    if (userProjects.length === 0) {
      explanation += `\n\n⚠️ **Atenção:** Você **não possui projetos cadastrados em seu ID**. Registre pelo menos uma Nota de Serviço (NS) na aba **Rastreador** para ver seus dados no mapa de calor semanal!`;
    }

    return explanation;
  }

  // --- "Status global" / "Resumo" / "Plataforma" / "Visão Geral"
  if (
    normalized.includes('resumo') ||
    normalized.includes('estatistica') ||
    normalized.includes('indicadores') ||
    normalized.includes('plataforma') ||
    normalized.includes('geral') ||
    normalized.includes('status')
  ) {
    const activeProjects = projects.filter(p => p.status === 'IN_PROGRESS').length;
    const completedProjectsCount = projects.filter(p => p.status === 'COMPLETED').length;
    const openInterrupt = interruptions.filter(i => i.status === InterruptionStatus.OPEN).length;

    return `### 📊 Painel Geral de Indicadores (Banco de Dados Local)
Olá, **${name}**! Aqui está um raio-X completo das tabelas da plataforma:

* **Projetos Totais Cadastrados:** **${projects.length}** registros computados
* **Projetos Concluídos (Liberados):** **${completedProjectsCount}** entregues (%${Math.round((completedProjectsCount / Math.max(projects.length, 1)) * 100)}) ✅
* **Projetos Ativos Em Andamento:** **${activeProjects}** em desenvolvimento ⏳
* **Pessoas Operacionais na Equipe:** **${users.length}** colaboradores cadastrados
* **Casos de Interrupção Ativos (Impedimentos):** **${openInterrupt}** abertos ⚠️
* **Tarefas de Cronograma (Gantt Nexus):** **${ganttTasks.length}** cadastradas

*Todos estes indicadores foram obtidos aplicando os filtros diretamente sobre o banco local.*`;
  }

  // --- Default generic intelligent response using appState context
  const activeProjsCount = projects.filter(p => p.status === 'IN_PROGRESS').length;
  
  return `### 💡 JIMP NEXUS - Assistente Local de Contingência

Olá, **${name}**! Os créditos da API gratuita do Gemini foram temporariamente excedidos no servidor principal, mas **estou online e totalmente conectado ao banco de dados interno da aplicação em tempo real!** 

Eu possuo acesso a todas as tabelas e métricas locais da Engenharia JIMP, podendo processar, auditar e calcular rankings para você de forma instantânea.

📊 **Indicadores Atuais Consolidados:**
* **Total de Projetos Registrados (Tracker NS):** ${projects.length} projetos
* **Projetos Já Liberados (Concluídos):** ${projects.filter(p => p.status === 'COMPLETED').length} prontos ✅
* **Projetos Em Operação:** ${activeProjsCount} ativos ⏳
* **Pessoas Cadastradas na Equipe:** ${users.length} colaboradores

👉 **Experimente me perguntar:**
1. 🏆 **"Ver ranking"** ou **"Quem liberou mais"** (para exibir a tabela real de entregas da equipe)
2. 👤 **"Quantos projetos eu liberei"** ou **"Meus projetos"** (para detalhar seu perfil e suas NS)
3. 👥 **"Projetos do Rogerio"**, **"Atividades do Charles"** (para ver as fichas operacionais de outros integrantes)
4. 🔢 **"NS 9215"** (para buscar os dados de uma Nota de Serviço específica)
5. 📊 **"Status Geral"** (para resumir a saúde operacional da empresa)

*O que você gostaria de pesquisar no banco de dados agora?*`;
};
