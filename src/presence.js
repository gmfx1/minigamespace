// Anonymous identity + presence heartbeat. Name/color persist across page reloads
// via localStorage so returning players don't get prompted again.

import {
  roomRef,
  set,
  update,
  onDisconnect,
  serverTimestamp,
} from "./firebase.js";

const NAME_KEY = "minigamespace.name";
const COLOR_KEY = "minigamespace.color";
const HEARTBEAT_MS = 20_000;

const DEFAULT_COLORS = [
  "#e6c34a", "#c0392b", "#2980b9", "#27ae60",
  "#8e44ad", "#e67e22", "#16a085", "#d35400",
];

function randomColor() {
  return DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];
}

function getStoredIdentity() {
  return {
    name: localStorage.getItem(NAME_KEY) || "",
    color: localStorage.getItem(COLOR_KEY) || randomColor(),
  };
}

function saveIdentity({ name, color }) {
  localStorage.setItem(NAME_KEY, name);
  localStorage.setItem(COLOR_KEY, color);
}

export function promptForIdentity() {
  const existing = getStoredIdentity();
  if (existing.name) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.id = "identity-dialog";
    dialog.innerHTML = `
      <form method="dialog">
        <h2>Enter the tavern</h2>
        <label>Name
          <input name="name" type="text" required maxlength="20" autocomplete="off" />
        </label>
        <label>Color
          <input name="color" type="color" value="${existing.color}" />
        </label>
        <button type="submit">Join</button>
      </form>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();

    dialog.addEventListener("close", () => {
      const form = dialog.querySelector("form");
      const name = (form.name.value || "").trim() || "Player";
      const color = form.color.value || existing.color;
      saveIdentity({ name, color });
      dialog.remove();
      resolve({ name, color });
    });
  });
}

export function startPresence(uid, { name, color }) {
  const meRef = roomRef(`presence/${uid}`);
  // Register onDisconnect BEFORE the initial set so a lost connection during
  // handshake still schedules cleanup.
  onDisconnect(meRef).remove();
  set(meRef, { name, color, lastSeen: serverTimestamp() });
  setInterval(() => {
    update(meRef, { lastSeen: serverTimestamp() });
  }, HEARTBEAT_MS);
}
