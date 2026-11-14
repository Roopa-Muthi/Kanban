import type { components, paths } from "./apiSchema";

// Everything here comes from the generated schema. Don't hand-write API shapes: run
// `npm run gen:api` after the backend changes and let the compiler find what broke.

type Schemas = components["schemas"];

// The JSON body of an endpoint's response, picked by path, method and status code.
type JsonBody<T> = T extends { content: { "application/json": infer B } } ? B : never;

// What the server returns
export type User = Schemas["User"];
export type Board = Schemas["Board"];
export type BoardDetail = Schemas["BoardDetail"];
export type Column = Schemas["ColumnWithCards"]; // a column with its cards, as a board returns it
export type ColumnRecord = Schemas["Column"]; // a column on its own, as /columns returns it
export type Card = Schemas["Card"];

// What the server accepts
export type BoardRequest = Schemas["BoardRequest"];
export type ColumnRequest = Schemas["ColumnRequest"];
export type ColumnChanges = Schemas["PatchedColumnRequest"];
export type CardRequest = Schemas["CardRequest"];
export type CardChanges = Schemas["PatchedCardRequest"];
export type MoveCardRequest = Schemas["MoveCardRequest"];
export type RegisterPayload = Schemas["RegisterRequest"];

// Token responses, picked by endpoint
export type LoginResponse = JsonBody<paths["/auth/login"]["post"]["responses"][200]>;
export type RefreshResponse = JsonBody<paths["/auth/refresh"]["post"]["responses"][200]>;