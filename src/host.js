// Host mode: activated by `?host=<secret>` in the URL. The client hashes the
// secret and writes it as `hostHashProof` on its own presence entry; rules
// only accept `isHost: true` when that hash matches a constant baked into rules.

import { roomRef, update, set, remove } from "./firebase.js";
import { getState, subscribe } from "./state.js";

async function sha256Hex(s) {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function initHost(uid) {
  const params = new URLSearchParams(location.search);
  const secret = params.get("host");
  if (!secret) return;

  // Strip the secret from the address bar so it isn't accidentally shared.
  params.delete("host");
  const clean = location.pathname + (params.toString() ? "?" + params : "") + location.hash;
  history.replaceState(null, "", clean);

  const hash = await sha256Hex(secret);
  try {
    await update(roomRef(`presence/${uid}`), {
      isHost: true,
      hostHashProof: hash,
    });
  } catch (err) {
    alert("Host secret rejected. Check the URL and Firebase rules.");
    console.warn("[host] elevation failed:", err);
    return;
  }
  showHostPanel();
  wireHostButtons();
}

function showHostPanel() {
  const panel = document.getElementById("host-panel");
  if (panel) panel.hidden = false;
}

function wireHostButtons() {
  const $ = (id) => document.getElementById(id);

  const lockBtn = $("host-lock");
  subscribe((state) => {
    if (!lockBtn) return;
    lockBtn.textContent = state.config?.locked ? "Unlock palette" : "Lock palette";
  });

  $("host-reset")?.addEventListener("click", async () => {
    const ok = await openHostForm("Reset trays?", [], { okLabel: "Clear all tokens" });
    if (!ok) return;
    await remove(roomRef("tokens"));
  });

  lockBtn?.addEventListener("click", async () => {
    const state = getState();
    await update(roomRef("config"), { locked: !state.config?.locked });
  });

  $("host-bg")?.addEventListener("click", async () => {
    const state = getState();
    const r = await openHostForm("Change background", [
      { name: "url", label: "Image URL (blank to clear)", value: state.config?.backgroundUrl || "" },
    ]);
    if (!r) return;
    await update(roomRef("config"), { backgroundUrl: r.url });
  });

  $("host-weight-scale")?.addEventListener("click", async () => {
    const state = getState();
    const r = await openHostForm("Set tilt sensitivity", [
      {
        name: "weightScale",
        label: "Sensitivity (positive number, e.g. 1.5)",
        value: state.config?.weightScale ?? 1.5,
        type: "number",
        step: "0.1",
        required: true,
      },
    ]);
    if (!r) return;
    const n = Number(r.weightScale);
    if (!Number.isFinite(n) || n <= 0) return alert("Must be a positive number.");
    await update(roomRef("config"), { weightScale: n });
  });

  $("host-add-token")?.addEventListener("click", async () => {
    const state = getState();
    const types = { ...(state.config?.tokenTypes || {}) };
    const r = await openHostForm("Add token type", [
      { name: "id", label: "ID (letters/numbers, e.g. 'ruby')", value: "", required: true },
      { name: "label", label: "Label", value: "", required: true },
      { name: "weight", label: "Weight (positive integer)", value: 1, type: "number", step: "1", required: true },
      { name: "color", label: "Color", value: "#888888", type: "color" },
    ]);
    if (!r) return;
    const id = r.id.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return alert("ID must be letters, numbers, - or _.");
    if (types[id]) return alert("A token type with that ID already exists.");
    const weight = Number(r.weight);
    if (!Number.isFinite(weight) || weight <= 0) return alert("Weight must be a positive number.");
    types[id] = { label: (r.label || id).trim(), weight, color: r.color || "#888888" };
    await set(roomRef("config/tokenTypes"), types);
  });

  $("host-remove-token")?.addEventListener("click", async () => {
    const state = getState();
    const types = { ...(state.config?.tokenTypes || {}) };
    const ids = Object.keys(types);
    if (ids.length === 0) return alert("No token types to remove.");
    const r = await openHostForm("Remove token type", [
      {
        name: "id",
        label: "Type to remove",
        type: "select",
        value: ids[0],
        required: true,
        options: ids.map((id) => ({
          value: id,
          label: `${id} — ${types[id].label ?? id} (w=${types[id].weight ?? "?"})`,
        })),
      },
    ], { okLabel: "Remove", danger: true });
    if (!r) return;
    delete types[r.id];
    await set(roomRef("config/tokenTypes"), types);
  });
}

// Inline modal replacement for window.prompt/confirm, which are suppressed in
// embedded preview contexts like VS Code Live Preview.
function openHostForm(title, fields, opts = {}) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "host-form-dialog";
    const rows = fields.map((f) => {
      if (f.type === "select") {
        const options = f.options
          .map(
            (o) =>
              `<option value="${escapeAttr(o.value)}"${o.value === f.value ? " selected" : ""}>${escapeHtml(o.label)}</option>`
          )
          .join("");
        return `<label>${escapeHtml(f.label)}<select name="${f.name}"${f.required ? " required" : ""}>${options}</select></label>`;
      }
      const type = f.type || "text";
      const step = f.step ? ` step="${escapeAttr(f.step)}"` : "";
      return `<label>${escapeHtml(f.label)}
        <input name="${f.name}" type="${type}" value="${escapeAttr(String(f.value ?? ""))}"${step}${f.required ? " required" : ""} />
      </label>`;
    }).join("");
    dialog.innerHTML = `
      <form method="dialog">
        <h2>${escapeHtml(title)}</h2>
        ${rows}
        <div class="host-form-actions">
          <button type="submit" value="cancel">Cancel</button>
          <button type="submit" value="ok"${opts.danger ? ' class="danger"' : ""}>${escapeHtml(opts.okLabel || "OK")}</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);
    dialog.showModal();
    const firstField = dialog.querySelector("input, select");
    if (firstField) {
      firstField.focus();
      if (typeof firstField.select === "function" && firstField.type !== "color") firstField.select();
    }
    dialog.addEventListener("close", () => {
      let result = null;
      if (dialog.returnValue === "ok") {
        result = fields.length === 0
          ? true
          : Object.fromEntries(
              fields.map((f) => [f.name, dialog.querySelector(`[name="${f.name}"]`).value])
            );
      }
      dialog.remove();
      resolve(result);
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
