const fs = require('fs');
let code = fs.readFileSync('docs/invidious.js', 'utf8');

const regex = /const requestPromise = \(async \(\) => \{[\s\S]*?\}\)\(\);/m;

const replacement = `const requestPromise = (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      if (options.signal) {
        options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      }
      
      try {
        const fetchUrl = \`/api/invidious\${endpoint}\`;
        const res = await fetch(fetchUrl, {
          ...options,
          headers: {
            'Accept': 'application/json',
            ...(options.headers || {})
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          throw new Error(\`HTTP \${res.status}: \${res.statusText}\`);
        }
        
        const instanceUsed = res.headers.get('X-Invidious-Instance');
        if (instanceUsed) {
           this.currentInstance = instanceUsed;
        }

        const data = await res.json();
        if (data && data.error) {
          throw new Error(data.error);
        }
        
        if (cacheTtlMs > 0) {
          this.cache.set(cacheKey, { data, expiresAt: Date.now() + cacheTtlMs });
        }
        
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (options.signal?.aborted) {
          throw err;
        }
        throw new Error(\`Failed to fetch \${endpoint} via proxy: \` + err.message);
      }
    })();`;

code = code.replace(regex, replacement);
fs.writeFileSync('docs/invidious.js', code);
