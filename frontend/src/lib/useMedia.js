import { useEffect, useState, useSyncExternalStore } from 'react'

/**
 * Eine Media-Query als React-Zustand. Das Board nutzt sie als Weiche „Handy oder
 * nicht“: Karten statt Tabellen, Tab-Leiste statt langer Scroll-Seite, weniger
 * Achsen im Diagramm. `matchMedia` ist die Wahrheit des Browsers – keine Fensterbreite
 * von Hand, damit die Umstellung genauso greift wie das CSS.
 */
export function useMedia(query) {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))

  useEffect(() => {
    const list = window.matchMedia(query)
    const update = () => setMatches(list.matches)
    update()
    list.addEventListener('change', update)
    return () => list.removeEventListener('change', update)
  }, [query])

  return matches
}

/** Die eine Grenze, bis zu der das Board „Handy“ ist – identisch zum CSS. */
export const MOBILE_QUERY = '(max-width: 600px)'

/**
 * „Desktop-Ansicht“ am Handy: Der Knopf in der Kopfzeile setzt eine feste
 * Layout-Breite (siehe `main.jsx`). Wo der Browser das sofort umsetzt, kippen die
 * Media-Queries von selbst; wo nicht, überstimmt diese Wahl die Fensterbreite.
 * So schaltet die Ansicht überall um und nicht nur scheinbar.
 */
let desktopOverride = false
const overrideListeners = new Set()

export function setDesktopOverride(value) {
  if (desktopOverride === value) return
  desktopOverride = value
  overrideListeners.forEach((listener) => listener())
}

function subscribeOverride(listener) {
  overrideListeners.add(listener)
  return () => { overrideListeners.delete(listener) }
}

function readOverride() { return desktopOverride }

/** Kurzform für die häufigste Frage. */
export function useMobile() {
  const matches = useMedia(MOBILE_QUERY)
  const forced = useSyncExternalStore(subscribeOverride, readOverride, readOverride)
  return matches && !forced
}
