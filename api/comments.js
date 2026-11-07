const { authorize, upstream, safeError } = require("../lib/whatsapp");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method)) return res.status(405).json({ error: "method_not_allowed" });
  const config = authorize(req, res); if (!config) return;
  const type = String(req.query?.entity_type || ""); const id = String(req.query?.entity_id || "");
  if (!(['contact','group'].includes(type) && id && id.length <= 180) && !(type === "message_status" && /^[1-9][0-9]{0,18}$/.test(id))) return res.status(400).json({ error: "invalid_entity" });
  try {
    const path = type === "message_status" ? `/v1/message-status?seq=${encodeURIComponent(id)}` : `/v1/comments?entity_type=${encodeURIComponent(type)}&entity_id=${encodeURIComponent(id)}`;
    const init = req.method === "POST" ? { method: "POST", body: JSON.stringify(req.body || {}) } : {};
    const result = await upstream(config, path, init); res.status(result.status).json(result.body);
  } catch (error) { safeError(res, error); }
};

