import { auth, db } from "./firebase-config.js";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  collection, 
  addDoc, 
  getDocs, 
  onSnapshot,
  doc, 
  updateDoc, 
  deleteDoc,
  serverTimestamp, 
  query, 
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let checkoutItem = { title: "", price: 0 };
let stopWatchingWinner = null;
let winnerEndTimer = null;
let winnerWatchGeneration = 0;

// --- Routing ---
function handleRoute() {
  const hash = window.location.hash.replace("#", "") || "home";
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
  }
}

window.addEventListener("hashchange", handleRoute);
window.addEventListener("DOMContentLoaded", () => {
  handleRoute();
  setupAuthUI();
  setupAuctionForm();
  setupFilters();
  setupCheckout();
});

// --- Auth Handling ---
let isRegisterMode = false;

function setupAuthUI() {
  const authForm = document.getElementById("login-form");
  const authHeading = document.getElementById("auth-heading");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const toggleAuthMode = document.getElementById("toggle-auth-mode");
  const authNavLink = document.getElementById("auth-nav-link");

  toggleAuthMode.addEventListener("click", () => {
    isRegisterMode = !isRegisterMode;
    authHeading.textContent = isRegisterMode ? "Create Account" : "Sign In";
    authSubmitBtn.textContent = isRegisterMode ? "Register" : "Login";
    toggleAuthMode.textContent = isRegisterMode
      ? "Already have an account? Sign In"
      : "Don't have an account? Register";
  });

  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-email").value;
    const password = document.getElementById("auth-password").value;

    try {
      if (isRegisterMode) {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account created successfully!");
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Logged in successfully!");
      }
      window.location.hash = "catalog";
    } catch (error) {
      alert("Auth Error: " + error.message);
    }
  });

  onAuthStateChanged(auth, (user) => {
    if (user) {
      authNavLink.textContent = "Sign Out (" + user.email.split("@")[0] + ")";
      authNavLink.onclick = (e) => {
        e.preventDefault();
        signOut(auth);
      };
    } else {
      authNavLink.textContent = "Account";
      authNavLink.onclick = null;
      authNavLink.setAttribute("href", "#account");
    }
    checkWinnerStatus(user);
  });
}

