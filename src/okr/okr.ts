// OKR pessoal do Edson (executivo). Tipos, semente (vinda do xlsx
// OKR_Q4_2026_Edson_Farias) e helpers de progresso/cor. Guardado no banco
// (tabela okr_state, RLS só-Edson) — ver storageService.fetchOkr/saveOkr.

export type OkrFormat = 'bin' | 'pct' | 'num';
export type OkrStatus = 'Não iniciado' | 'Em andamento' | 'Concluído' | 'Em risco';

export interface OkrKeyResult {
  id: string;            // ex.: "KR1.1"
  title: string;
  metric: string;        // rótulo da métrica
  baseline: number;
  target: number;
  current: number;
  format: OkrFormat;     // bin (0/1) | pct (0..1 exibido em %) | num (contagem 0..target)
  due: string;           // ISO yyyy-mm-dd
  initiatives: string;
  status: OkrStatus | string;
  notes?: string;
}

export interface OkrObjective {
  id: string;            // ex.: "O1"
  title: string;
  keyResults: OkrKeyResult[];
}

export interface OkrCheckin {
  id: string;
  date: string;          // yyyy-mm-dd
  kr: string;            // id do KR
  current: number;
  comment: string;
  next: string;
}

// Portfólio de inovação (KR1.2): os projetos/apps ativos, com status e próximo
// marco. Semeado com o inventário REAL do que foi construído.
export type PortfolioStatus = 'Produção' | 'Desenvolvimento' | 'Protótipo' | 'Ferramenta' | 'Pausado';
export interface PortfolioItem {
  id: string;
  name: string;
  what: string;            // o que é (1 linha)
  category: string;        // Engenharia | Sistemas | Dados | Outros
  status: PortfolioStatus | string;
  url?: string;
  nextMilestone: string;
}

export interface OkrData {
  period: string;
  owner: string;
  objectives: OkrObjective[];
  portfolio: PortfolioItem[];
  checkins: OkrCheckin[];
  updatedAt?: string;
}

// Portfólio real (inventariado do repositório app/, exceto Michela).
export const DEFAULT_PORTFOLIO: PortfolioItem[] = [
  { id: 'kpi', name: 'KPI Engenharia', what: 'Gestão de projetos, KPIs, paradas e OKR da engenharia', category: 'Sistemas', status: 'Produção', url: 'kpieng.jimpnexus.com', nextMilestone: 'Consolidar OKR + notificações de paradas' },
  { id: 'pedidos', name: 'Pedidos Eletrônicos (Configurador)', what: 'Pedido de venda + ordem de produção do furgão/baú, quantidades por fórmula', category: 'Sistemas', status: 'Produção', url: 'pedidos.jimpnexus.com', nextMilestone: 'Unificar de-para com o ERP e as regras das 43 perguntas' },
  { id: 'appcustos', name: 'APPCUSTOS', what: 'Custeio de produtos com motor próprio, distribuído como .exe', category: 'Sistemas', status: 'Produção', nextMilestone: 'Mapear a análise de custo dos modelos restantes' },
  { id: 'calculista', name: 'JimpNexus Calculista (cálculo estrutural / VPC)', what: 'Verificação estrutural de semirreboques (NBR 9500 / Res. 882), memorial PDF assinado, licenciado', category: 'Engenharia', status: 'Produção', nextMilestone: 'Validar famílias Beta (bobineiro, florestal…) contra as planilhas de referência' },
  { id: 'quality', name: 'QualityTracker', what: 'Liberações, tempo de projeto e ocorrências dos projetistas', category: 'Sistemas', status: 'Produção', url: 'qualitytracker-pied.vercel.app', nextMilestone: 'Migrar para domínio próprio qualidade.jimpnexus.com' },
  { id: 'cmms', name: 'CMMS JIMP (Manutenção)', what: 'Gestão de manutenção industrial: equipamentos, OS, preventivas, QR Code', category: 'Sistemas', status: 'Produção', nextMilestone: 'Deduplicar patrimônios e ajustar prazos de preventiva' },
  { id: 'portal', name: 'Portal Nexus', what: 'Portal interno da engenharia, porta de entrada dos sistemas', category: 'Sistemas', status: 'Produção', url: 'jimpnexus.com', nextMilestone: 'Deploy automático (Vercel) + analytics' },
  { id: 'vendas', name: 'Vendas-NS', what: 'Base de inteligência de vendas: 2.482 fichas históricas para cruzar preço/cliente/config', category: 'Dados', status: 'Ferramenta', nextMilestone: 'Consolidar padrões para alimentar preços e de-para do Configurador' },
  { id: 'plaquetas', name: 'Plaquetas', what: 'Geração de plaquetas de identificação (patrimônio/chassi) + entregas', category: 'Sistemas', status: 'Desenvolvimento', nextMilestone: 'Deploy formal e consolidação da autenticação' },
  { id: 'n8n', name: 'Notificações de paradas (n8n)', what: 'WhatsApp em tempo real de paradas + relatório semanal', category: 'Sistemas', status: 'Desenvolvimento', nextMilestone: 'Trocar o trigger simples pelo robusto (outbox) e subir no n8n' },
];

