import { createYoga, createSchema } from "graphql-yoga";
import { createContext } from "./context";
import { resolvers } from "./graphql/resolvers";
import fs from "node:fs";
import path from "node:path";

const typeDefs = fs.readFileSync(path.join(import.meta.dir, "graphql/schema/schema.graphql"), "utf8");
const schema = createSchema({ typeDefs, resolvers });
const yoga = createYoga({
  schema,
  context: ({ request }) => createContext(request),
  cors: { origin: "*", credentials: true, methods: ["POST", "GET", "OPTIONS"] },
});
const server = Bun.serve({ port: 4000, fetch: yoga.fetch });
console.log(`🚀 GraphQL Yoga Server ready at http://localhost:${server.port}/graphql`);
