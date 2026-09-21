import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, Clock, ClipboardList, Copy, Eye, EyeOff, History, LogOut, Monitor, Pencil, Plus, RotateCcw, Smartphone, Trophy, X, Trash2, LockKeyhole, UnlockKeyhole, Users } from 'lucide-react'
import LineChart from './components/LineChart.jsx'
import { auditRoleLabel, describeAuditEntry, formatTimestamp } from './lib/audit.js'
import PieChart from './components/PieChart.jsx'
import { GAME_TYPES, gameTypeLabel, gameTypeRules, gameTypeSymbol, levelsOf, listProgressionChart, listScaleOptions, matadorsLabel, outcomeLabel, playerProgressChart, PROGRESS_SCALES, roundAccounts, scaleStep, shortDate, standingsProgressChart, withLevelChain, withStep } from './lib/skat.js'
import { setDesktopOverride, useMobile } from './lib/useMedia.js'
import './styles.css'

// Die Basis-URL der API lässt sich beim Bauen überschreiben (`VITE_API_BASE`), damit
// ein Handy im WLAN gegen einen lokalen Server testen kann – sonst bleibt es die
// ausgelieferte Adresse.
const API = import.meta.env.VITE_API_BASE ?? 'https://skatis.online/api'

// Am Handy zeigt das Board die schmale Fassung: Tab-Leiste statt langer Seite,
// Karten statt breiter Tabellen. „Desktop-Ansicht“ setzt stattdessen eine feste
// Layout-Breite – dadurch greifen die Handy-Media-Queries nicht mehr, und
// `useMobile()` meldet von selbst wieder „Desktop“. Die Wahl übersteht ein Neuladen.
const DESKTOP_MODE_KEY = 'skatis-desktop-mode'
const VIEWPORT_MOBILE = 'width=device-width, initial-scale=1.0, viewport-fit=cover'
const VIEWPORT_DESKTOP = 'width=1024'

/** Ist die breite Ansicht festgesetzt? */
function desktopModeStored() {
  try { return localStorage.getItem(DESKTOP_MODE_KEY) === '1' } catch { return false }
}

/** Breite, Marker und `useMobile()` setzen – so schaltet die Ansicht wirklich um. */
function applyDesktopMode(on) {
  const viewport = document.querySelector('meta[name="viewport"]')
  if (viewport) viewport.setAttribute('content', on ? VIEWPORT_DESKTOP : VIEWPORT_MOBILE)
  document.documentElement.classList.toggle('desktop-mode', on)
  setDesktopOverride(on)
}

/** Umschalten und die Wahl merken. */
function setDesktopMode(on) {
  applyDesktopMode(on)
  try { localStorage.setItem(DESKTOP_MODE_KEY, on ? '1' : '0') } catch { /* ohne Speicher gilt sie nur für diese Seite */ }
}

// Vor dem ersten Rendern anwenden, damit die Ansicht nicht kurz umspringt.
applyDesktopMode(desktopModeStored())

const today = new Date().toISOString().slice(0, 10)
const weekdays = [['1', 'Montag'], ['2', 'Dienstag'], ['3', 'Mittwoch'], ['4', 'Donnerstag'], ['5', 'Freitag'], ['6', 'Samstag'], ['7', 'Sonntag']]

/** "1" → "Montag" – die Tage, an denen ein Turnier gespielt wird. */
function weekdayLabel(day) {
  return weekdays.find(([value]) => Number(value) === Number(day))?.[1] ?? ''
}

/** Das Datum von `now` in der Zeitzone des Geräts – "2026-09-23". */
function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** "17:30" – die Uhrzeit von `now`. */
function clockTime(now = new Date()) {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/** Die optionale Spielzeit („von“–„bis“) dieses Tages – `null`, wenn keine gesetzt ist. */
function matchdayWindow(tournament, isoDate) {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay() || 7
  const window = tournament?.matchdayWindows?.[weekday]
  return window?.from && window?.to ? window : null
}

/**
 * Wo steht ein Tag mit Spielzeit? `'before'` vor dem „von“, `'over'` nach dem
 * „bis“, sonst `null`. Nur ein Hinweis fürs Formular – die Regeln entscheidet
 * der Server.
 */
function windowState(tournament, isoDate, now = new Date()) {
  const window = matchdayWindow(tournament, isoDate)
  if (!window || isoDate !== localToday(now)) return null

  const time = clockTime(now)
  if (time < window.from) return 'before'
  if (time >= window.to) return 'over'
  return null
}

/** "18:30" – eine vollständige Uhrzeit im 24-Stunden-Format. */
function isClockTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '')
}

/**
 * Die Spielzeiten der gewählten Tage einsammeln: je Tag entweder beide Zeiten
 * oder keine – und die Bis-Zeit muss nach der Von-Zeit liegen. Liefert die
 * fertige Map oder die Fehlermeldung fürs Formular.
 */
function windowsFrom(matchdays, windows) {
  const collected = {}
  for (const day of matchdays) {
    const window = windows?.[day]
    if (!window || (!window.from && !window.to)) continue
    if (!isClockTime(window.from) || !isClockTime(window.to)) {
      return { error: `Für ${weekdayLabel(day)} bitte Von- und Bis-Zeit als HH:MM angeben.` }
    }
    if (window.from >= window.to) {
      return { error: `Bei ${weekdayLabel(day)} muss die Bis-Zeit nach der Von-Zeit liegen.` }
    }
    collected[day] = { from: window.from, to: window.to }
  }
  return { windows: collected }
}

/** Punkte mit Vorzeichen – `+170`, `−98`, `0`. */
function signedValue(value) {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}

/**
 * Wird aufgerufen, wenn der Server ein Token ablehnt: abgelaufen oder durch einen
 * Passwortwechsel ungültig. `App` hängt dort das Abmelden ein – so landet jede
 * Anfrage, die ein totes Token benutzt, auf der Anmeldeseite statt in einem Fehler.
 * Der Handler bekommt das abgelehnte Token mit: nur wenn es noch die aktuelle
 * Sitzung ist, wird wirklich abgemeldet.
 */
let sessionExpiredHandler = null

async function request(path, options = {}) {
  const { token, body, skipSessionExpiry = false, withMeta = false, ...init } = options
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...init,
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = response.status === 204 ? null : await response.json()
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'Die Anfrage konnte nicht verarbeitet werden.')
    // Beim Anmelden selbst bedeutet 401 nur „falsches Passwort“ – dort darf die
    // Sitzungs-Meldung nicht dazwischenfunken. Sonst ist ein 401 der Beweis,
    // dass dieses Token nicht mehr gilt: Der Fehler wird als Sitzungs-Ablehnung
    // markiert, damit sein Text nirgends als Meldung stehen bleibt – er gehört
    // zur alten Sitzung und würde sonst noch nach dem nächsten Anmelden als
    // „token ungültig“-Meldung auf einem funktionierenden Board kleben.
    if (response.status === 401 && !skipSessionExpiry) {
      error.sessionRejected = true
      sessionExpiredHandler?.(token)
    }
    // Der Status macht Fehler für Aufrufer unterscheidbar (z. B. eine inzwischen
    // gelöschte Liste beim Zurückgehen).
    error.status = response.status
    throw error
  }
  return withMeta ? payload : payload?.data
}

/**
 * Die Meldung, die ein Aufrufer anzeigen soll – leer für eine abgelehnte Sitzung:
 * die Abmeldung samt Hinweis auf der Anmeldeseite erledigt schon der
 * `sessionExpiredHandler`, ein zweiter Text wäre nur eine Karteileiche.
 */
function errorNotice(error) {
  return error?.sessionRejected ? '' : error?.message ?? ''
}

const initialGame = { passedOut: false, declarer: '', gameType: '', hand: false, schneiderAnnounced: false, schwarzAnnounced: false, offen: false, matadors: { suit: 'WITH', count: 1 }, schneider: false, schwarz: false, won: true, note: '' }
// Die Stufen bauen aufeinander auf: erst wird angesagt, dann gespielt (siehe
// `withLevelChain`). Ein höherer Schritt holt die darunterliegenden mit.
const ANNOUNCED_CHAIN = ['hand', 'schneiderAnnounced', 'schwarzAnnounced', 'offen']
const PLAYED_CHAIN = ['schneider', 'schwarz']
/** Spielarten des Wizards – Beschriftung und Symbol; die Grundwerte kommen aus `/rules`. */
const gameTypes = GAME_TYPES

/** Die drei Spielart-Gruppen: Beschriftung und Farbe für das Kuchendiagramm. */
const GAME_TYPE_GROUPS = {
  SUIT: { label: 'Farbspiel', color: '#527b78' },
  GRAND: { label: 'Grand', color: '#db6f40' },
  NULL: { label: 'Null', color: '#7d6a9c' },
}

/**
 * Die Regeln des Spiels (`GET /rules`) sind für alle Turniere gleich und werden
 * deshalb einmal je Sitzung geholt: Grundwerte, die Null-Werte und die Größe
 * einer Liste zeigt das Board damit so, wie der Server sie rechnet.
 */
let rulesCache = null
let rulesRequest = null

function loadRules() {
  if (rulesCache) return Promise.resolve(rulesCache)
  if (!rulesRequest) {
    rulesRequest = request('/rules')
      .then((value) => { rulesCache = value; return value })
      .catch((error) => { rulesRequest = null; throw error })
  }
  return rulesRequest
}

/** Die Regeln fürs Anzeigen – `null`, solange sie geladen werden. */
function useRules() {
  const [rules, setRules] = useState(rulesCache)
  useEffect(() => {
    if (rules) return undefined
    let active = true
    loadRules().then((value) => { if (active) setRules(value) }).catch(() => {})
    return () => { active = false }
  }, [rules])
  return rules
}

/**
 * Zählt eine Zahl kurz hoch, wenn sie sich ändert – 400 ms, weich auslaufend. Bei
 * `prefers-reduced-motion` steht der Endwert sofort da, und auch negative Werte
 * laufen in die richtige Richtung.
 */
function useCountUp(value, duration = 400) {
  const [shown, setShown] = useState(value)
  const from = React.useRef(value)

  useEffect(() => {
    if (typeof value !== 'number' || !Number.isFinite(value)) { setShown(value); return undefined }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce || from.current === value) { setShown(value); from.current = value; return undefined }

    const begin = from.current
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 3
      setShown(Math.round((begin + (value - begin) * eased) * 10) / 10)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else from.current = value
    })
    return () => cancelAnimationFrame(frame)
  }, [value, duration])

  return shown
}

/** Die Zahl als Text – überall dort, wo eine Kennzahl im Vordergrund steht. */
function CountUp({ value }) {
  return <>{useCountUp(value)}</>
}

/** Platzhalter, solange Daten unterwegs sind – statt „wird geladen …“. */
function Skeleton({ lines = 3 }) {
  return <div className="skeleton-block">{Array.from({ length: lines }, (_, index) => <span key={index} className="skeleton" style={{ width: `${100 - index * 14}%` }} />)}</div>
}

/** Escape schließt ein Overlay – am Desktop die Tastatur, am Handy die Geste daneben. */
function useEscape(onClose) {
  useEffect(() => {
    function handler(event) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])
}

/**
 * Sperrt das Scrollen der Seite, solange ein Blatt offen ist – sonst scrollt auf dem
 * Handy der Inhalt dahinter, während man im Blatt liest.
 */
function useScrollLock() {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])
}

/** Zählt die Historie-Einträge offener Blätter, damit sie unterscheidbar bleiben. */
let overlayKey = 0

/**
 * Der Zurück-Knopf des Browsers soll ein offenes Blatt schließen, statt die Seite
 * zu verlassen: Solange das Blatt offen ist, gehört ihm ein Eintrag der Historie.
 * Wird es in der App geschlossen, räumt ein Aufräumschritt den Eintrag wieder weg –
 * aber nur, wenn er noch der eigene ist (erst etwas später prüfen: beim Wechsel von
 * den Spieldetails in den Bearbeiten-Dialog liegt schon dessen Eintrag oben).
 *
 * Verschachtelte Blätter bekommen eigene Schlüssel: Wer beim Zurückgehen auf
 * seinem eigenen Eintrag landet, bleibt offen; alle darüber schließen sich.
 */
function useBackToClose(onClose) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const key = `overlay-${(overlayKey += 1)}`
    window.history.pushState({ skatis: { screen: 'overlay', key } }, '')
    function onPop(event) {
      if (event.state?.skatis?.key === key) return
      close.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      setTimeout(() => {
        if (window.history.state?.skatis?.key === key) window.history.back()
      }, 0)
    }
  }, [])
}

/**
 * Eine Rückfrage als kleines Blatt: `window.confirm` sieht auf dem Handy fremd aus
 * und lässt sich nicht gestalten. Aufbau und Verhalten sind wie bei den anderen
 * Overlays – Tippen daneben oder Escape bricht ab.
 */
