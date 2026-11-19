/* =================================================================
   DAFTAR RESMI — sumber: form booking graduation.html + pricelist
   Dipakai halaman wisuda (portal client) dan wisuda-admin.html
   ================================================================= */

/* Universitas: v = nilai yang disimpan di Sheet, t = yang tampil di layar */
var UNIV = [
  { v: 'UPR - Universitas Palangkaraya',               t: 'UPR / Universitas Palangkaraya' },
  { v: 'UMPR - Universitas Muhammadiyah Palangkaraya', t: 'UMPR / Universitas Muhammadiyah Palangkaraya' },
  { v: 'UIN - Universitas Islam Negeri Palangkaraya',  t: 'UIN / Universitas Islam Negeri Palangkaraya' },
  { v: 'Poltekes Palangkaraya',                        t: 'Poltekes Palangkaraya' },
  { v: 'STIE YPBK Palangkaraya',                       t: 'STIE YPBK Palangkaraya' },
  { v: 'STIE Sampit',                                  t: 'STIE Sampit' },
  { v: 'UNDA - Universitas Darwan Ali Sampit',         t: 'UNDA / Universitas Darwan Ali Sampit' },
  { v: 'UMSA - Universitas Muhammadiyah Sampit',       t: 'UMSA / Universitas Muhammadiyah Sampit' },
  { v: 'POLISAM - Politeknik Sampit',                  t: 'POLISAM / Politeknik Sampit' },
  { v: '__custom__',                                   t: 'Lainnya (isi manual)' }
];

/* Paket: jatah = jumlah foto edit (sesuai form booking + web) */
var PAKET = [
  { v: 'Silver',            t: 'Silver — Rp 450.000 (Max 1 orang)',            jatah: 15 },
  { v: 'Gold',              t: 'Gold — Rp 600.000 (Max 5 orang)',              jatah: 25 },
  { v: 'Platinum',          t: 'Platinum — Rp 750.000 (Max 9 orang)',          jatah: 50 },
  { v: 'Bestie Graduation', t: 'Bestie Graduation — Rp 800.000 (2 wisudawan)', jatah: 35 }
];

/* Jatah edit dari nama paket */
function jatahPaket(v) {
  var k = String(v || '').trim().toLowerCase();
  for (var i = 0; i < PAKET.length; i++) {
    if (PAKET[i].v.toLowerCase() === k) return PAKET[i].jatah;
  }
  return 0;
}

/* Label universitas (kalau di Sheet tersimpan sebagai value) */
function labelUniv(v) {
  var k = String(v || '').trim();
  for (var i = 0; i < UNIV.length; i++) {
    if (UNIV[i].v === k) return UNIV[i].t;
  }
  return k;
}
