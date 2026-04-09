// ============================================================
//  AURA QUEST - game.js  (Phaser 3.60)
// ============================================================

var GAME_W = 480;
var GAME_H = 854;

// ── ゲーム設定 ──────────────────────────────────────────────
var config = {
  type: Phaser.AUTO,
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0a0a1a',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  },
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: [BootScene, TitleScene, CharSelectScene, GameScene, UIScene]
};

// ============================================================
//  共通データ定義
// ============================================================
var CLS_DATA = {
  warrior: { hp:110, sp:60,  atk:6, def:6, mag:5, spd:160, hit:76, luk:6,  skn:'烈風斬',    sksp:20 },
  mage:    { hp:90,  sp:70,  atk:5, def:4, mag:8, spd:140, hit:75, luk:5,  skn:'大爆発',    sksp:30 },
  archer:  { hp:100, sp:65,  atk:6, def:5, mag:5, spd:190, hit:78, luk:7,  skn:'スピリット', sksp:15 },
  bomber:  { hp:95,  sp:80,  atk:8, def:4, mag:6, spd:165, hit:80, luk:5,  skn:'クラスター', sksp:0  }
};

var ENEMY_DATA = {
  slime:    { hp:28,   atk:4,  def:0, spd:60,  exp:12,  gold:3,  sz:0.8, rng:32, acd:1200 },
  bat:      { hp:20,   atk:6,  def:0, spd:130, exp:18,  gold:4,  sz:0.7, rng:28, acd:900  },
  goblin:   { hp:52,   atk:8,  def:1, spd:80,  exp:30,  gold:7,  sz:0.9, rng:32, acd:1000 },
  troll:    { hp:120,  atk:12, def:2, spd:40,  exp:60,  gold:15, sz:1.2, rng:36, acd:1800 },
  wolf:     { hp:65,   atk:14, def:1, spd:140, exp:45,  gold:10, sz:0.9, rng:34, acd:800  },
  skeleton: { hp:80,   atk:11, def:3, spd:70,  exp:40,  gold:12, sz:0.9, rng:32, acd:1100 },
  dragon:   { hp:200,  atk:20, def:4, spd:90,  exp:100, gold:30, sz:1.4, rng:45, acd:1500 },
  sandworm: { hp:280,  atk:22, def:6, spd:50,  exp:120, gold:35, sz:1.3, rng:38, acd:2000 },
  scorpion: { hp:130,  atk:28, def:3, spd:150, exp:90,  gold:28, sz:0.8, rng:30, acd:700  },
  boss1:    { hp:600,  atk:18, def:5, spd:75,  exp:500, gold:200,sz:1.8, rng:50, acd:1200, isBoss:true },
  boss2:    { hp:900,  atk:25, def:8, spd:90,  exp:800, gold:350,sz:2.0, rng:55, acd:1000, isBoss:true },
  boss3:    { hp:1400, atk:35, def:10,spd:100, exp:1500,gold:600,sz:2.2, rng:60, acd:900,  isBoss:true }
};

var STAGE_ENEMIES = {
  1: [
    {id:'slime',x:200,y:150},{id:'slime',x:500,y:300},{id:'slime',x:350,y:500},
    {id:'bat',x:400,y:150},{id:'bat',x:600,y:400},{id:'goblin',x:250,y:400},
    {id:'goblin',x:700,y:300},{id:'troll',x:500,y:600}
  ],
  2: [
    {id:'goblin',x:300,y:200},{id:'goblin',x:600,y:250},{id:'wolf',x:450,y:400},
    {id:'wolf',x:700,y:500},{id:'troll',x:300,y:550},{id:'skeleton',x:550,y:350},
    {id:'skeleton',x:750,y:450},{id:'bat',x:200,y:300}
  ],
  3: [
    {id:'wolf',x:300,y:300},{id:'wolf',x:600,y:350},{id:'skeleton',x:450,y:500},
    {id:'dragon',x:550,y:250},{id:'troll',x:250,y:500},{id:'goblin',x:700,y:400},
    {id:'bat',x:400,y:200},{id:'bat',x:650,y:550}
  ],
  4: [
    {id:'sandworm',x:350,y:200},{id:'sandworm',x:600,y:300},{id:'scorpion',x:250,y:400},
    {id:'scorpion',x:550,y:500},{id:'dragon',x:400,y:350},{id:'wolf',x:700,y:250},
    {id:'skeleton',x:300,y:550},{id:'scorpion',x:650,y:450}
  ]
};

var SHOP_ITEMS = [
  { id:'hpot',  name:'HPポーション', desc:'HP+50回復',    price:30,  icon:'💚', action:function(p){p.potHP=(p.potHP||0)+3;} },
  { id:'mpot',  name:'MPポーション', desc:'SP+50回復',    price:25,  icon:'💙', action:function(p){p.potMP=(p.potMP||0)+3;} },
  { id:'sword', name:'鉄の剣',       desc:'ATK+8',        price:80,  icon:'⚔',  action:function(p){p.atk+=8;} },
  { id:'armor', name:'革の鎧',       desc:'DEF+5 HP+20',  price:70,  icon:'🛡',  action:function(p){p.def+=5;p.mhp+=20;p.hp=Math.min(p.hp+20,p.mhp);} },
  { id:'boots', name:'俊足の靴',     desc:'SPD+20',       price:60,  icon:'👟',  action:function(p){p.spd+=20;} },
  { id:'ring',  name:'幸運の指輪',   desc:'LUK+8',        price:100, icon:'💍',  action:function(p){p.luk=Math.min(60,p.luk+8);} }
];

var STAT_LABELS = { str:'力(ATK)', agi:'素早さ', mag:'魔力', vit:'体力', luk:'運', dex:'命中' };

// ============================================================
//  BootScene
// ============================================================
function BootScene(){ Phaser.Scene.call(this,{key:'Boot'}); }
BootScene.prototype = Object.create(Phaser.Scene.prototype);
BootScene.prototype.constructor = BootScene;

