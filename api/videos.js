const { fetchYouTube } = require('../js/api/client');

module.exports = async (req, res) => {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Video ID required' });

    // Fetch video details
    const data = await fetchYouTube('/videos', {
      part: 'snippet,contentDetails,statistics',
      id: id
    });

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const item = data.items[0];
    const categoryId = item.snippet.categoryId;

    // relatedToVideoId is deprecated, so we fetch videos from the same category or search terms
    let relatedStreams = [];
    try {
      const relatedData = await fetchYouTube('/videos', {
        part: 'snippet,contentDetails,statistics',
        chart: 'mostPopular',
        videoCategoryId: categoryId,
        maxResults: 15,
        regionCode: 'US'
      });
      
      relatedStreams = (relatedData.items || []).filter(i => i.id !== id).map(rItem => {
        const vId = rItem.id;
        return {
          url: `/watch?v=${vId}`,
          videoId: vId,
          title: rItem.snippet.title,
          uploaderName: rItem.snippet.channelTitle,
          thumbnail: rItem.snippet.thumbnails?.medium?.url || rItem.snippet.thumbnails?.default?.url,
          duration: parseDuration(rItem.contentDetails?.duration),
          views: parseInt(rItem.statistics?.viewCount) || 0,
          uploaded: new Date(rItem.snippet.publishedAt).getTime(),
        };
      });
    } catch(e) {
      console.warn("Could not fetch related videos:", e.message);
    }

    res.json({
      title: item.snippet.title,
      uploader: item.snippet.channelTitle,
      uploaderUrl: `/channel/${item.snippet.channelId}`,
      uploaderAvatar: '', 
      views: parseInt(item.statistics.viewCount) || 0,
      uploadDate: new Date(item.snippet.publishedAt).getTime(),
      description: item.snippet.description || '',
      relatedStreams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

function parseDuration(pt) {
  if(!pt) return 0;
  const match = pt.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const h = parseInt(match[1] || 0);
  const m = parseInt(match[2] || 0);
  const s = parseInt(match[3] || 0);
  return h * 3600 + m * 60 + s;
}
