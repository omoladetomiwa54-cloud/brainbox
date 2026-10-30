require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.TERMII_API_KEY;
const TERMII_URL = "https://api.ng.termii.com";

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
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      ...data,
      api_key: API_KEY
    })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || result.error || "Termii request failed"
    );
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

    if (body.length > 10000) {
      req.destroy();
    }
  });

  req.on("end", async () => {
    try {
      const data = JSON.parse(body || "{}");

      if (!API_KEY) {
        return sendJSON(res, 500, {
          error: "Termii API key is not configured on the server."
        });
      }

      // SEND OTP
      if (req.url === "/api/send-otp") {
        const phone = normalizePhone(data.phone || data.number);

        if (!phone) {
          return sendJSON(res, 400, {
            error: "Enter a valid Nigerian phone number."
          });
        }

        const result = await termiiRequest(
          "/api/sms/otp/send",
          {
            message_type: "NUMERIC",
            to: phone,
            from: "OE Alert",
            channel: "dnd",
            pin_attempts: 3,
            pin_time_to_live: 10,
            pin_length: 6,
            pin_placeholder: "< 123456 >",
            message_text:
              "Your BRAINBOX verification code is < 123456 >. It expires in 10 minutes. Do not share this code.",
            pin_type: "NUMERIC"
          }
        );

        if (result.pinId) {
          pendingPins.set(phone, {
            pinId: result.pinId,
            createdAt: Date.now()
          });
        }

        return sendJSON(res, 200, {
          success: true,
          message: "OTP request submitted.",
          pinId: result.pinId
        });
      }

      // VERIFY OTP
      if (req.url === "/api/verify-otp") {
        const phone = normalizePhone(data.phone || data.number);
        const pin = String(data.pin || data.otp || "");

        if (!phone || !pin) {
          return sendJSON(res, 400, {
            error: "Enter your phone number and OTP."
          });
        }

        const saved = pendingPins.get(phone);

        if (!saved || Date.now() - saved.createdAt > 10 * 60 * 1000) {
          pendingPins.delete(phone);

          return sendJSON(res, 400, {
            error: "OTP expired or not found. Request a new code."
          });
        }

        const result = await termiiRequest(
          "/api/sms/otp/verify",
          {
            pin_id: saved.pinId,
            pin: pin
          }
        );

        const verified =
          String(result.verified).toLowerCase() === "true" ||
          String(result.status).toLowerCase() === "success";

        if (!verified) {
          return sendJSON(res, 400, {
            success: false,
            error: "Incorrect OTP. Please try again."
          });
        }

        pendingPins.delete(phone);

        return sendJSON(res, 200, {
          success: true,
          message: "Phone number verified successfully."
        });
      }

      return sendJSON(res, 404, {
        error: "API route not found."
      });

    } catch (error) {
      console.error("Server error:", error);

      return sendJSON(res, 500, {
        success: false,
        error: error.message || "Something went wrong."
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`BRAINBOX server running on port ${PORT}`);
});