BootScene.prototype.preload = function(){
  var self = this;
  var bar   = this.add.rectangle(GAME_W/2, GAME_H/2, 0, 20, 0xffd700);
  var frame = this.add.rectangle(GAME_W/2, GAME_H/2, 300, 24).setStrokeStyle(2,0xffd700);
  var label = this.add.text(GAME_W/2, GAME_H/2-40,'Loading...',
    {fontSize:'16px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);

  this.load.on('progress',function(v){
    bar.setSize(298*v,18);
    label.setText('Loading... '+Math.floor(v*100)+'%');
  });

  var imgs = [
    ['warrior','players/warrior.png'],['mage','players/mage.png'],
    ['archer','players/archer.png'],  ['bomber','players/bomber.png'],
    ['slime','enemies/slime.png'],    ['bat','enemies/bat.png'],
    ['goblin','enemies/goblin.png'],  ['troll','enemies/troll.png'],
    ['wolf','enemies/wolf.png'],      ['skeleton','enemies/skeleton.png'],
    ['dragon','enemies/dragon.png'],  ['sandworm','enemies/sandworm.png'],
    ['scorpion','enemies/scorpion.png'],
    ['boss1','enemies/boss1.png'],    ['boss2','enemies/boss2.png'],
    ['boss3','enemies/boss3.png'],
    ['tile_grass','tiles/grass.png'], ['tile_dark','tiles/dark_forest.png'],
    ['tile_flower','tiles/flower.png'],['tile_lava','tiles/lava.png'],
    ['tile_sea','tiles/sea.png'],     ['tile_sand','tiles/sand_desert.png'],
    ['tile_cobble','tiles/cobble.png'],['tile_path','tiles/town_path.png'],
    ['tile_wall','tiles/town_wall.png'],['tile_cliff','tiles/cliff.png'],
    ['tile_water','tiles/water.png'], ['tile_bridge','tiles/bridge.png'],
    ['tree','objects/tree.png'],      ['rock','objects/rock.png'],
    ['palm','objects/palm.png'],      ['barrel','objects/barrel.png'],
    ['bomb','projectiles/bomb.png'],  ['bigbomb','projectiles/bigbomb.png'],
    ['arrow','projectiles/arrow.png'],['fireball','projectiles/fireball.png'],
    ['vortexball','projectiles/vortexball.png'],
    ['slash_fx','effects/slash.png'], ['explode_fx','effects/explosion.png'],
    ['shockwave_fx','effects/shockwave.png'],['freeze_fx','effects/freeze.png'],
    ['drop_hp','drops/hp_potion.png'],['drop_mp','drops/mp_potion.png'],
    ['portal_town','portals/portal_town.png'],
    ['portal_st1','portals/portal_st1.png'],
    ['portal_st2','portals/portal_st2.png'],
    ['portal_st3','portals/portal_st3.png'],
    ['portal_st4','portals/portal_st4.png']
  ];
  imgs.forEach(function(pair){ self.load.image(pair[0],pair[1]); });
};
BootScene.prototype.create = function(){ this.scene.start('Title'); };

// ============================================================
//  TitleScene
// ============================================================
function TitleScene(){ Phaser.Scene.call(this,{key:'Title'}); }
TitleScene.prototype = Object.create(Phaser.Scene.prototype);
TitleScene.prototype.constructor = TitleScene;

TitleScene.prototype.create = function(){
  var self=this, W=GAME_W, H=GAME_H;

  var bg=this.add.graphics();
  bg.fillGradientStyle(0x02000a,0x02000a,0x12080a,0x12080a,1);
  bg.fillRect(0,0,W,H);

  this.stars=[];
  for(var i=0;i<60;i++){
    var s=this.add.circle(
      Phaser.Math.Between(0,W), Phaser.Math.Between(0,H*0.75),
      Phaser.Math.FloatBetween(0.5,2), 0xffffff, Phaser.Math.FloatBetween(0.2,0.9));
    s.twinkleSpeed=Phaser.Math.FloatBetween(0.02,0.06);
    s.twinkleOffset=Phaser.Math.FloatBetween(0,Math.PI*2);
    this.stars.push(s);
  }

  var mtn=this.add.graphics();
  mtn.fillStyle(0x080412,1); mtn.beginPath(); mtn.moveTo(0,H*0.76);
  [[0.08,0.62],[0.15,0.77],[0.22,0.56],[0.30,0.71],[0.38,0.49],
   [0.46,0.67],[0.52,0.43],[0.60,0.64],[0.68,0.51],[0.75,0.69],
   [0.82,0.46],[0.90,0.66],[1.0,0.78]].forEach(function(p){mtn.lineTo(W*p[0],H*p[1]);});
  mtn.lineTo(W,H*0.76); mtn.closePath(); mtn.fillPath();

  var ground=this.add.graphics();
  ground.fillStyle(0x0a1606,1); ground.beginPath(); ground.moveTo(0,H*0.76);
  ground.lineTo(W*0.25,H*0.76-6); ground.lineTo(W*0.5,H*0.76+4);
  ground.lineTo(W*0.75,H*0.76-4); ground.lineTo(W,H*0.76);
  ground.lineTo(W,H); ground.lineTo(0,H); ground.closePath(); ground.fillPath();

  var logo=this.add.text(W/2,H*0.22,'⚔ AURA QUEST',{
    fontSize:'38px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffd700',
    stroke:'#ff4400',strokeThickness:2,
    shadow:{offsetX:0,offsetY:0,color:'#ff8c00',blur:20,fill:true}
  }).setOrigin(0.5);

  this.add.text(W/2,H*0.22+52,'― LEGEND OF AURA ―',{
    fontSize:'13px',fontFamily:'Courier New',color:'#ff8c00'
  }).setOrigin(0.5);

  this.tweens.add({targets:logo,scaleX:1.04,scaleY:1.04,duration:1500,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});

  var classes=[
    {icon:'🛡',name:'剣士',  color:'#e74c3c'},
    {icon:'🔮',name:'魔導師',color:'#9b59b6'},
    {icon:'🏹',name:'射手',  color:'#27ae60'},
    {icon:'💣',name:'爆士',  color:'#f39c12'}
  ];
  var sp=W/5;
  classes.forEach(function(c,i){
    var cx=sp*(i+1);
    self.add.text(cx,H*0.50,c.icon,{fontSize:'28px'}).setOrigin(0.5);
    self.add.text(cx,H*0.50+36,c.name,{fontSize:'11px',fontFamily:'Courier New',fontStyle:'bold',color:c.color}).setOrigin(0.5);
  });

  var btnBg=this.add.rectangle(W/2,H*0.64,260,52,0xc47a00).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true});
  var btnText=this.add.text(W/2,H*0.64,'▶ 冒険を始める',{fontSize:'18px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffffff'}).setOrigin(0.5);
  this.tweens.add({targets:[btnBg,btnText],alpha:0.75,duration:900,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
  btnBg.on('pointerover',function(){btnBg.setFillStyle(0xff8c00);});
  btnBg.on('pointerout', function(){btnBg.setFillStyle(0xc47a00);});
  btnBg.on('pointerdown',function(){self.scene.start('CharSelect');});

  this.add.text(W/2,H*0.64+42,'TAP TO START',{fontSize:'10px',fontFamily:'Courier New',color:'#444'}).setOrigin(0.5);

  this.time.addEvent({delay:4000,loop:true,callback:this.spawnShootingStar,callbackScope:this});
};
TitleScene.prototype.spawnShootingStar=function(){
  if(this.shootingStar)this.shootingStar.destroy();
  var W=GAME_W,H=GAME_H;
  var sx=Phaser.Math.Between(W*0.4,W*0.9),sy=Phaser.Math.Between(H*0.05,H*0.2);
  var star=this.add.line(0,0,sx,sy,sx+40,sy-20,0xffffff,0.8).setLineWidth(1.5);
  this.shootingStar=star;
  this.tweens.add({targets:star,alpha:0,x:-60,y:30,duration:800,ease:'Power2',
    onComplete:function(){if(star)star.destroy();}});
};
TitleScene.prototype.update=function(time){
  this.stars.forEach(function(s){
    s.setAlpha(0.35+Math.sin(time*s.twinkleSpeed*0.001+s.twinkleOffset)*0.4);
  });
};

// ============================================================
//  CharSelectScene
// ============================================================
function CharSelectScene(){ Phaser.Scene.call(this,{key:'CharSelect'}); }
CharSelectScene.prototype = Object.create(Phaser.Scene.prototype);
CharSelectScene.prototype.constructor = CharSelectScene;

CharSelectScene.prototype.create=function(){
  var self=this, W=GAME_W, H=GAME_H;
  this.selectedClass='warrior';

  var bg=this.add.graphics();
  bg.fillGradientStyle(0x02000a,0x02000a,0x0a0518,0x0a0518,1);
  bg.fillRect(0,0,W,H);

  this.titleText=this.add.text(W/2,44,'⚔ 職業を選ぼう ⚔',{
    fontSize:'20px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffd700',
    shadow:{blur:10,color:'#ffd700',fill:true}
  }).setOrigin(0.5);
  this.add.text(W/2,72,'― Choose your destiny ―',{fontSize:'10px',fontFamily:'Courier New',color:'#666'}).setOrigin(0.5);

  this.clsList=[
    {id:'warrior',name:'剣士',      icon:'🛡',color:0xe74c3c,hex:'#e74c3c',desc:'近接・高耐久・パリィ',stats:'ATK★★★  DEF★★★★'},
    {id:'mage',   name:'マジシャン',icon:'🔮',color:0x9b59b6,hex:'#9b59b6',desc:'広範囲魔法・凍結・貫通弾',stats:'MAG★★★★  RNG★★★★'},
    {id:'archer', name:'アーチャー',icon:'🏹',color:0x27ae60,hex:'#27ae60',desc:'高速遠距離・5方向射撃',stats:'SPD★★★★  HIT★★★★'},
    {id:'bomber', name:'ボマー',    icon:'💣',color:0xf39c12,hex:'#f39c12',desc:'爆弾投擲・範囲爆発',stats:'ATK★★★★  BOMB★★★★'}
  ];

  this.cards=[];
  var cY=115, cH=86, gap=10;
  this.clsList.forEach(function(cls,i){
    var y=cY+i*(cH+gap);
    self.cards.push(self.makeCard(cls,12,y,W-24,cH));
  });

  var prevY=cY+4*(cH+gap)+10;
  this.add.rectangle(W/2,prevY+70,W-24,140,0x0a0618).setStrokeStyle(1,0x333333);
  this.previewImg=this.add.image(80,prevY+70,'warrior').setDisplaySize(72,90);
  this.previewName=this.add.text(130,prevY+30,'剣士',{fontSize:'20px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffd700',shadow:{blur:8,color:'#ffd700',fill:true}});
  this.previewDesc=this.add.text(130,prevY+58,'近接・高HP・弾き飛ばし',{fontSize:'10px',fontFamily:'Courier New',color:'#aaa',wordWrap:{width:W-160}});

  var sy=H-70;
  var sBg=this.add.rectangle(W/2,sy,W-40,52,0xc47a00).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true});
  var sTx=this.add.text(W/2,sy,'▶▶ 冒険へ出発！',{fontSize:'17px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffffff'}).setOrigin(0.5);
  this.tweens.add({targets:[sBg,sTx],alpha:0.8,duration:800,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
  sBg.on('pointerover',function(){sBg.setFillStyle(0xff8c00);});
  sBg.on('pointerout', function(){sBg.setFillStyle(0xc47a00);});
  sBg.on('pointerdown',function(){self.scene.start('Game',{playerClass:self.selectedClass});});

  this.add.text(W/2,H-22,'◀ タイトルへ戻る',{fontSize:'11px',fontFamily:'Courier New',color:'#555'})
    .setOrigin(0.5).setInteractive({useHandCursor:true})
    .on('pointerdown',function(){self.scene.start('Title');});

  this.selectClass('warrior');
};
CharSelectScene.prototype.makeCard=function(cls,x,y,w,h){
  var self=this;
  var container=this.add.container(x,y);
  var bg=this.add.rectangle(w/2,h/2,w,h,0x0e0c20).setStrokeStyle(2,0x333333).setInteractive({useHandCursor:true});
  var icon=this.add.text(14,h/2,cls.icon,{fontSize:'26px'}).setOrigin(0,0.5);
  var nm=this.add.text(52,12,cls.name,{fontSize:'14px',fontFamily:'Courier New',fontStyle:'bold',color:cls.hex});
  var ds=this.add.text(52,34,cls.desc,{fontSize:'10px',fontFamily:'Courier New',color:'#888'});
  var st=this.add.text(52,54,cls.stats,{fontSize:'9px',fontFamily:'Courier New',color:'#555'});
  var badge=this.add.text(w-8,8,'▶選択中',{fontSize:'9px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(1,0).setVisible(false);
  container.add([bg,icon,nm,ds,st,badge]);
  bg.on('pointerdown',function(){self.selectClass(cls.id);});
  bg.on('pointerover',function(){if(self.selectedClass!==cls.id)bg.setStrokeStyle(2,cls.color);});
  bg.on('pointerout', function(){if(self.selectedClass!==cls.id)bg.setStrokeStyle(2,0x333333);});
  return {container:container,bg:bg,badge:badge,cls:cls};
};
CharSelectScene.prototype.selectClass=function(id){
  this.selectedClass=id;
  var found=null;
  this.cards.forEach(function(card){
    var sel=card.cls.id===id;
    card.bg.setFillStyle(sel?0x1a0a00:0x0e0c20);
    card.bg.setStrokeStyle(sel?3:2,sel?card.cls.color:0x333333);
    card.badge.setVisible(sel);
    if(sel)found=card.cls;
  });
  if(found){
    this.previewImg.setTexture(id);
    this.previewName.setText(found.name).setColor(found.hex);
    this.previewDesc.setText(found.desc);
    this.titleText.setColor(found.hex);
  }
};

// ============================================================
//  GameScene  ─ メインゲーム
// ============================================================
function GameScene(){ Phaser.Scene.call(this,{key:'Game'}); }
GameScene.prototype = Object.create(Phaser.Scene.prototype);
GameScene.prototype.constructor = GameScene;

// ── マップ定義 ──
GameScene.MAPS = {
  town: { w:25, h:20, tileKey:'tile_cobble',  pathKey:'tile_path', wallKey:'tile_wall',   bgColor:0x4a3a2a },
  1:    { w:38, h:32, tileKey:'tile_grass',    altKey:'tile_dark',  flowerKey:'tile_flower',bgColor:0x2a4a1a },
  2:    { w:38, h:32, tileKey:'tile_lava',     altKey:'tile_cliff', bgColor:0x1a0808 },
  3:    { w:38, h:32, tileKey:'tile_sea',      altKey:'tile_sand',  bgColor:0x87ceeb },
  4:    { w:38, h:32, tileKey:'tile_sand',     altKey:'tile_cliff', bridgeKey:'tile_bridge',bgColor:0xb8943a }
};

// ── create ──
GameScene.prototype.create=function(data){
  var self=this;
  this.playerClass=(data&&data.playerClass)||'warrior';

  // プレイヤーステータス初期化（再スタート時は引き継ぎ）
  if(data&&data.playerData){
    this.playerData=data.playerData;
  } else {
    var cd=CLS_DATA[this.playerClass];
    this.playerData={
      cls:this.playerClass, lv:1, exp:0, expN:100, gold:0,
      hp:cd.hp, mhp:cd.hp, sp:cd.sp, msp:cd.sp,
      atk:cd.atk, def:cd.def, mag:cd.mag, spd:cd.spd, hit:cd.hit, luk:cd.luk,
      sk1Lv:1, sk2Lv:0, sk3Lv:0,
      jobLv:1, jobExp:0, jobExpNext:80, jobPts:0,
      pendPts:0, kills:0,
      potHP:3, potMP:3,
      guardActive:false, glorActive:false,
      defBonus:0
    };
  }

  this.stage=(data&&data.stage)||'town';
  this.acd=0;
  this.bossSpawned=false;
  this.bossKilled={1:false,2:false,3:false,4:false};
  if(data&&data.bossKilled)this.bossKilled=data.bossKilled;

  this.buildMap();
  this.buildPlayer();
  this.buildEnemies();
  this.buildPortals();
  this.buildInput();

  // UIシーンを並列起動
  this.scene.launch('UI',{gameScene:this});
};

// ── マップ構築 ──
GameScene.prototype.buildMap=function(){
  var self=this;
  var TILE=32;
  var mapDef=GameScene.MAPS[this.stage]||GameScene.MAPS[1];
  var MW=mapDef.w, MH=mapDef.h;
  this.mapW=MW*TILE; this.mapH=MH*TILE;

  this.physics.world.setBounds(0,0,this.mapW,this.mapH);
  this.cameras.main.setBounds(0,0,this.mapW,this.mapH);
  this.cameras.main.setBackgroundColor(mapDef.bgColor||0x0a0a1a);

  // タイルを敷く
  for(var ty=0;ty<MH;ty++){
    for(var tx=0;tx<MW;tx++){
      var key=mapDef.tileKey;
      // 外周は壁/崖
      if(tx===0||tx===MW-1||ty===0||ty===MH-1){
        key=mapDef.wallKey||mapDef.altKey||mapDef.tileKey;
      } else {
        var n=(tx*31+ty*17)%100;
        if(mapDef.altKey&&n<12)key=mapDef.altKey;
        else if(mapDef.flowerKey&&n<5)key=mapDef.flowerKey;
      }
      this.add.image(tx*TILE+TILE/2, ty*TILE+TILE/2, key).setDisplaySize(TILE,TILE);
    }
  }

  // オブジェクト配置
  this.obsGroup=this.physics.add.staticGroup();
  if(this.stage===1){
    [[180,120],[500,90],[740,180],[145,400],[900,290],[350,600],[800,540]].forEach(function(p){
      var obj=self.obsGroup.create(p[0],p[1],'tree').setDisplaySize(32,48);
      obj.refreshBody();
    });
    [[305,395],[595,345],[755,98],[205,595]].forEach(function(p){
      var obj=self.obsGroup.create(p[0],p[1],'rock').setDisplaySize(28,22);
      obj.refreshBody();
    });
  } else if(this.stage===3){
    [[120,580],[280,640],[500,660],[720,620],[900,680]].forEach(function(p){
      var obj=self.obsGroup.create(p[0],p[1],'palm').setDisplaySize(32,60);
      obj.refreshBody();
    });
  } else if(this.stage===4){
    [[200,200],[400,300],[600,200],[350,500],[700,400]].forEach(function(p){
      var obj=self.obsGroup.create(p[0],p[1],'barrel').setDisplaySize(28,28);
      obj.refreshBody();
    });
  }
};

// ── プレイヤー構築 ──
GameScene.prototype.buildPlayer=function(){
  var TILE=32;
  var mapDef=GameScene.MAPS[this.stage];
  var startX=(mapDef?mapDef.w/2:19)*TILE;
  var startY=(mapDef?mapDef.h*0.7:20)*TILE;

  this.player=this.physics.add.sprite(startX,startY,this.playerClass);
  this.player.setDisplaySize(56,72);
  this.player.setCollideWorldBounds(true);
  this.player.setDepth(5);
  this.cameras.main.startFollow(this.player,true,0.1,0.1);

  // 障害物との衝突
  this.physics.add.collider(this.player,this.obsGroup);
};

// ── 敵構築 ──
GameScene.prototype.buildEnemies=function(){
  var self=this;
  this.enemies=this.physics.add.group();
  this.drops=this.physics.add.group();

  if(this.stage==='town')return; // 町には敵なし

  var stageNum=parseInt(this.stage)||1;
  var list=STAGE_ENEMIES[stageNum]||STAGE_ENEMIES[1];
  var hm=[1,1,1.5,2.2][stageNum-1]||1;  // HP倍率
  var am=[1,1,1.3,2.0][stageNum-1]||1;  // ATK倍率

  list.forEach(function(e){
    self.spawnEnemy(e.id, e.x, e.y, hm, am);
  });

  // ボス出現タイマー
  if(stageNum>=2&&!this.bossKilled[stageNum]){
    var delay=[0,20000,20000,25000,20000][stageNum]||20000;
    this.time.delayedCall(delay,function(){
      if(self.stage===String(stageNum)&&!self.bossSpawned){
        self.bossSpawned=true;
        var bossId='boss'+Math.min(3,stageNum);
        var bx=self.mapW/2, by=self.mapH/2;
        self.spawnEnemy(bossId,bx,by,1,1,true);
        self.events.emit('bossSpawned');
      }
    });
  }

  // 敵×弾の衝突
  this.bullets=this.physics.add.group();
  this.physics.add.overlap(this.bullets,this.enemies,this.onBulletHit,null,this);
  // 敵×プレイヤー
  this.physics.add.overlap(this.player,this.enemies,this.onPlayerHit,null,this);
  // ドロップ×プレイヤー
  this.physics.add.overlap(this.player,this.drops,this.onPickDrop,null,this);
};

GameScene.prototype.spawnEnemy=function(id,x,y,hm,am,isBoss){
  hm=hm||1; am=am||1;
  var eData=ENEMY_DATA[id];
  if(!eData)return;
  var e=this.enemies.create(x,y,id);
  var scale=eData.sz||1;
  e.setDisplaySize(48*scale, 48*scale);
  e.setCollideWorldBounds(true);
  e.setDepth(4);
  e.eid=id;
  e.hp=Math.floor(eData.hp*hm);
  e.mhp=e.hp;
  e.atk=Math.floor(eData.atk*am);
  e.def=(eData.def||0)+Math.floor(hm-1);
  e.spd=eData.spd;
  e.exp=Math.floor(eData.exp*hm);
  e.gold=Math.floor(eData.gold*hm);
  e.rng=eData.rng||40;
  e.acd=0;
  e.isBoss=isBoss||eData.isBoss||false;
  e.frozen=0;

  // HPバー
  e.hpBg  =this.add.rectangle(x,y-30,40,6,0x111111).setDepth(6);
  e.hpFill=this.add.rectangle(x,y-30,40,6,0x2ecc71).setDepth(7);
  return e;
};

// ── ポータル構築 ──
GameScene.prototype.buildPortals=function(){
  var self=this;
  this.portals=[];

  var stageNum=parseInt(this.stage)||0;
  var portalDefs=[];

  if(this.stage==='town'){
    portalDefs=[{key:'portal_st1',x:this.mapW/2,y:this.mapH-80,to:'1',label:'🌿 野外へ(ST.1)'}];
  } else if(stageNum===1){
    portalDefs=[
      {key:'portal_town',x:this.mapW/2,y:80,to:'town',label:'🏘 町へ'},
      {key:'portal_st2', x:this.mapW-80,y:this.mapH/2,to:'2',label:'⛰ ST.2へ'}
    ];
  } else if(stageNum===2){
    portalDefs=[
      {key:'portal_st1',x:80,y:this.mapH/2,to:'1',label:'← ST.1へ'},
      {key:'portal_st3',x:this.mapW-80,y:this.mapH/2,to:'3',label:'🏖 ST.3へ'}
    ];
  } else if(stageNum===3){
    portalDefs=[
      {key:'portal_st2',x:80,y:this.mapH/2,to:'2',label:'← ST.2へ'},
      {key:'portal_st4',x:this.mapW-80,y:this.mapH/2,to:'4',label:'🏜 ST.4へ'}
    ];
  } else if(stageNum===4){
    portalDefs=[
      {key:'portal_st3',x:80,y:this.mapH/2,to:'3',label:'← ST.3へ'}
    ];
  }

  portalDefs.forEach(function(pd){
    var img=self.add.image(pd.x,pd.y,pd.key).setDisplaySize(64,96).setDepth(3);
    var label=self.add.text(pd.x,pd.y-60,pd.label,{
      fontSize:'10px',fontFamily:'Courier New',color:'#ffffff',
      backgroundColor:'#000000cc',padding:{x:4,y:2}
    }).setOrigin(0.5).setDepth(8);
    // パルス
    self.tweens.add({targets:img,alpha:0.6,duration:800,yoyo:true,repeat:-1});
    self.portals.push({img:img,label:label,to:pd.to,x:pd.x,y:pd.y});
  });
};

// ── 入力 ──
GameScene.prototype.buildInput=function(){
  var self=this;
  this.cursors=this.input.keyboard.createCursorKeys();
  this.wasd=this.input.keyboard.addKeys({
    up:Phaser.Input.Keyboard.KeyCodes.W,
    down:Phaser.Input.Keyboard.KeyCodes.S,
    left:Phaser.Input.Keyboard.KeyCodes.A,
    right:Phaser.Input.Keyboard.KeyCodes.D
  });
  this.keySpace=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  this.keyQ=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
  this.keyE=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  this.keyG=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.G);
  this.keyF=this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.F);

  this.joyActive=false;
  this.joyBase={x:0,y:0};
  this.joyDir={x:0,y:0};

  this.input.on('pointerdown',function(ptr){
    if(ptr.x<GAME_W/2){
      self.joyActive=true;
      self.joyBase={x:ptr.x,y:ptr.y};
    } else {
      self.tryAttack();
    }
  });
  this.input.on('pointermove',function(ptr){
    if(self.joyActive&&ptr.isDown&&ptr.x<GAME_W/2){
      var dx=ptr.x-self.joyBase.x, dy=ptr.y-self.joyBase.y;
      var len=Math.sqrt(dx*dx+dy*dy), maxR=50;
      if(len>maxR){dx=dx/len*maxR;dy=dy/len*maxR;}
      self.joyDir={x:dx/maxR,y:dy/maxR};
    }
  });
  this.input.on('pointerup',function(){
    self.joyActive=false;
    self.joyDir={x:0,y:0};
  });
};

// ── 攻撃 ──
GameScene.prototype.tryAttack=function(){
  if(this.acd>0)return;
  var p=this.player;
  var pd=this.playerData;
  var cls=this.playerClass;

  // 最近くの敵
  var closest=null,minDist=99999;
  this.enemies.getChildren().forEach(function(e){
    if(!e.active)return;
    var d=Phaser.Math.Distance.Between(p.x,p.y,e.x,e.y);
    if(d<minDist){minDist=d;closest=e;}
  });

  var angle=closest?Phaser.Math.Angle.Between(p.x,p.y,closest.x,closest.y):0;

  if(cls==='warrior'){
    this.acd=550;
    if(closest&&minDist<90){
      var dmg=Math.max(1,pd.atk*3+Phaser.Math.Between(0,pd.atk));
      this.damageEnemy(closest,dmg);
      var fx=this.add.image(closest.x,closest.y,'slash_fx').setDisplaySize(52,52).setDepth(10);
      this.time.delayedCall(180,function(){fx.destroy();});
    }
  } else if(cls==='archer'){
    this.acd=420;
    if(pd.sp>=2){
      pd.sp=Math.max(0,pd.sp-2);
      var b=this.bullets.create(p.x,p.y,'arrow').setDisplaySize(28,10).setRotation(angle).setDepth(8);
      this.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle),420,b.body.velocity);
      b.dmg=Math.max(1,pd.atk*2+Math.floor(pd.hit*0.3)+Phaser.Math.Between(0,pd.atk));
      b.lifespan=700;
    }
  } else if(cls==='mage'){
    this.acd=650;
    if(pd.sp>=3){
      pd.sp=Math.max(0,pd.sp-3);
      var b=this.bullets.create(p.x,p.y,'fireball').setDisplaySize(22,22).setDepth(8);
      this.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle),290,b.body.velocity);
      b.dmg=Math.max(1,pd.mag*3+Phaser.Math.Between(0,pd.mag));
      b.lifespan=1100;
    }
  } else if(cls==='bomber'){
    this.acd=620;
    var b=this.bullets.create(p.x,p.y,'bomb').setDisplaySize(26,26).setDepth(8);
    this.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle),220,b.body.velocity);
    b.dmg=Math.max(1,pd.atk*5+pd.mag*3+Phaser.Math.Between(0,pd.atk*2));
    b.lifespan=600;
    b.isBomb=true;
  }
  this.events.emit('statsChanged');
};

