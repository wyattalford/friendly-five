import { assembleApplication } from "./src/assembly.ts";

export default {
  assemble: assembleApplication,
  title: "FriendlyFive",
  design: {
    version: 1,
    documents: [new URL("./design/types.md", import.meta.url)],
  },
};
