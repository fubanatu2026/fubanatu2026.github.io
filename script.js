import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, set, onValue, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

// Verhindert, dass der Browser die Scroll-Position beim Neuladen wiederherstellt
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

// Erzwingt das Scrollen nach oben beim Laden der Seite
window.scrollTo(0, 0);

// --- FIREBASE KONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyDbviwxqQ-SITuT-5MiqanxKGLM11oPULA",
    authDomain: "fubanatu-2026.firebaseapp.com",
    databaseURL: "https://fubanatu-2026-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fubanatu-2026",
    storageBucket: "fubanatu-2026.firebasestorage.app",
    messagingSenderId: "350065123550",
    appId: "1:350065123550:web:f2f7b412f9dadc4b4ee24f"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const ADMIN_EMAIL = "admin@fubanatu2026.de";
const WEBSITE_URL = "https://fubanatu2026.github.io";

// --- SPIELE DATEN ---
let spiele = {};
// ganz oben im Script
let pastVisible = 2;
let futureVisible = 2;
let currentSpielGlobal = 0;
let alleErgebnisse = {}; // Hier speichern wir lokal alle Ergebnisse aus Firebase
let spieleGeladen = false;
let lastLiveUpdate = getStoredFirebaseUpdate();
let adminMessageTimeout = null;
let pauseAnchorGame = 0;
let lastActiveSpiel = 0;
let aktuellesSpielInitialized = false;
let ergebnisseInitialized = false;
let lastAktuellesSpielSnapshot = null;
let lastErgebnisseSnapshot = null;
let updateSignalCooldown = false;
let updateTimestampInitialized = false;
let lastUpdateTimestampSnapshot = null;
let adminSignedIn = false;
let liveDataLoaded = false;
let spieleDataLoaded = false;
let updateToastTimeout = null;
let spielstandData = null;   // { remainingMs, running, updatedAt } aus Firebase
let serverTimeOffset = 0;    // Differenz Client- zu Serverzeit (ms)

const liveTableLinks = {
    "1_m": "LINK_INTERVAL_1_M", // Spiele 1-25, maennlich
    "1_w": "LINK_INTERVAL_1_W", // Spiele 1-25, weiblich
    "2_m": "LINK_INTERVAL_2_M", // Spiele 26-50, maennlich
    "2_w": "LINK_INTERVAL_2_W", // Spiele 26-50, weiblich
    "3_m": "LINK_INTERVAL_3_M", // Spiele 51-75, maennlich
    "3_w": "LINK_INTERVAL_3_W", // Spiele 51-75, weiblich
    "4_m": "LINK_INTERVAL_4_M", // Spiele 76-100, maennlich
    "4_w": "LINK_INTERVAL_4_W"  // Spiele 76-100, weiblich
};

// --- INITIALISIERUNG BEIM LADEN ---
window.addEventListener('load', () => {
    initPopup();
    initCountdown();
    initAdmin();
    initShare();
    showLiveLoadingState();
    renderCurrentFirebaseState();
    setLiveOffset();
    handleLiveResize();
});

// --- POPUP LOGIK ---
function initPopup() {
    const popup = document.getElementById('meinPopup');
    const storage = (location.protocol === 'file:') ? sessionStorage : localStorage;
    const schonGezeigt = storage.getItem('popupSchonGezeigt');
    let besuchZaehler = Number(storage.getItem('besuchAnzahl') || 0) + 1;
    storage.setItem('besuchAnzahl', besuchZaehler);

    const sollPopup = !schonGezeigt || besuchZaehler === 1 || (besuchZaehler - 1) % 5 === 0;

    if (sollPopup) {
        shuffleSponsorAds();
        popup.style.display = 'flex';
        document.getElementById('popupOverlay').style.display = 'block';
        let sekunden = 5;
        const timerElement = document.getElementById('popupTimer');
        const countdown = setInterval(() => {
            sekunden--;
            timerElement.textContent = sekunden;
            if (sekunden <= 0) {
                clearInterval(countdown);
                popup.style.display = 'none';
                document.getElementById('popupOverlay').style.display = 'none';
            }
        }, 1000);
        storage.setItem('popupSchonGezeigt', 'true');
    }
}

function shuffleSponsorAds() {
    const grid = document.querySelector(".ad-grid");
    if (!grid) return;

    const ads = Array.from(grid.children);

    for (let i = ads.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ads[i], ads[j]] = [ads[j], ads[i]];
    }

    ads.forEach(ad => grid.appendChild(ad));
}

