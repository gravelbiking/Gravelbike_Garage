function settingsRow(title,detail,action,label){
 return `<div class="list-row"><div class="row-copy"><strong>${title}</strong><small>${detail}</small></div><button class="secondary" data-action="${action}">${label}</button></div>`;
}

function configurationPage(){
 const theme=data.preferences.theme||'wald';
 const choices=[['wald','Waldgrün'],['meer','Meeresblau'],['stein','Schiefergrau']];
 const reminders=data.preferences.notifications!==false&&window.Notification?.permission==='granted';
 return heading('Konfiguration','Passe deine Garage an und verbinde Strava.')+`<div class="panel settings-list">
 <div class="list-row"><div class="row-copy"><strong>Farbschema</strong><small>Wähle die Akzentfarbe und den Hintergrund der App.</small></div>
 ${select('garage-theme','Farbschema',choices,theme)}</div>
 ${settingsRow('Browser-Erinnerungen','Service-Hinweise erscheinen, solange die App geöffnet ist. Die Freigabe erfolgt pro Browser.',reminders?'notifications-off':'notifications',reminders?'Deaktivieren':'Aktivieren')}
 ${settingsRow('Erinnerungen im Kalender','Datumsbasierte Services als Kalenderdatei mit Erinnerung einen Tag vorher.','calendar','Exportieren')}
 </div>`+'<a class="panel list-row" href="#strava">Strava Integration öffnen ↗</a>';
}

function usersPage(){
 return heading('User Access Management','Verwalte Passwort, Gültigkeit und deine 2FA-Geräte.')+`<div class="panel settings-list">
 ${settingsRow('Dein Zugang','Angemeldet als '+esc(username)+'.','logout','Abmelden')}
 <div id="passwordValidity" class="notice" aria-live="polite">Passwortgültigkeit wird geladen …</div>
 ${settingsRow('Passwort','Nach einer Änderung meldest du dich mit dem neuen Passwort an.','password-change','Passwort ändern')}
 ${settingsRow('Zwei-Faktor-Anmeldung <span id="mfaStatusBadge" class="muted"></span>','Verwalte Passkeys, YubiKeys, Authenticator-App und Wiederherstellungscodes.','security-wizard','2FA verwalten')}
 </div>`;
}

const passwordRules='Mindestens 15 Zeichen; mindestens drei Gruppen aus Großbuchstaben, Kleinbuchstaben, Zahlen und Sonderzeichen. Höchstens 72 UTF-8-Bytes. Die letzten drei Passwörter sind ausgeschlossen. Gültigkeit: ein Jahr.';
function passwordFields(){return `<div class="form-grid">
 ${input('current','Aktuelles Passwort','','password','required autocomplete="current-password" maxlength="72"')}
 ${input('next','Neues Passwort','','password','required autocomplete="new-password" minlength="15" maxlength="72"')}
 ${input('confirmation','Neues Passwort wiederholen','','password','required autocomplete="new-password" minlength="15" maxlength="72"')}
 </div><p class="help">${passwordRules}</p>`;}
