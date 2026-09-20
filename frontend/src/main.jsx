import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, ClipboardList, Eye, EyeOff, History, LogOut, Pencil, Plus, RotateCcw, Trophy, X, Trash2, LockKeyhole, UnlockKeyhole } from 'lucide-react'
import LineChart from './components/LineChart.jsx'
import { auditRoleLabel, describeAuditEntry, formatTimestamp } from './lib/audit.js'
import PieChart from './components/PieChart.jsx'
import { GAME_TYPES, gameTypeLabel, gameTypeRules, gameTypeSymbol, levelsOf, listProgressionChart, listScaleOptions, matadorsLabel, outcomeLabel, playerProgressChart, PROGRESS_SCALES, roundAccounts, scaleStep, shortDate, standingsProgressChart, SUIT_GAME_TYPES, withStep } from './lib/skat.js'
import './styles.css'

const API = 'https://skatis.online/api'
const today = new Date().toISOString().slice(0, 10)
const weekdays = [['1', 'Montag'], ['2', 'Dienstag'], ['3', 'Mittwoch'], ['4', 'Donnerstag'], ['5', 'Freitag'], ['6', 'Samstag'], ['7', 'Sonntag']]

/** "1" → "Montag" – die Tage, an denen ein Turnier gespielt wird. */
function weekdayLabel(day) {
  return weekdays.find(([value]) => Number(value) === Number(day))?.[1] ?? ''
}

/** Punkte mit Vorzeichen – `+170`, `−98`, `0`. */
function signedValue(value) {
  if (value > 0) return `+${value}`
  if (value < 0) return `−${Math.abs(value)}`
  return '0'
}

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}) },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const payload = response.status === 204 ? null : await response.json()
  if (!response.ok) throw new Error(payload?.error?.message || 'Die Anfrage konnte nicht verarbeitet werden.')
  return payload?.data
}

const initialGame = { passedOut: false, declarer: '', gameType: '', hand: false, schneiderAnnounced: false, schwarzAnnounced: false, offen: false, matadors: { suit: 'WITH', count: 1 }, schneider: false, schwarz: false, won: true, note: '' }
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

  async function login(id, password) {
    const session = await request(`/tournaments/${id.trim()}/session`, { method: 'POST', body: { password } })
    localStorage.setItem('skatis-token', session.token)
    localStorage.setItem('skatis-tournament', JSON.stringify(session.tournament))
    localStorage.setItem('skatis-role', session.role)
    setToken(session.token)
    setRole(session.role)
    setTournament(session.tournament)
    setView('dashboard')
  }

  async function createTournament(payload) {
    const created = await request('/tournaments', { method: 'POST', body: payload })
    await login(created.id, payload.adminPassword)
  }

  async function refreshLists() {
    if (!token || !tournament?.id) return
    const result = await request(`/tournaments/${tournament.id}/lists?limit=100`, { token })
    setLists(result || [])
  }

  async function openList(list) {
    const detail = await request(`/tournaments/${tournament.id}/lists/${list.id}`, { token })
    setSelectedList(detail)
    setView('list')
  }

  useEffect(() => {
    if (token && view === 'dashboard') refreshLists().catch((error) => setNotice(error.message))
  }, [token, tournament, view])

  function logout() {
    localStorage.removeItem('skatis-token')
    localStorage.removeItem('skatis-tournament')
    localStorage.removeItem('skatis-role')
    setToken(null); setRole(null); setTournament(null); setView('login'); setSelectedList(null)
  }

  if (view === 'login') return <Login onLogin={login} onCreate={createTournament} />
  if (view === 'dashboard') return <Dashboard tournament={tournament} role={role} lists={lists} notice={notice} onOpenList={openList} onLogout={logout} token={token} onCreated={refreshLists} onTournamentUpdated={(updated) => { setTournament(updated); localStorage.setItem('skatis-tournament', JSON.stringify(updated)) }} />
  return <ListWorkspace list={selectedList} tournament={tournament} role={role} token={token} onBack={() => setView('dashboard')} onLogout={logout} onUpdated={setSelectedList} />
}

function Shell({ children, tournament, role, token, onLogout, eyebrow = 'Turnierbüro' }) {
  const [showLog, setShowLog] = useState(false)
  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="brand-mark">S</span><span>skatis</span></div>
      <div className="topbar-right">
        {tournament && <span className="tournament-chip"><span className="chip-dot" />{tournament.name}<strong>{tournament.id}</strong></span>}
        {role && <span className={`role-chip ${role === 'ADMIN' ? 'admin' : ''}`}>{role === 'ADMIN' ? 'ADMIN' : 'MITGLIED'}</span>}
        <button className="icon-button" title="Hilfe"><CircleHelp size={18} /></button>
        <button className="icon-button" title="Abmelden" onClick={onLogout}><LogOut size={18} /></button>
      </div>
    </header>
    <main>{children}</main>
    <footer className="site-footer"><span>SKATIS</span><span className="footer-right"><button className="footer-button" title="Protokoll der Änderungen" onClick={() => setShowLog(true)}><History size={13} /> Protokoll</button>{eyebrow} · {new Date().getFullYear()}</span></footer>
    {showLog && <TournamentLog tournament={tournament} token={token} onClose={() => setShowLog(false)} />}

  </div>
}

