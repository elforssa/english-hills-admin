// =============================================================================
// entities — per-table data access: entities.<Name>.{list,filter,create,update,delete}
//
// Thin wrapper over `@supabase/ssr`'s browser client. Each entity is a
// PascalCase singular name (e.g. Student, Receipt) that maps to a Supabase
// table via TABLE_FOR below.
//
// Conventions:
//   • Tables are stored with `created_at` / `updated_at`. Methods accept
//     `created_date` / `updated_date` in orderBy strings and mirror them
//     onto returned rows so existing consumers keep working without churn.
//   • `list(orderBy, limit)` takes an orderBy string ("field" ascending,
//     "-field" descending) and an optional row cap.
//   • `filter(criteria, orderBy?, limit?)` accepts equality predicates;
//     arrays become IN clauses, null/undefined become IS NULL.
//   • Create/update strip server-owned fields (`id` on create, the four
//     timestamp aliases always) before hitting the table.
//
// Error handling: every method calls `toast.error(...)` with a concise
// message on failure AND re-throws. Caller may handle the throw or let
// it bubble — the toast is already shown.
// =============================================================================

'use client';

import { toast } from 'sonner';
import { getBrowserClient } from './supabase';

// -----------------------------------------------------------------------------
// Entity name → Supabase table name
// -----------------------------------------------------------------------------
const TABLE_FOR = {
  Announcement:       'announcements',
  AppConfig:          'app_config',
  Assessment:         'assessments',
  Attendance:         'attendance',
  AuthorizedAdult:    'authorized_adults',
  Certificate:        'certificates',
  DismissalLog:       'dismissal_logs',
  Enrollment:         'enrollments',
  Group:              'groups',
  LearningAssessment: 'learning_assessments',
  LeaveRequest:       'leave_requests',
  Message:            'messages',
  Notification:       'notifications',
  Payment:            'payments',
  Payroll:            'payroll',
  PendingRole:        'pending_roles',
  PlacementTest:      'placement_tests',
  Portfolio:          'portfolios',
  Receipt:            'receipts',
  Student:            'students',
  Teacher:            'teachers',
  User:               'profiles',
};

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Parses an orderBy string ("field" or "-field") into Supabase's
 * { column, ascending } shape. Translates `created_date`/`updated_date` to
 * `created_at`/`updated_at`.
 */
function parseOrderBy(orderBy) {
  if (!orderBy) return { column: 'created_at', ascending: false };
  const desc = orderBy.startsWith('-');
  const raw = desc ? orderBy.slice(1) : orderBy;
  const column =
    raw === 'created_date' ? 'created_at' :
    raw === 'updated_date' ? 'updated_at' :
    raw;
  return { column, ascending: !desc };
}

/** Mirrors `created_at` → `created_date` (etc.) on a row for legacy callers. */
function withVirtualDates(row) {
  if (!row || typeof row !== 'object') return row;
  if (row.created_at && !('created_date' in row)) row.created_date = row.created_at;
  if (row.updated_at && !('updated_date' in row)) row.updated_date = row.updated_at;
  return row;
}

function mapRows(rows) {
  return Array.isArray(rows) ? rows.map(withVirtualDates) : rows;
}

/** Strips fields that the DB owns (id on create, timestamps always). */
function sanitize(data, { allowId = false } = {}) {
  if (!data) return {};
  const { created_date, updated_date, created_at, updated_at, ...rest } = data;
  if (!allowId) {
    const { id, ...withoutId } = rest;
    return withoutId;
  }
  return rest;
}

function reportError(operation, entityName, error) {
  const msg = `${entityName}.${operation} failed: ${error.message || 'unknown error'}`;
  // eslint-disable-next-line no-console
  console.error(msg, error);
  if (typeof window !== 'undefined') {
    toast.error(msg);
  }
}

