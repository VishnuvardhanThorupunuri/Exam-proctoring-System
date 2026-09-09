const ExamAttempt = require('../models/ExamAttempt');
const ProctorViolation = require('../models/ProctorViolation');
const User = require('../models/User');
const { VIOLATION_CONFIG } = require('../config/violationConfig');

class ViolationService {
  constructor() {
    // In-memory map for debouncing/cooldown tracking: key -> timestamp (ms)
    // Key format: `${attemptId}:${violationType}`
    this.cooldownMap = new Map();

    // Periodically clean up entries older than 30 seconds to avoid memory leaks
    const timer = setInterval(() => this.cleanupCooldowns(), 60000);
    if (timer.unref) timer.unref();
  }

  /**
   * Remove expired cooldown entries from memory
   */
  cleanupCooldowns() {
    const now = Date.now();
    for (const [key, lastTime] of this.cooldownMap.entries()) {
      if (now - lastTime > 30000) {
        this.cooldownMap.delete(key);
      }
    }
  }

  /**
   * Check if a violation trigger is currently within its cooldown window
   */
  isCoolingDown(attemptId, violationType) {
    const config = VIOLATION_CONFIG[violationType];
    if (!config || !config.cooldown) return false;

    const key = `${attemptId}:${violationType}`;
    const lastTime = this.cooldownMap.get(key);
    const now = Date.now();

    if (lastTime && (now - lastTime < config.cooldown)) {
      return true; // Active cooldown — debounce this event
    }

    // Update last triggered timestamp
    this.cooldownMap.set(key, now);
    return false;
  }

  /**
   * Validate violation payload schema
   */
  validatePayload(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object') {
      return { valid: false, reason: 'Payload must be a non-null object' };
    }

    const { attemptId, examId, type, confidence, timestamp, metadata, snapshotData, snapshotUrl } = rawPayload;

    if (!attemptId || typeof attemptId !== 'string') {
      return { valid: false, reason: 'Missing or invalid attemptId' };
    }
    if (!examId || typeof examId !== 'string') {
      return { valid: false, reason: 'Missing or invalid examId' };
    }
    if (!type || !VIOLATION_CONFIG[type]) {
      return {
        valid: false,
        reason: `Invalid or unconfigured violation type "${type}". Allowed: ${Object.keys(VIOLATION_CONFIG).join(', ')}`,
      };
    }

    // Confidence defaults to 1.0 if not provided, bounded strictly between 0.0 and 1.0
    const conf = confidence !== undefined ? Number(confidence) : 1.0;
    if (isNaN(conf) || conf < 0 || conf > 1) {
      return { valid: false, reason: `Invalid confidence value "${confidence}". Must be between 0.0 and 1.0` };
    }

    // Evidence snapshot processing (Base64 JPEG or URL)
    const evidenceImage = snapshotUrl || snapshotData || null;

