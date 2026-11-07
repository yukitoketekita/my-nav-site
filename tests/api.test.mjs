import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {onRequest,imageValue} from '../functions/api/[[catchall]].js';
import {onRequest as favicon} from '../functions/favicon.js';
import {LocalD1} from './support.mjs';
const password='test-only-strong-password-984602';
export async function runChecks(){
  const DB=new LocalD1(),env={DB,ADMIN_PASSWORD:password};let checks=0;
  const check=(actual,expected,message)=>{assert.deepEqual(actual,expected,message);checks++;};
  const request=async(path,method='GET',data,extras={})=>onRequest({env,request:new Request('https://nav.example/api/'+path,{method,headers:{...(method==='GET'?{}:{Origin:'https://nav.example','Content-Type':'application/json'}),...extras},body:data===undefined?undefined:JSON.stringify(data)})});
  for(const [route,method,data] of [['sites','POST',{}],['sites/1','PUT',{}],['sites/1','DELETE'],['settings','POST',{}],['categories','POST',{}],['categories/1','PUT',{}],['categories/1','DELETE'],['categories/order','POST',{}]])check((await request(route,method,data)).status,401,'unauthorized write rejected: '+route);
  check((await request('export')).status,401,'export private');
  check((await (await request('settings')).json()).privateSetting,undefined,'private settings excluded');
  check((await request('sites')).headers.get('Cache-Control'),'no-store, max-age=0','no API caching');
  check((await request('auth/login','POST',{password}, {Origin:'https://evil.example'})).status,403,'cross-origin login blocked');
  check((await request('auth/login','POST',{password:'wrong'})).status,401,'wrong password');
  const login=await request('auth/login','POST',{password});check(login.status,200,'login');const result=await login.json(),setCookie=login.headers.get('Set-Cookie');
  assert.match(setCookie,/HttpOnly; Secure; SameSite=Strict/);checks++;const auth={Cookie:setCookie.split(';')[0],'X-CSRF-Token':result.csrfToken};
  const stored=DB.db.prepare('SELECT * FROM nav_sessions').get();check(stored.token_hash===auth.Cookie.split('=')[1],false,'raw session token not persisted');
  check((await (await request('auth/session','GET',undefined,auth)).json()).authenticated,true,'session survives reload');
  check((await request('sites/1','PUT',{},{Cookie:auth.Cookie})).status,403,'CSRF required');
  check((await request('sites/1','PUT',{}, {...auth,Origin:'https://evil.example'})).status,403,'cross-origin writes blocked');
  const site={categoryId:1,name:'即时更新',url:'https://updated.example/path',icon:'https://updated.example/new.png',description:'保存后即可看见'};
  check((await request('sites/1','PUT',site,auth)).status,200,'edit existing site');const sites=await (await request('sites')).json();check(sites[0].name,site.name,'updated name immediately visible');check(sites[0].icon,site.icon,'updated icon immediately visible');check(sites[0].id,1,'existing id preserved');
  for(const url of ['javascript:alert(1)','data:text/html,test','https://user:pass@example.com'])check((await request('sites/1','PUT',{...site,url},auth)).status,400,'unsafe link blocked');
  check((await request('sites/1','PUT',{...site,categoryId:999},auth)).status,400,'unknown category rejected');
  check((await request('categories/1','DELETE',undefined,auth)).status,409,'nonempty category protected');
  check((await request('categories/order','POST',{orderedIds:[1,1]},auth)).status,400,'invalid order rejected');
  check((await request('categories/order','POST',{orderedIds:[2,1]},auth)).status,200,'category reorder');
  check((await (await request('categories')).json())[0].id,2,'new order visible');
  const png='data:image/png;base64,'+fs.readFileSync(new URL('./fixtures/icon.png',import.meta.url)).toString('base64');
  check((await request('settings','POST',{siteTitle:'新导航',faviconUrl:png},auth)).status,200,'favicon upload');
  const fav=await favicon({env,request:new Request('https://nav.example/favicon')});check(fav.headers.get('Content-Type'),'image/png','favicon bytes served');check(fav.headers.get('Cache-Control'),'no-store, max-age=0','favicon uncached');
  check(DB.db.prepare("SELECT value FROM settings WHERE key='backgroundUrl'").get().value,'https://example.com/bg.png','background preserved');
  check(DB.db.prepare("SELECT value FROM settings WHERE key='privateSetting'").get().value,'preserve','unrelated setting preserved');
  for(const value of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,PHN2Zz4=','javascript:alert(1)','//evil.example/i.png','/\\evil.example/i.png'])assert.throws(()=>imageValue(value));checks+=5;
  check((await request('settings','POST',{ADMIN_PASSWORD:'leak'},auth)).status,400,'settings whitelist');
  check((await request('export','GET',undefined,auth)).status,200,'authenticated backup');
  check((await request('auth/logout','POST',undefined,auth)).status,200,'logout');check((await request('sites/1','PUT',site,auth)).status,401,'logout revokes session');
  const rateDB=new LocalD1();for(let i=0;i<6;i++){const response=await onRequest({env:{DB:rateDB,ADMIN_PASSWORD:password},request:new Request('https://nav.example/api/auth/login',{method:'POST',headers:{Origin:'https://nav.example','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify({password:'wrong'})})});check(response.status,i<5?401:429,'login throttling');}
  const renewed=await request('auth/login','POST',{password},{'CF-Connecting-IP':'192.0.2.20'});const renewedAuth={Cookie:renewed.headers.get('Set-Cookie').split(';')[0]};env.ADMIN_PASSWORD='changed-strong-password-456789';check((await (await request('auth/session','GET',undefined,renewedAuth)).json()).authenticated,false,'password rotation revokes sessions');
  const disabled=await onRequest({env:{DB},request:new Request('https://nav.example/api/auth/login',{method:'POST',headers:{Origin:'https://nav.example','Content-Type':'application/json'},body:JSON.stringify({password:'password123'})})});check(disabled.status,503,'no default password');
  check(DB.db.prepare('SELECT COUNT(*) AS n FROM sites').get().n,1,'original links retained');
  const insecure=await onRequest({env,request:new Request('http://nav.example/api/auth/login',{method:'POST',headers:{Origin:'http://nav.example','Content-Type':'application/json'},body:JSON.stringify({password})})});check(insecure.status,426,'HTTP admin login refused');
  for(const name of ['0001_base.sql','0002_auth.sql'])DB.db.exec(fs.readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  check(DB.db.prepare('SELECT COUNT(*) AS n FROM sites').get().n,1,'repeated migration preserves links');
  check(DB.db.prepare("SELECT value FROM settings WHERE key='privateSetting'").get().value,'preserve','repeated migration preserves settings');

  DB.db.close();rateDB.db.close();return {passed:checks};
}
test('authorization, CSRF, rate limits, immediate updates and legacy data preservation',async()=>{await runChecks();});

import {runEditingChecks} from './editing.mjs';
test('link ordering, cross category moves and confirmed category deletion',async()=>{await runEditingChecks(onRequest);});
