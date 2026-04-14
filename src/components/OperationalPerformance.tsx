import React, { useState, useMemo, useEffect, useRef } from 'react';
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
import { useToast } from './Toast';

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
  onRefresh?: () => Promise<void>;
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
  onUpdateSettings,
  onRefresh
}) => {
  const { t, language } = useLanguage();
  const { addToast } = useToast();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'day' | 'month' | 'year'>('day');
  const [selectedUserId, setSelectedUserId] = useState(currentUser.id);

  const [isAddingType, setIsAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [activeTab, setActiveTab] = useState<'tracker' | 'dashboard' | 'management'>('tracker');
  const [isEditingGap, setIsEditingGap] = useState<{ start: string; end: string } | null>(null);
  const [isEditingActivity, setIsEditingActivity] = useState<OperationalActivity | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [selectedActivityType, setSelectedActivityType] = useState('');
  const [gapNotes, setGapNotes] = useState('');
  const [gapIsFlagged, setGapIsFlagged] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editStartTime, setEditStartTime] = useState('');
  const [editEndTime, setEditEndTime] = useState('');

  // Sync edit times when modal opens
  useEffect(() => {
    if (isEditingActivity) {
      setEditStartTime(format(parseISO(isEditingActivity.startTime), 'HH:mm'));
      setEditEndTime(format(parseISO(isEditingActivity.endTime), 'HH:mm'));
    } else if (isEditingGap) {
      setEditStartTime(format(parseISO(isEditingGap.start), 'HH:mm'));
      setEditEndTime(format(parseISO(isEditingGap.end), 'HH:mm'));
    }
  }, [isEditingActivity, isEditingGap]);

  // Check if activity types are temporary (database error)
  const isUsingTempActivities = useMemo(() => {
    return activityTypes.some(t => t.id.startsWith('temp-'));
  }, [activityTypes]);

  // Set default selected activity type
  useEffect(() => {
    if (!selectedActivityType && activityTypes.length > 0) {
      const firstActive = activityTypes.find(t => t.isActive !== false);
      if (firstActive) setSelectedActivityType(firstActive.id);
    }
  }, [activityTypes, selectedActivityType]);

  const dateLocale = useMemo(() => {
    switch (language) {
      case 'pt-BR': return ptBR;
      case 'es-ES': return es;
      default: return enUS;
    }
  }, [language]);

  const canEditOthers = ['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role);
  const canEditCurrent = selectedUserId === currentUser.id || canEditOthers;

  const filteredUsers = useMemo(() => {
    const nonProcessUsers = users.filter(u => u.role !== 'PROCESSOS');
    if (canEditOthers) return nonProcessUsers;
    return nonProcessUsers.filter(u => u.id === currentUser.id);
  }, [users, currentUser.id, canEditOthers]);

  const filteredActivities = useMemo(() => {
    return activities.filter(a => {
      const activityStart = parseISO(a.startTime);
      const activityEnd = a.endTime ? parseISO(a.endTime) : new Date();
      const isUser = a.userId === selectedUserId;
      if (!isUser) return false;

      if (viewMode === 'day') {
        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);
        // Activity overlaps with the day if:
        // activityStart <= dayEnd AND activityEnd >= dayStart
        return activityStart <= end && activityEnd >= start;
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
      const projectEnd = p.endTime ? parseISO(p.endTime) : new Date();
      const isUser = p.userId === selectedUserId;
      if (!isUser) return false;

      if (viewMode === 'day') {
        const start = startOfDay(selectedDate);
        const end = endOfDay(selectedDate);
        // Project overlaps with the day if:
        // projectStart <= dayEnd AND projectEnd >= dayStart
        return projectStart <= end && projectEnd >= start;
      } else if (viewMode === 'month') {
        return projectStart.getMonth() === selectedDate.getMonth() && 
               projectStart.getFullYear() === selectedDate.getFullYear();
      } else {
        return projectStart.getFullYear() === selectedDate.getFullYear();
      }
    });
  }, [projects, selectedDate, selectedUserId, viewMode]);

  const currentActivity = useMemo(() => {
    return activities.find(a => !a.endTime && a.userId === selectedUserId);
  }, [activities, selectedUserId]);

  const isSeedingRef = useRef(false);

  // Automated Weekend Marking
  useEffect(() => {
    const checkWeekend = async () => {
      const dayOfWeek = selectedDate.getDay(); // 0 = Sunday, 6 = Saturday
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      if (isWeekend && filteredActivities.length === 0 && filteredProjects.length === 0 && currentUser.id === selectedUserId && !isSeedingRef.current) {
        const folgaType = activityTypes.find(t => t.name.toUpperCase() === 'FOLGA');
        if (folgaType) {
          // Double check against full activities list to prevent duplicates
          const dayStart = startOfDay(selectedDate);
          const dayEnd = endOfDay(selectedDate);
          
          const alreadyExists = activities.some(a => 
            a.userId === currentUser.id && 
            a.activityName.toUpperCase() === 'FOLGA' &&
            parseISO(a.startTime) >= dayStart && parseISO(a.startTime) <= dayEnd
          ) || filteredActivities.some(a => a.activityName.toUpperCase() === 'FOLGA');

          if (alreadyExists) return;

          isSeedingRef.current = true;
          try {
            const startTime = new Date(selectedDate);
            startTime.setHours(8, 0, 0, 0);
            const endTime = new Date(selectedDate);
            endTime.setHours(18, 0, 0, 0);

            const newActivity: OperationalActivity = {
              id: crypto.randomUUID(),
              userId: currentUser.id,
              activityTypeId: folgaType.id,
              activityName: folgaType.name,
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              durationSeconds: differenceInSeconds(endTime, startTime),
              isFlagged: false,
              notes: 'Automático: Fim de semana',
              projectId: undefined
            };
            
            await onAddActivity(newActivity);
          } finally {
            isSeedingRef.current = false;
          }
        }
      }
    };

    checkWeekend();
  }, [selectedDate, filteredActivities, filteredProjects.length, activityTypes, currentUser.id, selectedUserId, onAddActivity, activities]);

  // Combine projects and activities for a full timeline
  const timelineItems = useMemo(() => {
    const workdayStartStr = settings.workdayStart || "08:00";
    const workdayEndStr = settings.workdayEnd || "18:00";
    const lunchStartStr = settings.lunchStart || "12:00";
    const lunchEndStr = settings.lunchEnd || "13:00";

    const [wsH, wsM] = workdayStartStr.split(':').map(Number);
    const [weH, weM] = workdayEndStr.split(':').map(Number);
    const [lsH, lsM] = lunchStartStr.split(':').map(Number);
    const [leH, leM] = lunchEndStr.split(':').map(Number);

    const items: any[] = [];

    const processItem = (id: string, type: 'activity' | 'project', name: string, startTime: string, endTime: string | undefined, color: string) => {
      const start = parseISO(startTime);
      const end = endTime ? parseISO(endTime) : new Date();

      if (viewMode !== 'day') {
        items.push({ id, type, name, start, end, color });
        return;
      }

      // Day view: Split into segments for the selected day
      const dayStart = startOfDay(selectedDate);
      const dayEnd = endOfDay(selectedDate);

      // Intersection of item and selected day
      const overlapStart = start < dayStart ? dayStart : start;
      const overlapEnd = end > dayEnd ? dayEnd : end;

      if (overlapStart >= overlapEnd) return;

      // Further clip to work hours
      const workStart = new Date(selectedDate);
      workStart.setHours(wsH, wsM, 0, 0);
      const workEnd = new Date(selectedDate);
      workEnd.setHours(weH, weM, 0, 0);

      const clippedStart = overlapStart < workStart ? workStart : overlapStart;
      const clippedEnd = overlapEnd > workEnd ? workEnd : overlapEnd;

      if (clippedStart >= clippedEnd) return;

      // Split by lunch break
      const lunchStart = new Date(selectedDate);
      lunchStart.setHours(lsH, lsM, 0, 0);
      const lunchEnd = new Date(selectedDate);
      lunchEnd.setHours(leH, leM, 0, 0);

      // Segment before lunch
      const beforeLunchEnd = clippedEnd < lunchStart ? clippedEnd : lunchStart;
      if (clippedStart < beforeLunchEnd) {
        items.push({
          id: `${id}-before`,
          type,
          name,
          start: clippedStart,
          end: beforeLunchEnd,
          color
        });
      }

      // Segment after lunch
      const afterLunchStart = clippedStart > lunchEnd ? clippedStart : lunchEnd;
      if (afterLunchStart < clippedEnd) {
        items.push({
          id: `${id}-after`,
          type,
          name,
          start: afterLunchStart,
          end: clippedEnd,
          color
        });
      }
    };

    filteredActivities.forEach(a => processItem(a.id, 'activity', a.activityName, a.startTime, a.endTime, '#3b82f6'));
    filteredProjects.forEach(p => processItem(p.id, 'project', `Projeto: ${p.ns || p.projectCode || 'S/N'}`, p.startTime, p.endTime, '#10b981'));

    return items.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [filteredActivities, filteredProjects, selectedDate, viewMode, settings]);

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

  const chartData = useMemo(() => {
    if (viewMode === 'day') return [];

    const data: Record<string, number> = {};
    
    if (viewMode === 'month') {
      const daysInMonth = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= daysInMonth; i++) {
        data[i.toString().padStart(2, '0')] = 0;
      }
      
      timelineItems.forEach(item => {
        const day = format(item.start, 'dd');
        const duration = differenceInSeconds(item.end, item.start) / 3600;
        data[day] = (data[day] || 0) + duration;
      });
    } else {
      for (let i = 0; i < 12; i++) {
        const monthName = format(new Date(selectedDate.getFullYear(), i, 1), 'MMM', { locale: dateLocale });
        data[monthName] = 0;
      }
      
      timelineItems.forEach(item => {
        const monthName = format(item.start, 'MMM', { locale: dateLocale });
        const duration = differenceInSeconds(item.end, item.start) / 3600;
        data[monthName] = (data[monthName] || 0) + duration;
      });
    }

    return Object.entries(data).map(([name, hours]) => ({
      name,
      hours: parseFloat(hours.toFixed(2))
    }));
  }, [timelineItems, viewMode, selectedDate, dateLocale]);

  const totalMinutes = useMemo(() => {
    return stats.reduce((acc, curr) => acc + curr.value, 0);
  }, [stats]);

  const totalHours = (totalMinutes / 60).toFixed(1);

  const COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];

  const updateTimeInISO = (isoString: string, timeStr: string) => {
    try {
      const date = parseISO(isoString);
      const [hours, minutes] = timeStr.split(':').map(Number);
      if (isNaN(hours) || isNaN(minutes)) return isoString;
      
      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);
      return newDate.toISOString();
    } catch (e) {
      return isoString;
    }
  };

  const handleStartActivity = async (typeId: string) => {
    if (typeId.startsWith('temp-')) {
      const msg = t('errorSeedingActivityTypes');
      addToast(msg === 'errorSeedingActivityTypes' ? 'ERRO: Banco de dados não configurado. Vá em "Gestão de Equipe" e rode a correção SQL.' : msg, 'error');
      return;
    }

    const type = activityTypes.find(t => t.id === typeId);
    if (!type) return;

    const newActivity: OperationalActivity = {
      id: crypto.randomUUID(),
      userId: currentUser.id,
      activityTypeId: typeId,
      activityName: type.name,
      startTime: new Date().toISOString(),
      durationSeconds: 0,
      isFlagged: false,
      notes: '',
      projectId: undefined
    };

    try {
      setIsSaving(true);
      await onAddActivity(newActivity);
      addToast(t('saved') || 'Gravado com sucesso!', 'success');
    } catch (error) {
      // Error is already handled in App.tsx toast
    } finally {
      setIsSaving(false);
    }
  };

  const handleStopActivity = async (activity: OperationalActivity) => {
    const endTime = new Date().toISOString();
    const durationSeconds = differenceInSeconds(parseISO(endTime), parseISO(activity.startTime));
    
    try {
      setIsSaving(true);
      await onUpdateActivity({
        ...activity,
        endTime,
        durationSeconds
      });
      addToast(t('saved') || 'Gravado com sucesso!', 'success');
    } catch (error) {
      // Error handled in App.tsx
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveActivity = async () => {
    if ((!isEditingGap && !isEditingActivity) || !selectedActivityType) return;

    if (selectedActivityType.startsWith('temp-')) {
      const msg = t('errorSeedingActivityTypes');
      addToast(msg === 'errorSeedingActivityTypes' ? 'ERRO: Banco de dados não configurado. Vá em "Gestão de Equipe" e rode a correção SQL.' : msg, 'error');
      return;
    }

    const type = activityTypes.find(t => t.id === selectedActivityType);
    if (!type) return;

    // Validate times
    if (!editStartTime || !editEndTime) {
      addToast(t('errorRequiredFields') || 'Preencha todos os campos.', 'error');
      return;
    }

    setIsSaving(true);
    if (isEditingActivity) {
      // Update existing
      const newStartTime = updateTimeInISO(isEditingActivity.startTime, editStartTime);
      const newEndTime = updateTimeInISO(isEditingActivity.endTime, editEndTime);
      const durationSeconds = differenceInSeconds(parseISO(newEndTime), parseISO(newStartTime));

      if (durationSeconds <= 0) {
        addToast(t('errorInvalidDuration') || 'A hora de término deve ser após a hora de início.', 'error');
        setIsSaving(false);
        return;
      }

      try {
        await onUpdateActivity({
          ...isEditingActivity,
          activityTypeId: type.id,
          activityName: type.name,
          startTime: newStartTime,
          endTime: newEndTime,
          durationSeconds,
          notes: gapNotes,
          isFlagged: gapIsFlagged
        });
        setIsEditingActivity(null);
        setSelectedActivityType('');
        setGapNotes('');
        setGapIsFlagged(false);
        addToast(t('saved') || 'Gravado com sucesso!', 'success');
      } catch (error) {
        // Error handled in App.tsx
      } finally {
        setIsSaving(false);
      }
    } else if (isEditingGap) {
      // Create new from gap
      const newStartTime = updateTimeInISO(isEditingGap.start, editStartTime);
      const newEndTime = updateTimeInISO(isEditingGap.end, editEndTime);
      const durationSeconds = differenceInSeconds(parseISO(newEndTime), parseISO(newStartTime));

      if (durationSeconds <= 0) {
        addToast(t('errorInvalidDuration') || 'A hora de término deve ser após a hora de início.', 'error');
        setIsSaving(false);
        return;
      }

      const newActivity: OperationalActivity = {
        id: crypto.randomUUID(),
        userId: currentUser.id,
        activityTypeId: type.id,
        activityName: type.name,
        startTime: newStartTime,
        endTime: newEndTime,
        durationSeconds,
        notes: gapNotes,
        isFlagged: gapIsFlagged
      };

      try {
        await onAddActivity(newActivity);
        setIsEditingGap(null);
        setSelectedActivityType('');
        setGapNotes('');
        setGapIsFlagged(false);
        addToast(t('saved') || 'Gravado com sucesso!', 'success');
      } catch (error) {
        // Error handled in App.tsx
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleDeleteActivity = async (id: string) => {
    try {
      setIsSaving(true);
      await onDeleteActivity(id);
      setIsEditingActivity(null);
      setIsConfirmingDelete(false);
      setSelectedActivityType('');
      setGapNotes('');
      setGapIsFlagged(false);
      addToast(t('activityDeletedSuccess') || 'Atividade excluída com sucesso.', 'success');
    } catch (error) {
      // Error handled in App.tsx
    } finally {
      setIsSaving(false);
    }
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

  const toggleFlag = async (activity: OperationalActivity) => {
    if (!canEditCurrent) return;
    await onUpdateActivity({
      ...activity,
      isFlagged: !activity.isFlagged
    });
  };

  return (
    <div className="space-y-6">
      {/* Header & Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            {t('operationalPerformance')}
          </h2>
          <p className={`uppercase ${theme === 'dark' ? 'text-slate-200 font-medium' : 'text-gray-500'}`}>
            {t('operationalPerformanceDesc')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onRefresh && onRefresh()}
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
                  <option key={u.id} value={u.id}>{u.name} ({t(u.role.toLowerCase() as any)})</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

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
            <span className="hidden sm:inline">{t('tracker').toUpperCase()}</span>
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
            <span className="hidden sm:inline">{t('dashboard').toUpperCase()}</span>
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
              <span className="hidden sm:inline">{t('management').toUpperCase()}</span>
            </button>
          )}
        </div>

      {/* View Mode & Date Selector - Common for all tabs */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex p-1 bg-gray-100 dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 w-full sm:w-auto">
          <button
            onClick={() => setViewMode('day')}
            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'day'
                ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('daily')}
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'month'
                ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('monthly')}
          </button>
          <button
            onClick={() => setViewMode('year')}
            className={`flex-1 sm:flex-none px-4 py-2 text-xs font-bold rounded-lg transition-all ${
              viewMode === 'year'
                ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('yearly')}
          </button>
        </div>

        <div className="flex items-center justify-between bg-gray-50 dark:bg-slate-900 p-1 rounded-xl border border-gray-200 dark:border-slate-700 w-full sm:w-auto min-w-[240px]">
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
            className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-gray-500"
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
                <span className={`font-bold uppercase tracking-wider text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
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
                <span className={`font-bold uppercase tracking-wider text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                  {format(selectedDate, 'MMMM yyyy', { locale: dateLocale })}
                </span>
              </>
            ) : (
              <span className={`font-bold uppercase tracking-wider text-sm ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
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
            className="p-2 hover:bg-white dark:hover:bg-slate-800 rounded-lg transition-all text-gray-500"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Database Warning Banner */}
      {isUsingTempActivities && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-xl flex items-start animate-in slide-in-from-top duration-300">
          <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">
              Banco de Dados não Configurado
            </h4>
            <p className="text-xs text-red-700 dark:text-red-400">
              As tabelas de desempenho operacional não foram encontradas no banco de dados. 
              Peça ao GESTOR para ir em <strong>Gestão de Equipe</strong> e rodar o <strong>Script de Correção SQL</strong>.
            </p>
          </div>
        </div>
      )}

      {activeTab === 'tracker' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tracker Controls */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className={`text-lg font-bold mb-4 flex items-center gap-2 uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                <Activity className="text-blue-500" size={20} />
                {t('currentActivity')}
              </h3>
              
                <CurrentActivityTracker 
                  currentActivity={currentActivity}
                  activityTypes={activityTypes}
                  onStartActivity={handleStartActivity}
                  onStopActivity={handleStopActivity}
                  canEditCurrent={canEditCurrent}
                  theme={theme}
                  t={t}
                />
              </div>
            </div>

          {/* Timeline & Gaps */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className={`text-lg font-bold mb-6 flex items-center gap-2 uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
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

                    <div className={`p-4 rounded-xl border transition-all relative group/item ${
                      item.isGap
                        ? canEditCurrent 
                          ? 'bg-amber-50/50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-900/20 border-dashed hover:border-amber-300 cursor-pointer'
                          : 'bg-gray-50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-800 border-dashed opacity-60'
                        : canEditCurrent && item.type === 'activity'
                          ? 'bg-gray-50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-800 hover:border-blue-300 cursor-pointer'
                          : 'bg-gray-50 dark:bg-slate-900/50 border-gray-100 dark:border-slate-800'
                    }`}
                    onClick={() => {
                      if (!canEditCurrent) return;
                      
                      if (item.isGap) {
                        setIsEditingGap({ 
                          start: item.start.toISOString(), 
                          end: item.end.toISOString() 
                        });
                        setSelectedActivityType('');
                        setGapNotes('');
                        setGapIsFlagged(false);
                      } else if (item.type === 'activity') {
                        const activity = activities.find(a => a.id === item.id);
                        if (activity) {
                          setIsEditingActivity(activity);
                          setSelectedActivityType(activity.activityTypeId);
                          setGapNotes(activity.notes || '');
                          setGapIsFlagged(activity.isFlagged || false);
                        }
                      }
                    }}
                    >
                      {/* Direct Delete Button for activities */}
                      {!item.isGap && item.type === 'activity' && canEditCurrent && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(t('confirmDeletion') || 'TEM CERTEZA QUE DESEJA EXCLUIR?')) {
                              handleDeleteActivity(item.id);
                            }
                          }}
                          className="absolute -right-2 -top-2 p-1.5 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full opacity-0 group-hover/item:opacity-100 transition-all hover:scale-110 shadow-sm z-20"
                          title={t('delete')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}

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
              <p className="text-sm text-gray-500 dark:text-slate-300 mb-1 uppercase">{t('activitiesCount') || 'ATIVIDADES'}</p>
              <p className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {filteredActivities.length}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <p className="text-sm text-gray-500 dark:text-slate-300 mb-1 uppercase">{t('projectsCount') || 'PROJETOS'}</p>
              <p className={`text-3xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {filteredProjects.length}
              </p>
            </div>
          </div>

          {viewMode !== 'day' && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
              <h3 className={`text-lg font-bold mb-6 uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {t('productivityByPeriod') || 'Produtividade por Período'}
              </h3>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }}
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12 }}
                      unit="h"
                    />
                    <Tooltip 
                      cursor={{ fill: theme === 'dark' ? '#1e293b' : '#f8fafc' }}
                      contentStyle={{ 
                        backgroundColor: theme === 'dark' ? '#1e293b' : '#fff',
                        borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                        color: theme === 'dark' ? '#fff' : '#000',
                        borderRadius: '12px',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Bar dataKey="hours" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={viewMode === 'month' ? 15 : 40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-slate-700">
            <h3 className={`text-lg font-bold mb-6 uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
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
            <h3 className={`text-lg font-bold mb-6 uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
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
            <h3 className={`text-lg font-bold uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
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
      {isSaving && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[2px]">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border border-gray-200 dark:border-slate-700 animate-in zoom-in duration-200">
            <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            <p className="font-bold text-gray-800 dark:text-white uppercase tracking-wider">
              {t('saving') || 'Gravando...'}
            </p>
          </div>
        </div>
      )}

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

      {(isEditingGap || isEditingActivity) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl border border-gray-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className={`text-xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
                {isEditingActivity ? t('editActivity') : t('fillGap')}
              </h3>
              {isEditingActivity && (
                <div className="flex items-center gap-2">
                  {isConfirmingDelete ? (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                      <button
                        onClick={() => handleDeleteActivity(isEditingActivity.id)}
                        className="text-[10px] font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 py-1 rounded border border-red-200 dark:border-red-900/30 uppercase"
                      >
                        {t('confirm')}
                      </button>
                      <button
                        onClick={() => setIsConfirmingDelete(false)}
                        className="text-[10px] font-bold text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 px-2 py-1 rounded border border-gray-200 dark:border-slate-700 uppercase"
                      >
                        {t('cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsConfirmingDelete(true)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                      title={t('delete')}
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{t('startTime')}</label>
                  <input
                    type="time"
                    value={editStartTime}
                    onChange={(e) => setEditStartTime(e.target.value)}
                    className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">{t('endTime')}</label>
                  <input
                    type="time"
                    value={editEndTime}
                    onChange={(e) => setEditEndTime(e.target.value)}
                    className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-gray-400 uppercase">{t('activityType')}</label>
                  <button 
                    onClick={() => setIsAddingType(true)}
                    className="text-[10px] font-bold text-blue-500 hover:text-blue-600 uppercase flex items-center gap-1"
                  >
                    <Plus size={10} />
                    {t('addType')}
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
                onClick={() => {
                  setIsEditingGap(null);
                  setIsEditingActivity(null);
                  setIsConfirmingDelete(false);
                  setSelectedActivityType('');
                  setGapNotes('');
                  setGapIsFlagged(false);
                }}
                className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleSaveActivity}
                disabled={!selectedActivityType}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20"
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

const CurrentActivityTracker: React.FC<{
  currentActivity: OperationalActivity | undefined;
  activityTypes: ActivityType[];
  onStartActivity: (typeId: string) => Promise<void>;
  onStopActivity: (activity: OperationalActivity) => Promise<void>;
  canEditCurrent: boolean;
  theme: 'light' | 'dark';
  t: any;
}> = ({ currentActivity, activityTypes, onStartActivity, onStopActivity, canEditCurrent, theme, t }) => {
  const [selectedType, setSelectedType] = useState('');

  useEffect(() => {
    if (!selectedType && activityTypes.length > 0) {
      const firstActive = activityTypes.find(t => t.isActive !== false);
      if (firstActive) setSelectedType(firstActive.id);
    }
  }, [activityTypes, selectedType]);

  if (currentActivity) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
              {t('ongoing') || 'EM ANDAMENTO'}
            </span>
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-mono font-bold">
              <Clock size={14} className="animate-pulse" />
              <Timer startTime={currentActivity.startTime} />
            </div>
          </div>
          <h4 className={`text-lg font-bold uppercase ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            {currentActivity.activityName}
          </h4>
          {currentActivity.notes && (
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic uppercase">
              "{currentActivity.notes}"
            </p>
          )}
        </div>
        
        {canEditCurrent && (
          <button
            onClick={() => onStopActivity(currentActivity)}
            className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all shadow-lg shadow-red-600/20 flex items-center justify-center gap-2 group uppercase"
          >
            <Square size={20} className="group-hover:scale-110 transition-transform" />
            {t('stopActivity') || 'PARAR ATIVIDADE'}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-xs font-bold text-gray-400 uppercase ml-1">
          {t('selectActivityType') || 'Selecione o tipo'}
        </label>
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="w-full p-3 bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-gray-800 dark:text-white font-medium"
        >
          {activityTypes.filter(t => t.isActive !== false).map(type => (
            <option key={type.id} value={type.id}>{type.name}</option>
          ))}
        </select>
      </div>

      {canEditCurrent && (
        <button
          onClick={() => onStartActivity(selectedType)}
          disabled={!selectedType}
          className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 flex items-center justify-center gap-2 group uppercase"
        >
          <Play size={20} className="group-hover:scale-110 transition-transform" />
          {t('startActivity') || 'INICIAR ATIVIDADE'}
        </button>
      )}
      
      {!canEditCurrent && (
        <div className="py-8 text-center border-2 border-dashed border-gray-100 dark:border-slate-800 rounded-2xl">
          <Clock size={32} className="mx-auto text-gray-200 mb-2" />
          <p className="text-xs text-gray-400 uppercase font-bold tracking-widest">
            {t('viewingOnly') || 'APENAS VISUALIZAÇÃO'}
          </p>
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