function Login({ onLogin, onCreate }) {
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ id: '', password: '', name: '', adminPassword: '', matchdays: [3] })
  const update = (key, value) => setForm({ ...form, [key]: value })
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try { mode === 'login' ? await onLogin(form.id, form.password) : await onCreate({ name: form.name, password: form.password, adminPassword: form.adminPassword, matchdays: form.matchdays }) }
    catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <div className="login-page">
    <div className="login-art"><div className="art-kicker">DIE RUNDE BEGINNT HIER</div><h1>Gute Spiele.<br /><em>Gute Gesellschaft.</em></h1><p>Dein digitales Skatblatt für faire Runden, klare Ergebnisse und Turniere, die bleiben.</p><div className="art-stamp"><Trophy size={16} /> Ergebnistabelle inklusive</div></div>
    <div className="login-panel">
      <div className="panel-intro"><span className="eyebrow">Willkommen zurück</span><h2>{mode === 'login' ? 'Turnier öffnen' : 'Neues Turnier anlegen'}</h2><p>{mode === 'login' ? 'Mit deiner Turnier-ID und dem Passwort gelangst du direkt an den Tisch.' : 'Erstelle den gemeinsamen Raum für deine nächste Skatrunde.'}</p></div>
      <div className="mode-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Einloggen</button><button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Turnier erstellen</button></div>
      <form onSubmit={submit}>
        {mode === 'login' ? <><label>Turnier-ID<input required value={form.id} onChange={(e) => update('id', e.target.value.toUpperCase())} placeholder="z. B. K7M2P4QX" /></label><PasswordField label="Passwort" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Dein Turnierpasswort" /></> : <><label>Turniername<input required minLength="3" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Mittwochsrunde" /></label><PasswordField label="Spieler-Passwort" required minLength={8} value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Mindestens 8 Zeichen" /><PasswordField label="Admin-Passwort" required minLength={8} value={form.adminPassword} onChange={(e) => update('adminPassword', e.target.value)} placeholder="Für spätere Korrekturen" /><MatchdayPicker value={form.matchdays} onChange={(matchdays) => update('matchdays', matchdays)} /></>}
        {error && <div className="error-message">{error}</div>}
        <button className="primary-button full" disabled={busy}>{busy ? 'Einen Moment …' : mode === 'login' ? <>Turnier öffnen <ArrowRight size={17} /></> : <>Turnier erstellen <Plus size={17} /></>}</button>
      </form>
      <p className="form-note">{mode === 'login' ? 'Noch kein Turnier? ' : 'Schon ein Turnier? '}<button className="text-button" onClick={() => setMode(mode === 'login' ? 'create' : 'login')}>{mode === 'login' ? 'Jetzt anlegen' : 'Einloggen'}</button></p>
    </div>
  </div>
}

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
  const [detailPlayer, setDetailPlayer] = useState(null)
  const [filter, setFilter] = useState('all')
  const filtered = lists.filter((list) => filter === 'all' || list.matchday === filter)
  const days = [...new Set(lists.map((list) => list.matchday))]
  // An welchen Wochentagen gespielt werden kann – Namen statt einer Zahl.
  const matchdayNames = [...(tournament?.matchdays || [])].sort((a, b) => a - b).map((day) => weekdayLabel(day)).filter(Boolean)
  async function loadPlayers() { setPlayers(await request(`/tournaments/${tournament.id}/players`, { token })) }
  async function addPlayer(event) { event.preventDefault(); setPlayerError(''); try { await request(`/tournaments/${tournament.id}/players`, { method: 'POST', token, body: { name: playerName } }); setPlayerName(''); await loadPlayers() } catch (error) { setPlayerError(error.message) } }
  function startEditing(player) { setEditingPlayer(player.name); setEditedPlayerName(player.name); setPlayerError('') }
  async function renamePlayer(event, oldName) { event.preventDefault(); setPlayerError(''); try { await request(`/tournaments/${tournament.id}/players/${encodeURIComponent(oldName)}`, { method: 'PATCH', token, body: { name: editedPlayerName } }); setEditingPlayer(null); await loadPlayers() } catch (error) { setPlayerError(error.message) } }
  useEffect(() => { loadPlayers().catch((error) => setPlayerError(error.message)) }, [tournament?.id])
  useEffect(() => {
    Promise.all(lists.map(async (list) => [list.id, await request(`/tournaments/${tournament.id}/lists/${list.id}/results`, { token })]))
      .then((entries) => setListRankings(Object.fromEntries(entries)))
      .catch(() => setListRankings({}))
    request(`/tournaments/${tournament.id}/standings`, { token }).then(setStanding).catch(() => setStanding(null))
  }, [lists, tournament?.id, token])
  // Die Spieler-Details sind eine eigene Ansicht, kein Popup: sie treten an die
  // Stelle der Übersicht und haben Kopfzeile und Zurück-Link. Die Zahlen kommen
  // frisch aus der Rangliste, damit die Seite nach einem Nachladen mitzieht.
  if (detailPlayer) {
    const player = standing?.players?.find((entry) => entry.name === detailPlayer.name) ?? detailPlayer
    return <Shell tournament={tournament} role={role} onLogout={onLogout} token={token} eyebrow="Spieler">
      <PlayerView player={player} standing={standing} tournament={tournament} token={token} lists={lists} rankings={listRankings} onBack={() => setDetailPlayer(null)} onOpenList={onOpenList} />
    </Shell>
  }
  return <Shell tournament={tournament} role={role} onLogout={onLogout} token={token} eyebrow="Übersicht"><div className="dashboard-header"><div><span className="eyebrow">{tournament?.id}</span><h1>Die Spieltage</h1><p className="lede">Alle Listen deines Turniers auf einen Blick.</p></div><div className="dashboard-actions">{role === 'ADMIN' && <button className="secondary-button" onClick={() => setShowSettings(true)}><CalendarDays size={16} /> Turnier verwalten</button>}<button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> Neue Liste</button></div></div>
    {notice && <div className="error-message inline">{notice}</div>}
    <div className="stats-row"><div className="stat"><span>Listen gesamt</span><strong>{lists.length}</strong><ClipboardList size={19} /></div><div className="stat"><span>Spieltage</span><strong>{days.length}</strong><CalendarDays size={19} /></div><div className="stat"><span>Turniertage</span><strong className="days" title={matchdayNames.length ? `Gespielt wird ${matchdayNames.join(', ')}` : 'Noch keine Spieltage festgelegt'}>{matchdayNames.length ? matchdayNames.join(', ') : 'Noch keine'}</strong><CalendarDays size={19} /></div></div>
    <div className="section-heading"><div><span className="eyebrow">Archiv & heute</span><h2>Listen</h2></div><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Alle Spieltage</option>{days.map((day) => <option key={day}>{day}</option>)}</select></div>
    <div className="list-grid">{filtered.length ? filtered.map((list) => <ListCard key={list.id} list={list} ranking={listRankings[list.id]} onClick={() => onOpenList(list)} />) : <div className="empty-state"><ClipboardList size={28} /><h3>Noch keine Liste angelegt</h3><p>Lege die erste Tischliste für den nächsten Spieltag an.</p><button className="secondary-button" onClick={() => setShowCreate(true)}>Liste anlegen</button></div>}</div>
    {standing && <TournamentRanking standing={standing} tournament={tournament} token={token} onOpenPlayer={setDetailPlayer} />} 
    <section className="roster-panel"><div><span className="eyebrow">Turnier-Roster</span><h2>Spieler</h2><p>Diese Namen können in Tischlisten gesetzt werden – neue Namen und Korrekturen macht der Admin.</p></div><div className="roster-content"><div className="player-tags">{players.length ? players.map((player) => editingPlayer === player.name ? <form className="player-tag-edit" key={player.name} onSubmit={(event) => renamePlayer(event, player.name)}><input autoFocus required maxLength="64" value={editedPlayerName} onChange={(event) => setEditedPlayerName(event.target.value)} /><button className="icon-button" type="submit" title="Namen speichern"><Check size={14} /></button><button className="icon-button" type="button" title="Abbrechen" onClick={() => setEditingPlayer(null)}><X size={14} /></button></form> : <span className="player-tag" key={player.name}>{player.name}{role === 'ADMIN' && <button className="icon-button" type="button" title={`${player.name} umbenennen`} onClick={() => startEditing(player)}><Pencil size={13} /></button>}</span>) : <span className="muted">Noch keine Spieler hinzugefügt</span>}</div>{role === 'ADMIN' ? <form className="player-form" onSubmit={addPlayer}><input required maxLength="64" value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Name hinzufügen" /><button className="primary-button" title="Spieler hinzufügen"><Plus size={17} /></button></form> : <p className="roster-hint">Nur der Admin kann Spieler hinzufügen oder umbenennen.</p>}{playerError && <div className="error-message">{playerError}</div>}</div></section>
    {showCreate && <CreateListModal token={token} tournament={tournament} players={players} lists={lists} canManagePlayers={role === 'ADMIN'} onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await onCreated() }} />}
    {showSettings && <TournamentSettings token={token} tournament={tournament} onClose={() => setShowSettings(false)} onUpdated={(updated) => { onTournamentUpdated(updated); setShowSettings(false) }} />}
  </Shell>
}

