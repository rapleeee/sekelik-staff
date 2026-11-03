import { ApplicationCommandType, ContextMenuCommandBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

const admin = PermissionFlagsBits.ManageGuild;
const moderator = PermissionFlagsBits.ModerateMembers;

export const commands = [
  new SlashCommandBuilder().setName('help').setDescription('Menampilkan panduan singkat bot Sekelik Academy.'),
  new SlashCommandBuilder().setName('welcome').setDescription('Mengatur pesan sambutan.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('setup').setDescription('Mengatur channel sambutan.')
      .addChannelOption((o) => o.setName('welcome').setDescription('Channel sambutan.').setRequired(true))
      .addChannelOption((o) => o.setName('rules').setDescription('Channel aturan.').setRequired(true))
      .addChannelOption((o) => o.setName('perkenalan').setDescription('Channel perkenalan.').setRequired(true))
      .addChannelOption((o) => o.setName('log').setDescription('Channel log moderator.'))
      .addRoleOption((o) => o.setName('role').setDescription('Role otomatis opsional.'))
      .addStringOption((o) => o.setName('template').setDescription('Template: {user}, {server}.')))
    .addSubcommand((s) => s.setName('test').setDescription('Menguji sambutan untuk Anda.')),
  new SlashCommandBuilder().setName('rules').setDescription('Mengirim embed aturan komunitas.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('publish').setDescription('Mengirim aturan ke channel yang dipilih.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel tujuan aturan.').setRequired(true))),
  new SlashCommandBuilder().setName('verify').setDescription('Mengatur verifikasi anggota.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('setup').setDescription('Mengirim tombol verifikasi anggota.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel verifikasi.').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role setelah verifikasi, misalnya Murid.').setRequired(true))),
  new SlashCommandBuilder().setName('roles').setDescription('Mengatur picker role minat.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('setup').setDescription('Mengirim picker role minat multi-pilihan.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel tujuan picker.').setRequired(true))
      .addRoleOption((o) => o.setName('role-1').setDescription('Role minat pertama.').setRequired(true))
      .addRoleOption((o) => o.setName('role-2').setDescription('Role minat kedua.'))
      .addRoleOption((o) => o.setName('role-3').setDescription('Role minat ketiga.'))
      .addRoleOption((o) => o.setName('role-4').setDescription('Role minat keempat.'))
      .addRoleOption((o) => o.setName('role-5').setDescription('Role minat kelima.'))
      .addRoleOption((o) => o.setName('role-6').setDescription('Role minat keenam.'))),
  new SlashCommandBuilder().setName('ticket').setDescription('Mengatur panel tiket bantuan.').setDefaultMemberPermissions(admin)
    .addSubcommand((s) => s.setName('setup').setDescription('Mengirim panel tombol tiket bantuan.')
      .addChannelOption((o) => o.setName('channel').setDescription('Channel panel tiket.').setRequired(true))
      .addRoleOption((o) => o.setName('role').setDescription('Role pendamping, misalnya Mentor.').setRequired(true))),
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
].map((command) => command.toJSON());
