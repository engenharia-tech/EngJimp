import React, { useState, useEffect } from 'react';
import { UserPlus, Shield, User as UserIcon, CheckCircle, Loader2, Eye, Activity, Briefcase, Edit, X, Trash2, AlertCircle } from 'lucide-react';
import { User, UserRole } from '../types';
import { registerUser, fetchUsers, updateUser, deleteUser, deleteAllIssues } from '../services/storageService';
import { useToast } from './Toast';

interface UserManagementProps {
    currentUser: User;
}

export const UserManagement: React.FC<UserManagementProps> = ({ currentUser }) => {
  const { addToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  
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
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold flex items-center text-gray-800">
            <UserPlus className="w-6 h-6 mr-2 text-indigo-600" />
            {editingUserId ? (currentUser.id === editingUserId ? 'Editar Meu Perfil' : 'Editar Usuário') : 'Cadastrar Novo Usuário'}
          </h2>
          {editingUserId && (
            <button 
              onClick={resetForm}
              className="text-gray-500 hover:text-gray-700 flex items-center text-sm"
            >
              <X className="w-4 h-4 mr-1" /> Cancelar Edição
            </button>
          )}
        </div>

        <form onSubmit={handleRegister} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome (Primeiro Nome)</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              required
              placeholder="Somente letras"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sobrenome</label>
            <input 
              type="text" 
              value={surname}
              onChange={e => setSurname(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Somente letras"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input 
              type="email" 
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="exemplo@exemplo.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Celular</label>
            <input 
              type="text" 
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="xx-xxxxx-xxxx"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome de Usuário (Login)</label>
            <input 
              type="text" 
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
            <input 
              type="text" 
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              placeholder="Defina uma senha"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Função {(!isGestor) && <span className="text-xs text-gray-400">(Somente Gestor)</span>}</label>
            <select 
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              disabled={!isGestor}
              className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${!isGestor ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
            >
              <option value="PROJETISTA">Projetista</option>
              <option value="GESTOR">Gestor</option>
              <option value="CEO">CEO</option>
              <option value="COORDENADOR">Coordenador</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Salário (R$) {(!isGestor) && <span className="text-xs text-gray-400">(Somente Gestor)</span>}</label>
            <input 
              type="number"
              min="0"
              step="0.01"
              value={salary}
              onChange={e => setSalary(Number(e.target.value))}
              disabled={!isGestor}
              className={`w-full p-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none ${!isGestor ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
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
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
           <h3 className="font-bold text-gray-700">Membros da Equipe</h3>
           {loadingList && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
        </div>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-600 font-medium">
            <tr>
              <th className="p-4">Nome</th>
              <th className="p-4">Usuário</th>
              <th className="p-4">Função</th>
              <th className="p-4">Salário</th>
              <th className="p-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => {
              const canEditThisUser = canEditUser(u);
              const canDeleteThisUser = canDeleteUser; // Only Gestor
              const showActions = canEditThisUser || canDeleteThisUser;

              return (
              <tr key={u.id} className={`hover:bg-gray-50 ${currentUser.id === u.id ? 'bg-blue-50/50' : ''}`}>
                <td className="p-4 font-medium text-gray-800 flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold">
                    {u.name.charAt(0)}
                  </div>
                  {u.name} {currentUser.id === u.id && <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full ml-2">Você</span>}
                </td>
                <td className="p-4 text-gray-600">{u.username}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded-full text-xs font-bold flex items-center w-fit gap-1 bg-gray-100 text-gray-700`}>
                    {getRoleIcon(u.role)}
                    {u.role}
                  </span>
                </td>
                <td className="p-4 text-gray-600">
                  {/* Only show salary if user is GESTOR or viewing their own salary */}
                  {(isGestor || currentUser.id === u.id) 
                    ? (u.salary ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(u.salary) : '-')
                    : '***'}
                </td>
                <td className="p-4 text-center flex items-center justify-center gap-2">
                    {canEditThisUser && (
                    <button
                      onClick={() => handleEdit(u)}
                      className="text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 p-2 rounded transition"
                      title="Editar Usuário"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    )}
                    {canDeleteThisUser && (
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-gray-400 hover:text-red-600 hover:bg-red-50 p-2 rounded transition"
                      title="Excluir Usuário"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    )}
                    {!showActions && <span className="text-gray-300">-</span>}
                </td>
              </tr>
            )})}
            {!loadingList && users.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-center text-gray-400">Nenhum usuário encontrado.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Data Maintenance Section - GESTOR ONLY */}
      {currentUser.role === 'GESTOR' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-orange-100 mt-8">
            <h3 className="font-bold text-gray-800 mb-4 flex items-center">
            <Shield className="w-5 h-5 mr-2 text-orange-600" />
            Manutenção de Dados & Permissões
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Clear Issues */}
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <h4 className="font-semibold text-gray-700 mb-2">Limpeza de Dados</h4>
                    <p className="text-sm text-gray-500 mb-4">
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
                        className="bg-red-100 hover:bg-red-200 text-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
                    >
                        {isCleaning ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
                        Limpar Tabela de Problemas
                    </button>
                </div>

                {/* Fix RLS */}
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                    <h4 className="font-bold text-red-700 mb-2 flex items-center">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        CORREÇÃO DE ERROS DE BANCO DE DADOS
                    </h4>
                    <p className="text-sm text-red-600 mb-4">
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

-- Innovations: Garantir que não trave
ALTER TABLE public.innovations DROP CONSTRAINT IF EXISTS innovations_project_id_fkey;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'innovations' AND column_name = 'project_id') THEN
        ALTER TABLE public.innovations ADD CONSTRAINT innovations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 9. Adicionar colunas de Perfil (Nome, Sobrenome, Email, Celular)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS surname TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone TEXT;
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
            </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deleteConfirmationUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-2">Confirmar Exclusão</h3>
                <p className="text-gray-600 mb-6">
                    Tem certeza que deseja excluir o usuário <strong>{deleteConfirmationUser.name}</strong>? Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setDeleteConfirmationUser(null)}
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
    </div>
  );
};
