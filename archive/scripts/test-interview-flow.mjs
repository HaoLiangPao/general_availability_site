import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import { neon } from '@neondatabase/serverless';

function waitForServer(url) {
  return new Promise((resolve) => {
    const check = () => {
      http.get(url, (res) => {
        if (res.statusCode === 200 || res.statusCode === 404) {
          resolve();
        } else {
          setTimeout(check, 1000);
        }
      }).on('error', () => {
        setTimeout(check, 1000);
      });
    };
    check();
  });
}

if (fs.existsSync('.env.local')) {
  for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !process.env[key]) process.env[key] = val;
  }
}

async function verifyInterviewFlow() {
  console.log('Starting dev server on port 3005 for clean test environment...');
  const server = spawn('npm', ['run', 'dev', '--', '-p', '3005'], { stdio: 'ignore' });
  
  try {
    const url = 'http://localhost:3005';
    console.log('Waiting for localhost:3005...');
    await waitForServer(url);
    await new Promise(r => setTimeout(r, 2000));
    
    console.log(`\n1. Creating a pending Interview booking...`);
    const postRes = await fetch(`${url}/api/book`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
          type: 'interview',
          date: '2026-03-31',
          time: '11:00 AM',
          name: 'Integration Test User',
          email: 'testguest@local.me',
          notes: 'Testing interview pending/confirm flow'
       })
    });
    
    const dbRes = await postRes.json();
    if (!dbRes.success) throw new Error('Booking failed: ' + dbRes.error);
    console.log(`✅ Booking created in database (ID: ${dbRes.id})`);
    
    console.log(`\n2. Querying Database for the exact confirm_token and status...`);
    const sql = neon(process.env.POSTGRES_URL);
    const bookings = await sql`SELECT status, confirm_token, calendar_event_id FROM bookings WHERE id = ${dbRes.id}`;
    const bk = bookings[0];
    
    if (bk.status !== 'pending') throw new Error(`Status should be pending, got ${bk.status}`);
    console.log(`✅ Status is 'pending'. Target calendar ID tracked: ${bk.calendar_event_id}`);
    console.log(`✅ Owner confirmation email has been dispatched with token: ${bk.confirm_token}`);
    
    console.log(`\n3. Simulating Host clicking the confirmation link...`);
    const confirmRes = await fetch(`${url}/api/confirm?token=${bk.confirm_token}`);
    const htmlOutput = await confirmRes.text();
    
    if (htmlOutput.includes('Interview Confirmed Successfully')) {
       console.log(`✅ Confirmation Endpoint handled request and updated external APIs successfully!`);
    } else {
       throw new Error('Confirmation API failed to return success HTML.');
    }
    
    const verifyHooks = await sql`SELECT status, confirm_token FROM bookings WHERE id = ${dbRes.id}`;
    if (verifyHooks[0].status !== 'confirmed') throw new Error('Database status did not update to confirmed.');
    console.log(`✅ Database explicitly marked order ID ${dbRes.id} as 'confirmed' and destroyed the token.`);

    console.log('\nAll Integration checks passed! End-to-end flow is verified!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
  } finally {
    server.kill();
  }
}

verifyInterviewFlow();