    return {
      valid: true,
      data: {
        attemptId,
        examId,
        type,
        confidence: conf,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
        metadata: metadata || null,
        snapshotUrl: evidenceImage,
      },
    };
  }

  /**
   * Main Pipeline Execution:
   * Detection -> Validation -> Classification -> Severity/Risk Impact -> DB Persist -> Real-time Notify
   */
  async processViolation({ socketUser, rawPayload, io }) {
    // 1. Authentication Check
    if (!socketUser || !socketUser.id) {
      console.warn(`[VIOLATION SERVICE] Unauthenticated violation attempt rejected`);
      return { success: false, status: 'UNAUTHORIZED', reason: 'Unauthenticated socket connection' };
    }

    // 2. Validation
    const validation = this.validatePayload(rawPayload);
    if (!validation.valid) {
      console.warn(`[VIOLATION SERVICE] Payload validation failed for user=${socketUser.id}: ${validation.reason}`);
      return { success: false, status: 'INVALID_PAYLOAD', reason: validation.reason };
    }

    const { attemptId, examId, type, confidence, timestamp, metadata, snapshotUrl } = validation.data;

    // 3. Cooldown / Debounce Check
    if (this.isCoolingDown(attemptId, type)) {
      console.log(
        `[VIOLATION DEBOUNCED] Type "${type}" for attempt ${attemptId} suppressed due to active cooldown window.`
      );
      return { success: true, status: 'DEBOUNCED', reason: 'Violation suppressed by server cooldown timer' };
    }

    // 4. Fetch attempt & check ownership and status
    const attempt = await ExamAttempt.findById(attemptId);
    if (!attempt) {
      console.warn(`[VIOLATION SERVICE] Attempt ${attemptId} not found`);
      return { success: false, status: 'NOT_FOUND', reason: 'Attempt not found' };
    }

    if (attempt.studentId !== socketUser.id) {
      console.warn(
        `[VIOLATION SECURITY] User ${socketUser.id} tried to report violation for attempt owned by ${attempt.studentId}`
      );
      return { success: false, status: 'FORBIDDEN', reason: 'Cannot report violation for another candidate' };
    }

    if (attempt.status !== 'IN_PROGRESS') {
      console.log(`[VIOLATION SERVICE] Attempt ${attemptId} status is ${attempt.status} — ignoring`);
      return { success: true, status: 'IGNORED', reason: `Attempt is ${attempt.status}` };
    }

    // 5. Server Classification & Server-Authoritative Risk Impact Calculation
    // NEVER trust client-provided severity or riskWeight — look up from server VIOLATION_CONFIG
    const config = VIOLATION_CONFIG[type];
    const serverSeverity = config.severity;
    const baseRiskWeight = config.riskWeight;

    // Risk impact penalty scaled by confidence score
    const previousRiskScore = attempt.integrityScore;
    const penalty = Math.round(baseRiskWeight * confidence);
    const newIntegrityScore = Math.max(0, previousRiskScore - penalty);
    const riskLevel = newIntegrityScore >= 80 ? 'LOW' : newIntegrityScore >= 50 ? 'MEDIUM' : newIntegrityScore >= 20 ? 'HIGH' : 'CRITICAL';

    attempt.integrityScore = newIntegrityScore;
    await attempt.save();

    // Server-authoritative timestamp
    const serverTimestamp = new Date();
    const deviceSessionId = attempt.deviceSessionId || require('crypto').randomUUID();

    // 6. Permanent Database Record in MongoDB
    const violationRecord = await ProctorViolation.create({
      attemptId,
      examId,
      studentId: attempt.studentId,
      deviceSessionId,
      violationType: type,
      severity: serverSeverity,
      confidence,
      previousRiskScore,
      riskContribution: penalty,
      newRiskScore: newIntegrityScore,
      riskLevel,
      timestamp: serverTimestamp,
      snapshotUrl: snapshotUrl || null,
      metadata: {
        ...(metadata || {}),
        description: config.description,
        riskWeight: baseRiskWeight,
        penaltyApplied: penalty,
        deviceInfo: attempt.deviceInfo || null,
      },
    });

    console.log(
      `[VIOLATION RECORDED] type=${type} severity=${serverSeverity} penalty=${penalty} ` +
      `prevScore=${previousRiskScore} newScore=${newIntegrityScore} level=${riskLevel} ` +
      `attempt=${attemptId} session=${deviceSessionId} candidate=${socketUser.id} ` +
      `evidence=${snapshotUrl ? 'YES' : 'NO'}`
    );

    // 7. Fetch Candidate Details for Real-Time Notification
    const student = await User.findById(attempt.studentId);
    const studentName = student ? `${student.firstName} ${student.lastName}` : 'Candidate';
    const studentEmail = student ? student.email : '';

    const alertPayload = {
      attemptId,
      violationId: violationRecord._id,
      studentId: attempt.studentId,
      studentName,
      studentEmail,
      deviceSessionId,
      type,
      violationType: type,
      severity: serverSeverity,
      confidence,
      previousRiskScore,
      riskContribution: penalty,
      currentScore: newIntegrityScore,
      integrityScore: newIntegrityScore,
      riskLevel,
      timestamp: violationRecord.timestamp,
      snapshotUrl: violationRecord.snapshotUrl || snapshotUrl || null,
      metadata: violationRecord.metadata,
    };

    // Broadcast alert to proctor monitoring room & global proctor channel
    if (io) {
      io.to(`exam_${examId}`).emit('proctoring:violation_alert', alertPayload);
      io.to('proctor_global').emit('proctoring:violation_alert', alertPayload);
      // Fallback event name for backwards compatibility
      io.to(`exam_${examId}`).emit('student_violation_alert', alertPayload);
      io.to('proctor_global').emit('student_violation_alert', alertPayload);
    }

    // 8. Auto-Termination Check if score drops to/below threshold (<= 20)
    let autoTerminated = false;
    if (newIntegrityScore <= 20 && attempt.status === 'IN_PROGRESS') {
      attempt.status = 'TERMINATED';
      attempt.submittedAt = new Date();
      attempt.proctorNotes = `Auto-terminated: integrity score fell to ${newIntegrityScore}`;
      await attempt.save();
      autoTerminated = true;

      console.log(`[VIOLATION AUTO-TERMINATED] Attempt ${attemptId} auto-terminated — final score: ${newIntegrityScore}`);

      if (io) {
        io.to(`attempt_${attemptId}`).emit('exam_force_terminated', {
          reason: `Integrity score fell below threshold (${newIntegrityScore}%). Exam auto-terminated.`,
        });

        io.to(`exam_${examId}`).emit('proctoring:student_terminated', {
          attemptId,
          studentId: attempt.studentId,
          studentName,
          finalScore: newIntegrityScore,
          reason: 'Integrity score fell below minimum threshold',
        });
      }
    }

    return {
      success: true,
      status: 'PROCESSED',
      violationId: violationRecord._id,
      penalty,
      newIntegrityScore,
      autoTerminated,
    };
  }
}

// Export singleton instance
module.exports = new ViolationService();
