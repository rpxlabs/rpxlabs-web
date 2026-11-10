# RPXLABS Web

Multi-page photography site + booking system. Satu repo, nama file berbeda = URL berbeda.

## Halaman

| URL | File | Fungsi |
|---|---|---|
| `/` | index.html | Landing, 5 pintu layanan |
| `/graduation.html` | graduation.html | Booking wisuda (DP, kapasitas 4/hari, banner high-demand) |
| `/running.html` | running.html | Tebus foto event lari (10 album Google Photos) |
| `/sport.html` | sport.html | Padel / tenis / basket / badminton |
| `/event.html` | event.html | Dokumentasi event (birthday, corporate, seminar) |
| `/portfolio.html` | portfolio.html | Grid portfolio + filter kategori |
| `/admin.html` | admin.html | Panel admin (input job, agenda, konflik) |
| `/calendar.html` | calendar.html | Kalender jadwal (read-only, PIN) |

## Deploy

Vercel auto-deploy dari repo ini. Push ke `main` = live otomatis.

```
git add -A && git commit -m "..." && git push
```

## Backend

Semua halaman pakai satu Google Apps Script endpoint:
`https://script.google.com/macros/s/AKfycbx1BYB1TACi2OSYFACowp38RVs1A8tq70hPn3dxbvjtLfJuYsS9LfuNEWQbOx5_o5KnLg/exec`

Spreadsheet: 1 sheet, tab `Bookings` + `Other Jobs`.

## Catatan

- Tema: monokrom hitam-putih, glassmorphism, white glow. Tanpa aksen warna.
- Logo: base64 inline, tidak diubah.
- Navbar balik ke landing ada di halaman layanan (`pfnav`).
- admin.html + calendar.html tidak ditautkan dari landing (akses langsung).
