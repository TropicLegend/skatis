import { gameTypeLabel, shortDate } from './skat.js'

/**
 * Wording of the change log ("Protokoll").
 *
 * The API stores only stable keys (`game.created`) and the numbers behind a
 * change, so the German sentences live here – the log can be reworded without
 * touching stored entries. Unknown actions fall back to the raw key instead of
 * disappearing, so a newer backend is still readable.
 */

const ROLE_LABELS = { ADMIN: 'Admin', MEMBER: 'Mitglied' }
const WEEKDAY_LABELS = { 1: 'Mo', 2: 'Di', 3: 'Mi', 4: 'Do', 5: 'Fr', 6: 'Sa', 7: 'So' }

export function auditRoleLabel(role) {
  return ROLE_LABELS[role] ?? role
}

/** "19.09.2026, 22:15" – when something happened. */
export function formatTimestamp(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return String(iso ?? '')
  return date.toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "19.09. · Serie 1 · Tisch 3" – the place of a list. */
function slotText(details) {
  return [
    details?.matchday ? shortDate(details.matchday) : null,
    details?.series === undefined ? null : `Serie ${details.series}`,
    details?.table === undefined ? null : `Tisch ${details.table}`,
  ]
    .filter(Boolean)
    .join(' · ')
}

function listSummary(name, items) {
  return Array.isArray(items) && items.length > 0 ? `${name}: ${items.join(', ')}` : null
}

/** "Runde 3 · Bert · Kreuz · 48 gewonnen" – what a game did. */
function gameText(details) {
  const parts = []
  if (details?.position !== undefined) parts.push(`Runde ${details.position}`)
  if (details?.declarer) parts.push(details.declarer)
  if (details?.gameType) parts.push(gameTypeLabel(details.gameType))
  if (typeof details?.gameValue === 'number') {
    const outcome = details.won === true ? 'gewonnen' : details.won === false ? 'verloren' : null
    parts.push([details.gameValue, outcome].filter(Boolean).join(' '))
  }
  return parts.join(' · ')
}

/**
 * A log entry as a title plus one line of detail. Everything is best effort: a
 * missing field just leaves that part out.
 */
export function describeAuditEntry(entry) {
  const details = entry?.details ?? {}

  switch (entry?.action) {
    case 'tournament.updated': {
      const changed = Array.isArray(details.changed) ? details.changed : []
      const parts = []
      if (changed.includes('name')) parts.push(`Name: ${details.name ?? '–'}`)
      if (changed.includes('matchdays')) {
        const days = Array.isArray(details.matchdays) ? details.matchdays : []
        parts.push(`Spieltage: ${days.map((day) => WEEKDAY_LABELS[day] ?? day).join(', ')}`)
      }
      if (changed.includes('matchdayWindows')) {
        const windows = details.matchdayWindows && typeof details.matchdayWindows === 'object' ? details.matchdayWindows : {}
        const spans = Object.entries(windows).map(([day, span]) => `${WEEKDAY_LABELS[day] ?? day} ${String(span).replace('-', '–')}`)
        parts.push(`Spielzeiten: ${spans.length ? spans.join(', ') : 'keine'}`)
      }
      if (changed.includes('password')) parts.push('Neues Spieler-Passwort gesetzt')
      return { title: 'Turnier-Einstellungen geändert', detail: parts.join(' · ') }
    }
    case 'list.created':
      return {
        title: 'Liste angelegt',
        detail: [slotText(details), listSummary('Spieler', details.playerNames)]
          .filter(Boolean)
          .join(' · '),
      }
    case 'list.deleted':
      return {
        title: 'Liste gelöscht',
        detail: [slotText(details), details.gameCount ? `${details.gameCount} Spiele` : null]
          .filter(Boolean)
          .join(' · '),
      }
    case 'list.submitted':
      return { title: 'Liste abgegeben', detail: slotText(details) }
    case 'list.reopened':
      return { title: 'Liste wieder geöffnet', detail: slotText(details) }
    case 'list.lineup_changed':
      return {
        title: 'Spieler der Liste geändert',
        detail: [slotText(details), listSummary('Spieler', details.playerNames)]
          .filter(Boolean)
          .join(' · '),
      }
    case 'game.created':
      return { title: 'Spiel eingetragen', detail: gameText(details) }
    case 'game.updated':
      return { title: 'Spiel geändert', detail: gameText(details) }
    case 'game.deleted':
      return { title: 'Spiel gelöscht', detail: gameText(details) }
    case 'player.added':
      return { title: 'Spieler hinzugefügt', detail: details.name ?? '' }
    case 'player.renamed':
      return {
        title: 'Spieler umbenannt',
        detail: details.from && details.to ? `${details.from} → ${details.to}` : '',
      }
    case 'player.removed':
      return { title: 'Spieler entfernt', detail: details.name ?? '' }
    default:
      return { title: entry?.action ?? 'Änderung', detail: '' }
  }
}
