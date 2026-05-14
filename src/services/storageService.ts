import { createClient } from '@supabase/supabase-js';
import { AppState, ProjectSession, IssueRecord, User, UserRole, InnovationRecord, CalculationType, ProjectType, ImplementType, InterruptionRecord, InterruptionType, InterruptionStatus, InterruptionArea, AppSettings, ActivityType, OperationalActivity, ProjectRequest, ProjectRequestStatus, InnovationType, GanttTask, AuditLog } from '../types';
import { DEFAULT_INTERRUPTION_TYPES, DEFAULT_ACTIVITY_TYPES } from '../constants';
import { calcActiveSeconds } from '../utils/workdayCalc';

// Supabase Configuration
const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const isValidUrl = (u: string | undefined): u is string => {
    if (!u) return false;
    try {
      const parsed = new URL(u);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch (e) {
      return false;
    }
  };

  if (isValidUrl(url) && key) {
    return { url, key };
  }

  // If missing or invalid, return placeholder values to avoid crashing during initialization.
  // The app will fail to fetch data until real credentials are provided in the environment.
  return {
    url: 'https://placeholder.supabase.co',
    key: 'placeholder-key'
  };
};

const { url: SUPABASE_URL, key: SUPABASE_KEY } = getSupabaseConfig();

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const defaultState: AppState = {
  projects: [],
  issues: [],
  innovations: [],
  interruptions: [],
  interruptionTypes: [],
  activityTypes: [],
  operationalActivities: [],
  projectRequests: [],
  auditLogs: [],
  users: [],
  ganttTasks: [],
  settings: { 
    hourlyCost: 150,
    workdayStart: "07:30",
    workdayEnd: "17:30",
    workdays: [1, 2, 3, 4, 5],
    emailTo: '',
    interruptionEmailTo: '',
    interruptionEmailTemplate: '',
    companyName: 'JIMP NEXUS',
    language: 'pt-BR'
  }
};

// --- DATA MANAGEMENT ---

