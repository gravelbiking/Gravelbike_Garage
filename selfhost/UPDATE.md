# Gravelbike Garage 1.2.4 · STRAVA bugfixing

- Zwei unabhängige Strava-Verbindungen mit jeweils eigener Client-ID und eigenem Client-Secret, getrennter Autorisierung und Synchronisation.
- Kilometer werden in Anzeigen und Formularen mit maximal einer Nachkommastelle dargestellt. Präzise interne Strava-Daten und unveränderte Bestandswerte bleiben erhalten.
- Werkstatt-Assistent mit Arbeitsschrittnummer pro Tätigkeit statt pro Eingabeseite. Direkte Anlage verbauter Bauteile als Lagerartikel ohne Bestand und Rückkehr mit erhaltenen Auftragseingaben. Neue Aufträge verwenden vorhandene Fahrräder.
- Serviceintervalle mit Assistent, gefilterter Übersicht und Zuordnung zur nächsten Servicefälligkeit; künftige Intervalle im Fahrrad-Lebenslauf.
- Bessere Darstellung in mobilen WebViews, robustere Lade-/Fehlerzustände und bereinigte Navigation.

# Gravelbike Garage 1.2.0 · Hamster – in Entwicklung

- Seit dem 04.11.2026 werden neue Features und Codeänderungen unter V1.2 geführt. Die technische Versionsnummer lautet 1.2.0.
- Die offenen Anforderungen aus den bisherigen Planungen für 1.1.2 und 2.0 werden unter V1.2 zusammengeführt.

## Gravelbike Garage 1.1.1.m · Hamster – Uberspace

- Strava direkt in der Konfiguration einrichten. Die Kurzanleitung zeigt den Strava-Link, die empfohlenen Feldwerte und die Callback-Domain der jeweiligen Umgebung.
- Client ID und Client Secret nach erneuter Passwort-/2FA-Bestätigung geschützt speichern. Die private Datei wird von App und Hintergrundabgleich gemeinsam verwendet.
- Strava-Konto verbinden und den automatischen Import aus der App einrichten. Jede Umgebung erhält einen eigenen Hintergrunddienst.

## Gravelbike Garage 1.1.1.l · Hamster – Uberspace

- Parallele Installationen können unter einem eigenen Unterordner betrieben werden, mit eigener Datenbank, Dateiablage, Anmeldung und Update-Dienst.
- Jede Installation zeigt ihren eigenen Namen auf der Anmeldemaske.

## Gravelbike Garage 1.1.1.k · Hamster – Uberspace

- Die Anmeldemaske zeigt Version und Releasename wie die App.
- Direkt unter „Gravelbike Garage“ steht der Installationsname als dezente Textzeile. Die aktuelle Installation heißt Prod1.
- Weitere Installationen erhalten über `installation_name` in ihrer privaten `config.php` einen eigenen Namen.

## Gravelbike Garage 1.1.1.g · Hamster – Uberspace

- Werkstattaufträge für fremde Fahrräder können als Service oder Reparatur angelegt werden.
- Die Navigation und die Kacheln zeigen einen Stift für Werkstattaufträge, ein Buch für das Servicebuch, GPS für Radcomputer und eine Wolke für das Fahrradarchiv.

## Gravelbike Garage 1.1.1.f – Uberspace

- Die Auftragsbeschreibung steht im Werkstattauftrag über den Ersatzteilen.

## Gravelbike Garage 1.1.1.e – Uberspace

- Ersatzteile stehen im Werkstattauftrag an erster Stelle und lassen sich einzeln als **Vorhanden** abhaken.
- Unter **Anleitungen** lassen sich die verknüpften Anleitungen direkt im Auftrag aufklappen und ihre Dateien in der Vorschau öffnen. Schritte lassen sich einzeln als **Erledigt** abhaken.

## Gravelbike Garage 1.1.1.d – Uberspace

