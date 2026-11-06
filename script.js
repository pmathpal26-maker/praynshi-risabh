import { auth, db } from "./firebase-config.js";
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendEmailVerification,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updatePassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot,
  doc, 
  updateDoc, 
  deleteDoc,
  query, 
  where,
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let checkoutItem = { title: "", price: 0 };
let stopWatchingWinner = null;
let winnerEndTimer = null;
let winnerWatchGeneration = 0;
let verificationInterval = null;
let verificationTimeout = null;
let countdownInterval = null;

// --- Routing ---
function handleRoute() {
  const hash = window.location.hash.replace("#", "") || "home";

  if (auth.currentUser && !auth.currentUser.emailVerified && hash !== "verify-wait") {
    window.location.hash = "verify-wait";
    return;
  }

  const views = document.querySelectorAll(".view");
  views.forEach((view) => {
    if (view.id === hash) {
      view.classList.add("active");
    } else {
      view.classList.remove("active");
    }
  });

  if (hash === "catalog") {
    loadAuctions();
  } else if (hash === "myvault") {
    loadMyVault();
  } else if (hash === "verify-wait") {
    setupVerificationScreen();
  }
}

window.addEventListener("hashchange", handleRoute);
window.addEventListener("DOMContentLoaded", () => {
  handleRoute();
  setupAuthUI();
  completePendingEmailLinkSignIn();
  setupAuctionForm();
  setupFilters();
  setupCheckout();
});

// --- Auth Handling with Inline Interface Gmail Validation ---
let isRegisterMode = false;

