export function parseSpreadsheetUrl(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname !== 'docs.google.com') {
            throw new Error('URL must be from docs.google.com');
        }
        // Extract publication ID from published URL format
        const pubUrlMatch = urlObj.pathname.match(/\/spreadsheets\/d\/e\/([^\/]+)/);
        if (!pubUrlMatch) {
            throw new Error('Invalid published Google Sheets URL format - must contain "/d/e/2PACX-..."');
        }
        const pubId = pubUrlMatch[1];
        // Extract gid from URL parameters (default to '0' if not present)
        const gid = urlObj.searchParams.get('gid') || '0';
        return { pubId, gid };
    }
    catch (error) {
        throw new Error(`Failed to parse spreadsheet URL: ${error instanceof Error ? error.message : String(error)}`);
    }
}
