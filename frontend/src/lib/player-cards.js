// Spielerkarten zum Ausschneiden: ein Kärtchen je Spieler der Rangliste, als PDF
// direkt im Browser erzeugt. Gedruckt wird auf A4 im Querformat – 16 Karten je
// Seite. Die Karten stoßen ohne Zwischenraum aneinander, sodass ein Schnitt entlang
// der gestrichelten Linien zwei Karten trennt und kein Papier dazwischen übrig
// bleibt.

// 4 × 71,25 mm + 2 × 6 mm Rand ergeben die Breite einer A4-Querseite (297 mm),
// 4 × 49,5 mm + 2 × 6 mm ihre Höhe (210 mm).
const CARD = { width: 71.25, height: 49.5 }
const PAGE_MARGIN = { x: 6, y: 6 }
const CARDS_PER_ROW = 4
const CARDS_PER_PAGE = 16
const PAD = 4.5

const COLORS = {
  ink: '#25302b',
  muted: '#7c8178',
  line: '#ded9ce',
  cut: '#c1c3ba',
  orange: '#db6f40',
  mark: '#25302b',
  cream: '#f4efe6',
}

/** Punkte mit deutschem Komma und höchstens zwei Nachkommastellen – `–` ohne Wert. */
function averageLabel(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '–'
  return value.toLocaleString('de-DE', { maximumFractionDigits: 2 })
}

/** Verkleinert die Schrift, bis der Text in die Breite passt – nicht unter `minSize`. */
function fitText(doc, text, maxWidth, maxSize, minSize) {
  let size = maxSize
  doc.setFontSize(size)
  while (size > minSize && doc.getTextWidth(text) > maxWidth) {
    size = Math.round((size - 0.25) * 100) / 100
    doc.setFontSize(size)
  }
  return size
}

/** Kürzt einen Text mit Auslassungszeichen, bis er in die Breite passt. */
function shorten(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text
  let value = text
  while (value.length > 1 && doc.getTextWidth(`${value}…`) > maxWidth) {
    value = value.slice(0, -1)
  }
  return `${value.trimEnd()}…`
}

/** Das Skatis-Zeichen der Webseite: dunkles, abgerundetes Quadrat mit kursivem „S“. */
function drawLogo(doc, x, y, size) {
  doc.setFillColor(COLORS.mark)
  doc.roundedRect(x, y, size, size, size * 0.3, size * 0.3, 'F')
  doc.setTextColor(COLORS.cream)
  doc.setFont('times', 'italic')
  doc.setFontSize(size * 1.89)
  doc.text('S', x + size / 2, y + size * 0.73, { align: 'center' })
  doc.setFillColor(COLORS.orange)
  doc.circle(x + size * 0.79, y + size * 0.21, size * 0.075, 'F')
}

/**
 * Das Schnittraster einer Seite: eine durchgehende gestrichelte Linie je Kartenkante.
 * So trifft jeder Schnitt zwei Karten gleichzeitig, statt einen Papierstreifen
 * zwischen zwei getrennt gezeichneten Rändern stehen zu lassen.
 */
function drawCutGrid(doc, { x, y, columns, rows }) {
  doc.setDrawColor(COLORS.cut)
  doc.setLineWidth(0.2)
  doc.setLineDashPattern([1.5, 1.5], 0)
  for (let column = 0; column <= columns; column += 1) {
    const lineX = x + column * CARD.width
    doc.line(lineX, y, lineX, y + rows * CARD.height)
  }
  for (let row = 0; row <= rows; row += 1) {
    const lineY = y + row * CARD.height
    doc.line(x, lineY, x + columns * CARD.width, lineY)
  }
  doc.setLineDashPattern([], 0)
}