function setupAuthUI() {
  const authForm = document.getElementById("login-form");
  const authHeading = document.getElementById("auth-heading");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const toggleAuthMode = document.getElementById("toggle-auth-mode");
  const authNavLink = document.getElementById("auth-nav-link");
  const emailInput = document.getElementById("auth-email");
  const emailError = document.getElementById("auth-email-error");
  const passwordField = document.getElementById("auth-password-field");
  const passwordInput = document.getElementById("auth-password");
  const registrationHelp = document.getElementById("registration-help");
  const setPasswordForm = document.getElementById("set-password-form");
  const setPasswordInput = document.getElementById("set-password");
  const setPasswordError = document.getElementById("set-password-error");

  const showEmailError = (message) => {
    if (emailError) {
      emailError.textContent = message;
      emailError.style.display = "block";
    }
    if (emailInput) {
      emailInput.setAttribute("aria-invalid", "true");
    }
  };

  const clearEmailError = () => {
    if (emailError) {
      emailError.style.display = "none";
      emailError.textContent = "";
    }
    if (emailInput) {
      emailInput.removeAttribute("aria-invalid");
    }
  };

  if (emailInput) {
    emailInput.addEventListener("input", clearEmailError);
  }

  if (toggleAuthMode && authForm) {
    toggleAuthMode.addEventListener("click", () => {
      isRegisterMode = !isRegisterMode;
      authHeading.textContent = isRegisterMode ? "Create Account" : "Sign In";
      authSubmitBtn.textContent = isRegisterMode ? "Register" : "Login";
      if (passwordField) passwordField.hidden = isRegisterMode;
      if (passwordInput) passwordInput.required = !isRegisterMode;
      if (registrationHelp) registrationHelp.hidden = !isRegisterMode;
      toggleAuthMode.textContent = isRegisterMode
        ? "Already have an account? Sign In"
        : "Don't have an account? Register";

      clearEmailError();
    });

    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = emailInput ? emailInput.value.trim() : "";
      const password = passwordInput ? passwordInput.value : "";

      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/;
      if (!gmailRegex.test(email)) {
        showEmailError("Enter a valid Gmail address ending with @gmail.com.");
        if (emailInput) emailInput.focus();
        return;
      }

      clearEmailError();
      if (isSignInWithEmailLink(auth, window.location.href)) {
        await completeEmailLinkSignIn(email);
        return;
      }

      if (isRegisterMode) {
        try {
          const actionCodeSettings = {
            url: `${window.location.origin}${window.location.pathname}#account`,
            handleCodeInApp: true
          };
          await sendSignInLinkToEmail(auth, email, actionCodeSettings);
          window.sessionStorage.setItem("emailForSignIn", email);
          showEmailError("Verification link sent. Open it to verify your email and finish registration.");
          return;
        } catch (error) {
          console.error("Email link error:", error);
          showEmailError("Could not send the verification link. Check the email and try again.");
          return;
        }
      }

      if (!password) {
        showEmailError("Enter your password.");
        if (passwordInput) passwordInput.focus();
        return;
      }

      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
          alert("Please verify your Gmail address via the link sent to your inbox before logging in.");
          watchEmailVerification(user);
          return;
        }

        alert("Logged in successfully!");
        window.location.hash = "catalog";
      } catch (error) {
        const authErrorMessages = {
          "auth/invalid-email": "Firebase rejected this email address. Check it and try again.",
          "auth/user-not-found": "No account was found for this Gmail address.",
          "auth/email-already-in-use": "An account already uses this Gmail address. Try signing in.",
          "auth/invalid-credential": "Email or password is incorrect.",
          "auth/wrong-password": "Email or password is incorrect.",
          "auth/weak-password": "Choose a stronger password and try again.",
          "auth/too-many-requests": "Too many attempts. Wait a moment and try again."
        };
        console.error("Authentication Error:", error);
        showEmailError(authErrorMessages[error.code] || "Authentication failed. Please try again.");
      }
    });
  }

  if (setPasswordForm && setPasswordInput) {
    setPasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!auth.currentUser || !auth.currentUser.emailVerified) {
        if (setPasswordError) {
          setPasswordError.textContent = "Verify your email before setting a password.";
          setPasswordError.style.display = "block";
        }
        return;
      }

      try {
        await updatePassword(auth.currentUser, setPasswordInput.value);
        if (setPasswordError) setPasswordError.style.display = "none";
        window.sessionStorage.removeItem("emailForSignIn");
        alert("Email verified and account created successfully.");
        window.location.hash = "catalog";
      } catch (error) {
        console.error("Password setup error:", error);
        if (setPasswordError) {
          setPasswordError.textContent = error.code === "auth/weak-password"
            ? "Choose a stronger password (at least 6 characters)."
            : "Could not set your password. Please try again.";
          setPasswordError.style.display = "block";
        }
      }
    });
  }

  onAuthStateChanged(auth, (user) => {
    const loggedOutUI = document.getElementById('logged-out-ui');
    const loggedInUI = document.getElementById('logged-in-ui');
    const userEmailText = document.getElementById('user-display-email');

    if (user) {
      if (!user.emailVerified) {
        watchEmailVerification(user);
      } else {
        clearVerificationTimers();
      }

      if (loggedOutUI) loggedOutUI.style.display = 'none';
      if (loggedInUI) loggedInUI.style.display = 'flex';
      if (userEmailText) userEmailText.textContent = user.email || 'User';

      if (authNavLink) {
        authNavLink.textContent = "Sign Out (" + user.email.split("@")[0] + ")";
        authNavLink.onclick = (e) => {
          e.preventDefault();
          clearVerificationTimers();
          signOut(auth);
        };
      }
    } else {
      clearVerificationTimers();
      if (loggedOutUI) loggedOutUI.style.display = 'block';
      if (loggedInUI) loggedInUI.style.display = 'none';

      if (authNavLink) {
        authNavLink.textContent = "Account";
        authNavLink.onclick = null;
        authNavLink.setAttribute("href", "#account");
      }
    }
    checkWinnerStatus(user);
  });

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        clearVerificationTimers();
        await signOut(auth);
        alert("Logged out successfully!");
        window.location.hash = "#home";
      } catch (error) {
        console.error("Logout Error:", error);
      }
    });
  }
}

async function completePendingEmailLinkSignIn() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;

  const email = window.sessionStorage.getItem("emailForSignIn");
  if (email) {
    await completeEmailLinkSignIn(email);
    return;
  }

  const emailError = document.getElementById("auth-email-error");
  if (emailError) {
    emailError.textContent = "Enter the email address where you received the verification link.";
    emailError.style.display = "block";
  }
}

