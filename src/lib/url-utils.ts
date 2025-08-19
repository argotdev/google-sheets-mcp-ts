export function parseSpreadsheetUrl(url: string): { pubId: string; gid: string } {
  try {
    const urlObj = new URL(url);
    
    // Handle published spreadsheet URLs like:
    // https://docs.google.com/spreadsheets/d/e/2PACX-1vSGVT.../pub?output=html&gid=123456789
    // https://docs.google.com/spreadsheets/d/e/2PACX-1vSGVT.../edit#gid=123456789
    
    if (urlObj.hostname !== 'docs.google.com') {
      throw new Error('URL must be from docs.google.com');
    }
    
    const pathMatch = urlObj.pathname.match(/\/spreadsheets\/d\/e\/([^\/]+)/);
    if (!pathMatch) {
      throw new Error('Invalid Google Sheets URL format - missing published spreadsheet ID');
    }
    
    const pubId = pathMatch[1];
    
    // Extract gid from URL parameters or hash
    let gid = '0'; // default
    
    // Check URL params first (for /pub URLs)
    const gidParam = urlObj.searchParams.get('gid');
    if (gidParam) {
      gid = gidParam;
    } else {
      // Check hash for /edit URLs
      const hashMatch = urlObj.hash.match(/gid=(\d+)/);
      if (hashMatch) {
        gid = hashMatch[1];
      }
    }
    
    return { pubId, gid };
  } catch (error) {
    throw new Error(`Failed to parse spreadsheet URL: ${error instanceof Error ? error.message : String(error)}`);
  }
}