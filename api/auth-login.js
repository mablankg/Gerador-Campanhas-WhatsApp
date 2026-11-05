const { authorize, upstream, method, safeError } = require("../lib/whatsapp");
module.exports = async function handler(req, res) {
  if (!method(req, res, "POST")) return;
  const config = authorize(req, res); if (!config) return;
  try { const result = await upstream(config, "/v1/auth/login", { method: "POST", body: JSON.stringify(req.body || {}) }); res.status(result.status).json(result.body); } catch (error) { safeError(res, error); }
};

