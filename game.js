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

// ── BGMシステム（MP3 + Web Audio合成）────────────
let _bgmAudio=null,_bgmKey=null;
let _bgmNodes=[]; // 合成BGMのノード群
let _bgmLoopTimer=null; // 合成BGMのループタイマー

// MP3ファイルのマッピング（存在するもののみ）
const BGM_FILES={
  st1: BASE+'bgm/rpg_bgm_brass.mp3',
};

// ── 音楽理論定数 ──────────────────────────
const NOTE={
  C3:130.81,D3:146.83,E3:164.81,F3:174.61,G3:196.00,A3:220.00,B3:246.94,
  C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392.00,A4:440.00,B4:493.88,
  C5:523.25,D5:587.33,E5:659.25,F5:698.46,G5:783.99,A5:880.00,
  Bb3:233.08,Bb4:466.16,F3s:185.00,C4s:277.18,G4s:415.30,
};

// ── 合成BGMエンジン ──────────────────────────
function _playNote(ac,master,freq,type,vol,start,dur,attack=0.01,release=0.05){
  if(!ac||!master)return;
  try{
    const o=ac.createOscillator(),g=ac.createGain();
    o.type=type; o.frequency.value=freq;
    o.connect(g); g.connect(master);
    g.gain.setValueAtTime(0,start);
    g.gain.linearRampToValueAtTime(vol,start+attack);
    g.gain.setValueAtTime(vol,start+dur-release);
    g.gain.exponentialRampToValueAtTime(0.0001,start+dur);
    o.start(start); o.stop(start+dur+0.01);
    _bgmNodes.push(o,g);
  }catch(e){}
}

function _stopSynthBGM(){
  _bgmNodes.forEach(n=>{try{n.disconnect();if(n.stop)n.stop();}catch(e){}});
  _bgmNodes=[];
  if(_bgmLoopTimer){clearTimeout(_bgmLoopTimer);_bgmLoopTimer=null;}
}

// ── 町BGM：明るくのどかなRPG風 ────────────────
function _playTownBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.18; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=108, B=60/BPM, bar=B*4;

  // メロディー（フルート風・sine）
  const mel=[
    [NOTE.E4,B*2],[NOTE.G4,B],[NOTE.A4,B],
    [NOTE.G4,B*2],[NOTE.E4,B],[NOTE.C4,B],
    [NOTE.D4,B*2],[NOTE.F4,B],[NOTE.G4,B],
    [NOTE.E4,bar],[NOTE.E4,B*0.5],[NOTE.D4,B*0.5],[NOTE.E4,B*3],
    [NOTE.C5,B*2],[NOTE.B4,B],[NOTE.A4,B],
    [NOTE.G4,B*2],[NOTE.A4,B],[NOTE.B4,B],
    [NOTE.C5,B*2],[NOTE.G4,B],[NOTE.E4,B],
    [NOTE.D4,bar*2],
  ];
  let t=now;
  mel.forEach(([f,d])=>{_playNote(ac,master,f,'sine',0.35,t,d*0.9);t+=d;});

  // ベースライン（triangle）
  const bass=[
    [NOTE.C3,bar],[NOTE.C3,bar],[NOTE.G3,bar],[NOTE.C3,bar],
    [NOTE.F3,bar],[NOTE.G3,bar],[NOTE.C3,bar],[NOTE.C3,bar],
  ];
  let bt=now;
  bass.forEach(([f,d])=>{
    _playNote(ac,master,f,'triangle',0.25,bt,d*0.7);
    _playNote(ac,master,f*2,'triangle',0.10,bt+B,B*0.6);
    bt+=d;
  });

  // 和音（piano風・square低音量）
  const chords=[
    [[NOTE.C4,NOTE.E4,NOTE.G4],bar],
    [[NOTE.C4,NOTE.E4,NOTE.G4],bar],
    [[NOTE.G3,NOTE.B3,NOTE.D4],bar],
    [[NOTE.C4,NOTE.E4,NOTE.G4],bar],
    [[NOTE.F3,NOTE.A3,NOTE.C4],bar],
    [[NOTE.G3,NOTE.B3,NOTE.D4],bar],
    [[NOTE.C4,NOTE.E4,NOTE.G4],bar],
    [[NOTE.C4,NOTE.E4,NOTE.G4],bar],
  ];
  let ct=now;
  chords.forEach(([notes,d])=>{
    notes.forEach(f=>_playNote(ac,master,f,'square',0.04,ct,d*0.8,0.02,0.1));
    ct+=d;
  });

  const totalDur=bar*8;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    if(_bgmKey==='town'&&!muted)_playTownBGM();
  },(totalDur-0.1)*1000);
}

// ── ステージBGM（st2〜4共通）：緊張感のある冒険 ──
function _playStageBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.15; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=130, B=60/BPM, bar=B*4;

  // メロディー（sawtooth：力強い）
  const mel=[
    [NOTE.A4,B],[NOTE.A4,B*0.5],[NOTE.G4,B*0.5],[NOTE.F4,B],[NOTE.E4,B],
    [NOTE.G4,B],[NOTE.G4,B*0.5],[NOTE.F4,B*0.5],[NOTE.E4,B],[NOTE.D4,B],
    [NOTE.F4,B],[NOTE.E4,B],[NOTE.D4,B],[NOTE.C4,B],
    [NOTE.E4,B*2],[NOTE.D4,B],[NOTE.C4,B],
    [NOTE.A4,B],[NOTE.Bb3,B*0.5],[NOTE.A4,B*0.5],[NOTE.G4,B],[NOTE.F4,B],
    [NOTE.G4,B*2],[NOTE.F4,B],[NOTE.E4,B],
    [NOTE.D4,B],[NOTE.E4,B],[NOTE.F4,B],[NOTE.G4,B],
    [NOTE.A4,bar*1.5],[NOTE.A4,bar*0.5],
  ];
  let t=now; mel.forEach(([f,d])=>{_playNote(ac,master,f,'sawtooth',0.22,t,d*0.85,0.005,0.04);t+=d;});

  // ベース（square・低い）
  const bassLine=[
    NOTE.A3,NOTE.A3,NOTE.G3,NOTE.G3,
    NOTE.F3,NOTE.F3,NOTE.E3||NOTE.F3,NOTE.E3||NOTE.F3,
  ];
  for(let i=0;i<8;i++){
    const f=bassLine[i]||NOTE.A3;
    _playNote(ac,master,f,'square',0.18,now+i*bar,B*0.8,0.01,0.05);
    _playNote(ac,master,f,'square',0.12,now+i*bar+B*2,B*0.8,0.01,0.05);
  }

  // ドラム風パーカッション（ノイズ代わりにdetuneした短音）
  for(let i=0;i<8;i++){
    const bt=now+i*bar;
    // キック（低音短い）
    _playNote(ac,master,60,'sine',0.30,bt,0.08,0.001,0.07);
    _playNote(ac,master,60,'sine',0.30,bt+B*2,0.08,0.001,0.07);
    // スネア風
    _playNote(ac,master,200,'square',0.12,bt+B,0.05,0.001,0.04);
    _playNote(ac,master,200,'square',0.12,bt+B*3,0.05,0.001,0.04);
    // ハット風
    for(let h=0;h<4;h++){
      _playNote(ac,master,8000,'sine',0.03,bt+h*B,0.04,0.001,0.03);
    }
  }

  const totalDur=bar*8;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    const k=_bgmKey;
    if((k==='st2'||k==='st3'||k==='st4')&&!muted)_playStageBGM();
    if(k==='st5'&&!muted)_playCliffBGM();
    if(k==='st6'&&!muted)_playSkyBGM();
    if(k==='st7'&&!muted)_playOrcBGM();
  },(totalDur-0.1)*1000);
}

// ── BOSSBGMスポーン時：激しく重い ───────────────
function _playBossBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.18; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=150, B=60/BPM, bar=B*4;

  // メロディー（sawtooth + 不協和）
  const mel=[
    [NOTE.A3,B*0.5],[NOTE.A3,B*0.5],[NOTE.G3,B],[NOTE.F3s,B],[NOTE.G3,B],
    [NOTE.A3,B*0.5],[NOTE.Bb3,B*0.5],[NOTE.A3,B*2],[NOTE.G3,B],
    [NOTE.F3,B*0.5],[NOTE.F3,B*0.5],[NOTE.E3||NOTE.F3,B],[NOTE.F3,B],[NOTE.G3,B],
    [NOTE.A3,bar],
    [NOTE.G3,B*0.5],[NOTE.A3,B*0.5],[NOTE.Bb3,B],[NOTE.A3,B],[NOTE.G3,B],
    [NOTE.F3s,B*0.5],[NOTE.G3,B*0.5],[NOTE.A3,B*3],
    [NOTE.C4,B],[NOTE.Bb3,B],[NOTE.A3,B],[NOTE.G3,B],
    [NOTE.A3,bar],
  ];
  let t=now; mel.forEach(([f,d])=>{
    _playNote(ac,master,f,'sawtooth',0.28,t,d*0.9,0.005,0.03);
    _playNote(ac,master,f*2,'square',0.08,t,d*0.9,0.005,0.03);
    t+=d;
  });

  // 重いベース
  for(let i=0;i<8;i++){
    const bt=now+i*bar;
    const f=i%2===0?NOTE.A3*0.5:NOTE.G3*0.5;
    _playNote(ac,master,f,'sawtooth',0.28,bt,B*0.9,0.01,0.05);
    _playNote(ac,master,f,'sawtooth',0.20,bt+B*1.5,B*0.4,0.01,0.04);
    _playNote(ac,master,f,'sawtooth',0.24,bt+B*2,B*0.9,0.01,0.05);
    _playNote(ac,master,f*1.5,'sawtooth',0.15,bt+B*3,B*0.4,0.01,0.04);
  }

  // 激しいドラム
  for(let i=0;i<8;i++){
    const bt=now+i*bar;
    // キック（強め）
    [0,B*0.5,B*2,B*2.5].forEach(o=>{
      _playNote(ac,master,55,'sine',0.38,bt+o,0.06,0.001,0.055);
    });
    // スネア
    [B,B*3].forEach(o=>{
      _playNote(ac,master,180,'square',0.20,bt+o,0.04,0.001,0.035);
      _playNote(ac,master,280,'square',0.12,bt+o,0.04,0.001,0.035);
    });
    // 16分ハット
    for(let h=0;h<8;h++){
      _playNote(ac,master,9000,'sine',0.04,bt+h*B*0.5,0.03,0.001,0.025);
    }
  }

  const totalDur=bar*8;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    if(_bgmKey==='boss'&&!muted)_playBossBGM();
  },(totalDur-0.1)*1000);
}

// ── タイトルBGM：荘厳・壮大なオープニング ──────────────
function _playTitleBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.14; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=84, B=60/BPM, bar=B*4;

  // メロディー（sine・荘厳）
  const mel=[
    [NOTE.C4,B*2],[NOTE.E4,B],[NOTE.G4,B],
    [NOTE.A4,B*3],[NOTE.G4,B],
    [NOTE.F4,B*2],[NOTE.E4,B],[NOTE.D4,B],
    [NOTE.C4,bar],
    [NOTE.G4,B*2],[NOTE.A4,B],[NOTE.B4,B],
    [NOTE.C5,B*3],[NOTE.B4,B],
    [NOTE.A4,B*2],[NOTE.G4,B],[NOTE.F4,B],
    [NOTE.E4,bar],
    [NOTE.E4,B*2],[NOTE.F4,B],[NOTE.G4,B],
    [NOTE.A4,B*2],[NOTE.G4,B],[NOTE.F4,B],
    [NOTE.G4,B*2],[NOTE.E4,B],[NOTE.C4,B],
    [NOTE.D4,bar],
    [NOTE.C4,B*2],[NOTE.E4,B],[NOTE.G4,B],
    [NOTE.C5,bar*1.5],[NOTE.B4,B*0.5],
    [NOTE.A4,B*2],[NOTE.G4,B],[NOTE.E4,B],
    [NOTE.C4,bar*2],
  ];
  let t=now; mel.forEach(([f,d])=>{_playNote(ac,master,f,'sine',0.32,t,d*0.92,0.02,0.08);t+=d;});

  // 和音（重厚感）
  const chords=[
    [[NOTE.C3,NOTE.E3,NOTE.G3],bar],[[NOTE.C3,NOTE.E3,NOTE.G3],bar],
    [[NOTE.F3,NOTE.A3,NOTE.C4],bar],[[NOTE.G3,NOTE.B3,NOTE.D4],bar],
    [[NOTE.A3,NOTE.C4,NOTE.E4],bar],[[NOTE.G3,NOTE.B3,NOTE.D4],bar],
    [[NOTE.F3,NOTE.A3,NOTE.C4],bar],[[NOTE.E3,NOTE.G3,NOTE.B3],bar],
    [[NOTE.C3,NOTE.E3,NOTE.G3],bar],[[NOTE.C3,NOTE.E3,NOTE.G3],bar],
    [[NOTE.F3,NOTE.A3,NOTE.C4],bar],[[NOTE.G3,NOTE.B3,NOTE.D4],bar],
    [[NOTE.C3,NOTE.E3,NOTE.G3],bar],[[NOTE.C3,NOTE.G3,NOTE.C4],bar],
    [[NOTE.F3,NOTE.A3,NOTE.C4],bar],[[NOTE.C3,NOTE.E3,NOTE.G3],bar*2],
  ];
  let ct=now;
  chords.forEach(([notes,d])=>{
    notes.forEach(f=>_playNote(ac,master,f,'triangle',0.18,ct,d*0.85,0.04,0.15));
    ct+=d;
  });

  // ベース（どっしり）
  const bassNotes=[NOTE.C3,NOTE.C3,NOTE.F3,NOTE.G3,NOTE.A3,NOTE.G3,NOTE.F3,NOTE.E3,NOTE.C3,NOTE.C3,NOTE.F3,NOTE.G3,NOTE.C3,NOTE.C3,NOTE.F3,NOTE.C3];
  bassNotes.forEach((f,i)=>{
    _playNote(ac,master,f*0.5,'sine',0.28,now+i*bar,bar*0.9,0.01,0.1);
    _playNote(ac,master,f,'triangle',0.08,now+i*bar+B,B*0.7,0.01,0.05);
  });

  const totalDur=bar*16;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    if(_bgmKey==='title'&&!muted)_playTitleBGM();
  },(totalDur-0.1)*1000);
}

// ── クリアBGM：明るく爽快な勝利ファンファーレ ────────────
function _playClearBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.18; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=120, B=60/BPM, bar=B*4;

  // ファンファーレ（明るいメロディー）
  const mel=[
    [NOTE.C4,B*.5],[NOTE.C4,B*.5],[NOTE.C4,B*.5],[NOTE.E4,B*.5],[NOTE.G4,B*.5],[NOTE.C5,B*1.5],
    [NOTE.G4,B*.5],[NOTE.A4,B*.5],[NOTE.G4,B*.5],[NOTE.F4,B*.5],[NOTE.E4,B*2],
    [NOTE.E4,B*.5],[NOTE.F4,B*.5],[NOTE.E4,B*.5],[NOTE.D4,B*.5],[NOTE.C4,B*2],
    [NOTE.D4,B*.5],[NOTE.E4,B*.5],[NOTE.F4,B*.5],[NOTE.G4,B*.5],[NOTE.A4,B*.5],[NOTE.B4,B*.5],[NOTE.C5,B*2],
    [NOTE.C5,B*.5],[NOTE.B4,B*.5],[NOTE.A4,B],[NOTE.G4,B],[NOTE.E4,B*.5],[NOTE.F4,B*.5],
    [NOTE.G4,B*3],[NOTE.G4,B],
    [NOTE.A4,B*.5],[NOTE.G4,B*.5],[NOTE.F4,B],[NOTE.E4,B*.5],[NOTE.D4,B*.5],[NOTE.C4,B],
    [NOTE.C4,bar*2],
  ];
  let t=now; mel.forEach(([f,d])=>{_playNote(ac,master,f,'square',0.22,t,d*0.88,0.005,0.04);t+=d;});

  // 伴奏
  const acc=[
    [[NOTE.C3,NOTE.E3,NOTE.G3],bar],[[NOTE.F3,NOTE.A3,NOTE.C4],bar],
    [[NOTE.C3,NOTE.E3,NOTE.G3],bar],[[NOTE.G3,NOTE.B3,NOTE.D4],bar],
    [[NOTE.C3,NOTE.E3,NOTE.G3],bar],[[NOTE.F3,NOTE.A3,NOTE.C4],bar],
    [[NOTE.G3,NOTE.B3,NOTE.D4],bar],[[NOTE.C3,NOTE.E3,NOTE.G3],bar*2],
  ];
  let at=now;
  acc.forEach(([notes,d])=>{
    notes.forEach(f=>_playNote(ac,master,f,'triangle',0.12,at,d*0.8,0.02,0.1));
    at+=d;
  });

  const totalDur=bar*9;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    if(_bgmKey==='clear'&&!muted)_playClearBGM();
  },(totalDur-0.1)*1000);
}

// ── ST7オーク集落BGM：重厚・部族的・ドラム強め ─────
function _playOrcBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.15; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=140, B=60/BPM, bar=B*4;

  // メロディー（力強いマイナー）
  const mel=[
    [NOTE.D4,B],[NOTE.D4,B*.5],[NOTE.C4,B*.5],[NOTE.Bb3,B],[NOTE.A3,B],
    [NOTE.G3,B],[NOTE.A3,B],[NOTE.Bb3,B],[NOTE.C4,B],
    [NOTE.D4,B*2],[NOTE.C4,B],[NOTE.Bb3,B],
    [NOTE.A3,bar],[NOTE.A3,B*0.5],[NOTE.C4,B*0.5],[NOTE.D4,B*3],
    [NOTE.F4,B],[NOTE.E4,B*.5],[NOTE.D4,B*.5],[NOTE.C4,B],[NOTE.Bb3,B],
    [NOTE.A3,B*2],[NOTE.G3,B],[NOTE.A3,B],
    [NOTE.Bb3,B],[NOTE.C4,B],[NOTE.D4,B],[NOTE.E4,B],
    [NOTE.D4,bar*1.5],[NOTE.D4,B*0.5],
  ];
  let t=now; mel.forEach(([f,d])=>{
    _playNote(ac,master,f,'sawtooth',0.22,t,d*0.88,0.006,0.04);
    _playNote(ac,master,f*0.5,'square',0.07,t,d*0.88,0.006,0.04);
    t+=d;
  });

  // 重いベース
  [NOTE.D3,NOTE.A3,NOTE.Bb3,NOTE.A3,NOTE.D3,NOTE.G3,NOTE.A3,NOTE.D3].forEach((f,i)=>{
    _playNote(ac,master,f*.5,'sawtooth',0.28,now+i*bar,bar*.85,0.01,0.06);
    _playNote(ac,master,f*.5,'sawtooth',0.18,now+i*bar+B*2,B*.8,0.01,0.04);
  });

  // 部族ドラム（強め）
  for(let i=0;i<8;i++){
    const bt=now+i*bar;
    // キック（重い）
    [0,B*0.5,B*2,B*3].forEach(o=>_playNote(ac,master,60,'sine',0.35,bt+o,0.08,0.001,0.07));
    // スネア（強め）
    [B,B*1.5,B*3.5].forEach(o=>_playNote(ac,master,220,'square',0.18,bt+o,0.05,0.001,0.04));
    // 太鼓風
    [0,B,B*2,B*3].forEach(o=>_playNote(ac,master,120,'triangle',0.12,bt+o,0.06,0.001,0.05));
    // ハット（16分）
    for(let h=0;h<8;h++)_playNote(ac,master,7000,'sine',0.028,bt+h*B*.5,0.03,0.001,0.025);
  }

  const totalDur=bar*8;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    if(_bgmKey==='st7'&&!muted)_playOrcBGM();
  },(totalDur-0.1)*1000);
}

// ── ST6天空BGM：壮大・神秘的 ────────────────────
function _playSkyBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.13; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=96, B=60/BPM, bar=B*4;

  // メロディー（高音・幻想的）
  const mel=[
    [NOTE.E5,B*2],[NOTE.D5,B],[NOTE.C5,B],
    [NOTE.G4,bar],[NOTE.A4,B*2],[NOTE.B4,B],[NOTE.C5,B],
    [NOTE.D5,B*2],[NOTE.E5,B*2],[NOTE.C5,bar],
    [NOTE.G4,B*2],[NOTE.A4,B],[NOTE.B4,B],[NOTE.C5,B*2],[NOTE.G4,B*2],
    [NOTE.E5,B*2],[NOTE.F5,B],[NOTE.E5,B],[NOTE.D5,bar],
    [NOTE.C5,B*2],[NOTE.B4,B],[NOTE.A4,B],[NOTE.G4,bar],
    [NOTE.A4,B*2],[NOTE.C5,B],[NOTE.B4,B],[NOTE.A4,B*2],[NOTE.G4,B*2],
    [NOTE.C5,bar*2],
  ];
  let t=now; mel.forEach(([f,d])=>{
    _playNote(ac,master,f,'sine',0.28,t,d*0.92,0.02,0.1);
    _playNote(ac,master,f*1.5,'sine',0.06,t,d*0.92,0.02,0.1);
    t+=d;
  });

  // 和音（広がり感）
  const chords=[
    [[NOTE.C4,NOTE.E4,NOTE.G4,NOTE.C5],bar*2],
    [[NOTE.G3,NOTE.B3,NOTE.D4,NOTE.G4],bar*2],
    [[NOTE.A3,NOTE.C4,NOTE.E4,NOTE.A4],bar*2],
    [[NOTE.F3,NOTE.A3,NOTE.C4,NOTE.F4],bar*2],
    [[NOTE.C4,NOTE.E4,NOTE.G4,NOTE.C5],bar*2],
    [[NOTE.G3,NOTE.B3,NOTE.D4],bar*2],
    [[NOTE.A3,NOTE.E4,NOTE.A4],bar*2],
    [[NOTE.C4,NOTE.G4,NOTE.C5],bar*2],
  ];
  let ct=now;
  chords.forEach(([notes,d])=>{
    notes.forEach(f=>_playNote(ac,master,f,'triangle',0.12,ct,d*0.88,0.04,0.2));
    ct+=d;
  });

  // ベース（穏やか）
  [NOTE.C3,NOTE.G3,NOTE.A3,NOTE.F3,NOTE.C3,NOTE.G3,NOTE.A3,NOTE.C3].forEach((f,i)=>{
    _playNote(ac,master,f*.5,'sine',0.2,now+i*bar*2,bar*1.8,0.02,0.15);
  });

  const totalDur=bar*16;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    if(_bgmKey==='st6'&&!muted)_playSkyBGM();
  },(totalDur-0.1)*1000);
}

