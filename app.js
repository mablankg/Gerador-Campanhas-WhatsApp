const accessCard = document.querySelector("#accessCard");
const composer = document.querySelector("#contactsCard");
const groupsCard = document.querySelector("#groupsCard");
const contactsCard = document.querySelector("#contactsCard");
const accessForm = document.querySelector("#accessForm");
const sendForm = document.querySelector("#sendForm");
const message = document.querySelector("#message");
const messageAttachment = document.querySelector("#messageAttachment");
const emojiButton = document.querySelector("#emojiButton");
const emojiPanel = document.querySelector("#emojiPanel");
const attachmentPreview = document.querySelector("#attachmentPreview");
const counter = document.querySelector("#counter");
const result = document.querySelector("#result");
const connection = document.querySelector("#connection");
const sendButton = document.querySelector("#sendButton");
const groupResult = document.querySelector("#groupResult");
const groupSelect = document.querySelector("#groupSelect");
const accessTokenInput = document.querySelector("#accessToken");
const togglePassword = document.querySelector("#togglePassword");
const changePassword = document.querySelector("#changePassword");
const logoutButton = document.querySelector("#logoutButton");
const resetDirectoryButton = document.querySelector("#resetDirectory");
const contactList = document.querySelector("#contactList");
const contactForm = document.querySelector("#contactForm");
const contactEmpty = document.querySelector("#contactEmpty");
const contactResult = document.querySelector("#contactResult");
const kanbanBoard = document.querySelector("#kanbanBoard");
const viewSwitch = document.querySelector("#viewSwitch");
const conversationPane = document.querySelector(".conversation-pane");
let accessToken = localStorage.getItem("campaign_access") || "";
let userRole = localStorage.getItem("blank_user_role") || "master";
let activeAccountID = localStorage.getItem("blank_whatsapp_account") || "primary";
let whatsappAccounts = [];
let qrPollTimer = null;
let allContacts = [];
let activeContact = null;
let allGroups = [];
let allLawyers = [];
let activeGroup = null;
let liveRefreshTimer = null;
let liveRefreshBusy = false;
let liveRefreshCycle = 0;
let mediaObjectURLs = [];
let renderedConversationKey = "";
let renderedConversationSignature = "";
let messageEventCursor = "latest";
document.body.classList.add("auth-locked");
const unreadContacts = new Set();
const unreadGroups = new Set();
conversationPane.append(kanbanBoard, document.querySelector("#lawyerBoard"));
const savedLeftPanelWidth = Number(localStorage.getItem("blank_left_panel_width"));
const savedRightPanelWidth = Number(localStorage.getItem("blank_right_panel_width"));
if (savedLeftPanelWidth >= 230 && savedLeftPanelWidth <= 520) contactsCard.style.setProperty("--left-rail-width", `${savedLeftPanelWidth}px`);
if (savedRightPanelWidth >= 280 && savedRightPanelWidth <= 600) contactsCard.style.setProperty("--right-rail-width", `${savedRightPanelWidth}px`);
accessTokenInput.value = accessToken;
function applyRoleVisibility() { if (resetDirectoryButton) resetDirectoryButton.classList.toggle("hidden", !["master", "admin"].includes(userRole)); }
applyRoleVisibility();
function logout(){ localStorage.removeItem("campaign_access"); localStorage.removeItem("blank_user_role"); accessToken=""; userRole="user"; document.body.classList.add("auth-locked"); accessCard.classList.remove("hidden"); contactsCard.classList.add("hidden"); groupsCard.classList.add("hidden"); document.querySelector("#kanbanBoard")?.classList.add("hidden"); document.querySelector("#lawyerBoard")?.classList.add("hidden"); logoutButton?.classList.add("hidden"); accessTokenInput.value=""; }
logoutButton?.addEventListener("click", logout);

togglePassword.addEventListener("click", () => {
  const showing = accessTokenInput.type === "text";
  accessTokenInput.type = showing ? "password" : "text";
  togglePassword.setAttribute("aria-pressed", String(!showing));
  togglePassword.setAttribute("aria-label", showing ? "Mostrar senha" : "Ocultar senha");
  togglePassword.title = showing ? "Mostrar senha" : "Ocultar senha";
});

changePassword.addEventListener("click", () => showResult("A troca de senha será habilitada no cadastro de usuários."));

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
    headers: { "Content-Type": "application/json", "x-app-token": accessToken, "x-whatsapp-account": activeAccountID, ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({ error: "invalid_response" }));
  if (!response.ok) throw Object.assign(new Error(body.error || "request_failed"), { status: response.status });
  return body;
}

function clearMediaObjectURLs() {
  for (const url of mediaObjectURLs) URL.revokeObjectURL(url);
  mediaObjectURLs = [];
}
async function readAttachment(file) { if(!file)return null; if(file.size>50*1024*1024)throw new Error(`arquivo_excede_50mb:${file.name}`); const bytes=new Uint8Array(await file.arrayBuffer()); let binary=""; for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000)); const type=file.type.startsWith("image/")?"image":file.type.startsWith("audio/")?"audio":file.type.startsWith("video/")?"video":"document"; return {type,mime_type:file.type||"application/octet-stream",file_name:file.name,caption:"",data:btoa(binary)}; }
function renderAttachmentPreview(){ if(!attachmentPreview)return; attachmentPreview.replaceChildren(...[...(messageAttachment?.files||[])].map(file=>{const el=document.createElement("span"); const icon=file.type.startsWith("image/")?"🖼️":file.type.startsWith("audio/")?"🎧":file.type.startsWith("video/")?"🎬":"📄"; el.textContent=`${icon} ${file.name} (${(file.size/1048576).toFixed(1)} MB)`; return el;})); }
messageAttachment?.addEventListener("change",renderAttachmentPreview);
emojiButton?.addEventListener("click",()=>emojiPanel?.classList.toggle("hidden"));
emojiPanel?.addEventListener("click",event=>{if(event.target.tagName!=="SPAN")return; message.value+=event.target.textContent; message.dispatchEvent(new Event("input")); message.focus();});

