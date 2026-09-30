import { ProjectSession, IssueRecord, InterruptionRecord, AppSettings, User } from '../types';
import { askGemini } from '../lib/gemini';
import { podeVerReais, custoEmReais } from '../utils/custoHora';

export const analyzePerformance = async (
  projects: ProjectSession[], 
  issues: IssueRecord[],
  interruptions: InterruptionRecord[] = [],
  settings?: AppSettings,
  users: User[] = []
) => {
  try {
    // Custo/hora POR PERÍODO e R$ só para o Edson e os CEOs (decisões do Edson, 30/09/2026).
    // Antes: UMA taxa para todos os projetos, de qualquer data — o valor manual gravado em
    // settings.hourlyCost se > 0, senão a média (Dashboard e Relatórios passam data.settings aqui).
    // Agora: quem vê R$ é decidido pelo SERVIDOR (settings.custoHora); a taxa de cada projeto é a
    // do dia dele (startTime, fuso de Joinville) e a parada entra na data do projeto. Quem não vê
    // R$ manda ao Gemini SÓ horas — nenhuma linha de custo vai no prompt (que sai para terceiro e
    // cuja resposta aparece na tela).
    const veReais = podeVerReais(settings);

    // Project Summary (com custo só para quem vê R$)
    const projectSummary = projects.slice(0, 15).map(p => {
      const productiveMins = (p.totalActiveSeconds / 60).toFixed(1);
      const interruptionMins = ((p.interruptionSeconds || 0) / 60).toFixed(1);
      const linha = `- NS: ${p.ns} (${p.type}): ${productiveMins}m produtivos, ${interruptionMins}m interrupção.`;
      if (!veReais) return linha;
      const cost = custoEmReais(settings, p.totalActiveSeconds, p.startTime);
      return `${linha} Custo: R$ ${cost.toFixed(2)}`;
    }).join('\n');

    // Interruption Summary
    const interruptionSummary = interruptions.slice(0, 15).map(i => 
      `- ${i.problemType} (${i.responsibleArea}): ${(i.totalTimeSeconds / 60).toFixed(1)} mins. Resp: ${i.responsiblePerson}`
    ).join('\n');

    // Global Stats
    const totalProductiveSeconds = projects.reduce((acc, p) => acc + p.totalActiveSeconds, 0);
    const totalInterruptionSeconds = projects.reduce((acc, p) => acc + (p.interruptionSeconds || 0), 0);
    // Soma POR REGISTRO (cada projeto na taxa do seu dia), só para quem vê R$.
    let globalProductiveCost = 0;
    let globalInterruptionCost = 0;
    if (veReais) {
      for (const p of projects) {
        globalProductiveCost += custoEmReais(settings, p.totalActiveSeconds, p.startTime);
        globalInterruptionCost += custoEmReais(settings, p.interruptionSeconds || 0, p.startTime);
      }
    }

    const issueSummary = issues.slice(0, 10).map(i =>
      `- ${i.type} em NS ${i.projectNs}: ${i.description}`
    ).join('\n');

    const horasProdutivas = (totalProductiveSeconds / 3600).toFixed(1);
    const horasInterrupcao = (totalInterruptionSeconds / 3600).toFixed(1);
    const dadosGlobais = veReais
      ? [
          `- Tempo Produtivo Total: ${horasProdutivas}h (Custo: R$ ${globalProductiveCost.toFixed(2)})`,
          `- Tempo de Interrupção Total: ${horasInterrupcao}h (Custo: R$ ${globalInterruptionCost.toFixed(2)})`,
          `- Custo Total Estimado: R$ ${(globalProductiveCost + globalInterruptionCost).toFixed(2)}`,
        ].join('\n      ')
      : [
          `- Tempo Produtivo Total: ${horasProdutivas}h`,
          `- Tempo de Interrupção Total: ${horasInterrupcao}h`,
          `- Tempo Total: ${((totalProductiveSeconds + totalInterruptionSeconds) / 3600).toFixed(1)}h`,
        ].join('\n      ');

    const prompt = `
      Analise os seguintes dados de desempenho de um departamento de engenharia industrial.

      OBJETIVO: Forneça um resumo estratégico (máximo 4 parágrafos) em Português.
      FOCO:
      1. Eficiência produtiva e gargalos identificados.
      2. Impacto das interrupções no fluxo de trabalho.
      3. ${veReais ? 'Análise de custos (por projeto e global).' : 'Análise de horas (por projeto e global).'}
      4. Sugestões de melhoria baseadas nos problemas reportados.

      DADOS GLOBAIS:
      ${dadosGlobais}

      PROJETOS RECENTES (${veReais ? 'Detalhes e Custos' : 'Detalhes'}):
      ${projectSummary}

      INTERRUPÇÕES REGISTRADAS:
      ${interruptionSummary}

      PROBLEMAS REPORTADOS:
      ${issueSummary}

      ${veReais
        ? 'Responda de forma profissional e direta, destacando onde o dinheiro está sendo perdido e como otimizar.'
        : 'Responda de forma profissional e direta, destacando onde o tempo está sendo perdido e como otimizar. Não cite valores em dinheiro nem em reais: analise só horas e percentuais.'}
    `;

    // Use the client-side library that proxies to the server
    const analysis = await askGemini(prompt);
    return analysis;
  } catch (error: any) {
    console.error("Gemini Error:", error);
    const errorMessage = error?.message || String(error);
    if (
      errorMessage.includes("Cota") || 
      errorMessage.includes("Quota") || 
      errorMessage.includes("429") || 
      errorMessage.includes("exhausted") || 
      errorMessage.includes("exceeded") ||
      errorMessage.includes("Secrets")
    ) {
      return `⚠️ **Limite de Cota do Gemini Excedido (Quota Exceeded)**\n\nNo plano gratuito do Google AI Studio, há um limite diário e por minuto de requisições. Para resolver isso e usar sem interrupções, você pode configurar uma chave de API própria no menu superior de Configurações (ícone de engrenagem) em 'Secrets', ou aguardar alguns instantes antes de gerar uma nova análise.`;
    }
    return `Não foi possível gerar a análise no momento. Detalhe do erro: ${errorMessage}`;
  }
};
