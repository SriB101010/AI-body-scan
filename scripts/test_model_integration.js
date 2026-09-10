const path = require('path');
const { execFile } = require('child_process');

const pythonPath = '/opt/anaconda3/bin/python';
const scriptPath = path.join(__dirname, 'predict.py');

const testPayload = {
  gender: 'female',
  height: 170.0,
  weight: 65.0,
  age: 25,
  frontPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
  sidePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
};

console.log('[Test Integration] Sending request to predict.py...');

execFile(pythonPath, [scriptPath, JSON.stringify(testPayload)], { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
  if (err) {
    console.error('[Test Error]', stderr || err.message);
    process.exit(1);
  }
  
  console.log('[Test Response Raw Output]:', stdout);
  try {
    const res = JSON.parse(stdout);
    console.log('[Test Verification SUCCESS] Parsed JSON Output:');
    console.dir(res, { depth: null });
  } catch (e) {
    console.error('[Test JSON Parse Failed]', e.message);
    process.exit(1);
  }
});
