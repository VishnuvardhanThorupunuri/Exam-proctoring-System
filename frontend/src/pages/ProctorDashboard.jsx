import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { API_BASE_URL } from '../config';
import { getViolationDisplayName, getViolationIcon } from '../utils/violationUtils';
import './ProctorDashboard.css';

function AlertCard({ alert, onClose }) {
  const isHigh = alert.severity === 'HIGH' || alert.severity === 'CRITICAL';
  const deviceSessionId = alert.deviceSessionId || alert.attempt?.deviceSessionId;
  return (
    <div className={`proctor-alert-card glass-panel fade-in-up border-${isHigh ? 'danger' : 'warning'}`}>
      <div className="alert-content">
        <div className="alert-icon">{isHigh ? '🚨' : '⚠️'}</div>
        <div className="alert-text">
          <div className="alert-title">
            <strong>{alert.studentName}</strong> – {getViolationIcon(alert.type || alert.violationType)} {getViolationDisplayName(alert.type || alert.violationType)}
          </div>
          <div className="alert-meta">
            Risk: <span className="badge badge-danger" style={{ fontSize: '0.65rem' }}>{alert.riskLevel || alert.severity || 'LOW'}</span>
            • Score: {alert.previousRiskScore !== undefined ? `${alert.previousRiskScore} → ${alert.newRiskScore}` : `${alert.currentScore}%`}
            • {new Date(alert.timestamp || Date.now()).toLocaleString()}
            {deviceSessionId && (
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Session ID: <code>{deviceSessionId.slice(0, 8)}...</code>
              </div>
            )}
          </div>
        </div>
      </div>
      <button onClick={onClose} className="alert-close">✕</button>
    </div>
  );
}

