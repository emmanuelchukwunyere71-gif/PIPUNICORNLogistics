/* ===============================
   PIPUNICORNLogistics - script.js
   Complete, merged, fixed version
   =============================== */

/* ================= GLOBAL CONSTANTS ================= */
const STORAGE_KEY = "pip_parcels_final";
const CHAT_KEY = "pip_chat_history";
const CEO_CHAT_KEY = "pip_ceo_private";
const CEO_PIN = "1299";
const $ = id => document.getElementById(id);

/* ================= SAFE HELPERS ================= */
const safe = fn => { try { return fn(); } catch(e){ console.warn(e); } };

/* ================== COUNTRY DETECTION (optional) ================= */
document.addEventListener("DOMContentLoaded", () => {
  // if you later add an element with id="countryName" this will populate it
  const el = $("countryName");
  if (!el) return;
  try {
    const locale = navigator.language || "en-US";
    const region = (locale && locale.split("-")[1]) || null;
    el.textContent = region
      ? new Intl.DisplayNames([locale], { type: "region" }).of(region)
      : "Global";
  } catch {
    el.textContent = "Global";
  }
});

/* ================= STORAGE HELPERS ================= */
const loadParcels = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
const saveParcels = (d) => localStorage.setItem(STORAGE_KEY, JSON.stringify(d));

/* ================= INITIAL UI RENDERS ================= */
function updateStats() {
  const list = loadParcels();
  const totalEl = $("totalCount");
  if (totalEl) totalEl.textContent = list.length;
  const inTransitEl = $("inTransitCount");
  if (inTransitEl) inTransitEl.textContent = list.filter(p => p.status === "In Transit").length;
  const deliveredEl = $("deliveredCount");
  if (deliveredEl) deliveredEl.textContent = list.filter(p => p.status === "Delivered").length;
}

/* ================= CEO LOGIN (Alt+O + modal) ================= */
document.addEventListener("DOMContentLoaded", () => {
  // hide hint: keep in DOM but visually hidden via CSS; also ensure not visible if style not applied
  const hint = document.querySelector(".ceo-shortcut-hint");
  if (hint) {
    hint.style.display = "none";
  }
});

/* wire Alt+O to open pinAccess */
window.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
  if (isTyping) return;
  if (e.altKey && (e.key === "o" || e.key === "O")) {
    e.preventDefault();
    const pa = $("pinAccess");
    if (pa) pa.classList.remove("hidden");
    setTimeout(()=> $("pinInput")?.focus(), 60);
  }
}, { passive: true });

/* verify pin */
document.addEventListener("DOMContentLoaded", () => {
  $("verifyPinBtn")?.addEventListener("click", () => {
    if ($("pinInput").value !== CEO_PIN) {
      alert("Wrong PIN");
      return;
    }
    $("pinAccess")?.classList.add("hidden");
    $("ownerDashboard")?.classList.remove("hidden");
    updateStats();
    renderAdminList();
    renderParcelList();
    renderCEOInbox();
  });
});

/* ================= CREATE PARCEL ================= */
document.addEventListener("DOMContentLoaded", () => {
  $("createParcelBtn")?.addEventListener("click", () => {
    const parcels = loadParcels();
    // generate readable PIP- code
    const code = "PIP-" + Math.random().toString(36).slice(2,8).toUpperCase();

    const parcel = {
      id: crypto.randomUUID ? crypto.randomUUID() : ('id-'+Date.now()+'-'+Math.random().toString(36).slice(2,6)),
      code,
      sender: $("senderName")?.value || "Unknown sender",
      recipient: $("recipientName")?.value || "Unknown recipient",
      recipientPhone: $("recipientPhone")?.value || "",
      destination: $("destination")?.value || "",
      description: $("parcelDesc")?.value || "",
      status: "Registered",
      location: "Warehouse",
      createdAt: new Date().toISOString(),
      history: [{ status: "Registered", time: new Date().toLocaleString(), location: "Warehouse" }]
    };

    parcels.unshift(parcel);
    saveParcels(parcels);
    updateStats();
    renderAdminList();
    renderParcelList();
    alert(`Parcel registered\nTracking Code: ${code}`);
  });
});

/* ================= RENDER OWNER PARCEL LIST ================= */
function renderParcelList() {
  const list = loadParcels();
  const box = $("parcelList");
  if (!box) return;

  box.innerHTML = list.map(p => `
    <div class="parcel-card">
      <strong>${p.code}</strong>
      <p>${p.recipient}</p>
      <p>Status: ${p.status}</p>
      <button type="button" onclick="openEdit('${p.id}')">Edit</button>
      <button type="button" onclick="deleteParcel('${p.id}')">Delete</button>
      <button type="button" onclick="downloadPDF('${p.id}')">PDF Receipt</button>
    </div>
  `).join("");
}