function MatchdayPicker({ value, onChange }) {
  function toggle(day) { onChange(value.includes(day) ? value.filter((item) => item !== day) : [...value, day].sort()) }
  return <fieldset className="matchday-picker"><legend>Spieltage</legend><p>Wähle mindestens einen Wochentag für die Turnierrunde.</p><div>{weekdays.map(([day, label]) => <button type="button" key={day} className={value.includes(Number(day)) ? 'selected' : ''} onClick={() => toggle(Number(day))}><span>{day}</span>{label}</button>)}</div></fieldset>
}

function TournamentSettings({ token, tournament, onClose, onUpdated }) {
  const [matchdays, setMatchdays] = useState(tournament.matchdays || [])
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  async function submit(event) { event.preventDefault(); setError(''); try { const updated = await request(`/tournaments/${tournament.id}`, { method: 'PATCH', token, body: { matchdays, ...(password ? { password } : {}) } }); onUpdated(updated) } catch (problem) { setError(problem.message) } }
  return <div className="modal-backdrop"><div className="modal settings-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">Admin-Bereich</span><h2>Turnier verwalten</h2><p className="modal-copy">Lege fest, an welchen Wochentagen Listen erstellt und gespielt werden können. Das Admin-Passwort bleibt, wie es beim Anlegen gesetzt wurde.</p><form onSubmit={submit}><MatchdayPicker value={matchdays} onChange={setMatchdays} /><PasswordField label="Neues Spieler-Passwort optional" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leer lassen, wenn unverändert" /><small className="field-hint">Damit loggen sich die Mitglieder ein. Das Admin-Passwort lässt sich nicht ändern.</small>{error && <div className="error-message">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button">Änderungen speichern <Check size={16} /></button></div></form></div></div>
}

