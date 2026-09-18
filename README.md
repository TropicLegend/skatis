# Skatis
Skatis ist eine Webapp, unterteilt in Backend- und Frontendkomponente.

## Grundidee
* Es können Turniere verwaltet werden
  * Beim Erstellen setzt der Nutzer Turniername, Adminpasswort und normales Passwort
  * Turniere beinhalten Listen, in die Spiele eingetragen werden (bzw. worden sind)
  * Es werden zwei Passwörter zur Verwaltung benötigt
    * Das Adminpasswort: Nutzer kann im Nachhinein Listen modifizieren, ggf. korrigieren und löschen - und außerdem Listen für die Vergangenheit erstellen. Nutzer kann Zeitraum in der Woche setzen/ändern in der andere Nutzer Listen erstellen und abgeben können. Nutzer kann das normale Passwort neu setzen.
    * Das Normale Passwort: Nutzer kann Liste erstellen und Spiele in diese Liste eintragen und diese Liste am Ende abgeben
  * Nutzer mit normalem Passwort können nur an Spieltagen Listen (diesen Tages) erstellen, editieren und abgeben
  * Listen können nur für Spieler geführt werden, die dem Turnier zugefügt wurden.
  * Spiele können nur für Spieler geführt werden, die Teil der Liste sind.

## Logik
* Wenn man über das normale Passwort in einem Turnier ist, kann man eine Liste erstellen. Eine Liste besteht aus 3,4 oder 5 Personen. Diese Spieler stehen in einer festen Reihenfolge auf der Liste. Spieler 1 ist der Geber in Runde 1. Danach Spieler 2 usw. Wenn alle Spieler einmal gegeben haben gibt wieder Spieler 1 und es geht von vorne los.
Wenn man eine Liste erstellt hat kann man Spiele eintragen. Ein Spiel einzutragen läuft folgendermaßen ab. 
1. Alleinspieler oder Eingepasst auswählen.
   zu beachten: Bei 4 Spielern kann der Geber nicht ausgewählt werden. Bei 5 Spielern kann der Spieler vor und der Spieler nach dem Geber nicht ausgewählt werden. Wenn Eingepasst ausgewählt wird sind wir hier bereits fertig die nächsten Schritte brauchen wir dann nicht.
2. Spieltyp auswählen. (Karo, Herz, Pik, Kreuz, Grand, Null) (genau eins von diesen 6)
im gleichen Schritt können noch Gewinnstufen ausgewählt werden. (Hand, Schneider Ang., Schwarz Ang., Offen)(Es können beliebig viele Angeklickt werden, sie müssen aber die nachfolgenden Regeln beachten) Zu beachten: 1.Fall (Spieltyp welcher nicht Null ist wurde ausgewählt. Offen darf nur ausgewählt werden wenn Schwarz Ang. ausgewählt worden ist.  Schwarz Ang. darf nur ausgewählt werden wenn Schneider Ang. ausgewählt worden ist.  Schneider Ang. darf nur ausgewählt werden wenn Hand ausgewählt worden ist.) 2.Fall (Spieltyp Null wurde ausgewählt. Schneider Ang. und Schwarz Ang. darf man nicht auswählen)
3. Spitzen auswählen (Dieser Schritt wird übersprungen wenn der Spieltyp Null ist). Eine Spitze ist entweder "Mit" oder "Ohne" eins davon muss also ausgewählt werden. Dann muss man eine Zahl (Spitze) zwischen 1 und 4 auswählen bei Spieltyp Grand. Eine Zahl (Spitze) zwischen 1 und 11 bei Karo, Herz, Pik, Kreuz.
4. Spielergebnis eintragen. (Schneider,Schwarz) kann man nicht auswählen wenn der Spieltyp Null ist. Schwarz kann nur ausgewählt werden wenn Schneider ausgewählt worden ist. Dann muss man noch "Gewonnen" oder "Verloren" auswählen.

Wie berechnet man den Spielwert?

*  die Nullspiele haben feste Spielwerte:
   * Null 23
   * Null Hand 35
   * Null Offen 46
   * Null Hand Offen 59

* Die anderen Spielwerte berechnet man so: (Spitze+Anzahl_Gewinnstufen+1)*Grundwert.
  Anzahl_Gewinnstufen ist die Anzahl der ausgewählen Gewinnstufen(Hand, Schneider Ang, Schwarz Ang., Offen, Schneider, Schwarz)
  Grundwerte
  * Karo 9
  * Herz 10
  * Pik 11
  * Kreuz 12
  * Grand 24
 
  Wie trägt man das Spiel in die Liste ein?
  

  
