import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, Save, Mail, Server, Shield, User, DollarSign, Globe, Send, CheckCircle2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { AppSettings } from '../types';
import { useToast } from './Toast';

interface SettingsProps {
  settings: AppSettings;
  onUpdate: (settings: AppSettings) => void;
}

export const Settings: React.FC<SettingsProps> = ({ settings, onUpdate }) => {
  const [formData, setFormData] = useState<AppSettings>({ ...settings });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const { showToast } = useToast();

  // Sync formData when settings prop changes (e.g. after initial load or save)
  useEffect(() => {
    setFormData({ ...settings });
  }, [settings]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onUpdate(formData);
      setIsEditing(false);
      showToast('Configurações salvas com sucesso!', 'success');
    } catch (error) {
      showToast('Erro ao salvar configurações.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestEmail = async () => {
    if (!formData.emailUser || !formData.emailPass || !formData.emailTo) {
      showToast('Preencha os campos de e-mail, senha e destinatário para testar.', 'error');
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: 'Teste de Conexão - JIMPNEXUS',
          body: 'Este é um e-mail de teste para validar as configurações do sistema.',
          config: {
            emailHost: formData.emailHost,
            emailPort: formData.emailPort,
            emailUser: formData.emailUser,
            emailPass: formData.emailPass,
            emailFrom: formData.emailFrom,
            emailTo: formData.emailTo
          }
        })
      });

      const result = await response.json();
      if (result.success) {
        showToast('E-mail de teste enviado com sucesso!', 'success');
      } else {
        showToast(`Erro ao enviar: ${result.error || 'Verifique as configurações'}`, 'error');
      }
    } catch (error) {
      showToast('Erro de conexão com o servidor.', 'error');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h2 className="text-2xl font-bold text-black dark:text-white flex items-center">
            <SettingsIcon className="w-6 h-6 mr-2 text-blue-600 dark:text-blue-400" />
            Configurações do Sistema
          </h2>
          <p className="text-gray-600 dark:text-slate-400 mt-1">Ajuste as preferências globais e integrações.</p>
        </div>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center transition-all shadow-md"
          >
            Alterar Configurações
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Settings */}
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
            <Globe className="w-5 h-5 mr-2 text-blue-500" />
            Geral
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Nome da Empresa</label>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.companyName || ''}
                onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                placeholder="Ex: Minha Empresa LTDA"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Custo Hora Padrão (R$)</label>
              <div className="relative">
                <DollarSign className="absolute left-2 top-2.5 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="number"
                  disabled={!isEditing}
                  value={formData.hourlyCost}
                  onChange={e => setFormData({ ...formData, hourlyCost: parseFloat(e.target.value) || 0 })}
                  className="w-full pl-8 p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                  placeholder="150.00"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Email Settings */}
        <div className="bg-white dark:bg-black p-6 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700">
          <h3 className="text-lg font-bold text-black dark:text-white mb-4 flex items-center">
            <Mail className="w-5 h-5 mr-2 text-emerald-500" />
            Configuração de E-mail (SMTP)
          </h3>
          <p className="text-xs text-gray-500 dark:text-slate-400 mb-4">
            Configure os dados do servidor SMTP para o envio automático de notificações de conclusão de projeto.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Servidor SMTP (Host)</label>
              <div className="relative">
                <Server className="absolute left-2 top-2.5 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.emailHost || ''}
                  onChange={e => setFormData({ ...formData, emailHost: e.target.value })}
                  className="w-full pl-8 p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                  placeholder="smtp.gmail.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Porta</label>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.emailPort || ''}
                onChange={e => setFormData({ ...formData, emailPort: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                placeholder="587 ou 465"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Usuário / E-mail</label>
              <div className="relative">
                <User className="absolute left-2 top-2.5 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type="text"
                  disabled={!isEditing}
                  value={formData.emailUser || ''}
                  onChange={e => setFormData({ ...formData, emailUser: e.target.value })}
                  className="w-full pl-8 p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                  placeholder="seu-email@gmail.com"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Senha / Senha de App</label>
              <div className="relative">
                <Shield className="absolute left-2 top-2.5 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  disabled={!isEditing}
                  value={formData.emailPass || ''}
                  onChange={e => setFormData({ ...formData, emailPass: e.target.value })}
                  className="w-full pl-8 pr-10 p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-2 text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Remetente (From)</label>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.emailFrom || ''}
                onChange={e => setFormData({ ...formData, emailFrom: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                placeholder="Nome <email@empresa.com>"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Destinatários (To)</label>
              <input
                type="text"
                disabled={!isEditing}
                value={formData.emailTo || ''}
                onChange={e => setFormData({ ...formData, emailTo: e.target.value })}
                className="w-full p-2 border border-gray-200 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none dark:bg-black dark:text-white disabled:opacity-60 disabled:bg-gray-50 dark:disabled:bg-slate-900"
                placeholder="email1@exemplo.com, email2@exemplo.com"
              />
              <p className="text-[10px] text-gray-500 mt-1">Separe múltiplos e-mails por vírgula.</p>
            </div>
          </div>
        </div>

        {isEditing && (
          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={() => {
                setIsEditing(false);
                setFormData({ ...settings });
              }}
              className="px-6 py-3 bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-bold rounded-lg transition-all"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || isTesting}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg flex items-center transition-all shadow-md disabled:opacity-50"
            >
              {isSaving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : (
                <Save className="w-5 h-5 mr-2" />
              )}
              Salvar Configurações
            </button>
          </div>
        )}
        
        {!isEditing && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleTestEmail}
              disabled={isTesting}
              className="px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-lg flex items-center transition-all disabled:opacity-50"
            >
              {isTesting ? (
                <div className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin mr-2"></div>
              ) : (
                <Send className="w-5 h-5 mr-2" />
              )}
              Testar Conexão
            </button>
          </div>
        )}
      </form>
    </div>
  );
};
