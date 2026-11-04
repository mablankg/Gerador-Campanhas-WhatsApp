const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!method(req, res, "GET")) return;
  const config = authorize(req, res);
  if (!config) return;
  const after = String(req.query?.after || "latest");
  if (after !== "latest" && !/^[0-9]{1,18}$/.test(after)) return res.status(400).json({ error: "invalid_cursor" });
  try {
    const result = await upstream(config, `/v1/messages?after=${encodeURIComponent(after)}`);
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

