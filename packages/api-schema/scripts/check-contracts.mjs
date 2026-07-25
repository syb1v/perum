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

function responseSchemaRef(document, path, method, status = '200') {
  return document.paths[path][method].responses[status].content['application/json'].schema.$ref;
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

function assertExactClosedObject(name, fields, required = fields) {
  const schema = tenantOpenapi.components.schemas[name];
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields)) {
    throw new Error(`${name} properties differ from the live contract`);
  }
  if (JSON.stringify(schema.required ?? []) !== JSON.stringify(required)) {
    throw new Error(`${name} required fields differ from the live contract`);
  }
  return schema.properties;
}

function assertExactCoreClosedObject(name, fields, required = fields) {
  const schema = coreOpenapi.components.schemas[name];
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields)) {
    throw new Error(`${name} properties differ from the live contract`);
  }
  if (JSON.stringify(schema.required ?? []) !== JSON.stringify(required)) {
    throw new Error(`${name} required fields differ from the live contract`);
  }
  return schema.properties;
}

function assertNullableVariant(name, schema, type) {
  const variants = schema.anyOf ?? [];
  if (!variants.some(variant => variant.type === type) || !variants.some(variant => variant.type === 'null')) {
    throw new Error(`${name} must be required nullable ${type}`);
  }
}

function assertNullableRef(name, schema, ref) {
  const variants = schema.anyOf ?? [];
  if (!variants.some(variant => variant.$ref === `#/components/schemas/${ref}`) || !variants.some(variant => variant.type === 'null')) {
    throw new Error(`${name} must be required nullable ${ref}`);
  }
}

