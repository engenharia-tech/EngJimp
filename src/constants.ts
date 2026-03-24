import { ProjectType, IssueType, ImplementType } from './types';

export const PROJECT_TYPES = [
  ProjectType.DEVELOPMENT,
  ProjectType.RELEASE,
  ProjectType.VARIATION
];

export const IMPLEMENT_TYPES = [
  ImplementType.BASCULANTE,
  ImplementType.BASE,
  ImplementType.CAIXA_CARGA,
  ImplementType.CARGA_SECA,
  ImplementType.COMPONENTES,
  ImplementType.FURGAO,
  ImplementType.GRANELEIRO,
  ImplementType.OUTROS,
  ImplementType.SIDER,
  ImplementType.SOBRECHASSI,
  ImplementType.SOBRE_CHASSI_FURGAO,
  ImplementType.SOBRE_CHASSI_LONADO
];

export const FLOORING_TYPES = [
  'M/F 20mm',
  'M/F 30mm',
  'Naval 15mm',
  'Naval 18mm',
  'Naval 24mm',
  'Naval 27mm',
  'Omega 28mm',
  'Sonata',
  'XDZ 3mm',
  'XDZ 4,75mm'
].sort();

export const ISSUE_TYPES = [
  IssueType.ALINHAMENTO_EIXOS,
  IssueType.CHAPEACAO,
  IssueType.COMERCIAL,
  IssueType.CORTE_DOBRA,
  IssueType.ELETRICA_ABS_EBS,
  IssueType.ENGENHARIA,
  IssueType.MECANICA_SOBRE_CHASSI,
  IssueType.MECANICA_SR,
  IssueType.MONTAGEM_ACESSORIOS,
  IssueType.MONTAGEM_CAIXA_CARGA,
  IssueType.MONTAGEM_CHASSI,
  IssueType.MONTAGEM_TETO,
  IssueType.PCP_COMPONENTES,
  IssueType.PCP_PECAS,
  IssueType.PINTURA,
  IssueType.PORTAS,
  IssueType.QUALIDADE_INSPECAO_FINAL
];

export const INTERRUPTION_AREAS = [
  'Cadastro',
  'Cliente',
  'Comercial',
  'Engenharia',
  'Jimpservice',
  'Outros'
];

export const DEFAULT_INTERRUPTION_TYPES = [
  'falta de informações',
  'Informações erradas',
  'outros',
  'Peças oficina (Jimpservice)'
];

export const DEFAULT_ACTIVITY_TYPES = [
  'ALMOÇO',
  'ALONGAMENTO',
  'DESENVOLVIMENTO PROJETO',
  'FÁBRICA',
  'FÉRIAS',
  'FOLGA',
  'GERENCIAL',
  'OFICINA',
  'OUTROS',
  'P&D',
  'PADRÃO',
  'RETRABALHO',
  'RETRABALHO SOLICITADO',
  'REUNIÃO',
  'VIAGEM'
];

export const STORAGE_KEY = 'design_track_pro_data';