function initShare() {
    const shareBtn = document.getElementById("shareBtn");
    const shareOverlay = document.getElementById("shareOverlay");
    const sharePopup = document.getElementById("sharePopup");
    const closeShareBtn = document.getElementById("closeShareBtn");
    const copyLinkBtn = document.getElementById("copyLinkBtn");
    const nativeShareBtn = document.getElementById("nativeShareBtn");
    const shareMessage = document.getElementById("shareMessage");
    let shareMessageTimeout = null;

    if (!shareBtn || !shareOverlay || !sharePopup) return;

    const showShareMessage = (text, autoHide = true) => {
        if (!shareMessage) return;

        shareMessage.textContent = text;

        if (shareMessageTimeout) clearTimeout(shareMessageTimeout);
        if (autoHide) {
            shareMessageTimeout = setTimeout(() => {
                shareMessage.textContent = "";
            }, 2500);
        }
    };

    const openShare = () => {
        shareOverlay.style.display = "block";
        sharePopup.style.display = "block";
    };

    const closeShare = () => {
        shareOverlay.style.display = "none";
        sharePopup.style.display = "none";
        if (shareMessageTimeout) clearTimeout(shareMessageTimeout);
        if (shareMessage) shareMessage.textContent = "";
    };

    shareBtn.onclick = openShare;
    shareOverlay.onclick = closeShare;
    closeShareBtn.onclick = closeShare;

    copyLinkBtn.onclick = () => {
        navigator.clipboard.writeText(WEBSITE_URL).then(() => {
            showShareMessage("Link kopiert.");
        }).catch(() => {
            showShareMessage(WEBSITE_URL, false);
        });
    };

    nativeShareBtn.onclick = () => {
        if (!navigator.share) {
            showShareMessage("Direktes Teilen wird auf diesem Geraet nicht unterstuetzt.");
            return;
        }

        navigator.share({
            title: "FuBaNaTu 2026",
            text: "Live-Seite zum FuBaNaTu 2026",
            url: WEBSITE_URL
        });
    };
}

// --- COUNTDOWN LOGIK ---
function initCountdown() {
    const turnierStart = new Date("2026-07-14T08:00:00");
    const update = () => {
        const diff = turnierStart - new Date();
        const box = document.getElementById("turnierCountdown");
        const text = document.getElementById("countdownText");
        if (diff > 0) {
            const tage = Math.floor(diff / 86400000);
            const std = Math.floor((diff / 3600000) % 24);
            const min = Math.floor((diff / 60000) % 60);
            const sek = Math.floor((diff / 1000) % 60);
            text.textContent = `Noch ${tage}T ${std}h ${min}m ${sek}s bis zum Turnierstart`;
        } else {
            box.style.display = "none";
            setLiveOffset();
        }
    };
    setInterval(update, 1000);
    update();
}

// --- ADMIN LOGIK ---
function initAdmin() {
    const ball = document.getElementById("adminBall");
    const pwBox = document.getElementById("adminPasswordBox");
    const pwInput = document.getElementById("adminPassword");
    const adminPanel = document.getElementById("adminPanel");
    const adminOverlay = document.getElementById("adminOverlay");
    const closeAdminPanelBtn = document.getElementById("closeAdminPanelBtn");
    const selectGameBtn = document.getElementById("selectGameBtn");
    const logoutAdminBtn = document.getElementById("logoutAdminBtn");
    const resumeNextGameBtn = document.getElementById("resumeNextGameBtn");
    const saveResultsBtn = document.getElementById("saveResultsBtn");
    const savePauseBtn = document.getElementById("savePauseBtn");
    let pwTimeout = null;

    onAuthStateChanged(auth, (user) => {
        adminSignedIn = !!user;
    });

    ball.addEventListener("click", () => {
        if (adminSignedIn) {
            openAdminPanel();
            return;
        }

        pwBox.style.display = "block";
        pwInput.value = "";
        pwInput.focus();
        if (pwTimeout) clearTimeout(pwTimeout);
        pwTimeout = setTimeout(() => { pwBox.style.display = "none"; }, 2000);
    });

    pwInput.addEventListener("input", () => { if (pwTimeout) { clearTimeout(pwTimeout); pwTimeout = null; } });

    pwInput.addEventListener("keyup", (e) => {
        if (e.key === "Enter") {
            signInWithEmailAndPassword(auth, ADMIN_EMAIL, pwInput.value).then(() => {
                adminSignedIn = true;
                pwBox.style.display = "none";
                pwInput.value = "";
                openAdminPanel();
            }).catch(() => {
                pwInput.value = "";
                alert("Admin-Anmeldung fehlgeschlagen.");
            });
        }
    });

    closeAdminPanelBtn.onclick = closeAdminPanel;
    adminOverlay.onclick = closeAdminPanel;
    setupScoreInputs();
    logoutAdminBtn.onclick = () => {
        signOut(auth).then(() => {
            adminSignedIn = false;
            closeAdminPanel();
            showAdminMessage("Admin abgemeldet.", "success");
        });
    };

    selectGameBtn.onclick = () => {
        const eingabe = prompt("Welche Spielnummer soll live sein? 0 bedeutet: Spielpause. -1 bedeutet: kein Spiel. ");

        if (eingabe === null) return;

        const wert = eingabe.trim().toLowerCase();

        if (wert === "0" || wert === "p") {
            setPause();
            return;
        }

        const nr = Number(wert);

        if (!Number.isInteger(nr) || nr < -1 || nr > 100) {
            alert("Bitte eine ganze Zahl von -1 bis 100 eingeben.");
            return;
        }

        setSpiel(nr);
    };

    if (resumeNextGameBtn) {
        resumeNextGameBtn.onclick = () => {
            if (!requireAdmin()) return;

            const nextGame = getNextGameAfterPause();
            if (!nextGame) {
                showAdminMessage("Es wurde kein naechstes Spiel gefunden.", "error");
                return;
            }

            setSpiel(nextGame);
        };
    }

    document.getElementById("saveResultsBtn").onclick = () => {
    if (!requireAdmin()) return;

    const nr = currentSpielGlobal;
    const resA = (document.getElementById("resA1").value || "0") + ":" + (document.getElementById("resA2").value || "0");
    const resB = (document.getElementById("resB1").value || "0") + ":" + (document.getElementById("resB2").value || "0");

    if (nr > 0) {
        // 1. Ergebnisse speichern
        Promise.all([
            set(ref(db, "ergebnisse/" + nr), { a: resA, b: resB }),
            set(ref(db, "aktuellesSpiel"), nr + 1)
        ]).then(() => {
            writeFirebaseUpdateTimestampBestEffort();
        
        // 3. Felder leeren
        clearResultInputs();

        // 4. Admin Menü schließen (Overlay ausblenden)
        showAdminMessage(`Ergebnis fuer Spiel ${nr} gespeichert. Spiel ${nr + 1} ist jetzt live.`, "success");
        }).catch((error) => {
            showAdminMessage(`Firebase konnte nicht speichern: ${error.code || error.message}`, "error");
        });
    } else {
        showAdminMessage("In einer Pause oder ohne aktuelles Spiel kann kein Ergebnis gespeichert werden.", "error");
    }
};
document.getElementById("resetResultsBtn").onclick = () => {
    if (!requireAdmin()) return;

    if (confirm("Möchtest du wirklich ALLE Ergebnisse löschen? Dies kann nicht rückgängig gemacht werden.")) {
        set(ref(db, "ergebnisse"), null).then(() => {
            writeFirebaseUpdateTimestampBestEffort();
            showAdminMessage("Alle Ergebnisse wurden zurueckgesetzt.", "success");
        }).catch((error) => {
            showAdminMessage(`Firebase konnte nicht speichern: ${error.code || error.message}`, "error");
        });
    }
};

    if (saveResultsBtn) {
        saveResultsBtn.onclick = () => saveResultAndContinue("next");
    }

    if (savePauseBtn) {
        savePauseBtn.onclick = () => saveResultAndContinue("pause");
    }
}

