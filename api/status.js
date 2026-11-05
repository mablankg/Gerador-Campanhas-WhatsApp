const { authorize, upstream, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const config = authorize(req, res);
  if (!config) return;
  try {
    if (req.method === "POST") {
      const action = String(req.body?.action || "");
      if (action === "create") {
        const name = String(req.body?.name || "").trim();
        if (name.length < 2 || name.length > 60) return res.status(400).json({ error: "invalid_account" });
        const result = await upstream(config, "/v1/accounts", { method: "POST", body: JSON.stringify({ name }) });
        return res.status(result.status).json(result.body);
      }
      if (["connect", "disconnect"].includes(action)) {
        const account = String(req.body?.account || "");
        if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(account)) return res.status(400).json({ error: "invalid_account" });
        const result = await upstream({ ...config, accountID: account }, `/v1/accounts/${account}/${action}`, { method: "POST", body: "{}" });
        return res.status(result.status).json(result.body);
      }
      if (action === "rename") {
        const account = String(req.body?.account || "");
        const name = String(req.body?.name || "").trim();
        if (!/^[a-z0-9][a-z0-9_-]{2,31}$/.test(account) || name.length < 2 || name.length > 60) return res.status(400).json({ error: "invalid_account" });
        const result = await upstream({ ...config, accountID: account }, `/v1/accounts/${account}`, { method: "PATCH", body: JSON.stringify({ name }) });
        return res.status(result.status).json(result.body);
      }
      return res.status(400).json({ error: "invalid_action" });
    }
    if (req.method !== "GET") return res.status(405).json({ error: "method_not_allowed" });
    if (String(req.query?.accounts || "") === "1") {
      const result = await upstream(config, "/v1/accounts");
      return res.status(result.status).json(result.body);
    }
    if (String(req.query?.qr || "") === "1") {
      const result = await upstream(config, "/v1/qr?format=json");
      return res.status(result.status).json(result.body);
    }
    const after = req.query?.after;
    if (after !== undefined && after !== "latest" && !/^[0-9]{1,18}$/.test(String(after))) return res.status(400).json({ error: "invalid_cursor" });
    const result = await upstream(config, after === undefined ? "/v1/status" : `/v1/messages?after=${encodeURIComponent(String(after))}`);
    res.status(result.status).json(result.body);
  } catch (error) {
    safeError(res, error);
  }
};


