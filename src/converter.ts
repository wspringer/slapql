import { Resolved } from "wit-resolver-ts";
import {
  GraphQLSchema,
  GraphQLType,
  GraphQLInputType,
  GraphQLOutputType,
  GraphQLString,
  GraphQLInt,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLFieldConfig,
  GraphQLInputFieldConfig,
  GraphQLSchemaConfig,
} from "graphql";

// Helper function to convert kebab-case to camelCase (for field names)
function toCamelCase(str: string): string {
  const camelCase = str.replace(/-([a-z])/g, (_, letter) =>
    letter.toUpperCase()
  );
  return camelCase.charAt(0).toLowerCase() + camelCase.slice(1);
}

// Helper function to convert kebab-case to PascalCase (for type names)
function toPascalCase(str: string): string {
  const camelCase = str.replace(/-([a-z])/g, (_, letter) =>
    letter.toUpperCase()
  );
  return camelCase.charAt(0).toUpperCase() + camelCase.slice(1);
}

// Type definitions that match the actual data structure
type Type =
  | "bool"
  | "u8"
  | "u16"
  | "u32"
  | "u64"
  | "s8"
  | "s16"
  | "s32"
  | "s64"
  | "f32"
  | "f64"
  | "char"
  | "string"
  | "error-context"
  | number;

interface Field {
  name: string;
  type: Type;
  docs?: string;
}

interface Flag {
  name: string;
  docs?: string;
}

interface Case {
  name: string;
  type?: Type;
  docs?: string;
}

interface EnumCase {
  name: string;
  docs?: string;
}

type TypeDefKind =
  | { record: { fields: Field[] } }
  | "resource"
  | { handle: { own?: number; borrow?: number } }
  | { flags: { flags: Flag[] } }
  | { tuple: { types: Type[] } }
  | { variant: { cases: Case[] } }
  | { enum: { cases: EnumCase[] } }
  | { option: Type }
  | { result: { ok?: Type; err?: Type } }
  | { list: Type }
  | { future?: Type }
  | { stream?: Type }
  | { type: Type };

type TypeOwner = { world: number } | { interface: number } | null;

interface TypeDef {
  name: string | null;
  kind: TypeDefKind;
  owner: TypeOwner;
  docs?: string;
  stability?: string;
}

type FunctionKind =
  | "freestanding"
  | "async-freestanding"
  | { method: number }
  | { "async-method": number }
  | { static: number }
  | { "async-static": number }
  | { constructor: number };

interface Function {
  name: string;
  kind: FunctionKind;
  params: Array<{
    name: string;
    type: Type;
  }>;
  result?: Type;
  docs?: string;
  stability?: string;
}

// Helper to resolve type references (kind: { type: N })
function resolveTypeIndex(type: Type, resolved: Resolved): number | undefined {
  if (typeof type !== "number") return undefined;
  let idx: number | undefined = type;
  while (typeof idx === "number") {
    const def: TypeDef | undefined = resolved.types[idx];
    if (
      def &&
      typeof def.kind === "object" &&
      def.kind !== null &&
      "type" in def.kind
    ) {
      if (typeof def.kind.type === "number") {
        idx = def.kind.type;
      } else {
        // If it's a string (primitive), return the original index
        return type;
      }
    } else {
      // If it's not an alias type, return the current index
      return idx;
    }
  }
  return idx;
}