function ConfirmSheet({ title, text, confirmLabel = 'Löschen', onConfirm, onCancel }) {
  useEscape(onCancel)
  useBackToClose(onCancel)
  useScrollLock()
  return <div className="modal-backdrop" onClick={onCancel}>
    <div className="modal confirm-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
      <span className="eyebrow">Rückfrage</span>
      <h2>{title}</h2>
      <p className="modal-copy">{text}</p>
      <div className="modal-actions">
        <button className="secondary-button" onClick={onCancel}>Abbrechen</button>
        <button className="primary-button danger" onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </div>
  </div>
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('skatis-token'))
  const [role, setRole] = useState(localStorage.getItem('skatis-role'))
  const [tournament, setTournament] = useState(() => {
    const stored = localStorage.getItem('skatis-tournament')
    return stored ? JSON.parse(stored) : null
  })
  const [lists, setLists] = useState([])
  const [selectedList, setSelectedList] = useState(null)
  const [view, setView] = useState(token ? 'dashboard' : 'login')
  const [notice, setNotice] = useState('')
  // Grund, warum jemand wieder auf der Anmeldeseite steht (z. B. Passwortwechsel).
  const [loginNotice, setLoginNotice] = useState('')

  async function login(id, password) {
    const session = await request(`/tournaments/${id.trim()}/session`, { method: 'POST', body: { password }, skipSessionExpiry: true })
    localStorage.setItem('skatis-token', session.token)
    localStorage.setItem('skatis-tournament', JSON.stringify(session.tournament))
    localStorage.setItem('skatis-role', session.role)
    // Meldungen der letzten Sitzung gehören nicht auf das frische Board – sonst
    // stünde hier nach dem Anmelden noch ein „Token ungültig“ der alten.
    setLoginNotice('')
    setNotice('')
    setToken(session.token)
    setRole(session.role)
    setTournament(session.tournament)
    setView('dashboard')
    // Die Sitzung beginnt auf einem eigenen Historie-Eintrag, damit „Zurück“ die
    // Seite nicht verlässt.
    ensureBaseEntry()
  }

  async function createTournament(payload) {
    const created = await request('/tournaments', { method: 'POST', body: payload })
    await login(created.id, payload.adminPassword)
  }

  async function refreshLists() {
    if (!token || !tournament?.id) return
    const result = await request(`/tournaments/${tournament.id}/lists?limit=100`, { token })
    setLists(result || [])
    setNotice('')
  }

  async function openList(list) {
    const detail = await request(`/tournaments/${tournament.id}/lists/${list.id}`, { token })
    setSelectedList(detail)
    setView('list')
    // Der Schritt in die Liste gehört der Historie: „Zurück“ kommt hierher zurück.
    window.history.pushState({ skatis: { screen: 'list', listId: list.id } }, '')
  }

  // Die Browser-Historie führt durch die App: Jeder Schritt nach „tiefer“ legt einen
  // Eintrag an, der Zurück-Knopf nimmt ihn wieder weg – statt die Seite zu verlassen.
  // Die Einträge tragen nur, was sie brauchen: Eine Liste wird über ihre id neu
  // geladen, wenn sie nicht mehr im Zustand liegt.
  const navRef = useRef({ view: 'dashboard', listId: null })
  navRef.current = { view, listId: selectedList?.id ?? null }

  /**
   * Eine Liste aus einem Historie-Eintrag öffnen. Ist sie inzwischen gelöscht, geht
   * es still zurück zur Übersicht – eine Fehlermeldung wäre hier nur Verwirrung.
   */
  async function openListFromHistory(listId) {
    if (navRef.current.view === 'list' && navRef.current.listId === listId) return
    try {
      const detail = await request(`/tournaments/${tournament.id}/lists/${listId}`, { token })
      setSelectedList(detail)
      setView('list')
    } catch (error) {
      if (error?.status !== 404) setNotice(errorNotice(error))
      window.history.replaceState({ skatis: { screen: 'dashboard' } }, '')
      setView('dashboard')
    }
  }

  // Zurück und Vorwärts des Browsers führen durch die Ansichten der App. Einträge
  // offener Blätter regeln sich selbst (siehe `useBackToClose`) und werden hier
  // übersprungen – sie sind nur ein Zwischenstand.
  useEffect(() => {
    function onPop(event) {
      let screen = event.state?.skatis
      // Das ist der Eintrag der geladenen Seite selbst: Von ihm aus würde „Zurück“
      // zur zuletzt besuchten Website führen. Mit laufender Sitzung wird er sofort
      // wieder aufgefangen – die App bleibt auf ihrem eigenen Eintrag stehen.
      if (!screen) {
        if (!token) return
        screen = { screen: 'dashboard' }
        window.history.pushState({ skatis: screen }, '')
      }
      if (screen.screen === 'overlay') return
      if (screen.screen === 'list' && screen.listId) {
        openListFromHistory(screen.listId).catch(() => {})
        return
      }
      if (navRef.current.view !== 'dashboard') setView('dashboard')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [token, tournament?.id])

  /**
   * Liegt unter der App der Eintrag der geladenen Seite, führt „Zurück“ aus der
   * Website heraus. Deshalb gehört der App immer ein eigener Eintrag über ihm –
   * beim Anmelden und nach jedem Neuladen wird er sichergestellt.
   */
  function ensureBaseEntry() {
    if (!window.history.state?.skatis) window.history.pushState({ skatis: { screen: 'dashboard' } }, '')
  }

  // Nach einem Neuladen steht die Ansicht des Eintrags wieder da, statt auf der
  // Übersicht zu landen.
  useEffect(() => {
    if (!token) return
    ensureBaseEntry()
    const screen = window.history.state?.skatis
    if (screen?.screen !== 'list' || !screen.listId) return
    openListFromHistory(screen.listId).catch(() => {})
  }, [])

  useEffect(() => {
    if (token && view === 'dashboard') refreshLists().catch((error) => setNotice(errorNotice(error)))
  }, [token, tournament, view])

  /**
   * Nach dem Löschen gibt es keine Liste mehr, zu der man zurückkehren könnte:
   * Der Eintrag der Liste wird zur Übersicht – so bleibt die Historie stimmig.
   */
  function leaveDeletedList() {
    window.history.replaceState({ skatis: { screen: 'dashboard' } }, '')
    setSelectedList(null)
    setView('dashboard')
  }

  function logout(message, notifyServer = true) {
    // Dem Server sagen, dass diese Sitzung beendet ist – sonst bliebe der Token bis
    // zu seinem Ablauf gültig. Der Aufruf darf das Abmelden nicht aufhalten.
    if (notifyServer && token && tournament?.id) {
      request(`/tournaments/${tournament.id}/session/logout`, { method: 'POST', token, skipSessionExpiry: true }).catch(() => {})
    }

    localStorage.removeItem('skatis-token')
    localStorage.removeItem('skatis-tournament')
    localStorage.removeItem('skatis-role')
    setToken(null); setRole(null); setTournament(null); setView('login'); setSelectedList(null)
    // Auch die Historie gehört der alten Sitzung: Der aktuelle Eintrag wird zur
    // Übersicht, damit „Zurück“ nicht in ihre Ansicht führt.
    window.history.replaceState({ skatis: { screen: 'dashboard' } }, '')
    // Meldungen der beendeten Sitzung mitnehmen wäre verwirrend – das Board ist weg.
    setNotice('')
    // Nur echte Texte sind ein Hinweis. Ein Klick-Event darf hier nicht landen – als
    // React-Kind wäre es ein Fehler und die Seite bliebe leer.
    setLoginNotice(typeof message === 'string' ? message : '')
  }

  // Ein abgelehntes Token (abgelaufen oder nach einem Passwortwechsel ungültig) führt
  // zurück zur Anmeldung – egal welche Anfrage es war. Der Server weiß in dem Fall
  // schon Bescheid, ein Logout-Aufruf wäre nur ein weiteres 401. Abgemeldet wird nur
  // die eigene, noch aktuelle Sitzung: Antworten einer längst ersetzten Sitzung
  // dürfen eine frische Anmeldung nicht wieder hinauswerfen.
  useEffect(() => {
    sessionExpiredHandler = (rejected) => {
      if (rejected && rejected === token) logout('Deine Sitzung ist beendet – bitte melde dich neu an.', false)
    }
    return () => { sessionExpiredHandler = null }
  }, [token])

  if (view === 'login') return <div className="screen"><Login onLogin={login} onCreate={createTournament} notice={loginNotice} /></div>
  if (view === 'dashboard') return <div className="screen"><Dashboard tournament={tournament} role={role} lists={lists} notice={notice} onOpenList={openList} onLogout={logout} token={token} onCreated={refreshLists} onTournamentUpdated={(updated) => { setTournament(updated); localStorage.setItem('skatis-tournament', JSON.stringify(updated)) }} /></div>
  return <div className="screen"><ListWorkspace list={selectedList} tournament={tournament} role={role} token={token} onBack={() => window.history.back()} onDeleted={leaveDeletedList} onLogout={logout} onUpdated={setSelectedList} /></div>
}

/**
 * Kopiert Text in die Zwischenablage. `navigator.clipboard` gibt es nur in einem
 * sicheren Kontext (HTTPS oder localhost); für alles andere gibt es den Rückfall
 * über ein unsichtbares Feld, damit der Knopf auch in einer Testumgebung wirkt.
 */
async function copyText(value) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(value); return true }
  } catch { /* weiter mit dem Rückfall */ }

  try {
    const field = document.createElement('textarea')
    field.value = value
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.appendChild(field)
    field.select()
    const copied = document.execCommand('copy')
    field.remove()
    return copied
  } catch { return false }
}

/**
 * Die Turnier-ID als Knopf: antippen kopiert sie und bestätigt es kurz mit
 * "Kopiert!". Die ID ist der Schlüssel zum Login – ohne sie kommt niemand in die
 * Runde –, deshalb trägt sie eine Beschriftung und das übliche Kopier-Symbol.
 */
function IdChip({ id, name, compact = false, label = 'Turnier-ID' }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 2000)
    return () => window.clearTimeout(timer)
  }, [copied])

  async function copy() {
    if (await copyText(id)) setCopied(true)
  }

  return <button type="button" className={`id-chip ${compact ? 'compact' : 'full'}${copied ? ' copied' : ''}`} onClick={copy} title={`${label} ${id} kopieren`} aria-label={`Turnier-ID ${id} kopieren`}>
    {name && <span className="id-chip-name">{name}</span>}
    <span className="id-chip-label" aria-live="polite">{copied ? 'Kopiert!' : label}</span>
    <strong className="id-chip-value">{id}</strong>
    {copied ? <Check size={15} className="id-chip-icon" /> : <Copy size={15} className="id-chip-icon" />}
  </button>
}

function Shell({ children, tournament, role, token, onLogout, eyebrow = 'Turnierbüro' }) {
  const [showLog, setShowLog] = useState(false)
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">S</span><span>skatis</span></div>
      <div className="topbar-right">
        {tournament && <IdChip id={tournament.id} name={tournament.name} label="ID" compact />}
        {role && <span className={`role-chip ${role === 'ADMIN' ? 'admin' : ''}`}>{role === 'ADMIN' ? 'ADMIN' : 'MITGLIED'}</span>}
        <button className="icon-button topbar-desktop" type="button" title="Desktop-Ansicht" aria-label="Desktop-Ansicht einschalten" onClick={() => setDesktopMode(true)}><Monitor size={18} /></button>
        <button className="icon-button topbar-mobile" type="button" title="Handy-Ansicht" aria-label="Zur Handy-Ansicht wechseln" onClick={() => setDesktopMode(false)}><Smartphone size={18} /></button>
        <button className="icon-button help-button" title="Hilfe"><CircleHelp size={18} /></button>
        <button className="icon-button topbar-log" title="Protokoll der Änderungen" aria-label="Protokoll der Änderungen" onClick={() => setShowLog(true)}><History size={18} /></button>
        <button className="icon-button" title="Abmelden" aria-label="Abmelden" onClick={() => onLogout()}><LogOut size={18} /></button>
      </div>
    </header>
    <main>{children}</main>
    <footer className="site-footer"><span>SKATIS</span><span className="footer-right"><button className="footer-button" title="Protokoll der Änderungen" onClick={() => setShowLog(true)}><History size={13} /> Protokoll</button>{eyebrow} · {new Date().getFullYear()}</span></footer>
    {showLog && <TournamentLog tournament={tournament} token={token} onClose={() => setShowLog(false)} />}

  </div>
}

function Login({ onLogin, onCreate, notice = '' }) {
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ id: '', password: '', name: '', adminPassword: '', matchdays: [3], windows: {} })
  // Das Anlegen kommt ohne Uhrzeiten aus – der Knopf blendet sie optional ein.
  const [showTimes, setShowTimes] = useState(false)
  const update = (key, value) => setForm({ ...form, [key]: value })
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'login') { await onLogin(form.id, form.password); return }
      const { windows: matchdayWindows, error: windowError } = showTimes ? windowsFrom(form.matchdays, form.windows) : {}
      if (windowError) { setError(windowError); return }
      await onCreate({ name: form.name, password: form.password, adminPassword: form.adminPassword, matchdays: form.matchdays, matchdayWindows })
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="login-page">
    <div className="login-art"><div className="art-kicker">DIE RUNDE BEGINNT HIER</div><h1>Gute Spiele.<br /><em>Gute Gesellschaft.</em></h1><p>Skatis ist die beste Platform, um Turniere und Skatlisten zu verwalten! Dein digitales Skatblatt für faire Runden, klare Ergebnisse und Turniere, die bleiben.</p><div className="art-stamp"><Trophy size={16} /> Ergebnistabelle inklusive</div></div>
    <div className="login-panel">
      <div className="panel-intro"><span className="eyebrow">Willkommen zurück</span><h2>{mode === 'login' ? 'Turnier öffnen' : 'Neues Turnier anlegen'}</h2><p>{mode === 'login' ? 'Mit deiner Turnier-ID und dem Passwort gelangst du direkt an den Tisch.' : 'Erstelle den gemeinsamen Raum für deine nächste Skatrunde. Die Turnier-ID bekommst du danach zum Weitergeben.'}</p>{mode === 'login' && <p className="id-hint">Die ID bekommst du von der Person, die das Turnier angelegt hat. Sie steht später immer oben in der App und lässt sich dort antippen und kopieren.</p>}</div>
      <div className="mode-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Einloggen</button><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Turnier erstellen</button></div>
      {notice && <div className="info-message">{notice}</div>}
      <form onSubmit={submit}>
        {mode === 'login' ? <><label>Turnier-ID<input required value={form.id} onChange={(e) => update('id', e.target.value.toUpperCase())} placeholder="z. B. K7M2P4QX" /></label><PasswordField label="Passwort" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Dein Turnierpasswort" /></> : <><label>Turniername<input required minLength="3" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Mittwochsrunde" /></label><PasswordField label="Spieler-Passwort" required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Mindestens 8 Zeichen" /><PasswordField label="Admin-Passwort" required minLength={8} value={form.adminPassword} onChange={(e) => update('adminPassword', e.target.value)} placeholder="Für spätere Korrekturen" /><MatchdayPicker value={form.matchdays} onChange={(matchdays) => update('matchdays', matchdays)} windows={form.windows} onWindowsChange={showTimes ? (windows) => update('windows', windows) : undefined} />{showTimes ? <button type="button" className="times-toggle" onClick={() => { setShowTimes(false); update('windows', {}) }}><X size={14} /> Uhrzeiten entfernen</button> : <button type="button" className="times-toggle" onClick={() => setShowTimes(true)}><Clock size={14} /> Uhrzeiten festlegen (optional)</button>}</>}
        {error && <div className="error-message">{error}</div>}
        <button className="primary-button full" disabled={busy}>{busy ? 'Einen Moment …' : mode === 'login' ? <>Turnier öffnen <ArrowRight size={17} /></> : <>Turnier erstellen <Plus size={17} /></>}</button>
      </form>
      <p className="form-note">{mode === 'login' ? 'Noch kein Turnier? ' : 'Schon ein Turnier? '}<button className="text-button" onClick={() => setMode(mode === 'login' ? 'create' : 'login')}>{mode === 'login' ? 'Jetzt anlegen' : 'Einloggen'}</button></p>
    </div>
  </div>
}

/** Listen je Seite in der Übersicht – mehr lädt sie nie, dafür gibt es Seiten. */
const LISTS_PAGE_SIZE = 50

