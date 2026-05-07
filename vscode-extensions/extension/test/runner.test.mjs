import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { resolveBinaryPath } from "../dist/binary.js";

const output = { appendLine: () => {} };
let tempRoots = [];

function trackTempRoot(root) {
    tempRoots.push(root);
    return root;
}

function makeTempRoot() {
    return trackTempRoot(
        fs.mkdtempSync(path.join(os.tmpdir(), "shexli-ext-")),
    );
}

function writeBinary(filePath, mode) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "");
    fs.chmodSync(filePath, mode);
}

afterEach(() => {
    for (const root of tempRoots) {
        fs.rmSync(root, { recursive: true, force: true });
    }
    tempRoots = [];
});

describe("resolveBinaryPath", () => {
    it("returns configured binary path when bundled binary is disabled", () => {
        const root = makeTempRoot();
        const config = {
            binaryPath: "/usr/bin/shexli",
            useBundledBinary: false,
        };
        const resolved = resolveBinaryPath(config, root, output);
        assert.equal(resolved, config.binaryPath);
    });

    it("prefers repo layout bundled binary when present", () => {
        const root = makeTempRoot();
        const binaryPath = path.join(
            root,
            "vscode-extensions",
            "extension",
            "resources",
            "bin",
            "shexli",
        );
        writeBinary(binaryPath, 0o755);
        const config = {
            binaryPath: "/usr/bin/shexli",
            useBundledBinary: true,
        };
        const resolved = resolveBinaryPath(config, root, output);
        assert.equal(resolved, binaryPath);
    });

    it("falls back to packaged layout when repo layout is missing", () => {
        const root = makeTempRoot();
        const binaryPath = path.join(
            root,
            "extension",
            "resources",
            "bin",
            "shexli",
        );
        writeBinary(binaryPath, 0o755);
        const config = {
            binaryPath: "/usr/bin/shexli",
            useBundledBinary: true,
        };
        const resolved = resolveBinaryPath(config, root, output);
        assert.equal(resolved, binaryPath);
    });

    it("falls back when bundled binary is not executable", () => {
        const root = makeTempRoot();
        const binaryPath = path.join(
            root,
            "vscode-extensions",
            "extension",
            "resources",
            "bin",
            "shexli",
        );
        writeBinary(binaryPath, 0o644);
        const config = {
            binaryPath: "/usr/bin/shexli",
            useBundledBinary: true,
        };
        const resolved = resolveBinaryPath(config, root, output);
        assert.equal(resolved, config.binaryPath);
    });
});
