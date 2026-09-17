const fs = require('fs');
let html = fs.readFileSync('docs/index.html', 'utf8');

// Replace nav-label "Library" with "Playlists & History" in sidebar only (or both, bottom nav doesn't have much space)
// Wait, for bottom nav, "Library" or "Playlists + History" might be too long. The prompt said:
// 3. Playlists + History ... The bottom navigation should contain ONLY these four primary destinations: Home, Shorts, Playlists + History, You

html = html.replace(/<span class="nav-label">Library<\/span>/g, '<span class="nav-label">Playlists &amp; History</span>');
// update bottom nav just in case we should use "Library" since it fits better, but let's change to "Playlists" or just keep Library. The prompt says "Playlists + History" but also icon "library". I'll use "Library" for bnav-label because of space, but in sidebar "Playlists & History".

// Remove "Links" and "Subscriptions" from sidebar since prompt requested exactly 4.
// Let's rewrite the sidebar block completely.
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
          <span class="nav-label">Playlists &amp; History</span>
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
fs.writeFileSync('docs/index.html', html);
