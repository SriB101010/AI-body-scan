/**
 * Patient Sequential Voice Guidance State Machine (Web Speech API)
 * Manages narrated audio feedback with 3.5s instruction cooldowns, active movement suppression,
 * and single instruction prioritization to eliminate speech overlapping and spamming.
 */
class VoiceEngine {
  constructor() {
    this.enabled = true;
    this.synthesis = window.speechSynthesis;
    this.voice = null;

    // State Machine Memory
    this.activeInstructionId = null;
    this.activePriority = 999;
    this.lastSpokenMap = {}; // { [instructionId]: { timestamp: number, count: number } }
    this.defaultCooldownMs = 3500; // 3.5 seconds patient cooldown between prompts
    this.isUserMoving = false; // Suppresses new corrective prompts while actively moving

    if (this.synthesis) {
      if (this.synthesis.onvoiceschanged !== undefined) {
        this.synthesis.onvoiceschanged = () => this.initVoice();
      }
      this.initVoice();
    }
  }

  initVoice() {
    if (!this.synthesis) return;
    const voices = this.synthesis.getVoices();
    this.voice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
                 voices.find(v => v.lang === 'en-US' || v.lang.startsWith('en'));
  }

  /**
   * Set user movement status. When true, suppresses new corrective prompts while user adjusts.
   * @param {boolean} moving 
   */
  setMovementStatus(moving) {
    this.isUserMoving = moving;
  }

  /**
   * Speak a prioritized instruction with sequential state machine cooldown tracking.
   * Suppresses prompts while user is actively moving into position.
   * 
   * @param {string} instructionId - Unique identifier
   * @param {string} text - Spoken text prompt
   * @param {number} priority - Priority rank (1 = highest, 8 = lowest)
   * @param {number} cooldownMs - Minimum cooldown before repeating
   */
  speakInstruction(instructionId, text, priority = 5, cooldownMs = 3500) {
    if (!this.synthesis || !this.enabled || !text) return;

    // Suppress corrective instructions while user is actively moving
    if (this.isUserMoving && instructionId !== 'READY_CAPTURE') {
      return;
    }

    const now = Date.now();
    const lastRecord = this.lastSpokenMap[instructionId];

    // Check if this instruction was spoken recently and is still within cooldown
    if (lastRecord && (now - lastRecord.timestamp < cooldownMs)) {
      return; // Patiently wait for user to respond
    }

    // Never interrupt an utterance while it is actively being spoken
    if (this.synthesis.speaking) {
      return;
    }

    // Check priority: lower number = higher priority
    if (this.activeInstructionId && this.activeInstructionId !== instructionId) {
      if (priority > this.activePriority && (now - (this.lastSpokenMap[this.activeInstructionId]?.timestamp || 0) < 2000)) {
        return;
      }
    }

    // Update state machine trackers
    this.activeInstructionId = instructionId;
    this.activePriority = priority;
    this.lastSpokenMap[instructionId] = {
      timestamp: now,
      count: (lastRecord ? lastRecord.count + 1 : 1)
    };

    this.rawSpeak(text);
  }

  /**
   * Legacy simple speak call wrapper
   * @param {string} text 
   */
  speak(text) {
    this.speakInstruction(text, text, 5, 3500);
  }

  isSpeaking() {
    return this.synthesis ? this.synthesis.speaking : false;
  }

  /**
   * Speak text asynchronously and return a Promise that resolves when speech finishes.
   * If speech synthesis is disabled or unsupported, resolves after a brief fallback delay.
   * 
   * @param {string} text 
   * @returns {Promise<void>}
   */
  speakAsync(text) {
    return new Promise((resolve) => {
      if (!this.synthesis || !this.enabled || !text) {
        setTimeout(resolve, 800);
        return;
      }

      try {
        this.synthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        if (this.voice) utterance.voice = this.voice;
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        let resolved = false;
        const done = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };

        utterance.onend = done;
        utterance.onerror = done;

        // Fallback safety timer (max 4.5 seconds)
        setTimeout(done, 4500);

        this.synthesis.speak(utterance);
      } catch (e) {
        console.warn('[VoiceEngine] speakAsync execution failed:', e);
        resolve();
      }
    });
  }

  /**
   * Perform actual speech synthesis execution
   * @param {string} text 
   */
  rawSpeak(text) {
    try {
      this.synthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) utterance.voice = this.voice;
      utterance.rate = 1.0; // Patient human assistant speech rate
      utterance.pitch = 1.0;
      this.synthesis.speak(utterance);
    } catch (e) {
      console.warn('[VoiceEngine] Speech synthesis execution failed:', e);
    }
  }

  /**
   * Reset specific instruction state when user corrects an issue
   * @param {string} instructionId 
   */
  resetInstruction(instructionId) {
    if (instructionId && this.lastSpokenMap[instructionId]) {
      delete this.lastSpokenMap[instructionId];
    }
    if (this.activeInstructionId === instructionId) {
      this.activeInstructionId = null;
      this.activePriority = 999;
    }
  }

  /**
   * Reset all state machine trackers
   */
  resetAll() {
    this.activeInstructionId = null;
    this.activePriority = 999;
    this.lastSpokenMap = {};
    this.isUserMoving = false;
    this.stop();
  }

  /**
   * Stop any current narration
   */
  stop() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }

  /**
   * Toggle voice guidance on/off
   */
  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) this.stop();
    return this.enabled;
  }
}

// Instantiate voice engine globally
const voiceEngine = new VoiceEngine();
window.voiceEngine = voiceEngine;
