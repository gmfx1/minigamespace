// Token palette + drag/drop with soft-lock ownership.
// Coordinate translation is handled by elementFromPoint; no SVG matrix math needed here.

import {
  auth,
  roomRef,
  set,
  update,
  remove,
  runTransaction,
  onDisconnect,
} from "./firebase.js";
import { getState, subscribe } from "./state.js";

let activeDrag = null;

export function initTokens() {
  subscribe((state) => {
    renderPalette(state.config?.tokenTypes || {});
    renderTrayTokens(state.tokens || {}, state.config?.tokenTypes || {});
  });
}

// ---------------- palette ----------------

function renderPalette(tokenTypes) {
  const container = document.getElementById("palette-items");
  if (!container) return;
  container.innerHTML = "";
  for (const [typeId, def] of Object.entries(tokenTypes)) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "palette-item";
    item.dataset.typeId = typeId;
    item.style.setProperty("--token-color", def.color || "#888");
    item.innerHTML = `
      <span class="palette-token">${def.weight ?? "?"}</span>
      <span class="palette-label">${escapeHtml(def.label || typeId)}</span>
    `;
    item.addEventListener("pointerdown", (e) =>
      beginDrag(e, { source: "palette", typeId })
    );
    container.appendChild(item);
  }
}

// ---------------- tray tokens ----------------

function renderTrayTokens(tokens, tokenTypes) {
  for (const side of ["left", "right"]) {
    const group = document.querySelector(`#tray-${side} .tray-tokens`);
    if (!group) continue;
    while (group.firstChild) group.removeChild(group.firstChild);

    const items = Object.entries(tokens).filter(([, t]) => t.tray === side);
    const n = items.length;
    const spacing = n <= 1 ? 0 : Math.min(40, 160 / n);
    const centerX = getTrayArtCenterX(side);

    items.forEach(([tokenId, tok], i) => {
      const def = tokenTypes[tok.typeId] || {};
      const x = centerX + (i - (n - 1) / 2) * spacing;
      const gEl = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gEl.dataset.tokenId = tokenId;
      gEl.setAttribute("transform", `translate(${x} 0)`);
      gEl.classList.add("tray-token");
      if (tok.ownerSessionId && tok.ownerSessionId !== auth.currentUser?.uid) {
        gEl.classList.add("owned-by-other");
      }
      gEl.innerHTML = `
        <circle r="18" fill="${def.color || "#888"}"
          stroke="#3b2810" stroke-width="2" />
        <text x="0" y="5" text-anchor="middle"
          font-size="14" font-weight="bold" fill="#1a1410">
          ${def.weight ?? "?"}
        </text>
      `;
      gEl.addEventListener("pointerdown", (e) =>
        beginDrag(e, { source: "tray", tokenId, typeId: tok.typeId })
      );
      group.appendChild(gEl);
    });
  }
}

// Auto-derives the horizontal midpoint of the tray artwork from its <image> slot,
// so tokens stay centered on the dish even if the slot's x offset is later retuned.
function getTrayArtCenterX(side) {
  const imageEl = document.querySelector(`#tray-${side} image`);
  if (!imageEl) return 0;
  const x = Number(imageEl.getAttribute("x")) || 0;
  const w = Number(imageEl.getAttribute("width")) || 0;
  return x + w / 2;
}

// ---------------- drag lifecycle ----------------

function beginDrag(e, context) {
  if (activeDrag) return;
  const state = getState();
  if (state.config?.locked) return;
  e.preventDefault();
  e.stopPropagation();

  const def = state.config?.tokenTypes?.[context.typeId] || {};
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  activeDrag = {
    ...context,
    uid,
    def,
    preview: createPreview(def, e.clientX, e.clientY),
    disc: null,
  };

  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd, { once: true });
  window.addEventListener("pointercancel", onDragEnd, { once: true });

  if (context.source === "tray") {
    claimToken(context.tokenId, uid);
  }
}

function onDragMove(e) {
  if (!activeDrag) return;
  activeDrag.preview.style.left = e.clientX + "px";
  activeDrag.preview.style.top = e.clientY + "px";

  const dropZone = findDropZone(e.clientX, e.clientY);
  document
    .querySelectorAll(".drop-target-hover")
    .forEach((el) => el.classList.remove("drop-target-hover"));
  if (dropZone) dropZone.classList.add("drop-target-hover");
}

async function onDragEnd(e) {
  window.removeEventListener("pointermove", onDragMove);
  document
    .querySelectorAll(".drop-target-hover")
    .forEach((el) => el.classList.remove("drop-target-hover"));

  if (!activeDrag) return;
  const drag = activeDrag;
  activeDrag = null;
  drag.preview.remove();

  const dropZone = findDropZone(e.clientX, e.clientY);
  const side =
    dropZone?.id === "tray-left"
      ? "left"
      : dropZone?.id === "tray-right"
      ? "right"
      : null;

  if (drag.source === "palette" && side) {
    const newId = crypto.randomUUID();
    await set(roomRef(`tokens/${newId}`), {
      typeId: drag.typeId,
      tray: side,
    });
    return;
  }

  if (drag.source === "tray") {
    // Any completed drag on a tray token gets a followup update; ownership always released.
    if (drag.disc) drag.disc.cancel();
    if (dropZone?.id === "trash-zone") {
      await remove(roomRef(`tokens/${drag.tokenId}`));
    } else if (side) {
      await update(roomRef(`tokens/${drag.tokenId}`), {
        tray: side,
        ownerSessionId: null,
      });
    } else {
      // Released outside any drop zone — release the lock but leave position untouched.
      await update(roomRef(`tokens/${drag.tokenId}`), {
        ownerSessionId: null,
      });
    }
  }
}

// ---------------- transactions + locks ----------------

async function claimToken(tokenId, uid) {
  const tokenRef = roomRef(`tokens/${tokenId}`);
  const result = await runTransaction(tokenRef, (curr) => {
    if (!curr) return;
    if (curr.ownerSessionId && curr.ownerSessionId !== uid) return;
    return { ...curr, ownerSessionId: uid };
  });
  if (!result.committed && activeDrag?.tokenId === tokenId) {
    // Contested — abort the drag so we don't try to write on drop.
    activeDrag.preview.remove();
    activeDrag = null;
    return;
  }
  if (activeDrag?.tokenId === tokenId) {
    const disc = onDisconnect(tokenRef);
    disc.update({ ownerSessionId: null });
    activeDrag.disc = disc;
  }
}

// ---------------- helpers ----------------

function createPreview(def, x, y) {
  const el = document.createElement("div");
  el.className = "drag-preview";
  el.style.setProperty("--token-color", def.color || "#888");
  el.style.left = x + "px";
  el.style.top = y + "px";
  el.textContent = def.weight ?? "?";
  document.body.appendChild(el);
  return el;
}

function findDropZone(clientX, clientY) {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest("#tray-left, #tray-right, #trash-zone");
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
