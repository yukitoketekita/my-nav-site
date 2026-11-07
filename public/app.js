const $ = selector => document.querySelector(selector);
const state = {categories:[],sites:[],settings:{},category:'all',query:'',admin:false,csrf:'',ready:false};
let toastTimer;
const dialog=$('#editor-dialog');
function el(tag, cls='', content) {const node=document.createElement(tag);if(cls)node.className=cls;if(content!==undefined)node.textContent=content;return node;}
function button(label,cls,action){const b=el('button',cls,label);b.type='button';b.addEventListener('click',action);return b;}
function toast(message,error=false){const node=$('#toast');node.textContent=message;node.dataset.error=String(error);node.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{node.hidden=true;},error?7000:3500);}
async function api(path,{method='GET',data}={}) {
  const headers={};if(data!==undefined)headers['Content-Type']='application/json';if(method!=='GET')headers['X-CSRF-Token']=state.csrf;
  const response=await fetch('/api/'+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data),credentials:'same-origin',cache:'no-store'});
  let result;try{result=await response.json();}catch{throw new Error('服务返回异常，请稍后重试');}
  if(!response.ok){if(response.status===401&&state.admin){state.admin=false;state.csrf='';render();}throw new Error(result.error||'操作失败，请稍后再试');}return result;
}
function validImage(value){if(typeof value!=='string')return '';if(/^data:image\/(png|jpeg|gif|webp|x-icon|vnd.microsoft.icon);base64,[A-Za-z0-9+/]+=*$/.test(value))return value;if(value.startsWith('/')&&!value.startsWith('//')&&!value.includes('\\'))return value;try{const u=new URL(value);if(u.protocol==='https:'&&!u.username&&!u.password)return u.href;}catch{}return '';}
function validLink(value){try{const u=new URL(value);if(['https:','http:'].includes(u.protocol)&&!u.username&&!u.password)return u.href;}catch{}return '';}
function image(url,cls,alt=''){const img=el('img',cls);img.alt=alt;img.referrerPolicy='no-referrer';img.loading='lazy';img.addEventListener('error',()=>{img.hidden=true;});const safe=validImage(url);if(safe)img.src=safe;else img.hidden=true;return img;}
function hostname(url){try{return new URL(url).hostname.replace(/^www\./,'');}catch{return '链接地址无效';}}
function iconUrl(site){return validImage(site.icon)||((validLink(site.url))?'https://www.google.com/s2/favicons?domain='+encodeURIComponent(new URL(site.url).hostname)+'&sz=64':'');}
function applySettings(){const s=state.settings;const title=s.siteTitle||'Yukifly 导航';document.title=title;$('#brand-title').textContent=title;$('#footer-title').textContent=title;$('.mobile-brand').textContent=title+' ↗';$('#site-description').textContent=s.siteDescription||'收藏值得留下的网站，让每一次出发都更简单。';document.querySelector('meta[name=description]').content=s.siteDescription||'收藏常用网站，快速找到下一站。';const background=validImage(s.backgroundUrl);document.body.classList.toggle('has-background',!!background);if(background)document.body.style.setProperty('--nav-background','url('+JSON.stringify(background)+')');else document.body.style.removeProperty('--nav-background');}
function updateFavicon(){const previous=$('#favicon');const link=el('link');link.id='favicon';link.rel='icon';link.href='/favicon?v='+Date.now();previous.replaceWith(link);}
function renderCategories(){
  if(state.category!=='all'&&!state.categories.some(c=>String(c.id)===state.category))state.category='all';
  for(const [target,mobile] of [[$('#categories'),false],[$('#mobile-categories'),true]]){target.replaceChildren();
    for(const [index,c] of [{id:'all',name:'全部网站'},...state.categories].entries()){
      const selected=String(c.id)===state.category;const b=button('','category-button'+(selected?' active':''),()=>{state.category=String(c.id);render();});b.setAttribute('aria-pressed',String(selected));
      b.append(el('span','category-glyph',index===0?'▦':['◈','⌘','▧','◇','⊞','◉'][(index-1)%6]),el('span','category-name',c.name),el('span','category-number',c.id==='all'?state.sites.length:state.sites.filter(s=>s.categoryId===c.id).length));target.append(b);
    }
  }
  const name=state.category==='all'?'全部网站':state.categories.find(c=>String(c.id)===state.category)?.name||'全部网站';$('#breadcrumb-current').textContent=name;$('#collection-title').textContent=state.query?'搜索结果':name;
}
function renderSites(){
  const term=state.query.toLocaleLowerCase();const filtered=state.sites.filter(s=>(state.category==='all'||String(s.categoryId)===state.category)&&(!term||[s.name,s.url,s.description].some(v=>String(v||'').toLocaleLowerCase().includes(term))));
  $('#result-count').textContent=filtered.length;$('#total-count').textContent=state.sites.length+' 个网站 · '+state.categories.length+' 个分类';$('#sidebar-count').textContent=state.sites.length;
  const groups=$('#site-groups');groups.replaceChildren();const empty=$('#load-state');empty.hidden=filtered.length>0;
  if(!filtered.length){empty.replaceChildren(el('span','empty-symbol',state.query?'⌕':'↗'),el('h3','',state.query?'还没有找到匹配的网站':'这里，留给你的常用网站'),el('p','',state.query?'试试其他关键词，或切换到全部网站。':state.admin?'点击“添加链接”，收藏你的第一个网站。':'管理员登录后即可添加分类和网站。'));if(state.query)empty.append(button('清除搜索','button',()=>{$('#search').value='';state.query='';render();}));}
  const ordered=[...state.categories];if(filtered.some(s=>!state.categories.some(c=>c.id===s.categoryId)))ordered.push({id:'orphan',name:'未分类'});
  for(const c of ordered){const sites=filtered.filter(s=>c.id==='orphan'?!state.categories.some(x=>x.id===s.categoryId):s.categoryId===c.id);if(!sites.length)continue;
    const section=el('section','site-group');section.append(el('h3','group-heading',c.name+' · '+sites.length));const grid=el('div','site-grid');
    for(const s of sites){const card=el('article','site-card');const link=el('a','site-link');const url=validLink(s.url);if(url){link.href=url;link.target='_blank';link.rel='noopener noreferrer';}else link.setAttribute('aria-disabled','true');
      const box=el('span','site-icon-box');const fallback=el('span','',Array.from(s.name||'?')[0]);box.append(fallback);const img=image(iconUrl(s),'site-icon');img.addEventListener('load',()=>{fallback.hidden=true;});img.addEventListener('error',()=>{fallback.hidden=false;});if(!img.hidden){box.append(img);img.style.position='absolute';box.style.position='relative';}
      const info=el('div','site-info'),heading=el('h3');heading.append(el('span','',s.name),el('span','external-arrow','↗'));info.append(heading,el('p','',s.description||hostname(s.url)));link.append(box,info);card.append(link);
      if(state.admin)card.append(button('编辑链接与图标','site-edit',()=>openSite(s)));grid.append(card);
    }section.append(grid);groups.append(section);
  }
}
function render(){applySettings();renderCategories();renderSites();$('#edit-toolbar').hidden=!state.admin;$('#admin-badge').hidden=!state.admin;$('#admin-label').textContent=state.admin?'站点设置':'管理导航';$('#mobile-admin').textContent=state.admin?'设置':'管理';}
async function refresh(){const [settings,categories,sites]=await Promise.all([api('settings'),api('categories'),api('sites')]);state.settings=settings;state.categories=categories;state.sites=sites;state.ready=true;render();}
async function write(path,method,data,message){await api(path,{method,data});try{await refresh();}catch{throw new Error('已保存，但页面刷新失败，请重新加载页面确认结果');}toast(message||'已保存，页面已更新');}
function openDialog(title){$('#dialog-title').textContent=title;const content=$('#dialog-content');content.replaceChildren();if(!dialog.open)dialog.showModal();return content;}
function formError(form,error){form.querySelector('.form-error').textContent=error.message||String(error);}
function wireForm(form,action){let pending=false;form.addEventListener('submit',async event=>{event.preventDefault();if(pending)return;pending=true;form.querySelector('.form-error').textContent='';const submit=form.querySelector('[type=submit]');submit.disabled=true;try{await action();}catch(error){formError(form,error);}finally{pending=false;submit.disabled=false;}});return form;}
function actions(form,submitLabel,remove){const row=el('div','form-actions');if(remove)row.append(button('删除','button danger',remove));row.append(button('取消','button',()=>dialog.close()));const save=el('button','button primary',submitLabel);save.type='submit';row.append(save);form.append(el('p','form-error'),row);}
function field(form,label,name,value='',type='text',maxLength=200){const wrapper=el('label','',label);const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;else input.rows=3;input.name=name;input.value=value;input.maxLength=maxLength;wrapper.append(input);form.append(wrapper);return input;}
function selectCategory(form,value){const label=el('label','','所属分类'),select=el('select');select.name='categoryId';select.required=true;for(const c of state.categories){const option=el('option','',c.name);option.value=c.id;select.append(option);}select.value=value||state.categories[0]?.id||'';label.append(select);form.append(label);return select;}
async function rasterize(file){
  if(!file||file.size>5*1024*1024)throw new Error('请选择不超过 5 MB 的图片');
  if(!['image/png','image/jpeg','image/webp','image/gif','image/x-icon','image/vnd.microsoft.icon'].includes(file.type))throw new Error('支持 PNG、JPEG、WebP、GIF、ICO；不接受 SVG');
  const objectUrl=URL.createObjectURL(file);try{const img=new Image();img.src=objectUrl;await img.decode();const ratio=Math.min(1,256/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(img.naturalHeight*ratio));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/png');if(data.length>175000)throw new Error('图片压缩后仍超过 128 KB，请选择更简单的图标');return data;}finally{URL.revokeObjectURL(objectUrl);}
}
function imagePicker(form,title,initial,{upload=true}={}){
  const wrapper=el('div'),label=el('div','field-hint',title),row=el('div','image-picker'),preview=image(initial||'/mark.svg','image-preview','图片预览'),fields=el('div','image-picker-fields'),input=el('input');let value=initial||'',busy=false;input.type='text';input.placeholder='HTTPS 图片地址或 /图片路径';input.setAttribute('aria-label',title+'地址');input.value=value.startsWith('data:')?'':value;
  function show(){preview.hidden=false;preview.src=validImage(value)||'/mark.svg';}
  input.addEventListener('input',()=>{value=input.value.trim();show();});fields.append(input);const controls=el('div','image-buttons');
  if(upload){const uploadLabel=el('label','button small upload-label','上传图片'),file=el('input','upload-input');file.type='file';file.accept='image/png,image/jpeg,image/webp,image/gif,image/x-icon,image/vnd.microsoft.icon';file.setAttribute('aria-label','上传'+title);file.addEventListener('change',async()=>{if(!file.files[0])return;busy=true;try{value=await rasterize(file.files[0]);input.value='';input.placeholder='已选择图片，保存后生效';show();form.querySelector('.form-error').textContent='';}catch(error){formError(form,error);}finally{busy=false;file.value='';}});uploadLabel.append(file);controls.append(uploadLabel);}
  controls.append(button('清除','text-button',()=>{value='';input.value='';input.placeholder='HTTPS 图片地址或 /图片路径';show();}));fields.append(controls);row.append(preview,fields);wrapper.append(label,row);form.append(wrapper);show();return {get value(){if(busy)throw new Error('图片正在处理，请稍候');return value;},set value(v){value=v;input.value=v.startsWith('data:')?'':v;show();}};
}
function openLogin(){
  const content=openDialog('管理员登录'),form=el('form','form-stack');form.append(el('p','form-note','输入管理密码后，可直接编辑页面中的链接、图标和站点设置。登录状态有效期为 8 小时。'));
  const password=field(form,'管理密码','password','','password',1024);password.required=true;password.autocomplete='current-password';actions(form,'登录');content.append(form);
  wireForm(form,async()=>{const result=await api('auth/login',{method:'POST',data:{password:password.value}});password.value='';state.admin=true;state.csrf=result.csrfToken;await refresh();dialog.close();toast('已进入编辑模式，点击卡片即可修改');});password.focus();
}
function openSite(site=null){
  if(!state.categories.length){openCategories();toast('请先添加一个分类');return;}
  const content=openDialog(site?'编辑链接':'添加链接'),form=el('form','form-stack');const name=field(form,'网站名称','name',site?.name||'','text',100);name.required=true;
  const url=field(form,'网站地址','url',site?.url||'','url',4096);url.required=true;url.placeholder='https://example.com';const category=selectCategory(form,site?.categoryId||(state.category!=='all'?state.category:undefined));
  const picker=imagePicker(form,'网站图标',site?.icon||'');const auto=button('使用网站默认图标','text-button',()=>{const v=validLink(url.value);if(!v){formError(form,new Error('请先填写完整的网站地址'));return;}picker.value='https://www.google.com/s2/favicons?domain='+encodeURIComponent(new URL(v).hostname)+'&sz=64';});form.append(auto);
  const description=field(form,'简短描述（可选）','description',site?.description||'','textarea',500);form.append(el('p','field-hint','上传的图标会转为小尺寸 PNG，随链接保存在 D1 中。留空时通过 Google 获取网站图标；无法加载时显示首字。'));
  actions(form,'保存链接',site?()=>confirmDeleteSite(site):null);content.append(form);
  wireForm(form,async()=>{await write(site?'sites/'+site.id:'sites',site?'PUT':'POST',{name:name.value,url:url.value,categoryId:category.value,icon:picker.value,description:description.value},'链接与图标已更新');dialog.close();});name.focus();
}
function confirmDeleteSite(site){const content=openDialog('删除链接？');content.append(el('p','form-note','将删除“'+site.name+'”。此操作无法在页面内撤销。'));const row=el('div','form-actions');row.append(button('返回编辑','button',()=>openSite(site)));const remove=button('确认删除','button danger',async()=>{remove.disabled=true;try{await write('sites/'+site.id,'DELETE',undefined,'链接已删除');dialog.close();}catch(error){toast(error.message,true);remove.disabled=false;}});row.append(remove);content.append(row);}
function categoryForm(category=null){const content=openDialog(category?'编辑分类':'添加分类'),form=el('form','form-stack');const name=field(form,'分类名称','name',category?.name||'','text',60);name.required=true;const label=el('label','','显示位置'),type=el('select');for(const [value,name] of [['sidebar','分类导航'],['topbar','快捷分类']]){const option=el('option','',name);option.value=value;type.append(option);}type.value=category?.type||'sidebar';label.append(type);form.append(label,el('p','field-hint','原有的侧边栏和顶部栏分类都会保留，并统一显示在导航中。'));actions(form,'保存分类');content.append(form);wireForm(form,async()=>{await write(category?'categories/'+category.id:'categories',category?'PUT':'POST',{name:name.value,type:type.value},'分类已更新');openCategories();});name.focus();}
function openCategories(){
  const content=openDialog('分类管理');content.append(el('p','form-note','调整顺序会立即保存。为保护已有链接，只有空分类可以删除。'));
  const list=el('div','category-edit-list');state.categories.forEach((c,index)=>{const row=el('div','category-edit-row');const count=state.sites.filter(s=>s.categoryId===c.id).length;row.append(el('span','category-edit-label',c.name+' · '+count));
    for(const [label,offset] of [['↑',-1],['↓',1]]){const b=button(label,'button small',async()=>{const ids=state.categories.map(x=>x.id);[ids[index],ids[index+offset]]=[ids[index+offset],ids[index]];b.disabled=true;try{await write('categories/order','POST',{orderedIds:ids},'分类顺序已保存');openCategories();}catch(e){toast(e.message,true);b.disabled=false;}});b.disabled=index+offset<0||index+offset>=state.categories.length;b.setAttribute('aria-label',(offset===-1?'上移':'下移')+c.name);row.append(b);}
    row.append(button('编辑','button small',()=>categoryForm(c)));const remove=button('删除','text-button',()=>{const panel=openDialog('删除分类？');panel.append(el('p','form-note','将删除空分类“'+c.name+'”。'));const actions=el('div','form-actions');actions.append(button('取消','button',openCategories));const confirm=button('确认删除','button danger',async()=>{confirm.disabled=true;try{await write('categories/'+c.id,'DELETE',undefined,'分类已删除');openCategories();}catch(e){toast(e.message,true);confirm.disabled=false;}});actions.append(confirm);panel.append(actions);});remove.disabled=count>0;remove.title=count?'请先移动或删除此分类中的链接':'删除空分类';row.append(remove);list.append(row);
  });content.append(list,button('＋ 添加分类','button primary',()=>categoryForm()));
}
function openSettings(){const content=openDialog('站点设置'),form=el('form','form-stack');const title=field(form,'站点名称','siteTitle',state.settings.siteTitle||'Yukifly 导航','text',80);title.required=true;const description=field(form,'首页说明','siteDescription',state.settings.siteDescription||'','textarea',200);const favicon=imagePicker(form,'站点 favicon（浏览器标签页图标）',state.settings.faviconUrl||'');form.append(el('p','field-hint','推荐上传方形图片。保存后立即更新当前标签页图标；上传 GIF 会取静态首帧。'));
  const background=imagePicker(form,'背景图片（可选）',state.settings.backgroundUrl||'',{upload:false});form.append(el('p','field-hint','保留原背景设置，并以低透明度显示。大型背景图片请放入 public 后填写 /文件名。'));actions(form,'保存设置');content.append(form);
  wireForm(form,async()=>{await write('settings','POST',{siteTitle:title.value,siteDescription:description.value,faviconUrl:favicon.value,backgroundUrl:background.value},'设置与 favicon 已更新');updateFavicon();dialog.close();});
}
function theme(value){document.documentElement.dataset.theme=value;$('#theme-button').setAttribute('aria-label',value==='dark'?'切换为浅色主题':'切换为深色主题');try{localStorage.setItem('nav-theme',value);}catch{}}
$('#theme-button').addEventListener('click',()=>theme(document.documentElement.dataset.theme==='dark'?'light':'dark'));try{theme(localStorage.getItem('nav-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));}catch{theme('light');}
$('#dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});dialog.addEventListener('close',()=>{$('#dialog-content').replaceChildren();});
$('#search-form').addEventListener('submit',event=>event.preventDefault());$('#search').addEventListener('input',event=>{state.query=event.target.value.trim();renderCategories();renderSites();});document.addEventListener('keydown',event=>{if(event.key==='/'&&!dialog.open&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)){event.preventDefault();$('#search').focus();}});
for(const selector of ['#admin-button','#mobile-admin'])$(selector).addEventListener('click',()=>state.admin?openSettings():openLogin());
$('#add-site').addEventListener('click',()=>openSite());$('#manage-categories').addEventListener('click',openCategories);$('#settings-button').addEventListener('click',openSettings);
$('#logout-button').addEventListener('click',async()=>{try{await api('auth/logout',{method:'POST'});state.admin=false;state.csrf='';render();toast('已退出管理');}catch(error){toast(error.message,true);}});
$('#export-button').addEventListener('click',async()=>{const b=$('#export-button');b.disabled=true;try{const data=await api('export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=el('a');a.href=url;a.download='navigation-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);toast('已导出链接、分类和站点设置');}catch(error){toast(error.message,true);}finally{b.disabled=false;}});
async function init(){try{await refresh();}catch(error){const panel=$('#load-state');panel.hidden=false;panel.replaceChildren(el('span','empty-symbol','!'),el('h3','','暂时无法加载导航'),el('p','',error.message),button('重新加载','button',()=>location.reload()));$('#total-count').textContent='连接暂不可用';}
  try{const result=await api('auth/session');state.admin=result.authenticated;state.csrf=result.csrfToken;if(state.ready)render();}catch{/* Public navigation remains available if auth migrations are missing. */}
}
init();
