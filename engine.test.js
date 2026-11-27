/* Headless test for Robot Island: the map, belts, machines, goals, costs, upgrades, time away and saving.
   Loads the page's <script> with a stubbed DOM; the game itself never starts (window.__TEST__). */
const fs=require('fs'), path=require('path'), cp=require('child_process');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');

const noop=()=>{};
const documentStub={ getElementById:()=>null, querySelectorAll:()=>[], addEventListener:noop, createElement:()=>({getContext:()=>null}) };
const store=new Map();
const localStorageStub={ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) };
const args=['window','document','localStorage','matchMedia','innerWidth','innerHeight','devicePixelRatio','requestAnimationFrame','addEventListener','navigator','console'];
function loadGame(src,names){
  const js=src.match(/<script>([\s\S]*)<\/script>/)[1];
  return new Function(...args,js+'\n;return {'+names+'};')({__TEST__:true},documentStub,localStorageStub,()=>({matches:false}),390,800,2,()=>0,noop,{},console);
}
const M=loadGame(html,'N,TPS,ROCKET,RES,ITEMS,BUILD,RECIPES,GOALS,GOAL_GIFT,UPGRADES,UP,AWAY_H,HIST_BUCKET_S,FAMILY,KEY,COLORS,OLD_SHIFT,'+
  'genMap,dims,newIsland,unpackIsland,packIsland,place,removeB,placeProblem,setRecipe,turn,face,canFace,placeOver,undoPlace,moveB,moveProblem,stubPlan,madePerMin,maxPerMin,outTiles,step,at,give,creditAway,rateOf,checkGoals,unlocked,'+
  'speedOf,awayHours,buyUpgrade,upgradeProblem,canUpgrade,islandCode,readCode,heal,openIsland,restartIsland,blob,'+
  'getData:function(){return DATA;},setData:function(d){DATA=d;},getISL:function(){return ISL;}');

let fails=0,checks=0;
function ok(c,m){ checks++; if(!c){ fails++; console.log('  FAIL:',m); } }
const N=M.N, R=M.ROCKET.x;
ok(N===96&&R===46&&M.ROCKET.y===46,'96-square map with the rocket in the middle');

/* ---- the map ---- */
const a=M.genMap(1234,2), b=M.genMap(1234,2), c=M.genMap(99,2);
ok(a.ground.every((v,i)=>v===b.ground[i])&&a.res.every((v,i)=>v===b.res[i]),'same seed, same map');
ok(!a.res.every((v,i)=>v===c.res[i]),'different seed, different map');
const nearest=(m,r)=>{ let best=99; for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(m.res[y*N+x]===r) best=Math.min(best,Math.hypot(x+0.5-48,y+0.5-48)); return best; };
for(const seed of [1,2,3,1234,20261126,987654321,555,8080]){
  const m=M.genMap(seed,2), tally=[0,0,0,0,0];
  m.res.forEach(r=>tally[r]++);
  for(let r=1;r<=4;r++) ok(tally[r]>=20,`seed ${seed}: enough ${M.RES[r]} (${tally[r]})`);
  let land=0; m.ground.forEach(g=>{ if(g) land++; });
  ok(land>2000&&land<N*N*0.8,`seed ${seed}: island size ${land}`);
  for(let y=R-1;y<=R+4;y++) for(let x=R-1;x<=R+4;x++)
    ok(m.ground[y*N+x]===2&&!m.res[y*N+x],`seed ${seed}: rocket area clear at ${x},${y}`);
  const near=r=>{ let n=0; for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(m.res[y*N+x]===r&&Math.hypot(x-48,y-48)<16) n++; return n; };
  ok(near(1)>=7&&near(2)>=7,`seed ${seed}: wood and stone not too far (${near(1)}, ${near(2)})`);
  const old=M.genMap(seed,1);
  ok(nearest(m,3)>nearest(old,3)&&nearest(m,4)>nearest(old,4),`seed ${seed}: ore is more spread out (iron ${nearest(old,3).toFixed(1)}→${nearest(m,3).toFixed(1)}, copper ${nearest(old,4).toFixed(1)}→${nearest(m,4).toFixed(1)})`);
}
// Version-1 islands keep exactly the map they had, moved to the middle.
let oldHtml=null;
try{ oldHtml=cp.execSync('git show 1b05dea:index.html',{cwd:__dirname,encoding:'utf8',stdio:['ignore','pipe','ignore']}); }catch(e){}
if(oldHtml){
  const O=loadGame(oldHtml,'genMap');
  for(const seed of [20261126,4242]){
    const o=O.genMap(seed), m=M.genMap(seed,1), S=M.OLD_SHIFT;
    let same=true;
    for(let y=0;y<64;y++) for(let x=0;x<64;x++) if(o.ground[y*64+x]!==m.ground[(y+S)*N+x+S]||o.res[y*64+x]!==m.res[(y+S)*N+x+S]) same=false;
    ok(same,`seed ${seed}: the version-1 map is unchanged`);
  }
} else console.log('  (skipped the version-1 map check: no git history)');

