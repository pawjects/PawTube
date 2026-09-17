const { fetchYouTube } = require('../js/api/client');

module.exports = async (req, res) => {
  try {
    const regionCode = req.query.region || 'US';
    // Get popular videos
    const data = await fetchYouTube('/videos', {
      part: 'snippet,contentDetails,statistics',
      chart: 'mostPopular',
      regionCode: regionCode,
      maxResults: 24,
      videoCategoryId: req.query.categoryId || ''
    });
    
    if (!data.items) {
      return res.json({ items: [] });
    }

    // Normalize to PawTube format
    const items = (data.items || []).map(item => ({
      id: item.id,
      title: item.snippet.title,
      uploaderName: item.snippet.channelTitle,
      uploaderUrl: `/channel/${item.snippet.channelId}`,
      thumbnail: item.snippet.thumbnails?.maxres?.url || item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      uploaderAvatar: '', // Channel avatar requires separate request, omit or fetch batched if needed
      duration: parseDuration(item.contentDetails.duration),
      views: parseInt(item.statistics.viewCount) || 0,
      uploaded: new Date(item.snippet.publishedAt).getTime(),
      type: 'stream'
    }));

    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function parseDuration(pt) {
  // ISO 8601 duration parser (e.g., PT1H2M10S)
  const match = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);
  return h * 3600 + m * 60 + s;
}