// ── SK1スキル ──
GameScene.prototype.useSkill=function(){
  var p=this.player, pd=this.playerData, cls=this.playerClass;
  var cost=CLS_DATA[cls].sksp;
  if(pd.sp<cost){this.popupText(p.x,p.y-40,'SP不足','#3498db');return;}
  pd.sp=Math.max(0,pd.sp-cost);

  var closest=null,minDist=99999;
  this.enemies.getChildren().forEach(function(e){
    if(!e.active)return;
    var d=Phaser.Math.Distance.Between(p.x,p.y,e.x,e.y);
    if(d<minDist){minDist=d;closest=e;}
  });

  if(cls==='warrior'){
    // 烈風斬：周囲の敵を吹き飛ばす
    var self=this;
    var range=130;
    this.enemies.getChildren().forEach(function(e){
      if(!e.active)return;
      var d=Phaser.Math.Distance.Between(p.x,p.y,e.x,e.y);
      if(d<range){
        var dmg=Math.max(1,pd.atk*4+Phaser.Math.Between(0,pd.atk*2));
        self.damageEnemy(e,dmg);
        var ang=Phaser.Math.Angle.Between(p.x,p.y,e.x,e.y);
        self.physics.velocityFromAngle(Phaser.Math.RadToDeg(ang),300,e.body.velocity);
        self.time.delayedCall(300,function(){if(e.active)e.setVelocity(0,0);});
      }
    });
    var fx=this.add.image(p.x,p.y,'shockwave_fx').setDisplaySize(260,260).setDepth(10).setAlpha(0.8);
    this.tweens.add({targets:fx,scaleX:1.5,scaleY:1.5,alpha:0,duration:400,onComplete:function(){fx.destroy();}});
    this.popupText(p.x,p.y-50,'⚔ 烈風斬！','#ffd700');
  } else if(cls==='mage'){
    // 大爆発：広範囲ダメージ
    var self=this;
    var range=200;
    this.enemies.getChildren().forEach(function(e){
      if(!e.active)return;
      var d=Phaser.Math.Distance.Between(p.x,p.y,e.x,e.y);
      if(d<range){
        var dmg=Math.max(1,pd.mag*6+Phaser.Math.Between(0,pd.mag*2));
        self.damageEnemy(e,dmg);
      }
    });
    var fx=this.add.image(p.x,p.y,'explode_fx').setDisplaySize(400,400).setDepth(10).setAlpha(0.9);
    this.tweens.add({targets:fx,scaleX:1.4,scaleY:1.4,alpha:0,duration:500,onComplete:function(){fx.destroy();}});
    this.cameras.main.shake(200,0.012);
    this.popupText(p.x,p.y-50,'💥 大爆発！','#ff4444');
  } else if(cls==='archer'){
    // スピリットアタック：5方向の矢
    if(pd.sp<0){return;}
    var closest2=closest;
    var baseAng=closest2?Phaser.Math.Angle.Between(p.x,p.y,closest2.x,closest2.y):0;
    for(var i=0;i<5;i++){
      var ang=baseAng+(i-2)*0.22;
      var b=this.bullets.create(p.x,p.y,'arrow').setDisplaySize(28,10).setRotation(ang).setDepth(8);
      this.physics.velocityFromAngle(Phaser.Math.RadToDeg(ang),430,b.body.velocity);
      b.dmg=Math.max(1,pd.atk*2+Math.floor(pd.hit*0.3)+Phaser.Math.Between(0,pd.atk));
      b.lifespan=700;
    }
    this.popupText(p.x,p.y-50,'🏹 スピリット！','#27ae60');
  } else if(cls==='bomber'){
    // クラスター爆弾：4方向
    var cnt=4+(pd.sk1Lv||1);
    for(var i=0;i<cnt;i++){
      var ang=i/cnt*Math.PI*2;
      var b=this.bullets.create(p.x,p.y,'bomb').setDisplaySize(22,22).setDepth(8);
      this.physics.velocityFromAngle(Phaser.Math.RadToDeg(ang),200,b.body.velocity);
      b.dmg=Math.max(1,pd.atk*4+pd.mag*2+Phaser.Math.Between(0,pd.atk));
      b.lifespan=520;
      b.isBomb=true;
    }
    this.popupText(p.x,p.y-50,'💥 クラスター！x'+cnt,'#ff8800');
  }
  this.events.emit('statsChanged');
};