// A test island with a flat, empty strip of grass west of the rocket.
const SX0=R-24, SX1=R-1, SY0=R-4, SY1=R+7;
function testIsland(){
  const isl=M.newIsland(1234,'Test');
  for(let y=SY0;y<=SY1;y++) for(let x=SX0;x<=SX1;x++){ isl.map.ground[y*N+x]=2; isl.map.res[y*N+x]=0; }
  return isl;
}
const run=(isl,n)=>{ for(let i=0;i<n;i++) M.step(isl); };

/* ---- sizes: one square per input ---- */
ok(M.dims('furnace',0)+''==='1,1'&&M.dims('workshop',3)+''==='1,1','furnaces and workshops are 1 square');
ok(M.dims('assembler',0)+''==='1,2'&&M.dims('assembler',1)+''==='2,1','an assembler is 2 squares, across its arrow side');
ok(M.dims('factory',2)+''==='1,3'&&M.dims('factory',3)+''==='3,1','a rocket factory is 3 squares');
for(const t in M.RECIPES){
  if(t==='furnace') continue;
  const len=M.BUILD[t].len;
  M.RECIPES[t].forEach(rc=>ok(Object.keys(rc.in).length===len,`${t} ${rc.id}: ${Object.keys(rc.in).length} inputs for ${len} squares`));
}
M.RECIPES.furnace.forEach(rc=>ok(Object.keys(rc.in).length===1,'furnace '+rc.id+' has one input'));
{
  const isl=testIsland();
  isl.goal=8; isl.store={gear:100,wire:100,ironbar:100,motor:20,chip:20,plate:100};
  const asm=M.place(isl,'assembler',R-20,R,0);
  ok(asm&&asm.w===1&&asm.h===2&&M.at(isl,R-20,R+1)===asm&&!M.at(isl,R-19,R),'assembler takes 1×2 facing east');
  ok(JSON.stringify(M.outTiles(asm))===JSON.stringify([[R-19,R],[R-19,R+1]]),'it puts things out on both squares of its arrow side');
  M.turn(isl,asm);
  ok(asm.r===1&&asm.w===2&&asm.h===1&&M.at(isl,R-19,R)===asm&&!M.at(isl,R-20,R+1),'turning swings it to 2×1');
  M.place(isl,'belt',R-20,R+1,0);
  M.turn(isl,asm);   // facing west would need (R-20,R+1), which now has a belt; facing north fits
  ok(asm.r===3&&asm.w===2,'turning skips a way that doesn’t fit (r='+asm.r+')');
  // pointing it a chosen way (the panel's arrows)
  ok(!M.canFace(isl,asm,2)&&M.canFace(isl,asm,3)&&M.canFace(isl,asm,1),'only ways that fit can be picked');
  ok(!M.face(isl,asm,2)&&asm.r===3,'a blocked way is refused');
  ok(M.face(isl,asm,1)&&asm.r===1&&asm.w===2&&M.at(isl,R-19,R)===asm,'pointing it down');
  const lone=M.place(isl,'belt',R-12,R+4,0);
  ok([0,1,2,3].every(r=>M.canFace(isl,lone,r))&&M.face(isl,lone,3)&&lone.r===3,'a belt can point any way');
  ok(!M.canFace(isl,M.at(isl,R+1,R+1),1),'the rocket doesn’t turn');
  const f=M.place(isl,'factory',R-15,R,0);
  ok(f&&f.h===3,'factory placed');
  M.setRecipe(isl,f,'engine');
  [['motor',2],['chip',2]].forEach(([k,n])=>{ for(let i=0;i<n;i++) M.give(isl,f,k,0,R-16,R); });
  run(isl,150);
  ok(!f.out.engine,'two of three inputs make nothing');
  for(let i=0;i<4;i++) M.give(isl,f,'ironbar',0,R-16,R);
  run(isl,101);
  ok(f.out.engine===1,'motors + chips + iron bars make an engine');
}

