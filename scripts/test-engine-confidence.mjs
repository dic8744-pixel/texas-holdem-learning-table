#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=['eval.js','modes/registry.js','modes/tournament.js','modes/cash.js','engine.js','rewards.js','solver.js','coach.js','ai.js','mp.js','ui.js'];
const storage=new Map();
const context=vm.createContext({
  console,setTimeout,clearTimeout,queueMicrotask,Date,Math,JSON,Promise,crypto:webcrypto,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  globalThis:null
});
context.globalThis=context;
for(const file of files)vm.runInContext(fs.readFileSync(path.join(ROOT,'js',file),'utf8'),context,{filename:file});

const result=vm.runInContext(`(()=>{
  const code=c=>RANK_CH[c.r]+'shdc'[c.s];
  const deckWithSeed=seed=>{setGameSeed(seed);return shuffle(makeDeck()).map(code).join(' ')};
  const seededA=deckWithSeed('confidence-42');
  const seededB=deckWithSeed('confidence-42');
  const seededC=deckWithSeed('confidence-43');
  if(seededA!==seededB)throw new Error('seeded shuffle is not reproducible');
  if(seededA===seededC)throw new Error('different seeds produced the same shuffle');
  if(new Set(seededA.split(' ')).size!==52)throw new Error('shuffle lost or duplicated cards');
  setGameSeed(null);

  const exact=bestFive(codesToCards(['As','Ad','Ah','Kc','Kd','2s','3h']));
  if(handName(exact.score).toLowerCase().indexOf('full')<0||
     new Set(exact.cards.map(code)).size!==5||
     !['As','Ad','Ah','Kc','Kd'].every(c=>exact.cards.map(code).includes(c)))
    throw new Error('best-five extraction failed');

  const mk=(i,totalBet,score,folded=false)=>({i,name:'P'+i,chips:0,totalBet,folded,out:false});
  const p0=mk(0,100,[8,14]),p1=mk(1,300,[1,14,13,12,11]),p2=mk(2,300,[4,9]),p3=mk(3,300,[0,14,13,12,11,9],true);
  const players=[p0,p1,p2,p3],live=players.filter(p=>!p.folded);
  const scores=new Map([[p0,p0.score||[8,14]],[p1,[1,14,13,12,11]],[p2,[4,9]]]);
  const settled=settleShowdownPots(players,live,scores,3);
  const won=Object.fromEntries([...settled.winnings].map(([p,n])=>[p.i,n]));
  if(JSON.stringify(won)!==JSON.stringify({0:400,2:600}))throw new Error('nested side pots wrong '+JSON.stringify(won));
  if(settled.pots.reduce((s,p)=>s+p.amount,0)!==1000)throw new Error('side-pot chip conservation failed');

  const t0=mk(0,5),t1=mk(1,5),t2=mk(2,5);
  const tied=settleShowdownPots([t0,t1,t2],[t0,t1],new Map([[t0,[1,14,9,8,7]],[t1,[1,14,9,8,7]]]),2);
  if(tied.winnings.get(t0)!==8||tied.winnings.get(t1)!==7)throw new Error('odd chip did not go left of dealer');

  const base={gameType:'sng',numPlayers:2,startBB:100,startBlind:20,ante:0,speed:'standard',difficulty:'hard',seed:'heads-up'};
  newGame({...base});
  state.dealerIdx=0;
  const sb=0,bb=1;assignPositions(sb);
  if(state.players[sb].pos!=='SB/BTN'||state.players[bb].pos!=='BB')throw new Error('heads-up positions wrong');

  newGame({...base,numPlayers:4});
  const [a,b,c,d]=state.players;
  for(const p of state.players){p.chips=1000;p.bet=0;p.totalBet=0;p.acted=false;p.actedAtBet=0;p.folded=false;p.out=false;p.allIn=false;p.rangeCap=1;p.rangeFloor=0;p.aggStreets=[];p.checkStreets=[];}
  Object.assign(state,{stage:'preflop',currentBet:100,lastRaiseSize:100,streetRaiseCount:0,preflopRaiseCount:0,lastAggIdx:-1,pfAggIdx:-1,board:[]});
  a.bet=100;a.totalBet=100;a.acted=true;a.actedAtBet=100;
  b.bet=100;b.totalBet=100;b.acted=false;b.chips=50;
  c.bet=100;c.totalBet=100;c.acted=true;c.actedAtBet=100;
  const shortLegal=legalActions(b);
  if(!shortLegal.allIn||shortLegal.maxRaiseTo!==150||shortLegal.minRaiseTo!==200)
    throw new Error('short all-in missing from legal action contract');
  applyAction(b,'allin');
  if(state.currentBet!==150||state.lastRaiseSize!==100)throw new Error('short all-in accounting wrong');
  let illegalCheck=false;
  try{applyAction(a,'check');}catch(e){illegalCheck=/illegal check/.test(String(e));}
  if(!illegalCheck)throw new Error('check facing a bet was not rejected');
  applyAction(a,'raise',400);
  if(a.bet!==150||state.currentBet!==150)throw new Error('short all-in incorrectly reopened raising');

  /* Two short all-ins totalling a full raise must reopen action. */
  for(const p of [a,b,c,d]){p.chips=1000;p.bet=100;p.totalBet=100;p.acted=true;p.actedAtBet=100;p.allIn=false;p.folded=false;}
  Object.assign(state,{currentBet:100,lastRaiseSize:100,streetRaiseCount:0});
  b.chips=50;b.acted=false;
  applyAction(b,'allin');
  c.chips=100;c.acted=false;
  applyAction(c,'allin');
  if(!canPlayerRaise(a))throw new Error('cumulative short all-ins did not reopen raising');
  applyAction(a,'raise',300);
  if(a.bet!==300||state.currentBet!==300)throw new Error('reopened full raise was rejected');

  a.bet=500;a.totalBet=500;a.chips=500;a.allIn=false;
  b.bet=200;b.totalBet=200;b.chips=0;b.allIn=true;
  c.bet=300;c.totalBet=300;c.chips=700;c.allIn=false;
  refundUncalled();
  if(a.bet!==300||a.totalBet!==300||a.chips!==700)throw new Error('uncalled bet refund wrong');

  newGame({...base,numPlayers:6,seed:'burn-check'});
  for(const p of state.players){p.out=false;p.sittingOut=false;p.folded=false;p.hole=[];}
  state.deck=shuffle(makeDeck());state.cardInvariantActive=true;state.board=[];state.burned=[];state.stage='preflop';
  for(let round=0;round<2;round++)for(const p of state.players)p.hole.push(state.deck.pop());
  dealNext();dealNext();dealNext();
  assertCardConservation('burn regression');
  if(state.burned.length!==3||state.board.length!==5||state.deck.length!==32)
    throw new Error('standard burn/runout counts wrong');

  const roundTrip=['As','10h','2c','7d'];
  if(codesToCards(roundTrip).map(cardToCode).join(',')!==roundTrip.join(','))throw new Error('resume card serialization failed');

  newGame({...base,gameType:'cash',numPlayers:3});
  state.handOver=true;
  state.cashHeroInvested=1000;
  state.players[0].chips=900;state.players[0].totalBet=100;
  if(getMode().sessionPnL(state)!==0)throw new Error('cash P&L omitted live street investment');
  state.players[1].chips=0;
  getMode().afterHand(state);
  if(state.cashRebuys!==0||state.cashAiRebuys!==1||state.players[1].chips!==state.players[1].initialBuyIn)
    throw new Error('AI rebuy was counted as a human reload');
  state.players[0].chips=0;state.players[0].totalBet=0;
  if(!cashAddBuyIn(state.players[0],1)||state.cashRebuys!==1)
    throw new Error('between-hand human reload accounting failed');

  return {seededDeckHead:seededA.split(' ').slice(0,5),sidePots:settled.pots.map(p=>p.amount),oddChip:[tied.winnings.get(t0),tied.winnings.get(t1)],cashReloads:state.cashRebuys};
})()`,context);