// ── 弾ヒット ──
GameScene.prototype.onBulletHit=function(bullet,enemy){
  if(!bullet.active||!enemy.active)return;
  if(bullet.isBomb){
    var self=this,bx=bullet.x,by=bullet.y;
    var fx=this.add.image(bx,by,'explode_fx').setDisplaySize(80,80).setDepth(10);
    this.tweens.add({targets:fx,scaleX:2,scaleY:2,alpha:0,duration:400,onComplete:function(){fx.destroy();}});
    this.cameras.main.shake(120,0.007);
    this.enemies.getChildren().forEach(function(e){
      if(!e.active)return;
      var d=Phaser.Math.Distance.Between(bx,by,e.x,e.y);
      if(d<90){self.damageEnemy(e,Math.floor(bullet.dmg*(1-d/90*0.5)));}
    });
  } else {
    this.damageEnemy(enemy,bullet.dmg||1);
  }
  bullet.destroy();
};

// ── プレイヤーヒット（敵との接触）──
GameScene.prototype.onPlayerHit=function(player,enemy){
  if(!enemy.active||enemy.acd>0)return;
  enemy.acd=enemy.acdMax||1200;
  var pd=this.playerData;
  var dmg=Math.max(1,enemy.atk-pd.def+Phaser.Math.Between(0,3));
  if(pd.guardActive)dmg=Math.max(1,Math.floor(dmg*(1-pd.defBonus/100)));
  pd.hp=Math.max(0,pd.hp-dmg);
  this.popupText(player.x,player.y-30,'-'+dmg,'#e74c3c');
  this.cameras.main.shake(80,0.004);
  this.events.emit('statsChanged');
  if(pd.hp<=0)this.gameOver();
};

