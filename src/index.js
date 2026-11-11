const escape = (v) => String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const homeButtons = { inline_keyboard: [
  [{ text: '🔑 Моя подписка', callback_data: 'subscription' }],
  [{ text: '📲 Подключить Happ', callback_data: 'connect' }, { text: '💬 Поддержка', callback_data: 'support' }],
  [{ text: '🆔 Мой ID', callback_data: 'id' }],
] };
const back = { inline_keyboard: [[{ text: '← Главное меню', callback_data: 'home' }]] };
const welcome = '🌊 <b>WAVE VPN</b>\n\nПривет! Здесь ты найдёшь свою ссылку для подключения и инструкцию для Happ.\n\nВыбери нужный раздел 👇';
async function telegram(env, method, data) {
  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} error`);
  return result.result;
}
async function send(env, chat, text, keyboard = back) {
  return telegram(env, 'sendMessage', {chat_id:chat, text, parse_mode:'HTML', reply_markup:keyboard, link_preview_options:{is_disabled:true}});
}
async function screen(env, chat, id, action) {
  if (action === 'home') return send(env, chat, welcome, homeButtons);
  if (action === 'id') return send(env, chat, `🆔 <b>Твой Telegram ID</b>\n\n<code>${escape(id)}</code>\n\nОтправь его администратору для выдачи подписки.`);
  if (action === 'connect') return send(env, chat, '📲 <b>Как подключиться</b>\n\n1. Установи приложение Happ на своё устройство.\n2. Открой «Моя подписка» и скопируй ссылку.\n3. Добавь её в Happ как подписку или профиль.\n4. При необходимости обнови подписку и подключись.\n\nСсылка даёт доступ к VPN — никому её не пересылай.');
  if (action === 'support') {
    const username = (env.SUPPORT_USERNAME || '').replace(/^@/, '');
    return send(env, chat, /^[a-zA-Z0-9_]{5,32}$/.test(username) ? `💬 <b>Поддержка</b>\n\nНапиши: @${escape(username)}` : '💬 <b>Поддержка</b>\n\nОбратись к администратору сервиса.');
  }
  if (action === 'subscription') {
    const link = await env.WAVE_KV.get(`subscription:${id}`);
    return send(env, chat, link ? `🔑 <b>Моя подписка</b>\n\nСкопируй ссылку и добавь её в Happ:\n\n<code>${escape(link)}</code>\n\nНе делись ссылкой с другими.` : '🔑 <b>Моя подписка</b>\n\nПодписка пока не выдана. Отправь свой ID администратору.');
  }
}
function validLink(value) {
  if (value.length > 3000 || /\s/.test(value)) return false;
  try { const url = new URL(value); return ['https:', 'vless:'].includes(url.protocol) && !!url.hostname; } catch { return false; }
}
async function handle(update, env) {
  const cb = update.callback_query;
  if (cb) {
    await telegram(env, 'answerCallbackQuery', {callback_query_id:cb.id});
    if (cb.message?.chat?.type !== 'private' || !cb.from?.id || cb.message.chat.id !== cb.from.id) return;
    if (['home','id','connect','support','subscription'].includes(cb.data)) await screen(env, cb.message.chat.id, cb.from.id, cb.data);
    return;
  }
  const m = update.message;
  if (!m?.from?.id || m.chat?.type !== 'private' || m.chat.id !== m.from.id || typeof m.text !== 'string') return;
  const text = m.text.trim(), cmd = (text.split(/\s+/)[0] || '').split('@')[0].toLowerCase();
  if (cmd === '/start' || cmd === '/menu') return screen(env, m.chat.id, m.from.id, 'home');
  if (cmd === '/id') return screen(env, m.chat.id, m.from.id, 'id');
  if (cmd === '/help') return send(env, m.chat.id, '🌊 <b>Команды</b>\n\n/menu — меню\n/id — твой ID\n\nДля подключения открой меню и выбери инструкцию.', homeButtons);
  const admin = !!env.ADMIN_ID && String(m.from.id) === String(env.ADMIN_ID).trim();
  if (cmd === '/grant' && admin) {
    const match = text.match(/^\/grant(?:@\w+)?\s+(\d{1,20})\s+(\S+)\s*$/i);
    await telegram(env, 'deleteMessage', {chat_id:m.chat.id, message_id:m.message_id}).catch(() => {});
    if (!match || !validLink(match[2])) return send(env, m.chat.id, 'Формат: /grant ID ссылка\nСсылка должна начинаться с https:// или vless:// и не содержать пробелов.');
    await env.WAVE_KV.put(`subscription:${match[1]}`, match[2]);
    return send(env, m.chat.id, `✅ Ссылка сохранена для ID <code>${escape(match[1])}</code>. Пользователь может открыть «Моя подписка».`);
  }
  if (cmd === '/revoke' && admin) {
    const match = text.match(/^\/revoke(?:@\w+)?\s+(\d{1,20})\s*$/i);
    if (!match) return send(env, m.chat.id, 'Формат: /revoke ID');
    await env.WAVE_KV.delete(`subscription:${match[1]}`);
    return send(env, m.chat.id, '✅ Ссылка удалена из бота. Для отключения VPN отдельно отзови ключ в H1/VLESS.');
  }
  if (cmd === '/admin' && admin) return send(env, m.chat.id, '⚙️ <b>Администратор</b>\n\n/grant ID ссылка — выдать ссылку\n/revoke ID — удалить ссылку из бота\n\nСоздание и отключение ключей производится в панели H1/VLESS вручную.');
  return send(env, m.chat.id, 'Выбери действие в меню 👇', homeButtons);
}
export default { async fetch(request, env) {
  if (new URL(request.url).pathname !== '/telegram' || request.method !== 'POST') return new Response('Not found', {status:404});
  if (!env.BOT_TOKEN || !env.WEBHOOK_SECRET || !env.WAVE_KV) return new Response('Not configured', {status:503});
  if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('Forbidden', {status:403});
  try { await handle(await request.json(), env); return new Response('OK'); }
  catch { return new Response('Temporary error', {status:500}); }
}};
