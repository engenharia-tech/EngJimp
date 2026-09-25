import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { updateOwnContact } from '../services/storageService';
import { changeOwnPassword } from '../services/authService';
import { useToast } from './Toast';
import { useLanguage } from '../i18n/LanguageContext';
import { useDialog } from '../hooks/useDialog';
import { User as UserIcon, Mail, Phone, Lock, Save, X, Loader2, Shield } from 'lucide-react';

interface UserProfileModalProps {
  user: User;
  onClose: () => void;
  onUpdateUser: (updatedUser: User) => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ user, onClose, onUpdateUser }) => {
  const { addToast } = useToast();
  const { t } = useLanguage();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [currentPasswordInput, setCurrentPasswordInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState(user.name);
  const [surname, setSurname] = useState(user.surname || '');
  const [email, setEmail] = useState(user.email || '');
  const [phone, setPhone] = useState(user.phone || '');

  const wantsNewPassword = newPassword.length > 0;

  const handleSave = async () => {
    // A senha atual NÃO é conferida aqui: o cliente não tem a senha (o login devolve
    // o usuário sem ela, `user.password` é ''). Quem confere é o servidor, e só quando
    // se troca a senha. Antes a comparação era local e barrava todo salvamento.
    if (wantsNewPassword) {
      if (!currentPasswordInput) {
        addToast('Digite a senha atual para trocar a senha.', 'error');
        return;
      }
      if (newPassword.length < 6) {
        addToast('A senha nova deve ter ao menos 6 caracteres.', 'error');
        return;
      }
      if (newPassword !== confirmPassword) {
        addToast('As senhas não coincidem.', 'error');
        return;
      }
    }

    // Email validation
    if (email && !email.includes('@')) {
        addToast('O e-mail deve conter "@".', 'error');
        return;
    }

    const contactChanged =
      name !== user.name || surname !== (user.surname || '') ||
      email !== (user.email || '') || phone !== (user.phone || '');
    if (!wantsNewPassword && !contactChanged) {
      onClose();
      return;
    }
    if (contactChanged && !name.trim()) {
      addToast('Informe o seu nome.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      // 1) Senha: conferida e gravada com hash pelo servidor (nunca em texto).
      if (wantsNewPassword) {
        const r = await changeOwnPassword(currentPasswordInput, newPassword);
        if (!r.ok) {
          addToast(r.error || 'Erro ao trocar a senha.', 'error');
          return;
        }
        // A senha JÁ mudou: limpa os campos. Senão, se o contato falhar e a pessoa
        // salvar de novo, a tela tentaria trocar de novo com a senha "atual" antiga
        // (que não é mais a atual) e somaria erros até o bloqueio de 15 min.
        setCurrentPasswordInput(''); setNewPassword(''); setConfirmPassword('');
      }

      // 2) Dados de contato. O perfil nunca manda senha nem salário: o login não traz
      // o salário (o cliente tem 0), e mandá-lo fazia o Edson zerar o próprio salário
      // ao trocar só o telefone.
      if (contactChanged) {
        const updatedUser: User = { ...user, name: name.trim(), surname, email, phone };
        // Só o contato (modo 'profile'): o servidor ignora cargo, OKR, setor, login e
        // senha — o `user` daqui é o do login e pode estar velho.
        const result = await updateOwnContact(updatedUser);
        if (!result.success) {
          const msg = result.message || 'Erro ao atualizar perfil.';
          addToast(wantsNewPassword ? `A senha foi trocada, mas os dados não foram salvos: ${msg}` : msg, 'error');
          return;
        }
        onUpdateUser(updatedUser);
      }

      addToast(
        wantsNewPassword && contactChanged ? 'Perfil e senha atualizados com sucesso!'
          : wantsNewPassword ? 'Senha trocada com sucesso!'
          : 'Perfil atualizado com sucesso!',
        'success'
      );
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const getRoleLabel = (role: UserRole) => {
      switch(role) {
          case 'GESTOR': return t('gestor');
          case 'CEO': return t('ceo');
          case 'COORDENADOR': return t('coordenador');
          case 'PROJETISTA': return t('projetista');
          case 'PROCESSOS': return t('processos');
          case 'ADM_EXTERNO': return t('adm_externo' as any);
          default: return role;
      }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Meu perfil" tabIndex={-1} className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh] border border-gray-100 dark:border-slate-700 outline-none">
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
            <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-lg border border-gray-100 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 pb-2 mb-2">
                    <span className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider">Informações Pessoais</span>
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-1 rounded-full flex items-center">
                        <Shield className="w-3 h-3 mr-1" />
                        {getRoleLabel(user.role)}
                    </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs text-black dark:text-white block mb-1">Nome</label>
                        <input 
                            type="text" 
                            value={name}
                            onChange={e => setName(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-slate-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-black dark:text-white block mb-1">Sobrenome</label>
                        <input 
                            type="text" 
                            value={surname}
                            onChange={e => setSurname(e.target.value.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''))}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-slate-900 dark:text-white"
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
                        className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-slate-900 dark:text-white"
                    />
                </div>

                <div>
                    <label className="text-xs text-black dark:text-white block mb-1 flex items-center">
                        <Phone className="w-3 h-3 mr-1" /> Celular
                    </label>
                    <input 
                        type="text" 
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                        className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white dark:bg-slate-900 dark:text-white"
                        placeholder="Somente números"
                    />
                </div>
            </div>

            {/* Change Password */}
            <div>
                <h3 className="text-sm font-bold text-black dark:text-white mb-3 flex items-center">
                    <Lock className="w-4 h-4 mr-2 text-indigo-600 dark:text-indigo-400" />
                    Segurança & Senha
                </h3>
                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-black dark:text-white mb-1">Senha Atual</label>
                        <input
                            type="password"
                            autoComplete="current-password"
                            value={currentPasswordInput}
                            onChange={e => setCurrentPasswordInput(e.target.value)}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                            placeholder="Só para trocar a senha"
                            required={wantsNewPassword}
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-medium text-black dark:text-white mb-1">Nova Senha</label>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                            placeholder="Em branco = manter a atual (mínimo 6 caracteres)"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-black dark:text-white mb-1">Confirmar Nova Senha</label>
                        <input
                            type="password"
                            autoComplete="new-password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                            placeholder="Confirme a nova senha"
                        />
                    </div>
                </div>
            </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 flex justify-end gap-3">
            <button 
                onClick={onClose}
                className="px-4 py-2 text-gray-600 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-lg font-medium text-sm transition-colors"
            >
                Cancelar
            </button>
            <button 
                onClick={handleSave}
                disabled={isSaving || (wantsNewPassword && (!currentPasswordInput || newPassword !== confirmPassword))}
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
