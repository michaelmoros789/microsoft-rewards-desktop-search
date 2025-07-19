const fs = require("fs");
const path = require("path");

const srcDir = path.join(__dirname, "..", "src");
const distDir = path.join(__dirname, "..", "dist");

// Ensure dist directory exists
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

// Files to copy
const filesToCopy = ["popup.html", "style.css", "icon.png", "manifest.json"];

// Copy each file
filesToCopy.forEach((file) => {
    const srcPath = path.join(srcDir, file);
    const distPath = path.join(distDir, file);

    if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, distPath);
        console.log(`✓ Copied ${file}`);
    } else {
        console.warn(`⚠ Warning: ${file} not found in src/`);
    }
});

console.log("Asset copying completed!");
