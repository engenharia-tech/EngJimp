/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { LayoutDashboard, PenTool, Menu, X, History, Users, LogOut, Lightbulb, Shield, Activity, Eye, UserCog } from 'lucide-react';
import { EngJimpTracker } from './components/EngJimpTracker';
import { Dashboard } from './components/Dashboard';
import { ProjectHistory } from './components/ProjectHistory';
import { UserManagement } from './components/UserManagement';
import { InnovationManager } from './components/InnovationManager';
import { UserProfileModal } from './components/UserProfileModal';
import { Login } from './components/Login';
import { 
  fetchAppState, 
  addProject, 
  updateProject, 
  deleteProject,
  addInnovation, 
  updateInnovationStatus,
  deleteInnovation,
  seedFebruaryData
} from './services/storageService';
import { AppState, ProjectSession, IssueRecord, User, InnovationRecord } from './types';
import logoImg from './assets/logo.svg'; 

const COMPANY_LOGO_URL = logoImg;

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'tracker' | 'history' | 'team' | 'innovations'>('dashboard');
  const [data, setData] = useState<AppState>({ projects: [], issues: [], innovations: [] });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<string | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

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
    if (!currentUser) return { projects: [], issues: [], innovations: [] };

    const role = currentUser.role;

    // "Super Viewers" - See everything in DB
    if (['GESTOR', 'CEO', 'COORDENADOR'].includes(role)) {
      return data;
    }

    // PROJETISTA - Sees own data + All Innovations (usually shared knowledge)
    return {
      projects: data.projects.filter(p => p.userId === currentUser.id),
      issues: data.issues.filter(i => i.reportedBy === currentUser.id),
      innovations: data.innovations
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
        addToast('Erro ao atualizar projeto.', 'error');
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
    if (currentUser?.role !== 'GESTOR') {
      addToast('Apenas o GESTOR pode adicionar inovações.', 'error');
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
    } catch (e) {
      console.error(e);
      addToast('Erro ao salvar inovação.', 'error');
      const revertedData = await fetchAppState();
      setData(revertedData);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInnovationStatusChange = async (id: string, status: string) => {
    if (currentUser?.role !== 'GESTOR') {
      addToast('Apenas o GESTOR pode alterar status de inovações.', 'error');
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

  const handleInnovationDelete = async (id: string) => {
    if (currentUser?.role !== 'GESTOR') {
      addToast('Apenas o GESTOR pode excluir inovações.', 'error');
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

  const handleLogout = () => {
    setCurrentUser(null);
    // Reset to tracker but effective login will handle redirection
    setActiveTab('tracker');
  };

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} />;
  }

  const NavItem = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => {
        setActiveTab(id);
        setIsMobileMenuOpen(false);
      }}
      className={`flex items-center w-full px-6 py-4 text-left transition-colors border-l-4 ${
        activeTab === id 
          ? 'bg-blue-900/20 border-orange-500 text-blue-400 font-medium' 
          : 'border-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
      }`}
    >
      <Icon className={`w-5 h-5 mr-3 ${activeTab === id ? 'text-blue-400' : 'text-slate-500'}`} />
      {label}
    </button>
  );

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 fixed h-full z-10 text-white shadow-xl">
        <div className="p-6 border-b border-slate-800">
          <div className="mb-6 flex items-center gap-3">
             <img 
               src={COMPANY_LOGO_URL}
               alt="Logo" 
               className="h-10 w-auto max-w-[50px] object-contain" 
             />
             <div className="flex flex-col">
                <span className="text-2xl font-bold text-white leading-none tracking-tight">
                  Eng <span className="text-blue-500">Jimp</span>
                </span>
             </div>
          </div>
          
          <div className="flex items-center text-slate-500 text-xs mb-1 uppercase tracking-wider font-semibold">
            Painel de Controle
          </div>
          <div className="flex items-center justify-between group">
            <p className="text-sm font-medium text-slate-200 truncate">{currentUser.name}</p>
            <button 
                onClick={() => setIsProfileOpen(true)}
                className="text-slate-500 hover:text-white transition-colors p-1 rounded hover:bg-slate-800"
                title="Meu Perfil"
            >
                <UserCog className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center mt-2 gap-2">
            <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded-full inline-block">
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
          
          {canSeeInnovations && (
             <NavItem id="innovations" label="Inovações & Custos" icon={Lightbulb} />
          )}
          
          {['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
            <NavItem id="team" label="Gestão de Equipe" icon={Users} />
          )}
        </nav>
        <div className="p-6 border-t border-slate-800 bg-slate-900">
          <button 
            onClick={handleLogout}
            className="flex items-center text-sm text-red-400 hover:text-red-300 hover:bg-slate-800/50 p-2 rounded-lg font-medium transition-colors w-full"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair da Conta
          </button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 w-full bg-slate-900 border-b border-slate-800 z-20 flex justify-between items-center p-4 shadow-md">
        <div className="h-8 flex items-center gap-2">
            <img 
                src={COMPANY_LOGO_URL} 
                alt="Logo" 
                className="h-full w-auto object-contain"
            />
            <span className="text-lg font-bold text-white">
                Eng <span className="text-blue-500">Jimp</span>
            </span>
        </div>
        <div className="flex items-center gap-3">
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
        <div className="fixed inset-0 bg-slate-900 z-10 pt-20 md:hidden animate-in slide-in-from-right duration-200">
          <nav className="flex flex-col h-full overflow-y-auto">
            <NavItem id="dashboard" label="Painel & Gráficos" icon={LayoutDashboard} />
            {canUseTracker && (
                <NavItem id="tracker" label="Projetar" icon={PenTool} />
            )}
            {canUseTracker && (
                <NavItem id="history" label="Histórico" icon={History} />
            )}
            {canSeeInnovations && (
                <NavItem id="innovations" label="Inovações & Custos" icon={Lightbulb} />
            )}
            {['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
               <NavItem id="team" label="Gestão de Equipe" icon={Users} />
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
      <main className="flex-1 md:ml-64 p-6 pt-24 md:pt-6 transition-all bg-gray-50 min-h-screen">
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
                <h2 className="text-2xl font-bold text-gray-800">Área de Projeto</h2>
                <p className="text-gray-500">Bem-vindo, <span className="font-semibold text-blue-600">{currentUser.name}</span></p>
              </div>
            </div>
            <EngJimpTracker 
              existingProjects={displayData.projects}
              onCreate={handleProjectCreate}
              onUpdate={handleProjectUpdate}
              isVisible={activeTab === 'tracker'}
              onNavigateBack={() => setActiveTab('tracker')}
              currentUser={currentUser}
            />
          </div>

          {activeTab === 'history' && canUseTracker && (
            <div className="space-y-6">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-800">Histórico de Liberações</h2>
                <p className="text-gray-500">
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
                 <div className="bg-slate-900 p-2 rounded-xl shadow-sm border border-slate-800">
                    <img 
                      src={COMPANY_LOGO_URL}
                      alt="Logo" 
                      className="h-12 w-auto object-contain" 
                    />
                 </div>
                 <div>
                    <h2 className="text-2xl font-bold text-gray-800">Painel de Desempenho</h2>
                    <p className="text-gray-500">
                      {canSeeAllHistory ? "Indicadores globais da equipe." : "Seus indicadores de produtividade."}
                    </p>
                 </div>
              </div>
              <Dashboard data={displayData} currentUser={currentUser} />
            </div>
          )}

          {activeTab === 'innovations' && canSeeInnovations && (
             <InnovationManager 
                innovations={displayData.innovations} 
                onAdd={handleInnovationAdd}
                onStatusChange={handleInnovationStatusChange}
                onDelete={handleInnovationDelete}
                currentUser={currentUser}
             />
          )}

          {activeTab === 'team' && ['GESTOR', 'COORDENADOR'].includes(currentUser.role) && (
             <div className="space-y-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-800">Gestão de Equipe</h2>
                  <p className="text-gray-500">Adicione novos membros e gerencie permissões de acesso.</p>
                </div>
                <UserManagement currentUser={currentUser} />
             </div>
          )}

          {/* Delete Confirmation Modal */}
          {deleteConfirmationId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmar Exclusão</h3>
                    <p className="text-gray-600 mb-6">
                        Tem certeza que deseja excluir este projeto? Esta ação não pode ser desfeita e removerá todos os registros associados.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setDeleteConfirmationId(null)}
                            className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
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
          <footer className="mt-12 pt-8 border-t border-gray-200 text-center">
            <p className="text-sm font-medium text-gray-400">
              Desenvolvido por <span className="text-orange-500 font-bold tracking-tight">JIMP<span className="text-cyan-500">NEXUS</span></span>
            </p>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default App;
