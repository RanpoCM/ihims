import { useState, useEffect } from 'react'
import './App.css'

// Local Storage Helper
const getStoredData = (key, defaultData) => {
  try {
    const stored = localStorage.getItem(key)
    return stored ? JSON.parse(stored) : defaultData
  } catch {
    return defaultData
  }
}

const setStoredData = (key, data) => {
  localStorage.setItem(key, JSON.stringify(data))
}

// Initial Data
const initialEmployees = [
  { id: 1, name: 'Dr. Sarah Johnson', role: 'Chief Medical Officer', department: 'Administration', performance: 95, competency: 90, training: 85 },
  { id: 2, name: 'James Wilson', role: 'Senior Nurse', department: 'Nursing', performance: 88, competency: 92, training: 78 },
  { id: 3, name: 'Maria Garcia', role: 'HR Manager', department: 'Human Resources', performance: 92, competency: 88, training: 95 },
  { id: 4, name: 'Dr. Michael Chen', role: 'Cardiologist', department: 'Cardiology', performance: 97, competency: 94, training: 82 },
  { id: 5, name: 'Emily Brown', role: 'Lab Technician', department: 'Laboratory', performance: 85, competency: 86, training: 90 },
  { id: 6, name: 'Robert Taylor', role: 'Emergency Nurse', department: 'Emergency', performance: 91, competency: 89, training: 88 },
  { id: 7, name: 'Dr. Lisa Anderson', role: 'Pediatrician', department: 'Pediatrics', performance: 94, competency: 91, training: 80 },
  { id: 8, name: 'David Martinez', role: 'Administrator', department: 'Administration', performance: 87, competency: 85, training: 92 },
]

const initialTrainingPrograms = [
  { id: 1, title: 'Advanced Cardiac Life Support', type: 'Certification', duration: '40 hours', participants: 45, status: 'ongoing' },
  { id: 2, title: 'Patient Safety Protocols', type: 'Workshop', duration: '8 hours', participants: 120, status: 'completed' },
  { id: 3, title: 'Healthcare Communication', type: 'Seminar', duration: '16 hours', participants: 78, status: 'ongoing' },
  { id: 4, title: 'Emergency Response Training', type: 'Certification', duration: '24 hours', participants: 60, status: 'upcoming' },
  { id: 5, title: 'Medical Ethics & Compliance', type: 'Course', duration: '12 hours', participants: 95, status: 'ongoing' },
]

const initialCompetencies = [
  { id: 1, name: 'Clinical Skills', description: 'Patient examination and diagnosis', category: 'Technical', weight: 25 },
  { id: 2, name: 'Communication', description: 'Effective patient and staff interaction', category: 'Soft Skills', weight: 20 },
  { id: 3, name: 'Leadership', description: 'Team management and decision making', category: 'Leadership', weight: 20 },
  { id: 4, name: 'Technical Knowledge', description: 'Medical procedures and equipment', category: 'Technical', weight: 20 },
  { id: 5, name: 'Compliance', description: 'Adherence to regulations and protocols', category: 'Regulatory', weight: 15 },
]

const initialRecognitionAwards = [
  { id: 1, recipient: 'Dr. Sarah Johnson', type: 'Employee of Month', department: 'Administration', date: '2026-06-15', reason: 'Outstanding leadership during hospital expansion' },
  { id: 2, recipient: 'James Wilson', type: 'Excellence in Care', department: 'Nursing', date: '2026-06-10', reason: 'Exceptional patient care and compassion' },
  { id: 3, recipient: 'Maria Garcia', type: 'Innovation Award', department: 'Human Resources', date: '2026-06-05', reason: 'Implemented new employee onboarding system' },
  { id: 4, recipient: 'Dr. Michael Chen', type: 'Research Excellence', department: 'Cardiology', date: '2026-05-28', reason: 'Groundbreaking cardiac research publication' },
]

const initialSuccessionCandidates = [
  { id: 1, currentRole: 'Chief Medical Officer', candidates: ['Dr. Michael Chen', 'Dr. Lisa Anderson'], readiness: 'High', timeline: '2-3 years' },
  { id: 2, currentRole: 'HR Manager', candidates: ['David Martinez', 'Emily Brown'], readiness: 'Medium', timeline: '1-2 years' },
  { id: 3, currentRole: 'Head of Nursing', candidates: ['James Wilson', 'Robert Taylor'], readiness: 'High', timeline: '1 year' },
  { id: 4, currentRole: 'Laboratory Director', candidates: ['Emily Brown'], readiness: 'Medium', timeline: '3 years' },
]

