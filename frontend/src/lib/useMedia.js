import { useEffect, useState } from 'react'

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

/** Kurzform für die häufigste Frage. */
export function useMobile() {
  return useMedia(MOBILE_QUERY)
}
