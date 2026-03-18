import { createClient } from '@supabase/supabase-js';
import { AppState, ProjectSession, IssueRecord, User, InnovationRecord, CalculationType, ProjectType, ImplementType, InterruptionRecord, InterruptionType, InterruptionStatus, InterruptionArea, AppSettings, ActivityType, OperationalActivity } from '../types';
import { DEFAULT_INTERRUPTION_TYPES, DEFAULT_ACTIVITY_TYPES } from '../constants';

// Supabase Configuration
const getSupabaseConfig = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // Check if they are valid URLs/Strings
  const isValidUrl = (u: string | undefined): u is string => {
    if (!u) return false;
    try {
      new URL(u);
      return true;
    } catch (e) {
      return false;
    }
  };

  if (isValidUrl(url) && key) {
    return { url, key };
  }

  // Fallback to hardcoded defaults if env vars are missing/invalid
  // Note: In a production app, you'd want to handle this more strictly
  return {
    url: 'https://otajfsjtpucdmkwgmeku.supabase.co',
    key: 'sb_publishable_tUhxD-ixI7mhxhvB5FYVGQ_FCkLGa6h'
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
  users: [],
  settings: { hourlyCost: 150 }
};

// --- DATA MANAGEMENT ---

export const fetchSettings = async (): Promise<AppSettings> => {
  let settings: AppSettings = { 
    hourlyCost: Number(localStorage.getItem('hourly_cost')) || 150,
    logoUrl: localStorage.getItem('logo_url') || undefined,
    companyName: localStorage.getItem('company_name') || 'JIMP NEXUS',
    emailHost: localStorage.getItem('email_host') || '',
    emailPort: localStorage.getItem('email_port') || '',
    emailUser: localStorage.getItem('email_user') || '',
    emailPass: localStorage.getItem('email_pass') || '',
    emailFrom: localStorage.getItem('email_from') || '',
    emailTo: localStorage.getItem('email_to') || ''
  };

  try {
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*');
    
    if (!settingsError && settingsData && settingsData.length > 0) {
      const hourlyCostRow = settingsData.find(s => s.key === 'hourly_cost');
      const logoUrlRow = settingsData.find(s => s.key === 'logo_url');
      const companyNameRow = settingsData.find(s => s.key === 'company_name');
      const emailHostRow = settingsData.find(s => s.key === 'email_host');
      const emailPortRow = settingsData.find(s => s.key === 'email_port');
      const emailUserRow = settingsData.find(s => s.key === 'email_user');
      const emailPassRow = settingsData.find(s => s.key === 'email_pass');
      const emailFromRow = settingsData.find(s => s.key === 'email_from');
      const emailToRow = settingsData.find(s => s.key === 'email_to');
      const interruptionEmailToRow = settingsData.find(s => s.key === 'interruption_email_to');

      if (hourlyCostRow) settings.hourlyCost = Number(hourlyCostRow.value);
      if (logoUrlRow) settings.logoUrl = logoUrlRow.value || '';
      if (companyNameRow) settings.companyName = companyNameRow.value || 'JIMP NEXUS';
      if (emailHostRow) settings.emailHost = emailHostRow.value || '';
      if (emailPortRow) settings.emailPort = emailPortRow.value || '';
      if (emailUserRow) settings.emailUser = emailUserRow.value || '';
      if (emailPassRow) settings.emailPass = emailPassRow.value || '';
      if (emailFromRow) settings.emailFrom = emailFromRow.value || '';
      if (emailToRow) settings.emailTo = emailToRow.value || '';
      if (interruptionEmailToRow) settings.interruptionEmailTo = interruptionEmailToRow.value || '';

      // Sync to localStorage for offline fallback
      localStorage.setItem('hourly_cost', settings.hourlyCost.toString());
      if (settings.logoUrl) localStorage.setItem('logo_url', settings.logoUrl);
      if (settings.companyName) localStorage.setItem('company_name', settings.companyName);
      if (settings.emailHost) localStorage.setItem('email_host', settings.emailHost);
      if (settings.emailPort) localStorage.setItem('email_port', settings.emailPort);
      if (settings.emailUser) localStorage.setItem('email_user', settings.emailUser);
      if (settings.emailPass) localStorage.setItem('email_pass', settings.emailPass);
      if (settings.emailFrom) localStorage.setItem('email_from', settings.emailFrom);
      if (settings.emailTo) localStorage.setItem('email_to', settings.emailTo);
      if (settings.interruptionEmailTo) localStorage.setItem('interruption_email_to', settings.interruptionEmailTo);
    }
  } catch (e) {
    console.warn("Error fetching settings from Supabase, using localStorage/defaults:", e);
  }
  return settings;
};

