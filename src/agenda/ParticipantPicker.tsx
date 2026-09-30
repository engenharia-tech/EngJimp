import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X, Check, AlertTriangle, UserRoundX } from 'lucide-react';
import { User } from '../types';
import { emailRecebeAlerta, AGENDA_EMAIL_DOMINIOS, AgendaOcupado, resumoOcupado } from './agenda';
import { ativoNaData, hojeJoinville, rotuloDesligado } from '../utils/custoHora';

// Escolha dos PARTICIPANTES de um compromisso da agenda (29/09/2026).
//
// Decisão do Edson (29/09): o e-mail vai para o dono + participantes escolhidos entre os
// USUÁRIOS CADASTRADOS — nunca um e-mail digitado solto. Por isso aqui não há campo de
// e-mail: só a lista do cadastro. Quem não tem e-mail cadastrado pode ser escolhido (fica
// registrado que vai), mas aparece avisado: "sem e-mail — não recebe alerta".
// Decisão dele (29/09, à tarde): e-mail da agenda só para os domínios da empresa (e o do
// Edson, qualquer que seja). Quem tem e-mail de FORA também pode ser escolhido, mas aparece
// avisado: "e-mail fora da empresa — não recebe alerta" (regra em emailRecebeAlerta, agenda.ts;
// quem decide é o servidor, que também aceita os endereços de Configurações — daí o
// "provavelmente" no resumo).
//
// Teclado: a busca é uma combobox sempre aberta (↑/↓ andam na lista, Enter marca/desmarca,
// PageUp/PageDown pulam). A lista não é um popup de propósito: o Esc do modal (useDialog)
// é capturado no document antes de chegar aqui, então um popup não teria como fechar sozinho.
//
// Livre/ocupado (migração 016 — decisão do Edson, 29/09 fim da tarde): com `ocupacao`, cada
// pessoa CONSULTADA ganha um selo "livre" (verde) ou "ocupado 14:00–15:30" (âmbar; vários =
// o primeiro + "+N"; dia inteiro = "ocupado o dia todo"). Só o HORÁRIO — nunca título,
// local, tipo, participantes nem dono do compromisso que ocupa (o banco nem devolve). É
// aviso: quem está ocupado continua podendo ser escolhido. Sem `ocupacao` (painel só
// leitura, hora incompleta, 016 ainda não rodada, conferência em andamento), não há selo.

export const PARTICIPANTES_MAX = 30;

// O que o painel descobriu para a janela ATUAL do compromisso. Quem não está em `consultados`
// fica sem selo (não se sabe); consultado e fora de `porPessoa` = livre.
export interface OcupacaoInfo {
  porPessoa: Map<string, AgendaOcupado[]>;
  consultados: Set<string>;
  janela: { inicio: Date; fim: Date };
}

const SELO = 'inline-flex items-center gap-1 shrink-0 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-bold tabular-nums';
// null = livre; o resumo = ocupado. O texto diz tudo (não só a cor).
const SeloDisp: React.FC<{ r: ReturnType<typeof resumoOcupado> }> = ({ r }) => r ? (
  <span title={`Ocupado neste horário: ${r.todos.join(' · ')} (só o horário — o assunto não aparece)`}
    className={`${SELO} bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700`}>
    <AlertTriangle size={10} aria-hidden="true" />
    {r.texto}
    {r.mais > 0 && <><span aria-hidden="true">+{r.mais}</span><span className="sr-only"> e mais {r.mais} {r.mais === 1 ? 'horário' : 'horários'}</span></>}
  </span>
) : (
  <span className={`${SELO} bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800`}>
    <Check size={10} strokeWidth={3} aria-hidden="true" />livre
  </span>
);

const norm = (s: string | null | undefined) =>
  String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const nomeCompleto = (u: Pick<User, 'name' | 'surname' | 'username'> | null | undefined): string => {
  if (!u) return '—';
  return `${u.name || ''}${u.surname ? ' ' + u.surname : ''}`.trim() || u.username || '—';
};

// Tem e-mail cadastrado utilizável (o servidor é quem manda; isto é só para avisar na tela).
export const temEmail = (u: Pick<User, 'email'> | null | undefined): boolean =>
  !!u && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(u.email || '').trim());

