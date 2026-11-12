# Gravelbike Garage auf Uberspace installieren

Gravelbike Garage **1.0.0**. Ziel dieser Fassung: **Uberspace mit MariaDB und PHP 8.4**. Die App benötigt auf dem Server keinen laufenden Node-Prozess und kein Composer. Alle benötigten Laufzeitbibliotheken sind enthalten. Entwicklung und Tests bleiben lokal. Ein fertiges Upload-ZIP wird erst nach ausdrücklicher Freigabe der konkreten Version erstellt.

Die Befehle unten beziehen sich auf **Uberspace 8**. Bei einem vorhandenen Uberspace-7-Konto sind die abweichenden PHP-Befehle weiter unten angegeben. Ersetze `ACCOUNT` immer durch deinen tatsächlichen Uberspace-Kontonamen.

## 1. Eigene MariaDB-Datenbank

Empfohlen wird die von Uberspace bereitgestellte MariaDB. Die App verwendet weiter den PHP-Treiber PDO_MySQL. Kein zusätzlicher Datenbankserver ist nötig.

Lege über SSH eine eigene leere Datenbank an (den Beispielnamen ersetzen):

```sh
mariadb -e 'CREATE DATABASE ACCOUNT_garage CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;'
```

Uberspace erlaubt zusätzliche Datenbanken mit dem Präfix deines Kontonamens und `_`. Der schreibberechtigte Benutzer entspricht normalerweise deinem Kontonamen. Das Datenbankpasswort steht in deiner privaten `~/.my.cnf`; es ist nicht dein App- oder SSH-Passwort. Die Datei nicht hochladen, öffentlich ablegen oder im Chat teilen. Verbindungsserver: `localhost`, Standardport `3306`.

Die Datenbank muss existieren. Die Tabellen legt die App selbst an; `MARIADB-SCHEMA.sql` muss bei einer Erstinstallation nicht zusätzlich importiert werden. Der Benutzer benötigt CREATE, SELECT, INSERT, UPDATE und DELETE. InnoDB und `utf8mb4_unicode_ci` werden verwendet. Die 2FA-Tabellen entstehen automatisch bei Bedarf.

## 2. PHP und Domain

Uberspace 8:

```sh
uberspace tool php version set 8.4
```

Bei Uberspace 7 lautet der Befehl `uberspace tools version use php 8.4`.

Benötigt: PDO_MySQL, fileinfo, OpenSSL und eine feste HTTPS-Domain. Aktiviere deine eigene Domain gemäß der Uberspace-Anleitung. `graveltube.be` kann beim bisherigen Domainanbieter bleiben; DNS-Einträge werden auf deinen konkreten Uberspace angepasst. IP-Adressen nicht aus Beispielen kopieren. Uberspace verwaltet HTTPS-Zertifikate über seinen Web-Frontenddienst.

Den Standard-Backendtyp **APACHE** verwenden. Ein STATIC-Backend verarbeitet weder PHP noch die Schutzregeln der `.htaccess`-Dateien.

## 3. Ordner per SFTP übertragen

Im später freigegebenen Paket liegt die App unter **`hochladen/gravelbike-garage/`**. Lade diesen kompletten Ordner inklusive versteckter Dateien in deinen Web-Verzeichnisbereich hoch, zum Beispiel:

```text
/var/www/virtual/ACCOUNT/gravelbike-garage/
  public/     ← nur dieser Ordner wird über die Domain veröffentlicht
  private/    ← Konfiguration, PHP-Backend, Uploads und 2FA-Schlüssel
```

Der DocumentRoot der Domain muss auf **`/var/www/virtual/ACCOUNT/gravelbike-garage/public/`** zeigen. Bei Uberspace wird dies über die entsprechende Domain-Verknüpfung unter `/var/www/virtual/ACCOUNT/` eingerichtet. Eine typische Verknüpfung ist `graveltube.be -> gravelbike-garage/public`. Bestehende Verzeichnisse oder Domain-Verknüpfungen zuerst prüfen und sichern; keine vorhandene Website überschreiben. Uberspace dokumentiert diesen Aufbau im DocumentRoot-Handbuch.

Das Projekt unter `/var/www/virtual/` belassen; Apache kann laut Uberspace-8-Dokumentation nicht auf einen DocumentRoot unter `/home/` zugreifen. **Nie `private/` als Website veröffentlichen.** PHP muss seine privaten Dateien lesen und nach `private/data/` schreiben können. Öffentliche Ordner benötigen üblicherweise 0755 und öffentliche Dateien 0644. Private Dateien nur so weit freigeben, wie der eigene PHP-Prozess es benötigt; keine pauschalen Rechte 777 vergeben. Der automatisch erzeugte 2FA-Schlüssel erhält 0600.