function saveResultAndContinue(mode) {
    if (!requireAdmin()) return;

    const nr = Number(currentSpielGlobal);

    if (!Number.isInteger(nr) || nr <= 0) {
        showAdminMessage("In einer Pause oder ohne aktuelles Spiel kann kein Ergebnis gespeichert werden.", "error");
        return;
    }

    const resA = (document.getElementById("resA1").value || "0") + ":" + (document.getElementById("resA2").value || "0");
    const resB = (document.getElementById("resB1").value || "0") + ":" + (document.getElementById("resB2").value || "0");
    const nextGame = nr + 1;
    const writes = [
        set(ref(db, "ergebnisse/" + nr), { a: resA, b: resB })
    ];

    if (mode === "pause") {
        pauseAnchorGame = nextGame;
        writes.push(set(ref(db, "pauseAnkerSpiel"), nextGame));
        writes.push(set(ref(db, "aktuellesSpiel"), 0));
    } else {
        writes.push(set(ref(db, "aktuellesSpiel"), nextGame));
    }

    Promise.all(writes).then(() => {
        writeFirebaseUpdateTimestampBestEffort();
        clearResultInputs();

        if (mode === "pause") {
            showAdminMessage(`Ergebnis fuer Spiel ${nr} gespeichert. Spielpause vor Spiel ${nextGame} ist jetzt live.`, "success");
        } else {
            showAdminMessage(`Ergebnis fuer Spiel ${nr} gespeichert. Spiel ${nextGame} ist jetzt live.`, "success");
        }
    }).catch((error) => {
        showAdminMessage(`Firebase konnte nicht speichern: ${error.code || error.message}`, "error");
    });
}

function setupScoreInputs() {
    const ids = ["resA1", "resA2", "resB1", "resB2"];

    ids.forEach((id, index) => {
        const input = document.getElementById(id);
        if (!input) return;

        input.addEventListener("input", () => {
            if (input.value.length >= 1 && ids[index + 1]) {
                document.getElementById(ids[index + 1]).focus();
            }
        });
    });
}

function setSpiel(nr) {
    if (!requireAdmin()) return;

    set(ref(db, "aktuellesSpiel"), nr).then(() => {
        writeFirebaseUpdateTimestampBestEffort();
        showAdminMessage(getAdminSpielMessage(nr), "success");
    }).catch((error) => {
        showAdminMessage(`Firebase konnte nicht speichern: ${error.code || error.message}`, "error");
    });
}

function setPause() {
    if (!requireAdmin()) return;

    const anchor = Number(currentSpielGlobal) > 0 ? Number(currentSpielGlobal) : lastActiveSpiel;

    if (anchor > 0) {
        pauseAnchorGame = anchor;
        Promise.all([
            set(ref(db, "pauseAnkerSpiel"), anchor),
            set(ref(db, "aktuellesSpiel"), 0)
        ]).then(() => {
            writeFirebaseUpdateTimestampBestEffort();
            showAdminMessage(getAdminSpielMessage(0), "success");
        }).catch((error) => {
            showAdminMessage(`Firebase konnte die Pause nicht speichern: ${error.code || error.message}`, "error");
        });
        return;
    }

    setSpiel(0);
}

