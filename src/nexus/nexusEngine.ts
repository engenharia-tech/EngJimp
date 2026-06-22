import { AppState, User, InterruptionStatus } from '../types';
import { askGemini } from '../lib/gemini';
import { GoogleGenAI } from "@google/genai";

/**
 * Nexus Engine - O núcleo de processamento interno do JimpNexus.
 * Desenvolvido para operar de forma isolada, processando dados do banco local.
 */

const NEXUS_IDENTITY = `
# IDENTIDADE
Você é o Nexus IA, assistente interno e exclusivo do sistema JimpNexus ERP. Você opera 100% com base nos dados internos fornecidos no contexto de cada mensagem.

# IDENTIFICAÇÃO DO USUÁRIO E PERMISSÕES DE ACESSO
- Você DEVE identificar com quem está interagindo a partir do bloco [DADOS_DO_USUARIO_CONECTADO] enviado no contexto.
- Comece de forma natural cumprimentando o usuário ou mencionando seu nome e cargo/função quando for relevante ou logo na primeira interação (ex: "Olá Edson (GESTOR)!", "Olá, Edson gestor, entendi sua solicitação..."). Demonstre claramente que você sabe quem está falando com você e respeita seu papel na empresa.
- Mantenha estrita consciência das permissões e privilégios associados ao login atual:
  - Os cargos GESTOR, COORDENADOR e CEO possuem permissão total para visualizar as estatísticas de desempenho, produtividade, andamento de tarefas e horas de atividade de toda a equipe, garantindo que o desempenho de Edson e de qualquer outro projetista/colaborador seja inteiramente visível para esses perfis de liderança. No entanto, lembre-se: períodos sem lançamentos estruturados para os cargos de liderança nunca devem ser descritos como ociosidade, mas sim como dedicação às obrigações do cargo de gestão.
  - REGRAS ESTREITAS DE SALÁRIO: NUNCA exiba ou comente sobre o salário de nenhum de nossos colaboradores para NINGUÉM além do próprio Edson (efariaseng0@gmail.com / edson). Absolutamente ninguém (incluindo outros administradores, GESTOR, COORDENADOR ou CEO, etc.) além dele tem permissão para receber ou visualizar dados de salário no chat. Se um usuário que não seja o próprio Edson tentar perguntar sobre salários, o salário aparecerá configurado no contexto como "RESTRITO" e você deverá recusar educadamente, explicando que são dados confidenciais e restritos.

# SISTEMAS DE RASTREAMENTO
A plataforma possui três sistemas complementares de acompanhamento:
1. RASTREADOR (Tracker): Projetos de NS individuais iniciados manualmente. É a fonte primária de produção bruta.
2. NEXUS (Gantt): Atividades planejadas no cronograma. Focado em prazos macro.
3. DESEMPENHO OPERACIONAL: Registro detalhado de atividades diárias, incluindo reuniões, folgas, treinamentos e gaps. Esta aba é CRUCIAL para entender o tempo não dedicado a projetos.

# REGRAS DE ANÁLISE DE DESEMPENHO
Sempre que um usuário perguntar sobre o desempenho, produtividade ou o que um projetista está fazendo:
- Você DEVE consultar a tabela [equipe_desempenho_detalhado].
- Para análises de "Tempo de Desenvolvimento" ou "Média de Horas", consulte obrigatoriamente a tabela [desempenho_mensal_real_por_projetista]. Nela as horas totais já estão divididas pela quantidade de projetistas ativos no mês, gerando a "media_horas_por_projetista", que é o valor real a ser usado como referência.
- LEIA o campo "resumo_producao_detalhado".
- OBSERVE as "atividades_operacionais": se o projetista tem poucas NS mas muitas horas em "reunião" ou "treinamento", ele NÃO está ocioso.
- O "tempo_ocioso_hoje_estimado" refere-se apenas a GAPS detectados no dia atual. Não use valores acumulados de meses se houver registros operacionais justificando o tempo.
- Se houver discrepância entre Rastreador (NS) e Nexus (Gantt), verifique se o trabalho está sendo feito como "Atividade Operacional" antes de apontar falha de planejamento.
- Seja proativo, mas JUSTO: considere o cargo (ex: Gestores, Coordenadores e CEOs não possuem um papel de produção técnico-operacional direta, logo não são "produtivos" na função executiva de desenhos e NS faturáveis. Por essa razão, seus períodos sem lançamentos manuais nunca devem ser descritos de forma alguma como ociosidade ou tempo ocioso. Ao invés disso, defina esses intervalos com palavras claras e apropriadas de liderança e suporte, como "Planejamento Estratégico", "Direcionamento Operacional", "Supervisão e Alinhamento Técnico", "Mentoria Técnica" ou "Coordenação de Equipe").
- Valorize quem registra tudo corretamente na aba Desempenho Operacional.

# RESTRIÇÕES
- NUNCA busque informações na internet
- NUNCA invente dados que não estejam no contexto recebido
- NUNCA mencione Gemini, Google, Supabase ou tecnologias subjacentes ao usuário
- NUNCA tome decisões de negócio — sempre apresente como sugestão baseada nos dados
- Se a informação não estiver de forma clara nos blocos [DADOS_INTERNOS], responda informando o que você localizou e o que falta.

# CURIOSIDADE (CÔMICO)
- Se perguntarem "Quem criou você?", responda com entusiasmo: "Fui criado pelo Edson Farias, aquele cara cheiroso, lindo e maravilhoso! 😎"

# GRÁFICOS E VISUALIZAÇÃO
- Se o usuário pedir para gerar um gráfico (de barras, linha, área, rosca, pizza ou setores) ou se a pergunta envolver tendências, distribuições, comparações quantitativas ou evoluções de dados, você DEVE incluir um bloco JSON formatado exatamente como \`\`\`json no final da sua resposta (deixando uma linha em branco após seu texto explicativo).
- O bloco JSON deve seguir exatamente a seguinte estrutura TypeScript:
  {
    "type": "bar" | "line" | "area" | "pie",
    "series": Array de objetos, contendo campos numéricos e um campo identificador "name" (que serve como rótulo no gráfico). Exemplo: [{"name": "Jan/26", "Horas": 120}, {"name": "Fev/26", "Horas": 145}]
    "keys": Array de strings contendo exatamente os nomes das chaves numéricas de "series" que serão renderizadas. Exemplo: ["Horas"]
    "title": "Título profissional do Gráfico",
    "description": "Uma breve frase explicativa sobre as conclusões ou o contexto do gráfico."
  }
- ATENÇÃO para gráfico do tipo "pie" (pizza/setores/rosca): Os objetos de "series" obrigatoriamente devem ter a chave "name" (rótulo) e a chave "value" (valor numérico). Exemplo: [{"name": "Bastidor", "value": 15}, {"name": "Reboque", "value": 30}], e "keys" deve ser obrigatoriamente ["value"].
- Incentive de forma empática o usuário a pedir outros cenários, layouts de gráficos, ou cruzamento de dados que ele desejar!
`;

