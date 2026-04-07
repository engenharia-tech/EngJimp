import app from "./api/app";
import path from "path";
import express from "express";
import dotenv from "dotenv";

// Only load dotenv in local development
if (!process.env.VERCEL) {
  dotenv.config();
}

const PORT = 3000;

// Vite middleware for development or Static serving for production
async function setupVite() {
  // In Vercel, we don't need to serve static files from Express if vercel.json handles it,
  // but keeping it for local production builds and general compatibility.
  if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// Only run setupVite and listen if not in Vercel environment
// Vercel will handle the routing and serving via vercel.json and /api/index.ts
if (!process.env.VERCEL) {
  setupVite().then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  });
}

// Export for Vercel
export default app;