export default function ProctorDashboard({ token, user, onLogout }) {
  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [activeAudit, setActiveAudit] = useState(null);
  const [evidenceViewerModal, setEvidenceViewerModal] = useState(null);
  const [confirmReattemptModal, setConfirmReattemptModal] = useState(null);
  const [deleteUserModal, setDeleteUserModal] = useState(null);
  const [terminationNotes, setTerminationNotes] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  
  // Tab and Candidates User Settings Management State
  const [tab, setTab] = useState('live'); // 'live' | 'users'
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [expandedUser, setExpandedUser] = useState(null);

  const navigate = useNavigate();

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch users');
      const data = await res.json();
      setUsers(data);
    } catch (e) {
      console.error('Error fetching users:', e);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleDeleteUser = async (userId, isPermanent = false) => {
    try {
      const url = `${API_BASE_URL}/api/users/${userId}/delete${isPermanent ? '?permanent=true' : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ permanent: !!isPermanent }),
      });
      if (res.ok) {
        if (selectedExam) {
          const updated = await fetchAttemptsForExam(selectedExam.id);
          setAttempts(updated);
        }
        fetchUsers();
        setActiveAudit(null);
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
      const res = await fetch(`${API_BASE_URL}/api/users/${userId}/restore`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (selectedExam) {
          const updated = await fetchAttemptsForExam(selectedExam.id);
          setAttempts(updated);
        }
        fetchUsers();
        setActiveAudit(null);
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
      const res = await fetch(`${API_BASE_URL}/api/attempts/${attemptId}/allow-reattempt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        if (selectedExam) {
          const updated = await fetchAttemptsForExam(selectedExam.id);
          setAttempts(updated);
        }
        fetchUsers();
        setActiveAudit(null);
        setConfirmReattemptModal(null);
      } else {
        const err = await res.json();
        alert('Failed to allow reattempt: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error(e);
      alert('Error allowing reattempt');
    }
  };

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/exams`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Failed to fetch exams');
        const data = await res.json();
        setExams(data);
        if (data.length > 0) setSelectedExam(data[0]);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchExams();
  }, [token]);

  const fetchAttemptsForExam = async (examId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/exams/${examId}/attempts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch attempts');
      return await res.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  };

  useEffect(() => {
    if (!selectedExam) return;

    const fetchAttempts = async () => {
      const data = await fetchAttemptsForExam(selectedExam.id);
      setAttempts(data);
    };
    fetchAttempts();

    const socket = io(API_BASE_URL, { auth: { token } });
    socket.on('connect', () => console.log('Connected to proctor socket room'));
    socket.emit('proctor_join_exam', { examId: selectedExam.id });

    const handleAlert = (payload) => {
      const violationName = getViolationDisplayName(payload.type || payload.violationType);
      const newAlert = {
        id: payload.violationId || payload.id || Date.now(),
        studentName: payload.studentName || 'Candidate',
        violationType: payload.type || payload.violationType,
        type: payload.type || payload.violationType,
        violationName,
        displayName: violationName,
        severity: payload.severity || 'HIGH',
        timestamp: payload.timestamp || new Date(),
        currentScore: payload.currentScore ?? payload.integrityScore,
        ...payload,
      };
      setAlerts((prev) => [newAlert, ...prev].slice(0, 8));
      setAttempts((prev) =>
        prev.map((att) =>
          att.id === payload.attemptId || att._id === payload.attemptId
            ? {
                ...att,
                violations: [payload, ...(att.violations || [])],
                integrityScore: payload.currentScore ?? payload.integrityScore ?? att.integrityScore,
                status: payload.status || att.status,
              }
            : att
        )
      );
      setActiveAudit((curr) => {
        if (curr && (curr.id === payload.attemptId || curr._id === payload.attemptId)) {
          return {
            ...curr,
            violations: [payload, ...(curr.violations || [])],
            integrityScore: payload.currentScore ?? payload.integrityScore ?? curr.integrityScore,
          };
        }
        return curr;
      });
    };

    socket.on('proctoring:violation_alert', handleAlert);
    socket.on('student_violation_alert', handleAlert);

    // Listen to candidate status changes (network, camera, mic, socket)
    socket.on('proctoring:student_status_changed', (payload) => {
      setAttempts((prev) =>
        prev.map((att) =>
          att.id === payload.attemptId || att._id === payload.attemptId
            ? {
                ...att,
                cameraStatus: payload.cameraStatus || att.cameraStatus,
                micStatus: payload.micStatus || att.micStatus,
                networkStatus: payload.networkStatus || att.networkStatus,
                socketStatus: payload.socketStatus || att.socketStatus,
              }
            : att
        )
      );
    });

    socket.on('proctoring:student_terminated', (payload) => {
      setAttempts((prev) =>
        prev.map((att) =>
          att.id === payload.attemptId || att._id === payload.attemptId
            ? { ...att, status: 'TERMINATED', integrityScore: payload.finalScore }
            : att
        )
      );
    });

    return () => socket.disconnect();
  }, [selectedExam, token]);

  const handleTerminate = async (attemptId) => {
    setIsTerminating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/attempts/${attemptId}/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'TERMINATED', proctorNotes: terminationNotes }),
      });
      if (res.ok) {
        const updatedAttempts = await fetchAttemptsForExam(selectedExam.id);
        setAttempts(updatedAttempts);
        const updatedAttempt = updatedAttempts.find(a => a.id === attemptId);
        setActiveAudit(updatedAttempt);
        setTerminationNotes('');
      } else {
        alert('Failed to terminate attempt');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTerminating(false);
    }
  };

  const handleCancelTermination = async (attemptId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/attempts/${attemptId}/cancel-termination`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        const updated = await fetchAttemptsForExam(selectedExam.id);
        setAttempts(updated);
        setActiveAudit(null);
        setTerminationNotes('');
      } else {
        const err = await res.json();
        alert('Failed to cancel termination: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Error cancelling termination:', e);
      alert('Error cancelling termination');
    }
  };

  const activeCount = attempts.filter(a => a.status === 'IN_PROGRESS').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'HIGH' || a.severity === 'CRITICAL').length;

  const filteredUsers = users.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <div className="proctor-root bg-mesh">
      <header className="student-header glass-panel" style={{ zIndex: 10 }}>
        <div className="header-brand">
          <span className="logo-icon floating">👁️</span>
          <h1>Aegis Proctor Console</h1>
        </div>
        <div className="header-user">
          <div className="user-info">
            <span className="user-greeting">{tab === 'live' ? 'Live Telemetry' : 'Users Management'}</span>
            <span className="user-name">{user?.firstName} {user?.lastName}</span>
          </div>
          {onLogout && <button className="btn btn-secondary btn-sm" onClick={onLogout}>Logout</button>}
        </div>
      </header>

      {/* Prominent Dedicated Navigation Control Bar */}
      <div style={{ padding: '1rem 2rem 0 2rem' }}>
        <div className="glass-panel fade-in-down" style={{
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1.25rem',
          borderRadius: '12px',
          border: '1px solid var(--border)',
          background: 'rgba(15, 23, 42, 0.75)',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          flexWrap: 'wrap',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              className={`btn ${tab === 'live' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTab('live')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.25rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                borderRadius: '8px',
                border: tab === 'live' ? '1px solid #6366f1' : '1px solid var(--border)',
                boxShadow: tab === 'live' ? '0 0 16px rgba(99, 102, 241, 0.4)' : 'none',
              }}
            >
              <span>👁️</span> Live Exam Telemetry
            </button>
            <button
              className={`btn ${tab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => { setTab('users'); fetchUsers(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.6rem 1.25rem',
                fontWeight: 600,
                fontSize: '0.9rem',
                borderRadius: '8px',
                border: tab === 'users' ? '1px solid #6366f1' : '1px solid var(--border)',
                boxShadow: tab === 'users' ? '0 0 16px rgba(99, 102, 241, 0.4)' : 'none',
              }}
            >
              <span>👤</span> Candidate Users & Settings
            </button>
          </div>

          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1rem' }}>🛡️</span>
            {tab === 'live' ? (
              <span>Active Exam: <strong style={{ color: 'var(--text-primary)' }}>{selectedExam?.title || 'None Selected'}</strong> ({attempts.length} Candidates)</span>
            ) : (
              <span>Candidate Directory: <strong style={{ color: 'var(--text-primary)' }}>{users.length} Total Users Registered</strong></span>
            )}
          </div>
        </div>
      </div>

      <main className="proctor-main">
        {loading ? (
          <div className="proctor-loading fade-in">
            <span className="spin" style={{ fontSize: '2rem' }}>⌛</span>
            <p>Initializing live feeds...</p>
          </div>
        ) : tab === 'users' ? (
          <div className="proctor-card glass-panel fade-in-up" style={{ padding: '1.5rem' }}>
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <div>
                <h2 className="card-title" style={{ margin: 0 }}>👤 Candidate Accounts & User Settings</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                  Manage student profiles, deactivations, reattempts, and proctoring audit settings.
                </p>
              </div>
              <div className="card-actions" style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <div className="search-wrap" style={{ position: 'relative' }}>
                  <span className="search-icon" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
                  <input
                    type="text"
                    className="form-input search-input"
                    placeholder="Search candidate name or email…"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    style={{ paddingLeft: '2rem', width: '280px' }}
                  />
                </div>
                <button className="btn btn-secondary btn-sm" onClick={fetchUsers}>🔄 Refresh Users</button>
              </div>
            </div>

            {loadingUsers ? (
              <div className="table-loading">
                {[1,2,3].map(i => (
                  <div key={i} className="skeleton" style={{height:'60px', marginBottom:'0.5rem', borderRadius:'8px'}} />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="empty-state" style={{ textAlign: 'center', padding: '3rem' }}>
                <div className="empty-icon" style={{ fontSize: '3rem' }}>👥</div>
                <h3>No Candidate Accounts Found</h3>
                <p className="text-muted">No student accounts match your filter criteria.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>System Role</th>
                      <th>Attempts Summary</th>
                      <th>Account Status</th>
                      <th>Settings & Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => {
                      const hasTerminated = u.attempts?.some(a => a.isTerminated || a.status === 'TERMINATED');
                      const completedAttempts = u.attempts?.filter(a => a.status === 'SUBMITTED') || [];
                      const terminatedAttempts = u.attempts?.filter(a => a.status === 'TERMINATED') || [];

                      return (
                        <React.Fragment key={u.id || u._id}>
                          <tr 
                            className={`table-row fade-in candidate-row ${expandedUser === u.id ? 'active-row' : ''}`} 
                            onClick={() => setExpandedUser(expandedUser === u.id ? null : u.id)}
                            style={{ cursor: 'pointer' }}
                          >
                            <td>
                              <div className="exam-title-cell" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                <div className="avatar-circle" style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #6366f1, #a855f7)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '0.9rem' }}>
                                  {u.firstName?.[0]}{u.lastName?.[0]}
                                </div>
                                <div>
                                  <div className="exam-name" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{u.firstName} {u.lastName}</div>
                                  <div className="exam-desc" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{u.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <span className={`badge ${u.role === 'ADMIN' ? 'badge-primary' : u.role === 'PROCTOR' ? 'badge-secondary' : 'badge-info'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td>
                              <div className="attempts-summary-badges" style={{ display: 'flex', gap: '0.35rem' }}>
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
                                        <div key={att.id || att._id} className="attempt-detail-card glass-panel" style={{ padding: '1.25rem', border: '1px solid var(--border)', borderRadius: '10px' }}>
                                          <div className="attempt-card-header" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                                            <div className="attempt-exam-info" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                              <span style={{ fontSize: '1.5rem' }}>📝</span>
                                              <div>
                                                <h5 className="attempt-exam-name" style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.95rem' }}>{att.examName}</h5>
                                                <span className="attempt-date" style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Started: {new Date(att.startedAt || Date.now()).toLocaleString()}</span>
                                              </div>
                                            </div>
                                            <div className="attempt-status-badges" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
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
                                                    fetch(`${API_BASE_URL}/api/attempts/${att.id || att._id}/reset-integrity`, {
                                                      method: 'POST',
                                                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                      body: JSON.stringify({ targetScore: 100, proctorNotes: 'Integrity score restored to 100% by proctor after behavior review.' }),
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
                                                  fetch(`${API_BASE_URL}/api/attempts/${att.id || att._id}/terminate`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                                    body: JSON.stringify({ status: 'TERMINATED', proctorNotes: 'Terminated by Proctor after audit.' })
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
                                                  fetch(`${API_BASE_URL}/api/attempts/${att.id || att._id}/cancel-termination`, {
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
                                                  onClick={() => setConfirmReattemptModal({
                                                    attemptId: att.id || att._id,
                                                    studentName: `${u.firstName} ${u.lastName}`,
                                                  })}
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
                                                      <strong style={{ fontSize: '0.85rem' }}>
                                                        {getViolationIcon(v.violationType || v.type)} {getViolationDisplayName(v.violationType || v.type)}
                                                      </strong>
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
                                                          onClick={() => setEvidenceViewerModal({ ...v, studentName: `${u.firstName} ${u.lastName}` })}
                                                        >
                                                          🖼️ Evidence
                                                        </button>
                                                      )}
                                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {new Date(v.timestamp || Date.now()).toLocaleTimeString()}
                                                      </span>
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                No violation telemetry recorded for this attempt.
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                      No proctored exam attempts recorded for this user yet.
                                    </div>
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
        ) : exams.length === 0 ? (
          <div className="student-empty-state glass-card fade-in">
            <div className="empty-emoji">📭</div>
            <h3>No Active Exams</h3>
            <p>There are no exams available for proctoring right now.</p>
          </div>
        ) : (
          <div className="proctor-layout">
            <aside className="proctor-sidebar">
              <div className="proctor-card glass-panel fade-in-up">
                <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>Monitor Exam Session</label>
                <select
                  className="form-input form-select"
                  value={selectedExam?.id || ''}
                  onChange={(e) => {
                    const exam = exams.find((ex) => ex.id === e.target.value);
                    setSelectedExam(exam);
                  }}
                >
                  {exams.map((exam) => (
                    <option key={exam.id} value={exam.id}>
                      {exam.title}
                    </option>
                  ))}
                </select>

                <div className="proctor-stats mt-4">
                  <div className="p-stat">
                    <div className="p-stat-val text-primary">{activeCount}</div>
                    <div className="p-stat-lbl">Active Candidates</div>
                  </div>
                  <div className="p-stat">
                    <div className="p-stat-val text-danger">{criticalAlerts}</div>
                    <div className="p-stat-lbl">Critical Alerts</div>
                  </div>
                </div>
              </div>

              <div className="proctor-alerts mt-4">
                <h3 className="section-title" style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>
                  Live Alerts <span className="badge badge-danger">{alerts.length}</span>
                </h3>
                {alerts.length === 0 ? (
                  <div className="empty-alerts">All clear. No recent violations.</div>
                ) : (
                  <div className="alerts-list">
                    {alerts.map((a) => (
                      <AlertCard key={a.id} alert={a} onClose={() => setAlerts(prev => prev.filter(x => x.id !== a.id))} />
                    ))}
                  </div>
                )}
              </div>
            </aside>

            <section className="proctor-content">
              <div className="proctor-card glass-panel fade-in-up delay-2" style={{ height: '100%' }}>
                <div className="card-header border-bottom pb-3 mb-3">
                  <h2 className="card-title" style={{ margin: 0 }}>Candidate Live Feed Sessions</h2>
                </div>

                <div className="table-wrap">
                  <table className="admin-table proctor-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Session Status</th>
                        <th>Hardware & Network</th>
                        <th>Integrity</th>
                        <th>Violations</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attempts.map((att) => (
                        <tr key={att.id} className="table-row fade-in">
                          <td>
                            <div className="cand-name">{att.student?.firstName} {att.student?.lastName}</div>
                            <div className="cand-email">{att.student?.email}</div>
                          </td>
                          <td>
                            <span className={`badge ${att.status === 'IN_PROGRESS' ? 'badge-success' : att.status === 'TERMINATED' ? 'badge-danger' : 'badge-info'}`}>
                              <span className={`status-dot ${att.status === 'IN_PROGRESS' ? 'active' : 'muted'}`} />
                              {att.status.replace('_', ' ')}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                              <span className={`badge ${att.cameraStatus === 'disconnected' ? 'badge-danger' : 'badge-success'}`} style={{ fontSize: '0.7rem' }}>
                                📷 {att.cameraStatus || 'active'}
                              </span>
                              <span className={`badge ${att.micStatus === 'disconnected' ? 'badge-warning' : 'badge-success'}`} style={{ fontSize: '0.7rem' }}>
                                🎙️ {att.micStatus || 'active'}
                              </span>
                              <span className={`badge ${att.networkStatus === 'offline' ? 'badge-danger' : 'badge-info'}`} style={{ fontSize: '0.7rem' }}>
                                🌐 {att.networkStatus || 'online'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className={`score-badge ${att.integrityScore < 50 ? 'danger' : att.integrityScore < 80 ? 'warning' : 'success'}`}>
                              {att.integrityScore}%
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${att.violations?.length > 0 ? 'badge-warning' : 'badge-info'}`}>
                              {att.violations?.length || 0}
                            </span>
                          </td>
                          <td>
                            <div className="row-actions">
                              <button className="btn btn-sm btn-secondary" onClick={() => setActiveAudit(att)}>
                                👁️ Audit
                              </button>
                              {(att.status === 'SUBMITTED' || att.status === 'TERMINATED') && (
                                att.allowReattempt ? (
                                  <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                                    🔄 Reattempt Enabled
                                  </span>
                                ) : (
                                  <button
                                    className="btn btn-sm btn-warning"
                                    onClick={() => setConfirmReattemptModal({
                                      attemptId: att.id || att._id,
                                      studentName: `${att.student?.firstName} ${att.student?.lastName}`,
                                    })}
                                  >
                                    🔄 Allow Reattempt
                                  </button>
                                )
                              )}
                              {att.status === 'TERMINATED' && !att.allowReattempt && (
                                <button className="btn btn-sm btn-secondary" onClick={() => handleCancelTermination(att.id)}>
                                  🔄 Cancel Term
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                      {attempts.length === 0 && (
                        <tr>
                          <td colSpan="6" className="text-center py-4 text-muted">
                            No attempts recorded for this exam yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        )}
      </main>

      {/* Audit Modal */}
      {activeAudit && (
        <div className="modal-overlay fade-in">
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '650px', textAlign: 'left' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Candidate Telemetry Audit: {activeAudit.student?.firstName} {activeAudit.student?.lastName}</h2>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {activeAudit.student?.email} • Session ID: <code style={{ color: '#6366f1' }}>{activeAudit.deviceSessionId || 'N/A'}</code>
              </div>
            </div>

            <div className="audit-stats" style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
              <div className="badge badge-info text-lg">Status: {activeAudit.status}</div>
              <div className={`badge text-lg ${activeAudit.integrityScore < 50 ? 'badge-danger' : 'badge-success'}`}>
                Integrity: {activeAudit.integrityScore}%
              </div>
              <div className="badge badge-secondary text-lg">
                Camera: {activeAudit.cameraStatus || 'active'}
              </div>
              <div className="badge badge-secondary text-lg">
                Mic: {activeAudit.micStatus || 'active'}
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Violation History Log</h3>
            <div className="audit-violations scroll-y" style={{ maxHeight: '220px', background: 'var(--bg-panel)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
              {activeAudit.violations && activeAudit.violations.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {activeAudit.violations.map((v) => (
                    <li key={v.id || v._id || Math.random()} style={{ padding: '0.6rem 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <span className={`badge ${v.severity === 'HIGH' || v.severity === 'CRITICAL' ? 'badge-danger' : v.severity === 'MEDIUM' ? 'badge-warning' : 'badge-info'}`} style={{ marginRight: '0.5rem' }}>
                            {v.severity}
                          </span>
                          <strong>
                            {getViolationIcon(v.violationType || v.type)} {getViolationDisplayName(v.violationType || v.type)}
                          </strong>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
                            ({v.riskLevel || 'LOW'} Risk)
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          {(v.snapshotUrl || v.evidenceUrl) && (
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem' }}
                              onClick={() => setEvidenceViewerModal({ ...v, studentName: `${activeAudit.student?.firstName} ${activeAudit.student?.lastName}` })}
                            >
                              🖼️ View Evidence
                            </button>
                          )}
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            ⏰ {new Date(v.timestamp || Date.now()).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Score Delta: {v.previousRiskScore !== undefined ? `${v.previousRiskScore} → ${v.newRiskScore} (-${v.riskContribution})` : `Score ${v.currentScore || activeAudit.integrityScore}%`}
                        {v.deviceSessionId && (
                          <span style={{ marginLeft: '1rem', color: 'var(--text-muted)' }}>
                            Session: {v.deviceSessionId.slice(0, 8)}...
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted">No violations recorded. Candidate session is in good standing.</div>
              )}
            </div>

            {activeAudit.status !== 'TERMINATED' && (
              <div className="audit-actions" style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                <h4 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>🛑 Force Terminate Candidate Session</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Force ending this session will mark the candidate attempt as TERMINATED.
                </p>
                <textarea
                  className="form-input form-textarea mb-3"
                  placeholder="Reason for termination (Required)"
                  value={terminationNotes}
                  onChange={(e) => setTerminationNotes(e.target.value)}
                  rows={3}
                />
                <button
                  className="btn btn-danger w-100"
                  style={{ justifyContent: 'center' }}
                  onClick={() => {
                    setIsTerminating(true);
                    handleTerminate(activeAudit.id).finally(() => setIsTerminating(false));
                  }}
                  disabled={isTerminating || terminationNotes.trim().length < 5}
                >
                  {isTerminating ? 'Terminating...' : 'Confirm Termination'}
                </button>
              </div>
            )}

            <div className="modal-actions mt-4" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {activeAudit.allowReattempt ? (
                <span className="badge badge-success text-lg">🔄 Reattempt Enabled</span>
              ) : (activeAudit.status === 'SUBMITTED' || activeAudit.status === 'TERMINATED') && (
                <button
                  className="btn btn-warning"
                  onClick={() => setConfirmReattemptModal({
                    attemptId: activeAudit.id || activeAudit._id,
                    studentName: `${activeAudit.student?.firstName} ${activeAudit.student?.lastName}`,
                  })}
                >
                  🔄 Allow Reattempt
                </button>
              )}
              {activeAudit.status === 'TERMINATED' && (
                <button className="btn btn-secondary" onClick={() => {
                  setIsCancelling(true);
                  handleCancelTermination(activeAudit.id).finally(() => {
                    setIsCancelling(false);
                    setActiveAudit(null);
                    setTerminationNotes('');
                  });
                }} disabled={isCancelling}>
                  {isCancelling ? 'Cancelling...' : 'Cancel Termination'}
                </button>
              )}
              {activeAudit.student?.isDeleted ? (
                <button
                  className="btn btn-success"
                  onClick={() => handleRestoreUser(activeAudit.student?._id || activeAudit.student?.id || activeAudit.studentId)}
                >
                  ↩️ Restore User
                </button>
              ) : (
                (activeAudit.student?._id || activeAudit.student?.id || activeAudit.studentId) !== user?.id && (
                  <button
                    className="btn btn-danger"
                    onClick={() => setDeleteUserModal({
                      id: activeAudit.student?._id || activeAudit.student?.id || activeAudit.studentId,
                      firstName: activeAudit.student?.firstName || 'Candidate',
                      lastName: activeAudit.student?.lastName || '',
                      email: activeAudit.student?.email || '',
                    })}
                  >
                    🗑️ Delete User
                  </button>
                )
              )}
              <button className="btn btn-secondary" onClick={() => { setActiveAudit(null); setTerminationNotes(''); }}>
                Close Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reattempt Modal */}
      {confirmReattemptModal && (
        <div className="modal-overlay fade-in" onClick={() => setConfirmReattemptModal(null)}>
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '480px', textAlign: 'left' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">🔄</div>
            <h3 style={{ fontSize: '1.2rem', margin: '0 0 0.5rem 0' }}>Allow Reattempt?</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
              Allow candidate <strong>{confirmReattemptModal.studentName}</strong> to write the exam again?
              <br /><br />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                • Previous attempt submission, score, answers, violations, and evidence will remain intact.
                <br />
                • Student will be granted permission to launch a brand new independent attempt.
              </span>
            </p>
            <div className="modal-actions" style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmReattemptModal(null)}>
                Cancel
              </button>
              <button
                className="btn btn-warning"
                onClick={() => handleAllowReattempt(confirmReattemptModal.attemptId)}
              >
                Confirm Allow Reattempt
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
                  Candidate: <strong>{evidenceViewerModal.studentName || evidenceViewerModal.studentEmail || 'Candidate'}</strong>
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
                <div style={{ color: 'var(--text-muted)' }}>Violation Type:</div>
                <strong style={{ color: 'var(--text-primary)' }}>
                  {getViolationIcon(evidenceViewerModal.violationType || evidenceViewerModal.type)} {getViolationDisplayName(evidenceViewerModal.violationType || evidenceViewerModal.type)}
                </strong>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Code: <code>{evidenceViewerModal.violationType || evidenceViewerModal.type}</code>
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Server Timestamp:</div>
                <div>{new Date(evidenceViewerModal.timestamp || Date.now()).toLocaleString()}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Severity / Risk:</div>
                <div>
                  <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                    {evidenceViewerModal.severity} / {evidenceViewerModal.riskLevel || 'HIGH'}
                  </span>
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Confidence & Impact:</div>
                <div>
                  Confidence: {Math.round((evidenceViewerModal.confidence || 1.0) * 100)}% | Penalty: -{evidenceViewerModal.riskContribution || 15} pts
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

      {/* Delete User Confirmation Modal */}
      {deleteUserModal && (
        <div className="modal-overlay fade-in" onClick={() => setDeleteUserModal(null)}>
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '500px', textAlign: 'left' }} onClick={e => e.stopPropagation()}>
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
                onClick={() => handleDeleteUser(deleteUserModal.id, false)}
              >
                Soft Deactivate
              </button>
              <button
                className="btn btn-danger"
                onClick={() => handleDeleteUser(deleteUserModal.id, true)}
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
