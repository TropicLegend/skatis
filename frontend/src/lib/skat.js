/**
 * Pure helpers of the board – no React, no fetching.
 *
 * The rules mirror `backend/src/modules/lists/game-rules.ts` and `scoring.ts`,
 * but the authoritative numbers (Spielwert, Ergebnistabelle, Rangliste) still
 * come from the API. Everything here is only used to *show* what the server
 * decided: labels, the running account and the chart series.
 */

/** Spielarten in the order of the entry wizard, with the Grundwert of each. */
export const GAME_TYPES = [
  { id: 'KREUZ', label: 'Kreuz', symbol: '♣', value: 12, maxMatadors: 11 },
  { id: 'PIK', label: 'Pik', symbol: '♠', value: 11, maxMatadors: 11 },
  { id: 'HERZ', label: 'Herz', symbol: '♥', value: 10, maxMatadors: 11 },
  { id: 'KARO', label: 'Karo', symbol: '♦', value: 9, maxMatadors: 11 },
  { id: 'GRAND', label: 'Grand', symbol: '✦', value: 24, maxMatadors: 4 },
  { id: 'NULL', label: 'Null', symbol: '∅', value: 23, maxMatadors: null },
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

/** Highest number of Spitzen: 4 for grand, 11 for the suits, none for null. */
export function maxMatadors(gameType) {
  if (gameType === 'NULL') return null
  return gameType === 'GRAND' ? 4 : 11
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

/**
 * What a game does to the account ("Punktekonto") of `name`: a won Alleinspiel
 * credits the Spielwert, a lost one debits twice of it, everyone else is
 * untouched. Passed out games change nothing.
 */
export function gameDelta(game, name) {
  if (!game || game.passedOut || game.declarer !== name) return 0

  const value = game.gameValue ?? 0
  // The API sends the credited and debited parts; the fallback keeps older
  // payloads working, which only sent `won` and `gameValue`.
  const credited = game.positiveGameValue ?? (game.won === true ? value : 0)
  const debited = game.negativeGameValue ?? (game.won === false ? value * 2 : 0)
  return credited - debited
}

function lineupNames(lineup) {
  return (lineup ?? []).map((player) => (typeof player === 'string' ? player : player?.name)).filter(Boolean)
}

/**
 * The account of every player before and after every round of a list. `before`
 * and `after` are snapshots, `delta` is what this single game changed – exactly
 * the "Spielstand vor und nach dem Spiel" of the game detail view.
 */
export function runningAccounts(lineup, games) {
  const names = lineupNames(lineup)
  const accounts = Object.fromEntries(names.map((name) => [name, 0]))

  const rounds = (games ?? []).map((game) => {
    const delta = Object.fromEntries(names.map((name) => [name, gameDelta(game, name)]))
    const before = { ...accounts }
    for (const name of names) accounts[name] += delta[name]
    return { game, delta, before, after: { ...accounts } }
  })

  return { rounds, accounts: { ...accounts } }
}

/** The running account of a list as chart data – one point per round. */
export function listProgress(lineup, games) {
  const names = lineupNames(lineup)
  const { rounds } = runningAccounts(names, games)

  return {
    labels: ['Start', ...rounds.map((round) => `R${round.game.position ?? ''}`)],
    series: names.map((name, index) => ({
      name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      values: [0, ...rounds.map((round) => round.after[name] ?? 0)],
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

/** ISO-8601 calendar week of a "YYYY-MM-DD" date. */
export function isoWeek(iso) {
  const date = new Date(`${iso}T00:00:00Z`)
  const weekday = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - weekday)
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date - startOfYear) / 86400000 + 1) / 7)
  return { year: date.getUTCFullYear(), week }
}

/** "Sep. 26" – the month label of the monthly scaling. */
function monthLabel(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('de-DE', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  })
}

/** How the time axis is grouped. */
export const PROGRESS_SCALES = [
  { id: 'matchday', label: 'Pro Spieltag' },
  { id: 'week', label: 'Pro Woche' },
  { id: 'month', label: 'Pro Monat' },
]

/**
 * The counted lists of a tournament per matchday: what every player collected
 * on that evening. `lists` are the list DTOs of `/lists` (they carry `counted`),
 * `resultsById` the result tables of `/lists/:id/results`. Score and games are
 * kept apart, because the chart draws the average score per game.
 */
export function tournamentProgress(lists, resultsById, names) {
  const totalsByMatchday = new Map()

  for (const list of lists ?? []) {
    // `counted` is what the standing uses – a handed in list or a day that is
    // over. Without the flag (older payload) the list is taken as it is.
    if (list.counted === false) continue

    const results = resultsById?.[list.id]
    if (!results?.players?.length) continue

    const matchday = results.matchday ?? list.matchday
    if (!matchday) continue

    const bucket = totalsByMatchday.get(matchday) ?? new Map()
    for (const player of results.players) {
      const collected = bucket.get(player.name) ?? { points: 0, gamesPlayed: 0 }
      collected.points += player.total ?? 0
      collected.gamesPlayed += player.gamesPlayed ?? 0
      bucket.set(player.name, collected)
    }
    totalsByMatchday.set(matchday, bucket)
  }

  const matchdays = [...totalsByMatchday.keys()].sort()
  const derived = [...new Set(matchdays.flatMap((matchday) => [...totalsByMatchday.get(matchday).keys()]))]

  return {
    names: names?.length ? names : derived,
    matchdays: matchdays.map((matchday) => {
      const bucket = totalsByMatchday.get(matchday)
      const pick = (field) => Object.fromEntries([...bucket].map(([name, entry]) => [name, entry[field]]))
      return { matchday, points: pick('points'), gamesPlayed: pick('gamesPlayed') }
    }),
  }
}

function scaleKey(matchday, scale) {
  if (scale === 'week') {
    const { year, week } = isoWeek(matchday)
    return `${year}-W${week}`
  }
  if (scale === 'month') return matchday.slice(0, 7)
  return matchday
}

function scaleLabel(matchday, scale) {
  if (scale === 'week') return `KW ${isoWeek(matchday).week}`
  if (scale === 'month') return monthLabel(matchday)
  return shortDate(matchday)
}

/**
 * The average score per game of every player, grouped by the chosen scale – the
 * "Ø Punkte" column of the standing as a line. A player without a game has no
 * average, so the line has a gap there (`null`).
 */
export function progressAverageChart(progress, scale = 'matchday') {
  const entries = progress?.matchdays ?? []
  const names = progress?.names ?? []
  if (entries.length === 0 || names.length === 0) return { labels: [], series: [] }

  const running = Object.fromEntries(names.map((name) => [name, { points: 0, gamesPlayed: 0 }]))
  const averages = entries.map((entry) => {
    for (const name of names) {
      running[name].points += entry.points[name] ?? 0
      running[name].gamesPlayed += entry.gamesPlayed?.[name] ?? 0
    }
    return Object.fromEntries(
      names.map((name) => {
        const { points, gamesPlayed } = running[name]
        return [name, gamesPlayed === 0 ? null : Math.round((points / gamesPlayed) * 100) / 100]
      }),
    )
  })

  // One point per bucket, holding the average reached at the end of that bucket.
  const buckets = []
  let previousKey = null
  entries.forEach((entry, index) => {
    const key = scaleKey(entry.matchday, scale)
    if (key !== previousKey) {
      previousKey = key
      buckets.push({ label: scaleLabel(entry.matchday, scale), snapshot: averages[index] })
      return
    }
    buckets[buckets.length - 1].snapshot = averages[index]
  })

  return {
    labels: buckets.map((bucket) => bucket.label),
    series: names.map((name, index) => ({
      name,
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      values: buckets.map((bucket) => bucket.snapshot[name] ?? null),
    })),
  }
}
