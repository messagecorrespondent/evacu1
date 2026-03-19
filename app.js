// ═══════════════════════════════════════════════════════
// EVACU PWA - app.js
// Two-Firebase architecture:
//   PAIRING_DB  = evacu-app-connect  (shared, public pairing)
//   PERSONAL_DB = admin's own Firebase (set after pairing)
// ═══════════════════════════════════════════════════════

// ── Shared pairing Firebase (evacu-app-connect) ──────────
const PAIRING_CONFIG = {
  apiKey: "AIzaSyA8-2mPvrnEhbi7UEsVBcUU1o8AR64FZ20",
  authDomain: "evacu-app-connect.firebaseapp.com",
  projectId: "evacu-app-connect",
  storageBucket: "evacu-app-connect.firebasestorage.app",
  messagingSenderId: "293725006336",
  appId: "1:293725006336:web:0a14d7cc8b1ff44c6706e5"
};

// ── Init pairing Firebase ─────────────────────────────────
const pairingApp = firebase.initializeApp(PAIRING_CONFIG, "pairing");
const pairingDb  = firebase.firestore(pairingApp);

// ── Personal Firebase (set after pairing) ─────────────────
let personalDb   = null;
let personalApp  = null;

// ── State ─────────────────────────────────────────────────
let deviceId     = null;
let pairingCode  = null;
let deviceData   = null;
let buttons      = [];
let activeAlerts = [];
let listeners    = [];
let heartbeatTimer = null;
let currentThreadId = null;
let pairingListener = null;

// ═══════════════════════════════════════════════════════
// STARTUP
// ═══════════════════════════════════════════════════════
window.addEventListener('load', () => {
  // Check if already paired
  const saved = localStorage.getItem('evacu_paired_device');
  const savedConfig = localStorage.getItem('evacu_personal_config');
  if (saved && savedConfig) {
    deviceData = JSON.parse(saved);
    deviceId   = deviceData.id;
    initPersonalFirebase(JSON.parse(savedConfig));
    showScreen('screen-main');
    startApp();
  } else {
    startPairing();
  }
});

// ═══════════════════════════════════════════════════════
// PAIRING FLOW
// ═══════════════════════════════════════════════════════
function startPairing() {
  // Generate 6-char pairing code
  pairingCode = Math.random().toString(36).substr(2, 6).toUpperCase();
  deviceId    = 'pwa-' + Math.random().toString(36).substr(2, 8);

  document.getElementById('code-display').textContent = pairingCode;
  showScreen('screen-pairing');

  // Register in pairing Firebase
  pairingDb.collection('pending_devices').doc(pairingCode).set({
    pairingCode: pairingCode,
    deviceId: deviceId,
    platform: 'pwa',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'waiting'
  });

  // Listen for admin to approve
  pairingListener = pairingDb.collection('pending_devices').doc(pairingCode)
    .onSnapshot(snap => {
      if (!snap.exists) return;
      const data = snap.data();

      if (data.status === 'approved' && data.personalConfig) {
        // Admin approved! Store everything
        localStorage.setItem('evacu_personal_config', JSON.stringify(data.personalConfig));
        localStorage.setItem('evacu_paired_device', JSON.stringify({
          id: deviceId,
          name: data.deviceName || 'My Device',
          user: data.user || '',
          groups: data.groups || []
        }));
        deviceData = JSON.parse(localStorage.getItem('evacu_paired_device'));

        // Show approved state
        document.getElementById('state-waiting').classList.remove('active');
        document.getElementById('state-approved').classList.add('active');

        // Clean up pairing entry
        pairingDb.collection('pending_devices').doc(pairingCode).delete();
        if (pairingListener) { pairingListener(); pairingListener = null; }

        // Init personal Firebase and go to main
        initPersonalFirebase(data.personalConfig);
        setTimeout(() => {
          showScreen('screen-main');
          startApp();
        }, 1500);
      }
    });
}

