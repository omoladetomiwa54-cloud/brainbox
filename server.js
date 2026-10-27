
require("dotenv").config();

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE_URL =
  process.env.TERMII_BASE_URL || "https://api.ng.termii.com";
const API_KEY = process.env.TERMII_API_KEY;

const recentRequests = new Map();
const pendingPins = new Map();

function sendJSON(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", chunk => {
      body += chunk;

      if (body.length > 10000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });

    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });

    req.on("error", reject);
  });
}

async function termiiRequest(endpoint, payload) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      api_key: API_KEY
    }),
    signal: AbortSignal.timeout(15000)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "Termii request failed");
  }

  return data;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(
    req.url,
    `http://${req.headers.host || "localhost"}`
  );

  // Main BRAINBOX page
  if (req.method === "GET" && url.pathname === "/") {
    fs.readFile(
      path.join(__dirname, "index.html"),
      (err, content) => {
        if (err) {
          return sendJSON(res, 500, {
            error: "Could not load index.html. Check your project folder."
          });
        }

        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8"
        });
        res.end(content);
      }
    );
    return;
  }

  // Server status
  if (req.method === "GET" && url.pathname === "/api/status") {
    return sendJSON(res, 200, {
      server: "running",
      termiiConfigured: Boolean(API_KEY)
    });
  }

  // Request a phone OTP
  if (req.method === "POST" && url.pathname === "/api/send-otp") {
    try {
      if (!API_KEY) {
        return sendJSON(res, 503, {
          error: "Termii API key is missing from .env."
        });
      }

      const body = await readBody(req);
      const phone = String(body.phone || "").replace(/[\s()+-]/g, "");

      if (!/^234\d{10}$/.test(phone)) {
        return sendJSON(res, 400, {
          error: "Enter a Nigerian number, e.g. 2348012345678."
        });
      }

      const now = Date.now();
const phoneKey = phone;
const today = new Date().toDateString();

if (!recentRequests.has(phoneKey)) {
  recentRequests.set(phoneKey, { count: 1, date: today });
} else {
  const record = recentRequests.get(phoneKey);
  if (record.date !== today) {
    record.count = 1;
    record.date = today;
  } else {
    record.count++;
  }
  if (record.count > 1000) {
    return sendJSON(res, 429, {
      error: "You don reach 1000 OTP today. Try tomorrow."
    });
  }
  recentRequests.set(phoneKey, record);
}

      const result = await termiiRequest("/api/sms/otp/send", {
        message_type: "NUMERIC",
        to: phone,
        from: "N-Alert",
        channel: "generic",
        pin_attempts: 3,
        pin_time_to_live: 10,
        pin_length: 6,
        pin_placeholder: "< 123456 >",
        message_text:
          "Your BRAINBOX verification code is < 123456 >. It expires in 5 minutes."
      });

      const pinId = result.pinId || result.pin_id;

      if (!pinId) {
        recentRequests.delete(phone);
        return sendJSON(res, 502, {
          error: "Termii did not return an OTP reference. Check your Termii settings."
        });
      }

      pendingPins.set(phone, {
        pinId,
        createdAt: Date.now()
      });

      return sendJSON(res, 200, {
        message: "OTP request accepted. Check your phone."
      });
    } catch (error) {
      console.error("OTP send failed:", error.message);
      return sendJSON(res, 502, {
        error: "Could not send OTP. Check your Termii settings and balance."
      });
    }
  }

  // Verify a phone OTP
  if (req.method === "POST" && url.pathname === "/api/verify-otp") {
    try {
      if (!API_KEY) {
        return sendJSON(res, 503, {
          error: "Termii API key is missing from .env."
        });
      }

      const body = await readBody(req);
      const phone = String(body.phone || "").replace(/[\s()+-]/g, "");
      const pin = String(body.pin || "").trim();
      const pending = pendingPins.get(phone);

      if (!/^234\d{10}$/.test(phone) || !/^\d{6}$/.test(pin)) {
        return sendJSON(res, 400, {
          error: "Enter a valid phone number and six-digit code."
        });
      }

      if (!pending || Date.now() - pending.createdAt > 5 * 60 * 1000) {
        pendingPins.delete(phone);
        return sendJSON(res, 400, {
          error: "Code expired or not requested. Request a new code."
        });
      }

      const result = await termiiRequest("/api/sms/otp/verify", {
        pin_id: pending.pinId,
        pin
      });

      if (
        String(result.verified).toLowerCase() === "true" ||
        String(result.status).toLowerCase() === "success"
      ) {
        pendingPins.delete(phone);

        return sendJSON(res, 200, {
          verified: true,
          message: "Phone number verified."
        });
      }

      return sendJSON(res, 400, {
        verified: false,
        error: "The code was not verified."
      });
    } catch (error) {
      console.error("OTP verification failed:", error.message);
      return sendJSON(res, 502, {
        error: "Could not verify the code. Check your Termii settings."
      });
    }
  }

  // Any unknown route
  return sendJSON(res, 404, {
    error: "Route not found",
    requestedPath: url.pathname
  });
});

server.listen(PORT, () => {
  console.log(`BRAINBOX is running at http://localhost:${PORT}`);
});