- Reparaturen für eigene und fremde Fahrräder werden unter **Werkstatt → Werkstattaufträge** erfasst.
- Über **＋ Arbeitsschritt hinzufügen** eine Werkstattanleitung suchen und als Schritt auswählen. Bereits gespeicherte Schritte und ihr Fortschritt bleiben erhalten.

Das Datenbankschema bleibt gleich.

## Gravelbike Garage 1.1.1.c – Uberspace

- PDFs und Bilder öffnen sich in einer Vorschau mit einem sichtbaren **Schließen**-Button. Beim Schließen kehrt die App zur vorherigen Ansicht zurück. Die Vorschau bietet auch einen Download an.
- Der Online-Lebenslauf hat einen eigenen **Schließen**-Link zurück zum Fahrrad.
- Die Fußzeile zeigt die Versionsangabe größer und ohne den bisherigen Spruch.

Das Datenbankschema bleibt gleich.

## Gravelbike Garage 1.1.1.b – Uberspace

- Werkstattaufträge für Service und Reparatur mit Checkliste, Teilebedarf, Lagerorten und verlinkten Anleitungen. Der Bereich **Meine Fahrräder → Reparaturauftrag** nimmt auch Aufträge für fremde Fahrräder auf.
- Werkstattanleitungen direkt im Serviceplan auswählen und öffnen. Beim Start eines Auftrags aus einem Serviceplan werden Anleitungen und geplanter Teilebedarf übernommen.
- Vorhandene Dokumente über eine gemeinsame Suche auswählen und mit mehreren Einträgen verknüpfen. Die Dokumentablage zeigt Links zurück zu diesen Einträgen. Fahrradzuordnung und Dokumenttyp sind nachträglich bearbeitbar. Eigene Dokumenttypen stehen zur Wiederverwendung bereit.
- Kleines Uberspace-Badge unten rechts.

Das Datenbankschema bleibt gleich. Die App erweitert die vorhandenen Garagendaten beim Speichern um die neuen Angaben. Neue Werkstattaufträge planen Bedarf und buchen keinen Lagerverbrauch.

## Gravelbike Garage 1.1.1.a · Sauberer Hamster – Uberspace

- Startseite und getrennte Moduldashboards. Die Bereiche stehen in der Navigation unter ihrem jeweiligen Modul.
- Fahrradparkplatz mit Fotos, Laufleistung und nächstem Service. Archivierte Fahrräder behalten ihre Dokumente und Historie und können wieder aktiviert werden.
- Durchsuchbare Dokumentablage für Fahrräder und Werkstattanleitungen.
- Verwaltung mit Konfiguration, Userverwaltung, System, Updates und Datensicherung. Drei Farbschemata, Browser-Erinnerungen, Passwortwechsel und bestehende 2FA-Verwaltung.
- Systemübersicht mit Version, Serverpfad, PHP und Datenbank sowie Dateigrößen und Datenbankstatistik.

Das Datenbankschema bleibt gleich. Bei der ersten Installation dieser Zwischenversion auf einem bestehenden 1.1.1-System das Uberspace-Paket verwenden. Der ältere Update-Assistent erkennt das zusätzliche Buchstabensuffix noch nicht.

## Gravelbike Garage 1.1.1 · Schicker Hamster – Uberspace

- Auf der Übersicht öffnet **Gefahrene Kilometer** einen Dialog für Fahrrad und Strecke. Der neue Gesamtstand erscheint in der Vorschau. Beide Lebensläufe zeigen den Ablesetag, sofern er erfasst wurde.
- **Mein Lager** zeigt eine durchsuchbare Liste mit Bestand und Lagerorten. Ein Klick auf den Teilnamen öffnet den Artikel mit seinen Bildern, Positionen und Belegen.
- Die Radcomputer-Übersicht heißt **Deine Navigarage**.
- **Einstellungen → Updates** zeigt die installierte Version und sucht in den offiziellen GitHub-Releases nach neueren Paketen. Nach Bestätigung prüft der Server die Prüfsumme, sichert die privaten Dateien und MariaDB und schaltet nach einem kurzen Wartungsmodus um. Die Rückschaltung auf die letzte unterstützte Version erhält die Garagendaten.