async function completeEmailLinkSignIn(email) {
  const emailError = document.getElementById("auth-email-error");
  const authForm = document.getElementById("login-form");
  const toggleAuthMode = document.getElementById("toggle-auth-mode");
  const authHeading = document.getElementById("auth-heading");
  const setPasswordForm = document.getElementById("set-password-form");
  const setPasswordInput = document.getElementById("set-password");

  try {
    await signInWithEmailLink(auth, email, window.location.href);
    window.sessionStorage.removeItem("emailForSignIn");
    if (authForm) authForm.hidden = true;
    if (toggleAuthMode) toggleAuthMode.hidden = true;
    if (authHeading) authHeading.textContent = "Email verified — set a password";
    if (setPasswordForm) setPasswordForm.hidden = false;
    if (setPasswordInput) setPasswordInput.focus();
    window.history.replaceState({}, document.title, `${window.location.pathname}#account`);
  } catch (error) {
    console.error("Email link sign-in error:", error);
    if (emailError) {
      const emailLinkErrors = {
        "auth/expired-action-code": "This verification link has expired. Request a new one.",
        "auth/invalid-action-code": "This verification link is invalid or expired. Request a new one.",
        "auth/email-already-in-use": "This email already has an account. Sign in instead.",
        "auth/operation-not-allowed": "Email link sign-in is not enabled for this Firebase project."
      };
      emailError.textContent = emailLinkErrors[error.code] || "Could not verify this email link. Request a new one and try again.";
      emailError.style.display = "block";
    }
  }
}

// --- Verification Screen Controls & Polling Watcher ---
function setupVerificationScreen() {
  const resendBtn = document.getElementById("btn-resend-verification");
  const cancelBtn = document.getElementById("btn-cancel-verify");

  if (resendBtn && auth.currentUser) {
    resendBtn.onclick = async () => {
      try {
        await sendEmailVerification(auth.currentUser);
        alert("Verification email resent! Please check your Gmail.");
        watchEmailVerification(auth.currentUser);
      } catch (err) {
        alert("Error resending email: " + err.message);
      }
    };
  }

  if (cancelBtn) {
    cancelBtn.onclick = async () => {
      clearVerificationTimers();
      await signOut(auth);
      window.location.hash = "account";
    };
  }
}

function clearVerificationTimers() {
  if (verificationInterval) clearInterval(verificationInterval);
  if (verificationTimeout) clearTimeout(verificationTimeout);
  if (countdownInterval) clearInterval(countdownInterval);
  verificationInterval = null;
  verificationTimeout = null;
  countdownInterval = null;
}

