import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import createWebStorage from "redux-persist/lib/storage/createWebStorage";
import { useDispatch, useSelector, type TypedUseSelectorHook } from "react-redux";

import authSlice from "./authSlice";
import jobSlice from "./jobSlice";
import companySlice from "./companySlice";
import applicationSlice from "./applicationSlice";

/**
 * `redux-persist/lib/storage` is the package's own lazy accessor for
 * `window.localStorage`. Vite's dependency pre-bundler can hand back a stub
 * accessor whose `getItem` never got the real storage attached to it — the
 * `TypeError: storage.getItem is not a function` you saw in DevTools. Passing
 * `createWebStorage("local")` constructs the adapter explicitly, so the
 * lazy-resolution path never runs and no stub is ever installed.
 */
const storage = createWebStorage("local");

const persistConfig = {
  key: "root",
  // 1 -> 2: every browser that has used this app has a LegacyUser in
  // localStorage under version 1 — `{ fullname, phoneNumber, role, profile }`.
  // redux-persist rehydrates whatever it finds, so without this bump the store
  // would come up holding an object that TypeScript insists is a SessionUser and
  // that every component reads incorrectly: `user.fullName` undefined,
  // `user.portal` undefined, so ProtectedRoute fails open or closed at random.
  //
  // No migration function, because there is nothing to migrate: `role` does not
  // determine `portal` reliably (a legacy "student" is a seeker, but the account
  // may not exist on that portal until the migration runs), and `/me` gives the
  // truth in one request anyway. Bumping the version discards the old subtree,
  // which is the intended behaviour.
  version: 2,
  storage,
};

/**
 * `bootstrapped` and `loading` are session-lifetime flags, not cached data, and
 * persisting them is actively wrong: a rehydrated `bootstrapped: true` tells
 * ProtectedRoute that `/me` has already answered when it has not even been
 * sent, so the guard rules on a stale `user` and either flashes admin UI at a
 * signed-out visitor or bounces a signed-in recruiter. Only `user` is worth
 * caching, and only to avoid a signed-out flicker while `/me` is in flight.
 *
 * A nested persistReducer rather than a top-level `blacklist`, because
 * redux-persist's blacklist matches top-level keys only — `"auth.bootstrapped"`
 * is not a path it understands and would silently do nothing.
 */
const persistedAuth = persistReducer(
  { key: "auth", version: 2, storage, blacklist: ["bootstrapped", "loading"] },
  authSlice,
);

const rootReducer = combineReducers({
  auth: persistedAuth,
  job: jobSlice,
  company: companySlice,
  application: applicationSlice,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

/**
 * Created here rather than in main.tsx so there is exactly one persistor for
 * this store. Two would race on rehydration.
 */
export const persistor = persistStore(store);

export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;

/** Typed hooks — the bare useSelector returns unknown under strict mode. */
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

export default store;
