#!/usr/bin/env node
/**
 * Phone landscape layout regression. The native-landscape and
 * portrait-viewport/rotation-locked cases must render the same logical UI.
 * Run: npm run test:landscape
 */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const EXTERNAL_BASE = process.argv[2] || '';
const VIEWPORT = { width: 844, height: 390 };
const LOCKED_VIEWPORT = { width: 390, height: 844 };
const SMALL_VIEWPORT = { width: 568, height: 320 };
const SMALL_LOCKED_VIEWPORT = { width: 320, height: 568 };

async function forcePhoneLayout(page, withBoard=false, revealOpponents=false){
  await page.evaluate(({showBoard,revealOpponents}) => {
    const hero=state.players.find(p=>p.isHuman);
    for(const p of state.players){
      p.folded=false;
      p.out=false;
      p.allIn=false;
      p.lastAct='';
      p.revealed=revealOpponents&&!p.isHuman;
      if(!p.isHuman){
        p.name='WWWWWWWWWWWWWW';
        const nameEl=document.querySelector('#seat'+p.i+' .pname');
        if(nameEl?.firstChild)nameEl.firstChild.nodeValue=p.name;
      }
    }
    state.stage=showBoard?'river':'preflop';
    state.board=showBoard
      ? [{r:14,s:0},{r:13,s:1},{r:12,s:2},{r:11,s:3},{r:10,s:0}]
      : [];
    state.handOver=false;
    state.gameOver=false;
    state.turnIdx=hero.i;
    state.turnDeadline=Date.now()+25000;
    state.currentBet=Math.max(state.currentBet,state.bb);
    state.lastRaiseSize=Math.max(state.lastRaiseSize,state.bb);
    hero.lastAct='Call '+usd(state.bb);
    render();
    showActions(hero);
    document.getElementById('tmr'+hero.i).textContent='⏱ 25';
    updateOrient();
    layoutSeats();
  }, {showBoard:withBoard,revealOpponents});
  /* Let the real timer/layout scheduling path run, then measure its final state. */
  await page.waitForTimeout(450);
  await page.evaluate(() => layoutSeats());
}

