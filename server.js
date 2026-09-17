const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware for parsing JSON if needed
app.use(express.json());

// Serve static files from the 'docs' directory
app.use(express.static(path.join(__dirname, 'docs')));

// Simple dynamic route loader to mimic Vercel's /api behavior
app.all('/api/*', async (req, res) => {
  const routePath = req.params[0].split('?')[0]; // e.g., 'search' or 'trending'
  try {
    const handler = require(path.join(__dirname, 'api', routePath + '.js'));
    await handler(req, res);
  } catch (err) {
    console.error(`API Route not found or error in /api/${routePath}:`, err);
    res.status(404).json({ error: 'Endpoint not found or server error' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
