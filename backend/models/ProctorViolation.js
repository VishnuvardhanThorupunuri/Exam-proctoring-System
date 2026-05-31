const { Schema, model } = require('mongoose');

const ProctorViolationSchema = new Schema({
  _id: { type: String, default: () => require('crypto').randomUUID() },
  attemptId: { type: String, ref: 'ExamAttempt', required: true },
  violationType: { type: String, required: true },
  severity: { type: String, required: true, enum: ['LOW', 'MEDIUM', 'HIGH'] },
  timestamp: { type: Date, default: Date.now },
  snapshotUrl: { type: String },
  metadata: { type: Schema.Types.Mixed },
}, { timestamps: true });

module.exports = model('ProctorViolation', ProctorViolationSchema);
