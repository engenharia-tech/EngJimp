/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, PenTool, Menu, X, History, Users, LogOut, Lightbulb, Shield, Activity, Eye, UserCog, Moon, Sun, PauseCircle, FileText, Search, Cpu, LayoutList, TrendingUp } from 'lucide-react';
import { EngJimpTracker } from './components/EngJimpTracker';
import { NexusChat } from './nexus/NexusChat';
import { Dashboard } from './components/Dashboard';
import { ProjectHistory } from './components/ProjectHistory';
import { UserManagement } from './components/UserManagement';
import { InnovationManager } from './components/InnovationManager';
import { InterruptionManager } from './components/InterruptionManager';
import { InterruptionDashboard } from './components/InterruptionDashboard';
import { Reports } from './components/Reports';
import { SEOManager } from './components/SEOManager';
import { UserProfileModal } from './components/UserProfileModal';
import { Settings } from './components/Settings';
import { OperationalPerformance } from './components/OperationalPerformance';
import { AuditHistory } from './components/AuditHistory';
import { EngineeringPerformance } from './components/EngineeringPerformance';
import { Login } from './components/Login';
import { 
  supabase,
  fetchAppState, 
  addProject, 
  updateProject, 
  deleteProject,
  addInnovation, 
  updateInnovationStatus,
  updateInnovation,
  deleteInnovation,
  addInterruption,
  updateInterruption,
  updateSettings,
  addOperationalActivity,
  updateOperationalActivity,
  deleteOperationalActivity,
  addActivityType,
  updateActivityType,
  deleteActivityType,
  addProjectRequest,
  updateProjectRequest,
  deleteProjectRequest,
  seedFebruaryData,
  addAuditLog
} from './services/storageService';
import { AppState, ProjectSession, IssueRecord, User, InnovationRecord, InterruptionStatus, InterruptionRecord, AppSettings } from './types';
// Logo está em public/logo.svg — referenciado como URL estática, sem import de módulo
const logoImg = '/logo.svg';

const COMPANY_LOGO_URL = logoImg;

import { Logo } from './components/Logo';
import { ProjectNexus } from './components/ProjectNexus/ProjectNexus';
import { ToastProvider, useToast } from './components/Toast';
import { useLanguage } from './i18n/LanguageContext';
import { Language } from './i18n/translations';

interface NavItemProps {
  id: any;
  labelKey: any;
  icon: any;
  activeTab: string;
  theme: string;
  t: any;
  isCollapsed?: boolean;
  onClick: (id: any) => void;
}

const NavItem: React.FC<NavItemProps> = ({ id, labelKey, icon: Icon, activeTab, theme, t, isCollapsed, onClick }) => (
  <button
    onClick={() => onClick(id)}
    title={isCollapsed ? t(labelKey) : undefined}
    className={`flex items-center w-full ${isCollapsed ? 'justify-center px-0' : 'px-6'} py-4 text-left transition-all border-l-4 ${
      activeTab === id 
        ? theme === 'dark' 
          ? 'bg-blue-900/20 border-orange-500 text-blue-400 font-medium' 
          : 'bg-blue-50 border-orange-500 text-blue-600 font-medium'
        : theme === 'dark'
          ? 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    <Icon className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'} ${activeTab === id ? 'text-blue-400' : theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`} />
    {!isCollapsed && <span className="truncate">{t(labelKey).toUpperCase()}</span>}
  </button>
);

