const fs = require('fs');
let js = fs.readFileSync('docs/app.js', 'utf8');

const oldFetch = `fetch(\`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=%23shorts&type=video&videoDuration=short&key=\${CONFIG.YT_API_KEY}\`)
     .then(r => r.json())
     .then(data => {
         if (data.items) {
             shortsFeed = data.items.map(item => ({
                 id: item.id.videoId,
                 title: item.snippet.title,
                 channel: item.snippet.channelTitle,
                 thumb: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.default?.url
             }));
             renderShortsUI();
         }
     }).catch(e => {
         const container = $('#shorts-container');
         if (container) container.innerHTML = \`<div style="color:white; opacity:0.7;">Failed to load Shorts. Please check your API quota.</div>\`;
     });`;

const newFetch = `API.request('/search?q=%23shorts&filter=videos')
     .then(data => {
         if (data.items && data.items.length) {
             shortsFeed = data.items.map(item => ({
                 id: item.id,
                 title: item.title,
                 channel: item.uploaderName,
                 thumb: item.thumbnail
             }));
             renderShortsUI();
         } else {
             const container = $('#shorts-container');
             if (container) container.innerHTML = \`<div style="color:white; opacity:0.7;">No Shorts found right now.</div>\`;
         }
     }).catch(e => {
         const container = $('#shorts-container');
         if (container) container.innerHTML = \`<div style="color:white; opacity:0.7;">Failed to load Shorts.</div>\`;
     });`;

js = js.replace(oldFetch, newFetch);
fs.writeFileSync('docs/app.js', js);
