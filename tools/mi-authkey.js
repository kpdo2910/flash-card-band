#!/usr/bin/env node
/**
 * Lấy AuthKey (encrypt_key) của các thiết bị Mi Fitness gắn với tài khoản Xiaomi,
 * hỏi lần lượt mọi máy chủ khu vực (CN, SG, DE, RU, US, I2). Dùng khi AstroBox
 * báo "failed to import bound devices: invalid type: null" vì chỉ hỏi máy chủ CN.
 *
 *   npm run authkey -- --user <email|sđt|id>
 *   npm run authkey -- --user <...> --cookie "userId=...; passToken=..."   (sau khi xác minh 2 bước)
 *
 * Mật khẩu được hỏi ẩn trên terminal (hoặc biến môi trường MI_PASSWORD). Không gửi đi đâu
 * ngoài account.xiaomi.com và *.hlth.io.mi.com. Script chạy hoàn toàn trên máy bạn.
 */
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { loginMiAccount, fetchBoundDevices, formatDevice, DEFAULT_UA, HEALTH_HOSTS } from './miAccount.js';

export function parseArgs(argv) {
  const opts = { hosts: HEALTH_HOSTS, ua: DEFAULT_UA, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--user' || a === '-u') opts.user = next();
    else if (a.startsWith('--user=')) opts.user = a.slice(7);
    else if (a === '--cookie') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) opts.cookie = 'ask';
      else opts.cookie = next();
    }
    else if (a.startsWith('--cookie=')) opts.cookie = a.slice(9);
    else if (a === '--device-id') opts.deviceId = next();
    else if (a.startsWith('--device-id=')) opts.deviceId = a.slice(12);
    else if (a === '--ua') opts.ua = next();
    else if (a.startsWith('--ua=')) opts.ua = a.slice(5);
    else if (a === '--hosts') opts.hosts = next().split(',').map((h) => h.trim()).filter(Boolean);
    else if (a.startsWith('--hosts=')) opts.hosts = a.slice(8).split(',').map((h) => h.trim()).filter(Boolean);
    else if (a === '--json') opts.json = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`Tuỳ chọn không hợp lệ: ${a}`);
  }
  return opts;
}

function askVisible(question) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askHidden(question) {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, _enc, cb) {
        if (!muted) process.stdout.write(chunk);
        cb();
      }
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

const HELP = `Cách dùng:
  npm run authkey -- --user <email|số điện thoại|Xiaomi ID>
  npm run authkey -- --user <...> --device-id <id> --cookie        (hỏi userId, passToken từng dòng)
  npm run authkey -- --user <...> --cookie "userId=...; passToken=..."

Tuỳ chọn:
  --cookie     Cookie của account.xiaomi.com sau khi bạn đã xác minh hai bước trên trình duyệt
  --device-id  Giữ nguyên deviceId giữa các lần chạy (6 chữ thường)
  --hosts      Danh sách máy chủ, mặc định: ${HEALTH_HOSTS.join(',')}
  --json       In kết quả dạng JSON
Mật khẩu: nhập khi được hỏi (ẩn) hoặc đặt biến môi trường MI_PASSWORD.`;

export async function run(argv, io = { log: console.log, error: console.error }) {
  const opts = parseArgs(argv);
  if (opts.help) {
    io.log(HELP);
    return 0;
  }
  if (!opts.user && !opts.cookie) {
    if (!process.stdin.isTTY) {
      io.error(HELP);
      return 2;
    }
    opts.user = await askVisible('Tài khoản Xiaomi (email / số điện thoại / ID): ');
    if (!opts.user) {
      io.error(HELP);
      return 2;
    }
  }
  if (opts.cookie === 'ask') {
    io.log('Nhập cookie của account.xiaomi.com lấy từ trình duyệt sau khi xác minh hai bước.');
    const userId = await askVisible('userId (dãy số Xiaomi ID): ');
    const passToken = await askHidden('passToken (dán rồi Enter, không hiện): ');
    opts.cookie = `userId=${userId}; passToken=${passToken}`;
  }
  let password = process.env.MI_PASSWORD;
  if (!password && !opts.cookie) password = await askHidden(`Mật khẩu Xiaomi cho ${opts.user}: `);

  const attempt = (pwd) => loginMiAccount({
    username: opts.user || '',
    password: pwd,
    ua: opts.ua,
    deviceId: opts.deviceId,
    cookieHeader: opts.cookie,
    log: (m) => io.log('· ' + m)
  });

  let token;
  try {
    try {
      token = await attempt(password);
    } catch (e) {
      if (opts.cookie && !password && /Cần mật khẩu/.test(e.message)) {
        io.log('· Cookie chưa đủ để đăng nhập, Xiaomi yêu cầu thêm mật khẩu.');
        password = await askHidden(`Mật khẩu Xiaomi cho ${opts.user}: `);
        token = await attempt(password);
      } else {
        throw e;
      }
    }
  } catch (e) {
    if (e.code === 'TWO_FACTOR') {
      io.error('\nXiaomi yêu cầu xác minh hai bước cho lần đăng nhập này.');
      io.error('1. Mở link sau trên trình duyệt và hoàn tất xác minh (SMS/email):');
      io.error('   ' + e.url);
      io.error('2. Sau khi xác minh xong, trên cùng trình duyệt mở https://account.xiaomi.com , bật DevTools');
      io.error('   (Application → Cookies → account.xiaomi.com), chép giá trị userId và passToken.');
      io.error('3. Chạy lại lệnh sau, script sẽ hỏi userId rồi passToken từng dòng:');
      io.error(`   npm run authkey -- --user ${opts.user} --device-id ${e.deviceId} --cookie`);
      io.error('   userId là dãy số Xiaomi ID (xem tại https://account.xiaomi.com/fe/service/account hoặc cookie userId).');
      return 3;
    }
    io.error('Đăng nhập thất bại: ' + e.message);
    return 1;
  }
  io.log(`· Đăng nhập xong (userId=${token.userId || '?'}, deviceId=${token.deviceId})`);

  const { devices, perHost } = await fetchBoundDevices({ token, ua: opts.ua, hosts: opts.hosts, log: (m) => io.log('· ' + m) });
  if (opts.json) {
    io.log(JSON.stringify({ devices, perHost }, null, 2));
    return devices.length ? 0 : 4;
  }
  if (!devices.length) {
    io.error('\nKhông máy chủ nào trả về thiết bị. Kiểm tra: band đã gắn trong Mi Fitness / Xiaomi Interconnectivity với đúng tài khoản này chưa?');
    return 4;
  }
  io.log(`\n${devices.length} thiết bị:\n`);
  devices.forEach((d, i) => io.log(`[${i + 1}]\n${formatDevice(d)}\n`));
  io.log('Dán giá trị AuthKey vào AstroBox: Thiết bị → Kết nối thủ công (nhập AuthKey), sau khi band đã ở chế độ "Kết nối điện thoại mới".');
  io.log('Giữ kín AuthKey: ai có khoá này có thể kết nối tới band của bạn.');
  return 0;
}

const isMain = process.argv[1] && new URL(import.meta.url).pathname === (await import('node:path')).resolve(process.argv[1]);
if (isMain) {
  run(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((e) => {
    console.error('Lỗi: ' + (e && e.message || e));
    process.exitCode = 1;
  });
}