// -----------------------------------------------------------------------------
// Entity factory
// -----------------------------------------------------------------------------
function makeEntity(entityName) {
  const table = TABLE_FOR[entityName];
  if (!table) throw new Error(`Unknown entity "${entityName}"`);

  return {
    /**
     * entities.X.list(orderBy?, limit?) → Promise<Row[]>
     *
     * @param {string} [orderBy='-created_date'] e.g. "full_name" or "-created_date"
     * @param {number} [limit] Optional row cap.
     */
    async list(orderBy, limit) {
      try {
        const sb = getBrowserClient();
        const { column, ascending } = parseOrderBy(orderBy);
        let query = sb.from(table).select('*').order(column, { ascending });
        if (typeof limit === 'number') query = query.limit(limit);
        const { data, error } = await query;
        if (error) throw error;
        return mapRows(data || []);
      } catch (error) {
        reportError('list', entityName, error);
        throw error;
      }
    },

    /**
     * entities.X.filter(criteria, orderBy?, limit?) → Promise<Row[]>
     *
     * @param {Object} criteria Equality predicates, e.g. { student_id: "..." }.
     */
    async filter(criteria, orderBy, limit) {
      try {
        const sb = getBrowserClient();
        let query = sb.from(table).select('*');
        for (const [key, value] of Object.entries(criteria || {})) {
          if (value === null || value === undefined) {
            query = query.is(key, null);
          } else if (Array.isArray(value)) {
            query = query.in(key, value);
          } else {
            query = query.eq(key, value);
          }
        }
        if (orderBy) {
          const { column, ascending } = parseOrderBy(orderBy);
          query = query.order(column, { ascending });
        }
        if (typeof limit === 'number') query = query.limit(limit);
        const { data, error } = await query;
        if (error) throw error;
        return mapRows(data || []);
      } catch (error) {
        reportError('filter', entityName, error);
        throw error;
      }
    },

    /**
     * entities.X.create(data) → Promise<Row>
     */
    async create(data) {
      try {
        const sb = getBrowserClient();
        const payload = sanitize(data, { allowId: false });
        const { data: row, error } = await sb
          .from(table)
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        return withVirtualDates(row);
      } catch (error) {
        reportError('create', entityName, error);
        throw error;
      }
    },

    /**
     * entities.X.update(id, data) → Promise<Row>
     */
    async update(id, data) {
      try {
        const sb = getBrowserClient();
        const payload = sanitize(data, { allowId: false });
        const { data: row, error } = await sb
          .from(table)
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return withVirtualDates(row);
      } catch (error) {
        reportError('update', entityName, error);
        throw error;
      }
    },

    /**
     * entities.X.delete(id) → Promise<{ id }>
     */
    async delete(id) {
      try {
        const sb = getBrowserClient();
        const { error } = await sb.from(table).delete().eq('id', id);
        if (error) throw error;
        return { id };
      } catch (error) {
        reportError('delete', entityName, error);
        throw error;
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Exported entities map
// -----------------------------------------------------------------------------
export const entities = Object.fromEntries(
  Object.keys(TABLE_FOR).map((name) => [name, makeEntity(name)])
);

// Direct named exports for ergonomic per-entity imports:
//   import { Student, Receipt } from '@/lib/entities'
export const Announcement       = entities.Announcement;
export const AppConfig          = entities.AppConfig;
export const Assessment         = entities.Assessment;
export const Attendance         = entities.Attendance;
export const AuthorizedAdult    = entities.AuthorizedAdult;
export const Certificate        = entities.Certificate;
export const DismissalLog       = entities.DismissalLog;
export const Enrollment         = entities.Enrollment;
export const Group              = entities.Group;
export const LearningAssessment = entities.LearningAssessment;
export const LeaveRequest       = entities.LeaveRequest;
export const Message            = entities.Message;
export const Notification       = entities.Notification;
export const Payment            = entities.Payment;
export const Payroll            = entities.Payroll;
export const PendingRole        = entities.PendingRole;
export const PlacementTest      = entities.PlacementTest;
export const Portfolio          = entities.Portfolio;
export const Receipt            = entities.Receipt;
export const Student            = entities.Student;
export const Teacher            = entities.Teacher;
export const User               = entities.User;

// Re-export `auth` so callers can do:
//   import { entities, auth } from '@/lib/entities'
// (Matches the single-import shape used by the page-porting find-replace.)
export { auth, users }  from './auth';
export { integrations } from './integrations';