/* ---- buildings come with their belts; dropping onto a line ---- */
{
  const isl=testIsland();
  isl.goal=4; isl.store={stone:100,wood:100,gear:50,wire:50,ironbar:50};
  const belt=(x,y)=>{ const b=M.at(isl,x,y); return b&&b.t==='belt'?b.r:null; };
  const f=M.placeOver(isl,'furnace',R-15,R,0);
  ok(f&&f.stubs.length===2&&belt(R-16,R)===0&&belt(R-14,R)===0,'a furnace comes with a belt in behind and one out front');
  ok(isl.free.belt===38,'they’re ordinary belts (free ones first)');
  ok(M.face(isl,f,1)&&belt(R-15,R-1)===1&&belt(R-15,R+1)===1&&belt(R-16,R)===null&&belt(R-14,R)===null,'pointing it another way moves its belts');
  M.undoPlace(isl,f);
  ok(!M.at(isl,R-15,R)&&belt(R-15,R-1)===null&&belt(R-15,R+1)===null&&isl.free.belt===40&&isl.store.stone===100,'Undo takes it all back');
  const a=M.placeOver(isl,'assembler',R-20,R,0);
  ok(a.stubs.length===3&&belt(R-21,R)===0&&belt(R-21,R+1)===0&&belt(R-19,R)===0,'an assembler gets a belt into each of its 2 squares and one out');
  M.face(isl,a,1);
  ok(a.r===1&&a.w===2&&belt(R-20,R-1)===1&&belt(R-19,R-1)===1&&belt(R-20,R+1)===1,'even when it swings around');
  for(const [x,y] of [[R-10,R+4],[R-9,R+4],[R-10,R+5],[R-9,R+5]]) isl.map.res[y*N+x]=1;
  const d=M.placeOver(isl,'drill',R-10,R+4,0);
  ok(d.stubs.length===1&&belt(R-8,R+4)===0,'a drill only gets a belt out');
  const g=M.stubPlan(isl,'furnace',R-6,R+4,2);
  ok(g.length===2&&g.every(p=>p.r===2),'the preview knows the belts too');

  const isl2=testIsland();
  isl2.goal=1; isl2.store={stone:100,wood:100};
  for(let x=R-12;x<R;x++) M.place(isl2,'belt',x,R+2,0);
  M.give(isl2,M.at(isl2,R-8,R+2),'wood',0,R-9,R+2);
  ok(!M.placeProblem(isl2,'furnace',R-8,R+2,0,true)&&M.placeProblem(isl2,'furnace',R-8,R+2,0)==='blocked','buildings can go on top of belts');
  const fu=M.placeOver(isl2,'furnace',R-8,R+2,0);
  ok(fu&&M.at(isl2,R-8,R+2)===fu&&fu.stubs.length===0&&fu.under.length===1,'dropped into the line: nothing extra needed');
  ok(isl2.store.wood===100+1-10&&isl2.free.belt===40-12+1,'the belt under it (and the wood on it) went back (the furnace cost 10 wood)');
  for(let i=0;i<3;i++){ M.give(isl2,M.at(isl2,R-12,R+2),'iron',isl2.tick,R-13,R+2); run(isl2,5); }
  run(isl2,300);
  ok(isl2.got.ironbar===3,'ore on the line becomes bars at the rocket ('+isl2.got.ironbar+')');
  M.undoPlace(isl2,fu);
  ok(M.at(isl2,R-8,R+2)&&M.at(isl2,R-8,R+2).t==='belt'&&M.at(isl2,R-8,R+2).r===0,'Undo puts the line back');
  ok(M.placeProblem(isl2,'furnace',R+1,R+1,0,true)==='blocked','but not on top of other buildings');
}

