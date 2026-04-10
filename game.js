// ============================================================
//  AURA QUEST - Phaser 3 版  game.js
//  STEP3-A: タウンシーン移植
// ============================================================

const BASE = 'https://lunaseiya.github.io/aura-quest/';
const TILE = 32;

// ============================================================
//  BootScene
// ============================================================
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const w = this.scale.width, h = this.scale.height;
    this.add.rectangle(0,0,w,h,0x000000).setOrigin(0);
    const barBg = this.add.rectangle(w*0.1, h/2-10, w*0.8, 20, 0x222222).setOrigin(0);
    const bar   = this.add.rectangle(w*0.1, h/2-10, 0,     20, 0xffd700).setOrigin(0);
    const txt   = this.add.text(w/2, h/2+20, 'Loading...', {
      fontSize:'14px', fontFamily:'Courier New', color:'#aaaaaa'
    }).setOrigin(0.5);
    this.load.on('progress', v => bar.setSize(w*0.8*v, 20));
    this.load.on('fileprogress', f => txt.setText(f.key));

    // Players
    ['warrior','mage','archer','bomber'].forEach(k =>
      this.load.image('player_'+k, BASE+'players/'+k+'.png'));
    // Enemies
    ['bat','boss1','boss2','boss3','dragon','goblin',
     'sandworm','scorpion','skeleton','slime','troll','wolf'].forEach(k =>
      this.load.image('enemy_'+k, BASE+'enemies/'+k+'.png'));
    // Tiles
    ['bridge','cliff','cobble','dark_forest','flower','grass',
     'lava','oasis_grass','sand_beach','sand_desert','sea',
     'town_path','town_wall','volcanic','water'].forEach(k =>
      this.load.image('tile_'+k, BASE+'tiles/'+k+'.png'));
    // Objects
    ['barrel','desert_rock','lava_rock','palm','rock','tree'].forEach(k =>
      this.load.image('obj_'+k, BASE+'objects/'+k+'.png'));
    // Portals
    ['portal_st1','portal_st2','portal_st3','portal_st4','portal_town'].forEach(k =>
      this.load.image(k, BASE+'portals/'+k+'.png'));
    // Projectiles
    ['arrow','bigbomb','bomb','fireball','hyperbomb','vortexball'].forEach(k =>
      this.load.image('proj_'+k, BASE+'projectiles/'+k+'.png'));
    // Effects
    ['explosion','freeze','shockwave','slash'].forEach(k =>
      this.load.image('fx_'+k, BASE+'effects/'+k+'.png'));
    // Drops
    ['hp_potion','mp_potion'].forEach(k =>
      this.load.image('drop_'+k, BASE+'drops/'+k+'.png'));
  }

  create() { this.scene.start('Title'); }
}

// ============================================================
//  TitleScene
// ============================================================
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }
  create() {
    const w = this.scale.width, h = this.scale.height;
    this.add.rectangle(0,0,w,h,0x0a1020).setOrigin(0);
    this.add.text(w/2, h*0.3, 'AURA QUEST', {
      fontSize:'48px', fontFamily:'Courier New',
      color:'#ffd700', stroke:'#ff8c00', strokeThickness:4
    }).setOrigin(0.5);
    this.add.text(w/2, h*0.45, '- Press to Start -', {
      fontSize:'20px', fontFamily:'Courier New', color:'#aaaaaa'
    }).setOrigin(0.5);
    this.input.once('pointerdown', () => this.scene.start('ClassSelect'));
    this.input.keyboard.once('keydown', () => this.scene.start('ClassSelect'));
  }
}

