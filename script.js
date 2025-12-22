/* ===============================
   PIPUNICORNLogistics - script.js
   WITH FIREBASE CLOUD SUPPORT - FIXED MOBILE UPDATES
   =============================== */

/* ================= FIREBASE SETUP ================= */
const firebaseConfig = {
  apiKey: "AIzaSyAj_p_DPMukPNLhxGzaQUga2nWSVR2d5kg",
  authDomain: "pipunicorn-logistics.firebaseapp.com",
  projectId: "pipunicorn-logistics",
  storageBucket: "pipunicorn-logistics.firebasestorage.app",
  messagingSenderId: "215559373362",
  appId: "1:215559373362:web:bc9221c44054831d37322b"
};

// Initialize Firebase (with safety check)
try {
  if (typeof firebase !== 'undefined' && firebase.apps.length === 0) {
    firebase.initializeApp(firebaseConfig);
  }
} catch (error) {
  console.error("Firebase initialization error:", error);
}

const db = typeof firebase !== 'undefined' ? firebase.firestore() : null;

/* ================= GLOBAL CONSTANTS ================= */
const STORAGE_KEY = "pip_parcels_final";
const CHAT_KEY = "pip_chat_history";
const CEO_CHAT_KEY = "pip_ceo_private";
const CEO_PIN = "1299";
const $ = id => document.getElementById(id);

// ============================================
// NEW: FIREBASE CHAT SYSTEM - CEO CAN SEE MESSAGES FROM ANY DEVICE
// ============================================

/* ================= CLOUD CHAT FUNCTIONS ================= */
// Save chat message to Firebase Cloud (CRITICAL FIX)
async function saveChatToFirebase(message, senderType = 'customer', metadata = {}) {
  if (!db) {
    console.warn("Firebase not available, saving locally only");
    return saveChatLocally(message, senderType, metadata);
  }
  
  try {
    const chatData = {
      message: message,
      senderType: senderType,
      senderId: getChatSenderId(senderType),
      senderName: metadata.name || 'Unknown',
      senderEmail: metadata.email || '',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'unread', // For CEO inbox tracking
      deviceInfo: {
        userAgent: navigator.userAgent,
        platform: navigator.platform
      },
      ...metadata
    };

    await db.collection('customer_chats').add(chatData);
    console.log("✅ Chat saved to Firebase (CEO can see from any device!):", message.substring(0, 50));
    
    // Also save locally for quick display
    saveChatLocally(message, senderType, metadata);
    
    return true;
  } catch (error) {
    console.error("❌ Error saving chat to Firebase:", error);
    saveChatLocally(message, senderType, metadata);
    return false;
  }
}

// Load ALL chat messages for CEO (from any device!)
async function loadCEOInboxFromFirebase() {
  if (!db) {
    console.warn("Firebase not available, loading local only");
    return loadChatHistory();
  }
  
  try {
    const snapshot = await db.collection('customer_chats')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();
    
    const messages = [];
    snapshot.forEach(doc => {
      messages.push({ 
        id: doc.id, 
        ...doc.data(),
        // Convert Firestore timestamp to readable format
        displayTime: doc.data().timestamp?.toDate 
          ? doc.data().timestamp.toDate().toLocaleString() 
          : new Date().toLocaleString()
      });
    });
    
    console.log("✅ Loaded", messages.length, "chat messages from Firebase");
    return messages;
  } catch (error) {
    console.error("❌ Error loading CEO inbox:", error);
    return [];
  }
}

// Mark message as read in Firebase
async function markChatAsRead(messageId) {
  if (!db) return false;
  
  try {
    await db.collection('customer_chats').doc(messageId).update({
      status: 'read',
      readAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    console.log("✅ Message marked as read:", messageId);
    return true;
  } catch (error) {
    console.error("❌ Error marking as read:", error);
    return false;
  }
}

// Send CEO reply to customer (saved in same chat thread)
async function sendCEOReplyToFirebase(originalMessageId, replyText) {
  if (!db) return false;
  
  try {
    await db.collection('customer_chats').add({
      message: replyText,
      senderType: 'ceo',
      senderId: 'ceo_admin',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      status: 'replied',
      originalMessageId: originalMessageId,
      isReply: true
    });
    
    console.log("✅ CEO reply sent:", replyText.substring(0, 50));
    return true;
  } catch (error) {
    console.error("❌ Error sending CEO reply:", error);
    return false;
  }
}

// Real-time listener for new messages (CEO gets instant notifications)
function setupChatRealtimeListener() {
  if (!db) {
    console.warn("Firebase not available for real-time updates");
    return;
  }
  
  // Listen for NEW chat messages (CEO dashboard only)
  db.collection('customer_chats')
    .orderBy('timestamp', 'desc')
    .limit(1)
    .onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const newMessage = { 
            id: change.doc.id, 
            ...change.doc.data() 
          };
          
          // Only notify if CEO dashboard is open
          if (isCEODashboardOpen() && newMessage.senderType === 'customer') {
            showNewChatNotification(newMessage);
          }
        }
      });
    }, (error) => {
      console.error("Realtime chat listener error:", error);
    });
}

/* ================= LOCAL CHAT HELPERS (Fallback) ================= */
function saveChatLocally(message, senderType = 'customer', metadata = {}) {
  try {
    const hist = JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
    hist.push({ 
      from: senderType === 'customer' ? "user" : "bot", 
      msg: message, 
      time: new Date().toLocaleString(),
      ...metadata
    });
    
    // Keep only last 100 messages
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    
    localStorage.setItem(CHAT_KEY, JSON.stringify(hist));
    
    // Also save to CEO inbox locally (fallback)
    if (senderType === 'customer') {
      const inbox = JSON.parse(localStorage.getItem(CEO_CHAT_KEY) || "[]");
      inbox.unshift({
        id: 'local_' + Date.now(),
        message: message,
        time: new Date().toLocaleString(),
        name: metadata.name || 'Customer',
        email: metadata.email || ''
      });
      
      if (inbox.length > 50) inbox.pop();
      localStorage.setItem(CEO_CHAT_KEY, JSON.stringify(inbox));
    }
    
    return true;
  } catch (error) {
    console.error("Error saving chat locally:", error);
    return false;
  }
}

