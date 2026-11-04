const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 10000;
const TERMII_API_KEY = process.env.TERMII_API_KEY;
const TERMII_BASE = "https://api.ng.termii.com/api";

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(JSON.stringify(data));
}

function serveHTML(res) {
  const filePath = path.join(__dirname, "index.html");
  fs.readFile(filePath, (err, content) => {
    if (err) {
      sendJSON(res, 500, { error: "index.html not found" });
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    }
  });
}

async function termiiRequest(endpoint, body) {
  const url = `${TERMII_BASE}${endpoint}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: TERMII_API_KEY, ...body })
  });
  const data = await response.json();
  return { status: response.status, data };
}

const server = http.createServer(async (req, res) => {
  const cleanUrl = req.url.split("?")[0].replace(/\/$/, "") || "/";

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  // Serve frontend
  if (req.method === "GET" && (cleanUrl === "/" || cleanUrl === "")) {
    return serveHTML(res);
  }

  // Status check
  if (req.method === "GET" && cleanUrl === "/api/status") {
    return sendJSON(res, 200, {
      server: "running",
      termiiConfigured: !!TERMII_API_KEY
    });
  }

  // Only POST for API
  if (req.method !== "POST") {
    return sendJSON(res, 404, { error: "Route not found" });
  }

  // Parse body
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const jsonBody = body ? JSON.parse(body) : {};

      // SEND OTP - This will land in your panel
      if (cleanUrl === "/api/send-otp") {
        const { phone } = jsonBody;
        if (!phone) return sendJSON(res, 400, { error: "Phone required" });
        if (!TERMII_API_KEY) return sendJSON(res, 500, { error: "TERMII_API_KEY missing in Render" });

        const result = await termiiRequest("/sms/otp/send", {
          message_type: "NUMERIC",
          to: phone,
          from: "OE Alert",
          channel: "generic",
          pin_attempts: 3,
          pin_time_to_live: 10,
          pin_length: 6,
          pin_placeholder: "< 123456 >",
          message_text: "Your BRAINBOX verification code is < 123456 >. Expires in 10 mins.",
          pin_type: "NUMERIC"
        });

        if (result.status >= 200 && result.status < 300) {
          return sendJSON(res, 200, { success: true, pinId: result.data.pinId || result.data.pin_id });
        } else {
          return sendJSON(res, result.status, { error: "Termii failed", details: result.data });
        }
      }

      // VERIFY OTP
      if (cleanUrl === "/api/verify-otp") {
        const { pinId, otp } = jsonBody;
        if (!pinId || !otp) return sendJSON(res, 400, { error: "pinId and otp required" });

        const result = await termiiRequest("/sms/otp/verify", {
          pin_id: pinId,
          pin: otp
        });

        if (result.data && result.data.verified) {
          return sendJSON(res, 200, { success: true, verified: true });
        } else {
          return sendJSON(res, 400, { success: false, verified: false, details: result.data });
        }
      }

      return sendJSON(res, 404, { error: "Route not found" });

    } catch (e) {
      console.error(e);
      return sendJSON(res, 500, { error: "Server error", details: e.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Termii configured: ${!!TERMII_API_KEY}`);
});
