# Rechnungsbrücke – Produktkonzept

*Stand: 2026-11-27*

---

## Positionierung

Rechnungsbrücke richtet sich ausschließlich an **Rechnungsaussteller**, die eigene PDF-Rechnungen in das ZUGFeRD-Format überführen müssen. Typische Ausgangslage: Das vorhandene Rechnungsprogramm gibt nur PDF aus; der Empfänger oder eine gesetzliche Anforderung verlangt eine strukturierte E-Rechnung.

Das Tool ist kein Konverter für empfangene Fremdrechnungen und kein Rechnungsarchiv.

**Unterstützte Eingabeformate**

| Format | Einsatz |
| --- | --- |
| PDF (Text) | Hauptformat; direkte Textextraktion |
| PDF (Scan) | OCR-gestützte Erkennung |
| DOCX | Ergänzend; sauberere Strukturerkennung als aus exportiertem PDF |

XLSX wird zunächst nicht unterstützt. Bei Tabellenkalkulationen kann die sichtbare Druckansicht von den Zellwerten abweichen (Druckbereich, Rundungen, ausgeblendete Zeilen). Da die ZUGFeRD-Datei mit der versandten Rechnung übereinstimmen muss, bleibt das PDF als Referenzdokument maßgeblich. XLSX kann in einer späteren Version als Dateneingabehilfe für Positionen dienen – jedoch immer in Kombination mit einem PDF als Referenz.

---

## Mehrmandantenfähigkeit

Ein Konto kann mehrere **Mandanten** verwalten. Ein Mandant steht jeweils für ein Unternehmen oder einen Verein. Daten, Rechnungen und Abrechnungen bleiben strikt voneinander getrennt.

Jeder Mandant hat eigene Stammdaten (Firmenname, Anschrift, Steuernummer, USt-ID), Nutzer und Berechtigungen, Rechnungen und Verarbeitungshistorie sowie Nutzungslimits und Abrechnung.

Die Stammdaten dienen nicht nur der Verwaltung: Die App prüft beim Upload, ob der erkannte Absender im PDF mit dem Mandantenprofil übereinstimmt. Eine Abweichung erscheint als Warnung, bevor die Prüfmaske geöffnet wird.

**Rollen im MVP**

| Rolle | Aufgaben |
| --- | --- |
| Kontoinhaber | Abonnement, Mandanten und Nutzer verwalten |
| Administrator | Stammdaten pflegen, Rechnungen bearbeiten |
| Bearbeiter | Rechnungen hochladen, erkannte Daten korrigieren |
| Prüfer | Rechnungen kontrollieren und zur Erstellung freigeben |

So kann ein Steuerbüro oder eine Verwaltung mehrere Kundenmandanten in einem Konto betreuen.

---

## Ablauf für eine Rechnung

### Variante A – Neuerstellung

Die Rechnung wurde noch nicht versandt oder soll erstmals als E-Rechnung ausgestellt werden.

1. Nutzer wählt Mandanten, wählt „Neue Rechnung" und lädt PDF oder DOCX hoch.
2. Die App erkennt Absender, Empfänger, Rechnungsnummer, Datum, Positionen, Steuern und Summen. Bei Scans kommt OCR zum Einsatz.
3. Erkannter Absender wird gegen Mandantenstammdaten geprüft; Abweichungen erscheinen als Warnung.
4. Die Prüfmaske zeigt das Originaldokument neben den erkannten Angaben. Fehlende oder unsichere Felder sind markiert; Beträge und Steuersummen werden gegengeprüft.
5. Nutzer korrigiert Daten, bestätigt die Vollständigkeit und bestätigt, dass diese Rechnung vom eigenen Mandanten ausgestellt wurde.
6. Die App erstellt die ZUGFeRD-Datei (PDF mit eingebettetem XML), validiert die strukturierten Daten und stellt Datei und Prüfbericht bereit.

### Variante B – Berichtigung

