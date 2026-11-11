import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, ModalBuilder, PermissionFlagsBits, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { buildWelcomeEmbed } from '../events/guild-member-add.js';
import { RolePanelService } from '../services/role-panel-service.js';
import { buildRulesEmbed, normalizeMultiline, parseHexColor, resolveRulesDraft } from '../services/rules-presets.js';

const VERIFY_BUTTON_ID = 'sekelik:verify-member';
const ROLE_PICKER_ID = 'sekelik:role-picker';
const ROLE_PICKER_PREFIX = 'sekelik:role-picker:';
const OPEN_TICKET_BUTTON_ID = 'sekelik:open-ticket';
const CLOSE_TICKET_BUTTON_ID = 'sekelik:close-ticket';
const REPORT_MODAL_PREFIX = 'sekelik:report-message:';
const RULES_MODAL_PREFIX = 'sekelik:rules-publish:';
const REPORT_REASON_INPUT_ID = 'reason';
const RULES_TITLE_INPUT_ID = 'title';
const RULES_BODY_INPUT_ID = 'body';
const RULES_FOOTER_INPUT_ID = 'footer';
const RULES_COLOR_INPUT_ID = 'color';

function requirePermission(interaction, permission) {
  if (!interaction.memberPermissions?.has(permission)) throw new Error('Anda tidak memiliki izin Discord yang diperlukan untuk command ini.');
}
function requireGuild(interaction) {
  if (!interaction.guild) throw new Error('Command ini hanya dapat dipakai di server.');
}
function validDomain(domain) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain);
}
function textChannel(channel, name) {
  if (!channel?.isTextBased() || channel.type === ChannelType.GuildForum) throw new Error(`${name} harus berupa channel teks.`);
  return channel;
}
async function requireBotChannelPermissions(interaction, channel, name) {
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  const permissions = channel.permissionsFor(botMember);
  if (!permissions?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    throw new Error(`Bot memerlukan izin View Channel, Send Messages, dan Embed Links di ${name}.`);
  }
}
async function targetMember(interaction, user) {
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) throw new Error('Anggota tidak ditemukan di server ini.');
  const actor = await interaction.guild.members.fetch(interaction.user.id);
  if (member.id === interaction.guild.ownerId || member.roles.highest.position >= actor.roles.highest.position) throw new Error('Target memiliki role setara/lebih tinggi atau merupakan pemilik server.');
  return member;
}
function insertManualAction(db, guildId, userId, actor, action, status, detail) {
  db.prepare('INSERT INTO moderation_actions (guild_id, user_id, actor, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(guildId, userId, actor, action, status, detail, Date.now());
}

export function chooseRolePickerChanges(configuredRoleIds, selectedRoleIds, memberRoleIds) {
  const selected = new Set(selectedRoleIds);
  const memberRoles = new Set(memberRoleIds);
  return {
    add: configuredRoleIds.filter((id) => selected.has(id) && !memberRoles.has(id)),
    remove: configuredRoleIds.filter((id) => !selected.has(id) && memberRoles.has(id))
  };
}

export function createCommandHandler({ settings, db, tickets, reports, rolePanels }) {
  const panels = rolePanels ?? (db ? new RolePanelService(db) : null);
  return async (interaction) => {
    try {
      requireGuild(interaction);
      if (interaction.isMessageContextMenuCommand()) return await showReportModal(interaction, settings);
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith(REPORT_MODAL_PREFIX)) return await submitReport(interaction, settings, reports);
        if (interaction.customId.startsWith(RULES_MODAL_PREFIX)) return await submitRulesModal(interaction, settings);
        return;
      }
      if (interaction.isButton()) {
        if (interaction.customId === VERIFY_BUTTON_ID) return await handleVerification(interaction, settings);
        if (interaction.customId === OPEN_TICKET_BUTTON_ID) return await handleTicketOpen(interaction, settings, tickets);
        if (interaction.customId === CLOSE_TICKET_BUTTON_ID) return await handleTicketClose(interaction, settings, tickets);
        return;
      }
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === ROLE_PICKER_ID || interaction.customId.startsWith(ROLE_PICKER_PREFIX)) {
          return await handleRolePicker(interaction, settings, panels);
        }
        return;
      }
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName === 'help') return interaction.reply({ ephemeral: true, content: settings.has(interaction.guildId)
        ? 'Konfigurasi server ini sudah tersimpan. Gunakan `/setup` atau `/welcome setup` untuk memperbarui, `/rules publish` untuk aturan, `/roles setup` untuk panel role, lalu cek `/automod status`.'
        : 'Server ini belum dikonfigurasi. Administrator atau pengguna dengan izin Manage Server perlu menjalankan `/setup` terlebih dahulu.' });
      if (interaction.commandName === 'setup') return await handleSetup(interaction, settings);
      if (interaction.commandName === 'welcome') return await handleWelcome(interaction, settings);
      if (interaction.commandName === 'rules') return await handleRules(interaction, settings);
      if (interaction.commandName === 'verify') return await handleVerifySetup(interaction, settings);
      if (interaction.commandName === 'roles') return await handleRolePickerSetup(interaction, settings, panels);
      if (interaction.commandName === 'ticket') return await handleTicketSetup(interaction, settings);
      if (interaction.commandName === 'automod') return await handleAutomod(interaction, settings);
      if (interaction.commandName === 'warnings' || interaction.commandName === 'clearwarnings') {
        requirePermission(interaction, PermissionFlagsBits.ModerateMembers);
        const user = interaction.options.getUser('anggota', true);
        if (interaction.commandName === 'warnings') {
          const rows = db.prepare('SELECT id, created_at, reasons FROM incidents WHERE guild_id = ? AND user_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 20').all(interaction.guildId, user.id);
          return interaction.reply({ ephemeral: true, content: rows.length ? `Pelanggaran aktif ${user.tag}:\n${rows.map((row) => `#${row.id} <t:${Math.floor(row.created_at / 1000)}:R> — ${JSON.parse(row.reasons).join(', ')}`).join('\n')}` : `${user.tag} tidak memiliki pelanggaran aktif.` });
        }
        const result = db.prepare('UPDATE incidents SET active = 0 WHERE guild_id = ? AND user_id = ? AND active = 1').run(interaction.guildId, user.id);
        return interaction.reply({ ephemeral: true, content: `${result.changes} pelanggaran aktif untuk ${user.tag} telah dihapus.` });
      }
      if (interaction.commandName === 'timeout' || interaction.commandName === 'ban') return await handleManualModeration(interaction, db);
      if (interaction.commandName === 'unban') {
        requirePermission(interaction, PermissionFlagsBits.BanMembers);
        const id = interaction.options.getString('id-pengguna', true);
        if (!/^\d{17,20}$/.test(id)) throw new Error('ID pengguna Discord tidak valid.');
        await interaction.guild.members.unban(id, interaction.options.getString('alasan', true));
        insertManualAction(db, interaction.guildId, id, interaction.user.id, 'unban', 'berhasil', 'Ban dicabut.');
        return interaction.reply({ ephemeral: true, content: `Ban untuk ID ${id} telah dicabut.` });
      }
      if (interaction.commandName === 'purge') {
        requirePermission(interaction, PermissionFlagsBits.ManageMessages);
        const channel = textChannel(interaction.channel, 'Channel saat ini');
        const count = interaction.options.getInteger('jumlah', true);
        const deleted = await channel.bulkDelete(count, true);
        return interaction.reply({ ephemeral: true, content: `${deleted.size} pesan dihapus. Pesan berusia lebih dari 14 hari dilewati oleh API Discord.` });
      }
      throw new Error('Command belum tersedia pada versi bot yang sedang berjalan. Deploy dan restart bot, lalu coba lagi.');
    } catch (error) {
      const payload = { ephemeral: true, content: `Tidak dapat menjalankan command: ${error.message}` };
      if (interaction.deferred && !interaction.replied) await interaction.editReply({ content: payload.content });
      else if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
      else await interaction.reply(payload);
    }
  };
}

