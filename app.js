const accessCard = document.querySelector("#accessCard");
const composer = document.querySelector("#composer");
const groupsCard = document.querySelector("#groupsCard");
const contactsCard = document.querySelector("#contactsCard");
const accessForm = document.querySelector("#accessForm");
const sendForm = document.querySelector("#sendForm");
const message = document.querySelector("#message");
const counter = document.querySelector("#counter");
const result = document.querySelector("#result");
const connection = document.querySelector("#connection");
const sendButton = document.querySelector("#sendButton");
const groupResult = document.querySelector("#groupResult");
const groupSelect = document.querySelector("#groupSelect");
const accessTokenInput = document.querySelector("#accessToken");
const togglePassword = document.querySelector("#togglePassword");
const contactList = document.querySelector("#contactList");
const contactForm = document.querySelector("#contactForm");
const contactEmpty = document.querySelector("#contactEmpty");
const contactResult = document.querySelector("#contactResult");
let accessToken = localStorage.getItem("campaign_access") || "";
accessTokenInput.value = accessToken;

togglePassword.addEventListener("click", () => {
  const showing = accessTokenInput.type === "text";
  accessTokenInput.type = showing ? "password" : "text";
  togglePassword.setAttribute("aria-pressed", String(!showing));
  togglePassword.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  togglePassword.title = showing ? "Mostrar senha" : "Ocultar senha";
});

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
  contactsCard.classList.remove("hidden");
  await Promise.all([loadGroups(), loadContacts()]);
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

function showContactResult(text, error = false) {
  contactResult.textContent = text;
  contactResult.classList.remove("hidden", "error");
  if (error) contactResult.classList.add("error");
}

function extraToText(extra = {}) {
  return Object.entries(extra).map(([key, value]) => `${key}: ${value ?? ""}`).join("\n");
}

function textToExtra(text) {
  const extra = {};
  for (const line of text.split("\n")) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key) extra[key] = value;
  }
  return extra;
}

function openContact(contact = null) {
  contactEmpty.classList.add("hidden");
  contactForm.classList.remove("hidden");
  document.querySelector("#contactId").value = contact?.id || "";
  document.querySelector("#contactFormTitle").textContent = contact ? (contact.name || contact.phone) : "Novo contato";
  document.querySelector("#contactPhoneLabel").textContent = contact?.phone || "";
  document.querySelector("#contactName").value = contact?.name || "";
  document.querySelector("#contactPhone").value = contact?.phone || "";
  document.querySelector("#contactPhone").readOnly = Boolean(contact);
  document.querySelector("#contactEmail").value = contact?.email || "";
  document.querySelector("#contactTaxId").value = contact?.tax_id || "";
  document.querySelector("#contactType").value = contact?.contact_type || "lead";
  document.querySelector("#contactStatus").value = contact?.status || "active";
  document.querySelector("#contactResponsible").value = contact?.responsible || "";
  document.querySelector("#contactTags").value = (contact?.tags || []).join(", ");
  document.querySelector("#contactNotes").value = contact?.notes || "";
  document.querySelector("#contactExtra").value = extraToText(contact?.extra);
  document.querySelector("#archiveContact").classList.toggle("hidden", !contact);
  document.querySelectorAll(".contact-item").forEach((item) => item.classList.toggle("active", item.dataset.id === String(contact?.id || "")));
}

async function loadContacts(query = "") {
  try {
    const data = await call(`/api/contacts${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    contactList.replaceChildren();
    if (!data.contacts?.length) {
      contactList.innerHTML = '<p class="muted">Nenhum contato encontrado.</p>';
      return;
    }
    for (const contact of data.contacts) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "contact-item";
      button.dataset.id = contact.id;
      const name = document.createElement("strong");
      name.textContent = contact.name || contact.phone;
      const detail = document.createElement("small");
      detail.textContent = `${contact.phone}${contact.status ? ` · ${contact.status}` : ""}`;
      button.append(name, detail);
      button.addEventListener("click", () => openContact(contact));
      contactList.append(button);
    }
  } catch (error) {
    contactList.innerHTML = '<p class="muted">Não foi possível carregar os contatos.</p>';
    showContactResult(`Falha ao carregar contatos: ${error.message}`, true);
  }
}

accessForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessToken = accessTokenInput.value;
  localStorage.setItem("campaign_access", accessToken);
  if (!(await status())) return showResult("Senha de acesso inválida ou serviço indisponível.", true);
  accessCard.classList.add("hidden");
  composer.classList.remove("hidden");
  groupsCard.classList.remove("hidden");
  contactsCard.classList.remove("hidden");
  await Promise.all([loadGroups(), loadContacts()]);
});

let contactSearchTimer;
document.querySelector("#contactSearch").addEventListener("input", (event) => {
  clearTimeout(contactSearchTimer);
  contactSearchTimer = setTimeout(() => loadContacts(event.target.value.trim()), 250);
});

document.querySelector("#newContact").addEventListener("click", () => openContact());

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const save = document.querySelector("#saveContact");
  save.disabled = true;
  try {
    let id = document.querySelector("#contactId").value;
    const name = document.querySelector("#contactName").value.trim();
    if (!id) {
      const created = await call("/api/contacts", { method: "POST", body: JSON.stringify({ phone: document.querySelector("#contactPhone").value.replace(/\D/g, ""), name }) });
      id = created.id;
    }
    const payload = {
      name,
      email: document.querySelector("#contactEmail").value.trim(),
      tax_id: document.querySelector("#contactTaxId").value.trim(),
      contact_type: document.querySelector("#contactType").value,
      status: document.querySelector("#contactStatus").value,
      responsible: document.querySelector("#contactResponsible").value.trim(),
      tags: document.querySelector("#contactTags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
      notes: document.querySelector("#contactNotes").value,
      extra: textToExtra(document.querySelector("#contactExtra").value),
    };
    const updated = await call(`/api/contacts?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(payload) });
    openContact(updated);
    await loadContacts(document.querySelector("#contactSearch").value.trim());
    showContactResult("Contato salvo com sucesso.");
  } catch (error) {
    showContactResult(`Não foi possível salvar o contato: ${error.message}`, true);
  } finally {
    save.disabled = false;
  }
});

document.querySelector("#archiveContact").addEventListener("click", async () => {
  const id = document.querySelector("#contactId").value;
  if (!id) return;
  try {
    await call(`/api/contacts?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ archived: true }) });
    contactForm.classList.add("hidden");
    contactEmpty.classList.remove("hidden");
    await loadContacts();
    showContactResult("Contato arquivado.");
  } catch (error) {
    showContactResult(`Não foi possível arquivar: ${error.message}`, true);
  }
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
    if (error.status === 401) { localStorage.removeItem("campaign_access"); accessToken = ""; accessCard.classList.remove("hidden"); composer.classList.add("hidden"); groupsCard.classList.add("hidden"); }
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


