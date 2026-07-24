type IntentHandler = (value: string, identity?: string) => Promise<void>;

let handler: IntentHandler | null = null;
const pending: Array<{ value: string; identity?: string }> = [];
const submitted = new Set<string>();
const submittedOrder: string[] = [];

export function submitNavigationIntent(value: string | null | undefined, identity?: string) {
  if (!value) return;
  if (identity && submitted.has(identity)) return;
  if (identity) {
    submitted.add(identity);
    submittedOrder.push(identity);
    if (submittedOrder.length > 128) submitted.delete(submittedOrder.shift()!);
  }
  if (!handler) return void pending.push({ value, identity });
  void handler(value, identity);
}

export function registerNavigationIntentHandler(next: (value: string, identity?: string) => Promise<void>) {
  handler = next;
  for (const intent of pending.splice(0)) void next(intent.value, intent.identity);
  return () => { handler = null; };
}
