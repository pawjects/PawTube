const API_URL = 'https://www.googleapis.com/youtube/v3';
const activeRequests = new Map();

async function fetchYouTube(endpoint, params = {}) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY is missing');
  }

  const url = new URL(`${API_URL}${endpoint}`);
  url.searchParams.append('key', apiKey);
  
  const sortedParams = Object.keys(params).sort();
  for (const k of sortedParams) {
    const v = params[k];
    if (v !== undefined && v !== null) {
      url.searchParams.append(k, v);
    }
  }
  
  const cacheKey = url.toString();
  
  if (activeRequests.has(cacheKey)) {
    return activeRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    try {
      const response = await fetch(cacheKey);
      
      if (!response.ok) {
        let errorMsg = `YouTube API Error: ${response.status}`;
        try {
          const errData = await response.json();
          errorMsg = errData.error?.message || errorMsg;
        } catch(e) {}
        throw new Error(errorMsg);
      }
      
      return await response.json();
    } finally {
      activeRequests.delete(cacheKey);
    }
  })();

  activeRequests.set(cacheKey, requestPromise);
  return requestPromise;
}

module.exports = { fetchYouTube };
