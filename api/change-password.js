const { authorize, upstream, method, safeError } = require("../lib/whatsapp");
module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const config = authorize(req, res); if (!config) return;
  try { const result = await upstream(config, "/v1/auth/change-password", { method: "POST", headers: { "X-Session-Token": String(req.headers["x-session-token"] || "") }, body: JSON.stringify(req.body || {}) }); res.status(result.status).json(result.body); } catch (error) { safeError(res, error); }
};

