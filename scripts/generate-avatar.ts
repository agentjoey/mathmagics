// One-shot: generate the MathMagics agent avatar via MiniMax image-01.
// Usage:  ./scripts/load-env-from-keychain.sh npx tsx scripts/generate-avatar.ts
import fs from 'node:fs';
import path from 'node:path';

const PROMPT = `Flat minimalist Bauhaus-style mascot avatar, abstract friendly character
combining geometric shapes (circle for head, soft squares and triangles),
soft palette of pale yellow (#FFE9B0), light blue (#B3D9FF), mint green (#B8E6CB),
clean thick outlines, on a pure white background, no text, no human face,
1:1 aspect ratio, centered composition, suitable as a chat avatar for a kids' math app.`;

const ENDPOINT = 'https://api.minimax.io/v1/image_generation';

async function main() {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) throw new Error('MINIMAX_API_KEY not set');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'image-01',
      prompt: PROMPT,
      aspect_ratio: '1:1',
      response_format: 'base64',
    }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as { data?: { image_base64?: string[] } };
  const b64 = data?.data?.image_base64?.[0];
  if (!b64) {
    throw new Error(`No base64 in response: ${JSON.stringify(data).slice(0, 200)}`);
  }

  const outPath = path.join(process.cwd(), 'public/avatar/mathmagics.png');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`✅ Avatar written: ${outPath}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