async function showReportModal(interaction, settings) {
  if (!settings.get(interaction.guildId).logChannelId) throw new Error('Channel log moderator belum diatur. Minta admin menjalankan `/setup` dan mengisi channel log.');
  const modal = new ModalBuilder()
    .setCustomId(`${REPORT_MODAL_PREFIX}${interaction.targetMessage.id}`)
    .setTitle('Laporkan Pesan')
    .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
      .setCustomId(REPORT_REASON_INPUT_ID)
      .setLabel('Alasan laporan')
      .setPlaceholder('Contoh: spam, pelecehan, promosi, atau konten tidak pantas.')
      .setStyle(TextInputStyle.Paragraph)
      .setMinLength(5)
      .setMaxLength(500)
      .setRequired(true)));
  return interaction.showModal(modal);
}

async function submitReport(interaction, settings, reports) {
  const messageId = interaction.customId.slice(REPORT_MODAL_PREFIX.length);
  if (!/^\d{17,20}$/.test(messageId)) throw new Error('ID pesan laporan tidak valid.');
  const config = settings.get(interaction.guildId);
  const logChannel = await interaction.guild.channels.fetch(config.logChannelId).catch(() => null);
  if (!logChannel?.isTextBased()) throw new Error('Channel log moderator tidak ditemukan. Minta admin memperbarui konfigurasi server.');
  const message = await interaction.channel.messages.fetch(messageId).catch(() => null);
  if (!message) throw new Error('Pesan yang dilaporkan sudah tidak tersedia.');
  if (message.author.id === interaction.user.id) throw new Error('Anda tidak dapat melaporkan pesan sendiri.');
  if (reports.hasReported(interaction.guildId, interaction.user.id, message.id)) throw new Error('Anda sudah melaporkan pesan ini.');
  const reason = interaction.fields.getTextInputValue(REPORT_REASON_INPUT_ID).trim();
  const reportId = reports.create({
    guildId: interaction.guildId, reporterId: interaction.user.id, messageId: message.id, channelId: message.channel.id,
    authorId: message.author.id, reason, excerpt: message.content.replace(/\s+/g, ' ').slice(0, 300) || '(pesan tanpa teks)'
  });
  const messageUrl = `https://discord.com/channels/${interaction.guildId}/${message.channel.id}/${message.id}`;
  await logChannel.send({
    embeds: [new EmbedBuilder()
      .setColor(0xe67e22)
      .setTitle(`🚩 Laporan Pesan #${reportId}`)
      .addFields(
        { name: 'Pelapor', value: `${interaction.user.tag} (${interaction.user.id})` },
        { name: 'Penulis pesan', value: `${message.author.tag} (${message.author.id})` },
        { name: 'Channel', value: `#${message.channel.name}` },
        { name: 'Alasan', value: reason },
        { name: 'Pesan', value: message.content.replace(/\s+/g, ' ').slice(0, 500) || '(pesan tanpa teks)' },
        { name: 'Tautan', value: `[Buka pesan](${messageUrl})` }
      )
      .setTimestamp()],
    allowedMentions: { parse: [] }
  });
  return interaction.reply({ ephemeral: true, content: 'Laporan Anda sudah dikirim ke moderator. Terima kasih.' });
}

