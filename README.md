# Gravelbike Garage

Deine Fahrräder, deine Werkstatt, deine Geschichte.

Gravelbike Garage ist eine selbst gehostete Web-App für alle, die ihre Fahrräder und die Arbeiten daran an einem Ort verwalten möchten. Entstanden ist sie zunächst für eine private Fahrradwerkstatt. Sie lässt sich im Browser auf Mac, iPhone und iPad verwenden und als Web-App zum Home-Bildschirm beziehungsweise Dock hinzufügen.

## Was die App bietet

- **Fahrradverwaltung:** Steckbriefe mit Fotos, Seriennummern, Kaufdaten und aktuell verbauten Komponenten. Dazu Rahmen- und Reifendaten sowie Angaben zu Jobrad, Leasing und Versicherung.
- **Kilometer und Wartung:** Kilometerstände mit Datum, Wartungsintervalle nach Zeit oder Laufleistung, Fälligkeitshinweise und ein Servicebuch pro Fahrrad.
- **Werkstattaufträge:** Service und Reparaturen für eigene und fremde Fahrräder mit Ersatzteilen, Checklisten und verknüpften Anleitungen.
- **Lager und Einkauf:** Ersatzteile und Verbrauchsmaterialien mit einzelnen Lagerpositionen, Lagerorten, Mindestbeständen, Preisen, Belegen und nachvollziehbaren Entnahmen für Services. Inventurberichte zeigen Bestände und Werte.
- **Dokumente und Lebensläufe:** Verträge, Rechnungen und Werkstattunterlagen ablegen und mehrfach verknüpfen. Für jedes Fahrrad lassen sich Verkaufs- und Werkstatt-Lebensläufe erstellen.
- **Adressbuch:** Händler, Werkstätten und Lieferanten mit mehreren Rollen, Kontakt- und Kundendaten, Dokumenten, Account-Links und Werkstattterminen.
- **Werkzeug und Radcomputer:** Werkzeuge spezifizieren und Bauteilen zuordnen; Radcomputer mit Softwarestand und Kaufdaten verwalten.
- **Strava:** Nach Einrichtung der Strava-Integration das eigene Konto verbinden, Fahrräder zuordnen und gefahrene Kilometer synchronisieren.
- **Zugangsschutz:** Passwortanmeldung und optionale Zwei-Faktor-Anmeldung mit Passkeys, YubiKeys, Authenticator-App und Wiederherstellungscodes.
- **Info und Verwaltung:** Nutzungshandbuch mit Fahrrad-Schnellstart, Releasenotes, Systemeinstellungen, Datenexport und eine Updatefunktion bei eingerichtetem Update-Dienst.

## Download und Installation

Die aktuelle Version ist **1.2.1 · Secure Hamster**.

➡️ [Aktuelle Version mit Installationspaket herunterladen](https://github.com/gravelbiking/Gravelbike_Garage/releases/latest)

Unter **Assets** das benannte **Gravelbike-Garage-Uberspace-VERSION.zip** und die zugehörige **.zip.sha256** herunterladen. Die automatisch von GitHub angebotenen „Source code“-Archive sind nicht das Installationspaket.

Das Paket ist für **Uberspace mit PHP und MariaDB** vorbereitet. Die Anleitungen **INSTALLATION.md** und **UPDATE.md** im ZIP beschreiben Einrichtung und Aktualisierung. Eigene Datenbankzugangsdaten und einen privaten Installationsschlüssel verwenden, HTTPS einrichten und vor einem Update eine Sicherung erstellen. Die SHA256-Prüfsumme dient zur Kontrolle des heruntergeladenen Pakets.

Dieses Repository stellt die freigegebenen Installationspakete bereit. Entwicklungsumgebung, lokale Testdaten und private Zugangsdaten werden nicht veröffentlicht.

## Letzte Releasenotes

### [1.2.1 · Secure Hamster](https://github.com/gravelbiking/Gravelbike_Garage/releases/tag/v1.2.1)

- Verpflichtender Wechsel vorläufiger Installationspasswörter nach vollständiger Anmeldung einschließlich optionaler 2FA.
- Passwörter mit mindestens **15 Zeichen** und mindestens **drei von vier Zeichengruppen**: Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen. Das bestehende Hashverfahren erlaubt höchstens 72 UTF-8-Bytes.
- Passwortwechsel nach **einem Jahr**; die letzten **drei Passwörter** dürfen nicht wiederverwendet werden.
- **User Access Management** mit Anzeige der Passwortgültigkeit und vorhandener 2FA-Verwaltung.
- Rote Warnung auf der Startseite ab **30 Tagen vor Ablauf**.
- Kontosperre für **zehn Minuten nach zehn aufeinanderfolgenden Fehlversuchen**.

**Hinweis beim Update:** Bestehende Konten mit unbekanntem Passwortalter oder Richtlinienstand müssen beim nächsten Aufruf ein neues Passwort setzen. Das bisherige Passwort wird für die Anmeldung und den Wechsel verwendet. Garagendaten und eingerichtete 2FA bleiben erhalten.

### [1.2.0 · Nice Hamster](https://github.com/gravelbiking/Gravelbike_Garage/releases/tag/v1.2.0)

- Neuer Info-Bereich unter Verwaltung mit **Info**, **Releasenotes**, **Handbuch** und **Update**.
- Nutzungshandbuch mit Schnellstart zum Anlegen eines Fahrrads.
- Werkstattname dauerhaft im App-Kopf sichtbar.
- Modulüberschriften am Desktop als Text, auf Mobilgeräten weiterhin als Links.
- Mobile Navigation fest am unteren Bildschirmrand.

[Alle veröffentlichten Versionen ansehen](https://github.com/gravelbiking/Gravelbike_Garage/releases)

## Ideen und Weiterentwicklung

Rückmeldungen, Fehlerberichte und Funktionswünsche können unter [Issues](https://github.com/gravelbiking/Gravelbike_Garage/issues) eingetragen werden.
