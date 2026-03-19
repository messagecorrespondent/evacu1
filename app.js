// ── Firebase config ── REPLACE WITH YOUR OWN FROM FIREBASE CONSOLE
const FIREBASE_CONFIG = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};

// ── Init Firebase ──
firebase.initializeApp(FIREBASE_CONFIG);
const db = firebase.firestore();

// ── Device ID ──
function getDeviceId() {
  let id = localStorage.getItem('evacu_device_id');
  if (!id) {
    id = 'pwa-' + Math.random().toString(36).substr(2, 8);
    localStorage.setItem('evacu_device_id', id);
  }
  return id;
}

const DEVICE_ID = getDeviceId();
document.getElementById('display-device-id').textContent = DEVICE_ID;

// ── State ──
let deviceData = null;
let buttons = [];
let activeAlerts = [];
let currentThreadId = null;
let listeners = [];
let heartbeatTimer = null;

// ── Check if already registered ──
const savedDevice = localStorage.getItem('evacu_registered');
if (savedDevice) {
  deviceData = JSON.parse(savedDevice);
  showMain();
  startApp();
}

// ── Registration ──
async function checkRegistration() {
  const btn = document.getElementById('connect-btn');
  const txt = document.getElementById('connect-btn-text');
  const err = document.getElementById('connect-error');
  txt.textContent = 'Checking...';
  btn.disabled = true;
  err.textContent = '';

  try {
    const doc = await db.collection('devices').doc(DEVICE_ID).get();
    if (doc.exists) {
      deviceData = { id: doc.id, ...doc.data() };
      localStorage.setItem('evacu_registered', JSON.stringify(deviceData));
      showMain();
      startApp();
    } else {
      err.textContent = 'Device not found. Ask admin to add your Device ID first.';
      txt.textContent = "I've been added - Connect";
      btn.disabled = false;
    }
  } catch(e) {
    err.textContent = 'Connection error: ' + e.message;
    txt.textContent = "I've been added - Connect";
    btn.disabled = false;
  }
}

function copyDeviceId() {
  navigator.clipboard.writeText(DEVICE_ID).then(() => showToast('Device ID copied!'));
}

// ── Show screens ──
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showMain() { showScreen('screen-main'); }
function showRegister() { showScreen('screen-register'); }

// ── Start app after registration ──
function startApp() {
  updateStatusTab();
  startHeartbeat();
  startListeners();
}

// ── Heartbeat ──
function startHeartbeat() {
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 30000);
}

function sendHeartbeat() {
  db.collection('devices').doc(DEVICE_ID).update({
    lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
    status: 'online'
  }).catch(() => {});
}

// ── Realtime listeners ──
function startListeners() {
  // Buttons
  const bl = db.collection('buttons').onSnapshot(snap => {
    buttons = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => a.label.localeCompare(b.label));
    renderButtons();
  });

  // Active alerts
  const al = db.collection('alerts')
    .where('status', '==', 'active')
    .onSnapshot(snap => {
      const prev = activeAlerts.map(a => a.id);
      activeAlerts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderActiveAlerts();
      updateActiveBadge();
      // Show overlay for new alerts
      activeAlerts.forEach(a => {
        if (!prev.includes(a.id)) showAlertOverlay(a);
      });
    });

  // Messages
  const ml = db.collection('messages')
    .orderBy('timestamp', 'desc')
    .limit(50)
    .onSnapshot(snap => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderMessages(msgs);
    });

  listeners = [bl, al, ml];
}

function stopListeners() {
  listeners.forEach(u => u());
  listeners = [];
}

// ── Render buttons ──
function renderButtons() {
  const grid = document.getElementById('buttons-grid');
  if (!buttons.length) {
    grid.innerHTML = '<div class="empty-state">No buttons configured.<br>Add buttons in Evacu Admin.</div>';
    return;
  }
  grid.innerHTML = '';
  buttons.forEach(btn => {
    const colorClass = 'btn-' + (btn.color || 'blue');
    const holdTime = btn.holdTime || 3;
    const iconMap = { emergency:'⚠', allClear:'✓', information:'ℹ' };
    const icon = iconMap[btn.alertType] || '⚠';
    const el = document.createElement('div');
    el.className = `hold-button ${colorClass}`;
    el.innerHTML = `
      <div class="btn-progress" id="prog-${btn.id}"></div>
      <div class="btn-icon">${icon}</div>
      <div class="btn-label">${btn.label}</div>
      <div class="btn-type">${(btn.alertType||'').toUpperCase()}</div>
      <div class="btn-hold" id="hold-txt-${btn.id}">Hold ${holdTime}s to send</div>
    `;
    setupHoldButton(el, btn);
    grid.appendChild(el);
  });
}

