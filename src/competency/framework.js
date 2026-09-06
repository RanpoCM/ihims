// ---------------------------------------------------------------------------
// Competency Framework & Definitions
// ---------------------------------------------------------------------------

// Scoring scale (1-5)
export const SCORE_SCALE = [
  { level: 1, label: 'Beginner' },
  { level: 2, label: 'Basic' },
  { level: 3, label: 'Competent' },
  { level: 4, label: 'Proficient' },
  { level: 5, label: 'Expert' },
]

export const scoreLabel = (n) => {
  const s = SCORE_SCALE.find((x) => x.level === Number(n))
  return s ? s.label : '—'
}

// The 15 competency domains
export const COMPETENCIES = [
  { id: 'jobKnowledge', name: 'Job Knowledge', category: 'Functional', description: 'Understanding of role-specific duties, policies, and procedures.' },
  { id: 'technicalSkills', name: 'Technical Skills', category: 'Technical', description: 'Hands-on proficiency with tools, equipment, and systems used in the role.' },
  { id: 'clinicalSkills', name: 'Clinical Skills', category: 'Clinical', description: 'Patient care and clinical procedures (healthcare roles).' },
  { id: 'leadership', name: 'Leadership', category: 'Behavioral', description: 'Ability to guide, coach, and motivate teams toward outcomes.' },
  { id: 'communication', name: 'Communication', category: 'Behavioral', description: 'Clear written and verbal exchange with patients, teams, and leadership.' },
  { id: 'teamwork', name: 'Teamwork', category: 'Behavioral', description: 'Effective collaboration and support within cross-functional teams.' },
  { id: 'criticalThinking', name: 'Critical Thinking', category: 'Cognitive', description: 'Logical analysis, evaluation, and sound decision-making.' },
  { id: 'problemSolving', name: 'Problem Solving', category: 'Cognitive', description: 'Identifying issues and implementing effective solutions.' },
  { id: 'customerService', name: 'Customer Service', category: 'Behavioral', description: 'Meeting the needs of patients, families, and internal clients.' },
  { id: 'compliance', name: 'Compliance', category: 'Regulatory', description: 'Adherence to regulatory, safety, and ethical standards.' },
  { id: 'digitalLiteracy', name: 'Digital Literacy', category: 'Digital', description: 'Comfort and skill with digital tools and information systems.' },
  { id: 'aiLiteracy', name: 'AI Literacy', category: 'Digital', description: 'Understanding of AI concepts, capabilities, and limitations.' },
  { id: 'dataLiteracy', name: 'Data Literacy', category: 'Digital', description: 'Ability to read, interpret, and use data to inform decisions.' },
  { id: 'innovation', name: 'Innovation', category: 'Cognitive', description: 'Generating creative ideas and process improvements.' },
  { id: 'continuousLearning', name: 'Continuous Learning', category: 'Behavioral', description: 'Self-directed pursuit of new knowledge and skills.' },
]