function watchEmailVerification(user) {
  clearVerificationTimers();
  window.location.hash = "verify-wait";

  let timeLeft = 60;
  const timerDisplay = document.getElementById("verification-timer");

  if (timerDisplay) {
    timerDisplay.textContent = `Time remaining: 1:00`;
  }

  countdownInterval = setInterval(() => {
    timeLeft--;
    if (timerDisplay) {
      const mins = Math.floor(timeLeft / 60);
      const secs = timeLeft % 60;
      timerDisplay.textContent = `Time remaining: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
  }, 1000);

  verificationInterval = setInterval(async () => {
    try {
      await user.reload();
      if (user.emailVerified) {
        clearVerificationTimers();
        alert("Email verified successfully! Welcome to the PROPHUNT Vault.");
        window.location.hash = "catalog";
      }
    } catch (err) {
      console.error("Error checking verification status:", err);
    }
  }, 3000);

  verificationTimeout = setTimeout(async () => {
    clearVerificationTimers();
    try {
      if (auth.currentUser) {
        await signOut(auth);
      }
    } catch (e) {
      console.error("Signout error on timeout:", e);
    }
    alert("Verification time expired. Please register again.");
    window.location.hash = "account";
  }, 60000);
}

// --- Create Auction with Description & Image Compression ---
function setupAuctionForm() {
  const form = document.getElementById("create-auction-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!auth.currentUser) {
      alert("Please sign in to publish an auction.");
      window.location.hash = "account";
      return;
    }

    const title = document.getElementById("prop-title").value;
    const category = document.getElementById("prop-category").value;
    const price = parseFloat(document.getElementById("prop-price").value);
    const description = document.getElementById("prop-description") ? document.getElementById("prop-description").value : "";
    const fileInput = document.getElementById("prop-image-file");
    const startTimeInput = document.getElementById("prop-start-time").value;
    const endTimeInput = document.getElementById("prop-end-time").value;

    const file = fileInput.files[0];
    if (!file) {
      alert("Please select an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = function (evt) {
      const img = new Image();
      img.onload = async function () {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        
        const maxSize = 600;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxSize) { height *= maxSize / width; width = maxSize; }
        } else {
          if (height > maxSize) { width *= maxSize / height; height = maxSize; }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        
        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);

        try {
          await addDoc(collection(db, "auctions"), {
            title,
            category,
            description,
            currentBid: price,
            highestBidderId: "",
            highestBidderEmail: "",
            imageUrl: compressedDataUrl,
            sellerId: auth.currentUser.uid,
            sellerEmail: auth.currentUser.email,
            startTime: new Date(startTimeInput).getTime(),
            endTime: new Date(endTimeInput).getTime(),
            createdAt: Date.now()
          });

          const tickerText = document.getElementById("ticker-text");
          if (tickerText) {
            tickerText.textContent = `🔥 NEW LISTING: ${title} (${category}) starting at $${price}! Place bids now!`;
            tickerText.dataset.locked = "true";
          }

          alert("Auction published successfully!");
          form.reset();
          window.location.hash = "catalog";
        } catch (err) {
          alert("Failed to create auction: " + err.message);
        }
      };
      img.src = evt.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// --- Load & Display Auctions across Upcoming, Live, and Ended Grids ---
async function loadAuctions() {
  const liveGrid = document.getElementById("auction-grid");
  const upcomingGrid = document.getElementById("upcoming-grid");
  const endedGrid = document.getElementById("ended-grid");
  const filterDropdown = document.getElementById("franchise-filter");
  const filterVal = filterDropdown ? filterDropdown.value : "all";

  if (!liveGrid) return;
  
  liveGrid.innerHTML = "<p>Loading live items...</p>";
  if (upcomingGrid) upcomingGrid.innerHTML = "<p>Loading upcoming items...</p>";
  if (endedGrid) endedGrid.innerHTML = "<p>Loading ended items...</p>";

  const now = Date.now();
  try {
    const q = query(collection(db, "auctions"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    
    liveGrid.innerHTML = "";
    if (upcomingGrid) upcomingGrid.innerHTML = "";
    if (endedGrid) endedGrid.innerHTML = "";
    
    renderRecommendations(querySnapshot.docs, filterVal);

    if (querySnapshot.empty) {
      liveGrid.innerHTML = "<p>No auctions found in the vault.</p>";
      if (upcomingGrid) upcomingGrid.innerHTML = "<p>No upcoming auctions.</p>";
      if (endedGrid) endedGrid.innerHTML = "<p>No previous auctions.</p>";
      return;
    }

    let liveCount = 0;
    let upcomingCount = 0;
    let endedCount = 0;
    let isFirstDoc = true;

    for (const docSnap of querySnapshot.docs) {
      const data = docSnap.data();

      if (isFirstDoc) {
        const tickerText = document.getElementById("ticker-text");
        if (tickerText && tickerText.dataset.locked !== "true") {
          tickerText.textContent = `🔴 LATEST VAULT ITEM: ${data.title} (${data.category}) - Current Bid: $${data.currentBid}`;
        }
        isFirstDoc = false;
      }

      if (filterVal !== "all" && data.category !== filterVal) {
        continue;
      }

      const startTimeNum = Number(data.startTime) || 0;
      const endTimeNum = Number(data.endTime) || 0;
      const isUpcoming = startTimeNum > 0 && now < startTimeNum;
      const isEnded = Number(data.endTime) > 0 && Date.now() > Number(data.endTime);
      const isSeller = auth.currentUser && auth.currentUser.uid === data.sellerId;

      const card = createAuctionCard(docSnap.id, data, isUpcoming, isEnded, isSeller, now);

      if (isUpcoming) {
        upcomingCount++;
        if (upcomingGrid) upcomingGrid.appendChild(card);
      } else if (isEnded) {
        endedCount++;
        if (endedGrid) endedGrid.appendChild(card);
      } else {
        liveCount++;
        liveGrid.appendChild(card);
      }
    }

    if (liveCount === 0) liveGrid.innerHTML = "<p>No live auctions right now.</p>";
    if (upcomingGrid && upcomingCount === 0) upcomingGrid.innerHTML = "<p>No upcoming auctions scheduled.</p>";
    if (endedGrid && endedCount === 0) endedGrid.innerHTML = "<p>No previous auctions in this category.</p>";

    attachCardEventListeners();

  } catch (err) {
    liveGrid.innerHTML = "<p>Error loading items: " + err.message + "</p>";
  }
}

// Helper to construct auction cards
function createAuctionCard(auctionId, data, isUpcoming, isEnded, isSeller, now) {
  const card = document.createElement("div");
  card.className = "card";

  const startTimeNum = Number(data.startTime) || 0;
  const endTimeNum = Number(data.endTime) || 0;

  let timeLeftText = "";
  if (isUpcoming) {
    timeLeftText = `⏱️ Starts at: ${new Date(startTimeNum).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
  } else if (isEnded) {
    timeLeftText = "Status: Auction Ended";
  } else if (endTimeNum > 0) {
    const diff = endTimeNum - now;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);
    timeLeftText = `⏱️ Ends in: ${hours}h ${mins}m ${secs}s`;
  } else {
    timeLeftText = "⏱️ Time Left: N/A";
  }

  card.innerHTML = `
    <img src="${data.imageUrl}" alt="${data.title}">
    <div class="card-body">
      <h3>${data.title}</h3>
      <p style="color: var(--text-muted); font-size: 0.85rem;">Category: ${data.category}</p>
      <p style="color: var(--text-muted); font-size: 0.85rem;">Seller: ${data.sellerEmail ? data.sellerEmail.split('@')[0] : 'Vault'}</p>
      <p style="font-size: 1.3rem; font-weight: bold; color: var(--accent-cyan); margin: 0.3rem 0;">Current: $${data.currentBid}</p>
      <p class="auction-timer" data-end="${endTimeNum}" style="color: var(--accent-magenta); font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem;">${timeLeftText}</p>
      ${
        isSeller
          ? `<div style="display: flex; gap: 0.5rem; flex-direction: column;">
               <button class="cta-btn" disabled style="opacity:0.6; cursor:not-allowed; width:100%;">Your Listing</button>
               <button class="cta-btn delete-auction-btn" data-id="${auctionId}" style="background: #ff3333; padding: 0.5rem 1rem; width:100%;">Delete Auction</button>
             </div>`
          : isEnded
          ? `<button class="cta-btn" disabled style="opacity:0.5; background:#222; color:#888; width:100%;">Auction Ended</button>`
          : isUpcoming
          ? `<button class="cta-btn" disabled style="opacity:0.5; background:#444; width:100%;">Starts: ${new Date(startTimeNum).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</button>`
          : `<div class="custom-bid-wrapper">
               <input type="number" class="custom-bid-input" min="${data.currentBid + 1}" value="${data.currentBid + 10}" placeholder="Amount">
               <button class="cta-btn custom-bid-btn" data-id="${auctionId}" data-current="${data.currentBid}" data-title="${data.title}" data-category="${data.category}" data-image="${data.imageUrl}" style="padding: 0.6rem 1rem; flex: 1;">Place Bid</button>
             </div>`
      }
    </div>
  `;

  card.addEventListener("click", (e) => {
    if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
    openProductModal(auctionId, data, isUpcoming, isEnded, isSeller);
  });

  return card;
}

function attachCardEventListeners() {
  document.querySelectorAll(".custom-bid-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const auctionId = e.target.dataset.id;
      const currentPrice = parseFloat(e.target.dataset.current);
      const inputField = e.target.previousElementSibling;
      const userBid = parseFloat(inputField.value);

      if (isNaN(userBid) || userBid <= currentPrice) {
        alert(`Your bid must be higher than the current price ($${currentPrice}).`);
        return;
      }

      const auctionData = {
        title: e.target.dataset.title,
        category: e.target.dataset.category,
        imageUrl: e.target.dataset.image
      };

      handleCustomBid(auctionId, userBid, auctionData);
    });
  });

  document.querySelectorAll(".delete-auction-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const auctionId = e.target.dataset.id;
      if (confirm("Are you sure you want to delete your auction listing?")) {
        await deleteAuction(auctionId);
      }
    });
  });
}