function initPersonalFirebase(config) {
  try {
    if (personalApp) return;
    personalApp = firebase.initializeApp(config, "personal");
    personalDb  = firebase.firestore(personalApp);
  } catch(e) {
    // Already initialized
    personalDb = firebase.firestore(firebase.app("personal"));
  }
}

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
function startApp() {
  updateStatusTab();
  document.getElementById('topbar-name').textContent = deviceData?.name || '';
  startHeartbeat();
  startListeners();
}

function startHeartbeat() {
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 30000);
}

function sendHeartbeat() {
  if (!personalDb || !deviceId) return;
  personalDb.collection('devices').doc(deviceId).update({
    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'online'
  }).catch(() => {});
}

function startListeners() {
  if (!personalDb) return;
  stopListeners();

  // Buttons
  const bl = personalDb.collection('buttons').onSnapshot(snap => {
    buttons = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (a.label||'').localeCompare(b.label||''));
    renderButtons();
  }, err => console.error('buttons:', err));

  // Active alerts
  const al = personalDb.collection('alerts')
    .where('status', '==', 'active')
    .onSnapshot(snap => {
      const prevIds = activeAlerts.map(a => a.id);
      activeAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderActiveAlerts();
      updateBadge();
      // Show overlay for brand-new alerts
      activeAlerts.forEach(a => {
        if (!prevIds.includes(a.id)) triggerAlertOverlay(a);
      });
    }, err => console.error('alerts:', err));

  // Messages
  const ml = personalDb.collection('messages')
    .orderBy('timestamp', 'desc').limit(50)
    .onSnapshot(snap => {
      renderMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.error('messages:', err));

  listeners = [bl, al, ml];
}

function stopListeners() {
  listeners.forEach(u => u()); listeners = [];
}

// ═══════════════════════════════════════════════════════
// BUTTONS
// ═══════════════════════════════════════════════════════
function renderButtons() {
  const grid = document.getElementById('btn-grid');
  if (!buttons.length) {
    grid.innerHTML = '<div class="empty">No buttons configured.<br>Add buttons in Evacu Admin on PC.</div>';
    return;
  }
  grid.innerHTML = '';
  buttons.forEach(btn => {
    const el = document.createElement('div');
    el.className = `hold-btn c-${btn.color || 'blue'}`;
    const icons = { emergency:'⚠', allClear:'✓', information:'ℹ' };
    const icon  = icons[btn.alertType] || '⚠';
    const hold  = btn.holdTime || 3;
    el.innerHTML = `
      <div class="hb-progress" id="p-${btn.id}"></div>
      <div class="hb-icon">${icon}</div>
      <div class="hb-label">${btn.label}</div>
      <div class="hb-type">${(btn.alertType||'').toUpperCase()}</div>
      <div class="hb-hint" id="h-${btn.id}">Hold ${hold}s to send</div>`;
    attachHold(el, btn);
    grid.appendChild(el);
  });
}

function attachHold(el, btn) {
  const ms = (btn.holdTime || 3) * 1000;
  let timer = null, start = null, raf = null, fired = false;

  const progress = () => document.getElementById('p-' + btn.id);
  const hint     = () => document.getElementById('h-' + btn.id);

  function begin(e) {
    if (fired) return;
    e.preventDefault();
    start = Date.now();
    tick();
    timer = setTimeout(fire, ms);
  }
  function tick() {
    if (!start) return;
    const pct = Math.min(100, ((Date.now() - start) / ms) * 100);
    if (progress()) progress().style.width = pct + '%';
    if (pct < 100) raf = requestAnimationFrame(tick);
  }
  function cancel() {
    if (timer) clearTimeout(timer);
    if (raf)   cancelAnimationFrame(raf);
    timer = start = raf = null;
    if (!fired) {
      if (progress()) progress().style.width = '0%';
      if (hint()) hint().textContent = `Hold ${btn.holdTime||3}s to send`;
    }
  }
  async function fire() {
    fired = true;
    if (navigator.vibrate) navigator.vibrate([200,100,200]);
    if (hint()) hint().innerHTML = '<span class="hb-sent">SENT!</span>';
    if (progress()) progress().style.width = '100%';
    try {
      await personalDb.collection('alerts').add({
        type: btn.alertType || 'emergency',
        buttonId: btn.id,
        group: btn.group || 'default',
        senderDevice: deviceId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        isDrill: false
      });
      personalDb.collection('logs').add({
        event:'alert_sent', device:deviceId,
        timestamp:firebase.firestore.FieldValue.serverTimestamp(),
        details: btn.id
      });
    } catch(e) { showToast('Error: ' + e.message); }
    setTimeout(() => {
      fired = false;
      if (hint()) hint().textContent = `Hold ${btn.holdTime||3}s to send`;
      if (progress()) progress().style.width = '0%';
    }, 3000);
  }

  el.addEventListener('touchstart', begin, { passive:false });
  el.addEventListener('touchend',   cancel);
  el.addEventListener('touchcancel',cancel);
  el.addEventListener('mousedown',  begin);
  el.addEventListener('mouseup',    cancel);
  el.addEventListener('mouseleave', cancel);
}

