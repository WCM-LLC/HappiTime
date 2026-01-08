import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createClient } from '@supabase/supabase-js';

const DEFAULT_KEEP = ['jugganaught@gmail.com'];

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }

    let value = match[2]?.trim() ?? '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[match[1]] = value;
  }

  return env;
}

const args = process.argv.slice(2);
const keepEmails = new Set();
let dryRun = false;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--keep' && args[i + 1]) {
    keepEmails.add(normalizeEmail(args[i + 1]));
    i += 1;
    continue;
  }
  if (arg.startsWith('--keep=')) {
    keepEmails.add(normalizeEmail(arg.slice('--keep='.length)));
    continue;
  }
  if (arg === '--dry-run') {
    dryRun = true;
    continue;
  }
}

if (keepEmails.size === 0) {
  DEFAULT_KEEP.forEach((email) => keepEmails.add(normalizeEmail(email)));
}

const env = loadEnvFile(path.join(process.cwd(), '.env.local'));
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

async function run() {
  const perPage = 200;
  let page = 1;
  let deleted = 0;
  let kept = 0;
  let scanned = 0;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw error;
    }

    const users = data?.users ?? [];
    if (!users.length) {
      break;
    }

    for (const user of users) {
      scanned += 1;
      const email = normalizeEmail(user.email);
      if (email && keepEmails.has(email)) {
        kept += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[dry-run] delete ${user.id} ${email || '(no email)'}`);
        continue;
      }

      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      if (deleteError) {
        console.error(`Failed to delete ${user.id} ${email || '(no email)'}`, deleteError);
        continue;
      }

      deleted += 1;
    }

    if (!data?.nextPage) {
      break;
    }

    page = data.nextPage;
  }

  console.log(
    `Scanned ${scanned} users. Kept ${kept}. Deleted ${deleted}. ` +
      (dryRun ? '(dry run)' : '')
  );
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
