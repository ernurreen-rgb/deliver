import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { platformSurfaces } from "@/platform/app-boundaries";

type Violation = {
  file: string;
  importPath: string;
  reason: string;
};

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  "generated",
  "node_modules",
]);
const rootDir = process.cwd();
const webSourceDir = "apps/web/src";
const packageDependencyRules: Record<string, ReadonlySet<string>> = {
  auth: new Set(["contracts", "database"]),
  contracts: new Set(),
  database: new Set(),
  domain: new Set(["contracts"]),
};

function toPosixPath(value: string) {
  return value.replaceAll("\\", "/");
}

function walkFiles(directory: string): string[] {
  const entries = readdirSync(directory);
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry)) {
        files.push(...walkFiles(fullPath));
      }

      continue;
    }

    if (SOURCE_EXTENSIONS.has(path.extname(entry))) {
      files.push(fullPath);
    }
  }

  return files;
}

function readImports(filePath: string) {
  const source = readFileSync(filePath, "utf8");
  const imports = new Set<string>();
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)["']([^"']+)["']/g,
    /\bimport\(\s*["']([^"']+)["']\s*\)/g,
  ];

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      imports.add(match[1]);
    }
  }

  return [...imports];
}

function getRelativeSourcePath(filePath: string) {
  return toPosixPath(path.relative(rootDir, filePath));
}

function findSurface(relativeFilePath: string) {
  return platformSurfaces.find((surface) =>
    relativeFilePath.startsWith(`${surface.currentAppDir}/`),
  );
}

function getAliasSegment(importPath: string, prefix: string) {
  if (!importPath.startsWith(prefix)) {
    return null;
  }

  return importPath.slice(prefix.length).split("/")[0] ?? null;
}

function resolveRelativeImport(filePath: string, importPath: string) {
  if (!importPath.startsWith(".")) {
    return null;
  }

  return toPosixPath(
    path.relative(rootDir, path.resolve(path.dirname(filePath), importPath)),
  );
}

function addAppSurfaceViolations(input: {
  file: string;
  importPath: string;
  relativeFilePath: string;
  violations: Violation[];
}) {
  const surface = findSurface(input.relativeFilePath);

  if (!surface) {
    return;
  }

  const domainName = getAliasSegment(input.importPath, "@/domains/");
  if (domainName && !new Set<string>(surface.allowedDomains).has(domainName)) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: `${surface.id} surface cannot import ${domainName} domain directly`,
    });
  }

  const componentGroup = getAliasSegment(input.importPath, "@/components/");
  if (
    componentGroup &&
    !new Set<string>(surface.allowedComponentGroups).has(componentGroup)
  ) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: `${surface.id} surface cannot import ${componentGroup} components`,
    });
  }

  if (input.importPath.startsWith("@/app/")) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: "app surfaces must not import other App Router routes",
    });
  }

  if (input.importPath.startsWith("@/workers/")) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: "web surfaces must not import worker code",
    });
  }
}

function addLayerViolations(input: {
  file: string;
  importPath: string;
  relativeFilePath: string;
  violations: Violation[];
}) {
  const resolvedRelativePath =
    resolveRelativeImport(input.file, input.importPath) ?? input.importPath;

  const importsApp =
    input.importPath.startsWith("@/app/") ||
    resolvedRelativePath.startsWith(`${webSourceDir}/app/`);
  const importsComponents =
    input.importPath.startsWith("@/components/") ||
    resolvedRelativePath.startsWith(`${webSourceDir}/components/`);
  const importsWorkers =
    input.importPath.startsWith("@/workers/") ||
    resolvedRelativePath.startsWith(`${webSourceDir}/workers/`);

  if (input.relativeFilePath.startsWith(`${webSourceDir}/domains/`)) {
    if (importsApp || importsComponents || importsWorkers) {
      input.violations.push({
        file: input.relativeFilePath,
        importPath: input.importPath,
        reason: "domain modules must stay UI-free and worker-free",
      });
    }
  }

  if (input.relativeFilePath.startsWith(`${webSourceDir}/components/`)) {
    if (importsApp || importsWorkers) {
      input.violations.push({
        file: input.relativeFilePath,
        importPath: input.importPath,
        reason: "shared components must not depend on route or worker modules",
      });
    }
  }

  if (input.relativeFilePath.startsWith(`${webSourceDir}/workers/`)) {
    if (importsApp || importsComponents) {
      input.violations.push({
        file: input.relativeFilePath,
        importPath: input.importPath,
        reason: "worker code must not depend on App Router or UI modules",
      });
    }
  }
}

