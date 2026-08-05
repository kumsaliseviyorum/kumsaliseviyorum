/* ===========================================================
   call.js — Sesli arama
   - Birebir arama: çalma / kabul / red akışı (klasik WebRTC + Firestore imzalama deseni)
   - Aile Odası: herkesin istediği zaman katılıp çıkabildiği, mesh (herkes herkese bağlı)
     grup görüşmesi.
   NOT: Sadece genel STUN sunucusu kullanılıyor. Bazı mobil operatör / kurumsal
   ağlarda bu yeterli olmayabilir; gerçek kullanımda bir TURN sunucusu eklemen
   önerilir (aşağıdaki ICE_SERVERS listesine ekleyebilirsin).
   =========================================================== */

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
    // { urls: 'turn:TURN_SUNUCUN:3478', username: 'kullanici', credential: 'sifre' },
  ]
};

let localStream = null;
let currentCallId = null;   // aktif birebir arama
let inFamilyRoom = false;
const peerConnections = {}; // uid -> { pc, audioEl }

// ---------- DOM ----------
const incomingCallEl = document.getElementById('incomingCall');
const callerAvatar = document.getElementById('callerAvatar');
const callerNameEl = document.getElementById('callerName');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');

const activeCallEl = document.getElementById('activeCall');
const activeCallLabel = document.getElementById('activeCallLabel');
const participantGrid = document.getElementById('participantGrid');
const muteBtn = document.getElementById('muteBtn');
const hangupBtn = document.getElementById('hangupBtn');

const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomStatusEl = document.getElementById('roomStatus');

let incomingCallId = null;

function initCallFeature() {
  listenIncomingCalls();
  listenFamilyRoom();
}

// ---------- Ortak yardımcılar ----------
async function getLocalStream() {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  return localStream;
}

function stopLocalStreamIfIdle() {
  const stillNeeded = currentCallId || inFamilyRoom;
  if (!stillNeeded && localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
}

function addParticipantTile(uid, name) {
  if (document.getElementById('tile-' + uid)) return;
  const div = document.createElement('div');
  div.className = 'participant';
  div.id = 'tile-' + uid;
  div.innerHTML = `<div class="avatar">${initials(name)}</div><span>${escapeHtml(name || 'Aile üyesi')}</span>`;
  participantGrid.appendChild(div);
}

function removeParticipantTile(uid) {
  const el = document.getElementById('tile-' + uid);
  if (el) el.remove();
}

function attachRemoteAudio(uid, stream) {
  let audioEl = document.getElementById('audio-' + uid);
  if (!audioEl) {
    audioEl = document.createElement('audio');
    audioEl.id = 'audio-' + uid;
    audioEl.autoplay = true;
    audioEl.style.display = 'none';
    document.body.appendChild(audioEl);
  }
  audioEl.srcObject = stream;
}

function removeRemoteAudio(uid) {
  const el = document.getElementById('audio-' + uid);
  if (el) el.remove();
}

function closePeer(uid) {
  const entry = peerConnections[uid];
  if (entry) {
    try { entry.pc.close(); } catch (e) {}
    delete peerConnections[uid];
  }
  removeParticipantTile(uid);
  removeRemoteAudio(uid);
}

muteBtn.addEventListener('click', () => {
  if (!localStream) return;
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
  muteBtn.classList.toggle('active', !track.enabled);
  muteBtn.textContent = track.enabled ? '🎤'
