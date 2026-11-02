const accessCard = document.querySelector("#accessCard");
const composer = document.querySelector("#composer");
const accessForm = document.querySelector("#accessForm");
const sendForm = document.querySelector("#sendForm");
const message = document.querySelector("#message");
const counter = document.querySelector("#counter");
const result = document.querySelector("#result");
const connection = document.querySelector("#connection");
const sendButton = document.querySelector("#sendButton");
let accessToken = sessionStorage.getItem("campaign_access") || "";

function showResult(text, error = false) {
  result.textContent = text;
  result.classList.remove("hidden", "error");
  if (error) result.classList.add("error");
}

async function call(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", "x-app-token": accessToken, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({ error: "invalid_response" }));
  if (!response.ok) throw Object.assign(new Error(body.error || "request_failed"), { status: response.status });
  return body;
}

async function status() {
  try {
    const data = await call("/api/status");
    const online = data.worker_alive && data.status === "connected";
    connection.className = `connection ${online ? "online" : "offline"}`;
    connection.querySelector("b").textContent = online ? "WhatsApp conectado" : `WhatsApp: ${data.status || "offline"}`;
    return true;
  } catch (error) {
    connection.className = "connection offline";
    connection.querySelector("b").textContent = error.status === 401 ? "Acesso necessário" : "API indisponível";
    return false;
  }
}

async function unlock() {
  if (!accessToken || !(await status())) return;
  accessCard.classList.add("hidden");
  composer.classList.remove("hidden");
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessToken = document.querySelector("#accessToken").value;
  sessionStorage.setItem("campaign_access", accessToken);
  if (!(await status())) return showResult("Senha de acesso inválida ou serviço indisponível.", true);
  accessCard.classList.add("hidden");
  composer.classList.remove("hidden");
});

message.addEventListener("input", () => { counter.textContent = `${new Blob([message.value]).size} / 8000`; });

sendForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  result.classList.add("hidden");
  sendButton.disabled = true;
  sendButton.textContent = "Enviando...";
  try {
    const queued = await call("/api/send", {
      method: "POST",
      body: JSON.stringify({ to: document.querySelector("#to").value.replace(/\D/g, ""), text: message.value }),
    });
    showResult("Mensagem recebida pela fila. Aguardando o WhatsApp...");
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const command = await call(`/api/command?id=${encodeURIComponent(queued.id)}`);
      if (command.status === "done") { showResult(`Mensagem enviada. ID: ${command.result?.message_id || "confirmado"}`); sendForm.reset(); counter.textContent = "0 / 8000"; return; }
      if (["failed", "unknown"].includes(command.status)) throw new Error(command.result?.error || command.status);
    }
    showResult("A mensagem continua na fila. Consulte novamente em alguns instantes.");
  } catch (error) {
    if (error.status === 401) { sessionStorage.removeItem("campaign_access"); accessToken = ""; accessCard.classList.remove("hidden"); composer.classList.add("hidden"); }
    showResult(`Não foi possível enviar: ${error.message}`, true);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Enviar mensagem";
  }
});

unlock();

