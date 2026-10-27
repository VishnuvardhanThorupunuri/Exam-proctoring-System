// Centralized Violation Definitions & Display Helpers

export const VIOLATION_DISPLAY_NAMES = {
  NO_FACE: 'Face Not Detected',
  MULTIPLE_FACES: 'Multiple Faces Detected',
  PHONE_DETECTED: 'Mobile Phone Detected',
  BOOK_DETECTED: 'Book / Reference Material',
  TABLET_DETECTED: 'Tablet / Secondary Device',
  TAB_SWITCH: 'Browser Tab Switched',
  FULLSCREEN_EXIT: 'Fullscreen Mode Exited',
  CAMERA_DISCONNECTED: 'Camera Disconnected / Blocked',
  MICROPHONE_DISCONNECTED: 'Microphone Disconnected',
  NETWORK_DISCONNECTED: 'Network Disconnected',
  // Common Aliases
  MOBILE_PHONE: 'Mobile Phone Detected',
  CELL_PHONE: 'Mobile Phone Detected',
  BROWSER_TAB_SWITCH: 'Browser Tab Switched',
  FULL_SCREEN_EXIT: 'Fullscreen Mode Exited',
  VOICE_DETECTED: 'Unauthorized Voice Detected',
  AUDIO_SPIKE: 'Audio Spike Detected',
};

export const VIOLATION_ICONS = {
  NO_FACE: '👤❌',
  MULTIPLE_FACES: '👥',
  PHONE_DETECTED: '📱',
  BOOK_DETECTED: '📖',
  TABLET_DETECTED: '📲',
  TAB_SWITCH: '📑',
  FULLSCREEN_EXIT: '⛶',
  CAMERA_DISCONNECTED: '📷❌',
  MICROPHONE_DISCONNECTED: '🎙️❌',
  NETWORK_DISCONNECTED: '📡❌',
  MOBILE_PHONE: '📱',
  CELL_PHONE: '📱',
  BROWSER_TAB_SWITCH: '📑',
  VOICE_DETECTED: '🎙️',
};

export const VIOLATION_DESCRIPTIONS = {
  NO_FACE: 'No candidate face detected in video feed',
  MULTIPLE_FACES: 'Multiple faces detected in candidate video feed',
  PHONE_DETECTED: 'Prohibited mobile phone detected in candidate view',
  BOOK_DETECTED: 'Prohibited book, notes, or reference material detected',
  TABLET_DETECTED: 'Prohibited secondary computing device detected',
  TAB_SWITCH: 'Candidate switched tabs or minimized exam window',
  FULLSCREEN_EXIT: 'Candidate exited compulsory fullscreen examination mode',
  CAMERA_DISCONNECTED: 'Candidate webcam feed was disconnected or obstructed',
  MICROPHONE_DISCONNECTED: 'Candidate microphone audio was muted or disconnected',
  NETWORK_DISCONNECTED: 'Candidate device lost network connectivity',
};

export const normalizeViolationType = (rawType) => {
  if (!rawType) return '';
  const upper = String(rawType).trim().toUpperCase();
  const aliasMap = {
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
  };
  return aliasMap[upper] || upper;
};

/**
 * Returns a human-friendly formatted name for any violation key.
 * Fallback gracefully formats SNAKE_CASE to Title Case.
 */
export const getViolationDisplayName = (type) => {
  if (!type) return 'Unknown Violation';
  const clean = String(type).trim();
  const upper = clean.toUpperCase();
  if (VIOLATION_DISPLAY_NAMES[upper]) return VIOLATION_DISPLAY_NAMES[upper];
  // Fallback for custom or unmapped types
  return clean
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

/**
 * Returns an emoji/symbol icon for the violation type.
 */
export const getViolationIcon = (type) => {
  if (!type) return '⚠️';
  const upper = String(type).trim().toUpperCase();
  return VIOLATION_ICONS[upper] || '⚠️';
};

/**
 * Returns a detailed description for the violation.
 */
export const getViolationDescription = (type) => {
  if (!type) return 'Proctoring violation event';
  const upper = String(type).trim().toUpperCase();
  return VIOLATION_DESCRIPTIONS[upper] || 'Proctoring protocol violation recorded';
};
