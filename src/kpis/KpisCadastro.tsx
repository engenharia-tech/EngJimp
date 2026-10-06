import React, { useEffect, useMemo, useState } from 'react';
import { User } from '../types';
import { addAuditLog } from '../services/storageService';
import { ehVisaoCeo, ehRepresentante } from '../utils/cargos';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, AlertTriangle, Calculator, Link2, Users, Search, Save, Loader2 } from 'lucide-react';
import { useToast } from '../components/Toast';
import { KpisAcesso, KpisIndicador, KpisSetor, KpisTipoAtividade, FREQ_ROTULO, fmtValor, gerencia, hojeSP, inicioPeriodo, metaVigente, setorChave, ehSetorDeRepresentante, SETOR_DE_REPRESENTANTE_MSG } from './kpis';
import { KpisDados } from './kpisDados';
import { KpisService, kpisErrorMessage } from './kpisService';
import { KpisIndicadorModal } from './KpisIndicadorModal';

// CADASTRO: a tabela por setor, ativos e arquivados, o botão "Novo indicador" e dois avisos — setores
// escritos de jeitos diferentes, e indicador de um setor em que não há ninguém (ninguém lançaria).
// Quem é do setor cuida de TODOS os indicadores do setor (028); o Edson e os admins de OKR, de onde veem.