## 4. Private Konfiguration ausfüllen

Die Datei `private/config.php` bleibt privat. Beispiel für die auszufüllenden Felder:

```php
'installation_key' => 'EIGENER-ZUFAELLIGER-SCHLUESSEL-MINDESTENS-32-ZEICHEN',
'database' => [
    'host' => 'localhost',
    'port' => 3306,
    'name' => 'ACCOUNT_garage',
    'user' => 'ACCOUNT',
    'password' => 'DEIN-MARIADB-PASSWORT',
    'table_prefix' => 'gt_',
],
'origin' => 'https://graveltube.be',
```

Für eine neue Installation kann ein privater Installationsschlüssel mit `php -r 'echo bin2hex(random_bytes(24)), PHP_EOL;'` erzeugt werden. Er wird nur für die Ersteinrichtung verwendet. Die leere öffentliche Paketkonfiguration enthält absichtlich keinen gemeinsamen Schlüssel.

Die Beispiele sind Platzhalter. Einfache Anführungszeichen und Backslashes im Passwort in einer PHP-Zeichenkette korrekt als `\'` bzw. `\\` maskieren. `origin` muss exakt der später im Browser verwendeten HTTPS-Adresse entsprechen, ohne Pfad und abschließenden Schrägstrich. www- und andere Varianten auf diese eine Adresse umleiten. Für Passkeys ist diese endgültige Domain maßgeblich.

## 5. Vorprüfung per SSH

Im hochgeladenen Projektordner:

```sh
php private/check-hosting.php
```

Die Prüfung kontrolliert PHP-Erweiterungen, Origin, Datenbankzugriff, InnoDB-Transaktion, Schreibrechte, private Ablage, Laufzeitbibliotheken und 2FA-Tabellen. Fehlende App-Tabellen können dabei angelegt werden. Fahrräder und 2FA-Aktivierung werden nicht verändert; Passwörter und Schlüssel werden nicht ausgegeben. Die Datei verweigert Webaufrufe und liegt zusätzlich außerhalb des DocumentRoot.

Danach die HTTPS-Domain öffnen und den eigenen Zugang einrichten. Bei übernommenen Daten mit dem bisherigen Zugang anmelden; keine erneute Ersteinrichtung erzwingen.

## 6. HTTPS hinter dem Uberspace-Frontend

Die App erkennt zunächst die nativen PHP-Variablen `HTTPS` und `SERVER_PORT`. Falls diese den ursprünglichen HTTPS-Aufruf nicht abbilden und die App trotz HTTPS einen Fehler 426 meldet, muss die tatsächliche Proxy-Konfiguration auf dem Zielkonto geprüft werden.

Dafür ist in `private/config.php` die optionale Liste `trusted_proxies` vorbereitet. **Nur konkret überprüfte IP-Adressen des unmittelbar vorgeschalteten Proxys eintragen**, und nur wenn dieser `X-Forwarded-Proto` zuverlässig überschreibt. Die App akzeptiert dann ausschließlich einen exakten `https`-Wert von diesen Peers. Besucher-Header, Wildcards und mehrdeutige Listen werden nicht pauschal vertraut. Nicht blind `127.0.0.1` oder ganze Netzbereiche eintragen. Liefert Uberspace bereits passende native HTTPS-Variablen, bleibt die Liste leer. Auch die für das Anmeldelimit sichtbare Clientadresse muss auf dem Zielkonto geprüft werden.

## 7. Uploads und Funktionstest

Die App lädt jede Datei separat hoch: maximal 20 MB pro Datei, mit `post_max_size=24M`. Eine `.user.ini` ist mitgeliefert. Falls diese Werte nicht wirksam sind, können bei Uberspace 8 eigene PHP-INI-Dateien unter `~/.config/php/` gesetzt und mit `uberspace web php reload` übernommen werden. Für Uberspace 7 die dortige PHP-Konfigurationsanleitung verwenden.

Vor produktiver Nutzung testen:

- Anmeldung, Abmeldung und Sitzungs-Cookies (Secure/HttpOnly).
- Fahrrad, Komponente, Lager und Service speichern; Seite erneut laden.
- Bild und PDF hochladen, angemeldet öffnen; nach Abmeldung darf kein Dateizugriff möglich sein.
- `private/`, `config.php`, `app.html` und `.user.ini` dürfen nicht öffentlich lesbar sein.
- Beide Lebenslaufvarianten und zugeordnete Anlagen prüfen.
- Erst danach den 2FA-Assistenten auf der endgültigen Domain verwenden und echte Geräte testen.

