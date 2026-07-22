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

function responseSchemaRef(document, path, method) {
  return document.paths[path][method].responses['200'].content['application/json'].schema.$ref;
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

for (const path of ['/api/social/students', '/api/social/friends']) {
  if (responseSchemaRef(tenantOpenapi, path, 'get') !== '#/components/schemas/StudentPage') {
    throw new Error(`${path} must return StudentPage`);
  }
}
for (const [path, itemSchema] of [
  ['/api/social/friend-requests', 'FriendRequestOut'],
  ['/api/social/blocks', 'BlockOut'],
]) {
  const schema = responseSchema(tenantOpenapi, path, 'get');
  if (schema.type !== 'array' || schema.items?.$ref !== `#/components/schemas/${itemSchema}`) {
    throw new Error(`${path} must return ${itemSchema}[]`);
  }
}
const studentPage = tenantOpenapi.components.schemas.StudentPage;
if (!studentPage.required?.includes('items') || !studentPage.required?.includes('next_cursor')) {
  throw new Error('StudentPage must require items and next_cursor');
}
const cursorVariants = studentPage.properties.next_cursor.anyOf ?? [];
if (!cursorVariants.some(schema => schema.type === 'integer') || !cursorVariants.some(schema => schema.type === 'null')) {
  throw new Error('StudentPage next_cursor must be a nullable integer');
}
for (const [name, fields] of [
  ['StudentProfile', ['id', 'name', 'avatar', 'class_name']],
  ['FriendRequestOut', ['id', 'status', 'student', 'created_at', 'expires_at']],
  ['BlockOut', ['id', 'student', 'reason_code', 'created_at']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the social client contract`);
  }
}
for (const method of ['get', 'patch']) {
  if (responseSchemaRef(tenantOpenapi, '/api/user/preferences', method) !== '#/components/schemas/PreferencesResponse') {
    throw new Error(`${method.toUpperCase()} /api/user/preferences must return PreferencesResponse`);
  }
}
const preferencesPatchRef = tenantOpenapi.paths['/api/user/preferences'].patch.requestBody.content['application/json'].schema.$ref;
if (preferencesPatchRef !== '#/components/schemas/PreferencesPatch') {
  throw new Error('PATCH /api/user/preferences must accept PreferencesPatch');
}
for (const [name, fields] of [
  ['PreferencesResponse', ['push_preview_enabled', 'version', 'created_at', 'updated_at']],
  ['PreferencesPatch', ['push_preview_enabled']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the preferences client contract`);
  }
}
for (const [path, method, schema] of [
  ['/api/push/registration', 'get', 'PushRegistrationStatusOut'],
  ['/api/push/installations/{installation_id}/registration', 'put', 'PushRegistrationOut'],
  ['/api/push/installations/{installation_id}/registration', 'delete', 'PushRegistrationRevokeOut'],
]) {
  if (responseSchemaRef(tenantOpenapi, path, method) !== `#/components/schemas/${schema}`) {
    throw new Error(`${method.toUpperCase()} ${path} must return ${schema}`);
  }
}
const pushRegistrationPutRef = tenantOpenapi.paths['/api/push/installations/{installation_id}/registration'].put.requestBody.content['application/json'].schema.$ref;
if (pushRegistrationPutRef !== '#/components/schemas/RegistrationPut') {
  throw new Error('PUT push registration must accept RegistrationPut');
}
for (const [name, fields] of [
  ['PushRegistrationStatusOut', ['registration_supported', 'registration_available', 'delivery_enabled', 'configured_providers', 'registration']],
  ['PushRegistrationOut', ['installation_id', 'state']],
  ['PushRegistrationRevokeOut', ['success']],
  ['RegistrationPut', ['installation_secret', 'provider', 'platform', 'environment', 'token', 'app_id']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the push registration client contract`);
  }
}
for (const [path, schema] of [
  ['/api/social/conversations/{conversation_id}/messages', 'app__modules__social__schemas__MessageCreate'],
  ['/api/social/conversations/{conversation_id}/read', 'app__modules__social__schemas__ReadCreate'],
  ['/api/social/reports', 'ReportCreate'],
]) {
  const requestRef = tenantOpenapi.paths[path].post.requestBody.content['application/json'].schema.$ref;
  if (requestRef !== `#/components/schemas/${schema}`) {
    throw new Error(`POST ${path} must accept ${schema}`);
  }
}
for (const [name, fields] of [
  ['app__modules__social__schemas__MessageCreate', ['client_message_id', 'body']],
  ['app__modules__social__schemas__ReadCreate', ['message_id']],
  ['ReportCreate', ['message_id', 'category', 'client_report_id']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the social mutation client contract`);
  }
}
for (const [path, schema] of [
  ['/api/support/tickets', 'TicketCreate'],
  ['/api/support/tickets/{ticket_id}/messages', 'app__modules__support__schemas__MessageCreate'],
  ['/api/support/tickets/{ticket_id}/read', 'app__modules__support__schemas__ReadCreate'],
]) {
  const requestRef = tenantOpenapi.paths[path].post.requestBody.content['application/json'].schema.$ref;
  if (requestRef !== `#/components/schemas/${schema}`) {
    throw new Error(`POST ${path} must accept ${schema}`);
  }
}
for (const [name, fields] of [
  ['TicketCreate', ['client_ticket_id', 'client_message_id', 'category', 'subject', 'body']],
  ['app__modules__support__schemas__MessageCreate', ['client_message_id', 'body']],
  ['app__modules__support__schemas__ReadCreate', ['message_id']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the requester support mutation contract`);
  }
}
if (!tenantOpenapi.components.schemas.app__modules__support__schemas__ReadCreate.properties?.client_action_id) {
  throw new Error('Support ReadCreate must expose optional client_action_id for durable clients');
}
for (const [path, method, schema] of [
  ['/api/admin/support/tickets/{ticket_id}', 'patch', 'TicketPatch'],
  ['/api/admin/support/tickets/{ticket_id}/assign', 'post', 'AssignCreate'],
  ['/api/admin/support/tickets/{ticket_id}/messages', 'post', 'app__modules__support__schemas__MessageCreate'],
  ['/api/admin/support/tickets/{ticket_id}/read', 'post', 'app__modules__support__schemas__ReadCreate'],
]) {
  const requestRef = tenantOpenapi.paths[path][method].requestBody.content['application/json'].schema.$ref;
  if (requestRef !== `#/components/schemas/${schema}`) {
    throw new Error(`${method.toUpperCase()} ${path} must accept ${schema}`);
  }
}
for (const [name, fields] of [
  ['TicketPatch', ['client_action_id', 'expected_version']],
  ['AssignCreate', ['client_action_id', 'expected_version']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the admin support mutation contract`);
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/teacher/classes', 'get') !== '#/components/schemas/TeacherClassesOut') {
  throw new Error('GET /api/teacher/classes must return TeacherClassesOut');
}
for (const [name, fields] of [
  ['TeacherClassesOut', ['classes']],
  ['TeacherClassOut', ['id', 'name', 'student_count', 'created_at']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the teacher classes client contract`);
  }
}
const teacherClassesItemsRef = tenantOpenapi.components.schemas.TeacherClassesOut.properties.classes.items?.$ref;
if (teacherClassesItemsRef !== '#/components/schemas/TeacherClassOut') {
  throw new Error('TeacherClassesOut classes must contain TeacherClassOut items');
}
const teacherClassCreatedAt = tenantOpenapi.components.schemas.TeacherClassOut.properties.created_at.anyOf ?? [];
if (!teacherClassCreatedAt.some(schema => schema.type === 'string' && schema.format === 'date-time') || !teacherClassCreatedAt.some(schema => schema.type === 'null')) {
  throw new Error('TeacherClassOut created_at must be a nullable date-time');
}
if (responseSchemaRef(tenantOpenapi, '/api/teacher/homework', 'get') !== '#/components/schemas/TeacherHomeworkListOut') {
  throw new Error('GET /api/teacher/homework must return TeacherHomeworkListOut');
}
for (const [name, fields] of [
  ['TeacherHomeworkListOut', ['homework']],
  ['TeacherHomeworkOut', ['id', 'title', 'description', 'created_at', 'class_name', 'subject_name']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the teacher homework client contract`);
  }
}
const teacherHomeworkItemsRef = tenantOpenapi.components.schemas.TeacherHomeworkListOut.properties.homework.items?.$ref;
if (teacherHomeworkItemsRef !== '#/components/schemas/TeacherHomeworkOut') {
  throw new Error('TeacherHomeworkListOut homework must contain TeacherHomeworkOut items');
}
const teacherHomework = tenantOpenapi.components.schemas.TeacherHomeworkOut.properties;
const teacherHomeworkCreatedAt = teacherHomework.created_at.anyOf ?? [];
if (!teacherHomeworkCreatedAt.some(schema => schema.type === 'string' && schema.format === 'date-time') || !teacherHomeworkCreatedAt.some(schema => schema.type === 'null')) {
  throw new Error('TeacherHomeworkOut created_at must be a nullable date-time');
}
for (const field of ['class_name', 'subject_name']) {
  const variants = teacherHomework[field].anyOf ?? [];
  if (!variants.some(schema => schema.type === 'string') || !variants.some(schema => schema.type === 'null')) {
    throw new Error(`TeacherHomeworkOut ${field} must be a nullable string`);
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/journal/work-types', 'get') !== '#/components/schemas/JournalWorkTypesOut') {
  throw new Error('GET /api/journal/work-types must return JournalWorkTypesOut');
}
for (const [name, fields] of [
  ['JournalWorkTypesOut', ['success', 'work_types']],
  ['JournalWorkTypeOut', ['id', 'name', 'weight']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  const required = schema.required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the journal work types client contract`);
  }
  if (fields.some(field => schema.properties[field].nullable === true || schema.properties[field].anyOf?.some(variant => variant.type === 'null'))) {
    throw new Error(`${name} fields must not be nullable`);
  }
}
const journalWorkTypesItemsRef = tenantOpenapi.components.schemas.JournalWorkTypesOut.properties.work_types.items?.$ref;
if (journalWorkTypesItemsRef !== '#/components/schemas/JournalWorkTypeOut') {
  throw new Error('JournalWorkTypesOut work_types must contain JournalWorkTypeOut items');
}
if (responseSchemaRef(tenantOpenapi, '/api/journal/teacher/subjects', 'get') !== '#/components/schemas/JournalTeacherSubjectsOut') {
  throw new Error('GET /api/journal/teacher/subjects must return JournalTeacherSubjectsOut');
}
for (const [name, fields] of [
  ['JournalTeacherSubjectsOut', ['classes']],
  ['JournalTeacherClassOut', ['id', 'name', 'grade_level', 'subjects']],
  ['JournalTeacherSubjectOut', ['id', 'name', 'short_name', 'category']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the journal teacher subjects client contract`);
  }
}
const journalTeacherClasses = tenantOpenapi.components.schemas.JournalTeacherSubjectsOut.properties.classes;
if (journalTeacherClasses.items?.$ref !== '#/components/schemas/JournalTeacherClassOut') {
  throw new Error('JournalTeacherSubjectsOut classes must contain JournalTeacherClassOut items');
}
const journalTeacherClass = tenantOpenapi.components.schemas.JournalTeacherClassOut.properties;
if (journalTeacherClass.subjects.items?.$ref !== '#/components/schemas/JournalTeacherSubjectOut') {
  throw new Error('JournalTeacherClassOut subjects must contain JournalTeacherSubjectOut items');
}
for (const [schema, requiredType, label] of [
  [journalTeacherClass.grade_level, 'integer', 'JournalTeacherClassOut grade_level'],
  [tenantOpenapi.components.schemas.JournalTeacherSubjectOut.properties.short_name, 'string', 'JournalTeacherSubjectOut short_name'],
]) {
  const variants = schema.anyOf ?? [];
  if (!variants.some(variant => variant.type === requiredType) || !variants.some(variant => variant.type === 'null')) {
    throw new Error(`${label} must be required nullable`);
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/homework', 'get') !== '#/components/schemas/HomeworkListOut') {
  throw new Error('/api/homework must return HomeworkListOut');
}
if (responseSchemaRef(tenantOpenapi, '/api/homework/{homework_id}/state', 'put') !== '#/components/schemas/HomeworkStateOut') {
  throw new Error('/api/homework/{homework_id}/state must return HomeworkStateOut');
}
for (const [name, fields] of [
  ['HomeworkOut', ['id', 'title', 'student_state', 'deadline_at', 'due_date', 'attachments']],
  ['HomeworkStudentStateOut', ['status', 'version', 'completed_at']],
  ['HomeworkStateOut', ['homework_id', 'status', 'version', 'completed_at', 'replayed']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the homework client contract`);
  }
}
for (const [path, method, schema] of [
  ['/api/admin/social/moderation/cases', 'get', 'ModerationCasePageOut'],
  ['/api/admin/social/moderation/cases/{case_id}', 'get', 'ModerationCaseDetailOut'],
  ['/api/admin/social/moderation/cases/{case_id}/actions', 'post', 'ModerationActionOut'],
]) {
  if (responseSchemaRef(tenantOpenapi, path, method) !== `#/components/schemas/${schema}`) {
    throw new Error(`${method.toUpperCase()} ${path} must return ${schema}`);
  }
}
for (const [name, fields] of [
  ['ModerationCaseSummaryOut', ['id', 'status', 'version', 'created_at', 'updated_at']],
  ['ModerationCasePageOut', ['items', 'next_cursor']],
  ['ModerationCaseDetailOut', ['id', 'status', 'version', 'category', 'comment', 'created_at', 'evidence', 'other_participant']],
  ['ModerationEvidenceOut', ['message_id', 'sender', 'body', 'created_at']],
  ['ModerationActionOut', ['id', 'status', 'version', 'updated_at']],
]) {
  const required = tenantOpenapi.components.schemas[name].required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the moderation client contract`);
  }
}
const moderationCursor = tenantOpenapi.components.schemas.ModerationCasePageOut.properties.next_cursor.anyOf ?? [];
if (!moderationCursor.some(schema => schema.type === 'integer') || !moderationCursor.some(schema => schema.type === 'null')) {
  throw new Error('ModerationCasePageOut next_cursor must be a nullable integer');
}

console.log(`OpenAPI contract and mobile descriptor parity passed: ${manifest.tenant.length + manifest.core.length} paths`);