// ═══════════════════════════════════════════════════════
// ALERT OVERLAY
// ═══════════════════════════════════════════════════════
function triggerAlertOverlay(alert) {
  const isDrill = !!alert.isDrill;
  const ov = document.getElementById('alert-overlay');
  ov.className = 'alert-overlay ' + (isDrill ? 'drill' : 'emergency');
  document.getElementById('overlay-drill-badge').classList.toggle('hidden', !isDrill);
  document.getElementById('overlay-icon').textContent = isDrill ? '🚩' : '⚠';
  document.getElementById('overlay-type').textContent = (alert.type||'EMERGENCY').toUpperCase();
  document.getElementById('overlay-btn-name').textContent = alert.buttonId || '';
  const ts = alert.timestamp?.toDate?.();
  document.getElementById('overlay-time').textContent = ts ? ts.toLocaleTimeString() : '';
  if (navigator.vibrate) navigator.vibrate([300,100,300,100,300]);
}

function dismissAlert() {
  document.getElementById('alert-overlay').className = 'alert-overlay hidden';
}

// ═══════════════════════════════════════════════════════
// ACTIVE ALERTS TAB
// ═══════════════════════════════════════════════════════
function renderActiveAlerts() {
  const list = document.getElementById('active-list');
  if (!activeAlerts.length) {
    list.innerHTML = `<div class="all-clear-state">
      <div class="ac-icon">&#10003;</div>
      <div class="ac-title">All Clear</div>
      <div class="ac-sub">No active alerts</div>
    </div>`;
    return;
  }
  list.innerHTML = '';
  activeAlerts.forEach(a => {
    const isDrill = !!a.isDrill;
    const ts = a.timestamp?.toDate?.();
    const el = document.createElement('div');
    el.className = 'alert-row' + (isDrill ? ' drill':'');
    el.innerHTML = `
      <div class="alert-row-type${isDrill?' drill':''}">${isDrill?'[DRILL] ':''}${(a.type||'').toUpperCase()}</div>
      <div class="alert-row-meta">Button: ${a.buttonId} &bull; Group: ${a.group} &bull; ${ts ? ts.toLocaleTimeString() : ''}</div>`;
    list.appendChild(el);
  });
}

