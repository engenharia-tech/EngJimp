import React, { useState, useMemo } from 'react';
import { 
  Search, 
  TrendingUp, 
  Globe, 
  Link as LinkIcon, 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  BarChart3, 
  Plus, 
  Trash2, 
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Filter,
  Download
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { SEOData, SEOKeyword, SEOMetric, SEOTask, User } from '../types';

interface SEOManagerProps {
  data?: SEOData;
  currentUser: User;
  theme: 'light' | 'dark';
}

const MOCK_METRICS: SEOMetric[] = [
  { date: '2026-01-01', domainAuthority: 24, organicTraffic: 1200, backlinks: 450 },
  { date: '2026-01-15', domainAuthority: 24, organicTraffic: 1350, backlinks: 465 },
  { date: '2026-02-01', domainAuthority: 25, organicTraffic: 1500, backlinks: 480 },
  { date: '2026-02-15', domainAuthority: 25, organicTraffic: 1800, backlinks: 510 },
  { date: '2026-03-01', domainAuthority: 26, organicTraffic: 2100, backlinks: 540 },
  { date: '2026-03-15', domainAuthority: 27, organicTraffic: 2450, backlinks: 580 },
];

const MOCK_KEYWORDS: SEOKeyword[] = [
  { id: '1', keyword: 'projeto engenharia mecânica', rank: 3, volume: 1200, difficulty: 45, lastUpdated: '2026-03-10' },
  { id: '2', keyword: 'gestão de projetos industriais', rank: 5, volume: 850, difficulty: 60, lastUpdated: '2026-03-12' },
  { id: '3', keyword: 'rastreador de tempo engenharia', rank: 1, volume: 450, difficulty: 30, lastUpdated: '2026-03-15' },
  { id: '4', keyword: 'otimização de processos fábrica', rank: 12, volume: 320, difficulty: 55, lastUpdated: '2026-03-08' },
  { id: '5', keyword: 'consultoria engenharia jimp', rank: 2, volume: 150, difficulty: 20, lastUpdated: '2026-03-14' },
];

const MOCK_TASKS: SEOTask[] = [
  { id: '1', title: 'Otimizar meta tags da página inicial', status: 'DONE', priority: 'HIGH' },
  { id: '2', title: 'Criar conteúdo sobre "Otimização de Processos"', status: 'IN_PROGRESS', priority: 'MEDIUM' },
  { id: '3', title: 'Corrigir links quebrados no blog', status: 'TODO', priority: 'HIGH' },
  { id: '4', title: 'Melhorar velocidade de carregamento mobile', status: 'TODO', priority: 'MEDIUM' },
  { id: '5', title: 'Adicionar schema markup para serviços', status: 'DONE', priority: 'LOW' },
];

export const SEOManager: React.FC<SEOManagerProps> = ({ data, currentUser, theme }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'keywords' | 'tasks'>('overview');
  const [keywords, setKeywords] = useState<SEOKeyword[]>(data?.keywords || MOCK_KEYWORDS);
  const [tasks, setTasks] = useState<SEOTask[]>(data?.tasks || MOCK_TASKS);
  const [metrics] = useState<SEOMetric[]>(data?.metrics || MOCK_METRICS);
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newKeyword, setNewKeyword] = useState({ term: '', volume: '', difficulty: 50 });
  const [newTask, setNewTask] = useState({ title: '', priority: 'MEDIUM' as SEOTask['priority'] });

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault();
    const keyword: SEOKeyword = {
      id: Math.random().toString(36).substr(2, 9),
      keyword: newKeyword.term,
      volume: parseInt(newKeyword.volume) || 0,
      difficulty: newKeyword.difficulty,
      rank: Math.floor(Math.random() * 100) + 1,
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    setKeywords([keyword, ...keywords]);
    setIsAddingKeyword(false);
    setNewKeyword({ term: '', volume: '', difficulty: 50 });
    setActiveTab('keywords');
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    const task: SEOTask = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTask.title,
      priority: newTask.priority,
      status: 'TODO'
    };
    setTasks([task, ...tasks]);
    setIsAddingTask(false);
    setNewTask({ title: '', priority: 'MEDIUM' });
    setActiveTab('tasks');
  };

  const handleDeleteKeyword = (id: string) => {
    setKeywords(keywords.filter(k => k.id !== id));
  };

  const handleDeleteTask = (id: string) => {
    setTasks(tasks.filter(t => t.id !== id));
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(tasks.map(t => t.id === id ? { ...t, status: t.status === 'DONE' ? 'TODO' : 'DONE' } : t));
  };

  const currentMetrics = metrics[metrics.length - 1];
  const previousMetrics = metrics[metrics.length - 2];

  const calculateChange = (current: number, previous: number) => {
    const change = ((current - previous) / previous) * 100;
    return change.toFixed(1);
  };

  const StatCard = ({ title, value, previousValue, icon: Icon, color }: any) => {
    const change = calculateChange(value, previousValue);
    const isPositive = parseFloat(change) >= 0;

    return (
      <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className={`flex items-center text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
            {isPositive ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
            {Math.abs(parseFloat(change))}%
          </div>
        </div>
        <h3 className={`text-sm font-medium ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} mb-1`}>{title}</h3>
        <p className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{value.toLocaleString()}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Otimização de Busca (SEO)</h2>
          <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>Gerencie a visibilidade online e performance de busca.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium border ${theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-gray-200 hover:bg-gray-50 text-gray-600'} transition-colors`}>
            <Download className="w-4 h-4 mr-2" />
            Exportar Relatório
          </button>
          <button 
            onClick={() => setIsAddingKeyword(true)}
            className="flex items-center px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nova Análise
          </button>
        </div>
      </div>

      {/* New Analysis Modal */}
      {isAddingKeyword && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Search className="w-5 h-5 text-blue-500" />
                Nova Análise de Palavra-chave
              </h3>
              <button onClick={() => setIsAddingKeyword(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddKeyword} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Palavra-chave</label>
                <input 
                  type="text" 
                  required
                  value={newKeyword.term}
                  onChange={e => setNewKeyword({...newKeyword, term: e.target.value})}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                  placeholder="Ex: carreta sider 3 eixos"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Volume Mensal</label>
                  <input 
                    type="text" 
                    value={newKeyword.volume}
                    onChange={e => setNewKeyword({...newKeyword, volume: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                    placeholder="Ex: 1200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Dificuldade (0-100)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    value={newKeyword.difficulty}
                    onChange={e => setNewKeyword({...newKeyword, difficulty: parseInt(e.target.value)})}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddingKeyword(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition font-medium shadow-lg shadow-blue-500/20"
                >
                  Iniciar Análise
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Task Modal */}
      {isAddingTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                Nova Tarefa SEO
              </h3>
              <button onClick={() => setIsAddingTask(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddTask} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Título da Tarefa</label>
                <input 
                  type="text" 
                  required
                  value={newTask.title}
                  onChange={e => setNewTask({...newTask, title: e.target.value})}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition text-gray-900 dark:text-white"
                  placeholder="Ex: Otimizar imagens do blog"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Prioridade</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['LOW', 'MEDIUM', 'HIGH'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewTask({...newTask, priority: p})}
                      className={`py-2 rounded-lg text-xs font-bold transition-all border ${
                        newTask.priority === p 
                          ? p === 'HIGH' ? 'bg-red-50 border-red-200 text-red-600' : p === 'MEDIUM' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-blue-50 border-blue-200 text-blue-600'
                          : 'bg-transparent border-gray-200 dark:border-slate-700 text-gray-400'
                      }`}
                    >
                      {p === 'HIGH' ? 'ALTA' : p === 'MEDIUM' ? 'MÉDIA' : 'BAIXA'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddingTask(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition font-medium shadow-lg shadow-emerald-500/20"
                >
                  Criar Tarefa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <div className="flex p-1 bg-gray-100 dark:bg-slate-900 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
        >
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('keywords')}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'keywords' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
        >
          Palavras-Chave
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'tasks' ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
        >
          Checklist SEO
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              title="Autoridade do Domínio" 
              value={currentMetrics.domainAuthority} 
              previousValue={previousMetrics.domainAuthority}
              icon={Globe}
              color="bg-indigo-500"
            />
            <StatCard 
              title="Tráfego Orgânico" 
              value={currentMetrics.organicTraffic} 
              previousValue={previousMetrics.organicTraffic}
              icon={TrendingUp}
              color="bg-blue-500"
            />
            <StatCard 
              title="Backlinks Totais" 
              value={currentMetrics.backlinks} 
              previousValue={previousMetrics.backlinks}
              icon={LinkIcon}
              color="bg-violet-500"
            />
          </div>

          <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
            <div className="flex justify-between items-center mb-6">
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Crescimento de Tráfego</h3>
              <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                Sessões Orgânicas
              </div>
            </div>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics}>
                  <defs>
                    <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1e293b' : '#f1f5f9'} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 12 }}
                    tickFormatter={(str) => new Date(str).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 12 }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#0f172a' : '#fff',
                      borderColor: theme === 'dark' ? '#1e293b' : '#e2e8f0',
                      borderRadius: '12px',
                      color: theme === 'dark' ? '#fff' : '#000'
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="organicTraffic" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    fillOpacity={1} 
                    fill="url(#colorTraffic)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'keywords' && (
        <div className={`rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'} overflow-hidden`}>
          <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
            <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Monitoramento de Palavras-Chave</h3>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Buscar palavra..."
                className={`pl-9 pr-4 py-2 rounded-lg text-sm border ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-gray-50 border-gray-200'} focus:ring-2 focus:ring-blue-500 outline-none`}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className={`${theme === 'dark' ? 'bg-slate-800/50 text-slate-400' : 'bg-gray-50 text-gray-500'} text-xs uppercase tracking-wider font-bold`}>
                  <th className="px-6 py-4">Palavra-Chave</th>
                  <th className="px-6 py-4">Posição</th>
                  <th className="px-6 py-4">Volume</th>
                  <th className="px-6 py-4">Dificuldade</th>
                  <th className="px-6 py-4">Última Atualização</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                {keywords.map((kw) => (
                  <tr key={kw.id} className={`hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors`}>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <span className={`font-medium ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{kw.keyword}</span>
                        <ExternalLink className="w-3 h-3 ml-2 text-gray-400 cursor-pointer hover:text-blue-500" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        kw.rank <= 3 ? 'bg-emerald-100 text-emerald-700' : 
                        kw.rank <= 10 ? 'bg-blue-100 text-blue-700' : 
                        'bg-gray-100 text-gray-700'
                      }`}>
                        #{kw.rank}
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-slate-300' : 'text-gray-600'}`}>
                      {kw.volume.toLocaleString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 max-w-[100px]">
                        <div 
                          className={`h-1.5 rounded-full ${
                            kw.difficulty > 70 ? 'bg-red-500' : 
                            kw.difficulty > 40 ? 'bg-orange-500' : 
                            'bg-emerald-500'
                          }`} 
                          style={{ width: `${kw.difficulty}%` }}
                        ></div>
                      </div>
                    </td>
                    <td className={`px-6 py-4 text-sm ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}`}>
                      {new Date(kw.lastUpdated).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDeleteKeyword(kw.id)}
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
                <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Tarefas de Otimização</h3>
                <button 
                    onClick={() => setIsAddingTask(true)}
                    className="flex items-center px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all"
                >
                    <Plus className="w-3 h-3 mr-1" />
                    Nova Tarefa
                </button>
            </div>
            {tasks.map((task) => (
              <div 
                key={task.id} 
                className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                  theme === 'dark' 
                    ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700' 
                    : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                }`}
              >
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => toggleTaskStatus(task.id)}
                    className={`p-1 rounded-md transition-colors ${
                      task.status === 'DONE' 
                        ? 'text-emerald-500 bg-emerald-50' 
                        : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-50'
                    }`}
                  >
                    <CheckCircle2 className="w-6 h-6" />
                  </button>
                  <div>
                    <p className={`font-medium ${task.status === 'DONE' ? 'line-through text-gray-400' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        task.priority === 'HIGH' ? 'bg-red-100 text-red-600' :
                        task.priority === 'MEDIUM' ? 'bg-orange-100 text-orange-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {task.priority === 'HIGH' ? 'ALTA' : task.priority === 'MEDIUM' ? 'MÉDIA' : 'BAIXA'}
                      </span>
                      <span className="text-[10px] text-gray-400 flex items-center">
                        <Clock className="w-3 h-3 mr-1" />
                        Status: {task.status === 'DONE' ? 'Concluído' : task.status === 'IN_PROGRESS' ? 'Em Andamento' : 'A Fazer'}
                      </span>
                    </div>
                  </div>
                </div>
                <button 
                    onClick={() => handleDeleteTask(task.id)}
                    className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          <div className="space-y-6">
            <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'} mb-4`}>Saúde do Site</h3>
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full" viewBox="0 0 36 36">
                    <path
                      className="text-gray-200 dark:text-slate-800"
                      strokeDasharray="100, 100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    />
                    <path
                      className="text-emerald-500"
                      strokeDasharray="85, 100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>85%</span>
                    <span className="text-[10px] text-gray-500 font-bold uppercase">Ótimo</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Páginas Indexadas</span>
                  <span className="font-bold text-blue-600">124</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Erros de Crawl</span>
                  <span className="font-bold text-red-500">2</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avisos</span>
                  <span className="font-bold text-orange-500">12</span>
                </div>
              </div>
            </div>

            <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-blue-900/20 border-blue-800/50' : 'bg-blue-50 border-blue-100'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300">Dica de SEO</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1 leading-relaxed">
                    Você tem 3 palavras-chave na posição #2. Tente adicionar mais links internos para essas páginas para subir para o #1.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
