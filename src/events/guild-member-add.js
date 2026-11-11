import { EmbedBuilder } from 'discord.js';
import { normalizeMultiline } from '../services/rules-presets.js';

/** Builds the welcome embed used for both real member joins and `/welcome test`. */
export function buildWelcomeEmbed({ guildName, userId, username, avatarUrl, welcomeTitle, welcomeTemplate, links = '' }) {
  const title = (welcomeTitle || 'Selamat datang di {server}!')
    .replaceAll('{server}', guildName)
    .replaceAll('{user}', username)
    .slice(0, 256);
  const description = normalizeMultiline(welcomeTemplate)
    .replaceAll('{user}', `<@${userId}>`)
    .replaceAll('{server}', guildName);
  const fullDescription = [description, links].filter(Boolean).join('\n\n').slice(0, 4096);
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(fullDescription)
    .setThumbnail(avatarUrl)
    .setTimestamp();
}

export function createGuildMemberAddHandler(settingsService) {
  return async (member) => {
    if (!settingsService.has(member.guild.id)) {
      console.warn(`Sambutan dilewati di ${member.guild.name}: server belum dikonfigurasi. Jalankan /setup.`);
      return;
    }
    const settings = settingsService.get(member.guild.id);
    console.log(`Anggota baru terdeteksi: ${member.user.tag} (${member.id}) di ${member.guild.name} (${member.guild.id}).`);
    if (settings.autoRoleId) {
      const role = await member.guild.roles.fetch(settings.autoRoleId).catch(() => null);
      if (!role) console.warn(`Role otomatis ${settings.autoRoleId} di ${member.guild.name} sudah tidak ditemukan. Jalankan /setup kembali.`);
      else if (!role.editable) console.warn(`Role otomatis ${role.name} di ${member.guild.name} tidak dapat dikelola bot. Periksa izin Manage Roles dan hierarki role.`);
      else await member.roles.add(role, 'Role sambutan otomatis').catch((error) => console.error('Gagal menambah role sambutan:', error.message));
    }
    if (!settings.welcomeChannelId) {
      console.warn(`Sambutan dilewati di ${member.guild.name}: channel welcome belum dikonfigurasi.`);
      return;
    }
    const channel = await member.guild.channels.fetch(settings.welcomeChannelId).catch(() => null);
    if (!channel?.isTextBased()) {
      console.warn(`Sambutan dilewati di ${member.guild.name}: channel ${settings.welcomeChannelId} tidak ditemukan atau bukan channel teks.`);
      return;
    }
    const rulesChannel = settings.rulesChannelId ? await member.guild.channels.fetch(settings.rulesChannelId).catch(() => null) : null;
    const introductionChannel = settings.introductionChannelId ? await member.guild.channels.fetch(settings.introductionChannelId).catch(() => null) : null;
    if (settings.rulesChannelId && !rulesChannel) console.warn(`Channel aturan ${settings.rulesChannelId} di ${member.guild.name} sudah tidak ditemukan. Jalankan /setup kembali.`);
    if (settings.introductionChannelId && !introductionChannel) console.warn(`Channel perkenalan ${settings.introductionChannelId} di ${member.guild.name} sudah tidak ditemukan. Jalankan /setup kembali.`);
    const links = [
      rulesChannel && `Baca aturan di <#${rulesChannel.id}>.`,
      introductionChannel && `Berkenalan di <#${introductionChannel.id}>.`
    ].filter(Boolean).join('\n');
    try {
      await channel.send({
        embeds: [buildWelcomeEmbed({
          guildName: member.guild.name,
          userId: member.id,
          username: member.user.username ?? member.user.tag,
          avatarUrl: member.user.displayAvatarURL(),
          welcomeTitle: settings.welcomeTitle,
          welcomeTemplate: settings.welcomeTemplate,
          links
        })],
        allowedMentions: { users: [member.id], roles: [], parse: [] }
      });
      console.log(`Sambutan dikirim untuk ${member.user.tag} ke #${channel.name}.`);
    } catch (error) {
      console.error(`Gagal mengirim sambutan untuk ${member.user.tag} ke channel ${channel.id}:`, error.message);
    }
  };
}
