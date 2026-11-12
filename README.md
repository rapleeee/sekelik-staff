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
# Opsional: server pertama/legacy untuk membersihkan pendaftaran command guild lama.
DISCORD_GUILD_ID=id_server_legacy_anda
DATABASE_PATH=./data/sekelik-academy.sqlite
# Opsional: token GitHub (read-only Contents) untuk memantau repo private lewat /changelog.
GITHUB_TOKEN=
# Opsional: interval cek commit GitHub dalam detik (minimal 30, default 120).
GITHUB_POLL_INTERVAL_SECONDS=120
```

`data/` dan `.env` sudah diabaikan Git. Startup akan menolak berjalan bila token atau client ID kosong dengan pesan yang jelas.

## 4. Daftarkan command dan jalankan

```bash
npm run register
npm start
# saat pengembangan:
npm run dev
```

Command selalu didaftarkan secara global ke aplikasi pada `DISCORD_CLIENT_ID`, sehingga satu bot dan satu proses dapat dipakai di beberapa server. `DISCORD_GUILD_ID` tidak lagi menjadi target pendaftaran; jika terisi, nilainya hanya dipakai untuk membaca dan membersihkan command guild lama **setelah** daftar global berhasil didaftarkan dan diverifikasi lewat API Discord. Command global dapat membutuhkan waktu untuk muncul di semua server. Jalankan **satu instance** bot untuk satu token/database; dua instance akan memproses event yang sama dan dapat menghasilkan tindakan ganda.

Menjalankan ulang bot tidak mendaftarkan slash command. Setiap perubahan definisi command harus diikuti `npm run register`, baru kemudian restart proses bot.

## 5. Konfigurasi awal yang aman

1. Buat channel sambutan, aturan, dan privat `#moderation-log` (channel perkenalan bersifat opsional).
2. Jalankan `/rules publish` dan pilih `#rules` untuk menulis/mengedit aturan server lewat pop-up modal (atau pilih `preset` siap pakai seperti `Umum / Netral`, `Komunitas Belajar`, atau `Server Roleplay`).
3. Buat role verifikasi (misalnya `Murid` atau `Warga`), lalu jalankan `/verify setup`; pilih channel verifikasi, role target, serta opsional judul/deskripsi/label tombol/warna. Anggota yang menekan tombol akan menerima role tersebut.
4. Buat role pilihan (misalnya role minat belajar atau fraksi/notifikasi roleplay). Jalankan `/roles setup`, pilih channel tujuan, mode (`multi-pilihan` atau `satu pilihan`), judul/deskripsi opsional, dan isi hingga 10 role. Anda dapat menjalankan `/roles setup` beberapa kali untuk membuat panel role yang berbeda dalam satu server.
5. Buat role pendamping (misalnya `Mentor` atau `Admin RP`), lalu jalankan `/ticket setup`; pilih `#ticket-bantuan`, role pendamping, dan kustomisasi teks/warna bila perlu. Tombol panel membuat channel privat untuk pembuat tiket dan role pendamping. Tiket dapat ditutup tanpa menghapus riwayat channel.
6. Jalankan `/setup` (atau alias lama `/welcome setup`) lalu pilih channel sambutan (wajib), serta opsional channel aturan, perkenalan, log moderator, auto-role, judul embed, dan template sambutan. Template kustom wajib memuat `{user}` dan `{server}`. Konfigurasi disimpan menggunakan ID server tempat command dijalankan.
7. Anggota dapat klik kanan pesan → **Apps** → **Laporkan Pesan**, memasukkan alasan, dan bot mengirim laporan tanpa mention ke channel log moderator.
8. Pastikan `/automod status` menampilkan `Dry-run: aktif`. Uji dahulu, lalu nonaktifkan simulasi hanya jika hasilnya benar: `/automod dry-run aktif:false`.
9. Gunakan `/automod domain` untuk menambah domain terblokir (contoh `malware.example`), bukan kata kunci URL. Subdomain domain tersebut juga cocok; `bukanmalware.example` tidak cocok. Aktifkan pemeriksaan undangan dengan `/automod invite aktif:true` bila diperlukan.
10. Gunakan `/automod whitelist` untuk pengecualian ID pengguna, role, atau channel.

`/automod mode mode:progressive` adalah default: insiden aktif pertama dalam 24 jam memperingatkan, kedua timeout 10 menit, ketiga ban. Ganti ke strict **setelah uji** dengan `/automod mode mode:strict`; semua pemicu langsung diban. Gunakan `/automod threshold` untuk menyesuaikan jumlah, jendela flood/berulang, cooldown, dan jendela eskalasi.

## Command

