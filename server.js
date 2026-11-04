const express = require('express');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allow all CORS for phone
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', '*');
  next();
});

// In-memory storage - This is your 147 panel data
let otpMessages = [];

// HOME - Looks like 147 panel
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BrainBox - 147 Panel</title>
<style>
body{font-family:Arial;padding:10px;background:#f5f5f5}
.card{background:#fff;padding:15px;border-radius:10px;margin-bottom:15px;box-shadow:0 2px 5px #ccc}
input{width:90%;padding:12px;margin:5px 0;border:1px solid #ccc;border-radius:5px}
button{width:95%;padding:12px;background:#000;color:#fff;border:none;border-radius:5px;font-weight:bold}
table{width:100%;border-collapse:collapse;background:#fff}
th,td{border:1px solid #ddd;padding:8px;font-size:13px;text-align:left}
th{background:#000;color:#fff}
.success{color:green;font-weight:bold}
</style>
</head>
<body>
<div class="card">
<h2>🧠 BrainBox OTP - LIVE</h2>
<p><b>Rented Number:</b> 7020220001 (2347020220001)</p>
<input id="phone" value="2347020220001" placeholder="Enter number 234...">
<button onclick="sendOTP()">SEND OTP TO 7020220001</button>
<p id="result"></p>
</div>

<div class="card">
<h3>147 Panel (Live Messages)</h3>
<button onclick="loadPanel()" style="background:#444">REFRESH PANEL</button>
<div style="overflow-x:auto;margin-top:10px">
<table id="panel">
<tr><th>Number</th><th>OTP</th><th>Time</th></tr>
</table>
</div>
</div>

<div class="card">
<a href="/crapi/st/viewstats?token=RFZVSURBUzRcZIdddZBoe0pQkotEaVNlgndka3RSh2tHZGNSfIyUag==&records=10" target="_blank">Open Raw 147 JSON</a> | 
<a href="/api/otps" target="_blank">View All OTPs</a>
</div>

<script>
async function sendOTP(){
 let phone=document.getElementById('phone').value;
 document.getElementById('result').innerHTML='Sending...';
 let res=await fetch('/api/send-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});
 let data=await res.json();
 document.getElementById('result').innerHTML='<span class=success>SENT: '+JSON.stringify(data)+'</span>';
 loadPanel();
}
async function loadPanel(){
 let res=await fetch('/api/otps');
 let data=await res.json();
 let html='<tr><th>Number</th><th>OTP / Text</th><th>Time</th></tr>';
 data.reverse().forEach(m=>{
   html+='<tr><td>'+m.number+'</td><td>'+(m.otp||m.text)+'</td><td>'+new Date(m.received_at||m.time).toLocaleString()+'</td></tr>';
 });
 document.getElementById('panel').innerHTML=html;
}
loadPanel();
setInterval(loadPanel,5000);
</script>
</body>
</html>
  `);
});

// 147 PANEL API - Your rented number will show here
app.get('/crapi/st/viewstats', (req, res) => {
  // This is the exact route 147 panel uses
  res.json(otpMessages.slice(-10).reverse());
});

// Alias for old 147 link
app.get('/api/otps', (req, res) => {
  res.json(otpMessages);
});

// SEND OTP - This saves to 147 panel
app.post('/api/send-otp', (req, res) => {
  try {
    let phone = req.body.phone || '2347020220001';
    // Clean number
    phone = phone.toString().replace(/\D/g,'');
    let otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    let message = {
      id: Date.now(),
      number: phone,
      otp: otp,
      text: `Your BrainBox OTP is ${otp}`,
      received_at: new Date().toISOString(),
      time: new Date().toISOString(),
      expiry: new Date(Date.now() + 5*60000).toISOString()
    };
    
    otpMessages.push(message);
    console.log('NEW OTP SAVED:', message);
    
    res.json({ success: true, message: 'OTP saved to 147 panel', data: message });
  } catch (e) {
    console.log(e);
    res.status(500).json({ success: false, error: e.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log('BrainBox LIVE on port ' + PORT);
});
