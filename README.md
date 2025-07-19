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

### From Source

1. Clone this repository
2. Install dependencies: `npm install`
3. Build the extension: `npm run build`
4. Load the `dist/` folder as an unpacked extension in Chrome

### Development Setup

```bash
npm install
npm run build
npm run watch  # For development with auto-rebuild
```

## Usage

1. **Set Base URL**: Enter a Bing search URL (e.g., `https://www.bing.com/search?pglt=931&q=test&cvid=XXXX&gs_lcrp=XXX&FORM=XXX&PC=XXX`)
2. **Configure Settings**:
    - **Skip Duration**: Time between searches (recommended: ≥10 seconds)
    - **Bookmark Count**: Number of bookmarks to create (recommended: ≥30)
3. **Create Bookmarks**: Click "Reset Progress" to generate new bookmarks
4. **Start Automation**: Click "Start/Resume Script" to begin opening bookmarks

## Configuration

-   **Base URL**: Must be a valid Bing search URL with `q=` or `pq=` parameter
-   **Skip Duration**: 1-60 seconds (default: 10)
-   **Bookmark Count**: 1-100 bookmarks (default: 30)

## Development

### Project Structure

```
src/
├── popup.ts          # Main popup logic
├── popup.html        # Popup UI
├── keywords.ts       # Search keywords data
├── style.css         # Styling
├── manifest.json     # Extension manifest
└── icon.png          # Extension icon
```

### Scripts

-   `npm run build` - Build for production
-   `npm run watch` - Development mode with auto-rebuild
-   `npm run lint` - Run ESLint (if configured)

## Permissions

-   `storage` - Save user preferences and progress
-   `tabs` - Open bookmark URLs
-   `bookmarks` - Create and manage bookmarks

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Disclaimer

This extension is for educational purposes. Please ensure compliance with Microsoft's Terms of Service and use responsibly.
