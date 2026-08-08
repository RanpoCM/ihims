// ===========================================================================
// AI Assistant Engine — data-driven, reliable answers about the IHIMS system.
//
// This engine turns the organization's live data (employees, gaps, training,
// recognition, succession) into grounded, factual answers the assistant can
// return. It uses deterministic analysis from the gap engine plus a keyword
// intent matcher, so answers are reproducible and based on real numbers.
// ===========================================================================
import { analyzeWorkforce } from './competency/gapEngine'
import { roleLabel, canEditModule } from './rbac'

// ---------------------------------------------------------------------------
// Intent definitions — each maps keywords to a handler producing a grounded reply
// ---------------------------------------------------------------------------
const intents = [
  { id: 'help', regex: /(help|what can you do|options|capabilit)/ },
  { id: 'navigate', regex: /(go to|navigate|open|show me|move to|take me to)\s+(\w+)/ },
  { id: 'summary', regex: /(summary|overview|stats|numbers|how (are we|is the org)|dashboard)/ },
  { id: 'top', regex: /(top|best|highest).*(perform|employee|talent)/ },
  { id: 'under', regex: /(underperforming|lowest|struggling|needs attention|below)/ },
  { id: 'gaps', regex: /(gap|skill gap|competency gap|weakness)/ },
  { id: 'ai', regex: /(ai readiness|ai literacy|ai competent|ai skill|artificial intelligence)/ },
  { id: 'training', regex: /(training|upskill|certification|course|recommend.*training|development plan)/ },
  { id: 'succession', regex: /(succession|successor|future leader|promot|pipeline|readiness)/ },
  { id: 'recognition', regex: /(recognition|award|praise|celebrat|appreciat)/ },
  { id: 'department', regex: /(department|by dept|per department|dept)/ },
  { id: 'permission', regex: /(permission|access|can i edit|what can i (do|edit|view)|role|allowed)/ },
  { id: 'register', regex: /(register|enroll|sign up|how do i.*training)/ },
  { id: 'login', regex: /(login|otp|password|credential|sign in)/ },
  { id: 'employee', regex: /(employee|staff|person|who is|about )/ },
  { id: 'recommendations', regex: /(recommendation|actionable|suggest|advice|improve|what should)/ },
  { id: 'thanks', regex: /(thank|thanks|great|awesome|appreciat)/ },
  { id: 'greet', regex: /^(hi|hello|hey|good (morning|afternoon|evening))/ },
]

// ---------------------------------------------------------------------------
// Aggregated, grounded context builder
// ---------------------------------------------------------------------------
function buildOrgContext(dataSummary) {
  const employees = dataSummary.employees || []
  const trainingPrograms = dataSummary.trainingPrograms || []
  const recognitionAwards = dataSummary.recognitionAwards || []
  const successionCandidates = dataSummary.successionCandidates || []

  const recognitionByEmployee = {}
  recognitionAwards.forEach((r) => {
    recognitionByEmployee[r.recipient] = (recognitionByEmployee[r.recipient] || 0) + 1
  })

  const workforce = analyzeWorkforce(employees, recognitionByEmployee)

  // Top/gap highlights
  const top = [...employees].sort((a, b) => b.performance - a.performance).slice(0, 3)
  const under = [...employees].filter((e) => e.performance < 80).sort((a, b) => a.performance - b.performance).slice(0, 3)
  const criticalGaps = workforce.criticalGaps.slice(0, 3)

  const upcoming = trainingPrograms.filter((p) => p.status === 'upcoming')
  const highReadiness = successionCandidates.filter((p) => p.readiness === 'High')

  return {
    workforce,
    employees,
    trainingPrograms,
    recognitionAwards,
    successionCandidates,
    top,
    under,
    criticalGaps,
    upcoming,
    highReadiness,
    orgCompetencyIndex: workforce.orgCompetencyIndex,
    orgAIReadiness: workforce.orgAIReadiness,
    highRiskEmployees: workforce.highRiskEmployees,
    successionReady: workforce.successionReady,
  }
}

