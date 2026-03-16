import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, User as UserIcon, CheckCircle, Loader2, Eye, Activity, Briefcase, Edit, X, Trash2, AlertCircle } from 'lucide-react';
import { User, UserRole } from '../types';
import { registerUser, fetchUsers, updateUser, deleteUser, deleteAllIssues, removeDuplicateProjects, findDuplicateProjects, deleteProjectById, DuplicateGroup, updateSettings, fetchAppState, recalculateAllProjectCosts } from '../services/storageService';
import { getWebhookUrl, saveWebhookUrl } from '../services/webhookService';
import { useToast } from './Toast';

interface UserManagementProps {
    currentUser: User;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  
  // Webhook State
  const [webhookUrl, setWebhookUrl] = useState('');
  const [showWebhookHelp, setShowWebhookHelp] = useState(false);

  // White Label & Settings State
  const [hourlyCost, setHourlyCost] = useState<number>(0);
  const [companyName, setCompanyName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');

  useEffect(() => {
      setWebhookUrl(getWebhookUrl());
      // Load settings from app state
      const loadSettings = async () => {
          const state = await fetchAppState();
          if (state.settings) {
              setHourlyCost(state.settings.hourlyCost);
              setCompanyName(state.settings.companyName || '');
              setLogoUrl(state.settings.logoUrl || '');
          }
      };
      loadSettings();
  }, []);

  const handleSaveSettings = async () => {
      try {
          await updateSettings({
              hourlyCost,
              companyName,
              logoUrl
          });
          addToast("Configurações atualizadas com sucesso!", "success");
          // Force a reload or notify App.tsx if needed, but App.tsx usually re-fetches on interval or we can just tell user to refresh
          // In a real app we'd use a global state manager or context
          window.location.reload(); // Simple way to apply white label changes globally
      } catch (error) {
          addToast("Erro ao atualizar configurações.", "error");
      }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          if (file.size > 500 * 1024) { // 500KB limit
              addToast("A imagem deve ter no máximo 500KB.", "error");
              return;
          }
          const reader = new FileReader();
          reader.onloadend = () => {
              setLogoUrl(reader.result as string);
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSaveWebhook = () => {
      saveWebhookUrl(webhookUrl);
      addToast("URL de integração salva com sucesso!", "success");
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
    setUsers(list);
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
      addToast(`Usuário ${name} ${editingUserId ? 'atualizado' : 'criado'} com sucesso!`, 'success');
      await loadList(); // Refresh list
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
              <option value="PROJETISTA">Projetista</option>
              <option value="GESTOR">Gestor</option>
              <option value="CEO">CEO</option>
              <option value="COORDENADOR">Coordenador</option>
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
        <div className="overflow-x-auto">
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
                    {u.role}
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
                {/* Clear Issues */}
                <div className="p-4 bg-gray-50 dark:bg-black rounded-lg border border-gray-200 dark:border-slate-700">
                    <h4 className="font-semibold text-black dark:text-white mb-2">Limpeza de Dados</h4>
                    <p className="text-sm text-gray-500 dark:text-slate-400 mb-4">
                        A tabela de "Problemas" (Issues) foi descontinuada. Use este botão para limpar todos os registros antigos do banco de dados.
                    </p>
                    <button 
                        onClick={async () => {
                            if(!window.confirm("ATENÇÃO: Isso apagará TODOS os registros da tabela 'issues'. Tem certeza?")) return;
                            setIsCleaning(true);
                            const res = await deleteAllIssues();
                            setIsCleaning(false);
                            if(res.success) alert(res.message);
                            else alert("Erro: " + res.message);
                        }}
                        disabled={isCleaning}
                        className="bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isCleaning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Limpar Tabela de Problemas
                    </button>
                </div>

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
                                Salvar
                            </button>
                        </div>
                        <button 
                            onClick={() => setShowWebhookHelp(!showWebhookHelp)}
                            className="text-xs text-green-600 dark:text-emerald-500 underline hover:text-green-800 dark:hover:text-emerald-400 mt-1"
                        >
                            Como configurar isso?
                        </button>
                        
                        {showWebhookHelp && (
                            <div className="mt-4 bg-white dark:bg-black p-4 rounded border border-green-200 dark:border-emerald-900/30 text-sm text-gray-600 dark:text-slate-400 space-y-2">
                                <p><strong>Passo a Passo (Power Automate):</strong></p>
                                <ol className="list-decimal pl-5 space-y-1">
                                    <li>Crie um novo fluxo "Instantâneo" no Power Automate.</li>
                                    <li>Escolha o gatilho: <strong>"Quando uma solicitação HTTP é recebida"</strong>.</li>
                                    <li>No corpo da solicitação (Schema), use este JSON de exemplo:
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
                                    <li>Adicione uma ação: <strong>"Excel Online (Business) - Adicionar uma linha em uma tabela"</strong>.</li>
                                    <li><strong>Dica Importante:</strong> Para escrever em abas diferentes (ex: "abril"), você precisará usar uma condição no Power Automate baseada no campo <code>mes_referencia</code> para escolher a Tabela correta.</li>
                                    <li>Selecione seu arquivo Excel e mapeie os campos do JSON para as colunas.</li>
                                    <li>Salve o fluxo e copie a <strong>URL HTTP POST</strong> gerada.</li>
                                    <li>Cole a URL acima e clique em Salvar.</li>
                                </ol>
                            </div>
                        )}
                    </div>
                </div>

                {/* White Label & Hourly Cost Configuration */}
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-900/30 md:col-span-2">
                    <h4 className="font-semibold text-black dark:text-white mb-4 flex items-center">
                        <Shield className="w-5 h-5 mr-2 text-blue-600 dark:text-blue-400" />
                        Configurações da Empresa (White Label)
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase block mb-1">Nome da Empresa</label>
                                <input 
                                    type="text" 
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    className="w-full p-2 border border-blue-300 dark:border-blue-900/50 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                                    placeholder="Ex: Minha Empresa LTDA"
                                />
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase block mb-1">Custo Hora Engenharia (R$)</label>
                                <input 
                                    type="number" 
                                    value={hourlyCost}
                                    onChange={(e) => setHourlyCost(Number(e.target.value))}
                                    className="w-full p-2 border border-blue-300 dark:border-blue-900/50 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-black dark:text-slate-200"
                                    placeholder="Ex: 150.00"
                                />
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-blue-800 dark:text-blue-400 uppercase block mb-1">Logo da Empresa</label>
                                <div className="flex items-start gap-4">
                                    <div className="w-20 h-20 border border-dashed border-blue-300 dark:border-blue-900/50 rounded-lg flex items-center justify-center bg-white dark:bg-black overflow-hidden">
                                        {logoUrl ? (
                                            <img src={logoUrl} alt="Preview" className="max-w-full max-h-full object-contain" />
                                        ) : (
                                            <Briefcase className="w-8 h-8 text-blue-200 dark:text-blue-900/50" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <input 
                                            type="file" 
                                            accept="image/*"
                                            onChange={handleLogoUpload}
                                            className="hidden" 
                                            id="logo-upload"
                                        />
                                        <label 
                                            htmlFor="logo-upload"
                                            className="inline-block bg-white dark:bg-black border border-blue-300 dark:border-blue-900/50 text-blue-600 dark:text-blue-400 px-3 py-1.5 rounded text-xs font-bold cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                        >
                                            Selecionar Imagem
                                        </label>
                                        <p className="text-[10px] text-gray-500 dark:text-slate-500 mt-2 leading-tight">
                                            Recomendado: PNG ou SVG com fundo transparente.<br />
                                            Tamanho ideal: 200x50px (proporção retangular).<br />
                                            Máximo: 500KB.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-blue-100 dark:border-blue-900/30">
                        <button 
                            onClick={handleSaveSettings}
                            className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-2 rounded-lg text-sm font-bold transition-colors"
                        >
                            Salvar Todas as Configurações
                        </button>
                    </div>
                </div>

                {/* Remove Duplicates */}
                <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2">Remover Projetos Duplicados</h4>
                    <p className="text-sm text-orange-600 dark:text-orange-500/80 mb-4">
                        Localiza e permite apagar projetos com o mesmo NS e Cliente, mantendo o mais recente.
                    </p>
                    <button 
                        onClick={async () => {
                            addToast("Buscando duplicatas...", "info");
                            setIsCleaning(true);
                            
                            try {
                                const res = await findDuplicateProjects();
                                if (res.success) {
                                    if (res.duplicates.length > 0) {
                                        setDuplicateGroups(res.duplicates);
                                        setShowDuplicateModal(true);
                                        addToast(`${res.duplicates.length} duplicatas encontradas.`, "success");
                                    } else {
                                        addToast("Nenhuma duplicata encontrada.", "success");
                                    }
                                } else {
                                    addToast("Erro: " + res.message, "error");
                                }
                            } catch (e) {
                                addToast("Erro inesperado ao processar.", "error");
                            } finally {
                                setIsCleaning(false);
                            }
                        }}
                        disabled={isCleaning}
                        className="bg-orange-100 dark:bg-orange-900/30 hover:bg-orange-200 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isCleaning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Buscar Duplicatas
                    </button>
                </div>

                {/* Fix RLS */}
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-900/30">
                    <h4 className="font-bold text-red-700 dark:text-red-400 mb-2 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        CORREÇÃO DE ERROS DE BANCO DE DADOS
                    </h4>
                    <p className="text-sm text-red-600 dark:text-red-500/80 mb-4">
                        Se você está vendo erros como <strong>"violates check constraint"</strong>, <strong>"policy violated"</strong> ou não consegue salvar/excluir nada, é OBRIGATÓRIO rodar este script no Supabase.
                    </p>
                    <button 
                        onClick={() => {
                            const sql = `
-- 1. Habilitar RLS (Segurança) em todas as tabelas
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.innovations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;

-- 2. Criar Políticas Permissivas (Liberar INSERT, UPDATE, DELETE para todos)
-- Users
DROP POLICY IF EXISTS "Enable all for users" ON public.users;
CREATE POLICY "Enable all for users" ON public.users FOR ALL USING (true) WITH CHECK (true);

-- Projects
DROP POLICY IF EXISTS "Enable all for projects" ON public.projects;
CREATE POLICY "Enable all for projects" ON public.projects FOR ALL USING (true) WITH CHECK (true);

-- Innovations
DROP POLICY IF EXISTS "Enable all for innovations" ON public.innovations;
CREATE POLICY "Enable all for innovations" ON public.innovations FOR ALL USING (true) WITH CHECK (true);

-- Issues
DROP POLICY IF EXISTS "Enable all for issues" ON public.issues;
CREATE POLICY "Enable all for issues" ON public.issues FOR ALL USING (true) WITH CHECK (true);

-- 3. Corrigir Travamentos de Exclusão (ON DELETE SET NULL)
-- Projects
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_user_id_fkey;
ALTER TABLE public.projects ADD CONSTRAINT projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Innovations
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_author_id_fkey;
ALTER TABLE public.innovations ADD CONSTRAINT innovations_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- Issues
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_reported_by_fkey;
ALTER TABLE public.issues ADD CONSTRAINT issues_reported_by_fkey FOREIGN KEY (reported_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 4. Atualizar Constraint de Cargos (Adicionar COORDENADOR, Remover PROCESSOS/QUALIDADE)
-- Isso corrige o erro "violates check constraint users_role_check"
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check CHECK (role IN ('PROJETISTA', 'GESTOR', 'CEO', 'COORDENADOR'));

-- 5. Garantir que project_code não seja obrigatório
ALTER TABLE public.projects ALTER COLUMN project_code DROP NOT NULL;

-- 6. Adicionar coluna de Tempo Estimado (Correção do erro "estimated_seconds not found")
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS estimated_seconds NUMERIC DEFAULT 0;

-- 7. Corrigir bloqueios de exclusão (Foreign Keys)
-- Remove vínculos que impedem apagar projetos

-- Issues: Tentar vincular por ID se possível, ou garantir que não trave
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_project_id_fkey;
ALTER TABLE public.issues DROP CONSTRAINT IF EXISTS issues_project_ns_fkey;

-- Recriar FK para issues (se a coluna project_id existir)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'project_id') THEN
        ALTER TABLE public.issues ADD CONSTRAINT issues_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Innovations: Garantir que não trave e adicionar novas colunas
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_project_id_fkey;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'innovations' AND column_name = 'project_id') THEN
        ALTER TABLE public.innovations ADD CONSTRAINT innovations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 8. Corrigir Constraint de Tipo de Inovação e Adicionar Colunas de Cálculo
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_type_check;
ALTER TABLE public.innovations ADD CONSTRAINT innovations_type_check CHECK (type IN ('Melhoria de Produto', 'Otimização de Processos', 'Novo Projeto'));

ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS materials JSONB;
ALTER TABLE public.innovations ADD COLUMN IF NOT EXISTS machine JSONB;

-- 9. Adicionar colunas de Perfil (Nome, Sobrenome, Email, Celular)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS surname TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;

-- 10. Criar Tabelas de Interrupções
CREATE TABLE IF NOT EXISTS public.interruption_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.interruptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
    project_ns TEXT NOT NULL,
    client_name TEXT,
    designer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    start_time TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_time TIMESTAMPTZ,
    problem_type TEXT NOT NULL,
    responsible_area TEXT NOT NULL,
    responsible_person TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Aberto',
    total_time_seconds INTEGER DEFAULT 0
);

-- Garantir que a coluna project_id exista caso a tabela tenha sido criada sem ela
ALTER TABLE public.interruptions ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

-- Habilitar RLS
ALTER TABLE public.interruption_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interruptions ENABLE ROW LEVEL SECURITY;

-- Criar Políticas
DROP POLICY IF EXISTS "Enable all for interruption_types" ON public.interruption_types;
CREATE POLICY "Enable all for interruption_types" ON public.interruption_types FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all for interruptions" ON public.interruptions;
CREATE POLICY "Enable all for interruptions" ON public.interruptions FOR ALL USING (true) WITH CHECK (true);

-- Seed default interruption types
INSERT INTO public.interruption_types (name)
SELECT name FROM (
    VALUES 
    ('falta de informações'),
    ('Informações erradas'),
    ('outros')
) AS t(name)
WHERE NOT EXISTS (SELECT 1 FROM public.interruption_types);
`;
                            navigator.clipboard.writeText(sql);
                            addToast("SQL Completo copiado! Cole no SQL Editor do Supabase e execute.", 'success');
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition-colors flex items-center justify-center shadow-md"
                    >
                        <Shield className="w-5 h-5 mr-2" />
                        COPIAR SCRIPT DE CORREÇÃO (SQL)
                    </button>
                </div>

                {/* Recalculate Costs */}
                <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-900/30">
                    <h4 className="font-semibold text-black dark:text-white mb-2 flex items-center">
                        <Activity className="w-5 h-5 mr-2 text-indigo-600" />
                        Atualizar Valores de Projetos
                    </h4>
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-4">
                        Recalcula o custo de todos os projetos no banco de dados usando a regra atual (Tempo Produtivo × Custo Hora).
                    </p>
                    <button 
                        onClick={async () => {
                            if(!window.confirm("Isso atualizará o custo de TODOS os projetos no banco de dados. Deseja continuar?")) return;
                            setIsRecalculating(true);
                            const res = await recalculateAllProjectCosts();
                            setIsRecalculating(false);
                            if(res.success) addToast(res.message, "success");
                            else addToast("Erro: " + res.message, "error");
                        }}
                        disabled={isRecalculating}
                        className="bg-indigo-100 dark:bg-indigo-900/30 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isRecalculating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                        Recalcular e Sincronizar Custos
                    </button>
                </div>
            </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmationUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-100 dark:border-slate-700">
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 mb-2">Confirmar Exclusão</h3>
                <p className="text-gray-600 dark:text-slate-400 mb-6">
                    Tem certeza que deseja excluir o usuário <strong>{deleteConfirmationUser.name}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setDeleteConfirmationUser(null)}
                        className="px-4 py-2 text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-black hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg font-medium transition-colors"
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
      {/* Duplicate Resolution Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-4xl p-6 max-h-[90vh] flex flex-col border border-gray-100 dark:border-slate-700">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-slate-100 flex items-center">
                        <AlertCircle className="w-6 h-6 mr-2 text-orange-600 dark:text-orange-400" />
                        Resolver Duplicatas ({duplicateGroups.length})
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
                                    <span className="bg-green-100 dark:bg-emerald-900/40 text-green-800 dark:text-emerald-400 text-xs font-bold px-2 py-1 rounded">MANTER</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.keep.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.keep.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.keep.clientName || 'Sem cliente'}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>Início: {new Date(group.keep.startTime).toLocaleString()}</p>
                                    <p>Tempo: {(group.keep.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>Status: {group.keep.status}</p>
                                </div>
                            </div>

                            {/* Discard */}
                            <div className="bg-white dark:bg-black p-3 rounded border border-red-200 dark:border-red-900/30 shadow-sm opacity-75 hover:opacity-100 transition-opacity">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-400 text-xs font-bold px-2 py-1 rounded">APAGAR</span>
                                    <span className="text-xs text-gray-400 dark:text-slate-500">ID: ...{group.discard.id.slice(-4)}</span>
                                </div>
                                <p className="font-bold text-gray-800 dark:text-slate-200">{group.discard.ns}</p>
                                <p className="text-sm text-gray-600 dark:text-slate-400">{group.discard.clientName || 'Sem cliente'}</p>
                                <div className="mt-2 text-xs text-gray-500 dark:text-slate-500 space-y-1">
                                    <p>Início: {new Date(group.discard.startTime).toLocaleString()}</p>
                                    <p>Tempo: {(group.discard.totalActiveSeconds / 3600).toFixed(2)}h</p>
                                    <p>Status: {group.discard.status}</p>
                                </div>
                                <button 
                                    onClick={async () => {
                                        if(!window.confirm("Confirmar exclusão deste item?")) return;
                                        const res = await deleteProjectById(group.discard.id, group.discard.ns);
                                        if (res.success) {
                                            // Pop-up requested by user
                                            window.alert("Projeto excluído com sucesso!");
                                            // Update UI instantly without reload
                                            setDuplicateGroups(prev => prev.filter(g => g.discard.id !== group.discard.id));
                                        } else {
                                            addToast("Erro ao excluir: " + res.message, "error");
                                            window.alert("Erro ao excluir: " + res.message);
                                        }
                                    }}
                                    className="mt-3 w-full bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900/30 py-1 rounded text-xs font-bold flex items-center justify-center"
                                >
                                    <Trash2 className="w-3 h-3 mr-1" />
                                    EXCLUIR ESTE
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
                            <p>Todas as duplicatas foram resolvidas!</p>
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
                        Fechar e Atualizar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};