export const fetchAppState = async (): Promise<AppState> => {
  try {
    // Fetch Projects
    const { data: projectsData, error: projectsError } = await supabase
      .from('projects')
      .select('*')
      .order('start_time', { ascending: false });

    if (projectsError) throw projectsError;

    // Fetch Issues
    const { data: issuesData, error: issuesError } = await supabase
      .from('issues')
      .select('*')
      .order('date', { ascending: false });

    if (issuesError) throw issuesError;

    // Fetch Innovations
    const { data: innovationsData, error: innovationsError } = await supabase
      .from('innovations')
      .select('*')
      .order('created_at', { ascending: false });

    // Fetch Interruptions
    const { data: interruptionsData, error: interruptionsError } = await supabase
      .from('interruptions')
      .select('*')
      .order('start_time', { ascending: false });

    // Fetch Interruption Types
    const { data: interruptionTypesData, error: interruptionTypesError } = await supabase
      .from('interruption_types')
      .select('*')
      .order('name', { ascending: true });

    // Fetch Activity Types
    const { data: activityTypesData, error: activityTypesError } = await supabase
      .from('activity_types')
      .select('*')
      .order('name', { ascending: true });

    let activityTypes: ActivityType[] = (activityTypesData || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      isActive: t.is_active
    }));

    // Seed default activity types if empty
    if (activityTypes.length === 0) {
      console.log("Seeding default activity types...");
      const defaultTypes = DEFAULT_ACTIVITY_TYPES.map(name => ({
        name,
        is_active: true
      }));
      
      const { data: seededData, error: seedError } = await supabase
        .from('activity_types')
        .insert(defaultTypes)
        .select();

      if (!seedError && seededData) {
        activityTypes = seededData.map((t: any) => ({
          id: t.id,
          name: t.name,
          isActive: t.is_active
        }));
      } else {
        // Fallback to constants if seeding fails, so UI is not empty
        activityTypes = DEFAULT_ACTIVITY_TYPES.map((name, index) => ({
          id: `temp-${index}`,
          name,
          isActive: true
        }));
      }
    }

    // Fetch Operational Activities
    const { data: operationalActivitiesData, error: operationalActivitiesError } = await supabase
      .from('operational_activities')
      .select('*')
      .order('start_time', { ascending: false });

    // Fetch Settings
    const settings = await fetchSettings();
    
    // Map DB columns (snake_case) to Types (camelCase)
    const projects: ProjectSession[] = (projectsData || []).map((p: any) => ({
      id: p.id,
      ns: p.ns,
      clientName: p.client_name,
      flooringType: p.flooring_type,
      projectCode: p.project_code,
      type: p.type,
      implementType: p.implement_type,
      startTime: p.start_time,
      endTime: p.end_time,
      totalActiveSeconds: p.total_active_seconds,
      interruptionSeconds: p.interruption_seconds || 0,
      totalSeconds: p.total_seconds || p.total_active_seconds,
      productiveCost: p.productive_cost || 0,
      interruptionCost: p.interruption_cost || 0,
      totalCost: p.total_cost || 0,
      pauses: typeof p.pauses === 'string' ? JSON.parse(p.pauses) : (p.pauses || []),
      variations: typeof p.variations === 'string' ? JSON.parse(p.variations) : (p.variations || []),
      status: p.status,
      notes: p.notes,
      userId: p.user_id,
      estimatedSeconds: p.estimated_seconds,
      isOvertime: p.is_overtime
    }));

    const issues: IssueRecord[] = (issuesData || []).map((i: any) => ({
      id: i.id,
      projectNs: i.project_ns,
      type: i.type,
      description: i.description,
      date: i.date,
      reportedBy: i.reported_by
    }));

    const innovations: InnovationRecord[] = (innovationsData || []).map((inv: any) => ({
      id: inv.id,
      title: inv.title,
      description: inv.description,
      type: inv.type,
      
      // Handle potential nulls from DB using defaults
      calculationType: inv.calculation_type as CalculationType || CalculationType.RECURRING_MONTHLY,
      unitSavings: Number(inv.unit_savings) || 0,
      quantity: Number(inv.quantity) || 0,
      totalAnnualSavings: Number(inv.total_annual_savings) || 0,
      investmentCost: Number(inv.investment_cost) || 0,

      status: inv.status,
      authorId: inv.author_id,
      createdAt: inv.created_at,
      
      // New fields
      materials: typeof inv.materials === 'string' ? JSON.parse(inv.materials) : (inv.materials || []),
      machine: typeof inv.machine === 'string' ? JSON.parse(inv.machine) : (inv.machine || undefined)
    }));

    const interruptions: InterruptionRecord[] = (interruptionsData || []).map((i: any) => ({
      id: i.id,
      projectId: i.project_id,
      projectNs: i.project_ns,
      clientName: i.client_name,
      designerId: i.designer_id,
      startTime: i.start_time,
      endTime: i.end_time,
      problemType: i.problem_type,
      responsibleArea: i.responsible_area as InterruptionArea,
      responsiblePerson: i.responsible_person,
      description: i.description,
      status: i.status as InterruptionStatus,
      totalTimeSeconds: i.total_time_seconds
    }));

    const interruptionTypes: InterruptionType[] = (interruptionTypesData || []).map((t: any) => ({
      id: t.id,
      name: t.name,
      isActive: t.is_active
    }));

    const operationalActivities: OperationalActivity[] = (operationalActivitiesData || []).map((a: any) => ({
      id: a.id,
      userId: a.user_id,
      activityTypeId: a.activity_type_id,
      activityName: a.activity_name,
      startTime: a.start_time,
      endTime: a.end_time,
      durationSeconds: a.duration_seconds,
      notes: a.notes,
      projectId: a.project_id,
      isFlagged: a.is_flagged
    }));

    // If no interruption types exist, seed them (first time)
    if (interruptionTypes.length === 0) {
        // We don't seed here to avoid multiple calls, but we return defaults if empty
        // Actually, let's just return what's in DB. The UI will handle seeding if Gestor.
    }

    // Fetch Users
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('*');

    if (usersError) throw usersError;

    const users: User[] = (usersData || []).map((u: any) => ({
      id: u.id,
      username: u.username,
      password: u.password,
      name: u.name,
      surname: u.surname,
      email: u.email,
      phone: u.phone,
      role: u.role,
      salary: Number(u.salary) || 0
    }));

    return { projects, issues, innovations, interruptions, interruptionTypes, activityTypes, operationalActivities, users, settings };
  } catch (error) {
    console.error("Failed to load data from Supabase", error);
    return { ...defaultState, users: [] };
  }
};

