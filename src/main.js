// Bootstrap: sign in, subscribe to shared state, drive scene from it.

import { initScene, setTilt, setBackground, tiltFromWeights } from "./scale.js";
import { signIn } from "./firebase.js";
import { promptForIdentity, startPresence } from "./presence.js";
import { startStateSync, subscribe, sumTrayWeights } from "./state.js";
import { initTokens } from "./tokens.js";
import { initHost } from "./host.js";

async function boot() {
  initScene();

  const identity = await promptForIdentity();
  const user = await signIn();
  startPresence(user.uid, identity);
  startStateSync();
  initTokens();
  await initHost(user.uid);

  subscribe((state) => {
    renderPresence(state.presence, user.uid);
    if (!state.config) return;
    setBackground(state.config.backgroundUrl || "");
    const { left, right } = sumTrayWeights(state.tokens, state.config.tokenTypes);
    // Max tilt is enforced by scale.js as a geometric limit; config no longer overrides.
    setTilt(tiltFromWeights(left, right, state.config.weightScale ?? 1.5));
    document.body.classList.toggle("locked", !!state.config.locked);
  });

  // Expose for console-based sanity checks during Phase 3 verification.
  window.__me = user;
}

function renderPresence(presence, meUid) {
  const list = document.getElementById("presence-list");
  if (!list) return;
  list.innerHTML = "";
  for (const [uid, p] of Object.entries(presence || {})) {
    const chip = document.createElement("span");
    chip.className = "presence-chip" + (uid === meUid ? " me" : "");
    chip.style.setProperty("--chip", p.color || "#888");
    chip.textContent = p.name || "?";
    list.appendChild(chip);
  }
}

boot().catch((err) => {
  console.error("[boot] failed:", err);
  alert("Failed to connect to the game: " + (err?.message || err));
});

