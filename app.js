// app.js
import { watchAuth, login, logout, user } from "./auth.js";
import { mountCabinet } from "./board.js";
import { qs } from "./utils.js";

let unmount = null;

function show(view){
  document.querySelectorAll("[data-view]").forEach(v=>v.classList.remove("is-active"));
  qs(`[data-view="${view}"]`)?.classList.add("is-active");
}
function setUserUI(u){
  qs("#userEmail").textContent = u ? (u.email || "user") : "гость";
  qs("#loginBtn").style.display = u ? "none" : "";
  qs("#logoutBtn").style.display = u ? "" : "none";
  qs("#cabinetBtn").style.display = u ? "" : "none";
}

qs("#loginBtn").onclick  = ()=>login().catch(err=>alert(err.message));
qs("#logoutBtn").onclick = ()=>logout().catch(err=>alert(err.message));
qs("#cabinetBtn").onclick= ()=>location.hash="#/cabinet";
qs("#homeBtn").onclick   = ()=>location.hash="#/";

qs("#howStartBtn").onclick   = ()=>qs("#howStartModal").classList.add("is-open");
qs("#howStartClose").onclick = ()=>qs("#howStartModal").classList.remove("is-open");
qs("#howStartModal").addEventListener("click",(e)=>{ if(e.target.id==="howStartModal") qs("#howStartModal").classList.remove("is-open"); });

function route(){
  const h = location.hash || "#/";
  const u = user();
  if (h.startsWith("#/cabinet")){
    if (!u){ location.hash="#/"; alert("Нужно войти через Google."); return; }
    show("cabinet");
    if (unmount) unmount();
    unmount = mountCabinet({ uid: u.uid, email: u.email });
  } else {
    show("home");
    if (unmount){ unmount(); unmount=null; }
  }
}

watchAuth((u)=>{ setUserUI(u); route(); });
window.addEventListener("hashchange", route);
document.addEventListener("DOMContentLoaded", route);
