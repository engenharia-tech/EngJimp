import { createClient } from '@supabase/supabase-js';
import { AppState, ProjectSession, IssueRecord, User, InnovationRecord, CalculationType, ProjectType, ImplementType } from '../types';

// Supabase Configuration
// Hardcoded for immediate fix
const SUPABASE_URL = 'https://otajfsjtpucdmkwgmeku.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tUhxD-ixI7mhxhvB5FYVGQ_FCkLGa6h';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const defaultState: AppState = {
  projects: [],
  issues: [],
  innovations: []
};

// --- DATA MANAGEMENT ---

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
      pauses: typeof p.pauses === 'string' ? JSON.parse(p.pauses) : (p.pauses || []),
      variations: typeof p.variations === 'string' ? JSON.parse(p.variations) : (p.variations || []),
      status: p.status,
      notes: p.notes,
      userId: p.user_id,
      estimatedSeconds: p.estimated_seconds
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
      createdAt: inv.created_at
    }));

    return { projects, issues, innovations };
  } catch (error) {
    console.error("Failed to load data from Supabase", error);
    return defaultState;
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
      estimated_seconds: project.estimatedSeconds
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
        user_id: project.userId
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
      .eq('username', user.username)
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
      .eq('username', username)
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
      { p: 'Edson', ns: '9009', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9010', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9011', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9012', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9013', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9014', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9015', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9016', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9017', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9018', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9019', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9020', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9021', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9022', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
      { p: 'Edson', ns: '9023', c: 'ARAUCO', pr: 'Base e Caixa de Carga', d: '24/dez', h: '11:47' },
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