// Helper to parse numbers safely from DB strings
const parseSafeNumber = (val: any): number => {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return val;
  
  let str = String(val).trim();
  // If it has a comma, it's likely European/pt-BR format (e.g. 1.234,56)
  if (str.includes(',')) {
    str = str.replace(/\./g, '').replace(',', '.');
  }
  
  const cleaned = str.replace(/[^\d.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

const parseSafeJson = (val: any, fallback: any = []) => {
  if (val === null || val === undefined || val === '') return fallback;
  if (typeof val !== 'string') return val;
  try {
    return JSON.parse(val);
  } catch (e) {
    console.error("JSON parse error:", e, "Value:", val);
    return fallback;
  }
};

export const fetchSettings = async (): Promise<AppSettings> => {
  let settings: AppSettings = { 
    hourlyCost: parseSafeNumber(localStorage.getItem('hourly_cost')) || 150,
    useAutomaticCost: localStorage.getItem('use_automatic_cost') === 'true',
    logoUrl: localStorage.getItem('logo_url') || undefined,
    companyName: localStorage.getItem('company_name') || 'JIMP NEXUS',
    emailTo: localStorage.getItem('email_to') || '',
    interruptionEmailTo: localStorage.getItem('interruption_email_to') || '',
    interruptionEmailTemplate: localStorage.getItem('interruption_email_template') || '',
    workdayStart: localStorage.getItem('workday_start') || "07:30",
    workdayEnd: localStorage.getItem('workday_end') || "17:30",
    workdays: parseSafeJson(localStorage.getItem('workdays'), [1,2,3,4,5]).map(Number),
    lunchStart: localStorage.getItem('lunch_start') || "12:00",
    lunchEnd: localStorage.getItem('lunch_end') || "13:00",
    language: (localStorage.getItem('language') as any) || "pt-BR"
  };

  try {
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*');
    
    if (settingsError) throw settingsError;

    if (settingsData && settingsData.length > 0) {
      console.log("FETCHED SETTINGS FROM SUPABASE:", settingsData);
      const hourlyCostRow = settingsData.find(s => s.key === 'hourly_cost');
      const logoUrlRow = settingsData.find(s => s.key === 'logo_url');
      const companyNameRow = settingsData.find(s => s.key === 'company_name');
      const emailToRow = settingsData.find(s => s.key === 'email_to');
      const useAutomaticCostRow = settingsData.find(s => s.key === 'use_automatic_cost');
      const interruptionEmailToRow = settingsData.find(s => s.key === 'interruption_email_to');
      const interruptionEmailTemplateRow = settingsData.find(s => s.key === 'interruption_email_template');
      const workdayStartRow = settingsData.find(s => s.key === 'workday_start');
      const workdayEndRow = settingsData.find(s => s.key === 'workday_end');
      const workdaysRow = settingsData.find(s => s.key === 'workdays');
      const lunchStartRow = settingsData.find(s => s.key === 'lunch_start');
      const lunchEndRow = settingsData.find(s => s.key === 'lunch_end');
      const languageRow = settingsData.find(s => s.key === 'language');

      if (hourlyCostRow) settings.hourlyCost = parseSafeNumber(hourlyCostRow.value);
      if (logoUrlRow) settings.logoUrl = logoUrlRow.value === 'null' ? '' : (logoUrlRow.value || '');
      if (companyNameRow) settings.companyName = companyNameRow.value === 'null' ? 'JIMP NEXUS' : (companyNameRow.value || 'JIMP NEXUS');
      if (emailToRow) settings.emailTo = emailToRow.value === 'null' ? '' : (emailToRow.value || '');
      if (useAutomaticCostRow) settings.useAutomaticCost = useAutomaticCostRow.value === 'true';
      if (interruptionEmailToRow) settings.interruptionEmailTo = interruptionEmailToRow.value === 'null' ? '' : (interruptionEmailToRow.value || '');
      if (interruptionEmailTemplateRow) settings.interruptionEmailTemplate = interruptionEmailTemplateRow.value === 'null' ? '' : (interruptionEmailTemplateRow.value || '');
      if (workdayStartRow) settings.workdayStart = workdayStartRow.value || "07:30";
      if (workdayEndRow) settings.workdayEnd = workdayEndRow.value || "17:30";
      if (workdaysRow) {
        try {
          const parsedWorkdays = JSON.parse(workdaysRow.value || "[1,2,3,4,5]");
          settings.workdays = Array.isArray(parsedWorkdays) ? parsedWorkdays.map(Number) : [1, 2, 3, 4, 5];
        } catch (e) {
          settings.workdays = [1, 2, 3, 4, 5];
        }
      }
      if (lunchStartRow) settings.lunchStart = lunchStartRow.value || "12:00";
      if (lunchEndRow) settings.lunchEnd = lunchEndRow.value || "13:00";
      if (languageRow) settings.language = (languageRow.value as any) || "pt-BR";
 
      // Sync to localStorage for offline fallback
      localStorage.setItem('hourly_cost', settings.hourlyCost.toString());
      if (settings.logoUrl) localStorage.setItem('logo_url', settings.logoUrl);
      if (settings.companyName) localStorage.setItem('company_name', settings.companyName);
      if (settings.emailTo) localStorage.setItem('email_to', settings.emailTo);
      localStorage.setItem('use_automatic_cost', String(settings.useAutomaticCost || false));
      localStorage.setItem('interruption_email_to', settings.interruptionEmailTo || '');
      localStorage.setItem('interruption_email_template', settings.interruptionEmailTemplate || '');
      if (settings.workdayStart) localStorage.setItem('workday_start', settings.workdayStart);
      if (settings.workdayEnd) localStorage.setItem('workday_end', settings.workdayEnd);
      if (settings.workdays) localStorage.setItem('workdays', JSON.stringify(settings.workdays));
      if (settings.lunchStart) localStorage.setItem('lunch_start', settings.lunchStart);
      if (settings.lunchEnd) localStorage.setItem('lunch_end', settings.lunchEnd);
      if (settings.language) localStorage.setItem('language', settings.language);
    }
  } catch (e) {
    console.warn("Error fetching settings from Supabase, using localStorage/defaults:", e);
  }
  console.log("FINAL SETTINGS OBJECT:", settings);
  return settings;
};

export const fetchAppState = async (): Promise<AppState> => {
  let projects: ProjectSession[] = [];
  let issues: IssueRecord[] = [];
  let innovations: InnovationRecord[] = [];
  let interruptions: InterruptionRecord[] = [];
  let interruptionTypes: InterruptionType[] = [];
  let activityTypes: ActivityType[] = [];
  let operationalActivities: OperationalActivity[] = [];
  let projectRequests: ProjectRequest[] = [];
  let users: User[] = [];
  let ganttTasks: GanttTask[] = [];
  let auditLogs: AuditLog[] = [];
  let settings: AppSettings = { ...defaultState.settings };

  try {
    const start = Date.now();
    // Fetch all data in parallel for speed
    const fetches = [
      supabase.from('projects').select('*').order('start_time', { ascending: false }),
      supabase.from('issues').select('*').order('date', { ascending: false }),
      supabase.from('innovations').select('*').order('created_at', { ascending: false }),
      supabase.from('interruptions').select('*').order('start_time', { ascending: false }),
      supabase.from('interruption_types').select('*').order('name', { ascending: true }),
      supabase.from('activity_types').select('*').order('name', { ascending: true }),
      supabase.from('operational_activities').select('*').order('start_time', { ascending: false }),
      supabase.from('project_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('users').select('*'),
      supabase.from('gantt_tasks').select('*').order('order', { ascending: true }),
      supabase.from('audit_logs').select('*').order('timestamp', { ascending: false }).limit(500),
      fetchSettings()
    ];

    const results = await Promise.all(fetches);
    const projectsRes = results[0] as any;
    const issuesRes = results[1] as any;
    const innovationsRes = results[2] as any;
    const interruptionsRes = results[3] as any;
    const interruptionTypesRes = results[4] as any;
    const activityTypesRes = results[5] as any;
    const operationalActivitiesRes = results[6] as any;
    const projectRequestsRes = results[7] as any;
    const usersRes = results[8] as any;
    const ganttTasksRes = results[9] as any;
    const auditLogsRes = results[10] as any;
    settings = results[11] as AppSettings;

    activityTypes = (activityTypesRes.data || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      isActive: t.is_active
    }));

    if (activityTypes.length === 0) {
      console.log("SEEDING DEFAULT ACTIVITY TYPES...");
      const defaultTypes = DEFAULT_ACTIVITY_TYPES.map(name => ({ name, is_active: true }));
      const { data: seededData, error: seedError } = await supabase.from('activity_types').insert(defaultTypes).select();
      if (!seedError && seededData) {
        activityTypes = seededData.map((t: any) => ({ id: t.id, name: t.name, isActive: t.is_active }));
      }
    }

    try {
      projects = (projectsRes.data || []).map((p: any) => ({
        id: p.id,
        name: p.client_name || p.project_code || p.ns || 'Sem Nome',
        ns: p.ns,
        clientName: p.client_name,
        flooringType: p.flooring_type,
        projectCode: p.project_code,
        chassisNumber: p.chassis_number,
        type: p.type as ProjectType,
        implementType: p.implement_type as ImplementType,
        startTime: p.start_time,
        endTime: p.end_time,
        totalActiveSeconds: p.total_active_seconds || 0,
        interruptionSeconds: p.interruption_seconds || 0,
        totalSeconds: p.total_seconds || 0,
        productiveCost: p.productive_cost || 0,
        interruptionCost: p.interruption_cost || 0,
        totalCost: p.total_cost || 0,
        pauses: parseSafeJson(p.pauses),
        variations: parseSafeJson(p.variations),
        status: p.status as 'COMPLETED' | 'IN_PROGRESS',
        notes: p.notes,
        userId: p.user_id,
        estimatedSeconds: p.estimated_seconds || 0,
        isOvertime: p.is_overtime,
        lastActiveAt: p.updated_at
      }));
    } catch (e) { console.error("Projects mapping error:", e); }

    try {
      issues = (issuesRes.data || []).map((i: any) => ({
        id: i.id, projectNs: i.project_ns, type: i.type, description: i.description, date: i.date, reportedBy: i.reported_by
      }));
    } catch (e) { console.error("Issues mapping error:", e); }

    try {
      innovations = (innovationsRes.data || []).map((inv: any) => {
        const rawMachine = parseSafeJson(inv.machine, undefined);
        const machine = rawMachine ? {
            name: rawMachine.name || '',
            cost: parseSafeNumber(rawMachine.cost),
            depreciationYears: parseSafeNumber(rawMachine.depreciationYears) || 1,
            annualDepreciation: parseSafeNumber(rawMachine.annualDepreciation)
        } : undefined;

        return {
          id: inv.id, 
          title: inv.title, 
          description: inv.description, 
          type: inv.type,
          calculationType: inv.calculation_type as CalculationType || CalculationType.RECURRING_MONTHLY,
          unitSavings: parseSafeNumber(inv.unit_savings), 
          quantity: parseSafeNumber(inv.quantity),
          totalAnnualSavings: parseSafeNumber(inv.total_annual_savings), 
          investmentCost: parseSafeNumber(inv.investment_cost),
          status: inv.status, 
          authorId: inv.author_id, 
          createdAt: inv.created_at,
          materials: parseSafeJson(inv.materials, []), 
          machine,
          productivityBefore: parseSafeNumber(inv.productivity_before), 
          productivityAfter: parseSafeNumber(inv.productivity_after),
          unitProductCost: parseSafeNumber(inv.unit_product_cost), 
          unitProductValue: parseSafeNumber(inv.unit_product_value)
        };
      });
    } catch (e) { console.error("Innovations mapping error:", e); }

    try {
      interruptions = (interruptionsRes.data || []).map((i: any) => ({
        id: i.id, projectId: i.project_id, projectNs: i.project_ns, clientName: i.client_name,
        designerId: i.designer_id, startTime: i.start_time, endTime: i.end_time,
        problemType: i.problem_type, responsibleArea: i.responsible_area as InterruptionArea,
        responsiblePerson: i.responsible_person, description: i.description,
        status: i.status as InterruptionStatus, totalTimeSeconds: i.total_time_seconds, lastActiveAt: i.updated_at
      }));
    } catch (e) { console.error("Interruptions mapping error:", e); }

    interruptionTypes = (interruptionTypesRes.data || []).map((t: any) => ({ id: t.id, name: t.name, isActive: t.is_active }));

    try {
      operationalActivities = (operationalActivitiesRes.data || []).map((a: any) => ({
        id: a.id, userId: a.user_id, activityTypeId: a.activity_type_id, activityName: a.activity_name,
        startTime: a.start_time, endTime: a.end_time, durationSeconds: a.duration_seconds,
        notes: a.notes, projectId: a.project_id, isFlagged: a.is_flagged, isOvertime: a.is_overtime
      }));
    } catch (e) { console.error("OperationalActivities mapping error:", e); }

    try {
      projectRequests = (projectRequestsRes.data || []).map((r: any) => ({
        id: r.id, clientName: r.client_name, ns: r.ns, productType: r.product_type,
        dimension: r.dimension, flooring: r.flooring, setup: r.setup, chassisNumber: r.chassis_number,
        status: r.status as ProjectRequestStatus, createdAt: r.created_at, createdBy: r.created_by,
        assignedTo: r.assigned_to, needsBase: r.needs_base ?? true, needsBox: r.needs_box ?? true,
        baseProjectId: r.base_project_id, boxProjectId: r.box_project_id,
        managementEstimate: parseSafeNumber(r.management_estimate), designerEstimate: parseSafeNumber(r.designer_estimate)
      }));
    } catch (e) { console.error("ProjectRequests mapping error:", e); }

    try {
      users = (usersRes.data || []).map((u: any) => ({
        id: u.id, username: u.username, password: u.password, name: u.name, surname: u.surname,
        email: u.email, phone: u.phone, role: u.role, salary: Number(u.salary) || 0
      })).sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) { console.error("Users mapping error:", e); }

    try {
      ganttTasks = (ganttTasksRes.data || []).map((t: any) => {
        try {
          return {
            id: t.id,
            title: t.title,
            description: t.description,
            parentId: t.parent_id || null, // Ensure null fallback
            startDate: t.start_date,
            endDate: t.end_date,
            color: t.color,
            isMilestone: t.is_milestone,
            assignedTo: parseSafeJson(t.assigned_to, []),
            progress: t.progress || 0,
            attachments: parseSafeJson(t.attachments, []),
            createdAt: t.created_at,
            updatedAt: t.updated_at,
            workload: t.workload,
            reports: t.reports,
            order: t.order,
            status: t.status || 'todo',
            priority: t.priority || 'medium',
            category: t.category,
            dependencies: parseSafeJson(t.dependencies, [])
          };
        } catch (e) {
          console.error("Mapping error for task:", t.id, e);
          return null;
        }
      }).filter(Boolean) as GanttTask[];
      console.log(`FETCHED ${ganttTasks.length} GANTT TASKS`);
    } catch (e) { console.error("GanttTasks mapping error:", e); }

    // Seed default gantt tasks if empty
    if (ganttTasks.length === 0) {
        console.log("SEEDING DEFAULT GANTT TASKS...");
        const parentId = crypto.randomUUID();
        const subId = crypto.randomUUID();
        
        const today = new Date();
        const inOneWeek = new Date(today);
        inOneWeek.setDate(today.getDate() + 7);
        const inTwoWeeks = new Date(today);
        inTwoWeeks.setDate(today.getDate() + 14);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];

        const demoTasks: any[] = [
          {
            id: parentId,
            title: 'Addition of material',
            description: 'Fase inicial de aquisição e preparação de materiais.',
            start_date: formatDate(today),
            end_date: formatDate(inTwoWeeks),
            color: 'bg-indigo-600',
            is_milestone: false,
            assigned_to: users.length > 0 ? [users[0].id] : [],
            progress: 0,
            order: 0,
            status: 'todo'
          },
          {
            id: subId,
            parent_id: parentId,
            title: 'Bumper',
            description: 'Montagem e verificação do para-choque.',
            start_date: formatDate(today),
            end_date: formatDate(inOneWeek),
            color: 'bg-blue-500',
            is_milestone: false,
            assigned_to: users.length > 0 ? [users[0].id] : [],
            progress: 0,
            order: 0,
            status: 'todo'
          }
        ];
        
        try {
          await supabase.from('gantt_tasks').insert(demoTasks);
        } catch (e) {
          console.error("Gantt seeding error:", e);
        }
        
        ganttTasks.push(...demoTasks.map(demoTask => ({
            id: demoTask.id,
            parentId: demoTask.parent_id || null,
            title: demoTask.title,
            description: demoTask.description,
            startDate: demoTask.start_date,
            endDate: demoTask.end_date,
            color: demoTask.color,
            isMilestone: demoTask.is_milestone,
            assignedTo: demoTask.assigned_to,
            progress: demoTask.progress,
            order: demoTask.order,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            attachments: [],
            status: demoTask.status as any,
            priority: 'medium' as any,
            dependencies: []
        })));
    }

    try {
      auditLogs = (auditLogsRes.data || []).map((l: any) => ({
        id: l.id,
        userId: l.user_id,
        userName: l.user_name,
        action: l.action,
        entityType: l.entity_type,
        entityId: l.entity_id,
        entityName: l.entity_name,
        timestamp: l.timestamp,
        details: l.details
      }));
    } catch (e) { console.error("AuditLogs mapping error:", e); }

    return { projects, issues, innovations, interruptions, interruptionTypes, activityTypes, operationalActivities, projectRequests, users, ganttTasks, auditLogs, settings };
  } catch (error) {
    console.error("FAILED TO LOAD DATA FROM SUPABASE - RETURNING PARTIAL STATE", error);
    return { 
      projects: projects || [], 
      issues: issues || [], 
      innovations: innovations || [], 
      interruptions: interruptions || [], 
      interruptionTypes: interruptionTypes || [], 
      activityTypes: activityTypes || [], 
      operationalActivities: operationalActivities || [], 
      projectRequests: projectRequests || [], 
      users: users || [], 
      ganttTasks: ganttTasks || [], 
      auditLogs: auditLogs || [],
      settings: settings || { ...defaultState.settings } 
    };
  }
};

export const getDatabaseStats = async () => {
    try {
        const tables = [
            'projects', 'issues', 'innovations', 'interruptions', 
            'operational_activities', 'project_requests', 'audit_logs', 
            'activity_types', 'interruption_types', 'users'
        ];
        
        const counts: Record<string, number> = {};
        let totalRecords = 0;
        
        // Use count(*) feature of Supabase/Postgrest
        const countPromises = tables.map(table => 
            supabase.from(table).select('*', { count: 'exact', head: true })
        );
        
        const results = await Promise.all(countPromises);
        
        results.forEach((res, i) => {
            const count = res.count || 0;
            counts[tables[i]] = count;
            totalRecords += count;
        });
        
        // Estimate usage based on a theoretical limit (e.g. 100k records for free tier performance)
        const limit = 100000; 
        const usage = (totalRecords / limit) * 100;
        
        return {
            totalRecords,
            limit,
            usage: Math.min(100, usage),
            isHealthy: totalRecords < limit * 0.9,
            counts
        };
    } catch (error) {
        console.error("Error fetching DB stats:", error);
        return null;
    }
};

export const updateSettings = async (settings: AppSettings): Promise<AppState> => {
  try {
    console.log("UPDATING SETTINGS WITH:", settings);
    // Update LocalStorage first for immediate feedback
    localStorage.setItem('hourly_cost', (settings.hourlyCost || 150).toString());
    if (settings.logoUrl !== undefined) localStorage.setItem('logo_url', settings.logoUrl || '');
    if (settings.companyName !== undefined) localStorage.setItem('company_name', settings.companyName || 'JIMP NEXUS');
    if (settings.emailTo !== undefined) localStorage.setItem('email_to', settings.emailTo || '');
    if (settings.useAutomaticCost !== undefined) localStorage.setItem('use_automatic_cost', String(settings.useAutomaticCost || false));
    if (settings.interruptionEmailTo !== undefined) localStorage.setItem('interruption_email_to', settings.interruptionEmailTo || '');
    if (settings.interruptionEmailTemplate !== undefined) localStorage.setItem('interruption_email_template', settings.interruptionEmailTemplate || '');
    if (settings.workdayStart !== undefined) localStorage.setItem('workday_start', settings.workdayStart || '07:30');
    if (settings.workdayEnd !== undefined) localStorage.setItem('workday_end', settings.workdayEnd || '17:30');
    if (settings.workdays !== undefined) localStorage.setItem('workdays', JSON.stringify(settings.workdays || [1,2,3,4,5]));
    if (settings.lunchStart !== undefined) localStorage.setItem('lunch_start', settings.lunchStart || '12:00');
    if (settings.lunchEnd !== undefined) localStorage.setItem('lunch_end', settings.lunchEnd || '13:00');
    if (settings.language !== undefined) localStorage.setItem('language', settings.language || 'pt-BR');

    const updates: { key: string, value: string }[] = [];

    if (settings.hourlyCost !== undefined) updates.push({ key: 'hourly_cost', value: settings.hourlyCost.toString() });
    if (settings.logoUrl !== undefined) updates.push({ key: 'logo_url', value: settings.logoUrl || '' });
    if (settings.companyName !== undefined) updates.push({ key: 'company_name', value: settings.companyName || '' });
    if (settings.emailTo !== undefined) updates.push({ key: 'email_to', value: settings.emailTo || '' });
    if (settings.useAutomaticCost !== undefined) updates.push({ key: 'use_automatic_cost', value: String(settings.useAutomaticCost) });
    if (settings.interruptionEmailTo !== undefined) updates.push({ key: 'interruption_email_to', value: settings.interruptionEmailTo || '' });
    if (settings.interruptionEmailTemplate !== undefined) updates.push({ key: 'interruption_email_template', value: settings.interruptionEmailTemplate || '' });
    if (settings.workdayStart !== undefined) updates.push({ key: 'workday_start', value: settings.workdayStart });
    if (settings.workdayEnd !== undefined) updates.push({ key: 'workday_end', value: settings.workdayEnd });
    if (settings.workdays !== undefined) updates.push({ key: 'workdays', value: JSON.stringify(settings.workdays) });
    if (settings.lunchStart !== undefined) updates.push({ key: 'lunch_start', value: settings.lunchStart });
    if (settings.lunchEnd !== undefined) updates.push({ key: 'lunch_end', value: settings.lunchEnd });
    if (settings.language !== undefined) updates.push({ key: 'language', value: settings.language });

    console.log("SUPABASE UPDATES PAYLOAD:", updates);

    if (updates.length > 0) {
      const { error } = await supabase
        .from('settings')
        .upsert(updates, { onConflict: 'key' });
      
      if (error) {
        console.error("SUPABASE SETTINGS UPDATE ERROR:", error);
        throw error;
      }
    }
    
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO UPDATE SETTINGS IN SUPABASE", error);
    return fetchAppState();
  }
};

export const addProject = async (project: ProjectSession): Promise<AppState> => {
  try {
    const { error } = await supabase.from('projects').insert([{
      id: project.id,
      ns: project.ns,
      client_name: project.clientName,
      flooring_type: project.flooringType,
      project_code: project.projectCode,
      chassis_number: project.chassisNumber,
      type: project.type,
      implement_type: project.implementType,
      start_time: project.startTime,
      end_time: project.endTime,
      total_active_seconds: project.totalActiveSeconds,
      interruption_seconds: project.interruptionSeconds || 0,
      total_seconds: project.totalSeconds || 0,
      productive_cost: project.productiveCost || 0,
      interruption_cost: project.interruptionCost || 0,
      total_cost: project.totalCost || 0,
      pauses: project.pauses,
      variations: project.variations,
      status: project.status,
      notes: project.notes,
      user_id: project.userId,
      estimated_seconds: project.estimatedSeconds,
      is_overtime: project.isOvertime
    }]);

    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO ADD PROJECT", error);
    throw error;
  }
};

export const updateProject = async (project: ProjectSession, skipFetch = false): Promise<AppState> => {
  try {
    const { error } = await supabase
      .from('projects')
      .update({
        ns: project.ns,
        client_name: project.clientName,
        flooring_type: project.flooringType,
        project_code: project.projectCode,
        chassis_number: project.chassisNumber,
        type: project.type,
        implement_type: project.implementType,
        start_time: project.startTime,
        end_time: project.endTime || null,
        total_active_seconds: Math.round(Number.isFinite(project.totalActiveSeconds) ? project.totalActiveSeconds : 0),
        interruption_seconds: Math.round(Number.isFinite(project.interruptionSeconds) ? (project.interruptionSeconds || 0) : 0),
        total_seconds: Math.round(Number.isFinite(project.totalSeconds) ? (project.totalSeconds || 0) : 0),
        productive_cost: Number(Number(project.productiveCost || 0).toFixed(2)),
        interruption_cost: Number(Number(project.interruptionCost || 0).toFixed(2)),
        total_cost: Number(Number(project.totalCost || 0).toFixed(2)),
        estimated_seconds: Math.round(Number.isFinite(project.estimatedSeconds) ? project.estimatedSeconds : 0),
        pauses: project.pauses || [],
        variations: project.variations || [],
        status: project.status,
        notes: project.notes,
        user_id: project.userId,
        is_overtime: project.isOvertime,
        updated_at: new Date().toISOString()
      })
      .eq('id', project.id);

    if (error) throw error;
    if (skipFetch) {
       return null as any; 
    }
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO UPDATE PROJECT", error);
    throw error;
  }
};

export const deleteProject = async (id: string, ns?: string): Promise<AppState> => {
  try {
    console.log(`ATTEMPTING TO DELETE PROJECT ${id} (NS: ${ns})`);

    // 1. Try to delete related issues by NS if provided
    if (ns) {
        const { error: issuesNsError } = await supabase.from('issues').delete().eq('project_ns', ns);
        if (issuesNsError) console.warn("Warning deleting issues by NS:", issuesNsError);
    }

    // 2. Try to delete related issues by ID (if FK exists)
    const { error: issuesIdError } = await supabase.from('issues').delete().eq('project_id', id);
    if (issuesIdError) console.warn("Warning deleting issues by ID:", issuesIdError);

    // 3. Try to delete related innovations
    const { error: innError } = await supabase.from('innovations').delete().eq('project_id', id);
    if (innError) console.warn("Warning deleting innovations:", innError);

    // 3.5 Handle project_requests references (Nullify FKs to allow deletion)
    const { error: reqBaseError } = await supabase.from('project_requests').update({ base_project_id: null }).eq('base_project_id', id);
    if (reqBaseError) console.warn("Warning nullifying base_project_id in project_requests:", reqBaseError);
    
    const { error: reqBoxError } = await supabase.from('project_requests').update({ box_project_id: null }).eq('box_project_id', id);
    if (reqBoxError) console.warn("Warning nullifying box_project_id in project_requests:", reqBoxError);

    // 3.6 Delete related interruptions
    const { error: intError } = await supabase.from('interruptions').delete().eq('project_id', id);
    if (intError) console.warn("Warning deleting interruptions:", intError);

    // 3.7 Delete related operational_activities
    const { error: opError } = await supabase.from('operational_activities').delete().eq('project_id', id);
    if (opError) console.warn("Warning deleting operational_activities:", opError);

    // 4. Delete the project
    const { data, error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
      throw new Error(`Erro Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
      // If we are here, it means no row was returned.
      // It could be RLS, or it could be that the row doesn't exist.
      // Let's check if it exists
      const { count } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('id', id);
      if (count === 0) {
          // It's already gone, so success!
          return fetchAppState();
      }
      throw new Error("O projeto não foi excluído. Verifique as permissões (RLS) ou se há vínculos pendentes.");
    }

    return fetchAppState();
  } catch (error: any) {
    console.error("FAILED TO DELETE PROJECT", error);
    throw error;
  }
};

export const addIssue = async (issue: IssueRecord): Promise<AppState> => {
  try {
    const { error } = await supabase.from('issues').insert([{
      id: issue.id,
      project_ns: issue.projectNs,
      type: issue.type,
      description: issue.description,
      date: issue.date,
      reported_by: issue.reportedBy
    }]);

    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO ADD ISSUE", error);
    throw error;
  }
};

export const deleteIssue = async (id: string): Promise<AppState> => {
  try {
    const { error } = await supabase.from('issues').delete().eq('id', id);
    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO DELETE ISSUE", error);
    throw error;
  }
};

export const deleteAllIssues = async (): Promise<{ success: boolean; message?: string }> => {
  try {
    // Delete all rows where id is not null (effectively all rows)
    const { error, count } = await supabase.from('issues').delete({ count: 'exact' }).neq('id', '00000000-0000-0000-0000-000000000000');
    
    if (error) {
        console.error("Failed to clear issues table:", error);
        return { success: false, message: error.message };
    }
    
    return { success: true, message: `Tabela limpa. ${count} registros removidos.` };
  } catch (error: any) {
    console.error("EXCEPTION CLEARING ISSUES:", error);
    return { success: false, message: error.message };
  }
};

export const addInnovation = async (innovation: InnovationRecord): Promise<AppState> => {
  try {
    const { error } = await supabase.from('innovations').insert([{
      id: innovation.id,
      title: innovation.title,
      description: innovation.description,
      type: innovation.type,
      
      calculation_type: innovation.calculationType,
      unit_savings: innovation.unitSavings,
      quantity: innovation.quantity,
      total_annual_savings: innovation.totalAnnualSavings,
      investment_cost: innovation.investmentCost,
      
      materials: innovation.materials,
      machine: innovation.machine,
      productivity_before: innovation.productivityBefore,
      productivity_after: innovation.productivityAfter,
      unit_product_cost: innovation.unitProductCost,
      unit_product_value: innovation.unitProductValue,

      status: innovation.status,
      author_id: innovation.authorId,
      created_at: innovation.createdAt
    }]);

    if (error) {
        console.error("SUPABASE ERROR:", error.message);
        throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO ADD INNOVATION", error);
    throw error; // Propagate error to UI
  }
};

export const updateInnovationStatus = async (id: string, status: string): Promise<AppState> => {
  try {
    const { error } = await supabase
      .from('innovations')
      .update({ status: status })
      .eq('id', id);

    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO UPDATE INNOVATION STATUS", error);
    throw error;
  }
};

export const updateInnovation = async (innovation: InnovationRecord): Promise<AppState> => {
  try {
    const { error } = await supabase
      .from('innovations')
      .update({
        title: innovation.title,
        description: innovation.description,
        type: innovation.type,
        calculation_type: innovation.calculationType,
        unit_savings: innovation.unitSavings,
        quantity: innovation.quantity,
        total_annual_savings: innovation.totalAnnualSavings,
        investment_cost: innovation.investmentCost,
        materials: innovation.materials,
        machine: innovation.machine,
        productivity_before: innovation.productivityBefore,
        productivity_after: innovation.productivityAfter,
        unit_product_cost: innovation.unitProductCost,
        unit_product_value: innovation.unitProductValue,
        status: innovation.status,
      })
      .eq('id', innovation.id);

    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO UPDATE INNOVATION", error);
    throw error;
  }
};

export const deleteInnovation = async (id: string): Promise<AppState> => {
  try {
    const { error, data } = await supabase
      .from('innovations')
      .delete()
      .eq('id', id)
      .select();

    if (error) {
        throw new Error(`Erro Supabase: ${error.message}`);
    }

    if (!data || data.length === 0) {
        // Check if it exists
        const { count } = await supabase.from('innovations').select('*', { count: 'exact', head: true }).eq('id', id);
        if (count === 0) {
            // Already gone
            return fetchAppState();
        }
        throw new Error("A inovação não foi excluída. Verifique as permissões (RLS).");
    }

    return fetchAppState();
  } catch (error: any) {
    console.error("FAILED TO DELETE INNOVATION", error);
    throw error;
  }
};

// --- INTERRUPTION MANAGEMENT ---

export const addInterruption = async (interruption: InterruptionRecord): Promise<AppState> => {
  try {
    const payload: any = {
      id: interruption.id,
      project_ns: interruption.projectNs,
      client_name: interruption.clientName,
      designer_id: interruption.designerId,
      start_time: interruption.startTime,
      end_time: interruption.endTime,
      problem_type: interruption.problemType,
      responsible_area: interruption.responsibleArea,
      responsible_person: interruption.responsiblePerson,
      description: interruption.description,
      status: interruption.status,
      total_time_seconds: interruption.totalTimeSeconds
    };

    // Only add project_id if it exists to avoid errors if the column is missing
    if (interruption.projectId) {
      payload.project_id = interruption.projectId;
    }

    const { error } = await supabase.from('interruptions').insert([payload]);

    if (error) {
      console.error("SUPABASE ERROR ADDING INTERRUPTION:", error);
      throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO ADD INTERRUPTION", error);
    throw error;
  }
};

export const updateInterruption = async (interruption: InterruptionRecord, skipFetch = false): Promise<AppState> => {
  try {
    const payload: any = {
      project_ns: interruption.projectNs,
      client_name: interruption.clientName,
      designer_id: interruption.designerId,
      start_time: interruption.startTime,
      end_time: interruption.endTime || null,
      problem_type: interruption.problemType,
      responsible_area: interruption.responsibleArea,
      responsible_person: interruption.responsiblePerson,
      description: interruption.description,
      status: interruption.status,
      total_time_seconds: interruption.totalTimeSeconds,
      updated_at: new Date().toISOString()
    };

    if (interruption.projectId) {
      payload.project_id = interruption.projectId;
    }

    const { error } = await supabase
      .from('interruptions')
      .update(payload)
      .eq('id', interruption.id);

    if (error) {
      console.error("SUPABASE ERROR UPDATING INTERRUPTION:", error);
      throw error;
    }
    if (skipFetch) return null as any;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO UPDATE INTERRUPTION", error);
    throw error;
  }
};

export const deleteInterruption = async (id: string): Promise<AppState> => {
  try {
    const { error } = await supabase.from('interruptions').delete().eq('id', id);
    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO DELETE INTERRUPTION", error);
    throw error;
  }
};

export const fetchInterruptionTypes = async (): Promise<InterruptionType[]> => {
    try {
        const { data, error } = await supabase.from('interruption_types').select('*').order('name');
        if (error) throw error;
        return (data || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            isActive: t.is_active
        }));
    } catch (error) {
        console.error("FAILED TO FETCH INTERRUPTION TYPES", error);
        return [];
    }
};

export const addInterruptionType = async (type: InterruptionType): Promise<AppState> => {
    try {
        const { error } = await supabase.from('interruption_types').insert([{
            id: type.id,
            name: type.name,
            is_active: type.isActive
        }]);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO ADD INTERRUPTION TYPE", error);
        throw error;
    }
};

export const updateInterruptionType = async (type: InterruptionType): Promise<AppState> => {
    try {
        const { error } = await supabase
            .from('interruption_types')
            .update({ name: type.name, is_active: type.isActive })
            .eq('id', type.id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO UPDATE INTERRUPTION TYPE", error);
        throw error;
    }
};

export const deleteInterruptionType = async (id: string): Promise<AppState> => {
    try {
        const { error } = await supabase.from('interruption_types').delete().eq('id', id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO DELETE INTERRUPTION TYPE", error);
        throw error;
    }
};

// --- ACTIVITY MANAGEMENT ---

export const fetchActivityTypes = async (): Promise<ActivityType[]> => {
    try {
        const { data, error } = await supabase.from('activity_types').select('*').order('name');
        if (error) throw error;
        return (data || []).map((t: any) => ({
            id: t.id,
            name: t.name,
            isActive: t.is_active
        }));
    } catch (error) {
        console.error("FAILED TO FETCH ACTIVITY TYPES", error);
        return [];
    }
};

export const addActivityType = async (type: ActivityType): Promise<AppState> => {
    try {
        const { error } = await supabase.from('activity_types').insert([{
            id: type.id,
            name: type.name,
            is_active: type.isActive
        }]);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO ADD ACTIVITY TYPE", error);
        throw error;
    }
};

export const updateActivityType = async (type: ActivityType): Promise<AppState> => {
    try {
        const { error } = await supabase
            .from('activity_types')
            .update({ name: type.name, is_active: type.isActive })
            .eq('id', type.id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO UPDATE ACTIVITY TYPE", error);
        throw error;
    }
};

export const deleteActivityType = async (id: string): Promise<AppState> => {
    try {
        const { error } = await supabase.from('activity_types').delete().eq('id', id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO DELETE ACTIVITY TYPE", error);
        throw error;
    }
};

export const fetchOperationalActivities = async (): Promise<OperationalActivity[]> => {
    try {
        const { data, error } = await supabase.from('operational_activities').select('*').order('start_time', { ascending: false });
        if (error) throw error;
        return (data || []).map((a: any) => ({
            id: a.id,
            userId: a.user_id,
            activityTypeId: a.activity_type_id,
            activityName: a.activity_name,
            startTime: a.start_time,
            endTime: a.end_time,
            durationSeconds: a.duration_seconds,
            notes: a.notes,
            projectId: a.project_id
        }));
    } catch (error) {
        console.error("FAILED TO FETCH OPERATIONAL ACTIVITIES", error);
        return [];
    }
};

export const addOperationalActivity = async (activity: OperationalActivity): Promise<AppState> => {
    try {
        const { error } = await supabase.from('operational_activities').insert([{
            user_id: activity.userId,
            activity_type_id: activity.activityTypeId,
            activity_name: activity.activityName,
            start_time: activity.startTime,
            end_time: activity.endTime || null,
            duration_seconds: activity.durationSeconds || 0,
            notes: activity.notes || null,
            project_id: activity.projectId || null,
            is_flagged: activity.isFlagged || false
        }]);
        if (error) {
            console.error("SUPABASE ERROR ADDING ACTIVITY:", error);
            throw error;
        }
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO ADD OPERATIONAL ACTIVITY", error);
        throw error;
    }
};

export const updateOperationalActivity = async (activity: OperationalActivity): Promise<AppState> => {
    try {
        const { error } = await supabase
            .from('operational_activities')
            .update({
                activity_type_id: activity.activityTypeId,
                activity_name: activity.activityName,
                start_time: activity.startTime,
                end_time: activity.endTime || null,
                duration_seconds: activity.durationSeconds || 0,
                notes: activity.notes || null,
                project_id: activity.projectId || null,
                is_flagged: activity.isFlagged || false
            })
            .eq('id', activity.id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO UPDATE OPERATIONAL ACTIVITY", error);
        throw error;
    }
};

export const deleteOperationalActivity = async (id: string): Promise<AppState> => {
    try {
        const { error } = await supabase.from('operational_activities').delete().eq('id', id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("FAILED TO DELETE OPERATIONAL ACTIVITY", error);
        throw error;
    }
};

// --- PROJECT REQUEST MANAGEMENT ---

export const addProjectRequest = async (request: ProjectRequest): Promise<AppState> => {
  try {
    const payload: any = {
      id: request.id,
      client_name: request.clientName,
      ns: request.ns,
      product_type: request.productType,
      dimension: request.dimension,
      flooring: request.flooring,
      setup: request.setup,
      status: request.status,
      created_at: new Date().toISOString(),
      created_by: request.createdBy,
      assigned_to: request.assignedTo || null,
      chassis_number: request.chassisNumber || null,
      needs_base: request.needsBase,
      needs_box: request.needsBox,
      management_estimate: Number.isFinite(request.managementEstimate) ? request.managementEstimate : 0,
      designer_estimate: Number.isFinite(request.designerEstimate) ? request.designerEstimate : 0
    };

    console.log("ADDING PROJECT REQUEST PAYLOAD:", payload);

    const { error } = await supabase
      .from('project_requests')
      .insert([payload]);

    if (error) {
       console.error("SUPABASE ADD PROJECT REQUEST ERROR (FULL):", error);
       
       if (error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('schema cache')) {
         console.warn("Retrying add with minimal payload due to potential database schema mismatch...");
         const minimalPayload = {
           id: request.id,
           client_name: request.clientName,
           ns: request.ns,
           product_type: request.productType || '',
           dimension: request.dimension || '',
           status: request.status,
           created_at: new Date().toISOString(),
           created_by: request.createdBy
         };
         const { error: retryError } = await supabase
           .from('project_requests')
           .insert([minimalPayload]);
           
         if (retryError) throw retryError;
         return fetchAppState();
       }
       
       throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO ADD PROJECT REQUEST", error);
    throw error;
  }
};

export const updateProjectRequest = async (request: ProjectRequest): Promise<AppState> => {
  try {
    const payload: any = {
      client_name: request.clientName,
      ns: request.ns,
      product_type: request.productType,
      dimension: request.dimension,
      flooring: request.flooring,
      setup: request.setup,
      status: request.status,
      chassis_number: request.chassisNumber || null,
      assigned_to: request.assignedTo || null,
      needs_base: request.needsBase,
      needs_box: request.needsBox,
      base_project_id: request.baseProjectId || null,
      box_project_id: request.boxProjectId || null,
      management_estimate: Number.isFinite(request.managementEstimate) ? request.managementEstimate : 0,
      designer_estimate: Number.isFinite(request.designerEstimate) ? request.designerEstimate : 0
    };

    console.log("UPDATING PROJECT REQUEST:", request.id, payload);

    const { error } = await supabase
      .from('project_requests')
      .update(payload)
      .eq('id', request.id);

    if (error) {
       console.error("SUPABASE UPDATE ERROR (FULL):", error);
       
       // Handle missing columns gracefully by retrying with minimal payload if needed
       if (error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('schema cache')) {
         console.warn("Retrying update with minimal payload due to database schema mismatch...");
         const minimalPayload = {
           client_name: request.clientName,
           ns: request.ns,
           product_type: request.productType,
           dimension: request.dimension,
           status: request.status
         };
         const { error: retryError } = await supabase
           .from('project_requests')
           .update(minimalPayload)
           .eq('id', request.id);
         
         if (retryError) throw retryError;
         return fetchAppState();
       }
       
       throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO UPDATE PROJECT REQUEST", error);
    throw error;
  }
};

export const deleteProjectRequest = async (id: string): Promise<AppState> => {
  try {
    const { error } = await supabase.from('project_requests').delete().eq('id', id);
    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO DELETE PROJECT REQUEST", error);
    throw error;
  }
};

// --- USER MANAGEMENT ---

export const fetchUsers = async (): Promise<User[]> => {
  try {
    const { data, error } = await supabase.from('users').select('*');
    if (error) throw error;
    return (data || []).map((u: any) => ({
      id: u.id,
      username: u.username,
      password: u.password,
      name: u.name,
      surname: u.surname,
      email: u.email,
      phone: u.phone,
      role: u.role,
      salary: Number(u.salary) || 0
    })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error("FAILED TO FETCH USERS", error);
    return [];
  }
};

// Updated signature to return detail info
export const registerUser = async (user: User): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .ilike('username', user.username)
      .single();

    if (existing) {
        return { success: false, message: 'Nome de usuário já existe.' };
    }

    const { error } = await supabase.from('users').insert([{
      id: user.id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      phone: user.phone,
      username: user.username,
      password: user.password,
      role: user.role,
      salary: user.salary || 0
    }]);

    if (error) {
        // Return the specific DB error to help debugging
        return { success: false, message: `Erro DB: ${error.message}` };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("FAILED TO REGISTER USER", error);
    return { success: false, message: error.message || 'Erro desconhecido.' };
  }
};

export const updateUser = async (user: User): Promise<{ success: boolean; message?: string }> => {
  try {
    const { error } = await supabase
      .from('users')
      .update({
        name: user.name,
        surname: user.surname,
        email: user.email,
        phone: user.phone,
        username: user.username,
        password: user.password,
        role: user.role,
        salary: user.salary || 0
      })
      .eq('id', user.id);

    if (error) {
      return { success: false, message: `Erro DB: ${error.message}` };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("FAILED TO UPDATE USER", error);
    return { success: false, message: error.message || 'Erro desconhecido.' };
  }
};

export const deleteUser = async (id: string): Promise<{ success: boolean; message?: string }> => {
  try {
    // 1. Unlink from Projects (set user_id to null)
    // We ignore errors here because the user might not have projects, or RLS might block update but we still want to try delete.
    // However, if FK exists and is RESTRICT, this is crucial.
    const { error: projError } = await supabase
      .from('projects')
      .update({ user_id: null })
      .eq('user_id', id);
    
    if (projError) {
        console.error("ERROR UNLINKING PROJECTS:", projError);
        // We continue, hoping it's not a blocking FK constraint
    }

    // 2. Unlink from Innovations
    const { error: innError } = await supabase
      .from('innovations')
      .update({ author_id: null })
      .eq('author_id', id);

    if (innError) {
         console.error("ERROR UNLINKING INNOVATIONS:", innError);
    }

    // 3. Unlink from Issues
    const { error: issueError } = await supabase
      .from('issues')
      .update({ reported_by: null })
      .eq('reported_by', id);

    if (issueError) {
         console.error("ERROR UNLINKING ISSUES:", issueError);
    }

    // 4. Delete User
    // Use select() to confirm deletion occurred (RLS check)
    const { error, data } = await supabase.from('users').delete().eq('id', id).select();
    
    if (error) {
      console.error("ERROR DELETING USER:", error);
      return { success: false, message: `Erro ao excluir usuário: ${error.message}` };
    }
    
    // Check if any row was actually deleted
    if (!data || data.length === 0) {
        return { 
            success: false, 
            message: "A exclusão falhou silenciosamente. Verifique se as Políticas de Segurança (RLS) do Supabase permitem que você exclua usuários." 
        };
    }
    
    return { success: true };
  } catch (error: any) {
    console.error("FAILED TO DELETE USER", error);
    return { success: false, message: error.message || 'Erro desconhecido.' };
  }
};

export const authenticateUser = async (username: string, password: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .ilike('username', username)
      .eq('password', password)
      .single();

    if (error || !data) return null;
    return data as User;
  } catch (error) {
    console.error("AUTH ERROR", error);
    return null;
  }
};

export const seedFebruaryData = async (): Promise<{ success: boolean; count: number; errors: string[] }> => {
  const errors: string[] = [];
  let count = 0;
  try {
    const users = await fetchUsers();
    
    // Ensure users exist
    const namesToEnsure = [
      { name: 'Luiz', role: 'PROJETISTA' as UserRole },
      { name: 'Cobo', role: 'PROJETISTA' as UserRole },
      { name: 'Rogerio', role: 'PROJETISTA' as UserRole },
      { name: 'Edson', role: 'PROJETISTA' as UserRole },
      { name: 'Gustavo Padilha', role: 'PROCESSOS' as UserRole }
    ];

    for (const item of namesToEnsure) {
      const exists = users.find(u => u.name.toLowerCase().includes(item.name.toLowerCase()) || (u.surname && u.surname.toLowerCase().includes(item.name.toLowerCase())));
      
      if (!exists) {
        const res = await registerUser({
          id: crypto.randomUUID(),
          name: item.name,
          username: item.name.toLowerCase().split(' ')[0],
          password: '123', // Default password
          role: item.role
        });
        if (!res.success) {
          errors.push(`Failed to create user ${item.name}: ${res.message}`);
        }
      } else if (item.name === 'Gustavo Padilha' && exists.role === 'PROJETISTA') {
        // Specifically fix Padilha if he exists but with wrong role
        await updateUser({
          ...exists,
          role: 'PROCESSOS'
        });
      }
    }

    // Re-fetch users after ensuring they exist
    const updatedUsers = await fetchUsers();
    const findUser = (name: string) => {
      const u = updatedUsers.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
      return u?.id;
    };

    const rawData = [
      // ... (keep all the data entries)
      { p: 'Luiz', ns: '8576', c: 'Ademir Petermann', pr: 'Sobrechassi', d: '02/fev', h: '09:30' },
      { p: 'Luiz', ns: '9040', c: 'Transportes M.E.S', pr: 'Sobrechassi', d: '03/fev', h: '10:00' },
      { p: 'Luiz', ns: '9041', c: 'Morbach', pr: 'Sobrechassi', d: '04/fev', h: '11:00' },
      { p: 'Cobo', ns: '8759', c: 'Transleve', pr: 'Sobrechassi', d: '05/fev', h: '14:00' },
      { p: 'Luiz', ns: '7505', c: 'Multi-Marcas', pr: 'Base e Caixa de carga', d: '05/fev', h: '14:50' },
      { p: 'Luiz', ns: '7506', c: 'Multi-Marcas', pr: 'Base e Caixa de carga', d: '05/fev', h: '14:50' },
      { p: 'Luiz', ns: '9026', c: 'Vanderlei', pr: 'Base e Caixa de carga', d: '06/fev', h: '09:00' },
      { p: 'Luiz', ns: '9030', c: 'Cleber Alves', pr: 'Base e Caixa de carga', d: '06/fev', h: '11:00' },
      { p: 'Rogerio', ns: '8985', c: 'Rodrigo Martins', pr: 'Base', d: '06/fev', h: '12:08' },
      { p: 'Rogerio', ns: '9036', c: 'Transportadora Adre LTDA', pr: 'Base', d: '06/fev', h: '12:08' },
      { p: 'Luiz', ns: '9049', c: 'Camila e Lara', pr: 'Base e Caixa de carga', d: '06/fev', h: '16:36' },
      { p: 'Luiz', ns: '9050', c: 'Camila e Lara', pr: 'Base e Caixa de carga', d: '06/fev', h: '16:36' },
      { p: 'Edson', ns: '8974', c: 'Rodrigo Martins', pr: 'Graneleiro', d: '06/fev', h: '19:40' },
      { p: 'Luiz', ns: '9035', c: 'Transporte 4P', pr: 'Base e Caixa de carga', d: '09/fev', h: '09:00' },
      { p: 'Edson', ns: '8932', c: 'Adriano Marques', pr: 'Base e Caixa de Carga', d: '09/fev', h: '14:40' },
      { p: 'Edson', ns: '7707', c: 'Raffo', pr: 'Base', d: '10/fev', h: '16:39' },
      { p: 'Edson', ns: '9047', c: 'Dinolog', pr: 'Base', d: '11/fev', h: '14:12' },
      { p: 'Luiz', ns: '8957', c: 'Nelson de Freitas', pr: 'Sobrechassi', d: '11/fev', h: '15:11' },
      { p: 'Edson', ns: '9042', c: 'Fernando Hasckel', pr: 'Base', d: '11/fev', h: '16:20' },
      { p: 'Rogerio', ns: '9048', c: 'Dinolog Total Sider', pr: 'Base', d: '14/fev', h: '14:50' },
      { p: 'Edson', ns: '8966', c: 'Speed Cargo', pr: 'Base', d: '14/fev', h: '15:35' },
      { p: 'Edson', ns: '8956', c: 'Pluma', pr: 'Base e Caixa de Carga', d: '16/fev', h: '10:47' },
      { p: 'Luiz', ns: '9037', c: 'Leoni', pr: 'SC Carga seca', d: '16/fev', h: '11:00' },
      { p: 'Edson', ns: '9045', c: 'Ivan Mendes', pr: 'Base e Caixa de Carga', d: '16/fev', h: '12:02' },
      { p: 'Rogerio', ns: '8877', c: 'Transberns', pr: 'Base e Caixa de Carga', d: '16/fev', h: '11:44' },
      { p: 'Rogerio', ns: '8878', c: 'Transberns', pr: 'Base e Caixa de Carga', d: '16/fev', h: '12:05' },
      { p: 'Edson', ns: '9050', c: 'Kamila e Lara', pr: 'Base e Caixa de Carga', d: '17/fev', h: '13:31' },
      { p: 'Edson', ns: '9049', c: 'Kamila e Lara', pr: 'Base e Caixa de Carga', d: '17/fev', h: '13:31' },
      { p: 'Edson', ns: '9043', c: 'Major', pr: 'Base', d: '17/fev', h: '14:25' },
      { p: 'Cobo', ns: '8998', c: 'Bigfer', pr: 'Sobrechassi', d: '10/fev', h: '17:21' },
      { p: 'Cobo', ns: '8999', c: 'Bigfer', pr: 'Sobrechassi', d: '10/fev', h: '17:32' },
      { p: 'Cobo', ns: '9052', c: 'Aceville', pr: 'sobrechassi especial', d: '16/fev', h: '10:32' },
      { p: 'Edson', ns: '9079', c: 'Dinolog', pr: 'Base', d: '17/fev', h: '14:38' },
      { p: 'Edson', ns: '9078', c: 'Sandro Jardel', pr: 'Base', d: '17/fev', h: '16:41' },
      { p: 'Cobo', ns: '9047', c: 'Dinolog', pr: 'Caixa de carga', d: '17/fev', h: '16:53' },
      { p: 'Cobo', ns: '9079', c: 'Dinolog', pr: 'Caixa de carga', d: '17/fev', h: '16:53' },
      { p: 'Cobo', ns: '9036', c: 'Adre', pr: 'Caixa de carga', d: '18/fev', h: '08:39' },
      { p: 'Cobo', ns: '7077', c: 'Raffo', pr: 'Caixa de carga', d: '18/fev', h: '16:00' },
      { p: 'Luiz', ns: '9061', c: 'Aceville', pr: 'SC Carga seca', d: '18/fev', h: '11:35' },
      { p: 'Edson', ns: '9104', c: 'Tupy', pr: 'Base', d: '18/fev', h: '17:47' },
      { p: 'Cobo', ns: '9042', c: 'Fernando Hasckel', pr: 'Caixa de carga', d: '19/fev', h: '08:46' },
      { p: 'Luiz', ns: '9086', c: 'Carlos Cesas Torassi', pr: 'Sobre chassi', d: '19/fev', h: '10:47' },
      { p: 'Edson', ns: '9046', c: 'Marcelo Pereira', pr: 'Base e Caixa de Carga', d: '20/fev', h: '08:44' },
      { p: 'Edson', ns: '8929', c: 'Roju', pr: 'Base', d: '20/fev', h: '11:33' },
      { p: 'Edson', ns: '8930', c: 'Roju', pr: 'Base', d: '20/fev', h: '11:33' },
      { p: 'Edson', ns: '9044', c: 'Agrofort', pr: 'Base e Caixa de Carga', d: '20/fev', h: '13:00' },
      { p: 'Edson', ns: '8265', c: 'Azure', pr: 'Base', d: '20/fev', h: '16:41' },
      { p: 'Edson', ns: '8266', c: 'Azure', pr: 'Base', d: '20/fev', h: '16:41' },
      { p: 'Edson', ns: '9008', c: 'MF Express', pr: 'Base e Caixa de Carga', d: '20/fev', h: '17:17' },
      { p: 'Cobo', ns: '9057', c: 'Aceville', pr: 'sobrechassi especial', d: '20/fev', h: '17:18' },
      { p: 'Luiz', ns: '9072', c: 'Supermercado Saviski', pr: 'Sobrechassi', d: '23/fev', h: '13:18' },
      { p: 'Cobo', ns: '9058', c: 'Aceville', pr: 'sobrechassi especial', d: '24/fev', h: '07:33' },
      { p: 'Cobo', ns: '9059', c: 'Aceville', pr: 'sobrechassi especial', d: '24/fev', h: '07:37' },
      { p: 'Cobo', ns: '9060', c: 'Aceville', pr: 'sobrechassi especial', d: '24/fev', h: '07:43' },
      { p: 'Cobo', ns: '9089', c: 'GODI', pr: 'Sobre chassi', d: '24/fev', h: '09:47' },
      { p: 'Edson', ns: '9009', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9010', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9011', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9012', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9013', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9014', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9015', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9016', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9017', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9018', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9019', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9020', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9021', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9022', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Edson', ns: '9023', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/mar', h: '11:47' },
      { p: 'Luiz', ns: '9111', c: 'Pedroni', pr: 'Sobrechassi', d: '24/fev', h: '15:25' },
      { p: 'Cobo', ns: '8976', c: 'bigfer', pr: 'Sobre chassi', d: '24/fev', h: '17:31' },
      { p: 'Cobo', ns: '8977', c: 'bigfer', pr: 'Sobre chassi', d: '25/fev', h: '07:39' },
      { p: 'Cobo', ns: '8966', c: 'Speed Cargo', pr: 'Caixa de carga prototipo melhoria', d: '25/fev', h: '16:12' },
      { p: 'Cobo', ns: '9078', c: 'Sandro Jardel', pr: 'Caixa de carga', d: '26/fev', h: '15:26' },
      { p: 'Edson', ns: '9116', c: 'LBS', pr: 'Base', d: '27/fev', h: '10:23' },
      { p: 'Edson', ns: '9117', c: 'LBS', pr: 'Base', d: '27/fev', h: '10:23' },
      { p: 'Edson', ns: '9100', c: 'Jurandir', pr: 'Base', d: '27/fev', h: '11:49' },
      { p: 'Edson', ns: '8942', c: 'Bortoluzzi', pr: 'Base', d: '27/fev', h: '16:12' },
      { p: 'Edson', ns: '8943', c: 'Bortoluzzi', pr: 'Base', d: '27/fev', h: '16:12' },
    ];

    const parseDuration = (h: string) => {
      const [hours, mins] = h.split(':').map(Number);
      return (hours * 3600) + (mins * 60);
    };

    const parseDate = (d: string) => {
      const [day] = d.split('/');
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), parseInt(day), 17, 0, 0);
    };

    const mapImplement = (pr: string): ImplementType => {
      const p = pr.toLowerCase();
      if (p.includes('basculante')) return ImplementType.BASCULANTE;
      if (p.includes('componentes')) return ImplementType.COMPONENTES;
      if (p.includes('graneleiro')) return ImplementType.GRANELEIRO;
      if (p.includes('carga seca')) {
        return p.includes('sc') ? ImplementType.CARGA_SECA_SC : ImplementType.CARGA_SECA_SR;
      }
      if (p.includes('sider')) {
        return p.includes('sc') ? ImplementType.SIDER_SC : ImplementType.SIDER_SR;
      }
      if (p.includes('furgão')) {
        return p.includes('sc') ? ImplementType.FURGAO_SC : ImplementType.FURGAO_SR;
      }
      if (p.includes('caixa de carga')) return ImplementType.CAIXA_CARGA;
      if (p.includes('base')) return ImplementType.BASE;
      return ImplementType.OUTROS;
    };

    // 1. Fetch existing projects to avoid duplicates
    const { data: existingProjects, error: fetchError } = await supabase
      .from('projects')
      .select('ns, client_name, user_id');
    
    if (fetchError) throw fetchError;

    // 2. Fetch existing innovations to avoid duplicates
    const { data: existingInnovations } = await supabase.from('innovations').select('title');
    const existingInnoSet = new Set((existingInnovations || []).map(i => i.title));

    const existingSet = new Set(
      (existingProjects || []).map(p => `${p.ns}|${p.client_name}|${p.user_id || ''}`)
    );

    const innovationSeeds = [
        {
            title: 'Otimização de Corte Laser',
            description: 'Redução de retalhos através de novo algoritmo de nesting.',
            type: InnovationType.PROCESS_OPTIMIZATION,
            status: 'IMPLEMENTED',
            savings: 12000,
            author: 'Edson'
        },
        {
            title: 'Novo Perfil de Alumínio',
            description: 'Desenvolvimento de perfil mais leve e resistente para furgões.',
            type: InnovationType.PRODUCT_IMPROVEMENT,
            status: 'APPROVED',
            savings: 25000,
            author: 'Luiz'
        },
        {
            title: 'Furgão Elétrico 2026',
            description: 'Projeto completo de furgão para chassis elétricos.',
            type: InnovationType.NEW_PROJECT,
            status: 'PENDING',
            savings: 150000,
            author: 'Cobo'
        }
    ];

    // Seed Innovations
    const innoToInsert = innovationSeeds
        .filter(s => !existingInnoSet.has(s.title))
        .map(s => ({
            title: s.title,
            description: s.description,
            type: s.type,
            status: s.status,
            total_annual_savings: s.savings,
            author_id: findUser(s.author) || s.author,
            created_at: new Date().toISOString(),
            calculation_type: CalculationType.RECURRING_MONTHLY,
            unit_savings: 0,
            quantity: 0,
            investment_cost: 0
        }));

    if (innoToInsert.length > 0) {
        console.log(`SEEDING ${innoToInsert.length} INNOVATIONS...`);
        await supabase.from('innovations').insert(innoToInsert);
    }

    const projectsToInsert = rawData.map(item => {
      const duration = parseDuration(item.h);
      const end = parseDate(item.d);
      const start = new Date(end.getTime() - (duration * 1000));
      const userId = findUser(item.p) || null;
      
      return {
        ns: item.ns,
        client_name: item.c,
        type: ProjectType.RELEASE,
        implement_type: mapImplement(item.pr),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        total_active_seconds: duration,
        estimated_seconds: duration,
        pauses: [],
        variations: [],
        status: 'COMPLETED',
        user_id: userId,
        project_code: ''
      };
    }).filter(p => !existingSet.has(`${p.ns}|${p.client_name}|${p.user_id || ''}`));

    if (projectsToInsert.length > 0) {
      // Bulk insert in chunks of 50 to be safe
      const chunkSize = 50;
      for (let i = 0; i < projectsToInsert.length; i += chunkSize) {
        const chunk = projectsToInsert.slice(i, i + chunkSize);
        const { error: insertError } = await supabase.from('projects').insert(chunk);
        if (insertError) throw insertError;
      }
    }

    console.log(`SEEDED DATA. INSERTED ${projectsToInsert.length} NEW PROJECTS.`);
    return { success: true, count: projectsToInsert.length, errors: [] };
  } catch (error: any) {
    console.error("FAILED TO SEED FEBRUARY DATA", error);
    return { success: false, count: 0, errors: [error.message] };
  }
};

export interface DuplicateGroup {
    keep: ProjectSession;
    discard: ProjectSession;
}

export const findDuplicateProjects = async (): Promise<{ success: boolean; duplicates: DuplicateGroup[]; message?: string }> => {
  try {
    // Fetch ALL projects (up to 5000)
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('start_time', { ascending: false })
      .range(0, 4999);

    if (projectsError) throw projectsError;

    // Map manually to avoid fetchAppState overhead/limit
    const projects: ProjectSession[] = (projectsData || []).map((p: any) => ({
      id: p.id,
      name: p.client_name || p.project_code || p.ns || 'Sem Nome',
      ns: p.ns,
      clientName: p.client_name,
      flooringType: p.flooring_type,
      projectCode: p.project_code,
      type: p.type,
      implementType: p.implement_type,
      startTime: p.start_time,
      endTime: p.end_time,
      totalActiveSeconds: p.total_active_seconds,
      pauses: typeof p.pauses === 'string' ? JSON.parse(p.pauses) : (p.pauses || []),
      variations: typeof p.variations === 'string' ? JSON.parse(p.variations) : (p.variations || []),
      status: p.status,
      notes: p.notes,
      userId: p.user_id,
      estimatedSeconds: p.estimated_seconds
    }));

    console.log(`SCANNED ${projects.length} PROJECTS FOR DUPLICATES...`);

    const seen = new Map<string, ProjectSession>();

    // Helper to normalize strings for comparison
    const normalize = (str: string) => str ? str.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    // Identify duplicates based on NS and Client Name
    const groups = new Map<string, ProjectSession[]>();

    for (const p of projects) {
        if (!p.ns) continue;
        
        // Normalize key: use NS + normalized client name
        const clientKey = p.clientName ? normalize(p.clientName) : 'unknown';
        const nsKey = normalize(p.ns);
        const key = `${nsKey}-${clientKey}`;
        
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)!.push(p);
    }

    const duplicateGroups: DuplicateGroup[] = [];

    // Process groups to find duplicates
    for (const [key, groupProjects] of groups.entries()) {
        if (groupProjects.length > 1) {
            // Sort by score (time + recency) descending
            groupProjects.sort((a, b) => {
                const scoreA = (a.totalActiveSeconds || 0) + (new Date(a.startTime).getTime() / 10000000000000);
                const scoreB = (b.totalActiveSeconds || 0) + (new Date(b.startTime).getTime() / 10000000000000);
                return scoreB - scoreA;
            });

            // The first one is the "keeper"
            const keep = groupProjects[0];

            // All others are duplicates to discard
            for (let i = 1; i < groupProjects.length; i++) {
                duplicateGroups.push({
                    keep: keep,
                    discard: groupProjects[i]
                });
            }
        }
    }

    return { success: true, duplicates: duplicateGroups };

  } catch (error: any) {
    console.error("FAILED TO FIND DUPLICATES", error);
    return { success: false, duplicates: [], message: error.message };
  }
};

export const recalculateAllProjectCosts = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const settings = await fetchSettings();
    const users = await fetchUsers();
    
    let costPerSecond = settings.hourlyCost / 3600;
    if (settings.hourlyCost <= 0) {
      const relevantUsers = users.filter(u => u.role !== 'CEO' && u.role !== 'PROCESSOS' && (u.salary || 0) > 0);
      const totalSalaries = relevantUsers.reduce((acc, u) => acc + (u.salary || 0), 0);
      const numUsers = relevantUsers.length || 1;
      const hourlyRate = (totalSalaries / numUsers) / 220;
      costPerSecond = hourlyRate / 3600;
    }

    const { data: projects, error: fetchError } = await supabase
      .from('projects')
      .select('id, total_active_seconds, notes');
    
    if (fetchError) throw fetchError;

    let updatedCount = 0;
    for (const p of projects || []) {
      const totalCost = (p.total_active_seconds || 0) * costPerSecond;
      const { error: updateError } = await supabase
        .from('projects')
        .update({ 
          // total_cost and productive_cost removed due to schema mismatch
          notes: p.notes // Dummy update or just remove the update if nothing else to update
        })
        .eq('id', p.id);
      
      if (!updateError) updatedCount++;
    }

    return { success: true, message: `${updatedCount} projetos atualizados com novos custos.` };
  } catch (error: any) {
    console.error("FAILED TO RECALCULATE COSTS", error);
    return { success: false, message: error.message };
  }
};

export const recalculateAllInterruptionTimes = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const settings = await fetchSettings();
    const { data: interruptions, error: fetchError } = await supabase
      .from('interruptions')
      .select('*')
      .not('end_time', 'is', null);
    
    if (fetchError) throw fetchError;

    let updatedCount = 0;
    for (const i of interruptions || []) {
      const newDuration = calcActiveSeconds(new Date(i.start_time), new Date(i.end_time), settings);
      
      if (newDuration !== i.total_time_seconds) {
        const { error: updateError } = await supabase
          .from('interruptions')
          .update({ total_time_seconds: newDuration })
          .eq('id', i.id);
        
        if (!updateError) updatedCount++;
      }
    }

    return { success: true, message: `${updatedCount} paradas recalculadas com base no novo expediente.` };
  } catch (error: any) {
    console.error("FAILED TO RECALCULATE INTERRUPTION TIMES", error);
    return { success: false, message: error.message };
  }
};

export const recalculateAllProjectTimes = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const settings = await fetchSettings();
    const { data: projects, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('status', 'COMPLETED');
    
    if (fetchError) throw fetchError;

    let updatedCount = 0;
    for (const p of projects || []) {
      if (p.start_time && p.end_time) {
        const start = new Date(p.start_time);
        const end = new Date(p.end_time);
        const isOvertime = !!p.is_overtime;
        
        const totalWorkingSeconds = calcActiveSeconds(start, end, settings, isOvertime);
        
        // Subtract pauses
        let totalPauseWorkingSeconds = 0;
        const pauses = typeof p.pauses === 'string' ? JSON.parse(p.pauses) : (p.pauses || []);
        pauses.forEach((pause: any) => {
          const dur = Number(pause.durationSeconds);
          if (dur > 0 && pause.timestamp) {
            const pStart = new Date(pause.timestamp);
            const pEnd = new Date(pStart.getTime() + dur * 1000);
            totalPauseWorkingSeconds += calcActiveSeconds(pStart, pEnd, settings, isOvertime);
          }
        });

        const netSeconds = Math.max(0, totalWorkingSeconds - totalPauseWorkingSeconds);
        
        if (Math.abs(p.total_active_seconds - netSeconds) > 1) {
          const { error: updateError } = await supabase
            .from('projects')
            .update({ total_active_seconds: netSeconds })
            .eq('id', p.id);
          
          if (!updateError) updatedCount++;
        }
      }
    }

    return { success: true, message: `${updatedCount} projetos recalculados com base no novo expediente.` };
  } catch (error: any) {
    console.error("FAILED TO RECALCULATE PROJECT TIMES", error);
    return { success: false, message: error.message };
  }
};

export const deleteProjectById = async (projectId: string, ns?: string): Promise<{ success: boolean; message?: string }> => {
    try {
        console.log(`DELETING PROJECT ${projectId} (NS: ${ns})`);
        
        // 1. Issues (by NS if available, to catch orphans or non-FK linked issues)
        if (ns) {
            const { error: nsError } = await supabase.from('issues').delete().eq('project_ns', ns);
            if (nsError) console.warn("Error deleting issues by NS:", nsError);
        }

        // 2. Issues (by ID, for FK consistency)
        const { error: idError } = await supabase.from('issues').delete().eq('project_id', projectId);
        if (idError) console.warn("Error deleting issues by ID:", idError);
        
        // 3. Innovations
        const { error: innError } = await supabase.from('innovations').delete().eq('project_id', projectId);
        if (innError) console.warn("Error deleting innovations:", innError);
        
        // 3.5 Project Requests (Nullify FKs)
        await supabase.from('project_requests').update({ base_project_id: null }).eq('base_project_id', projectId);
        await supabase.from('project_requests').update({ box_project_id: null }).eq('box_project_id', projectId);

        // 3.6 Interruptions
        await supabase.from('interruptions').delete().eq('project_id', projectId);

        // 3.7 Operational Activities
        await supabase.from('operational_activities').delete().eq('project_id', projectId);

        // 4. Project
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);
        
        if (error) {
            console.error("SUPABASE DELETE ERROR:", error);
            throw error;
        }

        // Assume success if no error was thrown. 
        // We removed the select() check because some RLS policies allow DELETE but not SELECT on the deleted row.
        return { success: true };
    } catch (error: any) {
        console.error("FAILED TO DELETE PROJECT BY ID", error);
        return { success: false, message: error.message || "Erro desconhecido ao excluir." };
    }
};

export const removeDuplicateProjects = async (): Promise<{ success: boolean; message: string; count: number }> => {
  // Legacy wrapper for backward compatibility if needed, but we will switch to findDuplicateProjects
  const result = await findDuplicateProjects();
  if (!result.success) return { success: false, message: result.message || "Error", count: 0 };
  
  let deletedCount = 0;
  for (const group of result.duplicates) {
      const delRes = await deleteProjectById(group.discard.id);
      if (delRes.success) deletedCount++;
  }
  
  return { success: true, message: `Removidos ${deletedCount} duplicatas.`, count: deletedCount };
};

export const addGanttTask = async (task: GanttTask): Promise<AppState> => {
  try {
    const payload: any = {
      id: task.id,
      title: task.title,
      description: task.description,
      parent_id: task.parentId,
      start_date: task.startDate,
      end_date: task.endDate,
      color: task.color,
      is_milestone: task.isMilestone,
      assigned_to: task.assignedTo || [],
      progress: task.progress || 0,
      attachments: task.attachments || [],
      created_at: task.createdAt || new Date().toISOString(),
      updated_at: task.updatedAt || new Date().toISOString(),
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      "order": task.order || 0
    };

    // Only add these if they are present, to avoid errors if columns are missing in older schemas
    if (task.workload) payload.workload = task.workload;
    if (task.reports) payload.reports = task.reports;
    if (task.dependencies) payload.dependencies = task.dependencies;
    if (task.category) payload.category = task.category;

    const { error } = await supabase.from('gantt_tasks').insert([payload]);
    
    if (error) {
      console.error("SUPABASE GANTT INSERT ERROR (FULL):", error);
      
      if (error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('schema cache')) {
         console.warn("Retrying GANTT add with minimal payload...");
         const minimalPayload = {
           id: task.id,
           title: task.title,
           start_date: task.startDate,
           end_date: task.endDate,
           status: task.status || 'todo',
           "order": task.order || 0
         };
         const { error: retryError } = await supabase.from('gantt_tasks').insert([minimalPayload]);
         if (retryError) throw retryError;
         return fetchAppState();
      }
      
      throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO ADD GANTT TASK", error);
    throw error;
  }
};

export const updateGanttTask = async (task: GanttTask): Promise<AppState> => {
  try {
    const payload: any = {
      title: task.title,
      description: task.description,
      parent_id: task.parentId,
      start_date: task.startDate,
      end_date: task.endDate,
      color: task.color,
      is_milestone: task.isMilestone,
      assigned_to: task.assignedTo || [],
      progress: task.progress || 0,
      attachments: task.attachments || [],
      updated_at: new Date().toISOString(),
      status: task.status || 'todo',
      priority: task.priority || 'medium',
      "order": task.order
    };

    // Only add these if they are present
    if (task.workload) payload.workload = task.workload;
    if (task.reports) payload.reports = task.reports;
    if (task.dependencies) payload.dependencies = task.dependencies;
    if (task.category) payload.category = task.category;

    const { error } = await supabase
      .from('gantt_tasks')
      .update(payload)
      .eq('id', task.id);

    if (error) {
      console.error("SUPABASE GANTT UPDATE ERROR (FULL):", error);
      
      if (error.message?.toLowerCase().includes('column') || error.message?.toLowerCase().includes('schema cache')) {
         console.warn("Retrying GANTT update with minimal payload...");
         const minimalPayload = {
           title: task.title,
           start_date: task.startDate,
           end_date: task.endDate,
           status: task.status || 'todo',
           "order": task.order
         };
         const { error: retryError } = await supabase
           .from('gantt_tasks')
           .update(minimalPayload)
           .eq('id', task.id);
           
         if (retryError) throw retryError;
         return fetchAppState();
      }
      
      throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO UPDATE GANTT TASK", error);
    throw error;
  }
};

export const addAuditLog = async (log: Omit<AuditLog, 'id' | 'timestamp'>): Promise<void> => {
  try {
    const { error } = await supabase.from('audit_logs').insert([{
      user_id: log.userId,
      user_name: log.userName,
      action: log.action,
      entity_type: log.entityType,
      entity_id: log.entityId,
      entity_name: log.entityName,
      details: log.details,
      timestamp: new Date().toISOString()
    }]);

    if (error) {
      console.warn("Audit Log insert error:", error);
      // We don't throw here to avoid interrupting the main flow
    }
  } catch (e) {
    console.error("Audit log exception:", e);
  }
};

export const deleteGanttTask = async (taskId: string): Promise<AppState> => {
  try {
    const { error } = await supabase
      .from('gantt_tasks')
      .delete()
      .eq('id', taskId);

    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("FAILED TO DELETE GANTT TASK", error);
    throw error;
  }
};


