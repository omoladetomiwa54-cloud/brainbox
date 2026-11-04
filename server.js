const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');

const PORT = process.env.PORT || 10000;

// Replace with your real key later in Render Env Vars
const TERMII_API_KEY = process.env.TERMII_API_KEY || 'TL9Ca8z9DqUjXv2bNp4rWmYhLs3eFg6iJk0oRt5uBx1cZa7dEv8q';
const TERMII_SENDER_ID = 'BrainBox';

function sendTermiiSMS(to, message) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      to: to,
      from: "OE",
      sms: message,
      type: 'plain',
      channel: 'generic', // keep generic, but from is OE
      api_key: TERMII_API_KEY
    });
    const options = {
      hostname: 'api.ng.termii.com',
      path: '/api/sms/send',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({raw: data}); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const server = http.createServer(async (req, res) => {
  const cleanUrl = req.url.split('?')[0];
  console.log(`${req.method} ${cleanUrl}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API STATUS - TEST THIS FIRST
  if (cleanUrl === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: 'running', time: new Date().toISOString(), port: PORT }));
    return;
  }

  // API SEND SMS
  if (cleanUrl === '/api/send-sms' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { phone, message } = data;
        if (!phone || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Phone and message required' }));
          return;
        }
        const result = await sendTermiiSMS(phone, message);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, result }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // Serve index.html
  if (cleanUrl === '/' || cleanUrl === '/index.html') {
    try {
      const filePath = path.join(__dirname, 'index.html');
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>BrainBox Server Running</h1><p>Upload your index.html</p><p>Test API: <a href="/api/status">/api/status</a></p>');
      }
    } catch (e) {
      res.writeHead(500);
      res.end('Error loading page: ' + e.message);
    }
    return;
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', url: cleanUrl }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
