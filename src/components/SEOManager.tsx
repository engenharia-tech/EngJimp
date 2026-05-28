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
  Download,
  SlidersHorizontal,
  FileSpreadsheet,
  Check,
  Calendar,
  Sparkles
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart, 
  Area 
} from 'recharts';
import { SEOData, SEOKeyword, SEOMetric, SEOTask, User } from '../types';
import { useAppState } from '../contexts/StateContext';
import { saveSEOKeywords, saveSEOTasks, saveSEOMetrics } from '../services/storageService';

interface SEOManagerProps {
  data?: SEOData;
  currentUser: User;
  theme: 'light' | 'dark';
}

const MOCK_METRICS: SEOMetric[] = [
  { date: '2025-12-01', domainAuthority: 10, organicTraffic: 0, backlinks: 5 },
  { date: '2025-12-15', domainAuthority: 15, organicTraffic: 110, backlinks: 18 },
  { date: '2026-01-01', domainAuthority: 18, organicTraffic: 260, backlinks: 35 },
  { date: '2026-01-15', domainAuthority: 20, organicTraffic: 480, backlinks: 58 },
  { date: '2026-02-01', domainAuthority: 22, organicTraffic: 790, backlinks: 92 },
  { date: '2026-02-15', domainAuthority: 24, organicTraffic: 1150, backlinks: 140 },
  { date: '2026-03-01', domainAuthority: 25, organicTraffic: 1620, backlinks: 210 },
  { date: '2026-03-15', domainAuthority: 26, organicTraffic: 2100, backlinks: 295 },
  { date: '2026-04-01', domainAuthority: 27, organicTraffic: 2700, backlinks: 380 },
  { date: '2026-04-15', domainAuthority: 28, organicTraffic: 3250, backlinks: 460 },
  { date: '2026-05-01', domainAuthority: 29, organicTraffic: 3750, backlinks: 580 },
  { date: '2026-05-15', domainAuthority: 30, organicTraffic: 4200, backlinks: 690 },
  { date: '2026-05-28', domainAuthority: 31, organicTraffic: 4500, backlinks: 810 },
];

const MOCK_KEYWORDS: SEOKeyword[] = [
  { id: '1', keyword: 'projeto engenharia mecânica', rank: 3, volume: 1200, difficulty: 45, lastUpdated: '2026-05-20' },
  { id: '2', keyword: 'gestão de projetos industriais', rank: 4, volume: 850, difficulty: 60, lastUpdated: '2026-05-22' },
  { id: '3', keyword: 'rastreador de tempo engenharia', rank: 1, volume: 450, difficulty: 30, lastUpdated: '2026-05-28' },
  { id: '4', keyword: 'otimização de processos fábrica', rank: 9, volume: 320, difficulty: 55, lastUpdated: '2026-05-18' },
  { id: '5', keyword: 'consultoria engenharia jimp', rank: 2, volume: 150, difficulty: 20, lastUpdated: '2026-05-25' },
  { id: '6', keyword: 'sistemas de exaustão industrial', rank: 14, volume: 590, difficulty: 72, lastUpdated: '2026-05-24' },
  { id: '7', keyword: 'maquinas especiais sob medida', rank: 7, volume: 210, difficulty: 42, lastUpdated: '2026-05-26' },
];

const MOCK_TASKS: SEOTask[] = [
  { id: '1', title: 'Otimizar meta tags da página inicial e contatos', status: 'DONE', priority: 'HIGH' },
  { id: '2', title: 'Criar landing page sobre "Otimização de Processos Industriais"', status: 'IN_PROGRESS', priority: 'MEDIUM' },
  { id: '3', title: 'Corrigir links quebrados apontando para projetos antigos', status: 'TODO', priority: 'HIGH' },
  { id: '4', title: 'Melhorar velocidade de carregamento Core Web Vitals no mobile', status: 'TODO', priority: 'MEDIUM' },
  { id: '5', title: 'Adicionar schema markup de Local Business para a sede', status: 'DONE', priority: 'LOW' },
  { id: '6', title: 'Produzir série de artigos técnicos de engenharia mecânica', status: 'TODO', priority: 'HIGH' },
];