// ── ST5崖道BGM：不気味で緊張感のある崖道 ────────────
function _playCliffBGM(){
  const ac=getAC();if(!ac||muted)return;
  const master=ac.createGain(); master.gain.value=0.14; master.connect(ac.destination);
  _bgmNodes.push(master);
  const now=ac.currentTime;
  const BPM=120, B=60/BPM, bar=B*4;

  // メロディー（不気味・マイナー）
  const mel=[
    [NOTE.A3,B],[NOTE.C4,B*.5],[NOTE.Bb3,B*.5],[NOTE.A3,B*2],
    [NOTE.G3,B],[NOTE.A3,B],[NOTE.F3s,B],[NOTE.G3,B],
    [NOTE.A3,B*.5],[NOTE.A3,B*.5],[NOTE.G3,B],[NOTE.F3s,B],[NOTE.E3||NOTE.F3,B],
    [NOTE.A3,bar],
    [NOTE.C4,B],[NOTE.Bb3,B],[NOTE.A3,B],[NOTE.G3,B],
    [NOTE.F3s,B*2],[NOTE.A3,B],[NOTE.G3,B],
    [NOTE.A3,B*.5],[NOTE.Bb3,B*.5],[NOTE.A3,B],[NOTE.G3,B],[NOTE.F3s,B],
    [NOTE.A3,bar*1.5],[NOTE.A3,B*0.5],
  ];
  let t=now; mel.forEach(([f,d])=>{
    _playNote(ac,master,f,'sawtooth',0.20,t,d*0.88,0.008,0.04);
    _playNote(ac,master,f*2,'sine',0.05,t,d*0.88,0.008,0.04);
    t+=d;
  });

  // ベース（重い）
  const bassNotes=[NOTE.A3*.5,NOTE.G3*.5,NOTE.F3s*.5||NOTE.G3*.5,NOTE.A3*.5,NOTE.A3*.5,NOTE.G3*.5,NOTE.A3*.5,NOTE.E3*.5||NOTE.F3*.5];
  bassNotes.forEach((f,i)=>{
    _playNote(ac,master,f,'sine',0.25,now+i*bar,bar*0.9,0.01,0.08);
    _playNote(ac,master,f,'sawtooth',0.08,now+i*bar+B,B*0.7,0.01,0.05);
  });

  // ドラム（重め・不規則）
  for(let i=0;i<8;i++){
    const bt=now+i*bar;
    _playNote(ac,master,55,'sine',0.32,bt,0.08,0.001,0.07);
    _playNote(ac,master,55,'sine',0.22,bt+B*2.5,0.06,0.001,0.055);
    _playNote(ac,master,160,'square',0.12,bt+B,0.04,0.001,0.035);
    _playNote(ac,master,160,'square',0.10,bt+B*3,0.04,0.001,0.035);
    _playNote(ac,master,7000,'sine',0.025,bt,0.035,0.001,0.03);
    _playNote(ac,master,7000,'sine',0.02,bt+B*2,0.03,0.001,0.025);
  }

  const totalDur=bar*8;
  _bgmLoopTimer=setTimeout(()=>{
    _stopSynthBGM();
    if(_bgmKey==='st5'&&!muted)_playCliffBGM();
  },(totalDur-0.1)*1000);
}

function startBGM(key){
  if(_bgmKey===key)return;
  // 既存BGM停止
  if(_bgmAudio){_bgmAudio.pause();_bgmAudio.currentTime=0;_bgmAudio=null;}
  _stopSynthBGM();
  _bgmKey=key;
  if(muted)return;
  // MP3があればMP3を優先
  const file=BGM_FILES[key];
  if(file){
    if(muted)return; // ミュート中は再生しない
    const audio=new Audio(file);
    audio.loop=true; audio.volume=0.5;
    audio.play().catch(()=>{});
    _bgmAudio=audio;
    return;
  }
  // 合成BGM
  if(key==='title') _playTitleBGM();
  else if(key==='town') _playTownBGM();
  else if(key==='st2'||key==='st3'||key==='st4') _playStageBGM();
  else if(key==='st5') _playCliffBGM();
  else if(key==='st6') _playSkyBGM();
  else if(key==='st7') _playOrcBGM();
  else if(key==='boss') _playBossBGM();
  else if(key==='clear') _playClearBGM();
}

function updateBGM(){
  getAC();
}

function stopBGM(){
  if(_bgmAudio){_bgmAudio.pause();_bgmAudio.currentTime=0;_bgmAudio=null;}
  _stopSynthBGM();
  _bgmKey=null;
}

function setMute(val){
  muted=val;
  if(muted){
    if(_bgmAudio){_bgmAudio.pause();}
    _stopSynthBGM();
    if(_seMasterGain)_seMasterGain.gain.value=0;
  }else{
    if(_bgmAudio){_bgmAudio.play().catch(()=>{});}
    else if(_bgmKey){
      const k=_bgmKey; _bgmKey=null; startBGM(k);
    }
    if(_seMasterGain)_seMasterGain.gain.value=0.4;
  }
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
    o.start(t);o.stop(t+d+0.05);
  }catch(e){}});
}