function addPackageBoundaryViolations(input: {
  file: string;
  importPath: string;
  relativeFilePath: string;
  violations: Violation[];
}) {
  const match = input.relativeFilePath.match(/^packages\/([^/]+)\/src\//);
  if (!match) {
    return;
  }

  const packageName = match[1];
  const allowedDependencies = packageDependencyRules[packageName];

  if (!allowedDependencies) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: `package ${packageName} is missing an architecture dependency rule`,
    });
    return;
  }

  const resolvedRelativePath =
    resolveRelativeImport(input.file, input.importPath) ?? input.importPath;

  if (
    input.importPath.startsWith("@/") ||
    resolvedRelativePath.startsWith(`${webSourceDir}/`) ||
    input.importPath.includes("apps/web")
  ) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: "shared packages must not depend on app-local modules",
    });
  }

  const deliverPackage = input.importPath.match(/^@deliver\/([^/]+)/)?.[1];
  if (
    deliverPackage &&
    deliverPackage !== packageName &&
    !allowedDependencies.has(deliverPackage)
  ) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: `${packageName} package cannot depend on @deliver/${deliverPackage}`,
    });
  }

  if (
    (packageName === "contracts" || packageName === "domain") &&
    (input.importPath === "next" ||
      input.importPath.startsWith("next/") ||
      input.importPath === "react" ||
      input.importPath.startsWith("react/"))
  ) {
    input.violations.push({
      file: input.relativeFilePath,
      importPath: input.importPath,
      reason: `${packageName} package must stay framework-independent`,
    });
  }
}

function addRoleShellLayoutViolations(violations: Violation[]) {
  for (const surface of platformSurfaces) {
    if (surface.id === "api") {
      continue;
    }

    const layoutPath = path.join(rootDir, surface.currentAppDir, "layout.tsx");
    const relativeLayoutPath = toPosixPath(path.relative(rootDir, layoutPath));

    if (!existsSync(layoutPath)) {
      violations.push({
        file: relativeLayoutPath,
        importPath: "missing layout.tsx",
        reason: `${surface.id} surface must have its own RoleShell layout`,
      });
      continue;
    }

    const layoutSource = readFileSync(layoutPath, "utf8");
    if (
      !layoutSource.includes("@/components/layout/role-shell") ||
      !layoutSource.includes(`surface="${surface.id}"`)
    ) {
      violations.push({
        file: relativeLayoutPath,
        importPath: "@/components/layout/role-shell",
        reason: `${surface.id} layout must render RoleShell with its own surface id`,
      });
    }
  }
}

function main() {
  const sourceRoot = path.join(rootDir, webSourceDir);
  const packagesRoot = path.join(rootDir, "packages");

  if (!existsSync(sourceRoot)) {
    throw new Error(`Missing source root: ${sourceRoot}`);
  }

  const violations: Violation[] = [];
  const files = [
    ...walkFiles(sourceRoot),
    ...(existsSync(packagesRoot) ? walkFiles(packagesRoot) : []),
  ];

  for (const file of files) {
    const relativeFilePath = getRelativeSourcePath(file);

    for (const importPath of readImports(file)) {
      addAppSurfaceViolations({
        file,
        importPath,
        relativeFilePath,
        violations,
      });
      addLayerViolations({
        file,
        importPath,
        relativeFilePath,
        violations,
      });
      addPackageBoundaryViolations({
        file,
        importPath,
        relativeFilePath,
        violations,
      });
    }
  }

  addRoleShellLayoutViolations(violations);

  if (violations.length > 0) {
    console.error(`App boundary check failed: ${violations.length} violation(s).`);

    for (const violation of violations) {
      console.error(
        `- ${violation.file}: ${violation.importPath} (${violation.reason})`,
      );
    }

    process.exitCode = 1;
    return;
  }

  console.log(`App boundary check passed: ${files.length} source files checked.`);
}

main();
