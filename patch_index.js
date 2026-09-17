const fs = require('fs');
let html = fs.readFileSync('docs/index.html', 'utf8');

// Replace sidebar
const newSidebar = `<aside class="sidebar" id="sidebar">
      <nav class="sidebar-nav">
        <a class="nav-item active" href="#/home" data-route="/home">
          <span class="material-symbols-rounded nav-icon">home</span>
          <span class="nav-label">Home</span>
        </a>
        <a class="nav-item" href="#/shorts" data-route="/shorts">
          <span class="material-symbols-rounded nav-icon">amp_stories</span>
          <span class="nav-label">Shorts</span>
        </a>
        <a class="nav-item" href="#/library" data-route="/library">
          <span class="material-symbols-rounded nav-icon">video_library</span>
          <span class="nav-label">Library</span>
        </a>
        <a class="nav-item" href="#/you" data-route="/you">
          <span class="material-symbols-rounded nav-icon">person</span>
          <span class="nav-label">You</span>
        </a>
        <div class="sidebar-footer" style="margin-top:auto; padding-top:20px;">
          <p>&copy; 2026 PawTube LLC</p>
        </div>
      </nav>
    </aside>`;

html = html.replace(/<aside class="sidebar" id="sidebar">[\s\S]*?<\/aside>/, newSidebar);

// Replace bottom nav
const newBottomNav = `<nav class="bottom-nav" id="bottom-nav">
      <div class="bnav-pill" id="bnav-pill"></div>
      <a class="bnav-item active" href="#/home" data-route="/home">
        <div class="bnav-icon-wrapper"><span class="material-symbols-rounded">home</span></div>
        <span class="bnav-label">Home</span>
      </a>
      <a class="bnav-item" href="#/shorts" data-route="/shorts">
        <div class="bnav-icon-wrapper"><span class="material-symbols-rounded">amp_stories</span></div>
        <span class="bnav-label">Shorts</span>
      </a>
      <a class="bnav-item" href="#/library" data-route="/library">
        <div class="bnav-icon-wrapper"><span class="material-symbols-rounded">video_library</span></div>
        <span class="bnav-label">Library</span>
      </a>
      <a class="bnav-item" href="#/you" data-route="/you">
        <div class="bnav-icon-wrapper"><span class="material-symbols-rounded">person</span></div>
        <span class="bnav-label">You</span>
      </a>
    </nav>`;

html = html.replace(/<nav class="bottom-nav" id="bottom-nav">[\s\S]*?<\/nav>/, newBottomNav);

fs.writeFileSync('docs/index.html', html);