/* ---- machine status and rates ---- */
{
  const isl=testIsland();
  isl.goal=4; isl.store={stone:100,wood:100,gear:50,wire:50,ironbar:50};
  const f=M.place(isl,'furnace',R-15,R,0), a=M.place(isl,'assembler',R-20,R,0);
  run(isl,100);
  ok(f.st==='wait'&&f.stT>=60,'a furnace with nothing coming is waiting');
  ok(a.st==='none','an assembler with no recipe says so');
  for(const [x,y] of [[R-10,R+4],[R-9,R+4],[R-10,R+5],[R-9,R+5]]) isl.map.res[y*N+x]=1;
  const d=M.place(isl,'drill',R-10,R+4,0);
  run(isl,200);
  ok(d.st==='full','a drill with nowhere to put things is full');
  ok(Math.round(M.maxPerMin(isl,d))===60&&Math.round(M.maxPerMin(isl,f))===40,'most it can make: drill 60/min, furnace 40/min');
}

/* ---- moving a building ---- */
{
  const isl=testIsland();
  isl.goal=4; isl.store={stone:100,wood:100,gear:50,wire:50,ironbar:50};
  const a=M.place(isl,'assembler',R-20,R,0);
  M.setRecipe(isl,a,'motor'); M.give(isl,a,'gear',0,R-21,R);
  const free=isl.free.belt, wood=isl.store.wood;
  ok(M.moveB(isl,a,R-16,R+2,0)&&M.at(isl,R-16,R+2)===a&&M.at(isl,R-16,R+3)===a&&!M.at(isl,R-20,R),'it moves to the new spot');
  ok(a.rc==='motor'&&a.in.gear===1,'keeping its recipe and what it holds');
  ok(a.stubs.length===3&&isl.free.belt===free-3&&isl.store.wood===wood,'and gets belts where it lands (it costs nothing to move)');
  a.stubs=[];
  ok(M.moveB(isl,a,R-16,R+1,0)&&a.y===R+1,'it can land partly on its own old spot');
  ok(M.moveProblem(isl,a,R+1,R+1,0)==='blocked'&&M.moveProblem(isl,M.at(isl,R+1,R+1),R-20,R,0)==='rocket','not onto other buildings, and the rocket stays');
  for(let x=R-12;x<R-6;x++) M.place(isl,'belt',x,R+6,0);
  a.stubs=[];
  ok(M.moveB(isl,a,R-9,R+5,0)&&M.at(isl,R-9,R+6)===a,'it can land on a belt line');
  for(const [x,y] of [[R-20,R+4],[R-19,R+4],[R-20,R+5],[R-19,R+5]]) isl.map.res[y*N+x]=1;
  const d=M.place(isl,'drill',R-20,R+4,0);
  ok(M.moveProblem(isl,d,R-14,R-3,0)==='nores','a drill has to land on something to mine');
}

/* ---- belts ---- */
{
  const isl=testIsland();
  for(let x=R-6;x<R;x++) ok(M.place(isl,'belt',x,R+1,0),'belt placed '+x);
  ok(M.give(isl,M.at(isl,R-6,R+1),'wood',0,R-7,R+1),'item onto a belt');
  run(isl,59);
  ok(!isl.store.wood,'not there yet after 59 steps');
  run(isl,3);
  ok(isl.store.wood===1&&isl.got.wood===1,'6 squares of belt delivers in ~60 steps (store '+isl.store.wood+')');
  const isl2=testIsland();
  for(let x=R-20;x<R-16;x++) M.place(isl2,'belt',x,R-2,0);
  for(let i=0;i<80;i++){ M.give(isl2,M.at(isl2,R-20,R-2),'stone',isl2.tick,R-21,R-2); M.step(isl2); }
  run(isl2,100);
  const held=[0,1,2,3].map(k=>M.at(isl2,R-20+k,R-2).it.length);
  ok(held.every(n=>n===3),'a backed-up belt holds 3 per square ('+held+')');
  const isl3=testIsland();
  M.place(isl3,'belt',R-20,R,0); M.place(isl3,'belt',R-19,R,2);
  ok(!M.give(isl3,M.at(isl3,R-19,R),'wood',0,R-20,R),'a belt won’t pass back into the belt it points at');
}

