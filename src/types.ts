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
  PROCESS_OPTIMIZATION = 'Otimização de Processos'
}

export enum InterruptionStatus {
  OPEN = 'Aberto',
  WAITING = 'Aguardando resposta',
  RESOLVED = 'Resolvido',
  CANCELLED = 'Cancelado'
}

export enum InterruptionArea {
  COMERCIAL = 'Comercial',
  ENGENHARIA = 'Engenharia',
  PCP = 'PCP',
  PRODUCAO = 'Produção',
  CLIENTE = 'Cliente',
  VENDAS = 'Vendas',
  OUTROS = 'Outros'
}

export enum CalculationType {
  PER_UNIT = 'Por Unidade Produzida',
  RECURRING_MONTHLY = 'Recorrente (Mensal)',
  ONE_TIME = 'Valor Único / Fixo',
  ADD_EXPENSE = 'Adicionar Gasto'
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
  clientName?: string;
  flooringType?: string;
  projectCode?: string;
  type: ProjectType;
  implementType?: ImplementType;
  startTime: string; // ISO
  endTime?: string | null; // ISO
  estimatedSeconds?: number;
  totalActiveSeconds: number; // This will be the productive time
  interruptionSeconds?: number; // New: Time lost to interruptions
  totalSeconds?: number; // New: productive + interruption
  productiveCost?: number; // New
  interruptionCost?: number; // New
  totalCost?: number; // New
  pauses: PauseRecord[];
  variations: VariationRecord[];
  status: 'COMPLETED' | 'IN_PROGRESS';
  notes?: string;
  userId?: string;
  isOvertime?: boolean;
}

export interface IssueRecord {
  id: string;
  projectNs: string;
  type: IssueType;
  description: string;
  date: string;
  reportedBy?: string;
}

export interface InnovationMaterial {
  id: string;
  name: string;
  cost: number;
  type: 'ADD' | 'REMOVE';
}

export interface InnovationMachine {
  name: string;
  cost: number;
  depreciationYears: number;
  annualDepreciation: number;
}

export interface InnovationRecord {
  id: string;
  title: string;
  description: string;
  type: InnovationType;
  
  // Advanced Calculation Fields
  calculationType: CalculationType;
  unitSavings: number;
  quantity: number;
  totalAnnualSavings: number;
  investmentCost?: number;

  // New Fields
  materials?: InnovationMaterial[];
  machine?: InnovationMachine;

  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
  authorId?: string;
  createdAt: string;
}

export interface InterruptionType {
  id: string;
  name: string;
  isActive: boolean;
}

export interface InterruptionRecord {
  id: string;
  projectId?: string;
  projectNs: string;
  clientName: string;
  designerId: string;
  startTime: string; // ISO
  endTime?: string | null; // ISO
  problemType: string;
  responsibleArea: InterruptionArea;
  responsiblePerson: string;
  description: string;
  status: InterruptionStatus;
  totalTimeSeconds: number;
}

export interface AppSettings {
  hourlyCost: number;
  logoUrl?: string;
  companyName?: string;
  emailHost?: string;
  emailPort?: string;
  emailUser?: string;
  emailPass?: string;
  emailFrom?: string;
  emailTo?: string;
}

export interface AppState {
  projects: ProjectSession[];
  issues: IssueRecord[];
  innovations: InnovationRecord[];
  interruptions: InterruptionRecord[];
  interruptionTypes: InterruptionType[];
  users: User[];
  settings: AppSettings;
}
