// ============================================================
//  AURA QUEST - Phaser 3 版  game.js
//  STEP2: プロジェクト骨格
//  GitHub Pages URL: https://lunaseiya.github.io/aura-quest/
// ============================================================

const BASE = 'https://lunaseiya.github.io/aura-quest/';

// ============================================================
//  BootScene: アセット全ロード
// ============================================================
class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    // --- ローディングバー ---
    const w = this.scale.width, h = this.scale.height;
    const bar = this.add.graphics();
    this.load.on('progress', (v) => {
      bar.clear();
      bar.fillStyle(0x222222).fillRect(w*0.1, h/2-10, w*0.8, 20);
      bar.fillStyle(0xffd700).fillRect(w*0.1, h/2-10, w*0.8*v, 20);
    });

    // --- Players ---
    ['warrior','mage','archer','bomber'].forEach(k =>
      this.load.image('player_'+k, BASE+'players/'+k+'.png'));

    // --- Enemies ---
    ['bat','boss1','boss2','boss3','dragon','goblin',
     'sandworm','scorpion','skeleton','slime','troll','wolf'].forEach(k =>
      this.load.image('enemy_'+k, BASE+'enemies/'+k+'.png'));

    // --- Tiles ---
    ['bridge','cliff','cobble','dark_forest','flower','grass',
     'lava','oasis_grass','sand_beach','sand_desert','sea',
     'town_path','town_wall','volcanic','water'].forEach(k =>
      this.load.image('tile_'+k, BASE+'tiles/'+k+'.png'));

    // --- Objects ---
    ['barrel','desert_rock','lava_rock','palm','rock','tree'].forEach(k =>
      this.load.image('obj_'+k, BASE+'objects/'+k+'.png'));

    // --- Portals ---
    ['portal_st1','portal_st2','portal_st3','portal_st4','portal_town'].forEach(k =>
      this.load.image(k, BASE+'portals/'+k+'.png'));

    // --- Projectiles ---
    ['arrow','bigbomb','bomb','fireball','hyperbomb','vortexball'].forEach(k =>
      this.load.image('proj_'+k, BASE+'projectiles/'+k+'.png'));

    // --- Effects ---
    ['explosion','freeze','shockwave','slash'].forEach(k =>
      this.load.image('fx_'+k, BASE+'effects/'+k+'.png'));

    // --- Drops ---
    ['hp_potion','mp_potion'].forEach(k =>
      this.load.image('drop_'+k, BASE+'drops/'+k+'.png'));
  }

  create() {
    this.scene.start('Title');
  }
}

// ============================================================
//  TitleScene: タイトル画面
// ============================================================
class TitleScene extends Phaser.Scene {
  constructor() { super('Title'); }

  create() {
    const w = this.scale.width, h = this.scale.height;

    // 背景
    this.add.rectangle(0, 0, w, h, 0x0a1020).setOrigin(0);

    // タイトル文字
    this.add.text(w/2, h*0.3, 'AURA QUEST', {
      fontSize: '48px',
      fontFamily: 'Courier New',
      color: '#ffd700',
      stroke: '#ff8c00',
      strokeThickness: 4
    }).setOrigin(0.5);

    this.add.text(w/2, h*0.45, '- Press to Start -', {
      fontSize: '20px',
      fontFamily: 'Courier New',
      color: '#aaaaaa'
    }).setOrigin(0.5);

    // キャラ選択へ
    this.input.once('pointerdown', () => this.scene.start('ClassSelect'));
    this.input.keyboard.once('keydown', () => this.scene.start('ClassSelect'));
  }
}

// ============================================================
//  ClassSelectScene: 職業選択
// ============================================================
class ClassSelectScene extends Phaser.Scene {
  constructor() { super('ClassSelect'); }