// --- Create Auction ---
function setupAuctionForm() {
  const form = document.getElementById("create-auction-form");
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

// --- Load & Display Auctions ---
async function loadAuctions() {
  const grid = document.getElementById("auction-grid");
  const recommendationsGrid = document.getElementById("recommendations-grid");
  const filterVal = document.getElementById("franchise-filter").value;
  grid.innerHTML = "<p>Loading vault items...</p>";
  if (recommendationsGrid) {
    recommendationsGrid.innerHTML = "<p>Loading recommendations...</p>";
  }

  const now = Date.now();
  try {
    const q = query(collection(db, "auctions"), orderBy("createdAt", "desc"));
    const querySnapshot = await getDocs(q);
    grid.innerHTML = "";
    renderRecommendations(querySnapshot.docs, filterVal);

    if (querySnapshot.empty) {
      grid.innerHTML = "<p>No active auctions found in the vault.</p>";
      return;
    }

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

      const isUpcoming = data.startTime && now < data.startTime;
      const isEnded = data.endTime && now > data.endTime;
      const isSeller = auth.currentUser && auth.currentUser.uid === data.sellerId;

      const card = document.createElement("div");
      card.className = "card";

      let timeLeftText = "";
      if (isUpcoming) {
        timeLeftText = "Status: Upcoming";
      } else if (isEnded) {
        timeLeftText = "Status: Ended";
      } else if (data.endTime) {
        const diff = data.endTime - now;
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
          <p class="auction-timer" data-end="${data.endTime || 0}" style="color: var(--accent-magenta); font-size: 0.85rem; font-weight: 600; margin-bottom: 1rem;">${timeLeftText}</p>
          ${
            isSeller
              ? `<div style="display: flex; gap: 0.5rem; flex-direction: column;">
                   <button class="cta-btn" disabled style="opacity:0.6; cursor:not-allowed; width:100%;">Your Listing</button>
                   <button class="cta-btn delete-auction-btn" data-id="${docSnap.id}" style="background: #ff3333; padding: 0.5rem 1rem; width:100%;">Delete Auction</button>
                 </div>`
              : isUpcoming
              ? `<button class="cta-btn" disabled style="opacity:0.5; background:#444; width:100%;">Starts: ${new Date(data.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</button>`
              : isEnded
              ? `<button class="cta-btn" disabled style="opacity:0.5; width:100%;">Auction Ended</button>`
              : `<div class="custom-bid-wrapper">
                   <input type="number" class="custom-bid-input" min="${data.currentBid + 1}" value="${data.currentBid + 10}" placeholder="Amount">
                   <button class="cta-btn custom-bid-btn" data-id="${docSnap.id}" data-current="${data.currentBid}" style="padding: 0.6rem 1rem; flex: 1;">Place Bid</button>
                 </div>`
          }
        </div>
      `;

      card.addEventListener("click", (e) => {
        if (e.target.tagName === "BUTTON" || e.target.tagName === "INPUT") return;
        openProductModal(docSnap.id, data, isUpcoming, isEnded, isSeller);
      });

      grid.appendChild(card);
    }

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

        handleCustomBid(auctionId, userBid);
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

  } catch (err) {
    grid.innerHTML = "<p>Error loading items: " + err.message + "</p>";
    if (recommendationsGrid) {
      recommendationsGrid.innerHTML = "<p>Error loading recommendations.</p>";
    }
  }
}

function renderRecommendations(auctionDocs, category) {
  const grid = document.getElementById("recommendations-grid");
  if (!grid) return;

  const recommendedDocs = auctionDocs
    .filter((auctionDoc) => {
      const data = auctionDoc.data();
      return category === "all" || data.category === category;
    })
    .slice(0, 4);

  if (recommendedDocs.length === 0) {
    grid.innerHTML = "<p>No recommendations available for this category yet.</p>";
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
      const now = Date.now();
      const isUpcoming = data.startTime && now < data.startTime;
      const isEnded = data.endTime && now > data.endTime;
      const isSeller = auth.currentUser && auth.currentUser.uid === data.sellerId;
      openProductModal(auctionDoc.id, data, isUpcoming, isEnded, isSeller);
    });
    grid.appendChild(card);
  }
}

// --- Load My Vault ---
async function loadMyVault() {
  const grid = document.getElementById("myvault-grid");
  if (!grid) return;

  if (!auth.currentUser) {
    grid.innerHTML = "<p>Please sign in to view your stored props in My Vault.</p>";
    return;
  }

  grid.innerHTML = "<p>Loading your vault collection...</p>";
  const now = Date.now();

  try {
    const querySnapshot = await getDocs(collection(db, "auctions"));
    grid.innerHTML = "";
    let count = 0;

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (
        data.endTime &&
        now > data.endTime &&
        data.highestBidderId === auth.currentUser.uid &&
        data.sellerId !== auth.currentUser.uid
      ) {
        count++;
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
        grid.appendChild(card);
      }
    });

    if (count === 0) {
      grid.innerHTML = "<p>Your vault is currently empty. Win or complete a checkout on an auction to store props here!</p>";
    }
  } catch (err) {
    grid.innerHTML = "<p>Error loading your vault: " + err.message + "</p>";
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

async function handleCustomBid(auctionId, customAmount) {
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
    alert(`Bid of $${customAmount} placed successfully!`);
    loadAuctions();
  } catch (err) {
    alert("Bid Error: " + err.message);
  }
}

function openProductModal(auctionId, data, isUpcoming, isEnded, isSeller) {
  const modal = document.getElementById("product-modal");
  document.getElementById("modal-item-img").src = data.imageUrl;
  document.getElementById("modal-item-title").textContent = data.title;
  document.getElementById("modal-item-category").textContent = `Franchise Category: ${data.category}`;
  document.getElementById("modal-item-seller").textContent = `Curated by: ${data.sellerEmail ? data.sellerEmail.split('@')[0] : 'Vault Archive'}`;
  document.getElementById("modal-item-price").textContent = data.currentBid;

  const modalActionContainer = document.getElementById("modal-action-container") || createModalActionArea();
  
  if (isSeller) {
    modalActionContainer.innerHTML = `
      <button id="modal-delete-btn" class="cta-btn" style="background: #ff3333; width: 100%;">Delete My Auction Listing</button>
    `;
    document.getElementById("modal-delete-btn").onclick = async () => {
      if (confirm("Are you sure you want to delete this auction?")) {
        await deleteAuction(auctionId);
        modal.style.display = "none";
      }
    };
  } else if (isUpcoming) {
    modalActionContainer.innerHTML = `<button class="cta-btn" disabled style="opacity:0.5; width:100%;">Auction Not Started</button>`;
  } else if (isEnded) {
    modalActionContainer.innerHTML = `<button class="cta-btn" disabled style="opacity:0.5; width:100%;">Auction Ended</button>`;
  } else {
    modalActionContainer.innerHTML = `
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
      await handleCustomBid(auctionId, userBid);
      modal.style.display = "none";
    };
  }

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

function createModalActionArea() {
  const modalContent = document.querySelector(".modal-content");
  let actionDiv = document.getElementById("modal-action-container");
  if (!actionDiv) {
    actionDiv = document.createElement("div");
    actionDiv.id = "modal-action-container";
    actionDiv.style.marginTop = "1rem";
    modalContent.appendChild(actionDiv);
  }
  return actionDiv;
}

// --- Winner notification is scoped to the currently signed-in winning bidder ---
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

  if (!user) {
    return;
  }

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
      if (typeof data.endTime !== "number") continue;

      if (
        data.endTime <= now &&
        data.highestBidderId === user.uid &&
        data.sellerId !== user.uid
      ) {
        winningAuction = data;
        break;
      }

      if (data.endTime > now && data.endTime < nextEndTime) {
        nextEndTime = data.endTime;
      }
    }

    if (winningAuction) {
      banner.style.display = "block";
      wonName.textContent = `${winningAuction.title} ($${winningAuction.currentBid})`;
      checkoutItem = {
        title: winningAuction.title,
        price: winningAuction.currentBid
      };
      buyBtn.onclick = () => {
        if (auth.currentUser?.uid !== user.uid) return;
        document.getElementById("checkout-item-title").textContent = checkoutItem.title;
        document.getElementById("checkout-item-price").textContent = checkoutItem.price;
        window.location.hash = "checkout";
      };
    } else {
      banner.style.display = "none";
      wonName.textContent = "";
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
      banner.style.display = "none";
      console.error("Error watching auction winners:", error);
    }
  );
}

function setupCheckout() {
  const form = document.getElementById("checkout-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    alert("Order Confirmed! Prop stored in My Vault.");
    const banner = document.getElementById("winner-banner");
    if (banner) banner.style.display = "none";
    window.location.hash = "myvault";
  });
}

function setupFilters() {
  document.getElementById("franchise-filter").addEventListener("change", loadAuctions);
}