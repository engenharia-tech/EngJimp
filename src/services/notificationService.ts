import { ProjectSession, User, InterruptionRecord } from '../types';

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

/**
 * E-mail de CONCLUSAO de projeto (disparado quando um PROJETISTA conclui).
 * Segue o formato padrao da engenharia (NS, cliente, tempos, custos,
 * detalhamento de interrupcoes e observacoes).
 */
export const notifyProjectCompletion = async (
  project: ProjectSession,
  completedBy: User,
  users: User[] = [],
  interruptions: InterruptionRecord[] = []
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
    const body = [
      'BOM DIA,',
      '',
      'INFORMAMOS A CONCLUSÃO DO PROJETO ABAIXO:',
      '',
      `NS: ${project.ns}`,
      `CLIENTE: ${project.clientName || 'NÃO INFORMADO'}`,
      `CÓDIGO DO PROJETO: ${project.projectCode || 'NÃO INFORMADO'}`,
      `DESIGNER: ${designerName}`,
      `Liberado por: ${liberadoPor}`,
      '',
      `TEMPO PLANEJADO: ${horas(project.estimatedSeconds)} HORAS`,
      `TEMPO EXECUTADO: ${horas(project.totalActiveSeconds)} HORAS`,
      `TEMPO DE INTERRUPÇÃO: ${hhmmss(project.interruptionSeconds)}`,
      '',
      `CUSTO PRODUTIVO: ${brl(project.productiveCost)}`,
      `CUSTO DE INTERRUPÇÕES: ${brl(project.interruptionCost)}`,
      `CUSTO TOTAL DO PROJETO: ${brl(project.totalCost)}`,
      '',
      `INTERRUPÇÕES: ${doProjeto.length}`,
      '',
      'DETALHAMENTO DAS INTERRUPÇÕES:',
      detalhe,
      '',
      'OBSERVAÇÕES:',
      observacoes,
      '',
      'ATENCIOSAMENTE.',
      'JIMPNEXUS',
    ].join('<br>');

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