Der Update-Assistent benötigt den separat eingerichteten privaten Uberspace-8-Dienst. Beim manuellen SFTP-Setup ist die Versionsanzeige verfügbar und der Assistent meldet, wenn der Dienst fehlt. Updates mit verändertem Datenbankschema erfordern eine betreute Migration. 1.1.1 verwendet das Schema von 1.1.0.

## Neu in Version 1.1.0 · Hamster

- Dauerhafte Lagerartikel mit mehreren einzeln geführten Beständen, Verpackungsinhalt, Einkaufspreisen, Lieferanten und Belegen. Verbrauchte Positionen bleiben sichtbar. Zugänge, Serviceentnahmen und begründete Bestandskorrekturen bilden ein dauerhaftes Bewegungsprotokoll; nachträgliches Bearbeiten eines Services bucht nicht erneut ab.
- Inventurübersicht sowie PDF-/CSV-Ausgabe mit Beständen, Artikelsummen, Gesamtwert und freien Zählfeldern. Fehlende Preise werden markiert.
- Werkzeugverwaltung mit Spezifikationen und Zuordnung zu mehreren konkreten Fahrradbauteilen; Radcomputer mit eigenen Steckbriefen, Kaufdaten und Softwarestand.
- Fahrradsteckbrief: Modelljahr, Rahmenfarbe, Rahmenmaterial und Gewicht. Neue Kategorie Reifen mit Vorder-/Hinterreifen und Breite; Freilaufkörper am Hinterrad.
- Jobrad: Leasingrate, Versicherungsdaten und -belege, Übernahmestatus und Kaufpreis.
- Kontakte mit mehreren Rollen gleichzeitig sowie Account- und Online-Terminlinks. Lieferant heißt in der Anzeige „Lieferant (online)“.
- BIKE24-Such-/Produktlinks und EAN. Automatischer Produktimport bleibt bis zu einem bestätigten Anbieterzugang offen.
- Versionsanzeige „1.1.0 · Hamster“; neutrale Bezeichnungen für Selfhosting-Skripte und Meldungen.

Beim Update werden bestehende Artikel beim Laden kompatibel um eine erste Lagerposition ergänzt; dauerhaft gespeichert wird die Übernahme mit der nächsten Änderung. Bestehende Fotos, Belege, Fahrräder und Sicherheitsdaten bleiben erhalten. Frühere, nicht protokollierte Lagerbewegungen werden nicht rekonstruiert. Kein SQL-Import erforderlich. Vor dem Update Datenbank und privaten Datenordner gemeinsam sichern; `private/features.php` und `private/inventory-report.php` zusätzlich zu den bisherigen Laufzeitdateien übernehmen.

## Enthalten in Version 1.0.0

- Neues Installationsziel Uberspace mit MariaDB, PHP 8.4 und eigener Datenbank. INSTALLATION.md beschreibt SFTP-Ordnerstruktur, Domain, geschützte Ablage, 2FA, Sicherung und Datenübernahme.
- Private CLI-Vorprüfung `private/check-hosting.php` für den Zielaccount. Optionale, exakt begrenzte Proxy-Vertrauensliste; keine pauschale Akzeptanz von Forwarded-Headern.
- Neuer Freigabe-Builder für Uberspace und angepasste Veröffentlichungsvorbereitung. Entwicklungsdaten und 2FA-Schlüssel bleiben lokal; bestehende historische Installationspakete bleiben unverändert.


