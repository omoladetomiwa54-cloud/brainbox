const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// This is your 147 panel storage for 7020220001
let messages = [];

app.get('/', (req, res) => {
  res.send(`
<html><body style="font-family:sans-serif;padding:15px">
<h2>BrainBox LIVE ✅ - 147 Panel</h2>
<p><b>Your Number:</b> 7020220001</p>
<input id="p" value="2347020220001" style="padding:10px;width:80%">
<button onclick="send()" style="padding:10px;background:#000;color:#fff;width:85%;margin-top:10px">SEND OTP</button>
<p id="r"></p>
<h3>Messages (147 Panel)</h3>
<table border="1" cellpadding="8" id="t" style="width:100%;border-collapse:collapse"><tr><th>Number</th><th>OTP</th></tr></table>
<script>
async function send(){
 let phone=document.getElementById('p').value;
 let res=await fetch('/api/send-otp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})});
 let d=await res.json(); document.getElementById('r').innerText=JSON.stringify(d); load();
}
async function load(){
 let res=await fetch('/api/otps'); let data=await res.json();
 let h='<tr><th>Number</th><th>OTP</th><th>Time</th></tr>';
 data.slice(-10).reverse().forEach(m=>{h+='<tr><td>'+m.number+'</td><td>'+m.otp+'</td><td>'+new Date(m.time).toLocaleTimeString()+'</td></tr>'});
 document.getElementById('t').innerHTML=h;
}
load(); setInterval(load,3000);
</script>
</body></html>
`);
});

app.get('/crapi/st/viewstats', (req, res) => {
  res.json(messages.slice(-10).reverse());
});

app.get('/api/otps', (req, res) => {
  res.json(messages);
});

app.post('/api/send-otp', (req, res) => {
  let phone = req.body.phone || '2347020220001';
  let otp = Math.floor(100000 + Math.random() * 900000).toString();
  let msg = { number: phone, otp: otp, time: new Date().toISOString(), text: 'Your OTP is '+otp };
  messages.push(msg);
  console.log('SAVED:', msg);
  res.json({ success: true, ...msg });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('LIVE on ' + PORT));
