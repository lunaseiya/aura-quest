// ============================================================
//  AURA QUEST - Phaser 3  game.js
//  STEP7: ①ステータス割り振り ②職業別通常攻撃 ③命中/クリティカル
// ============================================================
const BASE='https://lunaseiya.github.io/aura-quest/';
const TILE=32;

// ============================================================
//  BGM / SE
// ============================================================
let audioCtx=null,muted=false,bgmKey=null,bgmIdx=0,bgmNext=0;
function getAC(){
  if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}
  if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();
  return audioCtx;
}
const BGM_DATA={
  title:{bpm:90, mel:[523,659,784,659,523,440,523,0,587,698,784,0,659,784,880,0]},
  town: {bpm:100,mel:[523,659,784,880,784,659,523,0,698,784,880,0,784,659,523,0]},
  st1:  {bpm:132,mel:[523,659,784,659,523,440,523,0,587,698,784,698,587,523,440,0]},
  st2:  {bpm:140,mel:[220,0,261,0,220,196,0,0,233,0,277,0,233,220,0,0]},
  st3:  {bpm:116,mel:[392,440,523,659,523,440,392,0,349,392,440,523,440,392,349,0]},
  st4:  {bpm:108,mel:[330,0,370,415,0,370,330,0,311,0,349,392,0,349,311,0]},
  boss: {bpm:160,mel:[440,0,466,0,440,415,0,440,392,0,415,0,392,370,0,392]},
  clear:{bpm:120,mel:[523,659,784,1047,784,659,523,0,659,784,880,1047,880,784,659,0]},
};
function startBGM(key){if(bgmKey===key)return;bgmKey=key;bgmIdx=0;bgmNext=0;}
function updateBGM(){
  if(muted||!bgmKey)return;
  const ac=getAC();if(!ac)return;
  const d=BGM_DATA[bgmKey];if(!d)return;
  const BEAT=60/d.bpm,now=ac.currentTime;
  if(!bgmNext||bgmNext<now)bgmNext=now+0.05;
  while(bgmNext<now+0.4){
    const f=d.mel[bgmIdx%d.mel.length];
    if(f>0){try{
      const o=ac.createOscillator(),g=ac.createGain();
      o.type='triangle';o.frequency.value=f;o.connect(g);g.connect(ac.destination);
      g.gain.setValueAtTime(0,bgmNext);g.gain.linearRampToValueAtTime(0.06,bgmNext+0.01);g.gain.linearRampToValueAtTime(0,bgmNext+BEAT*0.8);
      o.start(bgmNext);o.stop(bgmNext+BEAT);
      const ob=ac.createOscillator(),gb=ac.createGain();
      ob.type='sine';ob.frequency.value=f/2;ob.connect(gb);gb.connect(ac.destination);
      gb.gain.setValueAtTime(0,bgmNext);gb.gain.linearRampToValueAtTime(0.03,bgmNext+0.01);gb.gain.linearRampToValueAtTime(0,bgmNext+BEAT*0.5);
      ob.start(bgmNext);ob.stop(bgmNext+BEAT);
    }catch(e){}}
    bgmNext+=BEAT;bgmIdx++;
  }
}
function SE(type){
  if(muted)return;const ac=getAC();if(!ac)return;const now=ac.currentTime;
  const C={
    hit:    [[440,'square',0.08,0.1]],
    crit:   [[880,'square',0.12,0.08],[660,'sawtooth',0.1,0.15],[1047,'sine',0.08,0.2]],
    miss:   [[220,'sine',0.04,0.1]],
    exp:    [[880,'sine',0.06,0.15],[1047,'sine',0.06,0.15]],
    levelup:[[523,'sine',0.08,0.1],[659,'sine',0.08,0.1],[784,'sine',0.08,0.1],[1047,'sine',0.1,0.4]],
    boss:   [[110,'sawtooth',0.1,0.5],[220,'sawtooth',0.08,0.3]],
    clear:  [[523,'sine',0.08,0.1],[659,'sine',0.08,0.1],[784,'sine',0.08,0.1],[880,'sine',0.08,0.1],[1047,'sine',0.12,0.5]],
    potion: [[660,'sine',0.07,0.2]],
    skill:  [[330,'sawtooth',0.09,0.15],[440,'sawtooth',0.09,0.15]],
    arrow:  [[880,'sine',0.05,0.08],[660,'sine',0.04,0.06]],
    magic:  [[523,'sine',0.07,0.2],[784,'sine',0.06,0.25],[1047,'sine',0.05,0.3]],
    explode:[[110,'sawtooth',0.1,0.3],[220,'square',0.08,0.2]],
  };
  const cfg=C[type];if(!cfg)return;
  cfg.forEach(([f,w,v,d],i)=>{try{
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=w;o.frequency.value=f;o.connect(g);g.connect(ac.destination);
    const t=now+i*0.08;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+0.01);g.gain.exponentialRampToValueAtTime(0.001,t+d);
    o.start(t);o.stop(t+d+0.05);
  }catch(e){}});
}

// ============================================================
//  プレイヤーデータ
// ============================================================
function makePlayerData(cls){
  const base={
    warrior:{hp:110,sp:60,atk:6,def:6,mag:5,spd:180,hit:80,luk:5},
    mage:   {hp:90, sp:70,atk:5,def:4,mag:8,spd:160,hit:75,luk:5},
    archer: {hp:100,sp:65,atk:6,def:5,mag:5,spd:200,hit:85,luk:8},
    bomber: {hp:95, sp:80,atk:8,def:4,mag:6,spd:170,hit:78,luk:6},
  }[cls];
  return {
    cls,
    hp:base.hp,mhp:base.hp,
    sp:base.sp,msp:base.sp,
    atk:base.atk,def:base.def,mag:base.mag,spd:base.spd,
    hit:base.hit,  // 命中率(%)
    luk:base.luk,  // 運（クリティカル率%）
    lv:1,exp:0,expNext:100,
    gold:50,potHP:3,potMP:3,kills:0,
    statPts:0,      // 未割り振りポイント
    pendingLvUp:0,
    // ジョブシステム
    jobLv:1, jobExp:0, jobExpNext:80, jobPts:0,
    // スキルレベル（各職業3スキル、Lv0=未習得）
    sk1:0, sk2:0, sk3:0,
  };
}

// ============================================================
//  命中・クリティカル計算
// ============================================================
function calcHit(pd, enemySpd){
  // 命中率 = hit - 敵SPD×0.08（最低10%、最大99%）
  return Math.min(99, Math.max(10, pd.hit - (enemySpd||0)*0.08));
}
function calcCrit(pd){
  return pd.luk; // luk% がクリティカル率
}
function rollAttack(pd, enemyDef, enemySpd){
  // 命中判定
  const hitRate=calcHit(pd,enemySpd);
  if(Math.random()*100>hitRate) return {miss:true};
  // クリティカル判定
  const isCrit=Math.random()*100<calcCrit(pd);
  let dmg=Math.max(1, pd.atk*2 - (enemyDef||0) + Phaser.Math.Between(0,pd.atk));
  if(isCrit) dmg=Math.floor(dmg*2);
  return {dmg,isCrit,miss:false};
}

