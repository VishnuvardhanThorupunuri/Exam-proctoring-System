const PROCTORING_SETTINGS = {
  NO_FACE_CONFIRMATION_TIME: 3000, // 3 seconds sustained continuous absence
  FACE_DETECTION_CONFIDENCE_THRESHOLD: 0.65,
  NO_FACE_COOLDOWN: 8000, // 8 seconds cooldown between repeated alerts
  MULTI_FACE_CONFIRMATION_TIME: 2000, // 2 seconds sustained multiple faces
  OBJECT_DETECTION_CONFIDENCE_THRESHOLD: 0.55,
};

const VIOLATION_CONFIG = {
  NO_FACE: {
    type: 'NO_FACE',
    severity: 'MEDIUM',
    riskWeight: 10,
    confidenceThreshold: PROCTORING_SETTINGS.FACE_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: PROCTORING_SETTINGS.NO_FACE_COOLDOWN,
    minDuration: PROCTORING_SETTINGS.NO_FACE_CONFIRMATION_TIME,
    captureEvidence: true,
    description: 'No face detected in video feed',
  },
  MULTIPLE_FACES: {
    type: 'MULTIPLE_FACES',
    severity: 'HIGH',
    riskWeight: 30,
    confidenceThreshold: PROCTORING_SETTINGS.FACE_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: 8000, // 8 seconds
    minDuration: PROCTORING_SETTINGS.MULTI_FACE_CONFIRMATION_TIME,
    captureEvidence: true,
    description: 'Multiple faces detected in video feed',
  },
  PHONE_DETECTED: {
    type: 'PHONE_DETECTED',
    severity: 'HIGH',
    riskWeight: 35,
    confidenceThreshold: PROCTORING_SETTINGS.OBJECT_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: 8000, // 8 seconds
    captureEvidence: true,
    description: 'Mobile phone detected in video frame',
  },
  BOOK_DETECTED: {
    type: 'BOOK_DETECTED',
    severity: 'MEDIUM',
    riskWeight: 15,
    confidenceThreshold: PROCTORING_SETTINGS.OBJECT_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: 8000, // 8 seconds
    captureEvidence: true,
    description: 'Book or reference material detected in video frame',
  },
  TABLET_DETECTED: {
    type: 'TABLET_DETECTED',
    severity: 'HIGH',
    riskWeight: 30,
    confidenceThreshold: PROCTORING_SETTINGS.OBJECT_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: 8000, // 8 seconds
    captureEvidence: true,
    description: 'Tablet or secondary computing device detected',
  },
  TAB_SWITCH: {
    type: 'TAB_SWITCH',
    severity: 'MEDIUM',
    riskWeight: 15,
    cooldown: 5000, // 5 seconds
    captureEvidence: true,
    description: 'Student switched browser tabs or minimized window',
  },
  FULLSCREEN_EXIT: {
    type: 'FULLSCREEN_EXIT',
    severity: 'MEDIUM',
    riskWeight: 10,
    cooldown: 5000, // 5 seconds
    captureEvidence: true,
    description: 'Student exited fullscreen mode',
  },
  CAMERA_DISCONNECTED: {
    type: 'CAMERA_DISCONNECTED',
    severity: 'HIGH',
    riskWeight: 40,
    cooldown: 15000, // 15 seconds
    captureEvidence: false,
    description: 'Webcam video stream disconnected',
  },
  MICROPHONE_DISCONNECTED: {
    type: 'MICROPHONE_DISCONNECTED',
    severity: 'MEDIUM',
    riskWeight: 20,
    cooldown: 15000, // 15 seconds
    captureEvidence: false,
    description: 'Microphone audio stream disconnected',
  },
  NETWORK_DISCONNECTED: {
    type: 'NETWORK_DISCONNECTED',
    severity: 'LOW',
    riskWeight: 5,
    cooldown: 30000, // 30 seconds
    captureEvidence: false,
    description: 'Network connection lost during exam',
  },
};

const ALLOWED_VIOLATION_TYPES = Object.keys(VIOLATION_CONFIG);

module.exports = {
  PROCTORING_SETTINGS,
  VIOLATION_CONFIG,
  ALLOWED_VIOLATION_TYPES,
};


