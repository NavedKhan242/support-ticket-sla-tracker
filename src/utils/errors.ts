import { GraphQLError } from "graphql";

export function appError(message: string, code: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code },
  });
}