function conversationSignature(messages = []) {
  return messages.map((item) => `${item.seq}:${item.id}:${item.from_me ? 1 : 0}:${item.text || ""}:${item.media?.id || 0}`).join("|");
}

function deduplicateMessages(messages = []) {
  const seen = new Set();
  return messages.filter((item) => {
    const media = item.media || {};
    const key = [item.sender || (item.from_me ? "me" : "unknown"), item.from_me ? 1 : 0, new Date(item.timestamp).toISOString(), item.text || "", media.type || "", media.file_name || "", media.file_size || 0, media.caption || ""].join("|");
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
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

async function loadAccounts() {
  const data = await call("/api/status?accounts=1");
  whatsappAccounts = data.accounts || [];
	document.querySelector("#accountCount").textContent=String(whatsappAccounts.length);
  if (!whatsappAccounts.some((item) => item.id === activeAccountID)) activeAccountID = whatsappAccounts[0]?.id || "primary";
  const select = document.querySelector("#accountSelect");
  select.replaceChildren(...whatsappAccounts.map((item) => new Option(`${item.name}${item.phone ? ` · ${formatPhone(item.phone)}` : ""}`, item.id)));
  select.value = activeAccountID;
  renderAccountList();
}

function renderAccountList() {
  const list = document.querySelector("#accountList");
  list.replaceChildren();
  for (const account of whatsappAccounts) {
    const row = document.createElement("div"); row.className = "account-row";
    const info = document.createElement("div");
    const title = document.createElement("strong"); title.textContent = account.name;
    const detail = document.createElement("small"); detail.textContent = account.phone ? formatPhone(account.phone) : "Número ainda não vinculado";
    info.append(title, detail);
    const state = document.createElement("span"); state.className = `account-state ${account.status === "connected" ? "online" : ""}`; state.textContent = account.status === "connected" ? "Conectado" : account.status === "qr" ? "Aguardando QR" : "Desconectado";
    const action = document.createElement("button"); action.type = "button"; action.className = "secondary";
    action.textContent = account.status === "connected" ? "Desconectar" : "Conectar";
    action.addEventListener("click", () => account.status === "connected" ? disconnectAccount(account) : connectAccount(account));
    const rename = document.createElement("button"); rename.type = "button"; rename.className = "secondary"; rename.textContent = "Renomear";
    rename.addEventListener("click", () => renameAccount(account));
    const remove = document.createElement("button"); remove.type="button"; remove.className="secondary"; remove.textContent="Excluir conexão";
    remove.addEventListener("click", async () => {
      if (!window.confirm(`Excluir a conexão “${account.name}” e todos os dados vinculados? Contatos, grupos, mensagens, anexos e comentários serão apagados permanentemente. Esta ação não pode ser desfeita.`)) return;
      remove.disabled=true;
      try {
        const queued=await call("/api/status",{method:"POST",body:JSON.stringify({action:"delete",account:account.id,confirm:true})});
        await poll(queued.id, account.id);
        await loadAccounts();
        await switchAccount(activeAccountID);
        showAccountResult("Conexão e dados vinculados excluídos.");
      } catch(error) { showAccountResult(`Não foi possível excluir: ${error.message}`,true); }
      finally { remove.disabled=false; }
    });
    row.append(info, state, rename, action, remove); list.append(row);
  }
}

async function renameAccount(account) {
  const name = window.prompt("Novo nome para esta conexão:", account.name);
  if (name === null || !name.trim() || name.trim() === account.name) return;
  try { await call("/api/status", { method: "POST", body: JSON.stringify({ action: "rename", account: account.id, name: name.trim() }) }); await loadAccounts(); showAccountResult("Nome da conexão atualizado."); }
  catch (error) { showAccountResult(`Não foi possível renomear: ${error.message}`, true); }
}

async function connectAccount(account) {
  showAccountResult("Preparando a conexão...");
  await call("/api/status", { method: "POST", headers: { "x-whatsapp-account": account.id }, body: JSON.stringify({ action: "connect", account: account.id }) });
  document.querySelector("#qrPanel").classList.remove("hidden");
  clearInterval(qrPollTimer);
  const refresh = async () => {
    try {
      const accounts = await call("/api/status?accounts=1", { headers: { "x-whatsapp-account": account.id } });
      whatsappAccounts = accounts.accounts || [];
      const current = whatsappAccounts.find((item) => item.id === account.id);
      renderAccountList();
      if (current?.status === "connected") {
        clearInterval(qrPollTimer); document.querySelector("#qrPanel").classList.add("hidden"); showAccountResult(`${current.name} conectado com sucesso.`); await loadAccounts(); return;
      }
      const qr = await call("/api/status?qr=1", { headers: { "x-whatsapp-account": account.id } });
      document.querySelector("#accountQR").src = qr.image;
      showAccountResult("Leia o QR Code com o número que deseja adicionar.");
    } catch (error) { if (error.status !== 409) showAccountResult(`Conexão: ${error.message}`, true); }
  };
  await refresh(); qrPollTimer = setInterval(refresh, 2500);
}

async function disconnectAccount(account) {
  await call("/api/status", { method: "POST", headers: { "x-whatsapp-account": account.id }, body: JSON.stringify({ action: "disconnect", account: account.id }) });
  showAccountResult(`${account.name} será desconectado.`); setTimeout(loadAccounts, 1200);
}

function showAccountResult(text, error = false) {
  const box = document.querySelector("#accountResult"); box.textContent = text; box.classList.remove("hidden", "error"); if (error) box.classList.add("error");
}

async function switchAccount(id) {
  activeAccountID = id; localStorage.setItem("blank_whatsapp_account", id);
  activeContact = null; activeGroup = null; allContacts = []; allGroups = []; unreadContacts.clear(); unreadGroups.clear(); messageEventCursor = "latest"; renderedConversationKey = "";
  document.querySelector("#messageThread").innerHTML = '<div class="empty-conversation">Selecione um contato para visualizar as mensagens.</div>';
  await status(); await Promise.all([loadGroups(), loadContacts()]);
}

async function unlock() {
  if (!accessToken || !(await status())) return;
  document.body.classList.remove("auth-locked");
  accessCard.classList.add("hidden");
  composer.classList.remove("hidden");
  contactsCard.classList.remove("hidden");
	logoutButton?.classList.remove("hidden");
  viewSwitch.classList.remove("hidden");
  document.querySelector("#accountSwitch").classList.remove("hidden");
  await loadAccounts();
	await loadLawyers();
  await Promise.all([loadGroups(), loadStages(), loadContacts()]);
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
      if (liveRefreshCycle % 3 === 0) await loadContacts((kanbanBoard.classList.contains("hidden") ? document.querySelector("#contactSearch") : document.querySelector("#kanbanSearch")).value.trim(), true);
      if (liveRefreshCycle % 6 === 0) await status();
    } finally {
      liveRefreshBusy = false;
    }
  }, 3000);
}

