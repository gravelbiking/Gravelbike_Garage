# Lokaler Prüfbericht – Issue #106

Stand: 13.11.2026 · Version **1.2.5 „Horchen und sehen“** · Branch `feature/106-logging-1.2.5`.

Getestet wurde der Quellstand dieses Pull Requests in isolierten lokalen Testverzeichnissen und temporären Datenbanken. Keine Uberspace-Instanz wurde verändert. Zugangsdaten, erzeugte Logs und unbereinigte Testartefakte bleiben unter der ignorierten lokalen Ablage und werden nicht veröffentlicht.

## Testumgebung

- macOS / ARM64, PHP 8.4.14, Node 24.22.1, Python 3.9.6.
- Lokale SQL-Integration: MySQL Community 8.4.11, Socket ohne Netzwerklistener, ausschließlich Testdaten.
- Browser: Headless Chrome 157 über CDP mit virtuellem CTAP2-Passkey, Zeitzone Europe/Berlin.
- Der Codespace verwendet laut Konfiguration PHP 8.4, Node 24 und MariaDB 11.4. Ein neuer Codespace-/MariaDB-Durchlauf und physische iOS-/Android-/YubiKey-Tests wurden in diesem lokalen Prüflauf nicht durchgeführt.

## Ergebnisse

| Prüfung | Ergebnis |
| --- | --- |
| Gesamte bestehende Quellcode-Regression über `codespace/test.mjs` | Bestanden |
| Strukturierte Logeinträge, Instanz-/Versions-/Vorgangszuordnung, sichere OAuth-URL | Bestanden |
| Passwort-, Client-Secret-, Token-, Code-/State-Maskierung; keine Dokumentinhalte | Bestanden |
| Native PHP-Warnungen und unbehandelte Ausnahmen | Bestanden |
| Rotation, Aufbewahrung, Dateigröße, Gesamtgrenze und Erhalt bei erneutem App-Bau | Bestanden |
| Vier parallele Schreiber / 200 vollständige JSON-Datensätze | Bestanden |
| Symlink-Ablehnung, unveränderter Zielinhalt, Logger-Gesundheitsmarker und Wiederherstellung | Bestanden |
| Browser-Puffer: offline, Deduplizierung, kein Rohfehlertext, 401-Rückhaltung, bestätigte erneute Zustellung | Bestanden |
| Authentifizierter HTTP-Fehlerbericht, Modul-/Vorgangszuordnung und Fehlerantwort-ID; Ablehnung ohne Anmeldung | Bestanden |
| Beide Strava-Clients, getrennte Tokens/Webhooks/Sync, unabhängige Fehler-/Retrypfade und Kilometerkorrekturen | Bestanden |
| Tatsächliche OAuth-Startadresse im HTTP-Ablauf; abgelaufener Versuch einmalig mit Start-Vorgangs-ID | Bestanden |
| Gesamte PHP-/SQL-Integration unter `/` und `/garage/`, einschließlich Dokumenten, Lager-/Werkstattbuchungen, Serviceplan und Passwortregeln | Bestanden |
| Python→PHP-Hintergrundfehler einschließlich Maskierung und Vorgangs-ID | Bestanden |
| Registry-/Pfadbindung und Ausschluss nicht freigegebener Dateiziele | Bestanden |
| Admin-Leser: Instanzströme, Modul/Quelle/Level/Zeitraum/Suche/Vorgang, Paging, Export, fehlerhafte Zeilen, Symlinks | Bestanden |
| Admin-HTTP: keine Anmeldung nur mit Passwort, Passkey-Registrierung/-Anmeldung, Replay-Abweisung, Origin/CSRF und geschützte Logroute | Bestanden |
| Admin-Browser: echte Anmeldung mit virtuellem Passkey, 140 Testeinträge, Fehlerfilter 70, Zeitfilter 30, Vorgangsfilter 1, TXT-Download und zweite Seite | Bestanden |
| Admin-Browser: Leerzustand, simulierter Abruffehler, erneutes Laden | Bestanden |
| Admin-Logansicht bei 320, 375, 768, 1024 und 1280 Pixeln; kein horizontaler Overflow oder Überlappen der Filterfelder | Bestanden, Screenshots zusätzlich visuell geprüft |
| Admin-Staging: aktueller PHP-Core, gleicher Browserlogger, keine Live-Konfigurationen/Schlüssel, Überschreibschutz | Bestanden |
| Bestehende Admin-/Grafana-Schutztests und MB/GB-Formatter | Bestanden |
| PHP-Lint, Python-Syntax und `git diff --check` | Bestanden |

Die absichtlich erzeugte Meldung „structured logger unavailable“ gehört zum Test eines gesperrten Logziels und ist bei erfolgreichem Testlauf erwartbar.

## Wiederholen

Im Codespace oder einer Entwicklungsumgebung mit PHP, Node und Python:

```sh
npm test
```

`GT_TEST_PHP=/absoluter/pfad/php` kann die PHP-Binärdatei für die Tests überschreiben. Die vorhandenen Regressionen und neuen Tests sind unter `tests/`, `scripts/test-*.mjs` und `admin/tests/` enthalten.

Für die vollständige isolierte SQL-Integration zunächst eine lokale Test-App mit einem neu erzeugten Testschlüssel vorbereiten:

```sh
node --input-type=module <<'JS'
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {prepareApp} from './scripts/prepare-app.mjs';
const key=randomBytes(24).toString('hex');
await mkdir('.local',{recursive:true});
await writeFile('.local/test-key.txt',key,{mode:0o600});
await prepareApp('.local/test-app',{installationKey:key});
JS
python3 scripts/test-selfhost-mysql.py /absoluter/pfad/php /pfad/zur/mysql-distribution
```

Der SQL-Harness initialisiert einen eigenen temporären MySQL-Server und entfernt seine Testdaten anschließend. Es werden keine produktiven Datenbankzugänge benötigt. Der zusätzliche Admin-HTTP-Test `admin/tests/test_auth.py` benötigt eine ausdrücklich dafür vorbereitete **leere lokale** Admin-Instanz; `GT_ADMIN_TEST_BASE` bezeichnet ausschließlich deren Adresse. Niemals gegen eine eingerichtete oder produktive Admin-Instanz ausführen. Für den Browsernachweis wurden Registry-/Monitoring-Antworten durch eine lokale Prozess-Fixture ersetzt, Authentifizierung und Logleser dagegen real ausgeführt. Der veröffentlichte Unit-Test prüft separat die reale Registry-/Pfadbindung.

## Freigabeumfang

Zur Prüfung bereit: Quellcodebranch und Pull Request für **Issue #106 / v1.2.5**. Damit wird nicht die Umsetzung sämtlicher weiterer geplanter 1.2.5-Issues behauptet. Die manuelle Abnahme in echten Testinstanzen sowie eine spätere gemeinsame Aktualisierung von Garage, Admin-Core und eigenständig installierten Update-Workern bleiben vom Server-Deployment getrennt.
