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

## Betrieb mit ZUGFeRD-Validierung

Das mitgelieferte Dockerfile installiert Java 21, LibreOffice Writer und Mustang CLI 2.26.0. Damit werden DOCX-Quelldateien in PDF umgewandelt, CII eingebettet und XML sowie PDF/A-3 im selben Worker validiert.

```sh
docker build -t rechnify .
docker run --env-file .env -p 3000:3000 rechnify
```

Für einen Betrieb außerhalb von Docker müssen Java 21, LibreOffice Writer und Mustang CLI 2.26.0 installiert sein. Setze `JAVA_BINARY`, `LIBREOFFICE_BINARY` und `MUSTANG_CLI_JAR` auf die entsprechenden ausführbaren Dateien und das Mustang-JAR.