async function poll(id, accountID = activeAccountID) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const command = await call(`/api/command?id=${encodeURIComponent(id)}`, {headers:{"x-whatsapp-account":accountID}});
    if (command.status === "done") return command.result || {};
    if (["failed", "unknown"].includes(command.status)) throw new Error(command.result?.error || command.status);
  }
  throw new Error("processing_timeout");
}

async function loadGroups() {
  try {
    const data = await call(`/api/groups?account=${encodeURIComponent(activeAccountID)}`);
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
    if (!kanbanBoard.classList.contains("hidden")) renderKanban();
		if (!document.querySelector("#lawyerBoard").classList.contains("hidden")) renderLawyerBoard();
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
    const stage = attendanceStages.find(([key]) => key === (group.attendance_stage || "new")); button.style.setProperty("--stage-color", stage?.[2] || "#3f9cd0");
    if (activeGroup?.id === group.id) button.setAttribute("aria-current", "true");
    const name = document.createElement("strong"); name.textContent = group.name;
    const detail = document.createElement("small"); detail.className = "contact-summary"; detail.textContent = `${group.participant_count} participantes${group.is_announce ? " · somente administradores" : ""}`;
    const workflow=document.createElement("small"); workflow.className=`contact-workflow priority-${group.priority||"normal"}`; workflow.style.borderLeftColor=stage?.[2]||"#3f9cd0"; workflow.textContent=`${stage?.[1]||"Novo"} · ${priorityLabels[group.priority||"normal"]}`;
		button.append(name, detail, workflow); if(group.lawyer_name)button.append(createLawyerTag(group)); button.addEventListener("click", () => openGroup(group));
		const wrapper=document.createElement("div");wrapper.className="selectable-card";const check=document.createElement("input");check.type="checkbox";check.checked=true;check.title="Desmarcar para arquivar";check.addEventListener("change",()=>archiveGroup(group));wrapper.append(check,button);list.append(wrapper);
  }
}

