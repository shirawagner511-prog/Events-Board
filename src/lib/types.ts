export type { Category, Department, EventRow, EventStatus, Person, TaskRow } from '../../supabase/functions/_shared/types.ts';

export interface Me {
  id: string;
  name: string;
  role_title: string | null;
  is_admin: boolean;
  departments: string[];
}

export interface MondayRequest {
  item_id: string;
  fields: {
    title: string; event_date: string; start_time: string | null; guests: number | null;
    location: string | null; menu: string | null; requester: string; notes: string | null;
  };
  status: 'new' | 'linked' | 'dismissed';
  event_id: string | null;
  suggested_event_id: string | null;
  received_at: string;
}

export interface AdminPerson {
  id: string; name: string; role_title: string | null; email: string | null; is_admin: boolean;
  active: boolean; link_token: string; departments: string[]; devices: number;
}

/** What the editor works with: an event plus its task list. */
export interface EventDraft {
  id?: string;
  title: string;
  event_date: string;
  start_time: string;
  end_time: string;
  prep_time: string;
  location: string;
  guests: string;
  menu: string;
  requester: string;
  lead: string;
  teardown: string;
  suppliers: string;
  notes: string;
  category: import('../../supabase/functions/_shared/types.ts').Category;
  tentative: boolean;
  tasks: { id?: string; department_id: string; description: string }[];
}
