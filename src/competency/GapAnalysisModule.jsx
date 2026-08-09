import { useEffect, useMemo, useState } from 'react'
import { COMPETENCIES, scoreLabel, AI_READINESS_DIMENSIONS, aiReadinessClass } from './framework'
import { analyzeWorkforce } from './gapEngine'

// Small presentational helpers
// Animated bar: width animates from 0 to target on mount / value change.
const Bar = ({ value, max = 100, color = 'var(--primary)', delay = 0 }) => {
  const [width, setWidth] = useState(0)
  const target = Math.max(0, Math.min(100, (Number(value) || 0) / max) * 100)
  useEffect(() => {
    const t = setTimeout(() => setWidth(target), delay)
    return () => clearTimeout(t)
  }, [target, delay])
  return (
    <div className="gap-bar">
      <div className="gap-bar-fill" style={{ width: `${width}%`, background: color, transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)' }}></div>
    </div>
  )
}

const Radar = ({ levels }) => {
  // Simplified radar using a polygon; 8 selected competencies
  const keys = ['technicalSkills', 'clinicalSkills', 'leadership', 'communication', 'teamwork', 'criticalThinking', 'compliance', 'aiLiteracy']
  const n = keys.length
  const cx = 110, cy = 110, r = 80
  const angle = (i) => ((2 * Math.PI) / n) * i - Math.PI / 2
  const pt = (i, val) => {
    const x = cx + Math.cos(angle(i)) * r * (val / 5)
    const y = cy + Math.sin(angle(i)) * r * (val / 5)
    return `${x},${y}`
  }
  const gridPoints = (val) => keys.map((_, i) => pt(i, val)).join(' ')
  const dataPoints = keys.map((k, i) => pt(i, levels[k] || 0)).join(' ')
  return (
    <svg viewBox="0 0 220 220" className="gap-radar">
      {[1, 2, 3, 4, 5].map((v) => (
        <polygon key={v} points={gridPoints(v)} fill="none" stroke="var(--border)" strokeWidth="1" />
      ))}
      {keys.map((k, i) => {
        const [x, y] = pt(i, 5).split(',')
        return <line key={k} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth="1" />
      })}
      <polygon points={dataPoints} fill="rgba(3,105,161,0.35)" stroke="var(--primary)" strokeWidth="2" />
      {keys.map((k, i) => {
        const [x, y] = pt(i, levels[k] || 0).split(',')
        return <circle key={k} cx={x} cy={y} r="3" fill="var(--primary)" />
      })}
    </svg>
  )
}

const PriorityPill = ({ label }) => (
  <span className={`gap-pill ${label.toLowerCase()}`}>{label}</span>
)

// Employee Dashboard
function EmployeeDashboard({ analysis }) {
  const a = analysis
  return (
    <div className="gap-dash">
      <div className="gap-profile">
        <div className="gap-profile-main">
          <h3>{a.employee.name}</h3>
          <span className="gap-role">{a.employee.role} • {a.employee.department}</span>
        </div>
        <div className="gap-profile-scores">
          <div className="gap-score-chip">
            <span className="gap-score-num">{a.overallScore}%</span>
            <span className="gap-score-label">Overall Competency</span>
          </div>
          <div className="gap-score-chip">
            <span className="gap-score-num" style={{ color: a.aiClass.color }}>{a.ai.overall}</span>
            <span className="gap-score-label">AI Readiness · {a.aiClass.label}</span>
          </div>
          <div className="gap-score-chip">
            <span className="gap-score-num">{a.promotionReadiness}%</span>
            <span className="gap-score-label">Promotion Readiness</span>
          </div>
        </div>
      </div>

      <div className="gap-grid-2">
        <div className="gap-panel">
          <h4>Competency Radar</h4>
          <div className="gap-radar-wrap">
            <Radar levels={a.current} />
          </div>
        </div>
        <div className="gap-panel">
          <h4>Skill Gap Matrix</h4>
          <table className="gap-table">
            <thead>
              <tr><th>Competency</th><th>Current</th><th>Required</th><th>Gap</th><th>Priority</th></tr>
            </thead>
            <tbody>
              {a.gaps.filter((g) => g.gap > 0).map((g) => (
                <tr key={g.competencyId}>
                  <td>{g.competencyName}</td>
                  <td>{g.currentLevel}</td>
                  <td>{g.requiredLevel}</td>
                  <td className={g.gap >= 2 ? 'gap-high' : 'gap-med'}>{g.gap}</td>
                  <td><PriorityPill label={g.priority} level={g.priorityLevel} /></td>
                </tr>
              ))}
              {a.gaps.filter((g) => g.gap > 0).length === 0 && (
                <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--success)' }}>No competency gaps — fully aligned to role.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

<div className="gap-panel">
        <h4>Personalized Learning Roadmap</h4>
        <div className="gap-roadmap">
          {a.roadmap.map((phase) => (
            <div key={phase.period} className="gap-phase">
              <h5>{phase.period}</h5>
              <ul>
                {phase.items.map((it, i) => (
                  <li key={i}><strong>{it.kind}:</strong> {it.title} <em>(target: {it.target})</em></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Tailored development actions by top gap */}
      {(() => {
        const topGap = a.gaps.filter((g) => g.gap > 0)[0]
        if (!topGap || !topGap.recommendation) return null
        return (
          <div className="gap-panel">
            <h4>Priority Development Plan — {topGap.competencyName}</h4>
            <p className="gap-rec-why">{topGap.recommendation.why}</p>
            <ul className="gap-rec-actions">
              {topGap.recommendation.actions.map((act, i) => (
                <li key={i}><span className="gap-rec-kind">{act.kind}:</span> {act.title}</li>
              ))}
            </ul>
            {topGap.recommendation.certification ? (
              <div className="gap-rec-cert">🎓 Target certification: {topGap.recommendation.certification}</div>
            ) : null}
          </div>
        )
      })()}

<div className="gap-panel">
        <h4>Explainability & Recommendations</h4>
        {a.developmentAreas.length === 0 ? (
          <p>This employee meets all required competency levels. Maintain current development and explore stretch assignments.</p>
        ) : (
          <ul className="gap-explain">
            {a.gaps.filter((g) => g.gap > 0).slice(0, 5).map((g) => (
              <li key={g.competencyId}>
                <strong>{g.competencyName}</strong> — gap of {g.gap} level(s) ({scoreLabel(g.currentLevel)} → {scoreLabel(g.requiredLevel)}).
                <div className="gap-impact">Impact: {g.businessImpact}</div>
                <div className="gap-risk">Risk: {g.risk} · Priority: {g.priority}</div>
                {g.recommendation ? (
                  <div className="gap-recommendation">
                    <div className="gap-rec-why">{g.recommendation.why}</div>
                    <ul className="gap-rec-actions">
                      {g.recommendation.actions.slice(0, 3).map((act, i) => (
                        <li key={i}><span className="gap-rec-kind">{act.kind}:</span> {act.title}</li>
                      ))}
                    </ul>
                    {g.recommendation.certification ? (
                      <div className="gap-rec-cert">🎓 Target certification: {g.recommendation.certification}</div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="gap-panel">
        <h4>AI Readiness Breakdown</h4>
        <div className="gap-ai-grid">
          {AI_READINESS_DIMENSIONS.map((d) => (
            <div key={d.id} className="gap-ai-dim">
              <span className="gap-ai-label">{d.label}</span>
              <Bar value={a.ai.dims[d.id]} />
              <span className="gap-ai-val">{Math.round(a.ai.dims[d.id])}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Manager Dashboard
function ManagerDashboard({ workforce }) {
  return (
    <div className="gap-dash">
      <div className="gap-row">
        <div className="gap-kpi"><span className="gap-kpi-num">{workforce.analyses.length}</span><span>Team Members Analyzed</span></div>
        <div className="gap-kpi"><span className="gap-kpi-num">{workforce.orgCompetencyIndex}%</span><span>Team Competency Index</span></div>
        <div className="gap-kpi"><span className="gap-kpi-num">{workforce.highRiskEmployees}</span><span>High-Risk Employees</span></div>
        <div className="gap-kpi"><span className="gap-kpi-num">{workforce.successionReady}</span><span>Promotion Candidates</span></div>
      </div>

      <div className="gap-panel">
        <h4>Team Competency Heatmap</h4>
        <table className="gap-table">
          <thead>
            <tr>
              <th>Employee</th>
              {COMPETENCIES.map((c) => <th key={c.id} title={c.name}>{c.name.split(' ')[0]}</th>)}
              <th>Overall</th>
            </tr>
          </thead>
          <tbody>
            {workforce.analyses.map((a) => (
              <tr key={a.employee.id}>
                <td>{a.employee.name}</td>
                {COMPETENCIES.map((c) => {
                  const lvl = a.current[c.id]
                  const req = a.required[c.id]
                  const isGap = lvl < req
                  return (
                    <td key={c.id}>
                      <span className="heat-cell" style={{ background: isGap ? 'rgba(220,38,38,0.75)' : 'rgba(5,150,105,0.6)' }} title={`${lvl}/${req}`}>{lvl}</span>
                    </td>
                  )
                })}
                <td><strong>{a.overallScore}%</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gap-grid-2">
        <div className="gap-panel">
          <h4>Skill Gap Summary</h4>
          {workforce.criticalGaps.length === 0 ? (
            <p>No critical skill gaps identified.</p>
          ) : (
            <ul className="gap-list">
              {workforce.criticalGaps.slice(0, 8).map((g) => (
                <li key={g.name}><strong>{g.name}</strong> — {g.count} employee(s), avg gap {g.avgGap}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="gap-panel">
          <h4>Training Progress</h4>
          <ul className="gap-list">
            {workforce.analyses.slice(0, 8).map((a) => (
              <li key={a.employee.id}>
                {a.employee.name} — <Bar value={a.learningCompletion} /> {a.learningCompletion}%
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// HR Dashboard
function HRDashboard({ workforce }) {
  return (
    <div className="gap-dash">
      <div className="gap-grid-2">
        <div className="gap-panel">
          <h4>Department Competency Comparison</h4>
          <div className="gap-bars">
            {workforce.departments.map((d) => (
              <div key={d.name} className="gap-dept-row">
                <span className="gap-dept-name">{d.name}</span>
                <div className="gap-dept-bar"><Bar value={d.competency} /></div>
                <span className="gap-dept-val">{d.competency}%</span>
              </div>
            ))}
          </div>
        </div>
        <div className="gap-panel">
          <h4>Workforce AI Readiness Distribution</h4>
          <div className="gap-dist">
            {[['leader', 'AI Leader'], ['ready', 'AI Ready'], ['capable', 'AI Capable'], ['developing', 'AI Developing'], ['beginner', 'AI Beginner']].map(([k, label]) => (
              <div key={k} className="gap-dist-row">
                <span>{label}</span>
                <Bar value={(workforce.aiDistribution[k] / Math.max(1, workforce.analyses.length)) * 100} />
                <span className="gap-dist-num">{workforce.aiDistribution[k]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="gap-panel">
        <h4>Critical Organizational Skill Gaps</h4>
        <table className="gap-table">
          <thead><tr><th>Skill</th><th>Employees Affected</th><th>Avg Gap</th><th>Severity</th></tr></thead>
          <tbody>
            {workforce.criticalGaps.map((g) => (
              <tr key={g.name}>
                <td>{g.name}</td>
                <td>{g.count}</td>
                <td>{g.avgGap}</td>
                <td><PriorityPill label={g.avgGap >= 2 ? 'High' : 'Medium'} level={g.avgGap >= 2 ? 3 : 2} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gap-grid-2">
        <div className="gap-panel">
          <h4>Succession Readiness</h4>
          <p>Employees ready for promotion: <strong>{workforce.successionReady}</strong></p>
          <p>Leadership pipeline (leadership ≥ 4): <strong>{workforce.leadershipPipeline}</strong></p>
        </div>
        <div className="gap-panel">
          <h4>Learning Effectiveness</h4>
          <p>Average training completion: <strong>{Math.round(workforce.analyses.reduce((s, a) => s + a.learningCompletion, 0) / Math.max(1, workforce.analyses.length))}%</strong></p>
        </div>
      </div>
    </div>
  )
}

// Executive Dashboard
function ExecutiveDashboard({ workforce }) {
  return (
    <div className="gap-dash">
      <div className="gap-row">
        <div className="gap-kpi accent"><span className="gap-kpi-num">{workforce.orgAIReadiness}</span><span>Enterprise AI Readiness</span></div>
        <div className="gap-kpi"><span className="gap-kpi-num">{workforce.orgCompetencyIndex}%</span><span>Organization Competency Index</span></div>
        <div className="gap-kpi"><span className="gap-kpi-num">{workforce.leadershipPipeline}</span><span>Leadership Pipeline</span></div>
        <div className="gap-kpi"><span className="gap-kpi-num">{workforce.highRiskEmployees}</span><span>Critical Workforce Risks</span></div>
      </div>

      <div className="gap-panel">
        <h4>Strategic Skill Forecast</h4>
        <table className="gap-table">
          <thead><tr><th>Skill</th><th>Affected</th><th>Avg Gap</th><th>Recommended Action</th><th>Priority</th></tr></thead>
          <tbody>
            {workforce.criticalGaps.slice(0, 10).map((g) => (
              <tr key={g.name}>
                <td>{g.name}</td>
                <td>{g.count} employees</td>
                <td>{g.avgGap}</td>
                <td>Targeted upskilling & certification program</td>
                <td><PriorityPill label={g.avgGap >= 2 ? 'High' : 'Medium'} level={g.avgGap >= 2 ? 3 : 2} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="gap-grid-2">
        <div className="gap-panel">
          <h4>AI Readiness by Department</h4>
          <div className="gap-bars">
            {workforce.departments.map((d) => (
              <div key={d.name} className="gap-dept-row">
                <span className="gap-dept-name">{d.name}</span>
                <div className="gap-dept-bar"><Bar value={d.ai} color="var(--secondary)" /></div>
                <span className="gap-dept-val">{d.ai}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="gap-panel">
          <h4>Executive Summary</h4>
          <p className="gap-exec">
            The organization has a competency index of <strong>{workforce.orgCompetencyIndex}%</strong> and an
            enterprise AI readiness of <strong>{workforce.orgAIReadiness}</strong> ({aiReadinessClass(workforce.orgAIReadiness).label}).
            {workforce.highRiskEmployees > 0 ? ` There are ${workforce.highRiskEmployees} high-retention-risk role(s) requiring attention.` : ' Workforce risk is low.'}
            Prioritize closing critical skill gaps in{' '}
            <strong>{workforce.criticalGaps.slice(0, 3).map((g) => g.name).join(', ') || 'core competencies'}</strong> to
            strengthen the succession pipeline and future AI-readiness.
          </p>
        </div>
      </div>
    </div>
  )
}

// Main Gap Analysis Module
export default function GapAnalysisModule({ employees, recognitionAwards }) {
  const [view, setView] = useState('employee')
  const [selectedId, setSelectedId] = useState(null)

  const recognitionByEmployee = useMemo(() => {
    const map = {}
    recognitionAwards.forEach((r) => {
      map[r.recipient] = (map[r.recipient] || 0) + 1
    })
    return map
  }, [recognitionAwards])

  const workforce = useMemo(() => analyzeWorkforce(employees, recognitionByEmployee), [employees, recognitionByEmployee])

  const selected = workforce.analyses.find((a) => a.employee.id === selectedId) || workforce.analyses[0]

  const tabs = [
    { id: 'employee', label: 'Employee Dashboard' },
    { id: 'manager', label: 'Manager Dashboard' },
    { id: 'hr', label: 'HR Dashboard' },
    { id: 'executive', label: 'Executive Dashboard' },
  ]

  return (
    <div className="gap-module">
      <h1 className="page-title">AI Competency Gap Analysis Engine</h1>
      <p className="page-subtitle">Evidence-based competency assessment, AI readiness, and personalized development planning</p>

      <div className="gap-tabs">
        {tabs.map((t) => (
          <button key={t.id} className={`gap-tab ${view === t.id ? 'active' : ''}`} onClick={() => setView(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {view === 'employee' && (
        <div className="gap-view">
          <div className="gap-employee-select">
            <label>Select Employee:</label>
            <select value={selected?.employee?.id || ''} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {workforce.analyses.map((a) => (
                <option key={a.employee.id} value={a.employee.id}>{a.employee.name} — {a.employee.role}</option>
              ))}
            </select>
          </div>
          {selected && <EmployeeDashboard analysis={selected} />}
        </div>
      )}
      {view === 'manager' && <ManagerDashboard workforce={workforce} />}
      {view === 'hr' && <HRDashboard workforce={workforce} />}
      {view === 'executive' && <ExecutiveDashboard workforce={workforce} />}
    </div>
  )
}
