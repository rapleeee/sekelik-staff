import { PermissionFlagsBits } from 'discord.js';

const ACTION_LABELS = { warn: 'peringatan', timeout: 'timeout 10 menit', ban: 'ban' };
const excerpt = (text) => text.replace(/\s+/g, ' ').slice(0, 300);

export function chooseAction({ mode, dryRun, activeIncidents }) {
  const action = mode === 'strict' ? 'ban' : activeIncidents === 0 ? 'warn' : activeIncidents === 1 ? 'timeout' : 'ban';
  return { action, dryRun };
}

export class ModerationService {
  constructor({ db, settings, detector }) {
    this.db = db; this.settings = settings; this.detector = detector;
  }
  isExempt(message) {
    const guildId = message.guild.id;
    if (message.author.id === message.guild.ownerId) return true;
    if (this.settings.listExemptions(guildId, 'user').includes(message.author.id)) return true;
    if (this.settings.listExemptions(guildId, 'channel').includes(message.channel.id)) return true;
    const roles = this.settings.listExemptions(guildId, 'role');
    return message.member?.roles.cache.some((role) => roles.includes(role.id)) ?? false;
  }
  async inspect(message) {
    if (!message.guild || message.author.bot || message.webhookId) return;
    if (!this.settings.has(message.guild.id)) return;
    const settings = this.settings.get(message.guild.id);
    if (!settings.automodEnabled || this.isExempt(message)) return;
    const detection = this.detector.evaluate({
      guildId: message.guild.id, userId: message.author.id, messageId: message.id,
      content: message.content, mentionUserIds: [...message.mentions.users.keys()], settings
    });
    if (!detection) return;
    const now = Date.now();
    const active = this.db.prepare('SELECT COUNT(*) AS count FROM incidents WHERE guild_id = ? AND user_id = ? AND active = 1 AND created_at >= ?')
      .get(message.guild.id, message.author.id, now - settings.incidentWindowMs).count;
    const incident = this.db.prepare('INSERT INTO incidents (guild_id, user_id, channel_id, created_at, reasons, excerpt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(message.guild.id, message.author.id, message.channel.id, now, JSON.stringify(detection.reasons), excerpt(message.content));
    const decision = chooseAction({ mode: settings.mode, dryRun: settings.dryRun, activeIncidents: active });
    const result = await this.execute(message, decision, `Automod: ${detection.reasons.join(', ')}`);
    this.db.prepare('INSERT INTO moderation_actions (incident_id, guild_id, user_id, actor, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(incident.lastInsertRowid, message.guild.id, message.author.id, 'automod', decision.action, result.status, result.detail, now);
    await this.log(message.guild, settings, { id: incident.lastInsertRowid, reasons: detection.reasons, user: message.author, channel: message.channel, excerpt: message.content, active: active + 1, decision, result });
  }
  async execute(message, decision, reason) {
    if (decision.dryRun) return { status: 'simulasi', detail: `Akan menghapus pesan dan ${ACTION_LABELS[decision.action]}.` };
    const outcomes = [];
    try { await message.delete(); outcomes.push('pesan dihapus'); } catch (error) { outcomes.push(`gagal menghapus: ${error.code || error.message}`); }
    if (decision.action === 'warn') {
      try {
        await message.channel.send({ content: `${message.author}, pesan Anda terdeteksi sebagai spam. Mohon hentikan aktivitas tersebut.`, allowedMentions: { users: [message.author.id], roles: [], parse: [] } });
        outcomes.push('peringatan dikirim');
      } catch (error) { outcomes.push(`gagal mengirim peringatan: ${error.code || error.message}`); }
      return { status: outcomes.some((item) => item.startsWith('gagal')) ? 'sebagian-gagal' : 'berhasil', detail: outcomes.join('; ') };
    }
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member) return { status: 'gagal', detail: `${outcomes.join('; ')}; anggota tidak dapat diambil` };
    if (decision.action === 'timeout') {
      if (!member.moderatable) return { status: 'gagal', detail: `${outcomes.join('; ')}; bot tidak dapat timeout anggota (izin atau hierarki role)` };
      try { await member.timeout(10 * 60_000, reason); outcomes.push('timeout diterapkan'); return { status: 'berhasil', detail: outcomes.join('; ') }; }
      catch (error) { return { status: 'gagal', detail: `${outcomes.join('; ')}; timeout gagal: ${error.code || error.message}` }; }
    }
    if (!member.bannable) return { status: 'gagal', detail: `${outcomes.join('; ')}; bot tidak dapat ban anggota (izin atau hierarki role)` };
    try { await member.ban({ reason }); outcomes.push('ban diterapkan'); return { status: 'berhasil', detail: outcomes.join('; ') }; }
    catch (error) { return { status: 'gagal', detail: `${outcomes.join('; ')}; ban gagal: ${error.code || error.message}` }; }
  }
  async log(guild, settings, data) {
    if (!settings.logChannelId) {
      console.warn(`Log automod #${data.id} tidak dikirim di ${guild.name}: channel log belum dikonfigurasi. Jalankan /setup.`);
      return;
    }
    const channel = await guild.channels.fetch(settings.logChannelId).catch(() => null);
    if (!channel?.isTextBased()) {
      console.warn(`Log automod #${data.id} tidak dikirim di ${guild.name}: channel log sudah tidak ditemukan atau bukan channel teks. Jalankan /setup kembali.`);
      return;
    }
    await channel.send({
      embeds: [{ color: data.result.status === 'berhasil' ? 0x2ecc71 : 0xe67e22, title: `Automod #${data.id}`, fields: [
        { name: 'Pengguna', value: `${data.user.tag} (${data.user.id})` },
        { name: 'Channel', value: `<#${data.channel.id}>` },
        { name: 'Aturan', value: data.reasons.join(', ') },
        { name: 'Tindakan', value: `${data.decision.dryRun ? '[SIMULASI] ' : ''}${ACTION_LABELS[data.decision.action]} — ${data.result.status}` },
        { name: 'Pelanggaran aktif', value: String(data.active) },
        { name: 'Cuplikan', value: data.excerpt.slice(0, 300) || '(kosong)' }
      ], timestamp: new Date().toISOString() }],
      allowedMentions: { parse: [] }
    }).catch((error) => console.error('Gagal mengirim log moderasi:', error.message));
  }
}

export function canManage(interaction, permission) {
  return interaction.memberPermissions?.has(permission) ?? false;
}
export const MODERATOR_PERMISSION = PermissionFlagsBits.ModerateMembers;
