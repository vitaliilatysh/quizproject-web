// Loaded with `node --import`, before anything else in the process, so it has
// to be something Node can execute unaided. It is TypeScript because Node 22
// strips types from .mts on its own; nothing here relies on the esbuild hook
// that this file is what installs.
import { register } from "node:module";

register("./jsx.mts", import.meta.url);
