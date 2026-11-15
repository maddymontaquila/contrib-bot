import { createPreviewApp } from './preview-app.js';

try {
  const port = Number(process.env.PORT ?? 3000);
  const server = createPreviewApp(port).listen(port, '127.0.0.1');
  server.once('listening', () => {
    console.log(`Local preview: http://localhost:${port} (mock providers; no credentials or real role updates).`);
  });
  server.on('error', error => {
    console.error(`Could not start local preview: ${error.message}`);
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => server.close(() => process.exit(0)));
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not start local preview.');
  process.exitCode = 1;
}