function getAdminSpielMessage(nr) {
    if (nr === "0" || nr === 0) return "Spielpause ist jetzt live.";
    if (nr === "-1" || nr === -1) return "Kein Spiel ist jetzt live.";
    return `Spiel ${nr} ist jetzt live.`;
}

function openAdminPanel() {
    document.getElementById("adminOverlay").style.display = "block";
    document.getElementById("adminPanel").style.display = "block";
}

function closeAdminPanel() {
    document.getElementById("adminOverlay").style.display = "none";
    document.getElementById("adminPanel").style.display = "none";
}

function requireAdmin() {
    if (adminSignedIn) return true;

    showAdminMessage("Bitte zuerst als Admin anmelden.", "error");
    return false;
}

function showAdminMessage(text, type = "success") {
    const message = document.getElementById("adminMessage");
    if (!message) return;

    message.textContent = text;
    message.className = `admin-message admin-message-${type}`;
    message.style.display = "block";

    if (adminMessageTimeout) clearTimeout(adminMessageTimeout);
    adminMessageTimeout = setTimeout(() => {
        message.style.display = "none";
    }, 3500);
}

function getStoredFirebaseUpdate() {
    const stored = localStorage.getItem("lastFirebaseUpdate");
    return stored ? new Date(stored) : null;
}

function markFirebaseUpdate() {
    lastLiveUpdate = new Date();
    localStorage.setItem("lastFirebaseUpdate", lastLiveUpdate.toISOString());
    triggerUpdateSignal();
    updateLiveSpiel(currentSpielGlobal);
}

function writeFirebaseUpdateTimestamp() {
    return set(ref(db, "letztesUpdate"), serverTimestamp());
}

function writeFirebaseUpdateTimestampBestEffort() {
    return writeFirebaseUpdateTimestamp().catch(() => {});
}

function triggerUpdateSignal() {
    if (updateSignalCooldown) return;

    updateSignalCooldown = true;
    document.body.classList.remove("site-update-signal");
    void document.body.offsetWidth;
    document.body.classList.add("site-update-signal");
    showUpdateToast();

    setTimeout(() => {
        document.body.classList.remove("site-update-signal");
        updateSignalCooldown = false;
    }, 1600);
}

function showUpdateToast() {
    let toast = document.getElementById("updateToast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "updateToast";
        toast.className = "update-toast";
        toast.textContent = "Aktualisiert";
        document.body.appendChild(toast);
    }

    toast.classList.add("visible");

    if (updateToastTimeout) clearTimeout(updateToastTimeout);
    updateToastTimeout = setTimeout(() => {
        toast.classList.remove("visible");
    }, 1800);
}

function renderCurrentFirebaseState() {
    updateAdminResultLabels(currentSpielGlobal);
    updateLiveSpiel(currentSpielGlobal);
    updateSideGames(currentSpielGlobal);
}

// --- FIREBASE & LISTENERS ---
onValue(ref(db, "aktuellesSpiel"), (snapshot) => {
    liveDataLoaded = true;
    const nr = normalizeLiveGameValue(snapshot.val());
    const serialized = JSON.stringify(nr);

    if (aktuellesSpielInitialized && serialized !== lastAktuellesSpielSnapshot) {
        markFirebaseUpdate();
    }

    aktuellesSpielInitialized = true;
    lastAktuellesSpielSnapshot = serialized;
    currentSpielGlobal = nr;
    if (Number(nr) > 0) lastActiveSpiel = Number(nr);
    if(document.getElementById("adminCurrentNr")) {
        document.getElementById("adminCurrentNr").textContent = (nr === "0" || nr === 0) ? "Pause" : nr;
    }
    renderCurrentFirebaseState();
}, () => {
    liveDataLoaded = true;
    showLiveDataError();
});

onValue(ref(db, "ergebnisse"), (snapshot) => {
    const serialized = JSON.stringify(snapshot.val() || {});

    if (ergebnisseInitialized && serialized !== lastErgebnisseSnapshot) {
        markFirebaseUpdate();
    }

    ergebnisseInitialized = true;
    lastErgebnisseSnapshot = serialized;
    alleErgebnisse = snapshot.val() || {};
    renderCurrentFirebaseState();
});

onValue(ref(db, "letztesUpdate"), (snapshot) => {
    const timestamp = snapshot.val();
    const serialized = JSON.stringify(timestamp);

    if (timestamp) {
        lastLiveUpdate = new Date(timestamp);
        localStorage.setItem("lastFirebaseUpdate", lastLiveUpdate.toISOString());
        updateLiveSpiel(currentSpielGlobal);
    }

    if (updateTimestampInitialized && serialized !== lastUpdateTimestampSnapshot) {
        triggerUpdateSignal();
    }

    updateTimestampInitialized = true;
    lastUpdateTimestampSnapshot = serialized;
});

