/* The same selector is used by the offline preview and the distribution test. */
(function (root) {
  'use strict';
  function randomSource(seed) {
    let state = seed >>> 0;
    return () => {
      state += 0x6D2B79F5;
      let t = Math.imul(state ^ state >>> 15, 1 | state);
      t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function select(config, seed) {
    const random = randomSource(seed);
    const shuffled = config.candidates.map(c => ({c, key: random()}))
      .sort((a, b) => a.key - b.key).map(item => item.c);
    const zones = Object.keys(config.quotas);
    const chosen = [];
    const poseOf = item => item.pose || config.poses[0];
    function visit(index) {
      if (index === zones.length) return chosen.length === config.count && Object.entries(config.poseQuotas || {}).every(([pose, count]) => chosen.filter(c => poseOf(c) === pose).length === count);
      const zone = zones[index], items = shuffled.filter(c => c.zone === zone);
      function choose(start, remaining) {
        if (!remaining) return visit(index + 1);
        for (let i = start; i <= items.length - remaining; i++) {
          const item = items[i];
          if (config.poseQuotas && chosen.filter(c => poseOf(c) === poseOf(item)).length >= config.poseQuotas[poseOf(item)]) continue;
          if (chosen.some(p => Math.hypot(p.x - item.x, p.bottom - item.bottom) < config.minimumDistance || (item.conflicts || []).includes(p.id) || (p.conflicts || []).includes(item.id))) continue;
          chosen.push(item);
          if (choose(i + 1, remaining - 1)) return true;
          chosen.pop();
        }
        return false;
      }
      return choose(0, config.quotas[zone]);
    }
    if (!visit(0)) throw new Error('候选点无法满足数量、分区和间距约束');
    return chosen.map(c => c.id);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {select};
  else root.ParkRandom = {select};
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* Shared by the game bootstrap and tests. Candidate artwork is never reshaped. */
(function(root){
 'use strict';
 function targetsFor(config,seed,select){
  const ids=new Set(select(config,seed));
  return config.candidates.filter(c=>ids.has(c.id)).map(c=>({
   gameId:c.id,zone:c.zone,pose:c.pose||config.poses[0],
   species:(c.pose||config.poses[0])==='egg'?'egg':'frog',
   bounds:c.bounds.slice(),cx:c.bounds[0]+c.bounds[2]/2,cy:c.bounds[1]+c.bounds[3]/2
  }));
 }
 function progress(completed,ids){return Math.round(ids.filter(id=>completed&&completed[id]===true).length/ids.length*100)}
 function savedRun(saved,seed){return saved&&saved.version===1&&saved.seed===seed&&Array.isArray(saved.found)?saved:{}}
 function canPlay(catalog,id,completed){
  const index=catalog.findIndex(level=>level.id===id);
  if(index<0)return false;
  return index===0 || completed[id]===true || completed[catalog[index-1].id]===true;
 }
 const api={targetsFor,progress,savedRun,canPlay};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LevelSession=api;
})(typeof globalThis!=='undefined'?globalThis:this);

/* The home screen stays light: only the selected map is inserted into the DOM. */
(async()=>{
 'use strict';
 const $=id=>document.getElementById(id),catalog=JSON.parse($('level-catalog').textContent);
 const scenes=new Map();
 function sceneText(id){
  const entry=$(id);
  if(!entry.dataset.url)return Promise.resolve(JSON.parse(entry.textContent));
  if(!scenes.has(id)){
   const request=fetch(entry.dataset.url).then(response=>{
    if(!response.ok)throw Error('Could not load '+entry.dataset.url);
    return response.text();
   }).catch(error=>{scenes.delete(id);throw error});
   scenes.set(id,request);
  }
  return scenes.get(id);
 }
 const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
 const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
 window.addEventListener('keydown',event=>{
  if(event.key.toLowerCase()!=='x'||event.shiftKey||event.altKey||event.ctrlKey||event.metaKey||event.isComposing)return;
  event.preventDefault();
  if(event.repeat)return;
  const english=document.documentElement.lang==='en';
  const prompt=english?'Erase all map progress and unlocks on this device?':'清空本机全部地图的寻找进度和解锁记录，回到第一关？';
  if(!window.confirm(prompt))return;
  try{
   const saveKeys=['naiwa.v2.completed','naiwa.v1.progress','naiwa.v1.progress.bak',
    ...catalog.map(level=>'naiwa.v2.progress.'+level.id)];
   for(const key of saveKeys)localStorage.removeItem(key);
  }catch{
   window.alert(english?'Could not clear saved progress.':'清空存档失败，请重试。');
   return;
  }
  InkTransition.leave(()=>location.replace(location.pathname));
 },true);
 const frame=()=>new Promise(r=>requestAnimationFrame(r)),painted=async()=>{await frame();await frame()};
 const music=$('background-music');
 const play=()=>{if(read('naiwa.v1.sound')===true||document.hidden)return;music.volume=.6;const p=music.play();if(p)p.catch(()=>{})};
 let homeLanguage=GameLanguage.current;
 function homeLang(){
  GameLanguage.render();
  for(const el of document.querySelectorAll('[data-home-zh]'))el.textContent=el.dataset[homeLanguage==='zh'?'homeZh':'homeEn'];
  $('lang-label').textContent=homeLanguage==='zh'?'EN':'中';
  $('lang-toggle').setAttribute('aria-label',homeLanguage==='zh'?'Switch to English':'切换到中文');
 }
 function homeSound(){const muted=read('naiwa.v1.sound')===true;music.muted=muted;$('sound-toggle').classList.toggle('muted',muted);$('sound-toggle').setAttribute('aria-pressed',String(muted));$('sound-toggle').setAttribute('aria-label',muted?'打开声音':'关闭声音');if(muted)music.pause();else play()}
 function home(){
  const runs=catalog.map(level=>({level,save:read('naiwa.v2.progress.'+level.id)}));
  async function previewScene({level,save}){
   const world=new DOMParser().parseFromString(await sceneText('scene-'+level.id+'-data'),'image/svg+xml').documentElement;
   const targets=LevelSession.targetsFor(level.config,save?.seed??0,ParkRandom.select);
   const chosen=new Set(targets.map(t=>t.gameId));
   const found=new Set(save?.found||[]);
   for(const g of world.querySelectorAll('.candidate')){
    if(!chosen.has(g.id)){g.remove();continue}
    g.classList.add('active');g.classList.toggle('found',found.has(g.id));
   }
   const last=[...found].pop();
   return {world,focus:targets.find(t=>t.gameId===last)||targets[0]};
  }
  function showPicker(visible){
   if(visible)for(const run of runs){
    const img=document.querySelector('[data-level="'+run.level.id+'"] .level-preview img');
    if(!img.hasAttribute('src')){
     previewScene(run).then(({world})=>{
      if(img.isConnected&&!img.hasAttribute('src'))img.src=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(world)],{type:'image/svg+xml'}));
     }).catch(console.error);
    }
   }
   $('home-layout').hidden=visible;
   $('level-picker').hidden=!visible;
   (visible?$('picker-title'):$('start')).focus({preventScroll:true});
  }
  document.body.classList.add('at-home');$('home-screen').hidden=false;
  const completed=read('naiwa.v2.completed')||{};
  const percent=LevelSession.progress(completed,catalog.map(l=>l.id));
  $('home-progress').textContent=percent;
  if(percent===100){
   const art=$('home-mascot-art');
   art.src=art.dataset.completedSrc;
   art.alt='彩色捧腹笑奶蛙';
   art.parentElement.classList.add('completed');
  }
  for(const card of document.querySelectorAll('[data-level]')){
   card.disabled=!LevelSession.canPlay(catalog,card.dataset.level,completed);
   card.querySelector('.level-lock').hidden=!card.disabled;
   const done=card.querySelector('.level-done');done.hidden=completed[card.dataset.level]!==true;
   card.onclick=()=>InkTransition.run(async()=>{const seed=crypto.getRandomValues(new Uint32Array(1))[0];const url=new URL(location.href);url.search='';url.searchParams.set('level',card.dataset.level);url.searchParams.set('seed',seed);history.pushState({fromPicker:true},'',url);await launch(card.dataset.level,seed)});
  }
  $('start').onclick=()=>InkTransition.run(()=>{history.pushState({fromHome:true},'','?view=maps');showPicker(true)});
  $('picker-back').onclick=()=>{
   if(history.state?.fromHome){history.back();return}
   InkTransition.run(()=>{history.replaceState({},'',location.pathname);showPicker(false)});
  };
  if(new URLSearchParams(location.search).get('view')==='maps')showPicker(true);
  $('lang-toggle').onclick=()=>{homeLanguage=homeLanguage==='zh'?'en':'zh';GameLanguage.select(homeLanguage);homeLang()};
  $('sound-toggle').onclick=()=>{write('naiwa.v1.sound',read('naiwa.v1.sound')!==true);homeSound()};
  $('share-toggle').onclick=async()=>{
   const recent=runs.filter(run=>run.save?.found?.length).sort((a,b)=>(b.save.updatedAt||0)-(a.save.updatedAt||0))[0];
   try{openShareCard({...await previewScene(recent||runs[0]),percent})}
   catch{window.alert(homeLanguage==='en'?'Could not load the map. Please try again.':'地图加载失败，请重试。')}
  };
  homeLang();homeSound();
 }
 let launching=false;
 async function launch(id,seed){
  if(launching)return;launching=true;
  const level=catalog.find(l=>l.id===id);if(!level){launching=false;home();return}
  if(!LevelSession.canPlay(catalog,id,read('naiwa.v2.completed')||{})){
   history.replaceState({},'','?view=maps');
   launching=false;
   home();
   document.body.classList.remove('loading');
   $('loading-screen').hidden=true;
   return;
  }
  try{
   document.body.classList.add('loading');$('loading-screen').hidden=false;await painted();
   let svg,targets;
   if(level.random){
    svg=await sceneText('scene-'+id+'-data');
    targets=LevelSession.targetsFor(level.config,seed,ParkRandom.select);
   }else{
    svg=await sceneText('scene-data');
    const entry=$('target-data');
    targets=JSON.parse(entry.dataset.url?await sceneText('target-data'):entry.textContent);
   }
   $('stage').innerHTML=svg;
   const world=$('stage').querySelector('svg');world.id='world';
   if(level.random){
    const chosen=new Map(targets.map(t=>[t.gameId,t]));
    for(const g of world.querySelectorAll('.candidate')){
     const target=chosen.get(g.id);if(!target){g.remove();continue}
     g.classList.add('target','active');g.dataset.id=g.id;g.dataset.species=target.species;
     g.setAttribute('tabindex','0');g.setAttribute('role','button');g.setAttribute('aria-pressed','false');g.setAttribute('aria-label',target.species==='egg'?'奶蛋':'奶蛙');
    }
   }
   $('target-data').textContent=JSON.stringify(targets);window.NaiwaLevel={...level,seed};
   $('home-screen').hidden=true;document.body.classList.remove('at-home');
   await painted();
   const runtime=document.createElement('script');runtime.textContent=JSON.parse($('runtime-data').textContent);document.body.append(runtime);
   if(!document.body.dataset.gameReady)throw new Error('Game initialization incomplete');
   $('scene-back').onclick=()=>{
    if(history.state?.fromPicker)history.back();
    else InkTransition.leave(()=>location.replace('?view=maps'));
   };
   $('scene-back').hidden=false;
   document.body.classList.remove('loading');$('loading-screen').hidden=true;
   for(const el of document.querySelectorAll('script[id^="scene-"]'))el.remove();
  }catch(error){$('loading-label').textContent='地图加载失败，请重试';$('loading-retry').hidden=false;console.error(error)}
 }
 document.addEventListener('pointerdown',play,{capture:true});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)music.pause();else play()});
 window.addEventListener('popstate',()=>{if(InkTransition.busy)location.reload();else InkTransition.leave(()=>location.reload())});
 play();await painted();
 const params=new URLSearchParams(location.search),id=params.get('level');
 if(catalog.some(l=>l.id===id)){
  let seed=Number(params.get('seed'));
  if(!params.has('seed')||!Number.isInteger(seed)||seed<0||seed>4294967295){seed=crypto.getRandomValues(new Uint32Array(1))[0];params.set('seed',seed);history.replaceState({},'','?'+params)}
  await launch(id,seed);
 }else{
  const enterHome=()=>{
   home();
   document.body.classList.remove('loading');
   $('loading-screen').hidden=true;
  };
  if(params.get('view')==='maps'||document.documentElement.classList.contains('ink-arriving')){
   enterHome();
  }else{
   await InkTransition.run(enterHome);
  }
 }
 await InkTransition.arrive();
})();