async function loadGroupMessages(group, silent = false) {
  const thread = document.querySelector("#messageThread"); if (!silent) thread.innerHTML = '<div class="empty-conversation">Carregando mensagens...</div>';
  try {
    const data = await call(`/api/group-messages?id=${encodeURIComponent(group.id)}`); const messages = deduplicateMessages(data.messages || []);
    if (shouldKeepRenderedConversation(`group:${group.id}`, messages, silent)) return;
    clearMediaObjectURLs(); thread.replaceChildren();
    if (!messages.length) { thread.innerHTML = '<div class="empty-conversation">Nenhuma mensagem armazenada para este grupo.</div>'; return; }
    for (const item of messages) await renderMessageBubble(thread, item);
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
  document.querySelector("#groupStage").value=group.attendance_stage||"new"; document.querySelector("#groupPriority").value=group.priority||"normal";
	document.querySelector("#groupLawyer").value=String(group.lawyer_id||0);
  document.querySelector("#groupUpdatedAt").textContent=`Atualizado em ${new Date(group.updated_at).toLocaleString("pt-BR")}`;
  document.querySelector("#to").value=group.id; message.disabled=false; messageAttachment.disabled=false; emojiButton.disabled=false; sendButton.disabled=false;
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

let attendanceStages = [
  ["new", "Novos", "#3f9cd0"], ["in_progress", "Em atendimento", "#8b6fd6"], ["waiting_client", "Aguardando cliente", "#e2a51b"],
  ["waiting_action", "Aguardando providência", "#e47b21"], ["finished", "Finalizados", "#5d9b75"],
];
const priorityLabels = { urgent: "Urgente", high: "Alta", normal: "Normal", low: "Baixa" };
const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };

function createLawyerTag(entity) { const tag=document.createElement("span");tag.className="lawyer-tag";tag.style.setProperty("--lawyer-color",entity.lawyer_color||"#718078");tag.textContent=entity.lawyer_name;return tag; }

async function archiveContactCard(contact) { try { await call(`/api/contacts?id=${encodeURIComponent(contact.id)}`,{method:"PATCH",body:JSON.stringify({archived:true})}); allContacts=allContacts.filter(item=>String(item.id)!==String(contact.id)); renderContacts(); renderKanban(); renderLawyerBoard(); } catch(error){showContactResult(`Não foi possível arquivar: ${error.message}`,true);} }
async function archiveGroup(group) { try { await call(`/api/groups?id=${encodeURIComponent(group.id)}`,{method:"PATCH",body:JSON.stringify({attendance_stage:group.attendance_stage||"new",priority:group.priority||"normal",lawyer_id:group.lawyer_id||0,archived:true})}); allGroups=allGroups.filter(item=>item.id!==group.id); renderGroups(); renderKanban(); renderLawyerBoard(); } catch(error){showContactResult(`Não foi possível arquivar: ${error.message}`,true);} }

function renderKanban() {
  const container = document.querySelector("#kanbanColumns");
  const query = document.querySelector("#kanbanSearch").value.trim().toLocaleLowerCase("pt-BR");
  const entityFilter = document.querySelector("#kanbanEntityFilter").value;
  const typeFilter = document.querySelector("#kanbanTypeFilter").value;
  const statusFilter = document.querySelector("#kanbanStatusFilter").value;
  container.replaceChildren();
  for (const [stage, label, color] of attendanceStages) {
    const column = document.createElement("section"); column.className = "kanban-column"; column.dataset.stage = stage;
    column.style.setProperty("--stage-color", color);
    const contacts = entityFilter === "group" ? [] : allContacts.filter((item) => (item.attendance_stage || "new") === stage)
      .filter((item) => !query || contactDisplayName(item).toLocaleLowerCase("pt-BR").includes(query) || String(item.phone).includes(query))
      .filter((item) => (!typeFilter || item.contact_type === typeFilter) && (!statusFilter || item.status === statusFilter))
      .map((item) => ({ ...item, entity_kind: "contact" }));
    const groups = entityFilter === "contact" || typeFilter || statusFilter ? [] : allGroups.filter((item) => (item.attendance_stage || "new") === stage)
      .filter((item) => !query || item.name.toLocaleLowerCase("pt-BR").includes(query))
      .map((item) => ({ ...item, entity_kind: "group" }));
    const entities = [...contacts, ...groups].sort((a, b) => (priorityOrder[a.priority || "normal"] - priorityOrder[b.priority || "normal"]) || (a.name || "").localeCompare(b.name || "", "pt-BR"));
    const heading = document.createElement("div"); heading.className = "kanban-column-heading";
    const title = document.createElement("strong"); title.textContent = label;
    const count = document.createElement("span"); count.textContent = entities.length; heading.append(title, count); column.append(heading);
    const cards = document.createElement("div"); cards.className = "kanban-card-list";
    for (const entity of entities) {
      const entityID = entity.entity_kind === "group" ? entity.id : String(entity.id);
      const unread = entity.entity_kind === "group" ? unreadGroups.has(entity.id) : unreadContacts.has(String(entity.id));
      const card = document.createElement("article"); card.className = `kanban-card priority-${entity.priority || "normal"}${unread ? " incoming" : ""}`; card.draggable = true; card.dataset.id = entityID; card.dataset.kind = entity.entity_kind;
      card.style.setProperty("--stage-color", color);
			const archiveCheck=document.createElement("input");archiveCheck.type="checkbox";archiveCheck.checked=true;archiveCheck.className="card-archive-check";archiveCheck.title="Desmarcar para arquivar";archiveCheck.addEventListener("click",event=>event.stopPropagation());archiveCheck.addEventListener("change",()=>entity.entity_kind==="group"?archiveGroup(entity):archiveContactCard(entity));
      const priority = document.createElement("span"); priority.className = "kanban-priority"; priority.textContent = `${entity.entity_kind === "group" ? "Grupo · " : ""}${priorityLabels[entity.priority || "normal"]}`;
      const name = document.createElement("strong"); name.textContent = entity.entity_kind === "group" ? entity.name : contactDisplayName(entity);
      const phone = document.createElement("small"); phone.textContent = entity.entity_kind === "group" ? `${entity.participant_count} participantes` : formatPhone(entity.phone);
      const meta = document.createElement("div"); meta.className = "kanban-meta"; meta.textContent = entity.entity_kind === "group" ? (entity.is_announce ? "Somente administradores" : "Todos podem enviar") : (entity.responsible || entity.contact_type || "Lead");
			card.append(archiveCheck,priority, name, phone, meta); if(entity.lawyer_name)card.append(createLawyerTag(entity));
      card.addEventListener("dragstart", (event) => { event.dataTransfer.setData("application/x-blank-entity", JSON.stringify({ id: entityID, kind: entity.entity_kind })); card.classList.add("dragging"); });
      card.addEventListener("dragend", () => card.classList.remove("dragging"));
      card.addEventListener("click", () => { if (entity.entity_kind === "group") openGroup(allGroups.find((item) => item.id === entity.id) || entity); else openContact(allContacts.find((item) => String(item.id) === String(entity.id)) || entity); showConversationView(); });
      cards.append(card);
    }
    column.append(cards);
    column.addEventListener("dragover", (event) => { event.preventDefault(); column.classList.add("drag-over"); });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (event) => {
      event.preventDefault(); column.classList.remove("drag-over"); let payload; try { payload=JSON.parse(event.dataTransfer.getData("application/x-blank-entity")); } catch { return; }
      const entity = payload.kind === "group" ? allGroups.find((item) => item.id === payload.id) : allContacts.find((item) => String(item.id) === String(payload.id));
      if (!entity || entity.attendance_stage === stage) return;
      const previousStage = entity.attendance_stage || "new"; entity.attendance_stage = stage; renderKanban();
      try {
        const path = payload.kind === "group" ? `/api/groups?id=${encodeURIComponent(payload.id)}` : `/api/contacts?id=${encodeURIComponent(payload.id)}`;
				const updated = await call(path, { method: "PATCH", body: JSON.stringify({ attendance_stage: stage, ...(payload.kind === "group" ? { priority: entity.priority || "normal", lawyer_id: entity.lawyer_id || 0, archived: false } : {}) }) }); Object.assign(entity, updated);
      } catch (error) { entity.attendance_stage = previousStage; showContactResult(`Não foi possível mover: ${error.message}`, true); }
      renderKanban(); renderContacts();
    });
    container.append(column);
  }
}

