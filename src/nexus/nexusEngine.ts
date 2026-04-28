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
A plataforma possui três sistemas complementares de acompanhamento:
1. RASTREADOR (Tracker): Projetos de NS individuais iniciados manualmente. É a fonte primária de produção bruta.
2. NEXUS (Gantt): Atividades planejadas no cronograma. Focado em prazos macro.
3. DESEMPENHO OPERACIONAL: Registro detalhado de atividades diárias, incluindo reuniões, folgas, treinamentos e gaps. Esta aba é CRUCIAL para entender o tempo não dedicado a projetos.

# REGRAS DE ANÁLISE DE DESEMPENHO
Sempre que um usuário perguntar sobre o desempenho, produtividade ou o que um projetista está fazendo:
- Você DEVE consultar a tabela [equipe_desempenho_detalhado].
- LEIA o campo "resumo_producao_detalhado".
- OBSERVE as "atividades_operacionais": se o projetista tem poucas NS mas muitas horas em "reunião" ou "treinamento", ele NÃO está ocioso.
- O "tempo_ocioso_hoje_estimado" refere-se apenas a GAPS detectados no dia atual. Não use valores acumulados de meses se houver registros operacionais justificando o tempo.
- Se houver discrepância entre Rastreador (NS) e Nexus (Gantt), verifique se o trabalho está sendo feito como "Atividade Operacional" antes de apontar falha de planejamento.
- Seja proativo, mas JUSTO: considere o cargo (ex: Gestores podem ter menos NS pois fazem mais reuniões registradas no operacional). 
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
- Se o usuário pedir para gerar um gráfico ou se a resposta envolver tendências, evoluções ou comparações, você DEVE incluir um bloco JSON no final da resposta no formato padrão.
`;

export const processNexusQuery = async (
  query: string, 
  appState: AppState, 
  currentUser: User
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
        salario: (isAdmin || u.id === currentUser.id) ? u.salary : 'RESTRITO',
        resumo_producao_detalhado: {
          rastreador_ns: { total: projsUsuario.length, concluidos: concluidosRastreador, horas_totais: horasRastreador.toFixed(1) },
          nexus_gantt: { total: tarefasGantt.length, concluidos: concluidasGantt },
          atividades_operacionais: Object.entries(resumoAtividades).map(([nome, segs]) => ({ nome, horas: (segs / 3600).toFixed(1) })),
          tempo_ocioso_hoje_estimado: `${(ociosidadeDetectadaSegundos / 3600).toFixed(1)}h`
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
