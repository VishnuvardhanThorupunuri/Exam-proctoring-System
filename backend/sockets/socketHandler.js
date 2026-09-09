const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');
const violationService = require('../services/violationService');

const JWT_SECRET = process.env.JWT_SECRET || 'exam-proctoring-super-secret-key-12345!';

// ─── Main socket handler ──────────────────────────────────────────────────────
const socketHandler = (io) => {
  io.on('connection', (socket) => {
    // ── Authenticate the connecting socket via JWT ──────────────────────────
    const token = socket.handshake.auth?.token;
    let socketUser = null;

    if (token) {
      try {
        socketUser = jwt.verify(token, JWT_SECRET);
        console.log(`[SOCKET] Authenticated connection: user=${socketUser.id} role=${socketUser.role} socket=${socket.id}`);
      } catch (err) {
        console.warn(`[SOCKET] Invalid JWT on connect (socket=${socket.id}): ${err.message}`);
        // We don't force-disconnect here — unauthenticated sockets simply cannot emit violations
      }
    } else {
      console.log(`[SOCKET] Anonymous connection: socket=${socket.id}`);
    }

    // ── Student joins exam room ─────────────────────────────────────────────
    socket.on('student_join_exam', ({ attemptId, examId, studentName }) => {
      if (!attemptId || !examId) {
        console.warn(`[SOCKET] student_join_exam ignored — missing attemptId or examId (socket=${socket.id})`);
        return;
      }
      socket.join(`exam_${examId}`);
      socket.join(`attempt_${attemptId}`);
      const name = studentName || socketUser?.email || 'Unknown Candidate';
      console.log(`[SOCKET] Student "${name}" joined exam_${examId} / attempt_${attemptId}`);
    });

    // ── Proctor joins exam monitor room ─────────────────────────────────────
    socket.on('proctor_join_exam', ({ examId }) => {
      socket.join('proctor_global');
      if (examId) {
        socket.join(`exam_${examId}`);
      }
      const role = socketUser?.role || 'unknown';
      console.log(`[SOCKET] ${role} joined proctor monitor room (examId=${examId || 'global'})`);
    });

    // ── Centralized proctoring violation event handler ─────────────────────
    socket.on('proctoring:violation', async (rawPayload) => {
      try {
        const result = await violationService.processViolation({
          socketUser,
          rawPayload,
          io,
        });

        if (!result.success && result.reason) {
          socket.emit('proctoring:error', { message: result.reason });
        }
      } catch (err) {
        console.error(`[SOCKET] Error delegating violation event:`, err);
        socket.emit('proctoring:error', { message: 'Internal server error processing violation' });
      }
    });

    // ── Live candidate status update (hardware, network, socket state) ──────
    socket.on('student_status_update', (payload) => {
      if (!payload || !payload.examId) return;
      io.to(`exam_${payload.examId}`).emit('proctoring:student_status_changed', {
        attemptId: payload.attemptId,
        studentId: socketUser?.id || payload.studentId,
        cameraStatus: payload.cameraStatus,
        micStatus: payload.micStatus,
        networkStatus: payload.networkStatus,
        socketStatus: payload.socketStatus,
        timestamp: new Date().toISOString(),
      });
    });

    // ── Disconnect ──────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      console.log(`[SOCKET] Disconnected: socket=${socket.id} user=${socketUser?.id || 'anon'} reason=${reason}`);
    });
  });
};

module.exports = socketHandler;
