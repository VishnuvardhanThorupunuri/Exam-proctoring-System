const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');

// Attempts: Fetch Specific Attempt
const getAttemptById = async (req, res) => {
  try {
    const attempt = await ExamAttempt.findById(req.params.id);
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
    
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
    const { examId } = req.body;
    const studentId = req.user?.id;

    if (!examId || !studentId) {
      return res.status(400).json({ error: 'Exam ID and Student ID are required' });
    }

    // Check if attempt already active
    const activeAttempt = await ExamAttempt.findOne({ examId, studentId, status: 'IN_PROGRESS' });
    if (activeAttempt) {
      const obj = activeAttempt.toObject();
      obj.id = obj._id;
      return res.json(obj);
    }

    const attempt = await ExamAttempt.create({
      examId,
      studentId,
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
    
    const updateData = {
      status: (status === 'COMPLETED' || !status) ? 'SUBMITTED' : status,
      submittedAt: new Date(),
    };
    if (answers !== undefined) {
      updateData.answers = answers;
    }
    if (proctorNotes !== undefined) {
      updateData.proctorNotes = proctorNotes;
    }

    const attempt = await ExamAttempt.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!attempt) return res.status(404).json({ error: 'Attempt not found' });

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



module.exports = {
  getAttemptById,
  createAttempt,
  submitAttempt,
  getAttemptViolations,
  terminateAttempt,
  cancelTermination,
};
