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
    displayName: 'Face Not Detected',
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
    displayName: 'Multiple Faces Detected',
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
    displayName: 'Mobile Phone Detected',
    severity: 'HIGH',
    riskWeight: 35,
    confidenceThreshold: PROCTORING_SETTINGS.OBJECT_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: 8000, // 8 seconds
    captureEvidence: true,
    description: 'Mobile phone detected in video frame',
  },
  BOOK_DETECTED: {
    type: 'BOOK_DETECTED',
    displayName: 'Book / Reference Material',
    severity: 'MEDIUM',
    riskWeight: 15,
    confidenceThreshold: PROCTORING_SETTINGS.OBJECT_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: 8000, // 8 seconds
    captureEvidence: true,
    description: 'Book or reference material detected in video frame',
  },
  TABLET_DETECTED: {
    type: 'TABLET_DETECTED',
    displayName: 'Tablet / Secondary Device',
    severity: 'HIGH',
    riskWeight: 30,
    confidenceThreshold: PROCTORING_SETTINGS.OBJECT_DETECTION_CONFIDENCE_THRESHOLD,
    cooldown: 8000, // 8 seconds
    captureEvidence: true,
    description: 'Tablet or secondary computing device detected',
  },
  TAB_SWITCH: {
    type: 'TAB_SWITCH',
    displayName: 'Browser Tab Switched',
    severity: 'MEDIUM',
    riskWeight: 15,
    cooldown: 5000, // 5 seconds
    captureEvidence: true,
    description: 'Student switched browser tabs or minimized window',
  },
  FULLSCREEN_EXIT: {
    type: 'FULLSCREEN_EXIT',
    displayName: 'Fullscreen Mode Exited',
    severity: 'MEDIUM',
    riskWeight: 10,
    cooldown: 5000, // 5 seconds
    captureEvidence: true,
    description: 'Student exited fullscreen mode',
  },
  CAMERA_DISCONNECTED: {
    type: 'CAMERA_DISCONNECTED',
    displayName: 'Camera Disconnected / Blocked',
    severity: 'HIGH',
    riskWeight: 40,
    cooldown: 15000, // 15 seconds
    captureEvidence: false,
    description: 'Webcam video stream disconnected',
  },
  MICROPHONE_DISCONNECTED: {
    type: 'MICROPHONE_DISCONNECTED',
    displayName: 'Microphone Disconnected',
    severity: 'MEDIUM',
    riskWeight: 20,
    cooldown: 15000, // 15 seconds
    captureEvidence: false,
    description: 'Microphone audio stream disconnected',
  },
  NETWORK_DISCONNECTED: {
    type: 'NETWORK_DISCONNECTED',
    displayName: 'Network Disconnected',
    severity: 'LOW',
    riskWeight: 5,
    cooldown: 30000, // 30 seconds
    captureEvidence: false,
    description: 'Network connection lost during exam',
  },
};

const VIOLATION_ALIASES = {
  MOBILE_PHONE: 'PHONE_DETECTED',
  CELL_PHONE: 'PHONE_DETECTED',
  PHONE: 'PHONE_DETECTED',
  BOOK: 'BOOK_DETECTED',
  TABLET: 'TABLET_DETECTED',
  BROWSER_TAB_SWITCH: 'TAB_SWITCH',
  TAB_SWITCHED: 'TAB_SWITCH',
  WINDOW_BLUR: 'TAB_SWITCH',
  FULL_SCREEN_EXIT: 'FULLSCREEN_EXIT',
  FULLSCREEN_EXITED: 'FULLSCREEN_EXIT',
  NO_FACE_DETECTED: 'NO_FACE',
  FACE_NOT_FOUND: 'NO_FACE',
  MULTIPLE_FACES_DETECTED: 'MULTIPLE_FACES',
  VOICE_DETECTED: 'MICROPHONE_DISCONNECTED',
  AUDIO_SPIKE: 'MICROPHONE_DISCONNECTED',
};

const normalizeViolationType = (rawType) => {
  if (!rawType) return '';
  const upper = String(rawType).trim().toUpperCase();
  if (VIOLATION_CONFIG[upper]) return upper;
  if (VIOLATION_ALIASES[upper]) return VIOLATION_ALIASES[upper];
  return upper;
};

const getViolationDisplayName = (type) => {
  const norm = normalizeViolationType(type);
  if (VIOLATION_CONFIG[norm]?.displayName) return VIOLATION_CONFIG[norm].displayName;
  return String(type || 'Unknown')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const ALLOWED_VIOLATION_TYPES = Object.keys(VIOLATION_CONFIG);

module.exports = {
  PROCTORING_SETTINGS,
  VIOLATION_CONFIG,
  VIOLATION_ALIASES,
  ALLOWED_VIOLATION_TYPES,
  normalizeViolationType,
  getViolationDisplayName,
};