// ── ドロップ取得 ──
GameScene.prototype.onPickDrop=function(player,drop){
  if(!drop.active)return;
  var pd=this.playerData;
  if(drop.dtype==='hp'){ pd.potHP=(pd.potHP||0)+1; this.popupText(player.x,player.y-30,'💚 HP+','#27ae60'); }
  if(drop.dtype==='mp'){ pd.potMP=(pd.potMP||0)+1; this.popupText(player.x,player.y-30,'💙 MP+','#2980b9'); }
  drop.destroy();
  this.events.emit('statsChanged');
};

// ── 敵にダメージ ──
GameScene.prototype.damageEnemy=function(enemy,dmg){
  if(!enemy||!enemy.active)return;
  dmg=Math.max(1,Math.floor(dmg));
  // 命中判定
  var pd=this.playerData;
  if(Phaser.Math.Between(0,99)>=Math.min(99,pd.hit)){
    this.popupText(enemy.x,enemy.y-20,'Miss!','#666');
    return;
  }
  // クリティカル
  var isCrit=Phaser.Math.Between(0,99)<Math.min(pd.luk||6,99);
  if(isCrit){dmg=Math.floor(dmg*2); this.popupText(enemy.x,enemy.y-30,'★CRITICAL!! '+dmg,'#ffd700');}
  else{this.popupText(enemy.x,enemy.y-20,'-'+dmg,'#ffffff');}
  enemy.hp-=dmg;
  // フラッシュ
  this.tweens.add({targets:enemy,alpha:0.3,duration:60,yoyo:true});
  if(enemy.hp<=0)this.killEnemy(enemy);
};

