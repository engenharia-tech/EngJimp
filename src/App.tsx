/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, PenTool, Menu, X, History, Users, LogOut, Lightbulb, Shield, Activity, Eye, UserCog, Moon, Sun, PauseCircle, FileText } from 'lucide-react';
import { EngJimpTracker } from './components/EngJimpTracker';
import { Dashboard } from './components/Dashboard';
import { ProjectHistory } from './components/ProjectHistory';
import { UserManagement } from './components/UserManagement';
import { InnovationManager } from './components/InnovationManager';
import { InterruptionManager } from './components/InterruptionManager';
import { InterruptionDashboard } from './components/InterruptionDashboard';
import { Reports } from './components/Reports';
import { UserProfileModal } from './components/UserProfileModal';
import { Settings } from './components/Settings';
import { Login } from './components/Login';
import { 
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
  seedFebruaryData
} from './services/storageService';
import { AppState, ProjectSession, IssueRecord, User, InnovationRecord, InterruptionStatus, InterruptionRecord, AppSettings } from './types';
import logoImg from './assets/logo.svg';

const COMPANY_LOGO_URL = logoImg;

import { Logo } from './components/Logo';
import { ToastProvider, useToast } from './components/Toast';

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

const AppContent: React.FC = () => {
  const { addToast } = useToast();
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // App State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracker' | 'history' | 'team' | 'innovations' | 'interruptions' | 'reports' | 'settings'>('dashboard');
  const [data, setData] = useState<AppState>({ 
    projects: [], 
    issues: [], 
    innovations: [],
    interruptions: [],
    interruptionTypes: [],
    users: [],
    settings: { hourlyCost: 150 }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
      setIsLoading(true);

      // One-time seed for February data
      const hasSeeded = localStorage.getItem('eng_jimp_seeded_feb_v7');
      if (!hasSeeded) {
        await seedFebruaryData();
        localStorage.setItem('eng_jimp_seeded_feb_v7', 'true');
      }

      const appData = await fetchAppState();
      setData(appData);
      setIsLoading(false);
    };
    load();
  }, [currentUser]); 

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
        addToast(`ALERTA CRÍTICO: Existem ${redCount} interrupções abertas há mais de 48h!`, 'error');
      } else if (yellowCount > 0) {
        addToast(`Aviso: Existem ${yellowCount} interrupções abertas há mais de 24h.`, 'info');
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
      return ['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role);
  }, [currentUser]);

  const canUseTracker = useMemo(() => {
      if (!currentUser) return false;
      // CEO cannot use tracker
      return ['PROJETISTA', 'GESTOR', 'COORDENADOR'].includes(currentUser.role);
  }, [currentUser]);

  // Who can manage Innovations? (CEO, Manager, Designer, Coordinator)
  const canSeeInnovations = useMemo(() => {
      if (!currentUser) return false;
      return ['GESTOR', 'CEO', 'PROJETISTA', 'COORDENADOR'].includes(currentUser.role);
  }, [currentUser]);
  
  // Who can see Dashboard? (Everyone)
  // Who can see Team? (Manager, Coordinator)

  // Filter Data based on User Role
  const displayData = useMemo(() => {
    if (!currentUser) return { projects: [], issues: [], innovations: [], interruptions: [], interruptionTypes: [] };

    const role = currentUser.role;

    // "Super Viewers" - See everything in DB
    if (['GESTOR', 'CEO', 'COORDENADOR'].includes(role)) {
      return data;
    }

    // PROJETISTA - Sees own data + All Innovations (usually shared knowledge)
    return {
      projects: data.projects.filter(p => p.userId === currentUser.id),
      issues: data.issues.filter(i => i.reportedBy === currentUser.id),
      innovations: data.innovations,
      interruptions: data.interruptions.filter(i => i.designerId === currentUser.id),
      interruptionTypes: data.interruptionTypes,
      users: data.users,
      settings: data.settings
    };
  }, [data, currentUser]);

  // --- HANDLERS ---

  const handleProjectCreate = async (project: ProjectSession) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROJETISTA'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast('Você não tem permissão para criar projetos.', 'error');
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
      addToast('Projeto criado com sucesso!', 'success');
    } catch (e: any) {
      console.error("Project creation failed:", e);
      if (e.message?.includes('violates not-null constraint') || e.message?.includes('project_code')) {
          addToast('ERRO: O campo "Código do Projeto" é obrigatório no banco de dados. Vá em "Gestão de Equipe" e rode a correção.', 'error');
      } else if (e.message?.includes('violates check constraint') || e.message?.includes('role')) {
          addToast('ERRO: Seu cargo não tem permissão. Vá em "Gestão de Equipe" e rode a correção.', 'error');
      } else {
          addToast(`Erro ao criar projeto: ${e.message || 'Verifique o console'}`, 'error');
      }
    }
  };

  const handleProjectUpdate = async (project: ProjectSession) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR', 'PROJETISTA'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast('Você não tem permissão para editar projetos.', 'error');
      return;
    }
    setData(prev => ({
        ...prev,
        projects: prev.projects.map(p => p.id === project.id ? project : p)
    }));
    try {
        const updatedData = await updateProject(project);
        setData(updatedData);
        if (project.status === 'COMPLETED') {
             addToast('Projeto concluído com sucesso!', 'success');
        } else {
             addToast('Projeto atualizado com sucesso!', 'success');
        }
    } catch (e) {
        console.error("Erro ao atualizar projeto:", e);
        addToast('Erro ao atualizar projeto no banco de dados.', 'error');
    }
  };

  const handleProjectDelete = async (id: string) => {
    console.log("handleProjectDelete called for id:", id);
    if (currentUser?.role !== 'GESTOR') {
      addToast('Apenas o GESTOR pode excluir projetos.', 'error');
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
      
      // Optimistic update if fetchAppState is slow
      setData(prev => ({
          ...prev,
          projects: prev.projects.filter(p => p.id !== id)
      }));
      
      // Then update with real data
      setData(updatedData);
      addToast('Projeto excluído com sucesso!', 'success');
    } catch (e: any) {
      console.error("Project deletion failed:", e);
      addToast(`Erro ao apagar projeto: ${e.message || 'Verifique o console'}`, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleInnovationAdd = async (innovation: InnovationRecord) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast('Você não tem permissão para adicionar inovações.', 'error');
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
      addToast('Inovação registrada com sucesso!', 'success');
    } catch (e: any) {
      console.error(e);
      if (e.message?.includes('violates check constraint') || e.message?.includes('innovations_type_check')) {
          addToast('ERRO: O banco de dados não aceita este tipo de inovação. Vá em "Gestão de Equipe" e rode a correção SQL.', 'error');
      } else {
          addToast('Erro ao salvar inovação.', 'error');
      }
      const revertedData = await fetchAppState();
      setData(revertedData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInnovationStatusChange = async (id: string, status: string) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast('Você não tem permissão para alterar status de inovações.', 'error');
      return;
    }
    setIsLoading(true);
    try {
        const updatedData = await updateInnovationStatus(id, status);
        setData(updatedData);
        addToast('Status da inovação atualizado.', 'success');
    } catch(e) {
        addToast('Erro ao atualizar status.', 'error');
    } finally {
        setIsLoading(false);
    }
  };

  const handleInnovationUpdate = async (innovation: InnovationRecord) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast('Você não tem permissão para editar inovações.', 'error');
      return;
    }
    setIsLoading(true);
    try {
        const updatedData = await updateInnovation(innovation);
        setData(updatedData);
        addToast('Inovação atualizada com sucesso!', 'success');
    } catch (e: any) {
        console.error(e);
        if (e.message?.includes('violates check constraint') || e.message?.includes('innovations_type_check')) {
            addToast('ERRO: O banco de dados não aceita este tipo de inovação. Vá em "Gestão de Equipe" e rode a correção SQL.', 'error');
        } else {
            addToast('Erro ao atualizar inovação.', 'error');
        }
    } finally {
        setIsLoading(false);
    }
  };

  const handleInnovationDelete = async (id: string) => {
    const allowedRoles = ['GESTOR', 'COORDENADOR'];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      addToast('Você não tem permissão para excluir inovações.', 'error');
      return;
    }
    
    // Confirmation is now handled by the UI component (InnovationManager)
    setIsLoading(true);
    try {
      // Optimistic update
      setData(prev => ({
          ...prev,
          innovations: prev.innovations.filter(i => i.id !== id)
      }));

      const updatedData = await deleteInnovation(id);
      setData(updatedData);
      addToast('Inovação excluída com sucesso.', 'success');
    } catch (e: any) {
      console.error("Failed to delete innovation:", e);
      addToast(`Erro ao excluir inovação: ${e.message}`, 'error');
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
    } catch (e) {
      addToast('Erro ao registrar interrupção.', 'error');
    }
  };

  const onUpdateInterruption = async (interruption: InterruptionRecord) => {
    try {
      const updatedData = await updateInterruption(interruption);
      setData(updatedData);
    } catch (e) {
      addToast('Erro ao atualizar interrupção.', 'error');
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    // Reset to tracker but effective login will handle redirection
    setActiveTab('tracker');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    addToast(`Modo ${newTheme === 'dark' ? 'Escuro' : 'Claro'} ativado`, 'info');
  };

  const handleUpdateSettings = async (newSettings: AppSettings) => {
    try {
      const updatedData = await updateSettings(newSettings);
      setData(updatedData);
      addToast('Configurações salvas com sucesso!', 'success');
    } catch (error) {
      addToast('Erro ao salvar configurações.', 'error');
    }
  };

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  const COMPANY_LOGO_URL = data.settings.logoUrl || logoImg;
  const COMPANY_NAME = data.settings.companyName || 'Eng Jimp';

  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        setIsMobileMenuOpen(false);
      }}
      className={`flex items-center w-full px-6 py-4 text-left transition-colors border-l-4 ${
        activeTab === id 
          ? theme === 'dark' 
            ? 'bg-blue-900/20 border-orange-500 text-blue-400 font-medium' 
            : 'bg-blue-50 border-orange-500 text-blue-600 font-medium'
          : theme === 'dark'
            ? 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-900'
      }`}
    >
      <Icon className={`w-5 h-5 mr-3 ${activeTab === id ? 'text-blue-400' : theme === 'dark' ? 'text-slate-500' : 'text-gray-400'}`} />
      {label}
    </button>
  );

  return (
    <div className={`flex min-h-screen ${theme === 'dark' ? 'bg-black text-slate-200' : 'bg-gray-50 text-gray-900'}`}>
      {/* Sidebar for Desktop */}
      <aside className={`hidden md:flex flex-col w-64 ${theme === 'dark' ? 'bg-black border-slate-800 text-white' : 'bg-white border-gray-200 text-slate-900'} border-r fixed h-full z-10 shadow-xl`}>
        <div className={`p-6 border-b ${theme === 'dark' ? 'border-slate-800' : 'border-gray-100'}`}>
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
               <Logo 
                 theme={theme}
                 logoUrl={COMPANY_LOGO_URL}
                 companyName={COMPANY_NAME}
                 className="h-10 w-auto max-w-[180px] object-contain" 
               />
            </div>
            <button 
              onClick={toggleTheme}
              className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-black border border-slate-700 hover:bg-slate-900 text-slate-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'} transition-colors`}
              title={theme === 'light' ? 'Modo Escuro' : 'Modo Claro'}
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </div>
          
          <div className={`flex items-center ${theme === 'dark' ? 'text-slate-500' : 'text-gray-400'} text-xs mb-1 uppercase tracking-wider font-semibold`}>
            Painel de Controle
          </div>
          <div className="flex items-center justify-between group">
            <p className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-200' : 'text-gray-700'} truncate`}>{currentUser.name}</p>
            <button 
                onClick={() => setIsProfileOpen(true)}
                className={`${theme === 'dark' ? 'text-slate-500 hover:text-white hover:bg-slate-900' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'} transition-colors p-1 rounded`}
                title="Meu Perfil"
            >
                <UserCog className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center mt-2 gap-2">
            <span className={`text-[10px] uppercase tracking-wider font-bold ${theme === 'dark' ? 'text-slate-400 bg-black border-slate-700' : 'text-gray-500 bg-gray-100 border-gray-200'} border px-2 py-0.5 rounded-full inline-block`}>
                {currentUser.role}
            </span>
          </div>
        </div>
        <nav className="flex-1 mt-6 overflow-y-auto">
          <NavItem id="dashboard" label="Painel & Gráficos" icon={LayoutDashboard} />

          {canUseTracker && (
             <NavItem id="tracker" label="Projetar" icon={PenTool} />
          )}
          
          {canUseTracker && (
            <NavItem id="history" label="Histórico" icon={History} />
          )}

          {canUseTracker && (
            <NavItem id="interruptions" label="Interrupções" icon={PauseCircle} />
          )}
          
          {canSeeInnovations && (
             <NavItem id="innovations" label="Inovações & Custos" icon={Lightbulb} />
          )}

          {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
            <NavItem id="reports" label="Relatórios" icon={FileText} />
          )}

          {['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
            <NavItem id="team" label="Gestão de Equipe" icon={Users} />
          )}

          {['GESTOR', 'CEO'].includes(currentUser.role) && (
            <NavItem id="settings" label="Configurações" icon={UserCog} />
          )}
        </nav>
        <div className={`p-6 border-t ${theme === 'dark' ? 'border-slate-800 bg-black' : 'border-gray-100 bg-gray-50'}`}>
          <button 
            onClick={handleLogout}
            className="flex items-center text-sm text-red-400 hover:text-red-300 hover:bg-red-50 dark:hover:bg-slate-800/50 p-2 rounded-lg font-medium transition-colors w-full"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair da Conta
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className={`md:hidden fixed top-0 w-full ${theme === 'dark' ? 'bg-black border-slate-800' : 'bg-white border-gray-200'} border-b z-20 flex justify-between items-center p-4 shadow-md`}>
        <div className="h-8 flex items-center gap-2">
            <Logo 
                theme={theme}
                logoUrl={COMPANY_LOGO_URL}
                className="h-full w-auto object-contain max-w-[150px]"
            />
        </div>
        <div className="flex items-center gap-3">
            <button 
                onClick={toggleTheme}
                className={`p-2 rounded-lg ${theme === 'dark' ? 'bg-black border border-slate-700' : 'bg-slate-800'} hover:bg-slate-700 transition-colors text-slate-300`}
            >
              {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
            </button>
            <button 
                onClick={() => setIsProfileOpen(true)}
                className="text-slate-300 hover:text-white p-2"
            >
                <UserCog className="w-5 h-5" />
            </button>
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-slate-300 hover:text-white transition-colors">
              {isMobileMenuOpen ? <X /> : <Menu />}
            </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black z-10 pt-20 md:hidden animate-in slide-in-from-right duration-200">
          <nav className="flex flex-col h-full overflow-y-auto">
            <NavItem id="dashboard" label="Painel & Gráficos" icon={LayoutDashboard} />
            {canUseTracker && (
                <NavItem id="tracker" label="Projetar" icon={PenTool} />
            )}
            {canUseTracker && (
                <NavItem id="history" label="Histórico" icon={History} />
            )}
            {canUseTracker && (
                <NavItem id="interruptions" label="Interrupções" icon={PauseCircle} />
            )}
            {canSeeInnovations && (
                <NavItem id="innovations" label="Inovações & Custos" icon={Lightbulb} />
            )}
            {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
                <NavItem id="reports" label="Relatórios" icon={FileText} />
            )}
            {['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
               <NavItem id="team" label="Gestão de Equipe" icon={Users} />
            )}
            {['GESTOR', 'CEO'].includes(currentUser.role) && (
                <NavItem id="settings" label="Configurações" icon={UserCog} />
            )}
            <div className="mt-auto p-6 border-t border-slate-800">
              <button 
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-3 text-left text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
              >
                <LogOut className="w-5 h-5 mr-3" />
                Sair
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main Content */}
      <main className={`flex-1 md:ml-64 p-6 pt-24 md:pt-6 transition-all min-h-screen ${theme === 'dark' ? 'bg-black' : 'bg-gray-50'}`}>
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
                <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Área de Projeto</h2>
                <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>Bem-vindo, <span className="font-semibold text-blue-600">{currentUser.name}</span></p>
              </div>
            </div>
            <EngJimpTracker 
              existingProjects={displayData.projects}
              allProjects={data.projects}
              interruptions={displayData.interruptions}
              settings={data.settings}
              onCreate={handleProjectCreate}
              onUpdate={handleProjectUpdate}
              onAddInterruption={onAddInterruption}
              onUpdateInterruption={onUpdateInterruption}
              isVisible={activeTab === 'tracker'}
              onNavigateBack={() => setActiveTab('tracker')}
              currentUser={currentUser}
            />
          </div>

          {activeTab === 'history' && canUseTracker && (
            <div className="space-y-6">
              <div className="mb-6">
                <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Histórico de Liberações</h2>
                <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>
                  {canSeeAllHistory
                    ? "Visão geral de todas as liberações da equipe." 
                    : "Consulte suas liberações passadas."}
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
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Painel de Desempenho</h2>
                    <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>
                      {canSeeAllHistory ? "Indicadores globais da equipe." : "Seus indicadores de produtividade."}
                    </p>
                 </div>
              </div>
              <Dashboard data={displayData} currentUser={currentUser} theme={theme} />
              {['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
                <div className="mt-12">
                  <div className="mb-6">
                    <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Relatórios de Interrupção</h2>
                    <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>Análise de gargalos e tempo perdido.</p>
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
              onUpdate={handleInterruptionUpdate}
              addToast={addToast}
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
             />
          )}

          {activeTab === 'reports' && ['GESTOR', 'CEO', 'COORDENADOR'].includes(currentUser.role) && (
            <Reports 
              data={displayData} 
              currentUser={currentUser} 
              theme={theme} 
            />
          )}

          {activeTab === 'settings' && ['GESTOR', 'CEO'].includes(currentUser.role) && (
            <Settings 
              settings={data.settings}
              onUpdate={handleUpdateSettings}
            />
          )}

          {activeTab === 'team' && ['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
             <div className="space-y-6">
                <div className="mb-6">
                  <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Gestão de Equipe</h2>
                  <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>Adicione novos membros e gerencie permissões de acesso.</p>
                </div>
                <UserManagement currentUser={currentUser} />
             </div>
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirmationId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md p-6 border dark:border-slate-700">
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Confirmar Exclusão</h3>
                    <p className="text-gray-600 dark:text-slate-400 mb-6">
                        Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita e removerá todos os registros associados.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setDeleteConfirmationId(null)}
                            className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-black hover:bg-gray-200 dark:hover:bg-slate-800 rounded-lg font-medium transition-colors"
                        >
                            Cancelar
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors shadow-sm"
                        >
                            Sim, Excluir
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
              Desenvolvido por <span className="font-bold tracking-tight"><span className="text-orange-500">JIMP</span><span className="text-blue-600">NEXUS</span></span>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default App;
