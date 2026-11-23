import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchEvidenceFiles } from "./governed-evidence-file-picker";

const endpoint = "/api/evidence-files?domain=training";
const uploaded = {
  id: "uploaded",
  originalName: "checklist.txt",
  sha256: "f".repeat(64),
  status: "PENDING_SCAN",
};

function list(status: string) {
  return Response.json({ data: [{ ...uploaded, status }] });
}

describe("governed evidence scan refresh", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(["AVAILABLE", "QUARANTINED"])("refreshes pending status to %s and stops", async (status) => {
    const fetchFiles = vi.fn().mockResolvedValueOnce(list("PENDING_SCAN")).mockResolvedValueOnce(list(status));
    vi.stubGlobal("fetch", fetchFiles);
    const onFiles = vi.fn();
    const onStop = vi.fn();
    const cancel = watchEvidenceFiles(endpoint, undefined, onFiles, onStop);

    await vi.advanceTimersByTimeAsync(15_000);
    expect(onFiles).toHaveBeenLastCalledWith([{ ...uploaded, status }]);
    expect(fetchFiles).toHaveBeenLastCalledWith(endpoint, expect.objectContaining({ cache: "no-store" }));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchFiles).toHaveBeenCalledTimes(2);
    expect(onStop).not.toHaveBeenCalled();
    cancel();
  });

  it("continues checking after a temporary failure after upload", async () => {
    const fetchFiles = vi.fn().mockRejectedValueOnce(new Error("network unavailable"))
      .mockResolvedValueOnce(list("AVAILABLE"));
    vi.stubGlobal("fetch", fetchFiles);
    const onFiles = vi.fn();
    const cancel = watchEvidenceFiles(endpoint, uploaded.id, onFiles, vi.fn());

    await vi.advanceTimersByTimeAsync(15_000);
    expect(onFiles).toHaveBeenCalledExactlyOnceWith([{ ...uploaded, status: "AVAILABLE" }]);
    cancel();
  });

  it("pauses automatic reads when a file stays queued", async () => {
    const fetchFiles = vi.fn(async () => list("PENDING_SCAN"));
    vi.stubGlobal("fetch", fetchFiles);
    const onStop = vi.fn();
    const cancel = watchEvidenceFiles(endpoint, uploaded.id, vi.fn(), onStop);

    await vi.advanceTimersByTimeAsync(300_000);
    expect(fetchFiles).toHaveBeenCalledTimes(11);
    expect(onStop).toHaveBeenCalledTimes(1);
    cancel();
  });

  it("stops on access errors and when the picker closes", async () => {
    const fetchFiles = vi.fn().mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockImplementation(async () => list("PENDING_SCAN"));
    vi.stubGlobal("fetch", fetchFiles);
    const onStop = vi.fn();
    const denied = watchEvidenceFiles(endpoint, uploaded.id, vi.fn(), onStop);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchFiles).toHaveBeenCalledTimes(1);
    expect(onStop).toHaveBeenCalledTimes(1);
    denied();

    const cancel = watchEvidenceFiles(endpoint, uploaded.id, vi.fn(), vi.fn());
    await vi.advanceTimersByTimeAsync(0);
    cancel();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchFiles).toHaveBeenCalledTimes(2);
    expect(fetchFiles.mock.calls[1][1].signal.aborted).toBe(true);
  });
});
