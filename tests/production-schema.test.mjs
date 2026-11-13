import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
test('all care tables have RLS enabled', () => {
  for (const name of ['teams','team_members','team_invitations','calendar_entries']) {
    assert.match(sql, new RegExp('alter table public\\.' + name + ' enable row level security;', 'i'));
  }
});
test('membership and admin helpers are in a non-exposed schema', () => {
  assert.match(sql, /create schema if not exists private;/i);
  for (const name of ['is_team_member','is_team_admin']) {
    assert.match(sql, new RegExp('create function private\\.' + name + '\\(', 'i'));
    assert.doesNotMatch(sql, new RegExp('create function public\\.' + name + '\\(', 'i'));
  }
});
test('calendar writes require membership and ownership', () => {
  assert.match(sql, /create policy entries_insert[\\s\\S]*?public\\.calendar_entries[\\s\\S]*?public\\.is_team_member|create policy entries_insert[\\s\\S]*?private\\.is_team_member/i);
  assert.match(sql, /created_by=\\(select auth\\.uid\\(\\)\\)/i);
  assert.match(sql, /check \\(ends_at > starts_at\\)/i);
});
test('invites are bound to verified email and expire', () => {
  assert.match(sql, /email_confirmed_at is not null/i);
  assert.match(sql, /expires_at>now\\(\\)/i);
  assert.match(sql, /digest\\(p_token,'sha256'\\)/i);
});
