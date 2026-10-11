// Row shapes shared by the edge functions and the web app.
export type EventStatus = 'pending' | 'published' | 'cancelled';
export type Category = 'events' | 'kitchen' | 'welfare' | 'cafe';

export interface EventRow {
  id: string;
  status: EventStatus;
  tentative: boolean;
  category: Category;
  title: string;
  event_date: string;          // YYYY-MM-DD
  start_time: string | null;   // HH:MM[:SS]
  end_time: string | null;
  prep_time: string | null;
  location: string | null;
  guests: number | null;
  menu: string | null;
  requester: string | null;
  lead: string | null;
  teardown: string | null;
  suppliers: string | null;
  paid_staff: number | null;   // paid operations workers hired for the event
  notes: string | null;
  source: 'manual' | 'monday';
  monday_item_id: string | null;
  monday_dirty: boolean;
  content_updated_at: string;
  published_at: string | null;
  updated_at: string;
}

export interface TaskRow {
  id: string;
  event_id: string;
  department_id: string;
  description: string;
  sort: number;
  seen_at: string | null;
  seen_by: string | null;
  done_at: string | null;
  done_by: string | null;
  content_updated_at: string;
}

export interface Department { id: string; name: string; color: string; sort: number }

export interface Person {
  id: string;
  name: string;
  role_title: string | null;
  email: string | null;
  is_admin: boolean;
  active: boolean;
}