// ============================================================
//  ClassSelectScene
// ============================================================
class ClassSelectScene extends Phaser.Scene {
  constructor() { super('ClassSelect'); }
  create() {
    const w = this.scale.width, h = this.scale.height;
    this.add.rectangle(0,0,w,h,0x060010).setOrigin(0);
    this.add.text(w/2, 40, '⚔ 職業を選ぼう ⚔', {
      fontSize:'24px', fontFamily:'Courier New', color:'#ffd700'
    }).setOrigin(0.5);

    const classes = [
      { key:'warrior', name:'剣士',      desc:'近接・高耐久・パリィ',     col:0xe74c3c, x:-180, y:-60 },
      { key:'mage',    name:'マジャン',   desc:'広範囲魔法・凍結',         col:0x9b59b6, x: 180, y:-60 },
      { key:'archer',  name:'アーチャー', desc:'高速遠距離・多方向射撃',   col:0x27ae60, x:-180, y: 80 },
      { key:'bomber',  name:'ボマー',     desc:'爆弾投擲・範囲爆発',       col:0xf39c12, x: 180, y: 80 },
    ];

    classes.forEach(cls => {
      const cx = w/2 + cls.x, cy = h/2 + cls.y;
      const card = this.add.rectangle(cx, cy, 300, 120, cls.col, 0.15)
        .setInteractive({ useHandCursor:true })
        .setStrokeStyle(2, cls.col);
      this.add.image(cx - 100, cy, 'player_'+cls.key).setDisplaySize(64, 80);
      this.add.text(cx - 30, cy - 22, cls.name, {
        fontSize:'18px', fontFamily:'Courier New',
        color:'#'+cls.col.toString(16).padStart(6,'0')
      });
      this.add.text(cx - 30, cy + 2, cls.desc, {
        fontSize:'11px', fontFamily:'Courier New', color:'#aaaaaa'
      });
      card.on('pointerover', () => card.setFillStyle(cls.col, 0.3));
      card.on('pointerout',  () => card.setFillStyle(cls.col, 0.15));
      card.on('pointerdown', () => {
        // プレイヤーデータを初期化してタウンへ
        const playerData = makePlayerData(cls.key);
        this.scene.start('Town', { playerData });
      });
    });
  }
}

// ============================================================
//  プレイヤーデータ初期化
// ============================================================
function makePlayerData(cls) {
  const base = {
    warrior: { hp:110, sp:60, atk:6, def:6, mag:5, spd:180 },
    mage:    { hp:90,  sp:70, atk:5, def:4, mag:8, spd:160 },
    archer:  { hp:100, sp:65, atk:6, def:5, mag:5, spd:200 },
    bomber:  { hp:95,  sp:80, atk:8, def:4, mag:6, spd:170 },
  }[cls];
  return {
    cls,
    hp: base.hp, mhp: base.hp,
    sp: base.sp, msp: base.sp,
    atk: base.atk, def: base.def, mag: base.mag,
    spd: base.spd,
    lv: 1, exp: 0, expNext: 100,
    gold: 0,
    potHP: 3, potMP: 3,
    kills: 0,
  };
}

// ============================================================
//  TownScene: 町
// ============================================================
class TownScene extends Phaser.Scene {
  constructor() { super('Town'); }

  init(data) {
    this.playerData = data.playerData;
  }

