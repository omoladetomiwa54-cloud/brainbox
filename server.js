require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TERMII_API_KEY;
// FIX 1: Use v3 API - your old url was failing
const TERMII_URL = "https://v3.api.termii.com/api";

const pendingPins = new Map();

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(data));
}

function normalizePhone(phone) {
  let number = String(phone || "").replace(/\D/g, "");
  if (number.startsWith("0")) {
    number = "234" + number.slice(1);
  }
  if (number.startsWith("234") && number.length === 13) {
    return number;
  }
  return null;
}

async function termiiRequest(endpoint, data) {
  const response = await fetch(`${TERMII_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...data, api_key: API_KEY })
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || result.error || JSON.stringify(result));
  }
  return result;
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    return res.end();
  }

  if (req.method === "GET" && req.url === "/") {
    const file = path.join(__dirname, "index.html");
    if (!fs.existsSync(file)) {
      return sendJSON(res, 404, { error: "Website file not found" });
    }
    res.writeHead(200, { "Content-Type": "text/html" });
    return fs.createReadStream(file).pipe(res);
  }

  if (req.method === "GET" && req.url === "/api/status") {
    return sendJSON(res, 200, {
      server: "running",
      termiiConfigured: Boolean(API_KEY)
    });
  }

  if (req.method !== "POST") {
    return sendJSON(res, 404, { error: "Route not found" });
  }

  let body = "";
  req.on("data", chunk => {
    body += chunk;
    if (body.length > 10000) req.destroy();
  });

  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}");
      if (!API_KEY) {
        return sendJSON(res, 500, { error: "Termii API key not configured. Add TERMII_API_KEY in .env" });
      }

      if (req.url === "/api/send-otp") {
        const phone = normalizePhone(data.phone || data.number);
        if (!phone) {
          return sendJSON(res, 400, { error: "Enter valid Nigerian number e.g 09012345678" });
        }

        console.log("Sending OTP to:", phone);

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

        if (result.pinId) {
          pendingPins.set(phone, { pinId: result.pinId, createdAt: Date.now() });
        }

        return sendJSON(res, 200, {
          success: true,
          message: `OTP sent to ${phone}. It will land in your panel.`,
          pinId: result.pinId,
          raw: result
        });
      }

      if (req.url === "/api/verify-otp") {
        const phone = normalizePhone(data.phone || data.number);
        const pin = String(data.pin || data.otp || "");
        if (!phone || !pin) return sendJSON(res, 400, { error: "Phone and OTP required" });

        const saved = pendingPins.get(phone);
        if (!saved) return sendJSON(res, 400, { error: "No OTP found for this number. Request again." });

        const result = await termiiRequest("/sms/otp/verify", {
          pin_id: saved.pinId,
          pin: pin
        });

        const verified = String(result.verified).toLowerCase() === "true" || result.status === "verified";
        if (!verified) return sendJSON(res, 400, { success: false, error: "Wrong OTP" });

        pendingPins.delete(phone);
        return sendJSON(res, 200, { success: true, message: "Verified!" });
      }

      return sendJSON(res, 404, { error: "Route not found" });
    } catch (error) {
      console.error("Server error:", error);
      return sendJSON(res, 500, { success: false, error: error.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`BRAINBOX server running on port ${PORT}`);
});
