/**
 * Camera Stream, Live Video Preview, Pose Overlay & Guided Capture Controller
 * Ensures live camera video feed is active as background layer, renders pose guidelines,
 * validates posture before countdown, and captures actual frames directly from the live stream.
 */
class CameraManager {
  constructor() {
    this.video = document.getElementById('scan-video');
    this.overlay = document.getElementById('scan-overlay');
    this.ctx = this.overlay ? this.overlay.getContext('2d') : null;

    this.stream = null;
    this.active = false;

    // Explicit Scan State Machine ('IDLE' | 'POSITIONING' | 'CORRECT_POSITION' | 'CAPTURE_NOTICE' | 'COUNTDOWN' | 'CAPTURING' | 'CAPTURED' | 'PROCESSING')
    this.scanState = 'IDLE';
    this.captureInProgress = false;
    this.captureSequenceActive = false;

    // Scan workflow states ('front' | 'side' | 'complete')
    this.phase = 'front';
    this.frontPhoto = null;
    this.sidePhoto = null;
    this.pendingCapturePhoto = null;

    // Render loop handle
    this.animationFrameId = null;

    // Countdown state tracker
    this.countdownTimer = null;
    this.countdownValue = 3;
    this.isCountingDown = false;

    // Voice guidance throttling
    this.lastSpokenInstruction = '';
    this.instructionCooldown = 0;

    // Synthesized Audio Context
    this.audioCtx = null;

    this.bindReviewEvents();
    this.bindErrorEvents();
  }

  /**
   * Bind event handlers for Photo Review Modal
   */
  bindReviewEvents() {
    const btnUse = document.getElementById('btn-review-use');
    const btnRetake = document.getElementById('btn-review-retake');

    if (btnUse) btnUse.addEventListener('click', () => this.handleReviewConfirm());
    if (btnRetake) btnRetake.addEventListener('click', () => this.handleReviewRetake());
  }

  /**
   * Bind event handlers for Camera Error Banner
   */
  bindErrorEvents() {
    const btnRetry = document.getElementById('btn-camera-retry');
    const btnDemo = document.getElementById('btn-camera-demo');
    const btnExit = document.getElementById('btn-camera-exit');

    if (btnRetry) {
      btnRetry.addEventListener('click', async () => {
        this.hideCameraError();
        const success = await this.startCamera();
        if (success) {
          this.startScan(this.onComplete);
        }
      });
    }

    if (btnDemo) {
      btnDemo.addEventListener('click', async () => {
        this.hideCameraError();
        const success = await this.startMockCamera();
        if (success) {
          this.startScan(this.onComplete);
        }
      });
    }

    if (btnExit) {
      btnExit.addEventListener('click', () => {
        this.stop();
        if (window.appController) {
          window.appController.navigateTo('screen-preparation');
        }
      });
    }
  }

  /**
   * Generate synthetic camera stream of a human model for simulation testing
   */
  async startMockCamera() {
    if (!this.video) this.video = document.getElementById('scan-video');
    if (!this.overlay) {
      this.overlay = document.getElementById('scan-overlay');
      if (this.overlay) this.ctx = this.overlay.getContext('2d');
    }

    this.stopStreamOnly();

    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    let startTime = Date.now();

    const drawFrame = () => {
      if (!this.active && !this.stream) return;
      const t = (Date.now() - startTime) / 1000;

      // Studio background
      ctx.fillStyle = '#181628';
      ctx.fillRect(0, 0, 1280, 720);

      // Floor grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let x = 160; x <= 1120; x += 160) {
        ctx.beginPath();
        ctx.moveTo(x, 480);
        ctx.lineTo(x + (x - 640) * 0.7, 720);
        ctx.stroke();
      }

      // Draw stylized full body human figure with natural posture and motion
      const centerX = 640 + Math.sin(t * 0.4) * 8;
      const armSway = Math.sin(t * 1.2) * 0.06;

      ctx.fillStyle = '#4A476D';

      // Head
      ctx.beginPath();
      ctx.arc(centerX, 150, 42, 0, Math.PI * 2);
      ctx.fill();

      // Neck & Shoulders
      ctx.beginPath();
      ctx.moveTo(centerX - 85, 220);
      ctx.lineTo(centerX + 85, 220);
      ctx.lineTo(centerX + 60, 420);
      ctx.lineTo(centerX - 60, 420);
      ctx.closePath();
      ctx.fill();

      // Left Arm
      ctx.save();
      ctx.translate(centerX - 85, 220);
      ctx.rotate(0.22 + armSway);
      ctx.fillRect(-14, 0, 28, 175);
      ctx.restore();

      // Right Arm
      ctx.save();
      ctx.translate(centerX + 85, 220);
      ctx.rotate(-0.22 - armSway);
      ctx.fillRect(-14, 0, 28, 175);
      ctx.restore();

      // Legs
      ctx.fillRect(centerX - 50, 420, 36, 240);
      ctx.fillRect(centerX + 14, 420, 36, 240);

      if (this.stream) {
        requestAnimationFrame(drawFrame);
      }
    };

