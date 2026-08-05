/* ===========================================================
   app.js — Giriş / kayıt, sekme geçişleri, üye listesi ve
   çevrimiçi durumu (presence) yönetimi.
   =========================================================== */

let currentUser = null; // { uid, name, email }

// ---------- DOM referansları ----------
const authScreen = document.getElementById('authScreen');
const appScreen = document.getElementById('appScreen');

const authTabs = document.querySelectorAll('.auth-tab');
const authForms = document.querySelectorAll('.auth-form');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const loginError = document.getElementById('loginError');
const registerError = document.getElementById('registerError');

const logoutBtn = document.getElementById('logoutBtn');
const tabBtns = document.querySelectorAll('.tab-btn');
const views = document.querySelectorAll('.view');
const memberListEl = document.getElementById('memberList');
const toastEl = document.getElementById('toast');

// ---------- Yardımcılar ----------
function showToast(msg, ms = 2600) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toastEl.classList.add('hidden'), ms);
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// ---------- Giriş / Kayıt sekme geçişi ----------
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    authForms.forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById(tab.dataset.tab + 'Form').classList.add('active');
  });
});

// ---------- Kayıt ol ----------
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  registerError.textContent = '';
  const name = document.getElementById('registerName').value.trim();
  const email = document.getElementById('registerEmail').value.trim();
  const password = document.getElementById('registerPassword').value;

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName: name });
    await db.collection('users').doc(cred.user.uid).set({
      name,
      email,
      online: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    registerError.textContent = translateAuthError(err);
  }
});

// ---------- Giriş yap ----------
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    loginError.textContent = translateAuthError(err);
  }
});

function translateAuthError(err) {
  const map = {
    'auth/email-already-in-use': 'Bu e-posta zaten kayıtlı.',
    'auth/invalid-email': 'Geçersiz e-posta adresi.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalı.',
    'auth/user-not-found': 'Kullanıcı bulunamadı.',
    'auth/wrong-password': 'Şifre hatalı.',
    'auth/invalid-credential': 'E-posta veya şifre hatalı.',
    'auth/network-request-failed': 'İnternet bağlantısı sorunu.'
  };
  return map[err.code] || ('Bir hata oluştu: ' + err.message);
}

// ---------- Çıkış ----------
logoutBtn.addEventListener('click', async () => {
  if (currentUser) {
    await db.collection('users').doc(currentUser.uid).update({
      online: false,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(() => {});
  }
  await auth.signOut();
});

// ---------- Sekme (Sohbet / Arama) geçişi ----------
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    views.forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.view).classList.add('active');
  });
});

// ---------- Oturum durumu izleyici ----------
let unsubscribeUsers = null;

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = { uid: user.uid, name: user.displayName || 'Aile üyesi', email: user.email };

    await db.collection('users').doc(user.uid).set({
      name: currentUser.name,
      email: currentUser.email,
      online: true,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    authScreen.classList.remove('active');
    appScreen.classList.add('active');

    listenMembers();
    if (typeof startChatListener === 'function') startChatListener();
    if (typeof initCallFeature === 'function') initCallFeature();

    // Sekme/tarayıcı kapatılırken çevrimdışı işaretle
    window.addEventListener('beforeunload', () => {
      navigator.sendBeacon && db.collection('users').doc(user.uid).update({ online: false });
    });
  } else {
    currentUser = null;
    appScreen.classList.remove('active');
    authScreen.classList.add('active');
    if (unsubscribeUsers) unsubscribeUsers();
  }
});

// ---------- Üye listesi (canlı) ----------
function listenMembers() {
  if (unsubscribeUsers) unsubscribeUsers();
  unsubscribeUsers = db.collection('users').orderBy('name').onSnapshot(snap => {
    memberListEl.innerHTML = '';
    snap.forEach(doc => {
      const u = doc.data();
      const uid = doc.id;
      if (uid === currentUser.uid) return; // kendini listeleme

      const li = document.createElement('li');
      li.className = 'member-item';
      li.innerHTML = `
        <div class="member-left">
          <div class="avatar">${initials(u.name)}</div>
          <div>
            <div class="member-name">${escapeHtml(u.name || 'Aile üyesi')}</div>
            <div class="member-status">
              <span class="status-dot ${u.online ? 'online' : ''}"></span>
              ${u.online ? 'Çevrimiçi' : 'Çevrimdışı'}
            </div>
          </div>
        </div>
        <button