## Datenübernahme, Sicherung und Updates

Eine vollständige Übernahme/Sicherung besteht aus **Datenbank + `private/data/` + privater Konfiguration**. In `private/data/` liegen Uploads und gegebenenfalls `mfa-key.php`, der Schlüssel für verschlüsselte Authenticator-Geheimnisse. Ohne passenden Schlüssel sind übernommene Authenticator-Geheimnisse nicht nutzbar. Zugangsdaten und diese Sicherungen gehören niemals in öffentliche GitHub-Releases.

Die lokale Entwicklungsdatenbank und ihre Dateien werden nicht automatisch in ein Release eingebaut. Vor einer Datenübernahme einen gesonderten konsistenten Export erstellen und die Ziel-App während der Übernahme sperren. Datenbank-Dumps aus MySQL vor MariaDB-Import insbesondere auf MySQL-spezifische Dump-Anweisungen und Kollationen wie `utf8mb4_0900_ai_ci` prüfen. Inhalte nicht durch globale Text-Ersetzung verändern. Ein Testimport in eine leere separate Datenbank muss zuerst erfolgreich sein. Die Entwicklungsumgebung bleibt erhalten. Frühere SQLite-/Cloud-Daten benötigen eine gezielte Übernahme.

Bei Updates `public/`, die Backend-PHP-Dateien, `private/schema.sql` und `private/vendor/` aktualisieren. **Bestehende `private/config.php`, `private/setup-key.php`, `private/data/` und die Datenbank erhalten.** Die leere Paketkonfiguration nicht darüberkopieren. Öffentliche PHP-Beispiel- oder Testdateien nicht anlegen. Der JSON-Export der Fahrräder enthält weder alle Dateiinhalte noch die Anmeldesicherheitsdaten und ersetzt keine vollständige Sicherung.

Die lokalen Integrationstests laufen derzeit mit MySQL 8. Ein vollständiger Live-Test auf dem konkreten Uberspace-/MariaDB-Account ist vor Veröffentlichung erforderlich. Ohne Serverzugriff werden weder ein solcher Test noch DNS-/Zertifikatsänderungen behauptet.

## Als Web-App nutzen

Mac: Safari → Ablage → Zum Dock hinzufügen. iPhone/iPad: Teilen → Zum Home-Bildschirm. Kalenderexporte können in Apple Kalender importiert werden. Benachrichtigungen funktionieren bei geöffneter App; es gibt keinen Hintergrund-Push oder automatischen E-Mail-Versand.

## Offizielle Uberspace-Dokumentation

- MariaDB: https://u8manual.uberspace.de/database_mariadb/
- PHP: https://u8manual.uberspace.de/lang_php/
- DocumentRoot: https://u8manual.uberspace.de/web_documentroot/
- Web-Frontend: https://u8manual.uberspace.de/background_http/
- Domains/DNS: https://u8manual.uberspace.de/web_domains/
- Uberspace 7 PHP: https://manual.uberspace.de/lang-php/

## Optionale 2FA nach Inbetriebnahme

Die App funktioniert zunächst mit Benutzername und Passwort. Unter **Einstellungen → 2FA einrichten / verwalten** kann der Eigentümer nach erneuter Passwortprüfung Passkeys, FIDO2-Sicherheitsschlüssel (z. B. YubiKey mit PIN) und eine TOTP-Authenticator-App einrichten. Passkey-PIN, Face ID und Touch ID werden vom Browser/Gerät abgefragt und nicht von der App gespeichert. Authenticator-QR-Codes werden lokal im Browser erzeugt, ohne externen QR-Dienst.

Ein Verfahren muss zuerst bestätigt werden. Danach Wiederherstellungscodes erzeugen, getrennt von Geräten sicher aufbewahren und die Aktivierung ausdrücklich bestätigen. Jeder Wiederherstellungscode ist einmal mit dem Passwort nutzbar. Bei aktiver 2FA wird nach dem Passwort einer der eingerichteten Faktoren verlangt. Das Verwaltungsmenü verlangt ebenfalls Passwort plus vorhandenen Faktor. Nicht verwendete Sicherheitsfreigaben und Anmelde-Challenges laufen nach fünf Minuten ab.

