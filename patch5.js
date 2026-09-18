const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const regex = /if \(!response.ok\) \{\s*if \(response.status === 404 \|\| response.status === 501\) \{\s*const status = proxyManager.instanceStatus.get\(instance\) \|\| \{ failures: 0 \};\s*status.failures \+= 1;\s*if \(status.failures >= 2\) status.healthy = false;\s*proxyManager.instanceStatus.set\(instance, status\);\s*proxyManager.currentInstance = null;\s*\}\s*throw new Error\(\`HTTP \$\{response.status\}\`\);\s*\}/;

const replacement = `
      if (!response.ok) {
        if ([403, 404, 429, 500, 501, 502, 503].includes(response.status)) {
           const status = proxyManager.instanceStatus.get(instance) || { failures: 0 };
           status.failures += 1;
           if (status.failures >= 2) status.healthy = false;
           proxyManager.instanceStatus.set(instance, status);
           proxyManager.currentInstance = null;
        }
        throw new Error(\`HTTP \${response.status}\`);
      }
`;

code = code.replace(regex, replacement);
fs.writeFileSync('server.js', code);
