# denah.7mit

Peta denah kelas 7 MIT + panduan navigasi ke kursi. Situs statis (tanpa build).

- Data kursi dibaca dari **server.7mit** (Supabase) lewat edge function baca-saja
  `class-display-api` → `layout.published_seats` (tabel `classroom_layout_state`),
  di-refresh tiap 30 detik, dengan cadangan `localStorage` bila server tak terjangkau.
- Cari nama / nomor kursi → rute animasi dari Pintu Masuk + langkah panduan.
- Tautan langsung: `?kursi=9` atau `?nama=salman`. "Kursi saya" tersimpan di peramban.
- Siapa duduk di mana tetap diatur dari portal pengurus (menerbitkan denah);
  aplikasi ini hanya menampilkan denah yang sudah dipublikasikan.

Jalankan lokal: `python3 -m http.server 8000` lalu buka http://localhost:8000
Deploy: unggah `index.html`, `styles.css`, `app.js` ke hosting untuk domain `denah.7mit`.
