import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Spec 2026-10-06-s7-workflow-rendbetetel (§4/10, forrás-ellenőrző teszt): a lecke-/anyag-/tudástár-tartalmat MÓDOSÍTÓ
 * adatbázis-írások statikus feltérképezése. Minden írási helytől (drizzle `.insert/.update/.delete(<tábla>)` vagy nyers SQL) a
 * hívási láncot visszafelé követi a TypeScript AST-n, amíg egy workflow-futtató (`executeWorkflow(...)`, illetve a bizonyítottan
 * azt hívó `runToolWorkflow(...)`) argumentumán belülre nem ér (= workflow alatt fut), vagy egy végpontig: Express-útvonal,
 * modulszintű kód, értékként átadott függvény, hivatkozás nélküli függvény. A végpontokat a teszt az indokolt engedélylistával
 * veti össze.
 *
 * Korlát (dokumentált): név-alapú hivatkozáskövetés típusellenőrző nélkül. Függvénynévnél a deklaráló fájl és az azt importáló
 * fájlok (statikus és dinamikus import) számítanak; metódusnál minden azonos nevű tulajdonság-hívás (túl-befogadó, nem enged át
 * hamisan). Metódus-értéket csak `kulcs: obj.metódus` alakban követ; a hívás-argumentumként átadott metódusérték nem követett.
 */
export const GUARDED_TABLES = new Set(["htmlFiles", "lessons", "knowledgeMaps", "kmConcepts"]);
const SQL_WRITE = /\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?(?:html_files|lessons|knowledge_maps|km_concepts)\b/i;
const ROUTE_METHODS = new Set(["get", "post", "put", "patch", "delete", "all"]);

export type WriteSite = { file: string; line: number; table: string };
export type Terminal = { key: string; file: string; line: number };
export type Unit = { rel: string; source: ts.SourceFile; imports: Set<string> };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") && !path.endsWith(".d.ts") ? [path] : [];
  });
}

/** One source file as an analysis unit (path relative to the package root, forward slashes). */
export function parseUnit(rel: string, text: string): Unit {
  const source = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = new Set<string>();
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) && node.importClause) {
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) for (const el of bindings.elements) imports.add((el.propertyName ?? el.name).text);
    }
    // `const { a, b } = await import("./x")` — the dynamic import names count as imports too.
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer && /\bimport\(/.test(node.initializer.getText(source))) {
      for (const el of node.name.elements) imports.add(((el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName : el.name) as ts.Identifier).text);
    }
    // `(await import("./x")).name(...)` — a property access on a dynamic import.
    if (ts.isPropertyAccessExpression(node) && /^\(?\s*await\s+import\(/.test(node.expression.getText(source))) imports.add(node.name.text);
    node.forEachChild(visit);
  };
  visit(source);
  return { rel, source, imports };
}

export function loadServer(root: string): Unit[] {
  return walk(join(root, "server")).map((path) => parseUnit(relative(root, path).replaceAll("\\", "/"), readFileSync(path, "utf8")));
}

const lineOf = (unit: Unit, node: ts.Node) => unit.source.getLineAndCharacterOfPosition(node.getStart(unit.source)).line + 1;

function tableArg(node: ts.CallExpression): string | undefined {
  const arg = node.arguments[0];
  if (!arg) return undefined;
  const name = ts.isIdentifier(arg) ? arg.text : ts.isPropertyAccessExpression(arg) ? arg.name.text : undefined;
  return name && GUARDED_TABLES.has(name) ? name : undefined;
}

export function writeSites(units: Unit[]): Array<WriteSite & { node: ts.Node; unit: Unit }> {
  const sites: Array<WriteSite & { node: ts.Node; unit: Unit }> = [];
  for (const unit of units) {
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && ["insert", "update", "delete"].includes(node.expression.name.text)) {
        const table = tableArg(node);
        if (table) sites.push({ file: unit.rel, line: lineOf(unit, node), table, node, unit });
      }
      if ((ts.isNoSubstitutionTemplateLiteral(node) || ts.isStringLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && SQL_WRITE.test(node.text)) {
        sites.push({ file: unit.rel, line: lineOf(unit, node), table: node.text.match(SQL_WRITE)![0], node, unit });
      }
      node.forEachChild(visit);
    };
    visit(unit.source);
  }
  return sites;
}

