import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { updateUser } from '../services/storageService';
import { useToast } from './Toast';
import { User as UserIcon, Mail, Phone, Lock, Save, X, Loader2, Shield } from 'lucide-react';

interface UserProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdateUser: (updatedUser: User) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose, onUpdateUser }) => {
  const { addToast } = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState(user.name);
  const [surname, setSurname] = useState(user.surname || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [username, setUsername] = useState(user.username || '');
  const [email, setEmail] = useState(user.email || '');

  const handleSave = async () => {
    // Email validation
    if (email && !email.includes('@')) {
        addToast('O e-mail deve conter "@".', 'error');
        return;
    }

    setIsSaving(true);
    
    // Create updated user object
    const updatedUser: User = {
      ...user,
      name,
      surname,
      phone,
      username,
      email
    };

    const result = await updateUser(updatedUser);

    if (result.success) {
      addToast('Perfil atualizado com sucesso!', 'success');
      onUpdateUser(updatedUser);
      onClose();
    } else {
      addToast(result.message || 'Erro ao atualizar perfil.', 'error');
    }
    setIsSaving(false);
  };

  const getRoleLabel = (role: UserRole) => {
      switch(role) {
          case UserRole.GESTOR: return 'Gestor';
          case UserRole.CEO: return 'CEO';
          case UserRole.COORDENADOR: return 'Coordenador';
          default: return 'Projetista';
      }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-black rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 dark:border-slate-700">
        {/* Header */}
        <div className="bg-indigo-600 dark:bg-indigo-700 p-6 text-white flex justify-between items-start">
            <div>
                <h2 className="text-2xl font-bold flex items-center">
                    <UserIcon className="w-6 h-6 mr-2" />
                    Meu Perfil
                </h2>
                <p className="text-indigo-100 text-sm mt-1">Gerencie suas informações de acesso.</p>
            </div>
            <button 
                onClick={onClose}
                className="text-white/70 hover:text-white hover:bg-white/10 dark:hover:bg-slate-800 p-1 rounded-full transition-colors"
            >
                <X className="w-6 h-6" />
            </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
            {/* Editable Info */}
            <div className="bg-gray-50 dark:bg-black p-4 rounded-lg border border-gray-100 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-2 mb-2">
                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Informações Pessoais</span>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-full flex items-center">
                        <Shield className="w-3 h-3 mr-1" />
                        {getRoleLabel(user.role)}
                    </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-black dark:text-white block mb-1">Nome</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-black dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-black dark:text-white block mb-1">Sobrenome</label>
                        <input 
                            type="text" 
                            value={surname}
                            onChange={e => setSurname(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-black dark:text-white"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs text-black dark:text-white block mb-1 flex items-center">
                            <UserIcon className="w-3 h-3 mr-1" /> Usuário
                        </label>
                        <input 
                            type="text" 
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-black dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-black dark:text-white block mb-1 flex items-center">
                            <Phone className="w-3 h-3 mr-1" /> Telefone
                        </label>
                        <input 
                            type="text" 
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-black dark:text-white"
                        />
                    </div>
                </div>

                <div>
                    <label className="text-xs text-black dark:text-white block mb-1 flex items-center">
                        <Mail className="w-3 h-3 mr-1" /> E-mail
                    </label>
                    <input 
                        type="email" 
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-black dark:text-white"
                    />
                </div>

                {user.salary !== undefined && (
                    <div>
                        <label className="text-xs text-black dark:text-white block mb-1">Salário (Base)</label>
                        <div className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg bg-gray-100 dark:bg-slate-800 text-sm text-gray-500">
                            R$ {Number(user.salary).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1">O salário é usado para calcular o custo dos projetos e só pode ser alterado por um administrador.</p>
                    </div>
                )}
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-100 dark:border-amber-800 space-y-2">
                <p className="text-xs font-bold text-amber-800 dark:text-amber-400 flex items-center">
                    <Lock className="w-4 h-4 mr-2" />
                    Segurança da Conta
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                    Por motivos de segurança, sua senha é criptografada e não pode ser revelada, nem mesmo por administradores. 
                    Se você esqueceu sua senha, utilize a opção <strong>"Esqueceu a senha?"</strong> na tela de login para receber um link de recuperação por e-mail.
                </p>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-black flex justify-end gap-3">
            <button 
                onClick={onClose}
                className="px-4 py-2 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-medium text-sm transition-colors"
            >
                Cancelar
            </button>
            <button 
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors flex items-center shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                Salvar Alterações
            </button>
        </div>
      </div>
    </div>
  );
};
