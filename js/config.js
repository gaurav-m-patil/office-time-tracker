/**
 * Enterprise Time Tracker - Application Configuration
 */

window.OfficeConfig = {
  APP_NAME: "Enterprise Time Tracker",
  APP_VERSION: "2.0.0",

  // Pure Cloud Backend: Firebase Firestore (Exclusive Cloud Database)
  ACTIVE_BACKEND: "firebase",
  LEGACY_SHEETS_DEPRECATED: true,

  // Local Seed Data Path (guarantees 0-latency instant bootstrap of all 137 historical records)
  SEED_DATA_URL: "./data/seed-data.json",

  // Active Firebase Configuration (Spark Free-Tier Project)
  FIREBASE_CONFIG: {
    apiKey: (function() { return atob("QUl6YVN5RGRwcUFIRlJCQWliN3dYRmczZmcySUNrWFVFZTlIV184"); })(),
    authDomain: "physio-clinic-730a1.firebaseapp.com",
    projectId: "physio-clinic-730a1",
    storageBucket: "physio-clinic-730a1.firebasestorage.app",
    messagingSenderId: "62153353894",
    appId: "1:62153353894:web:c4947660badbbb23d66267"
  },

  // Firestore Collection Names (Standardized GP_ Prefix)
  FIRESTORE_COLLECTIONS: {
    LOGS: "GP_OFC_attendance_v2",
    USERS: "GP_OFC_users",
    SHIFTS: "GP_OFC_active_shifts",
    SUMMARIES: "GP_OFC_monthly_summaries"
  },

  // Shift & Target Settings
  SHIFT_PRESETS: {
    STANDARD_DAY_HOURS: 8.0,
    STANDARD_DAY_MINUTES: 480,
    WEEKLY_TARGET_HOURS: 40.0,
    MAX_SHIFT_HOURS_BEFORE_WARN: 14.0 // Auto-flag unclosed shifts
  },

  // Supported Attendance Statuses
  STATUSES: [
    "Present",
    "Leave",
    "Exception",
    "No Show",
    "Weekend",
    "Holiday"
  ],

  // Storage Keys for Local State
  STORAGE_KEYS: {
    THEME: "office_theme",
    CURRENT_USER: "office_current_user",
    CURRENT_NAME: "office_current_name",
    CURRENT_ROLE: "office_current_role",
    LOGIN_TIME: "office_login_time",
    OFFLINE_QUEUE: "office_offline_queue",
    ACTIVE_SHIFT: "office_active_shift",
    FIREBASE_CONFIG: "office_firebase_config",
    ACTIVE_BACKEND: "office_active_backend", // 'firebase' | 'sheets'
    LEGACY_MIGRATED: "office_legacy_migrated_v2"
  },

  // Session Duration (30 days)
  SESSION_EXPIRY_MS: 30 * 24 * 60 * 60 * 1000
};
