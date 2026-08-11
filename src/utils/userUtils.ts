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

/**
 * Safely gets a user's display name from a userId or name string.
 */
export function getUserDisplayName(
  userIdOrName: string | undefined | null,
  users: User[] = [],
  usersMap?: Record<string, User | string>,
  fallback = 'Desconhecido'
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
