# Fehlerprotokolle – 1.2.5 „Horchen und sehen“

Implementierung zu [Issue #106](https://github.com/gravelbiking/Gravelbike_Garage/issues/106). Testbranch: `feature/106-logging-1.2.5`. Noch keine Serververöffentlichung und kein neues Release-ZIP.

## Erfassung und Datenfluss

| Ursprung | Erfassung | Ablage / Anzeige |
| --- | --- | --- |
| Garage-Browser | Zentrale Request-Funktion, JavaScript-Ausnahmen, Promise-Fehler, Ressourcenfehler, Timeouts, Assistentenfehler | Authentifizierter `client-error`-Endpunkt → privater PHP-Logger |
| Garage-PHP / interne APIs | Fehlerantworten ab HTTP 400, Exception-, Error- und Shutdown-Handler; PDO-Ausnahmen ohne SQL-/Dateninhalt | Privater PHP-Logger |
| Strava-Verbindung 1 und 2 | HTTP-/Transportfehler, Token-/Sync-/Webhookfehler, Konfigurationswechsel, OAuth-Start/Rückkehr/Ablauf | Privater PHP-Logger mit Verbindungsnummer |
| Admin / Grafana | Authentifizierte Browserberichte, PHP-Fehler, Proxyfehler, Worker-/Monitoringfehler | Admin-eigene private Logs; Garage-Bridgefehler in der betroffenen Instanz |
| Strava- und Update-Jobs | PHP-Jobcatch bzw. Python→PHP-Brücke, einschließlich Update-Bereinigungsfehlern | Instanzbezogene private Logs |
| Admin-Logansicht | Registrierungsgebundener Python-Leser, nur nach bestehender Admin-Anmeldung mit 2FA | Filterbare Anzeige und TXT-Export |

Bereiche wie Serviceplan, Servicebuch und Radcomputer werden über ihre bestehenden zentralen API-/Requestpfade erfasst. Erwartbare Validierungs-/Anmeldefehler werden als `warning`, technische Fehler als `error`, fatale PHP-Fehler als `critical` gespeichert. OAuth-Abläufe verwenden zusätzlich `info`. Ein Vorgang kann mehrere zusammengehörige Einträge erzeugen (z. B. Anbieterfehler plus API-Fehlerantwort).

## Ablage und Format

Der Logger liegt in `selfhost/logging.php`. Bei der verwalteten Installation:

```text
<projekt>.shared/
  data/logging-status.json
  logs/
    .writer.lock
    strava--external-api--2026-11-13.jsonl
    workshop--frontend--2026-11-13.jsonl
    api--backend--2026-11-13-1.jsonl
```

Allgemein wird `logs` als Geschwisterverzeichnis des konfigurierten `storage_path` angelegt. `storage_path` muss deshalb wie bisher außerhalb des öffentlichen Webroots liegen. Die Ablage bleibt bei einem Releasewechsel erhalten. Verzeichnisrechte: `0700`, Dateien: `0600`. Symlinks auf Logverzeichnisse/-dateien werden abgewiesen. Eine exklusive Schreibsperre schützt Rotation und parallele Schreibzugriffe.

JSON Lines, ein Datensatz pro Zeile. Gemeinsame Felder: UTC-Zeitstempel, Instanzname, Version, Releasename, Modul, Quelle, Schweregrad, Nachricht, `request_id` und `http_request_id`. Whitelist-Metadaten ergänzen Operation, Route, Methode, Status, Fehlerklasse/-code und gekürzte Stackpositionen ohne Funktionsargumente.

Browser und API verwenden `X-Garage-Request-Id` und `X-Garage-Module`. Nicht gültige Vorgangs-IDs werden durch zufällige IDs ersetzt. Der Server nimmt nur bekannte Module bzw. bereinigte Routennamen an; diese Angaben beeinflussen keine Berechtigung. Fehlerantworten enthalten `requestId`, damit derselbe Vorgang weitergesucht werden kann. Bei OAuth kann `request_id` auf den ursprünglichen Start verweisen, während `http_request_id` den aktuellen Callback bezeichnet.

## Strava und Grenzen der Sichtbarkeit

Der Start protokolliert die tatsächlich erzeugte `redirect_uri`, Client-ID, Verbindungsnummer und Ablaufzeit. Die Flow-Zuordnung speichert eine zufällige Vorgangs-ID, niemals den OAuth-Code oder `state` im Log. Konfigurationswechsel protokollieren die vorherige/neue Client-ID und Basisadresse ohne Secrets.

Eine Strava-Fehlerantwort wird in getrennte Felder aufgeteilt, z. B. `provider_resource=Application`, `provider_field=redirect_uri`, `error_code=invalid`. Rohantworten werden nicht gespeichert.

Zeigt Strava ausschließlich auf seiner eigenen Webseite einen Fehler und kehrt nicht zur Garage zurück, kann die Garage diesen Fehlertext nicht lesen. Sie dokumentiert Start und – beim nächsten laufenden Strava-Job nach Ablauf – genau einmal `oauth.expired`. Das ist ein Hinweis auf fehlende Rückkehr, kein Beweis für eine bestimmte Strava-Ursache. Ohne laufenden Job wird der Ablauf erst beim nächsten Abgleich erkannt. Konfigurationen im Strava-Portal werden nicht ausgelesen.

## Schutz der Daten

- Keine Request-/Response-Bodies, Formularwerte, persönlichen Dokumentinhalte oder unbereinigten JavaScript-Fehlermeldungen.
- Browserberichte enthalten Fehlerklasse, technischen Kontext, Status, Vorgangs-ID und gekürzte Dateipositionen. Der originale Fehlertext bleibt bewusst außen vor, weil er Nutzereingaben enthalten kann.
- Konfigurierte Geheimnisse sowie typische Passwort-/Token-/Cookie-/Code-/State-Muster werden maskiert. E-Mail-Adressen und URLs in Freitext werden entfernt. Spezielle URL-Felder behalten Host und Pfad, ohne Zugangsdaten, Query oder Fragment.
- Der Admin-Leser verwendet erneut eine Feld-Whitelist. Unbekannte oder verschachtelte Metadaten werden nicht exportiert; Logtext wird mit `textContent` angezeigt.
- Logs sind Diagnosedaten und keine zusätzliche verschlüsselte Datenablage. Zugang schützt die private Ablage plus die bestehende Admin-Anmeldung mit Passkey/YubiKey. TXT-Exporte lokal geschützt aufbewahren.
- Der Leser akzeptiert ausschließlich Instanzen aus der bestehenden Registry mit geprüfter Release-/Konfigurations-/Datenbankzuordnung; kein frei eingebbarer Dateipfad. Die API verlangt 2FA-Sitzung, Origin- und CSRF-Prüfung.

## Puffer, Rotation und Störungen

Browserberichte werden je Installationspfad in `sessionStorage` gepuffert: höchstens 200 Berichte und 24 Stunden innerhalb der Sitzung, 25 pro Sendung, 5 Sekunden Sendetimeout. Bei Offline-/Netzwerkfehlern bleibt der Puffer erhalten. Erfolgreich bestätigte Berichte werden entfernt. Nach 401/403 wird erst nach erneuter Anmeldung bzw. einem weiteren Verbindungsereignis gesendet. Der Puffer ist endlich; bei Überlauf wird die Anzahl weiterer Fehler zusammengefasst. Geschlossene Browsersitzungen können ungesendete Berichte verlieren.

PHP-Standardwerte in der privaten Konfiguration:

```php
'logging' => [
    'retention_days' => 14,
    'max_file_bytes' => 2 * 1024 * 1024,
    'max_total_bytes' => 20 * 1024 * 1024,
],
```

Rotation erfolgt beim Schreiben. Dateien außerhalb der Aufbewahrung sowie bei Erreichen der Gesamtgrenze die ältesten Dateien werden entfernt. Geschützt begrenzbare Konfiguration: 1–90 Tage, 64 KiB–10 MiB pro Datei, insgesamt höchstens 200 MiB pro Instanz. Logs werden nicht unbegrenzt aufbewahrt; für längere Nachweise rechtzeitig exportieren. Normale Updates bereinigen nur Releases/Backups; die private Logablage liegt außerhalb.

Bei nicht beschreibbarer Ablage scheitert nicht die eigentliche Fachaktion: Der Logger bricht kontrolliert ab, meldet einen generischen Fehler im PHP-Systemlog und setzt soweit möglich einen privaten Gesundheitsmarker. Die Admin-Ansicht zeigt einen vorhandenen negativen Marker an. Ist auch der Marker nicht beschreibbar, kann das System nur auf das PHP-/Dienstprotokoll zurückfallen. Fehlende/alte Marker sind kein Nachweis für einen gesunden Logger. Schwere Parse-/Startfehler vor Laden des Handlers bleiben ebenfalls Aufgabe der PHP-/Dienstlogs.

## Admin-Bedienung

Unter **Protokolle → Strukturierte Fehler aller Module / APIs** eine Instanz wählen. Optional Modul, Quelle, Schweregrad, Suchtext, Vorgangs-ID und Zeitraum setzen. Zeitraumeingaben verwenden die Ortszeit des Browsers und werden als UTC übertragen. Mit **Anzeigen / erneut versuchen** laden; optional alle 15 Sekunden aktualisieren. Die Anzeige lädt 100 Einträge pro Seite, neueste zuerst.

**Gefilterte Logs als TXT** exportiert die neuesten passenden Einträge: maximal 1.000 Datensätze / 1 MiB. Lesebudget je Anfrage: 50 MiB; bei abgeschnittenen oder beschädigten Daten erscheint ein Hinweis. Dann den Zeitraum enger wählen. Die bisherigen PHP-, Apache-, Dienst- und Auditprotokolle bleiben zusätzlich wählbar. Keine/keine passenden Einträge und fehlgeschlagene Abfragen haben unterschiedliche Meldungen.

## Quellcode und spätere Installation

Die Garage wird wie bisher mit `scripts/prepare-app.mjs` gebaut; `logging.php` ist enthalten. Die Admin-Anwendung bleibt separat. Für eine **leere lokale Staging-Ablage**:

```sh
node scripts/prepare-admin.mjs .local/admin-staging
```

Das erzeugt Admin-Quellcode plus den dazu passenden aktuellen PHP-Core. Die Ausgabe enthält **keine** echte `private/config.php`, `settings.json`, Datenbank, Registry, Schlüssel oder Benutzer. Bei vorhandenem Inhalt verweigert der Builder das Überschreiben.

Bei einer später ausdrücklich freigegebenen Serveraktualisierung müssen die bestehende private Admin-Konfiguration und `settings.json`, Registry, Datenbank, Sessions, Grafana-Daten und Dienstdefinitionen erhalten bleiben. Der neue `private/core/config.php` verweist auf `private/config.php`. Der Core **muss gemeinsam mit der Logansicht aktualisiert werden**; ein alter Core kennt den neuen Logger nicht. Der vorhandene Bridge-/Updater- und Dashboard-Code ist als bereinigter Ausgangsstand enthalten, nicht als Neuinstallation dieser Dienste. Eigenständige Update-Worker benötigen die aktualisierte `garage_updater.py`; ihre bestehenden Ziel-/Dienstkonfigurationen bleiben erhalten. Für alte Garage-Versionen ohne neue strukturierte Logs zeigt die Ansicht einen Leerzustand; bestehende Dienstlogs bleiben verfügbar.

Der Codespace startet weiterhin nur die Garage mit eigener Datenbank auf privatem Port 4173. Admin-UI-Integrationstests benötigen eine eigene isolierte Admin-Konfiguration; sie starten nicht automatisch und greifen nicht auf Produktionsinstanzen zu.