function Dashboard({ tournament, role, lists, onOpenList, onLogout, token, onCreated, notice, onTournamentUpdated }) {
  const [showCreate, setShowCreate] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [players, setPlayers] = useState([])
  const [playerName, setPlayerName] = useState('')
  const [playerError, setPlayerError] = useState('')
  const [editingPlayer, setEditingPlayer] = useState(null)
  const [editedPlayerName, setEditedPlayerName] = useState('')
  const [listRankings, setListRankings] = useState({})
  const [standing, setStanding] = useState(null)
  // Die Spieler-Seite ist ein eigener Schritt der Historie: „Zurück“ führt wieder
  // zur Übersicht, auf der sie geöffnet wurde.
  const [detailPlayer, setDetailPlayer] = useState(() => {
    const screen = window.history.state?.skatis
    return screen?.screen === 'player' && screen.name ? { name: screen.name } : null
  })
  // Die Listen der Übersicht holt der Server: gefiltert und seitenweise, damit die
  // Suche auch Einträge findet, die nicht auf der geladenen Seite stehen.
  const [filter, setFilter] = useState('all')
  // Zweite Achse derselben Übersicht: „innerhalb dieses Spieltags nur Serie X“.
  const [seriesFilter, setSeriesFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  // Zähler, der die Abfrage nach dem Anlegen einer Liste wiederholt.
  const [reload, setReload] = useState(0)
  const [page, setPage] = useState({ items: [], total: 0, days: [], series: [], loading: true, error: '' })
  // Auf dem Handy stehen die drei Bereiche nicht untereinander, sondern hinter
  // der Tab-Leiste: nur der gewählte Abschnitt wird gebaut – das spart auch die
  // Verlaufs-Abfragen der Rangliste, solange sie niemand sehen will.
  const mobile = useMobile()
  const [section, setSection] = useState('lists')
  const filtered = page.items
  // Auswahlwerte und Gesamtzahl kommen aus derselben Antwort (`meta.facets`).
  const days = page.days
  const seriesOptions = page.series
  const narrowed = filter !== 'all' || seriesFilter !== 'all'
  const pageNumber = Math.floor(offset / LISTS_PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(page.total / LISTS_PAGE_SIZE))
  function chooseFilter(value) { setFilter(value); setOffset(0) }
  function chooseSeries(value) { setSeriesFilter(value); setOffset(0) }
  // An welchen Wochentagen gespielt werden kann – Namen statt einer Zahl.
  const matchdayNames = [...(tournament?.matchdays || [])].sort((a, b) => a - b).map((day) => {
    const window = tournament?.matchdayWindows?.[day]
    return window ? `${weekdayLabel(day)} ${window.from}–${window.to}` : weekdayLabel(day)
  }).filter(Boolean)
  const showLists = !mobile || section === 'lists'
  const showRanking = !mobile || section === 'ranking'
  const showPlayers = !mobile || section === 'players'
  async function loadPlayers() { setPlayers(await request(`/tournaments/${tournament.id}/players`, { token })); setPlayerError('') }
  async function addPlayer(event) { event.preventDefault(); setPlayerError(''); try { await request(`/tournaments/${tournament.id}/players`, { method: 'POST', token, body: { name: playerName } }); setPlayerName(''); await loadPlayers() } catch (error) { setPlayerError(errorNotice(error)) } }
  function startEditing(player) { setEditingPlayer(player.name); setEditedPlayerName(player.name); setPlayerError('') }
  async function renamePlayer(event, oldName) { event.preventDefault(); setPlayerError(''); try { await request(`/tournaments/${tournament.id}/players/${encodeURIComponent(oldName)}`, { method: 'PATCH', token, body: { name: editedPlayerName } }); setEditingPlayer(null); await loadPlayers() } catch (error) { setPlayerError(errorNotice(error)) } }
  useEffect(() => { loadPlayers().catch((error) => setPlayerError(errorNotice(error))) }, [tournament?.id])

  // Die Übersicht fragt den Server nach Spieltag und Serie und bekommt eine Seite
  // von höchstens `LISTS_PAGE_SIZE` Listen samt Gesamtzahl und Auswahlwerten zurück.
  useEffect(() => {
    if (!tournament?.id) return undefined
    let active = true
    const query = new URLSearchParams({ limit: String(LISTS_PAGE_SIZE), offset: String(offset) })
    if (filter !== 'all') query.set('matchday', filter)
    if (seriesFilter !== 'all') query.set('series', seriesFilter)
    setPage((current) => ({ ...current, loading: true }))
    request(`/tournaments/${tournament.id}/lists?${query}`, { token, withMeta: true })
      .then((result) => {
        if (!active) return
        setPage({
          items: result?.data ?? [],
          total: result?.meta?.total ?? 0,
          days: result?.meta?.facets?.days ?? [],
          series: result?.meta?.facets?.series ?? [],
          loading: false,
          error: '',
        })
      })
      .catch((problem) => {
        if (!active) return
        setPage((current) => ({ ...current, loading: false, error: errorNotice(problem) }))
      })
    return () => { active = false }
  }, [tournament?.id, token, filter, seriesFilter, offset, reload])
  useEffect(() => {
    request(`/tournaments/${tournament.id}/standings`, { token }).then(setStanding).catch(() => setStanding(null))
  }, [lists, tournament?.id, token])

  // Mini-Ranglisten der Karten: Geladen wird, was noch fehlt – die Listen der
  // Spieler-Seite und die der aktuellen Seite der Übersicht.
  useEffect(() => {
    const missing = [...new Set([...lists, ...page.items].map((list) => list.id))].filter((id) => !listRankings[id])
    if (!missing.length) return
    Promise.all(missing.map(async (id) => [id, await request(`/tournaments/${tournament.id}/lists/${id}/results`, { token })]))
      .then((entries) => setListRankings((current) => ({ ...current, ...Object.fromEntries(entries) })))
      .catch(() => {})
  }, [lists, page.items, tournament?.id, token, listRankings])

  /** Die Spieler-Seite als Schritt in der Historie öffnen. */
  function openPlayer(player) {
    window.history.pushState({ skatis: { screen: 'player', name: player.name } }, '')
    setDetailPlayer(player)
  }

  // Der Zurück-Knopf des Browsers bringt genau den Spieler zurück, dessen Eintrag
  // angesteuert wird – ohne Eintrag zeigt die Übersicht die Rangliste.
  useEffect(() => {
    function onPop(event) {
      const screen = event.state?.skatis
      if (screen?.screen === 'overlay') return
      setDetailPlayer(screen?.screen === 'player' && screen.name ? { name: screen.name } : null)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  // Die Spieler-Details sind eine eigene Ansicht, kein Popup: sie treten an die
  // Stelle der Übersicht und haben Kopfzeile und Zurück-Link. Die Zahlen kommen
  // frisch aus der Rangliste, damit die Seite nach einem Nachladen mitzieht.
  if (detailPlayer) {
    const player = standing?.players?.find((entry) => entry.name === detailPlayer.name) ?? detailPlayer
    return <Shell tournament={tournament} role={role} onLogout={onLogout} token={token} eyebrow="Spieler">
      <div className="screen" key={`player-${player.name}`}><PlayerView player={player} standing={standing} tournament={tournament} token={token} lists={lists} rankings={listRankings} onBack={() => window.history.back()} onOpenList={onOpenList} /></div>
    </Shell>
  }
  return <Shell tournament={tournament} role={role} onLogout={onLogout} token={token}><div className="dashboard-header"><div><div className="dashboard-id-row">{role && <span className={`role-chip ${role === 'ADMIN' ? 'admin' : ''}`}>{role === 'ADMIN' ? 'ADMIN' : 'MITGLIED'}</span>}</div><h1>Übersicht</h1><p className="lede">Alle Listen deines Turniers auf einen Blick.</p><p className="id-hint">Zum Mitspielen braucht jeder die Turnier-ID aus der Kopfzeile und das Passwort – antippen kopiert sie.</p></div><div className="dashboard-actions">{role === 'ADMIN' && <button className="secondary-button" onClick={() => setShowSettings(true)}><CalendarDays size={16} /> Turnier verwalten</button>}<button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> Neue Liste</button></div></div>
    {notice && <div className="error-message inline">{notice}</div>}
    {showLists && <div className="stats-row"><div className="stat"><span>{narrowed ? 'Listen in der Auswahl' : 'Listen gesamt'}</span><strong><CountUp value={page.total} /></strong><ClipboardList size={19} /></div><div className="stat"><span>Spieltage</span><strong><CountUp value={days.length} /></strong><CalendarDays size={19} /></div><div className="stat"><span>Turniertage</span><strong className="days" title={matchdayNames.length ? `Gespielt wird ${matchdayNames.join(', ')}` : 'Noch keine Spieltage festgelegt'}>{matchdayNames.length ? matchdayNames.join(', ') : 'Noch keine'}</strong><CalendarDays size={19} /></div></div>}
    {showLists && <>
      <div className="section-heading"><div><span className="eyebrow">Archiv & heute</span><h2>Listen</h2></div><div className="list-filters"><select value={filter} onChange={(e) => chooseFilter(e.target.value)} aria-label="Spieltag"><option value="all">Alle Spieltage</option>{days.map((day) => <option key={day}>{day}</option>)}</select><select value={seriesFilter} onChange={(e) => chooseSeries(e.target.value)} aria-label="Serie"><option value="all">Alle Serien</option>{seriesOptions.map((series) => <option key={series} value={series}>Serie {series}</option>)}</select></div></div>
      <div className={`list-grid${page.loading ? ' loading' : ''}`}>{filtered.length ? filtered.map((list, index) => <ListCard key={list.id} list={list} ranking={listRankings[list.id]} index={index} onClick={() => onOpenList(list)} />) : page.loading ? <Skeleton lines={4} /> : <div className="empty-state"><ClipboardList size={28} /><h3>{narrowed ? 'Keine Liste in dieser Auswahl' : 'Noch keine Liste angelegt'}</h3><p>{narrowed ? 'Wähle einen anderen Spieltag oder eine andere Serie.' : 'Lege die erste Tischliste für den nächsten Spieltag an.'}</p><button className="secondary-button" onClick={() => setShowCreate(true)}>Liste anlegen</button></div>}</div>
      {page.error && <div className="error-message">{page.error}</div>}
      {page.total > LISTS_PAGE_SIZE && <div className="pagination">
        <button className="secondary-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LISTS_PAGE_SIZE))}><ArrowLeft size={15} /> Zurück</button>
        <span>Seite {pageNumber} von {pageCount} · {page.total} Listen</span>
        <button className="secondary-button" disabled={offset + LISTS_PAGE_SIZE >= page.total} onClick={() => setOffset(offset + LISTS_PAGE_SIZE)}>Weiter <ArrowRight size={15} /></button>
      </div>}
    </>}
    {showRanking && standing && <TournamentRanking standing={standing} tournament={tournament} token={token} onOpenPlayer={openPlayer} />}
    {showPlayers && <section className="roster-panel"><div><span className="eyebrow">Turnier-Roster</span><h2>Spieler</h2><p>Diese Namen können in Tischlisten gesetzt werden – neue Namen und Korrekturen macht der Admin.</p></div><div className="roster-content"><div className="player-tags">{players.length ? players.map((player) => editingPlayer === player.name ? <form className="player-tag-edit" key={player.name} onSubmit={(event) => renamePlayer(event, player.name)}><input autoFocus required maxLength="64" value={editedPlayerName} onChange={(event) => setEditedPlayerName(event.target.value)} /><button className="icon-button" type="submit" title="Namen speichern"><Check size={14} /></button><button className="icon-button" type="button" title="Abbrechen" onClick={() => setEditingPlayer(null)}><X size={14} /></button></form> : <span className="player-tag" key={player.name}>{player.name}{role === 'ADMIN' && <button className="icon-button" type="button" title={`${player.name} umbenennen`} onClick={() => startEditing(player)}><Pencil size={13} /></button>}</span>) : <span className="muted">Noch keine Spieler hinzugefügt</span>}</div>{role === 'ADMIN' ? <form className="player-form" onSubmit={addPlayer}><input required maxLength="64" value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Name hinzufügen" /><button className="primary-button" title="Spieler hinzufügen"><Plus size={17} /></button></form> : <p className="roster-hint">Nur der Admin kann Spieler hinzufügen oder umbenennen.</p>}{playerError && <div className="error-message">{playerError}</div>}</div></section>}
    {mobile && <SectionTabs value={section} onChange={setSection} />}
    {showCreate && <CreateListModal token={token} tournament={tournament} role={role} players={players} lists={lists} canManagePlayers={role === 'ADMIN'} onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await onCreated(); setOffset(0); setReload((count) => count + 1) }} />}
    {showSettings && <TournamentSettings token={token} tournament={tournament} onClose={() => setShowSettings(false)} onUpdated={(updated, meta) => { onTournamentUpdated(updated); setShowSettings(false); if (meta && meta.passwordChanged) onLogout('Das Spielerpasswort wurde geändert – alle bisherigen Sitzungen sind beendet. Bitte melde dich neu an.') }} />}
  </Shell>
}

/**
 * Die Tab-Leiste der Handy-Ansicht: die drei Bereiche der Übersicht, mit einem
 * gleitenden Feld hinter dem aktiven Tab. Auf dem Desktop gibt es sie nicht – dort
 * stehen die Abschnitte wie bisher untereinander.
 */
const SECTIONS = [['lists', 'Übersicht', ClipboardList], ['ranking', 'Rangliste', Trophy], ['players', 'Spieler', Users]]

function SectionTabs({ value, onChange }) {
  return <nav className="tabbar" aria-label="Bereiche">
    <i className="tab-pill" style={{ '--i': Math.max(0, SECTIONS.findIndex(([id]) => id === value)) }} aria-hidden="true" />
    {SECTIONS.map(([id, label, Icon]) => <button key={id} type="button" className={value === id ? 'active' : ''} aria-current={value === id ? 'page' : undefined} onClick={() => { onChange(id); window.scrollTo({ top: 0, behavior: 'smooth' }) }}><Icon size={22} /><span>{label}</span></button>)}
  </nav>
}

/**
 * Uhrzeit-Feld im 24-Stunden-Format. Das native `<input type="time">` zeigt in
 * manchen Browsern „06:30 PM“ – hier wird getippt: „1830“ wird zu „18:30“, ein
 * einzelnes „930“ beim Verlassen zu „09:30“.
 */
function TimeField({ value, onChange, label }) {
  function format(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, 4)
    return digits.length <= 2 ? digits : `${digits.slice(0, 2)}:${digits.slice(2)}`
  }
  function complete() {
    const digits = value.replace(/\D/g, '')
    if (digits.length === 3) onChange(`0${digits[0]}:${digits.slice(1)}`)
  }
  return <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={5} placeholder="18:00" aria-label={label} value={value} onChange={(event) => onChange(format(event.target.value))} onBlur={complete} />
}

function MatchdayPicker({ value, onChange, windows = {}, onWindowsChange }) {
  function toggle(day) { onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort()) }
  // Mit `onWindowsChange` zeigt der Picker je gewähltem Tag eine Spielzeit – das
  // Anlege-Formular kommt ohne, die Turnier-Einstellungen nicht.
  const withTimes = typeof onWindowsChange === 'function'
  const setTime = (day, key, time) => onWindowsChange({ ...windows, [day]: { from: '', to: '', ...windows[day], [key]: time } })
  return <fieldset className="matchday-picker"><legend>Spieltage</legend><p>Wähle mindestens einen Wochentag für die Turnierrunde.</p><div>{weekdays.map(([day, label]) => <button type="button" key={day} className={value.includes(Number(day)) ? 'selected' : ''} onClick={() => toggle(Number(day))}><span>{day}</span>{label}</button>)}</div>{withTimes && value.length > 0 && <div className="matchday-times">{value.map((day) => <label key={day} className="matchday-time"><span>{weekdayLabel(day)}</span><TimeField label={`Beginn ${weekdayLabel(day)}`} value={windows[day]?.from ?? ''} onChange={(time) => setTime(day, 'from', time)} /><em>bis</em><TimeField label={`Ende ${weekdayLabel(day)}`} value={windows[day]?.to ?? ''} onChange={(time) => setTime(day, 'to', time)} /></label>)}</div>}{withTimes && <small className="field-hint">Optional je Spieltag eine Uhrzeit von–bis im 24-Stunden-Format. Ohne Uhrzeit endet der Tag um Mitternacht. Nach der Bis-Zeit gelten alle Listen des Tages als abgegeben, vor der Von-Zeit können Mitglieder noch keine Liste anlegen.</small>}</fieldset>
}

function TournamentSettings({ token, tournament, onClose, onUpdated }) {
  useEscape(onClose)
  useBackToClose(onClose)
  useScrollLock()
  const [matchdays, setMatchdays] = useState(tournament.matchdays || [])
  const [windows, setWindows] = useState(tournament.matchdayWindows || {})
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  // Die Spielzeiten der gewählten Tage einsammeln – dieselbe Prüfung wie beim
  // Anlegen: je Tag entweder beide Zeiten oder keine, „von“ vor „bis“.
  async function submit(event) {
    event.preventDefault(); setError('')
    const { windows: matchdayWindows, error: windowError } = windowsFrom(matchdays, windows)
    if (windowError) { setError(windowError); return }
    try { const updated = await request(`/tournaments/${tournament.id}`, { method: 'PATCH', token, body: { matchdays, matchdayWindows, ...(password ? { password } : {}) } }); onUpdated(updated, { passwordChanged: Boolean(password) }) } catch (problem) { setError(problem.message) }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal settings-modal" role="dialog" aria-modal="true" aria-label="Turnier verwalten" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">Admin-Bereich</span><h2>Turnier verwalten</h2><p className="modal-copy">Lege fest, an welchen Wochentagen Listen erstellt und gespielt werden können – optional mit Uhrzeit von bis. Das Admin-Passwort bleibt, wie es beim Anlegen gesetzt wurde.</p><form onSubmit={submit}><MatchdayPicker value={matchdays} onChange={setMatchdays} windows={windows} onWindowsChange={setWindows} /><PasswordField label="Neues Spieler-Passwort optional" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leer lassen, wenn unverändert" /><small className="field-hint">Damit loggen sich die Mitglieder ein. Das Admin-Passwort lässt sich nicht ändern.</small>{error && <div className="error-message">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button">Änderungen speichern <Check size={16} /></button></div></form></div></div>
}

function ListCard({ list, ranking, index = 0, onClick }) { return <button className="list-card card-enter" style={{ '--i': index }} onClick={onClick}><div className="list-card-top"><span className={`status ${list.counted ? 'submitted' : ''}`}>{list.counted ? 'Abgegeben' : 'Offen'}</span><ChevronRight size={17} /></div><div className="date-line"><CalendarDays size={16} />{list.matchday}</div><h3>Tisch {list.table}<small>Serie {list.series}</small></h3><div className="player-line">{list.players?.length ? list.players.map((player) => <span key={player.name}>{player.name}</span>) : <span className="muted">Noch keine Spieler</span>}</div>{ranking?.players?.length > 0 && <div className="mini-ranking"><span>{list.counted ? 'Endergebnis' : 'Aktueller Stand'}</span>{ranking.players.slice().sort((a, b) => b.total - a.total).map((player) => <div key={player.name}><span>{player.name}</span><strong>{player.total}</strong></div>)}</div>}<div className="card-footer"><span>{list.gameCount || 0} Spiele</span><span>{list.totalGameValue || 0} Punkte</span></div></button> }

function TournamentRanking({ standing, tournament, token, onOpenPlayer }) {
  const [scale, setScale] = useState(PROGRESS_SCALES[0].id)
  const [histories, setHistories] = useState({})
  const [historyError, setHistoryError] = useState('')
  // Auf dem Handy ist jede Zeile eine Karte: Rang, Name und Schnitt groß, alles
  // Weitere klappt auf Tippen auf. Die breite Tabelle bleibt dem Desktop.
  const mobile = useMobile()
  const [expanded, setExpanded] = useState(null)

  // Der Verlauf kommt aus `standings/history`: dieselben Zahlen wie die Tabelle
  // darunter, nur datiert. Jede Skalierung wird einmal geholt und gemerkt.
  useEffect(() => {
    if (!tournament?.id || histories[scale]) return undefined
    let active = true
    request(`/tournaments/${tournament.id}/standings/history?groupBy=${scale}`, { token })
      .then((history) => { if (active) { setHistories((current) => ({ ...current, [scale]: history })); setHistoryError('') } })
      .catch((problem) => { if (active) setHistoryError(errorNotice(problem)) })
    return () => { active = false }
  }, [tournament?.id, token, scale, histories])

  const history = histories[scale]
  const chart = standingsProgressChart(history)
  return <section className="tournament-ranking">
    <div className="ranking-heading"><div><span className="eyebrow">Gesamtes Turnier</span><h2>Rangliste</h2></div><span>{standing.listsCounted} gewertete Listen{mobile ? '' : ' · Spieler antippen für Details'}</span></div>
    {mobile ? <div className="ranking-cards">
      {standing.players.map((player, index) => <div key={player.name} className={`ranking-card card-enter${expanded === player.name ? ' open' : ''}`} style={{ '--i': index }}>
        <button type="button" className="ranking-card-head" aria-expanded={expanded === player.name} onClick={() => setExpanded(expanded === player.name ? null : player.name)}>
          <span className="rank-badge">{player.rank ?? '–'}</span>
          <span className="rank-name">{player.name}</span>
          <span className="rank-average"><strong>{player.averageScore === null ? '–' : <CountUp value={player.averageScore} />}</strong><small>Ø Punkte</small></span>
          <ChevronRight size={18} className="rank-caret" />
        </button>
        <div className="ranking-card-body"><div className="ranking-card-inner">
          <div className="ranking-card-grid">
            <div className="ranking-card-item"><span>Gesamt</span><strong>{player.score}</strong></div>
            <div className="ranking-card-item"><span>Spiele</span><strong>{player.gamesPlayed}</strong></div>
            <div className="ranking-card-item"><span>Gewonnen</span><strong>{player.won}</strong></div>
            <div className="ranking-card-item"><span>Verloren</span><strong>{player.lost}</strong></div>
            <div className="ranking-card-item"><span>Gegner</span><strong>{player.opponentWon}</strong></div>
            <div className="ranking-card-item"><span>Ø / 36</span><strong>{player.averageScorePer36 ?? '–'}</strong></div>
            <div className="ranking-card-item"><span>Letzter Spieltag</span><strong>{player.lastMatchdayChange === null ? '–' : signedValue(player.lastMatchdayChange)}</strong></div>
          </div>
          <button className="secondary-button" onClick={() => onOpenPlayer(player)}>Details und Statistiken <ChevronRight size={16} /></button>
        </div></div>
      </div>)}
    </div> : <div className="ranking-table">
      <div className="ranking-header"><span>Rang</span><span>Spieler</span><span className="num">Spiele</span><span className="num">Ø Punkte</span><span className="num" title="Durchschnittliche Punkte pro 36 Spiele">Ø / 36</span><span className="num" title="Anzahl gewonnene Alleinspiele">Gewonnene<br />Alleinspiele</span><span className="num" title="Anzahl verlorene Alleinspiele">Verlorene<br />Alleinspiele</span><span className="num" title="Gewonnene Gegenspiele: verlorene Alleinspiele der Mitspieler">Gegner</span><span className="num" title="Punkteveränderung seit dem letzten Spieltag">± Spieltag</span><span className="num">Gesamt</span></div>
      {standing.players.map((player) => <div className="ranking-row" key={player.name} role="button" tabIndex={0} title={`${player.name}: Details und Statistiken`} onClick={() => onOpenPlayer(player)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenPlayer(player) } }}>
        <strong>{player.rank ?? '–'}</strong>
        <span>{player.name}</span>
        <span className="num">{player.gamesPlayed}</span>
        <span className="num">{player.averageScore ?? '–'}</span>
        <span className="num">{player.averageScorePer36 ?? '–'}</span>
        <span className="num">{player.won}</span>
        <span className="num">{player.lost}</span>
        <span className="num">{player.opponentWon}</span>
        <span className={`num ${player.lastMatchdayChange === null ? '' : player.lastMatchdayChange > 0 ? 'up' : player.lastMatchdayChange < 0 ? 'down' : ''}`}>{player.lastMatchdayChange === null ? '–' : signedValue(player.lastMatchdayChange)}</span>
        <strong className="num">{player.score}</strong>
      </div>)}
    </div>}
    <ProgressChart eyebrow="Punkteentwicklung" title="Durchschnittspunkte im Turnier" note="Ø Punkte je Spiel – dieselben Zahlen wie die Spalte „Ø Punkte“ der Rangliste. Die Skalierung fasst die Zeitachse zusammen." labels={chart.labels} series={chart.series} scale={scale} onScale={setScale} scales={PROGRESS_SCALES} />
    {historyError && <div className="error-message">{historyError}</div>}
    {!history && !historyError && <Skeleton lines={4} />}
  </section>
}

/**
 * Die Ansicht eines Spielers: seine Zahlen aus der Rangliste, der Verlauf seines
 * Kontos je Zeitraum und seine Abende. Alles kommt aus der API – die Wertung aus
 * `…/standings`, der Verlauf aus `…/standings/history` und die Abende aus den
 * Ergebnistabellen der Listen.
 */
function PlayerView({ player, standing, tournament, token, lists = [], rankings = {}, onBack, onOpenList }) {
  const [scale, setScale] = useState(PROGRESS_SCALES[0].id)
  const [histories, setHistories] = useState({})
  const [historyError, setHistoryError] = useState('')

  // Jede Skalierung wird einmal geholt und gemerkt – wie in der Rangliste.
  useEffect(() => {
    if (!tournament?.id || histories[scale]) return undefined
    let active = true
    request(`/tournaments/${tournament.id}/standings/history?groupBy=${scale}`, { token })
      .then((history) => { if (active) { setHistories((current) => ({ ...current, [scale]: history })); setHistoryError('') } })
      .catch((problem) => { if (active) setHistoryError(errorNotice(problem)) })
    return () => { active = false }
  }, [tournament?.id, token, scale, histories])

  // Die Spielstatistiken (Rolle, Quoten, Spielarten) kommen aus einem eigenen
  // Endpunkt – die Prozentwerte rechnet der Server, nicht diese Ansicht.
  const [stats, setStats] = useState(null)
  const [statsError, setStatsError] = useState('')
  useEffect(() => {
    if (!tournament?.id || !player?.name) return undefined
    let active = true
    request(`/tournaments/${tournament.id}/standings/players/${encodeURIComponent(player.name)}`, { token })
      .then((value) => { if (active) { setStats(value); setStatsError('') } })
      .catch((problem) => { if (active) setStatsError(errorNotice(problem)) })
    return () => { active = false }
  }, [tournament?.id, player?.name, token])

  const history = histories[scale]
  const groupBy = history?.groupBy ?? scale
  const groupByLabel = PROGRESS_SCALES.find((option) => option.id === groupBy)?.label ?? ''
  const chart = playerProgressChart(history, player.name)
  // Was er in jedem Zeitraum gesammelt hat und wo sein Konto danach stand.
  const buckets = history?.buckets ?? []
  const periods = buckets.map((bucket, index) => {
    const score = bucket.score?.[player.name] ?? 0
    const before = index === 0 ? 0 : buckets[index - 1].score?.[player.name] ?? 0
    return {
      key: bucket.key,
      label: chart.labels[index],
      gamesPlayed: bucket.gamesPlayed?.[player.name] ?? 0,
      change: score - before,
      score,
      averageScore: bucket.averageScore?.[player.name] ?? null,
    }
  })
  const best = periods.reduce((top, period) => (top === null || period.change > top.change ? period : top), null)
  // Seine gewerteten Abende – ein Zettel ist eine Zeile, antippen öffnet ihn.
  const evenings = (lists ?? [])
    .filter((list) => list.counted !== false && rankings[list.id])
    .map((list) => ({ list, row: (rankings[list.id].players ?? []).find((entry) => entry.name === player.name) }))
    .filter((entry) => entry.row)
  const changeClass = (value) => (value === null ? '' : value > 0 ? 'up' : value < 0 ? 'down' : '')
  const percentLabel = (value) => (value === null || value === undefined ? '–' : `${value} %`)
  // Alle Spielarten zusammen – Grand und Null eingeschlossen: „Lieblingsspiele“
  // nach Häufigkeit, „Beste Spiele“ nach Gewinnchance. Beides aus den Zahlen des
  // Servers, hier wird nur sortiert.
  const playedTypes = stats?.gameTypes ?? []
  const favourite = [...playedTypes].sort((a, b) => b.played - a.played || a.gameType.localeCompare(b.gameType))
  const bestGames = [...playedTypes].sort((a, b) => (b.winShare ?? 0) - (a.winShare ?? 0) || b.played - a.played)
  const pieSlices = (stats?.gameTypeGroups ?? []).map((group) => ({
    label: GAME_TYPE_GROUPS[group.group]?.label ?? group.group,
    value: group.played,
    color: GAME_TYPE_GROUPS[group.group]?.color ?? '#c1c3ba',
  }))
  /** Eine Kennzahl im Panel: Label, Wert und eine erläuternde Zeile darunter. */
  const item = (label, value, hint) => <div className="detail-item"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>
  /** Eine Zeile der Farb-Rankings: Balken (Anteil), Wert und Erläuterung. */
  const barRow = (entry, value, width, hint) => <li key={entry.gameType}>
    <span className="bar-label"><span className={`suit-icon suit-${entry.gameType.toLowerCase()}`}>{gameTypeSymbol(entry.gameType)}</span>{gameTypeLabel(entry.gameType)}</span>
    <span className="bar-track"><i style={{ width: `${Math.max(0, Math.min(100, width ?? 0))}%` }} /></span>
    <strong>{value}</strong>
    <small>{hint}</small>
  </li>

  return <>
    <div className="workspace-head">
      <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Rangliste</button>
      <div className="workspace-title"><span className="eyebrow">{tournament?.name} · {standing?.listsCounted ?? 0} gewertete Listen</span><h1>{player.name}</h1></div>
      <div className="workspace-actions"><span className="status submitted">{player.rank === null ? 'Ohne Wertung' : `Rang ${player.rank}`}</span></div>
    </div>

    <div className="stats-row player-stats">
      <div className="stat"><span>Gesamtpunkte</span><strong>{signedValue(player.score)}</strong><small>Spielpunkte, Boni und Gegenspiele</small></div>
      <div className="stat"><span>Ø Punkte je Spiel</span><strong>{player.averageScore ?? '–'}</strong><small>der Rangwert · {player.gamesPlayed} Spiele</small></div>
      <div className="stat"><span>Ø Punkte pro 36 Spiele</span><strong>{player.averageScorePer36 ?? '–'}</strong><small>hochgerechnet auf 36 Spiele</small></div>
      <div className="stat"><span>Letzter Spieltag</span><strong className={changeClass(player.lastMatchdayChange)}>{player.lastMatchdayChange === null ? '–' : signedValue(player.lastMatchdayChange)}</strong><small>Veränderung zum Spieltag davor</small></div>
    </div>

    <div className="stats-row player-stats">
      <div className="stat"><span>Spielpunkte</span><strong>{signedValue(player.points)}</strong><small>nur die eigenen Alleinspiele</small></div>
      <div className="stat"><span>Boni (+50 / −50)</span><strong>{signedValue(player.wonBonus + player.lossPenalty)}</strong><small>{player.won} × +50, {player.lost} × −50</small></div>
      <div className="stat"><span>Gegenspiel-Punkte</span><strong>{signedValue(player.opponentBonus)}</strong><small>{player.opponentWon} × verloren von Mitspielern</small></div>
      <div className="stat"><span>Gewonnen / Verloren</span><strong>{player.won} / {player.lost}</strong><small>{best ? `bester Zeitraum ${best.label} (${signedValue(best.change)})` : 'eigene Alleinspiele'}</small></div>
    </div>

    <div className="player-tables">
      <section className="player-panel">
        <div className="section-heading"><div><span className="eyebrow">Rollen</span><h2>Seine Aufgaben</h2></div><span className="dealer-note">in {stats?.roles.played ?? player.gamesPlayed} Spielen am Tisch</span></div>
        {statsError && <div className="error-message">{statsError}</div>}
        {!stats && !statsError && <Skeleton lines={3} />}
        {stats && <div className="stat-grid">
          {item('Anteil Alleinspieler', percentLabel(stats.roles.declarerShare), `${stats.roles.declarer} × selbst gespielt`)}
          {item('Anteil Gegenspieler', percentLabel(stats.roles.defenderShare), `${stats.roles.defender} × als Gegenspieler`)}
          {item('Anteil Eingepasst', percentLabel(stats.roles.passedOutShare), `${stats.roles.passedOut} × ohne Spiel`)}
          {item('Spiele am Tisch', stats.roles.played, 'seine gesamten Spiele')}
        </div>}
      </section>
      <section className="player-panel">
        <div className="section-heading"><div><span className="eyebrow">Quoten</span><h2>Wie er abschneidet</h2></div></div>
        {stats && <div className="stat-grid">
          {item('Alleinspiele gewonnen', percentLabel(stats.declarer.winShare), `${stats.declarer.won} von ${stats.declarer.played}`)}
          {item('Gegenspiele gewonnen', percentLabel(stats.defender.winShare), `${stats.defender.won} von ${stats.defender.played}`)}
          {item('Hand gewonnen', percentLabel(stats.hand.winShare), `${stats.hand.won} von ${stats.hand.played}`)}
          {item('Hand angesagt', percentLabel(stats.hand.share), `${stats.hand.played} von ${stats.declarer.played} Alleinspielen`)}
        </div>}
      </section>
    </div>

    <section className="player-panel">
      <ProgressChart eyebrow="Entwicklung" title="Punkte über die Zeit" note="Der Kontostand nach jedem Zeitraum – er wächst nur durch eigene Alleinspiele und die Boni; die Skalierung fasst die Zeitachse zusammen." labels={chart.labels} series={chart.series} scale={scale} onScale={setScale} scales={PROGRESS_SCALES} />
      {historyError && <div className="error-message">{historyError}</div>}
      {!history && !historyError && <Skeleton lines={4} />}
    </section>

    <section className="player-panel">
      <div className="section-heading"><div><span className="eyebrow">Spielarten</span><h2>Grand, Null und Farbspiel</h2></div><span className="dealer-note">Anteil an seinen {stats?.declarer.played ?? '–'} Alleinspielen</span></div>
      {stats && <div className="pie-layout">
        <PieChart slices={pieSlices} centerLabel="Alleinspiele" emptyHint="Noch keine Alleinspiele eingetragen." />
        <div className="bar-lists">
          <div>
            <div className="section-heading"><div><span className="eyebrow">Spiele</span><h3>Lieblingsspiele</h3></div><span className="dealer-note">nach Häufigkeit</span></div>
            {favourite.length ? <ul className="bar-list">{favourite.map((entry) => barRow(entry, `${entry.played}×`, entry.share, `${entry.share} % seiner Alleinspiele · ${entry.won} gewonnen`))}</ul> : <p className="chart-note">Noch kein Alleinspiel gespielt.</p>}
          </div>
          <div>
            <div className="section-heading"><div><span className="eyebrow">Spiele</span><h3>Beste Spiele</h3></div><span className="dealer-note">nach Gewinnchance</span></div>
            {bestGames.length ? <ul className="bar-list">{bestGames.map((entry) => barRow(entry, percentLabel(entry.winShare), entry.winShare ?? 0, `${entry.won} von ${entry.played} gewonnen`))}</ul> : <p className="chart-note">Noch kein Alleinspiel gespielt.</p>}
          </div>
        </div>
      </div>}
    </section>

    <div className="player-tables">
      <section className="player-panel">
        <div className="section-heading"><div><span className="eyebrow">Aufschlüsselung</span><h2>Nach Zeitraum</h2></div><span className="dealer-note">{groupByLabel}</span></div>
        <table className="detail-table"><thead><tr><th>Zeitraum</th><th>Spiele</th><th>Punkte</th><th>Ø</th><th>Gesamt</th></tr></thead><tbody>
          {periods.length ? periods.map((period) => <tr key={period.key}><td>{period.label}</td><td>{period.gamesPlayed}</td><td className={period.change > 0 ? 'delta-up' : period.change < 0 ? 'delta-down' : 'muted'}>{signedValue(period.change)}</td><td>{period.averageScore ?? '–'}</td><td><strong>{period.score}</strong></td></tr>) : <tr><td colSpan={5} className="muted">Noch kein gewerteter Spieltag.</td></tr>}
        </tbody></table>
      </section>
      <section className="player-panel">
        <div className="section-heading"><div><span className="eyebrow">Bilanz</span><h2>Seine Abende</h2></div><span className="dealer-note">{evenings.length} gewertete Zettel · antippen öffnet den Tisch</span></div>
        <table className="detail-table"><thead><tr><th>Spieltag</th><th>Tisch</th><th>G / V / Gegner</th><th>Ergebnis</th></tr></thead><tbody>
          {evenings.length ? evenings.map(({ list, row }) => <tr key={list.id} className="evening-row" role="button" tabIndex={0} title={`Tisch ${list.table} am ${shortDate(list.matchday)} öffnen`} onClick={() => onOpenList(list)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenList(list) } }}><td>{shortDate(list.matchday)}</td><td>Serie {list.series} · Tisch {list.table}</td><td>{row.won} / {row.lost} / {row.opponentWon}</td><td><strong>{signedValue(row.total)}</strong></td></tr>) : <tr><td colSpan={4} className="muted">Noch kein gewerteter Abend.</td></tr>}
        </tbody></table>
      </section>
    </div>
  </>
}