const LanguageSwitcher = ({ 
  language, 
  setLanguage, 
  isMobile = false 
}: { 
  language: Language, 
  setLanguage: (lang: Language) => void, 
  isMobile?: boolean 
}) => (
  <div className={`flex items-center gap-1 ${isMobile ? 'px-4 py-2' : ''}`}>
    <button 
      onClick={() => setLanguage('pt-BR')}
      className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${language === 'pt-BR' ? 'bg-blue-600 shadow-md ring-2 ring-blue-400' : 'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
      title="Português (Brasil)"
    >
      <img 
        src="https://flagcdn.com/w40/br.png" 
        alt="Português (Brasil)" 
        className="w-6 h-4 object-cover rounded-sm"
        referrerPolicy="no-referrer"
      />
    </button>
    <button 
      onClick={() => setLanguage('es-ES')}
      className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${language === 'es-ES' ? 'bg-blue-600 shadow-md ring-2 ring-blue-400' : 'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
      title="Español (España)"
    >
      <img 
        src="https://flagcdn.com/w40/es.png" 
        alt="Español (España)" 
        className="w-6 h-4 object-cover rounded-sm"
        referrerPolicy="no-referrer"
      />
    </button>
    <button 
      onClick={() => setLanguage('en-US')}
      className={`p-1.5 rounded-lg transition-all flex items-center justify-center ${language === 'en-US' ? 'bg-blue-600 shadow-md ring-2 ring-blue-400' : 'bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700'}`}
      title="English (US)"
    >
      <img 
        src="https://flagcdn.com/w40/us.png" 
        alt="English (US)" 
        className="w-6 h-4 object-cover rounded-sm"
        referrerPolicy="no-referrer"
      />
    </button>
  </div>
);

const App: React.FC = () => {
  return <AppContent />;
};

const AppContent: React.FC = () => {
  const { addToast } = useToast();
  const { language, setLanguage, t } = useLanguage();
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // App State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracker' | 'history' | 'team' | 'innovations' | 'interruptions' | 'reports' | 'settings' | 'seo' | 'operational' | 'nexus' | 'gantt' | 'audit' | 'engineering_performance'>('dashboard');
  const [data, setData] = useState<AppState>({ 
    projects: [], 
    issues: [], 
    innovations: [],
    interruptions: [],
    interruptionTypes: [],
    users: [],
    settings: { 
      hourlyCost: 150,
      emailTo: '',
      interruptionEmailTo: '',
      interruptionEmailTemplate: '',
      companyName: 'JIMP NEXUS',
      language: 'pt-BR',
      workdayStart: '07:30',
      workdayEnd: '17:30',
      lunchStart: '12:00',
      lunchEnd: '13:00',
      workdays: [1, 2, 3, 4, 5]
    },
    seoData: { keywords: [], metrics: [], tasks: [] },
    activityTypes: [],
    operationalActivities: [],
    projectRequests: [],
    ganttTasks: []
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    return localStorage.getItem('sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    localStorage.setItem('theme', theme);
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }
  }, [theme]);

  // Load data when user logs in or mounts
  useEffect(() => {
    const load = async () => {
      // If we already have a user, we definitely need to load data
      // If we don't have a user, we still load data (like settings/users) but we shouldn't block the login screen forever
      setIsLoading(true);

      try {
        // Add a timeout to prevent hanging forever (30 seconds)
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout loading app state")), 120000)
        );

        const initializationPromise = (async () => {
          // One-time seed for current month data
          const hasSeeded = localStorage.getItem('eng_jimp_seeded_current_v1');
          if (!hasSeeded) {
            console.log("Seeding initial current month data...");
            try {
              await seedFebruaryData();
              localStorage.setItem('eng_jimp_seeded_current_v1', 'true');
            } catch (e) {
              console.error("Seed error", e);
            }
          }

          const appData = await fetchAppState();
          setData(appData);
        })();

        await Promise.race([initializationPromise, timeoutPromise]);
      } catch (error) {
        console.error("Failed to load app state", error);
        addToast(t('errorLoadingData'), "error");
      } finally {
        setIsLoading(false);
      }
    };
    load();

    // Setup Real-time Subscriptions
    const projectSub = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'projects' },
        async () => {
          console.log('[Realtime] Projects changed, fetching latest...');
          const appData = await fetchAppState();
          setData(appData);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'project_requests' },
        async () => {
          console.log('[Realtime] Project Requests changed, fetching latest...');
          const appData = await fetchAppState();
          setData(appData);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interruptions' },
        async () => {
          console.log('[Realtime] Interruptions changed, fetching latest...');
          const appData = await fetchAppState();
          setData(appData);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        async () => {
          console.log('[Realtime] Users changed, fetching latest...');
          const appData = await fetchAppState();
          setData(appData);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'gantt_tasks' },
        async () => {
          console.log('[Realtime] Gantt Tasks changed, fetching latest...');
          const appData = await fetchAppState();
          setData(appData);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(projectSub);
    };
  }, [currentUser, t, addToast]); 

  // Automatic Alerts for Open Interruptions (Module 10)
  useEffect(() => {
    if (!currentUser || data.interruptions.length === 0) return;

    const checkAlerts = () => {
      const now = new Date().getTime();
      const openInterruptions = data.interruptions.filter(i => i.status === InterruptionStatus.OPEN);
      
      let redCount = 0;
      let yellowCount = 0;

      openInterruptions.forEach(i => {
        const hours = (now - new Date(i.startTime).getTime()) / (1000 * 3600);
        if (hours >= 48) redCount++;
        else if (hours >= 24) yellowCount++;
      });

      if (redCount > 0) {
        addToast(t('criticalAlert', { count: redCount }), 'error');
      } else if (yellowCount > 0) {
        addToast(t('warningAlert', { count: yellowCount }), 'info');
      }
    };

    // Check once on load and then every hour
    checkAlerts();
    const interval = setInterval(checkAlerts, 3600000);
    return () => clearInterval(interval);
  }, [data.interruptions, currentUser, addToast]);

  // Auto-redirect based on role logic
  useEffect(() => {
      if (currentUser) {
          // GESTOR, CEO, PROJETISTA, COORDENADOR default to dashboard
          setActiveTab('dashboard');
      }
  }, [currentUser]);

  // --- PERMISSIONS LOGIC ---
  
  // Who can see ALL project history?
  const canSeeAllHistory = useMemo(() => {
      if (!currentUser) return false;
      return ['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser.role);
  }, [currentUser]);

  const canUseTracker = useMemo(() => {
      if (!currentUser) return false;
      // CEO cannot use tracker
      return ['PROJETISTA', 'GESTOR', 'COORDENADOR'].includes(currentUser.role);
  }, [currentUser]);

  // Who can manage Innovations? (CEO, Manager, Designer, Coordinator, Processos)
  const canSeeInnovations = useMemo(() => {
      if (!currentUser) return false;
      return ['GESTOR', 'CEO', 'PROJETISTA', 'COORDENADOR', 'PROCESSOS'].includes(currentUser.role);
  }, [currentUser]);

  const canSeeEngineeringPerformance = useMemo(() => {
    if (!currentUser) return false;
    return ['GESTOR', 'COORDENADOR', 'CEO', 'PROCESSOS'].includes(currentUser.role);
  }, [currentUser]);

  const canSeeAudit = useMemo(() => {
    if (!currentUser) return false;
    return ['GESTOR', 'COORDENADOR'].includes(currentUser.role);
  }, [currentUser]);
  
  // Who can see Dashboard? (Everyone)
  // Who can see Team? (Manager, Coordinator)

  // Filter Data based on User Role
  const displayData = useMemo(() => {
    if (!currentUser) return data;

    const role = currentUser.role;

    // "Super Viewers" - See everything in DB
    if (['GESTOR', 'CEO', 'COORDENADOR', 'PROCESSOS', 'PROJETISTA'].includes(role)) {
      return data;
    }

    // Default return for any other roles (none currently)
    return data;
  }, [data, currentUser]);

  // --- HANDLERS ---

  const calculatedHourlyRate = useMemo(() => {
    const relevantUsers = data.users.filter(u => u.role !== 'CEO' && u.role !== 'PROCESSOS' && (u.salary || 0) > 0);
    const totalSalary = relevantUsers.reduce((acc, u) => acc + (u.salary || 0), 0);
    const numUsers = relevantUsers.length || 1;
    return (totalSalary / numUsers) / 220;
  }, [data.users]);

  const effectiveSettings = useMemo(() => ({
    ...data.settings,
    hourlyCost: data.settings.useAutomaticCost ? calculatedHourlyRate : data.settings.hourlyCost
  }), [data.settings, calculatedHourlyRate]);

  const handleProjectCreate = async (project: ProjectSession): Promise<AppState | undefined> => {
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROJETISTA'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast(t('noPermissionCreate'), 'error');
      return;
    }
    const projectWithUser = { ...project, userId: currentUser?.id };
    setData(prev => ({
      ...prev,
      projects: [projectWithUser, ...prev.projects]
    }));
    try {
      const updatedData = await addProject(projectWithUser);
      setData(updatedData);
      addToast(t('projectCreatedSuccess'), 'success');
      
      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'CREATE',
          entityType: 'PROJECT',
          entityId: project.id,
          entityName: project.ns || project.name,
          details: `Projeto ${project.ns} criado por ${currentUser?.name}`
      });

      return updatedData;
    } catch (e: any) {
      console.error("Project creation failed:", e);
      if (e.message?.includes('violates not-null constraint') || e.message?.includes('project_code')) {
          addToast(t('errorProjectCodeRequired'), 'error');
      } else if (e.message?.includes('violates check constraint') || e.message?.includes('role')) {
          addToast(t('errorRolePermission'), 'error');
      } else {
          addToast(t('errorCreatingProject', { error: e.message || 'Verifique o console' }), 'error');
      }
    }
  };

  const handleRefresh = async () => {
    try {
      setIsLoading(true);
      const updatedData = await fetchAppState();
      setData(updatedData);
      addToast(t('dataRefreshedSuccess'), 'success');
    } catch (error) {
      addToast(t('errorLoadingData'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProjectUpdate = async (project: ProjectSession, isHeartbeat = false) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROJETISTA'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      if (!isHeartbeat) addToast(t('noPermissionEdit'), 'error');
      return;
    }
    
    // Update local state immediately for responsiveness
    setData(prev => ({
        ...prev,
        projects: prev.projects.map(p => p.id === project.id ? project : p)
    }));
    
    try {
        if (isHeartbeat) {
          console.log(`[App] Heartbeat update for NS: ${project.ns}`);
        }
        const updatedData = await updateProject(project, isHeartbeat);
        if (updatedData) {
          setData(updatedData);
        }
        
        if (!isHeartbeat) {
          if (project.status === 'COMPLETED') {
               addToast(t('projectCompletedSuccess'), 'success');
          } else {
               addToast(t('projectUpdatedSuccess'), 'success');
          }

          // Audit Log
          addAuditLog({
              userId: currentUser?.id,
              userName: currentUser?.name,
              action: 'UPDATE',
              entityType: 'PROJECT',
              entityId: project.id,
              entityName: project.ns,
              details: `Projeto NS ${project.ns} atualizado por ${currentUser?.name}. Status: ${project.status}`
          });
        }
    } catch (e) {
        console.error(`Erro ao atualizar projeto ${project.ns} (isHeartbeat=${isHeartbeat}):`, e);
        if (!isHeartbeat) {
          const detail = (e as any)?.message || (e as any)?.details || JSON.stringify(e);
          addToast(`${t('errorUpdatingProject')} (${detail})`, 'error');
          throw e; // RE-THROW so sub-components can handle failure
        }
    }
  };

  const handleProjectDelete = async (id: string) => {
    console.log("handleProjectDelete called for id:", id);
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROJETISTA'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast(t('onlyManagerDelete'), 'error');
      return;
    }
    setDeleteConfirmationId(id);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationId) return;
    const id = deleteConfirmationId;
    setDeleteConfirmationId(null);
    
    console.log("User confirmed deletion via modal. Proceeding...");
    setIsLoading(true);
    try {
      const projectToDelete = data.projects.find(p => p.id === id);
      const updatedData = await deleteProject(id, projectToDelete?.ns);
      
      // Audit Log
      if (projectToDelete) {
          addAuditLog({
              userId: currentUser?.id,
              userName: currentUser?.name,
              action: 'DELETE',
              entityType: 'PROJECT',
              entityId: projectToDelete.id,
              entityName: projectToDelete.ns || projectToDelete.name,
              details: `Projeto ${projectToDelete.ns} excluído por ${currentUser?.name}`
          });
      }

      // Optimistic update if fetchAppState is slow
      setData(prev => ({
          ...prev,
          projects: prev.projects.filter(p => p.id !== id)
      }));
      
      // Then update with real data
      setData(updatedData);
      addToast(t('projectDeletedSuccess'), 'success');
    } catch (e: any) {
      console.error("Project deletion failed:", e);
      addToast(t('errorDeletingProject', { error: e.message || 'Verifique o console' }), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInnovationAdd = async (innovation: InnovationRecord) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROCESSOS'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast(t('noPermissionAddInnovation'), 'error');
      return;
    }
    setIsLoading(true);
    // Optimistic Update
    setData(prev => ({
      ...prev,
      innovations: [innovation, ...prev.innovations]
    }));

    try {
      const updatedData = await addInnovation(innovation);
      setData(updatedData);
      addToast(t('innovationRegisteredSuccess'), 'success');

      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'CREATE',
          entityType: 'INNOVATION',
          entityId: innovation.id,
          entityName: innovation.title,
          details: `Inovação "${innovation.title}" criada por ${currentUser?.name}`
      });
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes('violates check constraint') || e.message?.includes('innovations_type_check')) {
          addToast(t('errorInnovationTypeNotAccepted'), 'error');
      } else {
          addToast(t('errorSavingInnovation'), 'error');
      }
      const revertedData = await fetchAppState();
      setData(revertedData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInnovationStatusChange = async (id: string, status: string) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROCESSOS'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast(t('noPermissionChangeInnovationStatus'), 'error');
      return;
    }
    setIsLoading(true);
    try {
        const updatedData = await updateInnovationStatus(id, status);
        setData(updatedData);
        addToast(t('innovationStatusUpdated'), 'success');

        // Audit Log
        const innovation = data.innovations.find(i => i.id === id);
        addAuditLog({
            userId: currentUser?.id,
            userName: currentUser?.name,
            action: 'UPDATE',
            entityType: 'INNOVATION',
            entityId: id,
            entityName: innovation?.title || 'Innovation',
            details: `Status da inovação "${innovation?.title || id}" alterado para ${status} por ${currentUser?.name}`
        });
    } catch(e) {
        addToast(t('errorUpdatingStatus'), 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const handleInnovationUpdate = async (innovation: InnovationRecord) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROCESSOS'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast(t('noPermissionEditInnovation'), 'error');
      return;
    }
    setIsLoading(true);
    try {
        const updatedData = await updateInnovation(innovation);
        setData(updatedData);
        addToast(t('innovationUpdatedSuccess'), 'success');

        // Audit Log
        addAuditLog({
            userId: currentUser?.id,
            userName: currentUser?.name,
            action: 'UPDATE',
            entityType: 'INNOVATION',
            entityId: innovation.id,
            entityName: innovation.title,
            details: `Inovação "${innovation.title}" editada por ${currentUser?.name}`
        });
    } catch (e: any) {
        console.error(e);
        if (e.message?.includes('violates check constraint') || e.message?.includes('innovations_type_check')) {
            addToast(t('errorInnovationTypeNotAccepted'), 'error');
        } else {
            addToast(t('errorSavingInnovation'), 'error');
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleInnovationDelete = async (id: string) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast(t('noPermissionDeleteInnovation'), 'error');
      return;
    }
    
    // Confirmation is now handled by the UI component (InnovationManager)
    const innovationToDelete = data.innovations.find(i => i.id === id);
    setIsLoading(true);
    try {
      // Optimistic update
      setData(prev => ({
          ...prev,
          innovations: prev.innovations.filter(i => i.id !== id)
      }));

      const updatedData = await deleteInnovation(id);
      setData(updatedData);
      addToast(t('innovationDeletedSuccess'), 'success');

      // Audit Log
      if (innovationToDelete) {
          addAuditLog({
              userId: currentUser?.id,
              userName: currentUser?.name,
              action: 'DELETE',
              entityType: 'INNOVATION',
              entityId: innovationToDelete.id,
              entityName: innovationToDelete.title,
              details: `Inovação "${innovationToDelete.title}" excluída por ${currentUser?.name}`
          });
      }
    } catch (e: any) {
      console.error("Failed to delete innovation:", e);
      addToast(t('errorDeletingInnovation', { error: e.message }), 'error');
      // Revert on error
      const revertedData = await fetchAppState();
      setData(revertedData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInterruptionUpdate = (newState: AppState) => {
    setData(newState);
  };

  const onAddInterruption = async (interruption: InterruptionRecord) => {
    try {
      const updatedData = await addInterruption(interruption);
      setData(updatedData);

      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'CREATE',
          entityType: 'INTERRUPTION',
          entityId: interruption.id,
          entityName: interruption.projectNs || interruption.problemType,
          details: `Interrupção no projeto ${interruption.projectNs} registrada por ${currentUser?.name}`
      });
    } catch (e) {
      addToast(t('errorRegisteringInterruption'), 'error');
    }
  };

  const onUpdateInterruption = async (interruption: InterruptionRecord, isHeartbeat = false) => {
    // Update locally first
    setData(prev => ({
      ...prev,
      interruptions: (prev.interruptions || []).map(i => i.id === interruption.id ? interruption : i)
    }));

    try {
      const updatedData = await updateInterruption(interruption, isHeartbeat);
      if (updatedData) {
        setData(updatedData);
      }
    } catch (e) {
      console.error("Erro ao atualizar interrupção:", e);
      if (!isHeartbeat) {
        addToast(t('errorUpdatingInterruption'), 'error');
      }
    }
  };

  const handleLogout = () => {
    if (currentUser) {
        addAuditLog({
            userId: currentUser.id,
            userName: currentUser.name,
            action: 'LOGOUT',
            entityType: 'USER',
            entityId: currentUser.id,
            entityName: currentUser.username,
            details: `Usuário ${currentUser.username} (P: ${currentUser.name}) fez logout.`
        });
    }
    setCurrentUser(null);
    // Reset to tracker but effective login will handle redirection
    setActiveTab('tracker');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    addToast(t(newTheme === 'dark' ? 'darkModeActivated' : 'lightModeActivated'), 'info');
  };

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    try {
      const updatedData = await updateSettings(newSettings);
      setData(updatedData);
      addToast(t('settingsSavedSuccess'), 'success');

      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'UPDATE',
          entityType: 'SETTINGS',
          entityId: 'global_settings',
          entityName: 'Configurações',
          details: `Configurações globais do sistema atualizadas por ${currentUser?.name}`
      });
    } catch (error) {
      addToast(t('errorSavingSettings'), 'error');
    }
  };

  const onAddOperationalActivity = async (activity: any) => {
    try {
      const updatedData = await addOperationalActivity(activity);
      setData(updatedData);
      addToast(t('activityRegisteredSuccess'), 'success');

      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'CREATE',
          entityType: 'OPERATIONAL_ACTIVITY',
          entityId: activity.id,
          entityName: activity.activityName,
          details: `Atividade operacional "${activity.activityName}" iniciada por ${currentUser?.name}`
      });
    } catch (e: any) {
      console.error("Failed to add activity:", e);
      addToast(t('errorRegisteringActivity'), 'error');
      throw e;
    }
  };

  const onUpdateOperationalActivity = async (activity: any) => {
    try {
      const updatedData = await updateOperationalActivity(activity);
      setData(updatedData);
      addToast(t('activityUpdatedSuccess'), 'success');
    } catch (e: any) {
      console.error("Failed to update activity:", e);
      addToast(t('errorUpdatingActivity'), 'error');
      throw e;
    }
  };

  const onDeleteOperationalActivity = async (id: string) => {
    try {
      const activityToDelete = data.operationalActivities.find(a => a.id === id);
      const updatedData = await deleteOperationalActivity(id);
      setData(updatedData);
      addToast(t('activityDeletedSuccess'), 'success');

      // Audit Log
      if (activityToDelete) {
          addAuditLog({
              userId: currentUser?.id,
              userName: currentUser?.name,
              action: 'DELETE',
              entityType: 'OPERATIONAL_ACTIVITY',
              entityId: id,
              entityName: activityToDelete.activityName,
              details: `Atividade operacional "${activityToDelete.activityName}" excluída por ${currentUser?.name}`
          });
      }
    } catch (e: any) {
      console.error("Failed to delete activity:", e);
      addToast(t('errorDeletingActivity', { error: e.message || '' }), 'error');
      throw e;
    }
  };

  const onAddActivityType = async (type: any) => {
    try {
      const updatedData = await addActivityType(type);
      setData(updatedData);
      addToast(t('typeRegistered' as any) || 'Tipo registrado!', 'success');

      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'CREATE',
          entityType: 'ACTIVITY_TYPE',
          entityId: type.id,
          entityName: type.name,
          details: `Novo tipo de atividade "${type.name}" criado por ${currentUser?.name}`
      });
    } catch (e) {
      addToast(t('errorRegisteringType' as any) || 'Erro ao registrar tipo', 'error');
    }
  };

  const onUpdateActivityType = async (type: any) => {
    try {
      const updatedData = await updateActivityType(type);
      setData(updatedData);
      addToast(t('typeUpdated' as any) || 'Tipo atualizado!', 'success');

      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'UPDATE',
          entityType: 'ACTIVITY_TYPE',
          entityId: type.id,
          entityName: type.name,
          details: `Tipo de atividade "${type.name}" atualizado por ${currentUser?.name}`
      });
    } catch (e) {
      addToast(t('errorUpdatingType' as any) || 'Erro ao atualizar tipo', 'error');
    }
  };

  const onDeleteActivityType = async (id: string) => {
    try {
      const typeToDelete = data.activityTypes.find(t => t.id === id);
      const updatedData = await deleteActivityType(id);
      setData(updatedData);
      addToast(t('typeDeleted' as any) || 'Tipo excluído!', 'success');

      // Audit Log
      if (typeToDelete) {
          addAuditLog({
              userId: currentUser?.id,
              userName: currentUser?.name,
              action: 'DELETE',
              entityType: 'ACTIVITY_TYPE',
              entityId: id,
              entityName: typeToDelete.name,
              details: `Tipo de atividade "${typeToDelete.name}" excluído por ${currentUser?.name}`
          });
      }
    } catch (e) {
      addToast(t('errorDeletingType' as any) || 'Erro ao excluir tipo', 'error');
    }
  };

  const onAddProjectRequest = async (request: any) => {
    try {
      const updatedData = await addProjectRequest(request);
      setData(updatedData);
      addToast(t('nsRegisteredSuccess'), 'success');

      // Audit Log
      addAuditLog({
          userId: currentUser?.id,
          userName: currentUser?.name,
          action: 'CREATE',
          entityType: 'PROJECT_REQUEST',
          entityId: request.id,
          entityName: request.ns,
          details: `Pedido de NS ${request.ns} criado por ${currentUser?.name}`
      });
    } catch (e: any) {
      console.error("onAddProjectRequest error:", e);
      const detail = e.message || (typeof e === 'string' ? e : "");
      addToast(`${t('errorRegisteringNS')}: ${detail}`, 'error');
      throw e;
    }
  };

  const onUpdateProjectRequest = async (request: any) => {
    try {
      const updatedData = await updateProjectRequest(request);
      if (updatedData) {
        setData(updatedData);
        addToast(t('nsUpdatedSuccess') || 'Pedido atualizado com sucesso!', 'success');
      }
    } catch (e: any) {
      console.error("onUpdateProjectRequest error:", e);
      const detail = e.message || (typeof e === 'string' ? e : "");
      addToast(`${t('errorUpdatingNS')}: ${detail}`, 'error');
      throw e;
    }
  };

  const onDeleteProjectRequest = async (id: string) => {
    try {
      const requestToDelete = data.projectRequests.find(r => r.id === id);
      const updatedData = await deleteProjectRequest(id);
      setData(updatedData);
      addToast(t('nsDeletedSuccess'), 'success');

      // Audit Log
      if (requestToDelete) {
          addAuditLog({
              userId: currentUser?.id,
              userName: currentUser?.name,
              action: 'DELETE',
              entityType: 'PROJECT_REQUEST',
              entityId: id,
              entityName: requestToDelete.ns,
              details: `Pedido de NS ${requestToDelete.ns} excluído por ${currentUser?.name}`
          });
      }
    } catch (e) {
      addToast(t('errorDeletingNS'), 'error');
    }
  };

  const handleNavClick = (id: any) => {
    setActiveTab(id);
    setIsMobileMenuOpen(false);
    if (id === 'gantt' || id === 'nexus') {
      setIsSidebarCollapsed(true);
    }
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    addAuditLog({
        userId: user.id,
        userName: user.name,
        action: 'LOGIN',
        entityType: 'USER',
        entityId: user.id,
        entityName: user.username,
        details: `Usuário ${user.username} (P: ${user.name}) fez login.`
    });
  };

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  const COMPANY_LOGO_URL = data.settings.logoUrl || logoImg;
  const COMPANY_NAME = data.settings.companyName || 'JIMPNexus';

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      {/* Sidebar for Desktop */}
      <aside className={`hidden md:flex flex-col ${isSidebarCollapsed ? 'w-20' : 'w-64'} ${theme === 'dark' ? 'bg-black border-slate-800 text-white' : 'bg-white border-gray-200 text-slate-900'} border-r fixed h-full z-10 shadow-xl transition-all duration-300 ease-in-out`}>
        <div className={`p-4 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
          <div className="mb-4 flex items-center justify-between">
            <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'hidden' : 'flex'}`}>
               <Logo 
                 theme={theme}
                 logoUrl={COMPANY_LOGO_URL}
                 companyName={COMPANY_NAME}
                 className="h-10 w-auto max-w-[180px] object-contain" 
               />
            </div>
            <div className={`flex flex-col gap-2 ${isSidebarCollapsed ? 'w-full items-center' : ''}`}>
              <button 
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-black border border-slate-700 hover:bg-slate-900 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors mb-2`}
                title={isSidebarCollapsed ? t('expandSidebar') : t('collapseSidebar')}
              >
                {isSidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
              </button>
              
              {!isSidebarCollapsed && (
                <button 
                  onClick={toggleTheme}
                  className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-black border border-slate-700 hover:bg-slate-900 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors`}
                  title={theme === 'light' ? t('darkMode') : t('lightMode')}
                >
                  {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {!isSidebarCollapsed && (
            <>
              <div className="mb-6">
                <LanguageSwitcher language={language} setLanguage={setLanguage} />
              </div>
              
              <div className={`flex items-center ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} text-xs mb-1 uppercase tracking-wider font-semibold`}>
                {t('controlPanel')}
              </div>
              <div className="flex items-center justify-between group">
                <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-200' : 'text-gray-700'} truncate`}>{currentUser.name}</p>
                <button 
                    onClick={() => setIsProfileOpen(true)}
                    className={`${theme === 'dark' ? 'text-slate-500 hover:text-white hover:bg-slate-900' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition-colors p-1 rounded`}
                    title={t('myProfile')}
                >
                    <UserCog className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center mt-2 gap-2">
                <span className={`text-[10px] uppercase tracking-wider font-bold ${theme === 'dark' ? 'text-slate-400 bg-black border-slate-700' : 'text-gray-500 bg-gray-100 border-gray-200'} border px-2 py-0.5 rounded-full inline-block`}>
                    {t(currentUser.role.toLowerCase() as any)}
                </span>
              </div>
            </>
          )}
        </div>
        <nav className="flex-1 mt-6 overflow-y-auto custom-scrollbar">
          <NavItem id="dashboard" labelKey="dashboard" icon={LayoutDashboard} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />

          <NavItem id="nexus" labelKey="nexusAssistant" icon={Cpu} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />

          <NavItem id="gantt" labelKey="ganttNexus" icon={LayoutList} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />

          {canUseTracker && (
            <>
              <NavItem id="tracker" labelKey="tracker" icon={PenTool} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
              <NavItem id="history" labelKey="history" icon={History} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
              <NavItem id="interruptions" labelKey="interruptions" icon={PauseCircle} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
              <NavItem id="operational" labelKey="operationalPerformance" icon={Activity} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
            </>
          )}

          {canSeeEngineeringPerformance && (
            <NavItem id="engineering_performance" labelKey="engineeringPerformance" icon={TrendingUp} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
          )}

          {canSeeAudit && (
            <NavItem id="audit" labelKey="auditLog" icon={History} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
          )}
          
          {canSeeInnovations && (
             <NavItem id="innovations" labelKey="innovations" icon={Lightbulb} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
          )}

          {['GESTOR', 'CEO', 'COORDENADOR', 'PROCESSOS'].includes(currentUser.role) && (
            <NavItem id="reports" labelKey="reports" icon={FileText} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
          )}

          {['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
            <NavItem id="team" labelKey="team" icon={Users} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
          )}

          {['GESTOR', 'CEO'].includes(currentUser.role) && (
            <NavItem id="settings" labelKey="settings" icon={UserCog} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
          )}
          
          {['GESTOR', 'CEO'].includes(currentUser.role) && (
            <NavItem id="seo" labelKey="seo" icon={Search} activeTab={activeTab} theme={theme} t={t} isCollapsed={isSidebarCollapsed} onClick={handleNavClick} />
          )}
        </nav>
        <div className={`p-6 border-t ${theme === 'dark' ? 'border-slate-800 bg-black' : 'border-gray-100 bg-gray-50'} ${isSidebarCollapsed ? 'flex justify-center' : ''}`}>
          <button 
            onClick={handleLogout}
            className={`flex items-center text-sm text-red-400 hover:text-red-300 hover:bg-red-50 dark:hover:bg-slate-800/50 p-2 rounded-lg font-medium transition-colors ${isSidebarCollapsed ? 'justify-center w-10' : 'w-full'}`}
            title={isSidebarCollapsed ? t('logout') : undefined}
          >
            <LogOut className={`w-4 h-4 ${isSidebarCollapsed ? '' : 'mr-2'}`} />
            {!isSidebarCollapsed && t('logout')}
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className={`md:hidden fixed top-0 w-full ${theme === 'dark' ? 'bg-black border-slate-800' : 'bg-white border-gray-200'} border-b z-30 flex justify-between items-center px-4 py-3 shadow-md`}>
        <div className="h-8 flex items-center gap-2">
            <Logo 
                theme={theme}
                logoUrl={COMPANY_LOGO_URL}
                companyName={COMPANY_NAME}
                className="h-full w-auto object-contain max-w-[120px]"
            />
        </div>
        <div className="flex items-center gap-2">
            <LanguageSwitcher language={language} setLanguage={setLanguage} />
            <button 
                onClick={toggleTheme}
                className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-black border border-slate-700' : 'bg-gray-100 border border-gray-200'} transition-colors text-gray-600 dark:text-slate-300`}
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
            <button 
                onClick={() => setIsProfileOpen(true)}
                className={`p-2 rounded-lg ${theme === 'dark' ? 'text-slate-400 hover:text-white' : 'text-gray-500 hover:text-gray-900'}`}
            >
                <UserCog className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} 
              className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'} shadow-lg active:scale-95 transition-all`}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-white dark:bg-black z-20 pt-20 md:hidden animate-in slide-in-from-top duration-300">
          <nav className="flex flex-col h-full overflow-y-auto p-4 space-y-1">
            <div className="px-4 py-2 mb-2">
              <p className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-1">{t('controlPanel')}</p>
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{currentUser.name}</p>
            </div>
            <NavItem id="dashboard" labelKey="dashboard" icon={LayoutDashboard} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            
            <NavItem id="nexus" labelKey="nexusAssistant" icon={Cpu} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            <NavItem id="gantt" labelKey="ganttNexus" icon={LayoutDashboard} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            {canUseTracker && (
              <>
                <NavItem id="tracker" labelKey="tracker" icon={PenTool} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
                <NavItem id="history" labelKey="history" icon={History} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
                <NavItem id="interruptions" labelKey="interruptions" icon={PauseCircle} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
                <NavItem id="operational" labelKey="operationalPerformance" icon={Activity} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
              </>
            )}
            {canSeeInnovations && (
                <NavItem id="innovations" labelKey="innovations" icon={Lightbulb} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            )}
            {['GESTOR', 'CEO', 'COORDENADOR', 'PROCESSOS'].includes(currentUser.role) && (
                <NavItem id="reports" labelKey="reports" icon={FileText} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            )}
            {['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
               <NavItem id="team" labelKey="team" icon={Users} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            )}
            {['GESTOR', 'CEO'].includes(currentUser.role) && (
                <NavItem id="settings" labelKey="settings" icon={UserCog} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            )}
            {['GESTOR', 'CEO'].includes(currentUser.role) && (
                <NavItem id="seo" labelKey="seo" icon={Search} activeTab={activeTab} theme={theme} t={t} onClick={handleNavClick} />
            )}
            <div className="mt-auto p-4 border-t border-gray-100 dark:border-slate-800">
              <button 
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-3 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-xl transition-colors font-bold"
              >
                <LogOut className="w-5 h-5 mr-3" />
                {t('logout')}
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className={`flex-1 ${isSidebarCollapsed ? 'md:ml-20' : 'md:ml-64'} p-4 md:p-8 pt-24 md:pt-8 transition-all duration-300 min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-gray-50'}`}>
        {isLoading && (
          <div className="fixed top-0 left-0 w-full h-1 bg-blue-100 z-50">
            <div className="h-full bg-blue-600 animate-pulse w-full"></div>
          </div>
        )}
        <div className="max-w-5xl mx-auto pb-12">
          {/* Tracker Tab */}
          <div className={activeTab === 'tracker' && canUseTracker ? 'block space-y-6' : 'hidden'}>
            <div className="mb-6 flex justify-between items-end">
              <div>
                <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{t('projectArea').toUpperCase()}</h2>
                <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>{t('welcome').toUpperCase()}, <span className="font-semibold text-blue-600">{currentUser.name.toUpperCase()}</span></p>
              </div>
            </div>
            <EngJimpTracker 
              existingProjects={displayData.projects}
              allProjects={data.projects}
              interruptions={displayData.interruptions}
              projectRequests={data.projectRequests}
              settings={effectiveSettings}
              onCreate={handleProjectCreate}
              onUpdate={handleProjectUpdate}
              onAddInterruption={onAddInterruption}
              onUpdateInterruption={onUpdateInterruption}
              onAddProjectRequest={onAddProjectRequest}
              onUpdateProjectRequest={onUpdateProjectRequest}
              onDeleteProjectRequest={onDeleteProjectRequest}
              isVisible={activeTab === 'tracker'}
              onNavigateBack={() => setActiveTab('tracker')}
              currentUser={currentUser}
              users={data.users}
            />
          </div>

          {activeTab === 'history' && canUseTracker && (
            <div className="space-y-6">
              <div className="mb-6">
                <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{t('projectHistory').toUpperCase()}</h2>
                <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>
                  {canSeeAllHistory
                    ? t('globalHistoryDesc')
                    : t('yourHistoryDesc')}
                </p>
              </div>
              <ProjectHistory 
                data={displayData} 
                currentUser={currentUser} 
                onDelete={handleProjectDelete}
                onUpdate={handleProjectUpdate}
              />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
               <div className="mb-6 flex items-center gap-4">
                 <div className="bg-gray-100 dark:bg-black p-2 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
                    <Logo 
                      theme={theme}
                      logoUrl={COMPANY_LOGO_URL}
                      className="h-12 w-auto object-contain" 
                    />
                 </div>
                 <div>
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{t('performancePanel').toUpperCase()}</h2>
                    <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>
                      {canSeeAllHistory ? t('globalIndicators').toUpperCase() : t('yourProductivityIndicators').toUpperCase()}
                    </p>
                 </div>
              </div>
              <Dashboard data={displayData} currentUser={currentUser} theme={theme} settings={effectiveSettings} onRefresh={handleRefresh} />
              {['GESTOR', 'CEO', 'COORDENADOR', 'PROJETISTA'].includes(currentUser.role) && (
                <div className="mt-12">
                  <div className="mb-6">
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{t('interruptionReports').toUpperCase()}</h2>
                    <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>{t('bottleneckAnalysis').toUpperCase()}</p>
                  </div>
                  <InterruptionDashboard data={displayData} theme={theme} />
                </div>
              )}
            </div>
          )}

          {activeTab === 'interruptions' && canUseTracker && (
            <InterruptionManager 
              data={displayData}
              currentUser={currentUser}
              onUpdate={onUpdateInterruption}
              addToast={addToast}
            />
          )}

          {activeTab === 'operational' && canUseTracker && (
            <OperationalPerformance 
              activities={data.operationalActivities}
              activityTypes={data.activityTypes}
              projects={data.projects}
              interruptions={data.interruptions}
              currentUser={currentUser}
              users={data.users}
              theme={theme}
              onAddActivity={onAddOperationalActivity}
              onUpdateActivity={onUpdateOperationalActivity}
              onDeleteActivity={onDeleteOperationalActivity}
              onAddActivityType={onAddActivityType}
              onUpdateActivityType={onUpdateActivityType}
              onDeleteActivityType={onDeleteActivityType}
              onUpdateProject={handleProjectUpdate}
              onUpdateInterruption={onUpdateInterruption}
              settings={data.settings}
              onUpdateSettings={handleUpdateSettings}
              onRefresh={handleRefresh}
            />
          )}

          {activeTab === 'audit' && canSeeAudit && (
            <AuditHistory 
              logs={data.auditLogs} 
              theme={theme} 
            />
          )}

          {activeTab === 'engineering_performance' && canSeeEngineeringPerformance && currentUser && (
            <EngineeringPerformance 
                projects={data.projects}
                activities={data.operationalActivities}
                interruptions={data.interruptions}
                users={data.users}
                settings={data.settings}
                theme={theme}
                t={t}
                currentUser={currentUser}
            />
          )}

          {activeTab === 'innovations' && canSeeInnovations && (
             <InnovationManager 
                innovations={displayData.innovations} 
                onAdd={handleInnovationAdd}
                onUpdate={handleInnovationUpdate}
                onStatusChange={handleInnovationStatusChange}
                onDelete={handleInnovationDelete}
                currentUser={currentUser}
                settings={effectiveSettings}
             />
          )}

          {activeTab === 'nexus' && (
            <NexusChat appState={data} currentUser={currentUser} theme={theme} />
          )}

          {activeTab === 'gantt' && (
            <ProjectNexus 
              state={data} 
              onUpdateState={(newData) => setData(newData)} 
              onRefresh={handleRefresh} 
              onOpenSettings={() => setActiveTab('settings')}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'reports' && ['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
            <Reports 
              data={displayData} 
              currentUser={currentUser} 
              theme={theme} 
              settings={effectiveSettings}
            />
          )}

          {activeTab === 'settings' && (['GESTOR', 'CEO'].includes(currentUser.role) || currentUser.email === 'efariaseng0@gmail.com' || currentUser.username === 'edson') && (
            <Settings 
              settings={effectiveSettings}
              users={data.users}
              onUpdate={handleUpdateSettings}
              currentUser={currentUser}
            />
          )}

          {activeTab === 'seo' && (['GESTOR', 'CEO'].includes(currentUser.role) || currentUser.email === 'efariaseng0@gmail.com' || currentUser.username === 'edson') && (
            <SEOManager 
              data={data.seoData}
              currentUser={currentUser}
              theme={theme}
            />
          )}

          {activeTab === 'team' && (['GESTOR', 'COORDENADOR'].includes(currentUser.role) || currentUser.email === 'efariaseng0@gmail.com' || currentUser.username === 'edson') && (
             <div className="space-y-6">
                <div className="mb-6">
                  <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>{t('team').toUpperCase()}</h2>
                  <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>{t('teamManagementDesc').toUpperCase()}</p>
                </div>
                <UserManagement currentUser={currentUser} onUsersChange={handleRefresh} />
             </div>
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirmationId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md p-6 border dark:border-slate-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{t('confirmDeletion').toUpperCase()}</h3>
                    <p className="text-gray-600 dark:text-slate-400 mb-6">
                        {t('confirmDeletionDesc').toUpperCase()}
                    </p>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setDeleteConfirmationId(null)}
                            className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-black hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
                        >
                            {t('cancel').toUpperCase()}
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors shadow-sm"
                        >
                            {t('yesDelete').toUpperCase()}
                        </button>
                    </div>
                </div>
            </div>
          )}

          {/* User Profile Modal */}
          {isProfileOpen && currentUser && (
            <UserProfileModal 
                user={currentUser} 
                onClose={() => setIsProfileOpen(false)} 
                onUpdateUser={(updated) => setCurrentUser(updated)} 
            />
          )}

          {/* Footer */}
          <footer className={`mt-12 pt-8 border-t ${theme === 'dark' ? 'border-slate-800' : 'border-gray-200'} text-center`}>
            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`}>
              {t('developedBy').toUpperCase()} <span className="font-bold tracking-tight"><span className="text-orange-500">JIMP</span><span className="text-blue-600">NEXUS</span></span>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default App;
