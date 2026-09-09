const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// Enable parsing of large payloads (needed for base64 body scan photos)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, 'public')));

// Initialize database file if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ scans: [] }, null, 2));
}

// Helper to read database
function readDb() {
  try {
    const data = fs.readFileSync(DB_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading database:', error);
    return { scans: [] };
  }
}

// Helper to write database
function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error writing database:', error);
  }
}

// ==========================================
// PROVIDER ARCHITECTURE
// ==========================================

class BodyMeasurementProvider {
  /**
   * Estimate body measurements from front and side photos
   * @param {Object} params
   * @param {string} params.frontPhoto - Base64 encoded JPEG
   * @param {string} params.sidePhoto - Base64 encoded JPEG
   * @param {string} params.gender - 'male' | 'female'
   * @param {number} params.height - Height in cm
   * @param {number} params.weight - Weight in kg
   * @param {number} params.age - User age
   * @returns {Promise<Object>} Raw provider result
   */
  async estimate(params) {
    throw new Error('Method estimate() must be implemented.');
  }
}

/**
 * Mock provider for local development. Generates proportional body measurements
 * using standard statistical regression heuristics for garment fit.
 */
class MockMeasurementProvider extends BodyMeasurementProvider {
  async estimate(params) {
    // Simulate API network latency (1.5 seconds)
    await new Promise(resolve => setTimeout(resolve, 1500));

    const { gender, height, weight, age } = params;
    
    // Add tiny random variation (±1.5%) to simulate real visual reading
    const dev = () => 0.985 + Math.random() * 0.03;

    let chest, waist, hip, neck, shoulderWidth, thigh, inseam, outseam, torsoLength, upperArm, armLength, wrist;

    if (gender === 'female') {
      chest = (0.46 * height + 0.18 * weight) * dev();
      waist = (0.38 * height + 0.16 * weight) * dev();
      hip = (0.50 * height + 0.22 * weight) * dev();
      neck = (0.19 * height) * dev();
      shoulderWidth = (0.22 * height) * dev();
      thigh = (0.55 * hip / 3) * dev();
      inseam = (0.44 * height) * dev();
      outseam = (0.60 * height) * dev();
      torsoLength = (0.36 * height) * dev();
      upperArm = (0.15 * weight + 15) * dev();
      armLength = (0.32 * height) * dev();
      wrist = (0.09 * height) * dev();
    } else {
      chest = (0.49 * height + 0.22 * weight) * dev();
      waist = (0.42 * height + 0.24 * weight) * dev();
      hip = (0.47 * height + 0.25 * weight) * dev();
      neck = (0.22 * height) * dev();
      shoulderWidth = (0.24 * height) * dev();
      thigh = (0.53 * hip / 3) * dev();
      inseam = (0.45 * height) * dev();
      outseam = (0.61 * height) * dev();
      torsoLength = (0.38 * height) * dev();
      upperArm = (0.12 * weight + 18) * dev();
      armLength = (0.33 * height) * dev();
      wrist = (0.10 * height) * dev();
    }

    // Round to 1 decimal place
    return {
      success: true,
      measurements: {
        height: parseFloat(height.toFixed(1)),
        chest: parseFloat(chest.toFixed(1)),
        waist: parseFloat(waist.toFixed(1)),
        hip: parseFloat(hip.toFixed(1)),
        shoulderWidth: parseFloat(shoulderWidth.toFixed(1)),
        neck: parseFloat(neck.toFixed(1)),
        upperArm: parseFloat(upperArm.toFixed(1)),
        armLength: parseFloat(armLength.toFixed(1)),
        wrist: parseFloat(wrist.toFixed(1)),
        thigh: parseFloat(thigh.toFixed(1)),
        inseam: parseFloat(inseam.toFixed(1)),
        outseam: parseFloat(outseam.toFixed(1)),
        torsoLength: parseFloat(torsoLength.toFixed(1))
      },
      confidence: 0.95,
      estimationToken: `token_mock_${crypto.randomBytes(8).toString('hex')}`
    };
  }
}