// Required competency level per role. Roles map to department/role strings.
// default = baseline for any role not explicitly defined.
export const REQUIRED_LEVELS_BY_ROLE = {
  // C-suite / executives
  'Chief Medical Officer': {
    jobKnowledge: 5, technicalSkills: 4, clinicalSkills: 5, leadership: 5, communication: 5,
    teamwork: 4, criticalThinking: 5, problemSolving: 5, customerService: 4, compliance: 5,
    digitalLiteracy: 4, aiLiteracy: 4, dataLiteracy: 5, innovation: 5, continuousLearning: 5,
  },
  // Physicians / clinical leaders
  Cardiologist: {
    jobKnowledge: 5, technicalSkills: 5, clinicalSkills: 5, leadership: 4, communication: 5,
    teamwork: 4, criticalThinking: 5, problemSolving: 5, customerService: 4, compliance: 5,
    digitalLiteracy: 4, aiLiteracy: 4, dataLiteracy: 4, innovation: 4, continuousLearning: 5,
  },
  Pediatrician: {
    jobKnowledge: 5, technicalSkills: 4, clinicalSkills: 5, leadership: 4, communication: 5,
    teamwork: 4, criticalThinking: 5, problemSolving: 5, customerService: 5, compliance: 5,
    digitalLiteracy: 4, aiLiteracy: 4, dataLiteracy: 4, innovation: 4, continuousLearning: 5,
  },
  // Nursing
  'Senior Nurse': {
    jobKnowledge: 4, technicalSkills: 5, clinicalSkills: 5, leadership: 4, communication: 5,
    teamwork: 5, criticalThinking: 4, problemSolving: 4, customerService: 5, compliance: 5,
    digitalLiteracy: 4, aiLiteracy: 3, dataLiteracy: 4, innovation: 3, continuousLearning: 4,
  },
  'Registered Nurse': {
    jobKnowledge: 4, technicalSkills: 4, clinicalSkills: 4, leadership: 3, communication: 5,
    teamwork: 5, criticalThinking: 4, problemSolving: 4, customerService: 5, compliance: 5,
    digitalLiteracy: 4, aiLiteracy: 3, dataLiteracy: 3, innovation: 3, continuousLearning: 4,
  },
  // Laboratory
  'Lab Technician': {
    jobKnowledge: 4, technicalSkills: 5, clinicalSkills: 3, leadership: 2, communication: 3,
    teamwork: 4, criticalThinking: 4, problemSolving: 4, customerService: 3, compliance: 5,
    digitalLiteracy: 4, aiLiteracy: 3, dataLiteracy: 4, innovation: 3, continuousLearning: 4,
  },
  // Administration / HR
  Administrator: {
    jobKnowledge: 4, technicalSkills: 4, clinicalSkills: 2, leadership: 4, communication: 4,
    teamwork: 4, criticalThinking: 4, problemSolving: 4, customerService: 4, compliance: 4,
    digitalLiteracy: 4, aiLiteracy: 3, dataLiteracy: 4, innovation: 3, continuousLearning: 4,
  },
  'HR Manager': {
    jobKnowledge: 4, technicalSkills: 4, clinicalSkills: 2, leadership: 5, communication: 5,
    teamwork: 5, criticalThinking: 4, problemSolving: 4, customerService: 4, compliance: 5,
    digitalLiteracy: 4, aiLiteracy: 4, dataLiteracy: 4, innovation: 4, continuousLearning: 5,
  },
  // Default
  default: {
    jobKnowledge: 3, technicalSkills: 3, clinicalSkills: 3, leadership: 3, communication: 3,
    teamwork: 3, criticalThinking: 3, problemSolving: 3, customerService: 3, compliance: 3,
    digitalLiteracy: 3, aiLiteracy: 3, dataLiteracy: 3, innovation: 3, continuousLearning: 3,
  },
}

export const requiredLevelsForRole = (role, department) => {
  const overrides = getRoleProfileOverrides()
  if (overrides[role]) return overrides[role]
  if (REQUIRED_LEVELS_BY_ROLE[role]) return REQUIRED_LEVELS_BY_ROLE[role]
  return inferRequiredLevels(role, department)
}

// Tells the UI whether a role's required-level profile came from an
// admin override, an explicit hand-curated entry, or was auto-inferred —
// so the Role Profiles screen can show provenance rather than presenting
// every profile as equally authoritative.
export const requiredLevelsSource = (role) => {
  const overrides = getRoleProfileOverrides()
  if (overrides[role]) return 'override'
  if (REQUIRED_LEVELS_BY_ROLE[role]) return 'explicit'
  return 'auto'
}

// ---------------------------------------------------------------------------
// Automated required-level inference for roles with no explicit profile.
//
// Previously, any role not listed in REQUIRED_LEVELS_BY_ROLE silently fell
// back to a flat "3 for everything" baseline — meaningless once an
// organization adds roles beyond the seeded set. This replaces that fallback
// with a deterministic, explainable classifier: it reads the role title and
// department, scores it against a few keyword axes (clinical / leadership /
// technical / administrative), and raises the relevant competencies
// proportionally from the baseline. No manual per-role configuration is
// required going forward — every new role automatically gets a tailored
// profile the moment it's used. HR/Admin can still review and override any
// auto-generated profile via the Role Profiles screen (see below).
// ---------------------------------------------------------------------------

