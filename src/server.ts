import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import path from "path";
import { load } from "./load.js";
import { createGraphQLSchema } from "./converter.js";

export async function startServer(wasmPath: string) {
  // Load the WASM module
  const [resolved, module] = await load(wasmPath);

  // Create the GraphQL schema
  const schema = createGraphQLSchema(resolved, module);

  // Create the Apollo Server
  const server = new ApolloServer({
    schema,
  });

  // Start the server
  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
  });

  console.log(`🚀 Server ready at ${url}`);
  console.log(`📚 GraphQL Playground available at ${url}`);
}