// ---------------------------------------------------------------------------
// Reply builders (each grounded in real data)
// ---------------------------------------------------------------------------
const replies = {
  help: () => (
    'I can help you with IHIMS using your live data:\n' +
    '• "Summary" — org overview & KPIs\n' +
    '• "Top performers" / "Underperformers"\n' +
    '• "Competency gaps" — critical skill gaps\n' +
    '• "AI readiness" — workforce AI posture\n' +
    '• "Training recommendations" — upskilling\n' +
    '• "Succession" — pipeline & readiness\n' +
    '• "Go to performance" — navigate modules\n' +
    '• "What can I edit?" — your permissions'
  ),

  navigate: (ctx, m) => {
    const map = {
      dashboard: 'dashboard', performance: 'performance', competency: 'competency',
      ai: 'aiCompetency', aicompetency: 'aiCompetency', 'ai competency': 'aiCompetency',
      learning: 'learning', succession: 'succession', recognition: 'recognition',
      accounts: 'accounts', 'learning training': 'learning',
    }
    const target = m ? m[2].toLowerCase() : ''
    const dest = map[target]
    if (dest) return { text: `Taking you to the **${dest}** module now.`, navigate: dest }
    return { text: 'I couldn\'t find that module. Try: dashboard, performance, competency, AI Competency, learning, succession, recognition, or accounts.' }
  },

  summary: (ctx) => {
    const w = ctx.workforce
    const avg = (arr, key) => arr.length ? Math.round(arr.reduce((s, x) => s + x[key], 0) / arr.length) : 0
    return (
      `📊 **Organization Spotlight**\n` +
      `• Employees: ${ctx.employees.length}\n` +
      `• Avg Performance: ${avg(ctx.employees, 'performance')}%\n` +
      `• Avg Competency: ${avg(ctx.employees, 'competency')}%\n` +
      `• Training Completion: ${avg(ctx.employees, 'training')}%\n` +
      `• Competency Index: ${ctx.orgCompetencyIndex}%\n` +
      `• AI Readiness: ${ctx.orgAIReadiness} (${w.orgAIReadiness})\n` +
      `• Recognitions: ${ctx.recognitionAwards.length}\n` +
      `• Succession Plans: ${ctx.successionCandidates.length}\n` +
      `• High-Risk Employees: ${ctx.highRiskEmployees}\n` +
      (ctx.criticalGaps.length ? `• Top Skill Gap: ${ctx.criticalGaps[0].name} (${ctx.criticalGaps[0].count} employees)\n` : '')
    )
  },

  top: (ctx) => {
    if (!ctx.top.length) return 'No employee data available yet.'
    return '🏆 **Top Performers**\n' + ctx.top.map((e, i) =>
      `${i + 1}. ${e.name} — ${e.performance}% performance, ${e.competency}% competency (${e.department})`
    ).join('\n')
  },

  under: (ctx) => {
    if (!ctx.under.length) return '🎉 All employees are performing at or above 80%. No one needs urgent attention.'
    return '⚠️ **Employees Needing Attention** (performance < 80%)\n' + ctx.under.map((e) =>
      `• ${e.name} — ${e.performance}% performance (${e.department})`
    ).join('\n')
  },

  gaps: (ctx) => {
    const w = ctx.workforce
    if (!w.criticalGaps.length) return '✅ No critical skill gaps identified across the organization.'
    return '🔍 **Critical Competency Gaps**\n' + w.criticalGaps.slice(0, 5).map((g) =>
      `• ${g.name} — affects ${g.count} employee(s), avg gap ${g.avgGap} level(s)`
    ).join('\n') + '\n\nOpen the **AI Competency** module for personalized roadmaps.'
  },

  ai: (ctx) => {
    const w = ctx.workforce
    const dist = w.aiDistribution
    return (
      `🤖 **Workforce AI Readiness**\n` +
      `Overall readiness: **${ctx.orgAIReadiness}**\n` +
      `• AI Leaders: ${dist.leader}\n` +
      `• AI Ready: ${dist.ready}\n` +
      `• AI Capable: ${dist.capable}\n` +
      `• AI Developing: ${dist.developing}\n` +
      `• AI Beginner: ${dist.beginner}\n` +
      (w.criticalGaps.some((g) => /AI|Data|Digital/.test(g.name))
        ? `\n💡 Focus on closing digital/AI skill gaps — see the AI Competency module.`
        : `\n💡 Build AI readiness through the learning programs in Learning & Training.`)
    )
  },

  training: (ctx) => {
    const w = ctx.workforce
    const upcoming = ctx.upcoming
    const lowTraining = ctx.employees.filter((e) => e.training < 85).sort((a, b) => a.training - b.training).slice(0, 3)
    const lines = []
    if (lowTraining.length) lines.push(`🎓 **Low training completion:** ${lowTraining.map((e) => `${e.name} (${e.training}%)`).join(', ')}`)
    if (w.criticalGaps.length) lines.push(`🎯 **Upskill priority:** ${w.criticalGaps.slice(0, 3).map((g) => g.name).join(', ')}`)
    if (upcoming.length) lines.push(`📅 **Upcoming programs:** ${upcoming.map((p) => p.title).join(', ')}`)
    if (!lines.length) lines.push('No training needs identified — keep current programs running.')
    return lines.join('\n') + '\n\nOpen **Learning & Training** to register or create programs.'
  },

  succession: (ctx) => {
    const w = ctx.workforce
    const high = ctx.highReadiness
    const lines = []
    lines.push(`📈 **Succession Pipeline**`)
    lines.push(`• High-readiness plans: ${high.length}`)
    lines.push(`• Promotion-candidates: ${w.successionReady} employees`)
    lines.push(`• Leadership pipeline (leadership ≥4): ${w.leadershipPipeline}`)
    if (high.length) lines.push(`• Ready roles: ${high.map((p) => p.currentRole).join(', ')}`)
    if (ctx.highRiskEmployees) lines.push(`⚠️ ${ctx.highRiskEmployees} high-retention-risk employee(s) may need attention.`)
    return lines.join('\n')
  },

  recognition: (ctx) => {
    if (!ctx.recognitionAwards.length) return 'No recognitions recorded yet. Recognize a teammate in the Recognition module!'
    return '🏅 **Recent Recognitions**\n' + ctx.recognitionAwards.slice(0, 3).map((r) =>
      `• ${r.recipient} — ${r.type} (${r.department})`
    ).join('\n')
  },

  department: (ctx) => {
    const w = ctx.workforce
    if (!w.departments.length) return 'No department data available.'
    return '🏢 **Department Competency**\n' + w.departments.map((d) =>
      `• ${d.name}: ${d.competency}% competency, ${d.ai} AI readiness (${d.count} employees)`
    ).join('\n')
  },

  permission: (ctx, _, role) => {
    const label = roleLabel(role)
    const modules = ['performance', 'competency', 'learning', 'recognition', 'accounts']
    const editable = modules.filter((m) => canEditModule(role, m))
    const editStr = editable.length ? editable.join(', ') : 'no modules (read-only)'
    return `As **${label}**, your permissions are:\n• You can edit: ${editStr}\n• You can view: dashboard + all roles' modules per your access.\n\nUse the Accounts module (admin) to change roles.`
  },

  register: () => (
    'You can register for training/certifications in the **Learning & Training** module:\n' +
    '1. Open Learning & Training\n' +
    '2. Find a program (status Upcoming/Ongoing)\n' +
    '3. Click **Register**\n' +
    'Your registrations appear under "My Registrations".'
  ),

  login: () => (
    'Log in with your username and password, then enter the 6-digit OTP shown in the browser console. ' +
    'Demo accounts: **admin/admin123**, **hr/hr123**, **staff/staff123**. ' +
    'Admins can manage accounts in the **Accounts** module.'
  ),

  employee: (ctx) => {
    if (!ctx.employees.length) return 'No employee data available.'
    return '👥 **Employees on record**\n' + ctx.employees.slice(0, 8).map((e) =>
      `• ${e.name} — ${e.role} (${e.department})`
    ).join('\n') + (ctx.employees.length > 8 ? `\n…and ${ctx.employees.length - 8} more.` : '')
  },

  recommendations: (ctx) => {
    const lines = []
    const w = ctx.workforce
    if (ctx.under.length) lines.push(`⚠️ Provide development plans for: ${ctx.under.map((e) => e.name).join(', ')}.`)
    if (w.criticalGaps.length) lines.push(`🎯 Launch upskilling for top gaps: ${w.criticalGaps.slice(0, 3).map((g) => g.name).join(', ')}.`)
    if (ctx.employees.some((e) => e.training < 85)) lines.push('🎓 Expand certification opportunities for staff with low training completion.')
    if (ctx.highReadiness.length) lines.push(`📈 Accelerate succession for high-readiness roles: ${ctx.highReadiness.map((p) => p.currentRole).join(', ')}.`)
    if (!lines.length) lines.push('Your organization data looks healthy. Keep monitoring and invest in continuous learning + AI readiness.')
    return '💡 **Recommended Actions**\n' + lines.join('\n')
  },

  thanks: () => "You're welcome! I'm here whenever you need help navigating or analyzing IHIMS. 😊",
  greet: (ctx) => `Hello! I'm your IHIMS AI assistant. You're in the **${ctx.activeModule || 'dashboard'}** module. Type "help" to see what I can do, or ask about your data (e.g., "summary", "top performers", "competency gaps").`,
  fallback: () =>
    "I'm not sure I understood that. Try asking:\n• \"Summary\"\n• \"Top performers\"\n• \"Competency gaps\"\n• \"AI readiness\"\n• \"Training recommendations\"\n• \"Succession\"\n• \"Go to performance\"\n• \"What can I edit?\"",
}