// App Content - Loads data from localStorage
function AppContent({ role, canEdit, onLogout }) {
  const [employees, setEmployees] = useState(() => getStoredData('ihims_employees', initialEmployees))

  const [trainingPrograms, setTrainingPrograms] = useState(() => getStoredData('ihims_training', initialTrainingPrograms))
  const [competencies] = useState(() => getStoredData('ihims_competencies', initialCompetencies))
  const [recognitionAwards, setRecognitionAwards] = useState(() => getStoredData('ihims_recognition', initialRecognitionAwards))
  const [successionCandidates] = useState(() => getStoredData('ihims_succession', initialSuccessionCandidates))
  const [activeModule, setActiveModule] = useState('dashboard')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)


  // Save to localStorage when data changes
  useEffect(() => { setStoredData('ihims_employees', employees) }, [employees])
  useEffect(() => { setStoredData('ihims_training', trainingPrograms) }, [trainingPrograms])
  useEffect(() => { setStoredData('ihims_competencies', competencies) }, [competencies])
  useEffect(() => { setStoredData('ihims_recognition', recognitionAwards) }, [recognitionAwards])
  useEffect(() => { setStoredData('ihims_succession', successionCandidates) }, [successionCandidates])

  // Helper functions
  const addEmployee = (emp) => setEmployees([...employees, { ...emp, id: Date.now() }])
  const updateEmployee = (id, data) => setEmployees(employees.map(e => e.id === id ? { ...e, ...data } : e))
  const deleteEmployee = (id) => setEmployees(employees.filter(e => e.id !== id))

  const addTraining = (prog) => setTrainingPrograms([...trainingPrograms, { ...prog, id: Date.now() }])
  const addRecognition = (rec) => setRecognitionAwards([...recognitionAwards, { ...rec, id: Date.now() }])


  // Render the current module
  const renderModule = () => {
    switch (activeModule) {
      case 'dashboard':
        return <Dashboard employees={employees} trainingPrograms={trainingPrograms} recognitionAwards={recognitionAwards} successionCandidates={successionCandidates} />
      case 'performance':
        if (!canEdit) return <Dashboard employees={employees} trainingPrograms={trainingPrograms} recognitionAwards={recognitionAwards} successionCandidates={successionCandidates} />

        return (
          <PerformanceModule
            employees={employees}
            canEdit={canEdit}
            addEmployee={addEmployee}
            updateEmployee={updateEmployee}
            deleteEmployee={deleteEmployee}
          />
        )
      case 'competency':
        if (!canEdit) return <Dashboard employees={employees} trainingPrograms={trainingPrograms} recognitionAwards={recognitionAwards} successionCandidates={successionCandidates} />
        return <CompetencyModule competencies={competencies} _canEdit={canEdit} />




      case 'aiCompetency':
        return <AICompetencyModule />
      case 'learning':
        if (!canEdit) return <Dashboard employees={employees} trainingPrograms={trainingPrograms} recognitionAwards={recognitionAwards} successionCandidates={successionCandidates} />
        return <LearningModule trainingPrograms={trainingPrograms} addTraining={addTraining} canEdit={canEdit} />
      case 'succession':
        return <SuccessionModule successionCandidates={successionCandidates} employees={employees} canEdit={canEdit} />

      case 'recognition':
        return <RecognitionModule recognitionAwards={recognitionAwards} employees={employees} addRecognition={addRecognition} canEdit={canEdit} />

      default:
        return <Dashboard employees={employees} trainingPrograms={trainingPrograms} recognitionAwards={recognitionAwards} successionCandidates={successionCandidates} />
    }
  }

  return (
    <div className="app">
      <div className="hospital-header">
        <div className="hospital-logo">
          <span className="logo-icon">+</span>
          <div className="logo-text">
            <span className="hospital-name">AI-Driven HRMS</span>
            <span className="hospital-tagline">Competency Gap Analysis System</span>
          </div>
        </div>
        <div className="header-info">
          <span className="date-display">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
          <span className="status-indicator"><span className="status-dot"></span> System Online</span>
        </div>
      </div>
      <Navbar
        activeModule={activeModule}
        setActiveModule={setActiveModule}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        userName={role === 'admin' ? 'Admin' : 'Viewer'}
        role={role}
      />
      <main className="main-content">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button className="btn-cancel" onClick={onLogout} type="button">
            Logout
          </button>
        </div>
        {renderModule()}
      </main>
    </div>
  )
}

