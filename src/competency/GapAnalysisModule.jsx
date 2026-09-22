import { useEffect, useMemo, useRef, useState } from 'react'
import {
  COMPETENCIES, scoreLabel, AI_READINESS_DIMENSIONS, aiReadinessClass,
  requiredLevelsForRole, requiredLevelsSource,
  getRoleProfileOverrides, setRoleProfileOverride, clearRoleProfileOverride,
} from './framework'
import {
  analyzeWorkforce,
  generateAIEnhancedRecommendation,
  recordGapSnapshot, getGapSnapshots, clearGapSnapshots,
} from './gapEngine'

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
function EmployeeDashboard({ analysis, apiKey }) {
  const a = analysis
  const [aiRecs, setAiRecs] = useState({})

  const requestAIRec = async (gap) => {
    if (!apiKey) {
      setAiRecs((prev) => ({ ...prev, [gap.competencyId]: { error: 'No API key configured. Add one in the Role Profiles tab.' } }))
      return
    }
    setAiRecs((prev) => ({ ...prev, [gap.competencyId]: { loading: true } }))
    try {
      const text = await generateAIEnhancedRecommendation(a.employee, gap, apiKey)
      setAiRecs((prev) => ({ ...prev, [gap.competencyId]: { text } }))
    } catch (err) {
      setAiRecs((prev) => ({ ...prev, [gap.competencyId]: { error: err.message || 'AI recommendation failed.' } }))
    }
  }

  const exportPDF = () => {
    const emp = a.employee
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const gaps = a.gaps.filter((g) => g.gap > 0).slice(0, 5)
    const gapRows = gaps.map((g) => `
      <tr>
        <td><strong>${g.competencyName}</strong></td>
        <td>${scoreLabel(g.currentLevel)} (${g.currentLevel}/5)</td>
        <td>${scoreLabel(g.requiredLevel)} (${g.requiredLevel}/5)</td>
        <td>${g.gap} level(s)</td>
        <td><span style="color:${g.priority==='High'?'#dc2626':g.priority==='Medium'?'#d97706':'#16a34a'};font-weight:700">${g.priority}</span></td>
        <td>${g.recommendation?.why || '—'}</td>
      </tr>`).join('')
    const roadmapItems = (a.roadmap || []).map((phase) => `
      <div style="margin-bottom:12px">
        <div style="font-weight:700;color:#052e16;margin-bottom:4px">${phase.phase} (${phase.timeframe})</div>
        <ul style="margin:0;padding-left:18px">
          ${(phase.actions || []).map(act => `<li>${act.type}: ${act.target}</li>`).join('')}
        </ul>
      </div>`).join('')
    const html = `<!DOCTYPE html><html><head>
      <meta charset="utf-8">
      <title>Development Plan — ${emp.name}</title>
      <style>
        * { margin:0;padding:0;box-sizing:border-box; }
        body { font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;padding:32px;line-height:1.6; }
        .header { border-bottom:3px solid #22c55e;padding-bottom:16px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-end; }
        .header-left h1 { font-size:22px;color:#052e16; }
        .header-left p { color:#475569;font-size:13px;margin-top:2px; }
        .header-right { text-align:right;color:#64748b;font-size:12px; }
        .scores { display:flex;gap:16px;margin-bottom:24px; }
        .score-card { flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;text-align:center; }
        .score-card .num { font-size:26px;font-weight:800;color:#16a34a; }
        .score-card .label { font-size:11px;color:#475569;margin-top:2px; }
        h2 { font-size:15px;color:#052e16;border-left:4px solid #22c55e;padding-left:10px;margin:20px 0 12px; }
        table { width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px; }
        th { background:#052e16;color:#fff;padding:8px 10px;text-align:left; }
        td { padding:7px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top; }
        tr:nth-child(even) td { background:#f8fafc; }
        .info-grid { display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:20px; }
        .info-item { background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px; }
        .info-item .key { font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.04em; }
        .info-item .val { font-weight:600;color:#1a1a1a;margin-top:2px; }
        .footer { margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;display:flex;justify-content:space-between; }
        @media print { body { padding:20px; } }
      </style>
    </head><body>
      <div class="header">
        <div class="header-left">
          <h1>Individual Development Plan</h1>
          <p>${emp.name} &mdash; ${emp.role} &bull; ${emp.department}</p>
        </div>
        <div class="header-right">
          <div><strong>IHIMS</strong> &mdash; AI-Driven HR System</div>
          <div>Generated: ${today}</div>
          <div>Bestlink College of the Philippines</div>
        </div>
      </div>
      <div class="scores">
        <div class="score-card"><div class="num">${a.overallScore}%</div><div class="label">Overall Competency</div></div>
        <div class="score-card"><div class="num">${a.promotionReadiness}%</div><div class="label">Promotion Readiness</div></div>
        <div class="score-card"><div class="num">${a.ai.overall}</div><div class="label">AI Readiness &bull; ${a.aiClass.label}</div></div>
        <div class="score-card"><div class="num" style="color:${a.retentionRisk==='High'?'#dc2626':'#16a34a'}">${a.retentionRisk}</div><div class="label">Retention Risk</div></div>
      </div>
      <div class="info-grid">
        <div class="info-item"><div class="key">Qualifications</div><div class="val">${emp.qualifications||'—'}</div></div>
        <div class="info-item"><div class="key">Employment Status</div><div class="val">${emp.employmentStatus||'—'}</div></div>
        <div class="info-item"><div class="key">Date Hired</div><div class="val">${emp.dateHired||'—'}</div></div>
        <div class="info-item"><div class="key">Overall Assessment</div><div class="val">${a.overallScore>=90?'Exceptional':a.overallScore>=80?'Proficient':a.overallScore>=70?'Developing':'Needs Improvement'}</div></div>
      </div>
      ${gaps.length>0?`<h2>Competency Gap Analysis</h2><table><thead><tr><th>Competency</th><th>Current</th><th>Required</th><th>Gap</th><th>Priority</th><th>Development Focus</th></tr></thead><tbody>${gapRows}</tbody></table>`:`<h2>Competency Gap Analysis</h2><p style="color:#16a34a;font-weight:600;margin-bottom:16px">&#10003; No competency gaps identified.</p>`}
      ${roadmapItems?`<h2>Development Roadmap</h2><div>${roadmapItems}</div>`:''}
      ${emp.competencyNotes?`<h2>HR Observations</h2><div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px">${emp.competencyNotes}</div>`:''}
      <div class="footer">
        <span>IHIMS AI-Driven Competency Gap Analysis &mdash; Bestlink College of the Philippines</span>
        <span>RA 10173 Compliant &bull; For HR Use Only</span>
      </div>
    </body></html>`
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 500)
  }
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
          <button
            type="button"
            onClick={exportPDF}
            style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:8, border:'1px solid var(--primary)', background:'var(--primary-soft)', color:'var(--primary)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit' }}
            title="Export individual development plan as PDF"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Export PDF
          </button>
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
                      <div className="gap-rec-cert">Target certification: {g.recommendation.certification}</div>
                    ) : null}
                    {/* AI-enhanced recommendation */}
                    <div style={{ marginTop: 10 }}>
                      {aiRecs[g.competencyId]?.loading ? (
                        <div style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic' }}>Generating AI recommendation…</div>
                      ) : aiRecs[g.competencyId]?.text ? (
                        <div style={{ marginTop: 6, padding: '10px 12px', background: 'var(--primary-soft)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
                          <strong style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--primary)', display: 'block', marginBottom: 4 }}>✦ AI-Enhanced Recommendation</strong>
                          {aiRecs[g.competencyId].text}
                        </div>
                      ) : aiRecs[g.competencyId]?.error ? (
                        <div style={{ fontSize: 12, color: '#dc2626' }}>{aiRecs[g.competencyId].error}</div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => requestAIRec(g)}
                          style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid var(--primary)', background: 'var(--primary-soft)', color: 'var(--primary)', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}
                        >
                          ✦ Get AI Recommendation
                        </button>
                      )}
                    </div>
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

  // ── API key for AI-enhanced recommendations ───────────────────────────────
  const API_KEY_STORE = 'ihims_anthropic_key'
  const [apiKey, setApiKey] = useState(() => { try { return localStorage.getItem(API_KEY_STORE) || '' } catch { return '' } })
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  const [apiKeyMsg, setApiKeyMsg] = useState('')

  const saveApiKey = () => {
    try { localStorage.setItem(API_KEY_STORE, apiKeyDraft.trim()); setApiKey(apiKeyDraft.trim()); setApiKeyMsg('API key saved.'); setApiKeyDraft(''); setTimeout(() => setApiKeyMsg(''), 3000) } catch { setApiKeyMsg('Failed to save.') }
  }
  const clearApiKey = () => {
    try { localStorage.removeItem(API_KEY_STORE); setApiKey(''); setApiKeyMsg('API key cleared.'); setTimeout(() => setApiKeyMsg(''), 3000) } catch {}
  }

  // ── Trend snapshots ───────────────────────────────────────────────────────
  const [snapshots, setSnapshots] = useState(() => getGapSnapshots())
  const [snapshotMsg, setSnapshotMsg] = useState('')

  // ── Role profile overrides ────────────────────────────────────────────────
  const [overrides, setOverrides] = useState(() => getRoleProfileOverrides())
  const [editingRole, setEditingRole] = useState(null)
  const [editDraft, setEditDraft] = useState({})
  const [overrideMsg, setOverrideMsg] = useState('')

  const recognitionByEmployee = useMemo(() => {
    const map = {}
    recognitionAwards.forEach((r) => { map[r.recipient] = (map[r.recipient] || 0) + 1 })
    return map
  }, [recognitionAwards])

  const workforce = useMemo(() => analyzeWorkforce(employees, recognitionByEmployee), [employees, recognitionByEmployee])
  const selected = workforce.analyses.find((a) => a.employee.id === selectedId) || workforce.analyses[0]
  const uniqueRoles = useMemo(() => [...new Set(employees.map(e => e.role))].sort(), [employees])

  const takeSnapshot = () => {
    recordGapSnapshot(employees, recognitionByEmployee)
    setSnapshots(getGapSnapshots())
    setSnapshotMsg('Snapshot recorded for ' + new Date().toLocaleDateString())
    setTimeout(() => setSnapshotMsg(''), 3000)
  }

  const startEditRole = (role) => {
    const dept = employees.find(e => e.role === role)?.department
    setEditDraft({ ...requiredLevelsForRole(role, dept) })
    setEditingRole(role)
    setOverrideMsg('')
  }

  const saveRoleOverride = () => {
    setRoleProfileOverride(editingRole, editDraft)
    setOverrides(getRoleProfileOverrides())
    setEditingRole(null)
    setOverrideMsg(`Profile for "${editingRole}" saved as override.`)
    setTimeout(() => setOverrideMsg(''), 3000)
  }

  const clearOverride = (role) => {
    clearRoleProfileOverride(role)
    setOverrides(getRoleProfileOverrides())
    setOverrideMsg(`Override for "${role}" removed — back to auto-inference.`)
    setTimeout(() => setOverrideMsg(''), 3000)
  }

  const tabs = [
    { id: 'employee',     label: 'Employee Dashboard' },
    { id: 'manager',      label: 'Manager Dashboard' },
    { id: 'hr',           label: 'HR Dashboard' },
    { id: 'executive',    label: 'Executive Dashboard' },
    { id: 'roleProfiles', label: 'Role Profiles' },
    { id: 'trends',       label: 'Trends' },
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

      {/* ── EMPLOYEE DASHBOARD ── */}
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
          {selected && <EmployeeDashboard analysis={selected} apiKey={apiKey} />}
        </div>
      )}
      {view === 'manager'   && <ManagerDashboard   workforce={workforce} />}
      {view === 'hr'        && <HRDashboard        workforce={workforce} />}
      {view === 'executive' && <ExecutiveDashboard workforce={workforce} />}

      {/* ── ROLE PROFILES TAB ── */}
      {view === 'roleProfiles' && (
        <div className="gap-view">
          <div className="gap-panel">
            <h4>Role Competency Profiles</h4>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              Required competency levels used by the gap engine per role. Source priority: Admin Override → Built-in Table → Auto-Inferred (keyword classifier). HR/Admin can review and adjust any profile here.
            </p>
            {overrideMsg && <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--primary-soft)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--primary)' }}>{overrideMsg}</div>}
            <table className="gap-table">
              <thead><tr><th>Role</th><th>Source</th><th>Clinical</th><th>Leadership</th><th>Technical</th><th>Compliance</th><th>Actions</th></tr></thead>
              <tbody>
                {uniqueRoles.map((role) => {
                  const dept = employees.find(e => e.role === role)?.department
                  const levels = requiredLevelsForRole(role, dept)
                  const source = requiredLevelsSource(role)
                  const srcColor = source === 'override' ? '#16a34a' : source === 'explicit' ? '#2563eb' : '#d97706'
                  const srcLabel = source === 'override' ? 'Admin Override' : source === 'explicit' ? 'Built-in' : 'Auto-Inferred'
                  return (
                    <tr key={role}>
                      <td><strong>{role}</strong></td>
                      <td><span style={{ fontSize: 11, fontWeight: 700, color: srcColor, background: srcColor + '18', borderRadius: 999, padding: '2px 8px' }}>{srcLabel}</span></td>
                      <td>{levels.clinicalSkills}</td>
                      <td>{levels.leadership}</td>
                      <td>{levels.technicalSkills}</td>
                      <td>{levels.compliance}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn-edit" onClick={() => startEditRole(role)}>Edit</button>
                          {source === 'override' && <button className="btn-delete" onClick={() => clearOverride(role)}>Reset</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Edit modal */}
          {editingRole && (
            <div className="modal-overlay" onClick={() => setEditingRole(null)}>
              <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                  <h3>Edit Required Levels — {editingRole}</h3>
                  <button className="modal-close" onClick={() => setEditingRole(null)}>&times;</button>
                </div>
                <div className="modal-body">
                  <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 14 }}>Set the required level (1–5) for each competency. Saving creates an admin override with highest priority.</p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {COMPETENCIES.map((c) => (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                        <span>{c.name}</span>
                        <input type="number" min="1" max="5"
                          value={editDraft[c.id] ?? 3}
                          onChange={e => setEditDraft(prev => ({ ...prev, [c.id]: Math.max(1, Math.min(5, parseInt(e.target.value) || 3)) }))}
                          style={{ width: 52, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', textAlign: 'center' }}
                        />
                      </label>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  <button className="btn-cancel" onClick={() => setEditingRole(null)}>Cancel</button>
                  <button className="btn-save" onClick={saveRoleOverride}>Save Override</button>
                </div>
              </div>
            </div>
          )}

          {/* API key section */}
          <div className="gap-panel" style={{ marginTop: 16 }}>
            <h4>AI-Enhanced Recommendations</h4>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>
              Enter your Anthropic API key to enable LLM-generated recommendations on the Employee Dashboard.
              Key is stored in this browser only. <strong>Do not use a production key here</strong> — see security note in gapEngine.js.
            </p>
            {apiKey ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ API key configured</span>
                <button className="btn-delete" onClick={clearApiKey}>Clear Key</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input type="password" placeholder="sk-ant-..." value={apiKeyDraft} onChange={e => setApiKeyDraft(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, minWidth: 200 }} />
                <button className="btn-save" onClick={saveApiKey} disabled={!apiKeyDraft.trim()}>Save Key</button>
              </div>
            )}
            {apiKeyMsg && <div style={{ marginTop: 8, fontSize: 13, color: 'var(--primary)' }}>{apiKeyMsg}</div>}
          </div>
        </div>
      )}

      {/* ── TRENDS TAB ── */}
      {view === 'trends' && (
        <div className="gap-view">
          <div className="gap-panel">
            <h4>Competency Trend Tracking</h4>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
              Snapshots record org-wide competency index, AI readiness, critical gap count, and succession-ready count at a point in time. Take one periodically after a training cycle to track whether gaps are closing.
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              <button className="btn-save" onClick={takeSnapshot}>Record Snapshot Now</button>
              {snapshots.length > 0 && <button className="btn-delete" onClick={() => { clearGapSnapshots(); setSnapshots([]) }}>Clear History</button>}
              {snapshotMsg && <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>{snapshotMsg}</span>}
            </div>
            {snapshots.length === 0 ? (
              <div className="attention-empty">No snapshots yet — click "Record Snapshot Now" to start tracking trends.</div>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <h5 style={{ fontSize: 13, marginBottom: 8 }}>Org Competency Index over time</h5>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, background: 'var(--surface)', borderRadius: 8, padding: '8px 8px 0' }}>
                    {snapshots.slice(-30).map((s, i) => (
                      <div key={i} title={`${s.date}: ${s.orgCompetencyIndex}%`}
                        style={{ flex: 1, background: 'var(--primary)', borderRadius: '3px 3px 0 0', height: `${s.orgCompetencyIndex}%`, minWidth: 4, opacity: 0.7 + (i / snapshots.length) * 0.3 }} />
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                    <span>{snapshots[0]?.date}</span><span>{snapshots[snapshots.length - 1]?.date}</span>
                  </div>
                </div>
                <table className="gap-table">
                  <thead><tr><th>Date</th><th>Org Competency</th><th>AI Readiness</th><th>Critical Gaps</th><th>Succession Ready</th><th>Employees</th></tr></thead>
                  <tbody>
                    {[...snapshots].reverse().map((s, i, arr) => {
                      const prev = arr[i + 1]
                      const delta = (cur, pr) => {
                        if (!pr) return null
                        const d = cur - pr
                        return d === 0 ? null : <span style={{ color: d > 0 ? '#16a34a' : '#dc2626', fontSize: 11, marginLeft: 4 }}>{d > 0 ? '▲' : '▼'}{Math.abs(d)}</span>
                      }
                      return (
                        <tr key={s.date}>
                          <td>{s.date}</td>
                          <td>{s.orgCompetencyIndex}% {delta(s.orgCompetencyIndex, prev?.orgCompetencyIndex)}</td>
                          <td>{s.orgAIReadiness}% {delta(s.orgAIReadiness, prev?.orgAIReadiness)}</td>
                          <td>{s.criticalGapCount} {delta(-s.criticalGapCount, prev ? -prev.criticalGapCount : null)}</td>
                          <td>{s.successionReady} {delta(s.successionReady, prev?.successionReady)}</td>
                          <td>{s.employeeCount}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}