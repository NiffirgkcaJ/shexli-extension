const fs = require("fs");
const path = require("path");

const binaryPath = path.join(
    __dirname,
    "..",
    "extension",
    "resources",
    "bin",
    "shexli",
);

if (!fs.existsSync(binaryPath)) {
    console.error("Missing bundled binary:", binaryPath);
    console.error("Build it with: npm run build-binary");
    process.exit(1);
}

try {
    fs.accessSync(binaryPath, fs.constants.X_OK);
} catch (err) {
    console.error("Bundled binary is not executable:", binaryPath);
    console.error(String(err));
    process.exit(1);
}

console.log("Bundled binary OK:", binaryPath);
