import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { profileUpdateBodySchema, type ProfileView } from "@jobportal/shared";

import { makeStore, renderRoute } from "./helpers/renderRoute";
import Profile from "@/components/Profile";
import UpdateProfileDialog from "@/components/UpdateProfileDialog";
import { setBootstrapped, setUser } from "@/redux/authSlice";
import { apiClient } from "@/lib/apiClient";

/** A seeker who has filled everything in. */
const FULL: ProfileView = {
  user: {
    id: "u1",
    portal: "seeker",
    fullName: "Ada Lovelace",
    email: "ada@x.test",
    emailVerified: true,
    avatarUrl: null,
    status: "active",
  },
  phone: "+911234567890",
  seeker: {
    headline: null,
    bio: "Backend engineer",
    skills: ["ts", "node"],
    experienceYears: 6,
    location: "Kolkata",
    salaryMin: 8,
    salaryMax: 20,
    openToRemote: true,
    resumeUrl: null,
    resumeName: null,
  },
  recruiter: null,
};

/** A freshly registered seeker: every optional field still null. */
const EMPTY: ProfileView = {
  ...FULL,
  phone: null,
  seeker: {
    headline: null,
    bio: null,
    skills: [],
    experienceYears: null,
    location: null,
    salaryMin: null,
    salaryMax: null,
    openToRemote: null,
    resumeUrl: null,
    resumeName: null,
  },
};

/**
 * Radix renders `DialogContent` into a portal, so the fields are in
 * `document.body` rather than under `render`'s container.
 */
function renderDialog(profile: ProfileView) {
  return render(
    <Provider store={makeStore()}>
      <UpdateProfileDialog open profile={profile} setOpen={() => {}} onUpdated={() => {}} />
    </Provider>,
  );
}

const control = (name: string) =>
  document.body.querySelector<HTMLInputElement>(`[name="${name}"]`);

/** The whole radio group for a tri-state field. */
const group = (name: string) =>
  Array.from(document.body.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`));

const checkedValue = (name: string) => group(name).find((r) => r.checked)?.value;

function submit() {
  const form = document.body.querySelector("form");
  expect(form).not.toBeNull();
  fireEvent.submit(form!);
}

/**
 * The endpoint's accepted field set and the dialog's control set must be the
 * same set.
 *
 * This is the shape of the defect Phase 5 found: `experienceYears` and
 * `location` were on the seeker model, in `ProfileView`, and read by
 * `toFitSeekerInput` — and absent from `profileUpdateBodySchema`, so no request
 * could set either. Adding them to the schema fixes half of it; a schema field
 * with no control in the only form that posts to the endpoint is still a field
 * no user can set. Deriving the list from the schema means the next field added
 * to it fails here rather than scoring as a permanent unknown.
 */
describe("UpdateProfileDialog covers every field the endpoint accepts", () => {
  const FIELDS = Object.keys(profileUpdateBodySchema.shape);

  it.each(FIELDS)("renders a labelled control for %s", (field) => {
    renderDialog(FULL);
    const el = control(field);
    expect(el, `no control in the dialog posts \`${field}\``).not.toBeNull();
    // Labelled, not merely present: `FormField` wires the association, and an
    // unlabelled numeric input is unusable by a screen reader.
    expect(el!.id).not.toBe("");
    expect(document.body.querySelector(`label[for="${el!.id}"]`)).not.toBeNull();
  });
});