function updateBadge() {
  const b = document.getElementById('active-badge');
  if (activeAlerts.length) {
    b.textContent = activeAlerts.length;
    b.classList.remove('hidden');
  } else {
    b.classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════
function renderMessages(msgs) {
  const list = document.getElementById('messages-list');
  if (!msgs.length) {
    list.innerHTML = '<div class="empty">No messages yet</div>';
    return;
  }
  list.innerHTML = '';
  msgs.forEach(msg => {
    const ts  = msg.timestamp?.toDate?.();
    const timeStr = ts ? ts.toLocaleDateString('fi') + ' ' + ts.toLocaleTimeString('fi',{hour:'2-digit',minute:'2-digit'}) : '';
    const sender  = msg.sender === 'admin_pc' ? 'Admin (PC)' : (msg.sender || '');
    const isAdmin = msg.sender === 'admin_pc';
    const el = document.createElement('div');
    el.className = 'msg-item' + (isAdmin ? ' msg-from-admin' : '');
    el.innerHTML = `
      <div class="msg-title">${msg.title||''}</div>
      <div class="msg-meta"><span>${sender}</span><span>${msg.group||''}</span><span>${timeStr}</span></div>
      <div class="msg-preview">${msg.text||''}</div>`;
    el.onclick = () => openThread(msg);
    list.appendChild(el);
  });
}

let newMsgVisible = false;
function toggleNewMsg() {
  newMsgVisible = !newMsgVisible;
  document.getElementById('new-msg-form').classList.toggle('hidden', !newMsgVisible);
}

async function sendMessage() {
  const title = document.getElementById('msg-title').value.trim();
  const body  = document.getElementById('msg-body').value.trim();
  if (!title || !body) { showToast('Fill in title and message'); return; }
  try {
    await personalDb.collection('messages').add({
      title, text: body,
      sender: deviceId,
      group: deviceData?.groups?.[0] || 'default',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      responsesEnabled: true,
      source: 'mobile'
    });
    document.getElementById('msg-title').value = '';
    document.getElementById('msg-body').value  = '';
    toggleNewMsg();
    showToast('Message sent!');
  } catch(e) { showToast('Error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════
// THREAD
// ═══════════════════════════════════════════════════════
let threadListener = null;

function openThread(msg) {
  currentThreadId = msg.id;
  document.getElementById('thread-title').textContent = msg.title || 'Thread';
  const body = document.getElementById('thread-body');
  body.innerHTML = '';

  // Original message bubble
  const orig = document.createElement('div');
  orig.className = 'bubble other';
  const sender = msg.sender === 'admin_pc' ? 'Admin (PC)' : (msg.sender||'');
  orig.innerHTML = `<div class="bubble-from">${sender}</div><strong>${msg.title}</strong><br>${msg.text}`;
  body.appendChild(orig);

  // Listen to replies
  if (threadListener) { threadListener(); threadListener = null; }
  threadListener = personalDb.collection('messages').doc(msg.id)
    .collection('replies').orderBy('timestamp')
    .onSnapshot(snap => {
      // Remove old reply bubbles
      body.querySelectorAll('.reply-bubble').forEach(e => e.remove());
      snap.docs.forEach(d => {
        const r    = d.data();
        const isMe = r.sender === deviceId;
        const el   = document.createElement('div');
        el.className = 'bubble reply-bubble ' + (isMe ? 'me' : 'other');
        if (!isMe) {
          const from = r.sender === 'admin_pc' ? 'Admin (PC)' : (r.sender||'');
          el.innerHTML = `<div class="bubble-from">${from}</div>${r.text}`;
        } else {
          el.textContent = r.text;
        }
        body.appendChild(el);
      });
      body.scrollTop = body.scrollHeight;
    });

  showScreen('screen-thread');
}

function closeThread() {
  if (threadListener) { threadListener(); threadListener = null; }
  showScreen('screen-main');
}

async function sendReply() {
  const input = document.getElementById('reply-input');
  const text  = input.value.trim();
  if (!text || !currentThreadId) return;
  input.value = '';
  try {
    await personalDb.collection('messages').doc(currentThreadId)
      .collection('replies').add({
        text, sender: deviceId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch(e) { showToast('Error: ' + e.message); }
}

// ═══════════════════════════════════════════════════════
// STATUS TAB
// ═══════════════════════════════════════════════════════
function updateStatusTab() {
  if (!deviceData) return;
  document.getElementById('s-name').textContent   = deviceData.name   || '-';
  document.getElementById('s-user').textContent   = deviceData.user   || '-';
  document.getElementById('s-groups').textContent = (deviceData.groups||[]).join(', ') || '-';
  document.getElementById('s-id').textContent     = deviceId || '-';
}

// ═══════════════════════════════════════════════════════
// NAVIGATION
// ═══════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showTab(name) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('tbtn-' + name).classList.add('active');
  if (name !== 'messages') {
    document.getElementById('new-msg-form').classList.add('hidden');
    newMsgVisible = false;
  }
}

// ═══════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}
