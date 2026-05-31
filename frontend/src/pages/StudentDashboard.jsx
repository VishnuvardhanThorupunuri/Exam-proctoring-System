import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './StudentDashboard.css';

export default function StudentDashboard({ token, user, onLogout }) {
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Setup modal for hardware/permissions check
  const [selectedExam, setSelectedExam] = useState(null);
  const [webcamGranted, setWebcamGranted] = useState(null);
  const [micGranted, setMicGranted] = useState(null);
  const [permissionChecking, setPermissionChecking] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    fetchExams();
  }, [token]);

  const fetchExams = async () => {
    try {
      const res = await fetch('http://localhost:5000/api/exams', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load exams');
      const data = await res.json();
      setExams(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const requestHardwarePermissions = async () => {
    setPermissionChecking(true);
    setWebcamGranted(null);
    setMicGranted(null);
    try {
      // 1. Camera check
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoStream.getTracks().forEach((track) => track.stop());
      setWebcamGranted(true);

      // 2. Microphone check
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach((track) => track.stop());
      setMicGranted(true);
    } catch (err) {
      console.error('Hardware access error:', err);
      setWebcamGranted(false);
      setMicGranted(false);
    } finally {
      setPermissionChecking(false);
    }
  };

  const handleLaunchExam = async () => {
    if (!selectedExam) return;

    try {
      const res = await fetch('http://localhost:5000/api/attempts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ examId: selectedExam.id }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to initialize exam session');
      }

      const attempt = await res.json();

      // Request Fullscreen on entering
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        try { await elem.requestFullscreen(); } catch (e) { /* ignore */ }
      }

      // Route directly to exam workspace
      navigate(`/exam/${attempt.id || attempt._id}`);
    } catch (err) {
      alert(err.message);
    }
  };

  const PermissionStatus = ({ granted }) => {
    if (permissionChecking) return <span className="status-checking">⏳ Checking...</span>;
    if (granted === true) return <span className="status-ok">✅ OK</span>;
    if (granted === false) return <span className="status-fail">❌ BLOCKED</span>;
    return <span className="status-wait">—</span>;
  };

  return (
    <div className="student-dashboard bg-mesh">
      <header className="student-header glass-panel">
        <div className="header-brand">
          <span className="logo-icon floating">🛡️</span>
          <h1>Aegis Candidate Console</h1>
        </div>
        <div className="header-user">
          <div className="user-info">
            <span className="user-greeting">Welcome back,</span>
            <span className="user-name">{user?.firstName} {user?.lastName}</span>
          </div>
          {onLogout && <button className="btn btn-secondary btn-sm" onClick={onLogout}>Logout</button>}
        </div>
      </header>

      <main className="student-main fade-in-up">
        {error && (
          <div className="alert alert-error">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="dashboard-section">
          <h2 className="section-title">Your Scheduled Examinations</h2>
          <p className="section-subtitle">Review instructions and complete pre-flight checks before launching an exam.</p>

          {loading ? (
            <div className="student-empty-state">
              <div className="skeleton" style={{ height: '120px', borderRadius: '12px' }} />
              <div className="skeleton" style={{ height: '120px', borderRadius: '12px', marginTop: '1rem' }} />
            </div>
          ) : exams.length === 0 ? (
            <div className="student-empty-state glass-card">
              <div className="empty-emoji">📭</div>
              <h3>No Scheduled Exams</h3>
              <p>You currently have no examinations active or scheduled. Please contact your coordinator.</p>
              <button className="btn btn-secondary" onClick={fetchExams}>Refresh Data</button>
            </div>
          ) : (
            <div className="exams-grid">
              {exams.map((exam, i) => (
                <div key={exam.id} className={`exam-card glass-card fade-in-up delay-${(i%4)+1}`}>
                  <div className="exam-card-header">
                    <h3 className="exam-card-title">{exam.title}</h3>
                    <span className="badge badge-primary">{exam.durationMinutes} min</span>
                  </div>
                  <div className="exam-card-body">
                    <p className="exam-desc">{exam.description || 'No instructions provided.'}</p>
                    <div className="exam-meta">
                      <span className="meta-item">❓ {exam.questions?.length || 0} Questions</span>
                      <span className="meta-item">⚠️ {exam.maxWarningsAllowed ?? 3} Warnings Cap</span>
                    </div>
                  </div>
                  <div className="exam-card-footer">
                    <button
                      className="btn btn-primary"
                      onClick={() => { setSelectedExam(exam); requestHardwarePermissions(); }}
                    >
                      🚀 Launch Exam
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Permissions Hardware Modal */}
      {selectedExam && (
        <div className="modal-overlay fade-in">
          <div className="modal-card glass-panel bounce-in exam-modal" style={{ maxWidth: '520px', textAlign: 'left' }}>
            <h2 className="modal-title">📋 Exam Pre-Flight Check</h2>
            <p className="modal-subtitle">
              You are about to launch <strong style={{ color: 'var(--text-primary)' }}>{selectedExam.title}</strong>. 
              Online AI proctoring will monitor your workspace. Please pass hardware diagnostics below to unlock.
            </p>

            <div className="diagnostic-list">
              <div className="diagnostic-item glass-card">
                <div className="diag-info">
                  <span className="diag-icon">📷</span>
                  <div>
                    <div className="diag-name">Webcam Connection</div>
                    <div className="diag-desc">Required for facial and object analysis</div>
                  </div>
                </div>
                <PermissionStatus granted={webcamGranted} />
              </div>

              <div className="diagnostic-item glass-card">
                <div className="diag-info">
                  <span className="diag-icon">🎙️</span>
                  <div>
                    <div className="diag-name">Microphone Connection</div>
                    <div className="diag-desc">Required for environment audio checks</div>
                  </div>
                </div>
                <PermissionStatus granted={micGranted} />
              </div>
            </div>

            <div className="alert alert-warning" style={{ margin: '1.5rem 0' }}>
              <strong>⚠️ PROCTORING SANDBOX ENFORCEMENT</strong>
              <div style={{ marginTop: '0.25rem', fontSize: '0.8rem' }}>
                Ensure you are in a well-lit room, looking straight at the screen, with no cell phones or auxiliary books in frame.
              </div>
            </div>

            <div className="modal-actions" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
              <button
                className="btn btn-secondary"
                style={{ flex: 1 }}
                onClick={() => setSelectedExam(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                style={{ flex: 2 }}
                disabled={webcamGranted !== true || micGranted !== true}
                onClick={handleLaunchExam}
              >
                {webcamGranted === true && micGranted === true ? '🔒 Lock Screen & Begin' : 'Hardware Check Pending...'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
