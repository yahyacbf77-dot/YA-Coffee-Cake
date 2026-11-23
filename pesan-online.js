/* =====================================================================
   PESAN ONLINE — YA Coffee & Cake
   Dipasang di semua halaman menu (index, kopi, kue, spesial, menu).
   - Menu & harga diambil dari web HPP (Supabase). Kalau gagal, Google Sheets lama dipakai.
   - Tombol pesan mengirim pesanan langsung ke kasir (tanpa login). Kalau gagal, bisa lewat WhatsApp.
   - Istirahat sholat otomatis (jadwal Kota Palu, metode Kemenag) + status toko dari kasir.
   Kunci di bawah adalah kunci PUBLIK (publishable) — aman ditaruh di sini.
   ===================================================================== */
var YA_SUPABASE_URL = 'https://yafjkwjcfknhymeoinqd.supabase.co';
var YA_SUPABASE_KEY = 'sb_publishable_O89xf-d5lRz1J8zGshJxNQ_XP_In-X0';
var YA_LOKASI = { lat: -0.8917, lng: 119.8707, zona: 8 };   // Kota Palu, WITA
var YA_ISTIRAHAT_SHOLAT = 15;                                // menit setelah azan, pesan online istirahat
// Media sosial (ikon di bagian bawah halaman). Kosongkan '' untuk menyembunyikan salah satunya.
var YA_SOSMED = {
  instagram: 'https://www.instagram.com/yahya_taqi10/',
  tiktok:    'https://www.tiktok.com/@yacbf77',
  facebook:  'https://www.facebook.com/profile.php?id=61596730493171',
  whatsapp:  'https://wa.me/6285186171117',
  maps:      'https://maps.app.goo.gl/dekxzZD5N3fKKTtY6'
};
// Link "Beri ulasan" dari Google Maps / Google Bisnisku (Bagikan profil → Minta ulasan). Kosong = tombol tidak tampil.
var YA_ULASAN = '';

