import { ProjectType, IssueType, ImplementType } from './types';

export const PROJECT_TYPES = [
  ProjectType.DEVELOPMENT,
  ProjectType.RELEASE,
  ProjectType.VARIATION
].sort();

export const IMPLEMENT_TYPES = [
  ImplementType.BASCULANTE,
  ImplementType.CARGA_SECA_SC,
  ImplementType.CARGA_SECA_SR,
  ImplementType.COMPONENTES,
  ImplementType.FURGAO_SC,
  ImplementType.FURGAO_SR,
  ImplementType.GRANELEIRO,
  ImplementType.SIDER_SC,
  ImplementType.SIDER_SR,
  ImplementType.OUTROS
];

export const FLOORING_TYPES = [
  'M/F 20MM',
  'M/F 30MM',
  'NAVAL 15MM',
  'NAVAL 18MM',
  'NAVAL 24MM',
  'NAVAL 27MM',
  'OMEGA 28MM',
  'SONATA',
  'XDZ 3MM',
  'XDZ 4,75MM'
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
].sort();

export const INTERRUPTION_AREAS = [
  'CADASTRO',
  'CLIENTE',
  'COMERCIAL',
  'ENGENHARIA',
  'JIMPSERVICE',
  'OUTROS'
].sort();

export const DEFAULT_INTERRUPTION_TYPES = [
  'FALTA DE INFORMAÇÕES',
  'INFORMAÇÕES ERRADAS',
  'OUTROS',
  'PEÇAS OFICINA (JIMPSERVICE)'
].sort();

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
].sort();

export const SUSPENSION_TYPES = [
  'MEC 2E',
  'MEC 3E',
  'MISTA 3ED',
  'MISTA 4ED',
  'PNEUM 2E',
  'PNEUM 3E',
  'PNEUM 3ED',
  'PNEUM 4E'
].sort();

export const PRODUCT_CATEGORIES = [
  'BASCULANTE',
  'CARGA SECA SC',
  'CARGA SECA SR',
  'COMPONENTES',
  'FURGÃO SC',
  'FURGÃO SR',
  'GRANELEIRO',
  'SIDER SC',
  'SIDER SR',
  'OUTROS'
];

export const STORAGE_KEY = 'design_track_pro_data';
