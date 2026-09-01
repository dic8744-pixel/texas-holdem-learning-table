#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let seed=0x51f15e;
const seededRandom=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/0x100000000;};
const math=Object.create(Math);math.random=seededRandom;
const storage=new Map();
const context=vm.createContext({
  console,setTimeout,clearTimeout,queueMicrotask,Date,Math:math,JSON,Promise,crypto:webcrypto,
  localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)},
  globalThis:null
});
context.globalThis=context;
for(const file of ['eval.js','modes/registry.js','modes/tournament.js','modes/cash.js','engine.js','rewards.js','solver.js','coach.js','ai.js','mp.js','ui.js'])
  vm.runInContext(fs.readFileSync(path.join(ROOT,'js',file),'utf8'),context,{filename:file});

const result=vm.runInContext(`(()=>{
  gtoPreflopSampleDecision=()=>null;solverSampleCachedDecision=()=>null;
  const card=parseCardCode,levels=['easy','medium','hard'],out={};
  const scenarios=[
    {name:'premium-open',stage:'preflop',hole:['As','Ah'],board:[],current:100,expected:'raise'},
    {name:'trash-vs-raise',stage:'preflop',hole:['7s','2h'],board:[],current:900,expected:'fold'},
    {name:'nut-flush-value',stage:'river',hole:['As','9s'],board:['Ks','7s','3s','2d','4c'],current:0,expected:'raise'},
    {name:'air-vs-pot',stage:'river',hole:['8c','6d'],board:['As','Kh','Qd','3c','2s'],current:900,expected:'fold'}
  ];
  for(const d of levels){
    const counts={raise:0,call:0,fold:0,correct:0,total:0,byScenario:{}};
    for(const sc of scenarios){
      let correct=0;
      for(let trial=0;trial<120;trial++){
        newGame({gameType:'cash',numPlayers:6,startBB:100,aiStartBB:100,startBlind:100,difficulty:d,tableScenario:'balanced'});
        const p=state.players[1],opp=state.players[2];
        state.players.forEach((q,i)=>{q.out=i>2;q.folded=i>2;q.allIn=false;q.acted=false;q.bet=0;q.totalBet=0;q.rangeCap=1;q.rangeFloor=0;q.rangeModel=null;});
        p.hole=sc.hole.map(card);p.style=STYLES.find(s=>s.id==='shark');p.pos='BTN';p.chips=10000;
        opp.style=STYLES.find(s=>s.id==='shark');opp.pos='BB';opp.chips=10000;
        state.stage=sc.stage;state.board=sc.board.map(card);state.currentBet=sc.current;state.lastRaiseSize=Math.max(100,sc.current===900?800:100);
        state.preflopRaiseCount=sc.current>100?1:0;state.streetRaiseCount=sc.stage==='preflop'?state.preflopRaiseCount:(sc.current>0?1:0);
        state.lastAggIdx=sc.current>0?opp.i:-1;state.pfAggIdx=sc.stage==='preflop'&&sc.current>100?opp.i:-1;
        if(sc.current>0){opp.bet=sc.current;opp.totalBet=sc.current;}
        const dec=aiDecide(p),type=dec.type==='allin'?'raise':dec.type==='check'?'call':dec.type;
        counts[type]=(counts[type]||0)+1;counts.total++;
        if(type===sc.expected){correct++;counts.correct++;}
      }
      counts.byScenario[sc.name]=correct/120;
    }
    out[d]={simulationCount:aiSimulationCount(d),judgmentNoise:aiJudgmentNoise(d),
      openRaiseProbability:aiOpenRaiseProb({style:STYLES.find(s=>s.id==='shark')},d),
      correctRate:counts.correct/counts.total,raiseRate:counts.raise/counts.total,
      callRate:counts.call/counts.total,foldRate:counts.fold/counts.total,byScenario:counts.byScenario};
  }
  return out;
})()`,context);

assert.deepEqual([result.easy.simulationCount,result.medium.simulationCount,result.hard.simulationCount],[35,70,210]);
assert.ok(result.easy.judgmentNoise>result.medium.judgmentNoise&&result.medium.judgmentNoise>result.hard.judgmentNoise);
assert.ok(result.easy.openRaiseProbability<result.medium.openRaiseProbability&&result.medium.openRaiseProbability<result.hard.openRaiseProbability);
assert.ok(result.medium.correctRate>result.easy.correctRate+0.08,
  `medium anchors did not separate from easy: ${JSON.stringify(result)}`);
const easyDiscipline=(result.easy.byScenario['trash-vs-raise']+result.easy.byScenario['air-vs-pot'])/2;
const hardDiscipline=(result.hard.byScenario['trash-vs-raise']+result.hard.byScenario['air-vs-pot'])/2;
assert.ok(hardDiscipline>easyDiscipline+0.08,
  `hard pressure discipline did not separate from easy: ${JSON.stringify(result)}`);
assert.ok(Math.abs(result.hard.byScenario['nut-flush-value']-result.easy.byScenario['nut-flush-value'])>0.15,
  'hard balanced/trapping behavior did not separate from easy value betting');
console.log(JSON.stringify(result,null,2));
