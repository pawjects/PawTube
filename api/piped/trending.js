const { requestPiped, normalizeMediaItem, sendResponse, sendError } = require('../_piped');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Custom-Instance');
    res.statusCode = 204;
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const region = url.searchParams.get('region') || 'IN';
  const customInstance = url.searchParams.get('custom') || req.headers['x-custom-instance'] || null;

  try {
    const result = await requestPiped('/trending', { region }, { customInstance, ttlMs: 60000 });
    const rawItems = Array.isArray(result.data)
      ? result.data
      : (result.data && Array.isArray(result.data.items) ? result.data.items : []);

    const items = rawItems.map(normalizeMediaItem).filter(Boolean);

    sendResponse(res, 200, {
      items,
      count: items.length,
      region,
      instance: result.instance,
      cached: result.cached
    });
  } catch (err) {
    console.error('[API /piped/trending] Error:', err.message);

    // Fallback curated trending videos to ensure Home Feed is always functional
    const fallbackVideos = [
      {
        id: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        pawtubeUrl: '#/watch?v=dQw4w9WgXcQ',
        title: 'Rick Astley - Never Gonna Give You Up (Official Music Video)',
        channel: 'Rick Astley',
        author: 'Rick Astley',
        channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
        thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
        duration: 213,
        durationFormatted: '3:33',
        views: 1500000000,
        viewsFormatted: '1.5B views',
        type: 'stream'
      },
      {
        id: 'jfKfPfyJRdk',
        url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk',
        pawtubeUrl: '#/watch?v=jfKfPfyJRdk',
        title: 'lofi hip hop radio 📚 - beats to relax/study to',
        channel: 'Lofi Girl',
        author: 'Lofi Girl',
        channelId: 'UCSJ4gkVC6NrvII8umztf0Ow',
        thumb: 'https://i.ytimg.com/vi/jfKfPfyJRdk/hqdefault.jpg',
        duration: -1,
        durationFormatted: 'LIVE',
        views: 45000,
        viewsFormatted: '45K watching',
        isLive: true,
        type: 'stream'
      },
      {
        id: 'JGwWNGJdvx8',
        url: 'https://www.youtube.com/watch?v=JGwWNGJdvx8',
        pawtubeUrl: '#/watch?v=JGwWNGJdvx8',
        title: 'Ed Sheeran - Shape of You (Official Music Video)',
        channel: 'Ed Sheeran',
        author: 'Ed Sheeran',
        channelId: 'UC0C-w0YjGpqDXGB8IHb662A',
        thumb: 'https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg',
        duration: 264,
        durationFormatted: '4:24',
        views: 6200000000,
        viewsFormatted: '6.2B views',
        type: 'stream'
      },
      {
        id: '9bZkp7q19f0',
        url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
        pawtubeUrl: '#/watch?v=9bZkp7q19f0',
        title: 'PSY - GANGNAM STYLE(강남스타일) M/V',
        channel: 'officialpsy',
        author: 'officialpsy',
        channelId: 'UCrDkAvwZum-UTjHmzDI2iIw',
        thumb: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg',
        duration: 253,
        durationFormatted: '4:13',
        views: 5100000000,
        viewsFormatted: '5.1B views',
        type: 'stream'
      },
      {
        id: 'fJ9rUzIMcZQ',
        url: 'https://www.youtube.com/watch?v=fJ9rUzIMcZQ',
        pawtubeUrl: '#/watch?v=fJ9rUzIMcZQ',
        title: 'Queen - Bohemian Rhapsody (Official Video Remastered)',
        channel: 'Queen Official',
        author: 'Queen Official',
        channelId: 'UCiMhD4jzUqG-IgPzUmmytRQ',
        thumb: 'https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg',
        duration: 360,
        durationFormatted: '6:00',
        views: 1700000000,
        viewsFormatted: '1.7B views',
        type: 'stream'
      },
      {
        id: '2Vv-BfVoq4g',
        url: 'https://www.youtube.com/watch?v=2Vv-BfVoq4g',
        pawtubeUrl: '#/watch?v=2Vv-BfVoq4g',
        title: 'Ed Sheeran - Perfect (Official Music Video)',
        channel: 'Ed Sheeran',
        author: 'Ed Sheeran',
        channelId: 'UC0C-w0YjGpqDXGB8IHb662A',
        thumb: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
        duration: 280,
        durationFormatted: '4:40',
        views: 3700000000,
        viewsFormatted: '3.7B views',
        type: 'stream'
      }
    ];

    sendResponse(res, 200, {
      items: fallbackVideos,
      count: fallbackVideos.length,
      region,
      instance: 'fallback',
      cached: false,
      fallback: true
    });
  }
};