Die Rechnung wurde dem Empfänger bereits als PDF übermittelt. Sie soll nachträglich als ZUGFeRD-Datei ausgestellt oder berichtigt werden.

1. Nutzer wählt „Berichtigung zu versandter Rechnung".
2. Upload wie oben; zusätzlich gibt der Nutzer Nummer und Datum der Originalrechnung an.
3. Die App füllt das ZUGFeRD-Referenzfeld (`PrecedingInvoiceReference`) automatisch aus.
4. Ein Hinweis erklärt, was diese Referenz bedeutet und welche Sorgfalt bei der Berichtigung gilt.
5. Prüfmaske und Freigabe verlaufen wie bei Variante A.

**Wichtig:** Die App setzt die technische Referenz auf das Originaldokument. Ob eine Berichtigung steuerrechtlich korrekt und notwendig ist, liegt beim Aussteller und ggf. beim Steuerberater.

### Allgemeine Regeln

- Keine stillschweigenden Ergänzungen: Fehlende Pflichtangaben oder Abweichungen zwischen PDF und XML erzwingen eine manuelle Korrektur oder Prüfung.
- Komplexe Fälle (Gutschriften, Reverse Charge, innergemeinschaftliche Lieferungen, Dreiecksgeschäfte) werden erkannt, deutlich markiert und mit zusätzlicher Prüfpflicht versehen – nicht stillschweigend durchgelassen.

---

## Funktionsumfang MVP

**Enthalten**

- Mandantenverwaltung mit Stammdatenabgleich bei der Verarbeitung
- Nutzer, Rollen und einfache Freigabe
- PDF-Upload (Text-PDF und Scan mit OCR), DOCX-Upload
- Automatisches Auslesen: Absender, Empfänger, Rechnungsnummer, Datum, Positionen, Steuern, Summen
- Abgleich erkannter Absenderdaten mit Mandantenstammdaten
- Manuelle Prüf- und Korrekturmaske mit markierten Unsicherheiten
- Plausibilitätsprüfung der Summen und Pflichtangaben
- Unterscheidung Neuerstellung / Berichtigung mit Referenzfeld-Handling
- Erkennung und Kennzeichnung komplexer Sonderfälle (Gutschrift, Reverse Charge u. a.)
- Erstellung und technische Validierung einer ZUGFeRD-Datei
- Download der Datei und eines Prüfberichts
- Verarbeitungshistorie mit Bearbeiter und Freigabezeitpunkt
- Automatische Löschung nach konfigurierbarer Frist

**ZUGFeRD-Profil:** Das MVP erstellt standardmäßig EN 16931 (Comfort). Dieses Profil erfüllt die gesetzliche Anforderung und ist im deutschen B2B-Bereich am weitesten verbreitet. Eine Profilauswahl ist für spätere Versionen vorgesehen.

**Validierung:** Die technische Prüfung erfolgt auf Basis der offiziellen CEN-Schemaregeln und einem anerkannten Validator (z. B. Mustang). Der Prüfbericht nennt bestandene und nicht bestandene Regeln.

**Nicht im MVP (später ausbaubar)**

- Stapelverarbeitung und CSV-Import
- API und Übergabe an Buchhaltungsprogramme
- XRechnung-Ausgabe
- Vier-Augen-Prinzip mit Teamfreigaben
- Rechnungsausgangsbuch und revisionssichere Archivierung (GoBD)
- XLSX-Unterstützung als Dateneingabehilfe
- Zentraler Steuerbürobereich mit Mandantenübersicht

---

## Free-Version

Die kostenlose Version ermöglicht einen echten Test ohne künstliche Einschränkungen am Ergebnis.

- 1 Mandant, 1 Nutzer
- Bis zu 3 Rechnungen pro Monat
- Einzelne PDF- und DOCX-Uploads
- Erkennung, Prüfmaske und manuelle Korrektur
- ZUGFeRD-Datei **ohne Wasserzeichen**
- Basisvalidierung mit Prüfbericht
- Automatische Löschung nach 7 Tagen
- Kein Stapelbetrieb, keine API, keine Teamfreigabe

