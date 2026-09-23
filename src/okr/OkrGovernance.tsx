import React from 'react';
import { Compass, Activity, Gauge, Users as UsersIcon, MessageSquare } from 'lucide-react';

const CADENCE = [
  { icon: Activity, tag: 'Operação', freq: 'Semanal', desc: 'Tratar bloqueios, incidentes e pendências com os responsáveis de cada setor.' },
  { icon: Gauge, tag: 'Performance', freq: 'Mensal', desc: 'Atualizar os KRs, revisar os desvios e repriorizar as iniciativas do ciclo.' },
  { icon: UsersIcon, tag: 'Direção', freq: 'Trimestral', desc: 'Avaliar o impacto, decidir correções de rota e confirmar o próximo ciclo.' },
];
const SCALE = [
  { range: '0,0 – 0,3', label: 'Sem avanço', color: '#ef4444' },
  { range: '0,4 – 0,6', label: 'Parcial / risco', color: '#f59e0b' },
  { range: '0,7 – 0,9', label: 'Consistente', color: '#10b981' },
  { range: '1,0', label: 'Meta atingida', color: '#3b82f6' },
];

export const OkrGovernance: React.FC = () => (
  <div className="space-y-5">
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 flex items-center gap-3">
      <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md"><Compass size={22} /></div>
      <div>
        <h2 className="text-xl font-black text-slate-800 dark:text-white leading-tight">Governança do ciclo</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">A cadência transforma os indicadores em decisões, desbloqueios e correções de rota.</p>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-gray-200 dark:border-slate-700">
        <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-4">Reuniões que mantêm o foco</h4>
        <div className="space-y-3">
          {CADENCE.map(c => (
            <div key={c.freq} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/70 dark:bg-slate-800/40">
              <div className="p-2 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 shrink-0"><c.icon size={18} /></div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-white">{c.freq}</span>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-2 py-0.5">{c.tag}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 dark:bg-black rounded-2xl p-5 shadow-sm border border-slate-800">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">Como interpretar o resultado</h4>
        <div className="space-y-3">
          {SCALE.map(s => (
            <div key={s.range} className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
              <div>
                <div className="text-sm font-bold text-white tabular-nums">{s.range}</div>
                <div className="text-[11px] text-slate-400">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-slate-500 mt-4 leading-relaxed">A nota serve para aprendizado e priorização. Um KR baixo deve gerar uma decisão, não apenas uma cobrança.</p>
      </div>
    </div>

    <div className="rounded-2xl p-4 border border-dashed border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-900/10 flex items-start gap-3">
      <MessageSquare size={18} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
      <p className="text-xs text-slate-600 dark:text-slate-300"><b>Próxima revisão mensal:</b> use os check-ins e o histórico registrados no OKR como pauta para revisar os desvios, reconhecer os avanços e remover os impedimentos.</p>
    </div>
  </div>
);
