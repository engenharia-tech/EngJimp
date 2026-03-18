import React, { useState, useMemo, useEffect } from 'react';
import { 
  Play, 
  Square, 
  Clock, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  AlertCircle,
  BarChart3,
  List,
  Settings as SettingsIcon,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Activity,
  RefreshCw,
  Flag,
  UserCog,
  Mail,
  Save
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  OperationalActivity, 
  ActivityType, 
  User, 
  ProjectSession,
  AppSettings
} from '../types';
import { format, startOfDay, endOfDay, isWithinInterval, parseISO, differenceInSeconds, addSeconds, subDays, addDays } from 'date-fns';
import { ptBR, es, enUS } from 'date-fns/locale';
import { useLanguage } from '../i18n/LanguageContext';

interface OperationalPerformanceProps {
  activities: OperationalActivity[];
  activityTypes: ActivityType[];
  projects: ProjectSession[];
  currentUser: User;
  users: User[];
  theme: 'light' | 'dark';
  onAddActivity: (activity: OperationalActivity) => Promise<void>;
  onUpdateActivity: (activity: OperationalActivity) => Promise<void>;
  onDeleteActivity: (id: string) => Promise<void>;
  onAddActivityType: (type: ActivityType) => Promise<void>;
  onUpdateActivityType: (type: ActivityType) => Promise<void>;
  onDeleteActivityType: (id: string) => Promise<void>;
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => Promise<void>;
}