function ListCard({ list, ranking, onClick }) { return <button className="list-card" onClick={onClick}><div className="list-card-top"><span className={`status ${list.status === 'SUBMITTED' ? 'submitted' : ''}`}>{list.status === 'SUBMITTED' ? 'Abgegeben' : 'Offen'}</span><ChevronRight size={17} /></div><div className="date-line"><CalendarDays size={16} />{list.matchday}</div><h3>Tisch {list.table}<small>Serie {list.series}</small></h3><div className="player-line">{list.players?.length ? list.players.map((player) => <span key={player.name}>{player.name}</span>) : <span className="muted">Noch keine Spieler</span>}</div>{ranking?.players?.length > 0 && <div className="mini-ranking"><span>{list.status === 'SUBMITTED' ? 'Endergebnis' : 'Aktueller Stand'}</span>{ranking.players.slice().sort((a, b) => b.total - a.total).map((player) => <div key={player.name}><span>{player.name}</span><strong>{player.total}</strong></div>)}</div>}<div className="card-footer"><span>{list.gameCount || 0} Spiele</span><span>{list.totalGameValue || 0} Punkte</span></div></button> }

function TournamentRanking({ standing, tournament, token, onOpenPlayer }) {
  const [scale, setScale] = useState(PROGRESS_SCALES[0].id)
  const [histories, setHistories] = useState({})
  const [historyError, setHistoryError] = useState('')

  // Der Verlauf kommt aus `standings/history`: dieselben Zahlen wie die Tabelle
  // darunter, nur datiert. Jede Skalierung wird einmal geholt und gemerkt.
  useEffect(() => {
    if (!tournament?.id || histories[scale]) return undefined
    let active = true
    request(`/tournaments/${tournament.id}/standings/history?groupBy=${scale}`, { token })
      .then((history) => { if (active) setHistories((current) => ({ ...current, [scale]: history })) })
      .catch((problem) => { if (active) setHistoryError(problem.message) })
    return () => { active = false }
  }, [tournament?.id, token, scale, histories])

  const history = histories[scale]
  const chart = standingsProgressChart(history)
  return <section className="tournament-ranking">
    <div className="ranking-heading"><div><span className="eyebrow">Gesamtes Turnier</span><h2>Rangliste</h2></div><span>{standing.listsCounted} gewertete Listen · Spieler antippen für Details</span></div>
    <div className="ranking-table">
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
    </div>
    <ProgressChart eyebrow="Punkteentwicklung" title="Durchschnittspunkte im Turnier" note="Ø Punkte je Spiel – dieselben Zahlen wie die Spalte „Ø Punkte“ der Rangliste. Die Skalierung fasst die Zeitachse zusammen." labels={chart.labels} series={chart.series} scale={scale} onScale={setScale} scales={PROGRESS_SCALES} />
    {historyError && <div className="error-message">{historyError}</div>}
    {!history && !historyError && <p className="chart-note">Der Verlauf wird geladen …</p>}
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
      .then((history) => { if (active) setHistories((current) => ({ ...current, [scale]: history })) })
      .catch((problem) => { if (active) setHistoryError(problem.message) })
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
      .catch((problem) => { if (active) setStatsError(problem.message) })
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
  // Farbspiele getrennt: „Lieblingsfarben“ nach Häufigkeit, „Beste Farben“ nach
  // Gewinnchance – beides aus den Zahlen des Servers, hier wird nur sortiert.
  const suits = (stats?.gameTypes ?? []).filter((entry) => SUIT_GAME_TYPES.includes(entry.gameType))
  const favourite = [...suits].sort((a, b) => b.played - a.played || a.gameType.localeCompare(b.gameType))
  const bestSuits = [...suits].sort((a, b) => (b.winShare ?? 0) - (a.winShare ?? 0) || b.played - a.played)
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
        {!stats && !statsError && <p className="chart-note">Die Spielstatistiken werden geladen …</p>}
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
          {item('Hand angesagt', percentLabel(stats.hand.share), `${stats.hand.played} von ${stats.declarer.played} Alleinspielen`)}
          {item('Hand gewonnen', percentLabel(stats.hand.winShare), `${stats.hand.won} von ${stats.hand.played}`)}
          {item('Gegenspiele gewonnen', percentLabel(stats.defender.winShare), `${stats.defender.won} von ${stats.defender.played}`)}
        </div>}
      </section>
    </div>

    <section className="player-panel">
      <ProgressChart eyebrow="Entwicklung" title="Punkte über die Zeit" note="Der Kontostand nach jedem Zeitraum – er wächst nur durch eigene Alleinspiele und die Boni; die Skalierung fasst die Zeitachse zusammen." labels={chart.labels} series={chart.series} scale={scale} onScale={setScale} scales={PROGRESS_SCALES} />
      {historyError && <div className="error-message">{historyError}</div>}
      {!history && !historyError && <p className="chart-note">Der Verlauf wird geladen …</p>}
    </section>

    <section className="player-panel">
      <div className="section-heading"><div><span className="eyebrow">Spielarten</span><h2>Grand, Null und Farbspiel</h2></div><span className="dealer-note">Anteil an seinen {stats?.declarer.played ?? '–'} Alleinspielen</span></div>
      {stats && <div className="pie-layout">
        <PieChart slices={pieSlices} centerLabel="Alleinspiele" emptyHint="Noch keine Alleinspiele eingetragen." />
        <div className="bar-lists">
          <div>
            <div className="section-heading"><div><span className="eyebrow">Farben</span><h3>Lieblingsfarben</h3></div><span className="dealer-note">nach Häufigkeit</span></div>
            {favourite.length ? <ul className="bar-list">{favourite.map((entry) => barRow(entry, `${entry.played}×`, entry.share, `${entry.share} % seiner Alleinspiele · ${entry.won} gewonnen`))}</ul> : <p className="chart-note">Noch kein Farbspiel gespielt.</p>}
          </div>
          <div>
            <div className="section-heading"><div><span className="eyebrow">Farben</span><h3>Beste Farben</h3></div><span className="dealer-note">nach Gewinnchance</span></div>
            {bestSuits.length ? <ul className="bar-list">{bestSuits.map((entry) => barRow(entry, percentLabel(entry.winShare), entry.winShare ?? 0, `${entry.won} von ${entry.played} gewonnen`))}</ul> : <p className="chart-note">Noch kein Farbspiel gespielt.</p>}
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

function CreateListModal({ token, tournament, players = [], lists = [], canManagePlayers = true, onClose, onCreated }) {
  const rules = useRules()
  const [form, setForm] = useState({ matchday: today, series: 1, table: 1 }); const [lineup, setLineup] = useState([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  // Ein Tisch spielt immer nur eine Liste: solange die Liste zu diesem Spieltag,
  // dieser Serie und diesem Tisch offen ist, darf keine zweite entstehen. Der
  // Server prüft dasselbe noch einmal – hier spart es nur den Fehlversuch.
  const blocking = lists.find((list) => list.status === 'OPEN' && !list.counted && list.matchday === form.matchday && Number(list.series) === Number(form.series) && Number(list.table) === Number(form.table))
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { await request(`/tournaments/${tournament.id}/lists`, { method: 'POST', token, body: { matchday: form.matchday, series: Number(form.series), table: Number(form.table), playerNames: lineup } }); await onCreated() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">Neue Tischliste</span><h2>Ein Blatt, ein Abend.</h2><p className="modal-copy">Definiere den Tisch und die Sitzreihenfolge. Die erste Person gibt in Runde eins.</p><form onSubmit={submit}><div className="form-grid"><label>Spieltag<input type="date" required value={form.matchday} onChange={(e) => setForm({ ...form, matchday: e.target.value })} /></label><label>Serie<input type="number" min="1" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} /></label><label>Tisch<input type="number" min="1" value={form.table} onChange={(e) => setForm({ ...form, table: e.target.value })} /></label></div><LineupPicker players={players} value={lineup} onChange={setLineup} canManagePlayers={canManagePlayers} min={rules?.lineup?.min} max={rules?.lineup?.max} />{blocking && <div className="error-message">Serie {form.series}, Tisch {form.table} spielt an diesem Spieltag noch: {blocking.players.map((player) => player.name).join(', ')}. Erst diese Liste abgeben – oder eine andere Serie bzw. einen anderen Tisch wählen.</div>}{error && <div className="error-message">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={busy || !rules || lineup.length < rules.lineup.min}>{busy ? 'Wird angelegt …' : !rules ? 'Regeln werden geladen …' : <>Liste anlegen <ArrowRight size={17} /></>}</button></div></form></div></div>
}

function ListWorkspace({ list, tournament, role, token, onBack, onLogout, onUpdated }) {
  const [showWizard, setShowWizard] = useState(false)
  const [editingGame, setEditingGame] = useState(null)
  const [detailGame, setDetailGame] = useState(null)
  const [notice, setNotice] = useState('')
  const [progression, setProgression] = useState(null)
  const [results, setResults] = useState(null)
  const [scale, setScale] = useState('round')
  const [customScale, setCustomScale] = useState(5)

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
    } catch (e) { setNotice(e.message) }
  }

  async function updateList(action) {
    try {
      const updated = await request(`/tournaments/${tournament.id}/lists/${list.id}/${action}`, { method: 'POST', token })
      onUpdated(updated)
      setNotice(action === 'submit' ? 'Liste wurde geschlossen.' : 'Liste wurde wieder geöffnet.')
    } catch (e) { setNotice(e.message) }
  }

  async function deleteList() {
    if (!window.confirm('Diese Liste inklusive aller Spiele löschen?')) return
    try { await request(`/tournaments/${tournament.id}/lists/${list.id}`, { method: 'DELETE', token }); onBack() } catch (e) { setNotice(e.message) }
  }

  useEffect(() => { loadDetails().catch((error) => setNotice(error.message)) }, [list.id])

  const lineup = (list.players || []).map((player) => player.name)
  const rounds = roundAccounts(progression)
  const scaleOptions = listScaleOptions(lineup.length)
  const roundsPerPoint = scaleStep(scale, lineup.length, customScale)
  const chart = withStep(listProgressionChart(progression), roundsPerPoint)
  const detailRound = detailGame ? rounds.find((round) => round.position === detailGame.position) : null

  return <Shell tournament={tournament} role={role} onLogout={onLogout} token={token} eyebrow="Tischliste">
    <div className="workspace-head">
      <button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Übersicht</button>
      <div className="workspace-title"><span className="eyebrow">{list.matchday} · Serie {list.series} · Tisch {list.table}</span><h1>Tisch {list.table}</h1><span className={`status ${list.status === 'SUBMITTED' ? 'submitted' : ''}`}>{list.status === 'SUBMITTED' ? 'Geschlossen' : 'Offen'}</span></div>
      <div className="workspace-actions">
        {role === 'ADMIN' && list.status === 'SUBMITTED' ? <button className="secondary-button" onClick={() => updateList('reopen')}><UnlockKeyhole size={16} /> Öffnen</button> : <button className="secondary-button" disabled={list.locked} onClick={() => updateList('submit')}><LockKeyhole size={16} /> Schließen</button>}
        {role === 'ADMIN' && <button className="icon-button danger" title="Liste löschen" onClick={deleteList}><Trash2 size={18} /></button>}
        <button className="primary-button" disabled={list.locked} onClick={() => { setEditingGame(null); setShowWizard(true) }}><Plus size={17} /> Spiel eintragen</button>
      </div>
    </div>
    {notice && <div className="success-message">{notice}</div>}
    <div className="workspace-grid">
      <GameTable list={list} rounds={rounds} results={results} role={role} onSelect={setDetailGame} onEdit={(game) => { setEditingGame(game); setShowWizard(true) }}>
        <ProgressChart eyebrow="Punkteentwicklung" title="Kontoverlauf dieser Liste" note="Punktekonto nach jedem Spiel dieser Liste – mit den Boni (+50 / −50 und der Gegnerbonus für verlorene Spiele der Mitspieler). Der letzte Punkt ist der Gesamtstand der Liste; eine Zeile der Tabelle antippen zeigt alle Details." labels={chart.labels} series={chart.series} scale={scale} onScale={setScale} scales={scaleOptions}>
          {scale === 'custom' && <label className="chart-custom">Runden je Punkt<input type="number" min="1" max="99" value={customScale} onChange={(event) => setCustomScale(event.target.value)} /></label>}
        </ProgressChart>
      </GameTable>
    </div>
    {showWizard && <GameWizard list={list} existingGame={editingGame} token={token} tournamentId={tournament.id} onClose={() => { setShowWizard(false); setEditingGame(null) }} onSave={saveGame} />}
    {detailGame && <GameDetail list={list} game={detailGame} round={detailRound} onClose={() => setDetailGame(null)} onEdit={role === 'ADMIN' ? () => { setDetailGame(null); setEditingGame(detailGame); setShowWizard(true) } : null} />}
  </Shell>
}

/** Die gewählte Darstellung des Spielprotokolls merkt sich der Browser. */
const TABLE_STYLE_KEY = 'skatis-table-style'

function GameTable({ list, rounds = [], results = null, role, onEdit, onSelect, children }) {
  const games = list.games || []
  const lineup = (list.players || []).map((player) => player.name)
  const roundsByPosition = new Map(rounds.map((round) => [round.position, round]))
  // "Klassisch" stellt hinter die Spielart je Spieler drei Unterspalten: seine
  // Spielpunkte nach dem Spiel (ohne die Boni) und die Zahl seiner bis dahin
  // gewonnenen bzw. verlorenen Alleinspiele – gefüllt wird immer nur die Spalte
  // des Alleinspielers. "Modern" lässt die Blöcke weg und zeigt nur die Zeile.
  const [style, setStyle] = useState(() => (localStorage.getItem(TABLE_STYLE_KEY) === 'classic' ? 'classic' : 'modern'))
  const classic = style === 'classic'
  function chooseStyle(next) { setStyle(next); localStorage.setItem(TABLE_STYLE_KEY, next) }
  const roundValue = (game, name, field) => roundsByPosition.get(game.position)?.[field]?.[name]
  const columns = (classic ? 6 + lineup.length * 3 : 7) + (role === 'ADMIN' ? 1 : 0)
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
          {role === 'ADMIN' && <th className={classic ? 'sep' : undefined} rowSpan={classic ? 2 : undefined} />}
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
          {role === 'ADMIN' && <td className={classic ? 'sep' : undefined}><button className="icon-button" title="Spiel bearbeiten" onClick={(event) => { event.stopPropagation(); onEdit(game) }}><Pencil size={15} /></button></td>}
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
            {role === 'ADMIN' && <td className="sep" />}
          </tr>
          <tr className="summary">
            <td className="summary-label" colSpan={5}>(+ gewonnene - verlorene Spiele) * 50</td>
            {lineup.map((name) => <td key={name} className="value-cell spielpunkte" colSpan={3}>{signedValue(playerSum(name, (player) => player.wonBonus + player.lossPenalty))}</td>)}
            <td className="passed-col" />
            {role === 'ADMIN' && <td className="sep" />}
          </tr>
          <tr className="summary">
            <td className="summary-label" colSpan={5}>Punkte durch gewonnene Gegenspiele</td>
            {lineup.map((name) => <td key={name} className="value-cell spielpunkte" colSpan={3}>{signedValue(playerSum(name, (player) => player.opponentBonus))}</td>)}
            <td className="passed-col" />
            {role === 'ADMIN' && <td className="sep" />}
          </tr>
          <tr className="summary">
            <td className="summary-label" colSpan={5}>Endergebnis</td>
            {lineup.map((name) => <td key={name} className="value-cell spielpunkte" colSpan={3}>{signedValue(playerSum(name, (player) => player.total))}</td>)}
            <td className="passed-col" />
            {role === 'ADMIN' && <td className="sep" />}
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
function GameDetail({ list, game, round, onClose, onEdit }) {
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
    <div className="modal detail-modal" onClick={(event) => event.stopPropagation()}>
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
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Schließen</button>{onEdit && <button type="button" className="primary-button" onClick={onEdit}><Pencil size={16} /> Spiel bearbeiten</button>}</div>
    </div>
  </div>
}

function GameWizard({ list, existingGame, token, tournamentId, onClose, onSave }) {
  const [step, setStep] = useState(existingGame ? 4 : 1)
  const [game, setGame] = useState(existingGame ? { ...initialGame, ...existingGame, nullVariant: existingGame.hand && existingGame.offen ? 'hand-offen' : existingGame.hand ? 'hand' : existingGame.offen ? 'offen' : 'normal' } : { ...initialGame, nullVariant: 'normal' })
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

  function next() {
    if (step === 1 && game.passedOut) return onSave({ passedOut: true, note: game.note })
    if (step === 2 && game.gameType === 'NULL') return setStep(4)
    if (step < 4) return setStep(step + 1)
    if (game.passedOut) return onSave({ passedOut: true, note: game.note })

    const { id, position, dealer, players: gamePlayers, gameValue, positiveGameValue, negativeGameValue, nullVariant, createdAt, updatedAt, matadors, ...payload } = game
    // Ein Nullspiel hat keine Spitzen, der Server lehnt sie dort ab.
    return onSave(game.gameType === 'NULL' ? payload : { ...payload, matadors })
  }

  const crumbs = [game.passedOut ? 'Eingepasst' : game.declarer, game.gameType ? gameTypeLabel(game.gameType) : null, game.gameType !== 'NULL' && game.matadors ? `${game.matadors.suit === 'WITH' ? 'Mit' : 'Ohne'} ${game.matadors.count}` : null].filter(Boolean)

  return <div className="modal-backdrop wizard-backdrop">
    <div className="wizard">
      <div className="wizard-top">
        <div>
          <span className="eyebrow">Spiel {roundNumber}</span>
          <div className="breadcrumb"><span>→ Spiel {roundNumber}</span>{crumbs.map((crumb) => <React.Fragment key={crumb}><ChevronRight size={13} /><span className="crumb-current">{crumb}</span></React.Fragment>)}</div>
        </div>
        <button className="modal-close" onClick={onClose}><X size={18} /></button>
      </div>

      <div className="progress">{[1, 2, 3, 4].map((item) => <div key={item} className={`progress-step ${step >= item ? 'active' : ''} ${step === item ? 'current' : ''}`}><span>{item}</span><i /></div>)}</div>

      <div className="wizard-content">
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
            <Toggle label="Hand" hint="Ohne Skataufnahme" checked={game.hand} onChange={(v) => update('hand', v)} />
            <div className="announces">
              <span className="option-label">Zusatz-Ansagen</span>
              <Toggle label="Schneider angesagt" checked={game.schneiderAnnounced} disabled={!game.hand} onChange={(v) => update('schneiderAnnounced', v)} />
              <Toggle label="Schwarz angesagt" checked={game.schwarzAnnounced} disabled={!game.schneiderAnnounced} onChange={(v) => update('schwarzAnnounced', v)} />
              <Toggle label="Offen / Ouvert" checked={game.offen} disabled={!game.schwarzAnnounced} onChange={(v) => update('offen', v)} />
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
            <Toggle label="Schneider gespielt" checked={game.schneider} onChange={(v) => update('schneider', v)} />
            <Toggle label="Schwarz gespielt" checked={game.schwarz} disabled={!game.schneider} onChange={(v) => update('schwarz', v)} />
          </div>}
        </div>}
      </div>

      <div className="wizard-footer">
        <button className="secondary-button" onClick={() => step > 1 ? setStep(step - 1) : onClose()}><ArrowLeft size={16} /> {step > 1 ? 'Zurück' : 'Abbrechen'}</button>
        <button className="primary-button" disabled={!canNext} onClick={next}>{step === 4 || (step === 2 && game.gameType === 'NULL') || game.passedOut ? 'Spiel eintragen' : 'Weiter'} <ArrowRight size={16} /></button>
      </div>
    </div>
  </div>
}

/**
 * Das Änderungsprotokoll des Turniers – unten im Footer erreichbar und für
 * Mitglieder und Admins gleichermaßen einsehbar.
 */
function TournamentLog({ tournament, token, onClose }) {
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
    <div className="modal log-modal" onClick={(event) => event.stopPropagation()}>
      <button className="modal-close" onClick={onClose}><X size={18} /></button>
      <span className="eyebrow">Protokoll</span>
      <h2>Was geändert wurde</h2>
      <p className="modal-copy">Jede Änderung im Turnier, neueste zuerst. Einträge mit „Admin“ stammen aus dem Admin-Passwort.</p>
      {error && <div className="error-message">{error}</div>}
      {!entries && !error && <p className="log-empty">Wird geladen …</p>}
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
