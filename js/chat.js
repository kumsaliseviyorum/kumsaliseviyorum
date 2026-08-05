/* ===========================================================
   chat.js — Aile grup sohbeti (tüm üyeler tek bir odada).
   =========================================================== */

const messagesEl = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

let chatUnsub = null;

function startChatListener() {
  if (chatUnsub) chatUnsub();
  chatUnsub = db.collection('messages')
    .orderBy('createdAt', 'asc')
    .limitToLast(200)
    .onSnapshot(snap => {
      messagesEl.innerHTML = '';
      snap.forEach(doc => {
        const m = doc.data();
        renderMessage(m);
      });
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
}

function renderMessage(m) {
  const mine = currentUser && m.uid === currentUser.uid;
  const div = document.createElement('div');
  div.className = 'msg ' + (mine ? 'mine' : 'theirs');
  div.innerHTML = (mine ? '' : `<span class="msg-author">${escapeHtml(m.name || 'Aile üyesi')}</span>`) +
    escapeHtml(m.text || '');
  messagesEl.appendChild(div);
}

messageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !currentUser) return;
  messageInput.value = '';

  try {
    await db.collection('messages').add({
      text,
      uid: currentUser.uid,
      name: currentUser.name,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    showToast('Mesaj gönderilemedi: ' + err.message);
  }
});
