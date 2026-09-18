const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const regex = /const maxRetries = 2;/;
const replacement = `const maxRetries = 5;`;

code = code.replace(regex, replacement);

const regex2 = /throw new Error\\(\`HTTP \$\{response.status\}\`\\);/;
const replacement2 = `throw new Error(\`HTTP \${response.status}\`);`;

const regex3 = /const data = await response\.text\(\);\\s*let data2;\\s*try \\{\\s*data2 = JSON\.parse\\(data\\);\\s*\\} catch \\(err\\) \\{\\s*throw new Error\\("Invalid JSON response from instance: " \\+ data\.slice\\(0, 50\\)\\);\\s*\\}/;
const regex4 = /const text = await response\.text\(\);\s*let data;\s*try \{\s*data = JSON\.parse\(text\);\s*\} catch \(err\) \{\s*throw new Error\("Invalid JSON response from instance: " \+ text\.slice\(0, 50\)\);\s*\}/;

code = code.replace(regex4, `
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        // Mark as failed
        const status = proxyManager.instanceStatus.get(instance) || { failures: 0 };
        status.failures += 1;
        if (status.failures >= 2) status.healthy = false;
        proxyManager.instanceStatus.set(instance, status);
        proxyManager.currentInstance = null;
        throw new Error("Invalid JSON response from instance: " + text.slice(0, 50));
      }
`);

fs.writeFileSync('server.js', code);