async function collectPhoneMetrics(page){
  return page.evaluate(() => {
    const rect=el=>{
      const r=el.getBoundingClientRect();
      return {l:r.left,t:r.top,r:r.right,b:r.bottom,w:r.width,h:r.height};
    };
    const intersection=(a,b)=>
      Math.max(0,Math.min(a.r,b.r)-Math.max(a.l,b.l))*
      Math.max(0,Math.min(a.b,b.b)-Math.max(a.t,b.t));
    const game=document.getElementById('game');
    const topbar=document.getElementById('topbar');
    const tableWrap=document.getElementById('tableWrap');
    const felt=document.getElementById('felt');
    const actionbar=document.getElementById('actionbar');
    const center=document.getElementById('centerArea');
    const hero=state.players.find(p=>p.isHuman);
    const heroSeat=document.getElementById('seat'+hero.i);
    const seats=state.players.map(p=>({
      name:p.name,
      el:document.getElementById('seat'+p.i)
    })).filter(x=>x.el?.offsetHeight);
    const topRect=rect(topbar),wrapRect=rect(tableWrap),actionRect=rect(actionbar);
    const heroRect=rect(heroSeat);
    const chromeOverlaps=[];
    for(const seat of seats){
      const sr=rect(seat.el);
      const topArea=intersection(sr,topRect);
      const actionArea=intersection(sr,actionRect);
      if(topArea>1||actionArea>1)chromeOverlaps.push({name:seat.name,topArea,actionArea});
    }
    const centerOverlaps=[];
    const cz=centerRectDOM(center);
    if(cz){
      for(const seat of seats){
        const sr=elementRectSeatLayout(seat.el);
        const ox=Math.min(sr.r,cz.r)-Math.max(sr.l,cz.l);
        const oy=Math.min(sr.b,cz.b)-Math.max(sr.t,cz.t);
        if(ox>1&&oy>1)centerOverlaps.push(seat.name);
      }
    }
    const seatsInsideTable=seats.every(seat=>{
      const sr=rect(seat.el);
      return sr.l>=wrapRect.l-2&&sr.r<=wrapRect.r+2&&sr.t>=wrapRect.t-2&&sr.b<=wrapRect.b+2;
    });
    const card=document.querySelector('.seat.human .hole .card');
    const pname=document.querySelector('.pname');
    const topStyle=getComputedStyle(topbar);
    const actionStyle=getComputedStyle(actionbar);
    const metrics={
      phoneLandscape:document.body.classList.contains('phone-landscape'),
      rotated:document.body.classList.contains('fl'),
      legacyLls:document.body.classList.contains('lls'),
      narrow:document.body.classList.contains('phone-landscape-narrow'),
      mobile:typeof isMobile==='function'&&isMobile(),
      players:state.players.length,
      revealedOpponents:state.players.filter(p=>!p.isHuman&&p.revealed).length,
      boardCards:state.board.length,
      layoutOverlaps:countLayoutOverlaps(1),
      centerOverlaps,
      chromeOverlaps,
      seatsInsideTable,
      heroTopbarArea:intersection(heroRect,topRect),
      heroActionbarArea:intersection(heroRect,actionRect),
      actionbarOverflow:Math.max(0,actionbar.scrollWidth-actionbar.clientWidth),
      controlsOverflow:Math.max(0,document.getElementById('humanCtls').scrollWidth-document.getElementById('humanCtls').clientWidth),
      timerVisible:!!document.getElementById('tmr'+hero.i)?.textContent.trim(),
      controlsVisible:!document.getElementById('humanCtls').classList.contains('hidden'),
      blindConfig:state.cfg.startBlind,
      blinds:[state.sb,state.bb],
      blindText:document.getElementById('tBlinds').textContent,
      potText:document.getElementById('pot').textContent,
      signature:{
        game:[game.offsetWidth,game.offsetHeight],
        tableWrap:[tableWrap.offsetWidth,tableWrap.offsetHeight],
        felt:[felt.clientWidth,felt.clientHeight],
        topbarHeight:topbar.offsetHeight,
        actionbarHeight:actionbar.offsetHeight,
        card:[card?.offsetWidth||0,card?.offsetHeight||0],
        namePx:pname?parseFloat(getComputedStyle(pname).fontSize):0,
        topbarOrder:topStyle.order,
        actionbarOrder:actionStyle.order,
        topbarDisplay:topStyle.display,
        actionbarDisplay:actionStyle.display
      }
    };
    metrics.pass=
      metrics.phoneLandscape&&metrics.mobile&&!metrics.legacyLls&&metrics.players===6&&
      metrics.layoutOverlaps===0&&metrics.centerOverlaps.length===0&&
      metrics.chromeOverlaps.length===0&&metrics.seatsInsideTable&&
      metrics.heroTopbarArea===0&&metrics.heroActionbarArea===0&&
      metrics.actionbarOverflow<=1&&metrics.controlsOverflow<=1&&
      metrics.timerVisible&&metrics.controlsVisible&&
      metrics.signature.card[0]>=44&&metrics.signature.namePx>=13&&
      metrics.signature.topbarHeight>=36&&metrics.signature.actionbarHeight>=80&&
      metrics.signature.topbarOrder==='0'&&metrics.signature.actionbarOrder==='2'&&
      metrics.signature.topbarDisplay==='flex'&&metrics.signature.actionbarDisplay==='flex';
    return metrics;
  });
}

async function openStartedGame(browser,base,viewport){
  const page=await browser.newPage({viewport});
  await page.goto(base,{waitUntil:'networkidle'});
  await page.click('#startBtn');
  await page.waitForSelector('.seat.human .hole .card',{timeout:10000});
  return page;
}

