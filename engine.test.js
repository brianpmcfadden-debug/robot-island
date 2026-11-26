/* Headless test for Robot Island: the map, belts, machines, goals, costs, time away and saving.
   Loads the page's <script> with a stubbed DOM; the game itself never starts (window.__TEST__). */
const fs=require('fs'), path=require('path');
const html=fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const js=html.match(/<script>([\s\S]*)<\/script>/)[1];

const noop=()=>{};
const documentStub={ getElementById:()=>null, querySelectorAll:()=>[], addEventListener:noop, createElement:()=>({getContext:()=>null}) };
const store=new Map();
const localStorageStub={ getItem:k=>store.has(k)?store.get(k):null, setItem:(k,v)=>store.set(k,String(v)), removeItem:k=>store.delete(k) };

const args=['window','document','localStorage','matchMedia','innerWidth','innerHeight','devicePixelRatio','requestAnimationFrame','addEventListener','navigator','console'];
const body=js+'\n;return {N,TPS,ROCKET,RES,ITEMS,BUILD,RECIPES,GOALS,GOAL_GIFT,AWAY_CAP_S,HIST_BUCKET_S,FAMILY,KEY,COLORS,'+
  'genMap,newIsland,unpackIsland,packIsland,place,removeB,placeProblem,setRecipe,step,at,give,creditAway,rateOf,checkGoals,unlocked,islandCode,readCode,heal,openIsland,blob,'+
  'getData:function(){return DATA;},setData:function(d){DATA=d;}};';
const M=new Function(...args,body)({__TEST__:true},documentStub,localStorageStub,()=>({matches:false}),390,800,2,()=>0,noop,{},console);

let fails=0,checks=0;
function ok(c,m){ checks++; if(!c){ fails++; console.log('  FAIL:',m); } }
const N=M.N;

/* ---- the map ---- */
const a=M.genMap(1234), b=M.genMap(1234), c=M.genMap(99);
ok(a.ground.every((v,i)=>v===b.ground[i])&&a.res.every((v,i)=>v===b.res[i]),'same seed, same map');
ok(!a.res.every((v,i)=>v===c.res[i]),'different seed, different map');
for(const seed of [1,2,3,1234,20261126,987654321]){
  const m=M.genMap(seed), tally=[0,0,0,0,0];
  m.res.forEach(r=>tally[r]++);
  for(let r=1;r<=4;r++) ok(tally[r]>=14,`seed ${seed}: enough ${M.RES[r]} (${tally[r]})`);
  let land=0; m.ground.forEach(g=>{ if(g) land++; });
  ok(land>900&&land<N*N*0.8,`seed ${seed}: island size ${land}`);
  for(let y=M.ROCKET.y-1;y<=M.ROCKET.y+4;y++) for(let x=M.ROCKET.x-1;x<=M.ROCKET.x+4;x++)
    ok(m.ground[y*N+x]===2&&!m.res[y*N+x],`seed ${seed}: rocket area clear at ${x},${y}`);
  // a near patch of wood and of stone, so the first goal is quick
  const near=r=>{ let n=0; for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(m.res[y*N+x]===r&&Math.hypot(x-32,y-32)<13) n++; return n; };
  ok(near(1)>=7&&near(2)>=7,`seed ${seed}: wood and stone near the rocket (${near(1)}, ${near(2)})`);
}

// A test island with a flat, empty strip of grass west of the rocket (rows 26–37, columns 6–29).
function testIsland(){
  const isl=M.newIsland(1234,'Test');
  for(let y=26;y<=37;y++) for(let x=6;x<30;x++){ isl.map.ground[y*N+x]=2; isl.map.res[y*N+x]=0; }
  return isl;
}
const run=(isl,n)=>{ for(let i=0;i<n;i++) M.step(isl); };

