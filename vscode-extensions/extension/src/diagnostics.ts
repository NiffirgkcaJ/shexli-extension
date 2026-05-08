import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
    ShexliConfig,
    ShexliEvidence,
    ShexliFinding,
    ShexliResult,
} from "./types";
import { METADATA_FILE } from "./runner";

export const DIAGNOSTIC_SOURCE = "shexli";

export function parseResult(
    raw: string,
    output: vscode.OutputChannel,
): ShexliResult | null {
    try {
        return JSON.parse(raw) as ShexliResult;
    } catch (err) {
        output.appendLine(
            `Shexli: Failed to parse JSON output: ${String(err)}`,
        );
        return null;
    }
}

export async function buildDiagnostics(
    result: ShexliResult,
    packageRoot: string,
): Promise<{
    nextFiles: Set<string>;
    diagnosticsByUri: Map<vscode.Uri, vscode.Diagnostic[]>;
}> {
    const grouped = new Map<string, { uri: vscode.Uri; entries: vscode.Diagnostic[] }>();
    const nextFiles = new Set<string>();
    const fallbackMetadata = path.join(packageRoot, METADATA_FILE);

    for (const finding of result.findings ?? []) {
        const severity = mapSeverity(finding.severity);
        const evidence = finding.evidence ?? [];
        if (evidence.length === 0) {
            if (fs.existsSync(fallbackMetadata)) {
                const uri = vscode.Uri.file(fallbackMetadata);
                nextFiles.add(fallbackMetadata);
                const code = buildDiagnosticCode(finding);
                appendDiagnostic(
                    grouped,
                    uri,
                    new vscode.Range(0, 0, 0, 1),
                    formatMessage(finding),
                    severity,
                    code,
                );
            }
            continue;
        }

        for (const item of evidence) {
            const resolved = resolveEvidencePath(item.path, packageRoot);
            if (!resolved || !fs.existsSync(resolved)) {
                continue;
            }
            const line = Math.max(0, (item.line ?? 1) - 1);
            const uri = vscode.Uri.file(resolved);
            const range = await buildEvidenceRange(item, line, uri);
            nextFiles.add(resolved);
            const code = buildDiagnosticCode(finding);
            appendDiagnostic(
                grouped,
                uri,
                range,
                formatMessage(finding),
                severity,
                code,
            );
        }
    }

    const diagnosticsByUri = new Map<vscode.Uri, vscode.Diagnostic[]>();
    for (const group of grouped.values()) {
        diagnosticsByUri.set(group.uri, group.entries);
    }

    return { nextFiles, diagnosticsByUri };
}

export function appendDiagnostic(
    target: Map<string, { uri: vscode.Uri; entries: vscode.Diagnostic[] }>,
    uri: vscode.Uri,
    range: vscode.Range,
    message: string,
    severity: vscode.DiagnosticSeverity,
    code: string | number | { value: string | number; target: vscode.Uri },
): void {
    const entry = new vscode.Diagnostic(range, message, severity);
    entry.source = DIAGNOSTIC_SOURCE;
    entry.code = code;

    const key = uri.toString();
    const group = target.get(key);
    if (group) {
        group.entries.push(entry);
    } else {
        target.set(key, { uri, entries: [entry] });
    }
}

export function resolveEvidencePath(
    raw: string,
    packageRoot: string,
): string | null {
    if (!raw) {
        return null;
    }

    if (raw.startsWith(packageRoot)) {
        return raw;
    }

    const candidate = path.join(packageRoot, raw);
    if (fs.existsSync(candidate)) {
        return candidate;
    }

    return fs.existsSync(raw) ? raw : null;
}

export function mapSeverity(severity: string): vscode.DiagnosticSeverity {
    if (severity === "error") {
        return vscode.DiagnosticSeverity.Error;
    }
    if (severity === "warning") {
        return vscode.DiagnosticSeverity.Warning;
    }
    return vscode.DiagnosticSeverity.Information;
}

