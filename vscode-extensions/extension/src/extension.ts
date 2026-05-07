import * as vscode from "vscode";
import * as path from "path";
import { loadConfig } from "./config";
import { ShexliConfig } from "./types";
import {
    analyzeWorkspacePackages,
    analyzePackage,
    findPackageRoot,
    discoverPackages,
    addPackageRootAndAnalyze,
    findPackageRootFromPath,
    refreshStatusBar,
} from "./commands";

export function activate(context: vscode.ExtensionContext): void {
    const diagnostics = vscode.languages.createDiagnosticCollection("shexli");
    const output = vscode.window.createOutputChannel("Shexli");
    const packageFiles = new Map<string, Set<string>>();
    const debounceTimers = new Map<string, NodeJS.Timeout>();
    const packageStamps = new Map<string, string>();

    const statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100,
    );
    statusBar.command = "shexli.analyzePackage";
    statusBar.text = "Shexli";
    statusBar.show();

    const analyzeWorkspaceCommand = vscode.commands.registerCommand(
        "shexli.analyzeWorkspace",
        async () => {
            const config = await loadConfig(output, context.extensionPath);
            await analyzeWorkspacePackages(
                config,
                diagnostics,
                packageFiles,
                packageStamps,
                output,
                { force: false, clearMissing: true },
            );
        },
    );

    const analyzePackageCommand = vscode.commands.registerCommand(
        "shexli.analyzePackage",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }
            const config = await loadConfig(output, context.extensionPath);
            const filePath = editor.document.uri.fsPath;
            const packageRoot = findPackageRoot(
                filePath,
                config.roots,
                config.packages,
            );
            if (!packageRoot) {
                output.appendLine(
                    "Shexli: No package root found for current file.",
                );
                return;
            }
            await analyzePackage(
                packageRoot,
                config,
                diagnostics,
                packageFiles,
                packageStamps,
                output,
                { force: true },
            );
        },
    );

    const pickPackageCommand = vscode.commands.registerCommand(
        "shexli.pickPackageRoot",
        async () => {
            const config = await loadConfig(output, context.extensionPath);
            const packages = await discoverPackages(config, output);
            if (packages.length === 0) {
                void vscode.window.showWarningMessage(
                    "Shexli: No packages found to analyze.",
                );
                return;
            }

            const picked = await vscode.window.showQuickPick(
                packages.map((entry) => ({
                    label: path.basename(entry),
                    description: entry,
                })),
                {
                    placeHolder: "Select a package to analyze",
                },
            );
            if (!picked) {
                return;
            }

            const root = picked.description ?? picked.label;
            await addPackageRootAndAnalyze(
                root,
                context.extensionPath,
                diagnostics,
                packageFiles,
                packageStamps,
                output,
                statusBar,
            );
        },
    );

    const setPackageRootCommand = vscode.commands.registerCommand(
        "shexli.setPackageRootForCurrentFile",
        async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                return;
            }

            const root = findPackageRootFromPath(editor.document.uri.fsPath);
            if (!root) {
                void vscode.window.showWarningMessage(
                    "Shexli: No metadata.json found while searching upward.",
                );
                return;
            }

            await addPackageRootAndAnalyze(
                root,
                context.extensionPath,
                diagnostics,
                packageFiles,
                packageStamps,
                output,
                statusBar,
            );
        },
    );

    const rescanWorkspaceCommand = vscode.commands.registerCommand(
        "shexli.rescanWorkspace",
        async () => {
            const config = await loadConfig(output, context.extensionPath);
            diagnostics.clear();
            packageFiles.clear();
            packageStamps.clear();
            await analyzeWorkspacePackages(
                config,
                diagnostics,
                packageFiles,
                packageStamps,
                output,
                { force: true, clearMissing: false },
            );
        },
    );

    context.subscriptions.push(
        diagnostics,
        output,
        statusBar,
        analyzeWorkspaceCommand,
        analyzePackageCommand,
        pickPackageCommand,
        rescanWorkspaceCommand,
        setPackageRootCommand,
    );

    const onSaveListener = vscode.workspace.onDidSaveTextDocument(
        async (doc) => {
            const config = await loadConfig(output, context.extensionPath);
            if (config.runMode !== "onSave") {
                return;
            }
            scheduleAnalysis(
                doc.uri.fsPath,
                config,
                diagnostics,
                packageFiles,
                packageStamps,
                output,
                debounceTimers,
            );
        },
    );

    const onChangeListener = vscode.workspace.onDidChangeTextDocument(
        async (event) => {
            const config = await loadConfig(output, context.extensionPath);
            if (config.runMode !== "onChange") {
                return;
            }
            scheduleAnalysis(
                event.document.uri.fsPath,
                config,
                diagnostics,
                packageFiles,
                packageStamps,
                output,
                debounceTimers,
            );
        },
    );

    const onEditorChangeListener = vscode.window.onDidChangeActiveTextEditor(
        (editor) => {
            refreshStatusBar(
                statusBar,
                output,
                context.extensionPath,
                editor?.document,
            ).catch((err) => {
                output.appendLine(
                    `Shexli: Status update failed: ${String(err)}`,
                );
            });
        },
    );

    const onConfigChangeListener = vscode.workspace.onDidChangeConfiguration(
        (event) => {
            if (!event.affectsConfiguration("shexli")) {
                return;
            }
            refreshStatusBar(statusBar, output, context.extensionPath).catch(
                (err) => {
                    output.appendLine(
                        `Shexli: Status update failed: ${String(err)}`,
                    );
                },
            );
        },
    );

    context.subscriptions.push(
        onSaveListener,
        onChangeListener,
        onEditorChangeListener,
        onConfigChangeListener,
    );

    refreshStatusBar(statusBar, output, context.extensionPath).catch((err) => {
        output.appendLine(`Shexli: Status update failed: ${String(err)}`);
    });
}

function scheduleAnalysis(
    filePath: string,
    config: ShexliConfig,
    diagnostics: vscode.DiagnosticCollection,
    packageFiles: Map<string, Set<string>>,
    packageStamps: Map<string, string>,
    output: vscode.OutputChannel,
    debounceTimers: Map<string, NodeJS.Timeout>,
): void {
    const packageRoot = findPackageRoot(
        filePath,
        config.roots,
        config.packages,
    );
    if (!packageRoot) {
        return;
    }

    const existing = debounceTimers.get(packageRoot);
    if (existing) {
        clearTimeout(existing);
    }

    const timer = setTimeout(() => {
        analyzePackage(
            packageRoot,
            config,
            diagnostics,
            packageFiles,
            packageStamps,
            output,
            { force: true },
        ).catch((err) => {
            output.appendLine(
                `Shexli: Analysis failed for ${packageRoot}: ${String(err)}`,
            );
        });
    }, config.debounceMs);

    debounceTimers.set(packageRoot, timer);
}

export function deactivate(): void {}
