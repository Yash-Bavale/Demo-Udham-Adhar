import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { schemaTypes } from "./schemaTypes";

const projectId = "519jq1ws";

export default defineConfig([
  {
    name: "udyamadhar",
    title: "udyamadhar.in",
    basePath: "/udyamadhar",
    projectId,
    dataset: "production",
    plugins: [structureTool()],
    schema: { types: schemaTypes },
  },
  {
    name: "udyamregistrations",
    title: "udyamregistrations.in",
    basePath: "/udyamregistrations",
    projectId,
    dataset: "udyamregistrations",
    plugins: [structureTool()],
    schema: { types: schemaTypes },
  },
]);
