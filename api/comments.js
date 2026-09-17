const { fetchYouTube } = require('../js/api/client');

module.exports = async (req, res) => {
  try {
    const videoId = req.query.videoId;
    if (!videoId) return res.status(400).json({ error: 'Video ID required' });

    const data = await fetchYouTube('/commentThreads', {
      part: 'snippet',
      videoId: videoId,
      maxResults: 20,
      order: 'relevance'
    });

    if (!data.items) {
      return res.json({ items: [] });
    }

    const items = data.items.map(item => {
      const comment = item.snippet.topLevelComment.snippet;
      return {
        id: item.id,
        author: comment.authorDisplayName,
        authorAvatar: comment.authorProfileImageUrl,
        text: comment.textDisplay,
        likes: parseInt(comment.likeCount) || 0,
        publishedAt: new Date(comment.publishedAt).getTime()
      };
    });

    res.json({ items });
  } catch (error) {
    if (error.message.includes('403')) {
      return res.json({ items: [], disabled: true }); // Comments disabled
    }
    res.status(500).json({ error: error.message });
  }
};