// ---------------------------------------------------------------------------
// Main entry point — produce a grounded reply + optional navigation
// ---------------------------------------------------------------------------
export function generateAIReply(question, { role, activeModule, dataSummary }) {
  const text = question.toLowerCase()
  const ctx = buildOrgContext(dataSummary)
  ctx.activeModule = activeModule

  // Greetings first
  if (intents.find((i) => i.id === 'greet').regex.test(text)) {
    return { text: replies.greet(ctx) }
  }

  // Navigate (needs captured module)
  const navIntent = intents.find((i) => i.id === 'navigate')
  const navMatch = text.match(navIntent.regex)
  if (navMatch) {
    return replies.navigate(ctx, navMatch)
  }

  // Loop through remaining intents in priority order
  const order = ['help', 'summary', 'top', 'under', 'gaps', 'ai', 'training', 'succession', 'recognition', 'department', 'permission', 'register', 'login', 'employee', 'recommendations', 'thanks']
  for (const id of order) {
    const it = intents.find((i) => i.id === id)
    if (it.regex.test(text)) {
      const fn = replies[id]
      return { text: typeof fn === 'function' ? fn(ctx, null, role) : fn }
    }
  }

  return { text: replies.fallback() }
}

// Convenience: build a greeting for the assistant when it first opens
export function buildGreeting({ role, activeModule, dataSummary }) {
  const label = roleLabel(role)
  const ctx = buildOrgContext(dataSummary)
  const summaryLine = `${ctx.employees.length} employee(s), ${ctx.orgCompetencyIndex}% competency index, ${ctx.orgAIReadiness} AI readiness.`
  return `Hi! I'm your IHIMS AI assistant. You're logged in as **${label}** and currently in the **${activeModule}** module.\n\nHere's a quick snapshot: ${summaryLine}\n\nAsk me anything — try "summary", "top performers", "competency gaps", or type "help".`
}