console.log(JSON.stringify(result,null,2));
assert.equal(result.sidePots.reduce((a,b)=>a+b,0),1000);

const solverGate=await vm.runInContext(`(async()=>{
  const saved={render,armTurnTimer,showActions,hideActions,solverRequestCoachStrategy};
  const events=[];
  let release;
  try{
    newGame({gameType:'cash',numPlayers:2,startBB:100,startBlind:20,ante:0,speed:'standard',difficulty:'hard',seed:'solver-gate'});
    const p=state.players[0],q=state.players[1];
    for(const player of state.players){
      player.out=false;player.folded=false;player.allIn=false;player.acted=true;player.bet=0;
    }
    p.acted=false;
    Object.assign(state,{stage:'flop',handNum:7,handOver:false,gameOver:false,turnIdx:p.i,currentBet:0,lastRaiseSize:state.bb});
    render=()=>{};
    armTurnTimer=()=>events.push('timer');
    showActions=()=>events.push('actions');
    hideActions=()=>events.push('hidden');
    solverRequestCoachStrategy=()=>{
      events.push('solver');
      return new Promise(resolve=>{release=resolve;});
    };
    promptNext();
    await Promise.resolve();
    if(events.includes('timer')||events.includes('actions'))
      throw new Error('human controls or timer opened before solver completion '+JSON.stringify(events));
    release(true);
    await new Promise(resolve=>setTimeout(resolve,0));
    if(events.join(',')!=='hidden,solver,timer,actions')
      throw new Error('human solver gate ordering regression '+JSON.stringify(events));
    return events;
  }finally{
    render=saved.render;armTurnTimer=saved.armTurnTimer;showActions=saved.showActions;
    hideActions=saved.hideActions;solverRequestCoachStrategy=saved.solverRequestCoachStrategy;
  }
})()`,context);
assert.deepEqual(Array.from(solverGate),['hidden','solver','timer','actions']);
