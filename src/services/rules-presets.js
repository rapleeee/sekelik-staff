import { EmbedBuilder } from 'discord.js';

export const DEFAULT_EMBED_COLOR = 0x5865f2;

export const RULES_PRESETS = Object.freeze({
  general: {
    title: '📜 Aturan {server}',
    body: [
      'Selamat datang di **{server}**! Agar seluruh anggota merasa nyaman, harap patuhi aturan berikut:',
      '',
      '**1. Saling menghormati**',
      'Gunakan bahasa yang sopan. Dilarang melakukan pelecehan, diskriminasi, intimidasi, provokasi, atau menyerang pribadi anggota lain.',
      '',
      '**2. Gunakan channel sesuai topiknya**',
      'Kirim pesan sesuai fungsi masing-masing channel agar diskusi tetap rapi dan nyaman diikuti.',
      '',
      '**3. Dilarang spam & promosi tanpa izin**',
      'Jangan mengirim pesan berulang, flood, mention berlebihan, tautan berbahaya, atau undangan server lain tanpa izin pengelola.',
      '',
      '**4. Jaga privasi & keamanan**',
      'Jangan menyebarkan data pribadi, token, kata sandi, atau percakapan privat tanpa izin pihak terkait.',
      '',
      '**5. Ikuti arahan staff/moderator**',
      'Keputusan moderator dibuat untuk menjaga ketertiban server. Jika ada kendala, hubungi staff atau gunakan sistem tiket/laporan.'
    ].join('\n'),
    footer: 'Dengan tetap berada di {server}, kamu setuju menaati aturan ini.',
    color: '#5865f2'
  },
  learning: {
    title: '📜 Aturan {server}',
    body: [
      'Selamat datang di komunitas belajar **{server}**! Ruang ini dibuat agar semua orang dapat belajar, bertanya, dan berkembang bersama dengan nyaman:',
      '',
      '**1. Saling menghormati**',
      'Gunakan bahasa yang sopan. Dilarang melakukan pelecehan, diskriminasi, intimidasi, provokasi, atau menyerang pribadi anggota lain.',
      '',
      '**2. Jaga topik channel**',
      'Kirim pesan sesuai fungsi channel. Gunakan channel perkenalan untuk menyapa, channel diskusi untuk belajar, dan hindari percakapan yang mengganggu pembahasan.',
      '',
      '**3. Jangan spam**',
      'Jangan mengirim pesan berulang, flood, mention berlebihan, promosi tanpa izin, atau undangan server lain. Bagikan link materi belajar hanya jika relevan.',
      '',
      '**4. Hargai karya dan privasi**',
      'Cantumkan sumber saat membagikan karya atau materi. Jangan menyebarkan data pribadi, token, password, atau isi percakapan privat tanpa izin.',
      '',
      '**5. Bertanya dan berdiskusi dengan baik**',
      'Jelaskan konteks saat bertanya, tunjukkan usaha yang sudah dilakukan, dan bantu anggota lain dengan jawaban yang membangun.',
      '',
      '**6. Ikuti arahan moderator**',
      'Moderator dapat menghapus pesan atau mengambil tindakan untuk menjaga komunitas. Jika ada masalah, hubungi moderator secara privat.'
    ].join('\n'),
    footer: 'Mari belajar, berkarya, dan bertumbuh bersama.',
    color: '#5865f2'
  },
  roleplay: {
    title: '🎭 Aturan {server}',
    body: [
      'Selamat datang di **{server}**! Seluruh pemain wajib memahami dan mematuhi aturan roleplay berikut:',
      '',
      '**1. Hormati sesama pemain (OOC)**',
      'Pisahkan urusan In-Character (IC) dan Out-of-Character (OOC). Dilarang membawa konflik karakter ke ranah pribadi, toxic, SARA, atau pelecehan.',
      '',
      '**2. Dilarang Metagaming & Powergaming**',
      'Jangan menggunakan informasi OOC (stream, Discord, dll.) untuk keuntungan IC, dan jangan memaksakan aksi tidak masuk akal tanpa memberi kesempatan lawan RP.',
      '',
      '**3. Patuhi FearRP, NLR & larangan RDM/VDM**',
      'Hargai nyawa karaktermu saat terancam (FearRP), patuhi New Life Rule setelah karakter tumbang, serta dilarang menyerang/menabrak tanpa alasan RP yang jelas (RDM/VDM).',
      '',
      '**4. Jaga kualitas & alur roleplay**',
      'Hindari fail RP, combat logging (keluar saat situasi RP berlangsung), dan gunakan channel IC/OOC sesuai peruntukannya.',
      '',
      '**5. Ikuti arahan Admin/Staff**',
      'Jika terjadi pelanggaran atau kendala RP, selesaikan melalui laporan atau tiket—jangan memutus alur RP dengan berdebat di OOC.'
    ].join('\n'),
    footer: 'Jaga sportivitas dan selamat ber-roleplay di {server}!',
    color: '#e67e22'
  }
});

/** Parses a 6-digit hex color string into a Discord color integer. */
export function parseHexColor(raw, fallback = DEFAULT_EMBED_COLOR) {
  if (!raw || !raw.trim()) return fallback;
  const normalized = raw.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) {
    throw new Error('Format warna hex tidak valid. Gunakan format 6 digit seperti #5865f2.');
  }
  return Number.parseInt(normalized, 16);
}

/** Converts escaped `\n` sequences in slash command string options into newlines. */
export function normalizeMultiline(text) {
  return text.replaceAll('\\n', '\n');
}

/** Resolves initial rules draft values for a preset or saved guild configuration. */
export function resolveRulesDraft({ preset, savedRules }) {
  if (preset === 'saved') {
    if (!savedRules) {
      throw new Error('Server ini belum memiliki aturan tersimpan. Jalankan `/rules publish` tanpa preset untuk menulis aturan baru.');
    }
    return savedRules;
  }
  if (preset && RULES_PRESETS[preset]) {
    return RULES_PRESETS[preset];
  }
  return savedRules || RULES_PRESETS.general;
}

/** Builds a Discord rules embed from a guild's rules configuration. */
export function buildRulesEmbed({ guildName, rules }) {
  const colorInt = parseHexColor(rules.color, DEFAULT_EMBED_COLOR);
  const title = rules.title.replaceAll('{server}', guildName).slice(0, 256);
  const description = rules.body.replaceAll('{server}', guildName).slice(0, 4096);
  const embed = new EmbedBuilder()
    .setColor(colorInt)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
  const footer = rules.footer?.trim().replaceAll('{server}', guildName).slice(0, 2048);
  if (footer) embed.setFooter({ text: footer });
  return embed;
}

