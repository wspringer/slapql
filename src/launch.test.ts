import { transpile, componentWit } from "@bytecodealliance/jco";
import { describe, it } from "vitest";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { tmpdir } from "os";
import { mkdtemp } from "fs/promises";
import { join } from "path";
import { mkdirp } from "mkdirp";
import { Resolver } from "wit-resolver-ts";
import { execa } from "execa";

describe("lauch", () => {
  it("should be able to transpile", async () => {
    const wasmPath = path.resolve(__dirname, "../reverse.wasm");
    const wasm = await readFile(wasmPath);
    const result = await execa("wasm-tools", ["component", "wit", wasmPath]);
    const wit = result.stdout;

    const resolver = Resolver();
    resolver.register("component.wit", wit);
    const resolved = resolver.resolve();

    console.info(resolved.worlds[0].exports);

    const transpiled = await transpile(wasm);
    console.info(transpiled);
    const tmp = await mkdtemp(join(tmpdir(), "wasm-tmp-"));
    console.info(tmp);
    let modulePath: string | undefined;
    for (const [name, content] of Object.entries(transpiled.files)) {
      const filePath = path.resolve(tmp, name);
      if (name === "component.js") {
        modulePath = filePath;
      }
      await mkdirp(path.dirname(filePath));
      console.info(filePath);
      await writeFile(filePath, content);
    }
    console.info(transpiled.exports);
    if (!modulePath) {
      throw new Error("modulePath is undefined");
    }
    const module = await import(modulePath);
    console.info(module.reverse);
    console.info(typeof module.reverse);
    console.info(module.reverse("foo"));
  });
});