| Command | Fungsi |
|---|---|
| `/help` | Panduan singkat |
| `/setup`, `/welcome setup`, `/welcome test` | Konfigurasi server dan uji sambutan |
| `/rules publish` | Mengedit/mengirim embed aturan server lewat modal atau preset |
| `/verify setup` | Mengirim tombol verifikasi dan memberi role verifikasi (bisa dikustomisasi) |
| `/roles setup` | Mengirim panel ambil role (multi-pilihan atau satu pilihan, bisa banyak panel) |
| `/ticket setup` | Mengirim tombol tiket bantuan privat untuk anggota dan role pendamping |
| `/changelog add`, `list`, `check`, `test`, `toggle`, `remove` | Pengumuman update otomatis dari commit repository GitHub |
| Klik kanan pesan → Apps → `Laporkan Pesan` | Mengirim laporan pesan beserta alasan ke moderator |
| `/automod status`, `toggle`, `mode`, `dry-run`, `threshold`, `whitelist`, `domain` | Konfigurasi automod |
| `/warnings`, `/clearwarnings` | Tinjau/hapus pelanggaran aktif |
| `/timeout`, `/ban`, `/unban`, `/purge` | Moderasi manual |

`setup`, `welcome`, `automod`, `rules`, `verify`, `roles`, `ticket`, dan `changelog` memerlukan **Manage Server** (Administrator juga memenuhi izin ini); warnings/timeout memerlukan **Moderate Members**; ban/unban memerlukan **Ban Members**; purge memerlukan **Manage Messages**. Semua command dibatasi ke konteks server dan izin diperiksa ulang saat dijalankan. Untuk `/verify setup` dan `/roles setup`, bot membutuhkan **Manage Roles** dan role bot harus berada di atas role target. Untuk tiket, bot membutuhkan **Manage Channels** agar dapat membuat channel privat dan menutupnya. Timeout/ban juga memeriksa hierarki pelaksana dan kelayakan role bot. `/purge` dibatasi 1–100 pesan, dan Discord tidak menghapus massal pesan berusia lebih dari 14 hari.

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

Konfigurasi berada di tabel `guild_settings` dengan `guild_id` sebagai primary key; whitelist, insiden, tindakan moderasi, tiket, dan laporan juga menyimpan `guild_id`. Karena skema sebelumnya pada proyek ini sudah menggunakan kunci tersebut, konfigurasi server pertama tidak perlu dipindahkan dan tetap dipakai apa adanya. Server baru memperoleh barisnya sendiri ketika `/setup` dijalankan. Server tanpa konfigurasi tidak menjalankan sambutan atau automod dan `/help` akan mengarahkan administrator ke `/setup`.

### Migrasi command guild ke global dan uji dua server

1. Cadangkan file pada `DATABASE_PATH`, lalu deploy kode tanpa menghapus `.env` atau direktori `data/`.
2. Pertahankan `DISCORD_CLIENT_ID`, `DISCORD_TOKEN`, dan `DISCORD_GUILD_ID` lama. Jalankan `npm run register`; script memverifikasi command global, kemudian membersihkan command guild lama agar tidak muncul ganda.
3. Restart satu instance bot. Tunggu propagasi command global bila Discord belum langsung menampilkannya.
4. Di server pertama, jalankan `/welcome test` untuk memastikan konfigurasi lama masih menunjuk channel yang benar. Jalankan `/setup` hanya jika ingin memperbaruinya.
5. Di server kedua, jalankan `/setup` dengan channel dan role milik server kedua, lalu `/welcome test`.
6. Ubah konfigurasi salah satu server dan ulangi `/welcome test` di keduanya. Channel sambutan, log, role, whitelist, dan automod harus tetap berbeda.
7. Gunakan dua akun uji untuk memicu `GuildMemberAdd` pada masing-masing server dan pastikan sambutan masuk ke channel server terkait. Uji juga kondisi channel/role dihapus dan izin bot dicabut; bot harus memberi pesan atau log yang jelas tanpa berhenti.

Untuk menjalankan 24 jam di VPS, gunakan systemd (satu proses):

```ini
# /etc/systemd/system/sekelik-bot.service
[Unit]
Description=Sekelik Academy Discord Bot
After=network.target

[Service]
Type=simple
User=sekelikbot
WorkingDirectory=/opt/sekelik-academy-bot
EnvironmentFile=/opt/sekelik-academy-bot/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Salin proyek ke `/opt/sekelik-academy-bot`, pastikan seluruh aplikasi dimiliki user `sekelikbot`, lalu batasi `.env` agar hanya dapat dibaca user tersebut:

```bash
sudo chown -R sekelikbot:sekelikbot /opt/sekelik-academy-bot
sudo chmod 600 /opt/sekelik-academy-bot/.env
```

Kemudian jalankan:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sekelik-bot
sudo systemctl status sekelik-bot
journalctl -u sekelik-bot -f
```