// ── Hold button logic ──
function setupHoldButton(el, btn) {
  const holdTime = (btn.holdTime || 3) * 1000;
  let timer = null;
  let startTime = null;
  let animFrame = null;
  let fired = false;

  function start(e) {
    if (fired) return;
    e.preventDefault();
    startTime = Date.now();
    updateProgress();
    timer = setTimeout(() => fire(), holdTime);
  }

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
    if (!fired) {
      document.getElementById('prog-' + btn.id).style.width = '0%';
      document.getElementById('hold-txt-' + btn.id).textContent = `Hold ${btn.holdTime || 3}s to send`;
    }
    startTime = null;
  }

  function updateProgress() {
    if (!startTime) return;
    const elapsed = Date.now() - startTime;
    const pct = Math.min(100, (elapsed / holdTime) * 100);
    document.getElementById('prog-' + btn.id).style.width = pct + '%';
    if (elapsed < holdTime) animFrame = requestAnimationFrame(updateProgress);
  }

  async function fire() {
    fired = true;
    el.classList.add('fired');
    el.querySelector('.btn-hold').innerHTML = '<span class="btn-sent">SENT!</span>';
    el.querySelector('.btn-progress').style.width = '100%';
    // Vibrate
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
    try {
      await db.collection('alerts').add({
        type: btn.alertType || 'emergency',
        buttonId: btn.id,
        group: btn.group || 'default',
        senderDevice: DEVICE_ID,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        status: 'active',
        isDrill: false
      });
      db.collection('logs').add({
        event: 'alert_sent',
        device: DEVICE_ID,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        details: btn.id
      });
    } catch(e) {
      showToast('Error: ' + e.message);
    }
    setTimeout(() => {
      fired = false;
      el.classList.remove('fired');
      el.querySelector('.btn-hold').textContent = `Hold ${btn.holdTime || 3}s to send`;
      el.querySelector('.btn-progress').style.width = '0%';
    }, 3000);
  }

  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
}

// ── Alert overlay ──
function showAlertOverlay(alert) {
  const isDrill = alert.isDrill || false;
  const overlay = document.getElementById('alert-overlay');
  overlay.className = 'alert-overlay ' + (isDrill ? 'drill' : 'emergency');
  document.getElementById('alert-drill-badge').classList.toggle('hidden', !isDrill);
  document.getElementById('alert-overlay-icon').textContent = isDrill ? '🚩' : '⚠';
  document.getElementById('alert-overlay-type').textContent = (alert.type || 'EMERGENCY').toUpperCase();
  document.getElementById('alert-overlay-button').textContent = alert.buttonId || '';
  const ts = alert.timestamp?.toDate?.();
  document.getElementById('alert-overlay-time').textContent = ts ? ts.toLocaleTimeString() : '';
  if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
}

function dismissAlert() {
  document.getElementById('alert-overlay').className = 'alert-overlay hidden';
}

// ── Render active alerts ──
function renderActiveAlerts() {
  const list = document.getElementById('active-alerts-list');
  if (!activeAlerts.length) {
    list.innerHTML = `<div class="empty-state all-clear">
      <div class="all-clear-icon">&#10003;</div>
      <div class="all-clear-title">All Clear</div>
      <div class="all-clear-sub">No active alerts</div>
    </div>`;
    return;
  }
  list.innerHTML = '';
  activeAlerts.forEach(a => {
    const isDrill = a.isDrill || false;
    const ts = a.timestamp?.toDate?.();
    const timeStr = ts ? ts.toLocaleTimeString() : '';
    const el = document.createElement('div');
    el.className = 'alert-item' + (isDrill ? ' drill' : '');
    el.innerHTML = `
      <div class="alert-item-type ${isDrill ? 'drill' : ''}">${isDrill ? '[DRILL] ' : ''}${(a.type||'').toUpperCase()}</div>
      <div class="alert-item-meta">Button: ${a.buttonId} &bull; Group: ${a.group} &bull; ${timeStr}</div>
    `;
    list.appendChild(el);
  });
}

