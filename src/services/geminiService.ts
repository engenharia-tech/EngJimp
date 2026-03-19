import { ProjectSession, IssueRecord, InterruptionRecord, AppSettings } from '../types';
import { askGemini } from '../lib/gemini';

export const analyzePerformance = async (
  projects: ProjectSession[], 
  issues: IssueRecord[],
  interruptions: InterruptionRecord[] = [],
  settings?: AppSettings
) => {
  try {
    // Project Summary with Costs
    const hourlyCost = settings?.hourlyCost || 0;
    const projectSummary = projects.slice(0, 15).map(p => {
      const productiveMins = (p.totalActiveSeconds / 60).toFixed(1);
      const interruptionMins = ((p.interruptionSeconds || 0) / 60).toFixed(1);
      const cost = (p.totalActiveSeconds / 3600) * hourlyCost;
      return `- NS: ${p.ns} (${p.type}): ${productiveMins}m produtivos, ${interruptionMins}m interrupção. Custo: R$ ${cost.toFixed(2)}`;
    }).join('\n');

    // Interruption Summary
    const interruptionSummary = interruptions.slice(0, 15).map(i => 
      `- ${i.problemType} (${i.responsibleArea}): ${(i.totalTimeSeconds / 60).toFixed(1)} mins. Resp: ${i.responsiblePerson}`
    ).join('\n');

    // Global Stats
    const totalProductiveSeconds = projects.reduce((acc, p) => acc + p.totalActiveSeconds, 0);
    const totalInterruptionSeconds = projects.reduce((acc, p) => acc + (p.interruptionSeconds || 0), 0);
    const globalProductiveCost = (totalProductiveSeconds / 3600) * hourlyCost;
    const globalInterruptionCost = (totalInterruptionSeconds / 3600) * hourlyCost;

    const issueSummary = issues.slice(0, 10).map(i => 
      `- ${i.type} em NS ${i.projectNs}: ${i.description}`
    ).join('\n');

    const prompt = `
      Analise os seguintes dados de desempenho de um departamento de engenharia industrial.
      
      OBJETIVO: Forneça um resumo estratégico (máximo 4 parágrafos) em Português.
      FOCO: 
      1. Eficiência produtiva e gargalos identificados.
      2. Impacto das interrupções no fluxo de trabalho.
      3. Análise de custos (por projeto e global).
      4. Sugestões de melhoria baseadas nos problemas reportados.
      
      DADOS GLOBAIS:
      - Tempo Produtivo Total: ${(totalProductiveSeconds / 3600).toFixed(1)}h (Custo: R$ ${globalProductiveCost.toFixed(2)})
      - Tempo de Interrupção Total: ${(totalInterruptionSeconds / 3600).toFixed(1)}h (Custo: R$ ${globalInterruptionCost.toFixed(2)})
      - Custo Total Estimado: R$ ${(globalProductiveCost + globalInterruptionCost).toFixed(2)}

      PROJETOS RECENTES (Detalhes e Custos):
      ${projectSummary}

      INTERRUPÇÕES REGISTRADAS:
      ${interruptionSummary}

      PROBLEMAS REPORTADOS:
      ${issueSummary}
      
      Responda de forma profissional e direta, destacando onde o dinheiro está sendo perdido e como otimizar.
    `;

    // Use the client-side library that proxies to the server
    const analysis = await askGemini(prompt);
    return analysis;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Não foi possível gerar a análise no momento. Verifique sua chave de API no servidor.";
  }
};
