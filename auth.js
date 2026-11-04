import { auth } from "./firebase-config.js";
import { 
  sendPasswordResetEmail, 
  signOut, 
  sendEmailVerification 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// 1. Send Password Reset / Verification Link
export async function sendOtpEmail(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    alert("An OTP / verification link has been sent to your Gmail inbox!");
  } catch (error) {
    console.error("Error sending OTP:", error);
    alert(error.message);
  }
}

// 2. Send Email Verification (for new account registration)
export async function sendVerificationLink(user) {
  try {
    await sendEmailVerification(user);
    alert("Verification email sent to your Gmail inbox!");
  } catch (error) {
    console.error("Error sending verification email:", error);
    alert(error.message);
  }
}

// 3. Logout Logic
export async function handleLogout() {
  try {
    await signOut(auth);
    alert("Logged out successfully!");
    window.location.hash = "#home";
  } catch (error) {
    console.error("Logout Error:", error);
  }
}
import { auth } from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  sendEmailVerification 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// Register user and send verification email
export async function registerWithEmail(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Send Firebase verification link to Gmail
    await sendEmailVerification(user);
    alert("Account created successfully! A verification link has been sent to your Gmail inbox. Please verify before logging in.");
    
    await signOut(auth); // Sign out until verified
    window.location.hash = "account";
  } catch (error) {
    console.error("Registration Error:", error);
    alert(error.message);
  }
}