/** Ein Kärtchen an der Position `x`/`y` – alles in Millimetern. */
function drawCard(doc, { x, y, player, tournamentName }) {
  const right = x + CARD.width - PAD
  const leftWidth = 39.5
  const fieldX = x + 48.35
  const fieldWidth = CARD.width - PAD - 48.35

  drawLogo(doc, x + PAD, y + PAD, 7.5)
  doc.setTextColor(COLORS.ink)
  doc.setFont('helvetica', 'bold')
  doc.setCharSpace(-0.1)
  doc.setFontSize(8.5)
  doc.text('skatis', x + PAD + 8.6, y + 9.8)
  doc.setCharSpace(0)
  doc.setFontSize(4.4)
  doc.setCharSpace(0.3)
  doc.setTextColor(COLORS.muted)
  doc.text('PLATZ', right, y + 7.7, { align: 'right' })
  doc.setCharSpace(0)
  doc.setFontSize(player.rank === null || player.rank === undefined ? 10 : 12)
  doc.setTextColor(COLORS.ink)
  doc.text(player.rank === null || player.rank === undefined ? '–' : String(player.rank), right, y + 14.2, { align: 'right' })

  // Der Turniername steht als Untertitel unter der Wortmarke.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.setTextColor(COLORS.muted)
  doc.text(shorten(doc, tournamentName, 38), x + PAD + 8.6, y + 14)

  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(x + PAD, y + 16, right, y + 16)

  doc.setFont('helvetica', 'bold')
  doc.setTextColor(COLORS.ink)
  fitText(doc, player.name ?? '', leftWidth, 12, 7)
  doc.text(shorten(doc, player.name ?? '', leftWidth), x + PAD, y + 24)

  doc.setFontSize(4.6)
  doc.setTextColor(COLORS.muted)
  doc.setCharSpace(0.3)
  doc.text('GRUPPE', x + PAD, y + 30)
  doc.text('SPIELSCHNITT', x + PAD, y + 39)
  doc.setCharSpace(0)

  doc.setTextColor(COLORS.ink)
  fitText(doc, player.group?.name ?? 'Ohne Gruppe', leftWidth, 8.5, 6)
  doc.text(shorten(doc, player.group?.name ?? 'Ohne Gruppe', leftWidth), x + PAD, y + 34.5)
  doc.setFontSize(11)
  doc.text(averageLabel(player.averageScore), x + PAD, y + 44)

  // Das Feld zum Eintragen: ein hochkantiges Viereck am rechten Rand.
  doc.setDrawColor(COLORS.line)
  doc.setLineWidth(0.25)
  doc.line(x + 46.1, y + 19, x + 46.1, y + 44, 'S')
  doc.setFont('helvetica', 'normal')
  fitText(doc, 'Spielschnitt Serie 1', fieldWidth, 5.4, 4.2)
  doc.setTextColor(COLORS.muted)
  doc.text(shorten(doc, 'Spielschnitt Serie 1', fieldWidth), fieldX, y + 22)
  doc.setFillColor('#ffffff')
  doc.setDrawColor(COLORS.line)
  doc.rect(fieldX, y + 23.5, fieldWidth, 20.5, 'FD')
}

/** Das Download-Datum als `TT.MM.JJJJ` – wie im Dateinamen üblich. */
function downloadDate(now = new Date()) {
  const day = String(now.getDate()).padStart(2, '0')
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${day}.${month}.${now.getFullYear()}`
}

/** `Skatis_Spielerkarten_<Turniername>_<Datum>.pdf`, ohne Zeichen, die Dateisysteme nicht mögen. */
function fileName(tournamentName) {
  const name = (tournamentName ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .replace(/\s+/g, '_')
  return `Skatis_Spielerkarten_${name || 'Turnier'}_${downloadDate()}.pdf`
}

/**
 * Erzeugt das Karten-PDF und lädt es herunter. `standing` ist die Rangliste in der
 * Sortierung „Alle Spieler mit Gruppen“ – Platz und Gruppe stehen so auf der Karte,
 * wie sie in der Rangliste stehen.
 *
 * Liefert `false`, wenn es nichts zu drucken gibt.
 */
export async function downloadPlayerCardsPdf({ standing, tournament }) {
  const players = standing?.players ?? []
  if (!players.length) return false

  // jsPDF wird erst beim Klick geladen: es ist groß und wird nur hier gebraucht.
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true })
  const tournamentName = tournament?.name ?? ''

  for (let start = 0; start < players.length; start += CARDS_PER_PAGE) {
    if (start > 0) doc.addPage()
    const pagePlayers = players.slice(start, start + CARDS_PER_PAGE)
    drawCutGrid(doc, {
      x: PAGE_MARGIN.x,
      y: PAGE_MARGIN.y,
      columns: Math.min(CARDS_PER_ROW, pagePlayers.length),
      rows: Math.ceil(pagePlayers.length / CARDS_PER_ROW),
    })
    pagePlayers.forEach((player, index) => {
      drawCard(doc, {
        x: PAGE_MARGIN.x + (index % CARDS_PER_ROW) * CARD.width,
        y: PAGE_MARGIN.y + Math.floor(index / CARDS_PER_ROW) * CARD.height,
        player,
        tournamentName,
      })
    })
  }

  await doc.save(fileName(tournamentName))
  return true
}
