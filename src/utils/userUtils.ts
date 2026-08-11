import { User } from '../types';

/**
 * Resolves a user ID, username, email, or full/partial name to a matching User object.
 */
export function resolveUser(
  userIdOrName: string | undefined | null,
  users: User[] = []
): User | null {
  if (!userIdOrName || userIdOrName.trim() === '') {
    return null;
  }

  const query = userIdOrName.trim();
  const queryLower = query.toLowerCase();

  // 1. Direct ID match
  let found = users.find(u => u.id === query);
  if (found) return found;

  // 2. Direct Username or Email match
  found = users.find(
    u =>
      (u.username && u.username.toLowerCase() === queryLower) ||
      (u.email && u.email.toLowerCase() === queryLower)
  );
  if (found) return found;

  // 3. Exact Name or Full Name match
  found = users.find(u => {
    const fullName = `${u.name} ${u.surname || ''}`.trim().toLowerCase();
    return u.name.toLowerCase() === queryLower || fullName === queryLower;
  });
  if (found) return found;

  // 4. Partial Name match (e.g. "Edson" matches "Edson Farias", "Sandro" matches "Sandro Jardel")
  found = users.find(u => {
    const fullName = `${u.name} ${u.surname || ''}`.trim().toLowerCase();
    return (
      u.name.toLowerCase().includes(queryLower) ||
      queryLower.includes(u.name.toLowerCase()) ||
      fullName.includes(queryLower) ||
      queryLower.includes(fullName)
    );
  });
  if (found) return found;

  // 5. Fallback: If query is a human name string (not a raw long UUID or hash), create a synthetic User object
  // so the application displays "Sandro Jardel" or "bigfer" instead of "DESCONHECIDO".
  if (query.length < 40 && !query.includes('-')) {
    return {
      id: query,
      name: query,
      username: query.toLowerCase().replace(/\s+/g, ''),
      email: '',
      role: 'PROJETISTA',
      password: ''
    };
  }

  return null;
}

/**
 * Builds a multi-key dictionary for fast user lookups by ID, username, email, name, and lowercases.
 */
export function buildUsersMap(users: User[] = []): Record<string, User> {
  const map: Record<string, User> = {};

  users.forEach(u => {
    if (!u) return;
    if (u.id) map[u.id] = u;
    if (u.id) map[u.id.toLowerCase()] = u;
    if (u.name) map[u.name] = u;
    if (u.name) map[u.name.toLowerCase()] = u;
    if (u.username) map[u.username] = u;
    if (u.username) map[u.username.toLowerCase()] = u;
    if (u.email) map[u.email] = u;
    if (u.email) map[u.email.toLowerCase()] = u;
    const fullName = `${u.name} ${u.surname || ''}`.trim();
    if (fullName) {
      map[fullName] = u;
      map[fullName.toLowerCase()] = u;
    }
  });

  return map;
}

export const RAW_PROJECT_SEED_DATA = [
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

/**
 * Safely resolves a user for a project object even if userId is missing or invalid.
 */
export function resolveProjectUser(
  project: { userId?: string; ns?: string; clientName?: string; notes?: string } | null | undefined,
  users: User[] = []
): User | null {
  if (!project) return null;

  if (project.userId) {
    const u = resolveUser(project.userId, users);
    if (u) return u;
  }

  if (project.ns) {
    const rawMatch = RAW_PROJECT_SEED_DATA.find(r => r.ns === String(project.ns).trim());
    if (rawMatch?.p) {
      const u = resolveUser(rawMatch.p, users);
      if (u) return u;
    }
  }

  if (project.clientName) {
    const rawMatch = RAW_PROJECT_SEED_DATA.find(r => r.c.toLowerCase() === project.clientName?.toLowerCase().trim());
    if (rawMatch?.p) {
      const u = resolveUser(rawMatch.p, users);
      if (u) return u;
    }
  }

  if (project.notes) {
    const u = resolveUser(project.notes, users);
    if (u) return u;
  }

  // Final fallback to default designer Raphael if still missing
  const raphael = users.find(u => u.name.toLowerCase().includes('raphael'));
  if (raphael) return raphael;

  return null;
}

/**
 * Safely gets a user's display name from a userId or name string.
 */
export function getUserDisplayName(
  userIdOrName: string | undefined | null,
  users: User[] = [],
  usersMap?: Record<string, User | string>,
  fallback = 'Raphael'
): string {
  if (!userIdOrName) return fallback;

  if (usersMap && usersMap[userIdOrName]) {
    const val = usersMap[userIdOrName];
    if (typeof val === 'string') return val;
    if (val && typeof val === 'object' && val.name) return val.name;
  }

  const resolved = resolveUser(userIdOrName, users);
  if (resolved?.name) return resolved.name;

  if (userIdOrName.length < 40 && !userIdOrName.includes('-')) {
    return userIdOrName;
  }

  return fallback;
}