export const OperationalPerformance: React.FC<OperationalPerformanceProps> = ({
  activities,
  activityTypes,
  projects,
  currentUser,
  users,
  theme,
  onAddActivity,
  onUpdateActivity,
  onDeleteActivity,
  onAddActivityType,
  onUpdateActivityType,
  onDeleteActivityType,
  settings,
  onUpdateSettings
}) => {
  const { t, language } = useLanguage();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const [selectedUserId, setSelectedUserId] = useState(currentUser.id);

  const [isAddingType, setIsAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [activeTab, setActiveTab] = useState<'tracker' | 'dashboard' | 'management'>('tracker');
  const [isEditingGap, setIsEditingGap] = useState<{ start: string; end: string } | null>(null);
  const [selectedActivityType, setSelectedActivityType] = useState('');
  const [gapNotes, setGapNotes] = useState('');
  const [gapIsFlagged, setGapIsFlagged] = useState(false);

  const dateLocale = useMemo(() => {
    switch (language) {
      case 'pt-BR': return ptBR;
      case 'es-ES': return es;
      default: return enUS;
    }
  }, [language]);

  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      const activityStart = parseISO(a.startTime);
      const isUser = a.userId === selectedUserId;
      if (!isUser) return false;

      if (viewMode === 'day') {
        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);
        return isWithinInterval(activityStart, { start, end });
      } else if (viewMode === 'month') {
        return activityStart.getMonth() === selectedDate.getMonth() && 
               activityStart.getFullYear() === selectedDate.getFullYear();
      } else {
        return activityStart.getFullYear() === selectedDate.getFullYear();
      }
    });
  }, [activities, selectedDate, selectedUserId, viewMode]);

  const filteredProjects = useMemo(() => {
    return projects.filter(p => {
      const projectStart = parseISO(p.startTime);
      const isUser = p.userId === selectedUserId;
      if (!isUser) return false;

      if (viewMode === 'day') {
        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);
        return isWithinInterval(projectStart, { start, end });
      } else if (viewMode === 'month') {
        return projectStart.getMonth() === selectedDate.getMonth() && 
               projectStart.getFullYear() === selectedDate.getFullYear();
      } else {
        return projectStart.getFullYear() === selectedDate.getFullYear();
      }
    });
  }, [projects, selectedDate, selectedUserId, viewMode]);

  // Combine projects and activities for a full timeline
  const timelineItems = useMemo(() => {
    const items = [
      ...filteredActivities.map(a => ({
        id: a.id,
        type: 'activity',
        name: a.activityName,
        start: parseISO(a.startTime),
        end: a.endTime ? parseISO(a.endTime) : new Date(),
        color: '#3b82f6' // blue
      })),
      ...filteredProjects.map(p => ({
        id: p.id,
        type: 'project',
        name: `Projeto: ${p.ns || p.projectCode || 'S/N'}`,
        start: parseISO(p.startTime),
        end: p.endTime ? parseISO(p.endTime) : new Date(),
        color: '#10b981' // emerald
      }))
    ];

    return items.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [filteredActivities, filteredProjects]);

  // Find gaps in the timeline (assuming work day 08:00 - 18:00)
  const gaps = useMemo(() => {
    const workStart = new Date(selectedDate);
    workStart.setHours(8, 0, 0, 0);
    
    const workEnd = new Date(selectedDate);
    workEnd.setHours(18, 0, 0, 0);

    const foundGaps: { start: Date; end: Date }[] = [];
    let lastEnd = workStart;

    timelineItems.forEach(item => {
      if (item.start > lastEnd) {
        foundGaps.push({ start: lastEnd, end: item.start });
      }
      if (item.end > lastEnd) {
        lastEnd = item.end;
      }
    });

    if (lastEnd < workEnd) {
      foundGaps.push({ start: lastEnd, end: workEnd });
    }

    return foundGaps.filter(g => differenceInSeconds(g.end, g.start) > 60); // Gaps > 1 min
  }, [timelineItems, selectedDate]);

  const stats = useMemo(() => {
    const dataMap: Record<string, number> = {
      [t('projects') || 'Projetos']: 0
    };

    // Initialize map with all activity types
    activityTypes.forEach(type => {
      dataMap[type.name] = 0;
    });

    timelineItems.forEach(item => {
      const duration = differenceInSeconds(item.end, item.start);
      if (item.type === 'project') {
        dataMap[t('projects') || 'Projetos'] += duration;
      } else {
        if (dataMap[item.name] !== undefined) {
          dataMap[item.name] += duration;
        } else {
          const othersKey = t('others') || 'Outros';
          dataMap[othersKey] = (dataMap[othersKey] || 0) + duration;
        }
      }
    });

    return Object.entries(dataMap)
      .filter(([_, value]) => value > 0)
      .map(([name, value]) => ({
        name,
        value: Math.round(value / 60), // in minutes
        hours: (value / 3600).toFixed(2)
      }));
  }, [timelineItems, activityTypes, t]);

  const totalMinutes = useMemo(() => {
    return stats.reduce((acc, curr) => acc + curr.value, 0);
  }, [stats]);

  const totalHours = (totalMinutes / 60).toFixed(1);

  const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];

  const handleStartActivity = async (typeId: string) => {
    const type = activityTypes.find(t => t.id === typeId);
    if (!type) return;

    const newActivity: OperationalActivity = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      activityTypeId: typeId,
      activityName: type.name,
      startTime: new Date().toISOString(),
      durationSeconds: 0
    };

    await onAddActivity(newActivity);
  };

  const handleStopActivity = async (activity: OperationalActivity) => {
    const endTime = new Date().toISOString();
    const durationSeconds = differenceInSeconds(parseISO(endTime), parseISO(activity.startTime));
    
    await onUpdateActivity({
      ...activity,
      endTime,
      durationSeconds
    });
  };

  const handleFillGap = async () => {
    if (!isEditingGap || !selectedActivityType) return;

    const type = activityTypes.find(t => t.id === selectedActivityType);
    if (!type) return;

    const durationSeconds = differenceInSeconds(parseISO(isEditingGap.end), parseISO(isEditingGap.start));

    const newActivity: OperationalActivity = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      activityTypeId: type.id,
      activityName: type.name,
      startTime: isEditingGap.start,
      endTime: isEditingGap.end,
      durationSeconds,
      notes: gapNotes,
      isFlagged: gapIsFlagged
    };

    await onAddActivity(newActivity);
    setIsEditingGap(null);
    setSelectedActivityType('');
    setGapNotes('');
    setGapIsFlagged(false);
  };

  const handleAddType = async () => {
    if (!newTypeName.trim()) return;
    const name = newTypeName.trim().toUpperCase();
    
    // Check if already exists
    if (activityTypes.some(t => t.name.toUpperCase() === name)) {
      alert(t('activityTypeAlreadyExists') || 'Este tipo de atividade já existe');
      return;
    }

    await onAddActivityType({
      id: crypto.randomUUID(),
      name,
      isActive: true
    });
    setNewTypeName('');
    setIsAddingType(false);
  };

  const isReadOnly = currentUser.role === 'CEO';
  const canEditOthers = ['GESTOR', 'COORDENADOR'].includes(currentUser.role);
  const isViewingSelf = selectedUserId === currentUser.id;
  const canEditCurrent = !isReadOnly && (isViewingSelf || canEditOthers);

  const currentRunningActivity = activities.find(a => !a.endTime && a.userId === selectedUserId);

  const toggleFlag = async (activity: OperationalActivity) => {
    if (!canEditCurrent) return;
    await onUpdateActivity({
      ...activity,
      isFlagged: !activity.isFlagged
    });
  };

  const filteredUsers = useMemo(() => {
    return users.filter(u => ['PROJETISTA', 'COORDENADOR', 'GESTOR'].includes(u.role));
  }, [users]);

  return (
    <div className="space-y-6">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            {t('operationalPerformance')}
          </h2>
          <p className={theme === 'dark' ? 'text-slate-200 font-medium' : 'text-gray-500'}>
            {t('operationalPerformanceDesc')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className={`p-2 rounded-xl border transition-all ${
              theme === 'dark' 
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700' 
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
            title={t('refresh') || 'Atualizar'}
          >
            <RefreshCw size={20} />
          </button>
          {canEditOthers && (
            <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1 px-3 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
              <UserCog size={18} className="text-gray-400" />
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="bg-transparent border-none text-sm font-medium focus:ring-0 outline-none min-w-[150px]"
              >
                {filteredUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 bg-white dark:bg-slate-800 p-1 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
          <button
            onClick={() => setActiveTab('tracker')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeTab === 'tracker' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            <Clock size={18} />
            <span className="hidden sm:inline">{t('tracker')}</span>
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
              activeTab === 'dashboard' 
                ? 'bg-blue-600 text-white shadow-md' 
                : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'
            }`}
          >
            <BarChart3 size={18} />
            <span className="hidden sm:inline">{t('dashboard')}</span>
          </button>
          {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
            <button
              onClick={() => setActiveTab('management')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === 'management' 
                  ? 'bg-blue-600 text-white shadow-md' 
                  : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
            >
              <SettingsIcon size={18} />
              <span className="hidden sm:inline">{t('management')}</span>
            </button>
          )}
        </div>
      </div>
    </div>

      {activeTab === 'tracker' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tracker Controls */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className={`text-lg font-semibold mb-4 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                <Activity className="text-blue-500" size={20} />
                {t('currentActivity')}
              </h3>

              {!canEditCurrent ? (
                <div className="p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 text-center">
                  <p className="text-sm text-gray-500 italic">{t('readOnlyMode') || 'Modo apenas leitura'}</p>
                </div>
              ) : currentRunningActivity ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800">
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wider">
                      {currentRunningActivity.activityName}
                    </p>
                    <div className="text-3xl font-mono font-bold text-blue-700 dark:text-blue-300 mt-1">
                      <Timer startTime={currentRunningActivity.startTime} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleFlag(currentRunningActivity)}
                      className={`p-3 rounded-xl transition-all border ${
                        currentRunningActivity.isFlagged
                          ? 'bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400'
                          : 'bg-gray-50 border-gray-200 text-gray-400 dark:bg-slate-900 dark:border-slate-700 hover:text-red-500'
                      }`}
                      title={t('flagActivity') || 'Sinalizar Atividade'}
                    >
                      <Flag size={20} fill={currentRunningActivity.isFlagged ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      onClick={() => handleStopActivity(currentRunningActivity)}
                      className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-600/20"
                    >
                      <Square size={20} fill="currentColor" />
                      {t('stopActivity')}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <label className={`text-xs font-semibold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-300' : 'text-gray-500'}`}>
                      {t('selectActivity') || 'Selecionar Atividade'}
                    </label>
                    <div className="flex gap-2">
                      <select
                        className="flex-1 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => {
                          if (e.target.value) {
                            handleStartActivity(e.target.value);
                            e.target.value = '';
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>{t('selectActivityType')}</option>
                        {activityTypes.filter(t => t.isActive !== false).map(type => (
                          <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setIsAddingType(true)}
                        className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-md"
                        title={t('addActivityType')}
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  {activityTypes.filter(t => t.isActive !== false).length === 0 ? (
                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-xl text-center">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                        {t('noActivityTypesFound') || 'Nenhum tipo de atividade encontrado. Adicione um para começar.'}
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {activityTypes.filter(t => t.isActive !== false).slice(0, 8).map(type => (
                        <button
                          key={type.id}
                          onClick={() => handleStartActivity(type.id)}
                          className="flex flex-col items-center justify-center p-3 bg-gray-50 dark:bg-slate-900 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-slate-700 rounded-xl transition-all group"
                        >
                          <Play size={18} className="text-gray-400 group-hover:text-blue-500 mb-1" />
                          <span className="text-xs font-bold text-gray-700 dark:text-white text-center uppercase tracking-tight">
                            {type.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* View Mode & Date Selector */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                    {t('viewMode')}
                  </h3>
                  <BarChart3 size={18} className="text-gray-400" />
                </div>
                <div className="flex p-1 bg-gray-100 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700">
                  <button
                    onClick={() => setViewMode('day')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      viewMode === 'day'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('daily')}
                  </button>
                  <button
                    onClick={() => setViewMode('month')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      viewMode === 'month'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('monthly')}
                  </button>
                  <button
                    onClick={() => setViewMode('year')}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      viewMode === 'year'
                        ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {t('yearly')}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                    {viewMode === 'day' ? t('selectDate') : viewMode === 'month' ? t('selectMonth') : t('selectYear')}
                  </h3>
                  <Calendar size={18} className="text-gray-400" />
                </div>
                <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-900 p-2 rounded-xl border border-gray-200 dark:border-slate-700">
                  <button 
                    onClick={() => {
                      if (viewMode === 'day') setSelectedDate(subDays(selectedDate, 1));
                      else if (viewMode === 'month') {
                        const d = new Date(selectedDate);
                        d.setMonth(d.getMonth() - 1);
                        setSelectedDate(d);
                      } else {
                        const d = new Date(selectedDate);
                        d.setFullYear(d.getFullYear() - 1);
                        setSelectedDate(d);
                      }
                    }}
                    className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-gray-500 z-10"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <div className="relative flex-1 flex justify-center items-center cursor-pointer hover:bg-white dark:hover:bg-slate-800 rounded-lg py-1 transition-all mx-2">
                    {viewMode === 'day' ? (
                      <>
                        <input 
                          type="date"
                          value={format(selectedDate, 'yyyy-MM-dd')}
                          onChange={(e) => {
                            const [year, month, day] = e.target.value.split('-').map(Number);
                            const newDate = new Date(year, month - 1, day, 12, 0, 0);
                            if (!isNaN(newDate.getTime())) {
                              setSelectedDate(newDate);
                            }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                          {format(selectedDate, 'dd/MM/yyyy')}
                        </span>
                      </>
                    ) : viewMode === 'month' ? (
                      <>
                        <input 
                          type="month"
                          value={format(selectedDate, 'yyyy-MM')}
                          onChange={(e) => {
                            const [year, month] = e.target.value.split('-').map(Number);
                            const newDate = new Date(year, month - 1, 1, 12, 0, 0);
                            if (!isNaN(newDate.getTime())) {
                              setSelectedDate(newDate);
                            }
                          }}
                          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                        />
                        <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                          {format(selectedDate, 'MMMM yyyy', { locale: dateLocale })}
                        </span>
                      </>
                    ) : (
                      <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                        {format(selectedDate, 'yyyy')}
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      if (viewMode === 'day') setSelectedDate(addDays(selectedDate, 1));
                      else if (viewMode === 'month') {
                        const d = new Date(selectedDate);
                        d.setMonth(d.getMonth() + 1);
                        setSelectedDate(d);
                      } else {
                        const d = new Date(selectedDate);
                        d.setFullYear(d.getFullYear() + 1);
                        setSelectedDate(d);
                      }
                    }}
                    className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-gray-500 z-10"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline & Gaps */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className={`text-lg font-semibold mb-6 flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                <List className="text-blue-500" size={20} />
                {viewMode === 'day' ? t('dailyTimeline') : viewMode === 'month' ? t('monthlySummary') : t('yearlySummary')}
              </h3>

              <div className="space-y-4 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100 dark:before:bg-slate-700">
                {timelineItems.length === 0 && (viewMode !== 'day' || gaps.length === 0) && (
                  <div className="py-12 text-center">
                    <Clock size={48} className="mx-auto text-gray-300 mb-4" />
                    <p className="text-gray-500">
                      {viewMode === 'day' ? t('noActivitiesToday') : t('noActivitiesRecorded')}
                    </p>
                  </div>
                )}

                {/* Combine and sort everything by start time */}
                {[
                  ...timelineItems.map(item => ({ ...item, isGap: false })),
                  ...(viewMode === 'day' ? gaps.map(gap => ({ ...gap, isGap: true, name: t('blankGap'), type: 'gap' })) : [])
                ]
                .sort((a, b) => a.start.getTime() - b.start.getTime())
                .map((item, idx) => (
                  <div key={idx} className="relative pl-8 group">
                    <div className={`absolute left-0 top-1.5 w-6 h-6 rounded-full border-4 ${
                      item.isGap 
                        ? 'bg-amber-100 border-amber-50 dark:bg-amber-900/30 dark:border-amber-900/10' 
                        : item.type === 'project'
                          ? 'bg-emerald-100 border-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-900/10'
                          : 'bg-blue-100 border-blue-50 dark:bg-blue-900/30 dark:border-blue-900/10'
                    } flex items-center justify-center z-10`}>
                      <div className={`w-2 h-2 rounded-full ${
                        item.isGap ? 'bg-amber-500' : item.type === 'project' ? 'bg-emerald-500' : 'bg-blue-500'
                      }`} />
                    </div>

                    <div className={`p-4 rounded-xl border transition-all ${
                      item.isGap
                        ? canEditCurrent 
                          ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/20 border-dashed hover:border-amber-300 cursor-pointer'
                          : 'bg-gray-50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-800 border-dashed opacity-60'
                        : 'bg-gray-50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-800'
                    }`}
                    onClick={() => {
                      if (item.isGap && canEditCurrent) {
                        setIsEditingGap({ 
                          start: item.start.toISOString(), 
                          end: item.end.toISOString() 
                        });
                      }
                    }}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          {item.type === 'activity' && activities.find(a => a.id === item.id)?.isFlagged && (
                            <Flag size={14} className="text-red-500 fill-red-500" />
                          )}
                          <span className={`text-sm font-bold uppercase tracking-wider ${
                          item.isGap ? 'text-amber-600 dark:text-amber-400' : theme === 'dark' ? 'text-white' : 'text-gray-800'
                        }`}>
                          {item.name}
                        </span>
                      </div>
                      <span className={`text-xs font-mono bg-white dark:bg-slate-800 px-2 py-0.5 rounded border border-gray-100 dark:border-slate-700 ${
                        theme === 'dark' ? 'text-slate-200 font-bold' : 'text-gray-500'
                      }`}>
                        {format(item.start, 'HH:mm')} - {format(item.end, 'HH:mm')}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`text-xs flex items-center gap-1 ${theme === 'dark' ? 'text-slate-300' : 'text-gray-500'}`}>
                        <Clock size={12} />
                        {Math.round(differenceInSeconds(item.end, item.start) / 60)} min
                      </span>
                        {item.isGap && (
                          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
                            <Plus size={12} />
                            {t('fillGap')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-slate-300 mb-1">{t('totalTime') || 'Tempo Total'}</p>
              <p className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {totalHours}h
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-slate-300 mb-1">{t('activitiesCount') || 'Atividades'}</p>
              <p className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {filteredActivities.length}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-slate-300 mb-1">{t('projectsCount') || 'Projetos'}</p>
              <p className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {filteredProjects.length}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
            <h3 className={`text-lg font-semibold mb-6 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              {t('timeDistribution')}
            </h3>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {stats.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                      borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                      color: theme === 'dark' ? '#fff' : '#000'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
            <h3 className={`text-lg font-semibold mb-6 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              {t('summaryByActivity')}
            </h3>
            <div className="space-y-4">
              {stats.map((stat, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-100 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                    <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{stat.name}</span>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{stat.hours}h</p>
                    <p className="text-xs text-gray-500 dark:text-slate-400">{stat.value} min</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {activeTab === 'management' && (
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-6">
            <h3 className={`text-lg font-semibold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              {t('activityManagement')}
            </h3>
            <button
              onClick={() => setIsAddingType(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-all"
            >
              <Plus size={18} />
              {t('addActivityType')}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activityTypes.map(type => (
              <div key={type.id} className="p-4 bg-gray-50 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 flex items-center justify-between group">
                <div>
                  <p className={`font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                    {type.name}
                  </p>
                  <span className={`text-xs ${type.isActive ? 'text-emerald-500' : 'text-red-500'}`}>
                    {type.isActive ? t('active') : t('inactive')}
                  </span>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => onUpdateActivityType({ ...type, isActive: !type.isActive })}
                    className={`p-2 rounded-lg ${type.isActive ? 'text-red-500 hover:bg-red-50' : 'text-emerald-500 hover:bg-emerald-50'}`}
                  >
                    {type.isActive ? <Square size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    onClick={() => onDeleteActivityType(type.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {isAddingType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-slate-700">
            <h3 className={`text-xl font-bold mb-4 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              {t('addActivityType')}
            </h3>
            <input
              type="text"
              value={newTypeName}
              onChange={(e) => setNewTypeName(e.target.value)}
              placeholder={t('activityNamePlaceholder')}
              className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl mb-6 focus:ring-2 focus:ring-blue-500 outline-none uppercase"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => setIsAddingType(false)}
                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleAddType}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                {t('add')}
              </button>
            </div>
          </div>
        </div>
      )}

      {isEditingGap && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-slate-700">
            <h3 className={`text-xl font-bold mb-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
              {t('fillGap')}
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              {format(parseISO(isEditingGap.start), 'HH:mm')} - {format(parseISO(isEditingGap.end), 'HH:mm')} 
              ({Math.round(differenceInSeconds(parseISO(isEditingGap.end), parseISO(isEditingGap.start)) / 60)} min)
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase">{t('activityType')}</label>
                  <button 
                    onClick={() => setIsAddingType(true)}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-600 uppercase flex items-center gap-1"
                  >
                    <Plus size={10} />
                    {t('addType') || 'Novo Tipo'}
                  </button>
                </div>
                <select
                  value={selectedActivityType}
                  onChange={(e) => setSelectedActivityType(e.target.value)}
                  className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 dark:text-white font-medium"
                >
                  <option value="">{t('selectType')}</option>
                  {activityTypes.filter(t => t.isActive !== false).map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{t('notes')}</label>
                <textarea
                  value={gapNotes}
                  onChange={(e) => setGapNotes(e.target.value)}
                  className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none text-gray-800 dark:text-white"
                  placeholder={t('notesPlaceholder')}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="gapIsFlagged"
                  checked={gapIsFlagged}
                  onChange={(e) => setGapIsFlagged(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="gapIsFlagged" className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t('flagActivity') || 'Sinalizar esta atividade'}
                </label>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsEditingGap(null)}
                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleFillGap}
                disabled={!selectedActivityType}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Timer: React.FC<{ startTime: string }> = ({ startTime }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const diff = differenceInSeconds(now, parseISO(startTime));
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = diff % 60;

  return (
    <span>
      {h.toString().padStart(2, '0')}:{m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}
    </span>
  );
};