onValue(ref(db, "pauseAnkerSpiel"), (snapshot) => {
    const nr = Number(snapshot.val());
    pauseAnchorGame = Number.isInteger(nr) && nr > 0 ? nr : 0;
    renderCurrentFirebaseState();
});

// Serverzeit-Offset für präzise Countdown-Berechnung
onValue(ref(db, ".info/serverTimeOffset"), (snapshot) => {
    serverTimeOffset = snapshot.val() || 0;
});

// Spielstand-Listener: remainingMs + running + updatedAt
onValue(ref(db, "soundboard/spielstand"), (snapshot) => {
    spielstandData = snapshot.val() || null;
    updateLiveCountdown();
});

onValue(ref(db, "spiele"), (snapshot) => {
    spiele = snapshot.val() || {};
    spieleGeladen = true;
    spieleDataLoaded = true;
    renderCurrentFirebaseState();
}, () => {
    spieleGeladen = true;
    spieleDataLoaded = true;
    showLiveDataError();
});

function normalizeLiveGameValue(value) {
    if (value === null || value === undefined || value === "") return null;

    const number = Number(value);
    if (Number.isInteger(number)) return number;

    return value;
}

// --- LIVE COUNTDOWN ---
const GAME_DURATION_MS = 10 * 60 * 1000;

