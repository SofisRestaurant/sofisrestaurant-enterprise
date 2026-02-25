export type Role = 'guest' | 'user' | 'admin'

// Helper to check if user is admin based on admins table
export function isAdminRole(role: Role): boolean {
  return role === 'admin'
}