async function savePassword(f){
 if(f.get('next')!==f.get('confirmation'))throw Error('Die neuen Passwörter stimmen nicht überein.');
 await api('account/password',{method:'POST',body:JSON.stringify({current:f.get('current'),next:f.get('next'),confirmation:f.get('confirmation')})});
}
function changePassword(){
 modal('Passwort ändern',passwordFields(),async f=>{await savePassword(f);closeModal();await showAuth();toast('Passwort geändert. Melde dich mit dem neuen Passwort an.');});
}
function showRequiredPasswordChange(status){
 $('#app').hidden=true;$('#auth').hidden=false;$('#authForm').hidden=true;$('#mfaLogin')?.remove();$('#requiredPasswordForm')?.remove();
 $('#authText').textContent=status.reason==='expired'?'Dein Passwort ist abgelaufen. Lege ein neues Passwort fest, um deine Garage zu öffnen.':'Lege jetzt dein eigenes Passwort fest. Dein bisheriges Passwort ist vorläufig oder erfüllt noch nicht die neue Richtlinie.';
 $('#authForm').insertAdjacentHTML('afterend',`<form id="requiredPasswordForm"><h2>Passwortwechsel erforderlich</h2>${passwordFields()}<p class="form-error" role="alert" id="requiredPasswordError"></p><button class="primary full" type="submit">Eigenes Passwort speichern</button><button type="button" class="small-button" data-action="logout">Abmelden</button></form>`);
 $('#requiredPasswordForm').onsubmit=async e=>{
  e.preventDefault();const button=e.target.querySelector('[type=submit]');button.disabled=true;$('#requiredPasswordError').textContent='';
  try{await savePassword(new FormData(e.target));e.target.reset();await showAuth();toast('Passwort gespeichert. Melde dich erneut an.');}
  catch(error){const panel=$('#requiredPasswordError');if(panel)panel.textContent=error.message;}
  finally{button.disabled=false;}
 };
}
function passwordExpiryNotice(){
 if(!passwordStatus||passwordStatus.daysRemaining===null||passwordStatus.daysRemaining>30)return '<div id="passwordExpiryNotice"></div>';
 return `<div id="passwordExpiryNotice" class="password-expiry" role="alert">Dein Passwort läuft in ${Number(passwordStatus.daysRemaining)} Tagen ab. <a href="#users">Jetzt im User Access Management ändern</a>.</div>`;
}
async function refreshPasswordStatus(){
 const panel=$('#passwordValidity');garageRuntime.loading(panel,'Passwortstatus wird geladen …');
 try{
  const state=await api('account/status');passwordStatus=state;
  if(state.required){await showAuth();return;}
  const warning=$('#passwordExpiryNotice');if(warning)warning.outerHTML=passwordExpiryNotice();
  if(!panel?.isConnected)return;
  const stamp=v=>v?new Date(v*1000).toLocaleDateString('de-DE'):'Unbekannt';
  panel.removeAttribute('aria-busy');panel.textContent=`Passwort zuletzt geändert: ${stamp(state.changedAt)} · Passwort gültig bis: ${stamp(state.expiresAt)} · Verbleibend bis zur Passwortänderung: ${state.daysRemaining??'–'} Tage`;
 }catch(error){garageRuntime.log(error,'password-status');if(panel?.isConnected)garageRuntime.failure(error,refreshPasswordStatus,panel);else garageRuntime.failure(error,refreshPasswordStatus);}
}

async function configureNotifications(enabled){
 if(enabled){
  if(!('Notification'in window)){toast('Dieser Browser unterstützt keine Benachrichtigungen.');return;}
  const permission=await Notification.requestPermission();
  if(permission!=='granted'){toast('Erlaube Benachrichtigungen in den Browser-Einstellungen.');return;}
  notifShown.clear();
 }
 if(await mutate(()=>{data.preferences.notifications=enabled;}))toast(enabled?'Browser-Erinnerungen aktiviert.':'Browser-Erinnerungen deaktiviert.');
}

function systemPage(){
 return heading('System','Technische Angaben zur laufenden Installation.')+'<div id="systemStatus" class="panel settings-list" aria-live="polite"><div class="list-row">Systemdaten werden geladen …</div></div>';
}

function storageSize(bytes){
 return bytes===null?'Unbekannt':`${number(bytes/1048576)} MiB`;
}

async function refreshSystemStatus(){
 const panel=$('#systemStatus');if(!panel)return;garageRuntime.loading(panel,'Systemdaten werden geladen …');
 try{
  const s=await api('system');
  if(!panel.isConnected)return;
  const total=s.storage.database===null?null:s.storage.files+s.storage.database;
  const rows=[
   ['Installierte App',[s.release.version,s.release.name].filter(Boolean).join(' · ')],['App-URL',s.url],['Installationspfad',s.path],
   ['PHP-Version',s.php],['Datenbank',s.database.name],['Datenbankversion',s.database.version],
   ['Speicherbedarf gesamt',storageSize(total)],['App-Dateien und Ablage',storageSize(s.storage.files)],
   ['Datenbanktabellen und Indizes (ca.)',storageSize(s.storage.database)]
  ];
  panel.removeAttribute('aria-busy');panel.innerHTML=`<dl class="system-facts">${rows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl><p class="help">Dateigrößen der Garage einschließlich vorhandener Release-Verzeichnisse und Sicherungen im verwalteten Hosting-Layout. Datenbankgröße laut Tabellenstatistik.</p>`;
 }catch(error){
  garageRuntime.failure(error,refreshSystemStatus,panel);
 }
}

