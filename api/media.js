const { authorize, method, safeError } = require("../lib/whatsapp");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!method(req, res, "GET")) return;
  const config = authorize(req, res);
  if (!config) return;
  const id = String(req.query.id || "");
  if (!/^[1-9][0-9]{0,18}$/.test(id)) return res.status(400).json({ error: "invalid_media_id" });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(`${config.baseUrl}/v1/media/${id}`, { signal: controller.signal, headers: { Authorization: `Bearer ${config.token}` } });
    if (!response.ok) {
      const body = await response.json().catch(() => ({ error: "media_unavailable" }));
      return res.status(response.status).json(body);
    }
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    const disposition = response.headers.get("content-disposition");
    if (disposition) res.setHeader("Content-Disposition", disposition);
    return res.status(200).send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    safeError(res, error);
  } finally {
    clearTimeout(timeout);
  }
};