function CreateListModal({ token, tournament, role, players = [], lists = [], canManagePlayers = true, onClose, onCreated }) {
  useEscape(onClose)
  useBackToClose(onClose)
  useScrollLock()
  const rules = useRules()
  const [form, setForm] = useState({ matchday: today, series: 1, table: 1 }); const [lineup, setLineup] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  // Ein Tisch spielt immer nur eine Liste: solange die Liste zu diesem Spieltag,
  // dieser Serie und diesem Tisch offen ist, darf keine zweite entstehen. Der
  // Server prüft dasselbe noch einmal – hier spart es nur den Fehlversuch.
  const blocking = lists.find((list) => list.status === 'OPEN' && !list.counted && list.matchday === form.matchday && Number(list.series) === Number(form.series) && Number(list.table) === Number(form.table))
  // Mit Spielzeit legt der Server die Regeln fest („von“–„bis“); hier steht nur
  // der Hinweis, damit der Fehlversuch gar nicht passiert. Der Admin darf immer
  // vorarbeiten, für ihn gibt es deshalb keinen Hinweis.
  const playingTime = matchdayWindow(tournament, form.matchday)
  const windowPhase = role === 'ADMIN' ? null : windowState(tournament, form.matchday)
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { await request(`/tournaments/${tournament.id}/lists`, { method: 'POST', token, body: { matchday: form.matchday, series: Number(form.series), table: Number(form.table), playerNames: lineup } }); await onCreated() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label="Neue Tischliste" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">Neue Tischliste</span><h2>Ein Blatt, ein Abend.</h2><p className="modal-copy">Definiere den Tisch und die Sitzreihenfolge. Die erste Person gibt in Runde eins.</p><form onSubmit={submit}><div className="form-grid"><label>Spieltag<input type="date" required value={form.matchday} onChange={(e) => setForm({ ...form, matchday: e.target.value })} /></label><label>Serie<input type="number" min="1" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} /></label><label>Tisch<input type="number" min="1" value={form.table} onChange={(e) => setForm({ ...form, table: e.target.value })} /></label></div><LineupPicker players={players} value={lineup} onChange={setLineup} canManagePlayers={canManagePlayers} min={rules?.lineup?.min} max={rules?.lineup?.max} />{windowPhase === 'before' && <div className="info-message">Die Spielzeit beginnt um {playingTime.from} – eine Liste lässt sich erst ab dann anlegen.</div>}{windowPhase === 'over' && <div className="info-message">Die Spielzeit dieses Tages ist vorbei – seine Listen gelten als abgegeben. Korrekturen macht der Admin.</div>}{blocking && <div className="error-message">Serie {form.series}, Tisch {form.table} spielt an diesem Spieltag noch: {blocking.players.map((player) => player.name).join(', ')}. Erst diese Liste abgeben – oder eine andere Serie bzw. einen anderen Tisch wählen.</div>}{error && <div className="error-message">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={busy || !rules || lineup.length < rules.lineup.min || Boolean(windowPhase)}>{busy ? 'Wird angelegt …' : !rules ? 'Regeln werden geladen …' : <>Liste anlegen <ArrowRight size={17} /></>}</button></div></form></div></div>
}

/**
 * Admin-Korrektur am Kopf des Blattes: Tisch und Serie lassen sich ändern, wenn
 * sich ein Mitglied vertan hat. Sitzreihenfolge, Spiele und Spieltag bleiben –
 * die Liste behält ihr Ergebnis, sie steht nur an einer anderen Stelle.
 */
function ListSettingsModal({ token, tournament, list, onClose, onSaved }) {
  useEscape(onClose)
  useBackToClose(onClose)
  useScrollLock()
  const [form, setForm] = useState({ series: list.series, table: list.table })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const updated = await request(`/tournaments/${tournament.id}/lists/${list.id}`, { method: 'PATCH', token, body: { series: Number(form.series), table: Number(form.table) } })
      onSaved(updated)
    } catch (problem) { setError(problem.message) } finally { setBusy(false) }
  }
  return <div className="modal-backdrop" onClick={onClose}><div className="modal" role="dialog" aria-modal="true" aria-label="Tisch und Serie ändern" onClick={(event) => event.stopPropagation()}><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">Korrektur</span><h2>Tisch und Serie ändern</h2><p className="modal-copy">Falls sich ein Mitglied vertan hat: Hier lässt sich der Platz der Liste korrigieren. Spiele, Sitzreihenfolge und Spieltag bleiben unverändert.</p><form onSubmit={submit}><div className="form-grid"><label>Serie<input type="number" required min="1" max="999" value={form.series} onChange={(event) => setForm({ ...form, series: event.target.value })} /></label><label>Tisch<input type="number" required min="1" max="999" value={form.table} onChange={(event) => setForm({ ...form, table: event.target.value })} /></label></div><small className="field-hint">Spielt an diesem Spieltag noch eine andere Liste auf demselben Platz, lehnt der Server ab – erst diese Liste abgeben oder einen anderen Platz wählen.</small>{error && <div className="error-message">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={busy}>{busy ? 'Wird gespeichert …' : <>Speichern <Check size={16} /></>}</button></div></form></div></div>
}