/* ---- belts ---- */
{
  const isl=testIsland();
  for(let x=24;x<30;x++) ok(M.place(isl,'belt',x,31,0),'belt placed '+x);
  const first=M.at(isl,24,31);
  ok(M.give(isl,first,'wood',0,23,31),'item onto a belt');
  run(isl,59);
  ok(!isl.store.wood,'not there yet after 59 steps');
  run(isl,3);
  ok(isl.store.wood===1&&isl.got.wood===1,'6 squares of belt delivers in ~60 steps (store '+isl.store.wood+')');
  // a full belt holds 3 a square and backs up behind a dead end
  const isl2=testIsland();
  for(let x=10;x<14;x++) M.place(isl2,'belt',x,28,0);
  for(let i=0;i<80;i++){ M.give(isl2,M.at(isl2,10,28),'stone',isl2.tick,9,28); M.step(isl2); }
  run(isl2,100);
  const held=[10,11,12,13].map(x=>M.at(isl2,x,28).it.length);
  ok(held.every(n=>n===3),'a backed-up belt holds 3 per square ('+held+')');
  // two belts facing each other don't swap items
  const isl3=testIsland();
  M.place(isl3,'belt',10,30,0); M.place(isl3,'belt',11,30,2);
  ok(!M.give(isl3,M.at(isl3,11,30),'wood',0,10,30),'a belt won’t pass back into the belt it points at');
}

/* ---- drill → belt → furnace → belt → rocket ---- */
{
  const isl=testIsland();
  for(const [x,y] of [[20,30],[21,30],[20,31],[21,31]]) isl.map.res[y*N+x]=3;   // iron ore
  isl.goal=1;   // furnace unlocked
  isl.store={stone:100,wood:100};
  const d=M.place(isl,'drill',20,30,0);
  ok(d&&d.res==='iron'&&d.cov===4,'drill on 4 iron squares');
  ok(M.place(isl,'belt',22,30,0),'belt from the drill');
  const f=M.place(isl,'furnace',23,30,0);
  ok(f,'furnace placed');
  for(let x=25;x<30;x++) M.place(isl,'belt',x,30,0);
  run(isl,M.TPS*60);
  const bars=isl.got.ironbar||0;
  // drill: 1 a second; furnace: 1 per 1.5 s, so ~40 bars a minute less the start-up
  ok(bars>=34&&bars<=40,'iron bars in a minute: '+bars);
  ok(!isl.got.iron,'ore went into the furnace, not the rocket');
}

/* ---- assemblers need both inputs; workshops need a recipe ---- */
{
  const isl=testIsland();
  isl.goal=4;
  isl.store={gear:50,wire:50,ironbar:50,wood:50};
  const asm=M.place(isl,'assembler',10,30,0);
  ok(asm,'assembler placed');
  ok(!M.give(isl,asm,'gear',0,9,30),'no recipe: takes nothing');
  M.setRecipe(isl,asm,'motor');
  for(let i=0;i<4;i++) ok(M.give(isl,asm,'gear',0,9,30),'takes gears');
  ok(!M.give(isl,asm,'gear',0,9,30),'but only up to twice what one needs');
  ok(!M.give(isl,asm,'plank',0,9,30),'won’t take things it doesn’t use');
  run(isl,200);
  ok(!asm.out.motor&&!asm.cr,'gears alone make nothing');
  for(let i=0;i<4;i++) M.give(isl,asm,'wire',0,9,30);
  run(isl,61);
  ok(asm.out.motor===1,'gears + wire make a motor');
  // changing the recipe hands back what it held
  const before=isl.store.gear;
  M.setRecipe(isl,asm,'chip');
  ok(isl.store.gear===before+2&&!asm.in.gear,'new recipe returns leftovers ('+before+' → '+isl.store.gear+')');
}

