import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOMParser } from "@xmldom/xmldom";
import { downloadBuffer } from "@/lib/s3";

export type ValidationIssue = { id: string; message: string; location: string };
export type ValidationWarning = { id: string; message: string };
export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationWarning[];
  profile: string;
};

type CommandResult = { stdout: string; stderr: string; exitCode: number | null };
const VALIDATION_TIMEOUT_MS = 9_000;

function runMustang(args: string[], timeoutMs = VALIDATION_TIMEOUT_MS): Promise<CommandResult> {
  const jarPath = process.env.MUSTANG_CLI_JAR || "/opt/mustang/Mustang-CLI-2.26.0.jar";
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.JAVA_BINARY || "java", ["-jar", jarPath, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const append = (current: string, chunk: Buffer) => {
      if (current.length + chunk.length > 8 * 1024 * 1024) {
        child.kill("SIGKILL");
        return current;
      }
      return current + chunk.toString("utf8");
    };
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = append(stderr, chunk); });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode });
    });
  });
}

function parseValidationReport(xml: string, exitCode: number | null, stderr: string): ValidationResult {
  const match = xml.match(/<validation\b[\s\S]*?<\/validation>/);
  if (!match) {
    return {
      valid: false,
      errors: [{ id: "MUSTANG_REPORT", message: stderr.trim() || "Mustang returned no validation report.", location: "" }],
      warnings: [],
      profile: "",
    };
  }

  const parseErrors: string[] = [];
  const document = new DOMParser({
    onError: (level, message) => {
      if (level === "error" || level === "fatalError") parseErrors.push(message);
    },
  }).parseFromString(match[0], "application/xml");
  const root = document.documentElement;
  if (!root || parseErrors.length) {
    return {
      valid: false,
      errors: [{ id: "MUSTANG_REPORT", message: parseErrors.join("; ") || "Malformed validation report.", location: "" }],
      warnings: [],
      profile: "",
    };
  }

  const summaries = Array.from(root.getElementsByTagName("summary"));
  const valid = summaries.at(-1)?.getAttribute("status") === "valid" && exitCode === 0;
  const errorNodes = Array.from(root.getElementsByTagName("error"));
  const warningNodes = Array.from(root.getElementsByTagName("warning"));
  const extractRuleId = (message: string) =>
    message.match(/\b(?:BR-[A-Z]{2,5}-\d{1,4}|PEPPOL-[A-Z0-9._-]+|EN16931-[A-Z0-9._-]+)\b/)?.[0];
  const errors = errorNodes.map((node) => {
    const message = node.textContent?.trim() || "Validation error";
    return {
      id: node.getAttribute("id") || extractRuleId(message) || node.getAttribute("type") || "MUSTANG_RULE",
      message,
      location: node.getAttribute("location") || message.match(/(?:location|lineNumber)[=: ]+([^,;]+)/i)?.[1]?.trim() || "",
    };
  });
  const warnings = warningNodes.map((node) => {
    const message = node.textContent?.trim() || "Validation warning";
    return {
      id: node.getAttribute("id") || extractRuleId(message) || node.getAttribute("type") || "MUSTANG_WARNING",
      message,
    };
  });
  const xmlSection = root.getElementsByTagName("xml").item(0);
  const profile = xmlSection?.getElementsByTagName("profile").item(0)?.textContent?.trim() || "";

  if (!valid && errors.length === 0) {
    errors.push({ id: "MUSTANG_INVALID", message: "Mustang reported an invalid document.", location: "" });
  }
  return { valid, errors, warnings, profile };
}

async function validateLocalFile(sourceName: string, bytes: Uint8Array): Promise<ValidationResult> {
  const directory = await mkdtemp(join(tmpdir(), "rechnify-mustang-"));
  const sourcePath = join(directory, sourceName);
  try {
    await writeFile(sourcePath, bytes);
    const result = await runMustang([
      "--action=validate",
      `--source=${sourcePath}`,
      "--no-notices",
      "--disable-file-logging",
    ]);
    return parseValidationReport(result.stdout, result.exitCode, result.stderr);
  } catch (error) {
    return {
      valid: false,
      errors: [{
        id: "MUSTANG_EXECUTION",
        message: error instanceof Error ? error.message : "Mustang could not validate the file.",
        location: "",
      }],
      warnings: [],
      profile: "",
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function validateZugferd(s3Key: string): Promise<ValidationResult> {
  try {
    const file = await downloadBuffer(s3Key);
    return await validateLocalFile("zugferd.pdf", file);
  } catch (error) {
    return {
      valid: false,
      errors: [{ id: "MUSTANG_DOWNLOAD", message: error instanceof Error ? error.message : "Could not download the generated PDF.", location: "" }],
      warnings: [],
      profile: "",
    };
  }
}

export async function validateCiiXml(xml: string): Promise<ValidationResult> {
  const directory = await mkdtemp(join(tmpdir(), "rechnify-cii-"));
  const sourcePath = join(directory, "factur-x.xml");
  try {
    await writeFile(sourcePath, xml, "utf8");
    const result = await runMustang([
      "--action=validate",
      `--source=${sourcePath}`,
      "--no-notices",
      "--disable-file-logging",
    ]);
    return parseValidationReport(result.stdout, result.exitCode, result.stderr);
  } catch (error) {
    return {
      valid: false,
      errors: [{ id: "MUSTANG_EXECUTION", message: error instanceof Error ? error.message : "Mustang could not validate the CII XML.", location: "" }],
      warnings: [],
      profile: "",
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function combineCiiPdf(sourcePdf: Uint8Array, xml: string): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "rechnify-combine-"));
  const sourcePath = join(directory, "original.pdf");
  const xmlPath = join(directory, "factur-x.xml");
  const outputPath = join(directory, "zugferd.pdf");
  try {
    await Promise.all([
      writeFile(sourcePath, sourcePdf),
      writeFile(xmlPath, xml, "utf8"),
    ]);
    const result = await runMustang([
      "--action=combine",
      `--source=${sourcePath}`,
      `--source-xml=${xmlPath}`,
      `--out=${outputPath}`,
      "--format=fx",
      "--version=2",
      "--profile=e",
      "--no-additional-attachments",
      "--ignorefileextension",
      "--disable-file-logging",
    ], 30_000);
    const output = await readFile(outputPath);
    if (result.exitCode !== 0 || output.byteLength < 32) {
      throw new Error(`Mustang could not embed the CII XML: ${result.stderr || result.stdout}`);
    }
    return output;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function convertDocxToPdf(docx: Uint8Array): Promise<Buffer> {
  const directory = await mkdtemp(join(tmpdir(), "rechnify-docx-pdf-"));
  const sourcePath = join(directory, "source.docx");
  const outputPath = join(directory, "source.pdf");
  try {
    await writeFile(sourcePath, docx);
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.env.LIBREOFFICE_BINARY || "soffice", [
        "--headless", `-env:UserInstallation=file://${directory}/lo-profile`,
        "--convert-to", "pdf", "--outdir", directory, sourcePath,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
      child.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once("close", (exitCode) => {
        clearTimeout(timer);
        if (exitCode === 0) resolve();
        else reject(new Error(`LibreOffice could not convert the DOCX source: ${stderr || `exit ${exitCode}`}`));
      });
    });
    const output = await readFile(outputPath);
    if (output.byteLength < 32 || output.subarray(0, 4).toString("ascii") !== "%PDF") {
      throw new Error("LibreOffice did not produce a valid PDF.");
    }
    return output;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
