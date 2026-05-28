// ============================================================
//  LUNA FRONTIER (ルナフロンティア) - Phaser 3  game.js
//  STEP7: ①ステータス割り振り ②職業別通常攻撃 ③命中/クリティカル
// ============================================================
const GAME_VERSION = '2026-05-28-v1'; // 更新日付
console.log('%c🌙 LUNA FRONTIER ' + GAME_VERSION, 'color:#ffcc88;font-size:14px;font-weight:bold;');
const BASE='https://lunaseiya.github.io/aura-quest/';
const TILE=32;

// ============================================================
//  BGM / SE
// ============================================================
let audioCtx=null,muted=false,testMode=false;

// ══════════════════════════════════════
//  セーブ・ロードシステム
// ══════════════════════════════════════
const SAVE_KEY='aq_save_';
const SAVE_SLOTS=3;
function getSaveData(slot){
  try{
    const raw=localStorage.getItem(SAVE_KEY+slot);
    return raw?JSON.parse(raw):null;
  }catch(e){return null;}
}
function setSaveData(slot,data){
  try{localStorage.setItem(SAVE_KEY+slot,JSON.stringify(data));}catch(e){}
}

// playerData をセーブ用にクリーンアップ(Phaserオブジェクト・一時状態を除外)
function sanitizePlayerData(pd){
  // _ で始まる runtime 用フィールドは保存対象外
  // ただしバフ・覚醒状態など保存したいものは個別に許可
  const KEEP_UNDERSCORE = new Set([
    '_hasBerserk','_hasMeteoorm','_hasBoostAtk','_hasBomberPower','_hasHardProtect',
    '_hasGloriousShot','_hasBlazeBlade','_hasFreeze','_hasMultishot','_hasVulcan',
    '_jobUnlocks',
    // 注: _preAwakeStats, _awakAura, _awakLightnings, _samuraiCounterRing, _allCritRing 等は意図的に除外
  ]);
  const out = {};
  Object.keys(pd).forEach(k=>{
    const v = pd[k];
    // _ から始まるキーで KEEP_UNDERSCORE にないものはスキップ
    if(k.startsWith('_') && !KEEP_UNDERSCORE.has(k)) return;
    // 関数・undefinedはスキップ
    if(typeof v === 'function' || typeof v === 'undefined') return;
    // Phaser オブジェクト判定(scene プロパティを持つ・displayList を持つ・destroy メソッドがある等)
    if(v && typeof v === 'object'){
      if(v.scene || v.displayList || typeof v.destroy === 'function'){
        return; // Phaser オブジェクトは除外
      }
    }
    // それ以外はそのまま保存
    out[k] = v;
  });
  return out;
}
function deleteSaveData(slot){
  try{localStorage.removeItem(SAVE_KEY+slot);}catch(e){}
}
function makeSaveSummary(pd,stage){
  const stageNames={
    0:'🏘 セントラル',
    1:'🌳 ST.1 草原', 2:'🌲 ST.2 流れる森', 3:'🏖 ST.3 海岸',
    4:'🏜 ST.4 海と砂漠の境', 5:'🏛 ST.5 砂漠の集落跡', 6:'💀 ST.6 砂漠の果て',
    7:'⛰ ST.7 天空への路', 8:'☁ ST.8 天空の島々',
    9:'🌈 ST.9 虹の道',
    13:'🌈 ST.13 虹の道 II',
    10:'⚔ DUN.1 地下迷宮',
    11:'⛏ DUN.2 炭鉱1F',
    12:'⛏ DUN.2 炭鉱2F',
    20:'🪓 ゴブリンの集落',
    21:'🔥 ブレイズフォージ',
  };
  const clsNames={novice:'ノービス',warrior:'剣士',mage:'マジシャン',archer:'アーチャー',bomber:'ボマー'};
  return {
    cls:pd.cls, lv:pd.lv, gold:pd.gold,
    stage, stageName:stageNames[stage]||'ST.'+stage,
    clsName:clsNames[pd.cls]||pd.cls,
    savedAt:new Date().toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
  };
}

function getAC(){
  if(!audioCtx){try{audioCtx=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}};
  if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();
  return audioCtx;
}

// ── BGMシステム（MP3 + Web Audio合成）────────────
let _bgmAudio=null,_bgmKey=null;
let _bgmNodes=[]; // 合成BGMのノード群
let _bgmLoopTimer=null; // 合成BGMのループタイマー

// MP3ファイルのマッピング（存在するもののみ）
const BGM_FILES={
  // タイトル・町
  title:       BASE+'bgm/bgm_title.mp3',
  central:     BASE+'bgm/bgm_central.mp3',
  blaze_forge: BASE+'bgm/bgm_blaze_forge.mp3',
  desert_town: BASE+'bgm/bgm_desert.mp3',
  // 草原・森系(東エリア)
  east:        BASE+'bgm/bgm_east.mp3',
  // 南エリア(街道・ゴブリン集落)
  south:       BASE+'bgm/bgm_south.mp3',
  // 海・砂漠
  desert:      BASE+'bgm/bgm_desert.mp3',
  // 天空
  sky:         BASE+'bgm/bgm_sky.mp3',
  // ダンジョン
  dungeon1:    BASE+'bgm/bgm_dungeon1.mp3',
  mine:        BASE+'bgm/bgm_mine.mp3',
  // 桜エリア
  sakura_load: BASE+'bgm/bgm_sakuraload.mp3',  // 桜の里
  sakura_dun:  BASE+'bgm/bgm_sakuradun.mp3',   // 桜の城
  // ボス戦
  boss:        BASE+'bgm/bgm_boss.mp3',
};

// ── 合成BGMは削除済み(無音フォールバック) ──────────
// MP3が鳴らない場合は無音のままにする(合成カバー音楽は不要)
function _stopSynthBGM(){
  // スタブ: 何もしない(_bgmNodesは常に空)
}


// シーン切替などで連続呼び出された場合のチャタリング防止用
let _bgmStartId = 0;

function startBGM(key){
  // 同じキーで再生指示が来た場合の処理
  // 実際に「現在鳴っているか」を厳密にチェック
  if(_bgmKey===key && !muted){
    // 既に MP3 が正常再生中なら継続(何もしない)
    if(_bgmAudio && !_bgmAudio.paused && !_bgmAudio.ended && _bgmAudio.readyState >= 2){
      return;
    }
    // 合成BGMが鳴っていれば継続
    if(_bgmNodes.length>0) return;
    // ↓ どちらでもなければ、_bgmKey は同じでも実体が消えているので作り直す(fallthrough)
  }
  // 既存BGM停止(必ずクリーンアップ)
  if(_bgmAudio){
    try{
      _bgmAudio.pause();
      _bgmAudio.currentTime=0;
      _bgmAudio.src='';   // 完全に解放
      _bgmAudio.load();
    }catch(e){}
    _bgmAudio=null;
  }
  _stopSynthBGM();
  _bgmKey=key;
  if(muted)return;
  if(!key)return;
  // AudioContext を起こす(ブラウザ自動再生制限対応)
  // resume() を呼ぶだけでなく、完了を待ってからplay()するため
  // Promise を後の処理で利用
  let acResumePromise = Promise.resolve();
  try{
    const ac=getAC();
    if(ac && ac.state==='suspended'){
      const p = ac.resume();
      if(p && p.then){
        acResumePromise = p.catch(()=>{});
      }
    }
  }catch(e){}
  // この呼び出し固有のID(後発のstartBGMで上書きされたら以下の非同期処理を中断)
  const myId = ++_bgmStartId;
  // MP3があればMP3を優先
  const file=BGM_FILES[key];
  if(file){
    try{
      const audio=new Audio(file);
      audio.loop=true;
      audio.volume=0.10;
      audio.preload='auto';
      // ループ失敗時の保険(端末によってはlooping=trueが効かない場合あり)
      audio.addEventListener('ended', ()=>{
        if(_bgmAudio===audio && !muted){
          try{audio.currentTime=0; audio.play().catch(()=>{});}catch(e){}
        }
      });
      // エラー時は合成BGMにフォールバック
      audio.addEventListener('error', ()=>{
        if(_bgmAudio===audio){
          console.warn('[BGM] MP3 error event, falling back to synth', key);
          _bgmAudio=null;
          if(myId === _bgmStartId) _fallbackSynth(key);
        }
      });
      // 再生失敗時はリトライ → それでも失敗なら合成BGMにフォールバック
      const tryPlay = (retriesLeft)=>{
        // AudioContextの resume 完了を待ってから play
        acResumePromise.then(()=>{
          if(_bgmAudio!==audio || myId !== _bgmStartId) return;
          const playPromise=audio.play();
          if(playPromise && playPromise.catch){
            playPromise.catch((err)=>{
              if(retriesLeft > 0 && _bgmAudio===audio && myId === _bgmStartId){
                // 300ms 後にもう一度トライ(AudioContext 復帰待ち)
                setTimeout(()=>{
                  if(_bgmAudio===audio && myId === _bgmStartId){
                    try{
                      const ac=getAC();
                      if(ac && ac.state==='suspended') ac.resume();
                    }catch(e){}
                    tryPlay(retriesLeft - 1);
                  }
                }, 300);
                return;
              }
              console.warn('[BGM] MP3 play failed after retries, falling back to synth', key, err);
              if(_bgmAudio===audio){
                _bgmAudio=null;
                if(myId === _bgmStartId) _fallbackSynth(key);
              }
            });
          }
        });
      };
      _bgmAudio=audio;
      tryPlay(3);  // 最大3回リトライ(計4回試行)
    }catch(e){
      console.warn('[BGM] MP3 load failed, fallback', key, e);
      if(myId === _bgmStartId) _fallbackSynth(key);
    }
    return;
  }
  // 合成BGM
  _fallbackSynth(key);
}

// 合成BGMフォールバック
function _fallbackSynth(key){
  // 合成BGMは削除されました。MP3が鳴らない場合は無音のままにします。
  // (合成のカバー音楽はクオリティが低いため不要との要望)
  console.log('[BGM] MP3 unavailable for', key, '- silent fallback');
}

function updateBGM(){
  getAC();
}

function stopBGM(){
  if(_bgmAudio){
    try{
      _bgmAudio.pause();
      _bgmAudio.currentTime=0;
      _bgmAudio.src='';
      _bgmAudio.load();
    }catch(e){}
    _bgmAudio=null;
  }
  _stopSynthBGM();
  _bgmKey=null;
  // 後発の非同期処理を全部キャンセル
  _bgmStartId++;
}

// ── ページ可視状態変化リスナー(タブ復帰時のBGM自動復活) ──
// スマホでアプリ切替→戻った時や、PCでタブ切替→戻った時に音楽が止まることがある
if(typeof document !== 'undefined'){
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState === 'visible' && !muted && _bgmKey){
      // AudioContextを起こす
      try{
        const ac=getAC();
        if(ac && ac.state==='suspended') ac.resume().catch(()=>{});
      }catch(e){}
      // BGMが止まっていれば再起動
      setTimeout(()=>{
        if(muted || !_bgmKey) return;
        const audioOk = _bgmAudio && !_bgmAudio.paused && !_bgmAudio.ended && _bgmAudio.readyState >= 2;
        const synthOk = _bgmNodes && _bgmNodes.length > 0;
        if(!audioOk && !synthOk){
          const k=_bgmKey;
          _bgmKey=null;
          startBGM(k);
        } else if(_bgmAudio && _bgmAudio.paused){
          // 一時停止されているだけなら再開だけ試みる
          _bgmAudio.play().catch(()=>{
            const k=_bgmKey;
            _bgmKey=null;
            startBGM(k);
          });
        }
      }, 300);
    }
  });
}

function setMute(val){
  muted=val;
  if(muted){
    if(_bgmAudio){try{_bgmAudio.pause();}catch(e){}}
    _stopSynthBGM();
    if(_seMasterGain)_seMasterGain.gain.value=0;
  }else{
    // ミュート解除: AudioContext を起こす
    try{
      const ac=getAC();
      if(ac && ac.state==='suspended') ac.resume().catch(()=>{});
    }catch(e){}
    // 既存のオーディオオブジェクトがあれば再生再開を試行
    let resumed=false;
    if(_bgmAudio){
      try{
        const p=_bgmAudio.play();
        if(p && p.catch) p.catch(()=>{
          // 失敗したら強制リスタート
          if(_bgmKey){const k=_bgmKey; _bgmKey=null; startBGM(k);}
        });
        resumed=true;
      }catch(e){}
    }
    // 既存オーディオが無いor失敗時: 強制リスタート(同キー素通り回避)
    if(!resumed && _bgmKey){
      const k=_bgmKey; _bgmKey=null; startBGM(k);
    }
    if(_seMasterGain)_seMasterGain.gain.value=1.0;
  }
  try{localStorage.setItem('aq_muted',val?'1':'0');}catch(e){}
}

// SEマスターゲイン（1つだけ作って使い回す→音量加算を防ぐ）
let _seMasterGain=null;
function getSEMaster(){
  const ac=getAC();if(!ac)return null;
  if(!_seMasterGain){
    _seMasterGain=ac.createGain();
    _seMasterGain.gain.value=1.0; // SE全体の音量上限(MAX)
    _seMasterGain.connect(ac.destination);
  }
  return _seMasterGain;
}

// SE のスロットレート制限(同時発音数とレート制御)
let _seActiveCount = 0;
const _seMaxActive = 6;  // 同時発音上限(iOS Safariの制限内)
let _seLastByType = {};  // 同じSEの最小間隔制限用

function SE(type){
  if(muted)return;
  const ac=getAC();if(!ac)return;
  // AudioContext がサスペンドされてたら強制復帰
  if(ac.state==='suspended'){
    try{ ac.resume(); }catch(e){}
  }
  // 同時発音上限を超えたら破棄(古いSEを優先)
  if(_seActiveCount >= _seMaxActive) return;
  // 同じSEを短時間に連発しすぎないように
  const nowMs = (typeof performance!=='undefined' ? performance.now() : Date.now());
  const lastMs = _seLastByType[type] || 0;
  // 攻撃系SE は最小30ms間隔(秒間最大30発)
  // UI系は最小80ms
  const minInterval = (type==='click'||type==='tab'||type==='open'||type==='close') ? 80 : 30;
  if(nowMs - lastMs < minInterval) return;
  _seLastByType[type] = nowMs;
  const mg=getSEMaster();if(!mg)return;
  const now=ac.currentTime;
  const C={
    hit:    [[440,'square',0.18,0.10]],
    crit:   [[110,'sawtooth',0.28,0.12],[440,'square',0.30,0.08],[880,'square',0.25,0.10],[1320,'sine',0.20,0.18],[1760,'sine',0.15,0.22]],
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
    // ── UI操作系（軽め・控えめ）──
    tab:    [[880,'sine',0.10,0.05],[1320,'sine',0.08,0.06]],
    click:  [[660,'sine',0.08,0.05]],
    open:   [[523,'sine',0.10,0.06],[784,'sine',0.10,0.08]],
    close:  [[523,'sine',0.08,0.06],[330,'sine',0.08,0.08]],
    // ── スキル系（職業別の発動音）──
    slash:    [[660,'sawtooth',0.20,0.06],[1320,'sawtooth',0.18,0.10],[2200,'sine',0.10,0.06]],   // 剣士・烈風斬：シュッ
    parry:    [[1760,'sine',0.22,0.06],[2640,'sine',0.18,0.08],[3520,'sine',0.10,0.10]],          // パリィ：チンッ
    guard:    [[330,'square',0.18,0.20],[440,'sine',0.14,0.30]],                                  // ハードガード：ブォン
    berserk:  [[180,'sawtooth',0.22,0.20],[260,'sawtooth',0.20,0.20],[340,'sawtooth',0.18,0.30]], // バーサク：ゴオオ
    freeze:   [[1760,'sine',0.14,0.10],[2200,'sine',0.12,0.12],[2640,'sine',0.10,0.14],[3300,'sine',0.08,0.18]], // フロスト：キラキラ
    meteor:   [[80,'sawtooth',0.30,0.40],[110,'sawtooth',0.28,0.40],[160,'square',0.22,0.30]],    // メテオ・大爆発：ドゴーン
    bigbomb:  [[60,'sawtooth',0.32,0.50],[90,'sawtooth',0.28,0.50],[140,'square',0.22,0.40],[200,'square',0.16,0.30]], // ビッグ/ハイパーボム
    vortex:   [[440,'sine',0.14,0.08],[660,'sine',0.14,0.10],[880,'sine',0.12,0.12],[1320,'sine',0.10,0.16]], // 渦巻き：ヒュルル
    multishot:[[1100,'sine',0.12,0.05],[990,'sine',0.10,0.05],[880,'sine',0.10,0.06],[770,'sine',0.10,0.06],[660,'sine',0.10,0.06]], // 多方向：シュシュッ
    boost:    [[440,'sine',0.16,0.10],[660,'sine',0.16,0.12],[880,'sine',0.18,0.20]],             // バフ：キーン
    bell:     [[523,'sine',0.30,0.40],[1047,'sine',0.20,0.50],[1568,'sine',0.10,0.60],[2093,'sine',0.06,0.80]], // 鐘：カーン
    // ── プレイヤー被弾 ──
    hurt:     [[180,'sawtooth',0.22,0.10],[120,'square',0.18,0.12]],                              // ガッ
    dodge:    [[1760,'sine',0.12,0.06],[1320,'sine',0.10,0.06]],                                  // 回避：シュッ
    // ── モンスター撃破SE（種別ごと）──
    kill_pop:    [[660,'sine',0.16,0.08],[990,'sine',0.14,0.10]],                                 // スライム系：プニュッ
    kill_squeak: [[2200,'sine',0.14,0.06],[1760,'sine',0.12,0.08]],                               // 虫・コウモリ系：キィッ
    kill_grunt:  [[220,'sawtooth',0.20,0.10],[180,'square',0.16,0.12]],                          // ゴブリン・オーク系：ガッ
    kill_roar:   [[110,'sawtooth',0.24,0.20],[140,'sawtooth',0.20,0.22],[90,'square',0.18,0.18]], // 獣・大型系：グァッ
    kill_bone:   [[440,'square',0.14,0.06],[330,'square',0.14,0.06],[550,'square',0.12,0.08],[220,'square',0.10,0.10]], // 骸骨：カラカラッ
    kill_heavy:  [[80,'sawtooth',0.26,0.25],[60,'sawtooth',0.22,0.30],[180,'square',0.16,0.20]],  // 巨大：ドゴッ
    kill_hiss:   [[1320,'sine',0.10,0.08],[990,'sine',0.10,0.10],[660,'sine',0.10,0.12]],         // 砂漠生物：シャッ
    kill_boss:   [[60,'sawtooth',0.30,0.40],[110,'sawtooth',0.26,0.30],[220,'square',0.20,0.25],[440,'sine',0.16,0.30],[880,'sine',0.12,0.40]], // ボス撃破
  };
  const cfg=C[type];if(!cfg)return;
  const isCritSE=(type==='crit');
  cfg.forEach(([f,w,v,d],i)=>{try{
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=w;o.frequency.value=f;
    // クリティカルは周波数を急上昇させて爽快感を出す
    if(isCritSE&&i>=2){
      o.frequency.setValueAtTime(f*0.7,now+i*0.05);
      o.frequency.exponentialRampToValueAtTime(f,now+i*0.05+0.06);
    }
    o.connect(g);
    g.connect(mg);
    const t=now+i*0.05; // クリティカルは間隔を短く
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(v,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.001,t+d);
    _seActiveCount++;
    o.start(t);o.stop(t+d+0.05);
    // 再生終了時にカウンタを減らす
    o.onended = ()=>{
      _seActiveCount = Math.max(0, _seActiveCount-1);
      try{ o.disconnect(); g.disconnect(); }catch(e){}
    };
  }catch(e){}});
}

// ============================================================
//  プレイヤーデータ
// ============================================================
function makePlayerData(cls){
  const base={
    novice: {hp:100,sp:50,atk:7,def:5,mag:5,spd:180,hit:80,luk:5,agi:0}, // 初心者・剣士の80%程度の基礎力
    warrior:{hp:110,sp:60,atk:6,def:6,mag:5,spd:180,hit:80,luk:5,agi:0},
    mage:   {hp:90, sp:70,atk:5,def:4,mag:8,spd:160,hit:75,luk:5,agi:0},
    archer: {hp:100,sp:65,atk:6,def:5,mag:5,spd:200,hit:85,luk:8,agi:0},
    bomber: {hp:95, sp:80,atk:8,def:4,mag:6,spd:170,hit:78,luk:6,agi:0},
  }[cls]||{hp:80, sp:40,atk:5,def:3,mag:4,spd:170,hit:75,luk:5,agi:0};
  return {
    cls,
    hp:base.hp,mhp:base.hp,
    sp:base.sp,msp:base.sp,
    atk:base.atk,def:base.def,mag:base.mag,spd:base.spd,
    hit:base.hit,  // 命中率(%)
    luk:base.luk,  // 運（クリティカル率%）
    lv:1,exp:0,expNext:100,
    gold:50,potHP:3,potMP:3,kills:0,items:{}, // {itemId: count}
    equip:{weapon_main:null,weapon_off:null,head:null,face:null,shoulder:null,body:null,feet:null,accessory:null}, // 装備スロット
    statPts:0,      // 未割り振りポイント
    pendingLvUp:0,
    // ジョブシステム
    jobLv:1, jobExp:0, jobExpNext:80, jobPts:0,
    // スキルレベル（各職業3スキル、Lv0=未習得）
    sk1:0, sk2:0, sk3:0,
    // ── 覚醒システム(ゲージ蓄積式) ──
    awakGauge:0,      // 覚醒ゲージ(0〜100、MAX で覚醒発動可能)
    awakGaugeMax:100,
    awakExp:0,        // 覚醒経験値(覚醒中に敵討伐で蓄積)
    awakSp:0,         // 覚醒スキルポイント(awakExp 100 = 1pt)
    // 覚醒スキルレベル(元クラスへの反映用・装備種別ごとに分離)
    // 各覚醒形態(samurai/heavy/spirit/youma)ごとに sk1/sk2/sk3 のLvを管理
    awakSkillLv:{
      samurai:{sk1:0,sk2:0,sk3:0},  // 剣士覚醒の習得状況
      heavy:  {sk1:0,sk2:0,sk3:0},  // ボマー覚醒(重装兵器)
      busters:{sk1:0,sk2:0,sk3:0},  // ボマー覚醒(バスターズ換装)
      spirit: {sk1:0,sk2:0,sk3:0},  // アーチャー覚醒
      youma:  {sk1:0,sk2:0,sk3:0},  // マジシャン覚醒(妖魔)
      abyss:  {sk1:0,sk2:0,sk3:0},  // マジシャン覚醒(アビスウォーロック)
    },
    // ── 各覚醒職で現在「習得中」のスキルID(現在は装備制限のみで参照は廃止)──
    awakActive:{ samurai:null, heavy:null, busters:null, spirit:null, youma:null, abyss:null },
    // ── スキルスロット(覚醒前に戦闘で使うスキル6枠) ──
    // 各要素はスキルキー or null。キー形式:
    //   通常スキル: 'n1','n2','n3','n4'
    //   覚醒スキル: 'a_<awakKey>_<idx>' 例: 'a_samurai_3'
    skillSlots: [null, null, null, null, null, null],
  };
}

// ============================================================
//  属性システム(ファイファン式)
// ============================================================
// 属性: 'none'(無), 'fire'(炎), 'ice'(氷), 'thunder'(雷), 'water'(水),
//       'earth'(土), 'wind'(風), 'light'(光), 'dark'(闇)
const ELEMENT_INFO={
  none:   {label:'',     icon:'',   color:'#cccccc'},
  fire:   {label:'炎',   icon:'🔥', color:'#ff6633'},
  ice:    {label:'氷',   icon:'❄', color:'#88ddff'},
  thunder:{label:'雷',   icon:'⚡', color:'#ffee44'},
  water:  {label:'水',   icon:'💧', color:'#3399ff'},
  earth:  {label:'土',   icon:'⛰', color:'#bb8855'},
  wind:   {label:'風',   icon:'🌪', color:'#aaffaa'},
  light:  {label:'光',   icon:'✨', color:'#ffffaa'},
  dark:   {label:'闇',   icon:'🌑', color:'#aa44ff'},
};
// 対立(弱点)ペア
const ELEMENT_OPPOSITE={
  fire:'ice', ice:'fire',
  thunder:'water', water:'thunder',
  earth:'wind', wind:'earth',
  light:'dark', dark:'light',
};
// 属性相性ダメージ倍率を返す
// atkElem: 攻撃側の属性, defElem: 防御側の属性
// 戻り値: {mult: 倍率, label: 'WEAK!'/'RESIST'/null}
function getElementMult(atkElem, defElem){
  if(!atkElem || atkElem==='none') return {mult:1.0, label:null};
  if(!defElem || defElem==='none') return {mult:1.0, label:null};
  // 同属性 → 0.5倍 (耐性)
  if(atkElem===defElem) return {mult:0.5, label:'RESIST'};
  // 対立属性(弱点を突いた) → 2倍
  if(ELEMENT_OPPOSITE[defElem]===atkElem) return {mult:2.0, label:'WEAK!'};
  // それ以外は等倍
  return {mult:1.0, label:null};
}

// ============================================================
//  命中・クリティカル計算
// ============================================================
function calcHit(pd, enemyEva){
  // 命中率 = hit - 敵eva（最低5%、最大99%）
  return Math.min(99, Math.max(5, pd.hit - (enemyEva||0)));
}
function calcCrit(pd){
  // オールクリティカル中は100%
  if(pd._allCritUntil && Date.now() < pd._allCritUntil){
    return 100;
  }
  return pd.luk; // luk% がクリティカル率
}
function rollAttack(pd, enemyDef, enemyEva, atkElem, defElem){
  // 命中判定（hit - 敵eva%）
  const hitRate=calcHit(pd,enemyEva);
  if(Math.random()*100>hitRate) return {miss:true};
  // クリティカル判定
  const isCrit=Math.random()*100<calcCrit(pd);
  let dmg=Math.max(1, Math.floor(pd.atk*1.5) - (enemyDef||0) + Phaser.Math.Between(0,pd.atk));
  if(isCrit) dmg=Math.floor(dmg*2);
  // 属性相性
  const em=getElementMult(atkElem||'none', defElem||'none');
  if(em.mult!==1.0) dmg=Math.max(1, Math.floor(dmg*em.mult));
  return {dmg, isCrit, miss:false, elemLabel:em.label, elemMult:em.mult};
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
    const txt=this.add.text(w/2,h/2+20,'Loading...',{fontSize:'14px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5);
    this.load.on('progress',v=>bar.setSize(w*0.8*v,20));
    this.load.on('fileprogress',f=>txt.setText(f.key));
    this.load.spritesheet('player_warrior', BASE+'players/sprite_sheet_sordman.png', {frameWidth:124,frameHeight:124});
    // novice はスプライトシート (128×128px, 5×3=15コマ)
    this.load.spritesheet('player_novice', BASE+'players/novice_sprite_sheet.png', {frameWidth:128,frameHeight:128});
    // samurai はスプライトシート (128×128px, 5×3=15コマ・覚醒時に使用)
    this.load.spritesheet('player_samurai', BASE+'players/sprite_sheet_samurai.png', {frameWidth:128,frameHeight:128});
    // heavy はスプライトシート (128×128px, 5×3=15コマ・覚醒時に使用)
    this.load.spritesheet('player_heavy', BASE+'players/sprite_sheet_custum.png', {frameWidth:128,frameHeight:128});
    // youma はスプライトシート (128×128px, 5×3=15コマ・覚醒時に使用)
    this.load.spritesheet('player_youma', BASE+'players/sprite_sheet_dark.png', {frameWidth:128,frameHeight:128});
    // elf_form はスプライトシート (128×128px, 5×3=15コマ・アーチャー覚醒時に使用)
    this.load.spritesheet('player_elf', BASE+'players/sprite_sheet_elfe.png', {frameWidth:128,frameHeight:128});
    // archer はスプライトシート (128×128px, 5×3=15コマ)
    this.load.spritesheet('player_archer', BASE+'players/archer_sprite_sheet.png', {frameWidth:128,frameHeight:128});
    // mage はスプライトシート (128×128px, 5×3=15コマ)
    this.load.spritesheet('player_mage', BASE+'players/final_sprite_sheet.png', {frameWidth:128,frameHeight:128});
    // bomber はスプライトシート
    this.load.spritesheet('player_bomber', BASE+'players/final_sheet_cc.png', {frameWidth:64,frameHeight:64});
    // 全敵キャラはコード描画テクスチャを使用（PNGロード不要）
    // タイル・オブジェクトはコード生成に変更
    // ['bridge','cliff',...] load.image廃止
    ['portal_st1','portal_st2','portal_st3','portal_st4','portal_town'].forEach(k=>this.load.image(k,BASE+'portals/'+k+'.png'));
    // arrow はコード描画テクスチャを使用
    // proj・fx はコード生成に変更
    ['hp_potion','mp_potion'].forEach(k=>this.load.image('drop_'+k,BASE+'drops/'+k+'.png'));
    // ── カスタムマップ画像（1枚絵背景） ──
    this.load.image('map_st1', BASE+'maps/st1.webp');
    this.load.image('map_st2', BASE+'maps/st2.webp');
    this.load.image('map_st3', BASE+'maps/st3.webp');
    this.load.image('map_st4', BASE+'maps/st4.webp');
    this.load.image('map_st5', BASE+'maps/st5.webp');
    this.load.image('map_st6', BASE+'maps/st6.webp');
    this.load.image('map_st7', BASE+'maps/st7.webp');
    this.load.image('map_st8', BASE+'maps/st8.webp');
    this.load.image('map_rainbow1', BASE+'maps/rainbow-1.webp');
    this.load.image('map_rainbow2', BASE+'maps/rainbow-2.webp');
    this.load.image('map_dun1', BASE+'maps/dun1.webp');
    this.load.image('map_st20', BASE+'maps/st20.webp');
    this.load.image('map_blaze', BASE+'maps/town1.webp');
    this.load.image('map_town0', BASE+'maps/town0.webp');
    this.load.image('map_town2', BASE+'maps/town2.webp');
    this.load.image('map_dun2_1', BASE+'maps/dun2-1.webp');
    this.load.image('map_dun2_2', BASE+'maps/dun2-2.webp');
    this.load.image('map_south_st1', BASE+'maps/south_st1.webp');
    this.load.image('map_south_st2', BASE+'maps/south_st2.webp');
    this.load.image('map_south_st3', BASE+'maps/south_st3.webp');
    this.load.image('map_south_st4', BASE+'maps/south_st4.webp');
    this.load.image('map_town_minato', BASE+'maps/town_minato.webp');
    this.load.image('map_sakura_gate', BASE+'maps/sakura_gate.webp');
    this.load.image('map_sakura_dun1', BASE+'maps/sakura_dun1.webp');
    // NPC スプライト
    this.load.image('npc_sakura5', BASE+'npcs/sakura-5.png');

    // 桜の城モンスター画像（PNG優先・存在しなければコード描画にフォールバック）
    // ── 全モンスターのPNG画像ロード(idle + 攻撃モーション) ──
    // 画像が存在する場合はPNG優先、存在しない場合はloaderrorでコード描画にフォールバック
    [
      'bat','bear','beetle','blue_oni','bone_dragon','bone_walker','cider','cloud_monkey',
      'crab','dark_elf','dragon','gama_ninja','ghost','giant','goblin','goblin_archer',
      'goblin_axe','hornet','lich','mummy','orc_archer','orc_high','orc_lady','orc_warrior',
      'red_oni','rock_golem','sakura','sandman','sandworm','scorpion','seal','skeleton',
      'slime','treant','treasure_hunt','troll','wisp','wolf','zombie'
    ].forEach(k=>{
      this.load.image('enemy_'+k,       BASE+'enemies/'+k+'.png');
      this.load.image('enemy_'+k+'_atk',BASE+'enemies/'+k+'_atk.png');
    });
    // ── ボス画像ロード(idle+attackセット) ──
    // boss/フォルダのboss_*.png を読み込む。ファイル名は boss_<id>.png / boss_<id>_atk.png
    [
      'boss1','boss2','boss3','boss4',
      'scorpion_king','tomb_guardian','mistress','thunder_god',
      'dark_illusion','goblin_leader'
    ].forEach(k=>{
      this.load.image('enemy_'+k,       BASE+'boss/boss_'+k+'.png');
      this.load.image('enemy_'+k+'_atk',BASE+'boss/boss_'+k+'_atk.png');
    });
    // 画像ロード失敗を検出(ファイル不在等)
    this.load.on('loaderror', (file)=>{
      console.warn('画像ロード失敗:', file.key, file.url);
      // 失敗してもロードプロセスを続行(無限ループ回避)
    });
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
      if(this.anims.exists(a.key)) return;
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_bomber',frame:f})),
        frameRate:a.rate,
        repeat:a.rep,
      });
    });

    // マジシャン スプライトアニメーション定義 (128×128px, 5×3)
    // 行0=front(0-4) 行1=back(5-9) 行2=side(10-14)
    const MA=[
      {key:'mage_front_idle',frames:[0],    rate:2, rep:-1},
      {key:'mage_front_walk',frames:[1,2],  rate:8, rep:-1},
      {key:'mage_front_atk', frames:[3,4],  rate:10,rep:0 },
      {key:'mage_back_idle', frames:[5],    rate:2, rep:-1},
      {key:'mage_back_walk', frames:[6,7],  rate:8, rep:-1},
      {key:'mage_back_atk',  frames:[8,9],  rate:10,rep:0 },
      {key:'mage_side_idle', frames:[10],   rate:2, rep:-1},
      {key:'mage_side_walk', frames:[11,12],rate:8, rep:-1},
      {key:'mage_side_atk',  frames:[13,14],rate:10,rep:0 },
    ];
    MA.forEach(a=>{
      if(this.anims.exists(a.key)) return;
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_mage',frame:f})),
        frameRate:a.rate,
        repeat:a.rep,
      });
    });
    // ── コード描画テクスチャ生成 ──────────────────
    this._generateEnemyTextures();
    // アーチャー スプライトアニメーション定義 (128×128px, 5×3)
    const AA=[
      {key:'archer_front_idle',frames:[0],    rate:2, rep:-1},
      {key:'archer_front_walk',frames:[1,2],  rate:8, rep:-1},
      {key:'archer_front_atk', frames:[3,4],  rate:10,rep:0 },
      {key:'archer_back_idle', frames:[5],    rate:2, rep:-1},
      {key:'archer_back_walk', frames:[6,7],  rate:8, rep:-1},
      {key:'archer_back_atk',  frames:[8,9],  rate:10,rep:0 },
      {key:'archer_side_idle', frames:[10],   rate:2, rep:-1},
      {key:'archer_side_walk', frames:[11,12],rate:8, rep:-1},
      {key:'archer_side_atk',  frames:[13,14],rate:10,rep:0 },
    ];
    AA.forEach(a=>{
      if(this.anims.exists(a.key)) return;
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_archer',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });
    // ソードマン スプライトアニメーション定義 (sprite_sheet_sordman.png, 5列×3行=15フレーム)
    // 行1(正面): 0=idle, 1=walk1, 2=walk2, 3=atk1, 4=atk2
    // 行2(後ろ): 5=idle, 6=walk1, 7=walk2, 8=atk1, 9=atk2
    // 行3(横):  10=idle,11=walk1,12=walk2,13=atk1,14=atk2
    const WA=[
      {key:'warrior_front_idle',frames:[0],     rate:2, rep:-1},
      {key:'warrior_front_walk',frames:[1,2],   rate:8, rep:-1},
      {key:'warrior_front_atk', frames:[3,4],   rate:10,rep:0 },
      {key:'warrior_back_idle', frames:[5],     rate:2, rep:-1},
      {key:'warrior_back_walk', frames:[6,7],   rate:8, rep:-1},
      {key:'warrior_back_atk',  frames:[8,9],   rate:10,rep:0 },
      {key:'warrior_side_idle', frames:[10],    rate:2, rep:-1},
      {key:'warrior_side_walk', frames:[11,12], rate:8, rep:-1},
      {key:'warrior_side_atk',  frames:[13,14], rate:10,rep:0 },
    ];
    WA.forEach(a=>{
      if(this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_warrior',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });

    // ノービス アニメーション(同じ構造で player_novice テクスチャを使う)
    const NA=[
      {key:'novice_front_idle',frames:[0],     rate:2, rep:-1},
      {key:'novice_front_walk',frames:[1,2],   rate:8, rep:-1},
      {key:'novice_front_atk', frames:[3,4],   rate:10,rep:0 },
      {key:'novice_back_idle', frames:[5],     rate:2, rep:-1},
      {key:'novice_back_walk', frames:[6,7],   rate:8, rep:-1},
      {key:'novice_back_atk',  frames:[8,9],   rate:10,rep:0 },
      {key:'novice_side_idle', frames:[10],    rate:2, rep:-1},
      {key:'novice_side_walk', frames:[11,12], rate:8, rep:-1},
      {key:'novice_side_atk',  frames:[13,14], rate:10,rep:0 },
    ];
    NA.forEach(a=>{
      if(this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_novice',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });
    // 侍 アニメーション(覚醒時に使用)
    const SA=[
      {key:'samurai_front_idle',frames:[0],     rate:2, rep:-1},
      {key:'samurai_front_walk',frames:[1,2],   rate:8, rep:-1},
      {key:'samurai_front_atk', frames:[3,4],   rate:10,rep:0 },
      {key:'samurai_back_idle', frames:[5],     rate:2, rep:-1},
      {key:'samurai_back_walk', frames:[6,7],   rate:8, rep:-1},
      {key:'samurai_back_atk',  frames:[8,9],   rate:10,rep:0 },
      {key:'samurai_side_idle', frames:[10],    rate:2, rep:-1},
      {key:'samurai_side_walk', frames:[11,12], rate:8, rep:-1},
      {key:'samurai_side_atk',  frames:[13,14], rate:10,rep:0 },
    ];
    SA.forEach(a=>{
      if(this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_samurai',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });
    // ヘヴィ アニメーション(ボマー覚醒時に使用)
    const HA=[
      {key:'heavy_front_idle',frames:[0],     rate:2, rep:-1},
      {key:'heavy_front_walk',frames:[1,2],   rate:8, rep:-1},
      {key:'heavy_front_atk', frames:[3,4],   rate:10,rep:0 },
      {key:'heavy_back_idle', frames:[5],     rate:2, rep:-1},
      {key:'heavy_back_walk', frames:[6,7],   rate:8, rep:-1},
      {key:'heavy_back_atk',  frames:[8,9],   rate:10,rep:0 },
      {key:'heavy_side_idle', frames:[10],    rate:2, rep:-1},
      {key:'heavy_side_walk', frames:[11,12], rate:8, rep:-1},
      {key:'heavy_side_atk',  frames:[13,14], rate:10,rep:0 },
    ];
    HA.forEach(a=>{
      if(this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_heavy',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });
    // 妖魔 アニメーション(マジシャン覚醒時に使用)
    const YA=[
      {key:'youma_front_idle',frames:[0],     rate:2, rep:-1},
      {key:'youma_front_walk',frames:[1,2],   rate:8, rep:-1},
      {key:'youma_front_atk', frames:[3,4],   rate:10,rep:0 },
      {key:'youma_back_idle', frames:[5],     rate:2, rep:-1},
      {key:'youma_back_walk', frames:[6,7],   rate:8, rep:-1},
      {key:'youma_back_atk',  frames:[8,9],   rate:10,rep:0 },
      {key:'youma_side_idle', frames:[10],    rate:2, rep:-1},
      {key:'youma_side_walk', frames:[11,12], rate:8, rep:-1},
      {key:'youma_side_atk',  frames:[13,14], rate:10,rep:0 },
    ];
    YA.forEach(a=>{
      if(this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_youma',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });
    // エルフ アニメーション(アーチャー覚醒時に使用)
    const EA=[
      {key:'elf_front_idle',frames:[0],     rate:2, rep:-1},
      {key:'elf_front_walk',frames:[1,2],   rate:8, rep:-1},
      {key:'elf_front_atk', frames:[3,4],   rate:10,rep:0 },
      {key:'elf_back_idle', frames:[5],     rate:2, rep:-1},
      {key:'elf_back_walk', frames:[6,7],   rate:8, rep:-1},
      {key:'elf_back_atk',  frames:[8,9],   rate:10,rep:0 },
      {key:'elf_side_idle', frames:[10],    rate:2, rep:-1},
      {key:'elf_side_walk', frames:[11,12], rate:8, rep:-1},
      {key:'elf_side_atk',  frames:[13,14], rate:10,rep:0 },
    ];
    EA.forEach(a=>{
      if(this.anims.exists(a.key)) this.anims.remove(a.key);
      this.anims.create({
        key:a.key,
        frames:a.frames.map(f=>({key:'player_elf',frame:f})),
        frameRate:a.rate, repeat:a.rep,
      });
    });
    this.scene.start('Title');
  }

  _generateEnemyTextures(){
    const T=32; // タイルサイズ
    const mk2=(key,W,H,fn)=>{const g=this.make.graphics({x:0,y:0,add:false});fn(g);g.generateTexture(key,W,H);g.destroy();};


    // ノービススプライトシートはpreloadで読み込み済み (player_novice)


    // ══════════════════════════════════════
    //  タイル生成（各32×32px）
    // ══════════════════════════════════════

    // ── 草原タイル ──
    mk2('tile_grass',T,T,g=>{
      g.fillStyle(0x3a8c3a);g.fillRect(0,0,T,T);
      g.fillStyle(0x4aa84a,0.6);
      for(let i=0;i<6;i++){const x=((i*7+3)%T),y=((i*11+5)%T);g.fillRect(x,y,3,2);}
      g.fillStyle(0x2d6e2d,0.4);
      g.fillRect(0,0,1,T);g.fillRect(0,0,T,1);
    });

    // ── 花畑タイル ──
    mk2('tile_flower',T,T,g=>{
      g.fillStyle(0x4aaa4a);g.fillRect(0,0,T,T);
      const flowers=[[6,8],[18,5],[26,12],[10,20],[22,22],[4,26],[28,4]];
      flowers.forEach(([x,y],i)=>{
        const cols=[0xff5566,0xffdd44,0xff88cc,0xffffff,0xffaa22];
        g.fillStyle(cols[i%5],1);
        g.fillCircle(x,y,2.5);
        g.fillStyle(0xffff88,1);g.fillCircle(x,y,1);
      });
      g.fillStyle(0x2d7a2d,0.3);g.fillRect(0,0,1,T);g.fillRect(0,0,T,1);
    });

    // ── 深い森タイル ──
    mk2('tile_dark_forest',T,T,g=>{
      g.fillStyle(0x1a3a1a);g.fillRect(0,0,T,T);
      g.fillStyle(0x224422,0.8);
      [[4,4,6],[14,8,5],[22,3,7],[8,18,5],[20,20,6],[28,14,4]].forEach(([x,y,r])=>{
        g.fillCircle(x,y,r);
      });
      g.fillStyle(0x336633,0.4);
      g.fillCircle(10,10,4);g.fillCircle(22,20,5);
    });

    // ── 溶岩地帯タイル ──
    mk2('tile_volcanic',T,T,g=>{
      g.fillStyle(0x3a1a0a);g.fillRect(0,0,T,T);
      g.fillStyle(0x5a2a10,0.7);
      g.fillRect(2,2,12,10);g.fillRect(18,6,10,8);g.fillRect(8,20,14,8);
      g.fillStyle(0xff4400,0.15);
      g.fillRect(0,0,T,T);
      g.fillStyle(0xff6600,0.2);
      g.fillEllipse(16,24,10,4);g.fillEllipse(6,12,6,3);
    });

    // ── 溶岩タイル ──
    mk2('tile_lava',T,T,g=>{
      g.fillStyle(0xcc2200);g.fillRect(0,0,T,T);
      g.fillStyle(0xff6600,0.7);
      g.fillEllipse(8,8,10,6);g.fillEllipse(22,18,12,7);g.fillEllipse(6,24,8,5);
      g.fillStyle(0xff9900,0.5);
      g.fillEllipse(16,12,8,4);g.fillEllipse(4,20,6,4);g.fillEllipse(24,6,7,4);
      g.fillStyle(0xffcc00,0.3);
      g.fillEllipse(10,16,4,3);g.fillEllipse(24,24,5,3);
      // クラック
      g.lineStyle(1,0x880000,0.8);
      g.lineBetween(0,8,16,12);g.lineBetween(16,12,32,6);
      g.lineBetween(4,20,20,28);
    });

    // ── 海岸砂浜タイル ──
    mk2('tile_sand_beach',T,T,g=>{
      g.fillStyle(0xe8cc88);g.fillRect(0,0,T,T);
      g.fillStyle(0xd4b870,0.5);
      g.fillRect(3,5,5,3);g.fillRect(14,2,7,3);g.fillRect(24,8,5,3);
      g.fillRect(6,18,4,2);g.fillRect(20,22,6,2);g.fillRect(8,26,5,2);
      g.fillStyle(0xf0dda0,0.4);
      g.fillEllipse(16,16,14,8);
    });

    // ── 海タイル ──
    mk2('tile_sea',T,T,g=>{
      g.fillStyle(0x1a5aaa);g.fillRect(0,0,T,T);
      g.fillStyle(0x2266bb,0.6);
      g.fillRect(0,6,T,4);g.fillRect(0,18,T,4);
      g.fillStyle(0x3377cc,0.4);
      g.fillRect(4,2,T-8,3);g.fillRect(2,14,T-4,3);g.fillRect(0,26,T,3);
      g.fillStyle(0x88ccff,0.2);
      g.fillRect(2,8,8,2);g.fillRect(18,20,10,2);g.fillRect(8,28,12,2);
    });

    // ── オアシス草タイル ──
    mk2('tile_oasis_grass',T,T,g=>{
      g.fillStyle(0x2a7a2a);g.fillRect(0,0,T,T);
      g.fillStyle(0x3d9e3d,0.6);
      g.fillRect(4,4,6,2);g.fillRect(16,8,5,2);g.fillRect(8,16,7,2);g.fillRect(22,20,5,2);
      g.fillStyle(0x4aaa4a,0.3);
      g.fillEllipse(10,10,8,5);g.fillEllipse(22,22,7,4);
      g.fillStyle(0x1a5a1a,0.3);g.fillRect(0,0,1,T);g.fillRect(0,0,T,1);
    });

    // ── 砂漠タイル ──
    mk2('tile_sand_desert',T,T,g=>{
      g.fillStyle(0xd4a840);g.fillRect(0,0,T,T);
      g.fillStyle(0xc49830,0.5);
      g.fillEllipse(8,8,10,5);g.fillEllipse(22,14,12,5);g.fillEllipse(6,22,8,4);g.fillEllipse(24,26,10,4);
      g.fillStyle(0xe8c060,0.4);
      g.fillEllipse(16,6,6,3);g.fillEllipse(4,16,5,3);g.fillEllipse(26,22,5,3);
    });

    // ── 水タイル ──
    mk2('tile_water',T,T,g=>{
      g.fillStyle(0x1a4488);g.fillRect(0,0,T,T);
      g.fillStyle(0x2255aa,0.6);g.fillRect(0,4,T,6);g.fillRect(0,18,T,5);
      g.fillStyle(0x88aaff,0.15);g.fillRect(2,6,6,2);g.fillRect(20,20,8,2);
    });

    // ── 石畳タイル（町）──
    mk2('tile_cobble',T,T,g=>{
      g.fillStyle(0x666680);g.fillRect(0,0,T,T);
      // 石畳パターン
      const stones=[[0,0,15,10],[16,0,15,10],[0,11,10,10],[11,11,10,10],[22,11,10,10],[0,22,15,9],[16,22,15,9]];
      stones.forEach(([x,y,w,h],i)=>{
        g.fillStyle(i%2===0?0x7777aa:0x8888bb,0.7);
        g.fillRect(x+1,y+1,w-2,h-2);
        g.fillStyle(0xaaaacc,0.2);
        g.fillRect(x+1,y+1,w-2,2);
      });
      g.lineStyle(1,0x444458,0.6);
      g.lineBetween(0,10,T,10);g.lineBetween(0,22,T,22);
      g.lineBetween(15,0,15,10);g.lineBetween(10,11,10,21);g.lineBetween(21,11,21,21);g.lineBetween(15,22,15,T);
    });

    // ── 町の壁タイル ──
    mk2('tile_town_wall',T,T,g=>{
      g.fillStyle(0x8888aa);g.fillRect(0,0,T,T);
      // レンガパターン
      for(let r=0;r<4;r++){
        const offset=(r%2)*8;
        for(let c=-1;c<3;c++){
          g.fillStyle(0x9999bb,0.7);
          g.fillRect(c*16+offset+1,r*8+1,14,6);
          g.fillStyle(0xbbbbdd,0.2);
          g.fillRect(c*16+offset+1,r*8+1,14,2);
        }
      }
      g.lineStyle(1,0x666688,0.6);
      for(let r=0;r<4;r++)g.lineBetween(0,r*8,T,r*8);
    });

    // ── 町の道タイル ──
    mk2('tile_town_path',T,T,g=>{
      g.fillStyle(0x998866);g.fillRect(0,0,T,T);
      g.fillStyle(0x887755,0.5);
      g.fillRect(3,6,5,3);g.fillRect(14,2,6,3);g.fillRect(22,10,5,3);
      g.fillRect(6,18,7,3);g.fillRect(20,20,5,3);
      g.fillStyle(0xbbaa88,0.3);
      g.fillEllipse(10,10,8,4);g.fillEllipse(24,22,6,3);
    });

    // ── 崖タイル ──
    mk2('tile_cliff',T,T,g=>{
      g.fillStyle(0x886644);g.fillRect(0,0,T,T);
      g.fillStyle(0x997755,0.6);
      g.fillRect(2,4,12,6);g.fillRect(18,8,10,5);g.fillRect(6,18,14,5);
      g.fillStyle(0x664422,0.5);
      g.fillRect(0,10,T,2);g.fillRect(0,22,T,2);
      g.lineStyle(1,0x553311,0.6);
      g.lineBetween(0,10,T,12);g.lineBetween(0,22,T,20);
    });

    // ── 橋タイル ──
    mk2('tile_bridge',T,T,g=>{
      g.fillStyle(0xaa8855);g.fillRect(0,0,T,T);
      g.fillStyle(0xcc9966,0.7);
      g.fillRect(2,2,T-4,6);g.fillRect(2,12,T-4,6);g.fillRect(2,22,T-4,6);
      g.lineStyle(2,0x886633,0.7);
      for(let x=0;x<T;x+=6)g.lineBetween(x,0,x,T);
      g.fillStyle(0xddbb88,0.2);
      g.fillRect(2,2,T-4,2);g.fillRect(2,12,T-4,2);g.fillRect(2,22,T-4,2);
    });

    // ── オブジェクト類 ──
    // 木
    // ── 木（64×80px・大きく立体的）──
    mk2('obj_tree',64,80,g=>{
      // 影
      g.fillStyle(0x000000,0.2);g.fillEllipse(32,76,44,10);
      // 幹（太く）
      g.fillStyle(0x6b3d1a,1);g.fillRect(26,44,12,34);
      g.fillStyle(0x4a2810,0.6);g.fillRect(26,44,5,34);
      g.fillStyle(0x8b5a2a,0.3);g.fillRect(30,46,4,30);
      // 根元の広がり
      g.fillStyle(0x5a3012,1);g.fillTriangle(18,78,32,58,46,78);
      // 葉（4層・グラデーション）
      g.fillStyle(0x1a6614,1);g.fillEllipse(32,54,52,36);
      g.fillStyle(0x228822,1);g.fillEllipse(32,44,46,32);
      g.fillStyle(0x33aa33,1);g.fillEllipse(32,34,38,28);
      g.fillStyle(0x44cc44,0.9);g.fillEllipse(32,24,28,24);
      // 葉のハイライト
      g.fillStyle(0x66dd66,0.5);g.fillEllipse(26,20,16,12);
      g.fillStyle(0x88ff88,0.2);g.fillEllipse(24,18,8,7);
      // 葉の暗い側
      g.fillStyle(0x114411,0.4);g.fillEllipse(40,50,20,16);
      // 葉先のとがり
      g.fillStyle(0x33aa33,1);
      g.fillTriangle(32,8,26,22,38,22);
      g.fillTriangle(20,18,14,30,28,28);
      g.fillTriangle(44,18,36,28,50,30);
    });

    // ── ヤシの木（64×80px・南国らしく）──
    mk2('obj_palm',64,80,g=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(32,76,36,8);
      // 幹（曲がった）
      g.fillStyle(0x8b6633,1);
      g.fillRect(28,30,8,46);
      g.fillStyle(0xaa8844,0.5);g.fillRect(30,32,4,44);
      // 幹の節
      g.fillStyle(0x6b4d22,0.4);
      for(let i=0;i<6;i++)g.fillRect(27,34+i*8,10,2);
      // 葉（6枚・放射状）
      g.fillStyle(0x228833,1);
      g.fillTriangle(32,28,2,14,30,30);g.fillTriangle(32,28,62,14,34,30);
      g.fillTriangle(32,28,2,32,28,32);g.fillTriangle(32,28,62,32,36,32);
      g.fillTriangle(32,28,16,8,30,28);g.fillTriangle(32,28,48,8,34,28);
      g.fillStyle(0x33aa44,0.6);
      g.fillTriangle(32,28,4,18,28,30);g.fillTriangle(32,28,60,18,36,30);
      g.fillStyle(0x55cc66,0.3);
      g.fillTriangle(32,28,12,12,28,28);g.fillTriangle(32,28,52,12,36,28);
      // ヤシの実
      g.fillStyle(0xcc8822,1);g.fillCircle(32,30,6);g.fillCircle(24,32,5);g.fillCircle(40,32,5);
      g.fillStyle(0x994400,0.5);g.fillCircle(32,31,4);
    });

    // ── 岩（56×44px・リアルな石）──
    mk2('obj_rock',56,44,g=>{
      g.fillStyle(0x000000,0.25);g.fillEllipse(28,42,50,8);
      // メイン岩
      g.fillStyle(0x777788,1);g.fillEllipse(28,24,50,36);
      // 面（ライティング）
      g.fillStyle(0x9999aa,0.7);g.fillEllipse(20,16,28,20);
      g.fillStyle(0xaaaacc,0.4);g.fillEllipse(16,14,16,12);
      // 暗い面
      g.fillStyle(0x444455,0.5);g.fillEllipse(38,30,22,14);
      // 岩の縁
      g.lineStyle(2,0x555566,0.6);g.strokeEllipse(28,24,50,36);
      // ひび割れ
      g.lineStyle(1,0x333344,0.4);
      g.lineBetween(18,14,24,26);g.lineBetween(36,12,40,24);g.lineBetween(28,30,34,38);
    });

    // ── 溶岩岩（56×44px・赤く光る）──
    mk2('obj_lava_rock',56,44,g=>{
      g.fillStyle(0x000000,0.3);g.fillEllipse(28,42,50,8);
      // 黒い岩
      g.fillStyle(0x2a1810,1);g.fillEllipse(28,24,50,36);
      g.fillStyle(0x3a2018,0.7);g.fillEllipse(18,16,24,18);
      // 溶岩の亀裂（光る）
      g.fillStyle(0xff4400,0.7);g.fillRect(14,20,5,14);g.fillRect(30,16,4,12);g.fillRect(22,28,8,8);
      g.fillStyle(0xff8800,0.5);g.fillRect(15,21,3,12);g.fillRect(31,17,2,10);
      g.fillStyle(0xffcc00,0.3);g.fillRect(15,22,2,10);
      // 炎のオーラ
      g.fillStyle(0xff6600,0.15);g.fillEllipse(28,24,54,40);
      g.fillStyle(0xff4400,0.1);g.fillEllipse(28,22,58,44);
      // 縁
      g.lineStyle(2,0xff4400,0.4);g.strokeEllipse(28,24,50,36);
    });

    // ── 砂漠岩（56×44px・砂まみれ）──
    mk2('obj_desert_rock',56,44,g=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(28,42,50,8);
      // 岩本体
      g.fillStyle(0xbb9955,1);g.fillEllipse(28,24,50,36);
      g.fillStyle(0xddbb77,0.6);g.fillEllipse(18,14,26,18);
      g.fillStyle(0xeeccaa,0.3);g.fillEllipse(14,12,14,10);
      // 暗い面
      g.fillStyle(0x886633,0.5);g.fillEllipse(40,30,18,14);
      // 砂のテクスチャ
      g.fillStyle(0xccaa66,0.3);
      for(let i=0;i<8;i++)g.fillCircle(10+i*5+Math.sin(i)*3,20+Math.cos(i*1.5)*6,2);
      // 縁
      g.lineStyle(2,0x886633,0.5);g.strokeEllipse(28,24,50,36);
      // 岩のひび
      g.lineStyle(1,0x664422,0.4);g.lineBetween(22,14,28,24);g.lineBetween(36,16,40,26);
    });

    // ── 樽（40×48px・立体的）──
    mk2('obj_barrel',40,48,g=>{
      g.fillStyle(0x000000,0.25);g.fillEllipse(20,46,36,8);
      // 樽本体
      g.fillStyle(0x7a4418,1);g.fillRect(6,8,28,34);
      // 側面の丸み（明るい）
      g.fillStyle(0xaa6633,0.5);g.fillRect(8,10,10,30);
      g.fillStyle(0xcc8844,0.2);g.fillRect(10,12,6,26);
      // 側面の暗い部分
      g.fillStyle(0x4a2808,0.4);g.fillRect(26,10,8,30);
      // 蓋（上）
      g.fillStyle(0x5a3010,1);g.fillEllipse(20,8,30,10);
      g.fillStyle(0x8b5520,0.5);g.fillEllipse(17,6,16,6);
      // 底
      g.fillStyle(0x4a2808,1);g.fillEllipse(20,42,30,10);
      // 金属バンド
      g.fillStyle(0x888866,1);g.fillRect(4,14,32,4);g.fillRect(4,30,32,4);
      g.fillStyle(0xaaaaaa,0.5);g.fillRect(4,14,32,2);g.fillRect(4,30,32,2);
      // バンドのリベット
      g.fillStyle(0x999977,1);[8,16,24,32].forEach(x=>{g.fillCircle(x,16,2);g.fillCircle(x,32,2);});
      // 木目ライン
      g.lineStyle(1,0x4a2808,0.3);
      for(let i=0;i<4;i++)g.lineBetween(6+i*7,18,6+i*7,28);
    });

    // ── ダンジョン入口(石のアーチ+渦巻く闇) ──
    mk2('dungeon_gate',120,140,g=>{
      const W=120, H=140;
      // 地面の陰
      g.fillStyle(0x000000,0.35);g.fillEllipse(W/2,H-8,W*0.85,18);
      // 石のアーチ(外側・暗い灰色)
      g.fillStyle(0x3a3530,1);
      // アーチの縦の柱
      g.fillRect(12,40,16,90);
      g.fillRect(W-28,40,16,90);
      // アーチの上部(半円)
      g.fillStyle(0x3a3530,1);
      for(let a=Math.PI; a<Math.PI*2; a+=0.05){
        const r=52;
        const x=W/2+Math.cos(a)*r, y=56+Math.sin(a)*r*0.9;
        g.fillCircle(x,y,8);
      }
      // アーチの石ブロック(内側・少し明るい灰色)
      g.fillStyle(0x5a5550,1);
      g.fillRect(20,46,14,86);
      g.fillRect(W-34,46,14,86);
      // アーチのキーストーン(中央上)
      g.fillStyle(0x4a4540,1);
      g.fillRect(W/2-10,14,20,22);
      g.fillStyle(0x6a6560,.7);g.fillRect(W/2-7,18,14,3);
      // 石のブロック目地
      g.lineStyle(1,0x1a1812,0.8);
      for(let i=0;i<6;i++){
        g.lineBetween(20,56+i*14,34,56+i*14);
        g.lineBetween(W-34,56+i*14,W-20,56+i*14);
      }
      // アーチ内の渦巻く闇(黒いオーラ)
      g.fillStyle(0x000000,1);g.fillEllipse(W/2,80,70,90);
      g.fillStyle(0x1a0030,0.9);g.fillEllipse(W/2,80,60,80);
      g.fillStyle(0x330055,0.6);g.fillEllipse(W/2,82,46,68);
      // 中の魔力の光(紫)
      g.fillStyle(0x6600aa,0.5);g.fillEllipse(W/2,82,28,44);
      g.fillStyle(0x9933ff,0.4);g.fillEllipse(W/2,84,16,28);
      // 中央の一点の光
      g.fillStyle(0xcc66ff,0.7);g.fillCircle(W/2,82,7);
      g.fillStyle(0xffffff,0.5);g.fillCircle(W/2,82,3);
      // アーチ上のドクロ装飾
      g.fillStyle(0xeeddcc,1);g.fillEllipse(W/2,26,16,14);
      // ドクロの目穴
      g.fillStyle(0x000000,1);
      g.fillCircle(W/2-4,26,2.5);g.fillCircle(W/2+4,26,2.5);
      // ドクロの口
      g.fillStyle(0x000000,1);g.fillRect(W/2-3,30,6,3);
      // ドクロの目の赤い光
      g.fillStyle(0xff2200,1);
      g.fillCircle(W/2-4,26,1);g.fillCircle(W/2+4,26,1);
      // 石の苔(緑)
      g.fillStyle(0x557733,0.5);
      g.fillCircle(18,60,5);g.fillCircle(W-22,70,4);
      g.fillCircle(24,100,3);g.fillCircle(W-26,110,4);
      // アーチ下端の石段
      g.fillStyle(0x4a4540,1);
      g.fillRect(8,128,W-16,8);
      g.fillStyle(0x6a6560,.6);g.fillRect(10,130,W-20,2);
    });

    // ══════════════════════════════════════
    //  弾・エフェクト生成
    // ══════════════════════════════════════

    // ── テスト NPC スプライト (96x96・緑円+試験管) ──
    mk2('npc_test',96,96,g=>{
      // 背景の緑円
      g.fillStyle(0x44cc88,0.95); g.fillCircle(48,48,42);
      g.lineStyle(3,0x227755,1);  g.strokeCircle(48,48,42);
      // 内側の白い試験管
      g.fillStyle(0xffffff,1);
      g.fillRect(38,22,20,40);
      // 試験管の中の液体(青)
      g.fillStyle(0x44aaff,1);
      g.fillRect(40,46,16,14);
      // 試験管の栓(茶)
      g.fillStyle(0x886633,1);
      g.fillRect(38,18,20,6);
      // ハイライト
      g.fillStyle(0xeeffee,0.6); g.fillCircle(36,36,8);
    });

    // ── ファイアボール ──
    mk2('proj_fireball',24,24,g=>{
      g.fillStyle(0xff6600,0.3);g.fillCircle(12,12,11);
      g.fillStyle(0xff4400,0.7);g.fillCircle(12,12,9);
      g.fillStyle(0xff8800,1);g.fillCircle(12,12,7);
      g.fillStyle(0xffcc00,1);g.fillCircle(12,12,5);
      g.fillStyle(0xffffff,0.8);g.fillCircle(11,10,3);
      // 炎の尾
      g.fillStyle(0xff4400,0.5);g.fillTriangle(3,12,12,8,12,16);
      g.fillStyle(0xff8800,0.3);g.fillTriangle(0,12,12,9,12,15);
    });

    // ── ボム ──
    mk2('proj_bomb',20,20,g=>{
      g.fillStyle(0x222222,1);g.fillCircle(10,12,9);
      g.fillStyle(0x444444,0.5);g.fillEllipse(7,8,6,5);
      g.fillStyle(0x555555,1);g.fillRect(10,3,3,6);
      g.fillStyle(0xff8800,1);g.fillCircle(13,3,3);
      g.fillStyle(0xffcc00,0.8);g.fillCircle(12,2,2);
    });

    // ── ハイパーボム ──
    mk2('proj_hyperbomb',32,32,g=>{
      g.fillStyle(0xff2200,0.2);g.fillCircle(16,16,15);
      g.fillStyle(0x111111,1);g.fillCircle(16,18,13);
      g.fillStyle(0x333333,0.5);g.fillEllipse(11,12,8,6);
      g.fillStyle(0x666666,0.3);g.fillEllipse(20,14,6,5);
      g.fillStyle(0x555555,1);g.fillRect(15,4,4,8);
      g.fillStyle(0xff4400,1);g.fillCircle(19,5,4);
      g.fillStyle(0xffaa00,0.9);g.fillCircle(18,4,2.5);
      // スパイク
      g.fillStyle(0xff0000,0.8);
      [0,60,120,180,240,300].forEach(deg=>{
        const r=deg*Math.PI/180;
        g.fillTriangle(16+Math.cos(r)*13,18+Math.sin(r)*13,16+Math.cos(r+0.3)*10,18+Math.sin(r+0.3)*10,16+Math.cos(r-0.3)*10,18+Math.sin(r-0.3)*10);
      });
    });

    // ── ボルテックスボール ──
    mk2('proj_vortexball',32,32,g=>{
      g.fillStyle(0x0044ff,0.2);g.fillCircle(16,16,15);
      g.fillStyle(0x2266ff,0.5);g.fillCircle(16,16,12);
      g.fillStyle(0x4488ff,0.7);g.fillCircle(16,16,9);
      g.fillStyle(0xaaccff,1);g.fillCircle(16,16,6);
      g.fillStyle(0xffffff,0.9);g.fillCircle(16,16,3);
      // 電気の線
      g.lineStyle(2,0x88ccff,0.8);
      g.lineBetween(16,4,12,16);g.lineBetween(12,16,18,24);
      g.lineBetween(28,16,20,12);g.lineBetween(20,12,16,20);
      g.lineStyle(1,0xffffff,0.5);
      g.lineBetween(8,10,14,18);g.lineBetween(24,8,18,16);
    });

    // ── ビッグボム ──
    mk2('proj_bigbomb',40,40,g=>{
      g.fillStyle(0xff4400,0.15);g.fillCircle(20,20,19);
      g.fillStyle(0x111111,1);g.fillCircle(20,22,16);
      g.fillStyle(0x333333,0.5);g.fillEllipse(14,16,10,7);
      g.fillStyle(0x555555,1);g.fillRect(18,5,5,10);
      g.fillStyle(0xff6600,1);g.fillCircle(23,6,5);
      g.fillStyle(0xffcc00,0.9);g.fillCircle(22,5,3);
      [0,45,90,135,180,225,270,315].forEach(deg=>{
        const r=deg*Math.PI/180;
        g.fillStyle(0xff2200,0.7);
        g.fillTriangle(20+Math.cos(r)*16,22+Math.sin(r)*16,20+Math.cos(r+0.35)*12,22+Math.sin(r+0.35)*12,20+Math.cos(r-0.35)*12,22+Math.sin(r-0.35)*12);
      });
    });

    // ── 爆発エフェクト（派手版）──
    mk2('fx_explosion',64,64,g=>{
      // 外輪
      g.fillStyle(0xff4400,0.4);g.fillCircle(32,32,31);
      g.fillStyle(0xff6600,0.6);g.fillCircle(32,32,25);
      g.fillStyle(0xff8800,0.8);g.fillCircle(32,32,19);
      g.fillStyle(0xffcc00,0.9);g.fillCircle(32,32,13);
      g.fillStyle(0xffffff,1);g.fillCircle(32,32,7);
      // 光芒
      [0,30,60,90,120,150,180,210,240,270,300,330].forEach((deg,i)=>{
        const r=deg*Math.PI/180;
        const len=i%3===0?28:i%3===1?20:15;
        g.fillStyle(i%2===0?0xff6600:0xffcc00,0.5);
        g.fillTriangle(32,32,32+Math.cos(r-0.2)*len,32+Math.sin(r-0.2)*len,32+Math.cos(r+0.2)*len,32+Math.sin(r+0.2)*len);
      });
      g.fillStyle(0xffffff,0.6);g.fillCircle(29,28,4);
    });

    // ── スラッシュエフェクト ──
    mk2('fx_slash',48,48,g=>{
      // 斬撃の軌跡（青白い三日月型）
      g.fillStyle(0xaaddff,0.8);
      g.fillTriangle(4,44,24,4,44,24);
      g.fillStyle(0x66aaff,0.6);
      g.fillTriangle(8,44,24,8,40,24);
      g.fillStyle(0xffffff,0.9);
      g.fillTriangle(10,40,24,10,38,24);
      // ハイライト
      g.fillStyle(0xffffff,0.5);
      g.fillRect(10,10,4,28);
      // エッジライン
      g.lineStyle(2,0x88ccff,0.9);
      g.lineBetween(4,44,44,4);
      g.lineStyle(1,0xffffff,0.5);
      g.lineBetween(8,40,40,8);
    });

    // ポップなドクロ(エンペラーボムズ用・怖くない可愛いドクロ)
    mk2('pop_skull',128,128,g=>{
      const S=128;
      // 影
      g.fillStyle(0x000000,0.3); g.fillEllipse(S*.5, S*.92, S*.55, S*.08);
      // 頭蓋骨の本体(クリーム色で柔らかく)
      g.fillStyle(0xfff8e8,1); g.fillCircle(S*.5, S*.42, S*.34);
      // 顎部分(細め)
      g.fillStyle(0xfff8e8,1); g.fillRoundedRect(S*.32, S*.55, S*.36, S*.30, 18);
      g.fillCircle(S*.32, S*.70, S*.06);  // 左頬
      g.fillCircle(S*.68, S*.70, S*.06);  // 右頬
      // 頭蓋骨の縁(ピンクの優しい縁取り)
      g.lineStyle(3, 0xffaadd, 0.7);
      g.strokeCircle(S*.5, S*.42, S*.34);
      // 大きな丸い目(目自体は黒、丸くて可愛い)
      g.fillStyle(0x222244,1);
      g.fillCircle(S*.36, S*.42, S*.10);
      g.fillCircle(S*.64, S*.42, S*.10);
      // 目のキラキラハイライト(2つ・大小)
      g.fillStyle(0xffffff,1);
      g.fillCircle(S*.33, S*.39, S*.04);
      g.fillCircle(S*.61, S*.39, S*.04);
      g.fillCircle(S*.40, S*.45, S*.018);
      g.fillCircle(S*.68, S*.45, S*.018);
      // 鼻(小さなハート型・かわいい)
      g.fillStyle(0xff88aa,0.9);
      g.fillCircle(S*.46, S*.53, S*.025);
      g.fillCircle(S*.54, S*.53, S*.025);
      g.fillTriangle(S*.435, S*.535, S*.565, S*.535, S*.5, S*.59);
      // ニッコリ口(にこちゃん風)
      g.lineStyle(4, 0x222244, 1);
      // 弧を線分で表現
      const cx=S*.5, cy=S*.74, r=S*.10;
      let prevX=cx-r, prevY=cy;
      for(let k=1;k<=12;k++){
        const t=k/12;
        const ang=Math.PI*t;
        const nx=cx-Math.cos(ang)*r;
        const ny=cy+Math.sin(ang)*r;
        g.lineBetween(prevX, prevY, nx, ny);
        prevX=nx; prevY=ny;
      }
      // 歯(白いブロックを4つ・ニコッと感)
      g.fillStyle(0xffffff,1);
      g.fillRect(S*.42, S*.74, S*.04, S*.06);
      g.fillRect(S*.47, S*.74, S*.04, S*.06);
      g.fillRect(S*.52, S*.74, S*.04, S*.06);
      g.fillRect(S*.57, S*.74, S*.04, S*.06);
      // 頬っぺた(ピンクの円・かわいさUP)
      g.fillStyle(0xffaacc,0.6);
      g.fillCircle(S*.22, S*.55, S*.06);
      g.fillCircle(S*.78, S*.55, S*.06);
      // 頭の上のリボン蝶結び(超ポップ要素)
      g.fillStyle(0xff6699,1);
      g.fillTriangle(S*.42, S*.10, S*.50, S*.16, S*.42, S*.22);
      g.fillTriangle(S*.58, S*.10, S*.50, S*.16, S*.58, S*.22);
      g.fillCircle(S*.50, S*.16, S*.025);
      g.fillStyle(0xffaacc,1);
      g.fillCircle(S*.45, S*.14, S*.012);
      g.fillCircle(S*.55, S*.14, S*.012);
      // ☆ 周囲にキラキラ
      g.fillStyle(0xffee44,1);
      g.fillTriangle(S*.10, S*.30, S*.13, S*.34, S*.10, S*.38);
      g.fillTriangle(S*.13, S*.34, S*.17, S*.34, S*.13, S*.34);
      g.fillCircle(S*.12, S*.34, S*.018);
      g.fillCircle(S*.88, S*.34, S*.020);
      g.fillCircle(S*.18, S*.62, S*.014);
      g.fillCircle(S*.84, S*.62, S*.016);
    });

    // ── フリーズエフェクト ──
    mk2('fx_freeze',48,48,g=>{
      g.fillStyle(0x88ccff,0.3);g.fillCircle(24,24,23);
      g.fillStyle(0x44aaff,0.5);g.fillCircle(24,24,18);
      g.fillStyle(0xaaddff,0.7);g.fillCircle(24,24,12);
      g.fillStyle(0xeeffff,0.9);g.fillCircle(24,24,6);
      // 雪の結晶
      g.lineStyle(2,0xffffff,0.9);
      [0,60,120].forEach(deg=>{
        const r=deg*Math.PI/180;
        g.lineBetween(24+Math.cos(r)*20,24+Math.sin(r)*20,24-Math.cos(r)*20,24-Math.sin(r)*20);
        [-0.4,0.4].forEach(o=>{
          [0.4,0.6].forEach(d=>{
            g.lineBetween(24+Math.cos(r)*20*d,24+Math.sin(r)*20*d,24+Math.cos(r+o)*20*(d-0.2),24+Math.sin(r+o)*20*(d-0.2));
          });
        });
      });
      g.fillStyle(0xffffff,1);g.fillCircle(24,24,3);
    });

    // ── 衝撃波エフェクト ──
    mk2('fx_shockwave',64,64,g=>{
      g.lineStyle(4,0xff8800,0.9);g.strokeCircle(32,32,28);
      g.lineStyle(3,0xffcc00,0.7);g.strokeCircle(32,32,22);
      g.lineStyle(2,0xff4400,0.5);g.strokeCircle(32,32,16);
      g.fillStyle(0xffaa00,0.2);g.fillCircle(32,32,14);
      // 放射状ライン
      [0,45,90,135,180,225,270,315].forEach(deg=>{
        const r=deg*Math.PI/180;
        g.lineStyle(2,0xff6600,0.4);
        g.lineBetween(32+Math.cos(r)*16,32+Math.sin(r)*16,32+Math.cos(r)*30,32+Math.sin(r)*30);
      });
    });

    // ── 矢（proj_arrow）64×16px ──────────────────
    {
      const g=this.make.graphics({x:0,y:0,add:false});
      const W=64,H=16,CY=H/2;
      // 矢尻（羽根・左端）
      g.fillStyle(0xcc9944,1);
      g.fillTriangle(0,CY-4, 10,CY, 0,CY+4);
      g.fillTriangle(0,CY-4, 10,CY-1, 4,CY-6);
      g.fillTriangle(0,CY+4, 10,CY+1, 4,CY+6);
      // 矢柄（シャフト）
      g.fillStyle(0xaa7733,1);
      g.fillRect(8,CY-1.5,46,3);
      // 矢じり（先端・右端）
      g.fillStyle(0xdddddd,1);
      g.fillTriangle(54,CY-3, W,CY, 54,CY+3);
      // ハイライト
      g.fillStyle(0xffffff,0.3);
      g.fillRect(8,CY-1.5,46,1);
      g.generateTexture('proj_arrow',W,H);
      g.destroy();
    }
    const mk=(key,S,fn)=>{if(this.textures&&this.textures.exists(key))return;const g=this.make.graphics({x:0,y:0,add:false});fn(g,S);g.generateTexture(key,S,S);g.destroy();};

    // ── ボス4（砂漠の魔神・100×100px）────────────────────────
    mk('enemy_boss4',148,(g,S)=>{
      g.fillStyle(0x000000,.3);g.fillEllipse(S*.5,S*.96,S*.85,S*.13);
      // 灼熱のオーラ（外側）
      g.fillStyle(0xff6600,.1);g.fillCircle(S*.5,S*.5,S*.52);
      g.fillStyle(0xffaa00,.07);g.fillCircle(S*.5,S*.5,S*.48);
      // 尻尾（砂漠の蛇）
      g.fillStyle(0xcc7700,1);
      g.fillEllipse(S*.82,S*.78,S*.18,S*.1);g.fillEllipse(S*.92,S*.68,S*.12,S*.08);g.fillEllipse(S*.97,S*.57,S*.08,S*.06);
      g.fillStyle(0x22aa22,1);g.fillTriangle(S*.97,S*.48,S*.93,S*.56,S*.99,S*.53);
      // 砂の翼（大きく・半透明）
      g.fillStyle(0xdd8800,.8);
      g.fillTriangle(S*.5,S*.42,S*.02,S*.1,S*.3,S*.54);
      g.fillTriangle(S*.5,S*.42,S*.98,S*.1,S*.7,S*.54);
      g.fillStyle(0xffcc44,.3);
      g.fillTriangle(S*.5,S*.42,S*.06,S*.14,S*.32,S*.52);
      g.fillTriangle(S*.5,S*.42,S*.94,S*.14,S*.68,S*.52);
      // 翼の骨
      g.fillStyle(0xaa5500,.7);
      g.fillRect(S*.3,S*.44,S*.2,S*.03);g.fillRect(S*.5,S*.44,S*.2,S*.03);
      // 脚（砂漠の怪物）
      g.fillStyle(0xcc7700,1);g.fillEllipse(S*.3,S*.82,S*.22,S*.3);g.fillEllipse(S*.7,S*.82,S*.22,S*.3);
      // 爪（大きい・黒）
      g.fillStyle(0x111111,1);
      [[.2,.96,.16],[.28,.98,.18],[.36,.96,.16],[.64,.96,.16],[.72,.98,.18],[.8,.96,.16]].forEach(([x,y,l])=>{
        g.fillTriangle(S*x,S*y,S*(x-l*.08),S*(y+l*.1),S*(x+l*.08),S*y);
      });
      // 胴体（砂金色）
      g.fillStyle(0xcc8800,1);g.fillEllipse(S*.5,S*.62,S*.58,S*.52);
      g.fillStyle(0xffcc44,.4);g.fillEllipse(S*.5,S*.58,S*.38,S*.3);
      // 砂の鎧（模様）
      g.lineStyle(2,0xff6600,.5);g.strokeEllipse(S*.5,S*.62,S*.58,S*.52);
      g.fillStyle(0xff8800,.25);g.fillEllipse(S*.5,S*.55,S*.3,S*.2);
      // 首
      g.fillStyle(0xbb7700,1);g.fillEllipse(S*.5,S*.4,S*.36,S*.28);
      // 頭（大きい・砂金）
      g.fillStyle(0xcc8800,1);g.fillEllipse(S*.5,S*.26,S*.46,S*.38);
      // ターバン風の頭飾り
      g.fillStyle(0x220000,1);g.fillEllipse(S*.5,S*.18,S*.44,S*.16);
      g.fillStyle(0xff2200,1);g.fillRect(S*.38,S*.12,S*.24,S*.08);
      // 大角（3本・金）
      g.fillStyle(0xffcc00,1);
      g.fillTriangle(S*.36,S*.2,S*.28,S*.0,S*.44,S*.22);
      g.fillTriangle(S*.64,S*.2,S*.56,S*.22,S*.72,S*.0);
      g.fillTriangle(S*.5,S*.14,S*.46,S*.0,S*.54,S*.14);
      // 目（灼熱の赤・大きい）
      g.fillStyle(0xff2200,1);g.fillEllipse(S*.36,S*.25,S*.16,S*.12);g.fillEllipse(S*.64,S*.25,S*.16,S*.12);
      g.fillStyle(0xff8800,.8);g.fillEllipse(S*.36,S*.25,S*.1,S*.08);g.fillEllipse(S*.64,S*.25,S*.1,S*.08);
      g.fillStyle(0xffffff,.5);g.fillCircle(S*.36,S*.24,S*.03);g.fillCircle(S*.64,S*.24,S*.03);
      // 鼻（砂漠の蛇っぽく）
      g.fillStyle(0xaa5500,1);g.fillCircle(S*.44,S*.33,S*.04);g.fillCircle(S*.56,S*.33,S*.04);
      // 口（大きく開いた炎の口）
      g.fillStyle(0x110000,1);g.fillEllipse(S*.5,S*.4,S*.3,S*.12);
      g.fillStyle(0xff4400,.9);g.fillEllipse(S*.5,S*.38,S*.18,S*.08);
      g.fillStyle(0xffffff,1);
      for(let i=0;i<5;i++)g.fillTriangle(S*(0.37+i*0.065),S*.36,S*(0.34+i*0.065),S*.44,S*(0.4+i*0.065),S*.36);
      // 砂粒エフェクト
      g.fillStyle(0xffcc44,.3);
      for(let i=0;i<6;i++)g.fillCircle(S*(0.15+Math.sin(i*1.1)*0.35+0.35),S*(0.7+Math.cos(i*1.3)*0.15),S*.015);
    });

    // ── 雲猿 ──────────────────────────────────
    mk('enemy_cloud_monkey',88,(g,S)=>{
      // 雲（足元）
      g.fillStyle(0xffffff,0.8);
      g.fillEllipse(S*.5,S*.82,S*.7,S*.28);g.fillEllipse(S*.3,S*.78,S*.38,S*.22);g.fillEllipse(S*.7,S*.78,S*.38,S*.22);
      g.fillStyle(0xccddff,0.5);g.fillEllipse(S*.5,S*.75,S*.5,S*.18);
      // 体
      g.fillStyle(0x886644,1);g.fillEllipse(S*.5,S*.52,S*.4,S*.45);
      // 腕
      g.fillStyle(0x775533,1);g.fillEllipse(S*.22,S*.5,S*.18,S*.34);g.fillEllipse(S*.78,S*.5,S*.18,S*.34);
      g.fillStyle(0x664422,1);g.fillCircle(S*.18,S*.66,S*.09);g.fillCircle(S*.82,S*.66,S*.09);
      // 頭
      g.fillStyle(0x997755,1);g.fillEllipse(S*.5,S*.28,S*.44,S*.4);
      // 耳
      g.fillStyle(0x886644,1);g.fillCircle(S*.28,S*.16,S*.1);g.fillCircle(S*.72,S*.16,S*.1);
      g.fillStyle(0xffaaaa,.6);g.fillCircle(S*.28,S*.16,S*.06);g.fillCircle(S*.72,S*.16,S*.06);
      // 顔（白い）
      g.fillStyle(0xddccaa,1);g.fillEllipse(S*.5,S*.32,S*.28,S*.24);
      // 目
      g.fillStyle(0x222200,1);g.fillCircle(S*.42,S*.26,S*.05);g.fillCircle(S*.58,S*.26,S*.05);
      g.fillStyle(0xffffff,1);g.fillCircle(S*.41,S*.25,S*.02);g.fillCircle(S*.57,S*.25,S*.02);
      // 鼻・口
      g.fillStyle(0x554422,1);g.fillEllipse(S*.5,S*.32,S*.1,S*.07);
      g.fillStyle(0x332211,1);g.fillEllipse(S*.5,S*.37,S*.1,S*.05);
      // 尻尾
      g.fillStyle(0x886644,1);g.fillEllipse(S*.82,S*.38,S*.1,S*.28);g.fillEllipse(S*.9,S*.26,S*.08,S*.18);
    });

    // ── 木霊（トレント）──────────────────────────
    mk('enemy_treant',108,(g,S)=>{
      // 根っこ（足）
      g.fillStyle(0x553311,1);
      g.fillRect(S*.3,S*.75,S*.1,S*.22);g.fillRect(S*.46,S*.78,S*.08,S*.2);g.fillRect(S*.62,S*.75,S*.1,S*.22);
      g.fillRect(S*.24,S*.82,S*.12,S*.06);g.fillRect(S*.64,S*.82,S*.12,S*.06);
      // 幹（胴体）
      g.fillStyle(0x664422,1);g.fillRect(S*.34,S*.32,S*.32,S*.5);
      g.fillStyle(0x775533,.5);g.fillRect(S*.36,S*.34,S*.14,S*.46);
      // 樹皮の模様
      g.lineStyle(2,0x442200,.5);
      for(let i=0;i<4;i++){g.lineBetween(S*.36,S*(0.38+i*0.1),S*.64,S*(0.40+i*0.1));}
      // 葉っぱ（頭）
      g.fillStyle(0x226611,1);g.fillEllipse(S*.5,S*.22,S*.6,S*.48);
      g.fillStyle(0x338822,1);g.fillEllipse(S*.36,S*.18,S*.36,S*.36);g.fillEllipse(S*.64,S*.18,S*.36,S*.36);
      g.fillStyle(0x44aa22,.7);g.fillEllipse(S*.5,S*.12,S*.4,S*.32);
      // 光沢
      g.fillStyle(0x66cc33,.3);g.fillEllipse(S*.42,S*.1,S*.22,S*.18);
      // 顔（木目の中）
      g.fillStyle(0x332200,1);g.fillEllipse(S*.4,S*.26,S*.1,S*.07);g.fillEllipse(S*.6,S*.26,S*.1,S*.07);
      g.fillStyle(0xffaa00,.8);g.fillCircle(S*.4,S*.27,S*.04);g.fillCircle(S*.6,S*.27,S*.04);
      g.fillStyle(0x221100,1);g.fillEllipse(S*.5,S*.34,S*.14,S*.06);
      // 腕（枝）
      g.fillStyle(0x553311,1);
      g.fillRect(S*.12,S*.32,S*.24,S*.08);g.fillRect(S*.64,S*.32,S*.24,S*.08);
      // 枝先の葉
      g.fillStyle(0x338822,1);g.fillEllipse(S*.1,S*.28,S*.18,S*.14);g.fillEllipse(S*.9,S*.28,S*.18,S*.14);
      // 弾のエフェクト（木の実）
      g.fillStyle(0x886633,1);g.fillCircle(S*.08,S*.28,S*.06);g.fillCircle(S*.92,S*.28,S*.06);
    });

    // ── 岩ゴーレム ──────────────────────────────
    mk('enemy_rock_golem',120,(g,S)=>{
      g.fillStyle(0x000000,.2);g.fillEllipse(S*.5,S*.95,S*.7,S*.13);
      // 足（大きな岩）
      g.fillStyle(0x667788,1);g.fillRect(S*.26,S*.7,S*.2,S*.28);g.fillRect(S*.54,S*.7,S*.2,S*.28);
      g.fillStyle(0x556677,1);g.fillRect(S*.22,S*.88,S*.28,S*.1);g.fillRect(S*.5,S*.88,S*.28,S*.1);
      // 胴体（大きな岩塊）
      g.fillStyle(0x778899,1);g.fillEllipse(S*.5,S*.55,S*.62,S*.58);
      // 岩の割れ目
      g.lineStyle(2,0x445566,.6);
      g.lineBetween(S*.36,S*.4,S*.44,S*.62);g.lineBetween(S*.6,S*.38,S*.54,S*.7);g.lineBetween(S*.44,S*.62,S*.56,S*.6);
      // 光沢
      g.fillStyle(0x99aacc,.35);g.fillEllipse(S*.4,S*.42,S*.24,S*.18);
      // 腕（岩の塊）
      g.fillStyle(0x667788,1);g.fillEllipse(S*.14,S*.52,S*.22,S*.38);g.fillEllipse(S*.86,S*.52,S*.22,S*.38);
      g.fillStyle(0x778899,.4);g.fillEllipse(S*.12,S*.46,S*.14,S*.22);g.fillEllipse(S*.88,S*.46,S*.14,S*.22);
      // 拳（角張った岩）
      g.fillStyle(0x556677,1);g.fillRect(S*.06,S*.64,S*.16,S*.14);g.fillRect(S*.78,S*.64,S*.16,S*.14);
      // 頭（岩）
      g.fillStyle(0x889aaa,1);g.fillEllipse(S*.5,S*.26,S*.46,S*.42);
      // 目（水晶・光る）
      g.fillStyle(0x44aaff,1);g.fillEllipse(S*.36,S*.25,S*.14,S*.1);g.fillEllipse(S*.64,S*.25,S*.14,S*.1);
      g.fillStyle(0x88ddff,.8);g.fillEllipse(S*.36,S*.24,S*.08,S*.06);g.fillEllipse(S*.64,S*.24,S*.08,S*.06);
      // 口（岩の割れ目）
      g.fillStyle(0x334455,1);g.fillRect(S*.36,S*.34,S*.28,S*.06);
      g.fillStyle(0x667788,.5);g.fillRect(S*.38,S*.35,S*.24,S*.04);
    });

    // ── 巨人 ─────────────────────────────────────
    mk('enemy_giant',128,(g,S)=>{
      g.fillStyle(0x000000,.2);g.fillEllipse(S*.5,S*.95,S*.72,S*.13);
      // 足
      g.fillStyle(0xcc9966,1);g.fillRect(S*.3,S*.72,S*.18,S*.26);g.fillRect(S*.52,S*.72,S*.18,S*.26);
      g.fillStyle(0xaa7744,1);g.fillRect(S*.26,S*.9,S*.24,S*.1);g.fillRect(S*.5,S*.9,S*.24,S*.1);
      // 胴体
      g.fillStyle(0xddaa77,1);g.fillEllipse(S*.5,S*.55,S*.56,S*.52);
      // 腰巻き
      g.fillStyle(0x886633,1);g.fillRect(S*.28,S*.65,S*.44,S*.12);
      // 腕（太い）
      g.fillStyle(0xcc9966,1);g.fillEllipse(S*.16,S*.5,S*.24,S*.42);g.fillEllipse(S*.84,S*.5,S*.24,S*.42);
      // 拳
      g.fillStyle(0xbb8855,1);g.fillCircle(S*.12,S*.7,S*.1);g.fillCircle(S*.88,S*.7,S*.1);
      // 棍棒（武器）
      g.fillStyle(0x775522,1);g.fillRect(S*.86,S*.3,S*.08,S*.4);
      g.fillStyle(0x664411,1);g.fillCircle(S*.9,S*.28,S*.1);
      // 首
      g.fillStyle(0xddaa77,1);g.fillEllipse(S*.5,S*.32,S*.3,S*.22);
      // 頭（大きい）
      g.fillStyle(0xeebbaa,1);g.fillEllipse(S*.5,S*.2,S*.44,S*.38);
      // 眉（怒り）
      g.fillStyle(0x664422,1);g.fillRect(S*.3,S*.14,S*.16,S*.05);g.fillRect(S*.54,S*.14,S*.16,S*.05);
      // 目（赤い怒り）
      g.fillStyle(0xdd2200,1);g.fillEllipse(S*.36,S*.2,S*.12,S*.09);g.fillEllipse(S*.64,S*.2,S*.12,S*.09);
      g.fillStyle(0x000000,1);g.fillCircle(S*.36,S*.21,S*.05);g.fillCircle(S*.64,S*.21,S*.05);
      // 鼻
      g.fillStyle(0xcc9966,1);g.fillEllipse(S*.5,S*.27,S*.12,S*.09);
      // 口（怒り・歯）
      g.fillStyle(0x551100,1);g.fillEllipse(S*.5,S*.33,S*.22,S*.09);
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.4,S*.31,S*.38,S*.38,S*.44,S*.31);g.fillTriangle(S*.56,S*.31,S*.52,S*.31,S*.58,S*.38);
    });

    // ── 雷神（ボス6）────────────────────────────
    mk('enemy_thunder_god',160,(g,S)=>{
      g.fillStyle(0x000000,.25);g.fillEllipse(S*.5,S*.96,S*.82,S*.13);
      // 雷オーラ（外側に放射状）
      g.fillStyle(0xffee00,.1);g.fillCircle(S*.5,S*.5,S*.54);
      g.fillStyle(0xffaa00,.07);g.fillCircle(S*.5,S*.5,S*.5);
      // 雷光（外周にギザギザ）
      g.fillStyle(0xffff00,.8);
      for(let i=0;i<12;i++){
        const a=(i/12)*Math.PI*2, r1=S*.44, r2=S*.52;
        const x1=S*.5+Math.cos(a)*r1, y1=S*.5+Math.sin(a)*r1;
        const x2=S*.5+Math.cos(a+(Math.PI/12))*r2, y2=S*.5+Math.sin(a+(Math.PI/12))*r2;
        const x3=S*.5+Math.cos(a+Math.PI/6)*r1, y3=S*.5+Math.sin(a+Math.PI/6)*r1;
        g.fillTriangle(x1,y1,x2,y2,x3,y3);
      }
      // マント（雷雲色）
      g.fillStyle(0x222244,1);
      g.fillTriangle(S*.5,S*.32,S*.05,S*.96,S*.95,S*.96);
      g.fillStyle(0x334466,.7);g.fillTriangle(S*.5,S*.36,S*.1,S*.92,S*.9,S*.92);
      // マントに雷紋
      g.fillStyle(0xffee00,.3);
      g.fillTriangle(S*.5,S*.44,S*.4,S*.66,S*.6,S*.66);
      g.fillTriangle(S*.4,S*.66,S*.44,S*.78,S*.36,S*.78);
      // 胸部鎧
      g.fillStyle(0x445588,1);g.fillEllipse(S*.5,S*.56,S*.48,S*.4);
      g.fillStyle(0x6677aa,.5);g.fillEllipse(S*.5,S*.52,S*.32,S*.26);
      // 腕（鎧）
      g.fillStyle(0x334477,1);g.fillEllipse(S*.16,S*.5,S*.2,S*.36);g.fillEllipse(S*.84,S*.5,S*.2,S*.36);
      // 雷の槍（右手）
      g.fillStyle(0xffee00,1);
      g.fillRect(S*.88,S*.12,S*.06,S*.5);
      g.fillTriangle(S*.85,S*.12,S*.91,S*.0,S*.97,S*.12);
      g.fillStyle(0xffffff,.8);g.fillRect(S*.9,S*.14,S*.02,S*.46);
      // 盾（左手）
      g.fillStyle(0x334477,1);g.fillEllipse(S*.1,S*.52,S*.14,S*.22);
      g.fillStyle(0xffee00,.8);g.fillTriangle(S*.1,S*.44,S*.06,S*.6,S*.14,S*.6);
      // 頭（兜）
      g.fillStyle(0x445588,1);g.fillEllipse(S*.5,S*.26,S*.48,S*.42);
      // 兜の飾り（雷角）
      g.fillStyle(0xffee00,1);
      g.fillTriangle(S*.36,S*.16,S*.28,S*-.02,S*.44,S*.18);
      g.fillTriangle(S*.64,S*.16,S*.56,S*.18,S*.72,S*-.02);
      // 目（雷光・青白）
      g.fillStyle(0x88eeff,1);g.fillEllipse(S*.36,S*.26,S*.14,S*.1);g.fillEllipse(S*.64,S*.26,S*.14,S*.1);
      g.fillStyle(0xffffff,1);g.fillEllipse(S*.36,S*.25,S*.08,S*.06);g.fillEllipse(S*.64,S*.25,S*.08,S*.06);
      g.fillStyle(0x0044aa,.8);g.fillCircle(S*.36,S*.26,S*.03);g.fillCircle(S*.64,S*.26,S*.03);
      // 口（稲妻）
      g.fillStyle(0xffee00,.9);g.fillEllipse(S*.5,S*.36,S*.22,S*.08);
      g.fillStyle(0xffffff,.8);
      for(let i=0;i<4;i++)g.fillTriangle(S*(0.4+i*0.06),S*.34,S*(0.37+i*0.06),S*.42,S*(0.43+i*0.06),S*.34);
      // 稲妻エフェクト
      g.lineStyle(2,0xffff00,.7);
      g.lineBetween(S*.5,S*.52,S*.38,S*.66);g.lineBetween(S*.38,S*.66,S*.46,S*.72);g.lineBetween(S*.46,S*.72,S*.34,S*.86);
      g.lineBetween(S*.5,S*.52,S*.62,S*.68);g.lineBetween(S*.62,S*.68,S*.54,S*.74);g.lineBetween(S*.54,S*.74,S*.66,S*.88);
    });

    // ── オークウォリアー ──────────────────────────
    mk('enemy_orc_warrior',100,(g,S)=>{
      g.fillStyle(0x000000,.18);g.fillEllipse(S*.5,S*.93,S*.6,S*.12);
      // 足（どっしり）
      g.fillStyle(0x4a6e2a,1);g.fillRect(S*.3,S*.7,S*.16,S*.24);g.fillRect(S*.54,S*.7,S*.16,S*.24);
      g.fillStyle(0x3a5a1e,1);g.fillRect(S*.26,S*.88,S*.22,S*.1);g.fillRect(S*.52,S*.88,S*.22,S*.1);
      // 胴体（鎧）
      g.fillStyle(0x5a7a32,1);g.fillEllipse(S*.5,S*.54,S*.52,S*.46);
      g.fillStyle(0x4a7020,.6);g.fillEllipse(S*.5,S*.5,S*.34,S*.28);
      // 肩当
      g.fillStyle(0x8a6028,1);g.fillEllipse(S*.18,S*.46,S*.2,S*.14);g.fillEllipse(S*.82,S*.46,S*.2,S*.14);
      // 腕
      g.fillStyle(0x4a6e2a,1);g.fillEllipse(S*.15,S*.52,S*.18,S*.3);g.fillEllipse(S*.85,S*.52,S*.18,S*.3);
      // 斧（武器）
      g.fillStyle(0x887040,1);g.fillRect(S*.86,S*.28,S*.06,S*.38);
      g.fillStyle(0x777777,1);g.fillTriangle(S*.86,S*.28,S*.98,S*.2,S*.98,S*.42);
      g.fillStyle(0xaaaaaa,.5);g.fillTriangle(S*.86,S*.3,S*.96,S*.24,S*.96,S*.36);
      // 首
      g.fillStyle(0x5a8030,1);g.fillEllipse(S*.5,S*.3,S*.28,S*.2);
      // 頭（緑の肌）
      g.fillStyle(0x6a9038,1);g.fillEllipse(S*.5,S*.2,S*.4,S*.34);
      // キバ
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.42,S*.3,S*.4,S*.38,S*.46,S*.3);g.fillTriangle(S*.58,S*.3,S*.54,S*.3,S*.6,S*.38);
      // 目（赤い）
      g.fillStyle(0xdd2200,1);g.fillCircle(S*.38,S*.18,S*.06);g.fillCircle(S*.62,S*.18,S*.06);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.19,S*.03);g.fillCircle(S*.62,S*.19,S*.03);
      // 眉（太い・怒り）
      g.fillStyle(0x223300,1);g.fillRect(S*.3,S*.12,S*.14,S*.04);g.fillRect(S*.56,S*.12,S*.14,S*.04);
      // ヘルム
      g.fillStyle(0x886620,1);g.fillEllipse(S*.5,S*.12,S*.38,S*.18);g.fillRect(S*.42,S*.1,S*.16,S*.1);
    });

    // ── ハイオーク ──────────────────────────────
    mk('enemy_orc_high',112,(g,S)=>{
      g.fillStyle(0x000000,.2);g.fillEllipse(S*.5,S*.94,S*.65,S*.13);
      // 足（重厚な鎧）
      g.fillStyle(0x6a5020,1);g.fillRect(S*.28,S*.7,S*.18,S*.26);g.fillRect(S*.54,S*.7,S*.18,S*.26);
      g.fillStyle(0x8a7030,1);g.fillRect(S*.24,S*.88,S*.26,S*.1);g.fillRect(S*.5,S*.88,S*.26,S*.1);
      // 胴体（豪華な鎧）
      g.fillStyle(0x8a7030,1);g.fillEllipse(S*.5,S*.55,S*.56,S*.5);
      g.fillStyle(0xaa9040,.5);g.fillEllipse(S*.5,S*.5,S*.36,S*.3);
      // 紋章
      g.fillStyle(0xdd2200,1);g.fillTriangle(S*.5,S*.42,S*.42,S*.58,S*.58,S*.58);
      // 肩当（大きい）
      g.fillStyle(0x6a5020,1);g.fillEllipse(S*.14,S*.46,S*.26,S*.18);g.fillEllipse(S*.86,S*.46,S*.26,S*.18);
      g.fillStyle(0xaa8030,.5);g.fillEllipse(S*.12,S*.42,S*.16,S*.1);g.fillEllipse(S*.88,S*.42,S*.16,S*.1);
      // 腕
      g.fillStyle(0x6a8040,1);g.fillEllipse(S*.14,S*.54,S*.2,S*.34);g.fillEllipse(S*.86,S*.54,S*.2,S*.34);
      // 大剣
      g.fillStyle(0x999999,1);g.fillRect(S*.88,S*.14,S*.08,S*.54);
      g.fillStyle(0xbbbbbb,.7);g.fillRect(S*.9,S*.16,S*.04,S*.5);
      g.fillStyle(0xaa8820,1);g.fillRect(S*.82,S*.44,S*.22,S*.06);g.fillCircle(S*.91,S*.14,S*.07);
      // 頭（大きい）
      g.fillStyle(0x7aa040,1);g.fillEllipse(S*.5,S*.22,S*.44,S*.38);
      // 王冠風ヘルム
      g.fillStyle(0x8a6020,1);g.fillEllipse(S*.5,S*.12,S*.42,S*.18);
      g.fillStyle(0xcc9930,1);
      g.fillTriangle(S*.34,S*.12,S*.3,S*.02,S*.38,S*.12);g.fillTriangle(S*.5,S*.1,S*.46,S*.0,S*.54,S*.1);g.fillTriangle(S*.66,S*.12,S*.62,S*.12,S*.7,S*.02);
      // 目
      g.fillStyle(0xff3300,1);g.fillEllipse(S*.36,S*.22,S*.14,S*.1);g.fillEllipse(S*.64,S*.22,S*.14,S*.1);
      g.fillStyle(0x000000,1);g.fillCircle(S*.36,S*.23,S*.05);g.fillCircle(S*.64,S*.23,S*.05);
      // キバ（大きい）
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.4,S*.32,S*.38,S*.42,S*.44,S*.32);g.fillTriangle(S*.6,S*.32,S*.56,S*.32,S*.62,S*.42);
    });

    // ── オークレディ ─────────────────────────────
    mk('enemy_orc_lady',88,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.93,S*.52,S*.12);
      // 足（ローブ）
      g.fillStyle(0x662288,1);g.fillRect(S*.32,S*.65,S*.36,S*.32);
      g.fillStyle(0x551177,.7);g.fillEllipse(S*.5,S*.82,S*.38,S*.1);
      // 胴体（ローブ）
      g.fillStyle(0x7733aa,1);g.fillEllipse(S*.5,S*.52,S*.46,S*.46);
      g.fillStyle(0x9944cc,.4);g.fillEllipse(S*.5,S*.48,S*.3,S*.28);
      // 装飾
      g.fillStyle(0xffcc00,.8);g.fillEllipse(S*.5,S*.44,S*.14,S*.1);
      // 腕
      g.fillStyle(0x5a8030,1);g.fillEllipse(S*.16,S*.5,S*.16,S*.3);g.fillEllipse(S*.84,S*.5,S*.16,S*.3);
      // 杖（左手）
      g.fillStyle(0x886633,1);g.fillRect(S*.1,S*.2,S*.05,S*.5);
      g.fillStyle(0xaa44ff,1);g.fillCircle(S*.125,S*.18,S*.08);
      g.fillStyle(0xffffff,.6);g.fillCircle(S*.12,S*.16,S*.04);
      // 頭
      g.fillStyle(0x6a9038,1);g.fillEllipse(S*.5,S*.22,S*.38,S*.34);
      // 帽子（魔女風）
      g.fillStyle(0x441166,1);
      g.fillTriangle(S*.5,S*.0,S*.3,S*.14,S*.7,S*.14);
      g.fillEllipse(S*.5,S*.15,S*.46,S*.1);
      g.fillStyle(0x7733aa,.5);g.fillTriangle(S*.5,S*.02,S*.36,S*.13,S*.64,S*.13);
      // 目（黄色・魔法使い）
      g.fillStyle(0xffdd00,1);g.fillCircle(S*.38,S*.22,S*.07);g.fillCircle(S*.62,S*.22,S*.07);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.23,S*.04);g.fillCircle(S*.62,S*.23,S*.04);
      // キバ（小さい）
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.45,S*.3,S*.43,S*.36,S*.48,S*.3);g.fillTriangle(S*.55,S*.3,S*.52,S*.3,S*.57,S*.36);
    });

    // ── オークアーチャー ─────────────────────────
    mk('enemy_orc_archer',92,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.93,S*.56,S*.12);
      // 足
      g.fillStyle(0x4a5e22,1);g.fillRect(S*.32,S*.7,S*.14,S*.24);g.fillRect(S*.54,S*.7,S*.14,S*.24);
      // 胴体（革鎧）
      g.fillStyle(0x8a6028,1);g.fillEllipse(S*.5,S*.52,S*.46,S*.44);
      g.fillStyle(0x6a4818,.6);
      for(let i=0;i<3;i++)g.fillRect(S*.28,S*(0.42+i*0.08),S*.44,S*.04);
      // 腕（弓を持つ）
      g.fillStyle(0x5a7830,1);g.fillEllipse(S*.15,S*.5,S*.16,S*.3);g.fillEllipse(S*.85,S*.5,S*.16,S*.3);
      // 弓
      // 弓（曲線をfillRectで近似）
      g.fillStyle(0x886633,1);g.fillRect(S*.04,S*.2,S*.04,S*.58);
      // 弓の弦（右に弓なり）
      g.fillStyle(0xcc9944,1);
      g.fillRect(S*.0,S*.2,S*.04,S*.04);g.fillRect(S*.0,S*.76,S*.04,S*.04);
      g.fillRect(S*-.02,S*.46,S*.04,S*.06);
      // 弦
      g.lineStyle(1,0xddddcc,0.8);
      g.lineBetween(S*.06,S*.49,S*.32,S*.49);
      // 矢（番えている）
      g.fillStyle(0x886633,1);g.fillRect(S*.08,S*.47,S*.24,S*.03);
      g.fillStyle(0x777777,1);g.fillTriangle(S*.32,S*.47,S*.38,S*.485,S*.32,S*.51);
      g.fillStyle(0xdd4422,.8);g.fillRect(S*.08,S*.47,S*.04,S*.03);
      // 頭
      g.fillStyle(0x6a9038,1);g.fillEllipse(S*.5,S*.22,S*.38,S*.32);
      // フード
      g.fillStyle(0x4a5e22,1);g.fillEllipse(S*.5,S*.16,S*.42,S*.18);g.fillEllipse(S*.5,S*.2,S*.36,S*.2);
      // 目
      g.fillStyle(0xffaa00,1);g.fillCircle(S*.4,S*.2,S*.06);g.fillCircle(S*.6,S*.2,S*.06);
      g.fillStyle(0x000000,1);g.fillCircle(S*.4,S*.21,S*.03);g.fillCircle(S*.6,S*.21,S*.03);
      // キバ
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.44,S*.3,S*.42,S*.36,S*.47,S*.3);g.fillTriangle(S*.56,S*.3,S*.53,S*.3,S*.58,S*.36);
    });

    // ── オークジェネラル（ボス7）──────────────────
    mk('enemy_orc_general',152,(g,S)=>{
      g.fillStyle(0x000000,.25);g.fillEllipse(S*.5,S*.96,S*.82,S*.13);
      // マント（将軍の）
      g.fillStyle(0xaa1100,1);
      g.fillTriangle(S*.5,S*.34,S*.04,S*.96,S*.5,S*.86);g.fillTriangle(S*.5,S*.34,S*.96,S*.96,S*.5,S*.86);
      g.fillStyle(0xcc2200,.5);g.fillTriangle(S*.5,S*.38,S*.1,S*.92,S*.5,S*.84);g.fillTriangle(S*.5,S*.38,S*.9,S*.92,S*.5,S*.84);
      // 脚（重厚な鎧）
      g.fillStyle(0x886620,1);g.fillRect(S*.3,S*.72,S*.18,S*.26);g.fillRect(S*.52,S*.72,S*.18,S*.26);
      g.fillStyle(0xaa8830,1);g.fillRect(S*.26,S*.9,S*.24,S*.1);g.fillRect(S*.5,S*.9,S*.24,S*.1);
      // 胴体（豪華金鎧）
      g.fillStyle(0xaa8820,1);g.fillEllipse(S*.5,S*.56,S*.58,S*.52);
      g.fillStyle(0xccaa30,.6);g.fillEllipse(S*.5,S*.52,S*.4,S*.32);
      // 紋章（骸骨マーク）
      g.fillStyle(0xffffff,.9);g.fillEllipse(S*.5,S*.48,S*.14,S*.12);
      g.fillStyle(0x000000,1);g.fillCircle(S*.46,S*.47,S*.03);g.fillCircle(S*.54,S*.47,S*.03);
      g.fillStyle(0xffffff,.8);g.fillRect(S*.44,S*.52,S*.12,S*.04);
      // 大きな肩当
      g.fillStyle(0x886620,1);g.fillEllipse(S*.12,S*.46,S*.28,S*.2);g.fillEllipse(S*.88,S*.46,S*.28,S*.2);
      g.fillStyle(0xaa8828,.6);g.fillEllipse(S*.1,S*.42,S*.18,S*.12);g.fillEllipse(S*.9,S*.42,S*.18,S*.12);
      // スパイク
      g.fillStyle(0x666666,1);
      g.fillTriangle(S*.06,S*.38,S*.04,S*.28,S*.1,S*.38);g.fillTriangle(S*.14,S*.38,S*.12,S*.28,S*.18,S*.38);
      g.fillTriangle(S*.86,S*.38,S*.82,S*.28,S*.88,S*.38);g.fillTriangle(S*.94,S*.38,S*.9,S*.38,S*.96,S*.28);
      // 腕
      g.fillStyle(0x7a9040,1);g.fillEllipse(S*.12,S*.56,S*.22,S*.38);g.fillEllipse(S*.88,S*.56,S*.22,S*.38);
      // 巨大戦斧（右手）
      g.fillStyle(0xaa8830,1);g.fillRect(S*.9,S*.1,S*.08,S*.56);
      g.fillStyle(0x888888,1);
      g.fillTriangle(S*.9,S*.1,S*1.06,S*.0,S*1.06,S*.3);g.fillTriangle(S*.9,S*.3,S*1.06,S*.3,S*1.06,S*.5);
      g.fillStyle(0xaaaaaa,.6);g.fillTriangle(S*.9,S*.12,S*1.04,S*.04,S*1.04,S*.24);
      // 盾（左手）
      g.fillStyle(0x886620,1);g.fillEllipse(S*.08,S*.58,S*.16,S*.24);
      g.fillStyle(0xaa1100,1);g.fillTriangle(S*.08,S*.5,S*.04,S*.66,S*.12,S*.66);
      // 頭（大きな兜）
      g.fillStyle(0x8aaa48,1);g.fillEllipse(S*.5,S*.24,S*.48,S*.4);
      // 将軍の兜（立派）
      g.fillStyle(0x886620,1);g.fillEllipse(S*.5,S*.14,S*.48,S*.2);
      // 兜の飾り羽根
      g.fillStyle(0xaa1100,1);g.fillRect(S*.46,S*.02,S*.08,S*.14);
      g.fillStyle(0xff2200,.7);g.fillEllipse(S*.5,S*.04,S*.06,S*.1);
      // 兜のスパイク2本
      g.fillStyle(0x888888,1);g.fillTriangle(S*.36,S*.14,S*.3,S*.0,S*.42,S*.14);g.fillTriangle(S*.64,S*.14,S*.58,S*.14,S*.7,S*.0);
      // 目（怒りの赤）
      g.fillStyle(0xff2200,1);g.fillEllipse(S*.36,S*.24,S*.14,S*.1);g.fillEllipse(S*.64,S*.24,S*.14,S*.1);
      g.fillStyle(0xff6600,.8);g.fillEllipse(S*.36,S*.24,S*.08,S*.06);g.fillEllipse(S*.64,S*.24,S*.08,S*.06);
      // 鼻（大きい）
      g.fillStyle(0x5a8030,1);g.fillEllipse(S*.5,S*.32,S*.14,S*.1);
      // 口（キバ）
      g.fillStyle(0x223300,1);g.fillEllipse(S*.5,S*.38,S*.26,S*.1);
      g.fillStyle(0xffffff,1);
      g.fillTriangle(S*.4,S*.36,S*.38,S*.44,S*.44,S*.36);g.fillTriangle(S*.6,S*.36,S*.56,S*.36,S*.62,S*.44);
      g.fillTriangle(S*.48,S*.36,S*.46,S*.42,S*.5,S*.36);g.fillTriangle(S*.52,S*.36,S*.5,S*.36,S*.54,S*.42);
    });

    // ── カニ ─────────────────────────────────────
    mk('enemy_crab',88,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.93,S*.65,S*.10);
      // 8本足(下4本)
      g.fillStyle(0xaa3322,1);
      [[.18,.62,.10,.78],[.28,.66,.18,.84],[.34,.72,.28,.92],[.40,.74,.36,.94]].forEach(([x1,y1,x2,y2])=>{
        g.fillTriangle(S*x1,S*y1,S*(x1+.04),S*y1,S*x2,S*y2);
      });
      [[.82,.62,.90,.78],[.72,.66,.82,.84],[.66,.72,.72,.92],[.60,.74,.64,.94]].forEach(([x1,y1,x2,y2])=>{
        g.fillTriangle(S*x1,S*y1,S*(x1-.04),S*y1,S*x2,S*y2);
      });
      // 大きなハサミ(左)
      g.fillStyle(0xcc4422,1);
      g.fillEllipse(S*.18,S*.40,S*.20,S*.16);
      g.fillTriangle(S*.06,S*.36,S*.20,S*.34,S*.18,S*.46);
      g.fillStyle(0x882211,1);
      g.fillTriangle(S*.06,S*.30,S*.18,S*.32,S*.10,S*.38);
      g.fillTriangle(S*.06,S*.46,S*.18,S*.42,S*.10,S*.50);
      // 大きなハサミ(右)
      g.fillStyle(0xcc4422,1);
      g.fillEllipse(S*.82,S*.40,S*.20,S*.16);
      g.fillTriangle(S*.94,S*.36,S*.80,S*.34,S*.82,S*.46);
      g.fillStyle(0x882211,1);
      g.fillTriangle(S*.94,S*.30,S*.82,S*.32,S*.90,S*.38);
      g.fillTriangle(S*.94,S*.46,S*.82,S*.42,S*.90,S*.50);
      // 甲羅(本体)
      g.fillStyle(0xcc3322,1);g.fillEllipse(S*.5,S*.55,S*.62,S*.46);
      // 甲羅の光沢
      g.fillStyle(0xee5544,.6);g.fillEllipse(S*.42,S*.46,S*.30,S*.18);
      g.fillStyle(0xff8866,.4);g.fillEllipse(S*.4,S*.42,S*.16,S*.08);
      // 甲羅の縁取り
      g.fillStyle(0x661100,.5);g.fillEllipse(S*.5,S*.62,S*.6,S*.10);
      // 目(柄付き・カニらしさ)
      g.fillStyle(0xcc3322,1);
      g.fillRect(S*.40,S*.32,S*.04,S*.12);g.fillRect(S*.56,S*.32,S*.04,S*.12);
      g.fillStyle(0xffffff,1);g.fillCircle(S*.42,S*.30,S*.05);g.fillCircle(S*.58,S*.30,S*.05);
      g.fillStyle(0x111100,1);g.fillCircle(S*.42,S*.30,S*.03);g.fillCircle(S*.58,S*.30,S*.03);
      // 口
      g.fillStyle(0x661100,1);g.fillRect(S*.46,S*.55,S*.08,S*.03);
      g.fillStyle(0xffffff,.7);g.fillCircle(S*.50,S*.62,S*.02);
    });

    // ── オットセイ ───────────────────────────────
    mk('enemy_seal',96,(g,S)=>{
      g.fillStyle(0x000000,.18);g.fillEllipse(S*.5,S*.94,S*.7,S*.1);
      // 後ろヒレ
      g.fillStyle(0x554433,1);
      g.fillTriangle(S*.36,S*.86,S*.64,S*.86,S*.50,S*1.0);
      g.fillStyle(0x443322,1);
      g.fillTriangle(S*.42,S*.84,S*.58,S*.84,S*.50,S*.96);
      // 胴体(横長の楕円)
      g.fillStyle(0x665544,1);g.fillEllipse(S*.5,S*.62,S*.7,S*.40);
      // お腹(明るい色)
      g.fillStyle(0xbbaa88,1);g.fillEllipse(S*.5,S*.72,S*.5,S*.22);
      // 胴体の光沢
      g.fillStyle(0x887766,.5);g.fillEllipse(S*.4,S*.55,S*.30,S*.14);
      // 前ヒレ(左右)
      g.fillStyle(0x554433,1);
      g.fillEllipse(S*.20,S*.65,S*.12,S*.18);
      g.fillEllipse(S*.80,S*.65,S*.12,S*.18);
      // 首〜頭
      g.fillStyle(0x665544,1);g.fillEllipse(S*.5,S*.36,S*.42,S*.36);
      // 頭の光沢
      g.fillStyle(0x887766,.4);g.fillEllipse(S*.42,S*.30,S*.20,S*.10);
      // 耳(小さく)
      g.fillStyle(0x443322,1);
      g.fillEllipse(S*.30,S*.22,S*.06,S*.05);
      g.fillEllipse(S*.70,S*.22,S*.06,S*.05);
      // 目(つぶらな黒目)
      g.fillStyle(0x000000,1);g.fillCircle(S*.40,S*.36,S*.06);g.fillCircle(S*.60,S*.36,S*.06);
      g.fillStyle(0xffffff,1);g.fillCircle(S*.42,S*.34,S*.025);g.fillCircle(S*.62,S*.34,S*.025);
      // 鼻
      g.fillStyle(0x111100,1);g.fillEllipse(S*.5,S*.45,S*.10,S*.08);
      g.fillStyle(0xffffff,.5);g.fillCircle(S*.48,S*.435,S*.02);
      // ひげ
      g.fillStyle(0xffffff,.7);
      [-1,0,1].forEach(i=>{
        g.fillRect(S*.30,S*(.48+i*.02),S*.10,S*.005);
        g.fillRect(S*.60,S*(.48+i*.02),S*.10,S*.005);
      });
      // 口
      g.fillStyle(0x331100,1);g.fillRect(S*.46,S*.50,S*.08,S*.015);
    });

    // ── クマ ──────────────────────────────────
    mk('enemy_bear',104,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.93,S*.6,S*.12);
      // 尻尾
      g.fillStyle(0xddbbaa,1);g.fillCircle(S*.8,S*.65,S*.05);
      // 胴体
      g.fillStyle(0x774422,1);g.fillEllipse(S*.5,S*.62,S*.56,S*.5);
      // 足4本
      g.fillStyle(0x663311,1);
      g.fillRect(S*.22,S*.72,S*.12,S*.22);g.fillRect(S*.36,S*.75,S*.12,S*.18);
      g.fillRect(S*.52,S*.75,S*.12,S*.18);g.fillRect(S*.66,S*.72,S*.12,S*.22);
      // 爪
      g.fillStyle(0x221100,1);
      [.24,.28,.32].forEach(x=>g.fillTriangle(S*x,S*.94,S*(x-.02),S*1.0,S*(x+.02),S*.94));
      [.68,.72,.76].forEach(x=>g.fillTriangle(S*x,S*.94,S*(x-.02),S*1.0,S*(x+.02),S*.94));
      // 頭
      g.fillStyle(0x885533,1);g.fillEllipse(S*.5,S*.33,S*.48,S*.42);
      // 耳
      g.fillStyle(0x774422,1);g.fillCircle(S*.3,S*.18,S*.1);g.fillCircle(S*.7,S*.18,S*.1);
      g.fillStyle(0xcc8866,.5);g.fillCircle(S*.3,S*.18,S*.06);g.fillCircle(S*.7,S*.18,S*.06);
      // 目
      g.fillStyle(0x111100,1);g.fillCircle(S*.38,S*.3,S*.06);g.fillCircle(S*.62,S*.3,S*.06);
      g.fillStyle(0xffffff,1);g.fillCircle(S*.36,S*.28,S*.02);g.fillCircle(S*.6,S*.28,S*.02);
      // 鼻
      g.fillStyle(0x221100,1);g.fillEllipse(S*.5,S*.4,S*.14,S*.1);
      // 口
      g.fillStyle(0x331100,1);g.fillEllipse(S*.5,S*.46,S*.12,S*.06);
    });

    // ── カブトムシ ────────────────────────────────
    mk('enemy_beetle',88,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.93,S*.55,S*.12);
      // 足6本
      g.fillStyle(0x221100,1);
      [[.25,.45,.08,.65],[.25,.5,.05,.7],[.25,.56,.08,.74],
       [.75,.45,.92,.65],[.75,.5,.95,.7],[.75,.56,.92,.74]].forEach(([x1,y1,x2,y2])=>{
        g.fillRect(S*Math.min(x1,x2),S*y1,S*Math.abs(x2-x1)+S*.04,S*.04);
      });
      // 下翅
      g.fillStyle(0x664400,1);g.fillEllipse(S*.5,S*.6,S*.5,S*.5);
      // 上翅（甲羅）
      g.fillStyle(0x225500,1);
      g.fillEllipse(S*.35,S*.55,S*.3,S*.46);g.fillEllipse(S*.65,S*.55,S*.3,S*.46);
      // 甲羅の光沢
      g.fillStyle(0x44aa00,.35);g.fillEllipse(S*.35,S*.48,S*.18,S*.26);g.fillEllipse(S*.65,S*.48,S*.18,S*.26);
      // 胸部
      g.fillStyle(0x333300,1);g.fillEllipse(S*.5,S*.38,S*.32,S*.22);
      // 頭
      g.fillStyle(0x222200,1);g.fillEllipse(S*.5,S*.26,S*.28,S*.22);
      // 角（1本）
      g.fillStyle(0x111100,1);g.fillRect(S*.46,S*.06,S*.08,S*.22);
      g.fillTriangle(S*.42,S*.14,S*.46,S*.06,S*.54,S*.14);
      // 目（複眼）
      g.fillStyle(0xff6600,1);g.fillCircle(S*.38,S*.25,S*.06);g.fillCircle(S*.62,S*.25,S*.06);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.26,S*.03);g.fillCircle(S*.62,S*.26,S*.03);
    });

    // ── ハチ ─────────────────────────────────────
    mk('enemy_hornet',76,(g,S)=>{
      // 翅（透明感）
      g.fillStyle(0xaaccff,.25);
      g.fillEllipse(S*.3,S*.28,S*.38,S*.22);g.fillEllipse(S*.7,S*.28,S*.38,S*.22);
      g.fillStyle(0x8899ff,.15);
      g.fillEllipse(S*.28,S*.38,S*.3,S*.18);g.fillEllipse(S*.72,S*.38,S*.3,S*.18);
      g.lineStyle(1,0x6688cc,.4);
      g.strokeEllipse(S*.3,S*.28,S*.38,S*.22);g.strokeEllipse(S*.7,S*.28,S*.38,S*.22);
      // 胴体（縞模様）
      const stripes=[0xffcc00,0x111100,0xffcc00,0x111100,0xffcc00];
      stripes.forEach((c,i)=>{g.fillStyle(c,1);g.fillRect(S*.35,S*(0.42+i*0.1),S*.3,S*.09);});
      // 腹部先端
      g.fillStyle(0x111100,1);g.fillTriangle(S*.38,S*.92,S*.5,S*1.02,S*.62,S*.92);
      g.fillStyle(0xffcc00,.5);g.fillTriangle(S*.5,S*.95,S*.5,S*1.02,S*.54,S*.95);
      // 胸部
      g.fillStyle(0xdd9900,1);g.fillEllipse(S*.5,S*.38,S*.3,S*.22);
      // 頭
      g.fillStyle(0x111100,1);g.fillCircle(S*.5,S*.24,S*.14);
      // 触角
      g.lineStyle(2,0x221100,1);
      g.lineBetween(S*.44,S*.14,S*.34,S*.04);g.lineBetween(S*.56,S*.14,S*.66,S*.04);
      g.fillStyle(0x221100,1);g.fillCircle(S*.34,S*.04,S*.03);g.fillCircle(S*.66,S*.04,S*.03);
      // 目
      g.fillStyle(0xff4400,1);g.fillCircle(S*.42,S*.23,S*.06);g.fillCircle(S*.58,S*.23,S*.06);
      g.fillStyle(0x000000,1);g.fillCircle(S*.42,S*.24,S*.03);g.fillCircle(S*.58,S*.24,S*.03);
      // 口（牙）
      g.fillStyle(0xdd9900,1);g.fillTriangle(S*.44,S*.32,S*.42,S*.38,S*.48,S*.32);g.fillTriangle(S*.56,S*.32,S*.52,S*.32,S*.58,S*.38);
    });

    // ── スコーピオンクイーン ──────────────────────
    mk('enemy_scorpion_queen',108,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.93,S*.58,S*.12);
      // 大きな尻尾（S字）
      g.fillStyle(0x881100,1);
      g.fillEllipse(S*.76,S*.72,S*.14,S*.22);g.fillEllipse(S*.86,S*.56,S*.12,S*.18);
      g.fillEllipse(S*.9,S*.4,S*.1,S*.16);g.fillEllipse(S*.88,S*.26,S*.08,S*.14);
      // 毒針（大）
      g.fillStyle(0x22cc22,1);g.fillTriangle(S*.88,S*.14,S*.82,S*.26,S*.94,S*.2);
      // 足（8本）
      g.fillStyle(0x991100,1);
      [[.25,.42,.08,.64],[.22,.48,.05,.7],[.23,.54,.07,.76],[.24,.6,.08,.8],
       [.75,.42,.92,.64],[.78,.48,.95,.7],[.77,.54,.93,.76],[.76,.6,.92,.8]].forEach(([x1,y1,x2,y2])=>{
        g.fillRect(S*Math.min(x1,x2),S*y1,S*Math.abs(x2-x1)+S*.04,S*.04);
      });
      // 大きなハサミ
      g.fillStyle(0xcc1100,1);
      g.fillEllipse(S*.15,S*.32,S*.24,S*.14);g.fillEllipse(S*.05,S*.24,S*.14,S*.1);g.fillEllipse(S*.05,S*.4,S*.14,S*.1);
      g.fillStyle(0xaa0000,1);g.fillCircle(S*.05,S*.24,S*.06);g.fillCircle(S*.05,S*.4,S*.06);
      // 王冠（女王の証）
      g.fillStyle(0xffcc00,1);
      g.fillRect(S*.34,S*.22,S*.32,S*.1);
      g.fillTriangle(S*.34,S*.22,S*.34,S*.12,S*.4,S*.22);
      g.fillTriangle(S*.5,S*.22,S*.5,S*.1,S*.56,S*.22);
      g.fillTriangle(S*.66,S*.22,S*.6,S*.22,S*.66,S*.12);
      g.fillStyle(0xff2200,1);g.fillCircle(S*.37,S*.17,S*.03);g.fillCircle(S*.53,S*.14,S*.03);g.fillCircle(S*.63,S*.17,S*.03);
      // 胴体
      g.fillStyle(0xcc2200,1);g.fillEllipse(S*.5,S*.58,S*.44,S*.3);
      // 頭胸
      g.fillStyle(0xdd3300,1);g.fillEllipse(S*.42,S*.38,S*.36,S*.28);
      // 目（8つ）
      g.fillStyle(0x000000,1);
      [[.32,.34],[.38,.31],[.44,.3],[.38,.4]].forEach(([x,y])=>{g.fillCircle(S*x,S*y,S*.03);});
    });

    // ── サンドマン（砂人形・ST4〜5）──────────────
    mk('enemy_sandman',96,(g,S)=>{
      g.fillStyle(0x000000,.18);g.fillEllipse(S*.5,S*.94,S*.60,S*.10);
      // 砂の粒飛散
      g.fillStyle(0xddbb77,.45);
      [[.20,.40],[.82,.38],[.18,.68],[.84,.64],[.15,.20],[.85,.18]].forEach(([x,y])=>{
        g.fillCircle(S*x,S*y,S*.025);
      });
      // 胴体（ごつごつした砂の塊）
      g.fillStyle(0xd4aa55,1);g.fillEllipse(S*.5,S*.62,S*.60,S*.46);
      g.fillStyle(0xbb9944,1);
      // 砂のブロック感
      g.fillRect(S*.28,S*.54,S*.14,S*.10);
      g.fillRect(S*.55,S*.58,S*.16,S*.08);
      g.fillRect(S*.34,S*.72,S*.18,S*.10);
      // ハイライト(陽に照る)
      g.fillStyle(0xeecc88,.6);g.fillEllipse(S*.38,S*.52,S*.22,S*.10);
      // 腕(両側・塊状)
      g.fillStyle(0xd4aa55,1);
      g.fillEllipse(S*.14,S*.60,S*.16,S*.22);
      g.fillEllipse(S*.86,S*.60,S*.16,S*.22);
      g.fillStyle(0xbb9944,1);
      g.fillCircle(S*.10,S*.72,S*.08);
      g.fillCircle(S*.90,S*.72,S*.08);
      // 頭(砂の塊)
      g.fillStyle(0xd4aa55,1);g.fillEllipse(S*.5,S*.28,S*.40,S*.34);
      g.fillStyle(0xeecc88,.5);g.fillEllipse(S*.42,S*.22,S*.20,S*.10);
      // 目(暗い穴・不気味)
      g.fillStyle(0x221100,1);
      g.fillEllipse(S*.38,S*.28,S*.07,S*.10);
      g.fillEllipse(S*.62,S*.28,S*.07,S*.10);
      // 目の中の赤い光
      g.fillStyle(0xff4400,.9);g.fillCircle(S*.38,S*.28,S*.025);g.fillCircle(S*.62,S*.28,S*.025);
      // 口(ぎざぎざ)
      g.fillStyle(0x332200,1);
      g.fillRect(S*.38,S*.42,S*.24,S*.03);
      // 落ちる砂のエフェクト
      g.fillStyle(0xccaa66,.5);
      g.fillRect(S*.30,S*.82,S*.02,S*.10);
      g.fillRect(S*.46,S*.86,S*.02,S*.08);
      g.fillRect(S*.66,S*.82,S*.02,S*.10);
    });

    // ── ミイラ(mummy・ST5〜6)──────────────
    mk('enemy_mummy',92,(g,S)=>{
      g.fillStyle(0x000000,.2);g.fillEllipse(S*.5,S*.95,S*.50,S*.10);
      // 胴体(包帯ベース)
      g.fillStyle(0xddcc99,1);g.fillEllipse(S*.5,S*.58,S*.44,S*.54);
      // 包帯の段(横縞)
      g.fillStyle(0xbb9966,.7);
      [.42,.52,.62,.72,.82].forEach(y=>{
        g.fillRect(S*.28,S*y,S*.44,S*.025);
      });
      // 包帯のほつれ
      g.fillStyle(0x998866,1);
      g.fillTriangle(S*.30,S*.68,S*.26,S*.76,S*.32,S*.78);
      g.fillTriangle(S*.70,S*.72,S*.74,S*.80,S*.68,S*.82);
      // 腕(前に伸ばす)
      g.fillStyle(0xddcc99,1);
      g.fillRect(S*.10,S*.52,S*.18,S*.10);
      g.fillRect(S*.72,S*.52,S*.18,S*.10);
      g.fillStyle(0xbb9966,.6);
      [.54,.58].forEach(y=>{g.fillRect(S*.10,S*y,S*.18,S*.015);g.fillRect(S*.72,S*y,S*.18,S*.015);});
      // 足の包帯
      g.fillStyle(0xddcc99,1);
      g.fillRect(S*.36,S*.84,S*.10,S*.14);
      g.fillRect(S*.54,S*.84,S*.10,S*.14);
      // 頭
      g.fillStyle(0xeedbaa,1);g.fillEllipse(S*.5,S*.28,S*.34,S*.36);
      // 頭の包帯(斜め)
      g.fillStyle(0xbb9966,.7);
      g.fillRect(S*.30,S*.20,S*.40,S*.03);
      g.fillRect(S*.30,S*.30,S*.40,S*.03);
      g.fillRect(S*.30,S*.38,S*.40,S*.03);
      // 目の包帯の隙間から光る目
      g.fillStyle(0x000000,1);
      g.fillRect(S*.30,S*.26,S*.40,S*.04); // 目隠し包帯
      g.fillStyle(0xff2200,.9);
      g.fillCircle(S*.40,S*.28,S*.025);g.fillCircle(S*.60,S*.28,S*.025);
      // 口の包帯の隙間
      g.fillStyle(0x331100,1);g.fillRect(S*.42,S*.42,S*.16,S*.025);
    });

    // ── 骨竜(bone_dragon・ST6/ST7)──────────────
    mk('enemy_bone_dragon',140,(g,S)=>{
      g.fillStyle(0x000000,.28);g.fillEllipse(S*.5,S*.95,S*.82,S*.12);
      // 尾(骨の連なり)
      g.fillStyle(0xe8dcc0,1);
      g.fillEllipse(S*.78,S*.80,S*.08,S*.06);
      g.fillEllipse(S*.85,S*.72,S*.08,S*.06);
      g.fillEllipse(S*.90,S*.60,S*.08,S*.06);
      g.fillEllipse(S*.92,S*.48,S*.08,S*.06);
      // 尾の先端(矢じり状)
      g.fillStyle(0xddd0b0,1);
      g.fillTriangle(S*.92,S*.38,S*.86,S*.48,S*.98,S*.48);
      // 胴体の骨格(肋骨)
      g.fillStyle(0x332211,.8);g.fillEllipse(S*.5,S*.65,S*.6,S*.34); // 影
      g.fillStyle(0xe8dcc0,1);
      // 背骨
      g.fillRect(S*.22,S*.63,S*.56,S*.04);
      // 肋骨(左右対称)
      [.28,.36,.44,.52,.60,.68].forEach(x=>{
        g.fillEllipse(S*x,S*.55,S*.025,S*.16);
        g.fillEllipse(S*x,S*.75,S*.025,S*.16);
      });
      // 翼(骨だけ)
      g.fillStyle(0xccbb88,.5);
      // 左翼(上方向)
      g.fillTriangle(S*.25,S*.55,S*.05,S*.18,S*.15,S*.50);
      g.fillTriangle(S*.15,S*.50,S*.05,S*.18,S*.02,S*.40);
      // 右翼
      g.fillTriangle(S*.75,S*.55,S*.95,S*.18,S*.85,S*.50);
      g.fillTriangle(S*.85,S*.50,S*.95,S*.18,S*.98,S*.40);
      // 翼の骨の筋
      g.fillStyle(0xe8dcc0,1);
      g.fillRect(S*.05,S*.19,S*.18,S*.025);
      g.fillRect(S*.78,S*.19,S*.18,S*.025);
      // 前脚
      g.fillStyle(0xe8dcc0,1);
      g.fillRect(S*.22,S*.75,S*.04,S*.18);
      g.fillRect(S*.74,S*.75,S*.04,S*.18);
      // 爪
      g.fillStyle(0x999988,1);
      [.20,.24,.28].forEach(x=>g.fillTriangle(S*x,S*.93,S*(x-.015),S*.99,S*(x+.015),S*.93));
      [.72,.76,.80].forEach(x=>g.fillTriangle(S*x,S*.93,S*(x-.015),S*.99,S*(x+.015),S*.93));
      // 首
      g.fillStyle(0xe8dcc0,1);
      g.fillEllipse(S*.38,S*.40,S*.06,S*.18);
      g.fillEllipse(S*.32,S*.28,S*.06,S*.10);
      // 頭蓋骨
      g.fillStyle(0xe8dcc0,1);g.fillEllipse(S*.24,S*.22,S*.22,S*.18);
      // 鼻先(前に尖る)
      g.fillTriangle(S*.04,S*.24,S*.14,S*.18,S*.14,S*.26);
      // 目の穴
      g.fillStyle(0x000000,1);g.fillCircle(S*.22,S*.20,S*.05);
      // 目の中の怨念の光
      g.fillStyle(0xff2200,1);g.fillCircle(S*.22,S*.20,S*.02);
      // 歯
      g.fillStyle(0xffffff,1);
      [.07,.10,.13].forEach(x=>g.fillTriangle(S*x,S*.26,S*(x-.01),S*.30,S*(x+.01),S*.26));
      // 頭の角(2本)
      g.fillStyle(0xccbb88,1);
      g.fillTriangle(S*.24,S*.12,S*.18,S*.04,S*.28,S*.10);
      g.fillTriangle(S*.30,S*.14,S*.34,S*.04,S*.36,S*.16);
    });

    // ── スコーピオンキング(ボス・ST5) ────────────
    mk('enemy_scorpion_king',130,(g,S)=>{
      g.fillStyle(0x000000,.30);g.fillEllipse(S*.5,S*.95,S*.78,S*.14);
      // 王冠の輝き
      g.fillStyle(0xffcc00,.3);g.fillCircle(S*.5,S*.18,S*.28);
      // 巨大な尻尾(S字・黒紫)
      g.fillStyle(0x441144,1);
      g.fillEllipse(S*.80,S*.75,S*.16,S*.24);
      g.fillEllipse(S*.92,S*.58,S*.14,S*.22);
      g.fillEllipse(S*.96,S*.40,S*.12,S*.18);
      g.fillEllipse(S*.92,S*.24,S*.10,S*.16);
      // 尾の節のハイライト
      g.fillStyle(0x882288,.5);
      g.fillEllipse(S*.80,S*.72,S*.10,S*.08);
      g.fillEllipse(S*.92,S*.56,S*.08,S*.06);
      g.fillEllipse(S*.96,S*.38,S*.06,S*.06);
      // 毒針(巨大・赤く光る)
      g.fillStyle(0xff2200,1);g.fillTriangle(S*.92,S*.08,S*.82,S*.24,S*.98,S*.22);
      g.fillStyle(0xff6644,.6);g.fillTriangle(S*.90,S*.14,S*.84,S*.22,S*.96,S*.20);
      // 毒の雫
      g.fillStyle(0x88ff00,1);g.fillCircle(S*.90,S*.06,S*.03);
      g.fillStyle(0x88ff00,.6);g.fillCircle(S*.88,S*.02,S*.02);
      // 本体(巨大な甲羅)
      g.fillStyle(0x551155,1);g.fillEllipse(S*.48,S*.60,S*.72,S*.52);
      // 甲羅のプレート感
      g.fillStyle(0x772277,1);
      g.fillEllipse(S*.36,S*.52,S*.24,S*.20);
      g.fillEllipse(S*.60,S*.52,S*.24,S*.20);
      g.fillEllipse(S*.48,S*.70,S*.26,S*.18);
      // 甲羅の金の模様
      g.fillStyle(0xffcc00,.7);
      g.fillTriangle(S*.48,S*.42,S*.40,S*.58,S*.56,S*.58);
      g.fillRect(S*.46,S*.58,S*.04,S*.18);
      // 大きなハサミ(左・広げた形)
      g.fillStyle(0x662266,1);
      g.fillEllipse(S*.14,S*.52,S*.18,S*.20);
      // ハサミの爪
      g.fillStyle(0x441144,1);
      g.fillTriangle(S*.02,S*.42,S*.20,S*.46,S*.14,S*.56);
      g.fillTriangle(S*.02,S*.60,S*.20,S*.56,S*.14,S*.50);
      // 大きなハサミ(右)
      g.fillStyle(0x662266,1);
      g.fillEllipse(S*.82,S*.52,S*.18,S*.20);
      g.fillStyle(0x441144,1);
      g.fillTriangle(S*.98,S*.42,S*.80,S*.46,S*.86,S*.56);
      g.fillTriangle(S*.98,S*.60,S*.80,S*.56,S*.86,S*.50);
      // 足(6本)
      g.fillStyle(0x331133,1);
      [.24,.30,.36].forEach(x=>{
        g.fillTriangle(S*x,S*.78,S*(x-.04),S*.92,S*(x+.02),S*.90);
      });
      [.60,.66,.72].forEach(x=>{
        g.fillTriangle(S*x,S*.78,S*(x+.04),S*.92,S*(x-.02),S*.90);
      });
      // 頭部・目
      g.fillStyle(0x441144,1);g.fillEllipse(S*.48,S*.36,S*.26,S*.18);
      // 赤い凶悪な目(複数・クラスター)
      g.fillStyle(0xff0000,1);
      g.fillCircle(S*.40,S*.34,S*.035);g.fillCircle(S*.56,S*.34,S*.035);
      g.fillCircle(S*.44,S*.40,S*.025);g.fillCircle(S*.52,S*.40,S*.025);
      // 目の光
      g.fillStyle(0xffffff,1);
      g.fillCircle(S*.40,S*.33,S*.012);g.fillCircle(S*.56,S*.33,S*.012);
      // 王冠(金)
      g.fillStyle(0xffcc00,1);
      g.fillRect(S*.38,S*.18,S*.20,S*.08);
      g.fillTriangle(S*.38,S*.18,S*.42,S*.10,S*.46,S*.18);
      g.fillTriangle(S*.46,S*.18,S*.48,S*.06,S*.50,S*.18);
      g.fillTriangle(S*.50,S*.18,S*.54,S*.10,S*.58,S*.18);
      // 王冠の宝石
      g.fillStyle(0xff2266,1);g.fillCircle(S*.48,S*.14,S*.03);
      g.fillStyle(0x22ccff,1);g.fillCircle(S*.42,S*.16,S*.02);g.fillCircle(S*.54,S*.16,S*.02);
    });

    // ── ゾンビ(DUN1・毒持ちタンク) ──────────────
    mk('enemy_zombie',100,(g,S)=>{
      g.fillStyle(0x000000,.3);g.fillEllipse(S*.5,S*.95,S*.6,S*.12);
      // 足(引きずる感じで片方低く)
      g.fillStyle(0x556644,1);
      g.fillRect(S*.34,S*.78,S*.12,S*.20);
      g.fillRect(S*.54,S*.82,S*.12,S*.16);
      // 靴(ボロボロ)
      g.fillStyle(0x332211,1);
      g.fillRect(S*.32,S*.94,S*.16,S*.06);
      g.fillRect(S*.52,S*.95,S*.16,S*.05);
      // 胴体(破れた服)
      g.fillStyle(0x445533,1);g.fillEllipse(S*.5,S*.60,S*.48,S*.36);
      // 腹部の傷(血)
      g.fillStyle(0x661122,1);g.fillEllipse(S*.5,S*.62,S*.18,S*.14);
      g.fillStyle(0x881133,.6);g.fillEllipse(S*.48,S*.60,S*.10,S*.06);
      // 服の破れ
      g.fillStyle(0x334422,1);
      g.fillTriangle(S*.32,S*.52,S*.28,S*.70,S*.36,S*.66);
      g.fillTriangle(S*.70,S*.58,S*.72,S*.72,S*.66,S*.64);
      // 腕(前に伸ばす・ゾンビっぽく)
      g.fillStyle(0x668855,1);
      g.fillEllipse(S*.14,S*.52,S*.16,S*.22);
      g.fillEllipse(S*.86,S*.52,S*.16,S*.22);
      // 手(緑がかった肌)
      g.fillStyle(0x558844,1);
      g.fillCircle(S*.10,S*.64,S*.09);
      g.fillCircle(S*.90,S*.64,S*.09);
      // 爪(黒)
      g.fillStyle(0x221100,1);
      [.06,.10,.14].forEach(x=>g.fillTriangle(S*x,S*.72,S*(x-.01),S*.78,S*(x+.01),S*.72));
      [.86,.90,.94].forEach(x=>g.fillTriangle(S*x,S*.72,S*(x-.01),S*.78,S*(x+.01),S*.72));
      // 頭(腐った緑)
      g.fillStyle(0x778855,1);g.fillEllipse(S*.5,S*.28,S*.38,S*.36);
      // 頬のこけ感
      g.fillStyle(0x556633,.6);
      g.fillEllipse(S*.36,S*.36,S*.10,S*.06);
      g.fillEllipse(S*.64,S*.36,S*.10,S*.06);
      // 腐敗の斑点
      g.fillStyle(0x333311,.7);
      g.fillCircle(S*.42,S*.20,S*.025);g.fillCircle(S*.58,S*.24,S*.02);
      g.fillCircle(S*.36,S*.30,S*.02);
      // うつろな白目(焦点なし)
      g.fillStyle(0xddddbb,1);
      g.fillCircle(S*.40,S*.28,S*.05);g.fillCircle(S*.60,S*.28,S*.05);
      g.fillStyle(0x221100,1);
      g.fillCircle(S*.40,S*.28,S*.018);g.fillCircle(S*.60,S*.28,S*.018);
      // 裂けた口(血がこびりつく)
      g.fillStyle(0x221100,1);g.fillRect(S*.38,S*.44,S*.24,S*.04);
      g.fillStyle(0x661122,.8);g.fillRect(S*.42,S*.46,S*.16,S*.03);
      // 歯がのぞく
      g.fillStyle(0xddccaa,1);
      g.fillRect(S*.42,S*.44,S*.02,S*.03);
      g.fillRect(S*.48,S*.44,S*.02,S*.03);
      g.fillRect(S*.54,S*.44,S*.02,S*.03);
      // 毒の霧が立ち昇る
      g.fillStyle(0x88cc44,.35);
      g.fillCircle(S*.30,S*.14,S*.06);g.fillCircle(S*.70,S*.10,S*.05);
      g.fillCircle(S*.50,S*.04,S*.08);
    });

    // ── リッチ(DUN1・詠唱魔法) ──────────────
    mk('enemy_lich',110,(g,S)=>{
      g.fillStyle(0x000000,.3);g.fillEllipse(S*.5,S*.95,S*.68,S*.12);
      // 暗い魔力オーラ
      g.fillStyle(0x330066,.15);g.fillCircle(S*.5,S*.55,S*.52);
      g.fillStyle(0x6600cc,.08);g.fillCircle(S*.5,S*.55,S*.44);
      // ローブ本体(暗紫)
      g.fillStyle(0x221133,1);
      // ローブの下部(広がる)
      g.fillTriangle(S*.14,S*.95,S*.86,S*.95,S*.5,S*.38);
      // ローブの縁飾り(金)
      g.fillStyle(0x886622,1);
      g.fillTriangle(S*.14,S*.95,S*.18,S*.98,S*.20,S*.93);
      g.fillTriangle(S*.86,S*.95,S*.82,S*.98,S*.80,S*.93);
      g.fillRect(S*.20,S*.94,S*.60,S*.03);
      // ローブの模様(縦のライン)
      g.fillStyle(0x442266,.7);
      g.fillRect(S*.46,S*.50,S*.02,S*.42);
      g.fillRect(S*.30,S*.60,S*.02,S*.32);
      g.fillRect(S*.66,S*.60,S*.02,S*.32);
      // 胸元の魔法陣
      g.fillStyle(0xcc44ff,.7);g.fillCircle(S*.5,S*.50,S*.08);
      g.fillStyle(0x441166,1);g.fillCircle(S*.5,S*.50,S*.06);
      g.fillStyle(0xaa33ff,1);g.fillTriangle(S*.5,S*.46,S*.46,S*.53,S*.54,S*.53);
      // 骸骨の手(杖を握る)
      g.fillStyle(0xddccaa,1);
      g.fillCircle(S*.78,S*.54,S*.06);
      // 杖(斜めに)
      g.fillStyle(0x553311,1);
      g.fillRect(S*.80,S*.20,S*.04,S*.50);
      // 杖の先端(魔法クリスタル)
      g.fillStyle(0xaa00ff,1);g.fillCircle(S*.82,S*.18,S*.06);
      g.fillStyle(0xff66ff,.7);g.fillCircle(S*.82,S*.18,S*.04);
      g.fillStyle(0xffffff,.9);g.fillCircle(S*.80,S*.16,S*.015);
      // クリスタルから魔力
      g.fillStyle(0xcc44ff,.5);
      g.fillCircle(S*.75,S*.12,S*.025);g.fillCircle(S*.88,S*.14,S*.02);
      g.fillCircle(S*.84,S*.08,S*.018);
      // フード(深く被る)
      g.fillStyle(0x110022,1);g.fillEllipse(S*.5,S*.22,S*.34,S*.32);
      g.fillStyle(0x221144,1);g.fillEllipse(S*.5,S*.16,S*.28,S*.20);
      // フードの中の闇
      g.fillStyle(0x000000,1);g.fillEllipse(S*.5,S*.28,S*.22,S*.18);
      // 光る赤い目
      g.fillStyle(0xff0000,1);
      g.fillCircle(S*.44,S*.28,S*.035);g.fillCircle(S*.56,S*.28,S*.035);
      g.fillStyle(0xffaa00,.6);
      g.fillCircle(S*.44,S*.28,S*.022);g.fillCircle(S*.56,S*.28,S*.022);
      g.fillStyle(0xffffff,1);
      g.fillCircle(S*.43,S*.27,S*.008);g.fillCircle(S*.55,S*.27,S*.008);
      // 骸骨の顎(少し見える)
      g.fillStyle(0xddccaa,1);
      g.fillEllipse(S*.5,S*.38,S*.12,S*.06);
    });

    // ── ダークエルフ(DUN1・弓兵) ──────────────
    mk('enemy_dark_elf',96,(g,S)=>{
      g.fillStyle(0x000000,.3);g.fillEllipse(S*.5,S*.95,S*.50,S*.10);
      // 足(しなやか)
      g.fillStyle(0x221133,1);
      g.fillRect(S*.40,S*.78,S*.08,S*.20);
      g.fillRect(S*.52,S*.78,S*.08,S*.20);
      // ブーツ(黒革)
      g.fillStyle(0x110022,1);
      g.fillRect(S*.38,S*.94,S*.12,S*.06);
      g.fillRect(S*.50,S*.94,S*.12,S*.06);
      // ブーツの飾り(銀)
      g.fillStyle(0xaabbcc,1);
      g.fillRect(S*.38,S*.92,S*.12,S*.015);
      g.fillRect(S*.50,S*.92,S*.12,S*.015);
      // 胴体(細身・革鎧)
      g.fillStyle(0x332244,1);g.fillEllipse(S*.5,S*.58,S*.36,S*.38);
      // 鎧の模様(銀糸)
      g.fillStyle(0xccddee,.7);
      g.fillRect(S*.49,S*.44,S*.02,S*.28);
      g.fillTriangle(S*.5,S*.48,S*.42,S*.62,S*.58,S*.62);
      // マント(後ろに垂れる・黒紫)
      g.fillStyle(0x110033,1);
      g.fillTriangle(S*.30,S*.56,S*.5,S*.80,S*.22,S*.88);
      g.fillTriangle(S*.70,S*.56,S*.5,S*.80,S*.78,S*.88);
      // 左手(弓を持つ・引き絞る姿)
      g.fillStyle(0x886644,1);g.fillCircle(S*.22,S*.58,S*.06);
      // 弓(大型・木製に銀の縁)
      g.fillStyle(0x553311,1);
      g.fillRect(S*.15,S*.22,S*.04,S*.72);
      // 弓の曲線(上下端)
      g.fillTriangle(S*.14,S*.22,S*.19,S*.20,S*.22,S*.30);
      g.fillTriangle(S*.14,S*.94,S*.19,S*.96,S*.22,S*.86);
      // 弓の弦(引き絞った状態で矢を番える)
      g.fillStyle(0xddddaa,1);
      g.fillRect(S*.18,S*.24,S*.015,S*.68);
      // 矢(つがえた状態)
      g.fillStyle(0x664422,1);
      g.fillRect(S*.20,S*.56,S*.30,S*.015);
      // 矢じり(銀・鋭い)
      g.fillStyle(0xccccdd,1);
      g.fillTriangle(S*.50,S*.56,S*.52,S*.54,S*.52,S*.58);
      // 右手(矢を引く)
      g.fillStyle(0x886644,1);g.fillCircle(S*.42,S*.58,S*.05);
      // 羽飾り
      g.fillStyle(0xccaaff,.7);
      g.fillTriangle(S*.18,S*.56,S*.22,S*.52,S*.22,S*.60);
      // 顔(グレーがかった褐色肌)
      g.fillStyle(0x886677,1);g.fillEllipse(S*.5,S*.25,S*.26,S*.30);
      // 尖った耳(両側)
      g.fillTriangle(S*.28,S*.22,S*.34,S*.18,S*.34,S*.30);
      g.fillTriangle(S*.72,S*.22,S*.66,S*.18,S*.66,S*.30);
      // 紫の長髪
      g.fillStyle(0x442266,1);
      g.fillEllipse(S*.5,S*.15,S*.28,S*.12);
      g.fillRect(S*.32,S*.18,S*.36,S*.10);
      // 髪の流れ
      g.fillStyle(0x6633aa,.7);
      g.fillRect(S*.34,S*.16,S*.04,S*.14);
      g.fillRect(S*.62,S*.16,S*.04,S*.14);
      // 冷たい光る目(紫)
      g.fillStyle(0xcc66ff,1);
      g.fillCircle(S*.42,S*.24,S*.035);g.fillCircle(S*.58,S*.24,S*.035);
      g.fillStyle(0xffffff,1);
      g.fillCircle(S*.41,S*.23,S*.012);g.fillCircle(S*.57,S*.23,S*.012);
      // 口(冷笑)
      g.fillStyle(0x441122,1);g.fillRect(S*.44,S*.34,S*.12,S*.015);
    });

    // ── ダークイリュージョン(ダミーボス・DUN1) ──────────────
    mk('enemy_dark_illusion',150,(g,S)=>{
      g.fillStyle(0x000000,.4);g.fillEllipse(S*.5,S*.95,S*.80,S*.14);
      // 闇のオーラ(大)
      g.fillStyle(0x110022,.35);g.fillCircle(S*.5,S*.5,S*.55);
      g.fillStyle(0x330066,.2);g.fillCircle(S*.5,S*.5,S*.48);
      g.fillStyle(0xaa00ff,.12);g.fillCircle(S*.5,S*.5,S*.40);
      // 魔法陣(足元)
      g.fillStyle(0x660099,.6);g.fillCircle(S*.5,S*.88,S*.32);
      g.fillStyle(0xaa00ff,.7);
      // 魔法陣の外周リング
      for(let i=0;i<12;i++){
        const a=(i/12)*Math.PI*2;
        g.fillCircle(S*(.5+Math.cos(a)*.28),S*(.88+Math.sin(a)*.09),S*.012);
      }
      // 巨大な翼(背中から広がる・影の翼)
      g.fillStyle(0x110033,1);
      g.fillTriangle(S*.15,S*.50,S*.0,S*.15,S*.30,S*.45);
      g.fillTriangle(S*.85,S*.50,S*1.0,S*.15,S*.70,S*.45);
      // 翼の内側(紫のグラデ)
      g.fillStyle(0x330066,.8);
      g.fillTriangle(S*.20,S*.48,S*.08,S*.25,S*.28,S*.45);
      g.fillTriangle(S*.80,S*.48,S*.92,S*.25,S*.72,S*.45);
      // 翼の骨格
      g.fillStyle(0x220044,1);
      g.fillRect(S*.08,S*.28,S*.22,S*.02);
      g.fillRect(S*.70,S*.28,S*.22,S*.02);
      g.fillRect(S*.14,S*.38,S*.14,S*.015);
      g.fillRect(S*.72,S*.38,S*.14,S*.015);
      // ローブ(大きく広がる)
      g.fillStyle(0x1a0033,1);
      g.fillTriangle(S*.18,S*.92,S*.82,S*.92,S*.5,S*.38);
      // ローブの縁(血のような赤)
      g.fillStyle(0x660011,1);
      g.fillRect(S*.18,S*.90,S*.64,S*.03);
      g.fillTriangle(S*.18,S*.92,S*.22,S*.95,S*.26,S*.88);
      g.fillTriangle(S*.82,S*.92,S*.78,S*.95,S*.74,S*.88);
      // 胸の大きな魔法陣(逆五芒星)
      g.fillStyle(0x000000,1);g.fillCircle(S*.5,S*.54,S*.12);
      g.fillStyle(0xff0066,.9);g.fillCircle(S*.5,S*.54,S*.10);
      // 五芒星
      g.fillStyle(0x000000,1);
      const cx=S*.5, cy=S*.54, rad=S*.08;
      const pts=[];
      for(let i=0;i<5;i++){
        const a=-Math.PI/2+(i/5)*Math.PI*2;
        pts.push([cx+Math.cos(a)*rad, cy+Math.sin(a)*rad]);
      }
      g.fillTriangle(pts[0][0],pts[0][1],pts[2][0],pts[2][1],pts[3][0],pts[3][1]);
      g.fillTriangle(pts[1][0],pts[1][1],pts[3][0],pts[3][1],pts[4][0],pts[4][1]);
      g.fillTriangle(pts[0][0],pts[0][1],pts[1][0],pts[1][1],pts[2][0],pts[2][1]);
      // 両腕(巨大・闇を纏う)
      g.fillStyle(0x220044,1);
      g.fillEllipse(S*.28,S*.55,S*.12,S*.24);
      g.fillEllipse(S*.72,S*.55,S*.12,S*.24);
      // 手(骨+爪)
      g.fillStyle(0xccbbaa,1);
      g.fillCircle(S*.24,S*.72,S*.06);
      g.fillCircle(S*.76,S*.72,S*.06);
      // 爪(長く鋭い)
      g.fillStyle(0x881111,1);
      [.18,.22,.26,.30].forEach(x=>g.fillTriangle(S*x,S*.76,S*(x-.015),S*.86,S*(x+.015),S*.76));
      [.70,.74,.78,.82].forEach(x=>g.fillTriangle(S*x,S*.76,S*(x-.015),S*.86,S*(x+.015),S*.76));
      // 浮遊するメテオ球(周囲に3つ)
      [[.15,.30,.04],[.85,.35,.04],[.50,.10,.05]].forEach(([x,y,r])=>{
        g.fillStyle(0xff4400,.9);g.fillCircle(S*x,S*y,S*r);
        g.fillStyle(0xffaa00,1);g.fillCircle(S*x,S*y,S*r*0.6);
        g.fillStyle(0xffff88,1);g.fillCircle(S*x,S*y,S*r*0.25);
      });
      // 巨大な兜(角付き)
      g.fillStyle(0x110022,1);g.fillEllipse(S*.5,S*.26,S*.32,S*.34);
      // 兜の装飾
      g.fillStyle(0x330055,1);g.fillEllipse(S*.5,S*.22,S*.24,S*.16);
      // 長い角(2本・上に伸びる)
      g.fillStyle(0x220044,1);
      g.fillTriangle(S*.36,S*.18,S*.28,S*-.02,S*.42,S*.16);
      g.fillTriangle(S*.64,S*.18,S*.58,S*.16,S*.72,S*-.02);
      // 角の縞
      g.fillStyle(0x441166,1);
      g.fillTriangle(S*.36,S*.14,S*.32,S*.06,S*.40,S*.14);
      g.fillTriangle(S*.64,S*.14,S*.60,S*.14,S*.68,S*.06);
      // 兜の隙間(光る目・巨大)
      g.fillStyle(0x000000,1);g.fillRect(S*.34,S*.26,S*.32,S*.06);
      g.fillStyle(0xff0044,1);
      g.fillEllipse(S*.42,S*.29,S*.08,S*.04);
      g.fillEllipse(S*.58,S*.29,S*.08,S*.04);
      g.fillStyle(0xff88aa,.8);
      g.fillCircle(S*.42,S*.29,S*.02);
      g.fillCircle(S*.58,S*.29,S*.02);
      g.fillStyle(0xffffff,1);
      g.fillCircle(S*.41,S*.28,S*.008);
      g.fillCircle(S*.57,S*.28,S*.008);
      // 兜の牙
      g.fillStyle(0xccbbaa,1);
      g.fillTriangle(S*.42,S*.38,S*.40,S*.44,S*.44,S*.38);
      g.fillTriangle(S*.58,S*.38,S*.56,S*.38,S*.60,S*.44);
      // 浮遊中の闇の粒
      g.fillStyle(0xaa00ff,.7);
      [[.12,.50],[.88,.48],[.25,.15],[.75,.12],[.08,.70],[.92,.72]].forEach(([x,y])=>{
        g.fillCircle(S*x,S*y,S*.02);
      });
    });

    // ── 砂漠の墓守(ST6ボス・骨の主)──────────────
    mk('enemy_tomb_guardian',150,(g,S)=>{
      g.fillStyle(0x000000,.35);g.fillEllipse(S*.5,S*.95,S*.78,S*.14);
      // 死霊のオーラ(緑黒)
      g.fillStyle(0x224422,.15);g.fillCircle(S*.5,S*.5,S*.55);
      g.fillStyle(0x447744,.10);g.fillCircle(S*.5,S*.5,S*.46);
      // 古代の鎧の腰部(布が垂れる)
      g.fillStyle(0x332211,1);
      g.fillTriangle(S*.20,S*.92,S*.80,S*.92,S*.5,S*.50);
      // 鎧の縁(金)
      g.fillStyle(0xaa8833,1);
      g.fillRect(S*.22,S*.88,S*.56,S*.04);
      // 鎧の縦の帯
      g.fillStyle(0x553322,1);
      g.fillRect(S*.48,S*.55,S*.04,S*.36);
      // 古代の文字模様
      g.fillStyle(0xaa8833,.7);
      g.fillRect(S*.30,S*.70,S*.06,S*.02);
      g.fillRect(S*.40,S*.74,S*.06,S*.02);
      g.fillRect(S*.54,S*.74,S*.06,S*.02);
      g.fillRect(S*.64,S*.70,S*.06,S*.02);
      // 巨大な肩当て(両側・骨と石の融合)
      g.fillStyle(0x665544,1);
      g.fillEllipse(S*.18,S*.42,S*.24,S*.18);
      g.fillEllipse(S*.82,S*.42,S*.24,S*.18);
      // 肩当ての装飾(尖った骨)
      g.fillStyle(0xddccaa,1);
      g.fillTriangle(S*.10,S*.30,S*.18,S*.34,S*.14,S*.48);
      g.fillTriangle(S*.06,S*.40,S*.16,S*.40,S*.10,S*.55);
      g.fillTriangle(S*.90,S*.30,S*.82,S*.34,S*.86,S*.48);
      g.fillTriangle(S*.94,S*.40,S*.84,S*.40,S*.90,S*.55);
      // 胸鎧(骨の胸郭をベースに金で補強)
      g.fillStyle(0x554433,1);g.fillEllipse(S*.5,S*.55,S*.40,S*.34);
      g.fillStyle(0xaa8833,.6);g.fillEllipse(S*.5,S*.55,S*.30,S*.24);
      // 胸の中央にある宝玉(死霊の核)
      g.fillStyle(0x000000,1);g.fillCircle(S*.5,S*.55,S*.10);
      g.fillStyle(0x44aa44,1);g.fillCircle(S*.5,S*.55,S*.07);
      g.fillStyle(0x88ff88,.7);g.fillCircle(S*.5,S*.55,S*.04);
      g.fillStyle(0xffffff,.9);g.fillCircle(S*.5,S*.54,S*.015);
      // 肋骨が鎧の下から見える
      g.fillStyle(0xddccaa,.7);
      [.36,.42,.58,.64].forEach(x=>{
        g.fillRect(S*x,S*.48,S*.015,S*.18);
      });
      // 両腕(骨と鎧の融合)
      g.fillStyle(0x554433,1);
      g.fillEllipse(S*.20,S*.62,S*.10,S*.22);
      g.fillEllipse(S*.80,S*.62,S*.10,S*.22);
      // 骨の手
      g.fillStyle(0xddccaa,1);
      g.fillCircle(S*.18,S*.78,S*.07);
      g.fillCircle(S*.82,S*.78,S*.07);
      // 武器: 巨大な骨の杖(右手)
      g.fillStyle(0x886644,1);
      g.fillRect(S*.84,S*.18,S*.04,S*.66);
      // 杖の節
      g.fillStyle(0x553322,1);
      [.30,.45,.60,.75].forEach(y=>g.fillRect(S*.83,S*y,S*.06,S*.02));
      // 杖の先端の頭蓋骨
      g.fillStyle(0xeeddcc,1);g.fillEllipse(S*.86,S*.10,S*.16,S*.16);
      // 頭蓋骨の目
      g.fillStyle(0x000000,1);
      g.fillCircle(S*.82,S*.10,S*.025);g.fillCircle(S*.90,S*.10,S*.025);
      g.fillStyle(0x44ff44,1);
      g.fillCircle(S*.82,S*.10,S*.012);g.fillCircle(S*.90,S*.10,S*.012);
      // 頭蓋骨の口
      g.fillStyle(0x000000,1);g.fillRect(S*.82,S*.16,S*.08,S*.02);
      // 頭蓋骨の角
      g.fillStyle(0x886644,1);
      g.fillTriangle(S*.78,S*.06,S*.74,S*-.02,S*.82,S*.06);
      g.fillTriangle(S*.94,S*.06,S*.90,S*.06,S*.98,S*-.02);
      // 杖の上から漂う緑の魔力
      g.fillStyle(0x44aa44,.5);g.fillCircle(S*.86,S*.04,S*.04);
      g.fillStyle(0x88ff88,.4);g.fillCircle(S*.86,S*.0,S*.025);
      // 兜(王冠付き・古代エジプト風)
      g.fillStyle(0x332211,1);g.fillEllipse(S*.5,S*.30,S*.30,S*.30);
      // 兜の金の縁
      g.fillStyle(0xaa8833,1);g.fillRect(S*.34,S*.36,S*.32,S*.04);
      // 王冠(古代風・3つの尖り)
      g.fillStyle(0xaa8833,1);
      g.fillTriangle(S*.40,S*.18,S*.42,S*.06,S*.46,S*.18);
      g.fillTriangle(S*.46,S*.18,S*.50,S*.04,S*.54,S*.18);
      g.fillTriangle(S*.54,S*.18,S*.58,S*.06,S*.60,S*.18);
      // 王冠の宝石(緑)
      g.fillStyle(0x44ff44,1);g.fillCircle(S*.50,S*.10,S*.025);
      g.fillStyle(0x88ff88,.7);g.fillCircle(S*.50,S*.09,S*.012);
      // 兜の中の闇(黒い穴)
      g.fillStyle(0x000000,1);g.fillEllipse(S*.5,S*.32,S*.20,S*.14);
      // 兜の中の光る目(緑の魂の光)
      g.fillStyle(0x00ff00,1);
      g.fillCircle(S*.42,S*.31,S*.04);g.fillCircle(S*.58,S*.31,S*.04);
      g.fillStyle(0xaaffaa,.8);
      g.fillCircle(S*.42,S*.31,S*.022);g.fillCircle(S*.58,S*.31,S*.022);
      g.fillStyle(0xffffff,1);
      g.fillCircle(S*.41,S*.30,S*.008);g.fillCircle(S*.57,S*.30,S*.008);
      // 兜の側面の装飾(垂れる布・赤)
      g.fillStyle(0x661122,1);
      g.fillTriangle(S*.30,S*.30,S*.30,S*.50,S*.36,S*.40);
      g.fillTriangle(S*.70,S*.30,S*.70,S*.50,S*.64,S*.40);
      // 漂う霊魂の球(緑の球が周囲を浮遊)
      g.fillStyle(0x88ff88,.6);
      g.fillCircle(S*.10,S*.20,S*.025);g.fillCircle(S*.94,S*.25,S*.022);
      g.fillCircle(S*.05,S*.55,S*.018);g.fillCircle(S*.95,S*.65,S*.020);
    });

    // ── ミストレス（蜘蛛女王・ボス5）──────────────
    mk('enemy_mistress',160,(g,S)=>{
      g.fillStyle(0x000000,.25);g.fillEllipse(S*.5,S*.96,S*.85,S*.13);
      // 暗黒オーラ
      g.fillStyle(0x440066,.12);g.fillCircle(S*.5,S*.5,S*.52);
      g.fillStyle(0x880088,.08);g.fillCircle(S*.5,S*.5,S*.46);
      // 8本の脚（大きく・優雅に）
      g.fillStyle(0x220033,1);
      const legs=[
        [.5,.5,.02,.1],[.5,.5,.98,.1],[.5,.5,.02,.5],[.5,.5,.98,.5],
        [.5,.5,.08,.85],[.5,.5,.92,.85],[.5,.5,.25,.98],[.5,.5,.75,.98],
      ];
      legs.forEach(([x1,y1,x2,y2])=>{
        g.lineStyle(5,0x440066,1);g.lineBetween(S*x1,S*y1,S*x2,S*y2);
        // 脚の先端
        g.fillStyle(0x660099,1);g.fillCircle(S*x2,S*y2,S*.04);
      });
      // 蜘蛛の腹部（大きい・光沢）
      g.fillStyle(0x330044,1);g.fillEllipse(S*.5,S*.7,S*.5,S*.5);
      g.fillStyle(0x660099,.4);g.fillEllipse(S*.5,S*.65,S*.3,S*.28);
      // 砂時計紋様
      g.fillStyle(0xff2200,.8);
      g.fillTriangle(S*.5,S*.58,S*.42,S*.7,S*.58,S*.7);
      g.fillTriangle(S*.5,S*.82,S*.42,S*.7,S*.58,S*.7);
      // 胸部
      g.fillStyle(0x440055,1);g.fillEllipse(S*.5,S*.45,S*.38,S*.32);
      // 上半身（人型）
      g.fillStyle(0x220033,1);g.fillEllipse(S*.5,S*.28,S*.3,S*.32);
      // 腕（2本・人型）
      g.fillStyle(0x330044,1);
      g.fillEllipse(S*.28,S*.32,S*.14,S*.28);g.fillEllipse(S*.72,S*.32,S*.14,S*.28);
      g.fillStyle(0x550066,.5);
      g.fillCircle(S*.22,S*.44,S*.07);g.fillCircle(S*.78,S*.44,S*.07);
      // 頭
      g.fillStyle(0x330044,1);g.fillEllipse(S*.5,S*.16,S*.32,S*.28);
      // 長い角
      g.fillStyle(0x220033,1);
      g.fillTriangle(S*.38,S*.12,S*.3,S*-.04,S*.44,S*.14);
      g.fillTriangle(S*.62,S*.12,S*.56,S*.14,S*.7,S*-.04);
      g.fillStyle(0xcc00ff,.6);
      g.fillTriangle(S*.38,S*.12,S*.33,S*.0,S*.42,S*.12);
      g.fillTriangle(S*.62,S*.12,S*.58,S*.12,S*.67,S*.0);
      // 8つの目（蜘蛛の目）
      const eyePos=[[.36,.12],[.42,.1],[.48,.1],[.54,.1],[.6,.12],[.38,.18],[.5,.16],[.62,.18]];
      eyePos.forEach(([x,y])=>{
        g.fillStyle(0xff00cc,1);g.fillCircle(S*x,S*y,S*.025);
        g.fillStyle(0xffffff,.6);g.fillCircle(S*x,S*(y-.005),S*.01);
      });
      // 口（毒の牙）
      g.fillStyle(0x110022,1);g.fillEllipse(S*.5,S*.22,S*.2,S*.08);
      g.fillStyle(0x00ff44,1);
      g.fillTriangle(S*.44,S*.2,S*.41,S*.28,S*.47,S*.2);
      g.fillTriangle(S*.56,S*.2,S*.53,S*.2,S*.59,S*.28);
      // 糸
      g.lineStyle(1,0xcc99ff,.4);
      g.lineBetween(S*.5,S*.28,S*.5,S*-.1);
      g.lineBetween(S*.5,S*.28,S*.3,S*-.1);
      g.lineBetween(S*.5,S*.28,S*.7,S*-.1);
    });

    // ── スライム ────────────────────────────────
    // ══ 高品質モンスター描画 ══

    // スライム
    mk('enemy_slime',96,(g,S)=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.93,S*.68,S*.12);
      g.fillStyle(0x22cc88,0.3);g.fillCircle(S*.5,S*.54,S*.44);
      g.fillStyle(0x33dd99,0.65);g.fillEllipse(S*.5,S*.58,S*.7,S*.66);
      g.fillStyle(0x44eebb,0.9);g.fillEllipse(S*.5,S*.61,S*.62,S*.58);
      g.fillStyle(0x88ffdd,0.4);g.fillEllipse(S*.38,S*.38,S*.22,S*.14);
      g.fillStyle(0xffffff,0.25);g.fillEllipse(S*.36,S*.36,S*.12,S*.07);
      g.fillStyle(0x009966,0.7);g.fillCircle(S*.5,S*.58,S*.14);
      g.fillStyle(0x00ffcc,0.5);g.fillCircle(S*.5,S*.56,S*.08);
      g.fillStyle(0xffffff,1);g.fillEllipse(S*.37,S*.48,S*.18,S*.2);g.fillEllipse(S*.63,S*.48,S*.18,S*.2);
      g.fillStyle(0x003322,1);g.fillEllipse(S*.37,S*.5,S*.11,S*.13);g.fillEllipse(S*.63,S*.5,S*.11,S*.13);
      g.fillStyle(0x001a11,1);g.fillCircle(S*.38,S*.51,S*.05);g.fillCircle(S*.64,S*.51,S*.05);
      g.fillStyle(0xffffff,0.9);g.fillCircle(S*.35,S*.47,S*.03);g.fillCircle(S*.61,S*.47,S*.03);
      g.lineStyle(3,0x006644,0.9);g.lineBetween(S*.41,S*.62,S*.45,S*.65);g.lineBetween(S*.45,S*.65,S*.55,S*.65);g.lineBetween(S*.55,S*.65,S*.59,S*.62);
      g.fillStyle(0x66ffcc,0.3);g.fillCircle(S*.28,S*.52,S*.05);g.fillCircle(S*.7,S*.55,S*.04);
    });

    // サクラ(ピンクのスライム)
    mk('enemy_sakura',96,(g,S)=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.93,S*.68,S*.12);
      g.fillStyle(0xff66aa,0.3);g.fillCircle(S*.5,S*.54,S*.44);
      g.fillStyle(0xff77bb,0.65);g.fillEllipse(S*.5,S*.58,S*.7,S*.66);
      g.fillStyle(0xff99cc,0.9);g.fillEllipse(S*.5,S*.61,S*.62,S*.58);
      g.fillStyle(0xffccdd,0.4);g.fillEllipse(S*.38,S*.38,S*.22,S*.14);
      g.fillStyle(0xffffff,0.25);g.fillEllipse(S*.36,S*.36,S*.12,S*.07);
      g.fillStyle(0xcc4488,0.7);g.fillCircle(S*.5,S*.58,S*.14);
      g.fillStyle(0xff66aa,0.5);g.fillCircle(S*.5,S*.56,S*.08);
      g.fillStyle(0xffffff,1);g.fillEllipse(S*.37,S*.48,S*.18,S*.2);g.fillEllipse(S*.63,S*.48,S*.18,S*.2);
      g.fillStyle(0x661133,1);g.fillEllipse(S*.37,S*.5,S*.11,S*.13);g.fillEllipse(S*.63,S*.5,S*.11,S*.13);
      g.fillStyle(0x330011,1);g.fillCircle(S*.38,S*.51,S*.05);g.fillCircle(S*.64,S*.51,S*.05);
      g.fillStyle(0xffffff,0.9);g.fillCircle(S*.35,S*.47,S*.03);g.fillCircle(S*.61,S*.47,S*.03);
      g.lineStyle(3,0xaa3366,0.9);g.lineBetween(S*.41,S*.62,S*.45,S*.65);g.lineBetween(S*.45,S*.65,S*.55,S*.65);g.lineBetween(S*.55,S*.65,S*.59,S*.62);
      // 桜の花びら(頭上)
      g.fillStyle(0xffaadd,1);
      g.fillCircle(S*.5,S*.18,S*.04);
      g.fillCircle(S*.45,S*.21,S*.035);
      g.fillCircle(S*.55,S*.21,S*.035);
      g.fillStyle(0xffeef2,0.3);g.fillCircle(S*.28,S*.52,S*.05);g.fillCircle(S*.7,S*.55,S*.04);
    });

    // サイダー(水色のスライム・透明感)
    mk('enemy_cider',96,(g,S)=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.93,S*.68,S*.12);
      g.fillStyle(0x66ccff,0.3);g.fillCircle(S*.5,S*.54,S*.44);
      g.fillStyle(0x77ddff,0.65);g.fillEllipse(S*.5,S*.58,S*.7,S*.66);
      g.fillStyle(0xaaeeff,0.9);g.fillEllipse(S*.5,S*.61,S*.62,S*.58);
      g.fillStyle(0xddf5ff,0.4);g.fillEllipse(S*.38,S*.38,S*.22,S*.14);
      g.fillStyle(0xffffff,0.25);g.fillEllipse(S*.36,S*.36,S*.12,S*.07);
      g.fillStyle(0x3388cc,0.7);g.fillCircle(S*.5,S*.58,S*.14);
      g.fillStyle(0x66bbee,0.5);g.fillCircle(S*.5,S*.56,S*.08);
      g.fillStyle(0xffffff,1);g.fillEllipse(S*.37,S*.48,S*.18,S*.2);g.fillEllipse(S*.63,S*.48,S*.18,S*.2);
      g.fillStyle(0x113355,1);g.fillEllipse(S*.37,S*.5,S*.11,S*.13);g.fillEllipse(S*.63,S*.5,S*.11,S*.13);
      g.fillStyle(0x001122,1);g.fillCircle(S*.38,S*.51,S*.05);g.fillCircle(S*.64,S*.51,S*.05);
      g.fillStyle(0xffffff,0.9);g.fillCircle(S*.35,S*.47,S*.03);g.fillCircle(S*.61,S*.47,S*.03);
      g.lineStyle(3,0x336699,0.9);g.lineBetween(S*.41,S*.62,S*.45,S*.65);g.lineBetween(S*.45,S*.65,S*.55,S*.65);g.lineBetween(S*.55,S*.65,S*.59,S*.62);
      // 泡(炭酸風)
      g.fillStyle(0xffffff,0.7);
      g.fillCircle(S*.42,S*.36,S*.025);
      g.fillCircle(S*.58,S*.39,S*.022);
      g.fillCircle(S*.50,S*.30,S*.02);
      g.fillStyle(0xeef9ff,0.5);g.fillCircle(S*.28,S*.52,S*.05);g.fillCircle(S*.7,S*.55,S*.04);
    });

    // ビーチクラブ(海岸のカニ)
    mk('enemy_beach_crab',88,(g,S)=>{
      // 影
      g.fillStyle(0x000000,0.25);g.fillEllipse(S*.5,S*.92,S*.75,S*.12);
      // 体本体(オレンジ赤の甲羅)
      g.fillStyle(0xcc4422,1);g.fillEllipse(S*.5,S*.6,S*.7,S*.45);
      g.fillStyle(0xee6644,1);g.fillEllipse(S*.5,S*.58,S*.6,S*.38);
      // 甲羅の模様(濃い線)
      g.lineStyle(2,0x882211,0.7);
      g.lineBetween(S*.3,S*.5,S*.4,S*.45);
      g.lineBetween(S*.7,S*.5,S*.6,S*.45);
      g.lineBetween(S*.4,S*.65,S*.6,S*.65);
      // 左右の大きなハサミ(両側に飛び出す)
      g.fillStyle(0xcc4422,1);
      // 左ハサミ
      g.fillEllipse(S*.15,S*.55,S*.18,S*.22);
      g.fillTriangle(S*.06,S*.5,S*.18,S*.45,S*.12,S*.62);
      g.fillTriangle(S*.06,S*.6,S*.18,S*.65,S*.12,S*.5);
      // 右ハサミ
      g.fillEllipse(S*.85,S*.55,S*.18,S*.22);
      g.fillTriangle(S*.94,S*.5,S*.82,S*.45,S*.88,S*.62);
      g.fillTriangle(S*.94,S*.6,S*.82,S*.65,S*.88,S*.5);
      // ハサミのハイライト
      g.fillStyle(0xee8866,0.5);g.fillEllipse(S*.14,S*.53,S*.08,S*.1);g.fillEllipse(S*.86,S*.53,S*.08,S*.1);
      // 足(下に6本)
      g.lineStyle(3,0x882211,1);
      g.lineBetween(S*.32,S*.72,S*.22,S*.85);
      g.lineBetween(S*.4,S*.78,S*.32,S*.92);
      g.lineBetween(S*.48,S*.78,S*.45,S*.92);
      g.lineBetween(S*.52,S*.78,S*.55,S*.92);
      g.lineBetween(S*.6,S*.78,S*.68,S*.92);
      g.lineBetween(S*.68,S*.72,S*.78,S*.85);
      // 目(2つの黒い点・突起)
      g.fillStyle(0xffffff,1);g.fillCircle(S*.42,S*.42,S*.06);g.fillCircle(S*.58,S*.42,S*.06);
      g.fillStyle(0x000000,1);g.fillCircle(S*.42,S*.42,S*.035);g.fillCircle(S*.58,S*.42,S*.035);
      // 目の柄
      g.lineStyle(2,0x882211,1);
      g.lineBetween(S*.42,S*.48,S*.42,S*.55);
      g.lineBetween(S*.58,S*.48,S*.58,S*.55);
    });

    // ウィスプ(浮遊光の精霊・青白く光る)
    mk('enemy_wisp',80,(g,S)=>{
      // 外側のグロー(青白い光)
      g.fillStyle(0x88ccff,0.2);g.fillCircle(S*.5,S*.5,S*.45);
      g.fillStyle(0xaaddff,0.35);g.fillCircle(S*.5,S*.5,S*.36);
      g.fillStyle(0xccecff,0.55);g.fillCircle(S*.5,S*.5,S*.28);
      // コア
      g.fillStyle(0xffffff,1);g.fillCircle(S*.5,S*.5,S*.18);
      g.fillStyle(0xffffff,0.95);g.fillCircle(S*.5,S*.48,S*.12);
      // 中心の光点
      g.fillStyle(0xffffff,1);g.fillCircle(S*.5,S*.46,S*.06);
      // 飛び散る粒子(周囲)
      g.fillStyle(0xccecff,0.7);
      g.fillCircle(S*.25,S*.3,S*.04);
      g.fillCircle(S*.78,S*.32,S*.035);
      g.fillCircle(S*.3,S*.7,S*.04);
      g.fillCircle(S*.72,S*.72,S*.045);
      g.fillCircle(S*.5,S*.18,S*.03);
      g.fillCircle(S*.5,S*.82,S*.03);
      // 内側の青いスパーク
      g.fillStyle(0x66ccff,0.6);
      g.fillCircle(S*.4,S*.42,S*.025);
      g.fillCircle(S*.6,S*.55,S*.025);
      // 揺らぎの線(エネルギー)
      g.lineStyle(1,0xaaddff,0.5);
      g.lineBetween(S*.32,S*.5,S*.42,S*.5);
      g.lineBetween(S*.58,S*.5,S*.68,S*.5);
    });

    // ガマ忍者(緑のカエル+忍者装束)
    mk('enemy_gama_ninja',96,(g,S)=>{
      // 影
      g.fillStyle(0x000000,0.25);g.fillEllipse(S*.5,S*.93,S*.65,S*.08);
      // 体本体(緑のカエル体型・楕円)
      g.fillStyle(0x3a6a2a,1);g.fillEllipse(S*.5,S*.6,S*.62,S*.55);
      // 腹部(クリーム色)
      g.fillStyle(0xddc888,0.9);g.fillEllipse(S*.5,S*.66,S*.45,S*.35);
      // 忍者装束(紺色の上半身覆い)
      g.fillStyle(0x1a2244,1);g.fillRect(S*.22, S*.42, S*.56, S*.16);
      g.fillStyle(0x1a2244,1);g.fillTriangle(S*.22, S*.58, S*.78, S*.58, S*.5, S*.7);
      // 忍者装束の襟・帯
      g.fillStyle(0xaa2222,1);g.fillRect(S*.3, S*.52, S*.4, S*.04);
      // 頭部(緑・幅広)
      g.fillStyle(0x3a6a2a,1);g.fillEllipse(S*.5,S*.32,S*.5,S*.32);
      // 頭部の濃い斑点
      g.fillStyle(0x2a4a1a,0.7);g.fillCircle(S*.36, S*.28, S*.04);
      g.fillCircle(S*.64, S*.28, S*.04);
      g.fillCircle(S*.5, S*.4, S*.03);
      // 大きな目(2つ・カエルらしく上に飛び出す)
      g.fillStyle(0x224422,1);g.fillCircle(S*.36, S*.22, S*.1);
      g.fillCircle(S*.64, S*.22, S*.1);
      g.fillStyle(0xffff00,1);g.fillCircle(S*.36, S*.22, S*.08);
      g.fillCircle(S*.64, S*.22, S*.08);
      g.fillStyle(0x000000,1);g.fillEllipse(S*.36, S*.22, S*.03, S*.06);
      g.fillEllipse(S*.64, S*.22, S*.03, S*.06);
      // 額の鉢巻(赤)
      g.fillStyle(0xcc2222,1);g.fillRect(S*.25, S*.18, S*.5, S*.05);
      // 口
      g.lineStyle(2,0x1a2210,1);g.beginPath();g.moveTo(S*.4, S*.42);g.lineTo(S*.5, S*.45);g.lineTo(S*.6, S*.42);g.strokePath();
      // 手(手裏剣構える)
      g.fillStyle(0x3a6a2a,1);g.fillCircle(S*.22, S*.62, S*.07);
      g.fillCircle(S*.78, S*.62, S*.07);
      // 手裏剣(右手)
      g.fillStyle(0x666666,1);
      g.fillTriangle(S*.78-S*.04, S*.62, S*.78+S*.06, S*.6, S*.78, S*.7);
      g.fillTriangle(S*.78+S*.04, S*.62, S*.78-S*.06, S*.64, S*.78, S*.54);
      g.fillCircle(S*.78, S*.62, S*.02);
      // 足
      g.fillStyle(0x3a6a2a,1);g.fillEllipse(S*.36, S*.86, S*.16, S*.08);
      g.fillEllipse(S*.64, S*.86, S*.16, S*.08);
    });

    // 赤鬼(でっかい赤い鬼・トゲ棍棒持ち)
    mk('enemy_red_oni',120,(g,S)=>{
      // 影
      g.fillStyle(0x000000,0.35);g.fillEllipse(S*.5,S*.94,S*.75,S*.08);
      // 体本体(赤い肌)
      g.fillStyle(0xaa2222,1);g.fillEllipse(S*.5,S*.62,S*.75,S*.55);
      // 腹筋ハイライト
      g.fillStyle(0xcc3333,0.5);g.fillEllipse(S*.5,S*.6,S*.5,S*.4);
      // 腰布(虎柄・黄色+黒)
      g.fillStyle(0xddaa00,1);g.fillRect(S*.25, S*.7, S*.5, S*.18);
      g.lineStyle(2,0x000000,1);
      g.lineBetween(S*.3, S*.72, S*.3, S*.86);
      g.lineBetween(S*.4, S*.72, S*.4, S*.86);
      g.lineBetween(S*.5, S*.72, S*.5, S*.86);
      g.lineBetween(S*.6, S*.72, S*.6, S*.86);
      g.lineBetween(S*.7, S*.72, S*.7, S*.86);
      // 頭部(でっかい)
      g.fillStyle(0xaa2222,1);g.fillCircle(S*.5,S*.3,S*.22);
      // 髪(黒・モジャモジャ)
      g.fillStyle(0x221111,1);
      g.fillTriangle(S*.32, S*.18, S*.42, S*.06, S*.5, S*.2);
      g.fillTriangle(S*.5, S*.2, S*.58, S*.06, S*.68, S*.18);
      g.fillTriangle(S*.3, S*.22, S*.32, S*.1, S*.4, S*.2);
      g.fillTriangle(S*.6, S*.2, S*.68, S*.1, S*.7, S*.22);
      // 角(2本・白)
      g.fillStyle(0xeeddaa,1);
      g.fillTriangle(S*.35, S*.18, S*.32, S*.04, S*.4, S*.16);
      g.fillTriangle(S*.65, S*.18, S*.68, S*.04, S*.6, S*.16);
      // 目(怒り・黄色)
      g.fillStyle(0xffff00,1);g.fillCircle(S*.42, S*.3, S*.04);
      g.fillCircle(S*.58, S*.3, S*.04);
      g.fillStyle(0x000000,1);g.fillCircle(S*.42, S*.3, S*.02);
      g.fillCircle(S*.58, S*.3, S*.02);
      // 眉毛(怒り)
      g.lineStyle(3,0x111111,1);
      g.lineBetween(S*.36, S*.24, S*.46, S*.28);
      g.lineBetween(S*.64, S*.24, S*.54, S*.28);
      // 口(牙)
      g.fillStyle(0x111111,1);g.fillRect(S*.42, S*.38, S*.16, S*.05);
      g.fillStyle(0xffffff,1);
      g.fillTriangle(S*.44, S*.38, S*.46, S*.45, S*.48, S*.38);
      g.fillTriangle(S*.52, S*.38, S*.54, S*.45, S*.56, S*.38);
      // 棍棒(右側・ギザギザ)
      g.fillStyle(0x553311,1);g.fillRect(S*.78, S*.4, S*.06, S*.36);
      g.fillStyle(0x884422,1);g.fillEllipse(S*.81, S*.36, S*.16, S*.16);
      // 棍棒のトゲ
      g.fillStyle(0xeeddaa,1);
      g.fillTriangle(S*.78, S*.32, S*.74, S*.28, S*.78, S*.36);
      g.fillTriangle(S*.84, S*.32, S*.88, S*.28, S*.84, S*.36);
      g.fillTriangle(S*.81, S*.28, S*.78, S*.22, S*.84, S*.22);
      g.fillTriangle(S*.74, S*.42, S*.7, S*.44, S*.78, S*.44);
      g.fillTriangle(S*.88, S*.42, S*.92, S*.44, S*.84, S*.44);
      // 腕
      g.fillStyle(0xaa2222,1);g.fillEllipse(S*.18, S*.55, S*.12, S*.25);
      g.fillEllipse(S*.82, S*.55, S*.12, S*.25);
    });

    // 青鬼(青い鬼・大きな棍棒持ち)
    mk('enemy_blue_oni',118,(g,S)=>{
      // 影
      g.fillStyle(0x000000,0.35);g.fillEllipse(S*.5,S*.94,S*.7,S*.08);
      // 体本体(青い肌)
      g.fillStyle(0x2244aa,1);g.fillEllipse(S*.5,S*.62,S*.7,S*.52);
      // 腹筋ハイライト
      g.fillStyle(0x4466cc,0.5);g.fillEllipse(S*.5,S*.6,S*.48,S*.38);
      // 腰布(虎柄)
      g.fillStyle(0xddaa00,1);g.fillRect(S*.27, S*.7, S*.46, S*.16);
      g.lineStyle(2,0x000000,1);
      g.lineBetween(S*.32, S*.72, S*.32, S*.84);
      g.lineBetween(S*.42, S*.72, S*.42, S*.84);
      g.lineBetween(S*.52, S*.72, S*.52, S*.84);
      g.lineBetween(S*.62, S*.72, S*.62, S*.84);
      // 頭部
      g.fillStyle(0x2244aa,1);g.fillCircle(S*.5,S*.32,S*.2);
      // 髪(黒)
      g.fillStyle(0x111122,1);
      g.fillTriangle(S*.34, S*.2, S*.42, S*.08, S*.5, S*.22);
      g.fillTriangle(S*.5, S*.22, S*.58, S*.08, S*.66, S*.2);
      g.fillTriangle(S*.32, S*.24, S*.34, S*.12, S*.4, S*.22);
      g.fillTriangle(S*.6, S*.22, S*.66, S*.12, S*.68, S*.24);
      // 角(1本・中央)
      g.fillStyle(0xeeddaa,1);
      g.fillTriangle(S*.46, S*.18, S*.5, S*.04, S*.54, S*.18);
      // 目(青い瞳)
      g.fillStyle(0x88ccff,1);g.fillCircle(S*.43, S*.32, S*.04);
      g.fillCircle(S*.57, S*.32, S*.04);
      g.fillStyle(0x000000,1);g.fillCircle(S*.43, S*.32, S*.02);
      g.fillCircle(S*.57, S*.32, S*.02);
      // 眉毛
      g.lineStyle(3,0x000022,1);
      g.lineBetween(S*.37, S*.26, S*.47, S*.3);
      g.lineBetween(S*.63, S*.26, S*.53, S*.3);
      // 口(牙)
      g.fillStyle(0x111111,1);g.fillRect(S*.43, S*.4, S*.14, S*.05);
      g.fillStyle(0xffffff,1);
      g.fillTriangle(S*.45, S*.4, S*.47, S*.46, S*.49, S*.4);
      g.fillTriangle(S*.51, S*.4, S*.53, S*.46, S*.55, S*.4);
      // 棍棒(右側・シンプル)
      g.fillStyle(0x553311,1);g.fillRect(S*.78, S*.42, S*.05, S*.34);
      g.fillStyle(0x884422,1);g.fillEllipse(S*.805, S*.38, S*.14, S*.18);
      // 腕
      g.fillStyle(0x2244aa,1);g.fillEllipse(S*.2, S*.55, S*.1, S*.22);
      g.fillEllipse(S*.8, S*.55, S*.1, S*.22);
    });

    // 手裏剣(プロジェクタイル)
    mk('proj_shuriken',24,(g,S)=>{
      // 4方向の刃
      g.fillStyle(0x444444,1);
      g.fillTriangle(S*.5, S*.05, S*.4, S*.45, S*.6, S*.45);  // 上
      g.fillTriangle(S*.95, S*.5, S*.55, S*.4, S*.55, S*.6);  // 右
      g.fillTriangle(S*.5, S*.95, S*.4, S*.55, S*.6, S*.55);  // 下
      g.fillTriangle(S*.05, S*.5, S*.45, S*.4, S*.45, S*.6);  // 左
      // 中心
      g.fillStyle(0x222222,1);g.fillCircle(S*.5, S*.5, S*.1);
      g.fillStyle(0xeeeeee,1);g.fillCircle(S*.5, S*.5, S*.04);
    });

    // コウモリ
    mk('enemy_bat',80,(g,S)=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.93,S*.58,S*.1);
      g.fillStyle(0x3a1a44,1);g.fillTriangle(S*.44,S*.42,S*.02,S*.18,S*.14,S*.58);g.fillTriangle(S*.44,S*.42,S*.14,S*.58,S*.22,S*.74);
      g.fillStyle(0x3a1a44,1);g.fillTriangle(S*.56,S*.42,S*.98,S*.18,S*.86,S*.58);g.fillTriangle(S*.56,S*.42,S*.86,S*.58,S*.78,S*.74);
      g.fillStyle(0x5a2a66,0.5);g.fillTriangle(S*.44,S*.42,S*.06,S*.22,S*.16,S*.56);g.fillTriangle(S*.56,S*.42,S*.94,S*.22,S*.84,S*.56);
      g.lineStyle(2,0x221133,0.8);g.lineBetween(S*.44,S*.42,S*.02,S*.18);g.lineBetween(S*.44,S*.42,S*.22,S*.74);g.lineBetween(S*.56,S*.42,S*.98,S*.18);g.lineBetween(S*.56,S*.42,S*.78,S*.74);
      g.fillStyle(0x2d1133,1);g.fillEllipse(S*.5,S*.52,S*.3,S*.36);
      g.fillStyle(0x2d1133,1);g.fillTriangle(S*.36,S*.32,S*.28,S*.08,S*.44,S*.3);g.fillTriangle(S*.64,S*.32,S*.56,S*.3,S*.72,S*.08);
      g.fillStyle(0xff88aa,0.4);g.fillTriangle(S*.37,S*.3,S*.31,S*.12,S*.43,S*.28);g.fillTriangle(S*.63,S*.3,S*.57,S*.28,S*.69,S*.12);
      g.fillStyle(0x2d1133,1);g.fillEllipse(S*.5,S*.34,S*.34,S*.3);
      g.fillStyle(0xff0000,1);g.fillEllipse(S*.38,S*.33,S*.14,S*.1);g.fillEllipse(S*.62,S*.33,S*.14,S*.1);
      g.fillStyle(0xff6666,0.8);g.fillCircle(S*.38,S*.33,S*.05);g.fillCircle(S*.62,S*.33,S*.05);
      g.fillStyle(0xffffff,0.6);g.fillCircle(S*.36,S*.31,S*.02);g.fillCircle(S*.6,S*.31,S*.02);
      g.fillStyle(0x221133,1);g.fillEllipse(S*.5,S*.4,S*.16,S*.1);
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.43,S*.42,S*.4,S*.5,S*.46,S*.42);g.fillTriangle(S*.57,S*.42,S*.54,S*.42,S*.6,S*.5);
    });

    // ゴブリン
    mk('enemy_goblin',88,(g,S)=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.93,S*.6,S*.1);
      g.fillStyle(0x2d5a1a,1);g.fillEllipse(S*.5,S*.62,S*.44,S*.5);
      g.fillStyle(0x6b3d11,1);g.fillRect(S*.28,S*.63,S*.44,S*.06);g.fillStyle(0xccaa33,1);g.fillRect(S*.46,S*.62,S*.08,S*.07);
      g.fillStyle(0x3a7a22,1);g.fillEllipse(S*.2,S*.56,S*.18,S*.36);g.fillEllipse(S*.8,S*.56,S*.18,S*.36);
      g.fillStyle(0x2d6618,1);g.fillCircle(S*.18,S*.73,S*.08);g.fillCircle(S*.82,S*.73,S*.08);
      g.fillStyle(0x111111,1);g.fillTriangle(S*.12,S*.77,S*.14,S*.83,S*.18,S*.77);g.fillTriangle(S*.82,S*.77,S*.86,S*.83,S*.88,S*.77);
      g.fillStyle(0x2d5a1a,1);g.fillEllipse(S*.36,S*.82,S*.16,S*.26);g.fillEllipse(S*.64,S*.82,S*.16,S*.26);
      g.fillStyle(0x6b3d11,1);g.fillEllipse(S*.36,S*.91,S*.16,S*.1);g.fillEllipse(S*.64,S*.91,S*.16,S*.1);
      g.fillStyle(0x3a7a22,1);g.fillEllipse(S*.5,S*.27,S*.42,S*.36);
      g.fillStyle(0x2d6618,1);g.fillTriangle(S*.24,S*.22,S*.12,S*.14,S*.3,S*.32);g.fillTriangle(S*.76,S*.22,S*.7,S*.32,S*.88,S*.14);
      g.fillStyle(0xff8888,0.35);g.fillTriangle(S*.25,S*.23,S*.15,S*.17,S*.29,S*.3);
      g.fillStyle(0x1a3d0a,1);g.fillRect(S*.3,S*.18,S*.12,S*.04);g.fillRect(S*.58,S*.18,S*.12,S*.04);
      g.fillStyle(0xffee00,1);g.fillEllipse(S*.36,S*.26,S*.14,S*.12);g.fillEllipse(S*.64,S*.26,S*.14,S*.12);
      g.fillStyle(0xcc3300,1);g.fillCircle(S*.37,S*.26,S*.06);g.fillCircle(S*.63,S*.26,S*.06);
      g.fillStyle(0x000000,1);g.fillCircle(S*.37,S*.26,S*.03);g.fillCircle(S*.63,S*.26,S*.03);
      g.fillStyle(0xffffff,0.8);g.fillCircle(S*.35,S*.24,S*.02);g.fillCircle(S*.61,S*.24,S*.02);
      g.fillStyle(0x2d6618,1);g.fillEllipse(S*.5,S*.33,S*.14,S*.1);
      g.fillStyle(0x1a1a1a,1);g.fillEllipse(S*.5,S*.39,S*.22,S*.1);
      g.fillStyle(0xeeeecc,1);g.fillTriangle(S*.4,S*.36,S*.38,S*.43,S*.43,S*.36);g.fillTriangle(S*.57,S*.36,S*.55,S*.36,S*.6,S*.43);
    });

    // トロル
    mk('enemy_troll',112,(g,S)=>{
      g.fillStyle(0x000000,0.3);g.fillEllipse(S*.5,S*.95,S*.8,S*.12);
      g.fillStyle(0x5a6644,1);g.fillEllipse(S*.5,S*.63,S*.66,S*.62);
      g.fillStyle(0x4a5534,0.5);g.fillEllipse(S*.3,S*.5,S*.18,S*.12);g.fillEllipse(S*.7,S*.55,S*.16,S*.1);g.fillEllipse(S*.5,S*.72,S*.2,S*.1);
      g.fillStyle(0x7a8858,0.35);g.fillEllipse(S*.42,S*.46,S*.22,S*.16);
      g.fillStyle(0x4a5534,1);g.fillEllipse(S*.16,S*.55,S*.24,S*.44);g.fillEllipse(S*.84,S*.55,S*.24,S*.44);
      g.fillStyle(0x3a4424,1);g.fillCircle(S*.14,S*.75,S*.12);g.fillCircle(S*.86,S*.75,S*.12);
      g.fillStyle(0x222211,1);[-.08,-.02,.04,.1].forEach(o=>{g.fillTriangle(S*(.14+o),S*.83,S*(.12+o),S*.89,S*(.16+o),S*.83);g.fillTriangle(S*(.86+o),S*.83,S*(.84+o),S*.83,S*(.88+o),S*.89);});
      g.fillStyle(0x4a5534,1);g.fillEllipse(S*.34,S*.83,S*.22,S*.3);g.fillEllipse(S*.66,S*.83,S*.22,S*.3);
      g.fillStyle(0x5a6644,1);g.fillEllipse(S*.5,S*.27,S*.5,S*.38);
      g.fillStyle(0x2a3318,1);g.fillRect(S*.28,S*.18,S*.44,S*.06);
      g.fillStyle(0x3a4424,1);g.fillCircle(S*.32,S*.22,S*.04);g.fillCircle(S*.68,S*.22,S*.04);g.fillCircle(S*.5,S*.16,S*.05);
      g.fillStyle(0xff8800,1);g.fillCircle(S*.38,S*.25,S*.07);g.fillCircle(S*.62,S*.25,S*.07);
      g.fillStyle(0x331100,1);g.fillCircle(S*.38,S*.25,S*.04);g.fillCircle(S*.62,S*.25,S*.04);
      g.fillStyle(0xffffff,0.6);g.fillCircle(S*.36,S*.23,S*.02);g.fillCircle(S*.6,S*.23,S*.02);
      g.fillStyle(0x3a4424,1);g.fillEllipse(S*.5,S*.33,S*.2,S*.12);
      g.fillStyle(0x1a1a1a,1);g.fillEllipse(S*.5,S*.39,S*.28,S*.12);
      g.fillStyle(0xddddbb,1);g.fillTriangle(S*.4,S*.35,S*.37,S*.45,S*.44,S*.35);g.fillTriangle(S*.56,S*.35,S*.56,S*.35,S*.63,S*.45);
    });

    // ウルフ
    mk('enemy_wolf',96,(g,S)=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.92,S*.72,S*.1);
      g.fillStyle(0x4a4466,1);g.fillEllipse(S*.82,S*.54,S*.16,S*.38);
      g.fillStyle(0x6a6488,0.5);g.fillEllipse(S*.8,S*.5,S*.1,S*.22);
      g.fillStyle(0x4a4466,1);g.fillEllipse(S*.46,S*.6,S*.56,S*.44);
      g.fillStyle(0x6a6488,0.4);g.fillEllipse(S*.44,S*.55,S*.38,S*.28);
      g.fillStyle(0xaaaacc,0.25);g.fillEllipse(S*.42,S*.52,S*.22,S*.18);
      g.fillStyle(0x3a3456,1);g.fillRect(S*.24,S*.72,S*.1,S*.22);g.fillRect(S*.38,S*.74,S*.1,S*.2);g.fillRect(S*.54,S*.74,S*.1,S*.2);g.fillRect(S*.68,S*.72,S*.1,S*.22);
      g.fillStyle(0xff9988,1);g.fillCircle(S*.29,S*.92,S*.05);g.fillCircle(S*.43,S*.93,S*.05);g.fillCircle(S*.59,S*.93,S*.05);g.fillCircle(S*.73,S*.92,S*.05);
      g.fillStyle(0x4a4466,1);g.fillEllipse(S*.3,S*.44,S*.28,S*.3);
      g.fillStyle(0x3a3456,1);g.fillTriangle(S*.22,S*.3,S*.14,S*.08,S*.3,S*.28);g.fillTriangle(S*.36,S*.28,S*.3,S*.28,S*.38,S*.08);
      g.fillStyle(0xff9988,0.5);g.fillTriangle(S*.23,S*.28,S*.17,S*.12,S*.29,S*.27);
      g.fillStyle(0xddddee,0.5);g.fillEllipse(S*.27,S*.44,S*.18,S*.14);
      g.fillStyle(0xffcc00,1);g.fillEllipse(S*.22,S*.38,S*.12,S*.08);g.fillEllipse(S*.36,S*.38,S*.12,S*.08);
      g.fillStyle(0x111100,1);g.fillEllipse(S*.22,S*.38,S*.05,S*.07);g.fillEllipse(S*.36,S*.38,S*.05,S*.07);
      g.fillStyle(0xffffff,0.7);g.fillCircle(S*.2,S*.36,S*.02);g.fillCircle(S*.34,S*.36,S*.02);
      g.fillStyle(0x1a1a22,1);g.fillEllipse(S*.28,S*.46,S*.1,S*.07);
      g.fillStyle(0x1a1a1a,1);g.fillEllipse(S*.28,S*.52,S*.16,S*.08);
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.22,S*.5,S*.2,S*.57,S*.25,S*.5);g.fillTriangle(S*.32,S*.5,S*.3,S*.5,S*.33,S*.57);
    });

    // スケルトン
    mk('enemy_skeleton',96,(g,S)=>{
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.94,S*.6,S*.1);
      g.fillStyle(0x3d2d1a,0.7);g.fillEllipse(S*.5,S*.6,S*.5,S*.52);
      g.fillStyle(0xeeeedd,1);
      for(let i=0;i<4;i++){const y=S*(0.46+i*0.07);g.fillRect(S*.32,y,S*.36,S*.025);}
      g.fillStyle(0xeeeedd,1);g.fillRect(S*.47,S*.38,S*.06,S*.42);
      g.fillStyle(0xeeeedd,1);g.fillEllipse(S*.5,S*.74,S*.32,S*.18);
      g.fillStyle(0xeeeedd,1);g.fillRect(S*.18,S*.44,S*.08,S*.28);g.fillRect(S*.74,S*.44,S*.08,S*.28);g.fillRect(S*.16,S*.7,S*.08,S*.22);g.fillRect(S*.76,S*.7,S*.08,S*.22);
      g.fillStyle(0xeeeedd,1);[-.06,-.02,.02,.06].forEach(o=>{g.fillRect(S*(.18+o),S*.9,S*.025,S*.06);g.fillRect(S*(.8+o),S*.9,S*.025,S*.06);});
      g.fillRect(S*.36,S*.78,S*.08,S*.16);g.fillRect(S*.56,S*.78,S*.08,S*.16);
      g.fillStyle(0xeeeedd,1);g.fillEllipse(S*.5,S*.24,S*.38,S*.34);
      g.lineStyle(1,0xaaaaaa,0.5);g.lineBetween(S*.42,S*.14,S*.44,S*.22);g.lineBetween(S*.58,S*.16,S*.55,S*.24);
      g.fillStyle(0x1a1100,1);g.fillEllipse(S*.37,S*.23,S*.14,S*.12);g.fillEllipse(S*.63,S*.23,S*.14,S*.12);
      g.fillStyle(0x4400aa,0.6);g.fillEllipse(S*.37,S*.23,S*.08,S*.08);g.fillEllipse(S*.63,S*.23,S*.08,S*.08);
      g.fillStyle(0x8800ff,0.4);g.fillCircle(S*.37,S*.23,S*.03);g.fillCircle(S*.63,S*.23,S*.03);
      g.fillStyle(0x1a1100,1);g.fillEllipse(S*.46,S*.3,S*.05,S*.06);g.fillEllipse(S*.54,S*.3,S*.05,S*.06);
      g.fillStyle(0xeeeedd,1);[0,1,2,3,4].forEach(i=>g.fillRect(S*(0.37+i*0.052),S*.34,S*.038,S*.06));
      g.fillStyle(0x1a1100,1);g.fillEllipse(S*.5,S*.34,S*.24,S*.08);
    });

    // ドラゴン
    mk('enemy_dragon',112,(g,S)=>{
      g.fillStyle(0x000000,0.3);g.fillEllipse(S*.5,S*.95,S*.85,S*.13);
      g.fillStyle(0x8b1a1a,1);g.fillEllipse(S*.84,S*.72,S*.18,S*.1);g.fillEllipse(S*.92,S*.62,S*.14,S*.08);g.fillEllipse(S*.97,S*.52,S*.1,S*.06);
      g.fillStyle(0xffcc00,1);g.fillTriangle(S*.97,S*.46,S*.94,S*.56,S*.99,S*.53);
      g.fillStyle(0x6b0a0a,0.9);g.fillTriangle(S*.5,S*.4,S*.02,S*.06,S*.28,S*.54);g.fillTriangle(S*.5,S*.4,S*.98,S*.06,S*.72,S*.54);
      g.fillStyle(0x8b1a1a,0.4);g.fillTriangle(S*.5,S*.4,S*.06,S*.1,S*.3,S*.52);g.fillTriangle(S*.5,S*.4,S*.94,S*.1,S*.7,S*.52);
      g.lineStyle(2,0x440000,0.7);g.lineBetween(S*.5,S*.4,S*.02,S*.06);g.lineBetween(S*.5,S*.4,S*.28,S*.54);g.lineBetween(S*.5,S*.4,S*.98,S*.06);g.lineBetween(S*.5,S*.4,S*.72,S*.54);g.lineBetween(S*.5,S*.4,S*.14,S*.18);g.lineBetween(S*.5,S*.4,S*.86,S*.18);
      g.fillStyle(0x8b1a1a,1);g.fillEllipse(S*.5,S*.64,S*.54,S*.52);
      g.fillStyle(0xaa3333,0.4);g.fillEllipse(S*.5,S*.58,S*.36,S*.3);
      g.fillStyle(0x6b0a0a,0.35);for(let r=0;r<3;r++)for(let c=0;c<4;c++)g.fillEllipse(S*(0.32+c*0.12),S*(0.56+r*0.08),S*.08,S*.05);
      g.fillStyle(0xdd8866,0.5);g.fillEllipse(S*.5,S*.66,S*.28,S*.36);
      g.fillStyle(0x7b1212,1);g.fillEllipse(S*.3,S*.82,S*.2,S*.28);g.fillEllipse(S*.7,S*.82,S*.2,S*.28);
      g.fillStyle(0x111111,1);[[.22,.94],[.29,.96],[.36,.94],[.64,.94],[.71,.96],[.78,.94]].forEach(([x,y])=>{g.fillTriangle(S*x,S*y,S*(x-.04),S*(y+.06),S*(x+.04),S*y);});
      g.fillStyle(0x8b1a1a,1);g.fillEllipse(S*.5,S*.42,S*.3,S*.26);
      g.fillStyle(0x8b1a1a,1);g.fillEllipse(S*.5,S*.26,S*.44,S*.34);
      g.fillStyle(0xffcc00,1);g.fillTriangle(S*.36,S*.2,S*.28,S*.0,S*.42,S*.22);g.fillTriangle(S*.64,S*.2,S*.58,S*.22,S*.72,S*.0);
      g.fillStyle(0xffdd00,1);g.fillEllipse(S*.36,S*.24,S*.14,S*.11);g.fillEllipse(S*.64,S*.24,S*.14,S*.11);
      g.fillStyle(0x000000,1);g.fillRect(S*.37,S*.2,S*.02,S*.08);g.fillRect(S*.63,S*.2,S*.02,S*.08);
      g.fillStyle(0xffffff,0.5);g.fillCircle(S*.34,S*.22,S*.02);g.fillCircle(S*.6,S*.22,S*.02);
      g.fillStyle(0x221111,1);g.fillCircle(S*.44,S*.31,S*.04);g.fillCircle(S*.56,S*.31,S*.04);
      g.fillStyle(0x1a0000,1);g.fillEllipse(S*.5,S*.36,S*.26,S*.1);
      g.fillStyle(0xff6600,0.7);g.fillEllipse(S*.5,S*.35,S*.14,S*.05);
      g.fillStyle(0xffffff,1);for(let i=0;i<4;i++)g.fillTriangle(S*(0.39+i*0.07),S*.33,S*(0.37+i*0.07),S*.39,S*(0.41+i*0.07),S*.33);
    });

    // サンドワーム
    mk('enemy_sandworm',112,(g,S)=>{
      g.fillStyle(0x000000,0.25);g.fillEllipse(S*.5,S*.94,S*.8,S*.12);
      g.fillStyle(0xcc9944,1);g.fillEllipse(S*.5,S*.82,S*.44,S*.22);g.fillEllipse(S*.5,S*.72,S*.48,S*.22);
      g.fillStyle(0xddaa55,0.4);g.fillEllipse(S*.5,S*.78,S*.3,S*.14);
      g.fillStyle(0xdd9933,1);g.fillEllipse(S*.5,S*.62,S*.52,S*.24);g.fillStyle(0xeebb55,0.4);g.fillEllipse(S*.5,S*.58,S*.34,S*.16);
      g.lineStyle(2,0xaa7722,0.5);g.strokeEllipse(S*.5,S*.82,S*.44,S*.22);g.strokeEllipse(S*.5,S*.72,S*.48,S*.22);g.strokeEllipse(S*.5,S*.62,S*.52,S*.24);
      g.fillStyle(0xcc8822,1);g.fillEllipse(S*.5,S*.5,S*.56,S*.28);g.fillStyle(0xddaa44,0.4);g.fillEllipse(S*.5,S*.46,S*.38,S*.18);
      g.fillStyle(0x220a00,1);g.fillCircle(S*.5,S*.36,S*.28);g.fillStyle(0x441400,0.6);g.fillCircle(S*.5,S*.36,S*.22);
      g.fillStyle(0xeeddcc,1);
      for(let i=0;i<12;i++){const a=i/12*Math.PI*2;g.fillTriangle(S*.5+Math.cos(a)*S*.26,S*.36+Math.sin(a)*S*.26,S*.5+Math.cos(a+0.28)*S*.22,S*.36+Math.sin(a+0.28)*S*.22,S*.5+Math.cos(a-0.28)*S*.22,S*.36+Math.sin(a-0.28)*S*.22);}
      g.fillStyle(0xff4400,0.8);g.fillCircle(S*.5,S*.36,S*.16);g.fillStyle(0xff2200,0.6);g.fillCircle(S*.5,S*.36,S*.1);g.fillStyle(0x220000,1);g.fillCircle(S*.5,S*.36,S*.05);
      g.fillStyle(0xcc8822,1);g.fillRect(S*.38,S*.18,S*.05,S*.16);g.fillRect(S*.57,S*.18,S*.05,S*.16);
      g.fillStyle(0xff0000,1);g.fillCircle(S*.40,S*.17,S*.04);g.fillCircle(S*.59,S*.17,S*.04);
    });

    // スコーピオン
    mk('enemy_scorpion',96,(g,S)=>{
      g.fillStyle(0x000000,0.25);g.fillEllipse(S*.5,S*.93,S*.7,S*.1);
      g.fillStyle(0x8b4400,1);g.fillEllipse(S*.74,S*.44,S*.12,S*.18);g.fillEllipse(S*.8,S*.32,S*.1,S*.16);g.fillEllipse(S*.78,S*.2,S*.1,S*.14);
      g.fillStyle(0x22aa00,1);g.fillTriangle(S*.75,S*.12,S*.72,S*.2,S*.8,S*.16);g.fillStyle(0x44ff00,0.5);g.fillTriangle(S*.76,S*.13,S*.74,S*.18,S*.79,S*.15);
      g.fillStyle(0x8b4400,1);g.fillEllipse(S*.5,S*.58,S*.48,S*.52);g.fillStyle(0xaa5500,0.4);g.fillEllipse(S*.5,S*.52,S*.32,S*.3);
      g.lineStyle(2,0x662200,0.6);g.lineBetween(S*.26,S*.48,S*.74,S*.48);g.lineBetween(S*.24,S*.56,S*.76,S*.56);g.lineBetween(S*.26,S*.64,S*.74,S*.64);
      g.fillStyle(0x7b3300,1);[-.16,-.06,.04,.14].forEach(o=>{g.fillRect(S*(.28+o),S*.62,S*.04,S*.2);g.fillRect(S*(.68+o),S*.62,S*.04,S*.2);});
      g.fillStyle(0x8b4400,1);g.fillEllipse(S*.22,S*.52,S*.18,S*.1);g.fillEllipse(S*.14,S*.46,S*.14,S*.1);
      g.fillStyle(0x7b3300,1);g.fillTriangle(S*.08,S*.42,S*.18,S*.44,S*.12,S*.5);
      g.fillStyle(0x8b4400,1);g.fillEllipse(S*.28,S*.38,S*.18,S*.1);g.fillEllipse(S*.2,S*.3,S*.14,S*.1);
      g.fillStyle(0x7b3300,1);g.fillTriangle(S*.14,S*.26,S*.24,S*.28,S*.18,S*.36);
      g.fillStyle(0x9b5500,1);g.fillEllipse(S*.5,S*.38,S*.36,S*.28);g.fillStyle(0xcc7722,0.35);g.fillEllipse(S*.48,S*.34,S*.2,S*.14);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.34,S*.04);g.fillCircle(S*.46,S*.32,S*.03);g.fillCircle(S*.54,S*.32,S*.03);g.fillCircle(S*.62,S*.34,S*.04);
      g.fillStyle(0xff0000,0.7);g.fillCircle(S*.38,S*.34,S*.02);g.fillCircle(S*.62,S*.34,S*.02);
    });

    // ボス1
    // ボス1: キングスライム(巨大なスライム・ぷるぷるしてる)
    mk('enemy_boss1',128,(g,S)=>{
      // 影
      g.fillStyle(0x000000,0.45);g.fillEllipse(S*.5,S*.96,S*.95,S*.12);
      // 外側のオーラ(青緑)
      g.fillStyle(0x44ddaa,0.15);g.fillEllipse(S*.5,S*.55,S*.55,S*.50);
      g.fillStyle(0x66ffcc,0.20);g.fillEllipse(S*.5,S*.55,S*.50,S*.45);
      // 本体・大きな水滴形(下が広く、上が丸い)
      g.fillStyle(0x88ddff,1);g.fillEllipse(S*.5,S*.62,S*.86,S*.66);
      // 本体の影(下半分・少し暗め)
      g.fillStyle(0x4499cc,0.5);g.fillEllipse(S*.5,S*.78,S*.78,S*.32);
      // 本体の中の透明感(白いハイライト・大)
      g.fillStyle(0xffffff,0.5);g.fillEllipse(S*.32,S*.38,S*.30,S*.20);
      g.fillStyle(0xffffff,0.7);g.fillEllipse(S*.30,S*.36,S*.16,S*.10);
      // 王冠(キングスライム!)
      g.fillStyle(0xffd700,1);g.fillRect(S*.30,S*.18,S*.40,S*.10);
      // 王冠の三角(5つ)
      [0,1,2,3,4].forEach(i=>{
        const cx=0.32+i*0.09;
        g.fillTriangle(S*cx, S*.18, S*(cx+0.045), S*.06, S*(cx+0.09), S*.18);
      });
      // 王冠の宝石(中央に赤・両側に青)
      g.fillStyle(0xff2244,1);g.fillCircle(S*.5,S*.10,S*.04);
      g.fillStyle(0xffffaa,0.8);g.fillCircle(S*.49,S*.09,S*.015);
      g.fillStyle(0x44aaff,1);g.fillCircle(S*.36,S*.13,S*.025);g.fillCircle(S*.64,S*.13,S*.025);
      // 王冠の縁(暗い金)
      g.fillStyle(0xaa8800,1);g.fillRect(S*.30,S*.26,S*.40,S*.02);
      // 大きな目(2つ)
      g.fillStyle(0xffffff,1);g.fillEllipse(S*.36,S*.50,S*.14,S*.16);g.fillEllipse(S*.64,S*.50,S*.14,S*.16);
      // 黒目
      g.fillStyle(0x000000,1);g.fillEllipse(S*.36,S*.52,S*.08,S*.10);g.fillEllipse(S*.64,S*.52,S*.08,S*.10);
      // 目の光(キラリ)
      g.fillStyle(0xffffff,1);g.fillCircle(S*.34,S*.50,S*.025);g.fillCircle(S*.62,S*.50,S*.025);
      // 大きな口(笑顔)
      g.fillStyle(0x224466,1);g.fillEllipse(S*.5,S*.72,S*.30,S*.12);
      // 口の中(舌・赤紫)
      g.fillStyle(0xff66aa,1);g.fillEllipse(S*.5,S*.74,S*.20,S*.06);
      // 牙(かわいい牙2本)
      g.fillStyle(0xffffff,1);
      g.fillTriangle(S*.42,S*.66,S*.40,S*.74,S*.46,S*.70);
      g.fillTriangle(S*.58,S*.66,S*.54,S*.70,S*.60,S*.74);
      // 体の周りにこぼれる滴(スライムらしさ)
      g.fillStyle(0x88ddff,0.85);
      g.fillCircle(S*.18,S*.85,S*.05);
      g.fillCircle(S*.82,S*.88,S*.045);
      g.fillCircle(S*.10,S*.78,S*.03);
      g.fillCircle(S*.90,S*.80,S*.04);
      // ハイライト(滴)
      g.fillStyle(0xffffff,0.6);
      g.fillCircle(S*.17,S*.84,S*.018);
      g.fillCircle(S*.81,S*.87,S*.015);
      // 体の中の小さな気泡
      g.fillStyle(0xffffff,0.4);
      g.fillCircle(S*.45,S*.82,S*.025);
      g.fillCircle(S*.58,S*.86,S*.020);
      g.fillCircle(S*.65,S*.80,S*.018);
    });

    // ボス2（ウルフキング・狼の王・四足獣・銀灰色の毛並み・金の王冠）
    mk('enemy_boss2',140,(g,S)=>{
      // 影
      g.fillStyle(0x000000,0.40);g.fillEllipse(S*.5,S*.96,S*.86,S*.12);
      // 風のオーラ(boss属性wind)
      g.fillStyle(0xaaccff,0.06);g.fillCircle(S*.5,S*.55,S*.52);
      g.fillStyle(0xddeeff,0.04);g.fillCircle(S*.5,S*.55,S*.42);

      // ── 後脚(下層) ──
      g.fillStyle(0x3a3a40,1);g.fillEllipse(S*.22,S*.78,S*.16,S*.20);g.fillEllipse(S*.78,S*.78,S*.16,S*.20);
      g.fillStyle(0x55555a,1);g.fillEllipse(S*.22,S*.85,S*.13,S*.13);g.fillEllipse(S*.78,S*.85,S*.13,S*.13);
      // 後脚の爪
      g.fillStyle(0x222222,1);
      [[.18,.93],[.22,.95],[.26,.93]].forEach(([x,y])=>{g.fillTriangle(S*x,S*y,S*(x-.018),S*(y+.05),S*(x+.018),S*y);});
      [[.74,.93],[.78,.95],[.82,.93]].forEach(([x,y])=>{g.fillTriangle(S*x,S*y,S*(x-.018),S*(y+.05),S*(x+.018),S*y);});

      // ── 尻尾(ふさふさ・3層) ──
      g.fillStyle(0x3a3a40,1);g.fillEllipse(S*.94,S*.62,S*.12,S*.22);
      g.fillStyle(0x55555a,1);g.fillEllipse(S*.95,S*.55,S*.08,S*.14);
      g.fillStyle(0xddddd5,0.8);g.fillEllipse(S*.96,S*.5,S*.05,S*.08); // 先端の白

      // ── 胴体(中央・大きい) ──
      g.fillStyle(0x3a3a40,1);g.fillEllipse(S*.5,S*.66,S*.62,S*.40);
      g.fillStyle(0x55555a,1);g.fillEllipse(S*.5,S*.62,S*.54,S*.32);
      // 胸毛(明るい灰白)
      g.fillStyle(0xc8c8c0,1);g.fillEllipse(S*.5,S*.70,S*.30,S*.20);
      g.fillStyle(0xe0e0d8,0.8);g.fillEllipse(S*.5,S*.72,S*.20,S*.14);

      // ── 前脚(前面) ──
      g.fillStyle(0x3a3a40,1);g.fillEllipse(S*.34,S*.82,S*.14,S*.22);g.fillEllipse(S*.66,S*.82,S*.14,S*.22);
      g.fillStyle(0x55555a,1);g.fillEllipse(S*.34,S*.89,S*.12,S*.12);g.fillEllipse(S*.66,S*.89,S*.12,S*.12);
      // 前脚の爪
      g.fillStyle(0x222222,1);
      [[.30,.95],[.34,.97],[.38,.95]].forEach(([x,y])=>{g.fillTriangle(S*x,S*y,S*(x-.02),S*(y+.05),S*(x+.02),S*y);});
      [[.62,.95],[.66,.97],[.70,.95]].forEach(([x,y])=>{g.fillTriangle(S*x,S*y,S*(x-.02),S*(y+.05),S*(x+.02),S*y);});

      // ── マント(王の証・赤紫) ──
      g.fillStyle(0x661133,1);g.fillTriangle(S*.20,S*.40,S*.80,S*.40,S*.5,S*.86);
      g.fillStyle(0x882244,1);g.fillTriangle(S*.24,S*.42,S*.76,S*.42,S*.5,S*.82);
      // マントの縁(金)
      g.fillStyle(0xffcc44,1);g.fillRect(S*.24,S*.40,S*.52,S*.025);
      g.fillStyle(0xffe888,1);g.fillRect(S*.25,S*.405,S*.50,S*.012);

      // ── 首〜頭 ──
      // 首(太い)
      g.fillStyle(0x44444a,1);g.fillEllipse(S*.5,S*.42,S*.32,S*.20);
      // 頭(大型)
      g.fillStyle(0x3a3a40,1);g.fillEllipse(S*.5,S*.28,S*.46,S*.34);
      g.fillStyle(0x55555a,1);g.fillEllipse(S*.5,S*.27,S*.40,S*.28);

      // 額の白いライン(王者の証)
      g.fillStyle(0xe0e0d8,0.8);g.fillTriangle(S*.5,S*.10,S*.46,S*.22,S*.54,S*.22);

      // ── 耳(立ち耳・大) ──
      g.fillStyle(0x3a3a40,1);g.fillTriangle(S*.26,S*.20,S*.18,S*.02,S*.36,S*.10);
      g.fillTriangle(S*.74,S*.20,S*.82,S*.02,S*.64,S*.10);
      g.fillStyle(0x884433,0.85);g.fillTriangle(S*.27,S*.18,S*.22,S*.06,S*.33,S*.13);
      g.fillTriangle(S*.73,S*.18,S*.78,S*.06,S*.67,S*.13);

      // ── マズル(口元) ──
      g.fillStyle(0x55555a,1);g.fillEllipse(S*.5,S*.40,S*.26,S*.18);
      g.fillStyle(0xc8c8c0,1);g.fillEllipse(S*.5,S*.42,S*.20,S*.13);
      // 鼻
      g.fillStyle(0x111111,1);g.fillEllipse(S*.5,S*.34,S*.08,S*.05);
      g.fillStyle(0x333333,1);g.fillEllipse(S*.5,S*.335,S*.05,S*.025);
      // 口(開けて牙を見せる)
      g.fillStyle(0x220000,1);g.fillEllipse(S*.5,S*.45,S*.16,S*.06);
      g.fillStyle(0x880022,0.7);g.fillEllipse(S*.5,S*.46,S*.10,S*.03); // 舌
      // 牙(白く鋭い・上下)
      g.fillStyle(0xffffff,1);
      g.fillTriangle(S*.43,S*.43,S*.41,S*.49,S*.45,S*.43);
      g.fillTriangle(S*.57,S*.43,S*.55,S*.43,S*.59,S*.49);
      g.fillTriangle(S*.46,S*.47,S*.44,S*.43,S*.48,S*.43);
      g.fillTriangle(S*.54,S*.47,S*.52,S*.43,S*.56,S*.43);

      // ── 目(赤く鋭い) ──
      g.fillStyle(0xff2200,1);g.fillEllipse(S*.38,S*.26,S*.10,S*.08);g.fillEllipse(S*.62,S*.26,S*.10,S*.08);
      g.fillStyle(0xff8800,0.7);g.fillEllipse(S*.38,S*.26,S*.06,S*.05);g.fillEllipse(S*.62,S*.26,S*.06,S*.05);
      // 黒目(縦長の瞳孔)
      g.fillStyle(0x000000,1);g.fillRect(S*.375,S*.235,S*.012,S*.05);g.fillRect(S*.613,S*.235,S*.012,S*.05);
      // 目のハイライト
      g.fillStyle(0xffffff,0.9);g.fillCircle(S*.37,S*.24,S*.018);g.fillCircle(S*.61,S*.24,S*.018);

      // ── 王冠(金) ──
      // 王冠の輪
      g.fillStyle(0xffcc00,1);g.fillRect(S*.30,S*.06,S*.40,S*.07);
      g.fillStyle(0xffe888,1);g.fillRect(S*.30,S*.06,S*.40,S*.02);
      g.fillStyle(0xcc9900,1);g.fillRect(S*.30,S*.115,S*.40,S*.015);
      // 王冠の尖り(中央・両側)
      g.fillStyle(0xffcc00,1);
      g.fillTriangle(S*.50,S*.06,S*.45,S*.0,S*.55,S*.0);  // 中央
      g.fillTriangle(S*.35,S*.06,S*.31,S*.01,S*.39,S*.01);
      g.fillTriangle(S*.65,S*.06,S*.61,S*.01,S*.69,S*.01);
      // 宝石(赤・青)
      g.fillStyle(0xff2200,1);g.fillCircle(S*.5,S*.04,S*.025);
      g.fillStyle(0xffaa88,0.8);g.fillCircle(S*.5,S*.035,S*.012);
      g.fillStyle(0x0088ff,1);g.fillCircle(S*.40,S*.09,S*.02);g.fillCircle(S*.60,S*.09,S*.02);
      g.fillStyle(0x88ccff,0.8);g.fillCircle(S*.40,S*.085,S*.01);g.fillCircle(S*.60,S*.085,S*.01);
    });

    // ボス3（サハギン・魚人・三叉槍持ち・緑青の鱗・海の戦士）
    mk('enemy_boss3',148,(g,S)=>{
      // 影
      g.fillStyle(0x000000,0.40);g.fillEllipse(S*.5,S*.96,S*.78,S*.12);
      // 水のオーラ
      g.fillStyle(0x0088cc,0.08);g.fillCircle(S*.5,S*.55,S*.54);
      g.fillStyle(0x00aaff,0.05);g.fillCircle(S*.5,S*.55,S*.44);
      // 水しぶき粒
      g.fillStyle(0x66ddff,0.6);
      [[.18,.30],[.85,.35],[.12,.55],[.92,.6],[.20,.78],[.84,.78]].forEach(([x,y])=>{g.fillCircle(S*x,S*y,S*.018);});

      // ── 三叉槍(トライデント) 右手で構える ──
      // 柄(後ろから前へ斜めに)
      g.fillStyle(0x664422,1);g.fillRect(S*.78,S*.18,S*.04,S*.65);
      g.fillStyle(0x886633,1);g.fillRect(S*.78,S*.18,S*.018,S*.65);
      // 巻きヒモ
      g.fillStyle(0x331100,1);g.fillRect(S*.77,S*.42,S*.06,S*.025);g.fillRect(S*.77,S*.5,S*.06,S*.025);
      // 三叉槍の刃(銀)
      g.fillStyle(0xccddee,1);
      // 中央の刃(長い)
      g.fillTriangle(S*.80,S*.18,S*.78,S*.04,S*.82,S*.04);
      g.fillRect(S*.795,S*.04,S*.01,S*.14);
      // 左の刃
      g.fillTriangle(S*.72,S*.18,S*.70,S*.07,S*.74,S*.10);
      // 右の刃
      g.fillTriangle(S*.88,S*.18,S*.86,S*.10,S*.90,S*.07);
      // 刃の連結部(基部)
      g.fillStyle(0xaabbcc,1);g.fillRect(S*.70,S*.18,S*.20,S*.025);
      g.fillStyle(0xffffff,0.6);g.fillRect(S*.70,S*.18,S*.20,S*.008);
      // 刃のハイライト
      g.fillStyle(0xffffff,0.8);g.fillRect(S*.798,S*.06,S*.004,S*.10);

      // ── 足ヒレ(下層) ──
      g.fillStyle(0x004466,1);g.fillTriangle(S*.30,S*.85,S*.20,S*.98,S*.40,S*.98);
      g.fillTriangle(S*.60,S*.85,S*.50,S*.98,S*.70,S*.98);
      // ヒレの筋
      g.lineStyle(2,0x00aaff,0.7);
      g.lineBetween(S*.30,S*.85,S*.22,S*.97);g.lineBetween(S*.30,S*.85,S*.30,S*.98);g.lineBetween(S*.30,S*.85,S*.38,S*.97);
      g.lineBetween(S*.60,S*.85,S*.52,S*.97);g.lineBetween(S*.60,S*.85,S*.60,S*.98);g.lineBetween(S*.60,S*.85,S*.68,S*.97);

      // ── 脚(緑鱗) ──
      g.fillStyle(0x2a6644,1);g.fillEllipse(S*.36,S*.78,S*.13,S*.20);g.fillEllipse(S*.60,S*.78,S*.13,S*.20);
      g.fillStyle(0x44aa66,1);g.fillEllipse(S*.36,S*.72,S*.11,S*.12);g.fillEllipse(S*.60,S*.72,S*.11,S*.12);
      // 脚の鱗模様
      g.fillStyle(0x88ddaa,0.4);
      for(let i=0;i<3;i++){g.fillCircle(S*(.33+i*.03),S*(.75+i*.04),S*.012);g.fillCircle(S*(.57+i*.03),S*(.75+i*.04),S*.012);}

      // ── 胴体(緑〜青のグラデ・鱗付き) ──
      g.fillStyle(0x2a5566,1);g.fillEllipse(S*.5,S*.58,S*.46,S*.34);
      g.fillStyle(0x336677,1);g.fillEllipse(S*.5,S*.56,S*.40,S*.28);
      // 腹(明るい黄緑)
      g.fillStyle(0xaaccaa,1);g.fillEllipse(S*.5,S*.62,S*.26,S*.22);
      g.fillStyle(0xccddbb,0.7);g.fillEllipse(S*.5,S*.62,S*.18,S*.16);
      // 鱗模様(胴体)
      g.fillStyle(0x55aa88,0.5);
      for(let r=0;r<4;r++)for(let c=0;c<5;c++){
        const xx=.34+c*.075+(r%2)*.03, yy=.48+r*.06;
        g.fillEllipse(S*xx,S*yy,S*.025,S*.018);
      }

      // ── 背びれ(背中から伸びる) ──
      g.fillStyle(0x00667a,1);g.fillTriangle(S*.30,S*.50,S*.18,S*.42,S*.32,S*.62);
      g.fillTriangle(S*.70,S*.50,S*.82,S*.42,S*.68,S*.62);
      // 背びれの筋
      g.lineStyle(1.5,0x00ccff,0.7);
      g.lineBetween(S*.20,S*.45,S*.30,S*.55);g.lineBetween(S*.24,S*.42,S*.30,S*.58);
      g.lineBetween(S*.80,S*.45,S*.70,S*.55);g.lineBetween(S*.76,S*.42,S*.70,S*.58);

      // ── 左腕(前面・閉じてる) ──
      g.fillStyle(0x2a6644,1);g.fillEllipse(S*.28,S*.60,S*.10,S*.24);
      g.fillStyle(0x44aa66,1);g.fillEllipse(S*.27,S*.74,S*.08,S*.10);
      // 手(指3本・水かき)
      g.fillStyle(0x44aa66,1);g.fillEllipse(S*.26,S*.80,S*.07,S*.06);
      g.fillStyle(0x004466,1);
      g.fillTriangle(S*.22,S*.78,S*.18,S*.86,S*.24,S*.84);
      g.fillTriangle(S*.27,S*.79,S*.27,S*.88,S*.30,S*.86);
      // 爪
      g.fillStyle(0x222222,1);
      g.fillTriangle(S*.19,S*.86,S*.18,S*.92,S*.21,S*.88);
      g.fillTriangle(S*.27,S*.88,S*.27,S*.93,S*.30,S*.90);

      // ── 右腕(三叉槍を握っている) ──
      g.fillStyle(0x2a6644,1);g.fillEllipse(S*.72,S*.55,S*.10,S*.20);
      g.fillStyle(0x44aa66,1);g.fillEllipse(S*.76,S*.50,S*.08,S*.12);
      // 手(握っている部分)
      g.fillStyle(0x44aa66,1);g.fillEllipse(S*.78,S*.44,S*.07,S*.07);

      // ── 首 ──
      g.fillStyle(0x336677,1);g.fillEllipse(S*.5,S*.38,S*.24,S*.10);

      // ── 頭(魚人らしく・前後に長い) ──
      g.fillStyle(0x2a5566,1);g.fillEllipse(S*.5,S*.28,S*.42,S*.32);
      g.fillStyle(0x336677,1);g.fillEllipse(S*.5,S*.27,S*.36,S*.26);
      // 頭の鱗
      g.fillStyle(0x55aa88,0.4);
      for(let c=0;c<4;c++){g.fillEllipse(S*(.38+c*.08),S*.20,S*.028,S*.02);}

      // ── 頭のヒレ(両耳位置に大きい) ──
      g.fillStyle(0x00667a,1);
      g.fillTriangle(S*.25,S*.26,S*.05,S*.16,S*.10,S*.36);
      g.fillTriangle(S*.75,S*.26,S*.95,S*.16,S*.90,S*.36);
      // 頭ヒレの筋
      g.lineStyle(1.5,0x00ccff,0.7);
      g.lineBetween(S*.08,S*.18,S*.25,S*.26);g.lineBetween(S*.10,S*.32,S*.25,S*.26);
      g.lineBetween(S*.92,S*.18,S*.75,S*.26);g.lineBetween(S*.90,S*.32,S*.75,S*.26);

      // ── 頭頂部の冠ヒレ(中央) ──
      g.fillStyle(0x004466,1);g.fillTriangle(S*.5,S*.04,S*.40,S*.18,S*.60,S*.18);
      g.fillStyle(0x0088aa,0.7);g.fillTriangle(S*.5,S*.08,S*.43,S*.18,S*.57,S*.18);
      g.lineStyle(1.5,0x00ccff,0.7);
      g.lineBetween(S*.5,S*.05,S*.5,S*.20);g.lineBetween(S*.45,S*.10,S*.46,S*.18);g.lineBetween(S*.55,S*.10,S*.54,S*.18);

      // ── 目(大きく黄色・爬虫類風) ──
      g.fillStyle(0xffee00,1);g.fillEllipse(S*.40,S*.27,S*.10,S*.10);g.fillEllipse(S*.60,S*.27,S*.10,S*.10);
      g.fillStyle(0xffaa00,0.7);g.fillEllipse(S*.40,S*.27,S*.07,S*.07);g.fillEllipse(S*.60,S*.27,S*.07,S*.07);
      // 縦の瞳孔
      g.fillStyle(0x000000,1);g.fillRect(S*.394,S*.24,S*.012,S*.06);g.fillRect(S*.594,S*.24,S*.012,S*.06);
      // ハイライト
      g.fillStyle(0xffffff,0.9);g.fillCircle(S*.39,S*.25,S*.018);g.fillCircle(S*.59,S*.25,S*.018);
      // 目の上の隆起(獰猛さ)
      g.fillStyle(0x224455,1);g.fillEllipse(S*.40,S*.20,S*.12,S*.04);g.fillEllipse(S*.60,S*.20,S*.12,S*.04);

      // ── 口(横長・牙が並ぶ) ──
      g.fillStyle(0x110011,1);g.fillEllipse(S*.5,S*.38,S*.22,S*.07);
      g.fillStyle(0x440022,0.7);g.fillEllipse(S*.5,S*.39,S*.15,S*.035);
      // 牙(上下にギザギザ)
      g.fillStyle(0xffffff,1);
      for(let i=0;i<6;i++){
        g.fillTriangle(S*(.40+i*.04),S*.35,S*(.39+i*.04),S*.40,S*(.42+i*.04),S*.35);
        g.fillTriangle(S*(.41+i*.04),S*.42,S*(.40+i*.04),S*.36,S*(.43+i*.04),S*.36);
      }

      // ── エラ(首の両側) ──
      g.fillStyle(0xff4466,0.8);
      g.fillEllipse(S*.36,S*.36,S*.03,S*.06);g.fillEllipse(S*.32,S*.36,S*.03,S*.06);
      g.fillEllipse(S*.64,S*.36,S*.03,S*.06);g.fillEllipse(S*.68,S*.36,S*.03,S*.06);
    });

    // ── ゴブリンアーチャー(細身・茶のローブ・弓持ち) ──
    mk('enemy_goblin_archer',88,(g,S)=>{
      g.fillStyle(0x000000,0.25);g.fillEllipse(S*.5,S*.93,S*.55,S*.08);
      // 茶色のローブ(細身)
      g.fillStyle(0x6b4220,1);g.fillEllipse(S*.5,S*.65,S*.36,S*.46);
      // 緑の肌(細い)
      g.fillStyle(0x3a7a22,1);g.fillEllipse(S*.5,S*.30,S*.32,S*.30);
      // 耳(尖)
      g.fillStyle(0x2d6618,1);g.fillTriangle(S*.20,S*.22,S*.10,S*.10,S*.28,S*.30);g.fillTriangle(S*.80,S*.22,S*.72,S*.30,S*.90,S*.10);
      // 目(集中・狙う)
      g.fillStyle(0x111111,1);g.fillRect(S*.34,S*.28,S*.10,S*.03);g.fillRect(S*.56,S*.28,S*.10,S*.03);
      g.fillStyle(0xffaa44,1);g.fillEllipse(S*.39,S*.31,S*.08,S*.05);g.fillEllipse(S*.61,S*.31,S*.08,S*.05);
      g.fillStyle(0x000000,1);g.fillCircle(S*.39,S*.31,S*.025);g.fillCircle(S*.61,S*.31,S*.025);
      // 弓(右手・横向き)
      g.fillStyle(0x553311,1);
      g.fillRect(S*.78,S*.40,S*.04,S*.40);
      g.fillStyle(0xddccaa,0.9);
      g.fillRect(S*.80,S*.42,S*.01,S*.36); // 弦
      // 矢(つがえてる)
      g.fillStyle(0x886633,1);g.fillRect(S*.62,S*.58,S*.18,S*.02);
      g.fillStyle(0x999999,1);g.fillTriangle(S*.62,S*.59,S*.58,S*.59,S*.62,S*.55);
      // 矢羽
      g.fillStyle(0xddaa44,1);g.fillTriangle(S*.78,S*.56,S*.82,S*.58,S*.78,S*.62);
      // 腰の矢筒
      g.fillStyle(0x442211,1);g.fillRect(S*.16,S*.58,S*.10,S*.18);
      g.fillStyle(0x886633,1);[.18,.21,.24].forEach(x=>g.fillRect(S*x,S*.55,S*.012,S*.06));
      // フード(襟)
      g.fillStyle(0x4a2a10,1);g.fillEllipse(S*.5,S*.46,S*.30,S*.10);
    });

    // ── アックスゴブリン(太り・斧持ち・赤鉢巻) ──
    mk('enemy_goblin_axe',96,(g,S)=>{
      g.fillStyle(0x000000,0.3);g.fillEllipse(S*.5,S*.94,S*.7,S*.10);
      // 黒い革鎧
      g.fillStyle(0x222222,1);g.fillEllipse(S*.5,S*.65,S*.50,S*.50);
      // 鎧の鋲
      g.fillStyle(0x888888,1);[.32,.5,.68].forEach(x=>g.fillCircle(S*x,S*.62,S*.025));
      // 緑の太い腕
      g.fillStyle(0x3a7a22,1);g.fillEllipse(S*.18,S*.58,S*.20,S*.36);g.fillEllipse(S*.82,S*.58,S*.20,S*.36);
      // 緑の太い顔
      g.fillStyle(0x3a7a22,1);g.fillEllipse(S*.5,S*.27,S*.46,S*.40);
      // 耳(尖)
      g.fillStyle(0x2d6618,1);g.fillTriangle(S*.18,S*.22,S*.04,S*.10,S*.26,S*.32);g.fillTriangle(S*.82,S*.22,S*.74,S*.32,S*.96,S*.10);
      // 赤い鉢巻
      g.fillStyle(0xcc2211,1);g.fillRect(S*.22,S*.16,S*.56,S*.06);
      g.fillStyle(0x881100,1);g.fillTriangle(S*.78,S*.18,S*.92,S*.12,S*.84,S*.30);
      // 目(怒)
      g.fillStyle(0x000000,1);g.fillRect(S*.30,S*.26,S*.16,S*.04);g.fillRect(S*.54,S*.26,S*.16,S*.04);
      g.fillStyle(0xff2200,1);g.fillEllipse(S*.38,S*.30,S*.10,S*.06);g.fillEllipse(S*.62,S*.30,S*.10,S*.06);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.30,S*.03);g.fillCircle(S*.62,S*.30,S*.03);
      // 牙
      g.fillStyle(0xeeeecc,1);g.fillTriangle(S*.42,S*.40,S*.40,S*.46,S*.46,S*.40);g.fillTriangle(S*.58,S*.40,S*.54,S*.40,S*.60,S*.46);
      // 巨大な斧(右肩から)
      g.fillStyle(0x5c3a14,1);g.fillRect(S*.78,S*.30,S*.04,S*.50); // 柄
      g.fillStyle(0x888888,1);g.fillTriangle(S*.74,S*.30,S*.96,S*.40,S*.78,S*.45); // 刃
      g.fillStyle(0xcccccc,1);g.fillTriangle(S*.76,S*.32,S*.94,S*.40,S*.78,S*.42); // 刃の光沢
    });

    // ── ゴブリンリーダー(王冠・赤マント・大きい・玉座感) ──
    mk('enemy_goblin_leader',128,(g,S)=>{
      g.fillStyle(0x000000,0.4);g.fillEllipse(S*.5,S*.95,S*.85,S*.13);
      // 赤いマント(背中・大きく広がる)
      g.fillStyle(0x8b1a1a,1);
      g.fillTriangle(S*.5,S*.40,S*.10,S*.85,S*.90,S*.85);
      // マントの裏地(金)
      g.fillStyle(0xddaa00,0.6);
      g.fillTriangle(S*.5,S*.50,S*.20,S*.80,S*.80,S*.80);
      // 黒い鎧(豪華)
      g.fillStyle(0x1a1a1a,1);g.fillEllipse(S*.5,S*.65,S*.54,S*.50);
      // 鎧の金縁
      g.fillStyle(0xddaa00,1);g.fillRect(S*.24,S*.48,S*.52,S*.04);g.fillRect(S*.24,S*.78,S*.52,S*.04);
      // 鎧中央の宝石(赤)
      g.fillStyle(0xcc1111,1);g.fillEllipse(S*.5,S*.62,S*.10,S*.14);
      g.fillStyle(0xff4444,1);g.fillEllipse(S*.5,S*.59,S*.05,S*.07);
      // 緑の腕(太い)
      g.fillStyle(0x4a8a32,1);g.fillEllipse(S*.18,S*.60,S*.18,S*.34);g.fillEllipse(S*.82,S*.60,S*.18,S*.34);
      // 緑の顔(濃い色・他のゴブリンと差別化)
      g.fillStyle(0x4a8a32,1);g.fillEllipse(S*.5,S*.28,S*.40,S*.36);
      // 顔の入れ墨(部族長の証)
      g.fillStyle(0xffaa00,0.6);g.fillRect(S*.32,S*.34,S*.08,S*.02);g.fillRect(S*.60,S*.34,S*.08,S*.02);
      // 耳(尖って大きい)
      g.fillStyle(0x3a7a22,1);g.fillTriangle(S*.20,S*.20,S*.04,S*.05,S*.28,S*.30);g.fillTriangle(S*.80,S*.20,S*.72,S*.30,S*.96,S*.05);
      // 王冠(金色の角付き)
      g.fillStyle(0xddaa00,1);g.fillRect(S*.30,S*.10,S*.40,S*.06);
      g.fillStyle(0xffd700,1);
      g.fillTriangle(S*.34,S*.10,S*.30,S*.0,S*.38,S*.10); // 左
      g.fillTriangle(S*.50,S*.10,S*.46,S*-.04,S*.54,S*.10); // 中央(高い)
      g.fillTriangle(S*.66,S*.10,S*.62,S*.0,S*.70,S*.10); // 右
      // 王冠の宝石
      g.fillStyle(0xff2244,1);g.fillCircle(S*.5,S*.04,S*.04);
      g.fillStyle(0x44aaff,1);g.fillCircle(S*.36,S*.06,S*.025);g.fillCircle(S*.64,S*.06,S*.025);
      // 目(鋭く・赤)
      g.fillStyle(0x000000,1);g.fillRect(S*.32,S*.24,S*.12,S*.03);g.fillRect(S*.56,S*.24,S*.12,S*.03);
      g.fillStyle(0xff0000,1);g.fillEllipse(S*.38,S*.27,S*.09,S*.05);g.fillEllipse(S*.62,S*.27,S*.09,S*.05);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.27,S*.025);g.fillCircle(S*.62,S*.27,S*.025);
      g.fillStyle(0xffffff,0.8);g.fillCircle(S*.36,S*.25,S*.015);g.fillCircle(S*.60,S*.25,S*.015);
      // 大きな牙
      g.fillStyle(0xeeeecc,1);g.fillTriangle(S*.42,S*.36,S*.39,S*.46,S*.46,S*.36);g.fillTriangle(S*.58,S*.36,S*.54,S*.36,S*.61,S*.46);
      // 王笏(金の杖・右手)
      g.fillStyle(0xddaa00,1);g.fillRect(S*.86,S*.36,S*.03,S*.40);
      g.fillStyle(0xffd700,1);g.fillCircle(S*.875,S*.36,S*.06);
      g.fillStyle(0xff2244,1);g.fillCircle(S*.875,S*.36,S*.03);
    });

    // ── ボーンウォーカー(歩く骸骨・装甲・体力多い)──
    mk('enemy_bone_walker',96,(g,S)=>{
      g.fillStyle(0x000000,0.4);g.fillEllipse(S*.5,S*.95,S*.7,S*.10);
      // 古びた鎧(暗灰色)
      g.fillStyle(0x4a4a4a,1);g.fillEllipse(S*.5,S*.65,S*.50,S*.46);
      // 鎧の縁(銹)
      g.fillStyle(0x8b6e3c,0.7);g.fillRect(S*.24,S*.50,S*.52,S*.04);
      g.fillStyle(0x6b5a2c,1);g.fillRect(S*.24,S*.78,S*.52,S*.04);
      // 鎧の鋲
      g.fillStyle(0x222222,1);[.32,.5,.68].forEach(x=>g.fillCircle(S*x,S*.62,S*.025));
      // 骨の腕(白)
      g.fillStyle(0xddccaa,1);g.fillEllipse(S*.16,S*.58,S*.16,S*.30);g.fillEllipse(S*.84,S*.58,S*.16,S*.30);
      // 骨の指
      g.fillStyle(0xeeddbb,1);
      [.10,.14,.18].forEach(x=>g.fillRect(S*x,S*.74,S*.02,S*.06));
      [.82,.86,.90].forEach(x=>g.fillRect(S*x,S*.74,S*.02,S*.06));
      // 武器(錆びた剣・右手)
      g.fillStyle(0x6b5a3a,1);g.fillRect(S*.84,S*.30,S*.04,S*.45); // 柄
      g.fillStyle(0xaaaaaa,1);g.fillTriangle(S*.84,S*.30,S*.86,S*.05,S*.88,S*.30); // 刃
      g.fillStyle(0x8a8a8a,1);g.fillRect(S*.83,S*.30,S*.06,S*.04); // ガード
      // 頭蓋骨(白)
      g.fillStyle(0xeeddbb,1);g.fillEllipse(S*.5,S*.27,S*.36,S*.34);
      // 兜(暗灰色・額)
      g.fillStyle(0x444444,1);g.fillRect(S*.30,S*.10,S*.40,S*.12);
      g.fillStyle(0x666666,1);g.fillRect(S*.32,S*.13,S*.36,S*.02);
      // 兜の角(2本・控えめ)
      g.fillStyle(0x222222,1);
      g.fillTriangle(S*.30,S*.10,S*.24,S*.0,S*.34,S*.10);
      g.fillTriangle(S*.70,S*.10,S*.66,S*.10,S*.76,S*.0);
      // 目の穴(青く光る)
      g.fillStyle(0x000000,1);g.fillRect(S*.32,S*.24,S*.12,S*.06);g.fillRect(S*.56,S*.24,S*.12,S*.06);
      g.fillStyle(0x44aaff,1);g.fillEllipse(S*.38,S*.27,S*.08,S*.04);g.fillEllipse(S*.62,S*.27,S*.08,S*.04);
      // 鼻の穴
      g.fillStyle(0x000000,1);g.fillTriangle(S*.48,S*.34,S*.46,S*.40,S*.50,S*.40);g.fillTriangle(S*.52,S*.34,S*.50,S*.40,S*.54,S*.40);
      // 顎の歯
      g.fillStyle(0xeeddbb,1);
      [.40,.45,.50,.55,.60].forEach(x=>g.fillRect(S*x,S*.42,S*.02,S*.04));
      // 顎下の影
      g.fillStyle(0x000000,0.4);g.fillEllipse(S*.5,S*.48,S*.20,S*.04);
    });

    // ── トレジャーハント(宝箱モンスター・牙の生えた木箱)──
    mk('enemy_treasure_hunt',88,(g,S)=>{
      g.fillStyle(0x000000,0.3);g.fillEllipse(S*.5,S*.94,S*.65,S*.08);
      // 宝箱の本体(茶色の木)
      g.fillStyle(0x6b3d11,1);g.fillRect(S*.20,S*.40,S*.60,S*.45);
      // 宝箱の縁・装飾(金の縁)
      g.fillStyle(0xffaa00,1);
      g.fillRect(S*.20,S*.40,S*.60,S*.04); // 上縁
      g.fillRect(S*.20,S*.81,S*.60,S*.04); // 下縁
      g.fillRect(S*.20,S*.40,S*.04,S*.45); // 左縁
      g.fillRect(S*.76,S*.40,S*.04,S*.45); // 右縁
      // 板の継ぎ目
      g.fillStyle(0x4a2810,1);
      g.fillRect(S*.40,S*.44,S*.02,S*.37);
      g.fillRect(S*.58,S*.44,S*.02,S*.37);
      // 鍵穴(金)
      g.fillStyle(0xffd700,1);g.fillCircle(S*.5,S*.65,S*.06);
      g.fillStyle(0x000000,1);g.fillRect(S*.49,S*.65,S*.02,S*.04);
      // 開いた口(蓋が開いてる・牙)
      g.fillStyle(0x4a2810,1);g.fillRect(S*.20,S*.20,S*.60,S*.20); // 蓋
      g.fillStyle(0x6b3d11,1);g.fillRect(S*.22,S*.20,S*.56,S*.16); // 蓋の表面
      // 蓋の縁(金)
      g.fillStyle(0xffaa00,1);g.fillRect(S*.20,S*.20,S*.60,S*.04);
      // 口の中(暗い)
      g.fillStyle(0x000000,1);g.fillRect(S*.24,S*.36,S*.52,S*.06);
      // 牙(下の蓋から上向き)
      g.fillStyle(0xeeeecc,1);
      [.28,.36,.44,.52,.60,.68].forEach(x=>g.fillTriangle(S*x,S*.42,S*(x-.02),S*.36,S*(x+.02),S*.36));
      // 上の牙(蓋から下向き)
      [.28,.36,.44,.52,.60,.68].forEach(x=>g.fillTriangle(S*x,S*.36,S*(x-.02),S*.42,S*(x+.02),S*.42));
      // 目(光る赤・口の中)
      g.fillStyle(0xff4422,1);g.fillCircle(S*.36,S*.27,S*.04);g.fillCircle(S*.64,S*.27,S*.04);
      g.fillStyle(0xffff00,1);g.fillCircle(S*.36,S*.27,S*.02);g.fillCircle(S*.64,S*.27,S*.02);
      // 短い足(動く)
      g.fillStyle(0x4a2810,1);g.fillRect(S*.28,S*.85,S*.08,S*.10);g.fillRect(S*.64,S*.85,S*.08,S*.10);
      // 中の宝石・金貨ちらり
      g.fillStyle(0xffd700,0.8);g.fillCircle(S*.44,S*.72,S*.025);g.fillCircle(S*.56,S*.78,S*.025);
    });

    // ── ゴースト(半透明・幽霊・浮遊)──
    mk('enemy_ghost',96,(g,S)=>{
      // 浮遊するため影は薄く小さい
      g.fillStyle(0x000000,0.2);g.fillEllipse(S*.5,S*.92,S*.4,S*.06);
      // 幽霊の本体(白〜青の半透明)
      // 体の下部(裾がうねうね)
      g.fillStyle(0xaaccee,0.7);
      g.fillTriangle(S*.20,S*.85,S*.30,S*.90,S*.30,S*.70);
      g.fillTriangle(S*.30,S*.90,S*.40,S*.85,S*.40,S*.70);
      g.fillTriangle(S*.40,S*.85,S*.50,S*.90,S*.50,S*.70);
      g.fillTriangle(S*.50,S*.90,S*.60,S*.85,S*.60,S*.70);
      g.fillTriangle(S*.60,S*.85,S*.70,S*.90,S*.70,S*.70);
      g.fillTriangle(S*.70,S*.90,S*.80,S*.85,S*.80,S*.70);
      // 体の中部
      g.fillStyle(0xccddff,0.85);
      g.fillEllipse(S*.5,S*.55,S*.50,S*.40);
      // 体のオーラ(緑がかった毒の気配)
      g.fillStyle(0x88dd88,0.25);
      g.fillEllipse(S*.5,S*.55,S*.55,S*.45);
      // 顔(青白い)
      g.fillStyle(0xeeeeff,0.95);g.fillEllipse(S*.5,S*.40,S*.36,S*.34);
      // 不気味な目の穴(黒・縦長)
      g.fillStyle(0x000000,0.85);
      g.fillEllipse(S*.38,S*.38,S*.10,S*.16);g.fillEllipse(S*.62,S*.38,S*.10,S*.16);
      // 目の中の光(緑の毒の光)
      g.fillStyle(0x44ff88,0.9);
      g.fillEllipse(S*.38,S*.38,S*.04,S*.06);g.fillEllipse(S*.62,S*.38,S*.04,S*.06);
      // 開いた口(縦に大きく)
      g.fillStyle(0x000000,0.85);g.fillEllipse(S*.5,S*.50,S*.10,S*.10);
      // 毒の煙(口から)
      g.fillStyle(0x88dd88,0.4);
      g.fillCircle(S*.46,S*.58,S*.04);g.fillCircle(S*.54,S*.62,S*.03);g.fillCircle(S*.50,S*.66,S*.025);
      // 浮遊する魂のかけら(周囲に小さな点・緑がかった白)
      g.fillStyle(0xccffcc,0.6);
      g.fillCircle(S*.18,S*.30,S*.02);g.fillCircle(S*.85,S*.45,S*.025);g.fillCircle(S*.82,S*.20,S*.018);
    });
  }
}


// ============================================================
//  装備品定義
// ============================================================
const EQUIP_SLOTS=[
  {id:'weapon_main',label:'右手',     icon:'⚔'},
  {id:'weapon_off', label:'左手',     icon:'🛡'},
  {id:'head',       label:'頭',       icon:'🪖'},
  {id:'face',       label:'顔',       icon:'😷'},
  {id:'shoulder',   label:'肩',       icon:'🔰'},
  {id:'body',       label:'体',       icon:'🥋'},
  {id:'feet',       label:'足',       icon:'👢'},
  {id:'accessory',  label:'アクセサリー',icon:'💍'},
];

const EQUIP_DEFS={
  // ══════════════════════════════════════
  //  右手(主武器) - weapon_main
  // ══════════════════════════════════════
  // ── 剣士向け ──
  iron_sword:    {name:'鉄の剣',    slot:'weapon_main',icon:'⚔',  desc:'標準的な片手剣',           stats:{atk:8},                price:80,  col:0xaaaaaa, classOnly:'warrior'},
  steel_sword:   {name:'鋼の剣',    slot:'weapon_main',icon:'🗡', desc:'切れ味のいい鋼の剣',       stats:{atk:14,hit:5},          price:200, col:0xccccdd, classOnly:'warrior'},
  great_sword:   {name:'両手剣',    slot:'weapon_main',icon:'⚔',  desc:'両手で持つ強力な大剣',     stats:{atk:24,hit:-5},         price:350, col:0xddddff, classOnly:'warrior', twoHand:true},
  // ── 妖刀村雨(剣士専用・覚醒「侍」を発動可能にする呪われた刀) ──
  muramasa:      {name:'妖刀 村雨',  slot:'weapon_main',icon:'🗡', desc:'呪われた妖刀。装備すると侍化が可能になる',stats:{atk:18,agi:5},     price:0,   col:0xff2244, classOnly:'warrior', awakening:'samurai'},
  // ── ヘヴィカスタマイズ(ボマー専用・覚醒「重装兵器」を発動可能) ──
  heavy_customize:{name:'ヘヴィカスタマイズ',slot:'weapon_main',icon:'🦾', desc:'重武装の改造装備。装備すると換装が可能になる',stats:{atk:22,def:5},price:0,col:0x4488cc, classOnly:'bomber', awakening:'heavy', twoHand:true},
  // ── バスターライフル(ボマー専用・覚醒「バスターズ換装」)──
  buster_rifle:{name:'バスターライフル',slot:'weapon_main',icon:'🔫', desc:'対獣用大火力ライフル。装備するとバスターズへの換装が可能',stats:{atk:24,hit:3},price:0,col:0xff5522, classOnly:'bomber', awakening:'busters', twoHand:true},
  // ── 精霊の弓(アーチャー専用・覚醒「転生」を発動可能) ──
  spirit_bow:    {name:'精霊の弓',  slot:'weapon_main',icon:'🏹', desc:'精霊が宿る神秘の弓。装備するとエルフ化が可能になる',stats:{atk:20,hit:5},price:0,col:0x88ee88, classOnly:'archer', awakening:'spirit'},
  // ── ダークイリュージョンの杖(マジシャン専用・覚醒「妖魔化」を発動可能) ──
  dark_illusion_staff:{name:'ダークイリュージョンの杖',slot:'weapon_main',icon:'🔮', desc:'闇の力を宿した禁忌の杖。装備すると妖魔化が可能になる',stats:{atk:8,mag:24},price:0,col:0x6622aa, classOnly:'mage', awakening:'youma'},
  // ── リヴァイアリーの杖(マジシャン専用・覚醒「アビスウォーロック」)──
  riviary_staff:{name:'リヴァイアリーの杖',slot:'weapon_main',icon:'🌊', desc:'深海の魔力を宿した杖。装備するとアビスウォーロックに変身可能',stats:{mag:26,msp:30},price:0,col:0x1144ff, classOnly:'mage', awakening:'abyss', twoHand:true},
  // ── アーチャー向け ──
  wooden_bow:    {name:'木の弓',    slot:'weapon_main',icon:'🏹', desc:'シンプルな木の弓・片手で持つ',         stats:{atk:7,hit:5},           price:80,  col:0x886633, classOnly:'archer'},
  composite_bow: {name:'合成弓',    slot:'weapon_main',icon:'🏹', desc:'複数素材を組み合わせた強弓・片手で持つ',stats:{atk:14,hit:8},          price:200, col:0xaa6633, classOnly:'archer'},
  longbow:       {name:'ロングボウ',slot:'weapon_main',icon:'🏹', desc:'射程と威力に優れた長弓・片手で持つ',   stats:{atk:22,hit:10,luk:3},   price:380, col:0xcc8855, classOnly:'archer'},
  // ── メイジ向け ──
  wooden_staff:  {name:'木の杖',    slot:'weapon_main',icon:'🪄', desc:'魔力を高める木製の杖',     stats:{mag:6,msp:10},          price:80,  col:0x886633, classOnly:'mage'},
  crystal_staff: {name:'水晶の杖',  slot:'weapon_main',icon:'🪄', desc:'水晶が魔力を増幅する',     stats:{mag:12,msp:20},         price:220, col:0x88ddff, classOnly:'mage'},
  archmage_staff:{name:'大魔導の杖',slot:'weapon_main',icon:'🪄', desc:'両手で扱う極大の魔法杖',   stats:{mag:22,msp:35},         price:400, col:0xaa66ff, classOnly:'mage', twoHand:true},
  // ── ボマー向け ──
  bomb_pouch:    {name:'爆弾袋',    slot:'weapon_main',icon:'💣', desc:'標準的な爆弾の袋',         stats:{atk:8},                 price:80,  col:0x664422, classOnly:'bomber'},
  iron_bomb_pouch:{name:'鉄製爆弾袋',slot:'weapon_main',icon:'💣',desc:'鉄製で威力の上がった爆弾袋',stats:{atk:15,def:2},          price:200, col:0x886644, classOnly:'bomber'},
  hyper_pouch:   {name:'超爆袋',    slot:'weapon_main',icon:'💣', desc:'両手で抱える特大爆弾',     stats:{atk:25,def:-3},         price:380, col:0xaa4422, classOnly:'bomber', twoHand:true},

  // ══════════════════════════════════════
  //  左手(副武器/盾/矢筒) - weapon_off
  // ══════════════════════════════════════
  // ── 剣士向け 盾 ──
  wooden_shield: {name:'木の盾',    slot:'weapon_off', icon:'🛡', desc:'軽量な木製の盾',           stats:{def:4},                 price:60,  col:0x886633, classOnly:'warrior'},
  iron_shield:   {name:'鉄の盾',    slot:'weapon_off', icon:'🛡', desc:'重厚な鉄製の盾',           stats:{def:9,mhp:15},          price:160, col:0xaaaaaa, classOnly:'warrior'},
  knight_shield: {name:'騎士の盾',  slot:'weapon_off', icon:'🛡', desc:'紋章入りの騎士の盾',       stats:{def:14,mhp:30,hit:3},   price:300, col:0xddddff, classOnly:'warrior'},
  // ── 剣士向け 双剣の副剣 ──
  short_sword:   {name:'小剣',      slot:'weapon_off', icon:'🗡', desc:'左手用の短剣・双剣スタイル',stats:{atk:5,agi:5},           price:120, col:0xaaaaaa, classOnly:'warrior'},
  // ── アーチャー向け 矢筒 ──
  basic_quiver:  {name:'通常の矢筒',slot:'weapon_off', icon:'🎯', desc:'シンプルな矢筒',           stats:{atk:2,hit:3},           price:50,  col:0x886633, classOnly:'archer'},
  // ── メイジ向け 魔導書 ──
  spell_book:    {name:'魔導書',    slot:'weapon_off', icon:'📕', desc:'呪文を記した古い書物',     stats:{mag:5,msp:15},          price:120, col:0x6633aa, classOnly:'mage'},
  arcane_tome:   {name:'秘術の書',  slot:'weapon_off', icon:'📘', desc:'秘伝の魔術が記された書',   stats:{mag:10,msp:25},         price:240, col:0x4488ff, classOnly:'mage'},
  // ── ボマー向け 副爆薬 ──
  spare_bombs:   {name:'予備爆薬',  slot:'weapon_off', icon:'🧨', desc:'追加の小爆弾',             stats:{atk:4},                 price:80,  col:0x884422, classOnly:'bomber'},

  // ══════════════════════════════════════
  //  防具・アクセサリー(既存)
  // ══════════════════════════════════════
  // 頭
  iron_helm:    {name:'鉄の兜',    slot:'head',     icon:'🪖', desc:'頭を守る鉄の兜',         stats:{def:4},               price:60,  col:0xaaaaaa},
  leather_cap:  {name:'革の帽子',  slot:'head',     icon:'🎩', desc:'軽くて動きやすい',         stats:{agi:3},               price:40,  col:0x886633},
  // 顔
  iron_mask:    {name:'鉄仮面',    slot:'face',     icon:'😷', desc:'顔面を守る鉄のマスク',      stats:{def:3,hit:5},         price:70,  col:0xaaaaaa},
  eagle_visor:  {name:'イーグルバイザー',slot:'face',icon:'🦅', desc:'視野が広がる特殊バイザー',  stats:{hit:10,luk:3},        price:90,  col:0x4488cc},
  // 肩
  iron_pauldron:{name:'鉄の肩当',  slot:'shoulder', icon:'🔰', desc:'両肩を守る鉄製の防具',      stats:{def:5,atk:2},         price:75,  col:0xaaaaaa},
  mage_mantle:  {name:'魔法のマント',slot:'shoulder',icon:'🧣', desc:'魔力を高める神秘のマント',  stats:{mag:6,msp:10},        price:85,  col:0x9b59b6},
  // 体
  iron_armor:   {name:'鉄の鎧',    slot:'body',     icon:'🛡', desc:'重厚な鉄の鎧',             stats:{def:8,mhp:20},        price:100, col:0xaaaaaa},
  leather_armor:{name:'革の鎧',    slot:'body',     icon:'🥋', desc:'軽量で動きやすい革鎧',      stats:{def:4,agi:4},         price:70,  col:0x886633},
  robe:         {name:'魔法のローブ',slot:'body',   icon:'👘', desc:'魔力を増幅するローブ',       stats:{mag:8,msp:15},        price:90,  col:0x9b59b6},
  // 足
  iron_boots:   {name:'鉄の靴',    slot:'feet',     icon:'👢', desc:'重いが丈夫な鉄の靴',        stats:{def:3,agi:2},         price:50,  col:0xaaaaaa},
  speed_boots:  {name:'疾風の靴',  slot:'feet',     icon:'👟', desc:'素早さが大幅に上がる靴',    stats:{agi:9},               price:65,  col:0x27ae60},
  // アクセサリー
  lucky_ring:   {name:'幸運の指輪',slot:'accessory',icon:'💍', desc:'幸運と命中を高める指輪',    stats:{luk:8,hit:5},         price:100, col:0xffd700},
  power_amulet: {name:'力のお守り',slot:'accessory',icon:'📿', desc:'攻撃力を高めるお守り',       stats:{atk:6},               price:80,  col:0xe74c3c},
  mage_orb:     {name:'魔力の宝珠',slot:'accessory',icon:'🔮', desc:'魔力と精神力を高める',       stats:{mag:6,msp:10},        price:90,  col:0x9b59b6},
};

// 装備のステータスを合計して返す
function calcEquipStats(equip){
  const total={atk:0,def:0,mag:0,mhp:0,msp:0,hit:0,luk:0,agi:0};
  Object.values(equip||{}).forEach(id=>{
    if(!id)return;
    const def=EQUIP_DEFS[id];
    if(!def)return;
    Object.entries(def.stats).forEach(([k,v])=>{total[k]=(total[k]||0)+v;});
  });
  return total;
}

// ============================================================
//  クラフトレシピ定義
// ============================================================
// materials: [{id, count}] 最大3種  fee: 加工費(G)
const CRAFT_RECIPES=[
  // ════════════════════════════════
  //  右手(主武器)
  // ════════════════════════════════
  // 剣士
  {result:'iron_sword',     fee:60,  materials:[{id:'bone',count:3},      {id:'troll_hide',count:1},  {id:'wolf_fang',count:2}  ]},
  {result:'steel_sword',    fee:150, materials:[{id:'bone',count:5},      {id:'wolf_fang',count:3},   {id:'sand_core',count:1}  ]},
  {result:'great_sword',    fee:280, materials:[{id:'bone',count:6},      {id:'dragon_scale',count:2},{id:'boss_gem',count:1}   ]},
  // アーチャー
  {result:'wooden_bow',     fee:50,  materials:[{id:'troll_hide',count:2},{id:'wolf_fang',count:2},   {id:'goblin_ear',count:2} ]},
  {result:'composite_bow',  fee:160, materials:[{id:'wolf_fang',count:4}, {id:'troll_hide',count:3},  {id:'sand_core',count:1}  ]},
  {result:'longbow',        fee:300, materials:[{id:'dragon_scale',count:2},{id:'wolf_fang',count:5}, {id:'boss_gem',count:1}   ]},
  // メイジ
  {result:'wooden_staff',   fee:50,  materials:[{id:'jelly',count:3},     {id:'bat_wing',count:2},    {id:'bone',count:1}       ]},
  {result:'crystal_staff',  fee:170, materials:[{id:'jelly',count:4},     {id:'dragon_scale',count:1},{id:'boss_gem',count:1}   ]},
  {result:'archmage_staff', fee:320, materials:[{id:'jelly',count:5},     {id:'dragon_scale',count:2},{id:'boss_core',count:1}  ]},
  // ボマー
  {result:'bomb_pouch',     fee:55,  materials:[{id:'troll_hide',count:2},{id:'goblin_ear',count:2},  {id:'bone',count:2}       ]},
  {result:'iron_bomb_pouch',fee:160, materials:[{id:'troll_hide',count:3},{id:'sand_core',count:2},   {id:'wolf_fang',count:2}  ]},
  {result:'hyper_pouch',    fee:300, materials:[{id:'sand_core',count:3}, {id:'dragon_scale',count:1},{id:'boss_gem',count:2}   ]},

  // ════════════════════════════════
  //  左手(副武器/盾/矢筒)
  // ════════════════════════════════
  // 剣士の盾&小剣
  {result:'wooden_shield',  fee:40,  materials:[{id:'troll_hide',count:2},{id:'goblin_ear',count:2},  {id:'jelly',count:2}      ]},
  {result:'iron_shield',    fee:120, materials:[{id:'bone',count:4},      {id:'troll_hide',count:3},  {id:'wolf_fang',count:1}  ]},
  {result:'knight_shield',  fee:240, materials:[{id:'bone',count:5},      {id:'dragon_scale',count:1},{id:'boss_gem',count:1}   ]},
  {result:'short_sword',    fee:90,  materials:[{id:'bone',count:2},      {id:'wolf_fang',count:2},   {id:'sand_core',count:1}  ]},
  // アーチャーの矢筒
  {result:'basic_quiver',   fee:35,  materials:[{id:'troll_hide',count:2},{id:'wolf_fang',count:1},   {id:'bat_wing',count:2}   ]},
  // メイジの魔導書
  {result:'spell_book',     fee:90,  materials:[{id:'bat_wing',count:3},  {id:'jelly',count:3},       {id:'bone',count:1}       ]},
  {result:'arcane_tome',    fee:190, materials:[{id:'bat_wing',count:4},  {id:'dragon_scale',count:1},{id:'boss_gem',count:1}   ]},
  // ボマーの予備爆薬
  {result:'spare_bombs',    fee:60,  materials:[{id:'troll_hide',count:1},{id:'sand_core',count:1},   {id:'goblin_ear',count:2} ]},

  // ════════════════════════════════
  //  防具・アクセサリー(既存)
  // ════════════════════════════════
  // 頭
  {result:'iron_helm',    fee:40,  materials:[{id:'bone',count:2},    {id:'troll_hide',count:1},  {id:'goblin_ear',count:2} ]},
  {result:'leather_cap',  fee:25,  materials:[{id:'bat_wing',count:2}, {id:'wolf_fang',count:1},  {id:'jelly',count:3}      ]},
  // 顔
  {result:'iron_mask',    fee:50,  materials:[{id:'bone',count:3},     {id:'wolf_fang',count:2},  {id:'troll_hide',count:1} ]},
  {result:'eagle_visor',  fee:60,  materials:[{id:'bat_wing',count:3}, {id:'dragon_scale',count:1},{id:'wolf_fang',count:2} ]},
  // 肩
  {result:'iron_pauldron',fee:55,  materials:[{id:'troll_hide',count:2},{id:'bone',count:2},       {id:'goblin_ear',count:3} ]},
  {result:'mage_mantle',  fee:60,  materials:[{id:'bat_wing',count:2}, {id:'jelly',count:2},       {id:'dragon_scale',count:1}]},
  // 体
  {result:'iron_armor',   fee:80,  materials:[{id:'troll_hide',count:3},{id:'bone',count:3},       {id:'wolf_fang',count:2}  ]},
  {result:'leather_armor',fee:50,  materials:[{id:'jelly',count:3},    {id:'bat_wing',count:2},    {id:'goblin_ear',count:2} ]},
  {result:'robe',         fee:70,  materials:[{id:'jelly',count:2},    {id:'bat_wing',count:3},    {id:'dragon_scale',count:1}]},
  // 足
  {result:'iron_boots',   fee:35,  materials:[{id:'bone',count:2},     {id:'goblin_ear',count:2},  {id:'jelly',count:2}      ]},
  {result:'speed_boots',  fee:45,  materials:[{id:'wolf_fang',count:3},{id:'scorpion_claw',count:1},{id:'bat_wing',count:2}  ]},
  // アクセサリー
  {result:'lucky_ring',   fee:80,  materials:[{id:'dragon_scale',count:1},{id:'boss_gem',count:1}, {id:'scorpion_claw',count:2}]},
  {result:'power_amulet', fee:60,  materials:[{id:'wolf_fang',count:3},  {id:'troll_hide',count:2},{id:'sand_core',count:1} ]},
  {result:'mage_orb',     fee:70,  materials:[{id:'jelly',count:3},       {id:'dragon_scale',count:1},{id:'boss_gem',count:1}]},
];

// ============================================================
//  アイテム定義
// ============================================================
const ITEM_DEFS={
  // id: {name, desc, col, icon, sell（売価G）, usable（使用可能）}
  // 売価は弱い敵ほど安め・強い敵ほど高め、ただし差は控えめ（5〜50G程度）
  town_scroll:  {name:'帰還の巻物',    desc:'使うと即座に町へ帰還できる。',        col:0xffcc44, icon:'📜', sell:0,  usable:true},
  antidote:     {name:'解毒剤',       desc:'毒状態を治す薬。',                   col:0x88ff88, icon:'🧪', sell:0,  usable:true},
  jelly:        {name:'スライムゼリー',   desc:'スライムの体液。ぷるぷる。',         col:0x33ccaa, icon:'🟢', sell:5 },
  bat_wing:     {name:'コウモリの翼',     desc:'薄くて丈夫な膜。',                  col:0x441166, icon:'🦇', sell:7 },
  goblin_ear:   {name:'ゴブリンの耳',    desc:'とがった耳。コレクター向け。',        col:0x447733, icon:'👂', sell:8 },
  troll_hide:   {name:'トロルの皮',      desc:'分厚い緑の皮。硬い。',               col:0x667755, icon:'🟤', sell:12},
  wolf_fang:    {name:'ウルフの牙',      desc:'鋭利な牙。武器素材になる。',         col:0x778899, icon:'🐺', sell:12},
  bone:         {name:'スケルボーン',    desc:'きれいな骨。魔法の素材。',           col:0xeeeedd, icon:'🦴', sell:10},
  dragon_scale: {name:'ドラゴンの鱗',   desc:'硬く輝く鱗。超レア素材。',           col:0xcc3300, icon:'🐉', sell:30},
  sand_core:    {name:'砂核',           desc:'サンドワームの核。砂漠の結晶。',     col:0xddaa33, icon:'💠', sell:25},
  scorpion_claw:{name:'スコーピオンの爪',desc:'鋭い爪。毒が残っている。',           col:0xaa5511, icon:'🦂', sell:20},
  boss_gem:     {name:'魔晶石',         desc:'強敵から得た輝く宝石。',             col:0xffd700, icon:'💎', sell:50},
  boss_core:    {name:'魔王の核',       desc:'魔王の力が宿る核。',                col:0xcc00ff, icon:'🔮', sell:50},
  chaos_shard:  {name:'混沌の欠片',     desc:'神龍から生まれた欠片。伝説の素材。', col:0xff6600, icon:'✨', sell:50},
};

// モンスターごとのドロップテーブル
// {id, rate(0-1), min, max}
// 一般モンスター：上限0.5。レア素材ほど低確率。
// ボス：演出上の重要素材なので例外として高確率を維持。
const DROP_TABLE={
  slime:    [{id:'jelly',       rate:0.40, min:1, max:2}],
  sakura:   [{id:'jelly',       rate:0.45, min:1, max:2}, {id:'flower_petal', rate:0.20, min:1, max:1}],
  cider:    [{id:'jelly',       rate:0.45, min:1, max:2}, {id:'water_drop', rate:0.20, min:1, max:1}],
  beach_crab:[{id:'wolf_fang',   rate:0.35, min:1, max:1}, {id:'water_drop', rate:0.25, min:1, max:2}],
  wisp:     [{id:'mana_crystal',rate:0.40, min:1, max:1}, {id:'water_drop', rate:0.30, min:1, max:1}],
  gama_ninja:[{id:'wolf_fang', rate:0.40, min:1, max:2}, {id:'mana_crystal',rate:0.20, min:1, max:1}],
  red_oni:  [{id:'wolf_fang', rate:0.55, min:1, max:3}, {id:'mana_crystal',rate:0.30, min:1, max:1}],
  blue_oni: [{id:'wolf_fang', rate:0.55, min:1, max:3}, {id:'water_drop', rate:0.35, min:1, max:2}],
  bat:      [{id:'bat_wing',    rate:0.35, min:1, max:1}],
  goblin:   [{id:'goblin_ear',  rate:0.40, min:1, max:1}],
  troll:    [{id:'troll_hide',  rate:0.30, min:1, max:1}],
  wolf:     [{id:'wolf_fang',   rate:0.30, min:1, max:2}],
  skeleton: [{id:'bone',        rate:0.45, min:1, max:3}],
  dragon:   [{id:'dragon_scale',rate:0.15, min:1, max:1}],
  sandworm: [{id:'sand_core',   rate:0.20, min:1, max:1}],
  scorpion: [{id:'scorpion_claw',rate:0.30,min:1, max:2}],
  boss1:    [{id:'boss_gem',    rate:1.0, min:1, max:2}],
  boss2:    [{id:'boss_gem',    rate:1.0, min:1, max:1},{id:'boss_core',rate:0.8,min:1,max:1}],
  boss3:    [{id:'boss_gem',    rate:1.0, min:2, max:3},{id:'chaos_shard',rate:0.9,min:1,max:1}],
  boss4:    [{id:'boss_gem',    rate:1.0, min:3, max:5},{id:'chaos_shard',rate:1.0,min:2,max:2}],
  bear:         [{id:'troll_hide',  rate:0.35, min:1, max:2}],
  beetle:       [{id:'scorpion_claw',rate:0.40,min:1, max:2}],
  hornet:       [{id:'bat_wing',    rate:0.40, min:1, max:2}],
  scorpion_queen:[{id:'scorpion_claw',rate:0.50,min:2,max:3},{id:'boss_gem',rate:0.15,min:1,max:1}],
  mistress:     [{id:'boss_gem',rate:1.0,min:4,max:6},{id:'chaos_shard',rate:1.0,min:3,max:3}],
  cloud_monkey: [{id:'jelly',rate:0.45,min:1,max:2}],
  treant:       [{id:'troll_hide',rate:0.35,min:1,max:2},{id:'bone',rate:0.30,min:1,max:1}],
  rock_golem:   [{id:'sand_core',rate:0.30,min:1,max:2},{id:'boss_gem',rate:0.10,min:1,max:1}],
  giant:        [{id:'troll_hide',rate:0.40,min:2,max:3},{id:'wolf_fang',rate:0.30,min:1,max:2}],
  thunder_god:  [{id:'boss_gem',rate:1.0,min:5,max:8},{id:'chaos_shard',rate:1.0,min:4,max:4}],
  orc_warrior:  [{id:'goblin_ear',rate:0.45,min:1,max:2},{id:'wolf_fang',rate:0.25,min:1,max:1}],
  orc_high:     [{id:'troll_hide',rate:0.35,min:1,max:2},{id:'boss_gem',rate:0.10,min:1,max:1}],
  orc_lady:     [{id:'jelly',rate:0.45,min:1,max:2},{id:'goblin_ear',rate:0.30,min:1,max:1}],
  orc_archer:   [{id:'bone',rate:0.40,min:1,max:2},{id:'bat_wing',rate:0.30,min:1,max:1}],
  orc_general:  [{id:'boss_gem',rate:1.0,min:4,max:6},{id:'chaos_shard',rate:1.0,min:3,max:3}],
  // ST3 海岸モンスター
  crab:         [{id:'scorpion_claw',rate:0.40,min:1,max:1},{id:'jelly',rate:0.20,min:1,max:1}],
  seal:         [{id:'troll_hide',rate:0.35,min:1,max:1},{id:'bone',rate:0.25,min:1,max:1}],
  // ST5 砂漠
  mummy:        [{id:'bone',rate:0.45,min:1,max:2},{id:'troll_hide',rate:0.20,min:1,max:1}],
  sandman:      [{id:'sand_core',rate:0.40,min:1,max:1},{id:'jelly',rate:0.20,min:1,max:1}],
  bone_dragon:  [{id:'bone',rate:0.50,min:2,max:4},{id:'dragon_scale',rate:0.30,min:1,max:1}],
  tomb_guardian:[{id:'boss_gem',rate:1.0,min:5,max:7},{id:'chaos_shard',rate:1.0,min:3,max:4},{id:'bone',rate:1.0,min:5,max:8},{id:'dragon_scale',rate:0.6,min:1,max:2}],
  // ST5 ボス
  scorpion_king:[{id:'boss_gem',rate:1.0,min:4,max:6},{id:'chaos_shard',rate:1.0,min:3,max:3},{id:'scorpion_claw',rate:1.0,min:3,max:5}],
  // DUN1 ダンジョン
  zombie:       [{id:'bone',rate:0.40,min:1,max:2},{id:'troll_hide',rate:0.30,min:1,max:1}],
  lich:         [{id:'bone',rate:0.50,min:1,max:2},{id:'boss_gem',rate:0.15,min:1,max:1}],
  dark_elf:     [{id:'bat_wing',rate:0.40,min:1,max:1},{id:'wolf_fang',rate:0.25,min:1,max:1}],
  dark_illusion:[{id:'boss_gem',rate:1.0,min:5,max:8},{id:'chaos_shard',rate:1.0,min:4,max:4},{id:'boss_core',rate:1.0,min:1,max:1}],
  // ST20 ゴブリン集落
  goblin_archer:[{id:'goblin_ear',rate:0.45,min:1,max:1},{id:'bat_wing',rate:0.20,min:1,max:1}],
  goblin_axe:   [{id:'goblin_ear',rate:0.50,min:1,max:2},{id:'troll_hide',rate:0.20,min:1,max:1}],
  goblin_leader:[{id:'boss_gem',rate:1.0,min:1,max:2},{id:'goblin_ear',rate:1.0,min:3,max:5}],
  // DUN.2 炭鉱
  bone_walker:  [{id:'bone',rate:0.55,min:1,max:3},{id:'troll_hide',rate:0.20,min:1,max:1}],
  treasure_hunt:[{id:'jelly',rate:0.40,min:1,max:2},{id:'boss_gem',rate:0.20,min:1,max:1}],
  ghost:        [{id:'bat_wing',rate:0.45,min:1,max:2},{id:'bone',rate:0.30,min:1,max:1}],
};

const MAX_ITEM_TYPES=40; // 所持できる種類の上限
const MAX_ITEM_STACK=99; // 1種類あたりの最大所持数

// モンスター種別ごとの撃破SE
const KILL_SE={
  slime:'kill_pop', sakura:'kill_pop', cider:'kill_pop', beach_crab:'kill_grunt', wisp:'kill_pop', gama_ninja:'kill_grunt', red_oni:'kill_roar', blue_oni:'kill_roar',
  bat:'kill_squeak', hornet:'kill_squeak', beetle:'kill_squeak',
  goblin:'kill_grunt',
  goblin_archer:'kill_grunt', goblin_axe:'kill_grunt', goblin_leader:'kill_boss',
  bone_walker:'kill_bone', treasure_hunt:'kill_pop', ghost:'kill_squeak',
  orc_warrior:'kill_grunt', orc_high:'kill_grunt', orc_lady:'kill_grunt', orc_archer:'kill_grunt',
  troll:'kill_roar', wolf:'kill_roar', bear:'kill_roar', cloud_monkey:'kill_roar',
  skeleton:'kill_bone',
  dragon:'kill_heavy', giant:'kill_heavy', treant:'kill_heavy', rock_golem:'kill_heavy',
  sandworm:'kill_hiss', scorpion:'kill_hiss',
  crab:'kill_pop', seal:'kill_grunt',
  mummy:'kill_bone',
  sandman:'kill_pop',
  bone_dragon:'kill_bone',
  tomb_guardian:'kill_boss',
  // ボス
  scorpion_king:'kill_boss',
  zombie:'kill_grunt', lich:'kill_bone', dark_elf:'kill_squeak',
  dark_illusion:'kill_boss',
  // ボス全般
  boss1:'kill_boss', boss2:'kill_boss', boss3:'kill_boss', boss4:'kill_boss',
  scorpion_queen:'kill_boss', mistress:'kill_boss', thunder_god:'kill_boss', orc_general:'kill_boss',
};

// ============================================================
//  TitleScene
// ============================================================
class TitleScene extends Phaser.Scene{
  constructor(){super('Title')}
  create(){
    const w=this.scale.width,h=this.scale.height;
    // ローカルストレージからミュート設定を復元
    let _savedMute=null;
    try{_savedMute=localStorage.getItem('aq_muted');}catch(e){}
    if(_savedMute==='1'){muted=true;}
    else if(_savedMute==='0'){muted=false;}

    // ── タイトルBGMを確実に鳴らすためのキックスタート機構 ──
    // ブラウザ自動再生制限により、最初のタップまで再生できない端末がある
    // → タイトル画面のどこかをタップしたら必ず再生(またはAudioContextを起こす)
    const _kickBGM=()=>{
      if(muted) return;
      try{
        const ac=getAC();
        if(ac && ac.state==='suspended'){ ac.resume().catch(()=>{}); }
      }catch(e){}
      // 既に正常に鳴っていれば何もしない
      if(_bgmAudio && !_bgmAudio.paused && !_bgmAudio.ended) return;
      // 強制リスタート(同じキーチェックを回避するため一旦キーをクリア)
      _bgmKey=null;
      startBGM('title');
    };
    // 一度成功するまでpointerdownで毎回試みる(イベント自体は残しておく)
    this.input.on('pointerdown', _kickBGM);

    // BGM確認ダイアログは初回のみ（aq_mutedが未設定の場合のみ表示）
    if(_savedMute===null){
      const overlay=this.add.rectangle(w/2,h/2,w,h,0x000000,0.92).setOrigin(0.5).setDepth(100);
      const title=this.add.text(w/2,h/2-60,'🎵 BGMを流しますか？',{fontSize:'20px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5).setDepth(101);
      const sub=this.add.text(w/2,h/2-24,'（マナーモード中は🔇ボタンで消音できます）',{fontSize:'11px',fontFamily:'Arial',color:'#aaaaaa',wordWrap:{width:500}}).setOrigin(0.5).setDepth(101);
      const btnY=this.add.rectangle(w/2-80,h/2+30,160,40,0x2ecc71,0.3).setStrokeStyle(2,0x2ecc71).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2-80,h/2+30,'🔊 BGMあり',{fontSize:'15px',fontFamily:'Arial',color:'#2ecc71'}).setOrigin(0.5).setDepth(102);
      const btnN=this.add.rectangle(w/2+80,h/2+30,160,40,0xe74c3c,0.3).setStrokeStyle(2,0xe74c3c).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2+80,h/2+30,'🔇 BGMなし',{fontSize:'15px',fontFamily:'Arial',color:'#e74c3c'}).setOrigin(0.5).setDepth(102);
      const dismiss=()=>{overlay.destroy();title.destroy();sub.destroy();btnY.destroy();btnN.destroy();_bgmKey=null;startBGM('title');};
      btnY.on('pointerdown',()=>{setMute(false);dismiss();});
      btnN.on('pointerdown',()=>{setMute(true);[overlay,title,sub,btnY,btnN].forEach(o=>o.destroy());});
    }else{
      // 既設定の場合: 一旦 startBGM するが、自動再生が失敗してもタップ時に_kickBGMで復活する
      _bgmKey=null;
      startBGM('title');
    }
    // ── 背景: シネマティック・グラデーション ──
    // 全体: 黒 → 紺(下部)
    this.add.rectangle(0,0,w,h,0x000000).setOrigin(0);
    // 下半分にうっすら紺グラデ
    const bgGrad = this.add.graphics();
    bgGrad.fillStyle(0x0a1a3a, 0.6);
    bgGrad.fillRect(0, h*0.5, w, h*0.5);
    bgGrad.fillStyle(0x1a0033, 0.4);
    bgGrad.fillRect(0, h*0.7, w, h*0.3);

    // 星(複数色・明滅)
    for(let i=0;i<80;i++){
      const sy = Phaser.Math.Between(0, h*0.85);
      const colors = [0xffffff, 0xffffff, 0xffffff, 0xffaa66, 0xaaccff];
      const col = colors[Phaser.Math.Between(0, colors.length-1)];
      const s = this.add.circle(
        Phaser.Math.Between(0, w),
        sy,
        Phaser.Math.FloatBetween(0.5, 2),
        col,
        Phaser.Math.FloatBetween(0.4, 1)
      );
      this.tweens.add({
        targets: s,
        alpha: 0.1,
        duration: Phaser.Math.Between(800, 2200),
        yoyo: true, repeat: -1,
        delay: Phaser.Math.Between(0, 1500),
      });
    }

    // 流れ星(ランダムタイミングで降る)
    const spawnShootingStar = () => {
      if(!this.scene.isActive('Title')) return;
      const sx = Phaser.Math.Between(w*0.2, w*0.8);
      const sy = Phaser.Math.Between(20, h*0.4);
      const star = this.add.line(0, 0, sx, sy, sx, sy, 0xffffff, 1).setOrigin(0).setLineWidth(2).setDepth(2);
      this.tweens.add({
        targets: star,
        duration: 700,
        onUpdate: (tween) => {
          const t = tween.progress;
          const dx = 120 * t;
          const dy = 80 * t;
          star.setTo(sx, sy, sx + dx, sy + dy);
          star.setAlpha(1 - t);
        },
        onComplete: () => star.destroy(),
      });
      // 次の流れ星を予約
      this.time.delayedCall(Phaser.Math.Between(3000, 8000), spawnShootingStar);
    };
    this.time.delayedCall(Phaser.Math.Between(2000, 5000), spawnShootingStar);

    // ── 月(右上に大きく) ──
    const moonX = w*0.85, moonY = h*0.32;
    const moonR = 50;
    // 月のグロー
    const moonGlow = this.add.circle(moonX, moonY, moonR*1.8, 0xffdd99, 0.18).setDepth(1);
    this.tweens.add({targets: moonGlow, scaleX: 1.1, scaleY: 1.1, alpha: 0.25, duration: 2500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'});
    // 月本体(クレーター付き)
    const moonG = this.add.graphics().setDepth(2);
    moonG.fillStyle(0xfff4d6, 1);
    moonG.fillCircle(moonX, moonY, moonR);
    moonG.fillStyle(0xddc394, 1);
    moonG.fillCircle(moonX+5, moonY+5, moonR-3);  // 影
    moonG.fillStyle(0xfff4d6, 1);
    moonG.fillCircle(moonX-3, moonY-3, moonR-6);  // ハイライト
    // クレーター
    moonG.fillStyle(0x997a4a, 0.5);
    moonG.fillCircle(moonX+10, moonY-10, 8);
    moonG.fillCircle(moonX-15, moonY+12, 6);
    moonG.fillCircle(moonX+5, moonY+18, 4);

    // 地平線(オレンジの薄い光ライン)
    const horizonY = h*0.72;
    const horizon = this.add.graphics().setDepth(3);
    horizon.fillStyle(0xffcc88, 0.4);
    horizon.fillRect(0, horizonY-1, w, 2);
    // 地平線のグラデーション(中央が一番明るい)
    for(let gx=0; gx<w; gx+=20){
      const dist = Math.abs(gx - w/2) / (w/2);
      const a = (1-dist) * 0.5;
      if(a > 0.05){
        horizon.fillStyle(0xffaa66, a);
        horizon.fillRect(gx, horizonY-1, 22, 2);
      }
    }

    // ── タイトル: LUNA FRONTIER (英語・大) ──
    const titleY = h*0.42;
    // タイトル背後にグロー(輝き演出)
    const titleGlow = this.add.text(w/2, titleY, 'LUNA FRONTIER', {
      fontSize: '46px',
      fontFamily: '"Orbitron", "Arial Black", sans-serif',
      fontStyle: 'bold',
      color: '#ffcc88',
    }).setOrigin(0.5).setDepth(4).setAlpha(0.3);
    this.tweens.add({targets: titleGlow, alpha: 0.5, scaleX: 1.02, scaleY: 1.02, duration: 2000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'});
    // メインタイトル(白銀グラデ風)
    const title = this.add.text(w/2, titleY, 'LUNA FRONTIER', {
      fontSize: '44px',
      fontFamily: '"Orbitron", "Arial Black", sans-serif',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#888888',
      strokeThickness: 1,
    }).setOrigin(0.5).setDepth(5);
    title.setShadow(0, 4, '#000000', 8, true, true);

    // サブタイトル(英語・小)
    const subEn = this.add.text(w/2, titleY + 32, 'ルナフロンティア', {
      fontSize: '15px',
      fontFamily: '"Cinzel", "Yu Mincho", serif',
      color: '#ffcc88',
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(5);
    subEn.setLetterSpacing && subEn.setLetterSpacing(8);
    subEn.setShadow(0, 2, '#000000', 6, true, true);

    // 日本語サブタイトル
    this.add.text(w/2, titleY + 54, '~ 月の開拓者たち ~', {
      fontSize: '12px',
      fontFamily: '"Yu Mincho", "MS Mincho", serif',
      color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(5);

    // セーブデータ確認
    const hasSave=[1,2,3].some(s=>getSaveData(s)!==null);

    // ── 新規ゲームボタン ──
    const newBtn=this.add.rectangle(w/2,h*0.65,240,48,0x0a1f3a,0.9).setStrokeStyle(2,0xffcc88).setInteractive({useHandCursor:true}).setDepth(10);
    const newTxt=this.add.text(w/2,h*0.65,'⚔ 新規ゲーム',{fontSize:'18px',fontFamily:'Arial',color:'#ffcc88',fontStyle:'bold'}).setOrigin(0.5).setDepth(11);
    newBtn.on('pointerover',()=>newBtn.setFillStyle(0x2a3a5a,0.95));
    newBtn.on('pointerout', ()=>newBtn.setFillStyle(0x0a1f3a,0.9));
    newBtn.on('pointerdown',()=>{getAC();this.scene.start('ClassSelect');});

    // ── 続きからボタン ──
    const loadBtn=this.add.rectangle(w/2,h*0.78,240,48,hasSave?0x0a2a0a:0x111111,0.9).setStrokeStyle(2,hasSave?0x44ff88:0x333333).setInteractive({useHandCursor:hasSave}).setDepth(10);
    const loadTxt=this.add.text(w/2,h*0.78,'📂 続きから',{fontSize:'18px',fontFamily:'Arial',color:hasSave?'#44ff88':'#333333',fontStyle:'bold'}).setOrigin(0.5).setDepth(11);
    if(hasSave){
      loadBtn.on('pointerover',()=>loadBtn.setFillStyle(0x1a4a1a,0.95));
      loadBtn.on('pointerout', ()=>loadBtn.setFillStyle(0x0a2a0a,0.9));
      loadBtn.on('pointerdown',()=>{getAC();this.scene.start('SaveSelect',{mode:'load'});});
    }

    const muteBtn=this.add.text(w-10,10,muted?'🔇':'🔊',{fontSize:'20px'}).setOrigin(1,0).setInteractive({useHandCursor:true}).setDepth(20);
    muteBtn.on('pointerdown',()=>{setMute(!muted);muteBtn.setText(muted?'🔇':'🔊');});
  }
}

// ============================================================
//  SaveSelectScene（セーブスロット選択）
// ============================================================
class SaveSelectScene extends Phaser.Scene{
  constructor(){super('SaveSelect')}
  init(data){
    // restartで呼ばれた時も既存データを保持
    if(data&&data.mode!==undefined){
      this.mode=data.mode||'save';this.playerData=data.playerData||null;this.stage=data.stage||0;
    }else{
      this.mode=this.mode||'load';this.playerData=this.playerData||null;this.stage=this.stage||0;
    }
  }
  create(){
    console.log('[SaveSelect] create start, mode=', this.mode);
    const w=this.scale.width,h=this.scale.height;
    const mode=this.mode; // 'save' or 'load'
    this.add.rectangle(0,0,w,h,0x030818).setOrigin(0);
    // 星背景
    for(let i=0;i<40;i++){
      const s=this.add.circle(Phaser.Math.Between(0,w),Phaser.Math.Between(0,h),Phaser.Math.FloatBetween(0.5,1.5),0xffffff,Phaser.Math.FloatBetween(0.2,0.8));
      this.tweens.add({targets:s,alpha:0.1,duration:Phaser.Math.Between(600,1800),yoyo:true,repeat:-1});
    }
    this.add.text(w/2,40,mode==='save'?'💾 セーブスロットを選択':'📂 ロードするデータを選択',{
      fontSize:'22px',fontFamily:'Arial',color:'#ffd700',stroke:'#000',strokeThickness:3,fontStyle:'bold'
    }).setOrigin(0.5);

    const SLOT_H=110, SLOT_W=Math.min(w-40,500);
    const startY=100;

    for(let slot=1;slot<=SAVE_SLOTS;slot++){
      const save=getSaveData(slot);
      const sy=startY+slot*SLOT_H;
      const sx=w/2;
      const isEmpty=save===null;

      // スロット背景
      const bg=this.add.rectangle(sx,sy,SLOT_W,SLOT_H-10,isEmpty?0x0a0a1a:0x0a1f0a,0.92)
        .setStrokeStyle(2,isEmpty?0x334455:0x44aa44).setInteractive({useHandCursor:!isEmpty||mode==='save'});
      
      // スロット番号
      this.add.text(sx-SLOT_W/2+16,sy-30,'スロット '+slot,{fontSize:'13px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0,0.5);

      if(isEmpty){
        this.add.text(sx,sy,'— 空のスロット —',{fontSize:'16px',fontFamily:'Arial',color:'#334455'}).setOrigin(0.5);
        if(mode==='save'){
          bg.setStrokeStyle(2,0x44aaff);
          bg.setFillStyle(0x0a1a2a,0.9);
          bg.on('pointerover',()=>bg.setFillStyle(0x1a2a3a,0.95));
          bg.on('pointerout', ()=>bg.setFillStyle(0x0a1a2a,0.9));
          bg.on('pointerdown',()=>this._doSave(slot));
          this.add.text(sx,sy,'＋ ここにセーブする',{fontSize:'16px',fontFamily:'Arial',color:'#44aaff',fontStyle:'bold'}).setOrigin(0.5);
        }
      }else{
        // セーブデータ表示
        // クラスアイコン(絵文字) + 漢字 + 色
        const clsIcon={novice:'⭐',warrior:'⚔',mage:'🪄',archer:'🏹',bomber:'💣'}[save.cls]||'❓';
        const clsChar={novice:'初',warrior:'剣',mage:'魔',archer:'弓',bomber:'爆'}[save.cls]||'？';
        const clsCol={novice:'#88ccff',warrior:'#e74c3c',mage:'#9b59b6',archer:'#27ae60',bomber:'#f39c12'}[save.cls]||'#ffffff';
        const clsBgCol={novice:0x14283a,warrior:0x3a1414,mage:0x2a1433,archer:0x143a1a,bomber:0x3a2814}[save.cls]||0x1a1a2e;
        // アイコン枠(クラス色で染める)
        this.add.rectangle(sx-SLOT_W/2+30,sy,48,48,clsBgCol,0.9).setStrokeStyle(2,Phaser.Display.Color.HexStringToColor(clsCol).color);
        // 絵文字アイコン(上寄り)
        this.add.text(sx-SLOT_W/2+30,sy-8,clsIcon,{fontSize:'22px'}).setOrigin(0.5);
        // 漢字(下寄り)
        this.add.text(sx-SLOT_W/2+30,sy+14,clsChar,{fontSize:'12px',fontFamily:'Arial',color:clsCol,fontStyle:'bold'}).setOrigin(0.5);
        // 情報
        this.add.text(sx-SLOT_W/2+62,sy-20,save.clsName+' / Lv'+save.lv,{fontSize:'16px',fontFamily:'Arial',color:'#ffffff',fontStyle:'bold'}).setOrigin(0,0.5);
        this.add.text(sx-SLOT_W/2+62,sy+2,'📍 '+save.stageName,{fontSize:'13px',fontFamily:'Arial',color:'#aaddff'}).setOrigin(0,0.5);
        this.add.text(sx-SLOT_W/2+62,sy+22,'💰 '+save.gold+'G  🕐 '+save.savedAt,{fontSize:'11px',fontFamily:'Arial',color:'#888888'}).setOrigin(0,0.5);

        if(mode==='load'){
          bg.on('pointerover',()=>bg.setFillStyle(0x1a3a1a,0.95));
          bg.on('pointerout', ()=>bg.setFillStyle(0x0a1f0a,0.92));
          bg.on('pointerdown',()=>this._doLoad(slot));
        }else{
          // 上書きセーブ
          bg.setStrokeStyle(2,0xffaa00);
          bg.setFillStyle(0x1a1400,0.9);
          bg.on('pointerover',()=>bg.setFillStyle(0x2a2000,0.95));
          bg.on('pointerout', ()=>bg.setFillStyle(0x1a1400,0.9));
          bg.on('pointerdown',()=>this._confirmOverwrite(slot,save));
        }

        // 削除ボタン
        const delBtn=this.add.rectangle(sx+SLOT_W/2-30,sy,44,32,0x3a0000,0.9)
          .setStrokeStyle(1,0xaa2222).setInteractive({useHandCursor:true});
        this.add.text(sx+SLOT_W/2-30,sy,'🗑',{fontSize:'16px'}).setOrigin(0.5);
        delBtn.on('pointerover',()=>delBtn.setFillStyle(0x6a0000,0.95));
        delBtn.on('pointerout', ()=>delBtn.setFillStyle(0x3a0000,0.9));
        delBtn.on('pointerdown',()=>this._confirmDelete(slot));
      }
    }

    // 戻るボタン
    const backBtn=this.add.rectangle(w/2,h-36,160,36,0x1a1a1a,0.9).setStrokeStyle(1,0x556677).setInteractive({useHandCursor:true});
    this.add.text(w/2,h-36,'← 戻る',{fontSize:'15px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5);
    backBtn.on('pointerdown',()=>{
      if(mode==='load')this.scene.start('Title');
      else{
        // Gameシーンを先に再開してから自分(SaveSelect)を止める
        const gs=this.scene.get('Game');
        if(gs && this.scene.isPaused('Game')){
          this.scene.resume('Game');
        }
        this.scene.stop();
      }
    });
  }

  _doSave(slot){
    const pd=this.playerData;
    const summary=makeSaveSummary(pd,this.stage);
    // Phaserオブジェクトや一時状態を除外したクリーンなコピーを保存
    const cleanPd = sanitizePlayerData(pd);
    setSaveData(slot,{playerData:cleanPd,stage:this.stage,summary});
    this._showMsg('💾 スロット'+slot+' にセーブしました！','#44ff88');
    this.time.delayedCall(1200,()=>{
      // Gameシーンを先に再開してから自分(SaveSelect)を止める
      const gs=this.scene.get('Game');
      if(gs && this.scene.isPaused('Game')){
        this.scene.resume('Game');
      }
      this.scene.stop();
    });
  }

  _doLoad(slot){
    const save=getSaveData(slot);
    if(!save)return;
    this.scene.start('Game',{playerData:save.playerData,stage:save.stage,currentSlot:slot});
  }

  _confirmOverwrite(slot,existing){
    const w=this.scale.width,h=this.scale.height;
    const ov=this.add.rectangle(w/2,h/2,w,h,0x000000,0.7).setDepth(80).setInteractive();
    const box=this.add.rectangle(w/2,h/2,340,160,0x0a1525,0.98).setStrokeStyle(2,0xffaa00).setDepth(81);
    this.add.text(w/2,h/2-44,'スロット'+slot+'に上書きしますか？',{fontSize:'16px',fontFamily:'Arial',color:'#ffaa00',fontStyle:'bold'}).setOrigin(0.5).setDepth(82);
    this.add.text(w/2,h/2-16,'現在: '+existing.clsName+' Lv'+existing.lv+' '+existing.stageName,{fontSize:'13px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5).setDepth(82);
    const yes=this.add.rectangle(w/2-70,h/2+30,120,36,0x226622,0.95).setStrokeStyle(1,0x44aa44).setDepth(82).setInteractive({useHandCursor:true});
    this.add.text(w/2-70,h/2+30,'上書き',{fontSize:'14px',fontFamily:'Arial',color:'#44ff88',fontStyle:'bold'}).setOrigin(0.5).setDepth(83);
    const no=this.add.rectangle(w/2+70,h/2+30,120,36,0x221111,0.95).setStrokeStyle(1,0x663333).setDepth(82).setInteractive({useHandCursor:true});
    this.add.text(w/2+70,h/2+30,'キャンセル',{fontSize:'14px',fontFamily:'Arial',color:'#ff8888'}).setOrigin(0.5).setDepth(83);
    const close=()=>{[ov,box,yes,no].forEach(o=>o.destroy());this.children.list.filter(o=>o.depth>=82&&o.type==='Text').forEach(o=>o.destroy());};
    yes.on('pointerdown',()=>{close();this._doSave(slot);});
    no.on('pointerdown',()=>close());
  }

  _confirmDelete(slot){
    const w=this.scale.width,h=this.scale.height;
    const ov=this.add.rectangle(w/2,h/2,w,h,0x000000,0.7).setDepth(80).setInteractive();
    const box=this.add.rectangle(w/2,h/2,320,140,0x1a0000,0.98).setStrokeStyle(2,0xaa2222).setDepth(81);
    this.add.text(w/2,h/2-36,'スロット'+slot+' を削除しますか？',{fontSize:'16px',fontFamily:'Arial',color:'#ff4444',fontStyle:'bold'}).setOrigin(0.5).setDepth(82);
    this.add.text(w/2,h/2-12,'この操作は元に戻せません',{fontSize:'12px',fontFamily:'Arial',color:'#888888'}).setOrigin(0.5).setDepth(82);
    const yes=this.add.rectangle(w/2-70,h/2+28,120,34,0x4a0000,0.95).setStrokeStyle(1,0xaa2222).setDepth(82).setInteractive({useHandCursor:true});
    this.add.text(w/2-70,h/2+28,'削除する',{fontSize:'14px',fontFamily:'Arial',color:'#ff4444',fontStyle:'bold'}).setOrigin(0.5).setDepth(83);
    const no=this.add.rectangle(w/2+70,h/2+28,120,34,0x1a1a2e,0.95).setStrokeStyle(1,0x334455).setDepth(82).setInteractive({useHandCursor:true});
    this.add.text(w/2+70,h/2+28,'キャンセル',{fontSize:'14px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5).setDepth(83);
    const close=()=>{[ov,box,yes,no].forEach(o=>o.destroy());this.children.list.filter(o=>o.depth>=82&&o.type==='Text').forEach(o=>o.destroy());};
    yes.on('pointerdown',()=>{close();deleteSaveData(slot);this.scene.restart({mode:this.mode,playerData:this.playerData,stage:this.stage});});
    no.on('pointerdown',()=>close());
  }

  _showMsg(msg,color){
    const w=this.scale.width,h=this.scale.height;
    const txt=this.add.text(w/2,h/2,'',{fontSize:'20px',fontFamily:'Arial',color,stroke:'#000',strokeThickness:3,fontStyle:'bold'}).setOrigin(0.5).setDepth(90).setAlpha(0);
    txt.setText(msg);
    this.tweens.add({targets:txt,alpha:1,duration:200,onComplete:()=>this.tweens.add({targets:txt,alpha:0,duration:400,delay:700,onComplete:()=>txt.destroy()})});
  }
}

// ============================================================
//  ClassSelectScene
// ============================================================
class ClassSelectScene extends Phaser.Scene{
  constructor(){super('ClassSelect')}
  create(){
    const w=this.scale.width,h=this.scale.height;
    // リサイズ後に再描画
    this.scale.on('resize',(gameSize)=>{if(this.scene.isActive('ClassSelect'))this.scene.restart('ClassSelect');});
    // ローカルストレージからミュート設定を復元
    let _savedMute=null;
    try{_savedMute=localStorage.getItem('aq_muted');}catch(e){}
    if(_savedMute==='1'){muted=true;}
    else if(_savedMute==='0'){muted=false;}
    // BGM確認ダイアログは初回のみ（aq_mutedが未設定の場合のみ表示）
    if(_savedMute===null){
      const overlay=this.add.rectangle(w/2,h/2,w,h,0x000000,0.92).setOrigin(0.5).setDepth(100);
      const title=this.add.text(w/2,h/2-60,'🎵 BGMを流しますか？',{fontSize:'20px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5).setDepth(101);
      const sub=this.add.text(w/2,h/2-24,'（マナーモード中は🔇ボタンで消音できます）',{fontSize:'11px',fontFamily:'Arial',color:'#aaaaaa',wordWrap:{width:500}}).setOrigin(0.5).setDepth(101);
      const btnY=this.add.rectangle(w/2-80,h/2+30,160,40,0x2ecc71,0.3).setStrokeStyle(2,0x2ecc71).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2-80,h/2+30,'🔊 BGMあり',{fontSize:'15px',fontFamily:'Arial',color:'#2ecc71'}).setOrigin(0.5).setDepth(102);
      const btnN=this.add.rectangle(w/2+80,h/2+30,160,40,0xe74c3c,0.3).setStrokeStyle(2,0xe74c3c).setDepth(101).setInteractive({useHandCursor:true});
      this.add.text(w/2+80,h/2+30,'🔇 BGMなし',{fontSize:'15px',fontFamily:'Arial',color:'#e74c3c'}).setOrigin(0.5).setDepth(102);
      const dismiss=()=>{overlay.destroy();title.destroy();sub.destroy();btnY.destroy();btnN.destroy();startBGM('title');};
      btnY.on('pointerdown',()=>{setMute(false);dismiss();});
      btnN.on('pointerdown',()=>{setMute(true);[overlay,title,sub,btnY,btnN].forEach(o=>o.destroy());});
    }else{
      startBGM('title');
    }
    this.add.rectangle(0,0,w,h,0x060010).setOrigin(0);
    this.add.text(w/2,24,'✨ 新しい冒険の始まり ✨',{fontSize:'18px',fontFamily:'Arial',color:'#ffd700',stroke:'#cc8800',strokeThickness:2}).setOrigin(0.5);

    // 横画面でも収まるよう、画面の高さに応じてレイアウトを調整
    const isLandscape = w > h;
    // ── ノービス紹介カード(よりコンパクトに) ──
    const cx=w/2;
    // 縦画面: 中央上、横画面: 上寄り
    const cy = isLandscape ? h*0.32 : h/2-40;
    const cardW = Math.min(300, w*0.55);
    const cardH = isLandscape ? 110 : 180;
    this.add.rectangle(cx,cy,cardW,cardH,0x0a1a3a,0.92).setStrokeStyle(2,0x44aaff);

    // 上部: アイコン横並び
    const topY = cy - cardH/2 + 24;
    // 左: スプライト
    this.add.sprite(cx-cardW/2+30, topY+2, 'player_novice', 0).setDisplaySize(40,40);
    // 右: クラス名+サブ説明
    this.add.text(cx-cardW/2+58, topY-7, '⭐ ノービス', {
      fontSize:'15px',fontFamily:'Arial',color:'#88ccff',fontStyle:'bold',stroke:'#000',strokeThickness:2
    }).setOrigin(0,0.5);
    this.add.text(cx-cardW/2+58, topY+10, '〜 駆け出しの冒険者 〜', {
      fontSize:'9px',fontFamily:'Arial',color:'#aaccdd',fontStyle:'italic'
    }).setOrigin(0,0.5);

    // 区切り線
    this.add.rectangle(cx, cy-cardH/2+50, cardW-30, 1, 0x44aaff, 0.5);

    // 中央: 説明文(行間ゆったり)
    if(isLandscape){
      // 横画面はコンパクトに1行にまとめる
      this.add.text(cx, cy + cardH/2 - 30, '全ステータス控えめだが自由度の高い基本クラス', {
        fontSize:'10px',fontFamily:'Arial',color:'#ffffff',align:'center'
      }).setOrigin(0.5);
      this.add.text(cx, cy + cardH/2 - 14, 'ジョブLv5でブレイズフォージにて4職に転職可能', {
        fontSize:'9px',fontFamily:'Arial',color:'#aaccdd',align:'center'
      }).setOrigin(0.5);
    }else{
      const descY = cy + 18;
      this.add.text(cx, descY, '全ステータスは控えめだが\n自由度の高い基本クラス', {
        fontSize:'11px',fontFamily:'Arial',color:'#ffffff',align:'center',lineSpacing:4
      }).setOrigin(0.5);
      this.add.text(cx, descY + 42, 'ジョブLv5でブレイズフォージにて\n4つの職業に転職可能', {
        fontSize:'10px',fontFamily:'Arial',color:'#aaccdd',align:'center',lineSpacing:4
      }).setOrigin(0.5);
    }

    // 下部: 進化先プレビュー(カード下)
    const evoY = cy + cardH/2 + (isLandscape ? 22 : 28);
    this.add.text(cx, evoY-12, '▼ 転職先 ▼', {
      fontSize:'10px',fontFamily:'Arial',color:'#888888'
    }).setOrigin(0.5);
    const evoTexts=[
      {icon:'⚔', name:'剣士',     col:'#e74c3c',x:-120},
      {icon:'🪄', name:'マジシャン',col:'#9b59b6',x:-40},
      {icon:'🏹', name:'アーチャー',col:'#27ae60',x:40},
      {icon:'💣', name:'ボマー',    col:'#f39c12',x:120},
    ];
    evoTexts.forEach(e=>{
      this.add.text(cx+e.x, evoY+8, e.icon, {fontSize:'14px'}).setOrigin(0.5);
      this.add.text(cx+e.x, evoY+24, e.name, {
        fontSize:'10px',fontFamily:'Arial',color:e.col,fontStyle:'bold'
      }).setOrigin(0.5);
    });

    // 「冒険を始める」ボタン(画面下・進化先プレビューの下)
    // 進化先プレビューと干渉しないようマージン確保
    const minStartY = evoY + 60;
    const startY = Math.max(minStartY, h-50);
    const startBtn=this.add.rectangle(cx, startY, 180, 38, 0x44aa44, 0.9).setStrokeStyle(2, 0x88ff88).setInteractive({useHandCursor:true});
    this.add.text(cx, startY, '✨ 冒険を始める', {fontSize:'15px',fontFamily:'Arial',color:'#ffffff',fontStyle:'bold',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
    startBtn.on('pointerover',()=>startBtn.setFillStyle(0x66cc66,1));
    startBtn.on('pointerout', ()=>startBtn.setFillStyle(0x44aa44,0.9));
    startBtn.on('pointerdown',()=>{
      const pd=makePlayerData('novice');
      if(testMode){
        // テストモード:即転職可能なJobLv5+所持金
        pd.lv=10; pd.statPts=20;
        pd.jobLv=5; pd.jobPts=10;
        pd.gold=9999;
      }
      this.scene.start('Game',{playerData:pd, stage:0});
    });

    // 旧クラス選択ループは無効化
    const classes=[]; // 空配列にして既存コード無効化
    classes.forEach(cls=>{
      const cx=w/2+cls.x,cy=h/2+cls.y;
      const card=this.add.rectangle(cx,cy,280,130,cls.col,0.12).setInteractive({useHandCursor:true}).setStrokeStyle(2,cls.col);
      // bomberはspritesheet、他はimage
      if(cls.key==='bomber'){
        this.add.sprite(cx-90,cy,'player_bomber').setFrame(0).setDisplaySize(64,80);
      }else if(cls.key==='mage'){
        this.add.sprite(cx-90,cy,'player_mage').setFrame(0).setDisplaySize(80,80);
      }else if(cls.key==='archer'){
        this.add.sprite(cx-90,cy,'player_archer').setFrame(0).setDisplaySize(80,80);
      }else{
        this.add.sprite(cx-90,cy,'player_'+cls.key).setFrame(0).setDisplaySize(64,80);
      }
      this.add.text(cx+10,cy-32,cls.name,{fontSize:'20px',fontFamily:'Arial',color:'#'+cls.col.toString(16).padStart(6,'0'),stroke:'#000',strokeThickness:2});
      this.add.text(cx+10,cy-4,cls.desc,{fontSize:'11px',fontFamily:'Arial',color:'#aaaaaa',lineSpacing:4});
      card.on('pointerover',()=>{card.setFillStyle(cls.col,0.35);this.tweens.add({targets:card,scaleX:1.03,scaleY:1.03,duration:100})});
      card.on('pointerout', ()=>{card.setFillStyle(cls.col,0.12);this.tweens.add({targets:card,scaleX:1,scaleY:1,duration:100})});
      card.on('pointerdown',()=>{
        const pd=makePlayerData(cls.key);
        if(testMode){
          // テストモード：ステータスポイント・JOBポイントをMAXに
          pd.lv=50; pd.statPts=100; pd.jobLv=30; pd.jobPts=200;
          pd.exp=0; pd.expNext=9999;
          pd.gold=99999;
          // 書物スキルを全習得・sk4をLv5に
          pd.sk4=5;
          if(pd.cls==='warrior'){pd._hasBerserk=true;}
          if(pd.cls==='mage'){pd._hasMeteoorm=true;}
          if(pd.cls==='archer'){pd._hasBoostAtk=true;}
          if(pd.cls==='bomber'){pd._hasBomberPower=true;}
        }
        this.scene.start('Game',{playerData:pd,stage:0});
      });
    });
    const muteBtn=this.add.text(w-10,10,muted?'🔇':'🔊',{fontSize:'20px'}).setOrigin(1,0).setInteractive({useHandCursor:true});
    muteBtn.on('pointerdown',()=>{setMute(!muted);muteBtn.setText(muted?'🔇':'🔊')});

    // テストモードトグル(画面右下にコンパクトに配置・干渉しないように)
    const tmW = 130, tmH = 26;
    const tmX = w - tmW/2 - 10;
    const tmY = h - tmH/2 - 10;
    const tmBg=this.add.rectangle(tmX,tmY,tmW,tmH,testMode?0x226622:0x222233,0.9).setStrokeStyle(2,testMode?0x44ff44:0x556677).setInteractive({useHandCursor:true});
    const tmTxt=this.add.text(tmX,tmY,testMode?'🧪 テスト ON':'🧪 テスト OFF',{fontSize:'11px',fontFamily:'Arial',color:testMode?'#44ff44':'#aaaaaa',fontStyle:'bold'}).setOrigin(0.5);
    tmBg.on('pointerdown',()=>{
      testMode=!testMode;
      tmBg.setFillStyle(testMode?0x226622:0x222233,0.9).setStrokeStyle(2,testMode?0x44ff44:0x556677);
      tmTxt.setText(testMode?'🧪 テスト ON':'🧪 テスト OFF').setColor(testMode?'#44ff44':'#aaaaaa');
    });
    // 説明テキストはテストモードボタンが ON の時だけ表示
    if(testMode){
      this.add.text(tmX, tmY-20, '※ステータスPT/スキルPT/Gold MAX',{fontSize:'8px',fontFamily:'Arial',color:'#556677'}).setOrigin(0.5);
    }
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
    const lv=this.add.text(w/2,h/2-130,'✨ LEVEL UP! ✨',{fontSize:'28px',fontFamily:'Arial',color:'#ffd700',stroke:'#ff8c00',strokeThickness:3}).setOrigin(0.5);
    this.tweens.add({targets:lv,scaleX:1.08,scaleY:1.08,duration:600,yoyo:true,repeat:-1});
    this.add.text(w/2,h/2-95,'Lv '+(pd.lv-1)+' → Lv '+pd.lv,{fontSize:'18px',fontFamily:'Arial',color:'#ffffff'}).setOrigin(0.5);
    this.add.text(w/2,h/2-65,'― ステータス自動上昇 ―',{fontSize:'12px',fontFamily:'Arial',color:'#888888'}).setOrigin(0.5);
    const rows=[['MaxHP',pd.mhp,'#2ecc71',8],['ATK',pd.atk,'#e74c3c',1],['DEF',pd.def,'#3498db',1],['MaxSP',pd.msp,'#9b59b6',5]];
    rows.forEach(([n,v,c,d],i)=>{
      const y=h/2-40+i*24;
      this.add.text(w/2-100,y,n,{fontSize:'12px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0,0.5);
      this.add.text(w/2+40,y,String(v),{fontSize:'12px',fontFamily:'Arial',color:c}).setOrigin(0,0.5);
      this.add.text(w/2+100,y,'(+'+d+')',{fontSize:'11px',fontFamily:'Arial',color:'#44ff88'}).setOrigin(0,0.5);
    });
    this.add.text(w/2,h/2+62,'⚡ ステータスポイント +3pt 獲得！',{fontSize:'13px',fontFamily:'Arial',color:'#ffff44'}).setOrigin(0.5);
    this.add.text(w/2,h/2+84,'（町で [S] キー or ✨ボタンで割り振り）',{fontSize:'11px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5);
    const btn=this.add.rectangle(w/2,h/2+118,200,40,0xffd700,0.2).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true});
    this.add.text(w/2,h/2+118,'▶ 続ける',{fontSize:'15px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5);
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
    const t1=this.add.text(w/2,h*0.18,'🏆 GAME CLEAR 🏆',{fontSize:'36px',fontFamily:'Arial',color:'#ffd700',stroke:'#ff8c00',strokeThickness:4}).setOrigin(0.5).setAlpha(0);
    this.tweens.add({targets:t1,alpha:1,duration:800,delay:200});
    const panel=this.add.rectangle(w/2,h*0.56,400,240,0x0a1428,0.95).setAlpha(0).setStrokeStyle(2,0xffd700);
    this.tweens.add({targets:panel,alpha:1,duration:600,delay:600});
    const cls={novice:'ノービス',warrior:'剣士',mage:'マジシャン',archer:'アーチャー',bomber:'ボマー'}[pd.cls]||pd.cls;
    const scores=[['職業',cls],['最終Lv','Lv '+pd.lv],['ATK/DEF/MAG',pd.atk+'/'+pd.def+'/'+pd.mag],['討伐数',pd.kills+'体'],['獲得Gold',pd.gold+'G']];
    scores.forEach(([k,v],i)=>{
      const y=h*0.41+i*32;
      const a=this.add.text(w/2-160,y,k,{fontSize:'14px',fontFamily:'Arial',color:'#888888'}).setAlpha(0);
      const b=this.add.text(w/2+40,y,v,{fontSize:'14px',fontFamily:'Arial',color:'#ffd700'}).setAlpha(0);
      this.tweens.add({targets:[a,b],alpha:1,duration:400,delay:800+i*150});
    });
    const btn=this.add.rectangle(w/2,h*0.87,240,48,0xffd700,0.2).setStrokeStyle(2,0xffd700).setInteractive({useHandCursor:true}).setAlpha(0);
    const btnTxt=this.add.text(w/2,h*0.87,'▶ タイトルへ戻る',{fontSize:'16px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5).setAlpha(0);
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
  0:{name:'🏘 セントラル', bgmKey:'central',
    mapImage:'map_town0', mapType:'town0',
    mapW:1254, mapH:1254,
    tiles:[],tileWeights:[],
    objects:[],objPos:[],
    enemies:[],boss:null,bossThreshold:999,
    // ST1 への出口 = 右側のゲート
    portalTo:1, portalToLabel:'🌿 ST.1へ出発', portalToKey:'portal_st1',
    portalBack:null, portalBackLabel:'', portalBackKey:'portal_town',
    // 入口・出口位置
    spawnX:625, spawnY:720,           // 中央広場(噴水の少し下)
    portalNextX:1200, portalNextY:610, // 右側のゲート(ST1へ)
    spawnFromNextX:1130, spawnFromNextY:610,
    // 南へ行くポータル(セントラル南のゲート → south_st1へ)
    portalSouth:22, portalSouthLabel:'🌳 南の街道へ', portalSouthKey:'portal_south_st1',
    portalSouthX:625, portalSouthY:1200,  // 南端中央
    spawnFromSouthX:625, spawnFromSouthY:1080,
    // 5つの建物 (画像の建物位置に合わせる)
    buildings:[
      // 左上: ポータル屋(紫屋根・水晶・転送魔法陣)
      {x:130, y:130, w:280, h:280, label:'✨ ポータル屋', type:'guild'},
      // 中央上: 宿屋(オレンジ屋根・煙突)
      {x:470, y:60,  w:340, h:330, label:'🏨 宿屋',     type:'inn'},
      // 右上: スキル屋(緑屋根・本)
      {x:870, y:140, w:280, h:280, label:'📖 スキル屋', type:'magic'},
      // 左下: アイテム屋(青屋根・縞テント・果物)
      {x:130, y:680, w:340, h:300, label:'🏪 アイテム屋', type:'shop'},
      // 右下: 鍛冶屋(赤屋根・炉・金床)
      {x:780, y:680, w:380, h:300, label:'🔨 鍛冶屋',   type:'blacksmith'},
    ],
    // 南ポータルへの通路(アーチ門・上の渡しブロックも含めて全部歩行可)
    // X方向: アーチの両柱の内側だけでは狭いので幅広めに(両端の壁の暗い色も覆う)
    // Y方向: アーチ上部(上の渡しブロック)も含めて Y=940〜1240 をカバー
    walkZones:[
      {x:520, y:940, w:210, h:300},  // 南ゲート全体 - アーチ天井・両柱の内側・通路下まで
    ],
    // ── NPC配置 ──
    npcs:[
      // 世界観を伝えるNPC(噴水左・スポーン地点近く)
      {
        id:'lore_npc',
        x:520, y:700,
        sprite:'npc_lore',
        name:'吟遊詩人ライラ',
        dialog:[
          'おや、見ない顔だね。旅人さんかい?',
          'この世界はかつて4つの種族…',
          '人・エルフ・妖魔・鬼が共に暮らす平和な大陸だった。',
          'けれど大いなる闇が現れ、各地に魔物があふれ出した。',
          'ここ「セントラル」は冒険者たちの拠点さ。',
          '東のゲートからST.1の草原へ、',
          '南のゲートから南街道や港町、桜の里へ。',
          'いずれは「桜の城」のダークイリュージョンを倒し、',
          'この大陸に平和を取り戻すのが君の役目かもね。',
          '健闘を祈るよ、旅人さん。',
        ],
      },
      // 転職場(ブレイズフォージ)への道案内NPC(南ゲート手前)
      {
        id:'job_guide',
        x:720, y:1080,
        sprite:'npc_jobguide',
        name:'冒険者アレン',
        dialog:[
          'よお、新人冒険者!まだ職業は決まってないんだろ?',
          'お前さん、まだノービスのままだろう?',
          '「ブレイズフォージ」って街で転職できるぜ。',
          '剣士・マジシャン・アーチャー・ボマー…',
          '4つの職業から好きなのを選べる。',
          '行き方は簡単だ:',
          'まずこの南ゲート(下の門)から「南街道」へ出る。',
          '南街道を抜けると「ブレイズフォージ」って溶岩の街がある。',
          'そこにある「✨ 転職場」で転職できるぞ。',
          'ポータル屋でも転送してくれるから、ゴールドがあるならそっちが早いな。',
          'ま、頑張れよ新人!',
        ],
      },
    ],
  },
  1:{name:'ST.1 草原',bgmKey:'east',mapImage:'map_st1',mapW:1254,mapH:1254,
    tiles:['tile_grass','tile_flower','tile_dark_forest'],tileWeights:[81,5,14],
    objects:[],objPos:[],
    enemies:[
      // ── 中央広場全域(約 x=200〜1100, y=200〜1100)に分散配置 ──
      // 北側エリア(y=250〜450)
      ['slime',  300, 280],['slime',  600, 280],['slime',  900, 320],
      ['bat',    450, 350],['bat',    750, 350],
      // 中央エリア(y=500〜750)・スポーン地点(150,627)から離れた位置
      ['goblin', 350, 550],['goblin', 700, 550],['goblin', 1000, 550],
      ['troll',  500, 650],['troll',  900, 650],
      ['bat',    400, 750],['bat',    750, 750],['bat',    900, 800],
      // 南側エリア(y=800〜1050)
      ['slime',  300, 900],['slime',  600, 900],['slime',  900, 900],
      ['goblin', 450, 1000],['goblin', 800, 1000],
      ['troll',  600, 1050],
    ],
    boss:{id:'boss1', x:627, y:627}, // 中央広場の真ん中(広いので戦いやすい)
    bossThreshold:15, // 敵を15体倒すとボス出現(1.5倍に引き上げ)
    portalTo:2,portalToLabel:'⛰ ST.2へ',portalToKey:'portal_st2',
    portalBack:0,portalBackLabel:'🏘 町へ',portalBackKey:'portal_town',
    // 入口=左の道(初回スポーン), 出口=右の道
    spawnX:150, spawnY:627,        // 初回入場(左道から)
    portalBackX:80, portalBackY:627, // 戻る(町へ): 左の道の端
    portalNextX:1174, portalNextY:627, // 進む(ST2へ): 右の道の端
    spawnFromBackX:150, spawnFromBackY:627,  // 町から戻ってきたら左から
    spawnFromNextX:1100, spawnFromNextY:627, // ST2から戻ってきたら右から
  },
  2:{name:'ST.2 流れる森',bgmKey:'east',mapImage:'map_st2',
    mapW:3072,mapH:2048, mapType:'st2', // 専用色判定
    tiles:[],tileWeights:[],
    objects:[],objPos:[],
    // 橋を強制歩行可(色判定で岩や水と誤判定されないように)
    // 新マップでは石橋が中央下にあり、横方向に長い
    walkZones:[
      {x:1100, y:1380, w:900, h:200},  // 中央下の石橋全体(無条件で通れる)
    ],
    enemies:[
      // ── 上部エリア(Y=200〜600) ──
      ['slime',  600, 350],['slime',  2400, 350],
      ['bat',    900, 500],['bat',    2100, 500],
      ['slime',  1500, 400],
      // ── 左中エリア(廃墟の柱付近・X=300〜800, Y=600〜1100) ──
      ['goblin', 450, 800],['goblin', 600, 1000],
      ['wolf',   350, 900],
      // ── 右中エリア(廃墟の柱付近・X=2200〜2700, Y=600〜1100) ──
      ['goblin', 2500, 800],['goblin', 2400, 1000],
      ['wolf',   2700, 900],
      // ── 中央エリア(川の両岸・Y=800〜1200) ──
      ['wolf',   1300, 1000],['wolf',   1700, 1000],
      ['skeleton', 1500, 1100],
      // ── 橋の手前(下中央・Y=1500〜1800) ──
      ['skeleton',  900, 1700],['skeleton', 2100, 1700],
      ['troll',  1200, 1800],['troll',  1800, 1800],
      ['wolf',   1500, 1900],
    ],
    // ボスは中央(石橋の少し上の広場)
    boss:{id:'boss2', x:1500, y:1000},
    bossThreshold:15,
    portalTo:3,portalToLabel:'🏖 ST.3へ',portalToKey:'portal_st3',
    portalBack:1,portalBackLabel:'🌿 ST.1へ',portalBackKey:'portal_st1',
    // 入口=左の道、出口=右の道(横長マップに合わせて両端へ)
    spawnX:200, spawnY:1024,                    // 初回入場(左端から200px内側)
    portalBackX:50, portalBackY:1024,           // 左端の道(ST.1へ)
    portalNextX:3020, portalNextY:1024,         // 右端の道(ST.3へ)
    spawnFromBackX:200, spawnFromBackY:1024,    // ST.1から戻ってきたら左から
    spawnFromNextX:2870, spawnFromNextY:1024,   // ST.3から戻ってきたら右端から200px内側
  },
  3:{name:'ST.3 海岸',bgmKey:'east',mapImage:'map_st3',mapW:1448,mapH:1086,tiles:['tile_sand_beach','tile_sea','tile_oasis_grass'],tileWeights:[60,20,20],objects:[],objPos:[],enemies:[['slime',300,260],['slime',450,540],['slime',700,350],['bat',550,380],['bat',700,200],['wolf',450,820],['wolf',290,720],['crab',900,350],['crab',1050,600],['crab',950,800],['crab',1190,400],['crab',1150,700],['seal',1100,500],['seal',1200,600],['seal',1050,950]],boss:{id:'boss3',x:700,y:500},bossThreshold:18,portalTo:4,portalToLabel:'🏜 ST.4へ',portalToKey:'portal_st4',portalBack:2,portalBackLabel:'⛰ ST.2へ',portalBackKey:'portal_st2',spawnX:140,spawnY:540,portalNextX:1400,portalNextY:540,portalBackX:60,portalBackY:540},
  4:{name:'ST.4 海と砂漠の境',bgmKey:'desert',mapImage:'map_st4',mapW:1448,mapH:1086,tiles:['tile_sand_desert','tile_oasis_grass','tile_sand_beach'],tileWeights:[70,15,15],objects:[],objPos:[],enemies:[['crab',280,420],['crab',250,800],['seal',220,800],['wolf',400,400],['wolf',380,670],['scorpion',800,300],['scorpion',900,600],['scorpion',1080,580],['sandworm',1000,400],['sandworm',1200,300],['sandworm',900,800],['sandman',1100,200],['sandman',800,900],['sandman',1300,600]],boss:{id:'boss4',x:1100,y:500},bossThreshold:18,portalTo:5,portalToLabel:'🏜 ST.5へ',portalToKey:'portal_st5',portalBack:3,portalBackLabel:'🏖 ST.3へ',portalBackKey:'portal_st3',spawnX:180,spawnY:540,portalNextX:1400,portalNextY:540,portalBackX:60,portalBackY:540},
  5:{name:'ST.5 砂漠の集落跡',bgmKey:'desert',mapImage:'map_st5',mapW:1448,mapH:1086,tiles:['tile_sand_desert','tile_sand_beach','tile_oasis_grass'],tileWeights:[80,15,5],objects:[],objPos:[],enemies:[['scorpion',300,300],['scorpion',500,700],['scorpion',800,800],['sandworm',200,800],['sandworm',280,280],['sandworm',1200,700],['mummy',400,200],['mummy',600,900],['mummy',1100,300],['mummy',780,480],['bat',700,250],['bat',1000,900],['sandman',200,500],['sandman',1100,700],['sandman',900,290]],boss:{id:'scorpion_king',x:1000,y:500},bossThreshold:14,portalTo:6,portalToLabel:'💀 ST.6へ',portalToKey:'portal_st4',portalBack:4,portalBackLabel:'🏖 ST.4へ',portalBackKey:'portal_st3',spawnX:180,spawnY:540,portalNextX:650,portalNextY:1030,portalBackX:60,portalBackY:540,spawnFromNextX:650,spawnFromNextY:900,
    // 東側にゴブリン集落への分岐ポータル(踏むとダイアログなしで即遷移)
    sidePortal:{x:1400, y:540, to:20, returnX:200, returnY:540},
  },
  6:{name:'ST.6 砂漠の果て',bgmKey:'desert',mapImage:'map_st6',mapW:1448,mapH:1086,tiles:['tile_sand_desert','tile_sand_beach','tile_oasis_grass'],tileWeights:[80,15,5],objects:[],objPos:[],enemies:[['skeleton',400,300],['skeleton',600,500],['skeleton',900,700],['mummy',300,600],['mummy',800,300],['mummy',1100,500],['scorpion',500,700],['scorpion',880,680],['scorpion',1200,300],['sandworm',300,400],['sandworm',900,400],['sandworm',1100,700],['bone_dragon',600,200],['bone_dragon',1000,600]],boss:{id:'tomb_guardian',x:290,y:420},bossThreshold:16,portalTo:7,portalToLabel:'⛰ ST.7へ',portalToKey:'portal_st4',portalBack:5,portalBackLabel:'🏜 ST.5へ',portalBackKey:'portal_st4',spawnX:650,spawnY:200,portalNextX:650,portalNextY:1000,portalBackX:650,portalBackY:50,spawnFromBackX:650,spawnFromBackY:200,spawnFromNextX:650,spawnFromNextY:860,dungeonGate:{x:251,y:400,to:10,label:'DUN.1 忘れられし地下迷宮'}},
  7:{name:'ST.7 天空への路',bgmKey:'sky',
    mapImage:'map_st7', mapType:'sky', mapW:949, mapH:1658,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    // 入口=上の木製鳥居(ST6から来る) / 出口=下の青魔法門(ST8へ)
    enemies:[
      // 上広場(入口・鳥居近辺)
      ['hornet',400,280],['hornet',550,280],['cloud_monkey',450,340],
      // 紋章広場(中央・y=600〜900)
      ['bear',320,620],['bear',620,620],['beetle',420,700],['beetle',540,700],
      ['hornet',300,850],['hornet',650,850],
      // 中段(y=900〜1150)
      ['scorpion_queen',320,1000],['scorpion_queen',620,1000],
      ['dragon',474,950],
      // 下段(y=1150〜1400 出口手前)
      ['beetle',350,1200],['beetle',580,1200],
      ['hornet',400,1300],['hornet',540,1300],
      ['bear',474,1400],
    ],
    boss:{id:'mistress',x:474,y:780},
    bossThreshold:13,
    portalTo:null, portalToLabel:'',
    portalBack:6,portalBackLabel:'💀 ST.6へ',portalBackKey:'portal_st4',
    // 下の青魔法門はダイアログ式(magicGate)で ST.8 へ
    // magicGate: {x, y, to, label, returnX, returnY} 行き先ステージの到着位置も指定
    magicGate:{x:474, y:1380, to:8, label:'☁ 天空の島々へ', returnX:1500, returnY:1800},
    // 入口=上の鳥居(portalBack)、出口=下の青魔法門(magicGate)
    spawnX:474,spawnY:280,           // 初回入場は上の鳥居すぐ下から
    portalBackX:474, portalBackY:150, // 上部の木製鳥居(ST6へ戻る)
    spawnFromBackX:474, spawnFromBackY:280,  // ST6から戻ってきたら上から
    spawnFromNextX:474, spawnFromNextY:1280, // 天空から戻ってきたら下(青ゲートより十分上)
  },
  8:{name:'ST.8 天空の島々',bgmKey:'sky',
    mapImage:'map_st8', mapType:'sky', mapW:3072, mapH:2048,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    // 入口は画面中央下(前マップST7の上鳥居から繋がる青ポータル)
    // ボス(雷神)は右上の青ドーム神殿エリア
    enemies:[
      // ── 中央大広場(コンパス模様周辺・X=1400〜1700, Y=700〜900) ──
      ['cloud_monkey',1300,800],['cloud_monkey',1700,800],['cloud_monkey',1500,650],
      ['treant',1350,900],['treant',1650,900],
      // ── 左上エリア(噴水・X=350〜700, Y=200〜400) ──
      ['cloud_monkey',450,300],['cloud_monkey',650,300],
      ['giant',550,400],['rock_golem',400,450],
      // ── 上端アーチ門周辺(X=800〜1100, Y=100〜300) ──
      ['cloud_monkey',900,250],['treant',1050,350],
      // ── 左中(魔法陣エリア・X=200〜500, Y=900〜1300) ──
      ['treant',350,1100],['cloud_monkey',250,1000],['rock_golem',450,1250],
      // ── 中段左の島(X=600〜900, Y=1100〜1400) ──
      ['cloud_monkey',700,1200],['giant',800,1350],
      // ── 中段右の島(X=2100〜2400, Y=1100〜1400) ──
      ['giant',2200,1200],['rock_golem',2350,1350],['cloud_monkey',2100,1300],
      // ── 右中の泉(X=2700〜2900, Y=400〜650) ──
      ['cloud_monkey',2750,500],['treant',2850,600],
      // ── 右上 青ドーム神殿前(ボス手前の守り・X=2400〜2700, Y=200〜400) ──
      ['rock_golem',2500,250],['giant',2600,400],['treant',2400,200],
      // ── 入口手前(下中央・X=1300〜1700, Y=1500〜1700) ──
      ['cloud_monkey',1400,1500],['giant',1600,1550],
    ],
    boss:{id:'thunder_god',x:2700,y:200},  // 右上の青ドーム神殿
    bossThreshold:14,
    portalTo:null,portalToLabel:'',
    portalBack:null,portalBackLabel:'',
    // 下中央の青魔法門(ダイアログ式) → ST.7 に戻る
    magicGate:{x:1500, y:1750, to:7, label:'⛰ 地上への路へ戻る', returnX:474, returnY:1280},
    // 左上アーチ門 → ST.9 虹の道(rainbow-1)
    portalAlt:{x:689, y:229, to:9, label:'🌈 虹の道へ'},
    // スポーン(ST.7 から青ゲートを抜けてきた時) = 下中央の青魔法門の少し上(門前)
    spawnX:1500, spawnY:1800,
    spawnFromBackX:1500, spawnFromBackY:1800,
  },
  // ── ST.9 虹の道(rainbow-1)── ST.8 左上ゲートから繋がる空中ステージ
  9:{name:'ST.9 虹の道',bgmKey:'sky',
    mapImage:'map_rainbow1', mapType:'sky', mapW:1881, mapH:1881,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    // 敵: 中央の石畳の道に沿って下→上に配置(計25体)
    enemies:[
      // ── 下段(入口付近・Y=1500〜1650) ──
      ['cloud_monkey', 850, 1550], ['cloud_monkey', 1030, 1550],
      ['treant',       760, 1450], ['treant',      1120, 1450],
      // ── 中下段(Y=1150〜1350) ──
      ['cloud_monkey', 870, 1300], ['cloud_monkey', 1010, 1300],
      ['rock_golem',   780, 1200], ['giant',       1100, 1200],
      // ── 中段(Y=850〜1050) ──
      ['treant',       820, 950],  ['treant',      1060, 950],
      ['cloud_monkey', 920, 850],  ['giant',        940, 1000],
      ['rock_golem',   790, 880],
      // ── 中上段(Y=550〜750) ──
      ['cloud_monkey', 860, 700],  ['cloud_monkey',1020, 700],
      ['giant',        780, 600],  ['rock_golem',  1100, 600],
      // ── 上段(門番手前・Y=350〜500) ──
      ['treant',       820, 450],  ['treant',      1060, 450],
      ['giant',        890, 380],  ['rock_golem',   990, 380],
      ['cloud_monkey', 760, 500],  ['cloud_monkey',1120, 500],
      ['rock_golem',   940, 430],
    ],
    // 門番: 虹のゲート手前の上端中央(幻惑の女王スプライト流用)
    boss:{id:'mistress', x:940, y:280},
    bossThreshold:20,
    // 門番撃破後に上端ゲート開放 → ST.13 虹の道 II
    dungeonGate:{x:940, y:210, to:13, label:'🌈 虹の道 II'},
    portalTo:null, portalToLabel:'',
    // 戻るポータル: 下端(ST.8 から来た入口)
    portalBack:8, portalBackLabel:'☁ ST.8 天空の島々へ', portalBackKey:'portal_st8',
    portalBackX:940, portalBackY:1850,
    // ST.8 に戻った時のスポーン位置 = ST.8 アーチ門のすぐ下(portalAlt に即再侵入しない距離)
    portalBackSpawnX:689, portalBackSpawnY:380,
    // ST.8 から portalAlt 経由で来た時のスポーン位置 = 下端中央(rainbow-1 の下端)
    spawnX:940, spawnY:1720,
    spawnFromBackX:940, spawnFromBackY:1720,
    // ST.13 から戻ってきた時のスポーン位置 = 上端ゲート下(portalBackSpawn 経由で受け取る)
    // ※ ST.13 の portalBackSpawnX/Y で magicReturnX/Y として渡される
  },
  // ── DUN1 ダンジョン(隠し/高難度) ──
  10:{name:'DUN.1 忘れられし地下迷宮',bgmKey:'dungeon1',mapImage:'map_dun1',mapType:'dungeon',mapW:1896,mapH:3318,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // ── 上部広間: 左右の円形ホール(Y=300〜700) ──
      // 左ホール
      ['zombie',   500, 400],['zombie',   400, 600],
      ['lich',     350, 500],
      ['dark_elf', 600, 350],['dark_elf', 550, 700],
      // 右ホール
      ['zombie',   1400, 400],['zombie',   1500, 600],
      ['lich',     1550, 500],
      ['dark_elf', 1300, 350],['dark_elf', 1350, 700],
      // ── 中央縦通路: 上部(Y=300〜900) ──
      ['zombie',   950, 500],['lich',     950, 800],
      // ── 中段の左右部屋(Y=900〜1500) ──
      // 左
      ['zombie',   400, 1100],['zombie',   500, 1400],
      ['lich',     350, 1300],
      ['dark_elf', 600, 1200],
      // 右
      ['zombie',   1500, 1100],['zombie',   1400, 1400],
      ['lich',     1550, 1300],
      ['dark_elf', 1300, 1200],
      // ── 中央広間(Y=1100〜1600) ──
      ['zombie',   950, 1200],['zombie',   850, 1450],['zombie',   1050, 1450],
      ['dark_elf', 950, 1350],
      // ── 中央祭壇(八角形・Y=1700〜2100) ──
      ['lich',     950, 1900],
      ['zombie',   800, 2000],['zombie',   1100, 2000],
      ['dark_elf', 700, 1850],['dark_elf', 1200, 1850],
      // ── 下段左右の小部屋(Y=2100〜2500) ──
      // 左
      ['zombie',   400, 2300],['lich',     500, 2200],
      ['dark_elf', 350, 2400],
      // 右
      ['zombie',   1500, 2300],['lich',     1400, 2200],
      ['dark_elf', 1550, 2400],
      // ── 髑髏祭壇手前(赤十字通路・Y=2500〜2800) ──
      ['zombie',   700, 2600],['zombie',   1200, 2600],
      ['lich',     950, 2550],
      ['dark_elf', 800, 2750],['dark_elf', 1100, 2750],
    ],
    boss:{id:'dark_illusion',x:950,y:2900},  // 髑髏祭壇付近
    bossThreshold:18,
    portalTo:null,portalToLabel:'',portalToKey:'portal_st4',
    portalBack:6,portalBackLabel:'💀 ST.6へ',portalBackKey:'portal_st4',
    // DUN1 から ST6 に戻る時: ST6の骨(290,420)の近くにスポーン
    portalBackSpawnX:290, portalBackSpawnY:460,
    // 入口=上部中央のアーチ門
    spawnX:950, spawnY:250,
    portalBackX:950, portalBackY:120,
    spawnFromBackX:950, spawnFromBackY:250,
    // アーチ門の通路を強制歩行可
    walkZones:[
      {x:910, y:80, w:80, h:200},  // 上部入口アーチ門の通路
    ],
  },
  // ── ST.20 ゴブリンの集落 (ST5から東に行くと到着) ──
  20:{name:'ST.20 ゴブリンの集落', bgmKey:'south', mapImage:'map_st20',
    mapType:'goblin_village', mapW:1254, mapH:1254,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // ── 周囲のゴブリン雑魚たち(村のテント周辺・集落感) ──
      // 北(上)エリア: 普通ゴブリン+アーチャー
      ['goblin',        400, 400],['goblin',        850, 400],
      ['goblin_archer', 627, 400],
      // 中段エリア: 各種混成
      ['goblin',        300, 627],['goblin_axe',    900, 627],
      // 南(下)エリア: アックス+アーチャー
      ['goblin',        400, 850],['goblin',        850, 850],
      ['goblin_axe',    627, 850],
      ['goblin_archer', 300, 800],['goblin_archer', 950, 800],
      // 拡張(集落の活気)
      ['goblin',        450, 500],['goblin',        800, 500],
      ['goblin_axe',    500, 350],
    ],
    // ボスは中央の焚き火脇(中央 627,627 は壁・焚き火跡)
    boss:{id:'goblin_leader', x:750, y:627},
    bossThreshold:8,
    // 戻る = ST5(砂漠の集落跡)へ、進む(東) = town2 砂漠の街へ
    portalTo:25, portalToLabel:'🏛 砂漠の街へ', portalToKey:'portal_st5',
    portalBack:5, portalBackLabel:'🏛 ST.5へ', portalBackKey:'portal_st5',
    // 入口=西の道、出口=東の道
    spawnX:200, spawnY:627,
    portalBackX:80, portalBackY:627,
    portalNextX:1180, portalNextY:627,
    spawnFromBackX:200, spawnFromBackY:627,
    spawnFromNextX:1060, spawnFromNextY:627,
  },
  // ── ST.21 ブレイズフォージ(火薬都市・ボマー進化の聖地) ──
  21:{name:'🔥 ブレイズフォージ', bgmKey:'blaze_forge', mapImage:'map_blaze',
    mapType:'blaze', mapW:1254, mapH:1254,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[], // 町なので敵なし
    boss:null, bossThreshold:9999,
    portalTo:null, portalToLabel:'',
    // 西の橋から → south_st3(鉱山の街道) に戻る
    portalBack:24, portalBackLabel:'⛏ 鉱山の街道へ', portalBackKey:'portal_st1',
    // 入口=西の橋(画像から正確な位置 X=107, Y=528)
    spawnX:220, spawnY:528,
    portalBackX:107, portalBackY:528,
    spawnFromBackX:220, spawnFromBackY:528,
    spawnFromNextX:220, spawnFromNextY:528,
    // south_st3から東のポータル経由で来た時もちゃんと離れた位置にスポーン
    spawnFromEastX:220, spawnFromEastY:528,
    // ── 5つの建物 (ChatGPTで生成された画像の建物位置に合わせる) ──
    // 建物の type 別動作: inn/shop/blacksmith/guild/jobchange
    // x,y は左上座標, w,h はサイズ. 入口判定はsetSizeで建物下半分(歩行可能エリア)
    buildings:[
      // 左上: 宿屋(赤い屋根・煙突・ビアマグ看板)
      {x:130, y:130, w:340, h:240, label:'🏨 宿屋',     type:'inn'},
      // 右上: ギルド(時計塔・青い水晶・テレポ円)= 転送屋
      {x:740, y:80,  w:380, h:330, label:'⚔ ギルド(転送屋)', type:'guild'},
      // 左中: 鍛冶屋(炉・金床・煙突)
      {x:120, y:520, w:280, h:230, label:'🔨 鍛冶屋',   type:'blacksmith'},
      // 右中: ショップ(火薬商・赤屋根・樽)
      {x:780, y:520, w:330, h:240, label:'🏪 ショップ', type:'shop'},
      // 下中央: 転職場(寺院・4つの旗・金の炎エンブレム)
      {x:430, y:790, w:380, h:340, label:'✨ 転職場',   type:'jobchange'},
    ],
    // DUN.2 炭鉱1F へのポータル(セントラルマップ上部 X=620, Y=115)
    portalAlt:{x:620, y:115, to:11, label:'⛏ DUN.2 炭鉱'},
    // ── NPC配置 ──
    npcs:[
      // 武器マスター(鍛冶屋の前) - 覚醒武器の情報
      {
        id:'weapon_master',
        x:260, y:780,
        sprite:'npc_weapon_master',
        name:'武器マスター ガイア',
        dialog:[
          'よお、新人冒険者!',
          'この街は「ブレイズフォージ」。',
          '炎と鋼の都だ。',
          '鍛冶屋では装備を強化できるし…',
          'いつかは「覚醒武器」が手に入る。',
          '剣士なら「妖刀 村雨」、',
          'マジシャンなら「ダークイリュージョン杖」、',
          'アーチャーなら「精霊の弓」、',
          'ボマーなら「ヘヴィカスタマイズ」だ。',
          'これら覚醒武器を装備すると、',
          '右下に覚醒ボタンが現れる。',
          'ゲージを溜めて発動すれば3分間別人になれるぞ!',
          'ただし種類ごとにデメリットもあるから注意な。',
        ],
      },
      // 冒険者の先輩(ショップ前) - 攻略のコツ
      {
        id:'adventurer_senior',
        x:950, y:780,
        sprite:'npc_senior',
        name:'先輩冒険者リーン',
        dialog:[
          'おっ、新しい顔だな!',
          'この街にようこそ。冒険のコツを教えてやろう。',
          'まず転職場で職業を選ぶことだ。',
          '剣士は接近戦、マジシャンは魔法、',
          'アーチャーは遠距離、ボマーは爆撃が得意さ。',
          '装備は店で買うか、敵からドロップで集める。',
          '鍛冶屋では装備を+10まで強化できるぞ。',
          'スキルポイントは敵を倒すと貯まる「JOB EXP」で得られる。',
          'メニューの「スキル」タブで振り分けるんだ。',
          '北側の上端に「DUN.2 炭鉱」へのポータルがある。',
          'ミストレスっていう女王蜂のボスがいるから気をつけろ!',
          '健闘を祈るぜ。',
        ],
      },
    ],
  },
  // ── 南の街道(セントラルの南から行ける) ──
  22:{name:'🌳 南の街道', bgmKey:'south', mapImage:'map_south_st1',
    mapType:'south_st1', mapW:1254, mapH:1254,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // スライム・サクラ・サイダーがちらほら配置
      ['slime',  300, 350],['slime',  900, 350],
      ['sakura', 250, 700],['sakura', 950, 600],['sakura', 600, 750],
      ['cider',  400, 950],['cider',  850, 1000],
      ['slime',  600, 900],['sakura', 200, 500],['cider', 1000, 500],
      ['slime',  500, 280],['sakura', 750, 850],['cider', 350, 850],
    ],
    boss:null, bossThreshold:9999, // ボスなし
    // セントラルへ戻る(北のアーチ)
    portalTo:null, portalToLabel:'',
    portalBack:0, portalBackLabel:'🏘 セントラルへ戻る', portalBackKey:'portal_town',
    returnFromSouth:true,  // 戻り先(セントラル)の南端にスポーン
    // 入口=北のゲートから入ってくる
    spawnX:625, spawnY:200,
    portalBackX:625, portalBackY:80,
    spawnFromBackX:625, spawnFromBackY:200,
    spawnFromNextX:625, spawnFromNextY:200,
    // 南方向ポータル → 街道2(south_st2)
    portalSouth:23, portalSouthLabel:'🌲 さらに南へ', portalSouthKey:'portal_st1',
    portalSouthX:625, portalSouthY:1180,
    spawnFromSouthX:625, spawnFromSouthY:1060,
  },
  // ── 南の街道2(south_st1からさらに南) ──
  23:{name:'🌲 南の街道(続)', bgmKey:'south', mapImage:'map_south_st2',
    mapType:'south_st2', mapW:941, mapH:1672,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // スライム・サクラ・サイダー(south_st1と同様)
      ['slime',  280, 250],['slime',  650, 350],
      ['sakura', 200, 600],['sakura', 700, 700],['sakura', 470, 950],
      ['cider',  300, 1100],['cider',  650, 1200],
      ['slime',  470, 1350],['sakura', 250, 1450],['cider', 700, 1500],
      // 追加: ゴブリン少数(やや強敵)
      ['goblin', 470, 500],['goblin', 350, 850],['goblin', 600, 1300],
    ],
    boss:null, bossThreshold:9999,
    // 北へ戻る = south_st1
    portalTo:null, portalToLabel:'',
    portalBack:22, portalBackLabel:'🌳 街道へ戻る', portalBackKey:'portal_st1',
    returnFromSouth:true,  // 戻り先(south_st1)の南端にスポーン
    // 入口=北の道から入ってくる
    spawnX:470, spawnY:200,
    portalBackX:470, portalBackY:80,
    spawnFromBackX:470, spawnFromBackY:200,
    spawnFromNextX:470, spawnFromNextY:200,
    spawnFromSouthX:470, spawnFromSouthY:200,
    // 東方向ポータル(右上の橋付近) → south_st3
    portalEast:24, portalEastLabel:'⛏ 鉱山の街道へ', portalEastKey:'portal_st1',
    portalEastX:870, portalEastY:480,  // 右の橋付近
    spawnFromWestX:780, spawnFromWestY:480,  // south_st3 から戻ってきた時のスポーン
    // 南方向ポータル(下端の道) → south_st4(海岸エリア)
    portalSouth:26, portalSouthLabel:'🏖 海岸の街道へ', portalSouthKey:'portal_st1',
    portalSouthX:470, portalSouthY:1600,  // 下端の道
    spawnFromSouth2X:464, spawnFromSouth2Y:1496,  // south_st4(ST.26) から戻ってきた時(指定座標)
    // 橋エリアは強制歩行可(色判定で岩や水と誤判定されないように)
    walkZones:[
      {x:760, y:430, w:180, h:140},  // 右上の橋 + 周囲の通路を覆う矩形
    ],
  },
  // ── 南の街道3(south_st2の右の橋から東へ) ──
  24:{name:'⛏ 鉱山の街道', bgmKey:'south', mapImage:'map_south_st3',
    mapType:'south_st3', mapW:1491, mapH:1055,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // サクラ・サイダー(草原エリア=西側)
      ['sakura', 200, 300],['sakura', 350, 600],['sakura', 280, 850],
      ['cider',  450, 400],['cider',  300, 950],['cider',  500, 750],
      // ゴブリン(中央広場〜東側)
      ['goblin',       700, 350],['goblin',       650, 750],
      // ゴブリンアーチャー(東の鉱山入口前=遠距離)
      ['goblin_archer',1100, 200],['goblin_archer',1050, 700],
      // ゴブリンアックス(東の鉱山入口=強敵)
      ['goblin_axe',   1280, 400],['goblin_axe',   1200, 850],
    ],
    boss:null, bossThreshold:9999,
    // 西へ戻る = south_st2
    portalTo:null, portalToLabel:'',
    portalBack:23, portalBackLabel:'🌲 街道へ戻る', portalBackKey:'portal_st1',
    returnFromWest:true,  // 戻り先(south_st2)の橋付近(東)にスポーン
    // 入口=西側の道から(south_st2 の橋から)
    spawnX:200, spawnY:520,
    portalBackX:60, portalBackY:520,
    spawnFromBackX:200, spawnFromBackY:520,
    // town1(ブレイズフォージ)から戻ってきた時 = 東側ポータル付近にスポーン
    spawnFromNextX:1300, spawnFromNextY:520,
    spawnFromEastX:200, spawnFromEastY:520,  // 東(town1)から戻ってきた時のスポーン位置
    // 東方向ポータル(右端の鉱山ゲート付近) → town1(ブレイズフォージ)
    portalEast:21, portalEastLabel:'🔥 ブレイズフォージへ', portalEastKey:'portal_st1',
    portalEastX:1430, portalEastY:520,  // 右端
    spawnFromWestX:1300, spawnFromWestY:520,  // ブレイズフォージから戻ってきた時
  },
  // ── 砂漠の街 town2 (ゴブリン集落の東) ──
  25:{name:'🏛 砂漠の街', bgmKey:'desert_town', mapImage:'map_town2',
    mapType:'town2', mapW:1254, mapH:1254,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[], // 町なので敵なし
    boss:null, bossThreshold:9999,
    portalTo:null, portalToLabel:'',
    // 西へ戻る = ゴブリン集落
    portalBack:20, portalBackLabel:'🪓 ゴブリンの集落へ', portalBackKey:'portal_st4',
    // 入口=西から(マップ画像の左端)
    spawnX:200, spawnY:627,
    portalBackX:80, portalBackY:627,
    spawnFromBackX:200, spawnFromBackY:627,
    spawnFromNextX:200, spawnFromNextY:627,
    // ── 5つの建物 (画像のアイコンに合わせて配置) ──
    buildings:[
      // 上左: アイテム屋(赤茶ドーム・ポーション瓶看板)
      {x:300, y:130, w:280, h:280, label:'🏪 アイテム屋', type:'shop'},
      // 上中央: ポータル屋(青ドーム・宝石看板=テレポ)
      {x:530, y:80,  w:300, h:330, label:'✨ ポータル屋', type:'guild'},
      // 上右: ショップ(紫ドーム・宝石看板=雑貨)
      {x:830, y:130, w:280, h:280, label:'📖 スキル屋', type:'magic'},
      // 左中: スキル屋(紫ドーム単独・本)
      {x:240, y:560, w:240, h:280, label:'🪄 魔法書屋', type:'magic'},
      // 右中: 鍛冶屋(石造の家・煙突・炉)
      {x:830, y:540, w:300, h:300, label:'🔨 鍛冶屋', type:'blacksmith'},
    ],
    // ── NPC配置 ──
    npcs:[
      // 詩人(街の中央広場) - ボスと砂漠の伝説
      {
        id:'desert_poet',
        x:627, y:450,
        sprite:'npc_poet',
        name:'砂漠の詩人セイラ',
        dialog:[
          'ようこそ、砂漠の街へ。旅人さん。',
          'ここは砂漠の中心、交易の拠点。',
          '北の「集落跡」には黄金のサソリ…',
          '「スコーピオンキング」が棲んでいる。',
          'さらに東の「砂漠の果て」には',
          '古代の墓守「墓守の王」がいる。',
          'どちらも強敵じゃ。装備を整えてから挑むべきじゃろう。',
          '砂漠は乾燥が厳しいゆえ、',
          'ポーションをたくさん持って行きなさい。',
          'そして…',
          '砂漠の奥には「DUN.1 忘れられし地下迷宮」へ通じる',
          '神秘の門があるという伝承もあるんじゃ。',
        ],
      },
      // 商人NPC(アイテム屋前) - ショップ・スキル屋の使い方
      {
        id:'merchant_assistant',
        x:440, y:420,
        sprite:'npc_merchant',
        name:'商人見習い ダリル',
        dialog:[
          'いらっしゃい!砂漠の街は商人天国だよ。',
          '👜 アイテム屋では回復ポーション類、',
          '✨ ポータル屋では各地へ転送サービス、',
          '📖 スキル屋では特殊な「書物」を売っとる。',
          '書物は特定スキルを習得できる貴重品さ。',
          '剣士なら「バーサクの書」で攻撃速度UP、',
          'マジシャンなら「メテオームの書」で隕石が呼べる、',
          'アーチャーなら「ブーストアタックの書」で多段ヒット、',
          'ボマーなら「ボマーパワーの書」で攻撃範囲UP!',
          'お金が貯まったら買ってみるといい。',
          'ちなみに北の「集落跡」の宝箱モンスターはお金持ちらしいぜ。',
        ],
      },
    ],
  },
  // ── 南の街道4 (south_st2の南から繋がる海岸エリア) ──
  26:{name:'🏖 海岸の街道', bgmKey:'south', mapImage:'map_south_st4',
    mapType:'south_st4', mapW:2048, mapH:2048,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // ── 上部エリア(入口アーチ周辺・Y=300〜700) ──
      ['sakura', 700, 400],['sakura', 1100, 500],
      ['wisp',   600, 600],['wisp',   1200, 500],
      ['slime',  900, 350],
      // ── 中段エリア(中央広場・道標周辺・Y=700〜1300) ──
      ['cider',  500, 900],['cider',  1500, 1000],
      ['wisp',   1000, 800],
      ['sakura', 1300, 1100],['sakura', 700, 1200],
      ['goblin', 1500, 700],['goblin', 800, 1150],
      // ── 海岸エリア(左下・ビーチ周辺・Y=1100〜1700) ──
      ['beach_crab', 250, 1300],['beach_crab', 350, 1500],
      ['beach_crab', 200, 1700],['beach_crab', 450, 1600],
      ['cider',  500, 1500],['cider',  600, 1700],
      // ── 右下エリア(円形祭壇周辺・Y=1200〜1600) ──
      ['wisp',   1400, 1400],['wisp',   1700, 1300],
      ['goblin', 1600, 1500],
    ],
    boss:null, bossThreshold:9999,
    portalTo:null, portalToLabel:'',
    // 北へ戻る = south_st2 (上端のアーチ門から) ※ ST.23のことだが内部はsouth_st2と呼んでいる
    portalBack:23, portalBackLabel:'🌲 南の街道(続)へ戻る', portalBackKey:'portal_st1',
    // 入口=上端のアーチ門 (新座標)
    spawnX:852, spawnY:180,                  // 入口アーチ通り抜けた直後(ポータルの少し下)
    portalBackX:852, portalBackY:53,         // 上端のアーチ門(戻り・新座標)
    spawnFromBackX:852, spawnFromBackY:180,  // south_st2 から来た時
    // 南方向ポータル(下端中央の橋) → town_minato 港町
    portalSouth:27, portalSouthLabel:'⛵ 港町へ', portalSouthKey:'portal_st1',
    portalSouthX:1240, portalSouthY:1857,      // 下端中央の橋への道
    spawnFromSouth2X:1240, spawnFromSouth2Y:1700, // town_minatoから戻ってきた時
    // walkZones: アーチ門の通路を強制歩行可(新ポータル位置に合わせ移動)
    walkZones:[
      {x:802, y:30, w:100, h:220},  // 上端アーチ通路(X:852中心の縦長エリア)
    ],
  },
  // ── 港町ミナト (south_st4 の南橋から繋がる和風港町) ──
  27:{name:'⛵ 港町ミナト', bgmKey:'central', mapImage:'map_town_minato',
    mapType:'town_minato', mapW:2048, mapH:2048,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[], // 町なので敵なし
    boss:null, bossThreshold:9999,
    portalTo:null, portalToLabel:'',
    // 北へ戻る = south_st4(海岸の街道)
    portalBack:26, portalBackLabel:'🏖 海岸の街道へ戻る', portalBackKey:'portal_st1',
    returnFromSouth:true,  // south_st4の南端(spawnFromSouth2)に着地
    // 入口=上部中央の和風門(画像のY≈200付近)
    spawnX:1269, spawnY:421,                  // south_st4から船で来た着地点
    portalBackX:1266, portalBackY:311,        // 上部の和風門(戻り)
    spawnFromBackX:1269, spawnFromBackY:421,  // south_st4 から来た時
    spawnFromNextX:1269, spawnFromNextY:421,
    spawnFromSouthX:1269, spawnFromSouthY:421,
    // walkZones: 入口門の通路を強制歩行可
    walkZones:[
      {x:1200, y:240, w:140, h:220},  // 上部の入口門通路
    ],
    // NPC配置
    npcs:[
      {
        id:'sailor',
        x:430, y:952,
        sprite:'npc_sakura5',
        name:'船頭',
        type:'ferry',          // 船で別マップに連れて行くNPC
        price:500,             // 船賃 500G
        destStage:28,          // 移動先 = sakura_gate (桜の里)
        destLabel:'桜の里',    // ダイアログに表示
        dialog:[
          'おっ、旅の人かい?',
          'よぉ来たな、この港町へ。',
          'ワシは船頭をしとる。',
          '船賃 {price}G で「桜の里」まで連れて行くぞ。',
          '桜咲く美しい山里じゃ。どうじゃ、乗っていくかい?'
        ],
      },
      // 酒場の主 - 桜の城の話
      {
        id:'tavern_master',
        x:1380, y:900,
        sprite:'npc_tavern',
        name:'酒場の主バルト',
        dialog:[
          'お、見ない顔だな。一杯やってくか?',
          'ワシは酒場の主。',
          '港町には色んな噂話が流れてくるんだ。',
          '最近の噂じゃ、東の海の向こうの「桜の里」が…',
          'なにやら不穏な動きがあるらしい。',
          '里の北の山には「桜の城」がそびえ立ち、',
          'そこには闇の魔女「ダークイリュージョン」が…',
          '里に害を及ぼそうとしているとか。',
          '勇者なら、船頭ジムに頼んで桜の里へ渡るといい。',
          '500Gで渡してくれるはずだ。',
          'まあ、桜の里に着いたら、',
          '里の入口の桜の木を眺めながら一息つくのもいいぞ!',
        ],
      },
    ],
  },
  // ── 桜の里(sakura_gate) - 港町ミナトの船で行ける和風の隠れ里 ──
  28:{name:'🌸 桜の里', bgmKey:'sakura_load', mapImage:'map_sakura_gate',
    mapType:'sakura_gate', mapW:941, mapH:1672,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[], // 平和な里なので敵なし
    boss:null, bossThreshold:9999,
    // 戻り = 港町ミナト
    portalBack:27, portalBackLabel:'⛵ 港町ミナトへ戻る', portalBackKey:'portal_st1',
    // 入口=下端中央の橋(船で到着する場所)
    spawnX:470, spawnY:1500,                  // 橋を上がった直後
    portalBackX:470, portalBackY:1620,        // 下端中央の橋(戻り)
    spawnFromBackX:470, spawnFromBackY:1500,  // 港町から来た時
    spawnFromNextX:466, spawnFromNextY:430,   // sakura_dun1 から戻った時(門の少し下・ポータルと重ならない位置)
    spawnFromSouthX:470, spawnFromSouthY:1500,
    // 上端の門 → sakura_dun1(桜の城) へのポータル
    portalTo:29, portalToLabel:'🏯 桜の城へ', portalToKey:'portal_st1',
    portalNextX:466, portalNextY:302,             // 上端の門(調整済み)
    // 帰路用の船頭NPC(下端の橋付近)
    npcs:[
      {
        id:'sailor_return',
        x:470, y:1450,
        sprite:'npc_sakura5',
        name:'船頭',
        type:'ferry',          // 船で別マップに連れて行くNPC
        price:0,               // 帰りは無料
        destStage:27,          // 港町ミナト
        destLabel:'港町ミナト',
        destX:400, destY:1038, // 港町ミナトの到着位置
        dialog:[
          'おお、戻りかい?',
          '港町まで送るぞ。',
          '帰りは無料じゃ、安心せい。',
          '乗っていくかい?'
        ],
      },
      // 桜の里の古老 - ラスボスの伝説と勇者への激励
      {
        id:'sakura_elder',
        x:466, y:900,
        sprite:'npc_elder',
        name:'桜の里の古老',
        dialog:[
          'おお、よくぞ来られた、勇者よ。',
          'この桜の里は古より人と妖の境界の地。',
          '北の山にそびえ立つ「桜の城」…',
          'あそこは大昔、平和な城だったのじゃ。',
          'だが闇の魔女「ダークイリュージョン」に占拠され、',
          '今や妖魔の巣窟と化してしまった。',
          '彼女を倒す者こそが、',
          'この大陸に平和を取り戻す者じゃ。',
          'しかし闇の魔女は強い…',
          '装備を最大限整え、スキルを磨き、',
          'そして覚醒の力を身につけてから挑むがよい。',
          '里の桜が満開のうちに、武運を祈っておる。',
        ],
      },
      // 桜の里の若い忍者 - 妖刀村雨について
      {
        id:'young_ninja',
        x:1200, y:1400,
        sprite:'npc_ninja',
        name:'里の忍者ハル',
        dialog:[
          'シャッ!旅人か、驚かせるな!',
          '俺はこの里を守る忍者だ。',
          'お主、剣士なら知っているか?',
          '伝説の「妖刀 村雨」のことを。',
          'あの刀は侍の魂を呼び覚ます覚醒武器…',
          '振るう者は侍となり、',
          '居合斬り・燕返し・鬼殺しの三大奥義を使える。',
          'だが闇の力ゆえ、HPは常に削られる…',
          'と昔は言われてたが、今は緩和されてるらしい。',
          '時代は変わっていくものよなぁ。',
          '攻撃力1.2倍、移動速度1.2倍、防御は少し下がる。',
          'まさに攻撃特化の侍道よ!',
        ],
      },
    ],
    // walkZones: 下端の橋 + 上端の階段/門通路を強制歩行可(歩きにくいので広めに)
    walkZones:[
      {x:380, y:1380, w:180, h:292},  // 下端の橋(広めに拡張)
      {x:380, y:280,  w:180, h:120},  // 上端の階段+門通路(新ポータル位置に合わせ調整)
    ],
  },
  // ── 桜の城(sakura_dun1) - 桜の里の上の門から繋がる和風の城 ──
  29:{name:'🏯 桜の城', bgmKey:'sakura_dun', mapImage:'map_sakura_dun1',
    mapType:'sakura_dun1', mapW:2500, mapH:2500,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // ── 入口エリア(下端の門周辺・Y=1900〜2200・石畳) ──
      ['sakura',     940, 2000],['sakura',     1560, 2000],
      ['gama_ninja', 875, 1900],['gama_ninja', 1625, 1900],
      // ── 桜の大樹の左右(Y=1500〜1850・大樹を避けて左右) ──
      ['sakura',     750, 1690],['sakura',     1800, 1690],
      ['gama_ninja', 850, 1815],['gama_ninja', 1650, 1815],
      ['blue_oni',   600, 1750],['blue_oni',   1900, 1750],
      // ── 中央広場(桜の大樹の上・Y=1200〜1450) ──
      // 中央付近の石畳広場(城の階段下〜大樹の上)
      ['gama_ninja', 750, 1350],['gama_ninja', 1750, 1350],
      ['blue_oni',   600, 1300],['blue_oni',   1900, 1300],
      ['red_oni',    900, 1400],['red_oni',    1600, 1400],
      // ── 城前左右の通路(Y=600〜1100) ──
      // 城は X:800〜1700 にあるので左右の通路に配置
      ['gama_ninja', 500, 900],['gama_ninja', 2000, 900],
      ['blue_oni',   400, 1100],['blue_oni',   2100, 1100],
      ['red_oni',    600, 600],['red_oni',    1900, 600],
      // ── 上部エリア(Y=200〜500・上部の道) ──
      ['gama_ninja', 700, 400],['gama_ninja', 1800, 400],
    ],
    boss:null, bossThreshold:9999,
    portalTo:null, portalToLabel:'',
    // 戻り = 桜の里(sakura_gate)
    portalBack:28, portalBackLabel:'🌸 桜の里へ戻る', portalBackKey:'portal_st1',
    // 入口=下端の門の少し内側
    spawnX:1250, spawnY:2050,                  // 下端の門前(歩ける位置)に着地
    portalBackX:1250, portalBackY:2125,        // 下側の門の少し上(門前)
    spawnFromBackX:1250, spawnFromBackY:2050,  // 桜の里から来た時
    spawnFromNextX:1250, spawnFromNextY:2050,
    spawnFromSouthX:1250, spawnFromSouthY:2050,
    // walkZones: 下側の門通路 + 中央の城前階段 を強制歩行可
    walkZones:[
      {x:1190, y:2100, w:120, h:130},   // 下側の門通路
      {x:1180, y:1050, w:140, h:200},   // 中央の城前階段(暗くて壁判定されるため強制歩行可)
      {x:1180, y:1200, w:140, h:80},    // 城の階段下〜中央道の繋ぎ
    ],
  },
  // ── DUN.2 炭鉱1F: ブレイズフォージの洞窟入口から入る ──
  11:{name:'⛏ DUN.2 炭鉱1F', bgmKey:'mine', mapImage:'map_dun2_1',
    mapType:'mine', mapW:2508, mapH:2508,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // ── 上層エリア(左右の小部屋・Y=300〜700) ──
      // 左上の小部屋(ランプ・木箱)
      ['bone_walker', 400, 400],['ghost', 550, 350],
      ['wisp',        300, 550],
      // 右上の小部屋
      ['ghost',         1950, 400],['treasure_hunt', 2100, 450],
      ['wisp',          2200, 600],
      // 中央通路(上)
      ['bat', 1254, 450],['bat', 1100, 600],['bat', 1400, 600],
      // ── 中層エリア(トロッコ・木箱・採掘場・Y=800〜1400) ──
      // 左中(トロッコのレール)
      ['bone_walker', 350, 1000],['treasure_hunt', 500, 1100],
      ['wisp',        250, 1200],
      // 中央通路(中)
      ['ghost', 1100, 1050],['ghost', 1400, 1050],
      ['bone_walker', 1254, 1200],
      // 右中
      ['treasure_hunt', 2050, 1000],['bone_walker', 2200, 1100],
      ['wisp',          2300, 1200],
      // ── 下層エリア(大広間・Y=1500〜2100) ──
      // 左下
      ['bone_walker', 400, 1700],['ghost', 550, 1850],
      ['wisp',        350, 1950],
      // 中央広間(出口前)
      ['ghost',         1100, 1800],['treasure_hunt', 1400, 1800],
      ['bone_walker',   1254, 1900],
      ['bat',           1254, 2000],['bat', 1100, 2000],
      // 右下
      ['ghost',         2000, 1700],['bone_walker', 2150, 1850],
      ['treasure_hunt', 2250, 1950],
    ],
    boss:null, bossThreshold:9999, // ボスなし(2Fにいる)
    // 出口=下端の階段(2Fへ)、戻り=上端の梯子(ブレイズフォージへ)
    portalTo:12, portalToLabel:'⛏ 炭鉱2F へ', portalToKey:'portal_st4',
    portalBack:21, portalBackLabel:'🔥 ブレイズフォージへ', portalBackKey:'portal_st4',
    // 入口=上の梯子(画像上端中央)
    spawnX:1254, spawnY:200,
    portalBackX:1254, portalBackY:80,    // 上の梯子(戻り)
    portalNextX:1254, portalNextY:2400,  // 下の階段(2Fへ)
    spawnFromBackX:1254, spawnFromBackY:200,
    spawnFromNextX:1254, spawnFromNextY:2280,  // 2Fから戻ってきた時(下端の階段の少し上)
    // DUN.2 1F から ブレイズフォージに戻る時の着地位置(洞窟入口の少し下)
    portalBackSpawnX:620, portalBackSpawnY:500,
    // walkZones: 上下の梯子/階段通路を強制歩行可
    walkZones:[
      {x:1200, y:60,   w:110, h:200},   // 上端の梯子通路
      {x:1200, y:2120, w:110, h:380},   // 下端の階段通路(2F着地位置2200もカバー)
    ],
  },
  // ── DUN.2 炭鉱2F: 1Fの下端階段から入る・最下層・クリスタル鉱脈 ──
  12:{name:'⛏ DUN.2 炭鉱2F', bgmKey:'mine', mapImage:'map_dun2_2',
    mapType:'mine', mapW:2508, mapH:2508,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    enemies:[
      // ── 上層エリア(キャンプ・Y=200〜700) ──
      // 左上の鉱山キャンプ(テント・焚き火)
      ['bone_walker', 400, 350],['treasure_hunt', 550, 400],
      ['lich',        300, 550],
      // 中央通路(梯子下)
      ['bat',  1254, 350],['bat',  1100, 500],['bat', 1400, 500],
      ['ghost', 1254, 600],
      // 右上
      ['ghost',         2050, 400],['bone_walker', 2200, 500],
      ['wisp',          2300, 600],
      // ── 中層エリア(クリスタル鉱脈・川と橋・Y=700〜1400) ──
      // 左中: クリスタル鉱脈(紫・青の宝石)
      ['lich',        350, 900],['lich', 500, 1100],
      ['treasure_hunt', 250, 1200],
      ['wisp', 400, 1300],['wisp', 550, 950],
      // 中央通路(中)
      ['ghost',  1100, 1000],['ghost', 1400, 1000],
      ['bone_walker', 1254, 1150],
      // 右中(川・橋)
      ['wisp',  2000, 950],['wisp', 2200, 1100],
      ['bat',   2100, 1250],
      // ── 下層エリア(大広間・赤旗の祭壇・Y=1500〜2200) ──
      // 左下(壁・骸骨の山)
      ['bone_walker', 350, 1700],['ghost', 500, 1850],
      ['treasure_hunt', 300, 2000],
      // 中央広間(ボス手前の守り)
      ['lich',          1100, 1700],['lich', 1400, 1700],
      ['bone_walker',   1254, 1850],
      ['ghost',         1100, 2000],['ghost', 1400, 2000],
      // 右下
      ['bone_walker', 2050, 1700],['treasure_hunt', 2200, 1850],
      ['lich',        2150, 2000],
    ],
    // ボス: 蜘蛛女王ミストレス(中央広間の祭壇に配置)
    boss:{id:'mistress', x:1254, y:1900},
    bossThreshold:20,
    portalTo:null, portalToLabel:'',
    // 戻り=上端の梯子(DUN.2 1Fへ戻る)
    portalBack:11, portalBackLabel:'⛏ 炭鉱1F へ戻る', portalBackKey:'portal_st4',
    // 1Fへ戻る時の着地位置(1Fの下端の階段の少し上=2Fへの入口付近)
    portalBackSpawnX:1254, portalBackSpawnY:2200,
    // 入口=上端の梯子から降りてきた位置
    spawnX:1254, spawnY:200,
    portalBackX:1254, portalBackY:80,        // 上端の梯子(戻り)
    spawnFromBackX:1254, spawnFromBackY:200, // 1Fから来た時
    spawnFromNextX:1254, spawnFromNextY:200,
    // walkZones: 上端の梯子通路
    walkZones:[
      {x:1200, y:60, w:110, h:200},
    ],
  },
  // ── ST.13 虹の道 II(rainbow-2)── ST.9 上端ゲートから繋がる空中ステージ
  13:{name:'ST.13 虹の道 II', bgmKey:'sky',
    mapImage:'map_rainbow2', mapType:'sky', mapW:1881, mapH:1881,
    tiles:[],tileWeights:[],objects:[],objPos:[],
    // 敵: まだ無し(後で配置可能・現状は静かな道中)
    enemies:[],
    boss:null,
    bossThreshold:999,
    portalTo:null, portalToLabel:'',
    // 戻るポータル: 下端(ST.9 から来た入口)
    portalBack:9, portalBackLabel:'🌈 ST.9 虹の道へ', portalBackKey:'portal_st8',
    portalBackX:940, portalBackY:1850,
    // ST.9 に戻った時のスポーン位置 = 上端ゲート下(dungeonGate 再侵入回避のため少し下)
    // portalBackSpawnX/Y は magicReturnX/Y として渡され ST.9 の spawn に使用される
    portalBackSpawnX:940, portalBackSpawnY:380,
    // ST.9 から dungeonGate 経由で来た時のスポーン位置 = 下端中央(rainbow-2 の下端)
    spawnX:940, spawnY:1720,
    spawnFromBackX:940, spawnFromBackY:1720,
  },
};
// ══════════════════════════════════════
// クラス別通常スキル定義(グローバル: スキルタブと_resolveSkillKeyで共用)
// ══════════════════════════════════════
const CLASS_SKILLS = {
  novice:[
    {id:'sk1',name:'スーパーアタック',maxLv:5, desc:'単体への強力な一撃'},
    {id:'sk2',name:'手当',          maxLv:5, desc:'自分のHPを回復'},
    {id:'sk3',locked:true},{id:'sk4',locked:true},
  ],
  warrior:[
    {id:'sk1',name:'烈風斬',      maxLv:10,desc:'周囲の敵を吹き飛ばす'},
    {id:'sk2',name:'ハードガード', maxLv:10,desc:'防御力大幅UP'},
    {id:'sk3',name:'パリィ',      maxLv:5, desc:'攻撃無効化'},
    {id:'sk4',name:'バーサクパワー',maxLv:10,desc:'攻撃速度UP（書物必須）',bookRequired:'warrior'},
  ],
  mage:[
    {id:'sk1',name:'大爆発',      maxLv:10,desc:'広範囲大ダメージ'},
    {id:'sk2',name:'フロスト',    maxLv:10,desc:'広範囲凍結'},
    {id:'sk3',name:'ボルテックス',maxLv:5, desc:'雷の貫通弾'},
    {id:'sk4',name:'メテオーム',  maxLv:5, desc:'巨大隕石・詠唱10秒', bookRequired:true},
  ],
  archer:[
    {id:'sk1',name:'5方向射撃',        maxLv:10,desc:'5方向同時射撃'},
    {id:'sk2',name:'グロリアスショット',maxLv:10,desc:'クリ率×5'},
    {id:'sk3',name:'バルカン',          maxLv:10,desc:'連射'},
    {id:'sk4',name:'ブーストアタック',  maxLv:10,desc:'多段ヒット（パッシブ）',bookRequired:'archer'},
  ],
  bomber:[
    {id:'sk1',name:'設置爆弾',        maxLv:10,desc:'最大3個設置・敵接触で爆破'},
    {id:'sk2',name:'ボーリングボムス',maxLv:10,desc:'直線貫通→着弾で6方向爆撃'},
    {id:'sk3',name:'ハイパーボム',    maxLv:5, desc:'超巨大爆弾'},
    {id:'sk4',name:'ボマーパワー',    maxLv:10,desc:'攻撃範囲拡大（パッシブ）',bookRequired:'bomber'},
  ],
};
// ══════════════════════════════════════
// 覚醒モード定義(各クラスの裏変身)
// ══════════════════════════════════════
const AWAKENINGS = {
  samurai: {
    name: '侍',
    icon: '🗡',
    baseClass: 'warrior',           // 元クラス(これ以外では発動不可)
    // ── スプライト/演出データ(覚醒職追加時はここを設定) ──
    sprite:'player_samurai', animPrefix:'samurai',       // 覚醒中のスプライト
    baseSprite:'player_warrior', baseAnimPrefix:'warrior', // 解除後のスプライト
    auraColor:0xff8866, facingFlip:'left',                // オーラ色・歩行向き反転方向
    requiresEquip: 'muramasa',      // 武器に装備されている必要あり
    manualDeactivate: true,         // 手動解除可能(緩和)
    statMul: {
      atk: 1.2,    // ATK +20%(強化)
      spd: 1.2,    // 速度 +20%(強化)
      def: 0.75,   // DEF -25%(緩和: 0.5→0.75)
      // hit・agi の正補正は無し
    },
    // HP毎秒減少なし(緩和)
    forceDeactivateRatio: 0.10,     // HP10%以下で強制解除
    skills: [
      {id:'sk1', name:'居合斬り',  cost:8,  cd:2.5, desc:'敵の背後にワープ+強烈な一撃'},
      {id:'sk2', name:'燕返し',    cost:10, cd:5,   desc:'5秒間カウンター態勢'},
      {id:'sk3', name:'鬼殺し',    cost:15, cd:6,   desc:'範囲内の敵に5回連撃'},
    ],
  },
  // ── 換装・ヘヴィ(ボマー)──
  heavy: {
    name: '重装兵器',
    icon: '🦾',
    activateLabel: '換装',
    deactivateLabel: '解除',
    baseClass: 'bomber',
    requiresEquip: 'heavy_customize',
    sprite:'player_heavy', animPrefix:'heavy',
    baseSprite:'player_bomber', baseAnimPrefix:'bomber',
    auraColor:0x88ccff, facingFlip:'right',
    statMul: {
      spd: 0.5,    // 速度半減(超鈍重・ネガ効果)
      agi: 0.6,    // 回避ダウン(ネガ効果)
      // atk/def/mag の正補正は無し
    },
    // SP毎秒消費・強制解除なし(緩和)
    skills: [
      {id:'sk1', name:'エンペラーボムズ',cost:30, cd:6,  desc:'空に巨大ドクロ爆弾を投げ、画面範囲ダメージ'},
      {id:'sk2', name:'マシンガン',     cost:25, cd:5,  desc:'15連射の多段攻撃・発射までタメあり'},
      {id:'sk3', name:'プリザーブドバスター',cost:28, cd:5, desc:'氷の波動で正面範囲に攻撃+凍結'},
    ],
  },
  // ── バスターズ換装(ボマー)──
  busters: {
    name: 'バスターズ',
    icon: '🔫',
    activateLabel: 'バスターズ換装',
    deactivateLabel: '解除',
    baseClass: 'bomber',
    requiresEquip: 'buster_rifle',
    sprite:'player_heavy', animPrefix:'heavy',          // 仮: ヘヴィスプライト流用
    baseSprite:'player_bomber', baseAnimPrefix:'bomber',
    auraColor:0xff4422, facingFlip:'right',
    tintColor:0xff7744,                                 // 赤オレンジに着色
    cellBg: 0x3a1408, cellStroke: 0xff7744, cellText: '#ffaa66',
    statMul: {
      spd: 0.7,    // 速度減
      def: 0.85,   // DEF わずかにダウン
    },
    skills: [
      {id:'sk1', name:'バスターキャノン',  cost:14, cd:0,  desc:'連射可能なキャノン砲(動かなければCDなし・3発まで範囲拡大)'},
      {id:'sk2', name:'メガトンキャノン',  cost:45, cd:10, desc:'多段高火力+広範囲爆発(火属性)'},
      {id:'sk3', name:'アーマーパージ',    cost:25, cd:20, desc:'装甲解放: 速度UP・攻撃UP・防御DOWN'},
    ],
  },
  // ── 転生・エルフ(アーチャー)──
  spirit: {
    name: 'エルフ',
    icon: '🍃',
    activateLabel: '転生',
    deactivateLabel: '解除',
    baseClass: 'archer',
    requiresEquip: 'spirit_bow',
    sprite:'player_elf', animPrefix:'elf',
    baseSprite:'player_archer', baseAnimPrefix:'archer',
    auraColor:0x88ffaa, facingFlip:'none',
    statMul: {
      def: 0.9,    // DEF わずかにダウン
      // atk/mag/spd/hit/agi の正補正は無し
    },
    // 発動時HP1/4・SP毎秒消費・SP強制解除すべて削除(緩和)
    skills: [
      {id:'sk1', name:'ウインドカッター',cost:25, cd:3,  desc:'正面に飛ぶ風属性の一撃'},
      {id:'sk2', name:'精霊の誓い',     cost:30, cd:5,  desc:'2体の精霊召喚で多段ビーム'},
      {id:'sk3', name:'オールクリティカル',cost:40, cd:15, desc:'一定時間100%クリティカル'},
    ],
  },
  // ── 妖魔化(マジシャン)──
  youma: {
    name: '妖魔',
    icon: '🌑',
    activateLabel: '妖魔',
    deactivateLabel: '解除',
    baseClass: 'mage',
    requiresEquip: 'dark_illusion_staff',
    sprite:'player_youma', animPrefix:'youma',
    baseSprite:'player_mage', baseAnimPrefix:'mage',
    auraColor:0x9944ff, facingFlip:'left',
    statMul: {
      def: 0.85,   // DEF -15%(身体的に脆くなる)
      // atk/mag/spd の正補正は無し
    },
    // 発動時のコスト: HP30%消費
    onActivateHpCost: 0.3,
    spDrainPerSec: 1.0,
    // SP強制解除は削除(緩和)
    skills: [
      {id:'sk1', name:'ダークフォール',cost:35, cd:8,  desc:'中範囲のブラックホール+暗黒+毒継続'},
      {id:'sk2', name:'ダークストライク',cost:18, cd:1.5,desc:'闇の球体6個が連続着弾・連打可'},
      {id:'sk3', name:'黒龍炎',     cost:50, cd:10, desc:'黒龍が貫通する大技・詠唱長め'},
    ],
  },
  // ── アビスウォーロック(マジシャン・深淵化)──
  abyss: {
    name: 'アビスウォーロック',
    icon: '🌊',
    activateLabel: '深淵化',
    deactivateLabel: '解除',
    baseClass: 'mage',
    requiresEquip: 'riviary_staff',
    sprite:'player_mage', animPrefix:'mage',          // 仮: player_mage を流用
    baseSprite:'player_mage', baseAnimPrefix:'mage',
    auraColor:0x1144ff, facingFlip:'none',
    tintColor:0x4488ff,                                // setTint で青く着色して差別化
    // ── スキルタブのセル色(濃い青) ──
    cellBg: 0x0a1438, cellStroke: 0x4488ff, cellText: '#88ccff',
    statMul: {
      mag: 1.3,    // MAG +30%
      spd: 0.85,   // 速度 -15%(詠唱時の重さを表現)
    },
    spDrainPerSec: 0.5,                                // 持続消費(穏やか)
    skills: [
      {id:'sk1', name:'ウォーターボール',  cost:25, cd:6,  desc:'水属性連射・自動追尾・移動不可・最大10発'},
      {id:'sk2', name:'リヴァイアサンゲート',cost:40, cd:8, desc:'画面横断の津波・3hit+右ノックバック'},
      {id:'sk3', name:'深淵の呪印',        cost:30, cd:15, desc:'次の魔法ダメージ2倍(連続攻撃でもまとめて2倍)'},
    ],
  },
  // 将来の追加: oni(剣士・鬼神化)
};

// 敵の日本語名(ラベル表示用)
const ENEMY_NAMES={
  slime:'スライム', sakura:'サクラ', cider:'サイダー', beach_crab:'ビーチクラブ', wisp:'ウィスプ', gama_ninja:'ガマ忍者', red_oni:'赤鬼', blue_oni:'青鬼', bat:'コウモリ', goblin:'ゴブリン', troll:'トロール',
  wolf:'ウルフ', skeleton:'スケルトン', dragon:'ドラゴン',
  crab:'カニ', seal:'シール', sandworm:'サンドワーム', scorpion:'スコーピオン',
  sandman:'サンドマン', mummy:'ミイラ', bone_dragon:'ボーンドラゴン',
  zombie:'ゾンビ', orc:'オーク', orc_general:'オーク将軍',
  fire_bat:'フレイムバット', ice_wolf:'アイスウルフ', thunder_bird:'サンダーバード',
  cloud_drake:'クラウドドレイク', mistress:'幻惑の女王', sky_serpent:'スカイサーペント',
  thunder_god:'雷神',
  // ボス
  boss1:'キングスライム', boss2:'ウルフキング', boss3:'サハギン', boss4:'砂嵐の暴君',
  scorpion_queen:'蠍の女王', scorpion_king:'蠍王',
  tomb_guardian:'墓守の王', dark_illusion:'ダークイリュージョン',
  // ゴブリン集落
  goblin_archer:'ゴブリンアーチャー', goblin_axe:'アックスゴブリン',
  goblin_leader:'ゴブリンリーダー',
  // 炭鉱
  bone_walker:'ボーンウォーカー', treasure_hunt:'トレジャーハント', ghost:'ゴースト',
};

const ENEMY_DEFS={
  // passive:true=受動  eva=回避率%  element=属性(無/炎/氷/雷/水/土/風/光/闇)
  slime:   {hp:28, atk:4, def:0, spd:60, exp:12,gold:3,  sz:52,rng:50,acd:1.2, passive:true,  eva:0 ,element:'water'},
  sakura:  {hp:32, atk:5, def:0, spd:65, exp:14,gold:4,  sz:52,rng:50,acd:1.2, passive:true,  eva:5 ,element:'none'},
  cider:   {hp:30, atk:4, def:0, spd:70, exp:13,gold:4,  sz:52,rng:50,acd:1.2, passive:true,  eva:5 ,element:'water'},
  beach_crab:{hp:45, atk:8, def:2, spd:60, exp:22,gold:7,  sz:56,rng:54,acd:1.2, passive:true,  eva:5 ,element:'water'},
  wisp:    {hp:38, atk:10, def:0, spd:95, exp:24,gold:8,  sz:48,rng:60,acd:1.0, passive:false, eva:25,element:'water'},
  // 桜の城のモンスター
  gama_ninja:{hp:55, atk:18, def:3, spd:130, exp:38,gold:14, sz:60,rng:70,acd:1.0, passive:false,eva:15,element:'none', ranged:true, projType:'shuriken', paralyze:0.10},
  red_oni:  {hp:160,atk:32, def:6, spd:50,  exp:62,gold:24, sz:90,rng:75,acd:1.4, passive:false,eva:0 ,element:'fire'},
  blue_oni: {hp:140,atk:22, def:5, spd:78,  exp:55,gold:22, sz:88,rng:72,acd:1.3, passive:false,eva:0 ,element:'water', knockback:0.10},
  bat:     {hp:20, atk:6, def:0, spd:110,exp:18,gold:4,  sz:44,rng:46,acd:0.9, passive:true,  eva:15,element:'dark'},
  goblin:  {hp:52, atk:8, def:1, spd:80, exp:30,gold:7,  sz:56,rng:54,acd:1.0, passive:true,  eva:5 ,element:'none'},
  troll:   {hp:120,atk:12,def:2, spd:45, exp:60,gold:15, sz:72,rng:64,acd:1.8, passive:true,  eva:0 ,element:'earth'},
  wolf:    {hp:65, atk:14,def:1, spd:120,exp:45,gold:10, sz:56,rng:54,acd:0.8, passive:false, eva:20,element:'none'},
  skeleton:{hp:80, atk:11,def:3, spd:70, exp:40,gold:12, sz:56,rng:54,acd:1.1, passive:false, eva:10,element:'dark'},
  dragon:  {hp:200,atk:20,def:4, spd:90, exp:100,gold:30,sz:80,rng:72,acd:1.5, passive:false, eva:15,element:'fire'},
  sandworm:{hp:280,atk:22,def:6, spd:55, exp:120,gold:35,sz:76,rng:66,acd:2.0, passive:false, eva:5 ,element:'earth'},
  scorpion:{hp:130,atk:28,def:3, spd:100,exp:90,gold:28, sz:52,rng:50,acd:0.7, passive:false, eva:25,element:'earth'},
  boss1:   {hp:600,atk:18,def:5, spd:50, exp:500,gold:200,sz:100,rng:80,acd:1.2, passive:false, eva:10,isBoss:true,element:'none'},
  boss2:   {hp:900,atk:25,def:8, spd:60, exp:800,gold:350,sz:112,rng:88,acd:1.0, passive:false, eva:20,isBoss:true,element:'none'},
  boss3:   {hp:1400,atk:35,def:10,spd:70,exp:1500,gold:600,sz:120,rng:96,acd:0.9,passive:false,eva:30,isBoss:true,element:'water'},
  boss4:   {hp:2200,atk:50,def:15,spd:110,exp:3000,gold:1000,sz:130,rng:100,acd:0.7,passive:false,eva:35,isBoss:true,element:'fire'},
  // ST5 新モンスター
  bear:    {hp:200,atk:22,def:8, spd:80, exp:80, gold:20, sz:72,rng:66,acd:1.4, passive:true,  eva:5 ,element:'earth'},
  beetle:  {hp:90, atk:16,def:6, spd:60, exp:55, gold:14, sz:60,rng:56,acd:1.0, passive:true,  eva:8 ,element:'earth'},
  hornet:  {hp:60, atk:18,def:2, spd:150,exp:50, gold:12, sz:52,rng:50,acd:0.7, passive:false, eva:25,element:'wind'},
  scorpion_queen:{hp:350,atk:28,def:10,spd:70,exp:150,gold:40,sz:80,rng:68,acd:1.2,passive:false,eva:15,element:'earth'},
  mistress:{hp:3500,atk:65,def:20,spd:90,exp:5000,gold:1500,sz:140,rng:110,acd:0.6,passive:false,eva:25,isBoss:true,element:'dark'},
  // ST6 新モンスター
  cloud_monkey:{hp:120,atk:20,def:3, spd:160,exp:90, gold:25, sz:60,rng:58,acd:0.9, passive:false, eva:30,element:'wind'},
  treant:      {hp:280,def:12,atk:18,spd:0,  exp:110,gold:30, sz:76,rng:200,acd:2.5,passive:true,  eva:0 ,element:'earth'},
  rock_golem:  {hp:600,atk:30,def:25,spd:40, exp:180,gold:45, sz:88,rng:72,acd:2.0, passive:true,  eva:0 ,element:'earth'},
  giant:       {hp:450,atk:40,def:15,spd:70, exp:160,gold:40, sz:96,rng:88,acd:1.8, passive:false, eva:5 ,element:'earth'},
  thunder_god: {hp:5000,atk:80,def:25,spd:100,exp:8000,gold:2000,sz:150,rng:116,acd:0.5,passive:false,eva:20,isBoss:true,element:'thunder'},
  // ST7 オーク族
  orc_warrior: {hp:180,atk:28,def:10,spd:75, exp:100,gold:28, sz:72,rng:66,acd:1.2, passive:false, eva:5 ,element:'none'},
  orc_high:    {hp:300,atk:35,def:14,spd:60, exp:160,gold:40, sz:80,rng:70,acd:1.5, passive:false, eva:5 ,element:'none'},
  orc_lady:    {hp:130,atk:22,def:6, spd:100,exp:85, gold:22, sz:64,rng:58,acd:1.0, passive:true,  eva:12,element:'none'},
  orc_archer:  {hp:110,atk:20,def:5, spd:90, exp:80, gold:20, sz:60,rng:220,acd:1.8,passive:false, eva:15,element:'none'},
  orc_general: {hp:4500,atk:70,def:22,spd:85,exp:6500,gold:1800,sz:140,rng:106,acd:0.7,passive:false,eva:15,isBoss:true,element:'none'},
  // ST3 海岸モンスター
  crab:    {hp:90, atk:14,def:6, spd:55, exp:38, gold:9, sz:56,rng:54,acd:1.4, passive:true,  eva:8 ,element:'water'},
  seal:    {hp:140,atk:12,def:3, spd:90, exp:50, gold:12,sz:64,rng:60,acd:1.0, passive:false, eva:15,element:'water'},
  // ST5 砂漠モンスター
  mummy:   {hp:150,atk:18,def:5, spd:55, exp:70, gold:18,sz:60,rng:56,acd:1.3, passive:false, eva:10,element:'dark'},
  // ST4〜 サンドマン
  sandman: {hp:180,atk:20,def:8, spd:60, exp:75, gold:18,sz:64,rng:58,acd:1.3, passive:true,  eva:5 ,element:'earth'},
  // ST6 骨竜
  bone_dragon:{hp:500,atk:42,def:16,spd:85,exp:220,gold:55,sz:100,rng:80,acd:1.5,passive:false,eva:15,element:'dark'},
  // ST5 ボス: スコーピオンキング(queenより強化)
  scorpion_king:{hp:2800,atk:55,def:18,spd:105,exp:3500,gold:1200,sz:140,rng:108,acd:0.8,passive:false,eva:30,isBoss:true,element:'earth'},
  // ST6 ボス: 砂漠の墓守(骨の主・死霊の番人)
  tomb_guardian:{hp:3500,atk:60,def:22,spd:80,exp:5000,gold:1800,sz:150,rng:115,acd:1.0,passive:false,eva:25,isBoss:true,element:'dark'},
  // ── DUN1 ダンジョン専用モンスター ──
  // ゾンビ: 闇属性(光に弱い)
  zombie:        {hp:800, atk:45, def:12, spd:50, exp:280, gold:60, sz:72,rng:64,acd:1.6, passive:false, eva:0 ,element:'dark'},
  // リッチ: 闇属性(光に弱い)・魔法詠唱
  lich:          {hp:600, atk:55, def:8,  spd:40, exp:350, gold:80, sz:80,rng:280,acd:2.5, passive:false, eva:10,element:'dark'},
  // ダークエルフ: 闇属性
  dark_elf:      {hp:450, atk:50, def:5,  spd:110,exp:300, gold:70, sz:68,rng:320,acd:1.8, passive:false, eva:30,element:'dark'},
  // ダークイリュージョン: 闇属性ボス・メテオは炎属性
  dark_illusion: {hp:4000,atk:70, def:20, spd:90, exp:8000,gold:3000,sz:150,rng:120,acd:1.0,passive:false,eva:20,isBoss:true,element:'dark'},
  // ── ST20 ゴブリンの集落 ──
  // ゴブリンアーチャー: 遠距離攻撃・攻撃力低め
  goblin_archer: {hp:38, atk:6, def:1, spd:75, exp:35, gold:8, sz:54,rng:200,acd:1.6, passive:false, eva:15,element:'none'},
  // アックスゴブリン: 足遅め・攻撃力高め
  goblin_axe:    {hp:80, atk:14,def:3, spd:50, exp:55, gold:14,sz:62,rng:60, acd:1.4, passive:false, eva:5 ,element:'none'},
  // ゴブリンリーダー: ボス級・連れたゴブリンを統率するイメージ
  goblin_leader: {hp:1200,atk:22,def:8,spd:70, exp:1500,gold:500,sz:110,rng:80,acd:1.0,passive:false,eva:15,isBoss:true,element:'none'},
  // ── DUN.2 炭鉱ダンジョン ──
  // ボーンウォーカー: アクティブ・遅い・体力多い・物理高耐性
  bone_walker: {hp:280, atk:22, def:10, spd:40, exp:120, gold:30, sz:68,rng:54, acd:1.6, passive:false, eva:0 ,element:'dark'},
  // トレジャーハント: ノンアクティブ(passive)・速い・攻撃力高め(殴られたら反撃)
  treasure_hunt:{hp:140, atk:32, def:5, spd:160,exp:160, gold:80, sz:60,rng:50, acd:0.7, passive:true,  eva:25,element:'none'},
  // ゴースト: アクティブ・足普通・体力多い・毒攻撃あり
  ghost:       {hp:240, atk:18, def:6, spd:80, exp:140, gold:40, sz:64,rng:54, acd:1.2, passive:false, eva:30,element:'dark'},
};

// ============================================================
//  GameScene
// ============================================================
class GameScene extends Phaser.Scene{
  constructor(){super('Game')}
  init(data){
    this.playerData=data.playerData||makePlayerData('warrior');
    // 古いセーブデータの装備スロット補完(weapon_main, weapon_off)
    if(this.playerData.equip){
      if(this.playerData.equip.weapon_main===undefined) this.playerData.equip.weapon_main=null;
      if(this.playerData.equip.weapon_off===undefined) this.playerData.equip.weapon_off=null;
    }
    // 古いセーブの awakActive 補完: awakSkillLv に Lv>0 のスキルがあれば最初の1つを active 化
    {
      const pd=this.playerData;
      if(!pd.awakActive || typeof pd.awakActive!=='object'){
        pd.awakActive={samurai:null, heavy:null, spirit:null, youma:null};
      }
      ['samurai','heavy','spirit','youma'].forEach(awKey=>{
        if(pd.awakActive[awKey]===undefined) pd.awakActive[awKey]=null;
        if(pd.awakActive[awKey]===null && pd.awakSkillLv && pd.awakSkillLv[awKey]){
          for(let i=1;i<=3;i++){
            if((pd.awakSkillLv[awKey]['sk'+i]||0)>0){ pd.awakActive[awKey]='sk'+i; break; }
          }
        }
      });
    }
    // 旧セーブの skillSlots 移行: 配列が無い/壊れている場合のみ習得スキルから自動充填
    // (新規キャラは makePlayerData で [null x 6] が用意され、ここでは充填しない)
    {
      const pd=this.playerData;
      const cdefs=CLASS_SKILLS[pd.cls]||[];
      if(!pd.skillSlots || !Array.isArray(pd.skillSlots) || pd.skillSlots.length!==6){
        pd.skillSlots=[null,null,null,null,null,null];
        let si=0;
        cdefs.forEach((sk,idx)=>{
          if(si>=6||!sk||sk.locked) return;
          const lv=pd['sk'+(idx+1)]||0;
          const hasBook=(idx===3)&&((pd.cls==='warrior'&&pd._hasBerserk)||(pd.cls==='mage'&&pd._hasMeteoorm));
          if(lv>0||hasBook){ pd.skillSlots[si++]='n'+(idx+1); }
        });
      }
      // awakSkillLv.abyss / busters が無い旧セーブの補完
      if(pd.awakSkillLv && !pd.awakSkillLv.abyss){
        pd.awakSkillLv.abyss = {sk1:0, sk2:0, sk3:0};
      }
      if(pd.awakSkillLv && !pd.awakSkillLv.busters){
        pd.awakSkillLv.busters = {sk1:0, sk2:0, sk3:0};
      }
      // マジシャンキャラには riviary_staff を1本配布(まだ持っていなければ)
      if(pd.cls==='mage'){
        if(!pd.items) pd.items={};
        if(!pd.items['riviary_staff']){
          pd.items['riviary_staff'] = 1;
        }
      }
      // ボマーキャラには buster_rifle を1本配布
      if(pd.cls==='bomber'){
        if(!pd.items) pd.items={};
        if(!pd.items['buster_rifle']){
          pd.items['buster_rifle'] = 1;
        }
      }
    }
    this.stage=data.stage!==undefined?data.stage:1;
    this.fromPortal=data.fromPortal||null; // ポータル遷移元を保存
    this.magicReturnX=data.magicReturnX; // 青魔法ゲート経由の到着位置
    this.magicReturnY=data.magicReturnY;
    this.customSpawnX=data.customSpawnX; // NPC(船頭等)指定のカスタムスポーン位置
    this.customSpawnY=data.customSpawnY;
    // 現在のセーブスロット(ロード or 直前のシーンから引き継ぎ)
    this.currentSlot = data.currentSlot !== undefined ? data.currentSlot : null;
    this.killCount=0;
    this.bossSpawned=false;
    this._dungeonGate=null;
    this._dungeonGateSpawned=false;
    this._transitioning=false;
    this._gameOver=false;
  }
  create(){
    const cfg=STAGE_CONFIG[this.stage]||STAGE_CONFIG[1];
    const MW=cfg.mapW||1200, MH=cfg.mapH||1000;
    this.MW=MW;this.MH=MH;
    this.cfg=cfg;
    // ステージ進入時HP/SP全回復 ③要件§10
    const pd=this.playerData;
    // HP/SP/毒などの状態はステージを跨いで持ち越す(仕様)

    // BGM: シーン開始時に再生(同じキーなら startBGM 内で継続される)
    // シーン作成完了直後に呼ぶことで、Phaser内部の破棄処理との競合を防ぐ
    // 初回起動 + 1秒後・3秒後に「実際に鳴っているか」を確認して必要なら再起動
    this.time.delayedCall(60, ()=>{
      try{ startBGM(cfg.bgmKey); }catch(e){ console.warn('[BGM] start failed', e); }
    });
    // 1秒後の保険: 何らかの理由で鳴っていなければ強制再起動
    this.time.delayedCall(1000, ()=>{
      if(muted) return;
      // 実際に音が鳴っているか厳密チェック
      const audioOk = _bgmAudio && !_bgmAudio.paused && !_bgmAudio.ended && _bgmAudio.readyState >= 2;
      const synthOk = _bgmNodes && _bgmNodes.length > 0;
      if(!audioOk && !synthOk){
        console.log('[BGM] 1秒後チェック: 未再生のため強制再起動', cfg.bgmKey);
        _bgmKey=null;  // 同キーチェックをバイパス
        try{ startBGM(cfg.bgmKey); }catch(e){}
      }
    });
    // 3秒後の最終チェック: それでも鳴っていなければもう一度
    this.time.delayedCall(3000, ()=>{
      if(muted) return;
      const audioOk = _bgmAudio && !_bgmAudio.paused && !_bgmAudio.ended && _bgmAudio.readyState >= 2;
      const synthOk = _bgmNodes && _bgmNodes.length > 0;
      if(!audioOk && !synthOk){
        console.log('[BGM] 3秒後チェック: 最終再起動試行', cfg.bgmKey);
        _bgmKey=null;
        try{ startBGM(cfg.bgmKey); }catch(e){}
      }
    });
    this.cameras.main.setBounds(0,0,MW,MH);
    this.physics.world.setBounds(0,0,MW,MH);

    // ── 1枚絵マップモード（cfg.mapImage 指定時） ──
    if(cfg.mapImage && this.textures.exists(cfg.mapImage)){
      // 1枚絵を背景として配置（左上原点で全体表示）
      this.add.image(0,0,cfg.mapImage).setOrigin(0,0).setDisplaySize(MW,MH).setDepth(-10);
      // ピクセル色判別用の隠しキャンバスを準備
      this._mapMaskReady = this._buildMapColorMask(cfg.mapImage);
      // タイル描画はスキップ
    }else if(cfg.mapImage){
      // 画像が指定されてるがロード失敗: フォールバック背景(色判定の代わりに常に歩ける)
      console.warn('マップ画像なし(フォールバック背景):', cfg.mapImage);
      this.add.rectangle(0,0,MW,MH,0x3a2a1a,1).setOrigin(0,0).setDepth(-10);
      // 中央にメッセージ表示
      this.add.text(MW/2, MH/2, '画像読み込みエラー\n('+cfg.mapImage+')', {
        fontSize:'24px',fontFamily:'Arial',color:'#ff6666',align:'center',stroke:'#000',strokeThickness:3
      }).setOrigin(0.5).setDepth(10);
      // 色判定はしない(常に歩ける)
      this._mapMaskCtx=null;
      this._mapMaskCanvas=null;
      this._mapMaskReady=false;
    }else{
    // 画像マップでないステージでは前ステージのマスクが残らないようにクリア
    this._mapMaskCtx=null;
    this._mapMaskCanvas=null;
    this._mapMaskReady=false;
    // ── 従来のタイル描画 ──
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
    } // 1枚絵モード終端

    // 障害物
    this.obstacles=this.physics.add.staticGroup();
    if(cfg.objPos && cfg.objPos.length>0){
      cfg.objPos.forEach(item=>{
        // 形式①: [x, y] 単一テクスチャ → cfg.objects[0]を使用
        // 形式②: [type, x, y] 個別指定
        let texKey, x, y;
        if(item.length===3 && typeof item[0]==='string'){
          texKey=item[0]; x=item[1]; y=item[2];
        }else if(cfg.objects && cfg.objects[0]){
          texKey=cfg.objects[0]; x=item[0]; y=item[1];
        }else{
          return;
        }
        // テクスチャごとにサイズを変える(木は64x80、岩は56x44など)
        const sizeMap={
          obj_tree: {w:64, h:80},
          obj_rock: {w:56, h:44},
        };
        const sz=sizeMap[texKey] || {w:64, h:80};
        const o=this.obstacles.create(x, y, texKey).setDisplaySize(sz.w, sz.h);
        // 当たり判定は表示サイズより小さく(縁にひっかかり防止)
        o.setSize(sz.w*0.6, sz.h*0.4); // 横は60%、縦は40%(足元のみ)
        o.refreshBody();
      });
    }
    // 町の建物 (stage:0 で 画像マップを使ってない場合のみコードで描画)
    this.buildings=[];
    if(this.stage===0 && cfg.buildings && !cfg.mapImage){
      cfg.buildings.forEach(b=>{
        this.buildings.push(b);
        const bx=b.x, by=b.y, bw=b.w, bh=b.h;
        const cx=bx+bw/2, cy=by+bh/2;
        const g=this.add.graphics().setDepth(3);

        // ── 建物タイプ別カラー ──
        const themes={
          inn:       {wall:0x8b5e3c,roof:0x7a1a1a,roofDark:0x5a1010,trim:0xffd700,door:0x5c2d0a,sign:0xffa500},
          shop:      {wall:0x2a5a9a,roof:0x1a3a6a,roofDark:0x0a2040,trim:0x00ccff,door:0x0a2a5a,sign:0x00aaff},
          guild:     {wall:0x6a2a2a,roof:0x8b1a1a,roofDark:0x5a0808,trim:0xff8800,door:0x3a0a0a,sign:0xffcc00},
          blacksmith:{wall:0x3a3a3a,roof:0x2a2a2a,roofDark:0x1a1a1a,trim:0xff6600,door:0x1a1a1a,sign:0xff4400},
          magic:     {wall:0x2a1a4a,roof:0x3a0a6a,roofDark:0x1a0040,trim:0xaa44ff,door:0x1a0a2a,sign:0xcc88ff},
          jobchange: {wall:0x4a4a8a,roof:0x6a4a9a,roofDark:0x3a2a5a,trim:0xffd700,door:0x2a1a4a,sign:0xffeeaa},
        };
        const t=themes[b.type]||themes.inn;

        // ── 建物本体（石壁）──
        // 影
        g.fillStyle(0x000000,0.3);g.fillRect(bx+6,by+6,bw,bh);
        // 壁（メイン）
        g.fillStyle(t.wall,1);g.fillRect(bx,by,bw,bh);
        // 壁のレンガ模様
        g.fillStyle(0x000000,0.12);
        for(let r=0;r<Math.ceil(bh/16);r++){
          const offset=(r%2)*20;
          for(let c=-1;c<Math.ceil(bw/40);c++){
            g.fillRect(bx+c*40+offset,by+r*16,38,14);
          }
        }
        // 壁のハイライト（左上）
        g.fillStyle(0xffffff,0.08);g.fillRect(bx,by,bw,bh/2);
        g.fillRect(bx,by,bw*0.15,bh);
        // 壁の外枠
        g.lineStyle(3,t.trim,0.8);g.strokeRect(bx,by,bw,bh);

        // ── 屋根（三角）──
        const roofH=bh*0.38;
        g.fillStyle(t.roof,1);
        g.fillTriangle(cx,by-roofH,bx-10,by,bx+bw+10,by);
        // 屋根の影面
        g.fillStyle(t.roofDark,0.6);
        g.fillTriangle(cx,by-roofH,cx,by,bx+bw+10,by);
        // 屋根の縁取り
        g.lineStyle(3,t.trim,0.9);
        g.lineBetween(bx-10,by,cx,by-roofH);g.lineBetween(cx,by-roofH,bx+bw+10,by);
        // 屋根の装飾（頂点の飾り）
        g.fillStyle(t.trim,1);g.fillCircle(cx,by-roofH,7);
        g.fillStyle(0xffffff,0.5);g.fillCircle(cx,by-roofH,3);
        // 屋根瓦のライン
        g.lineStyle(1,t.roofDark,0.4);
        for(let i=1;i<5;i++){
          const ratio=i/5;
          const lx1=cx-(cx-bx+10)*ratio, lx2=cx+(bx+bw+10-cx)*ratio;
          const ly=by-roofH+roofH*ratio;
          g.lineBetween(lx1,ly,lx2,ly);
        }

        // ── 窓（2つ）──
        const winW=bw*0.18, winH=bh*0.22;
        const win1x=bx+bw*0.18, win2x=bx+bw*0.62, winY=by+bh*0.2;
        [win1x,win2x].forEach(wx=>{
          // 窓枠
          g.fillStyle(t.trim,0.8);g.fillRect(wx-winW/2-3,winY-3,winW+6,winH+6);
          // 窓ガラス（昼は青白く）
          g.fillStyle(0x88ccff,0.7);g.fillRect(wx-winW/2,winY,winW,winH);
          // 窓の反射
          g.fillStyle(0xffffff,0.4);g.fillRect(wx-winW/2+2,winY+2,winW*0.4,winH*0.4);
          // 十字の桟
          g.lineStyle(2,t.trim,0.9);
          g.lineBetween(wx,winY,wx,winY+winH);
          g.lineBetween(wx-winW/2,winY+winH/2,wx+winW/2,winY+winH/2);
        });

        // ── ドア（中央下）──
        const doorW=bw*0.22, doorH=bh*0.38;
        const doorX=cx-doorW/2, doorY=by+bh-doorH;
        b.doorX=cx; b.doorY=by+bh; // ドア前座標を保存
        // ドア枠
        g.fillStyle(t.trim,1);g.fillRect(doorX-4,doorY-4,doorW+8,doorH+4);
        // ドア本体
        g.fillStyle(t.door,1);g.fillRect(doorX,doorY,doorW,doorH);
        // ドアの木目
        g.fillStyle(0xffffff,0.1);
        for(let i=1;i<4;i++)g.fillRect(doorX,doorY+doorH*i/4,doorW,1);
        // ドアノブ
        g.fillStyle(t.trim,1);g.fillCircle(doorX+doorW*0.75,doorY+doorH*0.55,4);
        g.fillStyle(0xffffff,0.5);g.fillCircle(doorX+doorW*0.75-1,doorY+doorH*0.55-1,2);
        // ドアのアーチ（上部を丸く）
        g.fillStyle(t.door,1);g.fillEllipse(cx,doorY,doorW,doorW*0.5);
        g.lineStyle(2,t.trim,0.8);g.strokeEllipse(cx,doorY,doorW,doorW*0.5);

        // ── 看板 ──
        const signW=bw*0.55, signH=26;
        const signX=cx-signW/2, signY=by+bh*0.55;
        // 看板の板
        g.fillStyle(0x3d2510,0.95);g.fillRect(signX,signY,signW,signH);
        g.lineStyle(2,t.sign,0.9);g.strokeRect(signX,signY,signW,signH);
        // 看板の留め具
        g.fillStyle(t.trim,1);g.fillCircle(signX+6,signY+4,3);g.fillCircle(signX+signW-6,signY+4,3);
        // テキスト
        this.add.text(cx,signY+signH/2,b.label,{
          fontSize:'13px',fontFamily:'Arial',color:'#'+t.sign.toString(16).padStart(6,'0'),
          stroke:'#000',strokeThickness:3,fontStyle:'bold'
        }).setOrigin(0.5).setDepth(4);

        // ── 建物タイプ別の特殊装飾 ──
        if(b.type==='blacksmith'){
          // 煙突
          g.fillStyle(0x3a3a3a,1);g.fillRect(bx+bw*0.7-8,by-roofH*0.4-20,16,30);
          g.fillStyle(0xff6600,0.6);g.fillCircle(bx+bw*0.7,by-roofH*0.4-20,10);
          g.fillStyle(0xff4400,0.4);g.fillCircle(bx+bw*0.7-2,by-roofH*0.4-28,7);
          g.fillStyle(0x555555,0.5);g.fillCircle(bx+bw*0.7+1,by-roofH*0.4-36,5);
        }
        if(b.type==='magic'||b.type==='inn'){
          // 旗
          const flagX=bx+bw*0.1, flagY=by-roofH*0.6;
          g.fillStyle(0x888888,1);g.fillRect(flagX-1,flagY,2,roofH*0.5);
          g.fillStyle(t.trim,0.9);
          g.fillTriangle(flagX,flagY,flagX+20,flagY+8,flagX,flagY+16);
        }
        if(b.type==='guild'){
          // 剣のエンブレム（看板上）
          g.fillStyle(0xffcc00,0.8);
          g.fillRect(cx-2,by+bh*0.38,4,30);
          g.fillRect(cx-10,by+bh*0.42,20,4);
          g.fillTriangle(cx,by+bh*0.36,cx-4,by+bh*0.42,cx+4,by+bh*0.42);
        }

        // ── 物理壁（建物全体）──
        const wall=this.obstacles.create(cx,cy,'wall_block').setDisplaySize(bw,bh).setAlpha(0);
        wall.refreshBody();
        // ドア前は通れる（壁を上部のみに）
        wall.body.setSize(bw,bh*0.7);
        wall.body.setOffset(0,0);
      });
    }
    // ── 画像マップ町の建物入店判定 ──
    // 建物の絵は画像で既にあるので、当たり判定と入店ロジックだけ追加
    if(cfg.mapImage && cfg.buildings){
      cfg.buildings.forEach(b=>{
        this.buildings.push(b);
        const bx=b.x, by=b.y, bw=b.w, bh=b.h;
        const cx=bx+bw/2, cy=by+bh/2;
        // 建物の物理壁(歩行不可エリア)を建物本体の中心部分のみに絞る
        // 周囲の道・草地は色判定で歩けるようにする
        // 矩形サイズ: 幅 60%, 高さ 50%(中心寄り) で配置
        const ww = bw * 0.60;
        const wh = bh * 0.50;
        const wcx = cx;          // 中心X
        const wcy = by + bh*0.4; // 中心Y(やや上寄り = ドア前を空ける)
        const wall=this.obstacles.create(wcx, wcy, 'wall_block').setDisplaySize(ww, wh).setAlpha(0);
        wall.refreshBody();
        // 建物名のラベル(屋根の上)
        this.add.text(cx, by-12, b.label, {
          fontSize:'14px', fontFamily:'Arial', color:'#ffeecc', fontStyle:'bold',
          stroke:'#000', strokeThickness:3
        }).setOrigin(0.5).setDepth(4);
        // 入店促し表示(ドア下の[入る]アイコン)
        const enterY=by+bh+6;
        const enterTxt=this.add.text(cx, enterY, '[入る]', {
          fontSize:'11px', fontFamily:'Arial', color:'#ffaa44', fontStyle:'bold',
          stroke:'#000', strokeThickness:2
        }).setOrigin(0.5).setDepth(4);
        this.tweens.add({targets:enterTxt, alpha:0.5, duration:1000, yoyo:true, repeat:-1});
      });
    }
    // ── アーチオーバーレイ(プレイヤーが下を潜る石造アーチを擬似描画) ──
    // cfg.archOverlays に矩形を指定すると、その位置にアーチの天井(石造)を
    // プレイヤー(depth=5)より上(depth=15)に描画して「下を潜る」演出
    if(cfg.archOverlays){
      cfg.archOverlays.forEach(a=>{
        const g=this.add.graphics().setDepth(15);
        const ax=a.x, ay=a.y, aw=a.w, ah=a.h;  // 矩形位置・サイズ

        // ── 1. アーチ上部の影(下端の影で立体感) ──
        g.fillStyle(0x000000, 0.35);
        g.fillRect(ax, ay+ah-4, aw, 4);

        // ── 2. アーチ本体(石造の暗いグレー)のグラデーション ──
        // 上部から下部へ徐々に暗く(立体感)
        const steps = 8;
        for(let i=0;i<steps;i++){
          const t = i/steps;
          const ty = ay + (ah * t);
          const th = Math.ceil(ah/steps)+1;
          // 石の色: 上(明るめ #8a8478)→ 下(暗め #4a4438)
          const r = Math.floor(0x8a - (0x8a-0x4a)*t);
          const grn = Math.floor(0x84 - (0x84-0x44)*t);
          const b = Math.floor(0x78 - (0x78-0x38)*t);
          const col = (r<<16)|(grn<<8)|b;
          g.fillStyle(col, 0.85);
          g.fillRect(ax, ty, aw, th);
        }

        // ── 3. 石ブロックの線(グリッド模様で石壁感) ──
        g.lineStyle(1, 0x2a2418, 0.5);
        // 横線(石の段)
        for(let i=1;i<3;i++){
          const ly = ay + (ah * i / 3);
          g.lineBetween(ax, ly, ax+aw, ly);
        }
        // 縦線(石のブロック区切り) ランダム位置
        const blockOffsets = [0.18, 0.42, 0.65, 0.85];
        blockOffsets.forEach((offset,idx)=>{
          const lx = ax + aw*offset + ((idx%2)*8);
          const yStart = ay + (ah * (idx%3) / 3);
          const yEnd = ay + (ah * ((idx%3)+1) / 3);
          g.lineBetween(lx, yStart, lx, yEnd);
        });

        // ── 4. アーチの開口部(下中央)を切り抜き ──
        // archの中央下部を「開口部」として再度道色で塗る
        // 開口部の幅(w)・高さ(arch_height)
        const openW = a.openW || (aw * 0.30);
        const openX = ax + (aw - openW)/2;
        const archH = a.archH || (ah * 0.5);
        const openY = ay + ah - archH;

        // 道の色(明るい砂)で塗りつぶして「奥の道が見える」感
        g.fillStyle(0xd4b889, 1);  // 砂色
        g.fillRect(openX, openY+archH*0.2, openW, archH*0.8);

        // アーチ上部の弧(半円形)を石色で描画
        // アーチの開口部の上を弧で覆う
        g.fillStyle(0x5a5448, 0.95);
        const archCx = openX + openW/2;
        const archCy = openY + archH*0.2;
        // 弧の代わりに台形を重ねて疑似アーチ
        g.beginPath();
        g.moveTo(openX, openY);
        g.lineTo(openX+openW, openY);
        g.lineTo(openX+openW, archCy);
        // アーチの内側カーブ(右から左へ)
        const arcSteps = 16;
        for(let i=0;i<=arcSteps;i++){
          const t = i/arcSteps;
          const ang = Math.PI * (1-t);  // 0 → PI
          const px = archCx + Math.cos(ang) * (openW/2);
          const py = archCy - Math.sin(ang) * (archH*0.2);
          g.lineTo(px, py);
        }
        g.lineTo(openX, archCy);
        g.closePath();
        g.fillPath();

        // ── 5. アーチ内側の影(暗いグラデーション) ──
        g.fillStyle(0x000000, 0.4);
        g.fillRect(openX+2, openY+archH*0.2, openW-4, 8);

        // ── 6. 上部に旗(青)装飾(オプション)──
        if(a.flags){
          // 左の青旗
          g.fillStyle(0x2a4880, 0.95);
          g.fillRect(ax+aw*0.10, ay+ah*0.55, aw*0.08, ah*0.35);
          // 旗の紋章(金色)
          g.fillStyle(0xc8a040, 0.9);
          g.fillCircle(ax+aw*0.14, ay+ah*0.72, 4);
          // 右の青旗
          g.fillStyle(0x2a4880, 0.95);
          g.fillRect(ax+aw*0.82, ay+ah*0.55, aw*0.08, ah*0.35);
          g.fillStyle(0xc8a040, 0.9);
          g.fillCircle(ax+aw*0.86, ay+ah*0.72, 4);
        }
      });
    }
    // ポータル（戻る）
    if(cfg.portalBack!==null&&cfg.portalBack!==undefined){
      // ST7(旧ST5)は螺旋入口が左下なのでポータルを左下に配置
      // cfg.portalBackX/Y が指定されていればそれを優先(画像マップ用)
      const pbX=cfg.portalBackX!==undefined?cfg.portalBackX:80;
      const pbY=cfg.portalBackY!==undefined?cfg.portalBackY:MH/2;
      this.portalBackPos={x:pbX,y:pbY};
      this.add.image(pbX,pbY,'portal_'+cfg.portalBackKey.replace('portal_','')).setDisplaySize(80,64);
      this.add.text(pbX,pbY+44,cfg.portalBackLabel,{fontSize:'10px',fontFamily:'Arial',color:'#ffd700',align:'center'}).setOrigin(0.5);
    }
    // ポータル（次）：常に開放
    this.portalNext=null;this.portalNextImg=null;this.portalNextTxt=null;
    if(cfg.portalTo!==null&&cfg.portalTo!==undefined){
      const pnX=cfg.portalNextX!==undefined?cfg.portalNextX:(MW-80);
      const pnY=cfg.portalNextY!==undefined?cfg.portalNextY:(MH/2);
      this.portalNextImg=this.add.image(pnX,pnY,cfg.portalToKey).setDisplaySize(80,64).setAlpha(1.0);
      this.portalNextTxt=this.add.text(pnX,pnY+44,cfg.portalToLabel+'\n[近づいて移動]',{fontSize:'9px',fontFamily:'Arial',color:'#00e5ff',align:'center'}).setOrigin(0.5);
      this.portalNext={x:pnX,y:pnY,to:cfg.portalTo,open:true};
    }
    // 南方向ポータル(town0 → south_st1 用)
    this.portalSouth=null;
    if(cfg.portalSouth!==null&&cfg.portalSouth!==undefined){
      const psX=cfg.portalSouthX!==undefined?cfg.portalSouthX:(MW/2);
      const psY=cfg.portalSouthY!==undefined?cfg.portalSouthY:(MH-80);
      // 既存のポータル画像が無ければ portal_st1 を流用
      const psKey = this.textures.exists(cfg.portalSouthKey) ? cfg.portalSouthKey : 'portal_st1';
      this.add.image(psX,psY,psKey).setDisplaySize(80,64).setAlpha(0.95);
      const psTxt=this.add.text(psX,psY+44,cfg.portalSouthLabel+'\n[近づいて移動]',{fontSize:'9px',fontFamily:'Arial',color:'#aaffaa',align:'center',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
      this.tweens.add({targets:psTxt, alpha:0.55, duration:1100, yoyo:true, repeat:-1});
      this.portalSouth={x:psX,y:psY,to:cfg.portalSouth,open:true};
    }
    // 東方向ポータル(south_st2 → south_st3 用)
    this.portalEast=null;
    if(cfg.portalEast!==null&&cfg.portalEast!==undefined){
      const peX=cfg.portalEastX!==undefined?cfg.portalEastX:(MW-80);
      const peY=cfg.portalEastY!==undefined?cfg.portalEastY:(MH/2);
      const peKey = this.textures.exists(cfg.portalEastKey) ? cfg.portalEastKey : 'portal_st1';
      this.add.image(peX,peY,peKey).setDisplaySize(80,64).setAlpha(0.95);
      const peTxt=this.add.text(peX,peY+44,cfg.portalEastLabel+'\n[近づいて移動]',{fontSize:'9px',fontFamily:'Arial',color:'#ffcc88',align:'center',stroke:'#000',strokeThickness:2}).setOrigin(0.5);
      this.tweens.add({targets:peTxt, alpha:0.55, duration:1100, yoyo:true, repeat:-1});
      this.portalEast={x:peX,y:peY,to:cfg.portalEast,open:true};
    }
    // NPC配置
    this.npcs=[];
    if(cfg.npcs && Array.isArray(cfg.npcs)){
      cfg.npcs.forEach(npcDef=>{
        let sprite;
        // テクスチャが存在する場合のみsprite作成、なければプレースホルダー
        if(this.textures.exists(npcDef.sprite)){
          sprite = this.add.sprite(npcDef.x, npcDef.y, npcDef.sprite).setDepth(5);
          sprite.setDisplaySize(96, 96);
        }else{
          // フォールバック: 黄色い円 + ?マーク(テクスチャが見つからない時)
          console.warn('[NPC] Texture not found:', npcDef.sprite);
          sprite = this.add.circle(npcDef.x, npcDef.y, 40, 0xffaa44, 0.85).setDepth(5).setStrokeStyle(3, 0x884400, 1);
          const qmark = this.add.text(npcDef.x, npcDef.y, '?', {
            fontSize:'32px', color:'#ffffff', fontStyle:'bold', stroke:'#000', strokeThickness:3
          }).setOrigin(0.5).setDepth(6);
          sprite._fallbackQmark = qmark;
        }
        // 名前表示(上部)
        const nameTag = this.add.text(npcDef.x, npcDef.y-60, npcDef.name, {
          fontSize:'13px', fontFamily:'Arial', color:'#ffeebb', fontStyle:'bold',
          stroke:'#000', strokeThickness:3
        }).setOrigin(0.5).setDepth(6);
        // 話しかけプロンプト(下部・近づくと表示)
        const promptTxt = this.add.text(npcDef.x, npcDef.y+60, '💬 タップで話す', {
          fontSize:'12px', fontFamily:'Arial', color:'#ffff88', fontStyle:'bold',
          stroke:'#000', strokeThickness:3
        }).setOrigin(0.5).setDepth(6).setVisible(false);
        this.tweens.add({targets:promptTxt, alpha:0.6, duration:600, yoyo:true, repeat:-1});
        // インタラクト用エリア
        sprite.setInteractive({useHandCursor:true});
        sprite.on('pointerdown', ()=>{
          // 距離チェック - 近くにいる時のみ会話開始
          const dist = Phaser.Math.Distance.Between(
            this.player.x, this.player.y, npcDef.x, npcDef.y
          );
          if(dist < 120){
            this._openNpcDialog(npcDef);
          }
        });
        this.npcs.push({
          def: npcDef,
          sprite: sprite,
          nameTag: nameTag,
          promptTxt: promptTxt,
        });
      });
    }
    // ── テストモード専用 NPC: セントラルにのみ出現 ──
    if(testMode && this.stage === 0){
      this._spawnTestNpc();
    }
    // 分岐ポータル(sidePortal): 別ルートへの入り口
    if(cfg.sidePortal){
      const sp=cfg.sidePortal;
      // ポータル本体(portal_st4 を流用 = 砂色のリング)
      this.add.image(sp.x, sp.y, 'portal_st4').setDisplaySize(80, 64).setAlpha(0.95);
      // ── 視覚的な道しるべ ──
      // 1. 砂の道(ポータルの手前から)
      const pathG=this.add.graphics().setDepth(1);
      pathG.fillStyle(0xc4a878, 0.6); // 薄い砂色の道
      // ポータルから西側200pxの範囲に道を描画
      for(let i=0;i<8;i++){
        const t=i/7;
        const px=sp.x - 200 + t*200;
        const py=sp.y + Math.sin(t*Math.PI*2)*4; // 軽いウェーブ
        pathG.fillCircle(px, py, 28-t*4);
      }
      // 2. 看板(矢印付き)
      const signX=sp.x-100, signY=sp.y-60;
      const signG=this.add.graphics().setDepth(3);
      // 看板の柱
      signG.fillStyle(0x6b4220, 1); // 茶色の木
      signG.fillRect(signX-2, signY+10, 4, 40);
      // 看板の本体(板)
      signG.fillStyle(0x8b6235, 1);
      signG.fillRect(signX-50, signY-20, 100, 40);
      signG.lineStyle(2, 0x4a2810, 1);
      signG.strokeRect(signX-50, signY-20, 100, 40);
      // 看板の影
      signG.fillStyle(0x000000, 0.2);
      signG.fillRect(signX-48, signY+22, 96, 4);
      // 看板の文字
      this.add.text(signX, signY-10, '🪓 ゴブリン集落', {
        fontSize:'10px', fontFamily:'Arial', color:'#ffeecc', fontStyle:'bold',
        stroke:'#000', strokeThickness:2
      }).setOrigin(0.5).setDepth(4);
      this.add.text(signX, signY+5, '→', {
        fontSize:'14px', fontFamily:'Arial', color:'#ffaa44', fontStyle:'bold',
        stroke:'#000', strokeThickness:2
      }).setOrigin(0.5).setDepth(4);
      // 3. ポータル下に説明テキスト(明滅で目立たせる)
      const portalTxt=this.add.text(sp.x, sp.y+44, '🪓 ゴブリンの集落へ\n[近づいて移動]', {
        fontSize:'9px', fontFamily:'Arial', color:'#ffaa44', align:'center',
        stroke:'#000', strokeThickness:2
      }).setOrigin(0.5).setDepth(4);
      this.tweens.add({targets:portalTxt, alpha:0.5, duration:1000, yoyo:true, repeat:-1});
    }
    // プレイヤー(全クラス統一サイズ)
    const pSize=64;
    // fromPortal:'next'→右端近く, 'back'→左端近く, なし→デフォルト左端
    const fromPortal=this.fromPortal||null;
    let spawnX=fromPortal==='next'?(MW-160):200;
    let spawnY=MH/2;
    // ステージ個別のスポーン位置オーバーライド(画像マップ用)
    if(cfg.spawnX!==undefined&&cfg.spawnY!==undefined){
      // ポータル経由の場合はそれぞれのポータル付近にスポーン
      // ※ ポータル判定半径(70px)より十分離さないと即座に逆戻りトリガする
      // 優先順位: customSpawn(NPC指定) > spawnFromNext/Back で明示指定 > 既定の左右オフセット
      if(this.customSpawnX!==undefined && this.customSpawnY!==undefined){
        // NPC(船頭等)指定のカスタムスポーン位置を最優先
        spawnX=this.customSpawnX; spawnY=this.customSpawnY;
      }else if(fromPortal==='magic'){
        // 青魔法ゲート経由: 渡された returnX/Y で着地
        if(this.magicReturnX!==undefined&&this.magicReturnY!==undefined){
          spawnX=this.magicReturnX; spawnY=this.magicReturnY;
        }else{
          spawnX=cfg.spawnX; spawnY=cfg.spawnY;
        }
      }else if(fromPortal==='next'){
        if(cfg.spawnFromNextX!==undefined&&cfg.spawnFromNextY!==undefined){
          spawnX=cfg.spawnFromNextX; spawnY=cfg.spawnFromNextY;
        }else if(cfg.portalNextX!==undefined){
          spawnX=cfg.portalNextX-120; spawnY=cfg.spawnY;
        }
      }else if(fromPortal==='back'){
        if(cfg.spawnFromBackX!==undefined&&cfg.spawnFromBackY!==undefined){
          spawnX=cfg.spawnFromBackX; spawnY=cfg.spawnFromBackY;
        }else if(cfg.portalBackX!==undefined){
          spawnX=cfg.portalBackX+120; spawnY=cfg.spawnY;
        }
      }else if(fromPortal==='south'){
        // 南から戻ってきた = 南ポータル付近にスポーン
        if(cfg.spawnFromSouthX!==undefined&&cfg.spawnFromSouthY!==undefined){
          spawnX=cfg.spawnFromSouthX; spawnY=cfg.spawnFromSouthY;
        }else if(cfg.portalSouthX!==undefined){
          spawnX=cfg.portalSouthX; spawnY=cfg.portalSouthY-120;
        }
      }else if(fromPortal==='east'){
        // 東から入ってきた = 西側からの入口にスポーン
        if(cfg.spawnFromEastX!==undefined&&cfg.spawnFromEastY!==undefined){
          spawnX=cfg.spawnFromEastX; spawnY=cfg.spawnFromEastY;
        }else{
          spawnX=140; spawnY=cfg.spawnY||(MH/2);
        }
      }else if(fromPortal==='west'){
        // 西から戻ってきた = 東ポータル付近にスポーン
        if(cfg.spawnFromWestX!==undefined&&cfg.spawnFromWestY!==undefined){
          spawnX=cfg.spawnFromWestX; spawnY=cfg.spawnFromWestY;
        }else if(cfg.portalEastX!==undefined){
          spawnX=cfg.portalEastX-120; spawnY=cfg.portalEastY;
        }
      }else{
        spawnX=cfg.spawnX; spawnY=cfg.spawnY;
      }
    }
    // 町（stage:0）の初期スポーン位置: cfg.spawnX/Y を優先、なければハードコード
    if(this.stage===0&&!fromPortal){
      spawnX=(cfg.spawnX!==undefined)?cfg.spawnX:330;
      spawnY=(cfg.spawnY!==undefined)?cfg.spawnY:280;
    }
    // ノービスは専用スプライトを使用
    const spriteCls = pd.cls;
    this.player=this.physics.add.sprite(spawnX,spawnY,'player_'+spriteCls).setDisplaySize(pSize,pSize).setCollideWorldBounds(true).setDepth(5);
    this._facing='front';  // 共通向き管理
    this._facingFlip=false;
    // ── プレイヤーのHPバー(キャラクターの下) ──
    const phpW = pSize * 0.9;
    this._playerHpBarBg = this.add.rectangle(spawnX, spawnY+pSize/2+8, phpW, 5, 0x222222, 0.85).setDepth(6);
    this._playerHpBarBg.setStrokeStyle(1, 0x000000, 0.7);
    this._playerHpBar = this.add.rectangle(spawnX-phpW/2, spawnY+pSize/2+8, phpW, 5, 0x44dd44).setOrigin(0,0.5).setDepth(7);
    this._playerHpBarW = phpW;
    // スプライトシートキャラのアニメ初期再生
    if(pd.cls==='bomber'){
      if(this.anims.exists('bomber_front_idle')){
        this.player.play('bomber_front_idle');
      }else{
        this._registerBomberAnims();
        this.player.play('bomber_front_idle');
      }
    }else if(pd.cls==='mage'){
      if(this.anims.exists('mage_front_idle')){
        this.player.play('mage_front_idle');
      }
    }else if(pd.cls==='warrior'){
      if(this.anims.exists('warrior_front_idle')){
        this.player.play('warrior_front_idle');
      }
    }else if(pd.cls==='novice'){
      if(this.anims.exists('novice_front_idle')){
        this.player.play('novice_front_idle');
      }
    }
    // 覚醒中だった場合、シーン切替後も覚醒スプライトに戻す
    if(pd.awakened){
      const awakSpriteMap = {
        samurai: 'player_samurai',
        heavy:   'player_heavy',
        busters: 'player_heavy',  // 仮: ヘヴィスプライトを流用、赤tintで差別化
        youma:   'player_youma',
        spirit:  'player_elf',
        abyss:   'player_mage',   // 仮: マジシャンスプライトを流用、青tintで差別化
      };
      const awakAnimPrefix = {
        samurai: 'samurai',
        heavy:   'heavy',
        busters: 'heavy',
        youma:   'youma',
        spirit:  'elf',
        abyss:   'mage',
      };
      const tex = awakSpriteMap[pd.awakened];
      const prefix = awakAnimPrefix[pd.awakened];
      if(tex && this.textures.exists(tex)){
        try{
          this.player.setTexture(tex, 0);
          this.player.setDisplaySize(pSize, pSize);
          if(prefix && this.anims.exists(prefix+'_front_idle')){
            this.player.play(prefix+'_front_idle');
          }
          // 覚醒別の追加 tint(abyss は青く着色)
          const A = AWAKENINGS[pd.awakened];
          if(A && A.tintColor){
            this.player.setTint(A.tintColor);
          }
        }catch(e){console.warn('awakening sprite restore on scene change failed', e);}
      }
    }
    this.physics.add.collider(this.player,this.obstacles);
    this.cameras.main.startFollow(this.player,true,0.1,0.1);
    // 弾グループ
    this.bullets=this.physics.add.group();
    this.enemyBullets=this.physics.add.group(); // 敵の遠距離弾(矢・魔法)
    this._droppedItems=[]; // フィールド上のアイテムドロップ
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
      const bowling=bull.getData('bowling')||false;
      if(!pierce&&!bowling)bull.setData('dead',true);
      const dmg=bull.getData('dmg')||1;
      const isCrit=bull.getData('isCrit')||false;

      // ブーストアタック：多段ヒット処理
      const boostHits=bull.getData('boostHits')||1;
      // バルカン/ブースト累積(連射全弾・多段ヒットの合計用)
      const vulcanAcc = bull.getData('vulcanAcc');
      // 1段目を累積に加算(死亡前の最後のダメージなのでmiss判定後でも入る)
      if(vulcanAcc && !bull.getData('miss')){
        vulcanAcc.totalsByEnemy.set(ed, (vulcanAcc.totalsByEnemy.get(ed)||0) + dmg);
        if(ed.sprite) vulcanAcc.lastPosByEnemy.set(ed, {x: ed.sprite.x, y: ed.sprite.y});
      }
      if(boostHits>1&&!ed.dead){
        // 1段目は通常通り下で処理、2段目以降を遅延で追加
        for(let h=1;h<boostHits;h++){
          this.time.delayedCall(h*120,()=>{
            if(ed.dead)return;
            this.hitEnemy(ed,dmg,isCrit,true); // isSkill=trueでスキルダメージ表示
            SE('arrow');
            // 累積に2段目以降も加算
            if(vulcanAcc){
              vulcanAcc.totalsByEnemy.set(ed, (vulcanAcc.totalsByEnemy.get(ed)||0) + dmg);
              if(ed.sprite) vulcanAcc.lastPosByEnemy.set(ed, {x: ed.sprite.x, y: ed.sprite.y});
            }
          });
        }
      }

      if(bowling){
        // ボーリングボムス: 着弾位置で6方向クラスター爆撃
        const bx=ed.sprite.x, by=ed.sprite.y;
        const bDmg=bull.getData('bowlingDmg')||1;
        const bR=bull.getData('bowlingRadius')||40;
        const bCrit=bull.getData('bowlingCrit')||false;
        bull.setData('dead',true);
        bull.destroy();
        // 着弾エフェクト（小爆発）
        const fl=this.add.circle(bx,by,20,0xff6600,0.9).setDepth(25);
        this.tweens.add({targets:fl,alpha:0,scaleX:3,scaleY:3,duration:250,onComplete:()=>fl.destroy()});
        // 6方向クラスター爆発（各爆発半径bRに一致）
        for(let i=0;i<6;i++){
          const a=i/6*Math.PI*2;
          const ex=bx+Math.cos(a)*bR, ey=by+Math.sin(a)*bR;
          this.time.delayedCall(i*40,()=>{
            // 各爆発のリング（bR半径）
            const dot=this.add.circle(bx,by,6,0xffcc00,1.0).setDepth(24);
            this.tweens.add({targets:dot,x:ex,y:ey,alpha:0,scaleX:0.5,scaleY:0.5,duration:200,ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
            // 着弾リング（bR半径に一致）
            const rng=this.add.circle(ex,ey,6,0xff6600,0).setStrokeStyle(3,0xff6600,1.0).setDepth(24);
            this.tweens.add({targets:rng,scaleX:bR/6,scaleY:bR/6,alpha:0,duration:300,ease:'Cubic.easeOut',onComplete:()=>rng.destroy()});
            const expl=this.add.circle(ex,ey,bR*0.4,0xff6600,0.7).setDepth(24);
            this.tweens.add({targets:expl,alpha:0,scaleX:2,scaleY:2,duration:250,onComplete:()=>expl.destroy()});
            // 範囲ダメージ
            this.enemyDataList.forEach(e2=>{
              if(e2.dead)return;
              if(Phaser.Math.Distance.Between(ex,ey,e2.sprite.x,e2.sprite.y)<bR){
                this.hitEnemy(e2,bDmg,bCrit,true);
              }
            });
          });
        }
        SE('explode');
        this.cameras.main.shake(200,0.008);
        return;
      }

      // 属性相性ダメージを適用
      const bulletElem=bull.getData('element')||'none';
      const em=getElementMult(bulletElem, ed.element||'none');
      const finalDmg=Math.max(1, Math.floor(dmg*em.mult));

      // バルカン累積に1段目を加算
      if(vulcanAcc && !bull.getData('miss')){
        vulcanAcc.totalsByEnemy.set(ed, (vulcanAcc.totalsByEnemy.get(ed)||0) + finalDmg);
        vulcanAcc.lastPosByEnemy.set(ed, {x: ed.sprite.x, y: ed.sprite.y});
      }

      if(pierce){
        // 貫通弾：同一敵への多重ヒット防止
        const hitSet=bull.getData('hitSet')||new Set();
        if(hitSet.has(ed.sprite)){return;} // 既にヒット済みの敵はスキップ
        hitSet.add(ed.sprite);
        bull.setData('hitSet',hitSet);
        if(bull.getData('miss')){this.showFloat(ed.sprite.x,ed.sprite.y-30,'Miss','#888888','info');SE('miss');}
        else this.hitEnemy(ed,finalDmg,isCrit,false,em.label);
      }else{
        if(bull.getData('miss')){this.showFloat(ed.sprite.x,ed.sprite.y-30,'Miss','#888888','info');SE('miss');}
        else this.hitEnemy(ed,finalDmg,isCrit,false,em.label);
        bull.destroy();
      }
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
    this.createHUD();this.createSkillButtons();this.createMinimap();this.createJoystick();this._createHomeButton();this._createAwakeningButton();

    // ── 画面回転対応: リサイズ時にUIを再配置 ──
    if(!this._resizeHandlerSet){
      this._resizeHandlerSet=true;
      this.scale.on('resize', this._onScreenResize, this);
    }
    // 毒状態を持ち越している場合は視覚効果を再適用
    if(pd._poisoned && pd._poisonTimer>0){
      if(this.player && this.player.setTint) this.player.setTint(0xcc88ff);
      this._showPoisonHUD();
    }
    const ann=this.add.text(this.scale.width/2,80,cfg.name,{fontSize:'28px',fontFamily:'Arial',color:'#ffd700',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0).setDepth(30);
    this.tweens.add({targets:ann,alpha:0,duration:2000,delay:1500,onComplete:()=>ann.destroy()});
    const muteBtn=this.add.text(this.scale.width-4,4,muted?'🔇':'🔊',{fontSize:'16px'}).setOrigin(1,0).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    muteBtn.on('pointerdown',()=>{setMute(!muted);muteBtn.setText(muted?'🔇':'🔊')});
  }

  // ── 職業別通常攻撃 ② ───────────────────────────
  normalAttack(){
    if(this.atkCooldown>0)return;
    const pd=this.playerData,p=this.player;
    const cls=pd.cls;

    if(cls==='novice'){
      // ノービス: 標準的な近接攻撃(範囲66px・剣士の少し下)
      let closest=null,cd=66;
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
        if(d<cd){cd=d;closest=ed;}
      });
      const ang=closest
        ? Phaser.Math.Angle.Between(p.x,p.y,closest.sprite.x,closest.sprite.y)
        : (this._lastAngle||0);
      const slashX=p.x+Math.cos(ang)*42, slashY=p.y+Math.sin(ang)*42;
      const slash=this.add.image(slashX,slashY,'fx_slash').setRotation(ang).setDisplaySize(42,42).setDepth(20).setAlpha(0.85);
      this.tweens.add({targets:slash,alpha:0,scaleX:1.4,scaleY:1.4,duration:200,onComplete:()=>slash.destroy()});
      SE('hit');
      this.atkCooldown=this._calcAtkCD(0.8); // 剣士0.7に対しノービスは0.8
      this.playSpriteAtk();
      if(!closest)return;
      const res=rollAttack(pd,closest.def,closest.eva||0,'none',closest.element||'none');
      if(res.miss){this.showFloat(p.x,p.y-40,'Miss','#888888','info');SE('miss');}
      else{this.hitEnemy(closest,res.dmg,res.isCrit,false,res.elemLabel);}

    }else if(cls==='warrior'){
      // 覚醒・侍中: 大きな赤い十字斬り・最大2体ヒット・前ダッシュ
      if(pd.awakened==='samurai'){
        const range = 90; // リーチ長め
        // 範囲内の敵を取得(最大2体)
        const inRange = [];
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d <= range) inRange.push({ed, d});
        });
        // 距離順ソートで近い2体を選ぶ
        inRange.sort((a,b)=>a.d-b.d);
        const targets = inRange.slice(0, 2);
        // 攻撃方向(最寄り敵 or 直前の向き)
        const ang = targets.length>0
          ? Phaser.Math.Angle.Between(p.x,p.y,targets[0].ed.sprite.x,targets[0].ed.sprite.y)
          : (this._lastAngle||0);
        const slashX = p.x + Math.cos(ang)*50;
        const slashY = p.y + Math.sin(ang)*50;
        // 1段目: 横一文字の大きな赤い斬撃
        const slash1 = this.add.image(slashX, slashY, 'fx_slash').setRotation(ang).setDisplaySize(72, 72).setDepth(20).setTint(0xff4466).setAlpha(0.95);
        this.tweens.add({targets: slash1, alpha:0, scaleX:1.6, scaleY:1.6, duration:250, onComplete:()=>slash1.destroy()});
        // 2段目(50ms後): 縦切り(90度回転した斬撃)
        this.time.delayedCall(50, ()=>{
          if(!this.player) return;
          const sx2 = this.player.x + Math.cos(ang)*50;
          const sy2 = this.player.y + Math.sin(ang)*50;
          const slash2 = this.add.image(sx2, sy2, 'fx_slash').setRotation(ang + Math.PI/2).setDisplaySize(60, 60).setDepth(20).setTint(0xff8866).setAlpha(0.9);
          this.tweens.add({targets: slash2, alpha:0, scaleX:1.5, scaleY:1.5, duration:200, onComplete:()=>slash2.destroy()});
        });
        // 残像ライン(プレイヤー → 敵方向)
        const trailLine = this.add.line(0,0, p.x, p.y, slashX, slashY, 0xff4466, 0.7).setOrigin(0).setLineWidth(3).setDepth(19);
        this.tweens.add({targets: trailLine, alpha:0, duration:300, onComplete:()=>trailLine.destroy()});
        // SE
        SE('slash');
        try{SE('crit');}catch(e){}
        const berserkMult=pd._berserkMult||1;
        // 早抜き(ディレイ短縮)
        this.atkCooldown=this._calcAtkCD(0.6)/berserkMult;
        this.playSpriteAtk();
        if(targets.length===0) return;
        // 各ターゲットにダメージ
        targets.forEach(({ed})=>{
          const res=rollAttack(pd, ed.def, ed.eva||0, 'none', ed.element||'none');
          if(res.miss){
            this.showFloat(ed.sprite.x, ed.sprite.y-40, 'Miss', '#888888', 'info');
            SE('miss');
          }else{
            this.hitEnemy(ed, res.dmg, res.isCrit, false, res.elemLabel);
          }
        });
      }else{
        // 通常の剣士: 周囲72px最近傍1体
        let closest=null,cd=72;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead)return;
          const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<cd){cd=d;closest=ed;}
        });
        // スラッシュエフェクト（対象がいなくても必ず表示）
        const ang=closest
          ? Phaser.Math.Angle.Between(p.x,p.y,closest.sprite.x,closest.sprite.y)
          : (this._lastAngle||0);
        const slashX=p.x+Math.cos(ang)*44, slashY=p.y+Math.sin(ang)*44;
        const slash=this.add.image(slashX,slashY,'fx_slash').setRotation(ang).setDisplaySize(48,48).setDepth(20).setAlpha(0.9);
        this.tweens.add({targets:slash,alpha:0,scaleX:1.5,scaleY:1.5,duration:200,onComplete:()=>slash.destroy()});
        SE('hit');
        const berserkMult=pd._berserkMult||1;
        this.atkCooldown=this._calcAtkCD(0.7)/berserkMult;
        this.playSpriteAtk();
        if(!closest)return;
        const res=rollAttack(pd,closest.def,closest.eva||0,'none',closest.element||'none');
        if(res.miss){this.showFloat(p.x,p.y-40,'Miss','#888888','info');SE('miss');}
        else{this.hitEnemy(closest,res.dmg,res.isCrit,false,res.elemLabel);}
      }

    }else if(cls==='mage'){
      // 装備中の覚醒武器を確認(リヴァイアリー = 水属性の青い回転球)
      const eqW = pd.equip && pd.equip.weapon_main;
      const eqD = eqW ? EQUIP_DEFS[eqW] : null;
      const isRiviary = (eqD && eqD.awakening === 'abyss');
      if(pd.awakened==='youma'){
        // 妖魔化覚醒中: 闇属性の回転球
        if(pd.sp<3){this.showFloat(p.x,p.y-40,'SP不足','#3498db','info');return;}
        pd.sp-=3;
        const ang=this.getFacingAngle();
        const dmg = Math.max(1,Math.floor(pd.mag*2)+Phaser.Math.Between(0,pd.mag));
        const isCrit = Math.random()*100 < calcCrit(pd);
        this._fireDarkOrb(p.x, p.y, ang, {
          spd: 280, maxDist: 520,
          dmg, isCrit,
          element: 'dark',
        });
        SE('magic'); this.updateHUD();
        this.atkCooldown = this._calcAtkCD(0.7);
      }else if(isRiviary){
        // リヴァイアリーの杖装備中: 水属性の青い回転球(覚醒前後問わず)
        if(pd.sp<3){this.showFloat(p.x,p.y-40,'SP不足','#3498db','info');return;}
        pd.sp-=3;
        const ang=this.getFacingAngle();
        const dmg = Math.max(1,Math.floor(pd.mag*2)+Phaser.Math.Between(0,pd.mag));
        const isCrit = Math.random()*100 < calcCrit(pd);
        this._fireWaterOrb(p.x, p.y, ang, {
          spd: 320, maxDist: 540,
          dmg, isCrit,
          element: 'water',
        });
        SE('magic'); this.updateHUD();
        this.atkCooldown = this._calcAtkCD(0.7);
      }else{
        // 通常マジシャン: 炎の回転球(火属性のかっこいいオーブ)
        if(pd.sp<3){this.showFloat(p.x,p.y-40,'SP不足','#3498db','info');return;}
        pd.sp-=3;
        const ang=this.getFacingAngle();
        const dmg = Math.max(1,Math.floor(pd.mag*2)+Phaser.Math.Between(0,pd.mag));
        const isCrit = Math.random()*100 < calcCrit(pd);
        this._fireFlameOrb(p.x, p.y, ang, {
          spd: 320, maxDist: 540,
          dmg, isCrit,
          element: 'fire',
        });
        SE('magic'); this.updateHUD();
        this.atkCooldown = this._calcAtkCD(0.7);
      }

    }else if(cls==='archer'){
      // ブーストアタック判定（パッシブ）
      const boostLv=pd._hasBoostAtk?(pd.sk4||1):0;
      const boostRoll=Math.random()*100;
      const tripleChance=boostLv>=6?30:0;
      const doubleChance=boostLv>=1?30:0;
      let hitCount=1;
      if(boostLv>0){
        if(boostRoll<tripleChance) hitCount=3;
        else if(boostRoll<tripleChance+doubleChance) hitCount=2;
      }
      // 矢は1本だけ発射
      const ang=this.getFacingAngle();
      const res=rollAttack(pd,0,this._nearestEnemyEva());
      const baseDmg=res.miss?0:Math.max(1,Math.floor(pd.atk*1.5)+Phaser.Math.Between(0,pd.atk));
      // 多段ヒット時はTOTAL累積を準備
      let boostAcc = null;
      if(hitCount > 1){
        boostAcc = {
          totalsByEnemy: new Map(),
          lastPosByEnemy: new Map(),
        };
        // hitCount * 120ms + 余裕で TOTAL 表示
        this.time.delayedCall(hitCount*120 + 500, ()=>{
          boostAcc.totalsByEnemy.forEach((total, ed)=>{
            const pos = boostAcc.lastPosByEnemy.get(ed) || {x:p.x,y:p.y};
            this.showTotalDamage(pos.x, pos.y, total);
          });
        });
      }
      const b = this.fireBullet(p.x,p.y,ang,'proj_arrow',{
        spd:540,maxDist:650,
        dmg:baseDmg,
        isCrit:!res.miss&&res.isCrit,
        miss:res.miss,
        sz:14,
        // 多段ヒット情報を弾に持たせる
        boostHits:hitCount,
        boostScene:this,
        boostPd:pd,
      });
      // ブーストアタックの累積を弾に紐付け(vulcanAccと同じ仕組みを流用)
      if(b && boostAcc){
        b.setData('vulcanAcc', boostAcc);
      }
      SE('arrow');
      // 2段・3段の追加ヒットは弾着弾時に処理（hitBullet内で対応）
      // フロートテキスト
      if(hitCount>1)this.showFloat(p.x,p.y-50,hitCount+'段ヒット！','#27ae60','info');
      this.playSpriteAtk();
      this.atkCooldown=this._calcAtkCD(0.5);

    }else if(cls==='bomber'){
      // ヘヴィカスタマイズ覚醒中: ホーミングミサイル
      if(pd.awakened==='heavy'){
        // 最寄り敵をターゲット(なければ向き方向に直進)
        let target=null, td=600;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<td){td=d; target=ed;}
        });
        const initAng = target
          ? Phaser.Math.Angle.Between(p.x,p.y,target.sprite.x,target.sprite.y)
          : this.getFacingAngle();
        const bomberPowerLv=pd._hasBomberPower?(pd.sk4||1):0;
        const bomberRadiusMult=bomberPowerLv>=10?3:bomberPowerLv>0?2:1;
        const dmg=Math.max(1,Math.floor(pd.atk*3)+Phaser.Math.Between(0,Math.floor(pd.atk*2)));
        const isCrit=Math.random()*100<calcCrit(pd);
        // ミサイル発射(ホーミング処理は this.update 内で対応)
        this._fireHomingMissile(p.x, p.y, initAng, target, {
          dmg, isCrit,
          radius: 55*bomberRadiusMult,
          element: 'fire',
        });
        SE('arrow'); // ミサイル発射音
        this.atkCooldown=this._calcAtkCD(1.0);
        // 攻撃アニメ
        this.playBomberAtk();
      }else{
        // 通常: 爆弾投擲（放物線）→ 着弾時に範囲ダメージ
        const ang=this.getFacingAngle();
        // プレイヤー手前に着弾するように距離を調整(密着敵に当たる)
        const dist=35;
        const tx=p.x+Math.cos(ang)*dist, ty=p.y+Math.sin(ang)*dist;
        const bomberPowerLv=pd._hasBomberPower?(pd.sk4||1):0;
        const bomberRadiusMult=bomberPowerLv>=10?3:bomberPowerLv>0?2:1;
        this.throwBomb(p.x,p.y,tx,ty,{
          dmg:Math.max(1,Math.floor(pd.atk*3)+Phaser.Math.Between(0,Math.floor(pd.atk*2))),
          isCrit:Math.random()*100<calcCrit(pd),
          radius:70*bomberRadiusMult,  // 55→70 に拡大
          element:'fire',
        });
        SE('explode');
        this.atkCooldown=this._calcAtkCD(1.0);
        // 攻撃アニメ
        this.playBomberAtk();
      }
    }
  }

  // 妖魔化用: 闇属性の回転球
  _fireDarkOrb(sx, sy, ang, opt){
    const speed = opt.spd || 280;
    const maxDist = opt.maxDist || 520;
    // コンテナで複数の球を組み合わせ(回転表現)
    const orb = this.add.container(sx, sy).setDepth(8);
    // 外側の紫オーラ
    const aura = this.add.circle(0, 0, 16, 0x6622aa, 0.5);
    // 中心の黒い本体
    const core = this.add.circle(0, 0, 11, 0x110022, 1).setStrokeStyle(2, 0x9944ff, 0.95);
    // 周囲を回転する3つの紫の小球
    const orbiters = [];
    for(let i=0;i<3;i++){
      const a = (i/3) * Math.PI * 2;
      const sm = this.add.circle(Math.cos(a)*14, Math.sin(a)*14, 4, 0xcc88ff, 0.95);
      orbiters.push({sm, baseAng: a});
    }
    // 中心の白い光点
    const center = this.add.circle(0, 0, 4, 0xffffff, 0.7);
    orb.add([aura, core, ...orbiters.map(o=>o.sm), center]);
    // 移動データ
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    orb.setData('vx', vx);
    orb.setData('vy', vy);
    orb.setData('dmg', opt.dmg);
    orb.setData('isCrit', opt.isCrit);
    orb.setData('element', opt.element || 'dark');
    orb.setData('born', this.time.now);
    orb.setData('dist', 0);
    orb.setData('hit', false);
    // 紫オーラの脈動
    this.tweens.add({
      targets: aura,
      scaleX: 1.3, scaleY: 1.3, alpha: 0.7,
      duration: 250, yoyo: true, repeat: -1,
    });
    // 球本体の回転
    this.tweens.add({
      targets: orb,
      rotation: Math.PI * 4,
      duration: 1500,
      repeat: -1,
    });
    // 周回小球が時間で回転する
    const startTime = this.time.now;
    // 飛行ループ
    const flyLoop = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: ()=>{
        if(!orb.scene || orb.getData('hit')){flyLoop.remove(); return;}
        const dt = 16/1000;
        orb.x += orb.getData('vx') * dt;
        orb.y += orb.getData('vy') * dt;
        const distAdd = Math.hypot(orb.getData('vx')*dt, orb.getData('vy')*dt);
        const newDist = orb.getData('dist') + distAdd;
        orb.setData('dist', newDist);
        // 周回小球の角度更新(ローカル座標で)
        const elapsed = this.time.now - startTime;
        orbiters.forEach(o=>{
          const a = o.baseAng + elapsed * 0.008;
          o.sm.setPosition(Math.cos(a)*14, Math.sin(a)*14);
        });
        // 紫の軌跡
        if(Math.random() < 0.5){
          const trail = this.add.circle(orb.x, orb.y, 3, 0xaa44ff, 0.6).setDepth(7);
          this.tweens.add({
            targets: trail,
            alpha: 0, scaleX: 0.3, scaleY: 0.3,
            duration: 400,
            onComplete: ()=>trail.destroy(),
          });
        }
        // 寿命
        if(newDist > maxDist){
          this._destroyDarkOrb(orb);
          flyLoop.remove();
          return;
        }
        // 命中判定
        this.enemyDataList.forEach(ed=>{
          if(ed.dead || !ed.sprite || orb.getData('hit')) return;
          if(Phaser.Math.Distance.Between(orb.x, orb.y, ed.sprite.x, ed.sprite.y) < 24){
            orb.setData('hit', true);
            // ダメージ計算
            const dmg = orb.getData('dmg');
            const isCrit = orb.getData('isCrit');
            const em = getElementMult(orb.getData('element'), ed.element||'none');
            const finalDmg = Math.max(1, Math.floor((isCrit?dmg*2:dmg) * em.mult));
            this.hitEnemy(ed, finalDmg, isCrit, false, em.label);
            // 着弾エフェクト
            const burst = this.add.circle(orb.x, orb.y, 18, 0xaa44ff, 0.85).setDepth(20);
            this.tweens.add({
              targets: burst,
              scaleX: 2.5, scaleY: 2.5, alpha: 0,
              duration: 350,
              onComplete: ()=>burst.destroy(),
            });
            // 紫の火花
            for(let k=0;k<6;k++){
              const sa = (k/6)*Math.PI*2;
              const sp = this.add.circle(orb.x, orb.y, 3, 0xcc88ff, 0.9).setDepth(21);
              this.tweens.add({
                targets: sp,
                x: orb.x + Math.cos(sa)*30,
                y: orb.y + Math.sin(sa)*30,
                alpha: 0,
                duration: 400,
                onComplete: ()=>sp.destroy(),
              });
            }
            this._destroyDarkOrb(orb);
            flyLoop.remove();
          }
        });
      },
    });
  }

  _destroyDarkOrb(orb){
    try{orb.destroy();}catch(e){}
  }

  // マジシャン用: 炎属性の回転球(妖魔の闇球を炎アレンジ)
  _fireFlameOrb(sx, sy, ang, opt){
    const speed = opt.spd || 320;
    const maxDist = opt.maxDist || 540;
    // コンテナで複数の球を組み合わせ(回転表現)
    const orb = this.add.container(sx, sy).setDepth(8);
    // 外側の赤いオーラ(熱気)
    const aura = this.add.circle(0, 0, 17, 0xff5522, 0.45);
    // 中心の炎本体(濃いオレンジ→黄色グラデ風)
    const core = this.add.circle(0, 0, 11, 0xffaa22, 1).setStrokeStyle(2, 0xffee44, 0.95);
    // 周囲を回転する3つの炎の小球(オレンジ・黄色)
    const orbiters = [];
    const orbiterColors = [0xff8822, 0xffcc22, 0xff6611];
    for(let i=0;i<3;i++){
      const a = (i/3) * Math.PI * 2;
      const sm = this.add.circle(Math.cos(a)*14, Math.sin(a)*14, 4, orbiterColors[i], 0.95);
      orbiters.push({sm, baseAng: a});
    }
    // 中心の白い熱光点
    const center = this.add.circle(0, 0, 4, 0xffffee, 0.85);
    orb.add([aura, core, ...orbiters.map(o=>o.sm), center]);
    // 移動データ
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    orb.setData('vx', vx);
    orb.setData('vy', vy);
    orb.setData('dmg', opt.dmg);
    orb.setData('isCrit', opt.isCrit);
    orb.setData('element', opt.element || 'fire');
    orb.setData('born', this.time.now);
    orb.setData('dist', 0);
    orb.setData('hit', false);
    // 赤オーラの脈動(炎が燃えてる感)
    this.tweens.add({
      targets: aura,
      scaleX: 1.4, scaleY: 1.4, alpha: 0.7,
      duration: 200, yoyo: true, repeat: -1,
    });
    // 球本体の回転
    this.tweens.add({
      targets: orb,
      rotation: Math.PI * 4,
      duration: 1200,
      repeat: -1,
    });
    // 周回小球が時間で回転する
    const startTime = this.time.now;
    // 飛行ループ
    const flyLoop = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: ()=>{
        if(!orb.scene || orb.getData('hit')){flyLoop.remove(); return;}
        const dt = 16/1000;
        orb.x += orb.getData('vx') * dt;
        orb.y += orb.getData('vy') * dt;
        const distAdd = Math.hypot(orb.getData('vx')*dt, orb.getData('vy')*dt);
        const newDist = orb.getData('dist') + distAdd;
        orb.setData('dist', newDist);
        // 周回小球の角度更新(ローカル座標で)
        const elapsed = this.time.now - startTime;
        orbiters.forEach(o=>{
          const a = o.baseAng + elapsed * 0.010;
          o.sm.setPosition(Math.cos(a)*14, Math.sin(a)*14);
        });
        // 炎の軌跡(オレンジ・赤の煙)
        if(Math.random() < 0.7){
          const trailColors = [0xff7722, 0xffaa44, 0xff4400];
          const trailColor = trailColors[Phaser.Math.Between(0, 2)];
          const trail = this.add.circle(orb.x + (Math.random()-0.5)*4, orb.y + (Math.random()-0.5)*4, 4, trailColor, 0.7).setDepth(7);
          this.tweens.add({
            targets: trail,
            alpha: 0, scaleX: 0.2, scaleY: 0.2,
            y: trail.y - 12, // 煙が上に上がる
            duration: 450,
            onComplete: ()=>trail.destroy(),
          });
        }
        // 寿命
        if(newDist > maxDist){
          this._destroyDarkOrb(orb);
          flyLoop.remove();
          return;
        }
        // 命中判定
        this.enemyDataList.forEach(ed=>{
          if(ed.dead || !ed.sprite || orb.getData('hit')) return;
          if(Phaser.Math.Distance.Between(orb.x, orb.y, ed.sprite.x, ed.sprite.y) < 26){
            orb.setData('hit', true);
            // ダメージ計算
            const dmg = orb.getData('dmg');
            const isCrit = orb.getData('isCrit');
            const em = getElementMult(orb.getData('element'), ed.element||'none');
            const finalDmg = Math.max(1, Math.floor((isCrit?dmg*2:dmg) * em.mult));
            this.hitEnemy(ed, finalDmg, isCrit, false, em.label);
            // 着弾爆発エフェクト(オレンジ→白)
            const burst1 = this.add.circle(orb.x, orb.y, 22, 0xff8822, 0.9).setDepth(20);
            this.tweens.add({
              targets: burst1,
              scaleX: 2.8, scaleY: 2.8, alpha: 0,
              duration: 380,
              onComplete: ()=>burst1.destroy(),
            });
            const burst2 = this.add.circle(orb.x, orb.y, 14, 0xffffee, 1).setDepth(21);
            this.tweens.add({
              targets: burst2,
              scaleX: 1.8, scaleY: 1.8, alpha: 0,
              duration: 220,
              onComplete: ()=>burst2.destroy(),
            });
            // 火花(8方向に散る・赤・オレンジ・黄色のミックス)
            const sparkColors = [0xff4422, 0xff8822, 0xffcc44, 0xffee66];
            for(let k=0;k<8;k++){
              const sa = (k/8)*Math.PI*2;
              const sc = sparkColors[k % sparkColors.length];
              const sp = this.add.circle(orb.x, orb.y, 3, sc, 0.95).setDepth(21);
              this.tweens.add({
                targets: sp,
                x: orb.x + Math.cos(sa)*36,
                y: orb.y + Math.sin(sa)*36,
                alpha: 0,
                duration: 450,
                onComplete: ()=>sp.destroy(),
              });
            }
            this._destroyDarkOrb(orb);
            flyLoop.remove();
          }
        });
      },
    });
  }

  // マジシャン用: 水属性の回転球(ファイヤーボールの青版)
  _fireWaterOrb(sx, sy, ang, opt){
    const speed = opt.spd || 320;
    const maxDist = opt.maxDist || 540;
    const orb = this.add.container(sx, sy).setDepth(8);
    // 外側の青いオーラ
    const aura = this.add.circle(0, 0, 17, 0x4488dd, 0.45);
    // 中心の水本体
    const core = this.add.circle(0, 0, 11, 0x4499ee, 1).setStrokeStyle(2, 0xaaddff, 0.95);
    // 周囲を回転する3つの水滴
    const orbiters = [];
    const orbiterColors = [0x66bbff, 0xaaeeff, 0x3388dd];
    for(let i=0;i<3;i++){
      const a = (i/3) * Math.PI * 2;
      const sm = this.add.circle(Math.cos(a)*14, Math.sin(a)*14, 4, orbiterColors[i], 0.95);
      orbiters.push({sm, baseAng: a});
    }
    // 中心の白いハイライト
    const center = this.add.circle(-2, -3, 4, 0xffffff, 0.85);
    orb.add([aura, core, ...orbiters.map(o=>o.sm), center]);
    // 移動データ
    const vx = Math.cos(ang) * speed;
    const vy = Math.sin(ang) * speed;
    orb.setData('vx', vx);
    orb.setData('vy', vy);
    orb.setData('dmg', opt.dmg);
    orb.setData('isCrit', opt.isCrit);
    orb.setData('element', opt.element || 'water');
    orb.setData('born', this.time.now);
    orb.setData('dist', 0);
    orb.setData('hit', false);
    // 青オーラの脈動
    this.tweens.add({
      targets: aura,
      scaleX: 1.4, scaleY: 1.4, alpha: 0.7,
      duration: 220, yoyo: true, repeat: -1,
    });
    // 球本体の回転
    this.tweens.add({
      targets: orb,
      rotation: Math.PI * 4,
      duration: 1200,
      repeat: -1,
    });
    const startTime = this.time.now;
    // 飛行ループ
    const flyLoop = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: ()=>{
        if(!orb.scene || orb.getData('hit')){flyLoop.remove(); return;}
        const dt = 16/1000;
        orb.x += orb.getData('vx') * dt;
        orb.y += orb.getData('vy') * dt;
        const distAdd = Math.hypot(orb.getData('vx')*dt, orb.getData('vy')*dt);
        const newDist = orb.getData('dist') + distAdd;
        orb.setData('dist', newDist);
        // 周回小球の角度更新
        const elapsed = this.time.now - startTime;
        orbiters.forEach(o=>{
          const a = o.baseAng + elapsed * 0.010;
          o.sm.setPosition(Math.cos(a)*14, Math.sin(a)*14);
        });
        // 水の軌跡(青系の泡)
        if(Math.random() < 0.7){
          const trailColors = [0x66aacc, 0x88ccff, 0x3377dd];
          const trailColor = trailColors[Phaser.Math.Between(0, 2)];
          const trail = this.add.circle(orb.x + (Math.random()-0.5)*4, orb.y + (Math.random()-0.5)*4, 4, trailColor, 0.7).setDepth(7);
          this.tweens.add({
            targets: trail,
            alpha: 0, scaleX: 0.2, scaleY: 0.2,
            y: trail.y + 6,  // 水滴は少し下に沈む感
            duration: 450,
            onComplete: ()=>trail.destroy(),
          });
        }
        // 寿命
        if(newDist > maxDist){
          this._destroyDarkOrb(orb);
          flyLoop.remove();
          return;
        }
        // 命中判定
        this.enemyDataList.forEach(ed=>{
          if(ed.dead || !ed.sprite || orb.getData('hit')) return;
          if(Phaser.Math.Distance.Between(orb.x, orb.y, ed.sprite.x, ed.sprite.y) < 26){
            orb.setData('hit', true);
            const dmg = orb.getData('dmg');
            const isCrit = orb.getData('isCrit');
            const em = getElementMult(orb.getData('element'), ed.element||'none');
            const finalDmg = Math.max(1, Math.floor((isCrit?dmg*2:dmg) * em.mult));
            this.hitEnemy(ed, finalDmg, isCrit, false, em.label);
            // 着弾の水しぶき(青→白)
            const burst1 = this.add.circle(orb.x, orb.y, 22, 0x4499ee, 0.9).setDepth(20);
            this.tweens.add({
              targets: burst1,
              scaleX: 2.8, scaleY: 2.8, alpha: 0,
              duration: 380,
              onComplete: ()=>burst1.destroy(),
            });
            const burst2 = this.add.circle(orb.x, orb.y, 14, 0xffffff, 1).setDepth(21);
            this.tweens.add({
              targets: burst2,
              scaleX: 1.8, scaleY: 1.8, alpha: 0,
              duration: 220,
              onComplete: ()=>burst2.destroy(),
            });
            // 水しぶき(8方向に散る)
            const sparkColors = [0x4477dd, 0x66aacc, 0xaaeeff, 0xffffff];
            for(let k=0;k<8;k++){
              const sa = (k/8)*Math.PI*2;
              const sc = sparkColors[k % sparkColors.length];
              const sp = this.add.circle(orb.x, orb.y, 3, sc, 0.95).setDepth(21);
              this.tweens.add({
                targets: sp,
                x: orb.x + Math.cos(sa)*36,
                y: orb.y + Math.sin(sa)*36,
                alpha: 0,
                duration: 450,
                onComplete: ()=>sp.destroy(),
              });
            }
            this._destroyDarkOrb(orb);
            flyLoop.remove();
          }
        });
      },
    });
  }

  // ヘヴィ覚醒用: ホーミングミサイル
  _fireHomingMissile(sx, sy, initAng, target, opt){
    // ミサイル本体(暗いグレーの円+赤い先端)
    const missile = this.add.container(sx, sy).setDepth(8);
    const body = this.add.rectangle(0, 0, 18, 8, 0x666666, 1).setStrokeStyle(1, 0x222222);
    const tip = this.add.triangle(11, 0, 0, -4, 0, 4, 6, 0, 0xff4422);
    const fin = this.add.rectangle(-7, 0, 4, 12, 0x444444);
    missile.add([fin, body, tip]);
    missile.rotation = initAng;
    // 移動データ
    const speed = 320;
    missile.setData('vx', Math.cos(initAng)*speed);
    missile.setData('vy', Math.sin(initAng)*speed);
    missile.setData('dmg', opt.dmg);
    missile.setData('isCrit', opt.isCrit);
    missile.setData('radius', opt.radius);
    missile.setData('element', opt.element);
    missile.setData('target', target);
    missile.setData('born', this.time.now);
    missile.setData('exploded', false);
    // ホーミングループ
    const lifeMs = 1800;
    const turnRate = 4.5; // 旋回性能(rad/sec)
    const trailLoop = this.time.addEvent({
      delay: 16,
      loop: true,
      callback: ()=>{
        if(!missile.scene || missile.getData('exploded')){trailLoop.remove(); return;}
        const elapsed = this.time.now - missile.getData('born');
        // 寿命切れで自爆
        if(elapsed > lifeMs){
          this._explodeMissile(missile);
          trailLoop.remove();
          return;
        }
        // ターゲット検証(死んでたら近場に再ターゲット)
        let tgt = missile.getData('target');
        if(!tgt || tgt.dead || !tgt.sprite){
          let nearest=null, nd=400;
          this.enemyDataList.forEach(ed=>{
            if(ed.dead) return;
            const d = Phaser.Math.Distance.Between(missile.x, missile.y, ed.sprite.x, ed.sprite.y);
            if(d<nd){nd=d; nearest=ed;}
          });
          tgt = nearest;
          missile.setData('target', tgt);
        }
        // ホーミング: ターゲット方向への角度差を少しずつ補正
        if(tgt && tgt.sprite){
          const desiredAng = Phaser.Math.Angle.Between(missile.x, missile.y, tgt.sprite.x, tgt.sprite.y);
          let curAng = Math.atan2(missile.getData('vy'), missile.getData('vx'));
          let diff = desiredAng - curAng;
          while(diff > Math.PI) diff -= Math.PI*2;
          while(diff < -Math.PI) diff += Math.PI*2;
          const maxTurn = turnRate * (16/1000);
          const turn = Phaser.Math.Clamp(diff, -maxTurn, maxTurn);
          curAng += turn;
          missile.setData('vx', Math.cos(curAng)*speed);
          missile.setData('vy', Math.sin(curAng)*speed);
          missile.rotation = curAng;
        }
        // 移動
        missile.x += missile.getData('vx') * (16/1000);
        missile.y += missile.getData('vy') * (16/1000);
        // 煙・炎の軌跡
        if(Math.random() < 0.7){
          const trail = this.add.circle(missile.x - Math.cos(missile.rotation)*8, missile.y - Math.sin(missile.rotation)*8, 4 + Math.random()*3, 0xff8844, 0.7).setDepth(7);
          this.tweens.add({
            targets: trail,
            scaleX: 0.3, scaleY: 0.3, alpha: 0,
            duration: 400,
            onComplete: ()=>trail.destroy(),
          });
        }
        // 命中判定(近接の敵に当たれば爆発)
        this.enemyDataList.forEach(ed=>{
          if(ed.dead || !ed.sprite || missile.getData('exploded')) return;
          if(Phaser.Math.Distance.Between(missile.x, missile.y, ed.sprite.x, ed.sprite.y) < 24){
            this._explodeMissile(missile);
            trailLoop.remove();
          }
        });
      },
    });
  }

  // ホーミングミサイル爆発処理
  _explodeMissile(missile){
    if(missile.getData('exploded')) return;
    missile.setData('exploded', true);
    const ex = missile.x, ey = missile.y;
    const radius = missile.getData('radius') || 55;
    const dmg = missile.getData('dmg') || 1;
    const isCrit = missile.getData('isCrit') || false;
    const element = missile.getData('element') || 'fire';
    // 爆発エフェクト
    const flame = this.add.circle(ex, ey, 20, 0xff8844, 0.85).setDepth(20);
    this.tweens.add({
      targets: flame,
      scaleX: radius/20, scaleY: radius/20, alpha: 0,
      duration: 400,
      onComplete: ()=>flame.destroy(),
    });
    const core = this.add.circle(ex, ey, 12, 0xffffff, 1).setDepth(21);
    this.tweens.add({
      targets: core,
      scaleX: 2.5, scaleY: 2.5, alpha: 0,
      duration: 250,
      onComplete: ()=>core.destroy(),
    });
    // 火の粉
    for(let k=0;k<8;k++){
      const sa = (k/8)*Math.PI*2;
      const sp = this.add.circle(ex, ey, 3, k%2?0xffaa44:0xff6622, 0.9).setDepth(21);
      this.tweens.add({
        targets: sp,
        x: ex + Math.cos(sa)*radius*0.8,
        y: ey + Math.sin(sa)*radius*0.8,
        alpha: 0,
        duration: 500,
        onComplete: ()=>sp.destroy(),
      });
    }
    this.cameras.main.shake(150, 0.008);
    SE('explode');
    // 範囲内の敵にダメージ
    this.enemyDataList.forEach(ed=>{
      if(ed.dead || !ed.sprite) return;
      if(Phaser.Math.Distance.Between(ex, ey, ed.sprite.x, ed.sprite.y) < radius){
        const em = getElementMult(element, ed.element||'none');
        const finalDmg = Math.max(1, Math.floor((isCrit?dmg*2:dmg) * em.mult));
        this.hitEnemy(ed, finalDmg, isCrit, false, em.label);
      }
    });
    // ミサイル本体を破棄
    try{missile.destroy();}catch(e){}
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
    b.setData('boostHits',opt.boostHits||1); // ブーストアタック多段数
    b.setData('pierce',opt.pierce||false);
    b.setData('element',opt.element||'none'); // 弾の属性
    b.rotation=ang;
    return b;
  }

  throwBomb(sx,sy,tx,ty,opt){
    // 放物線：tweenで放物線移動
    const bx=(sx+tx)/2, by=Math.min(sy,ty)-80;
    const bomb=this.add.image(sx,sy,'proj_bomb').setDisplaySize(20,20).setDepth(7);
    this.tweens.add({
      targets:bomb,
      x:{value:tx,duration:320,ease:'Linear'},
      y:{value:ty,duration:320,ease:'Quad.easeIn'},
      onComplete:()=>{
        bomb.destroy();
        const R=opt.radius;
        if(opt.isHyper){
          // ── ハイパーボム専用エフェクト（攻撃範囲と一致）──
          // 中心フラッシュ
          const fl=this.add.circle(tx,ty,R*0.4,0xffffff,1.0).setDepth(26);
          this.tweens.add({targets:fl,alpha:0,scaleX:0.1,scaleY:0.1,duration:200,onComplete:()=>fl.destroy()});
          // メインリング（攻撃範囲と完全一致）
          const r1=this.add.circle(tx,ty,8,0xff6600,0).setStrokeStyle(7,0xff6600,1.0).setDepth(25);
          this.tweens.add({targets:r1,scaleX:R/8,scaleY:R/8,alpha:0,duration:600,ease:'Cubic.easeOut',onComplete:()=>r1.destroy()});
          // 外リング
          const r2=this.add.circle(tx,ty,8,0xffcc00,0).setStrokeStyle(4,0xffcc00,0.8).setDepth(24);
          this.tweens.add({targets:r2,scaleX:R*1.08/8,scaleY:R*1.08/8,alpha:0,duration:750,ease:'Cubic.easeOut',delay:60,onComplete:()=>r2.destroy()});
          // 内リング
          const r3=this.add.circle(tx,ty,8,0xffffff,0).setStrokeStyle(5,0xffffff,0.9).setDepth(26);
          this.tweens.add({targets:r3,scaleX:R*0.5/8,scaleY:R*0.5/8,alpha:0,duration:300,ease:'Cubic.easeOut',onComplete:()=>r3.destroy()});
          // 大量パーティクル（20粒・範囲全体）
          const pcols=[0xff6600,0xffcc00,0xff2200,0xffffff,0xff8800];
          for(let i=0;i<20;i++){
            const a=(i/20)*Math.PI*2+(Math.random()-0.5)*0.3;
            const dist=R*(0.2+Math.random()*0.85);
            const sz=Phaser.Math.Between(6,16);
            const dot=this.add.circle(tx,ty,sz,pcols[i%pcols.length],1.0).setDepth(25);
            this.tweens.add({targets:dot,x:tx+Math.cos(a)*dist,y:ty+Math.sin(a)*dist,alpha:0,scaleX:0.1,scaleY:0.1,duration:Phaser.Math.Between(400,800),ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
          }
          // 爆発画像も大きく
          const exp=this.add.image(tx,ty,'fx_explosion').setDisplaySize(R,R).setDepth(24);
          this.tweens.add({targets:exp,alpha:0,scaleX:1.5,scaleY:1.5,duration:400,onComplete:()=>exp.destroy()});
        }else{
          // 通常爆弾エフェクト（爆発半径Rに完全一致）
          // 中心フラッシュ
          const fl=this.add.circle(tx,ty,R*0.35,0xffffff,0.9).setDepth(16);
          this.tweens.add({targets:fl,alpha:0,scaleX:0.1,scaleY:0.1,duration:180,onComplete:()=>fl.destroy()});
          // メインリング（半径R）
          const er1=this.add.circle(tx,ty,8,0xff6600,0).setStrokeStyle(5,0xff6600,1.0).setDepth(15);
          this.tweens.add({targets:er1,scaleX:R/8,scaleY:R/8,alpha:0,duration:500,ease:'Cubic.easeOut',onComplete:()=>er1.destroy()});
          // 外リング
          const er2=this.add.circle(tx,ty,8,0xffcc00,0).setStrokeStyle(3,0xffcc00,0.7).setDepth(14);
          this.tweens.add({targets:er2,scaleX:R*1.1/8,scaleY:R*1.1/8,alpha:0,duration:620,delay:50,ease:'Cubic.easeOut',onComplete:()=>er2.destroy()});
          // パーティクル
          const pcnt=Math.min(12,Math.floor(R/10));
          for(let i=0;i<pcnt;i++){
            const a=(i/pcnt)*Math.PI*2;
            const dist=R*(0.3+Math.random()*0.75);
            const dot=this.add.circle(tx,ty,Phaser.Math.Between(4,10),[0xff6600,0xffcc00,0xff2200,0xff8800][i%4],1).setDepth(15);
            this.tweens.add({targets:dot,x:tx+Math.cos(a)*dist,y:ty+Math.sin(a)*dist,alpha:0,scaleX:0.1,scaleY:0.1,duration:Phaser.Math.Between(300,600),ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
          }
          // 爆発画像（Rサイズ）
          const exp=this.add.image(tx,ty,'fx_explosion').setDisplaySize(R*1.2,R*1.2).setDepth(14);
          this.tweens.add({targets:exp,alpha:0,scaleX:1.3,scaleY:1.3,duration:350,onComplete:()=>exp.destroy()});
        }
        // 範囲ダメージ(opt.element 属性を適用)
        const bombElem=opt.element||'none';
        this.enemyDataList.forEach(ed=>{
          if(ed.dead)return;
          const d=Phaser.Math.Distance.Between(tx,ty,ed.sprite.x,ed.sprite.y);
          if(d<=R){
            const decay=1-d/R*0.6;
            let dmg=Math.max(1,Math.floor(opt.dmg*decay));
            // 属性相性
            const em=getElementMult(bombElem, ed.element||'none');
            if(em.mult!==1.0) dmg=Math.max(1, Math.floor(dmg*em.mult));
            this.hitEnemy(ed,dmg,opt.isCrit,opt.isSkill||false,em.label);
          }
        });
        this.cameras.main.shake(opt.isHyper?400:200,opt.isHyper?0.02:0.008);
      }
    });
  }

  // ── スキル ────────────────────────────────────
  // ── スキル定義（④ 3スキル対応）────────────────
  getSkillDefs(){
    // 覚醒中は専用のスキル群を返す
    const pd=this.playerData;
    if(pd && pd.awakened && AWAKENINGS[pd.awakened]){
      return AWAKENINGS[pd.awakened].skills;
    }
    // 各職業のスキル3種定義（要件書§4）
    return {
      novice:[
        {id:'sk1',name:'スーパーアタック',cost:5, cd:1.5,desc:'単体に強力な一撃 (Lv5でATK×4.5倍)'},
        {id:'sk2',name:'手当',          cost:8, cd:4,  desc:'自分のHPを回復 (Lv5で40%回復)'},
      ],
      warrior:[
        {id:'sk1',name:'烈風斬',    cost:20,cd:2,  desc:'周囲140px全敵に4倍ダメージ'},
        {id:'sk2',name:'ハードガード',cost:15,cd:4, desc:'DEF+30・6秒間'},
        {id:'sk3',name:'パリィ',    cost:10,cd:6,  desc:'20秒間ダメージ無効化'},
        {id:'sk4',name:'バーサクパワー',cost:20,cd:25,desc:'20秒間攻撃速度1.5倍（Lv10:30秒・2倍）',bookRequired:'warrior'},
      ],
      mage:[
        {id:'sk1',name:'大爆発',    cost:30,cd:2.5,desc:'周囲220px全敵に6倍魔法ダメージ'},
        {id:'sk2',name:'フロスト',  cost:25,cd:3.5,desc:'周囲160pxの敵を3秒凍結'},
        {id:'sk3',name:'ボルテックス',cost:20,cd:2,desc:'貫通する雷の弾を発射'},
        {id:'sk4',name:'メテオーム', cost:60,cd:15, desc:'巨大隕石・大爆発の3倍ダメージ（詠唱10秒）'},
      ],
      archer:[
        {id:'sk1',name:'5方向射撃', cost:15,cd:1.5,desc:'5方向同時に矢を放つ'},
        {id:'sk2',name:'グロリアスショット',cost:20,cd:5,desc:'20秒間クリティカル率×5'},
        {id:'sk3',name:'バルカン',  cost:30,cd:3,  desc:'前方に連射'},
        {id:'sk4',name:'ブーストアタック',cost:0,cd:0,desc:'30%で2段・30%で3段ヒット（パッシブ）',bookRequired:'archer'},
      ],
      bomber:[
        {id:'sk1',name:'設置爆弾', cost:5, cd:0,  desc:'最大3個設置・敵接触で爆破'},
        {id:'sk2',name:'ボーリングボムス',cost:20,cd:3,  desc:'直線貫通→着弾で6方向爆撃'},
        {id:'sk3',name:'ハイパーボム',cost:35,cd:4,desc:'超巨大爆弾・範囲150px'},
        {id:'sk4',name:'ボマーパワー',cost:0,cd:0,desc:'通常攻撃範囲2倍（Lv10:3倍）（パッシブ）',bookRequired:'bomber'},
      ],
    }[this.playerData.cls]||[];
  }

  showBuffTimer(label,color,durationMs){
    if(!this._buffTimers)this._buffTimers={};
    // 既存バフを削除（同ラベルの再発動）
    if(this._buffTimers[label]){
      const old=this._buffTimers[label];
      if(old.timer)old.timer.remove();
      [old.bg,old.lbl,old.barBg,old.bar,old.secTxt].forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
      delete this._buffTimers[label];
    }
    const w=this.scale.width;
    const BW=180, ITEM_H=32, BASE_Y=36;
    // 現在アクティブなバフ数に応じてY座標をずらす
    const slotIndex=Object.keys(this._buffTimers).length;
    const bx=w/2, by=BASE_Y+slotIndex*ITEM_H;
    const col=Phaser.Display.Color.HexStringToColor(color.replace('#','')).color;
    const bg=this.add.rectangle(bx,by,BW+4,28,0x000000,0.75).setScrollFactor(0).setDepth(60);
    const lbl=this.add.text(bx,by-6,label,{fontSize:'11px',fontFamily:'Arial',color:color,stroke:'#000',strokeThickness:2}).setOrigin(0.5).setScrollFactor(0).setDepth(61);
    const barBg=this.add.rectangle(bx,by+6,BW,7,0x333333).setOrigin(0.5).setScrollFactor(0).setDepth(61);
    const bar=this.add.rectangle(bx-BW/2,by+6,BW,7,col).setOrigin(0,0.5).setScrollFactor(0).setDepth(62);
    const secTxt=this.add.text(bx+BW/2+8,by+6,'',{fontSize:'11px',fontFamily:'Arial',color:'#ffffff'}).setOrigin(0,0.5).setScrollFactor(0).setDepth(62);

    let elapsed=0;
    const entry={bg,lbl,barBg,bar,secTxt,timer:null,slotIndex};
    this._buffTimers[label]=entry;

    const cleanup=()=>{
      if(entry.timer){entry.timer.remove();entry.timer=null;}
      [bg,lbl,barBg,bar,secTxt].forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
      if(this._buffTimers&&this._buffTimers[label]===entry){
        delete this._buffTimers[label];
        // 削除後、残りのバフを詰めて表示
        this._repackBuffTimers();
      }
    };

    entry.timer=this.time.addEvent({
      delay:100,loop:true,
      callback:()=>{
        elapsed+=100;
        const remain=Math.max(0,(durationMs-elapsed)/1000);
        if(!secTxt.active){cleanup();return;}
        secTxt.setText(remain.toFixed(1)+'s');
        const ratio=Math.max(0,1-elapsed/durationMs);
        if(bar.active)bar.setScale(ratio,1);
        if(elapsed>=durationMs)cleanup();
      }
    });
  }

  // バフ終了後に残りのバフを上詰め
  _repackBuffTimers(){
    if(!this._buffTimers)return;
    const BW=180, ITEM_H=32, BASE_Y=36;
    const bx=this.scale.width/2;
    Object.values(this._buffTimers).forEach((entry,i)=>{
      const by=BASE_Y+i*ITEM_H;
      entry.slotIndex=i;
      if(entry.bg.active)   entry.bg.setPosition(bx,by);
      if(entry.lbl.active)  entry.lbl.setPosition(bx,by-6);
      if(entry.barBg.active)entry.barBg.setPosition(bx,by+6);
      if(entry.bar.active)  entry.bar.setPosition(bx-BW/2,by+6);
      if(entry.secTxt.active)entry.secTxt.setPosition(bx+BW/2+8,by+6);
    });
  }

  // 詠唱処理（castSec秒後にcallback実行）
  // DEXが高いほど詠唱時間が短縮（hit値で計算、最大50%短縮）
  // _startCast(label, baseSec, callback, color)
  // キャラクター頭上に詠唱バーを表示。他職業でも共通利用可。
  // DEX(hit値)が高いほど詠唱時間短縮（最大50%）
  _startCast(label,baseSec,callback,color='#cc88ff'){
    if(this._casting)return;
    const pd=this.playerData;
    const reduction=Math.min(0.5,Math.max(0,(pd.hit-80)/200));
    const castSec=baseSec*(1-reduction);
    this._casting=true;
    this.player.setVelocity(0,0);

    const p=this.player;
    const cls=this.playerData.cls;
    // 詠唱中はattack1フレームで静止（spritesheet系のみ）
    if(cls==='mage'||cls==='archer'||cls==='bomber'){
      const facing=this._facing||'front';
      // front=row0(frame3), back=row1(frame8), side=row2(frame13)
      const atkFrame={front:3,back:8,side:13}[facing]||3;
      p.anims.stop();
      p.setTexture('player_'+cls, atkFrame);
    }
    const BW=80;
    const OY=-p.displayHeight/2-22;
    const hexCol=parseInt(color.replace('#',''),16);

    // ── オーラエフェクト ─────────────────────────
    // 外側リング（大きくゆっくり脈動）
    const aura1=this.add.circle(p.x,p.y,p.displayWidth*0.7,hexCol,0.18).setDepth(3);
    const aura2=this.add.circle(p.x,p.y,p.displayWidth*0.5,hexCol,0.28).setDepth(3);
    // 内側の輝き（小さく速く脈動）
    const aura3=this.add.circle(p.x,p.y,p.displayWidth*0.3,0xffffff,0.20).setDepth(4);

    // 外リング脈動tween
    this.tweens.add({targets:aura1,scaleX:1.4,scaleY:1.4,alpha:0.05,duration:700,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
    this.tweens.add({targets:aura2,scaleX:1.2,scaleY:1.2,alpha:0.10,duration:500,yoyo:true,repeat:-1,ease:'Sine.easeInOut',delay:150});
    this.tweens.add({targets:aura3,scaleX:1.3,scaleY:1.3,alpha:0.05,duration:300,yoyo:true,repeat:-1,ease:'Sine.easeInOut',delay:80});

    // パーティクル（外側に粒子が舞う）
    const auraParticles=[];
    const PARTICLE_COUNT=8;
    for(let i=0;i<PARTICLE_COUNT;i++){
      const ang=(i/PARTICLE_COUNT)*Math.PI*2;
      const r=p.displayWidth*0.55;
      const dot=this.add.circle(
        p.x+Math.cos(ang)*r,
        p.y+Math.sin(ang)*r,
        3,hexCol,0.9
      ).setDepth(4);
      // 各粒子が円周上をゆっくり回転しながら浮遊
      this.tweens.add({
        targets:dot,
        alpha:{from:0.9,to:0.2},
        scaleX:{from:1,to:0.3},scaleY:{from:1,to:0.3},
        duration:600+i*80,
        yoyo:true,repeat:-1,
        ease:'Sine.easeInOut',
        delay:i*80,
      });
      auraParticles.push(dot);
    }
    const auraObjs=[aura1,aura2,aura3,...auraParticles];
    let auraAngle=0;

    // 詠唱バーUI（キャラ頭上）
    const castBg  =this.add.rectangle(p.x,p.y+OY,BW+4,18,0x000000,0.80).setDepth(80);
    const castLbl =this.add.text(p.x,p.y+OY-6,label,{
      fontSize:'9px',fontFamily:'Arial',
      color:color,stroke:'#000000',strokeThickness:2
    }).setOrigin(0.5).setDepth(81);
    const castBarBg=this.add.rectangle(p.x,p.y+OY+4,BW,6,0x222222).setOrigin(0.5).setDepth(81);
    const castBar  =this.add.rectangle(p.x-BW/2,p.y+OY+4,0,6,hexCol).setOrigin(0,0.5).setDepth(82);
    const castTxt  =this.add.text(p.x+BW/2+4,p.y+OY+4,'',{
      fontSize:'9px',fontFamily:'Arial',color:'#ffffff',stroke:'#000',strokeThickness:2
    }).setOrigin(0,0.5).setDepth(82);

    const objs=[castBg,castLbl,castBarBg,castBar,castTxt];

    let elapsed=0;
    const INTERVAL=50;
    const castTimer=this.time.addEvent({
      delay:INTERVAL,loop:true,
      callback:()=>{
        elapsed+=INTERVAL/1000;
        const ratio=Math.min(1,elapsed/castSec);
        const remain=Math.max(0,castSec-elapsed);
        // キャラクターに追従
        const px=p.x, py=p.y;
        if(castBg.active)   castBg.setPosition(px,py+OY);
        if(castLbl.active)  castLbl.setPosition(px,py+OY-6);
        if(castBarBg.active)castBarBg.setPosition(px,py+OY+4);
        if(castBar.active)  {castBar.setPosition(px-BW/2,py+OY+4);castBar.setSize(BW*ratio,6);}
        if(castTxt.active)  {castTxt.setPosition(px+BW/2+4,py+OY+4);castTxt.setText(remain.toFixed(1)+'s');}
        // オーラをキャラに追従・粒子を回転
        auraAngle+=0.03;
        if(aura1.active){aura1.setPosition(px,py);aura2.setPosition(px,py);aura3.setPosition(px,py);}
        auraParticles.forEach((dot,i)=>{
          if(!dot.active)return;
          const a=auraAngle+(i/PARTICLE_COUNT)*Math.PI*2;
          const r=p.displayWidth*0.55;
          dot.setPosition(px+Math.cos(a)*r,py+Math.sin(a)*r);
        });
        if(elapsed>=castSec){
          castTimer.remove();
          objs.forEach(o=>{try{if(o.active)o.destroy();}catch(e){}});
          // オーラをフェードアウトして削除
          auraObjs.forEach(o=>{
            if(!o.active)return;
            this.tweens.add({targets:o,alpha:0,duration:200,onComplete:()=>{try{o.destroy();}catch(e){}}});
          });
          this._casting=false;
          // idleアニメに戻す
          if(cls==='mage'||cls==='archer'||cls==='bomber'){
            const facing2=this._facing||'front';
            const idleKey=cls+'_'+facing2+'_idle';
            if(this.anims.exists(idleKey))p.play(idleKey,true);
          }
          callback();
        }
      }
    });
    this._castTimer=castTimer;
    this._castAuraObjs=auraObjs; // 強制キャンセル用
  }

  // AGIによる攻撃クールダウン短縮
  // AGI(agi値) × 0.008 で短縮率（最大50%）
  // 例: agi=0→0%, agi=30→24%, agi=62→50%(上限)
  _calcAtkCD(baseSec){
    const agi=this.playerData.agi||0;
    const reduction=Math.min(0.5,agi*0.008);
    return baseSec*(1-reduction);
  }

  _explodePlacedBomb(bombData,bx,by,dmg,isCrit,sz){
    if(bombData.exploded)return;
    bombData.exploded=true;
    if(bombData.checkTimer)bombData.checkTimer.remove();
    [bombData.spr,bombData.zone,bombData.txt].forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
    if(this._placedBombs){
      this._placedBombs=this._placedBombs.filter(b=>b!==bombData);
    }
    // 爆発半径 = sz/2（当たり判定と完全一致）
    const R=sz/2;
    // フラッシュ
    const fl=this.add.circle(bx,by,R*0.4,0xffffff,0.9).setDepth(26);
    this.tweens.add({targets:fl,alpha:0,scaleX:0.1,scaleY:0.1,duration:180,onComplete:()=>fl.destroy()});
    // メインリング（R半径に一致）
    const ring=this.add.circle(bx,by,8,0xff6600,0).setStrokeStyle(5,0xff6600,1.0).setDepth(25);
    this.tweens.add({targets:ring,scaleX:R/8,scaleY:R/8,alpha:0,duration:450,ease:'Cubic.easeOut',onComplete:()=>ring.destroy()});
    // 外リング
    const ring2=this.add.circle(bx,by,8,0xffcc00,0).setStrokeStyle(3,0xffcc00,0.7).setDepth(24);
    this.tweens.add({targets:ring2,scaleX:R*1.1/8,scaleY:R*1.1/8,alpha:0,duration:580,delay:50,ease:'Cubic.easeOut',onComplete:()=>ring2.destroy()});
    // 爆発画像（R×2サイズ）
    const exp=this.add.image(bx,by,'fx_explosion').setDisplaySize(R*2,R*2).setDepth(24);
    this.tweens.add({targets:exp,alpha:0,scaleX:1.3,scaleY:1.3,duration:350,onComplete:()=>exp.destroy()});
    // パーティクル（R範囲内に散らばる）
    const pcnt=Math.min(12,Math.max(6,Math.floor(R/6)));
    for(let i=0;i<pcnt;i++){
      const a=(i/pcnt)*Math.PI*2,dist=R*(0.3+Math.random()*0.75);
      const dot=this.add.circle(bx,by,Phaser.Math.Between(4,10),i%2===0?0xff6600:0xffcc00,1.0).setDepth(25);
      this.tweens.add({targets:dot,x:bx+Math.cos(a)*dist,y:by+Math.sin(a)*dist,alpha:0,scaleX:0.1,scaleY:0.1,duration:350,ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
    }
    // ダメージ判定（R半径）
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      if(Phaser.Math.Distance.Between(bx,by,ed.sprite.x,ed.sprite.y)<R+ed.sprite.displayWidth/2){
        this.hitEnemy(ed,dmg,isCrit,true);
      }
    });
    SE('explode');
    this.cameras.main.shake(150,0.006);
  }

  // アイテムを追加（上限チェック付き）
  _addItem(pd,itemId,count,showX,showY){
    if(!pd.items)pd.items={};
    const def=ITEM_DEFS[itemId];
    if(!def)return;
    const types=Object.keys(pd.items).filter(k=>pd.items[k]>0);
    const hasType=pd.items[itemId]>0;
    // 種類上限チェック
    if(!hasType&&types.length>=MAX_ITEM_TYPES){
      this.showFloat(showX,showY-30,'アイテム満杯','#ff4444','info');
      return;
    }
    // 個数上限チェック
    const current=pd.items[itemId]||0;
    const canAdd=Math.min(count,MAX_ITEM_STACK-current);
    if(canAdd<=0){
      this.showFloat(showX,showY-30,def.icon+'満杯','#ff4444','info');
      return;
    }
    pd.items[itemId]=(current+canAdd);
    this.showFloat(showX,showY-30,def.icon+' '+def.name+' +'+canAdd,'#'+def.col.toString(16).padStart(6,'0'),'info');
  }

  _updateEnterBtn(building){
    // 既存ボタンを削除
    if(this._enterBtn){
      try{this._enterBtn.destroy();}catch(e){}
      this._enterBtn=null;
    }
    if(this._enterBtnTxt){
      try{this._enterBtnTxt.destroy();}catch(e){}
      this._enterBtnTxt=null;
    }
    if(!building)return;
    const w=this.scale.width,h=this.scale.height;
    // 画面中央下に「入る」ボタンを表示
    const bx=w/2, by=h*0.72;
    const btn=this.add.rectangle(bx,by,180,44,0x1a3a5a,0.92)
      .setStrokeStyle(2,0x44aaff,1).setScrollFactor(0).setDepth(55).setInteractive({useHandCursor:true});
    const label=building.label||'建物';
    const txt=this.add.text(bx,by,label+' に入る',{
      fontSize:'15px',fontFamily:'Arial',color:'#00ccff',
      stroke:'#000',strokeThickness:3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56);
    btn.on('pointerover',()=>btn.setFillStyle(0x1a5a8a,0.95));
    btn.on('pointerout', ()=>btn.setFillStyle(0x1a3a5a,0.92));
    btn.on('pointerdown',()=>{
      this._updateEnterBtn(null); // ボタンを消してから
      this.openBuildingUI(building);
    });
    this._enterBtn=btn;
    this._enterBtnTxt=txt;
  }

  _useItem(itemId){
    const pd=this.playerData;
    if(!pd.items||!pd.items[itemId]||pd.items[itemId]<=0)return;
    const def=ITEM_DEFS[itemId];
    if(!def||!def.usable)return;
    // 覚醒中で回復禁止フラグがあれば、回復系アイテムをブロック
    if(pd.awakened && AWAKENINGS[pd.awakened] && AWAKENINGS[pd.awakened].blockHeal){
      const blocked=['hp_potion','sp_potion','elixir','antidote'];
      if(blocked.includes(itemId)){
        this.showFloat(this.player.x, this.player.y-50, '🍃 転生中は使えない', '#aaccaa', 'info');
        return;
      }
    }

    if(itemId==='town_scroll'){
      // 帰還の巻物：消費して町（stage:0）へ
      pd.items[itemId]--;
      if(pd.items[itemId]<=0)delete pd.items[itemId];
      this._closeMenu();
      // エフェクト
      this.cameras.main.flash(500,255,220,100);
      this.showFloat(this.player.x,this.player.y-60,'📜 帰還！','#ffcc44','info');
      SE('levelup');
      this.time.delayedCall(600,()=>{
        this._doTransition('Game',{playerData:pd,stage:0});
      });
    } else if(itemId==='antidote'){
      // 解毒剤：毒状態を治す
      if(!pd._poisoned){
        this.showFloat(this.player.x,this.player.y-50,'毒にかかっていません','#888888','info');
        return; // 消費しない
      }
      pd.items[itemId]--;
      if(pd.items[itemId]<=0)delete pd.items[itemId];
      this.clearPoison();
      this.showFloat(this.player.x,this.player.y-50,'🧪 毒が消えた！','#88ff88','info');
      SE('potion');
      this.updateHUD();
    }
  }

  _nearestEnemyEva(){
    // 最も近い敵のevaを返す（命中計算用）
    let minD=9999,eva=0;
    if(this.enemyDataList){
      this.enemyDataList.forEach(ed=>{
        if(ed.dead)return;
        const d=Phaser.Math.Distance.Between(this.player.x,this.player.y,ed.sprite.x,ed.sprite.y);
        if(d<minD){minD=d;eva=ed.eva||0;}
      });
    }
    return eva;
  }
  // 覚醒スキルを通常時から使う(awakIdx: 1,2,3)
  // ── セーブダイアログ(Gameシーン上のポップアップ・シーン切替なし) ──
  // ── スキル並び替えポップアップ(タップ選択→入替方式) ──
  _openSkillReorder(){
    if(this._skillReorderOpen) return;
    this._skillReorderOpen = true;
    const w = this.scale.width, h = this.scale.height;
    const pd = this.playerData;

    // 現在のスキルキー配列を取得(createSkillButtonsで設定済み)
    let keys = (this._currentSkillKeys && this._currentSkillKeys.length)
      ? this._currentSkillKeys.slice() : [];
    if(!keys.length){
      // フォールバック: 通常スキルから構築
      keys = ['n1','n2','n3'];
    }

    // キーから表示情報を取得するヘルパ
    const defs = this.getSkillDefs();
    const eqW = pd.equip && pd.equip.weapon_main;
    const eqD = eqW ? EQUIP_DEFS[eqW] : null;
    const awakKey = (eqD && eqD.awakening) ? eqD.awakening : null;
    const awakA = awakKey ? AWAKENINGS[awakKey] : null;
    const clsIcons = (CLASS_SKILLS[pd.cls]||[]).map(()=>'');
    const normalIcons = {
      warrior:['⚔','🛡','🌀','🔥'], mage:['🔮','❄','☄','🪄'],
      archer:['🏹','💨','⭐','🎯'], bomber:['💣','🧨','💥','🦾'],
      novice:['👊','✨','💫','⭐']
    }[pd.cls] || ['?','?','?','?'];
    const awakIconMap={
      samurai:['🗡','🌀','👹'], heavy:['💥','🔫','❄'],
      spirit:['🍃','✨','⭐'], youma:['🕳','🌑','🐉'],
    };
    const getInfo = (key)=>{
      if(key[0]==='n'){
        const num = parseInt(key.slice(1));
        const sk = defs[num-1] || {name:'?'};
        return { name: sk.name||'?', icon: normalIcons[num-1]||'?', col: 0x2bd4bb };
      } else {
        const ai = parseInt(key.slice(1));
        const sk = (awakA && awakA.skills) ? awakA.skills[ai-1] : null;
        const ic = (awakIconMap[awakKey]||['✨','✨','✨'])[ai-1] || '✨';
        return { name: sk?sk.name:'?', icon: ic, col: 0xff44aa };
      }
    };

    const cont = this.add.container(0,0).setDepth(130).setScrollFactor(0);
    const overlay = this.add.rectangle(0,0,w,h,0x000000,0.78).setOrigin(0).setScrollFactor(0).setDepth(130).setInteractive();
    cont.add(overlay);
    const boxW = Math.min(w-40, 560), boxH = Math.min(h-80, 360);
    const boxX = w/2, boxY = h/2;
    cont.add(this.add.rectangle(boxX,boxY,boxW,boxH,0x0a1525,0.98).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(131));
    cont.add(this.add.text(boxX, boxY-boxH/2+26, '⇄ スキル並び替え', {fontSize:'18px',fontFamily:'Arial',color:'#44ddff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(132));
    cont.add(this.add.text(boxX, boxY-boxH/2+52, 'スキルをタップして選択→もう1つタップで入れ替え', {fontSize:'12px',fontFamily:'Arial',color:'#aaccdd'}).setOrigin(0.5).setScrollFactor(0).setDepth(132));

    // 選択状態
    let selectedIdx = -1;
    let slotObjs = [];  // 各スロットの{bg,iconTxt,nameTxt,idx}

    const SLOT_W = Math.min(96, (boxW-40)/Math.max(1,keys.length) - 8);
    const SLOT_H = 96;
    const slotsY = boxY - 10;
    const totalW = keys.length*SLOT_W + (keys.length-1)*10;
    const startX = boxX - totalW/2 + SLOT_W/2;

    const renderSlots = ()=>{
      // 既存スロット破棄
      slotObjs.forEach(o=>{ try{o.bg.destroy();o.iconTxt.destroy();o.nameTxt.destroy();o.numTxt.destroy();}catch(e){} });
      slotObjs = [];
      keys.forEach((key,idx)=>{
        const info = getInfo(key);
        const sx = startX + idx*(SLOT_W+10);
        const sel = (idx===selectedIdx);
        const bg = this.add.rectangle(sx, slotsY, SLOT_W, SLOT_H, info.col, sel?0.6:0.25)
          .setStrokeStyle(sel?4:2, sel?0xffff00:info.col, 1).setScrollFactor(0).setDepth(132)
          .setInteractive({useHandCursor:true});
        cont.add(bg);
        const numTxt = this.add.text(sx-SLOT_W/2+8, slotsY-SLOT_H/2+6, (idx+1)+'', {fontSize:'12px',fontFamily:'Arial',color:'#ffff88',fontStyle:'bold'}).setOrigin(0,0).setScrollFactor(0).setDepth(133);
        cont.add(numTxt);
        const iconTxt = this.add.text(sx, slotsY-12, info.icon, {fontSize:'30px'}).setOrigin(0.5).setScrollFactor(0).setDepth(133);
        cont.add(iconTxt);
        const nm = info.name.length>5 ? info.name.substr(0,5)+'…' : info.name;
        const nameTxt = this.add.text(sx, slotsY+28, nm, {fontSize:'11px',fontFamily:'Arial',color:'#ffffff',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setScrollFactor(0).setDepth(133);
        cont.add(nameTxt);
        bg.on('pointerdown', ()=>{
          try{SE('click');}catch(e){}
          if(selectedIdx < 0){
            selectedIdx = idx;
          } else if(selectedIdx === idx){
            selectedIdx = -1;  // 選択解除
          } else {
            // 入れ替え
            const tmp = keys[selectedIdx];
            keys[selectedIdx] = keys[idx];
            keys[idx] = tmp;
            selectedIdx = -1;
          }
          renderSlots();
        });
        slotObjs.push({bg,iconTxt,nameTxt,numTxt,idx});
      });
    };
    renderSlots();

    const closeAll = ()=>{ cont.destroy(); this._skillReorderOpen = false; };

    // 保存ボタン
    const saveBtnY = boxY + boxH/2 - 30;
    const saveB = this.add.rectangle(boxX-90, saveBtnY, 150, 36, 0x0a3a1a, 0.95).setStrokeStyle(2,0x44ff88).setScrollFactor(0).setDepth(132).setInteractive({useHandCursor:true});
    cont.add(saveB);
    cont.add(this.add.text(boxX-90, saveBtnY, '✔ 保存', {fontSize:'15px',fontFamily:'Arial',color:'#88ff99',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(133));
    saveB.on('pointerdown', ()=>{
      pd.skillOrder = keys.slice();
      try{SE('levelup');}catch(e){}
      this._rebuildSkillButtons();
      closeAll();
    });
    // キャンセルボタン
    const cancelB = this.add.rectangle(boxX+90, saveBtnY, 150, 36, 0x223344, 0.95).setStrokeStyle(2,0x556677).setScrollFactor(0).setDepth(132).setInteractive({useHandCursor:true});
    cont.add(cancelB);
    cont.add(this.add.text(boxX+90, saveBtnY, '✕ キャンセル', {fontSize:'14px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(133));
    cancelB.on('pointerdown', ()=>{ try{SE('click');}catch(e){} closeAll(); });
  }

  _openSaveDialog(){
    if(this._saveDialogOpen) return;
    this._saveDialogOpen = true;
    const w = this.scale.width, h = this.scale.height;
    const pd = this.playerData;
    // 全てのダイアログ要素を保持するコンテナ
    const cont = this.add.container(0, 0).setDepth(100).setScrollFactor(0);
    // ── 半透明背景(タップ無効化) ──
    const overlay = this.add.rectangle(0, 0, w, h, 0x000000, 0.7).setOrigin(0).setScrollFactor(0).setDepth(100).setInteractive();
    overlay.on('pointerdown', ()=>{}); // 背景タップは無視
    cont.add(overlay);
    // ── ダイアログ枠 ──
    const boxW = Math.min(w-40, 480);
    const boxH = Math.min(h-60, 460);
    const boxX = w/2;
    const boxY = h/2;
    const box = this.add.rectangle(boxX, boxY, boxW, boxH, 0x0a1525, 0.98).setStrokeStyle(2, 0x44aa44).setScrollFactor(0).setDepth(101);
    cont.add(box);
    // ── タイトル ──
    const titleY = boxY - boxH/2 + 28;
    cont.add(this.add.text(boxX, titleY, '💾 セーブスロットを選択', {
      fontSize:'18px', fontFamily:'Arial', color:'#ffd700', stroke:'#000', strokeThickness:2, fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102));

    // ── スロットカード ──
    const SLOT_H = 90;
    const SLOT_W = boxW - 40;
    const startY = titleY + 30;

    // ダイアログ閉じる関数
    const closeDialog = ()=>{
      cont.destroy();
      this._saveDialogOpen = false;
    };

    for(let slot=1; slot<=SAVE_SLOTS; slot++){
      const save = getSaveData(slot);
      const sy = startY + (slot-1)*(SLOT_H+8) + SLOT_H/2;
      const sx = boxX;
      const isEmpty = (save === null);
      // スロット背景
      const slotBg = this.add.rectangle(sx, sy, SLOT_W, SLOT_H, isEmpty?0x0a1a2a:0x1a1400, 0.9)
        .setStrokeStyle(2, isEmpty?0x44aaff:0xffaa00).setScrollFactor(0).setDepth(101).setInteractive({useHandCursor:true});
      cont.add(slotBg);

      // スロット番号
      cont.add(this.add.text(sx-SLOT_W/2+12, sy-SLOT_H/2+10, 'スロット '+slot, {
        fontSize:'12px', fontFamily:'Arial', color:'#aaaaaa'
      }).setOrigin(0,0).setScrollFactor(0).setDepth(102));

      if(isEmpty){
        cont.add(this.add.text(sx, sy+4, '＋ ここにセーブする', {
          fontSize:'16px', fontFamily:'Arial', color:'#44aaff', fontStyle:'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(102));
        slotBg.on('pointerover', ()=>slotBg.setFillStyle(0x1a2a3a, 0.95));
        slotBg.on('pointerout', ()=>slotBg.setFillStyle(0x0a1a2a, 0.9));
        slotBg.on('pointerdown', ()=>{
          this._performSave(slot);
          closeDialog();
        });
      } else {
        // クラスアイコン
        const clsIcon = {novice:'⭐',warrior:'⚔',mage:'🪄',archer:'🏹',bomber:'💣'}[save.cls]||'❓';
        const clsCol = {novice:'#88ccff',warrior:'#e74c3c',mage:'#9b59b6',archer:'#27ae60',bomber:'#f39c12'}[save.cls]||'#ffffff';
        cont.add(this.add.text(sx-SLOT_W/2+30, sy+8, clsIcon, {fontSize:'24px'}).setOrigin(0.5).setScrollFactor(0).setDepth(102));
        // 情報
        cont.add(this.add.text(sx-SLOT_W/2+60, sy-15, (save.clsName||'?')+' / Lv'+(save.lv||1), {
          fontSize:'15px', fontFamily:'Arial', color:'#ffffff', fontStyle:'bold'
        }).setOrigin(0,0.5).setScrollFactor(0).setDepth(102));
        cont.add(this.add.text(sx-SLOT_W/2+60, sy+4, '📍 '+(save.stageName||''), {
          fontSize:'12px', fontFamily:'Arial', color:'#aaddff'
        }).setOrigin(0,0.5).setScrollFactor(0).setDepth(102));
        cont.add(this.add.text(sx-SLOT_W/2+60, sy+22, '💰 '+(save.gold||0)+'G  🕐 '+(save.savedAt||''), {
          fontSize:'10px', fontFamily:'Arial', color:'#888888'
        }).setOrigin(0,0.5).setScrollFactor(0).setDepth(102));
        // 上書きセーブ
        slotBg.on('pointerover', ()=>slotBg.setFillStyle(0x2a2000, 0.95));
        slotBg.on('pointerout', ()=>slotBg.setFillStyle(0x1a1400, 0.9));
        slotBg.on('pointerdown', ()=>{
          // 上書き確認
          this._confirmOverwriteInGame(slot, save, ()=>{
            this._performSave(slot);
            closeDialog();
          });
        });
      }
    }

    // ── 閉じるボタン ──
    const closeBtnY = boxY + boxH/2 - 28;
    const closeBtn = this.add.rectangle(boxX, closeBtnY, 140, 32, 0x223344, 0.9)
      .setStrokeStyle(1, 0x556677).setScrollFactor(0).setDepth(102).setInteractive({useHandCursor:true});
    cont.add(closeBtn);
    cont.add(this.add.text(boxX, closeBtnY, '✕ 閉じる', {
      fontSize:'14px', fontFamily:'Arial', color:'#aaaaaa'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(103));
    closeBtn.on('pointerover', ()=>closeBtn.setFillStyle(0x445566, 0.95));
    closeBtn.on('pointerout', ()=>closeBtn.setFillStyle(0x223344, 0.9));
    closeBtn.on('pointerdown', ()=>{
      try{SE('click');}catch(e){}
      closeDialog();
    });
  }

  // 実際のセーブ処理
  _performSave(slot){
    const pd = this.playerData;
    const summary = (typeof makeSaveSummary === 'function') ? makeSaveSummary(pd, this.stage) : {};
    const cleanPd = (typeof sanitizePlayerData === 'function') ? sanitizePlayerData(pd) : pd;
    setSaveData(slot, {playerData:cleanPd, stage:this.stage, summary});
    // セーブしたスロットを記憶(次回ボタン押下で自動上書き)
    this.currentSlot = slot;
    // 完了メッセージ(画面中央に2秒間)
    const w = this.scale.width, h = this.scale.height;
    const msgBg = this.add.rectangle(w/2, h/2, 320, 50, 0x0a3a0a, 0.95).setStrokeStyle(2, 0x44ff88).setScrollFactor(0).setDepth(110);
    const msgTxt = this.add.text(w/2, h/2, '💾 スロット'+slot+' にセーブしました！', {
      fontSize:'16px', fontFamily:'Arial', color:'#88ff88', fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(111);
    try{SE('levelup');}catch(e){}
    this.time.delayedCall(1500, ()=>{
      try{msgBg.destroy();msgTxt.destroy();}catch(e){}
    });
  }

  // 上書き確認ダイアログ
  // 汎用確認ダイアログ: タイトル + 本文(複数行可) + Yes/No
  // opts: { yesLabel, noLabel, yesColor, noColor }
  _confirmDialog(title, message, onYes, opts){
    opts = opts || {};
    const w = this.scale.width, h = this.scale.height;
    const cont = this.add.container(0, 0).setDepth(120).setScrollFactor(0);
    const overlay = this.add.rectangle(0, 0, w, h, 0x000000, 0.7).setOrigin(0).setScrollFactor(0).setDepth(120).setInteractive();
    cont.add(overlay);
    const lines = (message||'').split('\n');
    const boxH = 130 + lines.length*18;
    const box = this.add.rectangle(w/2, h/2, 360, boxH, 0x0a1525, 0.98).setStrokeStyle(2, 0xffaa00).setScrollFactor(0).setDepth(121);
    cont.add(box);
    cont.add(this.add.text(w/2, h/2 - boxH/2 + 24, title, {
      fontSize:'16px', fontFamily:'Arial', color:'#ffaa00', fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(122));
    lines.forEach((ln,i)=>{
      cont.add(this.add.text(w/2, h/2 - boxH/2 + 50 + i*18, ln, {
        fontSize:'12px', fontFamily:'Arial', color:'#cccccc', align:'center'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(122));
    });
    const close = ()=>cont.destroy();
    const yesCol = opts.yesColor || 0x44aa44;
    const noCol = opts.noColor || 0x556677;
    const yes = this.add.rectangle(w/2-80, h/2 + boxH/2 - 30, 130, 36, (yesCol&0x111111)|0x101010, 0.95)
      .setStrokeStyle(2, yesCol).setScrollFactor(0).setDepth(122).setInteractive({useHandCursor:true});
    cont.add(yes);
    cont.add(this.add.text(w/2-80, h/2 + boxH/2 - 30, opts.yesLabel||'はい', {fontSize:'14px',fontFamily:'Arial',color:'#88ff88',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(123));
    yes.on('pointerdown', ()=>{ try{SE('click');}catch(e){} close(); if(onYes) onYes(); });
    const no = this.add.rectangle(w/2+80, h/2 + boxH/2 - 30, 130, 36, 0x1a2a3a, 0.95)
      .setStrokeStyle(2, noCol).setScrollFactor(0).setDepth(122).setInteractive({useHandCursor:true});
    cont.add(no);
    cont.add(this.add.text(w/2+80, h/2 + boxH/2 - 30, opts.noLabel||'キャンセル', {fontSize:'13px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(123));
    no.on('pointerdown', ()=>{ try{SE('click');}catch(e){} close(); });
  }

  _confirmOverwriteInGame(slot, existing, onConfirm){
    const w = this.scale.width, h = this.scale.height;
    const cont = this.add.container(0, 0).setDepth(120).setScrollFactor(0);
    const overlay = this.add.rectangle(0, 0, w, h, 0x000000, 0.7).setOrigin(0).setScrollFactor(0).setDepth(120).setInteractive();
    cont.add(overlay);
    const box = this.add.rectangle(w/2, h/2, 340, 180, 0x0a1525, 0.98).setStrokeStyle(2, 0xffaa00).setScrollFactor(0).setDepth(121);
    cont.add(box);
    cont.add(this.add.text(w/2, h/2-50, '⚠ 上書きしますか？', {
      fontSize:'17px', fontFamily:'Arial', color:'#ffaa00', fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(122));
    cont.add(this.add.text(w/2, h/2-15, '既存: '+(existing.clsName||'?')+' Lv'+(existing.lv||1), {
      fontSize:'13px', fontFamily:'Arial', color:'#cccccc'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(122));

    const close = ()=>cont.destroy();
    // YES
    const yes = this.add.rectangle(w/2-80, h/2+40, 130, 36, 0x3a1414, 0.95)
      .setStrokeStyle(2, 0xff4444).setScrollFactor(0).setDepth(122).setInteractive({useHandCursor:true});
    cont.add(yes);
    cont.add(this.add.text(w/2-80, h/2+40, '上書き', {fontSize:'15px',fontFamily:'Arial',color:'#ff8888',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(123));
    yes.on('pointerdown', ()=>{ close(); if(onConfirm) onConfirm(); });
    // NO
    const no = this.add.rectangle(w/2+80, h/2+40, 130, 36, 0x1a2a3a, 0.95)
      .setStrokeStyle(2, 0x556677).setScrollFactor(0).setDepth(122).setInteractive({useHandCursor:true});
    cont.add(no);
    cont.add(this.add.text(w/2+80, h/2+40, 'キャンセル', {fontSize:'14px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(123));
    no.on('pointerdown', ()=>{ close(); });
  }

  useAwakSkill(awakIdx, overrideAwakKey){
    const pd = this.playerData;
    const p = this.player;
    if(!p) return;
    // 呼び出し元(スキルボタン)が awakKey を渡してきたらそれを優先。
    // 渡されない場合のみ、装備中の覚醒武器から推定する(旧挙動の互換)。
    // これにより、装備中と異なる覚醒のスキル(例: リヴァイアリー装備中のダークストライク)も
    // 学習済みなら発動できる。
    let awakKey;
    if(overrideAwakKey){
      awakKey = overrideAwakKey;
    } else {
      const eqW = pd.equip && pd.equip.weapon_main;
      const eqD = eqW ? EQUIP_DEFS[eqW] : null;
      awakKey = (eqD && eqD.awakening) ? eqD.awakening : null;
    }
    if(!awakKey) return;
    // 覚醒スキルレベル取得(覚醒中は MAX(10) 扱いにして 3 スキルすべて発動可)
    let lv = pd.awakSkillLv && pd.awakSkillLv[awakKey] && pd.awakSkillLv[awakKey]['sk'+awakIdx] || 0;
    if(pd.awakened === awakKey){
      lv = 10;
    }
    if(lv <= 0){
      this.showFloat(p.x, p.y-50, '覚醒スキル未習得', '#888888', 'info');
      return;
    }
    // スキル定義取得
    const A = AWAKENINGS[awakKey];
    if(!A || !A.skills) return;
    const sk = A.skills[awakIdx-1];
    if(!sk) return;
    // CDキー(覚醒スキル専用)
    const cdKey = 'awakCD'+awakIdx;
    if((this[cdKey]||0) > 0) return;
    if(this._casting) return;
    // SPチェック(Lv反映: 高Lvほどコスト軽減)
    const costMul = Math.max(0.6, 1 - (lv-1) * 0.04);  // Lv1=1.0倍、Lv10=0.64倍
    const cost = Math.floor(sk.cost * costMul);
    if(pd.sp < cost){
      this.showFloat(p.x, p.y-50, 'SP不足', '#3498db', 'info');
      return;
    }
    pd.sp -= cost;
    SE('skill');
    // ── 覚醒スキル発動: 既存の useSkill 処理を流用するため、一時的に awakened をセット ──
    // 既に覚醒中ならそのまま、覚醒中でなければ一時的にフラグを立てる
    const wasAwakened = pd.awakened;
    let pseudoAwaken = false;
    if(!wasAwakened){
      pd.awakened = awakKey;
      pseudoAwaken = true;
    }
    // useSkill内のpd[skKey]===0チェックを回避するため、一時的にスキルLvをセット
    const skKey = 'sk'+awakIdx;
    const origSkLv = pd[skKey];
    if(!origSkLv || origSkLv === 0){
      pd[skKey] = lv;  // 覚醒スキルのLvで一時上書き
    }
    // skNum(1/2/3)で発動 — useSkill 内の覚醒スキル分岐に入る
    // ただしSP消費は既に済ませているので、useSkillの該当部分を抜粋して呼ぶ必要がある
    // 簡略化: useSkillをそのまま呼ぶ(SP は2重消費されるが上で-=済みなのでロールバック)
    pd.sp += cost;  // useSkillが再消費するのでここで戻す
    this.useSkill(awakIdx);
    // 元のフラグに戻す(疑似覚醒のみ)
    if(pseudoAwaken){
      pd.awakened = null;
    }
    // 通常スキルLvも元に戻す
    if(!origSkLv || origSkLv === 0){
      pd[skKey] = origSkLv || 0;
    }
    // useSkill が skillCD'+awakIdx を設定するが、覚醒中は CD オーバーレイで
    // awakCD のみ追跡されるため skillCD が減算されず永久に残ってしまう。
    // 結果 2 回目以降の useSkill 呼び出しが silent return される(発動しないバグ)。
    // 覚醒スキルの CD は this[cdKey]=awakCD で別管理するので skillCD はクリアする。
    this['skillCD'+awakIdx] = 0;
    // CD設定(Lv反映: 高Lvほどcd短縮)
    const cdMul = Math.max(0.6, 1 - (lv-1) * 0.04);
    this[cdKey] = sk.cd * cdMul;
  }

  useSkill(num=1){
    const pd=this.playerData,p=this.player;
    const defs=this.getSkillDefs();
    const sk=defs[num-1]; if(!sk)return;
    const skKey='sk'+num;
    if(pd[skKey]===0){this.showFloat(p.x,p.y-50,'スキル未習得','#888888','info');return;}
    // 覚醒中(natural / useAwakSkill 経由の pseudo)は CD を awakCD'+num に書く。
    // skillCD'+num に書くと、useAwakSkill の非同期 stop() が呼ばれた瞬間に
    // スロット同番の通常スキル(例: 大爆発 slot1)が CD 表示になるバグになる。
    const cdKey = pd.awakened ? ('awakCD'+num) : ('skillCD'+num);
    if((this[cdKey]||0)>0)return;
    if(this._casting){return;} // 詠唱中は新しいスキル不可
    if(pd.sp<sk.cost){this.showFloat(p.x,p.y-50,'SP不足','#3498db','info');return;}
    pd.sp-=sk.cost;
    SE('skill');

    // ─ 覚醒「重装兵器」(ヘヴィ) ─
    if(pd.awakened==='heavy'){
      if(num===1){ // エンペラーボムズ: 上空に投げて画面範囲ダメージ
        // 上空にドクロ爆弾を投げる演出
        const cam = this.cameras.main;
        // ドクロ爆弾(プレイヤー位置から上空へ)
        const bomb = this.add.image(p.x, p.y, 'pop_skull').setOrigin(0.5).setDepth(20).setDisplaySize(56, 56);
        this.tweens.add({
          targets: bomb,
          y: p.y - 600,
          rotation: Math.PI * 4,
          scaleX: 1.5, scaleY: 1.5,
          duration: 1200,
          ease: 'Sine.easeOut',
          onComplete: ()=>{
            bomb.destroy();
            // 着弾: 画面全体に巨大な赤い閃光
            this.cameras.main.flash(800, 255, 100, 50);
            this.cameras.main.shake(500, 0.025);
            // 画面範囲のドクロ爆発エフェクト(長めに表示)
            const skullExp = this.add.image(p.x, p.y-50, 'pop_skull').setOrigin(0.5).setDepth(25).setDisplaySize(140, 140).setAlpha(0).setScale(0.3);
            // 1段階目: 一気にドーン!と出現(200ms・半透明)
            this.tweens.add({
              targets: skullExp,
              alpha: 0.55,
              scaleX: 3.5, scaleY: 3.5,
              duration: 200,
              ease: 'Back.easeOut',
              onComplete: ()=>{
                // 2段階目: 大きいまま少し揺れる(700ms)
                this.tweens.add({
                  targets: skullExp,
                  scaleX: 3.7, scaleY: 3.3,
                  duration: 350,
                  yoyo: true,
                  ease: 'Sine.easeInOut',
                  onComplete: ()=>{
                    // 3段階目: ゆっくりフェードアウト(800ms)
                    this.tweens.add({
                      targets: skullExp,
                      alpha: 0,
                      scaleX: 4.5, scaleY: 4.5,
                      duration: 800,
                      ease: 'Cubic.easeIn',
                      onComplete: ()=>skullExp.destroy(),
                    });
                  },
                });
              },
            });
            // 拡散リング
            for(let i=0;i<5;i++){
              const r=this.add.circle(p.x, p.y, 30, 0xff4422, 0).setStrokeStyle(6, 0xff8844, 0.9).setDepth(20);
              this.tweens.add({
                targets:r, scaleX:15, scaleY:15, alpha:0,
                duration:800+i*100, delay:i*60,
                onComplete:()=>r.destroy(),
              });
            }
            // ── 3連爆風(各回1/3ずつのダメージ・最後に合算表示)──
            const cw = this.scale.width / cam.zoom;
            const ch = this.scale.height / cam.zoom;
            const screenLeft = cam.scrollX;
            const screenTop = cam.scrollY;
            const dmgBase = Math.max(1, Math.floor(pd.atk * 9.0 + (pd.mag||0) * 3));
            // 1回あたりのダメージ(全3回で計 dmgBase 相当になるように分割)
            const perWave = Math.floor(dmgBase / 3);
            // 各敵ごとの累積ダメ追跡
            const totalsByEnemy = new Map();
            // 3回の爆風を順に発生
            for(let w=0; w<3; w++){
              this.time.delayedCall(w*350, ()=>{
                // 爆風の追加リング(色が徐々に変化)
                const waveColors = [0xff8844, 0xffaa44, 0xff4422];
                const waveCol = waveColors[w];
                for(let k=0;k<3;k++){
                  const r = this.add.circle(p.x, p.y, 30, waveCol, 0).setStrokeStyle(5, waveCol, 0.85).setDepth(20);
                  this.tweens.add({
                    targets:r, scaleX:12, scaleY:12, alpha:0,
                    duration: 600+k*80, delay:k*40,
                    onComplete:()=>r.destroy(),
                  });
                }
                // 中心の閃光
                const flash = this.add.circle(p.x, p.y, 60, waveCol, 0.5).setDepth(19);
                this.tweens.add({targets:flash, scaleX:3, scaleY:3, alpha:0, duration:400, onComplete:()=>flash.destroy()});
                this.cameras.main.shake(200, 0.012);

                // この爆風による全敵ダメージ
                this.enemyDataList.forEach(ed=>{
                  if(ed.dead) return;
                  const ex = ed.sprite.x, ey = ed.sprite.y;
                  if(ex>=screenLeft && ex<=screenLeft+cw && ey>=screenTop && ey<=screenTop+ch){
                    const isCrit = Math.random()*100 < calcCrit(pd);
                    const waveDmg = isCrit ? Math.floor(perWave*2) : perWave;
                    this.hitEnemy(ed, waveDmg, isCrit, true, '');
                    // 累積ダメージを蓄積(最後の合算表示用)
                    const prev = totalsByEnemy.get(ed) || 0;
                    totalsByEnemy.set(ed, prev + waveDmg);
                  }
                });
              });
            }
            // 3波目の少し後に合算ダメージ表示
            this.time.delayedCall(3*350 + 250, ()=>{
              totalsByEnemy.forEach((total, ed)=>{
                if(ed.dead || !ed.sprite) return;
                this.showTotalDamage(ed.sprite.x, ed.sprite.y, total);
              });
            });
            // 中心に火柱を残す
            for(let i=0;i<8;i++){
              const ang = (i/8) * Math.PI * 2;
              const fx = p.x + Math.cos(ang) * 60;
              const fy = p.y + Math.sin(ang) * 60;
              const fire = this.add.circle(fx, fy, 18, 0xff6622, 0.85).setDepth(20);
              this.tweens.add({
                targets:fire, scaleX:0, scaleY:0, alpha:0,
                duration: 1500,
                onComplete: ()=>fire.destroy(),
              });
            }
          },
        });
        this.showFloat(p.x, p.y-80, '💀 エンペラーボムズ', '#ff8844');
        try{SE('bigbomb');SE('explode');}catch(e){}
        this[cdKey]=sk.cd;
      }else if(num===2){ // マシンガン: 15連射の多段攻撃
        // 発射中はさらに速度を半減(踏ん張って撃つ感)
        const origSpd = pd.spd;
        pd.spd = Math.floor(origSpd * 0.5);
        // 「足が止まる」演出として小さなマズルアシスト円(プレイヤー追従)
        const stance=this.add.circle(p.x, p.y+20, 30, 0xffaa44, 0.3).setStrokeStyle(2, 0xffcc66, 0.6).setDepth(4);
        // 追従ループ
        const stanceFollow = this.time.addEvent({
          delay: 16,
          loop: true,
          callback: ()=>{
            if(stance && stance.scene && this.player){
              stance.x = this.player.x;
              stance.y = this.player.y + 20;
            }
          },
        });
        // 発射前のタメ演出
        const charge=this.add.circle(p.x, p.y, 20, 0xffaa44, 0).setStrokeStyle(3, 0xffcc66, 0.9).setDepth(15);
        this.tweens.add({
          targets: charge,
          scaleX: 2.5, scaleY: 2.5,
          alpha: 0.7,
          duration: 800,
          onComplete: ()=>{
            charge.destroy();
            // 15連射
            const totalShots = 15;
            const interval = 80; // 80msごと
            for(let i=0;i<totalShots;i++){
              this.time.delayedCall(i*interval, ()=>{
                if(!this.player) return;
                // 最寄り敵を再取得(動く敵対応)
                let closest=null, cd=400;
                this.enemyDataList.forEach(ed=>{
                  if(ed.dead) return;
                  const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
                  if(d<cd){cd=d; closest=ed;}
                });
                if(!closest) return;
                // 弾丸エフェクト
                const ang = Phaser.Math.Angle.Between(p.x,p.y,closest.sprite.x,closest.sprite.y);
                const startX = p.x + Math.cos(ang)*20;
                const startY = p.y + Math.sin(ang)*20;
                const bullet = this.add.circle(startX, startY, 4, 0xffdd44, 1).setDepth(18);
                bullet.setStrokeStyle(2, 0xffffff, 0.9);
                this.tweens.add({
                  targets: bullet,
                  x: closest.sprite.x,
                  y: closest.sprite.y,
                  duration: 60,
                  onComplete: ()=>{
                    bullet.destroy();
                    if(closest.dead) return;
                    const baseDmg = Math.max(1, Math.floor(pd.atk * 1.0));
                    const isCrit = Math.random()*100 < calcCrit(pd);
                    const dmg = isCrit ? Math.floor(baseDmg*2) : baseDmg;
                    this.hitEnemy(closest, dmg, isCrit, true, '');
                    // ヒット火花
                    const hit = this.add.circle(closest.sprite.x, closest.sprite.y, 6, 0xffff88, 0.8).setDepth(18);
                    this.tweens.add({targets:hit, alpha:0, scaleX:2, scaleY:2, duration:120, onComplete:()=>hit.destroy()});
                  },
                });
                // 銃口閃光
                const flash = this.add.circle(startX, startY, 8, 0xffffaa, 0.85).setDepth(18);
                this.tweens.add({targets:flash, alpha:0, scaleX:1.6, scaleY:1.6, duration:80, onComplete:()=>flash.destroy()});
                this.cameras.main.shake(40, 0.003);
                try{SE('arrow');}catch(e){}
              });
            }
            // 全弾発射完了後に速度を復元
            const totalDur = totalShots * interval + 100;
            this.time.delayedCall(totalDur, ()=>{
              // 解除されてなければ元の速度に戻す(まだヘヴィ中の場合)
              if(pd.awakened==='heavy'){
                pd.spd = origSpd;
              }
              try{stanceFollow.remove();}catch(e){}
              try{stance.destroy();}catch(e){}
            });
          },
        });
        this.showFloat(p.x, p.y-80, '🔫 マシンガン', '#ffdd44');
        this[cdKey]=sk.cd;
      }else if(num===3){ // プリザーブドバスター: 正面に放つ氷属性のメガ粒子砲
        // 向きを取得(最寄り敵の方向か、最後の向き)
        let targetAng = this._lastAngle || 0;
        let nearest=null, nd=500;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<nd){nd=d; nearest=ed;}
        });
        if(nearest){
          targetAng = Phaser.Math.Angle.Between(p.x,p.y,nearest.sprite.x,nearest.sprite.y);
        }
        // ── メガ粒子砲スタイル ──
        const beamLen = 700;       // ビーム長(画面端まで届く感じ)
        const beamWidth = 80;      // ビーム太さ
        const cosA = Math.cos(targetAng);
        const sinA = Math.sin(targetAng);
        // 起点(プレイヤー前方20px・タメ中はプレイヤー追従に変更)
        let muzzleOffsetX = cosA * 20;
        let muzzleOffsetY = sinA * 20;

        // ── タメ演出(0.8秒) ──
        const chargeDur = 800;
        // 1. 砲口の光球(プレイヤー追従)
        const chargeBall = this.add.circle(p.x + muzzleOffsetX, p.y + muzzleOffsetY, 8, 0xaaeeff, 1).setDepth(20).setStrokeStyle(2, 0xffffff, 0.9);
        // 2. 足元の氷の輪っか
        const iceRing = this.add.circle(p.x, p.y+10, 30, 0x88ccff, 0).setStrokeStyle(3, 0x88ccff, 0.7).setDepth(7);
        // 光球が脈動しながら膨らむ
        this.tweens.add({
          targets: chargeBall,
          scaleX: 3.5, scaleY: 3.5,
          duration: chargeDur,
          ease: 'Cubic.easeOut',
        });
        // 氷の輪っか脈動
        this.tweens.add({
          targets: iceRing,
          scaleX: 1.8, scaleY: 1.8,
          alpha: 1,
          duration: chargeDur/2,
          yoyo: true,
        });
        // 砲口光球の追従ループ
        const chargeFollow = this.time.addEvent({
          delay: 16,
          loop: true,
          callback: ()=>{
            if(this.player && chargeBall.scene){
              chargeBall.setPosition(this.player.x + muzzleOffsetX, this.player.y + muzzleOffsetY);
            }
            if(this.player && iceRing.scene){
              iceRing.setPosition(this.player.x, this.player.y+10);
            }
          },
        });
        // 3. 周囲から青い粒子が砲口に集まる(複数発射)
        const particleCount = 18;
        for(let i=0;i<particleCount;i++){
          const delay = (i / particleCount) * (chargeDur - 200); // 700ms以内に出現
          this.time.delayedCall(delay, ()=>{
            if(!this.player) return;
            // ランダム方向の遠い位置から発生
            const ang = Math.random() * Math.PI * 2;
            const dist = 100 + Math.random() * 80;
            const sx2 = this.player.x + Math.cos(ang) * dist;
            const sy2 = this.player.y + Math.sin(ang) * dist;
            // 粒子の種類をランダム(❄ or 円 or ·)
            let particle;
            const pType = Math.random();
            if(pType < 0.4){
              particle = this.add.text(sx2, sy2, '❄', {fontSize:'18px', color:'#aaeeff'}).setOrigin(0.5).setDepth(18);
            }else if(pType < 0.75){
              particle = this.add.circle(sx2, sy2, 4 + Math.random()*3, 0xaaeeff, 0.85).setDepth(18);
            }else{
              particle = this.add.circle(sx2, sy2, 3, 0xffffff, 0.9).setDepth(18);
            }
            // 砲口に吸い込まれる(プレイヤーが動いても追従)
            const flightTime = 350 + Math.random()*150;
            const startTime2 = this.time.now;
            const flyLoop = this.time.addEvent({
              delay: 16,
              loop: true,
              callback: ()=>{
                if(!particle.scene){flyLoop.remove(); return;}
                const t = Math.min(1, (this.time.now - startTime2) / flightTime);
                const tx = this.player ? this.player.x + muzzleOffsetX : sx2;
                const ty = this.player ? this.player.y + muzzleOffsetY : sy2;
                particle.x = sx2 + (tx - sx2) * t;
                particle.y = sy2 + (ty - sy2) * t;
                particle.setAlpha(1 - t*0.5);
                if(particle.setScale) particle.setScale(1 - t*0.7);
                if(t >= 1){
                  flyLoop.remove();
                  try{particle.destroy();}catch(e){}
                }
              },
            });
          });
        }
        // 4. 足元に冷気の薄い円(タメ中ずっと見える)
        const coldCircle = this.add.circle(p.x, p.y+10, 80, 0x88ccff, 0.15).setDepth(6);
        const coldFollow = this.time.addEvent({
          delay: 16,
          loop: true,
          callback: ()=>{
            if(this.player && coldCircle.scene){
              coldCircle.setPosition(this.player.x, this.player.y+10);
            }
          },
        });

        // 5. タメ完了 → ビーム発射
        this.time.delayedCall(chargeDur, ()=>{
          // 追従ループ停止
          chargeFollow.remove();
          coldFollow.remove();
          try{chargeBall.destroy();}catch(e){}
          try{iceRing.destroy();}catch(e){}
          // 冷気円はフェードアウト
          this.tweens.add({
            targets: coldCircle,
            alpha: 0, scaleX: 1.8, scaleY: 1.8,
            duration: 400,
            onComplete: ()=>{try{coldCircle.destroy();}catch(e){}},
          });
          // 発射時の起点(プレイヤー追従後の最終位置)
          const sx = this.player.x + muzzleOffsetX;
          const sy = this.player.y + muzzleOffsetY;
          const ex = sx + cosA * beamLen;
          const ey = sy + sinA * beamLen;
          // ビーム本体発射
          this._fireMegaBeam(sx, sy, ex, ey, targetAng, beamWidth, beamLen);
          try{SE('freeze');SE('meteor');}catch(e){}
          // ダメージ判定(直線+幅判定)
          const targets = this.enemyDataList.filter(ed=>{
            if(ed.dead) return false;
            const dx = ed.sprite.x - sx;
            const dy = ed.sprite.y - sy;
            const fwd = dx*cosA + dy*sinA;
            if(fwd < 0 || fwd > beamLen) return false;
            const perp = Math.abs(dx*(-sinA) + dy*cosA);
            return perp < beamWidth/2 + 15;
          });
          targets.forEach(ed=>{
            const baseDmg = Math.max(1, Math.floor((pd.atk*4.0) + (pd.mag||0) * 7.0));
            const isCrit = Math.random()*100 < calcCrit(pd);
            const em = getElementMult('ice', ed.element||'none');
            const dmg = Math.max(1, Math.floor((isCrit ? baseDmg*2 : baseDmg) * em.mult));
            this.hitEnemy(ed, dmg, isCrit, true, em.label);
            // ヒット位置に氷の爆発
            const burst = this.add.text(ed.sprite.x, ed.sprite.y, '❄', {fontSize:'40px', color:'#aaeeff'}).setOrigin(0.5).setDepth(20);
            this.tweens.add({targets: burst, alpha:0, scaleX:2, scaleY:2, rotation:Math.PI*2, duration:500, onComplete:()=>burst.destroy()});
            // 凍結適用(マジシャンのフロストと同じ仕組み・3秒)
            ed.frozen = true;
            ed.frozenTimer = 3.0;
            ed.sprite.setTint(0x88ccff);
            if(ed._iceImg){
              try{ed._iceImg.destroy();}catch(e){}
              ed._iceImg = null;
            }
            const ice = this.add.image(ed.sprite.x, ed.sprite.y, 'fx_freeze').setDisplaySize(40,40).setDepth(8).setAlpha(0.8);
            ed._iceImg = ice;
          });
          this.cameras.main.shake(400, 0.018);
        });

        this.showFloat(p.x, p.y-80, '❄ プリザーブドバスター', '#aaeeff');
        this[cdKey]=sk.cd;
      }
      return;
    }

    // ─ 覚醒「バスターズ換装」(busters) ─
    if(pd.awakened==='busters'){
      if(num===1){
        // ── バスターキャノン: 連射可能・動かなければCDなし・3発まで範囲拡大 ──
        // 移動検出: 発動時にjoystick入力があれば「動いている」と判定
        const movingNow = (Math.abs(this.joyDx||0) > 0.1 || Math.abs(this.joyDy||0) > 0.1);
        const now = this.time.now;
        const lastFire = pd._bcLastFire || 0;
        const streakAlive = (now - lastFire) < 1500; // 1.5秒以内なら連続扱い
        if(movingNow || !streakAlive){
          pd._bcStreak = 0;
        }
        pd._bcStreak = Math.min(2, (pd._bcStreak||0));  // 表示用にcap
        const rangeMul = Math.pow(1.2, pd._bcStreak);
        // 向き取得
        let targetAng = this._lastAngle || 0;
        let nearest=null, nd=500;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<nd){nd=d; nearest=ed;}
        });
        if(nearest){
          targetAng = Phaser.Math.Angle.Between(p.x,p.y,nearest.sprite.x,nearest.sprite.y);
        }
        const beamLen = 700 * rangeMul;
        const beamWidth = 80 * rangeMul;
        const cosA = Math.cos(targetAng);
        const sinA = Math.sin(targetAng);
        const muzzleOffsetX = cosA * 20;
        const muzzleOffsetY = sinA * 20;
        // 移動ロック(チャージ + 発射まで)
        this._lockMovement = true;
        // チャージ時間: 溜めるのを明確に演出
        const chargeDur = 550;
        this.time.delayedCall(chargeDur + 80, ()=>{ this._lockMovement = false; });
        const chargeBall = this.add.circle(p.x + muzzleOffsetX, p.y + muzzleOffsetY, 8, 0xffaa66, 1).setDepth(20).setStrokeStyle(2, 0xffffff, 0.9);
        const heatRing = this.add.circle(p.x, p.y+10, 30, 0xff5522, 0).setStrokeStyle(3, 0xff7744, 0.8).setDepth(7);
        this.tweens.add({
          targets: chargeBall, scaleX: 3.5*rangeMul, scaleY: 3.5*rangeMul,
          duration: chargeDur, ease: 'Cubic.easeOut',
        });
        this.tweens.add({
          targets: heatRing, scaleX: 1.6*rangeMul, scaleY: 1.6*rangeMul, alpha: 1,
          duration: chargeDur/2, yoyo: true,
        });
        const chargeFollow = this.time.addEvent({
          delay: 16, loop: true,
          callback: ()=>{
            if(this.player && chargeBall.scene) chargeBall.setPosition(this.player.x + muzzleOffsetX, this.player.y + muzzleOffsetY);
            if(this.player && heatRing.scene) heatRing.setPosition(this.player.x, this.player.y+10);
          },
        });
        // 火花パーティクル(チャージ時間を埋める量で生成)
        const particleCount = 24;
        for(let i=0;i<particleCount;i++){
          this.time.delayedCall(i * (chargeDur - 200) / particleCount, ()=>{
            if(!this.player) return;
            const ang = Math.random() * Math.PI * 2;
            const dist = 80 + Math.random() * 60;
            const sx2 = this.player.x + Math.cos(ang) * dist;
            const sy2 = this.player.y + Math.sin(ang) * dist;
            const colors = [0xff5522, 0xff8844, 0xffaa44, 0xffeecc];
            const col = colors[Phaser.Math.Between(0,3)];
            const particle = this.add.circle(sx2, sy2, 3+Math.random()*2, col, 0.9).setDepth(18);
            this.tweens.add({
              targets: particle, x: this.player.x + muzzleOffsetX, y: this.player.y + muzzleOffsetY,
              alpha: 0, scaleX: 0.2, scaleY: 0.2, duration: 350 + Math.random()*150,
              onComplete: ()=>{try{particle.destroy();}catch(e){}},
            });
          });
        }
        // 砲口の脈動エフェクト(溜まり感)
        this.tweens.add({
          targets: chargeBall, alpha: 0.7,
          duration: 180, yoyo: true, repeat: Math.floor(chargeDur / 360),
        });
        // チャージ完了→発射
        this.time.delayedCall(chargeDur, ()=>{
          chargeFollow.remove();
          try{chargeBall.destroy();}catch(e){}
          try{heatRing.destroy();}catch(e){}
          const sx = this.player.x + muzzleOffsetX;
          const sy = this.player.y + muzzleOffsetY;
          const ex = sx + cosA * beamLen;
          const ey = sy + sinA * beamLen;
          // 赤オレンジビーム発射(_fireMegaBeam を流用しつつ色だけ差し替え)
          this._fireBusterBeam(sx, sy, ex, ey, targetAng, beamWidth, beamLen);
          try{SE('magic');}catch(e){}
          // ダメージ判定
          const targets = this.enemyDataList.filter(ed=>{
            if(ed.dead) return false;
            const dx = ed.sprite.x - sx;
            const dy = ed.sprite.y - sy;
            const fwd = dx*cosA + dy*sinA;
            if(fwd < 0 || fwd > beamLen) return false;
            const perp = Math.abs(dx*(-sinA) + dy*cosA);
            return perp < beamWidth/2 + 15;
          });
          const lv = (pd.awakSkillLv && pd.awakSkillLv.busters && pd.awakSkillLv.busters.sk1) || 1;
          targets.forEach(ed=>{
            const baseDmg = Math.max(1, Math.floor((pd.atk*2.2 + lv*8) * rangeMul));
            const isCrit = Math.random()*100 < calcCrit(pd);
            const em = getElementMult('fire', ed.element||'none');
            const dmg = Math.max(1, Math.floor((isCrit ? baseDmg*2 : baseDmg) * em.mult));
            this.hitEnemy(ed, dmg, isCrit, true, em.label);
            // 着弾の炎エフェクト
            const burst = this.add.text(ed.sprite.x, ed.sprite.y, '🔥', {fontSize:'34px'}).setOrigin(0.5).setDepth(20);
            this.tweens.add({targets: burst, alpha:0, scaleX:2, scaleY:2, duration:400, onComplete:()=>burst.destroy()});
          });
          this.cameras.main.shake(220, 0.012);
          // streak 加算(次のショットで使う)
          pd._bcStreak = Math.min(2, (pd._bcStreak||0) + 1);
          pd._bcLastFire = this.time.now;
        });
        const streakLabel = ['', '×1.2', '×1.44'][pd._bcStreak] || '';
        this.showFloat(p.x, p.y-80, '🔫 バスターキャノン'+(streakLabel?' '+streakLabel:''), '#ff8844');
        // CD: 動いた場合はディレイ、連射時はゼロ
        this[cdKey] = movingNow ? 1.2 : 0.05;
      }
      else if(num===2){
        // ── メガトンキャノン: 多段高火力+広範囲爆発(カプコン風) ──
        let targetAng = this._lastAngle || 0;
        let nearest=null, nd=500;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<nd){nd=d; nearest=ed;}
        });
        if(nearest) targetAng = Phaser.Math.Angle.Between(p.x,p.y,nearest.sprite.x,nearest.sprite.y);
        const cosA = Math.cos(targetAng);
        const sinA = Math.sin(targetAng);
        // バスターキャノン3撃目の更に倍くらい
        const beamLen = 900;
        const beamWidth = 200;
        // 移動ロック(タメ+発射)
        this._lockMovement = true;
        this.time.delayedCall(1100, ()=>{ this._lockMovement = false; });
        const chargeDur = 700;
        // ── タメ演出: カプコン風 ──
        // (1) プレイヤー周囲の赤い渦
        const swirl = this.add.circle(p.x, p.y, 40, 0xff3300, 0.5).setStrokeStyle(4, 0xff8844, 0.95).setDepth(15);
        this.tweens.add({targets:swirl, scaleX:2, scaleY:2, alpha:0.85, duration:chargeDur/2, yoyo:true});
        // (2) 砲口の超巨大チャージ球
        const muzzleOffsetX = cosA * 30;
        const muzzleOffsetY = sinA * 30;
        const charge = this.add.circle(p.x + muzzleOffsetX, p.y + muzzleOffsetY, 10, 0xffeecc, 1).setStrokeStyle(3, 0xffffff, 1.0).setDepth(20);
        const chargeOuter = this.add.circle(p.x + muzzleOffsetX, p.y + muzzleOffsetY, 14, 0xff4422, 0.6).setDepth(19);
        this.tweens.add({targets:charge, scaleX:6, scaleY:6, duration:chargeDur, ease:'Cubic.easeOut'});
        this.tweens.add({targets:chargeOuter, scaleX:7, scaleY:7, alpha:0.85, duration:chargeDur, ease:'Cubic.easeOut'});
        const chargeFollow = this.time.addEvent({
          delay: 16, loop: true,
          callback: ()=>{
            if(this.player){
              swirl.setPosition(this.player.x, this.player.y);
              charge.setPosition(this.player.x + muzzleOffsetX, this.player.y + muzzleOffsetY);
              chargeOuter.setPosition(this.player.x + muzzleOffsetX, this.player.y + muzzleOffsetY);
            }
          },
        });
        // (3) 周囲から赤い火花が砲口に集まる
        for(let i=0;i<24;i++){
          this.time.delayedCall(i*22, ()=>{
            if(!this.player) return;
            const ang = Math.random() * Math.PI * 2;
            const dist = 110 + Math.random() * 60;
            const sx2 = this.player.x + Math.cos(ang) * dist;
            const sy2 = this.player.y + Math.sin(ang) * dist;
            const colors = [0xff4422, 0xff8844, 0xffaa44, 0xffeecc];
            const col = colors[Phaser.Math.Between(0,3)];
            const particle = this.add.circle(sx2, sy2, 4+Math.random()*3, col, 0.9).setDepth(18);
            this.tweens.add({
              targets: particle,
              x: this.player.x + muzzleOffsetX, y: this.player.y + muzzleOffsetY,
              alpha: 0, scaleX: 0.2, scaleY: 0.2, duration: 380 + Math.random()*200,
              onComplete: ()=>{try{particle.destroy();}catch(e){}},
            });
          });
        }
        // (4) 画面下から漢字「撃」が現れる(カプコン感・元の仕様に少し足したシンプル版)
        // 出現 → そのままフェードアウト。砲撃の邪魔にならない長さ。
        const kanji = this.add.text(this.scale.width/2, this.scale.height + 60, '撃', {
          fontSize:'130px', color:'#ff4422', stroke:'#ffeecc', strokeThickness:8, fontStyle:'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(50).setAlpha(0.95);
        this.tweens.add({
          targets: kanji, y: this.scale.height * 0.50, alpha: 0,
          duration: chargeDur + 200,    // 元(chargeDur)に 200ms だけ追加
          ease: 'Cubic.easeOut',
          onComplete: ()=>{try{kanji.destroy();}catch(e){}},
        });
        // チャージ完了→発射
        this.time.delayedCall(chargeDur, ()=>{
          chargeFollow.remove();
          try{swirl.destroy(); charge.destroy(); chargeOuter.destroy();}catch(e){}
          const sx = this.player.x + muzzleOffsetX;
          const sy = this.player.y + muzzleOffsetY;
          // 巨大ビーム(複数層・カプコン的フラッシュ)
          this.cameras.main.flash(300, 255, 200, 100);
          this.cameras.main.shake(800, 0.025);
          // 複数の重ねビーム(色違いで分厚く見せる)
          const layers = [
            {col:0xff2200, w: beamWidth*1.1, alpha:0.85, dur:600},
            {col:0xff5522, w: beamWidth*0.9, alpha:0.95, dur:600},
            {col:0xff8844, w: beamWidth*0.65, alpha:0.95, dur:560},
            {col:0xffeecc, w: beamWidth*0.35, alpha:1.00, dur:520},
            {col:0xffffff, w: beamWidth*0.18, alpha:1.00, dur:480},
          ];
          layers.forEach(L=>{
            const beam = this.add.rectangle(sx, sy, beamLen, L.w, L.col, L.alpha)
              .setOrigin(0, 0.5).setRotation(targetAng).setDepth(20);
            this.tweens.add({
              targets: beam, alpha: 0, scaleY: 1.4,
              duration: L.dur, ease: 'Cubic.easeOut',
              onComplete: ()=>{try{beam.destroy();}catch(e){}},
            });
          });
          // 沿線に多発する爆発(カプコン風)
          const explosionPts = 10;
          for(let i=0;i<explosionPts;i++){
            const t = i/explosionPts;
            const ex = sx + cosA * beamLen * t;
            const ey = sy + sinA * beamLen * t;
            this.time.delayedCall(i*40, ()=>{
              const r1 = this.add.circle(ex, ey, 30, 0xff4422, 0.85).setDepth(21);
              const r2 = this.add.circle(ex, ey, 16, 0xffeecc, 1.0).setDepth(22);
              this.tweens.add({targets:[r1], scaleX:3, scaleY:3, alpha:0, duration:400, onComplete:()=>r1.destroy()});
              this.tweens.add({targets:[r2], scaleX:2, scaleY:2, alpha:0, duration:280, onComplete:()=>r2.destroy()});
            });
          }
          // ── 多段ヒット(10連続) ──
          const lv = (pd.awakSkillLv && pd.awakSkillLv.busters && pd.awakSkillLv.busters.sk2) || 1;
          // 3hit→10hit に変更したのでダメージは少し抑えてバランス
          const baseDmg = Math.max(1, Math.floor(pd.atk*1.4 + lv*7));
          const HIT_COUNT = 10;
          const HIT_INTERVAL = 90;  // 90ms 間隔 = 約 900ms で全段
          for(let hit=0; hit<HIT_COUNT; hit++){
            this.time.delayedCall(hit*HIT_INTERVAL, ()=>{
              const targets = this.enemyDataList.filter(ed=>{
                if(ed.dead || !ed.sprite) return false;
                const dx = ed.sprite.x - sx;
                const dy = ed.sprite.y - sy;
                const fwd = dx*cosA + dy*sinA;
                if(fwd < 0 || fwd > beamLen) return false;
                const perp = Math.abs(dx*(-sinA) + dy*cosA);
                return perp < beamWidth/2 + 20;
              });
              targets.forEach(ed=>{
                const isCrit = Math.random()*100 < calcCrit(pd);
                const em = getElementMult('fire', ed.element||'none');
                const dmg = Math.max(1, Math.floor((isCrit ? baseDmg*2 : baseDmg) * em.mult));
                this.hitEnemy(ed, dmg, isCrit, true, em.label);
                // 着弾炎エフェクト(段数が多いので軽量化)
                if(hit % 2 === 0){
                  const burst = this.add.text(ed.sprite.x + (Math.random()-0.5)*30, ed.sprite.y + (Math.random()-0.5)*20, '💥', {fontSize:'30px'}).setOrigin(0.5).setDepth(23);
                  this.tweens.add({targets: burst, alpha:0, scaleX:2, scaleY:2, duration:320, onComplete:()=>burst.destroy()});
                }
              });
              // 軽い画面振動を各段で
              if(hit % 3 === 0) this.cameras.main.shake(120, 0.006);
            });
          }
        });
        try{SE('boss');SE('meteor');}catch(e){}
        this.showFloat(p.x, p.y-90, '💥 メガトンキャノン', '#ff4422');
        this[cdKey] = sk.cd;
      }
      else if(num===3){
        // ── アーマーパージ: 速度UP・攻撃UP・防御DOWN ──
        const dur = 12;  // 12秒持続
        // 既存のバフがあれば上書き
        if(!pd._armorPurgeOrig){
          pd._armorPurgeOrig = { spd: pd.spd, atk: pd.atk, def: pd.def };
        }
        pd.spd = Math.floor(pd._armorPurgeOrig.spd * 1.6);
        pd.atk = Math.floor(pd._armorPurgeOrig.atk * 1.5);
        pd.def = Math.floor(pd._armorPurgeOrig.def * 0.5);
        pd._armorPurgeUntil = this.time.now + dur*1000;
        // ── 演出: 装甲が剥がれて飛び散る ──
        this.cameras.main.flash(280, 255, 180, 80);
        this.cameras.main.shake(450, 0.02);
        // 装甲片(複数の四角形が散らばる)
        for(let i=0;i<14;i++){
          const ang = (i/14) * Math.PI * 2 + (Math.random()-0.5)*0.3;
          const dx = Math.cos(ang) * (80 + Math.random()*40);
          const dy = Math.sin(ang) * (80 + Math.random()*40);
          const piece = this.add.rectangle(p.x, p.y, 10 + Math.random()*6, 6 + Math.random()*4, 0x886644, 0.95)
            .setStrokeStyle(1, 0x442211).setDepth(20).setRotation(Math.random()*Math.PI*2);
          this.tweens.add({
            targets: piece,
            x: p.x + dx, y: p.y + dy,
            rotation: piece.rotation + (Math.random()-0.5) * Math.PI * 4,
            alpha: 0, scaleX: 0.4, scaleY: 0.4,
            duration: 700 + Math.random()*300,
            onComplete: ()=>{try{piece.destroy();}catch(e){}},
          });
        }
        // 赤い解放オーラ
        const releaseRing = this.add.circle(p.x, p.y, 30, 0xff3322, 0).setStrokeStyle(6, 0xff5522, 0.95).setDepth(16);
        this.tweens.add({targets:releaseRing, scaleX:5, scaleY:5, alpha:0, duration:600, onComplete:()=>releaseRing.destroy()});
        // 持続オーラ(バフ中ずっと)
        const buffAura = this.add.circle(p.x, p.y, 36, 0xff4422, 0.3).setStrokeStyle(2, 0xff8844, 0.85).setDepth(15);
        pd._armorPurgeAura = buffAura;
        const auraFollow = this.time.addEvent({
          delay: 30, loop: true,
          callback: ()=>{
            if(!pd._armorPurgeUntil || this.time.now > pd._armorPurgeUntil){
              try{buffAura.destroy();}catch(e){}
              // ステ復元
              if(pd._armorPurgeOrig){
                pd.spd = pd._armorPurgeOrig.spd;
                pd.atk = pd._armorPurgeOrig.atk;
                pd.def = pd._armorPurgeOrig.def;
                pd._armorPurgeOrig = null;
              }
              pd._armorPurgeUntil = null;
              pd._armorPurgeAura = null;
              auraFollow.remove();
              try{this.updateHUD();}catch(e){}
              // 覚醒が既に解除されている場合(_deactivateAwakening 経由で来た時)は
              // 「アーマーパージ終了」メッセージを出さない
              if(pd.awakened === 'busters'){
                this.showFloat(p.x, p.y-50, 'アーマーパージ終了', '#ff8844', 'info');
              }
              return;
            }
            buffAura.setPosition(p.x, p.y);
          },
        });
        this.tweens.add({targets:buffAura, scaleX:1.3, scaleY:1.3, alpha:0.45, duration:600, yoyo:true, repeat:-1});
        try{SE('skill');SE('boss');}catch(e){}
        this.showFloat(p.x, p.y-80, '⚙ アーマーパージ', '#ff5522');
        // 画面上部に残時間バーを表示(パリィと同じ仕組み)
        this.showBuffTimer('⚙ アーマーパージ', '#ff5522', dur*1000);
        this.updateHUD();
        this[cdKey] = sk.cd;
      }
      return;
    }

    // ─ 覚醒「エルフ」(spirit) ─
    if(pd.awakened==='spirit'){
      if(num===1){ // ウインドカッター: 正面広範囲に飛ぶ風属性攻撃の一撃
        // 向き判定(最寄り敵の方向、なければ_lastAngle)
        let targetAng = this._lastAngle || 0;
        let nearest=null, nd=600;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<nd){nd=d; nearest=ed;}
        });
        if(nearest){
          targetAng = Phaser.Math.Angle.Between(p.x,p.y,nearest.sprite.x,nearest.sprite.y);
        }
        // 弓の発射演出
        const bowFx = this.add.text(p.x, p.y-10, '🏹', {fontSize:'36px'}).setOrigin(0.5).setDepth(20).setRotation(targetAng);
        this.tweens.add({targets: bowFx, alpha:0, scaleX:1.6, scaleY:1.6, duration:400, onComplete:()=>bowFx.destroy()});
        // 風の弾(巨大なエネルギー塊)を正面に発射
        const range = 500;
        const width = 110; // 直径(広範囲)
        const cw = this.add.circle(p.x, p.y, width/2, 0x88ffaa, 0.5).setDepth(18).setStrokeStyle(3, 0xaaffaa, 0.9);
        const ex = p.x + Math.cos(targetAng) * range;
        const ey = p.y + Math.sin(targetAng) * range;
        // 風の刃が3本同時に飛ぶ(中心+上下)
        const blades = [];
        for(let bi=0; bi<3; bi++){
          const offset = (bi-1) * 25; // -25, 0, +25
          const perpAng = targetAng + Math.PI/2;
          const sx = p.x + Math.cos(perpAng) * offset;
          const sy = p.y + Math.sin(perpAng) * offset;
          const exb = ex + Math.cos(perpAng) * offset;
          const eyb = ey + Math.sin(perpAng) * offset;
          const blade = this.add.text(sx, sy, '🌀', {fontSize:'40px'}).setOrigin(0.5).setDepth(19).setRotation(targetAng);
          blades.push(blade);
          this.tweens.add({
            targets: blade,
            x: exb, y: eyb,
            rotation: targetAng + Math.PI*4,
            duration: 600,
            ease: 'Cubic.easeOut',
            onComplete: ()=>blade.destroy(),
          });
        }
        // 中心の風の塊が飛ぶ
        this.tweens.add({
          targets: cw,
          x: ex, y: ey,
          scaleX: 1.5, scaleY: 1.5,
          alpha: 0,
          duration: 600,
          onComplete: ()=>cw.destroy(),
        });
        // 葉っぱが軌跡として尾を引く
        for(let i=0;i<10;i++){
          this.time.delayedCall(i*50, ()=>{
            const t = i/10;
            const lx = p.x + Math.cos(targetAng) * range * t + (Math.random()-0.5)*30;
            const ly = p.y + Math.sin(targetAng) * range * t + (Math.random()-0.5)*30;
            const leaf = this.add.text(lx, ly, '🍃', {fontSize:'18px'}).setOrigin(0.5).setDepth(18);
            this.tweens.add({
              targets: leaf,
              alpha: 0,
              rotation: Math.PI*2,
              duration: 600,
              onComplete: ()=>leaf.destroy(),
            });
          });
        }
        // 範囲内の敵にダメージ(直線+幅100px)
        const targets = this.enemyDataList.filter(ed=>{
          if(ed.dead) return false;
          // 起点からの距離
          const ex2 = ed.sprite.x - p.x;
          const ey2 = ed.sprite.y - p.y;
          // 進行方向への投影距離
          const fwd = ex2*Math.cos(targetAng) + ey2*Math.sin(targetAng);
          if(fwd < 0 || fwd > range) return false;
          // 進行方向に対する垂直距離
          const perp = Math.abs(ex2*(-Math.sin(targetAng)) + ey2*Math.cos(targetAng));
          return perp < width/2;
        });
        targets.forEach(ed=>{
          // 一撃の威力(ATK×7.0+MAG×4.0)
          const baseDmg = Math.max(1, Math.floor(pd.atk * 7.0 + (pd.mag||0) * 4.0));
          const isCrit = Math.random()*100 < calcCrit(pd);
          const em = getElementMult('wind', ed.element||'none');
          const dmg = Math.max(1, Math.floor((isCrit?baseDmg*2:baseDmg) * em.mult));
          this.hitEnemy(ed, dmg, isCrit, true, em.label);
        });
        this.cameras.main.shake(200, 0.012);
        this.showFloat(p.x, p.y-80, '🍃 ウインドカッター', '#aaffaa');
        try{SE('vortex');SE('arrow');}catch(e){}
        this[cdKey]=sk.cd;
      }else if(num===2){ // 精霊の誓い: 2体の精霊(ファンネル)が敵周辺を飛び回って攻撃
        // 最寄り敵をターゲット
        let target=null, td=500;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<td){td=d; target=ed;}
        });
        if(!target){
          this.showFloat(p.x,p.y-50,'敵が居ない','#888888','info');
          pd.sp += sk.cost; // SP返金
          this[cdKey]=0.3;
          return;
        }
        // 召喚演出: プレイヤーから精霊が飛び出す
        const spiritData = [];
        for(let i=0;i<2;i++){
          const sp = this.add.text(p.x, p.y, '✨', {fontSize:'30px'}).setOrigin(0.5).setDepth(19);
          // 起点はプレイヤー、最初は近くに登場してから敵の方へ
          const phase0 = i * Math.PI; // 2体は半周ズレて軌道
          // 精霊データ(自律飛行用)
          const data = {
            sprite: sp,
            phase: phase0,
            speed: 0.0035 + Math.random()*0.0010, // 軌道角速度
            radius: 70 + i*15,                     // ターゲット周りの軌道半径
            radiusOsc: Math.random()*Math.PI*2,    // 半径の揺らぎ位相
            // 揺らぎ用の時間オフセット
            tBorn: this.time.now,
          };
          spiritData.push(data);
          // 登場時のスケールアニメ
          sp.setScale(0);
          this.tweens.add({targets: sp, scaleX:1, scaleY:1, duration:300, ease:'Back.easeOut'});
          // プレイヤー位置から目標周辺へ短く移動(初期位置への合流)
          const initAng = phase0;
          const initX = target.sprite.x + Math.cos(initAng) * data.radius;
          const initY = target.sprite.y + Math.sin(initAng) * data.radius;
          this.tweens.add({
            targets: sp,
            x: initX, y: initY,
            duration: 400,
            ease: 'Cubic.easeOut',
          });
        }
        // 自律飛行ループ(毎フレーム位置更新)
        const flightDur = 2400; // 2.4秒間飛行
        const flightStart = this.time.now;
        const flightEvent = this.time.addEvent({
          delay: 16,
          loop: true,
          callback: ()=>{
            const elapsed = this.time.now - flightStart;
            if(elapsed > flightDur) return;
            spiritData.forEach((d, idx)=>{
              if(!d.sprite || !d.sprite.scene){return;}
              if(target.dead || !target.sprite){return;}
              // ターゲット周辺を周回しつつ、半径が脈動
              const t = elapsed * d.speed;
              const ang = d.phase + t;
              // 半径も sin で脈動(右往左往感)
              const rOsc = Math.sin(elapsed*0.005 + d.radiusOsc) * 25;
              const r = d.radius + rOsc;
              const tx = target.sprite.x + Math.cos(ang) * r;
              const ty = target.sprite.y + Math.sin(ang) * r;
              // 滑らかに追従(現在位置から少しずつ近づける)
              const lerp = 0.18;
              d.sprite.x += (tx - d.sprite.x) * lerp;
              d.sprite.y += (ty - d.sprite.y) * lerp;
              // 軌跡: 小さな葉っぱを残す
              if(Math.random() < 0.15){
                const trail = this.add.text(d.sprite.x, d.sprite.y, '·', {fontSize:'14px', color:'#aaffcc'}).setOrigin(0.5).setDepth(18);
                this.tweens.add({targets: trail, alpha:0, scaleX:1.5, scaleY:1.5, duration:300, onComplete:()=>trail.destroy()});
              }
            });
          },
        });
        // 5発ずつ、合計10発のビーム(交互に)
        const totalShots = 10;
        const interval = 200;
        const startDelay = 500; // 召喚モーション後に発射開始
        // 累積ダメージ
        let totalDmg = 0;
        let hitCount = 0;
        // ターゲットの最後の位置を記憶
        let lastTargetX = target.sprite.x;
        let lastTargetY = target.sprite.y;
        for(let i=0;i<totalShots;i++){
          this.time.delayedCall(startDelay + i*interval, ()=>{
            const spIdx = i%2;
            const sp = spiritData[spIdx].sprite;
            if(!sp || !sp.scene) return;
            // ターゲット位置を更新(生きてれば最新、死んでれば最後の位置)
            let tx, ty;
            if(target.dead || !target.sprite){
              tx = lastTargetX; ty = lastTargetY;
            }else{
              tx = target.sprite.x; ty = target.sprite.y;
              lastTargetX = tx; lastTargetY = ty;
            }
            // 精霊の現在位置からビーム発射(死後も演出)
            const beam = this.add.line(0, 0, sp.x, sp.y, tx, ty, 0x88ffaa, 1).setOrigin(0).setLineWidth(3).setDepth(18);
            this.tweens.add({targets:beam, alpha:0, duration:250, onComplete:()=>beam.destroy()});
            // 発射時の精霊が一瞬光る
            const flash = this.add.circle(sp.x, sp.y, 14, 0xaaffaa, 0.8).setDepth(18);
            this.tweens.add({targets:flash, alpha:0, scaleX:2, scaleY:2, duration:200, onComplete:()=>flash.destroy()});
            // ダメージ計算(死後でも記録) - ATK×2.5 + MAG×3.5 にアップグレード
            const baseDmg = Math.max(1, Math.floor(pd.atk * 2.5 + (pd.mag||0) * 3.5));
            const isCrit = Math.random()*100 < calcCrit(pd);
            const dmg = isCrit ? Math.floor(baseDmg*2) : baseDmg;
            totalDmg += dmg;
            hitCount++;
            // 敵生存中なら実ダメージ反映
            if(!target.dead && target.sprite){
              this.hitEnemy(target, dmg, isCrit, true, '');
            }
            // ヒット閃光(死後でも演出)
            const hitFlash = this.add.circle(tx, ty, 10, 0x88ffaa, 0.8).setDepth(18);
            this.tweens.add({targets:hitFlash, alpha:0, scaleX:2.5, scaleY:2.5, duration:250, onComplete:()=>hitFlash.destroy()});
            // 全弾終了後にTOTAL表示
            if(hitCount >= totalShots){
              this.time.delayedCall(200, ()=>{
                this.showTotalDamage(tx, ty, totalDmg);
              });
            }
          });
        }
        // 全弾終わったら精霊を消す
        this.time.delayedCall(startDelay + totalShots*interval + 200, ()=>{
          if(flightEvent) flightEvent.remove();
          spiritData.forEach(d=>{
            if(d.sprite && d.sprite.scene){
              this.tweens.add({targets:d.sprite, alpha:0, scaleX:0, scaleY:0, duration:300, onComplete:()=>{try{d.sprite.destroy();}catch(e){}}});
            }
          });
        });
        this.showFloat(p.x, p.y-80, '✨ 精霊の誓い', '#88ffaa');
        try{SE('magic');SE('multishot');}catch(e){}
        this[cdKey]=sk.cd;
      }else if(num===3){ // オールクリティカル: 一定時間100%CRIT
        const dur = 20000; // 20秒(8秒から大幅延長)
        pd._allCritUntil = Date.now() + dur;
        this.showBuffTimer('オールCRIT','#ffaa44', dur);
        // 黄金のオーラを足元に追加
        const ring = this.add.circle(p.x, p.y, 50, 0xffaa44, 0).setStrokeStyle(4, 0xffcc66, 0.85).setDepth(15);
        pd._allCritRing = ring;
        this.tweens.add({
          targets: ring,
          rotation: Math.PI * 2,
          duration: 2000,
          repeat: -1,
        });
        // 解除タイマー
        this.time.delayedCall(dur, ()=>{
          if(pd._allCritRing){try{pd._allCritRing.destroy();}catch(e){} pd._allCritRing=null;}
          pd._allCritUntil = 0;
        });
        this.showFloat(p.x, p.y-80, '⭐ オールクリティカル', '#ffaa44');
        try{SE('boost');SE('crit');}catch(e){}
        this[cdKey]=sk.cd;
      }
      return;
    }

    // ─ 覚醒「妖魔」(youma) ─
    if(pd.awakened==='youma'){
      if(num===1){ // ダークフォール: ブラックホール+暗黒+毒継続
        // 詠唱(1.2秒)
        this._casting=true;
        const castDur = 1200;
        const castBar = this.add.rectangle(p.x, p.y-50, 80, 6, 0x000000, 0.7).setDepth(20).setStrokeStyle(1, 0xaa44ff);
        const castFill = this.add.rectangle(p.x-40, p.y-50, 0, 6, 0xaa44ff, 1).setOrigin(0,0.5).setDepth(21);
        // 詠唱中、紫の渦がプレイヤー周辺で回転
        const swirl = this.add.circle(p.x, p.y, 30, 0x6622aa, 0.4).setStrokeStyle(3, 0x9944ff, 0.85).setDepth(15);
        this.tweens.add({targets: swirl, scaleX:1.5, scaleY:1.5, alpha:0.6, duration:castDur/2, yoyo:true});
        // バー成長
        this.tweens.add({
          targets: castFill, width: 80, duration: castDur,
          onUpdate: ()=>{ castBar.setPosition(p.x, p.y-50); castFill.setPosition(p.x-40, p.y-50); swirl.setPosition(p.x, p.y); },
        });
        this.time.delayedCall(castDur, ()=>{
          this._casting=false;
          try{castBar.destroy();}catch(e){}
          try{castFill.destroy();}catch(e){}
          try{swirl.destroy();}catch(e){}
          // 詠唱完了 → ブラックホール展開
          const radius = 180;
          const bhX = p.x, bhY = p.y;
          // 中心の黒い穴
          const bh = this.add.circle(bhX, bhY, 30, 0x000000, 1).setDepth(18);
          const bhEdge = this.add.circle(bhX, bhY, 32, 0, 0).setStrokeStyle(8, 0x9944ff, 0.85).setDepth(19);
          // 急速に広がる
          this.tweens.add({
            targets: [bh, bhEdge],
            scaleX: radius/30, scaleY: radius/30,
            duration: 400,
            ease: 'Cubic.easeOut',
          });
          // 渦巻きエフェクト(回転)
          this.tweens.add({
            targets: bhEdge,
            rotation: Math.PI * 4,
            duration: 3000,
          });
          this.cameras.main.shake(300, 0.012);
          // 範囲内の敵: 暗黒+移動停止+毒継続
          const targets = this.enemyDataList.filter(ed=>{
            if(ed.dead) return false;
            const d = Phaser.Math.Distance.Between(bhX, bhY, ed.sprite.x, ed.sprite.y);
            return d < radius;
          });
          // 即時ダメージ
          targets.forEach(ed=>{
            const baseDmg = Math.max(1, Math.floor((pd.atk*1.0) + (pd.mag||0) * 6.0));
            const isCrit = Math.random()*100 < calcCrit(pd);
            const em = getElementMult('dark', ed.element||'none');
            const dmg = Math.max(1, Math.floor((isCrit?baseDmg*2:baseDmg) * em.mult));
            this.hitEnemy(ed, dmg, isCrit, true, em.label);
            // 暗黒状態異常: 命中ダウン+移動停止(3秒)
            ed.darkness = true;
            ed.darknessUntil = this.time.now + 3000;
            ed.frozen = true;
            ed.frozenUntil = this.time.now + 3000;
            ed.sprite.setTint(0x442266);
          });
          // 毎秒継続ダメージ(3秒間・3回)
          for(let t=1; t<=3; t++){
            this.time.delayedCall(t*1000, ()=>{
              targets.forEach(ed=>{
                if(ed.dead || !ed.sprite) return;
                // 範囲内に居続けるかチェック
                const d = Phaser.Math.Distance.Between(bhX, bhY, ed.sprite.x, ed.sprite.y);
                if(d > radius) return;
                const tickDmg = Math.max(1, Math.floor((pd.mag||0) * 3.0));
                this.hitEnemy(ed, tickDmg, false, true, '');
              });
            });
          }
          // 暗黒解除タイマー
          this.time.delayedCall(3000, ()=>{
            targets.forEach(ed=>{
              if(ed && !ed.dead){
                ed.darkness = false;
                ed.frozen = false;
                ed.darknessUntil = 0;
                ed.frozenUntil = 0;
                ed.sprite.clearTint();
              }
            });
          });
          // ブラックホールを3秒で消す
          this.time.delayedCall(3000, ()=>{
            this.tweens.add({
              targets: [bh, bhEdge],
              scaleX: 0.1, scaleY: 0.1,
              alpha: 0,
              duration: 500,
              onComplete: ()=>{
                try{bh.destroy();}catch(e){}
                try{bhEdge.destroy();}catch(e){}
              },
            });
          });
        });
        this.showFloat(p.x, p.y-80, '🌑 ダークフォール', '#aa66ff');
        try{SE('magic');SE('meteor');}catch(e){}
        this[cdKey]=sk.cd;
      }else if(num===2){ // ダークストライク: プレイヤーから闇の球体6個が飛ぶ
        let target=null, td=500;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<td){td=d; target=ed;}
        });
        if(!target){
          this.showFloat(p.x,p.y-50,'敵が居ない','#888888','info');
          pd.sp += sk.cost; // SP返金
          this[cdKey]=0.3;
          return;
        }
        // ターゲットが消えても、最後の位置を記憶する仕組み
        const lockOn = {
          ed: target,
          lastX: target.sprite.x,
          lastY: target.sprite.y,
        };
        // プレイヤー位置で発射準備の小さな閃光
        const muzzle = this.add.circle(p.x, p.y-10, 18, 0xaa44ff, 0.7).setDepth(19).setStrokeStyle(2, 0xcc88ff, 0.9);
        this.tweens.add({targets: muzzle, scaleX:1.5, scaleY:1.5, alpha:0, duration:300, onComplete:()=>muzzle.destroy()});
        // 6個の闇の球体がプレイヤーから飛ぶ
        const orbCount = 6;
        // 累積ダメージを記録(全弾終了後にTOTAL表示)
        let totalDmg = 0;
        let hitCount = 0;
        for(let i=0;i<orbCount;i++){
          this.time.delayedCall(i*100, ()=>{
            if(!this.player) return;
            // ターゲット位置を更新(生きてれば最新位置・死んでれば最後の位置)
            if(lockOn.ed && !lockOn.ed.dead && lockOn.ed.sprite){
              lockOn.lastX = lockOn.ed.sprite.x;
              lockOn.lastY = lockOn.ed.sprite.y;
            }
            // プレイヤー位置を起点に、少しランダム性
            const startX = this.player.x + (Math.random()-0.5)*20;
            const startY = this.player.y - 10 + (Math.random()-0.5)*20;
            // 球体出現時の小さな閃光
            const sparkOut = this.add.circle(startX, startY, 10, 0xffffff, 0.7).setDepth(19);
            this.tweens.add({targets: sparkOut, scaleX:2, scaleY:2, alpha:0, duration:200, onComplete:()=>sparkOut.destroy()});
            // 闇の球体(プレイヤーから出る)
            const orb = this.add.circle(startX, startY, 14, 0x331166, 1).setDepth(18).setStrokeStyle(2, 0xaa44ff, 0.9);
            const orbCore = this.add.circle(startX, startY, 5, 0xffffff, 0.6).setDepth(19);
            // 着弾点を発射時点で固定(ターゲットが居れば現在位置、なければ最後の位置)
            const aimX = (lockOn.ed && !lockOn.ed.dead && lockOn.ed.sprite) ? lockOn.ed.sprite.x : lockOn.lastX;
            const aimY = (lockOn.ed && !lockOn.ed.dead && lockOn.ed.sprite) ? lockOn.ed.sprite.y : lockOn.lastY;
            const flightDur = 450;
            const startTime = this.time.now;
            const ang = Phaser.Math.Angle.Between(startX, startY, aimX, aimY);
            const perpAng = ang + Math.PI/2;
            const swayAmp = (Math.random()-0.5) * 60;
            const flightLoop = this.time.addEvent({
              delay: 16,
              loop: true,
              callback: ()=>{
                if(!orb.scene){ flightLoop.remove(); return; }
                const elapsed = this.time.now - startTime;
                const t = Math.min(1, elapsed / flightDur);
                // 着弾点を更新(ターゲット生存中は現在位置を追跡、死んだら最後の位置で止まる)
                let curAimX = aimX, curAimY = aimY;
                if(lockOn.ed && !lockOn.ed.dead && lockOn.ed.sprite){
                  curAimX = lockOn.ed.sprite.x;
                  curAimY = lockOn.ed.sprite.y;
                  lockOn.lastX = curAimX;
                  lockOn.lastY = curAimY;
                }else{
                  curAimX = lockOn.lastX;
                  curAimY = lockOn.lastY;
                }
                // 起点から終点への線形補間 + sin で揺らぎ
                const baseX = startX + (curAimX - startX) * t;
                const baseY = startY + (curAimY - startY) * t;
                const sway = Math.sin(t * Math.PI) * swayAmp;
                const px = baseX + Math.cos(perpAng) * sway;
                const py = baseY + Math.sin(perpAng) * sway;
                orb.setPosition(px, py);
                orbCore.setPosition(px, py);
                // 軌跡
                if(Math.random() < 0.4){
                  const trail = this.add.circle(px, py, 3, 0xaa44ff, 0.6).setDepth(17);
                  this.tweens.add({targets: trail, alpha:0, scaleX:0.3, scaleY:0.3, duration:400, onComplete:()=>trail.destroy()});
                }
                // 着弾
                if(t >= 1){
                  flightLoop.remove();
                  try{orb.destroy();}catch(e){}
                  try{orbCore.destroy();}catch(e){}
                  // 着弾エフェクト(敵生死問わず)
                  const burst = this.add.circle(curAimX, curAimY, 16, 0xaa44ff, 0.85).setDepth(20);
                  this.tweens.add({targets: burst, scaleX:2.5, scaleY:2.5, alpha:0, duration:300, onComplete:()=>burst.destroy()});
                  // ダメージ計算(常に実行)
                  const baseDmg = Math.max(1, Math.floor((pd.atk*2.0) + (pd.mag||0) * 6.0));
                  const isCrit = Math.random()*100 < calcCrit(pd);
                  const em = getElementMult('dark', (lockOn.ed && lockOn.ed.element)||'none');
                  const dmg = Math.max(1, Math.floor((isCrit?baseDmg*2:baseDmg) * em.mult));
                  totalDmg += dmg;
                  hitCount++;
                  // 敵が生きていれば実ダメージ反映
                  if(lockOn.ed && !lockOn.ed.dead && lockOn.ed.sprite){
                    this.hitEnemy(lockOn.ed, dmg, isCrit, true, em.label);
                  }
                  // 全弾着弾後にTOTAL表示
                  if(hitCount >= orbCount){
                    this.time.delayedCall(200, ()=>{
                      // 表示位置: 敵が生きていればその位置、死んでれば最後の位置
                      const tx = (lockOn.ed && !lockOn.ed.dead && lockOn.ed.sprite) ? lockOn.ed.sprite.x : lockOn.lastX;
                      const ty = (lockOn.ed && !lockOn.ed.dead && lockOn.ed.sprite) ? lockOn.ed.sprite.y : lockOn.lastY;
                      this.showTotalDamage(tx, ty, totalDmg);
                    });
                  }
                }
              },
            });
          });
        }
        this.showFloat(p.x, p.y-80, '✦ ダークストライク', '#cc88ff');
        try{SE('multishot');SE('magic');}catch(e){}
        this[cdKey]=sk.cd;
      }else if(num===3){ // 黒龍炎: 黒い龍が貫通する
        // 詠唱(1.5秒)
        this._casting=true;
        const castDur = 1500;
        const castBar = this.add.rectangle(p.x, p.y-50, 100, 6, 0x000000, 0.7).setDepth(20).setStrokeStyle(1, 0xaa44ff);
        const castFill = this.add.rectangle(p.x-50, p.y-50, 0, 6, 0xaa44ff, 1).setOrigin(0,0.5).setDepth(21);
        // 詠唱中、プレイヤー周囲に闇のオーラが集中
        const auraDots = [];
        for(let i=0;i<8;i++){
          const a = (i/8) * Math.PI * 2;
          const dot = this.add.circle(p.x+Math.cos(a)*60, p.y+Math.sin(a)*60, 6, 0xaa44ff, 0.85).setDepth(15);
          auraDots.push({dot, ang: a});
        }
        // 詠唱中、闇粒子がプレイヤーへ吸い込まれる
        this.tweens.add({
          targets: castFill, width: 100, duration: castDur,
          onUpdate: ()=>{ castBar.setPosition(p.x, p.y-50); castFill.setPosition(p.x-50, p.y-50); },
        });
        auraDots.forEach(d=>{
          this.tweens.add({
            targets: d.dot,
            x: p.x, y: p.y,
            scaleX: 0.2, scaleY: 0.2,
            duration: castDur,
            ease: 'Cubic.easeIn',
            onComplete: ()=>{try{d.dot.destroy();}catch(e){}},
          });
        });
        this.time.delayedCall(castDur, ()=>{
          this._casting=false;
          try{castBar.destroy();}catch(e){}
          try{castFill.destroy();}catch(e){}
          // 向き判定
          let targetAng = this._lastAngle || 0;
          let nearest=null, nd=600;
          this.enemyDataList.forEach(ed=>{
            if(ed.dead) return;
            const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
            if(d<nd){nd=d; nearest=ed;}
          });
          if(nearest){
            targetAng = Phaser.Math.Angle.Between(p.x,p.y,nearest.sprite.x,nearest.sprite.y);
          }
          // 黒龍が前方へうねりながら飛ぶ
          const range = 700;
          const beamWidth = 90;
          this._fireBlackDragon(p.x, p.y, targetAng, range, beamWidth);
          // ヒット判定(直線+幅・遅延付き)
          const cosA = Math.cos(targetAng);
          const sinA = Math.sin(targetAng);
          // 龍が通過するタイミングで段階的にダメージ(龍のスピードに合わせて遅く)
          // 24セグメント × 200ms = 4800ms かけて到達するので、6段階に分割
          const totalDur = 24 * 200;
          // 各敵ごとの累積ダメ追跡(死んだ敵にも演出だけ続ける)
          const totalsByEnemy = new Map();
          const lastPosByEnemy = new Map();
          for(let stage=0; stage<6; stage++){
            this.time.delayedCall(Math.floor(stage * totalDur / 6), ()=>{
              const stageStart = (stage/6) * range;
              const stageEnd = ((stage+1)/6) * range;
              this.enemyDataList.forEach(ed=>{
                if(!ed.sprite) return;
                // 既にこの敵がこの龍で貫かれた事があるか?
                const wasInDragon = totalsByEnemy.has(ed);
                // 範囲チェック(死んでなければ現在位置、死んでたら最後の位置で判定)
                let chkX, chkY;
                if(ed.dead){
                  if(!wasInDragon) return; // 元から死んでた敵は無視
                  const lp = lastPosByEnemy.get(ed);
                  chkX = lp.x; chkY = lp.y;
                }else{
                  chkX = ed.sprite.x; chkY = ed.sprite.y;
                }
                const dx = chkX - p.x;
                const dy = chkY - p.y;
                const fwd = dx*cosA + dy*sinA;
                if(fwd < stageStart || fwd > stageEnd) return;
                const perp = Math.abs(dx*(-sinA) + dy*cosA);
                if(perp >= beamWidth/2) return;
                // ヒット
                const baseDmg = Math.max(1, Math.floor((pd.atk*3.0) + (pd.mag||0) * 8.0));
                const isCrit = Math.random()*100 < calcCrit(pd);
                const em = getElementMult('dark', ed.element||'none');
                const dmg = Math.max(1, Math.floor((isCrit?baseDmg*2:baseDmg) * em.mult));
                // 累積記録
                totalsByEnemy.set(ed, (totalsByEnemy.get(ed)||0) + dmg);
                if(!ed.dead){
                  lastPosByEnemy.set(ed, {x: ed.sprite.x, y: ed.sprite.y});
                  this.hitEnemy(ed, dmg, isCrit, true, em.label);
                }
              });
            });
          }
          this.cameras.main.shake(500, 0.020);
          // 全段階終了後にTOTAL表示
          this.time.delayedCall(totalDur + 300, ()=>{
            totalsByEnemy.forEach((total, ed)=>{
              const pos = lastPosByEnemy.get(ed) || {x: p.x, y: p.y};
              this.showTotalDamage(pos.x, pos.y, total);
            });
          });
        });
        this.showFloat(p.x, p.y-80, '🐉 黒龍炎', '#aa44ff');
        try{SE('boss');SE('meteor');}catch(e){}
        this[cdKey]=sk.cd;
      }
      return;
    }

    // ─ 覚醒「アビスウォーロック」(abyss) ─
    // 深淵の呪印を「この魔法発動」で消費するヘルパ
    const _consumeAbyssCurse = ()=>{
      if(!pd._abyssCurseActive) return false;
      pd._abyssCurseActive = false;
      if(pd._abyssCurseAura){ try{pd._abyssCurseAura.destroy();}catch(e){} pd._abyssCurseAura=null; }
      return true;
    };
    if(pd.awakened==='abyss'){
      if(num===1){
        // ── ウォーターボール: 連射・自動追尾・移動不可・最大10発 ──
        // プレイヤー移動をロックする方式: _casting フラグ + 専用フラグ
        if(this._wbActive) return;  // 既に発動中なら無視
        this._wbActive = true;
        this._casting = true;       // 通常攻撃やスキル移動を抑止
        // 呪印を発動時に消費(この魔法発動の全ダメージが2倍になる)
        const useCurse = _consumeAbyssCurse();
        let shots = 0;
        const maxShots = 10;
        const shotInterval = 130;    // 連射間隔(ms)
        const spPerShot = 3;
        const playerDepth = 18;
        // 詠唱の青オーラ
        const castAura = this.add.circle(p.x, p.y, 36, 0x3366ff, 0.35).setDepth(15);
        const stop = ()=>{
          this._wbActive = false;
          this._casting = false;
          try{ castAura.destroy(); }catch(e){}
          this[cdKey] = sk.cd;
        };
        // ロックオン: 最初に決めた1体だけを撃ち続ける(死んだら発動停止)
        let lockedTgt = null;
        const fireOne = ()=>{
          if(!this._wbActive) return;
          // SP 切れチェック
          if(pd.sp < spPerShot){ stop(); return; }
          // 初回はロックオン、以降は同じ敵を狙い続ける
          if(!lockedTgt){
            let cand=null, mind=99999;
            this.enemyDataList.forEach(ed=>{
              if(ed.dead || !ed.sprite) return;
              const d = Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
              if(d<mind){ mind=d; cand=ed; }
            });
            if(!cand){ stop(); return; }
            lockedTgt = cand;
          }
          const tgt = lockedTgt;
          // ロック対象が死んだ/消えた → 発動停止(単体スキル)
          if(tgt.dead || !tgt.sprite){ stop(); return; }
          // SP消費
          pd.sp -= spPerShot;
          // 水球生成・追尾
          const ball = this.add.circle(p.x, p.y-10, 9, 0x3399ff, 0.95).setStrokeStyle(2, 0x88ddff, 1.0).setDepth(20);
          const glow = this.add.circle(p.x, p.y-10, 14, 0x66ccff, 0.4).setDepth(19);
          const start = {x:p.x, y:p.y-10};
          const tween = this.time.addEvent({
            delay: 16, repeat: 40,  // 約 640ms 最大
            callback: ()=>{
              if(!tgt || tgt.dead || !tgt.sprite){
                try{ball.destroy(); glow.destroy();}catch(e){}
                tween.remove();
                return;
              }
              const tx = tgt.sprite.x, ty = tgt.sprite.y;
              const dx = tx - ball.x, dy = ty - ball.y;
              const dist = Math.hypot(dx, dy);
              if(dist < 20){
                // 着弾: ダメージ
                const lv = (pd.awakSkillLv && pd.awakSkillLv.abyss && pd.awakSkillLv.abyss.sk1) || 1;
                const base = Math.max(1, Math.floor(pd.mag * (0.5 + lv*0.08)));
                let dmg = base + Phaser.Math.Between(0, pd.mag>>2);
                // 呪印を発動時に消費(この発動内の全ダメージが2倍)
                if(useCurse) dmg *= 2;
                // 属性: water
                const em = getElementMult('water', tgt.element||'none');
                dmg = Math.max(1, Math.floor(dmg * em.mult));
                this.hitEnemy(tgt, dmg, false, true, em.label);
                // 着弾エフェクト
                const splash = this.add.circle(tx, ty, 14, 0x88ddff, 0.7).setDepth(21);
                this.tweens.add({targets: splash, scaleX:2, scaleY:2, alpha:0, duration:280, onComplete:()=>splash.destroy()});
                try{ball.destroy(); glow.destroy();}catch(e){}
                tween.remove();
              }else{
                // ゴム的な追尾(速度を距離に応じて加速)
                const sp2 = Math.min(14, 6 + (40 - tween.getRepeatCount())*0.3);
                ball.x += (dx/dist) * sp2;
                ball.y += (dy/dist) * sp2;
                glow.setPosition(ball.x, ball.y);
              }
            }
          });
          shots++;
          if(shots >= maxShots){
            this.time.delayedCall(shotInterval, stop);
            return;
          }
          this.time.delayedCall(shotInterval, fireOne);
        };
        try{SE('skill');}catch(e){}
        fireOne();
        this.showFloat(p.x, p.y-60, '💧 ウォーターボール', '#66ccff');
      }
      else if(num===2){
        // ── リヴァイアサンゲート: 画面横断の津波・3hit+右ノックバック ──
        const useCurse = _consumeAbyssCurse();
        const cam = this.cameras.main;
        const screenW = cam.width;
        const screenH = cam.height;
        // 全てスクリーン座標で構築(scrollFactor 0)
        const waveCenterY = screenH * 0.55;
        const waveH = screenH * 0.78;          // 画面のほぼ縦全体
        const waveW = 180;                      // 波の厚み
        const startX = -waveW - 20;
        const endX = screenW + 80;

        // ── 背景の暗転(津波の暗い影)──
        const dim = this.add.rectangle(screenW/2, screenH/2, screenW, screenH, 0x000022, 0)
          .setScrollFactor(0).setDepth(15);
        this.tweens.add({targets:dim, alpha:0.25, duration:300, yoyo:true, hold:600, onComplete:()=>dim.destroy()});

        // ── 津波本体(複数層で立体感)──
        const layers = [];
        const layerDefs = [
          {col:0x051a44, alpha:0.85, depth:18, offX:-30, offY:8,  scaleY:1.0},
          {col:0x0a2266, alpha:0.85, depth:19, offX:-15, offY:4,  scaleY:1.0},
          {col:0x1144aa, alpha:0.85, depth:20, offX:0,   offY:0,  scaleY:1.0},
          {col:0x2266cc, alpha:0.75, depth:21, offX:18,  offY:-4, scaleY:0.94},
          {col:0x66bbee, alpha:0.65, depth:22, offX:36,  offY:-10,scaleY:0.85},
        ];
        layerDefs.forEach(d=>{
          const r = this.add.rectangle(startX + d.offX, waveCenterY + d.offY, waveW, waveH * d.scaleY, d.col, d.alpha)
            .setOrigin(0, 0.5).setScrollFactor(0).setDepth(d.depth);
          r.setStrokeStyle(d===layerDefs[2]?3:0, 0x88ddff, 0.95);
          layers.push(r);
        });
        // 白い泡(波頭・上端)
        const foamTop = this.add.rectangle(startX + 30, waveCenterY - waveH*0.4, waveW, 22, 0xeeffff, 0.95)
          .setOrigin(0, 0.5).setScrollFactor(0).setDepth(23);
        const foamMid = this.add.rectangle(startX + 50, waveCenterY, waveW * 0.85, 14, 0xddeeff, 0.85)
          .setOrigin(0, 0.5).setScrollFactor(0).setDepth(23);

        // ── 飛沫パーティクル(連続生成)──
        const sprays = [];
        const spraySpawn = this.time.addEvent({
          delay: 30, loop: true,
          callback: ()=>{
            // 波頭付近に飛沫
            const baseX = layers[2].x + waveW * 0.5;
            const baseY = waveCenterY - waveH * 0.42 + Math.random() * 30;
            for(let i=0;i<3;i++){
              const sx = baseX + (Math.random()-0.5) * waveW;
              const sy = baseY + Math.random() * 15;
              const sz = 2 + Math.random()*5;
              const spray = this.add.circle(sx, sy, sz, 0xddeeff, 0.85).setScrollFactor(0).setDepth(24);
              this.tweens.add({
                targets: spray,
                x: sx + (Math.random()-0.2) * 60,
                y: sy - 40 - Math.random()*80,
                alpha: 0,
                duration: 600 + Math.random()*400,
                onComplete: ()=>{ try{spray.destroy();}catch(e){} },
              });
            }
          }
        });

        // 画面振動(津波の迫力)
        this.cameras.main.shake(1500, 0.008);

        // ── ダメージ判定 ──
        const lv = (pd.awakSkillLv && pd.awakSkillLv.abyss && pd.awakSkillLv.abyss.sk2) || 1;
        const dmgBase = Math.max(1, Math.floor(pd.mag * (1.6 + lv*0.18)));
        let hitCount = 0;
        const dealDamage = ()=>{
          if(hitCount >= 3) return;
          hitCount++;
          // 中央レイヤーの画面X位置で判定
          const waveScreenLeft = layers[2].x;
          const waveScreenRight = waveScreenLeft + waveW;
          const waveScreenTop = waveCenterY - waveH/2;
          const waveScreenBot = waveCenterY + waveH/2;
          this.enemyDataList.forEach(ed=>{
            if(ed.dead || !ed.sprite) return;
            // 敵のワールド座標 → スクリーン座標
            const ex = ed.sprite.x - cam.scrollX;
            const ey = ed.sprite.y - cam.scrollY;
            if(ex >= waveScreenLeft - 30 && ex <= waveScreenRight + 30 &&
               ey >= waveScreenTop && ey <= waveScreenBot){
              let dmg = dmgBase + Phaser.Math.Between(0, pd.mag>>2);
              if(useCurse) dmg *= 2;
              const em = getElementMult('water', ed.element||'none');
              dmg = Math.max(1, Math.floor(dmg * em.mult));
              this.hitEnemy(ed, dmg, false, true, em.label);
              // ノックバック(強制右へ・物理速度+位置オフセット)
              if(ed.sprite && ed.sprite.body){
                ed.sprite.body.setVelocityX(600);
                ed.sprite.body.setVelocityY(-150);
              }
              if(ed.sprite){
                ed.sprite.x += 30;
              }
              // ヒット時に水しぶきエフェクト
              for(let i=0;i<5;i++){
                const sx = ed.sprite.x + (Math.random()-0.5)*30;
                const sy = ed.sprite.y - 10 - Math.random()*20;
                const sp = this.add.circle(sx, sy, 4+Math.random()*4, 0xaaccff, 0.9).setDepth(25);
                this.tweens.add({
                  targets: sp, x: sx + Math.random()*40, y: sy - 30 - Math.random()*30,
                  alpha: 0, duration: 500,
                  onComplete: ()=>{ try{sp.destroy();}catch(e){} },
                });
              }
            }
          });
        };

        // ── トゥイーン: 全レイヤーを左→右へ移動 ──
        const totalDur = 1400;
        const allShapes = [...layers, foamTop, foamMid];
        this.tweens.add({
          targets: allShapes,
          x: '+='+(endX - startX),
          duration: totalDur,
          ease: 'Sine.easeInOut',
          onUpdate: ()=>{
            // 中央レイヤーの位置で進捗を計測
            const prog = (layers[2].x - startX) / (endX - startX);
            if(hitCount === 0 && prog > 0.20) dealDamage();
            else if(hitCount === 1 && prog > 0.50) dealDamage();
            else if(hitCount === 2 && prog > 0.80) dealDamage();
          },
          onComplete: ()=>{
            allShapes.forEach(o=>{try{o.destroy();}catch(e){}});
            spraySpawn.remove();
          },
        });
        try{SE('skill');SE('boss');}catch(e){}
        this.showFloat(p.x, p.y-60, '🌊 リヴァイアサンゲート', '#3399ff');
        this[cdKey] = sk.cd;
      }
      else if(num===3){
        // ── 深淵の呪印: 次の魔法ダメージ2倍 + 派手な発動演出 ──
        if(pd._abyssCurseActive){
          this.showFloat(p.x, p.y-60, '既に呪印が有効', '#88aaff', 'info');
          return;
        }
        pd._abyssCurseActive = true;
        // ── (1) 画面の青フラッシュ + 振動 ──
        this.cameras.main.flash(400, 30, 80, 200);
        this.cameras.main.shake(400, 0.012);
        // ── (2) プレイヤーの足元から深海の渦が立ち昇る ──
        // 巨大な青いゲート(楕円多重リング)
        const gates = [];
        for(let i=0;i<4;i++){
          const gate = this.add.ellipse(p.x, p.y+5, 30, 12, [0x1144ff,0x3366ff,0x66aaff,0x88ccff][i], 0)
            .setStrokeStyle(5-i, [0x66aaff,0x88ccff,0xaaddff,0xccf0ff][i], 0.95).setDepth(17+i);
          gates.push(gate);
          this.tweens.add({
            targets: gate,
            scaleX: 5 + i*0.5, scaleY: 8 + i*0.4,
            alpha: 0,
            duration: 700 + i*100,
            ease: 'Cubic.easeOut',
            delay: i*60,
            onComplete: ()=>{ try{gate.destroy();}catch(e){} },
          });
        }
        // ── (3) 深海色の柱がプレイヤーを包む ──
        const pillar = this.add.rectangle(p.x, p.y, 8, 8, 0x1144ff, 0.85).setDepth(19);
        pillar.setStrokeStyle(3, 0x66aaff, 0.9);
        this.tweens.add({
          targets: pillar,
          scaleX: 14, scaleY: 28,
          duration: 350,
          ease: 'Cubic.easeOut',
          yoyo: true,
          hold: 200,
          onComplete: ()=>{ try{pillar.destroy();}catch(e){} },
        });
        // ── (4) 水泡(バブル)が周囲から吸い込まれる ──
        for(let i=0;i<24;i++){
          const ang = (i/24) * Math.PI * 2;
          const startR = 100 + Math.random()*40;
          const sx = p.x + Math.cos(ang)*startR;
          const sy = p.y + Math.sin(ang)*startR;
          const bubble = this.add.circle(sx, sy, 4+Math.random()*4, 0x88ccff, 0.85)
            .setStrokeStyle(1, 0xddeeff, 0.9).setDepth(20);
          this.tweens.add({
            targets: bubble,
            x: p.x + (Math.random()-0.5)*10,
            y: p.y + (Math.random()-0.5)*10,
            alpha: 0,
            scaleX: 0.3, scaleY: 0.3,
            duration: 500 + i*15,
            ease: 'Cubic.easeIn',
            onComplete: ()=>{ try{bubble.destroy();}catch(e){} },
          });
        }
        // ── (5) 神秘的な呪印(六角形リング)──
        const sigil = this.add.text(p.x, p.y, '⛧', {fontSize:'80px', color:'#66aaff', stroke:'#ffffff', strokeThickness:4}).setOrigin(0.5).setDepth(22).setAlpha(0);
        this.tweens.add({
          targets: sigil, alpha: 1, scaleX: 1.5, scaleY: 1.5, rotation: Math.PI*2,
          duration: 600, ease: 'Cubic.easeOut',
          onComplete: ()=>{
            this.tweens.add({
              targets: sigil, alpha: 0, scaleX: 0.5, scaleY: 0.5,
              duration: 400,
              onComplete: ()=>{ try{sigil.destroy();}catch(e){} },
            });
          }
        });
        // ── (6) 持続オーラ(消費されるまで)──
        // 大きい外側オーラ(青)
        const auraOuter = this.add.circle(p.x, p.y, 44, 0x1144ff, 0.25).setDepth(15);
        // 内側ストロークオーラ
        const auraInner = this.add.circle(p.x, p.y, 30, 0x3366ff, 0.0).setStrokeStyle(3, 0x66aaff, 0.9).setDepth(16);
        // 回転リング(呪印のテキスト)
        const ringTxt = this.add.text(p.x, p.y, '◇', {fontSize:'40px', color:'#88ccff', stroke:'#0a1438', strokeThickness:3}).setOrigin(0.5).setDepth(17).setAlpha(0.85);
        pd._abyssCurseAura = auraOuter;
        // 追従 + パルス + 回転
        const followTween = this.time.addEvent({
          delay: 30, loop: true,
          callback: ()=>{
            if(!pd._abyssCurseActive){
              try{auraOuter.destroy(); auraInner.destroy(); ringTxt.destroy();}catch(e){}
              followTween.remove();
              return;
            }
            auraOuter.setPosition(p.x, p.y);
            auraInner.setPosition(p.x, p.y);
            ringTxt.setPosition(p.x, p.y);
            ringTxt.rotation += 0.04;
          }
        });
        // パルス
        this.tweens.add({
          targets: auraOuter, scaleX:1.3, scaleY:1.3, alpha:0.45,
          duration:700, yoyo:true, repeat:-1, ease:'Sine.easeInOut',
        });
        this.tweens.add({
          targets: auraInner, scaleX:1.5, scaleY:1.5, alpha:0.6,
          duration:900, yoyo:true, repeat:-1, ease:'Sine.easeInOut',
        });
        // 立ち昇る泡(オーラ持続中)
        const bubbleSpawn = this.time.addEvent({
          delay: 200, loop: true,
          callback: ()=>{
            if(!pd._abyssCurseActive){ bubbleSpawn.remove(); return; }
            const bsx = p.x + (Math.random()-0.5)*30;
            const bsy = p.y + 20;
            const bb = this.add.circle(bsx, bsy, 2+Math.random()*3, 0x88ccff, 0.85).setDepth(16);
            this.tweens.add({
              targets: bb, y: bsy - 50 - Math.random()*30, alpha: 0,
              duration: 800 + Math.random()*300,
              onComplete: ()=>{ try{bb.destroy();}catch(e){} },
            });
          }
        });
        try{SE('skill');SE('meteor');}catch(e){}
        this.showFloat(p.x, p.y-70, '⛧ 深淵の呪印', '#66aaff');
        this[cdKey] = sk.cd;
      }
      return;
    }

    // ─ 覚醒「侍」 ─
    if(pd.awakened==='samurai'){
      if(num===1){ // 居合斬り: 敵の背後にワープ+一撃
        // 最寄りの敵を探す
        let closest=null, cd=300;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<cd){cd=d; closest=ed;}
        });
        if(!closest){
          this.showFloat(p.x,p.y-50,'敵が居ない','#888888','info');
          this[cdKey]=0.5;
          return;
        }
        // ワープ前に残像
        const ghost=this.add.image(p.x, p.y, p.texture.key, p.frame.name).setDisplaySize(p.displayWidth, p.displayHeight).setDepth(4).setAlpha(0.7).setTint(0xff4466);
        this.tweens.add({targets:ghost, alpha:0, duration:300, onComplete:()=>ghost.destroy()});
        // 敵の背後(プレイヤーから敵への方向の反対側)にワープ
        const ang = Phaser.Math.Angle.Between(p.x, p.y, closest.sprite.x, closest.sprite.y);
        const sz = closest.sprite.displayWidth || 60;
        const wx = closest.sprite.x + Math.cos(ang) * (sz*0.7);
        const wy = closest.sprite.y + Math.sin(ang) * (sz*0.7);
        p.setPosition(wx, wy);
        // 強力な斬撃エフェクト
        const slash=this.add.image(closest.sprite.x, closest.sprite.y, 'fx_slash').setRotation(ang+Math.PI).setDisplaySize(120,120).setDepth(20).setTint(0xff4466);
        this.tweens.add({targets:slash, alpha:0, scaleX:2, scaleY:2, duration:300, onComplete:()=>slash.destroy()});
        // 大ダメージ: ATK × 6.0(Lv5固定・覚醒バフ)
        const baseDmg = Math.max(1, Math.floor(pd.atk * 6.0));
        const isCrit = Math.random()*100 < calcCrit(pd);
        const dmg = isCrit ? Math.floor(baseDmg*2) : baseDmg;
        this.hitEnemy(closest, dmg, isCrit, true, '');
        this.cameras.main.shake(150, 0.012);
        this.showFloat(p.x, p.y-60, '🗡 居合斬り', '#ff4466');
        try{SE('slash');SE('crit');}catch(e){}
        this[cdKey]=sk.cd;
      }else if(num===2){ // 燕返し: 5秒間カウンター態勢
        pd._samuraiCounterUntil = this.time.now + 5000;
        // バフ表示
        this.showBuffTimer('燕返し','#aaccff', 5000);
        // 視覚: プレイヤー周囲に青い回転オーラ
        const cnt = this.add.circle(p.x, p.y, 50, 0x88ccff, 0).setStrokeStyle(3, 0x88ccff, 0.8).setDepth(15);
        pd._samuraiCounterRing = cnt;
        this.tweens.add({
          targets: cnt,
          rotation: Math.PI * 2,
          duration: 1500,
          repeat: 2,
          onComplete: ()=>{ try{cnt.destroy();}catch(e){} pd._samuraiCounterRing=null; },
        });
        this.showFloat(p.x, p.y-60, '🌪 燕返し 構え', '#aaccff');
        try{SE('parry');}catch(e){}
        this[cdKey]=sk.cd;
      }else if(num===3){ // 鬼殺し: 範囲内の敵に5回連撃
        const radius = 120;
        // 範囲内の敵を取得
        const targets = this.enemyDataList.filter(ed=>{
          if(ed.dead) return false;
          return Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y) < radius;
        });
        if(targets.length===0){
          this.showFloat(p.x,p.y-50,'敵が居ない','#888888','info');
          this[cdKey]=1;
          return;
        }
        // 範囲リング表示
        const ring=this.add.circle(p.x, p.y, radius, 0xff4466, 0.15).setStrokeStyle(3, 0xff4466, 0.7).setDepth(15);
        this.tweens.add({targets:ring, alpha:0, duration:600, onComplete:()=>ring.destroy()});
        // 各敵ごとの累積ダメ追跡
        const totalsByEnemy = new Map();
        const lastPos = new Map();
        targets.forEach(ed=>{
          totalsByEnemy.set(ed, 0);
          lastPos.set(ed, {x: ed.sprite.x, y: ed.sprite.y});
        });
        // 5回連続ヒット(各回 ATK × 1.4 = 計 ATK × 7.0)
        const hits = 5;
        for(let i=0;i<hits;i++){
          this.time.delayedCall(i*120, ()=>{
            targets.forEach(ed=>{
              if(!ed.sprite) return;
              const baseDmg = Math.max(1, Math.floor(pd.atk * 1.4));
              const isCrit = Math.random()*100 < calcCrit(pd);
              const dmg = isCrit ? Math.floor(baseDmg*2) : baseDmg;
              // 累積記録(死後でも続ける)
              totalsByEnemy.set(ed, (totalsByEnemy.get(ed)||0) + dmg);
              if(!ed.dead){
                lastPos.set(ed, {x: ed.sprite.x, y: ed.sprite.y});
                this.hitEnemy(ed, dmg, isCrit, true, '');
              }
              // 斬撃エフェクト(派手な多段演出)
              const pos = lastPos.get(ed);
              const ang = Math.random()*Math.PI*2;
              // ── ヒット順で色変化(赤→赤橙→黄→白) ──
              const slashCols = [0xff2244, 0xff5544, 0xffaa44, 0xffdd66, 0xffffff];
              const slashCol = slashCols[i] || 0xff4466;
              // ── 大きな斬撃本体(120pxに拡大・縦長で迫力) ──
              const slash = this.add.image(pos.x, pos.y, 'fx_slash')
                .setRotation(ang).setDisplaySize(120, 120).setDepth(22)
                .setTint(slashCol).setAlpha(1.0);
              this.tweens.add({
                targets: slash, alpha: 0,
                scaleX: 2.2, scaleY: 2.2,
                duration: 320,
                onComplete: ()=>slash.destroy()
              });
              // ── 残像(同じ位置に少しズラして3枚) ──
              for(let k=0; k<3; k++){
                const offX = (Math.random()-0.5)*40;
                const offY = (Math.random()-0.5)*40;
                const ghostAng = ang + (Math.random()-0.5)*0.5;
                const ghost = this.add.image(pos.x+offX, pos.y+offY, 'fx_slash')
                  .setRotation(ghostAng).setDisplaySize(80, 80).setDepth(21)
                  .setTint(slashCol).setAlpha(0.7);
                this.tweens.add({
                  targets: ghost, alpha: 0,
                  scaleX: 1.6, scaleY: 1.6,
                  duration: 280,
                  delay: k*30,
                  onComplete: ()=>ghost.destroy()
                });
              }
              // ── ヒット時の閃光(円形フラッシュ) ──
              const flash = this.add.circle(pos.x, pos.y, 20, slashCol, 0.9).setDepth(23);
              this.tweens.add({
                targets: flash,
                radius: 50, alpha: 0,
                scaleX: 2.5, scaleY: 2.5,
                duration: 200,
                onComplete: ()=>flash.destroy()
              });
              // ── 火花パーティクル(8方向) ──
              const sparkCount = 8;
              for(let s=0; s<sparkCount; s++){
                const sAng = (s/sparkCount)*Math.PI*2 + Math.random()*0.3;
                const sDist = 30 + Math.random()*40;
                const spark = this.add.circle(pos.x, pos.y, 3, 0xffeeaa, 1).setDepth(22);
                this.tweens.add({
                  targets: spark,
                  x: pos.x + Math.cos(sAng)*sDist,
                  y: pos.y + Math.sin(sAng)*sDist,
                  alpha: 0,
                  scaleX: 0.2, scaleY: 0.2,
                  duration: 250 + Math.random()*150,
                  onComplete: ()=>spark.destroy()
                });
              }
              // ── 最終ヒット(5発目)は特別演出 ──
              if(i === hits - 1){
                // 大爆発リング
                const bigRing = this.add.circle(pos.x, pos.y, 30, 0xffffff, 0)
                  .setStrokeStyle(5, 0xffeecc, 1).setDepth(24);
                this.tweens.add({
                  targets: bigRing,
                  radius: 100,
                  alpha: 0,
                  scaleX: 3, scaleY: 3,
                  duration: 500,
                  onComplete: ()=>bigRing.destroy()
                });
                // 十字斬りの大きな閃光
                for(let q=0; q<2; q++){
                  const cross = this.add.image(pos.x, pos.y, 'fx_slash')
                    .setRotation(q*Math.PI/2).setDisplaySize(180, 60)
                    .setDepth(23).setTint(0xffffff).setAlpha(0.9);
                  this.tweens.add({
                    targets: cross, alpha: 0,
                    scaleX: 1.8, scaleY: 1.8,
                    duration: 400,
                    onComplete: ()=>cross.destroy()
                  });
                }
              }
            });
            // ── シェイク強化(後半ほど強く) ──
            const shakeIntensity = 0.008 + i*0.003;
            const shakeDuration = 100 + i*20;
            this.cameras.main.shake(shakeDuration, shakeIntensity);
            try{SE('slash');}catch(e){}
          });
        }
        // 全弾終了後にTOTAL表示
        this.time.delayedCall(hits*120 + 200, ()=>{
          totalsByEnemy.forEach((total, ed)=>{
            const pos = lastPos.get(ed) || {x:p.x,y:p.y};
            this.showTotalDamage(pos.x, pos.y, total);
          });
        });
        this.showFloat(p.x, p.y-60, '👹 鬼殺し！', '#ff4466');
        this[cdKey]=sk.cd;
      }
      return;
    }

    // ─ ノービス ─
    if(pd.cls==='novice'){
      if(num===1){ // スーパーアタック: 単体への強攻撃
        SE('hit');
        // 最寄りの敵(範囲90px)
        let closest=null, cd=90;
        this.enemyDataList.forEach(ed=>{
          if(ed.dead) return;
          const d=Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
          if(d<cd){cd=d; closest=ed;}
        });
        // エフェクト(対象がいなくても表示)
        const ang=closest
          ? Phaser.Math.Angle.Between(p.x,p.y,closest.sprite.x,closest.sprite.y)
          : (this._lastAngle||0);
        const fx=p.x+Math.cos(ang)*44, fy=p.y+Math.sin(ang)*44;
        const slash=this.add.image(fx,fy,'fx_slash').setRotation(ang).setDisplaySize(72,72).setDepth(20).setAlpha(1.0).setTint(0xffee44);
        this.tweens.add({targets:slash,alpha:0,scaleX:2,scaleY:2,duration:300,onComplete:()=>slash.destroy()});
        // 黄色い閃光
        const flash=this.add.circle(p.x,p.y,40,0xffee88,0.5).setDepth(19);
        this.tweens.add({targets:flash,scaleX:2,scaleY:2,alpha:0,duration:250,onComplete:()=>flash.destroy()});
        this.cameras.main.shake(120,0.008);
        this.showFloat(p.x,p.y-60,'⚡ スーパーアタック！','#ffee44');
        if(closest){
          // ダメージ: ATK × (2.0 + Lv×0.5) = Lv1:2.5x, Lv5:4.5x
          const skLv=pd.sk1||1;
          const mult=2.0 + skLv*0.5;
          const baseDmg=Math.max(1, Math.floor(pd.atk*mult));
          // クリティカル判定
          const isCrit=Math.random()*100<calcCrit(pd);
          const finalDmg=isCrit ? Math.floor(baseDmg*2) : baseDmg;
          // 属性相性(ノービスは無属性)
          const em=getElementMult('none', closest.element||'none');
          const dmg=Math.max(1, Math.floor(finalDmg*em.mult));
          this.hitEnemy(closest, dmg, isCrit, true, em.label);
        }
        this[cdKey]=sk.cd;
      }else if(num===2){ // 手当: 自己回復
        SE('skill');
        // 回復量: 最大HPの (15% + Lv×5%) = Lv1:20%, Lv5:40%
        const skLv=pd.sk2||1;
        const ratio=0.15 + skLv*0.05;
        const heal=Math.max(1, Math.floor(pd.mhp*ratio));
        const before=pd.hp;
        pd.hp=Math.min(pd.mhp, pd.hp+heal);
        const actualHeal=pd.hp-before;
        // 緑の十字エフェクト + キラキラ
        const cross=this.add.text(p.x, p.y-40, '✚', {fontSize:'40px', color:'#44ff88', stroke:'#000', strokeThickness:3}).setOrigin(0.5).setDepth(20);
        this.tweens.add({targets:cross, y:p.y-100, alpha:0, scaleX:1.5, scaleY:1.5, duration:600, onComplete:()=>cross.destroy()});
        // 上向きパーティクル
        for(let i=0;i<6;i++){
          const px=p.x+(Math.random()-0.5)*40;
          const py=p.y+10;
          const dot=this.add.circle(px, py, 3+Math.random()*3, 0x88ff88, 0.9).setDepth(20);
          this.tweens.add({
            targets:dot,
            y:py-50-Math.random()*30,
            alpha:0,
            duration:600+Math.random()*200,
            onComplete:()=>dot.destroy(),
          });
        }
        // 緑のオーラ
        const aura=this.add.circle(p.x, p.y, 30, 0x44ff88, 0.4).setDepth(19);
        this.tweens.add({targets:aura, scaleX:1.8, scaleY:1.8, alpha:0, duration:500, onComplete:()=>aura.destroy()});
        this.showFloat(p.x, p.y-60, '+'+actualHeal+' HP', '#44ff88', 'info');
        this.updateHUD();
        this[cdKey]=sk.cd;
      }
      return;
    }

    // ─ 剣士 ─
    if(pd.cls==='warrior'){
      if(num===1){ // 烈風斬
        SE('slash');
        const range=140*(1+(pd.sk1-1)*0.1);
        // ── 範囲を示す円エフェクト(攻撃範囲が一目でわかる) ──
        // 1. 中心フラッシュ(白い閃光)
        const flash=this.add.circle(p.x,p.y,range*0.25,0xffffff,0.7).setDepth(24);
        this.tweens.add({targets:flash,alpha:0,scaleX:0.1,scaleY:0.1,duration:180,onComplete:()=>flash.destroy()});
        // 2. メインリング(赤い円が一気に拡大して攻撃範囲を表現)
        const ring1=this.add.circle(p.x,p.y,8,0xe74c3c,0).setStrokeStyle(7,0xe74c3c,1.0).setDepth(23);
        this.tweens.add({targets:ring1,scaleX:range/8,scaleY:range/8,alpha:0,duration:280,ease:'Cubic.easeOut',onComplete:()=>ring1.destroy()});
        // 3. 内側リング(オレンジで内側を補強)
        const ring2=this.add.circle(p.x,p.y,8,0xff8844,0).setStrokeStyle(4,0xff8844,0.85).setDepth(23);
        this.tweens.add({targets:ring2,scaleX:range*0.7/8,scaleY:range*0.7/8,alpha:0,duration:220,ease:'Cubic.easeOut',delay:30,onComplete:()=>ring2.destroy()});
        // 4. 外側リング(黄色で広範囲をフィニッシュ)
        const ring3=this.add.circle(p.x,p.y,8,0xffcc44,0).setStrokeStyle(3,0xffcc44,0.6).setDepth(22);
        this.tweens.add({targets:ring3,scaleX:range*1.05/8,scaleY:range*1.05/8,alpha:0,duration:340,ease:'Cubic.easeOut',delay:60,onComplete:()=>ring3.destroy()});
        // 5. 風斬りパーティクル(8方向に飛ぶ風の刃)
        for(let i=0;i<8;i++){
          const ang=(i/8)*Math.PI*2;
          const slash=this.add.rectangle(p.x,p.y,18,3,0xffffff,0.95).setRotation(ang+Math.PI/2).setDepth(24);
          this.tweens.add({
            targets:slash,
            x:p.x+Math.cos(ang)*range*0.85,
            y:p.y+Math.sin(ang)*range*0.85,
            alpha:0, scaleX:0.3,
            duration:280, ease:'Cubic.easeOut',
            onComplete:()=>slash.destroy()
          });
        }
        // ダメージ判定
        this.enemyDataList.forEach(ed=>{if(!ed.dead&&Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y)<range){const dmg=Math.max(1,Math.floor(pd.atk*(4+pd.sk1*0.3)));this.hitEnemy(ed,dmg,Math.random()*100<calcCrit(pd),true);}});
        this.showFloat(p.x,p.y-60,'⚔ 烈風斬！','#e74c3c');this.cameras.main.shake(200,0.01);
      }else if(num===2){ // ハードガード
        SE('guard');
        const dur=20000;
        this._guardDef=pd.def; pd.def+=30;
        this.showFloat(p.x,p.y-60,'🛡 ハードガード！','#3498db');
        const flash=this.add.rectangle(p.x,p.y,60,80,0x3498db,0.3).setDepth(20);
        this.tweens.add({targets:flash,alpha:0,duration:dur,onComplete:()=>{flash.destroy();pd.def=this._guardDef;}});
        // ── キャラクターの上に盾エフェクト ──
        // 1. 盾の絵文字(キャラクターの上に浮遊)
        const shield=this.add.text(p.x, p.y, '🛡', {fontSize:'48px'}).setOrigin(0.5).setDepth(8).setAlpha(0.95);
        // 2. 盾の周りに青い光のリング
        const shieldRing=this.add.circle(p.x, p.y, 30, 0x3498db, 0).setStrokeStyle(3, 0x66ccff, 0.7).setDepth(7);
        // 3. 盾の登場演出(上から降りてくる + 拡大)
        shield.setScale(0.1).setAlpha(0).setY(p.y-80);
        this.tweens.add({targets:shield, y:p.y, alpha:1, scaleX:1, scaleY:1, duration:300, ease:'Back.easeOut'});
        // 4. 盾と光の追従(プレイヤーに付いて回る)
        const shieldEffect=this.time.addEvent({
          delay:50, repeat:dur/50,
          callback:()=>{
            if(shield.active){
              const t = (this.time.now / 400);
              const bobY = Math.sin(t)*3; // 軽い浮遊
              shield.setPosition(p.x, p.y + bobY);
              shieldRing.setPosition(p.x, p.y + bobY);
            }
          }
        });
        // 5. 盾の点滅(神々しく)
        this.tweens.add({
          targets:shield, alpha:0.7,
          duration:600, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
        });
        // 6. 光のリングのパルス
        this.tweens.add({
          targets:shieldRing,
          scaleX:1.3, scaleY:1.3, alpha:0.3,
          duration:800, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
        });
        // 7. 終了時にフェードアウトして消える
        this.time.delayedCall(dur-400,()=>{
          this.tweens.add({
            targets:[shield, shieldRing],
            alpha:0, scaleX:0.3, scaleY:0.3,
            duration:400,
            onComplete:()=>{
              shield.destroy();
              shieldRing.destroy();
              if(shieldEffect) shieldEffect.remove();
            }
          });
        });
        this.showBuffTimer('🛡 ハードガード','#3498db',dur);
      }else if(num===3){ // パリィ
        SE('parry');
        pd._parry=true;
        this.showFloat(p.x,p.y-60,'🛡 パリィ！','#ffd700');
        // ── 剣と剣がぶつかるエフェクト ──
        // 1. 2本の剣が左右から打ち合う(キャラクターの上)
        const swordL=this.add.text(p.x-80, p.y-30, '🗡', {fontSize:'40px'}).setOrigin(0.5).setDepth(20).setRotation(-Math.PI/4);
        const swordR=this.add.text(p.x+80, p.y-30, '⚔', {fontSize:'40px'}).setOrigin(0.5).setDepth(20).setRotation(Math.PI/4);
        // 2. 中央に集まる(打ち合う動作)
        this.tweens.add({
          targets:swordL, x:p.x-12, rotation:0,
          duration:140, ease:'Cubic.easeIn',
          onComplete:()=>{
            // 衝突点で激しいフラッシュ
            const clashFlash=this.add.circle(p.x, p.y-30, 25, 0xffffff, 1).setDepth(22);
            this.tweens.add({targets:clashFlash, scaleX:2, scaleY:2, alpha:0, duration:250, onComplete:()=>clashFlash.destroy()});
            // 衝突点に金色の星マーク
            const starBurst=this.add.text(p.x, p.y-30, '✨', {fontSize:'56px'}).setOrigin(0.5).setDepth(23).setAlpha(0).setScale(0.3);
            this.tweens.add({targets:starBurst, alpha:1, scaleX:1.4, scaleY:1.4, duration:200, ease:'Back.easeOut',
              onComplete:()=>{
                this.tweens.add({targets:starBurst, alpha:0, duration:300, onComplete:()=>starBurst.destroy()});
              }
            });
            // 衝突の火花(8方向に散る)
            for(let i=0;i<8;i++){
              const ang=(i/8)*Math.PI*2;
              const spark=this.add.circle(p.x, p.y-30, 4, 0xffeebb, 1).setDepth(22);
              this.tweens.add({
                targets:spark,
                x:p.x+Math.cos(ang)*55,
                y:p.y-30+Math.sin(ang)*55,
                alpha:0, scaleX:0.3, scaleY:0.3,
                duration:400, ease:'Cubic.easeOut',
                onComplete:()=>spark.destroy()
              });
            }
            // 軽い画面揺れ(衝撃)
            this.cameras.main.shake(120, 0.005);
          }
        });
        this.tweens.add({
          targets:swordR, x:p.x+12, rotation:0,
          duration:140, ease:'Cubic.easeIn'
        });
        // 3. 剣の余韻(打ち合った後、徐々にフェード)
        this.time.delayedCall(180,()=>{
          this.tweens.add({
            targets:[swordL, swordR],
            alpha:0, y:p.y-80,
            duration:400,
            onComplete:()=>{ swordL.destroy(); swordR.destroy(); }
          });
        });
        // 4. パリィ持続中はキャラクターの周りに薄い金色のオーラ
        const auraRing=this.add.circle(p.x, p.y, 40, 0xffd700, 0).setStrokeStyle(2, 0xffd700, 0.5).setDepth(6);
        const auraEffect=this.time.addEvent({
          delay:50, repeat:20000/50,
          callback:()=>{
            if(auraRing.active) auraRing.setPosition(p.x, p.y);
          }
        });
        this.tweens.add({
          targets:auraRing,
          scaleX:1.15, scaleY:1.15, alpha:0.3,
          duration:1000, yoyo:true, repeat:-1, ease:'Sine.easeInOut'
        });
        this.time.delayedCall(20000,()=>{
          if(auraRing.active) auraRing.destroy();
          if(auraEffect) auraEffect.remove();
        });
        this.time.delayedCall(20000,()=>{pd._parry=false;});
        this.showBuffTimer('✨ パリィ','#ffd700',20000);
      }else if(num===4){ // バーサクパワー
        if(!pd._hasBerserk){this.showFloat(p.x,p.y-50,'書物が必要です','#ff8800','info');pd.sp+=sk.cost;return;}
        const skLv=pd.sk4||1;
        // Lv1-9: 20秒・1.5倍、Lv10: 30秒・2倍
        const dur=skLv>=10?30000:20000;
        const spMod=skLv>=10?30:20;
        // SP消費をLv10は30に
        if(skLv>=10&&pd.sp<30){this.showFloat(p.x,p.y-50,'SP不足','#3498db','info');pd.sp+=sk.cost;return;}
        if(skLv>=10){pd.sp-=(30-sk.cost);} // 差分追加消費
        SE('berserk');
        const atkMult=skLv>=10?2.0:1.5;
        pd._berserkMult=atkMult;
        this.showFloat(p.x,p.y-60,'⚔ バーサクパワー！','#ff4444');
        this.cameras.main.flash(300,255,80,0);
        // バーサクのオーラエフェクト
        const aura=this.add.circle(p.x,p.y,50,0xff2200,0.2).setDepth(6);
        this.time.addEvent({delay:100,repeat:dur/100,callback:()=>{if(aura.active){aura.setPosition(p.x,p.y);}}});
        this.tweens.add({targets:aura,alpha:0,duration:dur,onComplete:()=>aura.destroy()});
        this.showBuffTimer('⚔ バーサク','#ff4444',dur);
        this.time.delayedCall(dur,()=>{pd._berserkMult=1;});
      }
    }
    // ─ マジシャン ─
    else if(pd.cls==='mage'){
      if(num===1){ // 大爆発（詠唱3秒）
        this._startCast('🔮 大爆発',3,()=>{
          const range=220*(1+(pd.sk1-1)*0.08);
          const cx=p.x, cy=p.y;

          // ── 爆発エフェクト（攻撃範囲と完全一致）──
          // 中心フラッシュ
          const flash=this.add.circle(cx,cy,range*0.3,0xffffff,0.9).setDepth(25);
          this.tweens.add({targets:flash,alpha:0,scaleX:0.1,scaleY:0.1,duration:200,onComplete:()=>flash.destroy()});

          // メインリング（range半径まで拡大）
          const ring1=this.add.circle(cx,cy,8,0xcc44ff,0).setStrokeStyle(6,0xcc44ff,1.0).setDepth(24);
          this.tweens.add({targets:ring1,scaleX:range/8,scaleY:range/8,alpha:0,duration:500,ease:'Cubic.easeOut',onComplete:()=>ring1.destroy()});

          // 外リング（range×1.05まで拡大・少し遅れ）
          const ring2=this.add.circle(cx,cy,8,0xff88ff,0).setStrokeStyle(3,0xff88ff,0.7).setDepth(23);
          this.tweens.add({targets:ring2,scaleX:range*1.05/8,scaleY:range*1.05/8,alpha:0,duration:650,ease:'Cubic.easeOut',delay:60,onComplete:()=>ring2.destroy()});

          // 内リング（range×0.6まで拡大・速い）
          const ring3=this.add.circle(cx,cy,8,0xffffff,0).setStrokeStyle(4,0xffffff,0.8).setDepth(25);
          this.tweens.add({targets:ring3,scaleX:range*0.6/8,scaleY:range*0.6/8,alpha:0,duration:300,ease:'Cubic.easeOut',onComplete:()=>ring3.destroy()});

          // パーティクル（範囲全体に飛散）
          const PCNT=16;
          for(let i=0;i<PCNT;i++){
            const ang=(i/PCNT)*Math.PI*2+(Math.random()-0.5)*0.4;
            const dist=range*(0.4+Math.random()*0.6);
            const sz=Phaser.Math.Between(5,14);
            const cols=[0xcc44ff,0xff88ff,0xffffff,0x9b59b6];
            const dot=this.add.circle(cx,cy,sz,cols[i%cols.length],1.0).setDepth(24);
            this.tweens.add({
              targets:dot,
              x:cx+Math.cos(ang)*dist,
              y:cy+Math.sin(ang)*dist,
              alpha:0,scaleX:0.1,scaleY:0.1,
              duration:Phaser.Math.Between(400,700),
              ease:'Cubic.easeOut',
              onComplete:()=>dot.destroy()
            });
          }

          // ダメージ処理（エフェクト完了後50msで適用）
          this.time.delayedCall(50,()=>{
            this.enemyDataList.forEach(ed=>{
              if(!ed.dead&&Phaser.Math.Distance.Between(cx,cy,ed.sprite.x,ed.sprite.y)<range){
                const dmg=Math.max(1,Math.floor(pd.mag*(6+pd.sk1*0.35)));
                this.hitEnemy(ed,dmg,Math.random()*100<calcCrit(pd),true);
              }
            });
          });

          this.showFloat(cx,cy-60,'💥 大爆発！','#cc44ff','skill');
          this.cameras.main.shake(300,0.015);
          SE('meteor');
        });
      }else if(num===2){ // フロストアタック（詠唱1秒）
        this._startCast('❄ フロスト',1,()=>{
          const range=160+pd.sk2*20;
          const dur=20000;
          const cx=p.x, cy=p.y;

          // ── 凍結範囲エフェクト（攻撃範囲と完全一致）──
          // 中心の白フラッシュ
          const flash=this.add.circle(cx,cy,20,0xaaddff,0.9).setDepth(25);
          this.tweens.add({targets:flash,alpha:0,scaleX:range/20,scaleY:range/20,duration:600,ease:'Cubic.easeOut',onComplete:()=>flash.destroy()});

          // メインリング（range半径まで拡大・水色）
          const ring1=this.add.circle(cx,cy,8,0x88ccff,0).setStrokeStyle(5,0x88ccff,1.0).setDepth(24);
          this.tweens.add({targets:ring1,scaleX:range/8,scaleY:range/8,alpha:0,duration:600,ease:'Cubic.easeOut',onComplete:()=>ring1.destroy()});

          // 外リング（range×1.05・薄く）
          const ring2=this.add.circle(cx,cy,8,0xaaffff,0).setStrokeStyle(2,0xaaffff,0.6).setDepth(23);
          this.tweens.add({targets:ring2,scaleX:range*1.05/8,scaleY:range*1.05/8,alpha:0,duration:750,ease:'Cubic.easeOut',delay:80,onComplete:()=>ring2.destroy()});

          // 内リング（range×0.5・白・速い）
          const ring3=this.add.circle(cx,cy,8,0xffffff,0).setStrokeStyle(3,0xffffff,0.9).setDepth(25);
          this.tweens.add({targets:ring3,scaleX:range*0.5/8,scaleY:range*0.5/8,alpha:0,duration:300,ease:'Cubic.easeOut',onComplete:()=>ring3.destroy()});

          // 氷の粒子（水色・白・青）
          const PCNT=12;
          for(let i=0;i<PCNT;i++){
            const ang=(i/PCNT)*Math.PI*2+(Math.random()-0.5)*0.3;
            const dist=range*(0.3+Math.random()*0.7);
            const sz=Phaser.Math.Between(4,10);
            const cols=[0x88ccff,0xaaffff,0xffffff,0x4499dd];
            const dot=this.add.circle(cx,cy,sz,cols[i%cols.length],1.0).setDepth(24);
            this.tweens.add({
              targets:dot,
              x:cx+Math.cos(ang)*dist,
              y:cy+Math.sin(ang)*dist,
              alpha:0,scaleX:0.1,scaleY:0.1,
              duration:Phaser.Math.Between(400,700),
              ease:'Cubic.easeOut',
              onComplete:()=>dot.destroy()
            });
          }

          // 凍結処理
          this.time.delayedCall(50,()=>{
            this.enemyDataList.forEach(ed=>{
              if(ed.dead)return;
              if(Phaser.Math.Distance.Between(cx,cy,ed.sprite.x,ed.sprite.y)<range){
                ed.frozen=true;ed.frozenTimer=dur/1000;
                ed.sprite.setTint(0x88ccff);
                const ice=this.add.image(ed.sprite.x,ed.sprite.y,'fx_freeze').setDisplaySize(40,40).setDepth(8).setAlpha(0.8);
                ed._iceImg=ice;
              }
            });
          });

          this.showFloat(cx,cy-60,'❄ フロスト！','#88ccff','skill');
          SE('freeze');
        });
      }else if(num===3){ // ボルテックスボール（貫通）
        const ang=this.getFacingAngle();
        const sz=28+pd.sk3*13;
        const bull=this.fireBullet(p.x,p.y,ang,'proj_vortexball',{
          spd:400,maxDist:700,
          dmg:Math.max(1,Math.floor(pd.mag*(1.2+pd.sk3*0.1))),
          isCrit:Math.random()*100<calcCrit(pd),
          sz,
        });
        bull.setData('pierce',true);
        bull.body.setSize(sz,sz);
        this.tweens.add({targets:bull,angle:360,duration:600,repeat:-1,ease:'Linear'});
        this.showFloat(p.x,p.y-60,'⚡ ボルテックス！','#44ffff');
        SE('vortex');
      }else if(num===4){ // メテオーム（詠唱10秒・大爆発の3倍）
        if(!pd._hasMeteoorm){this.showFloat(p.x,p.y-50,'書物が必要です','#ff8800','info');pd.sp+=sk.cost;return;}
        this._startCast('☄ メテオーム',10,()=>{
          const skLv=pd.sk4||1;
          // Lv1→1個、Lv2→2個、Lv3→3個、Lv4→4個、Lv5→5個
          const meteorCount=skLv;
          const range=280;
          // ダメージ：大爆発(mag*6)の×2
          const dmg=Math.max(1,Math.floor(pd.mag*(12+skLv*0.4)));
          const cam=this.cameras.main;
          const camL=cam.scrollX, camT=cam.scrollY;
          const camW=cam.width, camH=cam.height;

          // 隕石1個を落とす関数
          const dropMeteor=(delay,targetX,targetY)=>{
            this.time.delayedCall(delay,()=>{
              const cx=targetX, cy=targetY;
              const meteorStartY=cy-500;

              // 落下地点の影
              const shadow=this.add.ellipse(cx,cy,120,40,0xff3300,0.35).setDepth(20);
              this.tweens.add({targets:shadow,scaleX:1.3,alpha:0.7,duration:800,yoyo:true,repeat:-1});

              // 隕石グラフィクス
              const g=this.add.graphics().setDepth(30);
              const drawMeteor=(mx,my,sc)=>{
                g.clear();
                g.fillStyle(0xff8800,0.55);g.fillTriangle(mx-18*sc,my,mx+18*sc,my,mx,my-180*sc);
                g.fillStyle(0xff4400,0.35);g.fillTriangle(mx-9*sc,my,mx+9*sc,my,mx,my-260*sc);
                g.fillStyle(0xffff00,0.25);g.fillTriangle(mx-4*sc,my,mx+4*sc,my,mx-2*sc,my-160*sc);
                g.fillStyle(0x993300,1);g.fillCircle(mx,my,50*sc);
                g.fillStyle(0xcc4400,0.8);g.fillCircle(mx-6*sc,my-5*sc,28*sc);
                g.fillStyle(0xff6600,0.5);g.fillCircle(mx-3*sc,my-7*sc,14*sc);
                g.fillStyle(0x662200,0.5);g.fillRect(mx-8*sc,my-4*sc,6*sc,3*sc);g.fillRect(mx+3*sc,my+2*sc,5*sc,2.5*sc);
              };
              drawMeteor(cx,meteorStartY,1);

              // 落下アニメ（1.2秒）
              let el=0; const fallDur=1200;
              this.time.addEvent({delay:16,repeat:Math.floor(fallDur/16),callback:()=>{
                el+=16;
                const t=el/fallDur;
                const curY=meteorStartY+(cy-meteorStartY)*t;
                drawMeteor(cx,curY,0.5+t*0.7);
                if(Math.random()<0.35){
                  const sp=this.add.circle(cx+(Math.random()-0.5)*36,curY+(Math.random()-0.5)*36,Phaser.Math.Between(2,7),0xff6600,0.9).setDepth(29);
                  this.tweens.add({targets:sp,alpha:0,y:sp.y+25,duration:280,onComplete:()=>sp.destroy()});
                }
              }});

              // 着弾（1.2秒後）
              this.time.delayedCall(fallDur,()=>{
                g.destroy(); shadow.destroy();
                this.cameras.main.shake(500,0.025);
                // フラッシュ
                const flash=this.add.circle(cx,cy,range*0.18,0xffffff,1).setDepth(35);
                this.tweens.add({targets:flash,scaleX:range/28,scaleY:range/28,alpha:0,duration:500,ease:'Cubic.easeOut',onComplete:()=>flash.destroy()});
                // リング×3
                [0,80,160].forEach((dl,ri)=>{
                  const r2=8,maxS=range*(1+ri*0.12)/r2;
                  const ring=this.add.circle(cx,cy,r2,0,0).setStrokeStyle(7-ri*2,[0xff4400,0xff8800,0xffcc00][ri],1).setDepth(33);
                  this.tweens.add({targets:ring,scaleX:maxS,scaleY:maxS,alpha:0,duration:600,delay:dl,ease:'Cubic.easeOut',onComplete:()=>ring.destroy()});
                });
                // パーティクル
                for(let i=0;i<20;i++){
                  const a2=(i/20)*Math.PI*2;
                  const d2=range*(0.3+Math.random()*0.75);
                  const dot=this.add.circle(cx,cy,Phaser.Math.Between(8,22),[0xff4400,0xff8800,0xffcc00,0xff2200,0xffffff][i%5],1).setDepth(32);
                  this.tweens.add({targets:dot,x:cx+Math.cos(a2)*d2,y:cy+Math.sin(a2)*d2,alpha:0,scaleX:0.1,scaleY:0.1,duration:Phaser.Math.Between(400,800),ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
                }
                const scorch=this.add.circle(cx,cy,range*0.35,0x331100,0.5).setDepth(1);
                this.tweens.add({targets:scorch,alpha:0,duration:4000,onComplete:()=>scorch.destroy()});
                // ダメージ：プレイヤー地点を中心とした範囲攻撃
                this.time.delayedCall(80,()=>{
                  const px2=p.x, py2=p.y;
                  this.enemyDataList.forEach(ed=>{
                    if(!ed.dead&&Phaser.Math.Distance.Between(px2,py2,ed.sprite.x,ed.sprite.y)<range){
                      this.hitEnemy(ed,dmg,Math.random()*100<calcCrit(pd),true);
                    }
                  });
                });
                this.showFloat(p.x,p.y-70,'☄ メテオーム！','#ff6600','skill');
                SE('meteor');
              });
            });
          };

          // Lv分だけ隕石を順番に落とす（0.8秒間隔）
          // 落下地点：カメラ内のランダム位置（敵がいれば近く）
          for(let m=0;m<meteorCount;m++){
            // ランダム落下地点（カメラ範囲内）
            const tx=camL+Phaser.Math.Between(60,camW-60);
            const ty=camT+Phaser.Math.Between(60,camH-60);
            dropMeteor(m*900,tx,ty);
          }
        });
      }
    }
    // ─ アーチャー ─
    else if(pd.cls==='archer'){
      if(num===1){ // 5方向射撃
        const ang=this.getFacingAngle();
        // ── 緑の弧の軌跡(放たれる方向を可視化) ──
        // 1. プレイヤー前方に薄い緑の扇形(矢の通り道)
        const arcG=this.add.graphics().setDepth(22);
        arcG.fillStyle(0x44ff88, 0.25);
        arcG.slice(p.x, p.y, 600, ang-0.55, ang+0.55, false);
        arcG.fillPath();
        this.tweens.add({targets:arcG, alpha:0, duration:400, ease:'Cubic.easeOut', onComplete:()=>arcG.destroy()});
        // 2. 5本の矢の軌道線(光の弧線)を即座に表示
        for(let i=-2;i<=2;i++){
          const a=ang+i*0.22;
          // 弧線(線で軌跡を表現)
          const trailG=this.add.graphics().setDepth(23);
          trailG.lineStyle(3, 0x66ffaa, 0.85);
          trailG.lineBetween(p.x, p.y, p.x+Math.cos(a)*250, p.y+Math.sin(a)*250);
          this.tweens.add({targets:trailG, alpha:0, duration:280, onComplete:()=>trailG.destroy()});
        }
        // 3. プレイヤー位置に発射の閃光(緑のリング)
        const flash=this.add.circle(p.x, p.y, 25, 0x88ffaa, 0.7).setDepth(24);
        this.tweens.add({targets:flash, scaleX:1.6, scaleY:1.6, alpha:0, duration:300, onComplete:()=>flash.destroy()});
        // 4. 発射音と矢の生成
        for(let i=-2;i<=2;i++){
          const a=ang+i*0.22;
          const res=rollAttack(pd,0,this._nearestEnemyEva());
          const dmg=res.miss?0:Math.max(1,Math.floor(pd.atk*(1+pd.sk1*0.25)));
          this.fireBullet(p.x,p.y,a,'proj_arrow',{spd:540,maxDist:600,dmg,isCrit:!res.miss&&res.isCrit,sz:14});
        }
        this.showFloat(p.x,p.y-60,'🏹 5方向射撃！','#27ae60');SE('multishot');
      }else if(num===2){ // グロリアスショット（クリ率UP）
        const dur=20000;
        // 既に発動中なら先に解除してから再適用（重複防止）
        if(pd._gloryActive){
          pd.luk=pd._gloryBaseLuk;
          if(this._gloryTimer){this._gloryTimer.remove();this._gloryTimer=null;}
          if(this._gloryEffect){this._gloryEffect.remove();this._gloryEffect=null;}
          if(this._gloryAura){this._gloryAura.destroy();this._gloryAura=null;}
          if(this._gloryRing){this._gloryRing.destroy();this._gloryRing=null;}
        }
        pd._gloryBaseLuk=pd.luk;
        pd._gloryActive=true;
        pd.luk=Math.floor(pd.luk*5);
        this.showFloat(p.x,p.y-60,'✨ グロリアスショット！','#ffd700');
        SE('boost');
        // ── 鐘の音 ──
        SE('bell');
        // 鐘の音を時差で重ねて余韻(残響)
        this.time.delayedCall(180, ()=>{ try{ SE('bell'); }catch(e){} });
        this.time.delayedCall(420, ()=>{ try{ SE('bell'); }catch(e){} });

        // ── 金色のオーラ演出 ──
        // 1. 発動時の金色フラッシュ(画面中心)
        this.cameras.main.flash(250, 255, 215, 100);
        // 2. プレイヤーから外側に拡がる金色のリング(2層)
        const burst1=this.add.circle(p.x, p.y, 10, 0xffd700, 0).setStrokeStyle(6, 0xffd700, 1).setDepth(24);
        this.tweens.add({targets:burst1, scaleX:14, scaleY:14, alpha:0, duration:500, ease:'Cubic.easeOut', onComplete:()=>burst1.destroy()});
        const burst2=this.add.circle(p.x, p.y, 10, 0xfff088, 0).setStrokeStyle(3, 0xfff088, 0.8).setDepth(24);
        this.tweens.add({targets:burst2, scaleX:18, scaleY:18, alpha:0, duration:700, delay:80, ease:'Cubic.easeOut', onComplete:()=>burst2.destroy()});

        // 3. 持続的な金色オーラ円(プレイヤー周りで点滅)
        const aura=this.add.circle(p.x, p.y, 50, 0xffd700, 0.18).setDepth(6);
        this.tweens.add({targets:aura, scaleX:1.25, scaleY:1.25, alpha:0.32, duration:900, yoyo:true, repeat:-1, ease:'Sine.easeInOut'});

        // 4. 持続的な金色のリング(外側でゆるやかにパルス)
        const ring=this.add.circle(p.x, p.y, 45, 0xffd700, 0).setStrokeStyle(2, 0xffd700, 0.6).setDepth(7);
        this.tweens.add({targets:ring, scaleX:1.4, scaleY:1.4, alpha:0.2, duration:1200, yoyo:true, repeat:-1, ease:'Sine.easeInOut'});

        // 5. 金色の星パーティクル(周囲を回る)
        const stars=[];
        for(let i=0;i<6;i++){
          const star=this.add.text(p.x, p.y, '✦', {fontSize:'18px', color:'#ffd700', stroke:'#aa6600', strokeThickness:2}).setOrigin(0.5).setDepth(7).setAlpha(0.85);
          stars.push({obj:star, phase:(i/6)*Math.PI*2});
        }

        // 6. プレイヤー追従処理 + 星の周回
        this._gloryAura=aura;
        this._gloryRing=ring;
        this._gloryEffect=this.time.addEvent({
          delay:50, repeat:dur/50,
          callback:()=>{
            const t = this.time.now / 600;
            if(aura.active) aura.setPosition(p.x, p.y);
            if(ring.active) ring.setPosition(p.x, p.y);
            // 6つの星が円周を等速で回る
            stars.forEach(s=>{
              if(s.obj.active){
                const ang = t + s.phase;
                s.obj.setPosition(p.x + Math.cos(ang)*55, p.y + Math.sin(ang)*55);
              }
            });
          }
        });

        // 7. 終了時にクリーンアップ + フェード
        this.time.delayedCall(dur-500, ()=>{
          this.tweens.add({
            targets:[aura, ring, ...stars.map(s=>s.obj)],
            alpha:0, duration:500,
            onComplete:()=>{
              if(aura.active) aura.destroy();
              if(ring.active) ring.destroy();
              stars.forEach(s=>{ if(s.obj.active) s.obj.destroy(); });
            }
          });
        });

        this._gloryTimer=this.time.delayedCall(dur,()=>{
          pd.luk=pd._gloryBaseLuk;
          pd._gloryActive=false;
          this._gloryTimer=null;
          if(this._gloryEffect){this._gloryEffect.remove(); this._gloryEffect=null;}
        });
        this.showBuffTimer('⭐ グロリアスショット','#ffd700',dur);
      }else if(num===3){ // バルカンショット（連射・TOTAL対応）
        const shots=2+pd.sk3;
        const ang=this.getFacingAngle();
        // 連射全弾の累積管理(各敵ごとにダメ蓄積)
        const accumulator = {
          totalsByEnemy: new Map(),
          lastPosByEnemy: new Map(),
          hitsCounted: 0,
          totalShots: shots,
        };
        for(let i=0;i<shots;i++){
          this.time.delayedCall(i*80,()=>{
            const res=rollAttack(pd,0,this._nearestEnemyEva());
            const dmg=res.miss?0:Math.max(1,Math.floor(pd.atk*2));
            const b = this.fireBullet(p.x,p.y,ang+(Math.random()-0.5)*0.1,'proj_arrow',{spd:560,maxDist:650,dmg,isCrit:!res.miss&&res.isCrit,sz:14});
            if(b){
              b.setData('vulcanAcc', accumulator);
              b.setData('vulcanIdx', i);
            }
            // ── 各弾発射時のマズルフラッシュ ──
            // 1. プレイヤー前方に黄色のフラッシュ円
            const muzzleX = p.x + Math.cos(ang)*30;
            const muzzleY = p.y + Math.sin(ang)*30;
            const flash = this.add.circle(muzzleX, muzzleY, 12, 0xffee66, 0.95).setDepth(25);
            this.tweens.add({targets:flash, scaleX:2.0, scaleY:2.0, alpha:0, duration:140, onComplete:()=>flash.destroy()});
            // 2. 弓を引き直すライン(緑の弦の閃光)
            const stringG = this.add.graphics().setDepth(24);
            stringG.lineStyle(2, 0x88ffaa, 0.9);
            // プレイヤーから矢の方向に短い線(弦が引かれる感覚)
            stringG.lineBetween(
              p.x + Math.cos(ang+Math.PI/2)*8,
              p.y + Math.sin(ang+Math.PI/2)*8,
              p.x + Math.cos(ang-Math.PI/2)*8,
              p.y + Math.sin(ang-Math.PI/2)*8
            );
            this.tweens.add({targets:stringG, alpha:0, duration:120, onComplete:()=>stringG.destroy()});
            // 3. 火花パーティクル(マズル位置から3方向)
            for(let k=0;k<3;k++){
              const sang = ang + (Math.random()-0.5)*0.6;
              const spark = this.add.circle(muzzleX, muzzleY, 2, 0xfff088, 1).setDepth(25);
              this.tweens.add({
                targets:spark,
                x:muzzleX + Math.cos(sang)*18,
                y:muzzleY + Math.sin(sang)*18,
                alpha:0,
                duration:200,
                onComplete:()=>spark.destroy()
              });
            }
          });
        }
        // 全弾終了後にTOTAL表示(最後の弾発射 + 余裕)
        this.time.delayedCall(shots*80 + 1500, ()=>{
          accumulator.totalsByEnemy.forEach((total, ed)=>{
            const pos = accumulator.lastPosByEnemy.get(ed) || {x:p.x,y:p.y};
            this.showTotalDamage(pos.x, pos.y, total);
          });
        });
        this.showFloat(p.x,p.y-60,'🏹 バルカン'+shots+'連射！','#27ae60');SE('multishot');
      }
    }
    // ─ ボマー ─
    else if(pd.cls==='bomber'){
      if(num===1){ // 設置爆弾: 最大3個、敵接触で爆破、10秒自動爆破
        if(!this._placedBombs)this._placedBombs=[];
        // 最大3個制限
        if(this._placedBombs.length>=3){
          this.showFloat(p.x,p.y-50,'最大3個まで','#888888','info');
          return; // CDとSPを消費しないで終了
        }
        // サイズ: Lv1=30px, Lv10=75px（Lvに応じて当たり判定UP）
        const bombSz=30+pd.sk1*4.5;
        const bombDmg=Math.max(1,Math.floor(pd.atk*2+Phaser.Math.Between(0,pd.atk)));
        const bombCrit=Math.random()*100<calcCrit(pd);

        // 設置位置（プレイヤーの足元）
        const bx=p.x, by=p.y;

        // 爆弾スプライト（静的）
        const bombSpr=this.add.image(bx,by,'proj_bomb').setDisplaySize(bombSz,bombSz).setDepth(5);
        // 点滅アニメ（危険感）
        this.tweens.add({targets:bombSpr,alpha:0.4,duration:400,yoyo:true,repeat:-1,ease:'Sine.easeInOut'});
        // 当たり判定用ゾーン（physicsボディ）
        const bombZone=this.physics.add.image(bx,by,'proj_bomb').setDisplaySize(bombSz,bombSz).setDepth(5).setAlpha(0);
        bombZone.body.setSize(bombSz,bombSz);
        bombZone.body.allowGravity=false;
        bombZone.setImmovable(true);

        // 残り時間テキスト
        const timeTxt=this.add.text(bx,by-bombSz/2-6,'10s',{fontSize:'12px',fontFamily:'Arial',color:'#ffffff',stroke:'#000000',strokeThickness:3,backgroundColor:'#00000066',padding:{x:3,y:1}}).setOrigin(0.5).setDepth(7);

        const bombData={spr:bombSpr,zone:bombZone,txt:timeTxt,exploded:false};
        this._placedBombs.push(bombData);

        let elapsed=0;
        // 敵との接触判定（update内で処理）
        bombData.checkTimer=this.time.addEvent({
          delay:100,loop:true,
          callback:()=>{
            if(bombData.exploded)return;
            elapsed+=0.1;
            const remain=Math.max(0,10-elapsed);
            if(timeTxt.active)timeTxt.setText(remain.toFixed(1)+'s');
            // 敵との距離チェック
            let hit=false;
            this.enemyDataList.forEach(ed=>{
              if(ed.dead||hit)return;
              if(Phaser.Math.Distance.Between(bx,by,ed.sprite.x,ed.sprite.y)<bombSz/2+ed.sprite.displayWidth/2){
                hit=true;
              }
            });
            if(hit||elapsed>=10){
              this._explodePlacedBomb(bombData,bx,by,bombDmg,bombCrit,bombSz);
            }
          }
        });

        this.showFloat(p.x,p.y-50,'💣 設置！','#f39c12','info');
        this.playBomberAtk();
        // CDなし・SPのみ消費（CDを0にしておく）
        this[cdKey]=0;
      }else if(num===2){ // ボーリングボムス: 直線貫通弾→着弾で6方向クラスター爆撃
        const ang=this.getFacingAngle();
        // 直線上に飛ぶ貫通弾（敵または最大距離400pxで爆発）
        const clusterDmg=(sk1Lv)=>Math.max(1,Math.floor(pd.atk*(0.8+sk1Lv*0.15)));
        const clusterRadius=40;
        const maxDist=400+pd.sk2*30; // スキルLvで射程UP

        // 弾を発射（貫通・最初の敵ヒットで爆発）
        const bball=this.fireBullet(p.x,p.y,ang,'proj_bomb',{
          spd:500,maxDist,
          dmg:0, // 本体ダメージなし（着弾時に爆発）
          isCrit:false,sz:18,
        });
        bball.setData('pierce',false); // 最初の敵ヒットで停止
        bball.setData('bowling',true); // ボーリングフラグ
        bball.setData('bowlingAng',ang);
        bball.setData('bowlingDmg',clusterDmg(pd.sk1));
        bball.setData('bowlingRadius',clusterRadius);
        bball.setData('bowlingCrit',Math.random()*100<calcCrit(pd));
        // 回転エフェクト
        this.tweens.add({targets:bball,angle:360,duration:300,repeat:-1,ease:'Linear'});
        this.showFloat(p.x,p.y-60,'🎳 ボーリングボムス！','#f39c12','skill');
        this.playBomberAtk();
        SE('vortex');
      }else if(num===3){ // ハイパーボム（sk3）: 投擲100px 半径100×(1+Lv×0.2)
        const ang=this.getFacingAngle();
        const radius=100*(1+pd.sk3*0.2);
        const tx=p.x+Math.cos(ang)*100,ty=p.y+Math.sin(ang)*100;
        this.throwBomb(p.x,p.y,tx,ty,{
          dmg:Math.max(1,Math.floor(pd.atk*(3+pd.sk3*0.8))),
          isCrit:Math.random()*100<calcCrit(pd),
          radius,
          isHyper:true, // ハイパーボムフラグ
        });
        this.showFloat(p.x,p.y-60,'💣 ハイパーボム！','#ff6600','skill');
        this.cameras.main.shake(500,0.025);
        this.playBomberAtk();
        SE('bigbomb');
      }else if(num===4){ // ボマーパワー（パッシブ：使用不要）
        this.showFloat(p.x,p.y-50,'ボマーパワーはパッシブスキルです','#f39c12','info');
        pd.sp+=sk.cost; // SP返還
        return;
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
    const BW=180, LBL=28, BX=LBL+4;
    const BG_W=BX+BW+6;
    const BAR_H=13, GAP=18;
    const FF='Arial'; // 太くて読みやすいフォント
    // 背景
    this.add.rectangle(0,0,BG_W,100,0x000000,0.78).setOrigin(0).setScrollFactor(0).setDepth(10);
    // HP
    this.add.rectangle(BX,8,BW,BAR_H,0x1a1a1a).setOrigin(0).setScrollFactor(0).setDepth(10).setStrokeStyle(1, 0xffffff, 0.6);
    this.hudHPBar=this.add.rectangle(BX,8,BW*(pd.hp/pd.mhp),BAR_H,0x2ecc71).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,8,'HP',{fontSize:'13px',fontFamily:FF,color:'#2ecc71',fontStyle:'bold',stroke:'#000000',strokeThickness:3}).setScrollFactor(0).setDepth(12);
    // SP
    this.add.rectangle(BX,8+GAP,BW,BAR_H,0x1a1a1a).setOrigin(0).setScrollFactor(0).setDepth(10).setStrokeStyle(1, 0xffffff, 0.6);
    this.hudSPBar=this.add.rectangle(BX,8+GAP,BW*(pd.sp/pd.msp),BAR_H,0x3498db).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,8+GAP,'SP',{fontSize:'13px',fontFamily:FF,color:'#3498db',fontStyle:'bold',stroke:'#000000',strokeThickness:3}).setScrollFactor(0).setDepth(12);
    // EXP
    this.add.rectangle(BX,8+GAP*2,BW,BAR_H,0x1a1a1a).setOrigin(0).setScrollFactor(0).setDepth(10).setStrokeStyle(1, 0xffffff, 0.6);
    this.hudEXPBar=this.add.rectangle(BX,8+GAP*2,0,BAR_H,0xf39c12).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,8+GAP*2,'EX',{fontSize:'13px',fontFamily:FF,color:'#f39c12',fontStyle:'bold',stroke:'#000000',strokeThickness:3}).setScrollFactor(0).setDepth(12);
    // JOB EXP
    this.add.rectangle(BX,8+GAP*3,BW,BAR_H,0x1a1a1a).setOrigin(0).setScrollFactor(0).setDepth(10).setStrokeStyle(1, 0xffffff, 0.6);
    this.hudJEXPBar=this.add.rectangle(BX,8+GAP*3,0,BAR_H,0x00e5ff).setOrigin(0).setScrollFactor(0).setDepth(11);
    this.add.text(2,8+GAP*3,'JB',{fontSize:'13px',fontFamily:FF,color:'#00e5ff',fontStyle:'bold',stroke:'#000000',strokeThickness:3}).setScrollFactor(0).setDepth(12);
    // Lv・Gold表示
    this.hudLvTxt=this.add.text(2,8+GAP*4+2,'',{fontSize:'12px',fontFamily:FF,color:'#ffdd44',fontStyle:'bold',stroke:'#000000',strokeThickness:2}).setScrollFactor(0).setDepth(12);
    // ダミー変数（updateHUDで参照するため）
    this.hudHPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudSPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudEXPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudJEXPTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudInfo=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudSub=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.hudSub2=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    this.killTxt=this.add.text(0,0,'').setVisible(false).setScrollFactor(0);
    // ステージバッジ（ミニマップの左・上）
    // ミニマップ: x=w-166〜w-6, y=6〜126 なので、その左側に縦並びで配置
    // バッジ右端を w-170 に揃える(ミニマップ左端w-166の4px左)
    this.add.rectangle(w-170,6,80,22,0x000000,0.7).setOrigin(1,0).setScrollFactor(0).setDepth(10);
    this.add.text(w-210,10,'ST.'+this.stage,{fontSize:'14px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5,0).setScrollFactor(0).setDepth(12);
    // 現在座標表示(ステージバッジの下・少し幅広)
    this.add.rectangle(w-170,30,120,18,0x000000,0.7).setOrigin(1,0).setScrollFactor(0).setDepth(10);
    this.hudCoordTxt=this.add.text(w-230,32,'X:0 Y:0',{fontSize:'11px',fontFamily:'Arial',color:'#88ddff'}).setOrigin(0.5,0).setScrollFactor(0).setDepth(12);
    // ボスHPバー
    this.bossHPBg=this.add.rectangle(w/2,h-44,w*0.6+8,20,0x000000,0.8).setScrollFactor(0).setDepth(10).setVisible(false);
    this.bossHPBar=this.add.rectangle(w/2-w*0.3,h-44,w*0.6,16,0xe74c3c).setOrigin(0,0.5).setScrollFactor(0).setDepth(11).setVisible(false);
    this.bossHPTxt=this.add.text(w/2,h-44,'',{fontSize:'11px',fontFamily:'Arial',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(12).setVisible(false);
    // キャラアイコン（MENUボタン）大きく・目立つ配置
    const cls={warrior:'剣',mage:'魔',archer:'弓',bomber:'爆'}[this.playerData.cls]||'?';
    const MX=BG_W+34, MY=38;
    // 外枠（発光エフェクト用の外リング）
    this._menuBtnGlow=this.add.rectangle(MX,MY,64,64,0x44aaff,0.18).setScrollFactor(0).setDepth(14);
    // ボタン本体
    this._menuBtn=this.add.rectangle(MX,MY,56,56,0x0a0f2a,0.95).setStrokeStyle(3,0x44aaff).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    // 職業文字
    this.add.text(MX,MY-8,cls,{fontSize:'22px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    // MENU ラベル
    this.add.text(MX,MY+16,'MENU',{fontSize:'9px',fontFamily:'Arial',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    // バッジ（ポイントがあると光る）
    this._menuBadge=this.add.text(MX+24,MY-24,'',{
      fontSize:'12px',fontFamily:'Arial',color:'#ffffff',
      backgroundColor:'#e74c3c',padding:{x:3,y:2}
    }).setScrollFactor(0).setDepth(17);
    this._menuBtn.on('pointerdown',()=>this.openMenu('stat'));
    this._menuBtn.on('pointerover',()=>{this._menuBtn.setFillStyle(0x44aaff,0.3);this._menuBtnGlow.setFillStyle(0x44aaff,0.4);});
    this._menuBtn.on('pointerout', ()=>{this._menuBtn.setFillStyle(0x0a0f2a,0.95);this._menuBtnGlow.setFillStyle(0x44aaff,0.18);});
    // ポイントがあるとき点滅アニメ
    // tweenではなくtimerで点滅（scene遷移時のcutエラー防止）
    this._menuPulseOn=false;
    this._menuPulse={
      _timer:null,
      _val:0.1,_dir:1,
      resume:()=>{
        if(this._menuPulse._timer)return;
        this._menuPulse._timer=this.time.addEvent({
          delay:40,loop:true,callback:()=>{
            if(!this._menuBtnGlow||!this._menuBtnGlow.active)return;
            this._menuPulse._val+=this._menuPulse._dir*0.03;
            if(this._menuPulse._val>=0.5){this._menuPulse._val=0.5;this._menuPulse._dir=-1;}
            if(this._menuPulse._val<=0.1){this._menuPulse._val=0.1;this._menuPulse._dir=1;}
            this._menuBtnGlow.setFillStyle(0x44aaff,this._menuPulse._val);
          }
        });
      },
      pause:()=>{
        if(this._menuPulse._timer){this._menuPulse._timer.remove();this._menuPulse._timer=null;}
        this._menuPulse._val=0.1;
      },
      isPaused:()=>!this._menuPulse._timer,
    };
    // ミュートボタン（MENUボタン右）
    const muteX=MX+46;
    this._muteBtn=this.add.rectangle(muteX,MY,32,32,0x1a1a3a,0.9).setStrokeStyle(1,0x555555).setScrollFactor(0).setDepth(15).setInteractive({useHandCursor:true});
    this._muteTxt=this.add.text(muteX,MY,muted?'🔇':'🔊',{fontSize:'14px'}).setOrigin(0.5).setScrollFactor(0).setDepth(16);
    this._muteBtn.on('pointerdown',()=>{
      setMute(!muted);
      this._muteTxt.setText(muted?'🔇':'🔊');
    });
    // skillBtnRefsをリセットしてからupdateHUD（古い参照によるエラー防止）
    this.skillBtnRefs=[];
    this.updateHUD();
  }
  openBuilding(b){this.openBuildingUI(b);}

  _buildCraftUI(mk,close,showResult,refreshGold,PX,PY,PW,PH,pd){
    if(!pd.items)pd.items={};
    const SB_W=20; // スクロールバーを太く（スマホ対応）
    const L=PX-PW/2+6;
    const R=PX+PW/2-6-SB_W-2;
    const BOT_BTN_H=40;
    const listTop=PY-PH/2+62;
    const listBot=PY+PH/2-16-BOT_BTN_H;
    const listH=listBot-listTop;
    const COLS=2;
    const visibleRows=3; // 3行固定
    const CELL_W=(R-L)/COLS;
    const CELL_H=Math.max(80, Math.floor(listH/visibleRows));
    const totalRows=Math.ceil(CRAFT_RECIPES.length/COLS);
    const visibleCount=visibleRows*COLS;
    let scrollRow=0;
    const maxRow=Math.max(0,totalRows-visibleRows);
    let dragStartY=null, dragStartRow=null;
    let selectedRecipe=null;

    // スクロールバー（太め・スマホ対応）
    const sbX=PX+PW/2-SB_W/2-4;
    const sbBg=mk(this.add.rectangle(sbX,listTop+listH/2,SB_W,listH,0x1a1a2e,0.9).setStrokeStyle(1,0x334455).setScrollFactor(0).setDepth(73));
    const sbThumbH=Math.max(40,listH*Math.min(1,visibleRows/Math.max(1,totalRows)));
    const sbThumb=mk(this.add.rectangle(sbX,listTop+sbThumbH/2,SB_W-4,sbThumbH,0x44aaff,0.85).setScrollFactor(0).setDepth(74).setStrokeStyle(1,0x88ccff));
    const updateScrollbar=()=>{
      if(maxRow<=0){sbThumb.setVisible(false);return;}
      sbThumb.setVisible(true);
      const ratio=scrollRow/maxRow;
      sbThumb.setY(listTop+(listH-sbThumbH)*ratio+sbThumbH/2);
    };

    // 下部：製作ボタン
    const craftBtnY=PY+PH/2-BOT_BTN_H/2-10;
    const craftBtn=mk(this.add.rectangle(PX,craftBtnY,PW-20,BOT_BTN_H-6,0x113311,0.9).setStrokeStyle(2,0x336633).setScrollFactor(0).setDepth(73));
    const craftBtnTxt=mk(this.add.text(PX,craftBtnY,'装備を選択してください',{fontSize:'14px',fontFamily:'Arial',color:'#556677',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(74));

    const updateCraftBtn=()=>{
      if(!selectedRecipe){
        craftBtn.setFillStyle(0x113311,0.9).setStrokeStyle(2,0x336633);
        craftBtnTxt.setText('装備を選択してください').setColor('#556677');
        craftBtn.removeInteractive();
        return;
      }
      const r=selectedRecipe;
      const eDef=EQUIP_DEFS[r.result];
      const canCraft=pd.gold>=r.fee&&r.materials.every(m=>(pd.items[m.id]||0)>=m.count);
      if(canCraft){
        craftBtn.setFillStyle(0x226622,0.95).setStrokeStyle(2,0x44aa44);
        craftBtnTxt.setText('🔨 '+eDef.icon+' '+eDef.name+' を製作する（'+r.fee+'G）').setColor('#44ff88');
        craftBtn.setInteractive({useHandCursor:true});
        craftBtn.removeAllListeners('pointerdown');
        craftBtn.on('pointerdown',()=>{
          r.materials.forEach(m=>{pd.items[m.id]-=m.count;});
          pd.gold-=r.fee;
          pd.items[r.result]=(pd.items[r.result]||0)+1;
          showResult(eDef.icon+' '+eDef.name+'を製作！装備タブから装備できます','#44ff88');
          refreshGold(); SE('levelup');
          selectedRecipe=null;
          renderRecipes(scrollRow);
        });
        craftBtn.on('pointerover',()=>craftBtn.setFillStyle(0x338833,0.98));
        craftBtn.on('pointerout', ()=>craftBtn.setFillStyle(0x226622,0.95));
      }else{
        craftBtn.setFillStyle(0x221111,0.9).setStrokeStyle(2,0x553333);
        const reason=pd.gold<r.fee?'所持金不足':'素材不足';
        craftBtnTxt.setText('✗ '+eDef.icon+' '+eDef.name+'（'+reason+'）').setColor('#cc4444');
        craftBtn.removeInteractive();
      }
    };

    const renderRecipes=(row)=>{
      if(this._craftRows){this._craftRows.forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});}
      this._craftRows=[];
      const addRow=(o)=>{this._craftRows.push(o);mk(o);return o;};
      const offset=row*COLS;

      CRAFT_RECIPES.slice(offset,offset+visibleCount).forEach((recipe,i)=>{
        const col=i%COLS, r2=Math.floor(i/COLS);
        const cx=L+col*CELL_W+CELL_W/2;
        const cy=listTop+r2*CELL_H+CELL_H/2;
        const cL2=L+col*CELL_W+4, cR2=L+(col+1)*CELL_W-4;
        const eDef=EQUIP_DEFS[recipe.result];
        if(!eDef)return;
        const isSelected=selectedRecipe===recipe;
        const canCraft=pd.gold>=recipe.fee&&recipe.materials.every(m=>(pd.items[m.id]||0)>=m.count);
        const bgCol=isSelected?0x1a3a1a:canCraft?0x0a1a0a:0x080d18;
        const stCol=isSelected?0x44ff44:canCraft?0x44aa44:0x334455;

        // セル背景（タップで選択）
        const bg=addRow(this.add.rectangle(cx,cy,CELL_W-4,CELL_H-3,bgCol,0.9).setStrokeStyle(isSelected?2:1,stCol).setScrollFactor(0).setDepth(72).setInteractive({useHandCursor:true}));
        bg.on('pointerdown',()=>{
          selectedRecipe=(isSelected?null:recipe);
          renderRecipes(scrollRow);
          updateCraftBtn();
        });
        bg.on('pointerover',()=>bg.setFillStyle(isSelected?0x1a4a1a:0x0a2010,0.95));
        bg.on('pointerout', ()=>bg.setFillStyle(bgCol,0.9));

        // 装備名
        addRow(this.add.text(cL2+2,cy-CELL_H*0.3,eDef.icon+' '+eDef.name,{
          fontSize:'13px',fontFamily:'Arial',
          color:isSelected?'#44ff44':canCraft?'#ffffff':'#556677',fontStyle:'bold'
        }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        // ステータス
        const statStr=Object.entries(eDef.stats).map(([k,v])=>k.toUpperCase()+'+'+v).join(' ');
        addRow(this.add.text(cL2+2,cy-CELL_H*0.08,statStr,{fontSize:'10px',fontFamily:'Arial',color:'#667788'}).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        // 素材
        recipe.materials.forEach((m,mi)=>{
          const mDef=ITEM_DEFS[m.id];
          const have=pd.items[m.id]||0;
          const ok=have>=m.count;
          addRow(this.add.text(cL2+4+mi*(CELL_W*0.3),cy+CELL_H*0.2,
            (mDef?mDef.icon:'?')+'×'+m.count+'('+have+')',{
            fontSize:'10px',fontFamily:'Arial',color:ok?'#44dd88':'#cc4444',stroke:'#000',strokeThickness:2
          }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        });
        // 加工費
        addRow(this.add.text(cR2-4,cy+CELL_H*0.2,recipe.fee+'G',{
          fontSize:'11px',fontFamily:'Arial',color:pd.gold>=recipe.fee?'#ffd700':'#663300'
        }).setOrigin(1,0.5).setScrollFactor(0).setDepth(73));
      });

      // 件数
      addRow(this.add.text(L,listBot+2,(offset+1)+'〜'+Math.min(offset+visibleCount,CRAFT_RECIPES.length)+'/'+CRAFT_RECIPES.length+'種',{
        fontSize:'10px',fontFamily:'Arial',color:'#556677'
      }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
      updateScrollbar();
    };

    renderRecipes(0);
    updateCraftBtn();

    // スクロール処理
    const doScroll=(newRow)=>{const c=Math.max(0,Math.min(maxRow,newRow));if(c!==scrollRow){scrollRow=c;renderRecipes(scrollRow);}};

    // スワイプ＆ホイール（リスト全体が対象）
    const swipeZone=mk(this.add.rectangle(PX-SB_W/2,listTop+listH/2,PW-SB_W-4,listH,0x000000,0).setScrollFactor(0).setDepth(71).setInteractive());
    swipeZone.on('wheel',(_p,_dx,dy)=>{doScroll(scrollRow+(dy>0?1:-1));});

    // タッチスワイプ（感度向上：CELL_H/2px動けば1行スクロール）
    let swipeY=null, swipeRow=null, swipeMoved=false;
    swipeZone.on('pointerdown',(ptr)=>{swipeY=ptr.y;swipeRow=scrollRow;swipeMoved=false;});
    swipeZone.on('pointermove',(ptr)=>{
      if(swipeY===null)return;
      const dy=swipeY-ptr.y;
      if(Math.abs(dy)>8){swipeMoved=true;}
      const newRow=Math.round(swipeRow+dy/(CELL_H*0.7));
      doScroll(newRow);
    });
    swipeZone.on('pointerup',()=>{swipeY=null;swipeRow=null;});
    swipeZone.on('pointerout',()=>{swipeY=null;swipeRow=null;});

    // スクロールバードラッグ（太くて押しやすい）
    sbThumb.setInteractive({useHandCursor:true,draggable:true});
    this.input.setDraggable(sbThumb);
    sbBg.setInteractive();
    sbBg.on('pointerdown',(ptr)=>{
      // バー上タップで直接ジャンプ
      const ratio=(ptr.y-listTop)/listH;
      doScroll(Math.round(ratio*maxRow));
    });
    sbThumb.on('drag',(_p,_x,y)=>{
      const ratio=Math.max(0,Math.min(1,(y-listTop-sbThumbH/2)/(listH-sbThumbH)));
      doScroll(Math.round(ratio*maxRow));
    });
  }

  openBuildingUI(b){
    const w=this.scale.width,h=this.scale.height,pd=this.playerData;
    this.physics.pause();
    // オーバーレイ
    const ov=this.add.rectangle(w/2,h/2,w,h,0x000000,0.65).setScrollFactor(0).setDepth(70).setInteractive();
    const objs=[ov];
    const mk=(o)=>{objs.push(o);return o;}
    const close=()=>{
      objs.forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
      this.physics.resume();
      // ショップ内で所持金/ポーション数が変動している可能性があるのでHUDを更新
      this.updateHUD();
    };

    // パネル
    const PW=Math.min(w*0.82,500), PH=Math.min(h*0.75,380);
    const PX=w/2, PY=h/2;
    mk(this.add.rectangle(PX,PY,PW,PH,0x061020,0.97).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(71));
    // タイトル
    mk(this.add.text(PX,PY-PH/2+20,b.label||'施設',{fontSize:'18px',fontFamily:'Arial',color:'#44aaff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0).setDepth(72));
    // 所持金表示
    const goldTxt=mk(this.add.text(PX,PY-PH/2+42,'💰 所持金: '+pd.gold+'G',{fontSize:'13px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(72));
    const refreshGold=()=>goldTxt.setText('💰 所持金: '+pd.gold+'G');

    // 閉じるボタン(右上の×)
    const closeSize=34;
    const closeCX=PX+PW/2-closeSize/2-6;
    const closeCY=PY-PH/2+closeSize/2+6;
    const closeBtn=mk(this.add.rectangle(closeCX,closeCY,closeSize,closeSize,0x3a0a0a,0.9).setStrokeStyle(2,0xaa4444).setScrollFactor(0).setDepth(73).setInteractive({useHandCursor:true}));
    mk(this.add.text(closeCX,closeCY,'✕',{fontSize:'18px',fontFamily:'Arial',color:'#ff8888',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(74));
    closeBtn.on('pointerdown',close);
    closeBtn.on('pointerover',()=>closeBtn.setFillStyle(0x6a1a1a,0.95));
    closeBtn.on('pointerout', ()=>closeBtn.setFillStyle(0x3a0a0a,0.9));

    const msgY=PY+PH/2-30; // メッセージエリアを下端近くに(閉じるボタン削除したので余白が増えた)
    const result=mk(this.add.text(PX,msgY,'',{fontSize:'13px',fontFamily:'Arial',color:'#44ff88',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
    const showResult=(msg,col='#44ff88')=>{result.setText(msg).setColor(col);};

    // ショップアイテム定義
    const shops={
      inn:[
        {label:'泊まる（HP/SP全回復+ポーション×3）',price:30,icon:'🛏',action:()=>{pd.hp=pd.mhp;pd.sp=pd.msp;pd.potHP=(pd.potHP||0)+3;pd.potMP=(pd.potMP||0)+3;showResult('✨ ぐっすり眠れた！完全回復！');this.updateHUD();}},
      ],
      shop:[
        {label:'HPポーション',price:30,icon:'💊',action:()=>{pd.potHP=(pd.potHP||0)+1;showResult('💊 HPポーション入手！');this.updateHUD();}},
        {label:'MPポーション',price:25,icon:'💧',action:()=>{pd.potMP=(pd.potMP||0)+1;showResult('💧 MPポーション入手！');this.updateHUD();}},
        {label:'解毒剤　毒状態を治す',price:50,icon:'🧪',action:()=>{if(!pd.items)pd.items={};pd.items['antidote']=(pd.items['antidote']||0)+1;showResult('🧪 解毒剤を入手！');this.updateHUD();}},
        {label:'帰還の巻物　町に帰れる',price:80,icon:'📜',action:()=>{if(!pd.items)pd.items={};pd.items['town_scroll']=(pd.items['town_scroll']||0)+1;showResult('📜 帰還の巻物を入手！');this.updateHUD();}},
      ],
      blacksmith:'craft', // 鍛冶屋はクラフト専用UI
      magic:[
        {label:'メテオームの書　※マジシャン専用',price:1000,icon:'📖',mageOnly:true,owned:()=>pd._hasMeteoorm,action:()=>{
          if(pd.cls!=='mage'){showResult('マジシャンのみ使用できます','#ff4444');return false;}
          if(pd._hasMeteoorm){showResult('既に習得済みです','#aaaaaa');return false;}
          pd._hasMeteoorm=true; pd.sk4=1;
          this._refreshSkillButtons&&this._refreshSkillButtons();
          showResult('📖 メテオームの書を習得！','#cc88ff');
          return true;
        }},
        {label:'ハードプロテクトの書　※マジシャン専用',price:1000,icon:'📗',mageOnly:true,owned:()=>pd._hasHardProtect,action:()=>{
          if(pd.cls!=='mage'){showResult('マジシャンのみ使用できます','#ff4444');return false;}
          if(pd._hasHardProtect){showResult('既に習得済みです','#aaaaaa');return false;}
          pd._hasHardProtect=true;
          showResult('📗 ハードプロテクトの書を習得！（近日実装予定）','#cc88ff');
          return true;
        }},
        {label:'バーサクパワーの書　※剣士専用',price:800,icon:'📕',owned:()=>pd._hasBerserk,action:()=>{
          if(pd.cls!=='warrior'){showResult('剣士のみ使用できます','#ff4444');return false;}
          if(pd._hasBerserk){showResult('既に習得済みです','#aaaaaa');return false;}
          pd._hasBerserk=true; pd.sk4=1;
          this._refreshSkillButtons&&this._refreshSkillButtons();
          showResult('📕 バーサクパワーを習得！（スキルスロット4）','#ff8844');
          return true;
        }},
        {label:'ボマーパワーの書　※ボマー専用',price:800,icon:'📙',owned:()=>pd._hasBomberPower,action:()=>{
          if(pd.cls!=='bomber'){showResult('ボマーのみ使用できます','#ff4444');return false;}
          if(pd._hasBomberPower){showResult('既に習得済みです','#aaaaaa');return false;}
          pd._hasBomberPower=true; pd.sk4=1;
          this._refreshSkillButtons&&this._refreshSkillButtons();
          showResult('📙 ボマーパワーを習得！（スキルスロット4・パッシブ）','#f39c12');
          return true;
        }},
        {label:'ブーストアタックの書　※アーチャー専用',price:800,icon:'📒',owned:()=>pd._hasBoostAtk,action:()=>{
          if(pd.cls!=='archer'){showResult('アーチャーのみ使用できます','#ff4444');return false;}
          if(pd._hasBoostAtk){showResult('既に習得済みです','#aaaaaa');return false;}
          pd._hasBoostAtk=true; pd.sk4=1;
          this._refreshSkillButtons&&this._refreshSkillButtons();
          showResult('📒 ブーストアタックを習得！（スキルスロット4・パッシブ）','#27ae60');
          return true;
        }},
      ],
      guild:[
        // ── 各ステージへ無料テレポート(ポータルサービス) ──
        // 注: action内ではこのscene(=Game)が必要。close()してから _doTransition で飛ぶ
        {label:'🏘 セントラル(町)',     price:0, icon:'🏠', action:()=>{ close(); this._doGuildWarp(0);  }},
        {label:'🌳 ST.1 草原',          price:0, icon:'🌳', action:()=>{ close(); this._doGuildWarp(1);  }},
        {label:'🌋 ST.2 溶岩',          price:0, icon:'🌋', action:()=>{ close(); this._doGuildWarp(2);  }},
        {label:'🏖 ST.3 海岸',          price:0, icon:'🏖', action:()=>{ close(); this._doGuildWarp(3);  }},
        {label:'🏜 ST.4 砂漠',          price:0, icon:'🏜', action:()=>{ close(); this._doGuildWarp(4);  }},
        {label:'🏛 ST.5 砂漠の集落跡',  price:0, icon:'🏛', action:()=>{ close(); this._doGuildWarp(5);  }},
        {label:'💀 ST.6 砂漠の果て',    price:0, icon:'💀', action:()=>{ close(); this._doGuildWarp(6);  }},
        {label:'⛰ ST.7 天空への路',     price:0, icon:'⛰', action:()=>{ close(); this._doGuildWarp(7);  }},
        {label:'☁ ST.8 天空の島々',    price:0, icon:'☁', action:()=>{ close(); this._doGuildWarp(8);  }},
        {label:'⚔ DUN.1 地下迷宮',     price:0, icon:'⚔', action:()=>{ close(); this._doGuildWarp(10); }},
        {label:'⛏ DUN.2 炭鉱1F',       price:0, icon:'⛏', action:()=>{ close(); this._doGuildWarp(11); }},
        {label:'⛏ DUN.2 炭鉱2F',       price:0, icon:'⛏', action:()=>{ close(); this._doGuildWarp(12); }},
        {label:'🪓 ゴブリンの集落',     price:0, icon:'🪓', action:()=>{ close(); this._doGuildWarp(20); }},
        {label:'🔥 ブレイズフォージ(町)',price:0,icon:'🔥', action:()=>{ close(); this._doGuildWarp(21); }},
        {label:'🌳 南の街道',           price:0, icon:'🌳', action:()=>{ close(); this._doGuildWarp(22); }},
        {label:'🌲 南の街道(続)',       price:0, icon:'🌲', action:()=>{ close(); this._doGuildWarp(23); }},
        {label:'⛏ 鉱山の街道',         price:0, icon:'⛏', action:()=>{ close(); this._doGuildWarp(24); }},
        {label:'🏛 砂漠の街',           price:0, icon:'🏛', action:()=>{ close(); this._doGuildWarp(25); }},
        {label:'🏖 海岸の街道',         price:0, icon:'🏖', action:()=>{ close(); this._doGuildWarp(26); }},
        {label:'⛵ 港町ミナト',         price:0, icon:'⛵', action:()=>{ close(); this._doGuildWarp(27); }},
        {label:'🌸 桜の里',             price:0, icon:'🌸', action:()=>{ close(); this._doGuildWarp(28); }},
        {label:'🏯 桜の城',             price:0, icon:'🏯', action:()=>{ close(); this._doGuildWarp(29); }},
      ],
      jobchange:[
        // ── 転職屋: ノービス専用、ジョブLv5以上で4職に転職可 ──
        {label:'⚔ 剣士に転職',     price:0, icon:'⚔', action:()=>{ this._doJobChange('warrior', close, showResult); }},
        {label:'🪄 マジシャンに転職',price:0, icon:'🪄', action:()=>{ this._doJobChange('mage',    close, showResult); }},
        {label:'🏹 アーチャーに転職',price:0, icon:'🏹', action:()=>{ this._doJobChange('archer',  close, showResult); }},
        {label:'💣 ボマーに転職',   price:0, icon:'💣', action:()=>{ this._doJobChange('bomber',  close, showResult); }},
      ],
    };

    // 鍛冶屋はクラフト専用UI
    if(b.type==='blacksmith'){
      this._buildCraftUI(mk,close,showResult,refreshGold,PX,PY,PW,PH,pd);
      return;
    }

    const items=shops[b.type]||[];
    // スクロールバー(鍛冶屋と同じ太さ・操作感)
    const SB_W=20;
    // 購入モードと売却モードの両方でスクロール対応
    const SH_H=68; // セル高さ
    const BUY_H=42;
    // ショップは「購入/売却」タブを表示するため、リストの上にタブ用の余白を確保
    const hasTabs=(b.type==='shop');
    const TAB_H=hasTabs?34:0;
    const listTop=PY-PH/2+60+TAB_H;
    const listBottom=PY+PH/2-20-BUY_H;
    const listH2=listBottom-listTop;
    const visibleRows=Math.max(1,Math.floor(listH2/SH_H));
    let shopScroll=0;          // 行(=アイテム)単位のスクロール
    let selectedItem=null;     // 購入時：商品オブジェクト / 売却時：所持品ID
    let mode='buy';            // 'buy' | 'sell'
    const shopObjs=[];
    // スワイプ用
    let shSwipeY=null, shSwipeScroll=null;

    // 売却対象リストを構築（usableでない、sell>0、所持>0）
    const buildSellList=()=>{
      const out=[];
      const inv=pd.items||{};
      Object.keys(inv).forEach(id=>{
        const def=ITEM_DEFS[id]; if(!def) return;
        if(def.usable) return;        // 帰還の巻物などの使用アイテムは売らない
        if(!(def.sell>0)) return;     // 売値ゼロは売れない
        const cnt=inv[id]||0; if(cnt<=0) return;
        out.push({id, def, count:cnt});
      });
      return out;
    };
    let sellList=buildSellList();
    // 売却数量（itemId → 売る予定の個数）
    let sellQty={};
    const totalSellQty=()=>Object.values(sellQty).reduce((a,b)=>a+b,0);
    const totalSellGold=()=>{
      let g=0;
      Object.keys(sellQty).forEach(id=>{
        const def=ITEM_DEFS[id]; if(def) g+=def.sell*sellQty[id];
      });
      return g;
    };
    const clearSellQty=()=>{ sellQty={}; };
    // 売却数量を変更（クランプ：0〜所持数）
    const adjustSellQty=(id,delta)=>{
      const inv=pd.items||{};
      const have=inv[id]||0;
      const cur=sellQty[id]||0;
      const next=Math.max(0,Math.min(have,cur+delta));
      if(next===0) delete sellQty[id]; else sellQty[id]=next;
    };

    // タブUI（ショップのみ）
    let tabBuyBg,tabBuyTxt,tabSellBg,tabSellTxt;
    if(hasTabs){
      const tabY=PY-PH/2+60+TAB_H/2-2;
      const tabW=(PW-30)/2;
      const tabBuyX=PX-tabW/2-4;
      const tabSellX=PX+tabW/2+4;
      tabBuyBg=mk(this.add.rectangle(tabBuyX,tabY,tabW,TAB_H-6,0x0a1f35,0.95).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(72).setInteractive({useHandCursor:true}));
      tabBuyTxt=mk(this.add.text(tabBuyX,tabY,'🛒 購入',{fontSize:'14px',fontFamily:'Arial',color:'#44aaff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
      tabSellBg=mk(this.add.rectangle(tabSellX,tabY,tabW,TAB_H-6,0x0a1525,0.9).setStrokeStyle(2,0x334455).setScrollFactor(0).setDepth(72).setInteractive({useHandCursor:true}));
      tabSellTxt=mk(this.add.text(tabSellX,tabY,'💰 売却',{fontSize:'14px',fontFamily:'Arial',color:'#778899'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
      const refreshTabs=()=>{
        if(mode==='buy'){
          tabBuyBg.setFillStyle(0x0a1f35,0.95).setStrokeStyle(2,0x44aaff);
          tabBuyTxt.setColor('#44aaff');
          tabSellBg.setFillStyle(0x0a1525,0.9).setStrokeStyle(2,0x334455);
          tabSellTxt.setColor('#778899');
        }else{
          tabBuyBg.setFillStyle(0x0a1525,0.9).setStrokeStyle(2,0x334455);
          tabBuyTxt.setColor('#778899');
          tabSellBg.setFillStyle(0x351a0a,0.95).setStrokeStyle(2,0xffaa44);
          tabSellTxt.setColor('#ffaa44');
        }
      };
      tabBuyBg.on('pointerdown',()=>{
        if(mode==='buy')return;
        mode='buy'; selectedItem=null; shopScroll=0;
        clearSellQty();
        refreshTabs(); renderShopItems(0); updateBuyBtn();
        if(typeof rebuildThumb==='function'){rebuildThumb(); updateSb();}
      });
      tabSellBg.on('pointerdown',()=>{
        if(mode==='sell')return;
        mode='sell'; selectedItem=null; shopScroll=0;
        clearSellQty();
        sellList=buildSellList();
        refreshTabs(); renderShopItems(0); updateBuyBtn();
        if(typeof rebuildThumb==='function'){rebuildThumb(); updateSb();}
      });
    }

    // 購入ボタン（下部固定・閉じる右上化に伴い下に拡張）
    const buyBtnY=PY+PH/2-BUY_H/2-10;
    const buyBtn=mk(this.add.rectangle(PX,buyBtnY,PW-20,BUY_H-6,0x0a1525,0.9).setStrokeStyle(2,0x334455).setScrollFactor(0).setDepth(73));
    const buyBtnTxt=mk(this.add.text(PX,buyBtnY,'商品を選択してください',{fontSize:'14px',fontFamily:'Arial',color:'#556677',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(74));

    const updateBuyBtn=()=>{
      buyBtn.removeAllListeners('pointerdown');
      buyBtn.removeAllListeners('pointerover');
      buyBtn.removeAllListeners('pointerout');
      // ── 売却モード ──
      if(mode==='sell'){
        const tq=totalSellQty();
        const tg=totalSellGold();
        if(tq<=0){
          buyBtn.setFillStyle(0x1a1208,0.9).setStrokeStyle(2,0x554433);
          buyBtnTxt.setText('±ボタンで売却数を選んでください').setColor('#776655');
          buyBtn.removeInteractive(); return;
        }
        buyBtn.setFillStyle(0x351a0a,0.95).setStrokeStyle(2,0xffaa44);
        buyBtnTxt.setText('💰 合計 '+tq+'個 を売却（+'+tg+'G）').setColor('#ffaa44');
        buyBtn.setInteractive({useHandCursor:true});
        buyBtn.on('pointerdown',()=>{
          // 一括売却
          const inv=pd.items||{};
          let totalG=0, totalC=0;
          Object.keys(sellQty).forEach(id=>{
            const q=sellQty[id]||0; if(q<=0)return;
            const def=ITEM_DEFS[id]; if(!def)return;
            const have=inv[id]||0;
            const sell=Math.min(q,have);
            inv[id]=have-sell;
            if(inv[id]<=0) delete inv[id];
            totalG+=def.sell*sell; totalC+=sell;
          });
          pd.gold+=totalG;
          refreshGold();
          this.updateHUD(); // HUDの所持金表示も即更新
          SE('potion');
          showResult('💰 '+totalC+'個 売却（+'+totalG+'G）','#ffaa44');
          // 状態クリア&リスト再構築
          clearSellQty();
          selectedItem=null; // 選択状態もクリア
          sellList=buildSellList();
          // スクロール位置を安全な範囲に
          const maxS=curMaxScroll();
          if(shopScroll>maxS) shopScroll=maxS;
          renderShopItems(shopScroll); updateBuyBtn();
          // スクロールバー(thumb)も再構築
          if(typeof rebuildThumb==='function'){rebuildThumb(); updateSb();}
        });
        buyBtn.on('pointerover',()=>buyBtn.setFillStyle(0x553a1a,0.98));
        buyBtn.on('pointerout', ()=>buyBtn.setFillStyle(0x351a0a,0.95));
        return;
      }
      // ── 購入モード（既存） ──
      if(!selectedItem){
        buyBtn.setFillStyle(0x0a1525,0.9).setStrokeStyle(2,0x334455);
        buyBtnTxt.setText('商品を選択してください').setColor('#556677');
        buyBtn.removeInteractive(); return;
      }
      const item=selectedItem;
      const mageOnly=item.mageOnly||false;
      const wrongClass=mageOnly&&pd.cls!=='mage';
      const isOwned = (typeof item.owned==='function') && item.owned();
      const canAfford=pd.gold>=item.price&&!wrongClass;
      if(isOwned){
        // 既に習得済み: 購入不可
        buyBtn.setFillStyle(0x0a1f0a,0.9).setStrokeStyle(2,0x336633);
        buyBtnTxt.setText('✓ 習得済み').setColor('#66cc66');
        buyBtn.removeInteractive();
      }else if(item.price===0){
        buyBtn.setFillStyle(0x1a2a3a,0.9).setStrokeStyle(2,0x44aaff);
        buyBtnTxt.setText(item.icon+' 使用する').setColor('#44aaff');
        buyBtn.setInteractive({useHandCursor:true});
        buyBtn.on('pointerdown',()=>{item.action();selectedItem=null;renderShopItems(shopScroll);updateBuyBtn();});
      }else if(wrongClass){
        buyBtn.setFillStyle(0x1a0a0a,0.9).setStrokeStyle(2,0x553333);
        buyBtnTxt.setText('✗ マジシャン専用アイテムです').setColor('#cc4444');
        buyBtn.removeInteractive();
      }else if(canAfford){
        buyBtn.setFillStyle(0x0a1f35,0.95).setStrokeStyle(2,0x44aaff);
        buyBtnTxt.setText('💰 '+item.icon+' '+item.label+' を購入する（'+item.price+'G）').setColor('#44aaff');
        buyBtn.setInteractive({useHandCursor:true});
        buyBtn.on('pointerdown',()=>{
          const before=pd.gold;
          pd.gold-=item.price;
          const result=item.action();
          // actionがfalseを返したら購入失敗 → ゴールドを戻す
          if(result===false){ pd.gold=before; }
          refreshGold(); this.updateHUD(); SE('potion');
          // ポーションボタンの数字を即座に更新
          if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
          if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
          selectedItem=null; renderShopItems(shopScroll); updateBuyBtn();
        });
        buyBtn.on('pointerover',()=>buyBtn.setFillStyle(0x1a3a5a,0.98));
        buyBtn.on('pointerout', ()=>buyBtn.setFillStyle(0x0a1f35,0.95));
      }else{
        buyBtn.setFillStyle(0x1a0a0a,0.9).setStrokeStyle(2,0x553333);
        buyBtnTxt.setText('✗ 所持金が足りません（'+item.price+'G必要）').setColor('#cc4444');
        buyBtn.removeInteractive();
      }
    };

    const renderShopItems=(offset)=>{
      shopObjs.forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
      shopObjs.length=0;
      const addS=(o)=>{shopObjs.push(o);mk(o);return o;};

      // ── 売却モード ──
      if(mode==='sell'){
        if(sellList.length===0){
          addS(this.add.text(PX,listTop+listH2/2,'売れる収集品を持っていません',{fontSize:'13px',fontFamily:'Arial',color:'#778899'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
          return;
        }
        // ── 売却モード: 2列×3行グリッド ──
        const SELL_COLS=2;
        const SH_SELL_H=Math.max(96, Math.min(120, Math.floor((listBottom-listTop)/3) - 6));
        const sellRows=3;
        const GAP_S=6;
        const availW_S=PW-24-SB_W-6;
        const cellW=Math.floor((availW_S-GAP_S)/SELL_COLS);
        const baseX=PX-(SB_W+6)/2; // スクロールバー分左にずらした中心
        const cellCx=baseX;
        const startSell=offset*SELL_COLS; // offsetは行単位
        sellList.slice(startSell,startSell+sellRows*SELL_COLS).forEach((entry,i)=>{
          const col=i%SELL_COLS, row=Math.floor(i/SELL_COLS);
          const ix = baseX + (col===0 ? -(cellW/2 + GAP_S/2) : (cellW/2 + GAP_S/2));
          const iy = listTop + row*(SH_SELL_H+GAP_S) + SH_SELL_H/2 + 2;
          const qty=sellQty[entry.id]||0;
          const hasQty=qty>0;
          const bgCol=hasQty?0x3a2a0a:0x1a1208;
          const strokeCol=hasQty?0xffcc66:0x554433;
          // セル背景
          addS(this.add.rectangle(ix,iy,cellW-2,SH_SELL_H,bgCol,0.92).setStrokeStyle(hasQty?2:1,strokeCol).setScrollFactor(0).setDepth(72));
          // 上段: アイコン+名前+所持/単価
          const topY=iy-SH_SELL_H*0.30;
          addS(this.add.text(ix-cellW/2+18,topY,entry.def.icon,{fontSize:'18px'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
          addS(this.add.text(ix-cellW/2+34,topY,entry.def.name,{fontSize:'12px',fontFamily:'Arial',color:hasQty?'#ffcc66':'#ffffff',fontStyle:hasQty?'bold':'normal'}).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
          // 中段: 所持数+単価
          const midY=iy-SH_SELL_H*0.08;
          addS(this.add.text(ix,midY,'所持: '+entry.count+'  単価: +'+entry.def.sell+'G',{fontSize:'10px',fontFamily:'Arial',color:'#aaccdd'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
          // 下段: 売却数表示
          const qtyY=iy+SH_SELL_H*0.13;
          const qtyTxt=hasQty?(qty+'個 (+'+(qty*entry.def.sell)+'G)'):'0個';
          addS(this.add.text(ix,qtyY,qtyTxt,{fontSize:'11px',fontFamily:'Arial',color:hasQty?'#ffcc66':'#778899',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
          // 最下段: ±ボタン
          const ctrlY=iy+SH_SELL_H*0.34;
          const btnW=Math.floor((cellW-16)/4)-2, btnH=22, gap=2;
          const mkBtn=(bx,label,delta,col,tcol)=>{
            const canPress=(delta>0?qty<entry.count:qty>0);
            const fillCol=canPress?col:0x222222;
            const strkCol=canPress?col:0x444444;
            const txCol=canPress?tcol:'#555555';
            const bg=addS(this.add.rectangle(bx,ctrlY,btnW,btnH,fillCol,canPress?0.85:0.4).setStrokeStyle(1,strkCol).setScrollFactor(0).setDepth(73));
            addS(this.add.text(bx,ctrlY,label,{fontSize:'11px',fontFamily:'Arial',color:txCol,fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(74));
            if(canPress){
              bg.setInteractive({useHandCursor:true});
              bg.on('pointerdown',()=>{
                adjustSellQty(entry.id,delta);
                SE('click');
                renderShopItems(shopScroll);
                updateBuyBtn();
              });
              bg.on('pointerover',()=>bg.setFillStyle(col,0.95));
              bg.on('pointerout', ()=>bg.setFillStyle(col,0.85));
            }
          };
          // 4ボタン横並び: -10 -1 +1 +10
          const startX=ix-cellW/2+8+btnW/2;
          mkBtn(startX,                    '-10', -10, 0x552222, '#ff8888');
          mkBtn(startX+(btnW+gap),         '-1',  -1,  0x552222, '#ff8888');
          mkBtn(startX+(btnW+gap)*2,       '+1',  +1,  0x225522, '#88ff88');
          mkBtn(startX+(btnW+gap)*3,       '+10', +10, 0x225522, '#88ff88');
        });
        // 件数インジケーター
        const totalSellRows=Math.ceil(sellList.length/SELL_COLS);
        if(totalSellRows>sellRows){
          const startR=offset+1, endR=Math.min(offset+sellRows,totalSellRows);
          addS(this.add.text(cellCx,listBottom+4,'行 '+startR+'〜'+endR+' / '+totalSellRows+'　▲▼スワイプでスクロール',{fontSize:'10px',fontFamily:'Arial',color:'#776655'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
        }
        return;
      }

      // ── 購入モード：2列×3行グリッド(6個ずつ表示) ──
      const SH_COLS=2;
      const startIdx=offset*SH_COLS; // offsetは「行」単位
      // セル縦を圧縮: 1行内は「アイコン+名前+職業タグ+価格」を横配置
      const rowH=Math.max(58, Math.min(72, Math.floor((listBottom-listTop)/3) - 6)); // 余白確保のため短めに
      const visRows=3;
      const GAP=6;
      const availW=PW-24-SB_W-6;
      const cellW=Math.floor((availW-GAP)/SH_COLS);
      const baseX=PX-(SB_W+6)/2; // スクロールバー分左にずらした「2列全体の中心X」
      const endIdx=startIdx+visRows*SH_COLS;
      items.slice(startIdx,endIdx).forEach((item,i)=>{
        const col=i%SH_COLS, row=Math.floor(i/SH_COLS);
        // col=0は左、col=1は右。全体の中心baseX基準に左右配置
        const ix = baseX + (col===0 ? -(cellW/2 + GAP/2) : (cellW/2 + GAP/2));
        const iy = listTop + row*(rowH+GAP) + rowH/2 + 2;
        const isSelected=selectedItem===item;
        const mageOnly=item.mageOnly||false;
        const warriorOnly=item.label.includes('剣士専用');
        const archerOnly=item.label.includes('アーチャー専用');
        const bomberOnly=item.label.includes('ボマー専用');
        const wrongClass=(mageOnly&&pd.cls!=='mage')
                      ||(warriorOnly&&pd.cls!=='warrior')
                      ||(archerOnly&&pd.cls!=='archer')
                      ||(bomberOnly&&pd.cls!=='bomber');
        const canAfford=pd.gold>=item.price&&!wrongClass;
        const bgCol=isSelected?0x1a3a1a:wrongClass?0x1a0a0a:canAfford?0x0a1f35:0x0d0d0d;
        const strokeCol=isSelected?0x44ff44:wrongClass?0x552222:canAfford?0x44aaff:0x333333;
        const ibg=addS(this.add.rectangle(ix,iy,cellW-2,rowH,bgCol,0.92).setStrokeStyle(isSelected?2:1,strokeCol).setScrollFactor(0).setDepth(72).setInteractive({useHandCursor:true}));

        // ── 横レイアウト: [アイコン | 名前+タグ | 価格] ──
        const leftX = ix - cellW/2 + 20;
        // 1. 左端: アイコン
        addS(this.add.text(leftX, iy, item.icon, {fontSize:'22px'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
        // 2. 中央: 名前(上段) + 職業タグ(下段)
        const textCol=isSelected?'#44ff44':wrongClass?'#663333':canAfford?'#ffffff':'#666677';
        const cleanLabel=item.label.replace(/\s*※[^\s]+専用.*$/,'').replace(/\s+/g,' ').trim();
        const centerX = leftX + 18;
        const nameW = cellW - 20 - 18 - 54; // アイコン+左余白+右価格枠を差し引いた幅
        // 職業タグの有無で名前位置を調整
        let tagText='', tagColor='#aaaaaa';
        if(mageOnly){tagText='🔮マジシャン';tagColor=pd.cls==='mage'?'#bb88ee':'#663333';}
        else if(warriorOnly){tagText='⚔剣士';tagColor=pd.cls==='warrior'?'#ff6666':'#663333';}
        else if(archerOnly){tagText='🏹アーチャー';tagColor=pd.cls==='archer'?'#66dd66':'#663333';}
        else if(bomberOnly){tagText='💣ボマー';tagColor=pd.cls==='bomber'?'#ffaa44':'#663333';}
        const hasTag = !!tagText;
        // 名前(タグある時は上寄せ、ない時は中央)
        addS(this.add.text(centerX, iy + (hasTag?-9:0), cleanLabel, {
          fontSize:'12px',fontFamily:'Arial',color:textCol,
          fontStyle:isSelected?'bold':'normal',
          wordWrap:{width:nameW}
        }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        // タグ(下段)
        if(hasTag){
          addS(this.add.text(centerX, iy+9, tagText, {
            fontSize:'10px',fontFamily:'Arial',color:tagColor,fontStyle:'bold'
          }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        }
        // 3. 右端: 価格
        const priceX = ix + cellW/2 - 8;
        if(item.price>0){
          addS(this.add.text(priceX, iy, item.price+'G', {
            fontSize:'13px',fontFamily:'Arial',
            color:wrongClass?'#553333':canAfford?'#ffd700':'#663300',fontStyle:'bold'
          }).setOrigin(1,0.5).setScrollFactor(0).setDepth(73));
        }else{
          addS(this.add.text(priceX, iy, '使用', {
            fontSize:'12px',fontFamily:'Arial',color:'#44aaff',fontStyle:'bold'
          }).setOrigin(1,0.5).setScrollFactor(0).setDepth(73));
        }
        ibg.on('pointerdown',()=>{selectedItem=(isSelected?null:item);renderShopItems(shopScroll);updateBuyBtn();});
        ibg.on('pointerover',()=>ibg.setFillStyle(isSelected?0x1a4a1a:0x1a2a3a,0.95));
        ibg.on('pointerout', ()=>ibg.setFillStyle(bgCol,0.92));
      });

      // 件数インジケーター(2列×3行)
      const totalRowsBuy=Math.ceil(items.length/SH_COLS);
      if(totalRowsBuy>visRows){
        const startRow=offset+1;
        const endRow=Math.min(offset+visRows,totalRowsBuy);
        addS(this.add.text(PX,listBottom+4,'行 '+startRow+'〜'+endRow+' / '+totalRowsBuy+'　▲▼スワイプでスクロール',{fontSize:'10px',fontFamily:'Arial',color:'#556677'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
      }
    };

    // スクロールバー(鍛冶屋と同じ・太くて押しやすい)
    const sbX=PX+PW/2-SB_W/2-4;
    const sbBg=mk(this.add.rectangle(sbX,listTop+listH2/2,SB_W,listH2,0x1a1a2e,0.9).setStrokeStyle(1,0x334455).setScrollFactor(0).setDepth(73));
    let sbThumbH=40, sbThumb=null;
    const rebuildThumb=()=>{
      if(sbThumb){try{sbThumb.destroy();}catch(e){}}
      const maxS=curMaxScroll();
      const total=(mode==='sell'?sellList.length:items.length);
      const visCount=(mode==='sell'?sellRowsPerView():buyRowsPerView());
      sbThumbH=Math.max(40, listH2*Math.min(1, visCount/Math.max(1,total)));
      sbThumb=mk(this.add.rectangle(sbX,listTop+sbThumbH/2,SB_W-4,sbThumbH,0x44aaff,0.85).setScrollFactor(0).setDepth(74).setStrokeStyle(1,0x88ccff));
      sbThumb.setVisible(maxS>0);
      sbThumb.setInteractive({useHandCursor:true,draggable:true});
      this.input.setDraggable(sbThumb);
      sbThumb.on('drag',(_p,_x,y)=>{
        const maxS2=curMaxScroll();
        if(maxS2<=0)return;
        const ratio=Math.max(0,Math.min(1,(y-listTop-sbThumbH/2)/(listH2-sbThumbH)));
        doShScroll(Math.round(ratio*maxS2));
      });
    };
    const updateSb=()=>{
      if(!sbThumb)return;
      const maxS=curMaxScroll();
      if(maxS<=0){sbThumb.setVisible(false);return;}
      sbThumb.setVisible(true);
      const ratio=shopScroll/maxS;
      sbThumb.setY(listTop+(listH2-sbThumbH)*ratio+sbThumbH/2);
    };
    sbBg.setInteractive();
    sbBg.on('pointerdown',(ptr)=>{
      const maxS=curMaxScroll();
      if(maxS<=0)return;
      const ratio=(ptr.y-listTop)/listH2;
      doShScroll(Math.round(ratio*maxS));
    });

    // スワイプスクロール
    const shZone=mk(this.add.rectangle(PX-SB_W/2-2,listTop+listH2/2,PW-SB_W-8,listH2,0x000000,0).setScrollFactor(0).setDepth(71).setInteractive());
    const SH_SELL_H=64;
    const SH_BUY_H=Math.max(80, Math.floor(listH2/3)); // 購入モード: 3行ぴったり収める
    const SH_BUY_COLS=2; // 購入モード列数
    const SH_SELL_COLS=2; // 売却モード列数
    const sellRowsPerView=()=>3; // 売却モードも3行表示
    const buyRowsPerView=()=>3; // 常に3行表示
    // 購入・売却共に「行(2列セット)」単位
    const curMaxScroll=()=>{
      if(mode==='sell'){
        const totalRowsS=Math.ceil(sellList.length/SH_SELL_COLS);
        return Math.max(0, totalRowsS-sellRowsPerView());
      }
      const totalRows=Math.ceil(items.length/SH_BUY_COLS);
      return Math.max(0, totalRows-buyRowsPerView());
    };
    const curRowH=()=>(mode==='sell'?Math.max(110, Math.floor(listH2/3)):SH_BUY_H);
    const doShScroll=(newScroll)=>{const c=Math.max(0,Math.min(curMaxScroll(),newScroll));if(c!==shopScroll){shopScroll=c;renderShopItems(shopScroll);updateSb();}};
    shZone.on('wheel',(_p,_dx,dy)=>{doShScroll(shopScroll+(dy>0?1:-1));});
    shZone.on('pointerdown',(ptr)=>{shSwipeY=ptr.y;shSwipeScroll=shopScroll;});
    shZone.on('pointermove',(ptr)=>{
      if(shSwipeY===null)return;
      const dy=shSwipeY-ptr.y;
      doShScroll(Math.round(shSwipeScroll+dy/(curRowH()*0.7)));
    });
    shZone.on('pointerup',()=>{shSwipeY=null;});
    shZone.on('pointerout',()=>{shSwipeY=null;});

    renderShopItems(0);
    rebuildThumb();
    updateSb();
    updateBuyBtn();
  }

  openMenu(tab='stat'){
    if(this._menuOpen) return;
    this._menuOpen=true;
    if(!this._skipOpenSE) SE('open');
    this._skipOpenSE=false;
    this.physics.pause();
    this._buildMenuOverlay(tab);
  }

  _buildMenuOverlay(tab){
    const pd=this.playerData;
    const w=this.scale.width, h=this.scale.height;
    // 画面ほぼいっぱいに使う
    const PW=Math.min(w*0.78,680), PH=Math.min(h*0.78,440);
    const PX=w/2, PY=h/2;
    const L=PX-PW/2+12, R=PX+PW/2-12; // 左右端
    const TAB_H=34, BOT_H=32;
    const ITOP=PY-PH/2+TAB_H+6;
    const IBOT=PY+PH/2-BOT_H-8;
    const IH=IBOT-ITOP;

    const root=this.add.container(0,0).setDepth(200);
    this._menuRoot=root;
    const sf0=(o)=>{o.setScrollFactor(0);return o;};
    const add=(o)=>{root.add(o);return o;};
    const mk=(o)=>add(sf0(o));

    // 背景・パネル
    mk(this.add.rectangle(PX,PY,w,h,0x000000,0.90));
    mk(this.add.rectangle(PX,PY,PW,PH,0x080d1a,0.99).setStrokeStyle(3,0x44aaff));

    // タブ
    const tabBtns={}, tabTxts={};
    const statCont=sf0(this.add.container(0,0));
    const skillCont=sf0(this.add.container(0,0));
    const equipCont=sf0(this.add.container(0,0));
    const itemCont=sf0(this.add.container(0,0));
    // 全コンテナを最初に非表示
    statCont.setVisible(false);
    skillCont.setVisible(false);
    equipCont.setVisible(false);
    itemCont.setVisible(false);
    statCont.setVisible(false);
    root.add([statCont,skillCont,equipCont,itemCont]);

    let _currentTab=null;
    const switchTab=(t)=>{
      if(_currentTab!==null && _currentTab!==t) SE('tab');
      _currentTab=t;
      statCont.setVisible(t==='stat');
      skillCont.setVisible(t==='skill');
      equipCont.setVisible(t==='equip');
      itemCont.setVisible(t==='item');
      ['stat','skill','equip','item'].forEach(id=>{
        const colMap={stat:0x44aaff,skill:0x00e5ff,equip:0xe74c3c,item:0xf39c12};
        const col=colMap[id]||0x44aaff;
        const on=id===t;
        tabBtns[id].setFillStyle(col,on?0.5:0.08).setStrokeStyle(2,on?col:0x334455);
        tabTxts[id].setColor(on?'#'+col.toString(16).padStart(6,'0'):'#334455');
      });
    };

    [['stat','⚡ ステータス',0x44aaff,-PW*0.375],['skill','🎯 スキル',0x00e5ff,-PW*0.125],['equip','🛡 装備',0xe74c3c,PW*0.125],['item','🎒 アイテム',0xf39c12,PW*0.375]].forEach(([id,label,col,ox])=>{
      const btn=mk(this.add.rectangle(PX+ox,PY-PH/2+TAB_H/2,PW/4-3,TAB_H,col,0.08).setStrokeStyle(2,col).setInteractive());
      const txt=mk(this.add.text(PX+ox,PY-PH/2+TAB_H/2,label,{fontSize:'17px',fontFamily:'Arial',color:'#'+col.toString(16).padStart(6,'0')}).setOrigin(0.5));
      btn.on('pointerdown',()=>switchTab(id));
      tabBtns[id]=btn; tabTxts[id]=txt;
    });

    // 閉じるボタン
    const closeBX=PX+PW/4; // 右寄り（スキルタブの確定ボタンと横並び想定）
    const closeBY=PY+PH/2-BOT_H/2-2;
    const closeBtn=mk(this.add.rectangle(closeBX,closeBY,160,BOT_H,0xffd700,0.2).setStrokeStyle(2,0xffd700).setInteractive());
    mk(this.add.text(closeBX,closeBY,'✕ 閉じる',{fontSize:'15px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5));
    closeBtn.on('pointerover',()=>closeBtn.setFillStyle(0xffd700,0.45));
    closeBtn.on('pointerout', ()=>closeBtn.setFillStyle(0xffd700,0.2));
    closeBtn.on('pointerdown',()=>this._closeMenu());
    this._menuEscKey=this.input.keyboard.addKey('ESC');
    this._menuEscKey.once('down',()=>this._closeMenu());

    // ════════════════════════════════
    //  ステータスタブ
    // ════════════════════════════════
    const S=[
      {key:'atk',label:'力   STR',desc:'ATK +2/pt', col:'#e74c3c',apply:(p,n)=>{p.atk+=n*2}},
      {key:'agi',label:'素早 AGI',desc:'回避+3/pt', col:'#2ecc71',apply:(p,n)=>{p.agi=(p.agi||0)+n*3}},
      {key:'mag',label:'魔力 MAG',desc:'MAG+2 SP回復+0.3/pt', col:'#9b59b6',apply:(p,n)=>{p.mag+=n*2;p.intPts=(p.intPts||0)+n;}},
      {key:'mhp',label:'体力 VIT',desc:'HP+9 回復+0.5/pt', col:'#27ae60',apply:(p,n)=>{p.mhp+=n*9;p.hp=Math.min(p.hp+n*9,p.mhp);p.vitPts=(p.vitPts||0)+n;}},
      {key:'luk',label:'運   LUK',desc:'CRIT+1/pt', col:'#f39c12',apply:(p,n)=>{p.luk+=n}},
      {key:'hit',label:'命中 DEX',desc:'HIT +2/pt', col:'#3498db',apply:(p,n)=>{p.hit+=n*2}},
    ];
    const stmp={}; S.forEach(s=>{stmp[s.key]=0;}); let tmpPts=pd.statPts||0;
    // ── ROのステ振り増分コスト ──
    // 現在の振り分け値が N の時、+1 するためのコスト = floor(N/10) + 2
    // N=0〜9: 2pt, N=10〜19: 3pt, N=20〜29: 4pt, ..., N=90〜98: 11pt
    const STAT_MAX = 99; // 1ステ最大99
    // 各ステの現在の「振り分け済み量」を取得(基本値からの差分ではなく、累計振り分けpts)
    // 既存仕様: pd.intPts/strPts/vitPts/dexPts/agiPts/lukPts に振り分けptsを記録
    const getAllocated=(s)=>{
      const map={atk:'strPts',mag:'intPts',mhp:'vitPts',hit:'dexPts',agi:'agiPts',luk:'lukPts'};
      const k=map[s.key];
      return (pd[k]||0) + (stmp[s.key]||0);
    };
    const getCost=(currentN)=>Math.floor(currentN/10)+2;
    const svStr=(key)=>{
      if(key==='spd')return String(pd.spd);
      if(key==='mhp')return String(pd.mhp);
      if(key==='agi'){
        // 実回避率: 逓減カーブ後の値(雑魚相手・上限75%)
        const raw=pd.agi||0;
        const actual=Math.min(75, Math.floor(Math.sqrt(raw)*9));
        return raw+' (回避'+actual+'%)';
      }
      return String(pd[key]);
    };
    const sadd=(o)=>{statCont.add(sf0(o));return o;};

    // ポイント残数
    const ptsTxt=sadd(this.add.text(PX,ITOP+10,'残りポイント: '+tmpPts+'pt',{fontSize:'14px',fontFamily:'Arial',color:'#ffff44'}).setOrigin(0.5));
    const refreshPts=()=>ptsTxt.setText('残りポイント: '+tmpPts+'pt');

    // 縦3×横2グリッドレイアウト（IHをフル活用）
    const SCOLS=2, SROWS=3;
    const CELL_W=(PW-20)/SCOLS;
    const CELL_H=(IH-22)/SROWS; // 上部テキスト分のみ引く
    const vt={}, at={};
    S.forEach((s,i)=>{
      const col2=i%SCOLS, row2=Math.floor(i/SCOLS);
      const GAP=14; // 列間の隙間（中央境界線付近の余白）
      const cx=L+col2*CELL_W+CELL_W/2;
      const cy=ITOP+24+row2*CELL_H+CELL_H/2;
      const cL=L+col2*CELL_W+4;
      // 右端：右列は外側寄り、左列は中央から離す
      const cR=L+(col2+1)*CELL_W-4-(col2===0?GAP:0);
      const btnW=Math.min(36,CELL_W*0.16);
      const fs=Math.max(12,Math.min(15,CELL_W*0.06));

      // セル背景（中央に隙間を開ける）
      const cellW2=CELL_W-6-(col2===0?GAP/2:GAP/2);
      const cellX2=col2===0?cx-GAP/4:cx+GAP/4;
      sadd(this.add.rectangle(cellX2,cy,cellW2,CELL_H-6,0x0d1a2e,0.75).setStrokeStyle(1,0x2a3f55));
      // カラーライン（左端）
      sadd(this.add.rectangle(cL+2,cy,3,CELL_H-10,parseInt(s.col.replace('#',''),16),0.9).setOrigin(0.5));
      // ラベル（大きく）
      sadd(this.add.text(cL+10,cy-CELL_H*0.28,s.label,{fontSize:fs+'px',fontFamily:'Arial',color:s.col,fontStyle:'bold'}).setOrigin(0,0.5));
      // 説明
      sadd(this.add.text(cL+10,cy+CELL_H*0.08,s.desc,{fontSize:Math.max(9,fs-3)+'px',fontFamily:'Arial',color:'#667788'}).setOrigin(0,0.5));
      // 現在値
      const cur=sadd(this.add.text(cR-btnW*2-10,cy-CELL_H*0.1,svStr(s.key),{fontSize:(fs+3)+'px',fontFamily:'Arial',color:'#ffffff',fontStyle:'bold'}).setOrigin(1,0.5));
      // 仮割り振り
      const addTxt=sadd(this.add.text(cR-btnW*2-10,cy+CELL_H*0.22,'',{fontSize:(fs-1)+'px',fontFamily:'Arial',color:'#44ff88'}).setOrigin(1,0.5));
      // ─ ボタン（cRから内側へ）
      const bmX2=cR-btnW*1.6;
      const bpX2=cR-btnW*0.5;
      const bm=sadd(this.add.rectangle(bmX2,cy,btnW,CELL_H-16,0xe74c3c,0.25).setStrokeStyle(2,0xe74c3c).setInteractive());
      sadd(this.add.text(bmX2,cy,'－',{fontSize:'18px',fontFamily:'Arial',color:'#e74c3c'}).setOrigin(0.5));
      // ＋ ボタン
      const bp=sadd(this.add.rectangle(bpX2,cy,btnW,CELL_H-16,0x44aaff,0.25).setStrokeStyle(2,0x44aaff).setInteractive());
      sadd(this.add.text(bpX2,cy,'＋',{fontSize:'18px',fontFamily:'Arial',color:'#44aaff'}).setOrigin(0.5));
      // 現在値+仮割り振り後のN(+1コスト計算用)
      const updateAddTxt=()=>{
        const n=stmp[s.key]||0;
        const allocated=getAllocated(s);
        const nextCost=getCost(allocated);
        if(n>0){
          addTxt.setText('(+'+n+'  次:'+getCost(allocated)+'pt)');
        }else{
          addTxt.setText('次:'+nextCost+'pt');
        }
      };
      updateAddTxt();
      const adj=(dir)=>{
        // 覚醒中はステータス振り分け不可
        if(pd.awakened){
          this.showFloat(this.player.x, this.player.y-50, '覚醒中は振り分け不可', '#ff6666', 'info');
          SE('miss');
          return;
        }
        const n=stmp[s.key]||0;
        const allocated=getAllocated(s);
        if(dir>0){
          if(allocated>=STAT_MAX)return; // MAX到達
          const cost=getCost(allocated);
          if(tmpPts<cost)return;
          stmp[s.key]=n+1; tmpPts-=cost;
        }else{
          if(n<=0)return; // 仮割り振り分のみ-可
          // -1 の払い戻し: 1個前のコストを返す(allocated-1のコスト)
          const refund=getCost(allocated-1);
          stmp[s.key]=n-1; tmpPts+=refund;
        }
        updateAddTxt();
        refreshPts(); SE('click');
      };
      bm.on('pointerdown',()=>adj(-1)); bm.on('pointerover',()=>bm.setFillStyle(0xe74c3c,0.5)); bm.on('pointerout',()=>bm.setFillStyle(0xe74c3c,0.25));
      bp.on('pointerdown',()=>adj(+1)); bp.on('pointerover',()=>bp.setFillStyle(0x44aaff,0.5)); bp.on('pointerout',()=>bp.setFillStyle(0x44aaff,0.25));
      vt[s.key]=cur; at[s.key]=addTxt;
    });

    // 確定ボタン（閉じると横並び・左寄り）
    const okX=PX-PW/4;
    const okY=PY+PH/2-BOT_H/2-2;
    const ok=sadd(this.add.rectangle(okX,okY,160,BOT_H,0x44aaff,0.25).setStrokeStyle(2,0x44aaff).setInteractive());
    sadd(this.add.text(okX,okY,'✔ 確定して反映',{fontSize:'14px',fontFamily:'Arial',color:'#44aaff'}).setOrigin(0.5));
    ok.on('pointerover',()=>ok.setFillStyle(0x44aaff,0.5)); ok.on('pointerout',()=>ok.setFillStyle(0x44aaff,0.25));
    ok.on('pointerdown',()=>{
      let any=false;
      S.forEach(s=>{const n=stmp[s.key]||0;if(n>0){s.apply(pd,n);any=true;}stmp[s.key]=0;});
      pd.statPts=tmpPts;
      S.forEach(s=>{
        if(vt[s.key])vt[s.key].setText(svStr(s.key));
        // 確定後はコスト表示を再計算
        if(at[s.key]){
          const allocated=(pd[{atk:'strPts',mag:'intPts',mhp:'vitPts',hit:'dexPts',agi:'agiPts',luk:'lukPts'}[s.key]]||0);
          at[s.key].setText('次:'+(Math.floor(allocated/10)+2)+'pt');
        }
      });
      refreshPts(); if(any){SE('levelup');this.updateHUD();}
    });

    // ════════════════════════════════
    //  スキルタブ（＋/－仮割り振り→確定）
    // ════════════════════════════════
    const DEFS = CLASS_SKILLS;
    const defs=DEFS[pd.cls]||[];
    const skadd=(o)=>{skillCont.add(sf0(o));return o;};
    // ══════════════════════════════════════
    //  スキルタブ（全面リニューアル: 習得リスト + 6スロット装備制）
    // ══════════════════════════════════════
    // 全習得可能スキルを統一リスト化
    // 各エントリ: {key, name, desc, icon, maxLv, type, ...}
    const allSkills = [];
    // 通常スキル(クラス固有 sk1〜sk4)
    const normalIcons = {
      warrior:['🌪','🛡','⚔','🔥'], mage:['💥','❄️','⚡','☄'],
      archer:['🏹','⭐','🔫','🎯'], bomber:['💣','💥','🚀','🦾'],
      novice:['👊','✨','💫','⭐']
    }[pd.cls] || ['①','②','③','④'];
    defs.forEach((sk,i)=>{
      if(sk.locked) return;
      allSkills.push({
        key:'n'+(i+1), skId:sk.id, num:i+1,
        name:sk.name, desc:sk.desc, icon:normalIcons[i]||'?',
        maxLv:sk.maxLv||10, type:'normal',
        bookRequired:sk.bookRequired,
      });
    });
    // 覚醒スキル(全覚醒職・装備中の覚醒武器のもののみ習得可)
    const eqWm = pd.equip && pd.equip.weapon_main;
    const eqDm = eqWm ? EQUIP_DEFS[eqWm] : null;
    const curAwakKey = (eqDm && eqDm.awakening) ? eqDm.awakening : null;
    const awakIconMap={
      samurai:['🗡','🌀','👹'], heavy:['💥','🔫','❄'],
      spirit:['🍃','✨','⭐'], youma:['🕳','🌑','🐉'],
    };
    // 全覚醒職のスキルをリスト化(習得済みのもの or 現在装備中の覚醒職)
    Object.keys(AWAKENINGS).forEach(awKey=>{
      const awA = AWAKENINGS[awKey];
      if(!awA.skills) return;
      awA.skills.forEach((sk,idx)=>{
        const lv = (pd.awakSkillLv && pd.awakSkillLv[awKey] && pd.awakSkillLv[awKey]['sk'+(idx+1)]) || 0;
        // 現在装備中の覚醒職 or 既に習得済み(Lv1+)のものを表示
        const isCurrentAwak = (awKey === curAwakKey);
        if(isCurrentAwak || lv > 0){
          allSkills.push({
            key:'a_'+awKey+'_'+(idx+1), awakKey:awKey, awakIdx:idx+1,
            name:sk.name, desc:sk.desc,
            icon:(awakIconMap[awKey]||['✨','✨','✨'])[idx]||'✨',
            maxLv:10, type:'awak',
            awakJobName: awA.name,
            canLearn: isCurrentAwak, // 装備中の覚醒職のみLv上げ可能
          });
        }
      });
    });

    // skillSlots初期化(6枠)
    if(!pd.skillSlots || !Array.isArray(pd.skillSlots) || pd.skillSlots.length!==6){
      pd.skillSlots = [null,null,null,null,null,null];
    }
    // 注: 「全部 null なら自動装備で埋める」ロジックは削除済み。
    // 原因: ユーザーが全スロット外した後にも auto-fill が発火し、再描画と
    //       タイミングがズレて「画面は空・データは充填」の不整合になり、
    //       装備ボタン押下時に意図と逆の動作(隠れた装備を解除)していた。
    // 新規習得スキルの自動装備は「確定ボタン」のハンドラ側で行う。

    // ── 仮Lv管理(確定するまで反映しない) ──
    const tmpLv = {};       // 通常スキル仮Lv加算
    const tmpAwakLv = {};   // 覚醒スキル仮Lv加算
    let tmpJp = pd.jobPts||0;
    let tmpAsp = pd.awakSp||0;
    // 現在の合計Lv取得
    const getCurLv = (sk)=>{
      if(sk.type==='normal'){
        return (pd[sk.skId]||0) + (tmpLv[sk.key]||0);
      } else {
        const base = (pd.awakSkillLv && pd.awakSkillLv[sk.awakKey] && pd.awakSkillLv[sk.awakKey]['sk'+sk.awakIdx]) || 0;
        return base + (tmpAwakLv[sk.key]||0);
      }
    };

    // ── ヘッダー: ポイント表示 ──
    const hdrTxt = skadd(this.add.text(PX, ITOP+8,
      'JOBpt: '+tmpJp+'   覚醒pt: '+tmpAsp, {fontSize:'13px',fontFamily:'Arial',color:'#ffff44'}).setOrigin(0.5));
    const refreshHdr = ()=>hdrTxt.setText('JOBpt: '+tmpJp+'   覚醒pt: '+tmpAsp);

    // ── スロット表示(6枠・上部) ──
    const SLOT_TOP = ITOP + 30;
    const SLOT_SZ = Math.min(56, (PW-40)/6 - 6);
    const slotGap = 8;
    const slotsW = 6*SLOT_SZ + 5*slotGap;
    const slotStartX = PX - slotsW/2 + SLOT_SZ/2;
    skadd(this.add.text(PX, SLOT_TOP-6, '【装備スロット】タップで外す', {fontSize:'10px',fontFamily:'Arial',color:'#88aacc'}).setOrigin(0.5));
    const slotObjs = [];
    const renderSlots = ()=>{
      // 古いオブジェクトを確実に破棄(1個ごとに try/catch)
      slotObjs.forEach(o=>{
        if(!o) return;
        o.forEach(x=>{ try{ if(x && x.destroy) x.destroy(); }catch(e){} });
      });
      slotObjs.length=0;
      for(let s=0;s<6;s++){
        const sx = slotStartX + s*(SLOT_SZ+slotGap);
        const sy = SLOT_TOP + 18 + SLOT_SZ/2;
        const key = pd.skillSlots[s];
        const info = key ? this._resolveSkillKey(key) : null;
        const objs = [];
        const bg = skadd(this.add.rectangle(sx, sy, SLOT_SZ, SLOT_SZ, info?info.col:0x223344, info?0.35:0.15)
          .setStrokeStyle(2, info?info.col:0x445566, info?1:0.4).setInteractive({useHandCursor:true}));
        objs.push(bg);
        if(info){
          objs.push(skadd(this.add.text(sx, sy-6, info.icon, {fontSize:'22px'}).setOrigin(0.5)));
          const nm = info.name.length>4?info.name.substr(0,4):info.name;
          objs.push(skadd(this.add.text(sx, sy+SLOT_SZ/2-8, nm, {fontSize:'8px',fontFamily:'Arial',color:'#ffffff',stroke:'#000',strokeThickness:2}).setOrigin(0.5)));
          bg.on('pointerdown', ()=>{
            try{ bg.disableInteractive(); }catch(e){}
            try{SE('click');}catch(e){}
            pd.skillSlots[s]=null;
            this.time.delayedCall(1, ()=>{ renderSlots(); renderList(); this._rebuildSkillButtons(); });
          });
        } else {
          objs.push(skadd(this.add.text(sx, sy, (s+1)+'', {fontSize:'14px',fontFamily:'Arial',color:'#556677'}).setOrigin(0.5)));
        }
        slotObjs.push(objs);
      }
    };

    // ── 習得スキルリスト(下部・複数列レイアウト) ──
    // 列数: スキル3個ごとに1列追加(最大4列)。画面幅も考慮(セル幅<130pxにしない)
    const LIST_TOP = SLOT_TOP + 18 + SLOT_SZ + 12;
    const LIST_BOT = IBOT - 4;
    const LIST_H = LIST_BOT - LIST_TOP;
    const LIST_LEFT = PX - PW/2 + 12;
    const LIST_RIGHT = PX + PW/2 - 12;
    const LIST_W = LIST_RIGHT - LIST_LEFT;
    const minCellW = 140;
    const colsByCount = Math.min(4, Math.ceil(allSkills.length / 3));
    const colsByWidth = Math.max(1, Math.floor(LIST_W / minCellW));
    const cols = Math.max(1, Math.min(colsByCount || 1, colsByWidth));
    const rowsPerCol = Math.ceil(allSkills.length / cols);
    const colGap = 6;
    const cellW = (LIST_W - colGap*(cols-1)) / cols;
    // 列数 >=2 ならコンパクト表示(縦小さめ・desc非表示)
    const compact = cols >= 2;
    const cellH = compact
      ? Math.max(40, Math.min(56, LIST_H / Math.max(1, rowsPerCol)))
      : Math.max(56, Math.min(80, LIST_H / Math.max(1, rowsPerCol)));
    const showDesc = !compact && cellH >= 60;
    const listObjs = [];
    const renderList = ()=>{
      // 古いオブジェクトを確実に破棄(1個ごとに try/catch・古い setInteractive を確実に解除)
      listObjs.forEach(o=>{
        if(!o) return;
        o.forEach(x=>{
          try{ if(x && x.disableInteractive) x.disableInteractive(); }catch(e){}
          try{ if(x && x.destroy) x.destroy(); }catch(e){}
        });
      });
      listObjs.length=0;
      allSkills.forEach((sk,i)=>{
        // 配置: col-major(左列を rowsPerCol まで埋めてから次列)
        const col = Math.floor(i / rowsPerCol);
        const row = i % rowsPerCol;
        const cellLeft = LIST_LEFT + col*(cellW + colGap);
        const cellTop = LIST_TOP + row*cellH;
        const cellCx = cellLeft + cellW/2;
        const cellCy = cellTop + cellH/2;
        const objs = [];
        const curLv = getCurLv(sk);
        // 確定済みLv(仮Lvを含まない) — 装備可否はこちらで判定
        const confirmedLv = (sk.type==='normal') ? (pd[sk.skId]||0)
          : ((pd.awakSkillLv && pd.awakSkillLv[sk.awakKey] && pd.awakSkillLv[sk.awakKey]['sk'+sk.awakIdx]) || 0);
        const isPassive = sk.bookRequired && (sk.num===4) && (pd.cls==='archer'||pd.cls==='bomber');
        // 装備可能 = 確定済みでLv1以上(パッシブは装備不可) or 書物パッシブ習得済み
        // 覚醒スキルも個別に習得可・装備可(同じ覚醒の他スキルは無関係)
        let equippable;
        if(sk.type==='awak'){
          equippable = confirmedLv > 0;
        } else {
          equippable = (confirmedLv > 0 && !isPassive)
            || (sk.bookRequired && (sk.num===4) && !isPassive && ((pd.cls==='warrior'&&pd._hasBerserk)||(pd.cls==='mage'&&pd._hasMeteoorm)));
        }
        const inSlot = pd.skillSlots.indexOf(sk.key) >= 0;
        // 仮Lv加算量(黄緑表示の判定用)
        const tmpAdd = (sk.type==='normal') ? (tmpLv[sk.key]||0) : (tmpAwakLv[sk.key]||0);

        // セル背景(覚醒スキルは AWAKENINGS のセル色を使用、無ければデフォ赤系)
        let awBgCol = 0x2a1424, awStrokeCol = 0xff66bb, awTextCol = '#ffaadd';
        if(sk.type==='awak'){
          const awd = AWAKENINGS[sk.awakKey];
          if(awd){
            if(awd.cellBg!==undefined) awBgCol = awd.cellBg;
            if(awd.cellStroke!==undefined) awStrokeCol = awd.cellStroke;
            if(awd.cellText!==undefined) awTextCol = awd.cellText;
          }
        }
        const rowBg = skadd(this.add.rectangle(cellCx, cellCy, cellW, cellH-4, sk.type==='awak'?awBgCol:0x0a2230, inSlot?0.5:0.25).setStrokeStyle(1, sk.type==='awak'?awStrokeCol:0x2bd4bb, inSlot?1:0.4));
        objs.push(rowBg);
        // アイコン
        const iconSize = compact ? '14px' : '18px';
        objs.push(skadd(this.add.text(cellLeft + 14, cellTop + 12, sk.icon, {fontSize:iconSize}).setOrigin(0.5)));
        // 名前
        const jobTag = sk.type==='awak' ? ('['+sk.awakJobName+']') : '';
        const nameFs = compact ? '10px' : '12px';
        objs.push(skadd(this.add.text(cellLeft + 26, cellTop + 12, jobTag+sk.name, {fontSize:nameFs,fontFamily:'Arial',color: sk.type==='awak'?awTextCol:'#ffffff',fontStyle:'bold'}).setOrigin(0,0.5)));
        // Lv 表示(仮加算時は黄緑で「現→新/最大」)
        const lvText = tmpAdd > 0
          ? ('Lv '+confirmedLv+'→'+curLv+'/'+sk.maxLv)
          : ('Lv '+curLv+'/'+sk.maxLv);
        const lvColor = tmpAdd > 0 ? '#aaff66' : '#ffffff';
        const lvFs = compact ? '10px' : '13px';
        // compact 時は Lv をボタン行と同じY座標に置く(縦詰め)
        const lvY = compact ? cellTop + cellH - 12 : cellTop + 28;
        objs.push(skadd(this.add.text(cellLeft + 8, lvY, lvText, {fontSize:lvFs,fontFamily:'Arial',color: lvColor, fontStyle:'bold'}).setOrigin(0,0.5)));
        // 説明(1列モードでセルが十分大きい時のみ)
        if(showDesc){
          objs.push(skadd(this.add.text(cellLeft + 10, cellTop + 46, sk.desc||'', {fontSize:'9px',fontFamily:'Arial',color:'#99aabb'}).setOrigin(0,0.5)));
        }

        // ── ボタン群(セル右下に配置) ──
        const canLvUp = (sk.type==='normal') ? (!sk.bookRequired || equippable) : sk.canLearn;
        const btnH = compact ? 18 : 22;
        const btnY = cellTop + cellH - btnH/2 - 3;
        const EQ_W = compact ? Math.min(40, cellW * 0.26) : Math.min(50, cellW * 0.30);
        const PM_W = compact ? 22 : 24;
        const eqCx = cellLeft + cellW - EQ_W/2 - 4;
        const plusCx = eqCx - EQ_W/2 - 4 - PM_W/2;
        const minusCx = plusCx - PM_W - 2;

        // 装備ボタン(セル右下) — 確定済みで装備可能な時のみ
        if(equippable){
          const eqB = skadd(this.add.rectangle(eqCx, btnY, EQ_W, btnH, inSlot?0x3a2a0a:0x0a3a1a, 0.9).setStrokeStyle(1, inSlot?0xffaa44:0x44ff88).setInteractive({useHandCursor:true}));
          eqB._skKey = sk.key;
          eqB._skName = sk.name;
          eqB._rowIdx = i;
          eqB._inSlot = inSlot;
          const eqLblFs = compact ? '9px' : '11px';
          const eqLbl = skadd(this.add.text(eqCx, btnY, inSlot?'外す':'装備', {fontSize:eqLblFs,fontFamily:'Arial',color: inSlot?'#ffcc66':'#88ff99',fontStyle:'bold'}).setOrigin(0.5));
          objs.push(eqB); objs.push(eqLbl);
          eqB.on('pointerdown', ()=>{
            // 二重発火防止
            try{ eqB.disableInteractive(); }catch(e){}
            try{SE('click');}catch(e){}
            const myKey = eqB._skKey;
            const at = pd.skillSlots.indexOf(myKey);
            if(at>=0){
              // 既に装備中 → 外す
              pd.skillSlots[at]=null;
            } else {
              // 装備しようとしている
              // 覚醒スキル: 同じ覚醒の他スキルが既にスロットにいたら拒否
              // (1覚醒職につきスロットに入るのは1スキルのみ。切替は「外す→装備」の2段階)
              if(myKey.indexOf('a_')===0){
                const myAwKey = myKey.split('_')[1];
                const conflictIdx = pd.skillSlots.findIndex(k =>
                  k && typeof k==='string' && k!==myKey && k.indexOf('a_'+myAwKey+'_')===0
                );
                if(conflictIdx >= 0){
                  this.showFloat(this.player.x,this.player.y-60,'同じ覚醒のスキルを外してください','#ffaa44');
                  this.time.delayedCall(1, ()=>{ renderSlots(); renderList(); this._rebuildSkillButtons(); });
                  return;
                }
              }
              const empty = pd.skillSlots.indexOf(null);
              if(empty>=0){ pd.skillSlots[empty]=myKey; }
              else { this.showFloat(this.player.x,this.player.y-60,'スロットが満杯です','#ffaa44'); return; }
            }
            // ハンドラ実行中の destroy を避けるため次フレームへ遅延
            this.time.delayedCall(1, ()=>{ renderSlots(); renderList(); this._rebuildSkillButtons(); });
          });
        }
        // +/- Lvボタン(セル右下・装備ボタンの左側)
        if(canLvUp && curLv < sk.maxLv){
          const pmFs = compact ? '14px' : '16px';
          const plusB = skadd(this.add.rectangle(plusCx, btnY, PM_W, btnH, 0x113355, 0.85).setStrokeStyle(1, 0x3399ff).setInteractive({useHandCursor:true}));
          const plusLbl = skadd(this.add.text(plusCx, btnY, '+', {fontSize:pmFs,fontFamily:'Arial',color:'#66ccff',fontStyle:'bold'}).setOrigin(0.5));
          objs.push(plusB); objs.push(plusLbl);
          plusB.on('pointerdown', ()=>{
            if(sk.type==='normal'){
              if(tmpJp<=0){ this.showFloat(this.player.x,this.player.y-60,'JOBポイント不足','#ffaa44'); return; }
              tmpJp--; tmpLv[sk.key]=(tmpLv[sk.key]||0)+1;
              try{SE('click');}catch(e){}
              refreshHdr(); renderList();
            } else {
              // 覚醒スキル: 各スキル独立に習得可(同じ覚醒の他スキルとの切り替え制約なし)
              if(!sk.canLearn){ this.showFloat(this.player.x,this.player.y-60,'その覚醒武器を装備してください','#ffaa44'); return; }
              if(tmpAsp<=0){ this.showFloat(this.player.x,this.player.y-60,'覚醒ポイント不足','#ffaa44'); return; }
              tmpAsp--; tmpAwakLv[sk.key]=(tmpAwakLv[sk.key]||0)+1;
              try{SE('click');}catch(e){}
              refreshHdr(); renderList();
            }
          });
          const minusB = skadd(this.add.rectangle(minusCx, btnY, PM_W, btnH, 0x331122, 0.85).setStrokeStyle(1, 0xaa3366).setInteractive({useHandCursor:true}));
          const minusLbl = skadd(this.add.text(minusCx, btnY, '−', {fontSize:pmFs,fontFamily:'Arial',color:'#ff6699',fontStyle:'bold'}).setOrigin(0.5));
          objs.push(minusB); objs.push(minusLbl);
          minusB.on('pointerdown', ()=>{
            if(sk.type==='normal'){
              if((tmpLv[sk.key]||0)<=0) return;
              tmpLv[sk.key]--; tmpJp++;
            } else {
              if((tmpAwakLv[sk.key]||0)<=0) return;
              tmpAwakLv[sk.key]--; tmpAsp++;
            }
            try{SE('click');}catch(e){}
            refreshHdr(); renderList();
          });
        }
        listObjs.push(objs);
      });
    };
    renderSlots();
    renderList();

    // 確定ボタン
    const skOkX=PX-PW/4, skOkY=PY+PH/2-BOT_H/2-2;
    const skOk=skadd(this.add.rectangle(skOkX,skOkY,160,BOT_H,0x00e5ff,0.22).setStrokeStyle(2,0x00e5ff).setInteractive({useHandCursor:true}));
    skadd(this.add.text(skOkX,skOkY,'✔ 確定',{fontSize:'14px',fontFamily:'Arial',color:'#00e5ff'}).setOrigin(0.5));
    skOk.on('pointerover',()=>skOk.setFillStyle(0x00e5ff,0.5)); skOk.on('pointerout',()=>skOk.setFillStyle(0x00e5ff,0.22));
    skOk.on('pointerdown',()=>{
      let any=false;
      // 通常スキル仮Lvを確定
      Object.keys(tmpLv).forEach(key=>{
        const add=tmpLv[key]||0; if(add<=0)return;
        const sk=allSkills.find(s=>s.key===key); if(!sk)return;
        const wasLvZero=(pd[sk.skId]||0)===0;
        pd[sk.skId]=(pd[sk.skId]||0)+add; any=true;
        // 新規習得 → 空きスロットがあれば自動装備(便利機能)
        if(wasLvZero && !pd.skillSlots.includes(sk.key)){
          const empty=pd.skillSlots.indexOf(null);
          if(empty>=0) pd.skillSlots[empty]=sk.key;
        }
      });
      // 覚醒スキル仮Lvを確定
      Object.keys(tmpAwakLv).forEach(key=>{
        const add=tmpAwakLv[key]||0; if(add<=0)return;
        const sk=allSkills.find(s=>s.key===key); if(!sk)return;
        if(!pd.awakSkillLv) pd.awakSkillLv={};
        if(!pd.awakSkillLv[sk.awakKey]) pd.awakSkillLv[sk.awakKey]={sk1:0,sk2:0,sk3:0};
        pd.awakSkillLv[sk.awakKey]['sk'+sk.awakIdx]=(pd.awakSkillLv[sk.awakKey]['sk'+sk.awakIdx]||0)+add; any=true;
      });
      pd.jobPts=tmpJp; pd.awakSp=tmpAsp;
      if(any){ SE('levelup'); }
      this.updateHUD(); this._rebuildSkillButtons();
      // 仮Lvリセット&リスト再描画
      Object.keys(tmpLv).forEach(k=>delete tmpLv[k]);
      Object.keys(tmpAwakLv).forEach(k=>delete tmpAwakLv[k]);
      // _rebuildSkillButtons 内の auto-fill で pd.skillSlots が変わる可能性があるので
      // スロット表示も必ず再描画する
      refreshHdr(); renderSlots(); renderList();
    });
    this._awakSkillDistribute = null;
    // ════════════════════════════════
    //  装備タブ
    // ════════════════════════════════
    const eqadd=(o)=>{equipCont.add(sf0(o));return o;};
    const equipStats=calcEquipStats(pd.equip);

    // 装備合計ステータス表示（上部・1行）
    eqadd(this.add.text(PX,ITOP+12,'🛡 装備中のステータスボーナス',{fontSize:'13px',fontFamily:'Arial',color:'#e74c3c'}).setOrigin(0.5));
    const statKeys=[['atk','ATK'],['def','DEF'],['mag','MAG'],['mhp','HP'],['msp','SP'],['hit','HIT'],['luk','LUK'],['agi','回避']];
    const bonusStr=statKeys.filter(([k])=>equipStats[k]>0).map(([k,l])=>l+'+'+equipStats[k]).join('  ')||'なし';
    eqadd(this.add.text(PX,ITOP+28,bonusStr,{fontSize:'11px',fontFamily:'Arial',color:'#aaddcc'}).setOrigin(0.5));

    // ── 2カラム構成 ──
    // 左：装備中スロット6個（縦並び）／右：所持装備一覧（縦スクロール）
    const COL_TOP=ITOP+46;
    const COL_BOT=IBOT-6;
    const COL_H=COL_BOT-COL_TOP;
    const GAP=8;
    const LCOL_X=L, LCOL_W=(PW-24)/2-GAP/2;
    const RCOL_X=PX+GAP/2, RCOL_W=(PW-24)/2-GAP/2;

    // 見出し
    eqadd(this.add.text(LCOL_X+LCOL_W/2,COL_TOP-6,'★ 装備中',{fontSize:'12px',fontFamily:'Arial',color:'#e74c3c',fontStyle:'bold'}).setOrigin(0.5,1));
    eqadd(this.add.text(RCOL_X+RCOL_W/2,COL_TOP-6,'所持装備（タップで装備）',{fontSize:'12px',fontFamily:'Arial',color:'#88aacc',fontStyle:'bold'}).setOrigin(0.5,1));

    // ══ 左カラム：装備中6スロット（縦並び） ══
    const SLOT_H=Math.floor(COL_H/EQUIP_SLOTS.length);
    EQUIP_SLOTS.forEach((slot,i)=>{
      const cy=COL_TOP+i*SLOT_H+SLOT_H/2;
      const equipped=pd.equip[slot.id];
      const eDef=equipped?EQUIP_DEFS[equipped]:null;
      const bgCol=eDef?0x1a2a3a:0x0a0d18;
      const strokeCol=eDef?0xe74c3c:0x334455;

      // スロット背景
      eqadd(this.add.rectangle(LCOL_X+LCOL_W/2,cy,LCOL_W-2,SLOT_H-4,bgCol,0.85).setStrokeStyle(eDef?2:1,strokeCol));

      // 部位アイコン（左端・大きく）
      eqadd(this.add.text(LCOL_X+14,cy,slot.icon,{fontSize:'20px'}).setOrigin(0.5));
      // 部位名（小さく上に）
      eqadd(this.add.text(LCOL_X+30,cy-SLOT_H*0.22,slot.label,{
        fontSize:'11px',fontFamily:'Arial',color:eDef?'#e74c3c':'#667788',fontStyle:'bold'
      }).setOrigin(0,0.5));

      if(eDef){
        // 装備品名
        eqadd(this.add.text(LCOL_X+30,cy+SLOT_H*0.04,eDef.icon+' '+eDef.name,{
          fontSize:'12px',fontFamily:'Arial',
          color:'#'+eDef.col.toString(16).padStart(6,'0'),fontStyle:'bold'
        }).setOrigin(0,0.5));
        // ステータス
        const statStr=Object.entries(eDef.stats).map(([k,v])=>k.toUpperCase()+'+'+v).join(' ');
        eqadd(this.add.text(LCOL_X+30,cy+SLOT_H*0.30,statStr,{
          fontSize:'10px',fontFamily:'Arial',color:'#88bbaa'
        }).setOrigin(0,0.5));
        // 外すボタン（右端）
        const btnW=38, btnX=LCOL_X+LCOL_W-btnW/2-6;
        const removeBtn=eqadd(this.add.rectangle(btnX,cy,btnW,SLOT_H-12,0x551111,0.85).setStrokeStyle(1,0xaa3333).setInteractive({useHandCursor:true}));
        eqadd(this.add.text(btnX,cy,'外す',{fontSize:'11px',fontFamily:'Arial',color:'#e74c3c'}).setOrigin(0.5));
        removeBtn.on('pointerover',()=>removeBtn.setFillStyle(0x882222,0.95));
        removeBtn.on('pointerout', ()=>removeBtn.setFillStyle(0x551111,0.85));
        removeBtn.on('pointerdown',()=>{
          pd.equip[slot.id]=null;
          SE('click');
          // 装備変更直後に覚醒ボタンの表示状態を更新
          if(this._updateAwakeningButton) this._updateAwakeningButton();
          this._skipCloseSE=true;
          this._skipOpenSE=true;
          this._closeMenu();
          this.openMenu('equip');
        });
      }else{
        eqadd(this.add.text(LCOL_X+30,cy+SLOT_H*0.10,'── 未装備 ──',{
          fontSize:'11px',fontFamily:'Arial',color:'#334455'
        }).setOrigin(0,0.5));
      }
    });

    // ══ 右カラム：所持装備一覧（縦スクロール） ══
    const ownedEquips=Object.keys(pd.items||{}).filter(k=>EQUIP_DEFS[k]&&(pd.items[k]||0)>0);

    // 右カラム枠
    eqadd(this.add.rectangle(RCOL_X+RCOL_W/2,COL_TOP+COL_H/2,RCOL_W,COL_H,0x05080f,0.5).setStrokeStyle(1,0x223344));

    if(ownedEquips.length===0){
      eqadd(this.add.text(RCOL_X+RCOL_W/2,COL_TOP+COL_H/2,'装備品を持っていません\n（鍛冶屋で製作できます）',{fontSize:'11px',fontFamily:'Arial',color:'#445566',align:'center'}).setOrigin(0.5));
    }else{
      // スクロール対応：表示領域でクリッピング
      const ROW_H=44;
      const scrollH=COL_H-8;
      const maxRows=Math.floor(scrollH/ROW_H);
      const totalRows=ownedEquips.length;
      let invScroll=0;
      const invObjs=[];
      const invAdd=(o)=>{invObjs.push(o);return eqadd(o);};

      const renderInv=()=>{
        invObjs.forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
        invObjs.length=0;
        ownedEquips.slice(invScroll,invScroll+maxRows).forEach((id,i)=>{
          const def=EQUIP_DEFS[id];
          const slotMeta=EQUIP_SLOTS.find(s=>s.id===def.slot);
          const ry=COL_TOP+4+i*ROW_H+ROW_H/2;
          const isEquipped=pd.equip[def.slot]===id;
          const bgCol=isEquipped?0x1a3a1a:0x0a1525;
          const strokeCol=isEquipped?0x44aa44:0x334455;

          // 行背景
          const ibg=invAdd(this.add.rectangle(RCOL_X+RCOL_W/2,ry,RCOL_W-6,ROW_H-4,bgCol,0.85).setStrokeStyle(1,strokeCol));

          // 部位タグ（左上・小さなバッジ）
          const tagW=38, tagX=RCOL_X+4+tagW/2;
          invAdd(this.add.rectangle(tagX,ry-ROW_H*0.22,tagW,14,0x223344,0.95).setStrokeStyle(1,0x556677));
          invAdd(this.add.text(tagX,ry-ROW_H*0.22,(slotMeta?slotMeta.icon:'')+' '+(slotMeta?slotMeta.label:''),{
            fontSize:'9px',fontFamily:'Arial',color:'#aaccee'
          }).setOrigin(0.5));

          // アイテム名
          invAdd(this.add.text(RCOL_X+6,ry+ROW_H*0.10,def.icon+' '+def.name,{
            fontSize:'12px',fontFamily:'Arial',
            color:'#'+def.col.toString(16).padStart(6,'0'),fontStyle:'bold'
          }).setOrigin(0,0.5));
          // ステータス
          const ss=Object.entries(def.stats).map(([k,v])=>k.toUpperCase()+'+'+v).join(' ');
          invAdd(this.add.text(RCOL_X+6,ry+ROW_H*0.34,ss,{
            fontSize:'10px',fontFamily:'Arial',color:'#88bbaa'
          }).setOrigin(0,0.5));

          // 装備不可判定: classOnly があり該当クラスでない場合
          const cantEquip=(def.classOnly && def.classOnly!==pd.cls);

          // 装備ボタン（右端）
          const btnW=44, btnX=RCOL_X+RCOL_W-btnW/2-6;
          if(isEquipped){
            invAdd(this.add.rectangle(btnX,ry,btnW,ROW_H-12,0x113311,0.85).setStrokeStyle(1,0x44aa44));
            invAdd(this.add.text(btnX,ry,'装備中',{fontSize:'10px',fontFamily:'Arial',color:'#44aa44'}).setOrigin(0.5));
          }else if(cantEquip){
            invAdd(this.add.rectangle(btnX,ry,btnW,ROW_H-12,0x331111,0.7).setStrokeStyle(1,0x553333));
            invAdd(this.add.text(btnX,ry,'不可',{fontSize:'10px',fontFamily:'Arial',color:'#aa6666'}).setOrigin(0.5));
          }else{
            const eqBtn=invAdd(this.add.rectangle(btnX,ry,btnW,ROW_H-12,0x113355,0.85).setStrokeStyle(1,0x4488cc).setInteractive({useHandCursor:true}));
            invAdd(this.add.text(btnX,ry,'装備',{fontSize:'11px',fontFamily:'Arial',color:'#88ccff',fontStyle:'bold'}).setOrigin(0.5));
            eqBtn.on('pointerover',()=>eqBtn.setFillStyle(0x224477,0.95));
            eqBtn.on('pointerout', ()=>eqBtn.setFillStyle(0x113355,0.85));
            eqBtn.on('pointerdown',()=>{
              pd.equip[def.slot]=id;
              // 両手武器(twoHand)を右手に装備したら、左手を強制的に外す
              if(def.slot==='weapon_main' && def.twoHand){
                pd.equip.weapon_off=null;
              }
              // 左手を装備しようとした時、右手が両手武器なら拒否(本来cantEquipで弾くべき)
              if(def.slot==='weapon_off' && pd.equip.weapon_main){
                const mainDef=EQUIP_DEFS[pd.equip.weapon_main];
                if(mainDef && mainDef.twoHand){
                  pd.equip.weapon_off=null;
                  this.showFloat(this.scale.width/2, this.scale.height/2, '両手武器装備中は左手は装備できません', '#ff8888', 'info');
                }
              }
              SE('click');
              // 装備変更直後に覚醒ボタンの表示状態を更新
              if(this._updateAwakeningButton) this._updateAwakeningButton();
              this._skipCloseSE=true;
              this._skipOpenSE=true;
              this._closeMenu();
              this.openMenu('equip');
            });
          }
        });
        // スクロールインジケーター
        if(totalRows>maxRows){
          const shown=Math.min(invScroll+maxRows,totalRows);
          invAdd(this.add.text(RCOL_X+RCOL_W-6,COL_TOP+COL_H-2,(invScroll+1)+'〜'+shown+' / '+totalRows,{fontSize:'9px',fontFamily:'Arial',color:'#556677'}).setOrigin(1,1));
        }
      };

      // スワイプ&ホイールスクロール
      let invSwipeY=null, invSwipeBase=null;
      const invZone=eqadd(this.add.rectangle(RCOL_X+RCOL_W/2,COL_TOP+COL_H/2,RCOL_W-2,COL_H-2,0x000000,0).setInteractive());
      const doInvScroll=(v)=>{
        const c=Math.max(0,Math.min(totalRows-maxRows,v));
        if(c!==invScroll){invScroll=c;renderInv();}
      };
      invZone.on('wheel',(_p,_dx,dy)=>{doInvScroll(invScroll+(dy>0?1:-1));});
      invZone.on('pointerdown',(ptr)=>{invSwipeY=ptr.y;invSwipeBase=invScroll;});
      invZone.on('pointermove',(ptr)=>{
        if(invSwipeY===null)return;
        const dy=invSwipeY-ptr.y;
        doInvScroll(Math.round(invSwipeBase+dy/(ROW_H*0.7)));
      });
      invZone.on('pointerup',()=>{invSwipeY=null;});
      invZone.on('pointerout',()=>{invSwipeY=null;});

      renderInv();
    }

    // ════════════════════════════════
    //  アイテムタブ
    // ════════════════════════════════
    const iadd=(o)=>{o.setScrollFactor(0);itemCont.add(o);return o;};
    if(!pd.items)pd.items={};
    console.log('[ITEM TAB] pd.items=',JSON.stringify(pd.items));
    // タイトル
    iadd(this.add.text(PX,ITOP+14,'🎒 所持アイテム',{fontSize:'16px',fontFamily:'Arial',color:'#f39c12'}).setOrigin(0.5));
    const itemTypes=Object.keys(pd.items||{}).filter(k=>(pd.items[k]||0)>0);
    const typeCount=itemTypes.length;
    iadd(this.add.text(PX,ITOP+32,'種類: '+typeCount+'/'+MAX_ITEM_TYPES,{fontSize:'12px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5));

    // アイテム一覧（グリッド表示）
    try{
    const ITEM_COLS=4;
    const ITEM_CW=(PW-20)/ITEM_COLS;
    const ITEM_CH=58;
    const gridTop=ITOP+46;
    const ITEM_BOT=PY+PH/2-44;

    // 全ITEM_DEFSを表示（所持中は明るく・未所持は暗く）
    const allItemIds=Object.keys(ITEM_DEFS);
    let irow=0,icol=0;
    allItemIds.forEach((id)=>{
      const def=ITEM_DEFS[id];
      if(!def)return;
      const count=(pd.items||{})[id]||0;
      const cx=L+icol*ITEM_CW+ITEM_CW/2;
      const cy=gridTop+irow*ITEM_CH+ITEM_CH/2;
      if(cy+ITEM_CH/2>ITEM_BOT)return;

      const hasItem=count>0;
      const bgCol=hasItem?def.col:0x1a1a2e;
      const strokeCol=hasItem?def.col:0x334455;
      const bgAlpha=hasItem?0.25:0.4;

      // セル背景
      const bg=iadd(this.add.rectangle(cx,cy,ITEM_CW-4,ITEM_CH-4,bgCol,bgAlpha).setStrokeStyle(1,strokeCol,hasItem?0.9:0.3));
      // アイコン
      iadd(this.add.text(cx,cy-ITEM_CH*0.28,def.icon,{fontSize:'20px'}).setOrigin(0.5));
      // アイテム名
      iadd(this.add.text(cx,cy+ITEM_CH*0.04,def.name,{
        fontSize:'10px',fontFamily:'Arial',
        color:hasItem?'#ffffff':'#445566',
        wordWrap:{width:ITEM_CW-6}
      }).setOrigin(0.5));
      // 個数バッジ
      if(hasItem){
        iadd(this.add.text(cx+ITEM_CW/2-4,cy-ITEM_CH/2+4,'×'+count,{
          fontSize:'11px',fontFamily:'Arial',color:'#ffd700',
          stroke:'#000000',strokeThickness:3
        }).setOrigin(1,0));
        // 使用ボタン or 売価
        if(def.usable){
          const useBtn=iadd(this.add.rectangle(cx,cy+ITEM_CH*0.36,ITEM_CW-10,16,0x226622,0.9).setStrokeStyle(1,0x44aa44).setInteractive({useHandCursor:true}));
          iadd(this.add.text(cx,cy+ITEM_CH*0.36,'▶ 使う',{fontSize:'10px',fontFamily:'Arial',color:'#44ff88'}).setOrigin(0.5));
          useBtn.on('pointerover',()=>useBtn.setFillStyle(0x336633,0.95));
          useBtn.on('pointerout', ()=>useBtn.setFillStyle(0x226622,0.9));
          useBtn.on('pointerdown',()=>{SE('click');this._useItem(id);});
        } else if(def.sell>0){
          iadd(this.add.text(cx,cy+ITEM_CH*0.38,def.sell+'G',{
            fontSize:'10px',fontFamily:'Arial',color:'#aaddaa'
          }).setOrigin(0.5));
        }
      } else {
        if(def.sell>0){
          iadd(this.add.text(cx,cy+ITEM_CH*0.38,def.sell+'G',{
            fontSize:'10px',fontFamily:'Arial',color:'#334455'
          }).setOrigin(0.5));
        }
      }
      icol++;
      if(icol>=ITEM_COLS){icol=0;irow++;}
    });
    }catch(e){console.error('item tab error:',e.message,e.stack);}

    try{switchTab(tab||'stat');}catch(e){console.error('switchTab error:',e);}
  }

  // 装備ボーナスを実ステータスに反映（装備変更時に呼ぶ）
  _refreshSkillButtons(){
    // スキルボタンを再生成（書物習得後に呼ぶ）
    if(this.skillBtnRefs){
      this.skillBtnRefs.forEach(ref=>{
        try{if(ref.btn&&ref.btn.active)ref.btn.destroy();}catch(e){}
        try{if(ref.nameTxt&&ref.nameTxt.active)ref.nameTxt.destroy();}catch(e){}
        try{if(ref.lvTxt&&ref.lvTxt.active)ref.lvTxt.destroy();}catch(e){}
      });
    }
    if(this.skillCDOverlays){
      this.skillCDOverlays.forEach(o=>{
        try{if(o.ov&&o.ov.active)o.ov.destroy();}catch(e){}
        try{if(o.ct&&o.ct.active)o.ct.destroy();}catch(e){}
      });
    }
    this.createSkillButtons();
  }

  _applyEquipStats(){
    const pd=this.playerData;
    // 基礎値は装備なしの状態で保持されているので、
    // HUD表示のmhp/mspは基礎値+装備ボーナスとして計算
    // ※現時点では装備は参照のみ（EQUIP_DEFSから戦闘時に加算）
    this.updateHUD();
    // 覚醒可能武器の装備状況を反映
    if(this._updateAwakeningButton) this._updateAwakeningButton();
  }

  _closeMenu(){
    if(!this._menuOpen)return;
    this._menuOpen=false;
    // 装備変更などで「閉じてすぐ開く」場合は閉じる音を鳴らさない
    if(!this._skipCloseSE) SE('close');
    this._skipCloseSE=false;
    if(this._menuRoot){this._menuRoot.destroy(true);this._menuRoot=null;}
    if(this._menuEscKey){this._menuEscKey.destroy();this._menuEscKey=null;}
    this.physics.resume();
    this.updateHUD();
    this._updateMenuBadge();
    // メニュー閉じる時も覚醒ボタン状態を更新(装備変更等への保険)
    if(this._updateAwakeningButton) this._updateAwakeningButton();
  }
  // ── NPC会話ダイアログ ──
  // ─────────────────────────────────────────
  // テストモード専用 NPC(セントラルに出現・経験値/JOBEXP/覚醒pt 付与)
  // ─────────────────────────────────────────
  _spawnTestNpc(){
    // 注: 以前は this._testNpcSpawned フラグで二重スポーン防止していたが、
    //     Phaser のシーン再利用でフラグが残り、転職復帰時にスポーンされない
    //     バグになっていたため削除。create() は1シーン起動につき1回しか呼ばれ
    //     ないので、ここに到達した時点で常にスポーンしてよい。
    const x = 808, y = 377;  // セントラル上部・宿屋とギルドの間の道沿い
    const sprite = this.add.sprite(x, y, 'npc_test').setDepth(5).setDisplaySize(96, 96);
    sprite.setInteractive({useHandCursor:true});
    // 浮遊アニメ(ふわふわ)で目立たせる
    this.tweens.add({targets:sprite, y:y-6, duration:1000, yoyo:true, repeat:-1, ease:'Sine.easeInOut'});
    const nameTag = this.add.text(x, y-60, '🧪 テスト助手', {
      fontSize:'13px', fontFamily:'Arial', color:'#88ffaa', fontStyle:'bold',
      stroke:'#000', strokeThickness:3
    }).setOrigin(0.5).setDepth(6);
    const promptTxt = this.add.text(x, y+60, '💬 タップで話す', {
      fontSize:'12px', fontFamily:'Arial', color:'#ffff88', fontStyle:'bold',
      stroke:'#000', strokeThickness:3
    }).setOrigin(0.5).setDepth(6).setVisible(false);
    this.tweens.add({targets:promptTxt, alpha:0.6, duration:600, yoyo:true, repeat:-1});
    sprite.on('pointerdown', ()=>{
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y);
      if(dist < 120) this._openTestNpcDialog();
    });
    this.npcs.push({def:{id:'test_npc', x, y, name:'🧪 テスト助手'}, sprite, nameTag, promptTxt});
  }

  _openTestNpcDialog(){
    if(this._npcDialogOpen) return;
    this._npcDialogOpen = true;
    try{SE('open');}catch(e){}
    if(this.player && this.player.body) this.player.body.setVelocity(0,0);
    const w = this.scale.width, h = this.scale.height;
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(100).setInteractive();
    const boxW = Math.min(w*0.85, 540), boxH = 280;
    const boxX = w/2, boxY = h - boxH/2 - 30;
    const box = this.add.rectangle(boxX, boxY, boxW, boxH, 0x0a1a14, 0.96)
      .setScrollFactor(0).setDepth(101)
      .setStrokeStyle(3, 0x88ffaa, 1);
    const elements = [overlay, box];
    elements.push(this.add.text(boxX, boxY - boxH/2 + 22, '🧪 テスト助手', {
      fontSize:'16px', fontFamily:'Arial', color:'#88ffaa', fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102));
    elements.push(this.add.text(boxX, boxY - boxH/2 + 50, '何を付与しますか?', {
      fontSize:'13px', fontFamily:'Arial', color:'#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(102));

    const pd = this.playerData;
    const p = this.player;
    // ボタン定義: ラベル / 色 / 動作
    const btnDefs = [
      {label:'⭐ 経験値 +500',     col:0x4488ff, action:()=>{
        pd.exp = (pd.exp||0) + 500;
        this.checkLevelUp();
        this.showFloat(p.x, p.y-50, '+500 EXP', '#88ccff', 'info');
        this.updateHUD();
      }},
      {label:'💼 JOB経験値 +300',  col:0xff8844, action:()=>{
        this.addJobExp(300);
        this.showFloat(p.x, p.y-50, '+300 JOB EXP', '#ffaa66', 'info');
        this.updateHUD();              // JB バー再描画
        if(this._updateMenuBadge) this._updateMenuBadge();  // pt 増加バッジ
      }},
      {label:'✨ 覚醒ポイント +5', col:0xaa66ff, action:()=>{
        pd.awakSp = (pd.awakSp||0) + 5;
        pd._awakSpEarned = (pd._awakSpEarned||0) + 5;
        this.showFloat(p.x, p.y-50, '+5 覚醒ポイント', '#cc99ff', 'info');
        // 覚醒ボタン横の「✨Npt」表示を即更新
        if(this._updateAwakeningButton) this._updateAwakeningButton();
      }},
    ];
    const btnW = boxW - 60, btnH = 40, gap = 8;
    const startY = boxY - boxH/2 + 86;
    btnDefs.forEach((bd, i)=>{
      const by = startY + i*(btnH + gap);
      const bg = this.add.rectangle(boxX, by, btnW, btnH, bd.col, 0.95)
        .setScrollFactor(0).setDepth(102)
        .setStrokeStyle(2, 0xffffff, 0.8)
        .setInteractive({useHandCursor:true});
      const tx = this.add.text(boxX, by, bd.label, {
        fontSize:'14px', fontFamily:'Arial', color:'#ffffff', fontStyle:'bold'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
      bg.on('pointerover', ()=>bg.setFillStyle(bd.col, 1.0));
      bg.on('pointerout',  ()=>bg.setFillStyle(bd.col, 0.95));
      bg.on('pointerdown', ()=>{
        try{SE('click');}catch(e){}
        try{ bd.action(); }catch(e){ console.warn('test npc action error:', e); }
      });
      elements.push(bg, tx);
    });
    // 閉じるボタン
    const closeY = boxY + boxH/2 - 24;
    const closeBg = this.add.rectangle(boxX, closeY, 160, 32, 0x223344, 0.95)
      .setScrollFactor(0).setDepth(102)
      .setStrokeStyle(2, 0x88aacc, 0.8)
      .setInteractive({useHandCursor:true});
    const closeTx = this.add.text(boxX, closeY, '✕ 閉じる', {
      fontSize:'13px', fontFamily:'Arial', color:'#ffffff', fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(103);
    closeBg.on('pointerdown', ()=>{
      try{SE('click');}catch(e){}
      this._closeNpcDialog(elements.concat([closeBg, closeTx]));
    });
    overlay.on('pointerdown', ()=>{
      try{SE('click');}catch(e){}
      this._closeNpcDialog(elements.concat([closeBg, closeTx]));
    });
  }

  _openNpcDialog(npcDef){
    if(this._npcDialogOpen) return;
    this._npcDialogOpen = true;
    SE('open');
    // プレイヤー停止
    if(this.player && this.player.body) this.player.body.setVelocity(0,0);
    const w = this.scale.width, h = this.scale.height;
    // 半透明オーバーレイ
    const overlay = this.add.rectangle(w/2, h/2, w, h, 0x000000, 0.5).setScrollFactor(0).setDepth(100);
    overlay.setInteractive();
    // ダイアログボックス本体
    const boxW = Math.min(w * 0.85, 540);
    const boxH = 220;
    const boxX = w/2, boxY = h - boxH/2 - 30;
    const box = this.add.rectangle(boxX, boxY, boxW, boxH, 0x1a1a2e, 0.95)
      .setScrollFactor(0).setDepth(101)
      .setStrokeStyle(3, 0xffd700, 1);
    // NPC名表示
    const nameLabel = this.add.text(boxX - boxW/2 + 20, boxY - boxH/2 + 12,
      '👤 ' + npcDef.name,
      {fontSize:'15px', fontFamily:'Arial', color:'#ffd700', fontStyle:'bold'}
    ).setOrigin(0, 0).setScrollFactor(0).setDepth(102);
    // 会話テキスト(ページ管理)
    const dialogList = npcDef.dialog.map(line=>
      line.replace('{price}', npcDef.price||0)
    );
    let pageIdx = 0;
    const dialogTxt = this.add.text(boxX, boxY - 10,
      dialogList[pageIdx],
      {fontSize:'14px', fontFamily:'Arial', color:'#ffffff',
       wordWrap:{width: boxW - 40}, align:'center'}
    ).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    // 「タップして続行」アイコン
    const nextHint = this.add.text(boxX, boxY + boxH/2 - 20,
      '▼ タップで続く',
      {fontSize:'11px', fontFamily:'Arial', color:'#88ccff'}
    ).setOrigin(0.5).setScrollFactor(0).setDepth(102);
    this.tweens.add({targets:nextHint, alpha:0.4, duration:600, yoyo:true, repeat:-1});
    // 選択肢ボタン用(最後のページで表示)
    let yesBtn = null, noBtn = null;
    const showChoiceButtons = ()=>{
      if(yesBtn) return;
      nextHint.setVisible(false);
      const cy = boxY + boxH/2 - 28;
      // ── 会話のみNPC(ferryでない): 「閉じる」だけ ──
      if(npcDef.type !== 'ferry'){
        const closeBtn = this.add.rectangle(boxX, cy, 180, 36, 0x223344, 0.95)
          .setScrollFactor(0).setDepth(103).setStrokeStyle(2, 0x88aacc, 0.8)
          .setInteractive({useHandCursor:true});
        const closeTxt = this.add.text(boxX, cy, '✕ 話を終える',
          {fontSize:'14px', fontFamily:'Arial', color:'#ffffff', fontStyle:'bold'}
        ).setOrigin(0.5).setScrollFactor(0).setDepth(104);
        closeBtn.on('pointerdown', ()=>{
          SE('click');
          this._closeNpcDialog([overlay, box, nameLabel, dialogTxt, nextHint, closeBtn, closeTxt]);
        });
        yesBtn = closeBtn;  // 二重表示防止フラグ用
        return;
      }
      // ── ferry NPC: YES/NO選択肢 ──
      // YESボタン
      yesBtn = this.add.rectangle(boxX - 90, cy, 140, 36, 0x2ecc71, 0.95)
        .setScrollFactor(0).setDepth(103).setStrokeStyle(2, 0xffffff, 0.8)
        .setInteractive({useHandCursor:true});
      const yesTxt = this.add.text(boxX - 90, cy, '⛵ 乗る (' + (npcDef.price||0) + 'G)',
        {fontSize:'13px', fontFamily:'Arial', color:'#ffffff', fontStyle:'bold'}
      ).setOrigin(0.5).setScrollFactor(0).setDepth(104);
      // NOボタン
      noBtn = this.add.rectangle(boxX + 90, cy, 140, 36, 0xe74c3c, 0.95)
        .setScrollFactor(0).setDepth(103).setStrokeStyle(2, 0xffffff, 0.8)
        .setInteractive({useHandCursor:true});
      const noTxt = this.add.text(boxX + 90, cy, '❌ やめる',
        {fontSize:'13px', fontFamily:'Arial', color:'#ffffff', fontStyle:'bold'}
      ).setOrigin(0.5).setScrollFactor(0).setDepth(104);
      // YES押下: 船賃支払って移動
      yesBtn.on('pointerdown', ()=>{
        SE('click');
        const pd = this.playerData;
        const price = npcDef.price || 0;
        if(pd.gold < price){
          // 所持金不足
          dialogTxt.setText('お金が足りないようじゃな...\n('+price+'G必要)');
          yesBtn.destroy(); yesTxt.destroy();
          noBtn.destroy(); noTxt.destroy();
          yesBtn = null;
          // 1.5秒後にダイアログを閉じる
          this.time.delayedCall(1800, ()=>{
            this._closeNpcDialog([overlay, box, nameLabel, dialogTxt, nextHint]);
          });
          return;
        }
        if(!npcDef.destStage){
          // 移動先未設定
          dialogTxt.setText('まだ船を出せる場所がないようじゃ...\n(行き先未定)');
          yesBtn.destroy(); yesTxt.destroy();
          noBtn.destroy(); noTxt.destroy();
          yesBtn = null;
          this.time.delayedCall(1800, ()=>{
            this._closeNpcDialog([overlay, box, nameLabel, dialogTxt, nextHint]);
          });
          return;
        }
        // 支払い + 移動
        pd.gold -= price;
        this.updateHUD();
        SE('coin');
        dialogTxt.setText('よっしゃ!出航じゃ!⛵\n('+npcDef.destLabel+'へ向かう)');
        yesBtn.destroy(); yesTxt.destroy();
        noBtn.destroy(); noTxt.destroy();
        // 1.5秒後にダイアログを閉じて遷移
        this.time.delayedCall(1500, ()=>{
          this._closeNpcDialog([overlay, box, nameLabel, dialogTxt, nextHint]);
          // ステージ遷移 (destX/destY が指定されていればカスタムスポーン位置として渡す)
          const transData={playerData:pd, stage:npcDef.destStage, fromPortal:'back'};
          if(npcDef.destX!==undefined && npcDef.destY!==undefined){
            transData.customSpawnX=npcDef.destX;
            transData.customSpawnY=npcDef.destY;
          }
          this._doTransition('Game',transData);
        });
      });
      // NO押下: ダイアログを閉じる
      noBtn.on('pointerdown', ()=>{
        SE('click');
        this._closeNpcDialog([overlay, box, nameLabel, dialogTxt, nextHint, yesBtn, yesTxt, noBtn, noTxt]);
      });
    };
    // タップ進行ハンドラ(オーバーレイ全体)
    overlay.on('pointerdown', ()=>{
      if(yesBtn) return;  // 選択肢中はタップ無効
      pageIdx++;
      if(pageIdx < dialogList.length){
        dialogTxt.setText(dialogList[pageIdx]);
        SE('click');
        // 最後のページなら選択肢を表示
        if(pageIdx === dialogList.length - 1){
          this.time.delayedCall(300, showChoiceButtons);
        }
      }
    });
    // 1ページ目から1行しかない場合、すぐ選択肢
    if(dialogList.length === 1){
      this.time.delayedCall(500, showChoiceButtons);
    }
  }
  _closeNpcDialog(items){
    items.forEach(it=>{ try{ it.destroy(); }catch(e){} });
    this._npcDialogOpen = false;
    SE('close');
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
    const BW=180, BAR_H=13;  // createHUD と必ず合わせる
    const hp=Math.max(0,pd.hp),sp=Math.max(0,pd.sp);
    const hpP=hp/pd.mhp,spP=sp/pd.msp;
    // HP（色変化あり）
    if(this.hudHPBar&&this.hudHPBar.active)this.hudHPBar.setSize(BW*hpP,BAR_H).setFillStyle(hpP>0.5?0x2ecc71:hpP>0.25?0xf39c12:0xe74c3c);
    if(this.hudSPBar&&this.hudSPBar.active)this.hudSPBar.setSize(BW*spP,BAR_H);
    const expP=Math.min(1,pd.exp/pd.expNext);
    if(this.hudEXPBar&&this.hudEXPBar.active)this.hudEXPBar.setSize(BW*expP,BAR_H);
    const jexpP=Math.min(1,(pd.jobExp||0)/(pd.jobExpNext||80));
    if(this.hudJEXPBar&&this.hudJEXPBar.active)this.hudJEXPBar.setSize(BW*jexpP,BAR_H);
    if(this.hudLvTxt&&this.hudLvTxt.active)this.hudLvTxt.setText('Lv'+pd.lv+'  JLv'+(pd.jobLv||1)+'  💰'+pd.gold+'G');
    // 現在座標表示
    if(this.hudCoordTxt&&this.hudCoordTxt.active && this.player){
      this.hudCoordTxt.setText('X:'+Math.floor(this.player.x)+' Y:'+Math.floor(this.player.y));
    }
    // スキルボタン更新は _updateSkillBtns() で行う（updateHUDからは呼ばない）
    this._updateSkillBtns();
  }
  _updateSkillBtns(){
    if(!this.skillBtnRefs||!this.skillBtnRefs.length)return;
    const pd=this.playerData;
    this.skillBtnRefs.forEach((ref)=>{
      const {btn,nameTxt,lvTxt,num,col,isAwak,skillKey}=ref;
      try{
        if(!btn||!btn.active||!nameTxt||!nameTxt.active||!lvTxt||!lvTxt.active)return;
        // skillKeyがあれば_resolveSkillKeyで正確な情報を取得
        const info = skillKey ? this._resolveSkillKey(skillKey) : null;
        if(isAwak){
          const lv = info ? info.lv : 0;
          const has = lv > 0;
          const c = has ? col : 0x555555;
          btn.setFillStyle(c, has?0.45:0.1).setStrokeStyle(2, c, has?1.0:0.3);
          nameTxt.setColor('#ffffff').setStroke('#aa1166', 2);
          lvTxt.setColor('#ffffff').setText('Lv'+lv).setStroke('#aa1166', 2);
        } else {
          const lv = info ? info.lv : (pd['sk'+num]||0);
          const has = lv > 0;
          const c=has?col:0x555555;
          btn.setFillStyle(c,has?0.28:0.1).setStrokeStyle(2,c,has?1.0:0.3);
          nameTxt.setColor(has?'#000000':'#667788').setStroke(has?'#ffffff':'#223344',has?3:1);
          lvTxt.setColor(has?'#000000':'#555555').setText('Lv'+lv).setStroke(has?'#ffffff':'#223344',has?2:1);
        }
      }catch(e){}
    });
  }
  updateBossHP(ed){
    const w=this.scale.width;
    if(!ed||ed.dead){this.bossHPBg.setVisible(false);this.bossHPBar.setVisible(false);this.bossHPTxt.setVisible(false);return;}
    const pct=Math.max(0,ed.hp/ed.mhp);
    this.bossHPBg.setVisible(true);
    this.bossHPBar.setVisible(true).setSize(w*0.6*pct,16).setFillStyle(pct>0.5?0xe74c3c:pct>0.25?0xff8800:0xff0000);
    this.bossHPTxt.setVisible(true).setText('⚠ BOSS: '+Math.ceil(ed.hp)+'/'+ed.mhp);
  }

  // ══════════════════════════════════════
  // 覚醒モード(Awakening)システム
  // ══════════════════════════════════════
  _createAwakeningButton(){
    const w=this.scale.width, h=this.scale.height;
    // 画面右下、攻撃ボタンの上あたりに配置
    const BX = w - 75;
    const BY = h - 200;
    this._awakBtnBg = this.add.circle(BX, BY, 36, 0xff2244, 0.85)
      .setStrokeStyle(3, 0xff8866).setScrollFactor(0).setDepth(28).setVisible(false)
      .setInteractive({useHandCursor:true});
    this._awakBtnTxt = this.add.text(BX, BY-2, '🗡', {fontSize:'24px'})
      .setOrigin(0.5).setScrollFactor(0).setDepth(29).setVisible(false);
    this._awakBtnLabel = this.add.text(BX, BY+24, '覚醒', {
      fontSize:'11px',fontFamily:'Arial',color:'#ffeecc',fontStyle:'bold',stroke:'#000',strokeThickness:2
    }).setOrigin(0.5).setScrollFactor(0).setDepth(29).setVisible(false);
    // 覚醒ポイント残量表示(ボタンの下)
    this._awakSpTxt = this.add.text(BX, BY+50, '✨ 0pt', {
      fontSize:'11px',fontFamily:'Arial',color:'#ffaadd',fontStyle:'bold',stroke:'#330033',strokeThickness:2
    }).setOrigin(0.5).setScrollFactor(0).setDepth(29).setVisible(false);
    // 押すと発動 or 解除
    this._awakBtnBg.on('pointerdown', ()=>{
      if(this._menuOpen || this._gameOver) return;
      try{ SE('click'); }catch(e){}
      const pd=this.playerData;
      if(pd.awakened){
        // 手動解除可否をチェック(侍は自動解除のみ)
        const A = AWAKENINGS[pd.awakened];
        if(A && A.manualDeactivate === false){
          // 手動解除不可: 何もしない
          return;
        }
        this._deactivateAwakening();
      }else{
        // ── ゲージMAXチェック ──
        if((pd.awakGauge||0) < (pd.awakGaugeMax||100)){
          // ゲージ不足: メッセージ表示
          const p=this.player;
          if(p){
            this.showFloat(p.x, p.y-50, '覚醒ゲージ不足', '#ff8866', 'info');
          }
          return;
        }
        // 装備中の武器から覚醒種別を判定
        const eq=pd.equip&&pd.equip.weapon_main;
        const def=eq?EQUIP_DEFS[eq]:null;
        if(def && def.awakening && AWAKENINGS[def.awakening]){
          // ゲージを消費して覚醒発動
          pd.awakGauge = 0;
          this._activateAwakening(def.awakening);
        }
      }
    });
    // パルスアニメ(発動可能時に光る)
    this.tweens.add({
      targets: this._awakBtnBg,
      alpha: 0.65,
      duration: 800,
      yoyo: true,
      repeat: -1,
    });
    // ── ゲージ進捗表示用の円形リング ──
    // Graphicsで円弧描画(更新は_updateAwakeningButtonで)
    this._awakBtnGauge = this.add.graphics().setScrollFactor(0).setDepth(28.5).setVisible(false);
    this._awakBtnGaugeBX = BX;
    this._awakBtnGaugeBY = BY;
    // 装備状況に応じて表示更新
    this._updateAwakeningButton();
  }

  // 覚醒ボタンの表示/非表示を判定
  _updateAwakeningButton(){
    const pd=this.playerData;
    if(!this._awakBtnBg) return;
    // 武器に awakening プロパティがある妖刀を装備してるか?
    const eq=pd.equip&&pd.equip.weapon_main;
    const def=eq?EQUIP_DEFS[eq]:null;
    const canAwaken = def && def.awakening && AWAKENINGS[def.awakening];
    // 覚醒中で手動解除不可ならボタン自体を隠す
    let visible;
    if(pd.awakened){
      const A = AWAKENINGS[pd.awakened];
      if(A && A.manualDeactivate === false){
        visible = false;
      }else{
        visible = true;
      }
    }else{
      visible = !!canAwaken;
    }
    this._awakBtnBg.setVisible(visible);
    this._awakBtnTxt.setVisible(visible);
    this._awakBtnLabel.setVisible(visible);
    // 覚醒ポイント表示更新(覚醒武器を装備中のときだけ表示)
    if(this._awakSpTxt){
      this._awakSpTxt.setVisible(visible);
      this._awakSpTxt.setText('✨ '+(pd.awakSp||0)+'pt');
    }
    if(pd.awakened){
      const A = AWAKENINGS[pd.awakened];
      this._awakBtnTxt.setText(A.icon);
      this._awakBtnLabel.setText(A.deactivateLabel || '解除');
      // 解除中の色(AWAKENINGSのauraColorを参照)
      const aura = A.auraColor || 0xff8866;
      // 背景は少し暗めに、枠とゲージはauraColor
      this._awakBtnBg.setFillStyle(aura, 0.45);
      this._awakBtnBg.setStrokeStyle(3, aura);
      let activeGaugeCol = aura;
      // ── 覚醒中: 残り時間ゲージリング ──
      // 180秒(3分)を上限とし、経過に応じて減らす
      if(this._awakBtnGauge){
        const g = this._awakBtnGauge;
        g.clear();
        g.setVisible(true);
        const BX = this._awakBtnGaugeBX;
        const BY = this._awakBtnGaugeBY;
        const elapsed = pd._awakElapsed || 0;
        const total = 180;  // 3分
        const remain = Math.max(0, total - elapsed);
        const ratio = remain / total;  // 1.0 → 0.0
        // 背景の薄い円
        g.lineStyle(4, 0x000000, 0.4);
        g.strokeCircle(BX, BY, 42);
        // 残り時間ゲージ(時計回りに減る = 上から開始、時計回り方向)
        if(ratio > 0){
          // 残り時間が少なくなるにつれて色が赤くなる演出
          let col = activeGaugeCol;
          if(ratio < 0.2) col = 0xff3344;  // 残り20%以下で赤に
          else if(ratio < 0.4) col = 0xff8844;  // 残り40%以下でオレンジ
          g.lineStyle(4, col, 1);
          g.beginPath();
          g.arc(BX, BY, 42, -Math.PI/2, -Math.PI/2 + ratio*Math.PI*2, false);
          g.strokePath();
        }
      }
    }else if(canAwaken){
      const A = AWAKENINGS[def.awakening];
      this._awakBtnTxt.setText(A.icon);
      this._awakBtnLabel.setText(A.activateLabel || '覚醒');
      // ゲージMAXチェック
      const gauge = pd.awakGauge || 0;
      const gMax = pd.awakGaugeMax || 100;
      const ready = gauge >= gMax;
      // 覚醒種類別の発動前色(auraColorを基準に・MAX時は明るく、未満時は暗く)
      const baseAura = A.auraColor || 0xff8866;
      // auraColorを暗くした色を計算
      const dim = (col, f)=>{
        const r=Math.floor(((col>>16)&0xff)*f), g2=Math.floor(((col>>8)&0xff)*f), b=Math.floor((col&0xff)*f);
        return (r<<16)|(g2<<8)|b;
      };
      const fillCol = ready ? dim(baseAura,0.45) : dim(baseAura,0.18);
      const strokeCol = ready ? baseAura : dim(baseAura,0.5);
      const gaugeCol = baseAura;
      this._awakBtnBg.setFillStyle(fillCol, 0.85);
      this._awakBtnBg.setStrokeStyle(3, strokeCol);
      // ── ゲージリング描画 ──
      if(this._awakBtnGauge){
        const g = this._awakBtnGauge;
        g.clear();
        g.setVisible(true);
        const BX = this._awakBtnGaugeBX;
        const BY = this._awakBtnGaugeBY;
        // 背景の薄い円(残量目盛り)
        g.lineStyle(4, 0x000000, 0.4);
        g.strokeCircle(BX, BY, 42);
        // ゲージ進捗(時計回り・上から開始)
        const ratio = Math.min(1, gauge / gMax);
        if(ratio > 0){
          g.lineStyle(4, gaugeCol, 1);
          g.beginPath();
          g.arc(BX, BY, 42, -Math.PI/2, -Math.PI/2 + ratio*Math.PI*2, false);
          g.strokePath();
        }
        // MAX時はキラキラ追加
        if(ready){
          g.lineStyle(2, 0xffffff, 0.7);
          g.strokeCircle(BX, BY, 45);
        }
      }
    } else {
      // 覚醒不可: ゲージリングも隠す
      if(this._awakBtnGauge) this._awakBtnGauge.setVisible(false);
    }
  }

  // 覚醒発動
  _activateAwakening(awakKey){
    const pd=this.playerData;
    const A=AWAKENINGS[awakKey];
    if(!A){return;}
    if(pd.awakened){return;}
    if(pd.cls !== A.baseClass){
      this.showFloat(this.player.x, this.player.y-60, '覚醒できない…', '#ff6666');
      return;
    }
    // 元のステータスを保存(解除時に戻す)
    pd._preAwakeStats = {
      atk: pd.atk, def: pd.def, mag: pd.mag,
      spd: pd.spd, hit: pd.hit, agi: pd.agi,
      sk1: pd.sk1, sk2: pd.sk2, sk3: pd.sk3, sk4: pd.sk4,
      cls: pd.cls,
    };
    // ステータス補正(ネガ効果のみ)を適用
    if(A.statMul){
      Object.keys(A.statMul).forEach(k=>{
        if(pd[k] !== undefined){
          pd[k] = Math.floor(pd[k] * A.statMul[k]);
        }
      });
    }
    // 覚醒スキルは強制Lv5(覚醒スキル枠)
    pd.sk1=5; pd.sk2=5; pd.sk3=5; pd.sk4=0;
    // 状態フラグ設定
    pd.awakened = awakKey;
    pd._awakElapsed = 0;
    // 発動時のHPカット(エルフなど)
    if(A.onActivateHpRatio){
      pd.hp = Math.max(1, Math.floor(pd.mhp * A.onActivateHpRatio));
    }
    // 発動時のHP消費(妖魔など、現在HPの一定割合を引く)
    if(A.onActivateHpCost){
      const cost = Math.floor(pd.mhp * A.onActivateHpCost);
      pd.hp = Math.max(1, pd.hp - cost);
    }
    // スキル使用済み追跡(精霊の誓いなど一回限定用)
    pd._awakSkillsUsed = {};
    // ── 派手な発動演出 ──
    const p=this.player;
    // 種類別の色
    const isHeavy = (awakKey==='heavy');
    const isBusters = (awakKey==='busters');
    const isSpirit = (awakKey==='spirit');
    const isYouma = (awakKey==='youma');
    const isAbyss = (awakKey==='abyss');
    let flashCol, auraCol, ringCol;
    if(isHeavy){
      flashCol=[100,200,255]; auraCol=0x4488ff; ringCol=0x66aaff;
    }else if(isBusters){
      flashCol=[255,140,60]; auraCol=0xff5522; ringCol=0xff8844;
    }else if(isSpirit){
      flashCol=[150,255,150]; auraCol=0x66ff88; ringCol=0x88ffaa;
    }else if(isYouma){
      flashCol=[80,30,120]; auraCol=0x6622aa; ringCol=0x9944ff;
    }else if(isAbyss){
      flashCol=[30,80,200]; auraCol=0x1144ff; ringCol=0x3366ff;
    }else{
      flashCol=[255,50,50]; auraCol=0xff2244; ringCol=0xff4466;
    }
    // 閃光
    this.cameras.main.flash(800, flashCol[0], flashCol[1], flashCol[2]);
    // 振動(ヘヴィは迫力ある重い振動)
    if(isHeavy){
      this.cameras.main.shake(700, 0.025);
    }else{
      this.cameras.main.shake(300, 0.012);
    }
    // 周囲に拡散リング
    for(let i=0;i<3;i++){
      const ring=this.add.circle(p.x, p.y, 20, ringCol, 0).setStrokeStyle(4, ringCol, 0.9).setDepth(15);
      this.tweens.add({
        targets:ring,
        scaleX:5, scaleY:5,
        alpha:0,
        duration:600+i*150,
        delay:i*100,
        onComplete:()=>ring.destroy(),
      });
    }
    // 覚醒オーラ(継続)
    this._awakAura = this.add.circle(p.x, p.y, 40, auraCol, 0.25).setDepth(4);
    this.tweens.add({
      targets: this._awakAura,
      scaleX: 1.3, scaleY: 1.3,
      alpha: 0.4,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });
    // タイトル表示
    let title, titleCol;
    if(isHeavy){
      title='🦾 換装・重装兵器 🦾'; titleCol='#66aaff';
    }else if(isSpirit){
      title='🍃 転生・エルフ 🍃'; titleCol='#88ffaa';
    }else if(isYouma){
      title='🌑 妖魔化 🌑'; titleCol='#aa66ff';
    }else{
      title='🗡 覚醒・侍 🗡'; titleCol='#ff4466';
    }
    this.showFloat(p.x, p.y-80, title, titleCol);
    // エルフ転生時: 葉っぱ・草風の渦エフェクト
    if(isSpirit){
      // 緑のオーラ拡散
      const halo=this.add.circle(p.x, p.y, 50, 0x66ff88, 0.4).setDepth(15);
      this.tweens.add({
        targets: halo, scaleX:3, scaleY:3, alpha:0,
        duration: 1000,
        onComplete: ()=>halo.destroy(),
      });
      // 葉っぱ24枚が螺旋を描いて舞う
      for(let i=0;i<24;i++){
        const ang0 = (i/24) * Math.PI * 2;
        const startR = 60;
        const sx = p.x + Math.cos(ang0) * startR;
        const sy = p.y + Math.sin(ang0) * startR;
        const leaf = this.add.text(sx, sy, '🍃', {fontSize:'20px'}).setOrigin(0.5).setDepth(16);
        // 螺旋的にプレイヤーへ吸い込まれる動き
        this.tweens.add({
          targets: leaf,
          x: p.x + (Math.random()-0.5)*15,
          y: p.y + (Math.random()-0.5)*15,
          rotation: Math.PI * 4,
          alpha: 0,
          scaleX: 0.3, scaleY: 0.3,
          duration: 800 + i*15,
          ease: 'Cubic.easeIn',
          onComplete: ()=>leaf.destroy(),
        });
      }
      // 上空に向かって葉っぱが舞い上がる
      for(let i=0;i<10;i++){
        this.time.delayedCall(i*40, ()=>{
          const sx = p.x + (Math.random()-0.5)*30;
          const sy = p.y + 20;
          const leaf = this.add.text(sx, sy, '🍃', {fontSize:'18px'}).setOrigin(0.5).setDepth(16);
          this.tweens.add({
            targets: leaf,
            x: sx + (Math.random()-0.5)*120,
            y: sy - 100 - Math.random()*80,
            rotation: (Math.random()-0.5) * Math.PI * 6,
            alpha: 0,
            duration: 1200 + Math.random()*400,
            onComplete: ()=>leaf.destroy(),
          });
        });
      }
    }
    // 妖魔化発動時: 雷+ブラックホールに飲まれる演出
    if(isYouma){
      // 巨大なブラックホール(中心が黒、外側が紫)
      const bh = this.add.circle(p.x, p.y, 30, 0x000000, 1).setDepth(20);
      const bhEdge = this.add.circle(p.x, p.y, 32, 0x6622aa, 0).setStrokeStyle(8, 0x9944ff, 0.85).setDepth(21);
      // ブラックホールが急速に成長 → 縮小して消える
      this.tweens.add({
        targets: [bh, bhEdge],
        scaleX: 6, scaleY: 6,
        duration: 500,
        ease: 'Cubic.easeOut',
        onComplete: ()=>{
          // 縮小フェーズ(プレイヤー位置に吸い込まれて消える)
          this.tweens.add({
            targets: [bh, bhEdge],
            scaleX: 0.3, scaleY: 0.3,
            alpha: 0,
            duration: 400,
            ease: 'Cubic.easeIn',
            onComplete: ()=>{
              try{bh.destroy();}catch(e){}
              try{bhEdge.destroy();}catch(e){}
              // 最後に紫の閃光
              const finalFlash = this.add.circle(p.x, p.y, 60, 0xaa44ff, 0.8).setDepth(22);
              this.tweens.add({
                targets: finalFlash,
                scaleX: 3, scaleY: 3,
                alpha: 0,
                duration: 400,
                onComplete: ()=>finalFlash.destroy(),
              });
            },
          });
        },
      });
      // 雷を5回ランダム方向から落とす
      for(let i=0;i<5;i++){
        this.time.delayedCall(i*60 + 100, ()=>{
          const ang = Math.random() * Math.PI * 2;
          const len = 200;
          const sx = p.x + Math.cos(ang) * len;
          const sy = p.y + Math.sin(ang) * len - 100;
          for(let k=0;k<4;k++){
            const t1 = k/4, t2 = (k+1)/4;
            const ox1 = (Math.random()-0.5)*30, oy1 = (Math.random()-0.5)*30;
            const ox2 = (Math.random()-0.5)*30, oy2 = (Math.random()-0.5)*30;
            const x1 = sx + (p.x-sx)*t1 + ox1;
            const y1 = sy + (p.y-sy)*t1 + oy1;
            const x2 = sx + (p.x-sx)*t2 + ox2;
            const y2 = sy + (p.y-sy)*t2 + oy2;
            const lit = this.add.line(0, 0, x1, y1, x2, y2, 0xcc88ff, 1).setOrigin(0).setLineWidth(3).setDepth(22);
            this.tweens.add({
              targets: lit, alpha: 0,
              duration: 250 + Math.random()*100,
              onComplete: ()=>lit.destroy(),
            });
          }
          const spark = this.add.circle(p.x, p.y, 10, 0xcc88ff, 0.9).setDepth(22);
          this.tweens.add({
            targets: spark, scaleX: 2.5, scaleY: 2.5, alpha: 0,
            duration: 400,
            onComplete: ()=>spark.destroy(),
          });
        });
      }
      // 紫のパーティクル(吸い込まれる紫粒子)
      for(let i=0;i<20;i++){
        const a = (i/20) * Math.PI * 2;
        const sR = 120 + Math.random()*40;
        const sx = p.x + Math.cos(a) * sR;
        const sy = p.y + Math.sin(a) * sR;
        const dot = this.add.circle(sx, sy, 5, 0xaa44ff, 0.85).setDepth(20);
        this.tweens.add({
          targets: dot,
          x: p.x, y: p.y,
          alpha: 0, scaleX: 0, scaleY: 0,
          duration: 700 + Math.random()*200,
          ease: 'Cubic.easeIn',
          onComplete: ()=>dot.destroy(),
        });
      }
    }
    // 雷電エフェクトの初期化(動くと発動)
    this._awakLightnings = [];
    this._lastAwakLightningTime = 0;
    try{ SE('skill'); }catch(e){}
    // 覚醒中の専用スプライトに切り替え(侍・ヘヴィなど)
    // setTexture すると displaySize がリセットされるので、サイズも明示的に保持
    const pSize = this.player.displayWidth;  // 現在の表示サイズを記憶
    // ── 覚醒スプライトへ切替(AWAKENINGSのデータ参照) ──
    const awDef = AWAKENINGS[awakKey];
    if(awDef && awDef.sprite && this.textures.exists(awDef.sprite)){
      try{
        this.player.setTexture(awDef.sprite, 0);
        this.player.setDisplaySize(pSize, pSize);
        this.player.play(awDef.animPrefix+'_'+(this._facing||'front')+'_idle', true);
        // 覚醒別の tint 適用(abyss は青く着色)
        if(awDef.tintColor){
          this.player.setTint(awDef.tintColor);
        }else{
          this.player.clearTint();
        }
      }catch(e){console.warn('awaken texture switch failed', awakKey, e);}
    }
    // UIを更新
    this._updateAwakeningButton();
    // スキルボタンを再構築(覚醒スキルが表示される)
    this._rebuildSkillButtons();
    this.updateHUD();
  }

  // 覚醒解除
  _deactivateAwakening(forced){
    const pd=this.playerData;
    if(!pd.awakened) return;
    const p=this.player;
    const wasKey = pd.awakened;  // 解除前の覚醒種別
    // ステータスとスキルLvを元に戻す
    if(pd._preAwakeStats){
      const s=pd._preAwakeStats;
      if(s.atk!==undefined) pd.atk=s.atk;
      if(s.def!==undefined) pd.def=s.def;
      if(s.mag!==undefined) pd.mag=s.mag;
      if(s.spd!==undefined) pd.spd=s.spd;
      if(s.hit!==undefined) pd.hit=s.hit;
      if(s.agi!==undefined) pd.agi=s.agi;
      if(s.sk1!==undefined) pd.sk1=s.sk1;
      if(s.sk2!==undefined) pd.sk2=s.sk2;
      if(s.sk3!==undefined) pd.sk3=s.sk3;
      if(s.sk4!==undefined) pd.sk4=s.sk4;
      pd._preAwakeStats = null;
    }
    pd.awakened = null;
    pd._awakElapsed = 0;
    pd._awakSkillsUsed = null;
    // 次回の「覚醒準備完了」通知を有効化
    pd._awakReadyShown = false;
    // ── 元クラスのテクスチャに戻す(AWAKENINGSのデータ参照・displaySize保持) ──
    const restoreSize = this.player.displayWidth;
    const wasDef = AWAKENINGS[wasKey];
    if(wasDef && wasDef.baseSprite && this.textures.exists(wasDef.baseSprite)){
      try{
        this.player.setTexture(wasDef.baseSprite, 0);
        this.player.setDisplaySize(restoreSize, restoreSize);
        this.player.play(wasDef.baseAnimPrefix+'_'+(this._facing||'front')+'_idle', true);
        this.player.clearTint();  // 覚醒中の tint をクリア
      }catch(e){console.warn('base texture restore failed', wasKey, e);}
    }
    // エルフ専用バフ解除
    pd._allCritUntil = 0;
    if(pd._allCritRing){try{pd._allCritRing.destroy();}catch(e){} pd._allCritRing=null;}
    // アビス専用状態クリア
    pd._abyssCurseActive = false;
    if(pd._abyssCurseAura){try{pd._abyssCurseAura.destroy();}catch(e){} pd._abyssCurseAura=null;}
    this._wbActive = false;
    // バスターズ専用状態クリア(アーマーパージ・ストリーク・移動ロック)
    // 注: spd/atk/def は上の _preAwakeStats 復元で覚醒前の値(=元の100%)に既に戻っている。
    //     ここで _armorPurgeOrig.spd 等を再代入すると statMul 適用後の値(spd×0.7 等)で
    //     上書きしてしまい、再覚醒のたびに speed が複合的に減衰するバグになる。
    //     フラグとビジュアルだけクリアして、ステータスは触らない。
    pd._armorPurgeOrig = null;
    pd._armorPurgeUntil = null;
    if(pd._armorPurgeAura){try{pd._armorPurgeAura.destroy();}catch(e){} pd._armorPurgeAura=null;}
    pd._bcStreak = 0;
    pd._bcLastFire = 0;
    this._lockMovement = false;
    // ── 解除演出(覚醒種別ごとに特色を出す)──
    if(this._awakAura){
      this.tweens.add({
        targets: this._awakAura,
        scaleX: 3, scaleY: 3,
        alpha: 0,
        duration: 400,
        onComplete: ()=>{ if(this._awakAura){this._awakAura.destroy(); this._awakAura=null;} },
      });
    }
    // 雷電エフェクトを消す
    if(this._awakLightnings){
      this._awakLightnings.forEach(l=>{ try{l.destroy();}catch(e){} });
      this._awakLightnings = [];
    }

    // 種類別の解除エフェクト
    if(wasKey==='samurai'){
      // 侍 解除: 赤いオーラが収束 → 散る + 太刀の納刀音風
      this.cameras.main.flash(300, 255, 100, 100);
      // 赤いリングが内側に集束
      const ring1 = this.add.circle(p.x, p.y, 100, 0xff4466, 0).setStrokeStyle(4, 0xff4466, 0.85).setDepth(20);
      this.tweens.add({
        targets: ring1, scaleX: 0.1, scaleY: 0.1, alpha: 0,
        duration: 500, ease: 'Cubic.easeIn',
        onComplete: ()=>ring1.destroy(),
      });
      // 赤い火花が四散
      for(let i=0;i<8;i++){
        const a = (i/8) * Math.PI * 2;
        const sp = this.add.text(p.x, p.y, '✦', {fontSize:'18px', color:'#ff6688'}).setOrigin(0.5).setDepth(21);
        this.tweens.add({
          targets: sp,
          x: p.x + Math.cos(a)*80,
          y: p.y + Math.sin(a)*80,
          alpha: 0, scaleX: 0.3, scaleY: 0.3, rotation: Math.PI*2,
          duration: 700,
          onComplete: ()=>sp.destroy(),
        });
      }
      // 中央の白フラッシュ(刀光)
      const flash1 = this.add.image(p.x, p.y, 'fx_slash').setDisplaySize(120, 120).setRotation(Math.PI/4).setTint(0xffffff).setAlpha(1).setDepth(22);
      this.tweens.add({
        targets: flash1, alpha: 0, scaleX: 1.5, scaleY: 1.5,
        duration: 400,
        onComplete: ()=>flash1.destroy(),
      });
      try{SE('parry');}catch(e){}
    }else if(wasKey==='spirit'){
      // エルフ 解除: 葉っぱが上に舞い上がって消える + 緑の光
      this.cameras.main.flash(400, 150, 255, 200);
      // 緑のリング展開
      const ring1 = this.add.circle(p.x, p.y, 30, 0x88ffaa, 0).setStrokeStyle(3, 0x66ee88, 0.85).setDepth(20);
      this.tweens.add({
        targets: ring1, scaleX: 4, scaleY: 4, alpha: 0,
        duration: 800,
        onComplete: ()=>ring1.destroy(),
      });
      // 葉っぱが上空へ舞い上がる(15枚)
      for(let i=0;i<15;i++){
        this.time.delayedCall(i*30, ()=>{
          if(!this.player) return;
          const sx = p.x + (Math.random()-0.5)*60;
          const sy = p.y + (Math.random()-0.5)*40;
          const leaf = this.add.text(sx, sy, '🍃', {fontSize:'18px'}).setOrigin(0.5).setDepth(20);
          this.tweens.add({
            targets: leaf,
            x: sx + (Math.random()-0.5)*150,
            y: sy - 200 - Math.random()*80,
            rotation: (Math.random()-0.5) * Math.PI * 6,
            alpha: 0,
            duration: 1500 + Math.random()*500,
            onComplete: ()=>leaf.destroy(),
          });
        });
      }
      // 中心に光
      const flash1 = this.add.circle(p.x, p.y, 40, 0xaaffaa, 0.7).setDepth(21);
      this.tweens.add({
        targets: flash1, scaleX: 2.5, scaleY: 2.5, alpha: 0,
        duration: 700,
        onComplete: ()=>flash1.destroy(),
      });
      try{SE('vortex');}catch(e){}
    }else if(wasKey==='heavy'){
      // ヘヴィ 解除: 装備パージ・蒸気が四方に噴出 + 機械的な金属音
      this.cameras.main.flash(300, 100, 200, 255);
      // 4方向に蒸気が噴出
      for(let dir=0; dir<4; dir++){
        const ang = (dir/4) * Math.PI * 2;
        for(let i=0;i<6;i++){
          this.time.delayedCall(i*40, ()=>{
            if(!this.player) return;
            const dist = 30 + i*15;
            const sx = p.x + Math.cos(ang) * dist + (Math.random()-0.5)*20;
            const sy = p.y + Math.sin(ang) * dist + (Math.random()-0.5)*20;
            const steam = this.add.circle(sx, sy, 6 + Math.random()*4, 0xcccccc, 0.85).setDepth(20);
            this.tweens.add({
              targets: steam,
              scaleX: 2.5, scaleY: 2.5,
              alpha: 0,
              x: sx + Math.cos(ang)*30,
              y: sy + Math.sin(ang)*30 - 10,
              duration: 700,
              onComplete: ()=>steam.destroy(),
            });
          });
        }
      }
      // 青いリング展開
      const ring1 = this.add.circle(p.x, p.y, 20, 0x4488ff, 0).setStrokeStyle(4, 0x66aaff, 0.85).setDepth(20);
      this.tweens.add({
        targets: ring1, scaleX: 5, scaleY: 5, alpha: 0,
        duration: 600,
        onComplete: ()=>ring1.destroy(),
      });
      // 装備パーツが飛び散る(青いブロック)
      for(let i=0;i<8;i++){
        const a = (i/8) * Math.PI * 2;
        const part = this.add.rectangle(p.x, p.y, 8, 8, 0x88ccff, 0.95).setStrokeStyle(1, 0x4488cc).setDepth(21);
        this.tweens.add({
          targets: part,
          x: p.x + Math.cos(a) * (60 + Math.random()*30),
          y: p.y + Math.sin(a) * (60 + Math.random()*30) + 50,  // 重力風に下に
          rotation: Math.PI*2*(Math.random()<0.5?1:-1),
          alpha: 0,
          duration: 800,
          ease: 'Cubic.easeOut',
          onComplete: ()=>part.destroy(),
        });
      }
      try{SE('hit');}catch(e){}
    }else if(wasKey==='youma'){
      // 妖魔 解除: 紫の闇が霧散・小さなブラックホール
      this.cameras.main.flash(400, 150, 100, 200);
      // 中心の紫黒ホール(現れて急速に消える)
      const bh = this.add.circle(p.x, p.y, 40, 0x000000, 0.85).setStrokeStyle(3, 0xaa44ff, 1).setDepth(20);
      this.tweens.add({
        targets: bh, scaleX: 0.1, scaleY: 0.1, alpha: 0,
        duration: 600,
        ease: 'Cubic.easeIn',
        onComplete: ()=>bh.destroy(),
      });
      // 紫オーラリングが急速に拡散
      for(let i=0;i<3;i++){
        const ring = this.add.circle(p.x, p.y, 30, 0x9944ff, 0).setStrokeStyle(3+i, 0xaa44ff, 0.7-i*0.15).setDepth(19);
        this.tweens.add({
          targets: ring, scaleX: 4 + i, scaleY: 4 + i, alpha: 0,
          duration: 700 + i*100,
          delay: i*60,
          onComplete: ()=>ring.destroy(),
        });
      }
      // 紫の粒が四方に散って消える
      for(let i=0;i<14;i++){
        const a = (i/14) * Math.PI * 2;
        const dot = this.add.circle(p.x, p.y, 5, 0xcc88ff, 0.9).setDepth(21);
        this.tweens.add({
          targets: dot,
          x: p.x + Math.cos(a) * (80 + Math.random()*40),
          y: p.y + Math.sin(a) * (80 + Math.random()*40),
          alpha: 0, scaleX: 0.3, scaleY: 0.3,
          duration: 700 + Math.random()*200,
          ease: 'Cubic.easeOut',
          onComplete: ()=>dot.destroy(),
        });
      }
      // 短い紫の雷電が複数本
      for(let k=0;k<3;k++){
        this.time.delayedCall(k*80, ()=>{
          if(!this.player) return;
          const ang = Math.random()*Math.PI*2;
          const len = 60;
          const ex = p.x + Math.cos(ang)*len;
          const ey = p.y + Math.sin(ang)*len;
          const lit = this.add.line(0,0, p.x, p.y, ex, ey, 0xcc88ff, 1).setOrigin(0).setLineWidth(3).setDepth(22);
          this.tweens.add({targets: lit, alpha: 0, duration: 200, onComplete: ()=>lit.destroy()});
        });
      }
      try{SE('magic');}catch(e){}
    }else{
      // フォールバック(知らない覚醒): 白フラッシュ
      this.cameras.main.flash(400, 200, 200, 255);
    }
    if(forced){
      this.showFloat(p.x, p.y-60, '体力切れ! 強制解除', '#ff8888');
    }else{
      this.showFloat(p.x, p.y-60, '覚醒解除', '#aaccff');
    }
    try{ SE('click'); }catch(e){}
    // UIを更新
    this._updateAwakeningButton();
    this._rebuildSkillButtons();
    this.updateHUD();
  }

  // 毎フレーム処理(HP減少・追従・雷電エフェクト)
  _updateAwakening(dt){
    const pd=this.playerData;
    if(!pd.awakened) return;
    const A = AWAKENINGS[pd.awakened];
    if(!A) return;
    // HP減少(侍など)
    if(A.hpDrainRatio){
      const drain = pd.mhp * A.hpDrainRatio * dt;
      pd.hp = Math.max(0.01, pd.hp - drain);
    }
    // SP減少(ヘヴィなど)
    if(A.spDrainPerSec){
      pd.sp = Math.max(0, pd.sp - A.spDrainPerSec * dt);
      if(A.forceDeactivateSp && pd.sp <= 0){
        this._deactivateAwakening(true);
        return;
      }
      // SP割合での強制解除(妖魔など)
      if(A.forceDeactivateSpRatio && pd.sp <= pd.msp * A.forceDeactivateSpRatio){
        this._deactivateAwakening(true);
        return;
      }
    }
    pd._awakElapsed += dt;
    // 強制解除条件: 3分(180秒)経過
    if(pd._awakElapsed >= 180){
      // 制限時間到達 → 自動解除
      this._deactivateAwakening(true);
      return;
    }
    // 強制解除条件: HP低下
    if(A.forceDeactivateRatio && pd.hp <= pd.mhp * A.forceDeactivateRatio){
      this._deactivateAwakening(true);
      return;
    }
    // オーラの追従
    if(this._awakAura){
      this._awakAura.setPosition(this.player.x, this.player.y);
    }
    // 移動中エフェクト(覚醒種類で違う)
    const p=this.player;
    const speed = Math.sqrt((p.body.velocity.x||0)**2 + (p.body.velocity.y||0)**2);
    if(speed > 30){
      const now = this.time.now;
      if(now - (this._lastAwakLightningTime||0) > 80){
        this._lastAwakLightningTime = now;
        if(pd.awakened==='samurai'){
          this._spawnLightning(p.x, p.y);
        }else if(pd.awakened==='heavy'){
          this._spawnSteam(p.x, p.y);
        }else if(pd.awakened==='spirit'){
          this._spawnLeaf(p.x, p.y);
        }else if(pd.awakened==='youma'){
          this._spawnDarkAura(p.x, p.y);
        }
      }
    }
  }

  // 雷電エフェクトを生成
  _spawnLightning(x, y){
    const offX = (Math.random()-0.5) * 30;
    const offY = (Math.random()-0.5) * 30;
    // 黄色いジグザグの稲妻(短い線3本)
    for(let i=0;i<3;i++){
      const sx = x + offX + (Math.random()-0.5)*20;
      const sy = y + offY + (Math.random()-0.5)*20;
      const len = 8 + Math.random()*12;
      const ang = Math.random() * Math.PI * 2;
      const ex = sx + Math.cos(ang) * len;
      const ey = sy + Math.sin(ang) * len;
      const line = this.add.line(0, 0, sx, sy, ex, ey, 0xffff44, 0.9).setOrigin(0).setDepth(15).setLineWidth(2);
      this.tweens.add({
        targets: line,
        alpha: 0,
        duration: 200 + Math.random()*100,
        onComplete: ()=>line.destroy(),
      });
    }
    // 黄色い光点
    const dot = this.add.circle(x+offX, y+offY, 4, 0xffff66, 0.85).setDepth(15);
    this.tweens.add({
      targets: dot,
      scaleX: 2, scaleY: 2,
      alpha: 0,
      duration: 250,
      onComplete: ()=>dot.destroy(),
    });
  }

  // ヘヴィ用: 蒸気エフェクト
  _spawnSteam(x, y){
    // 灰色の煙が後方に流れる
    for(let i=0;i<2;i++){
      const sx = x + (Math.random()-0.5) * 30;
      const sy = y + 5 + Math.random()*15;
      const cloud = this.add.circle(sx, sy, 8+Math.random()*6, 0xaaaaaa, 0.6).setDepth(4);
      this.tweens.add({
        targets: cloud,
        y: sy - 25 - Math.random()*15,
        scaleX: 1.8, scaleY: 1.8,
        alpha: 0,
        duration: 600 + Math.random()*200,
        onComplete: ()=>cloud.destroy(),
      });
    }
    // 火花
    const spark = this.add.circle(x+(Math.random()-0.5)*20, y+10, 2, 0xffaa44, 0.85).setDepth(15);
    this.tweens.add({
      targets: spark,
      alpha: 0,
      y: spark.y + 8,
      duration: 200,
      onComplete: ()=>spark.destroy(),
    });
  }

  // メガ粒子砲: 極太の氷ビームを発射
  _fireMegaBeam(sx, sy, ex, ey, ang, width, len){
    // ビーム本体は3層構造で重ねて極太感を出す
    // 1. 一番外側(薄い青・最も太い)
    const outer = this.add.rectangle((sx+ex)/2, (sy+ey)/2, len, width*1.2, 0x88ccff, 0.45).setRotation(ang).setDepth(18);
    // 2. 中間層(明るい青・中太)
    const middle = this.add.rectangle((sx+ex)/2, (sy+ey)/2, len, width*0.8, 0xaaeeff, 0.75).setRotation(ang).setDepth(19);
    // 3. 中央コア(白・最も細い)
    const core = this.add.rectangle((sx+ex)/2, (sy+ey)/2, len, width*0.35, 0xffffff, 0.95).setRotation(ang).setDepth(20);

    // 発射時に「ガッ!」と一気に展開する演出
    [outer, middle, core].forEach(r=>r.setScale(0, 1));
    this.tweens.add({
      targets: [outer, middle, core],
      scaleX: 1,
      duration: 80,
      ease: 'Cubic.easeOut',
    });

    // ビームの脈動(出現中に青から白に揺らぐ)
    this.tweens.add({
      targets: middle,
      alpha: 0.55,
      duration: 100,
      yoyo: true,
      repeat: 3,
    });

    // 砲口の閃光(でかい爆発リング)
    const muzzle = this.add.circle(sx, sy, 30, 0xffffff, 1).setDepth(21);
    this.tweens.add({
      targets: muzzle,
      scaleX: 3.5, scaleY: 3.5,
      alpha: 0,
      duration: 400,
      onComplete: ()=>muzzle.destroy(),
    });

    // ビームの周囲に氷の粒子が放射状に飛び散る
    for(let i=0;i<24;i++){
      const t = i/24;
      const px = sx + (ex-sx)*t;
      const py = sy + (ey-sy)*t;
      const perpAng = ang + Math.PI/2;
      const perpDist = (Math.random()*2-1) * width * 0.7;
      const ice = this.add.text(
        px + Math.cos(perpAng)*perpDist,
        py + Math.sin(perpAng)*perpDist,
        '❄',
        {fontSize:'18px', color:'#aaeeff'}
      ).setOrigin(0.5).setDepth(20);
      const flyDist = 30 + Math.random()*40;
      this.tweens.add({
        targets: ice,
        x: ice.x + Math.cos(perpAng+Math.PI*Math.random()) * flyDist,
        y: ice.y + Math.sin(perpAng+Math.PI*Math.random()) * flyDist,
        alpha: 0,
        rotation: Math.PI*2,
        duration: 600 + Math.random()*200,
        onComplete: ()=>ice.destroy(),
      });
    }

    // 着弾点の大爆発
    const impact = this.add.circle(ex, ey, 40, 0xaaeeff, 0.8).setDepth(20);
    this.tweens.add({
      targets: impact,
      scaleX: 4, scaleY: 4,
      alpha: 0,
      duration: 700,
      onComplete: ()=>impact.destroy(),
    });
    // 着弾点の白フラッシュ
    const impactCore = this.add.circle(ex, ey, 20, 0xffffff, 1).setDepth(21);
    this.tweens.add({
      targets: impactCore,
      scaleX: 3, scaleY: 3,
      alpha: 0,
      duration: 400,
      onComplete: ()=>impactCore.destroy(),
    });

    // ビーム本体は600ms維持してからフェードアウト
    this.time.delayedCall(500, ()=>{
      this.tweens.add({
        targets: [outer, middle, core],
        alpha: 0,
        duration: 250,
        onComplete: ()=>{
          try{outer.destroy();}catch(e){}
          try{middle.destroy();}catch(e){}
          try{core.destroy();}catch(e){}
        },
      });
    });
  }

  // バスターキャノン用: 赤オレンジ版ビーム(_fireMegaBeam を色違いで)
  _fireBusterBeam(sx, sy, ex, ey, ang, width, len){
    const outer = this.add.rectangle((sx+ex)/2, (sy+ey)/2, len, width*1.2, 0xff5522, 0.45).setRotation(ang).setDepth(18);
    const middle = this.add.rectangle((sx+ex)/2, (sy+ey)/2, len, width*0.8, 0xff8844, 0.75).setRotation(ang).setDepth(19);
    const core = this.add.rectangle((sx+ex)/2, (sy+ey)/2, len, width*0.35, 0xffeecc, 0.95).setRotation(ang).setDepth(20);
    [outer, middle, core].forEach(r=>r.setScale(0, 1));
    this.tweens.add({targets:[outer, middle, core], scaleX:1, duration:80, ease:'Cubic.easeOut'});
    this.tweens.add({targets: middle, alpha:0.55, duration:100, yoyo:true, repeat:3});
    // 砲口の閃光
    const muzzle = this.add.circle(sx, sy, 30, 0xffeecc, 1).setDepth(21);
    this.tweens.add({targets:muzzle, scaleX:3.5, scaleY:3.5, alpha:0, duration:400, onComplete:()=>muzzle.destroy()});
    // 火花が周囲に飛び散る
    for(let i=0;i<24;i++){
      const t = i/24;
      const px = sx + (ex-sx)*t;
      const py = sy + (ey-sy)*t;
      const perpAng = ang + Math.PI/2;
      const perpDist = (Math.random()*2-1) * width * 0.7;
      const spark = this.add.circle(
        px + Math.cos(perpAng)*perpDist,
        py + Math.sin(perpAng)*perpDist,
        3 + Math.random()*2,
        [0xff4422, 0xff8844, 0xffaa44, 0xffeecc][Phaser.Math.Between(0,3)],
        0.95
      ).setDepth(20);
      const flyDist = 30 + Math.random()*40;
      this.tweens.add({
        targets: spark,
        x: spark.x + Math.cos(perpAng+Math.PI*Math.random()) * flyDist,
        y: spark.y + Math.sin(perpAng+Math.PI*Math.random()) * flyDist,
        alpha: 0,
        duration: 600 + Math.random()*200,
        onComplete: ()=>spark.destroy(),
      });
    }
    // 着弾点の大爆発
    const impact = this.add.circle(ex, ey, 40, 0xff5522, 0.8).setDepth(20);
    this.tweens.add({targets:impact, scaleX:4, scaleY:4, alpha:0, duration:700, onComplete:()=>impact.destroy()});
    const impactCore = this.add.circle(ex, ey, 20, 0xffeecc, 1).setDepth(21);
    this.tweens.add({targets:impactCore, scaleX:3, scaleY:3, alpha:0, duration:400, onComplete:()=>impactCore.destroy()});
    // ビーム本体フェードアウト
    this.time.delayedCall(500, ()=>{
      this.tweens.add({
        targets: [outer, middle, core],
        alpha: 0, duration: 250,
        onComplete: ()=>{
          try{outer.destroy();}catch(e){}
          try{middle.destroy();}catch(e){}
          try{core.destroy();}catch(e){}
        },
      });
    });
  }

  // エルフ用: 葉っぱエフェクト
  _spawnLeaf(x, y){
    const leaf = this.add.text(x+(Math.random()-0.5)*20, y+(Math.random()-0.5)*15, '🍃', {fontSize:'14px'}).setOrigin(0.5).setDepth(15);
    this.tweens.add({
      targets: leaf,
      x: leaf.x + (Math.random()-0.5)*30,
      y: leaf.y - 25 - Math.random()*15,
      rotation: (Math.random()-0.5) * Math.PI * 2,
      alpha: 0,
      duration: 600,
      onComplete: ()=>leaf.destroy(),
    });
  }

  // 妖魔用: 紫の闇粒子
  _spawnDarkAura(x, y){
    // 紫の粒
    const dot = this.add.circle(
      x + (Math.random()-0.5)*25,
      y + (Math.random()-0.5)*15,
      4 + Math.random()*3,
      0xaa44ff, 0.7
    ).setDepth(15);
    this.tweens.add({
      targets: dot,
      x: dot.x + (Math.random()-0.5)*20,
      y: dot.y - 18 - Math.random()*15,
      alpha: 0,
      scaleX: 0.3, scaleY: 0.3,
      duration: 500,
      onComplete: ()=>dot.destroy(),
    });
    // たまに小さな雷
    if(Math.random() < 0.2){
      const ang = Math.random() * Math.PI * 2;
      const len = 12;
      const ex = x + Math.cos(ang) * len;
      const ey = y + Math.sin(ang) * len;
      const lit = this.add.line(0, 0, x, y, ex, ey, 0xcc88ff, 1).setOrigin(0).setLineWidth(2).setDepth(16);
      this.tweens.add({
        targets: lit, alpha: 0,
        duration: 250,
        onComplete: ()=>lit.destroy(),
      });
    }
  }

  // 黒龍炎: 黒い龍が前方へうねりながら飛ぶ
  _fireBlackDragon(sx, sy, ang, range, width){
    const cosA = Math.cos(ang);
    const sinA = Math.sin(ang);
    const perpAng = ang + Math.PI/2;
    // 龍の体節を増やしてゆっくり進む
    const segments = 24;
    const segDelay = 200; // 段ごとの開始ディレイ(さらにゆっくり・派手に)
    for(let i=0; i<segments; i++){
      this.time.delayedCall(i*segDelay, ()=>{
        // 進行方向にi/segments * range進んだ位置(ベース)
        const t = i / segments;
        const baseX = sx + cosA * range * t;
        const baseY = sy + sinA * range * t;
        // うねり(perp方向に sin で揺れる)
        const undulation = Math.sin(t * Math.PI * 3) * 40;
        const segX = baseX + Math.cos(perpAng) * undulation;
        const segY = baseY + Math.sin(perpAng) * undulation;
        // ── 炎感を出す多層構造 ──
        const outerSize = (width/2) * (1 - t*0.25);
        // 1. 一番外側: 紫オーラ(暗紫の煙)
        const smoke = this.add.circle(segX, segY, outerSize*1.5, 0x331144, 0.45).setDepth(17);
        // 2. 中間: 紫の炎
        const purpleFlame = this.add.circle(segX, segY, outerSize*1.1, 0x6622aa, 0.7).setDepth(18);
        // 3. 中心の黒い体(龍の本体)
        const seg = this.add.circle(segX, segY, outerSize*0.85, 0x110022, 1).setDepth(19).setStrokeStyle(3, 0xaa44ff, 0.95);
        // 4. 内側に赤紫の炎芯(炎が燃え盛る感じ)
        const flameCore = this.add.circle(segX, segY, outerSize*0.5, 0xcc2266, 0.85).setDepth(20);
        // 5. 中心の白光(龍の魂・最も明るい)
        const core = this.add.circle(segX, segY, outerSize*0.25, 0xffffff, 0.9).setDepth(21);
        // 6. 周辺に飛び散る火の粉(派手に)
        for(let k=0;k<4;k++){
          const sparkAng = Math.random() * Math.PI * 2;
          const sparkR = outerSize * (0.8 + Math.random()*0.7);
          const spark = this.add.circle(
            segX + Math.cos(sparkAng)*sparkR,
            segY + Math.sin(sparkAng)*sparkR,
            4 + Math.random()*3,
            Math.random()<0.5 ? 0xff66cc : 0xaa44ff,
            0.9
          ).setDepth(20);
          this.tweens.add({
            targets: spark,
            x: spark.x + Math.cos(sparkAng) * 50,
            y: spark.y + Math.sin(sparkAng) * 50 - 25,  // 上方向にも
            alpha: 0,
            scaleX: 0.3, scaleY: 0.3,
            duration: 900,
            onComplete: ()=>spark.destroy(),
          });
        }
        // 体節は長めに残ってフェードアウト(炎が燃え続ける感)
        this.tweens.add({
          targets: seg,
          scaleX: 1.1, scaleY: 1.1,
          alpha: 0,
          duration: 1400,
          ease: 'Cubic.easeOut',
          onComplete: ()=>seg.destroy(),
        });
        this.tweens.add({
          targets: flameCore,
          scaleX: 1.3, scaleY: 1.3,
          alpha: 0,
          duration: 1000,
          ease: 'Sine.easeOut',
          onComplete: ()=>flameCore.destroy(),
        });
        this.tweens.add({
          targets: core,
          alpha: 0,
          duration: 800,
          onComplete: ()=>core.destroy(),
        });
        this.tweens.add({
          targets: purpleFlame,
          scaleX: 1.6, scaleY: 1.6,
          alpha: 0,
          duration: 1200,
          ease: 'Sine.easeOut',
          onComplete: ()=>purpleFlame.destroy(),
        });
        this.tweens.add({
          targets: smoke,
          scaleX: 2.2, scaleY: 2.2,
          alpha: 0,
          duration: 1600,
          ease: 'Sine.easeOut',
          onComplete: ()=>smoke.destroy(),
        });
        // 先頭セグメント(i=0)に龍の頭を表示・ゆっくり進む
        if(i===0){
          const head = this.add.text(segX, segY, '🐉', {fontSize:'56px'}).setOrigin(0.5).setDepth(22).setRotation(ang);
          // 頭の周りにも炎オーラ
          const headFlame = this.add.circle(segX, segY, 45, 0xcc2266, 0.4).setDepth(21);
          this.tweens.add({
            targets: headFlame,
            scaleX: 1.4, scaleY: 1.4,
            alpha: 0.7,
            duration: 600,
            yoyo: true,
            repeat: 3,
          });
          this.tweens.add({
            targets: [head, headFlame],
            x: sx + cosA * range,
            y: sy + sinA * range,
            duration: segments * segDelay,
            ease: 'Linear',
            onComplete: ()=>{
              this.tweens.add({
                targets:[head, headFlame],
                alpha:0, scaleX:2, scaleY:2,
                duration:500,
                onComplete:()=>{
                  try{head.destroy();}catch(e){}
                  try{headFlame.destroy();}catch(e){}
                },
              });
            },
          });
        }
      });
    }
    // 軌道終了時の大爆発
    this.time.delayedCall(segments * segDelay + 200, ()=>{
      const ex = sx + cosA * range;
      const ey = sy + sinA * range;
      // 紫炎の爆発(複数層)
      const finalBurst = this.add.circle(ex, ey, 30, 0xaa44ff, 0.8).setDepth(20);
      const finalFlame = this.add.circle(ex, ey, 30, 0xcc2266, 0.7).setDepth(20);
      this.tweens.add({
        targets: finalBurst,
        scaleX: 6, scaleY: 6,
        alpha: 0,
        duration: 800,
        onComplete: ()=>finalBurst.destroy(),
      });
      this.tweens.add({
        targets: finalFlame,
        scaleX: 4, scaleY: 4,
        alpha: 0,
        duration: 1000,
        onComplete: ()=>finalFlame.destroy(),
      });
      // 火の粉が四方に飛び散る
      for(let k=0;k<16;k++){
        const sparkAng = (k/16) * Math.PI * 2;
        const spark = this.add.circle(ex, ey, 4, k%2===0?0xff66cc:0xaa44ff, 0.9).setDepth(21);
        this.tweens.add({
          targets: spark,
          x: ex + Math.cos(sparkAng) * 100,
          y: ey + Math.sin(sparkAng) * 100,
          alpha: 0,
          duration: 700,
          onComplete: ()=>spark.destroy(),
        });
      }
    });
  }

  // スキルボタンを破棄して再構築
  _rebuildSkillButtons(){
    // 既存のスキル関連オブジェクトを全部破棄
    if(this._allSkillBtnObjs){
      this._allSkillBtnObjs.forEach(o=>{ try{o.destroy();}catch(e){} });
    }
    this._allSkillBtnObjs = [];
    this._skillBtns = null;
    this.skillCDOverlays = [];
    this.skillBtnRefs = [];
    this.createSkillButtons();
  }

  _createHomeButton(){
    const w=this.scale.width,h=this.scale.height;
    // ミニマップ(右上 w-166, y=6, w=160, h=120)の真下に配置
    // ミニマップ中心X = w - 160/2 - 6 = w - 86
    // ST.Xラベル y=130 の下にセーブ、さらに下にタイトル
    const BX=w-86;           // ボタン中心X(新ミニマップ幅に合わせ更新)
    const SAVE_Y=152;        // セーブボタンY(ミニマップ下端126+ラベル+余白)
    const TITLE_Y=186;       // タイトルボタンY
    const BTN_W=148, BTN_H=28;

    // ── セーブボタン(ミニマップ下・1段目) ──
    const saveBtn=this.add.rectangle(BX,SAVE_Y,BTN_W,BTN_H,0x0a2a0a,0.85)
      .setScrollFactor(0).setDepth(25).setStrokeStyle(1,0x226622,0.9)
      .setInteractive({useHandCursor:true});
    const saveTxt=this.add.text(BX,SAVE_Y,'💾 セーブ',{
      fontSize:'13px',fontFamily:'Arial',color:'#44aa44',fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    saveBtn.on('pointerover',()=>{saveBtn.setFillStyle(0x1a4a1a,0.9);saveTxt.setColor('#66cc66');});
    saveBtn.on('pointerout', ()=>{saveBtn.setFillStyle(0x0a2a0a,0.75);saveTxt.setColor('#44aa44');});
    saveBtn.on('pointerdown',()=>{
      if(this._menuOpen||this._gameOver)return;
      if(this._transitioning)return;
      // 二重起動防止
      if(this._saveDialogOpen) return;
      try{ SE('click'); }catch(e){}
      // currentSlotがあれば確認なしで即上書きセーブ
      if(this.currentSlot){
        this._performSave(this.currentSlot);
      } else {
        // 新規ゲーム or ロードしていない → スロット選択ダイアログ
        this._openSaveDialog();
      }
    });

    // ── タイトルボタン(セーブボタン下・2段目) ──
    const btn=this.add.rectangle(BX,TITLE_Y,BTN_W,BTN_H,0x223344,0.75)
      .setScrollFactor(0).setDepth(25).setStrokeStyle(1,0x445566,0.8)
      .setInteractive({useHandCursor:true});
    const txt=this.add.text(BX,TITLE_Y,'🏠 タイトル',{
      fontSize:'12px',fontFamily:'Arial',color:'#8899aa'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    btn.on('pointerover',()=>{btn.setFillStyle(0x334455,0.9);txt.setColor('#aabbcc');});
    btn.on('pointerout', ()=>{btn.setFillStyle(0x223344,0.75);txt.setColor('#8899aa');});
    btn.on('pointerdown',()=>{
      const W=this.scale.width,H=this.scale.height;
      const ov=this.add.rectangle(W/2,H/2,W,H,0x000000,0.7).setScrollFactor(0).setDepth(90).setInteractive();
      const ttl=this.add.text(W/2,H/2-40,'タイトルに戻りますか？',{fontSize:'20px',fontFamily:'Arial',color:'#ffd700',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0).setDepth(91);
      const sub=this.add.text(W/2,H/2-10,'※セーブしていないデータは失われます',{fontSize:'13px',fontFamily:'Arial',color:'#ffaa44'}).setOrigin(0.5).setScrollFactor(0).setDepth(91);
      const btnY=this.add.rectangle(W/2-70,H/2+30,120,36,0xe74c3c,0.3).setStrokeStyle(2,0xe74c3c).setScrollFactor(0).setDepth(91).setInteractive({useHandCursor:true});
      this.add.text(W/2-70,H/2+30,'戻る',{fontSize:'16px',fontFamily:'Arial',color:'#e74c3c'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
      const btnN=this.add.rectangle(W/2+70,H/2+30,120,36,0x44aaff,0.3).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(91).setInteractive({useHandCursor:true});
      this.add.text(W/2+70,H/2+30,'キャンセル',{fontSize:'16px',fontFamily:'Arial',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
      const dismiss=()=>[ov,ttl,sub,btnY,btnN].forEach(o=>{try{o.destroy();}catch(e){}});
      btnY.on('pointerdown',()=>{dismiss();stopBGM();this.physics.pause();this.tweens.killAll();this.scene.start('Title');});
      btnN.on('pointerdown',()=>dismiss());
      btnY.on('pointerover',()=>btnY.setFillStyle(0xe74c3c,0.6));btnY.on('pointerout',()=>btnY.setFillStyle(0xe74c3c,0.3));
      btnN.on('pointerover',()=>btnN.setFillStyle(0x44aaff,0.6));btnN.on('pointerout',()=>btnN.setFillStyle(0x44aaff,0.3));
    });
  }

  _onScreenResize(gameSize){
    // 画面回転やウィンドウリサイズ時にUIを再配置
    // ジョイスティック・ミニマップ・スキルボタンは固定座標で作られているため
    // 画面サイズが変わったら一旦破棄して作り直す
    try{
      // ジョイスティック関連の破棄
      if(this.joyBase){this.joyBase.destroy();this.joyBase=null;}
      if(this.joyKnob){this.joyKnob.destroy();this.joyKnob=null;}
      if(this.joyLabel){this.joyLabel.destroy();this.joyLabel=null;}
      // ミニマップ関連の破棄(複雑なのでminimapマーカーも対象)
      if(this.mmBg){this.mmBg.destroy();this.mmBg=null;}
      if(this.mmStageLabel){this.mmStageLabel.destroy();this.mmStageLabel=null;}
      if(this.mmPlayerDot){this.mmPlayerDot.destroy();this.mmPlayerDot=null;}
      if(this.mmEnemyDots){this.mmEnemyDots.forEach(d=>{try{d.destroy();}catch(e){}});this.mmEnemyDots=[];}
      // スキルボタン・攻撃ボタン関連はthis._skillBtnsとthis._atkBtnなど未管理
      // → 破棄しないが、画面回転時は新しいUIが既存の上に重なる
      // 最低限ジョイスティックとミニマップだけは再配置すれば操作性が回復する
      this.createMinimap();
      this.createJoystick();
    }catch(e){
      console.warn('UI再配置エラー:', e);
    }
  }

  // ── スキルキーから情報を解決するヘルパ ──
  // キー形式: 'n1'〜'n4'(通常), 'a_<awakKey>_<idx>'(覚醒)
  _resolveSkillKey(key){
    const pd = this.playerData;
    if(!key) return null;
    if(key[0]==='n'){
      const num = parseInt(key.slice(1));
      const defs = CLASS_SKILLS[pd.cls] || [];
      const sk = defs[num-1];
      if(!sk) return null;
      const lv = pd['sk'+num] || 0;
      // sk4(書物スキル)は習得フラグで判定
      const hasSk4 = (pd.cls==='warrior'&&pd._hasBerserk)||(pd.cls==='mage'&&pd._hasMeteoorm);
      const learned = (num===4) ? hasSk4 : (lv>0);
      const normalIcons = {
        warrior:['🌪','🛡','✨','⚔'], mage:['💥','❄️','⚡','☄'],
        archer:['🏹','⭐','🔫','🎯'], bomber:['💣','💥','🚀','🦾'],
        novice:['👊','✨','💫','⭐']
      }[pd.cls] || ['?','?','?','?'];
      return {
        key, type:'normal', num,
        name: sk.name||'?', icon: normalIcons[num-1]||'?',
        lv, learned, col: 0x2bd4bb,
        cdKey: 'skillCD'+num,
      };
    } else if(key.indexOf('a_')===0){
      // 'a_samurai_3' 形式
      const parts = key.split('_');
      const awKey = parts[1];
      const idx = parseInt(parts[2]);
      const awA = AWAKENINGS[awKey];
      if(!awA || !awA.skills || !awA.skills[idx-1]) return null;
      const sk = awA.skills[idx-1];
      let lv = (pd.awakSkillLv && pd.awakSkillLv[awKey] && pd.awakSkillLv[awKey]['sk'+idx]) || 0;
      // 覚醒中はその覚醒の全3スキルを MAX(Lv10) 扱いで発動可能にする
      if(pd.awakened === awKey){
        lv = 10;
      }
      const awakIconMap={
        samurai:['🗡','🌀','👹'], heavy:['💥','🔫','❄'],
        spirit:['🍃','✨','⭐'], youma:['🕳','🌑','🐉'],
      };
      const ic = (awakIconMap[awKey]||['✨','✨','✨'])[idx-1] || '✨';
      return {
        key, type:'awak', awakKey:awKey, awakIdx:idx,
        name: sk.name||'?', icon: ic,
        lv, learned: lv>0, col: 0xff44aa,
        cdKey: 'awakCD'+idx,
      };
    }
    return null;
  }

  createSkillButtons(){
    const w=this.scale.width,h=this.scale.height,pd=this.playerData;
    const skillCols={warrior:0xe74c3c,mage:0x9b59b6,archer:0x27ae60,bomber:0xf39c12};
    const col=skillCols[pd.cls]||0xffd700;
    const defs=this.getSkillDefs();

    // 全UI要素を追跡(再構築時の重複防止)
    if(!this._allSkillBtnObjs) this._allSkillBtnObjs = [];
    const _track = (obj)=>{ this._allSkillBtnObjs.push(obj); return obj; };

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
    const btnAtk = _track(this.add.circle(atkX,atkY,ATK_R,0xffd700,0.3)
      .setScrollFactor(0).setDepth(25)
      .setStrokeStyle(3,0xffd700,1.0)
      .setInteractive({useHandCursor:true}));
    _track(this.add.text(atkX,atkY-6,'⚔',{fontSize:'24px'}).setOrigin(0.5).setScrollFactor(0).setDepth(26));
    _track(this.add.text(atkX,atkY+18,'攻撃',{fontSize:'13px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(26));
    btnAtk.on('pointerdown',()=>{
      btnAtk.setFillStyle(0xffd700,0.7);
      this.normalAttack();
      this._atkHeld=true;
    });
    btnAtk.on('pointerup',  ()=>{btnAtk.setFillStyle(0xffd700,0.3);this._atkHeld=false;});
    btnAtk.on('pointerout', ()=>{btnAtk.setFillStyle(0xffd700,0.3);this._atkHeld=false;});

    // スキルボタン3〜7個（攻撃ボタン左に横並び）
    this.skillCDOverlays=[];
    this.skillBtnRefs=[];
    const skLabels=['Q','E','R','T','Y','U','I'];
    const skIcons={
      warrior:['🌪','🛡','✨'], mage:['💥','❄️','⚡'],
      archer:['🏹','⭐','🔫'], bomber:['💣','💥','🚀']
    };
    const sk4Icons={warrior:'⚔',mage:'☄',archer:'🏹',bomber:'💣'};
    const icons=skIcons[pd.cls]||['①','②','③'];
    // sk4は書物習得済みの場合のみ表示
    // パッシブスキル（アーチャーのブーストアタック・ボマーのボマーパワー）はボタンに出さない
    const hasSk4Active=(pd.cls==='warrior'&&pd._hasBerserk)||(pd.cls==='mage'&&pd._hasMeteoorm);
    const skNums=hasSk4Active?[1,2,3,4]:[1,2,3];

    // ── 覚醒スキル(awakSk1/2/3) を装備中の覚醒武器から取得 ──
    const eqW2 = pd.equip && pd.equip.weapon_main;
    const eqD2 = eqW2 ? EQUIP_DEFS[eqW2] : null;
    const awakKey2 = (eqD2 && eqD2.awakening) ? eqD2.awakening : null;
    const awakA2 = awakKey2 ? AWAKENINGS[awakKey2] : null;
    // 覚醒スキルのうちLv1以上のものだけボタンに追加(装備中の覚醒武器に紐づくもの限定)
    // ※覚醒中は getSkillDefs() が覚醒スキルを通常枠に返すため、追加ボタンは出さない(二重表示防止)
    const awakSkillsToShow = [];
    if(!pd.awakened && awakA2 && awakA2.skills && pd.awakSkillLv && pd.awakSkillLv[awakKey2]){
      awakA2.skills.forEach((sk, idx)=>{
        const lv = pd.awakSkillLv[awakKey2][sk.id] || 0;
        if(lv > 0){
          awakSkillsToShow.push({skillDef: sk, awakIdx: idx+1, lv: lv});
        }
      });
    }

    // ── 表示するスキルリストを決定 ──
    // 覚醒中: その覚醒職の3スキルを表示(従来通り)
    // 覚醒前: pd.skillSlots(6枠)にセットされたスキルを順に表示
    const displayList = [];  // {key, type, num/awakKey/awakIdx, ...}
    if(pd.awakened){
      // 覚醒中: 覚醒職の3スキルすべて
      const awKey = pd.awakened;
      const awA = AWAKENINGS[awKey];
      if(awA && awA.skills){
        awA.skills.forEach((sk, idx)=>{
          displayList.push({ key:'a_'+awKey+'_'+(idx+1), type:'awak', awakKey:awKey, awakIdx:idx+1 });
        });
      }
    } else {
      // 覚醒前: skillSlotsの順に表示(nullは飛ばす)
      // 形式不正のみ初期化。「全部 null なら auto-fill」は削除済み(swap バグの原因)。
      // 旧セーブの移行は GameScene.init で実施。
      if(!pd.skillSlots || !Array.isArray(pd.skillSlots) || pd.skillSlots.length!==6){
        pd.skillSlots = [null,null,null,null,null,null];
      }
      if(pd.skillSlots && Array.isArray(pd.skillSlots)){
        // 覚醒キーで Lv=0(=未習得)のものが残っていれば null 化(セーブ移行・リセット対策)
        for(let s=0;s<pd.skillSlots.length;s++){
          const k = pd.skillSlots[s];
          if(!k || typeof k!=='string') continue;
          if(k.indexOf('a_')===0){
            const parts = k.split('_');
            const awKey = parts[1];
            const idx = parseInt(parts[2]);
            const lv = (pd.awakSkillLv && pd.awakSkillLv[awKey] && pd.awakSkillLv[awKey]['sk'+idx]) || 0;
            if(lv <= 0){ pd.skillSlots[s]=null; }
          }
        }
        pd.skillSlots.forEach(key=>{
          if(!key) return;
          const info = this._resolveSkillKey(key);
          if(!info) return;
          if(info.type==='normal'){
            displayList.push({ key, type:'normal', num:info.num });
          } else {
            displayList.push({ key, type:'awak', awakKey:info.awakKey, awakIdx:info.awakIdx });
          }
        });
      }
    }
    const totalBtns = Math.max(1, displayList.length);
    this._currentSkillKeys = displayList.map(s=>s.key);

    // ボタンサイズ: 個数に応じて縮小
    let SK_W, SK_H;
    if(totalBtns <= 4){ SK_W=72; SK_H=58; }
    else if(totalBtns <= 5){ SK_W=64; SK_H=54; }
    else if(totalBtns <= 6){ SK_W=56; SK_H=50; }
    else { SK_W=50; SK_H=46; }
    const gap = totalBtns >= 6 ? 4 : 6;

    // ── 統一ボタン生成ヘルパ ──
    const makeSkillBtn = (entry, i)=>{
      const bx = atkX - ATK_R - MARGIN - SK_W/2 - (totalBtns-1-i)*(SK_W+gap);
      const by = h - SK_H/2 - MARGIN;
      const info = this._resolveSkillKey(entry.key);
      if(!info) return;
      const isAwak = (entry.type==='awak');
      const btnCol = isAwak ? 0xff44aa : col;
      const learned = info.learned;
      const baseAlpha = isAwak ? 0.45 : (learned?0.4:0.12);
      const btn = _track(this.add.rectangle(bx,by,SK_W,SK_H,btnCol,baseAlpha)
        .setScrollFactor(0).setDepth(25)
        .setStrokeStyle(learned?2:1, btnCol, learned?1.0:0.4)
        .setInteractive({useHandCursor:true}));
      const iconSize = totalBtns >= 6 ? '20px' : '26px';
      _track(this.add.text(bx,by-14,info.icon,{fontSize:iconSize}).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      const nm = info.name.length>6 ? info.name.substr(0,5)+'…' : info.name;
      const nameTxt=_track(this.add.text(bx,by+10,nm,{
        fontSize: totalBtns>=6?'9px':'11px', fontFamily:'Arial',
        color: isAwak?'#ffffff':(learned?'#000000':'#667788'),
        stroke: isAwak?'#aa1166':(learned?'#ffffff':'#223344'),
        strokeThickness: isAwak?2:(learned?3:1),
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      const lvTxt=_track(this.add.text(bx,by+22,'Lv'+info.lv,{
        fontSize:'10px', fontFamily:'Arial',
        color: isAwak?'#ffffff':(learned?'#000000':'#445566'),
        stroke: isAwak?'#aa1166':(learned?'#ffffff':'#223344'),
        strokeThickness: isAwak?2:(learned?2:1),
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      // クリック処理
      if(isAwak){
        const ai = info.awakIdx;
        const ak = info.awakKey;  // スロットの覚醒種別(装備武器と違う覚醒のスキルでも判定する)
        btn.on('pointerdown',()=>{ btn.setFillStyle(btnCol,0.75); this.useAwakSkill(ai, ak); });
        btn.on('pointerup',  ()=>btn.setFillStyle(btnCol,0.45));
        btn.on('pointerout', ()=>btn.setFillStyle(btnCol,0.45));
      } else {
        const num = info.num;
        btn.on('pointerdown',()=>{ const has=this.playerData['sk'+num]>0; btn.setFillStyle(btnCol,has?0.75:0.15); this.useSkill(num); });
        btn.on('pointerup',  ()=>{const has=this.playerData['sk'+num]>0; btn.setFillStyle(btnCol,has?0.4:0.12);});
        btn.on('pointerout', ()=>{const has=this.playerData['sk'+num]>0; btn.setFillStyle(btnCol,has?0.4:0.12);});
      }
      // CDオーバーレイ
      const ov=_track(this.add.rectangle(bx,by,SK_W,SK_H,0x000000,0).setScrollFactor(0).setDepth(27));
      const ct=_track(this.add.text(bx,by,'',{fontSize:'16px',fontFamily:'Arial',color:'#ffffff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0).setDepth(28));
      this.skillCDOverlays.push({key: info.cdKey, ov, ct});
      this.skillBtnRefs.push({btn, nameTxt, lvTxt,
        num: isAwak?(4+info.awakIdx):info.num,
        col: btnCol, isAwak, awakIdx: isAwak?info.awakIdx:undefined,
        skillKey: entry.key });
    };

    displayList.forEach((entry,i)=>makeSkillBtn(entry,i));

    /* ===== 旧スキルボタン配置(無効化) =====
    const skillList_OLD = [];
    skNums.forEach(num=>{
      skillList.push({ key:'n'+num, type:'normal', num:num });
    });
    awakSkillsToShow.forEach(info=>{
      skillList.push({ key:'a'+info.awakIdx, type:'awak', awakIdx:info.awakIdx, info:info });
    });
    // pd.skillOrder(キー配列)があれば、その順に並べ替え
    if(pd.skillOrder && Array.isArray(pd.skillOrder)){
      const orderMap = {};
      pd.skillOrder.forEach((k,idx)=>{ orderMap[k]=idx; });
      skillList.sort((a,b)=>{
        const ia = (orderMap[a.key]!==undefined) ? orderMap[a.key] : 999;
        const ib = (orderMap[b.key]!==undefined) ? orderMap[b.key] : 999;
        return ia - ib;
      });
    }
    // 配置順のキー配列を保持(並び替えUI用)
    this._currentSkillKeys = skillList.map(s=>s.key);

    // ボタンサイズ: 個数に応じて縮小
    let SK_W, SK_H;
    if(totalBtns <= 4){
      SK_W = 72; SK_H = 58;
    } else if(totalBtns <= 5){
      SK_W = 64; SK_H = 54;
    } else if(totalBtns <= 6){
      SK_W = 56; SK_H = 50;
    } else {
      SK_W = 50; SK_H = 46;  // 7個
    }
    const gap = totalBtns >= 6 ? 4 : 6;

    // 通常スキル
    skNums.forEach((num,idx0)=>{
      const sk=defs[num-1]||{name:'---'};
      const hasSkill=pd['sk'+num]>0||(num===4&&hasSk4Active);
      const c=hasSkill?col:0x445566;
      const alpha=hasSkill?0.4:0.12;
      // skillList内での位置を取得(並び替え反映)
      const i = this._currentSkillKeys.indexOf('n'+num);
      // ボタンを左に詰める
      const bx = atkX - ATK_R - MARGIN - SK_W/2 - (totalBtns-1-i)*(SK_W+gap);
      const by = h - SK_H/2 - MARGIN;
      // ボタン本体
      const btn=_track(this.add.rectangle(bx,by,SK_W,SK_H,c,alpha)
        .setScrollFactor(0).setDepth(25)
        .setStrokeStyle(hasSkill?2:1,c,hasSkill?1.0:0.4)
        .setInteractive({useHandCursor:true}));
      // スキルアイコン（sk4は専用アイコン）
      const iconStr=num===4?(sk4Icons[pd.cls]||'✨'):(icons[num-1]||'?');
      const iconSize = totalBtns >= 6 ? '20px' : '26px';
      _track(this.add.text(bx,by-14,iconStr,{fontSize:iconSize}).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      // スキル名（黒文字・白縁取りで強調）
      const nameTxt=_track(this.add.text(bx,by+10,sk.name,{
        fontSize:'11px',fontFamily:'Arial',
        color:hasSkill?'#000000':'#667788',
        stroke:hasSkill?'#ffffff':'#223344',
        strokeThickness:hasSkill?3:1,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      // Lvテキスト（白・縁取り）
      const lvTxt=_track(this.add.text(bx,by+22,'Lv'+(pd['sk'+num]||0),{
        fontSize:'10px',fontFamily:'Arial',
        color:hasSkill?'#000000':'#445566',
        stroke:hasSkill?'#ffffff':'#223344',
        strokeThickness:hasSkill?2:1,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      btn.on('pointerdown',()=>{
        const has=this.playerData['sk'+num]>0;
        btn.setFillStyle(col,has?0.75:0.15);
        this.useSkill(num);
      });
      btn.on('pointerup',  ()=>{const has=this.playerData['sk'+num]>0;btn.setFillStyle(col,has?0.4:0.12);});
      btn.on('pointerout', ()=>{const has=this.playerData['sk'+num]>0;btn.setFillStyle(col,has?0.4:0.12);});
      // CDオーバーレイ
      const ov=_track(this.add.rectangle(bx,by,SK_W,SK_H,0x000000,0).setScrollFactor(0).setDepth(27));
      const ct=_track(this.add.text(bx,by,'',{fontSize:'16px',fontFamily:'Arial',color:'#ffffff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0).setDepth(28));
      this.skillCDOverlays.push({key:'skillCD'+num,ov,ct});
      this.skillBtnRefs.push({btn,nameTxt,lvTxt,num,col});
    });

    // ── 覚醒スキルボタン (Lv1以上習得済みのもの・ピンク枠) ──
    const awakCol = 0xff44aa;  // ピンク
    awakSkillsToShow.forEach((info, j)=>{
      const sk = info.skillDef;
      const awakIdx = info.awakIdx;  // 1〜3
      const lv = info.lv;
      const i = this._currentSkillKeys.indexOf('a'+awakIdx);  // 並び替え反映
      const bx = atkX - ATK_R - MARGIN - SK_W/2 - (totalBtns-1-i)*(SK_W+gap);
      const by = h - SK_H/2 - MARGIN;
      const btn = _track(this.add.rectangle(bx, by, SK_W, SK_H, awakCol, 0.45)
        .setScrollFactor(0).setDepth(25)
        .setStrokeStyle(2, awakCol, 1.0)
        .setInteractive({useHandCursor:true}));
      // 覚醒スキルのアイコン(クラス別)
      const awakIcons={
        samurai:['🗡','🌀','👹'],
        heavy:['💥','🔫','❄'],
        spirit:['🍃','✨','⭐'],
        youma:['🕳','🌑','🐉'],
      };
      const aIcons = awakIcons[awakKey2] || ['✨','✨','✨'];
      const iconStr = aIcons[awakIdx-1] || '✨';
      const iconSize = totalBtns >= 6 ? '20px' : '24px';
      _track(this.add.text(bx, by-14, iconStr, {fontSize:iconSize}).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      // スキル名(短く)
      const skName = sk.name;
      const nameTxt = _track(this.add.text(bx, by+10, skName.length>6?skName.substr(0,5)+'…':skName, {
        fontSize: totalBtns >= 6 ? '9px' : '10px',
        fontFamily:'Arial',
        color:'#ffffff', stroke:'#aa1166', strokeThickness:2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      // Lv表示
      const lvTxt = _track(this.add.text(bx, by+22, 'Lv'+lv, {
        fontSize:'10px', fontFamily:'Arial',
        color:'#ffffff', stroke:'#aa1166', strokeThickness:2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
      // クリック処理: 覚醒スキル発動 (num: 5/6/7 で発火)
      const virtualNum = 4 + awakIdx;  // 5,6,7
      btn.on('pointerdown', ()=>{
        btn.setFillStyle(awakCol, 0.75);
        this.useAwakSkill(awakIdx);
      });
      btn.on('pointerup', ()=>{btn.setFillStyle(awakCol, 0.45);});
      btn.on('pointerout',()=>{btn.setFillStyle(awakCol, 0.45);});
      // CDオーバーレイ
      const ov = _track(this.add.rectangle(bx, by, SK_W, SK_H, 0x000000, 0).setScrollFactor(0).setDepth(27));
      const ct = _track(this.add.text(bx, by, '', {fontSize:'16px',fontFamily:'Arial',color:'#ffffff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0).setDepth(28));
      this.skillCDOverlays.push({key:'awakCD'+awakIdx, ov, ct});
      this.skillBtnRefs.push({btn, nameTxt, lvTxt, num:virtualNum, col:awakCol, isAwak:true, awakIdx});
    });
    ===== 旧スキルボタン配置ここまで ===== */

    // ポーションボタン（ジョイスティック右、下部中央寄り）
    const POT_W=50, POT_H=44;
    const potBaseX=200;
    // HP
    const btnF=_track(this.add.rectangle(potBaseX,h-POT_H/2-MARGIN,POT_W,POT_H,0x2ecc71,0.28)
      .setScrollFactor(0).setDepth(25).setStrokeStyle(2,0x2ecc71,1.0)
      .setInteractive({useHandCursor:true}));
    _track(this.add.text(potBaseX,h-POT_H/2-MARGIN-10,'💊',{fontSize:'16px'}).setOrigin(0.5).setScrollFactor(0).setDepth(26));
    this.potHPTxt=_track(this.add.text(potBaseX,h-POT_H/2-MARGIN+10,'x'+(pd.potHP||0),{
      fontSize:'14px',fontFamily:'Arial',color:'#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
    btnF.on('pointerdown',()=>{btnF.setFillStyle(0x2ecc71,0.7);this.usePotion('hp');});
    btnF.on('pointerup',  ()=>btnF.setFillStyle(0x2ecc71,0.28));
    btnF.on('pointerout', ()=>btnF.setFillStyle(0x2ecc71,0.28));
    // MP
    const btnG=_track(this.add.rectangle(potBaseX+58,h-POT_H/2-MARGIN,POT_W,POT_H,0x3498db,0.28)
      .setScrollFactor(0).setDepth(25).setStrokeStyle(2,0x3498db,1.0)
      .setInteractive({useHandCursor:true}));
    _track(this.add.text(potBaseX+58,h-POT_H/2-MARGIN-10,'💧',{fontSize:'16px'}).setOrigin(0.5).setScrollFactor(0).setDepth(26));
    this.potMPTxt=_track(this.add.text(potBaseX+58,h-POT_H/2-MARGIN+10,'x'+(pd.potMP||0),{
      fontSize:'14px',fontFamily:'Arial',color:'#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26));
    btnG.on('pointerdown',()=>{btnG.setFillStyle(0x3498db,0.7);this.usePotion('mp');});
    btnG.on('pointerup',  ()=>btnG.setFillStyle(0x3498db,0.28));
    btnG.on('pointerout', ()=>btnG.setFillStyle(0x3498db,0.28));
  }

  createMinimap(){
    const w=this.scale.width,h=this.scale.height;
    // 大きめのミニマップ(160x120)
    const mw=160,mh=120,mx=w-mw-6,my=6;
    const cfg=this.cfg;

    // ── ミニマップ枠の背景(黒の余白) ──
    this.mmBg=this.add.rectangle(mx,my,mw,mh,0x000000,0.85).setOrigin(0).setScrollFactor(0).setDepth(20).setStrokeStyle(2,0xffd700);

    // ── マップ画像をアスペクト比保持で縮小表示 ──
    // ワールドとミニマップのアスペクト比を比較してフィットさせる
    const worldAspect=this.MW/this.MH;
    const mmAspect=mw/mh;
    let drawW, drawH, drawX, drawY;
    if(worldAspect > mmAspect){
      // 横長: 幅基準でフィット、上下に余白
      drawW=mw; drawH=mw/worldAspect;
      drawX=mx; drawY=my+(mh-drawH)/2;
    } else {
      // 縦長または正方形: 高さ基準でフィット、左右に余白
      drawH=mh; drawW=mh*worldAspect;
      drawX=mx+(mw-drawW)/2; drawY=my;
    }
    // ミニマップ内の有効描画範囲を保存(以降のマーカー座標計算で使う)
    this.mmDrawX=drawX; this.mmDrawY=drawY;
    this.mmDrawW=drawW; this.mmDrawH=drawH;
    this.mmX=mx; this.mmY=my; this.mmW=mw; this.mmH=mh;

    // マップ画像があれば縮小表示(透明度を下げて視認性確保)
    if(cfg.mapImage && this.textures.exists(cfg.mapImage)){
      this.mmMapImage=this.add.image(drawX, drawY, cfg.mapImage).setOrigin(0,0).setDisplaySize(drawW, drawH).setScrollFactor(0).setDepth(20.5).setAlpha(0.75);
    }

    // ステージラベル
    this.mmStageLabel=this.add.text(mx+mw/2,my+mh+4,'ST.'+this.stage,{fontSize:'12px',fontFamily:'Arial',color:'#ffd700',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setScrollFactor(0).setDepth(21);

    // プレイヤー(金●・少し大きめで視認性UP)
    this.mmPlayerDot=this.add.circle(0,0,4,0xffd700,1).setScrollFactor(0).setDepth(24).setStrokeStyle(1,0x000000,0.9);
    this.mmEnemyDots=[];
    // 動的マーカー(updateMinimap毎に再生成: 敵・ボス)以外を保持
    this.mmStaticObjs=[];

    // 座標変換ヘルパ(ワールド座標 → ミニマップ座標・アスペクト比保持版)
    const px2mm=(wx,wy)=>({
      x:drawX+wx/this.MW*drawW,
      y:drawY+wy/this.MH*drawH
    });
    // 共通: 静的マーカー登録ヘルパ
    const addMarker=(wx,wy,color,sym,symColor,r)=>{
      const pp=px2mm(wx,wy);
      const dot=this.add.circle(pp.x,pp.y,r||5,color,0.95).setScrollFactor(0).setDepth(22).setStrokeStyle(1,0x000000,0.7);
      this.mmStaticObjs.push(dot);
      if(sym){
        const t=this.add.text(pp.x,pp.y-9,sym,{fontSize:'10px',fontFamily:'Arial',color:symColor||'#ffffff',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setScrollFactor(0).setDepth(23);
        this.mmStaticObjs.push(t);
      }
    };

    // ── 戻るポータル(水色 ◀) ──
    if(cfg.portalBack!==null&&cfg.portalBack!==undefined){
      const pbX2=cfg.portalBackX!==undefined?cfg.portalBackX:80;
      const pbY2=cfg.portalBackY!==undefined?cfg.portalBackY:this.MH/2;
      addMarker(pbX2,pbY2,0x00e5ff,'◀','#00e5ff');
    }
    // ── 進むポータル(緑 ▶) ※ボス撃破後に開放 ──
    if(cfg.portalTo!==null&&cfg.portalTo!==undefined){
      const pnX2=cfg.portalNextX!==undefined?cfg.portalNextX:this.MW-80;
      const pnY2=cfg.portalNextY!==undefined?cfg.portalNextY:this.MH/2;
      addMarker(pnX2,pnY2,0x44ff88,'▶','#44ff88');
    }
    // ── 別ルートポータル(オレンジ ★) ──
    if(cfg.portalAlt){
      addMarker(cfg.portalAlt.x,cfg.portalAlt.y,0xf39c12,'★','#f39c12');
    }
    // ── 南方向ポータル(オレンジ ▼) ──
    if(cfg.portalSouth!==null&&cfg.portalSouth!==undefined&&cfg.portalSouthX!==undefined){
      addMarker(cfg.portalSouthX,cfg.portalSouthY,0xff8844,'▼','#ffaa66');
    }
    // ── マジックポータル(青魔法門・紫 ✦) ──
    if(cfg.magicGate){
      addMarker(cfg.magicGate.x,cfg.magicGate.y,0xaa66ff,'✦','#cc99ff');
    }
    // ── ダンジョンゲート(暗赤 ⛬) ──
    if(cfg.dungeonGate){
      addMarker(cfg.dungeonGate.x,cfg.dungeonGate.y,0x884422,'⛬','#ddaa66');
    }
    // ── 町の建物(イベント発火位置) ──
    // 建物中心にショップタイプ別アイコン
    if(cfg.buildings && Array.isArray(cfg.buildings)){
      const bIcon={
        guild:     {col:0xaa66ff, sym:'✨'}, // ポータル屋
        inn:       {col:0xff9966, sym:'🏨'}, // 宿屋
        shop:      {col:0x66ccff, sym:'🏪'}, // アイテム屋
        blacksmith:{col:0xff6644, sym:'🔨'}, // 鍛冶屋
        magic:     {col:0xcc88ff, sym:'📖'}, // スキル屋
        jobchange: {col:0xffd700, sym:'🔄'}, // 転職屋
      };
      cfg.buildings.forEach(b=>{
        const cx=b.x+(b.w||0)/2, cy=b.y+(b.h||0)/2;
        const info=bIcon[b.type]||{col:0xcccccc, sym:'■'};
        const pp=px2mm(cx,cy);
        // 建物は四角マーカーで区別
        const dot=this.add.rectangle(pp.x,pp.y,6,6,info.col,1).setScrollFactor(0).setDepth(22).setStrokeStyle(1,0x000000,0.8);
        this.mmStaticObjs.push(dot);
      });
    }
    // ── NPC(💬青緑) ──
    if(cfg.npcs && Array.isArray(cfg.npcs)){
      cfg.npcs.forEach(n=>{
        addMarker(n.x,n.y,0x44ddaa,'💬','#88ffcc',4);
      });
    }
  }
  updateMinimap(){
    const p=this.player;
    // プレイヤー位置(アスペクト比保持版の有効描画範囲を使う)
    this.mmPlayerDot.setPosition(
      this.mmDrawX + p.x/this.MW*this.mmDrawW,
      this.mmDrawY + p.y/this.MH*this.mmDrawH
    );
    this.mmEnemyDots.forEach(d=>d.destroy());
    this.mmEnemyDots=[];
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      const mx2=this.mmDrawX + ed.sprite.x/this.MW*this.mmDrawW;
      const my2=this.mmDrawY + ed.sprite.y/this.MH*this.mmDrawH;
      if(ed.isBoss){
        // ボス: ポップなドクロ(赤い円 + 💀記号)
        const bg=this.add.circle(mx2,my2,6,0xff2222,0.95).setScrollFactor(0).setDepth(22).setStrokeStyle(1.5,0xffffff,0.95);
        const sk=this.add.text(mx2,my2,'💀',{fontSize:'10px',fontFamily:'Arial'}).setOrigin(0.5).setScrollFactor(0).setDepth(23);
        this.mmEnemyDots.push(bg);
        this.mmEnemyDots.push(sk);
      } else {
        const dot=this.add.circle(mx2,my2,2.5,0xff6363,1).setScrollFactor(0).setDepth(22).setStrokeStyle(0.5,0x000000,0.6);
        this.mmEnemyDots.push(dot);
      }
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
      fontSize:'10px',fontFamily:'Arial',color:'#ffffff'
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
    // バスターキャノン等で移動ロックされている時も静止
    if(this._lockMovement){p.setVelocity(0,0);return;}
    const kl=this.cursors.left.isDown||this.wasd.A.isDown;
    const kr=this.cursors.right.isDown||this.wasd.D.isDown;
    const ku=this.cursors.up.isDown||this.wasd.W.isDown;
    const kd=this.cursors.down.isDown||this.wasd.S.isDown;
    let vx=kl?-1:kr?1:this.joyDx||0;
    let vy=ku?-1:kd?1:this.joyDy||0;
    const len=Math.sqrt(vx*vx+vy*vy);
    if(len>1){vx/=len;vy/=len;}
    // ── 1枚絵マップの色判別による壁衝突判定(緩めにして引っかかり防止) ──
    if(this._mapMaskCtx){
      const halfW = Math.min(14, (p.displayWidth||64)*0.18);
      const halfH = Math.min(14, (p.displayHeight||64)*0.18);
      const speed = pd.spd;
      const lookAhead = Math.max(8, speed*0.06);
      // X方向単独判定
      const canX = (vx===0) || this._canMoveTo(p.x + vx*lookAhead, p.y, halfW, halfH);
      // Y方向単独判定
      const canY = (vy===0) || this._canMoveTo(p.x, p.y + vy*lookAhead, halfW, halfH);
      if(!canX) vx=0;
      if(!canY) vy=0;
      // スタック判定: 中心点1ポイントのみで判断(緩い)
      // 5点判定で false でも、中心が床なら歩けるとみなす
      if(!this._isWalkable(p.x, p.y)){
        // 中心も壁=本当にスタック → 直近の安全位置(_lastSafePos)へ戻す
        if(this._lastSafePos){
          p.x=this._lastSafePos.x; p.y=this._lastSafePos.y;
        }
      } else {
        // 中心は床にいる → 安全位置として記録(次回スタック時の戻り先)
        this._lastSafePos = {x:p.x, y:p.y};
      }
    }
    p.setVelocity(vx*pd.spd,vy*pd.spd);
    // ボマーアニメ更新
    if(pd.cls==='bomber'||pd.cls==='mage'||pd.cls==='archer'||pd.cls==='warrior'||pd.cls==='novice') this._updateSpriteAnim(vx,vy);
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

  _updateSpriteAnim(vx,vy){
    const p=this.player,clsRaw=this.playerData.cls;
    // ノービスも自前のアニメを持つ
    const cls = clsRaw;
    if(cls!=='bomber'&&cls!=='mage'&&cls!=='archer'&&cls!=='warrior'&&cls!=='novice') return;
    // 覚醒中は専用prefix(AWAKENINGSのanimPrefixを参照)
    let prefix=cls;
    const awD0 = this.playerData.awakened ? AWAKENINGS[this.playerData.awakened] : null;
    if(awD0 && awD0.animPrefix) prefix = awD0.animPrefix;
    const cur=p.anims.currentAnim;
    if(cur&&cur.key.endsWith('_atk')&&p.anims.isPlaying) return;

    const moving=Math.abs(vx)>0.1||Math.abs(vy)>0.1;
    let facing=this._facing||'front';
    let flip=this._facingFlip||false;
    if(moving){
      if(Math.abs(vy)>Math.abs(vx)*0.5){facing=vy<0?'back':'front';flip=false;}
      else{
        facing='side';
        // 通常クラスの基準: archer/warrior/noviceは右向き基準、mage/bomberは左向き基準
        flip=(cls==='archer'||cls==='warrior'||cls==='novice')?vx>0:vx<0;
        // 覚醒中はAWAKENINGSのfacingFlipで上書き
        if(awD0 && awD0.facingFlip){
          if(awD0.facingFlip==='left') flip=vx<0;        // 右向き基準(左に動くと反転)
          else if(awD0.facingFlip==='right') flip=vx>0;  // 左向き基準(右に動くと反転)
          // 'none' は通常クラス基準のまま
          else if(awD0.facingFlip==='none') flip=vx<0;
        }
      }
    }
    this._facing=facing; this._facingFlip=flip;
    p.setFlipX(flip);
    const key=prefix+'_'+facing+'_'+(moving?'walk':'idle');
    if(!cur||cur.key!==key) p.play(key,true);
  }

  // bomber後方互換
  _updateBomberAnim(vx,vy){ this._updateSpriteAnim(vx,vy); }

  playSpriteAtk(){
    const p=this.player,cls=this.playerData.cls;
    if(cls!=='bomber'&&cls!=='mage'&&cls!=='archer'&&cls!=='warrior'&&cls!=='novice') return;
    // 覚醒中は専用アニメ(AWAKENINGSのanimPrefix参照)
    let prefix=cls;
    const awD1 = this.playerData.awakened ? AWAKENINGS[this.playerData.awakened] : null;
    if(awD1 && awD1.animPrefix) prefix = awD1.animPrefix;
    const key=prefix+'_'+(this._facing||'front')+'_atk';
    p.play(key,true);
    p.once('animationcomplete',()=>{
      p.play(prefix+'_'+(this._facing||'front')+'_idle',true);
    });
  }

  playBomberAtk(){ this.playSpriteAtk(); }
  updateAutoAtk(dt){
    // 自動攻撃廃止 - ボタンで手動攻撃
  }

  // ── 敵スポーン ────────────────────────────────
  spawnEnemy(id,x,y){
    const def=ENEMY_DEFS[id]||ENEMY_DEFS.slime;
    // スポーン位置が壁内だと敵が詰まってしまうので、安全な近傍を探す
    // 範囲を広く取って確実に歩ける位置を見つける
    const safe=this._findSafeSpawnPos(x, y, 400);
    // 完全に歩けない場所(壁内・水中)ならスポーンキャンセル
    if(!safe){
      console.warn('[spawnEnemy] skipped (unreachable):', id, x, y);
      return null;
    }
    x=safe.x; y=safe.y;
    const sp=this.enemies.create(x,y,'enemy_'+id).setDisplaySize(def.sz,def.sz).setDepth(4);
    sp.setCollideWorldBounds(true);
    const ed={
      id,sprite:sp,hp:def.hp,mhp:def.hp,atk:def.atk,def:def.def,spd:def.spd,
      element:def.element||'none',
      exp:def.exp,gold:def.gold,rng:def.rng,acd:def.acd,
      attackTimer:def.acd+Math.random()*def.acd,
      isBoss:!!def.isBoss,dead:false,
      // ⑤ 追加フラグ
      sleeping:true,        // スリープ状態
      passive:!!def.passive, // 受動フラグ（モンスター定義から取得）
      aggro:false,           // 攻撃を受けたらtrue（受動モンスターが反撃モードに）
      wanderTimer:0,         // ふらつきタイマー
      wanderVx:0,wanderVy:0,
      frozen:false,         // 凍結
      frozenTimer:0,
      knockTimer:0,         // ノックバック
      knockVx:0,knockVy:0,
    };
    ed.hpBarBg=this.add.rectangle(x,y-def.sz/2-6,def.sz,5,0x333333).setDepth(5);
    ed.hpBar=this.add.rectangle(x-def.sz/2,y-def.sz/2-6,def.sz,5,0xe74c3c).setOrigin(0,0.5).setDepth(6);
    // 敵の名前ラベル(HPバーの上)
    const enemyName=ENEMY_NAMES[id]||id;
    ed.nameLabel=this.add.text(x, y-def.sz/2-14, enemyName, {
      fontSize: ed.isBoss?'13px':'10px',
      fontFamily:'Arial',
      color: ed.isBoss?'#ff6644':'#ffeecc',
      fontStyle:'bold',
      stroke:'#000',
      strokeThickness:2
    }).setOrigin(0.5).setDepth(6);
    this.enemyDataList.push(ed);
    if(ed.isBoss){this.bossData=ed;this.updateBossHP(ed);}
    return ed;
  }
  spawnBoss(){
    if(this.bossSpawned)return;
    this.bossSpawned=true;
    this.spawnEnemy(this.cfg.boss.id,this.cfg.boss.x,this.cfg.boss.y);
    // SE は即座に鳴らす(警告音)
    SE('boss');
    // 画面演出
    this.cameras.main.shake(500,0.02);
    this.cameras.main.flash(400,200,0,0);
    const ann=this.add.text(this.scale.width/2,this.scale.height/2-20,'⚠ BOSS 出現 ⚠',{fontSize:'36px',fontFamily:'Arial',color:'#e74c3c',stroke:'#000',strokeThickness:5}).setOrigin(0.5).setScrollFactor(0).setDepth(50);
    this.tweens.add({targets:ann,alpha:0,duration:2000,delay:1000,onComplete:()=>ann.destroy()});
    // BGM切替は SE と画面演出が落ち着いた後(500ms 待機)
    // - AudioContext の競合回避
    // - 画面シェイク後にレンダリング負荷が下がってから音楽切替
    this.time.delayedCall(500, ()=>{
      try{ startBGM('boss'); }catch(e){ console.warn('[BGM] boss BGM failed:', e); }
    });
  }

  // ── ヒット処理（③命中/クリティカル対応）─────────
  hitEnemy(ed,dmg,isCrit=false,isSkill=false,elemLabel=null){
    if(ed.dead)return;
    // 凍結中はダメージ1.5倍・解除
    if(ed.frozen){dmg=Math.floor(dmg*1.5);ed.frozen=false;ed.sprite.clearTint();if(ed._iceImg){ed._iceImg.destroy();ed._iceImg=null;}}
    dmg=Math.floor(dmg); // 小数点以下切り捨て
    ed.hp-=dmg;
    // 攻撃を受けたらaggro（ST1の受動的AI解除）
    ed.aggro=true;
    // ノックバック（bomberのみ）
    const p=this.player;
    if(this.playerData.cls==='bomber'){
      const ang=Phaser.Math.Angle.Between(p.x,p.y,ed.sprite.x,ed.sprite.y);
      ed.knockVx=Math.cos(ang)*200;ed.knockVy=Math.sin(ang)*200;ed.knockTimer=0.2;
    }
    const sx=ed.sprite.x, sy=ed.sprite.y;
    // 属性相性によるダメージ数値の装飾:
    //   弱点 (WEAK!) → 💥 ... 💥 で両側を挟んで強調
    //   耐性 (RESIST) → 🌀 を頭だけに付けて「効果いまひとつ」を示唆
    const isWeak    = (elemLabel === 'WEAK!');
    const isResist  = (elemLabel === 'RESIST');
    if(isCrit){
      SE('crit');
      const critType=isSkill?'skillcrit':'crit';
      let critTxt;
      if(isWeak)        critTxt = '💥 '+dmg+'!! 💥';
      else if(isResist) critTxt = '🌀 '+dmg+'!!';
      else              critTxt = isSkill?'💥 '+dmg+'!!':'★ '+dmg+'!!';
      this.showFloat(sx,sy-ed.sprite.displayHeight/2,critTxt,'#ffee00',critType);
      this.showHitEffect(sx,sy,'crit');
      this.cameras.main.flash(80,255,180,0);
    }else{
      SE('hit');
      const normalType=isSkill?'skill':'normal';
      let normalTxt;
      if(isWeak)        normalTxt = '💥 '+dmg+' 💥';
      else if(isResist) normalTxt = '🌀 '+dmg;
      else              normalTxt = isSkill?'⚡ '+dmg:'-'+dmg;
      const normalCol=isSkill?'#44ffff':'#ffffff';
      this.showFloat(sx,sy-ed.sprite.displayHeight/2,normalTxt,normalCol,normalType);
      this.showHitEffect(sx,sy,'normal');
    }
    // 属性ラベル(WEAK!/RESIST)を上に追加表示
    if(elemLabel==='WEAK!'){
      this.showFloat(sx, sy-ed.sprite.displayHeight/2-20, 'WEAK!', '#ff44ff', 'info');
      // 弱点ヒット時の派手なエフェクト(紫の閃光)
      const flash=this.add.circle(sx,sy,40,0xff44ff,0.6).setDepth(8);
      this.tweens.add({targets:flash,scaleX:1.8,scaleY:1.8,alpha:0,duration:300,onComplete:()=>flash.destroy()});
    }else if(elemLabel==='RESIST'){
      this.showFloat(sx, sy-ed.sprite.displayHeight/2-20, 'RESIST', '#888888', 'info');
    }
    const pct=Math.max(0,ed.hp/ed.mhp);
    ed.hpBar.setSize(ed.hpBarBg.width*pct,5).setFillStyle(pct>0.5?0x2ecc71:pct>0.25?0xf39c12:0xe74c3c);
    // ヒットフラッシュ（敵が赤く光る）
    ed.sprite.setTint(0xff4444);
    this.time.delayedCall(120,()=>{if(!ed.dead&&ed.sprite.active)ed.sprite.clearTint();});
    // 多段ヒット時に alpha tween が重なると yoyo の戻り先が中途半端な値で
    // 固定され「敵が薄くなったまま」になるバグを防ぐ:
    //  1) 進行中の hit tween があれば停止 (ed._hitTween)
    //  2) alpha を明示的に 1.0 にリセットしてから新規 tween
    //  3) onComplete/onStop で必ず 1.0 に戻す
    if(ed._hitTween){ try{ed._hitTween.stop();}catch(e){} ed._hitTween=null; }
    ed.sprite.setAlpha(1.0);
    ed._hitTween = this.tweens.add({
      targets: ed.sprite,
      alpha: 0.3,
      duration: 80,
      yoyo: true,
      onComplete: ()=>{ if(ed.sprite && ed.sprite.active) ed.sprite.setAlpha(1.0); ed._hitTween=null; },
      onStop:     ()=>{ if(ed.sprite && ed.sprite.active) ed.sprite.setAlpha(1.0); ed._hitTween=null; },
    });
    if(ed.isBoss)this.updateBossHP(ed);
    if(ed.hp<=0)this.killEnemy(ed);
  }

  killEnemy(ed){
    ed.dead=true;
    const pd=this.playerData;
    // ※モンスター撃破時のゴールド付与は廃止。ゴールドは収集品をショップで売って稼ぐ。
    pd.exp+=ed.exp;pd.kills++;
    if(!ed.isBoss)this.killCount++;
    SE('exp');
    // モンスター種別ごとの撃破SE
    SE(KILL_SE[ed.id]||'kill_grunt');
    // ジョブEXP付与（通常EXPの60%）
    this.addJobExp(Math.floor(ed.exp*0.6));
    // ── 覚醒システム: ゲージ蓄積 ──
    if(!pd.awakened){
      // 通常時: ゲージを溜める(雑魚+5、ボス+30)
      const gain = ed.isBoss ? 30 : 5;
      pd.awakGauge = Math.min(pd.awakGaugeMax||100, (pd.awakGauge||0) + gain);
      // ゲージMAX演出
      if(pd.awakGauge >= (pd.awakGaugeMax||100) && !pd._awakReadyShown){
        pd._awakReadyShown = true;
        const p = this.player;
        if(p) this.showFloat(p.x, p.y-60, '✨ 覚醒準備完了 ✨', '#ffeecc', 'boost');
      }
      if(this._updateAwakeningButton) this._updateAwakeningButton();
    } else {
      // 覚醒中: awakExp 蓄積(通常EXPの0.3倍 = 抑制)
      pd.awakExp = (pd.awakExp||0) + ed.exp * 0.3;
      // awakExp 500ごとに awakSp +1 (雑魚30体程度で1pt)
      const newPts = Math.floor(pd.awakExp / 500);
      const oldPts = pd._awakSpEarned || 0;
      if(newPts > oldPts){
        const diff = newPts - oldPts;
        pd.awakSp = (pd.awakSp || 0) + diff;
        pd._awakSpEarned = newPts;
        const p = this.player;
        if(p) this.showFloat(p.x, p.y-70, '+'+diff+' 覚醒ポイント', '#ffaa00', 'boost');
      }
    }
    // ドロップ（ポーション）
    if(ed.isBoss){
      const d1=this.drops.create(ed.sprite.x-20,ed.sprite.y,'drop_hp_potion').setDisplaySize(24,24);d1.setData('type','hp');d1.refreshBody();
      const d2=this.drops.create(ed.sprite.x,   ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d2.setData('type','mp');d2.refreshBody();
      const d3=this.drops.create(ed.sprite.x+20,ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d3.setData('type','mp');d3.refreshBody();
    }else{
      if(Math.random()<0.1){const d=this.drops.create(ed.sprite.x,ed.sprite.y,'drop_hp_potion').setDisplaySize(24,24);d.setData('type','hp');d.refreshBody();}
      if(Math.random()<0.1){const d=this.drops.create(ed.sprite.x,ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d.setData('type','mp');d.refreshBody();}
    }
    // ドロップ（素材アイテム）：フィールドにアイコン表示
    const dropTable=DROP_TABLE[ed.id]||[];
    dropTable.forEach(entry=>{
      if(Math.random()>entry.rate)return;
      const count=Phaser.Math.Between(entry.min,entry.max);
      const def=ITEM_DEFS[entry.id];
      if(!def)return;
      // フィールドにアイテムアイコンを落とす
      const dx=ed.sprite.x+(Math.random()-0.5)*40;
      const dy=ed.sprite.y+(Math.random()-0.5)*20;
      const icon=this.add.text(dx,dy,def.icon,{fontSize:'22px'}).setOrigin(0.5).setDepth(8);
      // バウンスして着地するアニメ
      this.tweens.add({targets:icon,y:dy-30,duration:250,ease:'Cubic.easeOut',yoyo:true,onComplete:()=>{
        // 白い枠でハイライト
        const ring=this.add.circle(dx,dy+4,16,0xffffff,0.2).setDepth(7).setStrokeStyle(1,0xffffff,0.5);
        // 点滅
        this.tweens.add({targets:[icon,ring],alpha:0.6,duration:600,yoyo:true,repeat:-1});
        this._droppedItems.push({icon,ring,id:entry.id,count,x:dx,y:dy+4});
      }});
    });
    // フェードアウト後にスプライト削除 & リスポーンスケジュール
    const deadId=ed.id;
    const isBoss=ed.isBoss;
    this.tweens.add({targets:ed.sprite,alpha:0,duration:300,onComplete:()=>{
      ed.sprite.destroy();ed.hpBarBg.destroy();ed.hpBar.destroy();
      if(ed.nameLabel){ed.nameLabel.destroy();}
      // ボス以外: 5〜10秒後にランダム位置でリスポーン
      if(!isBoss){
        const delay=Phaser.Math.Between(5000,10000);
        this.time.delayedCall(delay,()=>{
          if(!this.scene.isActive())return; // シーン遷移済みなら中止
          // プレイヤーから遠い位置にスポーン（最低200px離す）
          let rx,ry,tries=0;
          let success=false;
          do{
            rx=Phaser.Math.Between(80,this.MW-80);
            ry=Phaser.Math.Between(80,this.MH-80);
            tries++;
            // プレイヤーから200px以上離れているか
            if(Phaser.Math.Distance.Between(rx,ry,this.player.x,this.player.y)>=200){
              // 歩ける位置かを事前チェック
              if(this._isWalkable && this._isWalkable(rx, ry)){
                success=true; break;
              }
            }
          }while(tries<40);
          if(success) this.spawnEnemy(deadId,rx,ry);
        });
      }
    }});
    if(this.target===ed)this.target=null;
    if(ed.isBoss){
      this.bossData=null;this.updateBossHP(null);
      // BGM 切り替えはフラッシュ後に少し遅らせる(レース防止)
      this.time.delayedCall(400, ()=>{
        try{ startBGM(this.cfg.bgmKey); }catch(e){ console.warn('[BGM] post-boss BGM failed:', e); }
      });
      this.openNextPortal();
      this.cameras.main.flash(600,255,215,0);
      const ann=this.add.text(this.scale.width/2,this.scale.height/2-40,'🏆 BOSS DEFEATED!',{fontSize:'32px',fontFamily:'Arial',color:'#ffd700',stroke:'#000',strokeThickness:5}).setOrigin(0.5).setScrollFactor(0).setDepth(50);
      this.tweens.add({targets:ann,alpha:0,duration:2500,delay:1500,onComplete:()=>ann.destroy()});
      // ダンジョンゲート開放(cfg.dungeonGateが設定されている場合)
      if(this.cfg.dungeonGate && !this._dungeonGateSpawned){
        this._dungeonGateSpawned=true;
        this.time.delayedCall(800, ()=>this._spawnDungeonGate(this.cfg.dungeonGate));
      }
    }
    this.checkLevelUp();this.updateHUD();
    if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
    if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
  }

  openNextPortal(){
    if(!this.portalNext||this.portalNext.open)return;
    this.portalNext.open=true;
    if(this.portalNextImg)this.portalNextImg.setAlpha(1);
    if(this.portalNextTxt)this.portalNextTxt.setText(this.cfg.portalToLabel+'\n[近づいて移動]').setStyle({color:'#00e5ff',fontSize:'10px',fontFamily:'Arial',align:'center'});
  }

  // ── ダンジョンゲート生成(ボス撃破後・骨の中心などに出現) ──
  _spawnDungeonGate(gateCfg){
    const x=gateCfg.x, y=gateCfg.y;
    // 出現エフェクト: 光が集まってゲートが現れる
    const flash=this.add.circle(x,y,60,0xcc66ff,0.8).setDepth(7);
    this.tweens.add({targets:flash, scaleX:2.5, scaleY:2.5, alpha:0, duration:800, onComplete:()=>flash.destroy()});
    // 魔力の渦パーティクル
    for(let i=0;i<12;i++){
      const a=(i/12)*Math.PI*2;
      const r=80;
      const px=x+Math.cos(a)*r, py=y+Math.sin(a)*r;
      const p=this.add.circle(px,py,4,0xaa44ff,0.9).setDepth(6);
      this.tweens.add({targets:p, x:x, y:y, alpha:0, duration:700, ease:'Cubic.easeIn', onComplete:()=>p.destroy()});
    }
    SE('magic');
    // ゲート本体
    this.time.delayedCall(600, ()=>{
      const gate=this.add.image(x,y,'dungeon_gate').setDepth(4).setScale(0.5);
      this.tweens.add({targets:gate, scaleX:1, scaleY:1, duration:500, ease:'Back.easeOut'});
      // ラベル(頭上)
      const label=this.add.text(x,y-78,'⚔ '+(gateCfg.label||'ダンジョン')+' ⚔',{fontSize:'12px',fontFamily:'Arial',color:'#cc66ff',stroke:'#000',strokeThickness:3,fontStyle:'bold'}).setOrigin(0.5).setDepth(5);
      // 点滅
      this.tweens.add({targets:label, alpha:0.5, duration:900, yoyo:true, repeat:-1});
      // グループに保存(近接判定用)
      this._dungeonGate={x, y, to:gateCfg.to, label:gateCfg.label, sprite:gate, labelTxt:label, dialogOpen:false};
      // 告知
      this.cameras.main.shake(200,0.003);
      const ann=this.add.text(this.scale.width/2,this.scale.height/2,'✨ 地下への入口が現れた… ✨',{fontSize:'22px',fontFamily:'Arial',color:'#cc66ff',stroke:'#000',strokeThickness:4,fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(50);
      this.tweens.add({targets:ann, alpha:0, duration:2500, delay:1800, onComplete:()=>ann.destroy()});
    });
  }

  // ── 青魔法ゲート ダイアログ ──
  _showMagicGateDialog(){
    if(this._magicGateDialogOpen) return;
    this._magicGateDialogOpen=true;
    this.physics.pause();
    const gate=this.cfg.magicGate;
    const W=this.scale.width, H=this.scale.height;
    const ov=this.add.rectangle(W/2,H/2,W,H,0x000000,0.75).setScrollFactor(0).setDepth(90).setInteractive();
    const box=this.add.rectangle(W/2,H/2,380,190,0x0a1a3a,0.98).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(91);
    const icon=this.add.text(W/2,H/2-64,'✨',{fontSize:'32px'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
    const ttl=this.add.text(W/2,H/2-30,gate.label,{fontSize:'16px',fontFamily:'Arial',color:'#88ddff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
    const sub1=this.add.text(W/2,H/2-4,'天空へのゲートがあるようだ…',{fontSize:'13px',fontFamily:'Arial',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
    const sub2=this.add.text(W/2,H/2+16,'入りますか？',{fontSize:'14px',fontFamily:'Arial',color:'#aaccff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
    // はい(青ボタン)
    const btnY=this.add.rectangle(W/2-80,H/2+58,140,38,0x0a3a6a,0.95).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(92).setInteractive({useHandCursor:true});
    const btnYTxt=this.add.text(W/2-80,H/2+58,'✨ 入る',{fontSize:'15px',fontFamily:'Arial',color:'#88ddff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(93);
    // 引き返す
    const btnN=this.add.rectangle(W/2+80,H/2+58,140,38,0x221111,0.95).setStrokeStyle(2,0x663333).setScrollFactor(0).setDepth(92).setInteractive({useHandCursor:true});
    const btnNTxt=this.add.text(W/2+80,H/2+58,'引き返す',{fontSize:'15px',fontFamily:'Arial',color:'#aa8888'}).setOrigin(0.5).setScrollFactor(0).setDepth(93);
    const close=()=>{
      [ov,box,icon,ttl,sub1,sub2,btnY,btnYTxt,btnN,btnNTxt].forEach(o=>{try{o.destroy();}catch(e){}});
      this._magicGateDialogOpen=false;
      this.physics.resume();
    };
    btnY.on('pointerdown',()=>{
      SE('click');
      close();
      // 入ると即座に青ポータル演出→シーン遷移
      this._transitioning=true;
      const sceneData={
        playerData:this.playerData,
        stage:gate.to,
        fromPortal:'magic',       // 特殊マーカー
        magicReturnX:gate.returnX, // 到着位置(行き先ステージでこれを参照)
        magicReturnY:gate.returnY,
      };
      this._doMagicPortalTransition('Game', sceneData, gate.x, gate.y);
    });
    btnN.on('pointerdown',()=>{
      SE('click');
      close();
      // 引き返した場合、2秒間は再ダイアログ起動を止める(ループ防止)
      this._magicGateCooldownUntil=this.time.now+2000;
    });
    btnY.on('pointerover',()=>btnY.setFillStyle(0x1a5a9a,0.98));
    btnY.on('pointerout', ()=>btnY.setFillStyle(0x0a3a6a,0.95));
    btnN.on('pointerover',()=>btnN.setFillStyle(0x332222,0.98));
    btnN.on('pointerout', ()=>btnN.setFillStyle(0x221111,0.95));
  }

  // ── ダンジョンゲート入場ダイアログ ──
  _showDungeonDialog(){
    if(this._dungeonGate.dialogOpen) return;
    this._dungeonGate.dialogOpen=true;
    this.physics.pause();
    const W=this.scale.width, H=this.scale.height;
    const ov=this.add.rectangle(W/2,H/2,W,H,0x000000,0.75).setScrollFactor(0).setDepth(90).setInteractive();
    const box=this.add.rectangle(W/2,H/2,360,180,0x1a0a2a,0.98).setStrokeStyle(2,0xaa44ff).setScrollFactor(0).setDepth(91);
    const icon=this.add.text(W/2,H/2-56,'⚔',{fontSize:'32px'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
    const ttl=this.add.text(W/2,H/2-22,this._dungeonGate.label,{fontSize:'16px',fontFamily:'Arial',color:'#cc66ff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
    const sub=this.add.text(W/2,H/2+4,'このダンジョンに入りますか？',{fontSize:'13px',fontFamily:'Arial',color:'#ffffff'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
    // はい
    const btnY=this.add.rectangle(W/2-70,H/2+50,120,36,0x4a0a6a,0.95).setStrokeStyle(2,0xaa44ff).setScrollFactor(0).setDepth(92).setInteractive({useHandCursor:true});
    const btnYTxt=this.add.text(W/2-70,H/2+50,'入る',{fontSize:'15px',fontFamily:'Arial',color:'#cc66ff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(93);
    // キャンセル
    const btnN=this.add.rectangle(W/2+70,H/2+50,120,36,0x221111,0.95).setStrokeStyle(2,0x663333).setScrollFactor(0).setDepth(92).setInteractive({useHandCursor:true});
    const btnNTxt=this.add.text(W/2+70,H/2+50,'引き返す',{fontSize:'15px',fontFamily:'Arial',color:'#aa8888'}).setOrigin(0.5).setScrollFactor(0).setDepth(93);
    const close=()=>{
      [ov,box,icon,ttl,sub,btnY,btnYTxt,btnN,btnNTxt].forEach(o=>{try{o.destroy();}catch(e){}});
      this._dungeonGate.dialogOpen=false;
      this.physics.resume();
    };
    btnY.on('pointerdown',()=>{
      SE('click');
      close();
      // ダンジョン遷移(少しエフェクトかけてから)
      this._transitioning=true;
      this.cameras.main.fade(400, 0, 0, 30);
      this.time.delayedCall(450, ()=>{
        this._doTransition('Game',{playerData:this.playerData, stage:this._dungeonGate.to});
      });
    });
    btnN.on('pointerdown',()=>{SE('click');close();});
    btnY.on('pointerover',()=>btnY.setFillStyle(0x6a1a8a,0.98));
    btnY.on('pointerout', ()=>btnY.setFillStyle(0x4a0a6a,0.95));
    btnN.on('pointerover',()=>btnN.setFillStyle(0x332222,0.98));
    btnN.on('pointerout', ()=>btnN.setFillStyle(0x221111,0.95));
  }

  checkLevelUp(){
    const pd=this.playerData;
    while(pd.exp>=pd.expNext){
      pd.exp-=pd.expNext;pd.lv++;pd.expNext=Math.floor(pd.expNext*1.4);
      // クラス別の緩やかな自動成長
      const cls=pd.cls||'novice';
      // 共通の最低限の成長(全クラス)
      pd.mhp+=4; pd.hp=pd.mhp;
      pd.msp+=2; pd.sp=pd.msp;
      // クラス別ボーナス成長(2Lvに1回など緩やかに)
      const lv=pd.lv;
      if(cls==='warrior'){
        // 剣士: HP・DEF特化
        pd.mhp+=3; pd.hp=pd.mhp;
        if(lv%2===0){pd.atk+=1;}
        if(lv%2===0){pd.def+=1;}
      }else if(cls==='mage'){
        // メイジ: MAG・SP特化
        pd.msp+=3; pd.sp=pd.msp;
        if(lv%2===0){pd.mag+=1;}
        if(lv%3===0){pd.def+=1;}
      }else if(cls==='archer'){
        // アーチャー: ATK・命中特化
        if(lv%2===0){pd.atk+=1;}
        if(lv%2===0){pd.hit+=1;}
        if(lv%3===0){pd.def+=1;}
      }else if(cls==='bomber'){
        // ボマー: バランス・SP多め
        pd.msp+=2; pd.sp=pd.msp;
        if(lv%2===0){pd.atk+=1;}
        if(lv%3===0){pd.mag+=1;}
        if(lv%3===0){pd.def+=1;}
      }else{
        // ノービス: 全部緩やか
        if(lv%3===0){pd.atk+=1;}
        if(lv%3===0){pd.def+=1;}
        if(lv%4===0){pd.mag+=1;}
      }
      // 振り分けポイント: Lvが上がるほど多めに(ROっぽい曲線)
      // 1〜10Lv: +3pt, 11〜30Lv: +4pt, 31〜60Lv: +5pt, 61〜: +6pt
      let ptGain=3;
      if(lv>=11)ptGain=4;
      if(lv>=31)ptGain=5;
      if(lv>=61)ptGain=6;
      pd.statPts=(pd.statPts||0)+ptGain;
      SE('levelup');
      this._showLevelUpEffect(pd.lv);
    }
    this._updateMenuBadge();
  }

  _showLevelUpEffect(lv){
    const w=this.scale.width, h=this.scale.height;
    const p=this.player;
    // 画面フラッシュ（黄金色）
    this.cameras.main.flash(500,255,215,0);
    // プレイヤー周辺のオーラリング
    const aura=this.add.circle(p.x,p.y,10,0xffd700,0.8).setDepth(30);
    this.tweens.add({targets:aura,scaleX:8,scaleY:8,alpha:0,duration:600,ease:'Cubic.easeOut',onComplete:()=>aura.destroy()});
    const aura2=this.add.circle(p.x,p.y,10,0xffff88,0.5).setDepth(29);
    this.tweens.add({targets:aura2,scaleX:12,scaleY:12,alpha:0,duration:800,delay:100,ease:'Cubic.easeOut',onComplete:()=>aura2.destroy()});
    // 星パーティクル
    for(let i=0;i<12;i++){
      const ang=(i/12)*Math.PI*2;
      const star=this.add.text(p.x,p.y,'⭐',{fontSize:'18px'}).setOrigin(0.5).setDepth(31);
      this.tweens.add({targets:star,x:p.x+Math.cos(ang)*100,y:p.y+Math.sin(ang)*100,alpha:0,duration:700,ease:'Cubic.easeOut',onComplete:()=>star.destroy()});
    }
    // 画面中央に大きく LEVEL UP テキスト
    const bg=this.add.rectangle(w/2,h/2-30,380,90,0x000000,0.7).setScrollFactor(0).setDepth(50).setStrokeStyle(3,0xffd700);
    const txt1=this.add.text(w/2,h/2-50,'✨  LEVEL  UP  ✨',{
      fontSize:'32px',fontFamily:'Arial',color:'#ffd700',
      stroke:'#ff8800',strokeThickness:4,fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setAlpha(0);
    const txt2=this.add.text(w/2,h/2-14,'Lv '+lv+'  ▶  ステータスポイント +3',{
      fontSize:'16px',fontFamily:'Arial',color:'#ffffff',stroke:'#000000',strokeThickness:3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setAlpha(0);
    // フェードイン→ホールド→フェードアウト
    this.tweens.add({targets:[bg,txt1,txt2],alpha:1,duration:200,onComplete:()=>{
      this.tweens.add({targets:[bg,txt1,txt2],alpha:0,duration:400,delay:1800,onComplete:()=>{
        bg.destroy();txt1.destroy();txt2.destroy();
      }});
    }});
  }
  // ⑦ ジョブEXP処理
  _showJobLevelUpEffect(jlv){
    const w=this.scale.width, h=this.scale.height;
    const p=this.player;
    // 画面フラッシュ（水色）
    this.cameras.main.flash(400,0,180,255);
    // 電撃リング
    const ring1=this.add.circle(p.x,p.y,8,0,0).setStrokeStyle(4,0x00e5ff,1).setDepth(30);
    this.tweens.add({targets:ring1,scaleX:10,scaleY:10,alpha:0,duration:500,ease:'Cubic.easeOut',onComplete:()=>ring1.destroy()});
    const ring2=this.add.circle(p.x,p.y,8,0,0).setStrokeStyle(2,0x88ffff,0.7).setDepth(29);
    this.tweens.add({targets:ring2,scaleX:14,scaleY:14,alpha:0,duration:700,delay:80,ease:'Cubic.easeOut',onComplete:()=>ring2.destroy()});
    // ⚡パーティクル
    for(let i=0;i<8;i++){
      const ang=(i/8)*Math.PI*2;
      const sp=this.add.text(p.x,p.y,'⚡',{fontSize:'16px'}).setOrigin(0.5).setDepth(31);
      this.tweens.add({targets:sp,x:p.x+Math.cos(ang)*80,y:p.y+Math.sin(ang)*80,alpha:0,duration:600,ease:'Cubic.easeOut',onComplete:()=>sp.destroy()});
    }
    // 画面中央にJOB LV UP表示（レベルアップとは別の位置・色）
    const bg=this.add.rectangle(w/2,h/2+50,360,80,0x001a33,0.8).setScrollFactor(0).setDepth(50).setStrokeStyle(3,0x00e5ff);
    const txt1=this.add.text(w/2,h/2+32,'⚡  JOB  LEVEL  UP  ⚡',{
      fontSize:'26px',fontFamily:'Arial',color:'#00e5ff',
      stroke:'#004488',strokeThickness:4,fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setAlpha(0);
    const txt2=this.add.text(w/2,h/2+62,'JLv '+jlv+'  ▶  スキルポイント +1',{
      fontSize:'15px',fontFamily:'Arial',color:'#88ffff',stroke:'#000000',strokeThickness:3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(51).setAlpha(0);
    this.tweens.add({targets:[bg,txt1,txt2],alpha:1,duration:200,onComplete:()=>{
      this.tweens.add({targets:[bg,txt1,txt2],alpha:0,duration:400,delay:1600,onComplete:()=>{
        bg.destroy();txt1.destroy();txt2.destroy();
      }});
    }});
  }

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
      this._showJobLevelUpEffect(pd.jobLv);
    }
    // バッジ更新のみ（自動Menu表示なし）
    if(jobLeveled) this._updateMenuBadge();
  }

  usePotion(type){
    const pd=this.playerData;
    // 覚醒中で回復禁止フラグがあればブロック
    if(pd.awakened && AWAKENINGS[pd.awakened] && AWAKENINGS[pd.awakened].blockHeal){
      this.showFloat(this.player.x, this.player.y-50, '🍃 転生中は使えない', '#aaccaa', 'info');
      return;
    }
    if(type==='hp'&&(pd.potHP||0)>0){pd.potHP--;pd.hp=Math.min(pd.mhp,pd.hp+50);SE('potion');this.showFloat(this.player.x,this.player.y-50,'💊 HP+50','#2ecc71');}
    else if(type==='mp'&&(pd.potMP||0)>0){pd.potMP--;pd.sp=Math.min(pd.msp,pd.sp+50);SE('potion');this.showFloat(this.player.x,this.player.y-50,'💧 SP+50','#3498db');}
    this.updateHUD();
    if(this.potHPTxt)this.potHPTxt.setText('x'+(pd.potHP||0));
    if(this.potMPTxt)this.potMPTxt.setText('x'+(pd.potMP||0));
  }

  showHitEffect(x,y,type){
    const isCrit=type==='crit';

    // ── 通常ヒット: 白リング + 白パーティクル ──
    if(!isCrit){
      // リング
      const ring=this.add.circle(x,y,6,0xffffff,0).setStrokeStyle(2,0xffffff,1.0).setDepth(22);
      this.tweens.add({targets:ring,scaleX:5,scaleY:5,alpha:0,duration:200,ease:'Cubic.easeOut',onComplete:()=>ring.destroy()});
      // パーティクル5粒
      for(let i=0;i<5;i++){
        const ang=(i/5)*Math.PI*2;
        const spd=Phaser.Math.Between(30,70);
        const dot=this.add.circle(x,y,Phaser.Math.Between(2,4),0xffaaaa,1.0).setDepth(22);
        this.tweens.add({targets:dot,x:x+Math.cos(ang)*spd,y:y+Math.sin(ang)*spd,alpha:0,scaleX:0.1,scaleY:0.1,duration:220,ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
      }
      return;
    }

    // ── クリティカル: 黄色爆発エフェクト ──

    // 中心フラッシュ（大きな黄色の円が一瞬出て消える）
    const flash=this.add.circle(x,y,20,0xffee00,1.0).setDepth(24);
    this.tweens.add({targets:flash,scaleX:4,scaleY:4,alpha:0,duration:300,ease:'Cubic.easeOut',onComplete:()=>flash.destroy()});

    // 内側リング（黄→橙）
    const ring1=this.add.circle(x,y,10,0xffcc00,0).setStrokeStyle(4,0xffcc00,1.0).setDepth(23);
    this.tweens.add({targets:ring1,scaleX:7,scaleY:7,alpha:0,duration:400,ease:'Cubic.easeOut',onComplete:()=>ring1.destroy()});

    // 外側リング（橙→赤）
    const ring2=this.add.circle(x,y,10,0xff6600,0).setStrokeStyle(3,0xff6600,0.8).setDepth(23);
    this.tweens.add({targets:ring2,scaleX:10,scaleY:10,alpha:0,duration:550,ease:'Cubic.easeOut',onComplete:()=>ring2.destroy()});

    // パーティクル（12粒: 黄・橙・赤）
    const critColors=[0xffee00,0xffcc00,0xff8800,0xff4400,0xffffff];
    for(let i=0;i<12;i++){
      const ang=(i/12)*Math.PI*2+(Math.random()-0.5)*0.3;
      const spd=Phaser.Math.Between(70,160);
      const sz=Phaser.Math.Between(4,10);
      const col=critColors[Math.floor(Math.random()*critColors.length)];
      const dot=this.add.circle(x,y,sz,col,1.0).setDepth(24);
      this.tweens.add({
        targets:dot,
        x:x+Math.cos(ang)*spd,
        y:y+Math.sin(ang)*spd,
        alpha:0,scaleX:0.1,scaleY:0.1,
        duration:Phaser.Math.Between(350,550),
        ease:'Cubic.easeOut',
        onComplete:()=>dot.destroy()
      });
    }

    // 稲妻風ライン（4方向）
    for(let i=0;i<4;i++){
      const ang=i*Math.PI/2+(Math.random()-0.5)*0.4;
      const len=Phaser.Math.Between(30,60);
      const line=this.add.graphics().setDepth(24);
      line.lineStyle(3,0xffee00,1.0);
      line.lineBetween(x,y,x+Math.cos(ang)*len,y+Math.sin(ang)*len);
      this.tweens.add({targets:line,alpha:0,duration:250,onComplete:()=>line.destroy()});
    }

    // CRITICAL テキスト
    const cTxt=this.add.text(x,y-20,'CRITICAL!',{
      fontSize:'20px',fontFamily:'Arial',
      color:'#ffee00',stroke:'#cc4400',strokeThickness:5
    }).setOrigin(0.5).setDepth(35).setScale(0.5);
    this.tweens.add({targets:cTxt,scaleX:1.3,scaleY:1.3,y:y-60,alpha:0,duration:700,ease:'Back.easeOut',onComplete:()=>cTxt.destroy()});
  }

  // type: 'normal' | 'crit' | 'skill' | 'skillcrit' | 'info'
  // TOTAL ダメージ表示(Press Start 2P・黄色・赤縁)
  showTotalDamage(x, y, total){
    const totalTxt = this.add.text(x, y - 60, ''+total, {
      fontSize:'30px',
      fontFamily:'"Press Start 2P", "Arial Black", monospace',
      color:'#ffee00',
      fontStyle:'bold',
      stroke:'#aa2200',
      strokeThickness:7,
    }).setOrigin(0.5).setDepth(30);
    totalTxt.setShadow(2, 2, '#000000', 4, true, true);
    this.tweens.add({
      targets: totalTxt,
      y: totalTxt.y - 30,
      alpha: 0,
      scaleX: 1.3, scaleY: 1.3,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: ()=>totalTxt.destroy(),
    });
  }

  showFloat(x,y,txt,col,type='normal'){
    // 後方互換: isCrit=true が来た場合
    if(type===true) type='crit';
    if(type===false) type='normal';

    const cfg={
      normal:   {fs:'20px',sw:4,sc:1.0,toY:65, dur:1400,ease:'Cubic.easeOut',   startSc:1.0},
      crit:     {fs:'48px',sw:8,sc:0.5,toY:110,dur:2400,ease:'Back.easeOut',    startSc:0.5},
      skill:    {fs:'36px',sw:7,sc:0.8,toY:100,dur:2200,ease:'Cubic.easeOut',   startSc:0.8},
      skillcrit:{fs:'56px',sw:9,sc:0.4,toY:130,dur:2800,ease:'Back.easeOut',    startSc:0.4},
      info:     {fs:'14px',sw:2,sc:1.0,toY:40, dur:1000,ease:'Cubic.easeOut',   startSc:1.0},
    }[type]||{fs:'20px',sw:4,sc:1.0,toY:65,dur:1400,ease:'Cubic.easeOut',startSc:1.0};

    // フォントとカラー設定(用途別)
    let fontFamily, fontStyle, displayColor, strokeCol;
    if(type==='info'){
      fontFamily = 'Arial';
      fontStyle = 'normal';
      displayColor = col;
      strokeCol = '#000000';
    }else if(type==='crit' || type==='skillcrit'){
      // クリティカル: Bangers(爆発感)・紅色・太い縁取り
      fontFamily = '"Bangers", Impact, "Arial Black", sans-serif';
      fontStyle = 'bold';
      displayColor = '#ff2244';        // 紅色(指定)
      strokeCol = '#440000';           // 暗赤の縁取り
    }else{
      // 通常ダメ・スキルダメ: Orbitron(SF・サイバー)・太字
      fontFamily = '"Orbitron", "Arial Black", sans-serif';
      fontStyle = 'bold';
      displayColor = col;
      strokeCol = '#000000';
    }

    const t=this.add.text(x,y,txt,{
      fontSize:cfg.fs,
      fontFamily:fontFamily,
      fontStyle:fontStyle,
      color:displayColor,
      stroke:strokeCol,strokeThickness:cfg.sw,
    }).setOrigin(0.5).setDepth(32).setScale(cfg.startSc);

    // クリティカルは追加で影を付けて立体感
    if(type==='crit' || type==='skillcrit'){
      t.setShadow(2, 2, '#000000', 4, true, true);
    }

    this.tweens.add({
      targets:t,
      scaleX:(type==='crit'||type==='skillcrit')?1.5:1.0,
      scaleY:(type==='crit'||type==='skillcrit')?1.5:1.0,
      y:y-cfg.toY,
      alpha:0,
      duration:cfg.dur,
      ease:cfg.ease,
      hold:type==='normal'?200:400, // 少し止まってから消える
      onComplete:()=>{try{t.destroy();}catch(e){}}
    });
  }

  // ── 青魔法ポータル専用の遷移演出 ──
  // プレイヤーが渦に吸い込まれ、閃光とともに次シーンへ
  _doMagicPortalTransition(sceneKey, sceneData, px, py){
    const p=this.player;
    if(!p){this._doTransition(sceneKey,sceneData);return;}
    // 操作無効化・敵停止
    try{this.physics.pause();}catch(e){}
    try{if(this.enemyDataList)this.enemyDataList.forEach(ed=>{try{if(ed.sprite&&ed.sprite.active)ed.sprite.setVelocity(0,0);}catch(e){}});}catch(e){}

    // SE(ポータル吸込音)
    try{SE('magic');}catch(e){}

    // ── 1. プレイヤーをポータルに吸い込む (0〜600ms) ──
    // プレイヤーの色を青く、回転しながら縮小してポータル中心に移動
    try{p.setTint(0x88ccff);}catch(e){}
    this.tweens.add({
      targets:p,
      x:px, y:py,
      scaleX:0.1, scaleY:0.1,
      angle:720,      // 2回転
      alpha:0,
      duration:600,
      ease:'Cubic.easeIn',
    });

    // ── 2. ポータル位置に青い渦・リングエフェクト ──
    // 複数の青いリングが外側から内側へ収束
    for(let i=0;i<4;i++){
      this.time.delayedCall(i*80,()=>{
        const ring=this.add.circle(px, py, 100+i*20, 0x44aaff, 0).setStrokeStyle(4, 0x88ddff, 0.9).setDepth(28);
        this.tweens.add({
          targets:ring,
          scaleX:0.1, scaleY:0.1,
          alpha:0,
          duration:500,
          ease:'Cubic.easeIn',
          onComplete:()=>ring.destroy(),
        });
      });
    }
    // 青い渦巻きパーティクル(20粒)を中心に向かわせる
    for(let i=0;i<20;i++){
      const ang=(i/20)*Math.PI*2;
      const dist=120+Math.random()*40;
      const sx=px+Math.cos(ang)*dist;
      const sy=py+Math.sin(ang)*dist;
      const dot=this.add.circle(sx, sy, 4+Math.random()*4, 0x88ddff, 0.9).setDepth(27);
      this.tweens.add({
        targets:dot,
        x:px, y:py,
        alpha:0,
        scaleX:0.2, scaleY:0.2,
        duration:500+Math.random()*200,
        ease:'Cubic.easeIn',
        onComplete:()=>dot.destroy(),
      });
    }

    // ── 3. 中心から青い閃光が拡大(400ms開始〜) ──
    this.time.delayedCall(400,()=>{
      const flash=this.add.circle(px, py, 40, 0xaaeeff, 0.9).setDepth(30).setScrollFactor(1);
      this.tweens.add({
        targets:flash,
        scaleX:30, scaleY:30,
        alpha:0.6,
        duration:500,
        ease:'Cubic.easeOut',
        onComplete:()=>flash.destroy(),
      });
    });

    // ── 4. 画面全体を白フラッシュで埋める(700ms〜) ──
    this.time.delayedCall(700,()=>{
      const W=this.scale.width, H=this.scale.height;
      const whiteOut=this.add.rectangle(W/2, H/2, W*2, H*2, 0xffffff, 0).setScrollFactor(0).setDepth(40);
      this.tweens.add({
        targets:whiteOut,
        alpha:1,
        duration:350,
        ease:'Cubic.easeIn',
        onComplete:()=>{
          // 真っ白になったところでシーン遷移
          this._doTransition(sceneKey, sceneData);
        },
      });
    });
  }


  // ── 転職処理(ノービス → 4職) ──
  // 条件: 現職がノービス、ジョブLv5以上
  // 効果: クラス変更、ステータス完全リセット、ステ振りポイント返却
  // 注意: 一度転職したら他クラスに変更不可
  _doJobChange(newCls, closeFn, showResultFn){
    const pd=this.playerData;
    // 既に二次職なら拒否
    if(pd.cls!=='novice'){
      showResultFn('一度転職したクラスは変更できません', '#ff8888');
      try{ SE('miss'); }catch(e){}
      return;
    }
    // ジョブLv5未満なら拒否
    if((pd.jobLv||1)<5){
      showResultFn('ジョブLv5以上で転職できます (現在 JLv'+(pd.jobLv||1)+')', '#ffaa44');
      try{ SE('miss'); }catch(e){}
      return;
    }
    // 確認ダイアログ
    const W=this.scale.width, H=this.scale.height;
    const clsName={warrior:'剣士',mage:'マジシャン',archer:'アーチャー',bomber:'ボマー'}[newCls];
    const clsIcon={warrior:'⚔',mage:'🪄',archer:'🏹',bomber:'💣'}[newCls];
    const ov=this.add.rectangle(W/2,H/2,W,H,0x000000,0.85).setScrollFactor(0).setDepth(95).setInteractive();
    const box=this.add.rectangle(W/2,H/2,420,250,0x0a1a3a,0.98).setStrokeStyle(2,0xffd700).setScrollFactor(0).setDepth(96);
    const ic=this.add.text(W/2,H/2-80,clsIcon,{fontSize:'40px'}).setOrigin(0.5).setScrollFactor(0).setDepth(97);
    const ttl=this.add.text(W/2,H/2-30,clsName+'に転職しますか？',{fontSize:'18px',fontFamily:'Arial',color:'#ffd700',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(97);
    const sub1=this.add.text(W/2,H/2,'⚠ 一度転職すると他のクラスに',{fontSize:'12px',fontFamily:'Arial',color:'#ff8888'}).setOrigin(0.5).setScrollFactor(0).setDepth(97);
    const sub2=this.add.text(W/2,H/2+18,'変更できません',{fontSize:'12px',fontFamily:'Arial',color:'#ff8888'}).setOrigin(0.5).setScrollFactor(0).setDepth(97);
    const sub3=this.add.text(W/2,H/2+44,'※ステ振りポイントは全て返却されます',{fontSize:'11px',fontFamily:'Arial',color:'#aaccdd'}).setOrigin(0.5).setScrollFactor(0).setDepth(97);
    const btnY=this.add.rectangle(W/2-90,H/2+90,160,40,0x44aa44,0.85).setStrokeStyle(2,0x88ff88).setScrollFactor(0).setDepth(97).setInteractive({useHandCursor:true});
    const btnYTxt=this.add.text(W/2-90,H/2+90,'✨ 転職する',{fontSize:'15px',fontFamily:'Arial',color:'#ffffff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(98);
    const btnN=this.add.rectangle(W/2+90,H/2+90,160,40,0x444444,0.85).setStrokeStyle(2,0x888888).setScrollFactor(0).setDepth(97).setInteractive({useHandCursor:true});
    const btnNTxt=this.add.text(W/2+90,H/2+90,'やめる',{fontSize:'15px',fontFamily:'Arial',color:'#cccccc'}).setOrigin(0.5).setScrollFactor(0).setDepth(98);
    const cleanup=()=>[ov,box,ic,ttl,sub1,sub2,sub3,btnY,btnYTxt,btnN,btnNTxt].forEach(o=>{try{o.destroy();}catch(e){}});
    btnY.on('pointerdown',()=>{
      // 転職実行
      try{ SE('magic'); }catch(e){}
      // ── ステータスリセット ──
      // Lv N まで成長すると、累計で (N-1)*3 ポイント獲得しているはず
      // それを基準に再計算して全ポイントを返却(統計の取り戻し)
      const lvBasedTotal=Math.max(0, (pd.lv||1)-1) * 3;
      // 実際にプレイヤーが現在保有しているポイントの合計(積み上げ・割り振り済み・残ポイント)
      const currentTotal=(pd.statPts||0) + ((pd.intPts||0)+(pd.strPts||0)+(pd.vitPts||0)+(pd.dexPts||0)+(pd.agiPts||0)+(pd.lukPts||0));
      // 大きい方を採用(レベル基準で正しく振り直しできる量)
      const totalPts=Math.max(lvBasedTotal, currentTotal);
      // ベース値を新クラス基準に
      const base={
        warrior:{hp:110,sp:60,atk:6,def:6,mag:5,spd:180,hit:80,luk:5,agi:0},
        mage:   {hp:90, sp:70,atk:5,def:4,mag:8,spd:160,hit:75,luk:5,agi:0},
        archer: {hp:100,sp:65,atk:6,def:5,mag:5,spd:200,hit:85,luk:8,agi:0},
        bomber: {hp:95, sp:80,atk:8,def:4,mag:6,spd:170,hit:78,luk:6,agi:0},
      }[newCls];
      pd.cls=newCls;
      pd.mhp=base.hp; pd.hp=base.hp;
      pd.msp=base.sp; pd.sp=base.sp;
      pd.atk=base.atk; pd.def=base.def; pd.mag=base.mag;
      pd.spd=base.spd; pd.hit=base.hit; pd.luk=base.luk; pd.agi=base.agi;
      // ステ振りリセット
      pd.statPts=totalPts;
      pd.intPts=0; pd.strPts=0; pd.vitPts=0; pd.dexPts=0; pd.agiPts=0; pd.lukPts=0;
      // スキルリセット(別職のスキルだから)
      pd.sk1=0; pd.sk2=0; pd.sk3=0; pd.sk4=0;
      pd._hasBerserk=false; pd._hasMeteoorm=false; pd._hasBoostAtk=false; pd._hasBomberPower=false;
      // ジョブはリセット(新職としてやり直し)
      pd.jobLv=1; pd.jobExp=0; pd.jobExpNext=80; pd.jobPts=0;

      // 剣士に転職した時、妖刀「村雨」を自動取得
      if(newCls==='warrior'){
        if(!pd.items) pd.items={};
        pd.items['muramasa'] = (pd.items['muramasa']||0) + 1;
      }
      // ボマーに転職した時、ヘヴィカスタマイズ+バスターライフルを自動取得
      if(newCls==='bomber'){
        if(!pd.items) pd.items={};
        pd.items['heavy_customize'] = (pd.items['heavy_customize']||0) + 1;
        pd.items['buster_rifle'] = (pd.items['buster_rifle']||0) + 1;
      }
      // アーチャーに転職した時、精霊の弓を自動取得
      if(newCls==='archer'){
        if(!pd.items) pd.items={};
        pd.items['spirit_bow'] = (pd.items['spirit_bow']||0) + 1;
      }
      // マジシャンに転職した時、ダークイリュージョンの杖を自動取得
      if(newCls==='mage'){
        if(!pd.items) pd.items={};
        pd.items['dark_illusion_staff'] = (pd.items['dark_illusion_staff']||0) + 1;
        // アビスウォーロック用のリヴァイアリーの杖も合わせて配布
        pd.items['riviary_staff'] = (pd.items['riviary_staff']||0) + 1;
      }

      cleanup();
      closeFn(); // 転職屋を閉じる
      // 派手な演出
      this.cameras.main.flash(600, 255, 230, 100);
      try{ SE('lvup'); }catch(e){}
      // 現在位置を保持して再スポーン(転職場の前で発動)
      const keepX=this.player ? this.player.x : null;
      const keepY=this.player ? this.player.y : null;
      // シーン再起動でスプライト切替
      this.time.delayedCall(700, ()=>{
        const data={playerData:pd, stage:this.stage};
        // 現在位置を保持
        if(keepX!==null && keepY!==null){
          data.fromPortal='magic';
          data.magicReturnX=keepX;
          data.magicReturnY=keepY;
        }
        this._doTransition('Game', data);
      });
    });
    btnY.on('pointerover',()=>btnY.setFillStyle(0x66cc66,0.95));
    btnY.on('pointerout', ()=>btnY.setFillStyle(0x44aa44,0.85));
    btnN.on('pointerdown',()=>{ try{SE('click');}catch(e){} cleanup(); });
    btnN.on('pointerover',()=>btnN.setFillStyle(0x666666,0.95));
    btnN.on('pointerout', ()=>btnN.setFillStyle(0x444444,0.85));
  }

  // ── ギルドのテレポート(ポータルサービス) ──
  // ステージ番号を受け取り、フェード演出を挟んで遷移する
  _doGuildWarp(stage){
    if(this._transitioning) return;
    this._transitioning=true;
    // 演出: 画面中央に「✨ テレポート ✨」とメッセージ + フェード
    const W=this.scale.width, H=this.scale.height;
    const ann=this.add.text(W/2, H/2, '✨ テレポート ✨', {
      fontSize:'28px', fontFamily:'Arial', color:'#88ddff',
      stroke:'#000', strokeThickness:5, fontStyle:'bold'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(95).setAlpha(0);
    this.tweens.add({targets:ann, alpha:1, scaleX:1.2, scaleY:1.2, duration:300, yoyo:false});
    try{ SE('magic'); }catch(e){}
    // 短めの白フラッシュ → 遷移
    this.cameras.main.flash(450, 200, 230, 255);
    this.time.delayedCall(500, ()=>{
      try{ ann.destroy(); }catch(e){}
      this._doTransition('Game', {playerData:this.playerData, stage:stage});
    });
  }


  _doTransition(sceneKey,sceneData){
    stopBGM();
    // 詠唱キャンセル
    if(this._castTimer){try{this._castTimer.remove();}catch(e){}}
    // 入るボタンをクリア
    this._updateEnterBtn(null);
    this._nearBuilding=null;
    // 設置爆弾クリア
    if(this._placedBombs){
      this._placedBombs.forEach(b=>{
        if(b.checkTimer)b.checkTimer.remove();
        [b.spr,b.zone,b.txt].forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
      });
      this._placedBombs=[];
    }
    if(this._castAuraObjs){
      this._castAuraObjs.forEach(o=>{try{if(o.active)o.destroy();}catch(e){}});
      this._castAuraObjs=null;
    }
    this._casting=false;
    this.physics.pause();
    this.tweens.killAll();
    this.time.removeAllEvents();
    try{if(this.player){this.player.setVelocity(0,0);if(this.player.anims)this.player.anims.stop();}}catch(e){}
    try{if(this.enemyDataList)this.enemyDataList.forEach(ed=>{try{if(ed.sprite&&ed.sprite.active)ed.sprite.setVelocity(0,0);}catch(e){}});}catch(e){}
    // _gameOverでupdateを止める
    this._gameOver=true;
    // Gameシーン遷移の場合、currentSlotを引き継ぐ(明示指定がなければ自動付与)
    if(sceneKey === 'Game' && sceneData && sceneData.currentSlot === undefined && this.currentSlot !== undefined){
      sceneData.currentSlot = this.currentSlot;
    }
    // setTimeoutで次フレームに遷移（Phaser内部アニメの後処理が終わってから）
    const key=sceneKey,data=sceneData;
    const self=this;
    setTimeout(()=>{
      try{self.scene.start(key,data);}catch(e){console.error('transition error:',e);}
    },50);
  }

  gameOver(){
    if(this._gameOver)return;
    // 覚醒中なら強制解除(死亡時)
    if(this.playerData.awakened){
      try{ this._deactivateAwakening(true); }catch(e){console.warn(e);}
    }
    this._gameOver=true;
    this.physics.pause();
    stopBGM();
    const w=this.scale.width,h=this.scale.height;
    this.add.rectangle(w/2,h/2,440,200,0x000000,0.92).setScrollFactor(0).setDepth(40);
    this.add.text(w/2,h/2-50,'✖ GAME OVER',{fontSize:'32px',fontFamily:'Arial',color:'#e74c3c',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(w/2,h/2,'Lv'+this.playerData.lv+'  討伐'+this.playerData.kills+'体  Gold'+this.playerData.gold+'G',{fontSize:'13px',fontFamily:'Arial',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    this.add.text(w/2,h/2+40,'クリック or [R] で町に復活',{fontSize:'15px',fontFamily:'Arial',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(41);
    const revive=()=>{
      const pd=this.playerData;
      pd.hp=1; // §17: HP=1で復活
      
      this.scene.start('Game',{playerData:pd,stage:0});
    };
    this.input.keyboard.once('keydown-R',revive);
    this.time.delayedCall(500,()=>this.input.once('pointerdown',revive));
  }

  // ── マップ画像から「歩ける/歩けない」判定用のキャンバスを構築 ──
  _buildMapColorMask(textureKey){
    try{
      const src = this.textures.get(textureKey).getSourceImage();
      // 軽量化のため、低解像度のオフスクリーン Canvas にコピーして色を読む
      // 解像度を 1/2 に縮小（精度はゲーム的には十分）
      const scale = 0.5;
      const cw = Math.max(1, Math.floor(src.width * scale));
      const ch = Math.max(1, Math.floor(src.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = cw; canvas.height = ch;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(src, 0, 0, cw, ch);
      this._mapMaskCanvas = canvas;
      this._mapMaskCtx = ctx;
      this._mapMaskScale = scale;
      this._mapMaskW = cw;
      this._mapMaskH = ch;
      return true;
    }catch(e){
      console.warn('map mask build failed:', e);
      return false;
    }
  }

  // 指定ワールド座標が「歩けるか」を返す（歩ける=true, 壁=false）
  _isWalkable(worldX, worldY){
    if(!this._mapMaskCtx) return true;
    const cfg = this.cfg;
    if(!cfg) return true;

    // ── 強制歩行ゾーン(橋など): cfg.walkZones の矩形内は色判定無視で歩行可 ──
    if(cfg.walkZones){
      for(let i=0;i<cfg.walkZones.length;i++){
        const z=cfg.walkZones[i];
        if(worldX>=z.x && worldX<=z.x+z.w && worldY>=z.y && worldY<=z.y+z.h){
          return true;
        }
      }
    }

    // ワールド座標をマスクキャンバス座標に変換
    const mx = Math.floor(worldX / this.MW * this._mapMaskW);
    const my = Math.floor(worldY / this.MH * this._mapMaskH);
    if(mx<0||my<0||mx>=this._mapMaskW||my>=this._mapMaskH) return false; // マップ外は不可
    const px = this._mapMaskCtx.getImageData(mx, my, 1, 1).data;
    const r = px[0], g = px[1], b = px[2];
    const sum = r + g + b;

    // ── ダンジョン用色判定(cfg.mapType==='dungeon') ──
    // ダンジョンは床が暗めの茶色/ベージュ、壁はほぼ完全な黒
    // 絨毯・紋様・模様など床の装飾も全て床扱い
    if(cfg.mapType==='dungeon'){
      // 完全な黒〜ごく暗い色だけを壁として扱う(sum<75=壁)
      if(sum < 75) return false;
      // それ以外(赤絨毯も暗い石床も床模様も全て)は床
      return true;
    }

    // ── 天空島用色判定(cfg.mapType==='sky') ──
    // 雲・空・滝(青系)= 歩けない、草原と石畳 = 歩ける
    if(cfg.mapType==='sky'){
      // 非常に暗い=崖・影 → 壁
      if(sum < 200) return false;
      // 青系(雲・空・滝・水): bがr・gより優位 → 壁
      if(b > r+20 && b > g-10) return false;
      // 白っぽい雲 → 壁
      if(r > 200 && g > 210 && b > 210) return false;
      // それ以外(草・道・石畳・岩)は歩ける
      return true;
    }

    // ── ST2(森の中央に川が流れるマップ) ──
    // 草原(緑優位) = 歩ける、川(青優位) = 歩けない、影(暗) = 歩けない
    if(cfg.mapType==='st2'){
      // 暗すぎる(木・影・岩) → 壁
      if(sum < 180) return false;
      // 水(青が緑以上に強い・暗め) → 壁
      if(b >= g && b > 80) return false;
      // それ以外(草原・道・茶色)は歩ける
      return true;
    }

    // ── ST20 ゴブリン集落(草原・砂道・テント・木・岩) ──
    if(cfg.mapType==='goblin_village'){
      // 暗いエリア(森・テント・焚き火跡・岩) → 壁
      // 判定を緩めて歩きやすく
      if(sum < 130) return false;
      // それ以外(草原・砂道・草陰) は歩ける
      return true;
    }

    // ── ST21 ブレイズフォージ(石畳の道・建物・岩壁) ──
    if(cfg.mapType==='blaze'){
      // 暗いエリア(岩壁・建物・煙突) → 壁
      if(sum < 200) return false;
      // それ以外(石畳・砂道・広場) は歩ける
      return true;
    }

    // ── セントラル(町)town0(石畳・草・建物・森) ──
    if(cfg.mapType==='town0'){
      // 暗いエリア(森・建物・噴水・岩壁) → 壁
      if(sum < 200) return false;
      // それ以外(石畳・砂道) は歩ける
      return true;
    }

    // ── DUN.2 炭鉱(暗いマップ・床と壁の差が小さい) ──
    if(cfg.mapType==='mine'){
      // ほぼ完全な黒だけ壁(画像が全体的に暗いため緩めに)
      if(sum < 60) return false;
      // 青が支配的(川・水) → 壁(DUN.2 2Fのみ該当)
      // ただし暗めの青(濃紺=床の影)は許可するため、Bが100以上で青優位の時のみ壁
      if(b > 100 && b > r*1.4 && b > g*1.2) return false;
      return true;
    }

    // ── south_st1 / south_st2 (草原+砂道+花畑+少数の木) ──
    // 道(明るい砂)・草原(明るい緑)・花畑(やや明るい)は歩ける
    // 木(濃い緑〜暗緑)・木の影だけ壁
    if(cfg.mapType==='south_st1' || cfg.mapType==='south_st2'){
      // 真っ暗な部分(濃い木・木の幹・影)だけ壁
      if(sum < 130) return false;
      return true;
    }

    // ── south_st4 (海岸+森+砂浜+草原) ──
    // 海・川は青色、深い森・岩壁を壁として、それ以外(草・砂・道)は歩ける
    if(cfg.mapType==='south_st4'){
      // 暗すぎる部分(深い森・岩・影)
      if(sum < 130) return false;
      // 水・川(青が支配的: B>=R*1.4以上)を壁
      if(b > r*1.4 && b > g*1.2 && b > 110) return false;
      return true;
    }

    // ── town_minato 港町(石畳・建物・海・船・桟橋) ──
    if(cfg.mapType==='town_minato'){
      // 暗いエリア(建物・屋根・影・岩壁) → 壁
      if(sum < 200) return false;
      // 海(青が支配的) → 壁
      if(b > r*1.3 && b > g*1.1 && b > 100) return false;
      // それ以外(石畳・砂道・広場) は歩ける
      return true;
    }

    // ── sakura_gate 桜の里(中央参道・家屋・桜並木・海) ──
    if(cfg.mapType==='sakura_gate'){
      // 暗いエリア(建物・屋根・影・岩壁) → 壁
      if(sum < 200) return false;
      // 海(青が支配的) → 壁
      if(b > r*1.3 && b > g*1.1 && b > 100) return false;
      // 桜(濃いピンク R高&B高&G低)→ 壁(歩けない)
      if(r > 200 && b > 150 && g < r*0.75) return false;
      // それ以外(石畳の参道・砂道) は歩ける
      return true;
    }

    // ── sakura_dun1 桜の城(中央広場・城・桜大樹・池・建物群) ──
    if(cfg.mapType==='sakura_dun1'){
      // 暗いエリア(建物・屋根・影・壁) → 壁
      // 城の入口の暗い石段も通れるよう閾値を緩める(200→170)
      if(sum < 170) return false;
      // 池(青が支配的) → 壁
      if(b > r*1.2 && b > g*1.1 && b > 100) return false;
      // 桜(濃いピンク R高&B高&G低)→ 壁
      if(r > 200 && b > 150 && g < r*0.75) return false;
      // それ以外(石畳・砂道・草地) は歩ける
      return true;
    }

    // ── south_st3 (草原+砂道+鉱山岩石エリア) ──
    // 草原と道は歩ける。鉱山(暗いグレー岩)は歩ける部分も多い
    if(cfg.mapType==='south_st3'){
      // 真っ黒(完全に黒い岩や深い影)だけ壁
      if(sum < 100) return false;
      return true;
    }

    // ── town2 砂漠の街(石畳の広場・建物・砂・植物) ──
    if(cfg.mapType==='town2'){
      // 暗い部分(建物・壁・濃い影)を壁
      if(sum < 180) return false;
      return true;
    }

    // ── フィールドマップ用色判定(緩めにして歩行範囲を広く) ──
    // ST1〜6など mapType 指定なしのフィールドマップ用
    // 1) 真っ暗な部分(深い森・濃い影・木の幹)は壁
    if(sum < 180) return false;
    // 2) それ以外は基本歩ける(草原・道・茶色)
    return true;
  }

  // 複数の判定点を使った当たり判定(プレイヤーの体の輪郭に合わせて)
  _canMoveTo(cx, cy, halfW, halfH){
    if(!this._mapMaskCtx) return true;
    // 5点判定: 足元中央、左下、右下、左中、右中
    const points = [
      [cx,         cy + halfH*0.6],   // 足元中央
      [cx - halfW, cy + halfH*0.6],   // 左足
      [cx + halfW, cy + halfH*0.6],   // 右足
      [cx - halfW, cy + halfH*0.2],   // 左腰
      [cx + halfW, cy + halfH*0.2],   // 右腰
    ];
    for(let i=0;i<points.length;i++){
      if(!this._isWalkable(points[i][0], points[i][1])) return false;
    }
    return true;
  }

  // ── 回避率計算(逓減カーブ・上限75%・ボス補正) ──
  // AGI 30で約25%, 60で約45%, 100で約60%, 200で約70%, 上限75%
  // 線形だとAGI100で完全回避になってしまうので、平方根カーブで成長を緩やかに
  _getDodgeRate(isBoss){
    const pd=this.playerData;
    const rawAgi=pd.agi||0;
    if(rawAgi<=0) return 0;
    // sqrt(AGI)*9 で逓減: AGI=10→約28%, 50→約63%, 100→約90%だが上限75%でキャップ
    let rate=Math.sqrt(rawAgi)*9;
    // ボス相手は-15%(ただし0未満にはしない)
    if(isBoss) rate=Math.max(0, rate-15);
    // 最大75%(必中要素を残す)
    return Math.min(75, rate);
  }

  // ── 敵の移動(壁判定付き): 壁にぶつかったら速度を殺す ──
  _moveEnemyWithCollision(ed, vx, vy, dt){
    const sp=ed.sprite;
    if(!sp || !sp.active) return;
    if(!this._mapMaskCtx){
      sp.setVelocity(vx, vy);
      return;
    }
    // 敵の当たり判定サイズ(足元のみ・小さめにして引っかかり防止)
    // ボスなど大型敵でも判定は控えめに
    const sz=Math.min(sp.displayWidth, sp.displayHeight);
    const halfW=Math.min(16, sz*0.20);
    const halfH=Math.min(16, sz*0.20);
    const lookAhead=Math.max(dt*1.2, 0.02);

    // ── スタック検出: 中心が壁内 ─→ 段階的に押し出し ──
    // 5点判定でNGでも中心が床なら歩ける(縁にひっかかってるだけ)とみなす
    if(!this._isWalkable(sp.x, sp.y)){
      // スタックカウンタ初期化
      ed._stuckCount = (ed._stuckCount || 0) + 1;
      // 段階的に半径を広げて押し出し位置を探索
      let safe=this._findSafeSpawnPos(sp.x, sp.y, 80);
      if(!safe) safe=this._findSafeSpawnPos(sp.x, sp.y, 160);
      if(!safe) safe=this._findSafeSpawnPos(sp.x, sp.y, 300);
      if(safe){
        sp.x=safe.x; sp.y=safe.y;
        ed._stuckCount=0;
      } else if(this.player && ed._stuckCount > 3){
        // 3回連続失敗: プレイヤー方向に強制テレポート(歩ける場所が確実にあるため)
        const px=this.player.x, py=this.player.y;
        const dx=px-sp.x, dy=py-sp.y;
        const dist=Math.hypot(dx,dy)||1;
        // プレイヤーから150px離れた位置にテレポート(直接重ならないように)
        const tx=px - dx/dist*150;
        const ty=py - dy/dist*150;
        if(this._isWalkable(tx, ty)){
          sp.x=tx; sp.y=ty;
          ed._stuckCount=0;
        }
      }
      sp.setVelocity(vx, vy);
      return;
    }
    // 中心は床にいる場合、スタックカウンタリセット
    ed._stuckCount=0;

    // X方向とY方向を独立に判定(片方失敗しても他方で動ける=スライド)
    const canX=(vx===0) || this._canMoveTo(sp.x + vx*lookAhead, sp.y, halfW, halfH);
    const canY=(vy===0) || this._canMoveTo(sp.x, sp.y + vy*lookAhead, halfW, halfH);

    let finalVx=canX?vx:0;
    let finalVy=canY?vy:0;

    // 両方塞がれてる時のみ方向反転(行き場なしの時だけ)
    if(!canX && !canY){
      ed.wanderVx=-ed.wanderVx;
      ed.wanderVy=-ed.wanderVy;
      ed.wanderTimer=Math.min(ed.wanderTimer||0, 0.3);
      // ── 「縁にひっかかり」検出: 中心は床なのに四方塞がれている ──
      // 短時間だけならOK、長く続いたら脱出処理
      ed._edgeStuckTime = (ed._edgeStuckTime || 0) + dt;
      if(ed._edgeStuckTime > 1.5){
        // 1.5秒以上どこにも動けない = 縁の凹みに引っかかってる
        // 周辺200pxで歩ける位置を探して移動
        let safe=this._findSafeSpawnPos(sp.x, sp.y, 200);
        if(safe){
          sp.x=safe.x; sp.y=safe.y;
          ed._edgeStuckTime=0;
        }
      }
    } else {
      // 動けた瞬間にリセット
      ed._edgeStuckTime=0;
    }

    sp.setVelocity(finalVx, finalVy);

    // ── 実位置追跡: 5秒間動いていなければ強制リロケート ──
    if(ed._lastTrackX===undefined){
      ed._lastTrackX=sp.x; ed._lastTrackY=sp.y; ed._noMoveTime=0;
    } else {
      const moved=Math.hypot(sp.x-ed._lastTrackX, sp.y-ed._lastTrackY);
      if(moved < 2){
        // ほぼ動いていない
        ed._noMoveTime += dt;
        // 動こうとしている(速度がある)のに動けない場合のみ判定強化
        const wantToMove = (Math.abs(vx)+Math.abs(vy)) > 5;
        if(wantToMove && ed._noMoveTime > 3.0){
          // 3秒以上「動きたいのに動けない」 = 確実にスタック
          let safe=this._findSafeSpawnPos(sp.x, sp.y, 250);
          if(safe){
            sp.x=safe.x; sp.y=safe.y;
            ed._noMoveTime=0;
            ed._lastTrackX=sp.x; ed._lastTrackY=sp.y;
          } else if(this.player){
            // 最終手段: プレイヤー方向200px
            const px=this.player.x, py=this.player.y;
            const dx=px-sp.x, dy=py-sp.y;
            const dist=Math.hypot(dx,dy)||1;
            const tx=px - dx/dist*200;
            const ty=py - dy/dist*200;
            if(this._isWalkable(tx, ty)){
              sp.x=tx; sp.y=ty;
              ed._noMoveTime=0;
            }
          }
        }
      } else {
        // 動いた: リセット
        ed._lastTrackX=sp.x; ed._lastTrackY=sp.y;
        ed._noMoveTime=0;
      }
    }

    // ── ボブ動作(歩行時に上下に弾む) ──
    // 移動してるかどうかを判定
    const isMoving = (Math.abs(finalVx) + Math.abs(finalVy)) > 5;
    if(isMoving){
      // ボブのフェーズを進行(速度に応じて速くなる)
      if(ed.bobPhase === undefined) ed.bobPhase = 0;
      // 速度に応じて周波数を変える(速い敵は素早く弾む)
      const bobSpeed = 8 + Math.min(6, ed.spd / 25);
      ed.bobPhase += dt * bobSpeed;
      // ボブ量: 速度に応じてやや増減
      const bobAmount = 0.08 + Math.min(0.05, ed.spd / 1500);
      // Y方向のスケールを軽く上下させる(つぶれて伸びる感覚)
      const bobY = Math.sin(ed.bobPhase) * bobAmount;
      // 元のスケールを保持(初回のみ)
      if(ed._baseScaleY === undefined){
        ed._baseScaleY = sp.scaleY;
        ed._baseScaleX = sp.scaleX;
      }
      // Y軸を縮める時はX軸を少し広げる(ぷにぷに感)
      sp.setScale(
        ed._baseScaleX * (1 - bobY * 0.5),
        ed._baseScaleY * (1 + bobY)
      );
    }else if(ed._baseScaleY !== undefined){
      // 止まったら基本スケールに戻す(なめらかに)
      const curSx = sp.scaleX;
      const curSy = sp.scaleY;
      sp.setScale(
        curSx + (ed._baseScaleX - curSx) * 0.2,
        curSy + (ed._baseScaleY - curSy) * 0.2
      );
    }
  }

  // ── 視線チェック: 2点間に壁がないか(Bresenhamの線で一定間隔をチェック) ──
  _hasLineOfSight(x1, y1, x2, y2){
    if(!this._mapMaskCtx) return true;
    const dist=Phaser.Math.Distance.Between(x1, y1, x2, y2);
    const steps=Math.ceil(dist/20); // 20pxごとにチェック
    if(steps<=1) return true;
    for(let i=1;i<steps;i++){
      const t=i/steps;
      const x=x1+(x2-x1)*t;
      const y=y1+(y2-y1)*t;
      if(!this._isWalkable(x, y)) return false;
    }
    return true;
  }

  // ── 壁のない安全な座標を近傍から探す(スポーン用) ──
  _findSafeSpawnPos(x, y, maxRadius){
    if(!this._mapMaskCtx) return {x, y};
    // 判定はやや緩め(14px半径)で、草原の縁にも置けるように
    const HW=14, HH=14;
    if(this._canMoveTo(x, y, HW, HH)) return {x, y};
    // 螺旋状に近傍を探索
    const step=30;
    const limit=maxRadius||300;
    for(let r=step; r<=limit; r+=step){
      const samples=Math.ceil(r*Math.PI*2/step);
      for(let i=0;i<samples;i++){
        const a=(i/samples)*Math.PI*2;
        const tx=x+Math.cos(a)*r;
        const ty=y+Math.sin(a)*r;
        if(tx>=40 && tx<=this.MW-40 && ty>=40 && ty<=this.MH-40 &&
           this._canMoveTo(tx, ty, HW, HH)){
          return {x:tx, y:ty};
        }
      }
    }
    // 見つからない場合: 中心点1点歩けるなら採用(緩い基準)
    if(this._isWalkable(x, y)) return {x, y};
    // 完全に歩けない位置のため null を返す → spawnEnemy 側でスキップ
    return null;
  }

  // ── 毒システム ──────────────────────────
  // プレイヤーに毒を付与
  applyPoison(durationSec){
    const pd=this.playerData, p=this.player;
    // 既に毒なら持続時間を延長(リフレッシュ)
    if(pd._poisoned){
      pd._poisonTimer=Math.max(pd._poisonTimer||0, durationSec);
      return;
    }
    pd._poisoned=true;
    pd._poisonTimer=durationSec;
    pd._poisonTickAccum=0;
    // 紫色のフラッシュ表示
    this.showFloat(p.x,p.y-60,'🟣 毒!','#aa22cc','info');
    SE('hurt');
    // プレイヤーに紫色のTintを適用
    if(p && p.setTint) p.setTint(0xcc88ff);
    // 毒アイコン&タイマーHUD
    this._showPoisonHUD();
  }

  // 毒解除
  clearPoison(){
    const pd=this.playerData, p=this.player;
    pd._poisoned=false;
    pd._poisonTimer=0;
    if(p && p.clearTint) p.clearTint();
    if(this._poisonHudBg){
      this._poisonHudBg.destroy(); this._poisonHudBg=null;
      this._poisonHudIcon.destroy(); this._poisonHudIcon=null;
      this._poisonHudTxt.destroy(); this._poisonHudTxt=null;
    }
    // 毒パーティクルも止める
    if(this._poisonParticleTimer){this._poisonParticleTimer.remove();this._poisonParticleTimer=null;}
  }

  // 毒HUD表示(画面左上のHPバー下あたり)
  _showPoisonHUD(){
    if(this._poisonHudBg)return; // 既に表示中
    const x=92, y=100; // HP/SPバーの下
    this._poisonHudBg=this.add.rectangle(x,y,70,20,0x330044,0.85).setStrokeStyle(1,0xaa22cc).setScrollFactor(0).setDepth(30);
    this._poisonHudIcon=this.add.text(x-24,y,'🟣',{fontSize:'14px'}).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this._poisonHudTxt=this.add.text(x+6,y,'毒 0s',{fontSize:'11px',fontFamily:'Arial',color:'#dd99ff',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    // 紫パーティクルを定期的に発生させる
    this._poisonParticleTimer=this.time.addEvent({
      delay:200, loop:true,
      callback:()=>{
        const pd=this.playerData, p=this.player;
        if(!pd._poisoned || !p || !p.active) return;
        // プレイヤーの周りから紫の小さな泡が立ち昇る
        for(let i=0;i<2;i++){
          const ox=(Math.random()-0.5)*30, oy=(Math.random()-0.5)*20+5;
          const c=this.add.circle(p.x+ox, p.y+oy, 2+Math.random()*2, 0xcc55dd, 0.85).setDepth(6);
          this.tweens.add({
            targets:c, y:p.y+oy-30-Math.random()*20,
            alpha:0, scaleX:0.3, scaleY:0.3,
            duration:700+Math.random()*400,
            ease:'Cubic.easeOut',
            onComplete:()=>c.destroy(),
          });
        }
      }
    });
  }

  // 毒の毎フレーム処理
  _tickPoison(dt){
    const pd=this.playerData, p=this.player;
    if(!pd._poisoned) return;
    pd._poisonTimer-=dt;
    pd._poisonTickAccum=(pd._poisonTickAccum||0)+dt;
    // 1秒ごとにダメージ(max HPの2%、最低2、最大15)
    if(pd._poisonTickAccum>=1.0){
      pd._poisonTickAccum-=1.0;
      const dmg=Math.max(2,Math.min(15,Math.floor(pd.mhp*0.02)));
      pd.hp=Math.max(1, pd.hp-dmg); // 毒では死なない(HP1まで)
      this.showFloat(p.x,p.y-30,'-'+dmg,'#cc55dd','info');
      this.updateHUD();
    }
    // 毒HUDタイマー更新
    if(this._poisonHudTxt && this._poisonHudTxt.active){
      this._poisonHudTxt.setText('毒 '+Math.ceil(pd._poisonTimer)+'s');
    }
    // 毒時間切れで解除
    if(pd._poisonTimer<=0){
      this.showFloat(p.x,p.y-60,'✨ 毒消え','#88ff88','info');
      this.clearPoison();
    }
  }

  // ── 麻痺システム ──────────────────────────
  // プレイヤーに麻痺を付与(5秒間何もできない)
  applyParalyze(durationSec){
    const pd=this.playerData, p=this.player;
    if(pd._paralyzed){
      pd._paralyzeTimer=Math.max(pd._paralyzeTimer||0, durationSec);
      return;
    }
    pd._paralyzed=true;
    pd._paralyzeTimer=durationSec;
    this.showFloat(p.x,p.y-60,'⚡ 麻痺!','#ffff44','info');
    SE('hurt');
    // 黄色tintを適用
    if(p && p.setTint) p.setTint(0xffff66);
    this._showParalyzeHUD();
  }

  // 麻痺解除
  clearParalyze(){
    const pd=this.playerData, p=this.player;
    pd._paralyzed=false;
    pd._paralyzeTimer=0;
    // 毒中だったら毒tintを戻す
    if(p && p.clearTint) p.clearTint();
    if(pd._poisoned && p && p.setTint) p.setTint(0xcc88ff);
    if(this._paralyzeHudBg){
      this._paralyzeHudBg.destroy(); this._paralyzeHudBg=null;
      this._paralyzeHudIcon.destroy(); this._paralyzeHudIcon=null;
      this._paralyzeHudTxt.destroy(); this._paralyzeHudTxt=null;
    }
    if(this._paralyzeParticleTimer){this._paralyzeParticleTimer.remove();this._paralyzeParticleTimer=null;}
  }

  // 麻痺HUD表示
  _showParalyzeHUD(){
    if(this._paralyzeHudBg)return;
    const x=92, y=124; // 毒HUDの下
    this._paralyzeHudBg=this.add.rectangle(x,y,80,20,0x554400,0.85).setStrokeStyle(1,0xffff44).setScrollFactor(0).setDepth(30);
    this._paralyzeHudIcon=this.add.text(x-28,y,'⚡',{fontSize:'14px'}).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    this._paralyzeHudTxt=this.add.text(x+8,y,'麻痺 0s',{fontSize:'11px',fontFamily:'Arial',color:'#ffff66',fontStyle:'bold'}).setOrigin(0.5).setScrollFactor(0).setDepth(31);
    // 電気パーティクル(黄色のスパーク)
    this._paralyzeParticleTimer=this.time.addEvent({
      delay:120, loop:true,
      callback:()=>{
        const p=this.player;
        if(p && p.active){
          for(let i=0;i<2;i++){
            const ox=(Math.random()-0.5)*40, oy=(Math.random()-0.5)*40;
            const c=this.add.rectangle(p.x+ox, p.y+oy, 3, 8, 0xffff44, 0.95).setRotation(Math.random()*Math.PI).setDepth(6);
            this.tweens.add({
              targets:c, alpha:0, scaleX:0.3, scaleY:0.3,
              duration:280,
              onComplete:()=>c.destroy(),
            });
          }
        }
      }
    });
  }

  // 麻痺の毎フレーム処理
  _tickParalyze(dt){
    const pd=this.playerData, p=this.player;
    if(!pd._paralyzed) return;
    pd._paralyzeTimer-=dt;
    // 麻痺HUDタイマー更新
    if(this._paralyzeHudTxt && this._paralyzeHudTxt.active){
      this._paralyzeHudTxt.setText('麻痺 '+Math.ceil(pd._paralyzeTimer)+'s');
    }
    // 麻痺時間切れで解除
    if(pd._paralyzeTimer<=0){
      this.showFloat(p.x,p.y-60,'✨ 麻痺解除','#88ff88','info');
      this.clearParalyze();
    }
  }

  // ── 敵の近接攻撃 ──
  // ── 攻撃モーション: enemy_<id>_atk テクスチャに切替→300ms後に戻す ──
  _playEnemyAttackAnim(ed){
    if(!ed || !ed.sprite || !ed.sprite.active || ed.dead) return;
    const sp=ed.sprite;
    const baseKey='enemy_'+ed.id;
    const atkKey=baseKey+'_atk';
    // attack画像が無い場合は何もしない(コード描画版・atk未用意の敵)
    if(!this.textures.exists(atkKey)) return;
    // 既にattack表示中なら無視(連打防止)
    if(sp._inAtkAnim) return;
    sp._inAtkAnim=true;
    // テクスチャ切替(displaySizeは保持される)
    sp.setTexture(atkKey);
    // 300ms後にidleに戻す
    this.time.delayedCall(300, ()=>{
      if(!sp || !sp.active) return;
      // edが死んでいる/シーンが変わっている場合は戻さない
      if(this.textures.exists(baseKey)){
        sp.setTexture(baseKey);
      }
      sp._inAtkAnim=false;
    });
  }

  _enemyMelee(ed, pd, p){
    // 攻撃モーション再生
    this._playEnemyAttackAnim(ed);
    if(pd._parry){
      this.showFloat(p.x,p.y-40,'PARRY!','#ffd700','info');
      pd._parry=false;
      return;
    }
    if(Math.random()*100<this._getDodgeRate(ed.isBoss)){
      this.showFloat(p.x,p.y-40,'DODGE!','#2ecc71','info');
      SE('dodge');
      return;
    }
    // 燕返し: カウンター態勢中なら被弾を無効化+反撃
    if(pd._samuraiCounterUntil && this.time.now < pd._samuraiCounterUntil && !ed.dead){
      pd._samuraiCounterUntil = 0; // 1回限定
      // 視覚: 青いリングが拡散
      const ring=this.add.circle(p.x, p.y, 30, 0x88ccff, 0).setStrokeStyle(4, 0x88ccff, 1).setDepth(20);
      this.tweens.add({targets:ring, scaleX:3, scaleY:3, alpha:0, duration:400, onComplete:()=>ring.destroy()});
      // 反撃エフェクト
      const ang = Phaser.Math.Angle.Between(p.x, p.y, ed.sprite.x, ed.sprite.y);
      const slash=this.add.image(ed.sprite.x, ed.sprite.y, 'fx_slash').setRotation(ang).setDisplaySize(90,90).setDepth(20).setTint(0x88ccff);
      this.tweens.add({targets:slash, alpha:0, scaleX:1.5, scaleY:1.5, duration:300, onComplete:()=>slash.destroy()});
      // 反撃ダメージ: ATK × 2.5
      const counterDmg = Math.max(1, Math.floor(pd.atk * 2.5));
      this.hitEnemy(ed, counterDmg, true, true, '');
      this.showFloat(p.x, p.y-50, '🌪 燕返し！', '#88ccff');
      this.cameras.main.shake(120, 0.01);
      // カウンターリングを破棄
      if(pd._samuraiCounterRing){try{pd._samuraiCounterRing.destroy();}catch(e){} pd._samuraiCounterRing=null;}
      return; // 被弾なし
    }
    const dmg=Math.max(1,ed.atk-(pd.def||0)+Phaser.Math.Between(0,3));
    pd.hp=Math.max(0,pd.hp-dmg);
    this.showFloat(p.x,p.y-40,'-'+dmg,'#e74c3c','info');
    this.updateHUD();
    SE('hurt');
    // ── 覚醒ゲージ: 被弾で蓄積(通常時のみ、HP10%以上のダメージで+2) ──
    if(!pd.awakened && dmg >= pd.mhp * 0.05){
      pd.awakGauge = Math.min(pd.awakGaugeMax||100, (pd.awakGauge||0) + 2);
      if(pd.awakGauge >= (pd.awakGaugeMax||100) && !pd._awakReadyShown){
        pd._awakReadyShown = true;
        this.showFloat(p.x, p.y-60, '✨ 覚醒準備完了 ✨', '#ffeecc', 'boost');
      }
      if(this._updateAwakeningButton) this._updateAwakeningButton();
    }
    // 毒付与
    const poisonChance={scorpion:0.10, scorpion_queen:0.20, scorpion_king:0.30, zombie:0.10, ghost:0.25};
    if(poisonChance[ed.id] && !pd._poisoned && Math.random()<poisonChance[ed.id]){
      this.applyPoison(15);
    }
    // ノックバック攻撃(青鬼など knockback プロパティを持つ敵)
    if(ed.knockback && Math.random() < ed.knockback){
      const angBack = Phaser.Math.Angle.Between(ed.sprite.x, ed.sprite.y, p.x, p.y);
      const kbDist = 180;
      const tx = p.x + Math.cos(angBack) * kbDist;
      const ty = p.y + Math.sin(angBack) * kbDist;
      this.tweens.add({targets:p, x:tx, y:ty, duration:280, ease:'Cubic.easeOut'});
      this.showFloat(p.x, p.y-60, '💢 ノックバック!', '#4488ff', 'info');
      SE('hurt');
    }
    // 麻痺付与(近接攻撃でも稀に発動・ガマ忍者など)
    if(ed.paralyze && Math.random() < ed.paralyze && !pd._paralyzed){
      this.applyParalyze(5);
    }
  }

  // ── 敵の遠距離攻撃(投射物を発射) ──
  _enemyShoot(ed, p){
    if(!this.enemyBullets) return;
    // 攻撃モーション再生
    this._playEnemyAttackAnim(ed);
    const sp=ed.sprite;
    // ── リッチ専用: 詠唱演出+遅延発射(必中ホーミング魔法) ──
    if(ed.id==='lich'){
      // ① 詠唱開始: 大きな魔法陣が足元に出現
      const circleR=this.add.circle(sp.x, sp.y+sp.displayHeight*0.3, 8, 0xcc44ff, 0).setStrokeStyle(2, 0xcc44ff, 0.9).setDepth(3);
      this.tweens.add({targets:circleR, radius:50, duration:600, ease:'Cubic.easeOut'});
      this.tweens.add({targets:circleR, alpha:0, duration:200, delay:600, onComplete:()=>circleR.destroy()});
      // ② リッチの頭上に紫の魔力球が集まる
      const charge=this.add.circle(sp.x, sp.y-sp.displayHeight*0.3, 4, 0xcc44ff, 1.0).setDepth(6);
      this.tweens.add({targets:charge, scaleX:5, scaleY:5, duration:600, ease:'Quad.easeIn'});
      // ハロー
      const chargeHalo=this.add.circle(sp.x, sp.y-sp.displayHeight*0.3, 8, 0xcc44ff, 0.5).setDepth(5);
      this.tweens.add({targets:chargeHalo, scaleX:6, scaleY:6, alpha:0.2, duration:600, ease:'Quad.easeIn'});
      // ③ 詠唱中の文字
      const txt=this.add.text(sp.x, sp.y-sp.displayHeight*0.5-20, '🔮 詠唱…', {fontSize:'12px', fontFamily:'Arial', color:'#cc44ff', stroke:'#000', strokeThickness:3}).setOrigin(0.5).setDepth(7);
      this.tweens.add({targets:txt, alpha:0.5, duration:300, yoyo:true, repeat:1});
      SE('magic');
      // ④ 0.7秒後に発射(プレイヤー位置を再取得=多少ホーミング)
      this.time.delayedCall(700, ()=>{
        if(charge && charge.active) charge.destroy();
        if(chargeHalo && chargeHalo.active) chargeHalo.destroy();
        if(txt && txt.active) txt.destroy();
        // edが死んでたら撃たない
        if(!ed.sprite || !ed.sprite.active || ed.dead) return;
        // 発射時のフラッシュ
        const flash=this.add.circle(ed.sprite.x, ed.sprite.y-sp.displayHeight*0.3, 30, 0xffffff, 0.9).setDepth(7);
        this.tweens.add({targets:flash, scaleX:2, scaleY:2, alpha:0, duration:250, onComplete:()=>flash.destroy()});
        // 弾発射(現在のプレイヤー位置に向かって=ホーミング感)
        const target=this.player;
        if(!target || !target.active) return;
        const ang=Math.atan2(target.y-ed.sprite.y, target.x-ed.sprite.x);
        const speed=380; // 矢より速い
        const b=this.add.circle(ed.sprite.x, ed.sprite.y-sp.displayHeight*0.3, 12, 0xcc44ff, 1.0).setDepth(5);
        this.physics.add.existing(b);
        b.body.setVelocity(Math.cos(ang)*speed, Math.sin(ang)*speed);
        b.body.setCircle(12);
        this.enemyBullets.add(b);
        b.setData('dmg', ed.atk);
        b.setData('maxDist', ed.rng+150);
        b.setData('startX', ed.sprite.x);
        b.setData('startY', ed.sprite.y);
        b.setData('vx', Math.cos(ang)*speed);
        b.setData('vy', Math.sin(ang)*speed);
        b.setData('magic', true);
        // 魔法弾の光るオーラ
        const halo=this.add.circle(ed.sprite.x, ed.sprite.y-sp.displayHeight*0.3, 22, 0xcc44ff, 0.4).setDepth(4);
        b.setData('halo', halo);
        // 内側の白い核
        const core=this.add.circle(b.x, b.y, 5, 0xffffff, 0.9).setDepth(6);
        b.setData('core', core);
        SE('shoot');
      });
      return;
    }
    // ── 矢などの通常弾 ──
    const angle=Math.atan2(p.y-sp.y, p.x-sp.x);
    const speed=320;
    let color=0xff4444, size=6, isMagic=false;
    if(ed.id==='dark_elf' || ed.id==='orc_archer'){
      color=0x88ffaa; size=7;
    } else if(ed.id==='treant'){
      color=0x66aa44; size=9;
    } else if(ed.id==='gama_ninja'){
      // ガマ忍者: 手裏剣を発射(専用スプライト・回転)
      SE('shoot');
      const speed2=380;
      const angle2 = Phaser.Math.Angle.Between(sp.x, sp.y, p.x, p.y);
      const b2 = this.add.sprite(sp.x, sp.y, 'proj_shuriken').setDepth(5);
      b2.setDisplaySize(28, 28);
      this.physics.add.existing(b2);
      b2.body.setVelocity(Math.cos(angle2)*speed2, Math.sin(angle2)*speed2);
      b2.body.setCircle(12);
      this.enemyBullets.add(b2);
      b2.setData('dmg', Math.floor(ed.atk*0.6));  // 通常攻撃の60%
      b2.setData('maxDist', ed.rng+150);
      b2.setData('startX', sp.x);
      b2.setData('startY', sp.y);
      b2.setData('vx', Math.cos(angle2)*speed2);
      b2.setData('vy', Math.sin(angle2)*speed2);
      b2.setData('magic', false);
      b2.setData('paralyze', 0.10);  // 10%で麻痺付与
      // 手裏剣の回転アニメ
      this.tweens.add({targets:b2, rotation:Math.PI*8, duration:1500, repeat:-1});
      return;
    }
    SE('shoot');
    const b=this.add.circle(sp.x, sp.y, size, color, 1.0).setDepth(5);
    this.physics.add.existing(b);
    b.body.setVelocity(Math.cos(angle)*speed, Math.sin(angle)*speed);
    b.body.setCircle(size);
    this.enemyBullets.add(b);
    b.setData('dmg', ed.atk);
    b.setData('maxDist', ed.rng+100);
    b.setData('startX', sp.x);
    b.setData('startY', sp.y);
    b.setData('vx', Math.cos(angle)*speed);
    b.setData('vy', Math.sin(angle)*speed);
    b.setData('magic', false);
  }

  // ── 敵のメテオーム詠唱(ダークイリュージョン用) ──
  _enemyMeteor(ed, p){
    if(!this.enemyBullets || !ed.sprite || !ed.sprite.active) return;
    const sp=ed.sprite;
    // 詠唱演出: ボス周囲に赤いオーラ
    const aura=this.add.circle(sp.x, sp.y, 60, 0xff4400, 0.4).setDepth(5);
    this.tweens.add({targets:aura, scaleX:2, scaleY:2, alpha:0, duration:700, onComplete:()=>aura.destroy()});
    SE('magic');
    this.showFloat(sp.x, sp.y-70, '🔥 メテオーム!', '#ff4400', 'info');
    // 0.8秒後に落下地点を表示、さらに0.6秒後に炎の柱
    this.time.delayedCall(800, ()=>{
      if(!this.player || !this.player.active) return;
      // プレイヤーの現在位置に予告マーカー
      const tx=this.player.x, ty=this.player.y;
      const marker=this.add.circle(tx, ty, 50, 0xff4400, 0.3).setDepth(2).setStrokeStyle(3, 0xff0000, 0.9);
      this.tweens.add({targets:marker, alpha:0.6, scaleX:1.1, scaleY:1.1, duration:300, yoyo:true, repeat:1});
      this.time.delayedCall(600, ()=>{
        if(marker && marker.active) marker.destroy();
        // 着弾
        const explode=this.add.circle(tx, ty, 10, 0xffaa00, 1.0).setDepth(6);
        this.tweens.add({targets:explode, scaleX:7, scaleY:7, alpha:0, duration:500, onComplete:()=>explode.destroy()});
        // 外輪
        const ring=this.add.circle(tx, ty, 70, 0xff4400, 0.6).setDepth(5);
        this.tweens.add({targets:ring, scaleX:1.4, scaleY:1.4, alpha:0, duration:700, onComplete:()=>ring.destroy()});
        SE('hurt');
        this.cameras.main.shake(300, 0.01);
        // 範囲ダメージ判定
        const pd=this.playerData, pl=this.player;
        if(pl && pl.active){
          const d=Phaser.Math.Distance.Between(tx, ty, pl.x, pl.y);
          if(d<80){
            // ── メテオは魔法攻撃: 必中(回避・パリィ不可)・MAGで耐性 ──
            const intResist=Math.min(0.80, (pd.intPts||0)*0.02);
            const baseDmg=Math.max(1, Math.floor(ed.atk*1.4)-(pd.def||0)+Phaser.Math.Between(0,5));
            const finalDmg=Math.max(1, Math.floor(baseDmg*(1-intResist)));
            pd.hp=Math.max(0, pd.hp-finalDmg);
            this.showFloat(pl.x, pl.y-40, '-'+finalDmg+(intResist>0?' (魔法)':''), '#ff4400', 'info');
            this.updateHUD();
            // 紫の閃光(魔法ダメージ強調)
            const flash=this.add.circle(pl.x, pl.y, 35, 0xcc44ff, 0.6).setDepth(7);
            this.tweens.add({targets:flash, scaleX:1.5, scaleY:1.5, alpha:0, duration:300, onComplete:()=>flash.destroy()});
            if(pd.hp<=0){this.gameOver();}
          }
        }
      });
    });
  }

  // ── 敵弾のライフサイクル管理(update内から呼ぶ) ──
  _updateEnemyBullets(dt){
    if(!this.enemyBullets || !this.player || !this.player.active) return;
    const pd=this.playerData, p=this.player;
    this.enemyBullets.getChildren().forEach(b=>{
      if(!b.active) return;
      // 手動移動(physicsのvelocity不具合対策・確実に飛ばす)
      const vx=b.getData('vx'), vy=b.getData('vy');
      if(vx!==undefined && vy!==undefined){
        b.x += vx*dt;
        b.y += vy*dt;
      }
      // 飛距離チェック
      const sx=b.getData('startX')||0, sy=b.getData('startY')||0;
      const trav=Phaser.Math.Distance.Between(sx, sy, b.x, b.y);
      const maxD=b.getData('maxDist')||400;
      if(trav>maxD){
        const halo=b.getData('halo');
        if(halo && halo.active) halo.destroy();
        const core=b.getData('core');
        if(core && core.active) core.destroy();
        b.destroy();
        return;
      }
      // 光のオーラを魔法弾に追従
      const halo=b.getData('halo');
      if(halo && halo.active){halo.x=b.x; halo.y=b.y;}
      const core=b.getData('core');
      if(core && core.active){core.x=b.x; core.y=b.y;}
      // ワールド外なら消す
      if(b.x<-50||b.x>this.MW+50||b.y<-50||b.y>this.MH+50){
        if(halo && halo.active) halo.destroy();
        if(core && core.active) core.destroy();
        b.destroy();
        return;
      }
      // プレイヤーとの当たり判定
      const d=Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y);
      if(d<26){
        const dmg=b.getData('dmg')||10;
        const isMagic=b.getData('magic');
        // パリィは物理のみ(魔法はパリィ不可)
        if(!isMagic && pd._parry){
          this.showFloat(p.x, p.y-40, 'PARRY!', '#ffd700', 'info');
          pd._parry=false;
          // 弾消費
          const halo=b.getData('halo'); if(halo && halo.active) halo.destroy();
          const core=b.getData('core'); if(core && core.active) core.destroy();
          b.destroy();
          return;
        }
        // AGIでの回避判定は物理のみ(魔法は球が当たったら必中)
        if(!isMagic && Math.random()*100<this._getDodgeRate(false)){
          this.showFloat(p.x, p.y-40, 'DODGE!', '#2ecc71', 'info');
          SE('dodge');
          // 弾消費
          const halo=b.getData('halo'); if(halo && halo.active) halo.destroy();
          const core=b.getData('core'); if(core && core.active) core.destroy();
          b.destroy();
          return;
        }
        if(isMagic){
          // 魔法弾被弾: MAG(intPts)で耐性・AGI回避は無効
          const intResist=Math.min(0.80, (pd.intPts||0)*0.02);
          const finalDmg=Math.max(1, Math.floor(dmg*(1-intResist)));
          pd.hp=Math.max(0, pd.hp-finalDmg);
          this.showFloat(p.x, p.y-40, '-'+finalDmg+(intResist>0?' (魔法)':''), '#cc44ff', 'info');
          this.updateHUD();
          SE('hurt');
          const flash=this.add.circle(p.x, p.y, 30, 0xcc44ff, 0.6).setDepth(7);
          this.tweens.add({targets:flash, scaleX:1.5, scaleY:1.5, alpha:0, duration:300, onComplete:()=>flash.destroy()});
          if(pd.hp<=0){this.gameOver();}
        } else {
          // 物理弾被弾: DEFで軽減
          const finalDmg=Math.max(1, dmg-(pd.def||0)+Phaser.Math.Between(0,3));
          pd.hp=Math.max(0, pd.hp-finalDmg);
          this.showFloat(p.x, p.y-40, '-'+finalDmg, '#e74c3c', 'info');
          this.updateHUD();
          SE('hurt');
          if(pd.hp<=0){this.gameOver();}
          // 手裏剣などの麻痺付与判定(弾に paralyze プロパティがある場合)
          const paralyzeChance = b.getData('paralyze') || 0;
          if(paralyzeChance > 0 && !pd._paralyzed && Math.random() < paralyzeChance){
            this.applyParalyze(5);
          }
        }
        if(halo && halo.active) halo.destroy();
        const core2=b.getData('core');
        if(core2 && core2.active) core2.destroy();
        b.destroy();
      }
    });
  }

  update(time,delta){
    const dt=delta/1000,pd=this.playerData,p=this.player;
    // ゲームオーバー中・メニュー表示中は全処理停止
    if(this._gameOver||this._menuOpen||this._npcDialogOpen){
      p.setVelocity(0,0);
      return;
    }
    // 詠唱中はプレイヤー停止（敵AIは動く）
    if(this._casting){
      p.setVelocity(0,0);
      // returnせず処理を継続(敵AI・被弾・DoT処理が動くように)
      // _atkHeldフラグだけ落として通常攻撃が走らないようにする
    }
    // 麻痺中はプレイヤー操作不可(敵AIは動く)
    if(pd._paralyzed){
      p.setVelocity(0,0);
    }
    // 詠唱中はジョイスティック操作スキップ(移動できない)
    if(!this._casting && !pd._paralyzed){
      this.updateJoystick();
    }
    // 現在座標を毎フレーム更新(HUD右上)
    if(this.hudCoordTxt&&this.hudCoordTxt.active && p){
      this.hudCoordTxt.setText('X:'+Math.floor(p.x)+' Y:'+Math.floor(p.y));
    }
    // NPC接触判定(プレイヤー近くにいる時にプロンプト表示)
    if(this.npcs && this.npcs.length > 0){
      this.npcs.forEach(npc=>{
        const dist = Phaser.Math.Distance.Between(p.x, p.y, npc.def.x, npc.def.y);
        if(npc.promptTxt && npc.promptTxt.active){
          npc.promptTxt.setVisible(dist < 120);
        }
      });
    }
    // プレイヤーHPバーの追従と更新
    if(this._playerHpBar && p){
      const psize = p.displayHeight;
      this._playerHpBarBg.setPosition(p.x, p.y + psize/2 + 8);
      const ratio = Math.max(0, Math.min(1, pd.hp / pd.mhp));
      this._playerHpBar.setPosition(p.x - this._playerHpBarW/2, p.y + psize/2 + 8);
      this._playerHpBar.setSize(this._playerHpBarW * ratio, 5);
      // 体力に応じて色変化(緑→黄→赤)
      const col = ratio > 0.5 ? 0x44dd44 : (ratio > 0.25 ? 0xf39c12 : 0xe74c3c);
      this._playerHpBar.setFillStyle(col);
    }
    // 毒状態処理(毎フレーム)
    this._tickPoison(dt);
    // 麻痺状態処理(毎フレーム)
    this._tickParalyze(dt);
    // 覚醒モード処理(HP減少・追従・雷電エフェクト)
    this._updateAwakening(dt);
    // 敵弾のライフサイクル管理
    this._updateEnemyBullets(dt);
    // スペースキーで通常攻撃(押しっぱで連射対応・atkCooldownで自動的にクール調整)
    if(this.spaceKey.isDown && !pd._paralyzed && !this._casting)this.normalAttack();
    if(this.atkCooldown>0)this.atkCooldown-=dt;
    // HP/SP 自動回復（VIT/INTステータスに依存）
    if(!this._regenTimer)this._regenTimer=0;
    this._regenTimer+=dt;
    if(this._regenTimer>=1.0){ // 1秒ごとに回復
      this._regenTimer=0;
      // 覚醒中で回復禁止フラグがあれば自動回復もスキップ
      const blockReg = pd.awakened && AWAKENINGS[pd.awakened] && AWAKENINGS[pd.awakened].blockHeal;
      // HP自動回復: VITポイント × 0.5/秒（最低0）
      const vitRegen=(pd.vitPts||0)*0.5;
      if(!blockReg && vitRegen>0&&pd.hp<pd.mhp){
        pd.hp=Math.min(pd.mhp,pd.hp+vitRegen);
        this.updateHUD();
      }
      // SP自動回復: INTポイント × 0.3/秒（最低0）
      const intRegen=(pd.intPts||0)*0.3;
      if(!blockReg && intRegen>0&&pd.sp<pd.msp){
        pd.sp=Math.min(pd.msp,pd.sp+intRegen);
        this.updateHUD();
      }
    }
    // スキルCD（createSkillButtons内のoverlayで処理）
    if(!this.bossSpawned&&this.killCount>=this.cfg.bossThreshold)this.spawnBoss();
    // 弾の距離チェック（maxDist超えたら消去）
    this.bullets.getChildren().forEach(b=>{
      if(b.getData('dead'))return;
      const vx=b.getData('vx')||0,vy=b.getData('vy')||0;
      const cur=b.getData('dist')||0;
      const nd=cur+Math.sqrt(vx*vx+vy*vy)*dt;
      b.setData('dist',nd);
      if(nd>b.getData('maxDist')){
        if(b.getData('bowling')){
          const bx=b.x,by=b.y,bDmg=b.getData('bowlingDmg')||1,bR=b.getData('bowlingRadius')||40,bCrit=b.getData('bowlingCrit')||false;
          b.destroy();
          for(let i=0;i<6;i++){
            const a=i/6*Math.PI*2,ex=bx+Math.cos(a)*bR,ey=by+Math.sin(a)*bR;
            this.time.delayedCall(i*40,()=>{
              const dot=this.add.circle(bx,by,8,0xffcc00,1.0).setDepth(24);
              this.tweens.add({targets:dot,x:ex,y:ey,alpha:0,scaleX:0.5,scaleY:0.5,duration:200,ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
              const expl=this.add.circle(ex,ey,bR*0.4,0xff6600,0.7).setDepth(24);
              this.tweens.add({targets:expl,alpha:0,scaleX:2,scaleY:2,duration:250,onComplete:()=>expl.destroy()});
              this.enemyDataList.forEach(e2=>{if(!e2.dead&&Phaser.Math.Distance.Between(ex,ey,e2.sprite.x,e2.sprite.y)<bR)this.hitEnemy(e2,bDmg,bCrit,true);});
            });
          }
          SE('explode');
        }else{b.destroy();}
      }
    });
    // 敵AI（凍結・ノックバック・受動/能動）
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
        if(ed.nameLabel)ed.nameLabel.setPosition(sp.x,sp.y-sp.displayHeight/2-14);
        return;
      }

      // ノックバック中
      if(ed.knockTimer>0){
        ed.knockTimer-=dt;
        sp.setVelocity(ed.knockVx,ed.knockVy);
        ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
        ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
        if(ed.nameLabel)ed.nameLabel.setPosition(sp.x,sp.y-sp.displayHeight/2-14);
        return;
      }

      // 受動モンスター（passive:true）かつ未aggro → ランダム徘徊のみ
      if(ed.passive&&!ed.aggro){
        ed.wanderTimer-=dt;
        if(ed.wanderTimer<=0){
          ed.wanderTimer=Phaser.Math.FloatBetween(1.5,4.0);
          const ang=Math.random()*Math.PI*2;
          ed.wanderVx=Math.cos(ang)*ed.spd*0.2;
          ed.wanderVy=Math.sin(ang)*ed.spd*0.2;
        }
        // ── 壁判定付きで移動 ──
        this._moveEnemyWithCollision(ed, ed.wanderVx, ed.wanderVy, dt);
        ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
        ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
        if(ed.nameLabel)ed.nameLabel.setPosition(sp.x,sp.y-sp.displayHeight/2-14);
        return;
      }

      // 能動（passive:false）または受動でaggro済み → プレイヤーへ追跡
      const CHASE_RANGE=300;
      // ── 壁越し視認チェック: 壁の向こう側にプレイヤーがいる場合はaggroを解除 ──
      let canSeePlayer = true;
      if(dist<CHASE_RANGE && this._mapMaskCtx){
        canSeePlayer = this._hasLineOfSight(sp.x, sp.y, p.x, p.y);
      }
      let vx=0, vy=0;
      if(dist<CHASE_RANGE && canSeePlayer){
        const ang=Phaser.Math.Angle.Between(sp.x,sp.y,p.x,p.y);
        vx=Math.cos(ang)*ed.spd;
        vy=Math.sin(ang)*ed.spd;
      }else{
        ed.wanderTimer-=dt;
        if(ed.wanderTimer<=0){
          ed.wanderTimer=Phaser.Math.FloatBetween(1.5,3.5);
          const ang=Math.random()*Math.PI*2;
          ed.wanderVx=Math.cos(ang)*ed.spd*0.25;
          ed.wanderVy=Math.sin(ang)*ed.spd*0.25;
        }
        vx=ed.wanderVx;
        vy=ed.wanderVy;
      }
      // ── 壁判定付きで移動 ──
      this._moveEnemyWithCollision(ed, vx, vy, dt);
      // 攻撃(壁越しでは攻撃もしない)
      ed.attackTimer-=dt;
      if(ed.attackTimer<=0&&dist<ed.rng&&canSeePlayer){
        ed.attackTimer=ed.acd;
        // ── 遠距離攻撃タイプ: rng>=150 の敵は投射物を撃つ ──
        const rangedIds=['orc_archer','dark_elf','lich','treant'];
        const bossWithSpell=['dark_illusion','thunder_god','boss4'];
        if(rangedIds.indexOf(ed.id)>=0){
          this._enemyShoot(ed, p);
        } else if(ed.id==='dark_illusion'){
          // ダークイリュージョン: 50%で通常攻撃、50%でメテオーム詠唱
          if(Math.random()<0.5){
            this._enemyMeteor(ed, p);
          } else {
            this._enemyMelee(ed, pd, p);
          }
        } else {
          // 通常近接攻撃
          this._enemyMelee(ed, pd, p);
        }
        if(pd.hp<=0){this.gameOver();return;}
      }

      ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
      ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
        if(ed.nameLabel)ed.nameLabel.setPosition(sp.x,sp.y-sp.displayHeight/2-14);
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
    // ポータル遷移（重複防止フラグ付き）
    if(!this._transitioning){
      // 別ルートポータル（上部・portalAlt）
      if(this.cfg.portalAlt){
        const pa=this.cfg.portalAlt;
        if(Phaser.Math.Distance.Between(p.x,p.y,pa.x,pa.y)<80){
          this._transitioning=true;
          this._doTransition('Game',{playerData:pd,stage:pa.to,fromPortal:'back'});
          return;
        }
      }
      // 戻るポータル（cfgで指定された位置 or デフォルト左端）
      if(this.cfg.portalBack!==null&&this.cfg.portalBack!==undefined){
        const pbX=this.portalBackPos?this.portalBackPos.x:80;
        const pbY=this.portalBackPos?this.portalBackPos.y:this.MH/2;
        if(Phaser.Math.Distance.Between(p.x,p.y,pbX,pbY)<70){
          this._transitioning=true;
          // portalBackSpawnXY で戻り先のスポーン位置を明示(例: DUN1→ST6骨の位置)
          // returnFromSouth=true のステージは、戻り先の南端にスポーン
          // returnFromWest=true のステージは、戻り先の東(橋など)にスポーン
          let fromKey = 'next';
          if(this.cfg.returnFromSouth) fromKey = 'south';
          else if(this.cfg.returnFromWest) fromKey = 'west';
          const dt={playerData:pd,stage:this.cfg.portalBack,fromPortal:fromKey};
          if(this.cfg.portalBackSpawnX!==undefined && this.cfg.portalBackSpawnY!==undefined){
            dt.fromPortal='magic'; // magic経路なら magicReturnX/Y で着地
            dt.magicReturnX=this.cfg.portalBackSpawnX;
            dt.magicReturnY=this.cfg.portalBackSpawnY;
          }
          this._doTransition('Game',dt);
          return;
        }
      }
      // 進むポータル（cfgで指定された位置 or デフォルト右端）
      if(this.portalNext&&this.portalNext.open&&
         Phaser.Math.Distance.Between(p.x,p.y,this.portalNext.x,this.portalNext.y)<70){
        this._transitioning=true;
        const nextScene=(!this.cfg.portalTo)?'GameClear':'Game';
        const nextData=(!this.cfg.portalTo)?{playerData:pd}:{playerData:pd,stage:this.portalNext.to,fromPortal:'back'};
        this._doTransition(nextScene,nextData);
        return;
      }
      // 南方向ポータル(town0 → south_st1 用)
      if(this.portalSouth&&this.portalSouth.open&&
         Phaser.Math.Distance.Between(p.x,p.y,this.portalSouth.x,this.portalSouth.y)<70){
        this._transitioning=true;
        this._doTransition('Game',{playerData:pd,stage:this.portalSouth.to,fromPortal:'back'});
        return;
      }
      // 東方向ポータル(south_st2 → south_st3 用)
      if(this.portalEast&&this.portalEast.open&&
         Phaser.Math.Distance.Between(p.x,p.y,this.portalEast.x,this.portalEast.y)<70){
        this._transitioning=true;
        // 東から入った先(south_st3)では「西側にスポーン」したいので 'east' フラグ
        this._doTransition('Game',{playerData:pd,stage:this.portalEast.to,fromPortal:'east'});
        return;
      }
      // ダンジョンゲート（ボス撃破後に出現・近づくとダイアログ表示）
      if(this._dungeonGate && !this._dungeonGate.dialogOpen &&
         this._dungeonGate.sprite && this._dungeonGate.sprite.active &&
         Phaser.Math.Distance.Between(p.x,p.y,this._dungeonGate.x,this._dungeonGate.y) < 60){
        this._showDungeonDialog();
      }
      // 青魔法ゲート（magicGate: 近づくとダイアログ表示）
      if(this.cfg.magicGate && !this._magicGateDialogOpen){
        const mg=this.cfg.magicGate;
        // 検出半径は狭め(45px)。中心が「触れた位置」に来るようにcfgで調整
        // クールダウン中は再起動しない(キャンセル直後のリトリガ防止)
        const now=this.time.now;
        const cd=this._magicGateCooldownUntil||0;
        if(now>=cd && Phaser.Math.Distance.Between(p.x,p.y,mg.x,mg.y) < 45){
          this._showMagicGateDialog();
        }
      }
      // 分岐ポータル(sidePortal): ダイアログ無し・触れると即遷移
      if(this.cfg.sidePortal && !this._transitioning){
        const sp=this.cfg.sidePortal;
        if(Phaser.Math.Distance.Between(p.x,p.y,sp.x,sp.y) < 50){
          this._transitioning=true;
          this._doTransition('Game', {
            playerData: this.playerData,
            stage: sp.to,
            fromPortal: 'magic',  // magicReturnX/Yで着地
            magicReturnX: sp.returnX,
            magicReturnY: sp.returnY,
          });
        }
      }
    }
    if(Math.floor(time/100)!==Math.floor((time-delta)/100)){
      this.updateMinimap();
      // 覚醒ボタンのゲージリングも更新(ゲージが視覚的に伸びる)
      if(this._updateAwakeningButton) this._updateAwakeningButton();
    }
    // ドロップアイテムの拾得チェック（60フレームに1回）
    if(Math.floor(time/60)!==Math.floor((time-delta)/60)&&this._droppedItems&&this._droppedItems.length>0){
      const px=this.player.x, py=this.player.y;
      const pd=this.playerData;
      this._droppedItems=this._droppedItems.filter(drop=>{
        if(!drop.icon||!drop.icon.active)return false;
        const dist=Phaser.Math.Distance.Between(px,py,drop.x,drop.y);
        if(dist<48){
          // 拾う演出：アイコンがプレイヤーに吸い込まれる
          this.tweens.killTweensOf(drop.icon);
          this.tweens.killTweensOf(drop.ring);
          this.tweens.add({targets:drop.icon,x:px,y:py-30,scaleX:1.5,scaleY:1.5,alpha:0,duration:300,ease:'Cubic.easeIn',onComplete:()=>{drop.icon.destroy();}});
          if(drop.ring){this.tweens.add({targets:drop.ring,alpha:0,duration:200,onComplete:()=>{drop.ring.destroy();}});}
          // アイテム追加
          this._addItem(pd,drop.id,drop.count,px,py);
          return false;
        }
        return true;
      });
    }
    // 攻撃ボタン押しっぱなし
    if(this._atkHeld&&!this._menuOpen&&!this._gameOver&&!this._casting&&!pd._paralyzed){
      this.normalAttack();
    }
    // 建物ドア前接近チェック（ドア座標から60px以内）
    if(this.buildings && this.buildings.length>0 && !this._menuOpen && !this._gameOver){
      let nearB=null;
      let minDist=70; // ドア前の判定距離
      this.buildings.forEach(b=>{
        // ドア座標が設定済みならドア前判定、なければ建物中心
        const doorX=b.doorX!==undefined?b.doorX:b.x+b.w/2;
        const doorY=b.doorY!==undefined?b.doorY:b.y+b.h;
        const d=Phaser.Math.Distance.Between(p.x,p.y,doorX,doorY);
        if(d<minDist){minDist=d;nearB=b;}
      });
      if(nearB!==this._nearBuilding){
        this._nearBuilding=nearB;
        this._updateEnterBtn(nearB);
      }
    }
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
const _game=new Phaser.Game({
  type:Phaser.AUTO,
  scale:{
    mode:Phaser.Scale.RESIZE,
    autoCenter:Phaser.Scale.CENTER_BOTH,
    width:'100%',
    height:'100%',
  },
  backgroundColor:'#000000',
  input:{
    activePointers:4,
    touch:{capture:true},
  },
  physics:{default:'arcade',arcade:{gravity:{y:0},debug:false}},
  scene:[BootScene,TitleScene,SaveSelectScene,ClassSelectScene,LevelUpScene,GameScene,GameClearScene]
});

// 画面回転・リサイズ時にUIシーンを再起動
const _uiScenes=['Title','ClassSelect','SaveSelect'];
const _handleResize=()=>{
  _uiScenes.forEach(key=>{
    try{
      if(_game && _game.scene && _game.scene.isActive(key)){
        const s=_game.scene.getScene(key);
        if(s && s.scene && typeof s.scene.restart==='function'){
          s.scene.restart();
        }
      }
    }catch(e){
      // リサイズ処理のエラーでゲーム全体が止まらないようガード
      console.warn('resize handler error:',e);
    }
  });
};
// orientationchangeは完了まで時間がかかるため少し待つ
window.addEventListener('orientationchange',()=>{setTimeout(_handleResize,500);});
window.addEventListener('resize',()=>{setTimeout(_handleResize,300);});

// ── 初回起動時のサイズ問題対策 ──
// モバイルブラウザ(iOS Safari 等)のアドレスバー収納タイミングのズレで、
// 初回ロード時に Phaser が小さい viewport を取得し、画面下部に余白が出ることがある。
// 数回 scale.refresh + UIシーン restart で確実にフィットさせる。
const _forceResize = ()=>{
  try{
    if(_game && _game.scale && typeof _game.scale.refresh==='function'){
      _game.scale.refresh();
    }
  }catch(e){}
  _handleResize();
};
window.addEventListener('load', ()=>{
  // load 直後 + 短遅延 + アドレスバー収納待ちの3回
  _forceResize();
  setTimeout(_forceResize, 200);
  setTimeout(_forceResize, 700);
  setTimeout(_forceResize, 1500);
});
// visualViewport があれば追加で監視(モバイルでより正確)
if(window.visualViewport){
  window.visualViewport.addEventListener('resize', ()=>{ setTimeout(_forceResize, 100); });
}

// デバッグ用: ブラウザのコンソールから game.xxx でアクセスできるように
window.game = _game;

// よく使うデバッグ関数(コンソールから debug.xxx() で呼べる)
window.debug = {
  warp: (stage)=>{const gs=_game.scene.getScene('Game'); gs.scene.start('Game',{playerData:gs.playerData,stage:stage});},
  bossNow: ()=>{const gs=_game.scene.getScene('Game'); gs.killCount=gs.cfg.bossThreshold; console.log('killCount を threshold に設定。次の敵撃破でボス出現');},
  spawnBoss: ()=>{const gs=_game.scene.getScene('Game'); gs.spawnBoss();},
  godMode: ()=>{const gs=_game.scene.getScene('Game'); gs.playerData.hp=gs.playerData.mhp=99999; gs.playerData.atk=999; console.log('無敵+攻撃力999');},
  info: ()=>{const gs=_game.scene.getScene('Game'); console.log({stage:gs.stage, boss:gs.cfg?.boss, killCount:gs.killCount, threshold:gs.cfg?.bossThreshold, bossSpawned:gs.bossSpawned});},
  // スタック脱出: スポーン位置にワープ
  unstick: ()=>{const gs=_game.scene.getScene('Game'); if(gs.player&&gs.cfg){ gs.player.x=gs.cfg.spawnX||100; gs.player.y=gs.cfg.spawnY||100; console.log('スポーン位置にワープしました'); }},
};