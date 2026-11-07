const fallback='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="18" fill="#4263eb"/><path d="m17 19 11 17v12h8V36l11-17h-9l-6 10-6-10z" fill="white"/></svg>';
export async function onRequest({env,request}) {
  const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Referrer-Policy':'no-referrer'};
  try {
    const row=await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('faviconUrl').first(); const value=row?.value||'';
    const match=/^data:(image\/(?:png|jpeg|webp|gif|x-icon|vnd.microsoft.icon));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if(match&&value.length<180000)return new Response(Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)),{headers:{...headers,'Content-Type':match[1]}});
    if(value.startsWith('https://')||(value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\'))) {
      const u=new URL(value,request.url); if(u.pathname!=='/favicon'&&u.pathname!=='/favicon/')return new Response(null,{status:302,headers:{...headers,Location:u.href}});
    }
  } catch { /* The default icon also works before D1 is bound. */ }
  return new Response(fallback,{headers:{...headers,'Content-Type':'image/svg+xml; charset=utf-8'}});
}