function assertItemRef(schemaName, field, itemSchemaName) {
  const schema = tenantOpenapi.components.schemas[schemaName].properties[field];
  if (schema.items?.$ref !== `#/components/schemas/${itemSchemaName}`) {
    throw new Error(`${schemaName} ${field} items must reference ${itemSchemaName}`);
  }
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

for (const [path, method, schema, status] of [
  ['/api/support/escalations/pending', 'get', 'EscalationListOut', '200'],
  ['/api/support/escalations/{ticket_id}', 'get', 'EscalationDetailOut', '200'],
  ['/api/support/escalations/{ticket_id}/approve', 'post', 'EscalationDecisionOut', '200'],
  ['/api/support/escalations/{ticket_id}/reject', 'post', 'EscalationDecisionOut', '200'],
  ['/api/support/escalations/{ticket_id}/relay', 'post', 'EscalationRelayOut', '200'],
  ['/internal/support/escalations', 'post', 'EscalationIntakeOut', '201'],
  ['/internal/support/escalations/outbound', 'get', 'EscalationOutboundOut', '200'],
  ['/internal/support/escalations/outbound/ack', 'post', 'EscalationOutboundAckOut', '200'],
]) {
  if (responseSchemaRef(coreOpenapi, path, method, status) !== `#/components/schemas/${schema}`) {
    throw new Error(`${method.toUpperCase()} ${path} must return ${schema}`);
  }
}
assertExactCoreClosedObject('EscalationListOut', ['tickets']);
assertExactCoreClosedObject('EscalationDetailOut', ['ticket', 'messages']);
assertExactCoreClosedObject('EscalationDecisionOut', ['id', 'approval_status', 'version']);
assertExactCoreClosedObject('EscalationRelayOut', ['id', 'replayed']);
assertExactCoreClosedObject('EscalationMessageOut', ['id', 'public_id', 'client_message_id', 'sender_type', 'body', 'created_at']);
const escalationTicketFields = ['id', 'org_id', 'source', 'school_id', 'tenant_ticket_public_id', 'correlation_id', 'approval_status', 'approval_version', 'subject', 'status', 'platform_unread', 'org_unread', 'created_at', 'last_message_at'];
assertExactCoreClosedObject('EscalationTicketOut', escalationTicketFields);
assertExactCoreClosedObject('EscalationTicketDetailOut', [...escalationTicketFields, 'redacted_snapshot']);
assertExactCoreClosedObject('EscalationIntakeOut', ['id', 'approval_status', 'version']);
assertExactCoreClosedObject('EscalationOutboundOut', ['approval_status', 'status', 'version', 'messages', 'cursor']);
assertExactCoreClosedObject('EscalationOutboundMessageOut', ['id', 'public_id', 'client_message_id', 'sender_type', 'body', 'created_at']);
assertExactCoreClosedObject('EscalationOutboundAckOut', ['ok', 'cursor']);

for (const path of ['/api/social/students', '/api/social/friends']) {
  if (responseSchemaRef(tenantOpenapi, path, 'get') !== '#/components/schemas/StudentPage') {
    throw new Error(`${path} must return StudentPage`);
  }
}
for (const name of ['StudentProfile', 'StudentPage', 'FriendRequestOut', 'BlockOut']) {
  if (tenantOpenapi.components.schemas[name].additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
}
if (JSON.stringify(tenantOpenapi.components.schemas.FriendRequestOut.properties.status.enum) !== JSON.stringify(['pending', 'accepted', 'rejected', 'cancelled', 'expired'])) {
  throw new Error('FriendRequestOut status literals differ from the lifecycle contract');
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
for (const [name, fields, required] of [
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
for (const name of ['HomeworkStateUpdate', 'HomeworkStudentStateOut', 'HomeworkStateOut']) {
  if (tenantOpenapi.components.schemas[name].additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
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
  ['/api/admin/support/tickets/{ticket_id}/escalate', 'post', 'EscalateCreate'],
  ['/api/admin/support/tickets/{ticket_id}/messages', 'post', 'app__modules__support__schemas__MessageCreate'],
  ['/api/admin/support/tickets/{ticket_id}/read', 'post', 'app__modules__support__schemas__ReadCreate'],
]) {
  const requestRef = tenantOpenapi.paths[path][method].requestBody.content['application/json'].schema.$ref;
  if (requestRef !== `#/components/schemas/${schema}`) {
    throw new Error(`${method.toUpperCase()} ${path} must accept ${schema}`);
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/admin/support/tickets/{ticket_id}/escalation-delivery/retry', 'post') !== '#/components/schemas/EscalationDeliveryOut') {
  throw new Error('POST escalation-delivery/retry must return EscalationDeliveryOut');
}
for (const [name, fields] of [
  ['TicketPatch', ['client_action_id', 'expected_version']],
  ['AssignCreate', ['client_action_id', 'expected_version']],
  ['EscalateCreate', ['client_action_id', 'expected_version', 'redacted_summary']],
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
if (responseSchemaRef(tenantOpenapi, '/api/teacher/works', 'get') !== '#/components/schemas/TeacherWorksOut') {
  throw new Error('GET /api/teacher/works must return TeacherWorksOut');
}
for (const [name, fields] of [
  ['TeacherWorksOut', ['works', 'has_more']],
  ['TeacherWorkOut', ['id', 'type', 'class_id', 'class_name', 'subject_id', 'subject_name', 'title', 'description', 'due_date', 'created_at']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${name} must require the exact teacher works fields`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
}
if (tenantOpenapi.components.schemas.TeacherWorksOut.properties.works.items?.$ref !== '#/components/schemas/TeacherWorkOut') {
  throw new Error('TeacherWorksOut works must contain TeacherWorkOut items');
}
const teacherWork = tenantOpenapi.components.schemas.TeacherWorkOut.properties;
if (JSON.stringify(teacherWork.type.enum) !== JSON.stringify(['homework', 'control'])) {
  throw new Error('TeacherWorkOut type literals differ from the service contract');
}
for (const field of ['class_name', 'subject_name', 'description', 'due_date', 'created_at']) {
  const variants = teacherWork[field].anyOf ?? [];
  if (!variants.some(schema => schema.type === 'string') || !variants.some(schema => schema.type === 'null')) {
    throw new Error(`TeacherWorkOut ${field} must be a nullable string`);
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/teacher/diary', 'get') !== '#/components/schemas/TeacherDiaryOut') {
  throw new Error('GET /api/teacher/diary must return TeacherDiaryOut');
}
for (const [name, fields] of [
  ['TeacherDiaryOut', ['teacher_id', 'teacher_name', 'week_start', 'week_end', 'week_offset', 'diary']],
  ['TeacherDiaryDayOut', ['date', 'day_name', 'is_today', 'lessons']],
  ['TeacherDiaryLessonOut', ['lesson_number', 'subject_id', 'subject_name', 'class_id', 'class_name', 'room', 'start_time', 'end_time', 'homework', 'control_work', 'occurrence_id', 'status', 'version']],
  ['TeacherDiaryHomeworkOut', ['id', 'title', 'description', 'due_date', 'attachments']],
  ['TeacherDiaryHomeworkAttachmentOut', ['id', 'filename', 'url_link']],
  ['TeacherDiaryControlWorkOut', ['id', 'work_type', 'title']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${name} must require the exact teacher diary fields`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
}
const teacherDiary = tenantOpenapi.components.schemas.TeacherDiaryOut.properties;
if (teacherDiary.diary.additionalProperties?.$ref !== '#/components/schemas/TeacherDiaryDayOut') {
  throw new Error('TeacherDiaryOut diary values must be TeacherDiaryDayOut');
}
const teacherDiaryDay = tenantOpenapi.components.schemas.TeacherDiaryDayOut.properties;
if (teacherDiaryDay.lessons.items?.$ref !== '#/components/schemas/TeacherDiaryLessonOut') {
  throw new Error('TeacherDiaryDayOut lessons must contain TeacherDiaryLessonOut items');
}
const teacherDiaryLesson = tenantOpenapi.components.schemas.TeacherDiaryLessonOut.properties;
if (JSON.stringify(teacherDiaryLesson.status.enum) !== JSON.stringify(['scheduled', 'cancelled', 'completed'])) {
  throw new Error('TeacherDiaryLessonOut status literals differ from the service contract');
}
if (teacherDiaryLesson.homework.items?.$ref !== '#/components/schemas/TeacherDiaryHomeworkOut') {
  throw new Error('TeacherDiaryLessonOut homework must contain TeacherDiaryHomeworkOut items');
}
const teacherDiaryHomework = tenantOpenapi.components.schemas.TeacherDiaryHomeworkOut.properties;
if (teacherDiaryHomework.attachments.items?.$ref !== '#/components/schemas/TeacherDiaryHomeworkAttachmentOut') {
  throw new Error('TeacherDiaryHomeworkOut attachments must contain TeacherDiaryHomeworkAttachmentOut items');
}
for (const [schema, fields] of [
  [teacherDiaryLesson, ['subject_name', 'class_name', 'room', 'start_time', 'end_time', 'control_work', 'occurrence_id', 'version']],
  [teacherDiaryHomework, ['description', 'due_date']],
  [tenantOpenapi.components.schemas.TeacherDiaryHomeworkAttachmentOut.properties, ['filename', 'url_link']],
]) {
  for (const field of fields) {
    if (!(schema[field].anyOf ?? []).some(variant => variant.type === 'null')) {
      throw new Error(`Teacher diary ${field} must be required nullable`);
    }
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/teacher/my-class', 'get') !== '#/components/schemas/TeacherHomeroomOut') {
  throw new Error('GET /api/teacher/my-class must return TeacherHomeroomOut');
}
for (const [name, fields] of [
  ['TeacherHomeroomOut', ['has_class', 'class', 'students', 'stats']],
  ['TeacherHomeroomClassOut', ['id', 'name', 'grade_level', 'is_profile']],
  ['TeacherHomeroomStudentOut', ['id', 'login', 'first_name', 'last_name', 'patronymic', 'balance', 'is_online', 'enrollment_status']],
  ['TeacherHomeroomStatsOut', ['student_count', 'avg_balance', 'total_grades', 'avg_grade']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${name} must require the exact teacher homeroom fields`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
}
const teacherHomeroom = tenantOpenapi.components.schemas.TeacherHomeroomOut.properties;
const teacherHomeroomClass = teacherHomeroom.class.anyOf ?? [];
if (!teacherHomeroomClass.some(schema => schema.$ref === '#/components/schemas/TeacherHomeroomClassOut') || !teacherHomeroomClass.some(schema => schema.type === 'null')) {
  throw new Error('TeacherHomeroomOut class must be required nullable TeacherHomeroomClassOut');
}
if (teacherHomeroom.students.items?.$ref !== '#/components/schemas/TeacherHomeroomStudentOut' || teacherHomeroom.stats.$ref !== '#/components/schemas/TeacherHomeroomStatsOut') {
  throw new Error('TeacherHomeroomOut nested refs differ from the client contract');
}
const teacherHomeroomStudent = tenantOpenapi.components.schemas.TeacherHomeroomStudentOut.properties;
for (const field of ['first_name', 'last_name', 'patronymic']) {
  if (!(teacherHomeroomStudent[field].anyOf ?? []).some(schema => schema.type === 'null')) {
    throw new Error(`TeacherHomeroomStudentOut ${field} must be required nullable`);
  }
}
if (JSON.stringify(teacherHomeroomStudent.enrollment_status.const) !== JSON.stringify('active')) {
  throw new Error('TeacherHomeroomStudentOut enrollment_status must remain active');
}
if (responseSchemaRef(tenantOpenapi, '/api/teacher/analytics/topics', 'get') !== '#/components/schemas/TeacherAnalyticsTopicsOut') {
  throw new Error('GET /api/teacher/analytics/topics must return TeacherAnalyticsTopicsOut');
}
for (const [name, fields] of [
  ['TeacherAnalyticsTopicsOut', ['class_avg', 'topics']],
  ['TeacherAnalyticsTopicOut', ['id', 'name', 'avg', 'bad_count', 'total_count', 'bad_ratio']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${name} must require the exact teacher analytics topics fields`);
  }
  if (schema.additionalProperties !== false || fields.some(field => schema.properties[field].anyOf?.some(variant => variant.type === 'null'))) {
    throw new Error(`${name} must be closed with non-null fields`);
  }
}
if (tenantOpenapi.components.schemas.TeacherAnalyticsTopicsOut.properties.topics.items?.$ref !== '#/components/schemas/TeacherAnalyticsTopicOut') {
  throw new Error('TeacherAnalyticsTopicsOut topics must contain TeacherAnalyticsTopicOut items');
}
if (responseSchemaRef(tenantOpenapi, '/api/teacher/analytics/dashboard', 'get') !== '#/components/schemas/TeacherAnalyticsDashboardOut') {
  throw new Error('GET /api/teacher/analytics/dashboard must return TeacherAnalyticsDashboardOut');
}
for (const [name, fields] of [
  ['TeacherAnalyticsDashboardOut', ['class_id', 'class_name', 'period', 'kpi', 'dynamics', 'problem_topics', 'attention_students']],
  ['TeacherAnalyticsPeriodOut', ['start', 'end']],
  ['TeacherAnalyticsKpiOut', ['avg_grade', 'total_grades', 'bad_grades', 'bad_ratio', 'problem_topics_count']],
  ['TeacherAnalyticsDynamicsOut', ['date', 'avg']],
  ['TeacherAnalyticsAttentionStudentOut', ['id', 'name', 'avg', 'twos']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${name} must require the exact teacher analytics dashboard fields`);
  }
  if (schema.additionalProperties !== false || fields.some(field => schema.properties[field].anyOf?.some(variant => variant.type === 'null'))) {
    throw new Error(`${name} must be closed with non-null fields`);
  }
}
const teacherAnalyticsDashboard = tenantOpenapi.components.schemas.TeacherAnalyticsDashboardOut.properties;
for (const [field, expectedRef] of [
  ['period', '#/components/schemas/TeacherAnalyticsPeriodOut'],
  ['kpi', '#/components/schemas/TeacherAnalyticsKpiOut'],
]) {
  if (teacherAnalyticsDashboard[field].$ref !== expectedRef) {
    throw new Error(`TeacherAnalyticsDashboardOut ${field} ref differs from the client contract`);
  }
}
for (const [field, expectedRef] of [
  ['dynamics', '#/components/schemas/TeacherAnalyticsDynamicsOut'],
  ['problem_topics', '#/components/schemas/TeacherAnalyticsTopicOut'],
  ['attention_students', '#/components/schemas/TeacherAnalyticsAttentionStudentOut'],
]) {
  if (teacherAnalyticsDashboard[field].items?.$ref !== expectedRef) {
    throw new Error(`TeacherAnalyticsDashboardOut ${field} item ref differs from the client contract`);
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/teacher/analytics/students/problem', 'get') !== '#/components/schemas/TeacherAnalyticsProblemStudentsOut') {
  throw new Error('GET /api/teacher/analytics/students/problem must return TeacherAnalyticsProblemStudentsOut');
}
for (const [name, fields] of [
  ['TeacherAnalyticsProblemStudentsOut', ['students', 'problem_count']],
  ['TeacherAnalyticsProblemStudentOut', ['id', 'name', 'avg', 'total_grades', 'twos', 'threes', 'is_problem', 'issues']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${name} must require the exact teacher analytics problem-students fields`);
  }
  if (schema.additionalProperties !== false || fields.some(field => schema.properties[field].anyOf?.some(variant => variant.type === 'null'))) {
    throw new Error(`${name} must be closed with non-null fields`);
  }
}
const teacherAnalyticsProblemStudents = tenantOpenapi.components.schemas.TeacherAnalyticsProblemStudentsOut.properties.students;
if (teacherAnalyticsProblemStudents.items?.$ref !== '#/components/schemas/TeacherAnalyticsProblemStudentOut') {
  throw new Error('TeacherAnalyticsProblemStudentsOut students must contain TeacherAnalyticsProblemStudentOut items');
}
if (tenantOpenapi.components.schemas.TeacherAnalyticsProblemStudentOut.properties.issues.items?.type !== 'string') {
  throw new Error('TeacherAnalyticsProblemStudentOut issues must contain strings');
}
for (const [path, responseSchema] of [
  ['/api/parent/children', 'ParentChildrenOut'],
  ['/api/parent/children/{student_id}/transactions', 'ParentTransactionsOut'],
  ['/api/parent/children/{student_id}/grades/summary', 'GradesSummaryOut'],
  ['/api/student/grades/summary', 'GradesSummaryOut'],
  ['/api/parent/children/{student_id}/grades/analytics', 'GradesAnalyticsOut'],
  ['/api/student/grades/analytics', 'GradesAnalyticsOut'],
]) {
  if (responseSchemaRef(tenantOpenapi, path, 'get') !== `#/components/schemas/${responseSchema}`) {
    throw new Error(`GET ${path} must return ${responseSchema}`);
  }
}
for (const [name, fields] of [
  ['ParentChildrenOut', ['children']],
  ['ParentChildOut', ['id', 'first_name', 'last_name', 'patronymic', 'balance', 'class_name', 'class_id', 'average', 'total_grades', 'enrollment_status']],
  ['GradesSummaryOut', ['subjects', 'total_points', 'total_grades']],
  ['GradeSummarySubjectOut', ['subject_id', 'subject_name', 'average', 'count', 'points']],
  ['GradesAnalyticsOut', ['period_type', 'current_period', 'periods', 'subjects']],
  ['GradeAnalyticsPeriodOut', ['id', 'name', 'start_date', 'end_date']],
  ['GradeAnalyticsSubjectOut', ['subject_id', 'subject_name', 'periods', 'year_average']],
  ['ParentTransactionsOut', ['transactions']],
  ['ParentTransactionOut', ['id', 'amount', 'balance_after', 'type', 'reason', 'created_at']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${name} must require the exact parent analytics fields`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
}
for (const [schemaName, field, itemRef] of [
  ['ParentChildrenOut', 'children', 'ParentChildOut'],
  ['GradesSummaryOut', 'subjects', 'GradeSummarySubjectOut'],
  ['GradesAnalyticsOut', 'periods', 'GradeAnalyticsPeriodOut'],
  ['GradesAnalyticsOut', 'subjects', 'GradeAnalyticsSubjectOut'],
  ['ParentTransactionsOut', 'transactions', 'ParentTransactionOut'],
]) {
  if (tenantOpenapi.components.schemas[schemaName].properties[field].items?.$ref !== `#/components/schemas/${itemRef}`) {
    throw new Error(`${schemaName} ${field} item ref differs from the client contract`);
  }
}
const parentChild = tenantOpenapi.components.schemas.ParentChildOut.properties;
for (const field of ['first_name', 'last_name', 'patronymic', 'class_name', 'class_id']) {
  if (!(parentChild[field].anyOf ?? []).some(schema => schema.type === 'null')) {
    throw new Error(`ParentChildOut ${field} must be required nullable`);
  }
}
if (parentChild.enrollment_status.const !== 'active') {
  throw new Error('ParentChildOut enrollment_status must remain active');
}
const gradesAnalytics = tenantOpenapi.components.schemas.GradesAnalyticsOut.properties;
if (JSON.stringify(gradesAnalytics.period_type.enum) !== JSON.stringify(['quarter', 'half_year']) || !(gradesAnalytics.current_period.anyOf ?? []).some(schema => schema.type === 'null')) {
  throw new Error('GradesAnalyticsOut period type/current period differ from the shared contract');
}
for (const field of ['start_date', 'end_date']) {
  const schema = tenantOpenapi.components.schemas.GradeAnalyticsPeriodOut.properties[field];
  if (schema.type !== 'string' || schema.format !== 'date-time') {
    throw new Error(`GradeAnalyticsPeriodOut ${field} must be date-time`);
  }
}
const analyticsPeriodValues = tenantOpenapi.components.schemas.GradeAnalyticsSubjectOut.properties.periods.additionalProperties?.anyOf ?? [];
if (!analyticsPeriodValues.some(schema => schema.type === 'number') || !analyticsPeriodValues.some(schema => schema.type === 'null')) {
  throw new Error('GradeAnalyticsSubjectOut periods values must be nullable numbers');
}
const parentTransaction = tenantOpenapi.components.schemas.ParentTransactionOut.properties;
if (!(parentTransaction.reason.anyOf ?? []).some(schema => schema.type === 'null')) {
  throw new Error('ParentTransactionOut reason must be required nullable');
}
const transactionCreatedAt = parentTransaction.created_at.anyOf ?? [];
if (!transactionCreatedAt.some(schema => schema.type === 'string' && schema.format === 'date-time') || !transactionCreatedAt.some(schema => schema.type === 'null')) {
  throw new Error('ParentTransactionOut created_at must be nullable date-time');
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
if (responseSchemaRef(tenantOpenapi, '/api/journal/subjects/{subject_id}/topics', 'get') !== '#/components/schemas/JournalTopicsOut') {
  throw new Error('GET /api/journal/subjects/{subject_id}/topics must return JournalTopicsOut');
}
for (const [name, fields] of [
  ['JournalTopicsOut', ['topics']],
  ['JournalTopicOut', ['id', 'name', 'order_num']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  const required = schema.required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the journal topics read contract`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
  if (fields.some(field => schema.properties[field].nullable === true || schema.properties[field].anyOf?.some(variant => variant.type === 'null'))) {
    throw new Error(`${name} fields must not be nullable`);
  }
}
const journalTopicsItemsRef = tenantOpenapi.components.schemas.JournalTopicsOut.properties.topics.items?.$ref;
if (journalTopicsItemsRef !== '#/components/schemas/JournalTopicOut') {
  throw new Error('JournalTopicsOut topics must contain JournalTopicOut items');
}
for (const [path, method, requestSchema] of [
  ['/api/journal/subjects/{subject_id}/topics', 'post', 'TopicCreate'],
  ['/api/journal/topics/{topic_id}', 'put', 'TopicUpdate'],
]) {
  const requestRef = tenantOpenapi.paths[path][method].requestBody.content['application/json'].schema.$ref;
  if (requestRef !== `#/components/schemas/${requestSchema}`) {
    throw new Error(`${method.toUpperCase()} ${path} must accept ${requestSchema}`);
  }
  if (responseSchemaRef(tenantOpenapi, path, method) !== '#/components/schemas/JournalTopicOut') {
    throw new Error(`${method.toUpperCase()} ${path} must return JournalTopicOut`);
  }
}
for (const name of ['TopicCreate', 'TopicUpdate']) {
  const schema = tenantOpenapi.components.schemas[name];
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(['name']) || JSON.stringify(schema.required ?? []) !== JSON.stringify(['name'])) {
    throw new Error(`${name} must require only name`);
  }
  if (schema.properties.name.type !== 'string') {
    throw new Error(`${name} name must be a non-null string`);
  }
}
for (const [path, method, responseSchema, archivedValue] of [
  ['/api/journal/topics/{topic_id}', 'delete', 'JournalTopicArchiveOut', true],
  ['/api/journal/topics/{topic_id}/restore', 'post', 'JournalTopicRestoreOut', false],
]) {
  if (responseSchemaRef(tenantOpenapi, path, method) !== `#/components/schemas/${responseSchema}`) {
    throw new Error(`${method.toUpperCase()} ${path} must return ${responseSchema}`);
  }
  const schema = tenantOpenapi.components.schemas[responseSchema];
  const fields = ['detail', 'is_archived'];
  if (JSON.stringify(Object.keys(schema.properties ?? {})) !== JSON.stringify(fields) || JSON.stringify(schema.required ?? []) !== JSON.stringify(fields)) {
    throw new Error(`${responseSchema} must require the exact lifecycle receipt fields`);
  }
  if (schema.additionalProperties !== false || schema.properties.detail.const !== 'ok' || schema.properties.is_archived.const !== archivedValue) {
    throw new Error(`${responseSchema} must be a closed exact lifecycle receipt`);
  }
  if (tenantOpenapi.paths[path][method].requestBody !== undefined) {
    throw new Error(`${method.toUpperCase()} ${path} must not accept a request body`);
  }
}
if (responseSchemaRef(tenantOpenapi, '/api/periods', 'get') !== '#/components/schemas/ActivePeriodsOut') {
  throw new Error('GET /api/periods must return ActivePeriodsOut');
}
for (const [name, fields] of [
  ['ActivePeriodsOut', ['current_period', 'periods']],
  ['ActivePeriodOut', ['id', 'name', 'period_type', 'start_date', 'end_date']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  const required = schema.required ?? [];
  if (fields.some(field => !required.includes(field))) {
    throw new Error(`${name} required fields differ from the active periods client contract`);
  }
  if (schema.additionalProperties !== false) {
    throw new Error(`${name} must reject additional properties`);
  }
}
const activePeriods = tenantOpenapi.components.schemas.ActivePeriodsOut.properties;
if (activePeriods.periods.items?.$ref !== '#/components/schemas/ActivePeriodOut') {
  throw new Error('ActivePeriodsOut periods must contain ActivePeriodOut items');
}
const currentPeriodVariants = activePeriods.current_period.anyOf ?? [];
if (!currentPeriodVariants.some(schema => schema.$ref === '#/components/schemas/ActivePeriodOut') || !currentPeriodVariants.some(schema => schema.type === 'null')) {
  throw new Error('ActivePeriodsOut current_period must be required nullable ActivePeriodOut');
}
const activePeriod = tenantOpenapi.components.schemas.ActivePeriodOut.properties;
for (const field of ['start_date', 'end_date']) {
  if (activePeriod[field].type !== 'string' || activePeriod[field].format !== 'date') {
    throw new Error(`ActivePeriodOut ${field} must be a date`);
  }
}
const occurrencePath = '/api/journal/lesson-occurrences/{occurrence_id}';
const occurrenceRequestRef = tenantOpenapi.paths[occurrencePath].patch.requestBody.content['application/json'].schema.$ref;
if (occurrenceRequestRef !== '#/components/schemas/LessonOccurrenceUpdate') {
  throw new Error('PATCH lesson occurrence must accept LessonOccurrenceUpdate');
}
if (responseSchemaRef(tenantOpenapi, occurrencePath, 'patch') !== '#/components/schemas/LessonOccurrenceUpdateOut') {
  throw new Error('PATCH lesson occurrence must return LessonOccurrenceUpdateOut');
}
const occurrenceReceipt = tenantOpenapi.components.schemas.LessonOccurrenceUpdateOut;
const occurrenceFields = ['success', 'occurrence_id', 'status', 'lesson_date', 'lesson_number', 'topic_id', 'version'];
if (JSON.stringify(Object.keys(occurrenceReceipt.properties ?? {})) !== JSON.stringify(occurrenceFields) || JSON.stringify(occurrenceReceipt.required ?? []) !== JSON.stringify(occurrenceFields)) {
  throw new Error('LessonOccurrenceUpdateOut must require the exact authoritative receipt fields');
}
if (occurrenceReceipt.additionalProperties !== false) {
  throw new Error('LessonOccurrenceUpdateOut must reject additional properties');
}
const occurrenceTopicVariants = occurrenceReceipt.properties.topic_id.anyOf ?? [];
if (!occurrenceTopicVariants.some(schema => schema.type === 'integer') || !occurrenceTopicVariants.some(schema => schema.type === 'null')) {
  throw new Error('LessonOccurrenceUpdateOut topic_id must be required nullable integer');
}
if (occurrenceReceipt.properties.lesson_date.type !== 'string' || occurrenceReceipt.properties.lesson_date.format !== 'date') {
  throw new Error('LessonOccurrenceUpdateOut lesson_date must be a date');
}
const occurrenceStatuses = occurrenceReceipt.properties.status.enum ?? [];
if (JSON.stringify(occurrenceStatuses) !== JSON.stringify(['scheduled', 'cancelled', 'completed'])) {
  throw new Error('LessonOccurrenceUpdateOut status values differ from lifecycle policy');
}
if (responseSchemaRef(tenantOpenapi, '/api/journal/grades/{grade_id}', 'get') !== '#/components/schemas/JournalGradeDetailOut') {
  throw new Error('GET /api/journal/grades/{grade_id} must return JournalGradeDetailOut');
}
const gradeDetail = tenantOpenapi.components.schemas.JournalGradeDetailOut;
const gradeDetailFields = ['id', 'version', 'grade_value', 'points', 'grade_type', 'work_type_id', 'weight', 'lesson_date', 'comment', 'attendance_mark', 'color', 'created_at', 'subject', 'student', 'topic_id', 'topic_name'];
if (JSON.stringify(Object.keys(gradeDetail.properties ?? {})) !== JSON.stringify(gradeDetailFields) || JSON.stringify(gradeDetail.required ?? []) !== JSON.stringify(gradeDetailFields)) {
  throw new Error('JournalGradeDetailOut must require the exact detail fields');
}
if (gradeDetail.additionalProperties !== false || gradeDetail.properties.version.minimum !== 1) {
  throw new Error('JournalGradeDetailOut must be closed with a positive version');
}
for (const field of ['grade_value', 'work_type_id', 'lesson_date', 'comment', 'attendance_mark', 'color', 'created_at', 'subject', 'student', 'topic_id', 'topic_name']) {
  const variants = gradeDetail.properties[field].anyOf ?? [];
  if (!variants.some(schema => schema.type === 'null')) {
    throw new Error(`JournalGradeDetailOut ${field} must be required nullable`);
  }
}
const gradeLessonDate = gradeDetail.properties.lesson_date.anyOf ?? [];
if (!gradeLessonDate.some(schema => schema.type === 'string' && schema.format === 'date')) {
  throw new Error('JournalGradeDetailOut lesson_date must contain a date variant');
}
const gradeCreatedAt = gradeDetail.properties.created_at.anyOf ?? [];
if (!gradeCreatedAt.some(schema => schema.type === 'string' && schema.format === 'date-time')) {
  throw new Error('JournalGradeDetailOut created_at must contain a date-time variant');
}
for (const [field, schemaName] of [['subject', 'JournalGradeSubjectOut'], ['student', 'JournalGradeStudentOut']]) {
  const variants = gradeDetail.properties[field].anyOf ?? [];
  if (!variants.some(schema => schema.$ref === `#/components/schemas/${schemaName}`)) {
    throw new Error(`JournalGradeDetailOut ${field} must reference ${schemaName}`);
  }
}
for (const [name, fields] of [
  ['JournalGradeSubjectOut', ['id', 'name', 'category']],
  ['JournalGradeStudentOut', ['id', 'first_name', 'last_name']],
]) {
  const schema = tenantOpenapi.components.schemas[name];
  if (schema.additionalProperties !== false || fields.some(field => !schema.required?.includes(field))) {
    throw new Error(`${name} must be closed with required detail fields`);
  }
}
const gradeUpdatePath = '/api/journal/grades/{grade_id}';
const gradeUpdateRequestRef = tenantOpenapi.paths[gradeUpdatePath].put.requestBody.content['application/json'].schema.$ref;
if (gradeUpdateRequestRef !== '#/components/schemas/UpdateGradeRequest') {
  throw new Error('PUT grade must accept UpdateGradeRequest');
}
if (responseSchemaRef(tenantOpenapi, gradeUpdatePath, 'put') !== '#/components/schemas/JournalGradeUpdateOut') {
  throw new Error('PUT grade must return JournalGradeUpdateOut');
}
const gradeUpdate = tenantOpenapi.components.schemas.JournalGradeUpdateOut;
const gradeUpdateFields = ['success', 'version', 'grade_value', 'points', 'points_diff', 'new_balance', 'color'];
if (JSON.stringify(Object.keys(gradeUpdate.properties ?? {})) !== JSON.stringify(gradeUpdateFields) || JSON.stringify(gradeUpdate.required ?? []) !== JSON.stringify(gradeUpdateFields)) {
  throw new Error('JournalGradeUpdateOut must require the exact authoritative receipt fields');
}
if (gradeUpdate.additionalProperties !== false || gradeUpdate.properties.version.minimum !== 1) {
  throw new Error('JournalGradeUpdateOut must be closed with a positive version');
}
for (const field of ['grade_value', 'color']) {
  const variants = gradeUpdate.properties[field].anyOf ?? [];
  if (!variants.some(schema => schema.type === 'null')) {
    throw new Error(`JournalGradeUpdateOut ${field} must be required nullable`);
  }
}
for (const field of ['points', 'points_diff', 'new_balance']) {
  if (gradeUpdate.properties[field].type !== 'integer') {
    throw new Error(`JournalGradeUpdateOut ${field} must be an integer`);
  }
}
const gradeCreatePath = '/api/journal/grades';
const gradeCreateRequestRef = tenantOpenapi.paths[gradeCreatePath].post.requestBody.content['application/json'].schema.$ref;
if (gradeCreateRequestRef !== '#/components/schemas/AddGradeRequest') {
  throw new Error('POST grade must accept AddGradeRequest');
}
if (responseSchemaRef(tenantOpenapi, gradeCreatePath, 'post') !== '#/components/schemas/JournalGradeCreateOut') {
  throw new Error('POST grade must return JournalGradeCreateOut');
}
const gradeCreate = tenantOpenapi.components.schemas.JournalGradeCreateOut;
const gradeCreateFields = ['success', 'grade_id', 'grade_value', 'points', 'new_balance', 'color', 'attendance_mark', 'message'];
if (JSON.stringify(Object.keys(gradeCreate.properties ?? {})) !== JSON.stringify(gradeCreateFields) || JSON.stringify(gradeCreate.required ?? []) !== JSON.stringify(gradeCreateFields)) {
  throw new Error('JournalGradeCreateOut must require the exact authoritative receipt fields');
}
if (gradeCreate.additionalProperties !== false) {
  throw new Error('JournalGradeCreateOut must reject additional properties');
}
for (const field of ['grade_value', 'color', 'attendance_mark']) {
  const variants = gradeCreate.properties[field].anyOf ?? [];
  if (!variants.some(schema => schema.type === 'null')) {
    throw new Error(`JournalGradeCreateOut ${field} must be required nullable`);
  }
}
for (const field of ['grade_id', 'points', 'new_balance']) {
  if (gradeCreate.properties[field].type !== 'integer') {
    throw new Error(`JournalGradeCreateOut ${field} must be an integer`);
  }
}
const addGradeRequest = tenantOpenapi.components.schemas.AddGradeRequest;
for (const field of ['student_id', 'subject_id', 'class_id']) {
  if (!addGradeRequest.required?.includes(field)) {
    throw new Error(`AddGradeRequest must require ${field}`);
  }
}
for (const field of ['grade_value', 'work_type_id', 'grade_type', 'attendance_mark', 'topic_id', 'lesson_date', 'lesson_number', 'comment']) {
  if (addGradeRequest.required?.includes(field)) {
    throw new Error(`AddGradeRequest ${field} must remain optional`);
  }
  const variants = addGradeRequest.properties[field].anyOf ?? [];
  if (!variants.some(schema => schema.type === 'null')) {
    throw new Error(`AddGradeRequest ${field} must remain nullable`);
  }
}
const gradeDeletePath = '/api/journal/grades/{grade_id}';
if (responseSchemaRef(tenantOpenapi, gradeDeletePath, 'delete') !== '#/components/schemas/JournalGradeDeleteOut') {
  throw new Error('DELETE grade must return JournalGradeDeleteOut');
}
const gradeDelete = tenantOpenapi.components.schemas.JournalGradeDeleteOut;
const gradeDeleteFields = ['success', 'message'];
if (JSON.stringify(Object.keys(gradeDelete.properties ?? {})) !== JSON.stringify(gradeDeleteFields) || JSON.stringify(gradeDelete.required ?? []) !== JSON.stringify(gradeDeleteFields)) {
  throw new Error('JournalGradeDeleteOut must require the exact receipt fields');
}
if (gradeDelete.additionalProperties !== false || gradeDelete.properties.success.type !== 'boolean' || gradeDelete.properties.message.type !== 'string') {
  throw new Error('JournalGradeDeleteOut must be a closed boolean/string receipt');
}
if (tenantOpenapi.paths[gradeDeletePath].delete.requestBody !== undefined) {
  throw new Error('DELETE grade must not accept a request body');
}
const gradeDeleteVersion = tenantOpenapi.paths[gradeDeletePath].delete.parameters.find(parameter => parameter.name === 'version' && parameter.in === 'query');
if (!gradeDeleteVersion?.required || gradeDeleteVersion.schema?.type !== 'integer') {
  throw new Error('DELETE grade must require integer version query parameter');
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

for (const [path, schemaName] of [
  ['/api/student/diary', 'StudentDiaryOut'],
  ['/api/parent/children/{student_id}/diary', 'StudentDiaryOut'],
  ['/api/student/grades', 'StudentGradesOut'],
  ['/api/parent/children/{student_id}/grades', 'StudentGradesOut'],
  ['/api/student/grades/finals', 'StudentFinalGradesOut'],
  ['/api/parent/children/{student_id}/grades/finals', 'StudentFinalGradesOut'],
]) {
  if (responseSchemaRef(tenantOpenapi, path, 'get') !== `#/components/schemas/${schemaName}`) {
    throw new Error(`GET ${path} must return ${schemaName}`);
  }
}

const studentQuestsResponse = tenantOpenapi.paths['/api/student/quests'].get.responses['200'].content['application/json'].schema;
if (studentQuestsResponse.type !== 'array' || studentQuestsResponse.items?.$ref !== '#/components/schemas/StudentQuestOut') {
  throw new Error('GET /api/student/quests must return StudentQuestOut[]');
}

for (const [name, fields, required] of [
  ['StudentDiaryOut', ['class_id', 'class_name', 'week_start', 'week_end', 'week_offset', 'current_period', 'week_periods', 'diary']],
  ['StudentDiaryPeriodOut', ['id', 'name', 'period_type', 'start_date', 'end_date']],
  ['StudentDiaryDayOut', ['date', 'day_name', 'is_today', 'lessons']],
  ['StudentDiaryLessonOut', ['lesson_number', 'subject_id', 'subject_name', 'teacher_name', 'start_time', 'end_time', 'room', 'grades', 'homework', 'control_work', 'occurrence_id', 'status', 'group_name'], ['lesson_number', 'subject_id', 'subject_name', 'teacher_name', 'start_time', 'end_time', 'room', 'grades', 'homework', 'control_work', 'occurrence_id', 'status']],
  ['StudentDiaryGradeOut', ['id', 'value', 'points', 'weight', 'type', 'comment', 'color', 'topic']],
  ['StudentDiaryHomeworkOut', ['id', 'title', 'description', 'due_date', 'deadline_at', 'is_overdue', 'student_state', 'attachments']],
  ['StudentDiaryHomeworkStateOut', ['status', 'version', 'completed_at']],
  ['StudentDiaryHomeworkAttachmentOut', ['id', 'filename', 'url_link']],
  ['StudentDiaryControlWorkOut', ['id', 'work_type', 'title']],
  ['StudentGradesOut', ['grades']],
  ['StudentGradeOut', ['id', 'value', 'points', 'weight', 'date', 'type', 'comment', 'subject_id', 'subject_name', 'color', 'topic']],
  ['StudentFinalGradesOut', ['final_grades']],
  ['StudentFinalGradeOut', ['id', 'subject_id', 'subject_name', 'period_id', 'period_name', 'grade_value', 'grade_type', 'comment', 'color']],
  ['StudentQuestOut', ['id', 'quest_id', 'title', 'description', 'reward', 'progress', 'target', 'status', 'reward_claimed']],
]) {
  assertExactClosedObject(name, fields, required);
}

const studentDiary = tenantOpenapi.components.schemas.StudentDiaryOut.properties;
assertNullableVariant('StudentDiaryOut class_id', studentDiary.class_id, 'integer');
assertNullableVariant('StudentDiaryOut class_name', studentDiary.class_name, 'string');
assertNullableRef('StudentDiaryOut current_period', studentDiary.current_period, 'StudentDiaryPeriodOut');
assertItemRef('StudentDiaryOut', 'week_periods', 'StudentDiaryPeriodOut');
if (studentDiary.diary.additionalProperties?.$ref !== '#/components/schemas/StudentDiaryDayOut') {
  throw new Error('StudentDiaryOut diary values must reference StudentDiaryDayOut');
}
assertItemRef('StudentDiaryDayOut', 'lessons', 'StudentDiaryLessonOut');
assertItemRef('StudentDiaryLessonOut', 'grades', 'StudentDiaryGradeOut');
assertItemRef('StudentDiaryLessonOut', 'homework', 'StudentDiaryHomeworkOut');
assertItemRef('StudentDiaryHomeworkOut', 'attachments', 'StudentDiaryHomeworkAttachmentOut');
if (tenantOpenapi.components.schemas.StudentDiaryHomeworkOut.properties.student_state.$ref !== '#/components/schemas/StudentDiaryHomeworkStateOut') {
  throw new Error('StudentDiaryHomeworkOut student_state must reference StudentDiaryHomeworkStateOut');
}
assertNullableRef('StudentDiaryLessonOut control_work', tenantOpenapi.components.schemas.StudentDiaryLessonOut.properties.control_work, 'StudentDiaryControlWorkOut');
for (const [schemaName, fields] of [
  ['StudentDiaryLessonOut', [['subject_name', 'string'], ['teacher_name', 'string'], ['room', 'string'], ['occurrence_id', 'integer'], ['group_name', 'string']]],
  ['StudentDiaryGradeOut', [['value', 'integer'], ['comment', 'string'], ['color', 'string'], ['topic', 'string']]],
  ['StudentDiaryHomeworkOut', [['description', 'string'], ['due_date', 'string'], ['deadline_at', 'string']]],
  ['StudentDiaryHomeworkStateOut', [['completed_at', 'string']]],
  ['StudentDiaryHomeworkAttachmentOut', [['filename', 'string'], ['url_link', 'string']]],
  ['StudentDiaryControlWorkOut', [['title', 'string']]],
  ['StudentGradeOut', [['value', 'integer'], ['date', 'string'], ['comment', 'string'], ['color', 'string'], ['topic', 'string']]],
  ['StudentFinalGradeOut', [['period_id', 'integer'], ['period_name', 'string'], ['comment', 'string'], ['color', 'string']]],
  ['StudentQuestOut', [['id', 'integer'], ['description', 'string']]],
]) {
  const properties = tenantOpenapi.components.schemas[schemaName].properties;
  for (const [field, type] of fields) assertNullableVariant(`${schemaName} ${field}`, properties[field], type);
}
for (const [schemaName, field, itemName] of [
  ['StudentGradesOut', 'grades', 'StudentGradeOut'],
  ['StudentFinalGradesOut', 'final_grades', 'StudentFinalGradeOut'],
]) assertItemRef(schemaName, field, itemName);
if (JSON.stringify(tenantOpenapi.components.schemas.StudentDiaryLessonOut.properties.status.enum) !== JSON.stringify(['scheduled', 'cancelled', 'completed'])) {
  throw new Error('StudentDiaryLessonOut status literals differ from the live contract');
}
if (JSON.stringify(tenantOpenapi.components.schemas.StudentDiaryHomeworkStateOut.properties.status.enum) !== JSON.stringify(['not_started', 'in_progress', 'completed'])) {
  throw new Error('StudentDiaryHomeworkStateOut status literals differ from the live contract');
}
if (JSON.stringify(tenantOpenapi.components.schemas.StudentQuestOut.properties.status.enum) !== JSON.stringify(['active', 'available', 'completed', 'ready'])) {
  throw new Error('StudentQuestOut status literals differ from the live contract');
}

if (responseSchemaRef(tenantOpenapi, '/api/journal/{class_id}/{subject_id}', 'get') !== '#/components/schemas/JournalOut') {
  throw new Error('GET /api/journal/{class_id}/{subject_id} must return JournalOut');
}
for (const [name, fields] of [
  ['JournalOut', ['subject', 'students', 'dates', 'schedule_slots', 'current_period', 'available_periods', 'final_grades', 'control_works', 'can_set_final_grade', 'holiday_periods', 'readonly', 'subgroup_name', 'lesson_templates']],
  ['JournalGridSubjectOut', ['id', 'name', 'category']],
  ['JournalGridStudentOut', ['id', 'first_name', 'last_name', 'patronymic', 'grades', 'average']],
  ['JournalGridGradeOut', ['id', 'grade_value', 'points', 'grade_type', 'work_type_id', 'weight', 'attendance_mark', 'lesson_date', 'comment', 'color', 'topic_id', 'topic_name']],
  ['JournalPeriodOut', ['id', 'name', 'period_type', 'target_grades', 'academic_year_id', 'start_date', 'end_date']],
  ['JournalFinalGradeOut', ['id', 'student_id', 'subject_id', 'period_id', 'grade_value', 'grade_type', 'comment']],
  ['JournalControlWorkOut', ['id', 'class_id', 'subject_id', 'work_type', 'title', 'work_date']],
  ['JournalHolidayPeriodOut', ['name', 'start_date', 'end_date']],
  ['JournalLessonTemplateOut', ['occurrence_id', 'lesson_date', 'lesson_number', 'topic_id', 'work_type_id']],
]) assertExactClosedObject(name, fields);

const journal = tenantOpenapi.components.schemas.JournalOut.properties;
if (journal.subject.$ref !== '#/components/schemas/JournalGridSubjectOut') throw new Error('JournalOut subject must reference JournalGridSubjectOut');
for (const [field, itemName] of [
  ['students', 'JournalGridStudentOut'],
  ['available_periods', 'JournalPeriodOut'],
  ['final_grades', 'JournalFinalGradeOut'],
  ['control_works', 'JournalControlWorkOut'],
  ['holiday_periods', 'JournalHolidayPeriodOut'],
]) assertItemRef('JournalOut', field, itemName);
assertNullableRef('JournalOut current_period', journal.current_period, 'JournalPeriodOut');
assertNullableVariant('JournalOut subgroup_name', journal.subgroup_name, 'string');
if (journal.schedule_slots.additionalProperties?.items?.type !== 'integer') throw new Error('JournalOut schedule_slots values must be integer arrays');
if (journal.lesson_templates.additionalProperties?.$ref !== '#/components/schemas/JournalLessonTemplateOut') throw new Error('JournalOut lesson_templates values must reference JournalLessonTemplateOut');
assertItemRef('JournalGridStudentOut', 'grades', 'JournalGridGradeOut');
for (const [schemaName, fields] of [
  ['JournalGridStudentOut', [['first_name', 'string'], ['last_name', 'string'], ['patronymic', 'string'], ['average', 'number']]],
  ['JournalGridGradeOut', [['grade_value', 'integer'], ['work_type_id', 'integer'], ['attendance_mark', 'string'], ['lesson_date', 'string'], ['comment', 'string'], ['color', 'string'], ['topic_id', 'integer'], ['topic_name', 'string']]],
  ['JournalPeriodOut', [['target_grades', 'string'], ['start_date', 'string'], ['end_date', 'string']]],
  ['JournalFinalGradeOut', [['period_id', 'integer'], ['comment', 'string']]],
  ['JournalControlWorkOut', [['title', 'string']]],
  ['JournalLessonTemplateOut', [['occurrence_id', 'integer'], ['lesson_number', 'integer'], ['topic_id', 'integer'], ['work_type_id', 'integer']]],
]) {
  const properties = tenantOpenapi.components.schemas[schemaName].properties;
  for (const [field, type] of fields) assertNullableVariant(`${schemaName} ${field}`, properties[field], type);
}

for (const [path, method, schemaName] of [
  ['/api/journal/grades/final/{class_id}/{subject_id}', 'post', 'JournalFinalGradeSetOut'],
  ['/api/journal/grades/final/{final_grade_id}', 'delete', 'JournalMutationSuccessOut'],
  ['/api/journal/{class_id}/{subject_id}/lesson-templates/{lesson_date}', 'put', 'JournalLessonTemplateSetOut'],
  ['/api/journal/{class_id}/{subject_id}/lesson-templates/{lesson_date}', 'delete', 'JournalMutationSuccessOut'],
]) {
  if (responseSchemaRef(tenantOpenapi, path, method) !== `#/components/schemas/${schemaName}`) {
    throw new Error(`${method.toUpperCase()} ${path} must return ${schemaName}`);
  }
}
for (const [name, fields] of [
  ['JournalFinalGradeSetOut', ['success', 'final_grade_id']],
  ['JournalMutationSuccessOut', ['success']],
  ['JournalLessonTemplateSetOut', ['success', 'updated_grades']],
]) {
  const properties = assertExactClosedObject(name, fields);
  if (properties.success.const !== true) throw new Error(`${name} success must remain literal true`);
}

for (const [path, schemaName] of [
  ['/api/journal/import/analyze/{class_id}/{subject_id}', 'ParsingPreviewResponse'],
  ['/api/journal/import/execute/{class_id}/{subject_id}', 'ImportExecutionResponse'],
]) {
  if (responseSchemaRef(tenantOpenapi, path, 'post') !== `#/components/schemas/${schemaName}`) {
    throw new Error(`POST ${path} must return ${schemaName}`);
  }
}
for (const [name, fields, required] of [
  ['ParsingPreviewResponse', ['subject_raw_name', 'class_raw_name', 'unique_acronyms', 'unique_dates', 'student_names', 'preview_grades', 'total_grades_found', 'validation_errors'], ['unique_acronyms', 'unique_dates', 'student_names', 'preview_grades', 'total_grades_found']],
  ['ParsedGradeRaw', ['student_name', 'date', 'acronym', 'grade_value', 'attendance_mark', 'original_cell_text'], ['student_name', 'date', 'acronym', 'original_cell_text']],
  ['ImportExecutionResponse', ['added_count', 'skipped_count', 'replaced_count', 'logs'], ['added_count', 'skipped_count', 'logs']],
  ['ImportLog', ['student_name', 'date', 'message', 'level']],
]) assertExactClosedObject(name, fields, required ?? fields);
const importPreview = tenantOpenapi.components.schemas.ParsingPreviewResponse.properties;
assertNullableVariant('ParsingPreviewResponse subject_raw_name', importPreview.subject_raw_name, 'string');
assertNullableVariant('ParsingPreviewResponse class_raw_name', importPreview.class_raw_name, 'string');
assertItemRef('ParsingPreviewResponse', 'preview_grades', 'ParsedGradeRaw');
const parsedGrade = tenantOpenapi.components.schemas.ParsedGradeRaw.properties;
assertNullableVariant('ParsedGradeRaw grade_value', parsedGrade.grade_value, 'integer');
assertNullableVariant('ParsedGradeRaw attendance_mark', parsedGrade.attendance_mark, 'string');
assertItemRef('ImportExecutionResponse', 'logs', 'ImportLog');
if (JSON.stringify(tenantOpenapi.components.schemas.ImportLog.properties.level.enum) !== JSON.stringify(['info', 'warning', 'error'])) {
  throw new Error('ImportLog level literals differ from the live contract');
}

if (responseSchemaRef(tenantOpenapi, '/api/teacher/my-class/bulk-balance', 'post') !== '#/components/schemas/TeacherBulkBalanceOut') {
  throw new Error('POST /api/teacher/my-class/bulk-balance must return TeacherBulkBalanceOut');
}
const bulkBalance = assertExactClosedObject('TeacherBulkBalanceOut', ['message']);
if (bulkBalance.message.type !== 'string') throw new Error('TeacherBulkBalanceOut message must be a non-null string');

console.log(`OpenAPI contract and mobile descriptor parity passed: ${manifest.tenant.length + manifest.core.length} paths`);