// Tem e-mail, mas de FORA da empresa: a agenda (provavelmente) não manda para ele.
export const emailForaDaEmpresa = (u: Pick<User, 'email' | 'id'> | null | undefined): boolean =>
  !!u && temEmail(u) && !emailRecebeAlerta(u.email, u.id);
// Recebe os alertas de verdade: tem e-mail E o e-mail passa na regra dos domínios.
export const recebeAlerta = (u: Pick<User, 'email' | 'id'> | null | undefined): boolean =>
  !!u && temEmail(u) && emailRecebeAlerta(u.email, u.id);
// "@jimp.com.br, @joinvilleimplementos.com.br e @furgoesjoinville.com.br"
export const dominiosEmpresaTexto = (): string => {
  const l = AGENDA_EMAIL_DOMINIOS.map(d => `@${d}`);
  return l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l.join('');
};

const iniciais = (u: User | undefined) => {
  if (!u) return '?';
  const a = (u.name || u.username || '?').trim();
  const b = (u.surname || '').trim();
  return ((a[0] || '?') + (b[0] || a[1] || '')).toUpperCase();
};

interface Props {
  users: User[];
  value: string[];
  onChange: (ids: string[]) => void;
  excludeId?: string;
  disabled?: boolean;
  ocupacao?: OcupacaoInfo | null;
}

