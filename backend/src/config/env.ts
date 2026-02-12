function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getBooleanEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true';
}

export const ENV = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: getRequiredEnv('JWT_SECRET'),
  DB_HOST: getRequiredEnv('DB_HOST'),
  DB_PORT: Number(getRequiredEnv('DB_PORT')),
  DB_USER: getRequiredEnv('DB_USER'),
  DB_PASSWORD: getRequiredEnv('DB_PASSWORD'),
  DB_NAME: getRequiredEnv('DB_NAME'),
  DB_CA: process.env.DB_CA,
  DB_SSL: getBooleanEnv('DB_SSL', true),
  DB_SSL_REJECT_UNAUTHORIZED: getBooleanEnv(
    'DB_SSL_REJECT_UNAUTHORIZED',
    false
  ),
};
