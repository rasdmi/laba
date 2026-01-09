// utils.js
export function escapeHtml(s){
  return (s||"").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[m]));
}
export function qs(sel, root=document){ return root.querySelector(sel); }
export function youtubeId(url){
  if (!url) return null;
  try{
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace("/","") || null;
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v") || null;
    return null;
  }catch{ return null; }
}
export function vimeoId(url){
  if (!url) return null;
  try{
    const u = new URL(url);
    if (!u.hostname.includes("vimeo.com")) return null;
    const m = u.pathname.match(/\/([0-9]+)/);
    return m ? m[1] : null;
  }catch{ return null; }
}
export function isImageUrl(url){ return /\.(png|jpg|jpeg|webp|gif|avif)(\?.*)?$/i.test(url||""); }
export function isVideoFileUrl(url){ return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url||""); }
export function guessKind(url){
  if (!url) return "link";
  if (youtubeId(url)) return "youtube";
  if (vimeoId(url)) return "vimeo";
  if (isImageUrl(url)) return "image";
  if (isVideoFileUrl(url)) return "video";
  return "link";
}
export function formatDate(ts){
  try{
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null);
    if (!d) return "";
    return d.toLocaleString();
  }catch{ return ""; }
}
