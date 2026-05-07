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

export function buildDiagnostics(
    result: ShexliResult,
    packageRoot: string,
): {
    nextFiles: Set<string>;
    diagnosticsByUri: Map<vscode.Uri, vscode.Diagnostic[]>;
} {
    const diagnosticsByUri = new Map<vscode.Uri, vscode.Diagnostic[]>();
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
                    diagnosticsByUri,
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
            const range = buildEvidenceRange(item, line);
            const uri = vscode.Uri.file(resolved);
            nextFiles.add(resolved);
            const code = buildDiagnosticCode(finding);
            appendDiagnostic(
                diagnosticsByUri,
                uri,
                range,
                formatMessage(finding),
                severity,
                code,
            );
        }
    }

    return { nextFiles, diagnosticsByUri };
}

export function appendDiagnostic(
    target: Map<vscode.Uri, vscode.Diagnostic[]>,
    uri: vscode.Uri,
    range: vscode.Range,
    message: string,
    severity: vscode.DiagnosticSeverity,
    code: string | number | { value: string | number; target: vscode.Uri },
): void {
    const entry = new vscode.Diagnostic(range, message, severity);
    entry.source = DIAGNOSTIC_SOURCE;
    entry.code = code;

    const list = target.get(uri);
    if (list) {
        list.push(entry);
    } else {
        target.set(uri, [entry]);
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

export function buildEvidenceRange(
    item: ShexliEvidence,
    line: number,
): vscode.Range {
    const snippet = item.snippet ?? "";
    if (!snippet) {
        return new vscode.Range(line, 0, line, 1);
    }

    const trimmed = snippet.trimEnd();
    const firstLine = trimmed.split("\n", 1)[0] ?? "";
    const indentMatch = firstLine.match(/^\s*/);
    const startCol = indentMatch ? indentMatch[0].length : 0;
    const length = Math.max(1, firstLine.length - startCol);
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