function loadChatHistory() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY) || "[]");
  } catch {
    return [];
  }
}

function getChatSenderId(senderType) {
  if (senderType === 'ceo') return 'ceo_admin';
  
  // Generate unique customer ID (persists across sessions)
  let customerId = localStorage.getItem('customer_chat_id');
  if (!customerId) {
    customerId = 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('customer_chat_id', customerId);
  }
  return customerId;
}

function isCEODashboardOpen() {
  return window.location.hash === '#ceo' || 
         document.getElementById('ownerDashboard')?.classList.contains('hidden') === false;
}

function showNewChatNotification(message) {
  // Play notification sound
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAZGF0YQ');
    audio.play().catch(e => console.log("Audio play failed:", e));
  } catch (e) {}
  
  // Show browser notification
  if (Notification.permission === 'granted') {
    new Notification('📩 New Customer Message', {
      body: `${message.senderName || 'Customer'}: ${message.message.substring(0, 100)}...`,
      icon: '/logo.png',
      tag: 'new-chat'
    });
  }
  
  // Update CEO inbox UI
  renderCEOInbox();
}

/* ================= SAFE HELPERS ================= */
const safe = fn => { try { return fn(); } catch(e){ console.warn(e); } };

/* ================== COUNTRY DETECTION ================= */
document.addEventListener("DOMContentLoaded", () => {
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

/* ================= LOCAL STORAGE HELPERS ================= */
const loadParcels = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
};

const saveParcels = (d) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch (error) {
    console.error("Error saving to localStorage:", error);
  }
};

/* ================= DISPLAY FUNCTIONS ================= */
function displayParcelData(parcel) {
  console.log("🔄 Displaying parcel:", parcel.code);
  
  if (!$("trackedCode")) return;
  
  $("trackedCode").textContent = parcel.code;

  // Format history nicely
  const history = parcel.history || [];
  const historyHTML = history.slice().reverse().map((h, index) => {
    const locationText = h.location ? `<br><small>📍 ${h.location}</small>` : '';
    const noteText = h.note ? `<br><small>📝 ${h.note}</small>` : '';
    const isLatest = index === 0 ? 'class="latest-history"' : '';
    return `<li ${isLatest}>
      <strong>${h.status}</strong>
      <br><small>🕒 ${h.time || h.timestamp || ''}</small>
      ${locationText}
      ${noteText}
    </li>`;
  }).join('');

  const parcelDetails = $("parcelDetails");
  if (parcelDetails) {
    parcelDetails.innerHTML = `
      <div class="parcel-info-card">
        <p><strong>Sender:</strong> ${parcel.sender || 'Unknown'}</p>
        <p><strong>Recipient:</strong> ${parcel.recipient || 'Unknown'}</p>
        <p><strong>Destination:</strong> ${parcel.destination || 'Unknown'}</p>
        <p><strong>Current Status:</strong> <span class="status-badge">${parcel.status || 'Unknown'}</span></p>
        <p><strong>Current Location:</strong> <span>${parcel.location || "Unknown"}</span></p>
        ${parcel.createdAt ? `<p><small style="color:#666;">📅 Created: ${new Date(parcel.createdAt).toLocaleDateString()}</small></p>` : ''}
      </div>
      <h4>📋 Shipment History (${history.length} entries)</h4>
      <ul class="history-list">
        ${historyHTML || '<li>No history recorded yet</li>'}
      </ul>
    `;
  }

  const exactEl = $("exactLocation");
  if (exactEl) exactEl.textContent = parcel.location || "Unknown";

  const destEl = $("parcelDestination");
  if (destEl) destEl.textContent = parcel.destination || "Unknown";

  const statusFlow = $("statusFlow");
  if (statusFlow) {
    const statuses = [""];
    statusFlow.innerHTML = statuses.map(s => {
      let cls = 'status-item';
      if (s === parcel.status) cls = 'status-item active';
      if (s === 'On Hold') cls = 'status-item on-hold';
      if (s === 'Delivered') cls = 'status-item delivered';
      return `<div class="${cls}">${s}</div>`;
    }).join('');
  }

  // Restart animations
  const dot = document.querySelector(".tracker-dot");
  if (dot) {
    dot.style.animation = "none";
    void dot.offsetWidth;
    dot.style.animation = null;
  }
  document.querySelectorAll('.v-dot').forEach(d => {
    d.style.animation = 'none';
    void d.offsetWidth;
    d.style.animation = null;
  });
}

/* ================= CLEAR MOBILE CACHE FUNCTION ================= */
function clearMobileCache() {
  if (confirm("Clear all cached parcel data on this device?\n\nThis will force a fresh reload from cloud next time you track.")) {
    localStorage.removeItem(STORAGE_KEY);
    alert("✅ Cache cleared! Next tracking will get fresh data from cloud.");
    
    // If on tracking page, go back to home
    const result = $("trackingResult");
    const mainContent = $("mainContent");
    if (result && result.classList.contains("hidden") === false) {
      result.classList.add("hidden");
      if (mainContent) mainContent.classList.remove("hidden");
    }
  }
}

