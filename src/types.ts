export enum ProjectType {
  VARIATION = 'VARIAÇÃO',
  DEVELOPMENT = 'DESENVOLVIMENTO',
  RELEASE = 'LIBERAÇÃO'
}

export enum ImplementType {
  BASE = 'BASE',
  FURGAO = 'FURGÃO',
  SIDER = 'SIDER',
  CAIXA_CARGA = 'CAIXA DE CARGA',
  BASE_AND_BOX = 'BASE E CAIXA DE CARGA',
  BASCULANTE = 'BASCULANTE',
  SOBRECHASSI = 'SOBRECHASSI',
  GRANELEIRO = 'GRANELEIRO',
  CARGA_SECA = 'CARGA SECA',
  COMPONENTES = 'COMPONENTES',
  OUTROS = 'OUTROS',
  SOBRE_CHASSI_FURGAO = 'SOBRE-CHASSI FURGÃO',
  SOBRE_CHASSI_LONADO = 'SOBRE-CHASSI LONADO'
}

export enum IssueType {
  COMERCIAL = 'COMERCIAL',
  CORTE_DOBRA = 'CORTE /DOBRA',
  ENGENHARIA = 'ENGENHARIA',
  PCP_COMPONENTES = 'PCP COMPONENTES',
  PCP_PECAS = 'PCP PEÇAS',
  MONTAGEM_CHASSI = 'MONTAGEM DE CHASSI',
  MONTAGEM_CAIXA_CARGA = 'MONTAGEM CAIXA DE CARGA',
  MONTAGEM_TETO = 'MONTAGEM TETO',
  MONTAGEM_ACESSORIOS = 'MONTAGEM ACESSÓRIOS',
  MECANICA_SOBRE_CHASSI = 'MECÂNICA SOBRE CHASSI',
  MECANICA_SR = 'MECÂNICA SR',
  CHAPEACAO = 'CHAPEAÇÃO',
  PORTAS = 'PORTAS',
  PINTURA = 'PINTURA',
  ELETRICA_ABS_EBS = 'ELÉTRICA /ABS-EBS',
  ALINHAMENTO_EIXOS = 'ALINHAMENTO DE EIXOS',
  QUALIDADE_INSPECAO_FINAL = 'QUALIDADE INSPEÇÃO FINAL'
}

export enum InnovationType {
  NEW_PROJECT = 'NOVO PROJETO',
  PRODUCT_IMPROVEMENT = 'MELHORIA DE PRODUTO',
  PROCESS_OPTIMIZATION = 'OTIMIZAÇÃO DE PROCESSOS'
}

export enum InterruptionStatus {
  OPEN = 'ABERTO',
  WAITING = 'AGUARDANDO RESPOSTA',
  RESOLVED = 'RESOLVIDO',
  CANCELLED = 'CANCELADO'
}

export enum InterruptionArea {
  COMERCIAL = 'COMERCIAL',
  ENGENHARIA = 'ENGENHARIA',
  PCP = 'PCP',
  PRODUCAO = 'PRODUÇÃO',
  CLIENTE = 'CLIENTE',
  VENDAS = 'VENDAS',
  JIMPSERVICE = 'JIMPSERVICE',
  OUTROS = 'OUTROS'
}

export enum CalculationType {
  PER_UNIT = 'POR UNIDADE PRODUZIDA',
  RECURRING_MONTHLY = 'RECORRENTE (MENSUAL)',
  ONE_TIME = 'VALOR ÚNICO / FIXO',
  ADD_EXPENSE = 'ADICIONAR GASTO'
}

export type UserRole = 'GESTOR' | 'PROJETISTA' | 'CEO' | 'COORDENADOR' | 'PROCESSOS' | 'QUALIDADE';

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
  type: 'MONTAGEM' | 'PEÇA';
  filesGenerated: boolean; // DXF/PDF check
}

export interface ProjectSession {
  id: string;
  name: string; // Unified name field
  ns: string;
  clientName?: string;
  flooringType?: string;
  projectCode?: string;
  chassisNumber?: string;
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
  lastActiveAt?: string; // ISO string for heartbeat/resume logic
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
  
