// Simple logging utility for production-safe error handling
// In production, you might want to integrate with services like Sentry, LogRocket, etc.

const isDevelopment = import.meta.env.DEV;

export const logger = {
  error: (message, error, context = {}) => {
    if (isDevelopment) {
      console.error(`[ERROR] ${message}`, error, context);
    } else {
      // In production, send to error tracking service
      // Example: Sentry.captureException(error, { extra: { message, ...context } });
    }
  },

  warn: (message, context = {}) => {
    if (isDevelopment) {
      console.warn(`[WARN] ${message}`, context);
    }
    // In production, you might want to track warnings too
  },

  info: (message, context = {}) => {
    if (isDevelopment) {
      console.log(`[INFO] ${message}`, context);
    }
  },

  debug: (message, context = {}) => {
    if (isDevelopment) {
      console.log(`[DEBUG] ${message}`, context);
    }
  }
};
