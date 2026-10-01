# denah.7mit

Peta denah kelas 7 MIT + panduan navigasi ke kursi. Situs statis (tanpa build).

- Data kursi dibaca dari **server.7mit** (Supabase) lewat edge function baca-saja
  `class-display-api` → `layout.published_seats` (tabel `classroom_layout_state`),
  di-refresh tiap 30 detik, dengan cadangan `localStorage` bila server tak terjangkau.
- Cari nama / nomor kursi → rute animasi dari Pintu Masuk + langkah panduan.
- Tautan langsung: `?kursi=9` atau `?nama=salman`. "Kursi saya" tersimpan di peramban.
- Siapa duduk di mana tetap diatur dari portal pengurus (menerbitkan denah);
  aplikasi ini hanya menampilkan denah yang sudah dipublikasikan.

## Mode 3D
Tombol **Model 3D** memuat `assets/denah-kelas.glb` dengan three.js (disalin ke `vendor/three`, tanpa CDN;
dimuat hanya saat dibuka). Seret untuk memutar, scroll/cubit untuk zoom, ketuk kursi untuk rute.
Tombol tampilan: **Miring**, **Atas** (searah denah 2D), **Dari kursi** (sudut pandang siswa).

Catatan model:
- Model memakai penomoran per **baris** (`kursi_1…8` = baris depan), sedangkan denah 2D dan server.7mit per **banjar**
  (Banjar 1 = kursi 1–6). Karena itu kursi dipetakan lewat **posisi** (3 baris × 8 kursi: baris dari depan,
  kolom dari kiri), bukan lewat nama node. Syarat: node `kursi_1…24` (opsional `meja_1…24`) dan `lantai`.
- Model tidak punya objek pintu; sisi +x (koridor) terbuka. Titik "MULAI" ditaruh di tepi lantai sisi +x dekat depan
  (sesuai Pintu Masuk di denah 2D). Jika susunan kursi bukan 3×8, nomor node dipakai apa adanya.
- Perlu WebGL; tanpa WebGL, denah 2D tetap dipakai. Lisensi three.js: `vendor/three/LICENSE`.

Jalankan lokal: `python3 -m http.server 8000` lalu buka http://localhost:8000
Deploy: unggah `index.html`, `styles.css`, `app.js` ke hosting untuk domain `denah.7mit`.
