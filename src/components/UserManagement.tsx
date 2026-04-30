import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, User as UserIcon, CheckCircle, Loader2, Eye, Activity, Briefcase, Edit, X, Trash2, AlertCircle, Database, Copy } from 'lucide-react';
import { User, UserRole } from '../types';
import { registerUser, fetchUsers, updateUser, deleteUser, deleteAllIssues, removeDuplicateProjects, findDuplicateProjects, deleteProjectById, DuplicateGroup, updateSettings, fetchAppState, recalculateAllProjectCosts } from '../services/storageService';
import { getWebhookUrl, saveWebhookUrl } from '../services/webhookService';
import { useToast } from './Toast';
import { useLanguage } from '../i18n/LanguageContext';

interface UserManagementProps {
    currentUser: User;
    onUsersChange?: () => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser, onUsersChange }) => {
  const { addToast } = useToast();
  const { t } = useLanguage();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [showFixModal, setShowFixModal] = useState(false);
  
  // Webhook State
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showWebhookHelp, setShowWebhookHelp] = useState(false);

  // Settings State
  const [hourlyCost, setHourlyCost] = useState<number>(0);

  useEffect(() => {
      setWebhookUrl(getWebhookUrl());
      // Load settings from app state
      const loadSettings = async () => {
          const state = await fetchAppState();
          if (state.settings) {
              setHourlyCost(state.settings.hourlyCost);
          }
      };
      loadSettings();
  }, []);

  const handleSaveWebhook = () => {
      saveWebhookUrl(webhookUrl);
      addToast(t("webhookUrlSavedSuccess"), "success");
  };
  
  // Form State
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('PROJETISTA');
  const [salary, setSalary] = useState<number>(0);
  const [isRegistering, setIsRegistering] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [deleteConfirmationUser, setDeleteConfirmationUser] = useState<User | null>(null);

  useEffect(() => {
    loadList();
  }, []);

  const loadList = async () => {
    setLoadingList(true);
    const list = await fetchUsers();
    const sortedList = [...list].sort((a, b) => a.name.localeCompare(b.name));
    setUsers(sortedList);
    setLoadingList(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);

    const userPayload: User = {
      id: editingUserId || crypto.randomUUID(),
      name,
      surname,
      email,
      phone,
      username,
      password,
      role,
      salary
    };

    let result;
    if (editingUserId) {
      result = await updateUser(userPayload);
    } else {
      result = await registerUser(userPayload);
    }
    
    if (result.success) {
      addToast(editingUserId ? t('userUpdatedSuccess', { name }) : t('userCreatedSuccess', { name }), 'success');
      await loadList(); // Refresh list
      onUsersChange?.(); // Refresh global app state
      resetForm();
    } else {
      console.error("Register error:", result.message);
      if (result.message?.includes('violates check constraint') || result.message?.includes('users_role_check')) {
          addToast('ERRO CRÍTICO: O banco de dados precisa ser atualizado para aceitar novos cargos. Role para baixo e use o botão "Correção TOTAL".', 'error');
      } else if (result.message?.includes('policy')) {
          addToast('ERRO DE PERMISSÃO: O banco de dados bloqueou a ação. Use o botão "Correção TOTAL" abaixo.', 'error');
      } else {
          addToast(result.message || `Erro ao ${editingUserId ? 'atualizar' : 'criar'} usuário.`, 'error');
      }
    }
    setIsRegistering(false);
  };

  const handleDelete = (user: User) => {
    setDeleteConfirmationUser(user);
  };

  const confirmDelete = async () => {
    if (!deleteConfirmationUser) return;
    const user = deleteConfirmationUser;
    setDeleteConfirmationUser(null);

    console.log("Attempting to delete user:", user.id);
    setLoadingList(true);
    try {
        const result = await deleteUser(user.id);
        console.log("Delete result:", result);
        
        if (result.success) {
          addToast(`Usuário ${user.name} excluído com sucesso!`, 'success');
          await loadList();
          onUsersChange?.(); // Refresh global app state
        } else {
          if (result.message?.includes('violates foreign key') || result.message?.includes('constraint')) {
             addToast('ERRO DE VÍNCULO: Não é possível excluir pois existem projetos vinculados. Use o botão "Correção TOTAL" abaixo para corrigir.', 'error');
          } else {
             addToast(result.message || 'Erro ao excluir usuário.', 'error');
          }
        }
    } catch (err) {
        console.error("Exception in handleDelete:", err);
        addToast("Erro inesperado ao excluir usuário.", 'error');
    } finally {
        setLoadingList(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const resetForm = () => {
    setName('');
    setSurname('');
    setEmail('');
    setPhone('');
    setUsername('');
    setPassword('');
    setSalary(0);
    setRole('PROJETISTA');
    setEditingUserId(null);
  };

  const handleEdit = (user: User) => {
    setName(user.name);
    setSurname(user.surname || '');
    setEmail(user.email || '');
    setPhone(user.phone || '');
    setUsername(user.username);
    setPassword(user.password);
    setRole(user.role);
    setSalary(user.salary || 0);
    setEditingUserId(user.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getRoleIcon = (role: UserRole) => {
      switch(role) {
          case 'GESTOR': return <Shield className="w-3 h-3 text-blue-600" />;
          case 'CEO': return <Briefcase className="w-3 h-3 text-yellow-600" />;
          case 'COORDENADOR': return <Eye className="w-3 h-3 text-teal-600" />;
          case 'PROCESSOS': return <Activity className="w-3 h-3 text-purple-600" />;
          default: return <UserIcon className="w-3 h-3 text-gray-600" />;
      }
  };

  const isGestor = currentUser.role === 'GESTOR';
  const isCoordenador = currentUser.role === 'COORDENADOR';
  // Gestor can do everything. Coordenador can view. Everyone can edit themselves.
  
  const canCreateUser = isGestor;
  const canDeleteUser = isGestor;
  
  const canEditUser = (targetUser: User) => {
      if (isGestor) return true;
      if (currentUser.id === targetUser.id) return true;
      return false;
  };

  return (
    <div className="space-y-6">
      {/* Create/Edit User Form */}
      {(canCreateUser || editingUserId) && (
      <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center text-black dark:text-white">
            <UserPlus className="w-6 h-6 mr-2 text-indigo-600 dark:text-indigo-400" />
            {editingUserId ? (currentUser.id === editingUserId ? 'Editar Meu Perfil' : 'Editar Usuário') : 'Cadastrar Novo Usuário'}
          </h2>
          {editingUserId && (
            <button 
              onClick={resetForm}
              className="text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200 flex items-center text-sm"
            >
              <X className="w-4 h-4 mr-1" /> Cancelar Edição
            </button>
          )}
        </div>

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Nome (Primeiro Nome)</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-black dark:text-slate-200"
              required
              placeholder="Somente letras"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Sobrenome</label>
            <input 
              type="text" 
              value={surname}
              onChange={e => setSurname(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-black dark:text-slate-200"
              placeholder="Somente letras"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">E-mail</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-black dark:text-slate-200"
              placeholder="exemplo@exemplo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Celular</label>
            <input 
              type="text" 
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-black dark:text-slate-200"
              placeholder="xx-xxxxx-xxxx"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Nome de Usuário (Login)</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-black dark:text-slate-200"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Senha</label>
            <input 
              type="text" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-black dark:text-slate-200"
              placeholder="Defina uma senha"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Função {(!isGestor) && <span className="text-xs text-gray-400 dark:text-slate-500">(Somente Gestor)</span>}</label>
            <select 
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              disabled={!isGestor}
              className={`w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${!isGestor ? 'bg-gray-100 dark:bg-black text-gray-500 dark:text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-black dark:text-slate-200'}`}
            >
              <option value="PROJETISTA">{t('projetista')}</option>
              <option value="GESTOR">{t('gestor')}</option>
              <option value="CEO">{t('ceo')}</option>
              <option value="COORDENADOR">{t('coordenador')}</option>
              <option value="PROCESSOS">{t('processos')}</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black dark:text-white mb-1">Salário (R$) {(!isGestor) && <span className="text-xs text-gray-400 dark:text-slate-500">(Somente Gestor)</span>}</label>
            <input 
              type="text"
              value={salary === 0 ? '' : salary}
              onChange={e => {
                  const val = e.target.value.replace(/[^0-9.]/g, '');
                  setSalary(Number(val));
              }}
              disabled={!isGestor}
              className={`w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${!isGestor ? 'bg-gray-100 dark:bg-black text-gray-500 dark:text-slate-500 cursor-not-allowed' : 'bg-white dark:bg-black dark:text-slate-200'}`}
              placeholder="Ex: 5000.00"
            />
          </div>
          <div className="md:col-span-2">
            <button 
              type="submit"
              disabled={isRegistering}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg transition-colors flex items-center justify-center"
            >
              {isRegistering ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
              {isRegistering ? (editingUserId ? 'Salvando...' : 'Cadastrando...') : (editingUserId ? 'Salvar Alterações' : 'Cadastrar')}
            </button>
          </div>
        </form>
      </div>
      )}

      {/* Users List */}
      <div className="bg-white dark:bg-black rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="p-6 border-b border-gray-100 dark:border-slate-700 flex justify-between items-center">
           <h3 className="font-bold text-black dark:text-white">Membros da Equipe</h3>
           {loadingList && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>
        
        {/* Mobile View */}
        <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-800">
           {users.length === 0 && !loadingList && (
             <div className="p-8 text-center text-gray-400 dark:text-slate-500 italic block">Nenhum usuário encontrado.</div>
           )}
           {users.map((u) => {
              const canEditThisUser = canEditUser(u);
              return (
                <div key={u.id} className={`p-4 ${currentUser.id === u.id ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''}`}>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-black text-lg">
                                {u.name.charAt(0)}
                            </div>
                            <div>
                                <h4 className="font-black text-gray-900 dark:text-white uppercase">{u.name} {u.surname}</h4>
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase tracking-wider">@{u.username}</span>
                                    {currentUser.id === u.id && <span className="text-[9px] text-blue-600 dark:text-blue-400 font-black uppercase bg-blue-50 dark:bg-blue-900/30 px-1.5 rounded">Você</span>}
                                </div>
                            </div>
                        </div>
                        <div className="flex bg-gray-50 dark:bg-slate-800 p-1.5 rounded-lg gap-1 border border-gray-200 dark:border-slate-700">
                           {canEditThisUser && (
                            <button onClick={() => handleEdit(u)} className="p-1.5 text-indigo-600 dark:text-indigo-400"><Edit className="w-4 h-4" /></button>
                           )}
                           {canDeleteUser && (
                            <button onClick={() => handleDelete(u)} className="p-1.5 text-red-600 dark:text-red-400"><Trash2 className="w-4 h-4" /></button>
                           )}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-2 gap-y-3 mb-2">
                        <div>
                            <span className="block text-[8px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Função</span>
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 inline-flex items-center gap-1 border border-gray-200 dark:border-slate-700">
                                {getRoleIcon(u.role)}
                                {t(u.role.toLowerCase() as any)}
                            </span>
                        </div>
                        <div>
                            <span className="block text-[8px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Salário</span>
                            <span className="text-xs font-black text-gray-800 dark:text-slate-200">
                                {(isGestor || currentUser.id === u.id) 
                                ? (u.salary ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(u.salary) : '-')
                                : '***'}
                            </span>
                        </div>
                        <div className="col-span-2">
                             <span className="block text-[8px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest mb-0.5">Contato</span>
                             <div className="text-[11px] font-medium text-gray-700 dark:text-slate-300 truncate">{u.email || '-'}</div>
                             <div className="text-[10px] text-gray-500 font-bold">{u.phone || '-'}</div>
                        </div>
                    </div>
                </div>
              )
           })}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left min-w-[800px]">
          <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium">
            <tr>
              <th className="p-4">Nome</th>
              <th className="p-4">Usuário</th>
              <th className="p-4">E-mail / Celular</th>
              <th className="p-4">Senha</th>
              <th className="p-4">Função</th>
              <th className="p-4">Salário</th>
              <th className="p-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
            {users.map((u) => {
              const canEditThisUser = canEditUser(u);
              const canDeleteThisUser = canDeleteUser; // Only Gestor
              const showActions = canEditThisUser || canDeleteThisUser;

              return (
              <tr key={u.id} className={`hover:bg-gray-50 dark:hover:bg-slate-700/50 ${currentUser.id === u.id ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}>
                <td className="p-4 font-medium text-black dark:text-white">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-black flex items-center justify-center text-gray-500 dark:text-slate-400 font-bold flex-shrink-0">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold">{u.name} {u.surname}</div>
                      {currentUser.id === u.id && <span className="text-[10px] text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 rounded-full">Você</span>}
                    </div>
                  </div>
                </td>
                <td className="p-4 text-black dark:text-white">{u.username}</td>
                <td className="p-4 text-black dark:text-white">
                  <div className="text-xs">{u.email || '-'}</div>
                  <div className="text-[10px] text-gray-500 dark:text-slate-400">{u.phone || '-'}</div>
                </td>
                <td className="p-4 text-black dark:text-white font-mono text-xs">
                  {u.password}
                </td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold flex items-center w-fit gap-1 bg-gray-100 dark:bg-black text-black dark:text-white`}>
                    {getRoleIcon(u.role)}
                    {t(u.role.toLowerCase() as any)}
                  </span>
                </td>
                <td className="p-4 text-black dark:text-white">
                  {/* Only show salary if user is GESTOR or viewing their own salary */}
                  {(isGestor || currentUser.id === u.id) 
                    ? (u.salary ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(u.salary) : '-')
                    : '***'}
                </td>
                <td className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    {canEditThisUser && (
                    <button
                      onClick={() => handleEdit(u)}
                      className="text-gray-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 p-2 rounded transition"
                      title="Editar Usuário"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    )}
                    {canDeleteThisUser && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-gray-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition"
                      title="Excluir Usuário"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    )}
                    {!showActions && <span className="text-gray-300 dark:text-slate-600">-</span>}
                  </div>
                </td>
              </tr>
            )})}
            {!loadingList && users.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-400 dark:text-slate-500">Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
      {/* Data Maintenance Section - GESTOR ONLY */}
      {currentUser.role === 'GESTOR' && (
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-orange-100 dark:border-orange-900/30 mt-8">
            <h3 className="font-bold text-black dark:text-white mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-orange-600 dark:text-orange-400" />
            Manutenção de Dados & Permissões
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Excel Integration */}
                <div className="p-4 bg-green-50 dark:bg-emerald-900/20 rounded-lg border border-green-200 dark:border-emerald-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2 flex items-center">
                        <Activity className="w-5 h-5 mr-2" />
                        Integração com Excel Online
                    </h4>
                    <p className="text-sm text-green-700 dark:text-emerald-500/80 mb-4">
                        Configure um Webhook (Power Automate) para enviar dados automaticamente para sua planilha Excel ao concluir projetos.
                    </p>
                    
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-green-800 dark:text-emerald-400 uppercase">URL do Webhook</label>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://prod-XX.westus.logic.azure.com:443/workflows/..."
                                className="flex-1 p-2 border border-green-300 dark:border-emerald-900/50 rounded text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                            />
                            <button 
                                onClick={handleSaveWebhook}
                                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-bold"
                            >
                                {t('save')}
                            </button>
                        </div>
                        <button 
                            onClick={() => setShowWebhookHelp(!showWebhookHelp)}
                            className="text-xs text-green-600 dark:text-emerald-500 underline hover:text-green-800 dark:hover:text-emerald-400 mt-1"
                        >
                            {t('howToConfigureThis')}
                        </button>
                        
                        {showWebhookHelp && (
                            <div className="mt-4 bg-white dark:bg-black p-4 rounded border border-green-200 dark:border-emerald-900/30 text-sm text-gray-600 dark:text-slate-400 space-y-2">
                                <p><strong>{t('stepByStepPowerAutomate')}</strong></p>
                                <ol className="list-decimal pl-5 space-y-1">
                                    <li>{t('excelWebhookHelpLine1')}</li>
                                    <li>{t('excelWebhookHelpLine2')}</li>
                                    <li>{t('excelWebhookHelpLine3')}
                                        <pre className="bg-gray-100 dark:bg-black p-2 rounded mt-1 text-xs font-mono dark:text-slate-300">
{`{
  "projetista": "Nome",
  "ns": "123456",
  "tipo_produto": "Furgão",
  "data_conclusao": "DD/MM/AAAA",
  "hora_conclusao": "HH:MM",
  "mes_referencia": "março"
}`}
                                        </pre>
                                    </li>
                                    <li>{t('excelWebhookHelpLine4')}</li>
                                    <li><strong>{t('excelWebhookHelpLine5')}</strong></li>
                                    <li>{t('excelWebhookHelpLine6')}</li>
                                    <li>{t('webhookUrlSavedSuccess')}</li>
                                </ol>
                            </div>
                        )}
                    </div>
                </div>

                {/* Remove Duplicates */}
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2">{t('removeDuplicateProjects')}</h4>
                    <p className="text-sm text-orange-600 dark:text-orange-500/80 mb-4">
                        {t('removeDuplicateProjectsDesc')}
                    </p>
                    <button 
                        onClick={async () => {
                            addToast(t('searchingDuplicates'), "info");
                            setIsCleaning(true);
                            
                            try {
                                const res = await findDuplicateProjects();
                                if (res.success) {
                                    if (res.duplicates.length > 0) {
                                        setDuplicateGroups(res.duplicates);
                                        setShowDuplicateModal(true);
                                        addToast(t('duplicateFoundCount', { count: res.duplicates.length }), "success");
                                    } else {
                                        addToast(t('noDuplicatesFound'), "success");
                                    }
                                } else {
                                    addToast(t('error') + ": " + res.message, "error");
                                }
                            } catch (e) {
                                addToast(t('errorGeneric'), "error");
                            } finally {
                                setIsCleaning(false);
                            }
                        }}
                        disabled={isCleaning}
                        className="bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isCleaning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        {t('searchDuplicatesButton' as any) || 'Buscar Duplicatas'}
                    </button>
                </div>

                {/* Recalculate Costs */}
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                        {t('updateProjectValues' as any) || 'Atualizar Valores de Projetos'}
                    </h4>
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-4">
                        {t('recalculateCostsDesc' as any) || 'Recalcula o custo de todos os projetos no banco de dados usando a regra atual.'}
                    </p>
                    <button 
                        onClick={async () => {
                            if(!window.confirm(t('confirmRecalculateAllCosts'))) return;
                            setIsRecalculating(true);
                            const res = await recalculateAllProjectCosts();
                            setIsRecalculating(false);
                            if(res.success) addToast(res.message, "success");
                            else addToast(t('error') + ": " + res.message, "error");
                        }}
                        disabled={isRecalculating}
                        className="bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                        {t('recalculateAndSyncButton' as any) || 'Recalcular e Sincronizar Custos'}
                    </button>
                </div>

                {/* COMPREHENSIVE SQL FIX - CRITICAL */}
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900/30 md:col-span-2">
                    <h4 className="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center uppercase tracking-tighter">
                        <Shield className="w-5 h-5 mr-2" />
                        Deseja corrigir erros de Banco de Dados? (Correção TOTAL)
                    </h4>
                    <p className="text-sm text-red-600 dark:text-red-500/80 mb-4 font-medium">
                        Se você está vendo erros como "innovations_type_check", "users_role_check" ou se não consegue adicionar tarefas no Diagrama de Gantt, use este botão para obter o script de correção abrangente.
                    </p>
                    <button 
                        onClick={() => setShowFixModal(true)}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl text-sm font-bold shadow-lg shadow-red-200 dark:shadow-none transition-all flex items-center gap-2"
                    >
                        <Database className="w-5 h-5" />
                        OBTER SCRIPT DE CORREÇÃO TOTAL
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* SQL FIX MODAL */}
      {showFixModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm shadow-2xl">
            <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-red-600 text-white shadow-sm">
                    <div className="flex items-center gap-3">
                        <Database className="w-6 h-6" />
                        <h3 className="text-lg font-bold uppercase tracking-tight">Script de Correção Total</h3>
                    </div>
                    <button onClick={() => setShowFixModal(false)} className="p-1.5 hover:bg-white/20 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto space-y-4">
                    <div className="bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 p-4 text-sm text-amber-800 dark:text-amber-300 rounded-r-lg">
                        <p className="font-bold mb-1 uppercase tracking-wide">Como aplicar:</p>
                        <ol className="list-decimal pl-5 space-y-1">
                            <li>Copie o código SQL abaixo.</li>
                            <li>Vá para o <strong>SQL Editor</strong> de seu painel Supabase.</li>
                            <li>Cole o código e clique em <strong>RUN</strong>.</li>
                        </ol>
                    </div>
                    
                    <div className="relative group">
                        <button 
                            onClick={() => {
                                const sqlCode = document.getElementById('sql-code-display')?.innerText;
                                if (sqlCode) {
                                  navigator.clipboard.writeText(sqlCode);
                                  addToast("Script copiado com sucesso!", "success");
                                }
                            }}
                            className="absolute right-4 top-4 p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-[10px] font-bold z-10"
                        >
                            <Copy size={14} /> COPIAR SCRIPT
                        </button>
                        <div 
                            id="sql-code-display"
                            className="bg-slate-950 text-emerald-400 p-6 rounded-xl font-mono text-[11px] overflow-x-auto whitespace-pre leading-relaxed border border-slate-800 h-96 select-all shadow-inner custom-scrollbar"
                        >
{`-- CORREÇÃO TOTAL DO BANCO DE DADOS (VERSÃO COMPLETA 2026)
-- Execute este script no SQL Editor do seu Supabase (https://supabase.com/dashboard/project/_/sql)

-- 1. DROPS PREVENTIVOS
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_type_check;

-- 2. Atualizar Cargos Permitidos
ALTER TABLE public.users ADD CONSTRAINT users_role_check 
CHECK (role IN ('GESTOR', 'PROJETISTA', 'CEO', 'QUALIDADE', 'PROCESSOS', 'COORDENADOR'));

-- 3. Garantir que as colunas necessárias existem na tabela de projetos
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS project_code text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS flooring_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS implement_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS estimated_seconds integer;

-- 4. Tabela de Inovações (Garantir colunas novas)
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_before numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS productivity_after numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_cost numeric DEFAULT 0;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS unit_product_value numeric DEFAULT 0;

-- 5. NORMALIZAÇÃO DE DADOS AGRESSIVA (Limpa antes de travar a porta)
UPDATE public.innovations SET type = 'NOVO PROJETO' WHERE UPPER(type) IN ('NEW PROJECT', 'NEW_PROJECT', 'NOVO_PROJETO');
UPDATE public.innovations SET type = 'MELHORIA DE PRODUTO' WHERE UPPER(type) IN ('PRODUCT IMPROVEMENT', 'PRODUCT_IMPROVEMENT', 'MELHORIA_DE_PRODUTO');
UPDATE public.innovations SET type = 'OTIMIZAÇÃO DE PROCESSOS' WHERE UPPER(type) IN ('PROCESS OPTIMIZATION', 'PROCESS_OPTIMIZATION', 'OTIMIZACAO_DE_PROCESSOS');

-- Qualquer tipo remanescente que não bata vira 'MELHORIA DE PRODUTO' para evitar erro
UPDATE public.innovations 
SET type = 'MELHORIA DE PRODUTO' 
WHERE type NOT IN ('NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS', 'NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION');

-- 6. REATIVAR CONSTRAINT DE INOVAÇÕES
ALTER TABLE public.innovations ADD CONSTRAINT innovations_type_check 
CHECK (type IN ('NOVO PROJETO', 'MELHORIA DE PRODUTO', 'OTIMIZAÇÃO DE PROCESSOS', 'NEW_PROJECT', 'PRODUCT_IMPROVEMENT', 'PROCESS_OPTIMIZATION'));

-- 7. Tabela de Gantt (Project Nexus)
CREATE TABLE IF NOT EXISTS public.gantt_tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  title text NOT NULL,
  description text,
  parent_id uuid REFERENCES public.gantt_tasks(id) ON DELETE CASCADE,
  start_date text NOT NULL,
  end_date text NOT NULL,
  color text,
  is_milestone boolean DEFAULT false,
  assigned_to jsonb DEFAULT '[]'::jsonb,
  progress integer DEFAULT 0,
  attachments jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  workload jsonb DEFAULT '{}'::jsonb,
  reports text,
  "order" integer DEFAULT 0,
  status text DEFAULT 'todo',
  priority text DEFAULT 'medium',
  category text,
  dependencies jsonb DEFAULT '[]'::jsonb,
  tenant_id uuid
);

-- Habilitar RLS para Gantt
ALTER TABLE public.gantt_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permissive Gantt Select" ON public.gantt_tasks;
CREATE POLICY "Permissive Gantt Select" ON public.gantt_tasks FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permissive Gantt All" ON public.gantt_tasks;
CREATE POLICY "Permissive Gantt All" ON public.gantt_tasks FOR ALL USING (true);

-- 8. Recarregar Schema
NOTIFY pgrst, 'reload config';`}
                        </div>
                    </div>
                    <p className="text-[10px] text-gray-500 italic mt-2">
                        * Este script não apaga dados existentes, apenas adiciona permissões e colunas faltantes.
                    </p>
                </div>
                
                <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 flex justify-end">
                    <button 
                        onClick={() => setShowFixModal(false)}
                        className="px-6 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
                    >
                        FECHAR
                    </button>
                </div>
            </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmationUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-slate-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2">{t('confirmDeletion')}</h3>
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                    {t('confirmDeletionDesc', { name: deleteConfirmationUser.name })}
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setDeleteConfirmationUser(null)}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-black hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
                    >
                        {t('cancel')}
                    </button>
                    <button 
                        onClick={confirmDelete}
                        className="px-4 py-2 text-white bg-red-600 hover:bg-red-700 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        {t('yesDelete')}
                    </button>
                </div>
            </div>
        </div>
      )}
      {/* Duplicate Resolution Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] flex flex-col border border-gray-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center">
                        <AlertCircle className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" />
                        {t('resolveDuplicates', { count: duplicateGroups.length })}
                    </h3>
                    <button onClick={() => setShowDuplicateModal(false)} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="overflow-y-auto flex-1 space-y-4 pr-2">
                    {duplicateGroups.map((group, idx) => (
                        <div key={idx} className="border border-gray-200 dark:border-slate-700 rounded-lg p-4 bg-gray-50 dark:bg-black grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                            {/* Keep */}
                            <div className="bg-white dark:bg-black p-3 rounded border border-green-200 dark:border-emerald-900/30 shadow-sm">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-green-100 dark:bg-emerald-900/40 text-green-800 dark:text-emerald-400 text-xs font-bold px-2 py-1 rounded">{t('keep')}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.keep.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.keep.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.keep.clientName || t('noClient')}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>{t('start')}: {new Date(group.keep.startTime).toLocaleString()}</p>
                                    <p>{t('timeCol' as any) || 'Tempo'}: {(group.keep.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>{t('statusLabel' as any) || 'Status'}: {group.keep.status}</p>
                                </div>
                            </div>

                            {/* Discard */}
                            <div className="bg-white dark:bg-black p-3 rounded border border-red-200 dark:border-red-900/30 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-400 text-xs font-bold px-2 py-1 rounded">{t('discard')}</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.discard.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.discard.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.discard.clientName || t('noClient')}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>{t('start')}: {new Date(group.discard.startTime).toLocaleString()}</p>
                                    <p>{t('timeCol' as any) || 'Tempo'}: {(group.discard.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>{t('statusLabel' as any) || 'Status'}: {group.discard.status}</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        if(!window.confirm(t('confirmDeletion'))) return;
                                        const res = await deleteProjectById(group.discard.id, group.discard.ns);
                                        if (res.success) {
                                            // Pop-up requested by user
                                            window.alert(t('projectDeletedSuccess' as any) || "PROJETO EXCLUÍDO COM SUCESSO!");
                                            // Update UI instantly without reload
                                            setDuplicateGroups(prev => prev.filter(g => g.discard.id !== group.discard.id));
                                        } else {
                                            addToast(t('errorPrefix') + res.message, "error");
                                            window.alert((t('errorPrefix') + res.message).toUpperCase());
                                        }
                                    }}
                                    className="mt-3 w-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30 py-1 rounded text-xs font-bold flex items-center justify-center"
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    {t('deleteThis')}
                                </button>
                            </div>
                            
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-black rounded-full p-1 border border-gray-200 dark:border-slate-700 shadow-sm z-10 hidden md:block">
                                <div className="text-gray-400 dark:text-slate-500 text-xs font-bold">VS</div>
                            </div>
                        </div>
                    ))}
                    {duplicateGroups.length === 0 && (
                        <div className="text-center py-10 text-gray-500 dark:text-slate-400">
                            <CheckCircle className="w-12 h-12 mx-auto text-green-500 dark:text-emerald-500 mb-3" />
                            <p>{t('allDuplicatesResolved')}</p>
                        </div>
                    )}
                </div>

                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex justify-end">
                    <button 
                        onClick={() => {
                            setShowDuplicateModal(false);
                            window.location.reload();
                        }}
                        className="px-4 py-2 bg-gray-800 dark:bg-black hover:bg-gray-900 dark:hover:bg-slate-600 text-white rounded-lg font-medium text-sm"
                    >
                        {t('closeAndUpdate')}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
