(() => {
  const DATA_URL = '/api/lc400'
  const STATE_KEY = 'toeic-lc400-state-v1'
  const DB_NAME = 'toeic-lc400-audio-v1'
  const STORE = 'tracks'
  const $ = id => document.getElementById(id)
  const audio = $('audio')
  let data = null
  let sectionIndex = 0
  let sentenceIndex = 0
  let timeline = []
  let currentTrackKey = ''
  let objectUrl = ''
  let pendingAutoPlay = false
  let prefetching = new Map()
  let ignoreEnded = false

  const state = loadState()
  const settings = {
    listenMode: state.listenMode || 'both',
    endMode: state.endMode || 'next',
    enRate: Number(state.enRate || 0.9),
    koRate: Number(state.koRate || 0.95),
    showKorean: state.showKorean !== false
  }

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STATE_KEY) || '{}') } catch (_) { return {} }
  }
  function saveState() {
    localStorage.setItem(STATE_KEY, JSON.stringify({
      sectionIndex, sentenceIndex,
      listenMode: settings.listenMode, endMode: settings.endMode,
      enRate: settings.enRate, koRate: settings.koRate,
      showKorean: settings.showKorean
    }))
  }
  function fmt(n) { return Number(n).toFixed(n % 1 ? 2 : 1).replace(/0$/, '0') + 'x' }
  function currentSection() { return data.sections[sectionIndex] }
  function currentSentence() { return currentSection().sentences[sentenceIndex] }

  function openDb() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  async function dbGet(key) {
    try {
      const db = await openDb(); if (!db) return null
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve(req.result || null)
        req.onerror = () => reject(req.error)
      })
    } catch (_) { return null }
  }
  async function dbPut(key, val) {
    try {
      const db = await openDb(); if (!db) return
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(val, key)
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
      })
    } catch (_) {}
  }

  function trackKey(idx) {
    return `s${idx+1}-${settings.listenMode}-en${settings.enRate}-ko${settings.koRate}-v1`
  }
  function ttsUrl(text, lang) {
    return `/api/tts?lang=${encodeURIComponent(lang)}&text=${encodeURIComponent(String(text).slice(0,190))}`
  }
  async function mapLimit(list, limit, worker) {
    const out = new Array(list.length); let cursor = 0
    const runners = Array.from({length: Math.min(limit, list.length)}, async () => {
      while (true) {
        const i = cursor++
        if (i >= list.length) return
        out[i] = await worker(list[i], i)
      }
    })
    await Promise.all(runners)
    return out
  }
  async function decode(ctx, text, lang) {
    const res = await fetch(ttsUrl(text, lang), {cache:'force-cache'})
    if (!res.ok) throw new Error(`TTS ${res.status}`)
    const buf = await res.arrayBuffer()
    return await ctx.decodeAudioData(buf.slice(0))
  }
  function encodeWav(buffer) {
    const ch = buffer.getChannelData(0), sr = buffer.sampleRate
    const arr = new ArrayBuffer(44 + ch.length * 2), v = new DataView(arr)
    const w = (o,s) => { for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)) }
    w(0,'RIFF'); v.setUint32(4,36+ch.length*2,true); w(8,'WAVE'); w(12,'fmt ')
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true)
    v.setUint32(24,sr,true); v.setUint32(28,sr*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true)
    w(36,'data'); v.setUint32(40,ch.length*2,true)
    let o=44
    for(let i=0;i<ch.length;i++,o+=2){ const s=Math.max(-1,Math.min(1,ch[i])); v.setInt16(o,s<0?s*0x8000:s*0x7fff,true) }
    return new Blob([arr],{type:'audio/wav'})
  }

  async function buildTrack(idx, showProgress = true) {
    const key = trackKey(idx)
    const cached = await dbGet(key)
    if (cached?.blob && cached?.timeline) return {...cached,key}
    if (prefetching.has(key)) return prefetching.get(key)

    const task = (async () => {
      const AudioCtx = window.AudioContext || window.webkitAudioContext
      const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext
      if (!AudioCtx || !OfflineCtx) throw new Error('audio unsupported')
      const ctx = new AudioCtx()
      try {
        const list = data.sections[idx].sentences
        let completed = 0
        if (showProgress) setBuildUi(true, 2)
        const clips = await mapLimit(list, 5, async item => {
          const enP = decode(ctx,item.en,'en-US')
          const koP = settings.listenMode === 'both' ? decode(ctx,item.ko,'ko-KR') : Promise.resolve(null)
          const [en,ko] = await Promise.all([enP,koP])
          completed++
          if (showProgress) setBuildUi(true, Math.round(completed/list.length*70))
          return {en,ko}
        })
        const gap1=.20, gap2=.55, entries=[]
        let total=0
        clips.forEach((c,i)=>{
          const start=total
          total += c.en.duration/Math.max(.7,settings.enRate)
          if(c.ko){ total += gap1 + c.ko.duration/Math.max(.75,settings.koRate) }
          total += gap2
          entries.push({index:i,start,end:total})
        })
        const sr=24000
        const off=new OfflineCtx(1,Math.max(1,Math.ceil(total*sr)),sr)
        let cur=0
        clips.forEach(c=>{
          const en=off.createBufferSource(); en.buffer=c.en; en.playbackRate.value=Math.max(.7,settings.enRate); en.connect(off.destination); en.start(cur)
          cur += c.en.duration/Math.max(.7,settings.enRate)
          if(c.ko){
            cur += gap1
            const ko=off.createBufferSource(); ko.buffer=c.ko; ko.playbackRate.value=Math.max(.75,settings.koRate); ko.connect(off.destination); ko.start(cur)
            cur += c.ko.duration/Math.max(.75,settings.koRate)
          }
          cur += gap2
        })
        if(showProgress) setBuildUi(true,82)
        const rendered=await off.startRendering()
        if(showProgress) setBuildUi(true,94)
        const value={blob:encodeWav(rendered),timeline:entries,section:idx,createdAt:Date.now()}
        await dbPut(key,value)
        if(showProgress) setBuildUi(false,100)
        return {...value,key}
      } finally {
        try{await ctx.close()}catch(_){}
      }
    })()
    prefetching.set(key,task)
    try { return await task } finally { prefetching.delete(key) }
  }

  function setBuildUi(show,pct=0){
    $('buildWrap').hidden=!show
    $('buildPercent').textContent=`${pct}%`
    $('buildBar').style.width=`${pct}%`
    $('statusText').textContent=show?'오디오 준비 중':'재생 준비 완료'
  }

  function attachTrack(track, keepSentence = true) {
    ignoreEnded = true
    audio.pause()
    if(objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl=URL.createObjectURL(track.blob)
    currentTrackKey=track.key
    timeline=track.timeline
    audio.src=objectUrl
    audio.load()
    const target = keepSentence ? timeline.find(x=>x.index===sentenceIndex) : timeline[0]
    const setPos=()=>{ if(target) audio.currentTime=target.start; ignoreEnded=false }
    if(audio.readyState>=1) setPos()
    else audio.addEventListener('loadedmetadata',setPos,{once:true})
  }

  async function ensureTrack(autoPlay=false){
    const key=trackKey(sectionIndex)
    if(currentTrackKey===key && timeline.length){ if(autoPlay) return playAudio(); return true }
    pendingAutoPlay=autoPlay
    try{
      const tr=await buildTrack(sectionIndex,true)
      attachTrack(tr,true)
      $('statusText').textContent='재생 준비 완료'
      if(pendingAutoPlay){ pendingAutoPlay=false; await playAudio() }
      return true
    }catch(e){
      console.error(e); pendingAutoPlay=false; setBuildUi(false,0)
      $('statusText').textContent='오디오 준비 실패'
      $('prepareBtn').hidden=false
      return false
    }
  }

  async function playAudio(){
    configureMediaSession()
    try{
      await audio.play()
      setPlayUi(true)
      $('statusText').textContent='자동 듣기 중'
      prefetchNext()
    }catch(e){
      console.error(e); $('statusText').textContent='재생 버튼을 다시 눌러주세요'
    }
  }
  async function togglePlay(){
    if(!audio.paused){ audio.pause(); return }
    if(currentTrackKey===trackKey(sectionIndex) && timeline.length) return playAudio()
    await ensureTrack(true)
  }
  function setPlayUi(on){
    $('playIcon').hidden=on; $('pauseIcon').hidden=!on
    $('playBtn').setAttribute('aria-label',on?'일시정지':'자동 듣기 시작')
  }

  function seekSentence(idx, shouldPlay = !audio.paused){
    if(idx<0){ changeSection(sectionIndex-1,shouldPlay); return }
    if(idx>9){ changeSection(sectionIndex+1,shouldPlay); return }
    sentenceIndex=idx
    renderSentence()
    const point=timeline.find(x=>x.index===sentenceIndex)
    if(currentTrackKey===trackKey(sectionIndex)&&point){
      audio.currentTime=point.start
      if(shouldPlay) playAudio()
    } else ensureTrack(shouldPlay)
    saveState()
  }

  async function changeSection(idx, shouldPlay=false){
    const wasPlaying=shouldPlay || !audio.paused
    audio.pause(); setPlayUi(false)
    sectionIndex=(idx+data.sections.length)%data.sections.length
    sentenceIndex=0; timeline=[]; currentTrackKey=''
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=''}
    audio.removeAttribute('src'); audio.load()
    renderSection(); saveState()
    setTimeout(()=>ensureTrack(wasPlaying),60)
  }

  async function handleEnded(){
    if(ignoreEnded) return
    setPlayUi(false)
    if(settings.endMode==='repeat'){
      sentenceIndex=0; renderSentence(); audio.currentTime=0; await playAudio(); return
    }
    await changeSection(sectionIndex+1,true)
  }

  function prefetchNext(){
    if(settings.endMode!=='next') return
    const next=(sectionIndex+1)%data.sections.length
    const key=trackKey(next)
    if(prefetching.has(key)) return
    setTimeout(()=>buildTrack(next,false).catch(()=>{}),700)
  }

  function configureMediaSession(){
    if(!('mediaSession' in navigator)) return
    const s=currentSentence()
    try{
      navigator.mediaSession.metadata=new MediaMetadata({
        title:s.en, artist:s.ko, album:`TOEIC LC 400 · 구간 ${sectionIndex+1} ${currentSection().title}`
      })
    }catch(_){}
    const set=(n,fn)=>{try{navigator.mediaSession.setActionHandler(n,fn)}catch(_){}}
    set('play',()=>playAudio()); set('pause',()=>audio.pause())
    set('nexttrack',()=>seekSentence(sentenceIndex+1,true)); set('previoustrack',()=>seekSentence(sentenceIndex-1,true))
    set('seekforward',d=>audio.currentTime=Math.min(audio.duration||Infinity,audio.currentTime+(d.seekOffset||10)))
    set('seekbackward',d=>audio.currentTime=Math.max(0,audio.currentTime-(d.seekOffset||10)))
  }

  function renderSection(){
    const sec=currentSection()
    $('sectionTitle').textContent=`${sec.section}. ${sec.title}`
    $('sectionSelect').value=String(sectionIndex)
    renderSentence()
    renderList()
  }
  function renderSentence(){
    const s=currentSentence()
    $('englishText').textContent=s.en
    $('koreanText').textContent=s.ko
    $('koreanText').classList.toggle('hidden',!settings.showKorean)
    $('sentenceNo').textContent=`${sentenceIndex+1} / 10`
    $('globalNo').textContent=s.id
    $('progressBar').style.width=`${((sentenceIndex+1)/10)*100}%`
    document.querySelectorAll('.sentence-item').forEach((el,i)=>el.classList.toggle('active',i===sentenceIndex))
    configureMediaSession(); saveState()
  }
  function renderList(){
    const box=$('sentenceList'); box.innerHTML=''
    currentSection().sentences.forEach((s,i)=>{
      const b=document.createElement('button'); b.className='sentence-item'+(i===sentenceIndex?' active':'')
      b.innerHTML=`<span class="num">${i+1}</span><span><b></b><small></small></span>`
      b.querySelector('b').textContent=s.en; b.querySelector('small').textContent=s.ko
      b.addEventListener('click',()=>seekSentence(i,false)); box.appendChild(b)
    })
  }

  function speakOne(){
    const s=currentSentence()
    if(!('speechSynthesis'in window)) return
    speechSynthesis.cancel()
    const en=new SpeechSynthesisUtterance(s.en); en.lang='en-US'; en.rate=settings.enRate
    if(settings.listenMode==='both'){
      en.onend=()=>{ const ko=new SpeechSynthesisUtterance(s.ko); ko.lang='ko-KR'; ko.rate=settings.koRate; speechSynthesis.speak(ko) }
    }
    speechSynthesis.speak(en)
  }

  function wire(){
    $('playBtn').addEventListener('click',togglePlay)
    $('prepareBtn').addEventListener('click',()=>{ $('prepareBtn').hidden=true; ensureTrack(false) })
    $('backSentence').addEventListener('click',()=>seekSentence(sentenceIndex-1,!audio.paused))
    $('nextSentence').addEventListener('click',()=>seekSentence(sentenceIndex+1,!audio.paused))
    $('prevSection').addEventListener('click',()=>changeSection(sectionIndex-1,!audio.paused))
    $('nextSection').addEventListener('click',()=>changeSection(sectionIndex+1,!audio.paused))
    $('sectionSelect').addEventListener('change',e=>changeSection(Number(e.target.value),!audio.paused))
    $('sectionPickerBtn').addEventListener('click',()=>{ try{$('sectionSelect').showPicker()}catch(_){$('sectionSelect').focus()} })
    $('speakOne').addEventListener('click',speakOne)
    $('listenMode').addEventListener('change',e=>{settings.listenMode=e.target.value; invalidateTrack()})
    $('endMode').addEventListener('change',e=>{settings.endMode=e.target.value; saveState(); if(!audio.paused)prefetchNext()})
    $('enRate').addEventListener('input',e=>{$('enRateText').textContent=fmt(Number(e.target.value))})
    $('koRate').addEventListener('input',e=>{$('koRateText').textContent=fmt(Number(e.target.value))})
    $('enRate').addEventListener('change',e=>{settings.enRate=Number(e.target.value);invalidateTrack()})
    $('koRate').addEventListener('change',e=>{settings.koRate=Number(e.target.value);invalidateTrack()})
    $('showKorean').addEventListener('change',e=>{settings.showKorean=e.target.checked;renderSentence()})
    audio.addEventListener('play',()=>setPlayUi(true))
    audio.addEventListener('pause',()=>setPlayUi(false))
    audio.addEventListener('ended',handleEnded)
    audio.addEventListener('timeupdate',()=>{
      if(!timeline.length)return
      const p=timeline.find(x=>audio.currentTime>=x.start&&audio.currentTime<x.end)||timeline[timeline.length-1]
      if(p&&p.index!==sentenceIndex){sentenceIndex=p.index;renderSentence()}
      try{
        if('mediaSession'in navigator && Number.isFinite(audio.duration)&&audio.duration>0)
          navigator.mediaSession.setPositionState({duration:audio.duration,playbackRate:1,position:Math.min(audio.currentTime,audio.duration)})
      }catch(_){}
    })
  }

  function invalidateTrack(){
    const was=!audio.paused
    audio.pause(); timeline=[]; currentTrackKey=''
    if(objectUrl){URL.revokeObjectURL(objectUrl);objectUrl=''}
    audio.removeAttribute('src'); audio.load(); saveState()
    setTimeout(()=>ensureTrack(was),80)
  }

  async function init(){
    const res=await fetch(DATA_URL,{cache:'force-cache'})
    if(!res.ok) throw new Error('data load failed')
    data=await res.json()
    if(data.total!==400||data.sections.length!==40) throw new Error('data validation failed')
    sectionIndex=Math.max(0,Math.min(39,Number(state.sectionIndex||0)))
    sentenceIndex=Math.max(0,Math.min(9,Number(state.sentenceIndex||0)))
    data.sections.forEach((s,i)=>{
      const o=document.createElement('option');o.value=String(i);o.textContent=`${s.section}. ${s.title}`;$('sectionSelect').appendChild(o)
    })
    $('listenMode').value=settings.listenMode;$('endMode').value=settings.endMode
    $('enRate').value=String(settings.enRate);$('koRate').value=String(settings.koRate)
    $('enRateText').textContent=fmt(settings.enRate);$('koRateText').textContent=fmt(settings.koRate)
    $('showKorean').checked=settings.showKorean
    wire();renderSection();setPlayUi(false)
    $('statusText').textContent='오디오 미리 준비 중'
    setTimeout(()=>ensureTrack(false),250)
  }
  init().catch(e=>{console.error(e);$('statusText').textContent='문장 데이터를 불러오지 못했습니다.'})
})()