/* ---- costs, free buildings and refunds ---- */
{
  const isl=testIsland();
  ok(isl.free.drill===4&&isl.free.belt===40,'starts with free drills and belts');
  isl.map.res[30*N+10]=1;
  const d=M.place(isl,'drill',10,30,0);
  ok(d&&d.free&&isl.free.drill===3,'first drills are free');
  M.removeB(isl,d);
  ok(isl.free.drill===4,'removing a free one gives it back');
  isl.free.drill=0; isl.store={wood:5,stone:4};
  ok(M.placeProblem(isl,'drill',10,30)==='cost','can’t afford a drill with 4 stone');
  isl.store.stone=5;
  const d2=M.place(isl,'drill',10,30,0);
  ok(d2&&!isl.store.wood&&!isl.store.stone,'a drill costs 5 wood and 5 stone');
  d2.out={wood:3};
  M.removeB(isl,d2);
  ok(isl.store.wood===8&&isl.store.stone===5,'removing refunds the cost and what it held ('+JSON.stringify(isl.store)+')');
  ok(M.placeProblem(isl,'drill',14,33)==='nores','drills need something to mine');
  ok(M.placeProblem(isl,'belt',0,0)==='blocked','nothing goes on water');
  ok(!M.removeB(isl,M.at(isl,31,31)),'the rocket can’t be removed');
}

/* ---- goals unlock buildings in order ---- */
{
  const isl=testIsland();
  ok(M.unlocked(isl,'drill')&&M.unlocked(isl,'belt'),'drills and belts from the start');
  ok(!M.unlocked(isl,'furnace')&&M.placeProblem(isl,'furnace',10,30)==='locked','furnace locked at first');
  isl.got={wood:30,stone:29}; M.checkGoals(isl);
  ok(isl.goal===0,'goal 1 needs all 30 stone');
  isl.got.stone=30; M.checkGoals(isl);
  ok(isl.goal===1&&M.unlocked(isl,'furnace')&&!M.unlocked(isl,'workshop'),'goal 1 unlocks the furnace');
  ok(isl.free.belt===40+M.GOAL_GIFT.belt&&isl.ev.length===1&&isl.ev[0].unlock==='furnace','gift and event');
  M.GOALS.forEach(g=>{ for(const k in g.need) isl.got[k]=g.need[k]; });
  M.checkGoals(isl);
  ok(isl.goal===M.GOALS.length,'every goal can be finished');
  ok(M.unlocked(isl,'assembler'),'assembler unlocked by the end');
  // every goal's items can be made by something unlocked by then
  const makers={};
  for(const t in M.RECIPES) M.RECIPES[t].forEach(r=>{ makers[r.out]=t; });
  M.GOALS.forEach((g,i)=>{
    const open=t=>t==='drill'||M.GOALS.slice(0,i).some(x=>x.unlock===t);
    for(const k in g.need){
      const t=makers[k]||'drill';
      ok(open(t),`goal ${i+1}: ${k} comes from ${t}, which is unlocked by then`);
    }
  });
  // and every building's cost is something you can make before it unlocks
  for(const t in M.BUILD){
    const g=M.GOALS.findIndex(x=>x.unlock===t);
    for(const k in M.BUILD[t].cost){
      const m=makers[k]||'drill';
      const mg=M.GOALS.findIndex(x=>x.unlock===m);
      ok(m==='drill'||mg<g,`${t} costs ${k}, made by ${m} (unlocked earlier)`);
    }
  }
}

/* ---- time away ---- */
{
  const isl=testIsland();
  isl.hist=[{wood:10},{wood:10,stone:5}];   // 20 wood and 5 stone in 20 seconds
  ok(Math.abs(M.rateOf(isl,'wood')-1)<1e-9,'rate is the rolling average');
  ok(M.creditAway(isl,10000)===null,'under 30 seconds: nothing');
  const r=M.creditAway(isl,3600*1000);
  ok(r.items.wood===3600&&r.items.stone===900&&!r.capped,'an hour away ('+JSON.stringify(r.items)+')');
  ok(isl.store.wood===3600&&isl.got.wood===3600,'away items count for storage and goals');
  ok(isl.goal===1,'and can finish goals');
  const r2=M.creditAway(isl,48*3600*1000);
  ok(r2.capped&&r2.items.wood===M.AWAY_CAP_S,'capped at 8 hours ('+r2.items.wood+')');
  const fresh=testIsland();
  const r3=M.creditAway(fresh,3600*1000);
  ok(r3&&!Object.keys(r3.items).length,'nothing built, nothing credited');
  // the history fills while you play
  const isl2=testIsland();
  for(let x=24;x<30;x++) M.place(isl2,'belt',x,31,0);
  for(let i=0;i<M.TPS*M.HIST_BUCKET_S*3;i++){ if(i%20===0) M.give(isl2,M.at(isl2,24,31),'wood',isl2.tick,23,31); M.step(isl2); }
  ok(isl2.hist.length===3,'history buckets ('+isl2.hist.length+')');
  const rate=M.rateOf(isl2,'wood');
  ok(rate>0.8&&rate<=1,'measured rate about 1 a second ('+rate.toFixed(2)+')');
}