GameScene.prototype.killEnemy=function(enemy){
  var pd=this.playerData;
  pd.exp+=enemy.exp; pd.gold+=enemy.gold; pd.kills++;

  // ジョブEXP
  pd.jobExp=(pd.jobExp||0)+Math.floor(enemy.exp*0.6);
  if(pd.jobExp>=(pd.jobExpNext||80)){
    pd.jobExp-=pd.jobExpNext;
    pd.jobLv++;
    pd.jobExpNext=Math.floor(pd.jobExpNext*1.5);
    pd.jobPts++;
    this.popupText(this.player.x,this.player.y-60,'★ JOB UP! Lv'+pd.jobLv,'#00e5ff');
  }

  // ボス撃破
  if(enemy.isBoss){
    var stNum=parseInt(this.stage)||1;
    this.bossKilled[stNum]=true;
    this.events.emit('bossKilled');
    this.popupText(enemy.x,enemy.y-60,'💀 BOSS撃破！','#e74c3c');
    // ドロップ大量
    for(var i=0;i<3;i++){
      var d=this.drops.create(enemy.x+Phaser.Math.Between(-30,30),enemy.y+Phaser.Math.Between(-30,30),i%2===0?'drop_hp':'drop_mp');
      d.setDisplaySize(20,20).setDepth(3);
      d.dtype=i%2===0?'hp':'mp';
    }
  } else {
    // 確率でドロップ
    if(Phaser.Math.Between(0,9)<1){
      var d=this.drops.create(enemy.x,enemy.y,'drop_hp').setDisplaySize(20,20).setDepth(3);
      d.dtype='hp';
    }
    if(Phaser.Math.Between(0,9)<1){
      var d=this.drops.create(enemy.x,enemy.y,'drop_mp').setDisplaySize(20,20).setDepth(3);
      d.dtype='mp';
    }
  }

  // エフェクト
  var fx=this.add.image(enemy.x,enemy.y,'explode_fx').setDisplaySize(48,48).setDepth(10);
  this.tweens.add({targets:fx,scaleX:1.8,scaleY:1.8,alpha:0,duration:300,onComplete:function(){fx.destroy();}});

  // HPバー削除
  if(enemy.hpBg)enemy.hpBg.destroy();
  if(enemy.hpFill)enemy.hpFill.destroy();
  enemy.destroy();

  this.checkLevelUp();
  this.events.emit('statsChanged');

  // 全滅チェック
  if(this.enemies.countActive()===0&&this.stage!=='town'){
    this.time.delayedCall(2000,this.respawnEnemies,[],this);
  }
};

GameScene.prototype.respawnEnemies=function(){
  // 倒した敵を一定数リスポーン
  var stageNum=parseInt(this.stage)||1;
  var list=STAGE_ENEMIES[stageNum]||[];
  var hm=[1,1,1.5,2.2][stageNum-1]||1;
  var am=[1,1,1.3,2.0][stageNum-1]||1;
  var self=this;
  list.slice(0,5).forEach(function(e){
    var ex,ey;
    do{ex=Phaser.Math.Between(64,self.mapW-64);ey=Phaser.Math.Between(64,self.mapH-64);}
    while(Phaser.Math.Distance.Between(ex,ey,self.player.x,self.player.y)<200);
    self.spawnEnemy(e.id,ex,ey,hm,am);
  });
};