function renderCustomText(raw, fallback, guildName, roleName = '') {
  const source = raw?.trim() || fallback;
  return normalizeMultiline(source)
    .replaceAll('{server}', guildName)
    .replaceAll('{role}', roleName);
}

async function handleVerifySetup(interaction, settings) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  const channel = textChannel(interaction.options.getChannel('channel', true), 'Channel verifikasi');
  await requireBotChannelPermissions(interaction, channel, 'channel verifikasi');
  const role = interaction.options.getRole('role', true);
  if (!role.editable) throw new Error('Bot tidak dapat memberi role ini. Pindahkan role bot ke atas role target dan pastikan bot memiliki izin Manage Roles.');
  const title = renderCustomText(interaction.options.getString('judul'), '✅ Verifikasi Anggota', interaction.guild.name, role.name).slice(0, 256);
  const description = renderCustomText(
    interaction.options.getString('deskripsi'),
    'Selamat datang di **{server}**!\n\nSebelum mengakses channel lain, baca aturan server terlebih dahulu lalu tekan tombol di bawah untuk menyatakan persetujuan. Setelah terverifikasi, kamu akan menerima role **{role}**.',
    interaction.guild.name,
    role.name
  ).slice(0, 4096);
  const buttonLabel = (interaction.options.getString('tombol')?.trim() || 'Saya setuju dengan aturan').slice(0, 80);
  const footerText = renderCustomText(interaction.options.getString('footer'), 'Satu klik untuk verifikasi dan bergabung.', interaction.guild.name, role.name).trim().slice(0, 2048);
  const color = parseHexColor(interaction.options.getString('warna'));
  await interaction.deferReply({ ephemeral: true });
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
  if (footerText) embed.setFooter({ text: footerText });
  await channel.send({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(VERIFY_BUTTON_ID).setLabel(buttonLabel).setStyle(ButtonStyle.Success))]
  });
  settings.update(interaction.guildId, { verificationChannelId: channel.id, verificationRoleId: role.id });
  return interaction.editReply({ content: `Pesan verifikasi dikirim ke <#${channel.id}>. Role setelah verifikasi: ${role}.` });
}

async function handleVerification(interaction, settings) {
  const config = settings.get(interaction.guildId);
  if (!config.verificationRoleId) throw new Error('Verifikasi belum dikonfigurasi. Minta admin menjalankan `/verify setup`.');
  const role = interaction.guild.roles.cache.get(config.verificationRoleId) ?? await interaction.guild.roles.fetch?.(config.verificationRoleId).catch(() => null);
  if (!role) throw new Error('Role verifikasi sudah tidak ditemukan. Minta admin menjalankan `/verify setup` kembali.');
  if (!role.editable) throw new Error('Bot tidak dapat memberi role verifikasi. Administrator perlu memperbaiki izin Manage Roles atau posisi role bot.');
  const member = await interaction.guild.members.fetch(interaction.user.id);
  if (member.roles.cache.has(role.id)) return interaction.reply({ ephemeral: true, content: `Anda sudah memiliki role ${role}.` });
  await member.roles.add(role, 'Anggota menyetujui aturan melalui tombol verifikasi');
  return interaction.reply({ ephemeral: true, content: `Verifikasi berhasil. Selamat datang, ${interaction.user}! Role ${role} telah diberikan.` });
}

