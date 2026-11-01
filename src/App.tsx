import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { AlarmClock, ArrowUpRight, AudioLines, Bell, BookOpen, Check, ChevronDown, CircleHelp, Clock3, CloudMoon, Flame, Focus, Goal, Headphones, Home, Menu, MoreHorizontal, Orbit, Pause, Play, Plus, Rocket, Settings2, SkipForward, Sparkles, Star, Timer, Users, X } from 'lucide-react'
import { copy } from './content'
import OrbitScene from './OrbitScene'

type View = 'home' | 'timer' | 'stations' | 'sky' | 'profile'
type Theme = 'night' | 'dawn' | 'aurora' | 'mars' | 'cloud'
type TimerKind = 'focus' | 'short' | 'long' | 'stopwatch'
type ActiveTimer = { start: number; length: number; kind: TimerKind; subject: string; topic?: string; pausedAt?: number; pausedTotal?: number }
type Session = { id: string; subject: string; topic?: string; minutes: number; date: string; startedAt: number; completed: boolean; reflection?: 'great' | 'okay' | 'hard' }
const themes: { id: Theme; label: string; color: string }[] = [{ id: 'night', label: 'Gece gökyüzü', color: '#101a2b' }, { id: 'dawn', label: 'Şafak', color: '#37213d' }, { id: 'aurora', label: 'Aurora', color: '#102e32' }, { id: 'mars', label: 'Mars çölü', color: '#44231f' }, { id: 'cloud', label: 'Gündüz bulutları', color: '#dfeef0' }]
const timeGreeting = () => { const h = new Date().getHours(); return h < 11 ? 'Günaydın' : h < 18 ? 'İyi günler' : 'İyi akşamlar' }
const todayLabel = () => new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).toLocaleUpperCase('tr-TR')
const getStored = <T,>(key: string, fallback: T): T => { try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } }
function getStreakStats(sessions: Session[]) {
  const days = new Set(sessions.map(session => new Date(session.startedAt).toDateString()))
  const ordered = [...days].map(value => new Date(value)).sort((a, b) => a.getTime() - b.getTime())
  let longest = 0, run = 0, previous = 0
  for (const date of ordered) {
    const day = new Date(date); day.setHours(0, 0, 0, 0)
    const timestamp = day.getTime()
    run = previous && Math.round((timestamp - previous) / 86400000) === 1 ? run + 1 : 1
    longest = Math.max(longest, run); previous = timestamp
  }
  const cursor = new Date(); cursor.setHours(0, 0, 0, 0)
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1)
  let current = 0
  while (days.has(cursor.toDateString())) { current++; cursor.setDate(cursor.getDate() - 1) }
  return { current, longest }
}
function fmt(seconds: number) { const m = Math.floor(Math.max(0, seconds) / 60), s = Math.max(0, seconds) % 60; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }

