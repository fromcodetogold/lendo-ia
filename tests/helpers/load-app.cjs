const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const project = path.resolve(__dirname, "../..");

// Compile the real application modules while replacing only external
// authentication/database boundaries with controlled test fixtures.
function loadApp(relativePath, overrides = {}) {
  const cache = new Map();

  function load(filename) {
    if (cache.has(filename)) return cache.get(filename).exports;
    const appModule = new Module(filename, module);
    appModule.filename = filename;
    appModule.paths = Module._nodeModulePaths(path.dirname(filename));
    cache.set(filename, appModule);
    const nativeRequire = Module.createRequire(filename);

    appModule.require = (request) => {
      if (Object.hasOwn(overrides, request)) return overrides[request];
      if (request.startsWith("@/") || request.startsWith(".")) {
        const base = request.startsWith("@/")
          ? path.join(project, "src", request.slice(2))
          : path.resolve(path.dirname(filename), request);
        const candidate = [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]
          .find((file) => fs.existsSync(file) && fs.statSync(file).isFile());
        if (candidate && /\.tsx?$/.test(candidate)) return load(candidate);
      }
      return nativeRequire(request);
    };

    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: filename,
    });
    appModule._compile(outputText, filename);
    return appModule.exports;
  }

  return load(path.join(project, relativePath));
}

module.exports = { loadApp };