/* ================= INITIAL UI RENDERS ================= */
async function updateStats() {
  const cloudParcels = await getAllParcelsFromCloud();
  const localParcels = loadParcels();
  
  const allParcels = [...cloudParcels];
  localParcels.forEach(lp => {
    if (!allParcels.find(p => p.id === lp.id)) {
      allParcels.push(lp);
    }
  });

  const totalEl = $("totalCount");
  if (totalEl) totalEl.textContent = allParcels.length;
  
  const inTransitEl = $("inTransitCount");
  if (inTransitEl) inTransitEl.textContent = allParcels.filter(p => p.status === "In Transit").length;
  
  const deliveredEl = $("deliveredCount");
  if (deliveredEl) deliveredEl.textContent = allParcels.filter(p => p.status === "Delivered").length;
}

/* ================= CEO LOGIN ================= */
document.addEventListener("DOMContentLoaded", () => {
  const hint = document.querySelector(".ceo-shortcut-hint");
  if (hint) {
    hint.style.display = "none";
  }
});

window.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  const isTyping = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable);
  if (isTyping) return;
  if (e.altKey && (e.key === "o" || e.key === "O")) {
    e.preventDefault();
    const pa = $("pinAccess");
    if (pa) pa.classList.remove("hidden");
    setTimeout(() => $("pinInput")?.focus(), 60);
  }
}, { passive: true });

document.addEventListener("DOMContentLoaded", () => {
  $("verifyPinBtn")?.addEventListener("click", async () => {
    if ($("pinInput").value !== CEO_PIN) {
      alert("Wrong PIN");
      return;
    }
    $("pinAccess")?.classList.add("hidden");
    $("ownerDashboard")?.classList.remove("hidden");
    await updateStats();
    await renderAdminList();
    renderParcelList();
    renderCEOInbox();
  });
});

