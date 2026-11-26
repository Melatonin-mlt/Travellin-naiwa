// Runs just after the loading screen so its lettering uses the same preference as the game.
window.GameLanguage=(()=>{
 const key='naiwa.v1.lang';
 const preferences=navigator.languages?.length?navigator.languages:[navigator.language];
 const supported=preferences.map(tag=>String(tag).toLowerCase().split(/[-_]/)[0])
  .find(tag=>tag==='zh'||tag==='en');
 let current=supported||'en';
 try{
  const saved=JSON.parse(localStorage.getItem(key));
  if(saved==='zh'||saved==='en')current=saved;
 }catch{}
 function render(){
  document.documentElement.lang=current==='zh'?'zh-CN':'en';
  document.title=current==='zh'?'奶蛙躲猫猫':'Naiwa Hide and Seek';
  for(const img of document.querySelectorAll('img.lettering[data-en]')){
   if(!img.dataset.zh)img.dataset.zh=img.getAttribute('src');
   const src=img.dataset[current];
   if(img.getAttribute('src')!==src)img.setAttribute('src',src);
  }
 }
 function select(language){
  current=language;
  try{localStorage.setItem(key,JSON.stringify(language))}catch{}
 }
 render();
 return {get current(){return current},select,render};
})();