- Optionale Zwei-Faktor-Anmeldung im Konfigurationsmenü: Assistent mit erneuter Passwortprüfung, Passkeys (Apple/Google/Gerät), FIDO2-YubiKey, Authenticator-App und einmaligen Wiederherstellungscodes. Standard bleibt Passwortanmeldung. Aktivierung verlangt bestätigtes Verfahren und gesicherte Wiederherstellungscodes.
- Nach Aktivierung: Passwort allein gibt keine App-Sitzung frei. Sicherheitsänderungen verlangen bei aktiver 2FA einen vorhandenen Faktor. Andere Sitzungen werden beim Aktivieren/Deaktivieren beendet. Der letzte nutzbare Faktor bleibt vor Entfernen geschützt.
- Authenticator-Schlüssel sind verschlüsselt; der zugehörige private Schlüssel liegt in `private/data/mfa-key.php`. Diese Datei unbedingt gemeinsam mit der Datenbank sichern und bei Updates erhalten. Wiederherstellungscodes werden nur gehasht gespeichert. 2FA-Geheimnisse sind nicht im Fahrrad-JSON-Export enthalten.
- Beim ersten Aufruf werden zusätzliche Tabellen mit dem konfigurierten Präfix angelegt (security, mfa_flows). Bestehende Fahrraddaten und Zugangspasswörter bleiben erhalten.
- Updates dieser Fassung benötigen zusätzlich `private/mfa.php` und den vollständigen Ordner `private/vendor/`. Passkeys werden auf der späteren HTTPS-Domain neu registriert; localhost-Registrierungen gelten dort nicht.


- Pro Fahrrad: Verkaufs-Lebenslauf und Werkstatt-Lebenslauf mit Basisdaten, aktueller Ausstattung und vollständiger dokumentierter Wartungshistorie. Druckansicht mit PDF-Speicherung über den Browser.
- Verkaufs-Lebenslauf: externe Betriebe und ausdrücklich zugeordnete Servicebelege. ZIP enthält den druckbaren HTML-Lebenslauf und die Originalbelege. Allgemeine Händlerdokumente werden nicht automatisch mitgegeben.
- Werkstatt-Lebenslauf: ohne Betriebsangaben und Anhänge; freie Notizen werden ausgelassen und bekannte Betriebsnamen in den ausgegebenen Textfeldern ersetzt.
- Servicebelege können direkt hochgeladen oder ausdrücklich aus vorhandenen Kontakt-/Fahrraddokumenten zugeordnet werden. Keine SQL-Schemaänderung.


- Lagerartikel können ein eigenes Bild erhalten: Fotoalbum/Bilddatei oder Kameraaufnahme über unterstützte Mobilgeräte. Bilder werden wie Belege privat gespeichert.
- Adressbuch für Händler, Werkstätten und Lieferanten mit Kontaktdaten, Kundennummer und Dokumenten (Rechnung, Lieferschein, Gutschein, Sonstiges).
- Werkstatttermine mit Datum, Uhrzeit, Status, Fahrrad- und Servicezuordnung sowie Kalenderexport. Der abgeschlossene Werkstattbesuch kann samt Materialverbrauch ins Servicebuch übernommen werden.
- Services und Servicebucheinträge können einem Adressbuchkontakt zugeordnet werden. Keine SQL-Schemaänderung erforderlich.


- Neues Modul Lager mit Kategorie, Teil, Hersteller, Original/Zubehör, Artikelnummer, Menge und Einheit, Einzelpreis, Kaufdatum, Mindestbestand, Lagerort, Notizen und Rechnungsuploads.
- Einkaufsliste im Serviceplan mit Zuordnung zu Services/Fahrrädern, offenen und gekauften Teilen, dynamischen Feldern für Online-Link, Händler oder Lagerauswahl. Gekaufte Restmengen lassen sich einmalig ins Lager buchen.
- Beim Abschließen eines Services können die tatsächlich verbrauchten Artikel einzeln bestätigt werden. Nur bestätigte Mengen werden abgebucht; Servicebuch und Bestand werden gemeinsam gespeichert. Bereits dokumentierter Verbrauch wird beim Bearbeiten nicht nochmals abgezogen.
- Eine neue Startseitenkachel bündelt Nachkäufe bei erreichtem Mindestbestand und offene Serviceeinkäufe. Vorläufig verwendet sie direkte idealo-Suchlinks; automatische Suchtreffer benötigen später einen passenden Suchdienst-Zugang.
- Die Erweiterung wird in vorhandenen MySQL-Garagedaten gespeichert. Bestehende Datensätze ohne Lager/Einkauf bleiben lesbar; keine SQL-Schemaänderung nötig.