// Navbar Component
function Navbar({ activeModule, setActiveModule, mobileMenuOpen, setMobileMenuOpen, userName, role }) {
  const modules = [
    { id: 'dashboard', label: 'Dashboard', icon: '●', requiresEdit: false },
    { id: 'performance', label: 'Performance', icon: '●', requiresEdit: true },
    { id: 'competency', label: 'Competency', icon: '●', requiresEdit: true },
    { id: 'aiCompetency', label: 'AI Competency', icon: '●', requiresEdit: false },
    { id: 'learning', label: 'Learning & Training', icon: '●', requiresEdit: true },
    { id: 'succession', label: 'Succession', icon: '●', requiresEdit: false },
    { id: 'recognition', label: 'Recognition', icon: '●', requiresEdit: false },
  ]

  // Only show edit-restricted modules to admins.
  const visibleModules = modules.filter(m => !m.requiresEdit || role === 'admin')


  return (
    <nav className="navbar">
      <div className="nav-brand">
        <span className="brand-icon">M</span>
        <span className="brand-text">IHIMS</span>
      </div>
      <button className="menu-toggle" onClick={() => setMobileMenuOpen(!mobileMenuOpen)} aria-label="Toggle menu">
        <span></span>
        <span></span>
        <span></span>
      </button>
      <div className={`nav-links ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        {visibleModules.map(mod => (
          <button
            key={mod.id}
            className={`nav-link ${activeModule === mod.id ? 'active' : ''}`}
            onClick={() => { setActiveModule(mod.id); setMobileMenuOpen(false) }}
          >
            <span className="nav-icon">{mod.icon}</span>
            <span className="nav-label">{mod.label}</span>
          </button>
        ))}
      </div>
      <div className="nav-user">
        <span className="user-avatar">A</span>
        <span className="user-name">{userName}</span>
      </div>
    </nav>
  )
}

// Dashboard Component
function Dashboard({ employees, trainingPrograms, recognitionAwards, successionCandidates }) {
  const avgPerformance = employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.performance, 0) / employees.length) : 0
  const avgCompetency = employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.competency, 0) / employees.length) : 0
  const avgTraining = employees.length > 0 ? Math.round(employees.reduce((sum, e) => sum + e.training, 0) / employees.length) : 0
  const totalRecognitions = recognitionAwards.length

  return (
    <div className="dashboard">
      <h1 className="page-title">AI-Driven Human Resource Management System</h1>
      <p className="page-subtitle">Competency Gap Analysis for Performance and Development</p>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">T</div>
          <div className="stat-content">
            <div className="stat-value">{employees.length}</div>
            <div className="stat-label">Total Employees</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">%</div>
          <div className="stat-content">
            <div className="stat-value">{avgPerformance}%</div>
            <div className="stat-label">Avg Performance</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">T</div>
          <div className="stat-content">
            <div className="stat-value">{avgCompetency}%</div>
            <div className="stat-label">Avg Competency</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">+</div>
          <div className="stat-content">
            <div className="stat-value">{avgTraining}%</div>
            <div className="stat-label">Training Completion</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">*</div>
          <div className="stat-content">
            <div className="stat-value">{totalRecognitions}</div>
            <div className="stat-label">Recognitions This Month</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">L</div>
          <div className="stat-content">
            <div className="stat-value">{successionCandidates.length}</div>
            <div className="stat-label">Succession Plans</div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel">
          <h2 className="panel-title">Top Performers</h2>
          <div className="top-performers">
            {[...employees].sort((a, b) => b.performance - a.performance).slice(0, 5).map((emp, idx) => (
              <div key={emp.id} className="performer-item">
                <span className="performer-rank">#{idx + 1}</span>
                <span className="performer-name">{emp.name}</span>
                <span className="performer-score">{emp.performance}%</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Training Programs</h2>
          <div className="training-list">
            {trainingPrograms.slice(0, 4).map(prog => (
              <div key={prog.id} className="training-item">
                <div className="training-info">
                  <span className="training-title">{prog.title}</span>
                  <span className="training-meta">{prog.type} • {prog.duration}</span>
                </div>
                <span className={`training-status ${prog.status}`}>{prog.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Recent Recognitions</h2>
          <div className="recognition-list">
            {recognitionAwards.slice(0, 3).map(award => (
              <div key={award.id} className="recognition-item">
                <span className="recognition-icon">+</span>
                <div className="recognition-info">
                  <span className="recognition-recipient">{award.recipient}</span>
                  <span className="recognition-type">{award.type}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// Performance Module
function PerformanceModule({ employees, canEdit, addEmployee, updateEmployee, deleteEmployee }) {
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [showEditForm, setShowEditForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('All')
  const [sortBy, setSortBy] = useState('performance')
  const [newEmp, setNewEmp] = useState({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80 })

  // Calculate department stats
  const deptStats = employees.reduce((acc, emp) => {
    if (!acc[emp.department]) {
      acc[emp.department] = { count: 0, totalPerf: 0, totalComp: 0 }
    }
    acc[emp.department].count++
    acc[emp.department].totalPerf += emp.performance
    acc[emp.department].totalComp += emp.competency
    return acc
  }, {})

  const handleAddEmployee = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (newEmp.name && newEmp.role && newEmp.department) {
      addEmployee(newEmp)
      setNewEmp({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80 })
      setShowAddForm(false)
    }
  }


  const handleEditEmployee = () => {
    if (!canEdit) return
    if (selectedEmployee) {
      const emp = employees.find(e => e.id === selectedEmployee)
      if (emp) {
        setNewEmp({ ...emp })
        setShowEditForm(true)
      }
    }
  }


  const handleUpdateEmployee = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (selectedEmployee && newEmp.name) {
      updateEmployee(selectedEmployee, newEmp)
      setShowEditForm(false)
      setSelectedEmployee(null)
      setNewEmp({ name: '', role: '', department: '', performance: 80, competency: 80, training: 80 })
    }
  }


  const handleDeleteEmployee = () => {
    if (!canEdit) return
    if (selectedEmployee && confirm('Are you sure you want to delete this employee?')) {
      deleteEmployee(selectedEmployee)
      setSelectedEmployee(null)
    }
  }


  // Filter and sort employees
  const filteredEmployees = [...employees]
    .filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     emp.role.toLowerCase().includes(searchTerm.toLowerCase()) ||
                     emp.department.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesDept = filterDepartment === 'All' || emp.department === filterDepartment
      return matchesSearch && matchesDept
    })
    .sort((a, b) => {
      if (sortBy === 'performance') return b.performance - a.performance
      if (sortBy === 'name') return a.name.localeCompare(b.name)
      if (sortBy === 'competency') return b.competency - a.competency
      return 0
    })

  const departments = [...new Set(employees.map(e => e.department))]

  return (
    <div className="module" style={canEdit ? undefined : { filter: 'grayscale(0.15)' }}>
      <h1 className="page-title">Performance Management</h1>
      <p className="page-subtitle">Track and evaluate employee performance metrics</p>

      <div className="performance-content">
        <div className="performance-stats">
          <div className="perf-stat">
            <div className="perf-stat-value">{employees.length}</div>
            <div className="perf-stat-label">Total Employees</div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-value">{Math.round(employees.reduce((s, e) => s + e.performance, 0) / employees.length)}%</div>
            <div className="perf-stat-label">Average Performance</div>
            <div className="perf-stat-bar">
              <div className="perf-stat-fill" style={{ width: `${employees.reduce((s, e) => s + e.performance, 0) / employees.length}%` }}></div>
            </div>
          </div>
          <div className="perf-stat">
            <div className="perf-stat-value">{employees.filter(e => e.performance >= 90).length}</div>
            <div className="perf-stat-label">Excellent Performers</div>
          </div>
        </div>

        {/* Department Analytics */}
        <div className="department-analytics">
          <h2 className="panel-title">Department Performance</h2>
          <div className="dept-charts">
            {Object.entries(deptStats).map(([dept, stats]) => (
              <div key={dept} className="dept-chart">
                <div className="dept-name">{dept}</div>
                <div className="dept-bar">
                  <div className="dept-fill" style={{ width: `${stats.totalPerf / stats.count}%` }}></div>
                </div>
                <div className="dept-value">{Math.round(stats.totalPerf / stats.count)}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="form-section">
          <button className="btn-add" onClick={() => canEdit && setShowAddForm(!showAddForm)} disabled={!canEdit}>
            {showAddForm ? 'Cancel' : '+ Add Employee'}
          </button>

          {showAddForm && (
            <form className="data-form" onSubmit={handleAddEmployee}>
              <input type="text" placeholder="Name" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} required />
              <input type="text" placeholder="Role" value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})} required />
              <input type="text" placeholder="Department" value={newEmp.department} onChange={e => setNewEmp({...newEmp, department: e.target.value})} required />
              <input type="number" placeholder="Performance" value={newEmp.performance} onChange={e => setNewEmp({...newEmp, performance: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Competency" value={newEmp.competency} onChange={e => setNewEmp({...newEmp, competency: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Training" value={newEmp.training} onChange={e => setNewEmp({...newEmp, training: parseInt(e.target.value)})} min="0" max="100" />
              <button type="submit" className="btn-save">Save Employee</button>
            </form>
          )}
        </div>

        {/* Search and Filter */}
        <div className="search-filter">
          <input type="text" placeholder="Search employees..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="search-input" />
          <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)}>
            <option value="All">All Departments</option>
            {departments.map(dept => <option key={dept} value={dept}>{dept}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
            <option value="performance">Sort by Performance</option>
            <option value="name">Sort by Name</option>
            <option value="competency">Sort by Competency</option>
          </select>
        </div>

        {/* Edit Form */}
        {showEditForm && (
          <div className="edit-form">
            <h3>Edit Employee</h3>
            <form className="data-form" onSubmit={handleUpdateEmployee}>
              <input type="text" placeholder="Name" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} required />
              <input type="text" placeholder="Role" value={newEmp.role} onChange={e => setNewEmp({...newEmp, role: e.target.value})} required />
              <input type="text" placeholder="Department" value={newEmp.department} onChange={e => setNewEmp({...newEmp, department: e.target.value})} required />
              <input type="number" placeholder="Performance" value={newEmp.performance} onChange={e => setNewEmp({...newEmp, performance: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Competency" value={newEmp.competency} onChange={e => setNewEmp({...newEmp, competency: parseInt(e.target.value)})} min="0" max="100" />
              <input type="number" placeholder="Training" value={newEmp.training} onChange={e => setNewEmp({...newEmp, training: parseInt(e.target.value)})} min="0" max="100" />
              <div className="form-buttons">
                <button type="submit" className="btn-save">Update</button>
                <button type="button" className="btn-cancel" onClick={() => { setShowEditForm(false); setSelectedEmployee(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        <div className="performance-table-panel">
          <h2 className="panel-title">Employee Performance ({filteredEmployees.length})</h2>
          <table className="performance-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Department</th>
                <th>Performance</th>
                <th>Competency</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => (
                <tr key={emp.id} onClick={() => setSelectedEmployee(emp.id)} className={selectedEmployee === emp.id ? 'selected' : ''}>
                  <td>{emp.name}</td>
                  <td>{emp.role}</td>
                  <td>{emp.department}</td>
                  <td>
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${emp.performance}%`, backgroundColor: emp.performance >= 90 ? '#22c55e' : emp.performance >= 80 ? '#3b82f6' : '#f59e0b' }}></div>
                      <span className="score-text">{emp.performance}%</span>
                    </div>
                  </td>
                  <td>
                    <div className="score-bar">
                      <div className="score-fill" style={{ width: `${emp.competency}%`, backgroundColor: '#8b5cf6' }}></div>
                      <span className="score-text">{emp.competency}%</span>
                    </div>
                  </td>
                  <td><span className={`status-badge ${emp.performance >= 90 ? 'excellent' : emp.performance >= 80 ? 'good' : 'needs-improvement'}`}>{emp.performance >= 90 ? 'Excellent' : emp.performance >= 80 ? 'Good' : 'Needs Improvement'}</span></td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn-edit"
                        onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp.id); handleEditEmployee() }}
                        disabled={!canEdit}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-delete"
                        onClick={(e) => { e.stopPropagation(); setSelectedEmployee(emp.id); handleDeleteEmployee() }}
                        disabled={!canEdit}
                      >
                        Delete
                      </button>

                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Competency Module
