const fs = require('fs');
let css = fs.readFileSync('docs/styles.css', 'utf8');

const newBottomNavCSS = `.bottom-nav {
  display: none;
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 16px) + 16px);
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 32px);
  max-width: 400px;
  height: 64px;
  background: rgba(28, 28, 28, 0.6);
  backdrop-filter: blur(24px) saturate(1.5);
  -webkit-backdrop-filter: blur(24px) saturate(1.5);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255,255,255,0.05);
  border-radius: 32px;
  z-index: 100;
  padding: 0 8px;
  align-items: center;
}
.bnav-pill {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: calc((100% - 16px) / 4);
  background: rgba(255, 255, 255, 0.15);
  border-radius: 24px;
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
  z-index: 0;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.2);
}
.bnav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--text-secondary);
  transition: color 0.3s;
  z-index: 1;
  position: relative;
  text-decoration: none;
  height: 100%;
}
.bnav-item:active .bnav-icon-wrapper { transform: scale(0.85); }
.bnav-item.active { color: var(--text-primary); }
.bnav-item .bnav-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.2s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.bnav-item .material-symbols-rounded { 
  font-size: 24px; 
  transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}
.bnav-item.active .material-symbols-rounded { 
  font-variation-settings: 'FILL' 1; 
  transform: translateY(-1px); 
}
.bnav-label { font-size: 11px; font-weight: 500; transition: opacity 0.3s, transform 0.3s; opacity: 0.7; transform: translateY(0); }
.bnav-item.active .bnav-label { opacity: 1; transform: translateY(-1px); }

/* Hide bottom nav when keyboard is open (detect focus on inputs) */
body:has(input:focus) .bottom-nav,
body:has(textarea:focus) .bottom-nav {
  display: none !important;
}`;

// Replace bottom nav styles.
// From `.bottom-nav {` to `/* Page Transitions */`
css = css.replace(/\.bottom-nav \{[\s\S]*?\/\* Page Transitions \*\//, newBottomNavCSS + '\n\n/* Page Transitions */');

fs.writeFileSync('docs/styles.css', css);
