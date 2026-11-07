const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const config = authorize(req, res);
  if (!config) return;
  const action = String(req.query?.action || "");
  if (action) return proxyProcessRequest(req, res, config, action);
  if (!method(req, res, "GET")) return;
  const id = String(req.query?.id || "");
  if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: "invalid_command" });
  try {
    const result = await upstream(config, `/v1/commands/${id}`);
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

async function proxyProcessRequest(req, res, config, action) {
  const allowed = {
    processes: ["GET", "POST", "PATCH"],
    "process-links": ["GET", "POST", "DELETE"],
    "process-settings": ["GET", "PATCH"],
  };
  if (!allowed[action]?.includes(req.method)) {
    res.setHeader("Allow", (allowed[action] || []).join(", "));
    return res.status(action in allowed ? 405 : 404).json({ error: action in allowed ? "method_not_allowed" : "not_found" });
  }
  const query = new URLSearchParams();
  for (const key of ["q", "entity_type", "entity_id", "process_id"]) {
    const value = String(req.query?.[key] || "").trim();
    if (value) query.set(key, value);
  }
  const id = String(req.query?.id || "").trim();
  if (id && !/^\d+$/.test(id)) return res.status(400).json({ error: "invalid_process_id" });
  const suffix = query.size ? `?${query}` : "";
  const path = `/v1/${action}${action === "processes" && id ? `/${id}` : ""}${suffix}`;
  try {
    const init = req.method === "GET" ? { method: "GET" } : { method: req.method, body: JSON.stringify(req.body || {}) };
    const result = await upstream(config, path, init);
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
}

