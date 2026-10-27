const Exam = require('../models/Exam');
const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');
const { getViolationDisplayName } = require('../config/violationConfig');

// Exams: Get All Active Exams
const getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find({ isActive: true }).sort({ startTime: 1 }).populate('creatorId', 'firstName lastName');
    
    // Pre-fetch student attempts if candidate
    let studentAttemptsMap = {};
    if (req.user?.role === 'STUDENT' && req.user?.id) {
      const attempts = await ExamAttempt.find({ studentId: req.user.id })
        .sort({ createdAt: -1 })
        .lean();
      for (const att of attempts) {
        if (!studentAttemptsMap[att.examId]) {
          studentAttemptsMap[att.examId] = att;
        }
      }
    }

    const formattedExams = exams.map(exam => {
      const obj = exam.toObject();
      obj.id = obj._id;
      if (obj.creatorId) {
        obj.creator = obj.creatorId;
        delete obj.creatorId;
      }
      // If student, remove correct answers for integrity and attach latest userAttempt
      if (req.user?.role === 'STUDENT') {
        if (Array.isArray(obj.questions)) {
          obj.questions = obj.questions.map((q) => {
            if (!q) return q;
            const { correctAnswer, ...studentQuestion } = q;
            return studentQuestion;
          });
        }
        const userAtt = studentAttemptsMap[obj.id];
        if (userAtt) {
          obj.userAttempt = {
            id: userAtt._id,
            status: userAtt.status,
            allowReattempt: !!userAtt.allowReattempt,
            integrityScore: userAtt.integrityScore,
            submittedAt: userAtt.submittedAt,
          };
        }
      }
      return obj;
    });

    res.json(formattedExams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Exams: Create Exam (Admin or Proctor only)
const createExam = async (req, res) => {
  try {
    if (req.user?.role === 'STUDENT') {
      return res.status(403).json({ error: 'Only admins or proctors can create exams' });
    }

    const { title, description, durationMinutes, startTime, endTime, maxWarningsAllowed, questions } = req.body;

    const formattedQuestions = (questions || []).map((q) => ({
      _id: require('crypto').randomUUID(),
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options ? (typeof q.options === 'string' ? q.options : JSON.stringify(q.options)) : null,
      correctAnswer: q.correctAnswer,
      points: Number(q.points || 1),
    }));

    const exam = await Exam.create({
      title,
      description,
      durationMinutes: Number(durationMinutes),
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      maxWarningsAllowed: Number(maxWarningsAllowed || 3),
      creatorId: req.user?.id,
      questions: formattedQuestions,
    });

    const obj = exam.toObject();
    obj.id = obj._id;
    res.status(201).json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Exams: Fetch Specific Exam Details with Questions
const getExamById = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });
    
    const examObj = exam.toObject();
    examObj.id = examObj._id;

    // If student, remove correct answers for integrity
    if (req.user?.role === 'STUDENT') {
      examObj.questions = examObj.questions.map((q) => {
        const { correctAnswer, ...studentQuestion } = q;
        return studentQuestion;
      });
    }

    res.json(examObj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Attempts: Fetch all attempts for a given exam (Proctors/Admins)
const getExamAttempts = async (req, res) => {
  try {
    if (req.user?.role === 'STUDENT') {
      return res.status(403).json({ error: 'Only admins or proctors can view all attempts' });
    }

    const attempts = await ExamAttempt.find({ examId: req.params.examId }).populate('studentId', 'firstName lastName email');
    
    const formattedAttempts = [];
    for (let attempt of attempts) {
      const obj = attempt.toObject();
      obj.id = obj._id;
      if (obj.studentId) {
        obj.student = obj.studentId;
        delete obj.studentId;
      }
      
      // Fetch violations
      const violations = await ProctorViolation.find({ attemptId: attempt._id }).sort({ timestamp: -1 });
      obj.violations = violations.map(v => {
        const vObj = v.toObject();
        vObj.id = vObj._id;
        vObj.violationName = getViolationDisplayName(vObj.violationType);
        vObj.displayName = getViolationDisplayName(vObj.violationType);
        return vObj;
      });

      formattedAttempts.push(obj);
    }

    res.json(formattedAttempts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Exams: Update an existing exam (Admin or Proctor only)
const updateExam = async (req, res) => {
  try {
    if (req.user?.role === 'STUDENT') {
      return res.status(403).json({ error: 'Only admins or proctors can edit exams' });
    }

    const { title, description, durationMinutes, startTime, endTime, maxWarningsAllowed, questions, isActive } = req.body;

    const formattedQuestions = (questions || []).map((q) => ({
      _id: q._id || require('crypto').randomUUID(),
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options ? (typeof q.options === 'string' ? q.options : JSON.stringify(q.options)) : null,
      correctAnswer: q.correctAnswer,
      points: Number(q.points || 1),
    }));

    const updated = await Exam.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        durationMinutes: Number(durationMinutes),
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        maxWarningsAllowed: Number(maxWarningsAllowed || 3),
        questions: formattedQuestions,
        ...(isActive !== undefined && { isActive }),
      },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ error: 'Exam not found' });

    const obj = updated.toObject();
    obj.id = obj._id;
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Exams: Delete an exam and clean up associated attempts & violations (Admin or Proctor only)
const deleteExam = async (req, res) => {
  try {
    if (req.user?.role === 'STUDENT') {
      return res.status(403).json({ error: 'Only admins or proctors can delete exams' });
    }

    const { id } = req.params;
    const exam = await Exam.findById(id);
    if (!exam) return res.status(404).json({ error: 'Exam not found' });

    await Exam.findByIdAndDelete(id);
    await ExamAttempt.deleteMany({ examId: id });
    await ProctorViolation.deleteMany({ examId: id });

    res.json({ message: 'Exam deleted successfully', examId: id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllExams,
  createExam,
  getExamById,
  getExamAttempts,
  updateExam,
  deleteExam,
};
