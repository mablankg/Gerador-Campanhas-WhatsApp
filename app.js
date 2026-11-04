const accessCard = document.querySelector("#accessCard");
const composer = document.querySelector("#contactsCard");
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
let allContacts = [];
let activeContact = null;
let allGroups = [];
let activeGroup = null;
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
    allGroups = data.groups || [];
    if (!data.groups?.length) {
      groupSelect.add(new Option("Nenhum grupo encontrado", ""));
	  renderGroups();
      return;
    }
    groupSelect.add(new Option("Selecione um grupo", ""));
    for (const group of data.groups) groupSelect.add(new Option(`${group.name} (${group.participant_count})`, group.id));
    renderGroups();
  } catch (error) {
    groupSelect.replaceChildren(new Option("Não foi possível carregar", ""));
    showGroupResult(`Falha ao carregar grupos: ${error.message}`, true);
  }
}

function renderGroups() {
  const list = document.querySelector("#groupList");
  const query = document.querySelector("#groupSearch").value.trim().toLocaleLowerCase("pt-BR");
  const groups = allGroups.filter((group) => !query || group.name.toLocaleLowerCase("pt-BR").includes(query));
  list.replaceChildren();
  if (!groups.length) { list.innerHTML = '<p class="muted">Nenhum grupo encontrado.</p>'; return; }
  for (const group of groups) {
    const button = document.createElement("button"); button.type = "button"; button.className = "contact-item"; button.dataset.id = group.id;
    const name = document.createElement("strong"); name.textContent = group.name;
    const detail = document.createElement("small"); detail.className = "contact-summary"; detail.textContent = `${group.participant_count} participantes${group.is_announce ? " · somente administradores" : ""}`;
    button.append(name, detail); button.addEventListener("click", () => openGroup(group)); list.append(button);
  }
}

async function loadGroupMessages(group) {
  const thread = document.querySelector("#messageThread"); thread.innerHTML = '<div class="empty-conversation">Carregando mensagens...</div>';
  try {
    const data = await call(`/api/group-messages?id=${encodeURIComponent(group.id)}`); thread.replaceChildren();
    if (!data.messages?.length) { thread.innerHTML = '<div class="empty-conversation">Nenhuma mensagem armazenada para este grupo.</div>'; return; }
    for (const item of data.messages) {
      const bubble=document.createElement("div"); bubble.className=`message-bubble${item.from_me?" mine":""}`;
      const body=document.createElement("span"); body.textContent=item.text||"Mensagem sem texto";
      const time=document.createElement("time"); time.textContent=new Date(item.timestamp).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"});
      bubble.append(body,time); thread.append(bubble);
    }
    thread.scrollTop=thread.scrollHeight;
  } catch(error){ thread.innerHTML=`<div class="empty-conversation">Não foi possível carregar as mensagens: ${error.message}</div>`; }
}

function openGroup(group) {
  activeGroup=group; activeContact=null; contactForm.classList.add("hidden"); contactEmpty.classList.add("hidden");
  document.querySelector("#conversationName").textContent=group.name; document.querySelector("#conversationPhone").textContent=`${group.participant_count} participantes`;
  document.querySelector("#detailContactName").textContent=group.name; document.querySelector("#entityDetailsTab").textContent="Grupo"; document.querySelector("#entityDetailsTab").dataset.tab="group";
  document.querySelector("#groupDetailName").textContent=group.name; document.querySelector("#groupDetailNameField").value=group.name;
  document.querySelector("#groupParticipantCount").value=group.participant_count; document.querySelector("#groupTopic").value=group.topic||"";
  document.querySelector("#groupAnnounce").value=group.is_announce?"Somente administradores":"Todos podem enviar";
  document.querySelector("#groupUpdatedAt").textContent=`Atualizado em ${new Date(group.updated_at).toLocaleString("pt-BR")}`;
  document.querySelector("#to").value=group.id; message.disabled=false; sendButton.disabled=false;
  document.querySelectorAll(".detail-tabs button").forEach((item,index)=>item.classList.toggle("active",index===0));
  document.querySelectorAll("[data-panel]").forEach((panel)=>panel.classList.toggle("hidden",panel.dataset.panel!=="group"));
  document.querySelectorAll("#groupList .contact-item").forEach((item)=>item.classList.toggle("active",item.dataset.id===group.id));
  loadGroupMessages(group); loadComments();
}

async function syncGroups(event) {
  const button = event?.currentTarget || document.querySelector("#refreshGroups");
	const originalText = button.textContent;
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
	button.textContent = originalText;
  }
}

