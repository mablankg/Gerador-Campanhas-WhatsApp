const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!method(req, res, "POST")) return;
  const config = authorize(req, res);
  if (!config) return;
  const groupId = String(req.body?.group_id || "");
  const text = String(req.body?.text || "").trim();
  const media = req.body?.media && typeof req.body.media === "object" ? req.body.media : null;
  if (!/^[0-9-]+@g\.us$/.test(groupId) || (!text && !media?.data) || Buffer.byteLength(text) > 8000 || String(media?.data || "").length > 34 * 1024 * 1024) {
    return res.status(400).json({ error: "invalid_group_message" });
  }
  try {
    const result = await upstream(config, `/v1/groups/${encodeURIComponent(groupId)}/messages`, { method: "POST", body: JSON.stringify({ text, ...(media ? { media } : {}) }) });
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

