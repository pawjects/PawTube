const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(express.json());

// Dynamic routing for Vercel-style /api/* serverless handlers
app.all('/api/*', async (req, res) => {
  try {
    const rawPath = req.path.replace(/^\/api\/?/, '').replace(/\/$/, '');
    
    // Resolve file candidate in ./api/
    const candidates = [
      path.join(__dirname, 'api', `${rawPath}.js`),
      path.join(__dirname, 'api', rawPath, 'index.js'),
      path.join(__dirname, 'api', `${rawPath}`)
    ];

    let matchedFile = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());

    // Legacy fallback to unified handler if not found
    if (!matchedFile && fs.existsSync(path.join(__dirname, 'api', 'unified.js'))) {
      matchedFile = path.join(__dirname, 'api', 'unified.js');
    }

    if (matchedFile) {
      delete require.cache[require.resolve(matchedFile)];
      const handler = require(matchedFile);
      if (typeof handler === 'function') {
        await handler(req, res);
      } else if (handler.default && typeof handler.default === 'function') {
        await handler.default(req, res);
      } else {
        res.status(500).json({ error: 'INVALID_HANDLER', message: 'Handler is not a function' });
      }
    } else {
      res.status(404).json({ error: 'NOT_FOUND', message: `API route ${req.path} not found` });
    }
  } catch (err) {
    console.error(`[API Error] ${req.path}:`, err);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Static assets with dev no-cache headers
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/src', express.static(path.join(__dirname, 'src')));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static(__dirname));

// SPA fallback for all remaining routes
app.get('*', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PawTube dev server running on port ${PORT}`);
});
