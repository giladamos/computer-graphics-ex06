import express from 'express';
import path     from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const port = 8000;

/* ─────────────────── STATIC ASSETS ──────────────────── */
/*  #1  JS, textures, etc. that live in /src             */
app.use('/src', express.static(path.join(__dirname, 'src')));

/*  #2  CSS (and any images) that live in /css           */
app.use('/css', express.static(path.join(__dirname, 'css')));

app.use('/textures', express.static(path.join(__dirname, 'src', 'textures')));

/*   ▸ If you keep everything client-side inside a single
       folder (e.g. /public), you can replace both lines with:
       app.use(express.static(path.join(__dirname, 'public')));
*/

/* ─────────────────── ROOT HTML ───────────────────────── */
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ─────────────────── START SERVER ────────────────────── */
app.listen(port, () =>
  console.log(`Server ready →  http://localhost:${port}`)
);
