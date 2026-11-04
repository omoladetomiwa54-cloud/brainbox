const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const TERMII_API_KEY = process.env.TERMII_API_KEY || '';
const TERMII_SENDER_ID = process.env.TERMII_SENDER_ID || 'OE';

const otpStore = new Map();

async function sendTermiiSMS(to, message) {
  if (!TERMII_API_KEY) throw new Error('No API Key');
  const payload = JSON.stringify({
    to, from: TERMII_SENDER_ID, sms: message, type: 'plain', channel: 'generic', api_key: TERMII_API_KEY
  });
  const options = {
    hostname: 'api.ng.termii.com', path: '/api/sms/send', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
  };
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(data); } });
    });
    req.on('error', reject); req.write(payload); req.end();
  });
}

function parseBody(req) {
  return new Promise(resolve => {
    let body = ''; req.on('data', chunk => body += chunk);
    req.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }
  const url = req.url.split('?')[0];
  console.log(`${req.method} ${url}`);

  if (url === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ server: 'running', sender: TERMII_SENDER_ID, hasKey: !!TERMII_API_KEY, stored: otpStore.size }));
    return;
  }

  // FOR YOUR ADMIN PANEL TO SEE OTPs
  if (url === '/api/otps' && req.method === 'GET') {
    const all = [];
    for (let [phone, data] of otpStore.entries()) {
      all.push({ phone, code: data.code, expires: new Date(data.expires).toLocaleString(), expiresRaw: data.expires, active: Date.now() < data.expires });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, otps: all.reverse(), total: all.length }));
    return;
  }

  if ((url === '/api/send-otp' || url === '/api/send-sms' || url === '/send-otp' || url === '/send-sms') && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = body.phone || body.to || body.phoneNumber;
      if (!phone) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'phone required' })); return; }
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      otpStore.set(phone, { code: otpCode, expires: Date.now() + 10*60*1000 });
      const finalMsg = `Your BrainBox OTP is ${otpCode}. Valid for 10 mins. Channel OE`;
      let termiiResult = null;
      try { termiiResult = await sendTermiiSMS(phone, finalMsg); } catch(e) { termiiResult = { error: e.message }; }
      console.log(`OTP ${phone}: ${otpCode}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'OTP sent', otp: otpCode, phone, termii: termiiResult }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if ((url === '/api/verify-otp' || url === '/verify-otp' || url === '/api/verify') && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const phone = body.phone || body.to;
      const code = body.code || body.otp || body.pin;
      const stored = otpStore.get(phone);
      if (!stored) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'No OTP for this number' })); return; }
      if (Date.now() > stored.expires) { otpStore.delete(phone); res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: 'OTP expired' })); return; }
      if (stored.code === code.toString()) {
        otpStore.delete(phone);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Verified' }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid OTP' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (url === '/' || url === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    if (fs.existsSync(filePath)) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(filePath)); }
    else {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html><body style="font-family:sans-serif; padding:20px;">
        <h1>BrainBox LIVE - OE</h1>
        <p><a href="/api/status">Status</a> | <a href="/api/otps">View OTPs for Panel</a></p>
        <h2>Test Send OTP</h2>
        <input id="phone" placeholder="2348012345678" style="padding:10px; width:200px;">
        <button onclick="send()" style="padding:10px;">Send OTP</button>
        <p id="res"></p>
        <script>
        async function send(){
          const phone=document.getElementById('phone').value;
          const r=await fetch('/api/send-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});
          const d=await r.json(); document.getElementById('res').textContent=JSON.stringify(d);
        }
        </script>
        </body></html>
      `);
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found', url }));
});

server.listen(PORT, '0.0.0.0', () => console.log(`Live OE on ${PORT}`));