async function handleRolePickerSetup(interaction, settings, rolePanels) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  const channel = textChannel(interaction.options.getChannel('channel', true), 'Channel panel role');
  await requireBotChannelPermissions(interaction, channel, 'channel panel role');
  const roles = Array.from({ length: 10 }, (_, index) => interaction.options.getRole(`role-${index + 1}`)).filter(Boolean);
  if (new Set(roles.map((role) => role.id)).size !== roles.length) throw new Error('Setiap role pada panel harus berbeda.');
  const unavailable = roles.find((role) => !role.editable);
  if (unavailable) throw new Error(`Bot tidak dapat mengelola role ${unavailable}. Pindahkan role bot ke atasnya dan pastikan bot memiliki izin Manage Roles.`);

  const mode = interaction.options.getString('mode') || 'multi';
  const color = parseHexColor(interaction.options.getString('warna'));
  const title = renderCustomText(interaction.options.getString('judul'), '🎭 Ambil Role', interaction.guild.name).slice(0, 256);
  const defaultDesc = mode === 'single'
    ? 'Pilih **satu** role melalui menu di bawah. Memilih role baru akan menggantikan pilihan sebelumnya pada panel ini.'
    : 'Pilih satu atau beberapa role melalui menu di bawah. Kamu dapat membuka menu ini lagi kapan saja untuk mengubah pilihan.';
  const description = renderCustomText(interaction.options.getString('deskripsi'), defaultDesc, interaction.guild.name).slice(0, 4096);
  const placeholder = (interaction.options.getString('placeholder')?.trim() || (mode === 'single' ? 'Pilih satu role' : 'Pilih satu atau beberapa role')).slice(0, 150);

  await interaction.deferReply({ ephemeral: true });
  const roleIds = roles.map((role) => role.id);
  const panelId = rolePanels.create({
    guildId: interaction.guildId,
    channelId: channel.id,
    mode,
    title,
    description,
    placeholder,
    color,
    roleIds
  });

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${ROLE_PICKER_PREFIX}${panelId}`)
    .setPlaceholder(placeholder)
    .setMinValues(0)
    .setMaxValues(mode === 'single' ? 1 : roles.length)
    .addOptions(roles.map((role) => ({
      label: role.name.slice(0, 100),
      value: role.id,
      description: `Ambil atau lepas role ${role.name}`.slice(0, 100)
    })));

  try {
    const sent = await channel.send({
      embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(description)],
      components: [new ActionRowBuilder().addComponents(menu)]
    });
    rolePanels.setMessageId(panelId, sent.id);
  } catch (error) {
    rolePanels.delete(panelId);
    throw error;
  }

  settings.update(interaction.guildId, { rolePickerRoleIds: roleIds });
  return interaction.editReply({ content: `Panel role (${mode === 'single' ? 'satu pilihan' : 'multi-pilihan'}) dikirim ke <#${channel.id}> untuk ${roles.length} role.` });
}

async function handleRolePicker(interaction, settings, rolePanels) {
  let configuredIds;
  let mode = 'multi';
  if (interaction.customId.startsWith(ROLE_PICKER_PREFIX)) {
    const panelId = Number(interaction.customId.slice(ROLE_PICKER_PREFIX.length));
    const panel = Number.isInteger(panelId) && rolePanels ? rolePanels.findById(interaction.guildId, panelId) : null;
    if (!panel) throw new Error('Panel role ini sudah tidak ditemukan. Minta admin membuat ulang dengan `/roles setup`.');
    configuredIds = panel.roleIds;
    mode = panel.mode;
  } else {
    configuredIds = settings.get(interaction.guildId).rolePickerRoleIds;
  }
  if (!configuredIds.length) throw new Error('Panel role belum dikonfigurasi. Minta admin menjalankan `/roles setup`.');
  const resolvedRoles = await Promise.all(
    configuredIds.map((id) => interaction.guild.roles.cache.get(id) ?? interaction.guild.roles.fetch?.(id).catch(() => null))
  );
  const roles = resolvedRoles.filter(Boolean);
  if (roles.length !== configuredIds.length) throw new Error('Satu atau beberapa role pada panel ini sudah tidak ditemukan. Minta admin menjalankan `/roles setup` kembali.');
  const unavailable = roles.find((role) => !role.editable);
  if (unavailable) throw new Error(`Bot tidak dapat mengelola role ${unavailable}. Administrator perlu memperbaiki izin atau posisi role bot.`);
  const selectedIds = mode === 'single' ? interaction.values.slice(0, 1) : interaction.values;
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const roleById = new Map(roles.map((role) => [role.id, role]));
  const changes = chooseRolePickerChanges(configuredIds, selectedIds, member.roles.cache.keys());
  const toAdd = changes.add.map((id) => roleById.get(id));
  const toRemove = changes.remove.map((id) => roleById.get(id));
  if (toAdd.length) await member.roles.add(toAdd, 'Anggota memperbarui pilihan role');
  if (toRemove.length) await member.roles.remove(toRemove, 'Anggota memperbarui pilihan role');
  const selectedRoles = roles.filter((role) => selectedIds.includes(role.id));
  return interaction.reply({
    ephemeral: true,
    content: selectedRoles.length ? `Role diperbarui: ${selectedRoles.join(', ')}.` : 'Semua role pada panel ini telah dilepas.'
  });
}