Jangan menjalankan `npm start`, `npm ci`, atau `npm run register` sebagai user deployment `smkpesat` di `/opt/sekelik-academy-bot`. Direktori produksi dimiliki `sekelikbot`, sedangkan environment dari `EnvironmentFile` systemd tidak diwariskan ke shell interaktif.

Untuk deploy manual, jalankan dependency dan registrasi sebagai service user dari working directory aplikasi agar `dotenv` dapat membaca `.env`:

```bash
sudo -u sekelikbot -H sh -c 'cd /opt/sekelik-academy-bot && npm ci --omit=dev && npm run register'
sudo systemctl restart sekelik-bot
sudo systemctl status sekelik-bot --no-pager
sudo journalctl -u sekelik-bot -n 100 --no-pager
```

Untuk deploy melalui staging/CI, gunakan `sudo /usr/local/sbin/deploy-sekelik-bot`; script tersebut sudah mengatur ownership, menjalankan npm sebagai `sekelikbot`, mendaftarkan command, dan me-restart service.

### CI/CD GitHub Actions ke VM Proxmox

Workflow [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) menjalankan `npm test` pada pull request dan setiap push. Push ke branch `master` yang lulus pengujian akan menyalin source ke VM lewat SSH, mempertahankan `.env` dan `data/`, memasang dependency produksi, mendaftarkan command, lalu me-restart service.

Persiapan satu kali di VM sebagai user administrator (contoh deployment user: `smkpesat`):

```bash
sudo install -d -m 700 -o smkpesat -g smkpesat /home/smkpesat/sekelik-deploy
sudo install -m 750 -o root -g root \
  /opt/sekelik-academy-bot/deploy/proxmox/deploy-sekelik-bot \
  /usr/local/sbin/deploy-sekelik-bot
sudo tee /etc/sudoers.d/sekelik-deploy > /dev/null <<'EOF'
smkpesat ALL=(root) NOPASSWD: /usr/local/sbin/deploy-sekelik-bot
EOF
sudo chmod 440 /etc/sudoers.d/sekelik-deploy
sudo visudo -cf /etc/sudoers.d/sekelik-deploy
```

Jika username SSH bukan `smkpesat`, ubah `STAGING` pada script `deploy/proxmox/deploy-sekelik-bot` dan baris sudoers agar sesuai sebelum memasangnya.

Tambahkan GitHub Actions secrets berikut di **Repository Settings → Secrets and variables → Actions**:

| Secret | Nilai |
|---|---|
| `DEPLOY_HOST` | IP atau hostname VM |
| `DEPLOY_USER` | User SSH deployment, contoh `smkpesat` |
| `DEPLOY_PORT` | Port SSH publik VM; kosongkan atau isi `22` bila memakai port standar |
| `DEPLOY_SSH_KEY` | Private key SSH khusus deployment |
| `DEPLOY_KNOWN_HOSTS` | Baris host key VM dari `ssh-keyscan -H IP_VM` yang diverifikasi |

Buat pasangan key khusus deployment pada komputer tepercaya, lalu tambahkan public key ke `/home/smkpesat/.ssh/authorized_keys` di VM:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/sekelik_github_deploy -C "github-actions-sekelik"
ssh-copy-id -i ~/.ssh/sekelik_github_deploy.pub smkpesat@IP_VM
ssh-keyscan -H IP_VM
```

Simpan isi file private key `~/.ssh/sekelik_github_deploy` sebagai `DEPLOY_SSH_KEY`; simpan output `ssh-keyscan` yang sudah Anda verifikasi sebagai `DEPLOY_KNOWN_HOSTS`. Jangan menyimpan private key, token Discord, `.env`, atau `data/` di GitHub.

GitHub-hosted Actions harus dapat mencapai port SSH VM dari internet. Jika VM berada di jaringan privat Proxmox, buat port forwarding pada router/firewall dari port publik ke port `22` VM, lalu isi port publik itu sebagai `DEPLOY_PORT`. Untuk port kustom, gunakan `ssh-copy-id -p PORT ...` dan `ssh-keyscan -p PORT -H IP_VM`.

## Pengujian lokal

```bash
npm test
```

Suite menguji flood lintas channel, batas jendela pesan berulang, deduplikasi cooldown, kecocokan domain yang benar, pengecualian, dan pemilihan eskalasi. Pengujian koneksi Discord nyata tetap memerlukan token dan server percobaan Anda.
