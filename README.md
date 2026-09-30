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
Kursi dipetakan lewat nama node model `kursi_1…kursi_24` (posisi dihitung dari model, bukan di-hardcode),
jadi kalau model diganti, pertahankan nama node itu serta `dinding_depan_a/b` (celah pintu). Perlu WebGL;
tanpa WebGL, denah 2D tetap dipakai. Lisensi three.js: `vendor/three/LICENSE`.

Jalankan lokal: `python3 -m http.server 8000` lalu buka http://localhost:8000
Deploy: unggah `index.html`, `styles.css`, `app.js` ke hosting untuk domain `denah.7mit`.
