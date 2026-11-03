const accessCard = document.querySelector("#accessCard");
const composer = document.querySelector("#composer");
const groupsCard = document.querySelector("#groupsCard");
const accessForm = document.querySelector("#accessForm");
const sendForm = document.querySelector("#sendForm");
const message = document.querySelector("#message");
const counter = document.querySelector("#counter");
const result = document.querySelector("#result");
const connection = document.querySelector("#connection");
const sendButton = document.querySelector("#sendButton");
const groupResult = document.querySelector("#groupResult");
const groupSelect = document.querySelector("#groupSelect");
let accessToken = sessionStorage.getItem("campaign_access") || "";

function showResult(text, error = false) {
  result.textContent = text;
  result.classList.remove("hidden", "error");
  if (error) result.classList.add("error");
}

function showGroupResult(text, error = false) {
  groupResult.textContent = text;
  groupResult.classList.remove("hidden", "error");
  if (error) groupResult.classList.add("error");
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
  groupsCard.classList.remove("hidden");
  await loadGroups();
}

async function poll(id) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const command = await call(`/api/command?id=${encodeURIComponent(id)}`);
    if (command.status === "done") return command.result || {};
    if (["failed", "unknown"].includes(command.status)) throw new Error(command.result?.error || command.status);
  }
  throw new Error("processing_timeout");
}

async function loadGroups() {
  try {
    const data = await call("/api/groups");
    groupSelect.replaceChildren();
    if (!data.groups?.length) {
      groupSelect.add(new Option("Nenhum grupo encontrado", ""));
      return;
    }
    groupSelect.add(new Option("Selecione um grupo", ""));
    for (const group of data.groups) groupSelect.add(new Option(`${group.name} (${group.participant_count})`, group.id));
  } catch (error) {
    groupSelect.replaceChildren(new Option("Não foi possível carregar", ""));
    showGroupResult(`Falha ao carregar grupos: ${error.message}`, true);
  }
}

async function syncGroups() {
  const button = document.querySelector("#refreshGroups");
  button.disabled = true;
  button.textContent = "Sincronizando...";
  showGroupResult("Consultando os grupos diretamente no WhatsApp...");
  try {
    const queued = await call("/api/groups-sync", { method: "POST", body: "{}" });
    const completed = await poll(queued.id);
    await loadGroups();
    showGroupResult(`Grupos atualizados: ${completed.group_count ?? groupSelect.options.length - 1}`);
  } catch (error) {
    showGroupResult(`Não foi possível atualizar os grupos: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "Atualizar lista";
  }
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessToken = document.querySelector("#accessToken").value;
  sessionStorage.setItem("campaign_access", accessToken);
  if (!(await status())) return showResult("Senha de acesso inválida ou serviço indisponível.", true);
  accessCard.classList.add("hidden");
  composer.classList.remove("hidden");
  groupsCard.classList.remove("hidden");
  await loadGroups();
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
    const completed = await poll(queued.id);
    showResult(`Mensagem enviada. ID: ${completed.message_id || "confirmado"}`);
    sendForm.reset();
    counter.textContent = "0 / 8000";
  } catch (error) {
    if (error.status === 401) { sessionStorage.removeItem("campaign_access"); accessToken = ""; accessCard.classList.remove("hidden"); composer.classList.add("hidden"); groupsCard.classList.add("hidden"); }
    showResult(`Não foi possível enviar: ${error.message}`, true);
  } finally {
    sendButton.disabled = false;
    sendButton.textContent = "Enviar mensagem";
  }
});

document.querySelector("#refreshGroups").addEventListener("click", syncGroups);

document.querySelector("#groupSendForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#groupSendButton");
  button.disabled = true;
  showGroupResult("Mensagem recebida pela fila. Aguardando o WhatsApp...");
  try {
    const queued = await call("/api/group-send", { method: "POST", body: JSON.stringify({ group_id: groupSelect.value, text: document.querySelector("#groupMessage").value }) });
    const completed = await poll(queued.id);
    showGroupResult(`Mensagem enviada ao grupo. ID: ${completed.message_id || "confirmado"}`);
    document.querySelector("#groupMessage").value = "";
  } catch (error) {
    showGroupResult(`Não foi possível enviar ao grupo: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#createGroupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#createGroupButton");
  const participants = document.querySelector("#groupParticipants").value.split(/[\n,;]+/).map((item) => item.replace(/\D/g, "")).filter(Boolean);
  button.disabled = true;
  showGroupResult("Criando grupo no WhatsApp...");
  try {
    const queued = await call("/api/groups", { method: "POST", body: JSON.stringify({ name: document.querySelector("#groupName").value, participants }) });
    const completed = await poll(queued.id);
    showGroupResult(`Grupo criado: ${completed.name || "Grupo"}`);
    event.target.reset();
    await loadGroups();
  } catch (error) {
    showGroupResult(`Não foi possível criar o grupo: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

unlock();