/**
 * Production provider integrating with the Bodygram REST API.
 * Securely communicates using API credentials stored in environment variables.
 */
class BodygramMeasurementProvider extends BodyMeasurementProvider {
  async estimate(params) {
    const apiKey = process.env.BODYGRAM_API_KEY;
    const clientId = process.env.BODYGRAM_CLIENT_ID;

    if (!apiKey || !clientId) {
      throw new Error('Bodygram API credentials are not configured on the server.');
    }

    const { frontPhoto, sidePhoto, gender, height, weight, age } = params;

    // Bodygram documentation specifications:
    // - Height: mm (500 to 2500)
    // - Weight: g (10000 to 200000)
    const heightMm = Math.round(height * 10);
    const weightG = Math.round(weight * 1000);

    const requestBody = {
      front: frontPhoto, // Base64 JPEG string
      side: sidePhoto,   // Base64 JPEG string
      gender: gender,    // 'male' | 'female'
      height: heightMm,  // in mm
      weight: weightG,   // in g
      age: parseInt(age, 10),
      avatarType: 'GLB'  // Request 3D model if supported
    };

    try {
      // Endpoint according to current Bodygram REST API specs for photo estimation
      const response = await fetch('https://api.bodygram.com/v1/estimations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'X-Client-Id': clientId
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Bodygram API error details:', errorText);
        throw new Error(`Bodygram server responded with status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Bodygram integration network failure:', error);
      throw new Error('Failed to connect to Bodygram estimation service.');
    }
  }
}

// Provider Factory based on ENV settings
function getMeasurementProvider() {
  const mode = process.env.BODYGRAM_PROVIDER_MODE || 'mock';
  if (mode === 'production') {
    console.log('[Provider] Running in PRODUCTION Bodygram mode.');
    return new BodygramMeasurementProvider();
  } else {
    console.log('[Provider] Running in DEVELOPMENT Mock mode.');
    return new MockMeasurementProvider();
  }
}

const provider = getMeasurementProvider();

// ==========================================
// API ROUTES
// ==========================================

/**
 * Normalizes provider outputs into the standardized application schema.
 * All internal coordinates/measurements are stored strictly in centimeters.
 */
function normalizeMeasurements(raw, meta) {
  // If raw is already mock, it's structured close to our target schema.
  // If from Bodygram API, we translate keys (e.g., chestCircumference, inseamLength) and convert units if needed.
  const measurements = {};

  if (raw.measurements) {
    const rawMeas = raw.measurements;
    // Map standard clothing-sizing measurements, converting mm to cm if coming from Bodygram
    const isMock = raw.estimationToken && raw.estimationToken.startsWith('token_mock');
    const scale = isMock ? 1 : 0.1; // If production Bodygram, convert mm to cm

    measurements.height = parseFloat((meta.height).toFixed(1));
    measurements.chest = parseFloat(((rawMeas.chest || rawMeas.chestCircumference) * scale).toFixed(1));
    measurements.waist = parseFloat(((rawMeas.waist || rawMeas.waistCircumference) * scale).toFixed(1));
    measurements.hip = parseFloat(((rawMeas.hip || rawMeas.hipCircumference) * scale).toFixed(1));
    measurements.shoulderWidth = parseFloat(((rawMeas.shoulderWidth || rawMeas.shoulderCircumference || rawMeas.biacromialWidth) * scale).toFixed(1));
    measurements.neck = parseFloat(((rawMeas.neck || rawMeas.neckCircumference) * scale).toFixed(1));
    measurements.upperArm = parseFloat(((rawMeas.upperArm || rawMeas.upperArmCircumference) * scale).toFixed(1));
    measurements.armLength = parseFloat(((rawMeas.armLength || rawMeas.sleeveLength) * scale).toFixed(1));
    measurements.wrist = parseFloat(((rawMeas.wrist || rawMeas.wristCircumference) * scale).toFixed(1));
    measurements.thigh = parseFloat(((rawMeas.thigh || rawMeas.thighCircumference) * scale).toFixed(1));
    measurements.inseam = parseFloat(((rawMeas.inseam || rawMeas.inseamLength) * scale).toFixed(1));
    measurements.outseam = parseFloat(((rawMeas.outseam || rawMeas.outseamLength) * scale).toFixed(1));
    measurements.torsoLength = parseFloat(((rawMeas.torsoLength || rawMeas.backLength) * scale).toFixed(1));
  }

  // Determine scan confidence descriptor
  let confidenceLabel = 'Good';
  if (raw.confidence !== undefined) {
    if (raw.confidence > 0.9) confidenceLabel = 'Excellent';
    else if (raw.confidence < 0.6) confidenceLabel = 'Needs review';
  }

  return {
    id: `scan_${crypto.randomBytes(8).toString('hex')}`,
    timestamp: new Date().toISOString(),
    provider: process.env.BODYGRAM_PROVIDER_MODE || 'mock',
    metadata: {
      gender: meta.gender,
      height: meta.height,
      weight: meta.weight,
      age: meta.age
    },
    measurements,
    confidence: confidenceLabel,
    estimationToken: raw.estimationToken || null
  };
}

// 1. POST: Estimate measurements from photos
app.post('/api/scan/estimate', async (req, res) => {
  try {
    const { frontPhoto, sidePhoto, gender, height, weight, age } = req.body;

    // Validate request inputs
    if (!frontPhoto || !sidePhoto) {
      return res.status(400).json({ error: 'Both front and side photos are required for body estimation.' });
    }
    if (!gender || !height || !weight || !age) {
      return res.status(400).json({ error: 'Metadata parameters (gender, height, weight, age) are required.' });
    }

    const numericHeight = parseFloat(height);
    const numericWeight = parseFloat(weight);
    const numericAge = parseInt(age, 10);

    if (isNaN(numericHeight) || isNaN(numericWeight) || isNaN(numericAge)) {
      return res.status(400).json({ error: 'Height, weight, and age must be valid numeric values.' });
    }

    console.log(`[API] Processing body scan estimation for ${gender}, H: ${numericHeight}cm, W: ${numericWeight}kg...`);

    const rawResult = await provider.estimate({
      frontPhoto,
      sidePhoto,
      gender,
      height: numericHeight,
      weight: numericWeight,
      age: numericAge
    });

    const normalized = normalizeMeasurements(rawResult, {
      gender,
      height: numericHeight,
      weight: numericWeight,
      age: numericAge
    });

    res.json(normalized);
  } catch (error) {
    console.error('[API Error] Scan estimation failed:', error.message);
    res.status(500).json({ 
      error: 'We couldn\'t create your measurements right now.',
      details: error.message 
    });
  }
});

// 2. GET: Retrieve scan history
app.get('/api/scans', (req, res) => {
  const db = readDb();
  // Return history sorted by timestamp descending
  const sortedScans = [...db.scans].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(sortedScans);
});

// 3. POST: Save a fit profile scan
app.post('/api/scans', (req, res) => {
  try {
    const scanProfile = req.body;
    if (!scanProfile || !scanProfile.id || !scanProfile.measurements) {
      return res.status(400).json({ error: 'Invalid scan profile. Profile must contain an ID and measurements.' });
    }

    const db = readDb();
    
    // Check if it already exists, replace it, otherwise append
    const existingIndex = db.scans.findIndex(s => s.id === scanProfile.id);
    if (existingIndex !== -1) {
      db.scans[existingIndex] = scanProfile;
    } else {
      db.scans.push(scanProfile);
    }

    writeDb(db);
    res.status(201).json({ success: true, profile: scanProfile });
  } catch (error) {
    console.error('[API Error] Save scan profile failed:', error);
    res.status(500).json({ error: 'Failed to save fit profile.' });
  }
});

// 4. GET: Get a specific scan by ID
app.get('/api/scans/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const scan = db.scans.find(s => s.id === id);
  if (!scan) {
    return res.status(404).json({ error: 'Fit profile scan not found.' });
  }
  res.json(scan);
});

// Fallback HTML router (for Single Page App behavior if user reloads subpaths)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`Garment Fit Profile Application Server running!`);
  console.log(`Access locally: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`===================================================`);
});
