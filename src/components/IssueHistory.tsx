import React, { useState, useMemo, useEffect } from 'react';
import { Search, AlertTriangle, Calendar, User as UserIcon, Trash2, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { AppState, IssueType, User } from '../types';
import { ISSUE_TYPES } from '../constants';
import { fetchUsers } from '../services/storageService';

interface IssueHistoryProps {
  data: AppState;
  currentUser: User;
  onDelete?: (id: string) => void;
}

export const IssueHistory: React.FC<IssueHistoryProps> = ({ data, currentUser, onDelete }) => {
  const [filterNs, setFilterNs] = useState('');
  const [filterType, setFilterType] = useState<string>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [usersMap, setUsersMap] = useState<Record<string, string>>({});

  // Sorting State
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const load = async () => {
      const users = await fetchUsers();
      const map = users.reduce((acc, u) => ({ ...acc, [u.id]: u.name }), {} as Record<string, string>);
      setUsersMap(map);
    };
    load();
  }, []);

  const filteredIssues = useMemo(() => {
    const filtered = data.issues.filter(issue => {
      const matchNs = issue.projectNs.toLowerCase().includes(filterNs.toLowerCase());
      const matchType = filterType ? issue.type === filterType : true;
      
      let matchDate = true;
      if (startDate || endDate) {
        const iDate = new Date(issue.date).getTime();
        const start = startDate ? new Date(startDate).getTime() : 0;
        const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : Infinity;
        matchDate = iDate >= start && iDate <= end;
      }

      return matchNs && matchType && matchDate;
    });

    return filtered.sort((a, b) => {
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
  }, [data.issues, filterNs, filterType, startDate, endDate, sortOrder]);

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const isGestor = currentUser.role === 'GESTOR';

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder="Buscar erro por NS..."
            value={filterNs}
            onChange={(e) => setFilterNs(e.target.value)}
            className="w-full pl-10 p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-200"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none bg-white dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="">Todos os Tipos de Erro</option>
          {ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>

        <div className="flex items-center gap-2">
            <span className="text-xs text-black dark:text-white">De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm bg-white dark:bg-slate-800 dark:text-slate-200"
            />
        </div>

        <div className="flex items-center gap-2">
            <span className="text-xs text-black dark:text-white">Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full p-2 border dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-red-500 outline-none text-sm bg-white dark:bg-slate-800 dark:text-slate-200"
            />
        </div>
      </div>

      <div className="flex justify-end">
          <button 
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg text-sm text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            {sortOrder === 'asc' ? <ArrowUp className="w-4 h-4" /> : <ArrowDown className="w-4 h-4" />}
            Ordenar por Data: {sortOrder === 'asc' ? 'Mais Antigos' : 'Mais Recentes'}
          </button>
      </div>

      {/* List */}
      <div className="space-y-4">
        {filteredIssues.length > 0 ? (
          filteredIssues.map((issue) => (
            <div key={issue.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow relative group">
              {isGestor && onDelete && (
                <button 
                  onClick={() => onDelete(issue.id)}
                  className="absolute top-4 right-4 text-gray-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded transition"
                  title="Excluir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <div className="flex justify-between items-start mb-2 pr-10">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-1 rounded text-xs font-bold bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-100 dark:border-red-800`}>
                    {issue.type}
                  </span>
                  <span className="font-mono font-bold text-gray-800 dark:text-slate-200">NS: {issue.projectNs}</span>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center text-xs text-gray-400 dark:text-slate-500">
                    <Calendar className="w-3 h-3 mr-1" />
                    {formatDate(issue.date)}
                  </div>
                  {isGestor && issue.reportedBy && (
                    <div className="flex items-center text-xs text-gray-500 dark:text-slate-400 font-medium">
                      <UserIcon className="w-3 h-3 mr-1" />
                      Reportado por: {usersMap[issue.reportedBy] || 'Desconhecido'}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <h4 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-1">O que aconteceu:</h4>
                <p className="text-gray-700 dark:text-slate-300 text-sm leading-relaxed bg-gray-50 dark:bg-slate-900/50 p-3 rounded-lg border border-gray-100 dark:border-slate-700">
                  {issue.description}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-gray-200 dark:border-slate-700">
            <AlertTriangle className="w-8 h-8 mx-auto text-gray-300 dark:text-slate-600 mb-2" />
            <p className="text-gray-500 dark:text-slate-400">Nenhum problema encontrado com os filtros atuais.</p>
          </div>
        )}
      </div>
    </div>
  );
};
