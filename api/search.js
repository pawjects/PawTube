const { fetchYouTube } = require('../js/api/client');

module.exports = async (req, res) => {
  try {
    const q = req.query.q || '';
    const filter = req.query.filter || 'videos'; 
    const type = filter === 'videos' ? 'video' : filter === 'channels' ? 'channel' : 'video';
    const channelId = req.query.channelId;

    let searchParams = {
      part: 'snippet',
      type: type,
      maxResults: 24,
      order: req.query.sort_by === 'upload_date' ? 'date' : 'relevance'
    };
    
    if (q) searchParams.q = q;
    if (channelId) searchParams.channelId = channelId;

    const data = await fetchYouTube('/search', searchParams);
    
    if (!data.items) {
      return res.json({ items: [] });
    }

    const videoIds = data.items.filter(i => i.id.videoId).map(i => i.id.videoId).join(',');
    let statsMap = {};
    
    if (videoIds) {
      const statsData = await fetchYouTube('/videos', {
        part: 'contentDetails,statistics',
        id: videoIds
      });
      statsData.items.forEach(item => {
        statsMap[item.id] = {
          duration: parseDuration(item.contentDetails.duration),
          views: parseInt(item.statistics.viewCount) || 0
        };
      });
    }

    const items = data.items.map(item => {
      const vidId = item.id.videoId;
      return {
        url: vidId ? `/watch?v=${vidId}` : '',
        videoId: vidId,
        id: vidId, // PawTube uses 'id' instead of 'videoId' sometimes
        title: item.snippet.title,
        uploaderName: item.snippet.channelTitle,
        uploaderUrl: `/channel/${item.snippet.channelId}`,
        thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
        duration: statsMap[vidId]?.duration || 0,
        views: statsMap[vidId]?.views || 0,
        uploaded: new Date(item.snippet.publishedAt).getTime(),
        type: 'stream'
      };
    });

    res.json({ items });
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
