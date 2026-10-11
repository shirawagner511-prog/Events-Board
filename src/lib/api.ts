// The app talks to Supabase, or — with `npm run demo` — to an in-browser stand-in with sample data.
import * as live from './api.supabase';
import * as demo from './demo/api';

export const DEMO = import.meta.env.VITE_DEMO === '1';
const impl: typeof live = DEMO ? demo : live;

export const {
  joinWithToken, loadMe, signOut, loadReference, loadRange, loadEvent, markTask, saveEvent, setStatus,
  deleteDraft, syncInvites, loadPending, loadDirty, parseMessage, loadRequests, linkRequest,
  createFromRequest, dismissRequest, syncMondayNow, loadAdminPeople, savePerson, resetLink, setActive,
  personalLink, subscribe,
} = impl;
