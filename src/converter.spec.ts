import path from "path";
import { describe, expect, it } from "vitest";
import { createGraphQLSchema } from "./converter.js";
import { load } from "./load.js";
import { printSchema } from "graphql";
import { graphql } from "graphql";

describe("createGraphQLSchema", () => {
  it("should create a GraphQL schema", async () => {
    const wasmFile = path.resolve(import.meta.dirname, "../reverse.wasm");
    const [resolved, module] = await load(wasmFile);
    const schema = createGraphQLSchema(resolved, module);
    expect(printSchema(schema)).toMatchSnapshot();
  });

  it("should execute reverse function through GraphQL", async () => {
    const wasmFile = path.resolve(import.meta.dirname, "../reverse.wasm");
    const [resolved, module] = await load(wasmFile);
    const schema = createGraphQLSchema(resolved, module);

    // Test the reverse function with the correct input signature
    const result = await graphql({
      schema,
      source: `
        query {
          reverse(input: { str: "hello" })
        }
      `,
    });

    expect(result.errors).toBeUndefined();
    expect(result.data?.reverse).toBe("olleh");
  });

  it("should handle errors gracefully", async () => {
    const wasmFile = path.resolve(import.meta.dirname, "../reverse.wasm");
    const [resolved, module] = await load(wasmFile);
    const schema = createGraphQLSchema(resolved, module);

    // Test with invalid input (missing required str field)
    const result = await graphql({
      schema,
      source: `
        query {
          reverse(input: {})
        }
      `,
    });
    expect(result.errors).toBeDefined();
  });
});