const clampLevel = (n) => Math.max(1, Math.min(5, Math.round(n)))

// Score a role/department string against classification axes (0-1 each).
// Keyword-based and deterministic — same auditable approach as the rest of
// this engine, just applied one level up (role classification instead of
// employee scoring).
const classifyRole = (role, department) => {
  const text = `${role || ''} ${department || ''}`.toLowerCase()
  return {
    clinical: /nurse|doctor|physician|clinical|surgeon|therapist|cardio|pediatric|medical|patient|lab|technician/.test(text) ? 1 : 0,
    leadership: /chief|director|head|vp|executive|officer|president/.test(text) ? 1 : /manager|lead|supervisor|senior/.test(text) ? 0.6 : 0,
    technical: /technician|engineer|\bit\b|analyst|developer|technical|system/.test(text) ? 1 : 0,
    administrative: /admin|hr|human resource|clerk|coordinator|assistant|secretary/.test(text) ? 1 : 0,
  }
}

export function inferRequiredLevels(role, department) {
  const c = classifyRole(role, department)
  const base = REQUIRED_LEVELS_BY_ROLE.default
  const bump = (key, amount) => clampLevel(base[key] + amount)

  return {
    jobKnowledge: bump('jobKnowledge', (c.leadership + c.clinical) * 0.5),
    technicalSkills: bump('technicalSkills', c.technical * 1.5 + c.clinical * 0.5),
    clinicalSkills: bump('clinicalSkills', c.clinical * 2),
    leadership: bump('leadership', c.leadership * 2),
    communication: bump('communication', c.leadership * 1 + c.clinical * 0.5),
    teamwork: bump('teamwork', c.clinical * 0.5 + c.administrative * 0.3),
    criticalThinking: bump('criticalThinking', c.clinical * 0.5 + c.leadership * 0.5),
    problemSolving: bump('problemSolving', c.technical * 0.5 + c.leadership * 0.5),
    customerService: bump('customerService', c.clinical * 0.5 + c.administrative * 0.5),
    compliance: bump('compliance', c.clinical * 1.5 + c.administrative * 0.5),
    digitalLiteracy: bump('digitalLiteracy', c.technical * 1),
    aiLiteracy: bump('aiLiteracy', c.technical * 0.5 + c.leadership * 0.5),
    dataLiteracy: bump('dataLiteracy', c.technical * 1 + c.leadership * 0.5),
    innovation: bump('innovation', c.leadership * 1),
    continuousLearning: bump('continuousLearning', c.clinical * 0.5 + c.leadership * 0.5),
  }
}

// ---------------------------------------------------------------------------
// Role profile overrides — lets HR/Admin review and adjust an auto-inferred
// (or even explicit) required-level profile per role, rather than having to
// trust the classifier's output blindly. Persisted client-side for now;
// when the Supabase migration lands this should move to a real table with
// RLS so overrides are enforced server-side and auditable per-institution.
// ---------------------------------------------------------------------------

const ROLE_OVERRIDE_KEY = 'ihims_role_profile_overrides'