/* ---- drill → belt → furnace (1 square) → belt → rocket ---- */
function ironLine(up){
  const isl=testIsland();
  for(const [x,y] of [[R-10,R],[R-9,R],[R-10,R+1],[R-9,R+1]]) isl.map.res[y*N+x]=3;
  isl.goal=1; isl.store={stone:100,wood:100}; Object.assign(isl.up,up||{});
  const d=M.place(isl,'drill',R-10,R,0);
  ok(d&&d.res==='iron'&&d.cov===4,'drill on 4 iron squares');
  ok(M.place(isl,'belt',R-8,R,0),'belt from the drill');
  ok(M.place(isl,'furnace',R-7,R,0),'furnace placed');
  for(let x=R-6;x<R;x++) M.place(isl,'belt',x,R,0);
  run(isl,M.TPS*60);
  ok(!isl.got.iron,'ore went into the furnace, not the rocket');
  return isl.got.ironbar||0;
}
const bars=ironLine();
ok(bars>=34&&bars<=40,'iron bars in a minute: '+bars);   // drill 1/s, furnace 1 per 1.5 s
const fastBars=ironLine({drill:1,furnace:2});
ok(fastBars>=bars*1.3,'upgraded drill and furnace make more: '+fastBars);

/* ---- assemblers need both inputs; machines need a recipe ---- */
{
  const isl=testIsland();
  isl.goal=4; isl.store={gear:50,wire:50,ironbar:50,wood:50};
  const asm=M.place(isl,'assembler',R-20,R,0);
  ok(asm,'assembler placed');
  ok(!M.give(isl,asm,'gear',0,R-21,R),'no recipe: takes nothing');
  M.setRecipe(isl,asm,'motor');
  for(let i=0;i<4;i++) ok(M.give(isl,asm,'gear',0,R-21,R),'takes gears');
  ok(!M.give(isl,asm,'gear',0,R-21,R),'but only up to twice what one needs');
  ok(!M.give(isl,asm,'plank',0,R-21,R),'won’t take things it doesn’t use');
  run(isl,200);
  ok(!asm.out.motor&&!asm.cr,'gears alone make nothing');
  for(let i=0;i<4;i++) M.give(isl,asm,'wire',0,R-21,R+1);
  run(isl,61);
  ok(asm.out.motor===1,'gears + wire make a motor');
  const before=isl.store.gear;
  M.setRecipe(isl,asm,'chip');
  ok(isl.store.gear===before+2&&!asm.in.gear,'new recipe returns leftovers');
}

/* ---- costs, free buildings and refunds ---- */
{
  const isl=testIsland();
  ok(isl.free.drill===4&&isl.free.belt===40,'starts with free drills and belts');
  isl.map.res[R*N+R-20]=1;
  const d=M.place(isl,'drill',R-20,R,0);
  ok(d&&d.free&&isl.free.drill===3,'first drills are free');
  M.removeB(isl,d);
  ok(isl.free.drill===4,'removing a free one gives it back');
  isl.free.drill=0; isl.store={wood:5,stone:4};
  ok(M.placeProblem(isl,'drill',R-20,R,0)==='cost','can’t afford a drill with 4 stone');
  isl.store.stone=5;
  const d2=M.place(isl,'drill',R-20,R,0);
  ok(d2&&!isl.store.wood&&!isl.store.stone,'a drill costs 5 wood and 5 stone');
  d2.out={wood:3};
  M.removeB(isl,d2);
  ok(isl.store.wood===8&&isl.store.stone===5,'removing refunds the cost and what it held');
  ok(M.placeProblem(isl,'drill',R-16,R+3,0)==='nores','drills need something to mine');
  ok(M.placeProblem(isl,'belt',0,0,0)==='blocked','nothing goes on water');
  ok(!M.removeB(isl,M.at(isl,R+1,R+1)),'the rocket can’t be removed');
}