async function loadLawyers() {
	const data=await call("/api/contacts?resource=lawyers"); allLawyers=data.lawyers||[];
	for(const id of ["contactLawyer","groupLawyer"]){const select=document.querySelector(`#${id}`);const current=select.value;select.replaceChildren(new Option("Sem advogado","0"),...allLawyers.map(item=>new Option(item.name,String(item.id))));select.value=current||"0";}
	renderLawyerEditor(); if(!document.querySelector("#lawyerBoard").classList.contains("hidden"))renderLawyerBoard();
}

function renderLawyerBoard(){
	const container=document.querySelector("#lawyerColumns");container.replaceChildren();
	const query=document.querySelector("#lawyerSearch").value.trim().toLocaleLowerCase("pt-BR");const entityFilter=document.querySelector("#lawyerEntityFilter").value;const typeFilter=document.querySelector("#lawyerTypeFilter").value;const statusFilter=document.querySelector("#lawyerStatusFilter").value;
	const columns=[{id:0,name:"Sem advogado",color:"#8a9890"},...allLawyers];
	for(const lawyer of columns){
		const column=document.createElement("section");column.className="lawyer-column";column.style.setProperty("--lawyer-color",lawyer.color);
		const contacts=entityFilter==="group"?[]:allContacts.filter(item=>Number(item.lawyer_id||0)===Number(lawyer.id)).filter(item=>!query||contactDisplayName(item).toLocaleLowerCase("pt-BR").includes(query)||String(item.phone).includes(query)).filter(item=>(!typeFilter||item.contact_type===typeFilter)&&(!statusFilter||item.status===statusFilter)).map(item=>({...item,entity_kind:"contact"}));
		const groups=entityFilter==="contact"||typeFilter||statusFilter?[]:allGroups.filter(item=>Number(item.lawyer_id||0)===Number(lawyer.id)).filter(item=>!query||item.name.toLocaleLowerCase("pt-BR").includes(query)).map(item=>({...item,entity_kind:"group"}));const entities=[...contacts,...groups];
		const heading=document.createElement("div");heading.className="lawyer-column-heading";heading.innerHTML=`<strong>${lawyer.name}</strong><span>${entities.length}</span>`;column.append(heading);
		const cards=document.createElement("div");cards.className="lawyer-card-list";
		for(const entity of entities){const card=document.createElement("article");card.className="lawyer-card";card.draggable=true;card.dataset.kind=entity.entity_kind;card.dataset.id=entity.entity_kind==="group"?entity.id:String(entity.id);
			const check=document.createElement("input");check.type="checkbox";check.checked=true;check.title="Desmarcar para arquivar";check.addEventListener("change",()=>entity.entity_kind==="group"?archiveGroup(entity):archiveContactCard(entity));
			const body=document.createElement("div");const name=document.createElement("strong");name.textContent=entity.entity_kind==="group"?entity.name:contactDisplayName(entity);const meta=document.createElement("small");meta.textContent=entity.entity_kind==="group"?`Grupo · ${entity.participant_count} participantes`:formatPhone(entity.phone);body.append(name,meta);card.append(check,body);
			card.addEventListener("dragstart",event=>event.dataTransfer.setData("application/x-blank-lawyer",JSON.stringify({kind:card.dataset.kind,id:card.dataset.id})));card.addEventListener("click",event=>{if(event.target===check)return;entity.entity_kind==="group"?openGroup(entity):openContact(entity);showConversationView();});cards.append(card);}
		column.append(cards);column.addEventListener("dragover",event=>{event.preventDefault();column.classList.add("drag-over")});column.addEventListener("dragleave",()=>column.classList.remove("drag-over"));column.addEventListener("drop",async event=>{event.preventDefault();column.classList.remove("drag-over");let data;try{data=JSON.parse(event.dataTransfer.getData("application/x-blank-lawyer")||event.dataTransfer.getData("application/x-blank-entity"))}catch{return}const entity=data.kind==="group"?allGroups.find(x=>x.id===data.id):allContacts.find(x=>String(x.id)===String(data.id));if(!entity)return;const previous=entity.lawyer_id||0;entity.lawyer_id=Number(lawyer.id);entity.lawyer_name=lawyer.id?lawyer.name:"";entity.lawyer_color=lawyer.id?lawyer.color:"";renderLawyerBoard();try{const path=data.kind==="group"?`/api/groups?id=${encodeURIComponent(data.id)}`:`/api/contacts?id=${encodeURIComponent(data.id)}`;const payload=data.kind==="group"?{attendance_stage:entity.attendance_stage||"new",priority:entity.priority||"normal",lawyer_id:Number(lawyer.id),archived:false}:{lawyer_id:Number(lawyer.id)};Object.assign(entity,await call(path,{method:"PATCH",body:JSON.stringify(payload)}));renderContacts();renderGroups();}catch(error){entity.lawyer_id=previous;showContactResult(`Não foi possível vincular: ${error.message}`,true);renderLawyerBoard();}});container.append(column);
	}
}

function showLawyerView(){contactsCard.classList.remove("hidden");contactsCard.style.display="grid";contactsCard.setAttribute("aria-hidden","false");kanbanBoard.classList.add("hidden");const board=document.querySelector("#lawyerBoard");board.classList.remove("hidden");board.setAttribute("aria-hidden","false");conversationPane.classList.add("board-mode");document.querySelector("#conversationViewButton").classList.remove("active");document.querySelector("#boardViewButton").classList.remove("active");document.querySelector("#lawyerViewButton").classList.add("active");renderLawyerBoard();}

