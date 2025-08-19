/** HTTP fetch with timeout + follow redirects */
export async function fetchPublishedCsv(pubId: string, gid = "0"): Promise<string> {
  // Construct the published CSV URL
  let url: string;
  if (gid !== '0') {
    url = `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?gid=${gid}&single=true&output=csv`;
  } else {
    url = `https://docs.google.com/spreadsheets/d/e/${pubId}/pub?single=true&output=csv`;
  }
  
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 30_000);
  try {
    const res = await fetch(url, { redirect: "follow", signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}