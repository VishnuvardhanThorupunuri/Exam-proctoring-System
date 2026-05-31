const User = require('../models/User');
const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');

const socketHandler = (io) => {
  io.on('connection', (socket) => {
    console.log(`Socket client connected: ${socket.id}`);

    // When a student joins an exam sandbox session
    socket.on('student_join_exam', ({ attemptId, examId, studentName }) => {
      socket.join(`exam_${examId}`);
      socket.join(`attempt_${attemptId}`);
      console.log(`Student [${studentName}] joined exam room exam_${examId} and attempt_${attemptId}`);
    });

    // When a proctor monitors a specific exam session
    socket.on('proctor_join_exam', ({ examId }) => {
      socket.join(`exam_${examId}`);
      console.log(`Proctor joined monitor room for exam_${examId}`);
    });

    // Telemetry anomaly event sent by client Edge AI proctoring
    socket.on('client_telemetry_violation', async ({ attemptId, examId, violationType, severity, metadata }) => {
      try {
        console.log(`[VIOLATION]: Attempt: ${attemptId} | Type: ${violationType} | Severity: ${severity}`);
        
        // Calculate integrity score penalty
        let penalty = 0;
        if (severity === 'LOW') penalty = 2;
        else if (severity === 'MEDIUM') penalty = 10;
        else if (severity === 'HIGH') penalty = 25;

        // Fetch current attempt
        const attempt = await ExamAttempt.findById(attemptId);
        if (attempt) {
          const newScore = Math.max(0, attempt.integrityScore - penalty);
          
          // Update attempt integrity score
          attempt.integrityScore = newScore;
          await attempt.save();

          // Fetch student details for real-time alert
          const student = await User.findById(attempt.studentId);
          const studentName = student ? `${student.firstName} ${student.lastName}` : 'Unknown Student';

          // Insert violation record in DB
          const violation = await ProctorViolation.create({
            attemptId,
            violationType,
            severity,
            metadata: metadata || null,
          });

          // Broadcast alert in real-time to Proctors watching the exam
          io.to(`exam_${examId}`).emit('student_violation_alert', {
            attemptId,
            violationId: violation._id,
            studentName,
            violationType,
            severity,
            timestamp: violation.timestamp,
            currentScore: newScore,
            metadata: metadata || null,
          });

          // Auto-terminate attempt if score hits 20 or below
          if (newScore <= 20) {
            attempt.status = 'TERMINATED';
            attempt.submittedAt = new Date();
            await attempt.save();

            io.to(`attempt_${attemptId}`).emit('exam_force_terminated', {
              reason: 'Integrity score fell below threshold. Exam auto-terminated.',
            });
            
            io.to(`exam_${examId}`).emit('student_terminated_alert', {
              attemptId,
              studentName,
            });
          }
        }
      } catch (err) {
        console.error('Error handling telemetry violation:', err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });
};

module.exports = socketHandler;