export default function App() {
  const [view, setView] = useState<View>('home')
  const [theme, setTheme] = useState<Theme>(() => getStored('yorunge-theme', 'night'))
  const [sessions, setSessions] = useState<Session[]>(() => getStored('yorunge-sessions', []))
  const [subject, setSubject] = useState(() => getStored('yorunge-subject', ''))
  const [topic, setTopic] = useState(() => getStored('yorunge-topic', ''))
  const [motivationIndex, setMotivationIndex] = useState(0)
  const [mode, setMode] = useState<'focus' | 'short' | 'long'>('focus')
  const [timerMode, setTimerMode] = useState<'pomodoro' | 'stopwatch'>(() => getStored('yorunge-timer-mode', 'pomodoro'))
  const [durations, setDurations] = useState(() => getStored('yorunge-durations', { focus: 25, short: 5, long: 15 }))
  const [active, setActive] = useState<ActiveTimer | null>(() => getStored<ActiveTimer | null>('yorunge-active', null))
  const [now, setNow] = useState(Date.now())
  const [toast, setToast] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showReflection, setShowReflection] = useState(false)
  const [lastSessionId, setLastSessionId] = useState<string | null>(null)
  const [sounds, setSounds] = useState(false)
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => getStored('yorunge-notifications', true))
  const audioContextRef = useRef<AudioContext | null>(null)
  const ambientSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const totalMinutes = sessions.reduce((sum, item) => sum + item.minutes, 0)
  const streakStats = useMemo(() => getStreakStats(sessions), [sessions])
  const todayMinutes = sessions.filter(x => new Date(x.startedAt).toDateString() === new Date().toDateString()).reduce((sum, x) => sum + x.minutes, 0)
  const effectiveNow = active?.pausedAt ?? now
  const elapsed = active ? Math.max(0, Math.floor((effectiveNow - active.start - (active.pausedTotal ?? 0)) / 1000)) : 0
  const secondsLeft = active ? active.kind === 'stopwatch' ? elapsed : Math.max(0, active.length * 60 - elapsed) : timerMode === 'stopwatch' ? 0 : durations[mode] * 60
  const percent = active && active.kind !== 'stopwatch' ? Math.min(100, elapsed / (active.length * 60) * 100) : 0
  const label = active ? (active.kind === 'stopwatch' ? 'Kronometre' : active.kind === 'focus' ? copy.focus : active.kind === 'short' ? copy.shortBreak : copy.longBreak) : timerMode === 'stopwatch' ? 'Kronometre' : (mode === 'focus' ? copy.focus : mode === 'short' ? copy.shortBreak : copy.longBreak)
  const weekTime = useMemo(() => {
    const labels = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
    const monday = new Date(); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    return labels.map((day, index) => {
      const date = new Date(monday); date.setDate(monday.getDate() + index)
      const value = sessions.filter(session => new Date(session.startedAt).toDateString() === date.toDateString()).reduce((sum, session) => sum + session.minutes, 0)
      return { day, value }
    })
  }, [sessions])

  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 500); return () => clearInterval(id) }, [])
  useEffect(() => { localStorage.setItem('yorunge-theme', JSON.stringify(theme)); document.documentElement.dataset.theme = theme }, [theme])
  useEffect(() => { localStorage.setItem('yorunge-timer-mode', JSON.stringify(timerMode)) }, [timerMode])
  useEffect(() => { localStorage.setItem('yorunge-durations', JSON.stringify(durations)) }, [durations])
  useEffect(() => { localStorage.setItem('yorunge-notifications', JSON.stringify(notificationsEnabled)) }, [notificationsEnabled])
  useEffect(() => { localStorage.setItem('yorunge-subject', JSON.stringify(subject)) }, [subject])
  useEffect(() => { localStorage.setItem('yorunge-topic', JSON.stringify(topic)) }, [topic])
  useEffect(() => { localStorage.setItem('yorunge-sessions', JSON.stringify(sessions)) }, [sessions])
  useEffect(() => { localStorage.setItem('yorunge-active', JSON.stringify(active)); if (active) document.title = `${fmt(secondsLeft)} · Yörünge`; else document.title = 'Yörünge — Birlikte odaklan' }, [active, secondsLeft])
  useEffect(() => { if (active && !active.pausedAt && active.kind !== 'stopwatch' && secondsLeft === 0) completeSession() }, [secondsLeft, active])
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }) }, [view])
  useEffect(() => { const id = window.setInterval(() => setMotivationIndex(index => (index + 1) % copy.motivations.length), 14000); return () => clearInterval(id) }, [])
  useEffect(() => { if (!toast) return; const id = window.setTimeout(() => setToast(''), 3200); return () => clearTimeout(id) }, [toast])
  useEffect(() => () => { ambientSourceRef.current?.stop(); void audioContextRef.current?.close() }, [])

  async function toggleAmbient() {
    if (sounds) {
      ambientSourceRef.current?.stop(); ambientSourceRef.current = null
      void audioContextRef.current?.close(); audioContextRef.current = null
      setSounds(false); setToast('Ortam sesi kapatıldı.'); return
    }
    if (!window.AudioContext) { setToast('Bu tarayıcıda Web Audio desteklenmiyor.'); return }
    try {
      const context = new window.AudioContext()
      const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate)
      const samples = buffer.getChannelData(0)
      let brown = 0
      for (let i = 0; i < samples.length; i++) { const white = Math.random() * 2 - 1; brown = (brown + .025 * white) / 1.025; samples[i] = brown * 3.5 }
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true
      const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 520
      const gain = context.createGain(); gain.gain.value = .035
      source.connect(filter); filter.connect(gain); gain.connect(context.destination); source.start()
      await context.resume(); audioContextRef.current = context; ambientSourceRef.current = source
      setSounds(true); setToast('Yumuşak uzay ambiyansı açıldı. Kulaklığın varsa daha iyi duyulur. 🌌')
    } catch { setToast('Ortam sesi başlatılamadı. Tarayıcının ses ayarlarını kontrol et.') }
  }

  function startSession(kind = mode) {
    const selected = durations[kind]
    const next = { start: Date.now(), length: selected, kind, subject: subject.trim() || 'Serbest çalışma', topic: topic.trim() || undefined }
    setActive(next); setMode(kind); setTimerMode('pomodoro')
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission()
    setToast(kind === 'focus' ? 'Yıldızın doğmaya başladı ✨' : 'Mola zamanı. Biraz nefes al 🌿')
  }
  function startStopwatch() {
    setActive({ start: Date.now(), length: 0, kind: 'stopwatch', subject: subject.trim() || 'Serbest çalışma', topic: topic.trim() || undefined }); setTimerMode('stopwatch')
    setToast('Kronometre başladı. Kendi ritminde devam et ✨')
  }
  function togglePause() {
    if (!active) return
    if (active.pausedAt) {
      setActive({ ...active, pausedTotal: (active.pausedTotal ?? 0) + Date.now() - active.pausedAt, pausedAt: undefined })
      setToast('Seansın kaldığı yerden devam ediyor ✨')
    } else {
      setActive({ ...active, pausedAt: Date.now() })
      setToast('Seans duraklatıldı. Hazır olduğunda devam edebilirsin 🌙')
    }
  }
  function completeSession() {
    if (!active) return
    const old = active
    setActive(null)
    if (old.kind === 'focus') {
      const minutes = Math.max(1, Math.round((Date.now() - old.start - (old.pausedTotal ?? 0)) / 60000))
      const id = crypto.randomUUID()
      setSessions(previous => [{ id, subject: old.subject, topic: old.topic, minutes: Math.min(minutes, old.length), date: new Date().toISOString(), startedAt: old.start, completed: true }, ...previous])
      setLastSessionId(id); setShowReflection(true)
      setToast('Seans tamamlandı. Gökyüzüne yeni bir yıldız eklendi! ✨')
      setMode('short')
    } else { setToast('Molan bitti. Hazır olduğunda yeniden başlayabilirsin.'); setMode('focus') }
    if (notificationsEnabled && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Yörünge', { body: old.kind === 'focus' ? 'Harika iş! Seansın tamamlandı ✨' : 'Molan bitti. Hazır olduğunda yeniden başlayabilirsin 🌙' })
    }
  }
  function pauseSession() {
    if (!active) return
    const remaining = secondsLeft
    if (active.kind === 'focus' || active.kind === 'stopwatch') {
      const worked = elapsed / 60
      if (worked >= 5) {
        const id = crypto.randomUUID()
        setSessions(previous => [{ id, subject: active.subject, topic: active.topic, minutes: Math.max(5, Math.floor(worked)), date: new Date().toISOString(), startedAt: active.start, completed: active.kind === 'stopwatch' || remaining === 0 }, ...previous])
        setLastSessionId(id); setShowReflection(true)
        setToast(active.kind === 'stopwatch' ? 'Kronometre seansın gökyüzüne eklendi ✨' : 'Seansın kaydedildi. Yıldızın yeniden denediğinde parlar ✨')
      } else setToast('Bu yıldız bir sonraki sefere parlar. Ne zaman istersen yeniden dene.')
    } else setToast('Seans duraklatıldı. Kendine iyi bak 🌙')
    setActive(null)
  }
  function resetTimer() { setActive(null); setToast('Zamanlayıcı sıfırlandı.') }
  function skipTimer() {
    const nextMode = active?.kind === 'focus' ? 'short' : 'focus'
    if (active?.kind === 'focus' && elapsed >= 5 * 60) pauseSession()
    else setActive(null)
    setMode(nextMode); setTimerMode('pomodoro')
    setToast(nextMode === 'short' ? 'Odak bölümünü geçtin. Biraz dinlenebilirsin 🌙' : 'Mola tamam. Hazır olduğunda yeniden başlayabilirsin ✨')
  }

  const menu: { id: View; icon: typeof Home; label: string }[] = [{ id: 'home', icon: Home, label: copy.nav.home }, { id: 'timer', icon: Timer, label: copy.nav.timer }, { id: 'stations', icon: Users, label: copy.nav.stations }, { id: 'sky', icon: Orbit, label: copy.nav.sky }, { id: 'profile', icon: Focus, label: copy.nav.profile }]
  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><span className="brand-planet"/><i/></div><span>yörünge<span className="brand-dot">.</span></span><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Menüyü kapat"><X size={18}/></button></div>
      <div className="nav-label">MENÜ</div><nav>{menu.map(item => <button key={item.id} className={`nav-item ${view === item.id ? 'selected' : ''}`} onClick={() => { setView(item.id); setMenuOpen(false) }}><item.icon size={18}/><span>{item.label}</span></button>)}</nav>
      <div className="sidebar-bottom"><div className="station-mini"><div className="station-orb">🪐</div><div><b>İstasyonlar</b><span>Arkadaşlarınla odaklan</span></div><button aria-label="İstasyona git" onClick={() => setView('stations')}><ArrowUpRight size={15}/></button></div><button className="user-mini" onClick={() => setView('profile')}><div className="avatar-self">🧑🏻‍🚀</div><div><b>Yerel profil</b><span>Bu cihazda saklanır</span></div><MoreHorizontal size={17}/></button></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Menüyü kapat" onClick={() => setMenuOpen(false)}/>}
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="menu-trigger" aria-label="Menüyü aç" onClick={() => setMenuOpen(true)}><Menu size={20}/></button><span className="breadcrumb">Çalışma alanı <span>/</span> {copy.nav[view]}</span></div><div className="top-actions"><div className="theme-select"><span className="theme-swatch" style={{ background: themes.find(t => t.id === theme)?.color }}/><select aria-label="Tema seç" value={theme} onChange={e => setTheme(e.target.value as Theme)}>{themes.map(t => <option value={t.id} key={t.id}>{t.label}</option>)}</select><ChevronDown size={13}/></div><button className="icon-button" aria-label="Bildirimler" onClick={() => setToast('Şu an yeni bir bildirimin yok ✨')}><Bell size={18}/><i className="notification-dot"/></button><div className="top-avatar">🧑🏻‍🚀</div></div></header>
      <div className="content-wrap">
        {view === 'home' && <>
          <section className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line"/> {todayLabel()}</div><h1>{timeGreeting()}, yörüngene hoş geldin <span className="wave">✦</span></h1><p className="motivation-line">{copy.motivations[motivationIndex]}</p></div><button className="help-button" onClick={() => setToast('Her odak seansı gökyüzüne yeni bir yıldız ekler. Düzenli çalıştıkça yıldızların takımyıldızlarına dönüşür ✨')}><CircleHelp size={17}/> Nasıl çalışır?</button></section>
          <section className="dashboard-grid">
            <div className="focus-card">
              <div className="card-stars" aria-hidden="true"><i/><i/><i/><i/><i/><i/><i/></div>
              <div className="focus-top"><span className="live-label"><span className="pulse-dot"/>{active ? 'SEANS DEVAM EDİYOR' : 'KENDİNE BİR ALAN AÇ'}</span><div className="timer-type-switch" aria-label="Zamanlayıcı türü"><button className={timerMode === 'pomodoro' ? 'selected' : ''} onClick={() => !active && setTimerMode('pomodoro')}>Pomodoro</button><button className={timerMode === 'stopwatch' ? 'selected' : ''} onClick={() => !active && setTimerMode('stopwatch')}>Kronometre</button></div><button className="soft-icon" aria-label="Zamanlayıcı ayarları" onClick={() => setShowSettings(true)}><Settings2 size={17}/></button></div>
              <div className="timer-layout"><div className="timer-main">{timerMode === 'pomodoro' ? <div className="timer-modes" role="tablist" aria-label="Pomodoro aşaması">{[['focus', 'Odaklan'], ['short', 'Kısa mola'], ['long', 'Uzun mola']].map(([id, text]) => <button key={id} role="tab" aria-selected={(active?.kind ?? mode) === id} className={(active?.kind ?? mode) === id ? 'current' : ''} onClick={() => { if (!active) setMode(id as typeof mode) }}>{text}</button>)}</div> : <div className="stopwatch-chip"><Clock3 size={13}/> SÜRE SINIRI YOK</div>}<div className="timer-readout"><span>{fmt(secondsLeft).split(':')[0]}</span><b>:</b><span>{fmt(secondsLeft).split(':')[1]}</span></div><div className="timer-caption">{active ? `${label}${active.pausedAt ? ' · Duraklatıldı' : ''} · ${active.subject}${active.topic ? ` · ${active.topic}` : ''}` : 'Bir sonraki yıldızın için hazır mısın?'}</div><div className="timer-ctas">{active ? <><button className="primary-button" onClick={togglePause}>{active.pausedAt ? <Play size={16} fill="currentColor"/> : <Pause size={16} fill="currentColor"/>} {active.pausedAt ? 'Devam et' : 'Duraklat'}</button><button className="soft-button" onClick={pauseSession}>Seansı bitir</button><button className="circle-ctrl" aria-label="Zamanlayıcıyı sıfırla" onClick={resetTimer}><X size={17}/></button><button className="circle-ctrl" aria-label="Aşamayı atla" onClick={skipTimer}><SkipForward size={16}/></button></> : <button className="primary-button" onClick={() => timerMode === 'stopwatch' ? startStopwatch() : startSession()}><Play size={16} fill="currentColor"/> {timerMode === 'stopwatch' ? 'Kronometreyi başlat' : mode === 'focus' ? 'Odaklanmaya başla' : 'Molayı başlat'}</button>}<button className="circle-ctrl" aria-label="Zamanlayıcı ayarları" onClick={() => setShowSettings(true)}><Settings2 size={17}/></button></div></div>
                <div className="timer-art"><svg className="orbit-rings" viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="84"/><circle cx="110" cy="110" r="65"/><circle cx="110" cy="110" r="45"/></svg><div className="timer-planet" aria-hidden="true"/><div className="orbit-moon moon-one"/><div className="orbit-moon moon-two"/><div className="art-caption"><b>{Math.floor(percent)}%</b><span>tamamlandı</span></div></div>
              </div><div className="focus-footer"><div className="study-fields"><label className="subject-pick"><BookOpen size={15}/><input aria-label="Ders veya alan" placeholder="Ders / alan" list="subject-suggestions" value={subject} disabled={Boolean(active)} onChange={e => setSubject(e.target.value)}/></label><label className="topic-pick"><input aria-label="Çalışma konusu" placeholder="Konu / not (isteğe bağlı)" value={topic} disabled={Boolean(active)} onChange={e => setTopic(e.target.value)}/></label><datalist id="subject-suggestions">{copy.subjectSuggestions.map(option => <option value={option} key={option}/>)}</datalist></div><span className="footer-divider"/><span className="focus-note"><span className="note-star">✳</span> {active ? `Başlangıç ${new Date(active.start).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` : 'Dikkatini topla, gerisini yıldızlara bırak.'}</span><button className="sound-toggle" onClick={toggleAmbient} aria-label="Ortam sesini aç/kapat"><Headphones size={15}/>{sounds ? 'Ses açık' : 'Ses'}<span className={sounds ? 'switch on' : 'switch'}><i/></span></button></div>
            </div>
            <div className="right-column"><div className="goal-card"><div className="card-heading"><div><span className="section-kicker">BUGÜNÜN ROTASI</span><h3>Günlük yakıtın</h3></div><button className="more-button" aria-label="Hedef ayrıntıları" onClick={() => setToast('Günlük hedefin 2 saat. Her dakika seni hedefine yaklaştırıyor!')}><MoreHorizontal size={19}/></button></div><div className="goal-progress"><div className="goal-ring" style={{'--progress': `${Math.min(100, todayMinutes / 120 * 100)}%`} as React.CSSProperties}><div><strong>{Math.floor(todayMinutes / 60)}<small>s</small> {todayMinutes % 60}<small>dk</small></strong></div></div><div className="goal-copy"><b>{todayMinutes >= 120 ? 'Hedefe ulaştın!' : 'İyi gidiyorsun, yörüngen aydınlanıyor'}</b><span>Günlük hedefin <strong>2 saat</strong></span><div className="goal-track"><i style={{ width: `${Math.min(100, todayMinutes / 120 * 100)}%` }}/></div><small>{Math.min(120, todayMinutes)} / 120 dk <span>·</span> {Math.round(Math.min(100, todayMinutes / 120 * 100))}%</small></div></div><div className="goal-foot"><Rocket size={14}/><span>{todayMinutes >= 120 ? 'Roket kalkışa hazır. Harikasın!' : 'Bir seans daha, roketin yörüngeye çıksın.'}</span></div></div>
              <div className="streak-card"><div className="streak-symbol"><Flame size={20} fill="currentColor"/></div><div className="streak-text"><b>{streakStats.current ? `${streakStats.current} günlük serin` : 'Serin ilk yıldızla başlar'}</b><span>{streakStats.current ? 'Yıldızların birleşiyor ✨' : 'Bugün ilk adımını atabilirsin.'}</span></div><div className="streak-days">{weekTime.map((x, i) => <div key={i} className={x.value > 0 ? 'done' : ''}><span>{x.day[0]}</span><i>{x.value > 0 ? '✦' : ''}</i></div>)}</div><button className="streak-link" onClick={() => setView('sky')}>Serini gör <ArrowUpRight size={13}/></button></div></div>
          </section>
          <section className="lower-grid"><div className="panel weekly-panel"><div className="panel-head"><div><span className="section-kicker">KÜÇÜK ADIMLAR, BÜYÜK YÖRÜNGELER</span><h2>Bu haftaki ritmin</h2></div><button className="period-select" onClick={() => setToast('Haftalık görünüm seçili.')}>Bu hafta <ChevronDown size={14}/></button></div><div className="chart-summary"><strong>{Math.floor((weekTime.reduce((sum,x)=>sum+x.value,0))/60)} sa {weekTime.reduce((sum,x)=>sum+x.value,0)%60} dk</strong><span className="trend"><ArrowUpRight size={14}/> ✦</span><small>bu hafta</small></div><div className="chart-wrap"><WeeklyChart data={weekTime} color="#82d8c9" chartId="home"/></div><div className="chart-foot"><span><i className="legend-dot"/>Odaklanma süresi</span><button onClick={() => setView('profile')}>İstatistiklerin tamamı <ArrowUpRight size={13}/></button></div></div>
            <div className="panel friends-panel"><div className="panel-head"><div><span className="section-kicker">BİRLİKTE ODAKLAN</span><h2>İstasyonun</h2></div><button className="text-link" onClick={() => setView('stations')}>İstasyonları aç <ArrowUpRight size={13}/></button></div><div className="friends-empty"><span>✦</span><b>Henüz bir istasyonun yok</b><small>Arkadaşlarınla aynı yörüngede çalışmak için istasyonlar sayfasına göz at.</small></div><div className="friends-footer"><span>Canlı arkadaş bağlantısı sonraki aşamada açılacak.</span><button onClick={() => setView('stations')} aria-label="İstasyona git"><ArrowUpRight size={15}/></button></div></div></section>
          <section className="bottom-grid"><div className="panel sky-preview"><div className="panel-head"><div><span className="section-kicker">SANA AİT KÜÇÜK BİR EVREN</span><h2>Gökyüzüm</h2></div><button className="text-link" onClick={() => setView('sky')}>Gökyüzüne git <ArrowUpRight size={13}/></button></div><Sky stars={sessions.length}/><div className="sky-foot"><span>Ders renkleri seanslar kaydedilince oluşur</span><b>{sessions.length} yıldız <span>·</span> {totalMinutes} dk ışık</b></div></div><div className="mission-card"><div className="mission-top"><span className="section-kicker">BU HAFTAKİ YÖRÜNGEN</span><span className="mission-icon">🚀</span></div><h3>Küçük adımlar,<br/><em>büyük keşifler</em></h3><div className="mission-progress"><div><span style={{width: Math.min(100,weekTime.reduce((sum,x)=>sum+x.value,0)/1200*100) + '%'}}/></div><b>{Math.floor(weekTime.reduce((sum,x)=>sum+x.value,0)/60)} <small>/ 20 saat</small></b></div><p>Bu hafta odaklandığın her dakika kendi yörüngeni aydınlatır.</p><div className="mission-avatars"><small>Kişisel çalışma rotan</small></div></div></section>
        </>}
        {view === 'timer' && <TimerPage active={active} secondsLeft={secondsLeft} mode={mode} setMode={setMode} timerMode={timerMode} setTimerMode={setTimerMode} subject={subject} setSubject={setSubject} topic={topic} setTopic={setTopic} motivation={copy.motivations[motivationIndex]} startSession={startSession} startStopwatch={startStopwatch} togglePause={togglePause} pauseSession={pauseSession} resetTimer={resetTimer} skipTimer={skipTimer} settings={() => setShowSettings(true)}/>}
        {view === 'stations' && <Stations onToast={setToast}/>}
        {view === 'sky' && <SkyPage sessions={sessions} totalMinutes={totalMinutes} currentStreak={streakStats.current}/>}
        {view === 'profile' && <Profile sessions={sessions} totalMinutes={totalMinutes} todayMinutes={todayMinutes} currentStreak={streakStats.current} longestStreak={streakStats.longest} weekly={weekTime} onToast={setToast} onSettings={()=>setShowSettings(true)}/>}
        <footer className="app-footer"><span>© 2026 Yörünge <i>✦</i> Arkadaşlar için yapıldı</span><span><button onClick={() => setToast('Yörünge verilerini bu cihazda saklar. Çevrimiçi eşitleme bu sürümde kapalıdır.')}>Gizlilik</button><button onClick={() => setShowSettings(true)}>Ayarlar</button><button onClick={() => setToast('İletişim kanalı sonraki geliştirme aşamasında eklenecek.')}>İletişim</button></span></footer>
      </div>
    </main>
    {toast && <motion.div className="toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Sparkles size={17}/>{toast}<button aria-label="Bildirimi kapat" onClick={() => setToast('')}><X size={15}/></button></motion.div>}
    {showReflection && <div className="modal-backdrop" onClick={() => setShowReflection(false)}><motion.div className="settings-modal reflection-modal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={e => e.stopPropagation()}><div className="reflection-orbit">✦</div><span className="section-kicker">YILDIZIN YANDI</span><h2>Bu seans sana nasıl geldi?</h2><p>İstersen bir dokunuşla işaretle. Bu not yalnızca bu cihazda kalır.</p><div className="reflection-choices">{[['great','✨','İyi geldi'],['okay','🌙','Fena değildi'],['hard','🌱','Biraz zordu']].map(([value,emoji,label])=><button key={value} onClick={() => { if (lastSessionId) setSessions(items => items.map(item => item.id === lastSessionId ? { ...item, reflection: value as Session['reflection'] } : item)); setShowReflection(false) }}><span>{emoji}</span>{label}</button>)}</div><button className="reflection-skip" onClick={() => setShowReflection(false)}>Şimdilik geç</button></motion.div></div>}
    {showSettings && <div className="modal-backdrop" onClick={() => setShowSettings(false)}><motion.div className="settings-modal" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} onClick={e => e.stopPropagation()}><div className="modal-head"><div><span className="section-kicker">KENDİ RİTMİNİ BUL</span><h2>Zamanlayıcı ayarları</h2></div><button className="icon-button" onClick={() => setShowSettings(false)} aria-label="Kapat"><X size={18}/></button></div><p>Odak ve mola sürelerini sana göre düzenle.</p><div className="duration-fields">{([['focus','Odaklanma'],['short','Kısa mola'],['long','Uzun mola']] as const).map(([id, name]) => <label key={id}>{name}<div><input type="number" min="1" max="180" value={durations[id]} onChange={e => setDurations(x => ({ ...x, [id]: Math.min(180, Math.max(1, Number(e.target.value) || 1)) }))}/><span>dakika</span></div></label>)}</div><label className="sound-setting"><input type="checkbox" checked={notificationsEnabled} onChange={e => { setNotificationsEnabled(e.target.checked); if (e.target.checked && 'Notification' in window && Notification.permission === 'default') void Notification.requestPermission() }}/> Seans ve mola bitince tarayıcı bildirimi göster</label><button className="primary-button full" onClick={() => { setShowSettings(false); setToast('Ayarların bu cihazda kaydedildi ✨') }}><Check size={16}/> Kaydet</button></motion.div></div>}
    <div className="mobile-nav">{menu.map(item => <button key={item.id} className={view === item.id ? 'active' : ''} aria-label={item.label} onClick={() => setView(item.id)}><item.icon size={19}/><span>{item.label}</span></button>)}</div>
    <div className="local-badge"><span/> Yerel mod · Veriler bu cihazda</div>
  </div>
}

