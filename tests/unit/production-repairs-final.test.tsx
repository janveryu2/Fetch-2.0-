// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { MusicProvider, useMusic } from "@/components/tools/music-provider";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/library",
}));

afterEach(() => {
  cleanup();
});

describe("Phase 5: UserAvatar Component & Fallback Behavior", () => {
  it("renders mascot logo when src is null, undefined, or empty", () => {
    const { container, rerender } = render(
      <UserAvatar src={null} alt="Test Student" size={48} />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toContain("/assets/mascot/fetch-logo.png");
    expect(img?.getAttribute("alt")).toBe("Test Student");

    // Test undefined
    rerender(<UserAvatar src={undefined} alt="Test Student Undefined" size={48} />);
    const imgUndefined = container.querySelector("img");
    expect(imgUndefined?.getAttribute("src")).toContain("/assets/mascot/fetch-logo.png");

    // Test empty string
    rerender(<UserAvatar src="" alt="Test Student Empty" size={48} />);
    const imgEmpty = container.querySelector("img");
    expect(imgEmpty?.getAttribute("src")).toContain("/assets/mascot/fetch-logo.png");
  });

  it("renders custom avatar url when valid src is provided", () => {
    const { container } = render(
      <UserAvatar
        src="https://images.example.com/avatar123.jpg"
        alt="Jane Doe"
        size={64}
      />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://images.example.com/avatar123.jpg");
    expect(img?.getAttribute("alt")).toBe("Jane Doe");
  });

  it("swaps to mascot logo fallback when custom image triggers onError", () => {
    const { container } = render(
      <UserAvatar
        src="https://invalid-domain.com/broken-image.png"
        alt="Broken Image User"
        size={40}
      />,
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://invalid-domain.com/broken-image.png");

    // Simulate image error event
    fireEvent.error(img!);

    // Re-check source after error event
    const fallbackImg = container.querySelector("img");
    expect(fallbackImg?.getAttribute("src")).toContain("/assets/mascot/fetch-logo.png");
  });
});

describe("Phase 4: Persistent Music Architecture & YouTube ToS Compliance", () => {
  function TestMusicConsumer() {
    const music = useMusic();
    return (
      <div>
        <span data-testid="is-playing">
          {music.externalTrack ? music.externalTrack.title : "idle"}
        </span>
        <button
          onClick={() =>
            music.playExternalTrack({
              id: "vivaldi-four-seasons",
              title: "Antonio Vivaldi - The Four Seasons",
              category: "Classical",
              embedUrl: "https://www.youtube-nocookie.com/embed/4rgSzQwe5DQ?autoplay=0",
              watchUrl: "https://www.youtube.com/watch?v=4rgSzQwe5DQ",
            })
          }
        >
          Play Vivaldi
        </button>
        <button onClick={() => music.stopExternalTrack()}>Stop Stream</button>
      </div>
    );
  }

  it("renders children and remains idle initially", () => {
    render(
      <MusicProvider>
        <TestMusicConsumer />
      </MusicProvider>,
    );

    expect(screen.getByTestId("is-playing").textContent).toBe("idle");
    expect(screen.queryByLabelText("Study stream player")).toBeNull();
  });

  it("activates persistent mini-dock with YouTube ToS compliant dimensions on play", () => {
    render(
      <MusicProvider>
        <TestMusicConsumer />
      </MusicProvider>,
    );

    act(() => {
      screen.getByText("Play Vivaldi").click();
    });

    expect(screen.getByTestId("is-playing").textContent).toBe(
      "Antonio Vivaldi - The Four Seasons",
    );

    const playerSection = screen.getByLabelText("Study stream player");
    expect(playerSection).toBeDefined();

    // Check iframe presence and ToS compliance
    const iframe = playerSection.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toContain("autoplay=1");
    expect(iframe?.getAttribute("title")).toBe(
      "YouTube player: Antonio Vivaldi - The Four Seasons",
    );

    // YouTube ToS requires >= 200x200 viewport and unobscured controls
    expect(iframe?.className).toContain("min-h-[200px]");
    expect(iframe?.className).toContain("min-w-[200px]");

    // Stopping stream clears player
    act(() => {
      screen.getByText("Stop Stream").click();
    });

    expect(screen.getByTestId("is-playing").textContent).toBe("idle");
    expect(screen.queryByLabelText("Study stream player")).toBeNull();
  });
});
