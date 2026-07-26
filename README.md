# Generate PEAR

Aplikasi Next.js untuk membuat jadwal dan uraian aktivitas dari rentang tanggal serta commit GitLab.

## Menjalankan di lokal

Salin `.env.example` menjadi `.env.local`, isi kredensial AI dan GitLab, lalu jalankan:

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Perubahan source akan dimuat ulang otomatis oleh Next.js.

Untuk menghentikan server, tekan `Ctrl+C` pada terminal yang menjalankan `npm run dev`. Jika terminalnya sudah tertutup tetapi port masih dipakai:

```bash
lsof -ti :3000 | xargs kill
```

## GPT-5.4 Mini

Model hemat yang direkomendasikan adalah GPT-5.4 Mini. Konfigurasi OpenAI langsung:

```env
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-5.4-mini
AI_REASONING_EFFORT=none
AI_MAX_COMPLETION_TOKENS=16384
```

Jika memakai OpenRouter, gunakan `AI_BASE_URL=https://openrouter.ai/api/v1` dan model `openai/gpt-5.4-mini`. Untuk proxy lokal yang memakai alias model, biarkan `AI_MODEL` sesuai alias proxy dan set `AI_REASONING_EFFORT=none` apabila proxy meneruskan parameter OpenAI tersebut.

Client tetap memakai endpoint Chat Completions agar kompatibel dengan OpenAI maupun endpoint OpenAI-compatible. Pada GPT-5.4 Mini, aplikasi tidak mengirim `temperature`, memakai reasoning `none` untuk menghemat token, dan membatasi output secara default. Naikkan `AI_MAX_COMPLETION_TOKENS` bila respons terpotong; untuk rentang commit yang sangat besar, memperbesar context model saja tetap tidak menggantikan batching.

## Deploy ke Vercel

Aplikasi aman dijalankan di Vercel selama seluruh nilai `.env.local` dimasukkan sebagai Environment Variables di pengaturan project dan file `.env*` tidak di-commit. Build production dapat diperiksa dengan:

```bash
npm run build
```
