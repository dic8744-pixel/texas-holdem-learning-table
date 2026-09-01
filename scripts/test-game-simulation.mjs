#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const storage=new Map();
const context=vm.createContext({
  console,setTimeout,clearTimeout,queueMicrotask,Date,Math,JSON,Promise,crypto:webcrypto,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  globalThis:null
});
context.globalThis=context;
for(const file of ['eval.js','modes/registry.js','modes/tournament.js','modes/cash.js','engine.js','rewards.js','solver.js','coach.js','ai.js','mp.js','ui.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',file),'utf8'),context,{filename:file});

const result=vm.runInContext(`(()=>{
  setGameSeed('ten-thousand-hand-invariant-run');
  const HANDS=10000;
  let sidePots=0,ties=0,maxPots=0;
  for(let hand=0;hand<HANDS;hand++){
    const n=6+gameRandomInt(4),deck=shuffle(makeDeck()),players=[];
    for(let i=0;i<n;i++)players.push({i,name:'P'+i,hole:[],folded:false,out:false,totalBet:0,chips:0});
    for(let round=0;round<2;round++)for(const p of players)p.hole.push(deck.pop());
    const burned=[],board=[];
    burned.push(deck.pop());board.push(deck.pop(),deck.pop(),deck.pop());
    burned.push(deck.pop());board.push(deck.pop());
    burned.push(deck.pop());board.push(deck.pop());
    const all=[...deck,...burned,...board,...players.flatMap(p=>p.hole)];
    if(all.length!==52||new Set(all.map(c=>c.r+':'+c.s)).size!==52)
      throw new Error('duplicate or missing card in simulated hand '+hand);
    if(deck.length!==52-n*2-8||burned.length!==3||board.length!==5)
      throw new Error('burn/deal accounting failed in hand '+hand);

    const stacks=players.map(()=>500+gameRandomInt(4501));
    const bets=stacks.map(s=>Math.min(s,[100,250,500,900,1500,2500][gameRandomInt(6)]));
    const order=bets.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v);
    if(order[0].v>order[1].v)bets[order[0].i]=order[1].v; // no unmatched overbet
    let liveCount=0;
    players.forEach((p,i)=>{p.totalBet=bets[i];p.chips=stacks[i]-bets[i];p.folded=gameRandomInt(100)<28; if(!p.folded)liveCount++;});
    if(liveCount<2)for(const p of players){
      if(p.folded){p.folded=false;liveCount++;if(liveCount>=2)break;}
    }
    const maxBet=Math.max(...players.map(p=>p.totalBet));
    const maxContributor=players.find(p=>p.totalBet===maxBet&&!p.folded);
    if(!maxContributor)players.find(p=>p.totalBet===maxBet).folded=false;
    const live=players.filter(p=>!p.folded),scores=new Map(live.map(p=>[p,evalSeven(p.hole.concat(board))]));
    const awards=settleShowdownPots(players,live,scores,gameRandomInt(n));
    const committed=players.reduce((s,p)=>s+p.totalBet,0);
    const paid=[...awards.winnings.values()].reduce((s,v)=>s+v,0);
    if(paid!==committed)throw new Error('pot conservation failed in hand '+hand);
    for(const pot of awards.pots){
      if(!pot.winnerIds.length||pot.amount<0)throw new Error('invalid side pot in hand '+hand);
      for(const id of pot.winnerIds)if(players[id].folded)throw new Error('folded player won a pot');
      if(pot.winnerIds.length>1)ties++;
    }
    sidePots+=Math.max(0,awards.pots.length-1);maxPots=Math.max(maxPots,awards.pots.length);
    for(const [p,amount] of awards.winnings)p.chips+=amount;
    const before=stacks.reduce((a,b)=>a+b,0),after=players.reduce((s,p)=>s+p.chips,0);
    if(before!==after)throw new Error('stack conservation failed in hand '+hand);
  }
  setGameSeed(null);
  return {hands:HANDS,sidePots,ties,maxPots};
})()`,context);

assert.equal(result.hands,10000);
assert.ok(result.sidePots>1000,'simulation did not exercise enough side pots');
assert.ok(result.maxPots>=3,'simulation never exercised three or more pots');
console.log(JSON.stringify(result,null,2));