function renderLawyerEditor(){const list=document.querySelector("#lawyerEditorList");list.replaceChildren();for(const lawyer of allLawyers){const item=document.createElement("button");item.type="button";item.className="stage-editor-item";const swatch=document.createElement("span");swatch.style.background=lawyer.color;const label=document.createElement("strong");label.textContent=lawyer.name;const edit=document.createElement("small");edit.textContent="Editar";item.append(swatch,label,edit);item.addEventListener("click",()=>{document.querySelector("#lawyerEditId").value=lawyer.id;document.querySelector("#lawyerName").value=lawyer.name;document.querySelector("#lawyerColor").value=lawyer.color});list.append(item)}}
function resetLawyerForm(){document.querySelector("#lawyerEditId").value="";document.querySelector("#lawyerName").value="";document.querySelector("#lawyerColor").value="#177447";}

async function loadStages() {
  const data = await call("/api/contacts?resource=stages");
  attendanceStages = (data.stages || []).map((item) => [item.id, item.name, item.color]);
  const select = document.querySelector("#contactStage"); const current = select.value;
  select.replaceChildren(new Option("Sem etapa", ""), ...attendanceStages.map(([id, name]) => new Option(name, id)));
  if (!current || attendanceStages.some(([id]) => id === current)) select.value = current;
  const stageFilter=document.querySelector("#contactStageFilter"); const filterCurrent=stageFilter.value;
  stageFilter.replaceChildren(new Option("Todas as etapas","all"),new Option("Sem etapa","none"),...attendanceStages.map(([id,name])=>new Option(name,id))); stageFilter.value=filterCurrent||"all";
  const groupStage = document.querySelector("#groupStage"); const groupCurrent=groupStage.value;
  groupStage.replaceChildren(...attendanceStages.map(([id,name])=>new Option(name,id))); if(attendanceStages.some(([id])=>id===groupCurrent))groupStage.value=groupCurrent;
  renderStageEditor();
}

function renderStageEditor() {
  const list = document.querySelector("#stageEditorList"); list.replaceChildren();
  for (const [id, name, color] of attendanceStages) {
    const item = document.createElement("button"); item.type = "button"; item.className = "stage-editor-item";
    const swatch = document.createElement("span"); swatch.style.background = color;
    const label = document.createElement("strong"); label.textContent = name;
    const edit = document.createElement("small"); edit.textContent = "Editar"; item.append(swatch, label, edit);
    item.addEventListener("click", () => { document.querySelector("#stageEditId").value=id; document.querySelector("#stageName").value=name; document.querySelector("#stageColor").value=color; });
    list.append(item);
  }
}

function resetStageForm() { document.querySelector("#stageEditId").value=""; document.querySelector("#stageName").value=""; document.querySelector("#stageColor").value="#3f9cd0"; }

function showConversationView() {
  kanbanBoard.classList.add("hidden"); kanbanBoard.setAttribute("aria-hidden", "true");
  document.querySelector("#lawyerBoard").classList.add("hidden"); document.querySelector("#lawyerBoard").setAttribute("aria-hidden", "true"); conversationPane.classList.remove("board-mode");
  contactsCard.classList.remove("hidden"); contactsCard.style.display = "grid"; contactsCard.setAttribute("aria-hidden", "false");
  document.querySelector("#conversationViewButton").classList.add("active"); document.querySelector("#boardViewButton").classList.remove("active");
	document.querySelector("#lawyerBoard").classList.add("hidden"); document.querySelector("#lawyerViewButton").classList.remove("active");
}

function showBoardView() {
  contactsCard.classList.remove("hidden"); contactsCard.style.display = "grid"; contactsCard.setAttribute("aria-hidden", "false"); document.querySelector("#lawyerBoard").classList.add("hidden"); document.querySelector("#lawyerBoard").setAttribute("aria-hidden", "true"); conversationPane.classList.add("board-mode"); kanbanBoard.classList.remove("hidden"); kanbanBoard.setAttribute("aria-hidden", "false"); renderKanban();
  document.querySelector("#boardViewButton").classList.add("active"); document.querySelector("#conversationViewButton").classList.remove("active");
	document.querySelector("#lawyerBoard").classList.add("hidden"); document.querySelector("#lawyerViewButton").classList.remove("active");
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
    const data = await call(`/api/contact-messages?id=${encodeURIComponent(contact.id)}`); const messages = deduplicateMessages(data.messages || []);
    if (shouldKeepRenderedConversation(`contact:${contact.id}`, messages, silent)) return;
    clearMediaObjectURLs(); thread.replaceChildren();
    if (!messages.length) {
      thread.innerHTML = '<div class="empty-conversation">Nenhuma mensagem armazenada para este contato.</div>';
      return;
    }
    for (const item of messages) await renderMessageBubble(thread, item);
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
	document.querySelector("#contactStage").value = contact ? (contact.attendance_stage || "") : "new";
	document.querySelector("#contactPriority").value = contact?.priority || "normal";
	document.querySelector("#contactLawyer").value=String(contact?.lawyer_id||0);
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
	messageAttachment.disabled = !contact;
	emojiButton.disabled = !contact;
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
	const stageFilter = document.querySelector("#contactStageFilter").value;
	const contacts = allContacts
	  .filter((contact) => (!type || contact.contact_type === type) && (!status || contact.status === status))
	  .filter((contact) => stageFilter === "all" || (stageFilter === "none" ? !contact.attendance_stage : contact.attendance_stage === stageFilter))
	  .sort((left, right) => contactDisplayName(left).localeCompare(contactDisplayName(right), "pt-BR", { sensitivity: "base", numeric: true }));
	contactList.replaceChildren();
	if (!contacts.length) { contactList.innerHTML = '<p class="muted">Nenhum contato encontrado.</p>'; return; }
	for (const contact of contacts) {
		const button = document.createElement("button"); button.type = "button"; button.className = `contact-item${String(activeContact?.id||"")===String(contact.id)?" active":""}${unreadContacts.has(String(contact.id))?" incoming":""}`; button.dataset.id = contact.id;
		const stage = attendanceStages.find(([key]) => key === (contact.attendance_stage || "new"));
		button.style.setProperty("--stage-color", stage?.[2] || "#9aa8a0");
		if (String(activeContact?.id || "") === String(contact.id)) button.setAttribute("aria-current", "true");
		const name = document.createElement("strong"); name.textContent = contactDisplayName(contact);
		const detail = document.createElement("small"); detail.className = "contact-summary"; detail.textContent = `${formatPhone(contact.phone)} · ${contact.contact_type || "lead"} · ${contact.status || "active"}`;
		button.append(name, detail); if(contact.lawyer_name)button.append(createLawyerTag(contact));
		const workflow = document.createElement("small"); workflow.className = `contact-workflow priority-${contact.priority || "normal"}`; workflow.style.borderLeftColor = stage?.[2] || "#9aa8a0"; workflow.textContent = `${stage?.[1] || "Sem etapa"} · ${priorityLabels[contact.priority || "normal"]}`; button.append(workflow);
		const extraEntries = Object.entries(contact.extra || {}).slice(0, 2);
		if (extraEntries.length) { const extra = document.createElement("small"); extra.className = "contact-extra-preview"; extra.textContent = extraEntries.map(([key, value]) => `${key}: ${value}`).join(" · "); button.append(extra); }
		button.addEventListener("click", () => openContact(contact)); const wrapper=document.createElement("div");wrapper.className="selectable-card";const check=document.createElement("input");check.type="checkbox";check.checked=true;check.title="Desmarcar para arquivar";check.addEventListener("change",()=>archiveContactCard(contact));wrapper.append(check,button);contactList.append(wrapper);
	}
}

