# Generate Logbook

Aplikasi Next.js untuk menyusun logbook harian dan uraian aktivitas jadwal dari
riwayat commit GitLab, diklasifikasikan otomatis oleh AI. Seluruh proses
stateless — tidak ada data yang disimpan ke database.

## Fitur

- **Generate Logbook** — menarik perubahan file dari commit GitLab pada rentang
  tanggal, menggabungkan diff kecil per hari, lalu mengklasifikasikannya menjadi
  entri logbook (kode kegiatan + deskripsi) via AI.
- **Uraian Jadwal** — mengisi uraian aktivitas untuk jadwal yang sudah ada,
  memakai konteks logbook yang sama sebagai sumber bukti.

## Persiapan

```bash
nvm use          # Node 22 (lihat .nvmrc)
npm install
cp .env.example .env   # lalu isi AI_API_KEY, GITLAB_TOKEN, GITLAB_AUTHOR_EMAIL
```

Lihat `.env.example` untuk daftar variabel. Poin penting:

- `AI_BASE_URL` menerima endpoint apa pun yang OpenAI-compatible (OpenRouter,
  Groq, Together, LLM lokal). Default OpenRouter.
- `AI_JSON_OBJECT=false` bila model tidak mendukung `response_format`.
- Token GitLab butuh scope `read_api`.

## Menjalankan

```bash
npm run dev      # http://localhost:3000
```

Repo GitLab **dipilih per-generate** dari daftar starred project di UI — minimal
satu repo wajib dipilih (tidak ada default dari `.env`).

## Struktur

- `lib/gitlab.ts` — client REST GitLab (read-only, fetch paralel + dedup commit).
- `lib/ai-client.ts` — client chat-completion OpenAI-compatible.
- `lib/logbook.ts` — pipeline logbook: fetch → gabung diff → klasifikasi AI.
- `lib/uraian-jadwal.ts` — sintesis uraian jadwal dari konteks logbook.
- `app/api/*` — route stateless untuk tiap fitur.
