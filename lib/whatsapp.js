const crypto = require("node:crypto");

function settings() {
  const baseUrl = String(process.env.WHATSAPP_API_URL || "").replace(/\/$/, "");
  const token = String(process.env.WHATSAPP_API_TOKEN || "");
  const accessToken = String(process.env.APP_ACCESS_TOKEN || "");

  if (!baseUrl.startsWith("https://") || token.length < 32 || accessToken.length < 16) {
    throw new Error("server_not_configured");
  }
  return { baseUrl, token, accessToken };
}

function sameSecret(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorize(req, res) {
  let config;
  try {
    config = settings();
  } catch {
    res.status(503).json({ error: "server_not_configured" });
    return null;
  }

  if (!sameSecret(req.headers["x-app-token"], config.accessToken)) {
    res.status(401).json({ error: "unauthorized" });
    return null;
  }
  return config;
}

async function upstream(config, path, init = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: "invalid_upstream_response" };
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timeout);
  }
}

function method(req, res, allowed) {
  if (req.method !== allowed) {
    res.setHeader("Allow", allowed);
    res.status(405).json({ error: "method_not_allowed" });
    return false;
  }
  return true;
}

function safeError(res, error) {
  const timeout = error?.name === "AbortError";
  res.status(timeout ? 504 : 502).json({ error: timeout ? "upstream_timeout" : "upstream_unavailable" });
}

module.exports = { authorize, upstream, method, safeError };