/* ================= CREATE PARCEL ================= */
document.addEventListener("DOMContentLoaded", () => {
  $("createParcelBtn")?.addEventListener("click", async () => {
    const parcels = loadParcels();
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
      history: [{ 
        status: "Registered", 
        time: new Date().toLocaleString(), 
        location: "Warehouse",
        note: "Parcel registered in system"
      }]
    };

    // Save locally
    parcels.unshift(parcel);
    saveParcels(parcels);
    
    // Save to cloud
    const cloudSuccess = await saveParcelToCloud(parcel);
    
    if (cloudSuccess) {
      alert(`✅ Parcel registered!\nTracking Code: ${code}\n\n📱 NOW AVAILABLE ON MOBILE DEVICES!\n\nShare this code with customer: ${code}`);
    } else {
      alert(`⚠️ Parcel saved locally only\nCode: ${code}\n\nTo make it available on mobile:\n1. Check internet connection\n2. Refresh page and try again`);
    }
    
    await updateStats();
    await renderAdminList();
    renderParcelList();
    
    // Clear form
    if ($("senderName")) $("senderName").value = "";
    if ($("recipientName")) $("recipientName").value = "";
    if ($("recipientPhone")) $("recipientPhone").value = "";
    if ($("destination")) $("destination").value = "";
    if ($("parcelDesc")) $("parcelDesc").value = "";
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
      <p>To: ${p.recipient}</p>
      <p>Status: ${p.status}</p>
      <div class="parcel-actions">
        <button type="button" onclick="openEdit('${p.id}')">Edit</button>
        <button type="button" onclick="return deleteParcel('${p.id}')">Delete</button>
        <button type="button" onclick="downloadPDF('${p.id}')">PDF Receipt</button>
      </div>
    </div>
  `).join("");
}

/* ================= ADMIN PANEL RENDER ================= */
async function renderAdminList() {
  const box = $("parcelAdminList");
  if (!box) return;

  // Show loading
  box.innerHTML = '<div style="padding:20px;text-align:center;"><div class="spinner"></div><p>Loading parcels from cloud...</p></div>';

  try {
    const cloudParcels = await getAllParcelsFromCloud();
    const localParcels = loadParcels();
    
    const allParcels = [...cloudParcels];
    localParcels.forEach(localParcel => {
      if (!allParcels.find(p => p.id === localParcel.id)) {
        allParcels.push(localParcel);
      }
    });

    // Sort by creation date (newest first)
    allParcels.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

    box.innerHTML = allParcels.length ? allParcels.map(p => `
      <div class="parcel-card">
        <strong>${p.code}</strong>
        <p><strong>To:</strong> ${p.recipient}</p>
        <p><strong>Status:</strong> ${p.status} ${p.location ? `(${p.location})` : ''}</p>
        <p><strong>Destination:</strong> ${p.destination || 'Not specified'}</p>
        <p><small>History: ${(p.history || []).length} entries</small></p>
        <div class="parcel-actions">
          <button type="button" onclick="openEdit('${p.id}')">Edit</button>
          <button type="button" onclick="return deleteParcel('${p.id}')">Delete</button>
          <button type="button" onclick="downloadPDF('${p.id}')">PDF</button>
        </div>
        <small style="display:block;margin-top:5px;color:#666;">
          ${p.createdAt ? 'Created: ' + new Date(p.createdAt).toLocaleDateString() : ''}
        </small>
      </div>
    `).join("") : '<div class="no-parcels"><em>No parcels registered yet. Create your first parcel above.</em></div>';

  } catch (error) {
    console.error("Error rendering admin list:", error);
    box.innerHTML = '<div class="error-msg">⚠️ Error loading parcels. Please check internet connection.</div>';
  }

  await updateStats();
}

/* ================= CLOUD FUNCTIONS ================= */
// Save parcel to Firebase Cloud
async function saveParcelToCloud(parcel) {
  if (!db) {
    console.warn("Firebase not available, saving locally only");
    return false;
  }
  
  try {
    await db.collection('parcels').doc(parcel.id).set(parcel);
    console.log("✅ Parcel saved to cloud:", parcel.code);
    return true;
  } catch (error) {
    console.error("❌ Error saving to cloud:", error);
    return false;
  }
}

// Get FRESH parcel from Firebase Cloud (ALWAYS USE THIS FOR TRACKING)
async function getParcelFromCloudFresh(trackingCode) {
  if (!db) {
    console.warn("Firebase not available, checking local only");
    return null;
  }
  
  try {
    console.log("🔍 Fetching FRESH parcel from cloud:", trackingCode);
    
    const query = await db.collection('parcels')
      .where('code', '==', trackingCode)
      .limit(1)
      .get();
    
    if (!query.empty) {
      const doc = query.docs[0];
      const parcel = { id: doc.id, ...doc.data() };
      console.log("✅ Fresh parcel fetched:", parcel.code);
      return parcel;
    }
    console.log("❌ No parcel found with code:", trackingCode);
    return null;
  } catch (error) {
    console.error("❌ Error getting from cloud:", error);
    return null;
  }
}

// Get parcel from Firebase Cloud by ID
async function getParcelFromCloudById(parcelId) {
  if (!db) return null;
  
  try {
    const doc = await db.collection('parcels').doc(parcelId).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    }
    return null;
  } catch (error) {
    console.error("❌ Error getting parcel by ID from cloud:", error);
    return null;
  }
}

// Get all parcels from cloud (for admin)
async function getAllParcelsFromCloud() {
  if (!db) return [];
  
  try {
    const snapshot = await db.collection('parcels').get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  } catch (error) {
    console.error("❌ Error getting all parcels:", error);
    return [];
  }
}

// Update parcel in cloud
async function updateParcelInCloud(id, updates) {
  if (!db) return false;
  
  try {
    console.log("📤 Updating parcel in cloud:", id);
    
    // Add timestamp to updates
    const finalUpdates = {
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    await db.collection('parcels').doc(id).update(finalUpdates);
    console.log("✅ Parcel updated in cloud:", id);
    return true;
  } catch (error) {
    console.error("❌ Error updating in cloud:", error);
    return false;
  }
}

// Delete parcel from cloud
async function deleteParcelFromCloud(id) {
  if (!db) return false;
  
  try {
    await db.collection('parcels').doc(id).delete();
    console.log("✅ Parcel deleted from cloud:", id);
    return true;
  } catch (error) {
    console.error("❌ Error deleting from cloud:", error);
    return false;
  }
}

/* ================= EDIT / DELETE ================= */
let editingParcelId = null;

async function openEdit(id) {
  try {
    let parcel = await getParcelFromCloudById(id);
    
    if (!parcel) {
      const localParcels = loadParcels();
      parcel = localParcels.find(x => x.id === id);
    }
    
    if (!parcel) {
      alert("Parcel not found");
      return;
    }

    editingParcelId = id;
    $("editCode").value = parcel.code;
    $("editStatus").value = parcel.status;
    $("editLocation").value = parcel.location || "";
    $("editNote").value = parcel.note || "";

    $("editParcelModal").classList.remove("hidden");
  } catch (error) {
    console.error("Error opening edit:", error);
    alert("Error loading parcel details");
  }
}

// FIXED EDIT FUNCTION
document.addEventListener("DOMContentLoaded", () => {
  $("editParcelForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const newStatus = $("editStatus").value;
    const newLocation = $("editLocation").value;
    const note = $("editNote").value;
    
    if (!newStatus) {
      alert("Please select a status");
      return;
    }

    try {
      // Get current parcel
      let parcel = await getParcelFromCloudById(editingParcelId);
      
      if (!parcel) {
        const localParcels = loadParcels();
        parcel = localParcels.find(p => p.id === editingParcelId);
      }
      
      if (!parcel) {
        alert("Parcel not found");
        return;
      }

      // Create new history entry
      const historyEntry = {
        status: newStatus,
        time: new Date().toLocaleString(),
        location: newLocation || parcel.location || "Unknown",
        note: note || `Status changed to ${newStatus}`
      };

      // Get current history and add new entry
      const currentHistory = parcel.history || [];
      const updatedHistory = [...currentHistory, historyEntry];

      // Prepare updates for cloud
      const updates = {
        status: newStatus,
        location: newLocation || parcel.location,
        history: updatedHistory
      };
      
      if (note) updates.note = note;

      // Update in CLOUD
      const cloudSuccess = await updateParcelInCloud(editingParcelId, updates);
      
      if (cloudSuccess) {
        // Update locally
        const parcels = loadParcels();
        const localParcelIndex = parcels.findIndex(p => p.id === editingParcelId);
        
        if (localParcelIndex !== -1) {
          parcels[localParcelIndex].status = newStatus;
          parcels[localParcelIndex].location = newLocation || parcels[localParcelIndex].location;
          if (note) parcels[localParcelIndex].note = note;
          parcels[localParcelIndex].history = updatedHistory;
          saveParcels(parcels);
        }
        
        alert(`✅ Status updated!\nNew status: ${newStatus}\n\n📱 Mobile users will see this change immediately!`);
      } else {
        alert("⚠️ Could not update in cloud. Check internet connection.");
      }
    } catch (error) {
      console.error("Error updating parcel:", error);
      alert("Error updating parcel. Please check console.");
    }

    $("editParcelModal").classList.add("hidden");
    await renderAdminList();
    renderParcelList();
  });

  $("closeEditModal")?.addEventListener("click", () => {
    $("editParcelModal")?.classList.add("hidden");
  });
});

/* ================= DELETE PARCEL (FIXED - PROPER CLOUD SYNC) ================= */
async function deleteParcel(id) {
  if (!confirm("Delete parcel permanently from ALL devices?")) return false;

  try {
    // Get parcel code before deleting
    const parcels = loadParcels();
    const parcelToDelete = parcels.find(p => p.id === id);
    const parcelCode = parcelToDelete?.code;
    
    // 1. Delete from CLOUD (this propagates to all devices)
    const cloudSuccess = await deleteParcelFromCloud(id);
    
    if (cloudSuccess) {
      // 2. Delete from local storage on THIS device
      const updatedParcels = parcels.filter(p => p.id !== id);
      saveParcels(updatedParcels);
      
      alert(`✅ Parcel deleted!\n\nCode: ${parcelCode}\n\n📱 Mobile users will see "Parcel not found" immediately.`);
    } else {
      alert("⚠️ Could not delete from cloud. Check internet connection.");
    }
    
  } catch (error) {
    console.error("Delete error:", error);
    alert("Error deleting parcel. Please try again.");
  }
  
  await renderAdminList();
  renderParcelList();
  updateStats();

  return false;
}

/* ================= TRACKING (FIXED - ALWAYS FRESH FROM CLOUD) ================= */
document.addEventListener("DOMContentLoaded", () => {
  const loader = $("trackLoader");
  const result = $("trackingResult");
  const backBtn = $("backToSearch");
  const mainContent = $("mainContent");

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

  $("trackBtn")?.addEventListener("click", async () => {
    const code = $("trackingInput")?.value.trim();
    if (!code) return alert("Enter tracking code");

    if (loader) loader.classList.remove("hidden");
    if (result) result.classList.add("hidden");

    try {
      console.log("🔍 Searching for parcel:", code);
      
      // ⚠️ CRITICAL FIX: ALWAYS GET FRESH FROM CLOUD, NEVER USE LOCAL CACHE
      const parcel = await getParcelFromCloudFresh(code);
      
      if (!parcel) {
        // Clear any cached version in local storage
        const parcels = loadParcels();
        const filtered = parcels.filter(p => p.code !== code);
        saveParcels(filtered);
        
        if (loader) loader.classList.add("hidden");
        alert("❌ Parcel not found. It may have been deleted.");
        return;
      }

      console.log("✅ Found fresh parcel from cloud:", parcel.code);
      
      // Update local storage with fresh data (optional, for offline viewing)
      const parcels = loadParcels();
      const existingIndex = parcels.findIndex(p => p.id === parcel.id);
      
      if (existingIndex !== -1) {
        parcels[existingIndex] = parcel; // Replace with fresh data
      } else {
        parcels.push(parcel);
      }
      saveParcels(parcels);

      // Show results
      if (loader) loader.classList.add("hidden");
      if (mainContent) mainContent.classList.add("hidden");
      if (result) result.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: 'smooth' });

      displayParcelData(parcel);

    } catch (error) {
      console.error("Tracking error:", error);
      if (loader) loader.classList.add("hidden");
      alert("Error tracking parcel. Please try again.");
    }
  });

  backBtn?.addEventListener("click", () => {
    $("mainContent")?.classList.remove("hidden");
    $("trackingResult")?.classList.add("hidden");
    $("trackingInput").value = "";
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
});

/* ================= ADD CACHE CLEARING BUTTONS ================= */
document.addEventListener("DOMContentLoaded", () => {
  // Create refresh button
  const refreshBtn = document.createElement("button");
  refreshBtn.id = "forceRefreshBtn";
  refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh from Cloud';
  refreshBtn.style.cssText = `
    background: #007bff;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    margin: 10px 5px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  `;
  
  refreshBtn.addEventListener("click", async () => {
    const currentCode = $("trackedCode")?.textContent;
    if (!currentCode) {
      alert("No parcel is being tracked");
      return;
    }
    
    refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
    refreshBtn.disabled = true;
    
    console.log("🔄 Force refreshing parcel:", currentCode);
    
    // Get FRESH from cloud
    const freshParcel = await getParcelFromCloudFresh(currentCode);
    
    if (freshParcel) {
      // Update local storage
      const parcels = loadParcels();
      const existingIndex = parcels.findIndex(p => p.id === freshParcel.id);
      
      if (existingIndex !== -1) {
        parcels[existingIndex] = freshParcel;
      } else {
        parcels.push(freshParcel);
      }
      saveParcels(parcels);
      
      // Update display
      displayParcelData(freshParcel);
      
      refreshBtn.innerHTML = '<i class="fas fa-check"></i> Refreshed!';
      setTimeout(() => {
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh from Cloud';
        refreshBtn.disabled = false;
      }, 1500);
    } else {
      alert("❌ Parcel not found. It may have been deleted.");
      refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh from Cloud';
      refreshBtn.disabled = false;
    }
  });
  
  // Create cache clear button
  const cacheClearBtn = document.createElement("button");
  cacheClearBtn.id = "clearCacheBtn";
  cacheClearBtn.innerHTML = '<i class="fas fa-trash-alt"></i> Clear Cache';
  cacheClearBtn.style.cssText = `
    background: #dc3545;
    color: white;
    border: none;
    padding: 10px 16px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: bold;
    margin: 10px 5px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
  `;
  
  cacheClearBtn.title = "Clear cached data and get fresh from cloud";
  cacheClearBtn.addEventListener("click", clearMobileCache);
  
  // Add buttons to tracking result page
  const trackingCard = document.querySelector(".tracking-card");
  if (trackingCard) {
    const backButton = $("backToSearch");
    if (backButton && backButton.parentNode) {
      // Add refresh button
      backButton.parentNode.insertBefore(refreshBtn, backButton);
      // Add cache clear button
      backButton.parentNode.insertBefore(cacheClearBtn, backButton);
    }
  }
});

/* ================= UPDATED CHAT SYSTEM ================= */
document.addEventListener("DOMContentLoaded", () => {
  const chatToggle = $("chatToggle");
  const chatWidget = $("chatWidget");
  const chatInput = $("chatInput");
  const chatBody = $("chatBody");
  const sendBtn = $("sendChat");
  
  // Start real-time listener for CEO
  setupChatRealtimeListener();

  chatToggle?.addEventListener("click", () => {
    chatWidget.style.display = chatWidget.style.display === "flex" ? "none" : "flex";
    loadChatHistoryUI();
  });

  function loadChatHistoryUI() {
    const history = loadChatHistory();
    chatBody.innerHTML = `
      <div class="bot-msg">Hello 👋 I'm your AI Assistant. Please tell me your full name and how I can assist you today.</div>
    `;
    
    history.forEach(m => {
      chatBody.innerHTML += `<div class="${m.from === "user" ? "user-msg" : "bot-msg"}">${m.msg}</div>`;
    });
    
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  function autoReply(msg) {
    const m = msg.toLowerCase();
    if (m.includes("track")) return "📦 Please enter your tracking code on the homepage to track your parcel.";
    if (m.includes("delivery")) return "🚚 Delivery takes 3-7 working days depending on destination.";
    if (m.includes("delay")) return "⚠️ Delays may occur due to customs, weather, or high volume. Please provide your tracking code for specific updates.";
    if (m.includes("cost") || m.includes("price")) return "💰 Pricing depends on package size and destination. Please email pipunicornlogistics@gmail.com for a quote.";
    if (m.includes("contact")) return "📞 You can email us at pipunicornlogistics@gmail.com or call +1-800-PIP-LOGS.";
    
    // Check if customer provided name
    if (m.includes("name is") || m.includes("my name is") || m.includes("i am") || m.includes("im ")) {
      return "Thank you for providing your name! How can I assist you further? Please provide your tracking code if you have one.";
    }
    
    return "Thank you for your message! For better assistance, please provide:\n1. Your full name\n2. Your email address\n3. Your tracking code (if available)\n\nOr email us at pipunicornlogistics@gmail.com";
  }

  function extractNameFromMessage(msg) {
    const namePatterns = [
      /my name is (\w+ \w+)/i,
      /name is (\w+ \w+)/i,
      /i am (\w+ \w+)/i,
      /im (\w+ \w+)/i,
      /this is (\w+ \w+)/i
    ];
    
    for (const pattern of namePatterns) {
      const match = msg.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return 'Customer';
  }

  function extractEmailFromMessage(msg) {
    const emailPattern = /[\w._%+-]+@[\w.-]+\.[a-zA-Z]{2,}/;
    const match = msg.match(emailPattern);
    return match ? match[0] : '';
  }

  async function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg) return;

    // Save user message to Firebase (CEO can see it from any device!)
    const metadata = {
      name: extractNameFromMessage(msg),
      email: extractEmailFromMessage(msg)
    };
    
    const cloudSaved = await saveChatToFirebase(msg, 'customer', metadata);

    // Add to chat UI
    const userDiv = document.createElement("div");
    userDiv.className = "user-msg";
    userDiv.textContent = msg;
    chatBody.appendChild(userDiv);
    chatInput.value = "";
    chatBody.scrollTop = chatBody.scrollHeight;

    // Show typing indicator
    const typing = document.createElement("div");
    typing.className = "typing-indicator";
    typing.innerHTML = '<div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>';
    chatBody.appendChild(typing);
    chatBody.scrollTop = chatBody.scrollHeight;

    // Auto-reply after delay
    setTimeout(async () => {
      typing.remove();
      const reply = autoReply(msg);
      
      // Save bot reply to Firebase too (optional)
      if (cloudSaved) {
        await saveChatToFirebase(reply, 'bot', { 
          isAutoReply: true,
          originalMessage: msg.substring(0, 100)
        });
      } else {
        saveChatLocally(reply, 'bot');
      }
      
      const botDiv = document.createElement("div");
      botDiv.className = "bot-msg";
      botDiv.textContent = reply;
      chatBody.appendChild(botDiv);
      chatBody.scrollTop = chatBody.scrollHeight;
    }, 1500);
  }

  // Event listeners
  sendBtn?.addEventListener("click", sendMessage);
  chatInput?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
});

/* ================= UPDATED CEO INBOX ================= */
async function renderCEOInbox() {
  const box = $("ceoInbox");
  if (!box) return;

  // Show loading
  box.innerHTML = '<div style="padding:20px;text-align:center;"><div class="spinner"></div><p>Loading messages from cloud...</p></div>';

  try {
    // Load from Firebase (messages from ALL devices)
    const firebaseMessages = await loadCEOInboxFromFirebase();
    
    // Also load local messages (fallback)
    const localMessages = JSON.parse(localStorage.getItem(CEO_CHAT_KEY) || "[]");
    
    // Combine and sort by time (newest first)
    const allMessages = [...firebaseMessages, ...localMessages]
      .sort((a, b) => {
        const timeA = a.timestamp?.toDate?.() || new Date(a.time || a.timestamp);
        const timeB = b.timestamp?.toDate?.() || new Date(b.time || b.timestamp);
        return timeB - timeA;
      })
      .slice(0, 50); // Show only 50 most recent

    if (allMessages.length === 0) {
      box.innerHTML = '<div class="no-messages"><em>No customer messages yet. When customers use the chat, they will appear here.</em></div>';
      return;
    }

    box.innerHTML = allMessages.map((m, i) => `
      <div class="ceo-message-card ${m.status || 'unread'}">
        <div class="message-header">
          <strong>${m.senderName || m.name || 'Customer'}</strong>
          <span class="message-time">${m.displayTime || m.time || new Date().toLocaleString()}</span>
        </div>
        <div class="message-body">
          <p>${m.message || m.msg || ''}</p>
          ${m.senderEmail || m.email ? `<small>📧 ${m.senderEmail || m.email}</small>` : ''}
          ${m.senderId ? `<small>ID: ${m.senderId}</small>` : ''}
        </div>
        <div class="message-footer">
          <span class="message-status">${m.status || 'unread'}</span>
          <div class="message-actions">
            ${m.id && m.id.startsWith('local_') ? '' : `
              <button type="button" class="btn-small" onclick="markChatAsReadFirebase('${m.id}')">Mark Read</button>
            `}
            <button type="button" class="btn-small btn-danger" onclick="deleteMessageFromInbox(${i}, '${m.id}')">Delete</button>
            ${m.senderType === 'customer' && m.id && !m.id.startsWith('local_') ? `
              <button type="button" class="btn-small btn-reply" onclick="openReplyModal('${m.id}', '${m.senderName || 'Customer'}')">Reply</button>
            ` : ''}
          </div>
        </div>
      </div>
    `).join("");

  } catch (error) {
    console.error("Error rendering CEO inbox:", error);
    
    // Fallback to local only
    const localData = JSON.parse(localStorage.getItem(CEO_CHAT_KEY) || "[]");
    box.innerHTML = localData.length ? localData.map((m, i) => `
      <div class="ceo-message-card">
        <p><strong>Customer:</strong> ${m.message}</p>
        <small>${m.time}</small>
        <div style="margin-top:6px;">
          <button type="button" onclick="deleteMessage(${i})">Delete</button>
        </div>
      </div>
    `).join("") : '<div class="error-msg">⚠️ Error loading messages. Check internet connection.</div>';
  }
}

/* ================= NEW: CEO INBOX MANAGEMENT ================= */
async function deleteMessageFromInbox(index, firebaseId = null) {
  if (!confirm("Delete this message from inbox?")) return;
  
  try {
    // Delete from Firebase if it exists there
    if (firebaseId && !firebaseId.startsWith('local_') && db) {
      await db.collection('customer_chats').doc(firebaseId).delete();
      console.log("✅ Message deleted from Firebase");
    }
    
    // Delete from local CEO inbox
    const localData = JSON.parse(localStorage.getItem(CEO_CHAT_KEY) || "[]");
    if (index >= 0 && index < localData.length) {
      localData.splice(index, 1);
      localStorage.setItem(CEO_CHAT_KEY, JSON.stringify(localData));
    }
    
    // Refresh inbox
    await renderCEOInbox();
  } catch (error) {
    console.error("Error deleting message:", error);
    alert("Error deleting message");
  }
}

async function markChatAsReadFirebase(messageId) {
  if (!messageId || messageId.startsWith('local_')) return;
  
  const success = await markChatAsRead(messageId);
  if (success) {
    // Update UI
    const messageElement = document.querySelector(`[data-message-id="${messageId}"]`);
    if (messageElement) {
      messageElement.classList.remove('unread');
      messageElement.classList.add('read');
    }
    await renderCEOInbox();
  }
}

function openReplyModal(messageId, customerName) {
  // Create reply modal if it doesn't exist
  let modal = $('replyModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'replyModal';
    modal.className = 'modal hidden';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <h3>Reply to ${customerName}</h3>
        <textarea id="replyText" placeholder="Type your reply here..." rows="4" style="width:100%;margin:10px 0;"></textarea>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button type="button" onclick="closeReplyModal()">Cancel</button>
          <button type="button" onclick="sendCEOReply('${messageId}')" style="background:#007bff;color:white;">Send Reply</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  modal.classList.remove('hidden');
  document.getElementById('replyText')?.focus();
}

function closeReplyModal() {
  $('replyModal')?.classList.add('hidden');
}

async function sendCEOReply(originalMessageId) {
  const replyText = $('replyText')?.value.trim();
  if (!replyText) {
    alert("Please enter a reply message");
    return;
  }
  
  const success = await sendCEOReplyToFirebase(originalMessageId, replyText);
  if (success) {
    alert("✅ Reply sent! Customer will see it in their chat history.");
    closeReplyModal();
    await renderCEOInbox();
  } else {
    alert("❌ Failed to send reply. Please try again.");
  }
}

/* ================= PDF ================= */
function downloadPDF(id){
  const parcels = loadParcels();
  const p = parcels.find(x => x.id === id);
  
  if (!p) {
    alert("Parcel not found in local storage. Please track it first to download.");
    return;
  }

  if (!window.jspdf || !window.QRCode) {
    alert("PDF or QR library missing");
    return;
  }

  const qrWrap = document.createElement("div");
  new QRCode(qrWrap, {
    text: p.code,
    width: 120,
    height: 120,
    correctLevel: QRCode.CorrectLevel.H
  });

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
    
    if (p.history && p.history.length > 0) {
      doc.text("Recent History:", 20, 86);
      const recentHistory = p.history.slice(-3).reverse();
      recentHistory.forEach((h, i) => {
        doc.text(`${h.time}: ${h.status}`, 20, 96 + (i * 6));
      });
    }

    let dataUrl = "";
    if (img.tagName.toLowerCase() === "img") dataUrl = img.src;
    else if (img.tagName.toLowerCase() === "canvas") dataUrl = img.toDataURL();

    if (dataUrl) doc.addImage(dataUrl, "PNG", 140, 20, 40, 40);
    doc.save(`${p.code}.pdf`);
  }, 250);
}

