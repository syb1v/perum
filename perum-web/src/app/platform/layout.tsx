// Консоли платформы/орг сами рендерят app-shell (ConsoleShell). Логин — свой
// центрированный экран. Поэтому layout — прозрачный контейнер.
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