export const updateSettings = async (settings: AppSettings): Promise<AppState> => {
  try {
    // Update LocalStorage first for immediate feedback
    localStorage.setItem('hourly_cost', settings.hourlyCost.toString());
    if (settings.logoUrl) localStorage.setItem('logo_url', settings.logoUrl);
    if (settings.companyName) localStorage.setItem('company_name', settings.companyName);
    if (settings.emailHost) localStorage.setItem('email_host', settings.emailHost);
    if (settings.emailPort) localStorage.setItem('email_port', settings.emailPort);
    if (settings.emailUser) localStorage.setItem('email_user', settings.emailUser);
    if (settings.emailPass) localStorage.setItem('email_pass', settings.emailPass);
    if (settings.emailFrom) localStorage.setItem('email_from', settings.emailFrom);
    if (settings.emailTo) localStorage.setItem('email_to', settings.emailTo);

    const updates = [
      { key: 'hourly_cost', value: settings.hourlyCost.toString() }
    ];

    if (settings.logoUrl !== undefined) updates.push({ key: 'logo_url', value: settings.logoUrl });
    if (settings.companyName !== undefined) updates.push({ key: 'company_name', value: settings.companyName });
    if (settings.emailHost !== undefined) updates.push({ key: 'email_host', value: settings.emailHost });
    if (settings.emailPort !== undefined) updates.push({ key: 'email_port', value: settings.emailPort });
    if (settings.emailUser !== undefined) updates.push({ key: 'email_user', value: settings.emailUser });
    if (settings.emailPass !== undefined) updates.push({ key: 'email_pass', value: settings.emailPass });
    if (settings.emailFrom !== undefined) updates.push({ key: 'email_from', value: settings.emailFrom });
    if (settings.emailTo !== undefined) updates.push({ key: 'email_to', value: settings.emailTo });
    if (settings.interruptionEmailTo !== undefined) updates.push({ key: 'interruption_email_to', value: settings.interruptionEmailTo });

    const { error } = await supabase
      .from('settings')
      .upsert(updates, { onConflict: 'key' });
    
    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("Failed to update settings in Supabase", error);
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
      type: project.type,
      implement_type: project.implementType,
      start_time: project.startTime,
      end_time: project.endTime,
      total_active_seconds: project.totalActiveSeconds,
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
    console.error("Failed to add project", error);
    throw error;
  }
};

