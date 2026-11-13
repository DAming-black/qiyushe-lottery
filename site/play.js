/* Presentation only: only the server assigns and locks lottery outcomes. */
let ticketPlay='capsule';
const playLabels={capsule:'经典扭蛋',wheel:'幸运转盘',scratch:'刮刮乐',game:'小游戏：收集三颗星'};
function updatePlayButton(){
 const mode=ticketPlay==='choice'?(document.getElementById('participantPlay').value||'wheel'):ticketPlay;
 document.getElementById('drawButton').textContent='开始'+(playLabels[mode]||playLabels.capsule)+' ✦';
}
function setupPlay(t){
 ticketPlay=t.playMode||'capsule';
 document.getElementById('playChoice').classList.toggle('hidden',ticketPlay!=='choice'||!!t.drawn_at);
 document.getElementById('participantPlay').disabled=false;
 document.getElementById('playStage').classList.add('hidden');
 document.getElementById('playStage').replaceChildren();
 document.getElementById('playHint').textContent=t.drawn_at?'结果已锁定，切换游乐方式不会重新抽签。':ticketPlay==='choice'?'选一种喜欢的玩法，完成后揭晓同一张签。':(playLabels[ticketPlay]||'经典扭蛋')+' · 完成游玩后揭晓签位';
 updatePlayButton();
}
document.getElementById('participantPlay').onchange=updatePlayButton;
document.getElementById('participation').onchange=()=>{
 const open=document.getElementById('participation').value==='self';
 document.getElementById('rosterField').classList.toggle('hidden',open);
 document.getElementById('capacityField').classList.toggle('hidden',!open);
};
async function runPlay(){
 const select=document.getElementById('participantPlay');
 const mode=ticketPlay==='choice'?(select.value||'wheel'):ticketPlay;
 select.disabled=true;
 const stage=document.getElementById('playStage');
 stage.replaceChildren();stage.className='play-stage';
 if(mode==='capsule'){await new Promise(r=>setTimeout(r,1100));return true;}
 if(mode==='wheel'){
  const hint=document.createElement('p');hint.textContent='转盘正在收集好运，停稳后揭晓你的签位…';
  const wheel=document.createElement('div');wheel.className='luck-wheel';wheel.textContent='✦';
  stage.append(hint,wheel);
  await new Promise(r=>setTimeout(r,30));wheel.style.transform='rotate(1440deg)';
  await new Promise(r=>setTimeout(r,1450));return true;
 }
 return new Promise(resolve=>{
  let settled=false;
  const finish=value=>{if(settled)return;settled=true;stage.replaceChildren();stage.classList.add('hidden');select.disabled=false;resolve(value)};
  const hint=document.createElement('p');
  const cancel=document.createElement('button');cancel.type='button';cancel.className='text-button';cancel.textContent='稍后再玩';cancel.onclick=()=>finish(false);
  if(mode==='game'){
   hint.textContent='点击三颗星星，集齐后揭晓好运。';
   const grid=document.createElement('div');grid.className='star-grid';let stars=0;
   for(let i=0;i<3;i++){
    const star=document.createElement('button');star.type='button';star.textContent='★';star.setAttribute('aria-label','收集第 '+(i+1)+' 颗星');
    star.onclick=()=>{star.disabled=true;star.className='game-done';stars++;hint.textContent='已收集 '+stars+' / 3 颗星';if(stars===3)finish(true)};grid.append(star);
   }
   stage.append(hint,grid,cancel);
  }else{
   hint.textContent='按住涂层来回刮动，刮开约三分之一后揭晓。';
   const canvas=document.createElement('canvas');canvas.width=340;canvas.height=150;canvas.className='scratch-board';canvas.setAttribute('aria-label','刮开幸运涂层');
   const context=canvas.getContext('2d');
   if(context){
    context.fillStyle='#b5a3ee';context.fillRect(0,0,340,150);context.fillStyle='#292b40';context.font='bold 24px sans-serif';context.textAlign='center';context.fillText('✦ 刮开你的好运 ✦',170,84);context.globalCompositeOperation='destination-out';
    let down=false;const cells=new Set();
    const scratch=e=>{if(!down||settled)return;const rect=canvas.getBoundingClientRect();const x=(e.clientX-rect.left)*340/rect.width,y=(e.clientY-rect.top)*150/rect.height;context.beginPath();context.arc(x,y,22,0,Math.PI*2);context.fill();for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const a=Math.floor(x/17)+dx,b=Math.floor(y/15)+dy;if(a>=0&&a<20&&b>=0&&b<10)cells.add(a+20*b)}if(cells.size>=70)finish(true)};
    canvas.onpointerdown=e=>{down=true;canvas.setPointerCapture(e.pointerId);scratch(e)};
    canvas.onpointermove=scratch;canvas.onpointerup=canvas.onpointercancel=()=>{down=false};
   }
   const reveal=document.createElement('button');reveal.type='button';reveal.className='secondary';reveal.textContent='不便刮动？点击揭晓';reveal.onclick=()=>finish(true);
   stage.append(hint,canvas,reveal,cancel);
  }
 });
}
