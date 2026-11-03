// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC8J1dBHaysJLVqeCWuwFup7MHfjOKlWxA",
  authDomain: "prophunt2-8d216.firebaseapp.com",
  projectId: "prophunt2-8d216",
  storageBucket: "prophunt2-8d216.firebasestorage.app",
  messagingSenderId: "642663628108",
  appId: "1:642663628108:web:d52708da178903a3d7e3e9",
  measurementId: "G-P4C8NJ03VP"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);