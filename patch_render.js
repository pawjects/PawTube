const fs = require('fs');
let js = fs.readFileSync('docs/app.js', 'utf8');

const newRender = `function render() {
  const hash = location.hash.replace('#', '');
  const path = hash.split('?')[0] || '/home';
  route = ['home','watch','history','saved','subscriptions','shorts','library','you'].includes(path.slice(1)) ? path.slice(1) : 'home';
  
  let activeTab = route;
  if (route === 'history' || route === 'saved') activeTab = 'library';
  if (route === 'subscriptions') activeTab = 'you';
  
  $$('.nav-item, .bnav-item').forEach(el => el.classList.remove('active'));
  $$(\`[data-route="/\${activeTab}"]\`).forEach(el => el.classList.add('active'));
  
  const tabs = ['home', 'shorts', 'library', 'you'];
  const tabIndex = tabs.indexOf(activeTab);
  const pill = $('#bnav-pill');
  if (pill) {
     if (tabIndex !== -1) {
         pill.style.opacity = '1';
         pill.style.transform = \`translateX(\${tabIndex * 100}%)\`;
     } else {
         pill.style.opacity = '0';
     }
  }
  
  const main = $('#main-content');
  
  if (window.playerWrapper && playerWrapper.parentNode) {
      playerWrapper.remove();
  }

  if(route === 'home') { main.innerHTML = viewHome(); }
  else if(route === 'watch') { 
      if (main.querySelector('#watch-layout-container') && main.dataset.vid === currentVideoId) {
          updateWatchDetails();
      } else {
          main.innerHTML = viewWatch(); 
          main.dataset.vid = currentVideoId;
          const mount = $('#player-mount-point');
          if (mount && window.playerWrapper) mount.appendChild(window.playerWrapper);
          if (window.initPlayer) window.initPlayer(currentVideoId);
      }
  }
  else if(route === 'history') { main.innerHTML = viewHistory(); }
  else if(route === 'saved') { main.innerHTML = viewSaved(); }
  else if(route === 'subscriptions') { 
    main.innerHTML = viewSubscriptions();
    if (!subsLoading && store.getSubs().length) {
      subsLoading = true;
      Promise.all(store.getSubs().map(s => fetchChannelVideos(s.id)))
        .then(() => { subsLoading = false; render(); })
        .catch(() => { subsLoading = false; });
    }
  }
  else if(route === 'shorts') { main.innerHTML = viewShorts(); fetchShorts(); }
  else if(route === 'library') { main.innerHTML = viewLibrary(); }
  else if(route === 'you') { main.innerHTML = viewYou(); }
  
  const hs = $('#header-search');
  if (hs && document.activeElement !== hs) hs.value = searchQuery;
}`;

// Replacing the old `render()`
js = js.replace(/function render\(\) \{[\s\S]*?if \(hs && document\.activeElement !== hs\) hs\.value = searchQuery;\n\}/, newRender);

fs.writeFileSync('docs/app.js', js);