function Sky({ stars }: { stars: number }) {
  const dots = Array.from({ length: Math.min(stars, 24) }, (_, i) => ({ x: (i * 47 + 12) % 94 + 3, y: (i * 31 + 11) % 76 + 12, size: i % 9 === 0 ? 5 : i % 4 === 0 ? 3.5 : 2.2, delay: (i % 8) * .28 }))
  return <div className="sky-canvas" aria-label={`${stars} kaydedilmiş seans yıldızlı kişisel gökyüzü`}>{dots.map((d, i) => <i key={i} className={`sky-star ${i % 7 === 0 ? 'bright' : ''}`} style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.size, height: d.size, animationDelay: `${d.delay}s` }} />)}{stars >= 3 && <svg className="constellation-lines" viewBox="0 0 500 180" preserveAspectRatio="none" aria-hidden="true"><path d="M90 113 L154 78 L202 96 L254 49 L310 66 L361 34"/><path d="M254 49 L283 102 L337 120"/></svg>}<div className="sky-core"><span>☼</span><i/></div><div className="sky-caption">KİŞİSEL GÖKYÜZÜ <span>✦ {stars}</span></div></div>
}

function WeeklyChart({ data, color, chartId }: { data: { day: string; value: number }[]; color: string; chartId: string }) {
  const max = Math.max(60, ...data.map(point => point.value))
  const points = data.map((point, index) => ({ ...point, x: 22 + index * (376 / Math.max(1, data.length - 1)), y: 91 - (point.value / max) * 67 }))
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
  const area = `${line} L ${points[points.length - 1]?.x ?? 398} 98 L ${points[0]?.x ?? 22} 98 Z`
  return <svg className="weekly-chart-svg" viewBox="0 0 420 128" role="img" aria-label="Haftalık odaklanma süresi grafiği">
    <defs><linearGradient id={`fill-${chartId}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".23"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    {[24, 48, 72, 98].map(y => <line key={y} x1="18" y1={y} x2="402" y2={y} stroke="rgba(194,211,225,.08)" strokeDasharray="3 5"/>)}
    <path d={area} fill={`url(#fill-${chartId})`}/><path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
    {points.map(point => <g key={point.day}><circle cx={point.x} cy={point.y} r="3" fill={color} stroke="#152337" strokeWidth="2"/><title>{point.day}: {point.value} dk</title><text x={point.x} y="119" textAnchor="middle" fill="#8390a4" fontSize="10">{point.day}</text></g>)}
  </svg>
}

function TimerPage({ active, secondsLeft, mode, setMode, timerMode, setTimerMode, subject, setSubject, topic, setTopic, motivation, startSession, startStopwatch, togglePause, pauseSession, resetTimer, skipTimer, settings }: {
  active: ActiveTimer | null;
  secondsLeft: number;
  mode: 'focus' | 'short' | 'long';
  setMode: (m: 'focus' | 'short' | 'long') => void;
  timerMode: 'pomodoro' | 'stopwatch';
  setTimerMode: (m: 'pomodoro' | 'stopwatch') => void;
  subject: string;
  setSubject: (s: string) => void;
  topic: string;
  setTopic: (s: string) => void;
  motivation: string;
  startSession: (m?: 'focus' | 'short' | 'long') => void;
  startStopwatch: () => void;
  togglePause: () => void;
  pauseSession: () => void;
  resetTimer: () => void;
  skipTimer: () => void;
  settings: () => void;
}) {
  const labels = { focus: 'Odaklanma', short: 'Kısa mola', long: 'Uzun mola' }
  return <section className="subpage">
    <div className="subpage-title"><span className="section-kicker">ZAMANIN SENİN</span><h1>Her şey bir nefesle başlar.</h1><p>Bir konu seç, kendine alan aç. Gerisini zamana bırak.</p></div>
    <div className="timer-page-card">
      <div className="timer-page-top"><div className="timer-type-switch" aria-label="Zamanlayıcı türü"><button className={timerMode === 'pomodoro' ? 'selected' : ''} onClick={() => !active && setTimerMode('pomodoro')}>Pomodoro</button><button className={timerMode === 'stopwatch' ? 'selected' : ''} onClick={() => !active && setTimerMode('stopwatch')}>Kronometre</button></div><button className="soft-icon" onClick={settings}><Settings2 size={18}/></button></div>
      {timerMode === 'pomodoro' && <div className="timer-modes">{(['focus', 'short', 'long'] as const).map(x => <button className={(active?.kind ?? mode) === x ? 'current' : ''} key={x} onClick={() => !active && setMode(x)}>{labels[x]}</button>)}</div>}
      <div className="large-timer"><div className="large-timer-glow"/><span>{fmt(secondsLeft).split(':')[0]}</span><i>:</i><span>{fmt(secondsLeft).split(':')[1]}</span><small>{active ? `Şu an ${active.subject}${active.topic ? ` · ${active.topic}` : ''} üzerinde çalışıyorsun` : timerMode === 'stopwatch' ? 'Serbest çalışma zamanı' : 'Dersini ve konunu seçip başla'}</small></div>
      <div className="timer-page-controls"><label className="study-input"><BookOpen size={16}/><input aria-label="Ders veya alan" placeholder="Ders / alan" list="subject-suggestions" value={subject} disabled={Boolean(active)} onChange={e => setSubject(e.target.value)}/><datalist id="subject-suggestions">{copy.subjectSuggestions.map(option => <option value={option} key={option}/>)}</datalist></label><label className="study-input"><input aria-label="Çalışma konusu" placeholder="Konu / not (isteğe bağlı)" value={topic} disabled={Boolean(active)} onChange={e => setTopic(e.target.value)}/></label>{active ? <><button className="primary-button" onClick={togglePause}>{active.pausedAt ? <Play size={17} fill="currentColor"/> : <Pause size={17}/>} {active.pausedAt ? 'Devam et' : 'Duraklat'}</button><button className="soft-button" onClick={pauseSession}>Seansı bitir</button><button className="soft-button" aria-label="Zamanlayıcıyı sıfırla" onClick={resetTimer}><X size={15}/></button><button className="soft-button" aria-label="Aşamayı atla" onClick={skipTimer}><SkipForward size={15}/></button></> : timerMode === 'stopwatch' ? <button className="primary-button" onClick={startStopwatch}><Play size={17} fill="currentColor"/> Kronometreyi başlat</button> : <button className="primary-button" onClick={() => startSession()}><Play size={17} fill="currentColor"/> Başlat</button>}</div>
    </div>
    <div className="timer-tips"><div><Sparkles size={18}/><b>Uzay notu</b><span>{motivation}</span></div><div><CloudMoon size={18}/><b>Ritmini sen belirlersin</b><span>Süre dolduğunda nazikçe haber veririz.</span></div><div><AlarmClock size={18}/><b>İstediğin an mola</b><span>Kısa bir nefes, odağını tazeler.</span></div></div>
  </section>
}

function Stations({ onToast }: { onToast:(s:string)=>void }) {
  const [friends,setFriends]=useState<{id:string;name:string;handle:string;nudgedAt?:number}[]>(()=>getStored('yorunge-local-friends',[]))
  const [messages,setMessages]=useState<Record<string,{id:string;text:string;time:number}[]>>(()=>getStored('yorunge-local-messages',{}))
  const [selectedFriend,setSelectedFriend]=useState<string|null>(null)
  const [name,setName]=useState('')
  const [handle,setHandle]=useState('')
  const [draft,setDraft]=useState('')
  useEffect(()=>{localStorage.setItem('yorunge-local-friends',JSON.stringify(friends))},[friends])
  useEffect(()=>{localStorage.setItem('yorunge-local-messages',JSON.stringify(messages))},[messages])
  function addFriend(event:React.FormEvent) {
    event.preventDefault()
    const cleanHandle=handle.trim().replace(/^@/,'').toLowerCase()
    if(!name.trim()||!cleanHandle){onToast('Bir ad ve kullanıcı adı yaz.');return}
    if(friends.some(friend=>friend.handle===cleanHandle)){onToast('Bu kullanıcı adı yerel listende zaten var.');return}
    const friend={id:crypto.randomUUID(),name:name.trim(),handle:cleanHandle}
    setFriends(previous=>[...previous,friend]);setName('');setHandle('')
    onToast('@'+cleanHandle+' bu cihazdaki arkadaş listene eklendi.')
  }
  function nudge(friendId:string) {
    setFriends(previous=>previous.map(friend=>friend.id===friendId?{...friend,nudgedAt:Date.now()}:friend))
    onToast('Dürtme yerel olarak işaretlendi; karşı tarafa bildirim gönderilmedi.')
  }
  function sendMessage(event:React.FormEvent) {
    event.preventDefault()
    if(!selectedFriend||!draft.trim())return
    const friend= friends.find(item=>item.id===selectedFriend)
    if(!friend)return
    setMessages(previous=>({...previous,[selectedFriend]:[...(previous[selectedFriend]??[]),{id:crypto.randomUUID(),text:draft.trim(),time:Date.now()}]}))
    setDraft('')
    onToast('Mesaj bu cihazda kaydedildi; karşı tarafa gönderilmedi.')
  }
  const selected=friends.find(friend=>friend.id===selectedFriend)
  return <section className="subpage">
    <div className="subpage-title station-title"><div><span className="section-kicker">BİRLİKTE ODAKLAN · YEREL PROTOTİP</span><h1>İstasyonlar <span>🪐</span></h1><p>Arkadaş listesi ve mesaj taslakları yalnızca bu tarayıcıda tutulur.</p></div></div>
    <div className="station-hero"><div className="station-universe"><div className="station-planet" aria-hidden="true"/><span className="station-orbit o1"/><span className="station-orbit o2"/></div><div className="station-summary"><span className="live-label">KENDİ YÖRÜNGENİN</span><h2>Birlikte<br/>güzel işler çıkar.</h2><p>Arkadaş ekle, dürtme bırak veya bu cihazda sohbet taslağı oluştur. Canlı gönderim için çevrimiçi sunucu bağlantısı gerekir.</p></div></div>
    <div className="social-layout">
      <div className="panel social-friends"><div className="panel-head"><div><span className="section-kicker">ARKADAŞLAR</span><h2>Yörüngedekiler</h2></div><span className="local-pill">YEREL</span></div>
        <form className="add-friend-form" onSubmit={addFriend}><label>Görünen ad<input value={name} onChange={event=>setName(event.target.value)} placeholder="Arkadaşının adı" maxLength={40}/></label><label>Kullanıcı adı<input value={handle} onChange={event=>setHandle(event.target.value)} placeholder="@kullanici" maxLength={24}/></label><button className="primary-button" type="submit"><Plus size={15}/> Arkadaş ekle</button></form>
        <div className="local-friend-list">{friends.length?friends.map(friend=><div className={'local-friend '+(selectedFriend===friend.id?'selected':'')} key={friend.id}><button className="local-friend-main" onClick={()=>setSelectedFriend(friend.id)}><span className="friend-orb">✦</span><span><b>{friend.name}</b><small>@{friend.handle}</small></span></button><button className="soft-button nudge-button" onClick={()=>nudge(friend.id)} title="Bu cihazda dürtme dene"><Bell size={14}/> Dürt{friend.nudgedAt?' ✓':''}</button><button className="soft-icon" aria-label={friend.name+' ile sohbeti aç'} onClick={()=>setSelectedFriend(friend.id)}><AudioLines size={15}/></button></div>):<div className="empty-sky"><Users size={22}/><b>Arkadaş listen boş</b><span>Bir ad ve kullanıcı adı ekleyerek bu cihazdaki sosyal akışı deneyebilirsin.</span></div>}</div>
        <p className="local-disclaimer">Buraya eklenen kişiler gerçek hesaplarla eşleşmez; dürtme ve mesajlar gönderilmez.</p>
      </div>
      <div className="panel local-chat"><div className="panel-head"><div><span className="section-kicker">SOHBET</span><h2>{selected?selected.name:'Bir sohbet seç'}</h2></div><span className="local-pill">BU CİHAZDA</span></div>
        {selected?<><div className="chat-messages">{(messages[selected.id]??[]).length?(messages[selected.id]??[]).map(message=><div className="chat-message" key={message.id}><span>{message.text}</span><small>{new Date(message.time).toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'})}</small></div>):<div className="empty-sky"><AudioLines size={22}/><b>Sohbet burada başlar</b><span>Mesajlar sadece bu tarayıcıya kaydedilir.</span></div>}</div><form className="chat-compose" onSubmit={sendMessage}><input aria-label="Mesaj yaz" value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Yerel sohbet taslağı yaz…" maxLength={500}/><button className="primary-button" type="submit" disabled={!draft.trim()}><ArrowUpRight size={16}/> Kaydet</button></form></>:<div className="empty-sky chat-prompt"><AudioLines size={24}/><b>Bir arkadaş seç</b><span>Sohbet alanı seçilen yerel kişi için açılır.</span></div>}
      </div>
    </div>
  </section>
}function SkyPage({ sessions, totalMinutes, currentStreak }: { sessions:Session[]; totalMinutes:number; currentStreak:number }) {
  const days = ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz']
  return <section className="subpage">
    <div className="subpage-title"><span className="section-kicker">EVRENİN SANA AİT</span><h1>Gökyüzüm <span>✦</span></h1><p>Her seans bir yıldız. Her gün yeni bir ışık.</p></div>
    <div className="sky-page-stats"><div><Star size={17}/><b>{sessions.length}</b><span>doğan yıldız</span></div><div><AudioLines size={17}/><b>{totalMinutes}</b><span>dakika ışık</span></div><div><Flame size={17}/><b>{currentStreak} gün</b><span>mevcut seri</span></div></div>
    <div className="sky-page-canvas"><OrbitScene sessions={sessions}/><div className="planet-card"><img className="planet-art" src="/yorunge-planet.svg" alt="Kraterli gezegen illüstrasyonu"/><div><span className="section-kicker">GEZEGENİN · 3B YÜZEY DOKUSU</span><h3>Yörünge yüzeyi</h3><p>{sessions.length ? `${sessions.length} seans yıldızı bu gökyüzünde.` : 'İlk seansını tamamladığında ilk yıldızın burada yanacak.'}</p></div></div></div>
    <div className="constellation-panel panel"><div><span className="section-kicker">TAKIMYILDIZIN</span><h2>{currentStreak >= 7 ? 'Kervan' : currentStreak >= 3 ? 'İlk yörüngen' : 'Yıldızların birikiyor'} <span>✦</span></h2><p>{currentStreak ? `${currentStreak} gündür gökyüzünde parlıyorsun.` : 'Düzenli seansların takımyıldızını oluşturacak.'}</p></div><div className="constellation-days">{days.map((x,i)=>{ const day=new Date(); day.setHours(0,0,0,0); day.setDate(day.getDate()-((day.getDay()+6)%7)+i); const lit=sessions.some(s=>new Date(s.startedAt).toDateString()===day.toDateString()); return <div className={lit?'lit':''} key={i}><span>{x}</span><i>{lit?'✦':''}</i></div> })}</div></div>
    <div className="panel recent-sessions"><div className="panel-head"><div><span className="section-kicker">SON IŞIKLAR</span><h2>Yakın zamanda</h2></div></div>{sessions.length ? sessions.slice(0,6).map(s=><div className="recent-row" key={s.id}><span className="recent-star">✦</span><div><b>{s.subject}{s.topic ? ` · ${s.topic}` : ''}</b><small>{new Date(s.startedAt).toLocaleDateString('tr-TR',{day:'numeric',month:'long'})} · {s.completed?'Seans tamamlandı':'Kısmi seans'}</small></div><strong>{s.minutes} dk</strong></div>) : <div className="empty-sky"><Sparkles size={24}/><b>İlk yıldızın için hazır mısın?</b><span>Bir odak seansı tamamladığında burada belirecek.</span></div>}</div>
  </section>
}

function Profile({ sessions, totalMinutes, todayMinutes, currentStreak, longestStreak, weekly, onToast, onSettings }: { sessions:Session[]; totalMinutes:number; todayMinutes:number; currentStreak:number; longestStreak:number; weekly:{day:string;value:number}[]; onToast:(message:string)=>void; onSettings:()=>void }) {  const [identity,setIdentity]=useState<{displayName:string;handle:string}|null>(()=>getStored('yorunge-local-identity',null))
  const [identityName,setIdentityName]=useState('')
  const [identityHandle,setIdentityHandle]=useState('')
  function saveLocalIdentity(event:React.FormEvent) {
    event.preventDefault()
    const handle=identityHandle.trim().replace(/^@/,'').toLowerCase()
    if(!identityName.trim()||!handle){onToast('Görünen ad ve kullanıcı adı gerekli.');return}
    const next={displayName:identityName.trim(),handle}
    localStorage.setItem('yorunge-local-identity',JSON.stringify(next));setIdentity(next);setIdentityName('');setIdentityHandle('')
    onToast('Profil bu cihazda oluşturuldu.')
  }
  const badges:[string,string,boolean][]=[['🌟','İlk ateşleme',sessions.length>=1],['🌙','100 dk ışık',totalMinutes>=100],['🚀','3 seans',sessions.length>=3],['✨','3 günlük seri',currentStreak>=3],['🪐','10 saat ışık',totalMinutes>=600],['☄️','Geri dönüş',false]]
  const colors=['#80d7c8','#b6a8ff','#f2b58e','#89aef0','#ef9fab']
  const subjects=Object.entries(sessions.reduce<Record<string,number>>((map,session)=>{map[session.subject]=(map[session.subject]??0)+session.minutes;return map},{})).sort((a,b)=>b[1]-a[1]).slice(0,5)
  const heat=Array.from({length:30},(_,i)=>{const date=new Date();date.setHours(0,0,0,0);date.setDate(date.getDate()-(29-i));const mins=sessions.filter(s=>new Date(s.startedAt).toDateString()===date.toDateString()).reduce((sum,s)=>sum+s.minutes,0);return mins===0?0:mins<25?1:mins<50?2:mins<90?3:4})
  const level=Math.floor(totalMinutes/120)+1
  return <section className="subpage">
    <div className="profile-banner"><div className="profile-avatar">🧑🏻‍🚀<i/></div><div className="profile-info"><span className="section-kicker">BU CİHAZDAKİ ÇALIŞMA YOLCULUĞUN</span><h1>Odak yolculuğun</h1><p>Biraz çalış, çokça hayal et ✨</p><div className="profile-title">🪐 Uzay Tozu <span>LV. {level}</span></div></div><button className="soft-button profile-edit" onClick={()=>{setIdentityName(identity?.displayName ?? '');setIdentityHandle(identity?.handle ?? '');setIdentity(null);localStorage.removeItem('yorunge-local-identity')}}>Profil bilgileri</button></div>
    <div className="panel local-identity-panel"><div><span className="section-kicker">YENİ ÜYELİK · YEREL</span><h2>'@
$form+=@'
{identity?'Profilin bu cihazda hazır':'Bu cihazda profil oluştur'}</h2><p>İsim ve kullanıcı adın yalnızca bu tarayıcıda saklanır. Parola, sunucu oturumu ve çevrimiçi üyelik bu sürümde yoktur.</p></div>{identity?<div className="identity-saved"><b>{identity.displayName}</b><span>@{identity.handle}</span><button type="button" className="soft-button" onClick={()=>{setIdentityName(identity.displayName);setIdentityHandle(identity.handle);setIdentity(null);localStorage.removeItem('yorunge-local-identity')}}>Profili değiştir</button></div>:<form className="identity-form" onSubmit={saveLocalIdentity}><label>Görünen ad<input required maxLength={40} value={identityName} onChange={event=>setIdentityName(event.target.value)} placeholder="Adın"/></label><label>Kullanıcı adı<input required maxLength={24} value={identityHandle} onChange={event=>setIdentityHandle(event.target.value)} placeholder="@kullanici"/></label><button className="primary-button" type="submit"><Plus size={15}/> Yerel profil oluştur</button></form>}</div><div className="profile-stats"><div><span>TOPLAM IŞIK</span><b>{Math.floor(totalMinutes/60)} sa {totalMinutes%60} dk</b><small><AudioLines size={13}/> her dakika · {sessions.length} seans</small></div><div><span>BUGÜN</span><b>{todayMinutes} dk</b><small><Goal size={13}/> hedef: 120 dk</small></div><div><span>MEVCUT SERİ</span><b>{currentStreak} gün</b><small><Flame size={13}/> en uzun: {longestStreak} gün</small></div><div><span>SEVİYE</span><b>{level}. Seviye</b><small><Sparkles size={13}/> {totalMinutes} ışık XP</small></div></div>
    <div className="profile-grid"><div className="panel profile-chart"><div className="panel-head"><div><span className="section-kicker">RİTMİN</span><h2>Haftalık odaklanma</h2></div><span className="period-select">Bu hafta <ChevronDown size={14}/></span></div><div className="chart-wrap"><WeeklyChart data={weekly} color="#b6a8ff" chartId="profile"/></div></div>
    <div className="panel badge-panel"><div className="panel-head"><div><span className="section-kicker">KÜÇÜK BÜYÜK BAŞARILAR</span><h2>Rozetlerin</h2></div></div><div className="badge-grid">{badges.map(([emoji,title,earned])=><div className={earned?'':'locked'} key={title}><span>{emoji}</span><b>{title}</b></div>)}</div></div>
    <div className="panel heatmap-panel"><div className="panel-head"><div><span className="section-kicker">SON 30 GÜN</span><h2>Her gün yeni bir ışık</h2></div><span className="heat-legend">Daha az <i/> <i/> <i/> <i/> Daha çok</span></div><div className="heatmap">{heat.map((level,index)=><i key={index} className={`level-${level}`}/>)}</div></div>
    <div className="panel subjects-panel"><div className="panel-head"><div><span className="section-kicker">MERAK ETTİKLERİN</span><h2>Ders dağılımı</h2></div></div>{subjects.length ? subjects.map(([name,minutes],i)=>{const percent=totalMinutes?Math.round(minutes/totalMinutes*100):0;return <div className="subject-stat" key={name}><div><i style={{background:colors[i%colors.length]}}/><b>{name}</b><span>{percent}%</span></div><div className="goal-track"><i style={{width:`${percent}%`,background:colors[i%colors.length]}}/></div></div>}) : <div className="empty-sky"><span>İlk seansından sonra ders dağılımın burada oluşur.</span></div>}</div></div>
    <div className="profile-settings-link"><button onClick={onSettings}><Settings2 size={17}/> Tercihler <ArrowUpRight size={14}/></button></div>
  </section>
}