function updatesPage(){
 return infoPage('update');
}

// Replaced from package.json by the local/self-host build.
const garageRelease=/*APP_RELEASE*/{};
const infoTabs=[['info','Info'],['releases','Releasenotes'],['manual','Handbuch'],['update','Update']];

function infoPage(requested='info'){
 const active=infoTabs.some(([id])=>id===requested)?requested:'info';
 const contents={info:()=>`<div class="panel info-content"><h2>Gravelbike Garage</h2><dl class="system-facts"><div><dt>Version</dt><dd>${esc(garageRelease.version)}</dd></div><div><dt>Codename</dt><dd>${esc(garageRelease.name)}</dd></div></dl><p>Deine Fahrräder, Ausstattung, Wartungen und Werkstattunterlagen an einem Ort.</p><p><a href="#info/manual">Zum Nutzungshandbuch →</a></p></div>`,releases:releaseNotes,manual:garageManual,update:()=>`<div class="panel settings-list">${updatePanel()}</div>`};
 return heading('Info','Informationen, Hilfe und Updates für deine Garage.')+
  `<div class="component-tabs info-tabs" role="tablist" aria-label="Informationen zur App">${infoTabs.map(([id,label])=>`<a role="tab" id="info-tab-${id}" href="#info/${id}" aria-selected="${active===id}" aria-controls="info-panel" tabindex="${active===id?0:-1}">${label}</a>`).join('')}</div><section id="info-panel" class="info-panel" role="tabpanel" aria-labelledby="info-tab-${active}" tabindex="0">${contents[active]()}</section>`;
}

