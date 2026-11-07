const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const config = authorize(req, res);
  if (!config) return;
  try {
    if (req.method === "PATCH") {
      const id = String(req.query?.id || "");
      if (!/^[0-9-]+@g\.us$/.test(id)) return res.status(400).json({ error: "invalid_group_id" });
      const result = await upstream(config, `/v1/groups/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(req.body || {}) });
      return res.status(result.status).json(result.body);
    }
    if (req.method === "GET") {
      const account = String(req.query?.account || "");
      const params = new URLSearchParams();
      if (/^[a-z0-9][a-z0-9_-]{2,31}$/.test(account)) params.set("account", account);
      if (String(req.query?.archived || "") === "true") params.set("archived", "true");
      const path = `/v1/groups${params.size ? `?${params}` : ""}`;
      const result = await upstream(config, path);
      return res.status(result.status).json(result.body);
    }
    const name = String(req.body?.name || "").trim();
    const participants = Array.isArray(req.body?.participants) ? req.body.participants.map(String) : [];
    if (!name || [...name].length > 25 || participants.length < 1 || participants.length > 100 || participants.some((item) => !/^[1-9][0-9]{7,14}$/.test(item))) {
      return res.status(400).json({ error: "invalid_group" });
    }
    const result = await upstream(config, "/v1/groups", { method: "POST", body: JSON.stringify({ name, participants }) });
    return res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};

