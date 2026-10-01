import { useCallback, useEffect, useRef, useState } from 'react';
import { KpisAcesso } from './kpis';
import { kpisService } from './kpisService';

// O "KPI dos setores" no menu: quem aparece é o que o BANCO diz (kpis_meu_acesso) — o
// setor da pessoa, se ela é do grupo que vê tudo, quantos indicadores enxerga. Uma
// leitura por login; relê ao voltar para a janela, no máximo a cada 10 min (o setor
// da pessoa pode ter mudado na Equipe). null = ainda não leu, a 023 não está no banco
// ou não deu para ler — o menu esconde a aba (o master ainda a vê, para ler o aviso).
const RELER_MS = 10 * 60 * 1000;

// `lido`: já houve uma tentativa para este login (deu certo, falhou ou a 023 falta) — só então o App
// pode concluir "não tem acesso" e tirar a pessoa da aba.
export function useKpisAcesso(userId: string | undefined, enabled: boolean): { acesso: KpisAcesso | null; lido: boolean; reler: () => Promise<void> } {
  const [acesso, setAcesso] = useState<KpisAcesso | null>(null);
  const [lido, setLido] = useState(false);
  const ultima = useRef(0);
  const vivo = useRef(true);
  const quem = useRef(userId);
  quem.current = userId;

  const ler = useCallback(async () => {
    const eu = quem.current;
    if (!eu) { setAcesso(null); return; }
    ultima.current = Date.now();
    try {
      const a = await kpisService.acesso();
      if (vivo.current && quem.current === eu) setAcesso(a);
    } catch { /* sem rede: fica o que estava (o banco barra o que mudou) */ }
    if (vivo.current && quem.current === eu) setLido(true);
  }, []);

  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  // Trocou a pessoa: esquece o acesso da anterior na hora (nunca mostra a aba de outro login).
  useEffect(() => { setAcesso(null); setLido(false); }, [userId]);
  useEffect(() => { if (userId && enabled) ler(); }, [userId, enabled, ler]);
  useEffect(() => {
    if (!userId || !enabled) return;
    const volta = () => { if (document.visibilityState === 'visible' && Date.now() - ultima.current > RELER_MS) ler(); };
    window.addEventListener('focus', volta);
    document.addEventListener('visibilitychange', volta);
    return () => { window.removeEventListener('focus', volta); document.removeEventListener('visibilitychange', volta); };
  }, [userId, enabled, ler]);

  return { acesso, lido, reler: ler };
}
