# Deployment

## Vercel 部署步骤

1. `vercel link` (首次)
2. Vercel Dashboard → Settings → Environment Variables，添加：
   - `MINIMAX_API_KEY`
   - `SITE_PASSWORD`
3. `vercel --prod`

## 本地构建验证

```bash
./scripts/load-env-from-keychain.sh npm run build
./scripts/load-env-from-keychain.sh npm start
```
