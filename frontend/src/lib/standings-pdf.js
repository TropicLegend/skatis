// Die aktuelle Rangliste als PDF – dieselben Spalten wie die breite Tabelle am
// Bildschirm, immer in der Sortierung „Alle Spieler mit Gruppen“. Das PDF wird
// erst beim Klick erzeugt; jsPDF ist groß und wird nur hier gebraucht.

const PAGE = { width: 297, height: 210, margin: 12 }
const TABLE_WIDTH = PAGE.width - PAGE.margin * 2
const TABLE_BOTTOM = 190
const ROW_HEIGHT = 10.5
const HEADER_HEIGHT = 14

const COLORS = {
  ink: '#25302b',
  muted: '#7c8178',
  line: '#ded9ce',
  cream: '#fbfaf6',
  stripe: '#f7f3ea',
  header: '#25302b',
  orange: '#b7522d',
}

const COLUMNS = [
  { label: 'Rang', width: 14, align: 'center' },
  { label: 'Spieler', width: 70, align: 'left' },
  { label: 'Spiele', width: 18, align: 'center' },
  { label: 'Ø Punkte', width: 24, align: 'right' },
  { label: 'Ø / 36', width: 24, align: 'right' },
  { label: ['Gewonnene', 'Alleinspiele'], width: 25, align: 'center' },
  { label: ['Verlorene', 'Alleinspiele'], width: 25, align: 'center' },
  { label: 'Gegner', width: 20, align: 'center' },
  { label: ['±', 'Spieltag'], width: 25, align: 'right' },
  { label: 'Gesamt', width: 28, align: 'right' },
]

/** `TT.MM.JJJJ` für Dateiname und Kopfzeile. */
function dateLabel(now = new Date()) {
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${now.getFullYear()}`
}

/** „Aktueller Stand“ oder das gewählte Datum. */
function standingLabel(asOf) {
  return asOf && asOf !== 'current' ? `Stand vom ${asOf.split('-').reverse().join('.')}` : 'Aktueller Stand'
}

function numberLabel(value, digits = 0) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '–'
  return value.toLocaleString('de-DE', { maximumFractionDigits: digits })
}

function signedLabel(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '–'
  if (value > 0) return `+${value}`
  if (value < 0) return `-${Math.abs(value)}`
  return '0'
}

/** Kürzt Text mit Auslassungszeichen, bis er in die Breite passt. */
function shorten(doc, text, maxWidth) {
  const value = String(text ?? '')
  if (doc.getTextWidth(value) <= maxWidth) return value
  let shortened = value
  while (shortened.length > 1 && doc.getTextWidth(`${shortened}…`) > maxWidth) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened.trimEnd()}…`
}