function activeEntity() {
  if (activeContact) return { type: "contact", id: String(activeContact.id) };
  if (activeGroup) return { type: "group", id: activeGroup.id };
  return null;
}

async function loadComments() {
  const entity=activeEntity(); const content=document.querySelector("#historyContent");
  if(!entity){content.textContent="Selecione um contato ou grupo.";return;}
  try{
    const data=await call(`/api/comments?entity_type=${entity.type}&entity_id=${encodeURIComponent(entity.id)}`);
    content.replaceChildren();
    if(!data.comments?.length){content.textContent="Nenhum comentário registrado.";return;}
    for(const comment of data.comments){const item=document.createElement("div");item.className="timeline-item";const body=document.createElement("div");body.textContent=comment.body;const date=document.createElement("small");date.textContent=new Date(comment.created_at).toLocaleString("pt-BR");item.append(body,date);content.append(item);}
  }catch(error){content.textContent=`Não foi possível carregar os comentários: ${error.message}`;}
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

function formatPhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  const local = digits.startsWith("55") ? digits.slice(2) : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value;
}

function normalizePhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
}

function contactDisplayName(contact) {
  const name = contact?.name || formatPhone(contact?.phone || "");
  return contact?.nickname ? `${name} (${contact.nickname})` : name;
}

function renderExtraFields(extra = {}) {
  const container = document.querySelector("#contactExtraFields");
  container.replaceChildren();
  for (const [key, value] of Object.entries(extra)) {
    const row = document.createElement("div");
    row.className = "extra-row";
    const label = document.createElement("strong"); label.textContent = key;
    const input = document.createElement("input"); input.value = value ?? ""; input.dataset.extraKey = key;
    const remove = document.createElement("button"); remove.type = "button"; remove.textContent = "×";
    remove.addEventListener("click", () => row.remove());
    row.append(label, input, remove); container.append(row);
  }
}

function collectExtraFields() {
  const extra = {};
  document.querySelectorAll("#contactExtraFields input[data-extra-key]").forEach((input) => { extra[input.dataset.extraKey] = input.value.trim(); });
  return extra;
}

async function loadContactMessages(contact) {
  const thread = document.querySelector("#messageThread");
  thread.innerHTML = '<div class="empty-conversation">Carregando mensagens...</div>';
  try {
    const data = await call(`/api/contact-messages?id=${encodeURIComponent(contact.id)}`);
    thread.replaceChildren();
    if (!data.messages?.length) {
      thread.innerHTML = '<div class="empty-conversation">Nenhuma mensagem armazenada para este contato.</div>';
      return;
    }
    for (const item of data.messages) {
      const bubble = document.createElement("div"); bubble.className = `message-bubble${item.from_me ? " mine" : ""}`;
      const body = document.createElement("span"); body.textContent = item.text || "Mensagem sem texto";
      const time = document.createElement("time"); time.textContent = new Date(item.timestamp).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      bubble.append(body, time); thread.append(bubble);
    }
    thread.scrollTop = thread.scrollHeight;
  } catch (error) {
    thread.innerHTML = `<div class="empty-conversation">Não foi possível carregar as mensagens: ${error.message}</div>`;
  }
}

