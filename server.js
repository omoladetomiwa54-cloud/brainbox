const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory storage - replace with DB later
let messages = [];

// Helper to create message like 147 panel
function addMessage(phone, otp) {
  const now = new Date();
  const msg = {
    id: Date.now(),
    number: phone.toString(),
    from: phone.toString(),
    text: `Your OTP is ${otp}`,
    otp: otp.toString(),
    message: `Your OTP is ${otp}`,
    received_at: now.toISOString(),
    created_at: now.toISOString(),
    expiry: new Date(now.getTime() + 5 * 60000).toISOString(),
    expire_at: new Date(now.getTime() + 5 * 60000).toISOString()
  };
  messages.push(msg);
  // Keep only last 100
  if (messages.length > 100) messages.shift();
  console.log('NEW OTP DROPPED:', msg);
  return msg;
}

// ROOT - 147 CLONE PANEL UI
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SMS Panel - 147 Clone</title>
<style>
body{font-family:Arial;background:#f4f4f4;margin:0;padding:10px}
h2{background:#000;color:#fff;padding:10px;text-align:center}
.box{background:#fff;padding:15px;border-radius:5px;margin-bottom:15px}
input{padding:10px;width:60%;border:1px solid #ccc}
button{padding:10px 15px;background:#000;color:#fff;border:none;cursor:pointer}
table{width:100%;background:#fff;border-collapse:collapse}
th{background:#000;color:#fff;padding:8px}
td{padding:8px;border-bottom:1px solid #ddd;font-size:14px}
.live{color:green;font-weight:bold}
</style>
</head>
<body>
<h2>147.135.212.197 PANEL CLONE - LIVE</h2>
<div class="box">
<b>Rented Number: 7020220001 (2347020220001)</b><br><br>
<input id="phone" value="2347020220001" placeholder="Enter number">
<input id="otpInput" value="" placeholder="OTP (leave empty for auto)" style="width:20%">
<button onclick="sendOTP()">SEND OTP</button>
<p id="status"></p>
<span class="live">● LIVE - OTP will drop below</span>
</div>
<table id="tbl">
<tr><th>Number</th><th>OTP / Message</th><th>Time</th><th>Expiry</th></tr>
</table>
<script>
async function load(){
 let r = await fetch('/crapi/st/viewstats?token=RFZVSURBUzRcZIdddZBoe0pQkotEaVNlgndka3RSh2tHZGNSfIyUag==&records=10');
 let data = await r.json();
 let rows = Array.isArray(data) ? data : (data.data || data.messages || []);
 let html = '<tr><th>Number</th><th>OTP / Message</th><th>Time</th><th>Expiry</th></tr>';
 rows.reverse().forEach(m=>{
   html += \`<tr><td>\${m.number||m.from}</td><td>\${m.otp||m.text||m.message}</td><td>\${(m.received_at||m.created_at||'').substring(11,19)}</td><td>\${(m.expiry||m.expire_at||'').substring(11,19)}</td></tr>\`;
 });
 document.getElementById('tbl').innerHTML = html;
}
async function sendOTP(){
 let phone = document.getElementById('phone').value;
 let otpInput = document.getElementById('otpInput').value;
 let otp = otpInput || Math.floor(100000+Math.random()*900000).toString();
 document.getElementById('status').innerText = 'Sending...';
 let res = await fetch('/api/send-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone, otp})});
 let d = await res.json();
 document.getElementById('status').innerText = 'Dropped: ' + JSON.stringify(d);
 load();
}
setInterval(load, 2000);
load();
</script>
</body>
</html>
  `);
});

// 147 EXACT ENDPOINT - This is what makes your panel work like 147
app.get('/crapi/st/viewstats', (req, res) => {
  const records = parseInt(req.query.records) || 10;
  const last = messages.slice(-records).reverse();
  // Return as array like original 147 does
  res.json(last);
});

// Extra endpoints for your API
app.get('/api/otps', (req, res) => {
  res.json(messages);
});

app.post('/api/send-otp', (req, res) => {
  const phone = req.body.phone || req.body.number || '2347020220001';
  const otp = req.body.otp || Math.floor(100000 + Math.random() * 900000).toString();
  const msg = addMessage(phone, otp);
  res.json({ success: true, ...msg });
});

// Health
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('147 CLONE LIVE on ' + PORT));