// ============================================================
//  プレイヤーデータ
// ============================================================
function makePlayerData(cls){
  const base={
    warrior:{hp:110,sp:60,atk:6,def:6,mag:5,spd:180,hit:80,luk:5,agi:0},
    mage:   {hp:90, sp:70,atk:5,def:4,mag:8,spd:160,hit:75,luk:5,agi:0},
    archer: {hp:100,sp:65,atk:6,def:5,mag:5,spd:200,hit:85,luk:8,agi:0},
    bomber: {hp:95, sp:80,atk:8,def:4,mag:6,spd:170,hit:78,luk:6,agi:0},
  }[cls];
  return {
    cls,
    hp:base.hp,mhp:base.hp,
    sp:base.sp,msp:base.sp,
    atk:base.atk,def:base.def,mag:base.mag,spd:base.spd,
    hit:base.hit,  // 命中率(%)
    luk:base.luk,  // 運（クリティカル率%）
    lv:1,exp:0,expNext:100,
    gold:50,potHP:3,potMP:3,kills:0,items:{}, // {itemId: count}
    equip:{head:null,face:null,shoulder:null,body:null,feet:null,accessory:null}, // 装備スロット
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
function calcHit(pd, enemyEva){
  // 命中率 = hit - 敵eva（最低5%、最大99%）
  return Math.min(99, Math.max(5, pd.hit - (enemyEva||0)));
}
function calcCrit(pd){
  return pd.luk; // luk% がクリティカル率
}
function rollAttack(pd, enemyDef, enemyEva){
  // 命中判定（hit - 敵eva%）
  const hitRate=calcHit(pd,enemyEva);
  if(Math.random()*100>hitRate) return {miss:true};
  // クリティカル判定
  const isCrit=Math.random()*100<calcCrit(pd);
  let dmg=Math.max(1, Math.floor(pd.atk*1.5) - (enemyDef||0) + Phaser.Math.Between(0,pd.atk));
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
    this.load.image('player_warrior',BASE+'players/warrior.png');
    // archer はスプライトシート (128×128px, 5×3=15コマ)
    this.load.spritesheet('player_archer', BASE+'players/archer_sprite_sheet.png', {frameWidth:128,frameHeight:128});
    // mage はスプライトシート (128×128px, 5×3=15コマ)
    this.load.spritesheet('player_mage', BASE+'players/final_sprite_sheet.png', {frameWidth:128,frameHeight:128});
    // bomber はスプライトシート
    this.load.spritesheet('player_bomber', BASE+'players/final_sheet_cc.png', {frameWidth:64,frameHeight:64});
    // 全敵キャラはコード描画テクスチャを使用（PNGロード不要）
    ['bridge','cliff','cobble','dark_forest','flower','grass','lava','oasis_grass','sand_beach','sand_desert','sea','town_path','town_wall','volcanic','water'].forEach(k=>this.load.image('tile_'+k,BASE+'tiles/'+k+'.png'));
    ['barrel','desert_rock','lava_rock','palm','rock','tree'].forEach(k=>this.load.image('obj_'+k,BASE+'objects/'+k+'.png'));
    ['portal_st1','portal_st2','portal_st3','portal_st4','portal_town'].forEach(k=>this.load.image(k,BASE+'portals/'+k+'.png'));
    // arrow はコード描画テクスチャを使用
    ['bigbomb','bomb','fireball','hyperbomb','vortexball'].forEach(k=>this.load.image('proj_'+k,BASE+'projectiles/'+k+'.png'));
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
        frameRate:a.rate,
        repeat:a.rep,
      });
    });
    this.scene.start('Title');
  }

  _generateEnemyTextures(){
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
    const mk=(key,S,fn)=>{const g=this.make.graphics({x:0,y:0,add:false});fn(g,S);g.generateTexture(key,S,S);g.destroy();};

    // ── ボス4（砂漠の魔神・100×100px）────────────────────────
    mk('enemy_boss4',112,(g,S)=>{
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
    mk('enemy_cloud_monkey',56,(g,S)=>{
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
    mk('enemy_treant',72,(g,S)=>{
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
    mk('enemy_rock_golem',80,(g,S)=>{
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
    mk('enemy_giant',88,(g,S)=>{
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
    mk('enemy_thunder_god',128,(g,S)=>{
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
    mk('enemy_orc_warrior',64,(g,S)=>{
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
    mk('enemy_orc_high',72,(g,S)=>{
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
    mk('enemy_orc_lady',56,(g,S)=>{
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
    mk('enemy_orc_archer',60,(g,S)=>{
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
    mk('enemy_orc_general',116,(g,S)=>{
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

    // ── クマ ──────────────────────────────────
    mk('enemy_bear',72,(g,S)=>{
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
    mk('enemy_beetle',60,(g,S)=>{
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
    mk('enemy_hornet',52,(g,S)=>{
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
    mk('enemy_scorpion_queen',72,(g,S)=>{
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

    // ── ミストレス（蜘蛛女王・ボス5）──────────────
    mk('enemy_mistress',120,(g,S)=>{
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
    mk('enemy_slime',64,(g,S)=>{
      g.fillStyle(0x000000,0.18);g.fillEllipse(S/2,S*.88,S*.7,S*.18);
      g.fillStyle(0x33ccaa,1);g.fillEllipse(S/2,S*.52,S*.78,S*.72);
      g.fillStyle(0x88ffdd,.55);g.fillEllipse(S*.38,S*.34,S*.28,S*.22);
      g.fillStyle(0x33ccaa,1);g.fillEllipse(S*.42,S*.18,S*.22,S*.26);g.fillEllipse(S*.62,S*.22,S*.16,S*.20);
      g.fillStyle(0x000000,1);g.fillCircle(S*.36,S*.50,S*.07);g.fillStyle(0xffffff,1);g.fillCircle(S*.34,S*.48,S*.025);
      g.fillStyle(0x000000,1);g.fillCircle(S*.58,S*.50,S*.07);g.fillStyle(0xffffff,1);g.fillCircle(S*.56,S*.48,S*.025);
      g.fillStyle(0x115544,.8);g.fillEllipse(S*.47,S*.62,S*.18,S*.07);
      g.lineStyle(2,0x118866,.7);g.strokeEllipse(S/2,S*.52,S*.78,S*.72);
    });

    // ── コウモリ ────────────────────────────────
    mk('enemy_bat',56,(g,S)=>{
      // 左翼
      g.fillStyle(0x441166,1);
      g.fillTriangle(S*.5,S*.45,S*.05,S*.2,S*.18,S*.65);
      g.fillTriangle(S*.5,S*.45,S*.18,S*.65,S*.32,S*.72);
      // 右翼
      g.fillTriangle(S*.5,S*.45,S*.95,S*.2,S*.82,S*.65);
      g.fillTriangle(S*.5,S*.45,S*.82,S*.65,S*.68,S*.72);
      // 翼の模様
      g.fillStyle(0x662299,.4);
      g.fillTriangle(S*.5,S*.45,S*.1,S*.25,S*.25,S*.6);
      g.fillTriangle(S*.5,S*.45,S*.9,S*.25,S*.75,S*.6);
      // 胴体
      g.fillStyle(0x221133,1);g.fillEllipse(S*.5,S*.48,S*.28,S*.34);
      g.fillStyle(0x442255,.6);g.fillEllipse(S*.44,S*.42,S*.1,S*.12);
      // 耳
      g.fillStyle(0x221133,1);
      g.fillTriangle(S*.4,S*.3,S*.35,S*.12,S*.45,S*.3);
      g.fillTriangle(S*.6,S*.3,S*.55,S*.12,S*.65,S*.3);
      g.fillStyle(0x884499,.5);
      g.fillTriangle(S*.4,S*.28,S*.37,S*.16,S*.44,S*.28);
      g.fillTriangle(S*.6,S*.28,S*.56,S*.16,S*.63,S*.28);
      // 目（赤く光る）
      g.fillStyle(0xff2200,1);g.fillCircle(S*.43,S*.46,S*.05);
      g.fillStyle(0xff6644,.6);g.fillCircle(S*.43,S*.44,S*.02);
      g.fillStyle(0xff2200,1);g.fillCircle(S*.57,S*.46,S*.05);
      g.fillStyle(0xff6644,.6);g.fillCircle(S*.57,S*.44,S*.02);
      // キバ
      g.fillStyle(0xffffff,1);
      g.fillTriangle(S*.46,S*.56,S*.44,S*.64,S*.49,S*.56);
      g.fillTriangle(S*.54,S*.56,S*.51,S*.56,S*.56,S*.64);
    });

    // ── ゴブリン ────────────────────────────────
    mk('enemy_goblin',60,(g,S)=>{
      // 影
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.92,S*.55,S*.14);
      // 足
      g.fillStyle(0x336622,1);
      g.fillRect(S*.32,S*.72,S*.14,S*.22);g.fillRect(S*.54,S*.72,S*.14,S*.22);
      // 胴体
      g.fillStyle(0x447733,1);g.fillEllipse(S*.5,S*.58,S*.44,S*.38);
      // 腕
      g.fillStyle(0x336622,1);
      g.fillEllipse(S*.2,S*.55,S*.18,S*.32);g.fillEllipse(S*.8,S*.55,S*.18,S*.32);
      // 手（黄緑）
      g.fillStyle(0x88bb44,1);g.fillCircle(S*.15,S*.7,S*.08);g.fillCircle(S*.85,S*.7,S*.08);
      // 頭
      g.fillStyle(0x558844,1);g.fillEllipse(S*.5,S*.35,S*.46,S*.42);
      // 耳（とがった）
      g.fillStyle(0x558844,1);
      g.fillTriangle(S*.22,S*.3,S*.16,S*.12,S*.32,S*.32);
      g.fillTriangle(S*.78,S*.3,S*.84,S*.12,S*.68,S*.32);
      // 目（黄色・吊り目）
      g.fillStyle(0xffcc00,1);g.fillEllipse(S*.38,S*.34,S*.13,S*.1);g.fillEllipse(S*.62,S*.34,S*.13,S*.1);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.35,S*.05);g.fillCircle(S*.62,S*.35,S*.05);
      // 鼻
      g.fillStyle(0x336622,1);g.fillCircle(S*.47,S*.41,S*.04);g.fillCircle(S*.53,S*.41,S*.04);
      // 口（ニヤリ）
      g.fillStyle(0x223311,1);g.fillEllipse(S*.5,S*.48,S*.2,S*.07);
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.43,S*.46,S*.41,S*.52,S*.46,S*.46);g.fillTriangle(S*.57,S*.46,S*.54,S*.46,S*.59,S*.52);
      // 武器（棍棒）
      g.fillStyle(0x886633,1);g.fillRect(S*.84,S*.4,S*.06,S*.35);
      g.fillStyle(0x664422,1);g.fillCircle(S*.87,S*.38,S*.09);
    });

    // ── トロル ────────────────────────────────
    mk('enemy_troll',80,(g,S)=>{
      g.fillStyle(0x000000,.2);g.fillEllipse(S*.5,S*.94,S*.7,S*.14);
      // 足（太い）
      g.fillStyle(0x557744,1);
      g.fillRect(S*.28,S*.68,S*.2,S*.28);g.fillRect(S*.52,S*.68,S*.2,S*.28);
      g.fillStyle(0x446633,1);g.fillRect(S*.24,S*.88,S*.26,S*.1);g.fillRect(S*.5,S*.88,S*.26,S*.1);
      // 胴体（巨大）
      g.fillStyle(0x667755,1);g.fillEllipse(S*.5,S*.55,S*.65,S*.55);
      // 腕（ぶっとい）
      g.fillStyle(0x557744,1);
      g.fillEllipse(S*.15,S*.52,S*.26,S*.45);g.fillEllipse(S*.85,S*.52,S*.26,S*.45);
      // こぶし
      g.fillStyle(0x778866,1);g.fillCircle(S*.12,S*.72,S*.1);g.fillCircle(S*.88,S*.72,S*.1);
      // 頭
      g.fillStyle(0x778866,1);g.fillEllipse(S*.5,S*.28,S*.52,S*.44);
      // 角
      g.fillStyle(0xaa8833,1);
      g.fillTriangle(S*.36,S*.18,S*.3,S*.02,S*.42,S*.18);
      g.fillTriangle(S*.64,S*.18,S*.58,S*.18,S*.7,S*.02);
      // 目（赤い・怒り）
      g.fillStyle(0xcc2200,1);g.fillEllipse(S*.38,S*.26,S*.14,S*.1);g.fillEllipse(S*.62,S*.26,S*.14,S*.1);
      g.fillStyle(0x000000,1);g.fillCircle(S*.38,S*.27,S*.05);g.fillCircle(S*.62,S*.27,S*.05);
      // 眉（怒り）
      g.lineStyle(3,0x223322,1);
      g.fillStyle(0x223322,1);g.fillRect(S*.3,S*.2,S*.16,S*.04);g.fillRect(S*.54,S*.2,S*.16,S*.04);
      // 鼻（大きい）
      g.fillStyle(0x557744,1);g.fillEllipse(S*.5,S*.34,S*.16,S*.12);
      // 口
      g.fillStyle(0x223311,1);g.fillEllipse(S*.5,S*.42,S*.26,S*.1);
      g.fillStyle(0xddddcc,1);g.fillRect(S*.38,S*.4,S*.08,S*.07);g.fillRect(S*.54,S*.4,S*.08,S*.07);
    });

    // ── ウルフ ────────────────────────────────
    mk('enemy_wolf',64,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.92,S*.6,S*.12);
      // 尻尾
      g.fillStyle(0x888899,1);g.fillEllipse(S*.82,S*.55,S*.12,S*.36);
      g.fillStyle(0xaaaacc,.5);g.fillEllipse(S*.8,S*.5,S*.07,S*.22);
      // 胴体
      g.fillStyle(0x778899,1);g.fillEllipse(S*.48,S*.58,S*.55,S*.38);
      // 足4本
      g.fillStyle(0x667788,1);
      g.fillRect(S*.22,S*.68,S*.1,S*.24);g.fillRect(S*.36,S*.72,S*.1,S*.2);
      g.fillRect(S*.54,S*.72,S*.1,S*.2);g.fillRect(S*.68,S*.68,S*.1,S*.24);
      // 頭
      g.fillStyle(0x8899aa,1);g.fillEllipse(S*.34,S*.36,S*.42,S*.36);
      // 鼻先（マズル）
      g.fillStyle(0x99aacc,1);g.fillEllipse(S*.22,S*.44,S*.22,S*.18);
      // 耳
      g.fillStyle(0x667788,1);
      g.fillTriangle(S*.28,S*.24,S*.22,S*.08,S*.38,S*.24);
      g.fillTriangle(S*.46,S*.22,S*.4,S*.08,S*.52,S*.22);
      g.fillStyle(0xffaaaa,.5);
      g.fillTriangle(S*.3,S*.23,S*.25,S*.12,S*.37,S*.23);
      // 目（黄色）
      g.fillStyle(0xffcc00,1);g.fillCircle(S*.36,S*.34,S*.06);g.fillStyle(0x000000,1);g.fillCircle(S*.36,S*.35,S*.03);
      // 鼻
      g.fillStyle(0x223344,1);g.fillEllipse(S*.18,S*.43,S*.1,S*.07);
      // 歯
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.17,S*.48,S*.14,S*.56,S*.22,S*.48);g.fillTriangle(S*.26,S*.5,S*.23,S*.5,S*.28,S*.57);
    });

    // ── スケルトン ────────────────────────────────
    mk('enemy_skeleton',64,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.92,S*.5,S*.12);
      // 足（骨）
      g.fillStyle(0xddddcc,1);
      g.fillRect(S*.34,S*.68,S*.1,S*.24);g.fillRect(S*.56,S*.68,S*.1,S*.24);
      g.fillCircle(S*.39,S*.68,S*.06);g.fillCircle(S*.61,S*.68,S*.06);
      g.fillCircle(S*.39,S*.92,S*.07);g.fillCircle(S*.61,S*.92,S*.07);
      // 胴体（肋骨）
      g.fillStyle(0xddddcc,1);g.fillRect(S*.44,S*.4,S*.12,S*.3);
      for(let i=0;i<3;i++){
        g.fillRect(S*.32,S*.42+i*S*.09,S*.36,S*.05);
      }
      // 腕（骨）
      g.fillStyle(0xddddcc,1);
      g.fillRect(S*.22,S*.42,S*.1,S*.28);g.fillRect(S*.68,S*.42,S*.1,S*.28);
      g.fillCircle(S*.27,S*.42,S*.06);g.fillCircle(S*.73,S*.42,S*.06);
      g.fillCircle(S*.27,S*.7,S*.06);g.fillCircle(S*.73,S*.7,S*.06);
      // 頭蓋骨
      g.fillStyle(0xeeeedd,1);g.fillEllipse(S*.5,S*.3,S*.42,S*.38);
      g.fillStyle(0xddddcc,1);g.fillRect(S*.38,S*.4,S*.24,S*.1);
      // 目穴（黒い空洞）
      g.fillStyle(0x000000,1);g.fillEllipse(S*.38,S*.29,S*.12,S*.1);g.fillEllipse(S*.62,S*.29,S*.12,S*.1);
      // 鼻穴
      g.fillStyle(0x222211,1);g.fillTriangle(S*.47,S*.36,S*.44,S*.42,S*.5,S*.42);g.fillTriangle(S*.53,S*.36,S*.5,S*.42,S*.56,S*.42);
      // 歯
      g.fillStyle(0xeeeedd,1);
      for(let i=0;i<4;i++)g.fillRect(S*.36+i*S*.07,S*.42,S*.05,S*.07);
      g.fillStyle(0x000000,.6);g.fillRect(S*.36,S*.42,S*.27,S*.03);
      // 武器（剣）
      g.fillStyle(0xaaaaaa,1);g.fillRect(S*.75,S*.2,S*.05,S*.45);
      g.fillStyle(0x886633,1);g.fillRect(S*.68,S*.36,S*.18,S*.05);
    });

    // ── ドラゴン ────────────────────────────────
    mk('enemy_dragon',88,(g,S)=>{
      g.fillStyle(0x000000,.2);g.fillEllipse(S*.5,S*.94,S*.75,S*.13);
      // 尻尾
      g.fillStyle(0x882211,1);g.fillEllipse(S*.78,S*.7,S*.18,S*.1);g.fillEllipse(S*.88,S*.62,S*.12,S*.08);g.fillEllipse(S*.94,S*.55,S*.08,S*.06);
      // 翼（左右）
      g.fillStyle(0xaa2200,.85);
      g.fillTriangle(S*.5,S*.4,S*.05,S*.08,S*.28,S*.48);
      g.fillTriangle(S*.5,S*.4,S*.95,S*.08,S*.72,S*.48);
      g.fillStyle(0xcc4422,.4);
      g.fillTriangle(S*.5,S*.4,S*.1,S*.12,S*.3,S*.45);
      g.fillTriangle(S*.5,S*.4,S*.9,S*.12,S*.7,S*.45);
      // 足
      g.fillStyle(0x772211,1);
      g.fillEllipse(S*.32,S*.78,S*.2,S*.3);g.fillEllipse(S*.68,S*.78,S*.2,S*.3);
      // 爪
      g.fillStyle(0x334422,1);
      g.fillTriangle(S*.24,S*.9,S*.2,S*.98,S*.28,S*.9);
      g.fillTriangle(S*.32,S*.92,S*.3,S*.99,S*.36,S*.92);
      g.fillTriangle(S*.64,S*.92,S*.62,S*.99,S*.68,S*.92);
      g.fillTriangle(S*.72,S*.9,S*.68,S*.98,S*.76,S*.9);
      // 胴体
      g.fillStyle(0xaa2200,1);g.fillEllipse(S*.5,S*.6,S*.55,S*.52);
      g.fillStyle(0xffcc88,.5);g.fillEllipse(S*.5,S*.64,S*.34,S*.3);
      // 首・頭
      g.fillStyle(0x992200,1);g.fillEllipse(S*.5,S*.36,S*.34,S*.3);
      g.fillStyle(0xbb2200,1);g.fillEllipse(S*.5,S*.24,S*.38,S*.3);
      // 角
      g.fillStyle(0x554411,1);
      g.fillTriangle(S*.36,S*.18,S*.3,S*.02,S*.42,S*.18);
      g.fillTriangle(S*.64,S*.18,S*.58,S*.18,S*.7,S*.02);
      g.fillTriangle(S*.44,S*.15,S*.4,S*.03,S*.48,S*.15);
      // 目（黄色・鋭い）
      g.fillStyle(0xffaa00,1);g.fillEllipse(S*.38,S*.22,S*.12,S*.09);g.fillEllipse(S*.62,S*.22,S*.12,S*.09);
      g.fillStyle(0x000000,1);g.fillRect(S*.38,S*.2,S*.02,S*.08);g.fillRect(S*.62,S*.2,S*.02,S*.08);
      // 鼻孔
      g.fillStyle(0x661100,1);g.fillCircle(S*.44,S*.3,S*.03);g.fillCircle(S*.56,S*.3,S*.03);
      // 歯・口
      g.fillStyle(0x223311,1);g.fillEllipse(S*.5,S*.36,S*.22,S*.08);
      g.fillStyle(0xffffff,1);g.fillTriangle(S*.43,S*.34,S*.41,S*.4,S*.46,S*.34);g.fillTriangle(S*.54,S*.34,S*.51,S*.34,S*.56,S*.4);
    });

    // ── サンドワーム ────────────────────────────────
    mk('enemy_sandworm',80,(g,S)=>{
      g.fillStyle(0x000000,.18);g.fillEllipse(S*.5,S*.93,S*.65,S*.13);
      // 体節（うねうね）
      const wormCols=[0xcc8822,0xdd9933,0xbb7711];
      for(let i=4;i>=0;i--){
        const y=S*(0.82-i*S*.035/S);
        const w=S*(0.55+Math.sin(i*0.8)*0.15);
        g.fillStyle(wormCols[i%3],1);
        g.fillEllipse(S*.5,S*(0.78-i*0.12),w,S*0.2);
        // 体節の線
        g.lineStyle(1,0x996611,.5);
        g.strokeEllipse(S*.5,S*(0.78-i*0.12),w,S*0.2);
      }
      // 頭（大口）
      g.fillStyle(0xddaa33,1);g.fillEllipse(S*.5,S*.28,S*.58,S*.46);
      // 口（大きく開いた）
      g.fillStyle(0x330000,1);g.fillEllipse(S*.5,S*.32,S*.42,S*.3);
      // 牙（内側・外側）
      g.fillStyle(0xffffff,1);
      for(let i=0;i<4;i++){
        const x=S*(0.3+i*S*.13/S);
        g.fillTriangle(S*(0.3+i*0.13),S*.22,S*(0.27+i*0.13),S*.12,S*(0.33+i*0.13),S*.22);
        g.fillTriangle(S*(0.3+i*0.13),S*.42,S*(0.27+i*0.13),S*.52,S*(0.33+i*0.13),S*.42);
      }
      // 目（複眼）
      g.fillStyle(0xffcc00,1);g.fillCircle(S*.3,S*.2,S*.07);g.fillCircle(S*.7,S*.2,S*.07);
      g.fillStyle(0x000000,1);g.fillCircle(S*.3,S*.21,S*.04);g.fillCircle(S*.7,S*.21,S*.04);
      // 砂のつぶつぶ
      g.fillStyle(0xeecc88,.3);
      for(let i=0;i<8;i++)g.fillCircle(S*(0.2+Math.sin(i*1.3)*0.3+0.3),S*(0.55+Math.cos(i*1.1)*0.2),S*.02);
    });

    // ── スコーピオン ────────────────────────────────
    mk('enemy_scorpion',64,(g,S)=>{
      g.fillStyle(0x000000,.15);g.fillEllipse(S*.5,S*.93,S*.58,S*.12);
      // 尻尾（S字）
      g.fillStyle(0x994400,1);
      g.fillEllipse(S*.72,S*.68,S*.1,S*.18);g.fillEllipse(S*.8,S*.55,S*.1,S*.16);
      g.fillEllipse(S*.86,S*.42,S*.1,S*.14);g.fillEllipse(S*.88,S*.3,S*.08,S*.12);
      // 毒針
      g.fillStyle(0x22aa22,1);g.fillTriangle(S*.88,S*.2,S*.84,S*.28,S*.92,S*.25);
      // 足（6本）
      g.fillStyle(0x883300,1);
      [[.2,.45,.08,.68],[.18,.5,.05,.72],[.2,.56,.08,.76],
       [.8,.45,.92,.68],[.82,.5,.95,.72],[.8,.56,.92,.76]].forEach(([x1,y1,x2,y2])=>{
        g.fillRect(S*Math.min(x1,x2),S*y1,S*Math.abs(x2-x1)+S*.04,S*.04);
      });
      // ハサミ
      g.fillStyle(0xaa4400,1);
      g.fillEllipse(S*.18,S*.35,S*.2,S*.12);g.fillEllipse(S*.08,S*.28,S*.12,S*.08);g.fillEllipse(S*.08,S*.4,S*.12,S*.08);
      g.fillStyle(0x883300,1);g.fillCircle(S*.08,S*.28,S*.05);g.fillCircle(S*.08,S*.4,S*.05);
      // 胴体（腹）
      g.fillStyle(0xaa5511,1);g.fillEllipse(S*.5,S*.6,S*.44,S*.3);
      // 頭胸
      g.fillStyle(0xcc6622,1);g.fillEllipse(S*.42,S*.45,S*.36,S*.3);
      // 甲羅模様
      g.lineStyle(1,0x883300,.6);g.strokeEllipse(S*.42,S*.45,S*.36,S*.3);
      g.fillStyle(0xaa4400,.4);g.fillEllipse(S*.42,S*.42,S*.22,S*.16);
      // 目（8つ・小さい）
      g.fillStyle(0x000000,1);
      [[.34,.38],[.4,.35],[.46,.34],[.38,.43]].forEach(([x,y])=>{g.fillCircle(S*x,S*y,S*.025);});
    });

    // ── ボス1（暗黒騎士）────────────────────────
    mk('enemy_boss1',96,(g,S)=>{
      g.fillStyle(0x000000,.25);g.fillEllipse(S*.5,S*.95,S*.75,S*.12);
      // マント
      g.fillStyle(0x220022,1);
      g.fillTriangle(S*.5,S*.35,S*.08,S*.95,S*.5,S*.85);
      g.fillTriangle(S*.5,S*.35,S*.92,S*.95,S*.5,S*.85);
      g.fillStyle(0x440044,.5);
      g.fillTriangle(S*.5,S*.38,S*.12,S*.9,S*.5,S*.82);
      // 鎧（脚）
      g.fillStyle(0x334455,1);g.fillRect(S*.32,S*.7,S*.16,S*.25);g.fillRect(S*.52,S*.7,S*.16,S*.25);
      g.fillStyle(0x223344,1);g.fillRect(S*.28,S*.88,S*.22,S*.1);g.fillRect(S*.5,S*.88,S*.22,S*.1);
      // 鎧（胴）
      g.fillStyle(0x445566,1);g.fillEllipse(S*.5,S*.57,S*.52,S*.44);
      g.fillStyle(0x556677,.5);g.fillEllipse(S*.5,S*.52,S*.36,S*.28);
      // 十字紋章
      g.fillStyle(0xcc2200,1);g.fillRect(S*.47,S*.44,S*.06,S*.2);g.fillRect(S*.4,S*.51,S*.2,S*.06);
      // 腕（鎧）
      g.fillStyle(0x334455,1);g.fillEllipse(S*.16,S*.54,S*.2,S*.38);g.fillEllipse(S*.84,S*.54,S*.2,S*.38);
      // 篭手
      g.fillStyle(0x223344,1);g.fillCircle(S*.14,S*.7,S*.08);g.fillCircle(S*.86,S*.7,S*.08);
      // 剣
      g.fillStyle(0xaaaacc,1);g.fillRect(S*.88,S*.18,S*.06,S*.52);
      g.fillStyle(0x886633,1);g.fillRect(S*.8,S*.38,S*.22,S*.06);
      g.fillStyle(0xffcc22,1);g.fillCircle(S*.91,S*.18,S*.05);
      // 兜
      g.fillStyle(0x445566,1);g.fillEllipse(S*.5,S*.3,S*.46,S*.38);
      g.fillStyle(0x334455,1);g.fillRect(S*.38,S*.28,S*.24,S*.18);
      // 兜の飾り
      g.fillStyle(0xcc2200,1);g.fillRect(S*.48,S*.14,S*.04,S*.18);
      // 目（赤い光）
      g.fillStyle(0xff2200,1);g.fillEllipse(S*.38,S*.3,S*.1,S*.07);g.fillEllipse(S*.62,S*.3,S*.1,S*.07);
      g.fillStyle(0xff6600,.7);g.fillEllipse(S*.38,S*.3,S*.06,S*.04);g.fillEllipse(S*.62,S*.3,S*.06,S*.04);
    });

    // ── ボス2（魔王）────────────────────────────
    mk('enemy_boss2',104,(g,S)=>{
      g.fillStyle(0x000000,.25);g.fillEllipse(S*.5,S*.95,S*.8,S*.13);
      // オーラ
      g.fillStyle(0x6600cc,.15);g.fillCircle(S*.5,S*.5,S*.46);
      g.fillStyle(0x9900ff,.1);g.fillCircle(S*.5,S*.5,S*.42);
      // ローブ
      g.fillStyle(0x110022,1);
      g.fillTriangle(S*.5,S*.32,S*.08,S*.96,S*.92,S*.96);
      g.fillStyle(0x220044,.7);
      g.fillTriangle(S*.5,S*.36,S*.14,S*.92,S*.86,S*.92);
      // ローブの紋様
      g.fillStyle(0xaa00ff,.4);
      g.fillTriangle(S*.5,S*.44,S*.38,S*.7,S*.62,S*.7);
      // 腕
      g.fillStyle(0x221133,1);g.fillEllipse(S*.18,S*.52,S*.2,S*.36);g.fillEllipse(S*.82,S*.52,S*.2,S*.36);
      // 手（魔法陣）
      g.fillStyle(0xaa00ff,.8);g.fillCircle(S*.14,S*.68,S*.09);g.fillCircle(S*.86,S*.68,S*.09);
      g.fillStyle(0xffffff,.6);g.fillCircle(S*.14,S*.68,S*.05);g.fillCircle(S*.86,S*.68,S*.05);
      // 頭（大きい）
      g.fillStyle(0x332244,1);g.fillEllipse(S*.5,S*.3,S*.5,S*.44);
      // 大角（2本）
      g.fillStyle(0x220044,1);
      g.fillTriangle(S*.3,S*.2,S*.22,S*.0,S*.4,S*.22);
      g.fillTriangle(S*.7,S*.2,S*.6,S*.22,S*.78,S*.0);
      g.fillStyle(0x6600cc,.5);
      g.fillTriangle(S*.3,S*.2,S*.25,S*.04,S*.37,S*.2);
      g.fillTriangle(S*.7,S*.2,S*.63,S*.2,S*.75,S*.04);
      // 目（紫に光る）
      g.fillStyle(0xcc00ff,1);g.fillEllipse(S*.36,S*.28,S*.14,S*.1);g.fillEllipse(S*.64,S*.28,S*.14,S*.1);
      g.fillStyle(0xffffff,.8);g.fillCircle(S*.36,S*.29,S*.04);g.fillCircle(S*.64,S*.29,S*.04);
      // 口（ニヤリ・大きい）
      g.fillStyle(0x000000,1);g.fillEllipse(S*.5,S*.38,S*.28,S*.1);
      g.fillStyle(0xffffff,1);
      for(let i=0;i<5;i++)g.fillTriangle(S*(0.36+i*0.07),S*.36,S*(0.33+i*0.07),S*.44,S*(0.39+i*0.07),S*.36);
      // 王冠
      g.fillStyle(0xffcc00,1);g.fillRect(S*.3,S*.1,S*.4,S*.1);
      g.fillTriangle(S*.3,S*.1,S*.3,S*.02,S*.36,S*.1);
      g.fillTriangle(S*.5,S*.1,S*.5,S*.0,S*.56,S*.1);
      g.fillTriangle(S*.7,S*.1,S*.64,S*.1,S*.7,S*.02);
      g.fillStyle(0xff2200,1);g.fillCircle(S*.33,S*.07,S*.03);g.fillCircle(S*.53,S*.05,S*.03);g.fillCircle(S*.67,S*.07,S*.03);
    });

    // ── ボス3（神龍）────────────────────────────
    mk('enemy_boss3',112,(g,S)=>{
      g.fillStyle(0x000000,.25);g.fillEllipse(S*.5,S*.95,S*.85,S*.13);
      // 後光（神聖オーラ）
      g.fillStyle(0xffaa00,.12);g.fillCircle(S*.5,S*.5,S*.5);
      g.fillStyle(0xff6600,.08);g.fillCircle(S*.5,S*.5,S*.46);
      // 尻尾
      g.fillStyle(0xcc4400,1);
      g.fillEllipse(S*.82,S*.75,S*.16,S*.1);g.fillEllipse(S*.9,S*.65,S*.12,S*.08);g.fillEllipse(S*.96,S*.55,S*.08,S*.06);
      // 超巨大翼
      g.fillStyle(0xdd3300,.9);
      g.fillTriangle(S*.5,S*.38,S*.02,S*.04,S*.3,S*.52);
      g.fillTriangle(S*.5,S*.38,S*.98,S*.04,S*.7,S*.52);
      g.fillStyle(0xff6600,.35);
      g.fillTriangle(S*.5,S*.38,S*.06,S*.08,S*.32,S*.5);
      g.fillTriangle(S*.5,S*.38,S*.94,S*.08,S*.68,S*.5);
      // 翼の骨
      g.lineStyle(2,0xaa2200,.6);
      g.fillStyle(0xaa2200,.6);
      [[.5,.38,.06,.08],[.5,.38,.3,.52],[.5,.38,.94,.08],[.5,.38,.7,.52]].forEach(([x1,y1,x2,y2])=>{
        g.fillRect(S*Math.min(x1,x2),S*Math.min(y1,y2),S*Math.abs(x2-x1)+2,S*Math.abs(y2-y1)+2);
      });
      // 脚（強力）
      g.fillStyle(0xaa3300,1);g.fillEllipse(S*.3,S*.8,S*.22,S*.32);g.fillEllipse(S*.7,S*.8,S*.22,S*.32);
      // 爪（大きい）
      g.fillStyle(0x223322,1);
      [[.2,.94,.16],[.28,.96,.18],[.36,.94,.16],[.64,.94,.16],[.72,.96,.18],[.8,.94,.16]].forEach(([x,y,l])=>{
        g.fillTriangle(S*x,S*y,S*(x-l*.08),S*(y+l*.1),S*(x+l*.08),S*y);
      });
      // 胴体
      g.fillStyle(0xcc3300,1);g.fillEllipse(S*.5,S*.62,S*.58,S*.54);
      g.fillStyle(0xffaa44,.45);g.fillEllipse(S*.5,S*.67,S*.38,S*.3);
      // 首
      g.fillStyle(0xbb3300,1);g.fillEllipse(S*.5,S*.4,S*.36,S*.28);
      // 頭（大きい）
      g.fillStyle(0xcc3300,1);g.fillEllipse(S*.5,S*.26,S*.44,S*.36);
      // 大角（複数）
      g.fillStyle(0x553311,1);
      g.fillTriangle(S*.34,S*.18,S*.26,S*.0,S*.42,S*.2);
      g.fillTriangle(S*.66,S*.18,S*.58,S*.2,S*.74,S*.0);
      g.fillTriangle(S*.44,S*.14,S*.38,S*.0,S*.5,S*.16);
      g.fillTriangle(S*.56,S*.14,S*.5,S*.16,S*.62,S*.0);
      // 目（金色・巨大）
      g.fillStyle(0xffdd00,1);g.fillEllipse(S*.36,S*.24,S*.16,S*.12);g.fillEllipse(S*.64,S*.24,S*.16,S*.12);
      g.fillStyle(0xff6600,.8);g.fillEllipse(S*.36,S*.24,S*.1,S*.08);g.fillEllipse(S*.64,S*.24,S*.1,S*.08);
      g.fillStyle(0x000000,1);g.fillRect(S*.36,S*.21,S*.02,S*.09);g.fillRect(S*.64,S*.21,S*.02,S*.09);
      // 鼻孔（炎）
      g.fillStyle(0xff4400,1);g.fillCircle(S*.44,S*.32,S*.04);g.fillCircle(S*.56,S*.32,S*.04);
      g.fillStyle(0xffaa00,.7);g.fillCircle(S*.44,S*.3,S*.02);g.fillCircle(S*.56,S*.3,S*.02);
      // 口（炎）
      g.fillStyle(0x110000,1);g.fillEllipse(S*.5,S*.38,S*.28,S*.1);
      g.fillStyle(0xff4400,.8);g.fillEllipse(S*.5,S*.36,S*.16,S*.06);
      g.fillStyle(0xffffff,1);
      for(let i=0;i<4;i++)g.fillTriangle(S*(0.38+i*0.08),S*.35,S*(0.35+i*0.08),S*.42,S*(0.41+i*0.08),S*.35);
    });
  }
}


// ============================================================
//  装備品定義
// ============================================================
const EQUIP_SLOTS=[
  {id:'head',     label:'頭',       icon:'🪖'},
  {id:'face',     label:'顔',       icon:'😷'},
  {id:'shoulder', label:'肩',       icon:'🔰'},
  {id:'body',     label:'体',       icon:'🥋'},
  {id:'feet',     label:'足',       icon:'👢'},
  {id:'accessory',label:'アクセサリー',icon:'💍'},
];

const EQUIP_DEFS={
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
const DROP_TABLE={
  slime:    [{id:'jelly',       rate:1.0, min:1, max:2}],
  bat:      [{id:'bat_wing',    rate:1.0, min:1, max:1}],
  goblin:   [{id:'goblin_ear',  rate:1.0, min:1, max:1}],
  troll:    [{id:'troll_hide',  rate:1.0, min:1, max:1}],
  wolf:     [{id:'wolf_fang',   rate:1.0, min:1, max:2}],
  skeleton: [{id:'bone',        rate:1.0, min:1, max:3}],
  dragon:   [{id:'dragon_scale',rate:1.0, min:1, max:1}],
  sandworm: [{id:'sand_core',   rate:1.0, min:1, max:1}],
  scorpion: [{id:'scorpion_claw',rate:1.0,min:1, max:2}],
  boss1:    [{id:'boss_gem',    rate:1.0, min:1, max:2}],
  boss2:    [{id:'boss_gem',    rate:1.0, min:1, max:1},{id:'boss_core',rate:0.8,min:1,max:1}],
  boss3:    [{id:'boss_gem',    rate:1.0, min:2, max:3},{id:'chaos_shard',rate:0.9,min:1,max:1}],
  boss4:    [{id:'boss_gem',    rate:1.0, min:3, max:5},{id:'chaos_shard',rate:1.0,min:2,max:2}],
  bear:         [{id:'troll_hide',  rate:0.6, min:1, max:2}],
  beetle:       [{id:'scorpion_claw',rate:0.5,min:1, max:2}],
  hornet:       [{id:'bat_wing',    rate:0.6, min:1, max:2}],
  scorpion_queen:[{id:'scorpion_claw',rate:0.8,min:2,max:3},{id:'boss_gem',rate:0.3,min:1,max:1}],
  mistress:     [{id:'boss_gem',rate:1.0,min:4,max:6},{id:'chaos_shard',rate:1.0,min:3,max:3}],
  cloud_monkey: [{id:'jelly',rate:0.5,min:1,max:2}],
  treant:       [{id:'troll_hide',rate:0.6,min:1,max:2},{id:'bone',rate:0.4,min:1,max:1}],
  rock_golem:   [{id:'sand_core',rate:0.7,min:1,max:2},{id:'boss_gem',rate:0.2,min:1,max:1}],
  giant:        [{id:'troll_hide',rate:0.7,min:2,max:3},{id:'wolf_fang',rate:0.5,min:1,max:2}],
  thunder_god:  [{id:'boss_gem',rate:1.0,min:5,max:8},{id:'chaos_shard',rate:1.0,min:4,max:4}],
  orc_warrior:  [{id:'goblin_ear',rate:0.6,min:1,max:2},{id:'wolf_fang',rate:0.4,min:1,max:1}],
  orc_high:     [{id:'troll_hide',rate:0.6,min:1,max:2},{id:'boss_gem',rate:0.2,min:1,max:1}],
  orc_lady:     [{id:'jelly',rate:0.5,min:1,max:2},{id:'goblin_ear',rate:0.4,min:1,max:1}],
  orc_archer:   [{id:'bone',rate:0.5,min:1,max:2},{id:'bat_wing',rate:0.4,min:1,max:1}],
  orc_general:  [{id:'boss_gem',rate:1.0,min:4,max:6},{id:'chaos_shard',rate:1.0,min:3,max:3}],
};

const MAX_ITEM_TYPES=40; // 所持できる種類の上限
const MAX_ITEM_STACK=99; // 1種類あたりの最大所持数

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
    // BGM確認ダイアログは初回のみ（aq_mutedが未設定の場合のみ表示）
    if(_savedMute===null){
      const overlay=this.add.rectangle(w/2,h/2,w,h,0x000000,0.92).setOrigin(0.5).setDepth(100);
      const title=this.add.text(w/2,h/2-60,'🎵 BGMを流しますか？',{fontSize:'20px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setDepth(101);
      const sub=this.add.text(w/2,h/2-24,'（マナーモード中は🔇ボタンで消音できます）',{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa',wordWrap:{width:500}}).setOrigin(0.5).setDepth(101);
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
    let _savedMute=null;
    try{_savedMute=localStorage.getItem('aq_muted');}catch(e){}
    if(_savedMute==='1'){muted=true;}
    else if(_savedMute==='0'){muted=false;}
    // BGM確認ダイアログは初回のみ（aq_mutedが未設定の場合のみ表示）
    if(_savedMute===null){
      const overlay=this.add.rectangle(w/2,h/2,w,h,0x000000,0.92).setOrigin(0.5).setDepth(100);
      const title=this.add.text(w/2,h/2-60,'🎵 BGMを流しますか？',{fontSize:'20px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setDepth(101);
      const sub=this.add.text(w/2,h/2-24,'（マナーモード中は🔇ボタンで消音できます）',{fontSize:'11px',fontFamily:'Courier New',color:'#aaaaaa',wordWrap:{width:500}}).setOrigin(0.5).setDepth(101);
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
      {key:'mage',   name:'マジシャン',  desc:'広範囲魔法\n凍結・大爆発',       col:0x9b59b6,x:180,y:-60},
      {key:'archer', name:'アーチャー',desc:'高速遠距離\n多方向射撃',         col:0x27ae60,x:-180,y:80},
      {key:'bomber', name:'ボマー',    desc:'爆弾投擲\n範囲爆発',             col:0xf39c12,x:180,y:80},
    ];
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
    const cls={warrior:'剣士',mage:'マジシャン',archer:'アーチャー',bomber:'ボマー'}[pd.cls]||pd.cls;
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
  4:{name:'ST.4 砂漠',bgmKey:'st4',tiles:['tile_sand_desert','tile_oasis_grass','tile_sand_beach'],tileWeights:[70,15,15],objects:['obj_desert_rock'],objPos:[[200,180],[560,120],[800,220],[130,480],[980,320],[400,680],[860,600],[1050,780],[480,360],[720,850]],enemies:[['sandworm',400,160],['sandworm',700,192],['sandworm',300,640],['sandworm',650,740],['scorpion',500,300],['scorpion',750,330],['scorpion',350,480],['scorpion',600,500],['wolf',250,430],['wolf',700,680],['dragon',500,600],['dragon',800,430],['skeleton',420,750],['skeleton',900,580]],boss:{id:'boss4',x:600,y:300},bossThreshold:12,portalTo:5,portalToLabel:'⛰ ST.5へ',portalToKey:'portal_st5',portalBack:3,portalBackLabel:'🏖 ST.3へ',portalBackKey:'portal_st3',portalAlt:{to:7,label:'🪓 ST.7 オーク集落へ',key:'portal_st7',x:600,y:80}},
  5:{name:'ST.5 螺旋の崖',bgmKey:'st5',mapW:1600,mapH:1600,
    tiles:['tile_dark_forest','tile_sand_beach','tile_volcanic'],tileWeights:[60,25,15],
    objects:['obj_tree'],
    objPos:[[100,800],[200,600],[150,1000],[300,400],[1400,800],[1300,600],[1350,1000],[1200,400],[800,100],[800,1500]],
    // 渦巻きパス上に敵を配置（左入口→螺旋上昇→頂上）
    enemies:[
      // 外周下部（入口付近）
      ['beetle', 200,1300],['beetle', 400,1400],['hornet', 300,1200],['hornet', 150,1100],
      ['bear',   250,1450],['bear',   450,1350],
      // 外周左
      ['beetle', 100,900], ['hornet', 120,700], ['beetle', 100,500],['bear',160,600],
      // 上部外周
      ['hornet', 300,200], ['beetle', 500,150], ['hornet', 700,120],['bear',400,250],
      // 内周右
      ['scorpion_queen',1400,400],['scorpion_queen',1450,700],
      // 内周下
      ['scorpion_queen',1200,1300],['hornet',1000,1400],['beetle',800,1450],
      // 中央付近（頂上手前）
      ['bear',700,700],['beetle',900,600],['hornet',800,500],['scorpion_queen',750,800],
    ],
    boss:{id:'mistress',x:800,y:300},
    bossThreshold:15,
    portalTo:6,portalToLabel:'☁ ST.6へ',portalToKey:'portal_st6',
    portalBack:4,portalBackLabel:'🏜 ST.4へ',portalBackKey:'portal_st4',
  },
  6:{name:'ST.6 天空の島々',bgmKey:'st6',mapW:1800,mapH:1000,
    tiles:['tile_oasis_grass','tile_sand_beach','tile_sea'],tileWeights:[60,25,15],
    objects:['obj_tree'],
    objPos:[[200,500],[500,250],[500,750],[900,500],[1300,250],[1300,750],[1600,500]],
    enemies:[['cloud_monkey',200,450],['cloud_monkey',220,550],['cloud_monkey',500,200],['treant',480,300],['cloud_monkey',520,220],['rock_golem',500,700],['cloud_monkey',480,800],['treant',520,780],['giant',900,450],['giant',900,550],['rock_golem',860,500],['treant',1300,200],['cloud_monkey',1280,300],['cloud_monkey',1320,280],['rock_golem',1300,700],['giant',1280,800],['cloud_monkey',1320,750],['cloud_monkey',1560,450],['giant',1560,550]],
    boss:{id:'thunder_god',x:1600,y:500},
    bossThreshold:14,
    portalTo:null,portalToLabel:'',
    portalBack:5,portalBackLabel:'⛰ ST.5へ',portalBackKey:'portal_st5',
    // 島データ（地形描画用）
    islands:[
      {cx:200,cy:500,r:160},
      {cx:500,cy:250,r:150},
      {cx:500,cy:750,r:150},
      {cx:900,cy:500,r:170},
      {cx:1300,cy:250,r:150},
      {cx:1300,cy:750,r:150},
      {cx:1600,cy:500,r:160},
    ],
  },
};
const ENEMY_DEFS={
  // passive:true=受動  eva=回避率%（DEXが低いと当たらない）
  slime:   {hp:28, atk:4, def:0, spd:60, exp:12,gold:3,  sz:28,rng:36,acd:1.2, passive:true,  eva:0 },
  bat:     {hp:20, atk:6, def:0, spd:110,exp:18,gold:4,  sz:24,rng:32,acd:0.9, passive:true,  eva:15},
  goblin:  {hp:52, atk:8, def:1, spd:80, exp:30,gold:7,  sz:32,rng:40,acd:1.0, passive:true,  eva:5 },
  troll:   {hp:120,atk:12,def:2, spd:45, exp:60,gold:15, sz:48,rng:48,acd:1.8, passive:true,  eva:0 },
  wolf:    {hp:65, atk:14,def:1, spd:120,exp:45,gold:10, sz:32,rng:40,acd:0.8, passive:false, eva:20},
  skeleton:{hp:80, atk:11,def:3, spd:70, exp:40,gold:12, sz:32,rng:40,acd:1.1, passive:false, eva:10},
  dragon:  {hp:200,atk:20,def:4, spd:90, exp:100,gold:30,sz:56,rng:60,acd:1.5, passive:false, eva:15},
  sandworm:{hp:280,atk:22,def:6, spd:55, exp:120,gold:35,sz:52,rng:50,acd:2.0, passive:false, eva:5 },
  scorpion:{hp:130,atk:28,def:3, spd:100,exp:90,gold:28, sz:28,rng:36,acd:0.7, passive:false, eva:25},
  boss1:   {hp:600,atk:18,def:5, spd:80, exp:500,gold:200,sz:72,rng:64,acd:1.2, passive:false, eva:10,isBoss:true},
  boss2:   {hp:900,atk:25,def:8, spd:90, exp:800,gold:350,sz:80,rng:70,acd:1.0, passive:false, eva:20,isBoss:true},
  boss3:   {hp:1400,atk:35,def:10,spd:100,exp:1500,gold:600,sz:88,rng:80,acd:0.9,passive:false,eva:30,isBoss:true},
  boss4:   {hp:2200,atk:50,def:15,spd:110,exp:3000,gold:1000,sz:100,rng:88,acd:0.7,passive:false,eva:35,isBoss:true},
  // ST5 新モンスター
  bear:    {hp:200,atk:22,def:8, spd:80, exp:80, gold:20, sz:48,rng:52,acd:1.4, passive:true,  eva:5 },
  beetle:  {hp:90, atk:16,def:6, spd:60, exp:55, gold:14, sz:36,rng:40,acd:1.0, passive:true,  eva:8 },
  hornet:  {hp:60, atk:18,def:2, spd:150,exp:50, gold:12, sz:28,rng:36,acd:0.7, passive:false, eva:25},
  scorpion_queen:{hp:350,atk:28,def:10,spd:70,exp:150,gold:40,sz:56,rng:52,acd:1.2,passive:false,eva:15},
  mistress:{hp:3500,atk:65,def:20,spd:90,exp:5000,gold:1500,sz:112,rng:96,acd:0.6,passive:false,eva:25,isBoss:true},
  // ST6 新モンスター
  cloud_monkey:{hp:120,atk:20,def:3, spd:160,exp:90, gold:25, sz:36,rng:44,acd:0.9, passive:false, eva:30},
  treant:      {hp:280,def:12,atk:18,spd:0,  exp:110,gold:30, sz:52,rng:200,acd:2.5,passive:true,  eva:0 },
  rock_golem:  {hp:600,atk:30,def:25,spd:40, exp:180,gold:45, sz:60,rng:56,acd:2.0, passive:true,  eva:0 },
  giant:       {hp:450,atk:40,def:15,spd:70, exp:160,gold:40, sz:72,rng:72,acd:1.8, passive:false, eva:5 },
  thunder_god: {hp:5000,atk:80,def:25,spd:100,exp:8000,gold:2000,sz:120,rng:100,acd:0.5,passive:false,eva:20,isBoss:true},
  // ST7 オーク族
  orc_warrior: {hp:180,atk:28,def:10,spd:75, exp:100,gold:28, sz:48,rng:52,acd:1.2, passive:false, eva:5 },
  orc_high:    {hp:300,atk:35,def:14,spd:60, exp:160,gold:40, sz:56,rng:56,acd:1.5, passive:false, eva:5 },
  orc_lady:    {hp:130,atk:22,def:6, spd:100,exp:85, gold:22, sz:40,rng:44,acd:1.0, passive:true,  eva:12},
  orc_archer:  {hp:110,atk:20,def:5, spd:90, exp:80, gold:20, sz:36,rng:220,acd:1.8,passive:false, eva:15},
  orc_general: {hp:4500,atk:70,def:22,spd:85,exp:6500,gold:1800,sz:108,rng:90,acd:0.7,passive:false,eva:15,isBoss:true},
};

// ============================================================
//  GameScene
// ============================================================
class GameScene extends Phaser.Scene{
  constructor(){super('Game')}
  init(data){
    this.playerData=data.playerData||makePlayerData('warrior');
    this.stage=data.stage!==undefined?data.stage:1;
    this.fromPortal=data.fromPortal||null; // ポータル遷移元を保存
    this.killCount=0;
    this.bossSpawned=false;
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
      }else if(this.stage===5){
        // ST5: 渦巻き崖道の色分け
        // 崖道（明るい）か崖外（暗い）かを渦巻き関数で判定
        const cx=c*TILE+16-MW/2, cy=r*TILE+16-MH/2;
        const dist=Math.sqrt(cx*cx+cy*cy);
        const angle=Math.atan2(cy,cx);
        // 渦巻き: 道幅120px、螺旋半径は200〜720
        const spiral=((angle+Math.PI)/(Math.PI*2)+dist/600)%1;
        const onPath=(dist>180&&dist<720)&&(spiral<0.35||dist<250);
        const onTop=dist<200; // 頂上エリア
        if(onTop) key='tile_sand_beach';
        else if(onPath) key=cfg.tiles[0];
        else key='tile_volcanic';
      }else{
        const n=(c*31+r*17)%100;let acc=0;key=cfg.tiles[0];
        for(let i=0;i<cfg.tileWeights.length;i++){acc+=cfg.tileWeights[i];if(n<acc){key=cfg.tiles[i];break;}}
      }
      this.add.image(c*TILE+16,r*TILE+16,key).setDisplaySize(TILE,TILE);
    }
    // ST7: オーク集落の装飾
    if(this.stage===7){
      const g7=this.add.graphics().setDepth(1);
      // 集落の柵（外周）
      g7.lineStyle(5,0x664422,0.8);
      const fencePoints=[[120,120],[700,80],[1280,120],[1340,500],[1280,880],[700,920],[120,880],[80,500]];
      for(let i=0;i<fencePoints.length;i++){
        const [x1,y1]=fencePoints[i], [x2,y2]=fencePoints[(i+1)%fencePoints.length];
        g7.lineBetween(x1,y1,x2,y2);
        // 柵の杭
        const steps=Math.floor(Math.sqrt((x2-x1)**2+(y2-y1)**2)/40);
        for(let s=0;s<=steps;s++){
          const rx=x1+(x2-x1)*s/steps, ry=y1+(y2-y1)*s/steps;
          g7.fillStyle(0x553311,1);g7.fillRect(rx-4,ry-12,8,14);
          g7.fillStyle(0x886644,.6);g7.fillRect(rx-3,ry-11,4,10);
        }
      }
      // 焚き火3か所
      [[400,400],[700,300],[1000,600]].forEach(([fx,fy])=>{
        g7.fillStyle(0x333333,1);g7.fillEllipse(fx,fy+10,30,8);
        g7.fillStyle(0xff4400,.9);g7.fillTriangle(fx-10,fy+8,fx,fy-12,fx+10,fy+8);
        g7.fillStyle(0xffaa00,.7);g7.fillTriangle(fx-6,fy+6,fx,fy-6,fx+6,fy+6);
        g7.fillStyle(0xffff00,.5);g7.fillTriangle(fx-3,fy+4,fx,fy-2,fx+3,fy+4);
      });
      // テント（三角形）
      [[250,600],[600,700],[900,250],[1100,750]].forEach(([tx,ty])=>{
        g7.fillStyle(0x8a3010,1);g7.fillTriangle(tx-30,ty+20,tx,ty-24,tx+30,ty+20);
        g7.fillStyle(0xaa4020,.5);g7.fillTriangle(tx-20,ty+20,tx,ty-14,tx+20,ty+20);
        g7.lineStyle(2,0x662200,.6);g7.strokeTriangle(tx-30,ty+20,tx,ty-24,tx+30,ty+20);
      });
    }

    // ST6: 空島の描画
    if(this.stage===6&&cfg.islands){
      const g6=this.add.graphics().setDepth(1);
      const islands=cfg.islands;
      // 空（背景を青白に）
      g6.fillStyle(0x88ccff,0.15);g6.fillRect(0,0,MW,MH);

      // 橋の接続順: 0→1,0→2,1→3,2→3,3→4,3→5,4→6,5→6
      const bridges=[[0,1],[0,2],[1,3],[2,3],[3,4],[3,5],[4,6],[5,6]];
      bridges.forEach(([a,b])=>{
        const ia=islands[a],ib=islands[b];
        const ang=Math.atan2(ib.cy-ia.cy,ib.cx-ia.cx);
        const sx=ia.cx+Math.cos(ang)*ia.r, sy=ia.cy+Math.sin(ang)*ia.r;
        const ex=ib.cx-Math.cos(ang)*ib.r, ey=ib.cy-Math.sin(ang)*ib.r;
        const len=Math.sqrt((ex-sx)**2+(ey-sy)**2);
        const pw=28; // 橋幅
        // 橋板
        g6.fillStyle(0xaa7733,1);
        const cos=Math.cos(ang),sin=Math.sin(ang);
        g6.fillRect(sx,sy-pw/2,len,pw);
        // 橋の縁
        g6.lineStyle(3,0x775522,1);
        g6.lineBetween(sx,sy-pw/2,ex,ey-pw/2);
        g6.lineBetween(sx,sy+pw/2,ex,ey+pw/2);
        // 橋の板目
        for(let t=0;t<len;t+=20){
          const bx=sx+cos*t, by=sy+sin*t;
          g6.lineStyle(1,0x664422,0.6);
          g6.lineBetween(bx-sin*pw/2,by+cos*pw/2,bx+sin*pw/2,by-cos*pw/2);
        }
      });

      // 各島を描画
      islands.forEach((island,i)=>{
        const {cx,cy,r}=island;
        // 島の影（少し下にずらして立体感）
        g6.fillStyle(0x226633,0.3);g6.fillEllipse(cx+6,cy+10,r*2+12,r*0.5);
        // 島の土台（濃い緑・崖）
        g6.fillStyle(0x336622,1);g6.fillEllipse(cx,cy+8,r*2,r*0.45);
        // 島の地面
        g6.fillStyle(0x55aa33,1);g6.fillEllipse(cx,cy,r*2,r*2*0.65);
        // 草の光沢
        g6.fillStyle(0x88dd55,0.45);g6.fillEllipse(cx-r*0.15,cy-r*0.15,r*1.1,r*0.55);
        // 花や草のアクセント
        g6.fillStyle(0xffdd00,0.5);
        for(let j=0;j<6;j++){
          const a=(j/6)*Math.PI*2;
          g6.fillCircle(cx+Math.cos(a)*r*0.55,cy+Math.sin(a)*r*0.3,4);
        }
        // 島番号（デバッグ用・後で消せる）
        // 入口・ボス島の特別マーク
        if(i===0){g6.fillStyle(0x44aaff,0.4);g6.fillCircle(cx,cy,20);}
        if(i===6){g6.fillStyle(0xffcc00,0.4);g6.fillCircle(cx,cy,24);}
        // 雲のエフェクト（島の周囲）
        g6.fillStyle(0xffffff,0.2);
        for(let j=0;j<4;j++){
          const a=(j/4)*Math.PI*2+(i*0.5);
          const cr=r*0.8+j*8;
          g6.fillEllipse(cx+Math.cos(a)*cr,cy+Math.sin(a)*cr*0.4,40+j*6,18+j*2);
        }
      });
    }

    // ST5: 渦巻き崖の視覚的な壁を追加
    if(this.stage===5){
      const g5=this.add.graphics().setDepth(1);
      // 頂上から橋（頂上→右端）
      g5.fillStyle(0xcc9955,1);
      g5.fillRect(MW/2+160,MH/2-30,MW/2-160,60); // 橋
      g5.lineStyle(4,0x886633,1);
      g5.strokeRect(MW/2+160,MH/2-30,MW/2-160,60);
      // 橋の板目
      for(let bx=MW/2+180;bx<MW-20;bx+=24){
        g5.lineStyle(2,0x664422,0.6);
        g5.lineBetween(bx,MH/2-28,bx,MH/2+28);
      }
      // 崖の岩肌（濃い茶色の縁取り）
      g5.lineStyle(6,0x5a3010,0.7);
      for(let angle=0;angle<Math.PI*2;angle+=0.05){
        const r1=200,r2=720;
        const spiral=((angle+Math.PI)/(Math.PI*2)+r1/600)%1;
        if(spiral>0.35){
          g5.strokeCircle(MW/2+Math.cos(angle)*r1,MH/2+Math.sin(angle)*r1,3);
        }
      }
    }
    // 障害物
    this.obstacles=this.physics.add.staticGroup();
    if(cfg.objects&&cfg.objects[0]){
      cfg.objPos.forEach(([x,y])=>{const o=this.obstacles.create(x,y,cfg.objects[0]).setDisplaySize(32,40);o.refreshBody();});
    }
    // ST5: 渦巻き崖の物理壁を生成
    if(this.stage===5){
      const WALL=48; // 壁ブロックサイズ
      const cols5=Math.ceil(MW/WALL), rows5=Math.ceil(MH/WALL);
      // 透明テクスチャを1回だけ生成
      if(!this.textures.exists('wall_block')){
        const wg=this.make.graphics({x:0,y:0,add:false});
        wg.fillStyle(0xff0000,0);wg.fillRect(0,0,WALL,WALL);
        wg.generateTexture('wall_block',WALL,WALL);
        wg.destroy();
      }
      for(let r=0;r<rows5;r++) for(let c=0;c<cols5;c++){
        const wx=c*WALL+WALL/2, wy=r*WALL+WALL/2;
        const cx5=wx-MW/2, cy5=wy-MH/2;
        const dist=Math.sqrt(cx5*cx5+cy5*cy5);
        const angle=Math.atan2(cy5,cx5);
        const spiral=((angle+Math.PI)/(Math.PI*2)+dist/600)%1;
        const onPath=(dist>180&&dist<720)&&(spiral<0.35||dist<250);
        const onTop=dist<180;
        // 崖外（歩けないエリア）に壁を置く
        if(!onPath&&!onTop&&dist<760){
          const wall=this.obstacles.create(wx,wy,'wall_block').setDisplaySize(WALL,WALL).setAlpha(0);
          wall.refreshBody();
        }
      }
    }
    // 町の建物 (stage:0)
    this.buildings=[];
    if(this.stage===0&&cfg.buildings){
      const BCOLS={inn:0x5c3317,shop:0x1a4a8a,guild:0x4a1a1a,blacksmith:0x2a2a2a,magic:0x1a0a3a};
      cfg.buildings.forEach(b=>{
        this.buildings.push(b);
        this.add.rectangle(b.x+b.w/2,b.y+b.h/2,b.w,b.h,BCOLS[b.type]||0x333333).setStrokeStyle(2,0x888888);
        this.add.text(b.x+b.w/2,b.y+b.h-16,b.label,{fontSize:'12px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5);
        // 建物への入り口は「入る」ボタン経由のみ（タップ直接入場は無効）
      });
    }
    // ポータル（戻る）
    if(cfg.portalBack!==null&&cfg.portalBack!==undefined){
      this.add.image(80,MH/2,'portal_'+cfg.portalBackKey.replace('portal_','')).setDisplaySize(80,64);
      this.add.text(80,MH/2+44,cfg.portalBackLabel,{fontSize:'10px',fontFamily:'Courier New',color:'#ffd700',align:'center'}).setOrigin(0.5);
    }
    // ポータル（次）：常に開放
    this.portalNext=null;this.portalNextImg=null;this.portalNextTxt=null;
    if(cfg.portalTo!==null&&cfg.portalTo!==undefined){
      this.portalNextImg=this.add.image(MW-80,MH/2,cfg.portalToKey).setDisplaySize(80,64).setAlpha(1.0);
      this.portalNextTxt=this.add.text(MW-80,MH/2+44,cfg.portalToLabel+'\n[近づいて移動]',{fontSize:'9px',fontFamily:'Courier New',color:'#00e5ff',align:'center'}).setOrigin(0.5);
      this.portalNext={x:MW-80,y:MH/2,to:cfg.portalTo,open:true};
    }
    // プレイヤー（mageは128x128スプライトシートなので少し大きく）
    const pSize=pd.cls==='mage'?80:64;
    // fromPortal:'next'→右端近く, 'back'→左端近く, なし→デフォルト左端
    const fromPortal=this.fromPortal||null;
    const spawnX=fromPortal==='next'?(MW-160):200;
    const spawnY=MH/2;
    this.player=this.physics.add.sprite(spawnX,spawnY,'player_'+pd.cls).setDisplaySize(pSize,pSize).setCollideWorldBounds(true).setDepth(5);
    this._facing='front';  // 共通向き管理
    this._facingFlip=false;
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
      const bowling=bull.getData('bowling')||false;
      if(!pierce&&!bowling)bull.setData('dead',true);
      const dmg=bull.getData('dmg')||1;
      const isCrit=bull.getData('isCrit')||false;

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
        // 6方向クラスター爆発
        for(let i=0;i<6;i++){
          const a=i/6*Math.PI*2;
          const ex=bx+Math.cos(a)*bR, ey=by+Math.sin(a)*bR;
          this.time.delayedCall(i*40,()=>{
            // 各方向の爆発エフェクト
            const dot=this.add.circle(bx,by,8,0xffcc00,1.0).setDepth(24);
            this.tweens.add({targets:dot,x:ex,y:ey,alpha:0,scaleX:0.5,scaleY:0.5,duration:200,ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
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

      if(pierce){
        // 貫通弾：同一敵への多重ヒット防止
        const hitSet=bull.getData('hitSet')||new Set();
        if(hitSet.has(ed.sprite)){return;} // 既にヒット済みの敵はスキップ
        hitSet.add(ed.sprite);
        bull.setData('hitSet',hitSet);
        if(bull.getData('miss')){this.showFloat(ed.sprite.x,ed.sprite.y-30,'Miss','#888888','info');SE('miss');}
        else this.hitEnemy(ed,dmg,isCrit);
      }else{
        if(bull.getData('miss')){this.showFloat(ed.sprite.x,ed.sprite.y-30,'Miss','#888888','info');SE('miss');}
        else this.hitEnemy(ed,dmg,isCrit);
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
    this.createHUD();this.createSkillButtons();this.createMinimap();this.createJoystick();this._createHomeButton();
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
      // スラッシュエフェクト（対象がいなくても必ず表示）
      const ang=closest
        ? Phaser.Math.Angle.Between(p.x,p.y,closest.sprite.x,closest.sprite.y)
        : (this._lastAngle||0);
      const slashX=p.x+Math.cos(ang)*44, slashY=p.y+Math.sin(ang)*44;
      const slash=this.add.image(slashX,slashY,'fx_slash').setRotation(ang).setDisplaySize(48,48).setDepth(20).setAlpha(0.9);
      this.tweens.add({targets:slash,alpha:0,scaleX:1.5,scaleY:1.5,duration:200,onComplete:()=>slash.destroy()});
      SE('hit');
      this.atkCooldown=this._calcAtkCD(0.7);
      if(!closest)return; // 対象なし→エフェクトだけ出して終了
      const res=rollAttack(pd,closest.def,closest.eva||0);
      if(res.miss){this.showFloat(p.x,p.y-40,'Miss','#888888','info');SE('miss');}
      else{this.hitEnemy(closest,res.dmg,res.isCrit);}

    }else if(cls==='mage'){
      // ファイアボール発射（SP3消費）
      if(pd.sp<3){this.showFloat(p.x,p.y-40,'SP不足','#3498db','info');return;}
      pd.sp-=3;
      const ang=this.getFacingAngle();
      this.fireBullet(p.x,p.y,ang,'proj_fireball',{
        spd:320,maxDist:520,
        dmg:Math.max(1,Math.floor(pd.mag*2)+Phaser.Math.Between(0,pd.mag)),
        isCrit:Math.random()*100<calcCrit(pd),
        sz:20,
      });
      SE('magic');this.updateHUD();
      this.atkCooldown=this._calcAtkCD(0.7);

    }else if(cls==='archer'){
      // 矢発射
      const ang=this.getFacingAngle();
      const res=rollAttack(pd,0,this._nearestEnemyEva());
      this.fireBullet(p.x,p.y,ang,'proj_arrow',{
        spd:540,maxDist:650,
        dmg:res.miss?0:Math.max(1,Math.floor(pd.atk*1.5)+Phaser.Math.Between(0,pd.atk)),
        isCrit:!res.miss&&res.isCrit,
        miss:res.miss,
        sz:14,
      });
      SE('arrow');
      this.playSpriteAtk();
      this.atkCooldown=this._calcAtkCD(0.5);

    }else if(cls==='bomber'){
      // 爆弾投擲（放物線）→ 着弾時に範囲ダメージ
      const ang=this.getFacingAngle();
      const dist=60;
      const tx=p.x+Math.cos(ang)*dist, ty=p.y+Math.sin(ang)*dist;
      this.throwBomb(p.x,p.y,tx,ty,{
        dmg:Math.max(1,Math.floor(pd.atk*3)+Phaser.Math.Between(0,Math.floor(pd.atk*2))),
        isCrit:Math.random()*100<calcCrit(pd),
        radius:55,
      });
      SE('explode');
      this.atkCooldown=this._calcAtkCD(1.0);
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
          // 通常爆弾エフェクト
          const exp=this.add.image(tx,ty,'fx_explosion').setDisplaySize(80,80).setDepth(15);
          this.tweens.add({targets:exp,alpha:0,scaleX:2,scaleY:2,duration:350,onComplete:()=>exp.destroy()});
        }
        // 範囲ダメージ
        this.enemyDataList.forEach(ed=>{
          if(ed.dead)return;
          const d=Phaser.Math.Distance.Between(tx,ty,ed.sprite.x,ed.sprite.y);
          if(d<=R){
            const decay=1-d/R*0.6;
            const dmg=Math.max(1,Math.floor(opt.dmg*decay));
            this.hitEnemy(ed,dmg,opt.isCrit,opt.isSkill||false);
          }
        });
        this.cameras.main.shake(opt.isHyper?400:200,opt.isHyper?0.02:0.008);
      }
    });
  }

  // ── スキル ────────────────────────────────────
  // ── スキル定義（④ 3スキル対応）────────────────
  getSkillDefs(){
    // 各職業のスキル3種定義（要件書§4）
    return {
      warrior:[
        {id:'sk1',name:'烈風斬',    cost:20,cd:2,  desc:'周囲140px全敵に4倍ダメージ'},
        {id:'sk2',name:'ハードガード',cost:15,cd:4, desc:'DEF+30・6秒間（Lv×3秒追加）'},
        {id:'sk3',name:'パリィ',    cost:10,cd:6,  desc:'3秒間ダメージ無効化'},
      ],
      mage:[
        {id:'sk1',name:'大爆発',    cost:30,cd:2.5,desc:'周囲220px全敵に6倍魔法ダメージ'},
        {id:'sk2',name:'フロスト',  cost:25,cd:3.5,desc:'周囲160pxの敵を3秒凍結'},
        {id:'sk3',name:'ボルテックス',cost:20,cd:2,desc:'貫通する雷の弾を発射'},
      ],
      archer:[
        {id:'sk1',name:'5方向射撃', cost:15,cd:1.5,desc:'5方向同時に矢を放つ'},
        {id:'sk2',name:'グロリアスショット',cost:20,cd:5,desc:'10秒間クリティカル率×5'},
        {id:'sk3',name:'バルカン',  cost:30,cd:3,  desc:'前方に6連射'},
      ],
      bomber:[
        {id:'sk1',name:'設置爆弾', cost:5, cd:0,  desc:'最大3個設置・敵接触で爆破'},
        {id:'sk2',name:'ボーリングボムス',cost:20,cd:3,  desc:'直線貫通→着弾で6方向爆撃'},
        {id:'sk3',name:'ハイパーボム',cost:35,cd:4,desc:'超巨大爆弾・範囲150px'}
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
    const lbl=this.add.text(bx,by-6,label,{fontSize:'11px',fontFamily:'Courier New',color:color,stroke:'#000',strokeThickness:2}).setOrigin(0.5).setScrollFactor(0).setDepth(61);
    const barBg=this.add.rectangle(bx,by+6,BW,7,0x333333).setOrigin(0.5).setScrollFactor(0).setDepth(61);
    const bar=this.add.rectangle(bx-BW/2,by+6,BW,7,col).setOrigin(0,0.5).setScrollFactor(0).setDepth(62);
    const secTxt=this.add.text(bx+BW/2+8,by+6,'',{fontSize:'11px',fontFamily:'Courier New',color:'#ffffff'}).setOrigin(0,0.5).setScrollFactor(0).setDepth(62);

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
      fontSize:'9px',fontFamily:'Courier New',
      color:color,stroke:'#000000',strokeThickness:2
    }).setOrigin(0.5).setDepth(81);
    const castBarBg=this.add.rectangle(p.x,p.y+OY+4,BW,6,0x222222).setOrigin(0.5).setDepth(81);
    const castBar  =this.add.rectangle(p.x-BW/2,p.y+OY+4,0,6,hexCol).setOrigin(0,0.5).setDepth(82);
    const castTxt  =this.add.text(p.x+BW/2+4,p.y+OY+4,'',{
      fontSize:'9px',fontFamily:'Courier New',color:'#ffffff',stroke:'#000',strokeThickness:2
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
    // オブジェクト削除
    [bombData.spr,bombData.zone,bombData.txt].forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
    // _placedBombsから削除
    if(this._placedBombs){
      this._placedBombs=this._placedBombs.filter(b=>b!==bombData);
    }
    // 爆発エフェクト
    const fl=this.add.circle(bx,by,sz*0.4,0xffffff,0.9).setDepth(26);
    this.tweens.add({targets:fl,alpha:0,scaleX:3,scaleY:3,duration:200,onComplete:()=>fl.destroy()});
    const ring=this.add.circle(bx,by,8,0xff6600,0).setStrokeStyle(5,0xff6600,1.0).setDepth(25);
    this.tweens.add({targets:ring,scaleX:sz/8,scaleY:sz/8,alpha:0,duration:400,ease:'Cubic.easeOut',onComplete:()=>ring.destroy()});
    const exp=this.add.image(bx,by,'fx_explosion').setDisplaySize(sz,sz).setDepth(24);
    this.tweens.add({targets:exp,alpha:0,scaleX:1.8,scaleY:1.8,duration:350,onComplete:()=>exp.destroy()});
    // パーティクル
    for(let i=0;i<8;i++){
      const a=(i/8)*Math.PI*2,dist=sz*(0.3+Math.random()*0.5);
      const dot=this.add.circle(bx,by,Phaser.Math.Between(4,10),i%2===0?0xff6600:0xffcc00,1.0).setDepth(25);
      this.tweens.add({targets:dot,x:bx+Math.cos(a)*dist,y:by+Math.sin(a)*dist,alpha:0,scaleX:0.1,scaleY:0.1,duration:350,ease:'Cubic.easeOut',onComplete:()=>dot.destroy()});
    }
    // ダメージ判定（sz半径）
    this.enemyDataList.forEach(ed=>{
      if(ed.dead)return;
      if(Phaser.Math.Distance.Between(bx,by,ed.sprite.x,ed.sprite.y)<sz/2+ed.sprite.displayWidth/2){
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
      fontSize:'15px',fontFamily:'Courier New',color:'#00ccff',
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
  useSkill(num=1){
    const pd=this.playerData,p=this.player;
    const defs=this.getSkillDefs();
    const sk=defs[num-1]; if(!sk)return;
    const skKey='sk'+num;
    if(pd[skKey]===0){this.showFloat(p.x,p.y-50,'スキル未習得','#888888','info');return;}
    const cdKey='skillCD'+num;
    if((this[cdKey]||0)>0)return;
    if(this._casting){return;} // 詠唱中は新しいスキル不可
    if(pd.sp<sk.cost){this.showFloat(p.x,p.y-50,'SP不足','#3498db','info');return;}
    pd.sp-=sk.cost; SE('skill');

    // ─ 剣士 ─
    if(pd.cls==='warrior'){
      if(num===1){ // 烈風斬
        const range=140*(1+(pd.sk1-1)*0.1);
        this.enemyDataList.forEach(ed=>{if(!ed.dead&&Phaser.Math.Distance.Between(p.x,p.y,ed.sprite.x,ed.sprite.y)<range){const dmg=Math.max(1,Math.floor(pd.atk*(4+pd.sk1*0.3)));this.hitEnemy(ed,dmg,Math.random()*100<calcCrit(pd),true);}});
        this.showFloat(p.x,p.y-60,'⚔ 烈風斬！','#e74c3c');this.cameras.main.shake(200,0.01);
      }else if(num===2){ // ハードガード
        const dur=20000;
        this._guardDef=pd.def; pd.def+=30;
        this.showFloat(p.x,p.y-60,'🛡 ハードガード！','#3498db');
        const flash=this.add.rectangle(p.x,p.y,60,80,0x3498db,0.3).setDepth(20);
        this.tweens.add({targets:flash,alpha:0,duration:dur,onComplete:()=>{flash.destroy();pd.def=this._guardDef;}});
        this.showBuffTimer('🛡 ハードガード','#3498db',dur);
      }else if(num===3){ // パリィ
        pd._parry=true;
        this.showFloat(p.x,p.y-60,'🛡 パリィ！','#ffd700');
        this.time.delayedCall(20000,()=>{pd._parry=false;});
        this.showBuffTimer('✨ パリィ','#ffd700',20000);
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
          SE('skill');
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
          SE('skill');
        });
      }else if(num===3){ // ボルテックスボール（貫通）
        const ang=this.getFacingAngle();
        // sz: Lv1=28px → Lv5=80px（スキルLvで大きくなる）
        const sz=28+pd.sk3*13;
        const bull=this.fireBullet(p.x,p.y,ang,'proj_vortexball',{
          spd:400,maxDist:700,
          dmg:Math.max(1,Math.floor(pd.mag*(1.2+pd.sk3*0.1))),
          isCrit:Math.random()*100<calcCrit(pd),
          sz,
        });
        // 当たり判定をsz×szに合わせる（円形bodyに設定）
        bull.setData('pierce',true);
        bull.body.setSize(sz,sz); // 当たり判定をサイズに合わせる
        // 回転エフェクト（電球っぽく回転）
        this.tweens.add({targets:bull,angle:360,duration:600,repeat:-1,ease:'Linear'});
        this.showFloat(p.x,p.y-60,'⚡ ボルテックス！','#44ffff');
      }
    }
    // ─ アーチャー ─
    else if(pd.cls==='archer'){
      if(num===1){ // 5方向射撃
        const ang=this.getFacingAngle();
        for(let i=-2;i<=2;i++){
          const a=ang+i*0.22;
          const res=rollAttack(pd,0,this._nearestEnemyEva());
          const dmg=res.miss?0:Math.max(1,Math.floor(pd.atk*(1+pd.sk1*0.25)));
          this.fireBullet(p.x,p.y,a,'proj_arrow',{spd:540,maxDist:600,dmg,isCrit:!res.miss&&res.isCrit,sz:14});
        }
        this.showFloat(p.x,p.y-60,'🏹 5方向射撃！','#27ae60');SE('arrow');
      }else if(num===2){ // グロリアスショット（クリ率UP）
        const dur=20000;
        // 既に発動中なら先に解除してから再適用（重複防止）
        if(pd._gloryActive){
          pd.luk=pd._gloryBaseLuk;
          if(this._gloryTimer){this._gloryTimer.remove();this._gloryTimer=null;}
        }
        pd._gloryBaseLuk=pd.luk; // 元のlukを保存
        pd._gloryActive=true;
        pd.luk=Math.floor(pd.luk*5);
        this.showFloat(p.x,p.y-60,'✨ グロリアスショット！','#ffd700');
        this._gloryTimer=this.time.delayedCall(dur,()=>{
          pd.luk=pd._gloryBaseLuk; // 確実に元の値に戻す
          pd._gloryActive=false;
          this._gloryTimer=null;
        });
        this.showBuffTimer('⭐ グロリアスショット','#ffd700',dur);
      }else if(num===3){ // バルカンショット（連射）
        const shots=2+pd.sk3;
        const ang=this.getFacingAngle();
        for(let i=0;i<shots;i++){
          this.time.delayedCall(i*80,()=>{
            const res=rollAttack(pd,0,this._nearestEnemyEva());
            const dmg=res.miss?0:Math.max(1,Math.floor(pd.atk*2));
            this.fireBullet(p.x,p.y,ang+(Math.random()-0.5)*0.1,'proj_arrow',{spd:560,maxDist:650,dmg,isCrit:!res.miss&&res.isCrit,sz:14});
          });
        }
        this.showFloat(p.x,p.y-60,'🏹 バルカン'+shots+'連射！','#27ae60');SE('arrow');
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
        const timeTxt=this.add.text(bx,by-bombSz/2-6,'10s',{fontSize:'12px',fontFamily:'Courier New',color:'#ffffff',stroke:'#000000',strokeThickness:3,backgroundColor:'#00000066',padding:{x:3,y:1}}).setOrigin(0.5).setDepth(7);

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
    const SB_W=10; // スクロールバー幅
    const L=PX-PW/2+6;
    const R=PX+PW/2-6-SB_W-4; // スクロールバー分だけ右端を詰める
    const listTop=PY-PH/2+62;
    const listBot=PY+PH/2-44;
    const listH=listBot-listTop;

    // 2列グリッド・セルを詰めて最大表示
    const COLS=2;
    const CELL_W=(R-L)/COLS;
    const CELL_H=72;
    const totalRows=Math.ceil(CRAFT_RECIPES.length/COLS);
    const visibleRows=Math.floor(listH/CELL_H);
    const visibleCount=visibleRows*COLS;
    let scrollRow=0; // 行単位でスクロール
    const maxRow=Math.max(0,totalRows-visibleRows);
    let dragStartY=null, dragStartRow=null;

    // スクロールバー（右端固定）
    const sbX=PX+PW/2-6-SB_W/2;
    const sbBg=mk(this.add.rectangle(sbX,listTop+listH/2,SB_W,listH,0x1a1a2e,0.9).setStrokeStyle(1,0x334455).setScrollFactor(0).setDepth(73));
    const sbThumbH=Math.max(24,listH*(visibleRows/totalRows));
    const sbThumb=mk(this.add.rectangle(sbX,listTop+sbThumbH/2,SB_W-2,sbThumbH,0x44aaff,0.7).setScrollFactor(0).setDepth(74));

    const updateScrollbar=()=>{
      if(maxRow<=0){sbThumb.setVisible(false);return;}
      sbThumb.setVisible(true);
      const ratio=scrollRow/maxRow;
      const thumbY=listTop+(listH-sbThumbH)*ratio+sbThumbH/2;
      sbThumb.setY(thumbY);
    };

    const renderRecipes=(row)=>{
      if(this._craftRows){
        this._craftRows.forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
      }
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

        const canCraft=pd.gold>=recipe.fee&&recipe.materials.every(m=>(pd.items[m.id]||0)>=m.count);
        const bgCol=canCraft?0x0a2010:0x080d18;
        const stCol=canCraft?0x44aa44:0x334455;

        // セル背景
        addRow(this.add.rectangle(cx,cy,CELL_W-4,CELL_H-3,bgCol,0.9).setStrokeStyle(1,stCol).setScrollFactor(0).setDepth(72));

        // 装備名（上段）
        addRow(this.add.text(cL2+2,cy-CELL_H*0.3,eDef.icon+' '+eDef.name,{
          fontSize:'13px',fontFamily:'Courier New',
          color:canCraft?'#ffffff':'#556677',fontStyle:canCraft?'bold':'normal'
        }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));

        // ステータス
        const statStr=Object.entries(eDef.stats).map(([k,v])=>k.toUpperCase()+'+'+v).join(' ');
        addRow(this.add.text(cL2+2,cy-CELL_H*0.08,statStr,{
          fontSize:'10px',fontFamily:'Courier New',color:'#667788'
        }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));

        // 素材3つ（下段）
        recipe.materials.forEach((m,mi)=>{
          const mDef=ITEM_DEFS[m.id];
          const have=pd.items[m.id]||0;
          const ok=have>=m.count;
          addRow(this.add.text(cL2+4+mi*(CELL_W*0.28),cy+CELL_H*0.2,
            (mDef?mDef.icon:'?')+'×'+m.count+'('+have+')',{
            fontSize:'10px',fontFamily:'Courier New',
            color:ok?'#44dd88':'#cc4444',stroke:'#000',strokeThickness:2
          }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        });

        // 加工費
        addRow(this.add.text(cR2-32,cy+CELL_H*0.2,recipe.fee+'G',{
          fontSize:'11px',fontFamily:'Courier New',
          color:pd.gold>=recipe.fee?'#ffd700':'#663300'
        }).setOrigin(1,0.5).setScrollFactor(0).setDepth(73));

        // 作るボタン
        if(canCraft){
          const btn=addRow(this.add.rectangle(cR2-12,cy+CELL_H*0.2,28,20,0x226622,0.95).setStrokeStyle(1,0x44aa44).setScrollFactor(0).setDepth(73).setInteractive({useHandCursor:true}));
          addRow(this.add.text(cR2-12,cy+CELL_H*0.2,'作る',{fontSize:'11px',fontFamily:'Courier New',color:'#44ff88'}).setOrigin(0.5).setScrollFactor(0).setDepth(74));
          btn.on('pointerover',()=>btn.setFillStyle(0x338833,0.95));
          btn.on('pointerout', ()=>btn.setFillStyle(0x226622,0.95));
          btn.on('pointerdown',()=>{
            recipe.materials.forEach(m=>{pd.items[m.id]-=m.count;});
            pd.gold-=recipe.fee;
            pd.items[recipe.result]=(pd.items[recipe.result]||0)+1;
            showResult(eDef.icon+' '+eDef.name+'を製作！装備タブから装備できます','#44ff88');
            refreshGold(); SE('levelup');
            renderRecipes(scrollRow);
          });
        }
      });

      // 件数表示
      addRow(this.add.text(L,listBot+6,
        (offset+1)+'〜'+Math.min(offset+visibleCount,CRAFT_RECIPES.length)+' / '+CRAFT_RECIPES.length+'種',{
        fontSize:'10px',fontFamily:'Courier New',color:'#556677'
      }).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));

      updateScrollbar();
    };

    renderRecipes(0);

    // ── スワイプ＆ホイールスクロール ──
    const scrollZone=mk(this.add.rectangle(PX-SB_W/2,listTop+listH/2,PW-SB_W-10,listH,0x000000,0).setScrollFactor(0).setDepth(75).setInteractive());

    const doScroll=(newRow)=>{
      const clamped=Math.max(0,Math.min(maxRow,newRow));
      if(clamped!==scrollRow){scrollRow=clamped;renderRecipes(scrollRow);}
    };

    scrollZone.on('pointerdown',(ptr)=>{dragStartY=ptr.y;dragStartRow=scrollRow;});
    scrollZone.on('pointermove',(ptr)=>{
      if(dragStartY===null)return;
      const dy=dragStartY-ptr.y;
      doScroll(Math.round(dragStartRow+dy/CELL_H));
    });
    scrollZone.on('pointerup',()=>{dragStartY=null;});
    scrollZone.on('pointerout',()=>{dragStartY=null;});
    scrollZone.on('wheel',(_ptr,_dx,dy)=>{doScroll(scrollRow+(dy>0?1:-1));});

    // スクロールバードラッグ
    sbThumb.setInteractive({useHandCursor:true,draggable:true});
    this.input.setDraggable(sbThumb);
    sbThumb.on('drag',(_ptr,_x,y)=>{
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
    };

    // パネル
    const PW=Math.min(w*0.82,500), PH=Math.min(h*0.75,380);
    const PX=w/2, PY=h/2;
    mk(this.add.rectangle(PX,PY,PW,PH,0x061020,0.97).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(71));
    // タイトル
    mk(this.add.text(PX,PY-PH/2+20,b.label||'施設',{fontSize:'18px',fontFamily:'Courier New',color:'#44aaff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0).setDepth(72));
    // 所持金表示
    const goldTxt=mk(this.add.text(PX,PY-PH/2+42,'💰 所持金: '+pd.gold+'G',{fontSize:'13px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5).setScrollFactor(0).setDepth(72));
    const refreshGold=()=>goldTxt.setText('💰 所持金: '+pd.gold+'G');

    // 閉じるボタン
    const closeBtn=mk(this.add.rectangle(PX,PY+PH/2-22,160,32,0x333333,0.8).setStrokeStyle(1,0x666666).setScrollFactor(0).setDepth(72).setInteractive({useHandCursor:true}));
    mk(this.add.text(PX,PY+PH/2-22,'✕ 閉じる',{fontSize:'14px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
    closeBtn.on('pointerdown',close);
    closeBtn.on('pointerover',()=>closeBtn.setFillStyle(0x555555,0.9));
    closeBtn.on('pointerout', ()=>closeBtn.setFillStyle(0x333333,0.8));

    const msgY=PY+PH/2-58;
    const result=mk(this.add.text(PX,msgY,'',{fontSize:'13px',fontFamily:'Courier New',color:'#44ff88',stroke:'#000',strokeThickness:2}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
    const showResult=(msg,col='#44ff88')=>{result.setText(msg).setColor(col);};

    // ショップアイテム定義
    const shops={
      inn:[
        {label:'泊まる（HP/SP全回復+ポーション×3）',price:30,icon:'🛏',action:()=>{pd.hp=pd.mhp;pd.sp=pd.msp;pd.potHP=(pd.potHP||0)+3;pd.potMP=(pd.potMP||0)+3;showResult('✨ ぐっすり眠れた！完全回復！');this.updateHUD();}},
      ],
      shop:[
        {label:'HPポーション',price:30,icon:'💊',action:()=>{pd.potHP=(pd.potHP||0)+1;showResult('💊 HPポーション入手！');this.updateHUD();}},
        {label:'MPポーション',price:25,icon:'💧',action:()=>{pd.potMP=(pd.potMP||0)+1;showResult('💧 MPポーション入手！');this.updateHUD();}},
        {label:'帰還の巻物　町に帰れる',price:80,icon:'📜',action:()=>{if(!pd.items)pd.items={};pd.items['town_scroll']=(pd.items['town_scroll']||0)+1;showResult('📜 帰還の巻物を入手！');this.updateHUD();}},
      ],
      blacksmith:'craft', // 鍛冶屋はクラフト専用UI
      magic:[
        {label:'魔法のマント　MAG+6 SP+10',price:85,icon:'🧣',action:()=>{if(!pd.items)pd.items={};pd.items['mage_mantle']=(pd.items['mage_mantle']||0)+1;showResult('🧣 魔法のマントを入手！装備タブから装備できます');this.updateHUD();}},
        {label:'魔法のローブ　MAG+8 SP+15',price:90,icon:'👘',action:()=>{if(!pd.items)pd.items={};pd.items['robe']=(pd.items['robe']||0)+1;showResult('👘 魔法のローブを入手！装備タブから装備できます');this.updateHUD();}},
        {label:'幸運の指輪　LUK+8 HIT+5', price:100,icon:'💍',action:()=>{if(!pd.items)pd.items={};pd.items['lucky_ring']=(pd.items['lucky_ring']||0)+1;showResult('💍 幸運の指輪を入手！装備タブから装備できます');this.updateHUD();}},
        {label:'力のお守り　ATK+6',        price:80, icon:'📿',action:()=>{if(!pd.items)pd.items={};pd.items['power_amulet']=(pd.items['power_amulet']||0)+1;showResult('📿 力のお守りを入手！装備タブから装備できます');this.updateHUD();}},
        {label:'魔力の宝珠　MAG+6 SP+10', price:90, icon:'🔮',action:()=>{if(!pd.items)pd.items={};pd.items['mage_orb']=(pd.items['mage_orb']||0)+1;showResult('🔮 魔力の宝珠を入手！装備タブから装備できます');this.updateHUD();}},
        {label:'メテオームの書　※マジシャン専用',price:1000,icon:'📖',mageOnly:true,action:()=>{
          if(pd.cls!=='mage'){showResult('マジシャンのみ使用できます','#ff4444');return;}
          if(pd._hasMeteoorm){showResult('既に習得済みです','#aaaaaa');return;}
          pd._hasMeteoorm=true;
          showResult('📖 メテオームの書を習得！（スキルは近日実装予定）','#cc88ff');
        }},
        {label:'ハードプロテクトの書　※マジシャン専用',price:1000,icon:'📗',mageOnly:true,action:()=>{
          if(pd.cls!=='mage'){showResult('マジシャンのみ使用できます','#ff4444');return;}
          if(pd._hasHardProtect){showResult('既に習得済みです','#aaaaaa');return;}
          pd._hasHardProtect=true;
          showResult('📗 ハードプロテクトの書を習得！（スキルは近日実装予定）','#cc88ff');
        }},
      ],
      guild:[
        {label:'（準備中）',price:0,icon:'⚔',action:()=>{showResult('現在工事中です…','#aaaaaa');}},
      ],
    };

    // 鍛冶屋はクラフト専用UI
    if(b.type==='blacksmith'){
      this._buildCraftUI(mk,close,showResult,refreshGold,PX,PY,PW,PH,pd);
      return;
    }

    const items=shops[b.type]||[];
    // 横2列・スクロール対応グリッド
    const SH_COLS=2;
    const SH_CW=(PW-24)/SH_COLS;
    const SH_H=68; // セルの高さ
    const listTop=PY-PH/2+70;
    const listBottom=PY+PH/2-56;
    const visibleRows=Math.floor((listBottom-listTop)/SH_H);
    const visibleCount=visibleRows*SH_COLS;
    let shopScroll=0;
    const shopObjs=[];

    const renderShopItems=(offset)=>{
      shopObjs.forEach(o=>{try{if(o&&o.active)o.destroy();}catch(e){}});
      shopObjs.length=0;
      const addS=(o)=>{shopObjs.push(o);mk(o);return o;};

      items.slice(offset,offset+visibleCount).forEach((item,i)=>{
        const sc=i%SH_COLS, sr=Math.floor(i/SH_COLS);
        const ix=PX-PW/2+12+sc*SH_CW+SH_CW/2;
        const iy=listTop+sr*SH_H+SH_H/2;
        const mageOnly=item.mageOnly||false;
        const wrongClass=mageOnly&&pd.cls!=='mage';
        const canAfford=pd.gold>=item.price&&!wrongClass;
        const bgCol=wrongClass?0x1a0a0a:canAfford?0x0a1f35:0x0d0d0d;
        const strokeCol=wrongClass?0x552222:canAfford?0x44aaff:0x333333;
        const ibg=addS(this.add.rectangle(ix,iy,SH_CW-6,SH_H-6,bgCol,0.9).setStrokeStyle(1,strokeCol).setScrollFactor(0).setDepth(72));
        // アイコン（大きく）
        addS(this.add.text(ix-SH_CW/2+18,iy,item.icon,{fontSize:'22px'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
        // 商品名
        const textCol=wrongClass?'#552222':canAfford?'#ffffff':'#555566';
        addS(this.add.text(ix-SH_CW/2+36,iy-10,item.label,{fontSize:'12px',fontFamily:'Courier New',color:textCol,wordWrap:{width:SH_CW-80}}).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        // 価格
        if(item.price>0){
          addS(this.add.text(ix+SH_CW/2-8,iy+12,item.price+'G',{fontSize:'13px',fontFamily:'Courier New',color:wrongClass?'#553333':canAfford?'#ffd700':'#663300',fontStyle:'bold'}).setOrigin(1,0.5).setScrollFactor(0).setDepth(73));
        }
        if(mageOnly){
          addS(this.add.text(ix-SH_CW/2+36,iy+10,'🔮マジシャン専用',{fontSize:'9px',fontFamily:'Courier New',color:wrongClass?'#663333':'#9966cc'}).setOrigin(0,0.5).setScrollFactor(0).setDepth(73));
        }
        ibg.setInteractive({useHandCursor:true});
        if(canAfford&&item.price>0){
          ibg.on('pointerover',()=>ibg.setFillStyle(0x1a4060,0.95));
          ibg.on('pointerout', ()=>ibg.setFillStyle(bgCol,0.9));
          ibg.on('pointerdown',()=>{pd.gold-=item.price;item.action();refreshGold();SE('potion');renderShopItems(shopScroll);});
        }else if(wrongClass){ibg.on('pointerdown',()=>showResult('マジシャンのみ購入できます','#ff4444'));}
        else if(pd.gold<item.price&&item.price>0){ibg.on('pointerdown',()=>showResult('💰 所持金が足りません','#ff4444'));}
        else if(item.price===0){ibg.on('pointerdown',()=>item.action());}
      });

      // スクロールボタン
      if(items.length>visibleCount){
        const upA=shopScroll>0;
        const dnA=shopScroll+visibleCount<items.length;
        const upB=addS(this.add.rectangle(PX+PW/2-20,listTop+20,32,28,upA?0x334455:0x1a1a1a,0.85).setStrokeStyle(1,upA?0x556677:0x222222).setScrollFactor(0).setDepth(73).setInteractive({useHandCursor:upA}));
        addS(this.add.text(PX+PW/2-20,listTop+20,'▲',{fontSize:'14px',fontFamily:'Courier New',color:upA?'#aaaaaa':'#333333'}).setOrigin(0.5).setScrollFactor(0).setDepth(74));
        const dnB=addS(this.add.rectangle(PX+PW/2-20,listBottom-20,32,28,dnA?0x334455:0x1a1a1a,0.85).setStrokeStyle(1,dnA?0x556677:0x222222).setScrollFactor(0).setDepth(73).setInteractive({useHandCursor:dnA}));
        addS(this.add.text(PX+PW/2-20,listBottom-20,'▼',{fontSize:'14px',fontFamily:'Courier New',color:dnA?'#aaaaaa':'#333333'}).setOrigin(0.5).setScrollFactor(0).setDepth(74));
        if(upA)upB.on('pointerdown',()=>{shopScroll-=SH_COLS;renderShopItems(shopScroll);});
        if(dnA)dnB.on('pointerdown',()=>{shopScroll+=SH_COLS;renderShopItems(shopScroll);});
        // ページ表示
        addS(this.add.text(PX,listBottom+8,(shopScroll/SH_COLS+1)+'/'+(Math.ceil(items.length/visibleCount))+'ページ',{fontSize:'10px',fontFamily:'Courier New',color:'#556677'}).setOrigin(0.5).setScrollFactor(0).setDepth(73));
      }
    };
    renderShopItems(0);
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

    const switchTab=(t)=>{
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
      const txt=mk(this.add.text(PX+ox,PY-PH/2+TAB_H/2,label,{fontSize:'17px',fontFamily:'Courier New',color:'#'+col.toString(16).padStart(6,'0')}).setOrigin(0.5));
      btn.on('pointerdown',()=>switchTab(id));
      tabBtns[id]=btn; tabTxts[id]=txt;
    });

    // 閉じるボタン
    const closeBX=PX+PW/4; // 右寄り（スキルタブの確定ボタンと横並び想定）
    const closeBY=PY+PH/2-BOT_H/2-2;
    const closeBtn=mk(this.add.rectangle(closeBX,closeBY,160,BOT_H,0xffd700,0.2).setStrokeStyle(2,0xffd700).setInteractive());
    mk(this.add.text(closeBX,closeBY,'✕ 閉じる',{fontSize:'15px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5));
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
    const svStr=(key)=>{if(key==='spd')return String(pd.spd);if(key==='mhp')return String(pd.mhp);if(key==='agi')return String(pd.agi||0)+'%';return String(pd[key]);};
    const sadd=(o)=>{statCont.add(sf0(o));return o;};

    // ポイント残数
    const ptsTxt=sadd(this.add.text(PX,ITOP+10,'残りポイント: '+tmpPts+'pt',{fontSize:'14px',fontFamily:'Courier New',color:'#ffff44'}).setOrigin(0.5));
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
      sadd(this.add.text(cL+10,cy-CELL_H*0.28,s.label,{fontSize:fs+'px',fontFamily:'Courier New',color:s.col,fontStyle:'bold'}).setOrigin(0,0.5));
      // 説明
      sadd(this.add.text(cL+10,cy+CELL_H*0.08,s.desc,{fontSize:Math.max(9,fs-3)+'px',fontFamily:'Courier New',color:'#667788'}).setOrigin(0,0.5));
      // 現在値
      const cur=sadd(this.add.text(cR-btnW*2-10,cy-CELL_H*0.1,svStr(s.key),{fontSize:(fs+3)+'px',fontFamily:'Courier New',color:'#ffffff',fontStyle:'bold'}).setOrigin(1,0.5));
      // 仮割り振り
      const addTxt=sadd(this.add.text(cR-btnW*2-10,cy+CELL_H*0.22,'',{fontSize:(fs-1)+'px',fontFamily:'Courier New',color:'#44ff88'}).setOrigin(1,0.5));
      // ─ ボタン（cRから内側へ）
      const bmX2=cR-btnW*1.6;
      const bpX2=cR-btnW*0.5;
      const bm=sadd(this.add.rectangle(bmX2,cy,btnW,CELL_H-16,0xe74c3c,0.25).setStrokeStyle(2,0xe74c3c).setInteractive());
      sadd(this.add.text(bmX2,cy,'－',{fontSize:'18px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5));
      // ＋ ボタン
      const bp=sadd(this.add.rectangle(bpX2,cy,btnW,CELL_H-16,0x44aaff,0.25).setStrokeStyle(2,0x44aaff).setInteractive());
      sadd(this.add.text(bpX2,cy,'＋',{fontSize:'18px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5));
      const adj=(dir)=>{
        const n=stmp[s.key]||0;
        if(dir>0&&tmpPts<=0)return; if(dir<0&&n<=0)return;
        stmp[s.key]=n+dir; tmpPts-=dir;
        addTxt.setText(stmp[s.key]>0?'(+'+stmp[s.key]+')':'');
        refreshPts(); SE('potion');
      };
      bm.on('pointerdown',()=>adj(-1)); bm.on('pointerover',()=>bm.setFillStyle(0xe74c3c,0.5)); bm.on('pointerout',()=>bm.setFillStyle(0xe74c3c,0.25));
      bp.on('pointerdown',()=>adj(+1)); bp.on('pointerover',()=>bp.setFillStyle(0x44aaff,0.5)); bp.on('pointerout',()=>bp.setFillStyle(0x44aaff,0.25));
      vt[s.key]=cur; at[s.key]=addTxt;
    });

    // 確定ボタン（閉じると横並び・左寄り）
    const okX=PX-PW/4;
    const okY=PY+PH/2-BOT_H/2-2;
    const ok=sadd(this.add.rectangle(okX,okY,160,BOT_H,0x44aaff,0.25).setStrokeStyle(2,0x44aaff).setInteractive());
    sadd(this.add.text(okX,okY,'✔ 確定して反映',{fontSize:'14px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5));
    ok.on('pointerover',()=>ok.setFillStyle(0x44aaff,0.5)); ok.on('pointerout',()=>ok.setFillStyle(0x44aaff,0.25));
    ok.on('pointerdown',()=>{
      let any=false;
      S.forEach(s=>{const n=stmp[s.key]||0;if(n>0){s.apply(pd,n);any=true;}stmp[s.key]=0;});
      pd.statPts=tmpPts;
      S.forEach(s=>{if(vt[s.key])vt[s.key].setText(svStr(s.key));if(at[s.key])at[s.key].setText('');});
      refreshPts(); if(any){SE('levelup');this.updateHUD();}
    });

    // ════════════════════════════════
    //  スキルタブ（＋/－仮割り振り→確定）
    // ════════════════════════════════
    const DEFS={
      warrior:[
        {id:'sk1',name:'烈風斬',      maxLv:10,desc:'周囲の敵を吹き飛ばす'},
        {id:'sk2',name:'ハードガード', maxLv:10,desc:'防御力大幅UP'},
        {id:'sk3',name:'パリィ',      maxLv:5, desc:'攻撃無効化'},
        {id:'sk4',locked:true},{id:'sk5',locked:true},{id:'sk6',locked:true},
      ],
      mage:[
        {id:'sk1',name:'大爆発',      maxLv:10,desc:'広範囲大ダメージ'},
        {id:'sk2',name:'フロスト',    maxLv:10,desc:'広範囲凍結'},
        {id:'sk3',name:'ボルテックス',maxLv:5, desc:'雷の貫通弾'},
        {id:'sk4',locked:true},{id:'sk5',locked:true},{id:'sk6',locked:true},
      ],
      archer:[
        {id:'sk1',name:'5方向射撃',        maxLv:10,desc:'5方向同時射撃'},
        {id:'sk2',name:'グロリアスショット',maxLv:10,desc:'クリ率×5'},
        {id:'sk3',name:'バルカン',          maxLv:10,desc:'連射'},
        {id:'sk4',locked:true},{id:'sk5',locked:true},{id:'sk6',locked:true},
      ],
      bomber:[
        {id:'sk1',name:'設置爆弾',        maxLv:10,desc:'最大3個設置・敵接触で爆破'},
        {id:'sk2',name:'ボーリングボムス',maxLv:10,desc:'直線貫通→着弾で6方向爆撃'},
        {id:'sk3',name:'ハイパーボム',    maxLv:5, desc:'超巨大爆弾'},
        {id:'sk4',locked:true},{id:'sk5',locked:true},{id:'sk6',locked:true},
      ],
    };
    const defs=DEFS[pd.cls]||[];
    const skadd=(o)=>{skillCont.add(sf0(o));return o;};
    const sktmp={}; defs.forEach(sk=>{sktmp[sk.id]=0;}); let tmpJp=pd.jobPts||0;

    // JOBポイント残数のみ表示（バーなし）
    const jpTxt=skadd(this.add.text(PX,ITOP+10,'JLv'+(pd.jobLv||1)+'   JOBポイント残り: '+tmpJp+'pt',{fontSize:'14px',fontFamily:'Courier New',color:'#ffff44'}).setOrigin(0.5));
    const refreshJp=()=>jpTxt.setText('JLv'+(pd.jobLv||1)+'   JOBポイント残り: '+tmpJp+'pt');

    // 縦3×横2グリッドレイアウト（ボタン位置まで最大活用）
    const SK_COLS=2, SK_ROWS=3;
    const SK_CW=(PW-20)/SK_COLS;
    const SK_CH=(IH-22)/SK_ROWS;
    const skVt={}, skAt={}, skCells={};
    defs.forEach((sk,i)=>{
      const skCol=i%SK_COLS, skRow=Math.floor(i/SK_COLS);
      const cx=L+skCol*SK_CW+SK_CW/2;
      const cy=ITOP+24+skRow*SK_CH+SK_CH/2;
      const cL=L+skCol*SK_CW+4, cR=L+(skCol+1)*SK_CW-4;

      // ── ロック枠
      if(sk.locked){
        skadd(this.add.rectangle(cx,cy,SK_CW-6,SK_CH-6,0x080d18,0.6).setStrokeStyle(1,0x223344,0.5));
        skadd(this.add.text(cx,cy,'🔒',{fontSize:'16px'}).setOrigin(0.5));
        return;
      }

      // ── 通常スキルセル
      const curLv=pd[sk.id]||0, maxed=curLv>=sk.maxLv;
      const acol=curLv>0?0x00e5ff:0x556677;
      skadd(this.add.rectangle(cx,cy,SK_CW-6,SK_CH-6,0x0a1525,0.7).setStrokeStyle(2,acol));

      const btnW=36, btnH=SK_CH-20;
      // スキル名（大きく）
      skadd(this.add.text(cL+4,cy-SK_CH*0.3,sk.name,{fontSize:'14px',fontFamily:'Courier New',color:'#'+acol.toString(16).padStart(6,'0'),fontStyle:'bold'}).setOrigin(0,0.5));
      // 説明
      skadd(this.add.text(cL+4,cy-SK_CH*0.05,sk.desc,{fontSize:'10px',fontFamily:'Courier New',color:'#667788',wordWrap:{width:SK_CW-btnW*2-16}}).setOrigin(0,0.5));

      // Lvバー
      const barW=SK_CW-btnW*2-24;
      const bW=Math.max(4,Math.floor(barW/sk.maxLv)-2);
      const lvCells=[];
      for(let j=0;j<sk.maxLv;j++){
        const cell=skadd(this.add.rectangle(cL+4+j*(bW+2),cy+SK_CH*0.22,bW,7,j<curLv?0x00e5ff:0x111133).setStrokeStyle(1,0x223355).setOrigin(0,0.5));
        lvCells.push(cell);
      }
      // Lv数値
      const lvTxt=skadd(this.add.text(cL+4,cy+SK_CH*0.4,'Lv'+curLv+'/'+sk.maxLv,{fontSize:'11px',fontFamily:'Courier New',color:maxed?'#ffd700':'#aaaaaa'}).setOrigin(0,0.5));
      const skAddTxt=skadd(this.add.text(cL+barW/2,cy+SK_CH*0.4,'',{fontSize:'10px',fontFamily:'Courier New',color:'#44ff88'}).setOrigin(0,0.5));
      skVt[sk.id]=lvTxt; skAt[sk.id]=skAddTxt;
      skCells[sk.id]={cells:lvCells,maxLv:sk.maxLv};
      sktmp[sk.id]=0;

      // ±ボタン（右端縦並び）
      if(!maxed){
        const sbp=skadd(this.add.rectangle(cR-btnW/2-2,cy-SK_CH*0.12,btnW,btnH/2-2,0x00e5ff,0.2).setStrokeStyle(2,0x00e5ff).setInteractive());
        skadd(this.add.text(cR-btnW/2-2,cy-SK_CH*0.12,'＋',{fontSize:'16px',fontFamily:'Courier New',color:'#00e5ff'}).setOrigin(0.5));
        const sbm=skadd(this.add.rectangle(cR-btnW/2-2,cy+SK_CH*0.22,btnW,btnH/2-2,0xe74c3c,0.2).setStrokeStyle(2,0xe74c3c).setInteractive());
        skadd(this.add.text(cR-btnW/2-2,cy+SK_CH*0.22,'－',{fontSize:'16px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5));
        const adjSk=(dir)=>{
          const n=sktmp[sk.id]||0;
          const newLv=curLv+n+dir;
          if(dir>0&&(tmpJp<=0||newLv>sk.maxLv))return;
          if(dir<0&&n<=0)return;
          sktmp[sk.id]=n+dir; tmpJp-=dir;
          skAddTxt.setText(sktmp[sk.id]>0?'(+'+sktmp[sk.id]+')':'');
          refreshJp(); SE('potion');
        };
        sbm.on('pointerdown',()=>adjSk(-1)); sbm.on('pointerover',()=>sbm.setFillStyle(0xe74c3c,0.5)); sbm.on('pointerout',()=>sbm.setFillStyle(0xe74c3c,0.2));
        sbp.on('pointerdown',()=>adjSk(+1)); sbp.on('pointerover',()=>sbp.setFillStyle(0x00e5ff,0.5)); sbp.on('pointerout',()=>sbp.setFillStyle(0x00e5ff,0.2));
      }else{
        skadd(this.add.text(cR-btnW/2-2,cy,'MAX',{fontSize:'12px',fontFamily:'Courier New',color:'#ffd700'}).setOrigin(0.5));
      }
    });

    // スキル 確定ボタン（中央・リセットなし）
    // 確定ボタンを閉じるボタンと同じ高さ・左寄りに配置
    const skOkX=PX-PW/4;
    const skOkY=PY+PH/2-BOT_H/2-2;
    const skOk=skadd(this.add.rectangle(skOkX,skOkY,160,BOT_H,0x00e5ff,0.22).setStrokeStyle(2,0x00e5ff).setInteractive());
    skadd(this.add.text(skOkX,skOkY,'✔ 確定して習得',{fontSize:'14px',fontFamily:'Courier New',color:'#00e5ff'}).setOrigin(0.5));
    skOk.on('pointerover',()=>skOk.setFillStyle(0x00e5ff,0.5)); skOk.on('pointerout',()=>skOk.setFillStyle(0x00e5ff,0.22));
    skOk.on('pointerdown',()=>{
      let any=false;
      defs.forEach(sk=>{
        const n=sktmp[sk.id]||0;
        if(n>0){pd[sk.id]=(pd[sk.id]||0)+n;any=true;}
        sktmp[sk.id]=0;
        if(skAt[sk.id])skAt[sk.id].setText('');
        const newLv=pd[sk.id]||0;
        // Lv数値を更新
        if(skVt[sk.id])skVt[sk.id].setText('Lv'+newLv+'/'+sk.maxLv).setColor(newLv>=sk.maxLv?'#ffd700':'#aaaaaa');
        // Lvバーのセルを更新（確定時に反映）
        if(skCells[sk.id]){
          const {cells,maxLv}=skCells[sk.id];
          cells.forEach((cell,j)=>{
            if(cell&&cell.active)cell.setFillStyle(j<newLv?0x00e5ff:0x111133);
          });
        }
      });
      pd.jobPts=tmpJp;
      refreshJp();
      if(any){SE('levelup');this.updateHUD();}
    });


    // ════════════════════════════════
    //  装備タブ
    // ════════════════════════════════
    const eqadd=(o)=>{equipCont.add(sf0(o));return o;};
    const equipStats=calcEquipStats(pd.equip);

    // 装備合計ステータス表示
    eqadd(this.add.text(PX,ITOP+14,'🛡 装備中のステータスボーナス',{fontSize:'13px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5));
    const statKeys=[['atk','ATK'],['def','DEF'],['mag','MAG'],['mhp','HP'],['msp','SP'],['hit','HIT'],['luk','LUK'],['agi','回避']];
    const bonusStr=statKeys.filter(([k])=>equipStats[k]>0).map(([k,l])=>l+'+'+equipStats[k]).join('  ')||'なし';
    eqadd(this.add.text(PX,ITOP+30,bonusStr,{fontSize:'11px',fontFamily:'Courier New',color:'#aaddcc'}).setOrigin(0.5));

    // 6スロット表示（縦3×横2）
    const EQ_COLS=2, EQ_ROWS=3;
    const EQ_CW=(PW-20)/EQ_COLS, EQ_CH=(IH-70)/EQ_ROWS;
    EQUIP_SLOTS.forEach((slot,i)=>{
      const eqCol=i%EQ_COLS, eqRow=Math.floor(i/EQ_COLS);
      const cx=L+10+eqCol*EQ_CW+EQ_CW/2, cy=ITOP+46+eqRow*EQ_CH+EQ_CH/2;
      const equipped=pd.equip[slot.id];
      const eDef=equipped?EQUIP_DEFS[equipped]:null;
      const bgCol=eDef?0x1a2a3a:0x0a0d18;
      const strokeCol=eDef?0xe74c3c:0x334455;

      // スロット背景
      eqadd(this.add.rectangle(cx,cy,EQ_CW-6,EQ_CH-6,bgCol,0.85).setStrokeStyle(eDef?2:1,strokeCol));

      // 部位アイコン（左端・大きく）
      eqadd(this.add.text(cx-EQ_CW/2+16,cy,slot.icon,{fontSize:'22px'}).setOrigin(0.5));
      // 部位名（大きく・太字）
      eqadd(this.add.text(cx-EQ_CW/2+34,cy-EQ_CH*0.2,slot.label,{
        fontSize:'14px',fontFamily:'Courier New',color:eDef?'#e74c3c':'#667788',fontStyle:'bold'
      }).setOrigin(0,0.5));

      if(eDef){
        // 装備品名
        eqadd(this.add.text(cx-EQ_CW/2+34,cy+EQ_CH*0.1,eDef.icon+' '+eDef.name,{
          fontSize:'13px',fontFamily:'Courier New',
          color:'#'+eDef.col.toString(16).padStart(6,'0'),fontStyle:'bold'
        }).setOrigin(0,0.5));
        // ステータス
        const statStr=Object.entries(eDef.stats).map(([k,v])=>k.toUpperCase()+'+'+v).join('  ');
        eqadd(this.add.text(cx-EQ_CW/2+34,cy+EQ_CH*0.35,statStr,{
          fontSize:'11px',fontFamily:'Courier New',color:'#88bbaa'
        }).setOrigin(0,0.5));
        // 外すボタン（右端）
        const removeBtn=eqadd(this.add.rectangle(cx+EQ_CW/2-28,cy,44,EQ_CH-18,0x551111,0.8).setStrokeStyle(1,0xaa3333).setInteractive({useHandCursor:true}));
        eqadd(this.add.text(cx+EQ_CW/2-28,cy,'外す',{fontSize:'12px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5));
        removeBtn.on('pointerover',()=>removeBtn.setFillStyle(0x882222,0.9));
        removeBtn.on('pointerout', ()=>removeBtn.setFillStyle(0x551111,0.8));
        removeBtn.on('pointerdown',()=>{
          pd.equip[slot.id]=null;
          SE('potion');
          this._closeMenu();
          this.openMenu('equip');
        });
      }else{
        eqadd(this.add.text(cx+EQ_CW*0.05,cy,'── 未装備 ──',{
          fontSize:'13px',fontFamily:'Courier New',color:'#334455'
        }).setOrigin(0.5));
      }
    });

    // 所持装備品一覧（下部）
    eqadd(this.add.text(PX,ITOP+48+ROWS2*CH+8,'── 所持品から装備 ──',{fontSize:'11px',fontFamily:'Courier New',color:'#666688'}).setOrigin(0.5));
    const ownedEquips=Object.keys(pd.items||{}).filter(k=>EQUIP_DEFS[k]&&(pd.items[k]||0)>0);
    if(ownedEquips.length===0){
      eqadd(this.add.text(PX,ITOP+48+ROWS2*CH+24,'装備品を持っていません',{fontSize:'11px',fontFamily:'Courier New',color:'#445566'}).setOrigin(0.5));
    }else{
      const INV_Y=ITOP+48+ROWS2*CH+22;
      const INV_W=(PW-20)/Math.min(ownedEquips.length,4);
      ownedEquips.slice(0,8).forEach((id,i)=>{
        const def=EQUIP_DEFS[id];
        const ix=L+10+i*INV_W+INV_W/2;
        const iy=INV_Y;
        const isEquipped=Object.values(pd.equip).includes(id);
        const ibg=eqadd(this.add.rectangle(ix,iy,INV_W-4,28,isEquipped?0x1a3a1a:0x0a1525,0.85).setStrokeStyle(1,isEquipped?0x44aa44:0x334455).setInteractive({useHandCursor:true}));
        eqadd(this.add.text(ix,iy,def.icon+' '+def.name,{fontSize:'10px',fontFamily:'Courier New',color:isEquipped?'#44aa44':'#aaaaaa'}).setOrigin(0.5));
        if(!isEquipped){
          ibg.on('pointerdown',()=>{
            // 同スロットの既存装備を解除してから装備
            pd.equip[def.slot]=id;
            SE('potion');
            this._closeMenu();
            this.openMenu('equip');
          });
        }
      });
    }

    // ════════════════════════════════
    //  アイテムタブ
    // ════════════════════════════════
    const iadd=(o)=>{o.setScrollFactor(0);itemCont.add(o);return o;};
    if(!pd.items)pd.items={};
    console.log('[ITEM TAB] pd.items=',JSON.stringify(pd.items));
    // タイトル
    iadd(this.add.text(PX,ITOP+14,'🎒 所持アイテム',{fontSize:'16px',fontFamily:'Courier New',color:'#f39c12'}).setOrigin(0.5));
    const itemTypes=Object.keys(pd.items||{}).filter(k=>(pd.items[k]||0)>0);
    const typeCount=itemTypes.length;
    iadd(this.add.text(PX,ITOP+32,'種類: '+typeCount+'/'+MAX_ITEM_TYPES,{fontSize:'12px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5));

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
        fontSize:'10px',fontFamily:'Courier New',
        color:hasItem?'#ffffff':'#445566',
        wordWrap:{width:ITEM_CW-6}
      }).setOrigin(0.5));
      // 個数バッジ
      if(hasItem){
        iadd(this.add.text(cx+ITEM_CW/2-4,cy-ITEM_CH/2+4,'×'+count,{
          fontSize:'11px',fontFamily:'Courier New',color:'#ffd700',
          stroke:'#000000',strokeThickness:3
        }).setOrigin(1,0));
        // 使用ボタン or 売価
        if(def.usable){
          const useBtn=iadd(this.add.rectangle(cx,cy+ITEM_CH*0.36,ITEM_CW-10,16,0x226622,0.9).setStrokeStyle(1,0x44aa44).setInteractive({useHandCursor:true}));
          iadd(this.add.text(cx,cy+ITEM_CH*0.36,'▶ 使う',{fontSize:'10px',fontFamily:'Courier New',color:'#44ff88'}).setOrigin(0.5));
          useBtn.on('pointerover',()=>useBtn.setFillStyle(0x336633,0.95));
          useBtn.on('pointerout', ()=>useBtn.setFillStyle(0x226622,0.9));
          useBtn.on('pointerdown',()=>this._useItem(id));
        } else if(def.sell>0){
          iadd(this.add.text(cx,cy+ITEM_CH*0.38,def.sell+'G',{
            fontSize:'10px',fontFamily:'Courier New',color:'#aaddaa'
          }).setOrigin(0.5));
        }
      } else {
        if(def.sell>0){
          iadd(this.add.text(cx,cy+ITEM_CH*0.38,def.sell+'G',{
            fontSize:'10px',fontFamily:'Courier New',color:'#334455'
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
  _applyEquipStats(){
    const pd=this.playerData;
    // 基礎値は装備なしの状態で保持されているので、
    // HUD表示のmhp/mspは基礎値+装備ボーナスとして計算
    // ※現時点では装備は参照のみ（EQUIP_DEFSから戦闘時に加算）
    this.updateHUD();
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
    if(this.hudHPBar&&this.hudHPBar.active)this.hudHPBar.setSize(BW*hpP,11).setFillStyle(hpP>0.5?0x2ecc71:hpP>0.25?0xf39c12:0xe74c3c);
    if(this.hudSPBar&&this.hudSPBar.active)this.hudSPBar.setSize(BW*spP,11);
    const expP=Math.min(1,pd.exp/pd.expNext);
    if(this.hudEXPBar&&this.hudEXPBar.active)this.hudEXPBar.setSize(BW*expP,8);
    const jexpP=Math.min(1,(pd.jobExp||0)/(pd.jobExpNext||80));
    if(this.hudJEXPBar&&this.hudJEXPBar.active)this.hudJEXPBar.setSize(BW*jexpP,8);
    if(this.hudLvTxt&&this.hudLvTxt.active)this.hudLvTxt.setText('Lv'+pd.lv+'  JLv'+(pd.jobLv||1)+'  💰'+pd.gold+'G');
    // スキルボタン更新は _updateSkillBtns() で行う（updateHUDからは呼ばない）
    this._updateSkillBtns();
  }
  _updateSkillBtns(){
    if(!this.skillBtnRefs||!this.skillBtnRefs.length)return;
    const pd=this.playerData;
    this.skillBtnRefs.forEach(({btn,nameTxt,lvTxt,num,col})=>{
      try{
        if(!btn||!btn.active||!nameTxt||!nameTxt.active||!lvTxt||!lvTxt.active)return;
        const has=pd['sk'+num]>0;
        const c=has?col:0x555555;
        btn.setFillStyle(c,has?0.28:0.1).setStrokeStyle(2,c,has?1.0:0.3);
        nameTxt.setColor(has?'#000000':'#667788').setStroke(has?'#ffffff':'#223344',has?3:1);
        lvTxt.setColor(has?'#000000':'#555555').setText('Lv'+(pd['sk'+num]||0)).setStroke(has?'#ffffff':'#223344',has?2:1);
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

  _createHomeButton(){
    const w=this.scale.width,h=this.scale.height;
    const MARGIN=12;
    const btn=this.add.rectangle(60,h-20,96,28,0x223344,0.75)
      .setScrollFactor(0).setDepth(25).setStrokeStyle(1,0x445566,0.8)
      .setInteractive({useHandCursor:true});
    const txt=this.add.text(60,h-20,'🏠 タイトル',{
      fontSize:'12px',fontFamily:'Courier New',color:'#8899aa'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
    btn.on('pointerover',()=>{btn.setFillStyle(0x334455,0.9);txt.setColor('#aabbcc');});
    btn.on('pointerout', ()=>{btn.setFillStyle(0x223344,0.75);txt.setColor('#8899aa');});
    btn.on('pointerdown',()=>{
      // 確認ダイアログ
      const W=this.scale.width,H=this.scale.height;
      const ov=this.add.rectangle(W/2,H/2,W,H,0x000000,0.7).setScrollFactor(0).setDepth(90).setInteractive();
      const ttl=this.add.text(W/2,H/2-40,'タイトルに戻りますか？',{fontSize:'20px',fontFamily:'Courier New',color:'#ffd700',stroke:'#000',strokeThickness:4}).setOrigin(0.5).setScrollFactor(0).setDepth(91);
      const sub=this.add.text(W/2,H/2-10,'キャラクター情報は保存されません',{fontSize:'13px',fontFamily:'Courier New',color:'#aaaaaa'}).setOrigin(0.5).setScrollFactor(0).setDepth(91);
      const btnY=this.add.rectangle(W/2-70,H/2+30,120,36,0xe74c3c,0.3).setStrokeStyle(2,0xe74c3c).setScrollFactor(0).setDepth(91).setInteractive({useHandCursor:true});
      this.add.text(W/2-70,H/2+30,'はい',{fontSize:'16px',fontFamily:'Courier New',color:'#e74c3c'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
      const btnN=this.add.rectangle(W/2+70,H/2+30,120,36,0x44aaff,0.3).setStrokeStyle(2,0x44aaff).setScrollFactor(0).setDepth(91).setInteractive({useHandCursor:true});
      this.add.text(W/2+70,H/2+30,'いいえ',{fontSize:'16px',fontFamily:'Courier New',color:'#44aaff'}).setOrigin(0.5).setScrollFactor(0).setDepth(92);
      const dismiss=()=>[ov,ttl,sub,btnY,btnN].forEach(o=>{try{o.destroy();}catch(e){}});
      btnY.on('pointerdown',()=>{dismiss();stopBGM();this.physics.pause();this.tweens.killAll();this.scene.start('Title');});
      btnN.on('pointerdown',()=>dismiss());
      btnY.on('pointerover',()=>btnY.setFillStyle(0xe74c3c,0.6));btnY.on('pointerout',()=>btnY.setFillStyle(0xe74c3c,0.3));
      btnN.on('pointerover',()=>btnN.setFillStyle(0x44aaff,0.6));btnN.on('pointerout',()=>btnN.setFillStyle(0x44aaff,0.3));
    });
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
    this.skillBtnRefs=[];
    const SK_W=72, SK_H=58; // 少し大きく
    const skLabels=['Q','E','R'];
    const skIcons={
      warrior:['🌪','🛡','✨'], mage:['💥','❄️','⚡'],
      archer:['🏹','⭐','🔫'], bomber:['💣','💥','🚀']
    };
    const icons=skIcons[pd.cls]||['①','②','③'];
    [1,2,3].forEach((num,i)=>{
      const sk=defs[num-1]||{name:'---'};
      const hasSkill=pd['sk'+num]>0;
      // 未習得は暗いグレー、習得済みは職業カラー（明るめ）
      const c=hasSkill?col:0x445566;
      const alpha=hasSkill?0.4:0.12;
      const bx = atkX - ATK_R - MARGIN - SK_W/2 - (2-i)*(SK_W+8);
      const by = h - SK_H/2 - MARGIN;
      // ボタン本体
      const btn=this.add.rectangle(bx,by,SK_W,SK_H,c,alpha)
        .setScrollFactor(0).setDepth(25)
        .setStrokeStyle(hasSkill?2:1,c,hasSkill?1.0:0.4)
        .setInteractive({useHandCursor:true});
      // スキルアイコン（大きめ絵文字・26px）
      this.add.text(bx,by-14,icons[i],{fontSize:'26px'}).setOrigin(0.5).setScrollFactor(0).setDepth(26);
      // スキル名（黒文字・白縁取りで強調）
      const nameTxt=this.add.text(bx,by+10,sk.name,{
        fontSize:'11px',fontFamily:'Courier New',
        color:hasSkill?'#000000':'#667788',
        stroke:hasSkill?'#ffffff':'#223344',
        strokeThickness:hasSkill?3:1,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
      // Lvテキスト（白・縁取り）
      const lvTxt=this.add.text(bx,by+22,'Lv'+(pd['sk'+num]||0),{
        fontSize:'10px',fontFamily:'Courier New',
        color:hasSkill?'#000000':'#445566',
        stroke:hasSkill?'#ffffff':'#223344',
        strokeThickness:hasSkill?2:1,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(26);
      btn.on('pointerdown',()=>{
        const has=this.playerData['sk'+num]>0;
        btn.setFillStyle(col,has?0.75:0.15);
        this.useSkill(num);
      });
      btn.on('pointerup',  ()=>{const has=this.playerData['sk'+num]>0;btn.setFillStyle(col,has?0.4:0.12);});
      btn.on('pointerout', ()=>{const has=this.playerData['sk'+num]>0;btn.setFillStyle(col,has?0.4:0.12);});
      // CDオーバーレイ
      const ov=this.add.rectangle(bx,by,SK_W,SK_H,0x000000,0).setScrollFactor(0).setDepth(27);
      const ct=this.add.text(bx,by,'',{fontSize:'16px',fontFamily:'Courier New',color:'#ffffff',stroke:'#000',strokeThickness:3}).setOrigin(0.5).setScrollFactor(0).setDepth(28);
      this.skillCDOverlays.push({key:'skillCD'+num,ov,ct});
      this.skillBtnRefs.push({btn,nameTxt,lvTxt,num,col});
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
    if(pd.cls==='bomber'||pd.cls==='mage'||pd.cls==='archer') this._updateSpriteAnim(vx,vy);
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
    const p=this.player,cls=this.playerData.cls;
    if(cls!=='bomber'&&cls!=='mage'&&cls!=='archer') return;
    const prefix=cls;
    const cur=p.anims.currentAnim;
    if(cur&&cur.key.endsWith('_atk')&&p.anims.isPlaying) return;

    const moving=Math.abs(vx)>0.1||Math.abs(vy)>0.1;
    let facing=this._facing||'front';
    let flip=this._facingFlip||false;
    if(moving){
      if(Math.abs(vy)>Math.abs(vx)*0.5){facing=vy<0?'back':'front';flip=false;}
      else{
        facing='side';
        // archerはsideが左向き基準（mage/bomberは右向き基準）なので反転が逆
        flip=cls==='archer'?vx>0:vx<0;
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
    if(cls!=='bomber'&&cls!=='mage'&&cls!=='archer') return;
    const key=cls+'_'+(this._facing||'front')+'_atk';
    p.play(key,true);
    p.once('animationcomplete',()=>{
      p.play(cls+'_'+(this._facing||'front')+'_idle',true);
    });
  }

  playBomberAtk(){ this.playSpriteAtk(); }
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
  hitEnemy(ed,dmg,isCrit=false,isSkill=false){
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
    if(isCrit){
      SE('crit');
      const critType=isSkill?'skillcrit':'crit';
      const critTxt=isSkill?'💥 '+dmg+'!!':'★ '+dmg+'!!';
      this.showFloat(sx,sy-ed.sprite.displayHeight/2,critTxt,'#ffee00',critType);
      this.showHitEffect(sx,sy,'crit');
      this.cameras.main.flash(80,255,180,0);
    }else{
      SE('hit');
      const normalType=isSkill?'skill':'normal';
      const normalTxt=isSkill?'⚡ '+dmg:'-'+dmg;
      const normalCol=isSkill?'#44ffff':'#ffffff';
      this.showFloat(sx,sy-ed.sprite.displayHeight/2,normalTxt,normalCol,normalType);
      this.showHitEffect(sx,sy,'normal');
    }
    const pct=Math.max(0,ed.hp/ed.mhp);
    ed.hpBar.setSize(ed.hpBarBg.width*pct,5).setFillStyle(pct>0.5?0x2ecc71:pct>0.25?0xf39c12:0xe74c3c);
    // ヒットフラッシュ（敵が赤く光る）
    ed.sprite.setTint(0xff4444);
    this.time.delayedCall(120,()=>{if(!ed.dead&&ed.sprite.active)ed.sprite.clearTint();});
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
    // ドロップ（ポーション）
    if(ed.isBoss){
      const d1=this.drops.create(ed.sprite.x-20,ed.sprite.y,'drop_hp_potion').setDisplaySize(24,24);d1.setData('type','hp');d1.refreshBody();
      const d2=this.drops.create(ed.sprite.x,   ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d2.setData('type','mp');d2.refreshBody();
      const d3=this.drops.create(ed.sprite.x+20,ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d3.setData('type','mp');d3.refreshBody();
    }else{
      if(Math.random()<0.1){const d=this.drops.create(ed.sprite.x,ed.sprite.y,'drop_hp_potion').setDisplaySize(24,24);d.setData('type','hp');d.refreshBody();}
      if(Math.random()<0.1){const d=this.drops.create(ed.sprite.x,ed.sprite.y,'drop_mp_potion').setDisplaySize(24,24);d.setData('type','mp');d.refreshBody();}
    }
    // ドロップ（素材アイテム）
    const dropTable=DROP_TABLE[ed.id]||[];
    dropTable.forEach(entry=>{
      if(Math.random()>entry.rate)return;
      const count=Phaser.Math.Between(entry.min,entry.max);
      this._addItem(pd,entry.id,count,ed.sprite.x,ed.sprite.y);
    });
    // フェードアウト後にスプライト削除 & リスポーンスケジュール
    const deadId=ed.id;
    const isBoss=ed.isBoss;
    this.tweens.add({targets:ed.sprite,alpha:0,duration:300,onComplete:()=>{
      ed.sprite.destroy();ed.hpBarBg.destroy();ed.hpBar.destroy();
      // ボス以外: 5〜10秒後にランダム位置でリスポーン
      if(!isBoss){
        const delay=Phaser.Math.Between(5000,10000);
        this.time.delayedCall(delay,()=>{
          if(!this.scene.isActive())return; // シーン遷移済みなら中止
          // プレイヤーから遠い位置にスポーン（最低200px離す）
          let rx,ry,tries=0;
          do{
            rx=Phaser.Math.Between(80,this.MW-80);
            ry=Phaser.Math.Between(80,this.MH-80);
            tries++;
          }while(Phaser.Math.Distance.Between(rx,ry,this.player.x,this.player.y)<200&&tries<20);
          this.spawnEnemy(deadId,rx,ry);
        });
      }
    }});
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
      fontSize:'20px',fontFamily:'Courier New',
      color:'#ffee00',stroke:'#cc4400',strokeThickness:5
    }).setOrigin(0.5).setDepth(35).setScale(0.5);
    this.tweens.add({targets:cTxt,scaleX:1.3,scaleY:1.3,y:y-60,alpha:0,duration:700,ease:'Back.easeOut',onComplete:()=>cTxt.destroy()});
  }

  // type: 'normal' | 'crit' | 'skill' | 'skillcrit' | 'info'
  showFloat(x,y,txt,col,type='normal'){
    // 後方互換: isCrit=true が来た場合
    if(type===true) type='crit';
    if(type===false) type='normal';

    const cfg={
      normal:   {fs:'18px',sw:3,sc:1.0,toY:65, dur:1400,ease:'Cubic.easeOut',   startSc:1.0},
      crit:     {fs:'28px',sw:6,sc:0.5,toY:100,dur:2400,ease:'Back.easeOut',    startSc:0.5},
      skill:    {fs:'24px',sw:5,sc:0.8,toY:90, dur:2200,ease:'Cubic.easeOut',   startSc:0.8},
      skillcrit:{fs:'32px',sw:7,sc:0.4,toY:110,dur:2800,ease:'Back.easeOut',    startSc:0.4},
      info:     {fs:'14px',sw:2,sc:1.0,toY:40, dur:1000,ease:'Cubic.easeOut',   startSc:1.0},
    }[type]||{fs:'18px',sw:3,sc:1.0,toY:65,dur:1400,ease:'Cubic.easeOut',startSc:1.0};

    // ダメージ系はArial Bold、情報系はCourier New
    const isInfo=(type==='info');
    const fontFamily=isInfo?'Courier New':'Arial Black, Arial Bold, Arial';
    const fontStyle=isInfo?'normal':'bold';
    const t=this.add.text(x,y,txt,{
      fontSize:cfg.fs,
      fontFamily:fontFamily,
      fontStyle:fontStyle,
      color:col,
      stroke:'#000000',strokeThickness:cfg.sw,
    }).setOrigin(0.5).setDepth(32).setScale(cfg.startSc);

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
    // setTimeoutで次フレームに遷移（Phaser内部アニメの後処理が終わってから）
    const key=sceneKey,data=sceneData;
    const self=this;
    setTimeout(()=>{
      try{self.scene.start(key,data);}catch(e){console.error('transition error:',e);}
    },50);
  }

  gameOver(){
    if(this._gameOver)return;
    this._gameOver=true;
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
    // ゲームオーバー中・メニュー表示中は全処理停止
    if(this._gameOver||this._menuOpen){
      p.setVelocity(0,0);
      return;
    }
    // 詠唱中はプレイヤー停止（敵AIは動く）
    if(this._casting){
      p.setVelocity(0,0);
      return;
    }
    this.updateJoystick();
    // spaceKey攻撃はPC専用（スマホはボタンで操作）
    if(!this.sys.game.device.input.touch && Phaser.Input.Keyboard.JustDown(this.spaceKey))this.normalAttack();
    if(this.atkCooldown>0)this.atkCooldown-=dt;
    // HP/SP 自動回復（VIT/INTステータスに依存）
    if(!this._regenTimer)this._regenTimer=0;
    this._regenTimer+=dt;
    if(this._regenTimer>=1.0){ // 1秒ごとに回復
      this._regenTimer=0;
      // HP自動回復: VITポイント × 0.5/秒（最低0）
      const vitRegen=(pd.vitPts||0)*0.5;
      if(vitRegen>0&&pd.hp<pd.mhp){
        pd.hp=Math.min(pd.mhp,pd.hp+vitRegen);
        this.updateHUD();
      }
      // SP自動回復: INTポイント × 0.3/秒（最低0）
      const intRegen=(pd.intPts||0)*0.3;
      if(intRegen>0&&pd.sp<pd.msp){
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

      // 受動モンスター（passive:true）かつ未aggro → ランダム徘徊のみ
      if(ed.passive&&!ed.aggro){
        ed.wanderTimer-=dt;
        if(ed.wanderTimer<=0){
          ed.wanderTimer=Phaser.Math.FloatBetween(1.5,4.0);
          const ang=Math.random()*Math.PI*2;
          ed.wanderVx=Math.cos(ang)*ed.spd*0.2;
          ed.wanderVy=Math.sin(ang)*ed.spd*0.2;
        }
        sp.setVelocity(ed.wanderVx,ed.wanderVy);
        ed.hpBarBg.setPosition(sp.x,sp.y-sp.displayHeight/2-6);
        ed.hpBar.setPosition(sp.x-sp.displayWidth/2,sp.y-sp.displayHeight/2-6);
        return;
      }

      // 能動（passive:false）または受動でaggro済み → プレイヤーへ追跡
      const CHASE_RANGE=300;
      if(dist<CHASE_RANGE){
        const ang=Phaser.Math.Angle.Between(sp.x,sp.y,p.x,p.y);
        sp.setVelocity(Math.cos(ang)*ed.spd,Math.sin(ang)*ed.spd);
      }else{
        ed.wanderTimer-=dt;
        if(ed.wanderTimer<=0){
          ed.wanderTimer=Phaser.Math.FloatBetween(1.5,3.5);
          const ang=Math.random()*Math.PI*2;
          ed.wanderVx=Math.cos(ang)*ed.spd*0.25;
          ed.wanderVy=Math.sin(ang)*ed.spd*0.25;
        }
        sp.setVelocity(ed.wanderVx,ed.wanderVy);
      }
      // 攻撃
      ed.attackTimer-=dt;
      if(ed.attackTimer<=0&&dist<ed.rng){
        ed.attackTimer=ed.acd;
        if(pd._parry){
          this.showFloat(p.x,p.y-40,'PARRY!','#ffd700','info');
          pd._parry=false;
        }else{
          // AGI回避判定（agi%の確率で回避）
          if(Math.random()*100<(pd.agi||0)){
            this.showFloat(p.x,p.y-40,'DODGE!','#2ecc71','info');
          }else{
            const dmg=Math.max(1,ed.atk-(pd.def||0)+Phaser.Math.Between(0,3));
            pd.hp=Math.max(0,pd.hp-dmg);
            this.showFloat(p.x,p.y-40,'-'+dmg,'#e74c3c','info');this.updateHUD();
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
      // 戻るポータル（左端）
      if(this.cfg.portalBack!==null&&this.cfg.portalBack!==undefined&&
         Phaser.Math.Distance.Between(p.x,p.y,80,this.MH/2)<70){
        this._transitioning=true;
        this._doTransition('Game',{playerData:pd,stage:this.cfg.portalBack,fromPortal:'next'}); // 戻る→到着先の右端近くにスポーン
        return;
      }
      // 進むポータル（右端）
      if(this.portalNext&&this.portalNext.open&&
         Phaser.Math.Distance.Between(p.x,p.y,this.MW-80,this.MH/2)<70){
        this._transitioning=true;
        const nextScene=(!this.cfg.portalTo)?'GameClear':'Game';
        const nextData=(!this.cfg.portalTo)?{playerData:pd}:{playerData:pd,stage:this.portalNext.to,fromPortal:'back'}; // 進む→到着先の左端近くにスポーン
        this._doTransition(nextScene,nextData);
        return;
      }
    }
    if(Math.floor(time/100)!==Math.floor((time-delta)/100))this.updateMinimap();
    // 建物接近チェック（町ステージのみ）
    if(this.stage===0&&this.buildings&&!this._menuOpen&&!this._gameOver){
      let nearB=null;
      let minDist=120; // 接近判定距離
      this.buildings.forEach(b=>{
        const d=Phaser.Math.Distance.Between(p.x,p.y,b.x+b.w/2,b.y+b.h/2);
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