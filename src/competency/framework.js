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

export const requiredLevelsForRole = (role) => {
  return REQUIRED_LEVELS_BY_ROLE[role] || REQUIRED_LEVELS_BY_ROLE.default
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
