// Starts the tool: first restore a backup if the disk is fresh (see backup.js), then run the server.
import { restoreIfEmpty, startBackups } from './backup.js';

try { await restoreIfEmpty(); } catch (e) {
  // Don't start on an empty database: it would later be saved over the good backup.
  console.error(`[backup] Could not restore the backup, so the tool is not starting: ${e.message}`);
  console.error('[backup] Check BACKUP_GITHUB_REPO, BACKUP_GITHUB_TOKEN and BACKUP_PASSPHRASE, or remove them to start without the backup.');
  process.exit(1);
}
const { createApp } = await import('./server.js');
const { config } = await import('./config.js');
const app = await createApp();
app.listen(config.port, () => console.log(`${config.toolName} listening on ${config.port} (public URL ${config.publicUrl})`));
await startBackups().catch((e) => console.error('[backup] could not start:', e.message));
