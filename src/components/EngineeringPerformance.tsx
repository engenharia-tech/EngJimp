import React, { useState, useMemo } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { 
  User as UserIcon, 
  Clock, 
  AlertTriangle, 
  CheckCircle2, 
  BarChart3, 
  Filter,
  Users,
  TrendingDown,
  TrendingUp,
  Search,
  Calendar
} from 'lucide-react';
import { 
  ProjectSession, 
  User, 
  OperationalActivity, 
  InterruptionRecord, 
  AppSettings 
} from '../types';
import { 
  format, 
  parseISO, 
  differenceInSeconds, 
  startOfDay, 
  endOfDay,
  addSeconds,
  isWithinInterval,
  subDays,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval
} from 'date-fns';

interface EngineeringPerformanceProps {
  projects: ProjectSession[];
  activities: OperationalActivity[];
  interruptions: InterruptionRecord[];
  users: User[];
  settings: AppSettings;
  theme: 'light' | 'dark';
  t: (key: string) => string;
  startDate?: string;
  endDate?: string;
  currentUser: User;
}

export const EngineeringPerformance: React.FC<EngineeringPerformanceProps> = ({
  projects,
  activities,
  interruptions,
  users,
  settings,
  theme,
  t,
  startDate,
  endDate,
  currentUser
}) => {
  const [selectedDesignerId, setSelectedDesignerId] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'macro' | 'individual'>('macro');
  const [selectedPeriod, setSelectedPeriod] = useState<'7d' | '30d' | 'currentMonth' | 'lastMonth' | 'year'>('7d');

  const dateRange = useMemo(() => {
    const now = new Date();
    
    switch (selectedPeriod) {
      case '7d':
        return { start: subDays(now, 7), end: now };
      case '30d':
        return { start: subDays(now, 30), end: now };
      case 'currentMonth':
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case 'lastMonth': {
        const last = subMonths(now, 1);
        return { start: startOfMonth(last), end: endOfMonth(last) };
      }
      case 'year':
        return { start: startOfYear(now), end: endOfYear(now) };
      default:
        return {
          start: startDate ? parseISO(startDate) : subDays(now, 7),
          end: endDate ? parseISO(endDate) : now
        };
    }
  }, [startDate, endDate, selectedPeriod]);

  const designers = useMemo(() => {
    return users.filter(u => {
      // Only show GESTOR role if the current user viewing IS a GESTOR
      if (u.role === 'GESTOR') {
        return currentUser.role === 'GESTOR';
      }
      return ['PROJETISTA', 'COORDENADOR'].includes(u.role);
    });
  }, [users, currentUser]);

  const calculateComplianceData = useMemo(() => {
    const workdayStartStr = settings.workdayStart || "07:30";
    const workdayEndStr = settings.workdayEnd || "17:30";
    const lunchStartStr = settings.lunchStart || "12:00";
    const lunchEndStr = settings.lunchEnd || "13:00";

    const [wsH, wsM] = workdayStartStr.split(':').map(Number);
    const [weH, weM] = workdayEndStr.split(':').map(Number);
    const [lsH, lsM] = lunchStartStr.split(':').map(Number);
    const [leH, leM] = lunchEndStr.split(':').map(Number);

    const periodDays = eachDayOfInterval({
      start: startOfDay(dateRange.start),
      end: startOfDay(dateRange.end)
    }).filter(day => {
      const dayOfWeek = day.getDay();
      return dayOfWeek !== 0 && dayOfWeek !== 6; // Skip weekends
    });

    return designers.map(designer => {
      let totalExpectedSeconds = 0;
      let totalReportedSeconds = 0;
      let totalGapSeconds = 0;

      const userProjects = projects.filter(p => p.userId === designer.id);
      const userActivities = activities.filter(a => a.userId === designer.id);
      const userInterruptions = interruptions.filter(i => i.designerId === designer.id);

      const dailyData = periodDays.map(day => {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);

        // Expected work window
        const workStart = new Date(day);
        workStart.setHours(wsH, wsM, 0, 0);
        const workEnd = new Date(day);
        workEnd.setHours(weH, weM, 0, 0);

        // Lunch window
        const lunchStart = new Date(day);
        lunchStart.setHours(lsH, lsM, 0, 0);
        const lunchEnd = new Date(day);
        lunchEnd.setHours(leH, leM, 0, 0);

        totalExpectedSeconds += differenceInSeconds(workEnd, workStart) - differenceInSeconds(lunchEnd, lunchStart);

        // Combine all events for this day
        const events: { start: Date; end: Date; type: string }[] = [];

        // Add projects
        userProjects.forEach(p => {
          const start = parseISO(p.startTime);
          // If activity is open, use min(now, workEnd) to avoid counting 24h
          const now = new Date();
          const effectiveNow = now > workEnd ? workEnd : now;
          const end = p.endTime ? parseISO(p.endTime) : (dayStart < startOfDay(now) ? workEnd : effectiveNow);
          
          if (start < dayEnd && end > dayStart) {
            events.push({ 
              start: start < workStart ? workStart : start, 
              end: end > workEnd ? workEnd : end,
              type: 'project'
            });
          }
        });

        // Add operational activities
        userActivities.forEach(a => {
          const start = parseISO(a.startTime);
          const now = new Date();
          const effectiveNow = now > workEnd ? workEnd : now;
          const end = a.endTime ? parseISO(a.endTime) : (dayStart < startOfDay(now) ? workEnd : effectiveNow);

          if (start < dayEnd && end > dayStart) {
            events.push({ 
              start: start < workStart ? workStart : start, 
              end: end > workEnd ? workEnd : end,
              type: 'activity'
            });
          }
        });

        // Add interruptions
        userInterruptions.forEach(i => {
          const start = parseISO(i.startTime);
          const now = new Date();
          const effectiveNow = now > workEnd ? workEnd : now;
          const end = i.endTime ? parseISO(i.endTime) : (dayStart < startOfDay(now) ? workEnd : effectiveNow);

          if (start < dayEnd && end > dayStart) {
            events.push({ 
              start: start < workStart ? workStart : start, 
              end: end > workEnd ? workEnd : end,
              type: 'interruption'
            });
          }
        });

        // Sort events and merge overlaps
        events.sort((a, b) => a.start.getTime() - b.start.getTime());
        
        const mergedEvents: { start: Date; end: Date }[] = [];
        if (events.length > 0) {
          let current = { start: events[0].start, end: events[0].end };
          for (let i = 1; i < events.length; i++) {
            if (events[i].start <= current.end) {
              current.end = events[i].end > current.end ? events[i].end : current.end;
            } else {
              mergedEvents.push(current);
              current = { start: events[i].start, end: events[i].end };
            }
          }
          mergedEvents.push(current);
        }

        // Calculate gaps within work hours, excluding lunch
        let dayReportedSeconds = 0;
        mergedEvents.forEach(e => {
          // Clip to work hours (already partially done)
          const s = e.start < workStart ? workStart : e.start;
          const ed = e.end > workEnd ? workEnd : e.end;
          
          if (s < ed) {
            // Subtract lunch overlap from reported time
            let duration = differenceInSeconds(ed, s);
            const lOverlapStart = s < lunchStart ? lunchStart : s;
            const lOverlapEnd = ed > lunchEnd ? lunchEnd : ed;
            if (lOverlapStart < lOverlapEnd) {
              duration -= differenceInSeconds(lOverlapEnd, lOverlapStart);
            }
            dayReportedSeconds += Math.max(0, duration);
          }
        });

        totalReportedSeconds += dayReportedSeconds;
        
        const dayExpected = differenceInSeconds(workEnd, workStart) - differenceInSeconds(lunchEnd, lunchStart);
        const dayGap = Math.max(0, dayExpected - dayReportedSeconds);
        totalGapSeconds += dayGap;

        return {
          date: format(day, 'dd/MM'),
          compliance: dayExpected > 0 ? (dayReportedSeconds / dayExpected) * 100 : 100,
          gapMinutes: Math.round(dayGap / 60)
        };
      });

      const avgCompliance = totalExpectedSeconds > 0 
        ? (totalReportedSeconds / totalExpectedSeconds) * 100 
        : 100;

      return {
        id: designer.id,
        name: designer.name,
        avgCompliance: Math.min(100, Number(avgCompliance.toFixed(1))),
        totalGapHours: Number((totalGapSeconds / 3600).toFixed(1)),
        totalReportedHours: Number((totalReportedSeconds / 3600).toFixed(1)),
        dailyData
      };
    }).sort((a, b) => a.avgCompliance - b.avgCompliance); // Worst compliance first
  }, [designers, projects, activities, interruptions, settings, dateRange]);

  const selectedDesignerData = useMemo(() => {
    return calculateComplianceData.find(d => d.id === selectedDesignerId);
  }, [calculateComplianceData, selectedDesignerId]);

  const macroStats = useMemo(() => {
    const totalCompliance = calculateComplianceData.reduce((acc, d) => acc + d.avgCompliance, 0);
    const avgTeamCompliance = calculateComplianceData.length > 0 ? totalCompliance / calculateComplianceData.length : 0;
    const criticalTeam = calculateComplianceData.filter(d => d.avgCompliance < 80).length;

    return {
      avgTeamCompliance: Number(avgTeamCompliance.toFixed(1)),
      criticalCount: criticalTeam,
      totalDesigners: calculateComplianceData.length
    };
  }, [calculateComplianceData]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
        <div>
          <h2 className={`text-xl font-bold uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            {t('engineeringPerformance')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            {t('gapAnalysis')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-slate-900 p-1 rounded-xl">
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value as any)}
              className="px-3 py-1.5 bg-transparent border-none text-xs font-bold focus:ring-0 outline-none cursor-pointer text-gray-600 dark:text-slate-300"
            >
              <option value="7d">{t('last7Days')}</option>
              <option value="30d">{t('last30Days')}</option>
              <option value="currentMonth">{t('currentMonth')}</option>
              <option value="lastMonth">{t('lastMonth')}</option>
              <option value="year">{t('currentYear')}</option>
            </select>
          </div>

          <div className="flex bg-gray-100 dark:bg-slate-900 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('macro')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'macro' 
                  ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('macroView').toUpperCase()}
            </button>
            <button
              onClick={() => setViewMode('individual')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'individual' 
                  ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t('individualView').toUpperCase()}
            </button>
          </div>

          {viewMode === 'individual' && (
            <select
              value={selectedDesignerId}
              onChange={(e) => setSelectedDesignerId(e.target.value)}
              className="p-2 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">{t('allDesigners')}</option>
              {designers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {viewMode === 'macro' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stats Summary */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 text-center">
              <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4">
                <TrendingUp size={32} />
              </div>
              <p className="text-sm font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">{t('averageCompliance')}</p>
              <p className={`text-4xl font-black ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {macroStats.avgTeamCompliance}%
              </p>
              <div className="mt-4 w-full bg-gray-100 dark:bg-slate-900 rounded-full h-2 overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    macroStats.avgTeamCompliance > 90 ? 'bg-emerald-500' : macroStats.avgTeamCompliance > 75 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${macroStats.avgTeamCompliance}%` }}
                />
              </div>
            </div>

            <div className={`p-6 rounded-2xl border ${
              macroStats.criticalCount > 0 
                ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20' 
                : 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/20'
            }`}>
              <div className="flex items-center gap-3 mb-4">
                {macroStats.criticalCount > 0 ? (
                  <AlertTriangle className="text-red-500" />
                ) : (
                  <CheckCircle2 className="text-emerald-500" />
                )}
                <h4 className={`font-bold ${macroStats.criticalCount > 0 ? 'text-red-800 dark:text-red-300' : 'text-emerald-800 dark:text-emerald-300'}`}>
                  {macroStats.criticalCount > 0 ? t('nonComplianceWarning') : t('allGood')}
                </h4>
              </div>
              <p className="text-sm opacity-80">
                {macroStats.criticalCount} {t('designers')} {t('withLowCompliance')} (&lt; 80%).
              </p>
            </div>
          </div>

          {/* Ranking Chart */}
          <div className="lg:col-span-2 bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
            <h3 className={`text-lg font-bold mb-6 uppercase flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              <BarChart3 size={20} className="text-blue-500" />
              {t('fillingComplianceByDesigner')}
            </h3>
            <div className="h-[400px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={calculateComplianceData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={120}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 10, fontWeight: 'bold' }}
                  />
                  <Tooltip 
                    cursor={{ fill: theme === 'dark' ? '#1e293b' : '#f8fafc' }}
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                      borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                      borderRadius: '12px'
                    }}
                    formatter={(value: any) => [`${value}%`, t('complianceRate')]}
                  />
                  <Bar dataKey="avgCompliance" radius={[0, 4, 4, 0]} barSize={20}>
                    {calculateComplianceData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.avgCompliance >= 90 ? '#10b981' : entry.avgCompliance >= 75 ? '#f59e0b' : '#ef4444'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          
          {/* Detailed Table */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
             <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50">
               <h3 className={`font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                 {t('complianceRanking')}
               </h3>
             </div>
             <div className="overflow-x-auto">
               <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-100 dark:border-slate-700">
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest">{t('designer')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">{t('reportedHours')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">{t('gapTime')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-center">{t('complianceRate')}</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-widest text-right">{t('status')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-slate-800/10">
                    {calculateComplianceData.map((d) => (
                      <tr 
                        key={d.id} 
                        className="group hover:bg-gray-50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer"
                        onClick={() => {
                          setSelectedDesignerId(d.id);
                          setViewMode('individual');
                        }}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 flex items-center justify-center font-bold text-xs">
                              {d.name.charAt(0)}
                            </div>
                            <span className={`text-sm font-bold uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{d.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center font-mono font-bold text-gray-600 dark:text-slate-300">{d.totalReportedHours}h</td>
                        <td className="px-6 py-4 text-center font-mono font-bold text-red-500">{d.totalGapHours}h</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col items-center gap-1">
                             <span className={`text-sm font-black ${d.avgCompliance >= 90 ? 'text-emerald-500' : d.avgCompliance >= 75 ? 'text-amber-500' : 'text-red-500'}`}>
                               {d.avgCompliance}%
                             </span>
                             <div className="w-20 bg-gray-100 dark:bg-slate-900 h-1 rounded-full overflow-hidden">
                                <div 
                                  className={`h-full ${d.avgCompliance >= 90 ? 'bg-emerald-500' : d.avgCompliance >= 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                                  style={{ width: `${d.avgCompliance}%` }}
                                />
                             </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                           <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                             d.avgCompliance >= 90 ? 'bg-emerald-100 text-emerald-600' : d.avgCompliance >= 75 ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
                           }`}>
                             {d.avgCompliance >= 90 ? t('ok') : d.avgCompliance >= 75 ? t('warning') : t('critical')}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
             </div>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {selectedDesignerId === 'ALL' ? (
            <div className="bg-white dark:bg-slate-800 p-12 text-center rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
               <Users size={48} className="mx-auto text-gray-300 mb-4" />
               <p className="text-gray-500 uppercase font-bold tracking-widest">{t('selectDesignerToViewDetails')}</p>
            </div>
          ) : (
            <>
              {/* Individual Stats Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('designer')}</p>
                    <p className={`text-xl font-black uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{selectedDesignerData?.name}</p>
                 </div>
                 <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('averageCompliance')}</p>
                    <p className={`text-3xl font-black ${selectedDesignerData!.avgCompliance >= 90 ? 'text-emerald-500' : selectedDesignerData!.avgCompliance >= 75 ? 'text-amber-500' : 'text-red-500'}`}>
                      {selectedDesignerData?.avgCompliance}%
                    </p>
                 </div>
                 <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('reportedHours')}</p>
                    <p className={`text-3xl font-black ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{selectedDesignerData?.totalReportedHours}h</p>
                 </div>
                 <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 border-red-100 dark:border-red-900/20">
                    <p className="text-xs font-bold text-gray-400 uppercase mb-1">{t('totalGaps')}</p>
                    <p className="text-3xl font-black text-red-500">{selectedDesignerData?.totalGapHours}h</p>
                 </div>
              </div>

              {/* Individual Daily Trend Chart */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                <h3 className={`text-lg font-bold mb-6 uppercase flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  <Calendar size={20} className="text-blue-500" />
                  {t('complianceTrendOverTime')}
                </h3>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selectedDesignerData?.dailyData}>
                      <defs>
                        <linearGradient id="colorComp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                      <XAxis 
                        dataKey="date" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }}
                        minTickGap={30}
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }}
                        domain={[0, 100]}
                        unit="%"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                          borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                          borderRadius: '12px'
                        }}
                      />
                      <Area type="monotone" dataKey="compliance" stroke="#3b82f6" fillOpacity={1} fill="url(#colorComp)" strokeWidth={3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Daily Gap Analysis */}
              <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700">
                <h3 className={`text-lg font-bold mb-6 uppercase flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                   <Clock size={20} className="text-red-500" />
                   {t('dailyGapAnalysis')} (min)
                </h3>
                <div className="h-[250px]">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selectedDesignerData?.dailyData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                        <XAxis 
                          dataKey="date" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }}
                          minTickGap={30}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }}
                        />
                        <Tooltip 
                          cursor={{ fill: 'transparent' }}
                          contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                            borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                            borderRadius: '12px'
                          }}
                        />
                        <Bar dataKey="gapMinutes" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      </BarChart>
                   </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
