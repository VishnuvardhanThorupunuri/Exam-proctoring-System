import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import './ProctorDashboard.css';

function AlertCard({ alert, onClose }) {
  return (
    <div className={`proctor-alert-card glass-panel fade-in-up border-${alert.severity === 'CRITICAL' ? 'danger' : 'warning'}`}>
      <div className="alert-content">
        <div className="alert-icon">{alert.severity === 'CRITICAL' ? '🚨' : '⚠️'}</div>
        <div className="alert-text">
          <div className="alert-title">
            <strong>{alert.studentName}</strong> – {alert.violationType}
          </div>
          <div className="alert-meta">
            Score: {alert.currentScore}% • {new Date(alert.timestamp).toLocaleTimeString()}
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
  const [terminationNotes, setTerminationNotes] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchExams = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/exams', {
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

  // Helper to fetch attempts for a given exam – defined at component level so all handlers can call it
  const fetchAttemptsForExam = async (examId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/exams/${examId}/attempts`, {
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

    const socket = io('http://localhost:5000', { auth: { token } });
    socket.on('connect', () => console.log('Connected to proctor socket'));
    socket.emit('proctor_join_exam', { examId: selectedExam.id });
    
    socket.on('student_violation_alert', (payload) => {
      const newAlert = {
        id: payload.id || Date.now(),
        studentName: payload.studentName,
        violationType: payload.violationType,
        severity: payload.severity || 'WARNING',
        timestamp: payload.timestamp,
        currentScore: payload.currentScore,
        ...payload,
      };
      setAlerts((prev) => [newAlert, ...prev].slice(0, 8)); // keep last 8
      setAttempts((prev) =>
        prev.map((att) =>
          att.id === payload.attemptId
            ? { ...att, violations: [...(att.violations || []), payload], integrityScore: payload.integrityScore, status: payload.status || att.status }
            : att
        )
      );
    });
    
    return () => socket.disconnect();
  }, [selectedExam, token]);

  const handleTerminate = async (attemptId) => {
    setIsTerminating(true);
    try {
      const res = await fetch(`http://localhost:5000/api/attempts/${attemptId}/terminate`, {
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

  // Quick terminate helper: uses existing termination notes or defaults
  const quickTerminate = async (attemptId) => {
    // If no notes provided, use a default reason
    const defaultReason = 'Terminated via quick action';
    const notes = terminationNotes.trim().length >= 5 ? terminationNotes : defaultReason;
    try {
      const res = await fetch(`http://localhost:5000/api/attempts/${attemptId}/terminate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ proctorNotes: notes }),
      });
      if (res.ok) {
        const updated = await fetchAttemptsForExam(selectedExam.id);
        setAttempts(updated);
        setTerminationNotes('');
      } else {
        const err = await res.json();
        alert('Termination failed: ' + (err.error || 'Unknown'));
      }
    } catch (e) {
      console.error('Quick terminate error:', e);
      alert('Error terminating attempt');
    }
  };

  const handleCancelTermination = async (attemptId) => {
    try {
      const res = await fetch(`http://localhost:5000/api/attempts/${attemptId}/cancel-termination`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        // Refresh attempts and close audit if open
        const updated = await fetchAttemptsForExam(selectedExam.id);
        setAttempts(updated);
        setActiveAudit(null);
        setTerminationNotes('');
      } else {
        const err = await res.json();
        console.error('Cancel termination failed:', err);
        alert('Failed to cancel termination: ' + (err.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Error cancelling termination:', e);
      alert('Error cancelling termination');
    }
  };

  const activeCount = attempts.filter(a => a.status === 'IN_PROGRESS').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'CRITICAL').length;

  return (
    <div className="proctor-root bg-mesh">
      {/* Header */}
      <header className="student-header glass-panel" style={{ zIndex: 10 }}>
        <div className="header-brand">
          <span className="logo-icon floating">👁️</span>
          <h1>Aegis Proctor Console</h1>
        </div>
        <div className="header-user">
          <div className="user-info">
            <span className="user-greeting">Live Monitoring</span>
            <span className="user-name">{user?.firstName}</span>
          </div>
          {onLogout && <button className="btn btn-secondary btn-sm" onClick={onLogout}>Logout</button>}
        </div>
      </header>

      <main className="proctor-main">
        {loading ? (
          <div className="proctor-loading fade-in">
            <span className="spin" style={{ fontSize: '2rem' }}>⌛</span>
            <p>Initializing live feeds...</p>
          </div>
        ) : exams.length === 0 ? (
          <div className="student-empty-state glass-card fade-in">
            <div className="empty-emoji">📭</div>
            <h3>No Active Exams</h3>
            <p>There are no exams available for proctoring right now.</p>
          </div>
        ) : (
          <div className="proctor-layout">
            
            {/* Left Col - Config & Alerts */}
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

            {/* Right Col - Candidate Grid */}
            <section className="proctor-content">
              <div className="proctor-card glass-panel fade-in-up delay-2" style={{ height: '100%' }}>
                <div className="card-header border-bottom pb-3 mb-3">
                  <h2 className="card-title" style={{ margin: 0 }}>Candidate Sessions</h2>
                </div>

                <div className="table-wrap">
                  <table className="admin-table proctor-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Status</th>
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
                                  👁️ Review
                                </button>
                                {att.status === 'TERMINATED' && (
                                  <button className="btn btn-sm btn-warning" onClick={() => handleCancelTermination(att.id)}>
                                    🔄 Cancel Termination
                                  </button>
                                )}
                              </div>
                          </td>
                        </tr>
                      ))}
                      {attempts.length === 0 && (
                        <tr>
                          <td colSpan="5" className="text-center py-4 text-muted">
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

      {/* Audit/Terminate Modal */}
      {activeAudit && (
        <div className="modal-overlay fade-in">
          <div className="modal-card glass-panel bounce-in" style={{ maxWidth: '600px', textAlign: 'left' }}>
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border)', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>Candidate Audit: {activeAudit.student?.firstName} {activeAudit.student?.lastName}</h2>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{activeAudit.student?.email}</div>
            </div>

            <div className="audit-stats" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="badge badge-info text-lg">Status: {activeAudit.status}</div>
              <div className={`badge text-lg ${activeAudit.integrityScore < 50 ? 'badge-danger' : 'badge-success'}`}>
                Integrity: {activeAudit.integrityScore}%
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Violation Log</h3>
            <div className="audit-violations scroll-y" style={{ maxHeight: '200px', background: 'var(--bg-panel)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
              {activeAudit.violations && activeAudit.violations.length > 0 ? (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {activeAudit.violations.map((v) => (
                    <li key={v.id || Math.random()} style={{ padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                      <span className={`badge ${v.severity === 'CRITICAL' ? 'badge-danger' : 'badge-warning'}`} style={{ marginRight: '0.5rem' }}>
                        {v.severity}
                      </span>
                      <strong>{v.violationType}</strong> — {new Date(v.timestamp).toLocaleTimeString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-muted">No violations recorded. Candidate is in good standing.</div>
              )}
            </div>


              {activeAudit.status !== 'TERMINATED' && (
                <div className="audit-actions" style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1.25rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <h4 style={{ color: 'var(--danger)', marginBottom: '0.5rem' }}>🛑 Terminate Session</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    Force ending this session will log out the candidate and mark their attempt as TERMINATED.
                  </p>
                  <textarea
                    className="form-input form-textarea mb-3"
                    placeholder="Proctor notes / Reason for termination (Required)"
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
                <div className="modal-actions mt-4" style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button className="btn btn-danger" onClick={() => {
                    setIsTerminating(true);
                    handleTerminate(activeAudit.id).finally(() => setIsTerminating(false));
                  }} disabled={isTerminating}>
                    {isTerminating ? 'Terminating...' : 'Terminate'}
                  </button>
                    {/* Show Cancel Termination only if already terminated */}
                    {activeAudit.status === 'TERMINATED' && (
                      <button className="btn btn-warning" onClick={() => {
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
                  <button className="btn btn-secondary" onClick={() => { setActiveAudit(null); setTerminationNotes(''); }}>
                    Close Audit
                  </button>
                </div>
          </div>
        </div>
      )}
</div>
);
}
