import { EmbedBuilder } from 'discord.js';

export function createGuildMemberAddHandler(settingsService) {
  return async (member) => {
    const settings = settingsService.get(member.guild.id);
    if (settings.autoRoleId) {
      const role = member.guild.roles.cache.get(settings.autoRoleId);
      if (role && member.manageable) await member.roles.add(role, 'Role sambutan Sekelik Academy').catch((error) => console.error('Gagal menambah role sambutan:', error.message));
    }
    if (!settings.welcomeChannelId) return;
    const channel = await member.guild.channels.fetch(settings.welcomeChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;
    const description = settings.welcomeTemplate.replaceAll('{user}', `<@${member.id}>`).replaceAll('{server}', member.guild.name);
    const links = [
      settings.rulesChannelId && `Baca aturan di <#${settings.rulesChannelId}>.`,
      settings.introductionChannelId && `Berkenalan di <#${settings.introductionChannelId}>.`
    ].filter(Boolean).join('\n');
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Selamat datang di ${member.guild.name}!`).setDescription(`${description}\n\n${links}`).setThumbnail(member.user.displayAvatarURL()).setTimestamp()], allowedMentions: { users: [member.id], roles: [], parse: [] } })
      .catch((error) => console.error('Gagal mengirim sambutan:', error.message));
  };
}
