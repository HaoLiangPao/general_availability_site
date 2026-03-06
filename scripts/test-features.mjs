import { spawn } from 'child_process';
import http from 'http';

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

function getNextWeekend() {
  const d = new Date();
  const day = d.getDay();
  const diffToSaturday = day === 6 ? 0 : 6 - day;
  d.setDate(d.getDate() + diffToSaturday);
  return d.toISOString().slice(0, 10);
}

function getNextWeekday() {
  const d = new Date();
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

async function verifyFeatures() {
  console.log('Starting dev server for verification...');
  const server = spawn('npm', ['run', 'dev'], { stdio: 'ignore' });
  
  try {
    const url = 'http://localhost:3000';
    console.log('Waiting for localhost:3000...');
    await waitForServer(url);
    
    const weekendDate = getNextWeekend();
    console.log(`\n1. Testing weekend block for interview on weekend: ${weekendDate}`);
    const resA = await fetch(`${url}/api/availability?date=${weekendDate}&type=interview`);
    const dataA = await resA.json();
    const allBlockedA = dataA.slots.every(s => s.available === false);
    if (!allBlockedA) throw new Error('Weekends are not blocked for interviews!');
    console.log('✅ Weekend interview blocked correctly.');

    const weekdayDate = getNextWeekday();
    console.log(`\n2. Testing ski_lesson availability on weekday: ${weekdayDate}`);
    const resB = await fetch(`${url}/api/availability?date=${weekdayDate}&type=ski_lesson`);
    const dataB = await resB.json();
    if (!dataB.slots || dataB.slots.length === 0) throw new Error('No ski lesson slots returned or format incorrect.');
    console.log('✅ Ski lesson returning slots correctly.');

    console.log('\nAll tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    process.exit(1);
  } finally {
    server.kill();
  }
}

verifyFeatures();
