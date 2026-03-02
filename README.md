# Grand Football

Run locally:

```bash
npm install
npm run dev
```

## Troubleshooting

- **Symptom:** Next.js dev runtime error: `Cannot find module './276.js'`.
- **Root cause:** Multiple `next dev` processes running at the same time can corrupt shared `.next` cache/chunk state.
- **Recovery (exact sequence):**
  ```bash
  pkill -f "next dev" 2>/dev/null || true
  pkill -f "node.*next/dist/bin/next" 2>/dev/null || true
  rm -rf .next
  npm run dev
  ```
- **Prevention:** Start development with `npm run dev` (pinned to port `3000`) and avoid running parallel dev servers.
