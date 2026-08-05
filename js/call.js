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
  muteBtn.textContent = track.enabled ? '🎤' : '🔇';
});

hangupBtn.addEventListener('click', () => {
  if (currentCallId) {
    endOneToOneCall('ended');
  } else if (inFamilyRoom) {
    leaveFamilyRoom();
  }
});

// ===========================================================
// BİREBİR ARAMA
// ===========================================================

async function callUser(uid, name) {
  if (currentCallId || inFamilyRoom) {
    showToast('Zaten bir görüşmedesin.');
    return;
  }
  try {
    await getLocalStream();
  } catch (e) {
    showToast('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
    return;
  }

  const callRef = db.collection('calls').doc();
  currentCallId = callRef.id;

  await callRef.set({
    fromUid: currentUser.uid,
    fromName: currentUser.name,
    toUid: uid,
    toName: name,
    status: 'ringing',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  activeCallLabel.textContent = 'Aranıyor: ' + name;
  participantGrid.innerHTML = '';
  addParticipantTile(uid, name);
  activeCallEl.classList.remove('hidden');

  watchOneToOneCall(callRef, true, uid, name);
}

function listenIncomingCalls() {
  db.collection('calls')
    .where('toUid', '==', currentUser.uid)
    .where('status', '==', 'ringing')
    .onSnapshot(snap => {
      snap.docChanges().forEach(change => {
        if (change.type === 'added') {
          const call = change.doc.data();
          incomingCallId = change.doc.id;
          callerNameEl.textContent = (call.fromName || 'Biri') + ' arıyor…';
          callerAvatar.textContent = initials(call.fromName);
          incomingCallEl.classList.remove('hidden');
        }
        if (change.type === 'modified' || change.type === 'removed') {
          if (change.doc.id === incomingCallId) {
            incomingCallEl.classList.add('hidden');
          }
        }
      });
    });
}

acceptCallBtn.addEventListener('click', async () => {
  if (!incomingCallId) return;
  const callRef = db.collection('calls').doc(incomingCallId);
  const snap = await callRef.get();
  const call = snap.data();
  if (!call) return;

  incomingCallEl.classList.add('hidden');

  if (currentCallId || inFamilyRoom) {
    // zaten görüşmedeyken kabul edilirse önce mevcut görüşmeden çık
    if (inFamilyRoom) await leaveFamilyRoom();
    if (currentCallId) endOneToOneCall('ended');
  }

  try {
    await getLocalStream();
  } catch (e) {
    showToast('Mikrofona erişilemedi.');
    await callRef.update({ status: 'rejected' });
    return;
  }

  currentCallId = callRef.id;
  await callRef.update({ status: 'accepted' });

  activeCallLabel.textContent = call.fromName;
  participantGrid.innerHTML = '';
  addParticipantTile(call.fromUid, call.fromName);
  activeCallEl.classList.remove('hidden');

  watchOneToOneCall(callRef, false, call.fromUid, call.fromName);
  incomingCallId = null;
});

rejectCallBtn.addEventListener('click', async () => {
  if (!incomingCallId) return;
  await db.collection('calls').doc(incomingCallId).update({ status: 'rejected' });
  incomingCallEl.classList.add('hidden');
  incomingCallId = null;
});

// isCaller: true -> teklif (offer) oluşturan taraf, false -> cevap (answer) veren taraf
function watchOneToOneCall(callRef, isCaller, otherUid, otherName) {
  const pc = new RTCPeerConnection(ICE_SERVERS);
  peerConnections[otherUid] = { pc };

  getLocalStream().then(stream => {
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  });

  pc.ontrack = (event) => attachRemoteAudio(otherUid, event.streams[0]);

  const candidateCollection = isCaller ? 'callerCandidates' : 'calleeCandidates';
  const remoteCandidateCollection = isCaller ? 'calleeCandidates' : 'callerCandidates';

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      callRef.collection(candidateCollection).add(event.candidate.toJSON());
    }
  };

  let remoteDescSet = false;

  const unsubDoc = callRef.onSnapshot(async (docSnap) => {
    const data = docSnap.data();
    if (!data) return;

    if (isCaller && !pc.currentLocalDescription) {
      // teklifi oluştur ve gönder
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await callRef.update({ offer: { type: offer.type, sdp: offer.sdp } });
    }

    if (isCaller && data.answer && !remoteDescSet) {
      remoteDescSet = true;
      await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
    }

    if (!isCaller && data.offer && !remoteDescSet) {
      remoteDescSet = true;
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await callRef.update({ answer: { type: answer.type, sdp: answer.sdp } });
    }

    if (data.status === 'rejected') {
      showToast((data.toUid === currentUser.uid ? data.fromName : data.toName) + ' görüşmeyi reddetti.');
      endOneToOneCall(null, callRef, unsubDoc, candidateUnsub);
    }
    if (data.status === 'ended') {
      endOneToOneCall(null, callRef, unsubDoc, candidateUnsub);
    }
  });

  const candidateUnsub = callRef.collection(remoteCandidateCollection).onSnapshot(snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added') {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(() => {});
      }
    });
  });
}

async function endOneToOneCall(newStatus, callRefParam, unsubDoc, candidateUnsub) {
  const callId = currentCallId;
  if (!callId) return;
  const callRef = callRefParam || db.collection('calls').doc(callId);

  if (newStatus) {
    await callRef.update({ status: newStatus }).catch(() => {});
  }
  if (unsubDoc) unsubDoc();
  if (candidateUnsub) candidateUnsub();

  Object.keys(peerConnections).forEach(uid => closePeer(uid));
  currentCallId = null;
  activeCallEl.classList.add('hidden');
  participantGrid.innerHTML = '';
  stopLocalStreamIfIdle();
}

// ===========================================================
// AİLE ODASI (grup görüşmesi — mesh bağlantı)
// ===========================================================

function listenFamilyRoom() {
  db.collection('rooms').doc('family').collection('participants').onSnapshot(snap => {
    const names = [];
    snap.forEach(d => { if (d.id !== currentUser.uid) names.push(d.data().name); });

    if (snap.size === 0) {
      roomStatusEl.textContent = 'Kimse odada değil';
    } else {
      roomStatusEl.textContent = snap.size + ' kişi odada' + (names.length ? ': ' + names.join(', ') : ' (sadece sen)');
    }

    if (inFamilyRoom) {
      snap.docChanges().forEach(change => {
        const uid = change.doc.id;
        if (uid === currentUser.uid) return;
        if (change.type === 'added') {
          connectFamilyPeer(uid, change.doc.data().name);
        } else if (change.type === 'removed') {
          closePeer(uid);
        }
      });
    }
  });
}

joinRoomBtn.addEventListener('click', () => {
  if (inFamilyRoom) {
    leaveFamilyRoom();
  } else {
    joinFamilyRoom();
  }
});

async function joinFamilyRoom() {
  if (currentCallId) {
    showToast('Önce mevcut aramayı kapat.');
    return;
  }
  try {
    await getLocalStream();
  } catch (e) {
    showToast('Mikrofona erişilemedi. Tarayıcı izinlerini kontrol et.');
    return;
  }

  inFamilyRoom = true;
  joinRoomBtn.textContent = 'Odadan ayrıl';
  activeCallLabel.textContent = 'Aile
