# Microsoft Rewards Bookmark Manager

A Chrome extension that automates Microsoft Rewards by creating and managing Bing search bookmarks with unique keywords.

## Features

-   🎯 **Automated Bing Searches**: Creates bookmarks with unique search terms  
-   ⏱️ **Configurable Timing**: Adjustable delay between searches  
-   📊 **Progress Tracking**: Visual progress indicator and bookmark counter  
-   🔄 **Resume Capability**: Continue from where you left off  
-   🛡️ **Safe Operation**: Built-in delays and validation to prevent detection  
-   💾 **Persistent Settings**: Saves your preferences across sessions  

## Installation

You can install the extension in two ways:

### Option 1: Quick Install (Using Prebuilt `dist/` Folder)

The `dist/` folder is already included in the repository for convenience.

1. Clone or download this repository  
2. Open your browser's extensions page:
    - **Chrome**: go to `chrome://extensions/`
    - **Microsoft Edge**: go to `edge://extensions/`
3. Enable **Developer mode** (toggle in the top right)  
4. Click **Load unpacked**  
5. Select the `dist/` folder  

> ✅ No need to run any build commands — just load and go.

---

### Option 2: Build From Source

If you prefer to build the extension yourself:

1. Clone this repository  
2. Install dependencies:

    ```bash
    npm install
    ```

3. Build the extension:

    ```bash
    npm run build
    ```

4. Open your browser's extensions page:
    - **Chrome**: go to `chrome://extensions/`
    - **Microsoft Edge**: go to `edge://extensions/`
5. Enable **Developer mode**  
6. Click **Load unpacked**  
7. Select the generated `dist/` folder

---

### Development Setup

```bash
npm install
npm run build
npm run watch  # For development with auto-rebuild