type Identity = { kind: "function"; name: string; unit: Unit; scope: ts.Node | null; exported: boolean } | { kind: "method"; name: string };

function isInsideArgs(call: ts.CallExpression, node: ts.Node): boolean {
  return call.arguments.some((arg) => node.pos >= arg.pos && node.end <= arg.end);
}
function calleeName(call: ts.CallExpression): string | undefined {
  const e = call.expression;
  return ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : undefined;
}
const isFunctionLike = (n: ts.Node): n is ts.FunctionLikeDeclaration =>
  ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isConstructorDeclaration(n);
const hasExport = (n: ts.Node) => !!(ts.canHaveModifiers(n) && ts.getModifiers(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));

function enclosingFunction(node: ts.Node): ts.Node | null {
  for (let p = node.parent; p; p = p.parent) if (isFunctionLike(p)) return p;
  return null;
}

/**
 * A method value handed on by name (`loadJob: store.loadJob`). Name-based matching cannot tell `toks[k].start` (data) from a
 * method value elsewhere, so only the property-value form counts; a method passed as a bare call argument is not followed.
 */
function methodHandedOn(n: ts.Node): boolean {
  const p = n.parent;
  return ts.isPropertyAssignment(p) && p.initializer === n;
}

function isDeclarationName(n: ts.Identifier): boolean {
  const p = n.parent;
  return (ts.isFunctionDeclaration(p) || ts.isVariableDeclaration(p) || ts.isMethodDeclaration(p) || ts.isParameter(p) || ts.isBindingElement(p)) && p.name === n;
}

