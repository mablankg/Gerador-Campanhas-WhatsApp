const { authorize, upstream, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const config = authorize(req, res);
  if (!config) return;
  try {
    const id = String(req.query?.id || "");
    const q = String(req.query?.q || "").slice(0, 160);
    if ((req.method === "PATCH" || (req.method === "GET" && id)) && !/^[1-9][0-9]{0,18}$/.test(id)) {
      return res.status(400).json({ error: "invalid_contact_id" });
    }
    const path = id ? `/v1/contacts/${id}` : `/v1/contacts${q ? `?q=${encodeURIComponent(q)}` : ""}`;
    const init = req.method === "GET" ? {} : { method: req.method, body: JSON.stringify(req.body || {}) };
    const result = await upstream(config, path, init);
    return res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