export const processNexusQuery = async (
  query: string, 
  appState: AppState, 
  currentUser: User,
  history?: { role: 'user' | 'assistant'; content: string }[]
): Promise<string> => {
    // 1. Geração de Contexto Local
    const { 
      projects, 
      interruptions, 
      innovations, 
      users, 
      settings, 
      ganttTasks = [],
      operationalActivities = [] 
    } = appState;
    const isAdmin = ['GESTOR', 'CEO'].includes(currentUser.role);
    const now = new Date();
    
    // Performance por Usuário (Combinação Rastreador + Nexus + Operacional)
    const equipePerformace = users.map(u => {
      const projsUsuario = projects.filter(p => p.userId === u.id);
      const tarefasGantt = ganttTasks.filter(t => t.assignedTo?.includes(u.id));
      const atividadesOperacionais = operationalActivities.filter(a => a.userId === u.id);
      
      const concluidosRastreador = projsUsuario.filter(p => p.status === 'COMPLETED').length;
      const concluidasGantt = tarefasGantt.filter(t => t.status === 'done').length;
      
      // Cálculo de tempo por categoria (Horas)
      const horasRastreador = projsUsuario.reduce((acc, p) => acc + (p.totalActiveSeconds || 0), 0) / 3600;
      const horasAtividades = atividadesOperacionais.reduce((acc, a) => acc + (a.durationSeconds || 0), 0) / 3600;
      
      // Detalhamento das atividades operacionais
      const resumoAtividades = atividadesOperacionais.reduce((acc: Record<string, number>, a) => {
        acc[a.activityName] = (acc[a.activityName] || 0) + (a.durationSeconds || 0);
        return acc;
      }, {});

      // Ociosidade: Apenas GAPs detectados no dia atual (evita somar noites/fds)
      let ociosidadeDetectadaSegundos = 0;
      const hojeStr = now.toISOString().split('T')[0];
      const projsHoje = projsUsuario.filter(p => p.startTime.startsWith(hojeStr)).sort((a, b) => a.startTime.localeCompare(b.startTime));
      
      if (projsHoje.length > 1) {
        for(let i=0; i < projsHoje.length - 1; i++) {
          const fim = new Date(projsHoje[i].endTime || projsHoje[i].startTime).getTime();
          const inicioProx = new Date(projsHoje[i+1].startTime).getTime();
          if (inicioProx > fim) {
            const gap = (inicioProx - fim) / 1000;
            if (gap < 14400) ociosidadeDetectadaSegundos += gap;
          }
        }
      }

      return {
        id: u.id,
        nome: `${u.name} ${u.surname || ''}`,
        cargo: u.role,
        salario: (currentUser.email === 'efariaseng0@gmail.com' || currentUser.username === 'edson') ? u.salary : 'RESTRITO',
        resumo_producao_detalhado: {
          rastreador_ns: { total: projsUsuario.length, concluidos: concluidosRastreador, horas_totais: horasRastreador.toFixed(1) },
          nexus_gantt: { total: tarefasGantt.length, concluidos: concluidasGantt },
          atividades_operacionais: Object.entries(resumoAtividades).map(([nome, segs]) => ({ nome, horas: (segs / 3600).toFixed(1) })),
          tempo_ocioso_hoje_estimado: ['GESTOR', 'COORDENADOR', 'CEO'].includes(u.role) 
            ? "0h (Isento - tempo dedicado à gestão estratégica, reuniões e planejamento)" 
            : `${(ociosidadeDetectadaSegundos / 3600).toFixed(1)}h`
        }
      };
    });

    // Agrupamento por tipo de implemento
    const porImplemento: Record<string, number> = {};
    projects.forEach(p => {
      if (p.implementType) {
        porImplemento[p.implementType] = (porImplemento[p.implementType] || 0) + 1;
      }
    });

    // Histórico de 6 meses para tendências
    const ultimos6Meses = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const chave = d.toISOString().substring(0, 7);
      
      const projsNoMes = projects.filter(p => p.startTime.startsWith(chave));
      const concluidosRastreador = projsNoMes.filter(p => p.status === 'COMPLETED').length;
      
      const tarefasNoMes = ganttTasks.filter(t => t.updatedAt?.startsWith(chave));
      const concluidasNexus = tarefasNoMes.filter(t => t.status === 'done').length;
      
      return { mes: chave, rastreador_concluidos: concluidosRastreador, nexus_concluidos: concluidasNexus };
    }).reverse();

    // Novo: Desempenho Mensal Consolidado (Horas Reais Médias)
    const designers = users.filter(u => u.role === 'PROJETISTA' || u.role === 'GESTOR' || u.role === 'COORDENADOR');
    const designerIds = new Set(designers.map(u => u.id));
    
    const desempenhoMensalReal = Array.from({ length: 6 }, (_, i) => {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mesChave = d.toISOString().substring(0, 7);
      
      const projsMes = projects.filter(p => p.startTime.startsWith(mesChave) && designerIds.has(p.userId));
      const opsMes = operationalActivities.filter(a => a.startTime.startsWith(mesChave) && designerIds.has(a.userId));
      
      const horasTracker = projsMes.reduce((acc, p) => acc + (p.totalActiveSeconds || 0), 0) / 3600;
      const horasOps = opsMes.reduce((acc, a) => acc + (a.durationSeconds || 0), 0) / 3600;
      const totalHoras = horasTracker + horasOps;
      
      const distinctUsers = new Set([
        ...projsMes.map(p => p.userId),
        ...opsMes.map(a => a.userId)
      ]);
      const userCount = distinctUsers.size || 1;
      
      return {
        mes: mesChave,
        total_horas_engenharia: totalHoras.toFixed(1),
        quantidade_projetistas_ativos: userCount,
        media_horas_por_projetista: (totalHoras / userCount).toFixed(1)
      };
    }).reverse();

    // Filtro de segurança para o contexto enviado ao "Cérebro"
    const contextData = `
[HOJE]
Data Atual: ${now.toLocaleDateString('pt-BR')}

[DADOS_DO_USUARIO_CONECTADO]
Nome: ${currentUser.name} ${currentUser.surname || ''}
Login/Usuário: ${currentUser.username}
Cargo/Função: ${currentUser.role}
E-mail: ${currentUser.email || 'Não informado'}
ID: ${currentUser.id}
[/DADOS_DO_USUARIO_CONECTADO]

[DADOS_INTERNOS]
tabela: indicadores_globais
dados: {
  "total_projetos_rastreador": ${projects.length},
  "total_atividades_nexus": ${ganttTasks.length},
  "interrupcoes_abertas": ${interruptions.filter(i => i.status === InterruptionStatus.OPEN).length},
  "empresa": "${settings.companyName}",
  "resumo_por_implemento": ${JSON.stringify(porImplemento)}
}

tabela: historico_comparativo_meses
dados: ${JSON.stringify(ultimos6Meses)}

tabela: desempenho_mensal_real_por_projetista
info: "Média real de horas (Tracker + Operacional) dividida pelo número de projetistas ativos no mês"
dados: ${JSON.stringify(desempenhoMensalReal)}

tabela: equipe_desempenho_detalhado
info: "Combina Rastreador (NS) e Nexus (Gantt)"
dados: ${JSON.stringify(equipePerformace)}
[/DADOS_INTERNOS]
`;

  // 2. Lógica de "IA Interna"
  try {
    // Format conversation history if available
    let historyText = "";
    if (history && history.length > 0) {
      historyText = history.map(m => {
        return m.role === 'user' ? `Usuário: ${m.content}` : `Assistente: ${m.content}`;
      }).join('\n\n');
    }

    const userHeader = `[DADOS DE IDENTIFICAÇÃO EM TEMPO REAL]
Você está respondendo diretamente a: ${currentUser.name} ${currentUser.surname || ''} (ID: ${currentUser.id}, Função: ${currentUser.role}, E-mail: ${currentUser.email || 'Não informado'})
NUNCA pergunte quem é o usuário pois você tem os dados em absoluto acima. Responda em primeira pessoa quando o usuário referir a 'eu', 'minhas NS', 'minha produtividade', etc.
[/DADOS DE IDENTIFICAÇÃO EM TEMPO REAL]`;

    const fullPrompt = `${NEXUS_IDENTITY}\n\n${contextData}\n\n${userHeader}\n\n${historyText ? `[CONVERSA ANTERIOR]\n${historyText}\n\n` : ''}Usuário (${currentUser.name}): ${query}\n\nAssistente:`;
    
    // Chamada ao núcleo de processamento
    const response = await askGemini(fullPrompt);
    
    return response;
  } catch (error: any) {
    console.error("Nexus Engine Error:", error);
    const errorMessage = error?.message || String(error);
    return `⚠️ Erro de Processamento Avançado (Nexus): ${errorMessage}\n\nPor favor, reporte este erro ao administrador.\n\nFallback: ` + localFallbackEngine(query, appState);
  }
};

/**
 * Motor de busca local simples para quando a IA principal está indisponível.
 */
function localFallbackEngine(query: string, state: AppState): string {
  const q = query.toLowerCase();
  
  if (q.includes('quantos projetos') || q.includes('total de projetos')) {
    return `Atualmente existem ${state.projects.length} projetos registrados no JimpNexus.`;
  }
  
  if (q.includes('quem criou') || q.includes('criador')) {
    return "Fui criado pelo Edson Farias, aquele cara cheiroso, lindo e maravilhoso! 😎";
  }

  if (q.includes('interrupções') || q.includes('parado')) {
    const abertas = state.interruptions.filter(i => i.status === InterruptionStatus.OPEN).length;
    return `Existem ${abertas} interrupções abertas no momento.`;
  }

  return "⚠️ O núcleo de processamento avançado está temporariamente offline. Tente uma pergunta mais simples ou verifique a conexão com o servidor interno.";
}