export const ParticipantPicker: React.FC<Props> = ({ users, value, onChange, excludeId, disabled, ocupacao }) => {
  const baseId = useId();
  const listId = `${baseId}-lista`;
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [focused, setFocused] = useState(false);
  const [live, setLive] = useState('');
  const listRef = useRef<HTMLUListElement>(null);

  const ids = Array.isArray(value) ? value : [];
  const chosen = useMemo(() => new Set(ids), [ids]);
  // Os escolhidos quando o formulário abriu (o mesmo momento do `base` do AgendaItemModal).
  const [escolhidosAoAbrir] = useState(() => new Set(ids));
  const byId = useMemo(() => new Map((users || []).filter(u => u && u.id).map(u => [u.id, u] as const)), [users]);
  const hoje = hojeJoinville();

  // Todos os cadastrados, menos o dono do compromisso (ele já recebe como dono).
  // Desligado (decisão do Edson, 30/09/2026: "desligar, não excluir"): depois do último dia a
  // pessoa não aparece para escolha NOVA. Quem já é participante continua na lista, com
  // "(desligado)", para poder ser tirado — e quem era participante quando o formulário abriu
  // fica até ele fechar (tirar sem querer tem volta). Nenhuma outra regra da Agenda muda.
  const pool = useMemo(() => (users || [])
    .filter(u => u && u.id && u.id !== excludeId && (ativoNaData(u, hoje) || chosen.has(u.id) || escolhidosAoAbrir.has(u.id)))
    .sort((a, b) => nomeCompleto(a).localeCompare(nomeCompleto(b), 'pt-BR', { sensitivity: 'base' })), [users, excludeId, hoje, chosen, escolhidosAoAbrir]);

  // Busca por nome, sobrenome e setor, sem acento e sem maiúscula; cada palavra precisa bater.
  const shown = useMemo(() => {
    const toks = norm(q).split(/\s+/).filter(Boolean);
    if (!toks.length) return pool;
    return pool.filter(u => {
      const hay = norm(`${u.name || ''} ${u.surname || ''} ${u.sector || ''}`);
      return toks.every(t => hay.includes(t));
    });
  }, [pool, q]);

  // A busca mudou: volta para o primeiro da lista.
  useEffect(() => { setActive(0); }, [q]);
  // A lista encolheu: o ativo não pode apontar para fora dela.
  useEffect(() => { setActive(a => Math.min(a, Math.max(0, shown.length - 1))); }, [shown.length]);

  // Mantém o ativo visível rolando SÓ a lista (scrollIntoView rolaria o modal inteiro).
  useEffect(() => {
    const list = listRef.current; if (!list || !focused) return;
    const el = list.querySelector<HTMLElement>(`[data-idx="${active}"]`); if (!el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  }, [active, focused]);

  const cheio = ids.length >= PARTICIPANTES_MAX;
  const semEmailN = ids.filter(id => !temEmail(byId.get(id))).length;
  const foraN = ids.filter(id => emailForaDaEmpresa(byId.get(id))).length;
  // undefined = não se sabe (sem selo); null = livre; resumo = ocupado.
  const dispDe = (id: string) => ocupacao && ocupacao.consultados.has(id) ? resumoOcupado(ocupacao.porPessoa.get(id), ocupacao.janela) : undefined;
  const ocupN = ids.filter(id => byId.has(id) && !!dispDe(id)).length;

  const toggle = (id: string) => {
    if (disabled) return;
    const u = byId.get(id);
    const nome = u ? nomeCompleto(u) : 'Participante';
    if (chosen.has(id)) {
      const next = ids.filter(x => x !== id);
      onChange(next);
      setLive(`${nome} saiu da lista. ${next.length} participante(s).`);
      return;
    }
    if (cheio) { setLive(`Limite de ${PARTICIPANTES_MAX} participantes atingido.`); return; }
    const next = [...ids, id];
    onChange(next);
    const d = u ? dispDe(id) : undefined;
    const disp = d === undefined ? '' : d ? ` Ocupado neste horário: ${d.todos.join(', ')}.` : ' Livre neste horário.';
    setLive(`${nome} entrou na lista${u && !temEmail(u) ? ' (sem e-mail — não recebe alerta)' : emailForaDaEmpresa(u) ? ' (e-mail fora da empresa — não recebe alerta)' : ''}.${disp} ${next.length} participante(s).`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    const n = shown.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (n) setActive(a => (a + 1) % n); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) setActive(a => (a - 1 + n) % n); }
    else if (e.key === 'PageDown') { e.preventDefault(); if (n) setActive(a => Math.min(n - 1, a + 8)); }
    else if (e.key === 'PageUp') { e.preventDefault(); if (n) setActive(a => Math.max(0, a - 8)); }
    else if (e.key === 'Enter') {
      e.preventDefault();                   // Enter aqui nunca grava o compromisso
      const u = shown[active]; if (u) toggle(u.id);
    }
  };

  const optId = (id: string) => `${baseId}-op-${id}`;
  const activeUser = focused ? shown[active] : undefined;

  return (
    <div className="space-y-2 min-w-0">
      {/* Escolhidos */}
      {ids.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Participantes escolhidos">
          {ids.map(id => {
            const u = byId.get(id);
            const ok = recebeAlerta(u);
            const fora = emailForaDaEmpresa(u);
            const disp = u ? dispDe(id) : undefined;
            const nome = u ? nomeCompleto(u) : 'Usuário fora do cadastro';
            const desligado = u ? rotuloDesligado(u) : '';
            const tip = !u ? 'Não está mais no cadastro — não recebe alerta.'
              : desligado ? `${nome}${desligado} — já não está na empresa; não aparece para escolha nova.`
              : ok ? `${nome}${u.sector ? ` · ${u.sector}` : ''}`
              : fora ? `${nome} — e-mail fora da empresa, provavelmente não recebe alerta (a agenda só manda para ${dominiosEmpresaTexto()}).`
              : `${nome} — sem e-mail cadastrado, não recebe alerta.`;
            return (
              <li key={id} className="max-w-full">
                <span title={tip}
                  className={`inline-flex items-center gap-1.5 max-w-full pl-1 pr-1.5 py-0.5 rounded-full border text-xs font-semibold ${!u
                    ? 'border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400'
                    : ok ? 'bg-sky-50 dark:bg-sky-900/20 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-200'
                      : 'bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200'}`}>
                  <span aria-hidden="true" className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[9px] font-black ${ok ? 'bg-sky-600 text-white' : 'bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-100'}`}>
                    {u ? iniciais(u) : <UserRoundX size={11} />}
                  </span>
                  <span className="truncate">{nome}</span>
                  {desligado && <span className="shrink-0 font-medium opacity-80">{desligado.trim()}</span>}
                  {u && !ok && <AlertTriangle size={11} className="shrink-0" aria-label={fora ? 'e-mail fora da empresa' : 'sem e-mail'} />}
                  {disp !== undefined && <SeloDisp r={disp} />}
                  {!disabled && (
                    <button type="button" onClick={() => toggle(id)} aria-label={`Tirar ${nome} da lista`}
                      className="shrink-0 -mr-0.5 p-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 hover:text-rose-600 dark:hover:text-rose-400 outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
                      <X size={11} />
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">{disabled ? 'Ninguém além do dono.' : 'Ninguém além de você por enquanto.'}</p>
      )}

      {!disabled && (
        <div className="rounded-xl border border-gray-200 dark:border-slate-700 overflow-clip bg-white dark:bg-slate-900">
          <div className="relative border-b border-gray-100 dark:border-slate-800">
            <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeUser ? optId(activeUser.id) : undefined}
              aria-label="Buscar participante por nome, sobrenome ou setor"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Buscar por nome, sobrenome ou setor…"
              autoComplete="off"
              spellCheck={false}
              className="w-full pl-9 pr-16 py-2 bg-transparent text-base sm:text-sm text-slate-800 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-blue-50/40 dark:focus:bg-blue-900/10"
            />
            <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold tabular-nums ${cheio ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'}`} aria-hidden="true">
              {ids.length}/{PARTICIPANTES_MAX}
            </span>
          </div>
          <ul ref={listRef} id={listId} role="listbox" aria-multiselectable="true" aria-label="Usuários cadastrados"
            className="max-h-52 overflow-y-auto overscroll-contain relative py-1">
            {shown.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-xs text-slate-400 italic">
                {pool.length === 0 ? 'Nenhum outro usuário cadastrado.' : <>Ninguém encontrado com “{q.trim()}”.</>}
              </li>
            )}
            {shown.map((u, i) => {
              const on = chosen.has(u.id);
              const blocked = !on && cheio;
              const ok = temEmail(u);
              const fora = emailForaDaEmpresa(u);
              const disp = dispDe(u.id);
              const isActive = focused && i === active;
              return (
                <li
                  key={u.id}
                  id={optId(u.id)}
                  data-idx={i}
                  role="option"
                  aria-selected={on}
                  aria-disabled={blocked || undefined}
                  onMouseDown={e => e.preventDefault()}  // não tira o foco da busca
                  onMouseMove={() => { if (i !== active) setActive(i); }}
                  onClick={() => toggle(u.id)}
                  title={blocked ? `Limite de ${PARTICIPANTES_MAX} participantes` : undefined}
                  className={`flex items-center gap-2.5 px-3 py-2 text-sm select-none ${blocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${isActive ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'}`}
                >
                  <span aria-hidden="true" className={`w-4 h-4 shrink-0 rounded border grid place-items-center ${on ? 'bg-blue-600 border-blue-600 text-white' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'}`}>
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className={`truncate ${on ? 'font-bold text-slate-800 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200'}`}>{nomeCompleto(u)}</span>
                    {rotuloDesligado(u) && <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 shrink-0">{rotuloDesligado(u).trim()}</span>}
                    {u.sector && <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5 shrink-0">{u.sector}</span>}
                    {disp !== undefined && <SeloDisp r={disp} />}
                    {!ok && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                        <AlertTriangle size={11} aria-hidden="true" /> sem e-mail — não recebe alerta
                      </span>
                    )}
                    {fora && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400"
                        title={`A agenda só manda para ${dominiosEmpresaTexto()} (ou para um endereço liberado em Configurações).`}>
                        <AlertTriangle size={11} aria-hidden="true" /> e-mail fora da empresa — não recebe alerta
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(cheio || semEmailN > 0 || foraN > 0 || ocupN > 0) && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span className="min-w-0">
            {cheio && <>Limite de {PARTICIPANTES_MAX} participantes por compromisso. </>}
            {ocupN > 0 && <>{ocupN === 1 ? '1 escolhido já tem' : `${ocupN} escolhidos já têm`} compromisso neste horário — é só um aviso, dá para salvar assim mesmo. </>}
            {semEmailN > 0 && <>{semEmailN === 1 ? '1 escolhido está' : `${semEmailN} escolhidos estão`} sem e-mail cadastrado e não recebe{semEmailN === 1 ? '' : 'm'} alerta. </>}
            {foraN > 0 && <>{foraN === 1 ? '1 escolhido tem' : `${foraN} escolhidos têm`} e-mail de fora da empresa e provavelmente não recebe{foraN === 1 ? '' : 'm'} alerta — a agenda só manda para {dominiosEmpresaTexto()} (ou para um endereço liberado em Configurações).</>}
          </span>
        </p>
      )}
      <p className="sr-only" aria-live="polite">{live}</p>
    </div>
  );
};
