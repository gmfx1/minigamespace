// Firebase bootstrap. Uses the ESM CDN so no bundler is needed on GitHub Pages.
// Web keys are safe to commit; access is enforced server-side by firebase.rules.json.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getDatabase,
  ref,
  onValue,
  set,
  update,
  remove,
  onDisconnect,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyB1LmsgFWkM8pHC9CToU4aCKw4lObzgnHQ",
  authDomain: "minigamespacertd.firebaseapp.com",
  databaseURL: "https://minigamespacertd-default-rtdb.firebaseio.com",
  projectId: "minigamespacertd",
  storageBucket: "minigamespacertd.firebasestorage.app",
  messagingSenderId: "667568335371",
  appId: "1:667568335371:web:e8b8b8fccf17552a73b50e",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);

export const ROOM_PATH = "rooms/main";

export function roomRef(subPath = "") {
  return ref(db, subPath ? `${ROOM_PATH}/${subPath}` : ROOM_PATH);
}

export async function signIn() {
  const { user } = await signInAnonymously(auth);
  return user;
}

export {
  ref,
  onValue,
  set,
  update,
  remove,
  onDisconnect,
  serverTimestamp,
  runTransaction,
};
