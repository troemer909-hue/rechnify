# Rechnify

**PDF hochladen, ZUGFeRD-Rechnung erhalten.**

Rechnify (Arbeitstitel: Rechnungsbrücke) ist ein Web-Tool, das eigene PDF-Rechnungen in validierte ZUGFeRD-E-Rechnungen überführt. Es richtet sich an Unternehmen und Vereine, deren bisheriges Rechnungsprogramm nur PDF-Ausgabe unterstützt.

## Produktkonzept

→ [docs/konzept.md](docs/konzept.md)

## Kernfunktionen

- PDF/DOCX hochladen, Rechnungsdaten automatisch erkennen (inkl. OCR für Scans)
- Erkannte Daten in einer Prüfmaske kontrollieren und korrigieren
- ZUGFeRD-Datei (EN 16931) mit eingebettetem XML erstellen und validieren
- Berichtigungsworkflow für bereits versandte Rechnungen
- Mehrmandantenfähig mit Rollen und Freigabe

## Tarife

| Tarif | Preis |
| --- | --- |
| Free | 3 Rechnungen/Monat kostenlos |
| Einzelrechnung | 1,49 € je Rechnung |
| Monatspauschale | 14,90 € / Monat (bis zu 100 Rechnungen) |

## Status

Konzeptphase – MVP in Entwicklung.

## Verarbeitung starten

Die Hintergrundjobs laufen in einem separaten Prozess. Neben dem Webserver muss
ein Worker mit denselben Datenbank- und S3-Umgebungsvariablen laufen:

```sh
pnpm worker
```

Das Docker-Image enthält Ghostscript, ImageMagick und die deutsche Tesseract-
Sprachdatei für die OCR-Verarbeitung. Zum Starten des Workers kann beim
Containerstart der Standardbefehl überschrieben werden:

```sh
docker run --env-file .env rechnify worker
```
