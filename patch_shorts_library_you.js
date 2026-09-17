const fs = require('fs');
let js = fs.readFileSync('docs/app.js', 'utf8');

const newCode = `
// --- New Views ---

function viewLibrary() {
  const historyData = store.get(STORAGE.HISTORY).slice(0, 10);
  const savedData = store.get(STORAGE.SAVED).slice(0, 10);
  
  const renderList = (data, title, href) => {
    if (!data.length) return '';
    const items = data.map(h => {
        let f = feedCache.find(x => x.id === h.id) || searchResults.find(r => r.id === h.id) || watchDetailsCache.get(h.id) || { title: \`Video \${h.id}\`, channel: '', id: h.id };
        return renderVideo(f, false);
    }).join('');
    return \`
    <div style="margin-bottom:32px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
         <h2 style="font-size:18px; font-weight:600;">\${title}</h2>
         <a href="\${href}" style="color:var(--text-secondary); font-size:13px; font-weight:500; text-decoration:none; display:flex; align-items:center;"><span style="margin-right:4px;">See all</span><span class="material-symbols-rounded" style="font-size:16px;">chevron_right</span></a>
      </div>
      <div class="video-grid" style="grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px;">
        \${items}
      </div>
    </div>\`;
  };

  const historyHtml = renderList(historyData, 'History', '#/history');
  const savedHtml = renderList(savedData, 'Watch Later', '#/saved');
  
  if (!historyHtml && !savedHtml) {
      return \`<div class="empty-state"><span class="material-symbols-rounded">video_library</span><h2>Your library is empty</h2><p style="margin-top:8px">Videos you watch and save will appear here.</p></div>\`;
  }
  
  return \`<div style="padding-bottom: 80px;">
    <h1 class="section-title" style="margin-bottom:24px; display:flex; align-items:center; gap:8px;"><span class="material-symbols-rounded">video_library</span> Library</h1>
    \${historyHtml}
    \${savedHtml}
  </div>\`;
}

function viewYou() {
  const subs = store.getSubs();
  return \`<div style="padding-bottom: 80px;">
    <div style="display:flex; align-items:center; gap:16px; margin-bottom:32px; padding-bottom:24px; border-bottom:1px solid var(--border-color);">
       <img src="https://ui-avatars.com/api/?name=Guest+User&background=333&color=fff&size=80" style="border-radius:50%; width:80px; height:80px;">
       <div>
         <h1 style="font-size:24px; font-weight:700; margin-bottom:4px;">Guest User</h1>
         <p style="color:var(--text-secondary); font-size:13px;">Manage your PawTube experience</p>
       </div>
    </div>
    
    <div class="you-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
       <a href="#/subscriptions" class="you-card" style="background:var(--bg-glass); padding:20px; border-radius:var(--radius-lg); text-decoration:none; color:var(--text-primary); display:flex; align-items:center; gap:16px; border:1px solid var(--border-color); transition:transform 0.2s;">
         <span class="material-symbols-rounded" style="font-size:28px; color:var(--text-secondary);">subscriptions</span>
         <div>
            <h3 style="font-weight:600; margin-bottom:4px; font-size:15px;">Subscriptions</h3>
            <p style="font-size:12px; color:var(--text-secondary);">\${subs.length} channels followed</p>
         </div>
       </a>
       
       <a href="#/history" class="you-card" style="background:var(--bg-glass); padding:20px; border-radius:var(--radius-lg); text-decoration:none; color:var(--text-primary); display:flex; align-items:center; gap:16px; border:1px solid var(--border-color); transition:transform 0.2s;">
         <span class="material-symbols-rounded" style="font-size:28px; color:var(--text-secondary);">history</span>
         <div>
            <h3 style="font-weight:600; margin-bottom:4px; font-size:15px;">Watch History</h3>
            <p style="font-size:12px; color:var(--text-secondary);">Review your watched videos</p>
         </div>
       </a>

       <a href="#/saved" class="you-card" style="background:var(--bg-glass); padding:20px; border-radius:var(--radius-lg); text-decoration:none; color:var(--text-primary); display:flex; align-items:center; gap:16px; border:1px solid var(--border-color); transition:transform 0.2s;">
         <span class="material-symbols-rounded" style="font-size:28px; color:var(--text-secondary);">schedule</span>
         <div>
            <h3 style="font-weight:600; margin-bottom:4px; font-size:15px;">Watch Later</h3>
            <p style="font-size:12px; color:var(--text-secondary);">Videos saved for later</p>
         </div>
       </a>
       
       <div class="you-card" onclick="alert('Settings menu opening...')" style="background:var(--bg-glass); padding:20px; border-radius:var(--radius-lg); cursor:pointer; color:var(--text-primary); display:flex; align-items:center; gap:16px; border:1px solid var(--border-color); transition:transform 0.2s;">
         <span class="material-symbols-rounded" style="font-size:28px; color:var(--text-secondary);">settings</span>
         <div>
            <h3 style="font-weight:600; margin-bottom:4px; font-size:15px;">Settings & Preferences</h3>
            <p style="font-size:12px; color:var(--text-secondary);">Theme, playback, and privacy</p>
         </div>
       </div>
    </div>
  </div>\`;
}

let shortsFeed = [];
let currentShortIndex = 0;
function viewShorts() {
    return \`<div id="shorts-container" style="height:calc(100vh - var(--header-height)); width:100%; display:flex; justify-content:center; align-items:center; background:#000;">
       <div style="color:white;"><span class="material-symbols-rounded spinner" style="animation:spin 1s linear infinite; font-size:48px;">progress_activity</span></div>
    </div>\`;
}

function fetchShorts() {
   if (shortsFeed.length > 0) {
       renderShortsUI();
       return;
   }
   
   fetch(\`https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=15&q=%23shorts&type=video&videoDuration=short&key=\${CONFIG.YT_API_KEY}\`)
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
     });
}

function renderShortsUI() {
    const container = $('#shorts-container');
    if (!container) return; // switched route
    if (!shortsFeed.length) {
        container.innerHTML = \`<div style="color:white; opacity:0.7;">No shorts found.</div>\`;
        return;
    }
    const short = shortsFeed[currentShortIndex];
    
    container.innerHTML = \`
      <div style="position:relative; width:100%; max-width:480px; height:calc(100vh - var(--header-height)); max-height:100%; background:#111; overflow:hidden; border-radius:16px;">
         <iframe width="100%" height="100%" src="https://www.youtube.com/embed/\${short.id}?autoplay=1&controls=0&modestbranding=1&loop=1&playsinline=1" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen style="pointer-events:none;"></iframe>
         <div style="position:absolute; bottom:120px; left:16px; right:64px; color:white; z-index:10; text-shadow:0 1px 4px rgba(0,0,0,0.8);">
            <h3 style="font-size:16px; font-weight:600; margin-bottom:8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">\${short.title}</h3>
            <p style="font-size:14px; font-weight:500;">@\${short.channel}</p>
         </div>
         <div style="position:absolute; bottom:120px; right:16px; display:flex; flex-direction:column; gap:24px; z-index:10;">
            <button onclick="window.showToast?.('Liked Short')" style="background:rgba(0,0,0,0.4); border-radius:50%; width:48px; height:48px; border:none; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px);">
               <span class="material-symbols-rounded" style="font-size:24px;">thumb_up</span>
            </button>
            <button onclick="window.showToast?.('Disliked Short')" style="background:rgba(0,0,0,0.4); border-radius:50%; width:48px; height:48px; border:none; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px);">
               <span class="material-symbols-rounded" style="font-size:24px;">thumb_down</span>
            </button>
            <button onclick="navigator.clipboard.writeText('https://youtube.com/watch?v=\${short.id}'); window.showToast?.('Link copied')" style="background:rgba(0,0,0,0.4); border-radius:50%; width:48px; height:48px; border:none; color:white; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(8px);">
               <span class="material-symbols-rounded" style="font-size:24px;">share</span>
            </button>
         </div>
         <button onclick="window.prevShort()" style="position:absolute; top:30%; right:16px; transform:translateY(-50%); background:rgba(255,255,255,0.15); backdrop-filter:blur(10px); color:white; border:none; border-radius:50%; width:48px; height:48px; cursor:pointer; z-index:10; \${currentShortIndex === 0 ? 'opacity:0; pointer-events:none;' : ''}">
            <span class="material-symbols-rounded">keyboard_arrow_up</span>
         </button>
         <button onclick="window.nextShort()" style="position:absolute; bottom:30%; right:16px; transform:translateY(50%); background:rgba(255,255,255,0.15); backdrop-filter:blur(10px); color:white; border:none; border-radius:50%; width:48px; height:48px; cursor:pointer; z-index:10; \${currentShortIndex === shortsFeed.length - 1 ? 'opacity:0; pointer-events:none;' : ''}">
            <span class="material-symbols-rounded">keyboard_arrow_down</span>
         </button>
         <!-- transparent touch overlay to capture swipe -->
         <div id="shorts-touch-layer" style="position:absolute; inset:0; z-index:5;"></div>
      </div>
    \`;
    
    const layer = $('#shorts-touch-layer');
    if(layer) {
        let touchStartY = 0;
        layer.addEventListener('touchstart', e => { touchStartY = e.touches[0].clientY; }, {passive: true});
        layer.addEventListener('touchend', e => {
            let touchEndY = e.changedTouches[0].clientY;
            if (touchStartY - touchEndY > 50) window.nextShort();
            else if (touchEndY - touchStartY > 50) window.window.prevShort();
            else {
                // simple tap to toggle pause could be tricky due to iframe API on shorts
            }
        }, {passive: true});
        
        layer.onwheel = (e) => {
            if (e.deltaY > 50) { window.nextShort(); e.preventDefault(); }
            else if (e.deltaY < -50) { window.prevShort(); e.preventDefault(); }
        };
    }
}

window.nextShort = function() {
    if (currentShortIndex < shortsFeed.length - 1) {
        currentShortIndex++;
        renderShortsUI();
    }
}
window.prevShort = function() {
    if (currentShortIndex > 0) {
        currentShortIndex--;
        renderShortsUI();
    }
}
`;

js = js + '\n' + newCode;

fs.writeFileSync('docs/app.js', js);
