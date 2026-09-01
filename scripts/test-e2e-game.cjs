#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const {chromium}=require('playwright');

const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
  const rel=decodeURIComponent((req.url||'/').split('?')[0]);
  const file=path.resolve(root,'.'+(rel==='/'?'/poker.html':rel));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404).end();return;}
    const ext=path.extname(file);
    const type=ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.json'?'application/json':ext==='.svg'?'image/svg+xml':ext==='.wasm'?'application/wasm':'application/octet-stream';
    res.writeHead(200,{'Content-Type':type});res.end(data);
  });
});

(async()=>{
  let browser;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const chromeCandidates=[process.env.POKER_CHROME_PATH,
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium'].filter(Boolean);
    const executablePath=chromeCandidates.find(p=>fs.existsSync(p));
    browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const consoleErrors=[],pageErrors=[],httpErrors=[];
    page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push({text:msg.text(),location:msg.location()});});
    page.on('pageerror',err=>pageErrors.push(String(err)));
    page.on('response',response=>{if(response.status()>=400)httpErrors.push(`${response.status()} ${response.url()}`);});
    const url=`http://127.0.0.1:${server.address().port}/poker.html`;
    await page.goto(url,{waitUntil:'networkidle'});
    assert.equal(await page.title(),'本地德州扑克学习桌');
    await page.click('#pMinus');await page.click('#pMinus');await page.click('#pMinus');
    await page.selectOption('#aiStartBB','100');
    await page.click('#diffSeg [data-d="easy"]');
    await page.selectOption('#tableScenarioSel','loose');
    await page.click('#startBtn');
    await page.evaluate(()=>{
      AI_DELAY_MIN=5;AI_DELAY_MAX=10;RUNOUT_DELAY=12;SHOWDOWN_PAUSE=60;FOLDWIN_PAUSE=40;
      let seed=0x51f15e;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
      setGameSeed('browser-e2e');
    });
    await page.uncheck('#autoNext');

    let showdown=false,settledHand=0,result='';
    for(let attempt=0;attempt<5&&!showdown;attempt++){
      await page.waitForFunction(()=>state&&!state.handOver&&state.players[state.turnIdx]?.isHuman&&
        !document.getElementById('humanCtls').classList.contains('hidden'),null,{timeout:15000});
      await page.click('#prMax');
      await page.click('#raiseBtn');
      await page.waitForFunction(()=>state&&state.handOver,null,{timeout:15000});
      const handResult=await page.evaluate(()=>({
        hand:state.handNum,result:state.resultText,
        bestFive:state.showdownBestFive instanceof Map?state.showdownBestFive.size:0,
        cardCount:state.deck.length+(state.burned||[]).length+state.board.length+
          state.players.reduce((n,p)=>n+p.hole.length,0),
        unique:new Set([...state.deck,...(state.burned||[]),...state.board,...state.players.flatMap(p=>p.hole)]
          .map(c=>c.r+':'+c.s)).size
      }));
      assert.equal(handResult.cardCount,52);
      assert.equal(handResult.unique,52);
      settledHand=handResult.hand;result=handResult.result;
      showdown=handResult.bestFive>=2&&/最佳五张/.test(result);
      if(showdown)break;
      await page.click('#nextHandBtn');
    }
    assert.ok(showdown,'five attempts produced no called all-in showdown');

    await page.waitForSelector('#topUpBtn:not(.hidden)',{timeout:5000});
    const beforeTopUp=await page.evaluate(()=>state.cashRebuys||0);
    await page.click('#topUpBtn');
    const reloadAccounting=await page.evaluate(()=>({
      human:state.cashRebuys||0,ai:state.cashAiRebuys||0,pnl:getMode().sessionPnL(state),
      invested:state.cashHeroInvested,stack:state.players[0].chips
    }));
    assert.equal(reloadAccounting.human,beforeTopUp+1);
    assert.ok(reloadAccounting.ai>=0);
    assert.equal(reloadAccounting.pnl,reloadAccounting.stack-reloadAccounting.invested);
    await page.click('#nextHandBtn');
    await page.waitForFunction(h=>state&&state.handNum===h+1&&!state.handOver,settledHand,{timeout:10000});
    const final=await page.evaluate(()=>({
      hand:state.handNum,players:state.players.length,coach:document.getElementById('coachChk').checked,
      history:JSON.parse(localStorage.getItem('sg_poker_history')||'[]').length,
      settings:JSON.parse(localStorage.getItem('sg_poker_settings_v1')||'{}'),
      cardCount:state.deck.length+(state.burned||[]).length+state.board.length+
        state.players.reduce((n,p)=>n+p.hole.length,0),
      unique:new Set([...state.deck,...(state.burned||[]),...state.board,...state.players.flatMap(p=>p.hole)]
        .map(c=>c.r+':'+c.s)).size
    }));
    assert.equal(final.players,6);
    assert.equal(final.coach,true);
    assert.ok(final.history>=1);
    assert.equal(final.settings.numPlayers,6);
    assert.equal(final.cardCount,52);assert.equal(final.unique,52);
    assert.deepEqual(pageErrors,[],'pageerror detected');
    assert.deepEqual(consoleErrors,[],`console error detected; HTTP errors: ${httpErrors.join(', ')}`);
    console.log(JSON.stringify({
      browser:executablePath||'bundled Chromium',settledHand,result,nextHand:final.hand,
      reloadAccounting,historyEntries:final.history,consoleErrors,pageErrors,httpErrors
    },null,2));
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(err=>{console.error(err);process.exitCode=1;});
