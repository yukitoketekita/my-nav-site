import assert from 'node:assert/strict';
import {LocalD1} from './support.mjs';
export async function runEditingChecks(onRequest){
 const DB=new LocalD1(),env={DB,ADMIN_PASSWORD:'editing-test-only-password-40986'};let checks=0;
 const check=(value,expected,label)=>{assert.equal(value,expected,label);checks++;};
 const request=(path,method='GET',data,auth={})=>onRequest({env,request:new Request('https://nav.example/api/'+path,{method,headers:{Origin:'https://nav.example','Content-Type':'application/json',...auth},body:data===undefined?undefined:JSON.stringify(data)})});
 try{
  DB.db.exec("INSERT INTO sites(id,categoryId,name,url,icon,description) VALUES (2,1,'二','https://two.example','',''),(3,1,'三','https://three.example','',''),(4,2,'四','https://four.example','','')");
  check((await request('sites/move','POST',{id:1,categoryId:2})).status,401,'move requires authentication');
  const login=await request('auth/login','POST',{password:env.ADMIN_PASSWORD});const data=await login.json();const auth={Cookie:login.headers.get('Set-Cookie').split(';')[0],'X-CSRF-Token':data.csrfToken};
  check((await request('sites/move','POST',{id:3,categoryId:1,beforeId:1},{Cookie:auth.Cookie})).status,403,'move requires CSRF');
  check((await request('sites/move','POST',{id:3,categoryId:1,beforeId:1},{...auth,Origin:'https://evil.example'})).status,403,'move requires same origin');
  check((await request('sites/move','POST',{id:3,categoryId:1,beforeId:1},auth)).status,200,'reorder');
  const list=async()=>await (await request('sites')).json();
  check((await list()).filter(s=>s.categoryId===1).map(s=>s.id).join(','),'3,1,2','order persisted');
  check((await request('sites/move','POST',{id:1,categoryId:2,beforeId:4},auth)).status,200,'cross category move');
  check((await list()).filter(s=>s.categoryId===2).map(s=>s.id).join(','),'1,4','position and category persisted');
  check((await request('sites/move','POST',{id:1,categoryId:2,beforeId:null},auth)).status,200,'append');
  check((await list()).filter(s=>s.categoryId===2).map(s=>s.id).join(','),'4,1','append order');
  check((await request('sites/move','POST',{id:1,categoryId:999},auth)).status,400,'invalid category');
  check((await request('sites/move','POST',{id:999,categoryId:2},auth)).status,404,'invalid site');
  check((await request('sites/move','POST',{id:1,categoryId:2,beforeId:1},auth)).status,400,'self target');
  check((await request('sites/move','POST',{id:1,categoryId:2,beforeId:3},auth)).status,409,'wrong category target');
  check((await (await request('settings')).json())._siteOrder,undefined,'internal order not a public setting');
  check((await request('settings','POST',{_siteOrder:'[]'},auth)).status,400,'order cannot bypass move validation');
  check((await request('categories/2','DELETE',undefined,auth)).status,409,'explicit confirmation required for nonempty category');
  check((await request('categories/2','DELETE',{deleteSites:false},auth)).status,409,'false confirmation refused');
  check((await request('categories/2','DELETE',{deleteSites:true})).status,401,'whole category deletion requires login');
  check((await request('categories/2','DELETE',{deleteSites:true},auth)).status,200,'whole category deletion');
  check(DB.db.prepare('SELECT COUNT(*) AS n FROM sites WHERE categoryId=2').get().n,0,'category children deleted');
  check(DB.db.prepare('SELECT COUNT(*) AS n FROM categories WHERE id=2').get().n,0,'category deleted');
  check((await list()).map(s=>s.id).join(','),'3,2','unrelated links and ordering preserved');
  check(DB.db.prepare("SELECT value FROM settings WHERE key='privateSetting'").get().value,'preserve','unrelated settings preserved');
  const original=(await list()).find(s=>s.id===3);check(original.url,'https://three.example','move preserves URL');
  return {passed:checks};
 }finally{DB.db.close();}
}
