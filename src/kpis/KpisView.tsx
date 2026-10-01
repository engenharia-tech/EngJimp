import React, { useEffect, useMemo, useState } from 'react';
import { Gauge, RefreshCw, Lock, AlertTriangle, LayoutGrid, PencilLine, Settings2 } from 'lucide-react';
import { withOkrSafe } from '../okr/OkrSafe';
import { User } from '../types';
import { KpisAcesso, KpisIndicador, setorChave } from './kpis';
import { useKpisDados, resumoDo } from './kpisDados';
import { KpisService, kpisService as servicoPadrao, kpisErrorMessage, KPIS_NAO_INSTALADO } from './kpisService';
import { KpisPainel } from './KpisPainel';
import { KpisLancar } from './KpisLancar';
import { KpisCadastro } from './KpisCadastro';
import { KpisDetalhe } from './KpisDetalhe';
import { KpisIndicadorModal } from './KpisIndicadorModal';

// A ABA "KPI DOS SETORES" (30/09/2026, migração 023) — pedido do Edson: indicadores com meta
// para os setores fora da engenharia. Quem vê, lança e cadastra é o BANCO (kpis_meu_acesso e
// a RLS); esta tela só pergunta e desenha:
//  - a pessoa do setor vê e lança os indicadores do setor dela;
//  - o Edson, o CEO e os admins de OKR veem todos (seletor de setor);
//  - o Edson e os admins de OKR cadastram, põem meta e lançam/corrigem em qualquer setor.
// Sub-abas: Painel · Lançar · Cadastro (nenhuma se chama "Indicadores": é o nome da aba do OKR).

type Sub = 'painel' | 'lancar' | 'cadastro';