function ListWorkspace({ list, tournament, role, token, onBack, onDeleted, onLogout, onUpdated }) {
  const [showWizard, setShowWizard] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmGame, setConfirmGame] = useState(null)
  const [editingGame, setEditingGame] = useState(null)
  const [detailGame, setDetailGame] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [notice, setNotice] = useState('')
  const [progression, setProgression] = useState(null)
  const [results, setResults] = useState(null)
  const [scale, setScale] = useState('round')
  const [customScale, setCustomScale] = useState(5)

  // Spiele sind korrigierbar, solange die Liste es zulässt: für Mitglieder heißt
  // das „offen und heute“, für den Admin immer – auch nach dem Schließen. Der
  // Server prüft dasselbe noch einmal, das Flag kommt von dort (`list.locked`).
  const canEdit = role === 'ADMIN' || !list.locked

  // Beide Zahlenreihen kommen aus der API: der Kontoverlauf ("verloren zählt
  // doppelt" samt Boni) und die Ergebnistabelle, aus der die vier Abschlusszeilen
  // unter dem Protokoll ihre Summen je Spieler nehmen.
  async function loadDetails() {
    const [table, accounts] = await Promise.all([
      request(`/tournaments/${tournament.id}/lists/${list.id}/results`, { token }),
      request(`/tournaments/${tournament.id}/lists/${list.id}/progression`, { token }),
    ])
    setResults(table)
    setProgression(accounts)
  }

  async function saveGame(game) {
    try {
      const isEditing = Boolean(editingGame)
      const path = isEditing ? `/tournaments/${tournament.id}/lists/${list.id}/games/${editingGame.id}` : `/tournaments/${tournament.id}/lists/${list.id}/games`
      const saved = await request(path, { method: isEditing ? 'PUT' : 'POST', token, body: game })
      const games = isEditing ? list.games.map((item) => item.id === saved.id ? saved : item) : [...(list.games || []), saved]
      onUpdated({ ...list, games, gameCount: games.length, totalGameValue: games.reduce((sum, item) => sum + (item.gameValue || 0), 0) })
      await loadDetails()
      setShowWizard(false); setEditingGame(null)
      setNotice(isEditing ? 'Spiel wurde aktualisiert.' : 'Spiel wurde eingetragen.')
    } catch (e) { setNotice(errorNotice(e)) }
  }

  async function updateList(action) {
    try {
      const updated = await request(`/tournaments/${tournament.id}/lists/${list.id}/${action}`, { method: 'POST', token })
      onUpdated(updated)
      setNotice(action === 'submit' ? 'Liste wurde geschlossen.' : 'Liste wurde wieder geöffnet.')
    } catch (e) { setNotice(errorNotice(e)) }
  }

  function deleteList() { setConfirmDelete(true) }

  async function removeList() {
    setConfirmDelete(false)
    try { await request(`/tournaments/${tournament.id}/lists/${list.id}`, { method: 'DELETE', token }); onDeleted() } catch (e) { setNotice(errorNotice(e)) }
  }

  // Ein Spiel entfernen: Die übrigen Runden behalten ihre Nummer und ihren Geber –
  // das nächste neue Spiel knüpft an der letzten Runde an.
  async function removeGame() {
    const game = confirmGame
    setConfirmGame(null); setDetailGame(null)
    try {
      await request(`/tournaments/${tournament.id}/lists/${list.id}/games/${game.id}`, { method: 'DELETE', token })
      const games = (list.games || []).filter((item) => item.id !== game.id)
      onUpdated({ ...list, games, gameCount: games.length, totalGameValue: games.reduce((sum, item) => sum + (item.gameValue || 0), 0) })
      await loadDetails()
      setNotice('Spiel wurde gelöscht.')
    } catch (e) { setNotice(errorNotice(e)) }
  }

  useEffect(() => { loadDetails().catch((error) => setNotice(errorNotice(error))) }, [list.id])

  const lineup = (list.players || []).map((player) => player.name)
  const rounds = roundAccounts(progression)
  const scaleOptions = listScaleOptions(lineup.length)
  const roundsPerPoint = scaleStep(scale, lineup.length, customScale)
  const chart = withStep(listProgressionChart(progression), roundsPerPoint)
  const detailRound = detailGame ? rounds.find((round) => round.position === detailGame.position) : null

  return <Shell tournament={tournament} role={role} onLogout={onLogout} token={token} eyebrow="Tischliste">
    <div className="workspace-head">
      <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Übersicht</button>
      <div className="workspace-title"><span className="eyebrow">{list.matchday} · Serie {list.series} · Tisch {list.table}</span><h1>Tisch {list.table}</h1><span className={`status ${list.counted ? 'submitted' : ''}`}>{list.counted ? 'Geschlossen' : 'Offen'}</span></div>
      <div className="workspace-actions">
        {role === 'ADMIN' && list.status === 'SUBMITTED' ? <button className="secondary-button" onClick={() => updateList('reopen')}><UnlockKeyhole size={16} /> Öffnen</button> : <button className="secondary-button" disabled={list.locked || list.counted} onClick={() => updateList('submit')}><LockKeyhole size={16} /> Schließen</button>}
        {role === 'ADMIN' && <button className="secondary-button" onClick={() => setShowSettings(true)}><Pencil size={16} /> Tisch/Serie</button>}
        {role === 'ADMIN' && <button className="icon-button danger" title="Liste löschen" onClick={deleteList}><Trash2 size={18} /></button>}
        <button className="primary-button" disabled={list.locked} onClick={() => { setEditingGame(null); setShowWizard(true) }}><Plus size={17} /> Spiel eintragen</button>
      </div>
    </div>
    {notice && <div className="success-message">{notice}</div>}
    <div className="workspace-grid">
      <GameTable list={list} rounds={rounds} results={results} canEdit={canEdit} onSelect={setDetailGame} onEdit={(game) => { setEditingGame(game); setShowWizard(true) }}>
        <ProgressChart eyebrow="Punkteentwicklung" title="Kontoverlauf dieser Liste" note="Punktekonto nach jedem Spiel dieser Liste – mit den Boni (+50 / −50 und der Gegnerbonus für verlorene Spiele der Mitspieler). Der letzte Punkt ist der Gesamtstand der Liste; eine Zeile der Tabelle antippen zeigt alle Details." labels={chart.labels} series={chart.series} scale={scale} onScale={setScale} scales={scaleOptions}>
          {scale === 'custom' && <label className="chart-custom">Runden je Punkt<input type="number" min="1" max="99" value={customScale} onChange={(event) => setCustomScale(event.target.value)} /></label>}
        </ProgressChart>
      </GameTable>
    </div>
    {showWizard && <GameWizard list={list} existingGame={editingGame} token={token} tournamentId={tournament.id} onClose={() => { setShowWizard(false); setEditingGame(null) }} onSave={saveGame} />}
    {confirmDelete && <ConfirmSheet title="Liste löschen?" text="Diese Liste und alle ihre Spiele werden entfernt. Das lässt sich nicht rückgängig machen." confirmLabel="Liste löschen" onCancel={() => setConfirmDelete(false)} onConfirm={removeList} />}
    {confirmGame && <ConfirmSheet title={`Runde ${confirmGame.position} löschen?`} text={confirmGame.passedOut ? 'Das eingepasste Spiel wird aus der Liste entfernt. Die übrigen Runden behalten ihre Nummer und ihren Geber.' : `Das Spiel von ${confirmGame.declarer} wird aus der Liste entfernt. Die übrigen Runden behalten ihre Nummer und ihren Geber.`} confirmLabel="Spiel löschen" onCancel={() => setConfirmGame(null)} onConfirm={removeGame} />}
    {detailGame && <GameDetail list={list} game={detailGame} round={detailRound} onClose={() => setDetailGame(null)} onEdit={canEdit ? () => { setDetailGame(null); setEditingGame(detailGame); setShowWizard(true) } : null} onDelete={canEdit ? () => { setConfirmGame(detailGame); setDetailGame(null) } : null} />}
    {showSettings && <ListSettingsModal token={token} tournament={tournament} list={list} onClose={() => setShowSettings(false)} onSaved={(updated) => { onUpdated(updated); setShowSettings(false); setNotice('Tisch und Serie wurden gespeichert.') }} />}
  </Shell>
}

