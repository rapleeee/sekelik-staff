# Sekelik Academy Bot

Bot Discord resmi untuk sambutan anggota dan moderasi spam berbasis aturan. Bahasa dan konfigurasi dirancang untuk komunitas belajar IT. Bot ini **bukan self-bot**: gunakan akun bot resmi dari Discord Developer Portal.

## Fitur

- Embed sambutan dengan `{user}` dan `{server}`, channel aturan/perkenalan, serta role otomatis opsional.
- Deteksi flood (6/5 detik), pesan berulang (3/20 detik), 5 mention pengguna unik, domain terblokir, dan undangan Discord opsional.
- Penghitungan spam lintas channel dalam satu server, pemeriksaan pesan baru dan edit, whitelist pengguna/role/channel, cooldown 30 detik, dan cache yang dibatasi/bersih otomatis.
- Mode `progressive`, `strict`, dan `dry-run` (aktif secara default).
- SQLite persisten untuk konfigurasi, insiden, dan hasil tindakan.
- Slash command administrasi dan moderasi dengan validasi izin saat dijalankan.

## 1. Buat aplikasi dan bot

1. Buka [Discord Developer Portal](https://discord.com/developers/applications), pilih **New Application**, lalu beri nama `Sekelik Academy Bot`.
2. Buka menu **Bot**, pilih **Reset Token**, salin token sekali saja, dan jangan kirimkan token ke chat atau commit ke Git.
3. Pada **Privileged Gateway Intents**, aktifkan **Server Members Intent** (event anggota baru) dan **Message Content Intent** (membaca isi untuk automod).
4. Catat **Application ID** di menu **General Information** sebagai `DISCORD_CLIENT_ID`.

Intent di kode: `Guilds` untuk slash command, `GuildMembers` untuk sambutan/target moderasi, `GuildMessages` dan `MessageContent` untuk automod. Tanpa dua intent privileged di atas, fitur terkait tidak akan berjalan.

## 2. Undang bot dan atur role

Di **OAuth2 > URL Generator**, pilih scope `bot` dan `applications.commands`. Pilih izin minimal berikut sesuai fitur yang dipakai:

| Fitur | Izin bot |
|---|---|
| Sambutan, peringatan, log | View Channel, Send Messages, Embed Links |
| Hapus spam/purge | Manage Messages |
| Role sambutan | Manage Roles |
| Timeout | Moderate Members |
| Ban/unban | Ban Members |
| Membaca riwayat/pesan | Read Message History |

Tidak perlu memberikan `Administrator`. Letakkan role bot **di atas** role anggota yang akan diberi role, timeout, atau ban. Discord tidak mengizinkan bot memoderasi pemilik server maupun role setara/lebih tinggi.

## 3. Instal dan konfigurasikan

Prasyarat: Node.js **24.17.0 atau lebih baru** (sesuai [dokumentasi discord.js](https://discord.js.org/docs/packages/discord.js/main)).

```bash
cp .env.example .env
npm install
```

Isi `.env` secara lokal:

```dotenv
DISCORD_TOKEN=token_bot_anda
DISCORD_CLIENT_ID=id_aplikasi_anda
# Isi saat pengembangan agar command langsung tersedia di satu server percobaan.
DISCORD_GUILD_ID=id_server_percobaan_anda
DATABASE_PATH=./data/sekelik-academy.sqlite
```

`data/` dan `.env` sudah diabaikan Git. Startup akan menolak berjalan bila token atau client ID kosong dengan pesan yang jelas.

## 4. Daftarkan command dan jalankan

```bash
npm run register
npm start
# saat pengembangan:
npm run dev
```

Jika `DISCORD_GUILD_ID` terisi, command didaftarkan ke server tersebut dan biasanya muncul cepat. Jika kosong, command global didaftarkan dan dapat membutuhkan waktu propagasi Discord. Jalankan **satu instance** bot untuk satu token/database; dua instance akan memproses event yang sama dan dapat menghasilkan tindakan ganda.

## 5. Konfigurasi awal yang aman

1. Buat channel `#welcome`, `#rules`, `#perkenalan`, dan privat `#moderation-log`.
2. Jalankan `/rules publish` dan pilih `#rules` untuk mengirim embed aturan komunitas bawaan.
3. Buat role `Murid`, lalu jalankan `/verify setup`; pilih channel verifikasi dan role tersebut. Anggota yang menekan tombol persetujuan akan menerima role `Murid`.
4. Buat role minat `Web Development`, `Mobile Development`, `UI/UX`, `Data/AI`, `Cyber Security`, dan `Job Seeker`. Jalankan `/roles setup`, pilih channel tujuan, lalu isi masing-masing role. Anggota dapat memilih beberapa minat dan mengubahnya kapan saja dari menu.
5. Buat role `Mentor`, lalu jalankan `/ticket setup`; pilih `#ticket-bantuan` dan role `Mentor`. Tombol panel membuat channel privat untuk pembuat tiket dan Mentor. Tiket dapat ditutup tanpa menghapus riwayat channel.
6. Jalankan `/welcome setup` lalu pilih ketiga channel dan channel log moderator; role otomatis dan template bersifat opsional. Template kustom wajib memuat `{user}` dan `{server}`.
7. Anggota dapat klik kanan pesan → **Apps** → **Laporkan Pesan**, memasukkan alasan, dan bot mengirim laporan tanpa mention ke channel log moderator.
8. Pastikan `/automod status` menampilkan `Dry-run: aktif`. Uji dahulu, lalu nonaktifkan simulasi hanya jika hasilnya benar: `/automod dry-run aktif:false`.
9. Gunakan `/automod domain` untuk menambah domain terblokir (contoh `malware.example`), bukan kata kunci URL. Subdomain domain tersebut juga cocok; `bukanmalware.example` tidak cocok. Aktifkan pemeriksaan undangan dengan `/automod invite aktif:true` bila diperlukan.
10. Gunakan `/automod whitelist` untuk pengecualian ID pengguna, role, atau channel.

`/automod mode mode:progressive` adalah default: insiden aktif pertama dalam 24 jam memperingatkan, kedua timeout 10 menit, ketiga ban. Ganti ke strict **setelah uji** dengan `/automod mode mode:strict`; semua pemicu langsung diban. Gunakan `/automod threshold` untuk menyesuaikan jumlah, jendela flood/berulang, cooldown, dan jendela eskalasi.

## Command

| Command | Fungsi |
|---|---|
| `/help` | Panduan singkat |
| `/welcome setup`, `/welcome test` | Konfigurasi dan uji sambutan |
| `/rules publish` | Mengirim embed aturan komunitas ke channel pilihan |
| `/verify setup` | Mengirim tombol persetujuan rules dan memberi role verifikasi |
| `/roles setup` | Mengirim menu multi-pilihan role minat |
| `/ticket setup` | Mengirim tombol tiket bantuan privat untuk anggota dan Mentor |
| Klik kanan pesan → Apps → `Laporkan Pesan` | Mengirim laporan pesan beserta alasan ke moderator |
| `/automod status`, `toggle`, `mode`, `dry-run`, `threshold`, `whitelist`, `domain` | Konfigurasi automod |
| `/warnings`, `/clearwarnings` | Tinjau/hapus pelanggaran aktif |
| `/timeout`, `/ban`, `/unban`, `/purge` | Moderasi manual |

`welcome`, `automod`, `rules`, `verify`, `roles`, dan `ticket` memerlukan **Manage Server**; warnings/timeout memerlukan **Moderate Members**; ban/unban memerlukan **Ban Members**; purge memerlukan **Manage Messages**. Izin ini diperiksa ulang saat command dijalankan. Untuk `/verify setup` dan `/roles setup`, bot membutuhkan **Manage Roles** dan role bot harus berada di atas role target. Untuk tiket, bot membutuhkan **Manage Channels** agar dapat membuat channel privat dan menutupnya. Timeout/ban juga memeriksa hierarki pelaksana dan kelayakan role bot. `/purge` dibatasi 1–100 pesan, dan Discord tidak menghapus massal pesan berusia lebih dari 14 hari.

## Skenario uji server percobaan

Mulai dengan dry-run aktif dan amati log/database:

1. Percakapan normal dan berbagi `https://discordjs.dev` atau dokumentasi GitHub: tidak terdeteksi.
2. Kirim tiga isi pesan sama dalam 20 detik: satu insiden `pesan-berulang`, tanpa hukuman karena dry-run.
3. Kirim enam pesan berbeda dalam lima detik di dua channel: satu insiden `flood` lintas channel.
4. Edit pesan menjadi `https://sub.domain-yang-diblokir.example/path`: insiden `domain-terblokir`.
5. Tambahkan akun/role/channel ke whitelist lalu ulangi: tidak ada insiden.
6. Cabut sementara Manage Messages atau Moderate Members dari bot, nonaktifkan dry-run, lalu picu aturan: bot mencatat status tindakan gagal/parsial; proses tidak crash dan tidak mengklaim tindakan berhasil.

Versi awal sengaja mengabaikan pesan bot lain dan webhook. Domain hanya diblokir jika administrator menambahkannya; bot tidak mengklaim URL sebagai phishing berdasarkan tebakan.

## Database dan operasi

Migrasi tabel dibuat otomatis pada startup di `DATABASE_PATH`. Seluruh query memakai parameter SQLite. Database mencatat ID insiden, pengguna/channel/waktu, aturan, cuplikan maksimal 300 karakter, jumlah aktif, pelaksana (`automod`/moderator), tindakan dicoba, serta status aktual berhasil/gagal/simulasi. Token tidak pernah dicatat.

Untuk menjalankan 24 jam di VPS, gunakan systemd (satu proses):

```ini
# /etc/systemd/system/sekelik-bot.service
[Unit]
Description=Sekelik Academy Discord Bot
After=network.target

[Service]
Type=simple
User=sekelik
WorkingDirectory=/opt/sekelik-academy-bot
EnvironmentFile=/opt/sekelik-academy-bot/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Salin proyek ke `/opt/sekelik-academy-bot`, pastikan `.env` dimiliki user `sekelik` dan hanya dapat dibaca user tersebut (`chmod 600 .env`), lalu jalankan:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sekelik-bot
sudo systemctl status sekelik-bot
journalctl -u sekelik-bot -f
```

Jangan juga menjalankan `npm start` secara manual ketika unit systemd aktif. Untuk memperbarui: hentikan service, deploy dependensi, lalu `sudo systemctl restart sekelik-bot`.

## Pengujian lokal

```bash
npm test
```

Suite menguji flood lintas channel, batas jendela pesan berulang, deduplikasi cooldown, kecocokan domain yang benar, pengecualian, dan pemilihan eskalasi. Pengujian koneksi Discord nyata tetap memerlukan token dan server percobaan Anda.
