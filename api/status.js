const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!method(req, res, "GET")) return;
  const config = authorize(req, res);
  if (!config) return;
  try {
    const after = req.query?.after;
    if (after !== undefined && after !== "latest" && !/^[0-9]{1,18}$/.test(String(after))) return res.status(400).json({ error: "invalid_cursor" });
    const result = await upstream(config, after === undefined ? "/v1/status" : `/v1/messages?after=${encodeURIComponent(String(after))}`);
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};


