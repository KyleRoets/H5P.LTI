// Give an existing ReachStudio account the Admin view.
// Usage: npm run make-admin -- someone@school.edu        (add --remove to make them a teacher again)
import { db } from '../src/db.js';

const email = process.argv.slice(2).find((a) => a.includes('@'));
const remove = process.argv.includes('--remove');
if (!email) { console.error('Usage: npm run make-admin -- <email> [--remove]'); process.exit(1); }
const r = db.prepare('UPDATE users SET role = ? WHERE email = ?').run(remove ? 'teacher' : 'admin', email);
if (!r.changes) { console.error(`No account with the email ${email}. They need to create an account first.`); process.exit(1); }
console.log(`${email} is now ${remove ? 'a teacher' : 'an admin'}.`);