Die Datenbank benötigt weiterhin CREATE-Rechte: Beim ersten Aufruf werden zwei zusätzliche Tabellen mit dem konfigurierten Präfix angelegt. PHP benötigt OpenSSL. WebAuthn ist lokal auf localhost testbar, auf dem Server unter einer festen HTTPS-Domain. `origin` auf die endgültige URL ohne Pfad setzen, z. B. `https://graveltube.be`. App und API müssen denselben Origin verwenden. Lokale Passkeys und Passkeys einer temporären Vorschau-Domain sind für die endgültige Domain neu einzurichten; vor der finalen Domainumschaltung nicht ausschließlich auf solche Schlüssel verlassen.

**Wichtig für vollständige Sicherungen:** `private/data/mfa-key.php` ist der Verschlüsselungsschlüssel der Authenticator-Geheimnisse. Er wird erst bei Bedarf zufällig erzeugt und darf bei Updates nicht überschrieben werden. Datenbank plus privates Datenverzeichnis gemeinsam sichern. Der Fahrrad-JSON-Export enthält keine Zugangssicherheitsdaten. Bei Verlust von Geräten helfen ein zusätzlich registrierter Schlüssel und Wiederherstellungscodes. Es gibt keinen öffentlich zugänglichen Reset ohne Identitätsnachweis.

Vor Freigabe reale Anmeldungen mit deinen Browsern, Authenticator und YubiKey prüfen. Die lokalen Protokolltests verwenden einen kryptographischen Software-Authenticator; sie ersetzen den Gerätetest auf der endgültigen Domain nicht. Die mitgelieferten Bibliotheken benötigen keine Composer-Installation auf dem Server.

## Optionaler Strava-Import

1. Lege in den [Strava-API-Einstellungen](https://www.strava.com/settings/api) eine eigene API-Anwendung an. Für die bestehende Uberspace-Installation lautet die Callback-Domain `metagravel-garage.de`. Trage in der privaten `config.php` unter `strava` die Client-ID und das Client Secret ein. `base_url` ist optional, wenn `origin` bereits auf die HTTPS-Adresse der Garage zeigt. Bei einer Installation im Unterordner enthält `base_url` auch diesen Pfad.
2. Führe auf dem Server einmal `php /pfad/zur/garage/private/strava-job.php register` aus. Der Befehl registriert den Webhook oder übernimmt die bereits passende Registrierung. Für ein verwaltetes Uberspace-Setup verwende den stabilen Pfad über den aktiven App-Link, beispielsweise `~/gravelbike-garage/private/strava-job.php`.
3. Trage in `crontab -e` den Hintergrundjob mit dem absoluten Pfad deiner Installation ein.

   ```cron
   * * * * * php /home/ACCOUNT/gravelbike-garage/private/strava-job.php
   ```

4. Öffne **Verwaltung → Konfiguration → Strava-Integration** und klicke auf **Mit Strava verbinden**. Bestätige die Lesefreigaben auf Strava. Die Garage lädt deine Räder bei der Rückkehr, damit du sie direkt zuordnen kannst. Bestätige je Rad den aktuellen Kilometerstand und wähle den ersten Tag, dessen Fahrten in diesem Stand noch fehlen. Der erste Tag zählt mit. Sind die heutigen Fahrten bereits enthalten, wähle morgen.

Der Job verarbeitet Webhook-Meldungen im Minutentakt und gleicht einmal täglich die jüngsten 30 Tage ab. Über „Jetzt abgleichen“ kannst du die Prüfung auch sofort starten. Weise Fahrten ohne Fahrrad in Strava zu. Erfasse dieselbe Fahrt nur einmal. Die Garage speichert für den Abgleich Fahrtdatum, Distanz und IDs. GPS-Strecken werden nicht gespeichert. Beim Trennen der Verbindung werden die Strava-Fahrtdetails entfernt. Die bereits fortgeschriebenen Kilometerstände bleiben erhalten. Wähle bei einer erneuten Einrichtung einen Starttag, dessen Fahrten noch nicht enthalten sind.

PHP benötigt OpenSSL und aktivierte HTTPS-Streams (`allow_url_fopen`). Die App benötigt CREATE-Rechte für zwei zusätzliche Tabellen. Das Client Secret gehört ausschließlich in die private Konfiguration. Es schützt auch die gespeicherten Zugriffsschlüssel. Nach einem Wechsel des Secrets sind Verbindung und Webhook neu einzurichten. [Strava-Webhooks](https://developers.strava.com/docs/webhooks/) · [Uberspace-Cron](https://manual.uberspace.de/daemons-cron/)
