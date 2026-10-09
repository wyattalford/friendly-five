import { assembleApplication } from "./src/assembly.ts";

export default {
  assemble: assembleApplication,
  title: "FriendlyFive",
  design: {
    version: 1,
    documents: [
      new URL("./design/types.md", import.meta.url),
      new URL("./design/compositions/FriendlyFive.md", import.meta.url),
    ],
  },
};
