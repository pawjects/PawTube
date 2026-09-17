const fs = require('fs');
let css = fs.readFileSync('docs/styles.css', 'utf8');

css = css.replace(/\.nav-item\.active \{ background: var\(--bg-elevated\); font-weight: 600; \}/, '.nav-item.active { background: rgba(255, 255, 255, 0.12); font-weight: 600; box-shadow: inset 0 1px 0 rgba(255,255,255,0.05); }');

fs.writeFileSync('docs/styles.css', css);
