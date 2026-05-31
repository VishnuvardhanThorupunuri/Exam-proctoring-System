const { Schema, model } = require('mongoose');

const UserSchema = new Schema({
  _id: { type: String, default: () => require('crypto').randomUUID() },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  role: { type: String, default: 'STUDENT', enum: ['STUDENT', 'PROCTOR', 'ADMIN'] },
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

UserSchema.virtual('attempts', {
  ref: 'ExamAttempt',
  localField: '_id',
  foreignField: 'studentId'
});

module.exports = model('User', UserSchema);
