/**
 * Pure Helfer des Boards – kein React, kein Fetching.
 *
 * Hier stehen nur Beschriftungen und die Aufbereitung der Diagramme. Die Zahlen
 * selbst kommen aus der API: die Regeln aus `GET /rules`, die Ergebnistabelle aus
 * `…/lists/:listId/results`, der Kontoverlauf aus `…/progression` und der Verlauf
 * der Rangliste aus `…/standings/history`. Nachgerechnet wird hier nichts, damit
 * das Board nie etwas anderes zeigt als der Server rechnet.
 */

/**
 * Spielarten des Wizards – nur Beschriftung und Symbol, in der Reihenfolge der
 * Schritte. Grundwerte, Spitzen und die Null-Werte kommen aus `GET /rules`
 * (`gameTypeRules`): das Board zeigt so nie andere Zahlen als der Server rechnet.
 */
export const GAME_TYPES = [
  { id: 'KREUZ', label: 'Kreuz', symbol: '♣' },
  { id: 'PIK', label: 'Pik', symbol: '♠' },
  { id: 'HERZ', label: 'Herz', symbol: '♥' },
  { id: 'KARO', label: 'Karo', symbol: '♦' },
  { id: 'GRAND', label: 'Grand', symbol: '✦' },
  { id: 'NULL', label: 'Null', symbol: '∅' },
]

/** Line colours of the charts – muted, so they fit the paper-like surface. */
export const SERIES_COLORS = [
  '#db6f40',
  '#527b78',
  '#647867',
  '#b7522d',
  '#7d6a9c',
  '#bf5142',
  '#3f7a55',
  '#a1863f',
]

/**
 * The Gewinnstufen, in the order the backend counts them
 * (`hand, schneiderAnnounced, schwarzAnnounced, offen, schneider, schwarz`).
 */
const LEVELS = [
  ['hand', 'Hand', 'Hand gespielt – ohne Skataufnahme', false],
  ['schneiderAnnounced', 'Schneider ang.', 'Schneider angesagt', true],
  ['schwarzAnnounced', 'Schwarz ang.', 'Schwarz angesagt', true],
  ['offen', 'Offen', 'Offen (Ouvert) gespielt', false],
  ['schneider', 'Schneider', 'Schneider gespielt', false],
  ['schwarz', 'Schwarz', 'Schwarz gespielt', false],
]

export function gameTypeMeta(gameType) {
  return GAME_TYPES.find((type) => type.id === gameType) ?? null
}

/** "KREUZ" → "Kreuz"; unknown values are passed through for the admin to see. */
export function gameTypeLabel(gameType) {
  if (!gameType) return '—'
  return gameTypeMeta(gameType)?.label ?? gameType
}

/**
 * Die Regeln einer Spielart, wie `GET /rules` sie liefert: `baseValue` ist der
 * Grundwert, `maxMatadors` die höchste Zahl Spitzen (`null` bei Nullspielen).
 */
export function gameTypeRules(rules, gameType) {
  if (!gameType) return null
  return rules?.gameTypes?.find((type) => type.id === gameType) ?? null
}

/** The Gewinnstufen of a game that are set, as badges for the game table. */
export function levelsOf(game) {
  return LEVELS.filter(([key]) => Boolean(game?.[key])).map(([key, short, title, announced]) => ({
    key,
    short,
    title,
    announced,
  }))
}

/** "Mit 2" / "Ohne 3", or "—" for a null game. */
export function matadorsLabel(game) {
  if (!game?.matadors) return '—'
  return `${game.matadors.suit === 'WITH' ? 'Mit' : 'Ohne'} ${game.matadors.count}`
}

/** Headline of a game: how it ended. */
export function outcomeLabel(game) {
  if (!game || game.passedOut) return 'Eingepasst'
  return game.won ? 'Gewonnen' : 'Verloren'
}

// Die Geber-Regel (wer gibt, wer sitzt aus und wer darf Alleinspieler sein) lebt
// im Backend: `GET /lists/:listId/next-round` nennt Geber und die drei erlaubten
// Alleinspieler. So kann das Frontend nicht von dem abweichen, was `POST /games`
// annimmt – siehe `backend/src/modules/lists/round-preview.ts`.

/**
 * Der Kontostand vor und nach jeder Runde, wie ihn
 * `GET /lists/:listId/progression` liefert: `before` ist der Stand davor, `delta`
 * die Veränderung dieser Runde und `after` der Stand danach – der Spielstand
 * „vor und nach dem Spiel" einer Runde.
 */