/** Die gewählte Darstellung des Spielprotokolls merkt sich der Browser. */
const TABLE_STYLE_KEY = 'skatis-table-style'

function GameTable({ list, rounds = [], results = null, canEdit = false, onEdit, onSelect, children }) {
  const games = list.games || []
  const lineup = (list.players || []).map((player) => player.name)
  const roundsByPosition = new Map(rounds.map((round) => [round.position, round]))
  // "Klassisch" stellt hinter die Spielart je Spieler drei Unterspalten: seine
  // Spielpunkte nach dem Spiel (ohne die Boni) und die Zahl seiner bis dahin
  // gewonnenen bzw. verlorenen Alleinspiele – gefüllt wird immer nur die Spalte
  // des Alleinspielers. "Modern" lässt die Blöcke weg und zeigt nur die Zeile.
  const [style, setStyle] = useState(() => (localStorage.getItem(TABLE_STYLE_KEY) === 'classic' ? 'classic' : 'modern'))
  const classic = style === 'classic'
  // Auf dem Handy ist das Protokoll eine Kartenliste – die breite Tabelle mit ihren
  // Spieler-Blöcken bleibt dem größeren Bildschirm.
  const mobile = useMobile()
  function chooseStyle(next) { setStyle(next); localStorage.setItem(TABLE_STYLE_KEY, next) }
  const roundValue = (game, name, field) => roundsByPosition.get(game.position)?.[field]?.[name]
  const columns = (classic ? 6 + lineup.length * 3 : 7) + (canEdit ? 1 : 0)
  // Das wievielte eingepasste Spiel ist eine Zeile? Nur die eingepassten Zeilen
  // bekommen eine Zahl – gezählt wird in der Reihenfolge der Liste.
  const passedOutCounts = new Map()
  let passedOut = 0
  for (const game of games) {
    if (!game.passedOut) continue
    passedOut += 1
    passedOutCounts.set(game.id, passedOut)
  }
  const playersByName = new Map((results?.players ?? []).map((player) => [player.name, player]))
  /** Ein Summenwert eines Spielers aus der Ergebnistabelle – ohne Eintrag 0. */
  const playerSum = (name, pick) => {
    const player = playersByName.get(name)
    return player ? pick(player) : 0
  }
  // Die vier Abschlusszeilen stehen nur im klassischen Protokoll und nur, wenn es
  // etwas zu summieren gibt.
  const summary = classic && games.length > 0 && (results?.players?.length ?? 0) > 0
  const gameTypeCell = (game) => <td className="game-type-cell">{game.passedOut ? '—' : <><strong>{gameTypeLabel(game.gameType)}</strong>{levelsOf(game).map((level) => <span key={level.key} className={`level-badge ${level.announced ? 'announced' : ''}`} title={level.title}>{level.short}</span>)}</>}</td>
  // Die "+/-"-Spalte der modernen Tabelle: was das Spiel dem Alleinspieler
  // bringt (+50 / −50 inklusive) – die Zahl kommt aus dem Verlauf des Servers.
  const signedCell = (game) => {
    const value = game.passedOut ? null : roundValue(game, game.declarer, 'delta') ?? null
    return <td className={`value-cell num signed ${value === null ? '' : value > 0 ? 'up' : 'down'}`}>{value === null ? '' : signedValue(value)}</td>
  }
  // Handy: eine Karte je Runde. Ganz vorne die Runde und die Spielart, dann die
  // beiden Zahlen, die zählen (Spielwert und was das Spiel dem Alleinspieler
  // bringt), darunter wer gab und wer spielte.
  if (mobile) return <section className="games-panel">
    <div className="panel-heading">
      <div><span className="eyebrow">Spielprotokoll</span><h2>{list.gameCount || games.length} Spiele</h2></div>
      <span className="dealer-note">Zeile antippen für Details</span>
    </div>
    <div className="game-cards">
      {games.length ? games.map((game, index) => {
        const delta = game.passedOut ? null : roundValue(game, game.declarer, 'delta') ?? null
        return <div key={game.id} className="game-card card-enter" style={{ '--i': index }} role="button" tabIndex={0} title="Spieldetails anzeigen" onClick={() => onSelect(game)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(game) } }}>
          <div className="game-card-head">
            <span className="game-card-round">Runde {game.position}</span>
            <span className="game-card-kind">{game.passedOut ? 'Eingepasst' : <>{gameTypeLabel(game.gameType)}{levelsOf(game).map((level) => <span key={level.key} className={`level-badge ${level.announced ? 'announced' : ''}`} title={level.title}>{level.short}</span>)}</>}</span>
            <span className={`game-card-result ${game.passedOut ? 'muted' : game.won ? 'won' : 'lost'}`}>{game.passedOut ? '—' : outcomeLabel(game)}</span>
            {canEdit && <button className="icon-button game-card-edit" title="Spiel bearbeiten" onClick={(event) => { event.stopPropagation(); onEdit(game) }}><Pencil size={15} /></button>}
          </div>
          <div className="game-card-values">
            <span className="game-card-value"><strong>{game.passedOut ? '–' : game.gameValue}</strong><small>Spielwert</small></span>
            <span className="game-card-value"><strong className={delta === null ? '' : delta > 0 ? 'up' : delta < 0 ? 'down' : ''}>{delta === null ? '–' : signedValue(delta)}</strong><small>für {game.passedOut ? 'alle' : game.declarer}</small></span>
          </div>
          <div className="game-card-meta">{game.passedOut ? `Geber ${game.dealer} · kein Alleinspieler` : `Geber ${game.dealer} · Alleinspieler ${game.declarer}`}{game.passedOut ? '' : ` · ${matadorsLabel(game)}`}</div>
        </div>
      }) : <p className="chart-note">Noch keine Spiele eingetragen. Der erste Eintrag beginnt mit dem Geber aus Platz 1.</p>}
    </div>
    {summary && <div className="game-summary">
      <span className="eyebrow">Endergebnis</span>
      {results.players.map((player) => <div key={player.name} className="game-summary-row"><span>{player.name}</span><span className="muted">{player.won} / {player.lost} / {player.opponentWon}</span><strong className={player.total > 0 ? 'up' : player.total < 0 ? 'down' : ''}>{signedValue(player.total)}</strong></div>)}
      <small className="game-summary-note">Gewonnene / verlorene Alleinspiele / Gegenspiele</small>
    </div>}
    {children}
  </section>

  return <section className="games-panel">
    <div className="panel-heading">
      <div><span className="eyebrow">Spielprotokoll</span><h2>{list.gameCount || games.length} Spiele</h2></div>
      <div className="panel-tools">
        <TableStyleSwitch value={style} onChange={chooseStyle} />
        <span className="dealer-note">{classic ? 'Spielpunkte noch ohne die +50 / −50 und ohne Gegnerbonus · Zeile antippen für Details' : 'Geberfolge läuft automatisch · Zeile antippen für Details'}</span>
      </div>
    </div>
    <div className="table-wrap"><table>
      <thead>
        <tr>
          {classic ? <>
            <th rowSpan={2}>#</th><th rowSpan={2}>Spielart</th><th rowSpan={2}>Spitzen</th><th rowSpan={2} className="num sep sign">+</th><th rowSpan={2} className="num sep sign">−</th>
          </> : <>
            <th>#</th><th>Geber</th><th>Alleinspieler</th><th>Spielart</th><th>Spitzen</th><th className="num">+/−</th><th>Ausgang</th>
          </>}
          {classic && lineup.map((name) => <th key={name} className="player-column" colSpan={3}>{name}</th>)}
          {classic && <th rowSpan={2} className="passed-col" title="Das wievielte eingepasste Spiel dieser Liste">Eingepasst</th>}
          {canEdit && <th className={classic ? 'sep' : undefined} rowSpan={classic ? 2 : undefined} />}
        </tr>
        {classic && <tr>{lineup.map((name) => <React.Fragment key={name}><th className="sub" title={`Spielpunkte von ${name} nach diesem Spiel – ohne die +50 / −50 und ohne Gegnerbonus`}>Spielpunkte</th><th className="sub" title={`Gewonnene Alleinspiele von ${name} bis hierher`}>Gew</th><th className="sub" title={`Verlorene Alleinspiele von ${name} bis hierher`}>Verl</th></React.Fragment>)}</tr>}
      </thead>
      <tbody>
        {games.length ? games.map((game) => <tr key={game.id} className={`game-row${classic && lineup.length > 0 && game.position % lineup.length === 0 ? ' round-end' : ''}`} role="button" tabIndex={0} title="Spieldetails anzeigen" onClick={() => onSelect(game)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(game) } }}>
          {classic ? <>
            <td className="round">{game.position}</td>
            {gameTypeCell(game)}
            <td>{matadorsLabel(game)}</td>
            <td className="value-cell num sep plus">{game.positiveGameValue || ''}</td>
            <td className="value-cell num sep minus">{game.negativeGameValue || ''}</td>
          </> : <>
            <td className="round">{game.position}</td>
            <td>{game.dealer}</td>
            <td>{game.passedOut ? <span className="muted">Eingepasst</span> : game.declarer}</td>
            {gameTypeCell(game)}
            <td>{matadorsLabel(game)}</td>
            {signedCell(game)}
            <td>{game.passedOut ? '—' : <span className={`result-dot ${game.won ? 'won' : 'lost'}`}>{outcomeLabel(game)}</span>}</td>
          </>}
          {classic && lineup.map((name) => {
            const declarer = !game.passedOut && game.declarer === name
            return <React.Fragment key={name}>
              <td className={`spielpunkte ${declarer ? 'declarer' : ''}`}>{declarer ? roundValue(game, name, 'points') ?? '' : ''}</td>
              <td className="spiel-count">{declarer && game.won === true ? roundValue(game, name, 'won') ?? '' : ''}</td>
              <td className="spiel-count">{declarer && game.won === false ? roundValue(game, name, 'lost') ?? '' : ''}</td>
            </React.Fragment>
          })}
          {classic && <td className="value-cell passed-col">{passedOutCounts.get(game.id) ?? ''}</td>}
          {canEdit && <td className={classic ? 'sep' : undefined}><button className="icon-button" title="Spiel bearbeiten" onClick={(event) => { event.stopPropagation(); onEdit(game) }}><Pencil size={15} /></button></td>}
        </tr>) : <tr><td colSpan={columns}><div className="table-empty"><ClipboardList size={22} /><span>Noch keine Spiele eingetragen.</span><small>Der erste Eintrag beginnt mit dem Geber aus Platz 1.</small></div></td></tr>}
        {summary && <>
          <tr className="summary summary-top">
            <td className="summary-label" colSpan={5}>Spielpunkte</td>
            {lineup.map((name) => <React.Fragment key={name}>
              <td className="value-cell spielpunkte">{playerSum(name, (player) => player.points)}</td>
              <td className="value-cell spiel-count">{playerSum(name, (player) => player.won)}</td>
              <td className="value-cell spiel-count">{playerSum(name, (player) => player.lost)}</td>
            </React.Fragment>)}
            <td className="value-cell passed-col" title="Eingepasste Spiele dieser Liste">{results.passedOutCount}</td>
            {canEdit && <td className="sep" />}
          </tr>
          <tr className="summary">
            <td className="summary-label" colSpan={5}>(+ gewonnene - verlorene Spiele) * 50</td>
            {lineup.map((name) => <td key={name} className="value-cell spielpunkte" colSpan={3}>{signedValue(playerSum(name, (player) => player.wonBonus + player.lossPenalty))}</td>)}
            <td className="passed-col" />
            {canEdit && <td className="sep" />}
          </tr>
          <tr className="summary">
            <td className="summary-label" colSpan={5}>Punkte durch gewonnene Gegenspiele</td>
            {lineup.map((name) => <td key={name} className="value-cell spielpunkte" colSpan={3}>{signedValue(playerSum(name, (player) => player.opponentBonus))}</td>)}
            <td className="passed-col" />
            {canEdit && <td className="sep" />}
          </tr>
          <tr className="summary">
            <td className="summary-label" colSpan={5}>Endergebnis</td>
            {lineup.map((name) => <td key={name} className="value-cell spielpunkte" colSpan={3}>{signedValue(playerSum(name, (player) => player.total))}</td>)}
            <td className="passed-col" />
            {canEdit && <td className="sep" />}
          </tr>
        </>}
      </tbody>
    </table></div>
    {children}
  </section>
}