function formatCountdown(ms) {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function updateLiveCountdown() {
    const el = document.getElementById("liveCountdown");
    if (!el) return;

    if (!spielstandData || spielstandData.remainingMs === undefined) {
        el.textContent = "10:00";
        return;
    }

    const { remainingMs, running, updatedAt } = spielstandData;

    if (!running || !updatedAt) {
        // Pausiert, abgebrochen oder noch nicht gestartet
        el.textContent = formatCountdown(remainingMs);
        return;
    }

    // Präzise Berechnung mit Firebase serverTimeOffset
    const serverNow = Date.now() + serverTimeOffset;
    const elapsed = serverNow - updatedAt;
    const displayMs = Math.max(0, remainingMs - elapsed);
    el.textContent = formatCountdown(displayMs);
}

// Jede Sekunde aktualisieren
setInterval(updateLiveCountdown, 1000);

function updateLiveSpiel(nr) {
    const box = document.getElementById("liveText");
    const container = document.getElementById("liveSpiel");
    const updateText = getLastUpdatedText();
    const nrKey = nr === null || nr === undefined ? "" : String(nr);

    if (!box || !container) return;

    if (!liveDataLoaded) {
        showLiveLoadingState();
        return;
    }

    if (nr === "0" || nr === 0) {
        const nextGame = getNextGameAfterPause();
        const nextGameInfo = getNextGameInfo(nextGame);
        container.style.display = "block";
        box.innerHTML = `
            <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; letter-spacing: 2px; display: flex; align-items: center; justify-content: center;">
                <span class="live-indicator"></span> SPIELPAUSE
            </div>
            <div style="font-size: 18px; font-weight: bold;">
                Gerade gibt es kein aktuelles Spiel.
            </div>
            ${nextGameInfo}
            <div class="live-updated">${updateText}</div>
        `;
        return;
    }

    // 1. Wenn kein Spiel aktiv ist
    if (nr === null || nr === undefined || nr === "" || nr === "-1" || nr === -1) { 
        container.style.display = "none"; 
        return; 
    }

    if (!spieleDataLoaded) {
        showLiveLoadingState();
        return;
    }

    container.style.display = "block";

    // 2. Inhalt setzen mit pulsierendem Punkt und Profi-Layout
    const game = spiele[nrKey];

if (game) {
    box.innerHTML = `
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 2px; letter-spacing: 2px; display: flex; align-items: center; justify-content: center;">
            <span class="live-indicator"></span> AKTUELLE SPIELE
        </div>

        <div style="display: flex; align-items: center; justify-content: center; gap: 14px; padding: 0 4px;">
            <div style="flex: 1; min-width: 0;">
                <div class="game-row" style="max-width: none; margin: 4px 0; grid-template-columns: 72px minmax(0,1fr);">
                    <span class="platz">Platz 1:</span>
                    <span class="teams">${game.a}</span>
                </div>
                <div class="game-row" style="max-width: none; margin: 4px 0; grid-template-columns: 72px minmax(0,1fr);">
                    <span class="platz">Platz 2:</span>
                    <span class="teams">${game.b}</span>
                </div>
            </div>
            <div id="liveCountdown" style="font-size: 28px; font-weight: bold; color: white; min-width: 72px; text-align: center; flex-shrink: 0; letter-spacing: 1px; line-height: 1;">10:00</div>
        </div>

        <div class="live-button-container">
            <span class="live-table-arrow">&rArr;</span>
            <button id="liveTableBtn">Zur Live-Tabelle</button>
            <span class="live-table-arrow">&lArr;</span>
        </div>
        <div class="live-updated">${updateText}</div>
        `;

     const btn = document.getElementById("liveTableBtn");
        if (btn) {
            btn.onclick = () => {
                const liveTableLink = getLiveTableLink(nr, game);

                if (!liveTableLink) {
                    alert("Fuer dieses Spiel konnte noch keine passende Live-Tabelle gefunden werden.");
                    return;
                }

                window.location.href = liveTableLink;
            };

        // Countdown direkt nach dem Rendern aktualisieren
        updateLiveCountdown();
        }
} else {
            // Fallback-Text, falls für die Nummer kein Spiel im Objekt 'spiele' ist
            box.innerHTML = `
                <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; letter-spacing: 2px; display: flex; align-items: center; justify-content: center;">
                    <span class="live-indicator"></span> AKTUELLE SPIELE
                </div>
                <div style="font-size: 18px; font-weight: bold;">
                    ${spieleGeladen ? `Keine Spieldaten fuer Spiel ${nr} gefunden.` : "Spielplan wird geladen..."}
                </div>
                <div class="live-hint">${spieleGeladen ? "Bitte pruefe die Spielnummer oder die Firebase-Daten." : "Die aktuellen Daten werden gleich angezeigt."}</div>
                <div class="live-updated">${updateText}</div>
            `;
        }
}

function showLiveLoadingState() {
    const box = document.getElementById("liveText");
    const container = document.getElementById("liveSpiel");

    if (!box || !container) return;

    container.style.display = "block";
    box.innerHTML = `
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; letter-spacing: 2px;">
            LIVE-DATEN
        </div>
        <div style="font-size: 18px; font-weight: bold;">
            Spielplan wird geladen...
        </div>
        <div class="live-hint">Einen Moment, die aktuellen Daten werden abgerufen.</div>
    `;
}

function showLiveDataError() {
    const box = document.getElementById("liveText");
    const container = document.getElementById("liveSpiel");

    if (!box || !container) return;

    container.style.display = "block";
    box.innerHTML = `
        <div style="font-size: 14px; font-weight: bold; margin-bottom: 8px; letter-spacing: 2px;">
            LIVE-DATEN
        </div>
        <div style="font-size: 18px; font-weight: bold;">
            Live-Daten aktuell nicht verfügbar.
        </div>
        <div class="live-hint">Bitte später erneut versuchen oder die Tournify-Links nutzen.</div>
    `;
}

function getLastUpdatedText() {
    if (!lastLiveUpdate) return "Noch nicht aktualisiert";

    return `Zuletzt aktualisiert um ${lastLiveUpdate.toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    })} Uhr`;
}

function getNextGameInfo(nextGame) {
    const game = spiele && nextGame ? spiele[String(nextGame)] : null;

    if (!game) return "";

    return `
        <div class="pause-next-game">
            Weiter geht es mit:<br>
            Platz 1: ${game.a}<br>
            Platz 2: ${game.b}
        </div>
    `;
}

function getNextGameAfterPause() {
    if (!spiele || Object.keys(spiele).length === 0) return null;

    const anchorGame = getPauseAnchorGame();
    const keys = Object.keys(spiele)
        .map(k => parseInt(k))
        .filter(k => !isNaN(k))
        .sort((a, b) => a - b);

    return keys.find(k => k >= anchorGame) || null;
}

function updateAdminResultLabels(nr) {
    const labelA = document.getElementById("adminGameALabel");
    const labelB = document.getElementById("adminGameBLabel");
    const rowA = document.getElementById("adminResultRowA");
    const rowB = document.getElementById("adminResultRowB");
    const unavailable = document.getElementById("adminResultUnavailable");
    const saveBtn = document.getElementById("saveResultsBtn");
    const savePauseBtn = document.getElementById("savePauseBtn");
    const resumeNextGameBtn = document.getElementById("resumeNextGameBtn");

    if (!labelA || !labelB) return;

    const number = Number(nr);
    const canEnterResult = Number.isInteger(number) && number > 0;
    const game = spiele && canEnterResult ? spiele[String(number)] : null;

    if (rowA) rowA.style.display = canEnterResult ? "flex" : "none";
    if (rowB) rowB.style.display = canEnterResult ? "flex" : "none";
    if (unavailable) unavailable.style.display = canEnterResult ? "none" : "block";
    if (saveBtn) saveBtn.style.display = canEnterResult ? "" : "none";
    if (savePauseBtn) savePauseBtn.style.display = canEnterResult ? "" : "none";
    if (resumeNextGameBtn) resumeNextGameBtn.style.display = number === 0 ? "" : "none";

    if (!canEnterResult) {
        clearResultInputs();
    }

    labelA.textContent = game ? `Platz 1: ${game.a}` : "Platz 1";
    labelB.textContent = game ? `Platz 2: ${game.b}` : "Platz 2";
}

function clearResultInputs() {
    ["resA1", "resA2", "resB1", "resB2"].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = "";
    });
}

function getLiveTableLink(nr, game) {
    const interval = getLiveTableInterval(nr);
    const gender = getGameGender(game);

    if (!interval || !gender) return null;

    return liveTableLinks[`${interval}_${gender}`] || null;
}

function getLiveTableInterval(nr) {
    const number = Number(nr);

    if (number >= 1 && number <= 25) return 1;
    if (number >= 26 && number <= 50) return 2;
    if (number >= 51 && number <= 75) return 3;
    if (number >= 76 && number <= 100) return 4;

    return null;
}

