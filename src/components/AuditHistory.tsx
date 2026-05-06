import React, { useState, useMemo } from 'react';
import { History, Search, Filter, Download, ArrowUpDown, ArrowUp, ArrowDown, Shield, User, Clock, FileText, Info } from 'lucide-react';
import { AuditLog, AuditAction, UserRole } from '../types';
import { useLanguage } from '../i18n/LanguageContext';

interface AuditHistoryProps {
  logs: AuditLog[];
  theme: 'light' | 'dark';
}

export const AuditHistory: React.FC<AuditHistoryProps> = ({ logs, theme }) => {
  const { t, language } = useLanguage();
  const [filterText, setFilterText] = useState('');
  const [filterAction, setFilterAction] = useState<string>('');
  const [filterEntity, setFilterEntity] = useState<string>('');
  const [sortKey, setSortKey] = useState<keyof AuditLog>('timestamp');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const entities = useMemo(() => {
    const set = new Set(logs.map(l => l.entityType));
    return Array.from(set).sort();
  }, [logs]);

  const actions: AuditAction[] = ['CREATE', 'DELETE', 'UPDATE', 'LOGIN', 'LOGOUT'];

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchText = log.userName.toLowerCase().includes(filterText.toLowerCase()) || 
                       log.entityName.toLowerCase().includes(filterText.toLowerCase()) ||
                       log.details?.toLowerCase().includes(filterText.toLowerCase());
      const matchAction = filterAction ? log.action === filterAction : true;
      const matchEntity = filterEntity ? log.entityType === filterEntity : true;
      return matchText && matchAction && matchEntity;
    }).sort((a, b) => {
      let valA = a[sortKey] || '';
      let valB = b[sortKey] || '';
      
      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [logs, filterText, filterAction, filterEntity, sortKey, sortDirection]);

  const handleSort = (key: keyof AuditLog) => {
    if (sortKey === key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ columnKey }: { columnKey: keyof AuditLog }) => {
    if (sortKey !== columnKey) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-30" />;
    return sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 ml-1 text-blue-600" /> : <ArrowDown className="w-3 h-3 ml-1 text-blue-600" />;
  };

  const formatDate = (isoString: string) => {
    return new Intl.DateTimeFormat(language, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date(isoString));
  };

  const getActionColor = (action: AuditAction) => {
    switch (action) {
      case 'CREATE': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'DELETE': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'UPDATE': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-4 items-start md:items-center">
        <div>
          <h2 className={`text-2xl font-bold flex items-center gap-2 ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>
            <Shield className="text-blue-500" />
            {t('auditLog').toUpperCase()}
          </h2>
          <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>
            {t('auditLogDescription')}
          </p>
        </div>
        
        <button 
          onClick={() => {
            const csv = [
              ['Timestamp', 'User', 'Action', 'EntityType', 'EntityName', 'Details'].join(','),
              ...filteredLogs.map(l => [
                l.timestamp,
                l.userName,
                l.action,
                l.entityType,
                l.entityName,
                `"${l.details || ''}"`
              ].join(','))
            ].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
          }}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all font-medium text-sm gap-2"
        >
          <Download className="w-4 h-4" />
          {t('exportCSV')}
        </button>
      </div>

      <div className={`p-6 rounded-2xl ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-gray-100'} border shadow-sm space-y-4`}>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative col-span-2">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('searchLogs')}
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl border ${theme === 'dark' ? 'bg-black border-slate-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'} focus:ring-2 focus:ring-blue-500 outline-none`}
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl border ${theme === 'dark' ? 'bg-black border-slate-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'} focus:ring-2 focus:ring-blue-500 outline-none appearance-none`}
            >
              <option value="">{t('allActions')}</option>
              {actions.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          <div className="relative">
            <Info className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <select
              value={filterEntity}
              onChange={(e) => setFilterEntity(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl border ${theme === 'dark' ? 'bg-black border-slate-700 text-white' : 'bg-gray-50 border-gray-200 text-gray-800'} focus:ring-2 focus:ring-blue-500 outline-none appearance-none`}
            >
              <option value="">{t('allEntities')}</option>
              {entities.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-100 dark:border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`${theme === 'dark' ? 'bg-black text-slate-400' : 'bg-gray-50 text-gray-500'} text-xs uppercase tracking-wider`}>
                <th className="px-4 py-3 font-semibold cursor-pointer" onClick={() => handleSort('timestamp')}>
                  <div className="flex items-center">{t('timestamp')} <SortIcon columnKey="timestamp" /></div>
                </th>
                <th className="px-4 py-3 font-semibold cursor-pointer" onClick={() => handleSort('userName')}>
                  <div className="flex items-center">{t('user')} <SortIcon columnKey="userName" /></div>
                </th>
                <th className="px-4 py-3 font-semibold cursor-pointer" onClick={() => handleSort('action')}>
                  <div className="flex items-center">{t('action')} <SortIcon columnKey="action" /></div>
                </th>
                <th className="px-4 py-3 font-semibold cursor-pointer" onClick={() => handleSort('entityType')}>
                  <div className="flex items-center">{t('entity')} <SortIcon columnKey="entityType" /></div>
                </th>
                <th className="px-4 py-3 font-semibold">{t('details')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className={`${theme === 'dark' ? 'hover:bg-slate-800/50' : 'hover:bg-gray-50'} transition-colors`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-gray-400" />
                      <span className={`text-xs font-mono ${theme === 'dark' ? 'text-slate-300' : 'text-gray-600'}`}>
                        {formatDate(log.timestamp)}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${theme === 'dark' ? 'bg-slate-800 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                        {log.userName.charAt(0).toUpperCase()}
                      </div>
                      <span className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-200' : 'text-gray-700'}`}>
                        {log.userName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-gray-400" />
                      <span className={`text-xs font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                        {log.entityType}: {log.entityName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className={`text-xs italic ${theme === 'dark' ? 'text-slate-500' : 'text-gray-500'} max-w-xs truncate`} title={log.details}>
                      {log.details || '-'}
                    </p>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    <History className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p>{t('noLogsFound')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
