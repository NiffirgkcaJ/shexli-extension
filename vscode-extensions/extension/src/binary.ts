import * as fs from "fs";
import * as path from "path";
import type { ShexliConfig } from "./types";

export interface OutputWriter {
    appendLine(message: string): void;
}

export function resolveBinaryPath(
    config: Pick<ShexliConfig, "useBundledBinary" | "binaryPath">,
    extensionPath: string,
    output: OutputWriter,
): string {
    if (!config.useBundledBinary) {
        return config.binaryPath;
    }

    const candidates = [
        path.join(
            extensionPath,
            "vscode-extensions",
            "extension",
            "resources",
            "bin",
            "shexli",
        ),
        path.join(extensionPath, "extension", "resources", "bin", "shexli"),
    ];
    const candidate = candidates.find((entry) => fs.existsSync(entry));
    if (!candidate) {
        return config.binaryPath;
    }

    try {
        fs.accessSync(candidate, fs.constants.X_OK);
    } catch (err) {
        output.appendLine(
            `Shexli: Bundled binary is not executable: ${candidate} (${String(err)})`,
        );
        return config.binaryPath;
    }

    return candidate;
}