const Moldura: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-sm border border-gray-200 dark:border-slate-700 text-center space-y-2">{children}</div>
);
// Botões segmentados das sub-abas.
const SubBtn: React.FC<{ ativo: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ ativo, onClick, icon, label }) => (
  <button type="button" onClick={onClick} aria-pressed={ativo}
    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${ativo ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-blue-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
    {icon}{label}
  </button>
);

const KpisViewInner: React.FC<{
  currentUser: User;
  users: User[];
  acesso: KpisAcesso | null;          // o que o menu leu; a tela relê ao abrir
  onAcessoMudou?: () => void;         // pede ao App para reler (o menu mostra/esconde a aba)
  onUsuariosMudou?: (id: string, setor: string) => void; // o setor de alguém mudou (Pessoas e setores): o App acerta o cadastro na memória
  service?: KpisService;              // injetável: dá para abrir a tela com dados de ensaio
}> = ({ currentUser, users, acesso: acessoMenu, onAcessoMudou, onUsuariosMudou, service = servicoPadrao }) => {
  const [acesso, setAcesso] = useState<KpisAcesso | null | undefined>(acessoMenu ?? undefined);
  const [erroAcesso, setErroAcesso] = useState<unknown>(null);
  // Abrir a aba relê a verdade do banco (o setor da pessoa pode ter mudado agora).
  useEffect(() => {
    let vivo = true;
    service.acesso().then(a => { if (vivo) { setAcesso(a); setErroAcesso(null); } }).catch(e => { if (vivo) setErroAcesso(e); });
    return () => { vivo = false; };
  }, [service]);
  // O setor da pessoa pode mudar com a tela aberta (Pessoas e setores): o acesso acompanha o do menu
  // e é relido em todo "Atualizar" e depois de gravar — senão o cabeçalho dizia um setor e o Lançar
  // mostrava os indicadores de outro.
  useEffect(() => { if (acessoMenu) setAcesso(acessoMenu); }, [acessoMenu]);
  // …e quando o setor muda de fato, os indicadores são relidos (a RLS já mostra os do setor novo).
  const setorVisto = React.useRef<string | null | undefined>(undefined);
  const relerAcesso = () => service.acesso().then(a => { setAcesso(a); setErroAcesso(null); }).catch(() => { /* fica o que estava */ });

  const pode = !!acesso && acesso.cadastrado && !acesso.visualizador;
  const { dados, erro, lendo, reler } = useKpisDados(service, pode, !!acesso?.veTodos);
  const nomes = useMemo(() => new Map((users || []).map(u => [u.id, `${u.name}${u.surname ? ' ' + u.surname : ''}`.trim()] as const)), [users]);

  const [setor, setSetor] = useState<string>('todos');            // chave do setor escolhido (quem vê todos)
  const [sub, setSub] = useState<Sub | null>(null);
  const [aberto, setAberto] = useState<KpisIndicador | null>(null);
  const [editando, setEditando] = useState<KpisIndicador | null>(null);

  const inds = dados?.indicadores || [];
  const setoresDosInds = useMemo(() => {
    const g = new Map<string, string>();
    inds.forEach(i => { const k = setorChave(i.setor); if (!g.has(k)) g.set(k, i.setor); });
    return Array.from(g.entries()).map(([chave, nome]) => ({ chave, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [inds]);
  const filtrados = acesso?.veTodos && setor !== 'todos' ? inds.filter(i => setorChave(i.setor) === setor) : inds;
  const podeLancarAlgum = inds.some(i => i.ativo && i.tipo === 'manual' && i.podeLancar);

  // Abre em "Lançar" quando há o que lançar no setor DA PESSOA; senão no Painel.
  useEffect(() => {
    if (sub || !dados || !acesso) return;
    const meus = dados.indicadores.filter(i => i.ativo && i.tipo === 'manual' && i.podeLancar && setorChave(i.setor) === (acesso.setorChave || ''));
    setSub(meus.some(i => resumoDo(i, dados).pend.situacao !== 'em_dia') ? 'lancar' : 'painel');
  }, [dados, acesso, sub]);
  const subAtual: Sub = sub === 'lancar' && !podeLancarAlgum ? 'painel' : sub === 'cadastro' && !acesso?.administra ? 'painel' : (sub || 'painel');

  // O indicador aberto no detalhe acompanha a releitura (ou fecha, se sumiu).
  useEffect(() => {
    if (!aberto || !dados) return;
    const n = dados.indicadores.find(i => i.id === aberto.id);
    if (!n) setAberto(null); else if (n !== aberto) setAberto(n);
  }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps

  // Depois de gravar: relê (e o botão de quem gravou só volta quando a tela já mostra o novo).
  const gravou = async () => { await reler(); relerAcesso(); onAcessoMudou?.(); };
  useEffect(() => {
    const s = acesso ? (acesso.setorChave || '') : undefined;
    if (s === undefined) return;
    if (setorVisto.current !== undefined && setorVisto.current !== s && dados) reler();
    setorVisto.current = s;
  }, [acesso?.setorChave]); // eslint-disable-line react-hooks/exhaustive-deps
  // O setor escolhido no filtro sumiu (último indicador arquivado/excluído): volta para "Todos".
  useEffect(() => { if (setor !== 'todos' && dados && !setoresDosInds.some(s => s.chave === setor)) setSetor('todos'); }, [setor, setoresDosInds, dados]);

  // ---- estados sem painel ----
  if (acesso === undefined && !erroAcesso) return <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Abrindo o KPI dos setores…</div>;
  if (erroAcesso && acesso === undefined) return <Moldura><AlertTriangle className="mx-auto text-rose-500" size={24} /><p className="text-sm text-slate-600 dark:text-slate-300">{kpisErrorMessage(erroAcesso, 'Não consegui abrir o KPI dos setores.', true)}</p></Moldura>;
  if (acesso === null) return <Moldura><Gauge className="mx-auto text-slate-400" size={26} /><p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{KPIS_NAO_INSTALADO}</p></Moldura>;
  if (!pode) return <Moldura><Lock className="mx-auto text-slate-400" size={24} /><p className="text-sm text-slate-600 dark:text-slate-300">Você não tem acesso ao KPI dos setores.</p></Moldura>;

  return (
    <div className="space-y-5">
      <div className="relative bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 border-l-4 border-l-blue-500">
        <span className="pointer-events-none absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-orange-400/70 rounded-tr" aria-hidden="true" />
        <span className="pointer-events-none absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-orange-400/70 rounded-br" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><Gauge size={22} /></div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-slate-400 dark:text-slate-500">KPI · <span className="text-orange-500 dark:text-orange-400">Setores</span></p>
              <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Indicadores dos setores</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {acesso!.veTodos ? `Todos os setores (${new Set(inds.filter(i => i.ativo).map(i => setorChave(i.setor))).size})` : `Seu setor: ${acesso!.setorNome || '—'}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {acesso!.veTodos && setoresDosInds.length > 0 && (
              <select value={setor} onChange={e => setSetor(e.target.value)} aria-label="Setor"
                className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]">
                <option value="todos">Todos os setores</option>
                {setoresDosInds.map(s => <option key={s.chave} value={s.chave}>{s.nome}</option>)}
              </select>
            )}
            <button onClick={() => { reler(); relerAcesso(); }} disabled={lendo} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline disabled:opacity-50"><RefreshCw size={12} className={lendo ? 'animate-spin' : ''} /> Atualizar</button>
          </div>
        </div>
        <div className="mt-4 inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800" role="group" aria-label="Seções">
          <SubBtn ativo={subAtual === 'painel'} onClick={() => setSub('painel')} icon={<LayoutGrid size={13} />} label="Painel" />
          {podeLancarAlgum && <SubBtn ativo={subAtual === 'lancar'} onClick={() => setSub('lancar')} icon={<PencilLine size={13} />} label="Lançar" />}
          {acesso!.administra && <SubBtn ativo={subAtual === 'cadastro'} onClick={() => setSub('cadastro')} icon={<Settings2 size={13} />} label="Cadastro" />}
        </div>
      </div>

      {erro && !dados ? (
        <Moldura><AlertTriangle className="mx-auto text-rose-500" size={24} /><p className="text-sm text-slate-600 dark:text-slate-300">{kpisErrorMessage(erro, 'Não consegui ler os indicadores.', true)}</p>
          <button onClick={() => reler()} className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">Tentar de novo</button></Moldura>
      ) : !dados ? (
        <div className="p-10 text-center text-slate-400"><RefreshCw className="animate-spin inline mr-2" size={18} /> Lendo os indicadores…</div>
      ) : (
        <>
          {erro && <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><AlertTriangle size={13} /> Não consegui atualizar agora ({kpisErrorMessage(erro, 'erro', true)}) — mostrando o que já estava na tela.</p>}
          {dados.calcErro.size > 0 && <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5"><AlertTriangle size={13} /> Não consegui calcular {dados.calcErro.size === 1 ? '1 indicador calculado' : `${dados.calcErro.size} indicadores calculados`} pelas atividades agora — tente Atualizar.</p>}
          {subAtual === 'painel' && (
            <KpisPainel dados={dados} inds={filtrados} visaoPorSetor={!!acesso!.veTodos && setor === 'todos'} mostrarSetor={!!acesso!.veTodos}
              onAbrir={setAberto} onFiltrarSetor={setSetor} />
          )}
          {subAtual === 'lancar' && <KpisLancar dados={dados} inds={filtrados} service={service} nomes={nomes} mostrarSetor={!!acesso!.veTodos || !!acesso!.administra || filtrados.some(i => setorChave(i.setor) !== (acesso!.setorChave || ''))} onGravou={gravou} />}
          {subAtual === 'cadastro' && <KpisCadastro dados={dados} service={service} onGravou={gravou} users={users} currentUser={currentUser} onUsuariosMudou={onUsuariosMudou} />}
          {aberto && (
            <KpisDetalhe i={aberto} dados={dados} service={service} nomes={nomes} administra={!!acesso!.administra} mostrarSetor={!!acesso!.veTodos}
              onFechar={() => setAberto(null)} onEditar={() => { setEditando(aberto); setAberto(null); }} onGravou={gravou} />
          )}
          {editando && (
            <EditarDoDetalhe ind={editando} dados={dados} service={service} onFechar={() => setEditando(null)} onGravou={gravou}
              ceoSoVe={currentUser.role === 'CEO' && currentUser.id !== '1e570c78-7278-4e8d-a90e-a820c11bb07a'} />
          )}
        </>
      )}
    </div>
  );
};

// "Editar indicador" a partir do detalhe: o mesmo formulário do Cadastro, com a lista de setores lida na hora.
const EditarDoDetalhe: React.FC<{ ind: KpisIndicador; dados: NonNullable<ReturnType<typeof useKpisDados>['dados']>; service: KpisService; onFechar: () => void; onGravou: () => void; ceoSoVe?: boolean }> = ({ ind, dados, service, onFechar, onGravou, ceoSoVe }) => {
  const [setores, setSetores] = useState<Awaited<ReturnType<KpisService['setores']>> | null | undefined>(undefined);
  const [tipos, setTipos] = useState<Awaited<ReturnType<KpisService['tiposAtividade']>> | null | undefined>(undefined);
  useEffect(() => {
    service.setores().then(setSetores).catch(() => setSetores(null));
    service.tiposAtividade().then(setTipos).catch(() => setTipos(null));
  }, [service]);
  if (setores === undefined) return null;
  return <KpisIndicadorModal indicador={ind} dados={dados} service={service} setores={setores} tipos={tipos} ceoSoVe={ceoSoVe} onFechar={onFechar} onGravou={onGravou} />;
};

export const KpisView = withOkrSafe(KpisViewInner, 'o KPI dos setores', 'Algum dado dos indicadores veio num formato inesperado.');
