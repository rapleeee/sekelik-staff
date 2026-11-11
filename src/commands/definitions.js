import { ApplicationCommandType, ContextMenuCommandBuilder, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const admin = PermissionFlagsBits.ManageGuild;
const moderator = PermissionFlagsBits.ModerateMembers;

function addSetupOptions(builder) {
  return builder
    .addChannelOption((o) => o.setName('welcome').setDescription('Channel sambutan.').setRequired(true))
    .addChannelOption((o) => o.setName('rules').setDescription('Channel aturan (opsional).'))
    .addChannelOption((o) => o.setName('perkenalan').setDescription('Channel perkenalan (opsional).'))
    .addChannelOption((o) => o.setName('log').setDescription('Channel log moderator (opsional).'))
    .addRoleOption((o) => o.setName('role').setDescription('Role otomatis opsional.'))
    .addStringOption((o) => o.setName('template').setDescription('Template sambutan: {user}, {server} (\\n untuk baris baru).'))
    .addStringOption((o) => o.setName('judul').setDescription('Judul embed sambutan (boleh pakai {server}).'));
}

function addRolePickerOptions(subcommand) {
  subcommand
    .addChannelOption((o) => o.setName('channel').setDescription('Channel tujuan panel role.').setRequired(true))
    .addRoleOption((o) => o.setName('role-1').setDescription('Role ke-1 pada panel.').setRequired(true))
    .addStringOption((o) => o.setName('mode').setDescription('Mode pilihan role (default: multi-pilihan).')
      .addChoices({ name: 'Multi-pilihan (banyak role)', value: 'multi' }, { name: 'Satu pilihan (maksimal 1 role)', value: 'single' }))
    .addStringOption((o) => o.setName('judul').setDescription('Judul panel role opsional.'))
    .addStringOption((o) => o.setName('deskripsi').setDescription('Deskripsi panel role opsional (\\n untuk baris baru).'))
    .addStringOption((o) => o.setName('placeholder').setDescription('Teks placeholder menu role opsional.'))
    .addStringOption((o) => o.setName('warna').setDescription('Warna hex embed, contoh #5865f2.'));
  for (let i = 2; i <= 10; i++) {
    subcommand.addRoleOption((o) => o.setName(`role-${i}`).setDescription(`Role ke-${i} pada panel.`));
  }
  return subcommand;
}

export const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Menampilkan panduan singkat bot untuk server ini.'),
  addSetupOptions(new SlashCommandBuilder().setName('setup').setDescription('Mengatur bot untuk server ini.').setDefaultMemberPermissions(admin)),
  new SlashCommandBuilder().setName('welcome').setDescription('Mengatur pesan sambutan.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => addSetupOptions(s.setName('setup').setDescription('Mengatur channel sambutan.')))
    .addSubcommand((s) => s.setName('test').setDescription('Menguji sambutan untuk Anda.')),
  new SlashCommandBuilder().setName('rules').setDescription('Mengirim atau mengatur aturan server.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('publish').setDescription('Mengirim embed aturan ke channel yang dipilih.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel tujuan aturan.').setRequired(true))
      .addStringOption((o) => o.setName('preset').setDescription('Template siap pakai atau aturan tersimpan.')
        .addChoices(
          { name: 'Aturan tersimpan server ini', value: 'saved' },
          { name: 'Umum / Netral', value: 'general' },
          { name: 'Komunitas Belajar', value: 'learning' },
          { name: 'Server Roleplay', value: 'roleplay' }
        ))
      .addBooleanOption((o) => o.setName('edit').setDescription('Buka editor pop-up sebelum mengirim aturan.'))),
  new SlashCommandBuilder().setName('verify').setDescription('Mengatur verifikasi anggota.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('setup').setDescription('Mengirim tombol verifikasi anggota.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel verifikasi.').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role setelah verifikasi, misalnya Member atau Warga.').setRequired(true))
      .addStringOption((o) => o.setName('judul').setDescription('Judul embed verifikasi opsional.'))
      .addStringOption((o) => o.setName('deskripsi').setDescription('Deskripsi opsional ({server}, {role}, \\n untuk baris baru).'))
      .addStringOption((o) => o.setName('tombol').setDescription('Label tombol verifikasi opsional.'))
      .addStringOption((o) => o.setName('footer').setDescription('Teks footer opsional.'))
      .addStringOption((o) => o.setName('warna').setDescription('Warna hex embed, contoh #5865f2.'))),
  new SlashCommandBuilder().setName('roles').setDescription('Mengatur panel ambil role.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => addRolePickerOptions(s.setName('setup').setDescription('Mengirim panel pilih role ke channel pilihan.'))),
  new SlashCommandBuilder().setName('ticket').setDescription('Mengatur panel tiket bantuan.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('setup').setDescription('Mengirim panel tombol tiket bantuan.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel panel tiket.').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role pendamping, misalnya Staff atau Mentor.').setRequired(true))
      .addStringOption((o) => o.setName('judul').setDescription('Judul panel tiket opsional.'))
      .addStringOption((o) => o.setName('deskripsi').setDescription('Deskripsi panel tiket opsional (\\n untuk baris baru).'))
      .addStringOption((o) => o.setName('tombol').setDescription('Label tombol buat tiket opsional.'))
      .addStringOption((o) => o.setName('pesan-awal').setDescription('Pesan pembuka di channel tiket ({user}, {role}, \\n).'))
      .addStringOption((o) => o.setName('warna').setDescription('Warna hex embed, contoh #5865f2.'))),
  new SlashCommandBuilder().setName('automod').setDescription('Mengatur moderasi otomatis.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('status').setDescription('Melihat konfigurasi automod.'))
    .addSubcommand((s) => s.setName('toggle').setDescription('Mengaktifkan atau menonaktifkan automod.').addBooleanOption((o) => o.setName('aktif').setDescription('Status baru.').setRequired(true)))
    .addSubcommand((s) => s.setName('mode').setDescription('Memilih mode tindakan.').addStringOption((o) => o.setName('mode').setDescription('Mode.').setRequired(true).addChoices({ name: 'Progressive', value: 'progressive' }, { name: 'Strict', value: 'strict' })))
    .addSubcommand((s) => s.setName('dry-run').setDescription('Mengatur simulasi tanpa tindakan.').addBooleanOption((o) => o.setName('aktif').setDescription('Status simulasi.').setRequired(true)))
    .addSubcommand((s) => s.setName('invite').setDescription('Mengatur filter undangan Discord.').addBooleanOption((o) => o.setName('aktif').setDescription('Status filter.').setRequired(true)))
    .addSubcommand((s) => s.setName('threshold').setDescription('Mengubah ambang atau jendela waktu.').addStringOption((o) => o.setName('aturan').setDescription('Aturan.').setRequired(true).addChoices({ name: 'Jumlah flood', value: 'flood' }, { name: 'Jendela flood (detik)', value: 'flood-window' }, { name: 'Jumlah pesan berulang', value: 'repeat' }, { name: 'Jendela pesan berulang (detik)', value: 'repeat-window' }, { name: 'Jumlah mention', value: 'mention' }, { name: 'Cooldown insiden (detik)', value: 'cooldown' }, { name: 'Jendela eskalasi (jam)', value: 'incident-window' })).addIntegerOption((o) => o.setName('nilai').setDescription('Nilai baru (1-86400).').setRequired(true).setMinValue(1).setMaxValue(86_400)))
    .addSubcommand((s) => s.setName('whitelist').setDescription('Kelola pengecualian.').addStringOption((o) => o.setName('aksi').setDescription('Aksi.').setRequired(true).addChoices({ name: 'Tambah', value: 'add' }, { name: 'Hapus', value: 'remove' }, { name: 'Daftar', value: 'list' })).addStringOption((o) => o.setName('tipe').setDescription('Jenis.').setRequired(true).addChoices({ name: 'Pengguna', value: 'user' }, { name: 'Role', value: 'role' }, { name: 'Channel', value: 'channel' })).addStringOption((o) => o.setName('id').setDescription('ID pengguna, role, atau channel.')))
    .addSubcommand((s) => s.setName('domain').setDescription('Kelola domain terblokir.').addStringOption((o) => o.setName('aksi').setDescription('Aksi.').setRequired(true).addChoices({ name: 'Tambah', value: 'add' }, { name: 'Hapus', value: 'remove' }, { name: 'Daftar', value: 'list' })).addStringOption((o) => o.setName('domain').setDescription('Domain, misalnya contoh.com.'))),
  new SlashCommandBuilder().setName('warnings').setDescription('Melihat pelanggaran aktif anggota.').setDefaultMemberPermissions(moderator).addUserOption((o) => o.setName('anggota').setDescription('Anggota.').setRequired(true)),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('Menghapus pelanggaran aktif anggota.').setDefaultMemberPermissions(moderator).addUserOption((o) => o.setName('anggota').setDescription('Anggota.').setRequired(true)),
  new SlashCommandBuilder().setName('timeout').setDescription('Memberi timeout manual.').setDefaultMemberPermissions(moderator).addUserOption((o) => o.setName('anggota').setDescription('Anggota.').setRequired(true)).addIntegerOption((o) => o.setName('menit').setDescription('1 hingga 40320 menit.').setRequired(true).setMinValue(1).setMaxValue(40_320)).addStringOption((o) => o.setName('alasan').setDescription('Alasan.').setRequired(true)),
  new SlashCommandBuilder().setName('ban').setDescription('Mem-ban anggota.').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addUserOption((o) => o.setName('anggota').setDescription('Anggota.').setRequired(true)).addStringOption((o) => o.setName('alasan').setDescription('Alasan.').setRequired(true)),
  new SlashCommandBuilder().setName('unban').setDescription('Mencabut ban berdasarkan ID pengguna.').setDefaultMemberPermissions(PermissionFlagsBits.BanMembers).addStringOption((o) => o.setName('id-pengguna').setDescription('ID pengguna Discord.').setRequired(true)).addStringOption((o) => o.setName('alasan').setDescription('Alasan.').setRequired(true)),
  new SlashCommandBuilder().setName('purge').setDescription('Menghapus 1-100 pesan terbaru.').setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages).addIntegerOption((o) => o.setName('jumlah').setDescription('Jumlah pesan (1-100).').setRequired(true).setMinValue(1).setMaxValue(100))
  ,
  new ContextMenuCommandBuilder().setName('Laporkan Pesan').setType(ApplicationCommandType.Message)
].map((command) => command.setContexts(InteractionContextType.Guild).toJSON());
