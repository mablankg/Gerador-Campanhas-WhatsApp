const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!method(req, res, "POST")) return;
  const config = authorize(req, res);
  if (!config) return;
  try {
    const result = await upstream(config, "/v1/groups/sync", { method: "POST", body: "{}" });
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

