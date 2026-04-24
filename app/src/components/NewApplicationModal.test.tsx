import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewApplicationModal } from "./NewApplicationModal";

const applicationResponse = {
  id: "a1",
  company_id: "c-new",
  status: "company_research_pending",
  applied: false,
  email_sent: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z"
};

const renderModal = (props: Partial<Parameters<typeof NewApplicationModal>[0]> = {}) => {
  const onClose = vi.fn();
  const onSuccess = vi.fn();
  render(
    <MemoryRouter>
      <NewApplicationModal
        open
        onClose={onClose}
        companies={[]}
        editing={null}
        onSuccess={onSuccess}
        {...props}
      />
    </MemoryRouter>
  );
  return { onClose, onSuccess };
};

const requestBody = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

const deferredResponse = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

describe("NewApplicationModal", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("creates an application from a typed company name without a preexisting company", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response(JSON.stringify(applicationResponse), { status: 201 }));
    const { onSuccess } = renderModal();

    await userEvent.type(screen.getByRole("textbox", { name: "Company name" }), "New Co");
    await userEvent.type(screen.getByRole("textbox", { name: "Company website (optional)" }), "https://new.example");
    await userEvent.type(screen.getByRole("textbox", { name: "Job link (optional)" }), "https://jobs.example/new");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/v1/applications/bootstrap");
    expect((init as RequestInit).method).toBe("POST");
    expect(requestBody(fetchMock.mock.calls[0])).toMatchObject({
      company_name: "New Co",
      company_website: "https://new.example",
      job_post: { job_link: "https://jobs.example/new", job_description: null }
    });
  });

  it("keeps typed create fields when the parent rerenders", async () => {
    const Harness = () => {
      const [rerenders, setRerenders] = useState(0);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setRerenders((count) => count + 1)}>
            Parent rerender {rerenders}
          </button>
          <NewApplicationModal
            open
            onClose={vi.fn()}
            companies={[]}
            editing={null}
            onSuccess={vi.fn()}
          />
        </MemoryRouter>
      );
    };
    render(<Harness />);

    await userEvent.type(screen.getByRole("textbox", { name: "Company name" }), "Persistent Co");
    await userEvent.type(screen.getByRole("textbox", { name: "Company website (optional)" }), "https://persistent.example");
    await userEvent.type(screen.getByRole("textbox", { name: "Job link (optional)" }), "https://jobs.example/persistent");
    await userEvent.click(screen.getByRole("button", { name: /Parent rerender/ }));

    expect(screen.getByRole("textbox", { name: "Company name" })).toHaveValue("Persistent Co");
    expect(screen.getByRole("textbox", { name: "Company website (optional)" })).toHaveValue("https://persistent.example");
    expect(screen.getByRole("textbox", { name: "Job link (optional)" })).toHaveValue("https://jobs.example/persistent");
  });

  it("does not auto-select the first company search result", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/companies")) {
        return Promise.resolve(
          new Response(JSON.stringify([{ id: "c2", name: "Beta Labs", created_at: "", updated_at: "" }]), {
            status: 200
          })
        );
      }
      return Promise.resolve(new Response(JSON.stringify(applicationResponse), { status: 201 }));
    });
    const { onSuccess } = renderModal();

    await userEvent.type(screen.getByRole("textbox", { name: "Company name" }), "Brand New");
    await userEvent.type(screen.getByRole("textbox", { name: "Use an existing company (optional)" }), "Beta");
    expect(await screen.findByRole("button", { name: /Beta Labs/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const createCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/v1/applications/bootstrap")
    );
    expect(createCall).toBeTruthy();
    expect(requestBody(createCall!)).toMatchObject({ company_name: "Brand New" });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).endsWith("/api/v1/applications"))
    ).toBe(false);
  });

  it("uses an existing company only after explicit selection", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/companies")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([{ id: "c2", name: "Beta Labs", website: "https://beta.example", created_at: "", updated_at: "" }]),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ ...applicationResponse, company_id: "c2" }), { status: 201 }));
    });
    const { onSuccess } = renderModal();

    await userEvent.type(screen.getByRole("textbox", { name: "Company name" }), "Beta");
    await userEvent.type(screen.getByRole("textbox", { name: "Use an existing company (optional)" }), "Beta");
    await userEvent.click(await screen.findByRole("button", { name: /Beta Labs/ }));
    expect(screen.getByText("Using existing company: Beta Labs")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const createCall = fetchMock.mock.calls.find(([input]) => String(input).endsWith("/api/v1/applications"));
    expect(createCall).toBeTruthy();
    expect(requestBody(createCall!)).toMatchObject({ company_id: "c2" });
  });

  it("restores the typed company name after deselecting an explicit company choice", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/companies")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([{ id: "c2", name: "Beta Labs", website: "https://beta.example", created_at: "", updated_at: "" }]),
            { status: 200 }
          )
        );
      }
      return Promise.resolve(new Response(JSON.stringify(applicationResponse), { status: 201 }));
    });
    const { onSuccess } = renderModal();

    await userEvent.type(screen.getByRole("textbox", { name: "Company name" }), "Brand New");
    await userEvent.type(screen.getByRole("textbox", { name: "Use an existing company (optional)" }), "Beta");
    await userEvent.click(await screen.findByRole("button", { name: /Beta Labs/ }));
    expect(screen.getByText("Using existing company: Beta Labs")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Company name" })).toHaveValue("Brand New");

    await userEvent.click(screen.getByRole("button", { name: "Use typed name" }));
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    const createCall = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/v1/applications/bootstrap")
    );
    expect(createCall).toBeTruthy();
    expect(requestBody(createCall!)).toMatchObject({ company_name: "Brand New" });
  });

  it("shows archived-company conflict details and restores explicitly", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              code: "archived_company_name_exists",
              company_id: "c-old",
              name: "Old Co",
              archive_reason: "Duplicate target"
            }
          }),
          { status: 409 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(applicationResponse), { status: 201 }));
    const { onSuccess } = renderModal();

    await userEvent.type(screen.getByRole("textbox", { name: "Company name" }), "Old Co");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Archived company found: Old Co")).toBeInTheDocument();
    expect(screen.getByText("Reason: Duplicate target")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Restore archived company and create application" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(requestBody(fetchMock.mock.calls[1])).toMatchObject({
      company_name: "Old Co",
      acknowledge_reuse_of_archived_company: true
    });
  });

  it("turns duplicate-company conflicts into an explicit existing-company choice", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            detail: {
              code: "company_name_exists",
              company_id: "c-existing",
              name: "Existing Co"
            }
          }),
          { status: 409 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...applicationResponse, company_id: "c-existing" }), {
          status: 201
        })
      );
    const { onSuccess } = renderModal();

    await userEvent.type(screen.getByRole("textbox", { name: "Company name" }), "Existing Co");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("A company named Existing Co already exists.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Use existing company" }));
    expect(screen.getByText("Using existing company: Existing Co")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(requestBody(fetchMock.mock.calls[1])).toMatchObject({ company_id: "c-existing" });
  });

  it("ignores company search results after the search is cleared", async () => {
    const fetchMock = vi.mocked(fetch);
    const pendingSearch = deferredResponse();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes("/api/v1/companies")) return pendingSearch.promise;
      return Promise.resolve(new Response(JSON.stringify(applicationResponse), { status: 201 }));
    });
    renderModal();

    const search = screen.getByRole("textbox", { name: "Use an existing company (optional)" });
    await userEvent.type(search, "Beta");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await userEvent.clear(search);

    pendingSearch.resolve(
      new Response(JSON.stringify([{ id: "c2", name: "Beta Labs", created_at: "", updated_at: "" }]), {
        status: 200
      })
    );

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Beta Labs/ })).not.toBeInTheDocument();
    });
  });

  it("ignores company search results after the modal closes and reopens", async () => {
    const fetchMock = vi.mocked(fetch);
    const pendingSearch = deferredResponse();
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      if (String(input).includes("/api/v1/companies")) return pendingSearch.promise;
      return Promise.resolve(new Response(JSON.stringify(applicationResponse), { status: 201 }));
    });

    const Harness = () => {
      const [open, setOpen] = useState(true);
      return (
        <MemoryRouter>
          <button type="button" onClick={() => setOpen(true)}>
            Reopen
          </button>
          <NewApplicationModal
            open={open}
            onClose={() => setOpen(false)}
            companies={[]}
            editing={null}
            onSuccess={vi.fn()}
          />
        </MemoryRouter>
      );
    };
    render(<Harness />);

    await userEvent.type(screen.getByRole("textbox", { name: "Use an existing company (optional)" }), "Beta");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("form", { name: "New application" })).not.toBeInTheDocument();
    });

    pendingSearch.resolve(
      new Response(JSON.stringify([{ id: "c2", name: "Beta Labs", created_at: "", updated_at: "" }]), {
        status: 200
      })
    );
    await userEvent.click(screen.getByRole("button", { name: "Reopen" }));

    await waitFor(() => {
      expect(screen.getByRole("form", { name: "New application" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Beta Labs/ })).not.toBeInTheDocument();
    });
  });
});