export const SEOManager: React.FC<SEOManagerProps> = ({ currentUser, theme }) => {
  const { data, setData } = useAppState();
  const [activeTab, setActiveTab ] = useState<'overview' | 'keywords' | 'tasks'>('overview');
  const [chartView, setChartView] = useState<'daily' | 'monthly'>('daily');
  
  const seoData = useMemo(() => data?.seoData || { keywords: [], metrics: [], tasks: [] }, [data?.seoData]);

  const keywords = useMemo(() => seoData.keywords.length > 0 ? seoData.keywords : MOCK_KEYWORDS, [seoData.keywords]);
  const tasks = useMemo(() => seoData.tasks.length > 0 ? seoData.tasks : MOCK_TASKS, [seoData.tasks]);
  const metrics = useMemo(() => seoData.metrics.length > 0 ? seoData.metrics : MOCK_METRICS, [seoData.metrics]);

  const chartData = useMemo(() => {
    // Generate the last 12 months keys leading up to May 2026 (current time is 2026-05-28)
    const currentDate = new Date('2026-05-28T12:00:00');
    const monthKeys: string[] = [];
    
    for (let i = 11; i >= 0; i--) {
      const d = new Date(currentDate);
      d.setMonth(currentDate.getMonth() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      monthKeys.push(`${year}-${month}`);
    }

    if (chartView === 'daily') {
      // Return sorted metrics chronologically
      const sortedMetrics = [...metrics].sort((a, b) => a.date.localeCompare(b.date));
      
      // Anchor the chart 1 year ago at the start of our 12-month window ("2025-06-01") 
      // if the first metric starts later. It creates a flat 0 baseline line up to the launch date,
      // where the first real data point appears in December 2025 and daily nodes take off!
      if (sortedMetrics.length > 0) {
        const firstDate = sortedMetrics[0].date;
        const targetStartDate = `${monthKeys[0]}-01`; // "2025-06-01"
        if (firstDate > targetStartDate) {
          return [
            { date: targetStartDate, domainAuthority: 0, organicTraffic: 0, backlinks: 0, isPlaceholder: true },
            ...sortedMetrics
          ];
        }
      }
      return sortedMetrics;
    }

    // "monthly" view: Group metrics by month for the generated 12-month keys
    const monthlyGroups: { 
      [key: string]: { 
        domainAuthoritySum: number; 
        organicTrafficSum: number; 
        backlinksSum: number; 
        count: number; 
      } 
    } = {};
    
    // Initialize monthlyGroups with all 12 month keys to guarantee a 1-year timeline
    monthKeys.forEach(mKey => {
      monthlyGroups[mKey] = {
        domainAuthoritySum: 0,
        organicTrafficSum: 0,
        backlinksSum: 0,
        count: 0
      };
    });

    metrics.forEach(m => {
      if (!m.date) return;
      const monthKey = m.date.substring(0, 7); // "YYYY-MM"
      if (monthlyGroups[monthKey] !== undefined) {
        monthlyGroups[monthKey].domainAuthoritySum += m.domainAuthority;
        monthlyGroups[monthKey].organicTrafficSum += m.organicTraffic;
        monthlyGroups[monthKey].backlinksSum += m.backlinks;
        monthlyGroups[monthKey].count += 1;
      }
    });

    const monthNamesPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    return monthKeys.map(mKey => {
      const g = monthlyGroups[mKey];
      const [yearStr, monthStr] = mKey.split('-');
      const monthIndex = parseInt(monthStr) - 1;
      const ptMonth = monthNamesPt[monthIndex] || monthStr;
      const shortYear = yearStr.substring(2);

      const hasData = g.count > 0;
      
      return {
        date: `${mKey}-15`, // midpoint representing the month
        formattedMonth: `${ptMonth}/${shortYear}`,
        domainAuthority: hasData ? Math.round(g.domainAuthoritySum / g.count) : 0,
        organicTraffic: hasData ? Math.round(g.organicTrafficSum / g.count) : 0,
        backlinks: hasData ? Math.round(g.backlinksSum / g.count) : 0,
        isMonthlyGroup: true,
        isEmpty: !hasData
      };
    });
  }, [metrics, chartView]);

  // Modals & Forms
  const [isAddingKeyword, setIsAddingKeyword] = useState(false);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isAddingMetric, setIsAddingMetric] = useState(false);

  const [newKeyword, setNewKeyword] = useState({ term: '', volume: '', difficulty: 50 });
  const [newTask, setNewTask] = useState({ title: '', priority: 'MEDIUM' as SEOTask['priority'] });
  const [newMetric, setNewMetric] = useState({
    date: '2026-05-28', // Default to current system date
    domainAuthority: '',
    organicTraffic: '',
    backlinks: ''
  });

  // Filtering & Sorting State for Keywords
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState<'ALL' | 'EASY' | 'MEDIUM' | 'HARD'>('ALL');
  const [rankFilter, setRankFilter] = useState<'ALL' | 'TOP3' | 'TOP10' | 'PRIMEIRA_PAGINA'>('ALL');
  const [sortBy, setSortBy] = useState<'keyword' | 'rank' | 'volume' | 'difficulty'>('rank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Interactive tips indicator
  const [selectedTipsKeyword, setSelectedTipsKeyword] = useState<string | null>(null);

  // Dynamic Keyword list processing
  const filteredKeywords = useMemo(() => {
    let result = [...keywords];

    // Search query
    if (searchTerm.trim() !== '') {
      result = result.filter(k => k.keyword.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // Difficulty filter
    if (difficultyFilter !== 'ALL') {
      result = result.filter(k => {
        if (difficultyFilter === 'EASY') return k.difficulty <= 40;
        if (difficultyFilter === 'MEDIUM') return k.difficulty > 40 && k.difficulty <= 70;
        return k.difficulty > 70;
      });
    }

    // Rank filter
    if (rankFilter !== 'ALL') {
      result = result.filter(k => {
        if (rankFilter === 'TOP3') return k.rank <= 3;
        if (rankFilter === 'TOP10') return k.rank <= 10;
        return k.rank <= 20; // Первая страница (Top 20 / standard page index)
      });
    }

    // Sort
    result.sort((a, b) => {
      let valA: any = a[sortBy];
      let valB: any = b[sortBy];

      if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [keywords, searchTerm, difficultyFilter, rankFilter, sortBy, sortOrder]);

  const handleAddKeyword = async (e: React.FormEvent) => {
    e.preventDefault();
    const keyword: SEOKeyword = {
      id: Math.random().toString(36).substr(2, 9),
      keyword: newKeyword.term,
      volume: parseInt(newKeyword.volume) || 0,
      difficulty: newKeyword.difficulty,
      rank: Math.floor(Math.random() * 90) + 1, // Start with a random ranking
      lastUpdated: new Date().toISOString().split('T')[0]
    };
    const updatedKeywords = [keyword, ...keywords];
    
    // Update local context
    setData(prev => ({
      ...prev,
      seoData: {
        ...seoData,
        keywords: updatedKeywords
      }
    }));
    
    // Save to DB
    await saveSEOKeywords(updatedKeywords);

    setIsAddingKeyword(false);
    setNewKeyword({ term: '', volume: '', difficulty: 50 });
    setActiveTab('keywords');
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const task: SEOTask = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTask.title,
      priority: newTask.priority,
      status: 'TODO'
    };
    const updatedTasks = [task, ...tasks];

    // Update local context
    setData(prev => ({
      ...prev,
      seoData: {
        ...seoData,
        tasks: updatedTasks
      }
    }));

    // Save to DB
    await saveSEOTasks(updatedTasks);

    setIsAddingTask(false);
    setNewTask({ title: '', priority: 'MEDIUM' });
    setActiveTab('tasks');
  };

  const handleAddMetric = async (e: React.FormEvent) => {
    e.preventDefault();
    const da = parseInt(newMetric.domainAuthority) || (metrics.length > 0 ? metrics[metrics.length - 1].domainAuthority : 25);
    const traffic = parseInt(newMetric.organicTraffic) || 0;
    const backs = parseInt(newMetric.backlinks) || 0;

    const metric: SEOMetric = {
      date: newMetric.date || new Date().toISOString().split('T')[0],
      domainAuthority: da,
      organicTraffic: traffic,
      backlinks: backs
    };

    // Replace if date already exists to prevent duplicate timeline items
    const existingIndex = metrics.findIndex(m => m.date === metric.date);
    let updatedMetrics = [...metrics];
    if (existingIndex >= 0) {
      updatedMetrics[existingIndex] = metric;
    } else {
      updatedMetrics.push(metric);
    }

    // Sort chronologically
    updatedMetrics.sort((a, b) => a.date.localeCompare(b.date));

    // Update local context
    setData(prev => ({
      ...prev,
      seoData: {
        ...seoData,
        metrics: updatedMetrics
      }
    }));

    // Save to DB
    await saveSEOMetrics(updatedMetrics);

    setIsAddingMetric(false);
    // Reset form but keep DA cached for ease
    setNewMetric({
      date: '2026-05-28',
      domainAuthority: da.toString(),
      organicTraffic: '',
      backlinks: ''
    });
  };

  const handleDeleteKeyword = async (id: string) => {
    const updatedKeywords = keywords.filter(k => k.id !== id);
    
    setData(prev => ({
      ...prev,
      seoData: {
        ...seoData,
        keywords: updatedKeywords
      }
    }));

    await saveSEOKeywords(updatedKeywords);
  };

  const handleDeleteTask = async (id: string) => {
    const updatedTasks = tasks.filter(t => t.id !== id);
    
    setData(prev => ({
      ...prev,
      seoData: {
        ...seoData,
        tasks: updatedTasks
      }
    }));

    await saveSEOTasks(updatedTasks);
  };

  const toggleTaskStatus = async (id: string) => {
    const updatedTasks = tasks.map(t => t.id === id ? { ...t, status: t.status === 'DONE' ? 'TODO' : 'DONE' } : t);
    
    setData(prev => ({
      ...prev,
      seoData: {
        ...seoData,
        tasks: updatedTasks
      }
    }));

    await saveSEOTasks(updatedTasks);
  };

  const currentMetrics = useMemo(() => {
    return metrics[metrics.length - 1] || { domainAuthority: 30, organicTraffic: 4000, backlinks: 750 };
  }, [metrics]);

  const previousMetrics = useMemo(() => {
    return metrics[metrics.length - 2] || metrics[metrics.length - 1] || { domainAuthority: 29, organicTraffic: 3900, backlinks: 720 };
  }, [metrics]);

  const calculateChange = (current: number, previous: number) => {
    if (!previous) return '0.0';
    const change = ((current - previous) / previous) * 100;
    return change.toFixed(1);
  };

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Recommendations generator
  const getRecommendation = (rank: number, difficulty: number) => {
    if (rank === 1) {
      return {
        tip: 'Posição #1 mantida! Excelente. Foque em manter frescor de conteúdo histórico e monitore backlinks industriais concorrentes quinzenalmente.',
        accent: 'text-emerald-500 dark:text-emerald-400',
        action: 'Manutenção Preventiva'
      };
    }
    if (rank <= 3) {
      return {
        tip: 'Top 3! Pequenos ajustes nos títulos H2 e inserção de 2 ou 3 links internos ricos de páginas pilares podem disparar essa página para o ranking #1.',
        accent: 'text-blue-500 dark:text-blue-400',
        action: 'Link Building Interno'
      };
    }
    if (rank <= 10) {
      if (difficulty <= 40) {
        return {
          tip: 'Fácil escalada! Dificuldade baixa. Enriquecer o documento com FAQs, tabelas estruturadas ou parágrafos técnicos diretos forçará o Google a impulsionar o índice.',
          accent: 'text-teal-500 dark:text-teal-400',
          action: 'Otimização On-Page'
        };
      }
      return {
        tip: 'Meio da primeira página. Palavra exigente. Considere adicionar um vídeo rápido explicativo ou expandir o cluster de tópicos secundários no blog institucional.',
        accent: 'text-indigo-500 dark:text-indigo-400',
        action: 'Topic Clustering'
      };
    }
    // rank > 10
    if (difficulty <= 45) {
      return {
        tip: 'Oportunidade de ouro! Dificuldade baixa mas fora do top 10. Corrija o tempo de carregamento da URL e insira a palavra-chave exata na primeira frase do artigo.',
        accent: 'text-amber-500 dark:text-amber-400',
        action: 'Correção de Indexação'
      };
    }
    return {
      tip: 'Mercado competitivo. Densidade alta. Crie 3 artigos satélites mais curtos e direcione links com texto âncora exato para fortalecer esta landing page principal.',
      accent: 'text-rose-500 dark:text-rose-400',
      action: 'Campanha de Conteúdo Pilar'
    };
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['Data', 'Autoridade Domínio (DA)', 'Tráfego Orgânico (Sessões)', 'Backlinks Totais'];
    const rows = metrics.map(m => [m.date, m.domainAuthority, m.organicTraffic, m.backlinks]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_seo_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const StatCard = ({ title, value, previousValue, icon: Icon, color, valueSuffix = '' }: any) => {
    const change = calculateChange(value, previousValue);
    const isPositive = parseFloat(change) >= 0;

    return (
      <div className={`p-6 rounded-2xl border transition-all hover:scale-[1.01] duration-300 ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
        <div className="flex justify-between items-start mb-4">
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          <div className={`flex items-center text-xs font-bold px-2 py-1 rounded-full ${
            parseFloat(change) === 0 ? 'bg-gray-100 dark:bg-slate-800 text-gray-400' :
            isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
          }`}>
            {parseFloat(change) !== 0 && (isPositive ? <ChevronUp className="w-3.5 h-3.5 mr-0.5" /> : <ChevronDown className="w-3.5 h-3.5 mr-0.5" />)}
            {parseFloat(change) === 0 ? 'Estável' : `${Math.abs(parseFloat(change))}%`}
          </div>
        </div>
        <h3 className={`text-xs font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-slate-400' : 'text-gray-500'} mb-1`}>{title}</h3>
        <p className={`text-3xl font-extrabold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
          {value.toLocaleString()}{valueSuffix}
        </p>
        <span className="text-[10px] text-gray-400 font-medium">Comparado ao período quinzenal anterior</span>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      
      {/* Header Info */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-blue-600/10 text-blue-500 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase tracking-wide">
              Mecanismos de Busca
            </span>
            <span className="flex items-center text-xs text-gray-400 gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Atualizado em: 28/Mai/2026
            </span>
          </div>
          <h2 className={`text-2xl font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Otimização de Busca (SEO)</h2>
          <p className={theme === 'dark' ? 'text-slate-400' : 'text-gray-500'}>
            Gerenciamento e monitoramento da autoridade do domínio, tráfego orgânico industrial e posicionamento de palavras-chave.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={handleExportCSV}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium border ${theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-gray-200 hover:bg-gray-50 text-gray-600'} transition-colors`}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-500" />
            Exportar CSV
          </button>
          
          {/* New Button: Update Metrics directly */}
          <button 
            onClick={() => setIsAddingMetric(true)}
            className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium border ${theme === 'dark' ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-gray-200 hover:bg-gray-50 text-gray-100 bg-slate-800 hover:bg-slate-700'} transition-colors`}
          >
            <TrendingUp className="w-4 h-4 mr-2 text-indigo-400" />
            Atualizar Métricas
          </button>

          <button 
            onClick={() => setIsAddingKeyword(true)}
            className="flex items-center px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 transition-all"
          >
            <Plus className="w-4 h-4 mr-2" />
            Analisar Palavra
          </button>
        </div>
      </div>

      {/* Metric update modal */}
      {isAddingMetric && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between bg-gray-50/50 dark:bg-slate-800/50">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-500" />
                Registrar Novas Métricas SEO
              </h3>
              <button onClick={() => setIsAddingMetric(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition">
                <Plus className="w-5 h-5 rotate-45" />
              </button>
            </div>
            <form onSubmit={handleAddMetric} className="p-6 space-y-4">
              <div className="p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-xl border border-blue-100/50 dark:border-blue-900/30 flex items-start gap-2">
                <Sparkles className="w-4.5 h-4.5 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                  Os valores cadastrados serão plotados automaticamente na linha temporal do gráfico de crescimento e refletirão na visão geral de tráfego.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Data do Registro</label>
                <input 
                  type="date" 
                  required
                  value={newMetric.date}
                  onChange={e => setNewMetric({...newMetric, date: e.target.value})}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Tráfego Orgânico</label>
                  <input 
                    type="number" 
                    required
                    value={newMetric.organicTraffic}
                    onChange={e => setNewMetric({...newMetric, organicTraffic: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                    placeholder="Ex: 4350"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Autoridade do Domínio (DA)</label>
                  <input 
                    type="number" 
                    min="1"
                    max="100"
                    required
                    value={newMetric.domainAuthority}
                    onChange={e => setNewMetric({...newMetric, domainAuthority: e.target.value})}
                    className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                    placeholder="Ex: 31"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Backlinks Totais</label>
                <input 
                  type="number" 
                  required
                  value={newMetric.backlinks}
                  onChange={e => setNewMetric({...newMetric, backlinks: e.target.value})}
                  className="w-full bg-gray-50 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition text-gray-900 dark:text-white"
                  placeholder="Ex: 800"
                />
              </div>

              <div className="pt-4 flex gap-3">
                <button 
                  type="button"
                  onClick={() => setIsAddingMetric(false)}
                  className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-800 transition font-medium"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition font-medium shadow-lg shadow-indigo-500/20"
                >
                  Gravar Dados
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Keyword Modal */}
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
                  placeholder="Ex: exaustor centrifugo industrial"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-slate-400 uppercase mb-1">Volume Mensal (Buscas/mês)</label>
                  <input 
                    type="number" 
                    required
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
                    required
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
                  Iniciar Rastreamento
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

      {/* Tabs list */}
      <div className="flex p-1 bg-gray-100 dark:bg-slate-900 rounded-xl w-fit border border-gray-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
        >
          <BarChart3 className="w-4 h-4" />
          Visão Geral
        </button>
        <button
          onClick={() => setActiveTab('keywords')}
          className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'keywords' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
        >
          <Search className="w-4 h-4" />
          Palavras-Chave {keywords.length > 0 && <span className="ml-1 bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-full px-1.5 py-0.5 text-[10px]">{keywords.length}</span>}
        </button>
        <button
          onClick={() => setActiveTab('tasks')}
          className={`flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'tasks' ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'}`}
        >
          <CheckCircle2 className="w-4 h-4" />
          Checklist SEO {tasks.filter(t => t.status !== 'DONE').length > 0 && <span className="ml-1 bg-rose-500 text-white rounded-full px-1.5 py-0.5 text-[10px]">{tasks.filter(t => t.status !== 'DONE').length}</span>}
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Metrics summary widgets */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard 
              title="Autoridade do Domínio" 
              value={currentMetrics.domainAuthority} 
              previousValue={previousMetrics.domainAuthority}
              icon={Globe}
              color="bg-indigo-500"
              valueSuffix=" / 100"
            />
            <StatCard 
              title="Tráfego Orgânico (Mensal)" 
              value={currentMetrics.organicTraffic} 
              previousValue={previousMetrics.organicTraffic}
              icon={TrendingUp}
              color="bg-blue-500"
              valueSuffix=" sessões"
            />
            <StatCard 
              title="Backlinks Totais" 
              value={currentMetrics.backlinks} 
              previousValue={previousMetrics.backlinks}
              icon={LinkIcon}
              color="bg-violet-500"
            />
          </div>

          {/* Graph view */}
          <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-6">
              <div>
                <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Crescimento de Tráfego Orgânico</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Curva contínua de sessões capturadas por canais orgânicos e autoridade de domínio</p>
              </div>

              {/* View options and legends */}
              <div className="flex flex-wrap items-center gap-4 w-full xl:w-auto justify-between sm:justify-start">
                {/* Custom Resolution Toggle */}
                <div className="flex p-0.5 bg-gray-100 dark:bg-slate-800 rounded-lg border border-gray-200/50 dark:border-slate-700/50">
                  <button
                    onClick={() => setChartView('daily')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      chartView === 'daily'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Nós Diários
                  </button>
                  <button
                    onClick={() => setChartView('monthly')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                      chartView === 'monthly'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    Visão Mensal
                  </button>
                </div>

                <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-800/40 px-3 py-1.5 rounded-lg border border-gray-150 dark:border-slate-800 text-[11px] text-gray-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                    <span>Visitas Orgânicas</span>
                  </div>
                  <div className="flex items-center gap-1.5 border-l border-gray-200 dark:border-slate-700 pl-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-500"></div>
                    <span>D.A (Autoridade)</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="h-80 w-full pr-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.01}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#1e293b' : '#f1f5f9'} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10 }}
                    tickFormatter={(str) => {
                      try {
                        const dateObj = new Date(str + 'T00:00:00');
                        if (chartView === 'monthly') {
                          const monthNamesPt = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                          return `${monthNamesPt[dateObj.getMonth()]}/${dateObj.getFullYear().toString().substring(2)}`;
                        }
                        return dateObj.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                      } catch {
                        return str;
                      }
                    }}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 10 }}
                  />
                  <Tooltip 
                    labelFormatter={(label, payload) => {
                      try {
                        const item = payload?.[0]?.payload;
                        if (item && item.isMonthlyGroup) {
                          return `Consolidado: ${item.formattedMonth}`;
                        }
                        if (item && item.isPlaceholder) {
                          return "Consolidado: Antes do Lançamento (Junho/25)";
                        }
                        const dateObj = new Date(label + 'T00:00:00');
                        return `Registro: ${dateObj.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
                      } catch {
                        return label;
                      }
                    }}
                    contentStyle={{ 
                      backgroundColor: theme === 'dark' ? '#0f172a' : '#fff',
                      borderColor: theme === 'dark' ? '#1e293b' : '#e2e8f0',
                      borderRadius: '12px',
                      color: theme === 'dark' ? '#fff' : '#000',
                      fontSize: '12px',
                      fontWeight: '550',
                      boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                    }}
                    formatter={(value: any, name: string, prop: any) => {
                      const item = prop?.payload;
                      if (!item) return [value, name];
                      if (item.isPlaceholder || item.isEmpty) {
                        if (name === "Visitas Orgânicas") {
                          return ["Ainda sem registros", "Status"];
                        }
                        return [0, name];
                      }
                      if (name === "Visitas Orgânicas") {
                        return [`${value.toLocaleString()} sessões`, "Tráfego Orgânico"];
                      }
                      return [value, name];
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="organicTraffic" 
                    name="Visitas Orgânicas"
                    stroke="#3b82f6" 
                    strokeWidth={2.5}
                    fillOpacity={1} 
                    fill="url(#colorTraffic)" 
                    dot={{
                      r: chartView === 'daily' ? 3.5 : 5,
                      stroke: "#3b82f6",
                      strokeWidth: 1.5,
                      fill: theme === 'dark' ? '#0f172a' : '#ffffff',
                    }}
                    activeDot={{
                      r: 6.5,
                      stroke: "#2563eb",
                      strokeWidth: 2,
                      fill: "#ffffff",
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'keywords' && (
        <div className="space-y-4 animate-in fade-in duration-300">
          
          {/* Filters shelf */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 ${theme === 'dark' ? 'bg-slate-900/40 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-grow max-w-4xl">
              
              {/* Search query input */}
              <div className="relative flex-grow min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text" 
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Escreva termos para filtrar..."
                  className={`w-full pl-9 pr-4 py-2 rounded-lg text-sm border focus:ring-2 focus:ring-blue-500 outline-none transition-all ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500' : 'bg-gray-50 border-gray-200 placeholder-gray-400'
                  }`}
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    Limpar
                  </button>
                )}
              </div>

              {/* Difficulty filter selection */}
              <div className="flex items-center gap-1.5">
                <SlidersHorizontal className="w-4.5 h-4.5 text-gray-400 shrink-0" />
                <select
                  value={difficultyFilter}
                  onChange={e => setDifficultyFilter(e.target.value as any)}
                  className={`text-xs font-bold py-2 px-3 rounded-lg border outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-700'
                  }`}
                >
                  <option value="ALL">DIFICULDADE: TODAS</option>
                  <option value="EASY">FÁCIL (≤ 40)</option>
                  <option value="MEDIUM">MÉDIA (41 - 70)</option>
                  <option value="HARD">DIFÍCIL (&gt; 70)</option>
                </select>
              </div>

              {/* Rank filter selection */}
              <div className="flex items-center gap-1.5">
                <Filter className="w-4 h-4 text-gray-400 shrink-0" />
                <select
                  value={rankFilter}
                  onChange={e => setRankFilter(e.target.value as any)}
                  className={`text-xs font-bold py-2 px-3 rounded-lg border outline-none cursor-pointer focus:ring-2 focus:ring-blue-500 ${
                    theme === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-gray-50 border-gray-200 text-gray-700'
                  }`}
                >
                  <option value="ALL">POSICIONAMENTO: TODOS</option>
                  <option value="TOP3">TOP 3 (Pódio)</option>
                  <option value="TOP10">TOP 10 (Primeira Página)</option>
                  <option value="PRIMEIRA_PAGINA">TOP 20 (Rastreáveis)</option>
                </select>
              </div>
            </div>

            {/* Clear filters quickly */}
            {(searchTerm !== '' || difficultyFilter !== 'ALL' || rankFilter !== 'ALL') && (
              <button 
                onClick={() => {
                  setSearchTerm('');
                  setDifficultyFilter('ALL');
                  setRankFilter('ALL');
                }}
                className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1 transition"
              >
                Resetar Filtros
              </button>
            )}
          </div>

          {/* Keywords monitor table card */}
          <div className={`rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'} overflow-hidden`}>
            <div className="p-6 border-b border-gray-100 dark:border-slate-800">
              <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Tabela de Rastreamento de Termos Chave</h3>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
                Monitore o volume mensal, posição orgânica local e a dificuldade de classificação dos termos de engenharia da marca.
              </p>
            </div>
            
            {filteredKeywords.length === 0 ? (
              <div className="p-12 text-center">
                <AlertCircle className="w-8 h-8 text-orange-500 mx-auto mb-2" />
                <p className="font-bold text-base text-gray-800 dark:text-white">Nenhum termo encontrado</p>
                <p className="text-xs text-gray-500 mt-1">Tente ajustar seus termos de pesquisa ou remover os filtros instalados.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className={`${theme === 'dark' ? 'bg-slate-800/50 text-slate-400' : 'bg-gray-50 text-gray-500'} text-xs uppercase tracking-wider font-extrabold border-b border-gray-100 dark:border-slate-800`}>
                      <th onClick={() => handleSort('keyword')} className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/80 transition-all select-none">
                        <div className="flex items-center gap-1">
                          Palavra-Chave
                          {sortBy === 'keyword' && (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                        </div>
                      </th>
                      <th onClick={() => handleSort('rank')} className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/80 transition-all select-none">
                        <div className="flex items-center gap-1">
                          Posição Orgânica
                          {sortBy === 'rank' && (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                        </div>
                      </th>
                      <th onClick={() => handleSort('volume')} className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/80 transition-all select-none">
                        <div className="flex items-center gap-1">
                          Volume Mensal
                          {sortBy === 'volume' && (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                        </div>
                      </th>
                      <th onClick={() => handleSort('difficulty')} className="px-6 py-4 cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800/80 transition-all select-none">
                        <div className="flex items-center gap-1">
                          Dificuldade
                          {sortBy === 'difficulty' && (sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />)}
                        </div>
                      </th>
                      <th className="px-6 py-4">Orientação / Solução Recomendada</th>
                      <th className="px-6 py-4 text-right">Remover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800/60">
                    {filteredKeywords.map((kw) => {
                      const rec = getRecommendation(kw.rank, kw.difficulty);
                      const isSelected = selectedTipsKeyword === kw.id;

                      return (
                        <React.Fragment key={kw.id}>
                          <tr className={`hover:bg-gray-50/50 dark:hover:bg-slate-800/30 transition-colors ${isSelected ? 'bg-blue-50/30 dark:bg-slate-800/20' : ''}`}>
                            <td className="px-6 py-4">
                              <div className="flex items-center">
                                <span className={`font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>{kw.keyword}</span>
                                <a 
                                  href={`https://www.google.com.br/search?q=${encodeURIComponent(kw.keyword)}`} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="ml-2 text-gray-400 hover:text-blue-500 transition-colors"
                                  title="Ver página de resultados no Google"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-black tracking-tight ${
                                kw.rank <= 3 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50' : 
                                kw.rank <= 10 ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50' : 
                                'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-300 border border-gray-200 dark:border-slate-700/50'
                              }`}>
                                #{kw.rank}
                              </div>
                            </td>
                            <td className={`px-6 py-4 text-sm font-semibold ${theme === 'dark' ? 'text-slate-300' : 'text-gray-700'}`}>
                              {kw.volume.toLocaleString()} buscas/mês
                            </td>
                            <td className="px-6 py-4">
                              <div className="space-y-1.5">
                                <span className="text-xs font-bold block">
                                  {kw.difficulty}% {kw.difficulty > 70 ? '(Difícil)' : kw.difficulty > 40 ? '(Média)' : '(Fácil)'}
                                </span>
                                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2 max-w-[140px]">
                                  <div 
                                    className={`h-2 rounded-full ${
                                      kw.difficulty > 70 ? 'bg-red-500' : 
                                      kw.difficulty > 40 ? 'bg-orange-500' : 
                                      'bg-emerald-500'
                                    }`} 
                                    style={{ width: `${kw.difficulty}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            
                            {/* Proactive custom tips inside row for rich experience */}
                            <td className="px-6 py-4 max-w-[280px]">
                              <button 
                                onClick={() => setSelectedTipsKeyword(isSelected ? null : kw.id)}
                                className={`text-xs font-bold flex items-center gap-1.5 transition-all outline-none rounded-lg p-1.5 ${
                                  isSelected 
                                    ? 'text-blue-600 bg-blue-100/50 dark:text-blue-400 dark:bg-blue-950/50' 
                                    : 'text-slate-500 dark:text-slate-400 hover:text-blue-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                              >
                                <span className={`w-2 h-2 rounded-full ${kw.difficulty > 70 ? 'bg-red-500' : kw.difficulty > 40 ? 'bg-orange-500' : 'bg-emerald-500'}`}></span>
                                <span className="underline font-bold uppercase shrink-0">{rec.action}</span>
                                {isSelected ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              </button>
                            </td>

                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => handleDeleteKeyword(kw.id)}
                                className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-500/10 transition-all"
                                title="Deletar da planilha"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>

                          {/* Expansion Panel with deep analytical advice */}
                          {isSelected && (
                            <tr className="bg-slate-50/50 dark:bg-slate-900/35">
                              <td colSpan={6} className="px-6 py-4 border-l-2 border-blue-500">
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2">
                                    <Sparkles className="w-4.5 h-4.5 text-yellow-500 shrink-0" />
                                    <span className="text-xs font-bold text-gray-700 dark:text-slate-200 uppercase tracking-widest">
                                      Guia de Engenharia de Rank - Jimp SEO
                                    </span>
                                  </div>
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed max-w-5xl">
                                    {rec.tip}
                                  </p>
                                  <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                                    <span>Última Varredura: {new Date(kw.lastUpdated).toLocaleDateString('pt-BR')}</span>
                                    <span>•</span>
                                    <span>Dificuldade Relativa: <strong className={rec.accent}>{kw.difficulty}% (KGR favorável)</strong></span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'tasks' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in duration-300">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className={`text-lg font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'}`}>Checklist e Otimizações SEO</h3>
                <p className="text-xs text-gray-500 dark:text-slate-400">Marque as tarefas operacionais à medida que as Landing Pages forem atualizadas</p>
              </div>
              <button 
                onClick={() => setIsAddingTask(true)}
                className="flex items-center px-4 py-2 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-md shadow-emerald-500/10"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Nova Tarefa
              </button>
            </div>
            
            {tasks.length === 0 ? (
              <div className="p-8 text-center border-2 border-dashed border-gray-200 rounded-2xl dark:border-slate-800">
                <CheckCircle2 className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                <p className="font-bold text-gray-600">Nenhuma tarefa no checklist</p>
                <button onClick={() => setIsAddingTask(true)} className="text-xs text-blue-500 underline mt-1 font-bold">Criar nova tarefa</button>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div 
                    key={task.id} 
                    className={`p-4 rounded-xl border flex items-center justify-between transition-all hover:scale-[1.005] duration-200 ${
                      theme === 'dark' 
                        ? 'bg-slate-900/50 border-slate-800 hover:border-slate-700' 
                        : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => toggleTaskStatus(task.id)}
                        className={`p-1.5 rounded-lg transition-colors border ${
                          task.status === 'DONE' 
                            ? 'text-emerald-500 bg-emerald-500/15 border-emerald-500/10' 
                            : 'text-gray-300 hover:text-emerald-500 hover:bg-emerald-500/5 border-gray-200 dark:border-slate-700'
                        }`}
                      >
                        {task.status === 'DONE' ? <Check className="w-4 h-4 text-emerald-500 stroke-[3.5]" /> : <div className="w-4 h-4" />}
                      </button>
                      <div>
                        <p className={`font-bold text-sm ${task.status === 'DONE' ? 'line-through text-gray-400 dark:text-slate-500' : theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                            task.priority === 'HIGH' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                            task.priority === 'MEDIUM' ? 'bg-orange-500/10 text-orange-500 border-orange-500/25' :
                            'bg-blue-500/10 text-blue-500 border-blue-500/20'
                          }`}>
                            {task.priority === 'HIGH' ? 'ALTA' : task.priority === 'MEDIUM' ? 'MÉDIA' : 'BAIXA'}
                          </span>
                          <span className="text-[10px] text-gray-400 flex items-center">
                            <Clock className="w-3 h-3 mr-1" />
                            {task.status === 'DONE' ? 'Concluído' : task.status === 'IN_PROGRESS' ? 'Em Progresso' : 'Pendente'}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            
            {/* Visual health score wheel */}
            <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900/50 border-slate-800' : 'bg-white border-gray-100 shadow-sm'}`}>
              <h3 className={`text-base font-bold ${theme === 'dark' ? 'text-white' : 'text-gray-800'} mb-4`}>Índice de Saúde Técnica SEO</h3>
              <div className="flex items-center justify-center mb-6">
                <div className="relative w-36 h-36">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-gray-200 dark:text-slate-800"
                      strokeDasharray="100, 100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.8"
                    />
                    <path
                      className="text-emerald-500"
                      strokeDasharray="88, 100"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-3xl font-extrabold tracking-tight ${theme === 'dark' ? 'text-white' : 'text-gray-900'}`}>88%</span>
                    <span className="text-[10px] text-emerald-500 font-extrabold uppercase tracking-widest mt-0.5">Ótimo</span>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-bold border-b border-gray-100 dark:border-slate-850 pb-2">
                  <span className="text-gray-400 uppercase">Fator</span>
                  <span className="text-gray-400 uppercase">Status</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Páginas Indexadas</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400">128</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Erros de Rastreamento</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">0</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Avisos de Semântica</span>
                  <span className="font-extrabold text-orange-500">8</span>
                </div>
              </div>
            </div>

            {/* Smart technical advice card */}
            <div className={`p-6 rounded-2xl border ${theme === 'dark' ? 'bg-blue-900/10 border-blue-900/30' : 'bg-blue-50 border-blue-100'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-bold text-blue-950 dark:text-blue-300">Dica Prática de Performance</h4>
                  <p className="text-xs text-blue-700 dark:text-blue-400 mt-1.5 leading-relaxed">
                    Temos 2 palavras-chave importantes posicionadas entre as posições #4 e #7. Se adicionarmos links internos robustos a partir das nossas páginas de maior peso técnico, garantiremos classificação Top 3 no buscador em breve.
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