const garageReleaseNotes=[
 ['1.2.5','Horchen und sehen',['Werkstatt: Ersatzteile ohne Einlagerung beschaffen oder als Lagerartikel anlegen.','Kompakte Ersatzteilauswahl mit Kategorie, Suche, Hersteller, Teileart, Bestandsfilter und Seiten.','Bauteilwechsel beim Abschluss bestätigen: Zuordnung aus dem Arbeitsschritt, aktueller Fahrradstand und Lebenslauf.','Auffälliger Startseiten-Button auf allen Unterseiten und aktuelle Laufleistung bei kilometerabhängigen Serviceintervallen.','Zentrale strukturierte Fehlerprotokolle für Module, interne/externe APIs und Hintergrunddienste.','Vorgangs-IDs verbinden Browser-, Server- und Strava-Fehler; OAuth-Start, Rückkehr und abgelaufene Versuche werden protokolliert.','Admin-Logansicht mit Instanz-, Modul-, Quellen-, Schweregrad- und Zeitfilter, Suche, Seitennavigation und TXT-Export.','Private Logablage mit Maskierung von Geheimnissen, Rotation und Größenbegrenzung.']],
 ['1.2.4','STRAVA bugfixing',['Zwei vollständig unabhängige Strava-Verbindungen mit eigener Client-ID und eigenem Client-Secret.','Kilometeranzeigen und Formularwerte mit maximal einer Nachkommastelle; präzise Strava-Importdaten bleiben intern erhalten.','Werkstatt-Assistent zählt einzelne Tätigkeiten über deren Unterseiten hinweg; Anlage nur für vorhandene Fahrräder und direkte Lagerartikelanlage aus verbauten Bauteilen ohne Bestand.','Serviceintervalle schrittweise mit Zusammenfassung anlegen.','Serviceplan direkt nach Fahrrad und Fälligkeit filtern; Werkstattauftrag für genau die nächste Fälligkeit planen.','Werkstattaufträge per Assistent mit kategoriebasierter Ersatzteilsuche, Lagerartikelanlage ohne Bestand, Einkaufsentscheidung und geplantem Datum erstellen.','Künftige Serviceintervalle und abgeschlossene Werkstattaufträge im Fahrrad-Lebenslauf getrennt anzeigen.']],
 ['1.2.3','Hamster',[
  'Fahrradtypen direkt per Dropdown auswählen, eigene Typen speichern und Cyclocross nutzen. Baujahr und Modelljahr getrennt erfassen; vorhandene Baujahr-Daten bleiben verfügbar.',
  'Kompakte Radcomputer-Steckbriefe und Geräteübersichten mit Hersteller, Modell, Seriennummer und Foto.',
  'Lagerartikel ohne Anfangsbestand anlegen. Bestände, Lagerorte und Einkaufsbelege separat erfassen; leere Positionen ausblenden, ohne ihre Historie zu verlieren.',
  'Jedem Arbeitsschritt eigene Ersatzteile zuordnen. Beim Auftragsabschluss neue Bauteile mit Einbaudatum und Kilometerstand am Fahrrad speichern; den Austausch im Lebenslauf nachweisen.',
  'Reifen nach dem Ausbau wieder einlagern und erneut verwenden, mit erhaltener Nutzungshistorie.',
  'Zwei unabhängige Strava-Konten verbinden und deren Fahrräder getrennt zuordnen. Den aktuellen Kilometerstand im Serviceplan sehen.',
  'Nach dem Speichern die bisherige Scrollposition und geöffnete Abschnitte wiederherstellen. Klarere Anzeige der Passwortgültigkeit.',
  'Über „Neues in dieser Version!“ oben auf dem Dashboard die Neuerungen der installierten Version öffnen.'
 ]],
 ['1.2.2.b','Clean Hamster',['Zwei unabhängige Strava-Konten mit getrennten Fahrradzuordnungen und Importen.']],
 ['1.2.2.a','Clean Hamster',['Neue Werkstattaufträge starten mit Arbeitsschritt 1 und sichtbarer Ersatzteilauswahl.','Ersatzteile stehen vor der Werkstattanleitung. Die Schritte werden fortlaufend nummeriert.']],
 ['1.2.2','Clean Hamster',['Kompakter Startbildschirm mit Links zu Fahrrädern, Lager, Serviceplan und Dokumenten.','Erweiterte Anbauteildaten und Werkstattaufträge mit Arbeitsschritten, Ersatzteilen und Lagerbuchungen.']],
 ['1.2.1.b','Secure Hamster',['Dashboard-Einkaufsartikel zeigen den Hersteller zuerst und öffnen verknüpfte Lagerartikel direkt.','Selbst gewählte Passwörter der Ersteinrichtung bleiben bei der ersten Anmeldung gültig.']],
 ['1.2.1','Secure Hamster',['Pflichtwechsel vorläufiger Passwörter, Jahresgültigkeit und Historie der letzten drei Passwörter.','User Access Management, Ablaufwarnung und zehn Minuten Kontosperre nach zehn Fehlversuchen.']],
 ['1.2.0','Nice Hamster',['Info mit vier Tabs, Nutzungshandbuch und Updatefunktion.','Dauerhafte Werkstattanzeige und feste mobile Navigation.']],
 ['1.1.1.m','Hamster',['Strava-API-Einrichtung mit Anleitung direkt unter Konfiguration.','Erneute Zugangsbestätigung vor dem Speichern von Strava-Zugangsdaten.']],
 ['1.1.1.l','Hamster',['Strava-Verbindung verwendet den Cookie-Namen der jeweiligen Installation.']],
 ['1.1.1.k','Hamster',['Strava-Konto verbinden, Fahrräder zuordnen und gefahrene Kilometer synchronisieren.']],
 ['1.1.1.g','Hamster',['Werkstattaufträge für eigene und fremde Fahrräder als Service oder Reparatur.','Neue Symbole für Werkstattaufträge, Servicebuch, Radcomputer und Fahrradarchiv.']],
 ['1.1.1.f','Hamster',['Auftragsbeschreibung im Werkstattauftrag über den Ersatzteilen.']],
 ['1.1.1.e','Hamster',['Ersatzteile einzeln als vorhanden markieren.','Anleitungen direkt im Werkstattauftrag öffnen und Schritte als erledigt markieren.']],
 ['1.1.1.d','Hamster',['Reparaturen für eigene und fremde Räder in Werkstattaufträgen zusammengefasst.','Anleitungen über eine durchsuchbare Auswahl zu Arbeitsschritten hinzufügen.']],
 ['1.1.1.c','Hamster',['Dokumentvorschau mit Schließen-Button und Rückkehr zur App.','Größere Versionsanzeige.']],
 ['1.1.1.b','Hamster',['Dokumente verknüpfen und ihre Zuordnungen finden.','Werkstattaufträge und Anleitungen für Service und Reparatur.']],
 ['1.1.1.a','Sauberer Hamster',['Überarbeitete Modulnavigation, Fahrradparkplatz und Archiv.','Zentrale Dokumentverwaltung und Dokumentverknüpfungen.']],
 ['1.1.1','Schicker Hamster',['Gefahrene Kilometer mit Datum auf der Startseite erfassen.','Lagersuche und kompakte Bestandsliste.','Vorbereiteter Update-Assistent.']],
 ['1.1.0','Hamster',['Lagerartikel mit einzelnen Positionen, Bewegungen und Inventurwerten.','Werkzeug, Radcomputer, Reifen und erweiterte Fahrradsteckbriefe.','Mehrere Kontaktrollen und Links für Accounts und Termine.']],
 ['1.0.0','',['Fahrradverwaltung mit Bauteilen, Kilometerständen, Wartungsintervallen und Servicebuch.','Dokumente, Lebensläufe, Adressbuch und optionale Zwei-Faktor-Anmeldung.']]
];

