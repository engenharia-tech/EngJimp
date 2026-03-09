import { ProjectSession, User } from '../types';

// Key for storing the webhook URL in localStorage
const WEBHOOK_STORAGE_KEY = 'eng_jimp_excel_webhook_url';

export const getWebhookUrl = (): string => {
    return localStorage.getItem(WEBHOOK_STORAGE_KEY) || '';
};

export const saveWebhookUrl = (url: string): void => {
    localStorage.setItem(WEBHOOK_STORAGE_KEY, url);
};

export const triggerExcelUpdate = async (project: ProjectSession, user: User | null) => {
    const url = getWebhookUrl();
    if (!url) {
        console.log("No Excel Webhook URL configured. Skipping integration.");
        return;
    }

    try {
        // Prepare payload matching the user request:
        // "NOME DO PROJETISTA, NS, TIPO DE PRODUTO, DATA DA CONCLUSÃO, HORA DA CONCLUSÃO"
        
        const now = new Date();
        const completionDate = now.toLocaleDateString('pt-BR'); // DD/MM/YYYY
        const completionTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); // HH:mm
        
        const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
        const currentMonthName = monthNames[now.getMonth()];

        const payload = {
            projetista: user?.name || 'Desconhecido',
            ns: project.ns,
            tipo_produto: project.implementType || project.type, // "Tipo de Produto" usually refers to the implement (Furgão, etc.)
            data_conclusao: completionDate,
            hora_conclusao: completionTime,
            mes_referencia: currentMonthName, // Added for tab selection logic
            // Extra fields just in case they are useful
            cliente: project.clientName,
            codigo_projeto: project.projectCode,
            duracao_horas: (project.totalActiveSeconds / 3600).toFixed(2)
        };

        console.log("Sending data to Excel Webhook...", payload);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`Webhook failed with status: ${response.status}`);
        }

        console.log("Excel Webhook triggered successfully.");
    } catch (error) {
        console.error("Failed to trigger Excel Webhook:", error);
        // We don't block the UI flow for this, just log it.
    }
};
