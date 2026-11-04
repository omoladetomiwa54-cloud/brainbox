const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const TERMII_API_KEY = process.env.TERMII_API_KEY || '';
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID || 'OE';

// Termii send function
async function sendTermiiSMS(to, message) {
  if (!TERMII_API_KEY) {
    throw new Error('TERMII_API_KEY not set in Render');
  }
  const payload = JSON.stringify({
    to: to,
    from: "OE",
    sms: message,
    type: 'plain',
    channel: 'generic',
    api_key:TERMII_API_KEY
  });
  
  const options = {
    hostname: 'api.ng.termii.com',
    path: '/api/sms/send',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve(data); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  const url = req.url.split('?')[0];
  console.log(`${req.method} ${url}`);

  // Status
  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: 'running', sender: TERMII_SENDER_ID, hasKey: !!TERMII_API_KEY }));
    return;
  }

  // OTP & SMS - ALL ROUTES SAME FUNCTION
  if ((url === '/api/send-otp' || url === '/api/send-sms' || url === '/send-otp' || url === '/send-sms') && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = body.phone || body.to || body.phoneNumber;
      const message = body.message || body.otp || body.sms || `Your BrainBox OTP is ${body.code || '123456'}`;
      
      if (!phone) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'phone required' }));
        return;
      }
      
      const otpCode = body.code || Math.floor(100000 + Math.random() * 900000);
      const finalMsg = body.message || `Your BrainBox verification code is ${otpCode}. Channel OE`;
      
      const result = await sendTermiiSMS(phone, finalMsg);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, otp: otpCode, result, sender: TERMII_SENDER_ID }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // Serve index.html
  if (url === '/' || url === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>BrainBox LIVE - Channel OE</h1><p>Add index.html to GitHub or visit /api/status</p>');
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', url }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on ${PORT} with Sender ${TERMII_SENDER_ID}`);
});