function openContact(contact = null) {
  activeContact = contact;
	activeGroup = null;
  contactEmpty.classList.add("hidden");
  contactForm.classList.remove("hidden");
  document.querySelector("#contactId").value = contact?.id || "";
	document.querySelector("#contactFormTitle").textContent = contact ? contactDisplayName(contact) : "Novo contato";
	document.querySelector("#contactPhoneLabel").textContent = formatPhone(contact?.phone || "");
  document.querySelector("#contactName").value = contact?.name || "";
	document.querySelector("#contactNickname").value = contact?.nickname || "";
	document.querySelector("#contactPhone").value = contact ? formatPhone(contact.phone) : "";
  document.querySelector("#contactPhone").readOnly = Boolean(contact);
  document.querySelector("#contactEmail").value = contact?.email || "";
  document.querySelector("#contactTaxId").value = contact?.tax_id || "";
  document.querySelector("#contactType").value = contact?.contact_type || "lead";
  document.querySelector("#contactStatus").value = contact?.status || "active";
  document.querySelector("#contactResponsible").value = contact?.responsible || "";
  document.querySelector("#contactTags").value = (contact?.tags || []).join(", ");
  document.querySelector("#contactNotes").value = contact?.notes || "";
	document.querySelector("#contactExtra").value = extraToText(contact?.extra);
	renderExtraFields(contact?.extra);
  document.querySelector("#archiveContact").classList.toggle("hidden", !contact);
  document.querySelectorAll(".contact-item").forEach((item) => item.classList.toggle("active", item.dataset.id === String(contact?.id || "")));
	document.querySelector("#conversationName").textContent = contact ? contactDisplayName(contact) : "Novo contato";
	document.querySelector("#conversationPhone").textContent = contact ? formatPhone(contact.phone) : "Preencha a ficha ao lado";
	document.querySelector("#detailContactName").textContent = contact ? contactDisplayName(contact) : "Novo contato";
	document.querySelector("#entityDetailsTab").textContent = "Contato";
	document.querySelector("#entityDetailsTab").dataset.tab = "contact";
	document.querySelector("#to").value = contact?.phone || "";
	message.disabled = !contact;
	sendButton.disabled = !contact;
	const history = document.querySelector("#historyContent");
	history.innerHTML = contact ? `<div class="timeline-item"><strong>Primeiro contato</strong><br>${new Date(contact.first_contact_at).toLocaleString("pt-BR")}</div><div class="timeline-item"><strong>Última atividade</strong><br>${new Date(contact.last_contact_at).toLocaleString("pt-BR")}</div>` : "Salve o contato para iniciar o histórico.";
	document.querySelectorAll(".detail-tabs button").forEach((item,index)=>item.classList.toggle("active",index===0));
	document.querySelectorAll("[data-panel]").forEach((panel)=>panel.classList.toggle("hidden",panel.dataset.panel!=="contact"));
	if (contact) { loadContactMessages(contact); loadComments(); } else document.querySelector("#messageThread").innerHTML = '<div class="empty-conversation">Salve o contato para iniciar a conversa.</div>';
}

function renderContacts() {
	const type = document.querySelector("#contactTypeFilter").value;
	const status = document.querySelector("#contactStatusFilter").value;
	const contacts = allContacts.filter((contact) => (!type || contact.contact_type === type) && (!status || contact.status === status));
	contactList.replaceChildren();
	if (!contacts.length) { contactList.innerHTML = '<p class="muted">Nenhum contato encontrado.</p>'; return; }
	for (const contact of contacts) {
		const button = document.createElement("button"); button.type = "button"; button.className = "contact-item"; button.dataset.id = contact.id;
		const name = document.createElement("strong"); name.textContent = contactDisplayName(contact);
		const detail = document.createElement("small"); detail.className = "contact-summary"; detail.textContent = `${formatPhone(contact.phone)} · ${contact.contact_type || "lead"} · ${contact.status || "active"}`;
		button.append(name, detail);
		const extraEntries = Object.entries(contact.extra || {}).slice(0, 2);
		if (extraEntries.length) { const extra = document.createElement("small"); extra.className = "contact-extra-preview"; extra.textContent = extraEntries.map(([key, value]) => `${key}: ${value}`).join(" · "); button.append(extra); }
		button.addEventListener("click", () => openContact(contact)); contactList.append(button);
	}
}

async function loadContacts(query = "") {
  try {
    const data = await call(`/api/contacts${query ? `?q=${encodeURIComponent(query)}` : ""}`);
		allContacts = data.contacts || [];
		renderContacts();
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
  contactsCard.classList.remove("hidden");
  await Promise.all([loadGroups(), loadContacts()]);
});

let contactSearchTimer;
document.querySelector("#contactSearch").addEventListener("input", (event) => {
  clearTimeout(contactSearchTimer);
  contactSearchTimer = setTimeout(() => loadContacts(event.target.value.trim()), 250);
});
document.querySelector("#contactTypeFilter").addEventListener("change", renderContacts);
document.querySelector("#contactStatusFilter").addEventListener("change", renderContacts);
document.querySelector("#groupSearch").addEventListener("input", renderGroups);

function switchCRMMode(mode){
  const contacts=mode==="contacts"; document.querySelector("#contactsMode").classList.toggle("hidden",!contacts); document.querySelector("#groupsMode").classList.toggle("hidden",contacts);
  document.querySelector("#contactsModeTab").classList.toggle("active",contacts); document.querySelector("#groupsModeTab").classList.toggle("active",!contacts);
  document.querySelector(".rail-heading h2").textContent=contacts?"Contatos":"Grupos";
}
document.querySelector("#contactsModeTab").addEventListener("click",()=>switchCRMMode("contacts"));
document.querySelector("#groupsModeTab").addEventListener("click",()=>switchCRMMode("groups"));
document.querySelector("#syncGroupsRail").addEventListener("click",syncGroups);
document.querySelector("#newGroupRail").addEventListener("click",()=>{groupsCard.classList.remove("hidden");groupsCard.scrollIntoView({behavior:"smooth"});});