async function handleTicketSetup(interaction, settings) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  const channel = textChannel(interaction.options.getChannel('channel', true), 'Channel panel tiket');
  await requireBotChannelPermissions(interaction, channel, 'channel panel tiket');
  const role = interaction.options.getRole('role', true);
  const title = renderCustomText(interaction.options.getString('judul'), '🆘 Butuh Bantuan?', interaction.guild.name, role.name).slice(0, 256);
  const description = renderCustomText(
    interaction.options.getString('deskripsi'),
    'Tekan tombol di bawah untuk membuat channel bantuan privat. Jelaskan keperluan atau pertanyaanmu dengan jelas agar **{role}** dapat membantu lebih cepat.',
    interaction.guild.name,
    role.name
  ).slice(0, 4096);
  const buttonLabel = (interaction.options.getString('tombol')?.trim() || 'Buat Tiket Bantuan').slice(0, 80);
  const welcomeMessage = interaction.options.getString('pesan-awal')?.trim() || null;
  const color = parseHexColor(interaction.options.getString('warna'));
  await interaction.deferReply({ ephemeral: true });
  await channel.send({
    embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .addFields({ name: 'Sebelum membuat tiket', value: 'Periksa channel aturan dan informasi terlebih dahulu. Satu anggota hanya dapat memiliki satu tiket aktif.' })],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(OPEN_TICKET_BUTTON_ID).setLabel(buttonLabel).setEmoji('🎫').setStyle(ButtonStyle.Primary))]
  });
  settings.update(interaction.guildId, {
    ticketPanelChannelId: channel.id,
    ticketSupportRoleId: role.id,
    ticketConfig: { welcomeMessage, color }
  });
  return interaction.editReply({ content: `Panel tiket dikirim ke <#${channel.id}>. Role pendamping: ${role}.` });
}

async function handleTicketOpen(interaction, settings, tickets) {
  await interaction.deferReply({ ephemeral: true });
  const config = settings.get(interaction.guildId);
  if (!config.ticketSupportRoleId || !config.ticketPanelChannelId) throw new Error('Panel tiket belum dikonfigurasi. Minta admin menjalankan `/ticket setup`.');
  const supportRole = interaction.guild.roles.cache.get(config.ticketSupportRoleId) ?? await interaction.guild.roles.fetch?.(config.ticketSupportRoleId).catch(() => null);
  if (!supportRole) throw new Error('Role pendamping tiket sudah tidak ditemukan. Minta admin menjalankan `/ticket setup` kembali.');
  const existing = tickets.findOpenForUser(interaction.guildId, interaction.user.id);
  if (existing) {
    const channel = await interaction.guild.channels.fetch(existing.channel_id).catch(() => null);
    if (channel) return interaction.editReply(`Anda sudah memiliki tiket aktif: <#${existing.channel_id}>.`);
    tickets.close(existing.channel_id, interaction.client.user.id);
  }
  const panelChannel = await interaction.guild.channels.fetch(config.ticketPanelChannelId).catch(() => null);
  if (!panelChannel?.isTextBased()) throw new Error('Channel panel tiket tidak ditemukan. Minta admin menjalankan `/ticket setup` kembali.');
  const botMember = interaction.guild.members.me ?? await interaction.guild.members.fetchMe();
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Bot memerlukan izin Manage Channels untuk membuat channel tiket privat.');
  const safeName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 70) || interaction.user.id;
  const ticketChannel = await interaction.guild.channels.create({
    name: `ticket-${safeName}`,
    type: ChannelType.GuildText,
    parent: panelChannel.parentId ?? undefined,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      { id: botMember.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: supportRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
    ],
    reason: `Tiket bantuan dibuat oleh ${interaction.user.tag}`
  });
  const ticketId = tickets.create({ guildId: interaction.guildId, channelId: ticketChannel.id, userId: interaction.user.id });
  const ticketColor = config.ticketConfig?.color ?? 0x5865f2;
  const introTemplate = config.ticketConfig?.welcomeMessage
    || 'Terima kasih sudah menghubungi kami. Jelaskan kebutuhan atau kendalamu secara rinci agar **{role}** dapat membantu secepatnya.';
  const introDescription = normalizeMultiline(introTemplate)
    .replaceAll('{user}', `${interaction.user}`)
    .replaceAll('{role}', supportRole.name)
    .replaceAll('{server}', interaction.guild.name)
    .slice(0, 4096);
  await ticketChannel.send({
    content: `${interaction.user} ${supportRole}`,
    embeds: [new EmbedBuilder().setColor(ticketColor).setTitle(`🎫 Tiket Bantuan #${ticketId}`).setDescription(introDescription)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(CLOSE_TICKET_BUTTON_ID).setLabel('Tutup Tiket').setEmoji('🔒').setStyle(ButtonStyle.Danger))],
    allowedMentions: { users: [interaction.user.id], roles: [supportRole.id], parse: [] }
  });
  return interaction.editReply(`Tiket bantuan Anda sudah dibuat: <#${ticketChannel.id}>.`);
}