  create() {
    const TOWN_W = 1200, TOWN_H = 800;
    this.TOWN_W = TOWN_W; this.TOWN_H = TOWN_H;

    // カメラ設定
    this.cameras.main.setBounds(0, 0, TOWN_W, TOWN_H);
    this.physics.world.setBounds(0, 0, TOWN_W, TOWN_H);

    // ── タイルマップを手動生成 ──
    const cols = Math.ceil(TOWN_W / TILE), rows = Math.ceil(TOWN_H / TILE);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let key = 'tile_cobble';
        if (c < 3 || c > cols-4 || r < 3 || r > rows-4) key = 'tile_town_wall';
        else if (r >= rows-4) key = 'tile_town_path';
        this.add.image(c*TILE+16, r*TILE+16, key)
          .setDisplaySize(TILE, TILE);
      }
    }

    // ── 建物 ──
    this.buildings = [
      { x:100, y:80,  w:180, h:130, label:'🏨 宿屋',   type:'inn',        col:0x5c3317 },
      { x:400, y:80,  w:200, h:140, label:'🏪 ショップ', type:'shop',       col:0x1a4a8a },
      { x:750, y:80,  w:180, h:130, label:'⚔ ギルド',  type:'guild',      col:0x4a1a1a },
      { x:150, y:400, w:160, h:120, label:'🔨 鍛冶屋',  type:'blacksmith', col:0x2a2a2a },
      { x:600, y:380, w:200, h:150, label:'🔮 魔法店',  type:'magic',      col:0x1a0a3a },
    ];

    this.buildingSprites = [];
    this.buildings.forEach(b => {
      // 建物本体
      const rect = this.add.rectangle(b.x + b.w/2, b.y + b.h/2, b.w, b.h,
        b.col).setStrokeStyle(2, 0x888888);
      // ラベル
      this.add.text(b.x + b.w/2, b.y + b.h - 16, b.label, {
        fontSize:'12px', fontFamily:'Courier New', color:'#ffd700'
      }).setOrigin(0.5);
      // インタラクション範囲（透明ゾーン）
      const zone = this.add.zone(b.x + b.w/2, b.y + b.h/2, b.w+60, b.h+60)
        .setInteractive();
      this.buildingSprites.push({ ...b, zone });
    });

    // ── ポータル（野外へ）──
    this.portal = this.add.image(TOWN_W/2, TOWN_H - 160, 'portal_st1')
      .setDisplaySize(96, 64);
    this.add.text(TOWN_W/2, TOWN_H - 110, '🌿 野外へ (ST.1)', {
      fontSize:'12px', fontFamily:'Courier New', color:'#2ecc71'
    }).setOrigin(0.5);

    // ── プレイヤー ──
    this.player = this.physics.add.sprite(200, 300, 'player_'+this.playerData.cls)
      .setDisplaySize(48, 60)
      .setCollideWorldBounds(true);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // ── 入力 ──
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // ── HUD ──
    this.createHUD();

    // ── インタラクションメッセージ ──
    this.msgText = this.add.text(0, 0, '', {
      fontSize:'11px', fontFamily:'Courier New',
      color:'#ffffff', backgroundColor:'#000000cc',
      padding:{ x:6, y:4 }
    }).setDepth(10).setScrollFactor(0).setVisible(false);

    // ── Eキーでインタラクション ──
    this.input.keyboard.on('keydown-E', () => this.tryInteract());
  }

  createHUD() {
    const pd = this.playerData;
    // HUD背景
    this.add.rectangle(0, 0, 220, 70, 0x000000, 0.7)
      .setOrigin(0).setScrollFactor(0).setDepth(10);

    this.hudHPBar = this.add.rectangle(40, 14, 160*(pd.hp/pd.mhp), 10, 0x2ecc71)
      .setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.rectangle(40, 14, 160, 10, 0x000000, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(10)
      .setStrokeStyle(1, 0x444444);

    this.hudSPBar = this.add.rectangle(40, 30, 160*(pd.sp/pd.msp), 10, 0x3498db)
      .setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.rectangle(40, 30, 160, 10, 0x000000, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(10)
      .setStrokeStyle(1, 0x444444);

    this.add.text(2, 12, 'HP', {fontSize:'9px', fontFamily:'Courier New', color:'#2ecc71'})
      .setScrollFactor(0).setDepth(11);
    this.add.text(2, 28, 'SP', {fontSize:'9px', fontFamily:'Courier New', color:'#3498db'})
      .setScrollFactor(0).setDepth(11);

    this.hudGold = this.add.text(4, 46, '💰 '+pd.gold+'G', {
      fontSize:'11px', fontFamily:'Courier New', color:'#ffd700'
    }).setScrollFactor(0).setDepth(11);

    this.hudStage = this.add.text(this.scale.width - 4, 4, 'TOWN', {
      fontSize:'12px', fontFamily:'Courier New', color:'#ffd700'
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(11);

    // [E]ヒント
    this.hintText = this.add.text(this.scale.width/2, this.scale.height - 24,
      '', { fontSize:'12px', fontFamily:'Courier New', color:'#ffffff',
        backgroundColor:'#00000088', padding:{x:6,y:3}
      }).setOrigin(0.5).setScrollFactor(0).setDepth(11);
  }

  tryInteract() {
    const p = this.player;
    // ポータルチェック
    const pd = Phaser.Math.Distance.Between(p.x, p.y, this.TOWN_W/2, this.TOWN_H-160);
    if (pd < 80) {
      this.scene.start('Game', { playerData: this.playerData, stage: 1 });
      return;
    }
    // 建物チェック
    for (const b of this.buildings) {
      const dx = Math.abs(p.x - (b.x+b.w/2));
      const dy = Math.abs(p.y - (b.y+b.h/2));
      if (dx < b.w/2+40 && dy < b.h/2+40) {
        this.openBuilding(b);
        return;
      }
    }
  }

  openBuilding(b) {
    // 簡易ダイアログ（今後UIシーンで本格実装）
    const w = this.scale.width, h = this.scale.height;
    const msg = {
      inn:        '🏨 宿屋\nHP・SP全回復！(30G)\n[Y]泊まる  [N]やめる',
      shop:       '🏪 ショップ\nHP回復薬 30G\nMP回復薬 25G',
      blacksmith: '🔨 鍛冶屋\n鉄の剣 80G(ATK+8)\n革の鎧 70G(DEF+5)',
      magic:      '🔮 魔法店\n魔法の杖 90G(MAG+8)\n幸運の指輪 100G',
      guild:      '⚔ ギルド\n(準備中)',
    }[b.type] || '(準備中)';

    this.msgText.setText(msg)
      .setPosition(w/2 - 100, h/2 - 60)
      .setVisible(true);

    // 宿屋だけ簡易実装
    if (b.type === 'inn') {
      this.input.keyboard.once('keydown-Y', () => {
        if (this.playerData.gold >= 30) {
          this.playerData.gold -= 30;
          this.playerData.hp = this.playerData.mhp;
          this.playerData.sp = this.playerData.msp;
          this.playerData.potHP = (this.playerData.potHP||0) + 3;
          this.playerData.potMP = (this.playerData.potMP||0) + 3;
          this.updateHUD();
          this.msgText.setText('🏨 完全回復！\nポーション3本補充！').setVisible(true);
          this.time.delayedCall(1500, () => this.msgText.setVisible(false));
        } else {
          this.msgText.setText('💰 お金が足りない！').setVisible(true);
          this.time.delayedCall(1200, () => this.msgText.setVisible(false));
        }
      });
    }
    this.input.keyboard.once('keydown-N', () => this.msgText.setVisible(false));
    this.input.keyboard.once('keydown-ESC', () => this.msgText.setVisible(false));
  }

  updateHUD() {
    const pd = this.playerData;
    this.hudHPBar.setSize(160*(pd.hp/pd.mhp), 10);
    this.hudSPBar.setSize(160*(pd.sp/pd.msp), 10);
    this.hudGold.setText('💰 '+pd.gold+'G');
  }

  update() {
    const p = this.player, pd = this.playerData;
    const spd = pd.spd;
    const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.S.isDown;

    p.setVelocity(
      left ? -spd : right ? spd : 0,
      up   ? -spd : down  ? spd : 0
    );

    // 近くの建物・ポータルを検出して[E]ヒント表示
    let nearLabel = '';
    for (const b of this.buildings) {
      const dx = Math.abs(p.x-(b.x+b.w/2)), dy = Math.abs(p.y-(b.y+b.h/2));
      if (dx < b.w/2+50 && dy < b.h/2+50) { nearLabel = '[E] '+b.label; break; }
    }
    const pd2 = Phaser.Math.Distance.Between(p.x, p.y, this.TOWN_W/2, this.TOWN_H-160);
    if (pd2 < 80) nearLabel = '[E] 野外へ出発';
    this.hintText.setText(nearLabel);
  }
}

// ============================================================
//  GameScene: フィールド戦闘（ST.1〜）骨格
// ============================================================
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    this.playerData = data.playerData || makePlayerData('warrior');
    this.stage = data.stage || 1;
  }

  create() {
    const w = this.scale.width, h = this.scale.height;
    this.add.rectangle(0,0,w,h,0x1a3a1a).setOrigin(0);

    this.player = this.physics.add.sprite(w/2, h/2, 'player_'+this.playerData.cls)
      .setDisplaySize(48,60).setCollideWorldBounds(true);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    this.add.text(10, 10, 'ST.'+this.stage+' | '+this.playerData.cls, {
      fontSize:'14px', fontFamily:'Courier New', color:'#ffd700'
    }).setScrollFactor(0);

    // 町に戻る（Tキー）
    this.add.text(w/2, h-24, '[T] 町へ戻る  ← →↑↓ / WASD 移動', {
      fontSize:'11px', fontFamily:'Courier New', color:'#666666'
    }).setOrigin(0.5).setScrollFactor(0);

    this.input.keyboard.on('keydown-T', () => {
      this.scene.start('Town', { playerData: this.playerData });
    });
  }

  update() {
    const spd = this.playerData.spd;
    const left  = this.cursors.left.isDown  || this.wasd.A.isDown;
    const right = this.cursors.right.isDown || this.wasd.D.isDown;
    const up    = this.cursors.up.isDown    || this.wasd.W.isDown;
    const down  = this.cursors.down.isDown  || this.wasd.S.isDown;
    this.player.setVelocity(
      left ? -spd : right ? spd : 0,
      up   ? -spd : down  ? spd : 0
    );
  }
}

// ============================================================
//  Phaser 起動
// ============================================================
new Phaser.Game({
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800, height: 600,
  },
  backgroundColor: '#000000',
  physics: { default:'arcade', arcade:{ gravity:{y:0}, debug:false } },
  scene: [BootScene, TitleScene, ClassSelectScene, TownScene, GameScene]
});