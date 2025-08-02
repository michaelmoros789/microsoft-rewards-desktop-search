const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src");
const distDir = path.join(__dirname, "..", "dist");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Files to copy from project root
const rootFilesToCopy = ["manifest.json", "icon.png", "popup.html"]; // moved popup.html here
rootFilesToCopy.forEach((file) => {
    const srcPath = path.join(__dirname, "..", file);
    const distPath = path.join(distDir, file);

    try {
        if (!fs.existsSync(srcPath)) {
            console.warn(`⚠ Warning: ${file} not found at ${srcPath}`);
            return;
        }
        fs.copyFileSync(srcPath, distPath);
        console.log(`✓ Copied ${file} from root`);
    } catch (err) {
        console.error(`❌ Error copying ${file}: ${err.message}`);
    }
});

// Files to copy from /src
const srcFilesToCopy = ["style.css"]; // only style.css remains here
srcFilesToCopy.forEach((file) => {
    const srcPath = path.join(srcDir, file);
    const distPath = path.join(distDir, file);

    try {
        if (!fs.existsSync(srcPath)) {
            console.warn(`⚠ Warning: ${file} not found in src`);
            return;
        }
        fs.copyFileSync(srcPath, distPath);
        console.log(`✓ Copied ${file} from src`);
    } catch (err) {
        console.error(`❌ Error copying ${file}: ${err.message}`);
    }
});

// Recursively copy non-.ts assets from src/utils/
function copyRecursive(src, dest) {
    if (!fs.existsSync(src)) return;

    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
        fs.mkdirSync(dest, { recursive: true });
        fs.readdirSync(src).forEach((file) => {
            copyRecursive(path.join(src, file), path.join(dest, file));
        });
    } else {
        const ext = path.extname(src);
        if (ext !== ".ts") {
            fs.copyFileSync(src, dest);
            console.log(`✓ Copied asset: ${path.relative(srcDir, src)}`);
        }
    }
}

// Start recursive copy from /src/utils
copyRecursive(path.join(srcDir, "utils"), path.join(distDir, "utils"));

console.log("✅ Asset copying completed!");
