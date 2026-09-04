# Skatis
Skatis ist eine Webapp, unterteilt in Backend- und Frontendkomponente.

## Planung
* Es können Turniere verwaltet werden
  * Beim Erstellen setzt der Nutzer Turniername, Adminpasswort und normales Passwort und Spieltag als Tag der Woche (z.B. nur montags, oder Dienstags und Mittwochs - Am besten als Auswahl durch ankreuzen) 
  * Turniere beinhalten Listen, in die Spiele eingetragen werden (bzw. worden sind)
  * Turniere werden anhand des "Turniernamen" identifiziert
  * Es werden zwei Passwörter zur Verwaltung benötigt
    * Das Adminpasswort: Nutzer kann im Nachhinein Listen modifizieren, ggf. korrigieren und löschen - und außerdem Listen für die Vergangenheit erstellen. Nutzer kann Spieltag ändern und das normale Passwort neu setzen.
    * Das Normale Passwort: Nutzer kann Liste erstellen und Spiele in diese Liste eintragen und diese Liste am Ende abgeben
  * Nutzer mit normalem Passwort können nur an Spieltagen Listen (diesen Tages) erstellen, editieren und abgeben