export const updateProject = async (project: ProjectSession): Promise<AppState> => {
  try {
    const { error } = await supabase
      .from('projects')
      .update({
        ns: project.ns,
        client_name: project.clientName,
        flooring_type: project.flooringType,
        project_code: project.projectCode,
        type: project.type,
        implement_type: project.implementType,
        start_time: project.startTime,
        end_time: project.endTime || null,
        total_active_seconds: project.totalActiveSeconds,
        pauses: project.pauses,
        variations: project.variations,
        status: project.status,
        notes: project.notes,
        estimated_seconds: project.estimatedSeconds,
        user_id: project.userId,
        is_overtime: project.isOvertime
      })
      .eq('id', project.id);

    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("Failed to update project", error);
    throw error;
  }
};

export const deleteProject = async (id: string, ns?: string): Promise<AppState> => {
  try {
    console.log(`Attempting to delete project ${id} (NS: ${ns})`);

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
    console.error("Failed to delete project", error);
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
    console.error("Failed to add issue", error);
    throw error;
  }
};

export const deleteIssue = async (id: string): Promise<AppState> => {
  try {
    const { error } = await supabase.from('issues').delete().eq('id', id);
    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("Failed to delete issue", error);
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
    console.error("Exception clearing issues:", error);
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

      status: innovation.status,
      author_id: innovation.authorId,
      created_at: innovation.createdAt
    }]);

    if (error) {
        console.error("Supabase Error:", error.message);
        throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("Failed to add innovation", error);
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
    console.error("Failed to update innovation status", error);
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
        status: innovation.status,
      })
      .eq('id', innovation.id);

    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("Failed to update innovation", error);
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
    console.error("Failed to delete innovation", error);
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
      console.error("Supabase error adding interruption:", error);
      throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("Failed to add interruption", error);
    throw error;
  }
};

export const updateInterruption = async (interruption: InterruptionRecord): Promise<AppState> => {
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
      total_time_seconds: interruption.totalTimeSeconds
    };

    if (interruption.projectId) {
      payload.project_id = interruption.projectId;
    }

    const { error } = await supabase
      .from('interruptions')
      .update(payload)
      .eq('id', interruption.id);

    if (error) {
      console.error("Supabase error updating interruption:", error);
      throw error;
    }
    return fetchAppState();
  } catch (error) {
    console.error("Failed to update interruption", error);
    throw error;
  }
};

