import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, CircleHelp, ClipboardList, LogOut, Pencil, Plus, RotateCcw, Trophy, Users, X, Trash2, LockKeyhole, UnlockKeyhole } from 'lucide-react'
import './styles.css'

const API = 'https://skatis.online/api'
const today = new Date().toISOString().slice(0, 10)
const weekdays = [['1', 'Montag'], ['2', 'Dienstag'], ['3', 'Mittwoch'], ['4', 'Donnerstag'], ['5', 'Freitag'], ['6', 'Samstag'], ['7', 'Sonntag']]

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
const gameTypes = [
  { id: 'KREUZ', label: 'Kreuz', symbol: '♣', value: 12 },
  { id: 'PIK', label: 'Pik', symbol: '♠', value: 11 },
  { id: 'HERZ', label: 'Herz', symbol: '♥', value: 10 },
  { id: 'KARO', label: 'Karo', symbol: '♦', value: 9 },
  { id: 'GRAND', label: 'Grand', symbol: '✦', value: 24 },
  { id: 'NULL', label: 'Null', symbol: '∅', value: 23 },
]

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

function Shell({ children, tournament, role, onLogout, eyebrow = 'Turnierbüro' }) {
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
    <footer className="site-footer"><span>SKATIS</span><span>{eyebrow} · {new Date().getFullYear()}</span></footer>
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
        {mode === 'login' ? <><label>Turnier-ID<input required value={form.id} onChange={(e) => update('id', e.target.value.toUpperCase())} placeholder="z. B. K7M2P4QX" /></label><label>Passwort<input required type="password" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Dein Turnierpasswort" /></label></> : <><label>Turniername<input required minLength="3" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Mittwochsrunde" /></label><label>Spieler-Passwort<input required type="password" minLength="8" value={form.password} onChange={(e) => update('password', e.target.value)} placeholder="Mindestens 8 Zeichen" /></label><label>Admin-Passwort<input required type="password" minLength="8" value={form.adminPassword} onChange={(e) => update('adminPassword', e.target.value)} placeholder="Für spätere Korrekturen" /></label><MatchdayPicker value={form.matchdays} onChange={(matchdays) => update('matchdays', matchdays)} /></>}
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
  const [filter, setFilter] = useState('all')
  const filtered = lists.filter((list) => filter === 'all' || list.matchday === filter)
  const days = [...new Set(lists.map((list) => list.matchday))]
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
  return <Shell tournament={tournament} role={role} onLogout={onLogout} eyebrow="Übersicht"><div className="dashboard-header"><div><span className="eyebrow">{tournament?.id}</span><h1>Die Spieltage</h1><p className="lede">Alle Listen deines Turniers auf einen Blick.</p></div><div className="dashboard-actions">{role === 'ADMIN' && <button className="secondary-button" onClick={() => setShowSettings(true)}><CalendarDays size={16} /> Turnier verwalten</button>}<button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> Neue Liste</button></div></div>
    {notice && <div className="error-message inline">{notice}</div>}
    <div className="stats-row"><div className="stat"><span>Listen gesamt</span><strong>{lists.length}</strong><ClipboardList size={19} /></div><div className="stat"><span>Spieltage</span><strong>{days.length}</strong><CalendarDays size={19} /></div><div className="stat"><span>Turniermodus</span><strong>{tournament?.matchdays?.length || 1}× / Woche</strong><Users size={19} /></div></div>
    <div className="section-heading"><div><span className="eyebrow">Archiv & heute</span><h2>Listen</h2></div><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Alle Spieltage</option>{days.map((day) => <option key={day}>{day}</option>)}</select></div>
    <div className="list-grid">{filtered.length ? filtered.map((list) => <ListCard key={list.id} list={list} ranking={listRankings[list.id]} onClick={() => onOpenList(list)} />) : <div className="empty-state"><ClipboardList size={28} /><h3>Noch keine Liste angelegt</h3><p>Lege die erste Tischliste für den nächsten Spieltag an.</p><button className="secondary-button" onClick={() => setShowCreate(true)}>Liste anlegen</button></div>}</div>
    {standing && <TournamentRanking standing={standing} />}
    <section className="roster-panel"><div><span className="eyebrow">Turnier-Roster</span><h2>Spieler</h2><p>Diese Namen können in Tischlisten gesetzt werden.</p></div><div className="roster-content"><div className="player-tags">{players.length ? players.map((player) => editingPlayer === player.name ? <form className="player-tag-edit" key={player.name} onSubmit={(event) => renamePlayer(event, player.name)}><input autoFocus required maxLength="64" value={editedPlayerName} onChange={(event) => setEditedPlayerName(event.target.value)} /><button className="icon-button" type="submit" title="Namen speichern"><Check size={14} /></button><button className="icon-button" type="button" title="Abbrechen" onClick={() => setEditingPlayer(null)}><X size={14} /></button></form> : <span className="player-tag" key={player.name}>{player.name}<button className="icon-button" type="button" title={`${player.name} umbenennen`} onClick={() => startEditing(player)}><Pencil size={13} /></button></span>) : <span className="muted">Noch keine Spieler hinzugefügt</span>}</div><form className="player-form" onSubmit={addPlayer}><input required maxLength="64" value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="Name hinzufügen" /><button className="primary-button" title="Spieler hinzufügen"><Plus size={17} /></button></form>{playerError && <div className="error-message">{playerError}</div>}</div></section>
    {showCreate && <CreateListModal token={token} tournament={tournament} onClose={() => setShowCreate(false)} onCreated={async () => { setShowCreate(false); await onCreated() }} />}
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
  async function submit(event) { event.preventDefault(); setError(''); try { const updated = await request(`/tournaments/${tournament.id}`, { method: 'PATCH', token, body: { matchdays, ...(password ? { adminPassword: password } : {}) } }); onUpdated(updated) } catch (problem) { setError(problem.message) } }
  return <div className="modal-backdrop"><div className="modal settings-modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">Admin-Bereich</span><h2>Turnier verwalten</h2><p className="modal-copy">Lege fest, an welchen Wochentagen Listen erstellt und gespielt werden können.</p><form onSubmit={submit}><MatchdayPicker value={matchdays} onChange={setMatchdays} /><label>Neues Admin-Passwort optional<input type="password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Leer lassen, wenn unverändert" /></label>{error && <div className="error-message">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button">Änderungen speichern <Check size={16} /></button></div></form></div></div>
}

function ListCard({ list, ranking, onClick }) { return <button className="list-card" onClick={onClick}><div className="list-card-top"><span className={`status ${list.status === 'SUBMITTED' ? 'submitted' : ''}`}>{list.status === 'SUBMITTED' ? 'Abgegeben' : 'Offen'}</span><ChevronRight size={17} /></div><div className="date-line"><CalendarDays size={16} />{list.matchday}</div><h3>Tisch {list.table}<small>Serie {list.series}</small></h3><div className="player-line">{list.players?.length ? list.players.map((player) => <span key={player.name}>{player.name}</span>) : <span className="muted">Noch keine Spieler</span>}</div>{ranking?.players?.length > 0 && <div className="mini-ranking"><span>Aktueller Stand</span>{ranking.players.slice().sort((a, b) => b.total - a.total).map((player) => <div key={player.name}><span>{player.name}</span><strong>{player.total}</strong></div>)}</div>}<div className="card-footer"><span>{list.gameCount || 0} Spiele</span><span>{list.totalGameValue || 0} Punkte</span></div></button> }

function TournamentRanking({ standing }) { return <section className="tournament-ranking"><div className="ranking-heading"><div><span className="eyebrow">Gesamtes Turnier</span><h2>Rangliste</h2></div><span>{standing.listsCounted} gewertete Listen</span></div><div className="ranking-table"><div className="ranking-header"><span>Rang</span><span>Spieler</span><span>Spiele</span><span>Ø Punkte</span><span>Gesamt</span></div>{standing.players.map((player) => <div className="ranking-row" key={player.name}><strong>{player.rank ?? '–'}</strong><span>{player.name}</span><span>{player.gamesPlayed}</span><span>{player.averageScore ?? '–'}</span><strong>{player.score}</strong></div>)}</div></section> }

function CreateListModal({ token, tournament, onClose, onCreated }) {
  const [form, setForm] = useState({ matchday: today, series: 1, table: 1, playerNames: '' }); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { await request(`/tournaments/${tournament.id}/lists`, { method: 'POST', token, body: { matchday: form.matchday, series: Number(form.series), table: Number(form.table), playerNames: form.playerNames.split(',').map((name) => name.trim()).filter(Boolean) } }); await onCreated() } catch (err) { setError(err.message) } finally { setBusy(false) } }
  return <div className="modal-backdrop"><div className="modal"><button className="modal-close" onClick={onClose}><X size={18} /></button><span className="eyebrow">Neue Tischliste</span><h2>Ein Blatt, ein Abend.</h2><p className="modal-copy">Definiere den Tisch und die Sitzreihenfolge. Die erste Person gibt in Runde eins.</p><form onSubmit={submit}><div className="form-grid"><label>Spieltag<input type="date" required value={form.matchday} onChange={(e) => setForm({ ...form, matchday: e.target.value })} /></label><label>Serie<input type="number" min="1" value={form.series} onChange={(e) => setForm({ ...form, series: e.target.value })} /></label><label>Tisch<input type="number" min="1" value={form.table} onChange={(e) => setForm({ ...form, table: e.target.value })} /></label></div><label>Spieler in Sitzreihenfolge<input required placeholder="Anna, Bert, Clara, Dora" value={form.playerNames} onChange={(e) => setForm({ ...form, playerNames: e.target.value })} /><small>Mit Komma trennen · 3 bis 5 Spieler</small></label>{error && <div className="error-message">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Abbrechen</button><button className="primary-button" disabled={busy}>{busy ? 'Wird angelegt …' : <>Liste anlegen <ArrowRight size={17} /></>}</button></div></form></div></div>
}

function ListWorkspace({ list, tournament, role, token, onBack, onLogout, onUpdated }) {
  const [showWizard, setShowWizard] = useState(false); const [editingGame, setEditingGame] = useState(null); const [notice, setNotice] = useState(''); const [results, setResults] = useState(null)
  async function loadResults() { const result = await request(`/tournaments/${tournament.id}/lists/${list.id}/results`, { token }); setResults(result) }
  async function saveGame(game) { try { const isEditing = Boolean(editingGame); const path = isEditing ? `/tournaments/${tournament.id}/lists/${list.id}/games/${editingGame.id}` : `/tournaments/${tournament.id}/lists/${list.id}/games`; const saved = await request(path, { method: isEditing ? 'PUT' : 'POST', token, body: game }); const games = isEditing ? list.games.map((item) => item.id === saved.id ? saved : item) : [...(list.games || []), saved]; onUpdated({ ...list, games, gameCount: games.length, totalGameValue: games.reduce((sum, item) => sum + (item.gameValue || 0), 0) }); await loadResults(); setShowWizard(false); setEditingGame(null); setNotice(isEditing ? 'Spiel wurde aktualisiert.' : 'Spiel wurde eingetragen.') } catch (e) { setNotice(e.message) } }
  async function updateList(action) { try { const path = `/tournaments/${tournament.id}/lists/${list.id}/${action}`; const updated = await request(path, { method: 'POST', token }); onUpdated(updated); setNotice(action === 'submit' ? 'Liste wurde geschlossen.' : 'Liste wurde wieder geöffnet.') } catch (e) { setNotice(e.message) } }
  async function deleteList() { if (!window.confirm('Diese Liste inklusive aller Spiele löschen?')) return; try { await request(`/tournaments/${tournament.id}/lists/${list.id}`, { method: 'DELETE', token }); onBack() } catch (e) { setNotice(e.message) } }
  useEffect(() => { loadResults().catch((error) => setNotice(error.message)) }, [list.id])
  return <Shell tournament={tournament} role={role} onLogout={onLogout} eyebrow="Tischliste"><div className="workspace-head"><button className="back-link" onClick={onBack}><ArrowLeft size={16} /> Übersicht</button><div className="workspace-title"><span className="eyebrow">{list.matchday} · Serie {list.series} · Tisch {list.table}</span><h1>Tisch {list.table}</h1><span className={`status ${list.status === 'SUBMITTED' ? 'submitted' : ''}`}>{list.status === 'SUBMITTED' ? 'Geschlossen' : 'Offen'}</span></div><div className="workspace-actions">{role === 'ADMIN' && list.status === 'SUBMITTED' ? <button className="secondary-button" onClick={() => updateList('reopen')}><UnlockKeyhole size={16} /> Öffnen</button> : <button className="secondary-button" disabled={list.locked} onClick={() => updateList('submit')}><LockKeyhole size={16} /> Schließen</button>}{role === 'ADMIN' && <button className="icon-button danger" title="Liste löschen" onClick={deleteList}><Trash2 size={18} /></button>}<button className="primary-button" disabled={list.locked} onClick={() => { setEditingGame(null); setShowWizard(true) }}><Plus size={17} /> Spiel eintragen</button></div></div>{notice && <div className="success-message">{notice}</div>}<div className="workspace-grid"><GameTable list={list} role={role} onEdit={(game) => { setEditingGame(game); setShowWizard(true) }} /><aside className="score-card"><div className="score-card-head"><span className="eyebrow">Ergebnistabelle</span><Trophy size={20} /></div>{results?.players?.length ? results.players.map((player) => <div className="score-row" key={player.name}><span>{player.name}</span><strong>{player.total}</strong></div>) : (list.players || []).map((player) => <div className="score-row" key={player.name}><span>{player.name}</span><strong>0</strong></div>)}<div className="score-total"><span>Rundenwert</span><strong>{results?.totalGameValue ?? list.totalGameValue ?? 0}</strong></div></aside></div>{showWizard && <GameWizard list={list} existingGame={editingGame} onClose={() => { setShowWizard(false); setEditingGame(null) }} onSave={saveGame} />}</Shell>
}

function GameTable({ list, role, onEdit }) { return <section className="games-panel"><div className="panel-heading"><div><span className="eyebrow">Spielprotokoll</span><h2>{list.gameCount || list.games?.length || 0} Spiele</h2></div><span className="dealer-note">Geberfolge läuft automatisch</span></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Geber</th><th>Alleinspieler</th><th>Spielart</th><th>Spitzen</th><th>Wert</th><th>Ausgang</th>{role === 'ADMIN' && <th />}</tr></thead><tbody>{list.games?.length ? list.games.map((game) => <tr key={game.id}><td className="round">{game.position}</td><td>{game.dealer}</td><td>{game.passedOut ? <span className="muted">Eingepasst</span> : game.declarer}</td><td>{game.gameType || '—'}</td><td>{game.matadors ? `${game.matadors.suit === 'WITH' ? 'Mit' : 'Ohne'} ${game.matadors.count}` : '—'}</td><td className="value-cell">{game.gameValue || 0}</td><td>{game.passedOut ? '—' : <span className={`result-dot ${game.won ? 'won' : 'lost'}`}>{game.won ? 'Gewonnen' : 'Verloren'}</span>}</td>{role === 'ADMIN' && <td><button className="icon-button" title="Spiel bearbeiten" onClick={(event) => { event.stopPropagation(); onEdit(game) }}><Pencil size={15} /></button></td>}</tr>) : <tr><td colSpan={role === 'ADMIN' ? 8 : 7}><div className="table-empty"><ClipboardList size={22} /><span>Noch keine Spiele eingetragen.</span><small>Der erste Eintrag beginnt mit dem Geber aus Platz 1.</small></div></td></tr>}</tbody></table></div></section> }

function GameWizard({ list, existingGame, onClose, onSave }) {
  const [step, setStep] = useState(existingGame ? (existingGame.passedOut || existingGame.gameType === 'NULL' ? 4 : 4) : 1); const [game, setGame] = useState(existingGame ? { ...initialGame, ...existingGame, nullVariant: existingGame.hand && existingGame.offen ? 'hand-offen' : existingGame.hand ? 'hand' : existingGame.offen ? 'offen' : 'normal' } : { ...initialGame, nullVariant: 'normal' }); const [custom, setCustom] = useState(false); const players = list.players?.map((p) => p.name) || []
  const update = (key, value) => setGame({ ...game, [key]: value })
  useEffect(() => {
    if (step !== 2 || game.gameType !== 'NULL') return undefined
    const handToggle = document.querySelector('.options-block > .toggle-row')
    if (handToggle) handToggle.style.display = 'none'
    const selectVariant = (event) => {
      const target = event.target instanceof Element ? event.target : null
      const button = target?.closest('.null-option')
      if (!button) return
      const label = button.textContent || ''
      const variant = label.includes('Hand Offen') ? 'hand-offen' : label.includes('Hand') ? 'hand' : label.includes('Offen') ? 'offen' : 'normal'
      setGame((current) => ({ ...current, nullVariant: variant, hand: variant === 'hand' || variant === 'hand-offen', offen: variant === 'offen' || variant === 'hand-offen' }))
    }
    document.querySelectorAll('.null-option').forEach((button) => {
      const label = button.textContent || ''
      const selected = game.nullVariant === 'hand-offen' ? label.includes('Null Hand Offen') : game.nullVariant === 'hand' ? label.includes('Null Hand') && !label.includes('Offen') : game.nullVariant === 'offen' ? label.includes('Null Offen') : label.includes('Null Einfach')
      button.classList.toggle('selected', selected)
    })
    document.addEventListener('click', selectVariant, true)
    return () => {
      document.removeEventListener('click', selectVariant, true)
      if (handToggle) handToggle.style.display = ''
    }
  }, [step, game.gameType, game.nullVariant])
  const canNext = step === 1 ? game.declarer || game.passedOut : step === 2 ? game.gameType : step === 3 ? game.matadors.count : true
  function next() { if (step === 1 && game.passedOut) return onSave({ passedOut: true, note: game.note }); if (step === 2 && game.gameType === 'NULL') return setStep(4); if (step < 4) setStep(step + 1); else if (game.passedOut) onSave({ passedOut: true, note: game.note }); else { const { id, position, dealer, players: gamePlayers, gameValue, positiveGameValue, negativeGameValue, nullVariant, createdAt, updatedAt, matadors, ...payload } = game; onSave(game.gameType === 'NULL' ? payload : { ...payload, matadors }) } }
  const crumbs = [game.passedOut ? 'Eingepasst' : game.declarer, game.gameType && game.gameType, game.gameType !== 'NULL' && game.matadors ? `${game.matadors.suit === 'WITH' ? 'Mit' : 'Ohne'} ${game.matadors.count}` : null].filter(Boolean)
  return <div className="modal-backdrop wizard-backdrop"><div className="wizard"><div className="wizard-top"><div><span className="eyebrow">Spiel {list.gameCount + 1}</span><div className="breadcrumb"><span>→ Spiel {list.gameCount + 1}</span>{crumbs.map((crumb) => <React.Fragment key={crumb}><ChevronRight size={13} /><span className="crumb-current">{crumb}</span></React.Fragment>)}</div></div><button className="modal-close" onClick={onClose}><X size={18} /></button></div><div className="progress">{[1, 2, 3, 4].map((item) => <div key={item} className={`progress-step ${step >= item ? 'active' : ''} ${step === item ? 'current' : ''}`}><span>{item}</span><i /></div>)}</div><div className="wizard-content"><div className="wizard-heading"><span className="eyebrow">Schritt {step} von 4</span><h2>{step === 1 ? 'Wer spielt allein?' : step === 2 ? 'Welche Spielart?' : step === 3 ? 'Wie viele Spitzen?' : 'Wie ist das Ergebnis?'}</h2><p>{step === 1 ? 'Der Geber für diese Runde wird automatisch bestimmt.' : step === 2 ? 'Wähle Grundwert und Ansagen für dieses Spiel.' : step === 3 ? 'Mit oder ohne Spitzen, bis ins Detail.' : 'Trage den tatsächlichen Spielausgang ein.'}</p></div>{step === 1 && <div className="wizard-section"><div className="choice-grid players-choice">{players.map((player) => <button key={player} className={`choice-card player-card ${game.declarer === player ? 'selected' : ''}`} onClick={() => setGame({ ...game, declarer: player, passedOut: false })}><span className="avatar">{player[0]}</span><span>{player}</span>{game.declarer === player && <Check size={17} />}</button>)}</div><button className={`passed-button ${game.passedOut ? 'selected' : ''}`} onClick={() => setGame({ ...game, passedOut: true, declarer: '' })}><RotateCcw size={17} /><span><strong>Eingepasst</strong><small>Kein Alleinspieler in dieser Runde</small></span>{game.passedOut && <Check size={17} />}</button></div>}{step === 2 && <div className="wizard-section"><div className="choice-grid game-type-grid">{gameTypes.map((type) => <button key={type.id} className={`choice-card game-type ${game.gameType === type.id ? 'selected' : ''}`} onClick={() => setGame({ ...game, gameType: type.id, hand: type.id === 'NULL' ? false : game.hand })}><span className={`suit-icon suit-${type.id.toLowerCase()}`}>{type.symbol}</span><strong>{type.label}</strong><small>Grundwert {type.value}</small></button>)}</div>{game.gameType && <div className="options-block"><Toggle label="Hand" hint="Ohne Skataufnahme" checked={game.hand} onChange={(v) => update('hand', v)} />{game.gameType !== 'NULL' && <div className="announces"><span className="option-label">Zusatz-Ansagen</span><Toggle label="Schneider angesagt" checked={game.schneiderAnnounced} disabled={!game.hand} onChange={(v) => update('schneiderAnnounced', v)} /><Toggle label="Schwarz angesagt" checked={game.schwarzAnnounced} disabled={!game.schneiderAnnounced} onChange={(v) => update('schwarzAnnounced', v)} /><Toggle label="Offen / Ouvert" checked={game.offen} disabled={!game.schwarzAnnounced} onChange={(v) => update('offen', v)} /></div>}{game.gameType === 'NULL' && <div className="null-options"><span className="option-label">Null-Variante</span>{[['normal', 'Null Einfach', 23], ['hand', 'Null Hand', 35], ['offen', 'Null Offen', 46], ['hand-offen', 'Null Hand Offen', 59]].map(([id, label, value]) => <button key={id} className="null-option"><span>{label}</span><strong>{value}</strong></button>)}</div>}</div>}</div>}{step === 3 && <div className="wizard-section"><div className="segmented"><button className={game.matadors.suit === 'WITH' ? 'active' : ''} onClick={() => setGame({ ...game, matadors: { ...game.matadors, suit: 'WITH' } })}>Mit</button><button className={game.matadors.suit === 'WITHOUT' ? 'active' : ''} onClick={() => setGame({ ...game, matadors: { ...game.matadors, suit: 'WITHOUT' } })}>Ohne</button></div><div className="number-picker">{[1, 2, 3, 4].map((n) => <button key={n} className={game.matadors.count === n ? 'selected' : ''} onClick={() => setGame({ ...game, matadors: { ...game.matadors, count: n } })}>{n}</button>)}<button className={game.matadors.count > 4 ? 'selected wide' : 'wide'} onClick={() => setCustom(true)}>Mehr …</button></div><div className="tip-box"><span className="tip-number">i</span><p>Bei Grand sind maximal 4 Spitzen möglich. Bei Farbspielen kannst du bis 11 wählen.</p></div>{custom && <div className="mini-modal"><label>Exakte Anzahl Spitzen<input type="number" min="1" max="11" value={game.matadors.count} onChange={(e) => setGame({ ...game, matadors: { ...game.matadors, count: Number(e.target.value) } })} /></label><button className="primary-button" onClick={() => setCustom(false)}>Übernehmen</button></div>}</div>}{step === 4 && <div className="wizard-section"><div className="result-picker"><button className={game.won ? 'selected won-choice' : ''} onClick={() => update('won', true)}><span>✓</span><strong>Gewonnen</strong><small>Der Spielwert wird gutgeschrieben</small></button><button className={!game.won ? 'selected lost-choice' : ''} onClick={() => update('won', false)}><span>×</span><strong>Verloren</strong><small>Der doppelte Spielwert wird abgezogen</small></button></div><div className="options-block"><span className="option-label">Erreichte Stufen</span><Toggle label="Schneider gespielt" checked={game.schneider} onChange={(v) => update('schneider', v)} /><Toggle label="Schwarz gespielt" checked={game.schwarz} disabled={!game.schneider} onChange={(v) => update('schwarz', v)} /></div></div>}</div><div className="wizard-footer"><button className="secondary-button" onClick={() => step > 1 ? setStep(step - 1) : onClose()}><ArrowLeft size={16} /> {step > 1 ? 'Zurück' : 'Abbrechen'}</button><button className="primary-button" disabled={!canNext} onClick={next}>{step === 4 || (step === 2 && game.gameType === 'NULL') || game.passedOut ? 'Spiel eintragen' : 'Weiter'} <ArrowRight size={16} /></button></div></div></div>
}

function Toggle({ label, hint, checked, disabled, onChange }) { return <button className={`toggle-row ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}`} disabled={disabled} onClick={() => onChange(!checked)}><span className="fake-check">{checked && <Check size={13} />}</span><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span></button> }

function NullVariantOptions({ variant, onChange }) {
  const variants = [['normal', 'Null Einfach', 23, false, false], ['hand', 'Null Hand', 35, true, false], ['offen', 'Null Offen', 46, false, true], ['hand-offen', 'Null Hand Offen', 59, true, true]]
  return <div className="null-options"><span className="option-label">Null-Variante</span>{variants.map(([id, label, value, hand, offen]) => <button type="button" key={id} className={`null-option ${variant === id ? 'selected' : ''}`} onClick={() => onChange({ nullVariant: id, hand, offen })}><span>{label}</span><strong>{value}</strong></button>)}</div>
}

createRoot(document.getElementById('root')).render(<App />)
