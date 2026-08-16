import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Portal, SessionUser } from "@jobportal/shared";

type PortalUsers = Partial<Record<Portal, SessionUser>>;
type PortalFlags = Record<Portal, boolean>;

export type AuthState = {
  loading: boolean;
  /** Compatibility view of the portal currently represented by the URL. */
  user: SessionUser | null;
  /**
   * Whether `/me` has answered yet. Distinct from `user === null`, which cannot
   * tell "signed out" from "not asked yet" — and a guard that cannot tell those
   * apart bounces a signed-in recruiter to the home page on every hard reload.
   */
  bootstrapped: boolean;
  activePortal: Portal | null;
  sessions: PortalUsers;
  bootstrappedPortals: PortalFlags;
};

const defaultFlags = (): PortalFlags => ({
  seeker: false,
  recruiter: false,
  admin: false,
});

const initialState: AuthState = {
  loading: false,
  user: null,
  bootstrapped: false,
  activePortal: null,
  sessions: {},
  bootstrappedPortals: defaultFlags(),
};

function ensureState(state: AuthState): void {
  if (!state.sessions) state.sessions = {};
  if (!state.bootstrappedPortals) state.bootstrappedPortals = defaultFlags();
}

function cachedUser(state: AuthState, portal: Portal): SessionUser | null {
  if (!state) return null;
  return state.sessions?.[portal] ?? (state.user?.portal === portal ? state.user : null) ?? null;
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setUser: (state, action: PayloadAction<SessionUser | null>) => {
      ensureState(state);
      const user = action.payload;
      if (user) {
        state.sessions[user.portal] = user;
        state.bootstrappedPortals[user.portal] = true;
        state.activePortal = user.portal;
        state.user = user;
        state.bootstrapped = true;
        return;
      }

      if (state.activePortal) {
        delete state.sessions[state.activePortal];
        state.bootstrappedPortals[state.activePortal] = true;
      }
      state.user = null;
      state.bootstrapped = true;
    },
    setBootstrapped: (state, action: PayloadAction<boolean>) => {
      ensureState(state);
      state.bootstrapped = action.payload;
      if (state.activePortal) state.bootstrappedPortals[state.activePortal] = action.payload;
    },
    setActivePortal: (state, action: PayloadAction<Portal>) => {
      ensureState(state);
      const portal = action.payload;
      state.activePortal = portal;
      state.user = cachedUser(state, portal);
      state.bootstrapped = state.bootstrappedPortals[portal] ?? false;
    },
    setPortalSession: (
      state,
      action: PayloadAction<{ portal: Portal; user: SessionUser }>,
    ) => {
      ensureState(state);
      const { portal, user } = action.payload;
      if (user.portal !== portal) return;
      state.sessions[portal] = user;
      if (state.activePortal === portal) state.user = user;
    },
    clearPortalSession: (state, action: PayloadAction<Portal>) => {
      ensureState(state);
      const portal = action.payload;
      delete state.sessions[portal];
      state.bootstrappedPortals[portal] = true;
      if (state.activePortal === portal) {
        state.user = null;
        state.bootstrapped = true;
      }
    },
    setPortalBootstrapped: (
      state,
      action: PayloadAction<{ portal: Portal; value: boolean }>,
    ) => {
      ensureState(state);
      const { portal, value } = action.payload;
      state.bootstrappedPortals[portal] = value;
      if (state.activePortal === portal) state.bootstrapped = value;
    },
  },
});

export function userForPortal(state: AuthState, portal: Portal): SessionUser | null {
  return cachedUser(state, portal);
}

export function portalIsBootstrapped(state: AuthState, portal: Portal): boolean {
  return state?.bootstrappedPortals?.[portal] ?? false;
}

export const {
  clearPortalSession,
  setActivePortal,
  setBootstrapped,
  setLoading,
  setPortalBootstrapped,
  setPortalSession,
  setUser,
} = authSlice.actions;
export default authSlice.reducer;
