import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { SessionUser } from "@jobportal/shared";

type AuthState = {
  loading: boolean;
  user: SessionUser | null;
  /**
   * Whether `/me` has answered yet. Distinct from `user === null`, which cannot
   * tell "signed out" from "not asked yet" — and a guard that cannot tell those
   * apart bounces a signed-in recruiter to the home page on every hard reload.
   */
  bootstrapped: boolean;
};

const initialState: AuthState = {
  loading: false,
  user: null,
  bootstrapped: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setUser: (state, action: PayloadAction<SessionUser | null>) => {
      state.user = action.payload;
    },
    setBootstrapped: (state, action: PayloadAction<boolean>) => {
      state.bootstrapped = action.payload;
    },
  },
});

export const { setLoading, setUser, setBootstrapped } = authSlice.actions;
export default authSlice.reducer;
