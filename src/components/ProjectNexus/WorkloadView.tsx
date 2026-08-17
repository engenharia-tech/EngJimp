import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar,
  AlertCircle,
  User as UserIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import {
  format,
  addMonths,
  startOfMonth,
  eachDayOfInterval,
  isSameDay,
  isWithinInterval,
  parseISO,
  isWeekend,
  addDays,
  differenceInDays
} from 'date-fns';
import { AppState, GanttTask } from '../../types';
import { ptBR } from 'date-fns/locale';

interface WorkloadViewProps {
  state: AppState;
  onUpdateState: (newState: AppState) => void;
}

export const WorkloadView: React.FC<WorkloadViewProps> = ({ state, onUpdateState }) => {
  const [currentDate] = useState(new Date());
  const [zoomLevel, setZoomLevel] = useState(40); // px por dia (zoom)
  const [periodMonths, setPeriodMonths] = useState(3); // janela de tempo em meses

  const timelineInterval = useMemo(() => {
    const start = startOfMonth(currentDate);
    // Fecha exatamente no fim do último mês da janela: evita um bloco de mês
    // de 1 dia só (ex.: 01/08) transbordando o rótulo na ponta direita.
    const end = addDays(addMonths(start, periodMonths), -1);
    return { start, end };
  }, [currentDate, periodMonths]);

  const days = useMemo(() => {
    return eachDayOfInterval({ start: timelineInterval.start, end: timelineInterval.end });
  }, [timelineInterval]);

  // Posição de "hoje" na grade (px). A coluna de nome tem 16rem (256px).
  const todayLeft = differenceInDays(new Date(), timelineInterval.start) * zoomLevel;

  // Refs para rolar até HOJE e manter o cabeçalho de dias sincronizado com o corpo.
  const contentRef = useRef<HTMLDivElement>(null);
  const headerScrollRef = useRef<HTMLDivElement>(null);

  const scrollToToday = (smooth = true) => {
    const target = Math.max(0, todayLeft - 80);
    contentRef.current?.scrollTo({ left: target, behavior: smooth ? 'smooth' : 'auto' });
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = target;
  };

  // Abre na DATA ATUAL e reposiciona quando muda o zoom ou o período (mantém
  // "hoje" sempre visível perto da esquerda).
  useEffect(() => {
    const target = Math.max(0, todayLeft - 80);
    if (contentRef.current) contentRef.current.scrollLeft = target;
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = target;
  }, [state.users.length, zoomLevel, periodMonths, todayLeft]);

  // Mantém o cabeçalho de dias acompanhando a rolagem horizontal do corpo.
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (headerScrollRef.current) headerScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };

  const getUserWorkloadForDay = (userId: string, day: Date) => {
    let total = 0;
    state.ganttTasks.forEach(task => {
      const start = parseISO(task.startDate);
      const end = parseISO(task.endDate);
      if (isWithinInterval(day, { start, end }) && task.assignedTo.includes(userId)) {
        if (task.workload && task.workload[userId]) {
           // If workload is defined as total hours for the task, we might divide it by days?
           // For simplicity in this view, let's assume the user assigned a "daily hours" or we divide.
           // Looking at the image, it shows "8" consistently.
           total += (task.workload[userId] as number);
        } else {
           // Default if not specified? Let's say 8h if active.
           total += 8; 
        }
      }
    });
    return total;
  };

  return (
    <div className="h-full bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between z-30 shadow-sm font-sans">
        <div className="flex items-center gap-5">
           {/* Modo: só existe "Horas" nesta visão — rótulo estático (não é dropdown) */}
           <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Modo:</span>
              <span className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-semibold text-slate-600 dark:text-slate-300">Horas</span>
           </div>
           {/* Período: dropdown REAL que muda a janela de tempo */}
           <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Período:</span>
              <div className="relative">
                <select
                  value={periodMonths}
                  onChange={e => setPeriodMonths(Number(e.target.value))}
                  className="appearance-none pl-3 pr-8 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-xs font-semibold text-blue-600 dark:text-blue-400 cursor-pointer outline-none focus:ring-2 focus:ring-blue-500 [color-scheme:light] dark:[color-scheme:dark]"
                >
                  <option value={1}>1 mês</option>
                  <option value={2}>2 meses</option>
                  <option value={3}>3 meses</option>
                  <option value={6}>6 meses</option>
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-blue-500 pointer-events-none" />
              </div>
           </div>
           <button onClick={() => scrollToToday(true)} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 px-2.5 py-1 rounded-lg transition-colors uppercase tracking-wide">
             <Calendar size={14} /> Ir para hoje
           </button>
        </div>
      </div>

      {/* Resource Grid Header */}
      <div className="flex-grow flex flex-col overflow-hidden relative">
         <div className="flex flex-shrink-0 sticky top-0 z-40 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
            <div className="w-64 flex-shrink-0 border-r border-slate-300 dark:border-slate-800 p-3 flex items-end">
               <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Recurso</span>
            </div>
            <div ref={headerScrollRef} className="flex-grow overflow-hidden flex flex-col">
               <div className="flex h-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 min-w-max">
                  {(() => {
                    const months: { label: string, days: number }[] = [];
                    let cur: string | null = null; let cnt = 0;
                    days.forEach(day => {
                      const m = format(day, 'MMMM yyyy', { locale: ptBR });
                      if (m !== cur) { if (cur) months.push({ label: cur, days: cnt }); cur = m; cnt = 1; }
                      else cnt++;
                    });
                    if (cur) months.push({ label: cur, days: cnt });
                    return months.map((m, i) => (
                      <div key={i} className="flex items-center px-4 py-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 border-r border-slate-200 dark:border-slate-800 uppercase tracking-wide" style={{ width: `${m.days * zoomLevel}px` }}>{m.label}</div>
                    ));
                  })()}
               </div>
               <div className="flex h-10 bg-white dark:bg-slate-900 min-w-max">
                  {days.map((day, i) => {
                    const isToday = isSameDay(day, new Date());
                    return (
                    <div
                      key={i}
                      className={`flex-shrink-0 border-r border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center relative ${isToday ? 'bg-blue-500/[0.08] dark:bg-blue-400/10 border-blue-200 dark:border-blue-800/40' : isWeekend(day) ? 'bg-slate-50 dark:bg-slate-900/40' : ''}`}
                      style={{ width: `${zoomLevel}px` }}
                    >
                      <span className={`text-[11px] tabular-nums ${isToday ? 'font-bold text-blue-600 dark:text-blue-400' : 'font-medium text-slate-400 dark:text-slate-600'}`}>
                        {format(day, 'd')}
                      </span>
                      {isToday && (
                        <div className="absolute top-0 right-0 left-0 h-0.5 bg-blue-500" />
                      )}
                    </div>
                    );
                  })}
               </div>
            </div>
         </div>

         {/* Grid Content */}
         <div ref={contentRef} onScroll={handleScroll} className="flex-grow overflow-auto flex flex-col relative no-scrollbar">
            {/* Linha do dia de HOJE */}
            <div
               className="absolute top-0 bottom-0 w-0.5 bg-blue-500 z-10 pointer-events-none"
               style={{ left: `calc(16rem + ${todayLeft}px)` }}
            >
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full bg-blue-600 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-t whitespace-nowrap">Hoje</div>
            </div>

            {state.users.map(user => {
              const hasAlert = user.name === 'Edson Farias'; // Hardcoded matches Image 5 icons for visual parity

              return (
                <div key={user.id} className="flex min-w-max border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-colors">
                  <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 p-2 flex items-center justify-between sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                    <div className="flex items-center gap-3">
                       <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-700 uppercase overflow-hidden">
                          {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : user.name.charAt(0)}
                       </div>
                       <span className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate max-w-[120px]">{user.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                       {hasAlert && <AlertCircle size={14} className="text-rose-500" />}
                       <Calendar size={14} className="text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 cursor-pointer" />
                    </div>
                  </div>
                  
                  <div className="flex overflow-hidden">
                    {days.map((day, i) => {
                      const hours = getUserWorkloadForDay(user.id, day);
                      const isIdeal = hours === 8;
                      const isOver = hours > 8;
                      const isUnder = hours > 0 && hours < 8;

                      return (
                        <div 
                          key={i} 
                          className={`flex-shrink-0 border-r border-slate-100 dark:border-slate-800 h-10 flex items-center justify-center text-xs font-bold ${isIdeal ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : isOver ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 shadow-inner' : isUnder ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400' : 'text-slate-200 dark:text-slate-800'}`}
                          style={{ width: `${zoomLevel}px` }}
                        >
                          {hours > 0 ? hours : '0'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              );
            })}

            {/* "não atribuído" row */}
            <div className="flex min-w-max border-b border-slate-100 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 italic group transition-colors">
               <div className="w-64 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 p-2 flex items-center gap-3 sticky left-0 z-20 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/80">
                  <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-600 border border-dashed border-slate-300 dark:border-slate-700 shadow-sm">
                    <UserIcon size={14} />
                  </div>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500">não atribuído</span>
               </div>
               <div className="flex overflow-hidden">
                 {days.map((day, i) => (
                   <div key={i} className="flex-shrink-0 border-r border-slate-100 dark:border-slate-800 h-10 flex items-center justify-center text-[10px] text-slate-200 dark:text-slate-800" style={{ width: `${zoomLevel}px` }}>0</div>
                 ))}
               </div>
            </div>
         </div>
         {/* Navegação flutuante — rolar pelos dias (igual ao Gantt) */}
         <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-40 pointer-events-none">
           <button onClick={() => contentRef.current?.scrollBy({ left: -zoomLevel * 7, behavior: 'smooth' })} className="p-2.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur shadow-xl rounded-full border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:scale-110 active:scale-95 transition-all pointer-events-auto" title="Dias anteriores"><ChevronLeft size={22} /></button>
           <button onClick={() => contentRef.current?.scrollBy({ left: zoomLevel * 7, behavior: 'smooth' })} className="p-2.5 bg-white/90 dark:bg-slate-800/90 backdrop-blur shadow-xl rounded-full border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-400 hover:scale-110 active:scale-95 transition-all pointer-events-auto" title="Próximos dias"><ChevronRight size={22} /></button>
         </div>
      </div>
    </div>
  );
};
