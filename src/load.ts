import { Resolved, Resolver } from "wit-resolver-ts";
import path, { join } from "path";
import { readFile, mkdtemp, writeFile } from "fs/promises";
import { execa } from "execa";
import { transpile } from "@bytecodealliance/jco";
import { tmpdir } from "os";
import { mkdirp } from "mkdirp";

export type Module = any;
type WitAndModule = [Resolved, any];

/**
 * Loads the WASM file from a path
 */
const loadWasm = async (file: string): Promise<Uint8Array> => {
  const wasmPath = path.resolve(__dirname, file);
  return readFile(wasmPath);
};

/**
 * Extract wit from a wasm file
 */
const extractWit = async (file: string) => {
  const result = await execa("wasm-tools", ["component", "wit", file]);
  return result.stdout;
};

/**
 * Parse a wit string into a resolved object
 */
const parse = (wit: string): Resolved => {
  const resolver = Resolver();
  resolver.register("component.wit", wit);
  return resolver.resolve();
};

/**
 * Loads the module from a WASM component file
 */
const loadModule = async (wasm: Uint8Array) => {
  const transpiled = await transpile(wasm);
  const tmp = await mkdtemp(join(tmpdir(), "wasm-tmp-"));
  let modulePath: string | undefined;
  for (const [name, content] of Object.entries(transpiled.files)) {
    const filePath = path.resolve(tmp, name);
    if (name === "component.js") {
      modulePath = filePath;
    }
    await mkdirp(path.dirname(filePath));
    await writeFile(filePath, content);
  }
  if (!modulePath) {
    throw new Error("modulePath is undefined");
  }
  return import(modulePath);
};

/**
 * Loads the module from a WASM component file, returning both the WIT extracted
 * from it and the module itself.
 */
export const load = async (path: string): Promise<WitAndModule> => {
  const wasm = await loadWasm(path);
  const wit = await extractWit(path);
  const resolved = parse(wit);
  const module = await loadModule(wasm);
  return [resolved, module];
};