/* ---- goals unlock buildings in order ---- */
const makers={};
for(const t in M.RECIPES) M.RECIPES[t].forEach(r=>{ makers[r.out]=t; });
const openBy=(t,g)=>t==='drill'||t==='belt'||M.GOALS.slice(0,g).some(x=>x.unlock===t);   // unlocked after g goals
{
  const isl=testIsland();
  ok(M.unlocked(isl,'drill')&&M.unlocked(isl,'belt'),'drills and belts from the start');
  ok(!M.unlocked(isl,'furnace')&&M.placeProblem(isl,'furnace',R-20,R,0)==='locked','furnace locked at first');
  isl.got={wood:30,stone:29}; M.checkGoals(isl);
  ok(isl.goal===0,'goal 1 needs all 30 stone');
  isl.got.stone=30; M.checkGoals(isl);
  ok(isl.goal===1&&M.unlocked(isl,'furnace')&&!M.unlocked(isl,'workshop'),'goal 1 unlocks the furnace');
  ok(isl.free.belt===40+M.GOAL_GIFT.belt&&isl.ev.length===1&&isl.ev[0].unlock==='furnace','gift and event');
  M.GOALS.forEach(g=>{ for(const k in g.need) isl.got[k]=g.need[k]; });
  M.checkGoals(isl);
  ok(isl.goal===M.GOALS.length,'every goal can be finished');
  ok(M.unlocked(isl,'assembler')&&M.unlocked(isl,'factory'),'assembler and factory unlocked by the end');
  M.GOALS.forEach((g,i)=>{ for(const k in g.need){ const t=makers[k]||'drill'; ok(openBy(t,i),`goal ${i+1}: ${k} comes from ${t}, unlocked by then`); } });
  for(const t in M.BUILD){
    const g=M.GOALS.findIndex(x=>x.unlock===t);
    for(const k in M.BUILD[t].cost){ const m=makers[k]||'drill'; ok(m==='drill'||M.GOALS.findIndex(x=>x.unlock===m)<g,`${t} costs ${k}, made by ${m} (unlocked earlier)`); }
  }
  // every recipe input can be made by a machine unlocked no later than the machine using it
  for(const t in M.RECIPES) M.RECIPES[t].forEach(rc=>{ for(const k in rc.in){ const m=makers[k]||'drill'; ok(m==='drill'||M.GOALS.findIndex(x=>x.unlock===m)<=M.GOALS.findIndex(x=>x.unlock===t),`${t} ${rc.id} needs ${k} from ${m}`); } });
}

/* ---- the upgrade tree ---- */
{
  M.UPGRADES.forEach(u=>{
    u.cost.forEach((c,i)=>{ for(const k in c) ok(!!M.ITEMS[k]&&c[k]>0,`${u.id} ${i+1}: ${k}`); });
    ok((u.x||u.hours).length===u.cost.length,u.id+': an effect per level');
    const fx=u.x||u.hours; ok(fx.every((v,i)=>!i||v>fx[i-1]),u.id+': each level is better');
  });
  const isl=testIsland();
  ok(M.speedOf(isl,'belt')===1&&M.awayHours(isl)===8,'no upgrades at first');
  ok(M.upgradeProblem(isl,'belt')==='cost'&&!M.canUpgrade(isl),'can’t afford one yet');
  ok(M.upgradeProblem(isl,'furnace')==='locked','a machine’s branch waits for the machine');
  isl.store={wood:200,stone:200};
  ok(M.canUpgrade(isl),'now one is affordable');
  ok(M.buyUpgrade(isl,'belt')&&isl.up.belt===1&&isl.store.wood===140&&isl.store.stone===160,'buying takes its cost from the rocket');
  ok(M.speedOf(isl,'belt')===1.5,'belts ×1.5');
  ok(M.upgradeProblem(isl,'belt')==='cost','level II costs other things');
  isl.up.belt=3; ok(M.upgradeProblem(isl,'belt')==='max','three levels at most');
  // faster belts deliver sooner
  for(let x=R-6;x<R;x++) M.place(isl,'belt',x,R+1,0);
  M.give(isl,M.at(isl,R-6,R+1),'wood',isl.tick,R-7,R+1);
  run(isl,26);
  ok(isl.got.wood===1,'belts ×2.5: 6 squares in under 30 steps');
  isl.up.robot=3; ok(M.awayHours(isl)===24,'Night shift III: 24 hours');
}