- Bauteile lassen sich direkt in der Fahrradansicht löschen. Eine Sicherheitsabfrage nennt Bauteil und Fahrrad; Abbrechen erhält das Bauteil. Servicebucheinträge bleiben beim Entfernen eines Bauteils erhalten.
- Das Servicebuch zeigt jedes Fahrrad als eigenen Tab mit Anzahl seiner Wartungen. Neue Wartungen sind für das ausgewählte Fahrrad vorbelegt; Tabs sind auch per Pfeiltasten, Pos1 und Ende bedienbar.

- Jedes Bauteil in der Fahrradansicht besitzt einen eigenen Bearbeiten-Button. Er öffnet ausschließlich die Felder dieses Bauteils; Speichern verändert weder Fahrrad-Grunddaten noch andere Bauteile. Abbrechen verwirft die Eingaben im Einzel-Editor.

- Die Fahrradansicht zeigt Antrieb, Bremsen, Räder, Cockpit, Sattel, Licht und Zubehör als Tabs mit Bauteilanzahl. Es ist jeweils nur eine Kategorie sichtbar.
- Im Fahrradformular sind die Grunddaten und vorhandene Bauteile zunächst eingeklappt; bei neuen Fahrrädern bleiben die Grunddaten zur Eingabe offen. Nach dem einzelnen Speichern werden Grunddaten und Bauteil eingeklappt, damit das Fenster kürzer wird. Über den Bauteilnamen lassen sie sich öffnen.
- „Bauteil speichern“ sichert das einzelne Bauteil sowie die Fahrrad-Grunddaten und klappt es anschließend ein. Andere offene Bauteilentwürfe bleiben im Formular erhalten. Für neue Fahrräder sind zunächst Name und Kilometerstand erforderlich.
- „Fahrrad speichern“ sichert alle verbleibenden Entwürfe und schließt das Formular. „Abbrechen“ verwirft die noch offenen Eingaben; bereits einzeln gespeicherte Bauteile bleiben gespeichert.


- Neuer App-Name: Gravelbike Garage.
- Original-Teilenummer, Preis in Euro und „Zuletzt gekauft bei“ für Bremsscheibe, Bremsklotz/Bremsbelag, Kette, Kassette, Kurbel, Zahnkranz und Innenlager. Preise behalten ihre Centbeträge; Teilenummern werden als Text mit führenden Nullen gespeichert.
- Kurbel und Zahnkranz sind unter Antrieb auswählbar.
- Neue öffentliche Downloads enthalten keinen gemeinsamen Installationsschlüssel. Bei einer Erstinstallation wird ein eigener zufälliger Schlüssel in `private/config.php` unter `installation_key` benötigt. Bereits eingerichtete Zugänge und frühere lokale Setup-Hashes funktionieren weiter.

## Bereits enthalten in 1.4

- Räder: Vorderrad und Hinterrad mit getrennten Angaben für Hersteller, Modell, Achsdimension, Bremsaufnahme, Felgenhöhe (mm), Innenmaulweite (mm), Felgenmaterial und Lagerservicedatum.
- Cockpit: Vorbau und Lenker.
- Sattel: Sattel und Sattelstütze.
- Licht: Vorderlicht und Rücklicht.
- Die zusätzlichen Raddaten erscheinen im Formular bei Kategorie „Räder“. Beide Räder werden als eigene Bauteile angelegt.
- Hersteller und Modell sind jetzt getrennte Felder. Der bisherige gemeinsame Text bleibt vollständig im Modellfeld erhalten und kann bei Bedarf aufgeteilt werden.
- Frühere Bezeichnungen wie Laufrad, Scheinwerfer oder Lenkerband bleiben erhalten und werden weiterhin ihrer Kategorie zugeordnet. Auch beim vorübergehenden Wechsel der Kategorie bleiben eingegebene Raddaten gespeichert.