async function handleTicketClose(interaction, settings, tickets) {
  const ticket = tickets.findOpenForChannel(interaction.guildId, interaction.channelId);
  if (!ticket) throw new Error('Tombol ini hanya dapat dipakai pada tiket yang masih aktif.');
  const supportRoleId = settings.get(interaction.guildId).ticketSupportRoleId;
  const supportRole = supportRoleId ? (interaction.guild.roles.cache.get(supportRoleId) ?? await interaction.guild.roles.fetch?.(supportRoleId).catch(() => null)) : null;
  const supportLabel = supportRole?.name || 'tim pendamping';
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const isSupport = (supportRoleId && member.roles.cache.has(supportRoleId)) || interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels);
  if (interaction.user.id !== ticket.user_id && !isSupport) {
    throw new Error(`Hanya pembuat tiket, ${supportLabel}, atau pengelola channel yang dapat menutup tiket.`);
  }
  await interaction.deferReply({ ephemeral: true });
  await interaction.channel.permissionOverwrites.edit(ticket.user_id, { SendMessages: false }, { reason: `Tiket ditutup oleh ${interaction.user.tag}` });
  await interaction.channel.setName(`closed-${interaction.channel.name.replace(/^ticket-/, '').slice(0, 90)}`, `Tiket ditutup oleh ${interaction.user.tag}`);
  tickets.close(interaction.channelId, interaction.user.id);
  await interaction.channel.send({ content: `🔒 Tiket ditutup oleh ${interaction.user}. Riwayat channel tetap tersedia untuk ${supportLabel}.`, allowedMentions: { users: [interaction.user.id], parse: [] } });
  return interaction.editReply('Tiket ditutup. Anda tidak dapat mengirim pesan lagi di channel ini.');
}

async function handleRules(interaction, settings) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  const channel = textChannel(interaction.options.getChannel('channel', true), 'Channel aturan');
  await requireBotChannelPermissions(interaction, channel, 'channel aturan');
  const preset = interaction.options.getString('preset');
  const editOption = interaction.options.getBoolean('edit');
  const shouldEdit = editOption ?? !preset;
  const draft = resolveRulesDraft({ preset, savedRules: settings.get(interaction.guildId).rulesConfig });
  if (shouldEdit) {
    const titleInput = new TextInputBuilder()
      .setCustomId(RULES_TITLE_INPUT_ID)
      .setLabel('Judul embed ({server} = nama server)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(256)
      .setRequired(true);
    if (draft.title) titleInput.setValue(draft.title.slice(0, 256));

    const bodyInput = new TextInputBuilder()
      .setCustomId(RULES_BODY_INPUT_ID)
      .setLabel('Isi aturan (mendukung markdown Discord)')
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(3900)
      .setRequired(true);
    if (draft.body) bodyInput.setValue(draft.body.slice(0, 3900));

    const footerInput = new TextInputBuilder()
      .setCustomId(RULES_FOOTER_INPUT_ID)
      .setLabel('Footer opsional ({server} = nama server)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(200)
      .setRequired(false);
    if (draft.footer) footerInput.setValue(draft.footer.slice(0, 200));

    const colorInput = new TextInputBuilder()
      .setCustomId(RULES_COLOR_INPUT_ID)
      .setLabel('Warna hex opsional (contoh #5865f2)')
      .setStyle(TextInputStyle.Short)
      .setMaxLength(7)
      .setRequired(false);
    if (draft.color) colorInput.setValue(draft.color.slice(0, 7));

    const modal = new ModalBuilder()
      .setCustomId(`${RULES_MODAL_PREFIX}${channel.id}`)
      .setTitle('Atur & Kirim Rules Server')
      .addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(bodyInput),
        new ActionRowBuilder().addComponents(footerInput),
        new ActionRowBuilder().addComponents(colorInput)
      );
    return interaction.showModal(modal);
  }
  await interaction.deferReply({ ephemeral: true });
  const rulesConfig = { title: draft.title, body: draft.body, footer: draft.footer || '', color: draft.color || '#5865f2' };
  await channel.send({ embeds: [buildRulesEmbed({ guildName: interaction.guild.name, rules: rulesConfig })], allowedMentions: { parse: [] } });
  settings.update(interaction.guildId, { rulesConfig });
  return interaction.editReply({ content: `Embed aturan dikirim ke <#${channel.id}> dan disimpan untuk server ini.` });
}

