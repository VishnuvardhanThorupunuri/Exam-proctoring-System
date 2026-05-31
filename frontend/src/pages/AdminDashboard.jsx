import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';

const API = 'https://exam-proctoring-system-vrbm.onrender.com';

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
  const [tab, setTab] = useState('exams'); // exams | overview | users
  const [expandedUser, setExpandedUser] = useState(null);
  const navigate = useNavigate();

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
                                {hasTerminated ? (
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
                                <button className="btn btn-sm btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                  {expandedUser === u.id ? '🔼 Hide' : '👁️ Audit'}
                                </button>
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
                                                {(att.status === 'IN_PROGRESS' || att.status === 'SUBMITTED') && (
                                   <button className="btn btn-sm btn-danger" onClick={() => {
                                     fetch(`${API}/api/attempts/${att.id}/terminate`, {
                                       method: 'POST',
                                       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                       body: JSON.stringify({ status: 'TERMINATED', proctorNotes: '' })
                                     }).then(res => {
                                       if (res.ok) {
                                         window.location.reload();
                                       } else {
                                         alert('Failed to terminate attempt');
                                       }
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
                                       if (res.ok) {
                                         window.location.reload();
                                       } else {
                                         alert('Failed to cancel termination');
                                       }
                                     }).catch(console.error);
                                   }}>
                                     ↩️ Cancel Termination
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
                                                    <div key={v.id} className={`violation-item border-${v.severity === 'HIGH' ? 'danger' : 'warning'}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-panel)', padding: '0.5rem 0.75rem', borderRadius: '6px', borderLeft: '3px solid' }}>
                                                      <div className="violation-info" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                        <span className={`badge ${v.severity === 'HIGH' ? 'badge-danger' : v.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info'}`} style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}>
                                                          {v.severity}
                                                        </span>
                                                        <span style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>{v.violationType}</span>
                                                        <span className="violation-time" style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{new Date(v.timestamp).toLocaleTimeString()}</span>
                                                      </div>
                                                      {v.snapshotUrl && (
                                                        <div className="violation-snapshot">
                                                          <a href={v.snapshotUrl} target="_blank" rel="noreferrer" className="snapshot-link" style={{ fontSize: '0.75rem', color: 'var(--text-link)', textDecoration: 'none' }}>🖼️ View Snapshot</a>
                                                        </div>
                                                      )}
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
    </div>
  );
}
