const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

const phone = /^[1-9][0-9]{7,14}$/;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!method(req, res, "POST")) return;
  const config = authorize(req, res);
  if (!config) return;

  const to = String(req.body?.to || "");
  const text = String(req.body?.text || "").trim();
  if (!phone.test(to) || !text || Buffer.byteLength(text) > 8000) {
    return res.status(400).json({ error: "invalid_message" });
  }

  try {
    const result = await upstream(config, "/v1/messages", {
      method: "POST",
      body: JSON.stringify({ to, text }),
    });
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

