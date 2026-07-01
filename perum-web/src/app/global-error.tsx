"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', background: '#0a0a0a', color: '#fff' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Произошла непредвиденная ошибка</h2>
        <p style={{ color: '#888', marginBottom: '2rem' }}>Мы уже знаем о проблеме и работаем над её устранением.</p>
        <button
          onClick={() => reset()}
          style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}
        >
          Попробовать снова
        </button>
      </body>
    </html>
  );
}
