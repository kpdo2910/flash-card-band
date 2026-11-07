/** Haptics port over Vela `@system.vibrator`; every call is guarded. */
export function createHaptics(vibrator) {
  return {
    tap: function () {
      try {
        if (vibrator && vibrator.vibrate) vibrator.vibrate({ mode: 'short' });
      } catch (e) {
        /* vibration is optional */
      }
    }
  };
}

export function createNoopHaptics() {
  return { tap: function () {} };
}
