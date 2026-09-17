// Tiny reactive store around /rooms/main. Subscribers get the whole state object;
// they're responsible for cheap diffing / early-exits when nothing they care about changed.

import { roomRef, onValue } from "./firebase.js";

const state = {
  config: null,
  tokens: {},
  presence: {},
};

const listeners = new Set();

function emit() {
  for (const fn of listeners) fn(state);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function startStateSync() {
  onValue(roomRef("config"), (snap) => {
    state.config = snap.val() || null;
    emit();
  });
  onValue(roomRef("tokens"), (snap) => {
    state.tokens = snap.val() || {};
    emit();
  });
  onValue(roomRef("presence"), (snap) => {
    state.presence = snap.val() || {};
    emit();
  });
}

// Sum weights per tray using config.tokenTypes to look up each token's weight.
export function sumTrayWeights(tokens, tokenTypes) {
  let left = 0;
  let right = 0;
  for (const t of Object.values(tokens || {})) {
    const w = tokenTypes?.[t.typeId]?.weight ?? 0;
    if (t.tray === "left") left += w;
    else if (t.tray === "right") right += w;
  }
  return { left, right };
}
