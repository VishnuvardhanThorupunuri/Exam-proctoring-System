import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL as API } from '../config';
import './AdminDashboard.css';

function StatCard({ icon, label, value, gradient, delay }) {
  return (
    <div className={`admin-stat-card fade-in-up delay-${delay}`} style={{ '--grad': gradient }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-body">
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

export default function AdminDashboard({ token, user, onLogout }) {
  const [exams, setExams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [tab, setTab] = useState('exams'); // exams | overview | users | violations
  const [expandedUser, setExpandedUser] = useState(null);

  // Violation Audit Log state
  const [auditViolations, setAuditViolations] = useState([]);
  const [loadingViolations, setLoadingViolations] = useState(false);
  const [violationTypeFilter, setViolationTypeFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [riskLevelFilter, setRiskLevelFilter] = useState('');
  const [violationSearch, setViolationSearch] = useState('');
  const [selectedSessionDrawer, setSelectedSessionDrawer] = useState(null);
  const [evidenceViewerModal, setEvidenceViewerModal] = useState(null);
  const [confirmReattemptModal, setConfirmReattemptModal] = useState(null);
  const [deleteUserModal, setDeleteUserModal] = useState(null);

  const navigate = useNavigate();

  const handleDeleteUser = async (userId, isPermanent = false) => {
    try {
      const url = `${API}/api/users/${userId}/delete${isPermanent ? '?permanent=true' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permanent: !!isPermanent }),
      });
      if (res.ok) {
        fetchUsers();
        setDeleteUserModal(null);
      } else {
        const err = await res.json();
        alert('Failed to delete user: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
      alert('Error deleting user');
    }
  };

  const handleRestoreUser = async (userId) => {
    try {
      const res = await fetch(`${API}/api/users/${userId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        fetchUsers();
      } else {
        const err = await res.json();
        alert('Failed to restore user: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
      alert('Error restoring user');
    }
  };

  const handleAllowReattempt = async (attemptId) => {
    try {
      const res = await fetch(`${API}/api/attempts/${attemptId}/allow-reattempt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        fetchUsers();
        fetchAdminViolations();
        setConfirmReattemptModal(null);
        setSelectedSessionDrawer(null);
      } else {
        const err = await res.json();
        alert('Failed to allow reattempt: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
      alert('Error allowing reattempt');
    }
  };

  const fetchAdminViolations = async () => {
    setLoadingViolations(true);
    try {
      const params = new URLSearchParams();
      if (violationTypeFilter) params.append('violationType', violationTypeFilter);
      if (severityFilter) params.append('severity', severityFilter);
      if (riskLevelFilter) params.append('riskLevel', riskLevelFilter);

      const res = await fetch(`${API}/api/attempts/admin/violations?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch audit violations');
      const data = await res.json();
      setAuditViolations(data.violations || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingViolations(false);
    }
  };

  useEffect(() => {
    if (tab === 'violations') {
      fetchAdminViolations();
    }
  }, [tab, violationTypeFilter, severityFilter, riskLevelFilter, token]);

  useEffect(() => {
    fetchExams();
    fetchUsers();
  }, [token]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchExams = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/exams`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch exams');
      const data = await res.json();
      setExams(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteExam = async (id) => {
    try {
      const res = await fetch(`${API}/api/exams/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      // Optimistic remove regardless (server may not have DELETE — falls back gracefully)
      setExams(prev => prev.filter(e => (e._id || e.id) !== id));
      setDeleteId(null);
    } catch (e) {
      console.error(e);
      setExams(prev => prev.filter(e => (e._id || e.id) !== id));
      setDeleteId(null);
    }
  };

  const filtered = exams.filter(ex =>
    ex.title.toLowerCase().includes(search.toLowerCase())
  );

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const stats = [
    { icon: '📋', label: 'Total Exams',    value: exams.length,    gradient: 'var(--grad-primary)',  delay: 1 },
    { icon: '✅', label: 'Active Exams',   value: exams.filter(e => e.isActive !== false).length, gradient: 'var(--grad-success)', delay: 2 },
    { icon: '❓', label: 'Total Questions',value: exams.reduce((acc, e) => acc + (e.questions?.length || 0), 0), gradient: 'var(--grad-secondary)', delay: 3 },
    { icon: '⏱️', label: 'Avg Duration',   value: exams.length ? `${Math.round(exams.reduce((a,e) => a+(e.durationMinutes||0),0)/exams.length)}m` : '—', gradient: 'var(--grad-warning)', delay: 4 },
  ];

  return (
    <div className="admin-root bg-mesh">
      {/* Sidebar */}
      <aside className="admin-sidebar glass-panel">
        <div className="sidebar-brand">
          <span className="sidebar-logo floating">🛡️</span>
          <span className="sidebar-name gradient-text">Aegis</span>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`sidebar-item ${tab === 'overview' ? 'active' : ''}`}
            onClick={() => setTab('overview')}
          >
            <span>📊</span> Overview
          </button>
          <button
            className={`sidebar-item ${tab === 'exams' ? 'active' : ''}`}
            onClick={() => setTab('exams')}
          >
            <span>📋</span> Exams
          </button>
          <button
            className={`sidebar-item ${tab === 'users' ? 'active' : ''}`}
            onClick={() => setTab('users')}
          >
            <span>👤</span> Users
          </button>
          <button
            className={`sidebar-item ${tab === 'violations' ? 'active' : ''}`}
            onClick={() => setTab('violations')}
          >
            <span>🚨</span> Violation Audit
          </button>
          <button
            className="sidebar-item"
            onClick={() => navigate('/admin/create-exam')}
          >
            <span>➕</span> Create Exam
          </button>
          <button
            className="sidebar-item"
            onClick={() => navigate('/proctor/dashboard')}
          >
            <span>👁️</span> Proctor View
          </button>
        </nav>
        <div className="sidebar-user">
          <div className="sidebar-avatar">{user?.firstName?.[0]}{user?.lastName?.[0]}</div>
          <div className="sidebar-userinfo">
            <div className="sidebar-username">{user?.firstName} {user?.lastName}</div>
            <div className="sidebar-role badge badge-primary">Admin</div>
          </div>
          {onLogout && (
            <button className="sidebar-logout" onClick={onLogout} title="Logout">↩️</button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="admin-main">
        {/* Top bar */}
        <header className="admin-topbar glass-panel">
          <div>
            <h1 className="admin-page-title">
              {tab === 'overview' ? '📊 System Overview' : tab === 'users' ? '👤 Candidate Auditing' : '📋 Exam Management'}
            </h1>
            <p className="admin-page-sub">
              {new Date().toLocaleDateString('en-US', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
            </p>
          </div>
          <div className="topbar-actions">
            <button className="btn btn-primary" onClick={() => navigate('/admin/create-exam')} id="create-exam-btn">
              ➕ New Exam
            </button>
            <button className="btn btn-secondary" onClick={fetchExams} id="refresh-btn">🔄 Refresh</button>
          </div>
        </header>

        {/* Content */}
        <div className="admin-content">
          {/* Stat cards */}
          <div className="admin-stats-grid">
            {stats.map((s, i) => (
              <StatCard key={i} {...s} />
            ))}
          </div>

          {/* Error */}
          {error && (
            <div className="alert alert-error fade-in">
              <span>⚠️</span> {error}
              <button className="btn btn-sm btn-secondary" style={{marginLeft:'auto'}} onClick={fetchExams}>Retry</button>
            </div>
          )}

          {tab !== 'users' ? (
            <div className="admin-card glass-panel fade-in-up delay-2">
              <div className="card-header">
                <h2 className="card-title">📋 Exam Catalog</h2>
                <div className="card-actions">
                  <div className="search-wrap">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      className="form-input search-input"
                      placeholder="Search exams…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      id="exam-search"
                    />
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="table-loading">
                  {[1,2,3].map(i => (
                    <div key={i} className="skeleton" style={{height:'52px', marginBottom:'0.5rem', borderRadius:'8px'}} />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📭</div>
                  <h3>No Exams Found</h3>
                  <p>{search ? 'Try a different search term.' : 'Create your first exam to get started.'}</p>
                  {!search && (
                    <button className="btn btn-primary" onClick={() => navigate('/admin/create-exam')}>
                      ➕ Create Exam
                    </button>
                  )}
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Exam Title</th>
                        <th>Duration</th>
                        <th>Questions</th>
                        <th>Max Warnings</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((exam, i) => (
                        <tr key={exam.id} className="table-row fade-in">
                          <td className="row-num">{i + 1}</td>
                          <td>
                            <div className="exam-title-cell">
                              <div className="exam-icon">📝</div>
                              <div>
                                <div className="exam-name">{exam.title}</div>
                                <div className="exam-desc">{exam.description?.slice(0, 60) || 'No description'}{exam.description?.length > 60 ? '…' : ''}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="badge badge-info">⏱ {exam.durationMinutes}m</span>
                          </td>
                          <td>
                            <span className="badge badge-primary">❓ {exam.questions?.length || 0}</span>
                          </td>
                          <td>
                            <span className="badge badge-warning">⚠ {exam.maxWarningsAllowed ?? 3}</span>
                          </td>
                          <td>
                            <span className={`badge ${exam.isActive !== false ? 'badge-success' : 'badge-danger'}`}>
                              <span className={`status-dot ${exam.isActive !== false ? 'active' : 'danger'}`} />
                              {exam.isActive !== false ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="btn btn-sm btn-secondary"
                                onClick={() => navigate(`/proctor/dashboard`)}
                                title="View Attempts"
                              >
                                👁️
                              </button>
                              <button
                                className="btn btn-sm btn-primary"
                                onClick={() => navigate(`/admin/edit-exam/${exam._id || exam.id}`)}
                                title="Edit Exam"
                              >
                                ✏️
                              </button>
                              <button
                                className="btn btn-sm btn-danger"
                                onClick={() => setDeleteId(exam._id || exam.id)}
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="admin-card glass-panel fade-in-up delay-2">
              <div className="card-header">
                <h2 className="card-title">👤 Candidate Accounts & Attempts</h2>
                <div className="card-actions">
                  <div className="search-wrap">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      className="form-input search-input"
                      placeholder="Search candidates…"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      id="user-search"
                    />
                  </div>
                </div>
              </div>

              {loadingUsers ? (
                <div className="table-loading">
                  {[1,2,3].map(i => (
                    <div key={i} className="skeleton" style={{height:'60px', marginBottom:'0.5rem', borderRadius:'8px'}} />
                  ))}
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">👥</div>
                  <h3>No Candidates Found</h3>
                  <p>No student accounts match your filter criteria.</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Role</th>
                        <th>Attempts Count</th>
                        <th>Termination Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.map((u) => {
                        const hasTerminated = u.attempts?.some(a => a.isTerminated);
                        const completedAttempts = u.attempts?.filter(a => a.status === 'SUBMITTED') || [];
                        const terminatedAttempts = u.attempts?.filter(a => a.status === 'TERMINATED') || [];

                        return (
                          <React.Fragment key={u.id}>
                            <tr 
                              className={`table-row fade-in candidate-row ${expandedUser === u.id ? 'active-row' : ''}`} 
                              onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td>
                                <div className="exam-title-cell">
                                  <div className="avatar-circle">
                                    {u.firstName?.[0]}{u.lastName?.[0]}
                                  </div>
                                  <div>
                                    <div className="exam-name">{u.firstName} {u.lastName}</div>
                                    <div className="exam-desc">{u.email}</div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <span className={`badge ${u.role === 'ADMIN' ? 'badge-primary' : u.role === 'PROCTOR' ? 'badge-secondary' : 'badge-info'}`}>
                                  {u.role}
                                </span>
                              </td>
                              <td>
                                <div className="attempts-summary-badges">
                                  <span className="badge badge-secondary" title="Total Attempts">📋 {u.attempts?.length || 0}</span>
                                  {completedAttempts.length > 0 && <span className="badge badge-success" title="Submitted">✅ {completedAttempts.length}</span>}
                                  {terminatedAttempts.length > 0 && <span className="badge badge-danger" title="Terminated">🛑 {terminatedAttempts.length}</span>}
                                </div>
                              </td>
                              <td>
                                {u.isDeleted ? (
                                  <span className="badge badge-danger" title="Account Deactivated">
                                    <span className="status-dot danger" /> Account Deactivated
                                  </span>
                                ) : hasTerminated ? (
                                  <span className="badge badge-danger">
                                    <span className="status-dot danger" /> Terminated
                                  </span>
                                ) : terminatedAttempts.length > 0 ? (
                                  <span className="badge badge-danger">
                                    <span className="status-dot danger" /> Terminated
                                  </span>
                                ) : u.attempts?.length > 0 ? (
                                  <span className="badge badge-success">
                                    <span className="status-dot active" /> In Good Standing
                                  </span>
                                ) : (
                                  <span className="badge badge-info">No attempts yet</span>
                                )}
                              </td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                  <button className="btn btn-sm btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    {expandedUser === u.id ? '🔼 Hide' : '👁️ Audit'}
                                  </button>
                                  {u.isDeleted ? (
                                    <button
                                      className="btn btn-sm btn-success"
                                      title="Restore this user account"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRestoreUser(u.id || u._id);
                                      }}
                                    >
                                      ↩️ Restore
                                    </button>
                                  ) : (
                                    (u.id || u._id) !== user?.id && (
                                      <button
                                        className="btn btn-sm btn-danger"
                                        title="Deactivate / Delete this user"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setDeleteUserModal(u);
                                        }}
                                      >
                                        🗑️ Delete
                                      </button>
                                    )
                                  )}
                                </div>
                              </td>
                            </tr>
                            
                            {expandedUser === u.id && (
                              <tr>
                                <td colSpan="5" className="expanded-row-cell" style={{ padding: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
                                  <div className="expanded-detail-box fade-in-up">
                                    <h4 className="detail-box-title" style={{ color: 'var(--text-primary)', marginBottom: '1.25rem', fontSize: '1.05rem', fontWeight: 600 }}>
                                      📊 Proctored Attempts & Violation History
                                    </h4>
                                    {u.attempts && u.attempts.length > 0 ? (
                                      <div className="attempts-history-list" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                        {u.attempts.map((att) => (
                                          <div key={att.id} className="attempt-detail-card glass-panel" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '10px' }}>
                                            <div className="attempt-card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                                              <div className="attempt-exam-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                                <span style={{ fontSize: '1.5rem' }}>📝</span>
                                                <div>
                                                  <h5 className="attempt-exam-name" style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{att.examName}</h5>
                                                  <span className="attempt-date" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Started: {new Date(att.startedAt).toLocaleString()}</span>
                                                </div>
                                              </div>
                                              <div className="attempt-status-badges" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                                <span className={`badge ${att.status === 'TERMINATED' ? 'badge-danger' : att.status === 'SUBMITTED' ? 'badge-success' : 'badge-info'}`}>
                                                  {att.status}
                                                </span>
                                                <span className={`badge ${att.integrityScore < 50 ? 'badge-danger' : att.integrityScore < 85 ? 'badge-warning' : 'badge-success'}`}>
                                                  {att.integrityScore}% Integrity
                                                </span>
                                                {att.integrityScore < 100 && (
                                                  <button
                                                    className="btn btn-sm btn-success"
                                                    title="Reset integrity score to 100% based on candidate behavior audit"
                                                    onClick={() => {
                                                      fetch(`${API}/api/attempts/${att.id}/reset-integrity`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                        body: JSON.stringify({ targetScore: 100, proctorNotes: 'Integrity score restored to 100% by admin after behavior review.' }),
                                                      }).then(res => {
                                                        if (res.ok) fetchUsers();
                                                        else alert('Failed to reset integrity score');
                                                      }).catch(console.error);
                                                    }}
                                                  >
                                                    💯 Restore 100%
                                                  </button>
                                                )}
                                                {(att.status === 'IN_PROGRESS' || att.status === 'SUBMITTED') && (
                                                  <button className="btn btn-sm btn-danger" onClick={() => {
                                                    fetch(`${API}/api/attempts/${att.id}/terminate`, {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                      body: JSON.stringify({ status: 'TERMINATED', proctorNotes: 'Terminated by Admin after audit.' })
                                                    }).then(res => {
                                                      if (res.ok) fetchUsers();
                                                      else alert('Failed to terminate attempt');
                                                    }).catch(console.error);
                                                  }}>
                                                    🛑 Terminate
                                                  </button>
                                                )}
                                                {att.status === 'TERMINATED' && (
                                                  <button className="btn btn-sm btn-warning" onClick={() => {
                                                    fetch(`${API}/api/attempts/${att.id}/cancel-termination`, {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                      body: JSON.stringify({})
                                                    }).then(res => {
                                                      if (res.ok) fetchUsers();
                                                      else alert('Failed to cancel termination');
                                                    }).catch(console.error);
                                                  }}>
                                                    ↩️ Cancel Termination
                                                  </button>
                                                )}
                                                {att.allowReattempt ? (
                                                  <span className="badge badge-info" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    🔄 Reattempt Enabled
                                                  </span>
                                                ) : (att.status === 'SUBMITTED' || att.status === 'TERMINATED') && (
                                                  <button
                                                    className="btn btn-sm btn-primary"
                                                    title="Allow candidate to reattempt this exam"
                                                    onClick={() => setConfirmReattemptModal(att)}
                                                  >
                                                    🔄 Allow Reattempt
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                            
                                            <div className="attempt-violations-section" style={{ marginTop: '0.75rem' }}>
                                              <h6 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: 600 }}>
                                                ⚠️ Proctor Violation Log ({att.violations?.length || 0})
                                              </h6>
                                              {att.violations && att.violations.length > 0 ? (
                                                <div className="violation-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                  {att.violations.map((v) => (
                                                    <div key={v.id || v._id} className={`violation-item border-${v.severity === 'HIGH' || v.severity === 'CRITICAL' ? 'danger' : 'warning'}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '0.5rem 0.75rem', borderRadius: '6px', borderLeft: '3px solid' }}>
                                                      <div className="violation-info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <span className={`badge ${v.severity === 'HIGH' || v.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '0.7rem' }}>
                                                          {v.severity}
                                                        </span>
                                                        <strong style={{ fontSize: '0.85rem' }}>{v.violationType || v.type}</strong>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                          ({v.riskLevel || 'LOW'} Risk)
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                          Penalty: -{v.riskContribution || 15} pts
                                                        </span>
                                                      </div>
                                                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                        {(v.snapshotUrl || v.evidenceUrl) && (
                                                          <button
                                                            className="btn btn-sm btn-secondary"
                                                            style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                                                            onClick={() => setEvidenceViewerModal({
                                                              ...v,
                                                              studentEmail: u.email,
                                                              studentName: `${u.firstName} ${u.lastName}`,
                                                              examTitle: att.examName,
                                                            })}
                                                          >
                                                            🖼️ Evidence Snapshot
                                                          </button>
                                                        )}
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                          ⏰ {new Date(v.timestamp || Date.now()).toLocaleTimeString()}
                                                        </span>
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                              ) : (
                                                <div className="good-standing-msg" style={{ background: 'rgba(34, 197, 94, 0.05)', color: '#22c55e', border: '1px dashed rgba(34, 197, 94, 0.2)', padding: '0.6rem 0.75rem', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                  <span>✅</span> Good Standing: Candidate maintained perfect protocol compliance. No violations flagged.
                                                </div>
                                              )}
                                            </div>

                                            {att.status === 'TERMINATED' && (
                                              <div className="termination-banner" style={{ marginTop: '0.75rem', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '0.75rem 1rem', borderRadius: '6px' }}>
                                                <strong style={{ color: 'var(--danger)', fontSize: '0.8rem', display: 'block', marginBottom: '0.25rem' }}>🛑 FORCE TERMINATED BY PROCTOR</strong>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Reason: {att.proctorNotes || 'No notes left by proctor.'}</p>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="no-attempts-msg" style={{ padding: '1rem', background: 'var(--bg-panel)', border: '1px dashed var(--border)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>This user has not attempted any proctored examinations yet.</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Violation Audit Tab */}
          {tab === 'violations' && (
            <div className="admin-section glass-panel fade-in-up">
              <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
                <div>
                  <h2 style={{ margin: 0 }}>🚨 Permanent Violation Audit Log</h2>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    Server-authoritative, immutable violation event records across all active & completed exams.
                  </div>
                </div>
                <button className="btn btn-secondary btn-sm" onClick={fetchAdminViolations}>
                  🔄 Refresh Audit Data
                </button>
              </div>

              {/* Filter Toolbar */}
              <div className="audit-filters-bar" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem', background: 'var(--bg-panel)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Search Record</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Candidate email, exam, ID..."
                    value={violationSearch}
                    onChange={(e) => setViolationSearch(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Violation Type</label>
                  <select
                    className="form-input form-select"
                    value={violationTypeFilter}
                    onChange={(e) => setViolationTypeFilter(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                  >
                    <option value="">All Violation Types</option>
                    <option value="NO_FACE">NO_FACE</option>
                    <option value="MULTIPLE_FACES">MULTIPLE_FACES</option>
                    <option value="MOBILE_PHONE">MOBILE_PHONE</option>
                    <option value="BOOK_DETECTED">BOOK_DETECTED</option>
                    <option value="TABLET_DETECTED">TABLET_DETECTED</option>
                    <option value="BROWSER_TAB_SWITCH">BROWSER_TAB_SWITCH</option>
                    <option value="FULLSCREEN_EXIT">FULLSCREEN_EXIT</option>
                    <option value="VOICE_DETECTED">VOICE_DETECTED</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Severity Level</label>
                  <select
                    className="form-input form-select"
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                  >
                    <option value="">All Severities</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Risk Level</label>
                  <select
                    className="form-input form-select"
                    value={riskLevelFilter}
                    onChange={(e) => setRiskLevelFilter(e.target.value)}
                    style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                  >
                    <option value="">All Risk Levels</option>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
              </div>

              {/* Table View */}
              {loadingViolations ? (
                <div className="text-center py-4">
                  <span className="spin" style={{ fontSize: '1.5rem' }}>⌛</span>
                  <p className="text-muted mt-2">Loading permanent violation records...</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Server Timestamp</th>
                        <th>Candidate / Student</th>
                        <th>Exam Title</th>
                        <th>Violation Type</th>
                        <th>Severity / Risk</th>
                        <th>Score Progression</th>
                        <th>Device Session</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditViolations
                        .filter((v) => {
                          const term = violationSearch.toLowerCase();
                          const email = (v.studentEmail || '').toLowerCase();
                          const title = (v.examTitle || '').toLowerCase();
                          const type = (v.violationType || '').toLowerCase();
                          const sess = (v.deviceSessionId || '').toLowerCase();
                          return email.includes(term) || title.includes(term) || type.includes(term) || sess.includes(term);
                        })
                        .map((v) => (
                          <tr key={v.id || v._id} className="table-row fade-in">
                            <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                              {new Date(v.timestamp).toLocaleString()}
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{v.studentEmail}</div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>ID: {v.studentId}</div>
                            </td>
                            <td style={{ fontSize: '0.85rem' }}>{v.examTitle}</td>
                            <td>
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{v.violationType}</span>
                              {v.metadata?.durationSeconds > 0 && (
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                  Duration: {v.metadata.durationSeconds}s
                                </div>
                              )}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px', flexDirection: 'column' }}>
                                <span className={`badge ${v.severity === 'CRITICAL' || v.severity === 'HIGH' ? 'badge-danger' : v.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.65rem' }}>
                                  Sev: {v.severity}
                                </span>
                                <span className="badge badge-secondary" style={{ fontSize: '0.65rem' }}>
                                  Risk: {v.riskLevel || 'LOW'}
                                </span>
                              </div>
                            </td>
                            <td style={{ fontSize: '0.8rem' }}>
                              {v.previousRiskScore !== undefined ? (
                                <div>
                                  <code>{v.previousRiskScore} → {v.newRiskScore}</code>
                                  <span style={{ color: 'var(--danger)', marginLeft: '4px' }}>(-{v.riskContribution})</span>
                                </div>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td>
                              <code style={{ fontSize: '0.75rem', color: '#6366f1' }}>
                                {v.deviceSessionId ? `${v.deviceSessionId.slice(0, 8)}...` : 'N/A'}
                              </code>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                {(v.snapshotUrl || v.evidenceUrl) && (
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                                    onClick={() => setEvidenceViewerModal(v)}
                                  >
                                    🖼️ Evidence
                                  </button>
                                )}
                                <button
                                  className="btn btn-sm btn-secondary"
                                  style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}
                                  onClick={() => setSelectedSessionDrawer(v)}
                                >
                                  🔍 Inspect
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {auditViolations.length === 0 && (
                        <tr>
                          <td colSpan="8" className="text-center py-4 text-muted">
                            No violations match the specified filters.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="admin-quick-grid fade-in-up delay-3">
            <div className="quick-card glass-card" onClick={() => navigate('/admin/create-exam')} id="quick-create-exam">
              <div className="quick-icon">✏️</div>
              <div className="quick-label">Create Exam</div>
              <div className="quick-sub">Deploy a new proctored exam</div>
            </div>
            <div className="quick-card glass-card" onClick={() => navigate('/proctor/dashboard')} id="quick-proctor">
              <div className="quick-icon">🖥️</div>
              <div className="quick-label">Proctor Console</div>
              <div className="quick-sub">Monitor live sessions</div>
            </div>
            <div className="quick-card glass-card" onClick={fetchExams} id="quick-refresh">
              <div className="quick-icon">🔄</div>
              <div className="quick-label">Refresh Data</div>
              <div className="quick-sub">Sync latest exam records</div>
            </div>
          </div>
        </div>
      </main>

      {/* Device Session Drawer / Modal */}
      {selectedSessionDrawer && (
        <div className="modal-overlay fade-in" onClick={() => setSelectedSessionDrawer(null)}>
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '600px', textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>🔍 Device Session & Audit Telemetry</h2>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                Event Record ID: <code>{selectedSessionDrawer.id || selectedSessionDrawer._id}</code>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ background: 'var(--bg-panel)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Student</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedSessionDrawer.studentEmail}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {selectedSessionDrawer.studentId}</div>
              </div>
              <div style={{ background: 'var(--bg-panel)', padding: '0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '4px' }}>Exam</div>
                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{selectedSessionDrawer.examTitle}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Attempt Status: {selectedSessionDrawer.attemptStatus}</div>
              </div>
            </div>

            <div style={{ background: 'var(--bg-panel)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>Device & Environment Info</div>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Device Session ID:</strong> <code>{selectedSessionDrawer.deviceSessionId}</code></div>
                <div><strong>User Agent:</strong> <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{selectedSessionDrawer.deviceInfo?.userAgent || 'N/A'}</span></div>
                <div><strong>Platform:</strong> {selectedSessionDrawer.deviceInfo?.platform || 'N/A'}</div>
                <div><strong>Screen Resolution:</strong> {selectedSessionDrawer.deviceInfo?.screenResolution || 'N/A'}</div>
                <div><strong>Language:</strong> {selectedSessionDrawer.deviceInfo?.language || 'N/A'}</div>
              </div>
            </div>

            <div style={{ background: 'rgba(99, 102, 241, 0.05)', padding: '0.85rem', borderRadius: '8px', border: '1px solid rgba(99, 102, 241, 0.2)', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', marginBottom: '6px' }}>Risk Progression Detail</div>
              <div style={{ fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div><strong>Violation Type:</strong> {selectedSessionDrawer.violationType}</div>
                <div><strong>Severity:</strong> {selectedSessionDrawer.severity} | <strong>Risk Level:</strong> {selectedSessionDrawer.riskLevel}</div>
                <div><strong>Previous Score:</strong> {selectedSessionDrawer.previousRiskScore ?? 'N/A'}</div>
                <div><strong>Risk Contribution (Deduction):</strong> -{selectedSessionDrawer.riskContribution ?? 'N/A'}</div>
                <div><strong>New Score:</strong> {selectedSessionDrawer.newRiskScore ?? 'N/A'}</div>
                <div><strong>Server Recorded Time:</strong> {new Date(selectedSessionDrawer.timestamp).toLocaleString()}</div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedSessionDrawer(null)}>
                Close Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evidence Viewer Modal */}
      {evidenceViewerModal && (
        <div className="modal-overlay fade-in" onClick={() => setEvidenceViewerModal(null)}>
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '640px', textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', margin: 0 }}>📸 Violation Evidence Snapshot</h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Candidate: <strong>{evidenceViewerModal.studentEmail || evidenceViewerModal.studentId || 'Candidate'}</strong>
                </div>
              </div>
              <button className="alert-close" onClick={() => setEvidenceViewerModal(null)}>✕</button>
            </div>

            <div style={{ background: '#000', borderRadius: '8px', overflow: 'hidden', textAlign: 'center', marginBottom: '1rem', maxHeight: '380px', border: '1px solid var(--border)' }}>
              {evidenceViewerModal.snapshotUrl || evidenceViewerModal.evidenceUrl ? (
                <img
                  src={evidenceViewerModal.snapshotUrl || evidenceViewerModal.evidenceUrl}
                  alt="Violation Evidence Frame"
                  style={{ maxWidth: '100%', maxHeight: '380px', objectFit: 'contain' }}
                />
              ) : (
                <div style={{ padding: '3rem', color: 'var(--text-muted)' }}>
                  🚫 Web browser event or camera stream unavailable. No image snapshot captured.
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: '0.8rem', background: 'var(--bg-panel)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1rem' }}>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Exam Title:</div>
                <strong style={{ color: 'var(--text-primary)' }}>{evidenceViewerModal.examTitle}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Violation Type:</div>
                <strong style={{ color: '#6366f1' }}>{evidenceViewerModal.violationType}</strong>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Server Timestamp:</div>
                <div>{new Date(evidenceViewerModal.timestamp).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Score Progression:</div>
                <div>
                  <code>{evidenceViewerModal.previousRiskScore ?? '?'} → {evidenceViewerModal.newRiskScore ?? '?'} (-{evidenceViewerModal.riskContribution})</code>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setEvidenceViewerModal(null)}>
                Close Evidence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="modal-overlay fade-in" onClick={() => setDeleteId(null)}>
          <div className="modal-card glass-panel bounce-in" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">🗑️</div>
            <h3>Delete Exam?</h3>
            <p>This action cannot be undone. All attempts associated with this exam will also be removed.</p>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDeleteExam(deleteId)}>
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reattempt Confirmation Modal */}
      {confirmReattemptModal && (
        <div className="modal-overlay fade-in" onClick={() => setConfirmReattemptModal(null)}>
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '450px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-icon" style={{ fontSize: '2.5rem' }}>🔄</div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Allow Exam Reattempt?</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Allow this student to write the exam again?
              <br />
              <small style={{ display: 'block', marginTop: '0.5rem', color: 'var(--text-secondary)' }}>
                Previous answers, violations, scores, and evidence will remain stored in history.
              </small>
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmReattemptModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => handleAllowReattempt(confirmReattemptModal.id || confirmReattemptModal._id || confirmReattemptModal.attemptId)}
              >
                Allow Reattempt
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete User Confirmation Modal */}
      {deleteUserModal && (
        <div className="modal-overlay fade-in" onClick={() => setDeleteUserModal(null)}>
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '500px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-icon" style={{ fontSize: '2.5rem' }}>🗑️</div>
            <h3 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>Delete / Deactivate User Account</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
              Choose deletion mode for candidate <strong>{deleteUserModal.firstName} {deleteUserModal.lastName}</strong> ({deleteUserModal.email}):
            </p>
            <div style={{ background: 'var(--bg-panel)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '1.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <strong style={{ color: 'var(--warning)' }}>⚠️ Soft Deactivate:</strong> Prevents candidate login while keeping historical attempt records and violation logs intact for audit. Account can be restored anytime.
              </div>
              <div>
                <strong style={{ color: 'var(--danger)' }}>🔥 Permanent Delete:</strong> Completely purges the user profile, attempts, and violation data from MongoDB.
              </div>
            </div>
            <div className="modal-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => setDeleteUserModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-warning"
                onClick={() => handleDeleteUser(deleteUserModal.id || deleteUserModal._id, false)}
              >
                Soft Deactivate
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteUser(deleteUserModal.id || deleteUserModal._id, true)}
              >
                🔥 Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