export function roundAccounts(progression) {
  const names = progression?.lineup ?? []
  const zero = Object.fromEntries(names.map((name) => [name, 0]))
  const rounds = progression?.rounds ?? []

  return rounds.map((round, index) => ({
    position: round.position,
    dealer: round.dealer,
    declarer: round.declarer,
    // Der Server liefert den Stand nach jeder Runde; der Stand davor ist der der
    // vorigen Runde – vor der ersten Runde steht jedes Konto auf 0.
    before: { ...zero, ...(index === 0 ? {} : rounds[index - 1].accounts) },
    delta: { ...zero, ...round.deltas },
    after: { ...zero, ...round.accounts },
    // Spielpunkte (ohne Boni) und die Zähler, wie das Spielprotokoll sie zeigt.
    points: { ...zero, ...round.points },
    won: { ...zero, ...round.won },
    lost: { ...zero, ...round.lost },
  }))
}

/**
 * Der Kontoverlauf einer Liste als Chartdaten – ein Punkt je Runde. Labels und
 * Werte kommen aus der Progression des Servers, damit Diagramm und
 * Ergebnistabelle dieselben Zahlen zeigen.
 */
export function listProgressionChart(progression) {
  const names = progression?.lineup ?? []
  const rounds = progression?.rounds ?? []

  return {
    labels: ['Start', ...rounds.map((round) => `R${round.position}`)],
    series: names.map((name, index) => ({
      name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      values: [0, ...rounds.map((round) => round.accounts?.[name] ?? 0)],
    })),
  }
}

/**
 * Keeps every `step`-th point (and always the last one) – the "Skalierung" of
 * a chart. The values stay cumulative, so the last point is never cut off.
 */
export function withStep(chart, step = 1) {
  const every = Number(step) || 1
  if (every <= 1 || chart.labels.length <= 2) return chart

  const last = chart.labels.length - 1
  const keep = (_, index) => index === last || index % every === 0

  return {
    labels: chart.labels.filter(keep),
    series: chart.series.map((serie) => ({ ...serie, values: serie.values.filter(keep) })),
  }
}

/**
 * The scales of a list chart: every round, one point per seat in the lineup (a
 * full round at the table) or any number of rounds the user picks.
 */
export function listScaleOptions(playerCount) {
  const options = [{ id: 'round', label: 'Jede Runde' }]
  if (playerCount > 1) {
    options.push({ id: 'lineup', label: `Alle ${playerCount} Runden` })
  }
  options.push({ id: 'custom', label: 'Eigene Anzahl Runden' })
  return options
}

/** The step behind a chosen scale – `custom` uses the number the user entered. */
export function scaleStep(scale, playerCount, custom) {
  if (scale === 'lineup') return Math.max(1, Number(playerCount) || 1)
  if (scale === 'custom') return Math.max(1, Math.min(99, Number(custom) || 1))
  return 1
}

/** "2026-09-19" → "19.09." */
export function shortDate(iso) {
  const [year, month, day] = String(iso ?? '').split('-')
  if (!year || !month || !day) return String(iso ?? '')
  return `${day}.${month}.`
}

/** "Sep. 26" – the month label of the monthly scaling. */
function monthLabel(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

/** Wie die Zeitachse der Rangliste gruppiert wird – der `groupBy` der Historie. */
export const PROGRESS_SCALES = [
  { id: 'matchday', label: 'Pro Spieltag' },
  { id: 'week', label: 'Pro Woche' },
  { id: 'month', label: 'Pro Monat' },
]

/**
 * Der Verlauf der Rangliste aus `GET /standings/history`: je Zeitraum ein Punkt
 * mit dem Durchschnitt, den die Rangliste an dessen Ende hatte – dieselben Zahlen
 * wie die Spalte „Ø Punkte" der Tabelle. Ein Spieler ohne Spiel hat dort keinen
 * Durchschnitt, seine Linie hat also eine Lücke (`null`).
 */
export function standingsProgressChart(history) {
  const names = history?.players ?? []
  const buckets = history?.buckets ?? []
  const groupBy = history?.groupBy ?? 'matchday'

  return {
    labels: buckets.map((bucket) => bucketLabel(bucket, groupBy)),
    series: names.map((name, index) => ({
      name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      values: buckets.map((bucket) => bucket.averageScore?.[name] ?? null),
    })),
  }
}

/** Die Beschriftung eines Zeitraums: „16.09." / „KW 38" / „Sep. 26". */
function bucketLabel(bucket, groupBy) {
  if (groupBy === 'week') return `KW ${Number(String(bucket.key ?? '').slice(-2)) || '?'}`
  if (groupBy === 'month') return monthLabel(`${bucket.key}-01`)
  return shortDate(bucket.from ?? bucket.key)
}

/**
 * Der Verlauf eines einzelnen Spielers aus `…/standings/history`: je Zeitraum ein
 * Punkt mit seinem Kontostand – für die Spieler-Details.
 */
export function playerProgressChart(history, name) {
  const buckets = history?.buckets ?? []
  const groupBy = history?.groupBy ?? 'matchday'

  return {
    labels: buckets.map((bucket) => bucketLabel(bucket, groupBy)),
    series: [
      {
        name,
        color: SERIES_COLORS[0],
        values: buckets.map((bucket) => bucket.score?.[name] ?? null),
      },
    ],
  }
}