(async () => {
  let server=null;
  let base=EXTERNAL_BASE;
  if(!base){
    const root=path.resolve(__dirname,'..');
    server=http.createServer((req,res)=>{
      const rel=decodeURIComponent((req.url||'/').split('?')[0]);
      const file=path.resolve(root,'.'+(rel==='/'?'/poker.html':rel));
      if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
      fs.readFile(file,(err,data)=>{
        if(err){res.writeHead(404).end();return;}
        const ext=path.extname(file);
        const type=ext==='.html'?'text/html':ext==='.js'?'text/javascript':ext==='.json'?'application/json':ext==='.svg'?'image/svg+xml':'application/octet-stream';
        res.writeHead(200,{'Content-Type':type});res.end(data);
      });
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base=`http://127.0.0.1:${server.address().port}/poker.html`;
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: VIEWPORT });
  await page.goto(base, { waitUntil: 'networkidle' });
  const blindSelection = await page.$eval('#startBlind', select=>({
    value:select.value,
    label:select.selectedOptions[0]?.textContent?.trim()
  }));
  await page.check('#fourColorChk');
  const deckMetrics = await page.evaluate(() => {
    const probe=document.createElement('div');
    probe.innerHTML=[0,1,2,3].map(s=>cardHTML({r:14,s})).join('');
    document.body.appendChild(probe);
    const colors=[...probe.querySelectorAll('.card')].map(card=>getComputedStyle(card).color);
    probe.remove();
    const button=document.getElementById('deckBtn'),checkbox=document.getElementById('fourColorChk');
    return {
      colors,
      persisted:localStorage.getItem('sg_poker_four_color'),
      bodyClass:document.body.classList.contains('four-color'),
      checkbox:checkbox?.checked,
      buttonPressed:button?.getAttribute('aria-pressed'),
      pass:new Set(colors).size===4&&localStorage.getItem('sg_poker_four_color')==='1'&&
        document.body.classList.contains('four-color')&&checkbox?.checked&&button?.getAttribute('aria-pressed')==='true'
    };
  });
  await page.evaluate(() => { if (typeof updateOrient === 'function') updateOrient(); });
  await page.click('#startBtn');
  await page.waitForSelector('.seat.human .hole .card', { timeout: 10000 });
  const raiseStepMetrics = await page.evaluate(() => {
    const sl=document.getElementById('raiseSlider');
    const input=document.getElementById('raiseAmountInput');
    const down=document.getElementById('raiseStepDown');
    const up=document.getElementById('raiseStepUp');
    const bb=state.bb,min=bb*2,max=bb*10,start=bb*4;
    sl.min=min;sl.max=max;sl.step=state.sb;
    setRaiseExact(start);
    const before={engine:getRaiseSliderAmt(),display:Number(input.value)};
    up.click();
    const afterUp={engine:getRaiseSliderAmt(),display:Number(input.value)};
    down.click();
    const afterDown={engine:getRaiseSliderAmt(),display:Number(input.value)};
    setRaiseExact(min);const downDisabled=down.disabled;
    setRaiseExact(max);const upDisabled=up.disabled;
    setRaiseExact(start);
    return {
      before,afterUp,afterDown,downDisabled,upDisabled,
      pass:afterUp.engine-before.engine===bb&&afterUp.display-before.display===displayAmount(bb)&&
        afterDown.engine===before.engine&&afterDown.display===before.display&&
        downDisabled&&upDisabled
    };
  });
  await forcePhoneLayout(page, false);
  const nativePreflop = await collectPhoneMetrics(page);

  const lockedPage = await browser.newPage({ viewport: LOCKED_VIEWPORT });
  await lockedPage.goto(base, { waitUntil: 'networkidle' });
  await lockedPage.click('#startBtn');
  await lockedPage.waitForSelector('.seat.human .hole .card', { timeout: 10000 });
  await forcePhoneLayout(lockedPage, false);
  const lockedPreflop = await collectPhoneMetrics(lockedPage);
  const preflopSignaturesMatch=
    JSON.stringify(nativePreflop.signature)===JSON.stringify(lockedPreflop.signature);

  await forcePhoneLayout(page, true);
  await forcePhoneLayout(lockedPage, true);
  const nativePostflop = await collectPhoneMetrics(page);
  const lockedPostflop = await collectPhoneMetrics(lockedPage);
  const postflopSignaturesMatch=
    JSON.stringify(nativePostflop.signature)===JSON.stringify(lockedPostflop.signature);
  await Promise.all([
    forcePhoneLayout(page,true,true),
    forcePhoneLayout(lockedPage,true,true)
  ]);
  const [nativeShowdown,lockedShowdown]=await Promise.all([
    collectPhoneMetrics(page),
    collectPhoneMetrics(lockedPage)
  ]);
  const showdownSignaturesMatch=
    JSON.stringify(nativeShowdown.signature)===JSON.stringify(lockedShowdown.signature);
  await page.setViewportSize(LOCKED_VIEWPORT);
  await forcePhoneLayout(page,true,true);
  const transitionedLocked=await collectPhoneMetrics(page);
  await page.setViewportSize(VIEWPORT);
  await forcePhoneLayout(page,true,true);
  const transitionedNative=await collectPhoneMetrics(page);
  const orientationTransitionPass=
    transitionedLocked.pass&&transitionedLocked.rotated&&
    transitionedNative.pass&&!transitionedNative.rotated&&
    JSON.stringify(transitionedLocked.signature)===JSON.stringify(transitionedNative.signature)&&
    JSON.stringify(transitionedNative.signature)===JSON.stringify(nativeShowdown.signature);
  const orientationPairPass=
    nativePreflop.pass&&lockedPreflop.pass&&nativePostflop.pass&&lockedPostflop.pass&&
    nativeShowdown.pass&&lockedShowdown.pass&&orientationTransitionPass&&
    !nativePreflop.rotated&&lockedPreflop.rotated&&
    !nativePostflop.rotated&&lockedPostflop.rotated&&
    nativePreflop.boardCards===0&&lockedPreflop.boardCards===0&&
    nativePostflop.boardCards===5&&lockedPostflop.boardCards===5&&
    nativeShowdown.revealedOpponents===5&&lockedShowdown.revealedOpponents===5&&
    preflopSignaturesMatch&&postflopSignaturesMatch&&showdownSignaturesMatch&&
    nativePreflop.blindConfig===100&&nativePreflop.blinds[0]===50&&
    nativePreflop.blinds[1]===100&&nativePreflop.blindText==='$10/$20'&&
    nativePreflop.potText==='Pot: $30 · 1.5 BB';

  const [smallPage,smallLockedPage]=await Promise.all([
    openStartedGame(browser,base,SMALL_VIEWPORT),
    openStartedGame(browser,base,SMALL_LOCKED_VIEWPORT)
  ]);
  await Promise.all([
    forcePhoneLayout(smallPage,false),
    forcePhoneLayout(smallLockedPage,false)
  ]);
  const [smallPreflop,smallLockedPreflop]=await Promise.all([
    collectPhoneMetrics(smallPage),
    collectPhoneMetrics(smallLockedPage)
  ]);
  const smallPreflopSignaturesMatch=
    JSON.stringify(smallPreflop.signature)===JSON.stringify(smallLockedPreflop.signature);
  await Promise.all([
    forcePhoneLayout(smallPage,true),
    forcePhoneLayout(smallLockedPage,true)
  ]);
  const [smallPostflop,smallLockedPostflop]=await Promise.all([
    collectPhoneMetrics(smallPage),
    collectPhoneMetrics(smallLockedPage)
  ]);
  const smallPostflopSignaturesMatch=
    JSON.stringify(smallPostflop.signature)===JSON.stringify(smallLockedPostflop.signature);
  await Promise.all([
    forcePhoneLayout(smallPage,true,true),
    forcePhoneLayout(smallLockedPage,true,true)
  ]);
  const [smallShowdown,smallLockedShowdown]=await Promise.all([
    collectPhoneMetrics(smallPage),
    collectPhoneMetrics(smallLockedPage)
  ]);
  const smallShowdownSignaturesMatch=
    JSON.stringify(smallShowdown.signature)===JSON.stringify(smallLockedShowdown.signature);
  const smallOrientationPairPass=
    smallPreflop.pass&&smallLockedPreflop.pass&&smallPostflop.pass&&smallLockedPostflop.pass&&
    smallShowdown.pass&&smallLockedShowdown.pass&&
    !smallPreflop.rotated&&smallLockedPreflop.rotated&&
    smallPreflop.narrow&&smallLockedPreflop.narrow&&
    smallShowdown.revealedOpponents===5&&smallLockedShowdown.revealedOpponents===5&&
    smallPreflopSignaturesMatch&&smallPostflopSignaturesMatch&&smallShowdownSignaturesMatch;

  const portraitPage = await browser.newPage({ viewport: { width: 960, height: 1100 } });
  await portraitPage.goto(base, { waitUntil: 'networkidle' });
  await portraitPage.click('#startBtn');
  await portraitPage.waitForSelector('.seat.human .hole .card', { timeout: 10000 });
  const portraitMetrics = await portraitPage.evaluate(() => {
    const actor=state.players[state.players.length-1];
    for(const p of state.players){p.bet=0;p.totalBet=0;p.folded=false;p.out=false;p.allIn=false;p.lastAct='';}
    state.stage='preflop';state.board=[];state.handOver=false;state.currentBet=state.bb;
    state.turnIdx=actor.i;actor.bet=state.bb;actor.totalBet=state.bb;actor.lastAct='Call '+usd(state.bb);
    render();layoutSeats();
    const felt=document.getElementById('felt'),seat=document.getElementById('seat'+actor.i),bet=document.getElementById('bet'+actor.i);
    const fr=felt.getBoundingClientRect(),sr=seat.getBoundingClientRect(),br=bet.getBoundingClientRect();
    const fc={x:fr.left+fr.width/2,y:fr.top+fr.height/2};
    const sc={x:sr.left+sr.width/2,y:sr.top+sr.height/2};
    const bc={x:br.left+br.width/2,y:br.top+br.height/2};
    const border=parseFloat(getComputedStyle(felt).borderLeftWidth)||0;
    const rx=fr.width*.48-border-br.width/2-6,ry=fr.height*.46-border-br.height/2-6;
    const ellipse=((bc.x-fc.x)**2)/(rx**2)+((bc.y-fc.y)**2)/(ry**2);
    const seatDistance=Math.hypot(sc.x-fc.x,sc.y-fc.y),betDistance=Math.hypot(bc.x-fc.x,bc.y-fc.y);
    return {ellipse,seatDistance,betDistance,visible:getComputedStyle(bet).visibility!=='hidden',
      pass:ellipse<=1.01&&betDistance<seatDistance&&getComputedStyle(bet).visibility!=='hidden'};
  });

  console.log(JSON.stringify({
    blindSelection,
    raiseStep:raiseStepMetrics,
    fourColorDeck:deckMetrics,
    phoneLandscape:{
      preflop:{native:nativePreflop,rotationLocked:lockedPreflop,signaturesMatch:preflopSignaturesMatch},
      postflop:{native:nativePostflop,rotationLocked:lockedPostflop,signaturesMatch:postflopSignaturesMatch},
      showdown:{native:nativeShowdown,rotationLocked:lockedShowdown,signaturesMatch:showdownSignaturesMatch},
      orientationTransition:{rotationLocked:transitionedLocked,native:transitionedNative,pass:orientationTransitionPass},
      pass:orientationPairPass
    },
    smallPhoneLandscape:{
      preflop:{native:smallPreflop,rotationLocked:smallLockedPreflop,signaturesMatch:smallPreflopSignaturesMatch},
      postflop:{native:smallPostflop,rotationLocked:smallLockedPostflop,signaturesMatch:smallPostflopSignaturesMatch},
      showdown:{native:smallShowdown,rotationLocked:smallLockedShowdown,signaturesMatch:smallShowdownSignaturesMatch},
      pass:smallOrientationPairPass
    },
    halfScreenPortrait:portraitMetrics
  }, null, 2));
  await page.screenshot({ path: '/tmp/poker-landscape-mobile.png' });
  await lockedPage.screenshot({ path: '/tmp/poker-landscape-locked.png' });
  await smallPage.close();
  await smallLockedPage.close();
  await lockedPage.close();
  await portraitPage.close();
  await browser.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  process.exit(
    blindSelection.value === '20' && blindSelection.label === '$10 / $20' &&
    raiseStepMetrics.pass && deckMetrics.pass && orientationPairPass &&
    smallOrientationPairPass && portraitMetrics.pass ? 0 : 1
  );
})();