async function submitRulesModal(interaction, settings) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  const channelId = interaction.customId.slice(RULES_MODAL_PREFIX.length);
  if (!/^\d{17,20}$/.test(channelId)) throw new Error('ID channel aturan tidak valid.');
  const channel = textChannel(await interaction.guild.channels.fetch(channelId).catch(() => null), 'Channel aturan');
  await requireBotChannelPermissions(interaction, channel, 'channel aturan');
  const title = interaction.fields.getTextInputValue(RULES_TITLE_INPUT_ID).trim();
  const body = interaction.fields.getTextInputValue(RULES_BODY_INPUT_ID).trim();
  if (!title || !body) throw new Error('Judul dan isi aturan tidak boleh kosong.');
  const footer = interaction.fields.getTextInputValue(RULES_FOOTER_INPUT_ID).trim();
  const colorRaw = interaction.fields.getTextInputValue(RULES_COLOR_INPUT_ID).trim();
  parseHexColor(colorRaw);
  await interaction.deferReply({ ephemeral: true });
  const rulesConfig = { title, body, footer, color: colorRaw || '#5865f2' };
  await channel.send({ embeds: [buildRulesEmbed({ guildName: interaction.guild.name, rules: rulesConfig })], allowedMentions: { parse: [] } });
  settings.update(interaction.guildId, { rulesConfig });
  return interaction.editReply({ content: `Aturan server disimpan dan dikirim ke <#${channel.id}>.` });
}

async function handleWelcome(interaction, settings) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  const sub = interaction.options.getSubcommand();
  if (sub === 'setup') {
    return handleSetup(interaction, settings);
  }
  const config = settings.get(interaction.guildId);
  if (!config.welcomeChannelId) throw new Error('Jalankan `/setup` atau `/welcome setup` terlebih dahulu.');
  const channel = await interaction.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error('Channel sambutan sudah dihapus atau tidak dapat diakses. Jalankan `/setup` kembali.');
  await requireBotChannelPermissions(interaction, channel, 'channel sambutan');
  const links = [
    config.rulesChannelId && `Baca aturan di <#${config.rulesChannelId}>.`,
    config.introductionChannelId && `Berkenalan di <#${config.introductionChannelId}>.`
  ].filter(Boolean).join('\n');
  await channel.send({
    embeds: [buildWelcomeEmbed({
      guildName: interaction.guild.name,
      userId: interaction.user.id,
      username: interaction.user.username ?? interaction.user.tag,
      avatarUrl: interaction.user.displayAvatarURL(),
      welcomeTitle: config.welcomeTitle,
      welcomeTemplate: config.welcomeTemplate,
      links
    })],
    allowedMentions: { users: [interaction.user.id], roles: [], parse: [] }
  });
  return interaction.reply({ ephemeral: true, content: 'Pesan uji dikirim.' });
}

async function handleSetup(interaction, settings) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  await interaction.deferReply({ ephemeral: true });
  const welcome = textChannel(interaction.options.getChannel('welcome', true), 'Channel sambutan');
  const rules = interaction.options.getChannel('rules');
  if (rules) textChannel(rules, 'Channel aturan');
  const introduction = interaction.options.getChannel('perkenalan');
  if (introduction) textChannel(introduction, 'Channel perkenalan');
  const log = interaction.options.getChannel('log');
  if (log) textChannel(log, 'Channel log');
  const channelsToCheck = [
    [welcome, 'channel sambutan'],
    ...(rules ? [[rules, 'channel aturan']] : []),
    ...(introduction ? [[introduction, 'channel perkenalan']] : []),
    ...(log ? [[log, 'channel log']] : [])
  ];
  for (const [channel, name] of channelsToCheck) {
    await requireBotChannelPermissions(interaction, channel, name);
  }
  const role = interaction.options.getRole('role');
  if (role && !role.editable) throw new Error('Bot tidak dapat memberi role otomatis ini. Pastikan bot memiliki Manage Roles dan role bot berada di atas role target.');
  const template = interaction.options.getString('template');
  if (template && (!template.includes('{user}') || !template.includes('{server}'))) throw new Error('Template harus memuat placeholder {user} dan {server}.');
  const welcomeTitle = interaction.options.getString('judul');
  settings.update(interaction.guildId, {
    welcomeChannelId: welcome.id,
    rulesChannelId: rules?.id ?? null,
    introductionChannelId: introduction?.id ?? null,
    logChannelId: log?.id ?? null,
    autoRoleId: role?.id ?? null,
    ...(template && { welcomeTemplate: template }),
    ...(welcomeTitle && { welcomeTitle })
  });
  return interaction.editReply({ content: `Konfigurasi server **${interaction.guild.name}** disimpan terpisah untuk server ini.` });
}

