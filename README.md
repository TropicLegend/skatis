# Skatis
Skatis ist eine Webapp, unterteilt in Backend- und Frontendkomponente.

## Grundidee
* Es können Turniere verwaltet werden
  * Beim Erstellen setzt der Nutzer Turniername, Adminpasswort und normales Passwort
  * Turniere beinhalten Listen, in die Spiele eingetragen werden (bzw. worden sind)
  * Es werden zwei Passwörter zur Verwaltung benötigt
    * Das Adminpasswort: Nutzer kann im Nachhinein Listen modifizieren, ggf. korrigieren und löschen - und außerdem Listen für die Vergangenheit erstellen. Nutzer kann Zeitraum in der Woche setzen/ändern in der andere Nutzer Listen erstellen und abgeben können. Nutzer kann das normale Passwort neu setzen.
    * Das Normale Passwort: Nutzer kann Liste erstellen, Spiele in diese Liste eintragen, eigene Fehler darin korrigieren oder das Spiel löschen und diese Liste am Ende abgeben
  * Nutzer mit normalem Passwort können nur an Spieltagen Listen (diesen Tages) erstellen, editieren und abgeben; die Spiele einer Liste können sie bis zum Abgeben korrigieren und löschen. Nach dem Abgeben (Schließen) bleibt die Liste nur für Admins änderbar.
  * Admins können Spiele jederzeit ändern und löschen - auch nachdem die Liste geschlossen wurde.
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

Wenn der Spieler der Alleinspieler ist gewinnt. Bekommt der den Spielwert gutgeschrieben. Wenn der Alleinspieler verliert bekommt er den doppelten Spielwert abgezogen. Dies Trägt man dann in die Tabelle ein die zb so aussehen kann. Anzahl Spiele und Spieler kann varieren aber das Prinzip ist das gleiche.

"Es handelt sich um eine Ergebnistabelle für ein Kartenspiel mit 4 Spielern und 48 Einzelspielen.

Die Tabelle besteht aus einem Kopfbereich, einem Spielwert-/Gewinnstufenbereich, vier Spielerbereichen und einer abschließenden Punkteauswertung.

Kopf: Datum, Serie und Tisch sowie der Name der vier Spieler. Die Spieler werden als Platz 1, Platz 2, Platz 3 und Platz 4 bezeichnet.

Spieltabelle: Es gibt 48 Zeilen, nummeriert von 1 bis 48. Jede Zeile entspricht einem Spiel. Die Spalten sind in folgender Reihnfolge (Grundwert,Spitze "Mit",Spitze "Ohne", Hand, Schneider, Scheider Ang, Schwarz, Schwarz Ang, Offen, Positiver Spielwert, Negativer Spielwert) dann für jeder Spieler eine (Eintragungsspalte,Gew,Verl) und am eine eine Eingepasst Spalte."


Wir tragen also ein Spiel in eine Zeile ein. Ganz vorne der Grundwert. Bei Nullspielen einfach schon gleich der Spielwert. Dann schreiben wir die Spitzen in die nächste oder übernächste Spalte je nachdem ob "Mit" oder "Ohne". Dann kreuzen wir bei den Gewinnstufen die entsprechenen an. Wenn das Alleinspiel Gewonnen wurde schreiben wir in die Spalte "Positiver Spielwert" den Spielwert, wenn verloren schreiben wir in " Negativer Spielwert" den Spielwert mal 2. Diesen Wert verrechnen wir dann mit dem Punktekonto des Alleinspielers, welches am Start der Liste auf 0 ist. Bei Gewonnenem Alleinspiel dann die Anzahl der Gewonnenen Alleinspiele des Spielers in das Feld "Gew". Bei Verlorenem Alleinspiel die Anzahl der Verlorenen Alleinspieler des Spieles in das Feld "Verl". Wenn Eingepasst streiche die Zeile durch und schreibe hinten in der letzten spalte die Anzahl eingepasste Spiele in die Eingepasst Spalte.
Ganz unten in der Liste Steht das Gesamtergebnis der jeweiligen Spieler. Das Gesamtergebnis sind die Spielpunkte von oben +50 für jedes Gewonnenes Alleinspiel -50 für jedes verlorenes. (+24 bei 5 Spielern ,+30 bei 4 Spielern,+40 bei 3 Spielern) für jedes verlorenes Alleinspiel eines anderen Spielers. Dieses Gesamtergebnis soll während die ganzen Spiele eingetragen werden durchgängig aktualisiert werden.

  

  
So one player can play on multiple lists each evening. After submitting a list, each player is attributed a certain amount of points in the tournament. This is calculated in the following way:
First of all, a player's amount of played games is an important metric.
The amount of games the player has participated in in a list, can be found out the following way:

Which games he has participated in, can be found out the following way:
3-player list: The player plays every game.
4-player list: The player plays every game he is NOT "Geber" in.
5-player list: The player plays every game in which the player left of him or right of him has NOT been the "Geber".

After finding out, how many games the player has participated in, this count is added to the total amount of games the player has participated in in the tournament.
To calculate his standing in the tournament, the next thing is to add the total amount of points gained by the player in the list to the total amounts gained in the tournament. 
In the end, you calculate the average points per game to get his standing in the tournament.
Do this for every player when a list is submitted.
The amount of total games played and total points gained by a player need to be kept track of.
  
