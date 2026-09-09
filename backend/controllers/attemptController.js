const crypto = require('crypto');
const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');
const Exam = require('../models/Exam');
const User = require('../models/User');

// Attempts: Fetch Specific Attempt
const getAttemptById = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    
    // Authorization check: Students can only view their own attempts
    if (req.user?.role === 'STUDENT' && attempt.studentId !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied: Cannot view another student attempt' });
    }

    const obj = attempt.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Start/Fetch Attempt (Student)
const createAttempt = async (req, res) => {
  try {
    const { examId, deviceInfo } = req.body;
    const studentId = req.user?.id;

    if (!examId || !studentId) {
      return res.status(400).json({ error: 'Exam ID and Student ID are required' });
    }

    // Check if attempt already active
    const activeAttempt = await ExamAttempt.findOne({ examId, studentId, status: 'IN_PROGRESS' });
    if (activeAttempt) {
      let updated = false;
      if (!activeAttempt.deviceSessionId) {
        activeAttempt.deviceSessionId = crypto.randomUUID();
        updated = true;
      }
      if (deviceInfo && Object.keys(deviceInfo).length > 0) {
        activeAttempt.deviceInfo = { ...activeAttempt.deviceInfo?.toObject?.() || activeAttempt.deviceInfo, ...deviceInfo };
        updated = true;
      }
      if (updated) {
        await activeAttempt.save();
      }
      const obj = activeAttempt.toObject();
      obj.id = obj._id;
      return res.json(obj);
    }

    // Prohibit retakes unless reattempt is explicitly allowed by Proctor/Admin
    const existingAttempt = await ExamAttempt.findOne({
      examId,
      studentId,
      status: { $in: ['SUBMITTED', 'TERMINATED'] }
    }).sort({ createdAt: -1 });

    if (existingAttempt) {
      if (existingAttempt.allowReattempt) {
        // Consume permission flag so candidate gets 1 new attempt per approval
        existingAttempt.allowReattempt = false;
        await existingAttempt.save();
      } else {
        return res.status(400).json({
          error: `Exam session is already ${existingAttempt.status.toLowerCase()}. Retakes are not permitted unless allowed by Proctor or Admin.`
        });
      }
    }

    const deviceSessionId = crypto.randomUUID();

    const attempt = await ExamAttempt.create({
      examId,
      studentId,
      deviceSessionId,
      deviceInfo: deviceInfo || {},
      status: 'IN_PROGRESS',
      integrityScore: 100,
    });

    const obj = attempt.toObject();
    obj.id = obj._id;
    res.status(201).json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Submit Attempt
const submitAttempt = async (req, res) => {
  try {
    const { answers, status, proctorNotes } = req.body;
    
    const attempt = await ExamAttempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    // Authorization check: Students can only update their own attempt
    if (req.user?.role === 'STUDENT' && attempt.studentId !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied: Cannot modify another student attempt' });
    }

    // Status check: Cannot submit a terminated attempt
    if (attempt.status === 'TERMINATED') {
      return res.status(400).json({ error: 'Cannot submit answers for a terminated attempt' });
    }

    // Server-authoritative timer validation for student submissions
    if (req.user?.role === 'STUDENT' && attempt.startedAt) {
      const exam = await Exam.findById(attempt.examId);
      if (exam && exam.durationMinutes) {
        const startTimeMs = new Date(attempt.startedAt).getTime();
        const maxDurationMs = (exam.durationMinutes * 60000) + 30000; // 30s grace buffer for latency
        if (Date.now() > startTimeMs + maxDurationMs) {
          attempt.status = 'SUBMITTED';
          attempt.submittedAt = attempt.submittedAt || new Date();
          await attempt.save();
          const obj = attempt.toObject();
          obj.id = obj._id;
          return res.status(400).json({ error: 'Exam time window has expired. Late submission rejected.', attempt: obj });
        }
      }
    }

    const newStatus = (status === 'COMPLETED' || !status) ? 'SUBMITTED' : status;
    attempt.status = newStatus;
    attempt.submittedAt = new Date();
    if (answers !== undefined) attempt.answers = answers;
    if (proctorNotes !== undefined) attempt.proctorNotes = proctorNotes;

    await attempt.save();

    const obj = attempt.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Fetch all violations for an attempt
const getAttemptViolations = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    if (req.user?.role === 'STUDENT' && attempt.studentId !== req.user?.id) {
      return res.status(403).json({ error: 'Access denied: Cannot view another student violations' });
    }

    const violations = await ProctorViolation.find({ attemptId: req.params.id }).sort({ timestamp: -1 });
    
    const formatted = violations.map(v => {
      const obj = v.toObject();
      obj.id = obj._id;
      return obj;
    });

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Terminate Attempt (Manual Proctor Trigger)
const terminateAttempt = async (req, res) => {
  try {
    const { proctorNotes } = req.body;

    const attempt = await ExamAttempt.findByIdAndUpdate(
      req.params.id,
      {
        status: 'TERMINATED',
        submittedAt: new Date(),
        proctorNotes: proctorNotes || 'Terminated by proctor',
      },
      { new: true }
    );
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    // Sync in real-time with Student via WebSockets
    const io = req.app.get('io');
    if (io) {
      io.to(`attempt_${req.params.id}`).emit('proctor_command', { action: 'TERMINATE' });
      io.to(`attempt_${req.params.id}`).emit('exam_force_terminated', {
        reason: 'Your exam session has been terminated by the proctor.',
      });
    }

    const obj = attempt.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const cancelTermination = async (req, res) => {
  console.log('cancelTermination called for attempt', req.params.id);
  try {
    // Find the attempt and ensure it is currently terminated
    const attempt = await ExamAttempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    if (attempt.status !== 'TERMINATED') {
      console.log('Attempt not terminated, status:', attempt.status);
      return res.status(400).json({ error: 'Attempt is not terminated' });
    }

    // Reset status to SUBMITTED
    attempt.status = 'SUBMITTED';
    attempt.proctorNotes = '';
    attempt.submittedAt = new Date();
    await attempt.save();
    console.log('Attempt after cancellation:', attempt);

    // Notify the client via socket that termination was cancelled
    const io = req.app.get('io');
    if (io) {
      io.to(`attempt_${req.params.id}`).emit('proctor_command', { action: 'CANCEL_TERMINATION' });
      io.to(`attempt_${req.params.id}`).emit('exam_termination_cancelled', {
        message: 'Your exam termination has been cancelled by the proctor.',
      });
    }

    const obj = attempt.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Reset candidate integrity score (Admin/Proctor action)
const resetIntegrityScore = async (req, res) => {
  try {
    const { targetScore = 100, proctorNotes } = req.body;
    if (req.user?.role === 'STUDENT') {
      return res.status(403).json({ error: 'Only admins or proctors can adjust integrity scores' });
    }

    const attempt = await ExamAttempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    const newScore = Math.min(100, Math.max(0, Number(targetScore) || 100));
    attempt.integrityScore = newScore;
    if (proctorNotes) attempt.proctorNotes = proctorNotes;
    await attempt.save();

    // Sync in real-time via WebSockets
    const io = req.app.get('io');
    if (io) {
      io.to(`attempt_${req.params.id}`).emit('proctor_command', { action: 'SCORE_RESET', integrityScore: newScore });
      io.to(`exam_${attempt.examId}`).emit('proctoring:score_updated', {
        attemptId: attempt._id,
        studentId: attempt.studentId,
        integrityScore: newScore,
      });
    }

    const obj = attempt.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Audit/Admin: Fetch all violations with comprehensive query filtering
const getAdminViolations = async (req, res) => {
  try {
    const {
      studentId,
      examId,
      attemptId,
      violationType,
      severity,
      riskLevel,
      startDate,
      endDate,
      page = 1,
      limit = 50,
    } = req.query;

    const query = {};
    if (studentId) query.studentId = studentId;
    if (examId) query.examId = examId;
    if (attemptId) query.attemptId = attemptId;
    if (violationType) query.violationType = violationType;
    if (severity) query.severity = severity.toUpperCase();
    if (riskLevel) query.riskLevel = riskLevel.toUpperCase();

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const parsedLimit = parseInt(limit);

    const totalCount = await ProctorViolation.countDocuments(query);
    const violations = await ProctorViolation.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean();

    // Populate metadata for admin overview
    const studentIds = [...new Set(violations.map((v) => v.studentId).filter(Boolean))];
    const examIds = [...new Set(violations.map((v) => v.examId).filter(Boolean))];
    const attemptIds = [...new Set(violations.map((v) => v.attemptId).filter(Boolean))];

    const users = await User.find({ _id: { $in: studentIds } }, 'email role').lean();
    const userMap = users.reduce((acc, u) => {
      acc[u._id.toString()] = u;
      return acc;
    }, {});

    const exams = await Exam.find({ _id: { $in: examIds } }, 'title subject').lean();
    const examMap = exams.reduce((acc, e) => {
      acc[e._id.toString()] = e;
      return acc;
    }, {});

    const attempts = await ExamAttempt.find({ _id: { $in: attemptIds } }, 'deviceSessionId deviceInfo integrityScore status startedAt submittedAt').lean();
    const attemptMap = attempts.reduce((acc, a) => {
      acc[a._id.toString()] = a;
      return acc;
    }, {});

    const formattedViolations = violations.map((v) => {
      const user = userMap[v.studentId] || {};
      const exam = examMap[v.examId] || {};
      const attempt = attemptMap[v.attemptId] || {};

      const startedAt = attempt.startedAt || v.timestamp;
      const submittedAt = attempt.submittedAt || null;
      const durationSeconds = (startedAt && submittedAt)
        ? Math.round((new Date(submittedAt) - new Date(startedAt)) / 1000)
        : startedAt ? Math.round((Date.now() - new Date(startedAt)) / 1000) : 0;

      return {
        ...v,
        id: v._id,
        studentEmail: user.email || 'Unknown',
        examTitle: exam.title || 'Unknown Exam',
        deviceSessionId: v.deviceSessionId || attempt.deviceSessionId || 'N/A',
        deviceInfo: attempt.deviceInfo || {},
        currentAttemptIntegrity: attempt.integrityScore ?? 100,
        attemptStatus: attempt.status || 'UNKNOWN',
        startedAt,
        submittedAt,
        durationSeconds,
        evidenceUrl: v.snapshotUrl || null,
      };
    });

    res.json({
      violations: formattedViolations,
      totalCount,
      page: parseInt(page),
      totalPages: Math.ceil(totalCount / parsedLimit) || 1,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Audit/Student: Fetch all violations recorded for a given studentId
const getStudentViolations = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Authorization check
    if (req.user?.role === 'STUDENT' && req.user?.id !== studentId) {
      return res.status(403).json({ error: 'Access denied: Cannot access another student violations' });
    }

    const violations = await ProctorViolation.find({ studentId }).sort({ timestamp: -1 }).lean();

    const formatted = violations.map((v) => ({
      ...v,
      id: v._id,
    }));

    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Allow Reattempt for a candidate (Admin/Proctor action)
const allowReattempt = async (req, res) => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'PROCTOR') {
      return res.status(403).json({ error: 'Only admins or proctors can allow exam reattempts' });
    }

    const attempt = await ExamAttempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

    attempt.allowReattempt = true;
    attempt.reattemptAllowedBy = req.user.id;
    attempt.reattemptAllowedAt = new Date();
    await attempt.save();

    // Real-time notification over WebSockets
    const io = req.app.get('io');
    if (io) {
      io.to(`exam_${attempt.examId}`).emit('proctoring:reattempt_allowed', {
        attemptId: attempt._id,
        examId: attempt.examId,
        studentId: attempt.studentId,
        allowReattempt: true,
      });
      io.to(`attempt_${attempt._id}`).emit('reattempt_enabled', {
        attemptId: attempt._id,
        examId: attempt.examId,
      });
    }

    const obj = attempt.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Record violation via HTTP REST API (Fallback/Guaranteed Persistence)
const recordViolationHttp = async (req, res) => {
  try {
    const violationService = require('../services/violationService');
    const io = req.app.get('io');
    const socketUser = {
      id: req.user?.id,
      role: req.user?.role,
      email: req.user?.email,
    };
    const rawPayload = {
      ...req.body,
      attemptId: req.params.id || req.body.attemptId,
    };

    const result = await violationService.processViolation({
      socketUser,
      rawPayload,
      io,
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAttemptById,
  createAttempt,
  submitAttempt,
  getAttemptViolations,
  terminateAttempt,
  cancelTermination,
  resetIntegrityScore,
  getAdminViolations,
  getStudentViolations,
  allowReattempt,
  recordViolationHttp,
};

