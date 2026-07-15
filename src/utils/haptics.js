/**
 * Haptic Feedback Service (HTML5 Vibration API)
 * Provides physical tactile vibrations for mobile Android devices.
 * Gracefully falls back to no-op if unsupported.
 */

const isVibrationSupported = () => {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
};

export const triggerSuccessVibe = () => {
  if (isVibrationSupported()) {
    navigator.vibrate(60); // Single short pulse
  }
};

export const triggerWarningVibe = () => {
  if (isVibrationSupported()) {
    navigator.vibrate([60, 40, 60]); // Double quick pulse
  }
};

export const triggerErrorVibe = () => {
  if (isVibrationSupported()) {
    navigator.vibrate(250); // Single long pulse
  }
};

export const triggerLockVibe = () => {
  if (isVibrationSupported()) {
    navigator.vibrate([100, 50, 100, 50, 150]); // Alternating locks vibe
  }
};