// ── レベルアップ ──
GameScene.prototype.checkLevelUp=function(){
  var pd=this.playerData;
  while(pd.exp>=pd.expN){
    pd.exp-=pd.expN;
    pd.lv++;
    pd.expN=Math.floor(pd.expN*1.4);
    pd.pendPts=(pd.pendPts||0)+3;
    pd.mhp+=10; pd.hp=pd.mhp;
    pd.msp+=5;  pd.sp=pd.msp;
    this.popupText(this.player.x,this.player.y-50,'★ LEVEL UP! Lv'+pd.lv,'#ffd700');
    this.events.emit('levelUp');
  }
};

// ── ポーション使用 ──
GameScene.prototype.usePotion=function(type){
  var pd=this.playerData;
  if(type==='hp'){
    if(!pd.potHP||pd.potHP<=0){this.popupText(this.player.x,this.player.y-30,'ポーションなし','#888');return;}
    pd.potHP--;
    pd.hp=Math.min(pd.mhp,pd.hp+50);
    this.popupText(this.player.x,this.player.y-36,'💚 HP+50','#27ae60');
  } else {
    if(!pd.potMP||pd.potMP<=0){this.popupText(this.player.x,this.player.y-30,'ポーションなし','#888');return;}
    pd.potMP--;
    pd.sp=Math.min(pd.msp,pd.sp+50);
    this.popupText(this.player.x,this.player.y-36,'💙 SP+50','#2980b9');
  }
  this.events.emit('statsChanged');
};

// ── ステージ遷移 ──
GameScene.prototype.gotoStage=function(to){
  var self=this;
  // フェードアウト
  this.cameras.main.fadeOut(400,0,0,0);
  this.cameras.main.once('camerafadeoutcomplete',function(){
    self.scene.stop('UI');
    self.scene.start('Game',{
      playerClass:self.playerClass,
      playerData:self.playerData,
      stage:to,
      bossKilled:self.bossKilled
    });
  });
};

// ── ゲームオーバー ──
GameScene.prototype.gameOver=function(){
  var self=this;
  this.physics.pause();
  this.scene.stop('UI');
  var W=GAME_W,H=GAME_H;
  var cam=this.cameras.main;
  var cx=cam.scrollX+W/2, cy=cam.scrollY+H/2;

  this.add.rectangle(cx,cy,W,H,0x000000,0.75).setDepth(40).setScrollFactor(1);
  this.add.text(cx,cy-80,'✕ GAME OVER',{fontSize:'30px',fontFamily:'Courier New',fontStyle:'bold',color:'#e74c3c'})
    .setOrigin(0.5).setDepth(41).setScrollFactor(1);
  this.add.text(cx,cy-40,'Lv.'+this.playerData.lv+'  Gold: '+this.playerData.gold+'  討伐: '+this.playerData.kills,
    {fontSize:'13px',fontFamily:'Courier New',color:'#aaa'}).setOrigin(0.5).setDepth(41).setScrollFactor(1);

  var rb=this.add.text(cx,cy+20,'🏘 もう一度',{fontSize:'18px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffd700'})
    .setOrigin(0.5).setDepth(41).setScrollFactor(1).setInteractive({useHandCursor:true});
  rb.on('pointerdown',function(){
    self.scene.start('Game',{playerClass:self.playerClass,bossKilled:self.bossKilled});
  });

  var tb=this.add.text(cx,cy+70,'◀ タイトルへ',{fontSize:'14px',fontFamily:'Courier New',color:'#555'})
    .setOrigin(0.5).setDepth(41).setScrollFactor(1).setInteractive({useHandCursor:true});
  tb.on('pointerdown',function(){ self.scene.start('Title'); });
};

// ── ポップアップテキスト ──
GameScene.prototype.popupText=function(x,y,text,color){
  var t=this.add.text(x,y,text,{
    fontSize:'13px',fontFamily:'Courier New',fontStyle:'bold',
    color:color||'#ffffff',stroke:'#000000',strokeThickness:3
  }).setOrigin(0.5).setDepth(20);
  this.tweens.add({targets:t,y:y-44,alpha:0,duration:900,ease:'Power2',
    onComplete:function(){t.destroy();}});
};

// ── update ──
GameScene.prototype.update=function(time,delta){
  var p=this.player, pd=this.playerData;
  if(!p||!p.active)return;

  // クールダウン
  if(this.acd>0)this.acd-=delta;

  // 敵のACD更新
  this.enemies.getChildren().forEach(function(e){
    if(e.acd>0)e.acd-=delta;
    if(e.frozen>0)e.frozen-=delta;
  });

  // ── 移動 ──
  var vx=0,vy=0;
  if(this.cursors.left.isDown ||this.wasd.left.isDown) vx=-1;
  if(this.cursors.right.isDown||this.wasd.right.isDown)vx= 1;
  if(this.cursors.up.isDown   ||this.wasd.up.isDown)   vy=-1;
  if(this.cursors.down.isDown ||this.wasd.down.isDown)  vy= 1;
  if(this.joyActive){vx=this.joyDir.x;vy=this.joyDir.y;}
  var len=Math.sqrt(vx*vx+vy*vy);
  if(len>0){vx/=len;vy/=len;}
  p.setVelocity(vx*pd.spd,vy*pd.spd);

  // ── キーボードスキル/ポーション ──
  if(Phaser.Input.Keyboard.JustDown(this.keySpace))this.tryAttack();
  if(Phaser.Input.Keyboard.JustDown(this.keyQ))this.useSkill();
  if(Phaser.Input.Keyboard.JustDown(this.keyG))this.usePotion('hp');
  if(Phaser.Input.Keyboard.JustDown(this.keyF))this.usePotion('mp');

  // SP自然回復
  pd.sp=Math.min(pd.msp,pd.sp+(vx===0&&vy===0?4:1.5)*(delta/1000));

  // ── 弾のライフスパン ──
  this.bullets&&this.bullets.getChildren().forEach(function(b){
    b.lifespan-=delta;
    if(b.lifespan<=0)b.destroy();
  });

  // ── 敵AI ──
  var self=this;
  this.enemies.getChildren().forEach(function(e){
    if(!e.active)return;
    if(e.frozen>0){e.setVelocity(0,0);return;}
    var dx=p.x-e.x,dy=p.y-e.y;
    var dist=Math.sqrt(dx*dx+dy*dy);
    if(dist>e.rng+10){
      e.setVelocity((dx/dist)*e.spd,(dy/dist)*e.spd);
    } else {
      e.setVelocity(0,0);
    }
    // HPバー更新
    if(e.hpBg){
      e.hpBg.setPosition(e.x,e.y-e.displayHeight/2-10);
      var pct=Math.max(0,e.hp/e.mhp);
      var col=pct>0.5?0x2ecc71:pct>0.25?0xf1c40f:0xe74c3c;
      e.hpFill.setFillStyle(col);
      e.hpFill.setPosition(e.x-20+20*pct,e.y-e.displayHeight/2-10);
      e.hpFill.setSize(40*pct,6);
    }
  });

  // ── ポータル判定 ──
  this.portals&&this.portals.forEach(function(po){
    var d=Phaser.Math.Distance.Between(p.x,p.y,po.x,po.y);
    if(d<60){
      self.gotoStage(po.to);
    }
  });
};

// ============================================================
//  UIScene  ─ HUD（GameSceneに重ねて表示）
// ============================================================
function UIScene(){ Phaser.Scene.call(this,{key:'UI'}); }
UIScene.prototype = Object.create(Phaser.Scene.prototype);
UIScene.prototype.constructor = UIScene;