// Progresso = (atual - baseline) / (meta - baseline), limitado a [0,1].
export const krProgress = (kr: OkrKeyResult): number => {
  const denom = kr.target - kr.baseline;
  if (denom === 0) return kr.current >= kr.target ? 1 : 0;
  const p = (kr.current - kr.baseline) / denom;
  return Math.max(0, Math.min(1, p));
};

export const objProgress = (o: OkrObjective): number => {
  if (!o.keyResults.length) return 0;
  return o.keyResults.reduce((a, k) => a + krProgress(k), 0) / o.keyResults.length;
};

export const overallProgress = (d: OkrData): number => {
  const krs = d.objectives.flatMap(o => o.keyResults);
  if (!krs.length) return 0;
  return krs.reduce((a, k) => a + krProgress(k), 0) / krs.length;
};

// Cor por faixa (regra do xlsx): verde >=70%, amarelo 30-69%, vermelho <30%.
export const progressColor = (p: number): 'green' | 'amber' | 'red' => {
  if (p >= 0.7) return 'green';
  if (p >= 0.3) return 'amber';
  return 'red';
};

// Exibe o valor conforme o formato.
export const fmtValue = (v: number, format: OkrFormat): string => {
  if (format === 'pct') return `${Math.round(v * 100)}%`;
  if (format === 'bin') return v >= 1 ? 'Sim' : 'Não';
  return `${v}`;
};

const kr = (
  id: string, title: string, metric: string, target: number, format: OkrFormat,
  due: string, initiatives: string, status: string = 'Não iniciado', notes?: string
): OkrKeyResult => ({ id, title, metric, baseline: 0, target, current: 0, format, due, initiatives, status, notes });