/* ---- time away ---- */
{
  const isl=testIsland();
  isl.hist=[{wood:10},{wood:10,stone:5}];
  ok(Math.abs(M.rateOf(isl,'wood')-1)<1e-9,'rate is the rolling average');
  ok(M.creditAway(isl,10000)===null,'under 30 seconds: nothing');
  const r=M.creditAway(isl,3600*1000);
  ok(r.items.wood===3600&&r.items.stone===900&&!r.capped,'an hour away');
  ok(isl.store.wood===3600&&isl.got.wood===3600&&isl.goal===1,'away items count for storage and goals');
  const r2=M.creditAway(isl,48*3600*1000);
  ok(r2.capped&&r2.hours===8&&r2.items.wood===8*3600,'capped at 8 hours');
  isl.up.robot=1;
  ok(M.creditAway(isl,48*3600*1000).items.wood===12*3600,'Night shift I: 12 hours');
  const isl2=testIsland();
  for(let x=R-6;x<R;x++) M.place(isl2,'belt',x,R+1,0);
  for(let i=0;i<M.TPS*M.HIST_BUCKET_S*3;i++){ if(i%20===0) M.give(isl2,M.at(isl2,R-6,R+1),'wood',isl2.tick,R-7,R+1); M.step(isl2); }
  ok(isl2.hist.length===3,'history buckets');
  const rate=M.rateOf(isl2,'wood');
  ok(rate>0.8&&rate<=1,'measured rate about 1 a second ('+rate.toFixed(2)+')');
}

/* ---- version-1 saves ---- */
{
  const v1={v:1,seed:4242,name:'Old',tick:500,store:{wood:3},got:{wood:40,stone:30},goal:1,free:{drill:1,belt:10},seen:Date.now(),nid:9,cam:{x:31,y:32,z:40},
    b:[{i:1,t:'rocket',x:30,y:30,r:0},{i:2,t:'drill',x:26,y:27,r:0,out:{wood:2}},{i:3,t:'belt',x:28,y:27,r:0,it:[{k:'wood',p:0.5}]},
       {i:4,t:'furnace',x:24,y:24,r:0,in:{iron:2},out:{ironbar:1}},{i:5,t:'workshop',x:26,y:20,r:0,free:1},
       {i:6,t:'assembler',x:10,y:30,r:1,cr:'motor',p:10}]};
  const isl=M.unpackIsland(v1);
  ok(isl.v===2&&isl.mapv===1,'old islands keep their map');
  ok(isl.b.length===3&&M.at(isl,R+1,R+1).t==='rocket','old furnaces, workshops and assemblers are taken away');
  ok(M.at(isl,42,43)&&M.at(isl,42,43).t==='drill'&&M.at(isl,44,43).t==='belt'&&M.at(isl,44,43).it.length===1,'drills and belts move to the middle with everything on them');
  ok(isl.store.stone===20&&isl.store.wood===3+10&&isl.store.iron===2&&isl.store.ironbar===1+20&&isl.store.gear===10+2&&isl.store.wire===20+4,
    'their cost and contents go back into the rocket ('+JSON.stringify(isl.store)+')');
  ok(isl.free.workshop===1,'a free one comes back free');
  ok(isl.ev.length===1&&isl.ev[0].migrated,'and the screen is told');
  ok(isl.cam.x===47,'the view moves with them');
  const again=M.unpackIsland(JSON.parse(JSON.stringify(M.packIsland(isl))));
  ok(again.b.length===3&&!again.ev.length&&again.mapv===1&&M.at(again,44,43),'it only happens once');
  ok(M.newIsland(5,'New').mapv===2,'new islands get the new map');
}

