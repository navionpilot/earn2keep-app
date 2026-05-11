// =============================================================================
// lib/countdownAudio.ts — Speech synthesis wrapper for timed challenges (Slice 8.1)
// =============================================================================
// Uses the browser-built-in Web Speech API (window.speechSynthesis), so no
// external dependency, no audio file hosting, no API costs.
//
// Key wrinkles we handle:
//
//   • iOS Safari requires speech synthesis to be initiated from a user
//     gesture. After the first user-gesture-triggered speak(), subsequent
//     ones work fine — even scheduled by setTimeout. prime() should be
//     called from inside a button onClick handler before any setTimeout-
//     scheduled speech.
//
//   • cancel() clears the queue. We use it on unmount and when the player
//     stops recording early — otherwise pending announcements ("Time!")
//     might fire after the player has navigated away.
//
//   • isSupported() lets the recorder gracefully degrade (skip the audio,
//     show the visual timer only) if a browser doesn't support TTS.
// =============================================================================

export function isSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/**
 * Speak a phrase immediately (or queue it after any in-progress speech).
 * Returns the underlying SpeechSynthesisUtterance so the caller can hook
 * onstart/onend if they want, otherwise it just plays.
 */
export function speak(text: string): SpeechSynthesisUtterance | null {
  if (!isSupported()) return null;

  const utterance = new SpeechSynthesisUtterance(text);
  // Crisp, neutral defaults. Players record in noisy environments
  // (gyms, fields) so we want clear delivery, slightly above default rate.
  utterance.rate = 1.05;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.lang = "en-US";

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    // Defensive — some older browsers throw on speak() under certain
    // conditions (page transitions, suspended audio context). Swallow
    // so we never break the recording flow over a TTS hiccup.
    return null;
  }
  return utterance;
}

/**
 * Cancel all pending speech immediately. Called when the player stops
 * recording early, or when the recorder component unmounts.
 */
export function cancelAll(): void {
  if (!isSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* see speak() — swallow */
  }
}

/**
 * Prime the speech synthesis engine for iOS Safari. iOS requires the
 * FIRST speech-synthesis invocation to come from inside a user-gesture
 * event handler (button click, etc.). After that, scheduled (setTimeout)
 * speech works fine. Call this synchronously from a button onClick
 * before kicking off the recorder.
 *
 * We do this by speaking an empty utterance at volume 0 — registers the
 * gesture with the audio system without making any audible sound.
 */
export function prime(): void {
  if (!isSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    u.rate = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    /* swallow */
  }
}
