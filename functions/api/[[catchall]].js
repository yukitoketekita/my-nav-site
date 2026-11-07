const COOKIE = '__Host-nav_session';
const TTL = 8 * 60 * 60;
const MAX_BODY = 200000;
const PUBLIC_KEYS = ['siteTitle', 'siteDescription', 'backgroundUrl', 'faviconUrl'];
const encoder = new TextEncoder();
const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cross-Origin-Resource-Policy':'same-origin','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"};
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new ApiError(status, message); };
const json = (data, status=200, extra={}) => new Response(JSON.stringify(data), {status, headers:{...headers,...extra}});
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2,'0')).join('');
const digest = async value => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))), b=>b.toString(16).padStart(2,'0')).join('');
async function equal(a,b) { const x=await digest(a),y=await digest(b); let d=0; for(let i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i); return d===0; }
const cookie = (value,age=TTL) => COOKIE+'='+value+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+age;
function configured(env) { return typeof env.ADMIN_PASSWORD==='string' && env.ADMIN_PASSWORD.length>=16 && !['replace-with-a-random-password-at-least-16-characters','password123'].includes(env.ADMIN_PASSWORD); }
function text(value,max,required=false) { if(typeof value!=='string'||value.length>max||(required&&!value.trim())) fail(400,'字段为空或超出长度限制'); return value.trim(); }
function id(value) { const n=Number(value); if(!Number.isSafeInteger(n)||n<1)fail(400,'无效的编号'); return n; }
function webUrl(value) { const s=text(value,4096,true); let u; try { u=new URL(s); } catch { fail(400,'请输入完整的 http 或 https 网址'); } if(!['http:','https:'].includes(u.protocol)||u.username||u.password)fail(400,'网址仅支持 http 或 https，且不能包含账号密码'); return u.href; }
export function imageValue(value) {
  const s=text(value,180000); if(!s)return '';
  if(s.startsWith('data:')) {
    const match=/^data:image\/(png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
    if(!match || match[2].length%4!==0)fail(400,'仅支持 PNG、JPEG、WebP、GIF 或 ICO 图片');
    let bytes; try { bytes=Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)); }catch {fail(400,'图片内容无效');}
    if(bytes.length>131072)fail(400,'图片不能超过 128 KB');
    const sig=Array.from(bytes.slice(0,12)); const ascii=(start,end)=>String.fromCharCode(...bytes.slice(start,end));
    const ok=match[1]==='png'?sig.slice(0,8).join(',')==='137,80,78,71,13,10,26,10':match[1]==='jpeg'?sig[0]===255&&sig[1]===216&&sig[2]===255:match[1]==='webp'?ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP':match[1]==='gif'?['GIF87a','GIF89a'].includes(ascii(0,6)):sig.slice(0,4).join(',')==='0,0,1,0';
    if(!ok)fail(400,'图片格式与内容不匹配'); return s;
  }
  if(s.startsWith('/')&&!s.startsWith('//')&&!s.includes('\\')&&!/[\u0000-\u001f]/.test(s))return s;
  const u=webUrl(s); if(!u.startsWith('https:'))fail(400,'图片地址请使用 HTTPS'); return u;
}
async function body(request) {
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))fail(415,'仅接受 JSON 请求');
  if(Number(request.headers.get('content-length')||0)>MAX_BODY)fail(413,'请求内容过大');
  const reader=request.body?.getReader(); if(!reader)fail(400,'请求内容为空'); let size=0; const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_BODY){await reader.cancel();fail(413,'请求内容过大');}chunks.push(value);}
  const buffer=new Uint8Array(size);let offset=0;for(const c of chunks){buffer.set(c,offset);offset+=c.length;}
  let data;try{data=JSON.parse(new TextDecoder().decode(buffer));}catch{fail(400,'JSON 格式错误');}
  if(!data||typeof data!=='object'||Array.isArray(data))fail(400,'请求格式错误');return data;
}
function sameOrigin(request) { if(request.headers.get('origin')!==new URL(request.url).origin||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'请从本站发起操作'); }
async function session(request,env) {
  if(!configured(env))return null;
  const token=(request.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
  const row=await env.DB.prepare('SELECT * FROM nav_sessions WHERE token_hash = ? AND expires_at > ?').bind(await digest(token),Math.floor(Date.now()/1000)).first();
  if(!row||!(await equal(row.password_version,await digest(env.ADMIN_PASSWORD))))return null;return row;
}
async function requireAdmin(request,env) { const s=await session(request,env);if(!s)fail(401,'请先登录管理员账号');if(!(await equal(request.headers.get('x-csrf-token')||'',s.csrf)))fail(403,'安全校验失败，请刷新页面重试');return s; }
async function siteInput(data,env) {
  const categoryId=id(data.categoryId);if(!await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(categoryId).first())fail(400,'分类不存在');
  return [categoryId,text(data.name,100,true),webUrl(data.url),imageValue(data.icon??''),text(data.description??'',500)];
}
export async function onRequest({request,env}) {
  try {
    if(!env.DB)fail(503,'尚未绑定 D1 数据库 DB');
    const path=new URL(request.url).pathname.replace(/\/$/,'').split('/').filter(Boolean).slice(1); const route=path.join('/'); const method=request.method;
    const write=!['GET','HEAD'].includes(method);
    const requestUrl=new URL(request.url);
    if((write||route.startsWith('auth/'))&&requestUrl.protocol!=='https:'&&!['localhost','127.0.0.1','[::1]'].includes(requestUrl.hostname))fail(426,'管理操作必须使用 HTTPS');
    if(write)sameOrigin(request);
    if(route==='auth/session'&&method==='GET') { const s=await session(request,env);return json({authenticated:!!s,csrfToken:s?.csrf||'',configured:configured(env)}); }
    if(route==='auth/login'&&method==='POST') {
      if(!configured(env))fail(503,'请在 Cloudflare 中设置至少 16 位的 ADMIN_PASSWORD');
      const data=await body(request);const password=text(data.password,1024,true);const now=Math.floor(Date.now()/1000);const windowStart=now-now%900;
      const ip=request.headers.get('cf-connecting-ip')||'local';const bucket=await digest('login:'+ip+':'+windowStart);
      const attempt=await env.DB.prepare('INSERT INTO nav_login_attempts (bucket,count,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count').bind(bucket,windowStart+900).first();
      if(attempt.count>5)return json({error:'尝试次数过多，请在 15 分钟后再试'},429,{'Retry-After':String(windowStart+900-now)});
      if(!(await equal(password,env.ADMIN_PASSWORD)))fail(401,'密码不正确');
      const token=random(),csrf=random();
      // Revoke the previous browser session when logging in again.
      const old=await session(request,env);
      const stmts=[env.DB.prepare('DELETE FROM nav_sessions WHERE expires_at <= ?').bind(now),env.DB.prepare('DELETE FROM nav_login_attempts WHERE expires_at <= ?').bind(now)];
      if(old)stmts.push(env.DB.prepare('DELETE FROM nav_sessions WHERE token_hash = ?').bind(old.token_hash));
      stmts.push(env.DB.prepare('INSERT INTO nav_sessions (token_hash,csrf,password_version,expires_at) VALUES (?,?,?,?)').bind(await digest(token),csrf,await digest(env.ADMIN_PASSWORD),now+TTL));
      await env.DB.batch(stmts);
      return json({authenticated:true,csrfToken:csrf},200,{'Set-Cookie':cookie(token)});
    }
    if(route==='auth/logout'&&method==='POST') { const s=await requireAdmin(request,env);await env.DB.prepare('DELETE FROM nav_sessions WHERE token_hash = ?').bind(s.token_hash).run();return json({success:true},200,{'Set-Cookie':cookie('',0)}); }
    // Every mutation below is protected, including legacy write API paths.
    if(write)await requireAdmin(request,env);
    if(route==='settings'&&method==='GET') {
      const {results}=await env.DB.prepare("SELECT key,value FROM settings WHERE key IN ('siteTitle','siteDescription','backgroundUrl','faviconUrl')").all();return json(Object.fromEntries(results.map(r=>[r.key,r.value])));
    }
    if(route==='settings'&&method==='POST') {
      const data=await body(request);const entries=Object.entries(data);if(!entries.length||entries.some(([k])=>!PUBLIC_KEYS.includes(k)))fail(400,'设置字段无效');
      const statements=entries.map(([k,v])=>env.DB.prepare('INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,k==='siteTitle'?text(v,80,true):k==='siteDescription'?text(v,200):imageValue(v)));
      await env.DB.batch(statements);return json({success:true});
    }
    if(route==='categories'&&method==='GET')return json((await env.DB.prepare('SELECT * FROM categories ORDER BY COALESCE(displayOrder,id),id').all()).results);
    if(route==='categories/order'&&method==='POST') {
      const {orderedIds}=await body(request);const current=(await env.DB.prepare('SELECT id FROM categories').all()).results.map(r=>r.id);
      if(!Array.isArray(orderedIds)||orderedIds.length>500)fail(400,'分类顺序无效');const ids=orderedIds.map(id);
      if(ids.length!==current.length||new Set(ids).size!==ids.length||ids.some(n=>!current.includes(n)))fail(400,'分类已发生变化，请刷新后重试');
      if(ids.length)await env.DB.batch(ids.map((n,i)=>env.DB.prepare('UPDATE categories SET displayOrder = ? WHERE id = ?').bind(i,n)));return json({success:true});
    }
    if(route==='categories'&&method==='POST') {
      const data=await body(request);if(!['sidebar','topbar'].includes(data.type))fail(400,'分类类型无效');
      const result=await env.DB.prepare('INSERT INTO categories (name,type,displayOrder) VALUES (?,?,(SELECT COALESCE(MAX(displayOrder),0)+1 FROM categories))').bind(text(data.name,60,true),data.type).run();return json({id:result.meta.last_row_id},201);
    }
    if(path[0]==='categories'&&path.length===2&&['PUT','DELETE'].includes(method)) {
      const n=id(path[1]);if(!await env.DB.prepare('SELECT id FROM categories WHERE id = ?').bind(n).first())fail(404,'分类不存在');
      if(method==='DELETE') { if(await env.DB.prepare('SELECT id FROM sites WHERE categoryId = ? LIMIT 1').bind(n).first())fail(409,'请先移动或删除此分类中的链接');await env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(n).run(); }
      else {const d=await body(request);if(!['sidebar','topbar'].includes(d.type))fail(400,'分类类型无效');await env.DB.prepare('UPDATE categories SET name = ?,type = ? WHERE id = ?').bind(text(d.name,60,true),d.type,n).run();}return json({success:true});
    }
    if(route==='sites'&&method==='GET')return json((await env.DB.prepare('SELECT * FROM sites ORDER BY id').all()).results);
    if(route==='sites'&&method==='POST') {const values=await siteInput(await body(request),env);const r=await env.DB.prepare('INSERT INTO sites (categoryId,name,url,icon,description) VALUES (?,?,?,?,?)').bind(...values).run();return json({id:r.meta.last_row_id},201);}
    if(path[0]==='sites'&&path.length===2&&['PUT','DELETE'].includes(method)) {
      const n=id(path[1]);if(!await env.DB.prepare('SELECT id FROM sites WHERE id = ?').bind(n).first())fail(404,'链接不存在');
      if(method==='DELETE')await env.DB.prepare('DELETE FROM sites WHERE id = ?').bind(n).run();
      else await env.DB.prepare('UPDATE sites SET categoryId = ?,name = ?,url = ?,icon = ?,description = ? WHERE id = ?').bind(...await siteInput(await body(request),env),n).run();
      return json({success:true});
    }
    if(route==='export'&&method==='GET') {
      if(!await session(request,env))fail(401,'请先登录管理员账号');
      const result=await env.DB.batch([env.DB.prepare('SELECT * FROM categories ORDER BY id'),env.DB.prepare('SELECT * FROM sites ORDER BY id'),env.DB.prepare('SELECT key,value FROM settings')]);
      return json({version:2,exportedAt:new Date().toISOString(),categories:result[0].results,sites:result[1].results,settings:result[2].results},200,{'Content-Disposition':'attachment; filename="navigation-backup.json"'});
    }
    fail(404,'接口不存在');
  } catch(error) {
    if(error instanceof ApiError)return json({error:error.message},error.status);
    // Never disclose SQL, stack traces, secrets or database details to clients.
    return json({error:'服务暂不可用，请检查数据库绑定和迁移是否完成'},500);
  }
}
