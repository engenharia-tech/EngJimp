import { UserRole } from '../types';

// CARGOS (06/10/2026). Pedido do Edson: dois cargos novos.
//  · DIRETOR INDUSTRIAL — "tem o mesmo privilégio e visualização do CEO. Mas o cargo é diferente." Em TODA regra que
//    vale para o CEO vale para ele (ehVisaoCeo): ver todos os setores, o P&D reservado, o R$, a auditoria, os OKRs de
//    todos; e, como o CEO, só visão macro (não dá cargo nem libera acesso). Só o nome muda na tela.
//  · REPRESENTANTE — "são os vendedores que trabalham na nossa empresa. E eles precisam escrever seus OKRs assim como os
//    seus KPIs." É gente de FORA da fábrica: sempre "Somente OKR" (a tela, o servidor e o banco forçam a marca), setor
//    próprio (cada um só vê os seus indicadores — decisão dele, 06/10), só indicador lançado à mão, e nunca conta nem vê
//    a engenharia (foraDaEngenharia).
// Comparar cargo SÓ por estes ajudantes: o próximo cargo "de diretoria" ou "de fora" entra num lugar só.

export const CARGOS_VISAO_CEO: readonly UserRole[] = ['CEO', 'DIRETOR_INDUSTRIAL'];

/** CEO ou Diretor Industrial: a mesma visão e os mesmos privilégios. */
export const ehVisaoCeo = (role?: string | null): boolean => !!role && (CARGOS_VISAO_CEO as readonly string[]).includes(role);

/** Representante (vendedor, de fora da fábrica). */
export const ehRepresentante = (role?: string | null): boolean => role === 'REPRESENTANTE';

/** Fora das contas da engenharia (Dashboard, relatórios, seletores de projetista): o PROCESSOS desde sempre e o
 *  representante. NÃO serve para "quem vê": o PROCESSOS vê coisas da engenharia que o representante não pode ver. */
export const foraDaEngenharia = (role?: string | null): boolean => role === 'PROCESSOS' || role === 'REPRESENTANTE';

/** O rótulo do cargo na tela (o código do banco nunca aparece cru). */
export const ROTULO_CARGO: Record<UserRole, string> = {
  GESTOR: 'Gestor',
  PROJETISTA: 'Projetista',
  CEO: 'CEO',
  COORDENADOR: 'Coordenador',
  PROCESSOS: 'Processos',
  QUALIDADE: 'Qualidade',
  ADM_EXTERNO: 'ADM Externo',
  DIRETOR_INDUSTRIAL: 'Diretor Industrial',
  REPRESENTANTE: 'Representante',
};
export const rotuloCargo = (role?: string | null): string =>
  (role && (ROTULO_CARGO as Record<string, string>)[role]) || (role || '');

/** O setor de cada representante é só dele (o banco põe sozinho ao gravar o cadastro — migração 030). */
export const PREFIXO_SETOR_REPRESENTANTE = 'Representante — ';
