const http = require('http');

const samplePayload = JSON.stringify({
  frontPhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
  sidePhoto: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
  gender: 'female',
  height: 170.0,
  weight: 65.0,
  age: 25
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/scan/estimate',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(samplePayload)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('[API Test Response Status]:', res.statusCode);
    console.log('[API Test Response Body]:');
    console.log(JSON.stringify(JSON.parse(body), null, 2));
    process.exit(0);
  });
});

req.on('error', (err) => {
  console.error('[API Test Error]:', err.message);
  process.exit(1);
});

req.write(samplePayload);
req.end();