Ein Wasserzeichen würde den eigentlichen Zweck des Produkts untergraben: Die fertige Rechnung muss in jedem Tarif uneingeschränkt nutzbar sein.

---

## Preismodell

Alle Preise inkl. USt. Bei der Monatspauschale wird bei Erreichen des Limits gestoppt; keine automatischen Zusatzkosten.

| Option | Preis | Enthalten |
| --- | --- | --- |
| **Einzelrechnung** | 1,49 € je Rechnung | Einmalige Nutzung; Abrechnung nur bei erfolgreicher Erstellung |
| **Monatspauschale** | 14,90 € / Monat | Bis zu 100 Rechnungen, 5 Mandanten, 3 Nutzer je Mandant |

Wer gelegentlich konvertiert, zahlt pro Rechnung. Regelmäßige Nutzer wechseln zur Pauschale. Vergleichbare Dienste am Markt liegen derzeit bei ca. 0,49 € bis 3,99 € pro Rechnung. Der Preis pro Einzelrechnung sollte im Produkt dauerhaft sichtbar bleiben, um die Schwelle zur Pauschale klar zu zeigen.

---

## Produktversprechen und Grenzen

Rechnungsbrücke macht aus einem PDF keine inhaltlich richtige Rechnung. Das Tool hilft beim strukturierten Auslesen, Prüfen und technisch korrekten Erstellen einer ZUGFeRD-Datei. Die freigebende Person muss kontrollieren, ob alle Angaben stimmen und ob die Rechnung korrekt ausgestellt wird.

**Was das Produkt ist:**
- Eine Konvertierungs- und Validierungslösung für eigene Ausgangsrechnungen
- Eine technische Brücke zwischen einem bestehenden PDF-Rechnungsprozess und der E-Rechnungspflicht

**Was das Produkt nicht ist:**
- Kein Konverter für empfangene Fremdrechnungen
- Kein GoBD-konformes Rechnungsarchiv
- Kein Ersatz für ein Rechnungsprogramm
- Keine steuerrechtliche Beratung

**Besonders bei Berichtigungen:** Die App setzt die technische Referenz auf das Originaldokument (`PrecedingInvoiceReference`). Ob eine Berichtigung steuerrechtlich korrekt und notwendig ist, liegt beim Aussteller und ggf. beim Steuerberater. BMF-Informationen beschreiben die nachträgliche Berichtigung durch eine E-Rechnung als möglichen Weg; die rechtlichen Anforderungen daran muss der Aussteller prüfen.

---

## Datenschutz und Compliance

Rechnungen enthalten personenbezogene und geschäftliche Daten. Folgende Anforderungen gelten ab dem ersten produktiven Einsatz.

| Anforderung | Detail |
| --- | --- |
| Auftragsverarbeitung | AV-Vertrag nach Art. 28 DSGVO zwischen Anbieter und Nutzer erforderlich |
| Datenspeicherung | Hochgeladene Dokumente und erzeugte Dateien werden nur so lange gespeichert, wie für die Verarbeitung nötig |
| Löschfristen | Free: 7 Tage. Paid: konfigurierbar, Standard 30 Tage. Danach automatisch |
| Serverstandort | Verarbeitung und Speicherung in der EU oder im EWR |
| Archivierungsverantwortung | Nutzer sind für die gesetzeskonforme Aufbewahrung der fertigen E-Rechnungen selbst verantwortlich |

**Abgrenzung GoBD:** Das Produkt ist keine revisionssichere Archivierungslösung. Eine Download-Historie ersetzt kein Rechnungsausgangsbuch. Dieser Unterschied muss in der Produktkommunikation klar sein, damit keine falschen Erwartungen entstehen.