async function handleAutomod(interaction, settings) {
  requirePermission(interaction, PermissionFlagsBits.ManageGuild);
  const sub = interaction.options.getSubcommand(); const guildId = interaction.guildId; const config = settings.get(guildId);
  if (sub === 'status') return interaction.reply({ ephemeral: true, content: `**Automod**: ${config.automodEnabled ? 'aktif' : 'nonaktif'}\nMode: ${config.mode}\nDry-run: ${config.dryRun ? 'aktif' : 'nonaktif'}\nFilter undangan: ${config.inviteFilter ? 'aktif' : 'nonaktif'}\nFlood: ${config.thresholds.floodCount}/${config.thresholds.floodWindowMs / 1000} detik; ulang: ${config.thresholds.repeatCount}/${config.thresholds.repeatWindowMs / 1000} detik; mention: ${config.thresholds.mentionCount}\nCooldown: ${config.cooldownMs / 1000} detik; eskalasi: ${config.incidentWindowMs / 3_600_000} jam\nDomain diblokir: ${config.blockedDomains.join(', ') || '(kosong)'}` });
  if (sub === 'toggle' || sub === 'dry-run' || sub === 'invite') {
    const value = interaction.options.getBoolean('aktif', true);
    settings.update(guildId, sub === 'toggle' ? { automodEnabled: value } : sub === 'dry-run' ? { dryRun: value } : { inviteFilter: value });
    return interaction.reply({ ephemeral: true, content: `${sub === 'toggle' ? 'Automod' : sub === 'dry-run' ? 'Dry-run' : 'Filter undangan Discord'} ${value ? 'diaktifkan' : 'dinonaktifkan'}.` });
  }
  if (sub === 'mode') { const mode = interaction.options.getString('mode', true); settings.update(guildId, { mode }); return interaction.reply({ ephemeral: true, content: `Mode automod diubah ke ${mode}.` }); }
  if (sub === 'threshold') {
    const rule = interaction.options.getString('aturan', true); const value = interaction.options.getInteger('nilai', true); const thresholds = { ...config.thresholds };
    if (rule === 'flood') thresholds.floodCount = value;
    else if (rule === 'flood-window') thresholds.floodWindowMs = value * 1_000;
    else if (rule === 'repeat') thresholds.repeatCount = value;
    else if (rule === 'repeat-window') thresholds.repeatWindowMs = value * 1_000;
    else if (rule === 'mention') thresholds.mentionCount = value;
    else if (rule === 'cooldown') {
      settings.update(guildId, { cooldownMs: value * 1_000 });
      return interaction.reply({ ephemeral: true, content: `Cooldown insiden diubah menjadi ${value} detik.` });
    } else if (rule === 'incident-window') {
      settings.update(guildId, { incidentWindowMs: value * 3_600_000 });
      return interaction.reply({ ephemeral: true, content: `Jendela eskalasi diubah menjadi ${value} jam.` });
    }
    settings.update(guildId, { thresholds }); return interaction.reply({ ephemeral: true, content: `Konfigurasi ${rule} diubah menjadi ${value}.` });
  }
  if (sub === 'whitelist') {
    const type = interaction.options.getString('tipe', true); const action = interaction.options.getString('aksi', true);
    if (action === 'list') return interaction.reply({ ephemeral: true, content: `Whitelist ${type}: ${settings.listExemptions(guildId, type).join(', ') || '(kosong)'}` });
    const id = interaction.options.getString('id'); if (!id || !/^\d{17,20}$/.test(id)) throw new Error('Masukkan ID Discord yang valid.');
    if (action === 'add') settings.addExemption(guildId, type, id); else settings.removeExemption(guildId, type, id);
    return interaction.reply({ ephemeral: true, content: `Whitelist ${type} ${id}: ${action === 'add' ? 'ditambahkan' : 'dihapus'}.` });
  }
  const action = interaction.options.getString('aksi', true); const raw = interaction.options.getString('domain');
  if (action === 'list') return interaction.reply({ ephemeral: true, content: `Domain terblokir: ${config.blockedDomains.join(', ') || '(kosong)'}` });
  const domain = raw?.toLowerCase().replace(/^\.+|\.+$/g, ''); if (!domain || !validDomain(domain)) throw new Error('Masukkan nama domain valid tanpa protokol atau path, misalnya contoh.com.');
  const blockedDomains = action === 'add' ? [...new Set([...config.blockedDomains, domain])] : config.blockedDomains.filter((item) => item !== domain);
  settings.update(guildId, { blockedDomains }); return interaction.reply({ ephemeral: true, content: `Domain ${domain} ${action === 'add' ? 'ditambahkan' : 'dihapus'}.` });
}

async function handleManualModeration(interaction, db) {
  const isBan = interaction.commandName === 'ban';
  requirePermission(interaction, isBan ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.ModerateMembers);
  const user = interaction.options.getUser('anggota', true); const member = await targetMember(interaction, user); const reason = interaction.options.getString('alasan', true);
  if (isBan) {
    if (!member.bannable) throw new Error('Bot tidak dapat mem-ban target karena izin atau hierarki role.');
    await member.ban({ reason }); insertManualAction(db, interaction.guildId, user.id, interaction.user.id, 'ban', 'berhasil', reason);
    return interaction.reply({ ephemeral: true, content: `${user.tag} telah di-ban.` });
  }
  if (!member.moderatable) throw new Error('Bot tidak dapat memberi timeout target karena izin atau hierarki role.');
  const minutes = interaction.options.getInteger('menit', true); await member.timeout(minutes * 60_000, reason);
  insertManualAction(db, interaction.guildId, user.id, interaction.user.id, 'timeout', 'berhasil', reason);
  return interaction.reply({ ephemeral: true, content: `${user.tag} diberi timeout ${minutes} menit.` });
}