    const mockStream = canvas.captureStream(30);
    this.stream = mockStream;
    this.video.srcObject = mockStream;
    this.video.setAttribute('autoplay', '');
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;

    try {
      await this.video.play();
    } catch (e) {}

    drawFrame();
    this.isMockMode = true;
    this.mockStartTime = Date.now();
    this.hideCameraError();
    console.log('[Camera] Started Simulation Mode camera stream.');
    return true;
  }

  /**
   * Request and initialize live camera MediaStream
   */
  async startCamera() {
    if (!this.video) this.video = document.getElementById('scan-video');
    if (!this.overlay) {
      this.overlay = document.getElementById('scan-overlay');
      if (this.overlay) this.ctx = this.overlay.getContext('2d');
    }

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('mock') === 'true' || urlParams.get('mockCamera') === 'true') {
      return await this.startMockCamera();
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      console.error('[Camera] getUserMedia API not supported in this environment.');
      return await this.startMockCamera();
    }

    this.isMockMode = false;

    try {
      this.stopStreamOnly();

      // Try user facing mode first, fall back to basic video constraint if needed
      let stream = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (err1) {
        console.warn('[Camera] facingMode: user failed, trying basic video constraint:', err1);
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        } catch (err2) {
          throw err2;
        }
      }

      if (!stream || stream.getVideoTracks().length === 0) {
        throw new Error('No active video track found in MediaStream.');
      }

      this.stream = stream;
      this.video.srcObject = this.stream;
      this.video.setAttribute('autoplay', '');
      this.video.setAttribute('playsinline', '');
      this.video.muted = true;

      // Play video explicitly
      try {
        await this.video.play();
      } catch (playErr) {
        console.warn('[Camera] video.play() deferred by browser:', playErr);
      }

      console.log('[Camera] Live MediaStream attached to <video> element:', {
        tracks: this.stream.getVideoTracks().map(t => ({ label: t.label, enabled: t.enabled, readyState: t.readyState })),
        videoWidth: this.video.videoWidth,
        videoHeight: this.video.videoHeight
      });

      this.hideCameraError();
      return true;

    } catch (error) {
      console.error('[Camera] Camera initialization error:', error);
      let errorMsg = 'Unable to access your camera. Please ensure camera access is allowed or click Simulation Mode to test.';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        errorMsg = 'Camera access was denied. You can allow camera permissions or try Simulation Mode below.';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        errorMsg = 'No camera hardware found on this device. You can try Simulation Mode below.';
      }
      this.showCameraError(errorMsg);
      return false;
    }
  }

  /**
   * Legacy method wrapper for compatibility
   */
  async requestPermission() {
    return await this.startCamera();
  }

  /**
   * Display Camera Error Modal
   */
  showCameraError(message) {
    const banner = document.getElementById('camera-error-banner');
    const textEl = document.getElementById('camera-error-text');
    if (textEl) textEl.textContent = message;
    if (banner) banner.classList.remove('hidden');
  }

  /**
   * Hide Camera Error Modal
   */
  hideCameraError() {
    const banner = document.getElementById('camera-error-banner');
    if (banner) banner.classList.add('hidden');
  }

  /**
   * Initialize audio context for beeps
   */
  initAudio() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  /**
   * Play synthesizer audio beep
   */
  playBeep(frequency = 440, durationSeconds = 0.15) {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + durationSeconds);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + durationSeconds);
    } catch (e) {}
  }

  /**
   * Starts scanning flow, opens live camera preview, and starts render loop
   */
  async startScan(onCompleteCallback) {
    this.phase = 'front';
    this.frontPhoto = null;
    this.sidePhoto = null;
    this.onComplete = onCompleteCallback;

    // Reset HUD steps
    const stepFront = document.getElementById('hud-step-front');
    const stepSide = document.getElementById('hud-step-side');
    const stepComp = document.getElementById('hud-step-complete');
    if (stepFront) stepFront.className = 'tracker-step active';
    if (stepSide) stepSide.className = 'tracker-step';
    if (stepComp) stepComp.className = 'tracker-step';

    const photoIndex = document.getElementById('hud-photo-index');
    if (photoIndex) photoIndex.textContent = 'PHOTO 1 OF 2';

    const instrEl = document.getElementById('hud-instruction-text');
    if (instrEl) instrEl.textContent = 'Position yourself inside the frame';

    // Set initial checklist items to unfulfilled
    const setCheckState = (id, isValid) => {
      const el = document.getElementById(id);
      if (el) el.className = isValid ? 'hud-check-item valid' : 'hud-check-item';
    };
    ['chk-person', 'chk-fullbody', 'chk-standing', 'chk-orientation', 'chk-stability'].forEach(id => setCheckState(id, false));

    window.scanQualityEngine.reset();
    window.scanQualityEngine.setPhase('front');

    // Ensure camera stream is requested and active
    const cameraSuccess = await this.startCamera();
    if (!cameraSuccess) {
      console.warn('[Camera] Halted startScan because camera failed to start.');
      return;
    }

    this.active = true;
    this.scanState = 'POSITIONING';
    this.captureSequenceActive = false;
    this.captureInProgress = false;
    this.isCompletingScan = false;

    this.resizeOverlay();
    window.removeEventListener('resize', this.boundResizeOverlay);
    this.boundResizeOverlay = () => this.resizeOverlay();
    window.addEventListener('resize', this.boundResizeOverlay);

    this.renderLoop();

    window.voiceEngine.speak("Position yourself inside the frame so your full body is visible.");
  }

  /**
   * Release camera stream tracks only
   */
  stopStreamOnly() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  /**
   * Stop render loop, cancel timers, and release camera hardware
   */
  stop() {
    this.active = false;
    this.isCountingDown = false;
    if (this.countdownTimer) clearInterval(this.countdownTimer);

    const countdownOverlay = document.getElementById('scan-countdown-overlay');
    if (countdownOverlay) countdownOverlay.classList.add('hidden');

    const reviewModal = document.getElementById('photo-review-modal');
    if (reviewModal) reviewModal.classList.add('hidden');

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.stopStreamOnly();
    window.voiceEngine.stop();
  }

  /**
   * Resize canvas overlay dimensions
   */
  resizeOverlay() {
    if (!this.overlay) return;
    const displayW = this.video ? (this.video.clientWidth || this.video.videoWidth || 640) : (this.overlay.clientWidth || 640);
    const displayH = this.video ? (this.video.clientHeight || this.video.videoHeight || 480) : (this.overlay.clientHeight || 480);
    if (displayW > 0 && displayH > 0) {
      this.overlay.width = displayW;
      this.overlay.height = displayH;
      this.ctx = this.overlay.getContext('2d');
    }
  }

  /**
   * Continuous processing & drawing loop with Canvas Resolution Sync and Capture Lock Guard
   */
  async renderLoop() {
    if (!this.active) return;

    // Synchronize overlay canvas resolution with video display bounds
    if (this.overlay && this.video) {
      const displayW = this.video.clientWidth || this.video.videoWidth || 640;
      const displayH = this.video.clientHeight || this.video.videoHeight || 480;
      if (displayW > 0 && displayH > 0 && (this.overlay.width !== displayW || this.overlay.height !== displayH)) {
        this.overlay.width = displayW;
        this.overlay.height = displayH;
      }
    }

    // CAPTURE LOCK / SEQUENCE GUARD:
    // If captureSequenceActive is true OR scanState is NOT POSITIONING,
    // IMMEDIATELY IGNORE pose updates and do NOT attempt to restart capture/voice!
    if (this.scanState === 'POSITIONING' && !this.captureSequenceActive) {
      if (this.isMockMode) {
        const elapsed = (Date.now() - (this.mockStartTime || Date.now())) / 1000;
        window.scanQualityEngine.injectMockLandmarks(elapsed);
      } else {
        // Send video frame to MediaPipe Pose detector
        await window.scanQualityEngine.processFrame(this.video);
      }

      // Evaluate posture quality
      const evalResult = window.scanQualityEngine.evaluateFrame(this.video);

      // Draw alignment guides and skeletal landmarks
      this.drawGuides(evalResult);

      // Update HUD display
      this.updateHUD(evalResult);

      // Voice guidance reminders (Patient state machine)
      this.triggerVoiceGuidance(evalResult);

      // Trigger sequential capture pipeline ONLY when user reaches overallReady and in POSITIONING state
      if (evalResult.overallReady && !this.captureSequenceActive) {
        this.runCaptureSequence();
      }
    }

    if (this.active) {
      this.animationFrameId = requestAnimationFrame(() => this.renderLoop());
    }
  }

  /**
   * Run explicit sequential capture pipeline:
   * POSITIONING -> CORRECT_POSITION -> CAPTURE_NOTICE -> COUNTDOWN -> CAPTURING
   */
  async runCaptureSequence() {
    if (this.captureSequenceActive) return;
    this.captureSequenceActive = true;
    this.scanState = 'CORRECT_POSITION';

    console.log('[Camera] Pose verified. Starting sequential speech & countdown flow.');

    // 1. STATE: CORRECT_POSITION
    const instructionText = document.getElementById('hud-instruction-text');
    const statusPill = document.getElementById('hud-visual-status-pill');

    const poseReadyText = this.phase === 'side' ? "Perfect! Hold still." : "Perfect! You're in position.";
    if (instructionText) instructionText.textContent = poseReadyText;
    if (statusPill) {
      statusPill.textContent = this.phase === 'side' ? "✓ Side profile ready" : "✓ Measurement pose ready";
      statusPill.className = "visual-status-pill status-correct";
    }

    // Speak pose ready notice
    await window.voiceEngine.speakAsync(poseReadyText);

    // Pause (~600ms) after instruction finishes
    await new Promise(r => setTimeout(r, 600));

    // 2. STATE: CAPTURE_NOTICE
    this.scanState = 'CAPTURE_NOTICE';
    const noticeMsg = this.phase === 'side' ? "Side profile ready — photo in 3…" : "Hold still — photo in 3…";
    if (instructionText) instructionText.textContent = noticeMsg;

    // Speak notice
    await window.voiceEngine.speakAsync(this.phase === 'side' ? "Hold still — side photo in 3..." : "Hold still — photo in 3...");

    // Pause (~400ms) after notice finishes
    await new Promise(r => setTimeout(r, 400));

    // 3. STATE: COUNTDOWN (3 -> 2 -> 1)
    this.scanState = 'COUNTDOWN';
    const overlay = document.getElementById('scan-countdown-overlay');
    const num = document.getElementById('countdown-number');

    if (overlay) overlay.classList.remove('hidden');

    for (let c = 3; c >= 1; c--) {
      if (num) num.textContent = c;
      this.playBeep(880, 0.12);
      await window.voiceEngine.speakAsync(String(c));
      await new Promise(r => setTimeout(r, 300));
    }

    if (overlay) overlay.classList.add('hidden');

    // 4. STATE: CAPTURING
    this.scanState = 'CAPTURING';
    this.capturePhoto();
  }

  /**
   * Draw posture guidelines, camera framing bounds, real-time skeleton overlay, and directional arrows on canvas
   */
  drawGuides(evalResult) {
    if (!this.ctx || !this.overlay || !this.video) return;
    const w = this.overlay.width;
    const h = this.overlay.height;
    this.ctx.clearRect(0, 0, w, h);

    if (!evalResult) return;

    // Helper to calculate exact screen coordinates taking video object-fit: cover into account
    const getCoords = (pt) => {
      const vW = (this.video && this.video.videoWidth) ? this.video.videoWidth : w;
      const vH = (this.video && this.video.videoHeight) ? this.video.videoHeight : h;
      const vAspect = vW / vH;
      const cAspect = w / h;

      let rW, rH, offX, offY;
      if (cAspect > vAspect) {
        rW = w;
        rH = w / vAspect;
        offX = 0;
        offY = (h - rH) / 2;
      } else {
        rH = h;
        rW = h * vAspect;
        offX = (w - rW) / 2;
        offY = 0;
      }

      return {
        x: pt.x * rW + offX,
        y: pt.y * rH + offY
      };
    };

    // Determine status color scheme
    let themeColor = 'rgba(245, 158, 11, 0.85)'; // Amber = searching/positioning
    let strokeColor = 'rgba(245, 158, 11, 0.85)';
    let nodeFill = '#F59E0B';

    if (evalResult.overallReady) {
      themeColor = 'rgba(16, 185, 129, 0.95)'; // Emerald Green = READY
      strokeColor = 'rgba(16, 185, 129, 0.95)';
      nodeFill = '#10B981';
    } else if (evalResult.checklist && evalResult.checklist.personDetected) {
      themeColor = 'rgba(197, 160, 89, 0.90)'; // Brand Gold = TRACKING
      strokeColor = 'rgba(197, 160, 89, 0.90)';
      nodeFill = '#C5A059';
    }

    // 1. Fixed framing envelope box & target positioning guide
    const boxW = Math.min(w * 0.52, 280);
    const boxH = h * 0.84;
    const boxX = (w - boxW) / 2;
    const boxY = (h - boxH) / 2;

    this.ctx.strokeStyle = strokeColor;
    this.ctx.lineWidth = 3;
    this.ctx.setLineDash([8, 6]);
    this.ctx.strokeRect(boxX, boxY, boxW, boxH);
    this.ctx.setLineDash([]);

    // Subtle background target framing silhouette guides
    this.ctx.strokeStyle = 'rgba(197, 160, 89, 0.30)';
    this.ctx.lineWidth = 1.5;

    // Head Guide Oval
    this.ctx.beginPath();
    this.ctx.arc(w / 2, boxY + 55, 24, 0, Math.PI * 2);
    this.ctx.stroke();

    // Shoulder Guide Line
    this.ctx.beginPath();
    this.ctx.moveTo(w / 2 - 50, boxY + 115);
    this.ctx.lineTo(w / 2 + 50, boxY + 115);
    this.ctx.stroke();

    // Torso Side Guide Lines
    this.ctx.beginPath();
    this.ctx.moveTo(w / 2 - 45, boxY + 115);
    this.ctx.lineTo(w / 2 - 35, boxY + 280);
    this.ctx.moveTo(w / 2 + 45, boxY + 115);
    this.ctx.lineTo(w / 2 + 35, boxY + 280);
    this.ctx.stroke();

    // Feet Base Line
    this.ctx.beginPath();
    this.ctx.moveTo(w / 2 - 45, boxY + boxH - 25);
    this.ctx.lineTo(w / 2 + 45, boxY + boxH - 25);
    this.ctx.stroke();

    // 2. Draw live joint-based body tracking grid & skeleton on top of detected person
    const lm = evalResult.landmarks;
    if (evalResult.checklist && evalResult.checklist.personDetected && lm && lm.length >= 33) {
      const isPointValid = (pt) => pt && (pt.visibility === undefined || pt.visibility > 0.15);

      const drawNode = (pt) => {
        if (!isPointValid(pt)) return;
        const pos = getCoords(pt);

        // Outer glowing halo
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2);
        this.ctx.fillStyle = evalResult.overallReady ? 'rgba(16, 185, 129, 0.35)' : 'rgba(197, 160, 89, 0.35)';
        this.ctx.fill();

        // Solid joint node
        this.ctx.beginPath();
        this.ctx.arc(pos.x, pos.y, 5, 0, Math.PI * 2);
        this.ctx.fillStyle = nodeFill;
        this.ctx.fill();
        this.ctx.strokeStyle = '#FFFFFF';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
      };

      const drawBone = (p1, p2) => {
        if (!isPointValid(p1) || !isPointValid(p2)) return;
        const pos1 = getCoords(p1);
        const pos2 = getCoords(p2);

        this.ctx.beginPath();
        this.ctx.moveTo(pos1.x, pos1.y);
        this.ctx.lineTo(pos2.x, pos2.y);
        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = 3.5;
        this.ctx.stroke();
      };

      // Extract key landmark points
      const nose = lm[0];
      const lShoulder = lm[11], rShoulder = lm[12];
      const lElbow = lm[13], rElbow = lm[14];
      const lWrist = lm[15], rWrist = lm[16];
      const lHip = lm[23], rHip = lm[24];
      const lKnee = lm[25], rKnee = lm[26];
      const lAnkle = lm[27], rAnkle = lm[28];
      const lFoot = lm[31], rFoot = lm[32];

      const midShoulder = {
        x: (lShoulder.x + rShoulder.x) / 2,
        y: (lShoulder.y + rShoulder.y) / 2,
        visibility: Math.min(lShoulder.visibility !== undefined ? lShoulder.visibility : 0.8, rShoulder.visibility !== undefined ? rShoulder.visibility : 0.8)
      };

      const midHip = {
        x: (lHip.x + rHip.x) / 2,
        y: (lHip.y + rHip.y) / 2,
        visibility: Math.min(lHip.visibility !== undefined ? lHip.visibility : 0.8, rHip.visibility !== undefined ? rHip.visibility : 0.8)
      };

      // Head to neck/mid-shoulder
      drawBone(nose, midShoulder);

      // Shoulders line
      drawBone(lShoulder, rShoulder);

      // Left Arm
      drawBone(lShoulder, lElbow);
      drawBone(lElbow, lWrist);

      // Right Arm
      drawBone(rShoulder, rElbow);
      drawBone(rElbow, rWrist);

      // Torso & Spine Grid
      drawBone(lShoulder, lHip);
      drawBone(rShoulder, rHip);
      drawBone(lHip, rHip);
      drawBone(midShoulder, midHip);

      // Left Leg & Foot
      drawBone(lHip, lKnee);
      drawBone(lKnee, lAnkle);
      drawBone(lAnkle, lFoot);

      // Right Leg & Foot
      drawBone(rHip, rKnee);
      drawBone(rKnee, rAnkle);
      drawBone(rAnkle, rFoot);

      // Draw Joint Nodes
      [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 31, 32].forEach(idx => drawNode(lm[idx]));
    }

    // 3. Directional Guidance Banner overlay (Un-mirrored text context)
    if (evalResult.directionalText && evalResult.directionalText !== 'NONE' && evalResult.directionalText !== 'Searching for body...') {
      const bannerY = boxY + 16;
      const text = evalResult.directionalText || '';

      this.ctx.save();
      // Un-mirror text drawing since canvas CSS has transform: scaleX(-1)
      this.ctx.translate(w, 0);
      this.ctx.scale(-1, 1);

      this.ctx.font = '600 14px Inter, sans-serif';
      const textWidth = this.ctx.measureText(text).width;
      const bannerW = textWidth + 36;
      const bannerX = (w - bannerW) / 2;

      this.ctx.fillStyle = evalResult.overallReady ? 'rgba(16, 185, 129, 0.95)' : 'rgba(30, 27, 75, 0.85)';
      this.ctx.beginPath();
      this.ctx.roundRect(bannerX, bannerY, bannerW, 32, 16);
      this.ctx.fill();
      this.ctx.strokeStyle = evalResult.overallReady ? '#10B981' : '#C5A059';
      this.ctx.lineWidth = 1.5;
      this.ctx.stroke();

      this.ctx.fillStyle = '#FFFFFF';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText(text, w / 2, bannerY + 16);

      this.ctx.restore();
    }
  }

  /**
   * Update visual checklist HUD, text, and real confidence meter
   */
  updateHUD(evalResult) {
    if (!evalResult) return;

    // Temporal smoothing for HUD instruction text
    if (evalResult.instructionId !== this.pendingInstructionId) {
      this.pendingInstructionId = evalResult.instructionId;
      this.pendingInstructionCount = 1;
    } else {
      this.pendingInstructionCount = (this.pendingInstructionCount || 0) + 1;
    }

    if (this.pendingInstructionCount >= 3) {
      const textEl = document.getElementById('hud-instruction-text');
      if (textEl && evalResult.instruction) {
        textEl.textContent = evalResult.instruction;
      }
    }

    const setCheckState = (id, isValid) => {
      const el = document.getElementById(id);
      if (el) el.className = isValid ? 'hud-check-item valid' : 'hud-check-item';
    };

    const chk = evalResult.checklist || {};
    setCheckState('chk-person', chk.personDetected);
    setCheckState('chk-fullbody', chk.fullBodyVisible);
    setCheckState('chk-standing', chk.standingUpright);
    setCheckState('chk-orientation', chk.facingDirection);
    setCheckState('chk-stability', chk.holdingStill);

    // Update Visual Status Pill
    const pillEl = document.getElementById('hud-visual-status-pill');
    if (pillEl) {
      const statusText = evalResult.visualStatus || '● Searching for body';
      pillEl.textContent = statusText;
      if (statusText.includes('ready') || statusText.includes('✓') || evalResult.overallReady) {
        pillEl.className = 'visual-status-pill status-correct';
      } else if (statusText.includes('Almost') || statusText.includes('Tracking')) {
        pillEl.className = 'visual-status-pill status-almost';
      } else {
        pillEl.className = 'visual-status-pill status-adjusting';
      }
    }

    // Update Real Landmark Tracking Confidence Meter
    const confValEl = document.getElementById('confidence-value');
    if (confValEl) {
      const confPct = evalResult.trackingConfidence || 0;
      confValEl.textContent = `${confPct}%`;

      const dotsContainer = document.getElementById('confidence-dots');
      if (dotsContainer) {
        const dots = dotsContainer.querySelectorAll('.dot');
        const activeCount = Math.round((confPct / 100) * dots.length);
        dots.forEach((dot, idx) => {
          if (idx < activeCount) {
            dot.classList.add('active');
          } else {
            dot.classList.remove('active');
          }
        });
      }
    }
  }

  /**
   * Patient Voice Guidance State Machine Trigger
   */
  triggerVoiceGuidance(evalResult) {
    if (!evalResult || !evalResult.instructionId || !evalResult.instruction) return;
    window.voiceEngine.speakInstruction(
      evalResult.instructionId,
      evalResult.instruction,
      evalResult.priority || 5,
      2800 // 2.8s patient cooldown
    );
  }

  /**
   * Start 3... 2... 1... countdown trigger
   */
  startCountdown() {
    this.scanState = 'CAPTURING';
    this.isCountingDown = true;
    this.countdownValue = 3;

    const overlay = document.getElementById('scan-countdown-overlay');
    const num = document.getElementById('countdown-number');

    if (overlay) overlay.classList.remove('hidden');
    if (num) num.textContent = this.countdownValue;
    this.playBeep(880, 0.12);

    window.voiceEngine.speak("3");

    this.countdownTimer = setInterval(() => {
      this.countdownValue--;
      if (this.countdownValue > 0) {
        if (num) num.textContent = this.countdownValue;
        this.playBeep(880, 0.12);
        window.voiceEngine.speak(String(this.countdownValue));
      } else {
        clearInterval(this.countdownTimer);
        this.capturePhoto();
      }
    }, 1000);
  }

  /**
   * Abort countdown immediately if user moves or pose breaks
   */
  cancelCountdown(reason) {
    if (this.scanState === 'CAPTURING' || this.captureInProgress) return;
    this.isCountingDown = false;
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    const overlay = document.getElementById('scan-countdown-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  /**
   * Capture photo frame directly from live video stream element
   */
  capturePhoto() {
    this.scanState = 'CAPTURED';
    this.captureInProgress = true;
    window.voiceEngine.stop();

    const overlay = document.getElementById('scan-countdown-overlay');
    if (overlay) overlay.classList.add('hidden');
    this.isCountingDown = false;

    // Flash & Shutter beep
    this.playBeep(1600, 0.25);
    const flash = document.getElementById('camera-flash');
    if (flash) {
      flash.classList.remove('hidden');
      setTimeout(() => flash.classList.add('hidden'), 400);
    }

    // Render frame from live video element onto offscreen canvas
    const canvas = document.createElement('canvas');
    const vw = (this.video && this.video.videoWidth) ? this.video.videoWidth : 1280;
    const vh = (this.video && this.video.videoHeight) ? this.video.videoHeight : 720;
    canvas.width = vw;
    canvas.height = vh;

    const ctx = canvas.getContext('2d');
    // Mirror horizontally so saved image matches user's selfie view
    ctx.translate(vw, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(this.video, 0, 0, vw, vh);

    this.pendingCapturePhoto = canvas.toDataURL('image/jpeg', 0.92);

    // Show Photo Review Modal
    this.showPhotoReviewModal();
  }

  /**
   * Show Photo Review Modal with strict Measurement Pose verification check
   */
  showPhotoReviewModal() {
    const modal = document.getElementById('photo-review-modal');
    const img = document.getElementById('review-image-preview');
    const title = document.getElementById('review-title');
    const subtitle = document.getElementById('review-subtitle');
    const statusBadge = document.getElementById('review-badge-status');
    const btnUse = document.getElementById('btn-review-use');

    if (title) title.textContent = this.phase === 'front' ? 'Review Front View Photo' : 'Review Side View Photo';
    if (img) img.src = this.pendingCapturePhoto;

    // Run geometric posture validation on latest keypoints
    const lm = window.scanQualityEngine.latestLandmarks;
    const evalResult = window.scanQualityEngine.evaluateLandmarks(lm, this.phase);

    const isMeasurementReady = (evalResult.valid && evalResult.checklist.standingUpright && evalResult.checklist.facingDirection && evalResult.poseScore >= 80);

    if (isMeasurementReady) {
      if (statusBadge) {
        statusBadge.textContent = '✓ Measurement Pose Verified';
        statusBadge.className = 'review-status-badge review-badge-success';
      }
      if (subtitle) {
        subtitle.textContent = 'Full body posture is verified and ready for measurement extraction.';
      }
      if (btnUse) {
        btnUse.disabled = false;
        btnUse.classList.remove('disabled');
      }
      window.voiceEngine.speak("Review your captured photo. Measurement posture is verified.");
    } else {
      const issueReason = evalResult.instruction ? (`${evalResult.instruction}. Stand upright and retake the photo.`) : 'Posture needs adjustment. Stand upright and retake the photo.';
      if (statusBadge) {
        statusBadge.textContent = '⚠ Posture Needs Adjustment';
        statusBadge.className = 'review-status-badge review-badge-invalid';
      }
      if (subtitle) {
        subtitle.textContent = issueReason;
      }
      if (btnUse) {
        btnUse.disabled = true;
        btnUse.classList.add('disabled');
      }
      window.voiceEngine.speak(`Posture needs adjustment: ${evalResult.instruction || "Stand up straight"}. Click Retake to try again.`);
    }

    if (modal) modal.classList.remove('hidden');
  }

  /**
   * Handle Photo Review confirmation ("Use Photo")
   */
  handleReviewConfirm() {
    const modal = document.getElementById('photo-review-modal');
    if (modal) modal.classList.add('hidden');

    if (this.phase === 'front') {
      this.frontPhoto = this.pendingCapturePhoto;
      this.pendingCapturePhoto = null;
      console.log('[Camera] Front view confirmed.');

      this.phase = 'side';
      this.scanState = 'POSITIONING';
      this.captureSequenceActive = false;
      this.captureInProgress = false;

      const stepFront = document.getElementById('hud-step-front');
      const stepSide = document.getElementById('hud-step-side');
      if (stepFront) stepFront.className = 'tracker-step done';
      if (stepSide) stepSide.className = 'tracker-step active';

      const photoIndex = document.getElementById('hud-photo-index');
      if (photoIndex) photoIndex.textContent = 'PHOTO 2 OF 2';

      const instructionText = document.getElementById('hud-instruction-text');
      if (instructionText) instructionText.textContent = 'Front scan complete ✓ — Turn 90° to your side';

      const statusPill = document.getElementById('hud-visual-status-pill');
      if (statusPill) {
        statusPill.textContent = 'Turn to your side';
        statusPill.className = 'visual-status-pill status-adjusting';
      }

      window.scanQualityEngine.setPhase('side');
      window.voiceEngine.speak("Front scan complete! Now turn 90° to your side.");

    } else if (this.phase === 'side') {
      if (this.isCompletingScan) return;
      this.isCompletingScan = true;

      this.sidePhoto = this.pendingCapturePhoto;
      this.pendingCapturePhoto = null;
      console.log('[Camera] Side view confirmed. Executing explicit scan-completion sequence.');

      this.scanState = 'SCAN_COMPLETE';
      this.captureInProgress = true;
      this.phase = 'complete';

      const stepSide = document.getElementById('hud-step-side');
      const stepComp = document.getElementById('hud-step-complete');
      if (stepSide) stepSide.className = 'tracker-step done';
      if (stepComp) stepComp.className = 'tracker-step active';

      const instructionText = document.getElementById('hud-instruction-text');
      if (instructionText) instructionText.textContent = "Your scan is completed. We're now calculating your measurements.";

      const statusPill = document.getElementById('hud-visual-status-pill');
      if (statusPill) {
        statusPill.textContent = '✓ Both scans complete';
        statusPill.className = 'visual-status-pill status-correct';
      }

      // COMPLETION_MESSAGE state: Wait for full voice narration to complete before calculating
      (async () => {
        await window.voiceEngine.speakAsync("Your scan is completed. We're now calculating your measurements.");

        // Brief delay after sentence finishes
        await new Promise(r => setTimeout(r, 400));

        // CALCULATING state: Stop camera & transition to measurement calculation
        this.scanState = 'CALCULATING';
        this.stop();
        if (this.onComplete) {
          this.onComplete(this.frontPhoto, this.sidePhoto);
        }
      })();
    }
  }

  /**
   * Handle Photo Review retake ("Retake")
   */
  handleReviewRetake() {
    const modal = document.getElementById('photo-review-modal');
    if (modal) modal.classList.add('hidden');
    this.pendingCapturePhoto = null;
    this.scanState = 'POSITIONING';
    this.captureInProgress = false;
    window.scanQualityEngine.reset();
    window.voiceEngine.speak("Let's retake this view. Reposition yourself in front of the camera.");
  }
}

// Instantiate camera manager globally
const cameraManager = new CameraManager();
window.cameraManager = cameraManager;
