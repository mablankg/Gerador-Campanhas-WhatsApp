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
const kanbanBoard = document.querySelector("#kanbanBoard");
const viewSwitch = document.querySelector("#viewSwitch");
let accessToken = localStorage.getItem("campaign_access") || "";
let allContacts = [];
let activeContact = null;
let allGroups = [];
let activeGroup = null;
let liveRefreshTimer = null;
let liveRefreshBusy = false;
let liveRefreshCycle = 0;
let mediaObjectURLs = [];
let renderedConversationKey = "";
let renderedConversationSignature = "";
let messageEventCursor = "latest";
const unreadContacts = new Set();
const unreadGroups = new Set();
const savedLeftPanelWidth = Number(localStorage.getItem("blank_left_panel_width"));
const savedRightPanelWidth = Number(localStorage.getItem("blank_right_panel_width"));
if (savedLeftPanelWidth >= 230 && savedLeftPanelWidth <= 520) contactsCard.style.setProperty("--left-rail-width", `${savedLeftPanelWidth}px`);
if (savedRightPanelWidth >= 280 && savedRightPanelWidth <= 600) contactsCard.style.setProperty("--right-rail-width", `${savedRightPanelWidth}px`);
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

function clearMediaObjectURLs() {
  for (const url of mediaObjectURLs) URL.revokeObjectURL(url);
  mediaObjectURLs = [];
}

function conversationSignature(messages = []) {
  return messages.map((item) => `${item.seq}:${item.id}:${item.from_me ? 1 : 0}:${item.text || ""}:${item.media?.id || 0}`).join("|");
}

function shouldKeepRenderedConversation(key, messages, silent) {
  const signature = conversationSignature(messages);
  if (silent && renderedConversationKey === key && renderedConversationSignature === signature) return true;
  renderedConversationKey = key;
  renderedConversationSignature = signature;
  return false;
}

async function appendMessageMedia(bubble, media) {
  if (!media?.id) return;
  const response = await fetch(`/api/media?id=${encodeURIComponent(media.id)}`, { headers: { "x-app-token": accessToken } });
  if (!response.ok) {
    const unavailable = document.createElement("small"); unavailable.className = "media-unavailable"; unavailable.textContent = "Anexo indisponível"; bubble.append(unavailable); return;
  }
  const url = URL.createObjectURL(await response.blob()); mediaObjectURLs.push(url);
  let element;
  if (media.type === "image" || media.type === "sticker") {
    const link = document.createElement("a"); link.href = url; link.target = "_blank"; link.rel = "noopener"; link.title = "Abrir imagem";
    element = document.createElement("img"); element.src = url; element.alt = media.caption || (media.type === "sticker" ? "Figurinha" : "Imagem"); element.className = `message-media ${media.type}`;
    link.append(element); bubble.append(link); return;
  } else if (media.type === "audio") {
    element = document.createElement("audio"); element.src = url; element.controls = true; element.preload = "metadata"; element.className = "message-media";
  } else if (media.type === "video") {
    element = document.createElement("video"); element.src = url; element.controls = true; element.preload = "metadata"; element.className = "message-media";
  } else {
    element = document.createElement("a"); element.href = url; element.target = "_blank"; element.rel = "noopener"; element.textContent = `📄 ${media.file_name || "Abrir documento"}`; element.className = "message-document";
  }
  bubble.append(element);
  if (media.type === "audio" || media.type === "video") {
    const open = document.createElement("a"); open.href = url; open.target = "_blank"; open.rel = "noopener"; open.className = "media-open"; open.textContent = "Abrir em nova janela"; bubble.append(open);
  }
}

function appendTextWithLinks(container, text) {
  const body = document.createElement("span"); body.className = "message-text";
  for (const part of text.split(/(https?:\/\/[^\s]+)/g)) {
    if (/^https?:\/\//.test(part)) {
      const link = document.createElement("a"); link.href = part; link.target = "_blank"; link.rel = "noopener noreferrer"; link.textContent = part; body.append(link);
    } else if (part) body.append(document.createTextNode(part));
  }
  container.append(body);
}

async function renderMessageBubble(thread, item) {
  const bubble = document.createElement("div"); bubble.className = `message-bubble${item.from_me ? " mine" : ""}`;
  const text = item.text || item.media?.caption;
  if (text) appendTextWithLinks(bubble, text);
  await appendMessageMedia(bubble, item.media);
  if (!text && !item.media) { const body = document.createElement("span"); body.textContent = "Mensagem sem texto"; bubble.append(body); }
  const time = document.createElement("time"); time.textContent = new Date(item.timestamp).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  bubble.append(time); thread.append(bubble);
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
  viewSwitch.classList.remove("hidden");
  await Promise.all([loadGroups(), loadContacts()]);
	await pollMessageEvents();
	startLiveRefresh();
}

