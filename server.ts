import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';

// Since we are compiling to CommonJS with esbuild, we should handle __dirname compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  // Hostinger and other cloud platforms pass PORT via environment variables
  const PORT = process.env.PORT || 3000;

  // Standard API health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      framework: 'Express + Vite + React'
    });
  });

  // Integrate Vite for dev mode, or serve static dist folder in production
  if (process.env.NODE_ENV !== 'production') {
    console.log('Starting development server with Vite middleware...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Starting production server serving static assets...');
    const distPath = path.join(process.cwd(), 'dist');
    
    // Serve static files (js, css, images, etc.)
    app.use(express.static(distPath, {
      maxAge: '1y',
      etag: true
    }));

    // SPA fallback route - serve index.html for all other requests
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`🚀 Server listening at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
