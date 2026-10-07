// O aviso amarelo "parecido com o que Fulano está tocando" (07/10/2026) — ver parecidosService.ts.
// Aparece logo abaixo do item cujo texto acabou de ser GRAVADO; não impede nada e some no "×" (só nesta sessão).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Users, X } from 'lucide-react';
import {
  ParecidosResposta, ParecidoTipo, buscarParecidos, dispensar, foiDispensado, fraseDosNomes, rotuloItem, valeProcurar,
} from './parecidosService';

export const ParecidosAviso: React.FC<{ resposta: ParecidosResposta; onDispensar: () => void }> = ({ resposta, onDispensar }) => (
  <div role="status" aria-live="polite" className="mt-2 flex items-start gap-2.5 rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50/80 dark:bg-amber-900/15 px-3 py-2 no-print" data-parecidos={resposta.nivel}>
    <Users size={14} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
    <div className="min-w-0 flex-1">
      <p className="font-mono text-[10px] font-bold tracking-[0.18em] uppercase text-amber-700 dark:text-amber-400">Iniciativa parecida</p>
      {resposta.nivel === 'nomes' ? (
        <p className="text-xs text-amber-900 dark:text-amber-100 mt-0.5">{fraseDosNomes(resposta.itens.map(i => i.nome))}</p>
      ) : (<>
        <p className="text-xs text-amber-900 dark:text-amber-100 mt-0.5">Parecido com:</p>
        <ul className="mt-1 space-y-1">
          {resposta.itens.map((i, n) => (
            <li key={`${i.dono}|${i.tipo}|${i.ref}|${n}`} className="text-xs text-amber-900 dark:text-amber-100 leading-snug">
              <span className="font-mono text-[11px] font-bold">{rotuloItem(i.tipo, i.ref)}</span>
              {' de '}<span className="font-semibold" title={i.dono ? `login: ${i.dono}` : undefined}>{i.nome}</span>
              {' — '}<span>“{i.titulo}”</span>
              {i.motivo && <span className="block text-[11px] text-slate-500 dark:text-slate-400">{i.motivo}</span>}
            </li>
          ))}
        </ul>
      </>)}
      {/* Nos DOIS níveis (decisão 3 do Edson: sem IA, "só texto com corte mais alto — e diz isso"). Frase fixa: não
          conta nada do OKR alheio; o servidor só manda 'indisponivel' ao nível nomes quando já há nome no aviso. */}
      {resposta.ia === 'indisponivel' && <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">(pelo texto — a IA não respondeu)</p>}
    </div>
    <button type="button" onClick={onDispensar} title="Dispensar este aviso (volta só se o texto mudar)" aria-label="Dispensar este aviso"
      className="shrink-0 rounded p-0.5 text-amber-600/70 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400/70 dark:hover:text-amber-200 dark:hover:bg-amber-900/30">
      <X size={14} />
    </button>
  </div>
);

type Aviso = { resposta: ParecidosResposta; texto: string };

/**
 * Os avisos de um OKR aberto. `aposGravar` é chamado na hora em que a pessoa confirma um texto (com a promessa da
 * gravação): o aviso velho daquele item some na hora; se gravou, pergunta ao servidor; a resposta só aparece se o
 * item não mudou de novo no meio (respostas fora de ordem são jogadas fora). `ativo` = a tela pode editar.
 */
export const useAvisosParecidos = (ownerKey: string, ativo: boolean) => {
  const [avisos, setAvisos] = useState<Record<string, Aviso>>({});
  const avisosRef = useRef(avisos); avisosRef.current = avisos;
  const seqs = useRef(new Map<string, number>());
  const pedidos = useRef(new Map<string, AbortController>());
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    const ps = pedidos.current;
    return () => { vivo.current = false; ps.forEach(c => c.abort()); ps.clear(); };
  }, []);

  const tirar = (item: string) => setAvisos(a => { if (!(item in a)) return a; const r = { ...a }; delete r[item]; return r; });

  const aposGravar = useCallback((item: string, tipo: ParecidoTipo, ref: string | undefined, texto: string, gravou: Promise<boolean> | boolean | void) => {
    const seq = (seqs.current.get(item) || 0) + 1;
    seqs.current.set(item, seq);
    pedidos.current.get(item)?.abort(); pedidos.current.delete(item);
    tirar(item);                                                   // o item mudou: o aviso velho não vale mais
    if (!ativo || !ownerKey || !valeProcurar(texto) || foiDispensado(ownerKey, item, texto)) return;
    const atual = () => vivo.current && seqs.current.get(item) === seq;
    Promise.resolve(gravou).then(ok => {
      if (ok !== true || !atual()) return;                         // não gravou, ou já mudou de novo
      const c = new AbortController(); pedidos.current.set(item, c);
      return buscarParecidos({ ownerKey, texto, tipo, ref }, c.signal).then(resposta => {
        if (pedidos.current.get(item) === c) pedidos.current.delete(item);
        if (!atual() || !resposta || foiDispensado(ownerKey, item, texto)) return;   // fora de ordem / nada / dispensado
        setAvisos(a => ({ ...a, [item]: { resposta, texto } }));
      });
    }).catch(() => { /* o aviso nunca atrapalha quem escreve */ });
  }, [ativo, ownerKey]);

  const dispensarAviso = useCallback((item: string) => {
    const x = avisosRef.current[item];
    if (x) dispensar(ownerKey, item, x.texto);
    tirar(item);
  }, [ownerKey]);

  /** O aviso do item (ou nada), pronto para pôr logo abaixo dele. */
  const avisoDe = (item: string): React.ReactNode => {
    const x = avisos[item];
    return x ? <ParecidosAviso resposta={x.resposta} onDispensar={() => dispensarAviso(item)} /> : null;
  };

  return { aposGravar, avisoDe, dispensarAviso, avisos };
};
