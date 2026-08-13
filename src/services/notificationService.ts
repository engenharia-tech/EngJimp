import { ProjectSession, User, InterruptionRecord } from '../types';
import { authHeaders } from './authToken';

/**
 * Notificacoes por e-mail: CONCLUSAO de projeto e INTERRUPCAO.
 * Enviadas via /api/send-email (nodemailer), que le as credenciais SMTP das
 * variaveis de ambiente do servidor (remetente naoresponda@). A senha nunca
 * fica no codigo.
 *
 * Disparo a partir do navegador de quem age (mesmo padrao do resto do app).
 * Fire-and-forget: nunca lanca excecao para nao travar o fluxo.
 */

// ====================================================================
// DESTINOS DAS NOTIFICACOES — e-mails corporativos FIXOS.
// Independentes do e-mail de LOGIN de cada usuario (o do Edson, por ex.,
// e pessoal e serve so para login/redefinicao de senha).
// Para mudar quem recebe, edite estas constantes.
// ====================================================================
const EMAIL_ENGENHARIA  = 'engenharia@joinvilleimplementos.com.br'; // Edson / Engenharia
const EMAIL_COORDENACAO = 'matheus.p@joinvilleimplementos.com.br';  // Matheus (Coordenacao)
const EMAIL_COMERCIAL   = 'comercial@furgoesjoinville.com.br';      // Vinicius (Comercial)

/** CONCLUSAO de projeto -> Engenharia + Coordenacao. */
export const getCompletionRecipients = (): string[] => [EMAIL_ENGENHARIA, EMAIL_COORDENACAO];

/** INTERRUPCAO -> Engenharia + Coordenacao + Comercial. As paradas de
 *  projeto sao ocasionadas pelo Comercial, entao precisam saber. */
export const getInterruptionRecipients = (): string[] => [EMAIL_ENGENHARIA, EMAIL_COORDENACAO, EMAIL_COMERCIAL];