// --- Strict Category-Filtered Recommendations ---
function renderRecommendations(auctionDocs, category) {
  const grid = document.getElementById("recommendations-grid");
  if (!grid) return;

  const now = Date.now();
  const recommendedDocs = auctionDocs.filter((auctionDoc) => {
    const data = auctionDoc.data();
    const matchesCategory = category === "all" || data.category === category;
    const endTimeNum = Number(data.endTime) || 0;
    const isNotEnded = endTimeNum === 0 || endTimeNum > now;
    return matchesCategory && isNotEnded;
  }).slice(0, 4);

  if (recommendedDocs.length === 0) {
    grid.innerHTML = `<p>No recommendations available for "${category}" category yet.</p>`;
    return;
  }

  grid.replaceChildren();
  for (const auctionDoc of recommendedDocs) {
    const data = auctionDoc.data();
    const card = document.createElement("article");
    card.className = "card";

    if (data.imageUrl) {
      const image = document.createElement("img");
      image.src = data.imageUrl;
      image.alt = data.title || "Auction item";
      card.appendChild(image);
    }

    const body = document.createElement("div");
    body.className = "card-body";

    const title = document.createElement("h3");
    title.textContent = data.title || "Untitled item";
    body.appendChild(title);

    const categoryLabel = document.createElement("p");
    categoryLabel.textContent = `Category: ${data.category || "Uncategorized"}`;
    body.appendChild(categoryLabel);

    const price = document.createElement("p");
    price.className = "price";
    price.textContent = `Current bid: $${data.currentBid ?? "N/A"}`;
    body.appendChild(price);

    card.appendChild(body);
    card.addEventListener("click", () => {
      const startTimeNum = Number(data.startTime) || 0;
      const endTimeNum = Number(data.endTime) || 0;
      const isUpcoming = startTimeNum > 0 && now < startTimeNum;
      const isEnded = Number(data.endTime) > 0 && Date.now() > Number(data.endTime);
      const isSeller = auth.currentUser && auth.currentUser.uid === data.sellerId;
      openProductModal(auctionDoc.id, data, isUpcoming, isEnded, isSeller);
    });
    grid.appendChild(card);
  }
}

