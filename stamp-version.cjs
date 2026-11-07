const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { version } = require("./package.json");

let revision = process.env.VERCEL_GIT_COMMIT_SHA;
if (!revision) {
  try {
    revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    revision = "";
  }
}
const builtAt = new Date();
const suffix = /^[a-f0-9]{7,40}$/i.test(revision) ? revision.slice(0, 7) : builtAt.getTime().toString(36);
const date = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(builtAt);
const path = "index.html";
const html = fs.readFileSync(path, "utf8");
const marker = /(<small id="releaseInfo"[^>]*>)[^<]*(<\/small>)/;
if (!marker.test(html)) throw new Error("Indicador de versão ausente");
fs.writeFileSync(path, html.replace(marker, (_, start, end) => start + "Versão " + version + "+" + suffix + " · Publicação " + date + end));