function releaseNotes(currentOnly=false){
 const current=garageReleaseNotes.find(([version])=>version===garageRelease.version);
 const releases=[[garageRelease.version,garageRelease.name,current?.[2]||['Für diese Version sind noch keine Neuerungen hinterlegt.']],...(currentOnly?[]:garageReleaseNotes.filter(([version])=>version!==garageRelease.version))];
 return `<div class="release-notes">${releases.map(([version,name,notes],i)=>`<article class="panel info-content"><h2>${esc(version)}${name?' · '+esc(name):''}</h2>${i===0&&garageRelease.development?'<p class="help">Aktueller Entwicklungsstand · noch nicht veröffentlicht</p>':''}<ul>${notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul></article>`).join('')}</div>`;
}
function whatsNewNotice(){return `<div class="whats-new"><button type="button" class="secondary" data-whats-new>Neues in dieser Version!</button><span>${esc(garageRelease.version)} · ${esc(garageRelease.name)}</span></div>`;}
function showWhatsNew(trigger){
 const dialog=document.createElement('dialog');dialog.className='whats-new-dialog';
 dialog.setAttribute('aria-label','Neues in dieser Version!');
 dialog.innerHTML=`<h2>Neues in dieser Version!</h2>${releaseNotes(true)}<button type="button" class="primary" data-close-whats-new>Schließen</button>`;
 document.body.append(dialog);dialog.querySelector('[data-close-whats-new]').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{dialog.remove();if(trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});dialog.showModal();
}
document.addEventListener('click',event=>{const trigger=event.target.closest?.('[data-whats-new]');if(trigger)showWhatsNew(trigger);});

const manualSections=[
 ['quickstart','Schnellstart: Dein erstes Fahrrad',`<ol>
 <li>Öffne <a href="#parking">Meine Fahrräder → Fahrradparkplatz</a> und wähle <strong>Fahrrad hinzufügen</strong>.</li>
 <li>Erfasse Name, Fahrradtyp, Hersteller, Modell und den aktuellen Kilometerstand. Ergänze Seriennummer, Modelljahr, Rahmenfarbe, Rahmenmaterial, Gewicht und Kaufdaten soweit bekannt.</li>
 <li>Wähle unter <strong>Fahrradfoto</strong> ein Bild aus. Ergänze unter <strong>Ausstattung & Anbauteile</strong> die verbauten Bauteile mit Hersteller, Modell und Einbaudaten. Mit <strong>Bauteil speichern</strong> sicherst du einen Zwischenstand; mit <strong>Fahrrad speichern</strong> das Formular.</li>
 <li>Öffne den Fahrradsteckbrief und wähle im <strong>Serviceplan</strong> <strong>Intervall anlegen</strong>. Trage die nächste Fälligkeit und ein Zeit- oder Kilometerintervall ein.</li>
 <li>Lege unter <strong>Verträge & Dokumente → Dokument hinzufügen</strong> Kaufvertrag, Rechnungen oder Leasingunterlagen ab.</li>
 </ol>`],
 ['bikes','Fahrräder und Bauteile',`<p>Im <a href="#parking">Fahrradparkplatz</a> öffnest du den Steckbrief eines Fahrrads. <strong>Bearbeiten</strong> ändert seine Daten. Bei einem Jobrad lassen sich Leasingrate, Versicherung und eine spätere Übernahme hinterlegen.</p><p>Unter <strong>Ausstattung & Konfiguration</strong> wählst du einen Kategorie-Tab, zum Beispiel Antrieb oder Bremsen. Jedes Bauteil hat eigene Schaltflächen zum Bearbeiten und Löschen mit Sicherheitsabfrage. Für die Laufleistung benötigst du die Kilometer beim Einbau; aus einem Datum allein lassen sich keine gefahrenen Kilometer berechnen.</p><p><strong>Archivieren</strong> verschiebt das Rad ins <a href="#archive">Fahrradarchiv</a>. Seine Daten bleiben erhalten und es kann wieder aktiviert werden.</p>`],
 ['mileage','Kilometerstände und Strava',`<p>Auf der <a href="#dashboard">Startseite</a> wählst du <strong>Gefahrene Kilometer</strong>, anschließend Fahrrad, Strecke und Datum. Die Strecke wird zum bisherigen Stand addiert. <strong>Kilometerstand</strong> im Fahrradsteckbrief dient zur Eingabe eines Gesamtstands. Prüfe das Datum für einen nachvollziehbaren Lebenslauf.</p><p>Unter <a href="#configuration">Verwaltung → Konfiguration</a> öffnest du den Bereich Strava Integration, verbindest bis zu zwei Strava-Konten und ordnest deren Fahrräder zu. Die serverseitige Synchronisierung muss eingerichtet sein. Prüfe nach dem Abgleich den Kilometerstand und vermeide eine zusätzliche manuelle Buchung derselben Fahrt.</p>`],
 ['service','Serviceplan und Servicebuch',`<p>Im <a href="#service">Serviceplan</a> legst du mit <strong>Intervall anlegen</strong> Wartungen an. Ein Service ist fällig, sobald Datum oder Kilometergrenze erreicht sind. Die Vorwarnung beginnt 30 Tage oder 200 km vorher. Halte die Kilometerstände aktuell.</p><p><strong>Material planen</strong> öffnet den Einkauf; <strong>Auftrag starten</strong> führt zum Werkstattauftrag. Mit <strong>Erledigen</strong> dokumentierst du Datum, Kilometer, Arbeiten und tatsächlich verbrauchtes Material. Bestätige jede Entnahme einzeln. Das <a href="#history">Servicebuch</a> zeigt die erledigten Wartungen nach Fahrrädern getrennt.</p>`],
 ['orders','Werkstattaufträge und Anleitungen',`<p>Unter <a href="#orders">Werkstatt → Werkstattaufträge</a> kannst du Arbeiten für eigene oder fremde Fahrräder planen. Beschreibe ein fremdes Fahrrad, ohne es im Fahrradparkplatz anlegen zu müssen. Erfasse Auftragsbeschreibung und Ersatzteile; bestätige vorhandene Teile über ihr Häkchen.</p><p>Im Abschnitt <strong>Anleitungen</strong> fügst du über das Plus weitere Schritte hinzu und wählst die passende Anleitung über die Suche. Verknüpfte Dokumente lassen sich direkt öffnen und wieder schließen. Hake erledigte Schritte ab. Beim Anlegen eines Auftrags für ein eigenes Fahrrad kannst du Kategorien und verbaute Teile zum Austausch vorsehen. „Ohne Kategorie“ zeigt alle Bauteile. Mit <strong>Auftrag abschließen</strong> bestätigst du tatsächlich ausgebaute Teile und den Kilometerstand. Ihre Laufleistung wird eingefroren; das <strong>Teilearchiv</strong> ist im Fahrrad-Lebenslauf am jeweiligen Bauteil aufrufbar. In <a href="#guides">Werkstatt → Anleitungen</a> verwaltest du die Werkstattunterlagen.</p>`],
 ['stock','Lager und Einkauf',`<p>Unter <a href="#inventory">Lager</a> suchst du nach Artikeln und siehst Bestand und Lagerort. Lege einen Artikel mit Kategorie, Einheit, Mindestbestand und optionalem Bild an. Zu einem Artikel gehören einzelne Lagerpositionen mit Mengen, Preisen, Kaufdatum und Lagerort.</p><p>Buche Zugänge und Entnahmen an der jeweiligen Position. Auch leere Positionen und Bewegungen bleiben nachvollziehbar. Für einen Service bestätigst du nur tatsächlich verbrauchte Mengen. Der Inventurbericht zeigt Bestände und Werte.</p><p>In der Einkaufsliste im <a href="#service">Serviceplan</a> wählst du Lagerbestand, Onlinekauf oder Händler vor Ort. Ergänze Shop-Link beziehungsweise Händler und lade Rechnungen hoch. Markiere Käufe und buche sie bei Bedarf ins Lager. Die Startseite weist auf niedrige Bestände und offene Einkäufe hin; der idealo-Link öffnet eine externe Suche.</p>`],
 ['documents','Dokumente und Fahrrad-Lebensläufe',`<p>Unter <a href="#documents">Dokumente</a> kannst du Dateien hinzufügen, suchen und zuordnen. Bestehende Dokumente lassen sich mit Fahrrädern, Services, Lager oder Anleitungen verknüpfen. Unterstützt werden PDF, JPG, PNG, WebP und HEIC bis 20 MB pro Datei. Schließe eine geöffnete Vorschau mit <strong>Schließen</strong>, um zur vorherigen Ansicht zurückzukehren.</p><p>Im Fahrradsteckbrief erzeugst du einen <strong>Verkaufs-Lebenslauf</strong> oder <strong>Werkstatt-Lebenslauf</strong>. Beide enthalten Rad, aktuelle Bauteile und Wartungshistorie. Der Verkaufs-Lebenslauf verweist auf externe Services und zugehörige Anlagen. Der Werkstatt-Lebenslauf enthält keine Händler- oder Werkstattnamen und keine Dokumentanhänge. Prüfe den Inhalt vor der Weitergabe.</p>`],
 ['contacts','Adressbuch und Werkstatttermine',`<p>Im <a href="#contacts">Adressbuch</a> wählst du <strong>Kontakt anlegen</strong>. Ein Kontakt kann mehrere Rollen haben: Händler, Werkstatt und Lieferant (online). Ergänze Adresse, Ansprechpartner, Kundennummer, Telefon, E-Mail sowie Links zur Online-Terminvergabe und zum persönlichen Account. Hier lassen sich auch Rechnungen, Lieferscheine und weitere Belege ablegen.</p><p>Mit <strong>Termin vereinbaren</strong> ordnest du Fahrrad, Arbeit, Datum und Uhrzeit zu. Termine erscheinen auch im Servicebereich und können in den Kalender exportiert werden. Nach der Durchführung dokumentierst du die Wartung im Servicebuch.</p>`],
 ['equipment','Werkzeug und Radcomputer',`<p>Unter <a href="#tools">Werkstatt → Werkzeug</a> legst du mit <strong>Werkzeug anlegen</strong> Bezeichnung, Hersteller, Modell und Ausführung an. Bereits gespeicherte Bauteilzuordnungen bleiben erhalten; die Werkzeugauswahl im Bauteilformular entfällt.</p><p>Unter <a href="#computers">Meine Fahrräder → Radcomputer</a> wählst du <strong>Radcomputer anlegen</strong>. Hersteller, Modell, Seriennummer und Firmware haben je 25 Zeichen, Infos 100 Zeichen. Ein Foto kann hochgeladen oder mit der Kamera aufgenommen werden. Über <strong>Steckbrief öffnen</strong> kannst du ein Gerät bearbeiten.</p>`],
 ['settings','Einstellungen, Anmeldung und Sicherung',`<p>Unter <a href="#configuration">Verwaltung → Konfiguration</a> wählst du das Farbschema und aktivierst Browser-Erinnerungen. Diese benötigen deine Browserfreigabe und eine geöffnete App. Kalenderexporte ergänzen die Erinnerung außerhalb der App.</p><p>Unter <a href="#users">Userverwaltung → User Access Management</a> siehst du die Passwortgültigkeit und änderst dein Passwort und richtest über <strong>2FA verwalten</strong> optional Passkeys, YubiKeys oder eine Authenticator-App ein. Bewahre Wiederherstellungscodes sicher außerhalb der App auf. Passwörter benötigen mindestens 15 Zeichen und drei Zeichengruppen. Sie gelten ein Jahr; die letzten drei dürfen nicht erneut verwendet werden. Ab 30 Tagen vor Ablauf erscheint eine rote Warnung auf der Startseite. Ein vorläufiges oder abgelaufenes Passwort muss zuerst geändert werden. Nach zehn Fehlversuchen wird das Konto zehn Minuten gesperrt. Nach einer Passwortänderung meldest du dich erneut an.</p><p>Unter <a href="#system">System</a> stehen Angaben zur Installation. Der Name oben zeigt dir, in welcher Werkstattumgebung du arbeitest. <a href="#backup">Datensicherung</a> exportiert Garagendaten als JSON; sichere Dokumentdateien zusätzlich. Unter <a href="#info/update">Info → Update</a> siehst du den Update-Status. Ein Update startet erst durch deine Betätigung und Bestätigung. Ohne eingerichteten Update-Dienst ist kein Update möglich.</p>`]
];

function garageManual(){
 return `<article class="panel info-content manual"><h2>Nutzungshandbuch</h2><p class="help">Für ${esc(garageRelease.version)} · ${esc(garageRelease.name)}</p><nav class="manual-index" aria-label="Handbuch-Inhalt">${manualSections.map(([id,title])=>`<a href="#info/manual/${id}">${title}</a>`).join('')}</nav>${manualSections.map(([id,title,body])=>`<section id="manual-${id}"><h3>${title}</h3>${body}</section>`).join('')}</article>`;
}

document.addEventListener('keydown',event=>{
 const tab=event.target.closest?.('.info-tabs [role="tab"]');
 if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 event.preventDefault();
 const index=infoTabs.findIndex(([id])=>'info-tab-'+id===tab.id);
 const next=event.key==='Home'?0:event.key==='End'?infoTabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+infoTabs.length)%infoTabs.length;
 location.hash='info/'+infoTabs[next][0];
});

function backupPage(){
 return heading('Datensicherung','Exportiere deine Garagendaten.')+`<div class="panel settings-list">
 ${settingsRow('Garagendaten exportieren','Fahrräder, Ausstattung und Service als JSON. Lade die Dokumentdateien zusätzlich über „Öffnen“ herunter.','export','JSON exportieren')}
 </div>`;
}

document.addEventListener('change',async e=>{
 if(e.target.name!=='garage-theme')return;
 const theme=e.target.value;
 if(!await mutate(()=>{data.preferences.theme=theme;}))e.target.value=data.preferences.theme||'wald';
});