function updateActiveBadge() {
  const badge = document.getElementById('active-badge');
  if (activeAlerts.length > 0) {
    badge.textContent = activeAlerts.length;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// ── Messages ──
function renderMessages(msgs) {
  const list = document.getElementById('messages-list');
  if (!msgs.length) {
    list.innerHTML = '<div class="empty-state">No messages yet</div>';
    return;
  }
  list.innerHTML = '';
  msgs.forEach(msg => {
    const ts = msg.timestamp?.toDate?.();
    const timeStr = ts ? ts.toLocaleDateString('fi') + ' ' + ts.toLocaleTimeString('fi', {hour:'2-digit', minute:'2-digit'}) : '';
    const sender = msg.sender === 'admin_pc' ? 'Admin (PC)' : (msg.sender || '');
    const el = document.createElement('div');
    el.className = 'message-item';
    el.innerHTML = `
      <div class="message-title">${msg.title || ''}</div>
      <div class="message-meta"><span>${sender}</span><span>${msg.group || ''}</span><span>${timeStr}</span></div>
      <div class="message-preview">${msg.text || ''}</div>
    `;
    el.onclick = () => openThread(msg);
    list.appendChild(el);
  });
}

async function sendMessage() {
  const title = document.getElementById('msg-title').value.trim();
  const text = document.getElementById('msg-text').value.trim();
  if (!title || !text) { showToast('Fill in title and message'); return; }
  try {
    await db.collection('messages').add({
      title, text,
      sender: DEVICE_ID,
      group: deviceData?.groups?.[0] || 'default',
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      responsesEnabled: true,
      source: 'mobile'
    });
    document.getElementById('msg-title').value = '';
    document.getElementById('msg-text').value = '';
    hideNewMessage();
    showToast('Message sent!');
  } catch(e) { showToast('Error: ' + e.message); }
}

function showNewMessage() {
  document.getElementById('new-message-form').classList.remove('hidden');
}
function hideNewMessage() {
  document.getElementById('new-message-form').classList.add('hidden');
}

// ── Thread ──
function openThread(msg) {
  currentThreadId = msg.id;
  showScreen('screen-thread');
  loadThread(msg);
}

function loadThread(msg) {
  const container = document.getElementById('thread-messages');
  container.innerHTML = `
    <div class="bubble other">
      <div class="bubble-sender">${msg.sender === 'admin_pc' ? 'Admin (PC)' : msg.sender}</div>
      <strong>${msg.title}</strong><br>${msg.text}
    </div>
  `;
  db.collection('messages').doc(msg.id).collection('replies')
    .orderBy('timestamp')
    .onSnapshot(snap => {
      const existing = container.querySelectorAll('.bubble:not(:first-child)');
      existing.forEach(e => e.remove());
      snap.docs.forEach(d => {
        const r = d.data();
        const isMe = r.sender === DEVICE_ID;
        const bubble = document.createElement('div');
        bubble.className = 'bubble ' + (isMe ? 'me' : 'other');
        if (!isMe) bubble.innerHTML = `<div class="bubble-sender">${r.sender === 'admin_pc' ? 'Admin (PC)' : r.sender}</div>`;
        bubble.innerHTML += r.text;
        container.appendChild(bubble);
      });
      container.scrollTop = container.scrollHeight;
    });
}

async function sendReply() {
  if (!currentThreadId) return;
  const input = document.getElementById('reply-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  try {
    await db.collection('messages').doc(currentThreadId)
      .collection('replies').add({
        text,
        sender: DEVICE_ID,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
  } catch(e) { showToast('Error: ' + e.message); }
}

// ── Status tab ──
function updateStatusTab() {
  if (!deviceData) return;
  document.getElementById('topbar-device-name').textContent = deviceData.name || '';
  document.getElementById('st-name').textContent = deviceData.name || '-';
  document.getElementById('st-id').textContent = DEVICE_ID;
  document.getElementById('st-user').textContent = deviceData.user || '-';
  document.getElementById('st-groups').textContent = (deviceData.groups || []).join(', ') || '-';
}

// ── Tab navigation ──
function showTab(name) {
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('content-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  // Hide new message form when switching
  if (name !== 'messages') hideNewMessage();
}

// ── Disconnect ──
function disconnect() {
  if (!confirm('Disconnect this device? You will need to reconnect.')) return;
  stopListeners();
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  localStorage.removeItem('evacu_registered');
  deviceData = null;
  showRegister();
}

// ── Toast ──
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2500);
}
