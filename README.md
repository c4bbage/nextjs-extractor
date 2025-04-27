# Next.js SourceMap Extractor

A Chrome extension that extracts JavaScript files and their corresponding source maps from Next.js websites, preserving the directory structure for easy analysis.

## Features

- Extract all Next.js JavaScript files from any website
- Optionally include source map (.map) files
- Preserve directory structure in the downloaded ZIP file
- Works with Cloudflare-protected websites
- User-friendly progress indicators
- Handles files up to 10MB in size

## Installation

### From Source (Developer Mode)

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked"
5. Select the `nextjs-extractor` directory

## Usage
![doc/image.png]
1. Visit any website built with Next.js
2. Click the extension icon in your browser toolbar
3. Check or uncheck "Include sourcemap files" as needed
4. Click "Extract and download all Next.js files"
5. Wait for the extraction process to complete
6. Save the downloaded ZIP file

## Processing Source Maps

After downloading the ZIP file, you can use the included `extract-sourcemap.js` Node.js script to extract the original source code from the source maps:

1. Extract the downloaded ZIP file
2. Install the required dependency:
   ```bash
   npm install source-map
   ```
3. Run the script on a directory containing source map (.map) files:
   ```bash
   node extract-sourcemap.js /path/to/extracted/zip/_next/static/chunks
   ```

## How It Works

This extension:
1. Searches the current page for Next.js JavaScript file references
2. Downloads each JavaScript file and optionally its source map
3. Creates a ZIP archive with the original directory structure preserved
4. Provides the ZIP file for download

## Technical Details

- Built for Chrome using Manifest V3
- Uses content scripts to extract file references from the page
- Processes files in the background script using JSZip
- Converts the ZIP to a Data URL for download (files up to 10MB)
- Leverages the Chrome downloads API for file saving

## Privacy & Security

- This extension only accesses the current tab when you click the extension icon
- No data is sent to any server - all processing happens locally in your browser
- The extension requires permissions only for the current website you're viewing

## License

MIT License

## Credits

- [JSZip](https://stuk.github.io/jszip/) for ZIP file creation
- [Source Map](https://github.com/mozilla/source-map) library for source map processing 