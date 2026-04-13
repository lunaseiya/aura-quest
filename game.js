// ============================================================
//  AURA QUEST - Phaser 3  game.js
//  STEP7: ①ステータス割り振り ②職業別通常攻撃 ③命中/クリティカル
// ============================================================
const BASE='https://lunaseiya.github.io/aura-quest/';
const TILE=32;

// ============================================================
//  BGM / SE
// ============================================================
let audioCtx=null,muted=false;

function getAC(){
  if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}};
  if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();
  return audioCtx;
}

// ── MP3 BGMプレイヤー ────────────────────────────
let _bgmAudio=null,_bgmKey=null;

// BGMキーとファイルのマッピング
const BGM_FILES={
  st1: BASE+'bgm/rpg_bgm_brass.mp3',
};

function startBGM(key){
  if(_bgmKey===key)return;
  if(_bgmAudio){_bgmAudio.pause();_bgmAudio.currentTime=0;_bgmAudio=null;}
  _bgmKey=key;
  if(muted)return; // ミュート中は再生しない
  const file=BGM_FILES[key];
  if(!file)return;
  const audio=new Audio(file);
  audio.loop=true;
  audio.volume=0.5;
  audio.play().catch(()=>{});
  _bgmAudio=audio;
}

function updateBGM(){
  getAC();
}

function stopBGM(){
  if(_bgmAudio){_bgmAudio.pause();_bgmAudio.currentTime=0;_bgmAudio=null;}
  _bgmKey=null;
}

function setMute(val){
  muted=val;
  if(muted){
    // ミュートON: BGMを止めてSEも無効に
    if(_bgmAudio){_bgmAudio.pause();}
    if(_seMasterGain)_seMasterGain.gain.value=0;
  }else{
    // ミュートOFF: BGMを再開
    if(_bgmAudio){_bgmAudio.play().catch(()=>{});}
    else if(_bgmKey){startBGM(_bgmKey);}
    if(_seMasterGain)_seMasterGain.gain.value=0.4;
  }
  // 設定を保存
  try{localStorage.setItem('aq_muted',val?'1':'0');}catch(e){}
}

// SEマスターゲイン（1つだけ作って使い回す→音量加算を防ぐ）
let _seMasterGain=null;
function getSEMaster(){
  const ac=getAC();if(!ac)return null;
  if(!_seMasterGain){
    _seMasterGain=ac.createGain();
    _seMasterGain.gain.value=0.4; // SE全体の音量上限
    _seMasterGain.connect(ac.destination);
  }
  return _seMasterGain;
}

function SE(type){
  if(muted)return;
  const ac=getAC();if(!ac)return;
  const mg=getSEMaster();if(!mg)return;
  const now=ac.currentTime;
  const C={
    hit:    [[440,'square',0.18,0.10]],
    crit:   [[880,'square',0.22,0.08],[660,'sawtooth',0.18,0.15],[1047,'sine',0.15,0.20]],
    miss:   [[220,'sine',0.10,0.10]],
    exp:    [[880,'sine',0.14,0.15],[1047,'sine',0.14,0.15]],
    levelup:[[523,'sine',0.18,0.10],[659,'sine',0.18,0.10],[784,'sine',0.18,0.10],[1047,'sine',0.22,0.40]],
    boss:   [[110,'sawtooth',0.22,0.50],[220,'sawtooth',0.18,0.30]],
    clear:  [[523,'sine',0.18,0.10],[659,'sine',0.18,0.10],[784,'sine',0.18,0.10],[880,'sine',0.18,0.10],[1047,'sine',0.25,0.50]],
    potion: [[660,'sine',0.16,0.20]],
    skill:  [[330,'sawtooth',0.20,0.15],[440,'sawtooth',0.20,0.15]],
    arrow:  [[880,'sine',0.12,0.08],[660,'sine',0.10,0.06]],
    magic:  [[523,'sine',0.16,0.20],[784,'sine',0.14,0.25],[1047,'sine',0.12,0.30]],
    explode:[[110,'sawtooth',0.22,0.30],[220,'square',0.18,0.20]],
  };
  const cfg=C[type];if(!cfg)return;
  cfg.forEach(([f,w,v,d],i)=>{try{
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=w;o.frequency.value=f;
    o.connect(g);
    g.connect(mg); // destinationではなくマスターGainに接続
    const t=now+i*0.08;
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(v,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.001,t+d);
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
    ['warrior','mage','archer'].forEach(k=>this.load.image('player_'+k,BASE+'players/'+k+'.png'));
    // bomber はスプライトシート
    this.load.spritesheet('player_bomber', BASE+'players/final_sheet_cc.png', {frameWidth:64,frameHeight:64});
    ['bat','boss1','boss2','boss3','dragon','goblin','sandworm','scorpion','skeleton','slime','troll','wolf'].forEach(k=>this.load.image('enemy_'+k,BASE+'enemies/'+k+'.png'));
    ['bridge','cliff','cobble','dark_forest','flower','grass','lava','oasis_grass','sand_beach','sand_desert','sea','town_path','town_wall','volcanic','water'].forEach(k=>this.load.image('tile_'+k,BASE+'tiles/'+k+'.png'));
    ['barrel','desert_rock','lava_rock','palm','rock','tree'].forEach(k=>this.load.image('obj_'+k,BASE+'objects/'+k+'.png'));
    ['portal_st1','portal_st2','portal_st3','portal_st4','portal_town'].forEach(k=>this.load.image(k,BASE+'portals/'+k+'.png'));
    ['arrow','bigbomb','bomb','fireball','hyperbomb','vortexball'].forEach(k=>this.load.image('proj_'+k,BASE+'projectiles/'+k+'.png'));
    ['explosion','freeze','shockwave','slash'].forEach(k=>this.load.image('fx_'+k,BASE+'effects/'+k+'.png'));
    ['hp_potion','mp_potion'].forEach(k=>this.load.image('drop_'+k,BASE+'drops/'+k+'.png'));
  }
  create(){
    // ボマー スプライトアニメーション定義
    // グローバルアニメとして登録（全シーンから参照可能）
    const BA=[
      {key:'bomber_front_idle',frames:[0],    rate:2, rep:-1},
      {key:'bomber_front_walk',frames:[1,2],  rate:8, rep:-1},
      {key:'bomber_front_atk', frames:[3,4],  rate:10,rep:0 },
      {key:'bomber_back_idle', frames:[5],    rate:2, rep:-1},
      {key:'bomber_back_walk', frames:[6,7],  rate:8, rep:-1},
      {key:'bomber_back_atk',  frames:[8,9],  rate:10,rep:0 },
      {key:'bomber_side_idle', frames:[10],   rate:2, rep:-1},
      {key:'bomber_side_walk', frames:[11,12],rate:8, rep:-1},
      {key:'bomber_side_atk',  frames:[13,14],rate:10,rep:0 },
    ];
    BA.forEach(a=>{
      // 既に登録済みなら skip（シーン再起動時の二重登録防止）
      if(this.anims.exists(a.key)) return;
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_bomber',frame:f})),
        frameRate:a.rate,
        repeat:a.rep,
      });
    });
    this.scene.start('Title');
  }
}

