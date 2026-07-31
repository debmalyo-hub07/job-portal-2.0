import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { LegacyUser } from "@jobportal/shared";

type AuthState = {
  loading: boolean;
  user: LegacyUser | null;
};

const initialState: AuthState = {
  loading: false,
  user: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setUser: (state, action: PayloadAction<LegacyUser | null>) => {
      state.user = action.payload;
    },
  },
});

export const { setLoading, setUser } = authSlice.actions;
export default authSlice.reducer;