export function createGraphQLSchema(
  resolved: Resolved,
  module: any
): GraphQLSchema {
  // Private state
  const outputTypeCache: Map<number, GraphQLOutputType> = new Map();
  const inputTypeCache: Map<number, GraphQLInputType> = new Map();

  // Private helper functions
  function getWitType(typeIndex: number): TypeDef {
    const type = resolved.types[typeIndex];
    if (!type) {
      throw new Error(
        `Type index ${typeIndex} not found in resolved types. Available types: ${JSON.stringify(
          resolved.types
        )}`
      );
    }
    return type;
  }

  function createRecordType(
    typeIndex: number,
    witType: TypeDef,
    isInput: boolean
  ): GraphQLType {
    const name = witType.name
      ? toPascalCase(witType.name) + (isInput ? "Input" : "")
      : `Record_${typeIndex}${isInput ? "_Input" : ""}`;

    if (
      typeof witType.kind !== "object" ||
      witType.kind === null ||
      !("record" in witType.kind)
    ) {
      throw new Error(
        `Expected record type, got: ${JSON.stringify(witType.kind)}`
      );
    }

    if (isInput) {
      // Create placeholder and cache it
      const placeholder = new GraphQLInputObjectType({ name, fields: {} });
      inputTypeCache.set(typeIndex, placeholder);

      // Now build real fields
      const fields: Record<string, GraphQLInputFieldConfig> = {};
      for (const field of witType.kind.record.fields) {
        fields[toCamelCase(field.name)] = {
          type: convertWitTypeToGraphQLInput(field.type),
        };
      }

      // Create the real type
      const realType = new GraphQLInputObjectType({ name, fields });
      inputTypeCache.set(typeIndex, realType);
      return realType;
    } else {
      // Create placeholder and cache it
      const placeholder = new GraphQLObjectType({ name, fields: {} });
      outputTypeCache.set(typeIndex, placeholder);

      // Now build real fields
      const fields: Record<string, GraphQLFieldConfig<any, any, any>> = {};
      for (const field of witType.kind.record.fields) {
        fields[toCamelCase(field.name)] = {
          type: convertWitTypeToGraphQLOutput(field.type),
        };
      }

      // Create the real type
      const realType = new GraphQLObjectType({ name, fields });
      outputTypeCache.set(typeIndex, realType);
      return realType;
    }
  }

  function convertWitTypeToGraphQLOutput(type: Type): GraphQLOutputType {
    console.error("convertWitTypeToGraphQLOutput called with:", { type });
    const resolvedTypeIndex = resolveTypeIndex(type, resolved);
    console.error("Resolved type index:", { type, resolvedTypeIndex });
    if (resolvedTypeIndex === undefined) {
      if (typeof type === "string") {
        switch (type) {
          case "string":
            return GraphQLString;
          case "u8":
          case "u16":
          case "u32":
          case "s8":
          case "s16":
          case "s32":
            return GraphQLInt;
          case "f32":
          case "f64":
            return GraphQLFloat;
          case "bool":
            return GraphQLBoolean;
          case "u64":
          case "s64":
            return GraphQLString;
          case "char":
            return GraphQLString;
          case "error-context":
            return GraphQLString;
          default:
            throw new Error(`Unsupported primitive type: ${type}`);
        }
      }
      throw new Error(`Expected a primitive type string, got: ${type}`);
    }
    if (typeof resolvedTypeIndex !== "number") {
      throw new Error(
        `Expected resolvedTypeIndex to be a number, got: ${resolvedTypeIndex}`
      );
    }
    if (outputTypeCache.has(resolvedTypeIndex)) {
      return outputTypeCache.get(resolvedTypeIndex)!;
    }
    const witType = getWitType(resolvedTypeIndex);
    console.error("Got WIT type:", { resolvedTypeIndex, witType });
    // If this is an alias (kind: { type: N }), immediately recurse to the target type
    if (
      typeof witType.kind === "object" &&
      witType.kind !== null &&
      "type" in witType.kind &&
      typeof witType.kind.type === "number"
    ) {
      return convertWitTypeToGraphQLOutput(witType.kind.type);
    }
    // For records, create the type
    if (
      typeof witType.kind === "object" &&
      witType.kind !== null &&
      "record" in witType.kind
    ) {
      return createRecordType(
        resolvedTypeIndex,
        witType,
        false
      ) as GraphQLOutputType;
    }
    // For all other types, construct and cache directly
    let graphqlType: GraphQLOutputType;
    if (witType.kind === "resource") {
      graphqlType = GraphQLString;
    } else if ("list" in witType.kind) {
      graphqlType = new GraphQLList(
        convertWitTypeToGraphQLOutput(witType.kind.list)
      );
    } else if ("option" in witType.kind) {
      graphqlType = convertWitTypeToGraphQLOutput(witType.kind.option);
    } else if ("result" in witType.kind) {
      const okType = witType.kind.result.ok
        ? convertWitTypeToGraphQLOutput(witType.kind.result.ok)
        : GraphQLBoolean;
      const errorType = witType.kind.result.err
        ? convertWitTypeToGraphQLOutput(witType.kind.result.err)
        : GraphQLString;
      graphqlType = new GraphQLObjectType({
        name: `Result_${resolvedTypeIndex}`,
        fields: { ok: { type: okType }, error: { type: errorType } } as Record<
          string,
          GraphQLFieldConfig<any, any, any>
        >,
      });
    } else if ("tuple" in witType.kind) {
      const tupleTypes = witType.kind.tuple.types.map((t) =>
        convertWitTypeToGraphQLOutput(t)
      );
      graphqlType = new GraphQLList(tupleTypes[0]);
    } else if ("variant" in witType.kind) {
      const name = witType.name
        ? toPascalCase(witType.name)
        : `Variant_${resolvedTypeIndex}`;
      const fields: Record<string, GraphQLFieldConfig<any, any, any>> = {
        type: { type: GraphQLString },
      };
      for (const case_ of witType.kind.variant.cases) {
        if (case_.type !== undefined) {
          fields[toCamelCase(case_.name)] = {
            type: convertWitTypeToGraphQLOutput(case_.type),
          };
        }
      }
      graphqlType = new GraphQLObjectType({ name, fields });
    } else if ("enum" in witType.kind) {
      graphqlType = GraphQLString;
    } else if ("handle" in witType.kind) {
      graphqlType = GraphQLString;
    } else if ("flags" in witType.kind) {
      graphqlType = GraphQLString;
    } else if ("future" in witType.kind || "stream" in witType.kind) {
      graphqlType = GraphQLString;
    } else {
      console.error("Unsupported kind debug:", { witType });
      throw new Error(
        `Unsupported WIT type kind: ${JSON.stringify(witType.kind)}`
      );
    }
    outputTypeCache.set(resolvedTypeIndex, graphqlType);
    return graphqlType;
  }

  function convertWitTypeToGraphQLInput(type: Type): GraphQLInputType {
    const resolvedTypeIndex = resolveTypeIndex(type, resolved);
    if (resolvedTypeIndex === undefined) {
      if (typeof type === "string") {
        switch (type) {
          case "string":
            return GraphQLString;
          case "u8":
          case "u16":
          case "u32":
          case "s8":
          case "s16":
          case "s32":
            return GraphQLInt;
          case "f32":
          case "f64":
            return GraphQLFloat;
          case "bool":
            return GraphQLBoolean;
          case "u64":
          case "s64":
            return GraphQLString;
          case "char":
            return GraphQLString;
          case "error-context":
            return GraphQLString;
          default:
            throw new Error(`Unsupported primitive type: ${type}`);
        }
      }
      throw new Error(`Expected a primitive type string, got: ${type}`);
    }
    if (typeof resolvedTypeIndex !== "number") {
      throw new Error(
        `Expected resolvedTypeIndex to be a number, got: ${resolvedTypeIndex}`
      );
    }
    if (inputTypeCache.has(resolvedTypeIndex)) {
      return inputTypeCache.get(resolvedTypeIndex)!;
    }
    const witType = getWitType(resolvedTypeIndex);
    // If this is an alias (kind: { type: N }), immediately recurse to the target type
    if (
      typeof witType.kind === "object" &&
      witType.kind !== null &&
      "type" in witType.kind &&
      typeof witType.kind.type === "number"
    ) {
      return convertWitTypeToGraphQLInput(witType.kind.type);
    }
    // For records, create the type
    if (
      typeof witType.kind === "object" &&
      witType.kind !== null &&
      "record" in witType.kind
    ) {
      return createRecordType(
        resolvedTypeIndex,
        witType,
        true
      ) as GraphQLInputType;
    }
    // For all other types, construct and cache directly
    let graphqlType: GraphQLInputType;
    if (witType.kind === "resource") {
      graphqlType = GraphQLString;
    } else if ("list" in witType.kind) {
      graphqlType = new GraphQLList(
        convertWitTypeToGraphQLInput(witType.kind.list)
      );
    } else if ("option" in witType.kind) {
      graphqlType = convertWitTypeToGraphQLInput(witType.kind.option);
    } else if ("result" in witType.kind) {
      const okType = witType.kind.result.ok
        ? convertWitTypeToGraphQLInput(witType.kind.result.ok)
        : GraphQLBoolean;
      const errorType = witType.kind.result.err
        ? convertWitTypeToGraphQLInput(witType.kind.result.err)
        : GraphQLString;
      graphqlType = new GraphQLInputObjectType({
        name: `Result_${resolvedTypeIndex}`,
        fields: { ok: { type: okType }, error: { type: errorType } },
      });
    } else if ("tuple" in witType.kind) {
      const tupleTypes = witType.kind.tuple.types.map((t) =>
        convertWitTypeToGraphQLInput(t)
      );
      graphqlType = new GraphQLList(tupleTypes[0]);
    } else if ("variant" in witType.kind) {
      const name = witType.name
        ? toPascalCase(witType.name)
        : `Variant_${resolvedTypeIndex}`;
      const fields: Record<string, GraphQLInputFieldConfig> = {
        type: { type: GraphQLString },
      };
      for (const case_ of witType.kind.variant.cases) {
        if (case_.type !== undefined) {
          fields[toCamelCase(case_.name)] = {
            type: convertWitTypeToGraphQLInput(case_.type),
          };
        }
      }
      graphqlType = new GraphQLInputObjectType({ name, fields });
    } else if ("enum" in witType.kind) {
      graphqlType = GraphQLString;
    } else if ("handle" in witType.kind) {
      graphqlType = GraphQLString;
    } else if ("flags" in witType.kind) {
      graphqlType = GraphQLString;
    } else if ("future" in witType.kind || "stream" in witType.kind) {
      graphqlType = GraphQLString;
    } else {
      console.error("Unsupported kind debug:", { witType });
      throw new Error(
        `Unsupported WIT type kind: ${JSON.stringify(witType.kind)}`
      );
    }
    inputTypeCache.set(resolvedTypeIndex, graphqlType);
    return graphqlType;
  }

  function createInputType(
    functionName: string,
    params: Array<{ name: string; type: Type }>
  ): GraphQLInputType {
    const fields: Record<string, GraphQLInputFieldConfig> = {};
    for (const param of params) {
      fields[toCamelCase(param.name)] = {
        type: new GraphQLNonNull(convertWitTypeToGraphQLInput(param.type)),
      };
    }

    return new GraphQLInputObjectType({
      name: `${toPascalCase(functionName)}Input`,
      fields,
    });
  }

  // Main schema creation logic
  const world = resolved.worlds[0];
  const queryFields: Record<string, GraphQLFieldConfig<any, any, any>> = {};

  for (const [name, export_] of Object.entries(world.exports)) {
    if (
      typeof export_ === "object" &&
      export_ !== null &&
      "function" in export_
    ) {
      const func = (export_ as { function: Function }).function;
      console.error("Function debug:", {
        name,
        result: func.result,
        resolvedResult:
          func.result != null
            ? resolveTypeIndex(func.result, resolved)
            : undefined,
      });
      const inputType = createInputType(name, func.params);
      const returnType =
        func.result != null
          ? convertWitTypeToGraphQLOutput(func.result)
          : GraphQLBoolean;

      queryFields[toCamelCase(name)] = {
        type: returnType,
        args: {
          input: { type: inputType },
        },
        resolve: async (_: any, { input }: { input: any }) => {
          try {
            const args = func.params.map(
              (param) => input[toCamelCase(param.name)]
            );
            const camelCaseName = toCamelCase(name);
            return await module[camelCaseName](...args);
          } catch (error: unknown) {
            if (error instanceof Error) {
              throw new Error(`Error executing ${name}: ${error.message}`);
            }
            throw new Error(`Unknown error executing ${name}`);
          }
        },
      };
    }
  }

  // Create the Query type
  const QueryType = new GraphQLObjectType({
    name: "Query",
    fields: queryFields,
  });

  // Create and return the schema directly
  return new GraphQLSchema({
    query: QueryType,
  });
}