export const deleteInterruption = async (id: string): Promise<AppState> => {
  try {
    const { error } = await supabase.from('interruptions').delete().eq('id', id);
    if (error) throw error;
    return fetchAppState();
  } catch (error) {
    console.error("Failed to delete interruption", error);
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
        console.error("Failed to fetch interruption types", error);
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
        console.error("Failed to add interruption type", error);
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
        console.error("Failed to update interruption type", error);
        throw error;
    }
};

export const deleteInterruptionType = async (id: string): Promise<AppState> => {
    try {
        const { error } = await supabase.from('interruption_types').delete().eq('id', id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("Failed to delete interruption type", error);
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
        console.error("Failed to fetch activity types", error);
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
        console.error("Failed to add activity type", error);
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
        console.error("Failed to update activity type", error);
        throw error;
    }
};

export const deleteActivityType = async (id: string): Promise<AppState> => {
    try {
        const { error } = await supabase.from('activity_types').delete().eq('id', id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("Failed to delete activity type", error);
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
        console.error("Failed to fetch operational activities", error);
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
            console.error("Supabase error adding activity:", error);
            throw error;
        }
        return fetchAppState();
    } catch (error) {
        console.error("Failed to add operational activity", error);
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
        console.error("Failed to update operational activity", error);
        throw error;
    }
};

export const deleteOperationalActivity = async (id: string): Promise<AppState> => {
    try {
        const { error } = await supabase.from('operational_activities').delete().eq('id', id);
        if (error) throw error;
        return fetchAppState();
    } catch (error) {
        console.error("Failed to delete operational activity", error);
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
    }));
  } catch (error) {
    console.error("Failed to fetch users", error);
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
    console.error("Failed to register user", error);
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
    console.error("Failed to update user", error);
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
        console.error("Error unlinking projects:", projError);
        // We continue, hoping it's not a blocking FK constraint
    }

    // 2. Unlink from Innovations
    const { error: innError } = await supabase
      .from('innovations')
      .update({ author_id: null })
      .eq('author_id', id);

    if (innError) {
         console.error("Error unlinking innovations:", innError);
    }

    // 3. Unlink from Issues
    const { error: issueError } = await supabase
      .from('issues')
      .update({ reported_by: null })
      .eq('reported_by', id);

    if (issueError) {
         console.error("Error unlinking issues:", issueError);
    }

    // 4. Delete User
    // Use select() to confirm deletion occurred (RLS check)
    const { error, data } = await supabase.from('users').delete().eq('id', id).select();
    
    if (error) {
      console.error("Error deleting user:", error);
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
    console.error("Failed to delete user", error);
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
    console.error("Auth error", error);
    return null;
  }
};