export const KpisCadastro: React.FC<{
  dados: KpisDados; service: KpisService; onGravou: () => void;
  users: User[]; currentUser: User; onUsuariosMudou?: (id: string, setor: string) => void;
  acesso: KpisAcesso;                 // quem não administra cria e cuida só dos do próprio setor (028: de todos eles)
}> = ({ dados, service, onGravou, users, currentUser, onUsuariosMudou, acesso }) => {
  const admin = !!acesso.administra;
  const setorFixo = admin ? null : acesso.setorNome;
  const { addToast } = useToast();
  // Decisão do Edson, 01/10: o CEO é visão macro — mexer no setor das pessoas, ele pede. O Diretor Industrial
  // também (06/10/2026: "o mesmo privilégio e visualização do CEO").
  const ceoSoVe = ehVisaoCeo(currentUser.role) && currentUser.id !== EDSON_ID;
  // REPRESENTANTE (06/10/2026): só indicador lançado à mão.
  const soManual = ehRepresentante(currentUser.role);
  const [setores, setSetores] = useState<KpisSetor[] | null | undefined>(undefined); // undefined = lendo
  const [tipos, setTipos] = useState<KpisTipoAtividade[] | null | undefined>(undefined);
  const [modal, setModal] = useState<{ ind?: KpisIndicador } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    service.setores().then(setSetores).catch(() => setSetores(null));
    // O representante (só lançado à mão) não precisa dos tipos de atividade da engenharia (06/10/2026).
    if (soManual) setTipos([]); else service.tiposAtividade().then(setTipos).catch(() => setTipos(null));
  }, [service, dados.lidoEm, soManual]);

  const chavesComGente = useMemo(() => new Set((setores || []).map(s => s.chave)), [setores]);
  // Os avisos de cadastro de pessoas são de quem administra (a lista de setores só vem para quem vê todos).
  const grafias = admin ? (setores || []).filter(s => s.grafias.length > 1) : [];
  const semNinguem = admin && setores ? dados.indicadores.filter(i => i.ativo && !chavesComGente.has(setorChave(i.setor))) : [];
  const grupos = useMemo(() => {
    const g = new Map<string, { nome: string; itens: KpisIndicador[] }>();
    dados.indicadores.forEach(i => { const k = setorChave(i.setor); const x = g.get(k) || { nome: i.setor, itens: [] }; x.itens.push(i); g.set(k, x); });
    return Array.from(g.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      .map(x => ({ ...x, itens: x.itens.sort((a, b) => (a.ativo === b.ativo ? 0 : a.ativo ? -1 : 1) || a.nome.localeCompare(b.nome, 'pt-BR')) }));
  }, [dados.indicadores]);

  const arquivar = async (i: KpisIndicador) => {
    if (i.ativo && !window.confirm(`Arquivar "${i.nome}"? Ele some do painel e não recebe mais lançamentos; o histórico fica, e o KR ligado continua mostrando o último valor (com o selo "arquivado").`)) return;
    setOcupado(i.id);
    try { await service.arquivarIndicador(i.id, !i.ativo, i.atualizadoEm); addToast(i.ativo ? `"${i.nome}" arquivado.` : `"${i.nome}" reativado.`, 'success'); onGravou(); }
    catch (e) { addToast(kpisErrorMessage(e, 'Não consegui arquivar.'), 'error'); onGravou(); }
    finally { setOcupado(null); }
  };
  // 028: exclui COM os lançamentos — a pessoa confirma o número, o banco confere que é o de agora e deixa um
  // registro na auditoria. KR de OKR ligado continua travando (desliga no OKR antes).
  const excluir = async (i: KpisIndicador) => {
    let n: number;
    try { n = await service.contarLancamentos(i.id); }   // no banco: a tela só lê 36 meses
    catch (e) { addToast(kpisErrorMessage(e, 'Não consegui contar os lançamentos.'), 'error'); return; }
    const msg = n > 0
      ? `Excluir "${i.nome}" de vez, junto com os ${n} lançamento(s) e o histórico de correções?

Não dá para desfazer (fica só um registro na auditoria). Para guardar os números, arquive em vez de excluir.`
      : `Excluir "${i.nome}" de vez? Não dá para desfazer.`;
    if (!window.confirm(msg)) return;
    setOcupado(i.id);
    try { await service.excluirIndicador(i.id, n); addToast(n > 0 ? `"${i.nome}" excluído, com ${n} lançamento(s).` : `"${i.nome}" excluído.`, 'success'); onGravou(); }
    catch (e) { addToast(kpisErrorMessage(e, 'Não consegui excluir.'), 'error'); onGravou(); }
    finally { setOcupado(null); }
  };

  const hoje = hojeSP();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-xs text-slate-500 dark:text-slate-400 flex-1 min-w-[200px]">{admin
          ? 'O Edson e os admins de OKR cadastram em qualquer setor; cada setor cuida de todos os seus indicadores (cria, muda a forma de medir, meta, arquiva, exclui). As pessoas do setor lançam e veem só o seu setor.'
          : `Você cuida de todos os indicadores do seu setor (${acesso.setorNome || '—'}): cria, muda a forma de medir, a meta, arquiva e exclui — inclusive os que o Edson criou. As pessoas do setor lançam.`}</p>
        <button onClick={() => setModal({})} disabled={setores === undefined} className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg"><Plus size={15} /> Novo indicador</button>
      </div>

      {grafias.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 p-3 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> Setores escritos de jeitos diferentes na Equipe</p>
          <ul className="mt-1 space-y-0.5">{grafias.map(s => <li key={s.chave}>{s.grafias.map(g => `"${g}"`).join(' · ')} — contam como o mesmo setor ({s.pessoas} pessoa(s)); {ceoSoVe ? 'peça ao Edson para padronizar.' : 'vale padronizar em "Pessoas e setores", abaixo.'}</li>)}</ul>
          <p className="mt-1 text-amber-700/80 dark:text-amber-300/80">Atenção: singular e plural ("Suprimento" × "Suprimentos") ou nomes diferentes ("Compras" × "Suprimentos") são setores DIFERENTES.</p>
        </div>
      )}
      {semNinguem.length > 0 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/15 p-3 text-xs text-amber-800 dark:text-amber-200">
          <p className="font-bold flex items-center gap-1.5"><AlertTriangle size={13} /> Indicador de setor sem ninguém</p>
          <p className="mt-1">{semNinguem.map(i => `"${i.nome}" (${i.setor})`).join(' · ')} — ninguém do cadastro está nesse setor, então ninguém do setor lança. Troque o setor do indicador {ceoSoVe ? 'ou peça ao Edson para dar o setor às pessoas.' : 'ou dê o setor às pessoas em "Pessoas e setores", abaixo.'}</p>
        </div>
      )}

      {grupos.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 text-center border border-dashed border-slate-200 dark:border-slate-700 text-sm text-slate-400">Nenhum indicador cadastrado ainda. Comece por "Novo indicador".</div>
      ) : grupos.map(g => (
        <div key={g.nome} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-5 py-2.5 border-b border-gray-100 dark:border-slate-800 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{g.nome}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {g.itens.map(i => {
                  // Quem começa no futuro: a meta que vale no 1º período dele (a de hoje não existe ainda).
                  const refMeta = inicioPeriodo(i.frequencia, hoje) < i.inicio ? i.inicio : inicioPeriodo(i.frequencia, hoje);
                  const m = metaVigente(dados.metas.get(i.id) || [], refMeta);
                  const lig = dados.ligados?.get(i.id) || 0;
                  return (
                    <tr key={i.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${!i.ativo ? 'opacity-60' : ''}`}>
                      <td className="px-5 py-2.5">
                        <span className="font-semibold text-slate-800 dark:text-white">{i.nome}</span>
                        {i.tipo === 'calculado' && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400"><Calculator size={11} /> calculado</span>}
                        {!i.ativo && <span className="ml-2 text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400">arquivado</span>}
                        {lig > 0 && <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400"><Link2 size={11} /> {lig} KR</span>}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{FREQ_ROTULO[i.frequencia]}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap">{i.sentido === 'maior' ? '↑ maior melhor' : '↓ menor melhor'}</td>
                      <td className="px-3 py-2.5 text-[11px] whitespace-nowrap">{m ? <span className="text-slate-600 dark:text-slate-300">meta {fmtValor(m.meta, i.unidade, i.casas)}</span> : <span className="text-amber-600 dark:text-amber-400">sem meta — defina</span>}</td>
                      <td className="px-5 py-2.5 text-right whitespace-nowrap">
                        {gerencia(i, acesso) ? <>
                        <button onClick={() => setModal({ ind: i })} disabled={ocupado === i.id} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20" title="Editar"><Pencil size={14} /></button>
                        <button onClick={() => arquivar(i)} disabled={ocupado === i.id} className="p-1.5 rounded text-slate-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20" title={i.ativo ? 'Arquivar' : 'Reativar'}>{i.ativo ? <Archive size={14} /> : <ArchiveRestore size={14} />}</button>
                        <button onClick={() => excluir(i)} disabled={ocupado === i.id} className="p-1.5 rounded text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20" title="Excluir (com os lançamentos, se houver; KR de OKR ligado trava)"><Trash2 size={14} /></button>
                        </> : i.podeLancar
                          ? <span className="text-[11px] text-slate-400" title="Você lança neste indicador; o cadastro é de quem cuida do setor dele">só lança</span>
                          : <span className="text-[11px] text-slate-400" title={i.tipo === 'calculado' ? 'Calculado pela base: ninguém lança' : 'Você acompanha este indicador, mas não lança nem altera'}>só vê</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {admin && <PessoasESetores users={users} currentUser={currentUser} setores={setores || []} service={service}
        onMudou={(id, setor) => { onUsuariosMudou?.(id, setor); onGravou(); }} />}

      {modal && <KpisIndicadorModal indicador={modal.ind} dados={dados} service={service} setores={setores ?? null} tipos={tipos} ceoSoVe={ceoSoVe} setorFixo={setorFixo} soManual={soManual} onFechar={() => setModal(null)} onGravou={onGravou} />}
    </div>
  );
};

// PESSOAS E SETORES (01/10) — decisão do Edson, 30/09: "Só o Edson e os admins de OKR mudam o SETOR de
// qualquer pessoa"; e, 01/10, o CEO é visão macro ("não pode dar cargo a ninguem e nem liberar acesso"):
// para o CEO (mesmo admin de OKR) a lista é só leitura — e para o Diretor Industrial (06/10). O setor é a
// porta do KPI do setor. Grava SÓ o setor, por um caminho próprio do servidor (que confere quem pede).
// O REPRESENTANTE (06/10) tem um setor só dele, posto pelo banco: a linha dele é só leitura, e o setor de um
// representante não é sugerido a ninguém.
const LinhaPessoa: React.FC<{ u: User; setores: KpisSetor[]; podeEditar: boolean; service: KpisService; currentUser: User; onMudou: (id: string, setor: string) => void }> = ({ u, setores, podeEditar, service, currentUser, onMudou }) => {
  const { addToast } = useToast();
  const atual = (u.sector || '').trim();
  const [txt, setTxt] = useState(atual);
  const [gravando, setGravando] = useState(false);
  useEffect(() => { setTxt(atual); }, [atual]);
  const mudou = txt.trim() !== atual;
  const salvar = async () => {
    if (!mudou || gravando) return;
    // O setor de um representante é só dele (06/10/2026): pôr outra pessoa nele abriria os indicadores do
    // representante a ela. Pela chave ("Representante - João", sem acento…); o servidor recusa o mesmo.
    if (ehSetorDeRepresentante(txt)) { addToast(SETOR_DE_REPRESENTANTE_MSG, 'error'); return; }
    setGravando(true);
    try {
      const { gravou } = await service.mudarSetor(u.id, txt.trim(), atual);
      if (!gravou) {                                                   // outro admin já tinha posto: nada a registrar
        addToast(`${u.name} já está em ${txt.trim() || '(sem setor)'} — nada a gravar.`, 'info');
        onMudou(u.id, txt.trim());
        return;
      }
      addToast(`Setor de ${u.name}: ${txt.trim() || '(sem setor)'}.`, 'success');
      try {
        addAuditLog({ userId: currentUser.id, userName: currentUser.name, action: 'UPDATE', entityType: 'USER', entityId: u.id, entityName: u.username,
          details: `Setor de ${u.username} mudado por ${currentUser.name} (KPI dos setores): "${atual}" → "${txt.trim()}"` });
      } catch { /* auditoria nunca trava */ }
      onMudou(u.id, txt.trim());
    } catch (e) {
      addToast(kpisErrorMessage(e, 'Não consegui mudar o setor.'), 'error');
      const agora = (e as any)?.setorAtual;                          // 409: outro admin mudou — a linha mostra o de agora
      if (typeof agora === 'string') onMudou(u.id, agora);
    }
    finally { setGravando(false); }
  };
  return (
    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td className="px-5 py-2 text-sm text-slate-700 dark:text-slate-200">{u.name}{u.surname ? ` ${u.surname}` : ''} <span className="text-[11px] text-slate-400">({u.username})</span></td>
      <td className="px-3 py-2">
        {podeEditar ? (
          <input value={txt} onChange={e => setTxt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') salvar(); }} list="kpis-setores-existentes" maxLength={60}
            aria-label={`Setor de ${u.name}`} placeholder="sem setor"
            className="w-full max-w-[220px] px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
        ) : <span className="text-xs text-slate-500 dark:text-slate-400">{atual || '—'}{u.id === EDSON_ID && currentUser.id !== EDSON_ID ? <span className="text-[10px]"> (só o Edson muda o dele)</span> : ehRepresentante(u.role) ? <span className="text-[10px]"> (o setor do representante é só dele, posto automaticamente)</span> : null}</span>}
      </td>
      <td className="px-5 py-2 text-right">
        {podeEditar && mudou && (
          <button onClick={salvar} disabled={gravando} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50">
            {gravando ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Salvar
          </button>
        )}
      </td>
    </tr>
  );
};

const EDSON_ID = '1e570c78-7278-4e8d-a90e-a820c11bb07a';
const PessoasESetores: React.FC<{ users: User[]; currentUser: User; setores: KpisSetor[]; service: KpisService; onMudou: (id: string, setor: string) => void }> = ({ users, currentUser, setores, service, onMudou }) => {
  // Decisão do Edson, 01/10: o CEO é visão macro — não dá cargo nem libera acesso (o servidor confere). O Diretor
  // Industrial também (06/10/2026).
  const ceoSoVe = ehVisaoCeo(currentUser.role) && currentUser.id !== EDSON_ID;
  const [busca, setBusca] = useState('');
  const lista = useMemo(() => {
    const q = setorChave(busca);
    return (users || [])
      .filter(u => !/^zz_/i.test(u.username || ''))
      .filter(u => !q || setorChave(`${u.name} ${u.surname || ''} ${u.username} ${u.sector || ''}`).includes(q))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
  }, [users, busca]);
  return (
    <details className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
      <summary className="px-5 py-3 cursor-pointer select-none text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-2">
        <Users size={14} /> Pessoas e setores ({(users || []).filter(u => !/^zz_/i.test(u.username || '')).length})
        <span className="normal-case font-normal tracking-normal text-[11px] text-slate-400 ml-auto">{ceoSoVe ? 'o setor abre o KPI do setor — o CEO e o Diretor Industrial acompanham; para mudar, peça ao Edson' : 'o setor abre o KPI do setor — só o Edson e os admins de OKR (fora o CEO e o Diretor Industrial) mudam'}</span>
      </summary>
      <div className="px-5 pb-3 flex items-center gap-2">
        <Search size={14} className="text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="procurar pessoa ou setor" aria-label="Procurar pessoa ou setor"
          className="flex-1 max-w-sm px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <datalist id="kpis-setores-existentes">{setores.filter(s => !ehSetorDeRepresentante(s.nome)).map(s => <option key={s.chave} value={s.nome} />)}</datalist>
      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm min-w-[520px]">
          <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
            {lista.map(u => (
              <LinhaPessoa key={u.id} u={u} setores={setores} service={service} currentUser={currentUser} onMudou={onMudou}
                podeEditar={!ceoSoVe && !ehRepresentante(u.role) && (u.id !== EDSON_ID || currentUser.id === EDSON_ID)} />
            ))}
            {!lista.length && <tr><td className="px-5 py-4 text-sm text-slate-400">Ninguém com esse nome.</td></tr>}
          </tbody>
        </table>
      </div>
    </details>
  );
};