async function loadContacts(query = "", silent = false) {
  try {
    const params = new URLSearchParams({ account: activeAccountID });
    if (query) params.set("q", query);
    const data = await call(`/api/contacts?${params.toString()}`);
		allContacts = data.contacts || [];
		if (activeContact) activeContact = allContacts.find((item) => String(item.id) === String(activeContact.id)) || activeContact;
		renderContacts();
		if (!kanbanBoard.classList.contains("hidden")) renderKanban();
		if (!document.querySelector("#lawyerBoard").classList.contains("hidden")) renderLawyerBoard();
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
	await loadLawyers(); await Promise.all([loadGroups(), loadContacts()]);
	startLiveRefresh();
});

let contactSearchTimer;
document.querySelector("#contactSearch").addEventListener("input", (event) => {
  clearTimeout(contactSearchTimer);
  contactSearchTimer = setTimeout(() => loadContacts(event.target.value.trim()), 250);
});
document.querySelector("#contactTypeFilter").addEventListener("change", renderContacts);
document.querySelector("#contactStatusFilter").addEventListener("change", renderContacts);
document.querySelector("#contactStageFilter").addEventListener("change", renderContacts);
let kanbanSearchTimer;
document.querySelector("#kanbanSearch").addEventListener("input", (event) => {
  clearTimeout(kanbanSearchTimer);
  kanbanSearchTimer = setTimeout(async () => { await loadContacts(event.target.value.trim(), true); renderKanban(); }, 250);
});
document.querySelector("#kanbanTypeFilter").addEventListener("change", renderKanban);
document.querySelector("#kanbanStatusFilter").addEventListener("change", renderKanban);
document.querySelector("#kanbanEntityFilter").addEventListener("change", renderKanban);
document.querySelector("#lawyerSearch").addEventListener("input",renderLawyerBoard);
document.querySelector("#lawyerEntityFilter").addEventListener("change",renderLawyerBoard);
document.querySelector("#lawyerTypeFilter").addEventListener("change",renderLawyerBoard);
document.querySelector("#lawyerStatusFilter").addEventListener("change",renderLawyerBoard);
document.querySelector("#saveGroupClassification").addEventListener("click", async () => {
  if(!activeGroup)return; const stage=document.querySelector("#groupStage").value; const priority=document.querySelector("#groupPriority").value;
	const lawyer_id=Number(document.querySelector("#groupLawyer").value||0); try { const updated=await call(`/api/groups?id=${encodeURIComponent(activeGroup.id)}`,{method:"PATCH",body:JSON.stringify({attendance_stage:stage,priority,lawyer_id,archived:false})}); Object.assign(activeGroup,updated,allLawyers.find(item=>Number(item.id)===lawyer_id)?{lawyer_name:allLawyers.find(item=>Number(item.id)===lawyer_id).name,lawyer_color:allLawyers.find(item=>Number(item.id)===lawyer_id).color}:{lawyer_name:"",lawyer_color:""}); const stored=allGroups.find((item)=>item.id===activeGroup.id); if(stored)Object.assign(stored,activeGroup); renderGroups(); renderLawyerBoard(); showContactResult("Classificação do grupo salva."); }
  catch(error){showContactResult(`Não foi possível salvar: ${error.message}`,true);}
});
document.querySelector("#groupSearch").addEventListener("input", renderGroups);