  create() {
    const w = this.scale.width, h = this.scale.height;
    this.add.rectangle(0, 0, w, h, 0x060010).setOrigin(0);

    this.add.text(w/2, 40, '⚔ 職業を選ぼう ⚔', {
      fontSize: '24px', fontFamily: 'Courier New', color: '#ffd700'
    }).setOrigin(0.5);

    const classes = [
      { key: 'warrior', name: '剣士',    desc: '近接・高耐久・パリィ', col: 0xe74c3c },
      { key: 'mage',    name: 'マジャン', desc: '広範囲魔法・凍結',     col: 0x9b59b6 },
      { key: 'archer',  name: 'アーチャー', desc: '高速遠距離・多方向射撃', col: 0x27ae60 },
      { key: 'bomber',  name: 'ボマー',   desc: '爆弾投擲・範囲爆発',   col: 0xf39c12 },
    ];

    classes.forEach((cls, i) => {
      const x = w/2 + (i < 2 ? (i === 0 ? -140 : 140) : (i === 2 ? -140 : 140));
      const y = h/2 + (i < 2 ? -80 : 80);

      // カード背景
      const card = this.add.rectangle(x, y, 240, 130, cls.col, 0.15)
        .setInteractive({ useHandCursor: true })
        .setStrokeStyle(2, cls.col);

      // キャラ画像
      const img = this.add.image(x - 70, y, 'player_'+cls.key)
        .setDisplaySize(72, 90);

      // テキスト
      this.add.text(x + 10, y - 28, cls.name, {
        fontSize: '18px', fontFamily: 'Courier New',
        color: '#' + cls.col.toString(16).padStart(6,'0')
      });
      this.add.text(x + 10, y - 4, cls.desc, {
        fontSize: '11px', fontFamily: 'Courier New', color: '#aaaaaa',
        wordWrap: { width: 130 }
      });

      // クリックで冒険開始
      card.on('pointerover', () => card.setFillStyle(cls.col, 0.3));
      card.on('pointerout',  () => card.setFillStyle(cls.col, 0.15));
      card.on('pointerdown', () => {
        this.scene.start('Game', { playerClass: cls.key });
      });
    });
  }
}

// ============================================================
//  GameScene: メインゲーム（骨格のみ）
// ============================================================
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(data) {
    this.playerClass = data.playerClass || 'warrior';
    this.stage = data.stage || 1;
  }

  create() {
    const w = this.scale.width, h = this.scale.height;

    // 仮の背景
    this.add.rectangle(0, 0, w, h, 0x1a3a1a).setOrigin(0);

    // プレイヤースプライト（仮配置）
    this.player = this.physics.add.sprite(w/2, h/2, 'player_'+this.playerClass)
      .setDisplaySize(48, 60)
      .setCollideWorldBounds(true);

    // カーソルキー
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys('W,A,S,D');

    // ステージ表示
    this.add.text(10, 10, 'ST.' + this.stage + ' | ' + this.playerClass, {
      fontSize: '14px', fontFamily: 'Courier New', color: '#ffd700'
    });

    // TODO: STEP3以降で本格的なシーン移植
    this.add.text(w/2, h - 30, '← →↑↓ / WASD で移動 (STEP2骨格)', {
      fontSize: '12px', fontFamily: 'Courier New', color: '#666666'
    }).setOrigin(0.5);
  }

  update() {
    if (!this.player) return;
    const spd = 160;
    const vx = (this.cursors.left.isDown  || this.wasd.A.isDown) ? -spd
              : (this.cursors.right.isDown || this.wasd.D.isDown) ?  spd : 0;
    const vy = (this.cursors.up.isDown    || this.wasd.W.isDown) ? -spd
              : (this.cursors.down.isDown  || this.wasd.S.isDown) ?  spd : 0;
    this.player.setVelocity(vx, vy);
  }
}

// ============================================================
//  Phaser 起動設定
// ============================================================
const config = {
  type: Phaser.AUTO,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 800,
    height: 600,
  },
  backgroundColor: '#000000',
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  },
  scene: [BootScene, TitleScene, ClassSelectScene, GameScene]
};

new Phaser.Game(config);