function getGameGender(game) {
    const teamNames = [game.a, game.b]
        .flatMap(matchup => String(matchup).split(/\s*(?:-|–|—|:|gegen|vs\.?)\s*/i))
        .map(team => team.trim())
        .filter(Boolean);

    if (teamNames.length < 4) return null;

    const endings = teamNames.map(team => {
        const normalizedTeam = team.toLowerCase().replace(/[^\wäöüß]+$/i, "");
        return normalizedTeam.endsWith("m") || normalizedTeam.endsWith("w")
            ? normalizedTeam.slice(-1)
            : null;
    });

    if (endings.every(ending => ending === "m")) return "m";
    if (endings.every(ending => ending === "w")) return "w";

    return null;
}

function updateSideGames(current) {
    const pastWrapper = document.getElementById("pastWrapper");
    const futureWrapper = document.getElementById("futureWrapper");

    if (!pastWrapper || !futureWrapper) return;

    if (!spiele || Object.keys(spiele).length === 0) {
        pastWrapper.style.display = "none";
        futureWrapper.style.display = "none";
        return;
    }

    const keys = Object.keys(spiele)
        .map(k => parseInt(k))
        .filter(k => !isNaN(k))
        .sort((a, b) => a - b);

    if (current === "0" || current === 0) {
        const anchorGame = getPauseAnchorGame();
        renderPast(keys.filter(k => k < anchorGame), anchorGame);
        renderFuture(keys.filter(k => k >= anchorGame), anchorGame);
        return;
    }

    if (current === null || current === undefined || current === "" || current === "-1" || current === -1) {
        pastWrapper.style.display = "none";
        futureWrapper.style.display = "none";
        return;
    }

    current = parseInt(current);

    renderPast(keys.filter(k => k < current), current);
    renderFuture(keys.filter(k => k > current), current);
}

function getPauseAnchorGame() {
    if (pauseAnchorGame > 0) return pauseAnchorGame;
    if (lastActiveSpiel > 0) return lastActiveSpiel;

    return 0;
}

function renderPast(past, current) {
    const wrapper = document.getElementById("pastWrapper");
    const container = document.getElementById("pastGames");
    const moreBtn = document.getElementById("pastMoreBtn");

    if (!wrapper || !container || !moreBtn) return;

    // 1. Wenn keine vergangenen Spiele → ausblenden
    if (past.length === 0) {
        wrapper.style.display = "none";
        return;
    } else {
        wrapper.style.display = "block";
    }

    container.innerHTML = "";

    // 2. Die letzten X Spiele holen (höchste Nummer bleibt unten)
    const slice = past.slice(-pastVisible);

    slice.forEach(nr => {
        const game = spiele[nr.toString()];
        if (!spiele[nr]) return;
        const div = document.createElement("div");
        div.className = "game-line";
        
        let displayContent = spiele[nr];

        // 3. Ergebnisse integrieren (falls vorhanden)
        if (alleErgebnisse[nr]) {
            const res = alleErgebnisse[nr];
            const resA = res.a ? `<span class="result">${res.a}</span>` : "";
            const resB = res.b ? `<span class="result">${res.b}</span>` : "";

            displayContent = `
            <div class="game-row">
                <span class="platz">Platz 1:</span>
                <span class="teams">${game.a}</span>
                ${resA}
            </div>

            <div class="game-row">
                <span class="platz">Platz 2:</span>
                <span class="teams">${game.b}</span>
                ${resB}
            </div>
            `;
        } else {
            displayContent = `
            <div class="game-row">
                <span class="platz">Platz 1:</span>
                <span class="teams">${game.a}</span>
            </div>

            <div class="game-row">
                <span class="platz">Platz 2:</span>
                <span class="teams">${game.b}</span>
            </div>
            `;
        }

        div.innerHTML = displayContent;
        container.appendChild(div);
    });

    // 4. "Mehr anzeigen" Logik (wie in renderFuture)
    if (pastVisible < past.length) {
        moreBtn.style.display = "inline-block";
    } else {
        moreBtn.style.display = "none";
    }

    // 5. "Weniger anzeigen" Logik (dynamisch wie in renderFuture)
    let lessBtn = document.getElementById("pastLessBtn");
    if (!lessBtn) {
        lessBtn = document.createElement("button");
        lessBtn.id = "pastLessBtn";
        lessBtn.className = "show-more";
        lessBtn.textContent = "Weniger anzeigen";
        // Button nach dem "Mehr anzeigen" Button einfügen
        moreBtn.parentNode.insertBefore(lessBtn, moreBtn.nextSibling);
    }

    // Sichtbarkeit des Weniger-Buttons (ab mehr als 3 Spielen)
    if (pastVisible > 2) {
        lessBtn.style.display = "inline-block";
    } else {
        lessBtn.style.display = "none";
    }

    // 6. Klick-Events (direkt in der Funktion definiert)
    // Klicks für Mehr anzeigen
    moreBtn.onclick = () => {
        pastVisible += 4;
        updateSideGames(currentSpielGlobal);
        
        // Kurze Verzögerung, damit das DOM Zeit hat, die neuen Elemente zu rendern
        setTimeout(() => {
            keepElementInView(moreBtn.offsetParent ? moreBtn : lessBtn);
        }, 50);
    };

    lessBtn.onclick = () => {
        pastVisible = 2; // Zurück auf Standardwert
        updateSideGames(currentSpielGlobal);
        scrollToLive(); // Nutzt deine vorhandene Funktion
    };
}