UIScene.prototype.create=function(data){
  var self=this;
  this.gs=data.gameScene;  // GameSceneへの参照
  var W=GAME_W;

  // ── HUD背景 ──
  this.add.rectangle(0,0,W,56,0x05030f).setOrigin(0,0);
  this.add.rectangle(0,56,W,1,0x332200).setOrigin(0,0);

  // ── ステージバッジ ──
  this.stageBadge=this.add.text(8,6,this.getStageLabel(),{
    fontSize:'10px',fontFamily:'Courier New',fontStyle:'bold',color:'#ff8c00',
    backgroundColor:'#ff8c0022',padding:{x:4,y:2}
  });

  // ── Lv ──
  this.lvText=this.add.text(50,6,'Lv.1',{fontSize:'12px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffd700'});

  // ── HPバー ──
  this.add.text(95,6,'HP',{fontSize:'9px',fontFamily:'Courier New',color:'#888'});
  this.add.rectangle(112,12,100,7,0x111111).setOrigin(0,0.5);
  this.hpBar=this.add.rectangle(112,12,100,7,0xe74c3c).setOrigin(0,0.5);
  this.hpText=this.add.text(216,6,'',{fontSize:'9px',fontFamily:'Courier New',color:'#ffaaaa'});

  // ── SPバー ──
  this.add.text(95,22,'SP',{fontSize:'9px',fontFamily:'Courier New',color:'#888'});
  this.add.rectangle(112,28,100,7,0x111111).setOrigin(0,0.5);
  this.spBar=this.add.rectangle(112,28,100,7,0x2980b9).setOrigin(0,0.5);
  this.spText=this.add.text(216,22,'',{fontSize:'9px',fontFamily:'Courier New',color:'#74b9ff'});

  // ── EXPバー ──
  this.add.text(8,40,'EXP',{fontSize:'8px',fontFamily:'Courier New',color:'#666'});
  this.add.rectangle(32,44,120,5,0x111111).setOrigin(0,0.5);
  this.expBar=this.add.rectangle(32,44,0,5,0xf39c12).setOrigin(0,0.5);

  // ── Gold ──
  this.goldText=this.add.text(W-8,6,'G:0',{fontSize:'10px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(1,0);

  // ── ポーション表示 ──
  this.potHpText=this.add.text(W-8,20,'💚×0',{fontSize:'9px',fontFamily:'Courier New',color:'#27ae60'}).setOrigin(1,0);
  this.potMpText=this.add.text(W-8,34,'💙×0',{fontSize:'9px',fontFamily:'Courier New',color:'#2980b9'}).setOrigin(1,0);

  // ── スキル名 ──
  this.skillText=this.add.text(160,40,'',{fontSize:'8px',fontFamily:'Courier New',color:'#74b9ff'});

  // ── ミニマップ ──
  this.miniMapG=this.add.graphics();

  // GameSceneのイベントを購読
  this.gs.events.on('statsChanged',this.updateHUD,this);
  this.gs.events.on('levelUp',this.onLevelUp,this);
  this.gs.events.on('bossSpawned',this.onBossSpawned,this);
  this.gs.events.on('bossKilled',this.onBossKilledEv,this);

  this.updateHUD();
};

UIScene.prototype.getStageLabel=function(){
  var s=this.gs.stage;
  if(s==='town')return 'TOWN';
  return 'ST.'+s;
};

UIScene.prototype.updateHUD=function(){
  var pd=this.gs.playerData;
  if(!pd)return;
  var hpPct=Math.max(0,pd.hp/pd.mhp);
  var spPct=Math.max(0,pd.sp/pd.msp);
  var expPct=Math.max(0,pd.exp/pd.expN);
  this.hpBar.setSize(Math.max(0,100*hpPct),7);
  this.spBar.setSize(Math.max(0,100*spPct),7);
  this.expBar.setSize(Math.max(0,120*expPct),5);
  this.hpText.setText(Math.ceil(pd.hp)+'/'+pd.mhp);
  this.spText.setText(Math.ceil(pd.sp)+'/'+pd.msp);
  this.lvText.setText('Lv.'+pd.lv);
  this.goldText.setText('G:'+pd.gold);
  this.potHpText.setText('💚×'+(pd.potHP||0));
  this.potMpText.setText('💙×'+(pd.potMP||0));
  var cls=this.gs.playerClass;
  this.skillText.setText('[Q]'+CLS_DATA[cls].skn+'  [G]HP  [F]SP');
  this.drawMiniMap();
};

UIScene.prototype.drawMiniMap=function(){
  var g=this.miniMapG;
  g.clear();
  var gs=this.gs;
  if(!gs||!gs.player)return;
  var W=GAME_W,mx=W-75,my=64,mw=68,mh=54;
  g.fillStyle(0x000000,0.6);g.fillRect(mx,my,mw,mh);
  g.lineStyle(1,0x444444,1);g.strokeRect(mx,my,mw,mh);
  var sx=mw/(gs.mapW||800),sy=mh/(gs.mapH||640);
  // プレイヤー
  g.fillStyle(0xffd700,1);
  g.fillCircle(mx+gs.player.x*sx,my+gs.player.y*sy,3);
  // 敵
  gs.enemies&&gs.enemies.getChildren().forEach(function(e){
    if(!e.active)return;
    g.fillStyle(e.isBoss?0xe74c3c:0xff6363,0.8);
    g.fillCircle(mx+e.x*sx,my+e.y*sy,e.isBoss?3:1.5);
  });
  // ポータル
  gs.portals&&gs.portals.forEach(function(po){
    g.fillStyle(0x00e5ff,1);
    g.fillRect(mx+po.x*sx-2,my+po.y*sy-2,4,4);
  });
};

UIScene.prototype.onLevelUp=function(){
  var pd=this.gs.playerData;
  // レベルアップ通知オーバーレイ（簡易）
  var W=GAME_W;
  var banner=this.add.text(W/2,100,'★ LEVEL UP!  Lv.'+pd.lv,{
    fontSize:'22px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffd700',
    stroke:'#ff4400',strokeThickness:2,shadow:{blur:12,color:'#ffd700',fill:true}
  }).setOrigin(0.5);
  this.tweens.add({targets:banner,y:60,alpha:0,duration:2000,ease:'Power2',
    onComplete:function(){banner.destroy();}});
  this.updateHUD();
};

UIScene.prototype.onBossSpawned=function(){
  var W=GAME_W;
  var banner=this.add.text(W/2,200,'⚠ BOSS 出現！',{
    fontSize:'24px',fontFamily:'Courier New',fontStyle:'bold',color:'#e74c3c',
    stroke:'#000',strokeThickness:3
  }).setOrigin(0.5);
  this.tweens.add({targets:banner,y:150,alpha:0,duration:2500,ease:'Power2',
    onComplete:function(){banner.destroy();}});
};

UIScene.prototype.onBossKilledEv=function(){
  var W=GAME_W;
  var banner=this.add.text(W/2,200,'💀 BOSS 撃破！',{
    fontSize:'24px',fontFamily:'Courier New',fontStyle:'bold',color:'#ffd700',
    stroke:'#000',strokeThickness:3
  }).setOrigin(0.5);
  this.tweens.add({targets:banner,y:150,alpha:0,duration:2500,ease:'Power2',
    onComplete:function(){banner.destroy();}});
};

UIScene.prototype.update=function(){
  this.drawMiniMap();
};

// ============================================================
//  起動
// ============================================================
var game = new Phaser.Game(config);