function CompetencyModule({ competencies, _canEdit }) {
  return (
    <div className="module">
      <h1 className="page-title">Competency Management</h1>
      <p className="page-subtitle">Define and assess core competencies for all roles</p>

      <div className="competency-content">
        <div className="competency-categories">
          <div className="comp-category">
            <h3>Technical Skills</h3>
            <div className="comp-progress">
              <div className="comp-progress-bar">
                <div className="comp-progress-fill" style={{ width: '85%' }}></div>
              </div>
              <span className="comp-progress-text">85%</span>
            </div>
          </div>
          <div className="comp-category">
            <h3>Soft Skills</h3>
            <div className="comp-progress">
              <div className="comp-progress-bar">
                <div className="comp-progress-fill" style={{ width: '78%' }}></div>
              </div>
              <span className="comp-progress-text">78%</span>
            </div>
          </div>
          <div className="comp-category">
            <h3>Leadership</h3>
            <div className="comp-progress">
              <div className="comp-progress-bar">
                <div className="comp-progress-fill" style={{ width: '72%' }}></div>
              </div>
              <span className="comp-progress-text">72%</span>
            </div>
          </div>
          <div className="comp-category">
            <h3>Regulatory Compliance</h3>
            <div className="comp-progress">
              <div className="comp-progress-bar">
                <div className="comp-progress-fill" style={{ width: '92%' }}></div>
              </div>
              <span className="comp-progress-text">92%</span>
            </div>
          </div>
        </div>

        <div className="competency-framework">
          <h2 className="panel-title">Competency Framework</h2>
          <div className="competency-grid">
            {competencies.map(comp => (
              <div key={comp.id} className="competency-card">
                <h3 className="competency-name">{comp.name}</h3>
                <p className="competency-desc">{comp.description}</p>
                <div className="competency-meta">
                  <span className="comp-category-tag">{comp.category}</span>
                  <span className="comp-weight">Weight: {comp.weight}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="competency-assessment">
          <h2 className="panel-title">Competency Assessment by Department</h2>
          <table className="assessment-table">
            <thead>
              <tr>
                <th>Department</th>
                <th>Clinical Skills</th>
                <th>Communication</th>
                <th>Leadership</th>
                <th>Technical</th>
                <th>Compliance</th>
                <th>Overall</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Nursing</td>
                <td>92%</td>
                <td>85%</td>
                <td>78%</td>
                <td>90%</td>
                <td>95%</td>
                <td><strong>88%</strong></td>
              </tr>
              <tr>
                <td>Cardiology</td>
                <td>95%</td>
                <td>88%</td>
                <td>82%</td>
                <td>94%</td>
                <td>98%</td>
                <td><strong>91%</strong></td>
              </tr>
              <tr>
                <td>Emergency</td>
                <td>90%</td>
                <td>82%</td>
                <td>85%</td>
                <td>88%</td>
                <td>92%</td>
                <td><strong>87%</strong></td>
              </tr>
              <tr>
                <td>Administration</td>
                <td>75%</td>
                <td>90%</td>
                <td>88%</td>
                <td>80%</td>
                <td>85%</td>
                <td><strong>84%</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// Learning & Training Module
function LearningModule({ trainingPrograms, addTraining, canEdit }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newProg, setNewProg] = useState({ title: '', type: 'Workshop', duration: '8 hours', participants: 0, status: 'upcoming' })

  const handleAddTraining = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (newProg.title) {
      addTraining(newProg)
      setNewProg({ title: '', type: 'Workshop', duration: '8 hours', participants: 0, status: 'upcoming' })
      setShowAddForm(false)
    }
  }


  return (
    <div className="module">
      <h1 className="page-title">Learning & Training</h1>
      <p className="page-subtitle">Manage training programs and professional development</p>

      <div className="form-section">
        <button className="btn-add" onClick={() => canEdit && setShowAddForm(!showAddForm)} disabled={!canEdit}>
          {showAddForm ? 'Cancel' : '+ Add Training Program'}
        </button>

        {showAddForm && (
          <form className="data-form" onSubmit={handleAddTraining}>
            <input type="text" placeholder="Program Title" value={newProg.title} onChange={e => setNewProg({...newProg, title: e.target.value})} required />
            <select value={newProg.type} onChange={e => setNewProg({...newProg, type: e.target.value})}>
              <option value="Workshop">Workshop</option>
              <option value="Certification">Certification</option>
              <option value="Seminar">Seminar</option>
              <option value="Course">Course</option>
            </select>
            <input type="text" placeholder="Duration" value={newProg.duration} onChange={e => setNewProg({...newProg, duration: e.target.value})} />
            <input type="number" placeholder="Participants" value={newProg.participants} onChange={e => setNewProg({...newProg, participants: parseInt(e.target.value)})} />
            <select value={newProg.status} onChange={e => setNewProg({...newProg, status: e.target.value})}>
              <option value="upcoming">Upcoming</option>
              <option value="ongoing">Ongoing</option>
              <option value="completed">Completed</option>
            </select>
            <button type="submit" className="btn-save">Save Program</button>
          </form>
        )}
      </div>

      <div className="learning-stats">
        <div className="learning-stat">
          <span className="learning-stat-icon">P</span>
          <div className="learning-stat-content">
            <span className="learning-stat-value">{trainingPrograms.length}</span>
            <span className="learning-stat-label">Active Programs</span>
          </div>
        </div>
        <div className="learning-stat">
          <span className="learning-stat-icon">T</span>
          <div className="learning-stat-content">
            <span className="learning-stat-value">398</span>
            <span className="learning-stat-label">Total Participants</span>
          </div>
        </div>
        <div className="learning-stat">
          <span className="learning-stat-icon">✓</span>
          <div className="learning-stat-content">
            <span className="learning-stat-value">156</span>
            <span className="learning-stat-label">Certifications Earned</span>
          </div>
        </div>
        <div className="learning-stat">
          <span className="learning-stat-icon">H</span>
          <div className="learning-stat-content">
            <span className="learning-stat-value">1,240</span>
            <span className="learning-stat-label">Training Hours</span>
          </div>
        </div>
      </div>

      <div className="training-programs">
        <h2 className="panel-title">Training Programs</h2>
        <div className="programs-grid">
          {trainingPrograms.map(prog => (
            <div key={prog.id} className="program-card">
              <div className="program-header">
                <span className={`program-status ${prog.status}`}>{prog.status}</span>
                <span className="program-type">{prog.type}</span>
              </div>
              <h3 className="program-title">{prog.title}</h3>
              <div className="program-meta">
                <span>📅 {prog.duration}</span>
                <span>T {prog.participants} participants</span>
              </div>
              <div className="program-progress">
                <div className="program-progress-bar">
                  <div className="program-progress-fill" style={{ width: prog.status === 'completed' ? '100%' : prog.status === 'ongoing' ? '65%' : '0%' }}></div>
                </div>
                <span className="program-progress-text">{prog.status === 'completed' ? '100%' : prog.status === 'ongoing' ? '65%' : '0%'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="upcoming-training">
        <h2 className="panel-title">Upcoming Sessions</h2>
        <table className="sessions-table">
          <thead>
            <tr>
              <th>Program</th>
              <th>Date</th>
              <th>Time</th>
              <th>Location</th>
              <th>Seats Available</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Emergency Response Training</td>
              <td>July 5, 2026</td>
              <td>9:00 AM - 4:00 PM</td>
              <td>Training Room A</td>
              <td>15 / 20</td>
              <td><button className="btn-register">Register</button></td>
            </tr>
            <tr>
              <td>Advanced Cardiac Life Support</td>
              <td>July 8-9, 2026</td>
              <td>8:00 AM - 5:00 PM</td>
              <td>Conference Hall</td>
              <td>8 / 15</td>
              <td><button className="btn-register">Register</button></td>
            </tr>
            <tr>
              <td>Patient Safety Protocols</td>
              <td>July 12, 2026</td>
              <td>2:00 PM - 5:00 PM</td>
              <td>Training Room B</td>
              <td>22 / 30</td>
              <td><button className="btn-register">Register</button></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Succession Module
function SuccessionModule({ successionCandidates, _employees, canEdit }) {
  return (
    <div className="module" style={canEdit ? undefined : { opacity: 0.95 }}>
      <h1 className="page-title">Succession Planning</h1>
      <p className="page-subtitle">Identify and develop future leaders for key positions</p>


      <div className="succession-overview">
        <div className="succession-stat">
          <span className="succession-stat-value">{successionCandidates.length}</span>
          <span className="succession-stat-label">Key Positions Covered</span>
        </div>
        <div className="succession-stat">
          <span className="succession-stat-value">3</span>
          <span className="succession-stat-label">High Readiness Candidates</span>
        </div>
        <div className="succession-stat">
          <span className="succession-stat-value">2</span>
          <span className="succession-stat-label">Medium Readiness Candidates</span>
        </div>
      </div>

      <div className="succession-plans">
        <h2 className="panel-title">Succession Plans</h2>
        <div className="plans-grid">
          {successionCandidates.map(plan => (
            <div key={plan.id} className="succession-card">
              <div className="succession-role">
                <h3>{plan.currentRole}</h3>
                <span className="timeline">Timeline: {plan.timeline}</span>
              </div>
              <div className="succession-candidates">
                <h4>Potential Successors</h4>
                {plan.candidates.map((candidate, idx) => (
                  <div key={idx} className="candidate-item">
                    <span className="candidate-avatar">+</span>
                    <span className="candidate-name">{candidate}</span>
                    <span className={`readiness ${plan.readiness.toLowerCase()}`}>{plan.readiness}</span>
                  </div>
                ))}
              </div>
              <div className="succession-actions">
                <button className="btn-view">View Profile</button>
                <button className="btn-development">Development Plan</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="talent-pool">
        <h2 className="panel-title">Talent Pool</h2>
        <table className="talent-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Current Role</th>
              <th>Department</th>
              <th>Readiness Level</th>
              <th>Potential Roles</th>
              <th>Development Needs</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Dr. Michael Chen</td>
              <td>Cardiologist</td>
              <td>Cardiology</td>
              <td><span className="readiness-high">High</span></td>
              <td>Chief Medical Officer</td>
              <td>Executive Leadership</td>
            </tr>
            <tr>
              <td>James Wilson</td>
              <td>Senior Nurse</td>
              <td>Nursing</td>
              <td><span className="readiness-high">High</span></td>
              <td>Head of Nursing</td>
              <td>Budget Management</td>
            </tr>
            <tr>
              <td>Dr. Lisa Anderson</td>
              <td>Pediatrician</td>
              <td>Pediatrics</td>
              <td><span className="readiness-high">High</span></td>
              <td>Chief Medical Officer</td>
              <td>Strategic Planning</td>
            </tr>
            <tr>
              <td>Emily Brown</td>
              <td>Lab Technician</td>
              <td>Laboratory</td>
              <td><span className="readiness-medium">Medium</span></td>
              <td>Laboratory Director</td>
              <td>Advanced Management</td>
            </tr>
            <tr>
              <td>David Martinez</td>
              <td>Administrator</td>
              <td>Administration</td>
              <td><span className="readiness-medium">Medium</span></td>
              <td>HR Manager</td>
              <td>Conflict Resolution</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Social Recognition Module
function RecognitionModule({ recognitionAwards, _employees, addRecognition, canEdit }) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [newAward, setNewAward] = useState({ recipient: '', type: 'Employee of Month', department: '', date: new Date().toISOString().split('T')[0], reason: '' })

  const handleAddRecognition = (e) => {
    e.preventDefault()
    if (!canEdit) return
    if (newAward.recipient && newAward.reason) {
      addRecognition(newAward)
      setNewAward({ recipient: '', type: 'Employee of Month', department: '', date: new Date().toISOString().split('T')[0], reason: '' })
      setShowAddForm(false)
    }
  }


  return (
    <div className="module">
      <h1 className="page-title">Social Recognition</h1>
      <p className="page-subtitle">Acknowledge and celebrate employee achievements</p>

      <div className="form-section">
        <button className="btn-add" onClick={() => canEdit && setShowAddForm(!showAddForm)} disabled={!canEdit}>
          {showAddForm ? 'Cancel' : '+ Add Recognition'}
        </button>

        {showAddForm && (
          <form className="data-form" onSubmit={handleAddRecognition}>
            <input type="text" placeholder="Recipient Name" value={newAward.recipient} onChange={e => setNewAward({...newAward, recipient: e.target.value})} required />
            <select value={newAward.type} onChange={e => setNewAward({...newAward, type: e.target.value})}>
              <option value="Employee of Month">Employee of Month</option>
              <option value="Excellence in Care">Excellence in Care</option>
              <option value="Innovation Award">Innovation Award</option>
              <option value="Research Excellence">Research Excellence</option>
            </select>
            <input type="text" placeholder="Department" value={newAward.department} onChange={e => setNewAward({...newAward, department: e.target.value})} />
            <input type="date" value={newAward.date} onChange={e => setNewAward({...newAward, date: e.target.value})} />
            <input type="text" placeholder="Reason for recognition" value={newAward.reason} onChange={e => setNewAward({...newAward, reason: e.target.value})} required />
            <button type="submit" className="btn-save">Save Recognition</button>
          </form>
        )}
      </div>

      <div className="recognition-stats">
        <div className="rec-stat">
          <span className="rec-stat-icon">R</span>
          <span className="rec-stat-value">{recognitionAwards.length}</span>
          <span className="rec-stat-label">Awards This Month</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-icon">A</span>
          <span className="rec-stat-value">234</span>
          <span className="rec-stat-label">Peer Recognitions</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-icon">S</span>
          <span className="rec-stat-value">89</span>
          <span className="rec-stat-label">Active recognitions</span>
        </div>
        <div className="rec-stat">
          <span className="rec-stat-icon">C</span>
          <span className="rec-stat-value">567</span>
          <span className="rec-stat-label">Total Comments</span>
        </div>
      </div>

      <div className="recognition-wall">
        <h2 className="panel-title">Recognition Wall</h2>
        <div className="recognition-cards">
          {recognitionAwards.map(award => (
            <div key={award.id} className="recognition-card">
              <div className="recognition-card-header">
                <span className="recognition-badge">{award.type.includes('Employee') ? 'S' : award.type.includes('Excellence') ? 'H' : award.type.includes('Innovation') ? 'I' : 'R'}</span>
                <span className="recognition-date">{award.date}</span>
              </div>
              <div className="recognition-card-body">
                <h3 className="recipient-name">{award.recipient}</h3>
                <p className="recognition-reason">"{award.reason}"</p>
                <span className="recognition-dept">{award.department}</span>
              </div>
              <div className="recognition-card-footer">
                <span className="recognition-reaction">👍 24</span>
                <span className="recognition-comment">C 8</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="award-categories">
        <h2 className="panel-title">Award Categories</h2>
        <div className="award-grid">
          <div className="award-category">
            <span className="award-icon">S</span>
            <h3>Employee of the Month</h3>
            <p>Outstanding overall performance and commitment</p>
            <span className="award-count">12 awarded this year</span>
          </div>
          <div className="award-category">
            <span className="award-icon">H</span>
            <h3>Excellence in Care</h3>
            <p>Exceptional patient care and compassion</p>
            <span className="award-count">8 awarded this year</span>
          </div>
          <div className="award-category">
            <span className="award-icon">I</span>
            <h3>Innovation Award</h3>
            <p>Creative solutions and process improvements</p>
            <span className="award-count">5 awarded this year</span>
          </div>
          <div className="award-category">
            <span className="award-icon">R</span>
            <h3>Research Excellence</h3>
            <p>Medical research and clinical discoveries</p>
            <span className="award-count">3 awarded this year</span>
          </div>
        </div>
      </div>

      <div className="peer-recognition">
        <h2 className="panel-title">Peer Recognitions</h2>
        <div className="peer-recognition-feed">
          <div className="peer-recognition-item">
            <span className="peer-avatar">U</span>
            <div className="peer-content">
              <span className="peer-from">Maria Garcia recognized James Wilson</span>
              <p className="peer-message">"Great work on the new patient intake process!"</p>
              <span className="peer-time">2 hours ago</span>
            </div>
          </div>
          <div className="peer-recognition-item">
            <span className="peer-avatar">U</span>
            <div className="peer-content">
              <span className="peer-from">Dr. Sarah Johnson recognized Emily Brown</span>
              <p className="peer-message">"Thank you for your attention to detail in the lab results!"</p>
              <span className="peer-time">5 hours ago</span>
            </div>
          </div>
          <div className="peer-recognition-item">
            <span className="peer-avatar">U</span>
            <div className="peer-content">
              <span className="peer-from">Robert Taylor recognized Dr. Lisa Anderson</span>
              <p className="peer-message">"Wonderful bedside manner with the pediatric patients!"</p>
              <span className="peer-time">1 day ago</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// AI Competency Module
function AICompetencyModule() {
  const aiCompetencies = [
    { id: 1, name: 'AI-Powered Diagnostics', level: 'Advanced', staff: 12, score: 87, trend: 'up' },
    { id: 2, name: 'Machine Learning', level: 'Intermediate', staff: 8, score: 72, trend: 'up' },
    { id: 3, name: 'Healthcare Analytics', level: 'Basic', staff: 15, score: 65, trend: 'stable' },
    { id: 4, name: 'Predictive Modeling', level: 'Advanced', staff: 6, score: 91, trend: 'up' },
    { id: 5, name: 'NLP for Records', level: 'Intermediate', staff: 10, score: 78, trend: 'up' },
    { id: 6, name: 'AI Ethics & Governance', level: 'Basic', staff: 18, score: 58, trend: 'up' },
  ]

  const aiInsights = [
    { id: 1, title: 'Diagnostic Accuracy Improvement', metric: '+12%', description: 'AI-assisted diagnoses show 12% improvement in accuracy rates', impact: 'High' },
    { id: 2, title: 'Patient Outcome Prediction', metric: '94%', description: 'ML models predict patient outcomes with 94% accuracy', impact: 'High' },
    { id: 3, title: 'Workflow Automation', metric: '32hrs', description: 'Weekly hours saved through AI automation', impact: 'Medium' },
  ]

  const staffAILevels = [
    { id: 1, name: 'Dr. Sarah Johnson', aiScore: 95, certifications: 4, projects: 3, status: 'Expert' },
    { id: 2, name: 'Dr. Michael Chen', aiScore: 92, certifications: 3, projects: 5, status: 'Expert' },
    { id: 3, name: 'Emily Brown', aiScore: 88, certifications: 3, projects: 2, status: 'Advanced' },
    { id: 4, name: 'James Wilson', aiScore: 76, certifications: 2, projects: 1, status: 'Intermediate' },
    { id: 5, name: 'Maria Garcia', aiScore: 84, certifications: 2, projects: 2, status: 'Advanced' },
    { id: 6, name: 'Dr. Lisa Anderson', aiScore: 79, certifications: 2, projects: 1, status: 'Intermediate' },
  ]

  return (
    <div className="module">
      <h1 className="page-title">AI-Driven Competency Gap Analysis</h1>
      <p className="page-subtitle">Artificial intelligence skills assessment and development</p>

      <div className="ai-header-stats">
        <div className="ai-stat-card">
          <div className="ai-stat-icon">G</div>
          <div className="ai-stat-content">
            <div className="ai-stat-value">78%</div>
            <div className="ai-stat-label">Avg Competency Score</div>
          </div>
        </div>
        <div className="ai-stat-card">
          <div className="ai-stat-icon">C</div>
          <div className="ai-stat-content">
            <div className="ai-stat-value">23</div>
            <div className="ai-stat-label">AI Certifications</div>
          </div>
        </div>
        <div className="ai-stat-card">
          <div className="ai-stat-icon">P</div>
          <div className="ai-stat-content">
            <div className="ai-stat-value">14</div>
            <div className="ai-stat-label">AI Projects</div>
          </div>
        </div>
        <div className="ai-stat-card accent">
          <div className="ai-stat-icon">I</div>
          <div className="ai-stat-content">
            <div className="ai-stat-value">+12%</div>
            <div className="ai-stat-label">YoY Improvement</div>
          </div>
        </div>
      </div>

      <div className="ai-grid">
        <div className="ai-panel">
          <div className="ai-panel-header">
            <h2 className="ai-panel-title">AI Competency Areas</h2>
            <span className="ai-badge">AI Powered</span>
          </div>
          <div className="ai-competency-list">
            {aiCompetencies.map(comp => (
              <div key={comp.id} className="ai-competency-item">
                <div className="ai-comp-main">
                  <span className="ai-comp-name">{comp.name}</span>
                  <span className="ai-comp-level">{comp.level}</span>
                </div>
                <div className="ai-comp-metrics">
                  <div className="ai-comp-score">
                    <div className="ai-comp-bar">
                      <div className="ai-comp-fill" style={{ width: `${comp.score}%` }}></div>
                    </div>
                    <span className="ai-comp-value">{comp.score}%</span>
                  </div>
                  <span className={`ai-trend ${comp.trend}`}>
                    {comp.trend === 'up' ? '↑' : '→'} {comp.staff} staff
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="ai-panel">
          <div className="ai-panel-header">
            <h2 className="ai-panel-title">AI Impact Insights</h2>
            <span className="ai-badge insight">Insights</span>
          </div>
          <div className="ai-insights">
            {aiInsights.map(insight => (
              <div key={insight.id} className="ai-insight-card">
                <div className="ai-insight-metric">{insight.metric}</div>
                <div className="ai-insight-title">{insight.title}</div>
                <div className="ai-insight-desc">{insight.description}</div>
                <span className={`ai-impact ${insight.impact.toLowerCase()}`}>{insight.impact} Impact</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="ai-staff-panel">
        <h2 className="ai-panel-title">Staff AI Proficiency</h2>
        <table className="ai-staff-table">
          <thead>
            <tr>
              <th>Staff Member</th>
              <th>AI Score</th>
              <th>Certifications</th>
              <th>AI Projects</th>
              <th>Proficiency Level</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {staffAILevels.map(staff => (
              <tr key={staff.id}>
                <td className="ai-staff-name">{staff.name}</td>
                <td>
                  <div className="ai-score-cell">
                    <div className="ai-score-bar">
                      <div className="ai-score-fill" style={{ width: `${staff.aiScore}%` }}></div>
                    </div>
                    <span>{staff.aiScore}%</span>
                  </div>
                </td>
                <td>{staff.certifications}</td>
                <td>{staff.projects}</td>
                <td><span className={`ai-status ${staff.status.toLowerCase()}`}>{staff.status}</span></td>
                <td><button className="ai-btn-view">View</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="ai-recommendations">
        <h2 className="ai-panel-title">AI Learning Recommendations</h2>
        <div className="ai-rec-grid">
          <div className="ai-rec-card">
            <span className="ai-rec-icon">L</span>
            <h3>AI Fundamentals for Healthcare</h3>
            <p>Build foundational AI knowledge for medical applications</p>
            <span className="ai-rec-duration">12 hours • Beginner</span>
          </div>
          <div className="ai-rec-card">
            <span className="ai-rec-icon">◎</span>
            <h3>ML for Diagnostic Imaging</h3>
            <p>Learn machine learning for X-ray and MRI analysis</p>
            <span className="ai-rec-duration">24 hours • Advanced</span>
          </div>
          <div className="ai-rec-card">
            <span className="ai-rec-icon">M</span>
            <h3>Predictive Analytics</h3>
            <p>Patient outcome prediction using historical data</p>
            <span className="ai-rec-duration">16 hours • Intermediate</span>
          </div>
          <div className="ai-rec-card">
            <span className="ai-rec-icon">P</span>
            <h3>AI Ethics in Healthcare</h3>
            <p>Responsible AI implementation guidelines</p>
            <span className="ai-rec-duration">8 hours • All Levels</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Session helpers
const getStoredSession = () => {
  try {
    const raw = localStorage.getItem('ihims_session')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

const setStoredSession = (session) => {
  localStorage.setItem('ihims_session', JSON.stringify(session))
}

const clearStoredSession = () => {
  localStorage.removeItem('ihims_session')
}

function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  // Simple local-only demo credentials.
  // - admin / admin123
  // - viewer / viewer123
  const handleSubmit = (e) => {
    e.preventDefault()
    const u = username.trim().toLowerCase()
    const p = password

    if (u === 'admin' && p === 'admin123') {
      onLogin({ role: 'admin', name: 'Admin' })
      return
    }
    if (u === 'viewer' && p === 'viewer123') {
      onLogin({ role: 'viewer', name: 'Viewer' })
      return
    }

    setError('Invalid username or password')
  }

  return (
    <div className="module" style={{ maxWidth: 520, margin: '40px auto', padding: 24 }}>
      <h1 className="page-title">IHIMS Login</h1>
      <p className="page-subtitle" style={{ marginBottom: 16 }}>Admin can manage data. Viewer is read-only.</p>

      <form onSubmit={handleSubmit} className="data-form" style={{ marginTop: 0 }}>
        <input
          type="text"
          placeholder="Username (admin or viewer)"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password (admin123 or viewer123)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn-save">Login</button>
          {error ? <span style={{ color: '#dc2626', fontWeight: 600 }}>{error}</span> : null}
        </div>
      </form>
    </div>
  )
}

// Main App Component
function App() {
  const [session, setSession] = useState(() => getStoredSession())

  const handleLogin = (s) => {
    setStoredSession({ ...s })
    setSession(s)
  }

  const handleLogout = () => {
    clearStoredSession()
    setSession(null)
  }

  // Wrap AppContent with a role-aware controller.
  // Viewer must not be able to create/update/delete data.
  const role = session?.role || 'viewer'
  const canEdit = role === 'admin'

  return (
    <div>
      {!session ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <AppContent
          role={role}
          canEdit={canEdit}
          onLogout={handleLogout}
          setActiveModuleFromRole={(id) => id}
        />
      )}
    </div>
  )
}

export default App
