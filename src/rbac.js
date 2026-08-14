// ===========================================================================
// RBAC - Role-Based Access Control engine (data-driven, module-focused)
//
// Roles: admin, hr, staff. Each role maps to a set of module VIEW permissions
// and a set of module EDIT (create/update/delete) permissions.
//
// This is data-driven so new roles/modules can be added without code changes.
// ===========================================================================

// The application modules. The system is focused on 6 core "featured" modules
// (Dashboard is always visible to all authenticated users as the landing view);
// the remaining modules are supporting / admin utilities shown in a secondary
// navigation section. `featured: true` marks the core modules that appear in
// the primary navigation.
export const MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home', featured: true },
  { id: 'performance', label: 'Performance', icon: 'performance', featured: true },
  { id: 'competency', label: 'Competency', icon: 'competency', featured: true },
  { id: 'aiCompetency', label: 'AI Competency', icon: 'ai', featured: true },
  { id: 'learning', label: 'Learning & Training', icon: 'learning', featured: true },
{ id: 'succession', label: 'Succession', icon: 'succession', featured: true },
  { id: 'recognition', label: 'Recognition', icon: 'recognition', featured: true },
  { id: 'accounts', label: 'Accounts', icon: 'accounts', featured: false },
  { id: 'announcements', label: 'Announcements', icon: 'announcements', featured: false },
  { id: 'audit', label: 'Audit Log', icon: 'audit', featured: false },
  { id: 'settings', label: 'Settings', icon: 'settings', featured: false },
  { id: 'orgchart', label: 'Org Chart', icon: 'accounts', featured: false },
  { id: 'reviews', label: 'Performance Reviews', icon: 'performance', featured: false },
  { id: 'myDevelopment', label: 'My Development', icon: 'ai', featured: false },
  { id: 'permissions', label: 'Permissions', icon: 'shield', featured: false },
  { id: 'myTeam', label: 'My Team', icon: 'accounts', featured: false },
]

// Role definitions.
//   modules.view  -> modules the role can OPEN (navigation + rendering)
//   modules.edit  -> modules the role can MODIFY (create/update/delete)
export const ROLES = {
admin: {
    id: 'admin',
    label: 'Admin',
    description: 'Full control over the entire system.',
modules: {
      view: ['dashboard', 'performance', 'competency', 'aiCompetency', 'learning', 'succession', 'recognition', 'accounts', 'announcements', 'audit', 'settings', 'orgchart', 'reviews', 'myDevelopment', 'permissions', 'myTeam'],
      edit: ['performance', 'competency', 'learning', 'recognition', 'accounts', 'announcements', 'settings', 'reviews', 'permissions'],
    },
  },
hr: {
    id: 'hr',
    label: 'HR Manager',
    description: 'Manages employee-related information; no system admin privileges.',
    modules: {
      view: ['dashboard', 'performance', 'competency', 'aiCompetency', 'learning', 'succession', 'recognition', 'announcements', 'settings', 'orgchart', 'reviews', 'myDevelopment', 'myTeam'],
      edit: ['performance', 'learning', 'succession', 'recognition', 'announcements', 'settings', 'reviews'],
    },
  },
staff: {
    id: 'staff',
    label: 'Staff',
    description: 'Can view modules and register for training/certifications.',
    modules: {
      view: ['dashboard', 'performance', 'competency', 'aiCompetency', 'learning', 'succession', 'recognition', 'announcements', 'settings', 'orgchart', 'reviews', 'myDevelopment'],
      // Staff can register for training programs (self-service) but cannot
      // modify other records.
      edit: ['learning'],
    },
  },
}

// Priority order used to pick a single "primary" role for cosmetic display
// (badges, audit log entries) when an account holds multiple roles. Real
// permission checks below always consider the FULL role list, never just
// the primary one.
export const ROLE_PRIORITY = ['admin', 'hr', 'staff']

export const primaryRoleOf = (roleIds) => {
  const ids = Array.isArray(roleIds) ? roleIds : [roleIds]
  return ROLE_PRIORITY.find((r) => ids.includes(r)) || ids[0] || 'staff'
}

export const rolesLabel = (roleIds) => {
  const ids = Array.isArray(roleIds) ? roleIds : [roleIds]
  if (ids.length === 0) return 'Unknown'
  return ids.map(roleLabel).join(', ')
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

export const roleLabel = (roleId) => (ROLES[roleId] ? ROLES[roleId].label : 'Unknown')

export const isKnownRole = (roleId) => Object.prototype.hasOwnProperty.call(ROLES, roleId)

// Can this role (or ANY role in an array of roles) VIEW a given module?
export const canViewModule = (roleIdOrIds, moduleId) => {
  const ids = Array.isArray(roleIdOrIds) ? roleIdOrIds : [roleIdOrIds]
  return ids.some((id) => ROLES[id] && ROLES[id].modules.view.includes(moduleId))
}

// Can this role (or ANY role in an array of roles) EDIT a given module?
export const canEditModule = (roleIdOrIds, moduleId) => {
  const ids = Array.isArray(roleIdOrIds) ? roleIdOrIds : [roleIdOrIds]
  return ids.some((id) => ROLES[id] && ROLES[id].modules.edit.includes(moduleId))
}

// Modules visible for a role or set of roles (for navigation filtering) —
// union of every assigned role's view list, in MODULES' canonical order.
export const visibleModulesFor = (roleIdOrIds) => {
  const ids = Array.isArray(roleIdOrIds) ? roleIdOrIds : [roleIdOrIds]
  const allowed = new Set()
  ids.forEach((id) => {
    const role = ROLES[id]
    if (role) role.modules.view.forEach((m) => allowed.add(m))
  })
  return MODULES.filter((m) => allowed.has(m.id))
}

// Throw a forbidden error (simulates a 403 response).
export class ForbiddenError extends Error {
  constructor(message = 'You are not authorized to perform this action.') {
    super(message)
    this.name = 'ForbiddenError'
    this.status = 403
  }
}

// Enforce that a role may edit a module. Returns nothing or throws 403.
export function requireEdit(roleId, moduleId) {
  if (!canEditModule(roleId, moduleId)) {
    throw new ForbiddenError(`403 Forbidden: You do not have permission to modify the "${moduleId}" module.`)
  }
}

// Enforce that a role may view a module. Returns nothing or throws 403.
export function requireView(roleId, moduleId) {
  if (!canViewModule(roleId, moduleId)) {
    throw new ForbiddenError(`403 Forbidden: You do not have permission to access the "${moduleId}" module.`)
  }
}

// ---------------------------------------------------------------------------
// Audit log (localStorage-backed). Records critical actions with timestamp
// and the acting user. Accessible to admin only.
// ---------------------------------------------------------------------------

const AUDIT_KEY = 'ihims_audit_log'

export const getAuditLog = () => {
  try {
    const raw = localStorage.getItem(AUDIT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export const appendAudit = (entry) => {
  try {
    const row = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      user: entry.user || 'anonymous',
      role: entry.role || 'unknown',
      action: entry.action || 'unknown',
      detail: entry.detail || '',
      module: entry.module || '',
    }
    const log = getAuditLog()
    log.push(row)
    // Keep the last 500 entries.
    const trimmed = log.slice(-500)
    localStorage.setItem(AUDIT_KEY, JSON.stringify(trimmed))
    return row
  } catch {
    return null
  }
}

export const clearAuditLog = () => {
  try {
    localStorage.removeItem(AUDIT_KEY)
  } catch {
    // ignore
  }
}