// ============================================================
//  TitleScene
// ============================================================
class TitleScene extends Phaser.Scene{
  constructor(){super('Title')}
  create(){
    const w=this.scale.width,h=this.scale.height;
    // ローカルストレージからミュート設定を復元
    try{const v=localStorage.getItem('aq_muted');if(v==='1')muted=true;}catch(e){}
    // BGM確認ダイアログ（初回 or ミュートでない場合）
    if(!muted){
      const overlay=this.add.rectangle(w/2,h/2,w,h,0x000000,0.92).setOrigin(0.5).setDepth(100);
      const title=this.add.text(w/2,h/2-60,'🎵 BGMを流しますか？',{fontSize:'20px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setDepth(101);
      const sub=this.add.text(w/2,h/2-24,'（マナーモード中は端末の音量をOFFにしてください）',{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa',wordWrap:{width:500}}).setOrigin(0.5).setDepth(101);
      const btnY=this.add.rectangle(w/2-80,h/2+30,160,40,0x2ecc71,0.3).setStrokeStyle(2,0x2ecc71).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2-80,h/2+30,'🔊 BGMあり',{fontSize:'15px',fontFamily:'Courier New',color:'#2ecc71'}).setOrigin(0.5).setDepth(102);
      const btnN=this.add.rectangle(w/2+80,h/2+30,160,40,0xe74c3c,0.3).setStrokeStyle(2,0xe74c3c).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2+80,h/2+30,'🔇 BGMなし',{fontSize:'15px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5).setDepth(102);
      const dismiss=()=>{overlay.destroy();title.destroy();sub.destroy();btnY.destroy();btnN.destroy();startBGM('title');};
      btnY.on('pointerdown',()=>{setMute(false);dismiss();});
      btnN.on('pointerdown',()=>{setMute(true);[overlay,title,sub,btnY,btnN].forEach(o=>o.destroy());});
    }else{
      startBGM('title');
    }
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
    const go=()=>{getAC();this.scene.start('ClassSelect')};
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
    // ローカルストレージからミュート設定を復元
    try{const v=localStorage.getItem('aq_muted');if(v==='1')muted=true;}catch(e){}
    // BGM確認ダイアログ（初回 or ミュートでない場合）
    if(!muted){
      const overlay=this.add.rectangle(w/2,h/2,w,h,0x000000,0.92).setOrigin(0.5).setDepth(100);
      const title=this.add.text(w/2,h/2-60,'🎵 BGMを流しますか？',{fontSize:'20px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setDepth(101);
      const sub=this.add.text(w/2,h/2-24,'（マナーモード中は端末の音量をOFFにしてください）',{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa',wordWrap:{width:500}}).setOrigin(0.5).setDepth(101);
      const btnY=this.add.rectangle(w/2-80,h/2+30,160,40,0x2ecc71,0.3).setStrokeStyle(2,0x2ecc71).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2-80,h/2+30,'🔊 BGMあり',{fontSize:'15px',fontFamily:'Courier New',color:'#2ecc71'}).setOrigin(0.5).setDepth(102);
      const btnN=this.add.rectangle(w/2+80,h/2+30,160,40,0xe74c3c,0.3).setStrokeStyle(2,0xe74c3c).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2+80,h/2+30,'🔇 BGMなし',{fontSize:'15px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5).setDepth(102);
      const dismiss=()=>{overlay.destroy();title.destroy();sub.destroy();btnY.destroy();btnN.destroy();startBGM('title');};
      btnY.on('pointerdown',()=>{setMute(false);dismiss();});
      btnN.on('pointerdown',()=>{setMute(true);[overlay,title,sub,btnY,btnN].forEach(o=>o.destroy());});
    }else{
      startBGM('title');
    }
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
      // bomberはspritesheet、他はimage
      if(cls.key==='bomber'){
        this.add.sprite(cx-90,cy,'player_bomber').setFrame(0).setDisplaySize(64,80);
      }else{
        this.add.image(cx-90,cy,'player_'+cls.key).setDisplaySize(64,80);
      }
      this.add.text(cx+10,cy-32,cls.name,{fontSize:'20px',fontFamily:'Courier New',color:'#'+cls.col.toString(16).padStart(6,'0'),stroke:'#000',strokeThickness:2});
      this.add.text(cx+10,cy-4,cls.desc,{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa',lineSpacing:4});
      card.on('pointerover',()=>{card.setFillStyle(cls.col,0.35);this.tweens.add({targets:card,scaleX:1.03,scaleY:1.03,duration:100})});
      card.on('pointerout', ()=>{card.setFillStyle(cls.col,0.12);this.tweens.add({targets:card,scaleX:1,scaleY:1,duration:100})});
      card.on('pointerdown',()=>{this.scene.start('Game',{playerData:makePlayerData(cls.key),stage:0})});
    });
    const muteBtn=this.add.text(w-10,10,'🔊',{fontSize:'20px'}).setOrigin(1,0).setInteractive({useHandCursor:true});
    muteBtn.on('pointerdown',()=>{muted=!muted;muteBtn.setText(muted?'🔇':'🔊')});
  }
}

// ============================================================
//  TownScene
// ============================================================
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

class GameClearScene extends Phaser.Scene{
  constructor(){super('GameClear')}
  init(data){this.playerData=data.playerData}
  create(){
    const pd=this.playerData,w=this.scale.width,h=this.scale.height;
    startBGM('clear');
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
    const go=()=>{stopBGM();this.scene.start('Title')};
    btn.on('pointerdown',go);
    this.time.delayedCall(2500,()=>this.input.keyboard.once('keydown',go));
  }
}

// ============================================================
//  ステージ設定
// ============================================================
const STAGE_CONFIG={
  0:{name:'TOWN 町',bgmKey:'town',
    tiles:['tile_cobble','tile_town_wall','tile_town_path'],tileWeights:[80,10,10],
    mapW:1200,mapH:800,
    objects:[],objPos:[],
    enemies:[],boss:null,bossThreshold:999,
    portalTo:1,portalToLabel:'🌿 ST.1へ出発',portalToKey:'portal_st1',
    portalBack:null,portalBackLabel:'',portalBackKey:'portal_town',
    buildings:[
      {x:100,y:80, w:180,h:130,label:'🏨 宿屋',   type:'inn'},
      {x:400,y:80, w:200,h:140,label:'🏪 ショップ',type:'shop'},
      {x:750,y:80, w:180,h:130,label:'⚔ ギルド',  type:'guild'},
      {x:150,y:400,w:160,h:120,label:'🔨 鍛冶屋',  type:'blacksmith'},
      {x:600,y:380,w:200,h:150,label:'🔮 魔法店',  type:'magic'},
    ],
  },
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
    this.stage=data.stage!==undefined?data.stage:1;
    this.killCount=0;
    this.bossSpawned=false;
  }
  create(){
    const cfg=STAGE_CONFIG[this.stage]||STAGE_CONFIG[1];
    const MW=cfg.mapW||1200, MH=cfg.mapH||1000;
    this.MW=MW;this.MH=MH;
    this.cfg=cfg;
    // ステージ進入時HP/SP全回復 ③要件§10
    const pd=this.playerData;
    pd.hp=pd.mhp; pd.sp=pd.msp;

    startBGM(cfg.bgmKey);
    this.cameras.main.setBounds(0,0,MW,MH);
    this.physics.world.setBounds(0,0,MW,MH);
    // タイル
    const cols=Math.ceil(MW/TILE),rows=Math.ceil(MH/TILE);
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      let key;
      if(this.stage===0){
        if(c<3||c>cols-4||r<3||r>rows-4) key='tile_town_wall';
        else if(r>=rows-5) key='tile_town_path';
        else key='tile_cobble';
      }else{
        const n=(c*31+r*17)%100;let acc=0;key=cfg.tiles[0];
        for(let i=0;i<cfg.tileWeights.length;i++){acc+=cfg.tileWeights[i];if(n<acc){key=cfg.tiles[i];break;}}
      }
      this.add.image(c*TILE+16,r*TILE+16,key).setDisplaySize(TILE,TILE);
    }
    // 障害物
    this.obstacles=this.physics.add.staticGroup();
    if(cfg.objects&&cfg.objects[0]){
      cfg.objPos.forEach(([x,y])=>{const o=this.obstacles.create(x,y,cfg.objects[0]).setDisplaySize(32,40);o.refreshBody();});
    }
    // 町の建物 (stage:0)
    this.buildings=[];
    if(this.stage===0&&cfg.buildings){
      const BCOLS={inn:0x5c3317,shop:0x1a4a8a,guild:0x4a1a1a,blacksmith:0x2a2a2a,magic:0x1a0a3a};
      cfg.buildings.forEach(b=>{
        this.buildings.push(b);
        this.add.rectangle(b.x+b.w/2,b.y+b.h/2,b.w,b.h,BCOLS[b.type]||0x333333).setStrokeStyle(2,0x888888);
        this.add.text(b.x+b.w/2,b.y+b.h-16,b.label,{fontSize:'12px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);
        const hit=this.add.rectangle(b.x+b.w/2,b.y+b.h/2,b.w+40,b.h+40,0x000000,0).setInteractive();
        hit.on('pointerdown',()=>this.openBuilding(b));
      });
    }
    // ポータル（戻る）
    if(cfg.portalBack!==null&&cfg.portalBack!==undefined){
      this.add.image(80,MH/2,'portal_'+cfg.portalBackKey.replace('portal_','')).setDisplaySize(80,64);
      this.add.text(80,MH/2+44,cfg.portalBackLabel,{fontSize:'10px',fontFamily:'Courier New',color:'#ffd700',align:'center'}).setOrigin(0.5);
    }
    // ポータル（次）
    this.portalNext=null;this.portalNextImg=null;this.portalNextTxt=null;
    if(cfg.portalTo){
      this.portalNextImg=this.add.image(MW-80,MH/2,cfg.portalToKey).setDisplaySize(80,64).setAlpha(0.25);
      this.portalNextTxt=this.add.text(MW-80,MH/2+44,cfg.portalToLabel+'\n(ボス撃破で開放)',{fontSize:'9px',fontFamily:'Courier New',color:'#666666',align:'center'}).setOrigin(0.5);
      this.portalNext={x:MW-80,y:MH/2,to:cfg.portalTo,open:false};
    }
    // プレイヤー
    this.player=this.physics.add.sprite(200,MH/2,'player_'+pd.cls).setDisplaySize(64,64).setCollideWorldBounds(true).setDepth(5);
    this._bomberFacing='front';
    this._bomberFlip=false;
    // ボマーのアニメ初期再生（アニメ存在確認付き）
    if(pd.cls==='bomber'){
      if(this.anims.exists('bomber_front_idle')){
        this.player.play('bomber_front_idle');
        console.log('[Bomber] アニメ開始: bomber_front_idle');
      }else{
        console.warn('[Bomber] アニメが見つかりません。再定義します...');
        this._registerBomberAnims();
        this.player.play('bomber_front_idle');
      }
    }
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
    this.input.keyboard.on('keydown-E',()=>this.useSkill(2)); // スキル2
    this.input.keyboard.on('keydown-R',()=>this.useSkill(3));
    // タッチ/クリック
    // タップはターゲット選択のみ（攻撃はボタンで手動）
    this.input.on('pointerdown',ptr=>{
      const w=this.scale.width,h=this.scale.height;
      // ジョイスティック領域（左下）
      if(ptr.x<w*0.3&&ptr.y>h*0.35)return;
      // ボタン領域（右下・下部全体）は完全除外
      if(ptr.y>h*0.65)return;
      // HUD領域（左上）
      if(ptr.x<290&&ptr.y<120)return;
      // ゲームオブジェクト（interactive）のタップはphaser側で処理済みのためスキップ
      if(ptr.downElement&&ptr.downElement!==this.game.canvas)return;
      // ターゲット選択のみ（攻撃はボタンで手動）
      const wx=ptr.worldX,wy=ptr.worldY;
      let closest=null,cd=120;
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(wx,wy,ed.sprite.x,ed.sprite.y);
        if(d<cd){cd=d;closest=ed;}
      });
      if(closest) this.target=closest;
    });
    this.atkCooldown=0.5;this.skillCooldown=0;this.target=null; // 初期CDを0.5秒に設定（誤発防止）
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
      const dist=60;
      const tx=p.x+Math.cos(ang)*dist, ty=p.y+Math.sin(ang)*dist;
      this.throwBomb(p.x,p.y,tx,ty,{
        dmg:Math.max(1,pd.atk*3+Phaser.Math.Between(0,pd.atk*2)),
        isCrit:Math.random()*100<calcCrit(pd),
        radius:55,
      });
      SE('explode');
      this.atkCooldown=0.9;
      // 攻撃アニメ
      this.playBomberAtk();
    }
  }

  getFacingAngle(){
    // ジョイスティック入力があればその向き（スマホ優先）
    if(this.joyDx!==0||this.joyDy!==0){
      return Math.atan2(this.joyDy,this.joyDx);
    }
    // キーボード入力
    const kl=this.cursors.left.isDown||this.wasd.A.isDown;
    const kr=this.cursors.right.isDown||this.wasd.D.isDown;
    const ku=this.cursors.up.isDown||this.wasd.W.isDown;
    const kd=this.cursors.down.isDown||this.wasd.S.isDown;
    const vx=kl?-1:kr?1:0;
    const vy=ku?-1:kd?1:0;
    if(vx!==0||vy!==0) return Math.atan2(vy,vx);
    // どちらもなければ最後に動いた向き（_lastAngle）
    return this._lastAngle||0;
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
      if(num===1){ // クラスター爆弾（sk1）: 6方向 投擲60px 半径40px
        const dirs=6;
        for(let i=0;i<dirs;i++){
          const a=i/dirs*Math.PI*2;
          const tx=p.x+Math.cos(a)*60,ty=p.y+Math.sin(a)*60;
          this.throwBomb(p.x,p.y,tx,ty,{
            dmg:Math.max(1,pd.atk*(0.8+pd.sk1*0.15)),
            isCrit:Math.random()*100<calcCrit(pd),
            radius:40,
          });
        }
        this.showFloat(p.x,p.y-60,'💥 クラスター！','#f39c12');
        this.playBomberAtk();
      }else if(num===2){ // 大爆弾（sk2）: 投擲100px 半径55×(1+Lv×0.12)
        const ang=this.getFacingAngle();
        const radius=55*(1+pd.sk2*0.12);
        const tx=p.x+Math.cos(ang)*100,ty=p.y+Math.sin(ang)*100;
        this.throwBomb(p.x,p.y,tx,ty,{
          dmg:Math.max(1,pd.atk*(1.5+pd.sk2*0.35)),
          isCrit:Math.random()*100<calcCrit(pd),
          radius,
        });
        this.showFloat(p.x,p.y-60,'💣 大爆弾！','#f39c12');
        this.playBomberAtk();
      }else if(num===3){ // ハイパーボム（sk3）: 投擲100px 半径100×(1+Lv×0.2)
        const ang=this.getFacingAngle();
        const radius=100*(1+pd.sk3*0.2);
        const tx=p.x+Math.cos(ang)*100,ty=p.y+Math.sin(ang)*100;
        this.throwBomb(p.x,p.y,tx,ty,{
          dmg:Math.max(1,pd.atk*(3+pd.sk3*0.8)),
          isCrit:Math.random()*100<calcCrit(pd),
          radius,
        });
        this.showFloat(p.x,p.y-60,'💣 ハイパーボム！','#ff6600');
        this.cameras.main.shake(500,0.025);
        this.playBomberAtk();
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
    // バー幅: 160px、ラベル幅: 24px、合計約190px
    const BW=160, LX=24, BX=LX+4;
    const BG_W=BX+BW+4;
    // 背景（コンパクト: 4バー分 = 約76px高さ）
    this.add.rectangle(0,0,BG_W,80,0x000000,0.75).setOrigin(0).setScrollFactor(0).setDepth(10);
    // HP
    this.add.rectangle(BX,8,BW,11,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudHPBar=this.add.rectangle(BX,8,BW*(pd.hp/pd.mhp),11,0x2ecc71).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,7,'HP',{fontSize:'10px',fontFamily:'Courier New',color:'#2ecc71'}).setScrollFactor(0).setDepth(12);
    // SP
    this.add.rectangle(BX,24,BW,11,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudSPBar=this.add.rectangle(BX,24,BW*(pd.sp/pd.msp),11,0x3498db).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,23,'SP',{fontSize:'10px',fontFamily:'Courier New',color:'#3498db'}).setScrollFactor(0).setDepth(12);
    // EXP（経験値）
    this.add.rectangle(BX,40,BW,8,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudEXPBar=this.add.rectangle(BX,40,0,8,0xf39c12).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,39,'EX',{fontSize:'10px',fontFamily:'Courier New',color:'#f39c12'}).setScrollFactor(0).setDepth(12);
    // JOB EXP
    this.add.rectangle(BX,53,BW,8,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudJEXPBar=this.add.rectangle(BX,53,0,8,0x00e5ff).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,52,'JB',{fontSize:'10px',fontFamily:'Courier New',color:'#00e5ff'}).setScrollFactor(0).setDepth(12);
    // Lv表示（小さく）
    this.hudLvTxt=this.add.text(2,65,'',{fontSize:'9px',fontFamily:'Courier New',color:'#aaaaaa'}).setScrollFactor(0).setDepth(12);
    // ダミー変数（updateHUDで参照するため）
    this.hudHPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudSPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudEXPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudJEXPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudInfo=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudSub=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudSub2=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.killTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    // ステージバッジ（ミニマップ左）
    this.add.rectangle(w-124,0,80,22,0x000000,0.7).setOrigin(1,0).setScrollFactor(0).setDepth(10);
    this.add.text(w-132,4,'ST.'+this.stage,{fontSize:'14px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(1,0).setScrollFactor(0).setDepth(12);
    // ボスHPバー
    this.bossHPBg=this.add.rectangle(w/2,h-44,w*0.6+8,20,0x000000,0.8).setScrollFactor(0).setDepth(10).setVisible(false);
    this.bossHPBar=this.add.rectangle(w/2-w*0.3,h-44,w*0.6,16,0xe74c3c).setOrigin(0,0.5).setScrollFactor(0).setDepth(11).setVisible(false);
    this.bossHPTxt=this.add.text(w/2,h-44,'',{fontSize:'11px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(12).setVisible(false);
    // キャラアイコン（MENUボタン）大きく・目立つ配置
    const cls={warrior:'剣',mage:'魔',archer:'弓',bomber:'爆'}[this.playerData.cls]||'?';
    const MX=BG_W+34, MY=38;
    // 外枠（発光エフェクト用の外リング）
    this._menuBtnGlow=this.add.rectangle(MX,MY,64,64,0x44aaff,0.18).setScrollFactor(0).setDepth(14);
    // ボタン本体
    this._menuBtn=this.add.rectangle(MX,MY,56,56,0x0a0f2a,0.95).setStrokeStyle(3,0x44aaff).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    // 職業文字
    this.add.text(MX,MY-8,cls,{fontSize:'22px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    // MENU ラベル
    this.add.text(MX,MY+16,'MENU',{fontSize:'9px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    // バッジ（ポイントがあると光る）
    this._menuBadge=this.add.text(MX+24,MY-24,'',{
      fontSize:'12px',fontFamily:'Courier New',color:'#ffffff',
      backgroundColor:'#e74c3c',padding:{x:3,y:2}
    }).setScrollFactor(0).setDepth(17);
    this._menuBtn.on('pointerdown',()=>this.openMenu('stat'));
    this._menuBtn.on('pointerover',()=>{this._menuBtn.setFillStyle(0x44aaff,0.3);this._menuBtnGlow.setFillStyle(0x44aaff,0.4);});
    this._menuBtn.on('pointerout', ()=>{this._menuBtn.setFillStyle(0x0a0f2a,0.95);this._menuBtnGlow.setFillStyle(0x44aaff,0.18);});
    // ポイントがあるとき点滅アニメ
    this._menuPulse=this.tweens.add({
      targets:this._menuBtnGlow,
      fillAlpha:{from:0.1,to:0.5},
      duration:600, yoyo:true, repeat:-1, paused:true
    });
    // ミュートボタン（MENUボタン右）
    const muteX=MX+46;
    this._muteBtn=this.add.rectangle(muteX,MY,32,32,0x1a1a3a,0.9).setStrokeStyle(1,0x555555).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    this._muteTxt=this.add.text(muteX,MY,muted?'🔇':'🔊',{fontSize:'14px'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this._muteBtn.on('pointerdown',()=>{
      setMute(!muted);
      this._muteTxt.setText(muted?'🔇':'🔊');
    });
    this.updateHUD();
  }
  openBuilding(b){
    const w=this.scale.width,h=this.scale.height,pd=this.playerData;
    if(!this.msgText){
      this.msgText=this.add.text(0,0,'',{fontSize:'12px',fontFamily:'Courier New',color:'#ffffff',backgroundColor:'#000000cc',padding:{x:8,y:6}}).setDepth(50).setScrollFactor(0).setVisible(false);
    }
    const msgs={
      inn:'🏨 宿屋  泊まる？(30G)\n[Y]はい  [N]いいえ',
      shop:'🏪 ショップ\nHPポーション 30G [1]\nMPポーション 25G [2]',
      blacksmith:'🔨 鍛冶屋\n鉄の剣 80G ATK+8 [1]\n革の鎧 70G DEF+5/HP+20 [2]\n俊足の靴 60G SPD+20 [3]',
      magic:'🔮 魔法店\n魔法の杖 90G MAG+8 [1]\n幸運の指輪 100G LUK+8 [2]',
      guild:'⚔ ギルド\n（準備中）\n[ESC]閉じる',
    };
    this.msgText.setText(msgs[b.type]||'準備中').setPosition(w/2-140,h/2-70).setVisible(true);
    const close=()=>this.msgText.setVisible(false);
    this.input.keyboard.once('keydown-ESC',close);
    this.input.keyboard.once('keydown-N',close);
    if(b.type==='inn') this.input.keyboard.once('keydown-Y',()=>{
      if(pd.gold>=30){pd.gold-=30;pd.hp=pd.mhp;pd.sp=pd.msp;pd.potHP=(pd.potHP||0)+3;pd.potMP=(pd.potMP||0)+3;SE('potion');this.updateHUD();this.msgText.setText('✨ 完全回復！ポーション3本補充！');}
      else this.msgText.setText('💰 お金が足りない！');
      this.time.delayedCall(1500,close);
    });
    if(b.type==='shop'){
      this.input.keyboard.once('keydown-ONE',()=>{if(pd.gold>=30){pd.gold-=30;pd.potHP=(pd.potHP||0)+1;SE('potion');this.updateHUD();this.msgText.setText('💊 HPポーション購入！');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-TWO',()=>{if(pd.gold>=25){pd.gold-=25;pd.potMP=(pd.potMP||0)+1;SE('potion');this.updateHUD();this.msgText.setText('💧 MPポーション購入！');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
    }
    if(b.type==='blacksmith'){
      this.input.keyboard.once('keydown-ONE',()=>{if(pd.gold>=80){pd.gold-=80;pd.atk+=8;SE('potion');this.updateHUD();this.msgText.setText('⚔ 鉄の剣！ATK+8');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-TWO',()=>{if(pd.gold>=70){pd.gold-=70;pd.def+=5;pd.mhp+=20;pd.hp=Math.min(pd.hp+20,pd.mhp);SE('potion');this.updateHUD();this.msgText.setText('🛡 革の鎧！DEF+5 HP+20');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-THREE',()=>{if(pd.gold>=60){pd.gold-=60;pd.spd+=20;pd.hit+=3;SE('potion');this.updateHUD();this.msgText.setText('👟 俊足の靴！SPD+20 HIT+3');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
    }
    if(b.type==='magic'){
      this.input.keyboard.once('keydown-ONE',()=>{if(pd.gold>=90){pd.gold-=90;pd.mag+=8;pd.msp+=15;SE('potion');this.updateHUD();this.msgText.setText('🔮 魔法の杖！MAG+8 SP+15');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
      this.input.keyboard.once('keydown-TWO',()=>{if(pd.gold>=100){pd.gold-=100;pd.luk+=8;pd.hit+=5;SE('potion');this.updateHUD();this.msgText.setText('💍 幸運の指輪！LUK+8 HIT+5%');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,close);});
    }
  }

  openMenu(tab='stat'){
    if(this._menuOpen) return;
    this._menuOpen=true;
    this.physics.pause();
    this._buildMenuOverlay(tab);
  }

  _buildMenuOverlay(tab){
    const pd=this.playerData;
    const w=this.scale.width, h=this.scale.height;
    const PW=Math.min(w*0.94,880), PH=Math.min(h*0.94,510);
    const PX=w/2, PY=h/2;
    const TAB_H=34, CLOSE_H=32;
    const ITOP=PY-PH/2+TAB_H+4;
    const IBOT=PY+PH/2-CLOSE_H-6;
    const IH=IBOT-ITOP;
    const LX=PX-PW/2+10;
    const D=100; // depth基準（HUDより上）

    // オーバーレイコンテナ（全要素をまとめてsetScrollFactor(0)）
    const root=this.add.container(0,0).setDepth(D);
    this._menuRoot=root;

    // 背景
    const bg=this.add.rectangle(PX,PY,w,h,0x000000,0.85).setScrollFactor(0);
    const panel=this.add.rectangle(PX,PY,PW,PH,0x060916,0.99).setStrokeStyle(2,0x44aaff).setScrollFactor(0);
    root.add([bg,panel]);

    // タブ
    const tabBtns={}, tabTxts={};
    const statCont=this.add.container(0,0);
    const skillCont=this.add.container(0,0);
    root.add([statCont,skillCont]);

    const switchTab=(t)=>{
      statCont.setVisible(t==='stat');
      skillCont.setVisible(t==='skill');
      Object.entries(tabBtns).forEach(([id,btn])=>{
        const col=id==='stat'?0x44aaff:0x00e5ff;
        btn.setFillStyle(col,id===t?0.45:0.1).setStrokeStyle(2,id===t?col:0x334455);
        tabTxts[id].setColor(id===t?'#'+col.toString(16).padStart(6,'0'):'#334455');
      });
    };

    [['stat','⚡ ステータス',0x44aaff,-PW/4],['skill','🎯 スキルツリー',0x00e5ff,PW/4]].forEach(([id,label,col,ox])=>{
      const btn=this.add.rectangle(PX+ox,PY-PH/2+TAB_H/2,PW/2-4,TAB_H,col,0.15).setStrokeStyle(2,col).setScrollFactor(0).setInteractive();
      const txt=this.add.text(PX+ox,PY-PH/2+TAB_H/2,label,{fontSize:'15px',fontFamily:'Courier New',color:'#'+col.toString(16).padStart(6,'0')}).setOrigin(0.5).setScrollFactor(0);
      btn.on('pointerdown',()=>switchTab(id));
      tabBtns[id]=btn; tabTxts[id]=txt;
      root.add([btn,txt]);
    });

    // ── ステータスタブ ──
    const S=[
      {key:'atk',label:'力   STR',desc:'ATK+2', col:'#e74c3c',apply:(p,n)=>{p.atk+=n*2}},
      {key:'spd',label:'素早 AGI',desc:'SPD+12',col:'#2ecc71',apply:(p,n)=>{p.spd+=n*12}},
      {key:'mag',label:'魔力 MAG',desc:'MAG+2', col:'#9b59b6',apply:(p,n)=>{p.mag+=n*2}},
      {key:'mhp',label:'体力 VIT',desc:'HP+9',  col:'#27ae60',apply:(p,n)=>{p.mhp+=n*9;p.hp=Math.min(p.hp+n*9,p.mhp)}},
      {key:'luk',label:'運   LUK',desc:'CRIT+1',col:'#f39c12',apply:(p,n)=>{p.luk+=n}},
      {key:'hit',label:'命中 DEX',desc:'HIT+2', col:'#3498db',apply:(p,n)=>{p.hit+=n*2}},
    ];
    const tmp={}; S.forEach(s=>{tmp[s.key]=0;}); let tmpPts=pd.statPts||0;
    const ROW_H=(IH-50)/6;
    const ptsTxt=this.add.text(PX,ITOP+10,'残りポイント: '+tmpPts+'pt',{fontSize:'15px',fontFamily:'Courier New',color:'#ffff44'}).setOrigin(0.5).setScrollFactor(0);
    statCont.add(ptsTxt);
    const vt={}, at={};
    const refreshPts=()=>ptsTxt.setText('残りポイント: '+tmpPts+'pt');
    const svStr=(key)=>{if(key==='spd')return String(pd.spd);if(key==='mhp')return String(pd.mhp);return String(pd[key]);};
    S.forEach((s,i)=>{
      const y=ITOP+30+i*ROW_H+ROW_H/2;
      const lbl=this.add.text(LX,y,s.label,{fontSize:'14px',fontFamily:'Courier New',color:s.col}).setOrigin(0,0.5).setScrollFactor(0);
      const dsc=this.add.text(LX+120,y,s.desc,{fontSize:'12px',fontFamily:'Courier New',color:'#666'}).setOrigin(0,0.5).setScrollFactor(0);
      const cur=this.add.text(LX+210,y,svStr(s.key),{fontSize:'14px',fontFamily:'Courier New',color:'#fff'}).setOrigin(0,0.5).setScrollFactor(0);
      const add=this.add.text(LX+265,y,'',{fontSize:'14px',fontFamily:'Courier New',color:'#44ff88'}).setOrigin(0,0.5).setScrollFactor(0);
      const bm=this.add.rectangle(PX+PW/2-70,y,38,28,0xe74c3c,0.25).setStrokeStyle(1,0xe74c3c).setScrollFactor(0).setInteractive();
      const bmt=this.add.text(PX+PW/2-70,y,'－',{fontSize:'18px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5).setScrollFactor(0);
      const bp=this.add.rectangle(PX+PW/2-26,y,38,28,0x44aaff,0.25).setStrokeStyle(1,0x44aaff).setScrollFactor(0).setInteractive();
      const bpt=this.add.text(PX+PW/2-26,y,'＋',{fontSize:'18px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0);
      const adj=(dir)=>{
        const n=tmp[s.key]||0;
        if(dir>0&&tmpPts<=0)return; if(dir<0&&n<=0)return;
        tmp[s.key]=n+dir; tmpPts-=dir;
        add.setText(tmp[s.key]>0?'(+'+tmp[s.key]+')':tmp[s.key]<0?'('+tmp[s.key]+')':'');
        refreshPts(); SE('potion');
      };
      bm.on('pointerdown',()=>adj(-1)); bm.on('pointerover',()=>bm.setFillStyle(0xe74c3c,0.5)); bm.on('pointerout',()=>bm.setFillStyle(0xe74c3c,0.25));
      bp.on('pointerdown',()=>adj(+1)); bp.on('pointerover',()=>bp.setFillStyle(0x44aaff,0.5)); bp.on('pointerout',()=>bp.setFillStyle(0x44aaff,0.25));
      statCont.add([lbl,dsc,cur,add,bm,bmt,bp,bpt]);
      vt[s.key]=cur; at[s.key]=add;
    });
    const ok=this.add.rectangle(PX-70,IBOT-14,190,30,0x44aaff,0.25).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setInteractive();
    const okt=this.add.text(PX-70,IBOT-14,'✔ 確定して反映',{fontSize:'14px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0);
    ok.on('pointerover',()=>ok.setFillStyle(0x44aaff,0.5)); ok.on('pointerout',()=>ok.setFillStyle(0x44aaff,0.25));
    ok.on('pointerdown',()=>{
      let any=false;
      S.forEach(s=>{const n=tmp[s.key]||0;if(n>0){s.apply(pd,n);any=true;}tmp[s.key]=0;});
      pd.statPts=tmpPts;
      S.forEach(s=>{if(vt[s.key])vt[s.key].setText(svStr(s.key));if(at[s.key])at[s.key].setText('');});
      refreshPts(); if(any)SE('levelup'); this.updateHUD();
    });
    const rst=this.add.rectangle(PX+110,IBOT-14,120,30,0x333,0.25).setStrokeStyle(1,0x666).setScrollFactor(0).setInteractive();
    const rstt=this.add.text(PX+110,IBOT-14,'↺ リセット',{fontSize:'13px',fontFamily:'Courier New',color:'#aaa'}).setOrigin(0.5).setScrollFactor(0);
    rst.on('pointerdown',()=>{S.forEach(s=>{tmpPts+=tmp[s.key]||0;tmp[s.key]=0;if(at[s.key])at[s.key].setText('');});refreshPts();});
    rst.on('pointerover',()=>rst.setFillStyle(0x666,0.4)); rst.on('pointerout',()=>rst.setFillStyle(0x333,0.25));
    statCont.add([ok,okt,rst,rstt]);

    // ── スキルタブ ──
    const DEFS={
      warrior:[{id:'sk1',name:'烈風斬',maxLv:10,desc:'周囲の敵を吹き飛ばす'},{id:'sk2',name:'ハードガード',maxLv:10,desc:'防御力大幅UP'},{id:'sk3',name:'パリィ',maxLv:5,desc:'攻撃無効化'}],
      mage:   [{id:'sk1',name:'大爆発',maxLv:10,desc:'広範囲大ダメージ'},{id:'sk2',name:'フロスト',maxLv:10,desc:'広範囲凍結'},{id:'sk3',name:'ボルテックス',maxLv:5,desc:'雷の貫通弾'}],
      archer: [{id:'sk1',name:'5方向射撃',maxLv:10,desc:'5方向同時射撃'},{id:'sk2',name:'グロリアスショット',maxLv:10,desc:'クリ率×5'},{id:'sk3',name:'バルカン',maxLv:10,desc:'連射'}],
      bomber: [{id:'sk1',name:'クラスター',maxLv:10,desc:'6方向爆弾'},{id:'sk2',name:'大爆弾',maxLv:10,desc:'前方大爆発'},{id:'sk3',name:'ハイパーボム',maxLv:5,desc:'超巨大爆弾'}],
    };
    const defs=DEFS[pd.cls]||[];
    const jpTxt=this.add.text(PX,ITOP+10,'JLv'+(pd.jobLv||1)+'   JOBポイント: '+(pd.jobPts||0)+'pt',{fontSize:'15px',fontFamily:'Courier New',color:'#ffff44'}).setOrigin(0.5).setScrollFactor(0);
    const jbg=this.add.rectangle(PX,ITOP+26,PW-30,8,0x222222).setOrigin(0.5).setScrollFactor(0);
    const jbar=this.add.rectangle(PX-(PW-30)/2,ITOP+26,(PW-30)*Math.min(1,(pd.jobExp||0)/(pd.jobExpNext||80)),8,0x00e5ff).setOrigin(0,0.5).setScrollFactor(0);
    skillCont.add([jpTxt,jbg,jbar]);
    const SK_H=(IH-46)/3;
    defs.forEach((sk,i)=>{
      const y=ITOP+38+i*SK_H+SK_H/2;
      const cur=pd[sk.id]||0,maxed=cur>=sk.maxLv,col=cur>0?0x00e5ff:0x555555;
      const sbg=this.add.rectangle(PX,y,PW-16,SK_H-4,col,0.07).setStrokeStyle(1,col).setScrollFactor(0);
      const kl=this.add.text(LX,y-12,['[Q]','[E]','[R]'][i],{fontSize:'11px',fontFamily:'Courier New',color:'#888'}).setOrigin(0,0.5).setScrollFactor(0);
      const nm=this.add.text(LX+38,y-12,sk.name,{fontSize:'16px',fontFamily:'Courier New',color:'#'+col.toString(16).padStart(6,'0')}).setOrigin(0,0.5).setScrollFactor(0);
      const ds=this.add.text(LX,y+8,sk.desc,{fontSize:'12px',fontFamily:'Courier New',color:'#888'}).setOrigin(0,0.5).setScrollFactor(0);
      const maxB=sk.maxLv,bW=Math.floor((PW*0.35)/maxB)-2;
      const bStartX=PX-PW*0.18;
      for(let j=0;j<maxB;j++){
        skillCont.add(this.add.rectangle(bStartX+j*(bW+2),y-12,bW,14,j<cur?0x00e5ff:0x1a1a2e).setStrokeStyle(1,0x333366).setOrigin(0,0.5).setScrollFactor(0));
      }
      const lvt=this.add.text(PX+PW*0.22,y-12,'Lv'+cur+'/'+sk.maxLv,{fontSize:'13px',fontFamily:'Courier New',color:maxed?'#ffd700':'#888'}).setOrigin(0.5).setScrollFactor(0);
      skillCont.add([sbg,kl,nm,ds,lvt]);
      if(!maxed){
        const sbtn=this.add.rectangle(PX+PW/2-55,y+8,100,28,0x00e5ff,0.2).setStrokeStyle(1,0x00e5ff).setScrollFactor(0).setInteractive();
        const sbt=this.add.text(PX+PW/2-55,y+8,cur===0?'習得(1JP)':'強化(1JP)',{fontSize:'13px',fontFamily:'Courier New',color:'#00e5ff'}).setOrigin(0.5).setScrollFactor(0);
        sbtn.on('pointerover',()=>sbtn.setFillStyle(0x00e5ff,0.45)); sbtn.on('pointerout',()=>sbtn.setFillStyle(0x00e5ff,0.2));
        sbtn.on('pointerdown',()=>{
          if((pd.jobPts||0)<1)return;
          pd.jobPts--;pd[sk.id]=(pd[sk.id]||0)+1;SE('potion');
          // オーバーレイを閉じて再度開く（内容更新）
          this._closeMenu();
          this.time.delayedCall(50,()=>this.openMenu('skill'));
        });
        skillCont.add([sbtn,sbt]);
      }else{skillCont.add(this.add.text(PX+PW/2-55,y+8,'MAX',{fontSize:'14px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0));}
    });

    // 閉じるボタン
    const closeBtn=this.add.rectangle(PX,PY+PH/2-CLOSE_H/2-2,180,CLOSE_H,0xffd700,0.2).setStrokeStyle(2,0xffd700).setScrollFactor(0).setInteractive();
    const closeTxt=this.add.text(PX,PY+PH/2-CLOSE_H/2-2,'✕ 閉じる [ESC]',{fontSize:'14px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0);
    closeBtn.on('pointerover',()=>closeBtn.setFillStyle(0xffd700,0.45)); closeBtn.on('pointerout',()=>closeBtn.setFillStyle(0xffd700,0.2));
    closeBtn.on('pointerdown',()=>this._closeMenu());
    root.add([closeBtn,closeTxt]);

    // ESCキー
    this._menuEscKey=this.input.keyboard.addKey('ESC');
    this._menuEscKey.once('down',()=>this._closeMenu());

    switchTab(tab);
  }

  _closeMenu(){
    if(!this._menuOpen)return;
    this._menuOpen=false;
    if(this._menuRoot){this._menuRoot.destroy(true);this._menuRoot=null;}
    if(this._menuEscKey){this._menuEscKey.destroy();this._menuEscKey=null;}
    this.physics.resume();
    this.updateHUD();
    this._updateMenuBadge();
  }
  _updateMenuBadge(){
    const pd=this.playerData;
    const pts=(pd.statPts||0)+(pd.jobPts||0);
    if(!this._menuBadge)return;
    if(pts>0){
      // ポイントあり: バッジ表示 + ボタン点滅
      this._menuBadge.setText('↑'+pts+'pt');
      if(this._menuPulse&&this._menuPulse.isPaused())this._menuPulse.resume();
      if(this._menuBtn)this._menuBtn.setStrokeStyle(3,0xffff00); // 枠を黄色に
    }else{
      // ポイントなし: バッジ非表示 + 点滅停止
      this._menuBadge.setText('');
      if(this._menuPulse&&!this._menuPulse.isPaused())this._menuPulse.pause();
      if(this._menuBtnGlow)this._menuBtnGlow.setFillStyle(0x44aaff,0.18);
      if(this._menuBtn)this._menuBtn.setStrokeStyle(3,0x44aaff); // 枠を青に戻す
    }
  }
  updateHUD(){
    const pd=this.playerData;
    const BW=160;
    const hp=Math.max(0,pd.hp),sp=Math.max(0,pd.sp);
    const hpP=hp/pd.mhp,spP=sp/pd.msp;
    // HP（色変化あり）
    this.hudHPBar.setSize(BW*hpP,11).setFillStyle(hpP>0.5?0x2ecc71:hpP>0.25?0xf39c12:0xe74c3c);
    // SP
    this.hudSPBar.setSize(BW*spP,11);
    // EXP
    const expP=Math.min(1,pd.exp/pd.expNext);
    this.hudEXPBar.setSize(BW*expP,8);
    // JOB EXP
    const jexpP=Math.min(1,(pd.jobExp||0)/(pd.jobExpNext||80));
    this.hudJEXPBar.setSize(BW*jexpP,8);
    // Lv表示
    if(this.hudLvTxt) this.hudLvTxt.setText('Lv'+pd.lv+'  JLv'+(pd.jobLv||1));
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

    // ── レイアウト（960×540基準）──────────────────
    // 右下角: 大きな攻撃ボタン（⚔）  径50
    // 攻撃ボタン左: スキル3つ横並び  各60×50
    // 左下中央: ポーション2つ  各50×44
    // ジョイスティックは左下（別メソッド）

    const MARGIN = 12; // 画面端からの余白

    // 攻撃ボタン（右下角・大きめ円）
    const ATK_R = 44;
    const atkX = w - ATK_R - MARGIN;
    const atkY = h - ATK_R - MARGIN;
    const btnAtk = this.add.circle(atkX,atkY,ATK_R,0xffd700,0.3)
      .setScrollFactor(0).setDepth(25)
      .setStrokeStyle(3,0xffd700,1.0)
      .setInteractive({useHandCursor:true});
    this.add.text(atkX,atkY-6,'⚔',{fontSize:'24px'}).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    this.add.text(atkX,atkY+18,'攻撃',{fontSize:'13px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    btnAtk.on('pointerdown',()=>{btnAtk.setFillStyle(0xffd700,0.7);this.normalAttack();});
    btnAtk.on('pointerup',  ()=>btnAtk.setFillStyle(0xffd700,0.3));
    btnAtk.on('pointerout', ()=>btnAtk.setFillStyle(0xffd700,0.3));

    // スキルボタン3つ（攻撃ボタン左に横並び）
    this.skillCDOverlays=[];
    const SK_W=62, SK_H=50;
    const skLabels=['Q','E','R'];
    [1,2,3].forEach((num,i)=>{
      const sk=defs[num-1]||{name:'---'};
      const hasSkill=pd['sk'+num]>0;
      const c=hasSkill?col:0x555555;
      // 右から攻撃ボタン幅+余白+スキルボタン位置
      const bx = atkX - ATK_R - MARGIN - SK_W/2 - (2-i)*(SK_W+6);
      const by = h - SK_H/2 - MARGIN;
      const btn=this.add.rectangle(bx,by,SK_W,SK_H,c,0.28)
        .setScrollFactor(0).setDepth(25)
        .setStrokeStyle(2,c,hasSkill?1.0:0.4)
        .setInteractive({useHandCursor:true});
      this.add.text(bx,by-14,'['+skLabels[i]+'] '+sk.name,{
        fontSize:'12px',fontFamily:'Courier New',color:'#'+c.toString(16).padStart(6,'0')
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
      this.add.text(bx,by+2,'Lv'+(pd['sk'+num]||0),{
        fontSize:'12px',fontFamily:'Courier New',color:hasSkill?'#ffffff':'#555555'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
      const cdTxt=this.add.text(bx,by+14,'',{
        fontSize:'8px',fontFamily:'Courier New',color:'#aaaaaa'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
      btn.on('pointerdown',()=>{btn.setFillStyle(c,hasSkill?0.7:0.1);this.useSkill(num);});
      btn.on('pointerup',  ()=>btn.setFillStyle(c,0.28));
      btn.on('pointerout', ()=>btn.setFillStyle(c,0.28));
      // CDオーバーレイ
      const ov=this.add.rectangle(bx,by,SK_W,SK_H,0x000000,0).setScrollFactor(0).setDepth(27);
      const ct=this.add.text(bx,by,'',{fontSize:'14px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(28);
      this.skillCDOverlays.push({key:'skillCD'+num,ov,ct});
    });

    // ポーションボタン（ジョイスティック右、下部中央寄り）
    const POT_W=50, POT_H=44;
    const potBaseX=200;
    // HP
    const btnF=this.add.rectangle(potBaseX,h-POT_H/2-MARGIN,POT_W,POT_H,0x2ecc71,0.28)
      .setScrollFactor(0).setDepth(25).setStrokeStyle(2,0x2ecc71,1.0)
      .setInteractive({useHandCursor:true});
    this.add.text(potBaseX,h-POT_H/2-MARGIN-10,'💊',{fontSize:'16px'}).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    this.potHPTxt=this.add.text(potBaseX,h-POT_H/2-MARGIN+10,'x'+(pd.potHP||0),{
      fontSize:'14px',fontFamily:'Courier New',color:'#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    btnF.on('pointerdown',()=>{btnF.setFillStyle(0x2ecc71,0.7);this.usePotion('hp');});
    btnF.on('pointerup',  ()=>btnF.setFillStyle(0x2ecc71,0.28));
    btnF.on('pointerout', ()=>btnF.setFillStyle(0x2ecc71,0.28));
    // MP
    const btnG=this.add.rectangle(potBaseX+58,h-POT_H/2-MARGIN,POT_W,POT_H,0x3498db,0.28)
      .setScrollFactor(0).setDepth(25).setStrokeStyle(2,0x3498db,1.0)
      .setInteractive({useHandCursor:true});
    this.add.text(potBaseX+58,h-POT_H/2-MARGIN-10,'💧',{fontSize:'16px'}).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    this.potMPTxt=this.add.text(potBaseX+58,h-POT_H/2-MARGIN+10,'x'+(pd.potMP||0),{
      fontSize:'14px',fontFamily:'Courier New',color:'#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    btnG.on('pointerdown',()=>{btnG.setFillStyle(0x3498db,0.7);this.usePotion('mp');});
    btnG.on('pointerup',  ()=>btnG.setFillStyle(0x3498db,0.28));
    btnG.on('pointerout', ()=>btnG.setFillStyle(0x3498db,0.28));
  }

  createMinimap(){
    // 右上に配置（HUDと被らないよう左端は w-110 以降）
    const w=this.scale.width,h=this.scale.height;
    const mw=110,mh=80,mx=w-mw-6,my=6;
    this.add.rectangle(mx,my,mw,mh,0x000000,0.72).setOrigin(0).setScrollFactor(0).setDepth(20).setStrokeStyle(1,0xffd700);
    this.add.text(mx+mw/2,my+mh+4,'ST.'+this.stage,{fontSize:'12px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(21);
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
    const w=this.scale.width, h=this.scale.height;
    this.joyActive=false; this.joyDx=0; this.joyDy=0;
    this.joyPointerId=null;

    // 固定位置: 左下 ボタンバー(h-56)より上
    const JX=80, JY=h-140;
    this.joyInitX=JX; this.joyInitY=JY;
    this.joyX=JX; this.joyY=JY;
    this.joyR=44;

    // 外円（常時表示）
    this.joyBase=this.add.circle(JX,JY,54,0x000000,0.60)
      .setScrollFactor(0).setDepth(50)
      .setStrokeStyle(3,0x44aaff,1.0);
    // 内円（ノブ）
    this.joyKnob=this.add.circle(JX,JY,26,0x44aaff,0.95)
      .setScrollFactor(0).setDepth(51);
    // ラベル
    this.joyLabel=this.add.text(JX,JY,'移動',{
      fontSize:'10px',fontFamily:'Courier New',color:'#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(52);

    // iPhoneではptr.x/yがスクリーン座標で来る場合があるため
    // scale.displayScale で正規化して判定する
    const getGameXY=(ptr)=>{
      const ds=this.scale.displayScale;
      const bounds=this.scale.canvasBounds;
      const gx=(ptr.event.clientX - bounds.left) / ds.x;
      const gy=(ptr.event.clientY - bounds.top)  / ds.y;
      return {x:gx, y:gy};
    };

    // タッチ開始
    this.input.on('pointerdown',(ptr)=>{
      if(this.joyPointerId!==null)return;
      // まずptr.x/yを使い、念のためgetGameXYも試す
      let x=ptr.x, y=ptr.y;
      // iOSでずれる場合の補正
      if(ptr.event && ptr.event.clientX){
        const g=getGameXY(ptr);
        if(g.x>=0&&g.x<=w&&g.y>=0&&g.y<=h){x=g.x;y=g.y;}
      }
      // 反応エリア: 左45% かつ ボタンバーより上 かつ 画面上35%より下
      if(x < w*0.45 && y > h*0.30 && y < h-50){
        this.joyActive=true;
        this.joyPointerId=ptr.id;
        this.joyX=x; this.joyY=y;
        this.joyBase.setPosition(x,y);
        this.joyKnob.setPosition(x,y);
        this.joyLabel.setPosition(x,y);
      }
    },this);

    // タッチ移動
    this.input.on('pointermove',(ptr)=>{
      if(!this.joyActive||ptr.id!==this.joyPointerId)return;
      let x=ptr.x, y=ptr.y;
      if(ptr.event && ptr.event.clientX){
        const g=getGameXY(ptr);
        if(g.x>=0&&g.x<=w&&g.y>=0&&g.y<=h){x=g.x;y=g.y;}
      }
      const dx=x-this.joyX, dy=y-this.joyY;
      const dist=Math.sqrt(dx*dx+dy*dy);
      const maxR=this.joyR;
      const cx=dist>maxR?this.joyX+dx/dist*maxR:x;
      const cy=dist>maxR?this.joyY+dy/dist*maxR:y;
      this.joyKnob.setPosition(cx,cy);
      this.joyLabel.setPosition(cx,cy);
      this.joyDx=dist>6?dx/Math.max(dist,maxR):0;
      this.joyDy=dist>6?dy/Math.max(dist,maxR):0;
    },this);

    // タッチ終了
    const onUp=(ptr)=>{
      if(ptr.id!==this.joyPointerId)return;
      this.joyActive=false;
      this.joyPointerId=null;
      this.joyDx=0; this.joyDy=0;
      this.joyBase.setPosition(JX,JY);
      this.joyKnob.setPosition(JX,JY);
      this.joyLabel.setPosition(JX,JY);
      this.joyX=JX; this.joyY=JY;
    };
    this.input.on('pointerup',onUp,this);
    this.input.on('pointercancel',onUp,this);
  }

  updateJoystick(){
    const pd=this.playerData,p=this.player;
    // Menu表示中は入力を完全に無視して静止
    if(this._menuOpen){p.setVelocity(0,0);return;}
    const kl=this.cursors.left.isDown||this.wasd.A.isDown;
    const kr=this.cursors.right.isDown||this.wasd.D.isDown;
    const ku=this.cursors.up.isDown||this.wasd.W.isDown;
    const kd=this.cursors.down.isDown||this.wasd.S.isDown;
    let vx=kl?-1:kr?1:this.joyDx||0;
    let vy=ku?-1:kd?1:this.joyDy||0;
    const len=Math.sqrt(vx*vx+vy*vy);
    if(len>1){vx/=len;vy/=len;}
    p.setVelocity(vx*pd.spd,vy*pd.spd);
    // ボマーアニメ更新
    if(pd.cls==='bomber') this._updateBomberAnim(vx,vy);
    // 最後に動いた向きを記録（攻撃方向決定用）
    if(vx!==0||vy!==0) this._lastAngle=Math.atan2(vy,vx);
  }

  _registerBomberAnims(){
    const BA=[
      {key:'bomber_front_idle',frames:[0],    rate:2, rep:-1},
      {key:'bomber_front_walk',frames:[1,2],  rate:8, rep:-1},
      {key:'bomber_front_atk', frames:[3,4],  rate:10,rep:0 },
      {key:'bomber_back_idle', frames:[5],    rate:2, rep:-1},
      {key:'bomber_back_walk', frames:[6,7],  rate:8, rep:-1},
      {key:'bomber_back_atk',  frames:[8,9],  rate:10,rep:0 },
      {key:'bomber_side_idle', frames:[10],   rate:2, rep:-1},
      {key:'bomber_side_walk', frames:[11,12],rate:8, rep:-1},
      {key:'bomber_side_atk',  frames:[13,14],rate:10,rep:0 },
    ];
    BA.forEach(a=>{
      if(this.anims.exists(a.key))return;
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_bomber',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });
  }

  _updateBomberAnim(vx,vy){
    const p=this.player;
    const cur=p.anims.currentAnim;
    // 攻撃アニメ再生中は割り込まない
    if(cur && cur.key.endsWith('_atk') && p.anims.isPlaying) return;

    const moving=Math.abs(vx)>0.1||Math.abs(vy)>0.1;
    let facing=this._bomberFacing||'front';
    let flip=this._bomberFlip||false;

    if(moving){
      if(Math.abs(vy)>Math.abs(vx)*0.5){
        facing=vy<0?'back':'front';
        flip=false;
      }else{
        facing='side';
        flip=vx<0;
      }
    }

    this._bomberFacing=facing;
    this._bomberFlip=flip;
    p.setFlipX(flip);

    const key='bomber_'+facing+'_'+(moving?'walk':'idle');
    if(!cur||cur.key!==key) p.play(key,true);
  }

  playBomberAtk(){
    const p=this.player;
    const key='bomber_'+(this._bomberFacing||'front')+'_atk';
    p.play(key,true);
    // 攻撃終了後にidle復帰
    p.once('animationcomplete',()=>{
      const idleKey='bomber_'+(this._bomberFacing||'front')+'_idle';
      p.play(idleKey,true);
    });
  }
  updateAutoAtk(dt){
    // 自動攻撃廃止 - ボタンで手動攻撃
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
      SE('levelup');this.cameras.main.flash(300,255,215,0);
      this.showFloat(this.player.x,this.player.y-80,'✨ LEVEL UP! Lv'+pd.lv+'  ↑MENUでST振り','#ffd700');
    }
    // バッジ更新のみ（自動Menu表示なし）
    this._updateMenuBadge();
  }
  // ⑦ ジョブEXP処理
  addJobExp(amount){
    const pd=this.playerData;
    pd.jobExp=(pd.jobExp||0)+amount;
    let jobLeveled=false;
    while(pd.jobExp>=(pd.jobExpNext||80)){
      pd.jobExp-=(pd.jobExpNext||80);
      pd.jobLv=(pd.jobLv||1)+1;
      pd.jobExpNext=Math.floor((pd.jobExpNext||80)*1.5);
      pd.jobPts=(pd.jobPts||0)+1;
      jobLeveled=true;
      SE('levelup');
      this.showFloat(this.player.x,this.player.y-100,'⚡ JOB LV UP! JLv'+pd.jobLv,'#00e5ff');
    }
    // バッジ更新のみ（自動Menu表示なし）
    if(jobLeveled) this._updateMenuBadge();
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
    stopBGM();
    const w=this.scale.width,h=this.scale.height;
    this.add.rectangle(w/2,h/2,440,200,0x000000,0.92).setScrollFactor(0).setDepth(40);
    this.add.text(w/2,h/2-50,'✖ GAME OVER',{fontSize:'32px',fontFamily:'Courier New',color:'#e74c3c',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(w/2,h/2,'Lv'+this.playerData.lv+'  討伐'+this.playerData.kills+'体  Gold'+this.playerData.gold+'G',{fontSize:'13px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(w/2,h/2+40,'クリック or [R] で町に復活',{fontSize:'15px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    const revive=()=>{
      const pd=this.playerData;
      pd.hp=1; // §17: HP=1で復活
      
      this.scene.start('Game',{playerData:pd,stage:0});
    };
    this.input.keyboard.once('keydown-R',revive);
    this.time.delayedCall(500,()=>this.input.once('pointerdown',revive));
  }

  update(time,delta){
    const dt=delta/1000,pd=this.playerData,p=this.player;
    this.updateJoystick();
    // spaceKey攻撃はPC専用（スマホはボタンで操作）
    if(!this.sys.game.device.input.touch && Phaser.Input.Keyboard.JustDown(this.spaceKey))this.normalAttack();
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
      
      if(this.cfg.portalBack===0)this.scene.start('Game',{playerData:pd,stage:0});
      else this.scene.start('Game',{playerData:pd,stage:this.cfg.portalBack});
    }
    if(this.portalNext&&this.portalNext.open&&Phaser.Math.Distance.Between(p.x,p.y,this.MW-80,this.MH/2)<60){
      
      if(!this.cfg.portalTo)this.scene.start('GameClear',{playerData:pd});
      else this.scene.start('Game',{playerData:pd,stage:this.portalNext.to});
    }
    if(Math.floor(time/100)!==Math.floor((time-delta)/100))this.updateMinimap();
    // [S][J]キー（Menu未表示時のみ）
    if(Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey('S')))this.openMenu('stat');
    if(Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey('J')))this.openMenu('skill');
    this._updateMenuBadge();
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
  scale:{
    mode:Phaser.Scale.RESIZE,
    autoCenter:Phaser.Scale.NO_CENTER,
    width:window.innerWidth,
    height:window.innerHeight,
  },
  backgroundColor:'#000000',
  input:{
    activePointers:4,        // マルチタッチ4本対応
    touch:{capture:true},
  },
  physics:{default:'arcade',arcade:{gravity:{y:0},debug:false}},
  scene:[BootScene,TitleScene,ClassSelectScene,LevelUpScene,GameScene,GameClearScene]
});