/**
 * Schalter zwischen den beiden Darstellungen des Spielprotokolls: links "Modern"
 * (kompakt, wie vor den Spieler-Blöcken), rechts "Klassisch" (mit Spielpunkten,
 * Gew und Verl je Spieler).
 */
function TableStyleSwitch({ value, onChange }) {
  const classic = value === 'classic'
  const action = classic ? 'Moderne Darstellung des Spielprotokolls zeigen' : 'Klassische Darstellung des Spielprotokolls zeigen'
  return <button type="button" className={`table-style ${classic ? 'classic' : ''}`} title={action} aria-label={action} aria-pressed={classic} onClick={() => onChange(classic ? 'modern' : 'classic')}>
    <span className={classic ? '' : 'active'}>Modern</span>
    <span className="switch"><i /></span>
    <span className={classic ? 'active' : ''}>Klassisch</span>
  </button>
}

/** Passwortfeld mit Auge-Button – "Passwort anzeigen" ohne Browser-Add-on. */
function PasswordField({ label, value, onChange, placeholder, required, minLength }) {
  const [visible, setVisible] = useState(false)
  const action = visible ? 'Passwort verbergen' : 'Passwort anzeigen'
  return <label>{label}<span className="password-field"><input required={required} minLength={minLength} type={visible ? 'text' : 'password'} value={value} onChange={onChange} placeholder={placeholder} /><button type="button" className="password-toggle" title={action} aria-label={action} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16} /> : <Eye size={16} />}</button></span></label>
}

/**
 * Die Spieler einer Liste werden aus dem Roster des Turniers gewählt statt
 * geschrieben. Die Reihenfolge der Auswahl ist die Sitzreihenfolge – Platz 1
 * gibt in Runde 1.
 */
function LineupPicker({ players = [], value = [], onChange, canManagePlayers = true, min, max }) {
  const toggle = (name) => {
    if (value.includes(name)) return onChange(value.filter((entry) => entry !== name))
    if (max && value.length >= max) return undefined
    return onChange([...value, name])
  }
  return <fieldset className="lineup-picker">
    <legend>Spieler in Sitzreihenfolge</legend>
    <p>{players.length ? 'Antippen wählt aus – die Reihenfolge der Auswahl ist die Sitzreihenfolge.' : canManagePlayers ? 'Noch keine Spieler im Roster. Lege zuerst unten im Roster Namen an.' : 'Noch keine Spieler im Roster. Ein Admin muss zuerst Namen anlegen.'}</p>
    <div className="lineup-choices">{players.map((player) => {
      const seat = value.indexOf(player.name)
      return <button type="button" key={player.name} className={`lineup-choice ${seat >= 0 ? 'selected' : ''}`} disabled={seat < 0 && Boolean(max) && value.length >= max} onClick={() => toggle(player.name)}>{seat >= 0 ? <b>{seat + 1}</b> : <Plus size={13} />}{player.name}</button>
    })}</div>
    <div className="lineup-status"><span className={min && value.length >= min ? 'ok' : ''}>{min && max ? `${value.length} von ${min} bis ${max} gewählt` : `${value.length} gewählt`}</span>{value.length > 0 && <button type="button" className="text-button" onClick={() => onChange([])}>Auswahl leeren</button>}</div>
  </fieldset>
}

