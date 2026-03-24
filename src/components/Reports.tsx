import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { 
  AppState, 
  ProjectSession, 
  InterruptionRecord, 
  User 
} from '../types';
import { 
  FileText, 
  Download, 
  Filter, 
  ChevronDown, 
  ChevronUp, 
  Clock, 
  AlertTriangle, 
  TrendingDown, 
  Activity,
  BarChart3,
  User as UserIcon,
  Users,
  Info,
  AlertCircle,
  Sparkles,
  Target,
  LayoutDashboard
} from 'lucide-react';
import { analyzePerformance } from '../services/geminiService';

interface ReportsProps {
  data: AppState;
  currentUser: User;
  theme: 'light' | 'dark';
}

export const Reports: React.FC<ReportsProps> = ({ data, currentUser, theme }) => {
  const [filterType, setFilterType] = useState<'MONTH' | 'QUARTER' | 'SEMESTER' | 'YEAR'>('MONTH');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [selectedSemester, setSelectedSemester] = useState(new Date().getMonth() < 6 ? 1 : 2);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedSection, setExpandedSection] = useState<string | null>('productivity');
  const [expandedDesigner, setExpandedDesigner] = useState<string | null>(null);
  const [expandedNs, setExpandedNs] = useState<string | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isLoadingAi, setIsLoadingAi] = useState(false);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return [currentYear, currentYear - 1, currentYear - 2];
  }, []);

  const costPerSecond = useMemo(() => {
    if (data.settings && !data.settings.useAutomaticCost && data.settings.hourlyCost > 0) {
      return data.settings.hourlyCost / 3600;
    }
    
    const relevantUsers = data.users.filter(u => u.role !== 'CEO' && u.role !== 'PROCESSOS' && (u.salary || 0) > 0);
    const totalSalary = relevantUsers.reduce((acc, u) => acc + (u.salary || 0), 0);
    const numUsers = relevantUsers.length || 1;
    return ((totalSalary / numUsers) / 220) / 3600;
  }, [data.users, data.settings]);

  const isDateInPeriod = (date: Date) => {
    const year = date.getFullYear();
    if (year !== selectedYear) return false;

    const month = date.getMonth();
    if (filterType === 'MONTH') {
      return month === selectedMonth;
    } else if (filterType === 'QUARTER') {
      const quarter = Math.floor(month / 3) + 1;
      return quarter === selectedQuarter;
    } else if (filterType === 'SEMESTER') {
      const semester = month < 6 ? 1 : 2;
      return semester === selectedSemester;
    } else if (filterType === 'YEAR') {
      return true;
    }
    return false;
  };

  const productivityData = useMemo(() => {
    const filtered = data.projects.filter(p => {
      if (p.status !== 'COMPLETED') return false;
      
      // Role-based filtering: Designers only see their own
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
        return false;
      }

      const date = new Date(p.endTime || p.startTime);
      return isDateInPeriod(date);
    });

    const totalProductiveSeconds = filtered.reduce((acc, curr) => acc + (curr.totalActiveSeconds || 0), 0);
    const totalInterruptionSeconds = filtered.reduce((acc, curr) => acc + (curr.interruptionSeconds || 0), 0);
    const totalSeconds = totalProductiveSeconds + totalInterruptionSeconds;
    
    const lossPercentage = totalSeconds > 0 ? (totalInterruptionSeconds / totalSeconds) * 100 : 0;

    return {
      projects: filtered,
      totalCount: filtered.length,
      totalProductiveSeconds,
      totalInterruptionSeconds,
      totalSeconds,
      lossPercentage,
      avgProductiveSeconds: filtered.length > 0 ? totalProductiveSeconds / filtered.length : 0
    };
  }, [data.projects, selectedMonth, selectedYear, currentUser]);

  const clientData = useMemo(() => {
    const filtered = data.projects.filter(p => {
      if (p.status !== 'COMPLETED') return false;

      // Role-based filtering: Designers only see their own
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
        return false;
      }

      const date = new Date(p.endTime || p.startTime);
      return isDateInPeriod(date);
    });

    const stats: Record<string, { 
      clientName: string, 
      count: number, 
      totalCost: number,
      productiveSeconds: number,
      interruptionSeconds: number
    }> = {};

    filtered.forEach(p => {
      const clientName = p.clientName || 'Desconhecido';
      if (!stats[clientName]) {
        stats[clientName] = { 
          clientName, 
          count: 0, 
          totalCost: 0,
          productiveSeconds: 0,
          interruptionSeconds: 0
        };
      }
      stats[clientName].count += 1;
      // Calculate cost based on productive time only as per user request
      const projectCost = p.totalActiveSeconds * costPerSecond;
      stats[clientName].totalCost += projectCost;
      stats[clientName].productiveSeconds += p.totalActiveSeconds;
      stats[clientName].interruptionSeconds += p.interruptionSeconds || 0;
    });

    return Object.values(stats).sort((a, b) => a.clientName.localeCompare(b.clientName));
  }, [data.projects, selectedMonth, selectedYear, currentUser]);

  const bottleneckData = useMemo(() => {
    const filtered = data.interruptions.filter(i => {
      // Role-based filtering: Designers only see their own
      if (currentUser.role === 'PROJETISTA' && i.designerId !== currentUser.id) {
        return false;
      }

      const date = new Date(i.startTime);
      return isDateInPeriod(date);
    });

    const stats: Record<string, { area: string, count: number, totalSeconds: number }> = {};
    
    filtered.forEach(i => {
      const area = i.responsibleArea;
      if (!stats[area]) {
        stats[area] = { area, count: 0, totalSeconds: 0 };
      }
      stats[area].count += 1;
      stats[area].totalSeconds += i.totalTimeSeconds || 0;
    });

    return Object.values(stats)
      .map(s => ({
        ...s,
        totalHours: Math.round(s.totalSeconds / 3600),
        avgMinutes: s.count > 0 ? Math.round((s.totalSeconds / s.count) / 60) : 0,
        totalCost: s.totalSeconds * costPerSecond
      }))
      .sort((a, b) => a.area.localeCompare(b.area));
  }, [data.interruptions, selectedMonth, selectedYear, currentUser, costPerSecond]);

  const detailedInterruptionData = useMemo(() => {
    const filtered = data.interruptions.filter(i => {
      if (currentUser.role === 'PROJETISTA' && i.designerId !== currentUser.id) {
        return false;
      }
      const date = new Date(i.startTime);
      return isDateInPeriod(date);
    });

    return filtered.map(i => {
      const designer = data.users.find(u => u.id === i.designerId);
      const cost = (i.totalTimeSeconds || 0) * costPerSecond;
      
      let designerName = 'N/A';
      if (designer) {
        designerName = `${designer.name} ${designer.surname || ''}`.trim();
      } else if (i.designerId === currentUser.id) {
        designerName = `${currentUser.name} ${currentUser.surname || ''}`.trim();
      }

      return {
        ...i,
        designerName,
        cost
      };
    }).sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [data.interruptions, data.users, selectedMonth, selectedYear, currentUser, costPerSecond]);

  const designerData = useMemo(() => {
    const filtered = data.projects.filter(p => {
      if (p.status !== 'COMPLETED') return false;

      // Role-based filtering: Designers only see their own
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
        return false;
      }

      const date = new Date(p.endTime || p.startTime);
      return isDateInPeriod(date);
    });

    const stats: Record<string, { 
      name: string, 
      count: number, 
      productiveSeconds: number, 
      interruptionSeconds: number,
      totalCost: number,
      projects: { ns: string, client: string, cost: number }[]
    }> = {};

    // Initialize with all proposers if GESTOR/CEO
    if (currentUser.role !== 'PROJETISTA') {
      data.users.forEach(u => {
        if (u.role === 'PROJETISTA' || u.role === 'COORDENADOR') {
          stats[u.name] = { name: u.name, count: 0, productiveSeconds: 0, interruptionSeconds: 0, totalCost: 0, projects: [] };
        }
      });
    }

    filtered.forEach(p => {
      const user = data.users.find(u => u.id === p.userId);
      // Fallback: if userId is not a UUID but a name (legacy), or if user not found by ID
      const name = user ? user.name : (p.userId && p.userId.length < 30 ? p.userId : 'N/A');
      
      if (!stats[name]) {
        stats[name] = { name, count: 0, productiveSeconds: 0, interruptionSeconds: 0, totalCost: 0, projects: [] };
      }
      stats[name].count += 1;
      stats[name].productiveSeconds += p.totalActiveSeconds;
      stats[name].interruptionSeconds += p.interruptionSeconds || 0;
      // Calculate cost based on productive time only as per user request
      const projectCost = p.totalActiveSeconds * costPerSecond;
      stats[name].totalCost += projectCost;
      stats[name].projects.push({
        ns: p.ns,
        client: p.clientName || 'N/A',
        cost: projectCost
      });
    });

    return Object.values(stats).sort((a, b) => a.name.localeCompare(b.name));
  }, [data.projects, data.users, filterType, selectedMonth, selectedQuarter, selectedSemester, selectedYear, currentUser]);

  const projectStatusData = useMemo(() => {
    const filtered = data.projects.filter(p => {
      const date = new Date(p.endTime || p.startTime);
      return isDateInPeriod(date);
    });

    const stats = {
      IN_PROGRESS: 0,
      PAUSED: 0,
      COMPLETED: 0,
      TOTAL: filtered.length,
      TOTAL_COST: 0
    };

    filtered.forEach(p => {
      if (p.status === 'IN_PROGRESS') stats.IN_PROGRESS++;
      else if (p.status === 'PAUSED') stats.PAUSED++;
      else if (p.status === 'COMPLETED') {
        stats.COMPLETED++;
        stats.TOTAL_COST += (p.totalActiveSeconds * costPerSecond);
      }
    });

    return stats;
  }, [data.projects, filterType, selectedMonth, selectedQuarter, selectedSemester, selectedYear]);

  const deadlinePredictions = useMemo(() => {
    // Calculate historical average by project type
    const completedProjects = data.projects.filter(p => p.status === 'COMPLETED' && p.totalActiveSeconds > 0);
    const typeAverages: Record<string, { totalSeconds: number, count: number }> = {};
    
    completedProjects.forEach(p => {
      const type = p.type || 'Padrão';
      if (!typeAverages[type]) {
        typeAverages[type] = { totalSeconds: 0, count: 0 };
      }
      typeAverages[type].totalSeconds += p.totalActiveSeconds;
      typeAverages[type].count += 1;
    });

    const averages = Object.entries(typeAverages).reduce((acc, [type, stats]) => {
      acc[type] = stats.totalSeconds / stats.count;
      return acc;
    }, {} as Record<string, number>);

    // Predict for active projects
    const activeProjects = data.projects.filter(p => {
      if (p.status !== 'IN_PROGRESS' && p.status !== 'PAUSED') return false;
      
      // Role-based filtering: Designers only see their own
      if (currentUser.role === 'PROJETISTA' && p.userId !== currentUser.id) {
        return false;
      }
      
      return true;
    });
    
    return activeProjects.map(p => {
      const type = p.type || 'Padrão';
      const avgSeconds = averages[type] || averages['Padrão'] || 3600 * 8; // Default 8h if no data
      const remainingSeconds = Math.max(0, avgSeconds - p.totalActiveSeconds);
      
      const predictedEndDate = new Date();
      predictedEndDate.setSeconds(predictedEndDate.getSeconds() + remainingSeconds);

      return {
        ...p,
        avgForType: avgSeconds,
        remainingSeconds,
        predictedEndDate
      };
    });
  }, [data.projects, currentUser]);

  const nsAggregationData = useMemo(() => {
    const allCompletedInPeriod = data.projects.filter(p => {
      if (p.status !== 'COMPLETED') return false;
      const date = new Date(p.endTime || p.startTime);
      return isDateInPeriod(date);
    });

    const stats: Record<string, { 
      ns: string, 
      clientName: string,
      totalSessions: number,
      totalProductiveSeconds: number,
      totalCost: number,
      contributors: Record<string, { userId: string, name: string, sessions: number, seconds: number, cost: number }>
    }> = {};

    allCompletedInPeriod.forEach(p => {
      const ns = p.ns || 'Sem NS';
      if (!stats[ns]) {
        stats[ns] = { 
          ns, 
          clientName: p.clientName || 'N/A',
          totalSessions: 0,
          totalProductiveSeconds: 0,
          totalCost: 0,
          contributors: {}
        };
      }
      
      const userId = p.userId || 'unknown';
      const user = data.users.find(u => u.id === userId);
      const userName = user ? `${user.name} ${user.surname || ''}`.trim() : (userId.length < 30 ? userId : 'N/A');
      
      if (!stats[ns].contributors[userId]) {
        stats[ns].contributors[userId] = { userId, name: userName, sessions: 0, seconds: 0, cost: 0 };
      }
      
      const projectCost = (p.totalActiveSeconds || 0) * costPerSecond;
      
      stats[ns].totalSessions += 1;
      stats[ns].totalProductiveSeconds += (p.totalActiveSeconds || 0);
      stats[ns].totalCost += projectCost;
      
      stats[ns].contributors[userId].sessions += 1;
      stats[ns].contributors[userId].seconds += (p.totalActiveSeconds || 0);
      stats[ns].contributors[userId].cost += projectCost;
    });

    const result = Object.values(stats).sort((a, b) => b.totalSessions - a.totalSessions);

    // Role-based filtering: Designers only see NS they contributed to
    if (currentUser.role === 'PROJETISTA') {
      return result.filter(s => 
        Object.values(s.contributors).some(c => c.userId === currentUser.id)
      );
    }

    return result;
  }, [data.projects, data.users, filterType, selectedMonth, selectedQuarter, selectedSemester, selectedYear, currentUser, costPerSecond, isDateInPeriod]);

  const handleAiAnalysis = async () => {
    setIsLoadingAi(true);
    // Filter projects, issues and interruptions for the selected period
    const filteredProjects = data.projects.filter(p => isDateInPeriod(new Date(p.endTime || p.startTime)));
    const filteredIssues = data.issues.filter(i => isDateInPeriod(new Date(i.date)));
    const filteredInterruptions = data.interruptions.filter(i => isDateInPeriod(new Date(i.startTime)));
    
    const result = await analyzePerformance(filteredProjects, filteredIssues, filteredInterruptions, data.settings, data.users);
    setAiAnalysis(result);
    setIsLoadingAi(false);
  };

  const handleExportAiReport = () => {
    if (!aiAnalysis) return;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Análise Inteligente de Desempenho - ${getPeriodLabel()}`, 14, 20);
    doc.setFontSize(10);
    const splitText = doc.splitTextToSize(aiAnalysis, 180);
    doc.text(splitText, 14, 30);
    doc.save(`analise_ia_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
  };

  const handleExportStatus = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['Status', 'Quantidade'];
    const rows = [
      ['Em Andamento', projectStatusData.IN_PROGRESS],
      ['Pausado', projectStatusData.PAUSED],
      ['Concluído', projectStatusData.COMPLETED],
      ['Total', projectStatusData.TOTAL]
    ];

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio_status_projetos_${getPeriodLabel().replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Relatório de Status de Projetos - ${getPeriodLabel()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: rows,
        startY: 20,
      });
      doc.save(`relatorio_status_projetos_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Status de Projetos");
      XLSX.writeFile(wb, `relatorio_status_projetos_${getPeriodLabel().replace(/ /g, '_')}.xlsx`);
    }
  };

  const handleExportDesigners = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['Projetista', 'Projetos Liberados', 'Tempo Produtivo', 'Tempo Parada', 'Custo Total'];
    const rows = designerData.map(item => [
      item.name,
      item.count,
      formatDuration(item.productiveSeconds),
      formatDuration(item.interruptionSeconds),
      item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ]);

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio_produtividade_projetistas_${getPeriodLabel().replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Produtividade por Projetista - ${getPeriodLabel()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: rows,
        startY: 20,
      });
      doc.save(`relatorio_produtividade_projetistas_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Produtividade Projetistas");
      XLSX.writeFile(wb, `relatorio_produtividade_projetistas_${getPeriodLabel().replace(/ /g, '_')}.xlsx`);
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  const handleExportClients = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['Cliente', 'Qtd. Projetos', 'Tempo Produtivo', 'Tempo Parada', 'Custo Total'];
    const data = clientData.map(item => [
      item.clientName,
      item.count,
      formatDuration(item.productiveSeconds),
      formatDuration(item.interruptionSeconds),
      item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ]);

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...data.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio_custos_cliente_${getPeriodLabel().replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Relatório de Custos por Cliente - ${getPeriodLabel()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 20,
      });
      doc.save(`relatorio_custos_cliente_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Custos por Cliente");
      XLSX.writeFile(wb, `relatorio_custos_cliente_${getPeriodLabel().replace(/ /g, '_')}.xlsx`);
    }
  };

  const handleExportProductivity = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['NS', 'Cliente', 'Projetista', 'Produtivo', 'Parada', 'Total', 'Custo'];
    const data = productivityData.projects.map(p => {
      const user = data.users.find(u => u.id === p.userId);
      const designerName = user ? user.name : 'N/A';
      return [
        p.ns,
        p.clientName,
        designerName,
        formatDuration(p.totalActiveSeconds),
        formatDuration(p.interruptionSeconds || 0),
        formatDuration(p.totalSeconds || 0),
        (p.totalActiveSeconds * costPerSecond).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      ];
    });

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...data.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio_produtividade_${getPeriodLabel().replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Relatório de Produtividade - ${getPeriodLabel()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 20,
      });
      doc.save(`relatorio_produtividade_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Produtividade");
      XLSX.writeFile(wb, `relatorio_produtividade_${getPeriodLabel().replace(/ /g, '_')}.xlsx`);
    }
  };

  const handleExportBottlenecks = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['Área', 'Qtd. Paradas', 'Tempo Total Perdido', 'Tempo Médio', 'Custo Estimado'];
    const data = bottleneckData.map(item => [
      item.area,
      item.count,
      `${item.totalHours}h`,
      `${item.avgMinutes}m`
    ]);

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...data.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio_gargalos_${getPeriodLabel().replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Relatório de Gargalos - ${getPeriodLabel()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 20,
      });
      doc.save(`relatorio_gargalos_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Gargalos");
      XLSX.writeFile(wb, `relatorio_gargalos_${getPeriodLabel().replace(/ /g, '_')}.xlsx`);
    }
  };

  const handleExportDetailedInterruptions = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['Data', 'NS', 'Cliente', 'Quem Registrou', 'Área', 'Tempo', 'Custo'];
    const data = detailedInterruptionData.map(item => [
      new Date(item.startTime).toLocaleDateString('pt-BR'),
      item.projectNs,
      item.clientName,
      item.designerName,
      item.responsibleArea,
      formatDuration(item.totalTimeSeconds),
      item.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ]);

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...data.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio_detalhado_paradas_${getPeriodLabel().replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Relatório Detalhado de Paradas - ${getPeriodLabel()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 20,
      });
      doc.save(`relatorio_detalhado_paradas_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Paradas Detalhadas");
      XLSX.writeFile(wb, `relatorio_detalhado_paradas_${getPeriodLabel().replace(/ /g, '_')}.xlsx`);
    }
  };

  const handleExportNsAggregation = (format: 'CSV' | 'PDF' | 'EXCEL') => {
    const headers = ['NS / Código', 'Cliente', 'Total de Lançamentos', 'Tempo Total', 'Custo Total'];
    const data = nsAggregationData.map(item => [
      item.ns,
      item.clientName,
      item.totalSessions,
      formatDuration(item.totalProductiveSeconds),
      item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
    ]);

    if (format === 'CSV') {
      const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...data.map(r => r.join(','))].join('\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `relatorio_agregacao_ns_${getPeriodLabel().replace(/ /g, '_')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (format === 'PDF') {
      const doc = new jsPDF();
      doc.text(`Agregação por NS / Código - ${getPeriodLabel()}`, 14, 15);
      (doc as any).autoTable({
        head: [headers],
        body: data,
        startY: 20,
      });
      doc.save(`relatorio_agregacao_ns_${getPeriodLabel().replace(/ /g, '_')}.pdf`);
    } else if (format === 'EXCEL') {
      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Agregação por NS");
      XLSX.writeFile(wb, `relatorio_agregacao_ns_${getPeriodLabel().replace(/ /g, '_')}.xlsx`);
    }
  };

  const getPeriodLabel = () => {
    if (filterType === 'MONTH') return `${months[selectedMonth]} ${selectedYear}`;
    if (filterType === 'QUARTER') return `${selectedQuarter}º Trimestre ${selectedYear}`;
    if (filterType === 'SEMESTER') return `${selectedSemester}º Semestre ${selectedYear}`;
    return `Ano ${selectedYear}`;
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="bg-white dark:bg-black p-4 rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center text-black dark:text-white font-bold">
          <FileText className="w-5 h-5 mr-2 text-blue-600" />
          Relatórios Gerenciais
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <select 
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="p-2 border dark:border-slate-600 rounded-lg outline-none text-sm dark:bg-black dark:text-white"
          >
            <option value="MONTH">Mensal</option>
            <option value="QUARTER">Trimestral</option>
            <option value="SEMESTER">Semestral</option>
            <option value="YEAR">Anual</option>
          </select>

          {filterType === 'MONTH' && (
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="p-2 border dark:border-slate-600 rounded-lg outline-none text-sm dark:bg-black dark:text-white"
            >
              {months.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          )}

          {filterType === 'QUARTER' && (
            <select 
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(Number(e.target.value))}
              className="p-2 border dark:border-slate-600 rounded-lg outline-none text-sm dark:bg-black dark:text-white"
            >
              <option value={1}>1º Trimestre</option>
              <option value={2}>2º Trimestre</option>
              <option value={3}>3º Trimestre</option>
              <option value={4}>4º Trimestre</option>
            </select>
          )}

          {filterType === 'SEMESTER' && (
            <select 
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(Number(e.target.value))}
              className="p-2 border dark:border-slate-600 rounded-lg outline-none text-sm dark:bg-black dark:text-white"
            >
              <option value={1}>1º Semestre</option>
              <option value={2}>2º Semestre</option>
            </select>
          )}

          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="p-2 border dark:border-slate-600 rounded-lg outline-none text-sm dark:bg-black dark:text-white"
          >
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Monthly Summary Card (Module 9) */}
      <div className={`bg-gradient-to-br ${theme === 'dark' ? 'from-black to-black border border-slate-700' : 'from-blue-600 to-indigo-700'} rounded-2xl p-6 text-white shadow-lg`}>
        <h3 className="text-lg font-bold mb-4 flex items-center">
          <TrendingDown className="w-5 h-5 mr-2" />
          Resumo de Engenharia - {getPeriodLabel()}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/20 dark:border-slate-700/50">
            <p className="text-[10px] uppercase font-bold opacity-70">Lançamentos</p>
            <p className="text-xl font-black">{productivityData.totalCount}</p>
          </div>
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/20 dark:border-slate-700/50">
            <p className="text-[10px] uppercase font-bold opacity-70">Projetos (NS)</p>
            <p className="text-xl font-black">{nsAggregationData.length}</p>
          </div>
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/20 dark:border-slate-700/50">
            <p className="text-[10px] uppercase font-bold opacity-70">Média/Projeto</p>
            <p className="text-xl font-black">{formatDuration(productivityData.avgProductiveSeconds)}</p>
          </div>
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/20 dark:border-slate-700/50">
            <p className="text-[10px] uppercase font-bold opacity-70">Horas Produtivas</p>
            <p className="text-xl font-black">{formatDuration(productivityData.totalProductiveSeconds)}</p>
          </div>
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/20 dark:border-slate-700/50">
            <p className="text-[10px] uppercase font-bold opacity-70">Horas Perdidas</p>
            <p className="text-xl font-black text-red-200">{formatDuration(productivityData.totalInterruptionSeconds)}</p>
          </div>
          <div className="bg-white/10 dark:bg-black/20 backdrop-blur-md p-3 rounded-xl border border-white/20 dark:border-slate-700/50">
            <p className="text-[10px] uppercase font-bold opacity-70">% Perda</p>
            <p className="text-xl font-black text-amber-200">{productivityData.lossPercentage.toFixed(1)}%</p>
          </div>
        </div>
      </div>

      {/* AI Insights Section */}
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 dark:bg-black p-6 rounded-xl border border-indigo-100 dark:border-indigo-900/30">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-indigo-900 dark:text-indigo-300 flex items-center">
            <Sparkles className="w-5 h-5 mr-2 text-indigo-600 dark:text-indigo-400" />
            Análise Inteligente (IA) - {getPeriodLabel()}
          </h3>
          <div className="flex gap-2">
            <button 
              onClick={handleAiAnalysis}
              disabled={isLoadingAi}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
            >
              {isLoadingAi ? 'Analisando...' : 'Gerar Análise'}
            </button>
            {aiAnalysis && (
              <button 
                onClick={handleExportAiReport}
                className="bg-white dark:bg-black text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/30 px-4 py-2 rounded-lg text-sm hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors shadow-sm flex items-center"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar PDF
              </button>
            )}
          </div>
        </div>
        
        {aiAnalysis ? (
          <div className="prose prose-sm max-w-none text-black dark:text-white bg-white/50 dark:bg-black p-4 rounded-lg border border-indigo-100/50 dark:border-indigo-900/20">
            <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{aiAnalysis}</pre>
          </div>
        ) : (
          <p className="text-indigo-800/70 dark:text-indigo-300/70 text-sm">
            Clique em "Gerar Análise" para que a IA processe os dados do período selecionado e forneça insights estratégicos.
          </p>
        )}
      </div>

      {/* Project Status Report Section */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'status' ? null : 'status')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <LayoutDashboard className="w-5 h-5 text-purple-600" />
            <h3 className="font-bold text-black dark:text-white">Relatório de Status de Projetos</h3>
          </div>
          {expandedSection === 'status' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'status' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/30">
                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">Em Andamento</p>
                <p className="text-2xl font-black text-blue-800 dark:text-blue-300">{projectStatusData.IN_PROGRESS}</p>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-900/30">
                <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase">Pausados</p>
                <p className="text-2xl font-black text-amber-800 dark:text-amber-300">{projectStatusData.PAUSED}</p>
              </div>
              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase">Concluídos</p>
                <p className="text-2xl font-black text-emerald-800 dark:text-emerald-300">{projectStatusData.COMPLETED}</p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-100 dark:border-purple-900/30">
                <p className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Valor Total (Concluídos)</p>
                <p className="text-2xl font-black text-purple-800 dark:text-purple-300">
                  {projectStatusData.TOTAL_COST.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })}
                </p>
              </div>
              <div className="p-4 bg-gray-50 dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700">
                <p className="text-xs font-bold text-gray-600 dark:text-slate-400 uppercase">Total do Período</p>
                <p className="text-2xl font-black text-gray-800 dark:text-slate-200">{projectStatusData.TOTAL}</p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => handleExportStatus('CSV')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> CSV
              </button>
              <button 
                onClick={() => handleExportStatus('PDF')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> PDF
              </button>
              <button 
                onClick={() => handleExportStatus('EXCEL')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Productivity Report Section */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'productivity' ? null : 'productivity')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-blue-600" />
            <h3 className="font-bold text-black dark:text-white">Relatório de Produtividade Detalhado</h3>
          </div>
          {expandedSection === 'productivity' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'productivity' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-6">
            {/* Detailed Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">NS / Projeto</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Projetista</th>
                    <th className="p-3 text-center">Produtivo</th>
                    <th className="p-3 text-center">Parada</th>
                    <th className="p-3 text-center">Total</th>
                    <th className="p-3 text-right">Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {productivityData.projects.map((p) => {
                    const user = data.users.find(u => u.id === p.userId);
                    const designerName = user ? user.name : (p.userId && p.userId.length < 30 ? p.userId : 'N/A');
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                        <td className="p-3 font-medium text-black dark:text-white">{p.ns}</td>
                        <td className="p-3 text-black dark:text-white">{p.clientName}</td>
                        <td className="p-3 text-black dark:text-white">{designerName}</td>
                        <td className="p-3 text-center text-emerald-600 dark:text-emerald-400 font-medium">{formatDuration(p.totalActiveSeconds)}</td>
                        <td className="p-3 text-center text-red-600 dark:text-red-400 font-medium">{formatDuration(p.interruptionSeconds || 0)}</td>
                        <td className="p-3 text-center text-black dark:text-white font-bold">{formatDuration(p.totalSeconds || 0)}</td>
                        <td className="p-3 text-right text-black dark:text-white font-bold">
                          {(p.totalActiveSeconds * costPerSecond).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                    );
                  })}
                  {productivityData.projects.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500 italic">Nenhum projeto concluído neste período.</td>
                    </tr>
                  )}
                  {productivityData.projects.length > 0 && (
                    <tr className="bg-gray-50 dark:bg-black font-bold border-t-2 border-gray-200 dark:border-slate-600">
                      <td colSpan={3} className="p-3 text-right text-black dark:text-white">TOTAL DO PERÍODO:</td>
                      <td className="p-3 text-center text-emerald-600 dark:text-emerald-400">{formatDuration(productivityData.totalProductiveSeconds)}</td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400">{formatDuration(productivityData.totalInterruptionSeconds)}</td>
                      <td className="p-3 text-center text-black dark:text-white">{formatDuration(productivityData.totalSeconds)}</td>
                      <td className="p-3 text-right text-black dark:text-white">
                        {(productivityData.totalProductiveSeconds * costPerSecond).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => handleExportProductivity('CSV')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> CSV
              </button>
              <button 
                onClick={() => handleExportProductivity('PDF')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> PDF
              </button>
              <button 
                onClick={() => handleExportProductivity('EXCEL')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Designer Productivity Report Section */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'designers' ? null : 'designers')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-purple-600" />
            <h3 className="font-bold text-black dark:text-white">Produtividade por Projetista (Liberações)</h3>
          </div>
          {expandedSection === 'designers' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'designers' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Projetista</th>
                    <th className="p-3 text-center">Projetos Liberados</th>
                    <th className="p-3 text-center">Tempo Produtivo</th>
                    <th className="p-3 text-center">Tempo Parada</th>
                    <th className="p-3 text-right">Custo Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {designerData.map((item) => (
                    <React.Fragment key={item.name}>
                      <tr 
                        className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                        onClick={() => setExpandedDesigner(expandedDesigner === item.name ? null : item.name)}
                      >
                        <td className="p-3 font-medium text-black dark:text-white flex items-center gap-2">
                          {item.projects.length > 0 && (
                            expandedDesigner === item.name ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                          {item.name}
                        </td>
                        <td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">{item.count}</td>
                        <td className="p-3 text-center text-emerald-600 dark:text-emerald-400">{formatDuration(item.productiveSeconds)}</td>
                        <td className="p-3 text-center text-red-600 dark:text-red-400">{formatDuration(item.interruptionSeconds)}</td>
                        <td className="p-3 text-right text-black dark:text-white font-bold">
                          {item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                      {expandedDesigner === item.name && item.projects.length > 0 && (
                        <tr className="bg-slate-50 dark:bg-slate-900/50">
                          <td colSpan={5} className="p-0">
                            <div className="p-4 space-y-2">
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Detalhamento de Liberações</h4>
                              <div className="grid grid-cols-3 gap-4 text-xs font-medium text-gray-400 border-b border-gray-200 dark:border-slate-700 pb-1">
                                <span>NS / Projeto</span>
                                <span>Cliente</span>
                                <span className="text-right">Custo do Projeto</span>
                              </div>
                              {item.projects.map((proj, idx) => (
                                <div key={idx} className="grid grid-cols-3 gap-4 text-xs py-1 border-b border-gray-100 dark:border-slate-800 last:border-0">
                                  <span className="text-black dark:text-white">{proj.ns}</span>
                                  <span className="text-gray-600 dark:text-gray-400">{proj.client}</span>
                                  <span className="text-right font-bold text-black dark:text-white">
                                    {proj.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {designerData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 italic">Nenhum dado de produtividade para este período.</td>
                    </tr>
                  )}
                  {designerData.length > 0 && (
                    <tr className="bg-gray-50 dark:bg-black font-bold border-t-2 border-gray-200 dark:border-slate-600">
                      <td className="p-3 text-black dark:text-white">TOTAL GERAL:</td>
                      <td className="p-3 text-center text-blue-600 dark:text-blue-400">
                        {designerData.reduce((acc, curr) => acc + curr.count, 0)}
                      </td>
                      <td className="p-3 text-center text-emerald-600 dark:text-emerald-400">
                        {formatDuration(designerData.reduce((acc, curr) => acc + curr.productiveSeconds, 0))}
                      </td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400">
                        {formatDuration(designerData.reduce((acc, curr) => acc + curr.interruptionSeconds, 0))}
                      </td>
                      <td className="p-3 text-right text-black dark:text-white">
                        {designerData.reduce((acc, curr) => acc + curr.totalCost, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => handleExportDesigners('CSV')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> CSV
              </button>
              <button 
                onClick={() => handleExportDesigners('PDF')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> PDF
              </button>
              <button 
                onClick={() => handleExportDesigners('EXCEL')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Client Cost Report (Module 6) */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'clients' ? null : 'clients')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Users className="w-5 h-5 text-indigo-600" />
            <h3 className="font-bold text-black dark:text-white">Custo de Engenharia por Cliente</h3>
          </div>
          {expandedSection === 'clients' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'clients' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-center">Projetos</th>
                    <th className="p-3 text-center">Tempo Produtivo</th>
                    <th className="p-3 text-center">Tempo Parada</th>
                    <th className="p-3 text-right">Custo Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {clientData.map((item) => (
                    <tr key={item.clientName} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-medium text-black dark:text-white">{item.clientName}</td>
                      <td className="p-3 text-center text-black dark:text-white">{item.count}</td>
                      <td className="p-3 text-center text-emerald-600 dark:text-emerald-400">{formatDuration(item.productiveSeconds)}</td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400">{formatDuration(item.interruptionSeconds)}</td>
                      <td className="p-3 text-right text-black dark:text-white font-bold">
                        {item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                  {clientData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 italic">Nenhum dado financeiro para este período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => handleExportClients('CSV')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> CSV
              </button>
              <button 
                onClick={() => handleExportClients('PDF')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> PDF
              </button>
              <button 
                onClick={() => handleExportClients('EXCEL')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Deadline Prediction (Module 5) */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'deadlines' ? null : 'deadlines')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-black dark:text-white">Previsão Automática de Prazos</h3>
          </div>
          {expandedSection === 'deadlines' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'deadlines' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-100 dark:border-emerald-900/30 flex items-start gap-3">
              <Info className="w-5 h-5 text-emerald-600 mt-0.5" />
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                As previsões abaixo são calculadas com base na <strong>média histórica de tempo</strong> para cada tipo de projeto. Projetos sem histórico usam uma média padrão de 8 horas.
              </p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Projeto</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3 text-center">Tempo Realizado</th>
                    <th className="p-3 text-center">Média Histórica</th>
                    <th className="p-3 text-center">Previsão de Término</th>
                    <th className="p-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {deadlinePredictions.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-medium text-black dark:text-white">
                        <div className="flex flex-col">
                          <span>{p.ns}</span>
                          <span className="text-[10px] text-gray-500">{p.clientName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-black dark:text-white">{p.type || 'Padrão'}</td>
                      <td className="p-3 text-center text-black dark:text-white">{formatDuration(p.totalActiveSeconds)}</td>
                      <td className="p-3 text-center text-gray-500">{formatDuration(p.avgForType)}</td>
                      <td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">
                        {p.predictedEndDate.toLocaleDateString('pt-BR')} {p.predictedEndDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                          p.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {p.status === 'IN_PROGRESS' ? 'EM CURSO' : 'PAUSADO'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {deadlinePredictions.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-500 italic">Nenhum projeto em andamento para prever prazos.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bottleneck Report Section */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'bottlenecks' ? null : 'bottlenecks')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-amber-600" />
            <h3 className="font-bold text-black dark:text-white">Relatório por Departamento / Área (Gargalos)</h3>
          </div>
          {expandedSection === 'bottlenecks' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'bottlenecks' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Área Responsável</th>
                    <th className="p-3 text-center">Qtd. Paradas</th>
                    <th className="p-3 text-center">Tempo Total Perdido</th>
                    <th className="p-3 text-center">Tempo Médio</th>
                    <th className="p-3 text-right">Custo Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {bottleneckData.map((item, index) => (
                    <tr key={item.area} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 font-medium text-black dark:text-white">
                        <div className="flex items-center">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mr-2 ${
                            index === 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {index + 1}
                          </span>
                          {item.area}
                        </div>
                      </td>
                      <td className="p-3 text-center text-black dark:text-white">{item.count}</td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400 font-bold">{item.totalHours}h</td>
                      <td className="p-3 text-center text-black dark:text-white">{item.avgMinutes}m</td>
                      <td className="p-3 text-right text-black dark:text-white font-bold">
                        {(item as any).totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                  {bottleneckData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 italic">Nenhuma parada registrada neste período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => handleExportBottlenecks('CSV')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> CSV
              </button>
              <button 
                onClick={() => handleExportBottlenecks('PDF')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> PDF
              </button>
              <button 
                onClick={() => handleExportBottlenecks('EXCEL')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detailed Interruption Report (New) */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'detailedInterruptions' ? null : 'detailedInterruptions')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <h3 className="font-bold text-black dark:text-white">Relatório Detalhado de Paradas</h3>
          </div>
          {expandedSection === 'detailedInterruptions' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'detailedInterruptions' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">Data</th>
                    <th className="p-3">NS</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Quem Registrou</th>
                    <th className="p-3">Área</th>
                    <th className="p-3 text-center">Tempo</th>
                    <th className="p-3 text-right">Custo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {detailedInterruptionData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                      <td className="p-3 text-black dark:text-white">{new Date(item.startTime).toLocaleDateString('pt-BR')}</td>
                      <td className="p-3 text-black dark:text-white">{item.projectNs}</td>
                      <td className="p-3 text-black dark:text-white">{item.clientName}</td>
                      <td className="p-3 text-black dark:text-white">{item.designerName}</td>
                      <td className="p-3 text-black dark:text-white">{item.responsibleArea}</td>
                      <td className="p-3 text-center text-red-600 dark:text-red-400 font-medium">{formatDuration(item.totalTimeSeconds)}</td>
                      <td className="p-3 text-right text-black dark:text-white font-bold">
                        {item.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </td>
                    </tr>
                  ))}
                  {detailedInterruptionData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-gray-500 italic">Nenhuma parada registrada neste período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => handleExportDetailedInterruptions('CSV')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> CSV
              </button>
              <button 
                onClick={() => handleExportDetailedInterruptions('PDF')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> PDF
              </button>
              <button 
                onClick={() => handleExportDetailedInterruptions('EXCEL')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* NS Aggregation Report Section */}
      <div className="bg-white dark:bg-black rounded-xl border border-gray-100 dark:border-slate-700 shadow-sm overflow-hidden">
        <button 
          onClick={() => setExpandedSection(expandedSection === 'nsAggregation' ? null : 'nsAggregation')}
          className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-orange-600" />
            <h3 className="font-bold text-black dark:text-white">Agregação por NS / Código (Múltiplos Projetistas)</h3>
          </div>
          {expandedSection === 'nsAggregation' ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>

        {expandedSection === 'nsAggregation' && (
          <div className="p-6 border-t border-gray-100 dark:border-slate-700 space-y-4">
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-100 dark:border-orange-900/30 flex items-start gap-3">
              <Info className="w-5 h-5 text-orange-600 mt-0.5" />
              <p className="text-sm text-orange-800 dark:text-orange-200">
                Este relatório agrupa todos os lançamentos feitos para o mesmo <strong>NS / Código</strong>, somando as contribuições de diferentes projetistas para chegar ao valor total do projeto.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 dark:bg-black text-black dark:text-white font-medium border-b border-gray-100 dark:border-slate-700">
                  <tr>
                    <th className="p-3">NS / Código</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3 text-center">Total de Lançamentos</th>
                    <th className="p-3 text-center">Tempo Total</th>
                    <th className="p-3 text-right">Custo Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
                  {nsAggregationData.map((item) => (
                    <React.Fragment key={item.ns}>
                      <tr 
                        className="hover:bg-gray-50 dark:hover:bg-slate-700/50 cursor-pointer"
                        onClick={() => setExpandedNs(expandedNs === item.ns ? null : item.ns)}
                      >
                        <td className="p-3 font-medium text-black dark:text-white flex items-center gap-2">
                          {Object.keys(item.contributors).length > 0 && (
                            expandedNs === item.ns ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                          )}
                          {item.ns}
                        </td>
                        <td className="p-3 text-black dark:text-white">{item.clientName}</td>
                        <td className="p-3 text-center font-bold text-orange-600 dark:text-orange-400">{item.totalSessions}</td>
                        <td className="p-3 text-center text-emerald-600 dark:text-emerald-400">{formatDuration(item.totalProductiveSeconds)}</td>
                        <td className="p-3 text-right text-black dark:text-white font-bold">
                          {item.totalCost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </td>
                      </tr>
                      {expandedNs === item.ns && (
                        <tr className="bg-slate-50 dark:bg-slate-900/50">
                          <td colSpan={5} className="p-0">
                            <div className="p-4 space-y-2">
                              <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Detalhamento por Projetista</h4>
                              <div className="grid grid-cols-4 gap-4 text-xs font-medium text-gray-400 border-b border-gray-200 dark:border-slate-700 pb-1">
                                <span>Projetista</span>
                                <span className="text-center">Lançamentos</span>
                                <span className="text-center">Tempo</span>
                                <span className="text-right">Custo Contribuído</span>
                              </div>
                              {Object.values(item.contributors).map((contributor: any, idx) => (
                                <div key={idx} className="grid grid-cols-4 gap-4 text-xs py-1 border-b border-gray-100 dark:border-slate-800 last:border-0">
                                  <span className="text-black dark:text-white">{contributor.name}</span>
                                  <span className="text-center text-gray-600 dark:text-gray-400">{contributor.sessions}</span>
                                  <span className="text-center text-emerald-600 dark:text-emerald-400">{formatDuration(contributor.seconds)}</span>
                                  <span className="text-right font-bold text-black dark:text-white">
                                    {contributor.cost.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                  {nsAggregationData.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500 italic">Nenhum dado para este período.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => handleExportNsAggregation('CSV')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> CSV
              </button>
              <button 
                onClick={() => handleExportNsAggregation('PDF')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> PDF
              </button>
              <button 
                onClick={() => handleExportNsAggregation('EXCEL')}
                className="flex items-center px-3 py-1.5 bg-slate-100 dark:bg-black text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 transition-colors text-xs font-medium"
              >
                <Download className="w-3 h-3 mr-1" /> Excel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Designer Productivity Section (REMOVED REDUNDANT) */}
    </div>
  );
};