/* ---- saving and save codes ---- */
(async function(){
  const isl=testIsland();
  for(const [x,y] of [[20,30],[21,30],[20,31],[21,31]]) isl.map.res[y*N+x]=1;
  M.place(isl,'drill',20,30,0);
  for(let x=22;x<30;x++) M.place(isl,'belt',x,30,0);
  isl.goal=4; isl.store={gear:20,wire:30,ironbar:30};
  const asm=M.place(isl,'assembler',10,32,1); M.setRecipe(isl,asm,'frame');
  run(isl,333);
  // the map isn't saved, so the copy needs the same flat strip
  const copy=M.unpackIsland(JSON.parse(JSON.stringify(M.packIsland(isl))));
  for(let y=26;y<=37;y++) for(let x=6;x<30;x++){ copy.map.ground[y*N+x]=2; copy.map.res[y*N+x]=isl.map.res[y*N+x]; }
  copy.b.filter(b=>b.t==='drill').forEach(b=>{ b.res='wood'; b.cov=4; });
  ok(copy.b.length===isl.b.length,'same buildings after loading ('+copy.b.length+')');
  ok(JSON.stringify(copy.store)===JSON.stringify(isl.store)&&copy.goal===isl.goal,'same storage and goal');
  ok(M.at(copy,10,32).rc==='frame'&&M.at(copy,10,32).r===1,'recipes and turns kept');
  const items=s=>s.b.filter(b=>b.t==='belt').map(b=>b.it.map(q=>q.k+q.p.toFixed(2)).join()).join('|');
  ok(items(copy)===items(isl),'items on belts kept');
  run(isl,200); run(copy,200);
  ok(JSON.stringify(copy.got)===JSON.stringify(isl.got)&&items(copy)===items(isl),'and the copy keeps running the same way');
  // broken saves are mended, not fatal
  const bad=M.unpackIsland({seed:5,b:[{t:'laser',x:1,y:1},{t:'belt',x:0,y:0,r:0},null,{t:'belt',i:7,x:31,y:31}]});
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
  ok(D.islands&&typeof D.islands==='object','islands healed');
  const fiona=D.readers[0].id;
  M.openIsland(fiona);
  const fam=M.openIsland(M.FAMILY);
  ok(fam===null,'a brand-new island has no time away');
  M.openIsland(fiona);
  const saved=JSON.parse(M.blob());
  ok(saved.v===1&&saved.islands[fiona]&&saved.islands[M.FAMILY]&&saved.last===fiona,'each player has an island, plus the family one');
  ok(saved.islands[M.FAMILY].seed===20261126&&saved.islands[fiona].seed!==20261126,'family island has its own map');
  ok(!('map' in saved.islands[fiona])&&!('occ' in saved.islands[fiona]),'maps aren’t saved (rebuilt from the seed)');
  ok(/const KEY='robotisland:v1'/.test(html)&&/JSON\.stringify\(\{v:1,/.test(html)&&/const COLORS=\[/.test(html),'the chore board can seed players');
  ok((html.match(/<script>/g)||[]).length===1,'one script tag');

  console.log(`${checks-fails}/${checks} checks passed`);
  process.exit(fails?1:0);
})();