export function formatMessage(finding: ShexliFinding): string {
    if (finding.source_section) {
        return `${finding.rule_id}: ${finding.message} (${finding.source_section})`;
    }
    return `${finding.rule_id}: ${finding.message}`;
}

export function reportSummary(
    packageRoot: string,
    result: ShexliResult,
    output: vscode.OutputChannel,
): void {
    const total = result.summary?.finding_count ?? result.findings.length;
    const status =
        result.summary?.status ?? (total === 0 ? "clean" : "issues_found");
    const severityCounts =
        result.summary?.severity_counts ?? countSeverities(result);
    const errors = severityCounts.error ?? 0;
    const warnings = severityCounts.warning ?? 0;

    output.appendLine(
        `Shexli: ${path.basename(packageRoot)} ${status} ` +
            `(${total} findings, ${errors} errors, ${warnings} warnings)`,
    );
    if (total === 0) {
        output.appendLine(`Shexli: ${path.basename(packageRoot)} clean`);
    }
}

export function countSeverities(result: ShexliResult): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const finding of result.findings) {
        counts[finding.severity] = (counts[finding.severity] ?? 0) + 1;
    }
    return counts;
}

export function buildDiagnosticCode(
    finding: ShexliFinding,
): string | number | { value: string | number; target: vscode.Uri } {
    if (finding.source_url) {
        return {
            value: finding.rule_id,
            target: vscode.Uri.parse(finding.source_url),
        };
    }
    return finding.rule_id;
}

export async function buildEvidenceRange(
    item: ShexliEvidence,
    line: number,
    uri: vscode.Uri,
): Promise<vscode.Range> {
    const snippet = item.snippet ?? "";
    const column = item.column ?? 0;

    if (!snippet) {
        return new vscode.Range(line, column, line, column + 1);
    }

    // Heuristic: The snippet usually starts after indentation.
    // To be precise, we try to find the snippet on the actual line in the file.
    try {
        const document = await vscode.workspace.openTextDocument(uri);
        if (line < document.lineCount) {
            const lineText = document.lineAt(line).text;
            const trimmedSnippet = snippet.trim();
            const startCol = lineText.indexOf(trimmedSnippet);
            if (startCol !== -1) {
                return new vscode.Range(
                    line,
                    startCol,
                    line,
                    startCol + trimmedSnippet.length,
                );
            }
        }
    } catch (err) {
        // Fallback to basic indentation detection if file can't be read
    }

    const firstLine = snippet.split("\n", 1)[0] ?? "";
    const indentMatch = firstLine.match(/^\s*/);
    const indentation = indentMatch ? indentMatch[0].length : 0;
    
    // The analyzer's 'snippet' typically includes the leading indentation of the line.
    // We want the squiggly to start AFTER that indentation.
    const startCol = column + indentation;
    const trimmed = firstLine.trimEnd();
    const length = Math.max(1, trimmed.length - indentation);
    
    return new vscode.Range(line, startCol, line, startCol + length);
}

export function filterFindings(
    result: ShexliResult,
    config: ShexliConfig,
): ShexliResult {
    const enabled = config.ruleEnable;
    const disabled = config.ruleDisable;
    const next = result.findings.filter((finding) => {
        const ruleId = finding.rule_id;
        if (enabled.length > 0 && !matchesAnyPattern(ruleId, enabled)) {
            return false;
        }
        if (disabled.length > 0 && matchesAnyPattern(ruleId, disabled)) {
            return false;
        }
        return true;
    });
    return { ...result, findings: next };
}

export function matchesAnyPattern(value: string, patterns: string[]): boolean {
    return patterns.some((pattern) => matchesPattern(value, pattern));
}

export function matchesPattern(value: string, pattern: string): boolean {
    if (!pattern.includes("*")) {
        return value === pattern;
    }
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
    return regex.test(value);
}
