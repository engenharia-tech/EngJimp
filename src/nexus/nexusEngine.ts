import { AppState, User, InterruptionStatus } from '../types';
import { askGemini } from '../lib/gemini';
import { GoogleGenAI } from "@google/genai";

/**
 * Nexus Engine - O núcleo de processamento interno do JimpNexus.
 * Desenvolvido para operar de forma isolada, processando dados do banco local.
 */

const NEXUS_IDENTITY = `
# IDENTIDADE
Você é o Nexus IA, assistente interno e exclusivo do sistema JimpNexus ERP. Você opera 100% com base nos dados internos fornecidos no contexto de cada mensagem, vindos do banco de dados Supabase da empresa. Sem buscas externas. Sem internet. Sem fontes fora do JimpNexus.

# RESTRIÇÕES
- NUNCA busque informações na internet
- NUNCA invente dados que não estejam no contexto recebido
- NUNCA mencione Gemini, Google, Supabase ou tecnologias subjacentes ao usuário
- NUNCA tome decisões de negócio — sempre apresente como sugestão baseada nos dados
- Se a informação não estiver de forma clara nos blocos [DADOS_INTERNOS] ou sugerida nos indicadores, responda informando o que você localizou e o que falta, ou use: "⚠️ Dado exato não localizado na base interna. Os registros atuais mostram [X], mas não confirmam sua pergunta específica."

# GRÁFICOS E VISUALIZAÇÃO
- Se o usuário pedir para gerar um gráfico ou se a resposta envolver tendências, evoluções ou comparações, você DEVE incluir um bloco JSON no final da resposta.
- O formato do JSON DEVE ser exatamente este (dentro de um bloco de código markdown):
\`\`\`json
{
  "type": "bar" | "line" | "pie" | "area",
  "title": "Título do Gráfico",
  "description": "Explicação curta da tendência",
  "keys": ["valor1", "valor2"],
  "series": [
    { "name": "Jan", "valor1": 10, "valor2": 5 },
    { "name": "Fev", "valor1": 15, "valor2": 8 }
  ]
}
\`\`\`
- Use "name" para o eixo X.
- Para "pie", use [{ "name": "Item", "value": 10 }].
`;

export const processNexusQuery = async (
  query: string, 
  appState: AppState, 
  currentUser: User
): Promise<string> => {
  // 1. Geração de Contexto Local
    const { projects, interruptions, innovations, users, settings } = appState;
    const isAdmin = ['GESTOR', 'CEO'].includes(currentUser.role);
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    
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
      const mesStr = (d.getMonth() + 1).toString().padStart(2, '0');
      const anoStr = d.getFullYear();
      const chave = `${anoStr}-${mesStr}`;
      
      const projsNoMes = projects.filter(p => p.startTime.startsWith(chave));
      const concluidos = projsNoMes.filter(p => p.status === 'COMPLETED').length;
      
      return { mes: chave, total: projsNoMes.length, concluidos };
    }).reverse();

    // Filtro de segurança para o contexto enviado ao "Cérebro"
    const contextData = `
[HOJE]
Data Atual: ${now.toLocaleDateString('pt-BR')} (Mês: ${currentMonth}, Ano: ${currentYear})

[DADOS_INTERNOS]
tabela: indicadores_globais
dados: {
  "total_projetos": ${projects.length},
  "projetos_em_andamento": ${projects.filter(p => p.status === 'IN_PROGRESS').length},
  "interrupcoes_abertas": ${interruptions.filter(i => i.status === InterruptionStatus.OPEN).length},
  "economia_anual": ${innovations.reduce((acc, inv) => acc + (inv.totalAnnualSavings || 0), 0)},
  "empresa": "${settings.companyName}",
  "resumo_global_por_tipo": ${JSON.stringify(porImplemento)}
}
[/DADOS_INTERNOS]

[DADOS_INTERNOS]
tabela: historico_6_meses
dados: ${JSON.stringify(ultimos6Meses)}
[/DADOS_INTERNOS]

[DADOS_INTERNOS]
tabela: equipe
dados: ${JSON.stringify(users.map(u => ({ nome: u.name, cargo: u.role, salario: (isAdmin || u.id === currentUser.id) ? u.salary : 'RESTRITO' })))}
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
