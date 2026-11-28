import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";

export type ReportField = {
  label: string;
  value: string;
  confidence: number | null;
  corrected: boolean;
};

export type ReportData = {
  generatedAt: string;
  tenantName: string;
  invoiceNumber: string;
  invoiceDate: string;
  sender: string;
  recipient: string;
  grossTotal: string;
  fields: ReportField[];
  validation: {
    valid: boolean;
    profile: string;
    errors: Array<{ id: string; message: string; location: string }>;
    warnings: Array<{ id: string; message: string }>;
  };
};

const styles = StyleSheet.create({
  page: { paddingTop: 40, paddingBottom: 42, paddingHorizontal: 42, fontSize: 9, color: "#172033", fontFamily: "Helvetica" },
  title: { fontSize: 24, fontWeight: 700, color: "#102a43" },
  subtitle: { marginTop: 5, color: "#52606d", fontSize: 10 },
  section: { marginTop: 20 },
  heading: { marginBottom: 8, paddingBottom: 5, borderBottomWidth: 1, borderBottomColor: "#cbd5e1", fontSize: 12, fontWeight: 700, color: "#102a43" },
  row: { flexDirection: "row", marginBottom: 5 },
  label: { width: "32%", color: "#52606d" },
  value: { flexGrow: 1 },
  tableHead: { flexDirection: "row", paddingVertical: 5, backgroundColor: "#edf2f7", fontWeight: 700 },
  tableRow: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#e2e8f0" },
  cellLabel: { width: "34%", paddingHorizontal: 4 },
  cellValue: { width: "42%", paddingHorizontal: 4 },
  cellConfidence: { width: "12%", paddingHorizontal: 4 },
  cellCorrected: { width: "12%", paddingHorizontal: 4 },
  valid: { padding: 8, backgroundColor: "#e7f8ee", color: "#166534" },
  invalid: { padding: 8, backgroundColor: "#fff1f2", color: "#991b1b" },
  issue: { marginTop: 4, lineHeight: 1.35 },
  legal: { marginTop: 12, padding: 10, backgroundColor: "#f1f5f9", lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 20, left: 42, right: 42, fontSize: 8, color: "#64748b", textAlign: "center" },
});

export function PruefberichtTemplate({ data }: { data: ReportData }) {
  return (
    <Document title="Prüfbericht" author="Rechnify" subject="Technischer ZUGFeRD-Prüfbericht">
      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.title}>Prüfbericht</Text>
        <Text style={styles.subtitle}>{data.tenantName} · Erstellt am {data.generatedAt}</Text>

        <View style={styles.section}>
          <Text style={styles.heading}>Rechnungsübersicht</Text>
          <View style={styles.row}><Text style={styles.label}>Rechnungsnummer</Text><Text style={styles.value}>{data.invoiceNumber || "—"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Rechnungsdatum</Text><Text style={styles.value}>{data.invoiceDate || "—"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Absender</Text><Text style={styles.value}>{data.sender || "—"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Empfänger</Text><Text style={styles.value}>{data.recipient || "—"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Bruttosumme</Text><Text style={styles.value}>{data.grossTotal || "—"}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Erkennungsqualität</Text>
          <View style={styles.tableHead}>
            <Text style={styles.cellLabel}>Feld</Text>
            <Text style={styles.cellValue}>Erfasster Wert</Text>
            <Text style={styles.cellConfidence}>Sicherheit</Text>
            <Text style={styles.cellCorrected}>Korrigiert</Text>
          </View>
          {data.fields.map((field, index) => (
            <View key={`${field.label}-${index}`} style={styles.tableRow} wrap={false}>
              <Text style={styles.cellLabel}>{field.label}</Text>
              <Text style={styles.cellValue}>{field.value || "—"}</Text>
              <Text style={styles.cellConfidence}>{field.confidence === null ? "—" : `${(field.confidence * 100).toFixed(1)}%`}</Text>
              <Text style={styles.cellCorrected}>{field.corrected ? "Ja" : "Nein"}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.heading}>Validierungsergebnis</Text>
          <Text style={data.validation.valid ? styles.valid : styles.invalid}>
            {data.validation.valid ? "Bestanden" : "Nicht bestanden"} · Mustang-Profil: {data.validation.profile || "unbekannt"}
          </Text>
          {data.validation.errors.map((error, index) => (
            <Text key={`error-${index}`} style={styles.issue}>Fehler {error.id}: {error.message}{error.location ? ` · ${error.location}` : ""}</Text>
          ))}
          {data.validation.warnings.map((warning, index) => (
            <Text key={`warning-${index}`} style={styles.issue}>Hinweis {warning.id}: {warning.message}</Text>
          ))}
        </View>

        <Text style={styles.legal}>
          Dieser Bericht bestätigt die technische Korrektheit der ZUGFeRD-Datei. Die inhaltliche Richtigkeit liegt in der Verantwortung des Ausstellers.
        </Text>
        <Text fixed style={styles.footer}>Rechnify · Technischer Prüfbericht</Text>
      </Page>
    </Document>
  );
}
