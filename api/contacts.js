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
    const resource = String(req.query?.resource || "");
    const stageId = String(req.query?.stage_id || "");
    const q = String(req.query?.q || "").slice(0, 160);
    if (resource === "stages") {
      if (stageId && !/^[a-z0-9_]{1,40}$/.test(stageId)) return res.status(400).json({ error: "invalid_stage_id" });
      const path = stageId ? `/v1/contacts/stages/${stageId}` : "/v1/contacts/stages";
      const init = req.method === "GET" ? {} : { method: req.method, body: JSON.stringify(req.body || {}) };
      const result = await upstream(config, path, init);
      return res.status(result.status).json(result.body);
    }
    if (resource === "lawyers") {
      if (id && !/^[1-9][0-9]{0,18}$/.test(id)) return res.status(400).json({ error: "invalid_lawyer_id" });
      const path = id ? `/v1/lawyers/${id}` : "/v1/lawyers";
      const init = req.method === "GET" ? {} : { method: req.method, body: JSON.stringify(req.body || {}) };
      const result = await upstream(config, path, init);
      return res.status(result.status).json(result.body);
    }
    if ((req.method === "PATCH" || (req.method === "GET" && id)) && !/^[1-9][0-9]{0,18}$/.test(id)) {
      return res.status(400).json({ error: "invalid_contact_id" });
    }
    const account = String(req.query?.account || "");
    const accountQuery = /^[a-z0-9][a-z0-9_-]{2,31}$/.test(account) ? `account=${encodeURIComponent(account)}` : "";
    const archivedQuery = String(req.query?.archived || "") === "true" ? "archived=true" : "";
    const queryString = [accountQuery, q ? `q=${encodeURIComponent(q)}` : "", archivedQuery].filter(Boolean).join("&");
    const path = id ? `/v1/contacts/${id}${accountQuery ? `?${accountQuery}` : ""}` : `/v1/contacts${queryString ? `?${queryString}` : ""}`;
    const init = req.method === "GET" ? {} : { method: req.method, body: JSON.stringify(req.body || {}) };
    const result = await upstream(config, path, init);
    return res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