document.querySelector("#toggleContactRail").addEventListener("click", () => { document.querySelector("#contactRail").classList.add("collapsed"); contactsCard.classList.add("left-collapsed"); });
document.querySelector("#showContactRail").addEventListener("click", () => { document.querySelector("#contactRail").classList.remove("collapsed"); contactsCard.classList.remove("left-collapsed"); });
document.querySelector("#toggleDetailRail").addEventListener("click", () => { document.querySelector("#detailRail").classList.add("collapsed"); contactsCard.classList.add("right-collapsed"); });
document.querySelector("#showDetailRail").addEventListener("click", () => { document.querySelector("#detailRail").classList.remove("collapsed"); contactsCard.classList.remove("right-collapsed"); });

document.querySelectorAll(".detail-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".detail-tabs button").forEach((item) => item.classList.toggle("active", item === button));
  document.querySelectorAll("[data-panel]").forEach((panel) => panel.classList.toggle("hidden", panel.dataset.panel !== button.dataset.tab));
  contactEmpty.classList.toggle("hidden", Boolean(activeContact) || button.dataset.tab !== "contact");
	if(button.dataset.tab==="history") loadComments();
}));

document.querySelector("#commentForm").addEventListener("submit",async(event)=>{
  event.preventDefault(); const entity=activeEntity(); const body=document.querySelector("#commentBody"); if(!entity||!body.value.trim())return;
  try{await call(`/api/comments?entity_type=${entity.type}&entity_id=${encodeURIComponent(entity.id)}`,{method:"POST",body:JSON.stringify({body:body.value})});body.value="";await loadComments();}
  catch(error){showContactResult(`Não foi possível salvar o comentário: ${error.message}`,true);}
});

document.querySelector("#addExtraField").addEventListener("click", () => {
  const key = document.querySelector("#newExtraKey"); const value = document.querySelector("#newExtraValue");
  if (!key.value.trim()) return;
  const extra = collectExtraFields(); extra[key.value.trim()] = value.value.trim(); renderExtraFields(extra); key.value = ""; value.value = "";
});

document.querySelector("#newContact").addEventListener("click", () => openContact());

document.querySelector("#syncContacts").addEventListener("click", async () => {
  const button = document.querySelector("#syncContacts");
  button.disabled = true;
  button.textContent = "Sincronizando...";
  showContactResult("Importando contatos armazenados na sessão do WhatsApp...");
  try {
    const queued = await call("/api/contacts-sync", { method: "POST", body: "{}" });
    const completed = await poll(queued.id);
    await loadContacts(document.querySelector("#contactSearch").value.trim());
    showContactResult(`Contatos sincronizados: ${completed.contact_count ?? "concluído"}.`);
  } catch (error) {
    showContactResult(`Não foi possível sincronizar os contatos: ${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "Sincronizar WhatsApp";
  }
});

contactForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const save = document.querySelector("#saveContact");
  save.disabled = true;
  try {
    let id = document.querySelector("#contactId").value;
    const name = document.querySelector("#contactName").value.trim();
    if (!id) {
	  const created = await call("/api/contacts", { method: "POST", body: JSON.stringify({ phone: normalizePhone(document.querySelector("#contactPhone").value), name }) });
      id = created.id;
    }
    const payload = {
      name,
	  nickname: document.querySelector("#contactNickname").value.trim(),
      email: document.querySelector("#contactEmail").value.trim(),
      tax_id: document.querySelector("#contactTaxId").value.trim(),
      contact_type: document.querySelector("#contactType").value,
      status: document.querySelector("#contactStatus").value,
      responsible: document.querySelector("#contactResponsible").value.trim(),
      tags: document.querySelector("#contactTags").value.split(",").map((tag) => tag.trim()).filter(Boolean),
      notes: document.querySelector("#contactNotes").value,
	  extra: collectExtraFields(),
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
	const queued = activeGroup
	  ? await call("/api/group-send", { method: "POST", body: JSON.stringify({ group_id: activeGroup.id, text: message.value }) })
	  : await call("/api/send", { method: "POST", body: JSON.stringify({ to: document.querySelector("#to").value.replace(/\D/g, ""), text: message.value }) });
    showResult("Mensagem recebida pela fila. Aguardando o WhatsApp...");
    const completed = await poll(queued.id);
	showResult(`Mensagem enviada. ID: ${completed.message_id || "confirmado"}`);
	message.value = "";
    counter.textContent = "0 / 8000";
	if (activeContact) await loadContactMessages(activeContact);
	if (activeGroup) await loadGroupMessages(activeGroup);
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


