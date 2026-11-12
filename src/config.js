import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variabel lingkungan ${name} belum diisi. Salin .env.example menjadi .env lalu isi nilainya.`);
  return value;
}

export function getRuntimeConfig() {
  const pollSeconds = Number.parseInt(process.env.GITHUB_POLL_INTERVAL_SECONDS?.trim() || '120', 10);
  const githubPollIntervalMs = Number.isFinite(pollSeconds) && pollSeconds >= 30 ? pollSeconds * 1_000 : 120_000;
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    databasePath: process.env.DATABASE_PATH?.trim() || './data/sekelik-academy.sqlite',
    githubToken: process.env.GITHUB_TOKEN?.trim() || null,
    githubPollIntervalMs
  };
}

export function getRegistrationConfig() {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    // Dipertahankan hanya untuk membersihkan command guild lama setelah
    // pendaftaran global berhasil. Nilai ini tidak menentukan target deploy.
    legacyGuildId: process.env.DISCORD_GUILD_ID?.trim()
  };
}