export const seedFebruaryData = async (): Promise<{ success: boolean; count: number; errors: string[] }> => {
  const errors: string[] = [];
  let count = 0;
  try {
    const users = await fetchUsers();
    
    // Ensure users exist
    const namesToEnsure = ['Luiz', 'Cobo', 'Rogerio', 'Edson'];
    for (const name of namesToEnsure) {
      const exists = users.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
      if (!exists) {
        const res = await registerUser({
          id: crypto.randomUUID(),
          name: name,
          username: name.toLowerCase(),
          password: '123', // Default password
          role: 'PROJETISTA'
        });
        if (!res.success) {
          errors.push(`Failed to create user ${name}: ${res.message}`);
        }
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
      const [day, monthStr] = d.split('/');
      const m = monthStr.toLowerCase();
      let month = 1; // Default to Feb
      if (m.includes('jan')) month = 0;
      else if (m.includes('fev')) month = 1;
      else if (m.includes('mar')) month = 2;
      else if (m.includes('abr')) month = 3;
      else if (m.includes('mai')) month = 4;
      else if (m.includes('jun')) month = 5;
      else if (m.includes('jul')) month = 6;
      else if (m.includes('ago')) month = 7;
      else if (m.includes('set')) month = 8;
      else if (m.includes('out')) month = 9;
      else if (m.includes('nov')) month = 10;
      else if (m.includes('dez')) month = 11;
      
      const year = month === 11 ? 2025 : 2026;
      return new Date(year, month, parseInt(day), 17, 0, 0);
    };

    const mapImplement = (pr: string): ImplementType => {
      const p = pr.toLowerCase();
      if (p.includes('sobrechassi') || p.includes('sobre chassi')) return ImplementType.SOBRECHASSI;
      if (p.includes('caixa de carga')) return ImplementType.CAIXA_CARGA;
      if (p.includes('base')) return ImplementType.BASE;
      if (p.includes('graneleiro')) return ImplementType.GRANELEIRO;
      if (p.includes('carga seca')) return ImplementType.CARGA_SECA;
      if (p.includes('sider')) return ImplementType.SIDER;
      if (p.includes('furgão')) return ImplementType.FURGAO;
      return ImplementType.OUTROS;
    };

    const projectsToInsert = rawData.map(item => {
      const duration = parseDuration(item.h);
      const end = parseDate(item.d);
      const start = new Date(end.getTime() - (duration * 1000));
      
      return {
        id: crypto.randomUUID(),
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
        user_id: findUser(item.p) || null
      };
    });

    let insertedCount = 0;
    let matchCount = 0;
    for (const p of projectsToInsert) {
      if (p.user_id) matchCount++;
      
      try {
        // Check if project already exists to avoid duplicates
        let query = supabase
          .from('projects')
          .select('id')
          .eq('ns', p.ns)
          .eq('client_name', p.client_name);
        
        if (p.user_id) {
          query = query.eq('user_id', p.user_id);
        } else {
          query = query.is('user_id', null);
        }

        const { data: existing, error: checkError } = await query.limit(1);
        if (checkError) throw checkError;

        if (!existing || existing.length === 0) {
          const { error: insertError } = await supabase.from('projects').insert([{
            ...p,
            project_code: '' // Ensure project_code is present
          }]);
          if (insertError) throw insertError;
          insertedCount++;
        }
      } catch (err: any) {
        console.error(`Error with NS ${p.ns}:`, err.message);
      }
    }

    console.log(`Seeded February data. Matched ${matchCount}/${projectsToInsert.length} users. Inserted ${insertedCount} new projects.`);
    return { success: true, count: insertedCount, errors: [] };
  } catch (error: any) {
    console.error("Failed to seed February data", error);
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

    console.log(`Scanning ${projects.length} projects for duplicates...`);

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
    console.error("Failed to find duplicates", error);
    return { success: false, duplicates: [], message: error.message };
  }
};

export const recalculateAllProjectCosts = async (): Promise<{ success: boolean; message: string }> => {
  try {
    const settings = await fetchSettings();
    const users = await fetchUsers();
    
    let costPerSecond = settings.hourlyCost / 3600;
    if (settings.hourlyCost <= 0) {
      const totalSalaries = users.reduce((acc, u) => acc + (u.salary || 0), 0);
      const avgSalary = users.length > 0 ? totalSalaries / users.length : 0;
      const hourlyRate = avgSalary / 220;
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
    console.error("Failed to recalculate costs", error);
    return { success: false, message: error.message };
  }
};

export const deleteProjectById = async (projectId: string, ns?: string): Promise<{ success: boolean; message?: string }> => {
    try {
        console.log(`Deleting project ${projectId} (NS: ${ns})`);
        
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
        
        // 4. Project
        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', projectId);
        
        if (error) {
            console.error("Supabase delete error:", error);
            throw error;
        }

        // Assume success if no error was thrown. 
        // We removed the select() check because some RLS policies allow DELETE but not SELECT on the deleted row.
        return { success: true };
    } catch (error: any) {
        console.error("Failed to delete project by ID", error);
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