/* ---- saving and save codes ---- */
(async function(){
  const isl=testIsland();
  for(const [x,y] of [[R-10,R],[R-9,R],[R-10,R+1],[R-9,R+1]]) isl.map.res[y*N+x]=1;
  M.place(isl,'drill',R-10,R,0);
  for(let x=R-8;x<R;x++) M.place(isl,'belt',x,R,0);
  isl.goal=4; isl.store={gear:20,wire:30,ironbar:30}; isl.up={belt:1};
  const asm=M.place(isl,'assembler',R-20,R+2,1); M.setRecipe(isl,asm,'frame');
  run(isl,333);
  const copy=M.unpackIsland(JSON.parse(JSON.stringify(M.packIsland(isl))));
  for(let y=SY0;y<=SY1;y++) for(let x=SX0;x<=SX1;x++){ copy.map.ground[y*N+x]=2; copy.map.res[y*N+x]=isl.map.res[y*N+x]; }
  copy.b.filter(b=>b.t==='drill').forEach(b=>{ b.res='wood'; b.cov=4; });
  ok(copy.b.length===isl.b.length,'same buildings after loading ('+copy.b.length+')');
  ok(JSON.stringify(copy.store)===JSON.stringify(isl.store)&&copy.goal===isl.goal&&copy.up.belt===1,'same storage, goal and upgrades');
  const ca=M.at(copy,R-20,R+2);
  ok(ca.rc==='frame'&&ca.r===1&&ca.w===2&&M.at(copy,R-19,R+2)===ca,'recipes, turns and sizes kept');
  const items=s=>s.b.filter(b=>b.t==='belt').map(b=>b.it.map(q=>q.k+q.p.toFixed(2)).join()).join('|');
  ok(items(copy)===items(isl),'items on belts kept');
  run(isl,200); run(copy,200);
  ok(JSON.stringify(copy.got)===JSON.stringify(isl.got)&&items(copy)===items(isl),'and the copy keeps running the same way');
  const bad=M.unpackIsland({v:2,seed:5,b:[{t:'laser',x:1,y:1},{t:'belt',x:0,y:0,r:0},null,{t:'belt',i:7,x:R+1,y:R+1}]});
  ok(bad.b.length===1&&bad.b[0].t==='rocket','unknown, watery and overlapping buildings are dropped');
  let threw=false; try{ M.unpackIsland({b:[]}); }catch(e){ threw=true; }
  ok(threw,'a save with no seed is refused');

  for(const plain of [false,true]){
    const code=await M.islandCode(isl,plain);
    ok(code.startsWith(plain?'RIp':'RIz'),'code kind '+code.slice(0,3)+' ('+code.length+' chars)');
    const back=await M.readCode(code.replace(/(.{60})/g,'$1\n'));
    ok(back.b.length===isl.b.length&&JSON.stringify(back.got)===JSON.stringify(isl.got),'save code round trip ('+(plain?'plain':'deflated')+')');
  }
  for(const junk of ['hello','RIzAAAA','RIp'+Buffer.from('{"nope":1}').toString('base64')]){
    let msg=''; try{ await M.readCode(junk); }catch(e){ msg=e.message; }
    ok(msg.length>0,'bad code refused: '+junk.slice(0,12)+' → '+msg);
  }

  /* ---- players: seeded by the chore board, saved with their islands ---- */
  store.set(M.KEY,JSON.stringify({v:1,readers:[{name:'Fiona',color:'#FF5C8A',level:'g35'},{name:'Emmett',color:'#2FD9E8',level:'k2'}]}));
  M.setData(JSON.parse(store.get(M.KEY)));
  M.getData().islands=undefined;
  M.heal();
  const D=M.getData();
  ok(D.readers.length===2&&D.readers.every(p=>p.id&&p.color),'seeded players get ids');
  const fiona=D.readers[0].id;
  M.openIsland(fiona);
  ok(M.openIsland(M.FAMILY)===null,'a brand-new island has no time away');
  M.openIsland(fiona);
  const saved=JSON.parse(M.blob());
  ok(saved.v===1&&saved.islands[fiona]&&saved.islands[M.FAMILY]&&saved.last===fiona,'each player has an island, plus the family one');
  ok(saved.islands[M.FAMILY].seed===20261126&&saved.islands[fiona].seed!==20261126,'family island has its own map');
  ok(!('map' in saved.islands[fiona])&&!('occ' in saved.islands[fiona]),'maps aren’t saved (rebuilt from the seed)');
  M.getISL().goal=3;
  const fresh=M.restartIsland();
  ok(fresh.goal===0&&fresh.mapv===2&&M.getData().islands[fiona].goal===0,'starting over makes a new island');
  ok(/const KEY='robotisland:v1'/.test(html)&&/JSON\.stringify\(\{v:1,/.test(html)&&/const COLORS=\[/.test(html),'the chore board can seed players');
  ok((html.match(/<script>/g)||[]).length===1,'one script tag');

  console.log(`${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})();
