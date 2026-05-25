"use client";

import { useState } from "react";
import { userImageUrl } from "@/lib/userImage";
import { cn } from "@/lib/utils";

type Dict = { inProfile: string; past: string; empty: string };

/**
 * The user's photos as a tabbed gallery: "in profile" (the images currently
 * attached to data.images, in order) and "past uploads" (files still in the
 * user's Storage folder that are no longer attached to the profile). A
 * thumbnail opens the full image in a new tab.
 */
export function UserPhotos({
  userId,
  profile,
  past,
  dict,
}: {
  userId: string;
  profile: string[];
  past: string[];
  dict: Dict;
}) {
  const [tab, setTab] = useState<"profile" | "past">("profile");
  const files = tab === "profile" ? profile : past;

  const tabs = [
    { key: "profile" as const, label: dict.inProfile, count: profile.length },
    { key: "past" as const, label: dict.past, count: past.length },
  ];

  return (
    <div>
      <div className="mb-3 inline-flex rounded-lg border border-border p-0.5 text-sm">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium tabular-nums transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {dict.empty}
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {files.map((name) => {
            const url = userImageUrl(userId, name);
            return (
              <a
                key={name}
                href={url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden rounded-lg border border-border bg-muted transition-opacity hover:opacity-90"
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
