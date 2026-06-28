import postgres from 'npm:postgres';

function getConnectionString(): string {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (dbUrl) return dbUrl;

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const dbPassword = Deno.env.get("SUPABASE_DB_PASSWORD");

  if (!projectUrl) {
    throw new Error("SUPABASE_URL environment variable is required");
  }

  const projectRef = new URL(projectUrl).hostname.split('.')[0];

  if (dbPassword) {
    return `postgresql://postgres:${dbPassword}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  throw new Error(
    "Cannot construct database connection string. Set SUPABASE_DB_URL or SUPABASE_DB_PASSWORD."
  );
}

const connectionString = getConnectionString();

const sql = postgres(connectionString, {
  max: 3,
  idle_timeout: 10,
  connect_timeout: 10,
  max_lifetime: 60 * 5,
  connection: {
    application_name: 'wallet-sync',
  },
});

export default sql;