async function pollMessageEvents() {
  const data = await call(`/api/status?after=${encodeURIComponent(messageEventCursor)}`);
  messageEventCursor = String(data.next_after ?? messageEventCursor);
  let changed = false;
  for (const item of data.messages || []) {
    if (item.from_me) continue;
    if (String(item.chat).endsWith("@g.us")) {
      if (activeGroup?.id !== item.chat) unreadGroups.add(item.chat);
    } else if (item.contact_phone) {
      const contact = allContacts.find((entry) => entry.phone === item.contact_phone);
      if (contact && String(activeContact?.id || "") !== String(contact.id)) unreadContacts.add(String(contact.id));
    }
    changed = true;
  }
  if (changed) { renderContacts(); renderGroups(); if (!kanbanBoard.classList.contains("hidden")) renderKanban(); }
}

function startLiveRefresh() {
  if (liveRefreshTimer) return;
  liveRefreshTimer = setInterval(async () => {
    if (document.hidden || liveRefreshBusy || !accessToken) return;
    liveRefreshBusy = true;
    liveRefreshCycle += 1;
    try {
      await pollMessageEvents();
      if (activeContact) await loadContactMessages(activeContact, true);
      else if (activeGroup) await loadGroupMessages(activeGroup, true);
      if (liveRefreshCycle % 3 === 0) await loadContacts(document.querySelector("#contactSearch").value.trim(), true);
      if (liveRefreshCycle % 6 === 0) await status();
    } finally {
      liveRefreshBusy = false;
    }
  }, 3000);
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
  const groups = allGroups
    .filter((group) => !query || group.name.toLocaleLowerCase("pt-BR").includes(query))
    .sort((left, right) => left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base", numeric: true }));
  list.replaceChildren();
  if (!groups.length) { list.innerHTML = '<p class="muted">Nenhum grupo encontrado.</p>'; return; }
  for (const group of groups) {
    const button = document.createElement("button"); button.type = "button"; button.className = `contact-item${activeGroup?.id===group.id?" active":""}${unreadGroups.has(group.id)?" incoming":""}`; button.dataset.id = group.id;
    if (activeGroup?.id === group.id) button.setAttribute("aria-current", "true");
    const name = document.createElement("strong"); name.textContent = group.name;
    const detail = document.createElement("small"); detail.className = "contact-summary"; detail.textContent = `${group.participant_count} participantes${group.is_announce ? " · somente administradores" : ""}`;
    button.append(name, detail); button.addEventListener("click", () => openGroup(group)); list.append(button);
  }
}

async function loadGroupMessages(group, silent = false) {
  const thread = document.querySelector("#messageThread"); if (!silent) thread.innerHTML = '<div class="empty-conversation">Carregando mensagens...</div>';
  try {
    const data = await call(`/api/group-messages?id=${encodeURIComponent(group.id)}`);
    if (shouldKeepRenderedConversation(`group:${group.id}`, data.messages || [], silent)) return;
    clearMediaObjectURLs(); thread.replaceChildren();
    if (!data.messages?.length) { thread.innerHTML = '<div class="empty-conversation">Nenhuma mensagem armazenada para este grupo.</div>'; return; }
    for (const item of data.messages) await renderMessageBubble(thread, item);
    thread.scrollTop=thread.scrollHeight;
  } catch(error){ if (!silent) thread.innerHTML=`<div class="empty-conversation">Não foi possível carregar as mensagens: ${error.message}</div>`; }
}

function openGroup(group) {
  unreadGroups.delete(group.id);
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
  document.querySelectorAll("#groupList .contact-item").forEach((item)=>{ const selected=item.dataset.id===group.id; item.classList.toggle("active",selected); item.toggleAttribute("aria-current",selected); if(selected)item.classList.remove("incoming"); });
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

const attendanceStages = [
  ["new", "Novos"], ["in_progress", "Em atendimento"], ["waiting_client", "Aguardando cliente"],
  ["waiting_action", "Aguardando providência"], ["finished", "Finalizados"],
];
const priorityLabels = { urgent: "Urgente", high: "Alta", normal: "Normal", low: "Baixa" };
const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };

function renderKanban() {
  const container = document.querySelector("#kanbanColumns");
  container.replaceChildren();
  for (const [stage, label] of attendanceStages) {
    const column = document.createElement("section"); column.className = "kanban-column"; column.dataset.stage = stage;
    const contacts = allContacts.filter((item) => (item.attendance_stage || "new") === stage)
      .sort((a, b) => (priorityOrder[a.priority || "normal"] - priorityOrder[b.priority || "normal"]) || contactDisplayName(a).localeCompare(contactDisplayName(b), "pt-BR"));
    const heading = document.createElement("div"); heading.className = "kanban-column-heading";
    const title = document.createElement("strong"); title.textContent = label;
    const count = document.createElement("span"); count.textContent = contacts.length; heading.append(title, count); column.append(heading);
    const cards = document.createElement("div"); cards.className = "kanban-card-list";
    for (const contact of contacts) {
      const card = document.createElement("article"); card.className = `kanban-card priority-${contact.priority || "normal"}${unreadContacts.has(String(contact.id)) ? " incoming" : ""}`; card.draggable = true; card.dataset.id = contact.id;
      const priority = document.createElement("span"); priority.className = "kanban-priority"; priority.textContent = priorityLabels[contact.priority || "normal"];
      const name = document.createElement("strong"); name.textContent = contactDisplayName(contact);
      const phone = document.createElement("small"); phone.textContent = formatPhone(contact.phone);
      const meta = document.createElement("div"); meta.className = "kanban-meta"; meta.textContent = contact.responsible || contact.contact_type || "Lead";
      card.append(priority, name, phone, meta);
      card.addEventListener("dragstart", (event) => { event.dataTransfer.setData("text/contact-id", String(contact.id)); card.classList.add("dragging"); });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("click", () => { openContact(contact); showConversationView(); });
      cards.append(card);
    }
    column.append(cards);
    column.addEventListener("dragover", (event) => { event.preventDefault(); column.classList.add("drag-over"); });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault(); column.classList.remove("drag-over"); const id = event.dataTransfer.getData("text/contact-id");
      const contact = allContacts.find((item) => String(item.id) === id); if (!contact || contact.attendance_stage === stage) return;
      const previousStage = contact.attendance_stage || "new"; contact.attendance_stage = stage; renderKanban();
      try { const updated = await call(`/api/contacts?id=${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ attendance_stage: stage }) }); Object.assign(contact, updated); }
      catch (error) { contact.attendance_stage = previousStage; showContactResult(`Não foi possível mover o contato: ${error.message}`, true); }
      renderKanban(); renderContacts();
    });
    container.append(column);
  }
}

function showConversationView() {
  kanbanBoard.classList.add("hidden"); kanbanBoard.style.display = "none"; kanbanBoard.setAttribute("aria-hidden", "true");
  contactsCard.classList.remove("hidden"); contactsCard.style.display = "grid"; contactsCard.setAttribute("aria-hidden", "false");
  document.querySelector("#conversationViewButton").classList.add("active"); document.querySelector("#boardViewButton").classList.remove("active");
}

function showBoardView() {
  contactsCard.classList.add("hidden"); contactsCard.style.display = "none"; contactsCard.setAttribute("aria-hidden", "true");
  kanbanBoard.classList.remove("hidden"); kanbanBoard.style.display = "flex"; kanbanBoard.setAttribute("aria-hidden", "false"); renderKanban();
  document.querySelector("#boardViewButton").classList.add("active"); document.querySelector("#conversationViewButton").classList.remove("active");
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

async function loadContactMessages(contact, silent = false) {
  const thread = document.querySelector("#messageThread");
	if (!silent) thread.innerHTML = '<div class="empty-conversation">Carregando mensagens...</div>';
  try {
    const data = await call(`/api/contact-messages?id=${encodeURIComponent(contact.id)}`);
    if (shouldKeepRenderedConversation(`contact:${contact.id}`, data.messages || [], silent)) return;
    clearMediaObjectURLs(); thread.replaceChildren();
    if (!data.messages?.length) {
      thread.innerHTML = '<div class="empty-conversation">Nenhuma mensagem armazenada para este contato.</div>';
      return;
    }
    for (const item of data.messages) await renderMessageBubble(thread, item);
    thread.scrollTop = thread.scrollHeight;
  } catch (error) {
	if (!silent) thread.innerHTML = `<div class="empty-conversation">Não foi possível carregar as mensagens: ${error.message}</div>`;
  }
}

function openContact(contact = null) {
  if (contact) unreadContacts.delete(String(contact.id));
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
	document.querySelector("#contactStage").value = contact?.attendance_stage || "new";
	document.querySelector("#contactPriority").value = contact?.priority || "normal";
  document.querySelector("#contactResponsible").value = contact?.responsible || "";
  document.querySelector("#contactTags").value = (contact?.tags || []).join(", ");
  document.querySelector("#contactNotes").value = contact?.notes || "";
	document.querySelector("#contactExtra").value = extraToText(contact?.extra);
	renderExtraFields(contact?.extra);
  document.querySelector("#archiveContact").classList.toggle("hidden", !contact);
	document.querySelectorAll("#contactList .contact-item").forEach((item) => { const selected=item.dataset.id === String(contact?.id || ""); item.classList.toggle("active", selected); item.toggleAttribute("aria-current", selected); if(selected)item.classList.remove("incoming"); });
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
	const contacts = allContacts
	  .filter((contact) => (!type || contact.contact_type === type) && (!status || contact.status === status))
	  .sort((left, right) => contactDisplayName(left).localeCompare(contactDisplayName(right), "pt-BR", { sensitivity: "base", numeric: true }));
	contactList.replaceChildren();
	if (!contacts.length) { contactList.innerHTML = '<p class="muted">Nenhum contato encontrado.</p>'; return; }
	for (const contact of contacts) {
		const button = document.createElement("button"); button.type = "button"; button.className = `contact-item${String(activeContact?.id||"")===String(contact.id)?" active":""}${unreadContacts.has(String(contact.id))?" incoming":""}`; button.dataset.id = contact.id;
		if (String(activeContact?.id || "") === String(contact.id)) button.setAttribute("aria-current", "true");
		const name = document.createElement("strong"); name.textContent = contactDisplayName(contact);
		const detail = document.createElement("small"); detail.className = "contact-summary"; detail.textContent = `${formatPhone(contact.phone)} · ${contact.contact_type || "lead"} · ${contact.status || "active"}`;
		button.append(name, detail);
		const workflow = document.createElement("small"); workflow.className = `contact-workflow priority-${contact.priority || "normal"}`; workflow.textContent = `${attendanceStages.find(([key]) => key === (contact.attendance_stage || "new"))?.[1] || "Novo"} · ${priorityLabels[contact.priority || "normal"]}`; button.append(workflow);
		const extraEntries = Object.entries(contact.extra || {}).slice(0, 2);
		if (extraEntries.length) { const extra = document.createElement("small"); extra.className = "contact-extra-preview"; extra.textContent = extraEntries.map(([key, value]) => `${key}: ${value}`).join(" · "); button.append(extra); }
		button.addEventListener("click", () => openContact(contact)); contactList.append(button);
	}
}

async function loadContacts(query = "", silent = false) {
  try {
    const data = await call(`/api/contacts${query ? `?q=${encodeURIComponent(query)}` : ""}`);
		allContacts = data.contacts || [];
		if (activeContact) activeContact = allContacts.find((item) => String(item.id) === String(activeContact.id)) || activeContact;
		renderContacts();
		if (!kanbanBoard.classList.contains("hidden")) renderKanban();
  } catch (error) {
		if (silent) return;
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
	startLiveRefresh();
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
document.querySelector("#conversationViewButton").addEventListener("click", showConversationView);
document.querySelector("#boardViewButton").addEventListener("click", showBoardView);

function enablePanelResize(handle, side) {
  handle.addEventListener("pointerdown", (event) => {
    if (window.innerWidth <= 1050) return;
    event.preventDefault();
    handle.setPointerCapture(event.pointerId);
    handle.classList.add("dragging"); document.body.classList.add("resizing-panels");
    const startX = event.clientX;
    const property = side === "left" ? "--left-rail-width" : "--right-rail-width";
    const rail = document.querySelector(side === "left" ? "#contactRail" : "#detailRail");
    const startWidth = rail.getBoundingClientRect().width;
    const minimum = side === "left" ? 230 : 280;
    const maximum = side === "left" ? 520 : 600;
    const move = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const width = Math.round(Math.min(maximum, Math.max(minimum, startWidth + (side === "left" ? delta : -delta))));
      contactsCard.style.setProperty(property, `${width}px`);
    };
    const finish = () => {
      handle.classList.remove("dragging"); document.body.classList.remove("resizing-panels");
      handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", finish); handle.removeEventListener("pointercancel", finish);
      const width = Math.round(rail.getBoundingClientRect().width);
      localStorage.setItem(side === "left" ? "blank_left_panel_width" : "blank_right_panel_width", String(width));
    };
    handle.addEventListener("pointermove", move); handle.addEventListener("pointerup", finish); handle.addEventListener("pointercancel", finish);
  });
}

enablePanelResize(document.querySelector("#leftPanelResizer"), "left");
enablePanelResize(document.querySelector("#rightPanelResizer"), "right");

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
      attendance_stage: document.querySelector("#contactStage").value,
      priority: document.querySelector("#contactPriority").value,
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