describe("UpdateProfileDialog prefill", () => {
  it("lets the built-in close button update the controlled state", async () => {
    const setOpen = vi.fn();
    render(
      <Provider store={makeStore()}>
        <UpdateProfileDialog open profile={FULL} setOpen={setOpen} onUpdated={() => {}} />
      </Provider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("seeds the fit fields from the profile", async () => {
    renderDialog(FULL);
    // Prefill happens in an effect, so wait for the first field rather than
    // asserting against the initial empty render.
    await waitFor(() => expect(control("experienceYears")).toHaveValue(6));
    expect(control("location")).toHaveValue("Kolkata");
    expect(control("salaryMin")).toHaveValue(8);
    expect(control("salaryMax")).toHaveValue(20);
    expect(checkedValue("openToRemote")).toBe("true");
  });

  it("leaves the fit fields blank for a profile that has never set them", async () => {
    renderDialog(EMPTY);
    await waitFor(() => expect(control("bio")).toHaveValue(""));
    expect(control("experienceYears")).toHaveValue(null);
    expect(control("location")).toHaveValue("");
    expect(control("salaryMin")).toHaveValue(null);
    expect(control("salaryMax")).toHaveValue(null);
    // Not "false" — `remoteFit` no-penalties an unknown and scores an explicit
    // `false` at 0 against a remote role, so a profile that has never answered
    // must land on "no preference", not on an objection nobody made.
    expect(checkedValue("openToRemote")).toBe("");
  });
});

describe("UpdateProfileDialog submit", () => {
  it("posts every fit field, with openToRemote as the string the schema accepts", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, profile: FULL } } as never);

    renderDialog(FULL);
    await waitFor(() => expect(control("experienceYears")).toHaveValue(6));
    submit();

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1] as FormData;
    expect(body.get("experienceYears")).toBe("6");
    expect(body.get("location")).toBe("Kolkata");
    expect(body.get("salaryMin")).toBe("8");
    expect(body.get("salaryMax")).toBe("20");
    // `openToRemote` is a `z.enum([...])` *before* its transform, so a raw
    // boolean fails validation — same as `remote` on `JobCreate`.
    expect(body.get("openToRemote")).toBe("true");
  });

  it("posts each of the three remote answers distinctly", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, profile: FULL } } as never);

    renderDialog(FULL);
    await waitFor(() => expect(checkedValue("openToRemote")).toBe("true"));

    for (const value of ["false", ""]) {
      post.mockClear();
      fireEvent.click(group("openToRemote").find((r) => r.value === value)!);
      submit();
      await waitFor(() => expect(post).toHaveBeenCalled());
      // "No preference" must reach the wire as `""` and not be dropped: an
      // omitted field means "leave it alone", so dropping it would make the
      // stored `true` unclearable from the only form that writes it.
      expect((post.mock.calls[0][1] as FormData).get("openToRemote")).toBe(value);
    }
  });

  /**
   * A blank numeric box clears the stored value; it must not silently keep it.
   *
   * The dialog renders every field seeded from the current profile, so it is
   * authoritative for all of them — posting blank is the user saying "no
   * constraint". The schema's `clearableInt` is what makes that a `null` instead
   * of `Number("")`, which is `0`: `salaryMin: 0` with `salaryMax: 0` is a band
   * no real salary falls inside, and `salaryFit` scores it 0 for every job.
   */
  it("posts a blank numeric field so it clears rather than lingering", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, profile: FULL } } as never);

    renderDialog(FULL);
    await waitFor(() => expect(control("salaryMin")).toHaveValue(8));
    fireEvent.change(control("salaryMin")!, { target: { value: "" } });
    submit();

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1] as FormData;
    expect(body.get("salaryMin")).toBe("");
    // The untouched one still carries its value, so clearing one field is not
    // clearing the pair.
    expect(body.get("salaryMax")).toBe("20");
  });

  /**
   * An inverted band scores every job at 0 on salary, and nothing downstream can
   * tell it apart from a deliberate one — `salaryFit` sees `lo > hi` and no real
   * salary is ever inside. The form is the only place it can be caught, so it is
   * caught before the request rather than stored and quietly wrong.
   */
  it("refuses to submit a salary band whose floor is above its ceiling", async () => {
    const post = vi.spyOn(apiClient, "post");
    renderDialog(FULL);
    await waitFor(() => expect(control("salaryMin")).toHaveValue(8));
    fireEvent.change(control("salaryMin")!, { target: { value: "30" } });

    expect(await screen.findByRole("alert")).toHaveTextContent(/above/i);
    expect(control("salaryMax")).toHaveAttribute("aria-invalid", "true");
    submit();
    expect(post).not.toHaveBeenCalled();
  });

  it("keeps posting the fields it already posted before the fit fields existed", async () => {
    const post = vi
      .spyOn(apiClient, "post")
      .mockResolvedValue({ data: { success: true, profile: FULL } } as never);

    renderDialog(FULL);
    await waitFor(() => expect(control("bio")).toHaveValue("Backend engineer"));
    submit();

    await waitFor(() => expect(post).toHaveBeenCalled());
    const body = post.mock.calls[0][1] as FormData;
    expect(body.get("fullname")).toBe("Ada Lovelace");
    expect(body.get("phoneNumber")).toBe("+911234567890");
    expect(body.get("bio")).toBe("Backend engineer");
    expect(body.get("skills")).toBe("ts, node");
  });

  it("keeps the edit on screen when the request fails", async () => {
    vi.spyOn(apiClient, "post").mockRejectedValue(new Error("nope"));
    renderDialog(FULL);
    await waitFor(() => expect(control("location")).toHaveValue("Kolkata"));
    submit();
    // The dialog stays open on failure — closing it would discard the edit.
    await waitFor(() => expect(screen.getByRole("button", { name: /update/i })).toBeEnabled());
    expect(control("location")).toHaveValue("Kolkata");
  });
});

/**
 * The read side of the same five fields.
 *
 * A page that offers a form for five values and then shows none of them back
 * cannot be checked by the person who filled it in: they set a salary band, land
 * on a job whose badge says the band cost it points, and have nowhere to confirm
 * what they actually stored. The section is the record.
 */
describe("Profile renders the matching preferences it lets you set", () => {
  function mount(profile: ProfileView) {
    vi.spyOn(apiClient, "get").mockImplementation(((url: string) =>
      url === "/user/profile"
        ? Promise.resolve({ data: { success: true, profile } })
        : // useGetAppliedJobs fires too, and logs to console.error if it rejects.
          Promise.resolve({ data: { success: true, items: [], total: 0, page: 1, pages: 1 } })) as never);

    const store = makeStore();
    store.dispatch(setUser(profile.user));
    store.dispatch(setBootstrapped(true));
    return renderRoute(<Profile />, { route: "/profile", store });
  }

  it("shows each stored value", async () => {
    mount(FULL);
    const section = (await screen.findByRole("heading", { name: /matching preferences/i }))
      .closest("div")!;
    expect(section).toHaveTextContent("6 years");
    expect(section).toHaveTextContent("Kolkata");
    expect(section).toHaveTextContent("8");
    expect(section).toHaveTextContent("20");
    expect(section).toHaveTextContent(/open to remote/i);
  });

  it("says what an unset field means rather than showing a blank", async () => {
    mount(EMPTY);
    await screen.findByRole("heading", { name: /matching preferences/i });
    // "Not set" alone reads as a gap in the page; the point is that an unset
    // field stops counting, which is the opposite of scoring zero.
    expect(screen.getByText(/stops? counting/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not set/i).length).toBeGreaterThan(0);
  });

  it("keeps exactly one h1 on the route", async () => {
    mount(FULL);
    await screen.findByRole("heading", { name: /matching preferences/i });
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