/** The analyzer: the terminals (unguarded entry points) reaching each node. */
export function createAnalyzer(units: Unit[], runners: ReadonlySet<string>) {
  const memo = new Map<string, Terminal[] | "pending">();

  function identityOf(fn: ts.FunctionLikeDeclaration, unit: Unit): Identity | { kind: "route"; key: string } | null {
    if (ts.isFunctionDeclaration(fn) && fn.name) {
      const scope = enclosingFunction(fn);
      return { kind: "function", name: fn.name.text, unit, scope, exported: !scope && hasExport(fn) };
    }
    if (ts.isMethodDeclaration(fn) || ts.isGetAccessorDeclaration(fn)) {
      const name = fn.name && (ts.isIdentifier(fn.name) || ts.isStringLiteral(fn.name)) ? fn.name.text : undefined;
      return name ? { kind: "method", name } : null;
    }
    const parent = fn.parent;
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      const scope = enclosingFunction(parent);
      const statement = parent.parent?.parent;
      return { kind: "function", name: parent.name.text, unit, scope, exported: !scope && !!statement && hasExport(statement) };
    }
    if (ts.isPropertyAssignment(parent) && (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))) return { kind: "method", name: parent.name.text };
    if (ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression) && ROUTE_METHODS.has(parent.expression.name.text)) {
      const path = parent.arguments[0];
      if (path && (ts.isStringLiteral(path) || ts.isNoSubstitutionTemplateLiteral(path))) {
        return { kind: "route", key: `route:${parent.expression.name.text.toUpperCase()} ${path.text}@${unit.rel}` };
      }
    }
    return null;
  }

  /** Every identifier/property reference of a function identity, outside its own declaration name. */
  function references(id: Identity): Array<{ node: ts.Node; unit: Unit }> {
    const out: Array<{ node: ts.Node; unit: Unit }> = [];
    const scan = (unit: Unit, root: ts.Node, match: (n: ts.Node) => boolean) => {
      const visit = (n: ts.Node) => { if (match(n)) out.push({ node: n, unit }); n.forEachChild(visit); };
      visit(root);
    };
    if (id.kind === "method") {
      for (const unit of units) scan(unit, unit.source, (n) => ts.isPropertyAccessExpression(n) && n.name.text === id.name);
      return out;
    }
    const isRef = (n: ts.Node) => ts.isIdentifier(n) && n.text === id.name && !isDeclarationName(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)
      && !ts.isImportSpecifier(n.parent) && !(ts.isPropertyAssignment(n.parent) && n.parent.name === n) && !ts.isBindingElement(n.parent);
    const dynamicRef = (n: ts.Node) => ts.isPropertyAccessExpression(n) && n.name.text === id.name && /^\(?\s*await\s+import\(/.test(n.expression.getText());
    if (id.scope) { scan(id.unit, id.scope, isRef); return out; }
    scan(id.unit, id.unit.source, isRef);
    if (id.exported) for (const unit of units) if (unit !== id.unit && unit.imports.has(id.name)) scan(unit, unit.source, (n) => isRef(n) || dynamicRef(n));
    return out;
  }

  function terminalsOf(node: ts.Node, unit: Unit): Terminal[] {
    for (let p: ts.Node | undefined = node.parent, child: ts.Node = node; p; child = p, p = p.parent) {
      if (ts.isCallExpression(p) && runners.has(calleeName(p) ?? "") && isInsideArgs(p, child)) return [];
      if (isFunctionLike(p)) {
        const id = identityOf(p, unit);
        if (!id) continue; // anonymous callback: it runs within the enclosing function's activation
        if (id.kind === "route") return [{ key: id.key, file: unit.rel, line: lineOf(unit, p) }];
        return functionTerminals(id, unit, p);
      }
    }
    return [{ key: `module@${unit.rel}`, file: unit.rel, line: lineOf(unit, node) }];
  }

  function functionTerminals(id: Identity, unit: Unit, decl: ts.Node): Terminal[] {
    const key = id.kind === "method" ? `method:${id.name}` : `function:${id.name}@${id.unit.rel}:${lineOf(id.unit, decl)}`;
    const cached = memo.get(key);
    if (cached === "pending") return [];
    if (cached) return cached;
    memo.set(key, "pending");
    const refs = references(id);
    const result: Terminal[] = [];
    if (!refs.length) result.push({ key: `unreferenced:${id.name}@${unit.rel}`, file: unit.rel, line: lineOf(unit, decl) });
    for (const ref of refs) {
      const call = ref.node.parent;
      const invoked = ts.isCallExpression(call) && call.expression === ref.node;
      if (invoked) result.push(...terminalsOf(ref.node, ref.unit));
      else if (id.kind === "method" && !methodHandedOn(ref.node)) continue; // a same-named data property (token.start), not this function
      else result.push({ key: `value:${id.name}@${ref.unit.rel}`, file: ref.unit.rel, line: lineOf(ref.unit, ref.node) });
    }
    const unique = [...new Map(result.map((t) => [t.key, t])).values()];
    memo.set(key, unique);
    return unique;
  }

  return { terminalsOf };
}

/** All unguarded terminals of the units, with the write sites reaching each. */
export function analyzeUnits(units: Unit[], runners: ReadonlySet<string>) {
  const analyzer = createAnalyzer(units, runners);
  const sites = writeSites(units);
  const terminals = new Map<string, { terminal: Terminal; sites: Set<string> }>();
  for (const site of sites) {
    for (const t of analyzer.terminalsOf(site.node, site.unit)) {
      const entry = terminals.get(t.key) ?? { terminal: t, sites: new Set<string>() };
      entry.sites.add(`${site.file}:${site.line}`);
      terminals.set(t.key, entry);
    }
  }
  return { sites: sites.map(({ file, line, table }) => ({ file, line, table })), terminals };
}

/** Lexical proof: some `<runner>(...)` call in `file` has an argument whose text matches `pattern`. */
export function invokedInside(units: Unit[], file: string, runner: string, pattern: RegExp): boolean {
  const unit = units.find((u) => u.rel === file);
  if (!unit) return false;
  let found = false;
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && calleeName(n) === runner && n.arguments.some((a) => pattern.test(a.getText(unit.source)))) found = true;
    n.forEachChild(visit);
  };
  visit(unit.source);
  return found;
}

/** The handler text of `<router>.<method>("<path>", …)` in `file` (all arguments after the path), or "" when absent. */
export function routeHandlerText(units: Unit[], file: string, method: string, path: string): string {
  const unit = units.find((u) => u.rel === file);
  let text = "";
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === method) {
      const first = n.arguments[0];
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first)) && first.text === path) text = n.arguments.slice(1).map((a) => a.getText(unit!.source)).join("\n");
    }
    n.forEachChild(visit);
  };
  if (unit) visit(unit.source);
  return text;
}
