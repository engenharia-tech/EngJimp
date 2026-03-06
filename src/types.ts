export enum ProjectType {
  VARIATION = 'Variação',
  DEVELOPMENT = 'Desenvolvimento',
  RELEASE = 'Liberação'
}

export enum ImplementType {
  BASE = 'Base',
  FURGAO = 'Furgão',
  SIDER = 'Sider',
  CAIXA_CARGA = 'Caixa de Carga',
  BASCULANTE = 'Basculante',
  SOBRECHASSI = 'Sobrechassi',
  GRANELEIRO = 'Graneleiro',
  CARGA_SECA = 'Carga Seca',
  COMPONENTES = 'Componentes',
  OUTROS = 'Outros',
  SOBRE_CHASSI_FURGAO = 'Sobre-Chassi Furgão',
  SOBRE_CHASSI_LONADO = 'Sobre-Chassi Lonado'
}

export enum IssueType {
  COMERCIAL = 'Comercial',
  CORTE_DOBRA = 'Corte /Dobra',
  ENGENHARIA = 'Engenharia',
  PCP_COMPONENTES = 'PCP Componentes',
  PCP_PECAS = 'PCP Peças',
  MONTAGEM_CHASSI = 'Montagem de chassi',
  MONTAGEM_CAIXA_CARGA = 'Montagem Caixa de Carga',
  MONTAGEM_TETO = 'Montagem Teto',
  MONTAGEM_ACESSORIOS = 'Montagem acessórios',
  MECANICA_SOBRE_CHASSI = 'Mecânica Sobre Chassi',
  MECANICA_SR = 'Mecânica SR',
  CHAPEACAO = 'Chapeação',
  PORTAS = 'Portas',
  PINTURA = 'Pintura',
  ELETRICA_ABS_EBS = 'Elétrica /ABS-EBS',
  ALINHAMENTO_EIXOS = 'Alinhamento de Eixos',
  QUALIDADE_INSPECAO_FINAL = 'Qualidade Inspeção Final'
}

export enum InnovationType {
  NEW_PROJECT = 'Novo Projeto',
  PRODUCT_IMPROVEMENT = 'Melhoria de Produto',
  PROCESS_OPTIMIZATION = 'Otimização de Processo'
}

export enum CalculationType {
  PER_UNIT = 'Por Unidade Produzida',
  RECURRING_MONTHLY = 'Recorrente (Mensal)',
  ONE_TIME = 'Valor Único / Fixo'
}

export type UserRole = 'GESTOR' | 'PROJETISTA' | 'CEO' | 'COORDENADOR';

export interface User {
  id: string;
  username: string;
  password: string; // In a real app, this should be hashed. Storing plain for local prototype.
  name: string;
  surname?: string;
  email?: string;
  phone?: string;
  role: UserRole;
  salary?: number;
}

export interface PauseRecord {
  reason: string;
  timestamp: string; // ISO string
  durationSeconds: number; // Approximate duration of this pause
}

export interface VariationRecord {
  id: string;
  oldCode: string;
  description: string;
  newCode: string;
  type: 'Montagem' | 'Peça';
  filesGenerated: boolean; // DXF/PDF check
}

export interface ProjectSession {
  id: string;
  ns: string;
  clientName?: string; // New
  flooringType?: string; // New
  projectCode?: string;
  type: ProjectType;
  implementType?: ImplementType;
  startTime: string; // ISO
  endTime?: string | null; // ISO
  estimatedSeconds?: number;
  totalActiveSeconds: number;
  pauses: PauseRecord[];
  variations: VariationRecord[]; // New
  status: 'COMPLETED' | 'IN_PROGRESS';
  notes?: string;
  userId?: string; // Track who did this project
}

export interface IssueRecord {
  id: string;
  projectNs: string;
  type: IssueType;
  description: string;
  date: string;
  reportedBy?: string; // Track who reported
}

export interface InnovationRecord {
  id: string;
  title: string;
  description: string;
  type: InnovationType;
  
  // Advanced Calculation Fields
  calculationType: CalculationType;
  unitSavings: number; // The base value (e.g., saving per unit, or value per month)
  quantity: number; // Multiplier (e.g., units per year, or 12 months)
  totalAnnualSavings: number; // The calculated total: unitSavings * quantity (if recurring/unit)
  investmentCost?: number; // Cost to implement (optional)

  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
  authorId?: string;
  createdAt: string;
}

export interface AppState {
  projects: ProjectSession[];
  issues: IssueRecord[];
  innovations: InnovationRecord[];
}
