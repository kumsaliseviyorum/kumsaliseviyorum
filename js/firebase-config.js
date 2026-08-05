/* ===========================================================
   FIREBASE AYARLARI
   =========================================================== */

const firebaseConfig = {
  apiKey: "AIzaSyDmQamYAipAOEiixHS9rXA3yXDViboYO8A",
  authDomain: "uygulama-77eb7.firebaseapp.com",
  projectId: "uygulama-77eb7",
  storageBucket: "uygulama-77eb7.firebasestorage.app",
  messagingSenderId: "738983781389",
  appId: "1:738983781389:web:681ffd17887479c8342144"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