function renderFuture(future, current) {
    const wrapper = document.getElementById("futureWrapper");
    const container = document.getElementById("futureGames");
    const moreBtn = document.getElementById("futureMoreBtn");

    if (!wrapper || !container || !moreBtn) return;

    if (future.length === 0) { wrapper.style.display = "none"; return; }
    wrapper.style.display = "block";
    container.innerHTML = "";
    future.slice(0, futureVisible).forEach(nr => {
        if (!spiele[nr]) return;
        const div = document.createElement("div");
        div.className = "game-line";
        const game = spiele[nr];
        div.innerHTML = `
        <div class="game-row">
            <span class="platz">Platz 1:</span>
            <span class="teams">${game.a}</span>
        </div>

        <div class="game-row">
            <span class="platz">Platz 2:</span>
            <span class="teams">${game.b}</span>
        </div>
        `;
        container.appendChild(div);
    });

    moreBtn.style.display = futureVisible < future.length ? "inline-block" : "none";
        // Klicks
    moreBtn.onclick = () => {
        futureVisible += 4;
        updateSideGames(currentSpielGlobal);

        // NEU: Wartet kurz, bis die neuen Spiele gezeichnet sind, und scrollt dann
        setTimeout(() => {
            keepElementInView(moreBtn.offsetParent ? moreBtn : lessBtn);
        }, 50);
    };


    let lessBtn = document.getElementById("futureLessBtn") || createLessBtn("futureLessBtn", moreBtn, true);
    lessBtn.style.display = futureVisible > 4 ? "inline-block" : "none";
    lessBtn.onclick = () => { futureVisible = 2; updateSideGames(currentSpielGlobal); scrollToLive(); };
}

function createLessBtn(id, target, before = false) {
    const btn = document.createElement("button");
    btn.id = id; btn.className = "show-more"; btn.textContent = "Weniger anzeigen";
    if (before) target.parentNode.insertBefore(btn, target);
    else target.parentNode.insertBefore(btn, target.nextSibling);
    return btn;
}

function keepElementInView(element) {
    if (!element) return;

    const rect = element.getBoundingClientRect();
    const countdown = document.getElementById("turnierCountdown");
    const topPadding = (countdown && countdown.style.display !== "none" ? countdown.offsetHeight : 0) + 16;
    const bottomPadding = 24;

    if (rect.top < topPadding) {
        window.scrollBy({ top: rect.top - topPadding, behavior: "smooth" });
    } else if (rect.bottom > window.innerHeight - bottomPadding) {
        window.scrollBy({ top: rect.bottom - (window.innerHeight - bottomPadding), behavior: "smooth" });
    }
}

// --- UTILS (SCROLL & STICKY) ---
function scrollToLive() {
    const live = document.getElementById("liveSpiel");
    if (!live) return;

    const oldPosition = live.style.position;
    live.style.position = "static";
    const y = live.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: y - (window.innerHeight / 2) + (live.offsetHeight / 2), behavior: "smooth" });
    setTimeout(() => { live.style.position = oldPosition || "sticky"; }, 400);
}

function setLiveOffset() {
    const countdown = document.getElementById("turnierCountdown");
    const live = document.getElementById("liveSpiel");
    if (!countdown || !live) return;

    live.style.top = countdown.offsetHeight + "px";
}

function handleLiveResize() {
    const live = document.getElementById("liveSpiel");
    if (!live) return;

    const isSticky = live.getBoundingClientRect().top <= parseInt(live.style.top || 0) + 1;
    if (isSticky) live.classList.add("full-width");
    else live.classList.remove("full-width");
}

const deleteBtn = document.getElementById("deleteSingleResultBtn");

if (deleteBtn) {
    deleteBtn.onclick = deleteSingleResult;
}

function deleteSingleResult() {
    const nr = prompt("Welche Spielnummer soll gelöscht werden?");

    if (!nr) return;

    const nummer = nr.trim();

    if (!alleErgebnisse[nummer]) {
        alert("Für dieses Spiel gibt es kein gespeichertes Ergebnis.");
        return;
    }

    if (!confirm(`Ergebnis von Spiel ${nummer} wirklich löschen?`)) return;

    // Ergebnis lokal löschen
    delete alleErgebnisse[nummer];

    // In Firebase löschen
    set(ref(db, "ergebnisse/" + nummer), null).then(() => {
        writeFirebaseUpdateTimestampBestEffort();
        showAdminMessage(`Ergebnis von Spiel ${nummer} geloescht.`, "success");
    }).catch((error) => {
        showAdminMessage(`Firebase konnte nicht speichern: ${error.code || error.message}`, "error");
    });
}

window.addEventListener("resize", setLiveOffset);
window.addEventListener("scroll", handleLiveResize);
