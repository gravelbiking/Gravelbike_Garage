# Gravelbike Garage

**Version 1.2.5 · Horchen und sehen**

Eine private Fahrradgarage als Web-App: Fahrräder und verbaute Bauteile verwalten, Serviceintervalle planen, Werkstattaufträge dokumentieren, Ersatzteilbestände führen und Dokumente sicher zuordnen. Die App lässt sich am Mac, auf dem Tablet und Smartphone im Browser oder als installierte Web-App nutzen.

## Funktionen

- **Meine Fahrräder:** Fahrradsteckbriefe, Komponenten, Kilometerstände, Serviceplan, Servicebuch, Radcomputer und Fahrradarchiv.
- **Lager:** Artikel, Bestände und Lagerorte, Einkaufsliste, Materialverbrauch und Belege.
- **Werkstatt:** Aufträge mit einzelnen Tätigkeiten, passenden Ersatzteilen, Werkzeug und Anleitungen.
- **Adressbuch und Dokumente:** Kontakte, Werkstatttermine, Rechnungen, Verträge und technische Unterlagen.
- **Strava:** Zwei unabhängige Verbindungen mit jeweils eigener Client-ID und eigenem Client-Secret; Fahrräder getrennt zuordnen und Kilometer synchronisieren.
- **Verwaltung:** Passwortschutz, optionale Zwei-Faktor-Anmeldung, Passkeys/YubiKey, Einstellungen, Handbuch und Versionsinformationen.

## Neu in 1.2.5 · Horchen und sehen

- **Werkstatt:** Lagerartikelanlage oder Beschaffung ohne Einlagerung (#101).
- **Ersatzteile finden:** Kategorie, Suche nach Name/Hersteller/Modell/Artikelnummer, Hersteller-/Teileart-/Bestandsfilter und acht Ergebnisse pro Seite (#104).
- **Bauteilwechsel:** eindeutige Zuordnung vorausfüllen, Ausbau/Einbau bestätigen, Fahrradstand und Lebenslauf gemeinsam mit Materialverbrauch speichern (#103).
- **Navigation:** auffälliger Startseiten-Button in der gemeinsamen Kopfzeile (#105).
- **Serviceintervall:** aktueller Kilometerstand bei kilometerabhängiger Fälligkeit, maximal eine Nachkommastelle (#108).
- Zentrale, strukturierte Fehlerprotokolle für Browser, PHP, interne und externe APIs, Strava und Hintergrunddienste ([Issue #106](https://github.com/gravelbiking/Gravelbike_Garage/issues/106)).
- Private, getrennte Logströme je Instanz und Modul mit Vorgangs-ID, Maskierung, Rotation und Größenbegrenzung.
- Admin → Protokolle: Instanz, Modul, Quelle, Schweregrad, Zeitraum und Vorgangs-ID filtern; suchen, blättern, aktualisieren und als TXT exportieren.
- Strava-Verbindungsversuche mit Client-ID und bereinigter Rückleitungsadresse nachvollziehen. Ausbleibende Rückkehr wird nach Ablauf vom Strava-Job erkannt.

[Technik, Datenschutz und Testanleitung](docs/logging.md) · [Lokaler Prüfbericht](docs/testing-1.2.5-logging.md).

Alle Änderungen: [Releasenotes 1.2.5](docs/releases/1.2.5.md).

## Neu in 1.2.4 · STRAVA bugfixing

- Zwei vollständig unabhängige Strava-Verbindungen mit getrennten Zugangsdaten, Autorisierungen, Importen und Fehlerbehandlung.
- Kilometeranzeigen und Formularwerte mit maximal einer Nachkommastelle. Präzise interne Importdaten bleiben erhalten; Wartungen lassen sich auch nach einem Strava-Import speichern.
- Serviceintervalle mit Assistent, Zusammenfassung, Fahrrad- und Fälligkeitsfilter sowie Zuordnung zur nächsten Servicefälligkeit.
- Werkstatt-Assistent: Die Nummer bleibt über alle Eingabeseiten derselben Tätigkeit gleich. Neue Aufträge verwenden bereits angelegte Fahrräder.
- Verbaute Bauteile direkt als Lagerartikel ohne Bestand anlegen und anschließend mit erhaltenen Eingaben zum Auftrag zurückkehren.
- Verbesserungen für mobile WebViews, Lade-/Fehlerzustände, Offline-Hinweise und Navigation.

## Download für Uberspace

Das geprüfte Installationspaket und die zugehörige SHA-256-Prüfsumme stehen im [Release v1.2.5](https://github.com/gravelbiking/Gravelbike_Garage/releases/tag/v1.2.5).

Installation mit eigener PHP-/MariaDB-Umgebung: [Installationsanleitung](selfhost/INSTALLATION.md). Das ZIP enthält keine Zugangsdaten und keine Nutzerdaten. Für eine neue Installation müssen eigene Datenbankzugänge und ein eigener Installationsschlüssel konfiguriert werden.

## Im GitHub Codespace bearbeiten

[Codespace erstellen](https://github.com/codespaces/new?hide_repo_select=true&ref=main&repo=1441876709)

1. Codespace für den Branch `main` erstellen. PHP 8.4, Node 24 und eine eigene MariaDB 11.4 werden vorbereitet.
2. Die Einrichtung und die Quellcode-Tests abwarten. Die App startet anschließend automatisch auf **Port 4173**.
3. Im Tab **Ports** bei 4173 auf **Im Browser öffnen** klicken. Der Port bleibt privat.
4. Einen eigenen App-Benutzernamen und ein Passwort anlegen. Der für diesen Codespace neu erzeugte Installationsschlüssel ist in der Entwicklungsansicht vorausgefüllt.
5. Dateien unter `src/` und `selfhost/` bearbeiten. Änderungen werden automatisch neu gebaut; anschließend die App neu laden.

```sh
npm test              # enthaltene Quellcode-Regressionstests
npm run dev:build     # App neu bauen
npm run dev:status    # Vorschau prüfen
npm run dev:stop      # Vorschau stoppen; Daten behalten
npm run dev          # Vorschau wieder starten
```

Die Codespace-Datenbank und Uploads sind vollständig von den Uberspace-Instanzen getrennt. Zugangsdaten, Installationsschlüssel, Laufzeitdaten und Logs werden unter `.local/` erzeugt und von Git ausgeschlossen. Ein Codespace-Neuaufbau verwendet die bestehenden Zugangsdaten und den persistenten Datenbank-Datenträger weiter.

Die Freigabe von Änderungen für Server oder neue GitHub-Releases erfolgt weiterhin ausdrücklich. Der Codespace veröffentlicht keine Änderungen automatisch. Strava muss bei Bedarf mit eigenen API-Daten und dem passenden Callback-Host des Codespace eingerichtet werden; Produktionsverbindungen werden nicht übernommen.

## Quellstand

Dies ist eine bereinigte Kopie des freigegebenen Anwendungscodes, einschließlich der mitgelieferten Bibliotheken und ihrer Lizenzdateien. Der lokale Entwicklungsverlauf, lokale Daten, Serverkonfigurationen und persönliche Dokumente sind nicht enthalten. `RELEASE.json` dokumentiert die Version und die Prüfsumme des Installationspakets. Die Admin-Anwendung bleibt eine separate Installation; ihr bereinigter Quellcode ist für die neue Logansicht unter `admin/` enthalten. Bestehende Admin-Konfigurationen, Datenbanken, Benutzer und Schlüssel werden nicht mitgeliefert.
