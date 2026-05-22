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
  const normalized = query.toLowerCase().trim();
  const name = currentUser.name;
  const role = currentUser.role;
  const email = currentUser.email || 'Não informado';

  // 1. "Quem sou eu" / "Quem eu sou"
  if (
    normalized.includes('quem sou eu') ||
    normalized.includes('quem eu sou') ||
    normalized.includes('meu nome') ||
    normalized.includes('qual o meu nome') ||
    normalized.includes('meu perfil') ||
    normalized.includes('minha conta')
  ) {
    const userProjects = appState.projects.filter(p => p.userId === currentUser.id);
    const completed = userProjects.filter(p => p.status === 'COMPLETED').length;
    const inProgress = userProjects.filter(p => p.status === 'IN_PROGRESS').length;
    
    return `### 👤 Seu perfil no JIMP NEXUS
Olá, **${name} ${currentUser.surname || ''}**! Eu sei exatamente quem você é, pois estou conectado aos seus dados em tempo real.

Aqui estão suas credenciais e informações atuais no sistema:
* **Nome de exibição:** ${name} ${currentUser.surname || ''}
* **Cargo / Função:** \`${role}\`
* **Endereço de E-mail:** \`${email}\`
* **ID do Usuário:** \`${currentUser.id}\`

📊 **Seu Progresso de Trabalho (Rastreador):**
* Você possui **${userProjects.length}** projetos totais vinculados ao seu ID.
* **${completed}** projetos já foram concluídos.
* **${inProgress}** projetos estão atualmente em andamento.

*Como eu tenho acesso direto ao estado da aplicação, você pode me perguntar sobre seus projetos, estatísticas ou por que você não aparece em algum gráfico!*`;
  }

  // 2. "Por que eu não apareço no gráfico" / "Não apareço no gráfico"
  if (
    normalized.includes('apareço no') ||
    normalized.includes('apareço no grafico') ||
    normalized.includes('não apareço') ||
    normalized.includes('não estou no gráfico') ||
    normalized.includes('cadê eu no gráfico') ||
    normalized.includes('cadê meu nome') ||
    normalized.includes('por que não apareço')
  ) {
    let explanation = `### 📊 Por que você pode não aparecer em alguns gráficos?

Olá, **${name}**! Vamos verificar o motivo de sua exibição nos gráficos:

1. **Restrição de Cargo (Filtro por Função):** 
   * Historicamente, os gráficos de desempenho e o *Filtro de Projetistas* priorizavam exibir apenas usuários com a função de \`PROJETISTA\` ou \`COORDENADOR\` para manter a visualização focada no desenvolvimento de engenharia de projetos. Como seu cargo cadastrado é de **\`${role}\`**, o sistema costumava omitir o seu nome para filtros globais.
   * **Acabamos de ajustar essa lógica!** Forçamos o sistema a **sempre incluir você (o usuário logado atualmente)** na tabela de calor semanal (Weekly Heatmap) e no seletor de projetistas do painel principal, independentemente do cargo.

2. **Falta de Lançamentos ou Registro de Horas:** 
   * A matriz de calor semanal exibe horas ativas registradas nos projetos do **Rastreador de NS**. Se você não iniciou ou salvou nenhuma atividade de projeto nesta semana atual, sua linha aparecerá com **0h** ou poderá ficar oculta se filtros específicos de tempo estiverem aplicados.
   * Certifique-se de iniciar um projeto no menu **Rastreador** ou adicionar atividades no cronograma **Nexus** para gerar dados visíveis.

3. **Filtros Ativos do Painel:**
   * Verifique se no cabeçalho do Dashboard há algum filtro de data, cliente ou categoria selecionado que oculte seus registros atuais.`;

    const userProjects = appState.projects.filter(p => p.userId === currentUser.id);
    if (userProjects.length === 0) {
      explanation += `\n\n⚠️ **Nota:** Detectamos que você **não possui nenhum projeto** associado ao seu ID de usuário. Vá para a aba **RASTREADOR** (ou use o botão de Nova Atividade) e registre pelo menos uma sessão de trabalho de teste para começar a alimentar os gráficos!`;
    } else {
      explanation += `\n\n✅ **Detectado:** Você já tem **${userProjects.length}** registros de projeto. Certifique-se de escolher seu nome no filtro do Dashboard ou usar a aba **Histórico** para ver suas sessões ativas de trabalho!`;
    }

    return explanation;
  }

  // 3. "Minhas NS" / "Meus projetos"
  if (
    normalized.includes('meus projetos') ||
    normalized.includes('minhas ns') ||
    normalized.includes('minhas atividades') ||
    normalized.includes('meu trabalho') ||
    normalized.includes('projeto') && (normalized.includes('meu') || normalized.includes('meus') || normalized.includes('lancei'))
  ) {
    const userProjects = appState.projects.filter(p => p.userId === currentUser.id);
    if (userProjects.length === 0) {
      return `### 📁 Seus Projetos (Rastreador de NS)
Olá, **${name}**! Pesquisei no banco de dados local e **não encontrei nenhum projeto de NS** registrado diretamente no seu ID.

Para começar:
1. Clique no menu lateral na opção **RASTREADOR**.
2. Preencha o formulário e clique em **Iniciar Rastreamento de NS**.
3. Deixe o cronômetro rodar e conclua-o para registrar suas horas de trabalho!`;
    }

    const recent = userProjects.slice(-5).reverse();
    const listHtml = recent.map(p => {
      const durationHours = ((p.totalActiveSeconds || p.totalSeconds || 0) / 3600).toFixed(2);
      const emoji = p.status === 'COMPLETED' ? '✅' : '⏳';
      return `* **NS ${p.ns}** - *${p.clientName || 'Sem Cliente'}* (${p.implementType || 'N/A'}) - **${durationHours}h** [${emoji} ${p.status}]`;
    }).join('\n');

    return `### 📁 Seus Projetos Recentes (${currentUser.name})
Encontrei um total de **${userProjects.length}** projetos registrados para você. Aqui estão os **5 mais recentes**:

${listHtml}

💡 *Caso queira ver o relatório completo de todos os seus projetos lançados, você pode navegar até a aba **HISTÓRICO DE PROJETOS**.*`;
  }

  // 4. "Status global" / "Resumo" / "Plataforma" / "Visão Geral"
  if (
    normalized.includes('resumo') ||
    normalized.includes('estatística') ||
    normalized.includes('indicadores') ||
    normalized.includes('plataforma') ||
    normalized.includes('geral') ||
    normalized.includes('status')
  ) {
    const activeProjects = appState.projects.filter(p => p.status === 'IN_PROGRESS').length;
    const openInterrupt = appState.interruptions.filter(i => i.status === InterruptionStatus.OPEN).length;
    const totalWorkers = appState.users.length;

    return `### 📊 Painel Geral de Indicadores (Modo Local)
Aqui está um resumo em tempo real do ecossistema **JIMPNEXUS**:

* **Projetos Totais (Rastreador):** ${appState.projects.length} registros
* **Projetos Ativos Em Andamento:** ${activeProjects} projetos
* **Interrupções / Impedimentos em Aberto:** ${openInterrupt} ocorrências ativas
* **Colaboradores Cadastrados:** ${totalWorkers} usuários ativos
* **Tarefas de Cronograma (Gantt Nexus):** ${appState.ganttTasks?.length || 0} tarefas planejadas

*Estes dados são gerados em tempo real a partir do estado ativo no seu navegador.*`;
  }

  // 5. Help with errors / API limits
  if (
    normalized.includes('erro') ||
    normalized.includes('quota') ||
    normalized.includes('cota') ||
    normalized.includes('limite') ||
    normalized.includes('resolva') ||
    normalized.includes('problema') ||
    normalized.includes('ajuda')
  ) {
    return `### 💡 Guia de Suporte & Solução de Problemas

Olá, **${name}**! Se você está enfrentando erros na plataforma ou limites de cota da inteligência artificial, aqui está um roteiro claro de como resolver:

1. ⚠️ **Limite de Cota do Gemini Excedido (Quota Exceeded):**
   * O plano padrão gratuito do Google AI Studio possui um limite diário de requisições por projeto (máximo de 20 requisições diárias para segurança). 
   * **Como resolver:** Você pode configurar uma chave de API própria e ilimitada do Gemini de forma gratuita! No canto superior do sistema, clique no menu de **Configurações (ícone de engrenagem)**, vá na aba **API Secrets**, crie uma chave e adicione-a como \`GEMINI_API_KEY\`. Isso isolará sua cota e rodará 100% livre de limites.
   * **Nossa Solução Inteligente:** Ativamos este canal de resposta local/offline em tempo real projetado para responder perguntas básicas sobre você, suas estatísticas e seus projetos sem fazer chamadas externas, poupando sua cota!

2. 🚀 **Sincronização e Logs:**
   * Certifique-se de que sua conexão com o banco de dados Supabase esteja verde.
   * Todos os seus lançamentos de horas de projetos no **Rastreador** e no **Nexus (Gantt)** estão salvos localmente e sob auditoria automática.

Se tiver alguma dúvida específica, pergunte usando termos como "quem sou eu", "meus projetos" ou "por que não apareço no gráfico" para receber as respostas instantâneas locais!`;
  }

  // Default generic intelligent response using appState context
  const activeProjsCount = appState.projects.filter(p => p.status === 'IN_PROGRESS').length;
  const currentHoursMsg = `Olá, **${name}**! 

*Observação: O limite de cota gratuito diário do servidor Gemini foi temporariamente atingido, mas nossa inteligência artificial local de contingência capturou sua mensagem com sucesso!*

Atualmente, vejo que você está logado como **${name}** (Função: \`${role}\`). No momento, o sistema possui **${appState.projects.length} projetos** cadastrados, dos quais **${activeProjsCount}** estão em andamento.

👉 **Você pode me perguntar livremente sobre:**
* **"Quem sou eu?"** (para confirmar suas credenciais logadas)
* **"Por que não apareço no gráfico?"** (para ver o diagnóstico do seu perfil nos de calor)
* **"Meus projetos"** (para listar suas NS recentes e tempo de trabalho)
* **"Status Geral"** (para ver um resumo instantâneo de toda a engrenagem do JIMP NEXUS!)

Sinta-se à vontade para enviar um destes comandos para obter as respostas personalizadas em tempo real!`;

  return currentHoursMsg;
};
