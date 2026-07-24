export function createConsumeOnceCoordinator(consume: (value: string) => Promise<void>) {
  const consumed = new Set<string>();
  let queue = Promise.resolve();
  return {
    submit(value: string | null | undefined, identity?: string) {
      if (!value) return queue;
      if (identity && consumed.has(identity)) return queue;
      if (identity) consumed.add(identity);
      queue = queue.then(() => consume(value)).catch(() => undefined);
      return queue;
    },
  };
}