// --- formatacao ---
const horas = (secs?: number): string => ((secs || 0) / 3600).toFixed(2);
const brl = (v?: number): string =>
  ('R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
    .replace(/ /g, ' '); // evita NBSP
const hhmmss = (secs?: number): string => {
  const s = Math.max(0, Math.floor(secs || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return [h, m, ss].map((x) => String(x).padStart(2, '0')).join(':');
};

// Template padrao do e-mail de CONCLUSAO. As tags [ ... ] sao substituidas
// pelos valores do projeto. E editavel em Configuracoes -> Template de
// e-mail de conclusao; se vazio, usa-se este padrao.
export const DEFAULT_COMPLETION_TEMPLATE = [
  'BOM DIA,',
  '',
  'INFORMAMOS A CONCLUSÃO DO PROJETO ABAIXO:',
  '',
  'NS: [NS]',
  'CLIENTE: [CLIENTE]',
  'CÓDIGO DO PROJETO: [CODIGO]',
  'DESIGNER: [DESIGNER]',
  'Liberado por: [LIBERADO_POR]',
  '',
  'TEMPO PLANEJADO: [TEMPO_PLANEJADO] HORAS',
  'TEMPO EXECUTADO: [TEMPO_EXECUTADO] HORAS',
  'TEMPO DE INTERRUPÇÃO: [TEMPO_INTERRUPCAO]',
  '',
  'CUSTO PRODUTIVO: [CUSTO_PRODUTIVO]',
  'CUSTO DE INTERRUPÇÕES: [CUSTO_INTERRUPCAO]',
  'CUSTO TOTAL DO PROJETO: [CUSTO_TOTAL]',
  '',
  'INTERRUPÇÕES: [QTD_INTERRUPCOES]',
  '',
  'DETALHAMENTO DAS INTERRUPÇÕES:',
  '[DETALHE_INTERRUPCOES]',
  '',
  'OBSERVAÇÕES:',
  '[OBSERVACOES]',
  '',
  'ATENCIOSAMENTE.',
  'JIMPNEXUS',
].join('\n');

/** Tags aceitas no template de conclusao (para a tela de Configuracoes). */
export const COMPLETION_TEMPLATE_TAGS = [
  '[NS]', '[CLIENTE]', '[CODIGO]', '[DESIGNER]', '[LIBERADO_POR]',
  '[TEMPO_PLANEJADO]', '[TEMPO_EXECUTADO]', '[TEMPO_INTERRUPCAO]',
  '[CUSTO_PRODUTIVO]', '[CUSTO_INTERRUPCAO]', '[CUSTO_TOTAL]',
  '[QTD_INTERRUPCOES]', '[DETALHE_INTERRUPCOES]', '[OBSERVACOES]',
];

/**
 * E-mail de CONCLUSAO de projeto (disparado quando um PROJETISTA conclui).
 * Usa o `template` (editavel em Configuracoes) com substituicao de tags;
 * se vazio, cai no DEFAULT_COMPLETION_TEMPLATE (formato padrao da engenharia).
 */
export const notifyProjectCompletion = async (
  project: ProjectSession,
  completedBy: User,
  users: User[] = [],
  interruptions: InterruptionRecord[] = [],
  template?: string
): Promise<void> => {
  try {
    const recipients = getCompletionRecipients();

    const designer = users.find((u) => u.id === project.userId);
    const designerName = designer
      ? `${designer.name} ${designer.surname || ''}`.trim()
      : `${completedBy.name} ${completedBy.surname || ''}`.trim();
    const liberadoPor = `${completedBy.name} ${completedBy.surname || ''}`.trim();

    const doProjeto = (interruptions || []).filter(
      (i) =>
        (i.projectId && i.projectId === project.id) ||
        (i.projectNs && String(i.projectNs) === String(project.ns))
    );
    const detalhe = doProjeto.length
      ? doProjeto
          .map((i) => `- ${i.problemType || 'Interrupção'} (${i.responsibleArea || '—'}): ${hhmmss(i.totalTimeSeconds)}`)
          .join('<br>')
      : 'NENHUMA INTERRUPÇÃO REGISTRADA.';

    const observacoes = (project.notes || '').trim() || 'NENHUMA';

    const subject = `Conclusão de Projeto — NS ${project.ns}`;

    // Valores para as tags do template.
    const vars: Record<string, string> = {
      '[NS]': String(project.ns ?? ''),
      '[CLIENTE]': project.clientName || 'NÃO INFORMADO',
      '[CODIGO]': project.projectCode || 'NÃO INFORMADO',
      '[DESIGNER]': designerName,
      '[LIBERADO_POR]': liberadoPor,
      '[TEMPO_PLANEJADO]': horas(project.estimatedSeconds),
      '[TEMPO_EXECUTADO]': horas(project.totalActiveSeconds),
      '[TEMPO_INTERRUPCAO]': hhmmss(project.interruptionSeconds),
      '[CUSTO_PRODUTIVO]': brl(project.productiveCost),
      '[CUSTO_INTERRUPCAO]': brl(project.interruptionCost),
      '[CUSTO_TOTAL]': brl(project.totalCost),
      '[QTD_INTERRUPCOES]': String(doProjeto.length),
      '[DETALHE_INTERRUPCOES]': detalhe,
      '[OBSERVACOES]': observacoes,
    };

    const modelo = (template && template.trim()) ? template : DEFAULT_COMPLETION_TEMPLATE;
    let texto = modelo;
    for (const [tag, valor] of Object.entries(vars)) {
      texto = texto.split(tag).join(valor);
    }
    const body = texto.replace(/\n/g, '<br>');

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ subject, body, to: recipients.join(','), fromName: 'JIMPNexus KPI' }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[Notificacao] Falha ao enviar e-mail de conclusao:', response.status, detail);
    }
  } catch (error) {
    console.error('[Notificacao] Erro inesperado ao notificar conclusao:', error);
  }
};