/* ================= ADMIN PANEL RENDER ================= */
function renderAdminList() {
  const parcels = loadParcels();
  const box = $("parcelAdminList");
  if (!box) return;

  box.innerHTML = parcels.length ? parcels.map(p => `
    <div class="parcel-card">
      <strong>${p.code}</strong>
      <p>${p.recipient}</p>
      <p>Status: ${p.status}</p>
      <button type="button" onclick="openEdit('${p.id}')">Edit</button>
      <button type="button" onclick="deleteParcel('${p.id}')">Delete</button>
      <button type="button" onclick="downloadPDF('${p.id}')">PDF</button>
    </div>
  `).join("") : "<em>No parcels registered yet</em>";

  updateStats();
}

/* ================= EDIT / DELETE (modal-backed edit) ================= */
let editingParcelId = null;

function openEdit(id) {
  const parcels = loadParcels();
  const p = parcels.find(x => x.id === id);
  if (!p) return alert("Parcel not found");

  editingParcelId = id;
  $("editCode").value = p.code;
  $("editStatus").value = p.status;
  $("editLocation").value = p.location || "";
  $("editNote").value = p.note || "";

  $("editParcelModal").classList.remove("hidden");
}

document.addEventListener("DOMContentLoaded", () => {
  $("editParcelForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const parcels = loadParcels();
    const p = parcels.find(x => x.id === editingParcelId);
    if (!p) return alert("Parcel not found");

    p.status = $("editStatus").value;
    p.location = $("editLocation").value;
    const note = $("editNote").value;
    if (note) p.note = note;

    p.history = p.history || [];
    p.history.push({ status: p.status, time: new Date().toLocaleString(), location: p.location || "" });

    saveParcels(parcels);
    $("editParcelModal").classList.add("hidden");
    renderAdminList();
    renderParcelList();
  });

  $("closeEditModal")?.addEventListener("click", () => {
    $("editParcelModal")?.classList.add("hidden");
  });
});

/* ================= DELETE PARCEL ================= */
function deleteParcel(id) {
  if (!confirm("Delete parcel permanently?")) return;
  saveParcels(loadParcels().filter(p => p.id !== id));
  renderAdminList();
  renderParcelList();
  updateStats();
}

