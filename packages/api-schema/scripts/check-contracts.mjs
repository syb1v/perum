import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(packageDir, '../..');
const manifest = JSON.parse(await readFile(resolve(packageDir, 'contracts.json'), 'utf8'));
const tenantOpenapi = JSON.parse(await readFile(resolve(packageDir, 'openapi/tenant.json'), 'utf8'));
const coreOpenapi = JSON.parse(await readFile(resolve(packageDir, 'openapi/core.json'), 'utf8'));
const tenant = await readFile(resolve(packageDir, 'generated/tenant.ts'), 'utf8');
const core = await readFile(resolve(packageDir, 'generated/core.ts'), 'utf8');
const missing = [
  ...manifest.tenant.filter(path => !tenant.includes(`"${path}"`)),
  ...manifest.core.filter(path => !core.includes(`"${path}"`)),
];

if (missing.length > 0) {
  console.error(`Generated OpenAPI contract is missing paths:\n${missing.join('\n')}`);
  process.exit(1);
}

function dereference(document, schema) {
  if (!schema?.$ref) return schema;
  return schema.$ref.split('/').slice(1).reduce((value, key) => value[key], document);
}

function responseSchema(document, path, method) {
  const response = document.paths[path][method].responses['200'];
  return dereference(document, response.content['application/json'].schema);
}

function assertClosedObject(name, schema) {
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must set additionalProperties=false`);
  }
  const properties = Object.keys(schema.properties ?? {}).sort();
  const required = [...(schema.required ?? [])].sort();
  if (JSON.stringify(properties) !== JSON.stringify(required)) {
    throw new Error(`${name} property and required sets differ`);
  }
  return properties;
}

const tenantDescriptor = responseSchema(tenantOpenapi, '/api/mobile/descriptor', 'get');
const coreDescriptor = responseSchema(coreOpenapi, '/api/public/tenant-discovery', 'post');
const tenantDescriptorProperties = assertClosedObject('Tenant descriptor', tenantDescriptor);
if (JSON.stringify(tenantDescriptorProperties) !== JSON.stringify(['capabilities', 'compatibility', 'schema_version'])) {
  throw new Error('Tenant mobile descriptor envelope properties differ from v1');
}
for (const property of ['schema_version', 'compatibility', 'capabilities']) {
  if (!coreDescriptor.required?.includes(property)) {
    throw new Error(`Core mobile descriptor is missing required ${property}`);
  }
}
const tenantCompatibility = dereference(tenantOpenapi, tenantDescriptor.properties.compatibility);
const coreCompatibility = dereference(coreOpenapi, coreDescriptor.properties.compatibility);
const tenantCapabilities = dereference(tenantOpenapi, tenantDescriptor.properties.capabilities);
const coreCapabilities = dereference(coreOpenapi, coreDescriptor.properties.capabilities);

for (const [name, left, right] of [
  ['compatibility', tenantCompatibility, coreCompatibility],
  ['capabilities', tenantCapabilities, coreCapabilities],
]) {
  const tenantProperties = assertClosedObject(`Tenant ${name}`, left);
  const coreProperties = assertClosedObject(`Core ${name}`, right);
  if (JSON.stringify(tenantProperties) !== JSON.stringify(coreProperties)) {
    throw new Error(`Core/Tenant mobile descriptor ${name} properties differ`);
  }
}

const tenantSchemaVersion = tenantDescriptor.properties.schema_version;
const coreSchemaVersion = coreDescriptor.properties.schema_version;
function schemaVersion(schema) {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length === 1) return schema.enum[0];
  return undefined;
}
if (schemaVersion(tenantSchemaVersion) !== 1 || schemaVersion(coreSchemaVersion) !== 1) {
  throw new Error('Core/Tenant mobile descriptor schema_version must be exactly 1');
}

console.log(`OpenAPI contract and mobile descriptor parity passed: ${manifest.tenant.length + manifest.core.length} paths`);
