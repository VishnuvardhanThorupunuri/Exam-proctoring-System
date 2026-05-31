import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import * as faceapi from '@vladmandic/face-api';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
// NOTE: Do NOT import '@tensorflow/tfjs' separately — coco-ssd already includes it.
// Importing it twice causes hundreds of "kernel already registered" warnings.
import './ExamSession.css';

export default function ExamSession({ token, user }) {
  const { id: attemptId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [error, setError] = useState(null);
  const [timeUpOverlay, setTimeUpOverlay] = useState(false); // non-blocking time-up banner
  const [timeUpCount, setTimeUpCount] = useState(5);         // 5-second countdown on overlay
  const timerStartedRef = useRef(false);   // guards against autoSubmit firing on initial render
  const autoSubmittedRef = useRef(false);  // prevents double-submission
  const answersRef = useRef({});           // always holds the latest answers (avoids stale closure)
  const [cameraError, setCameraError] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null); // Store stream separately so it survives loading state
  const socketRef = useRef(null);
  const objectDetectorRef = useRef(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const WARNINGS_LIMIT = exam?.maxWarningsAllowed || 3;
  const [warningsCount, setWarningsCount] = useState(0);

  // ─── 1. Start camera immediately (before loading is done) ───────────────────
  // We request camera permissions ASAP and store the stream in a ref.
  // Once the video element renders (after loading=false), we attach it.
  useEffect(() => {
    let cancelled = false;
    const getCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        // If the video element already exists, attach immediately
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        if (!cancelled) setCameraError('Webcam access blocked. The exam cannot proceed.');
      }
    };
    getCamera();
    return () => { cancelled = true; };
  }, []);

  // ─── 2. Once loading finishes, attach stream to the video element ────────────
  useEffect(() => {
    if (!loading && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [loading]);

  // ─── 3. Fetch exam data ──────────────────────────────────────────────────────
  useEffect(() => {
    fetchExamData();
    loadModels();
  }, [attemptId, token]);

  const loadModels = async () => {
    try {
      await faceapi.nets.tinyFaceDetector.loadFromUri(
        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
      );
      objectDetectorRef.current = await cocoSsd.load();
      setModelsLoaded(true);
    } catch (err) {
      console.error('Failed to load AI models', err);
      // AI failing doesn't block the exam
    }
  };

  const fetchExamData = async () => {
    try {
      const res = await fetch(`https://exam-proctoring-system-vrbm.onrender.com/api/attempts/${attemptId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Attempt not found or unauthorized');
      const attempt = await res.json();

      const examRes = await fetch(`https://exam-proctoring-system-vrbm.onrender.com/api/exams/${attempt.examId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!examRes.ok) throw new Error('Failed to load exam data');
      const examData = await examRes.json();

      setExam(examData);

      if (attempt.status !== 'IN_PROGRESS') {
        setError(`This exam attempt is ${attempt.status}`);
        setLoading(false);
        return;
      }

      // ── Timer: use startedAt (the DB field name) then fall back to createdAt ──
      const rawStart = attempt.startedAt || attempt.createdAt || attempt.startTime;
      const startMs = rawStart ? new Date(rawStart).getTime() : Date.now();
      const nowMs = Date.now();
      const durationMins = Number(examData.durationMinutes);
      const durationMs = (Number.isFinite(durationMins) && durationMins > 0)
        ? durationMins * 60000
        : 60 * 60000; // fallback: 60 minutes if field is missing/NaN
      const remainingSecs = Math.max(1, Math.floor((startMs + durationMs - nowMs) / 1000));
      // Guard: if remainingSecs is somehow NaN (e.g. bad date), default to full duration
      setTimeLeft(Number.isFinite(remainingSecs) ? remainingSecs : durationMins * 60);

      const savedAnswers = attempt.answers || {};
      setAnswers(savedAnswers);
      answersRef.current = savedAnswers;
      initSocket(examData._id || examData.id);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const initSocket = (examId) => {
    socketRef.current = io('https://exam-proctoring-system-vrbm.onrender.com', { auth: { token } });
    socketRef.current.on('connect', () => {
      socketRef.current.emit('student_join_exam', { examId, attemptId });
    });
    socketRef.current.on('proctor_command', (cmd) => {
      if (cmd.action === 'TERMINATE') {
        if (!exitingRef.current) {
          exitingRef.current = true;
          alert('Your exam session has been terminated by the proctor.');
          stopHardwareAndExit();
        }
      }
    });
  };

  // ─── Keep answersRef in sync with latest answers (avoids stale closure in autoSubmit) ─
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // ─── 4. Timer countdown (setTimeout pattern — avoids interval teardown every second) ─
  useEffect(() => {
    // Guard: null means not yet loaded; NaN/<=0 means expired
    if (timeLeft === null || !Number.isFinite(timeLeft) || timeLeft <= 0) return;
    timerStartedRef.current = true;
    const t = setTimeout(() => setTimeLeft(prev =>
      (Number.isFinite(prev) && prev > 0) ? prev - 1 : 0
    ), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  // Auto-submit when the countdown reaches exactly 0
  useEffect(() => {
    if (timeLeft === 0 && timerStartedRef.current && !autoSubmittedRef.current) {
      autoSubmit();
    }
  }, [timeLeft]);

  // Overlay countdown after time-up (counts down 5→0 then exits)
  useEffect(() => {
    if (!timeUpOverlay) return;
    if (timeUpCount <= 0) { stopHardwareAndExit(); return; }
    const t = setTimeout(() => setTimeUpCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [timeUpOverlay, timeUpCount]);

  const exitingRef = useRef(false);

  // ─── 5. AI proctoring loop ───────────────────────────────────────────────────
  useEffect(() => {
    if (!modelsLoaded) return;
    const loop = setInterval(analyzeFrame, 3000);
    return () => clearInterval(loop);
  }, [modelsLoaded]);

  useEffect(() => {
    if (warningsCount > WARNINGS_LIMIT && !exitingRef.current) {
      exitingRef.current = true;
      alert('Maximum warnings exceeded. Your exam will be terminated.');
      handleTerminate('Auto-terminated by system: Maximum warnings exceeded');
    }
  }, [warningsCount, WARNINGS_LIMIT]);

  const reportViolation = (type, severity = 'WARNING') => {
    if (socketRef.current) {
      socketRef.current.emit('student_violation', { attemptId, violationType: type, severity });
    }
    if (severity !== 'CRITICAL') {
      setWarningsCount(prev => prev + 1);
    }
  };

  const analyzeFrame = async () => {
    if (!videoRef.current || videoRef.current.paused || videoRef.current.ended) return;
    try {
      const faces = await faceapi.detectAllFaces(
        videoRef.current,
        new faceapi.TinyFaceDetectorOptions()
      );
      if (faces.length === 0) reportViolation('No Face Detected', 'WARNING');
      else if (faces.length > 1) reportViolation('Multiple Persons Detected', 'CRITICAL');

      if (objectDetectorRef.current) {
        const predictions = await objectDetectorRef.current.detect(videoRef.current);
        const forbidden = predictions.filter(p =>
          ['cell phone', 'laptop', 'book'].includes(p.class)
        );
        if (forbidden.length > 0) {
          reportViolation(`Forbidden Object: ${forbidden[0].class}`, 'CRITICAL');
        }
      }
    } catch (e) {
      console.error('AI analysis error:', e);
    }
  };

  const handleTerminate = async (reason = 'Auto-terminated by system') => {
    try {
      await fetch(`https://exam-proctoring-system-vrbm.onrender.com/api/attempts/${attemptId}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'TERMINATED', proctorNotes: reason }),
      });
    } catch (e) { /* ignore */ }
    stopHardwareAndExit();
  };

  const autoSubmit = async () => {
    if (autoSubmittedRef.current) return;   // prevent double-fire
    autoSubmittedRef.current = true;
    setTimeUpOverlay(true);                 // show non-blocking overlay
    setSubmitting(true);
    try {
      const res = await fetch(`https://exam-proctoring-system-vrbm.onrender.com/api/attempts/${attemptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        // Use answersRef.current — always has the very latest answers regardless of closure age
        body: JSON.stringify({ answers: answersRef.current, status: 'COMPLETED' }),
      });
      if (!res.ok) throw new Error('Auto-submission failed');
      // Overlay will navigate away after its 5-second countdown finishes
    } catch (err) {
      console.error('Auto-submit error:', err);
      autoSubmittedRef.current = false;
      setSubmitting(false);
      setTimeUpOverlay(false);
    }
  };

  const handleSubmitExam = async (e, force = false) => {
    if (e) e.preventDefault();
    if (autoSubmittedRef.current) return;   // already auto-submitted
    if (!force && !window.confirm('Are you sure you want to submit your exam?')) return;
    autoSubmittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`https://exam-proctoring-system-vrbm.onrender.com/api/attempts/${attemptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: answersRef.current, status: 'COMPLETED' }),
      });
      if (!res.ok) throw new Error('Submission failed');
      stopHardwareAndExit();
    } catch (err) {
      alert(err.message);
      autoSubmittedRef.current = false;
      setSubmitting(false);
    }
  };

  const stopHardwareAndExit = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (e) {} }
    if (socketRef.current) socketRef.current.disconnect();
    navigate('/');
  };

  // ─── 6. Tab visibility detection ────────────────────────────────────────────
  useEffect(() => {
    const handleVis = () => {
      if (document.hidden) reportViolation('Tab switched or minimized', 'CRITICAL');
    };
    document.addEventListener('visibilitychange', handleVis);
    return () => document.removeEventListener('visibilitychange', handleVis);
  }, []);

  const handleAnswerSelect = (questionId, option) => {
    setAnswers(prev => ({ ...prev, [questionId]: option }));
  };

  const formatTime = (secs) => {
    if (secs === null) return '--:--';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const getQuestionOptions = (question) => {
    if (!question) return [];
    const opts = question.options;
    if (!opts) return [];
    if (Array.isArray(opts)) return opts;
    if (typeof opts === 'string') {
      try {
        const parsed = JSON.parse(opts);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        if (opts.includes(',')) {
          return opts.split(',').map(o => o.trim());
        }
        return [opts];
      }
    }
    return [];
  };


  // ─── Loading / Error states ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="exam-loading">
        <span className="spin text-primary">⌛</span>
        Loading Secure Workspace...
      </div>
    );
  }

  if (error) {
    return (
      <div className="exam-error bg-mesh">
        <div className="glass-card" style={{ maxWidth: 500, textAlign: 'center', margin: '100px auto' }}>
          <h2 className="text-danger mb-3">⚠️ Access Denied</h2>
          <p>{error}</p>
          <button className="btn btn-secondary mt-3" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  if (cameraError) {
    return (
      <div className="exam-error bg-mesh">
        <div className="glass-card" style={{ maxWidth: 500, textAlign: 'center', margin: '100px auto' }}>
          <h2 className="text-danger mb-3">📷 Camera Error</h2>
          <p>{cameraError}</p>
          <button className="btn btn-secondary mt-3" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  if (!exam || !exam.questions || exam.questions.length === 0) {
    return (
      <div className="exam-error bg-mesh">
        <div className="glass-card" style={{ maxWidth: 500, textAlign: 'center', margin: '100px auto' }}>
          <h2 className="text-danger mb-3">⚠️ No Questions</h2>
          <p>This exam has no questions configured. Please contact your administrator.</p>
          <button className="btn btn-secondary mt-3" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentQuestionIdx];

  const isWarningTime = Number.isFinite(timeLeft) && timeLeft > 0 && timeLeft <= 300; // ≤5 min
  const timerColor = timeLeft <= 60 ? 'var(--danger)' : timeLeft <= 300 ? '#f59e0b' : 'inherit';

  return (
    <div className="exam-workspace bg-mesh">

      {/* ── Time-Up Overlay (non-blocking, auto-navigates) ── */}
      {timeUpOverlay && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', textAlign: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏰</div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Time&apos;s Up!
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>
            Your exam has been automatically submitted.
          </p>
          <div style={{
            fontSize: '3.5rem', fontWeight: 900,
            color: '#f59e0b',
            background: 'rgba(245,158,11,0.15)',
            border: '2px solid rgba(245,158,11,0.4)',
            borderRadius: '50%', width: '80px', height: '80px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {timeUpCount}
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>
            Redirecting in {timeUpCount} second{timeUpCount !== 1 ? 's' : ''}…
          </p>
        </div>
      )}

      {/* ── Low-time warning banner ── */}
      {isWarningTime && !timeUpOverlay && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
          background: timeLeft <= 60
            ? 'rgba(239,68,68,0.9)'
            : 'rgba(245,158,11,0.85)',
          color: '#fff', textAlign: 'center',
          padding: '0.5rem 1rem', fontWeight: 700, fontSize: '0.95rem',
          backdropFilter: 'blur(4px)',
          animation: 'pulse 1.5s infinite',
        }}>
          {timeLeft <= 60
            ? `⚠️ Less than 1 minute remaining! — ${formatTime(timeLeft)}`
            : `⏳ Only ${Math.ceil(timeLeft / 60)} minutes left — ${formatTime(timeLeft)}`}
        </div>
      )}

      {/* Top Bar */}
      <header className="workspace-header glass-panel" style={{ marginTop: isWarningTime && !timeUpOverlay ? '2.5rem' : 0, transition: 'margin 0.3s' }}>
        <div className="exam-brand">
          <span className="exam-title">{exam.title}</span>
        </div>
        <div className="exam-controls">
          <div className="timer-badge glass-card" style={{ padding: '0.4rem 1rem', color: timerColor, fontWeight: 700, transition: 'color 0.5s' }}>
            <span className="timer-icon">⏱️</span> {formatTime(timeLeft)}
          </div>
          <button
            className="btn btn-success"
            onClick={handleSubmitExam}
            disabled={submitting}
          >
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </button>
        </div>
      </header>

      <div className="workspace-body">

        {/* Main Question Area */}
        <main className="workspace-main glass-panel fade-in-up">
          <div className="question-header">
            <h3>Question {currentQuestionIdx + 1} of {exam.questions.length}</h3>
            <span className="badge badge-primary">{currentQuestion.points} points</span>
          </div>

          <div className="question-text">
            {currentQuestion.questionText}
          </div>

          {currentQuestion.questionType === 'MCQ' && (
            <div className="options-list">
              {getQuestionOptions(currentQuestion).map((opt, i) => (
                <label
                  key={i}
                  className={`option-box ${answers[currentQuestion._id] === opt ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name={`q-${currentQuestion._id}`}
                    value={opt}
                    checked={answers[currentQuestion._id] === opt}
                    onChange={() => handleAnswerSelect(currentQuestion._id, opt)}
                    style={{ display: 'none' }}
                  />
                  <span className="option-marker">{String.fromCharCode(65 + i)}</span>
                  <span className="option-content">{opt}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.questionType !== 'MCQ' && (
            <textarea
              className="form-input form-textarea mt-3"
              placeholder="Type your answer here..."
              value={answers[currentQuestion._id] || ''}
              onChange={(e) => handleAnswerSelect(currentQuestion._id, e.target.value)}
              style={{ minHeight: '200px' }}
            />
          )}

          <div className="question-nav mt-4" style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
            <button
              className="btn btn-secondary"
              onClick={() => setCurrentQuestionIdx(i => Math.max(0, i - 1))}
              disabled={currentQuestionIdx === 0}
            >
              ← Previous
            </button>
            {currentQuestionIdx === exam.questions.length - 1 ? (
              <button
                className="btn btn-success"
                onClick={handleSubmitExam}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Exam'}
              </button>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => setCurrentQuestionIdx(i => Math.min(exam.questions.length - 1, i + 1))}
              >
                Next →
              </button>
            )}
          </div>
        </main>

        {/* Sidebar */}
        <aside className="workspace-sidebar">

          {/* Live Camera Feed */}
          <div className="proctor-feed glass-panel">
            <div className="feed-header">
              <h4>📷 Your Camera</h4>
              {modelsLoaded
                ? <span className="status-dot active" title="AI Proctoring Active" />
                : <span className="status-dot warning" title="Loading AI..." />
              }
            </div>
            <div className="feed-video-wrap">
              {/* video element — stream is attached via ref after loading */}
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="proctor-video"
              />
            </div>
            <div className="feed-status mt-2">
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Warnings: {warningsCount} / {WARNINGS_LIMIT}
              </div>
              <div style={{ width: '100%', height: '4px', background: 'var(--bg-panel)', borderRadius: '2px', marginTop: '0.25rem' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, (warningsCount / WARNINGS_LIMIT) * 100)}%`,
                    background: warningsCount === 0 ? 'var(--success)' : 'var(--danger)',
                    transition: 'width 0.3s',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Question Navigator */}
          <div className="question-palette glass-panel mt-3 fade-in-up delay-2">
            <h4 style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>Question Navigator</h4>
            <div className="palette-grid">
              {exam.questions.map((q, idx) => (
                <button
                  key={idx}
                  className={`palette-btn ${answers[q._id] ? 'answered' : ''} ${idx === currentQuestionIdx ? 'current' : ''}`}
                  onClick={() => setCurrentQuestionIdx(idx)}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            <div className="palette-legend mt-3">
              <span className="legend-item"><div className="legend-box answered" /> Answered</span>
              <span className="legend-item"><div className="legend-box current" /> Current</span>
            </div>
          </div>

        </aside>
      </div>
    </div>
  );
}
