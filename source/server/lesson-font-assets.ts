import express, { type Express } from "express";
import { existsSync } from "node:fs";
import path from "node:path";

/** Same-origin font delivery also works on the API host in split deployments. */
export function registerLessonFontAssets(app: Express): void {
  const built = path.resolve("dist/public/fonts");
  const directory = existsSync(built) ? built : path.resolve("client/public/fonts");
  app.use("/fonts", express.static(directory, { maxAge: "1d", fallthrough: false, dotfiles: "deny" }));
}
