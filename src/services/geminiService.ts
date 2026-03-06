import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { ProjectSession, IssueRecord } from '../types';

export const analyzePerformance = async (projects: ProjectSession[], issues: IssueRecord[]) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY || import.meta.env.VITE_GEMINI_API_KEY;
    
    if (!apiKey) {
      console.warn("Gemini API Key is missing. Skipping analysis.");
      return "Análise indisponível: Chave de API não configurada.";
    }

    const ai = new GoogleGenAI({ apiKey });

    const projectSummary = projects.slice(0, 10).map(p => 
      `- NS: ${p.ns} (${p.type}): ${(p.totalActiveSeconds / 60).toFixed(1)} mins`
    ).join('\n');

    const issueSummary = issues.slice(0, 10).map(i => 
      `- ${i.type} em NS ${i.projectNs}: ${i.description}`
    ).join('\n');

    const prompt = `
      Analise os seguintes dados de desempenho de um projetista industrial.
      Forneça um resumo curto (máximo 3 parágrafos) em Português sobre eficiência e principais pontos de atenção.
      
      Projetos Recentes:
      ${projectSummary}

      Problemas Reportados Recentes:
      ${issueSummary}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } // Fast response needed
      }
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Não foi possível gerar a análise no momento. Verifique sua chave de API.";
  }
};
