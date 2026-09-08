// Chat conversation view: no websockets in this app, so new messages arrive
// via simple polling while the page is open.
const messageList = document.getElementById('message-list');
if (messageList) {
  const conversationId = messageList.dataset.conversationId;
  const myId = messageList.dataset.myId;
  let lastSentAt = messageList.dataset.lastSentAt || '';

  function scrollToBottom() {
    messageList.scrollTop = messageList.scrollHeight;
  }
  scrollToBottom();

  function appendMessage(m) {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.alignSelf = String(m.senderId) === String(myId) ? 'flex-end' : 'flex-start';
    card.innerHTML =
      '<div class="card-body">' +
      '<p class="muted" style="font-size:11px; margin-bottom:2px;"></p>' +
      '<p style="margin:0;"></p>' +
      '</div>';
    card.querySelector('.muted').textContent = m.senderSnapshot.username;
    card.querySelector('p:last-child').textContent = m.body;
    messageList.appendChild(card);
  }

  async function poll() {
    try {
      const url = `/messages/${conversationId}/poll` + (lastSentAt ? `?after=${encodeURIComponent(lastSentAt)}` : '');
      const res = await fetch(url);
      const data = await res.json();
      if (!data.ok || !data.messages.length) return;
      data.messages.forEach(appendMessage);
      lastSentAt = data.messages[data.messages.length - 1].sentAt;
      scrollToBottom();
    } catch (err) { /* silent — next poll will retry */ }
  }

  setInterval(poll, 4000);
}

const messageForm = document.getElementById('message-form');
if (messageForm) {
  messageForm.addEventListener('submit', (e) => {
    const input = messageForm.querySelector('[name="body"]');
    if (!input.value.trim()) e.preventDefault();
  });
}
