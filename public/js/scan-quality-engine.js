/**
 * Real-Time Person Detection & Dynamic Body Tracking Engine
 * Continuous MediaPipe Pose landmark tracking with instant person detection,
 * smooth real-time skeleton overlay rendering, landmark tracking confidence,
 * dynamic visual directional guidance arrows, strict 90° Side vs Front profile geometry,
 * single prioritized instructions, and landmark validation for Photo Upload Mode.
 */
class ScanQualityEngine {
  constructor() {
    this.pose = null;
    this.latestLandmarks = null;
    this.smoothedLandmarks = null;
    this.isInitialized = false;

    // Scan Phase ('front' | 'side')
    this.phase = 'front';

    // Multi-frame posture stability tracking (requires 15 consecutive frames ~ 1.0s)
    this.stableFrameCount = 0;
    this.REQUIRED_STABLE_FRAMES = 15;
    this.previousKeypoints = null;
    this.STABILITY_THRESHOLD = 0.016;

    this.initMediaPipePose();
  }

  /**
   * Initialize MediaPipe Pose API
   */
  initMediaPipePose() {
    if (typeof window.Pose !== 'undefined') {
      try {
        this.pose = new window.Pose({
          locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
        });

        this.pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.35,
          minTrackingConfidence: 0.35
        });

        this.pose.onResults((results) => {
          if (results && results.poseLandmarks && results.poseLandmarks.length >= 33) {
            this.updateLandmarks(results.poseLandmarks);
          } else {
            this.latestLandmarks = null;
            this.smoothedLandmarks = null;
          }
        });

        this.isInitialized = true;
        console.log('[ScanQualityEngine] MediaPipe Pose Landmarker initialized with instant tracking.');
      } catch (err) {
        console.warn('[ScanQualityEngine] Failed to load MediaPipe Pose:', err);
      }
    } else {
      setTimeout(() => this.initMediaPipePose(), 1000);
    }
  }

  /**
   * Smooth keypoint coordinates across consecutive frames (Alpha blend)
   */
  updateLandmarks(rawLm) {
    this.latestLandmarks = rawLm;

    if (!this.smoothedLandmarks) {
      this.smoothedLandmarks = rawLm.map(pt => ({ ...pt }));
      return;
    }

    const alpha = 0.70; // 70% current frame, 30% previous frame for silky smooth movement
    for (let i = 0; i < rawLm.length; i++) {
      if (rawLm[i] && this.smoothedLandmarks[i]) {
        this.smoothedLandmarks[i].x = alpha * rawLm[i].x + (1 - alpha) * this.smoothedLandmarks[i].x;
        this.smoothedLandmarks[i].y = alpha * rawLm[i].y + (1 - alpha) * this.smoothedLandmarks[i].y;
        this.smoothedLandmarks[i].z = alpha * (rawLm[i].z || 0) + (1 - alpha) * (this.smoothedLandmarks[i].z || 0);
        this.smoothedLandmarks[i].visibility = rawLm[i].visibility !== undefined ? rawLm[i].visibility : 0.85;
      }
    }
  }

  /**
   * Process a single video frame asynchronously with MediaPipe Pose
   * @param {HTMLVideoElement} video 
   */
  async processFrame(video) {
    if (this.pose && video && video.readyState >= 2 && video.videoWidth > 0) {
      try {
        await this.pose.send({ image: video });
      } catch (e) {}
    }
  }

  /**
   * Reset tracking counters
   */
  reset() {
    this.stableFrameCount = 0;
    this.previousKeypoints = null;
    this.latestLandmarks = null;
    this.smoothedLandmarks = null;
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseStartTime = Date.now();
    this.reset();
  }

  /**
   * Inject synthetic 33 pose landmark keypoints for Simulation / Test Mode
   * @param {number} t - Elapsed time seconds
   */
  injectMockLandmarks(t = 0) {
    const isSide = this.phase === 'side';
    const swayX = Math.sin(t * 0.4) * 0.008;
    const armMotion = Math.sin(t * 1.2) * 0.02;

    const lm = [];
    for (let i = 0; i < 33; i++) {
      lm.push({ x: 0.5, y: 0.5, z: 0, visibility: 0.95 });
    }

    const headX = 0.50 + swayX;
    const headY = 0.18;

    // 0: Nose
    lm[0] = { x: headX, y: headY, z: -0.1, visibility: 0.98 };
    // 1-6: Eyes
    lm[1] = { x: headX - 0.015, y: headY - 0.01, z: -0.1, visibility: 0.95 };
    lm[2] = { x: headX - 0.02, y: headY - 0.01, z: -0.1, visibility: 0.95 };
    lm[3] = { x: headX - 0.025, y: headY - 0.01, z: -0.1, visibility: 0.95 };
    lm[4] = { x: headX + 0.015, y: headY - 0.01, z: -0.1, visibility: 0.95 };
    lm[5] = { x: headX + 0.02, y: headY - 0.01, z: -0.1, visibility: 0.95 };
    lm[6] = { x: headX + 0.025, y: headY - 0.01, z: -0.1, visibility: 0.95 };

    // 7-8: Ears
    lm[7] = { x: headX - 0.035, y: headY, z: 0, visibility: 0.90 };
    lm[8] = { x: headX + 0.035, y: headY, z: 0, visibility: 0.90 };

    if (!isSide) {
      // Front View
      const shoulderY = 0.28;
      const lShoulderX = headX - 0.11;
      const rShoulderX = headX + 0.11;

      lm[11] = { x: lShoulderX, y: shoulderY, z: 0, visibility: 0.96 };
      lm[12] = { x: rShoulderX, y: shoulderY, z: 0, visibility: 0.96 };

      // Arms (slightly away from body)
      lm[13] = { x: lShoulderX - 0.04 - armMotion, y: 0.42, z: 0, visibility: 0.95 };
      lm[14] = { x: rShoulderX + 0.04 + armMotion, y: 0.42, z: 0, visibility: 0.95 };
      lm[15] = { x: lShoulderX - 0.07 - armMotion, y: 0.54, z: 0, visibility: 0.95 };
      lm[16] = { x: rShoulderX + 0.07 + armMotion, y: 0.54, z: 0, visibility: 0.95 };

      // Hips
      const hipY = 0.54;
      const lHipX = headX - 0.07;
      const rHipX = headX + 0.07;
      lm[23] = { x: lHipX, y: hipY, z: 0, visibility: 0.95 };
      lm[24] = { x: rHipX, y: hipY, z: 0, visibility: 0.95 };

      // Knees & Ankles
      lm[25] = { x: lHipX, y: 0.70, z: 0, visibility: 0.95 };
      lm[26] = { x: rHipX, y: 0.70, z: 0, visibility: 0.95 };
      lm[27] = { x: lHipX, y: 0.85, z: 0, visibility: 0.95 };
      lm[28] = { x: rHipX, y: 0.85, z: 0, visibility: 0.95 };

      // Feet
      lm[29] = { x: lHipX - 0.01, y: 0.87, z: 0.05, visibility: 0.92 };
      lm[30] = { x: rHipX + 0.01, y: 0.87, z: 0.05, visibility: 0.92 };
      lm[31] = { x: lHipX - 0.02, y: 0.89, z: -0.05, visibility: 0.92 };
      lm[32] = { x: rHipX + 0.02, y: 0.89, z: -0.05, visibility: 0.92 };

    } else {
      // Side View (Dynamic rotation interpolation from front to side profile over ~1.8s)
      const elapsedSide = (Date.now() - (this.phaseStartTime || Date.now())) / 1000;
      const rotProgress = Math.min(1.0, Math.max(0.0, elapsedSide / 1.8));

      const halfWidth = 0.11 * (1.0 - 0.82 * rotProgress);
      const dzVal = 0.14 * rotProgress;

      const shoulderY = 0.28;
      const lShoulderX = headX - halfWidth;
      const rShoulderX = headX + halfWidth;

      lm[11] = { x: lShoulderX, y: shoulderY, z: -dzVal, visibility: 0.96 };
      lm[12] = { x: rShoulderX, y: shoulderY, z: dzVal, visibility: 0.96 - 0.15 * rotProgress };

      lm[13] = { x: lShoulderX + (0.02 * rotProgress), y: 0.42, z: -dzVal, visibility: 0.95 };
      lm[14] = { x: rShoulderX + (0.02 * rotProgress), y: 0.42, z: dzVal, visibility: 0.95 - 0.15 * rotProgress };
      lm[15] = { x: lShoulderX + (0.04 * rotProgress), y: 0.54, z: -dzVal, visibility: 0.95 };
      lm[16] = { x: rShoulderX + (0.04 * rotProgress), y: 0.54, z: dzVal, visibility: 0.95 - 0.15 * rotProgress };

      const hipY = 0.54;
      const halfHipWidth = 0.07 * (1.0 - 0.82 * rotProgress);
      lm[23] = { x: headX - halfHipWidth, y: hipY, z: -dzVal * 0.8, visibility: 0.95 };
      lm[24] = { x: headX + halfHipWidth, y: hipY, z: dzVal * 0.8, visibility: 0.95 - 0.15 * rotProgress };

      lm[25] = { x: headX - halfHipWidth, y: 0.70, z: -dzVal * 0.8, visibility: 0.95 };
      lm[26] = { x: headX + halfHipWidth, y: 0.70, z: dzVal * 0.8, visibility: 0.95 - 0.15 * rotProgress };
      lm[27] = { x: headX - halfHipWidth, y: 0.85, z: -dzVal * 0.8, visibility: 0.95 };
      lm[28] = { x: headX + halfHipWidth, y: 0.85, z: dzVal * 0.8, visibility: 0.95 - 0.15 * rotProgress };

      lm[31] = { x: headX - halfHipWidth + 0.02 * rotProgress, y: 0.89, z: -dzVal * 0.8, visibility: 0.92 };
      lm[32] = { x: headX + halfHipWidth + 0.02 * rotProgress, y: 0.89, z: dzVal * 0.8, visibility: 0.92 - 0.15 * rotProgress };
    }

    this.updateLandmarks(lm);
  }

  calculateAngle(a, b, c) {
    if (!a || !b || !c) return 180;
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360.0 - angle;
    return angle;
  }

  /**
   * Calculates estimated body rotation angle in degrees relative to camera image plane.
   * 0° = Full Front facing, 90° = Side profile facing left/right.
   * 
   * @param {Array} lm - MediaPipe 33 Landmark keypoints
   * @returns {Object} Orientation metrics { angleDeg, isSideProfile, rotationPhase }
   */
  calculateBodyOrientation(lm) {
    if (!lm || lm.length < 33) {
      return { angleDeg: 0, isSideProfile: false, rotationPhase: 'FRONT' };
    }

    const lShoulder = lm[11], rShoulder = lm[12];
    const lHip = lm[23], rHip = lm[24];

    // 1. 2D projection shoulder & hip widths
    const shoulderDx = Math.abs(lShoulder.x - rShoulder.x);
    const hipDx = Math.abs(lHip.x - rHip.x);

    // 2. 3D depth difference (z component provided by MediaPipe)
    const shoulderDz = Math.abs((lShoulder.z || 0) - (rShoulder.z || 0));
    const hipDz = Math.abs((lHip.z || 0) - (rHip.z || 0));

    // 3. Trigonometric rotation angle estimation from 3D coords
    const angleShoulderRad = Math.atan2(shoulderDz, Math.max(0.008, shoulderDx));
    const angleHipRad = Math.atan2(hipDz, Math.max(0.008, hipDx));

    const angleShoulderDeg = (angleShoulderRad * 180) / Math.PI;
    const angleHipDeg = (angleHipRad * 180) / Math.PI;

    // 4. Width ratio estimation (relative to standard front width ~ 0.22)
    const widthRatio = Math.min(1.0, Math.max(0.0, shoulderDx / 0.22));
    const angleFromWidth = Math.acos(widthRatio) * (180 / Math.PI);

    // Composite angle estimate (weighted blend of 3D depth geometry & 2D width contraction)
    const estimatedAngleDeg = Math.round(0.60 * angleShoulderDeg + 0.40 * angleFromWidth);

    // Determine state phase
    let rotationPhase = 'FRONT';
    if (estimatedAngleDeg >= 68 || shoulderDx < 0.095) {
      rotationPhase = 'SIDE';
    } else if (estimatedAngleDeg >= 48) {
      rotationPhase = 'ALMOST';
    } else if (estimatedAngleDeg >= 25) {
      rotationPhase = 'TURNING';
    }

    const isSideProfile = rotationPhase === 'SIDE' || shoulderDx < 0.095 || hipDx < 0.095;

    return {
      angleDeg: estimatedAngleDeg,
      shoulderDx,
      hipDx,
      isSideProfile,
      rotationPhase
    };
  }

  /**
   * Evaluates keypoint geometry with strict Person Detection & Posture Rules.
   * Returns tracking confidence %, visual status state, directional arrows, and single prioritized instruction.
   * 
   * @param {Array} lm - MediaPipe 33 Landmark keypoints
   * @param {string} phase - 'front' | 'side'
   * @returns {Object} Evaluation result
   */
  evaluateLandmarks(lm, phase = 'front') {
    const checklist = {
      personDetected: false,
      fullBodyVisible: false,
      standingUpright: false,
      facingDirection: false,
      holdingStill: false
    };

    // 1. PERSON DETECTION CHECK:
    if (!lm || lm.length < 33) {
      return {
        valid: false,
        overallReady: false,
        poseScore: 0,
        trackingConfidence: 0,
        stateName: 'SEARCHING',
        visualStatus: '● Searching for body',
        directionalArrow: 'NONE',
        directionalText: 'Searching for body...',
        instructionId: 'NO_PERSON',
        priority: 1,
        instruction: 'Step into the camera view',
        checklist,
        landmarks: null
      };
    }

    // MediaPipe Pose returned 33 landmarks -> A PERSON IS DETECTED IN CAMERA FEED!
    checklist.personDetected = true;

    // Calculate real landmark tracking confidence score (0 to 100%)
    const keyIndices = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
    const visSum = keyIndices.reduce((acc, idx) => {
      const v = lm[idx] ? (typeof lm[idx].visibility === 'number' ? lm[idx].visibility : 0.85) : 0;
      return acc + v;
    }, 0);
    const trackingConfidence = Math.min(100, Math.max(35, Math.round((visSum / keyIndices.length) * 100)));

    // Extract key anatomical landmarks
    const nose = lm[0];
    const lEye = lm[2], rEye = lm[5];
    const lEar = lm[7], rEar = lm[8];
    const lShoulder = lm[11], rShoulder = lm[12];
    const lElbow = lm[13], rElbow = lm[14];
    const lWrist = lm[15], rWrist = lm[16];
    const lHip = lm[23], rHip = lm[24];
    const lKnee = lm[25], rKnee = lm[26];
    const lAnkle = lm[27], rAnkle = lm[28];
    const lHeel = lm[29], rHeel = lm[30];

    const getVis = (pt) => (pt && typeof pt.visibility === 'number' ? pt.visibility : 0.85);

    const midHipX = (lHip.x + rHip.x) / 2;
    const midHipY = (lHip.y + rHip.y) / 2;
    const midShoulderX = (lShoulder.x + rShoulder.x) / 2;
    const midShoulderY = (lShoulder.y + rShoulder.y) / 2;

    const headY = Math.min(nose.y, lEye.y, rEye.y);
    const ankleY = Math.max(lAnkle.y, rAnkle.y);
    const bodySpanY = ankleY - headY;

    // 2. FULL BODY VISIBILITY (Head & Feet)
    const headVisible = (getVis(nose) > 0.15 || getVis(lEye) > 0.15 || getVis(rEye) > 0.15) && headY >= 0.01 && headY <= 0.48;
    const feetVisible = (getVis(lAnkle) > 0.15 || getVis(rAnkle) > 0.15 || getVis(lHeel) > 0.15 || getVis(rHeel) > 0.15) && ankleY >= 0.52 && ankleY <= 0.99;

    if (!headVisible || !feetVisible) {
      let msg = 'Step back so your full body is visible.';
      let id = 'NOT_FULL_BODY';
      if (!feetVisible && headVisible) {
        msg = 'Step back so your feet are inside the frame.';
        id = 'FEET_NOT_VISIBLE';
      } else if (!headVisible && feetVisible) {
        msg = 'Step back so your head is visible.';
        id = 'HEAD_NOT_VISIBLE';
      }
      return {
        valid: false,
        overallReady: false,
        poseScore: 35,
        trackingConfidence,
        stateName: 'TRACKING',
        visualStatus: '● Person detected',
        directionalArrow: 'DOWN',
        directionalText: '↓ Step back',
        instructionId: id,
        priority: 2,
        instruction: msg,
        checklist,
        landmarks: lm
      };
    }

    // 3. DISTANCE (Too close / Too far)
    if (bodySpanY > 0.88 || nose.y < 0.04) {
      return {
        valid: false,
        overallReady: false,
        poseScore: 40,
        trackingConfidence,
        stateName: 'TRACKING',
        visualStatus: '● Tracking body',
        directionalArrow: 'DOWN',
        directionalText: '↓ Step back',
        instructionId: 'TOO_CLOSE',
        priority: 3,
        instruction: 'Take a step back.',
        checklist,
        landmarks: lm
      };
    }

    if (bodySpanY < 0.45) {
      return {
        valid: false,
        overallReady: false,
        poseScore: 40,
        trackingConfidence,
        stateName: 'TRACKING',
        visualStatus: '● Tracking body',
        directionalArrow: 'UP',
        directionalText: '↑ Step closer',
        instructionId: 'TOO_FAR',
        priority: 3,
        instruction: 'Move a little closer.',
        checklist,
        landmarks: lm
      };
    }

    // 4. CENTERING (Left / Right Directional Corrections)
    if (midHipX < 0.38) {
      return {
        valid: false,
        overallReady: false,
        poseScore: 50,
        trackingConfidence,
        stateName: 'TRACKING',
        visualStatus: '● Tracking body',
        directionalArrow: 'RIGHT',
        directionalText: '← Move right',
        instructionId: 'MOVE_RIGHT',
        priority: 4,
        instruction: 'Move slightly to your right.',
        checklist,
        landmarks: lm
      };
    }

    if (midHipX > 0.62) {
      return {
        valid: false,
        overallReady: false,
        poseScore: 50,
        trackingConfidence,
        stateName: 'TRACKING',
        visualStatus: '● Tracking body',
        directionalArrow: 'LEFT',
        directionalText: 'Move left →',
        instructionId: 'MOVE_LEFT',
        priority: 4,
        instruction: 'Move slightly to your left.',
        checklist,
        landmarks: lm
      };
    }

    checklist.fullBodyVisible = true;

    // 5. ORIENTATION (Front vs. Dynamic 90° Side Profile Estimation)
    const shoulderWidth = Math.abs(lShoulder.x - rShoulder.x);

    if (phase === 'front') {
      if (shoulderWidth < 0.080) {
        return {
          valid: false,
          overallReady: false,
          poseScore: 60,
          trackingConfidence,
          stateName: 'ADJUSTING',
          visualStatus: '↔ Face camera',
          directionalArrow: 'NONE',
          directionalText: 'Face camera',
          instructionId: 'FACE_CAMERA',
          priority: 5,
          instruction: 'Face the camera.',
          checklist,
          landmarks: lm
        };
      }
    } else if (phase === 'side') {
      const orient = this.calculateBodyOrientation(lm);
      const angle = orient.angleDeg;

      if (!orient.isSideProfile) {
        let msg = 'Turn 90° so your side profile faces the camera.';
        let stateText = 'Turn to your side';
        let id = 'TURN_SIDE';

        if (orient.rotationPhase === 'TURNING') {
          msg = 'Keep turning until your side profile faces the camera.';
          stateText = 'Keep turning...';
          id = 'KEEP_TURNING';
        } else if (orient.rotationPhase === 'ALMOST') {
          msg = 'Almost there — turn a little more to your side.';
          stateText = 'Almost sideways...';
          id = 'ALMOST_SIDEWAYS';
        }

        return {
          valid: false,
          overallReady: false,
          poseScore: 50 + Math.min(25, Math.floor(angle * 0.3)),
          trackingConfidence,
          stateName: 'TRACKING',
          visualStatus: `● ${stateText}`,
          directionalArrow: 'NONE',
          directionalText: stateText,
          instructionId: id,
          priority: 5,
          instruction: msg,
          checklist,
          landmarks: lm,
          orientationAngle: angle
        };
      }
    }

    checklist.facingDirection = true;

    // 6. POSTURE & ARM CLEARANCE
    const lKneeAngle = this.calculateAngle(lHip, lKnee, lAnkle);
    const rKneeAngle = this.calculateAngle(rHip, rKnee, rAnkle);
    const minKneeAngle = Math.min(lKneeAngle, rKneeAngle);

    if (minKneeAngle < 150) {
      return {
        valid: false,
        overallReady: false,
        poseScore: 70,
        trackingConfidence,
        stateName: 'ADJUSTING',
        visualStatus: '↔ Adjusting position',
        directionalArrow: 'NONE',
        directionalText: 'Straighten legs',
        instructionId: 'STRAIGHTEN_LEGS',
        priority: 6,
        instruction: 'Straighten your legs.',
        checklist,
        landmarks: lm
      };
    }

    const torsoDx = midShoulderX - midHipX;
    const torsoDy = midHipY - midShoulderY;
    const torsoTiltDeg = Math.abs(Math.atan2(torsoDx, torsoDy) * (180 / Math.PI));

    if (torsoTiltDeg > 12) {
      return {
        valid: false,
        overallReady: false,
        poseScore: 72,
        trackingConfidence,
        stateName: 'ADJUSTING',
        visualStatus: '↔ Adjusting position',
        directionalArrow: 'NONE',
        directionalText: 'Stand upright',
        instructionId: 'STAND_STRAIGHT',
        priority: 6,
        instruction: 'Stand up straight.',
        checklist,
        landmarks: lm
      };
    }

    if (phase === 'front') {
      const lArmClearance = Math.abs(lWrist.x - lHip.x);
      const rArmClearance = Math.abs(rWrist.x - rHip.x);
      if (lArmClearance < 0.018 && rArmClearance < 0.018) {
        return {
          valid: false,
          overallReady: false,
          poseScore: 75,
          trackingConfidence,
          stateName: 'ALMOST_READY',
          visualStatus: '◐ Almost there',
          directionalArrow: 'NONE',
          directionalText: 'Arms away',
          instructionId: 'ARMS_AWAY',
          priority: 6,
          instruction: 'Stand straight and keep your arms slightly away from your body.',
          checklist,
          landmarks: lm
        };
      }
    }

    checklist.standingUpright = true;

    return {
      valid: true,
      poseScore: 85,
      trackingConfidence,
      stateName: 'ALMOST_READY',
      visualStatus: '◐ Almost there',
      directionalArrow: 'ALIGNED',
      directionalText: '✓ Position aligned',
      checklist,
      landmarks: lm
    };
  }

  /**
   * Evaluates current frame with multi-frame stability tracking.
   * 
   * @param {HTMLVideoElement} video 
   * @returns {Object} Frame evaluation result
   */
  evaluateFrame(video) {
    const lm = this.smoothedLandmarks || this.latestLandmarks;
    const evalResult = this.evaluateLandmarks(lm, this.phase);

    if (!evalResult.valid) {
      this.stableFrameCount = 0;
      this.previousKeypoints = null;
      return evalResult;
    }

    // MULTI-FRAME STABILITY CHECK (Require 15 consecutive frames ~ 1.0s)
    const nose = lm[0];
    const lShoulder = lm[11], rShoulder = lm[12];
    const lHip = lm[23], rHip = lm[24];
    const lAnkle = lm[27], rAnkle = lm[28];

    let maxJitter = 0;
    if (this.previousKeypoints) {
      const currentPts = [nose, lShoulder, rShoulder, lHip, rHip, lAnkle, rAnkle];
      for (let i = 0; i < currentPts.length; i++) {
        const dx = currentPts[i].x - this.previousKeypoints[i].x;
        const dy = currentPts[i].y - this.previousKeypoints[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > maxJitter) maxJitter = dist;
      }

      if (maxJitter < this.STABILITY_THRESHOLD) {
        this.stableFrameCount++;
      } else {
        this.stableFrameCount = Math.max(0, this.stableFrameCount - 2);
      }
    }

    this.previousKeypoints = [nose, lShoulder, rShoulder, lHip, rHip, lAnkle, rAnkle];

    if (this.stableFrameCount >= this.REQUIRED_STABLE_FRAMES) {
      evalResult.checklist.holdingStill = true;
      return {
        valid: true,
        overallReady: true,
        poseScore: 100,
        trackingConfidence: evalResult.trackingConfidence,
        stateName: 'READY',
        visualStatus: '✓ Measurement pose ready',
        directionalArrow: 'ALIGNED',
        directionalText: '✓ Position aligned',
        instructionId: 'READY_CAPTURE',
        priority: 8,
        instruction: "Perfect! You're in position.",
        checklist: evalResult.checklist,
        landmarks: lm
      };
    } else {
      evalResult.checklist.holdingStill = false;
      return {
        valid: false,
        overallReady: false,
        poseScore: 80 + Math.floor((this.stableFrameCount / this.REQUIRED_STABLE_FRAMES) * 15),
        trackingConfidence: evalResult.trackingConfidence,
        stateName: 'STABILITY',
        visualStatus: '◐ Almost there',
        directionalArrow: 'ALIGNED',
        directionalText: '✓ Position aligned',
        instructionId: 'HOLD_STILL',
        priority: 7,
        instruction: 'Hold still.',
        checklist: evalResult.checklist,
        landmarks: lm
      };
    }
  }

  /**
   * Validate an uploaded image element for Photo Upload Mode
   * 
   * @param {HTMLImageElement} imgElement 
   * @param {string} phase - 'front' | 'side'
   * @returns {Promise<Object>} Evaluation result
   */
  async validateUploadedImage(imgElement, phase = 'front') {
    if (!this.pose) {
      this.initMediaPipePose();
      await new Promise(r => setTimeout(r, 500));
    }

    let detectedLandmarks = null;
    const tempOnResults = (results) => {
      if (results && results.poseLandmarks) {
        detectedLandmarks = results.poseLandmarks;
      }
    };

    try {
      this.pose.onResults(tempOnResults);
      await this.pose.send({ image: imgElement });
      this.pose.onResults((results) => {
        if (results && results.poseLandmarks) this.updateLandmarks(results.poseLandmarks);
      });
    } catch (e) {
      console.warn('[ScanQualityEngine] Error evaluating uploaded image:', e);
    }

    if (!detectedLandmarks || detectedLandmarks.length < 33) {
      return {
        valid: false,
        primaryIssue: 'NO_PERSON',
        instruction: 'No person detected in the photo. Please choose a clear full-body photo.',
        checklist: { personDetected: false }
      };
    }

    const evalResult = this.evaluateLandmarks(detectedLandmarks, phase);

    if (phase === 'side' && !evalResult.valid && evalResult.instructionId === 'TURN_SIDE') {
      return {
        valid: false,
        primaryIssue: 'TURN_SIDE',
        instruction: "This doesn't look like a clear side profile. Please upload a photo with your body turned approximately 90° toward the camera.",
        checklist: evalResult.checklist,
        landmarks: detectedLandmarks
      };
    }

    return {
      valid: evalResult.valid,
      primaryIssue: evalResult.instructionId,
      instruction: evalResult.instruction,
      checklist: evalResult.checklist,
      landmarks: detectedLandmarks
    };
  }
}

// Instantiate scan quality engine globally
const scanQualityEngine = new ScanQualityEngine();
window.scanQualityEngine = scanQualityEngine;