// ============================================================
//  BootScene
// ============================================================
class BootScene extends Phaser.Scene{
  constructor(){super('Boot')}
  preload(){
    const w=this.scale.width,h=this.scale.height;
    this.add.rectangle(0,0,w,h,0x000000).setOrigin(0);
    const bar=this.add.rectangle(w*0.1,h/2-10,0,20,0xffd700).setOrigin(0);
    this.add.rectangle(w*0.1,h/2-10,w*0.8,20,0x000000,0).setOrigin(0).setStrokeStyle(1,0x444444);
    const txt=this.add.text(w/2,h/2+20,'Loading...',{fontSize:'14px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5);
    this.load.on('progress',v=>bar.setSize(w*0.8*v,20));
    this.load.on('fileprogress',f=>txt.setText(f.key));
    ['warrior','mage','archer','bomber'].forEach(k=>this.load.image('player_'+k,BASE+'players/'+k+'.png'));
    ['bat','boss1','boss2','boss3','dragon','goblin','sandworm','scorpion','skeleton','slime','troll','wolf'].forEach(k=>this.load.image('enemy_'+k,BASE+'enemies/'+k+'.png'));
    ['bridge','cliff','cobble','dark_forest','flower','grass','lava','oasis_grass','sand_beach','sand_desert','sea','town_path','town_wall','volcanic','water'].forEach(k=>this.load.image('tile_'+k,BASE+'tiles/'+k+'.png'));
    ['barrel','desert_rock','lava_rock','palm','rock','tree'].forEach(k=>this.load.image('obj_'+k,BASE+'objects/'+k+'.png'));
    ['portal_st1','portal_st2','portal_st3','portal_st4','portal_town'].forEach(k=>this.load.image(k,BASE+'portals/'+k+'.png'));
    ['arrow','bigbomb','bomb','fireball','hyperbomb','vortexball'].forEach(k=>this.load.image('proj_'+k,BASE+'projectiles/'+k+'.png'));
    ['explosion','freeze','shockwave','slash'].forEach(k=>this.load.image('fx_'+k,BASE+'effects/'+k+'.png'));
    ['hp_potion','mp_potion'].forEach(k=>this.load.image('drop_'+k,BASE+'drops/'+k+'.png'));
  }
  create(){this.scene.start('Title')}
}

// ============================================================
//  TitleScene
// ============================================================
class TitleScene extends Phaser.Scene{
  constructor(){super('Title')}
  create(){
    const w=this.scale.width,h=this.scale.height;
    startBGM('title');
    this.add.rectangle(0,0,w,h,0x030818).setOrigin(0);
    for(let i=0;i<60;i++){
      const s=this.add.circle(Phaser.Math.Between(0,w),Phaser.Math.Between(0,h*0.75),Phaser.Math.FloatBetween(0.5,2),0xffffff,Phaser.Math.FloatBetween(0.3,1));
      this.tweens.add({targets:s,alpha:0.1,duration:Phaser.Math.Between(800,2000),yoyo:true,repeat:-1,delay:Phaser.Math.Between(0,1000)});
    }
    const g=this.add.graphics();
    g.fillStyle(0x0a1528,1);
    g.fillTriangle(0,h*0.7,150,h*0.35,300,h*0.7);
    g.fillTriangle(200,h*0.7,380,h*0.28,560,h*0.7);
    g.fillTriangle(500,h*0.7,680,h*0.38,860,h*0.7);
    g.fillTriangle(750,h*0.7,950,h*0.3,1150,h*0.7);
    g.fillRect(0,h*0.7,w,h*0.3);
    const title=this.add.text(w/2,h*0.28,'AURA QUEST',{fontSize:'52px',fontFamily:'Courier New',color:'#ffd700',stroke:'#ff8c00',strokeThickness:5}).setOrigin(0.5);
    this.tweens.add({targets:title,scaleX:1.03,scaleY:1.03,duration:1800,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
    this.add.text(w/2,h*0.42,'〜 光の勇者よ、旅立て 〜',{fontSize:'14px',fontFamily:'Courier New',color:'#aaaaff'}).setOrigin(0.5);
    const press=this.add.text(w/2,h*0.58,'▶  タップ or キーで開始  ◀',{fontSize:'16px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5);
    this.tweens.add({targets:press,alpha:0.1,duration:700,yoyo:true,repeat:-1});
    const muteBtn=this.add.text(w-10,10,'🔊',{fontSize:'20px'}).setOrigin(1,0).setInteractive({useHandCursor:true});
    muteBtn.on('pointerdown',()=>{muted=!muted;muteBtn.setText(muted?'🔇':'🔊')});
    this.bgmTimer=this.time.addEvent({delay:100,loop:true,callback:updateBGM});
    const go=()=>{getAC();this.bgmTimer.remove();this.scene.start('ClassSelect')};
    this.input.once('pointerdown',go);
    this.input.keyboard.once('keydown',go);
  }
}

// ============================================================
//  ClassSelectScene
// ============================================================
class ClassSelectScene extends Phaser.Scene{
  constructor(){super('ClassSelect')}
  create(){
    const w=this.scale.width,h=this.scale.height;
    startBGM('title');
    this.bgmTimer=this.time.addEvent({delay:100,loop:true,callback:updateBGM});
    this.add.rectangle(0,0,w,h,0x060010).setOrigin(0);
    this.add.text(w/2,36,'⚔ 職業を選ぼう ⚔',{fontSize:'24px',fontFamily:'Courier New',color:'#ffd700',stroke:'#cc8800',strokeThickness:2}).setOrigin(0.5);
    const classes=[
      {key:'warrior',name:'剣士',      desc:'近接・高耐久\nパリィ・烈風斬',   col:0xe74c3c,x:-180,y:-60},
      {key:'mage',   name:'マジャン',  desc:'広範囲魔法\n凍結・大爆発',       col:0x9b59b6,x:180,y:-60},
      {key:'archer', name:'アーチャー',desc:'高速遠距離\n多方向射撃',         col:0x27ae60,x:-180,y:80},
      {key:'bomber', name:'ボマー',    desc:'爆弾投擲\n範囲爆発',             col:0xf39c12,x:180,y:80},
    ];
    classes.forEach(cls=>{
      const cx=w/2+cls.x,cy=h/2+cls.y;
      const card=this.add.rectangle(cx,cy,280,130,cls.col,0.12).setInteractive({useHandCursor:true}).setStrokeStyle(2,cls.col);
      this.add.image(cx-90,cy,'player_'+cls.key).setDisplaySize(64,80);
      this.add.text(cx+10,cy-32,cls.name,{fontSize:'20px',fontFamily:'Courier New',color:'#'+cls.col.toString(16).padStart(6,'0'),stroke:'#000',strokeThickness:2});
      this.add.text(cx+10,cy-4,cls.desc,{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa',lineSpacing:4});
      card.on('pointerover',()=>{card.setFillStyle(cls.col,0.35);this.tweens.add({targets:card,scaleX:1.03,scaleY:1.03,duration:100})});
      card.on('pointerout', ()=>{card.setFillStyle(cls.col,0.12);this.tweens.add({targets:card,scaleX:1,scaleY:1,duration:100})});
      card.on('pointerdown',()=>{this.bgmTimer.remove();this.scene.start('Town',{playerData:makePlayerData(cls.key)})});
    });
    const muteBtn=this.add.text(w-10,10,'🔊',{fontSize:'20px'}).setOrigin(1,0).setInteractive({useHandCursor:true});
    muteBtn.on('pointerdown',()=>{muted=!muted;muteBtn.setText(muted?'🔇':'🔊')});
  }
}

// ============================================================
//  TownScene
// ============================================================
class TownScene extends Phaser.Scene{
  constructor(){super('Town')}
  init(data){this.playerData=data.playerData}
  create(){
    const TW=1200,TH=800;
    this.TW=TW;this.TH=TH;
    startBGM('town');
    this.bgmTimer=this.time.addEvent({delay:100,loop:true,callback:updateBGM});
    this.cameras.main.setBounds(0,0,TW,TH);
    this.physics.world.setBounds(0,0,TW,TH);
    const cols=Math.ceil(TW/TILE),rows=Math.ceil(TH/TILE);
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      let key='tile_cobble';
      if(c<3||c>cols-4||r<3||r>rows-4)key='tile_town_wall';
      else if(r>=rows-4)key='tile_town_path';
      this.add.image(c*TILE+16,r*TILE+16,key).setDisplaySize(TILE,TILE);
    }
    this.buildings=[
      {x:100,y:80, w:180,h:130,label:'🏨 宿屋',   type:'inn',       col:0x5c3317},
      {x:400,y:80, w:200,h:140,label:'🏪 ショップ',type:'shop',      col:0x1a4a8a},
      {x:750,y:80, w:180,h:130,label:'⚔ ギルド',  type:'guild',     col:0x4a1a1a},
      {x:150,y:400,w:160,h:120,label:'🔨 鍛冶屋',  type:'blacksmith',col:0x2a2a2a},
      {x:600,y:380,w:200,h:150,label:'🔮 魔法店',  type:'magic',     col:0x1a0a3a},
    ];
    this.buildings.forEach(b=>{
      this.add.rectangle(b.x+b.w/2,b.y+b.h/2,b.w,b.h,b.col).setStrokeStyle(2,0x888888);
      this.add.text(b.x+b.w/2,b.y+b.h-16,b.label,{fontSize:'12px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);
    });
    this.add.image(TW/2,TH-160,'portal_st1').setDisplaySize(96,64);
    this.add.text(TW/2,TH-110,'🌿 野外へ (ST.1)',{fontSize:'12px',fontFamily:'Courier New',color:'#2ecc71'}).setOrigin(0.5);
    this.player=this.physics.add.sprite(200,300,'player_'+this.playerData.cls).setDisplaySize(48,60).setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player,true,0.1,0.1);
    this.cursors=this.input.keyboard.createCursorKeys();
    this.wasd=this.input.keyboard.addKeys('W,A,S,D');
    this.createHUD();
    this.hintText=this.add.text(this.scale.width/2,this.scale.height-24,'',{fontSize:'12px',fontFamily:'Courier New',color:'#ffffff',backgroundColor:'#00000088',padding:{x:6,y:3}}).setOrigin(0.5).setScrollFactor(0).setDepth(11);
    this.msgText=this.add.text(0,0,'',{fontSize:'12px',fontFamily:'Courier New',color:'#ffffff',backgroundColor:'#000000cc',padding:{x:8,y:6}}).setDepth(20).setScrollFactor(0).setVisible(false);
    this.input.keyboard.on('keydown-E',()=>this.tryInteract());
    if(this.playerData.pendingLvUp>0) this.time.delayedCall(500,()=>this.showLvUpScreen());
    this.createMenuButton();
  }
  createHUD(){
    const pd=this.playerData,w=this.scale.width,h=this.scale.height;
    this.add.rectangle(0,0,240,82,0x000000,0.75).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudHPBar=this.add.rectangle(44,14,180*(pd.hp/pd.mhp),10,0x2ecc71).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.rectangle(44,14,180,10,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudSPBar=this.add.rectangle(44,30,180*(pd.sp/pd.msp),10,0x3498db).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.rectangle(44,30,180,10,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.add.text(2,12,'HP',{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setScrollFactor(0).setDepth(12);
    this.add.text(2,28,'SP',{fontSize:'9px',fontFamily:'Courier New',color:'#3498db'}).setScrollFactor(0).setDepth(12);
    this.hudGold=this.add.text(4,46,'',{fontSize:'11px',fontFamily:'Courier New',color:'#ffd700'}).setScrollFactor(0).setDepth(12);
    this.hudPts=this.add.text(4,62,'',{fontSize:'10px',fontFamily:'Courier New',color:'#ff6'}).setScrollFactor(0).setDepth(12);
    this.add.text(w-4,4,'TOWN',{fontSize:'12px',fontFamily:'Courier New',color:'#2ecc71'}).setOrigin(1,0).setScrollFactor(0).setDepth(12);
    const muteBtn=this.add.text(w-4,24,'🔊',{fontSize:'16px'}).setOrigin(1,0).setScrollFactor(0).setDepth(12).setInteractive({useHandCursor:true});
    muteBtn.on('pointerdown',()=>{muted=!muted;muteBtn.setText(muted?'🔇':'🔊')});
    const mw=100,mh=80,mx=w-mw-6,my=h-mh-6;
    this.add.rectangle(mx,my,mw,mh,0x000000,0.7).setOrigin(0).setScrollFactor(0).setDepth(20).setStrokeStyle(1,0x2ecc71);
    this.add.text(mx+mw/2,my-10,'TOWN',{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.mmDot=this.add.circle(0,0,3,0xffd700).setScrollFactor(0).setDepth(22);
    this.mmX=mx;this.mmY=my;this.mmW=mw;this.mmH=mh;
    this.updateHUD();
  }
  updateHUD(){
    const pd=this.playerData;
    this.hudHPBar.setSize(180*(Math.max(0,pd.hp)/pd.mhp),10);
    this.hudSPBar.setSize(180*(Math.max(0,pd.sp)/pd.msp),10);
    this.hudGold.setText('💰 '+pd.gold+'G  💊'+(pd.potHP||0)+'  💧'+(pd.potMP||0));
    this.hudPts.setText((pd.statPts>0)?'⚡ SP残り'+pd.statPts+'pt [S]で割振':'');
  }
  openMenu(tab='stat'){
    this.scene.pause();
    this.scene.launch('Menu',{playerData:this.playerData,returnScene:'Town',returnData:{playerData:this.playerData},tab});
  }
  showLvUpScreen(){
    const pd=this.playerData;
    if(pd.pendingLvUp<=0)return;
    pd.pendingLvUp--;
    this.scene.pause();
    this.scene.launch('LevelUp',{playerData:pd,returnScene:'Town',returnData:{playerData:pd}});
  }
  createMenuButton(){
    const pd=this.playerData,w=this.scale.width;
    // キャラアイコンボタン（HUD左上）
    const cls={warrior:'剣',mage:'魔',archer:'弓',bomber:'爆'}[pd.cls]||'?';
    this._menuBtn=this.add.rectangle(220,40,44,44,0x1a1a3a,0.9).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    this._menuIcon=this.add.text(220,36,cls,{fontSize:'18px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this._menuLabel=this.add.text(220,50,'MENU',{fontSize:'8px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this._menuBadge=this.add.text(236,24,'',{fontSize:'10px',fontFamily:'Courier New',color:'#ffff44',backgroundColor:'#e74c3c',padding:{x:2,y:1}}).setScrollFactor(0).setDepth(17);
    this._menuBtn.on('pointerdown',()=>this.openMenu('stat'));
    this._menuBtn.on('pointerover',()=>this._menuBtn.setFillStyle(0x44aaff,0.3));
    this._menuBtn.on('pointerout', ()=>this._menuBtn.setFillStyle(0x1a1a3a,0.9));
    this._updateMenuBadge();
  }
  _updateMenuBadge(){
    const pd=this.playerData;
    const pts=(pd.statPts||0)+(pd.jobPts||0);
    if(this._menuBadge)this._menuBadge.setText(pts>0?'↑'+pts:'');
  }
  tryInteract(){
    const p=this.player;
    if(Phaser.Math.Distance.Between(p.x,p.y,this.TW/2,this.TH-160)<80){
      this.bgmTimer.remove();this.scene.start('Game',{playerData:this.playerData,stage:1});return;
    }
    for(const b of this.buildings){
      if(Math.abs(p.x-(b.x+b.w/2))<b.w/2+40&&Math.abs(p.y-(b.y+b.h/2))<b.h/2+40){this.openBuilding(b);return;}
    }
  }
  openBuilding(b){
    const w=this.scale.width,h=this.scale.height;
    const msgs={inn:'🏨 宿屋  泊まる？(30G)\n[Y]はい  [N]いいえ',shop:'🏪 ショップ\nHPポーション 30G [1]\nMPポーション 25G [2]',blacksmith:'🔨 鍛冶屋\n鉄の剣 80G ATK+8 [1]\n革の鎧 70G DEF+5/HP+20 [2]\n俊足の靴 60G SPD+20 [3]',magic:'🔮 魔法店\n魔法の杖 90G MAG+8 [1]\n幸運の指輪 100G LUK+8 [2]',guild:'⚔ ギルド\n(準備中)\n[ESC]閉じる'};
    this.msgText.setText(msgs[b.type]||'準備中').setPosition(w/2-130,h/2-60).setVisible(true);
    const close=()=>this.msgText.setVisible(false);
    if(b.type==='inn') this.input.keyboard.once('keydown-Y',()=>{
      const pd=this.playerData;
      if(pd.gold>=30){pd.gold-=30;pd.hp=pd.mhp;pd.sp=pd.msp;pd.potHP=(pd.potHP||0)+3;pd.potMP=(pd.potMP||0)+3;SE('potion');this.updateHUD();this.msgText.setText('✨ 完全回復！ポーション3本補充！');}
      else this.msgText.setText('💰 お金が足りない！');
      this.time.delayedCall(1500,close);
    });
    if(b.type==='shop'){
      this.input.keyboard.once('keydown-ONE',()=>{const pd=this.playerData;if(pd.gold>=30){pd.gold-=30;pd.potHP=(pd.potHP||0)+1;SE('potion');this.updateHUD();this.msgText.setText('💊 HPポーション購入！');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-TWO',()=>{const pd=this.playerData;if(pd.gold>=25){pd.gold-=25;pd.potMP=(pd.potMP||0)+1;SE('potion');this.updateHUD();this.msgText.setText('💧 MPポーション購入！');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
    }
    if(b.type==='blacksmith'){
      this.input.keyboard.once('keydown-ONE',()=>{const pd=this.playerData;if(pd.gold>=80){pd.gold-=80;pd.atk+=8;SE('potion');this.updateHUD();this.msgText.setText('⚔ 鉄の剣！ATK+8');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-TWO',()=>{const pd=this.playerData;if(pd.gold>=70){pd.gold-=70;pd.def+=5;pd.mhp+=20;pd.hp=Math.min(pd.hp+20,pd.mhp);SE('potion');this.updateHUD();this.msgText.setText('🛡 革の鎧！DEF+5 HP+20');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-THREE',()=>{const pd=this.playerData;if(pd.gold>=60){pd.gold-=60;pd.spd+=20;pd.hit+=3;SE('potion');this.updateHUD();this.msgText.setText('👟 俊足の靴！SPD+20 HIT+3');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
    }
    if(b.type==='magic'){
      this.input.keyboard.once('keydown-ONE',()=>{const pd=this.playerData;if(pd.gold>=90){pd.gold-=90;pd.mag+=8;pd.msp+=15;SE('potion');this.updateHUD();this.msgText.setText('🔮 魔法の杖！MAG+8 SP+15');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-TWO',()=>{const pd=this.playerData;if(pd.gold>=100){pd.gold-=100;pd.luk+=8;pd.hit+=5;SE('potion');this.updateHUD();this.msgText.setText('💍 幸運の指輪！LUK+8 HIT+5%');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
    }
    this.input.keyboard.once('keydown-N',close);
    this.input.keyboard.once('keydown-ESC',close);
  }
  update(){
    const p=this.player,pd=this.playerData,spd=pd.spd;
    const l=this.cursors.left.isDown||this.wasd.A.isDown;
    const r=this.cursors.right.isDown||this.wasd.D.isDown;
    const u=this.cursors.up.isDown||this.wasd.W.isDown;
    const d=this.cursors.down.isDown||this.wasd.S.isDown;
    p.setVelocity(l?-spd:r?spd:0,u?-spd:d?spd:0);
    if(this.mmDot)this.mmDot.setPosition(this.mmX+p.x/this.TW*this.mmW,this.mmY+p.y/this.TH*this.mmH);
    let hint='';
    for(const b of this.buildings){if(Math.abs(p.x-(b.x+b.w/2))<b.w/2+50&&Math.abs(p.y-(b.y+b.h/2))<b.h/2+50){hint='[E] '+b.label;break;}}
    if(Phaser.Math.Distance.Between(p.x,p.y,this.TW/2,this.TH-160)<80)hint='[E] ST.1へ出発！';
    this.hintText.setText(hint);
    if(Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey('S')))this.openMenu('stat');
    if(Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey('J')))this.openMenu('skill');
    this._updateMenuBadge();
  }
}

// ============================================================
//  LevelUp Scene
// ============================================================
class LevelUpScene extends Phaser.Scene{
  constructor(){super('LevelUp')}
  init(data){this.playerData=data.playerData;this.returnScene=data.returnScene;this.returnData=data.returnData;}
  create(){
    const pd=this.playerData,w=this.scale.width,h=this.scale.height;
    SE('levelup');
    this.add.rectangle(0,0,w,h,0x000000,0.75).setOrigin(0);
    for(let i=0;i<30;i++){
      const px=Phaser.Math.Between(50,w-50),py=Phaser.Math.Between(50,h-50);
      const star=this.add.circle(px,py,Phaser.Math.Between(2,5),0xffd700);
      this.tweens.add({targets:star,alpha:0,scaleX:3,scaleY:3,duration:Phaser.Math.Between(400,900),onComplete:()=>star.destroy()});
    }
    this.add.rectangle(w/2,h/2,460,320,0x0a0820,0.97).setStrokeStyle(3,0xffd700);
    const lv=this.add.text(w/2,h/2-130,'✨ LEVEL UP! ✨',{fontSize:'28px',fontFamily:'Courier New',color:'#ffd700',stroke:'#ff8c00',strokeThickness:3}).setOrigin(0.5);
    this.tweens.add({targets:lv,scaleX:1.08,scaleY:1.08,duration:600,yoyo:true,repeat:-1});
    this.add.text(w/2,h/2-95,'Lv '+(pd.lv-1)+' → Lv '+pd.lv,{fontSize:'18px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5);
    this.add.text(w/2,h/2-65,'― ステータス自動上昇 ―',{fontSize:'12px',fontFamily:'Courier New',color:'#888888'}).setOrigin(0.5);
    const rows=[['MaxHP',pd.mhp,'#2ecc71',8],['ATK',pd.atk,'#e74c3c',1],['DEF',pd.def,'#3498db',1],['MaxSP',pd.msp,'#9b59b6',5]];
    rows.forEach(([n,v,c,d],i)=>{
      const y=h/2-40+i*24;
      this.add.text(w/2-100,y,n,{fontSize:'12px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0,0.5);
      this.add.text(w/2+40,y,String(v),{fontSize:'12px',fontFamily:'Courier New',color:c}).setOrigin(0,0.5);
      this.add.text(w/2+100,y,'(+'+d+')',{fontSize:'11px',fontFamily:'Courier New',color:'#44ff88'}).setOrigin(0,0.5);
    });
    this.add.text(w/2,h/2+62,'⚡ ステータスポイント +3pt 獲得！',{fontSize:'13px',fontFamily:'Courier New',color:'#ffff44'}).setOrigin(0.5);
    this.add.text(w/2,h/2+84,'（町で [S] キー or ✨ボタンで割り振り）',{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5);
    const btn=this.add.rectangle(w/2,h/2+118,200,40,0xffd700,0.2).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true});
    this.add.text(w/2,h/2+118,'▶ 続ける',{fontSize:'15px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);
    btn.on('pointerover',()=>btn.setFillStyle(0xffd700,0.4));
    btn.on('pointerout', ()=>btn.setFillStyle(0xffd700,0.2));
    btn.on('pointerdown',()=>this.close());
    this.input.keyboard.once('keydown',()=>this.close());
  }
  close(){this.scene.stop();this.scene.resume(this.returnScene,this.returnData);}
}

// ============================================================
//  StatAlloc Scene（ステータス割り振り）①
// ============================================================
class MenuScene extends Phaser.Scene{
  constructor(){super('Menu')}
  init(data){
    this.playerData=data.playerData;
    this.returnScene=data.returnScene||'Town';
    this.returnData=data.returnData||{};
    this.tab=data.tab||'stat';
  }
  create(){
    const pd=this.playerData,w=this.scale.width,h=this.scale.height;
    this.add.rectangle(0,0,w,h,0x000000,0.88).setOrigin(0);
    this.add.rectangle(w/2,h/2,560,430,0x060916,0.99).setStrokeStyle(2,0x44aaff);
    this.tabBtns={};this.tabTxts={};
    [['stat','⚡ ステータス',0x44aaff,-120],['skill','🎯 スキルツリー',0x00e5ff,120]].forEach(([id,label,col,ox])=>{
      const btn=this.add.rectangle(w/2+ox,h/2-200,210,34,col,0.15).setStrokeStyle(2,col).setInteractive({useHandCursor:true});
      const txt=this.add.text(w/2+ox,h/2-200,label,{fontSize:'13px',fontFamily:'Courier New',color:'#'+col.toString(16).padStart(6,'0')}).setOrigin(0.5);
      btn.on('pointerdown',()=>this.switchTab(id));
      this.tabBtns[id]=btn;this.tabTxts[id]=txt;
    });
    this.statCont=this.add.container(0,0);
    this.skillCont=this.add.container(0,0);
    this._buildStat(pd,w,h);
    this._buildSkill(pd,w,h);
    const close=this.add.rectangle(w/2,h/2+200,200,34,0xffd700,0.2).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true});
    this.add.text(w/2,h/2+200,'✕ 閉じる',{fontSize:'13px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);
    close.on('pointerover',()=>close.setFillStyle(0xffd700,0.45));
    close.on('pointerout', ()=>close.setFillStyle(0xffd700,0.2));
    close.on('pointerdown',()=>this._close());
    this.input.keyboard.on('keydown-ESC',()=>this._close());
    this.switchTab(this.tab);
  }
  switchTab(tab){
    this.tab=tab;
    this.statCont.setVisible(tab==='stat');
    this.skillCont.setVisible(tab==='skill');
    const COLS={stat:0x44aaff,skill:0x00e5ff};
    Object.entries(this.tabBtns).forEach(([id,btn])=>{
      const col=COLS[id];
      btn.setFillStyle(col,id===tab?0.45:0.1).setStrokeStyle(2,id===tab?col:0x334455);
      this.tabTxts[id].setColor(id===tab?'#'+col.toString(16).padStart(6,'0'):'#334455');
    });
  }
  _buildStat(pd,w,h){
    const c=this.statCont;
    const S=[
      {key:'atk',label:'力  (STR)',desc:'ATK +2/pt',col:'#e74c3c',apply:(p,n)=>{p.atk+=n*2}},
      {key:'spd',label:'素早(AGI)',desc:'SPD+12/pt',col:'#2ecc71',apply:(p,n)=>{p.spd+=n*12}},
      {key:'mag',label:'魔力(MAG)',desc:'MAG +2/pt',col:'#9b59b6',apply:(p,n)=>{p.mag+=n*2}},
      {key:'mhp',label:'体力(VIT)',desc:'HP  +9/pt',col:'#27ae60',apply:(p,n)=>{p.mhp+=n*9;p.hp=Math.min(p.hp+n*9,p.mhp)}},
      {key:'luk',label:'運  (LUK)',desc:'CRIT+1/pt',col:'#f39c12',apply:(p,n)=>{p.luk+=n}},
      {key:'hit',label:'命中(DEX)',desc:'HIT +2/pt',col:'#3498db',apply:(p,n)=>{p.hit+=n*2}},
    ];
    this._tmp={};S.forEach(s=>{this._tmp[s.key]=0;});
    this._tmpPts=pd.statPts||0;
    this._ptsTxt=this.add.text(w/2,h/2-170,'',{fontSize:'13px',fontFamily:'Courier New',color:'#ffff44'}).setOrigin(0.5);
    c.add(this._ptsTxt);this._refreshPts();
    this._vt={};this._at={};
    S.forEach((s,i)=>{
      const y=h/2-130+i*37;
      const lbl=this.add.text(w/2-250,y,s.label,{fontSize:'12px',fontFamily:'Courier New',color:s.col}).setOrigin(0,0.5);
      const dsc=this.add.text(w/2-130,y,s.desc,{fontSize:'10px',fontFamily:'Courier New',color:'#555'}).setOrigin(0,0.5);
      const cur=this.add.text(w/2+20,y,this._sv(pd,s.key),{fontSize:'12px',fontFamily:'Courier New',color:'#ddd'}).setOrigin(0,0.5);
      const add=this.add.text(w/2+100,y,'',{fontSize:'12px',fontFamily:'Courier New',color:'#44ff88'}).setOrigin(0,0.5);
      const bm=this.add.rectangle(w/2+172,y,30,26,0xe74c3c,0.25).setStrokeStyle(1,0xe74c3c).setInteractive({useHandCursor:true});
      this.add.text(w/2+172,y,'−',{fontSize:'15px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5);
      bm.on('pointerdown',()=>this._adj(s,-1,cur,add));
      bm.on('pointerover',()=>bm.setFillStyle(0xe74c3c,0.5));
      bm.on('pointerout', ()=>bm.setFillStyle(0xe74c3c,0.25));
      const bp=this.add.rectangle(w/2+215,y,30,26,0x44aaff,0.25).setStrokeStyle(1,0x44aaff).setInteractive({useHandCursor:true});
      this.add.text(w/2+215,y,'+',{fontSize:'15px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5);
      bp.on('pointerdown',()=>this._adj(s,+1,cur,add));
      bp.on('pointerover',()=>bp.setFillStyle(0x44aaff,0.5));
      bp.on('pointerout', ()=>bp.setFillStyle(0x44aaff,0.25));
      c.add([lbl,dsc,cur,add,bm,bp]);
      this._vt[s.key]=cur;this._at[s.key]=add;
    });
    const ok=this.add.rectangle(w/2-60,h/2+160,185,34,0x44aaff,0.25).setStrokeStyle(2,0x44aaff).setInteractive({useHandCursor:true});
    this.add.text(w/2-60,h/2+160,'✔ 確定して反映',{fontSize:'13px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5);
    ok.on('pointerover',()=>ok.setFillStyle(0x44aaff,0.5));ok.on('pointerout',()=>ok.setFillStyle(0x44aaff,0.25));
    ok.on('pointerdown',()=>this._confirm(pd,S));c.add(ok);
    const rst=this.add.rectangle(w/2+120,h/2+160,110,34,0x333,0.25).setStrokeStyle(1,0x666).setInteractive({useHandCursor:true});
    this.add.text(w/2+120,h/2+160,'↺ リセット',{fontSize:'12px',fontFamily:'Courier New',color:'#aaa'}).setOrigin(0.5);
    rst.on('pointerdown',()=>this._reset(S));rst.on('pointerover',()=>rst.setFillStyle(0x666,0.4));rst.on('pointerout',()=>rst.setFillStyle(0x333,0.25));
    c.add(rst);
  }
  _sv(pd,key){if(key==='spd')return String(pd.spd);if(key==='mhp')return String(pd.mhp);return String(pd[key]);}
  _refreshPts(){if(this._ptsTxt)this._ptsTxt.setText('残りポイント: '+this._tmpPts+'pt');}
  _adj(s,dir,cur,add){
    const n=this._tmp[s.key]||0;
    if(dir>0&&this._tmpPts<=0)return;
    if(dir<0&&n<=0)return;
    this._tmp[s.key]=n+dir;this._tmpPts-=dir;
    add.setText(this._tmp[s.key]>0?'(+'+this._tmp[s.key]+')':this._tmp[s.key]<0?'('+this._tmp[s.key]+')':'');
    this._refreshPts();SE('potion');
  }
  _confirm(pd,S){
    let any=false;
    S.forEach(s=>{const n=this._tmp[s.key]||0;if(n>0){s.apply(pd,n);any=true;}this._tmp[s.key]=0;});
    pd.statPts=this._tmpPts;
    S.forEach(s=>{if(this._vt[s.key])this._vt[s.key].setText(this._sv(pd,s.key));if(this._at[s.key])this._at[s.key].setText('');});
    this._refreshPts();if(any)SE('levelup');
  }
  _reset(S){
    S.forEach(s=>{this._tmpPts+=this._tmp[s.key]||0;this._tmp[s.key]=0;if(this._at[s.key])this._at[s.key].setText('');});
    this._refreshPts();
  }
  _buildSkill(pd,w,h){
    const c=this.skillCont;
    const DEFS={
      warrior:[{id:'sk1',name:'烈風斬',maxLv:10,desc:'周囲の敵を吹き飛ばす（Lv×0.3倍率UP）'},{id:'sk2',name:'ハードガード',maxLv:10,desc:'防御力大幅UP（Lv×3秒追加）'},{id:'sk3',name:'パリィ',maxLv:5,desc:'攻撃無効化・3秒間'}],
      mage:   [{id:'sk1',name:'大爆発',maxLv:10,desc:'広範囲大ダメージ（Lv×0.35倍率UP）'},{id:'sk2',name:'フロスト',maxLv:10,desc:'広範囲凍結（Lv×0.8秒延長）'},{id:'sk3',name:'ボルテックス',maxLv:5,desc:'雷の貫通弾（Lv×6サイズUP）'}],
      archer: [{id:'sk1',name:'5方向射撃',maxLv:10,desc:'5方向同時射撃（Lv×0.25倍率UP）'},{id:'sk2',name:'グロリアスショット',maxLv:10,desc:'クリ率×5（Lv×5秒延長）'},{id:'sk3',name:'バルカン',maxLv:10,desc:'2+Lv連射（最大12連射）'}],
      bomber: [{id:'sk1',name:'大爆弾',maxLv:10,desc:'巨大爆弾（Lv×0.35倍率UP）'},{id:'sk2',name:'クラスター',maxLv:10,desc:'4+Lv方向に子爆弾'},{id:'sk3',name:'ハイパーボム',maxLv:5,desc:'超強力巨大爆弾'}],
    };
    const defs=DEFS[pd.cls]||[];
    const jpTxt=this.add.text(w/2,h/2-170,'JLv'+(pd.jobLv||1)+'  JOBポイント: '+(pd.jobPts||0)+'pt',{fontSize:'13px',fontFamily:'Courier New',color:'#ffff44'}).setOrigin(0.5);
    const jbg=this.add.rectangle(w/2,h/2-152,300,8,0x222222).setOrigin(0.5);
    const jbar=this.add.rectangle(w/2-150,h/2-152,300*Math.min(1,(pd.jobExp||0)/(pd.jobExpNext||80)),8,0x00e5ff).setOrigin(0,0.5);
    c.add([jpTxt,jbg,jbar]);
    defs.forEach((sk,i)=>{
      const y=h/2-105+i*88,cur=pd[sk.id]||0,maxed=cur>=sk.maxLv,col=cur>0?0x00e5ff:0x555555;
      const bg=this.add.rectangle(w/2,y,520,76,col,0.07).setStrokeStyle(1,col);
      const kl=this.add.text(w/2-240,y-20,['[Q]','[E]','[R]'][i],{fontSize:'10px',fontFamily:'Courier New',color:'#777'}).setOrigin(0,0.5);
      const nm=this.add.text(w/2-205,y-20,sk.name,{fontSize:'14px',fontFamily:'Courier New',color:'#'+col.toString(16).padStart(6,'0')}).setOrigin(0,0.5);
      const ds=this.add.text(w/2-240,y+4,sk.desc,{fontSize:'10px',fontFamily:'Courier New',color:'#777',wordWrap:{width:310}}).setOrigin(0,0.5);
      for(let j=0;j<sk.maxLv;j++){c.add(this.add.rectangle(w/2+60+j*16,y-20,13,14,j<cur?0x00e5ff:0x1a1a2e).setStrokeStyle(1,0x333366));}
      const lvt=this.add.text(w/2+240,y-20,'Lv'+cur+'/'+sk.maxLv,{fontSize:'11px',fontFamily:'Courier New',color:maxed?'#ffd700':'#888'}).setOrigin(0.5);
      c.add([bg,kl,nm,ds,lvt]);
      if(!maxed){
        const btn=this.add.rectangle(w/2+215,y+20,120,28,0x00e5ff,0.2).setStrokeStyle(1,0x00e5ff).setInteractive({useHandCursor:true});
        const bt=this.add.text(w/2+215,y+20,cur===0?'習得(1JP)':'強化(1JP)',{fontSize:'11px',fontFamily:'Courier New',color:'#00e5ff'}).setOrigin(0.5);
        btn.on('pointerover',()=>btn.setFillStyle(0x00e5ff,0.45));btn.on('pointerout',()=>btn.setFillStyle(0x00e5ff,0.2));
        btn.on('pointerdown',()=>{
          if((pd.jobPts||0)<1)return;
          pd.jobPts--;pd[sk.id]=(pd[sk.id]||0)+1;SE('potion');
          this.scene.restart({playerData:pd,returnScene:this.returnScene,returnData:this.returnData,tab:'skill'});
        });
        c.add([btn,bt]);
      }else{c.add(this.add.text(w/2+215,y+20,'MAX',{fontSize:'13px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5));}
    });
  }
  _close(){this.scene.stop();this.scene.resume(this.returnScene,this.returnData);}
}

class GameClearScene extends Phaser.Scene{
  constructor(){super('GameClear')}
  init(data){this.playerData=data.playerData}
  create(){
    const pd=this.playerData,w=this.scale.width,h=this.scale.height;
    startBGM('clear');
    this.bgmTimer=this.time.addEvent({delay:100,loop:true,callback:updateBGM});
    SE('clear');
    this.add.rectangle(0,0,w,h,0x020810).setOrigin(0);
    for(let i=0;i<8;i++){
      this.time.delayedCall(i*300,()=>{
        const fx=Phaser.Math.Between(80,w-80),fy=Phaser.Math.Between(60,h*0.6);
        const col=[0xffd700,0xe74c3c,0x2ecc71,0x3498db,0x9b59b6,0xff8c00][Phaser.Math.Between(0,5)];
        for(let j=0;j<16;j++){
          const ang=j/16*Math.PI*2,spd=Phaser.Math.FloatBetween(60,120);
          const dot=this.add.circle(fx,fy,3,col);
          this.tweens.add({targets:dot,x:fx+Math.cos(ang)*spd,y:fy+Math.sin(ang)*spd,alpha:0,duration:900,onComplete:()=>dot.destroy()});
        }
      });
    }
    const t1=this.add.text(w/2,h*0.18,'🏆 GAME CLEAR 🏆',{fontSize:'36px',fontFamily:'Courier New',color:'#ffd700',stroke:'#ff8c00',strokeThickness:4}).setOrigin(0.5).setAlpha(0);
    this.tweens.add({targets:t1,alpha:1,duration:800,delay:200});
    const panel=this.add.rectangle(w/2,h*0.56,400,240,0x0a1428,0.95).setAlpha(0).setStrokeStyle(2,0xffd700);
    this.tweens.add({targets:panel,alpha:1,duration:600,delay:600});
    const cls={warrior:'剣士',mage:'マジャン',archer:'アーチャー',bomber:'ボマー'}[pd.cls]||pd.cls;
    const scores=[['職業',cls],['最終Lv','Lv '+pd.lv],['ATK/DEF/MAG',pd.atk+'/'+pd.def+'/'+pd.mag],['討伐数',pd.kills+'体'],['獲得Gold',pd.gold+'G']];
    scores.forEach(([k,v],i)=>{
      const y=h*0.41+i*32;
      const a=this.add.text(w/2-160,y,k,{fontSize:'14px',fontFamily:'Courier New',color:'#888888'}).setAlpha(0);
      const b=this.add.text(w/2+40,y,v,{fontSize:'14px',fontFamily:'Courier New',color:'#ffd700'}).setAlpha(0);
      this.tweens.add({targets:[a,b],alpha:1,duration:400,delay:800+i*150});
    });
    const btn=this.add.rectangle(w/2,h*0.87,240,48,0xffd700,0.2).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true}).setAlpha(0);
    const btnTxt=this.add.text(w/2,h*0.87,'▶ タイトルへ戻る',{fontSize:'16px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setAlpha(0);
    this.tweens.add({targets:[btn,btnTxt],alpha:1,duration:500,delay:2000});
    btn.on('pointerover',()=>btn.setFillStyle(0xffd700,0.4));
    btn.on('pointerout', ()=>btn.setFillStyle(0xffd700,0.2));
    const go=()=>{this.bgmTimer.remove();bgmKey=null;this.scene.start('Title')};
    btn.on('pointerdown',go);
    this.time.delayedCall(2500,()=>this.input.keyboard.once('keydown',go));
  }
}

// ============================================================
//  ステージ設定
// ============================================================
const STAGE_CONFIG={
  1:{name:'ST.1 草原',bgmKey:'st1',tiles:['tile_grass','tile_flower','tile_dark_forest'],tileWeights:[81,5,14],objects:['obj_tree'],objPos:[[180,120],[500,90],[740,180],[145,400],[900,290],[350,600],[800,540],[950,700],[420,320],[650,800]],enemies:[['slime',300,200],['slime',700,300],['slime',500,500],['slime',850,200],['slime',170,540],['bat',400,150],['bat',900,400],['bat',210,490],['goblin',600,590],['goblin',160,290],['goblin',970,490],['troll',800,690],['troll',340,740]],boss:{id:'boss1',x:600,y:300},bossThreshold:8,portalTo:2,portalToLabel:'⛰ ST.2へ',portalToKey:'portal_st2',portalBack:0,portalBackLabel:'🏘 町へ',portalBackKey:'portal_town'},
  2:{name:'ST.2 溶岩地帯',bgmKey:'st2',tiles:['tile_volcanic','tile_lava','tile_dark_forest'],tileWeights:[72,10,18],objects:['obj_lava_rock'],objPos:[[200,150],[550,100],[780,200],[120,450],[950,300],[380,650],[820,580],[1000,750],[460,340],[700,820]],enemies:[['goblin',300,200],['goblin',700,250],['goblin',300,450],['goblin',900,320],['wolf',550,580],['wolf',800,700],['wolf',400,750],['troll',650,480],['troll',820,560],['troll',250,720],['skeleton',350,550],['skeleton',750,620],['skeleton',600,400]],boss:{id:'boss2',x:600,y:300},bossThreshold:10,portalTo:3,portalToLabel:'🏖 ST.3へ',portalToKey:'portal_st3',portalBack:1,portalBackLabel:'🌿 ST.1へ',portalBackKey:'portal_st1'},
  3:{name:'ST.3 海岸',bgmKey:'st3',tiles:['tile_sand_beach','tile_sea','tile_oasis_grass'],tileWeights:[60,20,20],objects:['obj_palm'],objPos:[[180,640],[280,700],[500,720],[720,670],[900,740],[1050,700],[180,800],[380,840],[600,820],[820,810]],enemies:[['slime',350,400],['slime',700,420],['slime',500,600],['slime',900,380],['bat',400,350],['bat',750,300],['bat',1000,450],['goblin',300,500],['goblin',650,550],['goblin',950,500],['wolf',500,700],['wolf',800,750],['wolf',300,780],['skeleton',400,600],['skeleton',850,550]],boss:{id:'boss3',x:600,y:300},bossThreshold:12,portalTo:4,portalToLabel:'🏜 ST.4へ',portalToKey:'portal_st4',portalBack:2,portalBackLabel:'⛰ ST.2へ',portalBackKey:'portal_st2'},
  4:{name:'ST.4 砂漠(最終)',bgmKey:'st4',tiles:['tile_sand_desert','tile_oasis_grass','tile_sand_beach'],tileWeights:[70,15,15],objects:['obj_desert_rock'],objPos:[[200,180],[560,120],[800,220],[130,480],[980,320],[400,680],[860,600],[1050,780],[480,360],[720,850]],enemies:[['sandworm',400,160],['sandworm',700,192],['sandworm',300,640],['sandworm',650,740],['scorpion',500,300],['scorpion',750,330],['scorpion',350,480],['scorpion',600,500],['wolf',250,430],['wolf',700,680],['dragon',500,600],['dragon',800,430],['skeleton',420,750],['skeleton',900,580]],boss:{id:'boss3',x:600,y:300},bossThreshold:12,portalTo:null,portalToLabel:'',portalBack:3,portalBackLabel:'🏖 ST.3へ',portalBackKey:'portal_st3'},
};
const ENEMY_DEFS={
  slime:   {hp:28, atk:4, def:0, spd:60, exp:12,gold:3,  sz:28,rng:36,acd:1.2},
  bat:     {hp:20, atk:6, def:0, spd:110,exp:18,gold:4,  sz:24,rng:32,acd:0.9},
  goblin:  {hp:52, atk:8, def:1, spd:80, exp:30,gold:7,  sz:32,rng:40,acd:1.0},
  troll:   {hp:120,atk:12,def:2, spd:45, exp:60,gold:15, sz:48,rng:48,acd:1.8},
  wolf:    {hp:65, atk:14,def:1, spd:120,exp:45,gold:10, sz:32,rng:40,acd:0.8},
  skeleton:{hp:80, atk:11,def:3, spd:70, exp:40,gold:12, sz:32,rng:40,acd:1.1},
  dragon:  {hp:200,atk:20,def:4, spd:90, exp:100,gold:30,sz:56,rng:60,acd:1.5},
  sandworm:{hp:280,atk:22,def:6, spd:55, exp:120,gold:35,sz:52,rng:50,acd:2.0},
  scorpion:{hp:130,atk:28,def:3, spd:100,exp:90,gold:28, sz:28,rng:36,acd:0.7},
  boss1:   {hp:600,atk:18,def:5, spd:80, exp:500,gold:200,sz:72,rng:64,acd:1.2,isBoss:true},
  boss2:   {hp:900,atk:25,def:8, spd:90, exp:800,gold:350,sz:80,rng:70,acd:1.0,isBoss:true},
  boss3:   {hp:1400,atk:35,def:10,spd:100,exp:1500,gold:600,sz:88,rng:80,acd:0.9,isBoss:true},
};

// ============================================================
//  GameScene
// ============================================================
class GameScene extends Phaser.Scene{
  constructor(){super('Game')}
  init(data){
    this.playerData=data.playerData||makePlayerData('warrior');
    this.stage=data.stage||1;
    this.killCount=0;
    this.bossSpawned=false;
  }
  create(){
    const MW=1200,MH=1000;
    this.MW=MW;this.MH=MH;
    const cfg=STAGE_CONFIG[this.stage]||STAGE_CONFIG[1];
    this.cfg=cfg;
    // ステージ進入時HP/SP全回復 ③要件§10
    const pd=this.playerData;
    pd.hp=pd.mhp; pd.sp=pd.msp;

    startBGM(cfg.bgmKey);
    this.bgmTimer=this.time.addEvent({delay:100,loop:true,callback:updateBGM});
    this.cameras.main.setBounds(0,0,MW,MH);
    this.physics.world.setBounds(0,0,MW,MH);
    // タイル
    const cols=Math.ceil(MW/TILE),rows=Math.ceil(MH/TILE);
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const n=(c*31+r*17)%100;let acc=0,key=cfg.tiles[0];
      for(let i=0;i<cfg.tileWeights.length;i++){acc+=cfg.tileWeights[i];if(n<acc){key=cfg.tiles[i];break;}}
      this.add.image(c*TILE+16,r*TILE+16,key).setDisplaySize(TILE,TILE);
    }
    // 障害物
    this.obstacles=this.physics.add.staticGroup();
    cfg.objPos.forEach(([x,y])=>{const o=this.obstacles.create(x,y,cfg.objects[0]).setDisplaySize(32,40);o.refreshBody();});
    // ポータル（戻る）
    this.add.image(80,MH/2,'portal_'+cfg.portalBackKey.replace('portal_','')).setDisplaySize(80,64);
    this.add.text(80,MH/2+44,cfg.portalBackLabel,{fontSize:'10px',fontFamily:'Courier New',color:'#ffd700',align:'center'}).setOrigin(0.5);
    // ポータル（次）
    this.portalNext=null;this.portalNextImg=null;this.portalNextTxt=null;
    if(cfg.portalTo){
      this.portalNextImg=this.add.image(MW-80,MH/2,cfg.portalToKey).setDisplaySize(80,64).setAlpha(0.25);
      this.portalNextTxt=this.add.text(MW-80,MH/2+44,cfg.portalToLabel+'\n(ボス撃破で開放)',{fontSize:'9px',fontFamily:'Courier New',color:'#666666',align:'center'}).setOrigin(0.5);
      this.portalNext={x:MW-80,y:MH/2,to:cfg.portalTo,open:false};
    }
    // プレイヤー
    this.player=this.physics.add.sprite(200,MH/2,'player_'+pd.cls).setDisplaySize(48,60).setCollideWorldBounds(true).setDepth(5);
    this.physics.add.collider(this.player,this.obstacles);
    this.cameras.main.startFollow(this.player,true,0.1,0.1);
    // 弾グループ
    this.bullets=this.physics.add.group();
    // 敵
    this.enemies=this.physics.add.group();
    this.enemyDataList=[];this.bossData=null;
    cfg.enemies.forEach(([id,x,y])=>this.spawnEnemy(id,x,y));
    // 弾→敵ヒット判定
    this.physics.add.overlap(this.bullets,this.enemies,(bull,enemySp)=>{
      if(bull.getData('dead'))return;
      const ed=this.enemyDataList.find(e=>e.sprite===enemySp&&!e.dead);
      if(!ed)return;
      const pierce=bull.getData('pierce')||false;
      if(!pierce)bull.setData('dead',true);
      const dmg=bull.getData('dmg')||1;
      const isCrit=bull.getData('isCrit')||false;
      if(bull.getData('miss')){this.showFloat(ed.sprite.x,ed.sprite.y-30,'Miss','#888888');SE('miss');}
      else this.hitEnemy(ed,dmg,isCrit);
      if(!pierce)bull.destroy();
    });
    // ドロップ
    this.drops=this.physics.add.staticGroup();
    this.physics.add.overlap(this.player,this.drops,(pl,drop)=>{
      const t=drop.getData('type');
      if(t==='hp'){pd.potHP=(pd.potHP||0)+1;this.showFloat(drop.x,drop.y,'💊+1','#2ecc71');}
      if(t==='mp'){pd.potMP=(pd.potMP||0)+1;this.showFloat(drop.x,drop.y,'💧+1','#3498db');}
      drop.destroy();this.updateHUD();
      if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
      if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
    });
    // 入力
    this.cursors=this.input.keyboard.createCursorKeys();
    this.wasd=this.input.keyboard.addKeys('W,A,S,D');
    this.spaceKey=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.on('keydown-F',()=>this.usePotion('hp'));
    this.input.keyboard.on('keydown-G',()=>this.usePotion('mp'));
    this.input.keyboard.on('keydown-Q',()=>this.useSkill(1));
    this.input.keyboard.on('keydown-E',()=>this.useSkill(2));
    this.input.keyboard.on('keydown-R',()=>this.useSkill(3));
    // タッチ/クリック
    this.input.on('pointerdown',ptr=>{
      const h=this.scale.height;
      if(ptr.x<160&&ptr.y>h-160)return;
      if(ptr.y>h-60)return;
      const wx=ptr.worldX,wy=ptr.worldY;
      let closest=null,cd=999;
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(wx,wy,ed.sprite.x,ed.sprite.y);
        if(d<80&&d<cd){cd=d;closest=ed;}
      });
      if(closest){this.target=closest;this.autoAtkTimer=0;}
      else{this.target=null;this.normalAttack();}
    });
    this.atkCooldown=0;this.skillCooldown=0;this.target=null;this.autoAtkTimer=0;
    // 攻撃向き
    this.facingAngle=0;
    this.input.on('pointermove',ptr=>{
      if(ptr.y<this.scale.height-60)
        this.facingAngle=Phaser.Math.Angle.Between(this.player.x-this.cameras.main.scrollX,this.player.y-this.cameras.main.scrollY,ptr.x,ptr.y);
    });
    this.createHUD();this.createSkillButtons();this.createMinimap();this.createJoystick();
    const ann=this.add.text(this.scale.width/2,80,cfg.name,{fontSize:'28px',fontFamily:'Courier New',color:'#ffd700',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0).setDepth(30);
    this.tweens.add({targets:ann,alpha:0,duration:2000,delay:1500,onComplete:()=>ann.destroy()});
    const muteBtn=this.add.text(this.scale.width-4,4,'🔊',{fontSize:'16px'}).setOrigin(1,0).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    muteBtn.on('pointerdown',()=>{muted=!muted;muteBtn.setText(muted?'🔇':'🔊')});
  }

  // ── 職業別通常攻撃 ② ───────────────────────────
  normalAttack(){
    if(this.atkCooldown>0)return;
    const pd=this.playerData,p=this.player;
    const cls=pd.cls;

    if(cls==='warrior'){
      // 近接：周囲72px最近傍
      let closest=null,cd=72;
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
        if(d<cd){cd=d;closest=ed;}
      });
      if(!closest)return;
      const res=rollAttack(pd,closest.def,closest.spd);
      if(res.miss){this.showFloat(p.x,p.y-40,'Miss','#888888');SE('miss');}
      else{this.hitEnemy(closest,res.dmg,res.isCrit);}
      // スラッシュエフェクト
      const ang=Phaser.Math.Angle.Between(p.x,p.y,closest.sprite.x,closest.sprite.y);
      const slash=this.add.image(p.x+Math.cos(ang)*40,p.y+Math.sin(ang)*40,'fx_slash').setRotation(ang).setDisplaySize(48,48).setDepth(20).setAlpha(0.9);
      this.tweens.add({targets:slash,alpha:0,scaleX:1.5,scaleY:1.5,duration:200,onComplete:()=>slash.destroy()});
      SE('hit');
      this.atkCooldown=0.5;

    }else if(cls==='mage'){
      // ファイアボール発射（SP3消費）
      if(pd.sp<3){this.showFloat(p.x,p.y-40,'SP不足','#3498db');return;}
      pd.sp-=3;
      const ang=this.getFacingAngle();
      this.fireBullet(p.x,p.y,ang,'proj_fireball',{
        spd:320,maxDist:520,
        dmg:Math.max(1,pd.mag*3+Phaser.Math.Between(0,pd.mag)),
        isCrit:Math.random()*100<calcCrit(pd),
        sz:20,
      });
      SE('magic');this.updateHUD();
      this.atkCooldown=0.4;

    }else if(cls==='archer'){
      // 矢発射
      const ang=this.getFacingAngle();
      const res=rollAttack(pd,0,0);
      this.fireBullet(p.x,p.y,ang,'proj_arrow',{
        spd:540,maxDist:650,
        dmg:res.miss?0:Math.max(1,pd.atk*2+Phaser.Math.Between(0,pd.atk)),
        isCrit:!res.miss&&res.isCrit,
        miss:res.miss,
        sz:14,
      });
      SE('arrow');
      this.atkCooldown=0.3;

    }else if(cls==='bomber'){
      // 爆弾投擲（放物線）→ 着弾時に範囲ダメージ
      const ang=this.getFacingAngle();
      const dist=180;
      const tx=p.x+Math.cos(ang)*dist, ty=p.y+Math.sin(ang)*dist;
      this.throwBomb(p.x,p.y,tx,ty,{
        dmg:Math.max(1,pd.atk*3+Phaser.Math.Between(0,pd.atk*2)),
        isCrit:Math.random()*100<calcCrit(pd),
        radius:55,
      });
      SE('explode');
      this.atkCooldown=0.9;
    }
  }

  getFacingAngle(){
    // ターゲットがいれば向かう方向、なければマウス向き
    if(this.target&&!this.target.dead){
      return Phaser.Math.Angle.Between(this.player.x,this.player.y,this.target.sprite.x,this.target.sprite.y);
    }
    return this.facingAngle||0;
  }

  fireBullet(x,y,ang,texture,opt){
    const b=this.bullets.create(x,y,texture).setDisplaySize(opt.sz,opt.sz).setDepth(7);
    b.setVelocity(Math.cos(ang)*opt.spd,Math.sin(ang)*opt.spd);
    b.setData('dmg',opt.dmg||0);
    b.setData('isCrit',opt.isCrit||false);
    b.setData('miss',opt.miss||false);
    b.setData('dead',false);
    b.setData('dist',0);
    b.setData('maxDist',opt.maxDist||400);
    b.setData('vx',Math.cos(ang)*opt.spd);
    b.setData('vy',Math.sin(ang)*opt.spd);
    b.rotation=ang;
    return b;
  }

  throwBomb(sx,sy,tx,ty,opt){
    // 放物線：tweenで放物線移動
    const bx=(sx+tx)/2, by=Math.min(sy,ty)-80;
    const bomb=this.add.image(sx,sy,'proj_bomb').setDisplaySize(20,20).setDepth(7);
    this.tweens.add({
      targets:bomb,
      x:{value:tx,duration:500,ease:'Linear'},
      y:{value:ty,duration:500,ease:'Quad.easeIn'},
      onComplete:()=>{
        bomb.destroy();
        // 爆発エフェクト
        const exp=this.add.image(tx,ty,'fx_explosion').setDisplaySize(80,80).setDepth(15);
        this.tweens.add({targets:exp,alpha:0,scaleX:2,scaleY:2,duration:350,onComplete:()=>exp.destroy()});
        // 範囲ダメージ
        this.enemyDataList.forEach(ed=>{
          if(ed.dead)return;
          const d=Phaser.Math.Distance.Between(tx,ty,ed.sprite.x,ed.sprite.y);
          if(d<=opt.radius){
            const decay=1-d/opt.radius*0.6;
            const dmg=Math.max(1,Math.floor(opt.dmg*decay));
            this.hitEnemy(ed,dmg,opt.isCrit);
          }
        });
        this.cameras.main.shake(200,0.008);
      }
    });
  }

  // ── スキル ────────────────────────────────────
  // ── スキル定義（④ 3スキル対応）────────────────
  getSkillDefs(){
    // 各職業のスキル3種定義（要件書§4）
    return {
      warrior:[
        {id:'sk1',name:'烈風斬',    cost:20,cd:4,  desc:'周囲140px全敵に4倍ダメージ'},
        {id:'sk2',name:'ハードガード',cost:15,cd:8, desc:'DEF+30・6秒間（Lv×3秒追加）'},
        {id:'sk3',name:'パリィ',    cost:10,cd:12, desc:'3秒間ダメージ無効化'},
      ],
      mage:[
        {id:'sk1',name:'大爆発',    cost:30,cd:5,  desc:'周囲220px全敵に6倍魔法ダメージ'},
        {id:'sk2',name:'フロスト',  cost:25,cd:7,  desc:'周囲160pxの敵を3秒凍結'},
        {id:'sk3',name:'ボルテックス',cost:20,cd:4,desc:'貫通する雷の弾を発射'},
      ],
      archer:[
        {id:'sk1',name:'5方向射撃', cost:15,cd:3,  desc:'5方向同時に矢を放つ'},
        {id:'sk2',name:'グロリアスショット',cost:20,cd:10,desc:'10秒間クリティカル率×5'},
        {id:'sk3',name:'バルカン',  cost:30,cd:6,  desc:'前方に6連射'},
      ],
      bomber:[
        {id:'sk1',name:'大爆弾',    cost:25,cd:5,  desc:'範囲100pxの巨大爆弾'},
        {id:'sk2',name:'クラスター',cost:20,cd:6,  desc:'4方向に子爆弾'},
        {id:'sk3',name:'ハイパーボム',cost:35,cd:8,desc:'超巨大爆弾・範囲150px'}
      ],
    }[this.playerData.cls]||[];
  }

  useSkill(num=1){
    const pd=this.playerData,p=this.player;
    const defs=this.getSkillDefs();
    const sk=defs[num-1]; if(!sk)return;
    const skKey='sk'+num;
    if(pd[skKey]===0){this.showFloat(p.x,p.y-50,'スキル未習得','#888888');return;}
    const cdKey='skillCD'+num;
    if((this[cdKey]||0)>0)return;
    if(pd.sp<sk.cost){this.showFloat(p.x,p.y-50,'SP不足','#3498db');return;}
    pd.sp-=sk.cost; SE('skill');

    // ─ 剣士 ─
    if(pd.cls==='warrior'){
      if(num===1){ // 烈風斬
        const range=140*(1+(pd.sk1-1)*0.1);
        this.enemyDataList.forEach(ed=>{if(!ed.dead&&Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y)<range){const dmg=Math.max(1,pd.atk*(4+pd.sk1*0.3));this.hitEnemy(ed,dmg,Math.random()*100<calcCrit(pd));}});
        this.showFloat(p.x,p.y-60,'⚔ 烈風斬！','#e74c3c');this.cameras.main.shake(200,0.01);
      }else if(num===2){ // ハードガード
        const dur=(6+pd.sk2*1.5)*1000;
        this._guardDef=pd.def; pd.def+=30;
        this.showFloat(p.x,p.y-60,'🛡 ハードガード！','#3498db');
        const flash=this.add.rectangle(p.x,p.y,60,80,0x3498db,0.3).setDepth(20);
        this.tweens.add({targets:flash,alpha:0,duration:dur,onComplete:()=>{flash.destroy();pd.def=this._guardDef;}});
      }else if(num===3){ // パリィ
        pd._parry=true;
        this.showFloat(p.x,p.y-60,'🛡 パリィ！','#ffd700');
        this.time.delayedCall(3000,()=>{pd._parry=false;});
      }
    }
    // ─ マジャン ─
    else if(pd.cls==='mage'){
      if(num===1){ // 大爆発
        const range=220*(1+(pd.sk1-1)*0.08);
        this.enemyDataList.forEach(ed=>{if(!ed.dead&&Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y)<range){const dmg=Math.max(1,pd.mag*(6+pd.sk1*0.35));this.hitEnemy(ed,dmg,Math.random()*100<calcCrit(pd));}});
        this.showFloat(p.x,p.y-60,'💥 大爆発！','#9b59b6');this.cameras.main.shake(300,0.015);
      }else if(num===2){ // フロストアタック（凍結）
        const range=160+pd.sk2*20;
        const dur=(3+pd.sk2*0.8)*1000;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead)return;
          if(Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y)<range){
            ed.frozen=true;ed.frozenTimer=dur/1000;
            ed.sprite.setTint(0x88ccff);
            const ice=this.add.image(ed.sprite.x,ed.sprite.y,'fx_freeze').setDisplaySize(40,40).setDepth(8).setAlpha(0.8);
            ed._iceImg=ice;
          }
        });
        this.showFloat(p.x,p.y-60,'❄ フロスト！','#88ccff');SE('skill');
      }else if(num===3){ // ボルテックスボール（貫通）
        const ang=this.getFacingAngle();
        const sz=10+pd.sk3*6;
        const bull=this.fireBullet(p.x,p.y,ang,'proj_vortexball',{spd:400,maxDist:700,dmg:Math.max(1,pd.mag*(1.2+pd.sk3*0.1)),isCrit:Math.random()*100<calcCrit(pd),sz});
        bull.setData('pierce',true); // 貫通フラグ
        this.showFloat(p.x,p.y-60,'⚡ ボルテックス！','#44ffff');
      }
    }
    // ─ アーチャー ─
    else if(pd.cls==='archer'){
      if(num===1){ // 5方向射撃
        const ang=this.getFacingAngle();
        for(let i=-2;i<=2;i++){
          const a=ang+i*0.22;
          const res=rollAttack(pd,0,0);
          const dmg=res.miss?0:Math.max(1,pd.atk*(1+pd.sk1*0.25));
          this.fireBullet(p.x,p.y,a,'proj_arrow',{spd:540,maxDist:600,dmg,isCrit:!res.miss&&res.isCrit,sz:14});
        }
        this.showFloat(p.x,p.y-60,'🏹 5方向射撃！','#27ae60');SE('arrow');
      }else if(num===2){ // グロリアスショット（クリ率UP）
        const dur=(5+pd.sk2*5)*1000;
        pd._gloryLuk=pd.luk; pd.luk*=5;
        this.showFloat(p.x,p.y-60,'✨ グロリアスショット！','#ffd700');
        this.time.delayedCall(dur,()=>{pd.luk=pd._gloryLuk;});
      }else if(num===3){ // バルカンショット（連射）
        const shots=2+pd.sk3;
        const ang=this.getFacingAngle();
        for(let i=0;i<shots;i++){
          this.time.delayedCall(i*80,()=>{
            const res=rollAttack(pd,0,0);
            const dmg=res.miss?0:Math.max(1,pd.atk*2);
            this.fireBullet(p.x,p.y,ang+(Math.random()-0.5)*0.1,'proj_arrow',{spd:560,maxDist:650,dmg,isCrit:!res.miss&&res.isCrit,sz:14});
          });
        }
        this.showFloat(p.x,p.y-60,'🏹 バルカン'+shots+'連射！','#27ae60');SE('arrow');
      }
    }
    // ─ ボマー ─
    else if(pd.cls==='bomber'){
      if(num===1){ // 大爆弾
        const ang=this.getFacingAngle();
        const radius=55*(1+pd.sk1*0.12);
        const tx=p.x+Math.cos(ang)*200,ty=p.y+Math.sin(ang)*200;
        this.throwBomb(p.x,p.y,tx,ty,{dmg:Math.max(1,pd.atk*(1.5+pd.sk1*0.35)),isCrit:Math.random()*100<calcCrit(pd),radius});
        this.showFloat(p.x,p.y-60,'💣 大爆弾！','#f39c12');
      }else if(num===2){ // クラスター爆弾
        const dirs=4+pd.sk2;
        for(let i=0;i<dirs;i++){
          const a=i/dirs*Math.PI*2;
          const tx=p.x+Math.cos(a)*120,ty=p.y+Math.sin(a)*120;
          this.throwBomb(p.x,p.y,tx,ty,{dmg:Math.max(1,pd.atk*(0.8+pd.sk2*0.15)),isCrit:Math.random()*100<calcCrit(pd),radius:40});
        }
        this.showFloat(p.x,p.y-60,'💥 クラスター！','#f39c12');
      }else if(num===3){ // ハイパーボム
        const ang=this.getFacingAngle();
        const radius=150*(1+pd.sk3*0.2);
        const tx=p.x+Math.cos(ang)*220,ty=p.y+Math.sin(ang)*220;
        this.throwBomb(p.x,p.y,tx,ty,{dmg:Math.max(1,pd.atk*(3+pd.sk3*0.8)),isCrit:Math.random()*100<calcCrit(pd),radius});
        this.showFloat(p.x,p.y-60,'💣 ハイパーボム！','#ff6600');this.cameras.main.shake(500,0.025);
      }
    }

    this[cdKey]=sk.cd;
    this.updateHUD();
  }

  doAttack(){
    if(this.atkCooldown>0||!this.target||this.target.dead)return;
    this.normalAttack();
  }

  attackNearest(){
    let closest=null,cd=200;
    this.enemyDataList.forEach(ed=>{if(ed.dead)return;const d=Phaser.Math.Distance.Between(this.player.x,this.player.y,ed.sprite.x,ed.sprite.y);if(d<cd){cd=d;closest=ed;}});
    if(closest){this.target=closest;this.normalAttack();}
  }

  // ── HUD（⑦ EXPバー・ジョブEXPバー追加）─────────
  createHUD(){
    const pd=this.playerData,w=this.scale.width,h=this.scale.height;
    // 背景（高さ110に拡張してEXPバー×2追加）
    this.add.rectangle(0,0,265,110,0x000000,0.80).setOrigin(0).setScrollFactor(0).setDepth(10);
    // HP
    this.add.rectangle(44,12,180,9,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudHPBar=this.add.rectangle(44,12,180*(pd.hp/pd.mhp),9,0x2ecc71).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,11,'HP',{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setScrollFactor(0).setDepth(12);
    this.hudHPTxt=this.add.text(228,11,'',{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setScrollFactor(0).setDepth(12);
    // SP
    this.add.rectangle(44,26,180,9,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudSPBar=this.add.rectangle(44,26,180*(pd.sp/pd.msp),9,0x3498db).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,25,'SP',{fontSize:'9px',fontFamily:'Courier New',color:'#3498db'}).setScrollFactor(0).setDepth(12);
    this.hudSPTxt=this.add.text(228,25,'',{fontSize:'9px',fontFamily:'Courier New',color:'#3498db'}).setScrollFactor(0).setDepth(12);
    // EXPバー（橙）⑦
    this.add.rectangle(44,40,180,7,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudEXPBar=this.add.rectangle(44,40,0,7,0xf39c12).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,39,'EX',{fontSize:'8px',fontFamily:'Courier New',color:'#f39c12'}).setScrollFactor(0).setDepth(12);
    this.hudEXPTxt=this.add.text(228,39,'',{fontSize:'8px',fontFamily:'Courier New',color:'#f39c12'}).setScrollFactor(0).setDepth(12);
    // ジョブEXPバー（シアン）⑦
    this.add.rectangle(44,52,180,7,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudJEXPBar=this.add.rectangle(44,52,0,7,0x00e5ff).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,51,'JB',{fontSize:'8px',fontFamily:'Courier New',color:'#00e5ff'}).setScrollFactor(0).setDepth(12);
    this.hudJEXPTxt=this.add.text(228,51,'',{fontSize:'8px',fontFamily:'Courier New',color:'#00e5ff'}).setScrollFactor(0).setDepth(12);
    // 情報行
    this.hudInfo=this.add.text(2,64,'',{fontSize:'9px',fontFamily:'Courier New',color:'#ffd700'}).setScrollFactor(0).setDepth(12);
    this.hudSub=this.add.text(2,78,'',{fontSize:'8px',fontFamily:'Courier New',color:'#aaaaaa'}).setScrollFactor(0).setDepth(12);
    this.hudSub2=this.add.text(2,90,'',{fontSize:'8px',fontFamily:'Courier New',color:'#888888'}).setScrollFactor(0).setDepth(12);
    // ステージバッジ
    this.add.rectangle(w-4,0,90,22,0x000000,0.7).setOrigin(1,0).setScrollFactor(0).setDepth(10);
    this.add.text(w-24,4,'ST.'+this.stage,{fontSize:'14px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(1,0).setScrollFactor(0).setDepth(12);
    // ボスHPバー
    this.bossHPBg=this.add.rectangle(w/2,h-44,w*0.6+8,20,0x000000,0.8).setScrollFactor(0).setDepth(10).setVisible(false);
    this.bossHPBar=this.add.rectangle(w/2-w*0.3,h-44,w*0.6,16,0xe74c3c).setOrigin(0,0.5).setScrollFactor(0).setDepth(11).setVisible(false);
    this.bossHPTxt=this.add.text(w/2,h-44,'',{fontSize:'11px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(12).setVisible(false);
    this.killTxt=this.add.text(2,100,'',{fontSize:'8px',fontFamily:'Courier New',color:'#888888'}).setScrollFactor(0).setDepth(12);
    // キャラアイコンボタン
    const cls={warrior:'剣',mage:'魔',archer:'弓',bomber:'爆'}[this.playerData.cls]||'?';
    this._menuBtn=this.add.rectangle(282,50,44,44,0x1a1a3a,0.9).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    this.add.text(282,46,cls,{fontSize:'18px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this.add.text(282,60,'MENU',{fontSize:'8px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this._menuBadge=this.add.text(298,30,'',{fontSize:'10px',fontFamily:'Courier New',color:'#ffff44',backgroundColor:'#e74c3c',padding:{x:2,y:1}}).setScrollFactor(0).setDepth(17);
    this._menuBtn.on('pointerdown',()=>this.openMenu('stat'));
    this._menuBtn.on('pointerover',()=>this._menuBtn.setFillStyle(0x44aaff,0.3));
    this._menuBtn.on('pointerout', ()=>this._menuBtn.setFillStyle(0x1a1a3a,0.9));
    this.updateHUD();
  }
  openMenu(tab='stat'){
    this.physics.pause();
    if(this.bgmTimer)this.bgmTimer.remove();
    this.scene.pause();
    this.scene.launch('Menu',{playerData:this.playerData,returnScene:'Game',returnData:{playerData:this.playerData,stage:this.stage},tab});
    // Menuが閉じたら再開
    this.scene.get('Menu').events.once('shutdown',()=>{
      this.physics.resume();
      if(this.bgmTimer)this.bgmTimer=this.time.addEvent({delay:100,loop:true,callback:updateBGM});
    });
  }
  _updateMenuBadge(){
    const pd=this.playerData;
    const pts=(pd.statPts||0)+(pd.jobPts||0);
    if(this._menuBadge)this._menuBadge.setText(pts>0?'↑'+pts:'');
  }
  updateHUD(){
    const pd=this.playerData;
    const hp=Math.max(0,pd.hp),sp=Math.max(0,pd.sp);
    const hpP=hp/pd.mhp,spP=sp/pd.msp;
    this.hudHPBar.setSize(180*hpP,9).setFillStyle(hpP>0.5?0x2ecc71:hpP>0.25?0xf39c12:0xe74c3c);
    this.hudSPBar.setSize(180*spP,9);
    this.hudHPTxt.setText(Math.ceil(hp)+'/'+pd.mhp);
    this.hudSPTxt.setText(Math.ceil(sp)+'/'+pd.msp);
    // EXPバー
    const expP=Math.min(1,pd.exp/pd.expNext);
    this.hudEXPBar.setSize(180*expP,7);
    this.hudEXPTxt.setText(pd.exp+'/'+pd.expNext);
    // ジョブEXPバー
    const jexpP=Math.min(1,(pd.jobExp||0)/(pd.jobExpNext||80));
    this.hudJEXPBar.setSize(180*jexpP,7);
    this.hudJEXPTxt.setText('JLv'+(pd.jobLv||1)+' '+(pd.jobExp||0)+'/'+(pd.jobExpNext||80));
    // 情報
    this.hudInfo.setText('Lv'+pd.lv+' 💰'+pd.gold+'G 💊'+(pd.potHP||0)+' 💧'+(pd.potMP||0)+(pd.statPts>0?' ⚡'+pd.statPts+'pt':''));
    this.hudSub.setText('ATK'+pd.atk+' DEF'+pd.def+' MAG'+pd.mag+' HIT'+pd.hit+'% CRT'+pd.luk+'%  討伐:'+pd.kills);
    // スキルレベル表示
    const sk=['SK1:'+pd.sk1,'SK2:'+pd.sk2,'SK3:'+pd.sk3].join(' ') + (pd.jobPts>0?' [JP残'+pd.jobPts+']':'');
    this.hudSub2.setText(sk);
    const thresh=this.cfg.bossThreshold;
    this.killTxt.setText(!this.bossSpawned?('ボス出現まで '+Math.max(0,thresh-this.killCount)+'体'):this.bossData?'⚠ BOSS出現中！':'✅ ボス撃破！');
  }
  updateBossHP(ed){
    const w=this.scale.width;
    if(!ed||ed.dead){this.bossHPBg.setVisible(false);this.bossHPBar.setVisible(false);this.bossHPTxt.setVisible(false);return;}
    const pct=Math.max(0,ed.hp/ed.mhp);
    this.bossHPBg.setVisible(true);
    this.bossHPBar.setVisible(true).setSize(w*0.6*pct,16).setFillStyle(pct>0.5?0xe74c3c:pct>0.25?0xff8800:0xff0000);
    this.bossHPTxt.setVisible(true).setText('⚠ BOSS: '+Math.ceil(ed.hp)+'/'+ed.mhp);
  }

  createSkillButtons(){
    const w=this.scale.width,h=this.scale.height,pd=this.playerData;
    const skillCols={warrior:0xe74c3c,mage:0x9b59b6,archer:0x27ae60,bomber:0xf39c12};
    const col=skillCols[pd.cls]||0xffd700;
    const defs=this.getSkillDefs();
    this.add.rectangle(0,h-56,w,56,0x000000,0.7).setOrigin(0).setScrollFactor(0).setDepth(10);
    // スキル3ボタン（Q/E/R）
    this.skillCDOverlays=[];this.skillCDTexts=[];
    [[70,'Q',1],[155,'E',2],[240,'R',3]].forEach(([bx,key,num])=>{
      const sk=defs[num-1]||{name:'---'};
      const hasSkill=pd['sk'+num]>0;
      const c=hasSkill?col:0x555555;
      const btn=this.add.rectangle(bx,h-28,78,38,c,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(1,c).setInteractive({useHandCursor:true});
      this.add.text(bx,h-37,'['+key+']',{fontSize:'9px',fontFamily:'Courier New',color:'#'+c.toString(16).padStart(6,'0')}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
      this.add.text(bx,h-26,sk.name,{fontSize:'9px',fontFamily:'Courier New',color:hasSkill?'#ffffff':'#666666'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
      this.add.text(bx,h-16,'Lv'+(pd['sk'+num]||0),{fontSize:'8px',fontFamily:'Courier New',color:'#888888'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
      btn.on('pointerdown',()=>this.useSkill(num));
      btn.on('pointerover',()=>btn.setFillStyle(c,hasSkill?0.5:0.1));
      btn.on('pointerout', ()=>btn.setFillStyle(c,0.25));
      const ov=this.add.rectangle(bx,h-28,78,38,0x000000,0).setScrollFactor(0).setDepth(13);
      const ct=this.add.text(bx,h-28,'',{fontSize:'14px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(14);
      this.skillCDOverlays.push({key:'skillCD'+num,ov,ct});
    });
    // [F] HPポーション
    const btnF=this.add.rectangle(340,h-28,72,38,0x2ecc71,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(1,0x2ecc71).setInteractive({useHandCursor:true});
    this.add.text(340,h-37,'[F] 💊',{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.potHPTxt=this.add.text(340,h-20,'x'+(pd.potHP||0),{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    btnF.on('pointerdown',()=>this.usePotion('hp'));btnF.on('pointerover',()=>btnF.setFillStyle(0x2ecc71,0.5));btnF.on('pointerout',()=>btnF.setFillStyle(0x2ecc71,0.25));
    // [G] MPポーション
    const btnG=this.add.rectangle(420,h-28,72,38,0x3498db,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(1,0x3498db).setInteractive({useHandCursor:true});
    this.add.text(420,h-37,'[G] 💧',{fontSize:'9px',fontFamily:'Courier New',color:'#3498db'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.potMPTxt=this.add.text(420,h-20,'x'+(pd.potMP||0),{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    btnG.on('pointerdown',()=>this.usePotion('mp'));btnG.on('pointerover',()=>btnG.setFillStyle(0x3498db,0.5));btnG.on('pointerout',()=>btnG.setFillStyle(0x3498db,0.25));
    // [Space] 攻撃
    const btnAtk=this.add.rectangle(w-75,h-28,110,38,0xffd700,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(1,0xffd700).setInteractive({useHandCursor:true});
    this.add.text(w-75,h-37,'[Space]',{fontSize:'9px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.add.text(w-75,h-20,'攻撃',{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    btnAtk.on('pointerdown',()=>this.normalAttack());btnAtk.on('pointerover',()=>btnAtk.setFillStyle(0xffd700,0.5));btnAtk.on('pointerout',()=>btnAtk.setFillStyle(0xffd700,0.25));
  }

  createMinimap(){
    const w=this.scale.width,h=this.scale.height,mw=100,mh=80,mx=w-mw-6,my=h-mh-62;
    this.add.rectangle(mx,my,mw,mh,0x000000,0.72).setOrigin(0).setScrollFactor(0).setDepth(20).setStrokeStyle(1,0xffd700);
    this.add.text(mx+mw/2,my-10,'ST.'+this.stage,{fontSize:'9px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.mmPlayerDot=this.add.circle(0,0,3,0xffd700).setScrollFactor(0).setDepth(23);
    this.mmEnemyDots=[];this.mmX=mx;this.mmY=my;this.mmW=mw;this.mmH=mh;
  }
  updateMinimap(){
    const p=this.player;
    this.mmPlayerDot.setPosition(this.mmX+p.x/this.MW*this.mmW,this.mmY+p.y/this.MH*this.mmH);
    this.mmEnemyDots.forEach(d=>d.destroy());this.mmEnemyDots=[];
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      const dot=this.add.circle(this.mmX+ed.sprite.x/this.MW*this.mmW,this.mmY+ed.sprite.y/this.MH*this.mmH,ed.isBoss?4:2,ed.isBoss?0xff0000:0xff6363).setScrollFactor(0).setDepth(22);
      this.mmEnemyDots.push(dot);
    });
  }

  createJoystick(){
    const w=this.scale.width,h=this.scale.height;
    this.joyActive=false;this.joyDx=0;this.joyDy=0;
    const JX=90,JY=h-90;
    this.joyBase=this.add.circle(JX,JY,54,0x000000,0.45).setScrollFactor(0).setDepth(30).setStrokeStyle(2,0xffffff,0.5);
    this.joyKnob=this.add.circle(JX,JY,24,0xffffff,0.7).setScrollFactor(0).setDepth(31);
    this.joyLabel=this.add.text(JX,JY,'移動',{fontSize:'9px',fontFamily:'Courier New',color:'#ffffff88'}).setOrigin(0.5).setScrollFactor(0).setDepth(32);
    this.joyX=JX;this.joyY=JY;this.joyR=30;
    this.input.on('pointerdown',ptr=>{
      if(ptr.x<160&&ptr.y>h-160){
        this.joyActive=true;
        this.joyBase.setPosition(ptr.x,ptr.y);this.joyKnob.setPosition(ptr.x,ptr.y);this.joyLabel.setPosition(ptr.x,ptr.y);
        this.joyX=ptr.x;this.joyY=ptr.y;
      }
    },this);
    this.input.on('pointermove',ptr=>{
      if(!this.joyActive)return;
      const dx=ptr.x-this.joyX,dy=ptr.y-this.joyY,dist=Math.sqrt(dx*dx+dy*dy),maxR=this.joyR;
      const cx=dist>maxR?this.joyX+dx/dist*maxR:ptr.x,cy=dist>maxR?this.joyY+dy/dist*maxR:ptr.y;
      this.joyKnob.setPosition(cx,cy);this.joyLabel.setPosition(cx,cy);
      this.joyDx=dist>8?dx/Math.max(dist,maxR):0;this.joyDy=dist>8?dy/Math.max(dist,maxR):0;
    },this);
    this.input.on('pointerup',()=>{
      this.joyActive=false;this.joyDx=0;this.joyDy=0;
      this.joyBase.setPosition(JX,JY);this.joyKnob.setPosition(JX,JY);this.joyLabel.setPosition(JX,JY);
      this.joyX=JX;this.joyY=JY;
    },this);
  }
  updateJoystick(){
    const pd=this.playerData,p=this.player;
    const kl=this.cursors.left.isDown||this.wasd.A.isDown;
    const kr=this.cursors.right.isDown||this.wasd.D.isDown;
    const ku=this.cursors.up.isDown||this.wasd.W.isDown;
    const kd=this.cursors.down.isDown||this.wasd.S.isDown;
    let vx=kl?-1:kr?1:this.joyDx||0;
    let vy=ku?-1:kd?1:this.joyDy||0;
    const len=Math.sqrt(vx*vx+vy*vy);
    if(len>1){vx/=len;vy/=len;}
    p.setVelocity(vx*pd.spd,vy*pd.spd);
  }
  updateAutoAtk(dt){
    if(!this.target||this.target.dead){
      if(this.sys.game.device.input.touch){
        let closest=null,cd=180;
        this.enemyDataList.forEach(ed=>{if(ed.dead)return;const d=Phaser.Math.Distance.Between(this.player.x,this.player.y,ed.sprite.x,ed.sprite.y);if(d<cd){cd=d;closest=ed;}});
        if(closest)this.target=closest;
      }
      return;
    }
    const t=this.target,p=this.player;
    const dist=Phaser.Math.Distance.Between(p.x,p.y,t.sprite.x,t.sprite.y);
    if(dist<=160){
      this.autoAtkTimer-=dt;
      if(this.autoAtkTimer<=0){this.normalAttack();this.autoAtkTimer=0.55;}
    }else if(!this.joyActive&&!this.cursors.left.isDown&&!this.cursors.right.isDown&&!this.cursors.up.isDown&&!this.cursors.down.isDown&&!this.wasd.A.isDown&&!this.wasd.D.isDown&&!this.wasd.W.isDown&&!this.wasd.S.isDown){
      const ang=Phaser.Math.Angle.Between(p.x,p.y,t.sprite.x,t.sprite.y);
      p.setVelocity(Math.cos(ang)*this.playerData.spd,Math.sin(ang)*this.playerData.spd);
    }
  }

  // ── 敵スポーン ────────────────────────────────
  spawnEnemy(id,x,y){
    const def=ENEMY_DEFS[id]||ENEMY_DEFS.slime;
    const sp=this.enemies.create(x,y,'enemy_'+id).setDisplaySize(def.sz,def.sz).setDepth(4);
    sp.setCollideWorldBounds(true);
    const ed={
      id,sprite:sp,hp:def.hp,mhp:def.hp,atk:def.atk,def:def.def,spd:def.spd,
      exp:def.exp,gold:def.gold,rng:def.rng,acd:def.acd,
      attackTimer:def.acd+Math.random()*def.acd,
      isBoss:!!def.isBoss,dead:false,
      // ⑤ 追加フラグ
      sleeping:true,        // スリープ状態（索敵範囲外）
      wanderTimer:0,        // ふらつきタイマー
      wanderVx:0,wanderVy:0,
      frozen:false,         // 凍結
      frozenTimer:0,
      knockTimer:0,         // ノックバック
      knockVx:0,knockVy:0,
    };
    ed.hpBarBg=this.add.rectangle(x,y-def.sz/2-6,def.sz,5,0x333333).setDepth(5);
    ed.hpBar=this.add.rectangle(x-def.sz/2,y-def.sz/2-6,def.sz,5,0xe74c3c).setOrigin(0,0.5).setDepth(6);
    this.enemyDataList.push(ed);
    if(ed.isBoss){this.bossData=ed;this.updateBossHP(ed);}
    return ed;
  }
  spawnBoss(){
    if(this.bossSpawned)return;
    this.bossSpawned=true;
    this.spawnEnemy(this.cfg.boss.id,this.cfg.boss.x,this.cfg.boss.y);
    SE('boss');startBGM('boss');
    this.cameras.main.shake(500,0.02);this.cameras.main.flash(400,200,0,0);
    const ann=this.add.text(this.scale.width/2,this.scale.height/2-20,'⚠ BOSS 出現 ⚠',{fontSize:'36px',fontFamily:'Courier New',color:'#e74c3c',stroke:'#000',strokeThickness:5}).setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.tweens.add({targets:ann,alpha:0,duration:2000,delay:1000,onComplete:()=>ann.destroy()});
  }

  // ── ヒット処理（③命中/クリティカル対応）─────────
  hitEnemy(ed,dmg,isCrit=false){
    if(ed.dead)return;
    // 凍結中はダメージ1.5倍・解除
    if(ed.frozen){dmg=Math.floor(dmg*1.5);ed.frozen=false;ed.sprite.clearTint();if(ed._iceImg){ed._iceImg.destroy();ed._iceImg=null;}}
    ed.hp-=dmg;
    // ノックバック
    const p=this.player;
    const ang=Phaser.Math.Angle.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
    ed.knockVx=Math.cos(ang)*200;ed.knockVy=Math.sin(ang)*200;ed.knockTimer=0.2;
    if(isCrit){
      SE('crit');
      this.showFloat(ed.sprite.x,ed.sprite.y-ed.sprite.displayHeight/2,'★ CRIT!! '+dmg,'#ff4400');
      // 衝撃波エフェクト
      const sw=this.add.image(ed.sprite.x,ed.sprite.y,'fx_shockwave').setDisplaySize(20,20).setDepth(20).setAlpha(0.8);
      this.tweens.add({targets:sw,alpha:0,scaleX:4,scaleY:4,duration:300,onComplete:()=>sw.destroy()});
      this.cameras.main.flash(80,255,100,0);
    }else{
      SE('hit');
      this.showFloat(ed.sprite.x,ed.sprite.y-ed.sprite.displayHeight/2,'-'+dmg,'#ffffff');
    }
    const pct=Math.max(0,ed.hp/ed.mhp);
    ed.hpBar.setSize(ed.hpBarBg.width*pct,5).setFillStyle(pct>0.5?0x2ecc71:pct>0.25?0xf39c12:0xe74c3c);
    this.tweens.add({targets:ed.sprite,alpha:0.3,duration:80,yoyo:true});
    if(ed.isBoss)this.updateBossHP(ed);
    if(ed.hp<=0)this.killEnemy(ed);
  }

  killEnemy(ed){
    ed.dead=true;
    const pd=this.playerData;
    pd.exp+=ed.exp;pd.gold+=ed.gold;pd.kills++;
    if(!ed.isBoss)this.killCount++;
    SE('exp');
    this.showFloat(ed.sprite.x,ed.sprite.y-40,'+'+ed.exp+'EXP','#f39c12');
    this.showFloat(ed.sprite.x,ed.sprite.y-60,'+'+ed.gold+'G','#ffd700');
    // ジョブEXP付与（通常EXPの60%）
    this.addJobExp(Math.floor(ed.exp*0.6));
    // ドロップ（§11準拠）
    if(ed.isBoss){
      // ボス確定ドロップ：HP×1 + MP×2
      const d1=this.drops.create(ed.sprite.x-20,ed.sprite.y,'drop_hp_potion').setDisplaySize(24,24);d1.setData('type','hp');d1.refreshBody();
      const d2=this.drops.create(ed.sprite.x,   ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d2.setData('type','mp');d2.refreshBody();
      const d3=this.drops.create(ed.sprite.x+20,ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d3.setData('type','mp');d3.refreshBody();
    }else{
      if(Math.random()<0.1){const d=this.drops.create(ed.sprite.x,ed.sprite.y,'drop_hp_potion').setDisplaySize(24,24);d.setData('type','hp');d.refreshBody();}
      if(Math.random()<0.1){const d=this.drops.create(ed.sprite.x,ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d.setData('type','mp');d.refreshBody();}
    }
    this.tweens.add({targets:ed.sprite,alpha:0,duration:300,onComplete:()=>{ed.sprite.destroy();ed.hpBarBg.destroy();ed.hpBar.destroy();}});
    if(this.target===ed)this.target=null;
    if(ed.isBoss){
      this.bossData=null;this.updateBossHP(null);startBGM(this.cfg.bgmKey);
      this.openNextPortal();
      this.cameras.main.flash(600,255,215,0);
      const ann=this.add.text(this.scale.width/2,this.scale.height/2-40,'🏆 BOSS DEFEATED!',{fontSize:'32px',fontFamily:'Courier New',color:'#ffd700',stroke:'#000',strokeThickness:5}).setOrigin(0.5).setScrollFactor(0).setDepth(50);
      this.tweens.add({targets:ann,alpha:0,duration:2500,delay:1500,onComplete:()=>ann.destroy()});
    }
    this.checkLevelUp();this.updateHUD();
    if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
    if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
  }

  openNextPortal(){
    if(!this.portalNext||this.portalNext.open)return;
    this.portalNext.open=true;
    if(this.portalNextImg)this.portalNextImg.setAlpha(1);
    if(this.portalNextTxt)this.portalNextTxt.setText(this.cfg.portalToLabel+'\n[近づいて移動]').setStyle({color:'#00e5ff',fontSize:'10px',fontFamily:'Courier New',align:'center'});
  }

  checkLevelUp(){
    const pd=this.playerData;
    while(pd.exp>=pd.expNext){
      pd.exp-=pd.expNext;pd.lv++;pd.expNext=Math.floor(pd.expNext*1.4);
      pd.mhp+=8;pd.hp=pd.mhp;pd.atk+=1;pd.def+=1;pd.msp+=5;pd.sp=pd.msp;
      pd.statPts=(pd.statPts||0)+3;
      pd.pendingLvUp=(pd.pendingLvUp||0)+1;
      SE('levelup');this.cameras.main.flash(300,255,215,0);
      this.showFloat(this.player.x,this.player.y-80,'✨ LEVEL UP! Lv'+pd.lv,'#ffd700');
    }
  }
  // ⑦ ジョブEXP処理
  addJobExp(amount){
    const pd=this.playerData;
    pd.jobExp=(pd.jobExp||0)+amount;
    while(pd.jobExp>=(pd.jobExpNext||80)){
      pd.jobExp-=(pd.jobExpNext||80);
      pd.jobLv=(pd.jobLv||1)+1;
      pd.jobExpNext=Math.floor((pd.jobExpNext||80)*1.5);
      pd.jobPts=(pd.jobPts||0)+1;
      this.showFloat(this.player.x,this.player.y-100,'⚡ JOB LV UP! JLv'+pd.jobLv,'#00e5ff');
      this.showFloat(this.player.x,this.player.y-120,'ジョブポイント+1（SK画面で習得）','#00e5ff');
    }
  }

  usePotion(type){
    const pd=this.playerData;
    if(type==='hp'&&(pd.potHP||0)>0){pd.potHP--;pd.hp=Math.min(pd.mhp,pd.hp+50);SE('potion');this.showFloat(this.player.x,this.player.y-50,'💊 HP+50','#2ecc71');}
    else if(type==='mp'&&(pd.potMP||0)>0){pd.potMP--;pd.sp=Math.min(pd.msp,pd.sp+50);SE('potion');this.showFloat(this.player.x,this.player.y-50,'💧 SP+50','#3498db');}
    this.updateHUD();
    if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
    if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
  }

  showFloat(x,y,txt,col){
    const t=this.add.text(x,y,txt,{fontSize:'14px',fontFamily:'Courier New',color:col,stroke:'#000000',strokeThickness:3}).setOrigin(0.5).setDepth(30);
    this.tweens.add({targets:t,y:y-50,alpha:0,duration:900,onComplete:()=>t.destroy()});
  }

  gameOver(){
    this.physics.pause();
    if(this.bgmTimer)this.bgmTimer.remove();bgmKey=null;
    const w=this.scale.width,h=this.scale.height;
    this.add.rectangle(w/2,h/2,440,200,0x000000,0.92).setScrollFactor(0).setDepth(40);
    this.add.text(w/2,h/2-50,'✖ GAME OVER',{fontSize:'32px',fontFamily:'Courier New',color:'#e74c3c',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(w/2,h/2,'Lv'+this.playerData.lv+'  討伐'+this.playerData.kills+'体  Gold'+this.playerData.gold+'G',{fontSize:'13px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(w/2,h/2+40,'クリック or [R] で町に復活',{fontSize:'15px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    const revive=()=>{
      const pd=this.playerData;
      pd.hp=1; // §17: HP=1で復活
      if(this.bgmTimer)this.bgmTimer.remove();
      this.scene.start('Town',{playerData:pd});
    };
    this.input.keyboard.once('keydown-R',revive);
    this.time.delayedCall(500,()=>this.input.once('pointerdown',revive));
  }

  update(time,delta){
    const dt=delta/1000,pd=this.playerData,p=this.player;
    this.updateJoystick();
    this.updateAutoAtk(dt);
    if(Phaser.Input.Keyboard.JustDown(this.spaceKey))this.normalAttack();
    if(this.atkCooldown>0)this.atkCooldown-=dt;
    // スキルCD（createSkillButtons内のoverlayで処理）
    if(!this.bossSpawned&&this.killCount>=this.cfg.bossThreshold)this.spawnBoss();
    // 弾の距離チェック（maxDist超えたら消去）
    this.bullets.getChildren().forEach(b=>{
      if(b.getData('dead'))return;
      const vx=b.getData('vx')||0,vy=b.getData('vy')||0;
      const cur=b.getData('dist')||0;
      const nd=cur+Math.sqrt(vx*vx+vy*vy)*dt;
      b.setData('dist',nd);
      if(nd>b.getData('maxDist'))b.destroy();
    });
    // ⑤ 敵AI（スリープ・凍結・ノックバック対応）
    const SLEEP_RANGE=280, WAKE_RANGE=240;
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      const sp=ed.sprite;
      const dist=Phaser.Math.Distance.Between(p.x,p.y,sp.x,sp.y);

      // 凍結中
      if(ed.frozen){
        ed.frozenTimer-=dt;
        if(ed.frozenTimer<=0){
          ed.frozen=false;sp.clearTint();
          if(ed._iceImg){ed._iceImg.destroy();ed._iceImg=null;}
        }
        sp.setVelocity(0,0);
        ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
        ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
        return;
      }

      // ノックバック中
      if(ed.knockTimer>0){
        ed.knockTimer-=dt;
        sp.setVelocity(ed.knockVx,ed.knockVy);
        ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
        ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
        return;
      }

      // スリープ判定（索敵範囲外）
      if(dist>SLEEP_RANGE){
        ed.sleeping=true;
        // ふらつき
        ed.wanderTimer-=dt;
        if(ed.wanderTimer<=0){
          ed.wanderTimer=Phaser.Math.FloatBetween(1.5,3.5);
          const ang=Math.random()*Math.PI*2;
          ed.wanderVx=Math.cos(ang)*ed.spd*0.25;
          ed.wanderVy=Math.sin(ang)*ed.spd*0.25;
        }
        sp.setVelocity(ed.wanderVx,ed.wanderVy);
      }else{
        // アクティブ：プレイヤーへ追跡
        ed.sleeping=false;
        const ang=Phaser.Math.Angle.Between(sp.x,sp.y,p.x,p.y);
        sp.setVelocity(Math.cos(ang)*ed.spd,Math.sin(ang)*ed.spd);
        // 攻撃
        ed.attackTimer-=dt;
        if(ed.attackTimer<=0&&dist<ed.rng){
          ed.attackTimer=ed.acd;
          // パリィ判定
          if(pd._parry){
            this.showFloat(p.x,p.y-40,'PARRY!','#ffd700');
            pd._parry=false;
          }else{
            const dmg=Math.max(1,ed.atk-(pd.def||0)+Phaser.Math.Between(0,3));
            pd.hp=Math.max(0,pd.hp-dmg);
            this.showFloat(p.x,p.y-40,'-'+dmg,'#e74c3c');this.updateHUD();
            this.cameras.main.shake(120,0.004);
            if(pd.hp<=0){this.gameOver();return;}
          }
        }
      }

      ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
      ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
      if(ed._iceImg)ed._iceImg.setPosition(sp.x,sp.y);
    });

    // ⑤ リスポーン処理（残存50%以下で復活）
    if(!this._respawnCd)this._respawnCd=0;
    this._respawnCd-=dt;
    if(this._respawnCd<=0&&!this.bossSpawned){
      this._respawnCd=8;
      const alive=this.enemyDataList.filter(e=>!e.dead&&!e.isBoss).length;
      const total=this.cfg.enemies.length;
      if(alive<Math.floor(total*0.5)){
        // ランダムに1体復活
        const dead=this.enemyDataList.filter(e=>e.dead&&!e.isBoss);
        if(dead.length>0){
          const pick=dead[Math.floor(Math.random()*dead.length)];
          const ex=Phaser.Math.Between(100,this.MW-100),ey=Phaser.Math.Between(100,this.MH-100);
          const newEd=this.spawnEnemy(pick.id,ex,ey);
          // リスポーンフラッシュ
          this.tweens.add({targets:newEd.sprite,alpha:0.2,duration:200,yoyo:true,repeat:2});
        }
      }
    }

    // スキルCD更新
    if(this.skillCDOverlays){
      this.skillCDOverlays.forEach(({key,ov,ct})=>{
        if((this[key]||0)>0){
          this[key]-=dt;
          ov.setFillStyle(0x000000,0.55);
          ct.setText(Math.ceil(this[key])+'s');
        }else{ov.setFillStyle(0x000000,0);ct.setText('');}
      });
    }
    // ポータル
    if(Phaser.Math.Distance.Between(p.x,p.y,80,this.MH/2)<60){
      if(this.bgmTimer)this.bgmTimer.remove();
      if(this.cfg.portalBack===0)this.scene.start('Town',{playerData:pd});
      else this.scene.start('Game',{playerData:pd,stage:this.cfg.portalBack});
    }
    if(this.portalNext&&this.portalNext.open&&Phaser.Math.Distance.Between(p.x,p.y,this.MW-80,this.MH/2)<60){
      if(this.bgmTimer)this.bgmTimer.remove();
      if(!this.cfg.portalTo)this.scene.start('GameClear',{playerData:pd});
      else this.scene.start('Game',{playerData:pd,stage:this.portalNext.to});
    }
    if(Math.floor(time/100)!==Math.floor((time-delta)/100))this.updateMinimap();
  }
}

// ============================================================
//  SkillTree Scene（ジョブスキルツリー）④
// ============================================================
// ============================================================
//  起動
// ============================================================
new Phaser.Game({
  type:Phaser.AUTO,
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:800,height:600},
  backgroundColor:'#000000',
  physics:{default:'arcade',arcade:{gravity:{y:0},debug:false}},
  scene:[BootScene,TitleScene,ClassSelectScene,TownScene,LevelUpScene,MenuScene,GameScene,GameClearScene]
});