  // Productivity Yield Fields
  productivityBefore?: number;
  productivityAfter?: number;
  unitProductCost?: number;
  unitProductValue?: number; // Selling price or value of the product

  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'IMPLEMENTED';
  authorId?: string;
  createdAt: string;
}

export interface InterruptionType {
  id: string;
  name: string;
  isActive: boolean;
}

export interface ActivityType {
  id: string;
  name: string;
  isActive: boolean;
}

export interface OperationalActivity {
  id: string;
  userId: string;
  activityTypeId: string;
  activityName: string;
  startTime: string; // ISO
  endTime?: string | null; // ISO
  durationSeconds: number;
  notes?: string;
  projectId?: string;
  isFlagged?: boolean;
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
  otherLosses?: string;
  lastActiveAt?: string; // ISO string for heartbeat/resume logic
}

export interface AppSettings {
  hourlyCost: number;
  useAutomaticCost?: boolean;
  logoUrl?: string;
  companyName?: string;
  emailTo?: string;
  interruptionEmailTo?: string;
  interruptionEmailTemplate?: string;
  // New fields for workday
  workdayStart?: string; // "07:30"
  workdayEnd?: string;   // "17:30"
  workdays?: number[];   // [1,2,3,4,5]
  lunchStart?: string;   // "12:00"
  lunchEnd?: string;     // "13:00"
  language?: 'pt-BR' | 'en-US' | 'es-ES';
  hourlyCostCalculated?: number; // New: calculated hourly rate
}

export interface SEOKeyword {
  id: string;
  keyword: string;
  rank: number;
  volume: number;
  difficulty: number;
  lastUpdated: string;
}

export interface SEOMetric {
  date: string;
  domainAuthority: number;
  organicTraffic: number;
  backlinks: number;
}

export interface SEOTask {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface SEOData {
  keywords: SEOKeyword[];
  metrics: SEOMetric[];
  tasks: SEOTask[];
}

export enum ProjectRequestStatus {
  PENDING = 'PENDENTE',
  IN_PROGRESS = 'EM PROJETO',
  COMPLETED = 'CONCLUÍDO',
  CANCELLED = 'CANCELADO'
}

export enum GanttTaskStatus {
  TODO = 'todo',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
  CLOSED = 'closed'
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface ProjectRequest {
  id: string;
  clientName: string;
  ns: string;
  productType: string;
  dimension: string; // COMP X LARG X ALT
  flooring: string;
  setup: string;
  chassisNumber?: string;
  status: ProjectRequestStatus;
  createdAt: string;
  createdBy: string;
  assignedTo?: string;
  
  // Tracking parts
  needsBase: boolean;
  needsBox: boolean;
  baseProjectId?: string;
  boxProjectId?: string;
  
  // Estimates
  managementEstimate?: number; // in hours
  designerEstimate?: number;   // in hours
}

export interface GanttAttachment {
  id: string;
  name: string;
  url: string;
  type: string;
  uploadedAt: string;
}

export interface GanttTask {
  id: string;
  title: string;
  description?: string;
  parentId?: string | null;
  startDate: string;
  endDate: string;
  color: string;
  isMilestone: boolean;
  assignedTo: string[]; // List of user IDs
  progress: number;
  attachments: GanttAttachment[];
  createdAt: string;
  updatedAt: string;
  workload?: { [userId: string]: number }; // Hours dedicated per person
  reports?: string; // Reporting/Notes
  order?: number;
  dependencies?: string[]; // IDs of predecessor tasks
  status: GanttTaskStatus;
  priority: TaskPriority;
  category?: string;
}

export interface AppState {
  projects: ProjectSession[];
  issues: IssueRecord[];
  innovations: InnovationRecord[];
  interruptions: InterruptionRecord[];
  interruptionTypes: InterruptionType[];
  activityTypes: ActivityType[];
  operationalActivities: OperationalActivity[];
  projectRequests: ProjectRequest[];
  ganttTasks: GanttTask[]; // New field
  users: User[];
  settings: AppSettings;
  seoData?: SEOData;
}