(function () {
  'use strict';
  var kunciMenu = {};          // nama di web -> kunci di HPP
  var onlineSiap = false;      // menu berhasil diambil dari HPP -> pesan langsung ke kasir
  var pakaiWA = false;         // pengiriman online gagal -> pelanggan memilih WhatsApp
  var toko = null;             // status toko dari kasir
  var LS_PESANAN = 'yaPesananOnline';

  function rpc(nama, isi) {
    return fetch(YA_SUPABASE_URL + '/rest/v1/rpc/' + nama, {
      method: 'POST',
      headers: { 'apikey': YA_SUPABASE_KEY, 'Authorization': 'Bearer ' + YA_SUPABASE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(isi || {})
    }).then(function (r) {
      return r.text().then(function (t) {
        var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) {}
        if (!r.ok) { var err = new Error((d && (d.message || d.hint)) || ('HTTP ' + r.status)); err.server = true; throw err; }
        return d;
      });
    });
  }
  function lsGet(k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function rp(n) { return 'Rp' + Math.round(n).toLocaleString('id-ID'); }
  function jamTeks(menit) { menit = ((Math.round(menit) % 1440) + 1440) % 1440; var h = Math.floor(menit / 60), m = menit % 60; return (h < 10 ? '0' : '') + h + '.' + (m < 10 ? '0' : '') + m; }
  function menitWITA(d) {
    try {
      var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d || new Date()), h = 0, m = 0;
      p.forEach(function (x) { if (x.type === 'hour') h = +x.value; if (x.type === 'minute') m = +x.value; });
      return h * 60 + m;
    } catch (e) { var t = d || new Date(); return t.getHours() * 60 + t.getMinutes(); }
  }
  function perangkat() {
    var id = lsGet('yaPerangkat', null);
    if (!id) { id = 'p-' + Math.random().toString(36).slice(2) + Date.now().toString(36); lsSet('yaPerangkat', id); }
    return id;
  }
  function csvSel(v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

  /* ---------- 1. Menu dari HPP (dipakai oleh pembaca menu di setiap halaman) ----------
     Hanya menu dari HPP yang tampil. Daftar menu lama (Google Sheets / tertulis di halaman) tidak dipakai lagi:
     selama memuat disembunyikan, dan kalau HPP gagal dimuat muncul pesan, bukan menu/harga lama. */
  var KEPALA_CSV = 'Halaman,Kategori,Nama,Harga,Keterangan,Andalan,Habis,Foto';
  document.documentElement.classList.add('yo-muat');
  function menuGagal(teks) {
    document.documentElement.classList.remove('yo-muat');
    var wadah = document.querySelectorAll('main [data-halaman], #ya-menu');
    if (!wadah.length) return;
    wadah.forEach(function (w) {
      w.querySelectorAll('ul, h2').forEach(function (x) { x.remove(); });
      if (!w.querySelector('.yo-gagal')) {
        var p = document.createElement('div'); p.className = 'yo-gagal';
        p.innerHTML = '<p></p><button type="button">Muat ulang</button>';
        p.querySelector('p').textContent = teks;
        p.querySelector('button').addEventListener('click', function () { location.reload(); });
        w.insertBefore(p, w.firstChild);
      }
    });
  }
  function ambilMenu(coba) {
    return Promise.all([rpc('menu_publik'), rpc('toko_publik').catch(function () { return null; })]).catch(function (e) {
      if (coba < 3 && !e.server) return new Promise(function (ok) { setTimeout(ok, 1500 * coba); }).then(function () { return ambilMenu(coba + 1); });
      throw e;
    });
  }
  window.yaMenuHPP = function () {
    return ambilMenu(1).then(function (r) {
      var menu = r[0] || [];
      toko = r[1];
      if (!menu.length) { onlineSiap = false; setTimeout(function () { menuGagal('Menu sedang disiapkan. Silakan cek lagi sebentar, atau pesan langsung di kedai.'); }, 0); return KEPALA_CSV; }
      var adaHalaman = {}; menu.forEach(function (m) { adaHalaman[m.halaman] = true; });
      setTimeout(function () {
        // Halaman/tab yang belum punya menu dari HPP: kosongkan daftar lama
        document.querySelectorAll('main [data-halaman]').forEach(function (w) {
          var hal = w.getAttribute('data-halaman');
          if (hal === 'semua' || adaHalaman[hal]) return;
          w.querySelectorAll('ul, h2').forEach(function (x) { x.remove(); });
          if (!w.querySelector('.yo-kosong')) { var p = document.createElement('p'); p.className = 'yo-kosong'; p.textContent = 'Belum ada menu di sini.'; w.insertBefore(p, w.firstChild); }
        });
        document.documentElement.classList.remove('yo-muat');
      }, 0);
      kunciMenu = {};
      var baris = [KEPALA_CSV];
      menu.forEach(function (m) {
        kunciMenu[m.nama.replace(/\s+/g, ' ').trim()] = m.kunci;
        // Deskripsi menu tidak ditampilkan; baris keterangan hanya untuk stok yang tinggal sedikit ("Tinggal 3")
        var ket = (m.sisa != null && m.sisa > 0 && m.sisa <= 5) ? 'Tinggal ' + m.sisa : '';
        baris.push([m.halaman, m.kelompok, m.nama, m.harga, ket, m.andalan ? 'TRUE' : 'FALSE', m.habis ? 'TRUE' : 'FALSE', m.foto || ''].map(csvSel).join(','));
      });
      if (toko && toko.tutup_sementara) baris.push(['status', '', 'Tutup sementara', '', toko.keterangan || '', '', 'TRUE', ''].map(csvSel).join(','));
      onlineSiap = true;
      setTimeout(function () { ubahTeks(); terapkanStatus(); }, 0);
      return baris.join('\n');
    }).catch(function () {
      // Gagal terhubung: jangan pakai menu lama dari Google Sheets
      setTimeout(function () { menuGagal('Menu belum bisa dimuat. Periksa koneksi internet, lalu muat ulang halaman.'); }, 0);
      return KEPALA_CSV;
    });
  };

  /* ---------- 2. Jadwal sholat (Kemenag: Subuh 20°, Isya 18°, Ashar 1x bayangan, ihtiyat 2 menit) ---------- */
  var rad = function (d) { return d * Math.PI / 180; }, deg = function (r) { return r * 180 / Math.PI; };
  function fix(a, b) { a = a - b * Math.floor(a / b); return a < 0 ? a + b : a; }
  function posisiMatahari(jd) {
    var D = jd - 2451545.0, g = fix(357.529 + 0.98560028 * D, 360), q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)), 360), e = 23.439 - 0.00000036 * D;
    var RA = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))) / 15, 24);
    return { decl: deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L)))), eqt: q / 15 - RA };
  }
  function jadwalSholat(tgl) {
    var y = tgl.y, mo = tgl.m, d = tgl.d;
    if (mo <= 2) { y -= 1; mo += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    var jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (mo + 1)) + d + B - 1524.5 - YA_LOKASI.lng / (15 * 24);
    var lat = YA_LOKASI.lat;
    function tengah(t) { var p = posisiMatahari(jd + t); return fix(12 - p.eqt, 24); }
    function sudut(a, t) {
      var p = posisiMatahari(jd + t), n = tengah(t);
      var x = (-Math.sin(rad(a)) - Math.sin(rad(p.decl)) * Math.sin(rad(lat))) / (Math.cos(rad(p.decl)) * Math.cos(rad(lat)));
      return n + deg(Math.acos(Math.max(-1, Math.min(1, x)))) / 15;
    }
    function ashar(t) { var p = posisiMatahari(jd + t); var a = -deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(lat - p.decl)))))); return sudut(a, t); }
    var ke = function (h) { return Math.round((h + YA_LOKASI.zona - YA_LOKASI.lng / 15) * 60) + 2; };   // menit WITA + ihtiyat
    return [
      { nama: 'Dzuhur', menit: ke(tengah(12 / 24)) },
      { nama: 'Ashar', menit: ke(ashar(13 / 24)) },
      { nama: 'Maghrib', menit: ke(sudut(0.833, 18 / 24)) },
      { nama: 'Isya', menit: ke(sudut(18, 18 / 24)) }
    ];
  }
  function tanggalWITA() {
    try {
      var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(new Date()).split('-');
      return { y: +p[0], m: +p[1], d: +p[2] };
    } catch (e) { var t = new Date(); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }; }
  }
  function sholatSekarang() {
    var t = menitWITA(), hasil = null;
    jadwalSholat(tanggalWITA()).forEach(function (s) { if (t >= s.menit && t < s.menit + YA_ISTIRAHAT_SHOLAT) hasil = s; });
    return hasil;
  }
  window.yaJadwalSholat = function () { return jadwalSholat(tanggalWITA()).map(function (s) { return s.nama + ' ' + jamTeks(s.menit); }); };

  /* ---------- 3. Status pesan online: kasir + sholat ---------- */
  function terapkanStatus() {
    if (!window.yaPesanOnline) return;
    var s = sholatSekarang(), ist = toko && toko.istirahat_sampai ? new Date(toko.istirahat_sampai) : null;
    if (toko && toko.pesan_online === false) window.yaPesanOnline(false, toko.keterangan || '');
    else if (ist && ist > new Date()) window.yaPesanOnline(false, 'istirahat sebentar, buka lagi pukul ' + jamTeks(menitWITA(ist)));
    else if (s) window.yaPesanOnline(false, 'istirahat sholat ' + s.nama + ', buka lagi pukul ' + jamTeks(s.menit + YA_ISTIRAHAT_SHOLAT));
    else window.yaPesanOnline(true);
    ubahTeks(); heroPil();
  }
  /* Foto kecil di kartu menu (menu yang punya foto). Ketuk foto = buka foto besar seperti ketuk nama. */
  function pasangFotoKecil() {
    // Deskripsi menu disembunyikan (juga saat menu cadangan dari Google Sheets); catatan stok tetap
    document.querySelectorAll('main ul li .ket').forEach(function (k) { if (k.textContent && !/^Tinggal \d+$/.test(k.textContent.trim())) k.textContent = ''; });
    document.querySelectorAll('main li[data-foto]').forEach(function (li) {
      if (li.querySelector(':scope > .yo-thumb')) return;
      var img = document.createElement('img');
      img.className = 'yo-thumb'; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.src = li.getAttribute('data-foto');
      img.addEventListener('error', function () { img.remove(); li.classList.remove('yo-ada-foto'); });
      img.addEventListener('click', function () { var n = li.querySelector('.nama'); if (n) n.click(); });
      li.insertBefore(img, li.firstChild); li.classList.add('yo-ada-foto');
    });
  }
  new MutationObserver(function () { pasangFotoKecil(); }).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', pasangFotoKecil);

  /* Ikon media sosial + tombol ulasan Google di bagian bawah halaman */
  var IKON_SOSMED = {
    instagram: ['Instagram', '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="0.6" fill="currentColor"/>'],
    tiktok:    ['TikTok', '<path d="M14 3.5v11a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3.5c.4 2.6 2.4 4.6 5 4.8"/>'],
    facebook:  ['Facebook', '<path d="M14.5 3.5h-1.8A3.7 3.7 0 0 0 9 7.2V10H7v3.5h2v7h3.5v-7h2.6l.6-3.5h-3.2V7.6c0-.6.4-1 1-1h1.8z"/>'],
    whatsapp:  ['WhatsApp', '<path d="M4 20l1.3-3.9A8 8 0 1 1 8 19z"/><path d="M9.2 8.6c.2 2.6 3.5 5.8 6.1 6.1l1.2-1.4-1.9-.9-.8.8c-1.1-.5-2.4-1.8-2.9-2.9l.8-.8-.9-1.9z"/>'],
    maps:      ['Lokasi di Google Maps', '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.6"/>']
  };
  function pasangSosmed() {
    var kaki = document.querySelector('main footer'); if (!kaki || kaki.querySelector('.yo-sosmed')) return;
    var w = document.createElement('div'); w.className = 'yo-sosmed';
    Object.keys(IKON_SOSMED).forEach(function (k) {
      if (!YA_SOSMED[k]) return;
      var a = document.createElement('a'); a.href = YA_SOSMED[k]; a.target = '_blank'; a.rel = 'noopener';
      a.setAttribute('aria-label', IKON_SOSMED[k][0]); a.title = IKON_SOSMED[k][0];
      a.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IKON_SOSMED[k][1] + '</svg>';
      w.appendChild(a);
    });
    if (YA_ULASAN) {
      var u = document.createElement('a'); u.className = 'yo-ulasan'; u.href = YA_ULASAN; u.target = '_blank'; u.rel = 'noopener';
      u.textContent = '★ Beri ulasan di Google'; w.appendChild(u);
    }
    kaki.appendChild(w);
  }
  document.addEventListener('DOMContentLoaded', pasangSosmed);

  /* Banner sapaan di halaman menu (desain.css) */
  function pasangHero() {
    var tab = document.querySelector('.tab-bar'); if (!tab || document.querySelector('.yo-hero')) return;
    var j = Math.floor(menitWITA() / 60);
    var s = j >= 4 && j < 11 ? ['Selamat pagi', 'Kopi pertama hari ini?'] : j >= 11 && j < 15 ? ['Selamat siang', 'Butuh yang dingin-dingin?']
          : j >= 15 && j < 18 ? ['Selamat sore', 'Saatnya ngopi dan ngemil.'] : ['Selamat malam', 'Masih sempat secangkir lagi.'];
    var h = document.createElement('div'); h.className = 'yo-hero';
    h.innerHTML = '<div><div class="yo-salam"></div><p class="yo-ajak"></p></div><span class="yo-pil"></span>';
    h.querySelector('.yo-salam').textContent = s[0]; h.querySelector('.yo-ajak').textContent = s[1];
    tab.parentNode.insertBefore(h, tab);
    heroPil();
  }
  function heroPil() {
    var p = document.querySelector('.yo-hero .yo-pil'); if (!p) return;
    var tutup = document.body.classList.contains('ya-tutup-pesan');
    p.textContent = tutup ? 'Pesan online tutup' : 'Pesan, ambil ± 15 menit';
  }
  document.addEventListener('DOMContentLoaded', pasangHero);
  setInterval(heroPil, 30000);
  function cekToko() { rpc('toko_publik').then(function (t) { toko = t; terapkanStatus(); }).catch(function () { terapkanStatus(); }); }
  setInterval(terapkanStatus, 30000);
  setInterval(cekToko, 60000);

  /* ---------- 4. Teks di lembar pesanan ---------- */
  function ubahTeks() {
    if (!onlineSiap || pakaiWA) return;
    var bayar = document.querySelector('.ya-catatan-bayar');
    if (bayar && !bayar.dataset.online) {
      bayar.dataset.online = '1';
      bayar.innerHTML = '<strong>Bayar di kasir saat mengambil</strong> (tunai atau QRIS). Pesanan langsung masuk ke kasir kami, lalu dibuat menjelang jam ambil.';
    }
    var kirim = document.getElementById('ya-kirim');
    if (kirim && !kirim.dataset.online) { kirim.dataset.online = '1'; kirim.textContent = 'Kirim pesanan'; kirim.removeAttribute('target'); }
    var info = document.querySelector('.ya-info-pesan');
    if (info && /WhatsApp/.test(info.textContent)) info.textContent = info.textContent.replace(/Pemesanan lewat WhatsApp/g, 'Pesan online').replace(/lewat WhatsApp /g, '');
    // Pilihan "Makan di sini" (kursi terbatas)
    var cara = document.querySelector('input[name="ya-cara"]');
    if (cara && !document.querySelector('input[name="ya-cara"][value="Makan di sini"]')) {
      var lbl = document.createElement('label'); lbl.className = 'ya-opsi';
      lbl.innerHTML = '<input type="radio" name="ya-cara" value="Makan di sini"><span>Makan di sini</span>';
      cara.closest('label').parentNode.appendChild(lbl);
    }
    // Label yang lebih jelas (nilai yang dikirim ke kasir tetap sama)
    var LABEL_CARA = { 'Saya sendiri': 'Bawa pulang (ambil sendiri)', 'Ojek online': 'Diambil ojek online' };
    document.querySelectorAll('input[name="ya-cara"]').forEach(function (r) {
      var sp = r.parentNode.querySelector('span'); if (sp && LABEL_CARA[r.value]) sp.textContent = LABEL_CARA[r.value];
    });
    document.querySelectorAll('.ya-label').forEach(function (el) { if (/diambil oleh/i.test(el.textContent)) el.textContent = 'Cara pesan'; });
  }
  var amati = new MutationObserver(function () { if (onlineSiap && !pakaiWA) { var info = document.querySelector('.ya-info-pesan'); if (info && /WhatsApp/.test(info.textContent)) ubahTeks(); } });
  document.addEventListener('DOMContentLoaded', function () { var info = document.querySelector('.ya-info-pesan'); if (info) amati.observe(info, { childList: true, characterData: true, subtree: true }); });

  /* ---------- 5. Kirim pesanan ke kasir ---------- */
  // Jam buka diambil dari YA_JADWAL di halaman; database mengecek ulang. Hasil: teks kesalahan, atau kosong kalau boleh.
  function hariWITA() {
    try { return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', weekday: 'short' }).format(new Date())]; }
    catch (e) { return new Date().getDay(); }
  }
  function cekJamAmbil(menit) {
    if (!window.YA_JADWAL) return '';
    var ss = (hariWITA() === 5 ? YA_JADWAL.jumat : YA_JADWAL.biasa).map(function (s) {
      return s.map(function (j) { var p = j.split(':'); return (+p[0]) * 60 + (+p[1]); });
    });
    if (ss.some(function (s) { return menit >= s[0] && menit <= s[1]; })) return '';
    return 'Kedai tutup pada pukul ' + jamTeks(menit) + '. Pilih jam ambil antara ' + ss.map(function (s) { return jamTeks(s[0]) + '–' + jamTeks(s[1]); }).join(' atau ') + '.';
  }
  function pesanError(teks) {
    var el = document.getElementById('ya-online-err');
    if (!el) {
      el = document.createElement('p'); el.id = 'ya-online-err'; el.className = 'ya-peringatan';
      el.style.cssText = 'background:#f8dcd7;color:#8f2d22;border-radius:10px;padding:10px 12px;margin:10px 0 0';
      var k = document.getElementById('ya-kirim'); k.parentNode.insertBefore(el, k);
    }
    el.textContent = teks; el.hidden = !teks;
  }
  document.addEventListener('click', function (e) {
    var kirim = e.target.closest && e.target.closest('#ya-kirim');
    if (!kirim || !onlineSiap || pakaiWA) return;          // tanpa HPP -> alur WhatsApp lama
    e.preventDefault(); e.stopImmediatePropagation();
    if (kirim.dataset.kirim) return;
    pesanError('');
    if (document.body.classList.contains('ya-tutup-pesan')) { pesanError('Pesan online sedang tutup. Lihat jam buka di atas.'); return; }
    var nama = (document.getElementById('ya-nama').value || '').trim();
    if (nama.length < 2) { pesanError('Isi nama kamu dulu, supaya kami bisa memanggil saat pesanan siap.'); document.getElementById('ya-nama').focus(); return; }
    var cart = {}; try { cart = JSON.parse(sessionStorage.getItem('yaPesanan')) || {}; } catch (er) {}
    var items = [], hilang = [];
    Object.keys(cart).forEach(function (n) { var k = kunciMenu[n.replace(/\s+/g, ' ').trim()]; if (k) items.push({ kunci: k, qty: cart[n].q }); else hilang.push(n); });
    if (hilang.length) { pesanError('Menu ini sudah tidak tersedia: ' + hilang.join(', ') + '. Hapus dulu dari pesanan atau muat ulang halaman.'); return; }
    if (!items.length) { pesanError('Pesanan masih kosong.'); return; }
    // Waktu ambil
    var w = document.getElementById('ya-waktu'), jamEl = document.getElementById('ya-jam'), now = menitWITA(), menit, teks;
    if (w.value === 'jam') {
      if (!jamEl.value) { pesanError('Pilih jam ambil dulu.'); jamEl.hidden = false; jamEl.focus(); return; }
      var p = jamEl.value.split(':'); menit = (+p[0]) * 60 + (+p[1]);
      if (menit < now) { pesanError('Jam ambil sudah lewat. Pilih jam setelah sekarang.'); jamEl.focus(); return; }
      teks = 'pukul ' + jamTeks(menit);
    } else {
      menit = now + (+w.value || 15);
      teks = (w.value === '15' ? 'secepatnya' : w.options[w.selectedIndex].text) + ', sekitar ' + jamTeks(menit);
    }
    // Jam ambil harus di dalam jam buka hari ini (misalnya Jumat 11.00-16.00 tidak bisa)
    var salahJam = cekJamAmbil(menit);
    if (salahJam) { pesanError(salahJam); if (w.value === 'jam') { jamEl.hidden = false; jamEl.focus(); } return; }
    var caraEl = document.querySelector('input[name="ya-cara"]:checked');
    var catatan = (document.getElementById('ya-catatan').value || '').trim();
    kirim.dataset.kirim = '1'; var label = kirim.textContent; kirim.textContent = 'Mengirim…';
    rpc('buat_pesanan', { p_nama: nama, p_cara: caraEl ? caraEl.value : 'Saya sendiri', p_ambil_menit: Math.min(menit, 1439), p_ambil_teks: teks, p_catatan: catatan, p_items: items, p_perangkat: perangkat() })
      .then(function (r) {
        var list = lsGet(LS_PESANAN, []); list.push({ id: r.id, kode: r.kode, at: Date.now() }); lsSet(LS_PESANAN, list);
        document.getElementById('ya-catatan').value = '';
        var kosong = document.getElementById('ya-kosongkan'); if (kosong) kosong.click();
        bukaStatus(r.id);
      })
      .catch(function (err) {
        if (err.server) { pesanError(err.message); return; }
        pakaiWA = true; kirim.textContent = 'Kirim lewat WhatsApp'; kirim.setAttribute('target', '_blank');
        pesanError('Koneksi ke kasir gagal. Kamu tetap bisa mengirim pesanan lewat WhatsApp: ketuk tombol di bawah.');
      })
      .then(function () { delete kirim.dataset.kirim; if (!pakaiWA && kirim.textContent === 'Mengirim…') kirim.textContent = label; });
  }, true);

  /* ---------- 6. Layar status pesanan untuk pelanggan ---------- */
  var gaya = document.createElement('style');
  gaya.textContent =
    '.yo-latar{position:fixed;inset:0;z-index:9999;background:rgba(40,25,15,.45);display:flex;align-items:flex-end;justify-content:center}' +
    '.yo-kartu{background:#fffdf9;color:#3a2a1d;width:100%;max-width:460px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom,0px));font-family:inherit;box-shadow:0 -10px 30px rgba(0,0,0,.2)}' +
    '@media (min-width:600px){.yo-latar{align-items:center}.yo-kartu{border-radius:20px}}' +
    '.yo-kode{font-family:"Cormorant Garamond",Georgia,serif;font-size:46px;font-weight:700;line-height:1;color:#9a5b25;margin:4px 0 2px}' +
    '.yo-status{display:inline-block;border-radius:999px;padding:5px 12px;font-weight:600;font-size:14px;margin:10px 0}' +
    '.yo-s-menunggu{background:#fbecc9;color:#7a5200}.yo-s-diterima{background:#f3e7da;color:#7a4519}.yo-s-siap,.yo-s-selesai{background:#dcefe2;color:#23633b}.yo-s-ditolak,.yo-s-batal{background:#f8dcd7;color:#8f2d22}' +
    '.yo-kartu ul{padding-left:18px;margin:8px 0}.yo-kartu p{margin:6px 0;line-height:1.5}' +
    '.yo-aksi{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.yo-aksi button{flex:1;min-width:120px;border-radius:12px;padding:12px;font:inherit;font-weight:600;cursor:pointer;border:1px solid #e6dccf;background:#fff}' +
    '.yo-aksi .yo-utama{background:#9a5b25;color:#fff;border-color:#9a5b25}' +
    '.yo-chip{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:9998;background:#9a5b25;color:#fff;border:0;border-radius:999px;padding:11px 18px;font:inherit;font-weight:600;box-shadow:0 6px 20px rgba(0,0,0,.25);cursor:pointer}';
  document.head.appendChild(gaya);

  var STATUS = {
    menunggu: ['Menunggu konfirmasi', 'Pesananmu sudah masuk ke kasir. Tunggu sebentar, kami cek dulu ya.'],
    diterima: ['Diterima', 'Pesananmu kami buat menjelang jam ambil. Sebutkan kode ini di kasir, lalu bayar di sana.'],
    siap: ['Siap diambil', 'Pesananmu sudah siap. Sebutkan kode ini di kasir dan bayar di sana.'],
    selesai: ['Selesai', 'Terima kasih sudah memesan di YA Coffee & Cake!'],
    ditolak: ['Tidak bisa diproses', ''],
    batal: ['Dibatalkan', '']
  };
  var timerStatus = null, idAktif = null;
  function tutupStatus() { var l = document.querySelector('.yo-latar'); if (l) l.remove(); clearInterval(timerStatus); idAktif = null; document.body.style.overflow = ''; gambarChip(); }
  function bukaStatus(id) {
    tutupStatus(); idAktif = id;
    var lembar = document.getElementById('ya-lembar'); if (lembar && !lembar.hidden) { lembar.hidden = true; }
    var latar = document.createElement('div'); latar.className = 'yo-latar';
    latar.innerHTML = '<div class="yo-kartu" role="dialog" aria-modal="true" aria-label="Status pesanan"><p style="color:#7a6553">Memuat pesanan…</p></div>';
    latar.addEventListener('click', function (e) { if (e.target === latar) tutupStatus(); });
    document.body.appendChild(latar); document.body.style.overflow = 'hidden';
    muatStatus(); timerStatus = setInterval(muatStatus, 10000);
  }
  function muatStatus() {
    var id = idAktif; if (!id) return;
    rpc('status_pesanan', { p_id: id }).then(function (s) {
      var kartu = document.querySelector('.yo-latar .yo-kartu'); if (!kartu || id !== idAktif) return;
      if (!s) { kartu.innerHTML = '<p>Pesanan tidak ditemukan.</p><div class="yo-aksi"><button type="button" data-yo="tutup">Tutup</button></div>'; hapusPesanan(id); return; }
      var st = STATUS[s.status] || [s.status, ''];
      var akhir = ['selesai', 'ditolak', 'batal'].indexOf(s.status) >= 0;
      kartu.innerHTML =
        '<div style="font-size:13px;color:#7a6553">Kode pesanan</div><div class="yo-kode">' + s.kode + '</div>' +
        '<div style="color:#7a6553">atas nama <b style="color:#3a2a1d"></b> · ambil ' + (s.ambil_teks || 'secepatnya') + '</div>' +
        '<span class="yo-status yo-s-' + s.status + '">' + st[0] + '</span>' +
        '<p class="yo-ket"></p>' +
        '<ul>' + (s.items || []).map(function (i) { return '<li>' + i.qty + '× <span></span></li>'; }).join('') + '</ul>' +
        '<p><b>Total ' + rp(s.total) + '</b> · bayar di kasir</p>' +
        (s.status === 'menunggu' && s.tunggu_menit >= 5 && YA_SOSMED.whatsapp
          ? '<p style="background:#fbecc9;color:#7a5200;border-radius:12px;padding:10px 12px">Kasir belum menjawab. Kamu bisa menghubungi kami lewat WhatsApp. Kalau tidak dijawab dalam ' + (+s.batas_menit || 20) + ' menit, pesanan dibatalkan otomatis.</p><div class="yo-aksi"><a class="yo-ulasan" href="' + YA_SOSMED.whatsapp + '?text=' + encodeURIComponent('Halo YA Coffee & Cake, pesanan online saya ' + s.kode + ' atas nama ' + s.nama + ' belum dijawab.') + '" target="_blank" rel="noopener" style="flex:1;text-align:center;border-radius:12px;padding:12px">Hubungi lewat WhatsApp</a></div>' : '') +
        (s.status === 'selesai' && YA_ULASAN ? '<p style="margin-top:10px">Suka dengan pesananmu? Bantu kami dengan memberi bintang di Google.</p><div class="yo-aksi"><a class="yo-ulasan" href="' + YA_ULASAN + '" target="_blank" rel="noopener" style="flex:1;text-align:center;border-radius:12px;padding:12px">★ Beri ulasan di Google</a></div>' : '') +
        '<div class="yo-aksi">' + (s.status === 'menunggu' ? '<button type="button" data-yo="batal">Batalkan pesanan</button>' : '') +
        '<button type="button" class="yo-utama" data-yo="tutup">' + (akhir ? 'Tutup' : 'Kembali ke menu') + '</button></div>';
      kartu.querySelector('b').textContent = s.nama;
      kartu.querySelector('.yo-ket').textContent = (s.status === 'ditolak' || s.status === 'batal') ? (s.alasan || 'Maaf, pesanan ini tidak bisa kami proses').replace(/[.!\s]*$/, '.') + ' Silakan pesan langsung di kedai.' : st[1];
      kartu.querySelectorAll('ul li span').forEach(function (sp, i) { sp.textContent = s.items[i].nama; });
      if (akhir) { clearInterval(timerStatus); hapusPesanan(id, true); }
    }).catch(function () {});
  }
  function hapusPesanan(id, tunda) {
    var list = lsGet(LS_PESANAN, []).filter(function (x) { return x.id !== id || (tunda && Date.now() - x.at < 5 * 60000); });
    lsSet(LS_PESANAN, list);
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-yo]'); if (!b) return;
    if (b.dataset.yo === 'tutup') tutupStatus();
    if (b.dataset.yo === 'batal' && idAktif && confirm('Batalkan pesanan ini?')) rpc('batalkan_pesanan_saya', { p_id: idAktif, p_perangkat: perangkat() }).then(muatStatus).catch(muatStatus);
    if (b.dataset.yo === 'buka') { var l = lsGet(LS_PESANAN, []); if (l.length) bukaStatus(l[l.length - 1].id); }
  });
  // Tombol kecil "Pesanan YA-3" kalau pelanggan menutup layar status / membuka halaman lagi
  function gambarChip() {
    var lama = document.querySelector('.yo-chip'); if (lama) lama.remove();
    var list = lsGet(LS_PESANAN, []).filter(function (x) { return Date.now() - x.at < 12 * 3600000; });
    lsSet(LS_PESANAN, list);
    if (!list.length || idAktif) return;
    var c = document.createElement('button'); c.type = 'button'; c.className = 'yo-chip'; c.dataset.yo = 'buka';
    c.textContent = 'Lihat pesanan ' + list[list.length - 1].kode;
    document.body.appendChild(c);
  }
  document.addEventListener('DOMContentLoaded', gambarChip);
})();
