// auth.js
import { auth } from "./firebase-config.js";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const provider = new GoogleAuthProvider();

export function watchAuth(cb){ return onAuthStateChanged(auth, cb); }
export async function login(){ return signInWithPopup(auth, provider); }
export async function logout(){ return signOut(auth); }
export function user(){ return auth.currentUser; }
