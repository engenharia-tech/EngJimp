import { ProjectSession, User } from '../types';

/**
 * Notificacao de CONCLUSAO de projeto.
 *
 * Quando um PROJETISTA conclui um projeto, gestor(es) e coordenador(es)
 * recebem um e-mail. O envio usa o endpoint /api/send-email (nodemailer),
 * que le as credenciais SMTP das variaveis de ambiente do servidor
 * (EMAIL_HOST/PORT/USER/PASS/FROM) — a senha NUNCA fica no codigo nem no
 * repositorio, mesmo padrao do correio.py do APPCUSTOS.
 *
 * Para usar o remetente naoresponda@joinvilleimplementos.com.br, configure
 * na Vercel (e no .env local, se for testar):
 *   EMAIL_HOST=mail.joinvilleimplementos.com.br
 *   EMAIL_PORT=465
 *   EMAIL_USER=naoresponda@joinvilleimplementos.com.br
 *   EMAIL_PASS=<a senha, so no ambiente>
 *   EMAIL_FROM=naoresponda@joinvilleimplementos.com.br
 *
 * Nota de arquitetura: este disparo parte do navegador de quem concluiu
 * (mesmo padrao do e-mail de interrupcao). E simples, mas se o navegador
 * fechar antes do fetch completar, a notificacao se perde. A versao robusta
 * (fila/outbox no banco + n8n, com retentativa) fica para a etapa de WhatsApp.
 */

const isValidEmail = (email?: string): email is string =>
  !!email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

/** Gestores e coordenadores com e-mail valido cadastrado. */
export const getCompletionRecipients = (users: User[] = []): string[] => {
  const seen = new Set<string>();
  const recipients: string[] = [];
  for (const u of users) {
    if (u.role !== 'GESTOR' && u.role !== 'COORDENADOR') continue;
    const email = u.email?.trim().toLowerCase();
    if (!isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    recipients.push(u.email!.trim());
  }
  return recipients;
};

/**
 * Dispara o e-mail de conclusao. Fire-and-forget: nunca lanca excecao para
 * nao travar o fluxo de finalizacao do projetista; falhas ficam no console.
 */
export const notifyProjectCompletion = async (
  project: ProjectSession,
  completedBy: User,
  users: User[] = []
): Promise<void> => {
  try {
    const recipients = getCompletionRecipients(users);
    if (recipients.length === 0) {
      console.warn(
        '[Notificacao] Projeto concluido, mas nenhum GESTOR/COORDENADOR tem e-mail valido cadastrado. E-mail nao enviado.'
      );
      return;
    }

    const projetistaNome = `${completedBy.name} ${completedBy.surname || ''}`.trim();
    const horas = ((project.totalActiveSeconds || 0) / 3600).toFixed(2);
    const conclusao = project.endTime
      ? new Date(project.endTime).toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');
    const tipoProduto = project.implementType || project.type || 'Nao informado';

    const subject = `✅ Projeto concluido: NS ${project.ns} — ${projetistaNome}`;

    const linhas = [
      `<b>Projetista:</b> ${projetistaNome}`,
      `<b>NS:</b> ${project.ns}`,
      `<b>Cliente:</b> ${project.clientName || 'Nao informado'}`,
      `<b>Tipo / Produto:</b> ${tipoProduto}`,
      project.projectCode ? `<b>Codigo do projeto:</b> ${project.projectCode}` : '',
      `<b>Tempo trabalhado:</b> ${horas} h`,
      `<b>Concluido em:</b> ${conclusao}`,
    ].filter(Boolean);

    const body =
      `O projetista <b>${projetistaNome}</b> concluiu um projeto.<br><br>` +
      linhas.join('<br>') +
      `<br><br>Mensagem automatica do JIMPNexus KPI. Nao responda este e-mail.`;

    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject,
        body,
        to: recipients.join(','),
        fromName: 'JIMPNexus KPI',
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[Notificacao] Falha ao enviar e-mail de conclusao:', response.status, detail);
    }
  } catch (error) {
    // Nunca bloquear a finalizacao do projeto por causa do e-mail.
    console.error('[Notificacao] Erro inesperado ao notificar conclusao:', error);
  }
};
