import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import * as faceapi from '@vladmandic/face-api';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { API_BASE_URL } from '../config';
import { getViolationDisplayName } from '../utils/violationUtils';
import './ExamSession.css';

export default function ExamSession({ token, user }) {
  const { id: attemptId } = useParams();
  const navigate = useNavigate();

  // Exam and attempt state
  const [exam, setExam] = useState(null);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(null);
  const [error, setError] = useState(null);

  // Overlay and navigation guards
  const [autoSubmitReason, setAutoSubmitReason] = useState(null); // 'TIME_UP' | 'MAX_WARNINGS' | null
  const [autoSubmitCount, setAutoSubmitCount] = useState(6);
  const timerStartedRef = useRef(false);
  const autoSubmittedRef = useRef(false);
  const answersRef = useRef({});
  const exitingRef = useRef(false);
  const [cameraError, setCameraError] = useState(null);

  // Responsive Live Telemetry UI State
  const [networkStatus, setNetworkStatus] = useState(navigator.onLine ? 'online' : 'offline');
  const [cameraStatus, setCameraStatus] = useState('active');
  const [micStatus, setMicStatus] = useState('active');
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [activeWarning, setActiveWarning] = useState(null);

  // Continuous Responsiveness Monitoring State
  const [faceStatusText, setFaceStatusText] = useState('Checking...');
  const [faceCountText, setFaceCountText] = useState(0);
  const [monitoringStatusText, setMonitoringStatusText] = useState('Active');

  // Media & AI References
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const socketRef = useRef(null);
  const objectDetectorRef = useRef(null);
  const aiIntervalRef = useRef(null);
  const isProcessingRef = useRef(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Sustained Detection Buffers & Cooldown Tracker
  const noFaceFrameCountRef = useRef(0);
  const multiFaceFrameCountRef = useRef(0);
  const phoneFrameCountRef = useRef(0);
  const bookFrameCountRef = useRef(0);
  const tabletFrameCountRef = useRef(0);
  const cooldownsRef = useRef({});

  // Browser State Guards
  const isTabHiddenRef = useRef(false);
  const tabSwitchCountRef = useRef(0);
  const isFullscreenExitRef = useRef(false);

  const WARNINGS_LIMIT = exam?.maxWarningsAllowed || 3;
  const [warningsCount, setWarningsCount] = useState(0);

  // ─── 1. Helper: Display Temporary Student Warning Banner ───────────────────
  const showStudentWarning = (message, type = 'warning', duration = 4000) => {
    setActiveWarning({ message, type });
    setTimeout(() => {
      setActiveWarning(prev => (prev?.message === message ? null : prev));
    }, duration);
  };

  // ─── 2. Helper: Client-Side Cooldown Check ─────────────────────────────────
  const isClientCoolingDown = (type, durationMs = 8000) => {
    const now = Date.now();
    const last = cooldownsRef.current[type] || 0;
    if (now - last < durationMs) return true;
    cooldownsRef.current[type] = now;
    return false;
  };

  // ─── Helper: Canvas Snapshot Capture for Violation Evidence ──────────
  const captureWebcamSnapshot = () => {
    try {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(video.videoWidth, 640);
      canvas.height = Math.min(video.videoHeight, 480);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.6); // Compressed JPEG base64 Data URL
    } catch (err) {
      console.warn('Snapshot capture error:', err);
      return null;
    }
  };

  // ─── 3. Helper: Report Standard Violation to Server ────────────────────────
  const reportViolation = (type, severity = 'LOW', confidence = 1.0, metadata = {}) => {
    if (!attemptId || !exam) return;
    
    // Check client-side cooldown to avoid duplicate event flooding
    if (isClientCoolingDown(type, 6000)) return;

    // Capture compressed webcam frame evidence for confirmed violation
    const snapshotData = captureWebcamSnapshot();
    const violationName = getViolationDisplayName(type);

    const payload = {
      attemptId,
      examId: exam._id || exam.id,
      studentId: user?.id || user?._id,
      type,
      violationType: type,
      violationName,
      displayName: violationName,
      severity,
      confidence,
      timestamp: new Date().toISOString(),
      metadata,
      snapshotData,
    };

    // Emit live event over WebSocket
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('proctoring:violation', payload);
    }

    // Always call HTTP REST fallback endpoint to guarantee MongoDB persistence
    fetch(`${API_BASE_URL}/api/attempts/${attemptId}/violations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    }).catch(err => console.warn('HTTP violation sync fallback error:', err));

    // Trigger candidate UI warnings with friendly violation names
    const warningText = {
      NO_FACE: '⚠️ Face not detected — Please face your camera',
      MULTIPLE_FACES: `🚨 Multiple faces detected (${metadata.numberOfFaces || 2})`,
      PHONE_DETECTED: '🚨 Mobile phone detected — Prohibited item!',
      BOOK_DETECTED: '⚠️ Book / Study material detected in view',
      TABLET_DETECTED: '🚨 Tablet / Secondary device detected in view',
      TAB_SWITCH: '⚠️ Tab switch detected! Stay on the exam page',
      FULLSCREEN_EXIT: '⚠️ Fullscreen mode exited — Please re-enable fullscreen',
      CAMERA_DISCONNECTED: '📷 Camera disconnected or obstructed!',
      MICROPHONE_DISCONNECTED: '🎙️ Microphone disconnected!',
      NETWORK_DISCONNECTED: '📡 Network connection lost — reconnecting...',
    }[type] || `⚠️ ${violationName} detected`;

    showStudentWarning(warningText, severity === 'LOW' ? 'warning' : 'danger');

    if (severity === 'HIGH' || severity === 'MEDIUM' || severity === 'CRITICAL') {
      setWarningsCount(prev => prev + 1);
    }
  };

  // ─── 4. Helper: Send Candidate Telemetry Status Update ──────────────────────
  const sendStatusUpdate = (overrideState = {}) => {
    if (!socketRef.current || !socketRef.current.connected || !exam) return;
    socketRef.current.emit('student_status_update', {
      attemptId,
      examId: exam._id || exam.id,
      studentId: user?.id || user?._id,
      cameraStatus: overrideState.cameraStatus || cameraStatus,
      micStatus: overrideState.micStatus || micStatus,
      networkStatus: overrideState.networkStatus || networkStatus,
      socketStatus: overrideState.socketStatus || socketStatus,
    });
  };

  // ─── 5. Start Media Stream (Camera & Microphone Diagnostics) ────────────────
  useEffect(() => {
    let cancelled = false;

    const startMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        // Camera track monitoring
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          videoTracks[0].onended = () => {
            setCameraStatus('disconnected');
            reportViolation('CAMERA_DISCONNECTED', 'HIGH', 1.0);
            sendStatusUpdate({ cameraStatus: 'disconnected' });
          };
          videoTracks[0].onmute = () => {
            setCameraStatus('disconnected');
            reportViolation('CAMERA_DISCONNECTED', 'HIGH', 1.0);
          };
          videoTracks[0].onunmute = () => {
            setCameraStatus('active');
            sendStatusUpdate({ cameraStatus: 'active' });
          };
        }

        // Audio track monitoring
        const audioTracks = stream.getAudioTracks();
        if (audioTracks.length > 0) {
          audioTracks[0].onended = () => {
            setMicStatus('disconnected');
            reportViolation('MICROPHONE_DISCONNECTED', 'MEDIUM', 1.0);
            sendStatusUpdate({ micStatus: 'disconnected' });
          };
          audioTracks[0].onmute = () => {
            setMicStatus('disconnected');
            reportViolation('MICROPHONE_DISCONNECTED', 'MEDIUM', 1.0);
          };
          audioTracks[0].onunmute = () => {
            setMicStatus('active');
            sendStatusUpdate({ micStatus: 'active' });
          };
        }

        streamRef.current = stream;
        setCameraStatus('active');
        setMicStatus('active');

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        if (!cancelled) {
          setCameraError('Webcam/Microphone access blocked. Proctored exam cannot proceed.');
          setCameraStatus('disconnected');
          setMicStatus('disconnected');
        }
      }
    };

    startMedia();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Attach stream to video element when component finishes loading
  useEffect(() => {
    if (!loading && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [loading]);

  // ─── 6. Network Online/Offline Handlers ─────────────────────────────────────
  useEffect(() => {
    const handleOnline = () => {
      setNetworkStatus('online');
      showStudentWarning('🟢 Connection restored — syncing progress...', 'success', 3000);
      sendStatusUpdate({ networkStatus: 'online' });

      // Auto-sync draft answers stored in localStorage during offline period
      const savedDraft = localStorage.getItem(`exam_draft_${attemptId}`);
      if (savedDraft) {
        try {
          const draftAnswers = JSON.parse(savedDraft);
          fetch(`${API_BASE_URL}/api/attempts/${attemptId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ answers: draftAnswers, status: 'IN_PROGRESS' }),
          }).catch(err => console.error('Offline sync error:', err));
        } catch (e) { /* ignore */ }
      }
    };

    const handleOffline = () => {
      setNetworkStatus('offline');
      reportViolation('NETWORK_DISCONNECTED', 'LOW', 1.0);
      sendStatusUpdate({ networkStatus: 'offline' });
      // Protect unsaved answers in localStorage
      localStorage.setItem(`exam_draft_${attemptId}`, JSON.stringify(answersRef.current));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [attemptId, token, exam]);

  // ─── 7. Load AI Models & Fetch Exam Details ────────────────────────────────
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
      console.error('Failed to load Edge AI models:', err);
    }
  };

  const fetchExamData = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/attempts/${attemptId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Attempt not found or unauthorized');
      const attempt = await res.json();

      const examRes = await fetch(`${API_BASE_URL}/api/exams/${attempt.examId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!examRes.ok) throw new Error('Failed to load exam data');
      const examData = await examRes.json();

      setExam(examData);

      if (attempt.status !== 'IN_PROGRESS') {
        setError(`This exam attempt is ${attempt.status.toLowerCase()}`);
        setLoading(false);
        return;
      }

      // Calculate time remaining based on startedAt
      const rawStart = attempt.startedAt || attempt.createdAt;
      const startMs = rawStart ? new Date(rawStart).getTime() : Date.now();
      const nowMs = Date.now();
      const durationMins = Number(examData.durationMinutes) || 60;
      const durationMs = durationMins * 60000;
      const remainingSecs = Math.max(1, Math.floor((startMs + durationMs - nowMs) / 1000));
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

  // ─── 8. Socket.io Connection & Event Telemetry ──────────────────────────────
  const initSocket = (examId) => {
    if (socketRef.current) socketRef.current.disconnect();

    const socket = io(API_BASE_URL, { auth: { token } });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketStatus('connected');
      const studentName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Candidate';
      socket.emit('student_join_exam', { examId, attemptId, studentName });
      sendStatusUpdate({ socketStatus: 'connected' });
    });

    socket.on('disconnect', (reason) => {
      setSocketStatus('disconnected');
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    socket.on('reconnect_attempt', () => {
      setSocketStatus('reconnecting');
    });

    socket.on('proctor_command', (cmd) => {
      if (cmd.action === 'TERMINATE') {
        if (!exitingRef.current) {
          exitingRef.current = true;
          alert('Your exam session has been terminated by the proctor.');
          stopHardwareAndExit();
        }
      }
    });

    socket.on('exam_force_terminated', (data) => {
      if (!exitingRef.current) {
        exitingRef.current = true;
        alert(data.reason || 'Your exam session has been force-terminated by the system.');
        stopHardwareAndExit();
      }
    });
  };

  // Sync answersRef with React answers state
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  // ─── 9. Exam Countdown Timer & Auto-Submit ──────────────────────────────────
  useEffect(() => {
    if (timeLeft === null || !Number.isFinite(timeLeft) || timeLeft <= 0) return;
    timerStartedRef.current = true;
    const t = setTimeout(() => setTimeLeft(prev => (Number.isFinite(prev) && prev > 0 ? prev - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  useEffect(() => {
    if (timeLeft === 0 && timerStartedRef.current && !autoSubmittedRef.current) {
      autoSubmit('TIME_UP');
    }
  }, [timeLeft]);

  useEffect(() => {
    if (!autoSubmitReason) return;
    if (autoSubmitCount <= 0) { stopHardwareAndExit(); return; }
    const t = setTimeout(() => setAutoSubmitCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [autoSubmitReason, autoSubmitCount]);

  // ─── 10. Responsive AI Vision Frame Processing Loop (500ms with isProcessing Lock) ─
  useEffect(() => {
    if (!modelsLoaded) return;

    // Responsive 500ms loop with non-overlapping execution lock
    aiIntervalRef.current = setInterval(() => {
      if (!isProcessingRef.current) {
        runInference();
      }
    }, 500);

    return () => {
      if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    };
  }, [modelsLoaded, exam]);

  const runInference = async () => {
    const video = videoRef.current;
    
    // Video Pipeline Readiness Guard: Ensure video element is loaded and producing frames
    if (
      !video ||
      video.paused ||
      video.ended ||
      video.readyState < 2 ||
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      return;
    }

    isProcessingRef.current = true;

    try {
      // ── A. Responsive Face Detection ────────────────────────────────────────
      // Use higher resolution inputSize (320) and lower initial candidate threshold (0.35)
      // to capture natural head angles, lighting shifts, and glancing down while typing.
      const faces = await faceapi.detectAllFaces(
        video,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.35 })
      );

      // Filter candidate detections to reject tiny background noise or false positive artifacts
      const validFaces = faces.filter(f => {
        const score = f.score || f.detection?.score || 0;
        const box = f.box || f.detection?.box;
        if (!box) return score >= 0.35;
        return score >= 0.35 && box.width >= 30 && box.height >= 30;
      });

      const faceCount = validFaces.length;
      setFaceCountText(faceCount);

      if (faceCount === 1) {
        // STATE: ONE_FACE (NORMAL)
        setFaceStatusText('Detected (1 Face)');
        setMonitoringStatusText('Active Protocol');
        noFaceFrameCountRef.current = 0;
        multiFaceFrameCountRef.current = 0;
      } else if (faceCount === 0) {
        // STATE: FACE_CHECKING -> NO_FACE (SUSPECTED -> CONFIRMED)
        setFaceStatusText('Checking Face Presence...');
        noFaceFrameCountRef.current += 1;

        if (noFaceFrameCountRef.current < 6) {
          // Sustained absence: require ~3 seconds (6 consecutive frames @ 500ms)
          setMonitoringStatusText('Verifying Face Presence...');
        } else {
          // Sustained absence >= 6 consecutive frames (~3 seconds continuous) -> Confirmed NO_FACE
          setMonitoringStatusText('⚠️ Face Not Detected');
          reportViolation('NO_FACE', 'MEDIUM', 0.90, { durationSec: 3, state: 'NO_FACE' });
          noFaceFrameCountRef.current = 0;
        }
      } else if (faceCount >= 2) {
        // STATE: MULTIPLE_FACES
        setFaceStatusText(`Detected (${faceCount} Faces)`);
        setMonitoringStatusText('Checking Multiple Faces...');
        multiFaceFrameCountRef.current += 1;

        if (multiFaceFrameCountRef.current >= 3) {
          // Require 3 consecutive frames (~1.5 seconds) to confirm multiple faces
          setMonitoringStatusText('🚨 Multiple Faces Detected');
          reportViolation('MULTIPLE_FACES', 'HIGH', 0.95, { numberOfFaces: faceCount, state: 'MULTIPLE_FACES' });
          multiFaceFrameCountRef.current = 0;
        }
      }

      // ── B. Normalized Object Detection (COCO-SSD) ──────────────────────────
      if (objectDetectorRef.current) {
        const predictions = await objectDetectorRef.current.detect(video);

        predictions.forEach(p => {
          const score = Math.round((p.score || 0) * 100) / 100;
          if (score < 0.50) return; // Responsive confidence threshold (>= 50%)

          const detectedClass = (p.class || '').toLowerCase().trim();

          // Prohibited items detection
          if (detectedClass === 'cell phone' || detectedClass === 'mobile phone' || detectedClass === 'phone') {
            phoneFrameCountRef.current += 1;
            if (phoneFrameCountRef.current >= 2) {
              setMonitoringStatusText('🚨 Mobile Phone Detected');
              reportViolation('PHONE_DETECTED', 'HIGH', score, { detectedObject: 'Mobile phone', confidence: score });
              phoneFrameCountRef.current = 0;
            }
          } else if (detectedClass === 'book') {
            bookFrameCountRef.current += 1;
            if (bookFrameCountRef.current >= 2) {
              setMonitoringStatusText('⚠️ Book / Notes Detected');
              reportViolation('BOOK_DETECTED', 'MEDIUM', score, { detectedObject: 'Book', confidence: score });
              bookFrameCountRef.current = 0;
            }
          } else if (detectedClass === 'tablet' || detectedClass === 'ipad') {
            tabletFrameCountRef.current += 1;
            if (tabletFrameCountRef.current >= 2) {
              setMonitoringStatusText('🚨 Tablet Detected');
              reportViolation('TABLET_DETECTED', 'HIGH', score, { detectedObject: 'Tablet', confidence: score });
              tabletFrameCountRef.current = 0;
            }
          }
        });
      }
    } catch (e) {
      console.error('AI inference error:', e);
    } finally {
      isProcessingRef.current = false;
    }
  };

  // ─── 11. Browser Visibility & Fullscreen Telemetry ───────────────────────────
  useEffect(() => {
    const handleVis = () => {
      if (document.hidden) {
        if (!isTabHiddenRef.current) {
          isTabHiddenRef.current = true;
          tabSwitchCountRef.current += 1;
          setMonitoringStatusText('⚠️ Tab Switch Detected');
          reportViolation('TAB_SWITCH', 'MEDIUM', 1.0, { count: tabSwitchCountRef.current });
        }
      } else {
        isTabHiddenRef.current = false;
      }
    };

    const handleFullscreen = () => {
      const isFull = !!document.fullscreenElement;
      setIsFullscreen(isFull);
      if (!isFull) {
        if (!isFullscreenExitRef.current) {
          isFullscreenExitRef.current = true;
          setMonitoringStatusText('⚠️ Fullscreen Exited');
          reportViolation('FULLSCREEN_EXIT', 'MEDIUM', 1.0);
        }
      } else {
        isFullscreenExitRef.current = false;
      }
    };

    document.addEventListener('visibilitychange', handleVis);
    document.addEventListener('fullscreenchange', handleFullscreen);

    return () => {
      document.removeEventListener('visibilitychange', handleVis);
      document.removeEventListener('fullscreenchange', handleFullscreen);
    };
  }, [exam]);

  // Request Fullscreen helper
  const requestFullscreenMode = () => {
    try {
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch (e) { /* ignore */ }
  };

  // ─── 12. Periodic Draft Auto-Save ───────────────────────────────────────────
  useEffect(() => {
    if (!attemptId || !token || loading) return;
    const saveInterval = setInterval(() => {
      if (answersRef.current && Object.keys(answersRef.current).length > 0 && !autoSubmittedRef.current) {
        fetch(`${API_BASE_URL}/api/attempts/${attemptId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ answers: answersRef.current, status: 'IN_PROGRESS' }),
        }).catch(err => console.error('Draft auto-save error:', err));
      }
    }, 15000);
    return () => clearInterval(saveInterval);
  }, [attemptId, token, loading]);

  // ─── 13. Submissions & Teardown ─────────────────────────────────────────────
  const autoSubmit = async (reason = 'TIME_UP') => {
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    setAutoSubmitReason(reason);
    setAutoSubmitCount(reason === 'MAX_WARNINGS' ? 6 : 5);
    setSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/api/attempts/${attemptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: answersRef.current, status: 'COMPLETED' }),
      });
      localStorage.removeItem(`exam_draft_${attemptId}`);
    } catch (err) {
      console.error('Auto-submit error:', err);
      autoSubmittedRef.current = false;
      setSubmitting(false);
      setAutoSubmitReason(null);
    }
  };

  // ─── 14. Auto-Submit when Warnings Reach Maximum Limit ─────────────────────
  useEffect(() => {
    if (exam && warningsCount >= WARNINGS_LIMIT && !autoSubmittedRef.current && !exitingRef.current) {
      exitingRef.current = true;
      showStudentWarning(`🚨 Maximum warning threshold reached (${warningsCount}/${WARNINGS_LIMIT})! Submitting exam...`, 'danger', 6000);
      autoSubmit('MAX_WARNINGS');
    }
  }, [warningsCount, WARNINGS_LIMIT, exam]);

  const handleSubmitExam = async (e, force = false) => {
    if (e) e.preventDefault();
    if (autoSubmittedRef.current) return;
    if (!force && !window.confirm('Are you sure you want to submit your exam?')) return;
    
    autoSubmittedRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/attempts/${attemptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ answers: answersRef.current, status: 'COMPLETED' }),
      });
      if (!res.ok) throw new Error('Submission failed');
      localStorage.removeItem(`exam_draft_${attemptId}`);
      stopHardwareAndExit();
    } catch (err) {
      alert(err.message);
      autoSubmittedRef.current = false;
      setSubmitting(false);
    }
  };

  const stopHardwareAndExit = () => {
    if (aiIntervalRef.current) clearInterval(aiIntervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
    if (document.fullscreenElement) {
      try { document.exitFullscreen(); } catch (e) {}
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    navigate('/');
  };
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

  // ─── Render UI ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="exam-loading">
        <span className="spin text-primary">⌛</span>
        Initializing Live Proctoring Workspace...
      </div>
    );
  }

  if (error || cameraError) {
    return (
      <div className="exam-error bg-mesh">
        <div className="glass-card" style={{ maxWidth: 500, textAlign: 'center', margin: '100px auto' }}>
          <h2 className="text-danger mb-3">⚠️ Session Access Blocked</h2>
          <p>{error || cameraError}</p>
          <button className="btn btn-secondary mt-3" onClick={() => navigate(-1)}>Return to Dashboard</button>
        </div>
      </div>
    );
  }

  if (!exam || !exam.questions || exam.questions.length === 0) {
    return (
      <div className="exam-error bg-mesh">
        <div className="glass-card" style={{ maxWidth: 500, textAlign: 'center', margin: '100px auto' }}>
          <h2 className="text-danger mb-3">⚠️ Empty Exam</h2>
          <p>This exam has no questions configured. Please contact your proctor.</p>
          <button className="btn btn-secondary mt-3" onClick={() => navigate(-1)}>Go Back</button>
        </div>
      </div>
    );
  }

  const currentQuestion = exam.questions[currentQuestionIdx];
  const isWarningTime = Number.isFinite(timeLeft) && timeLeft > 0 && timeLeft <= 300;
  const timerColor = timeLeft <= 60 ? 'var(--danger)' : timeLeft <= 300 ? '#f59e0b' : 'inherit';

  return (
    <div className="exam-workspace bg-mesh">

      {/* ── Time-Up Overlay ── */}
      {autoSubmitReason === 'TIME_UP' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', textAlign: 'center',
          backdropFilter: 'blur(8px)',
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>⏰</div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>Time&apos;s Up!</h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem' }}>Your examination duration has elapsed and your answers have been automatically submitted.</p>
          <div style={{
            fontSize: '3.5rem', fontWeight: 900, color: '#f59e0b',
            background: 'rgba(245,158,11,0.15)', border: '2px solid rgba(245,158,11,0.4)',
            borderRadius: '50%', width: '80px', height: '80px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {autoSubmitCount}
          </div>
          <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'rgba(255,255,255,0.5)' }}>
            Redirecting to dashboard in {autoSubmitCount} second{autoSubmitCount !== 1 ? 's' : ''}…
          </p>
          <button
            className="btn btn-primary mt-4"
            onClick={stopHardwareAndExit}
          >
            Return to Candidate Dashboard Now
          </button>
        </div>
      )}

      {/* ── Max Warnings Overlay ── */}
      {autoSubmitReason === 'MAX_WARNINGS' && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.88)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#fff', textAlign: 'center',
          backdropFilter: 'blur(8px)',
          padding: '2rem'
        }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🚨</div>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem', color: '#ef4444' }}>
            Maximum Warning Threshold Exceeded
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.7)', marginBottom: '1.5rem', maxWidth: '500px' }}>
            Your exam session has been terminated due to multiple proctoring rule violations.
          </p>

          <div style={{ width: '100%', maxWidth: '400px', margin: '0 auto 1.5rem', textAlign: 'left' }}>
            <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="summary-label">🔒 Session Status</span>
              <span className="summary-value" style={{ color: '#ef4444', fontWeight: 700 }}>
                TERMINATED & SUBMITTED
              </span>
            </div>
            <div className="summary-row" style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="summary-label">💾 Saved Progress</span>
              <span className="summary-value" style={{ color: '#10b981', fontWeight: 600 }}>
                Answers Saved & Synced
              </span>
            </div>
          </div>

          <div className="max-warnings-notice alert alert-warning" style={{ background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', padding: '0.75rem 1rem', borderRadius: '8px', marginBottom: '1.5rem', maxWidth: '500px' }}>
            <span>ℹ️</span> All proctoring logs and recorded telemetry evidence have been saved for proctor review.
          </div>

          <div className="max-warnings-countdown-wrap" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <div className="max-warnings-ring" style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ef4444' }}>
              {autoSubmitCount}
            </div>
            <p className="max-warnings-redirect-text" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
              Auto-redirecting in {autoSubmitCount} second{autoSubmitCount !== 1 ? 's' : ''}…
            </p>
          </div>

          <button
            className="btn btn-primary btn-lg max-warnings-exit-btn"
            style={{ padding: '0.75rem 2rem', fontWeight: 700 }}
            onClick={stopHardwareAndExit}
          >
            Return to Candidate Dashboard Now
          </button>
        </div>
      )}

      {/* ── Live Warning / Notification Banner ── */}
      {activeWarning && (
        <div style={{
          position: 'fixed', top: '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 9000,
          background: activeWarning.type === 'danger' ? 'rgba(239, 68, 68, 0.95)' : activeWarning.type === 'success' ? 'rgba(16, 185, 129, 0.95)' : 'rgba(245, 158, 11, 0.95)',
          color: '#fff', padding: '0.6rem 1.5rem', borderRadius: '30px', fontWeight: 700,
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)', animation: 'bounce-in 0.3s',
        }}>
          {activeWarning.message}
        </div>
      )}

      {/* ── Fullscreen Exit Prompt Banner ── */}
      {!isFullscreen && (
        <div style={{
          position: 'fixed', top: activeWarning ? '65px' : '15px', left: '50%', transform: 'translateX(-50%)', zIndex: 8900,
          background: 'rgba(239, 68, 68, 0.90)', color: '#fff', padding: '0.5rem 1.25rem', borderRadius: '8px',
          display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.85rem', fontWeight: 600,
        }}>
          <span>⚠️ You are not in fullscreen mode!</span>
          <button className="btn btn-sm btn-secondary" onClick={requestFullscreenMode} style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
            Return to Fullscreen
          </button>
        </div>
      )}

      {/* ── Low Time Warning Banner ── */}
      {isWarningTime && !autoSubmitReason && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
          background: timeLeft <= 60 ? 'rgba(239,68,68,0.9)' : 'rgba(245,158,11,0.85)',
          color: '#fff', textAlign: 'center', padding: '0.4rem 1rem', fontWeight: 700, fontSize: '0.9rem',
        }}>
          {timeLeft <= 60
            ? `⚠️ Less than 1 minute remaining! — ${formatTime(timeLeft)}`
            : `⏳ ${Math.ceil(timeLeft / 60)} minutes left — ${formatTime(timeLeft)}`}
        </div>
      )}

      {/* Top Header */}
      <header className="workspace-header glass-panel" style={{ marginTop: isWarningTime && !autoSubmitReason ? '2.5rem' : 0 }}>
        <div className="exam-brand">
          <span className="exam-title">{exam.title}</span>
        </div>

        {/* Real-time Telemetry Status Badges */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.75rem' }}>
          <span className={`badge ${networkStatus === 'online' ? 'badge-success' : 'badge-danger'}`} title="Network Connectivity">
            🌐 {networkStatus}
          </span>
          <span className={`badge ${cameraStatus === 'active' ? 'badge-success' : 'badge-danger'}`} title="Camera Status">
            📷 {cameraStatus}
          </span>
          <span className={`badge ${micStatus === 'active' ? 'badge-success' : 'badge-warning'}`} title="Microphone Status">
            🎙️ {micStatus}
          </span>
        </div>

        <div className="exam-controls">
          <div className="timer-badge glass-card" style={{ padding: '0.4rem 1rem', color: timerColor, fontWeight: 700 }}>
            <span className="timer-icon">⏱️</span> {formatTime(timeLeft)}
          </div>
          <button className="btn btn-success" onClick={handleSubmitExam} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Exam'}
          </button>
        </div>
      </header>

      <div className="workspace-body">
        {/* Main Question Workspace */}
        <main className="workspace-main glass-panel fade-in-up">
          <div className="question-header">
            <h3>Question {currentQuestionIdx + 1} of {exam.questions.length}</h3>
            <span className="badge badge-primary">{currentQuestion.points} points</span>
          </div>

          <div className="question-text">{currentQuestion.questionText}</div>

          {currentQuestion.questionType === 'MCQ' && (
            <div className="options-list">
              {getQuestionOptions(currentQuestion).map((opt, i) => (
                <label key={i} className={`option-box ${answers[currentQuestion._id] === opt ? 'selected' : ''}`}>
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
              <button className="btn btn-success" onClick={handleSubmitExam} disabled={submitting}>
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

        {/* Sidebar Feed & Navigation */}
        <aside className="workspace-sidebar">
          {/* Live Camera Feed */}
          <div className="proctor-feed glass-panel">
            <div className="feed-header">
              <h4>📷 Live Monitor Feed</h4>
              {modelsLoaded ? (
                <span className="status-dot active" title="AI Proctoring Active" />
              ) : (
                <span className="status-dot warning" title="Loading AI Models..." />
              )}
            </div>

            <div className="feed-video-wrap">
              <video ref={videoRef} autoPlay muted playsInline className="proctor-video" />
            </div>

            {/* Continuous Responsiveness Telemetry Display */}
            <div className="live-telemetry-panel mt-2 p-2" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '6px', fontSize: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span className="text-muted">Camera:</span>
                <span style={{ fontWeight: 600, color: cameraStatus === 'active' ? 'var(--success)' : 'var(--danger)' }}>
                  {cameraStatus === 'active' ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span className="text-muted">Face:</span>
                <span style={{ fontWeight: 600, color: faceStatusText === 'Detected' ? 'var(--success)' : 'var(--warning)' }}>
                  {faceStatusText}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                <span className="text-muted">Faces:</span>
                <span style={{ fontWeight: 700, color: faceCountText === 1 ? 'var(--success)' : faceCountText === 0 ? 'var(--warning)' : 'var(--danger)' }}>
                  {faceCountText}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="text-muted">Monitoring:</span>
                <span style={{ fontWeight: 600, color: monitoringStatusText.includes('⚠️') || monitoringStatusText.includes('🚨') || monitoringStatusText.includes('Detected') ? 'var(--danger)' : 'var(--primary)' }}>
                  {monitoringStatusText}
                </span>
              </div>
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