function ProgressChart({ eyebrow, title, note, labels, series, scale, onScale, scales, children }) {
  return <div className="chart-block">
    <div className="chart-head">
      <div><span className="eyebrow">{eyebrow}</span><h3>{title}</h3></div>
      <div className="chart-controls">
        <label className="chart-scale">Skalierung<select value={scale} onChange={(event) => onScale(event.target.value)}>{scales.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        {children}
      </div>
    </div>
    <LineChart labels={labels} series={series} />
    {note && <p className="chart-note">{note}</p>}
  </div>
}

/** Ein Spiel im Detail – inklusive Spielstand vor und nach dieser Runde. */
function GameDetail({ list, game, round, onClose, onEdit, onDelete }) {
  useEscape(onClose)
  useBackToClose(onClose)
  useScrollLock()
  if (!game) return null
  const { delta = {}, before = {}, after = {} } = round ?? {}
  const lineup = (list.players || []).map((player) => player.name)
  const levels = levelsOf(game)
  // Die "+/-"-Zahl des Spielprotokolls ist der Betrag, den die Runde dem
  // Alleinspieler bringt; der Bonus darin ist die Differenz zum Spielwert, damit
  // hier keine Regel doppelt steht.
  const ownValue = game.positiveGameValue || game.negativeGameValue || 0
  const ownResult = game.passedOut || !game.declarer || !(game.declarer in delta) ? null : delta[game.declarer]
  const ownBonus = ownResult === null ? 0 : Math.abs(ownResult) - ownValue
  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal detail-modal" role="dialog" aria-modal="true" aria-label="Spieldetails" onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose}><X size={18} /></button>
      <span className="eyebrow">{list.matchday} · Serie {list.series} · Tisch {list.table}</span>
      <h2>Runde {game.position}: {outcomeLabel(game)}</h2>
      <p className="modal-copy">{game.passedOut ? `Eingepasst – ${game.dealer} gab. In dieser Runde wurde kein Spiel gespielt.` : `${game.declarer} spielte allein, ${game.dealer} war Geber.`}</p>
      <div className="detail-grid">
        <div className="detail-item"><span>Spielart</span><strong>{gameTypeLabel(game.gameType)}</strong>{levels.length > 0 && <div className="level-badges">{levels.map((level) => <span key={level.key} className={`level-badge ${level.announced ? 'announced' : ''}`} title={level.title}>{level.short}</span>)}</div>}</div>
        <div className="detail-item"><span>Spitzen</span><strong>{matadorsLabel(game)}</strong></div>
        <div className="detail-item"><span>Spielwert</span><strong>{game.passedOut ? '—' : game.gameValue}</strong></div>
        <div className="detail-item"><span>Positiver Wert</span><strong>{game.positiveGameValue ? `+${game.positiveGameValue}` : '—'}</strong></div>
        <div className="detail-item"><span>Negativer Wert</span><strong>{game.negativeGameValue ? `−${game.negativeGameValue}` : '—'}</strong></div>
        <div className="detail-item"><span>Ergebnis dieser Runde</span><strong>{ownResult === null ? '—' : signedValue(ownResult)}</strong></div>
        <div className="detail-item"><span>Am Tisch</span><strong>{game.players?.join(', ') || '—'}</strong></div>
        <div className="detail-item"><span>Setzt aus</span><strong>{game.sittingOutPlayers?.length ? game.sittingOutPlayers.join(', ') : '—'}</strong></div>
      </div>
      {!game.passedOut && round && <table className="detail-table"><thead><tr><th>Spieler</th><th>Konto vorher</th><th>Diese Runde</th><th>Konto nachher</th></tr></thead><tbody>{lineup.map((name) => <tr key={name} className={name === game.declarer ? 'declarer' : ''}><td>{name}{name === game.declarer && <span className="declarer-flag">Alleinspieler</span>}</td><td>{before[name] ?? 0}</td><td className={delta[name] > 0 ? 'delta-up' : delta[name] < 0 ? 'delta-down' : 'muted'}>{delta[name] === 0 ? '0' : signedValue(delta[name])}</td><td><strong>{after[name] ?? 0}</strong></td></tr>)}</tbody></table>}
      {!game.passedOut && !round && <p className="detail-note">Der Spielstand dieser Runde wird gerade vom Server geladen …</p>}
      {ownResult !== null && <p className="detail-note">{`${game.won ? `Spielwert ${ownValue}` : `Doppelter Spielwert ${ownValue}`} plus ${ownBonus} = ${signedValue(ownResult)} für ${game.declarer} – das ist die Zahl aus der "+/−"-Spalte des Spielprotokolls.`}</p>}
      <p className="detail-note">{game.passedOut ? 'Ein eingepasstes Spiel verändert kein Konto.' : 'Ein gewonnenes Alleinspiel bringt den Spielwert plus 50, ein verlorenes kostet den doppelten Spielwert plus 50. Der Gegnerbonus für ein verlorenes Alleinspiel eines Mitspielers ist schon eingerechnet.'}</p>
      {game.note && <p className="detail-note"><strong>Notiz:</strong> {game.note}</p>}
      <p className="detail-note">Eingetragen am {new Date(game.createdAt).toLocaleString('de-DE')}.</p>
      <div className="modal-actions">{onDelete && <button type="button" className="secondary-button danger" onClick={onDelete}><Trash2 size={16} /> Löschen</button>}<button type="button" className="secondary-button" onClick={onClose}>Schließen</button>{onEdit && <button type="button" className="primary-button" onClick={onEdit}><Pencil size={16} /> Spiel bearbeiten</button>}</div>
    </div>
  </div>
}

function GameWizard({ list, existingGame, token, tournamentId, onClose, onSave }) {
  useEscape(onClose)
  useBackToClose(onClose)
  useScrollLock()
  // Ein bestehendes Spiel beginnt beim Ergebnis – außer einem eingepassten: das
  // hat keine Spiel-Eigenschaften, hier geht es von vorne los (Alleinspieler
  // wählen oder es eingepasst lassen).
  const [step, setStep] = useState(existingGame && !existingGame.passedOut ? 4 : 1)
  // In welche Richtung der nächste Schritt gleitet – vorwärts von links, zurück von rechts.
  const [direction, setDirection] = useState('forward')
  // Der Server liefert für ein Nullspiel `matadors: null` – im Wizard bleiben die
  // Spitzen aber immer ein Objekt, sonst bricht Schritt 3 zusammen (Zurückgehen
  // vom Ergebnis).
  const [game, setGame] = useState(existingGame ? { ...initialGame, ...existingGame, matadors: existingGame.matadors ?? initialGame.matadors, nullVariant: existingGame.hand && existingGame.offen ? 'hand-offen' : existingGame.hand ? 'hand' : existingGame.offen ? 'offen' : 'normal' } : { ...initialGame, nullVariant: 'normal' })
  const [custom, setCustom] = useState(false)
  const players = list.players?.map((p) => p.name) || []
  const matadorChoices = [1, 2, 3, 4]
  const [nextRound, setNextRound] = useState(undefined)
  const [roundError, setRoundError] = useState('')
  const rules = useRules()
  const rule = gameTypeRules(rules, game.gameType)

  // Wer gibt und wer Alleinspieler sein darf, entscheidet das Backend: für eine
  // neue Runde wird die nächste Runde abgefragt, beim Bearbeiten stehen Geber und
  // die drei Spieler der Runde schon am Spiel selbst.
  useEffect(() => {
    if (existingGame) return
    request(`/tournaments/${tournamentId}/lists/${list.id}/next-round`, { token })
      .then(setNextRound)
      .catch((problem) => { setNextRound(null); setRoundError(problem.message) })
  }, [existingGame, list.id, tournamentId, token])

  const round = existingGame
    ? { position: existingGame.position, dealer: existingGame.dealer, playingPlayers: existingGame.players || [], sittingOutPlayers: existingGame.sittingOutPlayers ?? [] }
    : nextRound
  const dealer = round?.dealer ?? ''
  const playing = round?.playingPlayers ?? []
  const sittingOut = round?.sittingOutPlayers ?? []
  const roundNumber = round?.position ?? (list.gameCount || list.games?.length || 0) + 1
  const update = (key, value) => setGame({ ...game, [key]: value })

  // Eine Nullspiel-Ansage kennt kein Schneider/Schwarz – die Stufen werden
  // deshalb beim Wechsel auf Null zurückgesetzt, alles andere bleibt stehen.
  function selectGameType(id) {
    const isNull = id === 'NULL'
    setGame({
      ...game,
      gameType: id,
      nullVariant: isNull ? 'normal' : game.nullVariant,
      hand: isNull ? false : game.hand,
      offen: isNull ? false : game.offen,
      schneiderAnnounced: isNull ? false : game.schneiderAnnounced,
      schwarzAnnounced: isNull ? false : game.schwarzAnnounced,
      schneider: isNull ? false : game.schneider,
      schwarz: isNull ? false : game.schwarz,
    })
  }

  const canNext = step === 1 ? game.passedOut || playing.includes(game.declarer) : step === 2 ? game.gameType : step === 3 ? game.matadors.count : true
  // Ein Nullspiel kennt keine Spitzen: Schritt 3 wird in beide Richtungen
  // übersprungen – vorwärts (siehe `next`) und zurück von Schritt 4.
  const previousStep = step === 4 && game.gameType === 'NULL' ? 2 : step - 1

  function go(target) {
    setDirection(target > step ? 'forward' : 'back')
    setStep(target)
  }

  function next() {
    if (step === 1 && game.passedOut) return onSave({ passedOut: true, note: game.note })
    if (step === 2 && game.gameType === 'NULL') return go(4)
    if (step < 4) return go(step + 1)
    if (game.passedOut) return onSave({ passedOut: true, note: game.note })

    const { id, position, dealer, players: gamePlayers, gameValue, positiveGameValue, negativeGameValue, nullVariant, createdAt, updatedAt, matadors, ...payload } = game
    // Ein Nullspiel hat keine Spitzen, der Server lehnt sie dort ab.
    return onSave(game.gameType === 'NULL' ? payload : { ...payload, matadors })
  }

  const crumbs = [game.passedOut ? 'Eingepasst' : game.declarer, game.gameType ? gameTypeLabel(game.gameType) : null, game.gameType !== 'NULL' && game.matadors ? `${game.matadors.suit === 'WITH' ? 'Mit' : 'Ohne'} ${game.matadors.count}` : null].filter(Boolean)

  return <div className="modal-backdrop wizard-backdrop" onClick={onClose}>
    <div className="wizard" role="dialog" aria-modal="true" aria-label="Spiel eintragen" onClick={(event) => event.stopPropagation()}>
      <div className="wizard-top">
        <div>
          <span className="eyebrow">Spiel {roundNumber}</span>
          <div className="breadcrumb"><span>→ Spiel {roundNumber}</span>{crumbs.map((crumb) => <React.Fragment key={crumb}><ChevronRight size={13} /><span className="crumb-current">{crumb}</span></React.Fragment>)}</div>
        </div>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="progress">{[1, 2, 3, 4].map((item) => <div key={item} className={`progress-step ${step >= item ? 'active' : ''} ${step === item ? 'current' : ''}`}><span>{item}</span><i /></div>)}</div>

      <div className="wizard-content">
        <div key={step} className={`wizard-step ${direction}`}>
        <div className="wizard-heading">
          <span className="eyebrow">Schritt {step} von 4</span>
          <h2>{step === 1 ? 'Wer ist Alleinspieler?' : step === 2 ? 'Welche Spielart?' : step === 3 ? 'Wie viele Spitzen?' : 'Wie ist das Ergebnis?'}</h2>
          <p>{step === 1 ? 'Der Geber für diese Runde wird automatisch bestimmt.' : step === 2 ? 'Wähle Grundwert und Ansagen für dieses Spiel.' : step === 3 ? 'Mit oder ohne Spitzen, bis ins Detail.' : 'Trage den tatsächlichen Spielausgang ein.'}</p>
        </div>

        {step === 1 && <div className="wizard-section">
          {roundError && <div className="error-message">{roundError}</div>}
          {!round && !roundError && <p className="wizard-hint">Die Runde wird beim Server abgefragt …</p>}
          {round && <p className="wizard-hint">Geber dieser Runde: <strong>{dealer}</strong> · es spielen <strong>{playing.join(', ')}</strong>{sittingOut.length > 0 && <> · {sittingOut.join(' und ')} {sittingOut.length > 1 ? 'setzen' : 'setzt'} aus</>}</p>}
          {round && <div className="choice-grid players-choice">{players.map((player) => {
            const sitsOut = !playing.includes(player)
            return <button key={player} className={`choice-card player-card ${game.declarer === player ? 'selected' : ''} ${sitsOut ? 'sitting-out' : ''}`} disabled={sitsOut} title={sitsOut ? `${player} sitzt diese Runde aus – Geber ist ${dealer}` : 'Als Alleinspieler wählen'} onClick={() => setGame({ ...game, declarer: player, passedOut: false })}><span className="avatar">{player[0]}</span><span>{player}</span>{game.declarer === player && <Check size={17} />}{sitsOut && <small className="sits-out-flag">setzt aus</small>}</button>
          })}</div>}
          <button className={`passed-button ${game.passedOut ? 'selected' : ''}`} onClick={() => setGame({ ...game, passedOut: true, declarer: '' })}><RotateCcw size={17} /><span><strong>Eingepasst</strong><small>Kein Alleinspieler in dieser Runde</small></span>{game.passedOut && <Check size={17} />}</button>
        </div>}

        {step === 2 && <div className="wizard-section">
          {!rules && <p className="wizard-hint">Regeln werden geladen …</p>}
          <div className="choice-grid game-type-grid">{gameTypes.map((type) => <button key={type.id} className={`choice-card game-type ${game.gameType === type.id ? 'selected' : ''}`} onClick={() => selectGameType(type.id)}><span className={`suit-icon suit-${type.id.toLowerCase()}`}>{type.symbol}</span><strong>{type.label}</strong><small>Grundwert {gameTypeRules(rules, type.id)?.baseValue ?? '…'}</small></button>)}</div>
          {game.gameType && <div className="options-block">{game.gameType === 'NULL' ? <NullVariantOptions variant={game.nullVariant} nullValues={rules?.nullValues} onChange={(option) => setGame({ ...game, ...option })} /> : <>
            <Toggle label="Hand" hint="Ohne Skataufnahme" checked={game.hand} onChange={(v) => setGame({ ...game, ...withLevelChain(ANNOUNCED_CHAIN, game, 'hand', v) })} />
            <div className="announces">
              <span className="option-label">Zusatz-Ansagen</span>
              <Toggle label="Schneider angesagt" checked={game.schneiderAnnounced} onChange={(v) => setGame({ ...game, ...withLevelChain(ANNOUNCED_CHAIN, game, 'schneiderAnnounced', v) })} />
              <Toggle label="Schwarz angesagt" checked={game.schwarzAnnounced} onChange={(v) => setGame({ ...game, ...withLevelChain(ANNOUNCED_CHAIN, game, 'schwarzAnnounced', v) })} />
              <Toggle label="Offen / Ouvert" checked={game.offen} onChange={(v) => setGame({ ...game, ...withLevelChain(ANNOUNCED_CHAIN, game, 'offen', v) })} />
              <small className="field-hint">Eine höhere Ansage schaltet die darunterliegenden automatisch mit – und eine abgeschaltete nimmt sie wieder weg.</small>
            </div>
          </>}</div>}
        </div>}

        {step === 3 && <div className="wizard-section">
          <div className="segmented">
            <button className={game.matadors.suit === 'WITH' ? 'active' : ''} onClick={() => setGame({ ...game, matadors: { ...game.matadors, suit: 'WITH' } })}>Mit</button>
            <button className={game.matadors.suit === 'WITHOUT' ? 'active' : ''} onClick={() => setGame({ ...game, matadors: { ...game.matadors, suit: 'WITHOUT' } })}>Ohne</button>
          </div>
          <div className="number-picker">
            {matadorChoices.map((n) => <button key={n} className={game.matadors.count === n ? 'selected' : ''} onClick={() => setGame({ ...game, matadors: { ...game.matadors, count: n } })}>{n}</button>)}
            {rule?.maxMatadors === 11 && <button className={game.matadors.count > 4 ? 'selected wide' : 'wide'} onClick={() => setCustom(true)}>Mehr …</button>}
          </div>
          <div className="tip-box"><span className="tip-number">i</span><p>{!rule ? 'Regeln werden geladen …' : rule.maxMatadors === 4 ? 'Bei Grand sind maximal 4 Spitzen möglich.' : `Bei Farbspielen kannst du bis ${rule.maxMatadors} Spitzen wählen.`}</p></div>
          {custom && <div className="mini-modal"><label>Exakte Anzahl Spitzen<input type="number" min="1" max={rule?.maxMatadors} value={game.matadors.count} onChange={(e) => setGame({ ...game, matadors: { ...game.matadors, count: Number(e.target.value) } })} /></label><button className="primary-button" onClick={() => setCustom(false)}>Übernehmen</button></div>}
        </div>}

        {step === 4 && <div className="wizard-section">
          <div className="result-picker">
            <button className={game.won ? 'selected won-choice' : ''} onClick={() => update('won', true)}><span>✓</span><strong>Gewonnen</strong><small>Der Spielwert wird gutgeschrieben</small></button>
            <button className={!game.won ? 'selected lost-choice' : ''} onClick={() => update('won', false)}><span>×</span><strong>Verloren</strong><small>Der doppelte Spielwert wird abgezogen</small></button>
          </div>
          {game.gameType !== 'NULL' && <div className="options-block">
            <span className="option-label">Erreichte Stufen</span>
            <Toggle label="Schneider gespielt" checked={game.schneider} onChange={(v) => setGame({ ...game, ...withLevelChain(PLAYED_CHAIN, game, 'schneider', v) })} />
            <Toggle label="Schwarz gespielt" checked={game.schwarz} onChange={(v) => setGame({ ...game, ...withLevelChain(PLAYED_CHAIN, game, 'schwarz', v) })} />
            <small className="field-hint">Schwarz gespielt heißt immer auch Schneider gespielt.</small>
          </div>}
        </div>}
        </div>
      </div>

      <div className="wizard-footer">
        <button className="secondary-button" onClick={() => step > 1 ? go(previousStep) : onClose()}><ArrowLeft size={16} /> {step > 1 ? 'Zurück' : 'Abbrechen'}</button>
        <button className="primary-button" disabled={!canNext} onClick={next}>{step === 4 || (step === 2 && game.gameType === 'NULL') || game.passedOut ? (existingGame ? 'Spiel aktualisieren' : 'Spiel eintragen') : 'Weiter'} <ArrowRight size={16} /></button>
      </div>
    </div>
  </div>
}

/**
 * Das Änderungsprotokoll des Turniers – unten im Footer erreichbar und für
 * Mitglieder und Admins gleichermaßen einsehbar.
 */
function TournamentLog({ tournament, token, onClose }) {
  useEscape(onClose)
  useBackToClose(onClose)
  useScrollLock()
  const [entries, setEntries] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tournament?.id) return
    request(`/tournaments/${tournament.id}/log?limit=100`, { token })
      .then((result) => setEntries(result || []))
      .catch((problem) => setError(problem.message))
  }, [tournament?.id, token])

  if (!tournament?.id) return null

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal log-modal" role="dialog" aria-modal="true" aria-label="Protokoll der Änderungen" onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose}><X size={18} /></button>
      <span className="eyebrow">Protokoll</span>
      <h2>Was geändert wurde</h2>
      <p className="modal-copy">Jede Änderung im Turnier, neueste zuerst. Einträge mit „Admin“ stammen aus dem Admin-Passwort.</p>
      {error && <div className="error-message">{error}</div>}
      {!entries && !error && <Skeleton lines={3} />}
      {entries?.length === 0 && <p className="log-empty">Noch keine Änderungen protokolliert.</p>}
      <ol className="log-list">{entries?.map((entry) => {
        const { title, detail } = describeAuditEntry(entry)
        return <li key={entry.id} className={`log-entry ${entry.role === 'ADMIN' ? 'admin' : ''}`}>
          <div className="log-entry-head"><strong>{title}</strong><span className={`role-chip ${entry.role === 'ADMIN' ? 'admin' : ''}`}>{auditRoleLabel(entry.role)}</span></div>
          {detail && <p>{detail}</p>}
          <time>{formatTimestamp(entry.createdAt)}</time>
        </li>
      })}</ol>
    </div>
  </div>
}

function Toggle({ label, hint, checked, disabled, onChange }) { return <button className={`toggle-row ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}`} disabled={disabled} onClick={() => onChange(!checked)}><span className="fake-check">{checked && <Check size={13} />}</span><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span></button> }

/** Die Null-Varianten – ihre festen Spielwerte kommen aus `GET /rules`. */
function NullVariantOptions({ variant, nullValues, onChange }) {
  const variants = [['normal', 'Null Einfach', 'plain', false, false], ['hand', 'Null Hand', 'hand', true, false], ['offen', 'Null Offen', 'offen', false, true], ['hand-offen', 'Null Hand Offen', 'handOffen', true, true]]
  return <div className="null-options"><span className="option-label">Null-Variante</span>{variants.map(([id, label, key, hand, offen]) => <button type="button" key={id} className={`null-option ${variant === id ? 'selected' : ''}`} onClick={() => onChange({ nullVariant: id, hand, offen })}><span>{label}</span><strong>{nullValues?.[key] ?? '…'}</strong></button>)}</div>
}

createRoot(document.getElementById('root')).render(<App />)
