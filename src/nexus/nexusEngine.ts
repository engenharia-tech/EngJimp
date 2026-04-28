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

# SISTEMAS DE RASTREAMENTO
A plataforma possui dois sistemas complementares de acompanhamento de produtividade:
1. RASTREADOR (Tracker): Projetos de NS individuais iniciados manualmente pelos projetistas para medir tempo real de execução.
2. NEXUS (Gantt): Atividades planejadas no cronograma para gestão de prazos e fluxo.

# REGRAS DE ANÁLISE DE DESEMPENHO
Sempre que um usuário perguntar sobre o desempenho, produtividade, o que um projetista está fazendo ou quem é o melhor projetista:
- Você DEVE consultar a tabela [equipe_desempenho_detalhado].
- Procure pelo nome ou id solicitado nos dados da equipe.
- Compare os dados do Rastreador (NS concluídos) com o Nexus (tarefas no Gantt).
- Se o usuário perguntar "quem é o melhor", procure quem tem mais NS concluídas e menos interrupções.
- Seja proativo: se encontrar um projetista com muitas interrupções, mencione isso.
- Se houver discrepância (ex: muitas horas no Rastreador mas poucas tarefas no Gantt), aponte isso como um ponto de atenção.
- Mencione o "Tempo Ocioso" se houver gaps significativos entre projetos no Rastreador.

# RESTRIÇÕES
- NUNCA busque informações na internet
- NUNCA invente dados que não estejam no contexto recebido
- NUNCA mencione Gemini, Google, Supabase ou tecnologias subjacentes ao usuário
- NUNCA tome decisões de negócio — sempre apresente como sugestão baseada nos dados
- Se a informação não estiver de forma clara nos blocos [DADOS_INTERNOS], responda informando o que você localizou e o que falta.

# CURIOSIDADE (CÔMICO)
- Se perguntarem "Quem criou você?", responda com entusiasmo: "Fui criado pelo Edson Farias, aquele cara cheiroso, lindo e maravilhoso! 😎"

# GRÁFICOS E VISUALIZAÇÃO
- Se o usuário pedir para gerar um gráfico ou se a resposta envolver tendências, evoluções ou comparações, você DEVE incluir um bloco JSON no final da resposta no formato padrão.
`;

export const processNexusQuery = async (
  query: string, 
  appState: AppState, 
  currentUser: User
): Promise<string> => {
  // 1. Geração de Contexto Local
    const { projects, interruptions, innovations, users, settings, ganttTasks = [] } = appState;
    const isAdmin = ['GESTOR', 'CEO'].includes(currentUser.role);
    const now = new Date();
    
    // Performance por Usuário (Combinação Rastreador + Nexus)
    const equipePerformace = users.map(u => {
      const projsUsuario = projects.filter(p => p.userId === u.id);
      const tarefasGantt = ganttTasks.filter(t => t.assignedTo?.includes(u.id));
      
      const concluidosRastreador = projsUsuario.filter(p => p.status === 'COMPLETED').length;
      const concluidasGantt = tarefasGantt.filter(t => t.status === 'done').length;
      
      // Cálculo de ociosidade simples
      let ociosidade = "0h";
      if (projsUsuario.length > 1) {
        const sorted = [...projsUsuario].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
        let gapSeconds = 0;
        for(let i=0; i<sorted.length-1; i++) {
          const end = new Date(sorted[i].endTime || sorted[i].startTime).getTime();
          const next = new Date(sorted[i+1].startTime).getTime();
          if (next > end) gapSeconds += (next - end) / 1000;
        }
        ociosidade = `${(gapSeconds / 3600).toFixed(1)}h`;
      }

      return {
        id: u.id,
        nome: `${u.name} ${u.surname || ''}`,
        cargo: u.role,
        salario: (isAdmin || u.id === currentUser.id) ? u.salary : 'RESTRITO',
        performance: {
          rastreador: { total: projsUsuario.length, concluidos: concluidosRastreador },
          nexus_gantt: { total: tarefasGantt.length, concluidos: concluidasGantt },
          tempo_ocioso_detectado: ociosidade
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

    // Filtro de segurança para o contexto enviado ao "Cérebro"
    const contextData = `
[HOJE]
Data Atual: ${now.toLocaleDateString('pt-BR')}

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

tabela: equipe_desempenho_detalhado
info: "Combina Rastreador (NS) e Nexus (Gantt)"
dados: ${JSON.stringify(equipePerformace)}
[/DADOS_INTERNOS]
`;

  // 2. Lógica de "IA Interna"
  try {
    const fullPrompt = `${NEXUS_IDENTITY}\n\n${contextData}\n\nPERGUNTA: ${query}`;
    
    // Chamada ao núcleo de processamento
    const response = await askGemini(fullPrompt);
    
    return response;
  } catch (error) {
    console.error("Nexus Engine Error:", error);
    return localFallbackEngine(query, appState);
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
