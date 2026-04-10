// ============================================================
//  AURA QUEST - Phaser 3 版  game.js
//  STEP3-D: UI改善（ミニマップ・スキルボタン・ボスHPバー）
// ============================================================

const BASE = 'https://lunaseiya.github.io/aura-quest/';
const TILE = 32;

// ============================================================
//  BootScene
// ============================================================
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const w=this.scale.width, h=this.scale.height;
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
  create() { this.scene.start('Title'); }
}

// ============================================================
//  TitleScene
// ============================================================
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    const w=this.scale.width, h=this.scale.height;
    this.add.rectangle(0,0,w,h,0x0a1020).setOrigin(0);
    this.add.text(w/2,h*0.3,'AURA QUEST',{fontSize:'48px',fontFamily:'Courier New',color:'#ffd700',stroke:'#ff8c00',strokeThickness:4}).setOrigin(0.5);
    this.add.text(w/2,h*0.45,'- Press to Start -',{fontSize:'20px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5);
    this.input.once('pointerdown',()=>this.scene.start('ClassSelect'));
    this.input.keyboard.once('keydown',()=>this.scene.start('ClassSelect'));
  }
}

// ============================================================
//  ClassSelectScene
// ============================================================
class ClassSelectScene extends Phaser.Scene {
  constructor() { super('ClassSelect'); }
  create() {
    const w=this.scale.width, h=this.scale.height;
    this.add.rectangle(0,0,w,h,0x060010).setOrigin(0);
    this.add.text(w/2,40,'⚔ 職業を選ぼう ⚔',{fontSize:'24px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);
    const classes=[
      {key:'warrior',name:'剣士',      desc:'近接・高耐久・パリィ',   col:0xe74c3c,x:-180,y:-60},
      {key:'mage',   name:'マジャン',  desc:'広範囲魔法・凍結',       col:0x9b59b6,x:180,y:-60},
      {key:'archer', name:'アーチャー',desc:'高速遠距離・多方向射撃', col:0x27ae60,x:-180,y:80},
      {key:'bomber', name:'ボマー',    desc:'爆弾投擲・範囲爆発',     col:0xf39c12,x:180,y:80},
    ];
    classes.forEach(cls=>{
      const cx=w/2+cls.x, cy=h/2+cls.y;
      const card=this.add.rectangle(cx,cy,300,120,cls.col,0.15).setInteractive({useHandCursor:true}).setStrokeStyle(2,cls.col);
      this.add.image(cx-100,cy,'player_'+cls.key).setDisplaySize(64,80);
      this.add.text(cx-30,cy-22,cls.name,{fontSize:'18px',fontFamily:'Courier New',color:'#'+cls.col.toString(16).padStart(6,'0')});
      this.add.text(cx-30,cy+2,cls.desc,{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'});
      card.on('pointerover',()=>card.setFillStyle(cls.col,0.3));
      card.on('pointerout', ()=>card.setFillStyle(cls.col,0.15));
      card.on('pointerdown',()=>this.scene.start('Town',{playerData:makePlayerData(cls.key)}));
    });
  }
}

function makePlayerData(cls) {
  const base={warrior:{hp:110,sp:60,atk:6,def:6,mag:5,spd:180},mage:{hp:90,sp:70,atk:5,def:4,mag:8,spd:160},archer:{hp:100,sp:65,atk:6,def:5,mag:5,spd:200},bomber:{hp:95,sp:80,atk:8,def:4,mag:6,spd:170}}[cls];
  return {cls,hp:base.hp,mhp:base.hp,sp:base.sp,msp:base.sp,atk:base.atk,def:base.def,mag:base.mag,spd:base.spd,lv:1,exp:0,expNext:100,gold:50,potHP:3,potMP:3,kills:0};
}

// ============================================================
//  TownScene
// ============================================================
class TownScene extends Phaser.Scene {
  constructor() { super('Town'); }
  init(data) { this.playerData=data.playerData; }
  create() {
    const TW=1200,TH=800;
    this.TW=TW; this.TH=TH;
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
  }
  createHUD(){
    const pd=this.playerData,w=this.scale.width;
    this.add.rectangle(0,0,240,80,0x000000,0.75).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudHPBar=this.add.rectangle(44,14,180*(pd.hp/pd.mhp),10,0x2ecc71).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.rectangle(44,14,180,10,0x000000,0).setOrigin(0).setScrollFactor(0).setDepth(10).setStrokeStyle(1,0x444444);
    this.hudSPBar=this.add.rectangle(44,30,180*(pd.sp/pd.msp),10,0x3498db).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.rectangle(44,30,180,10,0x000000,0).setOrigin(0).setScrollFactor(0).setDepth(10).setStrokeStyle(1,0x444444);
    this.add.text(2,12,'HP',{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setScrollFactor(0).setDepth(11);
    this.add.text(2,28,'SP',{fontSize:'9px',fontFamily:'Courier New',color:'#3498db'}).setScrollFactor(0).setDepth(11);
    this.hudGold=this.add.text(4,48,'💰 '+pd.gold+'G  💊'+(pd.potHP||0)+'  💧'+(pd.potMP||0),{fontSize:'11px',fontFamily:'Courier New',color:'#ffd700'}).setScrollFactor(0).setDepth(11);
    this.add.text(w-4,4,'TOWN',{fontSize:'12px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(1,0).setScrollFactor(0).setDepth(11);
    // ミニマップ（町版）
    this.createMinimap(1200,800,'TOWN');
  }
  createMinimap(mapW,mapH,label){
    const w=this.scale.width,h=this.scale.height;
    const mw=100,mh=80,mx=w-mw-6,my=h-mh-6;
    this.mmBg=this.add.rectangle(mx,my,mw,mh,0x000000,0.7).setOrigin(0).setScrollFactor(0).setDepth(20).setStrokeStyle(1,0xffd700);
    this.add.text(mx+mw/2,my-10,label,{fontSize:'9px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.mmDot=this.add.circle(0,0,3,0xffd700).setScrollFactor(0).setDepth(22);
    this.mmW=mw; this.mmH=mh; this.mmX=mx; this.mmY=my;
    this.mmMapW=mapW; this.mmMapH=mapH;
  }
  updateHUD(){
    const pd=this.playerData;
    this.hudHPBar.setSize(180*(Math.max(0,pd.hp)/pd.mhp),10);
    this.hudSPBar.setSize(180*(Math.max(0,pd.sp)/pd.msp),10);
    this.hudGold.setText('💰 '+pd.gold+'G  💊'+(pd.potHP||0)+'  💧'+(pd.potMP||0));
  }
  tryInteract(){
    const p=this.player;
    if(Phaser.Math.Distance.Between(p.x,p.y,this.TW/2,this.TH-160)<80){this.scene.start('Game',{playerData:this.playerData,stage:1});return;}
    for(const b of this.buildings){
      if(Math.abs(p.x-(b.x+b.w/2))<b.w/2+40&&Math.abs(p.y-(b.y+b.h/2))<b.h/2+40){this.openBuilding(b);return;}
    }
  }
  openBuilding(b){
    const w=this.scale.width,h=this.scale.height;
    const msgs={inn:'🏨 宿屋  泊まる？(30G)\n[Y]はい  [N]いいえ',shop:'🏪 ショップ\nHPポーション 30G [1]\nMPポーション 25G [2]',blacksmith:'🔨 鍛冶屋\n鉄の剣 80G ATK+8 [1]\n革の鎧 70G DEF+5 [2]',magic:'🔮 魔法店\n魔法の杖 90G MAG+8 [1]\n幸運の指輪 100G LUK+8 [2]',guild:'⚔ ギルド\n(準備中)\n[ESC]閉じる'};
    this.msgText.setText(msgs[b.type]||'準備中').setPosition(w/2-120,h/2-50).setVisible(true);
    if(b.type==='inn'){this.input.keyboard.once('keydown-Y',()=>{const pd=this.playerData;if(pd.gold>=30){pd.gold-=30;pd.hp=pd.mhp;pd.sp=pd.msp;pd.potHP=(pd.potHP||0)+3;pd.potMP=(pd.potMP||0)+3;this.updateHUD();this.msgText.setText('✨ 完全回復！');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1500,()=>this.msgText.setVisible(false));});}
    if(b.type==='shop'){
      this.input.keyboard.once('keydown-ONE',()=>{const pd=this.playerData;if(pd.gold>=30){pd.gold-=30;pd.potHP=(pd.potHP||0)+1;this.updateHUD();this.msgText.setText('💊 HPポーション購入！');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,()=>this.msgText.setVisible(false));});
      this.input.keyboard.once('keydown-TWO',()=>{const pd=this.playerData;if(pd.gold>=25){pd.gold-=25;pd.potMP=(pd.potMP||0)+1;this.updateHUD();this.msgText.setText('💧 MPポーション購入！');}else this.msgText.setText('💰 お金が足りない！');this.time.delayedCall(1200,()=>this.msgText.setVisible(false));});
    }
    this.input.keyboard.once('keydown-N',()=>this.msgText.setVisible(false));
    this.input.keyboard.once('keydown-ESC',()=>this.msgText.setVisible(false));
  }
  update(){
    const p=this.player,pd=this.playerData,spd=pd.spd;
    const l=this.cursors.left.isDown||this.wasd.A.isDown;
    const r=this.cursors.right.isDown||this.wasd.D.isDown;
    const u=this.cursors.up.isDown||this.wasd.W.isDown;
    const d=this.cursors.down.isDown||this.wasd.S.isDown;
    p.setVelocity(l?-spd:r?spd:0,u?-spd:d?spd:0);
    // ミニマップ更新
    if(this.mmDot){
      const mx=this.mmX+p.x/this.mmMapW*this.mmW;
      const my=this.mmY+p.y/this.mmMapH*this.mmH;
      this.mmDot.setPosition(mx,my);
    }
    let hint='';
    for(const b of this.buildings){if(Math.abs(p.x-(b.x+b.w/2))<b.w/2+50&&Math.abs(p.y-(b.y+b.h/2))<b.h/2+50){hint='[E] '+b.label;break;}}
    if(Phaser.Math.Distance.Between(p.x,p.y,this.TW/2,this.TH-160)<80)hint='[E] 野外へ出発！';
    this.hintText.setText(hint);
  }
}

// ============================================================
//  敵データ
// ============================================================
const ENEMY_DEFS={
  slime:   {hp:28, atk:4, def:0,spd:60, exp:12,gold:3,  sz:28,rng:36,acd:1.2},
  bat:     {hp:20, atk:6, def:0,spd:110,exp:18,gold:4,  sz:24,rng:32,acd:0.9},
  goblin:  {hp:52, atk:8, def:1,spd:80, exp:30,gold:7,  sz:32,rng:40,acd:1.0},
  troll:   {hp:120,atk:12,def:2,spd:45, exp:60,gold:15, sz:48,rng:48,acd:1.8},
  wolf:    {hp:65, atk:14,def:1,spd:120,exp:45,gold:10, sz:32,rng:40,acd:0.8},
  skeleton:{hp:80, atk:11,def:3,spd:70, exp:40,gold:12, sz:32,rng:40,acd:1.1},
  boss1:   {hp:600,atk:18,def:5,spd:80, exp:500,gold:200,sz:68,rng:64,acd:1.2,isBoss:true},
};
const STAGE_ENEMIES={
  1:[['slime',300,200],['slime',700,300],['slime',500,500],['slime',850,200],['slime',170,540],
     ['bat',400,150],['bat',900,400],['bat',210,490],
     ['goblin',600,590],['goblin',160,290],['goblin',970,490],
     ['troll',800,690],['troll',340,740]],
};

// ============================================================
//  GameScene
// ============================================================
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }
  init(data){
    this.playerData=data.playerData||makePlayerData('warrior');
    this.stage=data.stage||1;
  }

  create(){
    const MW=1200,MH=1000;
    this.MW=MW; this.MH=MH;
    this.cameras.main.setBounds(0,0,MW,MH);
    this.physics.world.setBounds(0,0,MW,MH);

    // 草原タイル
    const cols=Math.ceil(MW/TILE),rows=Math.ceil(MH/TILE);
    for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
      const n=(c*31+r*17)%100;
      const key=n<5?'tile_flower':n<14?'tile_dark_forest':'tile_grass';
      this.add.image(c*TILE+16,r*TILE+16,key).setDisplaySize(TILE,TILE);
    }

    // 障害物
    const OBS=[[180,120],[500,90],[740,180],[145,400],[900,290],[350,600],[800,540],[950,700],[420,320],[650,800]];
    this.obstacles=this.physics.add.staticGroup();
    OBS.forEach(([x,y])=>{ const o=this.obstacles.create(x,y,'obj_tree').setDisplaySize(28,36); o.refreshBody(); });

    // ポータル（町へ）
    this.add.image(MW/2,60,'portal_town').setDisplaySize(96,64);
    this.add.text(MW/2,104,'🏘 町へ戻る',{fontSize:'11px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);

    // プレイヤー
    const pd=this.playerData;
    this.player=this.physics.add.sprite(MW/2,MH/2,'player_'+pd.cls).setDisplaySize(48,60).setCollideWorldBounds(true).setDepth(5);
    this.physics.add.collider(this.player,this.obstacles);
    this.cameras.main.startFollow(this.player,true,0.1,0.1);

    // 敵
    this.enemies=this.physics.add.group();
    this.enemyDataList=[];
    this.bossData=null;
    (STAGE_ENEMIES[this.stage]||STAGE_ENEMIES[1]).forEach(([id,x,y])=>this.spawnEnemy(id,x,y));

    // ドロップ
    this.drops=this.physics.add.staticGroup();
    this.physics.add.overlap(this.player,this.drops,(pl,drop)=>{
      const t=drop.getData('type');
      if(t==='hp'){pd.potHP=(pd.potHP||0)+1;this.showFloat(drop.x,drop.y,'💊+1','#2ecc71');}
      if(t==='mp'){pd.potMP=(pd.potMP||0)+1;this.showFloat(drop.x,drop.y,'💧+1','#3498db');}
      drop.destroy(); this.updateHUD();
    });

    // 入力
    this.cursors=this.input.keyboard.createCursorKeys();
    this.wasd=this.input.keyboard.addKeys('W,A,S,D');
    this.spaceKey=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.keyboard.on('keydown-F',()=>this.usePotion('hp'));
    this.input.keyboard.on('keydown-G',()=>this.usePotion('mp'));
    this.input.keyboard.on('keydown-Q',()=>this.useSkill());

    // タッチ/クリック攻撃
    this.input.on('pointerdown',ptr=>{
      // スキルボタン領域はスキップ
      if(ptr.y>this.scale.height-80) return;
      const wx=ptr.worldX,wy=ptr.worldY;
      let closest=null,cd=999;
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(wx,wy,ed.sprite.x,ed.sprite.y);
        if(d<80&&d<cd){cd=d;closest=ed;}
      });
      if(closest){this.target=closest;this.doAttack();}
      else this.target=null;
    });

    this.atkCooldown=0;
    this.skillCooldown=0;
    this.target=null;

    // HUD・UI作成
    this.createHUD();
    this.createSkillButtons();
    this.createMinimap();
  }

  // ── HUD ──────────────────────────────────────
  createHUD(){
    const pd=this.playerData,w=this.scale.width,h=this.scale.height;

    // 左上：HP/SP/情報
    this.hudBg=this.add.rectangle(0,0,260,80,0x000000,0.78).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudHPBg=this.add.rectangle(44,14,180,10,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudHPBar=this.add.rectangle(44,14,180*(pd.hp/pd.mhp),10,0x2ecc71).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.hudSPBg=this.add.rectangle(44,30,180,10,0x222222).setOrigin(0).setScrollFactor(0).setDepth(10);
    this.hudSPBar=this.add.rectangle(44,30,180*(pd.sp/pd.msp),10,0x3498db).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,12,'HP',{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setScrollFactor(0).setDepth(12);
    this.add.text(2,28,'SP',{fontSize:'9px',fontFamily:'Courier New',color:'#3498db'}).setScrollFactor(0).setDepth(12);
    this.hudHPTxt=this.add.text(228,12,pd.hp+'/'+pd.mhp,{fontSize:'9px',fontFamily:'Courier New',color:'#2ecc71'}).setScrollFactor(0).setDepth(12);
    this.hudSPTxt=this.add.text(228,28,pd.sp+'/'+pd.msp,{fontSize:'9px',fontFamily:'Courier New',color:'#3498db'}).setScrollFactor(0).setDepth(12);
    this.hudInfo=this.add.text(4,46,'',{fontSize:'10px',fontFamily:'Courier New',color:'#ffd700'}).setScrollFactor(0).setDepth(12);

    // 右上：ステージバッジ
    this.add.rectangle(w-4,0,80,24,0x000000,0.7).setOrigin(1,0).setScrollFactor(0).setDepth(10);
    this.add.text(w-8,4,'ST.'+this.stage,{fontSize:'14px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(1,0).setScrollFactor(0).setDepth(12);

    // ボスHPバー（初期非表示）
    this.bossHPGroup=this.add.group();
    this.bossHPBg=this.add.rectangle(w/2,h-44,w*0.6+8,20,0x000000,0.8).setScrollFactor(0).setDepth(10).setVisible(false);
    this.bossHPBar=this.add.rectangle(w/2-w*0.3,h-44,w*0.6,16,0xe74c3c).setOrigin(0,0.5).setScrollFactor(0).setDepth(11).setVisible(false);
    this.bossHPTxt=this.add.text(w/2,h-44,'',{fontSize:'11px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(12).setVisible(false);

    this.updateHUD();
  }

  updateHUD(){
    const pd=this.playerData;
    const hpPct=Math.max(0,pd.hp/pd.mhp);
    const spPct=Math.max(0,pd.sp/pd.msp);
    this.hudHPBar.setSize(180*hpPct,10);
    this.hudHPBar.setFillStyle(hpPct>0.5?0x2ecc71:hpPct>0.25?0xf39c12:0xe74c3c);
    this.hudSPBar.setSize(180*spPct,10);
    this.hudHPTxt.setText(Math.ceil(pd.hp)+'/'+pd.mhp);
    this.hudSPTxt.setText(Math.ceil(pd.sp)+'/'+pd.msp);
    this.hudInfo.setText('Lv'+pd.lv+' 💰'+pd.gold+'G 💊'+(pd.potHP||0)+' 💧'+(pd.potMP||0)+'  討伐:'+pd.kills);
  }

  updateBossHP(ed){
    const w=this.scale.width,h=this.scale.height;
    if(!ed||ed.dead){
      this.bossHPBg.setVisible(false);
      this.bossHPBar.setVisible(false);
      this.bossHPTxt.setVisible(false);
      return;
    }
    const pct=Math.max(0,ed.hp/ed.mhp);
    this.bossHPBg.setVisible(true);
    this.bossHPBar.setVisible(true).setSize(w*0.6*pct,16);
    this.bossHPTxt.setVisible(true).setText('⚠ BOSS: '+Math.ceil(ed.hp)+'/'+ed.mhp);
  }

  // ── スキルボタン（画面下） ────────────────────
  createSkillButtons(){
    const w=this.scale.width,h=this.scale.height;
    const pd=this.playerData;
    const skillNames={warrior:'烈風斬',mage:'大爆発',archer:'5方向射撃',bomber:'大爆弾'};
    const skillCols={warrior:0xe74c3c,mage:0x9b59b6,archer:0x27ae60,bomber:0xf39c12};
    const col=skillCols[pd.cls]||0xffd700;

    // ボタン背景バー
    this.add.rectangle(0,h-56,w,56,0x000000,0.7).setOrigin(0).setScrollFactor(0).setDepth(10);

    // [Q]スキルボタン
    const btnQ=this.add.rectangle(70,h-28,100,38,col,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(2,col).setInteractive({useHandCursor:true});
    this.add.text(70,h-36,'[Q] スキル',{fontSize:'11px',fontFamily:'Courier New',color:'#'+col.toString(16).padStart(6,'0')}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.add.text(70,h-18,skillNames[pd.cls]||'スキル',{fontSize:'10px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    btnQ.on('pointerdown',()=>this.useSkill());
    btnQ.on('pointerover',()=>btnQ.setFillStyle(col,0.5));
    btnQ.on('pointerout', ()=>btnQ.setFillStyle(col,0.25));
    this.skillBtn=btnQ;

    // [F]HPポーション
    const btnF=this.add.rectangle(190,h-28,80,38,0x2ecc71,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(2,0x2ecc71).setInteractive({useHandCursor:true});
    this.add.text(190,h-36,'[F] 💊',{fontSize:'11px',fontFamily:'Courier New',color:'#2ecc71'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.potHPTxt=this.add.text(190,h-18,'x'+(pd.potHP||0),{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    btnF.on('pointerdown',()=>this.usePotion('hp'));
    btnF.on('pointerover',()=>btnF.setFillStyle(0x2ecc71,0.5));
    btnF.on('pointerout', ()=>btnF.setFillStyle(0x2ecc71,0.25));

    // [G]MPポーション
    const btnG=this.add.rectangle(290,h-28,80,38,0x3498db,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(2,0x3498db).setInteractive({useHandCursor:true});
    this.add.text(290,h-36,'[G] 💧',{fontSize:'11px',fontFamily:'Courier New',color:'#3498db'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.potMPTxt=this.add.text(290,h-18,'x'+(pd.potMP||0),{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    btnG.on('pointerdown',()=>this.usePotion('mp'));
    btnG.on('pointerover',()=>btnG.setFillStyle(0x3498db,0.5));
    btnG.on('pointerout', ()=>btnG.setFillStyle(0x3498db,0.25));

    // [Space]攻撃ボタン
    const btnAtk=this.add.rectangle(w-80,h-28,120,38,0xffd700,0.25).setScrollFactor(0).setDepth(11).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true});
    this.add.text(w-80,h-36,'[Space]',{fontSize:'11px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    this.add.text(w-80,h-18,'攻撃',{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(12);
    btnAtk.on('pointerdown',()=>this.attackNearest());
    btnAtk.on('pointerover',()=>btnAtk.setFillStyle(0xffd700,0.5));
    btnAtk.on('pointerout', ()=>btnAtk.setFillStyle(0xffd700,0.25));

    // スキルCDオーバーレイ
    this.skillCDOverlay=this.add.rectangle(70,h-28,100,38,0x000000,0).setScrollFactor(0).setDepth(13);
    this.skillCDTxt=this.add.text(70,h-28,'',{fontSize:'16px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(14);
  }

  // ── ミニマップ ────────────────────────────────
  createMinimap(){
    const w=this.scale.width,h=this.scale.height;
    const mw=100,mh=80,mx=w-mw-6,my=h-mh-62;
    this.mmBg=this.add.rectangle(mx,my,mw,mh,0x000000,0.72).setOrigin(0).setScrollFactor(0).setDepth(20).setStrokeStyle(1,0xffd700);
    this.add.text(mx+mw/2,my-10,'ST.'+this.stage,{fontSize:'9px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(21);
    this.mmPlayerDot=this.add.circle(0,0,3,0xffd700).setScrollFactor(0).setDepth(23);
    this.mmEnemyDots=[];
    this.mmW=mw; this.mmH=mh; this.mmX=mx; this.mmY=my;
  }

  updateMinimap(){
    const p=this.player;
    const sx=this.mmX+p.x/this.MW*this.mmW;
    const sy=this.mmY+p.y/this.MH*this.mmH;
    this.mmPlayerDot.setPosition(sx,sy);

    // 敵ドットを毎フレーム再描画
    this.mmEnemyDots.forEach(d=>d.destroy());
    this.mmEnemyDots=[];
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      const ex=this.mmX+ed.sprite.x/this.MW*this.mmW;
      const ey=this.mmY+ed.sprite.y/this.MH*this.mmH;
      const dot=this.add.circle(ex,ey,ed.isBoss?4:2,ed.isBoss?0xff0000:0xff6363).setScrollFactor(0).setDepth(22);
      this.mmEnemyDots.push(dot);
    });
  }

  // ── 敵スポーン ─────────────────────────────────
  spawnEnemy(id,x,y){
    const def=ENEMY_DEFS[id]||ENEMY_DEFS.slime;
    const sp=this.enemies.create(x,y,'enemy_'+id).setDisplaySize(def.sz,def.sz).setDepth(4);
    sp.setCollideWorldBounds(true);
    const ed={id,sprite:sp,hp:def.hp,mhp:def.hp,atk:def.atk,def:def.def,spd:def.spd,exp:def.exp,gold:def.gold,rng:def.rng,acd:def.acd,attackTimer:def.acd+(Math.random()*def.acd),isBoss:!!def.isBoss,dead:false};
    ed.hpBarBg=this.add.rectangle(x,y-def.sz/2-6,def.sz,5,0x333333).setDepth(5);
    ed.hpBar=this.add.rectangle(x-def.sz/2,y-def.sz/2-6,def.sz,5,0xe74c3c).setOrigin(0,0.5).setDepth(6);
    this.enemyDataList.push(ed);
    if(ed.isBoss){this.bossData=ed;this.updateBossHP(ed);}
    return ed;
  }

  // ── 攻撃 ──────────────────────────────────────
  doAttack(){
    if(this.atkCooldown>0||!this.target||this.target.dead)return;
    const pd=this.playerData,t=this.target;
    const dist=Phaser.Math.Distance.Between(this.player.x,this.player.y,t.sprite.x,t.sprite.y);
    if(dist>160)return;
    const dmg=Math.max(1,pd.atk*2-(t.def||0)+Phaser.Math.Between(0,pd.atk));
    this.hitEnemy(t,dmg);
    this.atkCooldown=0.5;
  }

  attackNearest(){
    let closest=null,cd=200;
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      const d=Phaser.Math.Distance.Between(this.player.x,this.player.y,ed.sprite.x,ed.sprite.y);
      if(d<cd){cd=d;closest=ed;}
    });
    if(closest){this.target=closest;this.doAttack();}
  }

  // ── スキル ─────────────────────────────────────
  useSkill(){
    if(this.skillCooldown>0)return;
    const pd=this.playerData;
    const cost={warrior:20,mage:30,archer:15,bomber:25}[pd.cls]||20;
    if(pd.sp<cost){this.showFloat(this.player.x,this.player.y-50,'SP不足','#3498db');return;}
    pd.sp-=cost;
    const p=this.player;

    if(pd.cls==='warrior'){
      // 烈風斬：周囲全敵ヒット
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
        if(d<140){const dmg=Math.max(1,pd.atk*4);this.hitEnemy(ed,dmg);}
      });
      this.showFloat(p.x,p.y-60,'⚔ 烈風斬！','#e74c3c');
      this.cameras.main.shake(200,0.01);
      this.skillCooldown=4;

    }else if(pd.cls==='mage'){
      // 大爆発：全敵に魔法ダメージ
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
        if(d<220){const dmg=Math.max(1,pd.mag*6);this.hitEnemy(ed,dmg);}
      });
      this.showFloat(p.x,p.y-60,'💥 大爆発！','#9b59b6');
      this.cameras.main.shake(300,0.015);
      this.skillCooldown=5;

    }else if(pd.cls==='archer'){
      // 5方向射撃：ターゲット方向中心に5方向
      if(this.target&&!this.target.dead){
        const ang=Phaser.Math.Angle.Between(p.x,p.y,this.target.sprite.x,this.target.sprite.y);
        for(let i=-2;i<=2;i++){
          const a=ang+i*0.2;
          // 簡易レイキャストで敵ヒット判定
          this.enemyDataList.forEach(ed=>{
            if(ed.dead)return;
            const ea=Phaser.Math.Angle.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
            const diff=Phaser.Math.Angle.Wrap(ea-a);
            const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
            if(Math.abs(diff)<0.15&&d<400){const dmg=Math.max(1,pd.atk*3);this.hitEnemy(ed,dmg);}
          });
        }
        this.showFloat(p.x,p.y-60,'🏹 5方向射撃！','#27ae60');
      }else this.showFloat(p.x,p.y-40,'ターゲット選択','#888888');
      this.skillCooldown=3;

    }else if(pd.cls==='bomber'){
      // 大爆弾：前方に爆発
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
        if(d<200){const dmg=Math.max(1,pd.atk*5+pd.mag*2);this.hitEnemy(ed,dmg);}
      });
      this.showFloat(p.x,p.y-60,'💣 大爆弾！','#f39c12');
      this.cameras.main.shake(400,0.02);
      this.skillCooldown=5;
    }

    this.updateHUD();
  }

  // ── ポーション ─────────────────────────────────
  usePotion(type){
    const pd=this.playerData;
    if(type==='hp'&&(pd.potHP||0)>0){
      pd.potHP--;pd.hp=Math.min(pd.mhp,pd.hp+50);
      this.showFloat(this.player.x,this.player.y-50,'💊 HP+50','#2ecc71');
    }else if(type==='mp'&&(pd.potMP||0)>0){
      pd.potMP--;pd.sp=Math.min(pd.msp,pd.sp+50);
      this.showFloat(this.player.x,this.player.y-50,'💧 SP+50','#3498db');
    }
    this.updateHUD();
    if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
    if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
  }

  // ── 敵ヒット ──────────────────────────────────
  hitEnemy(ed,dmg){
    if(ed.dead)return;
    ed.hp-=dmg;
    this.showFloat(ed.sprite.x,ed.sprite.y-ed.sprite.displayHeight/2,'-'+dmg,'#ffffff');
    const pct=Math.max(0,ed.hp/ed.mhp);
    ed.hpBar.setSize(ed.hpBarBg.width*pct,5);
    ed.hpBar.setFillStyle(pct>0.5?0x2ecc71:pct>0.25?0xf39c12:0xe74c3c);
    this.tweens.add({targets:ed.sprite,alpha:0.3,duration:80,yoyo:true});
    if(ed.isBoss)this.updateBossHP(ed);
    if(ed.hp<=0)this.killEnemy(ed);
  }

  killEnemy(ed){
    ed.dead=true;
    const pd=this.playerData;
    pd.exp+=ed.exp;pd.gold+=ed.gold;pd.kills++;
    this.showFloat(ed.sprite.x,ed.sprite.y-40,'+'+ed.exp+'EXP','#f39c12');
    this.showFloat(ed.sprite.x,ed.sprite.y-60,'+'+ed.gold+'G','#ffd700');
    if(Math.random()<0.2){
      const type=Math.random()<0.5?'hp':'mp';
      const drop=this.drops.create(ed.sprite.x,ed.sprite.y,'drop_'+(type==='hp'?'hp_potion':'mp_potion')).setDisplaySize(24,24);
      drop.setData('type',type);drop.refreshBody();
    }
    this.tweens.add({targets:ed.sprite,alpha:0,duration:300,onComplete:()=>{
      ed.sprite.destroy();ed.hpBarBg.destroy();ed.hpBar.destroy();
    }});
    if(this.target===ed)this.target=null;
    if(ed.isBoss){this.bossData=null;this.updateBossHP(null);}
    this.checkLevelUp();
    this.updateHUD();
    if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
    if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
  }

  checkLevelUp(){
    const pd=this.playerData;
    if(pd.exp>=pd.expNext){
      pd.exp-=pd.expNext;pd.lv++;pd.expNext=Math.floor(pd.expNext*1.4);
      pd.mhp+=8;pd.hp=pd.mhp;pd.atk+=1;pd.def+=1;pd.msp+=5;
      this.showFloat(this.player.x,this.player.y-80,'✨ LEVEL UP! Lv'+pd.lv,'#ffd700');
      this.cameras.main.flash(300,255,215,0);
    }
  }

  showFloat(x,y,txt,col){
    const sx=x-this.cameras.main.scrollX;
    const sy=y-this.cameras.main.scrollY;
    const t=this.add.text(x,y,txt,{fontSize:'14px',fontFamily:'Courier New',color:col,stroke:'#000000',strokeThickness:3}).setOrigin(0.5).setDepth(30);
    this.tweens.add({targets:t,y:y-50,alpha:0,duration:900,onComplete:()=>t.destroy()});
  }

  // ── ゲームオーバー ──────────────────────────────
  gameOver(){
    this.physics.pause();
    const w=this.scale.width,h=this.scale.height;
    this.add.rectangle(w/2,h/2,420,180,0x000000,0.88).setScrollFactor(0).setDepth(40);
    this.add.text(w/2,h/2-40,'✖ GAME OVER',{fontSize:'32px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(w/2,h/2+10,'[R] 町に復活',{fontSize:'18px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.input.keyboard.once('keydown-R',()=>{
      const pd=this.playerData;pd.hp=Math.floor(pd.mhp*0.3);
      this.scene.start('Town',{playerData:pd});
    });
    // タップでも復活
    this.input.once('pointerdown',()=>{
      const pd=this.playerData;pd.hp=Math.floor(pd.mhp*0.3);
      this.scene.start('Town',{playerData:pd});
    });
  }

  // ── メインループ ───────────────────────────────
  update(time,delta){
    const dt=delta/1000;
    const pd=this.playerData,p=this.player;

    // 移動
    const l=this.cursors.left.isDown||this.wasd.A.isDown;
    const r=this.cursors.right.isDown||this.wasd.D.isDown;
    const u=this.cursors.up.isDown||this.wasd.W.isDown;
    const d=this.cursors.down.isDown||this.wasd.S.isDown;
    p.setVelocity(l?-pd.spd:r?pd.spd:0,u?-pd.spd:d?pd.spd:0);

    // スペースで近敵攻撃
    if(Phaser.Input.Keyboard.JustDown(this.spaceKey))this.attackNearest();

    // クールダウン
    if(this.atkCooldown>0)this.atkCooldown-=dt;
    if(this.skillCooldown>0){
      this.skillCooldown-=dt;
      this.skillCDOverlay.setFillStyle(0x000000,0.55);
      this.skillCDTxt.setText(Math.ceil(this.skillCooldown)+'s');
    }else{
      this.skillCDOverlay.setFillStyle(0x000000,0);
      this.skillCDTxt.setText('');
    }

    // 敵AI
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      const sp=ed.sprite;
      const dist=Phaser.Math.Distance.Between(p.x,p.y,sp.x,sp.y);
      if(dist<300){
        const ang=Phaser.Math.Angle.Between(sp.x,sp.y,p.x,p.y);
        sp.setVelocity(Math.cos(ang)*ed.spd,Math.sin(ang)*ed.spd);
      }else sp.setVelocity(0,0);
      // HPバー位置
      ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
      ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
      // 攻撃
      ed.attackTimer-=dt;
      if(ed.attackTimer<=0&&dist<ed.rng){
        ed.attackTimer=ed.acd;
        const dmg=Math.max(1,ed.atk-(pd.def||0)+Phaser.Math.Between(0,3));
        pd.hp=Math.max(0,pd.hp-dmg);
        this.showFloat(p.x,p.y-40,'-'+dmg,'#e74c3c');
        this.updateHUD();
        this.cameras.main.shake(120,0.004);
        if(pd.hp<=0){this.gameOver();return;}
      }
    });

    // ポータル（町へ）
    if(Phaser.Math.Distance.Between(p.x,p.y,this.MW/2,60)<60)
      this.scene.start('Town',{playerData:pd});

    // ミニマップ更新（5フレームに1回）
    if(time%5<delta/1000*60)this.updateMinimap();
  }
}

// ============================================================
//  Phaser 起動
// ============================================================
new Phaser.Game({
  type:Phaser.AUTO,
  scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH,width:800,height:600},
  backgroundColor:'#000000',
  physics:{default:'arcade',arcade:{gravity:{y:0},debug:false}},
  scene:[BootScene,TitleScene,ClassSelectScene,TownScene,GameScene]
});