## Weiterhin enthalten

- Bauteile haben Kategorie, Einbaudatum und Kilometerstand beim Einbau.
- Kategorien: Antrieb, Bremsen, Räder, Cockpit, Sattel, Licht und Zubehör.
- Antrieb: Schaltwerk, Umwerfer, Kassette, Kurbel, Innenlager und Kette.
- Bremsen: Schalt-/Bremshebel, Bremsscheibe, Bremsbelag und Bremskolben.
- Die anderen Kategorien enthalten ebenfalls Vorschläge; eigene Bezeichnungen bleiben möglich, zum Beispiel „Bremsscheibe vorne“.
- Die Fahrradansicht gruppiert die Bauteile nach Kategorie und zeigt ihre Laufleistung.

## Laufleistung richtig erfassen

**Laufleistung = aktueller Fahrrad-Kilometerstand minus Kilometerstand beim Einbau.** Das aktuelle Datum und das Einbaudatum allein liefern keine gefahrenen Kilometer.

Beim Bearbeiten eines Fahrrads für jedes Bauteil das Einbaudatum und die Einbau-km eintragen. Gibt es am gewählten Einbaudatum genau einen eindeutigen Kilometerstand aus Ablesungen oder Serviceeinträgen, kann die App diesen übernehmen. Unterschiedliche Kilometerstände am selben Tag sind nicht eindeutig und müssen manuell geklärt werden. Es wird weder interpoliert noch eine tägliche Fahrleistung angenommen.

Fehlen Einbau-km und eine passende Aufzeichnung, erscheint ein Hinweis. Liegt der aktuelle Kilometerstand unter den Einbau-km, etwa nach einer Tachokorrektur, zeigt die App ebenfalls einen Hinweis statt einer negativen oder erfundenen Laufleistung.

Bestehende Bauteile bleiben erhalten. Bekannte Namen werden automatisch zugeordnet; nicht zuordenbare Einträge stehen unter Zubehör. Kategorie, Einbaudatum und Einbau-km können beim Bearbeiten ergänzt werden. Für die Zukunft werden Änderungen des Fahrrad-Kilometerstands auch im Fahrradformular mit ihrem Erfassungsdatum gespeichert.

## Bestehende MySQL-/MariaDB-Installation aktualisieren

1. MySQL-Daten und `private/data/` sichern und die App während des Updates schließen.
2. Den Inhalt von **`public/`** durch die neue Version ersetzen, einschließlich versteckter Dateien.
3. **Alle mitgelieferten PHP-Dateien in `private/` sowie `private/vendor/` aktualisieren, insbesondere `backend.php`, `biography.php` und `mfa.php`.** Ausnahmen und bestehende private Daten wie im nächsten Schritt erhalten.
4. **`private/config.php`, `private/setup-key.php`, `private/data/` und die bestehende MySQL-Datenbank erhalten.** Die leere Konfiguration aus dem Paket nicht über deine ausgefüllte Datei kopieren.
5. Die Web-App vollständig neu laden, gegebenenfalls schließen und wieder öffnen.

Es ist keine SQL-Schemaänderung und kein erneuter SQL-Import nötig. Die zusätzlichen 2FA-Tabellen werden beim ersten Aufruf automatisch angelegt. Die neuen Bauteilfelder werden in den vorhandenen Fahrraddaten gespeichert. Für eine Erstinstallation gilt INSTALLATION.md.