/* ================= TRACKING (SYNC + SHOW RESULT) ================= */
document.addEventListener("DOMContentLoaded", () => {
  const loader = $("trackLoader");
  const result = $("trackingResult");
  const backBtn = $("backToSearch");
  const mainContent = $("mainContent");

  // brand image click -> go home
  const brandLink = document.querySelector(".brand-link");
  if (brandLink) {
    brandLink.addEventListener("click", function (e) {
      e.preventDefault();
      if (mainContent) mainContent.classList.remove("hidden");
      if (result) result.classList.add("hidden");
      const input = $("trackingInput");
      if (input) input.value = "";
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  $("trackBtn")?.addEventListener("click", () => {
    const code = $("trackingInput")?.value.trim();
    if (!code) return alert("Enter tracking code");

    const parcel = loadParcels().find(p => p.code === code);
    if (!parcel) return alert("Parcel not found");

    if (loader) loader.classList.remove("hidden");
    if (result) result.classList.add("hidden");

    setTimeout(() => {
      if (loader) loader.classList.add("hidden");
      if (mainContent) mainContent.classList.add("hidden");
      if (result) result.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: 'smooth' });

      $("trackedCode").textContent = parcel.code;

      $("parcelDetails").innerHTML = `
        <p><strong>Sender:</strong> ${parcel.sender}</p>
        <p><strong>Recipient:</strong> ${parcel.recipient}</p>
        <p><strong>Destination:</strong> ${parcel.destination}</p>
        <p><strong>Status:</strong> ${parcel.status}</p>
        <p><strong>Location:</strong> ${parcel.location || "Unknown"}</p>
        <h4>Shipment History</h4>
        <ul>
          ${((parcel.history||[]).slice().reverse()).map(h =>
            `<li>${h.time} — ${h.status}${h.location ? " ("+h.location+")":""}</li>`
          ).join("")}
        </ul>
      `;

      const exactEl = $("exactLocation");
      if (exactEl) exactEl.textContent = parcel.location || "Unknown";

      const destEl = $("parcelDestination");
      if (destEl) destEl.textContent = parcel.destination || "Unknown";

      // populate meaningful status flow:
      const statusFlow = $("statusFlow");
      if (statusFlow) {
        const statuses = [];
        statusFlow.innerHTML = statuses.map(s => {
          let cls = 'status-item';
          if (s === parcel.status) cls = 'status-item active';
          if (s === 'On Hold') cls = 'status-item on-hold';
          if (s === 'Delivered') cls = 'status-item delivered';
          return `<div class="${cls}">${s}</div>`;
        }).join('');
      }

      // restart animations (reflow)
      const dot = document.querySelector(".tracker-dot");
      if (dot) {
        dot.style.animation = "none";
        void dot.offsetWidth;
        dot.style.animation = null;
      }
      document.querySelectorAll('.v-dot').forEach(d=>{
        d.style.animation = 'none';
        void d.offsetWidth;
        d.style.animation = null;
      });

    }, 3000);
  });

  backBtn?.addEventListener("click", () => {
    if ($("mainContent")) $("mainContent").classList.remove("hidden");
    if ($("trackingResult")) $("trackingResult").classList.add("hidden");
    $("trackingInput").value = "";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

/* ================= CHAT SYSTEM ================= */
document.addEventListener("DOMContentLoaded", () => {
  const chatToggle = $("chatToggle");
  const chatWidget = $("chatWidget");
  const chatInput = $("chatInput");
  const chatBody = $("chatBody");
  const sendBtn = $("sendChat");

  chatToggle?.addEventListener("click", () => {
    chatWidget.style.display = chatWidget.style.display === "flex" ? "none" : "flex";
    loadChatHistory();
  });

  function loadChatHistory(){
    const history = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    chatBody.innerHTML = `
      <div class="bot-msg">Hello 👋 I’m your AI Assistant. Please tell me your full name and how I can assist you today.</div>
    `;
    history.forEach(m => {
      chatBody.innerHTML += `<div class="${m.from === "user" ? "user-msg" : "bot-msg"}">${m.msg}</div>`;
    });
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function autoReply(msg){
    const m = msg.toLowerCase();
    if (m.includes("track")) return "📦 Please enter your tracking code on the homepage.";
    if (m.includes("delivery")) return "🚚 Delivery takes 3–7 working days.";
    if (m.includes("delay")) return "⚠️ Delays may occur due to customs or weather.";
    return "✅ Please provide your full name, your email address and tracking code.";
  }

  function sendMessage(){
    const msg = chatInput.value.trim();
    if (!msg) return;

    const userDiv = document.createElement("div");
    userDiv.className = "user-msg";
    userDiv.textContent = msg;
    chatBody.appendChild(userDiv);
    chatInput.value = "";

    const hist = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    hist.push({ from:"user", msg, time:new Date().toLocaleString() });
    localStorage.setItem(CHAT_KEY, JSON.stringify(hist));

    const inbox = JSON.parse(localStorage.getItem(CEO_CHAT_KEY) || "[]");
    inbox.push({ message: msg, time: new Date().toLocaleString() });
    localStorage.setItem(CEO_CHAT_KEY, JSON.stringify(inbox));

    const typing = document.createElement("div");
    typing.className = "typing-indicator";
    typing.textContent = "Agent is typing…";
    chatBody.appendChild(typing);
    chatBody.scrollTop = chatBody.scrollHeight;

    setTimeout(() => {
      typing.remove();
      const reply = autoReply(msg);
      const botDiv = document.createElement("div");
      botDiv.className = "bot-msg";
      botDiv.textContent = reply;
      chatBody.appendChild(botDiv);

      hist.push({ from:"bot", msg:reply, time:new Date().toLocaleString() });
      localStorage.setItem(CHAT_KEY, JSON.stringify(hist));
      chatBody.scrollTop = chatBody.scrollHeight;
    }, 1200);
  }

  sendBtn?.addEventListener("click", sendMessage);
  chatInput?.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      sendMessage();
    }
  });
});

/* ================= CEO INBOX ================= */
function renderCEOInbox(){
  const box = $("ceoInbox");
  if (!box) return;

  const data = JSON.parse(localStorage.getItem(CEO_CHAT_KEY) || "[]");
  box.innerHTML = data.length ? data.map((m, i) => `
      <div class="msg">
        <p>${m.message}</p>
        <small>${m.time}</small>
        <div style="margin-top:6px;"><button onclick="deleteMessage(${i})" type="button">Delete</button></div>
      </div>
    `).join("") : "<em>No customer messages yet</em>";
}

function deleteMessage(index){
  const data = JSON.parse(localStorage.getItem(CEO_CHAT_KEY) || "[]");
  data.splice(index,1);
  localStorage.setItem(CEO_CHAT_KEY, JSON.stringify(data));
  renderCEOInbox();
}

document.addEventListener("DOMContentLoaded", () => {
  $("clearMessagesBtn")?.addEventListener("click", () => {
    if (!confirm("Clear all customer messages?")) return;
    localStorage.removeItem(CEO_CHAT_KEY);
    renderCEOInbox();
  });

  window.addEventListener("storage", e => {
    if (e.key === CEO_CHAT_KEY) renderCEOInbox();
  });
});

/* ================= PDF (with QR) ================= */
function downloadPDF(id){
  const p = loadParcels().find(x => x.id === id);
  if (!p) return alert("Parcel not found");

  if (!window.jspdf || !window.QRCode) {
    alert("PDF or QR library missing (include jsPDF + qrcodejs).");
    return;
  }

  // create QR in-memory
  const qrWrap = document.createElement("div");
  new QRCode(qrWrap, { text: p.code, width: 120, height: 120, correctLevel: QRCode.CorrectLevel.H });

  // wait until QR image generated (it may render async)
  setTimeout(() => {
    const img = qrWrap.querySelector("img") || qrWrap.querySelector("canvas");
    if (!img) return alert("Failed to generate QR");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text("PIPUNICORNLogistics", 20, 20);
    doc.setFontSize(11);
    doc.text(`Tracking: ${p.code}`, 20, 36);
    doc.text(`Sender: ${p.sender}`, 20, 46);
    doc.text(`Recipient: ${p.recipient}`, 20, 56);
    doc.text(`Destination: ${p.destination}`, 20, 66);
    doc.text(`Status: ${p.status}`, 20, 76);

    let dataUrl = "";
    if (img.tagName.toLowerCase() === "img") dataUrl = img.src;
    else if (img.tagName.toLowerCase() === "canvas") dataUrl = img.toDataURL();

    if (dataUrl) doc.addImage(dataUrl, "PNG", 140, 20, 40, 40);
    doc.save(`${p.code}.pdf`);
  }, 250);
}

/* ================= INITIAL RENDER ON LOAD ================= */
document.addEventListener("DOMContentLoaded", () => {
  renderAdminList();
  renderParcelList();
  renderCEOInbox();
  updateStats();

  // language selector initialization (if present)
  const langSelect = $("languageSelector");
  if (langSelect) {
    // minimal set
    const langs = [
      { code:'en', label:'English', flag:'https://flagcdn.com/w20/us.png' },
      { code:'fr', label:'Français', flag:'https://flagcdn.com/w20/fr.png' },
      { code:'es', label:'Español', flag:'https://flagcdn.com/w20/es.png' },
      { code:'de', label:'Deutsch', flag:'https://flagcdn.com/w20/de.png' },
      { code:'zh', label:'中文', flag:'https://flagcdn.com/w20/cn.png' },
      { code:'ja', label:'日本語', flag:'https://flagcdn.com/w20/jp.png' }
    ];
    langSelect.innerHTML = langs.map(l => `<option value="${l.code}" data-flag="${l.flag}">${l.label}</option>`).join('');
    // hook to change flag if you have an img#langFlag in DOM
    const flagImg = $("langFlag");
    langSelect.addEventListener("change", () => {
      const opt = langSelect.selectedOptions[0];
      if (flagImg && opt?.dataset?.flag) flagImg.src = opt.dataset.flag;
      // basic client-side translations handled separately (not covering entire site)
    });
  }
});

/* Expose some functions to global scope (so HTML inline handlers work) */
window.openEdit = openEdit;
window.deleteParcel = function(id){ deleteParcel(id); };
window.downloadPDF = downloadPDF;
window.renderAdminList = renderAdminList;
window.renderParcelList = renderParcelList;
window.renderCEOInbox = renderCEOInbox;

/* ========== Logo click → 2-second sync screen → home ========== */
document.addEventListener("DOMContentLoaded", () => {
  const logo = document.querySelector(".brand-logo");
  const loader = document.getElementById("homeLoader");
  const mainContent = document.getElementById("mainContent");
  const trackingResult = document.getElementById("trackingResult");

  if (!logo || !loader) return;

  logo.addEventListener("click", (e) => {
    e.preventDefault();

    // show loading screen
    loader.classList.remove("hidden");

    // hide any other section
    if (mainContent) mainContent.classList.add("hidden");
    if (trackingResult) trackingResult.classList.add("hidden");

    // after 2 seconds → homepage
    setTimeout(() => {
      loader.classList.add("hidden");
      if (mainContent) mainContent.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 2000);
  });
});