/** Dateiname ohne Zeichen, die Dateisysteme nicht mögen. */
function fileName(tournamentName) {
  const name = String(tournamentName ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
  return `Skatis_Rangliste_${name || 'Turnier'}_${dateLabel()}.pdf`
}

/** Kopf der ersten Seite mit Turniername, Sortierung und Stand. */
function drawPageHeader(doc, { tournamentName, asOf, listsCounted, page }) {
  doc.setTextColor(COLORS.muted)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.text('SKATIS · RANGLISTE', PAGE.margin, 12)

  if (page === 1) {
    doc.setTextColor(COLORS.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(19)
    doc.text('Rangliste', PAGE.margin, 21)

    doc.setFontSize(10)
    doc.text(shorten(doc, tournamentName || 'Turnier', 150), PAGE.margin, 28)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(COLORS.muted)
    doc.text(`Alle Spieler mit Gruppen · ${standingLabel(asOf)} · ${listsCounted} gewertete Listen`, PAGE.margin, 34)
    doc.text(`Erstellt am ${dateLabel()}`, PAGE.width - PAGE.margin, 21, { align: 'right' })

    doc.setDrawColor(COLORS.ink)
    doc.setLineWidth(0.4)
    doc.line(PAGE.margin, 38, PAGE.width - PAGE.margin, 38)
    return 44
  }

  doc.setTextColor(COLORS.ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(`Rangliste · ${shorten(doc, tournamentName || 'Turnier', 170)}`, PAGE.margin, 15)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(COLORS.muted)
  doc.text(`${standingLabel(asOf)} · Alle Spieler mit Gruppen`, PAGE.width - PAGE.margin, 15, { align: 'right' })
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(PAGE.margin, 19, PAGE.width - PAGE.margin, 19)
  return 25
}

/** Spaltenkopf; wird auf jeder Seite wiederholt. */
function drawTableHeader(doc, y) {
  doc.setFillColor(COLORS.header)
  doc.rect(PAGE.margin, y, TABLE_WIDTH, HEADER_HEIGHT, 'F')
  doc.setTextColor(COLORS.cream)
  doc.setFont('helvetica', 'bold')

  let x = PAGE.margin
  for (const column of COLUMNS) {
    const lines = Array.isArray(column.label) ? column.label : [column.label]
    doc.setFontSize(lines.length > 1 ? 6.2 : 7)
    lines.forEach((line, index) => {
      const lineY = y + 5.7 + index * 3.7
      if (column.align === 'left') doc.text(line, x + 2, lineY)
      else if (column.align === 'right') doc.text(line, x + column.width - 2, lineY, { align: 'right' })
      else doc.text(line, x + column.width / 2, lineY, { align: 'center' })
    })
    x += column.width
  }

  return y + HEADER_HEIGHT
}

/** Eine Zeile mit denselben Werten wie die Desktop-Rangliste. */
function drawRow(doc, y, player, index) {
  if (index % 2 === 1) {
    doc.setFillColor(COLORS.stripe)
    doc.rect(PAGE.margin, y, TABLE_WIDTH, ROW_HEIGHT, 'F')
  }

  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.15)
  doc.line(PAGE.margin, y + ROW_HEIGHT, PAGE.width - PAGE.margin, y + ROW_HEIGHT)

  const values = [
    player.rank === null || player.rank === undefined ? '–' : String(player.rank),
    null,
    numberLabel(player.gamesPlayed),
    numberLabel(player.averageScore, 1),
    numberLabel(player.averageScorePer36, 1),
    numberLabel(player.won),
    numberLabel(player.lost),
    numberLabel(player.opponentWon),
    signedLabel(player.lastMatchdayChange),
    numberLabel(player.score),
  ]

  let x = PAGE.margin
  COLUMNS.forEach((column, columnIndex) => {
    if (columnIndex === 1) {
      const group = player.group?.name
      const nameWidth = group ? column.width - 27 : column.width - 4
      doc.setTextColor(COLORS.ink)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.3)
      const name = shorten(doc, player.name ?? '', nameWidth)
      const nameTextWidth = doc.getTextWidth(name)
      doc.text(name, x + 2, y + 6.8)

      if (group) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.2)
        doc.setTextColor(COLORS.muted)
        const groupWidth = Math.max(5, column.width - 4 - nameTextWidth - 4)
        doc.text(`· ${shorten(doc, group, groupWidth)}`, x + 2 + nameTextWidth + 1.5, y + 6.8)
      }
    } else {
      const value = values[columnIndex]
      doc.setTextColor(COLORS.ink)
      doc.setFont('helvetica', columnIndex === 9 ? 'bold' : 'normal')
      doc.setFontSize(columnIndex === 9 ? 8.5 : 7.5)
      if (column.align === 'left') doc.text(value, x + 2, y + 6.8)
      else if (column.align === 'right') doc.text(value, x + column.width - 2, y + 6.8, { align: 'right' })
      else doc.text(value, x + column.width / 2, y + 6.8, { align: 'center' })
    }
    x += column.width
  })
}

/** Fußzeile mit Seitenzahl. */
function drawFooter(doc, page) {
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(PAGE.margin, 196, PAGE.width - PAGE.margin, 196)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(COLORS.muted)
  doc.text('Skatis · Rangliste · Sortierung „Alle Spieler mit Gruppen“', PAGE.margin, 201)
  doc.text(`Seite ${page}`, PAGE.width - PAGE.margin, 201, { align: 'right' })
}

/**
 * Lädt die aktuelle Rangliste als PDF herunter. `standing` muss bereits mit
 * `?grouped=true` geladen sein; die Reihenfolge der Antwort wird unverändert
 * übernommen. Liefert `false`, wenn es keine Spieler gibt.
 */
export async function downloadStandingsPdf({ standing, tournament, asOf = 'current' }) {
  const players = standing?.players ?? []
  if (!players.length) return false

  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })
  const tournamentName = tournament?.name ?? ''
  let page = 1
  let y = drawPageHeader(doc, {
    tournamentName,
    asOf,
    listsCounted: standing?.listsCounted ?? 0,
    page,
  })
  y = drawTableHeader(doc, y)

  players.forEach((player, index) => {
    if (y + ROW_HEIGHT > TABLE_BOTTOM) {
      drawFooter(doc, page)
      doc.addPage()
      page += 1
      y = drawPageHeader(doc, {
        tournamentName,
        asOf,
        listsCounted: standing?.listsCounted ?? 0,
        page,
      })
      y = drawTableHeader(doc, y)
    }
    drawRow(doc, y, player, index)
    y += ROW_HEIGHT
  })

  drawFooter(doc, page)
  await doc.save(fileName(tournamentName))
  return true
}
