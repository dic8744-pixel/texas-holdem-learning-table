/* ================= CASH GAME MODE ================= */
registerMode('cash',{
  id:'cash',
  isCash:true,
  coachFlags:{icm:false,mRatio:false,anteWiden:false,blindLevelWarn:false,cashNote:true,deepStack:true,showSpr:true},

  initState(cfg,state){
    const startBlind=cfg.startBlind||BASE_BB;
    const buyIn=cfg.startBB*startBlind;
    state.levels=[startBlind];
    state.level=0;
    state.bb=startBlind;
    state.sb=startBlind/2;
    state.ante=0;
    state.cashBuyIn=buyIn;
    state.cashStartChips=buyIn;
    state.cashHeroInvested=buyIn;
    state.cashRebuys=0;
    state.cashAiRebuys=0;
  },

  applyBlinds(state){
    state.level=0;
    state.bb=state.levels[0];
    state.sb=state.bb/2;
    state.ante=0;
  },

  afterHand(state){
    for(const p of state.players.filter(q=>q.chips===0&&!q.isHuman)){
      p.chips=p.initialBuyIn||state.cashBuyIn;
      p.out=false;
      state.cashAiRebuys=(state.cashAiRebuys||0)+1;
    }
    const hero=state.players[0];
    if(hero&&hero.chips===0)hero.needsRebuy=true;
    return {gameOver:false};
  },

  shouldClearResume(state){
    return !!state.gameOver;
  },

  resumeFields(state){
    return {
      levels:state.levels,
      cashBuyIn:state.cashBuyIn,
      cashStartChips:state.cashStartChips,
      cashHeroInvested:state.cashHeroInvested,
      cashRebuys:state.cashRebuys||0,
      cashAiRebuys:state.cashAiRebuys||0
    };
  },

  restoreFields(sv,state){
    if(sv.levels) state.levels=sv.levels;
    if(sv.cashBuyIn!=null) state.cashBuyIn=sv.cashBuyIn;
    if(sv.cashStartChips!=null) state.cashStartChips=sv.cashStartChips;
    if(sv.cashHeroInvested!=null) state.cashHeroInvested=sv.cashHeroInvested;
    if(sv.cashRebuys!=null) state.cashRebuys=sv.cashRebuys;
    if(sv.cashAiRebuys!=null) state.cashAiRebuys=sv.cashAiRebuys;
  },

  sessionPnL(state){
    const p=state.players[0];
    return p?p.chips+(p.totalBet||0)-(state.cashHeroInvested||state.cashStartChips||0):0;
  }
});

function cashAddBuyIn(p,units=1){
  if(!state||!isCashGame()||!state.handOver||!p||units<1||units>5)return false;
  const amount=100*(state.cfg.startBlind||state.bb)*Math.round(units);
  p.chips+=amount;p.out=false;p.allIn=false;p.needsRebuy=false;
  p.initialBuyIn=p.initialBuyIn||amount;
  if(p.isHuman){
    state.cashRebuys=(state.cashRebuys||0)+1;
    state.cashHeroInvested=(state.cashHeroInvested||state.cashStartChips||0)+amount;
    log(T('cashRebuy')(usd(amount)));
  }
  saveResume();render();renderStats();
  return true;
}