/* ================= INITIAL RENDER ================= */
document.addEventListener("DOMContentLoaded", async () => {
  // Show home loader briefly
  const homeLoader = $("homeLoader");
  if (homeLoader) {
    setTimeout(() => {
      homeLoader.classList.add("hidden");
    }, 1000);
  }
  
  await renderAdminList();
  renderParcelList();
  await renderCEOInbox(); // Changed to async
  updateStats();
  
  // Initialize chat real-time listener
  if (db) {
    setupChatRealtimeListener();
  }
});

/* ================= GLOBAL EXPORTS ================= */
window.openEdit = openEdit;
window.deleteParcel = deleteParcel;
window.downloadPDF = downloadPDF;
window.renderAdminList = renderAdminList;
window.renderParcelList = renderParcelList;
window.renderCEOInbox = renderCEOInbox;
window.clearMobileCache = clearMobileCache;
window.deleteMessageFromInbox = deleteMessageFromInbox;
window.markChatAsReadFirebase = markChatAsReadFirebase;
window.sendCEOReply = sendCEOReply;
window.openReplyModal = openReplyModal;
window.closeReplyModal = closeReplyModal;

/* ========== Logo click ========== */
document.addEventListener("DOMContentLoaded", () => {
  const logo = document.querySelector(".brand-logo");
  const loader = document.getElementById("homeLoader");
  const mainContent = document.getElementById("mainContent");
  const trackingResult = document.getElementById("trackingResult");

  if (!logo || !loader) return;

  logo.addEventListener("click", (e) => {
    e.preventDefault();

    loader.classList.remove("hidden");
    if (mainContent) mainContent.classList.add("hidden");
    if (trackingResult) trackingResult.classList.add("hidden");

    setTimeout(() => {
      loader.classList.add("hidden");
      if (mainContent) mainContent.classList.remove("hidden");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 2000);
  });
})

/* ================= EMAIL CUSTOMER SERVICE ================= */
document.addEventListener("DOMContentLoaded", function() {
  // Get elements
  const customerServiceLink = document.getElementById("customerServiceLink");
  const emailModal = document.getElementById("emailModal");
  const closeEmailModal = document.getElementById("closeEmailModal");
  const emailForm = document.getElementById("emailForm");
  
  // Open email modal when clicking Customer Service
  if (customerServiceLink) {
    customerServiceLink.addEventListener("click", function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      if (emailModal) {
        emailModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
      }
    });
  }
  
  // Close modal with close button
  if (closeEmailModal) {
    closeEmailModal.addEventListener("click", function() {
      if (emailModal) {
        emailModal.classList.add("hidden");
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "auto";
      }
    });
  }
  
  // Close modal when clicking outside
  if (emailModal) {
    emailModal.addEventListener("click", function(e) {
      if (e.target === emailModal) {
        emailModal.classList.add("hidden");
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "auto";
      }
    });
  }
  
  // Close modal with Escape key
  document.addEventListener("keydown", function(e) {
    if (e.key === "Escape" && emailModal && !emailModal.classList.contains("hidden")) {
      emailModal.classList.add("hidden");
      document.body.style.overflow = "auto";
      document.documentElement.style.overflow = "auto";
    }
  });
  
  // Handle email form submission - FIXED VERSION
  if (emailForm) {
    emailForm.addEventListener("submit", function(e) {
      e.preventDefault();
      
      // Get form values
      const name = document.getElementById("customerName").value.trim();
      const email = document.getElementById("customerEmail").value.trim();
      const subject = document.getElementById("emailSubject").value.trim();
      const message = document.getElementById("emailMessage").value.trim();
      
      // Validate
      if (!name || !email || !message) {
        alert("Please fill in all required fields: Name, Email, and Message");
        return;
      }
      
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        alert("Please enter a valid email address");
        return;
      }
      
      // Create a direct mailto link that user can click
      const mailtoLink = `mailto:pipunicornlogistics@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\n---\nSent from PIPUNICORNLogistics website`
      )}`;
      
      // Create a temporary link and click it programmatically
      const tempLink = document.createElement('a');
      tempLink.href = mailtoLink;
      tempLink.style.display = 'none';
      document.body.appendChild(tempLink);
      
      // Show message to user
      alert("📧 Email client opening...\n\nIf it doesn't open automatically:\n1. Check your popup blocker\n2. Click 'Open Email App' button instead\n3. Or copy this email: pipunicornlogistics@gmail.com");
      
      // Try to open email client
      setTimeout(function() {
        tempLink.click();
        document.body.removeChild(tempLink);
        
        // Reset form
        emailForm.reset();
        document.getElementById("emailSubject").value = "Customer Service Inquiry";
        
        // Close modal after delay
        setTimeout(function() {
          if (emailModal) {
            emailModal.classList.add("hidden");
            document.body.style.overflow = "auto";
            document.documentElement.style.overflow = "auto";
          }
        }, 1000);
      }, 100);
    });
  }
  
  // Make direct email button work - SIMPLIFIED VERSION
  const directEmailButtons = document.querySelectorAll('.btn-email');
  directEmailButtons.forEach(function(button) {
    button.addEventListener('click', function(e) {
      // Don't prevent default - let the <a href="mailto:..."> work naturally
      // Just close the modal
      if (emailModal) {
        emailModal.classList.add("hidden");
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "auto";
      }
    });
  });
  
  // Also handle the email display click
  const emailDisplay = document.querySelector('.email-display');
  if (emailDisplay) {
    emailDisplay.addEventListener('click', function() {
      const mailtoLink = "mailto:pipunicornlogistics@gmail.com?subject=Customer Service Inquiry";
      window.open(mailtoLink, '_blank');
      
      if (emailModal) {
        emailModal.classList.add("hidden");
        document.body.style.overflow = "auto";
        document.documentElement.style.overflow = "auto";
      }
    });
  }
});