// --- Load My Vault (Won Trophies & All Bidding Activity Records) ---
async function loadMyVault() {
  const wonGrid = document.getElementById("myvault-grid");
  const bidsGrid = document.getElementById("mybids-grid");
  if (!wonGrid || !bidsGrid) return;

  if (!auth.currentUser) {
    wonGrid.innerHTML = "<p>Please sign in to view your Vault Trophies.</p>";
    bidsGrid.innerHTML = "<p>Please sign in to view your Bidding Activity.</p>";
    return;
  }

  wonGrid.innerHTML = "<p>Loading won items...</p>";
  bidsGrid.innerHTML = "<p>Loading bidding history records...</p>";
  const now = Date.now();

  try {
    // 1. Fetch Won Trophies
    const auctionSnapshot = await getDocs(collection(db, "auctions"));
    wonGrid.innerHTML = "";
    let wonCount = 0;

    auctionSnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const endTimeNum = Number(data.endTime) || 0;
      if (
        endTimeNum > 0 &&
        now > endTimeNum &&
        data.highestBidderId === auth.currentUser.uid &&
        data.sellerId !== auth.currentUser.uid
      ) {
        wonCount++;
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <img src="${data.imageUrl}" alt="${data.title}">
          <div class="card-body">
            <h3>${data.title}</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Category: ${data.category}</p>
            <p style="font-size: 1.2rem; font-weight: bold; color: var(--accent-cyan); margin: 0.5rem 0;">Secured at: $${data.currentBid}</p>
            <button class="cta-btn" disabled style="background: #3ddc97; color: #000; width: 100%;">🛡️ Stored in Vault</button>
          </div>
        `;
        wonGrid.appendChild(card);
      }
    });

    if (wonCount === 0) {
      wonGrid.innerHTML = "<p>Your vault trophies are empty. Win an auction to store props here!</p>";
    }

    // 2. Fetch All Bidding Activity Records (Even if not won)
    const bidsQuery = query(
      collection(db, "bids"),
      where("userId", "==", auth.currentUser.uid),
      orderBy("timestamp", "desc")
    );
    const bidsSnapshot = await getDocs(bidsQuery);
    bidsGrid.innerHTML = "";

    if (bidsSnapshot.empty) {
      bidsGrid.innerHTML = "<p>You haven't placed any bids yet.</p>";
    } else {
      bidsSnapshot.forEach((docSnap) => {
        const bidData = docSnap.data();
        const card = document.createElement("div");
        card.className = "card";
        card.innerHTML = `
          <img src="${bidData.imageUrl}" alt="${bidData.title}">
          <div class="card-body">
            <h3>${bidData.title}</h3>
            <p style="color: var(--text-muted); font-size: 0.85rem;">Category: ${bidData.category || 'General'}</p>
            <p style="font-size: 1.1rem; font-weight: bold; color: var(--accent-magenta); margin: 0.4rem 0;">Your Bid: $${bidData.bidAmount}</p>
            <p style="font-size: 0.75rem; color: var(--text-muted);">Placed on: ${new Date(bidData.timestamp).toLocaleString()}</p>
          </div>
        `;
        bidsGrid.appendChild(card);
      });
    }

  } catch (err) {
    wonGrid.innerHTML = "<p>Error loading vault: " + err.message + "</p>";
    bidsGrid.innerHTML = "<p>Error loading bidding history.</p>";
  }
}

// --- Live Countdown Ticker ---
setInterval(() => {
  const timers = document.querySelectorAll(".auction-timer");
  const now = Date.now();

  timers.forEach((timerElem) => {
    const endTime = parseInt(timerElem.dataset.end);
    if (!endTime) return;

    const diff = endTime - now;
    if (diff <= 0) {
      timerElem.textContent = "⏱️ Status: Auction Ended";
      timerElem.style.color = "#8a8a9e";
    } else {
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);
      timerElem.textContent = `⏱️ Ends in: ${hours}h ${mins}m ${secs}s`;
    }
  });
}, 1000);

async function deleteAuction(auctionId) {
  try {
    await deleteDoc(doc(db, "auctions", auctionId));
    alert("Auction listing successfully deleted.");
    loadAuctions();
  } catch (err) {
    alert("Failed to delete auction: " + err.message);
  }
}

async function handleCustomBid(auctionId, customAmount, auctionData) {
  if (!auth.currentUser) {
    alert("Please sign in to place a bid.");
    window.location.hash = "account";
    return;
  }

  try {
    const auctionRef = doc(db, "auctions", auctionId);
    await updateDoc(auctionRef, {
      currentBid: customAmount,
      highestBidderId: auth.currentUser.uid,
      highestBidderEmail: auth.currentUser.email
    });

    // Save bid record to 'bids' collection so it appears in bidding history
    await addDoc(collection(db, "bids"), {
      auctionId,
      title: auctionData.title,
      category: auctionData.category || "General",
      imageUrl: auctionData.imageUrl,
      bidAmount: customAmount,
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email,
      timestamp: Date.now()
    });

    alert(`Bid of $${customAmount} placed successfully!`);
    loadAuctions();
  } catch (err) {
    alert("Bid Error: " + err.message);
  }
}

function openProductModal(auctionId, data, isUpcoming, isEnded, isSeller) {
  const modal = document.getElementById("product-modal");
  if (!modal) return;

  document.getElementById("modal-item-img").src = data.imageUrl;
  document.getElementById("modal-item-title").textContent = data.title;
  document.getElementById("modal-item-category").textContent = `Franchise Category: ${data.category}`;
  document.getElementById("modal-item-seller").textContent = `Curated by: ${data.sellerEmail ? data.sellerEmail.split('@')[0] : 'Vault Archive'}`;
  document.getElementById("modal-item-price").textContent = data.currentBid;
  
  const descElem = document.getElementById("modal-item-desc");
  if (descElem) {
    descElem.textContent = data.description || "Screen-authenticated cinematic prop collectible with certified studio provenance. Maintained in secure archival vault storage.";
  }

  const modalFoot = modal.querySelector(".modal-foot");
  if (!modalFoot) return;
  const priceLabel = modalFoot.querySelector(".modal-price");
  if (!priceLabel) return;
  const auctionHasEnded = Number(data.endTime) > 0 && Date.now() > Number(data.endTime);

  const modalActions = document.createElement("div");
  modalActions.style.display = "flex";
  modalActions.style.gap = "0.5rem";
  modalActions.style.flex = "1";
  modalActions.style.width = "100%";

  if (isEnded || auctionHasEnded) {
    modalActions.innerHTML = `<button class="cta-btn" disabled style="opacity:0.5; background:#222; color:#888; width:100%;">Auction Ended</button>`;
  } else if (isSeller) {
    modalActions.innerHTML = `
      <button id="modal-delete-btn" class="cta-btn" style="background: #ff3333; width: 100%;">Delete My Auction Listing</button>
    `;
    document.getElementById("modal-delete-btn").onclick = async () => {
      if (confirm("Are you sure you want to delete this auction?")) {
        await deleteAuction(auctionId);
        modal.style.display = "none";
      }
    };
  } else if (isUpcoming) {
    modalActions.innerHTML = `<button class="cta-btn" disabled style="opacity:0.5; width:100%;">Auction Not Started</button>`;
  } else {
    modalActions.innerHTML = `
      <div style="display: flex; gap: 0.5rem; width: 100%;">
        <input type="number" id="modal-custom-input" class="custom-bid-input" min="${data.currentBid + 1}" value="${data.currentBid + 10}" style="flex: 1; padding: 0.8rem;">
        <button id="modal-submit-bid" class="cta-btn" style="flex: 1;">Submit Bid</button>
      </div>
    `;
    
    document.getElementById("modal-submit-bid").onclick = async () => {
      const userBid = parseFloat(document.getElementById("modal-custom-input").value);
      if (isNaN(userBid) || userBid <= data.currentBid) {
        alert(`Bid must exceed current price ($${data.currentBid}).`);
        return;
      }
      await handleCustomBid(auctionId, userBid, data);
      modal.style.display = "none";
    };
  }
  modalFoot.replaceChildren(priceLabel, modalActions);

  modal.style.display = "flex";

  document.getElementById("close-modal").onclick = () => {
    modal.style.display = "none";
  };

  window.onclick = (event) => {
    if (event.target === modal) {
      modal.style.display = "none";
    }
  };
}

// --- Winner Notification ---
function checkWinnerStatus(user) {
  const generation = ++winnerWatchGeneration;
  if (stopWatchingWinner) {
    stopWatchingWinner();
    stopWatchingWinner = null;
  }
  clearTimeout(winnerEndTimer);
  winnerEndTimer = null;

  const banner = document.getElementById("winner-banner");
  const wonName = document.getElementById("won-item-name");
  const buyBtn = document.getElementById("buy-now-btn");

  if (banner) banner.style.display = "none";
  if (wonName) wonName.textContent = "";
  if (buyBtn) buyBtn.onclick = null;
  checkoutItem = { title: "", price: 0 };

  if (!user) return;

  let auctions = [];
  const refreshWinnerStatus = () => {
    if (
      generation !== winnerWatchGeneration ||
      auth.currentUser?.uid !== user.uid
    ) return;

    const now = Date.now();
    let winningAuction = null;
    let nextEndTime = Infinity;

    for (const auction of auctions) {
      const data = auction.data();
      const endTimeNum = Number(data.endTime) || 0;
      if (endTimeNum <= 0) continue;

      if (
        endTimeNum <= now &&
        data.highestBidderId === user.uid &&
        data.sellerId !== user.uid
      ) {
        winningAuction = data;
        break;
      }

      if (endTimeNum > now && endTimeNum < nextEndTime) {
        nextEndTime = endTimeNum;
      }
    }

    if (winningAuction) {
      if (banner) banner.style.display = "block";
      if (wonName) wonName.textContent = `${winningAuction.title} ($${winningAuction.currentBid})`;
      checkoutItem = {
        title: winningAuction.title,
        price: winningAuction.currentBid
      };
      if (buyBtn) {
        buyBtn.onclick = () => {
          if (auth.currentUser?.uid !== user.uid) return;
          document.getElementById("checkout-item-title").textContent = checkoutItem.title;
          document.getElementById("checkout-item-price").textContent = checkoutItem.price;
          window.location.hash = "checkout";
        };
      }
    } else {
      if (banner) banner.style.display = "none";
      if (wonName) wonName.textContent = "";
      checkoutItem = { title: "", price: 0 };
    }

    clearTimeout(winnerEndTimer);
    if (Number.isFinite(nextEndTime)) {
      winnerEndTimer = setTimeout(
        refreshWinnerStatus,
        Math.max(0, nextEndTime - Date.now()) + 1
      );
    }
  };

  stopWatchingWinner = onSnapshot(
    collection(db, "auctions"),
    (snapshot) => {
      if (generation !== winnerWatchGeneration) return;
      auctions = snapshot.docs;
      refreshWinnerStatus();
    },
    (error) => {
      if (generation !== winnerWatchGeneration) return;
      if (banner) banner.style.display = "none";
      console.error("Error watching auction winners:", error);
    }
  );
}

function setupCheckout() {
  const form = document.getElementById("checkout-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Order Confirmed! Prop stored in My Vault.");
    const banner = document.getElementById("winner-banner");
    if (banner) banner.style.display = "none";
    window.location.hash = "myvault";
  });
}

function setupFilters() {
  const filterDropdown = document.getElementById("franchise-filter");
  if (filterDropdown) {
    filterDropdown.addEventListener("change", loadAuctions);
  }
}