function switchCRMMode(mode){
  const contacts=mode==="contacts"; document.querySelector("#contactsMode").classList.toggle("hidden",!contacts); document.querySelector("#groupsMode").classList.toggle("hidden",contacts);
  document.querySelector("#contactsModeTab").classList.toggle("active",contacts); document.querySelector("#groupsModeTab").classList.toggle("active",!contacts);
  document.querySelector(".rail-heading h2").textContent=contacts?"Contatos":"Grupos";
  const entityValue = contacts ? "contact" : "group";
  document.querySelector("#kanbanEntityFilter").value = entityValue;
  document.querySelector("#lawyerEntityFilter").value = entityValue;
  renderKanban(); renderLawyerBoard();
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
document.querySelector("#lawyerViewButton").addEventListener("click", showLawyerView);
document.querySelector("#manageLawyersButton").addEventListener("click",()=>document.querySelector("#lawyerModal").classList.remove("hidden"));
document.querySelector("#closeLawyerModal").addEventListener("click",()=>document.querySelector("#lawyerModal").classList.add("hidden"));
document.querySelector("#cancelLawyerEdit").addEventListener("click",resetLawyerForm);
document.querySelector("#lawyerForm").addEventListener("submit",async event=>{event.preventDefault();const id=document.querySelector("#lawyerEditId").value;const body={name:document.querySelector("#lawyerName").value.trim(),color:document.querySelector("#lawyerColor").value};const result=document.querySelector("#lawyerResult");try{await call(`/api/contacts?resource=lawyers${id?`&id=${id}`:""}`,{method:id?"PATCH":"POST",body:JSON.stringify(body)});await loadLawyers();resetLawyerForm();result.textContent="Advogado salvo com sucesso.";result.className="result";}catch(error){result.textContent=`Não foi possível salvar: ${error.message}`;result.className="result error";}});
document.querySelector("#manageStagesButton").addEventListener("click", () => document.querySelector("#stageModal").classList.remove("hidden"));
document.querySelector("#closeStageModal").addEventListener("click", () => document.querySelector("#stageModal").classList.add("hidden"));
document.querySelector("#cancelStageEdit").addEventListener("click", resetStageForm);
document.querySelector("#stageForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const id=document.querySelector("#stageEditId").value; const result=document.querySelector("#stageResult");
  try {
    const path=id?`/api/contacts?resource=stages&stage_id=${encodeURIComponent(id)}`:"/api/contacts?resource=stages";
    await call(path,{method:id?"PATCH":"POST",body:JSON.stringify({name:document.querySelector("#stageName").value.trim(),color:document.querySelector("#stageColor").value})});
    await loadStages(); resetStageForm(); renderKanban(); result.textContent="Etapa salva com sucesso."; result.className="result";
  } catch(error) { result.textContent=`Não foi possível salvar a etapa: ${error.message}`; result.className="result error"; }
});

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

document.querySelector("#resetDirectory").addEventListener("click", async () => {
  if (!window.confirm("Isso apagará contatos, grupos e classificações do número selecionado. As mensagens serão mantidas. Continuar?")) return;
  const button=document.querySelector("#resetDirectory"); button.disabled=true; button.textContent="Limpando...";
  try { const queued=await call("/api/status",{method:"POST",body:JSON.stringify({action:"reset_directory"})}); const completed=await poll(queued.id); allContacts=[]; allGroups=[]; await Promise.all([loadContacts(),loadGroups()]); showContactResult(`Base zerada: ${completed.contact_count||0} contatos e ${completed.group_count||0} grupos.`); }
  catch(error){showContactResult(`Não foi possível zerar a base: ${error.message}`,true);}
  finally{button.disabled=false;button.textContent="Zerar base";}
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
		lawyer_id: Number(document.querySelector("#contactLawyer").value || 0),
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
		const files = [...(messageAttachment?.files || [])];
		if (!message.value.trim() && !files.length) throw new Error("escreva_uma_mensagem_ou_selecione_um_arquivo");
		const sendOne = async (text, media) => { const queued = activeGroup ? await call("/api/group-send", { method: "POST", body: JSON.stringify({ group_id: activeGroup.id, text, ...(media ? {media} : {}) }) }) : await call("/api/send", { method: "POST", body: JSON.stringify({ to: document.querySelector("#to").value.replace(/\D/g, ""), text, ...(media ? {media} : {}) }) }); return poll(queued.id); };
		if (message.value.trim()) await sendOne(message.value, null);
		for (const file of files) await sendOne("", await readAttachment(file));
		showResult(`Envio concluído: ${files.length} arquivo(s).`);
	message.value = "";
	messageAttachment.value = "";
		renderAttachmentPreview();
    counter.textContent = "0 / 8000";
	if (activeContact) await loadContactMessages(activeContact);
	if (activeGroup) await loadGroupMessages(activeGroup);
  } catch (error) {
    if (error.status === 401) { localStorage.removeItem("campaign_access"); accessToken = ""; document.body.classList.add("auth-locked"); accessCard.classList.remove("hidden"); composer.classList.add("hidden"); groupsCard.classList.add("hidden"); }
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
    const groupFile = document.querySelector("#groupAttachment")?.files?.[0];
    const media = groupFile ? await readAttachment(groupFile) : null;
    const queued = await call("/api/group-send", { method: "POST", body: JSON.stringify({ group_id: groupSelect.value, text: document.querySelector("#groupMessage").value, ...(media ? { media } : {}) }) });
    const completed = await poll(queued.id);
    showGroupResult(`Mensagem enviada ao grupo. ID: ${completed.message_id || "confirmado"}`);
    document.querySelector("#groupMessage").value = "";
    if (document.querySelector("#groupAttachment")) document.querySelector("#groupAttachment").value = "";
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

document.querySelector("#accountSelect").addEventListener("change", (event) => switchAccount(event.target.value));
document.querySelector("#manageAccounts").addEventListener("click", async () => {
  await loadAccounts(); document.querySelector("#accountDialog").showModal();
});
document.querySelector("#accountDialog").addEventListener("close", () => { clearInterval(qrPollTimer); document.querySelector("#qrPanel").classList.add("hidden"); });
document.querySelector("#addAccount").addEventListener("click", async () => {
  const input = document.querySelector("#newAccountName"); const name = input.value.trim();
  if (name.length < 2) return showAccountResult("Digite um nome para identificar o novo número.", true);
  try {
    const created = await call("/api/status", { method: "POST", body: JSON.stringify({ action: "create", name }) });
    input.value = ""; await loadAccounts();
    const account = whatsappAccounts.find((item) => item.id === created.id) || created;
    await connectAccount(account);
  } catch (error) { showAccountResult(`Não foi possível adicionar: ${error.message}`, true); }
});

unlock();


