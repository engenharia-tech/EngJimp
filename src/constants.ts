import { ProjectType, IssueType, ImplementType } from './types';

export const PROJECT_TYPES = [
  ProjectType.RELEASE,
  ProjectType.VARIATION,
  ProjectType.DEVELOPMENT
];

export const IMPLEMENT_TYPES = [
  ImplementType.BASE,
  ImplementType.FURGAO,
  ImplementType.SIDER,
  ImplementType.CAIXA_CARGA,
  ImplementType.BASCULANTE,
  ImplementType.SOBRECHASSI,
  ImplementType.SOBRE_CHASSI_FURGAO,
  ImplementType.SOBRE_CHASSI_LONADO,
  ImplementType.GRANELEIRO,
  ImplementType.CARGA_SECA,
  ImplementType.COMPONENTES,
  ImplementType.OUTROS
];

export const FLOORING_TYPES = [
  'M/F 20mm',
  'M/F 30mm',
  'Omega 28mm',
  'Sonata',
  'XDZ 3mm',
  'XDZ 4,75mm',
  'Naval 15mm',
  'Naval 18mm',
  'Naval 24mm',
  'Naval 27mm'
];

export const ISSUE_TYPES = [
  IssueType.COMERCIAL,
  IssueType.CORTE_DOBRA,
  IssueType.ENGENHARIA,
  IssueType.PCP_COMPONENTES,
  IssueType.PCP_PECAS,
  IssueType.MONTAGEM_CHASSI,
  IssueType.MONTAGEM_CAIXA_CARGA,
  IssueType.MONTAGEM_TETO,
  IssueType.MONTAGEM_ACESSORIOS,
  IssueType.MECANICA_SOBRE_CHASSI,
  IssueType.MECANICA_SR,
  IssueType.CHAPEACAO,
  IssueType.PORTAS,
  IssueType.PINTURA,
  IssueType.ELETRICA_ABS_EBS,
  IssueType.ALINHAMENTO_EIXOS,
  IssueType.QUALIDADE_INSPECAO_FINAL
];

export const INTERRUPTION_AREAS = [
  'Comercial',
  'Cadastro',
  'Engenharia',
  'Cliente',
  'Jimpservice',
  'Outros'
];

export const DEFAULT_INTERRUPTION_TYPES = [
  'falta de informações',
  'Informações erradas',
  'Peças oficina (Jimpservice)',
  'outros'
];

export const STORAGE_KEY = 'design_track_pro_data';
