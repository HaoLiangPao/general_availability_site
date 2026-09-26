import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';

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

async function verifyBooking() {
  console.log('Starting dev server for local verification...');
  const server = spawn('npm', ['run', 'dev'], { stdio: 'ignore' });
  
  try {
    const url = 'http://localhost:3000';
    console.log('Waiting for localhost:3000...');
    try {
      await waitForServer(url);
    } catch(e) {}
    
    console.log(`\nTesting local coffee chat booking POST...`);
    // Wait an extra sec for safety
    await new Promise(r => setTimeout(r, 2000));
    
    const postRes = await fetch(`${url}/api/book`, {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify({
          type: 'coffee',
          date: '2026-03-31',
          time: '11:00 AM',
          name: 'Local Test Integration',
          email: 'test@local.me',
          notes: 'testing local node server'
       })
    });
    
    const data = await postRes.json();
    console.log('Response from local API:', data);
    
    // Cleanup
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
  } finally {
    server.kill();
  }
}

verifyBooking();
