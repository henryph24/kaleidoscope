"use client";

import dynamic from "next/dynamic";

export const VectorSpaceCanvas = dynamic(
  () => import("./VectorSpaceCanvas").then((m) => m.VectorSpaceCanvas),
  { ssr: false },
);