// Semente (Q4 2026) — extraída fielmente do xlsx do Edson.
export const DEFAULT_OKR: OkrData = {
  period: '01/10/2026 a 31/12/2026',
  owner: 'Edson Farias',
  checkins: [],
  portfolio: DEFAULT_PORTFOLIO,
  objectives: [
    {
      id: 'O1',
      title: 'Consolidar a área de Pesquisa e Inovação como função formal da empresa',
      keyResults: [
        kr('KR1.1', 'Aprovar com a direção o documento de escopo da área (missão, portfólio, critérios de priorização e rotina de reporte)', 'Documento aprovado (0/1)', 1, 'bin', '2026-10-31', 'Redigir proposta de escopo; revisar com o diretor; definir cadência de reporte mensal', 'Não iniciado', 'Base para os demais objetivos'),
        kr('KR1.2', 'Cadastrar 100% dos projetos ativos de inovação no portfólio, com dono, status e próximo marco', '% dos projetos cadastrados', 1, 'pct', '2026-11-15', 'Levantar lista completa de projetos (Claude Code, engenharia, sistemas); montar quadro de portfólio', 'Não iniciado'),
        kr('KR1.3', 'Concluir e enviar o questionário PINTEC 2025 (IBGE) com evidências de P&D interno documentadas', 'Questionário enviado (0/1)', 1, 'bin', '2026-10-31', 'Finalizar respostas pendentes (15_D e valores de receita/pessoal com contabilidade e RH); enviar', 'Em andamento'),
        kr('KR1.4', 'Avaliar elegibilidade da empresa em 3 mecanismos de fomento à inovação (Lei do Bem, Finep, Embrapii/SENAI)', 'Pareceres concluídos (0 a 3)', 3, 'num', '2026-12-15', 'Levantar requisitos de cada mecanismo; cruzar com o VPC e os sistemas internos; parecer de 1 página por mecanismo'),
      ],
    },
    {
      id: 'O2',
      title: 'Digitalizar a gestão de engenharia e operação com a plataforma JimpNexus',
      keyResults: [
        kr('KR2.1', 'Colocar o app de Custos em produção com 100% dos produtos ativos cadastrados', '% de produtos ativos cadastrados', 1, 'pct', '2026-11-30', 'Fechar regra de separação custo x preço; carga inicial do catálogo; treinamento dos usuários', 'Não iniciado'),
        kr('KR2.2', 'Emitir 80% dos novos pedidos pelo app de Pedidos Eletrônicos', '% de pedidos emitidos no app', 0.8, 'pct', '2026-12-15', 'Concluir versionamento de pedidos; catálogo compartilhado com Custos; piloto com vendas', 'Não iniciado'),
        kr('KR2.3', 'Registrar 100% das não conformidades no QualityTracker, sem planilha paralela', '% de NCs no sistema', 1, 'pct', '2026-11-30', 'Migrar registros remanescentes; definir regra: NC só existe se estiver no sistema', 'Não iniciado'),
        kr('KR2.4', 'Garantir zero perda de dados nos sistemas, com teste de restauração de backup executado mensalmente', 'Testes de restauração executados (0 a 3)', 3, 'num', '2026-12-31', 'Rotina de backup PostgreSQL on-premises e R2; teste de restauração em outubro, novembro e dezembro', 'Não iniciado', '1 teste por mês'),
      ],
    },
    {
      id: 'O3',
      title: 'Acelerar o desenvolvimento de produto com engenharia baseada em simulação',
      keyResults: [
        kr('KR3.1', 'Fechar o ciclo de validação do VPC com relatório consolidado (FEA e vibração) e ações de projeto implementadas', 'Relatório consolidado (0/1)', 1, 'bin', '2026-11-30', 'Consolidar laudos externos; listar alterações de projeto; registrar as implementadas', 'Não iniciado'),
        kr('KR3.2', 'Reduzir a massa estrutural em 5% em ao menos um modelo, mantidos os requisitos de resistência e durabilidade', '% de redução de massa', 0.05, 'pct', '2026-12-31', 'Selecionar modelo alvo; comparar configurações estruturais; validar por cálculo e simulação', 'Não iniciado', 'Meta de 5% é proposta inicial, ajustar'),
        kr('KR3.3', 'Homologar 2 fornecedores alternativos de componentes críticos com protocolo de teste (lote de 100 unidades)', 'Fornecedores homologados (0 a 2)', 2, 'num', '2026-11-30', 'Iniciar pelo parafuso autoperfurante (Ø4,2 x 25, DIN 7504 P); solicitar amostras; teste de torque e instalação', 'Não iniciado'),
        kr('KR3.4', 'Padronizar o protocolo de homologação de componentes e travar descrições críticas no ERP', 'Protocolo publicado (0/1)', 1, 'bin', '2026-12-15', 'Documento de 2 páginas com etapas, critérios e responsáveis; ajuste das descrições no ERP', 'Não iniciado'),
      ],
    },
    {
      id: 'O4',
      title: 'Estabelecer inteligência tecnológica e parcerias externas',
      keyResults: [
        kr('KR4.1', 'Realizar a visita técnica à China (Liangshan, CIIF, Canton Fair) e entregar relatório de benchmarking com ao menos 10 oportunidades identificadas', 'Oportunidades documentadas (0 a 10)', 10, 'num', '2026-11-15', 'Roteiro de perguntas por fábrica; registro diário durante a viagem (8 a 22/10); relatório em até 3 semanas após o retorno', 'Não iniciado'),
        kr('KR4.2', 'Priorizar 3 oportunidades da viagem com estudo preliminar de viabilidade (custo, prazo, risco)', 'Estudos concluídos (0 a 3)', 3, 'num', '2026-12-15', 'Apresentar as 3 ao diretor com recomendação de seguir ou não', 'Não iniciado'),
        kr('KR4.3', 'Manter relacionamento ativo com 5 fabricantes ou fornecedores chineses, com dossiê por empresa', 'Dossiês criados (0 a 5)', 5, 'num', '2026-12-31', 'Dossiê padrão: contato, produtos, capacidade, preços indicativos, próximo passo', 'Não iniciado'),
        kr('KR4.4', 'Formalizar 1 iniciativa de cooperação com a UFSC Joinville (projeto, TCC orientado ou estágio)', 'Iniciativa formalizada (0/1)', 1, 'bin', '2026-12-31', 'Identificar tema ligado ao VPC ou à redução de massa; alinhar com professor do ECM', 'Não iniciado'),
      ],
    },
  ],
};
