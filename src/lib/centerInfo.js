// =============================================================================
// centerInfo — read the school's public contact details from app_config.
//
// The center's info (name, email, phone…) is stored as a JSON blob under the
// app_config row key='center_info' (managed in Settings). app_config is
// readable by every authenticated user (RLS "appconfig auth read"), so the
// portals can resolve the front-office email to let parents/students/teachers
// message "l'Administration" — without being able to list the admin roster
// (which RLS rightly forbids).
// =============================================================================

'use client';

import { entities } from './entities';

const FALLBACK = {
  name:  'Administration',
  email: 'contact@english-hills.com',
  phone1: '',
};

/**
 * getCenterInfo() → Promise<{ name, email, phone1, ... }>
 * Returns the saved center info, or a safe fallback if none is configured.
 */
export async function getCenterInfo() {
  try {
    const rows = await entities.AppConfig.filter({ key: 'center_info' });
    if (rows?.[0]?.value) {
      const parsed = JSON.parse(rows[0].value);
      return { ...FALLBACK, ...parsed };
    }
  } catch {
    /* fall through to FALLBACK — RLS denial or malformed value */
  }
  return FALLBACK;
}

/**
 * getOfficeRecipient() → Promise<{ email, name } | null>
 * Convenience wrapper that returns the office as a MessagesTab recipient.
 * Returns null if no usable email is configured.
 */
export async function getOfficeRecipient() {
  const info = await getCenterInfo();
  if (!info.email) return null;
  return { email: info.email, name: `Administration (${info.name})` };
}
