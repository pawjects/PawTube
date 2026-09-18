const fs = require('fs');
let code = fs.readFileSync('api/invidious.js', 'utf8');

const regex = /let lastError = null;\s*for \(let i = 0; i <= maxRetries; i\+\+\) \{/;
const replacement = `let lastError = null;
  const triedInstances = new Set();
  for (let i = 0; i <= maxRetries; i++) {`;

code = code.replace(regex, replacement);

const regex2 = /const targetUrl = \`\$\{instance\}\$\{endpoint\}\`;/;
const replacement2 = `if (triedInstances.has(instance)) {
        // We already tried this one. Force a new one by temporarily marking it unavailable.
        proxyManager.currentInstance = null;
        const status = proxyManager.instanceStatus.get(instance) || {};
        status.failures = (status.failures || 0) + 1;
        proxyManager.instanceStatus.set(instance, status);
        continue;
      }
      triedInstances.add(instance);
      const targetUrl = \`\$\{instance\}\$\{endpoint\}\`;`;

code = code.replace(regex2, replacement2);
fs.writeFileSync('api/invidious.js', code);

code = fs.readFileSync('server.js', 'utf8');
code = code.replace(regex, replacement);
code = code.replace(regex2, replacement2);
fs.writeFileSync('server.js', code);