export function getRoleProfileOverrides() {
  try {
    const raw = localStorage.getItem(ROLE_OVERRIDE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function setRoleProfileOverride(role, levels) {
  try {
    const all = getRoleProfileOverrides()
    all[role] = levels
    localStorage.setItem(ROLE_OVERRIDE_KEY, JSON.stringify(all))
  } catch {
    // ignore storage errors
  }
}

export function clearRoleProfileOverride(role) {
  try {
    const all = getRoleProfileOverrides()
    delete all[role]
    localStorage.setItem(ROLE_OVERRIDE_KEY, JSON.stringify(all))
  } catch {
    // ignore storage errors
  }
}

// ---------------------------------------------------------------------------
// Competency-specific development recommendations
//
// Each competency maps to a set of concrete, tailored development actions
// (courses, coaching, certifications, on-the-job experiences) and a clear
// "why this matters" rationale. Roles can further tailor the actions.
// ---------------------------------------------------------------------------

// Role-tier hints used to tailor language per seniority.
const roleTier = (role) => {
  const r = (role || '').toLowerCase()
  if (/chief|officer|director|head|vp|executive/.test(r)) return 'leadership'
  if (/manager|lead|senior|supervisor/.test(r)) return 'senior'
  return 'core'
}

export const COMPETENCY_DEVELOPMENT = {
  jobKnowledge: {
    why: 'Foundational understanding of role-specific duties, policies, and procedures.',
    actions: [
      { kind: 'Course', title: 'Role Essentials & Policy Orientation' },
      { kind: 'Coaching', title: '1-on-1 onboarding with a senior peer' },
      { kind: 'Reading', title: 'Standard operating procedures & handbook' },
      { kind: 'Practice', title: 'Shadowing rotation across core duties' },
    ],
    certification: 'Role-Specific Competency Certification',
  },
  technicalSkills: {
    why: 'Hands-on proficiency with the tools and systems used in the role.',
    actions: [
      { kind: 'Course', title: 'Advanced Tool & Equipment Mastery' },
      { kind: 'Workshop', title: 'Hands-on technical skills lab' },
      { kind: 'Mentoring', title: 'Technical mentor pairing' },
      { kind: 'Practice', title: 'Guided practice on live workflows' },
    ],
    certification: 'Technical Skills Certification Track',
  },
  clinicalSkills: {
    why: 'Direct impact on patient safety, outcomes, and care quality.',
    actions: [
      { kind: 'Course', title: 'Advanced Clinical Procedures & Updates' },
      { kind: 'Certification', title: 'ACLS / BLS / specialty recertification' },
      { kind: 'Shadowing', title: 'Clinical preceptorship with a senior clinician' },
      { kind: 'Practice', title: 'Simulation-based clinical drills' },
    ],
    certification: 'Board-recognized clinical recertification',
  },
  leadership: {
    why: 'Reduced team effectiveness, engagement, and succession readiness.',
    actions: [
      { kind: 'Leadership', title: 'Frontline Leadership Development Program' },
      { kind: 'Coaching', title: 'Executive coaching for people management' },
      { kind: 'Project', title: 'Lead a cross-functional improvement project' },
      { kind: 'Shadowing', title: 'Shadow a senior leader for 2 weeks' },
    ],
    certification: 'Management & Leadership Certificate',
  },
  communication: {
    why: 'Affects patient/clinician coordination, handoffs, and satisfaction.',
    actions: [
      { kind: 'Course', title: 'High-Impact Clinical Communication' },
      { kind: 'Workshop', title: 'SBAR & structured handoff workshop' },
      { kind: 'Coaching', title: 'Communication coaching with feedback' },
      { kind: 'Practice', title: 'Patient-communication role-play' },
    ],
    certification: 'Communication Excellence Badge',
  },
  teamwork: {
    why: 'Reduces cross-functional collaboration and care-team cohesion.',
    actions: [
      { kind: 'Course', title: 'Building High-Performing Teams' },
      { kind: 'Workshop', title: 'Team collaboration & conflict resolution' },
      { kind: 'Project', title: 'Participate in a cross-department project' },
      { kind: 'Mentoring', title: 'Peer mentoring buddy program' },
    ],
    certification: 'Teamwork Certification',
  },
  criticalThinking: {
    why: 'May lead to suboptimal clinical or operational decisions.',
    actions: [
      { kind: 'Course', title: 'Critical Thinking & Clinical Decision-Making' },
      { kind: 'Workshop', title: 'Case-based analysis workshop' },
      { kind: 'Coaching', title: 'Structured reasoning coaching' },
      { kind: 'Practice', title: 'Root-cause analysis simulations' },
    ],
    certification: 'Critical Thinking Assessment',
  },
  problemSolving: {
    why: 'Delays resolution of operational and patient-care issues.',
    actions: [
      { kind: 'Course', title: 'Structured Problem-Solving Methods' },
      { kind: 'Workshop', title: 'Lean / Kaizen improvement workshop' },
      { kind: 'Project', title: 'Own a process-improvement initiative' },
      { kind: 'Coaching', title: 'Problem-solving coaching sessions' },
    ],
    certification: 'Process Improvement Certification',
  },
  customerService: {
    why: 'Affects patient experience and satisfaction scores.',
    actions: [
      { kind: 'Course', title: 'Patient & Family Experience Excellence' },
      { kind: 'Workshop', title: 'Service-recovery & empathy workshop' },
      { kind: 'Coaching', title: 'Patient-feedback coaching' },
      { kind: 'Practice', title: 'Service-excellence role-play' },
    ],
    certification: 'Service Excellence Badge',
  },
  compliance: {
    why: 'Regulatory, safety, and legal exposure for the organization.',
    actions: [
      { kind: 'Course', title: 'Regulatory & Safety Compliance Refresher' },
      { kind: 'Certification', title: 'Annual compliance certification' },
      { kind: 'Reading', title: 'Updated regulatory standards & policies' },
      { kind: 'Practice', title: 'Compliance scenario drills' },
    ],
    certification: 'Compliance Certification (annual)',
  },
  digitalLiteracy: {
    why: 'Slows adoption of digital tools and information systems.',
    actions: [
      { kind: 'Course', title: 'Digital Workplace & EHR Proficiency' },
      { kind: 'Workshop', title: 'Hands-on digital tools workshop' },
      { kind: 'Mentoring', title: 'Digital champion buddy' },
      { kind: 'Practice', title: 'Guided EHR workflow practice' },
    ],
    certification: 'Digital Literacy Certification',
  },
  aiLiteracy: {
    why: 'Limits the ability to adopt and benefit from AI-assisted workflows.',
    actions: [
      { kind: 'Course', title: 'AI Foundations for Healthcare Professionals' },
      { kind: 'Workshop', title: 'Prompt engineering & AI tools lab' },
      { kind: 'Reading', title: 'Responsible & ethical AI in healthcare' },
      { kind: 'Practice', title: 'Use an AI assistant on a real task' },
    ],
    certification: 'AI Literacy Certification',
  },
  dataLiteracy: {
    why: 'Limits evidence-based decision-making and performance insight.',
    actions: [
      { kind: 'Course', title: 'Data Literacy & Metrics for Decision-Making' },
      { kind: 'Workshop', title: 'Dashboards & reporting interpretation' },
      { kind: 'Coaching', title: 'Data-driven decision coaching' },
      { kind: 'Practice', title: 'Analyze a departmental KPI set' },
    ],
    certification: 'Data Literacy Certificate',
  },
  innovation: {
    why: 'Limits process and care improvement potential.',
    actions: [
      { kind: 'Course', title: 'Innovation & Continuous Improvement' },
      { kind: 'Workshop', title: 'Design-thinking & ideation workshop' },
      { kind: 'Project', title: 'Lead/join an innovation sprint' },
      { kind: 'Shadowing', title: 'Benchmark innovative teams' },
    ],
    certification: 'Innovation Contributor Badge',
  },
  continuousLearning: {
    why: 'Stagnates skill development and career growth over time.',
    actions: [
      { kind: 'Course', title: 'Personal Learning & Growth Planning' },
      { kind: 'Coaching', title: 'Career development coaching' },
      { kind: 'Mentoring', title: 'Long-term mentor relationship' },
      { kind: 'Project', title: 'Set and track a 6-month learning goal' },
    ],
    certification: 'Lifelong Learning Badge',
  },
}

// Return a tailored recommendation bundle for a competency, adjusted to the
// role's seniority tier.
export function recommendationForCompetency(compId, role) {
  const base = COMPETENCY_DEVELOPMENT[compId]
  if (!base) return null
  const tier = roleTier(role)
  let actions = base.actions
  if (tier === 'leadership') {
    actions = [
      ...base.actions,
      { kind: 'Development', title: 'Strategic leadership stretch assignment' },
    ]
  } else if (tier === 'senior') {
    actions = [
      ...base.actions,
      { kind: 'Mentoring', title: 'Mentor a junior colleague to reinforce mastery' },
    ]
  }
  return { why: base.why, actions, certification: base.certification }
}

// Estimate current competency levels for an employee from available data.
// Deterministic, evidence-based mapping from performance/competency/training scores (0-100)
// to a 1-5 scale, plus role/recognition adjustments.
export function estimateEmployeeCompetencies(employee, { recognitionCount = 0 } = {}) {
  const base = (pct) => {
    const v = Number(pct) || 0
    if (v >= 90) return 5
    if (v >= 80) return 4
    if (v >= 65) return 3
    if (v >= 50) return 2
    return 1
  }

  const perf = base(employee.performance)
  const comp = base(employee.competency)
  const train = base(employee.training)

  // Recognition boosts customer service / teamwork slightly (supporting evidence only)
  const recBoost = recognitionCount >= 2 ? 1 : 0

  const levels = {
    jobKnowledge: Math.min(5, comp),
    technicalSkills: Math.min(5, comp),
    clinicalSkills: Math.min(5, comp),
    leadership: Math.min(5, Math.max(1, base(employee.competency) + (employee.role && /manager|chief|head|director|officer/i.test(employee.role) ? 1 : 0))),
    communication: Math.min(5, Math.max(1, perf + recBoost)),
    teamwork: Math.min(5, Math.max(1, perf + recBoost)),
    criticalThinking: Math.min(5, comp),
    problemSolving: Math.min(5, comp),
    customerService: Math.min(5, Math.max(1, perf + recBoost)),
    compliance: Math.min(5, Math.max(1, train + (employee.role && /nurse|tech|physician|doctor/i.test(employee.role) ? 1 : 0))),
    digitalLiteracy: Math.min(5, Math.max(1, train)),
    aiLiteracy: Math.min(5, Math.max(1, Math.round((train + comp) / 2))),
    dataLiteracy: Math.min(5, Math.max(1, comp)),
    innovation: Math.min(5, Math.max(1, comp + recBoost)),
    continuousLearning: Math.min(5, Math.max(1, train)),
  }
  return levels
}

// AI Readiness sub-dimensions (0-100)
export const AI_READINESS_DIMENSIONS = [
  { id: 'aiKnowledge', label: 'AI Knowledge' },
  { id: 'promptEngineering', label: 'Prompt Engineering' },
  { id: 'responsibleAI', label: 'Responsible AI' },
  { id: 'aiProductivity', label: 'AI Productivity' },
  { id: 'aiToolAdoption', label: 'AI Tool Adoption' },
  { id: 'aiEthics', label: 'AI Ethics' },
  { id: 'aiSecurity', label: 'AI Security Awareness' },
  { id: 'aiCollaboration', label: 'AI Collaboration' },
]

// Derive AI readiness sub-scores (0-100) from an employee's competency levels.
export function computeAIReadiness(levels) {
  const cl = (id) => (levels[id] ? ((levels[id] - 1) / 4) * 100 : 0)
  const dims = {
    aiKnowledge: cl('aiLiteracy'),
    promptEngineering: cl('dataLiteracy'),
    responsibleAI: Math.round((cl('aiLiteracy') + cl('compliance')) / 2),
    aiProductivity: cl('digitalLiteracy'),
    aiToolAdoption: cl('digitalLiteracy'),
    aiEthics: Math.round((cl('aiLiteracy') + cl('compliance')) / 2),
    aiSecurity: cl('compliance'),
    aiCollaboration: Math.round((cl('teamwork') + cl('communication')) / 2),
  }
  const overall = Math.round(AI_READINESS_DIMENSIONS.reduce((s, d) => s + dims[d.id], 0) / 8)
  return { overall, dims }
}

export const aiReadinessClass = (score) => {
  if (score >= 90) return { label: 'AI Leader', color: '#059669' }
  if (score >= 75) return { label: 'AI Ready', color: '#16a34a' }
  if (score >= 60) return { label: 'AI Capable', color: '#d97706' }
  if (score >= 40) return { label: 'AI Developing', color: '#dc2626' }
  return { label: 'AI Beginner', color: '#7f1d1d' }
}