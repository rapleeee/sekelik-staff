import 'dotenv/config';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variabel lingkungan ${name} belum diisi. Salin .env.example menjadi .env lalu isi nilainya.`);
  return value;
}

export function getRuntimeConfig() {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    databasePath: process.env.DATABASE_PATH?.trim() || './data/sekelik-academy.sqlite'
  };
}

export function getRegistrationConfig() {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: process.env.DISCORD_GUILD_ID?.trim()
  };
}
